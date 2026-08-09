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
		alert('Camera access is not available.\n\nFalling back to audio call.\n\nThis phone app requires HTTPS to access your camera.');
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

// ============================================================
// MULTI-CALL: Outgoing Call Function (Updated for multi-call)
// ============================================================

/**
 * Send an outgoing call - creates a new call session entry
 * Automatically puts any current active call on hold when making a new call
 * @param {boolean} use_video - Whether this is a video call
 */
async function send_call(use_video) {
	// Get the destination number
	let destination = document.getElementById('destination').value;

	// Return immediately if there is no destination
	if (destination.length == 0) {
		return;
	}

	// Check call limit
	if (!check_call_limit()) {
		show_temporary_status('Maximum calls reached (' + call_waiting_config.max_concurrent_calls + ')', 'fas fa-exclamation-circle');
		return;
	}

	// Set the session state
	session_hungup = false;

	// ============================================================
	// MULTI-CALL: Auto-hold current call when initiating new outgoing call
	// ============================================================
	let previous_call = get_selected_call_session();
	if (previous_call && !previous_call.is_on_hold && previous_call.session && previous_call.session.status !== SIP.Session.C.STATUS_TERMINATED) {
		console.log('[Call Switching] Putting current call on hold before new outgoing call');
		previous_call.is_on_hold = true;
		// Use Promise.resolve() to handle cases where hold() returns undefined
		Promise.resolve(previous_call.session.hold()).catch(function(err) {
			console.warn('[Call Switching] Failed to hold previous call:', err);
		});
	}

	// Add to call history as outgoing and save entry ID for duration tracking
	current_history_entry_id = add_to_history(destination, 'outgoing', Date.now(), use_video);

	// Create a new call session entry
	let call_id = create_call_session('outgoing', destination, '', use_video);
	update_active_calls_button();
	let call_session = get_call_session(call_id);
	let current_session = null;

	// Show or hide the panels
	hide_all_panels();
	document.getElementById('active').style.display = "none";

	// Update status bar
	var call_type = use_video ? 'Calling Video ' : 'Calling ';
	document.getElementById('status_text').textContent = call_type + destination;
	document.querySelector('#status_bar .status_icon i').className = use_video ? 'fas fa-video' : 'fas fa-phone';

	set_hangup_visibility(true);
	if (use_video) {
		document.getElementById('video_container').style.display = "block";
		if (!camera_available) {
			document.getElementById('local_video_wrapper').classList.add('local_preview_hidden');
			document.getElementById('local_video').style.display = "none";
		} else {
			document.getElementById('local_video_wrapper').classList.remove('local_preview_hidden');
			document.getElementById('local_video').style.display = "inline";
		}
		document.getElementById('remote_video').style.display = "inline";
	}
	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('unmute_audio').style.display = "none";
	document.getElementById('hold').style.display = "none";
	document.getElementById('unhold').style.display = "none";

	// Handle tab audio selection for Chromium browsers
	var call_options = await get_media_options(use_video);

	// Define the common session event handlers
	function setup_outgoing_session_events(current_sess, dest, use_vid) {
		current_sess.local_ended = false;
		start_call_tone('outgoing');

		current_sess.on('progress', function() {
			start_call_tone('outgoing');
			if (use_vid) {
				ensure_local_video_preview(current_sess);
			}
		});

		current_sess.on('accepted', function() {
			stop_call_tone();
			call_session.start_time = Date.now();
			call_session.is_video = use_vid;
			call_session.session = current_sess;
			active_call_is_video = use_vid;
			set_hangup_visibility(true);
			document.getElementById('mute_audio').style.display = "inline";
			document.getElementById('unmute_audio').style.display = "none";
			document.getElementById('hold').style.display = "inline";
			document.getElementById('unhold').style.display = "none";
			document.getElementById('mute_video').style.display = use_vid ? "inline" : "none";
			document.getElementById('unmute_video').style.display = "none";
			set_call_action_mode(true, use_vid);

			var remote_display_name = current_sess.display_name || (current_sess.remoteIdentity && current_sess.remoteIdentity.displayName) || dest;
			var remote_number = current_sess.uri_user || (current_sess.remoteIdentity && current_sess.remoteIdentity.uri && current_sess.remoteIdentity.uri.user) || dest;
			active_call_display_name = remote_display_name;
			active_call_number = remote_number;
			call_session.display_name = remote_display_name;
			call_session.number = remote_number;
			update_video_stream_info(remote_display_name, remote_number, use_vid);
			update_active_call_status(use_vid, remote_display_name, remote_number);
			if (use_vid) {
				ensure_local_video_preview(current_sess);
			}

			// Set the caller ID to the destination
			document.getElementById('ringing_caller_id').innerHTML = dest;
			document.getElementById('active_caller_id').innerHTML = dest;

			var video_indicator = use_vid ? "<div style='color: #1eba00; font-size: 0.7em;'><i class='fas fa-video'></i> Video Call</div>" : "";
			document.getElementById('ringing_caller_id').innerHTML = "<div>" + sanitize_string(current_sess.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(current_sess.uri_user) + "' target='_blank'>" + sanitize_string(current_sess.uri_user) + "</a></div>" + video_indicator;
			document.getElementById('active_caller_id').innerHTML = document.getElementById('ringing_caller_id').innerHTML;

			// Show or hide the panels
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

			// Update call switcher
			update_active_calls_panel();
		});

		current_sess.on('bye', function() {
			stop_call_tone();
			call_session.local_ended = true;
			
			// Remove this call from the registry
			remove_call_session(call_id);
			
			if (!current_sess.local_ended) {
				// Check if there are other active calls
				let remaining_calls = get_active_call_sessions();
				if (remaining_calls.length > 0) {
					// Switch to another active call
					select_call_session(remaining_calls[0].id);
				} else {
					reset_call_ui_state(true);
				}
			}
		});

		current_sess.on('failed', function() {
			handle_outgoing_session_failure(current_sess, 'Call failed');
			call_session.local_ended = true;
			remove_call_session(call_id);
		});

		current_sess.on('rejected', function() {
			handle_outgoing_session_failure(current_sess, 'Call rejected');
			call_session.local_ended = true;
			remove_call_session(call_id);
		});

		current_sess.on('cancel', function() {
			handle_outgoing_session_failure(current_sess, 'Call canceled');
			call_session.local_ended = true;
			remove_call_session(call_id);
		});

		// Unmute the audio
		audio_muted = false;
		call_session.is_muted = false;

		// Wait until the call is answered before starting the timer
		answer_time = null;
	}

	if (selected_audio_input_device_id === 'tab-audio') {
		try {
			var tab_stream = await navigator.mediaDevices.getDisplayMedia({
				video: false,
				audio: true
			});

			if (tab_stream.getAudioTracks().length === 0) {
				console.error('send_call: No audio track captured from tab');
				alert('Failed to capture tab audio. Please make sure to check "Share tab audio" when prompted.');
				return;
			}

			session._tab_audio_stream = tab_stream;
			var tab_audio_track = tab_stream.getAudioTracks()[0];

			// Make a call using a sip invite
			current_session = user_agent.invite('sip:'+destination+'@<?php echo $domain_name; ?>', call_options);
			call_session.session = current_session;

			// Once the call is accepted, replace the audio track with tab audio
			current_session.on('accepted', function() {
				var sender = current_session.mediaHandler.peerConnection.getSenders().find(function(s) {
					return s.track && s.track.kind === 'audio';
				});

				if (sender) {
					sender.replaceTrack(tab_audio_track).catch(function(err) {
						console.error('send_call: Error replacing track with tab audio:', err);
					});
				}

				if (current_session.mediaHandler.localStream) {
					current_session.mediaHandler.localStream.addTrack(tab_audio_track);
				}

				// Listen for the stream ending
				tab_audio_track.onended = function() {
					console.log('send_call: Tab audio stream ended');
					selected_audio_input_device_id = '';
					var select = document.getElementById('audio_input_select');
					if (select) {
						select.value = '';
					}
				};
			});

			if (use_video) {
				ensure_local_video_preview(current_session);
			}

			setup_outgoing_session_events(current_session, destination, use_video);
			return;
		} catch (err) {
			console.error('send_call: Tab audio capture failed:', err);
		}
	}

	// Make a call using a sip invite
	current_session = user_agent.invite('sip:'+destination+'@<?php echo $domain_name; ?>', call_options);
	call_session.session = current_session;

	if (use_video) {
		ensure_local_video_preview(current_session);
	}

	setup_outgoing_session_events(current_session, destination, use_video);
}

// ============================================================
// END MULTI-CALL: Outgoing Call Function
// ============================================================

// Check if an incoming SIP INVITE contains video capability
function detect_video_invite(session) {
	if (!session || !session.request_data) return false;
	// Check if the SIP INVITE contains video media type
	return session.request_data.indexOf('media="video"') !== -1 ||
		session.request_data.indexOf('m=video') !== -1;
}

// Check if camera permissions are available before attempting video calls
async function check_camera_permissions() {
	try {
		// First, check if any video input devices exist to avoid NotFoundError from getUserMedia
		if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const hasVideoDevice = devices.some(device => device.kind === 'videoinput');
			if (!hasVideoDevice) {
				console.log('No video input devices found. Camera unavailable.');
				camera_available = false;
				return false;
			}
		}

		var constraints = { video: true, audio: false };
		var stream = await navigator.mediaDevices.getUserMedia(constraints);
		// Release the stream immediately after checking
		var tracks = stream.getTracks();
		tracks.forEach(track => track.stop());
		camera_available = true;
		return true;
	} catch (err) {
		if (err.name !== 'NotFoundError') {
			console.warn('Camera access not available:', err.name, err.message);
		}
		camera_available = false;
		return false;
	}
}

// ============================================================
// MULTI-CALL SUPPORT - Call Registry Infrastructure
// ============================================================

// Global call registry - stores all active call sessions
let call_session_list = {};
let selected_call_session_id = null;  // The currently selected/active call

// Call session counter for unique IDs
let call_session_counter = 0;

// Call waiting configuration
let call_waiting_config = {
  enabled: true,
  max_concurrent_calls: 3,
  waiting_tone_file: 'resources/sounds/ringback/waiting.mp3',
  auto_answer: false
};

// Media resource manager for video/camera sharing constraints
let media_resource_manager = {
  camera_track: null,
  active_video_calls: []
};

// ============================================================
// END MULTI-CALL INFRASTRUCTURE
// ============================================================

// ============================================================
// MULTI-CALL SUPPORT - Call Registry Helper Functions
// ============================================================

/**
 * Create a new call session entry
 * @param {string} call_direction - 'outgoing' or 'incoming'
 * @param {string} call_number - The phone number/user
 * @param {string} call_display_name - Display name of remote party
 * @param {boolean} is_video - Whether this is a video call
 * @returns {string} The call session ID
 */
function create_call_session(call_direction, call_number, call_display_name, is_video) {
	call_session_counter++;
	let call_id = call_session_counter;

	let call_session = {
		id: call_id,
		session: null,
		display_name: call_display_name || '',
		number: call_number || '',
		direction: call_direction,
		is_video: is_video || false,
		is_on_hold: false,
		is_muted: false,
		start_time: null,
		history_entry_id: null,
		local_ended: false,
		conversation_partner: null,
		transfer_target: null,
		has_video_stream: false,
		media_stream: null
	};

	call_session_list[call_id] = call_session;
	selected_call_session_id = call_id;

	console.log('[Call Registry] Created call session:', call_id, call_session);
	return call_id;
}

/**
 * Get a call session by ID
 * @param {string} call_id
 * @returns {object|null}
 */
function get_call_session(call_id) {
	return call_session_list[call_id] || null;
}

/**
 * Get the currently selected call session
 * @returns {object|null}
 */
function get_selected_call_session() {
	if (selected_call_session_id && call_session_list[selected_call_session_id]) {
		return call_session_list[selected_call_session_id];
	}
	return null;
}

/**
 * Get all active (non-hungup) call sessions
 * @returns {Array}
 */
function get_active_call_sessions() {
	let active_calls = [];
	Object.keys(call_session_list).forEach(function(call_id) {
		let call = call_session_list[call_id];
		if (!call.local_ended && call.session && call.session.status !== SIP.Session.C.STATUS_TERMINATED) {
			active_calls.push(call);
		}
	});
	return active_calls;
}

/**
 * Get all held call sessions
 * @returns {Array}
 */
function get_held_call_sessions() {
	let held_calls = [];
	Object.keys(call_session_list).forEach(function(call_id) {
		let call = call_session_list[call_id];
		if (call.is_on_hold && !call.local_ended) {
			held_calls.push(call);
		}
	});
	return held_calls;
}

/**
 * Select a call session as the active/selected one
 * Manages audio/video tracks to ensure only the active call has audio
 * @param {string} call_id
 */
function select_call_session(call_id) {
	if (call_session_list[call_id]) {
		let previous_selected = get_selected_call_session();
		
		// If switching away from a call, put it on hold and stop its audio
		if (previous_selected && previous_selected.id !== call_id) {
			console.log('[Call Switching] Putting previous call on hold and stopping audio');
			if (!previous_selected.is_on_hold) {
				previous_selected.is_on_hold = true;
				if (previous_selected.session && previous_selected.session.status !== SIP.Session.C.STATUS_TERMINATED) {
					// Use Promise.resolve() to handle cases where hold() returns undefined
					Promise.resolve(previous_selected.session.hold()).catch(function(err) {
						console.warn('[Call Switching] Failed to hold previous call:', err);
					});
				}
			}
			// Stop audio tracks from the previous call's peer connection
			if (previous_selected.session && previous_selected.session.mediaHandler && previous_selected.session.mediaHandler.peerConnection) {
				let senders = previous_selected.session.mediaHandler.peerConnection.getSenders();
				for (let i = 0; i < senders.length; i++) {
					if (senders[i].track && senders[i].track.kind === 'audio') {
						senders[i].track.enabled = false;
					}
				}
			}
		}
		
		selected_call_session_id = call_id;
		console.log('[Call Registry] Selected call session:', call_id);
		update_active_calls_panel();
		update_call_controls_for_selected_call();
		
		// Enable audio tracks for the newly selected call
		let new_selected = get_selected_call_session();
		if (new_selected && new_selected.session && new_selected.session.mediaHandler && new_selected.session.mediaHandler.peerConnection) {
			let senders = new_selected.session.mediaHandler.peerConnection.getSenders();
			for (let i = 0; i < senders.length; i++) {
				if (senders[i].track && senders[i].track.kind === 'audio') {
					senders[i].track.enabled = true;
				}
			}
			// Also enable local stream audio tracks
			if (new_selected.session.mediaHandler.localStream) {
				let audioTracks = new_selected.session.mediaHandler.localStream.getAudioTracks();
				for (let i = 0; i < audioTracks.length; i++) {
					audioTracks[i].enabled = true;
				}
			}
		}
		
		return true;
	}
	return false;
}

/**
 * Remove a call session from the registry
 * @param {string} call_id
 */
