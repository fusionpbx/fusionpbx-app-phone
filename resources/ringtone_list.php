<?php
/*
	FusionPBX Web Phone
	Ringtone Sound List Endpoint
*/
header('Content-Type: application/json');

$ringtone_dir = __DIR__ . '/sounds/ringtones';
$allowed_exts = ['mp3', 'wav'];

// Friendly names for each ringtone file
$ringtone_names = [
    'default' => 'Default',
    'classic' => 'Classic',
    'digital' => 'Digital',
    'gong' => 'Gong',
    'harpsichord' => 'Harpsichord',
    'inception' => 'Inception',
    'notification' => 'Notification',
    'pickup' => 'Pickup',
    'seagull' => 'Seagull'
];

$ringtones = [];

if (is_dir($ringtone_dir)) {
    foreach (scandir($ringtone_dir) as $file) {
        // Skip hidden files and directories
        if ($file[0] === '.') continue;
        
        $info = pathinfo($file);
        $ext = strtolower($info['extension']);
        
        // Only include allowed file types
        if (in_array($ext, $allowed_exts)) {
            $filename = strtolower($info['filename']);
            
            // Use friendly name if available, otherwise generate from filename
            $label = isset($ringtone_names[$filename]) ? $ringtone_names[$filename] : ucfirst(str_replace('-', ' ', $filename));
            
            $ringtones[] = [
                'value' => $file,
                'text' => $label
            ];
        }
    }
}

// Sort alphabetically by label using usort for custom comparison
usort($ringtones, function($a, $b) {
    return strcmp(strtolower($a['text']), strtolower($b['text']));
});

echo json_encode($ringtones);
