
function sanitize_string(str) {
	let temp = document.createElement('div');
	temp.textContent = str;
	return temp.innerHTML;
}

let user_agent;
let session;
let answer_time;
let session_hungup = false;

var config = {
	uri: '<?php echo $user_extension.'@'.$domain_name; ?>',
	ws_servers: 'wss://<?php echo $domain_name; ?>:7443',
	authorizationUser: '<?php echo $user_extension; ?>',
	password: atob('<?php echo base64_encode($user_password); ?>'),
	registerExpires: 120,
	displayName: "<?php echo $user_extension; ?>"
};

user_agent = new SIP.UA(config);

//here you determine whether the call has video and audio
var options = {
	media: {
		constraints: {
			audio: true,
			video: false
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

//answer
user_agent.on('invite', function (s) {

	if (typeof session !== "undefined" && session.display_name != s.remoteIdentity.displayName) {
		return;
	}

	//save the session to the global session
	session = s;
	session.display_name = session.remoteIdentity.displayName;
	session.uri_user = session.remoteIdentity.uri.user;

	//send the object to the browser console
	//console.log(session);

	//play the ringtone
	document.getElementById('ringtone').play();

<?php

//open the window to search for the caller id
if (!empty($search_enabled) && $search_enabled == 'true') {
	echo "	//open a window when the call is answer\n";
	echo "	dashboard_url = 'https://".$search_domain."/".$search_path."?".$search_parameter."=' + sanitize_string(session.uri_user);\n";
	echo "	dashboard_target = '".$search_target."';\n";
	if (!empty($search_width) && !empty($search_height)) {
		echo "	window_parameters = 'width=".$search_width.",height=".$search_height."';\n";
	}
	else {
		echo "	window_parameters = '';\n";
	}
	echo "	window.open(dashboard_url, dashboard_target, window_parameters);\n";
}

?>

	//add the caller ID
	document.getElementById('ringing_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/app/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>";
	document.getElementById('active_caller_id').innerHTML = "<div>" + sanitize_string(session.display_name) + "</div><div style='flex-basis: 100%; height: 0;'></div><div><a href='https://<?php echo $_SESSION['domain_name']; ?>/app/contacts/contacts.php?search=" + sanitize_string(session.uri_user) + "' target='_blank'>" + sanitize_string(session.uri_user) + "</a></div>";

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

	//start the answer time
	answer_time = Date.now();

	//pause the ringtone
	document.getElementById('ringtone').pause();

	//answer the call
	session.accept({
		media: {
			constraints: {
				audio: true,
				video: false
			},
				render: {
					remote: document.getElementById('remote_video'),
					local: document.getElementById('local_video')
				},
				RTCConstraints: {
					"optional": [{ 'DtlsSrtpKeyAgreement': 'true'} ]
				}
		}
	});

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
}

// Function to pad numbers with leading zeros
function pad(number, length) {
	return (number < 10 ? '0' : '') + number;
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

	document.getElementById('local_video').style.display = "none";
	document.getElementById('remote_video').style.display = "none";

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

	//show or hide the panels
	document.getElementById('dialpad').style.display = "none";
	document.getElementById('ringing').style.display = "none";
	document.getElementById('active').style.display = "grid";

	document.getElementById('answer').style.display = "none";
	document.getElementById('decline').style.display = "none";
	document.getElementById('hangup').style.display = "inline";
	//document.getElementById('local_video').style.display = "inline";
	//document.getElementById('remote_video').style.display = "inline";
	document.getElementById('mute_audio').style.display = "inline";
	//document.getElementById('mute_video').style.display = "inline";

	//make a call using a sip invite
	session = user_agent.invite('sip:'+destination+'@<?php echo $domain_name; ?>', options);

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
	document.getElementById("destination").addEventListener("keydown", send_enter_key);
});
