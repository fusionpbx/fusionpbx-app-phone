<?php
/*
	FusionPBX
	Version: MPL 1.1
*/

require_once dirname(__DIR__, 2) . "/resources/require.php";
require_once "resources/check_auth.php";

if (!permission_exists('phone_e2ee_device_manage')) {
	echo "access denied";
	exit;
}

$language = new text;
$text = $language->get();

$domain_uuid = $_SESSION['domain_uuid'] ?? '';
$selected_domain_uuid = trim((string) ($_GET['domain_uuid'] ?? $_POST['domain_uuid'] ?? $domain_uuid));
if (!is_uuid($selected_domain_uuid)) {
	$selected_domain_uuid = $domain_uuid;
}

$selected_user_uuid = trim((string) ($_GET['user_uuid'] ?? $_POST['user_uuid'] ?? ''));
if (!is_uuid($selected_user_uuid)) {
	$selected_user_uuid = '';
}

$token = new token;
if (!empty($_POST) && empty($_POST['persistformvar'])) {
	if (!$token->validate($_SERVER['PHP_SELF'])) {
		message::add($text['message-invalid_token'] ?? 'Invalid token', 'negative');
		header('Location: phone_e2ee_devices.php' . ($selected_user_uuid !== '' ? '?user_uuid=' . urlencode($selected_user_uuid) : ''));
		exit;
	}

	$action = trim((string) ($_POST['action'] ?? ''));
	if ($action === 'revoke_device') {
		$target_domain_uuid = trim((string) ($_POST['domain_uuid'] ?? $selected_domain_uuid));
		$target_user_uuid = trim((string) ($_POST['user_uuid'] ?? ''));
		$target_device_uuid = trim((string) ($_POST['device_uuid'] ?? ''));

		if (!is_uuid($target_domain_uuid) || !is_uuid($target_user_uuid) || !is_uuid($target_device_uuid)) {
			message::add('Invalid domain, user, or device identifier.', 'negative');
		}
		else {
			$device = $database->select(
				"select phone_device_uuid, revoked
				 from v_phone_e2ee_devices
				 where domain_uuid = :domain_uuid
				 and user_uuid = :user_uuid
				 and phone_device_uuid = :phone_device_uuid
				 limit 1",
				[
					'domain_uuid' => $target_domain_uuid,
					'user_uuid' => $target_user_uuid,
					'phone_device_uuid' => $target_device_uuid,
				],
				'row'
			);

			if (empty($device['phone_device_uuid'])) {
				message::add('Device was not found for the selected user.', 'negative');
			}
			else if (!empty($device['revoked']) && filter_var($device['revoked'], FILTER_VALIDATE_BOOLEAN)) {
				message::add('Device is already revoked.', 'warning');
			}
			else {
				$database->execute(
					"update v_phone_e2ee_devices
					 set revoked = true,
					 	phone_device_updated = now()
					 where domain_uuid = :domain_uuid
					 and user_uuid = :user_uuid
					 and phone_device_uuid = :phone_device_uuid",
					[
						'domain_uuid' => $target_domain_uuid,
						'user_uuid' => $target_user_uuid,
						'phone_device_uuid' => $target_device_uuid,
					]
				);
				message::add('Device key revoked successfully.');
			}
		}
	}

	$redirect_query = [];
	if ($selected_domain_uuid !== '') {
		$redirect_query['domain_uuid'] = $selected_domain_uuid;
	}
	if ($selected_user_uuid !== '') {
		$redirect_query['user_uuid'] = $selected_user_uuid;
	}
	header('Location: phone_e2ee_devices.php' . (!empty($redirect_query) ? '?' . http_build_query($redirect_query) : ''));
	exit;
}

