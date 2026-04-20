<?php

require_once dirname(__DIR__, 3) . "/resources/require.php";
require_once "resources/check_auth.php";

header('Content-Type: application/json; charset=utf-8');

if (!permission_exists('phone_view')) {
	http_response_code(403);
	echo json_encode([
		'status' => 'error',
		'message' => 'access denied',
	]);
	exit;
}

$domain_uuid = $_SESSION['domain_uuid'] ?? '';
$user_uuid = $_SESSION['user_uuid'] ?? '';
if (!is_uuid($domain_uuid) || !is_uuid($user_uuid)) {
	http_response_code(400);
	echo json_encode([
		'status' => 'error',
		'message' => 'missing domain or user context',
	]);
	exit;
}

$action = strtolower(trim((string) ($_REQUEST['action'] ?? 'list')));
$action = preg_replace('/[^a-z_]/', '', $action);

function bad_request(string $message, int $code = 400): void {
	http_response_code($code);
	echo json_encode([
		'status' => 'error',
		'message' => $message,
	]);
	exit;
}

function normalize_destination(string $destination): string {
	$destination = trim($destination);
	if (strlen($destination) > 255) {
		$destination = substr($destination, 0, 255);
	}
	return $destination;
}

function normalize_room_name(string $room_name): string {
	$room_name = trim($room_name);
	if ($room_name === '') {
		return '';
	}
	if ($room_name[0] !== '#') {
		$room_name = '#' . $room_name;
	}
	if (strlen($room_name) > 255) {
		$room_name = substr($room_name, 0, 255);
	}
	return strtolower($room_name);
}

function normalize_json(string $json): string {
	$decoded = json_decode($json, true);
	if (!is_array($decoded)) {
		return '';
	}
	$normalized = json_encode($decoded, JSON_UNESCAPED_SLASHES);
	return is_string($normalized) ? $normalized : '';
}

function load_user_extensions($database, string $domain_uuid, string $user_uuid): array {
	if (!is_uuid($domain_uuid) || !is_uuid($user_uuid)) {
		return [];
	}

	$sql = "select
		e.extension_uuid,
		e.extension,
		e.number_alias,
		e.effective_caller_id_name
	from v_extensions e
	join v_extension_users eu
		on eu.extension_uuid = e.extension_uuid
		and eu.domain_uuid = :domain_uuid
	where e.domain_uuid = :domain_uuid
	and eu.user_uuid = :user_uuid
	order by e.extension asc";

	$rows = $database->select($sql, [
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
	], 'all') ?: [];

	$extensions = [];
	foreach ($rows as $row) {
		$extension_uuid = (string) ($row['extension_uuid'] ?? '');
		$extension = trim((string) ($row['extension'] ?? ''));
		if (!is_uuid($extension_uuid) || $extension === '') {
			continue;
		}
		if (!preg_match('/^[0-9A-Za-z_.\-]+$/', $extension)) {
			continue;
		}

		$label_parts = [];
		$number_alias = trim((string) ($row['number_alias'] ?? ''));
		if ($number_alias !== '' && $number_alias !== $extension) {
			$label_parts[] = $number_alias;
		}
		$label_parts[] = $extension;
		$caller_name = trim((string) ($row['effective_caller_id_name'] ?? ''));
		if ($caller_name !== '') {
			$label_parts[] = $caller_name;
		}

		$extensions[] = [
			'extension_uuid' => $extension_uuid,
			'extension' => $extension,
			'label' => implode(' - ', $label_parts),
		];
	}

	return $extensions;
}

function get_selected_sender_extension_uuid(string $domain_uuid): string {
	$selected_extension_uuid = '';
	if (isset($_SESSION['phone_message_sender_extension_uuid']) && is_array($_SESSION['phone_message_sender_extension_uuid'])) {
		$selected_extension_uuid = trim((string) ($_SESSION['phone_message_sender_extension_uuid'][$domain_uuid] ?? ''));
	}
	return is_uuid($selected_extension_uuid) ? $selected_extension_uuid : '';
}

function set_selected_sender_extension_uuid(string $domain_uuid, string $extension_uuid): void {
	if (!isset($_SESSION['phone_message_sender_extension_uuid']) || !is_array($_SESSION['phone_message_sender_extension_uuid'])) {
		$_SESSION['phone_message_sender_extension_uuid'] = [];
	}

	if ($extension_uuid === '' || !is_uuid($extension_uuid)) {
		unset($_SESSION['phone_message_sender_extension_uuid'][$domain_uuid]);
		return;
	}

	$_SESSION['phone_message_sender_extension_uuid'][$domain_uuid] = $extension_uuid;
}

function resolve_sender_extension_identity($database, string $domain_uuid, string $user_uuid, ?string $requested_extension_uuid = null): array {
	$extensions = load_user_extensions($database, $domain_uuid, $user_uuid);
	if (count($extensions) === 0) {
		return [
			'status' => 'no_extension',
			'extension_uuid' => '',
			'extension' => null,
			'extensions' => [],
		];
	}

	$selected_extension_uuid = is_uuid((string) $requested_extension_uuid)
		? (string) $requested_extension_uuid
		: get_selected_sender_extension_uuid($domain_uuid);

	if ($selected_extension_uuid === '') {
		$selected_extension_uuid = (string) ($extensions[0]['extension_uuid'] ?? '');
	}

	$selected_extension = null;
	foreach ($extensions as $extension_row) {
		if ((string) ($extension_row['extension_uuid'] ?? '') === $selected_extension_uuid) {
			$selected_extension = $extension_row;
			break;
		}
	}

	if ($selected_extension === null) {
		return [
			'status' => 'invalid_selection',
			'extension_uuid' => $selected_extension_uuid,
			'extension' => null,
			'extensions' => $extensions,
		];
	}

	$selected_extension_value = trim((string) ($selected_extension['extension'] ?? ''));
	if ($selected_extension_value === '' || !preg_match('/^[0-9A-Za-z_.\-]+$/', $selected_extension_value)) {
		return [
			'status' => 'invalid_selection',
			'extension_uuid' => $selected_extension_uuid,
			'extension' => null,
			'extensions' => $extensions,
		];
	}

	return [
		'status' => 'ok',
		'extension_uuid' => (string) ($selected_extension['extension_uuid'] ?? ''),
		'extension' => $selected_extension_value,
		'extensions' => $extensions,
	];
}

