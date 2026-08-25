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

//include files
	require_once dirname(__DIR__, 3) . "/resources/require.php";
	require_once "resources/check_auth.php";

//check permissions
	if (!permission_exists('contact_view')) {
		http_response_code(403);
		header('Content-Type: text/html; charset=utf-8');
		echo "<!DOCTYPE html>\n<html>\n<head>\n";
		echo "	<meta charset='utf-8'>\n";
		echo "	<title>Access Denied</title>\n";
		echo "</head>\n<body style='font-family: sans-serif; text-align: center; padding-top: 40%;'>\n";
		echo "	Access Denied\n";
		echo "</body>\n</html>\n";
		exit;
	}

//add multi-lingual support
	$language = new text;
	$text = $language->get();

//get the contact id
	$contact_uuid = trim($_GET['id'] ?? '');
	if (!is_uuid($contact_uuid)) {
		$contact_uuid = '';
	}

//labels with english fallback
	$label_call = $text['label-call'] ?? 'CALL';
	$label_extension = $text['label-extension'] ?? 'Extension';

//get the contact
	$contact = null;
	if (!empty($contact_uuid)) {
		$sql = "select * from v_contacts ";
		$sql .= "where contact_uuid = :contact_uuid ";
		$sql .= "and (domain_uuid = :domain_uuid or domain_uuid is null) ";
		$parameters['contact_uuid'] = $contact_uuid;
		$parameters['domain_uuid'] = $_SESSION['domain_uuid'];
		$contact = $database->select($sql, $parameters, 'row');
		unset($sql, $parameters);
	}

//if the contact was not found then render the error page
	if (empty($contact)) {
		header('Content-Type: text/html; charset=utf-8');
		echo "<!DOCTYPE html>\n<html>\n<head>\n";
		echo "	<meta charset='utf-8'>\n";
		echo "	<title>Contact Not Found</title>\n";
		echo "	<meta name='robots' content='noindex, nofollow, noarchive'>\n";
		echo "	<link rel='stylesheet' type='text/css' href='" . PROJECT_PATH . "/resources/fontawesome/css/all.min.css.php'>\n";
		echo "	<link rel='stylesheet' type='text/css' href='styles.css?updated=" . time() . "'>\n";
		echo "	<script>try{if(localStorage.getItem('phone_setting_theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}</script>\n";
		echo "	<script language='JavaScript' type='text/javascript'>window.FontAwesomeConfig = { autoReplaceSvg: false }</script>\n";
		echo "	<script>\n";
		echo "	function contact_detail_go_back() {\n";
		echo "		try { if (window.parent && window.parent !== window && typeof window.parent.close_contact_details === 'function') { window.parent.close_contact_details(); return; } } catch (e) {}\n";
		echo "		if (window.history && window.history.length > 1) { window.history.back(); } else { window.close(); }\n";
		echo "	}\n";
		echo "	</script>\n";
		echo "</head>\n<body class='contact_detail_body'>\n";
		echo "	<div class='contact_detail_error'>\n";
		echo "		<i class='fas fa-user-slash'></i>\n";
		echo "		<div class='contact_detail_error_title'>Contact Not Found</div>\n";
		echo "		<button type='button' class='contact_detail_back_btn' onclick='contact_detail_go_back()'>Back</button>\n";
		echo "	</div>\n";
		echo "</body>\n</html>\n";
		exit;
	}

//get the primary avatar attachment
	$sql = "select contact_attachment_uuid from v_contact_attachments ";
	$sql .= "where contact_uuid = :contact_uuid ";
	$sql .= "and attachment_primary = true ";
	$sql .= "limit 1 ";
	$parameters['contact_uuid'] = $contact_uuid;
	$contact_attachment_uuid = (string) ($database->select($sql, $parameters, 'column') ?? '');
	unset($sql, $parameters);

//get the extensions assigned to this contact
	$sql = "select e.extension, e.description, e.enabled ";
	$sql .= "from v_extensions as e, v_extension_users as eu, v_users as u ";
	$sql .= "where e.extension_uuid = eu.extension_uuid ";
	$sql .= "and u.user_uuid = eu.user_uuid ";
	$sql .= "and e.domain_uuid = :domain_uuid ";
	$sql .= "and u.contact_uuid = :contact_uuid ";
	$sql .= "order by e.extension asc ";
	$parameters['domain_uuid'] = $_SESSION['domain_uuid'];
	$parameters['contact_uuid'] = $contact_uuid;
	$contact_extensions = $database->select($sql, $parameters, 'all') ?? [];
	unset($sql, $parameters);

