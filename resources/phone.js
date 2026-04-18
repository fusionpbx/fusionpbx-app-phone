
function sanitize_string(str) {
	let temp = document.createElement('div');
	temp.textContent = str;
	return temp.innerHTML;
}

// Audio call - initiates an audio-only outgoing call
function call_audio() {
	// Get destination
	var destination = document.getElementById('destination').value;
	if (destination.length == 0) {
		return;
	}

	// Call with audio only
	send_call(false);
}

// Video call - initiates a video outgoing call (checks camera first)
async function call_video() {
	// Check camera permissions first
	var has_camera = await check_camera_permissions();
	if (!has_camera) {
		alert('Camera access is not available.\n\nFalling back to audio call.\n\nThis phone app requires HTTPS to access your camera.\n\nMake sure:\n1. You are accessing this page via HTTPS\n2. Your browser has granted camera permissions');
		// Fall back to audio call
		call_audio();
		return;
	}

	// Get destination
	var destination = document.getElementById('destination').value;
	if (destination.length == 0) {
		return;
	}

	// Call with video
	send_call(true);
}

// Unified call function used by both call_audio() and call_video()
function send_call(use_video) {
	// Set the session state
	session_hungup = false;

	// Get the destination number
	destination = document.getElementById('destination').value;

	// Return immediately if there is no destination
	if (destination.length == 0) {
		return;
	}

	// Add to call history as outgoing
	add_to_history(destination, 'outgoing', Date.now(), use_video);

	// Show or hide the panels
	hide_all_panels();

	document.getElementById('active').style.display = "grid";

	// Update status bar
	var call_type = use_video ? 'Calling Video ' : 'Calling ';
	document.getElementById('status_text').textContent = call_type + destination;
	document.querySelector('#status_bar .status_icon i').className = use_video ? 'fas fa-video' : 'fas fa-phone';

	set_hangup_visibility(true);
	if (use_video) {
		document.getElementById('video_container').style.display = "block";
		document.getElementById('local_video').style.display = "inline";
		document.getElementById('remote_video').style.display = "inline";
	}
	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('unmute_audio').style.display = "none";
	document.getElementById('hold').style.display = "none";
	document.getElementById('unhold').style.display = "none";

	// Refresh options to get current video_enabled state
	var call_options = get_media_options(use_video);
	//make a call using a sip invite
	session = user_agent.invite('sip:'+destination+'@<?php echo $domain_name; ?>', call_options);
	var current_session = session;
	current_session.local_ended = false;
	current_session.outgoing_finalized = false;

	function finalize_outgoing_session() {
		if (current_session.outgoing_finalized) {
			return;
		}
		current_session.outgoing_finalized = true;
		stop_call_tone();
	}

	function handle_outgoing_terminal_status(status_text) {
		finalize_outgoing_session();
		handle_outgoing_session_failure(current_session, status_text);
	}

	start_call_tone('outgoing');

	current_session.on('progress', function() {
		if (!current_session.outgoing_finalized) {
			start_call_tone('outgoing');
		}
	});

	current_session.on('accepted', function() {
		finalize_outgoing_session();
		answer_time = Date.now();
		active_call_is_video = use_video;
		set_hangup_visibility(true);
		document.getElementById('mute_audio').style.display = "inline";
		document.getElementById('unmute_audio').style.display = "none";
		document.getElementById('hold').style.display = "inline";
		document.getElementById('unhold').style.display = "none";
		document.getElementById('mute_video').style.display = use_video ? "inline" : "none";
		document.getElementById('unmute_video').style.display = "none";
		set_call_action_mode(true, use_video);
		var remote_display_name = session.display_name || (session.remoteIdentity && session.remoteIdentity.displayName) || destination;
		var remote_number = session.uri_user || (session.remoteIdentity && session.remoteIdentity.uri && session.remoteIdentity.uri.user) || destination;
		active_call_display_name = remote_display_name;
		active_call_number = remote_number;
		update_video_stream_info(remote_display_name, remote_number, use_video);
		update_active_call_status(use_video, remote_display_name, remote_number);
	});

	current_session.on('bye', function() {
		finalize_outgoing_session();
		if (!current_session.local_ended) {
			reset_call_ui_state(true);
		}
	});

	current_session.on('failed', function() {
		handle_outgoing_terminal_status('Call failed');
	});

	current_session.on('rejected', function() {
		handle_outgoing_terminal_status('Call rejected');
	});

	current_session.on('cancel', function() {
		handle_outgoing_terminal_status('Call canceled');
	});

	current_session.on('terminated', function() {
		handle_outgoing_terminal_status('Call ended');
	});

	// Unmute the audio
	session.unmute({audio: true});

	// Wait until the call is answered before starting the timer
	answer_time = null;

	// Set the caller ID to the destination
	document.getElementById('ringing_caller_id').innerHTML = destination;
	document.getElementById('active_caller_id').innerHTML = destination;

	// Add the caller ID with video indicator if applicable
	var video_indicator = use_video ? "<div style='color: #1eba00; font-size: 0.7em;'><i class='fas fa-video'></i> Video Call</div>" : "";
	document.getElementById('ringing_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;
	document.getElementById('active_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;

	// Show or hide the panels
	document.getElementById('dialpad').style.display = "none";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "grid";

	// Show or hide the buttons
	document.getElementById('answer_audio').style.display = "none";
	document.getElementById('answer_video').style.display = "none";
	document.getElementById('decline').style.display = "none";
	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('mute_video').style.display = "none";

	// Clear destination field
	document.getElementById('destination').value = '';
}

// Check if an incoming SIP INVITE contains video capability
function detect_video_invite(session) {
	if (!session || !session.request_data) return false;
	// Check if the SIP INVITE contains video media type
	return session.request_data.indexOf('media="video"') !== -1 ||
			session.request_data.indexOf('a=rtpmap:98') !== -1;
}

// Check if camera permissions are available before attempting video calls
async function check_camera_permissions() {
	try {
		var constraints = { video: true, audio: false };
		var stream = await navigator.mediaDevices.getUserMedia(constraints);
		// Release the stream immediately after checking
		var tracks = stream.getTracks();
		tracks.forEach(track => track.stop());
		camera_available = true;
		return true;
	} catch (err) {
		console.warn('Camera access not available:', err.name, err.message);
		camera_available = false;
		return false;
	}
}

let user_agent;
let session;
let answer_time;
let session_hungup = false;
let last_call_type = 'audio';  // Remember last call type for Enter key
let camera_available = true;  // Camera availability status
let local_video_corner = 'top-right';
let call_tone_context;
let call_tone_interval;
let call_tone_timeout;
let active_call_tone_mode = null;
let registration_state = 'connecting';
let transient_status_timeout;
let active_call_is_video = false;
let active_call_display_name = '';
let active_call_number = '';
let active_panel = 'dialpad';
let active_conversation_id = null;
let messages_loaded_from_db = false;
let messages_load_in_progress = false;
let message_refresh_interval_id = null;
let sender_extension_options = Array.isArray((typeof phone_sender_extensions !== 'undefined') ? phone_sender_extensions : null) ? phone_sender_extensions : [];
let selected_sender_extension_uuid = String((typeof phone_selected_sender_extension_uuid !== 'undefined') ? phone_selected_sender_extension_uuid : '').trim();

let e2ee_private_key = null;
let e2ee_public_jwk = null;
let e2ee_device_uuid = '';
let e2ee_unlocked = false;

const message_conversations = [];
const can_delete_rooms = (typeof phone_can_delete_rooms !== 'undefined') ? !!phone_can_delete_rooms : false;

const known_chat_rooms = ['#ops-room', '#support', '#sales'];

const E2EE_PBKDF2_ITERATIONS = 260000;
const E2EE_SALT_BYTES = 16;
const E2EE_IV_BYTES = 12;
const E2EE_STORAGE_PREFIX = 'fusionpbx_phone_e2ee_v1_' + String(typeof phone_e2ee_user_uuid !== 'undefined' ? phone_e2ee_user_uuid : 'unknown') + '_';
const E2EE_VAULT_KEY = E2EE_STORAGE_PREFIX + 'vault';

function stop_call_tone() {
	const ringtone = document.getElementById('ringtone');
	if (ringtone) {
		ringtone.pause();
		ringtone.currentTime = 0;
	}

	if (call_tone_timeout) {
		clearTimeout(call_tone_timeout);
		call_tone_timeout = null;
	}

	if (call_tone_interval) {
		clearInterval(call_tone_interval);
		call_tone_interval = null;
	}

	active_call_tone_mode = null;
}

function play_generated_tone(mode) {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	if (!AudioContextClass) {
		return false;
	}

	if (!call_tone_context) {
		call_tone_context = new AudioContextClass();
	}

	if (call_tone_context.state === 'suspended') {
		call_tone_context.resume().catch(function() {});
	}

	const play_burst = function(frequencies, duration_ms) {
		const end_time = call_tone_context.currentTime + (duration_ms / 1000);
		frequencies.forEach(function(frequency) {
			const oscillator = call_tone_context.createOscillator();
			const gain = call_tone_context.createGain();
			oscillator.type = 'sine';
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0.0001, call_tone_context.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.03, call_tone_context.currentTime + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, end_time);
			oscillator.connect(gain);
			gain.connect(call_tone_context.destination);
			oscillator.start();
			oscillator.stop(end_time);
		});
	};

	const cadence = mode === 'outgoing'
		? { frequencies: [440, 480], burst_ms: 2000, cycle_ms: 6000 }
		: { frequencies: [425], burst_ms: 1000, cycle_ms: 3000 };

	play_burst(cadence.frequencies, cadence.burst_ms);
	call_tone_timeout = setTimeout(function() {
		call_tone_timeout = null;
	}, cadence.burst_ms);
	call_tone_interval = setInterval(function() {
		play_burst(cadence.frequencies, cadence.burst_ms);
	}, cadence.cycle_ms);

	return true;
}

function start_call_tone(mode) {
	if (active_call_tone_mode === mode) {
		return;
	}

	stop_call_tone();
	active_call_tone_mode = mode;

	const ringtone = document.getElementById('ringtone');
	if (ringtone && ringtone.querySelector('source')) {
		ringtone.loop = true;
		const play_promise = ringtone.play();
		if (play_promise && typeof play_promise.catch === 'function') {
			play_promise.catch(function() {
				stop_call_tone();
				active_call_tone_mode = mode;
				play_generated_tone(mode);
			});
		}
		return;
	}

	play_generated_tone(mode);
}

function show_status(text, icon_class) {
	document.getElementById('status_text').textContent = text;
	document.querySelector('#status_bar .status_icon i').className = icon_class;
}

function format_caller_id_for_status(display_name, number) {
	var safe_name = display_name ? sanitize_string(display_name) : '';
	var safe_number = number ? sanitize_string(number) : '';

	if (safe_name && safe_number && safe_name !== safe_number) {
		return safe_name + ' (' + safe_number + ')';
	}

	return safe_name || safe_number || 'Unknown';
}

function update_active_call_status(use_video, display_name, number, duration_text) {
	if (use_video) {
		var status_text = 'Video Call - ' + format_caller_id_for_status(display_name, number);
		if (duration_text) {
			status_text += ' - ' + duration_text;
		}
		show_status(status_text, 'fas fa-video');
		return;
	}

	show_status('Call in progress', 'fas fa-phone');
}

function sync_call_action_controls() {
	var action_mute = document.getElementById('action_mute');
	var action_hold = document.getElementById('action_hold');
	var action_video_mute = document.getElementById('action_video_mute');
	if (!action_mute || !action_hold) {
		return;
	}

	var action_mute_icon = document.getElementById('action_mute_icon');
	var action_mute_label = document.getElementById('action_mute_label');
	var action_hold_icon = document.getElementById('action_hold_icon');
	var action_hold_label = document.getElementById('action_hold_label');
	var action_video_mute_icon = document.getElementById('action_video_mute_icon');
	var action_video_mute_label = document.getElementById('action_video_mute_label');

	var muted = document.getElementById('unmute_audio').style.display === 'inline';
	var on_hold = document.getElementById('unhold').style.display === 'inline';

	if (action_mute_icon) {
		action_mute_icon.className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
	}
	if (action_mute_label) {
		action_mute_label.textContent = muted ? 'Unmute' : 'Mute';
	}
	action_mute.classList.toggle('action_item_toggle_active', muted);

	if (action_hold_icon) {
		action_hold_icon.className = on_hold ? 'fas fa-play' : 'fas fa-pause';
	}
	if (action_hold_label) {
		action_hold_label.textContent = on_hold ? 'Resume' : 'Hold';
	}
	action_hold.classList.toggle('action_item_toggle_active', on_hold);

	if (action_video_mute) {
		var local_video_wrapper = document.getElementById('local_video_wrapper');
		var local_video_hidden = !!(local_video_wrapper && local_video_wrapper.classList.contains('local_preview_hidden'));
		if (action_video_mute_icon) {
			action_video_mute_icon.className = local_video_hidden ? 'fas fa-video-slash' : 'fas fa-video';
		}
		if (action_video_mute_label) {
			action_video_mute_label.textContent = 'Local';
		}
		action_video_mute.classList.toggle('action_item_toggle_active', local_video_hidden);
	}
}

function set_call_action_mode(enabled, use_video) {
	document.body.classList.toggle('audio_call_mode', enabled && !use_video);

	var action_mute = document.getElementById('action_mute');
	var action_hold = document.getElementById('action_hold');
	var action_video_mute = document.getElementById('action_video_mute');
	if (action_mute) {
		action_mute.style.display = enabled ? 'flex' : 'none';
	}
	if (action_hold) {
		action_hold.style.display = enabled ? 'flex' : 'none';
	}
	if (action_video_mute) {
		action_video_mute.style.display = enabled && use_video ? 'flex' : 'none';
	}

	if (enabled) {
		sync_call_action_controls();
	}
}

function toggle_audio_mute_action() {
	if (!session) { return; }
	if (document.getElementById('unmute_audio').style.display === 'inline') {
		unmute_audio();
	}
	else {
		mute_audio();
	}
}

function toggle_audio_hold_action() {
	if (!session) { return; }
	if (document.getElementById('unhold').style.display === 'inline') {
		unhold();
	}
	else {
		hold();
	}
}

function toggle_video_mute_action() {
	if (!session || !active_call_is_video) { return; }
	var local_video_wrapper = document.getElementById('local_video_wrapper');
	if (!local_video_wrapper) {
		return;
	}

	local_video_wrapper.classList.toggle('local_preview_hidden');
	sync_call_action_controls();
}

function apply_video_fit_layout() {
	var remote_video = document.getElementById('remote_video');
	if (!remote_video) {
		return;
	}

	remote_video.style.objectFit = 'contain';
	remote_video.style.width = '100%';
	remote_video.style.height = '100%';
	remote_video.style.maxWidth = '100%';
	remote_video.style.maxHeight = '100%';
}

function update_video_stream_info(display_name, number, show_info) {
	var info = document.getElementById('video_stream_info');
	if (!info) {
		return;
	}

	if (!show_info) {
		info.innerHTML = '';
		return;
	}

	var safe_name = display_name ? sanitize_string(display_name) : '';
	var safe_number = number ? sanitize_string(number) : '';
	if (safe_name && safe_number) {
		info.innerHTML = safe_name + '<br>' + safe_number;
	}
	else {
		info.innerHTML = safe_name || safe_number;
	}
}

function clear_transient_status() {
	if (transient_status_timeout) {
		clearTimeout(transient_status_timeout);
		transient_status_timeout = null;
	}
}

function update_idle_status() {
	if (session && session.status && session.status !== SIP.Session.C.STATUS_TERMINATED) {
		return;
	}

	var camera_status = camera_available ? '' : ' (Camera unavailable)';
	if (registration_state === 'registered') {
		show_status('Ready' + camera_status, 'fas fa-circle');
	}
	else if (registration_state === 'connecting') {
		show_status('Connecting' + camera_status, 'fas fa-circle-notch');
	}
	else if (registration_state === 'failed') {
		show_status('Registration failed', 'fas fa-exclamation-circle');
	}
	else {
		show_status('Disconnected', 'fas fa-exclamation-circle');
	}
}

function show_temporary_status(text, icon_class) {
	clear_transient_status();
	show_status(text, icon_class);
	transient_status_timeout = setTimeout(function() {
		transient_status_timeout = null;
		update_idle_status();
	}, 4000);
}

function handle_outgoing_session_failure(current_session, status_text) {
	stop_call_tone();
	if (current_session && current_session.local_ended) {
		return;
	}
	reset_call_ui_state(true);
	show_temporary_status(status_text, 'fas fa-exclamation-circle');
}

var config = {
	uri: '<?php echo $user_extension."@".$domain_name; ?>',
	ws_servers: 'wss://<?php echo $domain_name; ?>:7443',
	authorizationUser: phone_registered_extension,
	password: atob('<?php echo base64_encode($user_password); ?>'),
	registerExpires: 120,
	displayName: phone_registered_display_name
};

user_agent = new SIP.UA(config);

// Connection status handling
user_agent.on('connected', function() {
	registration_state = 'connecting';
	update_idle_status();
});

user_agent.on('registered', function() {
	registration_state = 'registered';
	update_idle_status();
});

user_agent.on('unregistered', function() {
	registration_state = 'disconnected';
	update_idle_status();
});

user_agent.on('registrationFailed', function() {
	registration_state = 'failed';
	update_idle_status();
});

user_agent.on('disconnected', function() {
	registration_state = 'disconnected';
	stop_call_tone();
	update_status_bar();
});

user_agent.on('failed', function() {
	registration_state = 'disconnected';
	stop_call_tone();
	update_status_bar();
});

user_agent.on('message', function(event) {
	if (!event || event.originator === 'local') {
		return;
	}
	handle_incoming_sip_message(event.message || event);
});

function update_status_bar() {
	update_idle_status();
}

function is_session_active() {
	return !!(session && session.status !== SIP.Session.C.STATUS_TERMINATED);
}

function set_hangup_visibility(is_visible) {
	document.getElementById('hangup').style.display = is_visible ? 'flex' : 'none';
}

function reset_call_ui_state(show_dialpad) {
	if (show_dialpad === undefined) {
		show_dialpad = true;
	}

	stop_call_tone();

	reset_media();

	document.getElementById('dialpad').style.display = show_dialpad ? "grid" : "none";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "none";

	document.getElementById('answer_audio').style.display = "none";
	document.getElementById('answer_video').style.display = "none";
	document.getElementById('decline').style.display = "none";
	set_hangup_visibility(false);

	document.getElementById('video_container').style.display = "none";
	document.getElementById('local_video_wrapper').classList.remove('local_preview_hidden');
	document.getElementById('local_video').style.display = "inline";
	document.getElementById('remote_video').style.display = "inline";

	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('unmute_audio').style.display = "none";
	document.getElementById('mute_video').style.display = "none";
	document.getElementById('unmute_video').style.display = "none";

	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";

	document.getElementById('ringing_caller_id').innerHTML = '';
	document.getElementById('active_caller_id').innerHTML = '';
	update_video_stream_info('', '', false);
	document.getElementById('answer_time').innerHTML = '00:00:00';
	set_call_action_mode(false, false);
	active_call_is_video = false;
	active_call_display_name = '';
	active_call_number = '';

	answer_time = null;
	session_hungup = false;
	session = null;

	clear_transient_status();
	update_idle_status();
}

function cycle_local_video_corner() {
	var local_wrapper = document.getElementById('local_video_wrapper');
	if (!local_wrapper) {
		return;
	}

	var corner_order = ['top-right', 'top-left', 'bottom-left', 'bottom-right'];
	var next_index = (corner_order.indexOf(local_video_corner) + 1) % corner_order.length;
	local_video_corner = corner_order[next_index];

	local_wrapper.classList.remove('corner-top-right', 'corner-top-left', 'corner-bottom-left', 'corner-bottom-right');
	local_wrapper.classList.add('corner-' + local_video_corner);
}

// Contacts data loaded from phone.php
var contacts = Array.isArray((typeof phone_contacts !== 'undefined') ? phone_contacts : null)
	? phone_contacts.slice()
	: [];

// Call history storage
function get_call_history() {
	try {
		var stored = localStorage.getItem('call_history');
		return stored ? JSON.parse(stored) : [];
	} catch(e) {
		return [];
	}
}

function save_call_history(history) {
	try {
		localStorage.setItem('call_history', JSON.stringify(history));
	} catch(e) {
		console.log('Could not save call history');
	}
}

function add_to_history(number, call_type, timestamp, is_video) {
	var history = get_call_history();
	var entry = {
		id: Date.now(),
		number: number,
		call_type: call_type,  // 'outgoing', 'incoming', 'missed'
		timestamp: timestamp,
		duration: 0,
		is_video: is_video || false  // Track if this was a video call
	};
	history.unshift(entry);  // Add to beginning

	// Keep only last 100 entries
	if (history.length > 100) {
		history = history.slice(0, 100);
	}
	save_call_history(history);
	return entry;
}

// Function to generate media options based on use_video parameter
function get_media_options(use_video) {
	return {
		media: {
			constraints: {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				video: use_video
			},
			render: {
				remote: document.getElementById('remote_video'),
				local: document.getElementById('local_video')
			},
			RTCConstraints: {
				"optional": [{ 'DtlsSrtpKeyAgreement': 'true'} ]
			}
		}
	};
}

// Answer
user_agent.on('invite', function (s) {

	if (is_session_active()) {
		s.reject();
		return;
	}

	// Save the session to the global session
	session = s;
	session.display_name = session.remoteIdentity.displayName;
	session.uri_user = session.remoteIdentity.uri.user;
	session.incoming_number = session.remoteIdentity.uri.user || session.remoteIdentity.displayName;
	session.has_video = detect_video_invite(s);

	// Send the object to the browser console
	//console.log(session);

	// Update status bar for incoming call
	var incoming_type = session.has_video ? 'Incoming Video Call' : 'Incoming Call';
	document.getElementById('status_text').textContent = incoming_type;
	document.querySelector('#status_bar .status_icon i').className = session.has_video ? 'fas fa-video' : 'fas fa-phone-volume';

	// Play the ringtone
	start_call_tone('incoming');

	// Open the dashboard window to search for caller ID if enabled
	if (dashboard_enabled) {
		const dashboard_url = dashboard_url_base + sanitize_string(session.uri_user);
		window.open(dashboard_url, dashboard_target, window_parameters);
	}

	// Add the caller ID with video indicator if applicable
	var video_indicator = session.has_video ? "<div style='color: #1eba00; font-size: 0.7em;'><i class='fas fa-video'></i> Video Call</div>" : "";
	document.getElementById('ringing_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;
	document.getElementById('active_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;
	update_video_stream_info(session.display_name, session.uri_user, session.has_video);

	// Show or hide the panels
	document.getElementById('dialpad').style.display = "none";
	document.getElementById('ringing').style.display = "inline";

	// Show or hide the buttons
	document.getElementById('answer_audio').style.display = "inline";
	document.getElementById('answer_video').style.display = "inline";
	document.getElementById('decline').style.display = "inline";
	set_hangup_visibility(false);
	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('mute_video').style.display = "none";

	session.on('cancel', function (s) {
		// Record missed call
		if (session.incoming_number) {
			add_to_history(session.incoming_number, 'missed', Date.now());
		}

		reset_call_ui_state(true);
	});

	session.on('bye', function (s) {
		reset_call_ui_state(true);
	});

	session.on('failed', function (s) {
		reset_call_ui_state(true);
	});

	session.on('rejected', function (s) {
		// Record missed call
		if (session.incoming_number) {
			add_to_history(session.incoming_number, 'missed', Date.now());
		}

		reset_call_ui_state(true);
	});

});

// Answer incoming call with audio only
function answer_audio(use_video) {
	if (arguments.length === 0) { use_video = false; }
	// Answer the call with video setting determined by caller (use_video parameter)
	answer_call(use_video);
}

// Answer incoming call with video (checks camera first)
async function answer_video(use_video) {
	if (arguments.length === 0) { use_video = true; }
	// Check camera permissions first
	var has_camera = await check_camera_permissions();
	if (!has_camera) {
		alert('Camera access is not available.\n\nFalling back to audio call.\n\nThis phone app requires HTTPS to access your camera.');
		// Fall back to audio answer
		answer_call(false);
		return;
	}

	// Answer the call with video
	answer_call(true);
}

// Unified answer function used by both answer_audio() and answer_video()
function answer_call(use_video) {
	// Set the session state
	session_hungup = false;

	// Continue if the session exists
	if (!session) {
		return false;
	}

	// Record incoming call to history
	if (session.incoming_number) {
		add_to_history(session.incoming_number, 'incoming', Date.now(), use_video);
	}

	// Start the answer time
	answer_time = Date.now();

	// Pause the ringtone
	stop_call_tone();

	// Answer the call with specified video settings
	var answer_media = {
		media: {
			constraints: {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				video: use_video
			},
			render: {
				remote: document.getElementById('remote_video'),
				local: document.getElementById('local_video')
			},
			RTCConstraints: {
				"optional": [{ 'DtlsSrtpKeyAgreement': 'true'} ]
			}
		}
	};
	session.accept(answer_media);

	// Show the or hide the panels
	document.getElementById('dialpad').style.display = "none";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "grid";
	document.getElementById('destination').value = '';

	// Show or hide the buttons
	document.getElementById('answer_audio').style.display = "none";
	document.getElementById('answer_video').style.display = "none";
	document.getElementById('decline').style.display = "none";
	document.getElementById('mute_audio').style.display = "inline";
	document.getElementById('unmute_audio').style.display = "none";
	document.getElementById('mute_video').style.display = use_video ? "inline" : "none";
	document.getElementById('unmute_video').style.display = "none";
	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";
	active_call_is_video = use_video;
	set_call_action_mode(true, use_video);
	set_hangup_visibility(true);
	active_call_display_name = session.display_name || session.incoming_number || '';
	active_call_number = session.uri_user || session.incoming_number || '';
	update_video_stream_info(session.display_name, session.uri_user, use_video);

	// Show video if enabled
	if (use_video) {
		document.getElementById('video_container').style.display = "block";
		document.getElementById('local_video_wrapper').classList.remove('local_preview_hidden');
		document.getElementById('local_video').style.display = "inline";
		document.getElementById('remote_video').style.display = "inline";
		apply_video_fit_layout();
	}

	// Update status bar for active call
	if (session.incoming_number) {
		update_active_call_status(use_video, session.display_name || session.incoming_number, session.uri_user || session.incoming_number);
	}
	else {
		update_active_call_status(use_video, session.display_name, session.uri_user);
	}
}

// Function to pad numbers with leading zeros
function pad(number, length) {
	return (number < 10 ? '0' : '') + number;
}

// Navigation functions to show different panels
function hide_all_panels() {
	document.getElementById('dialpad').style.display = 'none';
	//document.getElementById('keypad').style.display = 'none';
	document.getElementById('contacts').style.display = 'none';
	document.getElementById('history').style.display = 'none';
	document.getElementById('messages').style.display = 'none';
	document.getElementById('ringing').style.display = 'none';
	document.getElementById('active').style.display = 'none';
}

function show_dialpad() {
	hide_all_panels();
	document.getElementById('dialpad').style.display = 'grid';
	update_action_bar_state('dialpad');
}

function show_contacts() {
	hide_all_panels();
	render_contacts();
	if (!Array.isArray(contacts) || contacts.length === 0) {
		container.innerHTML = '<div style="text-align: center; color: #ccc; padding: 30px; font-size: 15px;">No contacts found for this domain</div>';
		return;
	}
	document.getElementById('contacts').style.display = 'flex';
	update_action_bar_state('contacts');
		var destination = normalize_message_destination(contact && (contact.destination || contact.extension));
		if (!destination) {
			return;
		}
		var label = String(contact && contact.name ? contact.name : '').trim() || destination;
		var extension_label = String(contact && contact.extension ? contact.extension : destination).trim() || destination;

}

		contactDiv.onclick = function() { call_contact(destination); };
	hide_all_panels();
	render_history();
	document.getElementById('history').style.display = 'flex';
	update_action_bar_state('history');
		contact_html += '      <div class="contact_extension">' + sanitize_string(extension_label) + '</div>';
		contact_html += '      <div class="contact_name">' + sanitize_string(label) + '</div>';
		contact_html += '  </div>';
		contact_html += '  <div class="contact_actions">';
		contact_html += '      <button type="button" class="contact_action_button contact_call" title="Call" onclick="event.stopPropagation(); call_contact(\'' + sanitize_string(destination) + '\');"><i class="fas fa-phone"></i></button>';
		contact_html += '      <button type="button" class="contact_action_button contact_message" title="Message" onclick="event.stopPropagation(); message_contact(\'' + sanitize_string(destination) + '\');"><i class="fas fa-comment-dots"></i></button>';
function render_sender_extension_selector() {
	var sender_context = document.getElementById('thread_sender_context');
	var sender_select = document.getElementById('message_sender_extension');
	if (!sender_context || !sender_select) {
		return;
	}

	var options = Array.isArray(sender_extension_options) ? sender_extension_options : [];
	if (options.length === 0) {
		sender_select.innerHTML = '';
		sender_context.style.display = 'none';
		selected_sender_extension_uuid = '';
		return;
	}

	var selected_exists = false;
	options.forEach(function(option) {
		if (String(option.extension_uuid || '') === selected_sender_extension_uuid) {
			selected_exists = true;
		}
	});
	if (!selected_exists) {
		selected_sender_extension_uuid = String(options[0].extension_uuid || '');
	}

	sender_select.innerHTML = '';
	options.forEach(function(option) {
		var extension_uuid = String(option.extension_uuid || '');
		if (!extension_uuid) {
			return;
		}
		var item = document.createElement('option');
		item.value = extension_uuid;
		item.textContent = String(option.label || option.extension || extension_uuid);
		if (extension_uuid === selected_sender_extension_uuid) {
			item.selected = true;
		}
		sender_select.appendChild(item);
	});

	sender_context.style.display = options.length > 1 ? 'flex' : 'none';
}

async function load_sender_extensions() {
	try {
		var result = await get_message_api('sender_extensions', {});
		if (result && result.status === 'ok') {
			sender_extension_options = Array.isArray(result.extensions) ? result.extensions : [];
			selected_sender_extension_uuid = String(result.selected_extension_uuid || '').trim();
		}
	}
	catch (error) {
		// Keep existing sender extension state if API call fails.
	}

	render_sender_extension_selector();
}

async function set_selected_sender_extension(extension_uuid) {
	var normalized_extension_uuid = String(extension_uuid || '').trim();
	if (!normalized_extension_uuid) {
		return;
	}

	try {
		var result = await post_message_api({
			action: 'set_sender_extension',
			extension_uuid: normalized_extension_uuid
		});
		if (!result || result.status !== 'ok') {
			show_temporary_status((result && result.message) ? result.message : 'Could not set sender extension', 'fas fa-exclamation-circle');
			return;
		}

		selected_sender_extension_uuid = String(result.selected_extension_uuid || normalized_extension_uuid);
		render_sender_extension_selector();
	}
	catch (error) {
		show_temporary_status('Could not set sender extension', 'fas fa-exclamation-circle');
	}
}

async function show_messages() {
	var unlocked = false;
	try {
		unlocked = await ensure_e2ee_unlocked();
	}
	catch (error) {
		unlocked = false;
	}

	if (!unlocked) {
		return;
	}

	await load_sender_extensions();

	hide_all_panels();
	load_messages_from_database();
	render_messages_sidebar();
	document.getElementById('messages').style.display = 'flex';
	update_action_bar_state('messages');
}

function post_message_api(payload) {
	return fetch('resources/messages.php', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
		},
		credentials: 'same-origin',
		body: new URLSearchParams(payload).toString()
	}).then(function(response) {
		return response.json().catch(function() {
			return {
				status: 'error',
				message: 'Invalid server response'
			};
		});
	});
}

function get_message_api(action, params) {
	var query = new URLSearchParams(Object.assign({ action: action }, params || {}));
	return fetch('resources/messages.php?' + query.toString(), {
		method: 'GET',
		credentials: 'same-origin'
	}).then(function(response) {
		return response.json().catch(function() {
			return {
				status: 'error',
				message: 'Invalid server response'
			};
		});
	});
}

function bytes_to_base64(bytes) {
	var binary = '';
	var array = new Uint8Array(bytes);
	for (var i = 0; i < array.length; i++) {
		binary += String.fromCharCode(array[i]);
	}
	return btoa(binary);
}

function base64_to_bytes(base64_value) {
	var binary = atob(String(base64_value || ''));
	var bytes = new Uint8Array(binary.length);
	for (var i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function generate_uuid() {
	if (window.crypto && window.crypto.randomUUID) {
		return window.crypto.randomUUID();
	}

	var template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
	return template.replace(/[xy]/g, function(char) {
		var random = Math.random() * 16 | 0;
		var value = char === 'x' ? random : ((random & 0x3) | 0x8);
		return value.toString(16);
	});
}

function read_e2ee_vault() {
	var raw = localStorage.getItem(E2EE_VAULT_KEY);
	if (!raw) {
		return null;
	}

	try {
		var parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}
		return parsed;
	}
	catch (error) {
		return null;
	}
}

function write_e2ee_vault(vault) {
	localStorage.setItem(E2EE_VAULT_KEY, JSON.stringify(vault));
}

async function sha256_hex(input) {
	var input_bytes = new TextEncoder().encode(String(input || ''));
	var digest = await window.crypto.subtle.digest('SHA-256', input_bytes);
	var bytes = new Uint8Array(digest);
	var parts = [];
	for (var i = 0; i < bytes.length; i++) {
		parts.push(bytes[i].toString(16).padStart(2, '0'));
	}
	return parts.join('');
}

async function derive_password_key(password, salt_bytes) {
	var base_key = await window.crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		{ name: 'PBKDF2' },
		false,
		['deriveKey']
	);

	return window.crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: salt_bytes,
			iterations: E2EE_PBKDF2_ITERATIONS,
			hash: 'SHA-256'
		},
		base_key,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

async function encrypt_private_key_for_storage(private_key_bytes, password) {
	var salt = window.crypto.getRandomValues(new Uint8Array(E2EE_SALT_BYTES));
	var iv = window.crypto.getRandomValues(new Uint8Array(E2EE_IV_BYTES));
	var wrap_key = await derive_password_key(password, salt);
	var encrypted = await window.crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: iv },
		wrap_key,
		private_key_bytes
	);

	return {
		salt: bytes_to_base64(salt),
		iv: bytes_to_base64(iv),
		ciphertext: bytes_to_base64(encrypted)
	};
}

