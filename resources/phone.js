
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

	// Add to call history as outgoing and save entry ID for duration tracking
	current_history_entry_id = add_to_history(destination, 'outgoing', Date.now(), use_video);

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
let active_call_display_name = '';
let active_call_number = '';
let current_history_entry_id = null;  // Track current call's history entry for duration update
let current_conversation_partner = null;  // Current active conversation partner
let dtmf_keypad_shown = false;  // Track if DTMF keypad is visible
let dtmf_display_timer = null;  // Timer for clearing DTMF display
let dtmf_flush_timer = null;  // Timer for auto-flushing DTMF buffer
let dtmf_buffer = '';  // Buffer for DTMF digits (to send as batch)
let is_screen_sharing = false;  // Track if screen sharing is active
let screen_share_stream = null;  // Store the screen share stream
let original_video_track = null;  // Store original camera video track for restoration

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

	// Screen share button state
	var action_screen_share = document.getElementById('action_screen_share');
	var action_screen_share_icon = document.getElementById('action_screen_share_icon');
	var action_screen_share_label = document.getElementById('action_screen_share_label');
	if (action_screen_share && action_screen_share_icon && action_screen_share_label) {
		if (is_screen_sharing) {
			action_screen_share_icon.className = 'fas fa-stop';
			action_screen_share_label.textContent = 'Stop';
			action_screen_share.classList.add('action_item_toggle_active');
			action_screen_share.classList.add('action_item_share_active');
		} else {
			action_screen_share_icon.className = 'fas fa-desktop';
			action_screen_share_label.textContent = 'Share';
			action_screen_share.classList.remove('action_item_toggle_active');
			action_screen_share.classList.remove('action_item_share_active');
		}
	}
}

