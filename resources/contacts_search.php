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
	if (!permission_exists('phone_view')) {
		header('Content-Type: application/json');
		echo "[]";
		exit;
	}

//add multi-lingual support
	$language = new text;
	$text = $language->get();

//get the search term
	$search = trim($_GET['search'] ?? '');
	$search = preg_replace('/[^a-zA-Z0-9\-\.\s\@_]+/', '', $search);

//build the base where clause
	$sql = "select c.contact_uuid, ";
	$sql .= "coalesce(c.contact_name_given, '') as contact_name_given, ";
	$sql .= "coalesce(c.contact_name_family, '') as contact_name_family, ";
	$sql .= "coalesce(c.contact_nickname, '') as contact_nickname, ";
	$sql .= "coalesce(c.contact_organization, '') as contact_organization, ";
	$sql .= "(select a.contact_attachment_uuid from v_contact_attachments as a where a.contact_uuid = c.contact_uuid and a.attachment_primary = true limit 1) as contact_attachment_uuid, ";
	$sql .= "(select e.extension from v_users as u, v_extension_users as eu, v_extensions as e where u.contact_uuid = c.contact_uuid and u.user_uuid = eu.user_uuid and eu.extension_uuid = e.extension_uuid and e.domain_uuid = :domain_uuid limit 1) as extension, ";
	$sql .= "(select p.phone_number from v_contact_phones as p where p.contact_uuid = c.contact_uuid and p.domain_uuid = :domain_uuid order by p.phone_primary desc, p.phone_label asc limit 1) as primary_phone ";
	$sql .= "from v_contacts as c ";
	$sql .= "where true ";
	$sql .= "and (c.domain_uuid = :domain_uuid or c.domain_uuid is null) ";
	$parameters['domain_uuid'] = $_SESSION['domain_uuid'];

//narrow by groups / user if not allowed to view the whole domain
	// if (!permission_exists('contact_domain_view')) {
	// 	$user_group_uuids = [];
	// 	foreach ($_SESSION['groups'] as $group_data) {
	// 		$user_group_uuids[] = $group_data['group_uuid'];
	// 	}
	// 	$user_group_uuids[] = $_SESSION["user_uuid"];
	// 	$sql .= "and ( ";
	// 	$sql .= "c.contact_uuid in ( ";
	// 	$sql .= "	select contact_uuid from v_contact_groups where ";
	// 	$sql_where_or = [];
	// 	foreach ($user_group_uuids as $index => $user_group_uuid) {
	// 		if (is_uuid($user_group_uuid)) {
	// 			$sql_where_or[] = "group_uuid = :group_uuid_".$index;
	// 			$parameters['group_uuid_'.$index] = $user_group_uuid;
	// 		}
	// 	}
	// 	if (!empty($sql_where_or)) {
	// 		$sql .= " ( ".implode(' or ', $sql_where_or)." ) ";
	// 	}
	// 	$sql .= "		and domain_uuid = :domain_uuid ";
	// 	$sql .= "	) ";
	// 	$sql .= "	or c.contact_uuid in ( ";
	// 	$sql .= "		select contact_uuid from v_contact_users where user_uuid = :user_uuid and domain_uuid = :domain_uuid ";
	// 	$sql .= "	) ";
	// 	$sql .= ") ";
	// 	$parameters['user_uuid'] = $_SESSION['user_uuid'];
	// }

//search filtering
	if (!empty($search)) {
		$sql .= "and ( ";
		if (is_numeric($search)) {
			// numeric: match against phone numbers or extension
			$sql .= "	( ";
			$sql .= "		c.contact_uuid in ( ";
			$sql .= "			select contact_uuid ";
			$sql .= "			from v_contact_phones ";
			$sql .= "			where phone_number like :search ";
			$sql .= "		) ";
			$sql .= "		or c.contact_uuid in ( ";
			$sql .= "			select u.contact_uuid ";
			$sql .= "			from v_users as u, v_extension_users as eu, v_extensions as e ";
			$sql .= "			where u.user_uuid = eu.user_uuid ";
			$sql .= "			and eu.extension_uuid = e.extension_uuid ";
			$sql .= "			and e.domain_uuid = :domain_uuid ";
			$sql .= "			and e.extension like :search ";
			$sql .= "		) ";
			$sql .= "	) ";
		}
		else {
			$sql .= "	( ";
			$sql .= "		lower(c.contact_organization) like :search ";
			$sql .= "		or lower(c.contact_name_given) like :search ";
			$sql .= "		or lower(c.contact_name_family) like :search ";
			$sql .= "		or lower(c.contact_nickname) like :search ";
			$sql .= "		or lower(c.contact_title) like :search ";
			$sql .= "		or lower(c.contact_role) like :search ";
			$sql .= "		or lower(c.contact_note) like :search ";
			$sql .= "		or c.contact_uuid in (select contact_uuid from v_contact_phones where phone_number like :search) ";
			$sql .= "		or c.contact_uuid in ( ";
			$sql .= "			select u.contact_uuid ";
			$sql .= "			from v_users as u, v_extension_users as eu, v_extensions as e ";
			$sql .= "			where u.user_uuid = eu.user_uuid ";
			$sql .= "			and eu.extension_uuid = e.extension_uuid ";
			$sql .= "			and e.domain_uuid = :domain_uuid ";
			$sql .= "			and e.extension like :search ";
			$sql .= "		) ";
			$sql .= "	) ";
		}
		$sql .= "	) ";
		$parameters['search'] = '%'.strtolower($search).'%';
	}

//limit the result set for the mobile phone app
	// $sql .= "order by c.contact_organization asc, c.contact_name_family asc, c.contact_name_given asc ";
	// $sql .= "limit 100 ";
	$contact_rows = $database->select($sql, $parameters ?? null, 'all');
	unset($sql, $parameters);

//build the JSON payload
	$contacts = [];
	if (!empty($contact_rows)) {
		$i = 0;
		foreach ($contact_rows as $row) {
			$name_parts = [];
			if (!empty($row['contact_name_given'])) { $name_parts[] = $row['contact_name_given']; }
			if (!empty($row['contact_name_family'])) { $name_parts[] = $row['contact_name_family']; }
			if (empty($name_parts) && !empty($row['contact_nickname'])) { $name_parts[] = $row['contact_nickname']; }
			if (empty($name_parts) && !empty($row['contact_organization'])) { $name_parts[] = $row['contact_organization']; }
			$display_name = implode(' ', $name_parts);

			// determine the primary dialable number
			$dialable = '';
			if (!empty($row['extension'])) {
				$dialable = $row['extension'];
			}
			elseif (!empty($row['primary_phone'])) {
				$dialable = $row['primary_phone'];
			}

			$contacts[$i] = [
				'uuid'      => $row['contact_uuid'],
				'name'      => $display_name,
				'extension' => $row['extension'] ?? '',
				'phone'     => $row['primary_phone'] ?? '',
				'dialable'  => $dialable,
				'avatar'    => (is_uuid($row['contact_attachment_uuid'] ?? '') ? $row['contact_attachment_uuid'] : '')
			];
			$i++;
		}
	}

//send the JSON
	header('Content-Type: application/json');
	header('Cache-Control: no-store');
	echo json_encode($contacts, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP);
	exit;

?>