function resolve_destination_user_result($database, string $domain_uuid, string $destination): array {
	if ($destination === '' || $destination[0] === '#') {
		return [
			'status' => 'invalid_destination',
			'user_uuid' => null,
		];
	}

	if (ctype_digit($destination)) {
		$sql = "select distinct eu.user_uuid
			from v_extensions e
			join v_extension_users eu
				on eu.extension_uuid = e.extension_uuid
				and eu.domain_uuid = :domain_uuid
			where e.domain_uuid = :domain_uuid
			and e.extension = :extension";
		$rows = $database->select($sql, [
			'domain_uuid' => $domain_uuid,
			'extension' => $destination,
		], 'all') ?: [];

		$user_uuids = [];
		foreach ($rows as $row) {
			$resolved_user_uuid = (string) ($row['user_uuid'] ?? '');
			if (is_uuid($resolved_user_uuid)) {
				$user_uuids[$resolved_user_uuid] = true;
			}
		}
		$user_uuids = array_keys($user_uuids);

		if (count($user_uuids) === 1) {
			return [
				'status' => 'ok',
				'user_uuid' => $user_uuids[0],
				'destination_type' => 'extension',
			];
		}

		if (count($user_uuids) > 1) {
			return [
				'status' => 'ambiguous_extension',
				'user_uuid' => null,
				'destination_type' => 'extension',
				'candidate_count' => count($user_uuids),
			];
		}
	}

	$lookup_username = $destination;
	if (preg_match('/^([^@\s]+)@[^@\s]+$/', $destination, $matches)) {
		$lookup_username = $matches[1];
	}

	$sql = "select user_uuid
		from v_users
		where domain_uuid = :domain_uuid
		and lower(username) = lower(:username)
		limit 1";
	$row = $database->select($sql, [
		'domain_uuid' => $domain_uuid,
		'username' => $lookup_username,
	], 'row');
	if (!empty($row['user_uuid']) && is_uuid($row['user_uuid'])) {
		return [
			'status' => 'ok',
			'user_uuid' => (string) $row['user_uuid'],
			'destination_type' => 'username',
		];
	}

	return [
		'status' => 'destination_not_found',
		'user_uuid' => null,
	];
}

function resolve_user_primary_extension($database, string $domain_uuid, string $user_uuid): ?string {
	if (!is_uuid($user_uuid)) {
		return null;
	}

	$sql = "select e.extension
		from v_extensions e
		join v_extension_users eu
			on eu.extension_uuid = e.extension_uuid
			and eu.domain_uuid = :domain_uuid
		where e.domain_uuid = :domain_uuid
		and eu.user_uuid = :user_uuid
		order by e.extension asc
		limit 1";
	$row = $database->select($sql, [
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
	], 'row');

	$extension = trim((string) ($row['extension'] ?? ''));
	if ($extension !== '' && preg_match('/^[0-9A-Za-z_.\-]+$/', $extension)) {
		return $extension;
	}

	return null;
}

function resolve_destination_sip_user($database, string $domain_uuid, string $destination, ?string $recipient_user_uuid): ?string {
	if ($destination === '' || $destination[0] === '#') {
		return null;
	}

	if (preg_match('/^[0-9A-Za-z_.\-]+$/', $destination)) {
		if (ctype_digit($destination)) {
			return $destination;
		}

		if (is_uuid((string) $recipient_user_uuid)) {
			$extension = resolve_user_primary_extension($database, $domain_uuid, (string) $recipient_user_uuid);
			if ($extension !== null) {
				return $extension;
			}
		}

		return $destination;
	}

	if (preg_match('/^([0-9A-Za-z_.\-]+)@/', $destination, $matches)) {
		return $matches[1];
	}

	return null;
}

function normalize_message_text_for_chat(string $message): string {
	$message = str_replace(["\r\n", "\r"], "\n", $message);
	$message = str_replace(["\0"], [''], $message);
	$message = trim($message);
	if (strlen($message) > 1000) {
		$message = substr($message, 0, 1000);
	}
	return $message;
}

function send_internal_sip_message(string $from_user, string $to_user, string $domain_name, string $sip_profile, string $message): array {
	if (!class_exists('event_socket')) {
		return [false, 'event socket class is unavailable'];
	}
	$from = $from_user . '@' . $domain_name;
	$to = $to_user . '@' . $domain_name;
	$event_lines = [
		'sendevent CUSTOM',
		'Event-Subclass: SMS::SEND_MESSAGE',
		'proto: sip',
		'dest_proto: sip',
		'from: ' . $from,
		'from_full: sip:' . $from,
		'to: ' . $to,
		'subject: SMS Message',
		'type: text/plain',
		'sip_profile: ' . $sip_profile,
		'Content-Length: ' . strlen($message),
		'',
		$message,
	];

	$socket = event_socket::create();
	if (!$socket || !$socket->connected()) {
		return [false, 'failed to connect to event socket'];
	}

	$result = $socket->request(implode("\n", $event_lines));
	if ($result === false) {
		return [false, 'empty switch response'];
	}

	if (is_array($result)) {
		$reply_text = trim((string) ($result['Reply-Text'] ?? ''));
		if ($reply_text !== '' && stripos($reply_text, '-ERR') !== false) {
			return [false, $reply_text];
		}
		if ($reply_text !== '') {
			return [true, $reply_text];
		}
		return [true, json_encode($result) ?: '+OK'];
	}

	$result_text = trim((string) $result);
	if ($result_text !== '' && stripos($result_text, '-ERR') !== false) {
		return [false, $result_text];
	}

	return [true, $result_text === '' ? '+OK' : $result_text];
}

