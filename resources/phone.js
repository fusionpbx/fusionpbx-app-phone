
function sanitize_string(str) {
	let temp = document.createElement('div');
	temp.textContent = str;
	return temp.innerHTML;
}

// Toggle video call option
async function toggle_video() {
	// First, check if camera is available on the first enable attempt
	if (!video_enabled) {
		var hasCamera = await check_camera_permissions(false);
		if (!hasCamera) {
			alert('Camera access is required for video calls.\n\nThis phone app requires HTTPS to access your camera.\n\nMake sure:\n1. You are accessing this page via HTTPS\n2. Your browser has granted camera permissions');
			return false;
		}
	}
	
	video_enabled = !video_enabled;
	var toggleBtn = document.getElementById('toggle_video');
	var videoContainer = document.getElementById('video_container');
	if (video_enabled) {
		toggleBtn.querySelector('i').className = 'fas fa-video';
		toggleBtn.classList.add('active');
		if (session) {
			videoContainer.style.display = 'block';
		}
	} else {
		toggleBtn.querySelector('i').className = 'fas fa-video-slash';
		toggleBtn.classList.remove('active');
		videoContainer.style.display = 'none';
	}
	return video_enabled;
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
		return true;
	} catch (err) {
		console.warn('Camera access not available:', err.name, err.message);
		return false;
	}
}

// Initialize camera permission check on page load
window.addEventListener('DOMContentLoaded', async function() {
	var hasCamera = await check_camera_permissions();
	var toggleBtn = document.getElementById('toggle_video');
	if (!hasCamera) {
		// Disable video toggle if camera is not accessible
		toggleBtn.style.opacity = '0.5';
		toggleBtn.style.cursor = 'not-allowed';
		toggleBtn.title = 'Camera not available - using audio only';
		document.getElementById('status_text').textContent = 'Camera unavailable - Audio only';
	}
});

let user_agent;
let session;
let answer_time;
let session_hungup = false;
let video_enabled = false;  // Video call toggle state

var config = {
	uri: '<?php echo $user_extension.'@'.$domain_name; ?>',
	ws_servers: 'wss://<?php echo $domain_name; ?>:7443',
	authorizationUser: '<?php echo $user_extension; ?>',
	password: atob('<?php echo base64_encode($user_password); ?>'),
	registerExpires: 120,
	displayName: "<?php echo $user_extension; ?>"
};

user_agent = new SIP.UA(config);

// Connection status handling
user_agent.on('connected', function() {
	document.getElementById('status_text').textContent = 'Ready';
	document.querySelector('#status_bar .status_icon i').className = 'fas fa-circle';
});

user_agent.on('disconnected', function() {
	update_status_bar();
});

user_agent.on('failed', function() {
	update_status_bar();
});

