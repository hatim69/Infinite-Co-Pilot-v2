# Architecture

## FlightSession

`FlightSession` is the single owner of the active Infinite Flight session. It
owns discovery, connection lifecycle, telemetry polling callbacks, event
detection, announcement triggering, reconnect handling, session state,
disconnect cleanup, and runtime audio/background coordination.

The Phase 1 architecture intentionally preserves the existing subsystems:

- `ifConnectClient` still owns the TCP protocol and polling loop.
- `speechManager` still owns audio, speech queues, silent audio, and music.
- Android foreground-service runtime owns active Android monitoring lifetime.
- `App.js` still owns general app shell, beta gate, and UI presentation.
- iOS audio-background behavior is unchanged.

## React Boundary

React no longer owns the flight lifecycle. UI code consumes `FlightSession`
through `useTelemetry`, which is now a small adapter around the session
singleton.

The hook is responsible only for:

- starting and stopping the singleton with the current UI options,
- subscribing to state snapshots,
- exposing bound command functions to existing components,
- forwarding app lifecycle notifications into `FlightSession`,
- subscribing to session events that React may present in the UI.

React components may display telemetry and expose controls, but they do not own
connection lifecycle, telemetry polling, reconnect behavior, telemetry-derived
flight events, announcement triggers, or disconnect cleanup.

Session events keep UI presentation out of the session core. For example,
`FlightSession` emits an alert event when a manual connection reaches the
simulator main menu; React decides how to present that event.

`FlightSession.start()` and `FlightSession.stop()` are guarded so repeated UI
mounts do not create duplicate sockets or listeners, and one unmount cannot
tear down the singleton while another subscriber is still active.

## Lifecycle

The current runtime lifecycle is:

1. `useTelemetry` starts `FlightSession`.
2. `FlightSession` listens for Infinite Flight UDP discovery packets.
3. Auto-connect or manual connect calls `FlightSession.connect()`.
4. On Android, `FlightSession.connect()` starts the foreground-service runtime.
5. The Android runtime acquires its own `FlightSession.start()` hold while
   monitoring is active, so React can detach without owning session lifetime.
6. `FlightSession` delegates TCP work to `ifConnectClient`.
7. Telemetry packets update `FlightSession` state and trigger existing
   announcement logic.
8. Telemetry-derived flight events, including Airbus PTU playback, are handled
   inside `FlightSession`.
9. App lifecycle changes are forwarded to `FlightSession`, which coordinates the
   existing audio/runtime behavior with `speechManager`.
10. React receives state snapshots through `FlightSession.subscribe()`.
11. Explicit disconnect calls `FlightSession.disconnect()`, which performs the
   full flight-session shutdown and stops the Android foreground-service runtime.
12. Hook unmount calls `FlightSession.stop()`. During Android monitoring, the
   runtime hold keeps the session alive until monitoring ends.

## Dependency Direction

The active ownership flow is:

```text
React UI
  -> useTelemetry
    -> FlightSession
      -> Android foreground-service runtime
      -> ifConnectClient
      -> speechManager
```

`speechManager` remains the audio subsystem, but flight decisions and flight
cleanup route through `FlightSession`.

## Android Runtime

The Android foreground service is registered early from `index.js`, but it does
not start on app launch. It starts only when `FlightSession.connect()` begins an
active monitoring session.

While the service is active, it owns an additional `FlightSession.start()` hold.
This gives Android exactly one runtime owner and the app exactly one flight
owner:

```text
Android Foreground Service
  -> FlightSession
    -> existing subsystems
```

The service notification is persistent and reflects active monitoring. When the
session ends through disconnect, simulator main-menu exit, or IF Connect
disconnect/error handling, `FlightSession` stops the service and releases the
runtime hold.

The previous launch-time Notifee foreground service was removed. On Android, the
silent audio keep-alive and lock-screen media-session anchor are also disabled:
runtime lifetime belongs to the foreground service notification only.

The audio engine still configures Expo audio mode and uses real audio players
for announcements, callouts, safety briefings, GPWS effects, and boarding music.
iOS keeps the existing audio-background anchor because iOS background execution
still depends on the audio capability.

## Future Intent

This refactor creates the ownership boundary for later Android work. A future
foreground service should coordinate with `FlightSession` instead of reaching
through React components, hooks, `ifConnectClient`, or `speechManager` directly.

The Android runtime migration does not change telemetry protocol, polling,
reconnect, announcement scheduling, speech internals, or IF Connect internals.