function load_active_devices($database, string $domain_uuid, string $user_uuid): array {
	$sql = "select
		phone_device_uuid,
		public_key_jwk,
		key_fingerprint,
		device_label,
		phone_device_created,
		phone_device_updated
	from v_phone_e2ee_devices
	where domain_uuid = :domain_uuid
	and user_uuid = :user_uuid
	and revoked = false
	order by phone_device_updated desc";
	return $database->select($sql, [
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
	], 'all') ?: [];
}

function ensure_room_membership($database, string $domain_uuid, string $room_name, string $user_uuid): void {
	if (!is_uuid($domain_uuid) || !is_uuid($user_uuid) || $room_name === '' || $room_name[0] !== '#') {
		return;
	}

	$database->execute("insert into v_phone_e2ee_room_members (
		phone_room_member_uuid,
		domain_uuid,
		room_name,
		user_uuid,
		joined_at
	) values (
		:phone_room_member_uuid,
		:domain_uuid,
		:room_name,
		:user_uuid,
		now()
	)
	on conflict (domain_uuid, room_name, user_uuid)
	do update set joined_at = now()", [
		'phone_room_member_uuid' => uuid(),
		'domain_uuid' => $domain_uuid,
		'room_name' => $room_name,
		'user_uuid' => $user_uuid,
	]);
}

function load_room_member_user_uuids($database, string $domain_uuid, string $room_name): array {
	if ($room_name === '' || $room_name[0] !== '#') {
		return [];
	}

	$rows = $database->select("select user_uuid
		from v_phone_e2ee_room_members
		where domain_uuid = :domain_uuid
		and room_name = :room_name", [
		'domain_uuid' => $domain_uuid,
		'room_name' => $room_name,
	], 'all') ?: [];

	$user_uuids = [];
	foreach ($rows as $row) {
		$member_user_uuid = (string) ($row['user_uuid'] ?? '');
		if (is_uuid($member_user_uuid)) {
			$user_uuids[$member_user_uuid] = true;
		}
	}

	return array_keys($user_uuids);
}

function load_devices_for_users($database, string $domain_uuid, array $user_uuids): array {
	$unique_user_uuids = [];
	foreach ($user_uuids as $member_user_uuid) {
		$member_user_uuid = (string) $member_user_uuid;
		if (is_uuid($member_user_uuid)) {
			$unique_user_uuids[$member_user_uuid] = true;
		}
	}
	$unique_user_uuids = array_keys($unique_user_uuids);

	if (count($unique_user_uuids) === 0) {
		return [];
	}

	$placeholders = [];
	$parameters = [
		'domain_uuid' => $domain_uuid,
	];
	foreach ($unique_user_uuids as $index => $member_user_uuid) {
		$key = 'user_uuid_' . $index;
		$placeholders[] = ':' . $key;
		$parameters[$key] = $member_user_uuid;
	}

	$sql = "select
		phone_device_uuid,
		public_key_jwk,
		key_fingerprint,
		device_label,
		phone_device_created,
		phone_device_updated,
		user_uuid
	from v_phone_e2ee_devices
	where domain_uuid = :domain_uuid
	and revoked = false
	and user_uuid in (" . implode(', ', $placeholders) . ")
	order by phone_device_updated desc";

	return $database->select($sql, $parameters, 'all') ?: [];
}

// Create E2EE tables if needed.
$database->execute("create table if not exists v_phone_e2ee_devices (
	phone_device_uuid uuid primary key,
	domain_uuid uuid not null,
	user_uuid uuid not null,
	device_label varchar(255),
	public_key_jwk text not null,
	key_fingerprint varchar(255),
	revoked boolean not null default false,
	phone_device_created timestamp with time zone not null default now(),
	phone_device_updated timestamp with time zone not null default now()
)");

$database->execute("create table if not exists v_phone_e2ee_messages (
	phone_message_uuid uuid primary key,
	domain_uuid uuid not null,
	sender_user_uuid uuid not null,
	sender_device_uuid uuid not null,
	destination varchar(255) not null,
	message_direction varchar(20) not null default 'outgoing',
	message_ciphertext text not null,
	message_content_iv varchar(255) not null,
	sender_public_key_jwk text not null,
	message_created timestamp with time zone not null default now()
)");

$database->execute("create table if not exists v_phone_e2ee_message_keys (
	phone_message_key_uuid uuid primary key,
	phone_message_uuid uuid not null,
	recipient_device_uuid uuid not null,
	wrapped_key text not null,
	wrapped_iv varchar(255) not null,
	key_created timestamp with time zone not null default now()
)");

$database->execute("create table if not exists v_phone_e2ee_room_members (
	phone_room_member_uuid uuid primary key,
	domain_uuid uuid not null,
	room_name varchar(255) not null,
	user_uuid uuid not null,
	joined_at timestamp with time zone not null default now(),
	unique (domain_uuid, room_name, user_uuid)
)");

