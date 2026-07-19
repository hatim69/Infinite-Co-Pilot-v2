const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const PHASES = [
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
];

const CRUISE_LEVEL_VS_FPM = 200;
const CRUISE_AP_CAPTURE_MS = 4000;
const CRUISE_LEVEL_CAPTURE_MS = 12000;
const CLIMB_VS_MIN_FPM = 300;
const DESCENT_VS_MAX_FPM = -300;
const POSITIVE_VS_MIN_FPM = 100;
const TAKEOFF_GS_MIN_KTS = 35;
const TAXI_GS_MIN_KTS = 1;
const TAXI_GS_MAX_KTS = 35;
const AP_TARGET_TOLERANCE_FT = 500;
const THROTTLE_TAKEOFF_PERCENT = 70;
const N1_TAKEOFF_PERCENT = 70;

export const normalizePercent = (value) => {
  if (!isFiniteNumber(value)) return null;
  return Math.abs(value) <= 1.25 ? value * 100 : value;
};

export const normalizeDestinationDistanceNm = (value) => {
  if (!isFiniteNumber(value) || value < 0) return null;
  return value > 500 ? value / 1852 : value;
};

export const createPhaseTracker = () => ({
  currentPhase: "preflight",
  candidatePhase: null,
  candidateSince: 0,
  lastOnGround: true,
  lastTickAt: 0,
  airborneSince: 0,
  totalAirborneMs: 0,
  maxAirborneMsl: null,
  maxCruiseMsl: null,
  departureStarted: false,
  hasBootstrapped: false,
  phaseReady: false,
  phaseInitialized: false,
  levelSince: null,
  previousMsl: null,
  previousDestDist: null,
  descentTrendSamples: 0,
  altitudeDescentSamples: 0,
  destinationDescentSamples: 0,
  reachedCruise: false,
});

const getGroundSpeed = (telemetry) => telemetry.gs ?? 0;
const getVerticalSpeed = (telemetry) => telemetry.vs ?? 0;
const getAgl = (telemetry) => telemetry.agl ?? 0;
const getDestinationNm = (telemetry) => telemetry.destDist;
const isOnRunway = (telemetry) => telemetry.onRunway === true;
const isPushbackAttached = (telemetry) =>
  telemetry.pushback === 1 ||
  telemetry.pushbackTug === true ||
  telemetry.isPushing === true;
const isAppInFlight = (telemetry) => telemetry.appState === 1 || telemetry.appState === "Playing";

const hasLoadedEngineState = (telemetry) =>
  telemetry.allEnginesOff !== null ||
  telemetry.allEnginesOn !== null ||
  Object.keys(telemetry.engines || {}).length > 0;

const areEnginesOff = (telemetry) => {
  if (telemetry.allEnginesOff === 1) return true;
  if (telemetry.allEnginesOn === 1) return false;

  const states = Object.values(telemetry.engines || {});
  return states.length > 0 && states.every((state) => state === 0);
};

const areAllEnginesRunning = (telemetry) => {
  if (telemetry.allEnginesOn === 1) return true;
  if (telemetry.allEnginesOff === 1) return false;

  const states = Object.values(telemetry.engines || {});
  return states.length > 0 && states.every((state) => state === 2);
};

const areAnyEnginesRunning = (telemetry) => {
  if (telemetry.allEnginesOn === 1) return true;
  if (telemetry.allEnginesOff === 1) return false;

  return Object.values(telemetry.engines || {}).some((state) => state === 2);
};

const getThrottlePercent = (telemetry) => normalizePercent(telemetry.throttle) ?? 0;
const getN1Percent = (telemetry) => normalizePercent(telemetry.n1) ?? 0;

const hasTakeoffPower = (telemetry) =>
  getThrottlePercent(telemetry) > THROTTLE_TAKEOFF_PERCENT &&
  getN1Percent(telemetry) > N1_TAKEOFF_PERCENT;

const isApAltitudeHoldOn = (telemetry) =>
  telemetry.autopilotAlt === 1 ||
  (telemetry.autopilot === 1 && isFiniteNumber(telemetry.autopilotAltTarget));

const isApHoldingCurrentAltitude = (telemetry) =>
  isApAltitudeHoldOn(telemetry) &&
  isFiniteNumber(telemetry.msl) &&
  isFiniteNumber(telemetry.autopilotAltTarget) &&
  Math.abs(telemetry.msl - telemetry.autopilotAltTarget) <= AP_TARGET_TOLERANCE_FT &&
  Math.abs(getVerticalSpeed(telemetry)) <= CRUISE_LEVEL_VS_FPM;

