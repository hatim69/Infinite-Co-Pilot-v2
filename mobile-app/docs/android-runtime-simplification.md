# Android Runtime Simplification

## Dependency Audit

### Silent audio player

- Original purpose: keep an audio session active so Android would keep the JS
  runtime and Expo audio alive while Infinite Flight was foregrounded.
- Phase 3 decision: disabled on Android.
- Reason: Android runtime lifetime is now owned by the Notifee foreground
  service started by `FlightSession.connect()`.
- Remaining purpose: still required on iOS as part of the existing audio
  background implementation.

### Lock-screen media session

- Original purpose: mark the silent player active for lock-screen controls and
  sustained background audio playback.
- Phase 3 decision: disabled on Android for the silent player.
- Reason: it creates a redundant media-player notification when no real media is
  being presented to the user.
- Remaining purpose: retained outside Android for the existing iOS audio
  background behavior.

### Background audio refresh timers

- Original purpose: repeatedly refresh the silent media session and restart the
  silent anchor if Android interrupted it.
- Phase 3 decision: disabled on Android.
- Reason: they only serve the removed silent-player/media-session anchor on
  Android.
- Remaining purpose: retained for iOS.

### Expo audio mode

- Original purpose: configure audio playback, background playback capability,
  silent-mode behavior, and media mixing.
- Phase 3 decision: retained on Android and iOS.
- Reason: this is real audio behavior, not just runtime survival. Announcements,
  static callouts, Polly playback, music, chimes, and user-media mixing still
  depend on the audio engine being configured.

### Real audio players

- Original purpose: play announcements, callouts, chimes, PTU, safety briefings,
  and boarding music.
- Phase 3 decision: retained on Android and iOS.
- Reason: these are product features, not keep-alive mechanisms.

## Removed Android Keep-Alive Work

Android no longer creates or maintains the silent looping player for runtime
survival. Calls to the background-anchor helpers still configure audio mode, but
on Android they skip:

- `silent.m4a` player creation,
- silent looping playback,
- `setActiveForLockScreen` on the silent player,
- silent media-session metadata refresh,
- silent anchor resume guard,
- silent anchor keep-alive interval.

If a stale silent player exists during development hot reload, the Android path
releases it.

## Auto-Connect Slowdown Analysis

Phase 2 introduced Android foreground-service startup at the beginning of
`FlightSession.connect()`. The connect path did not await the service startup,
so TCP connection and polling were not intentionally blocked by Notifee.

The audit found one avoidable source of extra native work:

- `_startAndroidRuntime(ip)` requested/displayed the foreground-service
  notification.
- `_setConnectedIp(ip)` immediately attempted to update the same notification
  because monitoring was already marked active.

Phase 3 removed that duplicate notification update from the connect path. The
runtime now uses the connected IP in the initial notification, caches the Android
notification channel, requests notification permission only once per process,
and logs foreground-service startup duration:

```text
[AndroidRuntime] Foreground service start requested in <n>ms
```

Real latency still needs to be measured on device because notification
permission prompts, OEM notification handling, and foreground-service startup
cost are Android-runtime behavior.

## Device Validation Matrix

These scenarios require a real Android device or emulator with Infinite Flight.
They could not be executed in the repository-only environment.

| Scenario | Status | Expected Result |
| --- | --- | --- |
| Foreground | Pending device test | Connect starts only the monitoring foreground-service notification. |
| Background | Pending device test | Telemetry and announcements continue without a silent media notification. |
| Home button | Pending device test | Monitoring notification remains; session continues. |
| Lock screen | Pending device test | Telemetry continues; announcements/callouts play as Android permits. |
| Split-screen | Pending device test | UI remains attachable; foreground service owns runtime. |
| PiP | Pending device test | Runtime ownership is unchanged if the app enters PiP. |
| Repeated connect/disconnect | Pending device test | No duplicate foreground services, UDP sockets, TCP polling, or speech events. |
| Announcements | Pending device test | TTS/static callouts play without silent keep-alive. |
| Music | Pending device test | Boarding music plays; any Android sustained-playback limit must be recorded. |
| User media mixing | Pending device test | External media continues; app audio mixes as before. |
| Notification appearance | Pending device test | Only the monitoring foreground-service notification persists. |

## Known Android Caveat To Verify

Expo's Android background audio documentation notes that sustained background
audio playback may require lock-screen controls. This phase intentionally removes
lock-screen activation for the silent player because it was a keep-alive
mechanism, not user-facing media.

Short announcements and callouts should be covered by the foreground-service
runtime plus normal audio playback. Long boarding music is the scenario most
likely to expose any remaining Android audio-service dependency, so it should be
tested explicitly with the screen locked and Infinite Flight foregrounded.
