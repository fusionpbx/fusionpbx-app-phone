<?php

//application details
	$apps[$x]['name'] = "Phone";
	$apps[$x]['uuid'] = "7051a36f-06f0-4489-a2fb-12b120e209b6";
	$apps[$x]['category'] = "";
	$apps[$x]['subcategory'] = "";
	$apps[$x]['version'] = "1.0";
	$apps[$x]['license'] = "Mozilla Public License 1.1";
	$apps[$x]['url'] = "http://www.fusionpbx.com";
	$apps[$x]['description']['en-us'] = "A browser-based softphone for FusionPBX.";
	$apps[$x]['description']['en-gb'] = "A browser-based softphone for FusionPBX";
	$apps[$x]['description']['ar-eg'] = "";
	$apps[$x]['description']['de-at'] = "";
	$apps[$x]['description']['de-ch'] = "";
	$apps[$x]['description']['de-de'] = "";
	$apps[$x]['description']['el-gr'] = "";
	$apps[$x]['description']['es-cl'] = "";
	$apps[$x]['description']['es-mx'] = "";
	$apps[$x]['description']['fr-ca'] = "";
	$apps[$x]['description']['fr-fr'] = "";
	$apps[$x]['description']['he-il'] = "";
	$apps[$x]['description']['it-it'] = "";
	$apps[$x]['description']['nl-nl'] = "";
	$apps[$x]['description']['pl-pl'] = "";
	$apps[$x]['description']['pt-br'] = "";
	$apps[$x]['description']['pt-pt'] = "";
	$apps[$x]['description']['ro-ro'] = "";
	$apps[$x]['description']['ru-ru'] = "";
	$apps[$x]['description']['sv-se'] = "";
	$apps[$x]['description']['uk-ua'] = "";

//default settings
// 	$y=0;
// 	$apps[$x]['default_settings'][$y]['default_setting_uuid'] = "54e3d956-c4a1-4de0-8560-709bddc3d9f8";
// 	$apps[$x]['default_settings'][$y]['default_setting_category'] = "phone";
// 	$apps[$x]['default_settings'][$y]['default_setting_subcategory'] = "";
// 	$apps[$x]['default_settings'][$y]['default_setting_name'] = "text";
// 	$apps[$x]['default_settings'][$y]['default_setting_value'] = "";
// 	$apps[$x]['default_settings'][$y]['default_setting_enabled'] = "true";
// 	$apps[$x]['default_settings'][$y]['default_setting_description'] = "";
// 	$y++;
// 	$apps[$x]['default_settings'][$y]['default_setting_uuid'] = "824c1c5a-c6c2-4bcf-ac4a-6031626bd13e";
// 	$apps[$x]['default_settings'][$y]['default_setting_category'] = "phone";
// 	$apps[$x]['default_settings'][$y]['default_setting_subcategory'] = "";
// 	$apps[$x]['default_settings'][$y]['default_setting_name'] = "boolean";
// 	$apps[$x]['default_settings'][$y]['default_setting_value'] = "";
// 	$apps[$x]['default_settings'][$y]['default_setting_enabled'] = "true";
// 	$apps[$x]['default_settings'][$y]['default_setting_description'] = "";

//permission details
	$y=0;
	$apps[$x]['permissions'][$y]['name'] = "phone_view";
	$apps[$x]['permissions'][$y]['menu']['uuid'] = "dff62ee9-f59e-4686-bc57-a4819ea303bf";
	$apps[$x]['permissions'][$y]['groups'][] = "superadmin";
// 	$apps[$x]['permissions'][$y]['groups'][] = "admin";
// 	$apps[$x]['permissions'][$y]['groups'][] = "user";
	$y++;
