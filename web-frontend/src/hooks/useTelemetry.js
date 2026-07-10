import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { speechManager } from "../utils/speech";
import { calculatePerformance, getFlapString } from "../utils/calculatePerformance";
import { formatTime } from "../utils/flightMath";

const SOCKET_URL =
	import.meta.env.VITE_WEBSOCKET_URL || "http://localhost:3000";

const airportCities = {
	KJFK: "New York",
	KLAX: "Los Angeles",
	EGLL: "London",
	LFPG: "Paris",
	EDDF: "Frankfurt",
	RJTT: "Tokyo",
	OMDB: "Dubai",
	VHHH: "Hong Kong",
	WSSS: "Singapore",
	YSSY: "Sydney",
	KSFO: "San Francisco",
	KORD: "Chicago",
};

// Adjust these if you want threshold callouts to be more or less strict near the edge.
const ALTITUDE_CALLOUT_BUFFER_FT = 100;
const AIRSPEED_CALLOUT_BUFFER_KTS = 3;

const crossedThreshold = (
	previousValue,
	currentValue,
	thresholdValue,
	bufferValue,
) => {
	const lowerBound = thresholdValue - bufferValue;
	const upperBound = thresholdValue + bufferValue;

	return {
		ascending: previousValue < lowerBound && currentValue >= upperBound,
		descending: previousValue > upperBound && currentValue <= lowerBound,
	};
};