//get the phones
	$sql = "select * from v_contact_phones ";
	$sql .= "where domain_uuid = :domain_uuid ";
	$sql .= "and contact_uuid = :contact_uuid ";
	$sql .= "order by phone_primary desc, phone_label asc ";
	$parameters['domain_uuid'] = $_SESSION['domain_uuid'];
	$parameters['contact_uuid'] = $contact_uuid;
	$contact_phones = $database->select($sql, $parameters, 'all') ?? [];
	unset($sql, $parameters);

//get the emails
	$sql = "select * from v_contact_emails ";
	$sql .= "where domain_uuid = :domain_uuid ";
	$sql .= "and contact_uuid = :contact_uuid ";
	$sql .= "order by email_primary desc, email_label asc ";
	$parameters['domain_uuid'] = $_SESSION['domain_uuid'];
	$parameters['contact_uuid'] = $contact_uuid;
	$contact_emails = $database->select($sql, $parameters, 'all') ?? [];
	unset($sql, $parameters);

//get the urls
	$sql = "select * from v_contact_urls ";
	$sql .= "where domain_uuid = :domain_uuid ";
	$sql .= "and contact_uuid = :contact_uuid ";
	$sql .= "order by url_primary desc, url_label asc ";
	$parameters['domain_uuid'] = $_SESSION['domain_uuid'];
	$parameters['contact_uuid'] = $contact_uuid;
	$contact_urls = $database->select($sql, $parameters, 'all') ?? [];
	unset($sql, $parameters);

//get the addresses
	$sql = "select * from v_contact_addresses ";
	$sql .= "where domain_uuid = :domain_uuid ";
	$sql .= "and contact_uuid = :contact_uuid ";
	$sql .= "order by address_primary desc, address_label asc ";
	$parameters['domain_uuid'] = $_SESSION['domain_uuid'];
	$parameters['contact_uuid'] = $contact_uuid;
	$contact_addresses = $database->select($sql, $parameters, 'all') ?? [];
	unset($sql, $parameters);

//build the display name
	$display_name_parts = [];
	foreach (['contact_name_given', 'contact_name_middle', 'contact_name_family'] as $name_field) {
		if (!empty($contact[$name_field])) {
			$display_name_parts[] = trim($contact[$name_field]);
		}
	}
	if (empty($display_name_parts) && !empty($contact['contact_nickname'])) {
		$display_name_parts[] = $contact['contact_nickname'];
	}
	if (empty($display_name_parts) && !empty($contact['contact_organization'])) {
		$display_name_parts[] = $contact['contact_organization'];
	}
	$display_name = implode(' ', $display_name_parts);

//sub line below the name (title / role / time zone)
	$sub_parts = [];
	if (!empty($contact['contact_title'])) { $sub_parts[] = $contact['contact_title']; }
	if (!empty($contact['contact_role'])) { $sub_parts[] = $contact['contact_role']; }
	if (!empty($contact['contact_time_zone'])) { $sub_parts[] = $contact['contact_time_zone']; }
	$sub_line = implode('  •  ', $sub_parts);

//deterministic pastel palette for the initials avatar fallback (matches the contact list)
function contact_detail_avatar_palette() {
	return ['#A8D8B9', '#AEC6CF', '#FFB3BA', '#FFDFBA', '#B5A8FF', '#C2E8FF', '#F5C6AA', '#E0C3FC', '#FFF2B2', '#B8E0D2', '#FAD0C4', '#BAFFC9'];
}

function contact_detail_avatar_color_index(string $seed): int {
	$palette = contact_detail_avatar_palette();
	$hash = 0;
	for ($i = 0, $len = strlen($seed); $i < $len; $i++) {
		$hash = (($hash << 5) - $hash + ord($seed[$i])) & 0x7FFFFFFF;
	}
	return $hash % count($palette);
}

function contact_detail_avatar_initials(string $name): string {
	$parts = array_values(array_filter(preg_split('/\s+/', trim($name))));
	if (empty($parts)) { return '?'; }
	if (count($parts) === 1) { return mb_substr($parts[0], 0, 1); }
	return mb_substr($parts[0], 0, 1) . mb_substr(end($parts), 0, 1);
}

$avatar_bg = '';
$avatar_initials = '';
if (empty($contact_attachment_uuid)) {
	$avatar_bg = contact_detail_avatar_palette()[contact_detail_avatar_color_index($contact_uuid)];
	$avatar_initials = contact_detail_avatar_initials($display_name);
}