async function decrypt_private_key_from_storage(vault, password) {
	var salt = base64_to_bytes(vault.salt || '');
	var iv = base64_to_bytes(vault.iv || '');
	var ciphertext = base64_to_bytes(vault.ciphertext || '');
	var wrap_key = await derive_password_key(password, salt);
	var decrypted = await window.crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: iv },
		wrap_key,
		ciphertext
	);
	return new Uint8Array(decrypted);
}

async function derive_session_key() {
	var material = String(typeof phone_e2ee_session_unlock_key !== 'undefined' ? phone_e2ee_session_unlock_key : '').trim();
	if (!material) {
		return null;
	}

	var digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
	return window.crypto.subtle.importKey(
		'raw',
		digest,
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	);
}

async function encrypt_private_key_for_session(private_key_bytes) {
	var session_key = await derive_session_key();
	if (!session_key) {
		return null;
	}

	var iv = window.crypto.getRandomValues(new Uint8Array(E2EE_IV_BYTES));
	var ciphertext = await window.crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: iv },
		session_key,
		private_key_bytes
	);

	return {
		session_iv: bytes_to_base64(iv),
		session_ciphertext: bytes_to_base64(ciphertext)
	};
}

async function decrypt_private_key_from_session(vault) {
	if (!vault || !vault.session_iv || !vault.session_ciphertext) {
		return null;
	}

	var session_key = await derive_session_key();
	if (!session_key) {
		return null;
	}

	try {
		var decrypted = await window.crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: base64_to_bytes(vault.session_iv) },
			session_key,
			base64_to_bytes(vault.session_ciphertext)
		);
		return new Uint8Array(decrypted);
	}
	catch (error) {
		return null;
	}
}

