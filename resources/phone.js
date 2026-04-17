
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
	start_call_tone('outgoing');

	current_session.on('progress', function() {
		start_call_tone('outgoing');
	});

	current_session.on('accepted', function() {
		stop_call_tone();
		answer_time = Date.now();
		active_call_is_video = use_video;
		set_hangup_visibility(true);
		document.getElementById('mute_audio').style.display = "inline";
		document.getElementById('hold').style.display = "inline";
		set_audio_call_mode(!use_video);
		var remote_display_name = session.display_name || (session.remoteIdentity && session.remoteIdentity.displayName) || destination;
		var remote_number = session.uri_user || (session.remoteIdentity && session.remoteIdentity.uri && session.remoteIdentity.uri.user) || destination;
		update_video_stream_info(remote_display_name, remote_number, use_video);
		update_active_call_status(use_video, remote_display_name, remote_number);
	});

	current_session.on('bye', function() {
		stop_call_tone();
		if (!current_session.local_ended) {
			reset_call_ui_state(true);
		}
	});

	current_session.on('failed', function() {
		handle_outgoing_session_failure(current_session, 'Call failed');
	});

	current_session.on('rejected', function() {
		handle_outgoing_session_failure(current_session, 'Call rejected');
	});

	current_session.on('cancel', function() {
		handle_outgoing_session_failure(current_session, 'Call canceled');
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

function update_active_call_status(use_video, display_name, number) {
	if (use_video) {
		show_status('Video Call - ' + format_caller_id_for_status(display_name, number), 'fas fa-video');
		return;
	}

	show_status('Call in progress', 'fas fa-phone');
}

function sync_audio_action_controls() {
	var action_mute = document.getElementById('action_mute');
	var action_hold = document.getElementById('action_hold');
	if (!action_mute || !action_hold) {
		return;
	}

	var action_mute_icon = document.getElementById('action_mute_icon');
	var action_mute_label = document.getElementById('action_mute_label');
	var action_hold_icon = document.getElementById('action_hold_icon');
	var action_hold_label = document.getElementById('action_hold_label');

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
}

function set_audio_call_mode(enabled) {
	document.body.classList.toggle('audio_call_mode', enabled);

	var action_mute = document.getElementById('action_mute');
	var action_hold = document.getElementById('action_hold');
	if (action_mute) {
		action_mute.style.display = enabled ? 'flex' : 'none';
	}
	if (action_hold) {
		action_hold.style.display = enabled ? 'flex' : 'none';
	}

	if (enabled) {
		sync_audio_action_controls();
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
	authorizationUser: '<?php echo $user_extension; ?>',
	password: atob('<?php echo base64_encode($user_password); ?>'),
	registerExpires: 120,
	displayName: "<?php echo $user_extension; ?>"
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
	update_status_bar();
});

user_agent.on('failed', function() {
	registration_state = 'disconnected';
	update_status_bar();
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
	set_audio_call_mode(false);
	active_call_is_video = false;

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

// Contacts data (extension 1001-1005)
var contacts = [
	{ extension: '1003', name: 'John' },
	{ extension: '1004', name: 'Jane' },
	{ extension: '1005', name: 'Bob' }
];

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
	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";
	active_call_is_video = use_video;
	set_audio_call_mode(!use_video);
	set_hangup_visibility(true);
	update_video_stream_info(session.display_name, session.uri_user, use_video);

	// Show video if enabled
	if (use_video) {
		document.getElementById('video_container').style.display = "block";
		document.getElementById('local_video').style.display = "inline";
		document.getElementById('remote_video').style.display = "inline";
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
	document.getElementById('contacts').style.display = 'flex';
	update_action_bar_state('contacts');
}

function show_history() {
	hide_all_panels();
	render_history();
	document.getElementById('history').style.display = 'flex';
	update_action_bar_state('history');
}

function update_action_bar_state(active_panel) {
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
	}
}

// Render contacts list
function render_contacts() {
	var container = document.getElementById('contacts_list');
	container.innerHTML = '';

	contacts.forEach(function(contact) {
		var contactDiv = document.createElement('div');
		contactDiv.className = 'contact_item';
		contactDiv.onclick = function() { call_contact(contact.extension); };
		contact_html = '	<div class="contact_icon">';
		contact_html += '	<i class="fas fa-user"></i>';
		contact_html += '	</div>';
		contact_html += '	<div class="contact_info">';
		contact_html += '		<div class="contact_extension">' + sanitize_string(contact.extension) + '</div>';
		contact_html += '		<div class="contact_name">' + sanitize_string(contact.name) + '</div>';
		contact_html += '	</div>';
		contactDiv.innerHTML = contact_html;
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
		if (!active_call_is_video) {
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
	sync_audio_action_controls();
	session.hold();
	//session.hold({
	//	useUpdate: true
	//});
}

function unhold() {
	if (!session) { return; }
	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";
	sync_audio_action_controls();
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
	sync_audio_action_controls();
}

function mute_video(destination) {
	if (!session) { return; }
	session.mute({video: true});
	document.getElementById('local_video').style.display = "none";
	document.getElementById('mute_video').style.display = "none";
	document.getElementById('unmute_video').style.display = "inline";
}

function unmute_audio(destination) {
	if (!session) { return; }
	session.unmute({audio: true});
	document.getElementById('mute_audio').style.display = "inline";
	document.getElementById('unmute_audio').style.display = "none";
	sync_audio_action_controls();
}

function unmute_video(destination) {
	if (!session) { return; }
	session.unmute({video: true});
	document.getElementById('local_video').style.display = "inline";
	document.getElementById('mute_video').style.display = "inline";
	document.getElementById('unmute_video').style.display = "none";
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
	var local_wrapper = document.getElementById('local_video_wrapper');
	if (local_wrapper) {
		local_wrapper.addEventListener('click', function() {
			cycle_local_video_corner();
		});
	}
});