$database->execute("create index if not exists v_phone_e2ee_devices_domain_user_idx on v_phone_e2ee_devices (domain_uuid, user_uuid, revoked)");
$database->execute("create index if not exists v_phone_e2ee_messages_domain_created_idx on v_phone_e2ee_messages (domain_uuid, message_created)");
$database->execute("create index if not exists v_phone_e2ee_message_keys_message_idx on v_phone_e2ee_message_keys (phone_message_uuid)");
$database->execute("create index if not exists v_phone_e2ee_message_keys_recipient_idx on v_phone_e2ee_message_keys (recipient_device_uuid)");
$database->execute("create index if not exists v_phone_e2ee_room_members_domain_room_idx on v_phone_e2ee_room_members (domain_uuid, room_name)");

if ($action === 'join_room') {
	$room_name = normalize_room_name((string) ($_POST['room_name'] ?? ''));
	if ($room_name === '') {
		bad_request('room name is required');
	}

	ensure_room_membership($database, $domain_uuid, $room_name, $user_uuid);

	echo json_encode([
		'status' => 'ok',
		'room_name' => $room_name,
	]);
	exit;
}

if ($action === 'list_rooms') {
	$rows = $database->select("select distinct room_name
		from v_phone_e2ee_room_members
		where domain_uuid = :domain_uuid
		order by room_name asc", [
		'domain_uuid' => $domain_uuid,
	], 'all') ?: [];

	$rooms = [];
	foreach ($rows as $row) {
		$room_name = normalize_room_name((string) ($row['room_name'] ?? ''));
		if ($room_name !== '') {
			$rooms[] = $room_name;
		}
	}

	echo json_encode([
		'status' => 'ok',
		'rooms' => array_values(array_unique($rooms)),
	]);
	exit;
}

if ($action === 'delete_room') {
	if (!permission_exists('xmpp_room_delete')) {
		bad_request('access denied', 403);
	}

	$room_name = normalize_room_name((string) ($_POST['room_name'] ?? ''));
	if ($room_name === '') {
		bad_request('room name is required');
	}

	$message_rows = $database->select("select phone_message_uuid
		from v_phone_e2ee_messages
		where domain_uuid = :domain_uuid
		and destination = :destination", [
		'domain_uuid' => $domain_uuid,
		'destination' => $room_name,
	], 'all') ?: [];

	foreach ($message_rows as $message_row) {
		$message_uuid = (string) ($message_row['phone_message_uuid'] ?? '');
		if (!is_uuid($message_uuid)) {
			continue;
		}

		$database->execute("delete from v_phone_e2ee_message_keys
			where phone_message_uuid = :phone_message_uuid", [
			'phone_message_uuid' => $message_uuid,
		]);
	}

	$database->execute("delete from v_phone_e2ee_messages
		where domain_uuid = :domain_uuid
		and destination = :destination", [
		'domain_uuid' => $domain_uuid,
		'destination' => $room_name,
	]);

	$database->execute("delete from v_phone_e2ee_room_members
		where domain_uuid = :domain_uuid
		and room_name = :room_name", [
		'domain_uuid' => $domain_uuid,
		'room_name' => $room_name,
	]);

	echo json_encode([
		'status' => 'ok',
		'room_name' => $room_name,
	]);
	exit;
}

if ($action === 'register_device') {
	$device_uuid = (string) ($_POST['device_uuid'] ?? '');
	$public_key_jwk = normalize_json((string) ($_POST['public_key_jwk'] ?? ''));
	$device_label = trim((string) ($_POST['device_label'] ?? 'Browser Device'));
	$key_fingerprint = trim((string) ($_POST['key_fingerprint'] ?? ''));
	$rotate_others = strtolower(trim((string) ($_POST['rotate_other_devices'] ?? 'false'))) === 'true';

	if (!is_uuid($device_uuid)) {
		bad_request('invalid device uuid');
	}
	if ($public_key_jwk === '') {
		bad_request('invalid public key');
	}

	$sql = "insert into v_phone_e2ee_devices (
		phone_device_uuid,
		domain_uuid,
		user_uuid,
		device_label,
		public_key_jwk,
		key_fingerprint,
		revoked,
		phone_device_created,
		phone_device_updated
	) values (
		:phone_device_uuid,
		:domain_uuid,
		:user_uuid,
		:device_label,
		:public_key_jwk,
		:key_fingerprint,
		false,
		now(),
		now()
	)
	on conflict (phone_device_uuid)
	do update set
		domain_uuid = excluded.domain_uuid,
		user_uuid = excluded.user_uuid,
		device_label = excluded.device_label,
		public_key_jwk = excluded.public_key_jwk,
		key_fingerprint = excluded.key_fingerprint,
		revoked = false,
		phone_device_updated = now()";
	$database->execute($sql, [
		'phone_device_uuid' => $device_uuid,
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
		'device_label' => $device_label,
		'public_key_jwk' => $public_key_jwk,
		'key_fingerprint' => $key_fingerprint,
	]);

	if ($rotate_others) {
		$database->execute("update v_phone_e2ee_devices
			set revoked = true, phone_device_updated = now()
			where domain_uuid = :domain_uuid
			and user_uuid = :user_uuid
			and phone_device_uuid <> :phone_device_uuid", [
			'domain_uuid' => $domain_uuid,
			'user_uuid' => $user_uuid,
			'phone_device_uuid' => $device_uuid,
		]);
	}

	echo json_encode([
		'status' => 'ok',
		'device_uuid' => $device_uuid,
	]);
	exit;
}

if ($action === 'my_devices') {
	$devices = load_active_devices($database, $domain_uuid, $user_uuid);
	echo json_encode([
		'status' => 'ok',
		'devices' => array_values($devices),
	]);
	exit;
}

if ($action === 'sender_extensions') {
	$resolved_sender = resolve_sender_extension_identity($database, $domain_uuid, $user_uuid);
	if ($resolved_sender['status'] === 'ok') {
		set_selected_sender_extension_uuid($domain_uuid, (string) ($resolved_sender['extension_uuid'] ?? ''));
	}

	echo json_encode([
		'status' => 'ok',
		'extensions' => array_values($resolved_sender['extensions'] ?? []),
		'selected_extension_uuid' => (string) ($resolved_sender['extension_uuid'] ?? ''),
	]);
	exit;
}