async function register_e2ee_device(rotate_other_devices) {
	if (!e2ee_device_uuid || !e2ee_public_jwk) {
		return false;
	}

	var result = await post_message_api({
		action: 'register_device',
		device_uuid: e2ee_device_uuid,
		public_key_jwk: JSON.stringify(e2ee_public_jwk),
		key_fingerprint: await sha256_hex(JSON.stringify(e2ee_public_jwk)),
		device_label: String(typeof phone_e2ee_default_device_label !== 'undefined' ? phone_e2ee_default_device_label : 'Browser Device').substring(0, 250),
		rotate_other_devices: rotate_other_devices ? 'true' : 'false'
	});

	return !!(result && result.status === 'ok');
}

async function create_new_e2ee_vault(password, rotate_other_devices) {
	var key_pair = await window.crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveBits']
	);

	var private_key_bytes = new Uint8Array(await window.crypto.subtle.exportKey('pkcs8', key_pair.privateKey));
	var public_jwk = await window.crypto.subtle.exportKey('jwk', key_pair.publicKey);
	var encrypted_private = await encrypt_private_key_for_storage(private_key_bytes, password);
	var session_wrapped_private = await encrypt_private_key_for_session(private_key_bytes);
	var vault = {
		device_uuid: generate_uuid(),
		public_jwk: public_jwk,
		salt: encrypted_private.salt,
		iv: encrypted_private.iv,
		ciphertext: encrypted_private.ciphertext,
		session_iv: session_wrapped_private ? session_wrapped_private.session_iv : '',
		session_ciphertext: session_wrapped_private ? session_wrapped_private.session_ciphertext : '',
		created_at: Date.now()
	};

	write_e2ee_vault(vault);
	e2ee_private_key = key_pair.privateKey;
	e2ee_public_jwk = public_jwk;
	e2ee_device_uuid = vault.device_uuid;
	e2ee_unlocked = true;

	await register_e2ee_device(rotate_other_devices);
}

