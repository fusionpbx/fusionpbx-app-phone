<?php
/*
	FusionPBX
	Version: MPL 1.1

	The contents of this file are subject to the Mozilla Public License Version
	1.1 (the "License"); you may not use this file except in compliance with
	the License. You may obtain a copy of the License at
	http://www.mozilla.org/MPL/

	Software distributed under the License is distributed on an "AS IS" basis,
	WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
	for the specific language governing rights and limitations under the
	License.

	The Original Code is FusionPBX

	The Initial Developer of the Original Code is
	Mark J Crane <markjcrane@fusionpbx.com>
	Portions created by the Initial Developer are Copyright (C) 2024-2026
	the Initial Developer. All Rights Reserved.

	Contributor(s):
	Mark J Crane <markjcrane@fusionpbx.com>
*/

//includes files
require_once dirname(__DIR__, 2) . "/resources/require.php";
require_once 'resources/pdo.php';
require_once "resources/check_auth.php";

//check permissions
if (!permission_exists('phone_view')) {
	echo "access denied";
	exit;
}

//add multi-lingual support
$language = new text;
$text = $language->get();

//get user_uuid and domain_uuid
$user_uuid = $_SESSION['user_uuid'];
$domain_uuid = $_SESSION["domain_uuid"];

//add the settings object
$settings = new settings(["domain_uuid" => $domain_uuid, "user_uuid" => $user_uuid]);
$theme_title = $settings->get('theme', 'title', '');
$search_enabled = $settings->get('phone', 'search_enabled', 'true');
$search_domain = $settings->get('phone', 'search_domain', $_SESSION['domain_name']);
$search_path = $settings->get('phone', 'search_path', '/core/contacts/contacts.php');
$search_parameter = $settings->get('phone', 'search_parameter', 'search');
$search_target = $settings->get('phone', 'search_target', '');
$search_width = $settings->get('phone', 'search_width', '');
$search_height = $settings->get('phone', 'search_height', '');

$domain_name = (string) ($_SESSION['domain_name'] ?? '');
$user_extension = '';
$user_password = '';
$user_display_name = '';
$user_sender_extensions = [];
$selected_sender_extension_uuid = trim((string) ($_SESSION['phone_message_sender_extension_uuid'][$domain_uuid] ?? ''));
$phone_contacts = [];

//get the user ID
$sql = "SELECT d.domain_name,e.extension,e.password,u.username,e.effective_caller_id_name FROM ";
$sql .= "v_extension_users as t, v_extensions as e, v_users as u, v_domains as d ";
$sql .= "WHERE u.user_uuid = t.user_uuid ";
$sql .= "AND e.extension_uuid = t.extension_uuid ";
$sql .= "AND e.domain_uuid = d.domain_uuid ";
$sql .= "AND u.user_uuid = '" . $user_uuid . "' ";
$sql .= "AND e.domain_uuid = '" . $domain_uuid . "' LIMIT 1";
$prep_statement = $db->prepare($sql);
if ($prep_statement) {
	$prep_statement->execute();
	$row = $prep_statement->fetch(PDO::FETCH_ASSOC);
	$domain_name = $row['domain_name'];
	$user_extension = $row['extension'];
	$user_password = $row['password'];
	$user_display_name = trim((string) ($row['effective_caller_id_name'] ?? ''));
	if ($user_display_name === '') {
		$user_display_name = trim((string) ($row['username'] ?? ''));
	}
	if ($user_display_name === '') {
		$user_display_name = $user_extension;
	}
}