if ($action === 'set_sender_extension') {
	$requested_extension_uuid = trim((string) ($_POST['extension_uuid'] ?? ''));
	if ($requested_extension_uuid === '') {
		set_selected_sender_extension_uuid($domain_uuid, '');
		echo json_encode([
			'status' => 'ok',
			'selected_extension_uuid' => '',
		]);
		exit;
	}

	if (!is_uuid($requested_extension_uuid)) {
		bad_request('invalid extension uuid');
	}

	$resolved_sender = resolve_sender_extension_identity($database, $domain_uuid, $user_uuid, $requested_extension_uuid);
	if ($resolved_sender['status'] !== 'ok') {
		bad_request('selected extension is not assigned to this user', 403);
	}

	set_selected_sender_extension_uuid($domain_uuid, (string) ($resolved_sender['extension_uuid'] ?? ''));
	echo json_encode([
		'status' => 'ok',
		'extension' => $resolved_sender['extension'],
		'selected_extension_uuid' => (string) ($resolved_sender['extension_uuid'] ?? ''),
	]);
	exit;
}

if ($action === 'revoke_device') {
	$device_uuid = (string) ($_POST['device_uuid'] ?? '');
	if (!is_uuid($device_uuid)) {
		bad_request('invalid device uuid');
	}

	$database->execute("update v_phone_e2ee_devices
		set revoked = true, phone_device_updated = now()
		where domain_uuid = :domain_uuid
		and user_uuid = :user_uuid
		and phone_device_uuid = :phone_device_uuid", [
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
		'phone_device_uuid' => $device_uuid,
	]);

	echo json_encode([
		'status' => 'ok',
	]);
	exit;
}

if ($action === 'admin_revoke_device') {
	if (!permission_exists('phone_e2ee_device_manage')) {
		bad_request('access denied', 403);
	}

	$target_domain_uuid = (string) ($_POST['domain_uuid'] ?? $domain_uuid);
	$target_user_uuid = (string) ($_POST['user_uuid'] ?? '');
	$target_device_uuid = (string) ($_POST['device_uuid'] ?? '');
	if (!is_uuid($target_domain_uuid)) {
		bad_request('invalid domain uuid');
	}
	if (!is_uuid($target_user_uuid)) {
		bad_request('invalid user uuid');
	}
	if (!is_uuid($target_device_uuid)) {
		bad_request('invalid device uuid');
	}

	$target_user = $database->select("select user_uuid from v_users
		where domain_uuid = :domain_uuid
		and user_uuid = :user_uuid
		limit 1", [
		'domain_uuid' => $target_domain_uuid,
		'user_uuid' => $target_user_uuid,
	], 'row');
	if (empty($target_user['user_uuid'])) {
		bad_request('user not found', 404);
	}

	$target_device = $database->select("select phone_device_uuid
		from v_phone_e2ee_devices
		where domain_uuid = :domain_uuid
		and user_uuid = :user_uuid
		and phone_device_uuid = :phone_device_uuid
		limit 1", [
		'domain_uuid' => $target_domain_uuid,
		'user_uuid' => $target_user_uuid,
		'phone_device_uuid' => $target_device_uuid,
	], 'row');
	if (empty($target_device['phone_device_uuid'])) {
		bad_request('device not found', 404);
	}

	$database->execute("update v_phone_e2ee_devices
		set revoked = true, phone_device_updated = now()
		where domain_uuid = :domain_uuid
		and user_uuid = :user_uuid
		and phone_device_uuid = :phone_device_uuid", [
		'domain_uuid' => $target_domain_uuid,
		'user_uuid' => $target_user_uuid,
		'phone_device_uuid' => $target_device_uuid,
	]);

	echo json_encode([
		'status' => 'ok',
		'domain_uuid' => $target_domain_uuid,
		'user_uuid' => $target_user_uuid,
		'device_uuid' => $target_device_uuid,
	]);
	exit;
}

