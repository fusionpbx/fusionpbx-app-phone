<?php

//includes files
require_once dirname(__DIR__, 3) . "/resources/require.php";
require_once "resources/check_auth.php";

header('Content-Type: application/json; charset=utf-8');

//check permissions
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

$encryption_secret = trim((string) $config->get('phone.message_encryption_key', ''));
if ($encryption_secret === '') {
	http_response_code(500);
	echo json_encode([
		'status' => 'error',
		'code' => 'missing_encryption_key',
		'message' => 'Set phone.message_encryption_key in /etc/fusionpbx/config.conf',
	]);
	exit;
}

$encryption_key = hash('sha256', $encryption_secret, true);

$action = strtolower(trim((string) ($_REQUEST['action'] ?? 'list')));
$action = preg_replace('/[^a-z_]/', '', $action);

function encrypt_phone_message(string $plaintext, string $key): string {
	$iv = random_bytes(12);
	$tag = '';
	$ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
	if ($ciphertext === false) {
		throw new RuntimeException('Encryption failed');
	}
	return base64_encode($iv . $tag . $ciphertext);
}

function decrypt_phone_message(string $encoded_payload, string $key): string {
	$payload = base64_decode($encoded_payload, true);
	if ($payload === false || strlen($payload) < 29) {
		throw new RuntimeException('Invalid payload');
	}

	$iv = substr($payload, 0, 12);
	$tag = substr($payload, 12, 16);
	$ciphertext = substr($payload, 28);

	$plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '');
	if ($plaintext === false) {
		throw new RuntimeException('Decryption failed');
	}

	return $plaintext;
}

function normalize_destination(string $destination): string {
	$destination = trim($destination);
	if (strlen($destination) > 255) {
		$destination = substr($destination, 0, 255);
	}
	return $destination;
}

//create table/indexes if needed
$database->execute("create table if not exists v_phone_messages (
	phone_message_uuid uuid primary key,
	domain_uuid uuid not null,
	user_uuid uuid not null,
	destination varchar(255) not null,
	message_direction varchar(20) not null default 'outgoing',
	message_encrypted text not null,
	message_created timestamp with time zone not null default now()
)");
$database->execute("create index if not exists v_phone_messages_domain_user_created_idx on v_phone_messages (domain_uuid, user_uuid, message_created)");
$database->execute("create index if not exists v_phone_messages_domain_user_destination_idx on v_phone_messages (domain_uuid, user_uuid, destination)");

if ($action === 'send') {
	$destination = normalize_destination((string) ($_POST['destination'] ?? ''));
	$text = trim((string) ($_POST['text'] ?? ''));
	if ($destination === '' || $text === '') {
		http_response_code(400);
		echo json_encode([
			'status' => 'error',
			'message' => 'destination and text are required',
		]);
		exit;
	}

	try {
		$encrypted_payload = encrypt_phone_message($text, $encryption_key);
	}
	catch (Throwable $error) {
		http_response_code(500);
		echo json_encode([
			'status' => 'error',
			'message' => 'could not encrypt message',
		]);
		exit;
	}

	$message_uuid = uuid();
	$sql = "insert into v_phone_messages (
		phone_message_uuid,
		domain_uuid,
		user_uuid,
		destination,
		message_direction,
		message_encrypted
	) values (
		:message_uuid,
		:domain_uuid,
		:user_uuid,
		:destination,
		:message_direction,
		:message_encrypted
	)";
	$parameters = [
		'message_uuid' => $message_uuid,
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
		'destination' => $destination,
		'message_direction' => 'outgoing',
		'message_encrypted' => $encrypted_payload,
	];
	$database->execute($sql, $parameters);

	echo json_encode([
		'status' => 'ok',
		'message' => [
			'id' => $message_uuid,
			'destination' => $destination,
			'direction' => 'outgoing',
			'text' => $text,
			'timestamp' => round(microtime(true) * 1000),
		],
	]);
	exit;
}

//default action: list
$sql = "select
	phone_message_uuid,
	destination,
	message_direction,
	message_encrypted,
	message_created
from v_phone_messages
where domain_uuid = :domain_uuid
and user_uuid = :user_uuid
order by message_created asc
limit 1000";
$parameters = [
	'domain_uuid' => $domain_uuid,
	'user_uuid' => $user_uuid,
];
$rows = $database->select($sql, $parameters, 'all') ?: [];

$conversations = [];
foreach ($rows as $row) {
	$destination = normalize_destination((string) ($row['destination'] ?? ''));
	if ($destination === '') {
		continue;
	}

	try {
		$decrypted_text = decrypt_phone_message((string) ($row['message_encrypted'] ?? ''), $encryption_key);
	}
	catch (Throwable $error) {
		continue;
	}

	$conversation_id = 'xmpp-dest-' . preg_replace('/[^a-zA-Z0-9_\-#@\.]/', '_', $destination);
	if (!isset($conversations[$conversation_id])) {
		$is_room = strlen($destination) > 0 && $destination[0] === '#';
		$conversations[$conversation_id] = [
			'id' => $conversation_id,
			'name' => $is_room ? $destination : (strpos($destination, '@') !== false ? $destination : ('Ext ' . $destination)),
			'presence' => $is_room ? 'room' : 'unknown',
			'unread' => 0,
			'messages' => [],
		];
	}

	$conversations[$conversation_id]['messages'][] = [
		'direction' => ($row['message_direction'] ?? 'outgoing') === 'incoming' ? 'incoming' : 'outgoing',
		'text' => $decrypted_text,
		'timestamp' => strtotime((string) $row['message_created']) * 1000,
	];
}

//sort newest conversations first
usort($conversations, function ($left, $right) {
	$left_time = 0;
	$right_time = 0;
	if (!empty($left['messages'])) {
		$left_time = $left['messages'][count($left['messages']) - 1]['timestamp'] ?? 0;
	}
	if (!empty($right['messages'])) {
		$right_time = $right['messages'][count($right['messages']) - 1]['timestamp'] ?? 0;
	}
	return $right_time <=> $left_time;
});

echo json_encode([
	'status' => 'ok',
	'conversations' => array_values($conversations),
]);
