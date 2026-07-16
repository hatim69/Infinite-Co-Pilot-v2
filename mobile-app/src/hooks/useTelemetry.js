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
import { Alert } from "react-native";
import dgram from "react-native-udp";
import ifConnect from "../utils/ifConnectClient";
import { speechManager } from "../utils/speech";
import { calculatePerformance, getFlapString } from "../utils/calculatePerformance";
import { formatTime } from "../utils/flightMath";

import airportNames from "../utils/airports.json";

const ALTITUDE_CALLOUT_BUFFER_FT = 100;
const AIRSPEED_CALLOUT_BUFFER_KTS = 3;

const crossedThreshold = (previousValue, currentValue, thresholdValue, bufferValue) => {
  const lowerBound = thresholdValue - bufferValue;
  const upperBound = thresholdValue + bufferValue;
  return {
    ascending: previousValue < lowerBound && currentValue >= upperBound,
    descending: previousValue > upperBound && currentValue <= lowerBound,
  };
};

/** All IF Connect API parameters to poll */
const POLL_COMMANDS = [
  "infiniteflight/app_state",
  "aircraft/0/indicated_airspeed",
  "aircraft/0/groundspeed",
  "aircraft/0/vertical_speed",
  "aircraft/0/altitude_msl",
  "aircraft/0/altitude_agl",
  "aircraft/0/systems/landing_gear/state",
  "aircraft/0/systems/battery/main_battery/amp_draw",
  "aircraft/0/systems/battery/main_battery/voltage",
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
  "aircraft/0/systems/autopilot/vnav/on",
  "aircraft/0/ground_services/belt_loader/state",
  "aircraft/0/ground_services/catering/state",
  "aircraft/0/ground_services/gpu/state",
  "aircraft/0/ground_services/pallet_loader/state",
  "aircraft/0/ground_services/stairs/state",
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
  "aircraft/0/systems/engines/0/n1",
  "aircraft/0/systems/engines/1/n1",
  "aircraft/0/systems/engines/2/n1",
  "aircraft/0/systems/engines/3/n1",
  "aircraft/0/systems/parking_brake/state",
  "aircraft/0/systems/engines/0/throttle_lever",
  "aircraft/0/is_on_runway",
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
  msl: null,
  agl: null,
  throttle: 0,
  onGround: true,
  gear: -1,
  flaps: -1,
  brakes: -1,
  spoilers: -1,
  autopilot: -1,
  vnav: -1,
  battery: -1,
  batteryAmp: 0,
  batteryVolts: 0,
  apu: -1,
  pushback: -1,
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
  time: "---",
  airport: "---",
  oat: null,
  onRunway: false,
  destDist: null,
  turbulence: 0,
  performance: null,
  appState: -1,
  phase: "preflight",
};

