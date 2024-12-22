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
	Portions created by the Initial Developer are Copyright (C) 2024
	the Initial Developer. All Rights Reserved.

	Contributor(s):
	Mark J Crane <markjcrane@fusionpbx.com>
*/

//includes files
require_once dirname(__DIR__, 2) . "/resources/require.php";
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

//get the user ID
$sql = "SELECT d.domain_name,e.extension,e.password FROM ";
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
echo "	<div>\n";
echo "		<div style='position: absolute;'><video id='remote_video' width='640' height='480' style='display: none;'></video></div>\n";
echo "		<div style='position: absolute; display: none;'><video id='local_video' width='160' height='120' style='display: none;'></video></div>\n";
echo "	</div>\n";

//define the audio ringtone
echo "	<audio id='ringtone' preload='auto'>\n";
echo "		<source src='resources/ringtones/ringtone.mp3' type='audio/mpeg' loop='loop' />\n";
echo "	</audio>\n";

//audio or video objects need to be initialized before phone.js
echo "	<script language='JavaScript' type='text/javascript'>";
require 'resources/phone.js';
echo "	</script>\n";

//define the dialpad control
echo "	<div class='dialpad' id='dialpad'>\n";
echo "		<input type='text' class='destination' id='destination' name='destination' onkeypress=\"event.preventDefault();\"/>\n";
echo "		<div class='dialpad_wrapper'>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('1');\"><strong>1</strong><br><sup>&nbsp;</sup></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('2');\"><strong>2</strong><br><sup>ABC</sup></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('3');\"><strong>3</strong><br><sup>DEF</sup></div>\n";

echo "			<div class='dialpad_box' onclick=\"digit_add('4');\"><strong>4</strong><br><sup>GHI</sup></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('5');\"><strong>5</strong><br><sup>JKL</sup></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('6');\"><strong>6</strong><br><sup>MNO</sup></div>\n";

echo "			<div class='dialpad_box' onclick=\"digit_add('7');\"><strong>7</strong><br><sup>PQRS</sup></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('8');\"><strong>8</strong><br><sup>TUV</sup></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('9');\"><strong>9</strong><br><sup>WXYZ</sup></div>\n";

echo "			<div class='dialpad_box' onclick=\"digit_add('*');\" style='margin-bottom: 8px; padding-top: 20px; padding-bottom: 0;'><strong>*</strong></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('0');\" style='margin-bottom: 8px; padding-top: 15px; padding-bottom: 5px;'><strong>0</strong></div>\n";
echo "			<div class='dialpad_box' onclick=\"digit_add('#');\" style='margin-bottom: 8px; padding-top: 15px; padding-bottom: 5px;'><strong>#</strong></div>\n";

echo "			<div class='dialpad_box clear' onclick='digit_clear();' title=\"".$text['label-clear']."\"><i class='fas fa-times'></i><br><sup>".$text['label-clear']."</sup></div>\n";
echo "			<div class='dialpad_box call' onclick='send();' title=\"".$text['label-call']."\"><i class='fa-solid fa-phone'></i><br><sup>".$text['label-call']."</sup></div>\n";
echo "			<div class='dialpad_box delete' onclick='digit_delete();' title=\"".$text['label-delete']."\"><i class='fas fa-chevron-left'></i><br><sup>".$text['label-delete']."</sup></div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the ringing control
echo "	<div class='dialpad' id='ringing' style='display: none;'>\n";
echo "		<div class='caller_id ringing' id='ringing_caller_id'></div>\n";
echo "		<div class='dialpad_wrapper' style='grid-template-columns: 50% 50%;'>\n";
echo "			<div class='dialpad_box' id='decline' onclick='hangup();' style='background-color: #ba0000;'><i class='fas fa-phone-slash' title=\"".$text['label-decline']."\"></i><br><sup>".$text['label-decline']."</sup></div>\n";
echo "			<div class='dialpad_box' id='answer' onclick='answer();' style='background-color: #147e00;'><i class='fas fa-phone' title=\"".$text['label-answer']."\"></i><br><sup>".$text['label-answer']."</sup></div>\n";
echo "		</div>\n";
echo "	</div>\n";

//define the active call control
echo "	<div class='dialpad' id='active' style='display: none;'>\n";
echo "		<div class='caller_id' id='active_caller_id'></div>\n";
echo "		<div id='answer_time' class='answer_time'>00:00:00</div>\n";
echo "		<div class='dialpad_wrapper'>\n";
echo "			<div class='dialpad_box mute' id='mute_audio' onclick='mute_audio();'><i class='fas fa-microphone' title=\"".$text['label-mute']."\"></i><br><sup>".$text['label-mute']."</sup></div>\n";
echo "			<div class='dialpad_box' id='unmute_audio' style='color: #ba0000; display: none;' onclick='unmute_audio();'><i class='fas fa-microphone-slash' title=\"".$text['label-unmute']."\"></i><br><sup>".$text['label-unmute']."</sup></div>\n";

echo "			<div class='dialpad_box' id='hangup' onclick='hangup();' style='background-color: #ba0000;'><i class='fas fa-phone-slash' title=\"".$text['label-end']."\"></i><br><sup>".$text['label-end']."</sup></div>\n";

echo "			<div class='dialpad_box hold' id='hold' onclick='hold();'><i class='fas fa-pause' title=\"".$text['label-hold']."\"></i><br><sup>".$text['label-hold']."</sup></div>\n";
echo "			<div class='dialpad_box' id='unhold' style='color: #1ba800; display: none;' onclick='unhold();'><i class='fas fa-play' title=\"".$text['label-resume']."\"></i><br><sup>".$text['label-resume']."</sup></div>\n";

echo "			<div class='dialpad_box' id='mute_video' style='display: none;' onclick='mute_video();'>&nbsp;</div>\n";
echo "			<div class='dialpad_box' id='umute_video' style='display: none;' onclick='unmute_video();'>&nbsp;</div>\n";
echo "		</div>\n";
echo "	</div>\n";
echo "</body>\n";

echo "</html>\n";

?>