if ($action === 'add_contact') {
	if (!permission_exists('contact_add')) {
		bad_request('access denied', 403);
	}

	if (!file_exists(dirname(__DIR__, 2) . '/core/contacts/')) {
		bad_request('contacts app is not available', 404);
	}

	$destination = normalize_destination((string) ($_POST['destination'] ?? ''));
	$contact_name = trim((string) ($_POST['contact_name'] ?? ''));
	if ($destination === '' || $destination[0] === '#') {
		bad_request('destination is required');
	}

	$destination = preg_replace('/\s+/', '', $destination);
	if (preg_match('/^([^@\s]+)@[^@\s]+$/', $destination, $matches)) {
		$destination = $matches[1];
	}

	if ($destination === '' || !preg_match('/^[0-9A-Za-z+_.\-]+$/', $destination)) {
		bad_request('destination format is invalid');
	}

	$existing_contact = $database->select("select c.contact_uuid,
		c.contact_name_given,
		c.contact_name_family,
		c.contact_nickname,
		cp.phone_number
		from v_contacts c
		join v_contact_phones cp
			on cp.contact_uuid = c.contact_uuid
		where (c.domain_uuid = :domain_uuid or c.domain_uuid is null)
		and (cp.domain_uuid = :domain_uuid or cp.domain_uuid is null)
		and cp.phone_number = :phone_number
		order by cp.phone_primary desc
		limit 1", [
		'domain_uuid' => $domain_uuid,
		'phone_number' => $destination,
	], 'row');

	if (!empty($existing_contact['contact_uuid']) && is_uuid((string) $existing_contact['contact_uuid'])) {
		$existing_name_parts = [];
		if (!empty($existing_contact['contact_name_family'])) {
			$existing_name_parts[] = (string) $existing_contact['contact_name_family'];
		}
		if (!empty($existing_contact['contact_name_given'])) {
			$existing_name_parts[] = (string) $existing_contact['contact_name_given'];
		}
		$existing_name = trim(implode(' ', $existing_name_parts));
		if ($existing_name === '') {
			$existing_name = trim((string) ($existing_contact['contact_nickname'] ?? ''));
		}
		if ($existing_name === '') {
			$existing_name = (string) ($existing_contact['phone_number'] ?? $destination);
		}

		echo json_encode([
			'status' => 'ok',
			'exists' => true,
			'contact' => [
				'contact_uuid' => (string) $existing_contact['contact_uuid'],
				'destination' => (string) ($existing_contact['phone_number'] ?? $destination),
				'extension' => (string) ($existing_contact['phone_number'] ?? $destination),
				'name' => $existing_name,
				'source' => 'core_contact',
			],
		]);
		exit;
	}

	$contact_name = trim($contact_name);
	if ($contact_name === '') {
		$contact_name = $destination;
	}

	$contact_given_name = '';
	$contact_family_name = '';
	if (strpos($contact_name, ' ') !== false) {
		$name_parts = preg_split('/\s+/', $contact_name, 2);
		$contact_given_name = trim((string) ($name_parts[1] ?? ''));
		$contact_family_name = trim((string) ($name_parts[0] ?? ''));
	}
	else {
		$contact_given_name = $contact_name;
	}

	$contact_uuid = uuid();
	$contact_phone_uuid = uuid();
	$contact_user_uuid = uuid();

	$database->execute("insert into v_contacts (
		contact_uuid,
		domain_uuid,
		contact_type,
		contact_name_given,
		contact_name_family,
		contact_nickname,
		insert_date,
		insert_user,
		update_date,
		update_user
	) values (
		:contact_uuid,
		:domain_uuid,
		:contact_type,
		:contact_name_given,
		:contact_name_family,
		:contact_nickname,
		now(),
		:insert_user,
		now(),
		:update_user
	)", [
		'contact_uuid' => $contact_uuid,
		'domain_uuid' => $domain_uuid,
		'contact_type' => 'phone',
		'contact_name_given' => $contact_given_name,
		'contact_name_family' => $contact_family_name,
		'contact_nickname' => $contact_name,
		'insert_user' => $user_uuid,
		'update_user' => $user_uuid,
	]);

	$database->execute("insert into v_contact_phones (
		contact_phone_uuid,
		domain_uuid,
		contact_uuid,
		phone_number,
		phone_primary,
		phone_type_voice,
		phone_type_text,
		insert_date,
		insert_user,
		update_date,
		update_user
	) values (
		:contact_phone_uuid,
		:domain_uuid,
		:contact_uuid,
		:phone_number,
		:true_value,
		:true_value,
		:true_value,
		now(),
		:insert_user,
		now(),
		:update_user
	)", [
		'contact_phone_uuid' => $contact_phone_uuid,
		'domain_uuid' => $domain_uuid,
		'contact_uuid' => $contact_uuid,
		'phone_number' => $destination,
		'true_value' => 1,
		'insert_user' => $user_uuid,
		'update_user' => $user_uuid,
	]);

	$database->execute("insert into v_contact_users (
		contact_user_uuid,
		domain_uuid,
		contact_uuid,
		user_uuid,
		insert_date,
		insert_user,
		update_date,
		update_user
	) values (
		:contact_user_uuid,
		:domain_uuid,
		:contact_uuid,
		:user_uuid,
		now(),
		:insert_user,
		now(),
		:update_user
	)", [
		'contact_user_uuid' => $contact_user_uuid,
		'domain_uuid' => $domain_uuid,
		'contact_uuid' => $contact_uuid,
		'user_uuid' => $user_uuid,
		'insert_user' => $user_uuid,
		'update_user' => $user_uuid,
	]);

	echo json_encode([
		'status' => 'ok',
		'exists' => false,
		'contact' => [
			'contact_uuid' => $contact_uuid,
			'destination' => $destination,
			'extension' => $destination,
			'name' => $contact_name,
			'source' => 'core_contact',
		],
	]);
	exit;
}

if ($action === 'recipient_devices') {
	$destination = normalize_destination((string) ($_GET['destination'] ?? ''));
	if ($destination === '') {
		bad_request('destination is required');
	}
	if ($destination[0] === '#') {
		$room_name = normalize_room_name($destination);
		ensure_room_membership($database, $domain_uuid, $room_name, $user_uuid);
		$room_member_user_uuids = load_room_member_user_uuids($database, $domain_uuid, $room_name);
		if (!in_array($user_uuid, $room_member_user_uuids, true)) {
			$room_member_user_uuids[] = $user_uuid;
		}
		$devices = load_devices_for_users($database, $domain_uuid, $room_member_user_uuids);
		echo json_encode([
			'status' => 'ok',
			'recipient_user_uuid' => null,
			'room_name' => $room_name,
			'member_count' => count($room_member_user_uuids),
			'devices' => array_values($devices),
		]);
		exit;
	}

	$destination_result = resolve_destination_user_result($database, $domain_uuid, $destination);
	if (($destination_result['status'] ?? '') === 'ambiguous_extension') {
		bad_request('extension is assigned to multiple users; use a username destination', 409);
	}
	$recipient_user_uuid = (string) ($destination_result['user_uuid'] ?? '');
	if (($destination_result['status'] ?? '') !== 'ok' || !is_uuid($recipient_user_uuid)) {
		bad_request('destination not found', 404);
	}

	$devices = load_active_devices($database, $domain_uuid, $recipient_user_uuid);
	if (count($devices) === 0) {
		bad_request('destination has no active encryption devices', 409);
	}
	echo json_encode([
		'status' => 'ok',
		'recipient_user_uuid' => $recipient_user_uuid,
		'devices' => array_values($devices),
	]);
	exit;
}

