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
$search_enabled = $settings->get('phone', 'search_enabled', 'false');
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
echo "<!DOCTYPE html>\n";
echo "<html>\n";

echo "<head>\n";
echo "	<title>".$text['title-phone']." - ".escape($theme_title)."</title>\n";
echo "	<meta charset='utf-8'>\n";
echo "	<meta http-equiv='Content-Type' content='text/html; charset=UTF-8'>\n";
echo "	<meta http-equiv='X-UA-Compatible' content='IE=edge'>\n";
echo "	<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' />\n";
echo "	<meta name='robots' content='noindex, nofollow, noarchive' />\n";
echo "	<link rel='stylesheet' type='text/css' href='".PROJECT_PATH."/resources/fontawesome/css/all.min.css.php'>\n";
echo "	<link rel='stylesheet' type='text/css' href='resources/styles.css?updated=".time()."'>\n";
echo "	<script>try{if(localStorage.getItem('phone_setting_theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}</script>\n";
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

//define the remote audio element for call audio playback
echo "	<audio id='remote_audio' autoplay style='display:none;'></audio>\n";

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
echo "	<div class='status_bar' id='status_bar' data-state='connecting'>\n";
echo "		<div class='status_zone status_zone_left'>\n";
echo "			<span class='status_icon' id='status_icon'><i class='fas fa-circle-notch fa-spin'></i></span>\n";
echo "			<span class='status_text' id='status_text'>Connecting</span>\n";
echo "		</div>\n";
echo "		<div class='status_zone status_zone_center' id='status_center'></div>\n";
echo "		<div class='status_zone status_zone_right'>\n";
echo "			<span class='status_chip status_chip_callcount' id='status_chip_callcount' title='Active calls' onclick='toggle_active_calls_panel();' style='cursor:pointer;'><i class='fas fa-phone-volume'></i><span id='status_callcount' class='status_chip_value'>0</span></span>\n";
echo "			<span class='status_chip status_chip_mute' id='status_chip_mute' title='Muted' style='display:none;'><i class='fas fa-microphone-slash'></i></span>\n";
echo "			<span class='status_chip status_chip_clock' id='status_chip_clock' title='Call duration' style='display:none;'><i class='fas fa-stopwatch'></i><span id='status_clock' class='status_chip_value'>0:00</span></span>\n";
echo "		</div>\n";
echo "	</div>\n";

//start the body_content
echo "	<div class='body_content'>\n";

//define the dialpad control
echo "		<div class='dialpad' id='dialpad'>\n";
echo "			<div class='dialpad_content'>\n"; // Added wrapper
echo "				<input type='text' class='destination' id='destination' name='destination' onkeypress=\"event.preventDefault();\" autocomplete='off' />\n";
echo "				<div class='dialpad_wrapper' role='group' aria-label='Dialpad'>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('1');\" aria-label='1'><strong>1</strong><sup>&nbsp;</sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('2');\" aria-label='2'><strong>2</strong><sup>ABC</sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('3');\" aria-label='3'><strong>3</strong><sup>DEF</sup></button>\n";

echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('4');\" aria-label='4'><strong>4</strong><sup>GHI</sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('5');\" aria-label='5'><strong>5</strong><sup>JKL</sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('6');\" aria-label='6'><strong>6</strong><sup>MNO</sup></button>\n";

echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('7');\" aria-label='7'><strong>7</strong><sup>PQRS</sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('8');\" aria-label='8'><strong>8</strong><sup>TUV</sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('9');\" aria-label='9'><strong>9</strong><sup>WXYZ</sup></button>\n";

echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('*');\" aria-label='Star'><strong>*</strong><sup></sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('0');\" aria-label='0'><strong>0</strong><sup></sup></button>\n";
echo "					<button type='button' class='dialpad_box' onclick=\"dialplan_digit_add('#');\" aria-label='Pound'><strong>#</strong><sup></sup></button>\n";