export const useTelemetry = () => {
	const [connectionStatus, setConnectionStatus] = useState(
		"AWAITING SIMULATOR LINK...",
	);
	const [connectedIp, setConnectedIp] = useState("");
	const [socketInstance, setSocketInstance] = useState(null);
	const [discoveredDevices, setDiscoveredDevices] = useState([]);

	const [telemetry, setTelemetry] = useState({
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
		performance: null,
	});

	const stateRef = useRef(telemetry);
	const flagsRef = useRef({
		eightyKnots: false,
		vSpeedBriefed: false,
		positiveRate: false,
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
	});

	useEffect(() => {
		stateRef.current = telemetry;
	}, [telemetry]);

	useEffect(() => {
		const socket = io(SOCKET_URL);
		setSocketInstance(socket);

		socket.on("discovered_devices", (devices) => {
			setDiscoveredDevices(devices);
		});

		socket.on("connection_status", (data) => {
			if (data.status === "connected") {
				setConnectionStatus("FLIGHT LINK ACTIVE");
				setConnectedIp(data.ip);
				
				// Reset all flags for the new session
				const flags = flagsRef.current;
				flags.eightyKnots = false;
				flags.vSpeedBriefed = false;
				flags.positiveRate = false;
				flags.welcome = false;
				flags.alt5k = false;
				flags.alt10k = false;
				flags.alt15k = false;
				flags.alt24k = false;
				flags.boardingAnnouncementPlayed = false;
				flags.welcomeMessagePlayed = false;
				flags.v1Announced = false;
				flags.vrAnnounced = false;
				flags.v2Announced = false;
				flags.connectedAt = Date.now();
				
				// Stop any playing music
				speechManager.stopBoardingMusic();
				
			} else if (data.status === "connecting") {
				setConnectionStatus("CONNECTING...");
				setConnectedIp(data.ip);
				speechManager.stopBoardingMusic();
				window.speechSynthesis.cancel();
			} else {
				setConnectionStatus("AWAITING SIMULATOR LINK...");
				setConnectedIp("");
				speechManager.stopBoardingMusic();
				window.speechSynthesis.cancel();
			}
		});

		socket.on("telemetry_update", (p) => {
			const { command, data } = p;
			const state = stateRef.current;
			const flags = flagsRef.current;
			const speak = (msg, tone = "callout", bypassMute = false) => {
				if (!bypassMute && (!flags.connectedAt || Date.now() - flags.connectedAt < 2500)) return;
				speechManager.speak(msg, { tone });
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

				if (command === "aircraft/0/name") updateNext("name", data);
				if (command === "aircraft/0/livery") updateNext("livery", data);
				if (command === "aircraft/0/systems/load/total_weight")
					updateNext("weight", data);
				if (command === "aircraft/0/is_on_ground")
					updateNext("onGround", data);
				if (command === "aircraft/0/systems/engines/0/throttle_lever")
					updateNext("throttle", data);

				if (command === "aircraft/0/indicated_airspeed") {
					const previousAirspeedKts = state.ias;
					const kts = data * 1.94384;
					updateNext("ias", kts);
					
					if (previousAirspeedKts !== null) {
						const airspeedCrossing = crossedThreshold(
							previousAirspeedKts,
							kts,
							80,
							AIRSPEED_CALLOUT_BUFFER_KTS,
						);

						if (
							state.onGround &&
							airspeedCrossing.ascending &&
							!flags.eightyKnots
						) {
							speak("80 knots", "callout");
							flags.eightyKnots = true;
						}
						
						// V-Speed Callouts
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

				if (command === "aircraft/0/groundspeed") {
					const gs = data * 1.94384;
					updateNext("gs", gs);

					if (
						state.onGround &&
						gs < 30 &&
						flags.vSpeed === true &&
						!flags.welcome
					) {
						const cityName =
							airportCities[state.airport] ||
							state.airport ||
							"your destination";
						speak(
							`Ladies and gentlemen, welcome to ${cityName}. The local time is ${state.time}. Please remain seated with your seatbelt fastened until the aircraft has come to a complete stop.`,
							"briefing",
						);
						flags.welcome = true;
					}
				}

				if (command === "aircraft/0/vertical_speed") {
					const fpm = data * 196.85;
					updateNext("vs", fpm);
				}

				if (command === "aircraft/0/altitude_msl") {
					const previousAltitudeFt = state.msl;
					updateNext("msl", data);
					
					if (previousAltitudeFt !== null) {
						const altitudeCrossing = (thresholdFt) =>
							crossedThreshold(
								previousAltitudeFt,
								data,
								thresholdFt,
								ALTITUDE_CALLOUT_BUFFER_FT,
							);

						if (altitudeCrossing(5000).ascending && !flags.alt5k) {
							speak("Passing 5,000", "notice");
							flags.alt5k = true;
						}
						if (altitudeCrossing(5000).descending && flags.alt5k) {
							speak("Passing 5,000", "notice");
							flags.alt5k = false;
						}

						if (altitudeCrossing(10000).ascending && !flags.alt10k) {
							speak("Passing 10,000. Landing lights off.", "caution");
							flags.alt10k = true;
						}
						if (altitudeCrossing(10000).descending && flags.alt10k) {
							speak("Passing 10,000.", "notice");
							flags.alt10k = false;
						}

						if (altitudeCrossing(15000).ascending && !flags.alt15k) {
							speak("Passing 15,000.", "notice");
							flags.alt15k = true;
						}
						if (altitudeCrossing(15000).descending && flags.alt15k) {
							speak("Passing 15,000.", "notice");
							flags.alt15k = false;
						}

						if (altitudeCrossing(24000).ascending && !flags.alt24k) {
							speak("Passing 24,000.", "notice");
							flags.alt24k = true;
						}
						if (altitudeCrossing(24000).descending && flags.alt24k) {
							speak("Passing 24,000.", "notice");
							flags.alt24k = false;
						}
					}
				}

				if (command === "aircraft/0/altitude_agl") {
					const previousAgl = state.agl;
					const agl = data * 3.28084;
					updateNext("agl", agl);
					
					if (previousAgl !== null) {
						// Reimplement positive rate for V2 flyaway limit (from friend's code)
						const speeds = calculatePerformance(state.name, state.weight);
						const properFlyawaySpeed = speeds.v2 > 60 ? speeds.v2 : 130;
						if (!state.onGround && state.vs > 300 && agl >= 300 && state.ias >= properFlyawaySpeed && !flags.positiveRate) {
							speak("Positive rate. Gear up.", "callout");
							flags.positiveRate = true;
						}
					}
				}

				if (command === "simulator/time_local") {
					updateNext("time", formatTime(data));
				}

				if (command === "infiniteflight/nearest_airport") {
					updateNext("airport", data);
				}

				if (
					command ===
					"aircraft/0/systems/battery/main_battery/amp_draw"
				) {
					updateNext("batteryAmp", data);
					const amp = data || 0;
					const volts = state.batteryVolts || 0;
					const isOn = amp > 0 || volts > 12;
					updateNext("battery", isOn ? 1 : 0);
				}

				if (
					command ===
					"aircraft/0/systems/battery/main_battery/voltage"
				) {
					updateNext("batteryVolts", data);
					const amp = state.batteryAmp || 0;
					const volts = data || 0;
					const isOn = amp > 0 || volts > 12;
					updateNext("battery", isOn ? 1 : 0);
				}

				if (command === "aircraft/0/systems/apu/apu/state") {
					if (state.apu !== -1 && data !== state.apu) {
						if (data === 0) speak("APU off.", "notice");
						else if (data === 1) speak("APU starting.", "briefing");
						else if (data === 2) speak("APU on.", "notice");
					}
					updateNext("apu", data);
				}

				const n1Match = command.match(/^aircraft\/0\/systems\/engines\/(\d+)\/n1$/);
				if (n1Match) {
					const engNum = parseInt(n1Match[1], 10) + 1;
					// Normalize IF raw N1 float (e.g. 0.200) to a standard 0-100 percentage
					const currentN1 = data * 100;
					
					let currentState = state.engines[engNum] !== undefined ? state.engines[engNum] : 0;
					let nextState = currentState;

					if (currentState === 0) {
						if (currentN1 >= 1.0) {
							speak(`Engine ${engNum} starting.`, "briefing");
							nextState = 1;
						}
					} else if (currentState === 1) {
						if (currentN1 >= 18.0) {
							speak(`Engine ${engNum} started.`, "notice");
							nextState = 2;
						} else if (currentN1 < 0.5) {
							speak(`Engine ${engNum} shutdown.`, "notice");
							nextState = 0;
						}
					} else if (currentState === 2) {
						if (currentN1 < 5.0) {
							speak(`Engine ${engNum} shutting down.`, "notice");
							nextState = 3;
						}
					} else if (currentState === 3) {
						if (currentN1 < 0.5) {
							speak(`Engine ${engNum} shutdown.`, "notice");
							nextState = 0;
						} else if (currentN1 >= 15.0) {
							speak(`Engine ${engNum} started.`, "notice");
							nextState = 2;
						}
					}

					if (next.engines[engNum] !== nextState) {
						next.engines = { ...next.engines, [engNum]: nextState };
						updated = true;
					}
				}

				if (command === "aircraft/0/is_pushback_active") {
					const isPushing = data === 1 || data === true;
					if (state.pushback === 0 && isPushing)
						speak("Pushback started.", "notice");
					else if (state.pushback === 1 && !isPushing)
						speak("Pushback ended.", "notice");
					updateNext("pushback", isPushing ? 1 : 0);
				}

				if (command === "aircraft/0/systems/autopilot/on") {
					const isAuto = data === 1 || data === true;
					if (state.autopilot === 0 && isAuto)
						speak("Autopilot on.", "notice");
					else if (state.autopilot === 1 && !isAuto)
						speak("Autopilot off.", "notice");
					updateNext("autopilot", isAuto ? 1 : 0);
				}

				if (command === "aircraft/0/systems/autopilot/vnav/on") {
					const isVnav = data === 1 || data === true;
					if (state.vnav === 0 && isVnav)
						speak("VNAV on.", "notice");
					else if (state.vnav === 1 && !isVnav)
						speak("VNAV off.", "notice");
					updateNext("vnav", isVnav ? 1 : 0);
				}

				if (command.startsWith("aircraft/0/ground_services/") && !command.includes("pushback")) {
					const isServiceOn = data === 1 || data === true;
					
					if (command.includes("belt_loader")) {
						if (state.beltLoader === 0 && isServiceOn) speak("Belt loader connected.", "notice");
						else if (state.beltLoader === 1 && !isServiceOn) speak("Belt loader disconnected.", "notice");
						updateNext("beltLoader", isServiceOn ? 1 : 0);
					}
					else if (command.includes("catering")) {
						if (state.catering === 0 && isServiceOn) speak("Catering truck connected.", "notice");
						else if (state.catering === 1 && !isServiceOn) speak("Catering truck disconnected.", "notice");
						updateNext("catering", isServiceOn ? 1 : 0);
					}
					else if (command.includes("gpu")) {
						if (state.gpu === 0 && isServiceOn) speak("GPU connected.", "notice");
						else if (state.gpu === 1 && !isServiceOn) speak("GPU disconnected.", "notice");
						updateNext("gpu", isServiceOn ? 1 : 0);
					}
					else if (command.includes("pallet_loader")) {
						if (state.palletLoader === 0 && isServiceOn) speak("Pallet loader connected.", "notice");
						else if (state.palletLoader === 1 && !isServiceOn) speak("Pallet loader disconnected.", "notice");
						updateNext("palletLoader", isServiceOn ? 1 : 0);
					}
					else if (command.includes("stairs")) {
						if (state.stairs === 0 && isServiceOn) speak("Stairs connected.", "notice");
						else if (state.stairs === 1 && !isServiceOn) speak("Stairs disconnected.", "notice");
						updateNext("stairs", isServiceOn ? 1 : 0);
					}
				}

				const lightMap = {
					"aircraft/0/systems/beacon_lights_switch": {
						key: "beacon",
						name: "Beacon lights",
					},
					"aircraft/0/systems/nav_lights_switch": {
						key: "nav",
						name: "Navigation lights",
					},
					"aircraft/0/systems/strobe_lights_switch": {
						key: "strobe",
						name: "Strobe lights",
					},
					"aircraft/0/systems/landing_lights_switch": {
						key: "landing",
						name: "Landing lights",
					},
				};
				if (lightMap[command]) {
					const info = lightMap[command];
					const isOn = data === 1 || data === true;
					const stateValue = isOn ? 1 : 0;
					if (
						state[info.key] !== -1 &&
						state[info.key] !== stateValue
					) {
						speak(`${info.name} ${isOn ? "on" : "off"}.`, "notice");
						
						if (info.key === "strobe" && isOn && state.onGround && !flags.vSpeedBriefed && state.weight > 0) {
							flags.vSpeedBriefed = true;
							speak("Cabin crew prepare for take off.", "notice");
						}
					}
					updateNext(info.key, stateValue);
				}

				if (command === "aircraft/0/systems/signs/seatbelt") {
					const isOn = data === 1 || data === true;
					const stateValue = isOn ? 1 : 0;
					if (state.seatbelt !== -1 && stateValue !== state.seatbelt) {
						const chime = new Audio('/chime.mp3');
						
						// Play boarding announcement when seatbelts are first turned on, on the ground
						if (isOn && state.onGround && !flags.boardingAnnouncementPlayed) {
							flags.boardingAnnouncementPlayed = true;
							speechManager.stopBoardingMusic();
							chime.onended = () => {
								setTimeout(() => {
									const getAnnouncementFile = (livery) => {
										const l = (livery || '').toLowerCase();
										if (l.includes('air canada')) return 'air-canada.mp3';
										if (l.includes('air france')) return 'air-france.mp3';
										if (l.includes('air india')) return 'air-india.mp3';
										if (l.includes('british airways')) return 'british-airways.mp3';
										if (l.includes('delta')) return 'delta.mp3';
										if (l.includes('emirates')) return 'emirates.mp3';
										if (l.includes('indigo')) return 'indigo.mp3';
										if (l.includes('lufthansa')) return 'lufthansa.mp3';
										if (l.includes('qatar')) return 'qatar.mp3';
										if (l.includes('singapore')) return 'singapore-airlines.mp3';
										if (l.includes('turkish')) return 'turkish-airlines.mp3';
										return 'fallback.mp3'; // Default fallback
									};
									const file = getAnnouncementFile(state.livery);
									const audio = new Audio(`/announcements/${file}`);
									audio.onended = () => {
										speechManager.setDucking(false);
										setTimeout(() => {
											new Audio('/chime.mp3').play().catch(e => console.error("End chime failed:", e));
										}, 1500);
									};
									speechManager.setDucking(true);
									audio.play().catch(e => {
										speechManager.setDucking(false);
										console.error("Boarding announcement play failed:", e);
									});
								}, 1500);
							};
							chime.play().catch(e => console.error("Start chime failed:", e));
							speak(`Seatbelt signs on.`, "notice");
						} else {
							chime.play().catch(e => console.error("Chime failed:", e));
							speak(`Seatbelt signs ${isOn ? "on" : "off"}.`, "notice");
						}
					}
					updateNext("seatbelt", stateValue);
				}

				if (command === "aircraft/0/systems/signs/no_smoking") {
					const isOn = data === 1 || data === true;
					const stateValue = isOn ? 1 : 0;
					if (state.smoking !== -1 && stateValue !== state.smoking) {
						new Audio('/chime.mp3').play().catch(e => console.error("Chime failed:", e));
						speak(
							`No smoking signs ${isOn ? "on" : "off"}.`,
							"notice",
						);
					}
					updateNext("smoking", stateValue);
				}

				if (command === "aircraft/0/systems/landing_gear/state") {
					const isDown = data === 1;
					const isUp = data === 2 || data === 5 || data === 0;
					if (state.gear !== -1 && data !== state.gear) {
						if (isDown && state.gear !== 1)
							speak("Gears down.", "callout");
						else if (
							isUp &&
							!(
								state.gear === 2 ||
								state.gear === 5 ||
								state.gear === 0
							)
						)
							speak("Landing gear up.", "callout");
					}
					updateNext("gear", data);
				}

				if (command === "aircraft/0/systems/parking_brake/state") {
					const isSet = data === 1 || data === true;
					const stateValue = isSet ? 1 : 0;
					if (state.brakes !== -1 && stateValue !== state.brakes) {
						if (isSet) speak("Parking brakes set.", "notice");
						else speak("Parking brakes released.", "notice");
					}
					updateNext("brakes", stateValue);
				}

				if (command === "aircraft/0/systems/spoilers/state") {
					const map = { 0: "OFF", 1: "FLIGHT", 2: "ARMED" };
					if (state.spoilers !== -1 && state.spoilers !== data)
						speak(
							`Spoilers ${map[data] ? map[data].toLowerCase() : data}.`,
							"notice",
						);
					updateNext("spoilers", data);
				}

				if (command === "aircraft/0/systems/flaps/state") {
					if (data !== state.flaps && state.name !== "" && state.flaps !== -1) {
						const callout = getFlapString(state.name, data);
						speak(`Flaps ${callout}.`, "callout");
					}
					updateNext("flaps", data);
				}

				if (!flags.welcomeMessagePlayed && state.name !== "" && state.weight > 0 && state.onGround !== undefined && state.time !== "---") {
					flags.welcomeMessagePlayed = true;
					if (state.onGround) {
						speechManager.speak("Welcome to the flight Captain.", { tone: "briefing" });
					} else {
						speechManager.speak("Welcome back to the flight Captain.", { tone: "briefing" });
					}
				}

				if (updated) {
					if (next.name && next.weight) {
						next.performance = calculatePerformance(next.name, next.weight);
					}
					return next;
				}
				return prev;
			});
		});

		return () => {
			socket.disconnect();
		};
	}, []);

	// Effect for boarding music logic
	useEffect(() => {
		// Only evaluate after initial data is somewhat populated
		if (telemetry.name && telemetry.battery !== -1) {
			const anyEngineRunning = Object.values(telemetry.engines || {}).some(s => s > 0);
			const hasPower = telemetry.battery === 1 || telemetry.apu === 2 || telemetry.gpu === 1;
			
			// If beacon is on, or any engine is running, we are definitely NOT boarding.
			// Also stop when boarding announcement has played (which happens when seatbelts turn on).
			const isBoardingPhase = telemetry.onGround 
				&& !anyEngineRunning 
				&& telemetry.beacon === 0 
				&& hasPower 
				&& !flagsRef.current.boardingAnnouncementPlayed;
			
			if (isBoardingPhase) {
				speechManager.playBoardingMusic(telemetry.livery);
			} else {
				speechManager.stopBoardingMusic();
			}
		}
	}, [
		telemetry.onGround, 
		telemetry.engines, 
		telemetry.beacon, 
		telemetry.battery, 
		telemetry.apu, 
		telemetry.gpu, 
		telemetry.name,
		telemetry.livery
	]);

	// Effect for siren logic
	useEffect(() => {
		const anyEngineRunning = Object.values(telemetry.engines || {}).some(
			(engineState) => engineState === 2,
		);
		if (
			anyEngineRunning &&
			telemetry.brakes === 1 &&
			telemetry.throttle > 0.05
		) {
			speechManager.playSiren();
		}
	}, [telemetry.engines, telemetry.brakes, telemetry.throttle]);

	const manualConnect = (ip) => {
		if (ip && socketInstance) {
			speechManager.speak(`Manual override requested for IP: ${ip}.`, {
				tone: "notice",
			});
			socketInstance.emit("force_connect", { ip: ip });
		} else {
			speechManager.speak("Please enter a valid IP address.", {
				tone: "notice",
			});
		}
	};

	const selectDevice = (deviceId) => {
		if (socketInstance) {
			socketInstance.emit("select_device", { deviceId });
		}
	};

	const disconnectDevice = () => {
		if (socketInstance) {
			socketInstance.emit("select_device", { deviceId: null });
		}
	};

	return {
		connectionStatus,
		connectedIp,
		telemetry,
		manualConnect,
		discoveredDevices,
		selectDevice,
		disconnectDevice
	};
};