const isTaxiSpeed = (telemetry) => {
  const gs = getGroundSpeed(telemetry);
  return gs >= TAXI_GS_MIN_KTS && gs < TAXI_GS_MAX_KTS;
};

const isParked = (telemetry) =>
  telemetry.onGround === true && getGroundSpeed(telemetry) < TAXI_GS_MIN_KTS;

const isBoarding = (telemetry, tracker) =>
  isAppInFlight(telemetry) &&
  telemetry.onGround === true &&
  isParked(telemetry) &&
  !isPushbackAttached(telemetry) &&
  !tracker.departureStarted &&
  (areEnginesOff(telemetry) || !hasLoadedEngineState(telemetry));

const isTaxiOut = (telemetry) =>
  telemetry.onGround === true &&
  areAllEnginesRunning(telemetry) &&
  getGroundSpeed(telemetry) < TAXI_GS_MAX_KTS;

const isRunwayReadyForDeparture = (telemetry) =>
  telemetry.onGround === true &&
  isOnRunway(telemetry) &&
  getGroundSpeed(telemetry) < TAKEOFF_GS_MIN_KTS &&
  (areAllEnginesRunning(telemetry) || areAnyEnginesRunning(telemetry));

const isTakeoffRoll = (telemetry) =>
  telemetry.onGround === true &&
  isOnRunway(telemetry) &&
  getGroundSpeed(telemetry) > TAKEOFF_GS_MIN_KTS &&
  hasTakeoffPower(telemetry);

const isInitialClimb = (telemetry) =>
  telemetry.onGround === false &&
  getVerticalSpeed(telemetry) > POSITIVE_VS_MIN_FPM &&
  getAgl(telemetry) < 5000;

const isClimb = (telemetry) =>
  telemetry.onGround === false &&
  getAgl(telemetry) >= 5000 &&
  getVerticalSpeed(telemetry) > CLIMB_VS_MIN_FPM;

const isCruiseCaptured = (telemetry, tracker, now) => {
  if (telemetry.onGround) {
    tracker.levelSince = null;
    return false;
  }

  if (isApHoldingCurrentAltitude(telemetry)) {
    if (!tracker.levelSince) tracker.levelSince = now;
    return now - tracker.levelSince >= CRUISE_AP_CAPTURE_MS;
  }

  if (getAgl(telemetry) < 5000 || Math.abs(getVerticalSpeed(telemetry)) > CRUISE_LEVEL_VS_FPM) {
    tracker.levelSince = null;
    return false;
  }

  if (!tracker.levelSince) tracker.levelSince = now;
  return now - tracker.levelSince >= CRUISE_LEVEL_CAPTURE_MS;
};

const isAltitudeDecreasing = (telemetry, tracker) =>
  isFiniteNumber(telemetry.msl) &&
  isFiniteNumber(tracker.previousMsl) &&
  telemetry.msl < tracker.previousMsl - 5;

const isDestinationDecreasing = (telemetry, tracker) =>
  isFiniteNumber(telemetry.destDist) &&
  isFiniteNumber(tracker.previousDestDist) &&
  telemetry.destDist < tracker.previousDestDist - 0.01;

const isDescent = (telemetry, tracker) =>
  tracker.reachedCruise &&
  getVerticalSpeed(telemetry) < DESCENT_VS_MAX_FPM &&
  tracker.altitudeDescentSamples >= 3 &&
  (!isFiniteNumber(getDestinationNm(telemetry)) || tracker.destinationDescentSamples >= 1);

const isApproach = (telemetry) =>
  isFiniteNumber(getDestinationNm(telemetry)) &&
  getDestinationNm(telemetry) <= 30 &&
  getAgl(telemetry) < 10000 &&
  getVerticalSpeed(telemetry) < DESCENT_VS_MAX_FPM;

const isFinalApproach = (telemetry) =>
  isFiniteNumber(getDestinationNm(telemetry)) &&
  getDestinationNm(telemetry) <= 5 &&
  telemetry.gear === 1 &&
  getAgl(telemetry) < 2000 &&
  getVerticalSpeed(telemetry) < DESCENT_VS_MAX_FPM;

const isLandingRollout = (telemetry) =>
  telemetry.onGround === true && getGroundSpeed(telemetry) > TAKEOFF_GS_MIN_KTS;

