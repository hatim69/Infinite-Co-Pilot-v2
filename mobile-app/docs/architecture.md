# Architecture

## FlightSession

`FlightSession` is the single owner of the active Infinite Flight session. It
owns discovery, connection lifecycle, telemetry polling callbacks, event
detection, announcement triggering, reconnect handling, session state,
disconnect cleanup, and runtime audio/background coordination.

The Phase 1 architecture intentionally preserves the existing subsystems:

- `ifConnectClient` still owns the TCP protocol and polling loop.
- `speechManager` still owns audio, speech queues, silent audio, and music.
- `App.js` still owns the existing Notifee and platform setup.
- Android and iOS background behavior is unchanged.

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
4. `FlightSession` delegates TCP work to `ifConnectClient`.
5. Telemetry packets update `FlightSession` state and trigger existing
   announcement logic.
6. Telemetry-derived flight events, including Airbus PTU playback, are handled
   inside `FlightSession`.
7. App lifecycle changes are forwarded to `FlightSession`, which coordinates the
   existing audio/runtime behavior with `speechManager`.
8. React receives state snapshots through `FlightSession.subscribe()`.
9. Explicit disconnect calls `FlightSession.disconnect()`, which performs the
   full flight-session shutdown.
10. Hook unmount calls `FlightSession.stop()`.

## Dependency Direction

The active ownership flow is:

```text
React UI
  -> useTelemetry
    -> FlightSession
      -> ifConnectClient
      -> speechManager
```

`speechManager` remains the audio subsystem, but flight decisions and flight
cleanup route through `FlightSession`.

## Future Intent

This refactor creates the ownership boundary for later Android work. A future
foreground service should coordinate with `FlightSession` instead of reaching
through React components, hooks, `ifConnectClient`, or `speechManager` directly.

Phase 1 does not change networking, audio internals, notifications, native
services, or background execution behavior.