//build the click_to_call fallback URL base (the destination number is appended by the browser)
	$src_extension = $_SESSION['user']['extension'][0]['extension'] ?? '';
	$src_cid_name = $_SESSION['user']['extension'][0]['outbound_caller_id_name'] ?? '';
	$src_cid_number = $_SESSION['user']['extension'][0]['outbound_caller_id_number'] ?? '';
	$click_to_call_url_base = PROJECT_PATH . "/app/click_to_call/click_to_call.php?src=" . urlencode($src_extension)
		. "&src_cid_name=" . urlencode($src_cid_name)
		. "&src_cid_number=" . urlencode($src_cid_number)
		. "&dest_cid_name=" . urlencode($src_cid_name)
		. "&dest_cid_number=" . urlencode($src_cid_number)
		. "&rec=false&ringback=us-ring&auto_answer=true&dest=";

//set the title
	$document_title = 'Contact Details';
	if ($display_name !== '') {
		$document_title .= ' - ' . $display_name;
	}

//send the content
	echo "<!DOCTYPE html>\n";
	echo "<html>\n";
	echo "<head>\n";
	echo "	<title>" . escape($document_title) . "</title>\n";
	echo "	<meta charset='utf-8'>\n";
	echo "	<meta http-equiv='Content-Type' content='text/html; charset=UTF-8'>\n";
	echo "	<meta name='viewport' content='width=device-width, initial-scale=1.0'>\n";
	echo "	<meta name='robots' content='noindex, nofollow, noarchive'>\n";
	echo "	<link rel='stylesheet' type='text/css' href='" . PROJECT_PATH . "/resources/fontawesome/css/all.min.css.php'>\n";
	echo "	<link rel='stylesheet' type='text/css' href='styles.css?updated=" . time() . "'>\n";
	echo "	<script>try{if(localStorage.getItem('phone_setting_theme')==='light'){document.documentElement.classList.add('light');}}catch(e){}</script>\n";
	echo "	<script language='JavaScript' type='text/javascript'>window.FontAwesomeConfig = { autoReplaceSvg: false }</script>\n";
	echo "</head>\n";
	echo "<body class='contact_detail_body'>\n";
	echo "	<div class='contact_detail_page'>\n";

//header: back button, avatar, identity
	echo "		<div class='contact_detail_header'>\n";
	//echo "			<button type='button' class='contact_detail_back' onclick='contact_detail_go_back()' title='Back' aria-label='Back'><i class='fas fa-arrow-left'></i></button>\n";
	if (!empty($contact_attachment_uuid)) {
		$avatar_url = PROJECT_PATH . "/core/contacts/contact_attachment.php?id=" . urlencode($contact_attachment_uuid) . "&action=download";
		echo "			<div class='contact_detail_avatar' style='background-image: url(\"" . escape($avatar_url) . "\");'></div>\n";
	}
	else {
		echo "			<div class='contact_detail_avatar contact_detail_avatar_initials' style='background-color: " . escape($avatar_bg) . ";'>" . escape($avatar_initials) . "</div>\n";
	}
	echo "			<div class='contact_detail_identity'>\n";
	echo "				<div class='contact_detail_name'>" . ($display_name !== '' ? escape($display_name) : '&nbsp;') . "</div>\n";
	if (!empty($contact['contact_organization'])) {
		echo "				<div class='contact_detail_org'>" . escape($contact['contact_organization']) . "</div>\n";
	}
	if ($sub_line !== '') {
		echo "				<div class='contact_detail_sub'>" . escape($sub_line) . "</div>\n";
	}
	echo "			</div>\n";
	echo "		</div>\n";

