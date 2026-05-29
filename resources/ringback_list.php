<?php
/*
	FusionPBX Web Phone
	Ringback Sound List Endpoint
*/
header('Content-Type: application/json');

$ringback_dir = __DIR__ . '/sounds/ringback';
$allowed_exts = ['mp3', 'wav'];

// Friendly names for each ringback file
$sound_names = [
    'au-ring' => 'Australia',
    'ca-ring' => 'Canada',
    'cn-ring' => 'China',
    'default' => 'Default',
    'it-ring' => 'Italy',
    'pt-ring' => 'Portugal',
    'uk-ring' => 'UK',
    'us-ring' => 'USA'
];

$sounds = [];

if (is_dir($ringback_dir)) {
    foreach (scandir($ringback_dir) as $file) {
        // Skip hidden files and directories
        if ($file[0] === '.') continue;
        
        $info = pathinfo($file);
        $ext = strtolower($info['extension']);
        
        // Only include allowed file types
        if (in_array($ext, $allowed_exts)) {
            $filename = strtolower($info['filename']);
            
            // Use friendly name if available, otherwise generate from filename
            $label = isset($sound_names[$filename]) ? $sound_names[$filename] : ucfirst(str_replace('-', ' ', $filename));
            
            $sounds[] = [
                'value' => $file,
                'text' => $label
            ];
        }
    }
}

// Sort alphabetically by label using usort for custom comparison
usort($sounds, function($a, $b) {
    return strcmp(strtolower($a['text']), strtolower($b['text']));
});

echo json_encode($sounds);