$extensions_sql = "select
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
$extensions_statement = $db->prepare($extensions_sql);
if ($extensions_statement) {
	$extensions_statement->execute([
		'domain_uuid' => $domain_uuid,
		'user_uuid' => $user_uuid,
	]);
	$extension_rows = $extensions_statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
	foreach ($extension_rows as $extension_row) {
		$extension_uuid = trim((string) ($extension_row['extension_uuid'] ?? ''));
		$extension_value = trim((string) ($extension_row['extension'] ?? ''));
		if (!is_uuid($extension_uuid) || $extension_value === '') {
			continue;
		}
		if (!preg_match('/^[0-9A-Za-z_.\-]+$/', $extension_value)) {
			continue;
		}

		$label_parts = [];
		$number_alias = trim((string) ($extension_row['number_alias'] ?? ''));
		if ($number_alias !== '' && $number_alias !== $extension_value) {
			$label_parts[] = $number_alias;
		}
		$label_parts[] = $extension_value;
		$caller_name = trim((string) ($extension_row['effective_caller_id_name'] ?? ''));
		if ($caller_name !== '') {
			$label_parts[] = $caller_name;
		}

		$user_sender_extensions[] = [
			'extension_uuid' => $extension_uuid,
			'extension' => $extension_value,
			'label' => implode(' - ', $label_parts),
		];
	}
}

if (count($user_sender_extensions) > 0) {
	$selected_exists = false;
	foreach ($user_sender_extensions as $sender_extension_row) {
		if ((string) ($sender_extension_row['extension_uuid'] ?? '') === $selected_sender_extension_uuid) {
			$selected_exists = true;
			break;
		}
	}
	if (!$selected_exists) {
		$selected_sender_extension_uuid = (string) ($user_sender_extensions[0]['extension_uuid'] ?? '');
	}
}
else {
	$selected_sender_extension_uuid = '';
}

//load contacts for phone panel: domain extensions + core contacts (phones)
$contact_destinations = [];

$domain_extensions_sql = "select
		e.extension,
		e.effective_caller_id_name,
		e.number_alias,
		(
			select u.username
			from v_extension_users eu
			join v_users u
				on u.user_uuid = eu.user_uuid
		where eu.domain_uuid = e.domain_uuid
		and eu.extension_uuid = e.extension_uuid
		order by u.username asc
		limit 1
		) as assigned_username
	from v_extensions e
	where e.domain_uuid = :domain_uuid
	order by e.extension asc";
$domain_extensions_statement = $db->prepare($domain_extensions_sql);
if ($domain_extensions_statement) {
	$domain_extensions_statement->execute([
		'domain_uuid' => $domain_uuid,
	]);
	$domain_extension_rows = $domain_extensions_statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
	foreach ($domain_extension_rows as $extension_row) {
		$destination = trim((string) ($extension_row['extension'] ?? ''));
		if ($destination === '' || !preg_match('/^[0-9A-Za-z_.\-]+$/', $destination)) {
			continue;
		}
		if (isset($contact_destinations[$destination])) {
			continue;
		}

		$display_name = trim((string) ($extension_row['effective_caller_id_name'] ?? ''));
		if ($display_name === '') {
			$display_name = trim((string) ($extension_row['assigned_username'] ?? ''));
		}
		if ($display_name === '') {
			$display_name = trim((string) ($extension_row['number_alias'] ?? ''));
		}
		if ($display_name === '') {
			$display_name = 'Extension';
		}

		$phone_contacts[] = [
			'destination' => $destination,
			'extension' => $destination,
			'name' => $display_name,
			'source' => 'extension',
		];
		$contact_destinations[$destination] = true;
	}
}

