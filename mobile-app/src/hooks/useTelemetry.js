/**
 * useTelemetry.js
 *
 * React hook that manages the full Infinite Flight telemetry session:
 *  - UDP auto-discovery of devices on port 15000
 *  - Direct TCP connection to IF via ifConnectClient (port 10112)
 *  - Live state decoding and announcement logic
 *
 * Connection is made directly to IF — no proxy backend required.
 * The device and the app must be on the same local WiFi network.
 */

import { useState, useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import dgram from "react-native-udp";
import ifConnect from "../utils/ifConnectClient";
import { speechManager } from "../utils/speech";
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
const CLIMB_CALLOUT_MIN_VS_FPM = 150;
const DESCENT_CALLOUT_MAX_VS_FPM = -150;
const POSITIVE_RATE_MIN_AGL_FT = 50;
const POSITIVE_RATE_MAX_AGL_FT = 1500;
const POSITIVE_RATE_MIN_VS_FPM = 150;
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

const isClimbingForCallout = (telemetry) =>
  telemetry.onGround === false &&
  typeof telemetry.vs === "number" &&
  telemetry.vs > CLIMB_CALLOUT_MIN_VS_FPM;

const isDescendingForCallout = (telemetry) =>
  telemetry.onGround === false &&
  typeof telemetry.vs === "number" &&
  telemetry.vs < DESCENT_CALLOUT_MAX_VS_FPM;

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
  performance: null,
  appState: -1,
  phase: PHASE_SYNCING,
};