function set_call_action_mode(enabled, use_video) {
	document.body.classList.toggle('audio_call_mode', enabled && !use_video);

	var action_mute = document.getElementById('action_mute');
	var action_hold = document.getElementById('action_hold');
	var action_video_mute = document.getElementById('action_video_mute');
	var action_screen_share = document.getElementById('action_screen_share');
	var action_transfer = document.getElementById('action_transfer');
	var action_keypad = document.getElementById('action_keypad');
	var action_keypad_during_call = document.getElementById('action_keypad_during_call');

	if (action_mute) {
		action_mute.style.display = enabled ? 'flex' : 'none';
	}
	if (action_hold) {
		action_hold.style.display = enabled ? 'flex' : 'none';
	}
	if (action_video_mute) {
		action_video_mute.style.display = enabled && use_video ? 'flex' : 'none';
	}
	if (action_screen_share) {
		// Screen share button only shown during video calls
		action_screen_share.style.display = enabled && use_video ? 'flex' : 'none';
	}
	if (action_transfer) {
		action_transfer.style.display = enabled ? 'flex' : 'none';
	}
	// Toggle dialpad icon (shown when not in call) vs keypad icon (shown during call)
	if (action_keypad) {
		action_keypad.style.display = enabled ? 'none' : 'flex';
	}
	if (action_keypad_during_call) {
		action_keypad_during_call.style.display = enabled ? 'flex' : 'none';
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

// Toggle screen sharing - starts or stops screen share stream
async function toggle_screen_share() {
	if (!session || !active_call_is_video) {
		console.log('toggle_screen_share: No active video call');
		return;
	}

	if (is_screen_sharing) {
		// Stop screen sharing
		stop_screen_share();
	} else {
		// Start screen sharing
		start_screen_share();
	}
}

// Start screen sharing using getDisplayMedia API
async function start_screen_share() {
	try {
		console.log('start_screen_share: Initiating screen share...');

		// Check if getDisplayMedia is supported
		if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
			alert('Screen sharing is not supported in this browser.\n\nPlease use Chrome, Edge, or Firefox.\n\nMake sure you are accessing this page via HTTPS.');
			return;
		}

		// Get screen share stream
		screen_share_stream = await navigator.mediaDevices.getDisplayMedia({
			video: {
				cursor: "if-supported",
				width: { ideal: 1280 },
				height: { ideal: 720 },
				frameRate: { ideal: 30 }
			}
		});

		if (screen_share_stream.getVideoTracks().length === 0) {
			console.log('start_screen_share: No video tracks in screen share stream');
			if (screen_share_stream) {
				screen_share_stream.getTracks().forEach(track => track.stop());
			}
			return;
		}

		// Get the screen share video track
		var screen_share_video_track = screen_share_stream.getVideoTracks()[0];

		// Store original camera stream for restoration
		if (session && session.mediaHandler && session.mediaHandler.localStream) {
			original_video_track = session.mediaHandler.localStream.getVideoTracks()[0];
			console.log('start_screen_share: Stored original video track:', original_video_track.id);
		}

		// Add screen share indicator to local video
		var local_video_wrapper = document.getElementById('local_video_wrapper');
		if (local_video_wrapper) {
			local_video_wrapper.classList.add('is_screen_sharing');
		}

		// Set is_screen_sharing flag
		is_screen_sharing = true;

		// REPLACE camera video with screen share in peer connection
		var peer_connection = session ? session.mediaHandler ? session.mediaHandler.peerConnection : null : null;
		if (peer_connection) {
			console.log('start_screen_share: Replacing camera track with screen share track');

			// Find the sender sending the camera video track
			var senders = peer_connection.getSenders();
			var camera_sender = null;
			camera_sender = senders.find(function(sender) {
				return sender.track && sender.track.kind === 'video';
			});

			if (camera_sender) {
				console.log('start_screen_share: Found camera sender:', camera_sender);
				// Replace the camera track with the screen share track
				camera_sender.replaceTrack(screen_share_video_track).then(function() {
					console.log('start_screen_share: Track replaced successfully');
				}).catch(function(err) {
					console.error('start_screen_share: Error replacing track:', err);
				});
			} else {
				console.error('start_screen_share: No camera sender found in peer connection');
			}
		} else {
			console.error('start_screen_share: No peer connection found!');
		}

		// Replace local video preview with screen share
		var local_video = document.getElementById('local_video');
		if (local_video) {
			local_video.srcObject = screen_share_stream;
		}

		// Update action bar icon
		sync_call_action_controls();

		console.log('start_screen_share: Screen sharing started');

		// Listen for user stopping screen share from browser (closing screen share tab/window)
		screen_share_video_track.onended = function() {
			console.log('start_screen_share: Screen share stopped by user (track ended)');
			stop_screen_share();
		};

	} catch (err) {
		console.error('start_screen_share: Failed to start screen share:', err);
		if (err.name === 'NotAllowedError') {
			alert('Screen sharing was denied.\n\nPlease allow screen sharing when prompted by your browser.');
		} else {
			alert('Failed to start screen sharing: ' + err.message);
		}
	}
}

// Stop screen sharing - restore camera video
function stop_screen_share() {
	console.log('stop_screen_share: Stopping screen share...');

	// Get the screen share video track if it exists
	var screen_share_video_track = null;
	if (screen_share_stream && screen_share_stream.getVideoTracks().length > 0) {
		screen_share_video_track = screen_share_stream.getVideoTracks()[0];
	}

	// Remove screen share track from peer connection
	var peer_connection = session ? session.mediaHandler ? session.mediaHandler.peerConnection : null : null;
	if (peer_connection && screen_share_video_track) {
		console.log('stop_screen_share: Removing screen share track from peer connection');
		var sender = peer_connection.getSenders().find(function(s) {
			return s.track && s.track.id === screen_share_video_track.id;
		});
		if (sender) {
			sender.replaceTrack(original_video_track).then(function() {
				console.log('stop_screen_share: Track replaced successfully');
			}).catch(function(err) {
				console.error('stop_screen_share: Error replacing track:', err);
			});
		} else {
			console.error('stop_screen_share: Track sender not found in peer connection');
		}
	}

	is_screen_sharing = false;

	// Stop screen share tracks
	if (screen_share_stream) {
		screen_share_stream.getTracks().forEach(track => track.stop());
		screen_share_stream = null;
	}

	// Restore original camera video to preview
	var local_video = document.getElementById('local_video');
	if (local_video) {
		if (session && session.mediaHandler && session.mediaHandler.localStream) {
			local_video.srcObject = session.mediaHandler.localStream;
		}
	}
	var local_video_wrapper = document.getElementById('local_video_wrapper');
	if (local_video_wrapper) {
		local_video_wrapper.classList.remove('is_screen_sharing');
	}

	// Clear stored reference
	original_video_track = null;

	// Update action bar icon
	sync_call_action_controls();

	console.log('stop_screen_share: Screen sharing stopped');
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

	// Save call duration before clearing answer_time
	save_call_duration();

	reset_media();

	document.getElementById('dialpad').style.display = show_dialpad ? "flex" : "none";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "none";
	document.getElementById('dtmf_keypad').style.display = "none";
	dtmf_keypad_shown = false;
	if (dtmf_display_timer) {
		clearTimeout(dtmf_display_timer);
		dtmf_display_timer = null;
	}
	if (dtmf_flush_timer) {
		clearTimeout(dtmf_flush_timer);
		dtmf_flush_timer = null;
	}
	dtmf_buffer = '';  // Clear any pending DTMF buffer

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
	current_history_entry_id = null;
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
	var entry_id = Date.now();
	var entry = {
		id: entry_id,
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
	return entry_id;
}

function update_history_duration(entry_id, duration_seconds) {
	var history = get_call_history();
	for (var i = 0; i < history.length; i++) {
		if (history[i].id === entry_id) {
			history[i].duration = duration_seconds;
			save_call_history(history);
			return true;
		}
	}
	return false;
}

// Messages storage functions
function get_messages() {
	try {
		var stored = localStorage.getItem('messages');
		return stored ? JSON.parse(stored) : [];
	} catch(e) {
		return [];
	}
}

function save_messages(messages) {
	try {
		localStorage.setItem('messages', JSON.stringify(messages));
	} catch(e) {
		console.log('Could not save messages');
	}
}

function add_message(partner_number, message_text, direction, timestamp) {
	var messages = get_messages();
	var msg = {
		id: Date.now() + Math.random(),
		partner_number: partner_number,
		text: message_text,
		direction: direction,  // 'outgoing' or 'incoming'
		timestamp: timestamp
	};
	messages.push(msg);

	// Keep only last 1000 messages
	if (messages.length > 1000) {
		messages = messages.slice(messages.length - 1000);
	}
	save_messages(messages);
	return msg;
}

function get_conversations() {
	var messages = get_messages();
	var partners = {};

	messages.forEach(function(msg) {
		if (!partners[msg.partner_number]) {
			partners[msg.partner_number] = {
				number: msg.partner_number,
				last_message: msg.text,
				last_timestamp: msg.timestamp,
				unread_count: 0
			};
		}
		if (msg.timestamp > partners[msg.partner_number].last_timestamp) {
			partners[msg.partner_number].last_message = msg.text;
			partners[msg.partner_number].last_timestamp = msg.timestamp;
		}
		if (msg.direction === 'incoming') {
			partners[msg.partner_number].unread_count++;
		}
	});

	// Convert to array and sort by last message time
	var conversations = Object.values(partners);
	conversations.sort(function(a, b) {
		return b.last_timestamp - a.last_timestamp;
	});
	return conversations;
}

function get_conversation_messages(partner_number) {
	var messages = get_messages();
	return messages.filter(function(msg) {
		return msg.partner_number === partner_number;
	});
}

function mark_conversation_read(partner_number) {
	var messages = get_messages();
	messages.forEach(function(msg) {
		if (msg.partner_number === partner_number && msg.direction === 'incoming') {
			msg.read = true;
		}
	});
	save_messages(messages);
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
			autoAnswer: false,  // Disabled - autoAnswer prevents remote video from playing on outgoing calls
			autoAccept: false,  // Don't auto-accept the call
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

// SIP Message handler - receive incoming messages
user_agent.on('message', function (message) {
	// Extract sender information
	var sender_name = message.remoteIdentity ? message.remoteIdentity.displayName : '';
	var sender_number = message.remoteIdentity ? message.remoteIdentity.uri.user : '';
	var partner_number = sender_number || sender_name || 'Unknown';

	// Extract message body - message.body is the raw string content
	var message_body = message.body || '';

	// Log for debugging
	console.log('Received SIP MESSAGE:');
	console.log('  Partner:', partner_number);
	console.log('  Body:', message_body);
	console.log('  Message object:', message);

	// Verify we have valid data
	if (!message_body || message_body.trim() === '') {
		console.log('Warning: Empty message body received');
		return;
	}

	// Save to local storage
	add_message(partner_number, message_body.trim(), 'incoming', Date.now());

	// Update UI if on messages tab
	if (document.getElementById('messages').style.display === 'flex') {
		render_conversations();
	}

	// If in an active conversation with this partner, refresh the view
	if (document.getElementById('conversation').style.display === 'flex' &&
	    current_conversation_partner === partner_number) {
		render_conversation(partner_number);
	}

	// Show notification if not in messages
	if (document.getElementById('messages').style.display !== 'flex' &&
	    document.getElementById('conversation').style.display !== 'flex') {
		show_temporary_status('New message from ' + partner_number, 'fas fa-comment');
	}
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

	// Record incoming call to history and save entry ID for duration tracking
	if (session.incoming_number) {
		current_history_entry_id = add_to_history(session.incoming_number, 'incoming', Date.now(), use_video);
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
			autoAnswer: true,  // Allow remote media to play (including ringback)
			autoAccept: false,  // Don't auto-accept the call
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
  document.getElementById('conversation').style.display = 'none';
  document.getElementById('ringing').style.display = 'none';
  document.getElementById('active').style.display = 'none';
  document.getElementById('dtmf_keypad').style.display = 'none';
  dtmf_keypad_shown = false;
}

function show_dialpad() {
	// Check if dialpad is currently shown (and not in a call)
	var dialpad = document.getElementById('dialpad');
	if (dialpad.style.display === 'grid' && !is_session_active()) {
		// Hide the dialpad
		dialpad.style.display = 'none';
		document.getElementById('action_keypad').classList.remove('active');
	} else {
		// Show the dialpad
		hide_all_panels();
		dialpad.style.display = 'flex';
		update_action_bar_state('dialpad');
	}
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

function show_messages() {
	hide_all_panels();
	render_conversations();
	document.getElementById('messages').style.display = 'flex';
	update_action_bar_state('messages');
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
	} else if (active_panel === 'messages' || active_panel === 'conversation') {
		document.getElementById('action_messages').classList.add('active');
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

		// Format duration if available
		var duration_str = '';
		if (entry.call_type !== 'missed' && entry.duration > 0) {
			duration_str = ' • ' + format_duration(entry.duration);
		}

		history_html = '	<div class="history_icon ' + entry.call_type + '">';
		history_html += '	<i class="fas ' + icon_class + '"></i>';
		history_html += '	</div>';
		history_html += '	<div class="history_details">';
		history_html += '		<div class="history_number">' + sanitize_string(entry.number) + '</div>';
		history_html += '		<div class="history_meta">' + call_type_name(entry.call_type) + duration_str + ' • ' + ago_str + '</div>';
		history_html += '	</div>';
		history_html += '	<div class="history_time">';
		history_html += '		' + time_str;
		history_html += '	</div>'
		historyDiv.innerHTML = history_html;
		container.appendChild(historyDiv);
	});
}

// Format duration in seconds to human-readable string (e.g., "2m 34s" or "1h 5m")
function format_duration(seconds) {
	if (seconds < 60) {
		return seconds + 's';
	}
	var minutes = Math.floor(seconds / 60);
	var remaining_seconds = seconds % 60;
	if (minutes < 60) {
		return minutes + 'm' + (remaining_seconds > 0 ? ' ' + remaining_seconds + 's' : '');
	}
	var hours = Math.floor(minutes / 60);
	remaining_minutes = minutes % 60;
	return hours + 'h' + (remaining_minutes > 0 ? ' ' + remaining_minutes + 'm' : '');
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

// Message formatting helper
function format_message_time(timestamp) {
	var date = new Date(timestamp);
	var time_str = date.toLocaleTimeString([], {
		timeZone: time_zone,
		hour: '2-digit',
		minute: '2-digit',
		hour12: true
	});
	return time_str;
}

// Format message preview (truncate long messages)
function format_message_preview(text) {
	if (text.length > 30) {
		return text.substring(0, 30) + '...';
	}
	return text;
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

// Function to save the final call duration to history when call ends
function save_call_duration() {
	if (answer_time && current_history_entry_id !== null) {
		var elapsed_time = Date.now() - answer_time;
		var duration_seconds = Math.floor(elapsed_time / 1000);
		if (duration_seconds > 0) {
			update_history_duration(current_history_entry_id, duration_seconds);
		}
	}
}

// Update elapsed time every second
setInterval(get_session_time, 1000);

// Function to reset media after a call ends
// Stops all media tracks to prevent camera/microphone from remaining active
function reset_media() {
	var videoElements = [document.getElementById('remote_video'), document.getElementById('local_video')];
	videoElements.forEach(function(video) {
		if (video && video.srcObject) {
			// Stop all tracks in the media stream (prevents camera/mic staying active)
			var tracks = video.srcObject.getTracks();
			tracks.forEach(function(track) {
				track.stop();
			});
		}
		if (video) {
			video.srcObject = null;
			video.pause();
		}
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

	// Save call duration to history before resetting UI
	save_call_duration();

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

// Transfer the current call to another number (blind/attended transfer via SIP REFER)
function transfer_call(target_number) {
	if (!session) { return; }
	if (!target_number || target_number.trim() === '') { return; }

	// Create REFER request to transfer current call
	var refer_to = 'sip:' + target_number.trim() + '@' + '<?php echo $domain_name; ?>';

	// Use session.refer() if available, otherwise use session.ua.request()
	if (session.refer) {
		session.refer(refer_to).send();
		show_temporary_status('Transferring to ' + target_number, 'fas fa-phone-square');
	} else {
		// Fallback: try using the UA's invite capability for transfer
		show_temporary_status('Transfer not supported', 'fas fa-exclamation-triangle');
	}
}

// Show transfer dialog/prompt
function show_transfer_prompt() {
	if (!session) { return; }

	// Get current destination value
	var current_value = document.getElementById('destination').value || '';

	// Use a custom prompt for transfer
	var transfer_number = prompt('Enter extension/number to transfer to:', current_value);

	if (transfer_number && transfer_number.trim() !== '') {
		transfer_call(transfer_number);
	}
}

function decline() {
	// Record missed call
	if (session && session.incoming_number) {
		add_to_history(session.incoming_number, 'missed', Date.now());
	}

	// Hang up to decline the call
	hangup();
}

// Send a SIP MESSAGE to a target
function send_message(partner_number, message_text) {
	if (!partner_number || !partner_number.trim()) {
		console.log('send_message: Invalid partner number');
		return false;
	}
	if (!message_text || !message_text.trim()) {
		console.log('send_message: Invalid message text');
		return false;
	}

	var target_uri = 'sip:' + partner_number.trim() + '@' + '<?php echo $domain_name; ?>';
	var body = message_text.trim();

	console.log('send_message: Sending to', target_uri, 'body:', body);
	console.log('send_message: User agent object:', user_agent);
	console.log('send_message: User agent methods:', Object.keys(user_agent));

	// Use SIP.UA to send MESSAGE - correct syntax for sipjs 0.7.8
	// UA.prototype.message(target, body, options)
	var msg = user_agent.message(target_uri, body);

	console.log('send_message: Message object created:', msg);
	console.log('send_message: Message type:', typeof msg);
	console.log('send_message: Message methods:', msg ? Object.keys(msg) : 'null');

	// Set up response handlers BEFORE sending
	if (msg) {
		msg.on('accepted', function(response) {
			console.log('send_message: Message accepted (200 OK)', response);
		});

		msg.on('failed', function(data) {
			console.log('send_message: Message failed to send', data);
		});

		msg.on('rejected', function(response) {
			console.log('send_message: Message rejected:', response ? response.status_code : 'unknown', response);
		});

		msg.on('progress', function(data) {
			console.log('send_message: Progress:', data);
		});

		// Send the message
		console.log('send_message: Calling msg.send()...');
		msg.send();
		console.log('send_message: msg.send() completed');
	} else {
		console.log('send_message: ERROR - msg object is null!');
		return false;
	}

	// Save as outgoing message optimistically
	add_message(partner_number, message_text.trim(), 'outgoing', Date.now());

	return true;
}

// Send current message from input
function send_current_message() {
	var input = document.getElementById('message_input');
	if (!input) return;

	var message_text = input.value.trim();
	if (!message_text || !current_conversation_partner) {
		return;
	}

	// Send the message
	send_message(current_conversation_partner, message_text);

	// Clear input and focus
	input.value = '';
	input.focus();

	// Refresh conversation view
	render_conversation(current_conversation_partner);
}

// Open conversation with a partner
function open_conversation(partner_number) {
	current_conversation_partner = partner_number;
	hide_all_panels();
	document.getElementById('conversation').style.display = 'flex';
	update_action_bar_state('conversation');
	render_conversation(partner_number);

	// Clear input and focus
	var input = document.getElementById('message_input');
	if (input) {
		input.value = '';
		input.focus();
	}
}

// Open new conversation prompt
function new_conversation() {
	var partner_number = prompt('Enter extension or number to message:');
	if (partner_number && partner_number.trim()) {
		open_conversation(partner_number.trim());
	}
}

// Render conversations list
function render_conversations() {
	var container = document.getElementById('messages_list');
	if (!container) return;
	container.innerHTML = '';

	var conversations = get_conversations();

	if (conversations.length === 0) {
		container.innerHTML = '<div style="text-align: center; color: #ccc; padding: 40px; font-size: 16px;">No messages yet</div>';
		return;
	}

	conversations.forEach(function(conv) {
		var convDiv = document.createElement('div');
		convDiv.className = 'message_conversation_item';
		convDiv.onclick = function() { open_conversation(conv.number); };

		var preview = format_message_preview(conv.last_message);
		var time_str = format_message_time(conv.last_timestamp);

		var html = '<div class="conv_icon">';
		html += '<i class="fas fa-user"></i>';
		html += '</div>';
		html += '<div class="conv_info">';
		html += '<div class="conv_name">' + sanitize_string(conv.number) + '</div>';
		html += '<div class="conv_preview">' + sanitize_string(preview) + '</div>';
		html += '</div>';
		html += '<div class="conv_meta">';
		html += '<div class="conv_time">' + time_str + '</div>';
		html += '</div>';

		convDiv.innerHTML = html;
		container.appendChild(convDiv);
	});
}

// Render single conversation
function render_conversation(partner_number) {
	var messages_container = document.getElementById('messages_container');
	var title_element = document.getElementById('conversation_title');
	if (!messages_container || !title_element) return;

	// Set title
	title_element.textContent = partner_number;

	// Get and render messages
	var messages = get_conversation_messages(partner_number);
	messages_container.innerHTML = '';

	if (messages.length === 0) {
		messages_container.innerHTML = '<div style="text-align: center; color: #ccc; padding: 40px; font-size: 16px;">No messages yet. Start the conversation!</div>';
		return;
	}

	messages.forEach(function(msg) {
		var msgDiv = document.createElement('div');
		msgDiv.className = 'message_bubble ' + (msg.direction === 'outgoing' ? 'outgoing' : 'incoming');

		var bubble_content = '<div class="bubble_text">' + sanitize_string(msg.text) + '</div>';
		bubble_content += '<div class="bubble_time">' + format_message_time(msg.timestamp) + '</div>';

		msgDiv.innerHTML = bubble_content;
		messages_container.appendChild(msgDiv);
	});

	// Scroll to bottom
	messages_container.scrollTop = messages_container.scrollHeight;
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

// Show DTMF keypad during active call
function show_dtmf_keypad() {
	if (!is_session_active()) {
		return;
	}

	hide_all_panels();
	document.getElementById('dtmf_keypad').style.display = 'flex';
	document.getElementById('dtmf_destination').value = '';
	dtmf_keypad_shown = true;
}

// Toggle DTMF keypad during active call - shows it if hidden, hides it if shown
function show_keypad() {
	if (!is_session_active()) {
		return;
	}

	var dtmf_keypad = document.getElementById('dtmf_keypad');

	if (dtmf_keypad_shown && dtmf_keypad.style.display === 'flex') {
		// Hide DTMF keypad, show active call panel
		dtmf_keypad.style.display = 'none';
		dtmf_keypad_shown = false;
		document.getElementById('active').style.display = 'flex';

		// Switch action bar icons back to dialpad
		document.getElementById('action_keypad').style.display = 'flex';
		document.getElementById('action_keypad_during_call').style.display = 'none';
	} else {
		// Show DTMF keypad
		show_dtmf_keypad();
	}
}

// Send DTMF digit through active SIP session (with buffering to beat FreeSWITCH inter-digit timeout)
function send_dtmf(digit) {
	if (!session || session_hungup) {
		return;
	}

	// Check if session is in CONFIRMED or ANSWERED state
	if (session.status !== SIP.Session.C.STATUS_CONFIRMED && session.status !== SIP.Session.C.STATUS_ANSWERED) {
		return;
	}

	// Add digit to buffer
	dtmf_buffer += digit;
	console.log('send_dtmf: Buffered digit:', digit, '| Buffer:', dtmf_buffer);

	// Visual feedback: add digit to display
	var display = document.getElementById('dtmf_destination');
	if (display) {
		display.value += digit;
	}

	// Highlight pressed key
	var keys = document.querySelectorAll('.dialpad_box.dtmf_digit');
	keys.forEach(function(key) {
		var strong = key.querySelector('strong');
		if (strong && strong.textContent === digit) {
			key.classList.add('dtmf_pressed');
			setTimeout(function() { key.classList.remove('dtmf_pressed'); }, 150);
		}
	});

	// Auto-flush buffer after 2000ms of inactivity (user has 2 seconds to enter digits)
	if (dtmf_flush_timer) {
		clearTimeout(dtmf_flush_timer);
	}
	dtmf_flush_timer = setTimeout(function() {
		console.log('send_dtmf: Auto-flushing buffer:', dtmf_buffer);
		flush_dtmf_buffer();
	}, 2000);
}

// Clear the display after a short delay (visual feedback cleanup)
function clear_dtmf_display() {
	var display = document.getElementById('dtmf_destination');
	if (display) {
		display.value = '';
	}
}

// Flush the DTMF buffer - send ALL digits as a single sequence via SIP INFO
function flush_dtmf_buffer() {
	if (!dtmf_buffer || !session || session_hungup) {
		return;
	}

	// Ensure session is still active
	if (session.status !== SIP.Session.C.STATUS_CONFIRMED && session.status !== SIP.Session.C.STATUS_ANSWERED) {
		dtmf_buffer = '';
		return;
	}

	var digits = dtmf_buffer;
	dtmf_buffer = '';  // Clear buffer immediately

	console.log('flush_dtmf_buffer: Sending FULL sequence:', digits);

	// Clear display after a short delay so user can see what they entered
	var display = document.getElementById('dtmf_destination');
	if (display) {
		setTimeout(function() {
			if (display) {
				display.value = '';
			}
		}, 500);
	}

	// Check if RFC 2833 is available
	var remote = session.remote_description ? session.remote_description.sdp : null;
	var uses_rfc2833 = remote && remote.indexOf('a=rtpmap:98') !== -1;
	console.log('flush_dtmf_buffer: Using', uses_rfc2833 ? 'RFC 2833' : 'SIP INFO');

	if (uses_rfc2833) {
		// RFC 2833 - use SIP.js built-in sequence sending with inter-tone gap
		// duration: how long each tone lasts (ms)
		// interToneGap: delay between tones (ms) - must be > 0 for sequence
		session.dtmf(digits, {
			duration: 100,          // 100ms tone duration
			interToneGap: 100      // 100ms between tones (faster than 3000ms timeout)
		});
	} else {
		// SIP INFO - each digit needs its own request, send as sequence
		// SIP.js 0.7.8 handles multi-character string by sending each as separate INFO
		session.dtmf(digits, {
			duration: 100           // Duration per tone
		});
	}

	console.log('flush_dtmf_buffer: Started sending sequence');
}

document.addEventListener('keydown', function(e) {
	if (!document.getElementById('destination')) {
		return;
	}

	// Handle DTMF keypad input when keypad is shown during call
	if (dtmf_keypad_shown) {
		if (e.key >= '0' && e.key <= '9' || e.key === '*' || e.key === '#') {
			e.preventDefault();
			send_dtmf(e.key);
			return;
		}

		if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			// Clear the visual display of last digit
			var display = document.getElementById('dtmf_destination');
			if (display) {
				display.value = display.value.slice(0, -1);
			}
			return;
		}

		// Pressing Enter on DTMF keypad does nothing specific
		if (e.key === 'Enter') {
			e.preventDefault();
			return;
		}

		if (e.key === 'Escape') {
			e.preventDefault();
			show_dialpad();
			return;
		}
	}

	// Regular dialpad input (not in DTMF keypad mode)
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
		// Check if we're in conversation view - send message if so
		if (document.getElementById('conversation').style.display === 'flex') {
			send_current_message();
			return;
		}
		// Otherwise, make a call
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

	var remote_video = document.getElementById('remote_video');
	if (remote_video) {
		remote_video.addEventListener('loadedmetadata', apply_video_fit_layout);
	}

	window.addEventListener('resize', apply_video_fit_layout);
	apply_video_fit_layout();
});