if (file_exists(dirname(__DIR__, 2) . '/core/contacts/') && permission_exists('contact_view')) {
	$core_contacts_sql = "select
			c.contact_uuid,
			c.contact_name_given,
			c.contact_name_family,
			c.contact_nickname,
			cp.phone_number
		from v_contacts c
		left join lateral (
			select p.phone_number
			from v_contact_phones p
			where p.contact_uuid = c.contact_uuid
			and (p.domain_uuid = :domain_uuid or p.domain_uuid is null)
			order by p.phone_primary desc, p.insert_date asc
			limit 1
		) cp on true
		where (c.domain_uuid = :domain_uuid or c.domain_uuid is null)
		and cp.phone_number is not null
		and cp.phone_number <> ''
		order by c.contact_name_given asc, c.contact_name_family asc, c.contact_nickname asc";
	$core_contacts_statement = $db->prepare($core_contacts_sql);
	if ($core_contacts_statement) {
		$core_contacts_statement->execute([
			'domain_uuid' => $domain_uuid,
		]);
		$core_contact_rows = $core_contacts_statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
		foreach ($core_contact_rows as $contact_row) {
			$destination = trim((string) ($contact_row['phone_number'] ?? ''));
			$destination = preg_replace('/\s+/', '', $destination);
			if ($destination === '') {
				continue;
			}

			if (preg_match('/^([^@\s]+)@[^@\s]+$/', $destination, $matches)) {
				$destination = $matches[1];
			}

			if (!preg_match('/^[0-9A-Za-z+_.\-]+$/', $destination)) {
				continue;
			}

			if (isset($contact_destinations[$destination])) {
				continue;
			}

			$name_parts = [];
			$family_name = trim((string) ($contact_row['contact_name_family'] ?? ''));
			$given_name = trim((string) ($contact_row['contact_name_given'] ?? ''));
			if ($family_name !== '') {
				$name_parts[] = $family_name;
			}
			if ($given_name !== '') {
				$name_parts[] = $given_name;
			}
			$display_name = trim(implode(' ', $name_parts));
			if ($display_name === '') {
				$display_name = trim((string) ($contact_row['contact_nickname'] ?? ''));
			}
			if ($display_name === '') {
				$display_name = 'Contact';
			}

			$phone_contacts[] = [
				'destination' => $destination,
				'extension' => $destination,
				'name' => $display_name,
				'source' => 'core_contact',
				'contact_uuid' => (string) ($contact_row['contact_uuid'] ?? ''),
			];
			$contact_destinations[$destination] = true;
		}
	}
}

//set the title
$document['title'] = $text['title-phone'];

//send the content
echo "<html>\n";

echo "<head>\n";
echo "	<title>".$text['title-phone']." - ".escape($theme_title)."</title>\n";
echo "	<meta charset='utf-8'>\n";
echo "	<meta http-equiv='Content-Type' content='text/html; charset=UTF-8'>\n";
echo "	<meta http-equiv='X-UA-Compatible' content='IE=edge'>\n";
echo "	<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' />\n";
echo "	<meta name='robots' content='noindex, nofollow, noarchive' />\n";
echo "	<link rel='stylesheet' type='text/css' href='".PROJECT_PATH."/resources/fontawesome/css/all.min.css.php'>\n";
echo "	<link rel='stylesheet' type='text/css' href='resources/styles.css'>\n";
echo "	<script language='JavaScript' type='text/javascript'>window.FontAwesomeConfig = { autoReplaceSvg: false }</script>\n";
echo "	<script language='JavaScript' type='text/javascript' src='resources/sip-0.7.8.js'></script>\n";
echo "</head>\n";

echo "<body>\n";

//define the video tag
echo "	<div id='video_container' class='video_container'>\n";
echo "		<div class='remote_video_wrapper'>\n";
echo "			<video id='remote_video' class='remote_video' autoplay playsinline></video>\n";
echo "			<div id='video_stream_info' class='video_stream_info'></div>\n";
echo "		</div>\n";
echo "		<div id='local_video_wrapper' class='local_video_wrapper corner-top-right' title='Click to move preview'>\n";
echo "			<video id='local_video' class='local_video' autoplay playsinline muted></video>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the audio ringtone
echo "	<audio id='ringtone' preload='auto'>\n";
echo "		<source src='resources/ringtones/ringtone.wav' type='audio/wav' loop='loop' />\n";
echo "	</audio>\n";