function update_status_bar() {
	// Only update if not in a call
	if (!session || !session.status) {
		var cameraStatus = camera_available ? '' : ' (Camera unavailable)';
		document.getElementById('status_text').textContent = 'Ready' + cameraStatus;
		document.querySelector('#status_bar .status_icon i').className = 'fas fa-circle';
	}
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

function add_to_history(number, call_type, timestamp) {
	var history = get_call_history();
	var entry = {
		id: Date.now(),
		number: number,
		call_type: call_type,  // 'outgoing', 'incoming', 'missed'
		timestamp: timestamp,
		duration: 0,
		is_video: false  // Default to audio-only
	};
	history.unshift(entry);  // Add to beginning

	// Keep only last 100 entries
	if (history.length > 100) {
		history = history.slice(0, 100);
	}
	save_call_history(history);
	return entry;
}

// Function to generate media options based on video_enabled state
function get_media_options() {
	return {
		media: {
			constraints: {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				video: video_enabled
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

//here you determine whether the call has video and audio
var options = get_media_options();

//answer
user_agent.on('invite', function (s) {

	if (typeof session !== "undefined" && session.display_name != s.remoteIdentity.displayName) {
		return;
	}

	//save the session to the global session
	session = s;
	session.display_name = session.remoteIdentity.displayName;
	session.uri_user = session.remoteIdentity.uri.user;
	session.incoming_number = session.remoteIdentity.uri.user || session.remoteIdentity.displayName;
	session.has_video = detect_video_invite(s);

	//send the object to the browser console
	//console.log(session);

	// Update status bar for incoming call
	var incoming_type = session.has_video ? 'Incoming Video Call' : 'Incoming Call';
	document.getElementById('status_text').textContent = incoming_type;
	document.querySelector('#status_bar .status_icon i').className = session.has_video ? 'fas fa-video' : 'fas fa-phone-volume';

	//play the ringtone
	document.getElementById('ringtone').play();

<?php

//open the window to search for the caller id
if (!empty($search_enabled) && $search_enabled == 'true') {
	echo "	//open a window when the call is answer\n";
	echo "	dashboard_url = 'https://".$search_domain."/".$search_path."?".$search_parameter."=' + sanitize_string(session.uri_user);\n";
	echo "	dashboard_target = '".$search_target."';\n";
	if (!empty($search_width) && !empty($search_height)) {
		echo "		window_parameters = 'width=".$search_width.",height=".$search_height."';\n";
	}
	else {
		echo "		window_parameters = '';\n";
	}
	echo "	window.open(dashboard_url, dashboard_target, window_parameters);\n";
}

?>

	//add the caller ID with video indicator if applicable
	var video_indicator = session.has_video ? "<div style='color: #1eba00; font-size: 0.7em;'><i class='fas fa-video'></i> Video Call</div>" : "";
	document.getElementById('ringing_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;
	document.getElementById('active_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/core/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>" + video_indicator;

	//show or hide the panels
	document.getElementById('dialpad').style.display = "none";
	document.getElementById('ringing').style.display = "inline";

	//show or hide the buttons
	document.getElementById('answer').style.display = "inline";
	document.getElementById('decline').style.display = "inline";
	document.getElementById('hangup').style.display = "none";
	document.getElementById('mute_audio').style.display = "inline";
	document.getElementById('mute_video').style.display = "none";

	session.on('cancel', function (s) {
		// Record missed call
		if (session.incoming_number) {
			add_to_history(session.incoming_number, 'missed', Date.now());
		}

		//play the ringtone
		document.getElementById('ringtone').pause();

		//show or hide the panels
		document.getElementById('dialpad').style.display = "grid";
		document.getElementById('ringing').style.display = "none";
		document.getElementById('active').style.display = "none";

		//show or hide the buttons
		document.getElementById('answer').style.display = "none";
		document.getElementById('decline').style.display = "none";
		document.getElementById('hangup').style.display = "none";

		//clear the caller id
		document.getElementById('ringing_caller_id').innerHTML = '';
		document.getElementById('active_caller_id').innerHTML = '';

		//clear the answer time
		answer_time = null;

		// Reset status
		document.getElementById('status_text').textContent = 'Ready';
		document.querySelector('#status_bar .status_icon i').className = 'fas fa-circle';

		//end the call
		hangup();
	});

	session.on('bye', function (s) {
		//play the ringtone
		document.getElementById('ringtone').pause();

		//show or hide the panels
		document.getElementById('dialpad').style.display = "grid";
		document.getElementById('ringing').style.display = "none";
		document.getElementById('active').style.display = "none";

		//show or hide the buttons
		document.getElementById('answer').style.display = "none";
		document.getElementById('decline').style.display = "none";
		document.getElementById('hangup').style.display = "none";

		//clear the answer time
		answer_time = null;

		//reset the media
		reset_media();

		//end the call
		if (!session || !session_hungup) {
			hangup();
		}
	});

	session.on('failed', function (s) {
		//play the ringtone
		document.getElementById('ringtone').pause();

		//show or hide the panels
		document.getElementById('dialpad').style.display = "grid";
		document.getElementById('ringing').style.display = "none";
		document.getElementById('active').style.display = "none";

		//show or hide the buttons
		document.getElementById('answer').style.display = "none";
		document.getElementById('decline').style.display = "none";
		document.getElementById('hangup').style.display = "none";

		//clear the answer time
		answer_time = null;

		//end the call
		if (!session || !session_hungup) {
			hangup();
		}
	});

	session.on('rejected', function (s) {
		// Record missed call
		if (session.incoming_number) {
			add_to_history(session.incoming_number, 'missed', Date.now());
		}

		//play the ringtone
		document.getElementById('ringtone').pause();

		//show or hide the panels
		document.getElementById('dialpad').style.display = "grid";
		document.getElementById('ringing').style.display = "none";
		document.getElementById('active').style.display = "none";

		//show or hide the buttons
		document.getElementById('answer').style.display = "none";
		document.getElementById('decline').style.display = "none";
		document.getElementById('hangup').style.display = "none";

		//clear the answer time
		answer_time = null;

		//end the call
		hangup();
	});

});

function answer() {

	//set the session state
	session_hungup = false;

	//continue if the session exists
	if (!session) {
		return false;
	}

	// Record incoming call to history
	if (session.incoming_number) {
		add_to_history(session.incoming_number, 'incoming', Date.now());
	}

	//start the answer time
	answer_time = Date.now();

	//pause the ringtone
	document.getElementById('ringtone').pause();
	document.getElementById('ringtone').currentTime = 0;

	//answer the call with current video settings
	var answer_media = {
		media: {
			constraints: {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				video: video_enabled
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

	//show the or hide the panels
	document.getElementById('dialpad').style.display = "none";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "grid";
	document.getElementById('destination').value = '';

	//show or hide the buttons
	document.getElementById('answer').style.display = "none";
	document.getElementById('decline').style.display = "none";
	document.getElementById('unhold').style.display = "none";
	document.getElementById('hangup').style.display = "inline";

	//show video if enabled or incoming call has video
	if (video_enabled || session.has_video) {
		document.getElementById('video_container').style.display = "block";
		document.getElementById('toggle_video').querySelector('i').className = 'fas fa-video';
		document.getElementById('toggle_video').classList.add('active');
		video_enabled = true;
	}

	// Update status bar for active call
	if (session.incoming_number) {
		document.getElementById('status_text').textContent = 'Call in progress';
	}
	document.querySelector('#status_bar .status_icon i').className = (video_enabled || session.has_video) ? 'fas fa-video' : 'fas fa-phone';
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

//function to get the current time in seconds
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
	}
	else {
		console.log('Call has not been answered yet');
		return null;
	}
}

//update elapsed time every second
setInterval(get_session_time, 1000);

//function to reset media after a call ends
function reset_media() {
	const videoElements = [document.getElementById('remote_video'), document.getElementById('local_video')];
	videoElements.forEach(video => {
		video.srcObject = null;
		video.pause();
	});
}

//function used to end the session
function hangup() {

	//return immediately if the session is already hungup
	if (!session || session_hungup || session.status === SIP.Session.C.STATUS_TERMINATED) {
		return;
	}

	//set the session state as hungup
	session_hungup = true;

	//end the session if active
	if (session.status === SIP.Session.C.STATUS_CONFIRMED || session.status === SIP.Session.C.STATUS_ANSWERED) {
		session.bye();
	} else {
		session.terminate();
	}

	//reset the media
	reset_media();

	//show or hide the panels
	document.getElementById('dialpad').style.display = "grid";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "none";

	//show or hide the buttons
	document.getElementById('answer').style.display = "none";
	document.getElementById('decline').style.display = "none";
	document.getElementById('hangup').style.display = "none";

	document.getElementById('video_container').style.display = "none";
	document.getElementById('local_video').style.display = "none";
	document.getElementById('remote_video').style.display = "none";

	//reset video toggle button
	var toggleBtn = document.getElementById('toggle_video');
	toggleBtn.querySelector('i').className = 'fas fa-video-slash';
	toggleBtn.classList.remove('active');
	video_enabled = false;

	document.getElementById('mute_audio').style.display = "none";
	//document.getElementById('mute_video').style.display = "none";
	document.getElementById('unmute_audio').style.display = "none";
	//document.getElementById('unmute_video').style.display = "none";

	document.getElementById('unhold').style.display = "none";
	document.getElementById('hold').style.display = "inline";

	//clear the caller ID and timer
	document.getElementById('ringing_caller_id').innerHTML = '';
	document.getElementById('active_caller_id').innerHTML = '';
	document.getElementById('answer_time').innerHTML = '00:00:00';

	//mute the audio
	//session.mute({audio: true});

	// Reset status bar
	document.getElementById('status_text').textContent = 'Ready';
	document.querySelector('#status_bar .status_icon i').className = 'fas fa-circle';
}

function hold() {
	if (!session) { return; }
	document.getElementById('hold').style.display = "none";
	document.getElementById('unhold').style.display = "inline";
	session.hold();
	//session.hold({
	//	useUpdate: true
	//});
}

function unhold() {
	if (!session) { return; }
	document.getElementById('hold').style.display = "inline";
	document.getElementById('unhold').style.display = "none";
	session.unhold();
	//session.unhold({
	//	useUpdate: true
	//});
}

function send() {

	//set the session state
	session_hungup = false;

	//get the destination number
	destination = document.getElementById('destination').value;

	//return immediately if there is no destination
	if (destination.length == 0) {
		return;
	}

	// Add to call history as outgoing
	add_to_history(destination, 'outgoing', Date.now());

	//show or hide the panels
	hide_all_panels();

	document.getElementById('active').style.display = "grid";

	// Update status bar
	var call_type = video_enabled ? 'Calling (Video) ' : 'Calling ';
	document.getElementById('status_text').textContent = call_type + destination;
	document.querySelector('#status_bar .status_icon i').className = video_enabled ? 'fas fa-video' : 'fas fa-phone';

	document.getElementById('hangup').style.display = "inline";
	if (video_enabled) {
		document.getElementById('video_container').style.display = "block";
	}
	document.getElementById('mute_audio').style.display = "inline";

	// Refresh options to get current video_enabled state
	var call_options = get_media_options();
	//make a call using a sip invite
	session = user_agent.invite('sip:'+destination+'@<?php echo $domain_name; ?>', call_options);

	var remote_video = document.getElementById("remote_video");
	remote_video.setAttribute("controls","controls");

	//unmute the audio
	session.unmute({audio: true});

	//start the answer time
	answer_time = Date.now();

	//set the caller ID to the destination
	document.getElementById('ringing_caller_id').innerHTML = destination;
	document.getElementById('active_caller_id').innerHTML = destination;

}

function mute_audio(destination) {
	if (!session) { return; }
	session.mute({audio: true});
	document.getElementById('mute_audio').style.display = "none";
	document.getElementById('unmute_audio').style.display = "inline";
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

	// Reset status
	document.getElementById('status_text').textContent = 'Ready';
	document.querySelector('#status_bar .status_icon i').className = 'fas fa-circle';

	// Show dialpad
	document.getElementById('dialpad').style.display = 'grid';
	document.getElementById('ringing').style.display = 'none';
	document.getElementById('active').style.display = 'none';

	// Clear all buttons
	document.getElementById('answer').style.display = 'none';
	document.getElementById('decline').style.display = 'none';
	document.getElementById('hangup').style.display = 'none';
	document.getElementById('mute_audio').style.display = 'none';
}

//function to center entered digits until full, then right-align and change text direction so last entered digits are always visible
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

//function to detect numberpad keypresses
document.addEventListener('keyup', function(e) {
	if (document.getElementById('destination')) { //destination field is visible
		if (
			(e.which >= 48 && e.which <= 57) || //numbers
			(e.which >= 96 && e.which <= 105) || //number pad
			(e.which == 56 || e.which == 106) || //asterisk
			(e.which == 51) //pound
			) {
			e.preventDefault();
			digit_add(e.key);
		}
		if (e.which == 8 || e.which == 46) { //backspace or delete
			e.preventDefault();
			digit_delete();
		}
		if (e.which == 27) { //escape
			e.preventDefault();
			digit_clear();
		}
		if (e.which == 13) { //enter
			e.preventDefault();
			send();
		}
	}
});

//function to check for Enter key press
function send_enter_key(event) {
	if (event.key === "Enter") {
		send();
	}
}

//add event listener for keydown event on input field
document.addEventListener("DOMContentLoaded", function() {
	var destinationInput = document.getElementById("destination");
	if (destinationInput) {
		destinationInput.addEventListener("keydown", function(event) {
			if (event.key === "Enter") {
				send();
			}
		});
	}
});

//keyboard event handler for keypad panel
document.addEventListener('keyup', function(e) {
	if (document.getElementById('destination')) {
		if (
			(e.which >= 48 && e.which <= 57) ||
			(e.which >= 96 && e.which <= 105) ||
			(e.which == 56 || e.which == 106) ||
			(e.which == 51)
			) {
			e.preventDefault();
			digit_add(e.key);
		}
		if (e.which == 8 || e.which == 46) {
			e.preventDefault();
			digit_delete();
		}
		if (e.which == 27) {
			e.preventDefault();
			digit_clear();
		}
		if (e.which == 13) {
			e.preventDefault();
			send();
		}
	}
});
