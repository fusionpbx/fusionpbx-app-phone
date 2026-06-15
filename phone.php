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

//define global variables
global $database;

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

//get the user ID
$sql = "SELECT d.domain_name,e.extension,e.password ";
$sql .= "FROM v_extension_users as t, v_extensions as e, v_users as u, v_domains as d ";
$sql .= "WHERE u.user_uuid = t.user_uuid ";
$sql .= "AND e.extension_uuid = t.extension_uuid ";
$sql .= "AND e.domain_uuid = d.domain_uuid ";
$sql .= "AND u.user_uuid = :user_uuid ";
$sql .= "AND e.domain_uuid = :domain_uuid ";
$sql .= "LIMIT 1 ";
$parameters['domain_uuid'] = $domain_uuid;
$parameters['user_uuid'] = $user_uuid;
$row = $database->select($sql, $parameters ?? null, 'row');
if ($row) {
	$domain_name = $row['domain_name'];
	$user_extension = $row['extension'];
	$user_password = $row['password'];
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

//define the audio ringback
echo "	<audio id='ringback' preload='auto'>\n";
echo "		<source src='resources/sounds/ringback/default.mp3' type='audio/mpeg' loop='loop' />\n";
echo "	</audio>\n";

//define the audio ringtone
echo "	<audio id='ringtone' preload='auto'>\n";
echo "		<source src='resources/sounds/ringtones/default.mp3' type='audio/mpeg' loop='loop' />\n";
echo "	</audio>\n";

//audio or video objects need to be initialized before phone.js
echo "	<script language='JavaScript' type='text/javascript'>\n";
echo "	const time_zone = '".$settings->get('domain', 'time_zone')."';\n";
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
echo "	</div>\n";

//start the body_content
echo "	<div class='body_content'>\n";

//define the dialpad control
echo "		<div class='dialpad' id='dialpad'>\n";
echo "			<div class='dialpad_content'>\n"; // Added wrapper
echo "				<input type='text' class='destination' id='destination' name='destination' onkeypress=\"event.preventDefault();\"/>\n";
echo "				<div class='dialpad_wrapper'>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('1');\"><strong>1</strong><sup>&nbsp;</sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('2');\"><strong>2</strong><sup>ABC</sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('3');\"><strong>3</strong><sup>DEF</sup></div>\n";

echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('4');\"><strong>4</strong><sup>GHI</sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('5');\"><strong>5</strong><sup>JKL</sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('6');\"><strong>6</strong><sup>MNO</sup></div>\n";

echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('7');\"><strong>7</strong><sup>PQRS</sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('8');\"><strong>8</strong><sup>TUV</sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('9');\"><strong>9</strong><sup>WXYZ</sup></div>\n";

echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('*');\"><strong>*</strong><sup></sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('0');\"><strong>0</strong><sup></sup></div>\n";
echo "					<div class='dialpad_box' onclick=\"dialplan_digit_add('#');\"><strong>#</strong><sup></sup></div>\n";

echo "					<div class='dialpad_box video_call' onclick='call_video();' title='Video Call'><i class='fas fa-video'></i><sup>Video Call</sup></div>\n";
echo "					<div class='dialpad_box audio_call' onclick='call_audio();' title='Audio Call'><i class='fa-solid fa-phone'></i><sup>Audio Call</sup></div>\n";
echo "					<div class='dialpad_box delete' onclick='dialpad_digit_delete();' title=\"".$text['label-delete']."\"><i class='fas fa-chevron-left'></i><sup>".$text['label-delete']."</sup></div>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "		</div>\n";

//close the body_content
echo "	<div>\n";

//define the contacts panel
echo "	<div class='contacts' id='contacts' style='display: none;'>\n";
echo "		<div class='keypad_header'><i class='fas fa-address-book'></i> Contacts</div>\n";
echo "		<div class='contacts_list' id='contacts_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the history panel
echo "	<div class='history' id='history' style='display: none;'>\n";
echo "		<div class='keypad_header'><i class='fas fa-history'></i> Call History</div>\n";
echo "		<div class='history_list' id='history_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the messages panel (conversations list)
echo "	<div class='messages' id='messages' style='display: none;'>\n";
echo "		<div class='keypad_header'><i class='fas fa-comment'></i> Messages\n";
echo "			<a href='javascript:void(0)' onclick='new_conversation();' style='margin-left: 10px; color: #1eba00;' title='New Message'><i class='fas fa-plus'></i></a>\n";
echo "		</div>\n";
echo "		<div class='messages_list' id='messages_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the conversation panel (chat view)
echo "	<div class='conversation' id='conversation' style='display: none;'>\n";
echo "		<div class='conversation_header'>\n";
echo "			<a href='javascript:void(0)' onclick='show_messages();' style='color: #fff;'><i class='fas fa-arrow-left'></i></a>\n";
echo "			<span class='conversation_title' id='conversation_title'></span>\n";
echo "		</div>\n";
echo "		<div class='messages_container' id='messages_container'>\n";
echo "		</div>\n";
echo "		<div class='message_input_container'>\n";
echo "			<input type='text' id='message_input' placeholder='Message' />\n";
echo "			<button id='send_message_btn' onclick='send_current_message();'><i class='fas fa-paper-plane'></i></button>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the ringing call control
echo "	<div class='ringing' id='ringing' style='display: none;'>\n";
echo "		<div class='caller_id ringing' id='ringing_caller_id'></div>\n";
echo "		<div class='dialpad_wrapper' style='grid-template-columns: repeat(3, 1fr);'>\n";
echo "			<div class='dialpad_box' id='decline' onclick='decline();' style='background-color: #ba0000;'><i class='fas fa-phone-slash' title=\"".$text['label-decline']."\"></i><sup>".$text['label-decline']."</sup></div>\n";
echo "			<div class='dialpad_box' id='answer_audio' onclick='answer_audio();' style='background-color: #1ba800;'><i class='fas fa-phone' title='Answer Audio'></i><sup>Answer Audio</sup></div>\n";
echo "			<div class='dialpad_box' id='answer_video' onclick='answer_video();' style='background-color: #1E90FF;'><i class='fas fa-video' title='Answer Video'></i><sup>Answer Video</sup></div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the active call control
echo "	<div class='active' id='active' style='display: none;'>\n";
echo "		<div class='caller_id' id='active_caller_id'></div>\n";
echo "		<div id='answer_time' class='answer_time'>00:00:00</div>\n";
echo "		<div class='dialpad_wrapper'>\n";
echo "			<div class='dialpad_box mute' id='mute_audio' onclick='mute_audio();'><i class='fas fa-microphone' title=\"".$text['label-mute']."\"></i><sup>".$text['label-mute']."</sup></div>\n";
echo "			<div class='dialpad_box' id='unmute_audio' style='color: #ba0000; display: none;' onclick='unmute_audio();'><i class='fas fa-microphone-slash' title=\"".$text['label-unmute']."\"></i><sup>".$text['label-unmute']."</sup></div>\n";
echo "			<div class='dialpad_box hold' id='hold' onclick='hold();'><i class='fas fa-pause' title=\"".$text['label-hold']."\"></i><sup>".$text['label-hold']."</sup></div>\n";
echo "			<div class='dialpad_box' id='unhold' style='color: #1ba800; display: none;' onclick='unhold();'><i class='fas fa-play' title=\"".$text['label-resume']."\"></i><sup>".$text['label-resume']."</sup></div>\n";
echo "			<div class='dialpad_box' id='mute_video' style='display: none;' onclick='mute_video();'>&nbsp;</div>\n";
echo "			<div class='dialpad_box' id='unmute_video' style='display: none;' onclick='unmute_video();'>&nbsp;</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the settings panel (audio device selection)
echo "	<div class='settings_panel' id='settings_panel' style='display: none;'>\n";
echo "		<div class='settings_header'><i class='fas fa-cog'></i> Settings</div>\n";
echo "		<div class='settings_content'>\n";
echo "			<div class='audio_device_selector_container'>\n";
echo "				<label for='audio_input_select' class='audio_device_label'><i class='fas fa-microphone'></i> Audio Input:</label>\n";
echo "				<select id='audio_input_select' class='audio_device_select'>\n";
echo "					<option value=''>Default Device</option>\n";
echo "				</select>\n";
echo "			</div>\n";
echo "			<div class='ringback_selector_container'>\n";
echo "				<label for='ringback_select' class='ringback_label'><i class='fas fa-bell'></i> Ringback:</label>\n";
echo "				<select id='ringback_select' class='ringback_select'>\n";
echo "					<option value='default.mp3'>Default</option>\n";
echo "				</select>\n";
echo "			</div>\n";
echo "			<div class='ringtone_selector_container'>\n";
echo "				<label for='ringtone_select' class='ringtone_label'><i class='fas fa-bell'></i> Ringtone:</label>\n";
echo "				<select id='ringtone_select' class='ringtone_select'>\n";
echo "					<option value='default.mp3'>Default</option>\n";
echo "				</select>\n";
echo "			</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the action bar
echo "	<div class='action_bar' id='action_bar'>\n";
echo "		<div class='action_item' id='action_keypad' onclick='show_dialpad();'><i class='fas fa-phone-alt'></i>\n";
echo "			<span class='action_label'>Dialpad</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_contacts' onclick='show_contacts();' style='display: none;'><i class='fas fa-address-book'></i>\n";
echo "			<span class='action_label'>Contacts</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_history'onclick='show_history();'><i class='fas fa-history'></i>\n";
echo "			<span class='action_label'>History</span>\n";
echo "		</div>\n";
// echo "		<div class='action_item' id='action_messages' onclick='show_messages();'><i class='fas fa-comment'></i>\n";
// echo "			<span class='action_label'>".$text['label-messages']."</span>\n";
// echo "		</div>\n";
echo "		<div class='action_item' id='action_mute' onclick='toggle_audio_mute_action();' style='display: none;'><i id='action_mute_icon' class='fas fa-microphone'></i>\n";
echo "			<span class='action_label' id='action_mute_label'>".$text['label-mute']."</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_hold' onclick='toggle_audio_hold_action();' style='display: none;'><i id='action_hold_icon' class='fas fa-pause'></i>\n";
echo "			<span class='action_label' id='action_hold_label'>".$text['label-hold']."</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_video_mute' onclick='toggle_video_mute_action();' style='display: none;'><i id='action_video_mute_icon' class='fas fa-video'></i>\n";
echo "			<span class='action_label' id='action_video_mute_label'>Local</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_screen_share' onclick='toggle_screen_share();' style='display: none;'><i id='action_screen_share_icon' class='fas fa-desktop'></i>\n";
echo "			<span class='action_label' id='action_screen_share_label'>Share</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_transfer' onclick='show_attended_transfer_prompt();' style='display: none;'><i id='action_transfer_icon' class='fas fa-arrow-right-arrow-left'></i>\n";
echo "			<span class='action_label' id='action_transfer_label'>Transfer</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_btransfer' onclick='show_blind_transfer_prompt();' style='display: none;'><i id='action_transfer_icon' class='fas fa-arrow-right-arrow-left'></i>\n";
echo "			<span class='action_label' id='action_transfer_label'>BTransfer</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='complete_transfer' onclick='complete_attended_transfer()' style='display: none;'><i id='action_transfer_icon' class='fas fa-arrow-right-arrow-left'></i>\n";
echo "			<span class='action_label' id='action_comple_transfer_label'>Complete Transfer</span>\n";
echo "		</div>\n";
echo "		<div class='action_item action_item_hangup' id='cancel_transfer' onclick='cancel_attended_transfer()' style='display: none;'><i class='fas fa-times-circle' title='Cancel Transfer'></i>\n";
echo "			<span class='action_label'>Cancel Transfer</span>\n";
echo "		</div>\n";
echo "		<div class='action_item action_item_hangup' id='hangup' onclick='hangup();' style='display: none;'><i class='fas fa-phone-slash' title=\"".$text['label-end']."\"></i>\n";
echo "			<span class='action_label'>".$text['label-end']."</span>\n";
echo "		</div>\n";
echo "		<div class='action_item' id='action_settings' onclick='toggle_settings();'><i class='fas fa-cog'></i>\n";
echo "			<span class='action_label'>Settings</span>\n";
echo "		</div>\n";
echo "	</div>\n";
echo "\n";

echo "</body>\n";
echo "</html>\n";

?>