export const useTelemetry = () => {
  const [connectionStatus, setConnectionStatus] = useState("AWAITING SIMULATOR LINK...");
  const [connectedIp, setConnectedIp] = useState("");
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);

  const stateRef = useRef(telemetry);
  const connectToIFRef = useRef(null);
  const isConnectedRef = useRef(false);
  const disconnectDeviceRef = useRef(null);
  const discoveredDevicesRef = useRef([]);
  const autoConnectTimerRef = useRef(null);

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
    welcomeMessagePlayed: false,
    v1Announced: false,
    vrAnnounced: false,
    v2Announced: false,
    connectedAt: 0,
    isManualConnection: false,
    moderateTurbulenceAnnounced: false,
    severeTurbulenceAnnounced: false,
  });

  // Keep stateRef in sync with latest telemetry
  useEffect(() => {
    stateRef.current = telemetry;
  }, [telemetry]);

  useEffect(() => {
    // ─── 1. UDP Auto-Discovery ──────────────────────────────────────────────
    let discoverySocket;
    try {
      discoverySocket = dgram.createSocket({ type: "udp4", reusePort: true });
      discoverySocket.bind(15000, "0.0.0.0");

      discoverySocket.on("message", (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          if (!data.addresses || data.addresses.length === 0) return;

          const devId = (data.deviceId || data.deviceName || "unknown-device").trim();
          const devName = (data.deviceName || data.deviceId || "Unknown Device").trim();
          const addrs = data.Addresses || data.addresses || [];

          // Prefer private-network IPs
          let ip = addrs[0]?.trim() || "";
          for (const a of addrs) {
            const trimmed = a.trim();
            if (
              trimmed.startsWith("192.168.") ||
              trimmed.startsWith("10.") ||
              trimmed.startsWith("172.")
            ) {
              ip = trimmed;
              break;
            }
          }
          if (!ip) return;

          const exists = discoveredDevicesRef.current.find((d) => d.deviceId === devId);
          if (!exists) {
            discoveredDevicesRef.current.push({ deviceId: devId, deviceName: devName, ip });
            setDiscoveredDevices([...discoveredDevicesRef.current]);
          }

          // If State is not 1 (or "Playing"), we assume it's in the menu
          const stateStr = String(data.State || data.state || data.AppState || data.appState);
          const isReady = stateStr === "1" || stateStr === "Playing";

          // Auto-connect after 1.5s only if there's exactly 1 device discovered
          if (!isConnectedRef.current && connectToIFRef.current && isReady) {
            if (!autoConnectTimerRef.current) {
              autoConnectTimerRef.current = setTimeout(() => {
                if (discoveredDevicesRef.current.length === 1 && !isConnectedRef.current && connectToIFRef.current) {
                  connectToIFRef.current(discoveredDevicesRef.current[0].ip, false);
                }
                autoConnectTimerRef.current = null;
              }, 1500);
            }
          } else if (isConnectedRef.current && !isReady) {
            // Simulator broadcasted that it's in the menu! Instant disconnect.
            if (disconnectDeviceRef.current) {
              disconnectDeviceRef.current();
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
      const state = stateRef.current;
      const flags = flagsRef.current;

      // Gate announcements — suppress first 2.5 seconds after connect
      const speak = (msg, options = {}) => {
        if (!flags.connectedAt || Date.now() - flags.connectedAt < 2500) return;
        const opts = typeof options === 'string' ? { tone: options } : { tone: "callout", ...options };
        speechManager.speak(msg, opts);
      };

      setTelemetry((prev) => {
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
              isConnectedRef.current = false;
              ifConnect.close(() => {});
              setConnectionStatus("AWAITING SIMULATOR LINK...");
              setConnectedIp("");
              setTelemetry({ ...INITIAL_TELEMETRY });
              if (flagsRef.current.isManualConnection) {
                Alert.alert(
                  "Simulator in Main Menu",
                  "Client is in the main menu. Please enter the game first before connecting.",
                  [{ text: "OK" }]
                );
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
            const crossing = crossedThreshold(prevKts, kts, 80, AIRSPEED_CALLOUT_BUFFER_KTS);
            if (state.onGround && crossing.ascending && !flags.eightyKnots) {
              speak("80 knots", "callout");
              flags.eightyKnots = true;
            }

            if (state.onGround && state.performance) {
              if (kts >= state.performance.v1 && !flags.v1Announced) {
                speak("V1", "callout");
                flags.v1Announced = true;
              }
              if (kts >= state.performance.vr && !flags.vrAnnounced) {
                speak("Rotate", "callout");
                flags.vrAnnounced = true;
              }
              if (kts >= state.performance.v2 && !flags.v2Announced) {
                speak("V2", "callout");
                flags.v2Announced = true;
              }
            }
          }
        }

        // ── Ground speed ─────────────────────────────────────────────────
        if (command === "aircraft/0/groundspeed") {
          const gs = data * 1.94384;
          updateNext("gs", gs);

          if (state.onGround && flags.hasFlown && gs < 30 && !flags.welcome) {
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
            speechManager.speakWithPollyFallback(welcomeText, pollyVoice, { tone: "briefing" });
            flags.welcome = true;
          }
        }

        // ── Vertical speed ───────────────────────────────────────────────
        if (command === "aircraft/0/vertical_speed") {
          updateNext("vs", data * 196.85);
        }

        // ── Altitude MSL ─────────────────────────────────────────────────
        if (command === "aircraft/0/altitude_msl") {
          const prevMsl = state.msl;
          updateNext("msl", data);

          if (prevMsl !== null) {
            const alt = (threshold) =>
              crossedThreshold(prevMsl, data, threshold, ALTITUDE_CALLOUT_BUFFER_FT);

            if (alt(5000).ascending && !flags.alt5k) {
              speak("Passing 5,000", "notice");
              flags.alt5k = true;
            }
            if (alt(5000).descending && flags.alt5k) {
              speak("Passing 5,000", "notice");
              flags.alt5k = false;
            }
            if (alt(10000).ascending && !flags.alt10k) {
              speak("Passing 10,000. Landing lights off.", "caution");
              flags.alt10k = true;
            }
            if (alt(10000).descending && flags.alt10k) {
              speak("Passing 10,000.", "notice");
              flags.alt10k = false;
            }
            if (alt(15000).ascending && !flags.alt15k) {
              speak("Passing 15,000.", "notice");
              flags.alt15k = true;
            }
            if (alt(15000).descending && flags.alt15k) {
              speak("Passing 15,000.", "notice");
              flags.alt15k = false;
            }
            if (alt(24000).ascending && !flags.alt24k) {
              speak("Passing 24,000.", "notice");
              flags.alt24k = true;
            }
            if (alt(24000).descending && flags.alt24k) {
              speak("Passing 24,000.", "notice");
              flags.alt24k = false;
            }
          }
        }

        // ── Altitude AGL (positive rate) ─────────────────────────────────
        if (command === "aircraft/0/altitude_agl") {
          const prevAgl = state.agl;
          const agl = data * 3.28084;
          updateNext("agl", agl);

          if (prevAgl !== null) {
            const perf = calculatePerformance(state.name, state.weight);
            const flySpeed = perf.v2 > 60 ? perf.v2 : 130;
            if (
              !state.onGround &&
              state.vs > 300 &&
              agl >= 300 &&
              state.ias >= flySpeed &&
              !flags.positiveRate
            ) {
              speak("Positive rate. Gear up.", "callout");
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

          if (isSevere && !flags.severeTurbulenceAnnounced) {
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

            speak(announcement, { tone: "briefing", withChime: true });

          } else if (isModerate && !flags.moderateTurbulenceAnnounced) {
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

            speak(announcement, { tone: "briefing", withChime: true });

          } else if (factor < 0.10) {
            // Turbulence has cleared — reset flags so the next bout can be announced
            if (flags.moderateTurbulenceAnnounced || flags.severeTurbulenceAnnounced) {
              flags.moderateTurbulenceAnnounced = false;
              flags.severeTurbulenceAnnounced = false;
              console.log("[Turbulence] Factor dropped below 0.10 — announcement flags reset.");
            }
          }
        }

        // ── Battery ──────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/battery/main_battery/amp_draw") {
          updateNext("batteryAmp", data);
          const isOn = (data || 0) > 0 || (state.batteryVolts || 0) > 12;
          updateNext("battery", isOn ? 1 : 0);
        }
        if (command === "aircraft/0/systems/battery/main_battery/voltage") {
          updateNext("batteryVolts", data);
          const isOn = (state.batteryAmp || 0) > 0 || (data || 0) > 12;
          updateNext("battery", isOn ? 1 : 0);
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


        // ── Pushback ─────────────────────────────────────────────────────
        if (command === "aircraft/0/is_pushback_active") {
          const on = data === 1 || data === true;
          if (state.pushback === 0 && on) speak("Pushback started.", "notice");
          else if (state.pushback === 1 && !on) speak("Pushback ended.", "notice");
          updateNext("pushback", on ? 1 : 0);
        }

        // ── Runway / Destination ───────────────────────────────────────
        if (command === "aircraft/0/is_on_runway") {
          updateNext("onRunway", data === 1 || data === true);
        }
        if (command === "aircraft/0/location/destination_distance") {
          // Value arrives in metres; convert to nautical miles
          const nm = typeof data === "number" ? data / 1852 : null;
          updateNext("destDist", nm);
        }

        // ── Autopilot ─────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/autopilot/on") {
          const on = data === 1 || data === true;
          if (state.autopilot === 0 && on) speak("Autopilot on.", "notice");
          else if (state.autopilot === 1 && !on) speak("Autopilot off.", "notice");
          updateNext("autopilot", on ? 1 : 0);
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
            if (key === "strobe" && on && state.onGround && !flags.vSpeedBriefed && state.weight > 0) {
              flags.vSpeedBriefed = true;
              speechManager.stopBoardingAnnouncement();
              speak("Cabin crew prepare for take off.", "notice");
            }
          }
          updateNext(key, val);
        }

        // ── Signs ─────────────────────────────────────────────────────────
        if (command === "aircraft/0/systems/signs/seatbelt") {
          const on = data === 1 || data === true;
          const val = on ? 1 : 0;
          if (state.seatbelt !== -1 && val !== state.seatbelt) {
            if (on && state.onGround && !flags.boardingAnnouncementPlayed) {
              flags.boardingAnnouncementPlayed = true;
              speechManager.playBoardingAnnouncement(state.livery);
            } else {
              speak(`Seatbelt signs ${on ? "on" : "off"}.`, { tone: "notice", withChime: true });
            }
          }
          updateNext("seatbelt", val);
        }

        if (command === "aircraft/0/systems/signs/no_smoking") {
          const on = data === 1 || data === true;
          const val = on ? 1 : 0;
          if (state.smoking !== -1 && val !== state.smoking) {
            speak(`No smoking signs ${on ? "on" : "off"}.`, { tone: "notice", withChime: true });
          }
          updateNext("smoking", val);
        }

        // ── Landing Gear ──────────────────────────────────────────────────
        if (command === "aircraft/0/systems/landing_gear/state") {
          const isDown = data === 1;
          const isUp = data === 2 || data === 5 || data === 0;
          if (state.gear !== -1 && data !== state.gear) {
            if (isDown && state.gear !== 1) speak("Gears down.", "callout");
            else if (isUp && !(state.gear === 2 || state.gear === 5 || state.gear === 0))
              speak("Landing gear up.", "callout");
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
          if (data !== state.flaps && state.name !== "" && state.flaps !== -1) {
            speak(`Flaps ${getFlapString(state.name, data)}.`, "callout");
          }
          updateNext("flaps", data);
        }

        // ── Welcome message (triggered when we have enough data) ──────────
        if (
          !flags.welcomeMessagePlayed &&
          next.name !== "" &&
          next.weight > 0 &&
          next.onGround !== undefined &&
          next.time !== "---"
        ) {
          flags.welcomeMessagePlayed = true;
          speechManager.speak(
            next.onGround
              ? "Welcome to the flight Captain."
              : "Welcome back to the flight Captain.",
            { tone: "briefing" }
          );
        }

        // ── Recalculate performance if aircraft/weight changed ────────────
        if (updated && next.name && next.weight) {
          next.performance = calculatePerformance(next.name, next.weight);
        }

        // ── Phase derivation (runs every update) ──────────────────────────────
        //
        // All 12 phases from the IF Connect API reference chart, evaluated
        // in priority order against the fully-updated `next` snapshot.
        //
        // Phases:
        //   preflight  — before any ground service connects
        //   boarding   — on ground + GS≈0 + stairs connected + not yet flown
        //   de-boarding — on ground + GS≈0 + stairs connected + flight finished
        //   pushback   — on ground + pushback active
        //   taxi_out   — on ground + off runway + 0<GS<35 + not yet flown
        //   takeoff    — on ground + on runway + GS>45
        //   initial_climb — airborne + VS>500 fpm + MSL≤5000 ft
        //   climb      — airborne + VS>500 fpm + MSL>5000 ft
        //   cruise     — airborne + MSL>10000 ft + VS between −100 and +100 fpm
        //   descent    — airborne + VS<−500 fpm + dest>15 nm
        //   approach   — airborne + dest≤15 nm + MSL<5000 ft
        //   landing    — on ground + on runway + GS>40 (was approach)
        //   taxi_in    — on ground + GS<35 + flight finished
        if (updated) {
          const s = next; // alias for readability
          const gs = s.gs ?? 0;
          const vs = s.vs ?? 0;
          const msl = s.msl ?? 0;
          const destNm = s.destDist; // null if no FPL set

          let newPhase = s.phase; // sticky by default

          if (s.onGround) {
            // ── Ground phases ──────────────────────────────────────────────
            const stairsDown = s.stairs === 1;
            const gsNearZero = gs < 2;

            if (s.onRunway && gs > 40 && flags.hasFlown) {
              // Landing (Touchdown) — came from approach, now rolling on runway
              newPhase = "landing";
            } else if (s.onRunway && gs > 45 && !flags.hasFlown) {
              // Takeoff roll — on runway, fast, hasn't flown yet
              newPhase = "takeoff";
            } else if (s.pushback === 1) {
              // Pushback overrides everything else on the ground
              newPhase = "pushback";
            } else if (stairsDown && gsNearZero && flags.hasFlown) {
              // De-boarding — flight is complete, stairs are out
              newPhase = "de-boarding";
            } else if (stairsDown && gsNearZero && !flags.hasFlown) {
              // Boarding — still pre-departure, stairs connected
              newPhase = "boarding";
            } else if (gs > 2 && gs < 35 && !s.onRunway && flags.hasFlown) {
              // Taxi inbound — slow ground movement after landing
              newPhase = "taxi_in";
            } else if (gs > 2 && gs < 35 && !s.onRunway && !flags.hasFlown) {
              // Taxi outbound — slow ground movement before departure
              newPhase = "taxi_out";
            } else if (s.onRunway && gs <= 45 && !flags.hasFlown) {
              // Holding on runway / lining up before takeoff roll
              newPhase = "taxi_out";
            }
            // Otherwise keep the last phase (e.g. brief GS gap during turns)
          } else {
            // ── Airborne phases ───────────────────────────────────────────
            if (vs > 500 && msl <= 5000) {
              newPhase = "initial_climb";
            } else if (vs > 500 && msl > 5000) {
              newPhase = "climb";
            } else if (msl > 10000 && vs >= -100 && vs <= 100) {
              newPhase = "cruise";
            } else if (vs < -500 && (destNm === null || destNm > 15)) {
              newPhase = "descent";
            } else if (destNm !== null && destNm <= 15 && msl < 5000) {
              newPhase = "approach";
            }
            // Gaps (e.g. levelling during climb) stay on the previous phase
          }

          updateNext("phase", newPhase);
        }

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

      // Reset all telemetry & flags
      setTelemetry({ ...INITIAL_TELEMETRY });
      const flags = flagsRef.current;
      Object.keys(flags).forEach((k) => {
        if (typeof flags[k] === "boolean") flags[k] = false;
        if (typeof flags[k] === "number") flags[k] = 0;
      });
      flags.isManualConnection = isManual;

      // Close any existing connection, then connect fresh
      ifConnect.close(() => {
        ifConnect.init(
          () => {
            // Success — register all poll commands, but stay in VERIFYING until app_state or aircraft name is received
            setConnectionStatus("VERIFYING STATE...");
            flags.connectedAt = Date.now();
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
      setTelemetry({ ...INITIAL_TELEMETRY });
      isConnectedRef.current = false;
      ifConnect.close(() => {});
      speechManager.stopAll();
      speechManager.speak("Client disconnected.", { tone: "notice" });
    };

    const disconnectHandler = () => {
      setConnectionStatus("AWAITING SIMULATOR LINK...");
      setConnectedIp("");
      setTelemetry({ ...INITIAL_TELEMETRY });
      isConnectedRef.current = false;
      ifConnect.close(() => {});
      speechManager.stopAll();
      speechManager.speak("Client disconnected.", { tone: "notice" });
    };

    const reconnectHandler = () => {
      setConnectionStatus("VERIFYING STATE...");
      flagsRef.current.connectedAt = Date.now();
    };

    ifConnect.on("error", errorHandler);
    ifConnect.on("disconnect", disconnectHandler);
    ifConnect.on("connect", reconnectHandler);

    // ─── 5. Cleanup ───────────────────────────────────────────────────────
    return () => {
      try {
        if (discoverySocket) discoverySocket.close();
      } catch (e) {}
      ifConnect.off("data", dataHandler);
      ifConnect.off("error", errorHandler);
      ifConnect.off("disconnect", disconnectHandler);
      ifConnect.off("connect", reconnectHandler);
      ifConnect.close(() => {});
    };
  }, []);

  // ─── Boarding music logic ───────────────────────────────────────────────────
  useEffect(() => {
    if (!telemetry.name || telemetry.battery === -1) return;

    const anyEngineRunning = Object.values(telemetry.engines || {}).some((s) => s > 0);
    const hasPower = telemetry.battery === 1 || telemetry.apu === 2 || telemetry.gpu === 1;

    const isBoardingPhase =
      telemetry.onGround &&
      !anyEngineRunning &&
      telemetry.beacon === 0 &&
      hasPower &&
      telemetry.livery && // Ensure livery has arrived
      !flagsRef.current.boardingAnnouncementPlayed;

    if (isBoardingPhase) {
      speechManager.playBoardingMusic(telemetry.livery);
    } else {
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
  ]);

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
        if (isConnectedRef.current) {
          isConnectedRef.current = false;
          ifConnect.close(() => {});
          setConnectionStatus("AWAITING SIMULATOR LINK...");
          setConnectedIp("");
          setTelemetry({ ...INITIAL_TELEMETRY });
        }
      }, 5000);
    }
    return () => clearTimeout(verifyTimer);
  }, [connectionStatus]);

  // ─── Public API ────────────────────────────────────────────────────────────

  const manualConnect = (ip) => {
    if (!ip) return;
    speechManager.speak(`Connecting to ${ip}.`, { tone: "notice" });
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

  const disconnectDevice = () => {
    isConnectedRef.current = false;
    ifConnect.close(() => {});
    setConnectionStatus("AWAITING SIMULATOR LINK...");
    setConnectedIp("");
    setTelemetry({ ...INITIAL_TELEMETRY });
    speechManager.stopAll();
    speechManager.speak("Client disconnected.", { tone: "notice" });
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
  };
};