echo "					<button type='button' class='dialpad_box video_call' onclick='call_video();' title='Video Call' aria-label='Video Call'><i class='fas fa-video'></i><sup>Video Call</sup></button>\n";
echo "					<button type='button' class='dialpad_box audio_call' onclick='call_audio();' title='Audio Call' aria-label='Audio Call'><i class='fa-solid fa-phone'></i><sup>Audio Call</sup></button>\n";
echo "					<button type='button' class='dialpad_box delete' onclick='dialpad_digit_delete();' title=\"".$text['label-delete']."\" aria-label=\"".$text['label-delete']."\"><i class='fas fa-chevron-left'></i><sup>".$text['label-delete']."</sup></button>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "		</div>\n";

//close the body_content
echo "	</div>\n";

//define the contacts panel
echo "	<div class='contacts' id='contacts' style='display: none;'>\n";
echo "		<div class='contacts_toolbar'>\n";
echo "			<div class='contacts_search_wrapper'>\n";
echo "				<i class='fas fa-search contacts_search_icon'></i>\n";
echo "				<input type='text' id='contacts_search' class='contacts_search' placeholder=\"".$text['label-search']."\" autocomplete='off'>\n";
echo "				<button type='button' class='contacts_search_clear' id='contacts_search_clear' title='Clear search' style='display: none;'><i class='fas fa-times'></i></button>\n";
echo "			</div>\n";
echo "		</div>\n";
echo "		<div class='contacts_list' id='contacts_list'>\n";
echo "		</div>\n";