const isTaxiIn = (telemetry) => telemetry.onGround === true && isTaxiSpeed(telemetry);

const isDeboarding = (telemetry) =>
  telemetry.onGround === true &&
  getGroundSpeed(telemetry) < TAXI_GS_MIN_KTS &&
  telemetry.brakes === 1 &&
  areEnginesOff(telemetry);

const getArrivalGroundPhase = (telemetry) => {
  if (isDeboarding(telemetry)) return "deboarding";
  if (isTaxiIn(telemetry)) return "taxi_in";
  return "landing";
};

const getPhaseIndex = (phase) => PHASES.indexOf(phase);

const chooseLaterPhase = (currentPhase, nextPhase) =>
  getPhaseIndex(nextPhase) > getPhaseIndex(currentPhase) ? nextPhase : currentPhase;

const isAllowedBackwardCorrection = (currentPhase, nextPhase) =>
  (currentPhase === "taxi_out" && (nextPhase === "pushback" || nextPhase === "boarding")) ||
  (currentPhase === "pushback" && nextPhase === "boarding") ||
  (currentPhase === "cruise" && nextPhase === "climb") ||
  (currentPhase === "approach" && nextPhase === "descent");

const inferInitialPhase = (telemetry, tracker, now, flags) => {
  if (!isAppInFlight(telemetry)) return "preflight";

  if (telemetry.onGround === true) {
    if (flags?.hasFlown) return getArrivalGroundPhase(telemetry);
    if (isPushbackAttached(telemetry)) return "pushback";
    if (isTakeoffRoll(telemetry)) return "takeoff";
    if (isRunwayReadyForDeparture(telemetry) || isTaxiOut(telemetry)) return "taxi_out";
    if (isLandingRollout(telemetry) && !hasTakeoffPower(telemetry)) return "landing";
    if (isTaxiIn(telemetry) && !areAllEnginesRunning(telemetry)) return "taxi_in";
    if (isBoarding(telemetry, tracker)) return "boarding";
    if (isDeboarding(telemetry)) return "boarding";
    return "boarding";
  }

  if (isFinalApproach(telemetry)) return "final_approach";
  if (isApproach(telemetry)) return "approach";
  if (getVerticalSpeed(telemetry) < DESCENT_VS_MAX_FPM && isFiniteNumber(getDestinationNm(telemetry))) {
    return "descent";
  }
  if (isInitialClimb(telemetry)) return "initial_climb";
  if (isCruiseCaptured(telemetry, tracker, now)) return "cruise";
  if (isClimb(telemetry)) return "climb";
  return getAgl(telemetry) >= 5000 ? "cruise" : "initial_climb";
};

const updateFlightMemory = (telemetry, tracker, now) => {
  if (!tracker.lastTickAt) tracker.lastTickAt = now;

  if (telemetry.onGround === false) {
    if (!tracker.airborneSince) tracker.airborneSince = now;
    tracker.totalAirborneMs += Math.max(0, now - tracker.lastTickAt);

    if (isFiniteNumber(telemetry.msl)) {
      tracker.maxAirborneMsl =
        tracker.maxAirborneMsl === null ? telemetry.msl : Math.max(tracker.maxAirborneMsl, telemetry.msl);
    }
  } else {
    tracker.airborneSince = 0;
  }

  if (isAltitudeDecreasing(telemetry, tracker)) {
    tracker.altitudeDescentSamples += 1;
  } else if (getVerticalSpeed(telemetry) >= DESCENT_VS_MAX_FPM) {
    tracker.altitudeDescentSamples = 0;
  }

  if (isDestinationDecreasing(telemetry, tracker)) {
    tracker.destinationDescentSamples += 1;
  } else if (getVerticalSpeed(telemetry) >= DESCENT_VS_MAX_FPM) {
    tracker.destinationDescentSamples = 0;
  }

  if (isAltitudeDecreasing(telemetry, tracker) && isDestinationDecreasing(telemetry, tracker)) {
    tracker.descentTrendSamples += 1;
  } else if (getVerticalSpeed(telemetry) >= DESCENT_VS_MAX_FPM) {
    tracker.descentTrendSamples = 0;
  }

  tracker.previousMsl = isFiniteNumber(telemetry.msl) ? telemetry.msl : tracker.previousMsl;
  tracker.previousDestDist = isFiniteNumber(telemetry.destDist) ? telemetry.destDist : tracker.previousDestDist;
  tracker.lastTickAt = now;
};