//audio or video objects need to be initialized before phone.js
echo "	<script language='JavaScript' type='text/javascript'>\n";
echo "	const time_zone = '".$settings->get('domain', 'time_zone')."';\n";
echo "	const phone_e2ee_user_uuid = '".escape($user_uuid)."';\n";
echo "	const phone_e2ee_domain_uuid = '".escape($domain_uuid)."';\n";
echo "	const phone_can_delete_rooms = ".(permission_exists('xmpp_room_delete') ? 'true' : 'false').";\n";
echo "	const phone_registered_extension = '".escape($user_extension)."';\n";
echo "	const phone_registered_display_name = '".escape($user_display_name)."';\n";
echo "	const phone_sender_extensions = ".json_encode($user_sender_extensions, JSON_UNESCAPED_SLASHES).";\n";
echo "	const phone_selected_sender_extension_uuid = '".escape($selected_sender_extension_uuid)."';\n";
echo "	const phone_contacts = ".json_encode($phone_contacts, JSON_UNESCAPED_SLASHES).";\n";
echo "	const phone_e2ee_default_device_label = '".escape($_SERVER['HTTP_USER_AGENT'] ?? 'Browser Device')."';\n";
$session_unlock_material = session_id().'|'.$user_uuid.'|'.$domain_uuid.'|'.(string) $config->get('phone.message_encryption_key', '');
$session_unlock_key = hash('sha256', $session_unlock_material);
echo "	const phone_e2ee_session_unlock_key = '".escape($session_unlock_key)."';\n";
echo "\n";
// Dashboard search configuration
echo "	const dashboard_enabled = " . (!empty($search_enabled) && $search_enabled == 'true' ? 'true' : 'false') . ";\n";
echo "	const dashboard_url_base = 'https://" . $search_domain . "/" . $search_path . "?" . $search_parameter . "=';\n";
echo "	const dashboard_target = '" . $search_target . "';\n";
if (!empty($search_width) && !empty($search_height)) {
	echo "	const window_parameters = 'width=" . $search_width . ",height=" . $search_height . "';\n";
} else {
	echo "	const window_parameters = '';\n";
}
echo "\n";
require 'resources/phone.js';
echo "\n";
echo "	</script>\n";

//define the status bar
echo "	<div class='status_bar' id='status_bar'>\n";
echo "		<span class='status_icon'><i class='fas fa-circle'></i></span>\n";
echo "		<span class='status_text' id='status_text'>Ready</span>\n";
echo "		<span class='status_identity' id='status_identity'><span class='status_identity_name'>".escape($user_display_name)."</span><span class='status_identity_ext'>Ext ".escape($user_extension)."</span></span>\n";
echo "	</div>\n";

//start the body_content
echo "	<div class='body_content'>\n";

//define the dialpad control
echo "		<div class='dialpad' id='dialpad'>\n";
echo "			<input type='text' class='destination' id='destination' name='destination' onkeypress=\"event.preventDefault();\"/>\n";
echo "			<div class='dialpad_wrapper keypad_3col'>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('1');\"><strong>1</strong><br><sup>&nbsp;</sup></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('2');\"><strong>2</strong><br><sup>ABC</sup></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('3');\"><strong>3</strong><br><sup>DEF</sup></div>\n";

echo "				<div class='dialpad_box' onclick=\"digit_add('4');\"><strong>4</strong><br><sup>GHI</sup></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('5');\"><strong>5</strong><br><sup>JKL</sup></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('6');\"><strong>6</strong><br><sup>MNO</sup></div>\n";

echo "				<div class='dialpad_box' onclick=\"digit_add('7');\"><strong>7</strong><br><sup>PQRS</sup></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('8');\"><strong>8</strong><br><sup>TUV</sup></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('9');\"><strong>9</strong><br><sup>WXYZ</sup></div>\n";

echo "				<div class='dialpad_box' onclick=\"digit_add('*');\" style='margin-bottom: 8px; padding-top: 20px; padding-bottom: 0;'><strong>*</strong></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('0');\" style='margin-bottom: 8px; padding-top: 15px; padding-bottom: 5px;'><strong>0</strong></div>\n";
echo "				<div class='dialpad_box' onclick=\"digit_add('#');\" style='margin-bottom: 8px; padding-top: 15px; padding-bottom: 5px;'><strong>#</strong></div>\n";

echo "				<div class='dialpad_box video_call' onclick='call_video();' title='Video Call'><i class='fas fa-video'></i><br><sup>Video Call</sup></div>\n";
echo "				<div class='dialpad_box audio_call' onclick='call_audio();' title='Audio Call'><i class='fa-solid fa-phone'></i><br><sup>Audio Call</sup></div>\n";
echo "				<div class='dialpad_box delete' onclick='digit_delete();' title=\"".$text['label-delete']."\"><i class='fas fa-chevron-left'></i><br><sup>".$text['label-delete']."</sup></div>\n";
echo "			</div>\n";
echo "		</div>\n";