async function unlock_existing_e2ee_vault(vault, password) {
	var private_key_bytes = await decrypt_private_key_from_storage(vault, password);
	e2ee_private_key = await window.crypto.subtle.importKey(
		'pkcs8',
		private_key_bytes,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		['deriveBits']
	);
	e2ee_public_jwk = vault.public_jwk;
	e2ee_device_uuid = vault.device_uuid;
	e2ee_unlocked = true;

	// Backfill session wrapper so subsequent sends in this login can unlock silently.
	var session_wrapped_private = await encrypt_private_key_for_session(private_key_bytes);
	if (session_wrapped_private) {
		vault.session_iv = session_wrapped_private.session_iv;
		vault.session_ciphertext = session_wrapped_private.session_ciphertext;
		write_e2ee_vault(vault);
	}

	await register_e2ee_device(false);
}

function prompt_password_modal(title, message, options) {
	options = options || {};
	return new Promise(function(resolve) {
		var existing_overlay = document.getElementById('e2ee_password_overlay');
		if (existing_overlay) {
			existing_overlay.remove();
		}

		var overlay = document.createElement('div');
		overlay.id = 'e2ee_password_overlay';
		overlay.style.position = 'fixed';
		overlay.style.inset = '0';
		overlay.style.background = 'rgba(0,0,0,0.55)';
		overlay.style.display = 'flex';
		overlay.style.alignItems = 'center';
		overlay.style.justifyContent = 'center';
		overlay.style.zIndex = '100000';

		var panel = document.createElement('div');
		panel.style.width = 'min(440px, calc(100vw - 32px))';
		panel.style.background = '#1f1f1f';
		panel.style.border = '1px solid rgba(255,255,255,0.12)';
		panel.style.borderRadius = '10px';
		panel.style.boxShadow = '0 16px 44px rgba(0,0,0,0.4)';
		panel.style.padding = '16px';
		panel.style.color = '#f2f2f2';

		var heading = document.createElement('div');
		heading.textContent = title;
		heading.style.fontSize = '16px';
		heading.style.fontWeight = '700';
		heading.style.marginBottom = '8px';

		var description = document.createElement('div');
		description.textContent = message;
		description.style.fontSize = '13px';
		description.style.color = '#d2d2d2';
		description.style.marginBottom = '12px';

		var input = document.createElement('input');
		input.type = 'password';
		input.autocomplete = options.autocomplete || 'new-password';
		input.setAttribute('data-lpignore', 'true');
		input.setAttribute('data-1p-ignore', 'true');
		input.setAttribute('autocorrect', 'off');
		input.setAttribute('autocapitalize', 'off');
		input.setAttribute('spellcheck', 'false');
		input.placeholder = options.placeholder || 'Password';
		input.style.width = '100%';
		input.style.padding = '10px 12px';
		input.style.borderRadius = '8px';
		input.style.border = '1px solid rgba(255,255,255,0.22)';
		input.style.background = 'rgba(255,255,255,0.07)';
		input.style.color = '#fff';
		input.style.fontSize = '14px';

		var actions = document.createElement('div');
		actions.style.display = 'flex';
		actions.style.justifyContent = 'flex-end';
		actions.style.gap = '8px';
		actions.style.marginTop = '12px';

		var cancel_btn = document.createElement('button');
		cancel_btn.type = 'button';
		cancel_btn.textContent = 'Cancel';
		cancel_btn.style.padding = '8px 12px';
		cancel_btn.style.borderRadius = '8px';
		cancel_btn.style.border = '1px solid rgba(255,255,255,0.2)';
		cancel_btn.style.background = 'rgba(255,255,255,0.08)';
		cancel_btn.style.color = '#fff';
		cancel_btn.style.cursor = 'pointer';

		var submit_btn = document.createElement('button');
		submit_btn.type = 'button';
		submit_btn.textContent = options.submitLabel || 'Unlock';
		submit_btn.style.padding = '8px 12px';
		submit_btn.style.borderRadius = '8px';
		submit_btn.style.border = '1px solid rgba(0,167,196,0.65)';
		submit_btn.style.background = 'rgba(0,167,196,0.22)';
		submit_btn.style.color = '#fff';
		submit_btn.style.cursor = 'pointer';

		actions.appendChild(cancel_btn);
		actions.appendChild(submit_btn);

		panel.appendChild(heading);
		panel.appendChild(description);
		panel.appendChild(input);
		panel.appendChild(actions);
		overlay.appendChild(panel);
		document.body.appendChild(overlay);

		var settled = false;
		var close_modal = function(value) {
			if (settled) {
				return;
			}
			settled = true;
			overlay.remove();
			resolve(value);
		};

		cancel_btn.addEventListener('click', function() {
			close_modal(null);
		});

		submit_btn.addEventListener('click', function() {
			close_modal(input.value);
		});

		overlay.addEventListener('click', function(event) {
			if (event.target === overlay) {
				close_modal(null);
			}
		});

		input.addEventListener('keydown', function(event) {
			if (event.key === 'Enter') {
				event.preventDefault();
				close_modal(input.value);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				close_modal(null);
			}
		});

		setTimeout(function() {
			input.focus();
		}, 10);
	});
}

async function ensure_e2ee_unlocked() {
	if (e2ee_unlocked && e2ee_private_key && e2ee_public_jwk && e2ee_device_uuid) {
		return true;
	}

	if (!window.crypto || !window.crypto.subtle) {
		show_temporary_status('Browser does not support WebCrypto', 'fas fa-exclamation-circle');
		return false;
	}

	var vault = read_e2ee_vault();
	if (!vault) {
		var password_create = await prompt_password_modal(
			'Create Encryption Password',
			'Set the password used to unlock this device key.',
			{ autocomplete: 'new-password', placeholder: 'Create password', submitLabel: 'Create' }
		);
		if (!password_create) {
			show_temporary_status('Encryption setup canceled', 'fas fa-exclamation-circle');
			return false;
		}
		var password_confirm = await prompt_password_modal(
			'Confirm Encryption Password',
			'Re-enter your password to confirm.',
			{ autocomplete: 'new-password', placeholder: 'Confirm password', submitLabel: 'Confirm' }
		);
		if (!password_confirm || password_create !== password_confirm) {
			show_temporary_status('Passwords did not match', 'fas fa-exclamation-circle');
			return false;
		}

		try {
			await create_new_e2ee_vault(password_create, true);
			show_temporary_status('Encryption key created for this device', 'fas fa-lock');
			return true;
		}
		catch (error) {
			show_temporary_status('Could not create device encryption key', 'fas fa-exclamation-circle');
			return false;
		}
	}

	// Silent unlock path for active authenticated session.
	var session_private_key_bytes = await decrypt_private_key_from_session(vault);
	if (session_private_key_bytes) {
		try {
			e2ee_private_key = await window.crypto.subtle.importKey(
				'pkcs8',
				session_private_key_bytes,
				{ name: 'ECDH', namedCurve: 'P-256' },
				false,
				['deriveBits']
			);
			e2ee_public_jwk = vault.public_jwk;
			e2ee_device_uuid = vault.device_uuid;
			e2ee_unlocked = true;
			await register_e2ee_device(false);
			return true;
		}
		catch (error) {
			vault.session_iv = '';
			vault.session_ciphertext = '';
			write_e2ee_vault(vault);
		}
	}

	var unlock_attempt = 0;
	while (unlock_attempt < 3) {
		var unlock_message = unlock_attempt === 0
			? 'Enter your password to unlock this device key.'
			: 'Password was incorrect. Try again to unlock this device key.';

		var password_unlock = await prompt_password_modal(
			'Unlock Encrypted Messages',
			unlock_message,
			{ autocomplete: 'current-password', placeholder: 'Password', submitLabel: 'Unlock' }
		);
		if (!password_unlock) {
			show_temporary_status('Encryption unlock canceled', 'fas fa-exclamation-circle');
			return false;
		}

		try {
			await unlock_existing_e2ee_vault(vault, password_unlock);
			return true;
		}
		catch (error) {
			// Ensure there is no stale key state before another attempt.
			e2ee_private_key = null;
			e2ee_public_jwk = null;
			e2ee_device_uuid = null;
			e2ee_unlocked = false;
			unlock_attempt++;
		}
	}

	show_temporary_status('Invalid password or key data', 'fas fa-exclamation-circle');
	return false;
}

async function derive_shared_wrap_key(peer_public_jwk) {
	var peer_public_key = await window.crypto.subtle.importKey(
		'jwk',
		peer_public_jwk,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);

	var shared_bits = await window.crypto.subtle.deriveBits(
		{ name: 'ECDH', public: peer_public_key },
		e2ee_private_key,
		256
	);

	return window.crypto.subtle.importKey(
		'raw',
		shared_bits,
		{ name: 'AES-GCM' },
		false,
		['encrypt', 'decrypt']
	);
}

async function encrypt_message_envelope(plaintext, recipient_devices) {
	var content_key = await window.crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);
	var content_key_raw = await window.crypto.subtle.exportKey('raw', content_key);
	var content_iv = window.crypto.getRandomValues(new Uint8Array(E2EE_IV_BYTES));
	var ciphertext = await window.crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: content_iv },
		content_key,
		new TextEncoder().encode(plaintext)
	);

	var recipient_keys = [];
	for (var i = 0; i < recipient_devices.length; i++) {
		var device = recipient_devices[i];
		if (!device || !device.phone_device_uuid || !device.public_key_jwk) {
			continue;
		}

		var peer_jwk;
		try {
			peer_jwk = typeof device.public_key_jwk === 'string'
				? JSON.parse(device.public_key_jwk)
				: device.public_key_jwk;
		}
		catch (error) {
			continue;
		}

		var wrap_key = await derive_shared_wrap_key(peer_jwk);
		var wrapped_iv = window.crypto.getRandomValues(new Uint8Array(E2EE_IV_BYTES));
		var wrapped_key_cipher = await window.crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: wrapped_iv },
			wrap_key,
			content_key_raw
		);

		recipient_keys.push({
			recipient_device_uuid: device.phone_device_uuid,
			wrapped_key: bytes_to_base64(wrapped_key_cipher),
			wrapped_iv: bytes_to_base64(wrapped_iv)
		});
	}

	return {
		ciphertext: bytes_to_base64(ciphertext),
		content_iv: bytes_to_base64(content_iv),
		recipient_keys: recipient_keys
	};
}

async function decrypt_message_row(row) {
	var sender_public_jwk;
	try {
		sender_public_jwk = typeof row.sender_public_key_jwk === 'string'
			? JSON.parse(row.sender_public_key_jwk)
			: row.sender_public_key_jwk;
	}
	catch (error) {
		return null;
	}

	var wrap_key = await derive_shared_wrap_key(sender_public_jwk);
	var wrapped_key_raw = await window.crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64_to_bytes(row.wrapped_iv || '') },
		wrap_key,
		base64_to_bytes(row.wrapped_key || '')
	);
	var content_key = await window.crypto.subtle.importKey(
		'raw',
		wrapped_key_raw,
		{ name: 'AES-GCM' },
		false,
		['decrypt']
	);
	var plaintext_bytes = await window.crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64_to_bytes(row.message_content_iv || '') },
		content_key,
		base64_to_bytes(row.message_ciphertext || '')
	);

	return new TextDecoder().decode(plaintext_bytes);
}