if ($action === 'send') {
	$device_uuid = (string) ($_POST['device_uuid'] ?? '');
	$destination = normalize_destination((string) ($_POST['destination'] ?? ''));
	$is_room_destination = ($destination !== '' && $destination[0] === '#');
	if ($is_room_destination) {
		$destination = normalize_room_name($destination);
	}
	$message_text = normalize_message_text_for_chat((string) ($_POST['message_text'] ?? ''));
	$message_ciphertext = trim((string) ($_POST['ciphertext'] ?? ''));
	$message_content_iv = trim((string) ($_POST['content_iv'] ?? ''));
	$sender_public_key_jwk = normalize_json((string) ($_POST['sender_public_key_jwk'] ?? ''));
	$requested_sender_extension_uuid = trim((string) ($_POST['sender_extension_uuid'] ?? ''));
	$recipient_keys_raw = (string) ($_POST['recipient_keys'] ?? '[]');
	$recipient_keys = json_decode($recipient_keys_raw, true);

	if (!is_uuid($device_uuid)) {
		bad_request('invalid device uuid');
	}
	if ($destination === '' || $message_ciphertext === '' || $message_content_iv === '' || $sender_public_key_jwk === '') {
		bad_request('destination, ciphertext, iv and sender key are required');
	}
	if (!is_array($recipient_keys) || count($recipient_keys) === 0) {
		bad_request('recipient keys are required');
	}

	$device_row = $database->select("select phone_device_uuid from v_phone_e2ee_devices
		where phone_device_uuid = :phone_device_uuid
		and domain_uuid = :domain_uuid
		and user_uuid = :user_uuid
		and revoked = false", [
		'phone_device_uuid' => $device_uuid,
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
	], 'row');
	if (empty($device_row['phone_device_uuid'])) {
		bad_request('sender device not registered', 403);
	}

	$recipient_user_uuid = null;
	$recipient_user_uuids = [];
	if ($is_room_destination) {
		ensure_room_membership($database, $domain_uuid, $destination, $user_uuid);
		$recipient_user_uuids = load_room_member_user_uuids($database, $domain_uuid, $destination);
		if (!in_array($user_uuid, $recipient_user_uuids, true)) {
			$recipient_user_uuids[] = $user_uuid;
		}
	}
	else {
		$destination_result = resolve_destination_user_result($database, $domain_uuid, $destination);
		if (($destination_result['status'] ?? '') === 'ambiguous_extension') {
			bad_request('extension is assigned to multiple users; use a username destination', 409);
		}
		$recipient_user_uuid = (string) ($destination_result['user_uuid'] ?? '');
		if (($destination_result['status'] ?? '') !== 'ok' || !is_uuid($recipient_user_uuid)) {
			bad_request('destination not found', 404);
		}
		$recipient_user_uuids = [$recipient_user_uuid];
	}

	$delivery_status = 'skipped';
	$delivery_response = '';
	$sender_extension_uuid = '';
	$domain_name = trim((string) ($_SESSION['domain_name'] ?? ''));
	$sip_profile = 'internal';
	if (!$is_room_destination && $message_text !== '' && $domain_name !== '') {
		$resolved_sender = resolve_sender_extension_identity($database, $domain_uuid, $user_uuid, $requested_sender_extension_uuid !== '' ? $requested_sender_extension_uuid : null);
		if (($resolved_sender['status'] ?? '') === 'invalid_selection') {
			bad_request('selected sender extension is not assigned to this user', 403);
		}

		$sender_user = ($resolved_sender['status'] ?? '') === 'ok'
			? (string) ($resolved_sender['extension'] ?? '')
			: null;
		$sender_extension_uuid = ($resolved_sender['status'] ?? '') === 'ok'
			? (string) ($resolved_sender['extension_uuid'] ?? '')
			: '';
		if ($sender_extension_uuid !== '') {
			set_selected_sender_extension_uuid($domain_uuid, $sender_extension_uuid);
		}

		if ($sender_user === null || $sender_user === '') {
			$sender_user = trim((string) ($_SESSION['username'] ?? ''));
		}

		$recipient_user = resolve_destination_sip_user($database, $domain_uuid, $destination, (string) $recipient_user_uuid);
		if ($sender_user === null || $sender_user === '' || !preg_match('/^[0-9A-Za-z_.\-]+$/', $sender_user)) {
			bad_request('sender identity is not configured for messaging', 400);
		}
		if ($recipient_user === null || $recipient_user === '') {
			bad_request('destination is not routable for SIP MESSAGE', 400);
		}

		[$sent_ok, $switch_response] = send_internal_sip_message(
			$sender_user,
			$recipient_user,
			$domain_name,
			$sip_profile,
			$message_text
		);
		$delivery_status = $sent_ok ? 'sent' : 'failed';
		$delivery_response = $switch_response;
		if (!$sent_ok) {
			bad_request('message delivery failed: ' . $switch_response, 502);
		}
	}

	$allowed_user_uuids = [$user_uuid];
	foreach ($recipient_user_uuids as $room_user_uuid) {
		if (is_uuid((string) $room_user_uuid) && !in_array((string) $room_user_uuid, $allowed_user_uuids, true)) {
			$allowed_user_uuids[] = (string) $room_user_uuid;
		}
	}

	$allowed_device_rows = load_devices_for_users($database, $domain_uuid, $allowed_user_uuids);

	$allowed_devices = [];
	foreach ($allowed_device_rows as $row) {
		if (!empty($row['phone_device_uuid']) && is_uuid($row['phone_device_uuid'])) {
			$allowed_devices[$row['phone_device_uuid']] = true;
		}
	}

	$filtered_keys = [];
	foreach ($recipient_keys as $entry) {
		if (!is_array($entry)) {
			continue;
		}
		$recipient_device_uuid = (string) ($entry['recipient_device_uuid'] ?? '');
		$wrapped_key = trim((string) ($entry['wrapped_key'] ?? ''));
		$wrapped_iv = trim((string) ($entry['wrapped_iv'] ?? ''));
		if (!is_uuid($recipient_device_uuid) || $wrapped_key === '' || $wrapped_iv === '') {
			continue;
		}
		if (!isset($allowed_devices[$recipient_device_uuid])) {
			continue;
		}
		$filtered_keys[$recipient_device_uuid] = [
			'recipient_device_uuid' => $recipient_device_uuid,
			'wrapped_key' => $wrapped_key,
			'wrapped_iv' => $wrapped_iv,
		];
	}

	if (count($filtered_keys) === 0) {
		bad_request('no valid recipient key envelopes');
	}

	$message_uuid = uuid();
	$database->execute("insert into v_phone_e2ee_messages (
		phone_message_uuid,
		domain_uuid,
		sender_user_uuid,
		sender_device_uuid,
		destination,
		message_direction,
		message_ciphertext,
		message_content_iv,
		sender_public_key_jwk
	) values (
		:phone_message_uuid,
		:domain_uuid,
		:sender_user_uuid,
		:sender_device_uuid,
		:destination,
		:message_direction,
		:message_ciphertext,
		:message_content_iv,
		:sender_public_key_jwk
	)", [
		'phone_message_uuid' => $message_uuid,
		'domain_uuid' => $domain_uuid,
		'sender_user_uuid' => $user_uuid,
		'sender_device_uuid' => $device_uuid,
		'destination' => $destination,
		'message_direction' => 'outgoing',
		'message_ciphertext' => $message_ciphertext,
		'message_content_iv' => $message_content_iv,
		'sender_public_key_jwk' => $sender_public_key_jwk,
	]);

	foreach ($filtered_keys as $entry) {
		$database->execute("insert into v_phone_e2ee_message_keys (
			phone_message_key_uuid,
			phone_message_uuid,
			recipient_device_uuid,
			wrapped_key,
			wrapped_iv
		) values (
			:phone_message_key_uuid,
			:phone_message_uuid,
			:recipient_device_uuid,
			:wrapped_key,
			:wrapped_iv
		)", [
			'phone_message_key_uuid' => uuid(),
			'phone_message_uuid' => $message_uuid,
			'recipient_device_uuid' => $entry['recipient_device_uuid'],
			'wrapped_key' => $entry['wrapped_key'],
			'wrapped_iv' => $entry['wrapped_iv'],
		]);
	}

	echo json_encode([
		'status' => 'ok',
		'message' => [
			'id' => $message_uuid,
			'destination' => $destination,
			'sender_extension_uuid' => $sender_extension_uuid,
			'timestamp' => round(microtime(true) * 1000),
			'delivery_status' => $delivery_status,
			'delivery_response' => $delivery_response,
		],
	]);
	exit;
}