//close the body_content
echo "	<div>\n";

//define the contacts panel
echo "	<div class='dialpad' id='contacts' style='display: none;'>\n";
echo "		<div class='keypad_header'><i class='fas fa-address-book'></i> Contacts</div>\n";
echo "		<div class='contacts_list' id='contacts_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the history panel
echo "	<div class='dialpad' id='history' style='display: none;'>\n";
echo "		<div class='keypad_header'><i class='fas fa-history'></i> Call History</div>\n";
echo "		<div class='history_list' id='history_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the messages panel (XMPP UI scaffold)
echo "	<div class='dialpad' id='messages' style='display: none;'>\n";
echo "		<div class='messages_layout'>\n";
echo "			<div class='messages_sidebar'>\n";
echo "				<div class='messages_header'><i class='fas fa-comments'></i> Messages</div>\n";
echo "				<div class='messages_destination_bar'>\n";
echo "					<input type='text' id='message_destination' class='message_destination' list='message_room_suggestions' placeholder='Destination (e.g. 102, user@example.com, #ops-room)' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' data-lpignore='true' data-1p-ignore='true' />\n";
echo "					<button type='button' id='message_set_destination' class='message_set_destination' onclick='set_message_destination();'><i class='fas fa-location-arrow'></i> Set</button>\n";
echo "				</div>\n";
echo "				<datalist id='message_room_suggestions'></datalist>\n";
echo "				<div class='messages_hint'>Tip: use <strong>/list</strong>, <strong>/create #room</strong> or <strong>/join #room</strong> in the message box.</div>\n";
echo "				<div class='messages_conversations' id='messages_conversations'></div>\n";
echo "			</div>\n";
echo "			<div class='messages_thread'>\n";
echo "				<div class='thread_header'>\n";
echo "					<div class='thread_conversation_picker'>\n";
echo "						<select id='thread_conversation_select' class='thread_conversation_select'>\n";
echo "							<option value=''>Select a conversation</option>\n";
echo "						</select>\n";
echo "					</div>\n";
echo "					<div class='thread_title' id='thread_title'>Select a conversation</div>\n";
echo "					<div class='thread_presence' id='thread_presence'>Offline</div>\n";
echo "				</div>\n";
echo "				<div class='thread_messages' id='thread_messages'>\n";
echo "					<div class='thread_empty'>Select a conversation to start messaging.</div>\n";
echo "				</div>\n";
echo "				<div class='thread_composer'>\n";
echo "					<div class='thread_sender_context' id='thread_sender_context' style='display: none;'>\n";
echo "						<label class='thread_sender_label' for='message_sender_extension'>Send as</label>\n";
echo "						<select id='message_sender_extension' class='message_sender_extension'></select>\n";
echo "					</div>\n";
echo "					<textarea id='message_input' class='message_input' placeholder='Type an XMPP message...' rows='1' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' data-lpignore='true' data-1p-ignore='true' onkeydown=\"if (event.keyCode === 13 && !event.shiftKey && !event.isComposing) { event.preventDefault(); send_message_mock(); return false; }\"></textarea>\n";
echo "					<button type='button' id='message_send' class='message_send' onclick='send_message_mock();'><i class='fas fa-paper-plane'></i> Send</button>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the ringing control
echo "	<div class='dialpad' id='ringing' style='display: none;'>\n";
echo "		<div class='caller_id ringing' id='ringing_caller_id'></div>\n";
echo "		<div class='dialpad_wrapper' style='grid-template-columns: repeat(3, 1fr);'>\n";
echo "			<div class='dialpad_box' id='decline' onclick='decline();' style='background-color: #ba0000;'><i class='fas fa-phone-slash' title=\"".$text['label-decline']."\"></i><br><sup>".$text['label-decline']."</sup></div>\n";
echo "			<div class='dialpad_box' id='answer_audio' onclick='answer_audio();' style='background-color: #147e00;'><i class='fas fa-phone' title='Answer Audio'></i><br><sup>Answer Audio</sup></div>\n";
echo "			<div class='dialpad_box' id='answer_video' onclick='answer_video();' style='background-color: #00b7c3;'><i class='fas fa-video' title='Answer Video'></i><br><sup>Answer Video</sup></div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the active call control
echo "	<div class='dialpad' id='active' style='display: none;'>\n";
echo "		<div class='caller_id' id='active_caller_id'></div>\n";
echo "		<div id='answer_time' class='answer_time'>00:00:00</div>\n";
echo "		<div class='dialpad_wrapper'>\n";
echo "			<div class='dialpad_box mute' id='mute_audio' onclick='mute_audio();'><i class='fas fa-microphone' title=\"".$text['label-mute']."\"></i><br><sup>".$text['label-mute']."</sup></div>\n";
echo "			<div class='dialpad_box' id='unmute_audio' style='color: #ba0000; display: none;' onclick='unmute_audio();'><i class='fas fa-microphone-slash' title=\"".$text['label-unmute']."\"></i><br><sup>".$text['label-unmute']."</sup></div>\n";
echo "			<div class='dialpad_box hold' id='hold' onclick='hold();'><i class='fas fa-pause' title=\"".$text['label-hold']."\"></i><br><sup>".$text['label-hold']."</sup></div>\n";
echo "			<div class='dialpad_box' id='unhold' style='color: #1ba800; display: none;' onclick='unhold();'><i class='fas fa-play' title=\"".$text['label-resume']."\"></i><br><sup>".$text['label-resume']."</sup></div>\n";