$user_rows = $database->select(
	"select distinct
		u.domain_uuid,
		d.domain_name,
		u.user_uuid,
		u.username,
		e.extension
	 from v_users u
	 join v_domains d
	 	on d.domain_uuid = u.domain_uuid
	 left join v_extension_users eu
	 	on eu.user_uuid = u.user_uuid
	 	and eu.domain_uuid = u.domain_uuid
	 left join v_extensions e
	 	on e.extension_uuid = eu.extension_uuid
	 	and e.domain_uuid = u.domain_uuid
	 where true
	 order by
		d.domain_name asc,
	 	case when e.extension is null then 1 else 0 end,
	 	e.extension asc,
	 	u.username asc",
	[],
	'all'
) ?: [];

$devices = [];
if ($selected_user_uuid !== '') {
	$devices = $database->select(
		"select
			phone_device_uuid,
			device_label,
			key_fingerprint,
			phone_device_created,
			phone_device_updated,
			revoked
		 from v_phone_e2ee_devices
		 where domain_uuid = :domain_uuid
		 and user_uuid = :user_uuid
		 order by phone_device_updated desc",
		[
			'domain_uuid' => $selected_domain_uuid,
			'user_uuid' => $selected_user_uuid,
		],
		'all'
	) ?: [];
}

$document['title'] = 'Phone E2EE Devices';
require_once 'resources/header.php';

$token_hash = $token->create($_SERVER['PHP_SELF']);

echo "<div class='action_bar'>&\n";
echo "\t<div class='heading'><b>Phone E2EE Device Management</b></div>\n";
echo "</div>\n";

echo "<form method='get' action='phone_e2ee_devices.php'>\n";
echo "\t<table class='tr_hover' width='100%' border='0' cellpadding='0' cellspacing='0'>\n";
echo "\t\t<tr>\n";
echo "\t\t\t<td class='vncellreq' width='180'>User</td>\n";
echo "\t\t\t<td class='vtable'>\n";
echo "\t\t\t\t<select class='formfld' name='user_uuid' style='min-width: 300px;'>\n";
echo "\t\t\t\t\t<option value=''>Select a user</option>\n";
foreach ($user_rows as $user_row) {
	$user_uuid = (string) ($user_row['user_uuid'] ?? '');
	$user_domain_uuid = (string) ($user_row['domain_uuid'] ?? '');
	if (!is_uuid($user_uuid)) {
		continue;
	}
	if (!is_uuid($user_domain_uuid)) {
		continue;
	}
	$label_parts = [];
	if (!empty($user_row['domain_name'])) {
		$label_parts[] = (string) $user_row['domain_name'];
	}
	if (!empty($user_row['extension'])) {
		$label_parts[] = (string) $user_row['extension'];
	}
	if (!empty($user_row['username'])) {
		$label_parts[] = (string) $user_row['username'];
	}
	$label = implode(' - ', $label_parts);
	if ($label === '') {
		$label = $user_uuid;
	}
	$selected_attr = ($selected_user_uuid === $user_uuid && $selected_domain_uuid === $user_domain_uuid) ? " selected='selected'" : '';
	echo "\t\t\t\t\t<option value='" . escape($user_uuid) . "' data-domain='" . escape($user_domain_uuid) . "'" . $selected_attr . ">" . escape($label) . "</option>\n";
}
echo "\t\t\t\t</select>\n";
echo "\t\t\t\t<input type='hidden' name='domain_uuid' id='selected_domain_uuid' value='" . escape($selected_domain_uuid) . "'>\n";
echo "\t\t\t\t<input class='btn' type='submit' value='Load Devices'>\n";
echo "\t\t\t</td>\n";
echo "\t\t</tr>\n";
echo "\t\t<tr>\n";
echo "\t\t\t<td class='vncell'>Warning</td>\n";
echo "\t\t\t<td class='vtable'>Revoking a device key blocks that browser/device from decrypting new encrypted messages. This action does not delete messages from the server.</td>\n";
echo "\t\t</tr>\n";
echo "\t</table>\n";
echo "</form>\n";

echo "<br />\n";

echo "<table class='tr_hover' width='100%' border='0' cellpadding='0' cellspacing='0'>\n";
echo "\t<tr>\n";
echo "\t\t<th class='th'>Device Label</th>\n";
echo "\t\t<th class='th'>Device UUID</th>\n";
echo "\t\t<th class='th'>Fingerprint</th>\n";
echo "\t\t<th class='th'>Created</th>\n";
echo "\t\t<th class='th'>Updated</th>\n";
echo "\t\t<th class='th'>Status</th>\n";
echo "\t\t<th class='th' width='120'>Action</th>\n";
echo "\t</tr>\n";

