/**
 * FlightSession.js
 *
 * Owns the full Infinite Flight telemetry session:
 *  - UDP auto-discovery of devices on port 15000
 *  - Direct TCP connection to IF via ifConnectClient (port 10112)
 *  - Live state decoding and announcement logic
 *
 * Connection is made directly to IF — no proxy backend required.
 * The device and the app must be on the same local WiFi network.
 */

import { AppState } from "react-native";
import dgram from "react-native-udp";
import ifConnect from "../utils/ifConnectClient";
import androidFlightRuntime from "../runtime/androidFlightRuntime";
import { announcementCoordinator } from "./AnnouncementCoordinator";
import { runtimeTrace } from "../utils/runtimeTrace";
import { calculatePerformance, getFlapString } from "../utils/calculatePerformance";
import { formatTime } from "../utils/flightMath";
import {
  createPhaseTracker,
  deriveFlightPhase,
  normalizeDestinationDistanceNm,
  normalizePercent,
} from "../utils/flightPhase";

import airportNames from "../utils/airports.json";

const ALTITUDE_CALLOUT_BUFFER_FT = 100;
const AIRSPEED_CALLOUT_BUFFER_KTS = 3;

const crossedThreshold = (previousValue, currentValue, thresholdValue) => {
  return {
    ascending: previousValue < thresholdValue && currentValue >= thresholdValue,
    descending: previousValue > thresholdValue && currentValue <= thresholdValue,
  };
};

const TAKEOFF_ROLL_PHASES = new Set(["takeoff"]);
const TAKEOFF_SEQUENCE_PHASES = new Set(["takeoff", "initial_climb"]);
const CLIMB_ANNOUNCEMENT_PHASES = new Set(["initial_climb", "climb"]);
const DESCENT_ANNOUNCEMENT_PHASES = new Set(["descent", "approach", "final_approach"]);
const ARRIVAL_GROUND_PHASES = new Set(["landing", "taxi_in", "deboarding"]);
const PRE_TAKEOFF_PHASES = new Set(["taxi_out", "takeoff"]);
const GEAR_UP_PHASES = new Set(["takeoff", "initial_climb", "climb"]);
const GEAR_DOWN_PHASES = new Set(["descent", "approach", "final_approach", "landing"]);
const BOARDING_ANNOUNCEMENT_PHASES = new Set(["preflight", "boarding"]);
const TURBULENCE_ANNOUNCEMENT_PHASES = new Set(["cruise"]);
const FLAP_CALLOUT_PHASES = new Set([
  "preflight",
  "boarding",
  "pushback",
  "taxi_out",
  "takeoff",
  "initial_climb",
  "climb",
  "cruise",
  "descent",
  "approach",
  "final_approach",
  "landing",
  "taxi_in",
  "deboarding",
]);

const isPhaseActive = (telemetry, phaseTracker, phases) =>
  phaseTracker.phaseReady &&
  phases.has(telemetry.phase) &&
  phases.has(phaseTracker.currentPhase);

const PHASE_SYNCING = "syncing";
const PHASE_SYNC_MIN_MS = 2500;
const VERIFY_TIMEOUT_MS = 5000;
const CLIMB_CALLOUT_MIN_VS_FPM = 150;
const DESCENT_CALLOUT_MAX_VS_FPM = -150;
const POSITIVE_RATE_MIN_AGL_FT = 50;
const POSITIVE_RATE_MAX_AGL_FT = 1500;
const POSITIVE_RATE_MIN_VS_FPM = 150;
// Ceiling for a single LandingGear command to reach its target physical
// state before the pending flag is released without an auto-retry. Real
// gear transit is a few seconds; this is intentionally generous so it
// doesn't fire during a normal transit, while still recovering (rather than
// staying stuck refusing all future commands) if the command was lost —
// e.g. sent right as the connection dropped.
const GEAR_COMMAND_TIMEOUT_MS = 15000;
const PHASE_READY_COMMANDS = [
  "infiniteflight/app_state",
  "aircraft/0/is_on_ground",
  "aircraft/0/groundspeed",
  "aircraft/0/vertical_speed",
  "aircraft/0/airframe_flight_time",
  "aircraft/0/altitude_msl",
  "aircraft/0/altitude_agl",
  "aircraft/0/is_on_runway",
];

const createPhaseSyncState = () => ({
  connectedAt: 0,
  phaseReady: false,
  seenCommands: new Set(),
});

const arePhaseCommandsReady = (seenCommands) =>
  PHASE_READY_COMMANDS.every((command) => seenCommands.has(command));

const isActiveStateValue = (value) =>
  value === true ||
  value === 1 ||
  (typeof value === "number" && value > 0);

const normalizeConnectionIp = (ip) => {
  const value = String(ip || "").trim();
  if (value === "localhost") return "127.0.0.1";
  if (value.startsWith("::ffff:")) return value.slice(7);
  return value;
};

const isSameConnectionIp = (left, right) =>
  normalizeConnectionIp(left) !== "" &&
  normalizeConnectionIp(left) === normalizeConnectionIp(right);

const isClimbingForCallout = (telemetry) =>
  telemetry.onGround === false &&
  typeof telemetry.vs === "number" &&
  telemetry.vs > CLIMB_CALLOUT_MIN_VS_FPM;

const isDescendingForCallout = (telemetry) =>
  telemetry.onGround === false &&
  typeof telemetry.vs === "number" &&
  telemetry.vs < DESCENT_CALLOUT_MAX_VS_FPM;

// aircraft/0/systems/landing_gear/state (Int32) is the ACTUAL physical
// deployment state, distinct from the lever position. 1 = fully extended,
// {0, 2, 5} = fully retracted (observed values across aircraft in IF
// Connect), and this is the SAME classification the existing UI already
// used (App.js's "DOWN"/"UP"/"MOVING" system-status cell), reused here
// rather than re-deriving it. Any other value (including the transitional
// in-between values IF reports while the gear is actually moving) means the
// gear has not reached either end state yet.
const GEAR_STATE_UP_VALUES = new Set([0, 2, 5]);
const classifyGearState = (data) => {
  if (data === -1 || data === null || data === undefined) return "unknown";
  if (data === 1) return "down";
  if (GEAR_STATE_UP_VALUES.has(data)) return "up";
  return "transit";
};

const isAirbusA320Family = (name) => {
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    lower.includes("a318") ||
    lower.includes("a319") ||
    lower.includes("a320") ||
    lower.includes("a321")
  );
};

const POST_TURBULENCE_ANNOUNCEMENT =
  "Ladies and gentlemen, we've now returned to smooth air and the seat belt sign has been switched off. " +
  "You are free to move around the cabin if needed, though we recommend keeping your seat belt fastened whenever you're seated. " +
  "Thank you.";

/** All IF Connect API parameters to poll */
const POLL_COMMANDS = [
  "infiniteflight/app_state",
  "aircraft/0/indicated_airspeed",
  "aircraft/0/groundspeed",
  "aircraft/0/vertical_speed",
  "aircraft/0/airframe_flight_time",
  "aircraft/0/altitude_msl",
  "aircraft/0/altitude_agl",
  "aircraft/0/systems/landing_gear/state",
  "aircraft/0/systems/landing_gear/lever_state",
  // "aircraft/0/systems/apu/apu/amp_draw",
  "aircraft/0/systems/electrical_switch/master_switch/state",
  "aircraft/0/aircraft_id",
  "aircraft/0/is_on_ground",
  "aircraft/0/systems/flaps/state",
  "aircraft/0/systems/spoilers/state",
  "aircraft/0/systems/signs/seatbelt",
  "aircraft/0/systems/signs/no_smoking",
  "aircraft/0/systems/load/total_weight",
  "simulator/time_local",
  "simulator/time_utc",
  "simulator/time_zone",
  "simulator/real_time_utc",
  "environment/temperature",
  "infiniteflight/nearest_airport",
  "aircraft/0/systems/apu/apu/state",
  "aircraft/0/systems/autopilot/on",
  "aircraft/0/systems/autopilot/alt/on",
  "aircraft/0/systems/autopilot/alt/target",
  "aircraft/0/systems/autopilot/vnav/on",
  "aircraft/0/ground_services/belt_loader/state",
  "aircraft/0/ground_services/catering/state",
  "aircraft/0/ground_services/gpu/state",
  "aircraft/0/ground_services/pallet_loader/state",
  "aircraft/0/ground_services/stairs/state",
  "aircraft/0/ground_services/fuel_truck/state",
  "aircraft/0/ground_services/pushback/state",

  "aircraft/0/systems/beacon_lights_switch",
  "aircraft/0/systems/nav_lights_switch",
  "aircraft/0/systems/strobe_lights_switch",
  "aircraft/0/systems/landing_lights_switch",
  "aircraft/0/is_pushback_active",
  "aircraft/0/name",
  "aircraft/0/livery",
  "aircraft/0/systems/engines/0/state",
  "aircraft/0/systems/engines/1/state",
  "aircraft/0/systems/engines/2/state",
  "aircraft/0/systems/engines/3/state",
  "aircraft/0/systems/engines/are_all_engines_off",
  "aircraft/0/systems/engines/are_all_engines_on",
  "aircraft/0/systems/engines/0/n1",
  "aircraft/0/systems/engines/1/n1",
  "aircraft/0/systems/engines/2/n1",
  "aircraft/0/systems/engines/3/n1",
  "aircraft/0/systems/parking_brake/state",
  "aircraft/0/systems/engines/0/throttle_lever",
  "aircraft/0/is_on_runway",
  "aircraft/0/flightplan/destination_dist",
  "aircraft/0/location/destination_distance",
  "environment/turbulence_factor",
  "aircraft/0/configuration/doors/cargo_doors_open",
];