function remove_call_session(call_id) {
	if (call_session_list[call_id]) {
		console.log('[Call Registry] Removing call session:', call_id);
		delete call_session_list[call_id];

		// If the removed call was the selected one, select another active call
		if (selected_call_session_id === call_id) {
			let active_calls = get_active_call_sessions();
			if (active_calls.length > 0) {
				select_call_session(active_calls[0].id);
			} else {
				selected_call_session_id = null;
			}
		}

		// Update the call switcher UI to reflect the removed call
		update_active_calls_panel();
	}
}

/**
 * Check if there are available slots for new calls
 * @returns {boolean}
 */
function check_call_limit() {
	let active_count = Object.keys(call_session_list).length;
	return active_count < call_waiting_config.max_concurrent_calls;
}

/**
 * Get the number of available call slots
 * @returns {number}
 */
function get_available_call_slots() {
	let active_count = Object.keys(call_session_list).length;
	return call_waiting_config.max_concurrent_calls - active_count;
}

/**
 * Check if any call has video enabled
 * @returns {boolean}
 */
function has_active_video_call() {
	let active_calls = get_active_call_sessions();
	for (let i = 0; i < active_calls.length; i++) {
		if (active_calls[i].is_video) {
			return true;
		}
	}
	return false;
}

/**
 * Get the total number of active calls
 * @returns {number}
 */
function get_active_call_count() {
	return Object.keys(call_session_list).length;
}

// ============================================================
// END MULTI-CALL SUPPORT - Call Registry Helper Functions
// ============================================================

let user_agent;
let answer_time;
let session = null;
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
let current_history_entry_id = null;  // Track current call's history entry for duration tracking
let current_conversation_partner = null;  // Current active conversation partner
let dtmf_display_timer = null;  // Timer for clearing DTMF display
let dtmf_flush_timer = null;  // Timer for auto-flushing DTMF buffer
let dtmf_buffer = '';  // Buffer for DTMF digits (to send as batch)
let is_screen_sharing = false;  // Track if screen sharing is active
let screen_share_stream = null;  // Store the screen share stream
let original_video_track = null;  // Store original camera video track for restoration
let screen_share_sender = null;  // Store the RTCRtpSender used for screen share replacement
let audio_muted = false;

// Tab audio variables for screen sharing
let tab_audio_stream = null;  // Store the tab audio stream
let tab_audio_track_id = null;  // Store the tab audio track ID
let original_audio_track = null;  // Store original audio track for restoration

// Audio input/output device selection
let selected_audio_input_device_id = get_phone_setting('audio_input_device', '');
let selected_audio_output_device_id = get_phone_setting('audio_output_device', '');
let selected_video_input_device_id = get_phone_setting('video_input_device', '');
let is_chromium_browser = false;

// Ringback sound selection (for outgoing calls ringing)
let selected_ringback_sound = get_phone_setting('ringback_sound', 'default.mp3');

// Ringtone selection (for incoming calls ringing)
let selected_ringtone = get_phone_setting('ringtone', 'default.mp3');

// Phone settings persistence helpers
function save_phone_setting(key, value) {
	try {
		localStorage.setItem('phone_setting_' + key, value);
	} catch (e) {
		console.warn('Could not save phone setting ' + key + ':', e);
	}
}

function get_phone_setting(key, defaultValue) {
	try {
		var stored = localStorage.getItem('phone_setting_' + key);
		return stored !== null ? stored : defaultValue;
	} catch (e) {
		console.warn('Could not load phone setting ' + key + ':', e);
		return defaultValue;
	}
}

// Check if browser is Chrome/Chromium-based
function check_chromium_browser() {
	var ua = navigator.userAgent;
	var vendor = navigator.vendor || '';

	// Check for Chrome, Edge, Opera, and other Chromium-based browsers
	is_chromium_browser = (
		/Chrome/.test(ua) && /Google Inc/.test(vendor) ||  // Google Chrome
		/Chromium/.test(ua) ||  // Chromium-based (Edge, Opera, etc.)
		/OPT\//.test(ua) ||  // Opera
		/Edg/.test(ua) ||  // Microsoft Edge
		/OPR/.test(ua)  // Opera
	);

	return is_chromium_browser;
}

// Enumerate and populate audio input devices
async function enumerate_audio_devices() {
	var select = document.getElementById('audio_input_select');
	if (!select) {
		return;
	}

	// Check if browser is Chromium-based
	check_chromium_browser();

	// Clear existing options
	select.innerHTML = '<option value="">Default Device</option>';

	try {
		// Request permission first to ensure devices are available
		await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch (err) {
		console.warn('Could not enumerate audio devices:', err);
		// Still add tab audio option for Chromium browsers even if enumeration fails
		if (is_chromium_browser) {
			var option = document.createElement('option');
			option.value = 'tab-audio';
			option.textContent = 'Tab Audio (Chrome/Edge)';
			option.setAttribute('data-device-id', 'tab-audio');
			option.setAttribute('data-is-tab-audio', 'true');
			select.appendChild(option);
		}
		return;
	}

	// Get all media devices
	var devices = await navigator.mediaDevices.enumerateDevices();
	var audioInputDevices = [];

	// Filter audio input devices
	devices.forEach(function(device) {
		if (device.kind === 'audioinput') {
			audioInputDevices.push(device);
		}
	});

	// Populate the select dropdown
	var defaultFound = false;
	audioInputDevices.forEach(function(device) {
		var option = document.createElement('option');
		option.value = device.deviceId;
		// Use label if available, otherwise use device ID
		var label = device.label || 'Device ' + device.deviceId.substring(0, 8);
		option.textContent = label;
		option.setAttribute('data-device-id', device.deviceId);

		// Mark the default device if it's the first one found (browser default)
		if (!defaultFound && selected_audio_input_device_id === '') {
			defaultFound = true;
		}

		select.appendChild(option);
	});

	// Add tab audio option for Chromium browsers
	if (is_chromium_browser) {
		var tabOption = document.createElement('option');
		tabOption.value = 'tab-audio';
		tabOption.textContent = 'Tab Audio (Chrome/Edge)';
		tabOption.setAttribute('data-device-id', 'tab-audio');
		tabOption.setAttribute('data-is-tab-audio', 'true');
		select.appendChild(tabOption);
	}

	// Restore the selected device
	if (selected_audio_input_device_id) {
		select.value = selected_audio_input_device_id;
	}
}

// Enumerate and populate video input devices
async function enumerate_video_devices() {
	var select = document.getElementById('video_input_select');
	if (!select) {
		return;
	}

	select.innerHTML = '<option value="">Default Device</option>';

	if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
		console.warn('enumerate_video_devices: mediaDevices.enumerateDevices not supported');
		return;
	}

	try {
		var stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
		if (stream) {
			var tracks = stream.getTracks();
			tracks.forEach(function(track) {
				track.stop();
			});
		}
	} catch (err) {
		console.warn('Could not enumerate video devices:', err);
		return;
	}

	var devices = await navigator.mediaDevices.enumerateDevices();
	var videoInputDevices = devices.filter(function(device) {
		return device.kind === 'videoinput';
	});

	if (videoInputDevices.length === 1) {
		selected_video_input_device_id = videoInputDevices[0].deviceId;
	}

	videoInputDevices.forEach(function(device) {
		var option = document.createElement('option');
		option.value = device.deviceId;
		option.textContent = device.label || 'Camera ' + device.deviceId.substring(0, 8);
		select.appendChild(option);
	});

	if (selected_video_input_device_id) {
		select.value = selected_video_input_device_id;
	}
}

// Enumerate and populate audio output devices
async function enumerate_audio_output_devices() {
	var select = document.getElementById('audio_output_select');
	if (!select) {
		return;
	}

	select.innerHTML = '<option value="">Default Device</option>';

	if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
		console.warn('enumerate_audio_output_devices: mediaDevices.enumerateDevices not supported');
		return;
	}

	try {
		await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch (err) {
		console.warn('Could not enumerate audio output devices:', err);
	}

	var devices = await navigator.mediaDevices.enumerateDevices();
	var audioOutputDevices = devices.filter(function(device) {
		return device.kind === 'audiooutput';
	});

	audioOutputDevices.forEach(function(device) {
		var option = document.createElement('option');
		option.value = device.deviceId;
		option.textContent = device.label || 'Output ' + device.deviceId.substring(0, 8);
		select.appendChild(option);
	});

	if (selected_audio_output_device_id) {
		select.value = selected_audio_output_device_id;
	}
}

async function update_audio_output_device(device_id) {
	selected_audio_output_device_id = device_id;
	save_phone_setting('audio_output_device', device_id);
	console.log('update_audio_output_device: Called with device_id:', device_id);

	var elements = [];
	var ringback = document.getElementById('ringback');
	var ringtone = document.getElementById('ringtone');
	var remote_video = document.getElementById('remote_video');

	if (ringback) elements.push(ringback);
	if (ringtone) elements.push(ringtone);
	if (remote_video) elements.push(remote_video);

	for (var i = 0; i < elements.length; i++) {
		var element = elements[i];
		if (typeof element.setSinkId !== 'function') {
			continue;
		}

		try {
			if (!device_id || device_id === '') {
				await element.setSinkId('default');
			} else {
				await element.setSinkId(device_id);
			}
			console.log('update_audio_output_device: sinkId set on', element.id, device_id || 'default');
		} catch (err) {
			console.warn('update_audio_output_device: Failed to set sinkId on', element.id, err);
		}
	}
}

// Enumerate and populate ringback sounds from directory
async function enumerate_ringback_sounds() {
	var select = document.getElementById('ringback_select');
	if (!select) {
		return;
	}

	// Clear existing options, keep default
	select.innerHTML = '<option value="default.mp3">Default</option>';

	try {
		var response = await fetch('resources/ringback_list.php');
		var sounds = await response.json();

		sounds.forEach(function(sound) {
			// Skip default as it's already added
			if (sound.value === 'default.mp3') {
				return;
			}

			var option = document.createElement('option');
			option.value = sound.value;
			option.textContent = sound.text;
			select.appendChild(option);
		});

		console.log('enumerate_ringback_sounds: Loaded', sounds.length, 'ringback sounds');
	} catch (err) {
		console.warn('Could not enumerate ringback sounds:', err);
	}

	// Restore selected ringback if previously set
	if (selected_ringback_sound && select.value !== selected_ringback_sound) {
		select.value = selected_ringback_sound;
	}
}

// Enumerate and populate ringtones from directory
async function enumerate_ringtones() {
	var select = document.getElementById('ringtone_select');
	if (!select) {
		return;
	}

	// Clear existing options, keep default
	select.innerHTML = '<option value="default.mp3">Default</option>';

	try {
		var response = await fetch('resources/ringtone_list.php');
		var ringtones = await response.json();

		ringtones.forEach(function(ringtone) {
			// Skip default as it's already added
			if (ringtone.value === 'default.mp3') {
				return;
			}

			var option = document.createElement('option');
			option.value = ringtone.value;
			option.textContent = ringtone.text;
			select.appendChild(option);
		});

		console.log('enumerate_ringtones: Loaded', ringtones.length, 'ringtones');
	} catch (err) {
		console.warn('Could not enumerate ringtones:', err);
	}

	// Restore selected ringtone if previously set
	if (selected_ringtone && select.value !== selected_ringtone) {
		select.value = selected_ringtone;
	}
}

// Update ringback sound source based on selected ringback
function update_ringback_source(sound_file) {
	var ringback = document.getElementById('ringback');
	if (ringback && ringback.querySelector('source')) {
		var source = ringback.querySelector('source');
		var ext = sound_file.split('.').pop().toLowerCase();
		var mime_type = (ext === 'wav') ? 'audio/wav' : 'audio/mpeg';
		source.src = 'resources/sounds/ringback/' + sound_file;
		source.type = mime_type;
		ringback.load();  // Reload the audio element with new source
		console.log('update_ringback_source: Updated to', sound_file);
	}
}

// Update ringtone sound source based on selected ringtone
function update_ringtone_source(sound_file) {
	var ringtone = document.getElementById('ringtone');
	if (ringtone && ringtone.querySelector('source')) {
		var source = ringtone.querySelector('source');
		var ext = sound_file.split('.').pop().toLowerCase();
		var mime_type = (ext === 'wav') ? 'audio/wav' : 'audio/mpeg';
		source.src = 'resources/sounds/ringtones/' + sound_file;
		source.type = mime_type;
		ringtone.load();  // Reload the audio element with new source
		console.log('update_ringtone_source: Updated to', sound_file);
	}
}