export function useTelemetry(disableAutoConnect = false) {
  const [connectionStatus, setConnectionStatus] = useState("AWAITING SIMULATOR LINK...");
  const [connectedIp, setConnectedIp] = useState("");
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
  const [ambientTrigger, setAmbientTrigger] = useState(0);

  // Use a ref so the UDP listener always sees the latest boolean without re-binding
  const disableAutoConnectRef = useRef(disableAutoConnect);
  useEffect(() => {
    disableAutoConnectRef.current = disableAutoConnect;
  }, [disableAutoConnect]);

  const stateRef = useRef(telemetry);
  const connectToIFRef = useRef(null);
  const isConnectedRef = useRef(false);
  const disconnectDeviceRef = useRef(null);
  const discoveredDevicesRef = useRef([]);
  const autoConnectTimerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState || "active");
  const phaseTrackerRef = useRef(createPhaseTracker());
  const phaseSyncRef = useRef(createPhaseSyncState());
  const boardingMusicPrefetchLiveryRef = useRef("");

  const flagsRef = useRef({
    eightyKnots: false,
    vSpeedBriefed: false,
    positiveRate: false,
    hasFlown: false,
    welcome: false,
    alt5k: false,
    alt10k: false,
    alt15k: false,
    alt24k: false,
    boardingAnnouncementPlayed: false,
    boardingMusicStarted: false,
    boardingMusicStopped: false,
    welcomeMessagePlayed: false,
    pendingAnnouncements: [],
    seatbeltHydrated: false,
    v1Announced: false,
    vrAnnounced: false,
    v2Announced: false,
    connectedAt: 0,
    isManualConnection: false,
    moderateTurbulenceAnnounced: false,
    severeTurbulenceAnnounced: false,
    suppressNextAutoSeatbeltOff: false,
  });

  const resetPhaseState = (connectedAt = 0) => {
    phaseTrackerRef.current = createPhaseTracker();
    phaseSyncRef.current = createPhaseSyncState();
    phaseSyncRef.current.connectedAt = connectedAt;
    phaseTrackerRef.current.phaseReady = false;
  };

  const resetAnnouncementState = ({ isManualConnection } = {}) => {
    const flags = flagsRef.current;
    const manualState = isManualConnection ?? flags.isManualConnection;
    Object.keys(flags).forEach((k) => {
      if (typeof flags[k] === "boolean") flags[k] = false;
      if (typeof flags[k] === "number") flags[k] = 0;
    });
    flags.pendingAnnouncements = [];
    flags.isManualConnection = manualState;
    return flags;
  };

  // Keep stateRef in sync with latest telemetry
  useEffect(() => {
    stateRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      appStateRef.current = state;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // ─── 1. UDP Auto-Discovery ──────────────────────────────────────────────
    let discoverySocket;
    try {
      discoverySocket = dgram.createSocket({ type: "udp4", reusePort: true });
      discoverySocket.bind(15000, "0.0.0.0");

      discoverySocket.on("message", (msg, rinfo) => {
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

          const exists = discoveredDevicesRef.current.find((d) => d.deviceId === devId);
          if (!exists) {
            discoveredDevicesRef.current.push({ deviceId: devId, deviceName: devName, ip });
            setDiscoveredDevices([...discoveredDevicesRef.current]);
          }

          // Extract state. Be careful with falsy values like 0.
          const stateVal = data.State ?? data.state ?? data.AppState ?? data.appState;
          const stateStr = stateVal !== undefined ? String(stateVal) : undefined;
          const isReady = stateStr === "1" || stateStr === "Playing";
          const isMenu = stateStr === "0" || stateStr === "Menu";

          // Auto-connect after 1.5s only if there's exactly 1 device discovered
          if (!isConnectedRef.current && connectToIFRef.current && isReady) {
            const shouldConnectImmediately =
              appStateRef.current !== "active" &&
              discoveredDevicesRef.current.length === 1 &&
              !disableAutoConnectRef.current;

            if (shouldConnectImmediately) {
              if (autoConnectTimerRef.current) {
                clearTimeout(autoConnectTimerRef.current);
                autoConnectTimerRef.current = null;
              }
              connectToIFRef.current(discoveredDevicesRef.current[0].ip, false);
            } else if (!autoConnectTimerRef.current && !disableAutoConnectRef.current) {
              autoConnectTimerRef.current = setTimeout(() => {
                if (discoveredDevicesRef.current.length === 1 && !isConnectedRef.current && connectToIFRef.current && !disableAutoConnectRef.current) {
                  connectToIFRef.current(discoveredDevicesRef.current[0].ip, false);
                }
                autoConnectTimerRef.current = null;
              }, 1500);
            }
          } else if (isConnectedRef.current && isMenu) {
            // Simulator explicitly broadcasted that it's in the menu! Instant disconnect.
            if (disconnectDeviceRef.current) {
              disconnectDeviceRef.current(true);
            }
          }
        } catch (e) {
          // Silently ignore malformed UDP packets
        }
      });

      discoverySocket.on("error", (e) => {
        console.log("[Discovery] UDP socket error:", e);
      });
    } catch (e) {
      console.log("[Discovery] UDP socket creation/bind error (likely unsupported environment or hot-reload):", e);
    }

    // ─── 2. IF Connect client data handler ────────────────────────────────

    const dataHandler = ({ command, data }) => {
      const flags = flagsRef.current;
      const now = Date.now();
      const phaseSync = phaseSyncRef.current;

      if (PHASE_READY_COMMANDS.includes(command)) {
        phaseSync.seenCommands.add(command);
      }

      // Gate announcements — suppress first 2.5 seconds after connect
      const speak = (msg, options = {}) => {
        const opts = typeof options === 'string' ? { tone: options } : { tone: "callout", ...options };
        if (!opts.ignoreConnectGate && (!flags.connectedAt || now - flags.connectedAt < 2500)) return;
        if (!flags.welcomeMessagePlayed && !opts.allowBeforeWelcome) {
          flags.pendingAnnouncements.push({ msg, options: opts });
          return;
        }
        speechManager.speak(msg, opts);
      };

      const flushPendingAnnouncements = () => {
        const pending = flags.pendingAnnouncements;
        flags.pendingAnnouncements = [];
        pending.forEach(({ msg, options }) => {
          speechManager.speak(msg, options);
        });
      };

      setTelemetry((prev) => {
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
            setTimeout(() => {
              if (disconnectDeviceRef.current) {
                disconnectDeviceRef.current(true); // Pass true to indicate main menu exit
              }
            }, 0);
            return prev;
          } else if (data === "Playing" || data === 1) {
            setConnectionStatus(prevStatus => prevStatus !== "FLIGHT LINK ACTIVE" ? "FLIGHT LINK ACTIVE" : prevStatus);
          }
        }
        
        if (command === "aircraft/0/name") {
          updateNext("name", data);
          if (data && typeof data === "string" && data.trim() !== "") {
            setConnectionStatus(prevStatus => prevStatus !== "FLIGHT LINK ACTIVE" ? "FLIGHT LINK ACTIVE" : prevStatus);
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
            const inTakeoffRoll = state.onGround && isPhaseActive(state, phaseTrackerRef.current, TAKEOFF_ROLL_PHASES);
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
            isPhaseActive(state, phaseTrackerRef.current, ARRIVAL_GROUND_PHASES)
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
            const pollyVoice = speechManager.voicePreference === "male" ? "Matthew" : "Ruth";
            speechManager.speakWithPollyFallback(welcomeText, pollyVoice, {
              tone: "briefing",
              detachedFromQueue: true,
              afterSpeech: () => {
                flags.arrivalWelcomeEnded = true;
                setAmbientTrigger(t => t + 1);
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
            const alt = (threshold) =>
              crossedThreshold(prevMsl, data, threshold);

            const inClimbAnnouncementPhase = isPhaseActive(state, phaseTrackerRef.current, CLIMB_ANNOUNCEMENT_PHASES);
            const inDescentAnnouncementPhase = isPhaseActive(state, phaseTrackerRef.current, DESCENT_ANNOUNCEMENT_PHASES);
            const allowClimbAltitudeCallout =
              inClimbAnnouncementPhase || (phaseTrackerRef.current.phaseReady && isClimbingForCallout(state));
            const allowDescentAltitudeCallout =
              inDescentAnnouncementPhase || (phaseTrackerRef.current.phaseReady && isDescendingForCallout(state));

            if (allowClimbAltitudeCallout && alt(5000).ascending && !flags.alt5k) {
              speak("Passing five thousand.", "notice");
              flags.alt5k = true;
            }
            if (allowDescentAltitudeCallout && alt(5000).descending && flags.alt5k) {
              speak("Passing five thousand.", "notice");
              flags.alt5k = false;
            }
            if (allowClimbAltitudeCallout && alt(10000).ascending && !flags.alt10k) {
              speak("Ten thousand. Landing lights off.", { tone: "caution", priority: true });
              flags.alt10k = true;
            }
            if (allowDescentAltitudeCallout && alt(10000).descending && flags.alt10k) {
              speak("Ten thousand. Landing lights on.", { tone: "notice", priority: true });
              flags.alt10k = false;
            }
            if (allowClimbAltitudeCallout && alt(15000).ascending && !flags.alt15k) {
              speak("Passing one-five thousand.", "notice");
              flags.alt15k = true;
            }
            if (allowDescentAltitudeCallout && alt(15000).descending && flags.alt15k) {
              speak("Passing one-five thousand.", "notice");
              flags.alt15k = false;
            }
            if (allowClimbAltitudeCallout && alt(24000).ascending && !flags.alt24k) {
              speak("Passing Flight Level two-four-zero.", "notice");
              flags.alt24k = true;
            }
            if (allowDescentAltitudeCallout && alt(24000).descending && flags.alt24k) {
              speak("Descending Flight Level two-four-zero.", "notice");
              flags.alt24k = false;
            }
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
              isPhaseActive(state, phaseTrackerRef.current, TAKEOFF_SEQUENCE_PHASES) &&
              !flags.positiveRate
            ) {
              speak("Positive rate. Gear up.", { tone: "callout", ignoreConnectGate: true });
              flags.positiveRate = true;
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
        //   ≥ 0.25 — moderate turbulence (announce once; reset when it drops below 0.10)
        //   ≥ 0.50 — severe  turbulence (announce once on top of moderate; same reset)
        if (command === "environment/turbulence_factor") {
          const factor = typeof data === "number" ? data : 0;
          updateNext("turbulence", factor);

          const isSevere   = factor >= 0.50;
          const isModerate = factor >= 0.25;
          const canAnnounceTurbulence =
            state.onGround === false &&
            isPhaseActive(state, phaseTrackerRef.current, TURBULENCE_ANNOUNCEMENT_PHASES);

          if (canAnnounceTurbulence && isSevere && !flags.severeTurbulenceAnnounced) {
            // ── Severe turbulence announcement ────────────────────────────
            flags.severeTurbulenceAnnounced = true;
            flags.moderateTurbulenceAnnounced = true; // absorb the moderate flag too

            // Turn on seatbelt sign if it isn't already
            if (state.seatbelt !== 1) {
              ifConnect.set("aircraft/0/systems/signs/seatbelt", true);
            }

            const announcement =
              "Ladies and gentlemen, this is your captain speaking. " +
              "We are currently experiencing severe turbulence. " +
              "For your safety, the seatbelt sign has been turned on. " +
              "Please return to your seats immediately, fasten your seatbelts securely, " +
              "and stow any tray tables and loose items. " +
              "Please remain seated until the seatbelt sign has been switched off. " +
              "We apologize for the inconvenience and appreciate your cooperation.";

            speak(announcement, { tone: "briefing" });

          } else if (canAnnounceTurbulence && isModerate && !flags.moderateTurbulenceAnnounced) {
            // ── Moderate turbulence announcement ──────────────────────────
            flags.moderateTurbulenceAnnounced = true;

            // Turn on seatbelt sign if it isn't already
            if (state.seatbelt !== 1) {
              ifConnect.set("aircraft/0/systems/signs/seatbelt", true);
            }

            const announcement =
              "Ladies and gentlemen, this is your captain speaking. " +
              "We are currently experiencing some turbulence. " +
              "The seatbelt sign has been switched on. " +
              "We ask that you please return to your seats and fasten your seatbelts. " +
              "Please also ensure your tray tables are stowed and any overhead bins are secure. " +
              "We will do our best to find a smoother altitude. " +
              "Thank you for your patience.";

            speak(announcement, { tone: "briefing" });

          } else if (factor < 0.10) {
            // Turbulence has cleared — reset flags so the next bout can be announced
            if (flags.moderateTurbulenceAnnounced || flags.severeTurbulenceAnnounced) {
              if (canAnnounceTurbulence) {
                if (state.seatbelt !== 0) {
                  flags.suppressNextAutoSeatbeltOff = true;
                  ifConnect.set("aircraft/0/systems/signs/seatbelt", false);
                }
                speak(POST_TURBULENCE_ANNOUNCEMENT, { tone: "briefing" });
              }
              flags.moderateTurbulenceAnnounced = false;
              flags.severeTurbulenceAnnounced = false;
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
          }
        }

        if (command === "aircraft/0/systems/engines/are_all_engines_off") {
          updateNext("allEnginesOff", data === 1 || data === true ? 1 : 0);
        }
        if (command === "aircraft/0/systems/engines/are_all_engines_on") {
          updateNext("allEnginesOn", data === 1 || data === true ? 1 : 0);
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
              isPhaseActive(state, phaseTrackerRef.current, PRE_TAKEOFF_PHASES) &&
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
            isPhaseActive(state, phaseTrackerRef.current, BOARDING_ANNOUNCEMENT_PHASES) ||
            (flags.boardingMusicStarted && !flags.boardingMusicStopped);
          const shouldPlayBoardingAnnouncement =
            on &&
            state.onGround &&
            inBoardingAnnouncementPhase &&
            !flags.boardingAnnouncementPlayed;

          if (seatbeltChanged) {
            if (!on && flags.suppressNextAutoSeatbeltOff) {
              flags.suppressNextAutoSeatbeltOff = false;
            } else if (shouldPlayBoardingAnnouncement) {
              flags.boardingMusicStopped = true;
              flags.boardingAnnouncementPlayed = true;
              speak("Seatbelt signs on.", {
                tone: "notice",
                withChime: true,
                chimeReason: "seatbelt_sign",
                priority: true,
                afterSpeech: () => {
                  speechManager.playBoardingAnnouncement(state.livery, {
                    fadeBoardingMusic: true,
                    onFinish: () => {
                      flags.safetyBriefingEnded = true;
                      setAmbientTrigger(t => t + 1);
                    }
                  });
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
          const isUp = data === 2 || data === 5 || data === 0;
          if (state.gear !== -1 && data !== state.gear) {
            if (
              isDown &&
              state.gear !== 1 &&
              isPhaseActive(state, phaseTrackerRef.current, GEAR_DOWN_PHASES)
            ) {
              speak("Gears down.", "callout");
            } else if (
              isUp &&
              !(state.gear === 2 || state.gear === 5 || state.gear === 0) &&
              isPhaseActive(state, phaseTrackerRef.current, GEAR_UP_PHASES)
            ) {
              speak("Landing gear up.", "callout");
            }
          }
          updateNext("gear", data);
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
            isPhaseActive(state, phaseTrackerRef.current, FLAP_CALLOUT_PHASES)
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
          speechManager.stopAll();
          speechManager.speak(
            next.onGround
              ? "Welcome to the flight Captain."
              : "Welcome back to the flight Captain.",
            {
              tone: "briefing",
              priority: true,
              allowBeforeWelcome: true,
              afterSpeech: () => {
                flags.departureWelcomeEnded = true;
                setAmbientTrigger(t => t + 1);
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
        phaseTrackerRef.current.phaseReady = phaseSync.phaseReady;

        updateNext(
          "phase",
          phaseSync.phaseReady
            ? deriveFlightPhase(next, phaseTrackerRef.current, flags, now)
            : PHASE_SYNCING
        );

        return updated ? next : prev;
      });
    };

    ifConnect.on("data", dataHandler);

    // ─── 3. Connect function ───────────────────────────────────────────────
    const connectToIF = (ip, isManual = false) => {
      if (isConnectedRef.current) return;
      isConnectedRef.current = true;
      setConnectionStatus("CONNECTING...");
      setConnectedIp(ip);

      // Reset displayed telemetry and phase memory. A short sync gate below
      // prevents stale phases from leaking into a fresh flight.
      setTelemetry({ ...INITIAL_TELEMETRY });
      resetPhaseState();
      const flags = resetAnnouncementState({ isManualConnection: isManual });

      // Close any existing connection, then connect fresh
      ifConnect.close(() => {
        ifConnect.init(
          () => {
            // Success — register all poll commands, but stay in VERIFYING until app_state or aircraft name is received
            setConnectionStatus("VERIFYING STATE...");
            flags.connectedAt = Date.now();
            phaseSyncRef.current.connectedAt = flags.connectedAt;
            speechManager.stopBoardingMusic();

            POLL_COMMANDS.forEach((cmd) => {
              ifConnect.pollRegister(cmd);
            });
          },
          { host: ip, port: 10112 }
        );
      });
    };

    connectToIFRef.current = connectToIF;

    // ─── 4. IF Connect error handler ──────────────────────────────────────
    const errorHandler = (err) => {
      console.log("[useTelemetry] Connection error:", err.message);
      setConnectionStatus("AWAITING SIMULATOR LINK...");
      setConnectedIp("");
      resetPhaseState();
      setTelemetry({ ...INITIAL_TELEMETRY });
      isConnectedRef.current = false;
      ifConnect.close(() => {});
      resetAnnouncementState({ isManualConnection: false });
      speechManager.stopAll();
      setTimeout(() => {
        speechManager.speak("Client disconnected.", { tone: "notice" });
      }, 500);
    };

    const disconnectHandler = () => {
      setConnectionStatus("AWAITING SIMULATOR LINK...");
      setConnectedIp("");
      resetPhaseState();
      setTelemetry({ ...INITIAL_TELEMETRY });
      isConnectedRef.current = false;
      ifConnect.close(() => {});
      resetAnnouncementState({ isManualConnection: false });
      speechManager.stopAll();
      setTimeout(() => {
        speechManager.speak("Client disconnected.", { tone: "notice" });
      }, 500);
    };

    const reconnectHandler = () => {
      setConnectionStatus("VERIFYING STATE...");
      const now = Date.now();
      flagsRef.current.connectedAt = now;
      resetPhaseState(now);
      setTelemetry((prev) => ({ ...prev, phase: PHASE_SYNCING }));
    };

    const reconnectingHandler = () => {
      setConnectionStatus("RECONNECTING...");
    };

    ifConnect.on("error", errorHandler);
    ifConnect.on("disconnect", disconnectHandler);
    ifConnect.on("reconnecting", reconnectingHandler);
    ifConnect.on("connect", reconnectHandler);

    // ─── 5. Cleanup ───────────────────────────────────────────────────────
    return () => {
      try {
        if (discoverySocket) discoverySocket.close();
      } catch (e) {}
      ifConnect.off("data", dataHandler);
      ifConnect.off("error", errorHandler);
      ifConnect.off("disconnect", disconnectHandler);
      ifConnect.off("reconnecting", reconnectingHandler);
      ifConnect.off("connect", reconnectHandler);
      ifConnect.close(() => {});
    };
  }, []);

  // ─── Ambient Boarding Music Logic ─────────────────────────────────────────
  useEffect(() => {
    if (!telemetry.name || !isConnectedRef.current) return;

    const isDeparturePhase = ["preflight", "boarding", "pushback", "taxi_out"].includes(telemetry.phase);
    const isArrivalPhase = ["taxi_in", "deboarding"].includes(telemetry.phase);

    // Stop music on strobe lights on or takeoff phase
    if (telemetry.strobe === 1 || telemetry.phase === "takeoff") {
      if (flagsRef.current.boardingMusicStarted && !flagsRef.current.boardingMusicStopped) {
        flagsRef.current.boardingMusicStopped = true;
        speechManager.stopBoardingMusic({ fade: true });
      }
    }

    // 1. Departure music: start after welcome message ends, but ONLY when livery is fetched
    if (flagsRef.current.departureWelcomeEnded && isDeparturePhase && telemetry.livery) {
      if (!flagsRef.current.boardingMusicStarted && !flagsRef.current.boardingMusicStopped) {
        flagsRef.current.boardingMusicStarted = true;
        speechManager.playBoardingMusic(telemetry.livery);
      }
    }

    // 2. Resume departure music after safety briefing ends
    if (flagsRef.current.safetyBriefingEnded) {
      flagsRef.current.safetyBriefingEnded = false; // consume flag
      if (isDeparturePhase && telemetry.livery) {
        flagsRef.current.boardingMusicStopped = false;
        flagsRef.current.boardingMusicStarted = true;
        speechManager.playBoardingMusic(telemetry.livery);
      }
    }

    // 3. Arrival music after welcome to airport announcement
    if (flagsRef.current.arrivalWelcomeEnded) {
      flagsRef.current.arrivalWelcomeEnded = false; // consume flag
      if (isArrivalPhase && telemetry.livery) {
        flagsRef.current.boardingMusicStopped = false;
        flagsRef.current.boardingMusicStarted = true;
        speechManager.playBoardingMusic(telemetry.livery);
      }
    }
  }, [telemetry.strobe, telemetry.phase, telemetry.livery, telemetry.name, ambientTrigger]);

  // ─── Boarding music logic (LEGACY / COMMENTED OUT) ────────────────────────
  /*
  useEffect(() => {
    if (!telemetry.name || telemetry.battery === -1) return;

    const anyEngineRunning = Object.values(telemetry.engines || {}).some((s) => s > 0);
    const hasPower = telemetry.battery === 1 || telemetry.apu === 2 || telemetry.gpu === 1;

    if (
      telemetry.onGround &&
      hasPower &&
      telemetry.livery &&
      boardingMusicPrefetchLiveryRef.current !== telemetry.livery
    ) {
      boardingMusicPrefetchLiveryRef.current = telemetry.livery;
      speechManager.preloadBoardingMusic(telemetry.livery);
    }

    const canStartBoardingMusic =
      telemetry.onGround &&
      !anyEngineRunning &&
      telemetry.beacon === 0 &&
      hasPower &&
      telemetry.livery && // Ensure livery has arrived
      telemetry.seatbelt !== 1 &&
      !flagsRef.current.boardingMusicStopped;

    if (canStartBoardingMusic && !flagsRef.current.boardingMusicStarted) {
      flagsRef.current.boardingMusicStarted = true;
      speechManager.playBoardingMusic(telemetry.livery);
    }
    
    // Fallback: stop boarding music if we take off and seatbelt signs were somehow missed
    if (!telemetry.onGround && flagsRef.current.boardingMusicStarted && !flagsRef.current.boardingMusicStopped) {
      flagsRef.current.boardingMusicStopped = true;
      speechManager.stopBoardingMusic();
    }
  }, [
    telemetry.onGround,
    telemetry.engines,
    telemetry.beacon,
    telemetry.battery,
    telemetry.apu,
    telemetry.gpu,
    telemetry.name,
    telemetry.livery,
    telemetry.seatbelt,
  ]);
  */

  // ─── Siren logic (brake + throttle + engines) ──────────────────────────────
  useEffect(() => {
    const anyRunning = Object.values(telemetry.engines || {}).some((s) => s === 2);
    if (anyRunning && telemetry.brakes === 1 && telemetry.throttle > 0.05) {
      speechManager.playSiren();
    }
  }, [telemetry.engines, telemetry.brakes, telemetry.throttle]);

  // ─── Verification Timeout ────────────────────────────────────────────────────
  useEffect(() => {
    let verifyTimer;
    if (connectionStatus === "VERIFYING STATE...") {
      verifyTimer = setTimeout(() => {
        if (isConnectedRef.current && disconnectDeviceRef.current) {
          disconnectDeviceRef.current(true);
        }
      }, 5000);
    }
    return () => clearTimeout(verifyTimer);
  }, [connectionStatus]);

  // ─── Public API ────────────────────────────────────────────────────────────

  const manualConnect = (ip) => {
    if (!ip) return;
    speechManager.speak("Connecting to client.", { tone: "notice" });
    isConnectedRef.current = false; // Allow new connection
    if (connectToIFRef.current) {
      connectToIFRef.current(ip, true);
    }
  };

  const selectDevice = (deviceId) => {
    const dev = discoveredDevices.find((d) => d.deviceId === deviceId);
    if (dev && dev.ip) {
      isConnectedRef.current = false;
      if (connectToIFRef.current) {
        connectToIFRef.current(dev.ip, true);
      }
    }
  };

  const disconnectDevice = (isMainMenuExit = false) => {
    setConnectionStatus("AWAITING SIMULATOR LINK...");
    setConnectedIp("");
    phaseTrackerRef.current = createPhaseTracker();
    phaseSyncRef.current = createPhaseSyncState();
    setTelemetry({ ...INITIAL_TELEMETRY });
    isConnectedRef.current = false;
    ifConnect.close(() => {});

    if (isMainMenuExit && flagsRef.current.isManualConnection) {
      Alert.alert(
        "Simulator in Main Menu",
        "Client is in the main menu. Please enter the game first before connecting.",
        [{ text: "OK" }]
      );
    }
    
    resetAnnouncementState({ isManualConnection: false });
    speechManager.stopAll();
    setTimeout(() => {
      speechManager.speak("Client disconnected.", { tone: "notice" });
    }, 500);
  };

  const resetForConnectingFlight = () => {
    if (!isConnectedRef.current) return;

    const now = Date.now();
    const flags = resetAnnouncementState();
    flags.connectedAt = now;
    resetPhaseState(now);
    speechManager.stopBoardingMusic({ fade: true });
    setTelemetry((prev) => ({ ...prev, phase: PHASE_SYNCING }));
  };

  disconnectDeviceRef.current = disconnectDevice;

  return {
    connectionStatus,
    connectedIp,
    telemetry,
    manualConnect,
    discoveredDevices,
    selectDevice,
    disconnectDevice,
    resetForConnectingFlight,
  };
};