const INITIAL_TELEMETRY = {
  name: "",
  livery: "",
  weight: null,
  ias: null,
  gs: null,
  vs: null,
  airframeFlightTime: 0,
  msl: null,
  agl: null,
  throttle: 0,
  onGround: true,
  gear: -1,
  gearLever: null, // true = lever DOWN, false = lever UP, null = not yet known
  gearInTransit: false,
  flaps: -1,
  brakes: -1,
  spoilers: -1,
  autopilot: -1,
  autopilotAlt: -1,
  autopilotAltTarget: null,
  vnav: -1,
  battery: -1,
  batteryAmp: 0,
  batteryVolts: 0,
  apu: -1,
  pushback: 0,
  pushbackTug: false,
  isPushing: false,
  beltLoader: -1,
  catering: -1,
  gpu: -1,
  palletLoader: -1,
  stairs: -1,
  fuelTruck: -1,
  seatbelt: -1,
  smoking: -1,
  beacon: -1,
  strobe: -1,
  nav: -1,
  landing: -1,
  engines: {},
  engineN1: {},
  n1: null,
  allEnginesOff: null,
  allEnginesOn: null,
  time: "---",
  airport: "---",
  oat: null,
  onRunway: false,
  destDist: null,
  turbulence: 0,
  cargoDoorsOpen: 0,
  performance: null,
  appState: -1,
  phase: PHASE_SYNCING,
};

const INITIAL_SESSION_STATE = {
  connectionStatus: "AWAITING SIMULATOR LINK...",
  connectedIp: "",
  discoveredDevices: [],
  telemetry: { ...INITIAL_TELEMETRY },
};

const createAnnouncementFlags = () => ({
  eightyKnots: false,
  vSpeedBriefed: false,
  positiveRate: false,
  hasFlown: false,
  welcome: false,
  alt5k_armedForClimb: true,
  alt5k_armedForDescent: false,
  alt10k_armedForClimb: true,
  alt10k_armedForDescent: false,
  alt15k_armedForClimb: true,
  alt15k_armedForDescent: false,
  alt24k_armedForClimb: true,
  alt24k_armedForDescent: false,
  boardingAnnouncementPlayed: false,
  welcomeMessagePlayed: false,
  pendingAnnouncements: [],
  seatbeltHydrated: false,
  v1Announced: false,
  vrAnnounced: false,
  v2Announced: false,
  connectedAt: 0,
  isManualConnection: false,
  turbulenceAnnounced: false,
  suppressNextAutoSeatbeltOff: false,
});

class FlightSession {
  constructor() {
    this.state = { ...INITIAL_SESSION_STATE, telemetry: { ...INITIAL_TELEMETRY } };
    this.listeners = new Set();
    this.eventListeners = new Set();
    this.disableAutoConnect = false;
    this.isAutoActionsEnabled = false;
    this.started = false;
    this.startCount = 0;
    this.isConnected = false;
    this.discoveredDevices = [];
    this.autoConnectTimer = null;
    this.verifyTimer = null;
    this.verifyMode = "initial";
    this.androidRuntimeSessionRetained = false;
    this.androidRuntimeStartPromise = null;
    this.disconnectPromise = null;
    this.disconnectReason = "";
    this.appState = AppState.currentState || "active";
    this.phaseTracker = createPhaseTracker();
    this.phaseSync = createPhaseSyncState();
    this.boardingMusicPrefetchLivery = "";
    this.flags = createAnnouncementFlags();
    this._gearCommandPending = false;
    this._gearCommandTargetClass = null;
    this._gearCommandTimer = null;
    this.discoverySocket = null;
    this.ptuPreviousEngines = {};
    this.ptuPreviousGroundSpeed = 0;
    this.dataHandler = null;
    this.errorHandler = null;
    this.disconnectHandler = null;
    this.reconnectHandler = null;
    this.reconnectingHandler = null;
    this.telemetryPacketSeq = 0;
    this.telemetryUpdateSeq = 0;
    this.announcementSeq = 0;
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.unsubscribe(listener);
  }

  unsubscribe(listener) {
    this.listeners.delete(listener);
  }

  subscribeEvents(listener) {
    this.eventListeners.add(listener);
    return () => this.unsubscribeEvents(listener);
  }

  unsubscribeEvents(listener) {
    this.eventListeners.delete(listener);
  }

  setAutoConnectDisabled(disableAutoConnect) {
    this.disableAutoConnect = disableAutoConnect;
  }

  setAutoActionsEnabled(isAutoActionsEnabled) {
    this.isAutoActionsEnabled = isAutoActionsEnabled;
    console.log(`[AutoActions] isAutoActionsEnabled set to: ${isAutoActionsEnabled}`);
  }