echo "			<div class='dialpad_box' id='mute_video' style='display: none;' onclick='mute_video();'>&nbsp;</div>\n";
echo "			<div class='dialpad_box' id='unmute_video' style='display: none;' onclick='unmute_video();'>&nbsp;</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the action bar
echo "	<div class='action_bar' id='action_bar'>\n";
echo "		<div class='action_item' onclick='show_dialpad();' id='action_keypad'><i class='fas fa-phone-alt'></i>\n";
echo "			<span class='action_label'>Dialpad</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' onclick='show_contacts();' id='action_contacts'><i class='fas fa-address-book'></i>\n";
echo "			<span class='action_label'>Contacts</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' onclick='show_history();' id='action_history'><i class='fas fa-history'></i>\n";
echo "			<span class='action_label'>History</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' onclick='show_messages();' id='action_messages'><i class='fas fa-comments'></i>\n";
echo "			<span class='action_label'>Messages</span>\n";
echo "			<span class='action_badge' id='action_messages_badge' style='display: none;'>0</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_mute' onclick='toggle_audio_mute_action();' style='display: none;'><i id='action_mute_icon' class='fas fa-microphone'></i>\n";
echo "			<span class='action_label' id='action_mute_label'>".$text['label-mute']."</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_hold' onclick='toggle_audio_hold_action();' style='display: none;'><i id='action_hold_icon' class='fas fa-pause'></i>\n";
echo "			<span class='action_label' id='action_hold_label'>".$text['label-hold']."</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_video_mute' onclick='toggle_video_mute_action();' style='display: none;'><i id='action_video_mute_icon' class='fas fa-video'></i>\n";
echo "			<span class='action_label' id='action_video_mute_label'>Local</span>\n";
echo "		</div>\n";
echo "		<div class='action_item action_item_hangup' id='hangup' onclick='hangup();' style='display: none;'><i class='fas fa-phone-slash' title=\"".$text['label-end']."\"></i>\n";
echo "			<span class='action_label'>".$text['label-end']."</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' onclick='show_keypad();' id='action_keypad_during_call' style='display: none;'><i class='fas fa-keyboard'></i>\n";
echo "			<span class='action_label'>Keypad</span>\n";
echo "		</div>\n";
echo "	</div>\n";

echo "</body>\n";

echo "</html>\n";

?>