if ($selected_user_uuid === '') {
	echo "\t<tr><td class='row_style0' colspan='7'>Select a user to view registered E2EE devices.</td></tr>\n";
}
else if (empty($devices)) {
	echo "\t<tr><td class='row_style0' colspan='7'>No E2EE devices found for the selected user.</td></tr>\n";
}
else {
	$row_style_index = 0;
	foreach ($devices as $device) {
		$status = (!empty($device['revoked']) && filter_var($device['revoked'], FILTER_VALIDATE_BOOLEAN)) ? 'Revoked' : 'Active';
		$row_style = 'row_style' . $row_style_index;
		$row_style_index = ($row_style_index === 0 ? 1 : 0);

		echo "\t<tr>\n";
		echo "\t\t<td class='" . $row_style . "'>" . escape((string) ($device['device_label'] ?? 'Browser Device')) . "</td>\n";
		echo "\t\t<td class='" . $row_style . "'><code>" . escape((string) ($device['phone_device_uuid'] ?? '')) . "</code></td>\n";
		echo "\t\t<td class='" . $row_style . "'><code>" . escape((string) ($device['key_fingerprint'] ?? '')) . "</code></td>\n";
		echo "\t\t<td class='" . $row_style . "'>" . escape((string) ($device['phone_device_created'] ?? '')) . "</td>\n";
		echo "\t\t<td class='" . $row_style . "'>" . escape((string) ($device['phone_device_updated'] ?? '')) . "</td>\n";
		echo "\t\t<td class='" . $row_style . "'>" . escape($status) . "</td>\n";
		echo "\t\t<td class='" . $row_style . "'>\n";

		if ($status === 'Active') {
			echo "\t\t\t<form method='post' action='phone_e2ee_devices.php?domain_uuid=" . urlencode($selected_domain_uuid) . "&user_uuid=" . urlencode($selected_user_uuid) . "' onsubmit=\"return confirm('Revoke this device key?');\">\n";
			echo "\t\t\t\t<input type='hidden' name='action' value='revoke_device'>\n";
			echo "\t\t\t\t<input type='hidden' name='domain_uuid' value='" . escape($selected_domain_uuid) . "'>\n";
			echo "\t\t\t\t<input type='hidden' name='user_uuid' value='" . escape($selected_user_uuid) . "'>\n";
			echo "\t\t\t\t<input type='hidden' name='device_uuid' value='" . escape((string) ($device['phone_device_uuid'] ?? '')) . "'>\n";
			echo "\t\t\t\t<input type='hidden' name='" . escape($token_hash['name']) . "' value='" . escape($token_hash['hash']) . "'>\n";
			echo "\t\t\t\t<input type='submit' class='btn' value='Revoke'>\n";
			echo "\t\t\t</form>\n";
		}
		else {
			echo "Revoked";
		}

		echo "\t\t</td>\n";
		echo "\t</tr>\n";
	}
}

echo "</table>\n";

echo "<script>\n";
echo "(function(){\n";
echo "\tvar userSelect = document.querySelector(\"select[name='user_uuid']\");\n";
echo "\tvar domainInput = document.getElementById('selected_domain_uuid');\n";
echo "\tif (!userSelect || !domainInput) { return; }\n";
echo "\tuserSelect.addEventListener('change', function(){\n";
echo "\t\tvar selected = userSelect.options[userSelect.selectedIndex];\n";
echo "\t\tif (!selected) { return; }\n";
echo "\t\tvar selectedDomain = selected.getAttribute('data-domain');\n";
echo "\t\tif (selectedDomain) {\n";
echo "\t\t\tdomainInput.value = selectedDomain;\n";
echo "\t\t}\n";
echo "\t});\n";
echo "})();\n";
echo "</script>\n";

require_once 'resources/footer.php';
