# FusionPBX Phone App (WebRTC + Messaging) - Debian 12 Install Guide

This guide is for a **brand-new Debian 12 server** and a clean FusionPBX + FreeSWITCH installation.

It covers:
- Voice calling from the browser phone app
- Internal SIP MESSAGE-based chat delivery
- Browser receive path for extension replies

It also documents the current messaging constraints of this app implementation.

## 1. What Works Today

### Voice
- Browser registers over `wss://<your-domain>:7443`
- Outbound and inbound SIP calls in the phone UI

### Messaging
- Browser send path triggers FreeSWITCH `SMS::SEND_MESSAGE` event delivery to internal extensions
- Replies from extensions (for example `102 -> 555`) can be rendered in the browser UI

### Important Current Constraint
- The browser send workflow requires recipient E2EE device keys in the app database.
- In practical terms, the recipient user must have opened/unlocked the phone messages UI at least once to register a device key.
- If recipient keys are missing, send fails with a destination key error.

This means: for "brand new users", both sides should initialize messaging in the phone UI before expecting browser-originated sends to work.

## 2. Fresh Debian 12 Install (FusionPBX)

Run as `root`:

```bash
wget -O - https://raw.githubusercontent.com/fusionpbx/fusionpbx-install.sh/master/debian/pre-install.sh | sh
cd /usr/src/fusionpbx-install.sh/debian && ./install.sh
```

After installation, confirm:
- FusionPBX web UI loads at `https://<your-domain>/`
- FreeSWITCH is running

```bash
systemctl is-active freeswitch
```

Expected: `active`

## 3. Install/Update This Phone App Code

If you are installing from a separate app repository, place app files at:
- `/var/www/fusionpbx/app/phone`

Then ensure ownership:

```bash
chown -R www-data:www-data /var/www/fusionpbx/app/phone
```

If you are using FusionPBX source directly, update to your target branch/commit and keep the app in the same path.

## 4. Required FreeSWITCH Components

The app requires these modules/features to be active:
- `mod_sofia`
- `mod_event_socket`
- `mod_sms`

Check loaded modules:

```bash
fs_cli -x "show modules" | egrep "mod_sofia|mod_event_socket|mod_sms"
```

If `mod_sms` is missing:
1. Enable it in `/etc/freeswitch/autoload_configs/modules.conf.xml`
2. Add:

```xml
<load module="mod_sms"/>
```

3. Reload/restart FreeSWITCH:

```bash
fs_cli -x "reload mod_sms"
# if needed
systemctl restart freeswitch
```

## 5. Chatplan Section Requirement

`mod_sms` depends on chatplan support in `freeswitch.xml`.

Ensure `/etc/freeswitch/freeswitch.xml` includes:

```xml
<section name="chatplan" description="Regex/XML Chatplan">
  <X-PRE-PROCESS cmd="include" data="chatplan/*.xml"/>
</section>
```

Then make sure `chatplan/default.xml` exists (basic demo/default is fine for start).

Your log lines like `Chatplan: ... parsing [public->demo]` confirm this path is active.

## 6. WSS/SIP Profile Requirement for Browser Phone

The phone JS registers with:
- `wss://<domain>:7443`

Verify internal profile and bindings:

```bash
fs_cli -x "sofia status profile internal"
ss -ltnp | egrep ":7443|freeswitch"
```

Confirm certificate used by FreeSWITCH WSS is valid for your hostname.

## 7. FusionPBX User/Extension Setup

For each test user:
1. Create extension (for example `555`, `102`)
2. Assign extension to the user
3. Ensure user has access to app/phone (`phone_view` permission via groups)
4. Ensure extension SIP password/auth is valid

Minimum test pair:
- User A -> extension `555` (browser phone)
- User B -> extension `102` (desk phone or other endpoint)

## 8. First-Run Messaging Initialization (Required)

Do this once per user who will use browser-originated messaging:
1. Login as the user in FusionPBX web
2. Open Phone app
3. Open Messages panel
4. Complete encryption unlock/setup prompt

This registers the browser device key in DB (`v_phone_e2ee_devices`).

Without this step for recipient users, browser send can fail due to missing recipient keys.

## 9. Smoke Test Procedure

### Call Test
1. Login as `555` in browser phone app
2. Place audio call to `102`
3. Answer on `102`
4. Confirm two-way audio

### Message Send (Browser -> Extension)
1. In browser as `555`, open Messages
2. Set destination `102`
3. Send text
4. Confirm no API error in UI

### Reply Test (Extension -> Browser)
1. From extension `102`, send MESSAGE to `555`
2. Keep browser `555` page open
3. Confirm message appears in Messages thread and unread badge updates

## 10. Troubleshooting Checklist

### A) Browser does not receive replies
- Keep browser tab open and registered
- Open browser devtools console and check for JS errors
- Confirm inbound SIP MESSAGE reaches FreeSWITCH logs (`Processing text message 102->555`)
- If logs show inbound MESSAGE but UI stays empty, verify latest phone JS is deployed and browser cache is hard-refreshed

### B) Send fails with key/device error
- Recipient user has not initialized Messages/E2EE
- Have recipient login and complete first-run unlock/setup

### C) FreeSWITCH module errors
- Re-check `mod_sms`, `mod_sofia`, `mod_event_socket`
- Re-check chatplan section in `freeswitch.xml`

### D) WSS registration fails
- Confirm `7443` listening
- Confirm TLS cert SAN/CN matches hostname
- Confirm firewall allows `7443/tcp`

## 11. Useful Commands

```bash
# FreeSWITCH service
systemctl status freeswitch --no-pager -l

# Sofia profile
fs_cli -x "sofia status profile internal"

# Module list
fs_cli -x "show modules" | egrep "mod_sofia|mod_event_socket|mod_sms"

# Recent sms/chat log lines
tail -f /var/log/freeswitch/freeswitch.log | egrep "mod_sms|Chatplan|MESSAGE|SMS::SEND_MESSAGE"
```

## 12. Current Limitations (Known)

- Browser-originated send currently depends on recipient E2EE device registration in this app.
- This is app-level behavior, not a FreeSWITCH limitation.
- If you need hardphone-only recipients to receive browser sends without prior E2EE initialization, the send logic should be adjusted to allow a SIP-only fallback path.

## 13. Report-Back Template

When reporting issues after your Debian 12 test, include:
1. Exact step number from this README where it failed
2. Browser console error text
3. Relevant FreeSWITCH log lines (10-30 lines around failure)
4. Output of:
   - `fs_cli -x "show modules" | egrep "mod_sofia|mod_event_socket|mod_sms"`
   - `fs_cli -x "sofia status profile internal"`
   - `ss -ltnp | egrep ":7443|freeswitch"`

That will make iteration fast and precise.
