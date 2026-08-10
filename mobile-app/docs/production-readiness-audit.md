# Production Readiness Audit: Audio and Long-Duration Runtime

## Scope

This audit covers the current JavaScript, Expo audio, IF Connect, and Android
foreground-service runtime paths. It focuses on reliability for 8-18 hour
monitoring sessions.

## Confirmed Findings From Static Analysis

### Audio subsystem

- `speechManager` is the single audio coordinator for Expo Speech, static
  callouts, Polly playback, chimes, PTU, boarding announcements, and boarding
  music.
- Queue items have bounded completion paths:
  - Expo Speech uses a word-count timeout capped at 45 seconds.
  - Static audio and callouts use start timers plus max playback timers.
  - Polly network requests abort after 3 seconds and Polly playback has a
    60-second safety timer.
  - Boarding announcements have start and max playback timers.
- Direct `createAudioPlayer` usage is now paired with player disposal through
  `_disposePlayer()`, which also clears lock-screen/media-session state before
  releasing the player.
- Android no longer creates the silent looping player, silent background refresh
  timers, or silent lock-screen media session. iOS still keeps the existing
  audio-background anchor.
- Boarding music is intentionally long-lived while active. It is stopped through
  `stopBoardingMusic()` when the flight logic determines that music should end.

### Runtime subsystem

- Android monitoring starts a Notifee foreground service only from
  `FlightSession.connect()`.
- The foreground service holds one `FlightSession.start()` retain while
  monitoring is active.
- React attaches through `useTelemetry`; it does not own polling or telemetry.
- The IF Connect poll loop is still JavaScript-owned. Polling depends on
  `react-native-tcp-socket`, socket callbacks, `setTimeout`, and `setInterval`.
- The previous IF Connect watchdog treated 15 seconds without data as terminal
  and emitted `disconnect`, which caused `FlightSession` to stop the Android
  runtime and audio. That is not self-healing for long flights.

## Implemented Self-Healing Change

### IF Connect stale-data recovery

Failure mode addressed:

- A transient local-network stall, socket stall, JS timer delay, or simulator
  pause longer than 15 seconds could end monitoring completely because the
  watchdog emitted `disconnect`.

Change:

- The 15-second stale-data watchdog now forces an immediate poll-socket rebuild
  instead of ending the session.
- The reconnect path logs the recovery reason and attempt number.
- The manifest remains cached during poll-socket rebuilds, preserving the
  existing protocol model.

Why this is recovery, not only detection:

- The session stays alive and actively rebuilds the TCP poll socket rather than
  requiring the user to reopen the app or reconnect manually.

## Highly Likely Causes

- If testers still see termination after 10-15 minutes, the most likely codepath
  was the old 15-second watchdog hard-disconnect after telemetry became stale.
  That path is confirmed in the previous code and has been replaced.
- A foreground-service notification by itself does not prove telemetry is still
  flowing. The app still relies on the React Native JS runtime to execute the
  polling loop.
- If a media-player notification persists after a short announcement, the likely
  cause is Expo Audio media-session state outliving an individual player. Player
  disposal now explicitly clears lock-screen controls before release.

## Android Media Notification / Transport Controls (Investigated)

Confirmed by static audit plus the Expo SDK 57 `expo-audio` reference:

- `setActiveForLockScreen` is the only API in this codebase that activates an
  interactive lock-screen/notification media session with transport controls.
  It is called in exactly one place (`speech.js`, inside
  `_activateBackgroundMediaSession`), and only on `this.silentPlayer` — the
  keep-alive player that Phase 3 of the Android runtime migration already
  disabled on Android (`usesBackgroundAudioAnchor()` returns `false` on
  Android, and the silent player is never created there). No announcement,
  callout, boarding-music, or safety-briefing player calls it. The app's own
  code is not what's activating the interactive media session.
- The visible Play/Pause/Next/Previous controls instead come from
  `expo-audio`'s own Android background-playback implementation, which the
  `enableBackgroundPlayback: true` plugin option in `app.json` enables. Per
  Expo's SDK 57 docs, this unconditionally registers a media-style foreground
  service (`AudioControlsService`) and its notification; there is no plugin
  option or `setActiveForLockScreen` parameter that suppresses the transport
  buttons while keeping playback capability. `AudioLockScreenOptions` only
  toggles the seek-forward/seek-backward buttons — Play/Pause cannot be
  hidden independently, and no config exists to hide the notification itself.
- Expo's docs also state that Android background audio "will stop after
  approximately 3 minutes" unless `setActiveForLockScreen(true)` is active —
  described as an OS limitation, not an app-level timeout.
- This app already runs a *second*, independent foreground service (Notifee,
  started by `FlightSession.connect()`) declaring both
  `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` and
  `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`. The `mediaPlayback` type on that
  service only makes sense if it was already intended to cover audio, which
  suggests `enableBackgroundPlayback`'s own redundant service (and its
  uncontrollable notification) may not be necessary here — but this could not
  be confirmed without a physical device, and disabling it risks silencing
  all announcements in the background if the hypothesis is wrong. Given the
  explicit priority on never breaking background audio, this was **not**
  changed; it is recorded here as the primary candidate fix for a follow-up
  device-validated pass.
  - **Experiment to run on-device**: set `enableBackgroundPlayback: false` in
    `app.json`, rebuild, and specifically verify a callout still plays audibly
    after 5+ minutes backgrounded with Infinite Flight foregrounded and the
    Notifee monitoring notification visible. If audio keeps working and the
    transport-control notification disappears, keep the change. If audio
    stops, revert this one line — nothing else depends on it.

## Requires Runtime / Device Validation

- Whether Notifee's foreground-service JavaScript task remains active for a full
  8-18 hour session on target devices.
- Whether OEM battery optimization or Doze throttles local-network TCP/UDP while
  the notification remains visible.
- Whether Android continues short announcements in the background without
  lock-screen media controls.
- Whether long boarding music should use lock-screen controls only while music is
  actively playing. Expo documents that sustained Android background audio can
  require lock-screen controls, but enabling them creates a media notification.
- Whether notification permission denial changes foreground-service behavior on
  each supported Android version.

## Remaining Production Blockers

- Long-duration device validation is still required. Static analysis cannot prove
  Android/OEM behavior over 8-18 hours.
- The runtime is service-hosted at the JavaScript level, not native-owned at the
  socket/polling level. A true native foreground-service worker would be the next
  step if device validation shows JS execution is still suspended.
- Battery optimization instructions and expected limitations need to be
  documented per device/OEM after real test runs.