//define the contact details view (iframe)
echo "		<div class='contacts_details' id='contacts_details' style='display: none;'>\n";
echo "			<div class='contacts_details_toolbar'>\n";
echo "				<button type='button' class='contacts_details_back' id='contacts_details_back' onclick='close_contact_details();' title='Back' aria-label='Back'><i class='fas fa-arrow-left'></i></button>\n";
echo "				<span class='contacts_details_title'>Contact Details</span>\n";
echo "			</div>\n";
echo "			<div class='contacts_details_body'>\n";
echo "				<iframe id='contact_details_frame' class='contact_details_frame' title='Contact Details' src='about:blank'></iframe>\n";
echo "			</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the history panel
echo "	<div class='history' id='history' style='display: none;'>\n";
echo "		<div class='history_list' id='history_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the messages panel (conversations list)
echo "	<div class='messages' id='messages' style='display: none;'>\n";
echo "		<div class='keypad_header'>\n";
echo "			<a href='javascript:void(0)' onclick='new_conversation();' style='margin-left: 10px; color: #1eba00;' title='New Message'><i class='fas fa-plus'></i></a>\n";
echo "		</div>\n";
echo "		<div class='messages_list' id='messages_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the conversation panel (chat view)
echo "	<div class='conversation' id='conversation' style='display: none;'>\n";
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
echo "		<div class='dialpad_wrapper'>\n";
echo "			<button type='button' class='dialpad_box decline' id='decline' onclick='decline();' title=\"".$text['label-decline']."\" aria-label=\"".$text['label-decline']."\"><i class='fas fa-phone-slash'></i><sup>".$text['label-decline']."</sup></button>\n";
echo "			<button type='button' class='dialpad_box answer_audio' id='answer_audio' onclick='answer_audio();' title='Answer Audio' aria-label='Answer Audio'><i class='fas fa-phone'></i><sup>Answer Audio</sup></button>\n";
echo "			<button type='button' class='dialpad_box answer_video' id='answer_video' onclick='answer_video();' title='Answer Video' aria-label='Answer Video'><i class='fas fa-video'></i><sup>Answer Video</sup></button>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the active calls panel (for multi-call)
echo "	<div class='active_calls_panel' id='active_calls_panel' onclick='toggle_active_calls_panel();' style='display: none;'>\n";
echo "		<div class='active_calls_panel_list' id='active_calls_panel_list'>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the active call control
echo "	<div class='active' id='active' style='display: none;'>\n";
echo "		<div class='caller_id' id='active_caller_id' style='display: none;'></div>\n";
echo "		<div class='dialpad_wrapper'>\n";
echo "			<button type='button' class='dialpad_box mute' id='mute_audio' onclick='mute_audio();' title=\"".$text['label-mute']."\" aria-label=\"".$text['label-mute']."\"><i class='fas fa-microphone'></i><sup>".$text['label-mute']."</sup></button>\n";
echo "			<button type='button' class='dialpad_box unmute' id='unmute_audio' style='display: none;' onclick='unmute_audio();' title=\"".$text['label-unmute']."\" aria-label=\"".$text['label-unmute']."\"><i class='fas fa-microphone-slash'></i><sup>".$text['label-unmute']."</sup></button>\n";
echo "			<button type='button' class='dialpad_box hold' id='hold' onclick='hold();' title=\"".$text['label-hold']."\" aria-label=\"".$text['label-hold']."\"><i class='fas fa-pause'></i><sup>".$text['label-hold']."</sup></button>\n";
echo "			<button type='button' class='dialpad_box unhold' id='unhold' style='display: none;' onclick='unhold();' title=\"".$text['label-resume']."\" aria-label=\"".$text['label-resume']."\"><i class='fas fa-play'></i><sup>".$text['label-resume']."</sup></button>\n";
echo "			<button type='button' class='dialpad_box' id='mute_video' style='display: none;' onclick='mute_video();' aria-label='Mute Video'><i class='fas fa-video'></i><sup>Mute Video</sup></button>\n";
echo "			<button type='button' class='dialpad_box' id='unmute_video' style='display: none;' onclick='unmute_video();' aria-label='Unmute Video'><i class='fas fa-video'></i><sup>Unmute Video</sup></button>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the settings panel (audio device selection)
echo "	<div class='settings_panel' id='settings_panel' style='display: none;'>\n";
echo "		<div class='settings_content'>\n";
echo "			<div class='settings_section'>\n";
echo "				<div class='settings_section_header'><i class='fas fa-desktop'></i> Devices</div>\n";
echo "				<div class='audio_device_selector_container'>\n";
echo "					<label for='audio_input_select' class='audio_device_label'><i class='fas fa-microphone'></i> Input</label>\n";
echo "					<select id='audio_input_select' class='audio_device_select'>\n";
echo "						<option value=''>Default Device</option>\n";
echo "					</select>\n";
echo "				</div>\n";
echo "				<div class='audio_output_selector_container'>\n";
echo "					<label for='audio_output_select' class='audio_device_label'><i class='fas fa-headphones'></i> Output</label>\n";
echo "					<select id='audio_output_select' class='audio_device_select'>\n";
echo "						<option value=''>Default Device</option>\n";
echo "					</select>\n";
echo "				</div>\n";
echo "				<div class='video_device_selector_container'>\n";
echo "					<label for='video_input_select' class='video_device_label'><i class='fas fa-video'></i> Camera</label>\n";
echo "					<select id='video_input_select' class='video_device_select'>\n";
echo "						<option value=''>Default Device</option>\n";
echo "					</select>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "			<div class='settings_section'>\n";
echo "				<div class='settings_section_header'><i class='fas fa-bell'></i> Sounds</div>\n";
echo "				<div class='ringback_selector_container'>\n";
echo "					<label for='ringback_select' class='ringback_label'><i class='fas fa-volume-up'></i> Ringback</label>\n";
echo "					<select id='ringback_select' class='ringback_select'>\n";
echo "						<option value='default.mp3'>Default</option>\n";
echo "					</select>\n";
echo "				</div>\n";
echo "				<div class='ringtone_selector_container'>\n";
echo "					<label for='ringtone_select' class='ringtone_label'><i class='fas fa-phone-volume'></i> Ringtone</label>\n";
echo "					<select id='ringtone_select' class='ringtone_select'>\n";
echo "						<option value='default.mp3'>Default</option>\n";
echo "					</select>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "			<div class='settings_section'>\n";
echo "				<div class='settings_section_header'><i class='fas fa-phone'></i> Call Features</div>\n";
echo "				<div class='call_waiting_selector_container'>\n";
echo "					<label for='call_waiting_toggle' class='call_waiting_label'><i class='fas fa-bell-concierge'></i> Call Waiting</label>\n";
echo "					<label class='toggle-switch'>\n";
echo "						<input type='checkbox' id='call_waiting_toggle' checked />\n";
echo "						<span class='toggle-slider'></span>\n";
echo "					</label>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "			<div class='settings_section'>\n";
echo "				<div class='settings_section_header'><i class='fas fa-circle-half-stroke'></i> Theme</div>\n";
echo "				<div class='call_waiting_selector_container'>\n";
echo "					<label for='theme_toggle' class='call_waiting_label'><i class='fas fa-circle-half-stroke'></i> Light Mode</label>\n";
echo "					<label class='toggle-switch'>\n";
echo "						<input type='checkbox' id='theme_toggle' />\n";
echo "						<span class='toggle-slider'></span>\n";
echo "					</label>\n";
echo "				</div>\n";
echo "			</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the DTMF keypad panel - shown during active calls for sending DTMF
echo "	<div class='dialpad' id='dtmf_keypad' style='display: none;'>\n";
echo "		<div class='dialpad_content'>\n";
echo "			<input type='text' class='destination' id='dtmf_destination' value='3' readonly />\n";
echo "			<div class='dialpad_wrapper' role='group' aria-label='DTMF Keypad'>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"1\")' aria-label='1'><strong>1</strong><sup>&nbsp;</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"2\")' aria-label='2'><strong>2</strong><sup>ABC</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"3\")' aria-label='3'><strong>3</strong><sup>DEF</sup></button>\n";
echo "\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"4\")' aria-label='4'><strong>4</strong><sup>GHI</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"5\")' aria-label='5'><strong>5</strong><sup>JKL</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"6\")' aria-label='6'><strong>6</strong><sup>MNO</sup></button>\n";
echo "\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"7\")' aria-label='7'><strong>7</strong><sup>PQRS</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"8\")' aria-label='8'><strong>8</strong><sup>TUV</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"9\")' aria-label='9'><strong>9</strong><sup>WXYZ</sup></button>\n";
echo "\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"*\")' aria-label='Star'><strong>*</strong><sup>&nbsp;</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"0\")' aria-label='0'><strong>0</strong><sup>&nbsp;</sup></button>\n";
echo "				<button type='button' class='dialpad_box' onclick='send_dtmf(\"#\")' aria-label='Pound'><strong>#</strong><sup>&nbsp;</sup></button>\n";
echo "\n";
echo "				<div class='dialpad_box unassigned' aria-hidden='true'></div>\n";
echo "				<button type='button' class='dialpad_box send' onclick='send_dtmf_keypad();' title='Send' aria-label='Send'><i class='fa-solid fa-phone'></i><sup>Send</sup></button>\n";
echo "				<button type='button' class='dialpad_box delete' onclick='dtmf_keypad_digit_delete();' title=\"".$text['label-delete']."\" aria-label=\"".$text['label-delete']."\"><i class='fas fa-chevron-left'></i><sup>".$text['label-delete']."</sup></button>\n";
echo "			</div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the action bar
echo "	<div class='action_bar' id='action_bar' role='toolbar' aria-label='Call actions'>\n";
echo "		<button type='button' class='action_item' id='action_dialpad' onclick='show_dialpad();' aria-label='Dialpad'><i class='fas fa-phone-alt'></i>\n";
echo "			<span class='action_label'>Dialpad</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_keypad' onclick='toggle_dtmf_keypad();' style='display: none;' aria-label='Keypad'><i class='fas fa-keyboard'></i>\n";
echo "			<span class='action_label'>Keypad</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_new_call' onclick='start_new_call();' style='display: none;' aria-label='New Call'><i class='fas fa-phone'></i>\n";
echo "			<span class='action_label'>New Call</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_contacts' onclick='show_contacts();' aria-label='Contacts'><i class='fas fa-address-book'></i>\n";
echo "			<span class='action_label'>Contacts</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_history' onclick='show_history();' aria-label='History'><i class='fas fa-history'></i>\n";
echo "			<span class='action_label'>History</span>\n";
echo "		</button>\n";
//echo "		<button type='button' class='action_item' id='action_messages' onclick='show_messages();' aria-label=\"".$text['label-messages']."\"><i class='fas fa-comment'></i>\n";
//echo "			<span class='action_label'>".$text['label-messages']."</span>\n";
//echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_mute' onclick='toggle_audio_mute_action();' style='display: none;' aria-label=\"".$text['label-mute']."\"><i id='action_mute_icon' class='fas fa-microphone'></i>\n";
echo "			<span class='action_label' id='action_mute_label'>".$text['label-mute']."</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_hold' onclick='toggle_audio_hold_action();' style='display: none;' aria-label=\"".$text['label-hold']."\"><i id='action_hold_icon' class='fas fa-pause'></i>\n";
echo "			<span class='action_label' id='action_hold_label'>".$text['label-hold']."</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_video_mute' onclick='toggle_video_mute_action();' style='display: none;' aria-label='Local Video'><i id='action_video_mute_icon' class='fas fa-video'></i>\n";
echo "			<span class='action_label' id='action_video_mute_label'>Local</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_screen_share' onclick='toggle_screen_share();' style='display: none;' aria-label='Share Screen'><i id='action_screen_share_icon' class='fas fa-desktop'></i>\n";
echo "			<span class='action_label' id='action_screen_share_label'>Share</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_transfer' onclick='show_attended_transfer_prompt();' style='display: none;' aria-label='Transfer'><i id='action_transfer_icon' class='fas fa-arrow-right-arrow-left'></i>\n";
echo "			<span class='action_label' id='action_transfer_label'>Transfer</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_btransfer' onclick='show_blind_transfer_prompt();' style='display: none;' aria-label='Blind Transfer'><i id='action_transfer_icon' class='fas fa-arrow-right-arrow-left'></i>\n";
echo "			<span class='action_label' id='action_transfer_label'>BTransfer</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='complete_transfer' onclick='complete_attended_transfer()' style='display: none;' aria-label='Complete Transfer'><i id='action_transfer_icon' class='fas fa-arrow-right-arrow-left'></i>\n";
echo "			<span class='action_label' id='action_comple_transfer_label'>Complete Transfer</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item action_item_hangup' id='cancel_transfer' onclick='cancel_attended_transfer()' style='display: none;' aria-label='Cancel Transfer'><i class='fas fa-times-circle'></i>\n";
echo "			<span class='action_label'>Cancel Transfer</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item action_item_hangup' id='hangup' onclick='hangup();' style='display: none;' aria-label=\"".$text['label-end']."\"><i class='fas fa-phone-slash'></i>\n";
echo "			<span class='action_label'>".$text['label-end']."</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_active_calls' onclick='toggle_active_calls_panel();' style='display: none;' aria-label='Active Calls'><i id='action_active_calls_icon' class='fas fa-phone-volume'></i>\n";
echo "			<span class='action_label' id='action_active_calls_label'>Calls</span>\n";
echo "		</button>\n";
echo "		<button type='button' class='action_item' id='action_settings' onclick='toggle_settings();' aria-label='Settings'><i class='fas fa-cog'></i>\n";
echo "			<span class='action_label'>Settings</span>\n";
echo "		</button>\n";
echo "	</div>\n";
echo "\n";

echo "</body>\n";
echo "</html>\n";

?>