//phone numbers (with call buttons)
	if (!empty($contact_phones)) {
		echo "		<div class='contact_detail_section'>\n";
		echo "			<div class='contact_detail_section_title'><i class='fas fa-phone'></i> Phone Numbers</div>\n";
		foreach ($contact_phones as $phone_row) {
			$phone_number = (string) ($phone_row['phone_number'] ?? '');
			if ($phone_number === '') {
				continue;
			}
			$phone_label = (string) ($phone_row['phone_label'] ?? '');
			if ($phone_label !== '' && $phone_label === strtolower($phone_label)) {
				$phone_label = ucwords($phone_label);
			}
			$type_icons = '';
			if (!empty($phone_row['phone_type_voice'])) { $type_icons .= "<i class='fas fa-phone fa-fw' title='Voice'></i>"; }
			if (!empty($phone_row['phone_type_fax'])) { $type_icons .= "<i class='fas fa-fax fa-fw' title='Fax'></i>"; }
			if (!empty($phone_row['phone_type_video'])) { $type_icons .= "<i class='fas fa-video fa-fw' title='Video'></i>"; }
			if (!empty($phone_row['phone_type_text'])) { $type_icons .= "<i class='fas fa-comment fa-fw' title='Text'></i>"; }
			$primary_star = (!empty($phone_row['phone_primary'])) ? " <i class='fas fa-star contact_detail_primary' title='Primary'></i>" : '';
			$speed_dial = (!empty($phone_row['phone_speed_dial'])) ? "<span class='contact_detail_speed_dial' title='Speed Dial'><i class='fas fa-bolt'></i>" . escape($phone_row['phone_speed_dial']) . "</span>" : '';
			echo "			<div class='contact_detail_item'>\n";
			echo "				<div class='contact_detail_item_main'>\n";
			echo "					<div class='contact_detail_item_label'>" . escape($phone_label) . $type_icons . $primary_star . "</div>\n";
			echo "					<div class='contact_detail_item_value'>" . escape(format_phone($phone_number)) . $speed_dial . "</div>\n";
			echo "				</div>\n";
			echo "				<button type='button' class='contact_detail_call_btn' data-contact-detail-call=\"" . escape($phone_number) . "\"><i class='fas fa-phone'></i> " . escape($label_call) . "</button>\n";
			echo "			</div>\n";
		}
		echo "		</div>\n";
	}

//extensions (with call buttons)
	$extension_rows = [];
	foreach ($contact_extensions as $ext_row) {
		if (($ext_row['enabled'] ?? '') != 'true') {
			continue; //skip disabled extensions
		}
		if (!empty($ext_row['extension'])) {
			$extension_rows[] = $ext_row;
		}
	}
	if (!empty($extension_rows)) {
		echo "		<div class='contact_detail_section'>\n";
		echo "			<div class='contact_detail_section_title'><i class='fas fa-phone-volume'></i> Extension</div>\n";
		foreach ($extension_rows as $ext_row) {
			$extension_number = (string) $ext_row['extension'];
			$extension_desc = (string) ($ext_row['description'] ?? '');
			echo "			<div class='contact_detail_item'>\n";
			echo "				<div class='contact_detail_item_main'>\n";
			echo "					<div class='contact_detail_item_label'>" . escape($label_extension) . "</div>\n";
			echo "					<div class='contact_detail_item_value'>" . escape($extension_number) . ($extension_desc !== '' ? " <span style='color: var(--text-muted); font-size: 13px;'>" . escape($extension_desc) . "</span>" : '') . "</div>\n";
			echo "				</div>\n";
			echo "				<button type='button' class='contact_detail_call_btn' data-contact-detail-call=\"" . escape($extension_number) . "\"><i class='fas fa-phone'></i> " . escape($label_call) . "</button>\n";
			echo "			</div>\n";
		}
		echo "		</div>\n";
	}

//emails
	if (!empty($contact_emails)) {
		echo "		<div class='contact_detail_section'>\n";
		echo "			<div class='contact_detail_section_title'><i class='fas fa-envelope'></i> Email</div>\n";
		foreach ($contact_emails as $email_row) {
			$email_address = (string) ($email_row['email_address'] ?? '');
			if ($email_address === '') {
				continue;
			}
			$email_label = (string) ($email_row['email_label'] ?? '');
			if ($email_label !== '' && $email_label === strtolower($email_label)) {
				$email_label = ucwords($email_label);
			}
			echo "			<div class='contact_detail_item'>\n";
			echo "				<div class='contact_detail_item_main'>\n";
			echo "					<div class='contact_detail_item_label'>" . escape($email_label) . "</div>\n";
			echo "					<div class='contact_detail_item_value'><a href='mailto:" . escape($email_address) . "'>" . escape($email_address) . "</a></div>\n";
			echo "				</div>\n";
			echo "			</div>\n";
		}
		echo "		</div>\n";
	}

//urls
	if (!empty($contact_urls)) {
		echo "		<div class='contact_detail_section'>\n";
		echo "			<div class='contact_detail_section_title'><i class='fas fa-link'></i> Website</div>\n";
		foreach ($contact_urls as $url_row) {
			$url_address = (string) ($url_row['url_address'] ?? '');
			if ($url_address === '') {
				continue;
			}
			$url_label = (string) ($url_row['url_label'] ?? '');
			if ($url_label !== '' && $url_label === strtolower($url_label)) {
				$url_label = ucwords($url_label);
			}
			$url_display = str_replace(['http://', 'https://'], '', $url_address);
			echo "			<div class='contact_detail_item'>\n";
			echo "				<div class='contact_detail_item_main'>\n";
			echo "					<div class='contact_detail_item_label'>" . escape($url_label) . "</div>\n";
			echo "					<div class='contact_detail_item_value'><a href='" . escape($url_address) . "' target='_blank' rel='noopener'>" . escape($url_display) . "</a></div>\n";
			echo "				</div>\n";
			echo "			</div>\n";
		}
		echo "		</div>\n";
	}

