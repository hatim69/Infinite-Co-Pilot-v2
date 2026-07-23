# Android Runtime Validation

## Code Validation

These checks were run after the Phase 2 runtime migration:

```bash
node --check App.js
node --check index.js
node --check src/runtime/androidFlightRuntime.js
node --check src/session/FlightSession.js
node --check src/hooks/useTelemetry.js
npx expo config --type public
```

All checks passed.

## Architecture Validation

Confirmed by static audit:

- The Notifee foreground service is registered early from `index.js`.
- The foreground service is no longer displayed on app launch.
- `FlightSession.connect()` starts the Android runtime when monitoring begins.
- The Android runtime acquires one `FlightSession.start()` hold while monitoring
  is active.
- `FlightSession.disconnect()` and existing IF Connect disconnect/error paths
  stop the Android runtime.
- React remains an attachable UI and does not own foreground-service lifetime.
- The existing task-removal kill behavior is unchanged.
- iOS audio-background behavior is unchanged.

## Background Mechanism Review

- Notifee foreground service: retained, but moved from app launch to active
  monitoring only.
- Silent/background audio anchor: retained. It still owns Expo audio session
  behavior, speech/music continuity, and iOS background audio. It was not safely
  replaceable by the Android foreground service without changing audio behavior.
- `TaskRemovedKillService`: retained to preserve the existing product behavior
  where task removal intentionally terminates monitoring.
- App-launch foreground notification: removed. It was redundant once active
  monitoring owns the runtime.

## Required Device Scenarios

These scenarios require a physical Android device or emulator with Infinite
Flight available. They were not executable in this repository-only environment.

| Scenario | Status | Expected Result |
| --- | --- | --- |
| Foreground | Pending device test | Connect starts foreground-service notification and telemetry continues. |
| Home button | Pending device test | Notification remains; telemetry/audio continue. |
| Background | Pending device test | Session remains active without reopening the UI. |
| Split-screen | Pending device test | UI remains attachable; telemetry/audio continue. |
| PiP | Pending device test | If Android permits the app mode, runtime ownership remains unchanged. |
| Screen off / lock screen | Pending device test | Notification remains; telemetry/audio continue as Android permits. |
| Long-duration monitoring | Pending device test | No duplicate polling/listeners; session remains active for multi-hour flight. |
| Repeated connect/disconnect | Pending device test | One service, one session hold, no duplicate UDP/TCP polling or speech events. |
| Notification permission denied | Pending device test | Start attempt is handled without crashing; Android may hide notification UI depending on OS policy. |
| Battery optimization | Pending device test | Document OEM/device-specific restrictions if the service is throttled. |
| Doze | Pending device test | Foreground service should improve survivability, but Android/OEM limits must be documented if observed. |

## Manual Test Checklist

For each device run, record:

- device model,
- Android version,
- battery optimization setting,
- notification permission state,
- whether the foreground notification appears,
- whether telemetry continues,
- whether announcements/callouts play,
- whether reconnect behavior matches the previous implementation,
- whether disconnect removes the notification and stops monitoring,
- whether swiping/force-closing preserves the existing intentional process-kill behavior.