// Update audio input device for the current call
async function update_audio_input_device(device_id) {
	selected_audio_input_device_id = device_id;
	save_phone_setting('audio_input_device', device_id);

	console.log('update_audio_input_device: Called with device_id:', device_id);
	console.log('update_audio_input_device: session exists:', !!session);
	console.log('update_audio_input_device: session.mediaHandler exists:', !!(session && session.mediaHandler));

	if (!session || !session.mediaHandler) {
		console.warn('update_audio_input_device: Cannot update - media handler not available');
		return;
	}

	// Get the local stream - SIP.js 0.7.8 uses getLocalStreams() method
	var localStreams = null;
	if (typeof session.mediaHandler.getLocalStreams === 'function') {
		localStreams = session.mediaHandler.getLocalStreams();
	}

	console.log('update_audio_input_device: Local streams via getLocalStreams():', localStreams ? localStreams.length : 'N/A');

	if (!localStreams || localStreams.length === 0) {
		// Fallback: check if there's a direct localStream property (some SIP.js versions)
		if (session.mediaHandler.localStream) {
			localStreams = [session.mediaHandler.localStream];
			console.log('update_audio_input_device: Using fallback localStream property');
		}
	}

	if (!localStreams || localStreams.length === 0) {
		console.warn('update_audio_input_device: No local streams found');
		return;
	}

	var localStream = localStreams[0];
	var audio_tracks = localStream.getAudioTracks();
	console.log('update_audio_input_device: Current audio tracks:', audio_tracks.length);

	if (audio_tracks.length === 0) {
		console.warn('update_audio_input_device: No audio tracks found in local stream');
		return;
	}

	try {
		var new_audio_track = null;

		// Handle tab audio selection for Chromium browsers
		if (device_id === 'tab-audio') {
			console.log('update_audio_input_device: Tab audio selected, using getDisplayMedia');

			// Stop the old audio track
			audio_tracks[0].stop();

			// Use getDisplayMedia to capture tab audio
			// IMPORTANT: Chrome requires video: true to show the tab sharing dialog with "Share tab audio" option
			// We capture video but don't use it for the actual audio input
			var tab_stream = await navigator.mediaDevices.getDisplayMedia({
				video: { cursor: "always" },
				audio: true
			});

			if (tab_stream.getAudioTracks().length === 0) {
				console.error('update_audio_input_device: No audio track captured from tab');
				alert('Failed to capture tab audio.\n\nWhen the Chrome dialog appears:\n1. Select "Entire Screen" or the browser tab\n2. Check "Share tab audio" at the bottom\n3. Click Share');
				return;
			}

			new_audio_track = tab_stream.getAudioTracks()[0];

			// Store the stream for cleanup later
			session._tab_audio_stream = tab_stream;

			// Replace the old track with the new one
			var sender = session.mediaHandler.peerConnection.getSenders().find(function(s) {
				return s.track && s.track.kind === 'audio';
			});

			if (sender) {
				await sender.replaceTrack(new_audio_track);
			}

			// Update the local stream
			localStream.removeTrack(audio_tracks[0]);
			localStream.addTrack(new_audio_track);

			// Listen for the stream ending
			new_audio_track.onended = function() {
				console.log('update_audio_input_device: Tab audio stream ended');
				selected_audio_input_device_id = '';
				var select = document.getElementById('audio_input_select');
				if (select) {
					select.value = '';
				}
			};

			console.log('update_audio_input_device: Tab audio captured successfully');
			return;
		}

		// Standard audio device selection
		console.log('update_audio_input_device: Getting new stream with deviceId:', device_id);

		var new_constraints = {
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
				deviceId: device_id
			}
		};

		console.log('update_audio_input_device: Constraints:', JSON.stringify(new_constraints));

		// Stop the old audio track
		console.log('update_audio_input_device: Stopping old audio track:', audio_tracks[0].id);
		audio_tracks[0].stop();

		// Get a new stream with the selected device
		var new_stream = await navigator.mediaDevices.getUserMedia(new_constraints);
		console.log('update_audio_input_device: New stream obtained');
		console.log('update_audio_input_device: New stream audio tracks:', new_stream.getAudioTracks().length);

		if (new_stream.getAudioTracks().length === 0) {
			console.error('update_audio_input_device: New stream has no audio tracks');
			return;
		}

		new_audio_track = new_stream.getAudioTracks()[0];
		console.log('update_audio_input_device: New audio track ID:', new_audio_track.id);
		console.log('update_audio_input_device: New audio track label:', new_audio_track.label);

		// Replace the old track with the new one
		var sender = session.mediaHandler.peerConnection.getSenders().find(function(s) {
			return s.track && s.track.kind === 'audio';
		});

		if (sender) {
			console.log('update_audio_input_device: Replacing track via sender.replaceTrack()');
			await sender.replaceTrack(new_audio_track);
			console.log('update_audio_input_device: Track replaced successfully');
		} else {
			console.error('update_audio_input_device: No audio sender found in peer connection');
		}

		// Update the local stream
		console.log('update_audio_input_device: Updating local stream');
		localStream.removeTrack(audio_tracks[0]);
		localStream.addTrack(new_audio_track);

		console.log('update_audio_input_device: Successfully switched to device:', device_id);
	} catch (err) {
		console.error('update_audio_input_device: Error switching audio device:', err);
		console.error('update_audio_input_device: Error name:', err.name);
		console.error('update_audio_input_device: Error message:', err.message);
	}
}

async function update_video_input_device(device_id) {
	selected_video_input_device_id = device_id;
	save_phone_setting('video_input_device', device_id);
	console.log('update_video_input_device: Called with device_id:', device_id);

	if (!session || !session.mediaHandler) {
		console.warn('update_video_input_device: Cannot update - session media handler not available');
		return;
	}

	var localStream = null;
	if (typeof session.mediaHandler.getLocalStreams === 'function') {
		var local_streams = session.mediaHandler.getLocalStreams();
		if (local_streams && local_streams.length > 0) {
			localStream = local_streams[0];
		}
	}

	if (!localStream && session.mediaHandler.localStream) {
		localStream = session.mediaHandler.localStream;
	}

	if (!localStream) {
		console.warn('update_video_input_device: No local stream available');
		return;
	}

	var oldVideoTracks = localStream.getVideoTracks();
	if (!oldVideoTracks || oldVideoTracks.length === 0) {
		console.warn('update_video_input_device: No video tracks available to replace');
		return;
	}

	try {
		var videoConstraints = { video: true };
		if (device_id && device_id !== '') {
			videoConstraints = { video: { deviceId: { exact: device_id } } };
		}

		console.log('update_video_input_device: Requesting new video stream with constraints:', videoConstraints);

		var newStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
		var newVideoTracks = newStream.getVideoTracks();
		if (!newVideoTracks || newVideoTracks.length === 0) {
			console.error('update_video_input_device: New video stream contains no tracks');
			return;
		}

		var newVideoTrack = newVideoTracks[0];

		// Replace the sender track in the peer connection first.
		var videoSender = null;
		if (session.mediaHandler.peerConnection && typeof session.mediaHandler.peerConnection.getSenders === 'function') {
			videoSender = session.mediaHandler.peerConnection.getSenders().find(function(s) {
				return s.track && s.track.kind === 'video';
			});
		}

		if (videoSender) {
			await videoSender.replaceTrack(newVideoTrack);
			console.log('update_video_input_device: Replaced video sender track');
		} else {
			console.warn('update_video_input_device: No video sender found');
		}

		// Update the local stream preview.
		oldVideoTracks.forEach(function(track) {
			if (track !== newVideoTrack) {
				track.stop();
				localStream.removeTrack(track);
			}
		});

		localStream.addTrack(newVideoTrack);

		if (session.mediaHandler.localStream && session.mediaHandler.localStream !== localStream) {
			session.mediaHandler.localStream = localStream;
		}

		var localVideo = document.getElementById('local_video');
		if (localVideo) {
			localVideo.srcObject = localStream;
			var playPromise = localVideo.play();
			if (playPromise && typeof playPromise.catch === 'function') {
				playPromise.catch(function() {});
			}
		}

		console.log('update_video_input_device: Video source switched successfully');
	} catch (err) {
		console.error('update_video_input_device: Error switching video device:', err);
	}
}

function stop_call_tone() {
	const ringtone = document.getElementById('ringtone');
	if (ringtone) {
		ringtone.pause();
		ringtone.currentTime = 0;
	}

	const ringback = document.getElementById('ringback');
	if (ringback) {
		ringback.pause();
		ringback.currentTime = 0;
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
		console.log('start_call_tone: Already playing mode:', mode, '- returning early');
		return;
	}

	console.log('start_call_tone: Called with mode:', mode);
	stop_call_tone();
	active_call_tone_mode = mode;

	// For outgoing calls, play the selected ringback sound
	if (mode === 'outgoing') {
		console.log('start_call_tone: Playing RINGBACK for outgoing call');
		const ringback = document.getElementById('ringback');
		if (ringback && ringback.querySelector('source')) {
			ringback.loop = true;
			const play_promise = ringback.play();
			if (play_promise && typeof play_promise.catch === 'function') {
				play_promise.catch(function(err) {
					console.log('start_call_tone: Ringback play failed:', err, '- falling back to generated tone');
					stop_call_tone();
					active_call_tone_mode = mode;
					play_generated_tone(mode);
				});
			}
			return;
		}
		console.log('start_call_tone: Ringback element not found - using generated tone');
	}
	// For incoming calls, play the selected ringtone
	else if (mode === 'incoming') {
		console.log('start_call_tone: Playing RINGTONE for incoming call');
		const ringtone = document.getElementById('ringtone');
		if (ringtone && ringtone.querySelector('source')) {
			ringtone.loop = true;
			const play_promise = ringtone.play();
			if (play_promise && typeof play_promise.catch === 'function') {
				play_promise.catch(function(err) {
					console.log('start_call_tone: Ringtone play failed:', err, '- falling back to generated tone');
					stop_call_tone();
					active_call_tone_mode = mode;
					play_generated_tone(mode);
				});
			}
			return;
		}
		console.log('start_call_tone: Ringtone element not found - using generated tone');
	}

	// If neither sound is available or unsupported mode, use generated tone
	console.log('start_call_tone: Using generated tone for mode:', mode);
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

	// Get the selected call session to check its actual mute/hold state
	var selected_call = get_selected_call_session();
	
	// Use the call session's is_muted property if available, otherwise fall back to global
	var muted = selected_call && selected_call.is_muted !== undefined ? selected_call.is_muted : audio_muted;
	
	// Use the call session's is_on_hold property if available, otherwise fall back to DOM check
	var on_hold = false;
	if (selected_call && selected_call.is_on_hold !== undefined) {
		on_hold = selected_call.is_on_hold;
	} else {
		on_hold = document.getElementById('unhold').style.display === 'inline';
	}

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
		// Only show video mute button if the selected call has video
		var is_video_call = selected_call && selected_call.is_video !== undefined ? selected_call.is_video : false;
		if (!is_video_call || !camera_available) {
			action_video_mute.style.display = 'none';
		} else {
			var local_video_wrapper = document.getElementById('local_video_wrapper');
			var local_video_hidden = !!(local_video_wrapper && local_video_wrapper.classList.contains('local_preview_hidden'));
			action_video_mute.style.display = 'flex';
			if (action_video_mute_icon) {
				action_video_mute_icon.className = local_video_hidden ? 'fas fa-video-slash' : 'fas fa-video';
			}
			if (action_video_mute_label) {
				action_video_mute_label.textContent = 'Local';
			}
			action_video_mute.classList.toggle('action_item_toggle_active', local_video_hidden);
		}
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

	var action_history = document.getElementById('action_history');
	var action_mute = document.getElementById('action_mute');
	var action_hold = document.getElementById('action_hold');
	var action_video_mute = document.getElementById('action_video_mute');
	var action_screen_share = document.getElementById('action_screen_share');
	var action_transfer = document.getElementById('action_transfer');
	var action_btransfer = document.getElementById('action_btransfer');
	var action_settings = document.getElementById('action_settings');
	var action_keypad = document.getElementById('action_keypad');
	var action_keypad_during_call = document.getElementById('action_keypad_during_call');

	if (action_history) {
		action_history.style.display = enabled ? 'none' : 'flex';
	}
	if (action_mute) {
		action_mute.style.display = enabled ? 'flex' : 'none';
	}
	if (action_hold) {
		action_hold.style.display = enabled ? 'flex' : 'none';
	}
	if (action_video_mute) {
		action_video_mute.style.display = enabled && use_video && camera_available ? 'flex' : 'none';
	}
	if (action_screen_share) {
		// Screen share button only shown during video calls
		action_screen_share.style.display = enabled && use_video ? 'flex' : 'none';
	}
	if (action_transfer) {
		action_transfer.style.display = enabled ? 'flex' : 'none';
	}
	if (action_btransfer) {
		action_btransfer.style.display = enabled ? 'flex' : 'none';
	}
	// Settings button always visible
	// Toggle dialpad icon (shown when not in call) vs keypad icon (shown during call)
	// if (action_keypad) {
	// 	action_keypad.style.display = enabled ? 'none' : 'flex';
	// }
	// if (action_keypad_during_call) {
	// 	action_keypad_during_call.style.display = enabled ? 'flex' : 'none';
	// }

	if (enabled) {
		sync_call_action_controls();
	}
}

function toggle_audio_mute_action() {
	let selected_call = get_selected_call_session();
	
	// Check the call session's is_muted property first, fall back to global
	let muted = false;
	if (selected_call && selected_call.is_muted !== undefined) {
		muted = selected_call.is_muted;
	} else {
		muted = audio_muted;
	}
	
	if (muted) {
		unmute_audio();
	} else {
		mute_audio();
	}
}

function toggle_audio_hold_action() {
	let selected_call = get_selected_call_session();
	
	// Check the call session's is_on_hold property first, fall back to DOM
	let on_hold = false;
	if (selected_call && selected_call.is_on_hold !== undefined) {
		on_hold = selected_call.is_on_hold;
	} else {
		on_hold = document.getElementById('unhold').style.display === 'inline';
	}
	
	if (on_hold) {
		unhold();
	} else {
		hold();
	}
}

function toggle_video_mute_action() {
	if (!session || !active_call_is_video) { return; }
	var local_video_wrapper = document.getElementById('local_video_wrapper');
	var local_video = document.getElementById('local_video');
	if (!local_video_wrapper || !local_video) {
		return;
	}

	local_video_wrapper.classList.toggle('local_preview_hidden');

	if (local_video_wrapper.classList.contains('local_preview_hidden')) {
		local_video.style.display = 'none';
	} else {
		local_video.style.display = 'inline';
	}

	sync_call_action_controls();
}