//addresses
	if (!empty($contact_addresses)) {
		echo "		<div class='contact_detail_section'>\n";
		echo "			<div class='contact_detail_section_title'><i class='fas fa-map-marker-alt'></i> Address</div>\n";
		foreach ($contact_addresses as $address_row) {
			$address_parts = [];
			foreach (['address_street', 'address_extended', 'address_locality', 'address_region', 'address_postal_code', 'address_country'] as $address_field) {
				if (!empty($address_row[$address_field])) {
					$address_parts[] = trim($address_row[$address_field]);
				}
			}
			if (empty($address_parts)) {
				continue;
			}
			$address_label = (string) ($address_row['address_label'] ?? '');
			if ($address_label !== '' && $address_label === strtolower($address_label)) {
				$address_label = ucwords($address_label);
			}
			$address_display = implode(', ', $address_parts);
			$map_url = "http://maps.google.com/maps?q=" . urlencode($address_display) . "&hl=en";
			echo "			<div class='contact_detail_item'>\n";
			echo "				<div class='contact_detail_item_main'>\n";
			echo "					<div class='contact_detail_item_label'>" . escape($address_label) . "</div>\n";
			echo "					<div class='contact_detail_item_value'><a href='" . escape($map_url) . "' target='_blank' rel='noopener'>" . escape($address_display) . "</a></div>\n";
			echo "				</div>\n";
			echo "			</div>\n";
		}
		echo "		</div>\n";
	}

//note
	if (!empty($contact['contact_note'])) {
		echo "		<div class='contact_detail_section'>\n";
		echo "			<div class='contact_detail_section_title'><i class='fas fa-sticky-note'></i> Note</div>\n";
		echo "			<div class='contact_detail_item'>\n";
		echo "				<div class='contact_detail_item_value contact_detail_note'>" . escape($contact['contact_note']) . "</div>\n";
		echo "			</div>\n";
		echo "		</div>\n";
	}

	echo "	</div>\n";

//javascript: place calls and navigate back
	echo "	<script>\n";
	echo "	/* Place a call to the given number. Prefer the hosting phone app\n";
	echo "	   (iframe parent or window opener); fall back to the click_to_call app. */\n";
	echo "	function contact_detail_place_call(number) {\n";
	echo "		if (!number) { return; }\n";
	echo "		try {\n";
	echo "			if (window.parent && window.parent !== window && typeof window.parent.call_contact === 'function') {\n";
	echo "				window.parent.call_contact(number);\n";
	echo "				return;\n";
	echo "			}\n";
	echo "		} catch (e) {}\n";
	echo "		try {\n";
	echo "			if (window.opener && !window.opener.closed && typeof window.opener.call_contact === 'function') {\n";
	echo "				window.opener.focus();\n";
	echo "				window.opener.call_contact(number);\n";
	echo "				return;\n";
	echo "			}\n";
	echo "		} catch (e) {}\n";
	echo "		window.open(" . json_encode($click_to_call_url_base) . " + encodeURIComponent(number), '_blank');\n";
	echo "	}\n";
	echo "\n";
	echo "	/* Go back to the caller (phone app or browser history) */\n";
	echo "	function contact_detail_go_back() {\n";
	echo "		try {\n";
	echo "			if (window.parent && window.parent !== window && typeof window.parent.close_contact_details === 'function') {\n";
	echo "				window.parent.close_contact_details();\n";
	echo "				return;\n";
	echo "			}\n";
	echo "		} catch (e) {}\n";
	echo "		if (window.history && window.history.length > 1) { window.history.back(); } else { window.close(); }\n";
	echo "	}\n";
	echo "\n";
	echo "	/* Wire up the call buttons (number is stored in a data attribute) */\n";
	echo "	document.querySelectorAll('[data-contact-detail-call]').forEach(function(btn) {\n";
	echo "		btn.addEventListener('click', function() { contact_detail_place_call(btn.getAttribute('data-contact-detail-call')); });\n";
	echo "	});\n";
	echo "	</script>\n";
	echo "</body>\n";
	echo "</html>\n";

?>