if ($action === 'list') {
	$device_uuid = (string) ($_GET['device_uuid'] ?? '');
	if (!is_uuid($device_uuid)) {
		bad_request('device uuid is required');
	}

	$limit = (int) ($_GET['limit'] ?? 1000);
	if ($limit < 1) {
		$limit = 1000;
	}
	if ($limit > 5000) {
		$limit = 5000;
	}

	$sql = "select
		m.phone_message_uuid,
		m.sender_user_uuid,
		m.sender_device_uuid,
		m.destination,
		m.message_ciphertext,
		m.message_content_iv,
		m.sender_public_key_jwk,
		m.message_created,
		k.wrapped_key,
		k.wrapped_iv,
		su.username as sender_username,
		se.extension as sender_extension,
		case
			when m.destination like '#%' then ('room:' || lower(m.destination))
			when m.sender_user_uuid = :current_user_uuid then ('dest:' || m.destination)
			else ('dest:' || coalesce(se.extension, su.username, m.sender_user_uuid::text))
		end as peer_key,
		case
			when m.destination like '#%' then lower(m.destination)
			when m.sender_user_uuid = :current_user_uuid then m.destination
			else coalesce(se.extension, su.username, m.sender_user_uuid::text)
		end as peer_name
	from v_phone_e2ee_messages m
	join v_phone_e2ee_message_keys k
		on k.phone_message_uuid = m.phone_message_uuid
	join v_phone_e2ee_devices rd
		on rd.phone_device_uuid = k.recipient_device_uuid
		and rd.revoked = false
	left join v_users su
		on su.user_uuid = m.sender_user_uuid
	left join lateral (
		select e.extension
		from v_extensions e
		join v_extension_users eu
			on eu.extension_uuid = e.extension_uuid
			and eu.domain_uuid = m.domain_uuid
		where e.domain_uuid = m.domain_uuid
		and eu.user_uuid = m.sender_user_uuid
		order by e.extension asc
		limit 1
	) se on true
	where m.domain_uuid = :domain_uuid
	and k.recipient_device_uuid = :device_uuid
	and rd.domain_uuid = :domain_uuid
	and rd.user_uuid = :current_user_uuid
	order by m.message_created asc
	limit " . (int) $limit;

	$rows = $database->select($sql, [
		'domain_uuid' => $domain_uuid,
		'device_uuid' => $device_uuid,
		'current_user_uuid' => $user_uuid,
	], 'all') ?: [];

	echo json_encode([
		'status' => 'ok',
		'messages' => array_values($rows),
	]);
	exit;
}

bad_request('invalid action', 404);