// Toggle screen sharing - starts or stops screen share stream
async function toggle_screen_share() {
	// Get the selected call session (supports multi-call)
	let selected_call = get_selected_call_session();

	// Check if there's an active video call - use selected_call.is_video first, fall back to global
	let is_video_call = (selected_call && selected_call.is_video !== undefined) ? selected_call.is_video : active_call_is_video;

	if (!is_video_call) {
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
		if (is_screen_sharing) {
			console.log('start_screen_share: Already active, skipping');
			return;
		}

		// Check if getDisplayMedia is supported
		if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
			alert('Screen sharing is not supported in this browser.\n\nPlease use Chrome, Edge, or Firefox.\n\nMake sure you are accessing this page via HTTPS.');
			return;
		}

		// Get the session from the selected call session (supports outgoing calls)
		// For outgoing calls, the session is stored in call_session.session, not the global session
		let selected_call = get_selected_call_session();
		let call_session_obj = selected_call ? selected_call.session : null;
		let current_session = call_session_obj || session;

		if (!current_session || !current_session.mediaHandler) {
			console.error('start_screen_share: No active call session available');
			alert('No active call session available for screen sharing.');
			return;
		}

		// Store the original audio track before replacing it
		if (current_session && current_session.mediaHandler) {
			var localStreams = current_session.mediaHandler.getLocalStreams ? current_session.mediaHandler.getLocalStreams() : null;
			if (!localStreams || localStreams.length === 0) {
				localStreams = current_session.mediaHandler.localStream ? [current_session.mediaHandler.localStream] : null;
			}

			if (localStreams && localStreams.length > 0) {
				var localStream = localStreams[0];
				var audioTracks = localStream.getAudioTracks();

				if (audioTracks.length > 0) {
					original_audio_track = audioTracks[0];
					console.log('start_screen_share: Stored original audio track:', original_audio_track.id);
				}
			}
		}

		// Get screen share stream WITH audio
		// Chrome will show the "Share tab audio" checkbox when video is enabled
		screen_share_stream = await navigator.mediaDevices.getDisplayMedia({
			video: {
				cursor: "if-supported",
				width: { ideal: 1280 },
				height: { ideal: 720 },
				frameRate: { ideal: 30 }
			},
			audio: true
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

		// Check if tab audio was captured
		var tab_audio_track = null;
		if (screen_share_stream.getAudioTracks().length > 0) {
			tab_audio_track = screen_share_stream.getAudioTracks()[0];
			tab_audio_track_id = tab_audio_track.id;
			tab_audio_stream = screen_share_stream;
			console.log('start_screen_share: Tab audio track captured:', tab_audio_track.id);

			// Replace the audio track in the peer connection
			if (current_session && current_session.mediaHandler && current_session.mediaHandler.peerConnection) {
				var senders = current_session.mediaHandler.peerConnection.getSenders();
				var audio_sender = null;

				for (var i = 0; i < senders.length; i++) {
					if (senders[i].track && senders[i].track.kind === 'audio') {
						audio_sender = senders[i];
						break;
					}
				}

				if (audio_sender) {
					await audio_sender.replaceTrack(tab_audio_track);
					console.log('start_screen_share: Replaced audio track with tab audio');

					// Also update the local stream
					if (current_session.mediaHandler.localStream) {
						var audioTracks = current_session.mediaHandler.localStream.getAudioTracks();
						for (var j = 0; j < audioTracks.length; j++) {
							if (audioTracks[j].id !== tab_audio_track.id) {
								current_session.mediaHandler.localStream.removeTrack(audioTracks[j]);
								break;
							}
						}
						current_session.mediaHandler.localStream.addTrack(tab_audio_track);
					}
				} else {
					console.warn('start_screen_share: No audio sender found in peer connection');
				}
			}
		} else {
			console.log('start_screen_share: No tab audio captured. Make sure to check "Share tab audio" in the Chrome dialog.');
		}

		// Reset previous sender reference for a fresh share cycle
		screen_share_sender = null;

		// Add screen share indicator to local video
		var local_video_wrapper = document.getElementById('local_video_wrapper');
		if (local_video_wrapper) {
			local_video_wrapper.classList.add('is_screen_sharing');
		}

		// Set is_screen_sharing flag
		is_screen_sharing = true;

		// REPLACE camera video with screen share in peer connection
		// Use current_session (from selected call) instead of global session
		var peer_connection = current_session ? current_session.mediaHandler ? current_session.mediaHandler.peerConnection : null : null;
		if (peer_connection) {
			console.log('start_screen_share: Replacing camera track with screen share track');

			// Find the sender sending the camera video track
			var senders = peer_connection.getSenders();
			var camera_sender = senders.find(function(sender) {
				return sender.track && sender.track.kind === 'video';
			});

			if (camera_sender) {
				console.log('start_screen_share: Found camera sender:', camera_sender);
				screen_share_sender = camera_sender;
				if (camera_sender.track && camera_sender.track.kind === 'video') {
					original_video_track = camera_sender.track;
					console.log('start_screen_share: Stored original video track from sender:', original_video_track.id);
				}
				else if (session && session.mediaHandler && session.mediaHandler.localStream) {
					var local_video_tracks = session.mediaHandler.localStream.getVideoTracks();
					if (local_video_tracks.length > 0) {
						original_video_track = local_video_tracks[0];
						console.log('start_screen_share: Stored original video track from localStream:', original_video_track.id);
					}
				}

				// Replace the camera track with the screen share track
				camera_sender.replaceTrack(screen_share_video_track).then(function() {
					console.log('start_screen_share: Track replaced successfully');

					// Add the screen share video track to the local stream so it's properly sent to the remote party
					if (session && session.mediaHandler && session.mediaHandler.localStream) {
						var local_video_tracks = session.mediaHandler.localStream.getVideoTracks();
						// Remove the old camera track from the local stream
						for (var k = 0; k < local_video_tracks.length; k++) {
							if (local_video_tracks[k].id === original_video_track.id) {
								session.mediaHandler.localStream.removeTrack(local_video_tracks[k]);
								break;
							}
						}
						// Add the screen share video track to the local stream
						session.mediaHandler.localStream.addTrack(screen_share_video_track);
						console.log('start_screen_share: Added screen share video track to local stream');
					}
				}).catch(function(err) {
					console.error('start_screen_share: Error replacing track:', err);
				});
			} else {
				console.error('start_screen_share: No camera sender found in peer connection');
			}
		} else {
			console.error('start_screen_share: No peer connection found!');
		}

		// Update local video preview with screen share
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
async function stop_screen_share() {
	console.log('stop_screen_share: Stopping screen share...');

	// Get the session from the selected call session (supports outgoing calls)
	let selected_call = get_selected_call_session();
	let call_session_obj = selected_call ? selected_call.session : null;
	let current_session = call_session_obj || session;

	// Stop tab audio if it was active
	if (tab_audio_stream) {
		console.log('stop_screen_share: Stopping tab audio stream');
		tab_audio_stream.getTracks().forEach(track => track.stop());
		tab_audio_stream = null;

		// Restore original audio track
		if (current_session && current_session.mediaHandler) {
			var localStreams = current_session.mediaHandler.getLocalStreams ? current_session.mediaHandler.getLocalStreams() : null;
			if (!localStreams || localStreams.length === 0) {
				localStreams = current_session.mediaHandler.localStream ? [current_session.mediaHandler.localStream] : null;
			}

			if (localStreams && localStreams.length > 0) {
				var localStream = localStreams[0];
				var audioTracks = localStream.getAudioTracks();

				if (original_audio_track && original_audio_track.readyState !== 'ended') {
					// Remove old audio track and add original
					for (var i = 0; i < audioTracks.length; i++) {
						if (audioTracks[i].id === tab_audio_track_id) {
							localStream.removeTrack(audioTracks[i]);
							break;
						}
					}
					localStream.addTrack(original_audio_track);

					// Replace in peer connection
					var senders = current_session.mediaHandler.peerConnection.getSenders();
					for (var j = 0; j < senders.length; j++) {
						if (senders[j].track && senders[j].track.kind === 'audio') {
							await senders[j].replaceTrack(original_audio_track);
							console.log('stop_screen_share: Restored original audio track');
							break;
						}
					}
				}
			}
		}

		tab_audio_track_id = null;
		original_audio_track = null;
	}

	// Get the screen share video track if it exists
	var screen_share_video_track = null;
	if (screen_share_stream && screen_share_stream.getVideoTracks().length > 0) {
		screen_share_video_track = screen_share_stream.getVideoTracks()[0];
	}

	// Restore camera track in peer connection - use current_session instead of global session
	var peer_connection = current_session ? current_session.mediaHandler ? current_session.mediaHandler.peerConnection : null : null;
	var sender = screen_share_sender;
	if (!sender && peer_connection) {
		sender = peer_connection.getSenders().find(function(s) {
			return s.track && s.track.kind === 'video';
		});
	}

	var restore_track = original_video_track;
	if ((!restore_track || restore_track.readyState === 'ended') && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
		try {
			console.log('stop_screen_share: Original camera track unavailable, reacquiring camera');
			var camera_stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
			var camera_tracks = camera_stream.getVideoTracks();
			if (camera_tracks.length > 0) {
				restore_track = camera_tracks[0];
				original_video_track = restore_track;

				if (current_session && current_session.mediaHandler && current_session.mediaHandler.localStream) {
					var local_stream = current_session.mediaHandler.localStream;
					local_stream.getVideoTracks().forEach(function(track) {
						if (track.id !== restore_track.id) {
							local_stream.removeTrack(track);
						}
					});
					if (!local_stream.getVideoTracks().some(function(track) { return track.id === restore_track.id; })) {
						local_stream.addTrack(restore_track);
					}
				}
				else if (current_session && current_session.mediaHandler) {
					current_session.mediaHandler.localStream = camera_stream;
				}
			}
		} catch (err) {
			console.error('stop_screen_share: Failed to reacquire camera track:', err);
		}
	}

	if (peer_connection && sender && restore_track) {
		try {
			await sender.replaceTrack(restore_track);
			console.log('stop_screen_share: Restored camera track successfully');
		} catch (err) {
			console.error('stop_screen_share: Error restoring camera track:', err);
		}
	} else if (!restore_track) {
		console.error('stop_screen_share: No camera track available to restore');
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
		var preview_stream = null;
		if (current_session && current_session.mediaHandler && current_session.mediaHandler.localStream && current_session.mediaHandler.localStream.getVideoTracks().length > 0) {
			preview_stream = current_session.mediaHandler.localStream;
		}
		else if (restore_track) {
			preview_stream = new MediaStream([restore_track]);
		}
		if (preview_stream) {
			local_video.srcObject = preview_stream;
			var play_promise = local_video.play();
			if (play_promise && typeof play_promise.catch === 'function') {
				play_promise.catch(function() {});
			}
		}
	}
	var local_video_wrapper = document.getElementById('local_video_wrapper');
	if (local_video_wrapper) {
		local_video_wrapper.classList.remove('is_screen_sharing');
	}

	// Clear sender/share references for next share cycle
	screen_share_sender = null;
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

// Ensure local camera preview is bound even when SIP.js render timing varies by browser.
function ensure_local_video_preview(active_session, attempt) {
	if (!active_session) {
		return;
	}

	if (typeof attempt === 'undefined') {
		attempt = 0;
	}

	var local_video = document.getElementById('local_video');
	if (!local_video) {
		return;
	}

	var local_wrapper = document.getElementById('local_video_wrapper');
	if (local_wrapper) {
		local_wrapper.classList.remove('local_preview_hidden');
	}

	var local_stream = null;
	if (active_session.mediaHandler) {
		if (active_session.mediaHandler.localStream) {
			local_stream = active_session.mediaHandler.localStream;
		}
		else if (typeof active_session.mediaHandler.getLocalStreams === 'function') {
			var local_streams = active_session.mediaHandler.getLocalStreams();
			if (local_streams && local_streams.length > 0) {
				local_stream = local_streams[0];
			}
		}
	}

	if (local_stream) {
		if (local_video.srcObject !== local_stream) {
			local_video.srcObject = local_stream;
		}
		var play_promise = local_video.play();
		if (play_promise && typeof play_promise.catch === 'function') {
			play_promise.catch(function() {});
		}
		return;
	}

	if (attempt < 10) {
		setTimeout(function() {
			ensure_local_video_preview(active_session, attempt + 1);
		}, 200);
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

	// Show Camera Status
	var camera_status = camera_available ? '' : ' Camera unavailable';
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
	displayName: "<?php echo $user_extension; ?>",
	autoRingback: false  // Disable auto ringback to prevent duplicate audio on inbound calls
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
	if (is_session_active()) {
		var display_name = active_call_display_name || '';
		var number = active_call_number || '';

		var safe_name = display_name ? sanitize_string(display_name) : '';
		var safe_number = number ? sanitize_string(number) : '';

		var caller_info = '';
		if (safe_name && safe_number) {
			caller_info = safe_name + ' (' + safe_number + ')';
		} else if (safe_name || safe_number) {
			if (safe_number) {
				caller_info = safe_number;
			} else {
				caller_info = safe_name;
			}
		}

		// Duration is now shown in the active call switcher, not in the status bar
		document.getElementById('status_text').innerHTML = caller_info || 'Call in progress';
	} else {
		update_idle_status();
	}
}

// ============================================================
// MULTI-CALL: Updated is_session_active to check call registry
// ============================================================
function is_session_active() {
	// First check the call registry for active calls
	let active_calls = get_active_call_sessions();
	if (active_calls.length > 0) {
		return true;
	}
	// Fallback to legacy global session check
	return !!(session && session.status !== SIP.Session.C.STATUS_TERMINATED);
}

// ============================================================
// END MULTI-CALL: is_session_active
// ============================================================

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
	document.getElementById('settings_panel').style.display = 'none';
	update_video_stream_info('', '', false);
	set_call_action_mode(false, false);
	active_call_is_video = false;
	active_call_display_name = '';
	active_call_number = '';
	audio_muted = false;

	answer_time = null;
	current_history_entry_id = null;
	session_hungup = false;
	session = null;

	clear_transient_status();
	update_idle_status();

	// Update the call switcher UI to reflect the cleared state
	update_active_calls_panel();
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


// Toggle settings panel visibility
function toggle_settings() {
	var settings_panel = document.getElementById('settings_panel');
	var action_settings = document.getElementById('action_settings');
	if (!settings_panel || !action_settings) {
		return;
	}

	if (settings_panel.style.display === 'flex') {
		settings_panel.style.display = 'none';
		update_action_bar_state(null);  // Clear all active states
	} else {
		hide_all_panels();
		// Refresh device lists when opening settings
		enumerate_audio_devices();
		enumerate_video_devices();
		settings_panel.style.display = 'flex';
		update_action_bar_state('settings');  // Set settings as active
	}
}

// Function to generate media options based on use_video parameter
// Note: For tab audio on Chromium browsers, the user will be prompted to select a tab
// when the call is answered. This function returns the base constraints, and the actual
// tab audio capture happens via getDisplayMedia() during call setup.
async function get_media_options(use_video) {
	var audio_constraints = {
		echoCancellation: true,
		noiseSuppression: true,
		autoGainControl: true
	};

	// Handle tab audio selection for Chromium browsers
	if (selected_audio_input_device_id === 'tab-audio') {
		// For tab audio, we request audio but the actual device is chosen by the user
		// in the getDisplayMedia dialog that will be triggered during call setup
		audio_constraints = {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true
		};
	}
	// Add deviceId constraint if a specific audio input device is selected
	else if (selected_audio_input_device_id && selected_audio_input_device_id !== '') {
		audio_constraints.deviceId = selected_audio_input_device_id;
	}

	return {
		media: {
			constraints: {
				audio: audio_constraints,
				video: use_video ? (selected_video_input_device_id ? { deviceId: selected_video_input_device_id } : true) : false
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

// ============================================================
// MULTI-CALL: Incoming Call Handler (Updated for call waiting)
// ============================================================
user_agent.on('invite', function (s) {
	console.log('INVITE received - incoming call from:', s.remoteIdentity);
	console.log('INVITE remoteIdentity:', s.remoteIdentity);
	console.log('INVITE uri_user:', s.remoteIdentity ? s.remoteIdentity.uri.user : 'N/A');

	// Get caller info
	var incoming_display_name = s.remoteIdentity && s.remoteIdentity.displayName ? s.remoteIdentity.displayName : '';
	var incoming_uri_user = s.remoteIdentity && s.remoteIdentity.uri && s.remoteIdentity.uri.user ? s.remoteIdentity.uri.user : '';

	// Check call limit
	if (!check_call_limit()) {
		console.log('INVITE: Rejecting - maximum calls reached');
		s.reject();
		show_temporary_status('Maximum calls reached', 'fas fa-exclamation-circle');
		return;
	}

	// Check if there's already an active call (call waiting scenario)
	let active_calls = get_active_call_sessions();
	if (active_calls.length > 0) {
		// Call waiting scenario - create a new call session for the waiting call
		if (!call_waiting_config.enabled) {
			console.log('INVITE: Call waiting disabled, rejecting');
			s.reject();
			return;
		}

		console.log('INVITE: Call waiting - creating secondary call session');

		// Create a new call session for the waiting incoming call
		let waiting_call_id = create_call_session('incoming', incoming_uri_user, incoming_display_name, detect_video_invite(s));
		update_active_calls_button();
		let waiting_call = get_call_session(waiting_call_id);
		waiting_call.session = s;

		// Save session info
		waiting_call.display_name = incoming_display_name;
		waiting_call.number = incoming_uri_user;
		waiting_call.has_video = detect_video_invite(s);

		// Show call waiting panel
		show_call_waiting_panel(waiting_call_id, s);

		// Set up call waiting event handlers
		waiting_call.session.on('cancel', function() {
			add_to_history(waiting_call.number, 'missed', Date.now());
			hide_call_waiting_panel();
			remove_call_session(waiting_call_id);
		});

		waiting_call.session.on('bye', function() {
			hide_call_waiting_panel();
			remove_call_session(waiting_call_id);
		});

		waiting_call.session.on('rejected', function() {
			add_to_history(waiting_call.number, 'missed', Date.now());
			hide_call_waiting_panel();
			remove_call_session(waiting_call_id);
		});

		return;
	}

	// No active call - this is the first/only call
	// Save the session to the global session (for backward compatibility)
	session = s;
	session.display_name = incoming_display_name;
	session.uri_user = incoming_uri_user;
	session.incoming_number = incoming_uri_user || incoming_display_name;
	session.has_video = detect_video_invite(s);

	// Create a call session entry for this incoming call
	let first_call_id = create_call_session('incoming', incoming_uri_user, incoming_display_name, detect_video_invite(s));
	let first_call = get_call_session(first_call_id);
	first_call.session = s;
	first_call.display_name = incoming_display_name;
	first_call.number = incoming_uri_user;
	first_call.has_video = detect_video_invite(s);

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
	var video_indicator = session.has_video ? "<div class='caller_video'><i class='fas fa-video'></i> Video Call</div>" : "";
	document.getElementById('ringing_caller_id').innerHTML = "<div class='caller_name'>" + sanitize_string(session.display_name) + "</div><div class='caller_number'><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;
	document.getElementById('active_caller_id').innerHTML = "<div class='caller_name'>" + sanitize_string(session.display_name) + "</div><div class='caller_number'><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;
	update_video_stream_info(session.display_name, session.uri_user, session.has_video);

	// Hide all the panels
	hide_all_panels();

	// Show the ringing panel
	document.getElementById('ringing').style.display = "flex";

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

		// Remove the selected call session from the registry
		let selected_call = get_selected_call_session();
		if (selected_call) {
			remove_call_session(selected_call.id);
		}
		reset_call_ui_state(true);
	});

	session.on('failed', function (s) {
		// Remove the selected call session from the registry
		let selected_call = get_selected_call_session();
		if (selected_call) {
			remove_call_session(selected_call.id);
		}
		reset_call_ui_state(true);
	});

	session.on('rejected', function (s) {
		// Save incoming_number before cleanup (session may be null if the call was abandoned)
		var saved_incoming_number = session ? session.incoming_number : null;

		// Record missed call if we have the number
		if (saved_incoming_number) {
			add_to_history(saved_incoming_number, 'missed', Date.now());
		}

		// Remove the selected call session from the registry
		let selected_call = get_selected_call_session();
		if (selected_call) {
			remove_call_session(selected_call.id);
		}
		reset_call_ui_state(true);
	});

	// Helper function to route remote audio AND video to the appropriate elements
	// This is called from both 'accepted' and 'stream' events for browser compatibility
	function route_remote_audio_to_elements() {
		var remote_video = document.getElementById('remote_video');
		var remote_audio = document.getElementById('remote_audio');

		// Get remote streams using getReceivers() (modern) or getRemoteStreams() (deprecated but needed for Firefox)
		var remoteStreams = [];

		// Try modern getReceivers() first
		if (session.mediaHandler && session.mediaHandler.peerConnection &&
			typeof session.mediaHandler.peerConnection.getReceivers === 'function') {
			var receivers = session.mediaHandler.peerConnection.getReceivers();
			for (var r = 0; r < receivers.length; r++) {
				var track = receivers[r].track;
				if (track) {
					// Find or create a stream for this track
					var foundStream = null;

					// Get streams from track.streams (may be undefined in modern browsers)
					var trackStreams = track.streams || [];

					// Check if track is already in our remoteStreams array
					for (var rs = 0; rs < trackStreams.length; rs++) {
						for (var es = 0; es < remoteStreams.length; es++) {
							if (trackStreams[rs] && remoteStreams[es] && trackStreams[rs].id === remoteStreams[es].id) {
								foundStream = remoteStreams[es];
								break;
							}
						}
						if (foundStream) break;
					}

					if (!foundStream && trackStreams.length > 0) {
						// Track is in a stream not yet in our array - use that stream
						for (var ts = 0; ts < trackStreams.length; ts++) {
							if (trackStreams[ts]) {
								foundStream = trackStreams[ts];
								remoteStreams.push(foundStream);
								break;
							}
						}
					}

					// If track has no streams (deprecated API), create a new MediaStream
					if (!foundStream) {
						foundStream = new MediaStream();
						remoteStreams.push(foundStream);
					}

					// Add the track to the stream (avoid duplicates)
					var tracks = foundStream.getTracks();
					var hasTrack = false;
					for (var t = 0; t < tracks.length; t++) {
						if (tracks[t].id === track.id) {
							hasTrack = true;
							break;
						}
					}
					if (!hasTrack) {
						foundStream.addTrack(track);
					}
				}
			}
		}

		// Fallback to getRemoteStreams() if no streams found
		if (!remoteStreams.length && session.mediaHandler && session.getRemoteStreams) {
			remoteStreams = session.getRemoteStreams() || [];
		}

		console.log('route_remote_audio: Found', remoteStreams.length, 'remote streams');
		for (var si = 0; si < remoteStreams.length; si++) {
			console.log('route_remote_audio: Stream', si, '- Audio tracks:', remoteStreams[si].getAudioTracks().length, 'Video tracks:', remoteStreams[si].getVideoTracks().length);
		}

		for (var s = 0; s < remoteStreams.length; s++) {
			var stream = remoteStreams[s];
			if (!stream) {
				continue;
			}

			// Set on remote_video element (includes both audio and video tracks)
			if (remote_video && remote_video.srcObject !== stream) {
				remote_video.srcObject = stream;
				remote_video.play().catch(function(err) {
					console.log('route_remote_audio: Remote video play attempt:', err);
				});
				console.log('route_remote_audio: Stream set on remote_video');
			}

			// Create audio-only stream for remote_audio element (Firefox compatibility)
			if (remote_audio && stream.getAudioTracks().length > 0) {
				var audioTracks = stream.getAudioTracks();
				var audioOnlyStream = new MediaStream(audioTracks);

				if (remote_audio.srcObject !== audioOnlyStream) {
					remote_audio.srcObject = audioOnlyStream;
					console.log('route_remote_audio: Audio stream set on remote_audio element');
				}

				// Explicitly play the audio
				var playPromise = remote_audio.play();
				if (playPromise !== undefined) {
					playPromise.then(function() {
						console.log('route_remote_audio: Remote audio playback started successfully');
					}).catch(function(err) {
						console.warn('route_remote_audio: Remote audio playback blocked (autoplay policy):', err);
					});
				}
			}

			// Log video track info if present
			if (stream.getVideoTracks().length > 0) {
				var videoSettings = stream.getVideoTracks()[0].getSettings();
				console.log('route_remote_audio: Video track found - width:', videoSettings.width, 'height:', videoSettings.height);
			}
		}
	}

	// When the call is accepted, ensure remote media streams are properly rendered
	session.on('accepted', function() {
		console.log('accepted: Incoming call accepted - ensuring remote media renders');

		// Force render of remote media streams
		if (session.mediaHandler) {
			session.mediaHandler.render();

			// Log remote streams for debugging
			var remoteStreams = session.getRemoteStreams ? session.getRemoteStreams() : [];
			console.log('accepted: Remote streams:', remoteStreams.length);
			for (var i = 0; i < remoteStreams.length; i++) {
				var tracks = remoteStreams[i].getTracks();
				console.log('accepted: Stream', i, '- Audio tracks:', remoteStreams[i].getAudioTracks().length, 'Video tracks:', remoteStreams[i].getVideoTracks().length);
			}

			// Try to route remote audio immediately (works for Chrome)
			route_remote_audio_to_elements();
		}
	});

	// Add track event listener for browser compatibility
	// Some browsers fire 'track' events when remote media tracks arrive,
	// which may happen AFTER the 'accepted' event (especially with FreeSWITCH re-INVITE pattern)
	if (session.mediaHandler && session.mediaHandler.peerConnection) {
		session.mediaHandler.peerConnection.addEventListener('track', function(event) {
			console.log('peerConnection track event received:', event.track.kind, 'track ID:', event.track.id, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState);

			// Handle audio tracks
			if (event.track.kind === 'audio') {
				console.log('peerConnection: Audio track received - routing remote audio');

				// Create a MediaStream with just this audio track
				var audioStream = new MediaStream();
				audioStream.addTrack(event.track);

				var remote_audio = document.getElementById('remote_audio');
				if (remote_audio) {
					if (remote_audio.srcObject !== audioStream) {
						remote_audio.srcObject = audioStream;
						console.log('peerConnection: Audio track set on remote_audio element');
					}

					// Explicitly play the audio
					var playPromise = remote_audio.play();
					if (playPromise !== undefined) {
						playPromise.then(function() {
							console.log('peerConnection: Remote audio playback started successfully');
						}).catch(function(err) {
							console.warn('peerConnection: Remote audio playback blocked (autoplay policy):', err);
						});
					}
				}

				// Also set on remote_video
				var remote_video = document.getElementById('remote_video');
				if (remote_video) {
					var existingStream = remote_video.srcObject;
					if (existingStream) {
						// Add the track to existing stream if not already there
						var tracks = existingStream.getTracks();
						var hasThisTrack = false;
						for (var t = 0; t < tracks.length; t++) {
							if (tracks[t].id === event.track.id) {
								hasThisTrack = true;
								break;
							}
						}
						if (!hasThisTrack) {
							existingStream.addTrack(event.track);
						}
					} else {
						remote_video.srcObject = audioStream;
					}
				}
			}

			// Handle video tracks - this is the fix for inbound video delay
			else if (event.track.kind === 'video') {
				console.log('peerConnection: Video track received - routing remote video');
				console.log('peerConnection: Video track width:', event.track.getSettings().width, 'height:', event.track.getSettings().height);

				// Create a MediaStream with this video track
				var videoStream = new MediaStream();
				videoStream.addTrack(event.track);

				var remote_video = document.getElementById('remote_video');
				if (remote_video) {
					var existingStream = remote_video.srcObject;
					if (existingStream) {
						// Check if this video track is already in the stream
						var videoTracks = existingStream.getVideoTracks();
						var hasVideoTrack = false;
						for (var v = 0; v < videoTracks.length; v++) {
							if (videoTracks[v].id === event.track.id) {
								hasVideoTrack = true;
								break;
							}
						}
						if (!hasVideoTrack) {
							// Add video track to existing stream (which may already have audio)
							existingStream.addTrack(event.track);
							console.log('peerConnection: Video track added to existing stream');
						}
					} else {
						// No existing stream, use the video stream
						remote_video.srcObject = videoStream;
						console.log('peerConnection: Video stream set on remote_video element');
					}

					// Ensure the video element is playing
					var playPromise = remote_video.play();
					if (playPromise !== undefined) {
						playPromise.then(function() {
							console.log('peerConnection: Remote video playback started successfully');
						}).catch(function(err) {
							console.warn('peerConnection: Remote video playback blocked:', err);
						});
					}

					// Also update route_remote_audio_to_elements to include video
					route_remote_audio_to_elements();
				}
			}
		});
	}

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
		console.log('answer_video: Camera unavailable, answering receive-only remote video');
		answer_call(true, true);
		return;
	}

	// Answer the call with video
	answer_call(true, false);
}

// ============================================================
// MULTI-CALL: Unified answer function (Updated for multi-call)
// ============================================================

/**
 * Answer an incoming call - automatically puts any current active call on hold
 * @param {boolean} use_video - Whether this is a video call
 * @param {boolean} receive_only_video - Whether to receive video only (no send)
 */
async function answer_call(use_video, receive_only_video) {
	if (typeof receive_only_video === 'undefined') {
		receive_only_video = false;
	}

	// Set the session state
	session_hungup = false;

	// ============================================================
	// MULTI-CALL: Auto-hold current call when answering incoming call
	// ============================================================
	let active_calls_before = get_active_call_sessions();
	
	// Get the selected call session
	let selected_call = get_selected_call_session();
	if (!selected_call) {
	// Fallback to legacy session for backward compatibility
	if (!session) {
		return false;
	}
	selected_call = { session: session, display_name: session.display_name, number: session.uri_user, has_video: session.has_video, incoming_number: session.incoming_number };
}

// Hold any other active calls (not the one being answered)
for (let i = 0; i < active_calls_before.length; i++) {
	let call = active_calls_before[i];
	if (call.id !== selected_call.id && !call.is_on_hold && call.session && call.session.status !== SIP.Session.C.STATUS_TERMINATED) {
		console.log('[Call Switching] Putting current call on hold to answer incoming call');
		call.is_on_hold = true;
		call.session.hold().catch(function(err) {
			console.warn('[Call Switching] Failed to hold previous call:', err);
		});
	}
}

	// Get the incoming session to answer
	let incoming_session = selected_call.session || session;
	if (!incoming_session) {
		return false;
	}

	// Record incoming call to history and save entry ID for duration tracking
	if (selected_call.incoming_number || selected_call.number) {
		current_history_entry_id = add_to_history(selected_call.incoming_number || selected_call.number, 'incoming', Date.now(), use_video);
		selected_call.history_entry_id = current_history_entry_id;
	}

	// Start the answer time
	answer_time = Date.now();
	if (selected_call.start_time) {
		selected_call.start_time = answer_time;
	}

	// Pause the ringtone
	stop_call_tone();
	stop_call_waiting_tone();

	// Handle tab audio selection for Chromium browsers
	var answer_audio_constraints = {
		echoCancellation: true,
		noiseSuppression: true,
		autoGainControl: true
	};

	var answer_media = null;

	if (selected_audio_input_device_id === 'tab-audio') {
		try {
			var tab_stream = await navigator.mediaDevices.getDisplayMedia({
				video: false,
				audio: true
			});

			if (tab_stream.getAudioTracks().length === 0) {
				console.error('answer_call: No audio track captured from tab');
				alert('Failed to capture tab audio. Please make sure to check "Share tab audio" when prompted.');
				return;
			}

			incoming_session._tab_audio_stream = tab_stream;
			var tab_audio_track = tab_stream.getAudioTracks()[0];

			var rtc_constraints = {
				"optional": [{ 'DtlsSrtpKeyAgreement': 'true'} ]
			};
			if (use_video) {
				rtc_constraints.offerToReceiveVideo = true;
			}

			answer_media = {
				media: {
					constraints: {
						audio: {
							voiceEchoCancellation: true,
							noiseSuppression: true,
							autoGainControl: true
						}
					},
					render: {
						remote: document.getElementById('remote_video'),
						local: document.getElementById('local_video')
					},
					autoAnswer: true,
					autoAccept: false,
					RTCConstraints: rtc_constraints
				}
			};

			incoming_session.accept(answer_media);

			var sender = incoming_session.mediaHandler.peerConnection.getSenders().find(function(s) {
				return s.track && s.track.kind === 'audio';
			});

			if (sender) {
				await sender.replaceTrack(tab_audio_track);
			}

			if (incoming_session.mediaHandler.localStream) {
				incoming_session.mediaHandler.localStream.addTrack(tab_audio_track);
			}

			tab_audio_track.onended = function() {
				console.log('answer_call: Tab audio stream ended');
				selected_audio_input_device_id = '';
				var select = document.getElementById('audio_input_select');
				if (select) {
					select.value = '';
				}
			};

			if (use_video) {
				ensure_local_video_preview(incoming_session);
			}

			// Update call session state
			if (selected_call) {
				selected_call.is_video = use_video;
				selected_call.start_time = answer_time;
			}

			// Hide call waiting panel if it was showing
			hide_call_waiting_panel();

			// Show the UI
			document.getElementById('dialpad').style.display = "none";
			document.getElementById('ringing').style.display = "none";
			document.getElementById('active').style.display = "grid";
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
			active_call_display_name = selected_call.display_name || '';
			active_call_number = selected_call.number || '';
			update_video_stream_info(selected_call.display_name, selected_call.number, use_video);

			if (use_video) {
				document.getElementById('video_container').style.display = "block";
				if (!receive_only_video && camera_available) {
					document.getElementById('local_video_wrapper').classList.remove('local_preview_hidden');
					document.getElementById('local_video').style.display = "inline";
				} else {
					document.getElementById('local_video_wrapper').classList.add('local_preview_hidden');
					document.getElementById('local_video').style.display = "none";
				}
				document.getElementById('remote_video').style.display = "inline";
				apply_video_fit_layout();
			}

			if (selected_call.incoming_number || selected_call.number) {
				update_active_call_status(use_video, selected_call.display_name || selected_call.incoming_number, selected_call.number || selected_call.incoming_number);
			} else {
				update_active_call_status(use_video, selected_call.display_name, selected_call.number);
			}

			update_status_bar();
			update_active_calls_panel();

			return;
		} catch (err) {
			console.error('answer_call: Tab audio capture failed:', err);
		}
	}

	var video_constraints = use_video && !receive_only_video;
	var rtc_constraints = {
		"optional": [{ 'DtlsSrtpKeyAgreement': 'true'} ]
	};

	var answer_video_constraints = video_constraints;
	if (use_video) {
		answer_video_constraints = {
			offerToReceiveVideo: true
		};
	}

	answer_media = {
		media: {
			constraints: {
				audio: answer_audio_constraints,
				video: answer_video_constraints
			},
			render: {
				remote: document.getElementById('remote_video'),
				local: document.getElementById('local_video')
			},
			autoAnswer: true,
			autoAccept: false,
			RTCConstraints: rtc_constraints
		}
	};
	incoming_session.accept(answer_media);
	if (use_video) {
		ensure_local_video_preview(incoming_session);
	}

	// Update call session state
	if (selected_call) {
		selected_call.is_video = use_video;
		selected_call.start_time = answer_time;
	}

	// Hide call waiting panel if it was showing
	hide_call_waiting_panel();

	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "grid";
	document.getElementById('destination').value = '';

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
	active_call_display_name = selected_call.display_name || '';
	active_call_number = selected_call.number || '';
	update_video_stream_info(selected_call.display_name, selected_call.number, use_video);

	if (use_video) {
		document.getElementById('video_container').style.display = "block";
		if (!receive_only_video && camera_available) {
			document.getElementById('local_video_wrapper').classList.remove('local_preview_hidden');
			document.getElementById('local_video').style.display = "inline";
		} else {
			document.getElementById('local_video_wrapper').classList.add('local_preview_hidden');
			document.getElementById('local_video').style.display = "none";
		}
		document.getElementById('remote_video').style.display = "inline";
		apply_video_fit_layout();
	}

	if (selected_call.incoming_number || selected_call.number) {
		update_active_call_status(use_video, selected_call.display_name || selected_call.incoming_number, selected_call.number || selected_call.incoming_number);
	} else {
		update_active_call_status(use_video, selected_call.display_name, selected_call.number);
	}

	update_status_bar();
	update_active_calls_panel();
}

// ============================================================
// END MULTI-CALL: answer_call
// ============================================================

// Function to pad numbers with leading zeros
function pad(number, length) {
	return (number < 10 ? '0' : '') + number;
}

// Navigation functions to show different panels
function hide_all_panels() {
  document.getElementById('dialpad').style.display = 'none';
  document.getElementById('contacts').style.display = 'none';
  document.getElementById('history').style.display = 'none';
  document.getElementById('messages').style.display = 'none';
  document.getElementById('conversation').style.display = 'none';
  document.getElementById('ringing').style.display = 'none';
  document.getElementById('active').style.display = 'none';
  document.getElementById('settings_panel').style.display = 'none';
}

function show_dialpad() {
	var dialpad = document.getElementById('dialpad');

	// Toggle: if dialpad is already open, close it
	if (dialpad.style.display === 'flex') {
		hide_all_panels();
		update_action_bar_state(null);
		return;
	}
	
	// Show dialpad
	hide_all_panels();
	dialpad.style.display = 'flex';
	update_action_bar_state('dialpad');
}

function show_contacts() {
	// Toggle: if contacts panel is already open, close it
	if (document.getElementById('contacts').style.display === 'flex') {
		hide_all_panels();
		update_action_bar_state(null);
		return;
	}
	
	hide_all_panels();
	render_contacts();
	document.getElementById('contacts').style.display = 'flex';
	update_action_bar_state('contacts');
}

function show_history() {
	// Get the dialpad
	var history = document.getElementById('history');

	// Toggle: if history panel is already open, close it
	if (history.style.display === 'flex') {
		hide_all_panels();
		update_action_bar_state(null);
		return;
	}
	
	hide_all_panels();
	render_history();
	history.style.display = 'flex';
	update_action_bar_state('history');
}

function show_messages() {
	// Toggle: if messages panel is already open, close it
	if (document.getElementById('messages').style.display === 'flex') {
		hide_all_panels();
		document.getElementById('conversation').style.display = 'none';
		update_action_bar_state(null);
		current_conversation_partner = null;
		return;
	}
	
	hide_all_panels();
	render_conversations();
	document.getElementById('messages').style.display = 'flex';
	update_action_bar_state('messages');
}

function update_action_bar_state(active) {
	// Remove active class from all action items
	document.querySelectorAll('.action_item').forEach(function(item) {
		item.classList.remove('active');
	});

	// Add active class based on current panel
	if (active === 'dialpad' || active === 'keypad') {
		document.getElementById('action_keypad').classList.add('active');
	} else if (active === 'contacts') {
		document.getElementById('action_contacts').classList.add('active');
	} else if (active === 'history') {
		document.getElementById('action_history').classList.add('active');
	} else if (active === 'messages' || active === 'conversation') {
		document.getElementById('action_messages').classList.add('active');
	} else if (active === 'settings') {
		document.getElementById('action_settings').classList.add('active');
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

// Format duration in seconds to HH:MM:SS format
function format_duration(seconds) {
	var hours = Math.floor(seconds / 3600);
	var remaining_seconds = seconds % 3600;
	var minutes = Math.floor(remaining_seconds / 60);
	var secs = remaining_seconds % 60;
	return pad(hours, 2) + ':' + pad(minutes, 2) + ':' + pad(secs, 2);
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

// ============================================================
// MULTI-CALL: reset_media (Updated for multi-call)
// ============================================================
function reset_media() {
	var videoElements = [document.getElementById('remote_video'), document.getElementById('local_video')];
	videoElements.forEach(function(video) {
		if (video && video.srcObject) {
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

	var remote_audio = document.getElementById('remote_audio');
	if (remote_audio && remote_audio.srcObject) {
		var audioTracks = remote_audio.srcObject.getTracks();
		audioTracks.forEach(function(track) {
			track.stop();
		});
		remote_audio.srcObject = null;
		remote_audio.pause();
	}
}

// ============================================================
// MULTI-CALL: hangup (Updated for multi-call)
// ============================================================
function hangup() {
	// Get the selected call session
	let selected_call = get_selected_call_session();

	if (!selected_call) {
		// Fallback to legacy session
		if (session && !session_hungup && session.status !== SIP.Session.C.STATUS_TERMINATED) {
			session_hungup = true;
			session.local_ended = true;
			if (session.status === SIP.Session.C.STATUS_CONFIRMED || session.status === SIP.Session.C.STATUS_ANSWERED) {
				session.bye();
			} else {
				session.terminate();
			}
		}
		save_call_duration();
		reset_call_ui_state(true);
		return;
	}

	let call_session = selected_call.session;
	if (!call_session) {
		return;
	}

	// Mark the call as locally ended
	selected_call.local_ended = true;
	session_hungup = true;

	// Hangup the call session
	if (call_session.status === SIP.Session.C.STATUS_CONFIRMED || call_session.status === SIP.Session.C.STATUS_ANSWERED) {
		call_session.bye();
	} else {
		call_session.terminate();
	}

	// Save call duration to history
	save_call_duration(selected_call);

	// Check if there are other active calls
	let remaining_calls = get_active_call_sessions();
	if (remaining_calls.length > 0) {
		// Switch to another active call
		select_call_session(remaining_calls[0].id);
		update_active_calls_panel();
		update_call_controls_for_selected_call();
	} else {
		// No more calls - reset UI
		reset_call_ui_state(true);
	}

	// Remove the ended call from registry
	remove_call_session(selected_call.id);
}

// ============================================================
// MULTI-CALL: hold/unhold (Updated for multi-call)
// ============================================================
function hold() {
	let selected_call = get_selected_call_session();
	if (!selected_call || !selected_call.session) { return; }

	selected_call.is_on_hold = true;
	document.getElementById('hold').style.display = "none";
	document.getElementById('unhold').style.display = "inline";
	sync_call_action_controls();
	update_active_calls_panel();
	
	// Disable audio for this call when holding
	enable_audio_for_call(selected_call.id);
	
	selected_call.session.hold();
}

function unhold() {
	let selected_call = get_selected_call_session();
	if (!selected_call || !selected_call.session) { return; }

	selected_call.is_on_hold = false;
	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";
	sync_call_action_controls();
	update_active_calls_panel();
	
	// Enable audio for this call when unholding
	enable_audio_for_call(selected_call.id);
	
	selected_call.session.unhold();
}

// ============================================================
// MULTI-CALL: mute/unmute (Updated for multi-call)
// ============================================================
function mute_audio() {
	let selected_call = get_selected_call_session();
	if (!selected_call) { return; }

	selected_call.is_muted = true;

	if (selected_call.session) {
		selected_call.session.mute({audio: true});
	}
	if (selected_call.session && selected_call.session.mediaHandler && selected_call.session.mediaHandler.localStream) {
		selected_call.session.mediaHandler.localStream.getAudioTracks().forEach(function(track) {
			track.enabled = false;
		});
	}
	if (selected_call.session && selected_call.session.mediaHandler && selected_call.session.mediaHandler.peerConnection && typeof selected_call.session.mediaHandler.peerConnection.getSenders === 'function') {
		selected_call.session.mediaHandler.peerConnection.getSenders().forEach(function(sender) {
			if (sender.track && sender.track.kind === 'audio') {
				sender.track.enabled = false;
			}
		});
	}

	// Update audio routing to reflect mute state
	enable_audio_for_call(selected_call.id);

	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('unmute_audio').style.display = "inline";
	sync_call_action_controls();
}

function mute_video() {
	let selected_call = get_selected_call_session();
	if (!selected_call) { return; }

	if (selected_call.session) {
		selected_call.session.mute({video: true});
	}
	document.getElementById('local_video').style.display = "none";
	document.getElementById('mute_video').style.display = "none";
	document.getElementById('unmute_video').style.display = "inline";
	sync_call_action_controls();
}

function unmute_audio() {
	let selected_call = get_selected_call_session();
	if (!selected_call) { return; }

	selected_call.is_muted = false;

	if (selected_call.session) {
		selected_call.session.unmute({audio: true});
	}
	if (selected_call.session && selected_call.session.mediaHandler && selected_call.session.mediaHandler.localStream) {
		selected_call.session.mediaHandler.localStream.getAudioTracks().forEach(function(track) {
			track.enabled = true;
		});
	}
	if (selected_call.session && selected_call.session.mediaHandler && selected_call.session.mediaHandler.peerConnection && typeof selected_call.session.mediaHandler.peerConnection.getSenders === 'function') {
		selected_call.session.mediaHandler.peerConnection.getSenders().forEach(function(sender) {
			if (sender.track && sender.track.kind === 'audio') {
				sender.track.enabled = true;
			}
		});
	}

	// Update audio routing to reflect unmute state
	enable_audio_for_call(selected_call.id);

	document.getElementById('mute_audio').style.display = "inline";
	document.getElementById('unmute_audio').style.display = "none";
	sync_call_action_controls();
}

// ============================================================
// END MULTI-CALL: mute/unmute
// ============================================================

function unmute_video() {
	let selected_call = get_selected_call_session();
	if (!selected_call) { return; }

	if (selected_call.session) {
		selected_call.session.unmute({video: true});
	}
	document.getElementById('local_video').style.display = "inline";
	document.getElementById('mute_video').style.display = "inline";
	document.getElementById('unmute_video').style.display = "none";
	sync_call_action_controls();
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

function mute_video(destination) {
	let selected_call = get_selected_call_session();
	if (!selected_call) { return; }

	if (selected_call.session) {
		selected_call.session.mute({video: true});
	}
	document.getElementById('local_video').style.display = "none";
	document.getElementById('mute_video').style.display = "none";
	document.getElementById('unmute_video').style.display = "inline";
	sync_call_action_controls();
}

function unmute_video(destination) {
	let selected_call = get_selected_call_session();
	if (!selected_call) { return; }

	if (selected_call.session) {
		selected_call.session.unmute({video: true});
	}
	document.getElementById('local_video').style.display = "inline";
	document.getElementById('mute_video').style.display = "inline";
	document.getElementById('unmute_video').style.display = "none";
	sync_call_action_controls();
}

// ============================================================
// MULTI-CALL: Blind Transfer (Updated for multi-call)
// ============================================================
function blind_transfer_call(target_number) {
	// Get the selected call session
	let selected_call = get_selected_call_session();
	let transfer_session = selected_call ? selected_call.session : session;

	if (!transfer_session) { 
		show_temporary_status('No active call to transfer', 'fas fa-exclamation-circle');
		return; 
	}
	if (!target_number || target_number.trim() === '') { return; }

	// Create REFER request to transfer current call
	var refer_to = 'sip:' + target_number.trim() + '@' + '<?php echo $domain_name; ?>';

	// Use session.refer() if available, otherwise use session.ua.request()
	if (transfer_session.refer) {
		transfer_session.refer(refer_to).send();
		show_temporary_status('Transferring to ' + target_number, 'fas fa-phone-square');
	} else {
		show_temporary_status('Transfer not supported', 'fas fa-exclamation-triangle');
	}
}

// Show transfer dialog/prompt
function show_blind_transfer_prompt() {
	// Get the selected call session
	let selected_call = get_selected_call_session();
	let check_session = selected_call ? selected_call.session : session;

	if (!check_session) { 
		show_temporary_status('No active call to transfer', 'fas fa-exclamation-circle');
		return; 
	}

	// Get current destination value
	var current_value = document.getElementById('destination').value || '';

	// Use a custom prompt for transfer
	var transfer_number = prompt('Enter extension/number to transfer to:', current_value);

	if (transfer_number && transfer_number.trim() !== '') {
		blind_transfer_call(transfer_number);
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
	document.getElementById('messages').style.display = 'none';
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

// Function called when the dialpad key is pressed
function dialplan_digit_add($digit) {
	// Active call send DTMF
	if (session && session.status === SIP.Session.C.STATUS_CONFIRMED || session && session.status === SIP.Session.C.STATUS_ANSWERED) {
		send_dtmf($digit);
	}

	// Update the Dialpd Destination
	document.getElementById('destination').value = document.getElementById('destination').value + $digit;
	correct_alignment();
}

function digit_add($digit) {
	document.getElementById('destination').value = document.getElementById('destination').value + $digit;
	correct_alignment();
}

function dialpad_digit_delete() {
	destination = document.getElementById('destination').value;
	document.getElementById('destination').value = destination.substring(0, destination.length -1);
	correct_alignment();
}

function digit_clear() {
	document.getElementById('destination').value = '';
	correct_alignment();
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
			duration: 100,		  // 100ms tone duration
			interToneGap: 100	  // 100ms between tones (faster than 3000ms timeout)
		});
	} else {
		// SIP INFO - each digit needs its own request, send as sequence
		// SIP.js 0.7.8 handles multi-character string by sending each as separate INFO
		session.dtmf(digits, {
			duration: 100		   // Duration per tone
		});
	}

	console.log('flush_dtmf_buffer: Started sending sequence');
}

document.addEventListener('keydown', function(e) {
	if (!document.getElementById('destination')) {
		return;
	}

	// Regular dialpad input (not in DTMF keypad mode)
	if (e.key >= '0' && e.key <= '9') {
		e.preventDefault();
		dialplan_digit_add(e.key);
		return;
	}

	if (e.key === '*' || e.key === '#') {
		e.preventDefault();
		dialplan_digit_add(e.key);
		return;
	}

	if (e.key === 'Backspace' || e.key === 'Delete') {
		e.preventDefault();
		dialpad_digit_delete();
		return;
	}

	if (e.key === 'Escape') {
		e.preventDefault();
		dialpad_digit_clear();
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

	// Initialize audio device enumeration and populate the dropdown
	enumerate_audio_devices();

	// Initialize audio output device enumeration and populate the dropdown
	enumerate_audio_output_devices();

	// Initialize video device enumeration and populate the dropdown
	enumerate_video_devices();

	// Initialize ringback sound enumeration and populate the dropdown
	enumerate_ringback_sounds();

	// Initialize ringtone enumeration and populate the dropdown
	enumerate_ringtones();

	// Add change event listener to audio input device selector
	var audio_input_select = document.getElementById('audio_input_select');
	if (audio_input_select) {
		audio_input_select.addEventListener('change', function() {
			var device_id = this.value;
			update_audio_input_device(device_id);
		});
	}

	var audio_output_select = document.getElementById('audio_output_select');
	if (audio_output_select) {
		audio_output_select.addEventListener('change', function() {
			var device_id = this.value;
			console.log('audio_output_select: Device changed to:', device_id);
			update_audio_output_device(device_id);
		});
	}

	// Add change event listener to video input device selector
	var video_input_select = document.getElementById('video_input_select');
	if (video_input_select) {
		video_input_select.addEventListener('change', function() {
			var device_id = this.value;
			update_video_input_device(device_id);
		});
	}

	// Add change event listener to ringback selector
	var ringback_select = document.getElementById('ringback_select');
	if (ringback_select) {
		ringback_select.addEventListener('change', function() {
			selected_ringback_sound = this.value;
			save_phone_setting('ringback_sound', selected_ringback_sound);
			update_ringback_source(selected_ringback_sound);
			console.log('ringback_select: Ringback changed to:', selected_ringback_sound);
		});
	}

	// Add change event listener to ringtone selector
	var ringtone_select = document.getElementById('ringtone_select');
	if (ringtone_select) {
		ringtone_select.addEventListener('change', function() {
			selected_ringtone = this.value;
			save_phone_setting('ringtone', selected_ringtone);
			update_ringtone_source(selected_ringtone);
			console.log('ringtone_select: Ringtone changed to:', selected_ringtone);
		});
	}

	// Re-enumerate devices when the active call panel is shown (in case devices were connected/disconnected)
	var observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
			if (mutation.attributeName === 'style' && document.getElementById('active').style.display === 'grid') {
				// Refresh device list when active call panel is shown
				enumerate_audio_devices();
			}
		});
	});
	var active_div = document.getElementById('active');
	if (active_div) {
		observer.observe(active_div, { attributes: true });
	}
});

// Attended Transfer state (SIPJS 0.7.x compatible)
let attendedTransfer = {
	state: 'idle', // idle | dialing | target_connected
	originalSession: null,  // The original call session being transferred
	targetSession: null,    // The consultation call session
	timeoutId: null,
	isCleaningUp: false
};

function show_attended_transfer_prompt() {
	// Use the selected call session (supports multi-call) instead of just the global session
	let selected_call = get_selected_call_session();
	let check_session = selected_call ? selected_call.session : session;

	if (!check_session || check_session.status !== SIP.Session.C.STATUS_CONFIRMED) {
		show_temporary_status('No active call to transfer', 'fas fa-exclamation-circle');
		return;
	}
	if (attendedTransfer.state !== 'idle') {
		show_temporary_status('Transfer already in progress', 'fas fa-exclamation-triangle');
		return;
	}

	// Store the original session reference for use in other transfer functions
	attendedTransfer.originalSession = check_session;

	let currentVal = document.getElementById('destination').value || '';
	let target = prompt('Enter extension/number to transfer to:', currentVal);

	if (target && target.trim() !== '') {
		start_attended_transfer(target.trim());
	}
}

function start_attended_transfer(target) {
	attendedTransfer.state = 'dialing';
	attendedTransfer.isCleaningUp = false;
	show_temporary_status('Calling transfer target...', 'fas fa-phone');

	// Use the stored original session (supports multi-call)
	let originalSession = attendedTransfer.originalSession || session;

	// Hold original caller so they hear ringback/silence during supervision
	if (originalSession.status === SIP.Session.C.STATUS_CONFIRMED || originalSession.status === SIP.Session.C.STATUS_ANSWERED) {
		console.log('[Attended Transfer] Placing original caller on hold.');
		originalSession.hold();
	}

	toggle_transfer_ui(true); // Switch UI to transfer mode

	// Register the consultation call in the call session registry
	let consultation_call_id = create_call_session('outgoing', target.trim(), 'Transfer Target', false);
	let consultation_call = get_call_session(consultation_call_id);

	// Place secondary call to transfer target
	attendedTransfer.targetSession = user_agent.invite('sip:' + target.trim() + '@<?php echo $domain_name; ?>', {
		media: {
			constraints: { audio: true, video: false },
			render: { remote: document.getElementById('remote_video') }
		}
	});

	// Link the registry entry to the SIP session
	consultation_call.session = attendedTransfer.targetSession;
	consultation_call.display_name = 'Transfer Target';
	consultation_call.number = target.trim();
	consultation_call.is_on_hold = true; // Auto-hold the consultation call

	// Store the consultation call registry ID for cleanup
	attendedTransfer.targetCallId = consultation_call_id;

	let sec = attendedTransfer.targetSession;

	sec.on('progress', function() {
		show_temporary_status('Ringing transfer target...', 'fas fa-phone-volume');
	});

	sec.on('accepted', function() {
		console.log('[Attended Transfer] Target connected. Ready to bridge.');
		attendedTransfer.state = 'target_connected';
		show_temporary_status('Connected to target. Press "Complete Transfer" when ready.', 'fas fa-exchange-alt');
		toggle_transfer_ui_state(true); // Show complete button
	});

	sec.on('bye', function() {
		if (attendedTransfer.isCleaningUp) return; // Prevent recursion
		console.log('[Attended Transfer] Target hung up.');
		if (attendedTransfer.timeoutId) clearTimeout(attendedTransfer.timeoutId);

		// Transfer target rejected or hung up - restore original call
		attendedTransfer.state = 'idle';
		show_temporary_status('Transfer target disconnected. Restoring original call.', 'fas fa-phone-slash');

		// Unhold the original caller so they hear us again
		let orig = attendedTransfer.originalSession || session;
		if (orig && orig.local_hold === true) {
			console.log('[Attended Transfer] Removing hold from original caller.');
			orig.unhold();
		}

		reset_call_controls();
	});

	sec.on('failed', function() {
		console.warn('[Attended Transfer] Call to target failed.');
		if (attendedTransfer.timeoutId) clearTimeout(attendedTransfer.timeoutId);

		// Transfer failed - restore original call
		attendedTransfer.state = 'idle';
		show_temporary_status('Transfer target unreachable. Restoring original call.', 'fas fa-exclamation-triangle');

		// Unhold the original caller
		let orig = attendedTransfer.originalSession || session;
		if (orig && orig.local_hold === true) {
			console.log('[Attended Transfer] Removing hold from original caller.');
			orig.unhold();
		}

		reset_call_controls();
	});

	// 30s timeout fallback
	attendedTransfer.timeoutId = setTimeout(function() {
		if (attendedTransfer.state === 'dialing' && sec.status !== SIP.Session.C.STATUS_TERMINATED) {
			console.log('[Attended Transfer] Timeout ringing target. Hanging up and restoring.');
			sec.bye();

			// Unhold the original caller
			let orig = attendedTransfer.originalSession || session;
			if (orig && orig.local_hold === true) {
				orig.unhold();
			}
		}
	}, 30000);
}

function complete_attended_transfer() {
	if (attendedTransfer.state !== 'target_connected' || !attendedTransfer.targetSession) {
		show_temporary_status('Transfer target not connected yet', 'fas fa-exclamation-triangle');
		return;
	}

	// Use the stored original session reference (supports multi-call)
	var originalSession = attendedTransfer.originalSession || session;   // webphone <-> A : the original caller
	var targetSession = attendedTransfer.targetSession;  // webphone <-> C : the transfer target

	if (!originalSession || !originalSession.dialog || !targetSession.dialog) {
		show_temporary_status('Transfer failed: call not ready', 'fas fa-exclamation-triangle');
		return;
	}

	console.log('[Attended Transfer] Completing attended transfer (REFER with Replaces, no local BYE).');
	show_temporary_status('Completing transfer...', 'fas fa-exchange-alt');

	attendedTransfer.state = 'bridging';

	// Mark cleanup in progress so the consultation session "bye" handler does not
	// mistake FreeSWITCH tearing down our leg for the target hanging up on us.
	attendedTransfer.isCleaningUp = true;

	if (attendedTransfer.timeoutId) {
		clearTimeout(attendedTransfer.timeoutId);
		attendedTransfer.timeoutId = null;
	}

	try {
		// Build the Refer-To header carrying a Replaces parameter (RFC 3891) that
		// points at the consultation dialog (webphone <-> C). This is the exact
		// format SIP.js 0.7.8 uses internally for an attended transfer.
		var referTo = '"' + targetSession.remoteIdentity.friendlyName + '" <' +
			targetSession.dialog.remote_target.toString() +
			'?Replaces=' + targetSession.dialog.id.call_id +
			'%3Bto-tag%3D' + targetSession.dialog.id.remote_tag +
			'%3Bfrom-tag%3D' + targetSession.dialog.id.local_tag + '>';

		var extraHeaders = [];
		extraHeaders.push('Contact: ' + originalSession.contact);
		extraHeaders.push('Allow: ' + SIP.UA.C.ALLOWED_METHODS.toString());
		extraHeaders.push('Refer-To: ' + referTo);

		// Send the REFER on the ORIGINAL leg (to A) WITHOUT terminating it locally.
		//
		// Important: we deliberately do NOT call session.refer() here. The library's
		// refer() sends a BYE on this leg the instant FreeSWITCH answers the REFER
		// with "202 Accepted". When the transferor is the *inbound* party (A called
		// this phone), that premature BYE tears down caller A before FreeSWITCH can
		// re-bridge A to C, so A gets dropped and the consultation leg (B<->C) is
		// left up. By omitting the BYE we let FreeSWITCH complete the bridge (A<->C)
		// and then hang up our two transferor legs itself. This works correctly for
		// both inbound and outbound original calls.
		originalSession.sendRequest(SIP.C.REFER, {
			extraHeaders: extraHeaders,
			receiveResponse: function (response) {
				var code = response && response.status_code;
				if (/^2[0-9]{2}$/.test(String(code))) {
					console.log('[Attended Transfer] REFER accepted (' + code + '). FreeSWITCH bridging the two parties.');
					show_temporary_status('Call transferred', 'fas fa-check-circle');

					// Optimistically return our UI to idle. FreeSWITCH will BYE both
					// of our transferor legs once the bridge is established; the
					// existing session "bye" handlers will run harmlessly.
					save_call_duration();

					// Mark the original session as locally ended to prevent the bye handler
					// from trying to switch calls or hold a terminated session.
					if (attendedTransfer.originalSession) {
						attendedTransfer.originalSession.local_ended = true;
					}

					// Remove both the original call and the consultation call from the registry
					if (attendedTransfer.originalSession && attendedTransfer.originalSession.id) {
						remove_call_session(attendedTransfer.originalSession.id);
					}
					// Use the stored consultation call registry ID for proper cleanup
					if (attendedTransfer.targetCallId) {
						remove_call_session(attendedTransfer.targetCallId);
					}

					// Reset the UI state and clear the call switcher
					reset_call_ui_state(true);
					update_active_calls_panel();

					attendedTransfer.targetSession = null;
					attendedTransfer.originalSession = null;
					attendedTransfer.state = 'idle';
					toggle_transfer_ui(false);
					toggle_transfer_ui_state(false);
				} else if (code && code >= 300) {
					console.error('[Attended Transfer] REFER rejected (' + code + ').');
					show_temporary_status('Transfer failed (' + code + ')', 'fas fa-exclamation-triangle');
					// Stay in consultation so the user can retry or cancel.
					attendedTransfer.state = 'target_connected';
					attendedTransfer.isCleaningUp = false;
				}
			}
		});

	} catch (e) {
		console.error('[Attended Transfer] REFER failed:', e);
		show_temporary_status('Transfer failed: ' + (e && e.message ? e.message : e), 'fas fa-exclamation-triangle');
		// Restore so the user can retry or cancel the transfer.
		attendedTransfer.state = 'target_connected';
		attendedTransfer.isCleaningUp = false;
	}
}

function cleanup_attended_transfer() {
	if (attendedTransfer.isCleaningUp) return; // Guard against recursion
	attendedTransfer.isCleaningUp = true;

	if (attendedTransfer.timeoutId) clearTimeout(attendedTransfer.timeoutId);

	let sec = attendedTransfer.targetSession;
	if (!sec) {
		attendedTransfer.state = 'idle';
		reset_call_controls();
		return;
	}

	// Clear listeners to prevent stale callbacks
	try { sec.removeListener('accepted'); } catch(e){}
	try { sec.removeListener('bye'); } catch(e){}
	try { sec.removeListener('progress'); } catch(e){}
	try { sec.removeListener('failed'); } catch(e){}

	// Safely terminate if not already done
	if (sec.status !== SIP.Session.C.STATUS_TERMINATED) {
		sec.bye();
	}

	// Save call duration to history before resetting UI
	save_call_duration();

	reset_call_ui_state(true);

	attendedTransfer.targetSession = null;
	attendedTransfer.state = 'idle';
	reset_call_controls();
}

function toggle_transfer_ui(isActive) {
	document.getElementById('complete_transfer').style.display = 'none';
	document.getElementById('cancel_transfer').style.display = 'none';
	document.getElementById('hangup').style.display = isActive ? 'none' : 'flex';
	document.getElementById('mute_audio').style.display = isActive ? 'none' : 'inline';
	document.getElementById('hold').style.display = isActive ? 'none' : 'inline';
}

function toggle_transfer_ui_state(isConnected) {
	let complete_transfer = document.getElementById('complete_transfer');
	let cancel_transfer = document.getElementById('cancel_transfer');
	if (complete_transfer && cancel_transfer) {
		complete_transfer.style.display = isConnected ? 'flex' : 'none';
		cancel_transfer.style.display = isConnected ? 'flex' : 'none';
	}
}

function reset_call_controls() {
	set_call_action_mode(true, active_call_is_video);
	toggle_transfer_ui(false);

	// Unhold original call if PBX still holds it
	// Use the stored original session from attended transfer if available
	let origSession = attendedTransfer.originalSession || session;
	if (origSession && origSession.local_hold === true) {
		origSession.unhold();
	}
}

// ============================================================
// CALL WAITING TONE
// ============================================================

/**
 * Play the call waiting tone (distinct pattern to indicate another call is waiting)
 */
function play_call_waiting_tone() {
	if (active_call_tone_mode === 'call_waiting') {
		return;
	}
	stop_call_tone();
	active_call_tone_mode = 'call_waiting';

	// Use a different cadence for call waiting (fast pulsing)
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	if (AudioContextClass && !call_tone_context) {
		call_tone_context = new AudioContextClass();
	}
	if (call_tone_context && call_tone_context.state === 'suspended') {
		call_tone_context.resume().catch(function() {});
	}

	const play_waiting_burst = function() {
		if (!call_tone_context || active_call_tone_mode !== 'call_waiting') return;
		const end_time = call_tone_context.currentTime + 0.15;
		[440, 480].forEach(function(frequency) {
			const oscillator = call_tone_context.createOscillator();
			const gain = call_tone_context.createGain();
			oscillator.type = 'sine';
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0.0001, call_tone_context.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.02, call_tone_context.currentTime + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, end_time);
			oscillator.connect(gain);
			gain.connect(call_tone_context.destination);
			oscillator.start();
			oscillator.stop(end_time);
		});
	};

	call_tone_interval = setInterval(play_waiting_burst, 300);
	call_tone_timeout = setTimeout(function() {
		if (active_call_tone_mode === 'call_waiting') {
			stop_call_waiting_tone();
		}
	}, 30000);
	console.log('[Call Waiting] Playing call waiting tone');
}

/**
 * Stop the call waiting tone
 */
function stop_call_waiting_tone() {
	if (active_call_tone_mode === 'call_waiting') {
		active_call_tone_mode = null;
		stop_call_tone();
		console.log('[Call Waiting] Stopped call waiting tone');
	}
}

// ============================================================
// CALL SWITCHER UI HELPERS
// ============================================================

/**
 * Timer ID for the call switcher duration refresh interval
 */
let active_calls_panel_refresh_interval = null;

/**
 * Update the call switcher UI to show all active calls
 */
/**
 * Render the active calls list items in the panel
 * Called by update_active_calls_panel() and show_active_calls_panel()
 */
function render_active_calls() {
	let container = document.getElementById('active_calls_panel_list');
	if (!container) return;
	container.innerHTML = '';

	let active_call_sessions = get_active_call_sessions();

	if (active_call_sessions.length === 0) {
		container.innerHTML = '<div style="text-align: center; color: #ccc; padding: 40px; font-size: 16px;">No active calls</div>';
		return;
	}

	active_call_sessions.forEach(function(call) {
		let call_div = document.createElement('div');
		call_div.className = 'active_calls_panel_item';
		if (selected_call_session_id === call.id) {
			call_div.classList.add('selected');
		}
		call_div.onclick = function() { select_call_session(call.id); };

		let icon_class = 'fa-phone';
		let status_text = 'Active';
		let icon_bg = '#1eba00';

		if (call.is_on_hold) {
			icon_class = 'fa-pause';
			status_text = 'On Hold';
			icon_bg = '#ffaa00';
		} else if (call.direction === 'incoming') {
			icon_class = 'fa-phone-volume';
			icon_bg = '#1e90ff';
		}

		if (call.is_video) {
			icon_class = 'fa-video';
		}

		let duration_str = '';
		if (call.start_time && !call.is_on_hold) {
			let elapsed = Math.floor((Date.now() - call.start_time) / 1000);
			duration_str = ' \u2022 ' + format_duration(elapsed);
		}

		let display_name = call.display_name || '';
		let caller_number = call.number || '';

		let item_html = '<div class="active_calls_panel_icon" style="background: ' + icon_bg + ';">';
		item_html += '<i class="fas ' + icon_class + '"></i>';
		item_html += '</div>';
		item_html += '<div class="active_calls_panel_info">';
		item_html += '<div class="active_calls_panel_name">' + sanitize_string(display_name) + '</div>';
		item_html += '<div class="active_calls_panel_number">' + sanitize_string(caller_number) + '</div>';
		item_html += '<div class="active_calls_panel_status">' + status_text + duration_str + '</div>';
		item_html += '</div>';
		item_html += '<div class="active_calls_panel_select"><i class="fas fa-check"></i></div>';

		call_div.innerHTML = item_html;
		call_div.setAttribute('data-call-id', call.id);
		call_div.setAttribute('data-call-start-time', call.start_time || '0');
		container.appendChild(call_div);
	});
}

/**
 * Update the active calls panel UI to show all active calls
 * Updates panel content without auto-showing the panel.
 * The panel only shows when the user clicks the "Calls" button.
 */
function update_active_calls_panel() {
	let active_calls_panel = document.getElementById('active_calls_panel');
	if (!active_calls_panel) return;

	let active_call_sessions = get_active_call_sessions();
	if (active_call_sessions.length === 0) {
		active_calls_panel.style.display = 'none';
		// Stop the refresh interval when no calls are active
		if (active_calls_panel_refresh_interval) {
			clearInterval(active_calls_panel_refresh_interval);
			active_calls_panel_refresh_interval = null;
		}
		// Also hide the action bar button
		update_active_calls_button();
		return;
	}

	render_active_calls();

	// Start the refresh interval if not already running
	if (!active_calls_panel_refresh_interval) {
		active_calls_panel_refresh_interval = setInterval(refresh_active_calls_panel_durations, 1000);
	}
}

/**
 * Refresh the duration display for all active calls in the call switcher
 * Called every second to keep durations up to date
 */
function refresh_active_calls_panel_durations() {
	let active_calls_panel = document.getElementById('active_calls_panel');
	if (!active_calls_panel) return;

	let call_items = active_calls_panel.querySelectorAll('.active_calls_panel_item');
	call_items.forEach(function(item) {
		let call_id = parseInt(item.getAttribute('data-call-id') || '0');
		let start_time = parseInt(item.getAttribute('data-call-start-time') || '0');

		if (call_id && start_time > 0) {
			let call = get_call_session(call_id);
			if (call && call.start_time && !call.is_on_hold) {
				let elapsed = Math.floor((Date.now() - call.start_time) / 1000);
				let duration_str = format_duration(elapsed);
				let status_div = item.querySelector('.active_calls_panel_status');
				if (status_div) {
					let parts = status_div.textContent.split(' • ');
					let status_part = parts[0] || 'Active';
					status_div.textContent = status_part + ' • ' + duration_str;
				}
			}
		}
	});
}

/**
 * Show the active calls panel (like show_history)
 */
function show_active_calls_panel() {
	// Only show if there are active calls
	if (get_active_call_count() === 0) {
		hide_active_calls_panel();
		return;
	}

	hide_all_panels();
	render_active_calls();
	document.getElementById('active_calls_panel').style.display = 'flex';
	update_action_bar_state('active_calls');
}

/**
 * Hide the active calls panel
 */
function hide_active_calls_panel() {
	let panel = document.getElementById('active_calls_panel');
	if (!panel) return;
	panel.style.display = 'none';
	update_action_bar_state(null);
}

/**
 * Toggle the active calls panel visibility
 */
function toggle_active_calls_panel() {
	let panel = document.getElementById('active_calls_panel');
	if (!panel) return;
	if (panel.style.display === 'flex') {
		hide_active_calls_panel();
	} else {
		show_active_calls_panel();
	}
}

/**
 * Update the active calls action bar button visibility
 * Shows the button only when there are active call sessions
 */
function update_active_calls_button() {
	let active_count = get_active_call_count();
	let action_button = document.getElementById('action_active_calls');
	if (!action_button) return;
	if (active_count > 0) {
		action_button.style.display = 'flex';
	} else {
		action_button.style.display = 'none';
		hide_active_calls_panel();
	}
}

function update_call_controls_for_selected_call() {
	let selected = get_selected_call_session();
	if (!selected) return;

	// Update display name and number
	active_call_display_name = selected.display_name;
	active_call_number = selected.number;
	active_call_is_video = selected.is_video;

	// Update hold button visibility
	if (selected.is_on_hold) {
		document.getElementById('hold').style.display = 'none';
		document.getElementById('unhold').style.display = 'inline';
	} else {
		document.getElementById('hold').style.display = 'inline';
		document.getElementById('unhold').style.display = 'none';
	}

	// Update mute button
	if (selected.is_muted) {
		document.getElementById('mute_audio').style.display = 'none';
		document.getElementById('unmute_audio').style.display = 'inline';
	} else {
		document.getElementById('mute_audio').style.display = 'inline';
		document.getElementById('unmute_audio').style.display = 'none';
	}

	// Update video buttons
	if (selected.is_video) {
		document.getElementById('mute_video').style.display = 'inline';
		document.getElementById('unmute_video').style.display = 'none';
	} else {
		document.getElementById('mute_video').style.display = 'none';
		document.getElementById('unmute_video').style.display = 'none';
	}

	// Ensure audio is enabled for the selected call and disabled for others
	enable_audio_for_call(selected.id);

	// Sync action bar controls
	sync_call_action_controls();

	// Update status bar
	update_status_bar();
}

/**
 * Enable audio for the selected call and disable audio for all other calls
 * This ensures only the active call has audio
 * @param {number} active_call_id - The call ID that should have audio enabled
 */
function enable_audio_for_call(active_call_id) {
	// Disable audio for all calls
	Object.keys(call_session_list).forEach(function(call_id) {
		let call = call_session_list[call_id];
		if (!call.session || !call.session.mediaHandler || !call.session.mediaHandler.peerConnection) {
			return;
		}
		
		// Only enable audio for the active call if it's not muted
		let should_enable = (call_id == active_call_id) && !call.is_on_hold && !call.is_muted;
		
		// Disable all audio tracks in this peer connection
		let senders = call.session.mediaHandler.peerConnection.getSenders();
		for (let i = 0; i < senders.length; i++) {
			if (senders[i].track && senders[i].track.kind === 'audio') {
				senders[i].track.enabled = should_enable;
			}
		}
		
		// Disable/enable local stream audio tracks
		if (call.session.mediaHandler.localStream) {
			let audioTracks = call.session.mediaHandler.localStream.getAudioTracks();
			for (let i = 0; i < audioTracks.length; i++) {
				audioTracks[i].enabled = should_enable;
			}
		}
	});
}

/**
 * Handle call session state changes (for UI updates)
 */
function on_call_session_state_change(call_id, new_state) {
	let call = get_call_session(call_id);
	if (!call) return;

	console.log('[Call Registry] Call session', call_id, 'state changed to:', new_state);
	update_active_calls_panel();

	if (selected_call_session_id === call_id) {
		update_call_controls_for_selected_call();
	}
}

// ============================================================
// END CALL SWITCHER UI HELPERS
// ============================================================

// ============================================================
// MULTI-CALL UI - Answer/Decline for call waiting
// ============================================================

/**
 * Show the call waiting incoming panel
 */
function show_call_waiting_panel(call_id, incoming_session) {
	let call = get_call_session(call_id);
	if (!call) return;

	// Show the ringing panel for the waiting call
	document.getElementById('ringing').style.display = 'flex';
	document.getElementById('ringing').setAttribute('data-waiting-call-id', call_id);

	let video_indicator = call.is_video ? "<div class='caller_video'><i class='fas fa-video'></i> Video Call</div>" : "";
	document.getElementById('ringing_caller_id').innerHTML =
		"<div class='caller_name'>" + sanitize_string(call.display_name) + "</div>" +
		"<div class='caller_number'><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(call.number) + "' target='_blank'>" + sanitize_string(call.number) + "</a></div>" +
		video_indicator;
	document.getElementById('active_caller_id').innerHTML = document.getElementById('ringing_caller_id').innerHTML;

	// Show answer/decline buttons
	document.getElementById('answer_audio').style.display = 'inline';
	document.getElementById('answer_video').style.display = call.is_video ? 'inline' : 'inline';
	document.getElementById('decline').style.display = 'inline';
	set_hangup_visibility(false);

	// Play call waiting tone
	play_call_waiting_tone();
}

/**
 * Decline a call waiting (incoming call)
 */
function decline_call_waiting() {
	let waiting_call_id = parseInt(document.getElementById('ringing').getAttribute('data-waiting-call-id') || '0');
	if (waiting_call_id > 0) {
		let call = get_call_session(waiting_call_id);
		if (call && call.session) {
			call.session.reject();
		}
	}
	stop_call_waiting_tone();
	hide_call_waiting_panel();
}

/**
 * Hide the call waiting panel
 */
function hide_call_waiting_panel() {
	document.getElementById('ringing').style.display = 'none';
	document.getElementById('ringing').removeAttribute('data-waiting-call-id');
	stop_call_waiting_tone();
}

// ============================================================
// END MULTI-CALL UI
// ============================================================