  _notify() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (e) {
        console.warn("[FlightSession] Subscriber error:", e);
      }
    });
  }

  _emitEvent(event) {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.warn("[FlightSession] Event subscriber error:", e);
      }
    });
  }

  _isBackgroundSessionActive() {
    return (
      this.state.connectionStatus === "FLIGHT LINK ACTIVE" ||
      this.state.connectionStatus === "RECONNECTING..."
    );
  }

  _syncBackgroundSessionState() {
    announcementCoordinator.setBackgroundSessionState({
      active: this._isBackgroundSessionActive(),
      connectedIp: this.state.connectedIp,
    });
  }

  _setConnectionStatus(update) {
    const prev = this.state.connectionStatus;
    const connectionStatus = typeof update === "function" ? update(prev) : update;
    if (connectionStatus === prev) return;

    this.state = { ...this.state, connectionStatus };
    this._scheduleVerificationTimeout(connectionStatus, prev);
    this._syncBackgroundSessionState();
    this._notify();
  }

  _setConnectedIp(connectedIp) {
    if (connectedIp === this.state.connectedIp) return;
    this.state = { ...this.state, connectedIp };
    this._syncBackgroundSessionState();
    this._notify();
  }

  _setDiscoveredDevices(discoveredDevices) {
    this.state = { ...this.state, discoveredDevices };
    this._notify();
  }

  _setTelemetry(update) {
    const prev = this.state.telemetry;
    const telemetry = typeof update === "function" ? update(prev) : update;
    if (telemetry === prev) return;

    this.state = { ...this.state, telemetry };
    this.telemetryUpdateSeq += 1;
    runtimeTrace("flightSession.telemetry_committed", {
      source: "FlightSession._setTelemetry",
      owner: "FlightSession",
      telemetryUpdateSeq: this.telemetryUpdateSeq,
      telemetryPacketSeq: this.telemetryPacketSeq,
      phase: telemetry.phase,
      ias: telemetry.ias,
      msl: telemetry.msl,
      agl: telemetry.agl,
      onGround: telemetry.onGround,
      speech: announcementCoordinator.getDiagnostics?.(),
      ifConnect: ifConnect.getDiagnostics?.(),
    });
    this._notify();
    this._handleTelemetryEffects(prev, telemetry);
  }

  _handleTelemetryEffects(prev, next) {
    const ambientChanged =
      prev.strobe !== next.strobe ||
      prev.phase !== next.phase ||
      prev.livery !== next.livery ||
      prev.name !== next.name;
    if (ambientChanged) this._handleAmbientBoardingMusic();

    const sirenChanged =
      prev.engines !== next.engines ||
      prev.brakes !== next.brakes ||
      prev.throttle !== next.throttle;
    if (sirenChanged) this._handleSiren();

    const ptuChanged =
      prev.engines !== next.engines ||
      prev.cargoDoorsOpen !== next.cargoDoorsOpen ||
      prev.brakes !== next.brakes ||
      prev.gs !== next.gs ||
      prev.name !== next.name;
    if (ptuChanged) this._handlePtuBurst(next);
  }

  _scheduleVerificationTimeout(connectionStatus, previousStatus) {
    if (this.verifyTimer) {
      clearTimeout(this.verifyTimer);
      this.verifyTimer = null;
    }

    if (connectionStatus !== "VERIFYING STATE...") return;

    this.verifyTimer = setTimeout(() => {
      this.verifyTimer = null;
      if (!this.isConnected || this.state.connectionStatus !== "VERIFYING STATE...") return;

      if (this.verifyMode === "reconnect" || previousStatus === "RECONNECTING...") {
        runtimeTrace("flightSession.verify_timeout_recover", {
          source: "verification-timeout",
          owner: "FlightSession",
          verifyMode: this.verifyMode,
          previousStatus,
          connectedIp: this.state.connectedIp,
          ifConnect: ifConnect.getDiagnostics?.(),
        }, { throttleMs: 0 });
        if (ifConnect.recoverPollSocket?.("verify_timeout_reconnect")) {
          this._setConnectionStatus("RECONNECTING...");
          return;
        }
      }

      this.disconnect(true, "verify_timeout");
    }, VERIFY_TIMEOUT_MS);
  }

  _resetPhaseState(connectedAt = 0) {
    this.phaseTracker = createPhaseTracker();
    this.phaseSync = createPhaseSyncState();
    this.phaseSync.connectedAt = connectedAt;
    this.phaseTracker.phaseReady = false;
  }

  _resetAnnouncementState({ isManualConnection } = {}) {
    const flags = this.flags;
    const manualState = isManualConnection ?? flags.isManualConnection;
    Object.keys(flags).forEach((k) => {
      if (typeof flags[k] === "boolean") flags[k] = false;
      if (typeof flags[k] === "number") flags[k] = 0;
    });
    flags.pendingAnnouncements = [];
    flags.isManualConnection = manualState;
    announcementCoordinator.resetFlightState();
    return flags;
  }

  _resetPtuState() {
    this.ptuPreviousEngines = {};
    this.ptuPreviousGroundSpeed = 0;
  }

  _resetGearCommandState() {
    clearTimeout(this._gearCommandTimer);
    this._gearCommandTimer = null;
    this._gearCommandPending = false;
    this._gearCommandTargetClass = null;
  }

  /**
   * Called whenever a fresh, changed landing_gear/state classification
   * (down/up/transit) arrives. If a command is pending and the aircraft has
   * now genuinely reached the requested end state, this is the ONLY thing
   * that clears the pending flag on success — never the lever position
   * (lever_state), and never just "a command was sent".
   */
  _resolveGearCommand(nextClass) {
    if (!this._gearCommandPending) return;
    if (nextClass === this._gearCommandTargetClass) {
      console.log(`[GEAR] Command confirmed: reached ${nextClass.toUpperCase()}`);
      this._resetGearCommandState();
    }
  }

  /**
   * Requests the landing gear move to `desired` ("down" or "up") via the
   * commands/LandingGear toggle. commands/LandingGear flips gear state
   * rather than setting it directly, so this refuses to send unless it can
   * establish that a toggle will actually move the gear the intended
   * direction: current state must be a known, settled end state (not
   * "transit", not "unknown"), it must differ from `desired`, and no other
   * gear command may already be in flight. Returns { sent, reason }.
   */
  setLandingGear(desired) {
    if (desired !== "down" && desired !== "up") {
      return { sent: false, reason: "invalid_target" };
    }
    if (!this.isConnected) {
      console.log(`[GEAR] Ignoring ${desired} request — not connected.`);
      return { sent: false, reason: "not_connected" };
    }

    const currentClass = classifyGearState(this.state.telemetry.gear);

    if (this._gearCommandPending) {
      console.log(`[GEAR] Ignoring ${desired} request — a gear command is already in flight (target=${this._gearCommandTargetClass}).`);
      return { sent: false, reason: "command_in_flight" };
    }
    if (currentClass === "transit") {
      console.log(`[GEAR] Ignoring ${desired} request — gear is already in transit.`);
      return { sent: false, reason: "already_in_transit" };
    }
    if (currentClass === "unknown") {
      console.log(`[GEAR] Ignoring ${desired} request — current gear state is not yet known.`);
      return { sent: false, reason: "state_unknown" };
    }
    if (currentClass === desired) {
      console.log(`[GEAR] Ignoring ${desired} request — gear is already ${desired}.`);
      return { sent: false, reason: "already_at_target" };
    }

    this._gearCommandPending = true;
    this._gearCommandTargetClass = desired;
    console.log(`[GEAR] LandingGear command sent (${currentClass} -> ${desired})`);
    ifConnect.set("commands/LandingGear", true);

    clearTimeout(this._gearCommandTimer);
    this._gearCommandTimer = setTimeout(() => {
      if (!this._gearCommandPending) return;
      console.log(`[GEAR] No confirmed state change ${GEAR_COMMAND_TIMEOUT_MS}ms after command — clearing pending flag without retrying (state may be ambiguous).`);
      this._resetGearCommandState();
    }, GEAR_COMMAND_TIMEOUT_MS);

    return { sent: true };
  }

  /** Convenience wrapper: extend if currently up, retract if currently down. */
  toggleLandingGear() {
    const currentClass = classifyGearState(this.state.telemetry.gear);
    if (currentClass === "down") return this.setLandingGear("up");
    if (currentClass === "up") return this.setLandingGear("down");
    // "transit" or "unknown": setLandingGear rejects either direction with
    // the correct log/reason, so which placeholder direction we pass here
    // doesn't change the outcome.
    return this.setLandingGear("down");
  }

  _retainAndroidRuntimeSession() {
    if (this.androidRuntimeSessionRetained) return;
    this.androidRuntimeSessionRetained = true;
    runtimeTrace("flightSession.android_retain", {
      source: "Notifee.foregroundService",
      owner: "FlightSession",
      startCount: this.startCount,
    }, { throttleMs: 0 });
    this.start({ disableAutoConnect: this.disableAutoConnect });
  }

  _releaseAndroidRuntimeSession() {
    if (!this.androidRuntimeSessionRetained) return;
    this.androidRuntimeSessionRetained = false;
    runtimeTrace("flightSession.android_release", {
      source: "Notifee.foregroundService",
      owner: "FlightSession",
      startCount: this.startCount,
    }, { throttleMs: 0 });
    runtimeTrace("flightSession.runtime_released", {
      source: "Notifee.foregroundService",
      owner: "FlightSession",
      startCount: this.startCount,
      disconnectReason: this.disconnectReason,
    }, { throttleMs: 0 });
    this.stop();
  }

  _startAndroidRuntime(connectedIp) {
    if (this.androidRuntimeStartPromise) return this.androidRuntimeStartPromise;

    runtimeTrace("flightSession.android_start_request", {
      source: "FlightSession.connect",
      owner: "FlightSession",
      connectedIp,
    }, { throttleMs: 0 });
    this.androidRuntimeStartPromise = androidFlightRuntime.startMonitoring({
      connectedIp,
      onAcquireSession: () => this._retainAndroidRuntimeSession(),
      onReleaseSession: () => this._releaseAndroidRuntimeSession(),
      onError: (error) => {
        console.log("[FlightSession] Android runtime start failed:", error?.message || error);
      },
    }).finally(() => {
      this.androidRuntimeStartPromise = null;
    });

    return this.androidRuntimeStartPromise;
  }

  async _stopAndroidRuntime(reason = "unspecified") {
    runtimeTrace("flightSession.android_stop_request", {
      source: "FlightSession.disconnect/stop",
      owner: "FlightSession",
      reason,
    }, { throttleMs: 0 });
    try {
      await androidFlightRuntime.stopMonitoring();
      runtimeTrace("flightSession.foreground_service_stopped", {
        source: "FlightSession.disconnect/stop",
        owner: "FlightSession",
        reason,
      }, { throttleMs: 0 });
    } catch (error) {
      console.log("[FlightSession] Android runtime stop failed:", error?.message || error);
    }
  }

  handleAppStateChange(state) {
    const previousState = this.appState;
    this.appState = state;
    if (state !== previousState) {
      if (state === "background") {
        console.log("[BACKGROUND] App moved to background");
      } else if (previousState === "background") {
        console.log(`[BACKGROUND] App returned to foreground (${state})`);
      }
    }
    runtimeTrace("flightSession.app_state", {
      source: "React.AppState",
      owner: "FlightSession",
      state,
      telemetryPacketSeq: this.telemetryPacketSeq,
      telemetryUpdateSeq: this.telemetryUpdateSeq,
      speech: announcementCoordinator.getDiagnostics?.(),
      ifConnect: ifConnect.getDiagnostics?.(),
    }, { throttleMs: 0 });
    announcementCoordinator.handleAppStateChange(state);
  }

  whenAudioReady() {
    return announcementCoordinator.whenReady();
  }

  setSpeechLogger(loggerFn) {
    announcementCoordinator.setLogger(loggerFn);
  }

  getVoicePreference() {
    return announcementCoordinator.voicePreference;
  }

  toggleVoice() {
    return announcementCoordinator.toggleVoice();
  }

  setVoicePreference(preference) {
    return announcementCoordinator.setVoicePreference(preference);
  }

  start({ disableAutoConnect = false } = {}) {
    this.disableAutoConnect = disableAutoConnect;
    this.startCount += 1;
    if (this.started) return;
    this.started = true;

    runtimeTrace("flightSession.start", {
      source: "useTelemetry/androidRuntime",
      owner: "FlightSession",
      startCount: this.startCount,
      disableAutoConnect,
    }, { throttleMs: 0 });
    this.handleAppStateChange(AppState.currentState || "active");
    this._syncBackgroundSessionState();

    // ─── 1. UDP Auto-Discovery ──────────────────────────────────────────────
    try {
      this.discoverySocket = dgram.createSocket({ type: "udp4", reusePort: true });
      this.discoverySocket.bind(15000, "0.0.0.0");

      this.discoverySocket.on("message", (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          if (!data.addresses || data.addresses.length === 0) return;

          const devId = (data.deviceId || data.deviceName || "unknown-device").trim();
          const devName = (data.deviceName || data.deviceId || "Unknown Device").trim();
          const addrs = data.Addresses || data.addresses || [];

          // Prefer the actual source IP of the UDP packet. This perfectly handles cases where
          // IF is running on the same device over Mobile Network (rinfo.address = 127.0.0.1)
          // or VPNs where the reported IP in the payload is unroutable.
          let ip = rinfo && rinfo.address ? rinfo.address : "";

          if (!ip || ip === "0.0.0.0") {
            ip = addrs[0]?.trim() || "";
            const privateIPs = addrs.map(a => a.trim()).filter(a =>
              a.startsWith("192.168.") || a.startsWith("172.") || a.startsWith("10.")
            );

            if (privateIPs.length > 0) {
              ip = privateIPs.find(a => a.startsWith("192.168.")) ||
                   privateIPs.find(a => a.startsWith("172.")) ||
                   privateIPs.find(a => a.startsWith("10."));
            }
          }

          if (!ip) return;

          const exists = this.discoveredDevices.find((d) => d.deviceId === devId);
          if (!exists) {
            this.discoveredDevices.push({ deviceId: devId, deviceName: devName, ip });
            this._setDiscoveredDevices([...this.discoveredDevices]);
          }

          // Extract state. Be careful with falsy values like 0.
          const stateVal = data.State ?? data.state ?? data.AppState ?? data.appState;
          const stateStr = stateVal !== undefined ? String(stateVal) : undefined;
          const isReady = stateStr === "1" || stateStr === "Playing";
          const isMenu = stateStr === "0" || stateStr === "Menu";
          const isConnectedDevice = isSameConnectionIp(this.state.connectedIp, ip);

          // Auto-connect after 1.5s only if there's exactly 1 device discovered
          if (!this.isConnected && this.connect && isReady) {
            const shouldConnectImmediately =
              this.appState !== "active" &&
              this.discoveredDevices.length === 1 &&
              !this.disableAutoConnect;

            if (shouldConnectImmediately) {
              if (this.autoConnectTimer) {
                clearTimeout(this.autoConnectTimer);
                this.autoConnectTimer = null;
              }
              this.connect(this.discoveredDevices[0].ip, false);
            } else if (!this.autoConnectTimer && !this.disableAutoConnect) {
              this.autoConnectTimer = setTimeout(() => {
                if (this.discoveredDevices.length === 1 && !this.isConnected && this.connect && !this.disableAutoConnect) {
                  this.connect(this.discoveredDevices[0].ip, false);
                }
                this.autoConnectTimer = null;
              }, 1500);
            }
          } else if (this.isConnected && isMenu && isConnectedDevice) {
            // Simulator explicitly broadcasted that it's in the menu! Instant disconnect.
            runtimeTrace("flightSession.main_menu_detected", {
              source: "udp-discovery",
              owner: "FlightSession",
              state: stateStr,
              senderIp: ip,
              connectedIp: this.state.connectedIp,
            }, { throttleMs: 0 });
            if (this.disconnect) {
              runtimeTrace("flightSession.main_menu_immediate_disconnect", {
                source: "udp-discovery",
                owner: "FlightSession",
              }, { throttleMs: 0 });
              this.disconnect(true, "main_menu_udp");
            }
          }
        } catch (e) {
          // Silently ignore malformed UDP packets
        }
      });

      this.discoverySocket.on("error", (e) => {
        console.log("[Discovery] UDP socket error:", e);
      });
    } catch (e) {
      console.log("[Discovery] UDP socket creation/bind error (likely unsupported environment or hot-reload):", e);
    }

    // ─── 2. IF Connect client data handler ────────────────────────────────

    this.dataHandler = ({ command, data }) => {
      const flags = this.flags;
      const now = Date.now();
      const phaseSync = this.phaseSync;
      this.telemetryPacketSeq += 1;

      runtimeTrace("flightSession.telemetry_callback", {
        source: "ifConnect.data",
        owner: "FlightSession",
        command,
        telemetryPacketSeq: this.telemetryPacketSeq,
        telemetryUpdateSeq: this.telemetryUpdateSeq,
        pendingAnnouncements: flags.pendingAnnouncements.length,
        speech: announcementCoordinator.getDiagnostics?.(),
        ifConnect: ifConnect.getDiagnostics?.(),
      });

      if (PHASE_READY_COMMANDS.includes(command)) {
        phaseSync.seenCommands.add(command);
      }

      // Gate announcements — suppress first 2.5 seconds after connect
      const speak = (msg, options = {}) => {
        const opts = typeof options === 'string' ? { tone: options } : { tone: "callout", ...options };
        if (!opts.ignoreConnectGate && (!flags.connectedAt || now - flags.connectedAt < 2500)) return;
        if (!flags.welcomeMessagePlayed && !opts.allowBeforeWelcome) {
          flags.pendingAnnouncements.push({ msg, options: opts });
          runtimeTrace("flightSession.announcement_pending", {
            source: "flight-event-detection",
            owner: "FlightSession",
            announcementSeq: this.announcementSeq + 1,
            telemetryPacketSeq: this.telemetryPacketSeq,
            command,
            tone: opts.tone,
            pendingAnnouncements: flags.pendingAnnouncements.length,
            speech: announcementCoordinator.getDiagnostics?.(),
          }, { throttleMs: 0 });
          return;
        }
        this.announcementSeq += 1;
        runtimeTrace("flightSession.announcement_generated", {
          source: "flight-event-detection",
          owner: "FlightSession",
          announcementSeq: this.announcementSeq,
          telemetryPacketSeq: this.telemetryPacketSeq,
          command,
          tone: opts.tone,
          priority: Boolean(opts.priority),
          speech: announcementCoordinator.getDiagnostics?.(),
        }, { throttleMs: 0 });
        runtimeTrace("flightSession.announcement_submitted", {
          source: "flight-event-detection",
          owner: "FlightSession",
          announcementSeq: this.announcementSeq,
          telemetryPacketSeq: this.telemetryPacketSeq,
          command,
          tone: opts.tone,
          channel: opts.channel === "cabin" ? "cabin" : "cockpit",
        }, { throttleMs: 0 });
        announcementCoordinator.speak(msg, opts);
      };

      const flushPendingAnnouncements = () => {
        const pending = flags.pendingAnnouncements;
        flags.pendingAnnouncements = [];
        runtimeTrace("flightSession.pending_flush", {
          source: "welcome-message",
          owner: "FlightSession",
          flushedCount: pending.length,
          telemetryPacketSeq: this.telemetryPacketSeq,
          speech: announcementCoordinator.getDiagnostics?.(),
        }, { throttleMs: 0 });
        pending.forEach(({ msg, options }) => {
          runtimeTrace("flightSession.announcement_submitted", {
            source: "pending-flush",
            owner: "FlightSession",
            telemetryPacketSeq: this.telemetryPacketSeq,
            tone: options?.tone,
            channel: options?.channel === "cabin" ? "cabin" : "cockpit",
          }, { throttleMs: 0 });
          announcementCoordinator.speak(msg, options);
        });
      };

      this._setTelemetry((prev) => {
        const state = prev;
        const next = { ...prev };
        let updated = false;

        const updateNext = (key, val) => {
          if (next[key] !== val) {
            next[key] = val;
            updated = true;
          }
        };

        // ── Basic aircraft info ──────────────────────────────────────────
        if (command === "infiniteflight/app_state") {
          updateNext("appState", data);
          if (data !== "Playing" && data !== 1) {
            // Client is in main menu!
            runtimeTrace("flightSession.main_menu_detected", {
              source: "telemetry-app-state",
              owner: "FlightSession",
              state: data,
            }, { throttleMs: 0 });
            setTimeout(() => {
              if (this.disconnect) {
                runtimeTrace("flightSession.main_menu_immediate_disconnect", {
                  source: "telemetry-app-state",
                  owner: "FlightSession",
                }, { throttleMs: 0 });
                this.disconnect(true, "main_menu_telemetry"); // Pass true to indicate main menu exit
              }
            }, 0);
            return prev;
          } else if (data === "Playing" || data === 1) {
            this.verifyMode = "verified";
            this._setConnectionStatus(prevStatus => prevStatus !== "FLIGHT LINK ACTIVE" ? "FLIGHT LINK ACTIVE" : prevStatus);
          }
        }
        
        if (command === "aircraft/0/name") {
          updateNext("name", data);
          if (data && typeof data === "string" && data.trim() !== "") {
            this.verifyMode = "verified";
            this._setConnectionStatus(prevStatus => prevStatus !== "FLIGHT LINK ACTIVE" ? "FLIGHT LINK ACTIVE" : prevStatus);
          }
        }
        if (command === "aircraft/0/livery") updateNext("livery", data);
        if (command === "aircraft/0/systems/load/total_weight") updateNext("weight", data);
        if (command === "aircraft/0/is_on_ground") {
          updateNext("onGround", data);
          if (data === false) flags.hasFlown = true;
        }
        if (command === "aircraft/0/systems/engines/0/throttle_lever") updateNext("throttle", data);

        // ── Airspeed ─────────────────────────────────────────────────────
        if (command === "aircraft/0/indicated_airspeed") {
          const prevKts = state.ias;
          const kts = data * 1.94384;
          updateNext("ias", kts);

          if (prevKts !== null) {
            const inTakeoffRoll = state.onGround && isPhaseActive(state, this.phaseTracker, TAKEOFF_ROLL_PHASES);
            const crossing = crossedThreshold(prevKts, kts, 80 - AIRSPEED_CALLOUT_BUFFER_KTS);
            if (inTakeoffRoll && crossing.ascending && !flags.eightyKnots) {
              speak("80 knots", { tone: "callout", ignoreConnectGate: true });
              flags.eightyKnots = true;
            }

            if (inTakeoffRoll && state.performance) {
              if (kts >= (state.performance.v1 - AIRSPEED_CALLOUT_BUFFER_KTS) && !flags.v1Announced) {
                speak("V1", { tone: "callout", ignoreConnectGate: true });
                flags.v1Announced = true;
              }
              if (kts >= (state.performance.vr - AIRSPEED_CALLOUT_BUFFER_KTS) && !flags.vrAnnounced) {
                speak("Rotate", { tone: "callout", ignoreConnectGate: true });
                flags.vrAnnounced = true;
              }
              if (kts >= (state.performance.v2 - AIRSPEED_CALLOUT_BUFFER_KTS) && !flags.v2Announced) {
                speak("V2", { tone: "callout", ignoreConnectGate: true });
                flags.v2Announced = true;
              }
            }
          }
        }

        // ── Ground speed ─────────────────────────────────────────────────
        if (command === "aircraft/0/groundspeed") {
          const gs = data * 1.94384;
          updateNext("gs", gs);

          if (
            state.onGround &&
            gs < 30 &&
            !flags.welcome &&
            isPhaseActive(state, this.phaseTracker, ARRIVAL_GROUND_PHASES)
          ) {
            const cityName = airportNames[state.airport] || state.airport || "your destination";
            const liveryName = state.livery || "";
            const oatCelsius = state.oat !== null ? Math.round(state.oat) : null;
            const tempAdjective =
              oatCelsius === null
                ? null
                : oatCelsius < 15
                ? "chilly"
                : oatCelsius <= 28
                ? "beautiful"
                : "warm";
            const tempPhrase =
              oatCelsius !== null && tempAdjective
                ? ` It's a ${tempAdjective} ${oatCelsius}°C outside.`
                : "";
            const airlinePhrase = liveryName ? ` It was a pleasure having you on board this ${liveryName} flight today.` : "";
            const welcomeText =
              `Ladies and gentlemen, welcome to ${cityName}. We have safely landed, and the local time is currently ${state.time} with an outside temperature of${oatCelsius !== null ? ` ${oatCelsius}°C` : " --"}.${tempPhrase}${airlinePhrase} We hope you enjoyed the cruise, and we look forward to welcoming you on board again soon.`;
            // Route through Amazon Polly Neural TTS (Ruth for female, Matthew for male)
            // Automatically falls back to expo-speech if the backend is unreachable.
            const pollyVoice = announcementCoordinator.voicePreference === "male" ? "Matthew" : "Ruth";
            announcementCoordinator.speakWithPollyFallback(welcomeText, pollyVoice, {
              tone: "briefing",
              channel: "cabin",
              afterSpeech: () => {
                announcementCoordinator.onArrivalWelcomeEnded();
              }
            });
            flags.welcome = true;
          }
        }

        // ── Vertical speed ───────────────────────────────────────────────
        if (command === "aircraft/0/vertical_speed") {
          updateNext("vs", data * 196.85);
        }

        if (command === "aircraft/0/airframe_flight_time") {
          updateNext("airframeFlightTime", typeof data === "number" ? data : 0);
        }

        // ── Altitude MSL ─────────────────────────────────────────────────
        if (command === "aircraft/0/altitude_msl") {
          const prevMsl = state.msl;
          updateNext("msl", data);

          if (prevMsl !== null) {
            const currentAlt = data;

            const inClimbAnnouncementPhase = isPhaseActive(state, this.phaseTracker, CLIMB_ANNOUNCEMENT_PHASES);
            const inDescentAnnouncementPhase = isPhaseActive(state, this.phaseTracker, DESCENT_ANNOUNCEMENT_PHASES);
            const allowClimbAltitudeCallout =
              inClimbAnnouncementPhase || (this.phaseTracker.phaseReady && isClimbingForCallout(state));
            const allowDescentAltitudeCallout =
              inDescentAnnouncementPhase || (this.phaseTracker.phaseReady && isDescendingForCallout(state));

            const HYSTERESIS = 300;

            // Threshold-crossing detector with hysteresis + immediate cross-arming.
            //
            // `crossedThreshold` only fires when prevMsl/currentAlt straddle the exact
            // `alt` line, so a single climb or descent produces exactly one event per
            // direction — noise that never reaches the line can never fire at all.
            //
            // The `_armedForClimb`/`_armedForDescent` flags exist on top of that to stop
            // a *direction* from firing again until the aircraft has genuinely been on
            // the other side. Previously each flag was only re-armed by traveling
            // `HYSTERESIS` (300ft) past the line on its own side, which meant a climb
            // that reversed into a fresh descent (or vice versa — a go-around, step
            // climb/descent, holding pattern, missed approach) without first traveling
            // 300ft past the *original* line silently failed to re-fire: the flag for
            // the new direction was never set back to true. That reproduced exactly as
            // reported — descent-through-10,000 (ON) kept working because cruise spends
            // a long time above the band re-arming it, while climb-through-10,000 (OFF)
            // stayed unreliable after any reversal because nothing re-armed it.
            //
            // Fix: the moment a crossing fires, immediately re-arm the *opposite*
            // direction (we know for a fact which side we're now on). Firing still
            // requires an actual crossedThreshold() straddle, so this cannot by itself
            // cause chatter from telemetry that hovers without ever reaching `alt`.
            const checkAltitudeCallout = (alt, flagPrefix, climbText, descentText, options, onClimb, onDescent) => {
              const armedForClimbKey = `${flagPrefix}_armedForClimb`;
              const armedForDescentKey = `${flagPrefix}_armedForDescent`;

              // Hysteresis arming — bootstraps readiness before the first crossing,
              // and re-arms after a sustained excursion even if the immediate
              // cross-arm below was somehow missed (e.g. a dropped announcement).
              if (currentAlt > alt + HYSTERESIS) {
                flags[armedForDescentKey] = true;
              } else if (currentAlt < alt - HYSTERESIS) {
                flags[armedForClimbKey] = true;
              }

              const crossing = crossedThreshold(prevMsl, currentAlt, alt);
              if (allowClimbAltitudeCallout && crossing.ascending && flags[armedForClimbKey]) {
                speak(climbText, options.climb || "notice");
                flags[armedForClimbKey] = false;
                flags[armedForDescentKey] = true;
                if (onClimb) onClimb();
              }
              if (allowDescentAltitudeCallout && crossing.descending && flags[armedForDescentKey]) {
                speak(descentText, options.descent || "notice");
                flags[armedForDescentKey] = false;
                flags[armedForClimbKey] = true;
                if (onDescent) onDescent();
              }
            };

            checkAltitudeCallout(5000, 'alt5k', "Passing five thousand.", "Passing five thousand.", {}, () => {
              if (this.isAutoActionsEnabled && state.spoilers === 2) {
                /*
                // Temporarily disabled until official solution is available
                console.log(`[AutoActions] Passing 5k climb. Spoilers ARMED (${state.spoilers}). Sending spoilers/state=0 (retract).`);
                ifConnect.set("aircraft/0/systems/spoilers/state", 0);
                */
              }
            });
            checkAltitudeCallout(10000, 'alt10k', "Ten thousand. Landing lights off.", "Ten thousand. Landing lights on.", { climb: { tone: "caution", priority: true }, descent: { tone: "notice", priority: true } }, () => {
              console.log(`[LIGHTS] Previous altitude: ${Math.round(prevMsl)} ft`);
              console.log(`[LIGHTS] Current altitude: ${Math.round(currentAlt)} ft`);
              console.log("[LIGHTS] Climbing through 10,000 ft");
              if (this.isAutoActionsEnabled && state.landing !== false) {
                console.log(`[LIGHTS] Landing lights OFF (was ${state.landing}). Sending landing_lights_switch=false.`);
                ifConnect.set("aircraft/0/systems/landing_lights_switch", false);
              }
            }, () => {
              console.log(`[LIGHTS] Previous altitude: ${Math.round(prevMsl)} ft`);
              console.log(`[LIGHTS] Current altitude: ${Math.round(currentAlt)} ft`);
              console.log("[LIGHTS] Descending through 10,000 ft");
              if (this.isAutoActionsEnabled && state.landing !== true) {
                console.log(`[LIGHTS] Landing lights ON (was ${state.landing}). Sending landing_lights_switch=true.`);
                ifConnect.set("aircraft/0/systems/landing_lights_switch", true);
              }
            });
            checkAltitudeCallout(15000, 'alt15k', "Passing one-five thousand.", "Passing one-five thousand.", {});
            checkAltitudeCallout(24000, 'alt24k', "Passing Flight Level two-four-zero.", "Descending Flight Level two-four-zero.", {});
          }
        }

        // ── Altitude AGL (positive rate) ─────────────────────────────────
        if (command === "aircraft/0/altitude_agl") {
          const prevAgl = state.agl;
          const agl = data;
          updateNext("agl", agl);

          if (prevAgl !== null) {
            if (
              !state.onGround &&
              state.vs > POSITIVE_RATE_MIN_VS_FPM &&
              agl >= POSITIVE_RATE_MIN_AGL_FT &&
              agl <= POSITIVE_RATE_MAX_AGL_FT &&
              isPhaseActive(state, this.phaseTracker, TAKEOFF_SEQUENCE_PHASES) &&
              !flags.positiveRate
            ) {
              speak("Positive rate. Gear up.", { tone: "callout", ignoreConnectGate: true });
              flags.positiveRate = true;
              if (this.isAutoActionsEnabled) {
                /*
                // Temporarily disabled until official solution is available
                const isUp = state.gear === 2 || state.gear === 5;
                console.log(`[AutoActions] Positive rate. Gear isUp=${isUp} (state.gear=${state.gear}). Sending gear_button/on=true`);
                if (!isUp) {
                  ifConnect.set("simulator/ui_helpers/gear_button/on", true);
                }
                */
              } else {
                console.log(`[AutoActions] Positive rate. Automation disabled.`);
              }
            }
          }
        }

        // ── Time & Airport ───────────────────────────────────────────────
        if (command === "simulator/time_local") updateNext("time", formatTime(data));
        if (command === "infiniteflight/nearest_airport") updateNext("airport", data);

        // ── Outside Air Temperature (Celsius) ───────────────────
        if (command === "environment/temperature") {
          const celsius = typeof data === "number" ? data : null;
          updateNext("oat", celsius);
        }

        // ── Turbulence ───────────────────────────────────────────────────
        // Thresholds:
        //   ≥ 0.25 — turbulence (announce once; reset when it drops below 0.10)
        if (command === "environment/turbulence_factor") {
          const factor = typeof data === "number" ? data : 0;
          updateNext("turbulence", factor);

          const isTurbulent = factor >= 0.25;
          const canAnnounceTurbulence =
            state.onGround === false &&
            isPhaseActive(state, this.phaseTracker, TURBULENCE_ANNOUNCEMENT_PHASES);

          if (canAnnounceTurbulence && isTurbulent && !flags.turbulenceAnnounced) {
            // ── Turbulence announcement ──────────────────────────
            flags.turbulenceAnnounced = true;

            // Turn on seatbelt sign if it isn't already
            if (state.seatbelt !== true) {
              if (this.isAutoActionsEnabled) {
                console.log(`[AutoActions] Turbulence encountered. Seatbelts OFF (${state.seatbelt}). Sending signs/seatbelt=true.`);
                ifConnect.set("aircraft/0/systems/signs/seatbelt", true);
              }
            }

            const announcement =
              "Ladies and gentlemen, we're currently experiencing some turbulence. " +
              "We ask that you return to your seats and ensure your seatbelts are securely fastened. " +
              "The seatbelt sign will remain on until we're clear of the area. " +
              "Thank you for your cooperation.";

            speak(announcement, { tone: "briefing", channel: "cabin" });

          } else if (factor < 0.10) {
            // Turbulence has cleared — reset flags so the next bout can be announced
            if (flags.turbulenceAnnounced) {
              if (canAnnounceTurbulence) {
                if (state.seatbelt !== false) {
                  flags.suppressNextAutoSeatbeltOff = true;
                  if (this.isAutoActionsEnabled) {
                    console.log(`[AutoActions] Turbulence cleared. Seatbelts ON (${state.seatbelt}). Sending signs/seatbelt=false.`);
                    ifConnect.set("aircraft/0/systems/signs/seatbelt", false);
                  }
                }
                speak(POST_TURBULENCE_ANNOUNCEMENT, { tone: "briefing", channel: "cabin" });
              }
              flags.turbulenceAnnounced = false;
              console.log("[Turbulence] Factor dropped below 0.10 — announcement flags reset.");
            }
          }
        }

        // ── Battery ──────────────────────────────────────────────────────
        /*
        if (command === "aircraft/0/systems/apu/apu/amp_draw") {
          const isOn = data > 0;
          
          if (state.battery !== -1 && state.battery !== (isOn ? 1 : 0)) {
            if (isOn) speak("Battery on.", "notice");
            else speak("Battery off.", "notice");
          }
          
          updateNext("battery", isOn ? 1 : 0);
        }
        */

        if (command === "aircraft/0/systems/electrical_switch/master_switch/state") {
          const isOn = data === 1;
          
          if (state.battery !== -1 && state.battery !== data) {
            if (isOn) speak("Battery on.", "notice");
            else speak("Battery off.", "notice");
          }
          
          updateNext("battery", data);
        }

        // ── APU ───────────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/apu/apu/state") {
          if (state.apu !== -1 && data !== state.apu) {
            if (data === 0) speak("APU off.", "notice");
            else if (data === 1) speak("APU starting.", "briefing");
            else if (data === 2) speak("APU on.", "notice");
          }
          updateNext("apu", data);
        }

        // ── Engine N1 ─────────────────────────────────────────────────────
        // --- LEGACY N1 ENGINE STATE LOGIC (commented out per request) ---
        /*
        const n1Match = command.match(/^aircraft\/0\/systems\/engines\/(\d+)\/n1$/);
        if (n1Match) {
          const engNum = parseInt(n1Match[1], 10) + 1;
          const n1 = data * 100;
          let cur = state.engines[engNum];
          let nxt = cur;

          if (cur === undefined) {
            // Initialize without speech
            if (n1 >= 15.0) nxt = 2;
            else if (n1 >= 1.0) nxt = 1;
            else nxt = 0;
          } else {
            if (cur === 0 && n1 >= 1.0) {
              speak(`Engine ${engNum} starting.`, "briefing");
              nxt = 1;
            } else if (cur === 1) {
              if (n1 >= 18.0) {
                speak(`Engine ${engNum} started.`, "notice");
                nxt = 2;
              } else if (n1 < 0.5) {
                speak(`Engine ${engNum} shutdown.`, "notice");
                nxt = 0;
              }
            } else if (cur === 2) {
              if (n1 < 5.0) {
                speak(`Engine ${engNum} shutting down.`, "notice");
                nxt = 3;
              }
            } else if (cur === 3) {
              if (n1 < 0.5) {
                speak(`Engine ${engNum} shutdown.`, "notice");
                nxt = 0;
              } else if (n1 >= 15.0) {
                speak(`Engine ${engNum} started.`, "notice");
                nxt = 2;
              }
            }
          }

          if (next.engines[engNum] !== nxt) {
            next.engines = { ...next.engines, [engNum]: nxt };
            updated = true;
          }
        }
        */

        // ── Engine State ──────────────────────────────────────────────────
        const engineStateMatch = command.match(/^aircraft\/0\/systems\/engines\/(\d+)\/state$/);
        if (engineStateMatch) {
          const engNum = parseInt(engineStateMatch[1], 10) + 1;
          const currentState = state.engines[engNum];
          const nextState = data; // 0=stopped, 1=starting, 2=running, 4=stopping

          if (currentState !== undefined && currentState !== nextState) {
            if (nextState === 1) {
              speak(`Engine ${engNum} starting.`, "briefing");
            } else if (nextState === 2) {
              speak(`Engine ${engNum} started.`, "notice");
            } else if (nextState === 4) {
              speak(`Engine ${engNum} shutting down.`, "notice");
            } else if (nextState === 0) {
              speak(`Engine ${engNum} shutdown.`, "notice");
            }
          }

          if (next.engines[engNum] !== nextState) {
            next.engines = { ...next.engines, [engNum]: nextState };
            updated = true;

            // Auto APU Shutoff: Trigger when at least 2 engines are running. 
            // (Most airliners have >=2 engines. If 3 or 4, cross-bleed start is used).
            if (this.isAutoActionsEnabled && nextState === 2) {
              /*
              // Temporarily disabled until official solution is available
              const runningCount = Object.values(next.engines).filter(s => s === 2).length;
              console.log(`[AutoActions] Engine ${engNum} running. Total running: ${runningCount}. APU=${next.apu}`);
              if (runningCount >= 2) {
                if (next.apu !== 0 && next.apu !== -1 && next.apu !== 3) {
                  console.log(`[AutoActions] Turning APU off (via button press).`);
                  ifConnect.set("simulator/ui_helpers/systems/electrical/apu_button/on", true);
                } else {
                  console.log(`[AutoActions] APU already off, shutting down, or not set (${next.apu}).`);
                }
              }
              */
            } else if (!this.isAutoActionsEnabled && nextState === 2) {
              console.log(`[AutoActions] Engine ${engNum} running, but automation disabled.`);
            }
          }
        }

        if (command === "aircraft/0/systems/engines/are_all_engines_off") {
          updateNext("allEnginesOff", data === 1 || data === true ? 1 : 0);
        }
        if (command === "aircraft/0/systems/engines/are_all_engines_on") {
          const isOn = data === 1 || data === true ? 1 : 0;
          updateNext("allEnginesOn", isOn);
        }

        const n1Match = command.match(/^aircraft\/0\/systems\/engines\/(\d+)\/n1$/);
        if (n1Match) {
          const engNum = parseInt(n1Match[1], 10) + 1;
          const pct = normalizePercent(data);
          if (pct !== null && next.engineN1[engNum] !== pct) {
            const engineN1 = { ...next.engineN1, [engNum]: pct };
            const values = Object.values(engineN1).filter((value) => typeof value === "number");
            next.engineN1 = engineN1;
            next.n1 = values.length
              ? values.reduce((sum, value) => sum + value, 0) / values.length
              : null;
            updated = true;
          }
        }


        // ── Pushback ─────────────────────────────────────────────────────
        if (command === "aircraft/0/ground_services/pushback/state") {
          updateNext("pushbackTug", isActiveStateValue(data));
        } else if (command === "aircraft/0/is_pushback_active") {
          updateNext("isPushing", isActiveStateValue(data));
        }

        const pushbackEngaged = next.pushbackTug || next.isPushing;
        if (next.isPushing && !state.isPushing) {
          speak("Pushback started.", "notice");
        }

        if (pushbackEngaged && state.pushback === 0) {
          updateNext("pushback", 1);
        } else if (!pushbackEngaged && state.pushback === 1) {
          speak("Pushback ended.", "notice");
          updateNext("pushback", 0);
        }

        // ── Runway / Destination ───────────────────────────────────────
        if (command === "aircraft/0/is_on_runway") {
          updateNext("onRunway", data === 1 || data === true);
        }
        if (
          command === "aircraft/0/location/destination_distance" ||
          command === "aircraft/0/flightplan/destination_dist"
        ) {
          updateNext("destDist", normalizeDestinationDistanceNm(data));
        }

        // ── Autopilot ─────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/autopilot/on") {
          const on = data === 1 || data === true;
          if (state.autopilot === 0 && on) speak("Autopilot on.", "notice");
          else if (state.autopilot === 1 && !on) speak("Autopilot off.", "notice");
          updateNext("autopilot", on ? 1 : 0);
        }
        if (command === "aircraft/0/systems/autopilot/alt/on") {
          const on = data === 1 || data === true;
          updateNext("autopilotAlt", on ? 1 : 0);
        }
        if (command === "aircraft/0/systems/autopilot/alt/target") {
          updateNext("autopilotAltTarget", typeof data === "number" ? data : null);
        }
        if (command === "aircraft/0/systems/autopilot/vnav/on") {
          const on = data === 1 || data === true;
          if (state.vnav === 0 && on) speak("VNAV on.", "notice");
          else if (state.vnav === 1 && !on) speak("VNAV off.", "notice");
          updateNext("vnav", on ? 1 : 0);
        }

        // ── Ground Services ───────────────────────────────────────────────
        const gsMap = {
          "aircraft/0/ground_services/belt_loader/state": {
            key: "beltLoader",
            onMsg: "Belt loader connected.",
            offMsg: "Belt loader disconnected.",
          },
          "aircraft/0/ground_services/catering/state": {
            key: "catering",
            onMsg: "Catering truck connected.",
            offMsg: "Catering truck disconnected.",
          },
          "aircraft/0/ground_services/gpu/state": {
            key: "gpu",
            onMsg: "GPU connected.",
            offMsg: "GPU disconnected.",
          },
          "aircraft/0/ground_services/pallet_loader/state": {
            key: "palletLoader",
            onMsg: "Pallet loader connected.",
            offMsg: "Pallet loader disconnected.",
          },
          "aircraft/0/ground_services/stairs/state": {
            key: "stairs",
            onMsg: "Stairs connected.",
            offMsg: "Stairs disconnected.",
          },
          "aircraft/0/ground_services/fuel_truck/state": {
            key: "fuelTruck",
            onMsg: "Fuel truck connected.",
            offMsg: "Fuel truck disconnected.",
          },
        };
        if (gsMap[command]) {
          const { key, onMsg, offMsg } = gsMap[command];
          const on = data === 1 || data === true;
          if (state[key] === 0 && on) speak(onMsg, "notice");
          else if (state[key] === 1 && !on) speak(offMsg, "notice");
          updateNext(key, on ? 1 : 0);
        }

        // ── Lights ────────────────────────────────────────────────────────
        const lightMap = {
          "aircraft/0/systems/beacon_lights_switch": { key: "beacon", name: "Beacon lights" },
          "aircraft/0/systems/nav_lights_switch": { key: "nav", name: "Navigation lights" },
          "aircraft/0/systems/strobe_lights_switch": { key: "strobe", name: "Strobe lights" },
          "aircraft/0/systems/landing_lights_switch": { key: "landing", name: "Landing lights" },
        };
        if (lightMap[command]) {
          const { key, name } = lightMap[command];
          const on = data === 1 || data === true;
          const val = on ? 1 : 0;
          if (state[key] !== -1 && state[key] !== val) {
            speak(`${name} ${on ? "on" : "off"}.`, "notice");
            if (
              key === "strobe" &&
              on &&
              state.onGround &&
              isPhaseActive(state, this.phaseTracker, PRE_TAKEOFF_PHASES) &&
              !flags.vSpeedBriefed &&
              state.weight > 0
            ) {
              flags.vSpeedBriefed = true;
              speak("Cabin crew prepare for take off.", "notice");
            }
          }
          updateNext(key, val);
        }

        // ── Signs ─────────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/signs/seatbelt") {
          const on = data === 1 || data === true;
          const val = on ? 1 : 0;
          const seatbeltChanged =
            flags.seatbeltHydrated &&
            state.seatbelt !== -1 &&
            val !== state.seatbelt;
          const inBoardingAnnouncementPhase =
            isPhaseActive(state, this.phaseTracker, BOARDING_ANNOUNCEMENT_PHASES) ||
            announcementCoordinator.isBoardingMusicExpected();
          const shouldPlayBoardingAnnouncement =
            on &&
            state.onGround &&
            inBoardingAnnouncementPhase &&
            !flags.boardingAnnouncementPlayed;

          if (seatbeltChanged) {
            if (!on && flags.suppressNextAutoSeatbeltOff) {
              flags.suppressNextAutoSeatbeltOff = false;
            } else if (shouldPlayBoardingAnnouncement) {
              flags.boardingAnnouncementPlayed = true;
              speak("Seatbelt signs on.", {
                tone: "notice",
                withChime: true,
                chimeReason: "seatbelt_sign",
                priority: true,
                afterSpeechTimeoutMs: false,
                afterSpeechDetached: true,
                afterSpeech: () => {
                  return announcementCoordinator.playSafetyBriefing(state.livery);
                },
              });
            } else {
              speak(`Seatbelt signs ${on ? "on" : "off"}.`, {
                tone: "notice",
                withChime: true,
                chimeReason: "seatbelt_sign",
                priority: true,
              });
            }
          }
          flags.seatbeltHydrated = true;
          updateNext("seatbelt", val);
        }

        if (command === "aircraft/0/systems/signs/no_smoking") {
          const on = data === 1 || data === true;
          const val = on ? 1 : 0;
          if (state.smoking !== -1 && val !== state.smoking) {
            speak(`No smoking signs ${on ? "on" : "off"}.`, {
              tone: "notice",
              withChime: true,
              chimeReason: "no_smoking_sign",
              priority: true,
            });
          }
          updateNext("smoking", val);
        }

        // ── Landing Gear ──────────────────────────────────────────────────
        if (command === "aircraft/0/systems/landing_gear/state") {
          const isDown = data === 1;
          const isUp = GEAR_STATE_UP_VALUES.has(data);
          if (state.gear !== -1 && data !== state.gear) {
            if (
              isDown &&
              state.gear !== 1 &&
              isPhaseActive(state, this.phaseTracker, GEAR_DOWN_PHASES)
            ) {
              speak("Gears down.", "callout");
            } else if (
              isUp &&
              !GEAR_STATE_UP_VALUES.has(state.gear) &&
              isPhaseActive(state, this.phaseTracker, GEAR_UP_PHASES)
            ) {
              speak("Landing gear up.", "callout");
            }
          }
          const nextClass = classifyGearState(data);
          if (nextClass !== classifyGearState(state.gear)) {
            console.log(`[GEAR] Physical state: ${nextClass.toUpperCase()}`);
            this._resolveGearCommand(nextClass);
          }
          updateNext("gear", data);
          updateNext("gearInTransit", nextClass === "transit");
        }

        if (command === "aircraft/0/systems/landing_gear/lever_state") {
          const leverDown = data === true || data === 1;
          if (state.gearLever !== null && state.gearLever !== leverDown) {
            console.log(`[GEAR] Lever state: ${leverDown ? "DOWN" : "UP"}`);
          }
          updateNext("gearLever", leverDown);
        }

        // ── Cargo Doors ───────────────────────────────────────────────────
        if (command === "aircraft/0/configuration/doors/cargo_doors_open") {
          updateNext("cargoDoorsOpen", data);
        }

        // ── Parking Brake ─────────────────────────────────────────────────
        if (command === "aircraft/0/systems/parking_brake/state") {
          const set = data === 1 || data === true;
          const val = set ? 1 : 0;
          if (state.brakes !== -1 && val !== state.brakes) {
            speak(set ? "Parking brakes set." : "Parking brakes released.", "notice");
          }
          updateNext("brakes", val);
        }

        // ── Spoilers ──────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/spoilers/state") {
          const map = { 0: "off", 1: "flight", 2: "armed" };
          if (state.spoilers !== -1 && state.spoilers !== data) {
            speak(`Spoilers ${map[data] ?? data}.`, "notice");
          }
          updateNext("spoilers", data);
        }

        // ── Flaps ─────────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/flaps/state") {
          if (
            data !== state.flaps &&
            state.name !== "" &&
            state.flaps !== -1 &&
            isPhaseActive(state, this.phaseTracker, FLAP_CALLOUT_PHASES)
          ) {
            speak(`Flaps ${getFlapString(state.name, data)}.`, "callout");
          }
          updateNext("flaps", data);
        }

        // ── Welcome message (triggered when we have enough data) ──────────
        if (
          !flags.welcomeMessagePlayed &&
          next.name !== "" &&
          next.weight > 0 &&
          next.onGround !== undefined
          // next.time !== "---"
        ) {
          flags.welcomeMessagePlayed = true;
          announcementCoordinator.playSessionWelcome(
            next.onGround
              ? "Welcome to the flight Captain."
              : "Welcome back to the flight Captain.",
            {
              tone: "briefing",
              priority: true,
              allowBeforeWelcome: true,
              afterSpeech: () => {
                announcementCoordinator.onDepartureWelcomeEnded();
              }
            }
          );
          flushPendingAnnouncements();
        }

        // ── Recalculate performance if aircraft/weight changed ────────────
        if (updated && next.name && next.weight) {
          next.performance = calculatePerformance(next.name, next.weight);
        }

        // ── Phase derivation ──────────────────────────────────────────────
        // Runs on every poll packet so time-hysteresis can mature even when
        // the simulator is holding perfectly steady values.
        const syncStartedAt = phaseSync.connectedAt || flags.connectedAt;
        const phaseReady =
          arePhaseCommandsReady(phaseSync.seenCommands) &&
          syncStartedAt &&
          now - syncStartedAt >= PHASE_SYNC_MIN_MS;

        phaseSync.phaseReady = Boolean(phaseReady);
        this.phaseTracker.phaseReady = phaseSync.phaseReady;

        updateNext(
          "phase",
          phaseSync.phaseReady
            ? deriveFlightPhase(next, this.phaseTracker, flags, now)
            : PHASE_SYNCING
        );

        return updated ? next : prev;
      });
    };

    ifConnect.on("data", this.dataHandler);

    // ─── 3. IF Connect error handler ──────────────────────────────────────
    this.errorHandler = (err) => {
      console.log("[FlightSession] Connection error:", err.message);
      this._requestDisconnect({
        isMainMenuExit: false,
        reason: "network_error",
      });
    };

    this.disconnectHandler = () => {
      this._requestDisconnect({
        isMainMenuExit: false,
        reason: "socket_disconnected",
      });
    };

    this.reconnectHandler = () => {
      this.verifyMode = "reconnect";
      this._setConnectionStatus("VERIFYING STATE...");
      const now = Date.now();
      this.flags.connectedAt = now;
      this._resetPhaseState(now);
      this._setTelemetry((prev) => ({ ...prev, phase: PHASE_SYNCING }));
    };

    this.reconnectingHandler = () => {
      this.verifyMode = "reconnect";
      this._setConnectionStatus("RECONNECTING...");
    };

    ifConnect.on("error", this.errorHandler);
    ifConnect.on("disconnect", this.disconnectHandler);
    ifConnect.on("reconnecting", this.reconnectingHandler);
    ifConnect.on("connect", this.reconnectHandler);
  }

  connect(ip, isManual = false) {
    if (this.isConnected) return;
    const targetIp = normalizeConnectionIp(ip);
    if (!targetIp) return;
    this.isConnected = true;
    runtimeTrace("flightSession.connect", {
      source: isManual ? "manualConnect" : "autoConnect",
      owner: "FlightSession",
      connectedIp: targetIp,
      startCount: this.startCount,
      speech: announcementCoordinator.getDiagnostics?.(),
      ifConnect: ifConnect.getDiagnostics?.(),
    }, { throttleMs: 0 });
    this.verifyMode = "initial";
    this._startAndroidRuntime(targetIp).catch(() => {});
    this._setConnectionStatus("CONNECTING...");
    this._setConnectedIp(targetIp);

    // Reset displayed telemetry and phase memory. A short sync gate below
    // prevents stale phases from leaking into a fresh flight.
    this._setTelemetry({ ...INITIAL_TELEMETRY });
    this._resetPhaseState();
    this._resetPtuState();
    this._resetGearCommandState();
    const flags = this._resetAnnouncementState({ isManualConnection: isManual });

    // Close any existing connection, then connect fresh
    ifConnect.close(() => {
      ifConnect.init(
        () => {
          // Success - register all poll commands, but stay in VERIFYING until app_state or aircraft name is received
          this.verifyMode = "initial";
          this._setConnectionStatus("VERIFYING STATE...");
          flags.connectedAt = Date.now();
          this.phaseSync.connectedAt = flags.connectedAt;
          announcementCoordinator.onConnectionPollingStarted();
          runtimeTrace("flightSession.poll_register_start", {
            source: "ifConnect.successCallback",
            owner: "FlightSession",
            commandCount: POLL_COMMANDS.length,
            telemetryPacketSeq: this.telemetryPacketSeq,
            ifConnect: ifConnect.getDiagnostics?.(),
          }, { throttleMs: 0 });

          POLL_COMMANDS.forEach((cmd) => {
            ifConnect.pollRegister(cmd);
          });
        },
        { host: targetIp, port: 10112 }
      );
    });
  }

  stop() {
    if (this.startCount > 0) {
      this.startCount -= 1;
    }
    if (this.startCount > 0) return;
    if (!this.started) return;
    this.started = false;

    runtimeTrace("flightSession.stop", {
      source: "useTelemetry/androidRuntime",
      owner: "FlightSession",
      reason: this.isConnected ? "active_session_stop_requested" : "inactive_session_stop_requested",
      telemetryPacketSeq: this.telemetryPacketSeq,
      telemetryUpdateSeq: this.telemetryUpdateSeq,
      speech: announcementCoordinator.getDiagnostics?.(),
      ifConnect: ifConnect.getDiagnostics?.(),
    }, { throttleMs: 0 });

    if (this.isConnected) {
      this._requestDisconnect({
        isMainMenuExit: false,
        reason: "stop_requested",
      });
    }

    try {
      if (this.discoverySocket) this.discoverySocket.close();
    } catch (e) {}
    this.discoverySocket = null;

    if (this.autoConnectTimer) {
      clearTimeout(this.autoConnectTimer);
      this.autoConnectTimer = null;
    }
    if (this.verifyTimer) {
      clearTimeout(this.verifyTimer);
      this.verifyTimer = null;
    }

    if (this.dataHandler) ifConnect.off("data", this.dataHandler);
    if (this.errorHandler) ifConnect.off("error", this.errorHandler);
    if (this.disconnectHandler) ifConnect.off("disconnect", this.disconnectHandler);
    if (this.reconnectingHandler) ifConnect.off("reconnecting", this.reconnectingHandler);
    if (this.reconnectHandler) ifConnect.off("connect", this.reconnectHandler);
    if (!this.isConnected) {
      ifConnect.close(() => {});
    }

    this.dataHandler = null;
    this.errorHandler = null;
    this.disconnectHandler = null;
    this.reconnectHandler = null;
    this.reconnectingHandler = null;
  }

  // ─── Ambient Boarding Music Logic ─────────────────────────────────────────
  _handleAmbientBoardingMusic() {
    const { telemetry } = this.state;
    announcementCoordinator.evaluateAmbientBoardingMusic({
      telemetry,
      isConnected: this.isConnected,
      reason: "telemetry_effects",
    });
  }

  // ─── Siren logic (brake + throttle + engines) ──────────────────────────────
  _handleSiren() {
    const { telemetry } = this.state;
    const anyRunning = Object.values(telemetry.engines || {}).some((s) => s === 2);
    if (anyRunning && telemetry.brakes === 1 && telemetry.throttle > 0.05) {
      announcementCoordinator.playSiren();
    }
  }

  // ─── Airbus PTU logic ───────────────────────────────────────────────────────
  _handlePtuBurst(telemetry) {
    if (!this.isConnected) return;

    if (!isAirbusA320Family(telemetry.name)) {
      this.ptuPreviousEngines = telemetry.engines || {};
      this.ptuPreviousGroundSpeed = telemetry.gs || 0;
      return;
    }

    const prevEng = this.ptuPreviousEngines || {};
    const currEng = telemetry.engines || {};
    const currGs = telemetry.gs || 0;
    const onGround = telemetry.onGround !== false; // Default to true if undefined

    const eng1Prev = prevEng[1] || 0;
    const eng1Curr = currEng[1] || 0;
    const eng2Prev = prevEng[2] || 0;
    const eng2Curr = currEng[2] || 0;

    let shouldPlay = false;
    let duration = 8500;

    // 1. Second engine start
    // An engine is already running (2), and the other engine goes from off (0) to starting (1)
    if (
      (eng1Curr === 2 && eng2Prev === 0 && eng2Curr === 1) ||
      (eng2Curr === 2 && eng1Prev === 0 && eng1Curr === 1)
    ) {
      shouldPlay = true;
      duration = 10000;
    }
    // 2. Engine shutdown
    // An engine goes from running (2) to off (0) while the other is running (2)
    else if (
      onGround && 
      ((eng1Prev === 2 && eng1Curr === 0 && eng2Curr === 2) ||
      (eng2Prev === 2 && eng2Curr === 0 && eng1Curr === 2))
    ) {
      shouldPlay = true;
      duration = 15000;
    }
    // 3. Single-engine taxi
    // Moving on the ground with only one engine running
    else if (onGround && currGs > 2 && currGs < 35) {
      if ((eng1Curr === 2 && eng2Curr === 0) || (eng2Curr === 2 && eng1Curr === 0)) {
        shouldPlay = true;
        duration = 55000; // Let the full audio play, will loop naturally via the engine 
      }
    }

    if (shouldPlay) {
      announcementCoordinator.playPTUBurst(duration);
    }

    this.ptuPreviousEngines = currEng;
    this.ptuPreviousGroundSpeed = currGs;
  }

  _requestDisconnect({ isMainMenuExit = false, reason = "user_requested" } = {}) {
    runtimeTrace("flightSession.disconnect_requested", {
      source: isMainMenuExit ? "simulator-main-menu" : "session-lifecycle",
      owner: "FlightSession",
      reason,
      isMainMenuExit,
      telemetryPacketSeq: this.telemetryPacketSeq,
      telemetryUpdateSeq: this.telemetryUpdateSeq,
      speech: announcementCoordinator.getDiagnostics?.(),
      ifConnect: ifConnect.getDiagnostics?.(),
    }, { throttleMs: 0 });

    if (this.disconnectPromise) return this.disconnectPromise;

    this.disconnectReason = reason;
    this.disconnectPromise = this._terminateMonitoringSession({
      isMainMenuExit,
      reason,
    }).finally(() => {
      this.disconnectPromise = null;
      this.disconnectReason = "";
    });
    return this.disconnectPromise;
  }

  async _terminateMonitoringSession({ isMainMenuExit = false, reason = "unknown" } = {}) {
    runtimeTrace("flightSession.disconnect", {
      source: isMainMenuExit ? "simulator-main-menu" : "session-lifecycle",
      owner: "FlightSession",
      reason,
      telemetryPacketSeq: this.telemetryPacketSeq,
      telemetryUpdateSeq: this.telemetryUpdateSeq,
      speech: announcementCoordinator.getDiagnostics?.(),
      ifConnect: ifConnect.getDiagnostics?.(),
    }, { throttleMs: 0 });

    this._setConnectionStatus("AWAITING SIMULATOR LINK...");
    this._setConnectedIp("");
    this.phaseTracker = createPhaseTracker();
    this.phaseSync = createPhaseSyncState();
    this.verifyMode = "initial";
    this._setTelemetry({ ...INITIAL_TELEMETRY });
    this.isConnected = false;
    ifConnect.close(() => {});

    if (isMainMenuExit && this.flags.isManualConnection) {
      this._emitEvent({
        type: "alert",
        title: "Simulator in Main Menu",
        message: "Client is in the main menu. Please enter the game first before connecting.",
      });
    }

    this._resetAnnouncementState({ isManualConnection: false });
    this._resetPtuState();
    this._resetGearCommandState();
    await announcementCoordinator.onClientDisconnected({ reason });
    await this._stopAndroidRuntime(reason);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  manualConnect(ip) {
    if (!ip) return;
    announcementCoordinator.speak("Connecting to client.", { tone: "notice" });
    this.isConnected = false; // Allow new connection
    if (this.connect) {
      this.connect(ip, true);
    }
  }

  selectDevice(deviceId) {
    const dev = this.state.discoveredDevices.find((d) => d.deviceId === deviceId);
    if (dev && dev.ip) {
      this.isConnected = false;
      if (this.connect) {
        this.connect(dev.ip, true);
      }
    }
  }

  disconnect(isMainMenuExit = false, reason = "user_requested") {
    return this._requestDisconnect({ isMainMenuExit, reason });
  }

  resetForConnectingFlight() {
    if (!this.isConnected) return;

    const now = Date.now();
    const flags = this._resetAnnouncementState();
    flags.connectedAt = now;
    this._resetPhaseState(now);
    announcementCoordinator.onConnectingFlightReset();
    this._setTelemetry((prev) => ({ ...prev, phase: PHASE_SYNCING }));
  }
}

export const flightSession = new FlightSession();
export { INITIAL_TELEMETRY };
export default flightSession;
