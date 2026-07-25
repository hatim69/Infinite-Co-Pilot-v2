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