function get_conversation_lookup_destination(conversation) {
	if (!conversation) {
		return '';
	}

	var destination = normalize_message_destination(conversation.destination || '');
	if (!destination) {
		destination = get_conversation_destination(conversation);
	}

	if (destination.charAt(0) === '#') {
		return normalize_room_name(destination);
	}

	return normalize_message_destination(destination);
}

function conversation_has_message(conversation, message_candidate) {
	if (!conversation || !Array.isArray(conversation.messages) || !message_candidate) {
		return false;
	}

	for (var i = 0; i < conversation.messages.length; i++) {
		var existing = conversation.messages[i];
		if (!existing) {
			continue;
		}

		if (message_candidate.message_uuid && existing.message_uuid && String(existing.message_uuid) === String(message_candidate.message_uuid)) {
			return true;
		}

		if (
			existing.direction === message_candidate.direction &&
			String(existing.text || '') === String(message_candidate.text || '') &&
			Math.abs(Number(existing.timestamp || 0) - Number(message_candidate.timestamp || 0)) < 2000
		) {
			return true;
		}
	}

	return false;
}

function collect_local_pending_messages_by_destination() {
	var pending = {};
	var now = Date.now();

	message_conversations.forEach(function(conversation) {
		var destination = get_conversation_lookup_destination(conversation);
		if (!destination || !conversation || !Array.isArray(conversation.messages)) {
			return;
		}

		conversation.messages.forEach(function(message) {
			if (!message || message.direction !== 'outgoing') {
				return;
			}

			var is_local = !!message.local_only || message.send_status === 'sending' || message.send_status === 'failed';
			if (!is_local) {
				return;
			}

			if (message.send_status === 'sent' && Number(message.local_expires_at || 0) > 0 && Number(message.local_expires_at) < now) {
				return;
			}

			if (!pending[destination]) {
				pending[destination] = [];
			}

			pending[destination].push(Object.assign({}, message));
		});
	});

	return pending;
}

function merge_local_pending_messages(pending_by_destination) {
	Object.keys(pending_by_destination || {}).forEach(function(destination) {
		var pending_messages = pending_by_destination[destination] || [];
		if (!pending_messages.length) {
			return;
		}

		var conversation = find_conversation_by_destination(destination);
		if (!conversation) {
			conversation = get_or_create_destination_conversation(destination);
		}
		if (!conversation) {
			return;
		}

		conversation.destination = destination;
		if (!Array.isArray(conversation.messages)) {
			conversation.messages = [];
		}

		pending_messages.forEach(function(local_message) {
			if (!conversation_has_message(conversation, local_message)) {
				conversation.messages.push(local_message);
			}
		});

		conversation.messages.sort(function(left, right) {
			return Number(left.timestamp || 0) - Number(right.timestamp || 0);
		});
	});
}

