/**
 * useTelemetry.js
 *
 * React adapter for the FlightSession singleton. The flight lifecycle lives in
 * FlightSession; this hook only subscribes UI state and exposes bound commands.
 */

import { useEffect, useMemo, useState } from "react";
import flightSession from "../session/FlightSession";

export function useTelemetry(disableAutoConnect = false, isAutoActionsEnabled = false) {
  const [sessionState, setSessionState] = useState(() => flightSession.getState());

  useEffect(() => {
    flightSession.start({ disableAutoConnect });
    const unsubscribe = flightSession.subscribe(setSessionState);

    return () => {
      unsubscribe();
      flightSession.stop();
    };
  }, []);

  useEffect(() => {
    flightSession.setAutoConnectDisabled(disableAutoConnect);
  }, [disableAutoConnect]);

  useEffect(() => {
    flightSession.setAutoActionsEnabled(isAutoActionsEnabled);
  }, [isAutoActionsEnabled]);

  return useMemo(
    () => ({
      connectionStatus: sessionState.connectionStatus,
      connectedIp: sessionState.connectedIp,
      telemetry: sessionState.telemetry,
      manualConnect: (ip) => flightSession.manualConnect(ip),
      discoveredDevices: sessionState.discoveredDevices,
      selectDevice: (deviceId) => flightSession.selectDevice(deviceId),
      disconnectDevice: (isMainMenuExit) => flightSession.disconnect(isMainMenuExit),
      resetForConnectingFlight: () => flightSession.resetForConnectingFlight(),
      handleAppStateChange: (state) => flightSession.handleAppStateChange(state),
      subscribeSessionEvents: (listener) => flightSession.subscribeEvents(listener),
      whenAudioReady: () => flightSession.whenAudioReady(),
      setSpeechLogger: (loggerFn) => flightSession.setSpeechLogger(loggerFn),
      getVoicePreference: () => flightSession.getVoicePreference(),
      toggleVoice: () => flightSession.toggleVoice(),
      setVoicePreference: (preference) => flightSession.setVoicePreference(preference),
    }),
    [sessionState]
  );
}