const markPhaseMemory = (phase, telemetry, tracker) => {
  if (getPhaseIndex(phase) >= getPhaseIndex("taxi_out")) {
    tracker.departureStarted = true;
  }

  if (getPhaseIndex(phase) >= getPhaseIndex("cruise")) {
    tracker.reachedCruise = true;
  }

  if (phase === "cruise" && isFiniteNumber(telemetry.msl)) {
    tracker.maxCruiseMsl =
      tracker.maxCruiseMsl === null ? telemetry.msl : Math.max(tracker.maxCruiseMsl, telemetry.msl);
  }
};

const nextPhaseFrom = (phase, telemetry, tracker, now) => {
  switch (phase) {
    case "preflight":
      return isBoarding(telemetry, tracker) ? "boarding" : phase;

    case "boarding":
      if (isPushbackAttached(telemetry) && telemetry.onGround === true) return "pushback";
      if (isRunwayReadyForDeparture(telemetry) || isTaxiOut(telemetry)) return "taxi_out";
      return phase;

    case "pushback":
      if (telemetry.onGround === false) return "initial_climb";
      if (isPushbackAttached(telemetry)) return phase;
      if (isRunwayReadyForDeparture(telemetry) || isTaxiOut(telemetry)) return "taxi_out";
      if (isBoarding(telemetry, tracker)) return "boarding";
      return phase;

    case "taxi_out":
      if (telemetry.onGround === false) return "initial_climb";
      if (isPushbackAttached(telemetry)) return "pushback";
      if (isParked(telemetry) && areEnginesOff(telemetry)) return "boarding";
      return isTakeoffRoll(telemetry) ? "takeoff" : phase;

    case "takeoff":
      return telemetry.onGround === false ? "initial_climb" : phase;

    case "initial_climb":
      return getAgl(telemetry) >= 5000 ? "climb" : phase;

    case "climb":
      return isCruiseCaptured(telemetry, tracker, now) ? "cruise" : phase;

    case "cruise":
      if (telemetry.onGround === true) return getArrivalGroundPhase(telemetry);
      if (isClimb(telemetry)) return "climb";
      return isDescent(telemetry, tracker) ? "descent" : phase;

    case "descent":
      if (telemetry.onGround === true) return getArrivalGroundPhase(telemetry);
      return isApproach(telemetry) ? "approach" : phase;

    case "approach":
      if (telemetry.onGround === true) return getArrivalGroundPhase(telemetry);
      if (getVerticalSpeed(telemetry) > CLIMB_VS_MIN_FPM) return "descent";
      return isFinalApproach(telemetry) ? "final_approach" : phase;

    case "final_approach":
      if (telemetry.onGround === true) return getArrivalGroundPhase(telemetry);
      return isLandingRollout(telemetry) ? "landing" : phase;

    case "landing":
      return isTaxiIn(telemetry) ? "taxi_in" : phase;

    case "taxi_in":
      return isDeboarding(telemetry) ? "deboarding" : phase;

    case "deboarding":
    default:
      return phase;
  }
};

export const deriveFlightPhase = (telemetry, tracker, flags, now = Date.now()) => {
  updateFlightMemory(telemetry, tracker, now);

  if (!tracker.phaseInitialized || tracker.currentPhase === "preflight") {
    const initialPhase = inferInitialPhase(telemetry, tracker, now, flags);
    tracker.currentPhase = initialPhase;
    tracker.phaseInitialized = initialPhase !== "preflight";
    tracker.hasBootstrapped = tracker.phaseInitialized;
    tracker.candidatePhase = null;
    tracker.candidateSince = 0;
    tracker.lastOnGround = telemetry.onGround;
    markPhaseMemory(initialPhase, telemetry, tracker);
    return initialPhase;
  }

  const currentPhase = tracker.currentPhase;
  const nextPhase = nextPhaseFrom(currentPhase, telemetry, tracker, now);
  const resolvedPhase = isAllowedBackwardCorrection(currentPhase, nextPhase)
    ? nextPhase
    : chooseLaterPhase(currentPhase, nextPhase);

  tracker.currentPhase = resolvedPhase;
  tracker.candidatePhase = null;
  tracker.candidateSince = 0;
  tracker.hasBootstrapped = true;
  tracker.lastOnGround = telemetry.onGround;
  markPhaseMemory(resolvedPhase, telemetry, tracker);

  return resolvedPhase;
};