function load_messages_from_database(force_reload) {
	if (force_reload === undefined) {
		force_reload = false;
	}

	if (messages_load_in_progress) {
		return;
	}

	if (messages_loaded_from_db && !force_reload) {
		return;
	}

	messages_load_in_progress = true;
	var local_pending_by_destination = collect_local_pending_messages_by_destination();
	var pending_destination = '';
	var destination_input = document.getElementById('message_destination');
	if (destination_input) {
		pending_destination = normalize_message_destination(destination_input.value);
	}
	if (!pending_destination && active_conversation_id) {
		var current_conversation = find_conversation(active_conversation_id);
		pending_destination = get_conversation_destination(current_conversation);
	}
	if (pending_destination.charAt(0) === '/') {
		pending_destination = '';
	}

	ensure_e2ee_unlocked().then(function(unlocked) {
		if (!unlocked) {
			throw new Error('unlock_failed');
		}
		return get_message_api('list', {
			device_uuid: e2ee_device_uuid,
			limit: 1000
		});
	}).then(async function(result) {
		if (!result || result.status !== 'ok') {
			var message = (result && result.message) ? result.message : 'Failed to load messages';
			show_temporary_status(message, 'fas fa-exclamation-circle');
			return;
		}

		message_conversations.splice(0, message_conversations.length);
		var conversation_map = {};
		var rows = Array.isArray(result.messages) ? result.messages : [];
		for (var i = 0; i < rows.length; i++) {
			var row = rows[i];
			var plaintext = null;
			try {
				plaintext = await decrypt_message_row(row);
			}
			catch (error) {
				plaintext = null;
			}

			if (plaintext === null) {
				continue;
			}

			var peer_key = String(row.peer_key || ('dest:' + String(row.destination || 'unknown')));
			if (!conversation_map[peer_key]) {
				var inferred_destination = '';
				var row_destination = normalize_message_destination(String(row.destination || ''));
				if (row_destination.charAt(0) === '#') {
					inferred_destination = row_destination;
				}
				else if (String(row.sender_user_uuid || '') === String(phone_e2ee_user_uuid || '')) {
					inferred_destination = normalize_message_destination(String(row.destination || ''));
				}
				else {
					inferred_destination = normalize_message_destination(String(row.sender_username || row.peer_name || ''));
				}

				conversation_map[peer_key] = {
					id: 'xmpp-peer-' + peer_key.replace(/[^a-zA-Z0-9_\-:@#\.]/g, '_'),
					name: String(row.peer_name || row.destination || 'Unknown'),
					destination: inferred_destination,
					presence: (String(row.peer_name || '').charAt(0) === '#') ? 'room' : 'unknown',
					unread: 0,
					messages: []
				};
			}

			var is_outgoing = String(row.sender_user_uuid || '') === String(phone_e2ee_user_uuid || '');
			var timestamp_ms = Date.parse(String(row.message_created || ''));
			if (!isFinite(timestamp_ms)) {
				timestamp_ms = Date.now();
			}

			conversation_map[peer_key].messages.push({
				message_uuid: String(row.phone_message_uuid || ''),
				direction: is_outgoing ? 'outgoing' : 'incoming',
				text: plaintext,
				timestamp: timestamp_ms,
				send_status: 'sent'
			});
		}

		Object.keys(conversation_map).forEach(function(key) {
			message_conversations.push(conversation_map[key]);
		});

		merge_local_pending_messages(local_pending_by_destination);

		message_conversations.sort(function(left, right) {
			var left_time = left.messages.length ? left.messages[left.messages.length - 1].timestamp : 0;
			var right_time = right.messages.length ? right.messages[right.messages.length - 1].timestamp : 0;
			return right_time - left_time;
		});

		if (Array.isArray(result.messages) && result.messages.length > 0 && message_conversations.length === 0) {
			show_temporary_status('Some messages could not be decrypted on this device', 'fas fa-exclamation-circle');
		}

		if (active_conversation_id && !find_conversation(active_conversation_id)) {
			var pending_conversation = get_or_create_destination_conversation(pending_destination);
			active_conversation_id = pending_conversation ? pending_conversation.id : null;
		}

		messages_loaded_from_db = true;
		render_messages_sidebar();
		if (active_conversation_id) {
			open_conversation(active_conversation_id);
		}
		else if (message_conversations.length > 0) {
			open_conversation(message_conversations[0].id);
		}
		populate_room_suggestions();
	}).catch(function(error) {
		if (error && error.message === 'unlock_failed') {
			return;
		}
		show_temporary_status('Failed to load encrypted messages', 'fas fa-exclamation-circle');
	}).finally(function() {
		messages_load_in_progress = false;
	});
}

function update_action_bar_state(panel_name) {
	active_panel = panel_name || 'dialpad';

	// Remove active class from all action items
	document.querySelectorAll('.action_item').forEach(function(item) {
		item.classList.remove('active');
	});

	// Add active class based on current panel
	if (active_panel === 'dialpad' || active_panel === 'keypad') {
		document.getElementById('action_keypad').classList.add('active');
	} else if (active_panel === 'contacts') {
		document.getElementById('action_contacts').classList.add('active');
	} else if (active_panel === 'history') {
		document.getElementById('action_history').classList.add('active');
	} else if (active_panel === 'messages') {
		document.getElementById('action_messages').classList.add('active');
	}
}

function find_conversation(conversation_id) {
	for (var i = 0; i < message_conversations.length; i++) {
		if (message_conversations[i].id === conversation_id) {
			return message_conversations[i];
		}
	}
	return null;
}

function normalize_message_destination(destination_value) {
	return String(destination_value || '').trim();
}

function find_conversation_by_destination(destination_value) {
	var normalized_destination = normalize_message_destination(destination_value);
	if (!normalized_destination) {
		return null;
	}

	var destination_suffix = '(' + normalized_destination + ')';
	for (var i = 0; i < message_conversations.length; i++) {
		var conversation = message_conversations[i];
		if (normalize_message_destination(conversation.destination) === normalized_destination) {
			return conversation;
		}
		if (conversation.id === 'xmpp-dest-' + normalized_destination) {
			return conversation;
		}
		if (conversation.name && conversation.name.indexOf(destination_suffix) !== -1) {
			return conversation;
		}
	}

	return null;
}

function normalize_room_name(room_name) {
	var normalized = String(room_name || '').trim();
	if (!normalized) {
		return '';
	}
	if (normalized.charAt(0) !== '#') {
		normalized = '#' + normalized;
	}
	return normalized.toLowerCase();
}

function is_room_destination(destination_value) {
	return normalize_message_destination(destination_value).charAt(0) === '#';
}

function list_available_rooms() {
	var seen = {};
	var rooms = [];

	known_chat_rooms.forEach(function(room_name) {
		var normalized = normalize_room_name(room_name);
		if (normalized && !seen[normalized]) {
			seen[normalized] = true;
			rooms.push(normalized);
		}
	});

	message_conversations.forEach(function(conversation) {
		if (conversation && conversation.name && conversation.name.charAt(0) === '#') {
			var normalized = normalize_room_name(conversation.name);
			if (normalized && !seen[normalized]) {
				seen[normalized] = true;
				rooms.push(normalized);
			}
		}
	});

	rooms.sort();
	return rooms;
}

function find_room_match(partial_room) {
	var normalized_partial = normalize_room_name(partial_room);
	if (!normalized_partial) {
		return '';
	}

	var rooms = list_available_rooms();
	for (var i = 0; i < rooms.length; i++) {
		if (rooms[i].indexOf(normalized_partial) === 0) {
			return rooms[i];
		}
	}

	return '';
}

function populate_room_suggestions() {
	var datalist = document.getElementById('message_room_suggestions');
	if (!datalist) {
		return;
	}

	datalist.innerHTML = '';
	list_available_rooms().forEach(function(room_name) {
		var option = document.createElement('option');
		option.value = room_name;
		datalist.appendChild(option);
	});
}

function get_or_create_destination_conversation(destination_value) {
	var normalized_destination = normalize_message_destination(destination_value);
	if (!normalized_destination) {
		return null;
	}

	var existing_conversation = find_conversation_by_destination(normalized_destination);
	if (existing_conversation) {
		return existing_conversation;
	}

	var new_conversation = {
		id: 'xmpp-dest-' + normalized_destination,
		name: normalized_destination.charAt(0) === '#' ? normalized_destination : ('Ext ' + normalized_destination),
		destination: normalized_destination,
		presence: normalized_destination.charAt(0) === '#' ? 'room' : 'unknown',
		unread: 0,
		messages: []
	};

	message_conversations.unshift(new_conversation);
	return new_conversation;
}

function bump_conversation_to_top(conversation) {
	if (!conversation) {
		return;
	}

	var existing_index = message_conversations.indexOf(conversation);
	if (existing_index > 0) {
		message_conversations.splice(existing_index, 1);
		message_conversations.unshift(conversation);
	}
}

function handle_incoming_sip_message(message_event) {
	if (!message_event) {
		return;
	}

	var remote_user = '';
	if (message_event.remoteIdentity && message_event.remoteIdentity.uri && message_event.remoteIdentity.uri.user) {
		remote_user = String(message_event.remoteIdentity.uri.user);
	}
	else if (message_event.request && message_event.request.from && message_event.request.from.uri && message_event.request.from.uri.user) {
		remote_user = String(message_event.request.from.uri.user);
	}

	var message_text = '';
	if (typeof message_event.body === 'string') {
		message_text = message_event.body;
	}
	else if (message_event.request && typeof message_event.request.body === 'string') {
		message_text = message_event.request.body;
	}

	var destination = normalize_message_destination(remote_user);
	var text = String(message_text || '').trim();
	if (!destination || !text) {
		return;
	}

	var conversation = get_or_create_destination_conversation(destination);
	if (!conversation) {
		return;
	}

	conversation.destination = destination;
	conversation.presence = 'online';
	if (!conversation.name || conversation.name.indexOf('#') !== 0) {
		conversation.name = 'Ext ' + destination;
	}

	conversation.messages.push({
		direction: 'incoming',
		text: text,
		timestamp: Date.now()
	});

	bump_conversation_to_top(conversation);

	if (active_conversation_id !== conversation.id || active_panel !== 'messages') {
		conversation.unread = (conversation.unread || 0) + 1;
	}

	if (active_conversation_id === conversation.id) {
		render_messages_thread(conversation);
	}
	render_messages_sidebar();

	if (active_panel !== 'messages') {
		show_temporary_status('New message from ' + destination, 'fas fa-comment-dots');
	}
}

async function set_message_destination() {
	var destination_input = document.getElementById('message_destination');
	if (!destination_input) {
		return;
	}

	var normalized_destination = normalize_message_destination(destination_input.value);
	if (normalized_destination.charAt(0) === '/') {
		if (await handle_room_command(normalized_destination)) {
			return;
		}
		show_temporary_status('Unknown command. Use /list, /create #room or /join #room', 'fas fa-exclamation-circle');
		return;
	}

	if (normalized_destination.charAt(0) === '#') {
		normalized_destination = find_room_match(normalized_destination) || normalize_room_name(normalized_destination);
	}
	if (!normalized_destination) {
		show_temporary_status('Enter destination (example: 102)', 'fas fa-exclamation-circle');
		return;
	}

	var conversation = get_or_create_destination_conversation(normalized_destination);
	if (!conversation) {
		show_temporary_status('Could not set destination', 'fas fa-exclamation-circle');
		return;
	}

	conversation.destination = normalized_destination;

	destination_input.value = normalized_destination;
	open_conversation(conversation.id);
	show_temporary_status('Destination set to ' + normalized_destination, 'fas fa-comments');
}

function get_conversation_destination(conversation) {
	if (!conversation) {
		return '';
	}

	var explicit_destination = normalize_message_destination(conversation.destination);
	if (explicit_destination) {
		return explicit_destination;
	}

	if (conversation.name && conversation.name.charAt(0) === '#') {
		return normalize_room_name(conversation.name);
	}

	var extension_match = conversation.name ? conversation.name.match(/\(([^\)]+)\)$/) : null;
	if (extension_match && extension_match[1]) {
		return normalize_message_destination(extension_match[1]);
	}

	var ext_prefix_match = conversation.name ? conversation.name.match(/^Ext\s+(.+)$/i) : null;
	if (ext_prefix_match && ext_prefix_match[1]) {
		return normalize_message_destination(ext_prefix_match[1]);
	}

	var fallback_name = normalize_message_destination(conversation.name);
	if (fallback_name) {
		return fallback_name;
	}

	return '';
}

function set_thread_presence(presence_value) {
	var presence = document.getElementById('thread_presence');
	if (!presence) {
		return;
	}

	var normalized = String(presence_value || 'unknown').toLowerCase();
	var label = 'UNKNOWN';
	var presence_class = 'unknown';

	if (normalized === 'online') {
		label = 'ONLINE';
		presence_class = 'online';
	}
	else if (normalized === 'away') {
		label = 'AWAY';
		presence_class = 'away';
	}
	else if (normalized === 'offline') {
		label = 'OFFLINE';
		presence_class = 'offline';
	}
	else if (normalized === 'room') {
		label = 'ROOM';
		presence_class = 'room';
	}

	presence.className = 'thread_presence ' + presence_class;
	presence.textContent = label;
}

async function join_room_by_name(room_name) {
	var normalized_room = find_room_match(room_name) || normalize_room_name(room_name);
	if (!normalized_room) {
		show_temporary_status('Invalid room name', 'fas fa-exclamation-circle');
		return false;
	}

	try {
		var join_result = await post_message_api({
			action: 'join_room',
			room_name: normalized_room
		});
		if (!join_result || join_result.status !== 'ok') {
			show_temporary_status((join_result && join_result.message) ? join_result.message : 'Could not join room on server', 'fas fa-exclamation-circle');
			return false;
		}
	}
	catch (error) {
		show_temporary_status('Could not join room on server', 'fas fa-exclamation-circle');
		return false;
	}

	var conversation = get_or_create_destination_conversation(normalized_room);
	if (!conversation) {
		show_temporary_status('Could not join room', 'fas fa-exclamation-circle');
		return false;
	}

	conversation.name = normalized_room;
	conversation.presence = 'room';
	open_conversation(conversation.id);

	var destination_input = document.getElementById('message_destination');
	if (destination_input) {
		destination_input.value = normalized_room;
	}

	populate_room_suggestions();
	load_messages_from_database(true);
	show_temporary_status('Joined room ' + normalized_room, 'fas fa-users');
	return true;
}

async function create_room_by_name(room_name) {
	var normalized_room = normalize_room_name(room_name);
	if (!normalized_room) {
		show_temporary_status('Invalid room name', 'fas fa-exclamation-circle');
		return false;
	}

	try {
		var create_result = await post_message_api({
			action: 'join_room',
			room_name: normalized_room
		});
		if (!create_result || create_result.status !== 'ok') {
			show_temporary_status((create_result && create_result.message) ? create_result.message : 'Could not create room on server', 'fas fa-exclamation-circle');
			return false;
		}
	}
	catch (error) {
		show_temporary_status('Could not create room on server', 'fas fa-exclamation-circle');
		return false;
	}

	if (known_chat_rooms.indexOf(normalized_room) === -1) {
		known_chat_rooms.push(normalized_room);
	}

	var conversation = get_or_create_destination_conversation(normalized_room);
	if (!conversation) {
		show_temporary_status('Could not create room', 'fas fa-exclamation-circle');
		return false;
	}

	conversation.name = normalized_room;
	conversation.destination = normalized_room;
	conversation.presence = 'room';
	open_conversation(conversation.id);

	var destination_input = document.getElementById('message_destination');
	if (destination_input) {
		destination_input.value = normalized_room;
	}

	populate_room_suggestions();
	load_messages_from_database(true);
	show_temporary_status('Created room ' + normalized_room, 'fas fa-users');
	return true;
}

async function list_rooms_into_autocomplete() {
	var result;
	try {
		result = await get_message_api('list_rooms', {});
	}
	catch (error) {
		show_temporary_status('Could not load rooms from server', 'fas fa-exclamation-circle');
		return false;
	}

	if (!result || result.status !== 'ok') {
		show_temporary_status((result && result.message) ? result.message : 'Could not load rooms from server', 'fas fa-exclamation-circle');
		return false;
	}

	var server_rooms = Array.isArray(result.rooms) ? result.rooms : [];
	server_rooms.forEach(function(room_name) {
		var normalized_room = normalize_room_name(room_name);
		if (!normalized_room) {
			return;
		}
		if (known_chat_rooms.indexOf(normalized_room) === -1) {
			known_chat_rooms.push(normalized_room);
		}
	});

	populate_room_suggestions();

	var destination_input = document.getElementById('message_destination');
	if (destination_input) {
		destination_input.value = '#';
		destination_input.focus();
		destination_input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	show_temporary_status('Loaded ' + server_rooms.length + ' room' + (server_rooms.length === 1 ? '' : 's') + ' into autocomplete', 'fas fa-list');
	return true;
}

async function delete_room_by_name(room_name) {
	var normalized_room = normalize_room_name(room_name);
	if (!normalized_room) {
		show_temporary_status('Invalid room name', 'fas fa-exclamation-circle');
		return false;
	}

	if (!can_delete_rooms) {
		show_temporary_status('You do not have permission to delete rooms', 'fas fa-exclamation-circle');
		return false;
	}

	var confirmed = window.confirm('Delete room ' + normalized_room + '? This will remove room history for all members.');
	if (!confirmed) {
		return false;
	}

	var result;
	try {
		result = await post_message_api({
			action: 'delete_room',
			room_name: normalized_room
		});
	}
	catch (error) {
		show_temporary_status('Could not delete room on server', 'fas fa-exclamation-circle');
		return false;
	}

	if (!result || result.status !== 'ok') {
		show_temporary_status((result && result.message) ? result.message : 'Could not delete room on server', 'fas fa-exclamation-circle');
		return false;
	}

	for (var i = message_conversations.length - 1; i >= 0; i--) {
		var conversation = message_conversations[i];
		var conversation_destination = normalize_message_destination(conversation.destination || '');
		var conversation_name = normalize_room_name(conversation.name || '');
		if (conversation_destination === normalized_room || conversation_name === normalized_room) {
			if (active_conversation_id === conversation.id) {
				active_conversation_id = null;
			}
			message_conversations.splice(i, 1);
		}
	}

	for (var j = known_chat_rooms.length - 1; j >= 0; j--) {
		if (normalize_room_name(known_chat_rooms[j]) === normalized_room) {
			known_chat_rooms.splice(j, 1);
		}
	}

	render_messages_sidebar();
	if (active_conversation_id) {
		open_conversation(active_conversation_id);
	}
	else {
		var thread_title = document.getElementById('thread_title');
		if (thread_title) {
			thread_title.textContent = 'Select a conversation';
		}
		set_thread_presence('offline');
		var thread_messages = document.getElementById('thread_messages');
		if (thread_messages) {
			thread_messages.innerHTML = '<div class="thread_empty">Select a conversation to start messaging.</div>';
		}
	}

	show_temporary_status('Deleted room ' + normalized_room, 'fas fa-trash');
	return true;
}

async function handle_room_command(command_text) {
	if (/^\/list$/i.test(String(command_text || '').trim())) {
		return await list_rooms_into_autocomplete();
	}

	var room_match = String(command_text || '').trim().match(/^\/(join|create)\s+(.+)$/i);
	if (!room_match) {
		return false;
	}

	var command = room_match[1].toLowerCase();
	var room_name = room_match[2];
	if (command === 'create') {
		return await create_room_by_name(room_name);
	}
	if (command === 'join') {
		return await join_room_by_name(room_name);
	}

	return false;
}

async function handle_join_command(command_text) {
	return await handle_room_command(command_text);
}

function format_message_time(timestamp) {
	return new Date(timestamp).toLocaleTimeString([], {
		timeZone: time_zone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: true
	});
}

function render_thread_conversation_selector() {
	var selector = document.getElementById('thread_conversation_select');
	if (!selector) {
		return;
	}

	var selected_id = active_conversation_id || '';
	selector.innerHTML = '';

	if (message_conversations.length === 0) {
		var empty_option = document.createElement('option');
		empty_option.value = '';
		empty_option.textContent = 'Select a conversation';
		selector.appendChild(empty_option);
		selector.disabled = true;
		return;
	}

	selector.disabled = false;
	message_conversations.forEach(function(conversation) {
		var option = document.createElement('option');
		option.value = conversation.id;
		var unread = Number(conversation.unread || 0);
		option.textContent = unread > 0
			? (String(conversation.name) + ' (' + unread + ')')
			: String(conversation.name);
		if (conversation.id === selected_id) {
			option.selected = true;
		}
		selector.appendChild(option);
	});
}

function ensure_message_context_menu() {
	var menu = document.getElementById('message_context_menu');
	if (menu) {
		return menu;
	}

	menu = document.createElement('div');
	menu.id = 'message_context_menu';
	menu.className = 'message_context_menu';
	menu.style.display = 'none';
	document.body.appendChild(menu);
	return menu;
}

function hide_message_context_menu() {
	var menu = document.getElementById('message_context_menu');
	if (!menu) {
		return;
	}
	menu.style.display = 'none';
	menu.innerHTML = '';
}

async function add_destination_to_contacts(destination_value, contact_name) {
	var destination = normalize_message_destination(destination_value);
	if (!destination || destination.charAt(0) === '#') {
		show_temporary_status('Only direct destinations can be added as contacts', 'fas fa-exclamation-circle');
		return;
	}

	try {
		var result = await post_message_api({
			action: 'add_contact',
			destination: destination,
			contact_name: String(contact_name || '').trim()
		});

		if (!result || result.status !== 'ok') {
			show_temporary_status((result && result.message) ? result.message : 'Could not add contact', 'fas fa-exclamation-circle');
			return;
		}

		if (result.contact && result.contact.destination) {
			var already_exists = contacts.some(function(contact) {
				return normalize_message_destination(contact.destination || contact.extension) === normalize_message_destination(result.contact.destination);
			});
			if (!already_exists) {
				contacts.push(result.contact);
				render_contacts();
			}
		}

		show_temporary_status('Added contact ' + destination, 'fas fa-address-book');
	}
	catch (error) {
		show_temporary_status('Could not add contact', 'fas fa-exclamation-circle');
	}
}

function show_message_context_menu(event, conversation) {
	if (!event || !conversation) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	var menu = ensure_message_context_menu();
	menu.innerHTML = '';

	var destination = get_conversation_destination(conversation);
	var is_room = is_room_destination(destination || conversation.name || '');

	if (can_delete_rooms && is_room) {
		var delete_item = document.createElement('button');
		delete_item.type = 'button';
		delete_item.className = 'message_context_menu_item';
		delete_item.textContent = 'Delete room';
		delete_item.addEventListener('click', function() {
			hide_message_context_menu();
			delete_room_by_name(destination || conversation.name || '');
		});
		menu.appendChild(delete_item);
	}

	var add_contact_item = document.createElement('button');
	add_contact_item.type = 'button';
	add_contact_item.className = 'message_context_menu_item';
	add_contact_item.textContent = 'Add to contact';
	if (is_room || !destination) {
		add_contact_item.disabled = true;
	}
	else {
		add_contact_item.addEventListener('click', function() {
			hide_message_context_menu();
			add_destination_to_contacts(destination, conversation.name || destination);
		});
	}
	menu.appendChild(add_contact_item);

	if (!menu.children.length) {
		return;
	}

	menu.style.display = 'block';
	menu.style.left = Math.max(8, event.clientX) + 'px';
	menu.style.top = Math.max(8, event.clientY) + 'px';

	var menu_rect = menu.getBoundingClientRect();
	if (menu_rect.right > window.innerWidth - 8) {
		menu.style.left = Math.max(8, window.innerWidth - menu_rect.width - 8) + 'px';
	}
	if (menu_rect.bottom > window.innerHeight - 8) {
		menu.style.top = Math.max(8, window.innerHeight - menu_rect.height - 8) + 'px';
	}
}

function render_messages_sidebar() {
	var container = document.getElementById('messages_conversations');
	if (!container) {
		render_thread_conversation_selector();
		return;
	}

	container.innerHTML = '';

	message_conversations.forEach(function(conversation) {
		var item = document.createElement('div');
		item.className = 'conversation_item';
		if (conversation.id === active_conversation_id) {
			item.classList.add('active');
		}
		item.onclick = function() {
			open_conversation(conversation.id);
		};

		item.addEventListener('contextmenu', function(event) {
			show_message_context_menu(event, conversation);
		});
		item.title = 'Right-click for actions';

		var last_message = conversation.messages.length
			? conversation.messages[conversation.messages.length - 1]
			: { text: 'No messages yet', timestamp: Date.now() };

		item.innerHTML =
			'<div class="conversation_name">' + sanitize_string(conversation.name) + '</div>' +
			'<div class="conversation_meta">' + format_message_time(last_message.timestamp) + '</div>' +
			'<div class="conversation_preview">' + sanitize_string(last_message.text) + '</div>';

		container.appendChild(item);
	});

	update_messages_badge();
	render_thread_conversation_selector();

	if (!active_conversation_id && message_conversations.length > 0) {
		open_conversation(message_conversations[0].id);
	}
}

function open_conversation(conversation_id) {
	var conversation = find_conversation(conversation_id);
	if (!conversation) {
		return;
	}

	active_conversation_id = conversation_id;
	conversation.unread = 0;

	var title = document.getElementById('thread_title');
	var presence = document.getElementById('thread_presence');
	if (title) {
		title.textContent = conversation.name;
	}
	if (presence) {
		set_thread_presence(conversation.presence);
	}

	var destination_input = document.getElementById('message_destination');
	if (destination_input) {
		var conversation_destination = get_conversation_destination(conversation);
		conversation.destination = conversation_destination;
		if (document.activeElement !== destination_input) {
			destination_input.value = conversation_destination;
		}
	}

	render_messages_thread(conversation);
	render_messages_sidebar();
	var selector = document.getElementById('thread_conversation_select');
	if (selector && selector.value !== conversation_id) {
		selector.value = conversation_id;
	}
}

function render_messages_thread(conversation) {
	var container = document.getElementById('thread_messages');
	if (!container) {
		return;
	}

	container.innerHTML = '';
	if (!conversation.messages.length) {
		container.innerHTML = '<div class="thread_empty">No messages yet.</div>';
		return;
	}

	conversation.messages.forEach(function(message) {
		var row = document.createElement('div');
		var status_class = message && message.send_status ? (' ' + message.send_status) : '';
		row.className = 'message_row ' + message.direction + status_class;
		var meta_text = format_message_time(message.timestamp);
		if (message && message.send_status === 'sending') {
			meta_text += ' - sending';
		}
		else if (message && message.send_status === 'failed') {
			meta_text += ' - failed';
		}
		row.innerHTML =
			'<div class="message_bubble">' +
				sanitize_string(message.text) +
				'<div class="message_meta">' + sanitize_string(meta_text) + '</div>' +
			'</div>';
		container.appendChild(row);
	});

	container.scrollTop = container.scrollHeight;
}

function update_messages_badge() {
	var badge = document.getElementById('action_messages_badge');
	if (!badge) {
		return;
	}

	var unread_total = 0;
	message_conversations.forEach(function(conversation) {
		unread_total += conversation.unread || 0;
	});

	if (unread_total > 0) {
		badge.textContent = unread_total > 99 ? '99+' : String(unread_total);
		badge.style.display = 'inline-block';
	}
	else {
		badge.style.display = 'none';
	}
}

async function send_message_mock() {
	var input = document.getElementById('message_input');
	if (!input) {
		return;
	}

	var text = input.value.trim();
	if (!text) {
		return;
	}

	if (await handle_room_command(text)) {
		input.value = '';
		return;
	}

	var destination_input = document.getElementById('message_destination');
	var requested_destination = destination_input ? normalize_message_destination(destination_input.value) : '';
	if (requested_destination) {
		if (requested_destination.charAt(0) === '#') {
			requested_destination = find_room_match(requested_destination) || normalize_room_name(requested_destination);
		}
		var destination_conversation = get_or_create_destination_conversation(requested_destination);
		if (destination_conversation) {
			active_conversation_id = destination_conversation.id;
		}
	}

	if (!active_conversation_id) {
		show_temporary_status('Set a destination first (example: 102)', 'fas fa-exclamation-circle');
		return;
	}

	var conversation = find_conversation(active_conversation_id);
	if (!conversation) {
		return;
	}

	var destination_for_send = requested_destination;
	if (!destination_for_send) {
		destination_for_send = get_conversation_destination(conversation);
	}
	conversation.destination = destination_for_send;

	if (!destination_for_send) {
		show_temporary_status('Set a destination first (example: 102)', 'fas fa-exclamation-circle');
		return;
	}

	var optimistic_message = {
		direction: 'outgoing',
		text: text,
		timestamp: Date.now(),
		send_status: 'sending',
		local_only: true,
		local_expires_at: Date.now() + 120000,
		message_uuid: ''
	};

	conversation.messages.push(optimistic_message);
	input.value = '';
	input.focus();
	render_messages_thread(conversation);
	render_messages_sidebar();

	function mark_message_failed(error_message) {
		optimistic_message.send_status = 'failed';
		render_messages_thread(conversation);
		render_messages_sidebar();
		show_temporary_status(error_message, 'fas fa-exclamation-circle');
	}

	var unlocked = await ensure_e2ee_unlocked();
	if (!unlocked) {
		mark_message_failed('Encryption unlock is required before sending');
		return;
	}

	var recipient_result;
	var my_devices_result;
	try {
		recipient_result = await get_message_api('recipient_devices', { destination: destination_for_send });
		my_devices_result = await get_message_api('my_devices', {});
	}
	catch (error) {
		mark_message_failed('Could not load recipient keys');
		return;
	}

	if (!recipient_result || recipient_result.status !== 'ok') {
		mark_message_failed((recipient_result && recipient_result.message) ? recipient_result.message : 'Destination has no encryption keys');
		return;
	}

	if (!my_devices_result || my_devices_result.status !== 'ok') {
		mark_message_failed((my_devices_result && my_devices_result.message) ? my_devices_result.message : 'Could not load your device keys');
		return;
	}

	var device_map = {};
	var recipient_devices = Array.isArray(recipient_result.devices) ? recipient_result.devices : [];
	var my_devices = Array.isArray(my_devices_result.devices) ? my_devices_result.devices : [];
	recipient_devices.concat(my_devices).forEach(function(device) {
		if (device && device.phone_device_uuid) {
			device_map[device.phone_device_uuid] = device;
		}
	});

	var envelope;
	try {
		envelope = await encrypt_message_envelope(text, Object.keys(device_map).map(function(device_uuid) {
			return device_map[device_uuid];
		}));
	}
	catch (error) {
		mark_message_failed('Encryption failed for destination devices');
		return;
	}

	var send_result;
	try {
		send_result = await post_message_api({
			action: 'send',
			device_uuid: e2ee_device_uuid,
			sender_extension_uuid: selected_sender_extension_uuid,
			destination: destination_for_send,
			message_text: text,
			ciphertext: envelope.ciphertext,
			content_iv: envelope.content_iv,
			sender_public_key_jwk: JSON.stringify(e2ee_public_jwk),
			recipient_keys: JSON.stringify(envelope.recipient_keys)
		});
	}
	catch (error) {
		mark_message_failed('Could not save message');
		return;
	}

	if (!send_result || send_result.status !== 'ok' || !send_result.message) {
		var error_message = (send_result && send_result.message) ? send_result.message : 'Could not save message';
		mark_message_failed(error_message);
		return;
	}

	optimistic_message.send_status = 'sent';
	optimistic_message.message_uuid = String((send_result.message && send_result.message.id) ? send_result.message.id : '');
	optimistic_message.local_only = true;
	optimistic_message.local_expires_at = Date.now() + 20000;
	optimistic_message.timestamp = send_result.message.timestamp || Date.now();
	render_messages_thread(conversation);
	render_messages_sidebar();
}

// Render contacts list
function render_contacts() {
	var container = document.getElementById('contacts_list');
	container.innerHTML = '';
	if (!Array.isArray(contacts) || contacts.length === 0) {
		container.innerHTML = '<div style="text-align: center; color: #ccc; padding: 30px; font-size: 15px;">No contacts found for this domain</div>';
		return;
	}

	contacts.forEach(function(contact) {
		var destination = normalize_message_destination(contact && (contact.destination || contact.extension));
		if (!destination) {
			return;
		}
		var extension_label = String(contact && contact.extension ? contact.extension : destination).trim() || destination;
		var display_name = String(contact && contact.name ? contact.name : '').trim() || destination;

		var contactDiv = document.createElement('div');
		contactDiv.className = 'contact_item';
		contactDiv.onclick = function() { call_contact(destination); };

		var iconDiv = document.createElement('div');
		iconDiv.className = 'contact_icon';
		iconDiv.innerHTML = '<i class="fas fa-user"></i>';

		var infoDiv = document.createElement('div');
		infoDiv.className = 'contact_info';
		infoDiv.innerHTML =
			'<div class="contact_extension">' + sanitize_string(extension_label) + '</div>' +
			'<div class="contact_name">' + sanitize_string(display_name) + '</div>';

		var actionsDiv = document.createElement('div');
		actionsDiv.className = 'contact_actions';

		var callButton = document.createElement('button');
		callButton.type = 'button';
		callButton.className = 'contact_action_button contact_call';
		callButton.title = 'Call';
		callButton.innerHTML = '<i class="fas fa-phone"></i>';
		callButton.addEventListener('click', function(event) {
			event.stopPropagation();
			call_contact(destination);
		});

		var messageButton = document.createElement('button');
		messageButton.type = 'button';
		messageButton.className = 'contact_action_button contact_message';
		messageButton.title = 'Message';
		messageButton.innerHTML = '<i class="fas fa-comment-dots"></i>';
		messageButton.addEventListener('click', function(event) {
			event.stopPropagation();
			message_contact(destination);
		});

		actionsDiv.appendChild(callButton);
		actionsDiv.appendChild(messageButton);
		contactDiv.appendChild(iconDiv);
		contactDiv.appendChild(infoDiv);
		contactDiv.appendChild(actionsDiv);
		container.appendChild(contactDiv);
	});
}

// Render call history
function render_history() {
	var container = document.getElementById('history_list');
	container.innerHTML = '';

	var history = get_call_history();

	if (history.length === 0) {
		container.innerHTML = '<div style="text-align: center; color: #ccc; padding: 40px; font-size: 16px;">No call history</div>';
		return;
	}

	history.forEach(function(entry) {
		var historyDiv = document.createElement('div');
		historyDiv.className = 'history_item';
		historyDiv.onclick = function() { call_number(entry.number); };

		var icon_class = 'fa-phone';
		if (entry.call_type === 'outgoing') {
			icon_class = 'fa-phone';
		} else if (entry.call_type === 'incoming') {
			icon_class = 'fa-phone';
		} else if (entry.call_type === 'missed') {
			icon_class = 'fa-phone-slash';
		}

		var date = new Date(entry.timestamp);
		var time_str = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		var ago_str = time_ago_string(entry.timestamp);

		// Get time in local timezone
		var time_str = date.toLocaleTimeString([], {
			timeZone: time_zone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: true  // true = 12-hour format, false = 24-hour
		});

		history_html = '	<div class="history_icon ' + entry.call_type + '">';
		history_html += '	<i class="fas ' + icon_class + '"></i>';
		history_html += '	</div>';
		history_html += '	<div class="history_details">';
		history_html += '		<div class="history_number">' + sanitize_string(entry.number) + '</div>';
		history_html += '		<div class="history_meta">' + call_type_name(entry.call_type) + ' • ' + ago_str + '</div>';
		history_html += '	</div>';
		history_html += '	<div class="history_time">';
		history_html += '		' + time_str;
		history_html += '	</div>'
		historyDiv.innerHTML = history_html;
		container.appendChild(historyDiv);
	});
}

// Helper functions
function time_ago_string(timestamp) {
	var seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return 'Just now';
	if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
	if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
	return Math.floor(seconds / 86400) + ' days ago';
}

function call_type_name(type) {
	switch(type) {
		case 'outgoing': return 'Outgoing';
		case 'incoming': return 'Incoming';
		case 'missed': return 'Missed';
		default: return type;
	}
}

// Call functions
function call_contact(extension) {
	document.getElementById('destination').value = extension;
	correct_alignment();
	send();
}

async function message_contact(destination) {
	var normalized_destination = normalize_message_destination(destination);
	if (!normalized_destination) {
		return;
	}

	await show_messages();
	var conversation = get_or_create_destination_conversation(normalized_destination);
	if (conversation) {
		conversation.destination = normalized_destination;
		open_conversation(conversation.id);
	}
	var destination_input = document.getElementById('message_destination');
	if (destination_input) {
		destination_input.value = normalized_destination;
	}
}

function call_number(number) {
	document.getElementById('destination').value = number;
	correct_alignment();
	send();
}

// Function to get the current time in seconds
function get_session_time() {
	if (answer_time) {
		// get the elapsed time using the answer time
		elapsed_time = Date.now() - answer_time;

		// Calculate hours, minutes, and seconds
		var hours = Math.floor(elapsed_time / (1000 * 60 * 60));
		var minutes = Math.floor((elapsed_time % (1000 * 60 * 60)) / (1000 * 60));
		var seconds = Math.floor((elapsed_time % (1000 * 60)) / 1000);

		// Format the time with leading zeros if necessary
		var formatted_time = pad(hours, 2) + ":" + pad(minutes, 2) + ":" + pad(seconds, 2);

		// Update the element with id="elapsed-time" to display the formatted elapsed time
		document.getElementById("answer_time").textContent = formatted_time;
		if (active_call_is_video) {
			update_active_call_status(true, active_call_display_name, active_call_number, formatted_time);
		}
		else {
			show_status('Call in progress ' + formatted_time, 'fas fa-phone');
		}
	}
	else {
		console.log('Call has not been answered yet');
		return null;
	}
}

// Update elapsed time every second
setInterval(get_session_time, 1000);

// Function to reset media after a call ends
function reset_media() {
	const videoElements = [document.getElementById('remote_video'), document.getElementById('local_video')];
	videoElements.forEach(video => {
		video.srcObject = null;
		video.pause();
	});
}

// Function used to end the session
function hangup() {
	if (session && !session_hungup && session.status !== SIP.Session.C.STATUS_TERMINATED) {
		session_hungup = true;
		session.local_ended = true;

		if (session.status === SIP.Session.C.STATUS_CONFIRMED || session.status === SIP.Session.C.STATUS_ANSWERED) {
			session.bye();
		} else {
			session.terminate();
		}
	}

	reset_call_ui_state(true);
}

function hold() {
	if (!session) { return; }
	document.getElementById('hold').style.display = "none";
	document.getElementById('unhold').style.display = "inline";
	sync_call_action_controls();
	session.hold();
	//session.hold({
	//	useUpdate: true
	//});
}

function unhold() {
	if (!session) { return; }
	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";
	sync_call_action_controls();
	session.unhold();
	//session.unhold({
	//	useUpdate: true
	//});
}

// Legacy send function - uses last call type (maintains backward compatibility)
function send() {
	// Use last_call_type for legacy send() function (defaults to audio)
	if (last_call_type === 'video') {
		call_video();
	} else {
		call_audio();
	}
}

function mute_audio(destination) {
	if (!session) { return; }
	session.mute({audio: true});
	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('unmute_audio').style.display = "inline";
	sync_call_action_controls();
}

function mute_video(destination) {
	if (!session) { return; }
	session.mute({video: true});
	document.getElementById('local_video').style.display = "none";
	document.getElementById('mute_video').style.display = "none";
	document.getElementById('unmute_video').style.display = "inline";
	sync_call_action_controls();
}

function unmute_audio(destination) {
	if (!session) { return; }
	session.unmute({audio: true});
	document.getElementById('mute_audio').style.display = "inline";
	document.getElementById('unmute_audio').style.display = "none";
	sync_call_action_controls();
}

function unmute_video(destination) {
	if (!session) { return; }
	session.unmute({video: true});
	document.getElementById('local_video').style.display = "inline";
	document.getElementById('mute_video').style.display = "inline";
	document.getElementById('unmute_video').style.display = "none";
	sync_call_action_controls();
}

function decline() {
	// Record missed call
	if (session && session.incoming_number) {
		add_to_history(session.incoming_number, 'missed', Date.now());
	}

	// Hang up to decline the call
	hangup();
}

// Function to center entered digits until full, then right-align and change text direction so last entered digits are always visible
function correct_alignment() {
	if (document.getElementById('destination').scrollWidth > document.getElementById('destination').clientWidth) {
		document.getElementById('destination').style.textAlign = 'right';
		document.getElementById('destination').style.direction = 'rtl';
	}
	else {
		document.getElementById('destination').style.textAlign = 'center';
		document.getElementById('destination').style.direction = 'ltr';
	}
}

function digit_add($digit) {
	document.getElementById('destination').value = document.getElementById('destination').value + $digit;
	correct_alignment();
	// Send DTMF if in an active call
	if (session && !session_hungup && (session.status === SIP.Session.C.STATUS_CONFIRMED || session.status === SIP.Session.C.STATUS_ANSWERED)) {
		session.sendDTMF($digit);
	}
}

function digit_delete() {
	destination = document.getElementById('destination').value;
	document.getElementById('destination').value = destination.substring(0, destination.length -1);
	correct_alignment();
}

function digit_clear() {
	document.getElementById('destination').value = '';
	correct_alignment();
}

document.addEventListener('keydown', function(e) {
	if (!document.getElementById('destination')) {
		return;
	}

	var target = e.target;
	if (target && (
		target.tagName === 'INPUT' ||
		target.tagName === 'TEXTAREA' ||
		target.isContentEditable
	)) {
		return;
	}

	if (e.key >= '0' && e.key <= '9') {
		e.preventDefault();
		digit_add(e.key);
		return;
	}

	if (e.key === '*' || e.key === '#') {
		e.preventDefault();
		digit_add(e.key);
		return;
	}

	if (e.key === 'Backspace' || e.key === 'Delete') {
		e.preventDefault();
		digit_delete();
		return;
	}

	if (e.key === 'Escape') {
		e.preventDefault();
		digit_clear();
		return;
	}

	if (e.key === 'Enter') {
		e.preventDefault();
		if (last_call_type === 'video') {
			call_video();
		} else {
			call_audio();
		}
	}
});

document.addEventListener('DOMContentLoaded', function() {
	function harden_message_field_autofill(field, field_prefix) {
		if (!field) {
			return;
		}

		field.setAttribute('autocomplete', 'section-xmpp new-password');
		field.setAttribute('autocorrect', 'off');
		field.setAttribute('autocapitalize', 'off');
		field.setAttribute('spellcheck', 'false');
		field.setAttribute('data-lpignore', 'true');
		field.setAttribute('data-1p-ignore', 'true');
		field.setAttribute('data-form-type', 'other');
		field.setAttribute('aria-autocomplete', 'none');
		field.setAttribute('inputmode', 'text');

		// Randomized field name makes saved-login heuristics less likely to trigger.
		field.name = field_prefix + '_' + Math.random().toString(36).slice(2, 12);

		var deflect_autofill = function() {
			if (field.readOnly) {
				return;
			}
			field.readOnly = true;
			setTimeout(function() {
				field.readOnly = false;
			}, 0);
		};

		if (String(field.tagName || '').toUpperCase() === 'TEXTAREA') {
			return;
		}

		field.addEventListener('mousedown', deflect_autofill);
		field.addEventListener('touchstart', deflect_autofill, { passive: true });
		field.addEventListener('focus', deflect_autofill);
	}

	var local_wrapper = document.getElementById('local_video_wrapper');
	if (local_wrapper) {
		local_wrapper.addEventListener('click', function() {
			cycle_local_video_corner();
		});
	}

	var message_input = document.getElementById('message_input');
	if (message_input) {
		harden_message_field_autofill(message_input, 'xmpp_message');
		var handle_message_input_enter = function(event) {
			if (!event) {
				return;
			}
			if (event.shiftKey) {
				return;
			}
			if (event.isComposing) {
				return;
			}
			var key_name = String(event.key || '');
			var key_code = String(event.code || '');
			var enter_pressed = key_name === 'Enter' || key_name === 'Return' || key_code === 'NumpadEnter';
			if (!enter_pressed) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			send_message_mock();
		};
		message_input.addEventListener('keydown', function(event) {
			if (event.key === 'Tab') {
				var current_text = message_input.value.trim();
				var join_match = current_text.match(/^\/join\s+(#[^\s]*)?$/i);
				if (join_match) {
					event.preventDefault();
					var partial_room = join_match[1] || '#';
					var room_match = find_room_match(partial_room);
					if (room_match) {
						message_input.value = '/join ' + room_match;
					}
					return;
				}
			}
			handle_message_input_enter(event);
		});
		message_input.addEventListener('keypress', handle_message_input_enter);
	}

	var message_destination = document.getElementById('message_destination');
	if (message_destination) {
		harden_message_field_autofill(message_destination, 'xmpp_destination');
		message_destination.addEventListener('keydown', function(event) {
			if (event.key === 'Tab') {
				var destination_value = normalize_message_destination(message_destination.value);
				if (destination_value.charAt(0) === '#') {
					event.preventDefault();
					var room_match = find_room_match(destination_value);
					if (room_match) {
						message_destination.value = room_match;
					}
				}
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				set_message_destination();
			}
		});
	}

	var message_sender_extension = document.getElementById('message_sender_extension');
	if (message_sender_extension) {
		message_sender_extension.addEventListener('change', function() {
			set_selected_sender_extension(message_sender_extension.value);
		});
	}

	document.addEventListener('click', function() {
		hide_message_context_menu();
	});
	document.addEventListener('scroll', function() {
		hide_message_context_menu();
	}, true);
	window.addEventListener('resize', function() {
		hide_message_context_menu();
	});

	var thread_conversation_select = document.getElementById('thread_conversation_select');
	if (thread_conversation_select) {
		thread_conversation_select.addEventListener('change', function() {
			if (thread_conversation_select.value) {
				open_conversation(thread_conversation_select.value);
			}
		});
	}
	render_sender_extension_selector();

	var remote_video = document.getElementById('remote_video');
	if (remote_video) {
		remote_video.addEventListener('loadedmetadata', apply_video_fit_layout);
	}

	window.addEventListener('resize', apply_video_fit_layout);
	apply_video_fit_layout();
	populate_room_suggestions();
	update_messages_badge();

	if (!message_refresh_interval_id) {
		message_refresh_interval_id = setInterval(function() {
			if (active_panel !== 'messages') {
				return;
			}
			if (!e2ee_unlocked) {
				return;
			}
			load_messages_from_database(true);
		}, 3000);
	}
});
