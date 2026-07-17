const PHASE_DEBOUNCE_MS = {
  boarding: 3000,
  pushback: 2000,
  taxi_out: 3000,
  takeoff: 1000,
  initial_climb: 500,
  climb: 5000,
  cruise: 15000,
  descent: 15000,
  approach: 5000,
  final_approach: 2000,
  landing: 200,
  taxi_in: 3000,
  deboarding: 5000,
};

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const CRUISE_VS_LIMIT_FPM = 250;
const CLIMB_VS_MIN_FPM = 250;
const DESCENT_VS_MAX_FPM = -300;
const AP_TARGET_TOLERANCE_FT = 500;

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
});

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

const areEnginesRunning = (telemetry) => {
  if (telemetry.allEnginesOn === 1) return true;
  if (telemetry.allEnginesOff === 1) return false;

  return Object.values(telemetry.engines || {}).some((state) => state === 2);
};

const isParked = (telemetry) => {
  const gs = telemetry.gs ?? 0;
  return telemetry.onGround && gs < 1;
};

const getThrottlePercent = (telemetry) => normalizePercent(telemetry.throttle) ?? 0;
const getN1Percent = (telemetry) => normalizePercent(telemetry.n1) ?? 0;

const hasTakeoffPower = (telemetry) =>
  getThrottlePercent(telemetry) > 70 || getN1Percent(telemetry) > 70;

const isApAltitudeHoldOn = (telemetry) =>
  telemetry.autopilotAlt === 1 || (telemetry.autopilot === 1 && telemetry.autopilotAltTarget !== null);

const isApHoldingCurrentAltitude = (telemetry, toleranceFt = AP_TARGET_TOLERANCE_FT) =>
  isApAltitudeHoldOn(telemetry) &&
  isFiniteNumber(telemetry.msl) &&
  isFiniteNumber(telemetry.autopilotAltTarget) &&
  Math.abs(telemetry.msl - telemetry.autopilotAltTarget) <= toleranceFt;

const hasClimbIntent = (telemetry) => {
  if (isApHoldingCurrentAltitude(telemetry)) return false;

  if (isApAltitudeHoldOn(telemetry) && isFiniteNumber(telemetry.autopilotAltTarget) && isFiniteNumber(telemetry.msl)) {
    return telemetry.autopilotAltTarget > telemetry.msl + AP_TARGET_TOLERANCE_FT;
  }

  return telemetry.vs > CLIMB_VS_MIN_FPM;
};

const hasDescentIntent = (telemetry) => {
  if (isApAltitudeHoldOn(telemetry) && isFiniteNumber(telemetry.autopilotAltTarget) && isFiniteNumber(telemetry.msl)) {
    return telemetry.autopilotAltTarget < telemetry.msl - AP_TARGET_TOLERANCE_FT;
  }

  return getThrottlePercent(telemetry) < 50 || getN1Percent(telemetry) < 55;
};

const hasCruiseIntent = (telemetry) =>
  telemetry.agl >= 5000 &&
  (isApHoldingCurrentAltitude(telemetry) ||
    (isFiniteNumber(telemetry.vs) && Math.abs(telemetry.vs) < CRUISE_VS_LIMIT_FPM));

const getDescentWatermark = (tracker) => tracker.maxCruiseMsl ?? tracker.maxAirborneMsl;

const isAfterArrival = (phase) => phase === "landing" || phase === "taxi_in" || phase === "deboarding";

const isDeparturePhase = (phase) =>
  phase === "pushback" ||
  phase === "taxi_out" ||
  phase === "takeoff" ||
  phase === "initial_climb" ||
  phase === "climb" ||
  phase === "cruise" ||
  phase === "descent" ||
  phase === "approach" ||
  phase === "final_approach";

const pickDesiredPhase = (telemetry, tracker, flags, now) => {
  const currentPhase = tracker.currentPhase || telemetry.phase || "preflight";
  const gs = telemetry.gs ?? 0;
  const vs = telemetry.vs ?? 0;
  const msl = telemetry.msl ?? 0;
  const agl = telemetry.agl ?? 0;
  const destNm = telemetry.destDist;
  const justBecameAirborne = tracker.lastOnGround === true && telemetry.onGround === false;
  const justTouchedDown = tracker.lastOnGround === false && telemetry.onGround === true;
  const hasRealFlight = tracker.totalAirborneMs >= 120000 || flags.hasFlown;
  const completedFlight = tracker.totalAirborneMs >= 120000;
  const pushbackActive = telemetry.pushback === 1;
  const departureStarted =
    tracker.departureStarted ||
    isDeparturePhase(currentPhase) ||
    pushbackActive ||
    flags.hasFlown;
  const enginesKnown = hasLoadedEngineState(telemetry);
  const enginesOff = areEnginesOff(telemetry);
  const enginesRunning = areEnginesRunning(telemetry);
  const parked = isParked(telemetry);
  const cruiseIntent = hasCruiseIntent(telemetry);
  const climbIntent = hasClimbIntent(telemetry);

  if (telemetry.onGround) {
    if (justTouchedDown && gs > 35) return "landing";
    if (hasRealFlight && gs > 35) return "landing";
    if (pushbackActive) return "pushback";
    if (gs >= 35 && hasTakeoffPower(telemetry) && !hasRealFlight) return "takeoff";

    if (gs >= 1 && gs < 35) {
      if (hasRealFlight || isAfterArrival(currentPhase)) return "taxi_in";
      if (departureStarted || enginesRunning || !enginesKnown) return "taxi_out";
    }

    if (parked) {
      if (
        completedFlight &&
        (isAfterArrival(currentPhase) || flags.hasFlown) &&
        enginesOff &&
        telemetry.brakes === 1
      ) {
        return "deboarding";
      }

      if (!hasRealFlight && departureStarted) return "taxi_out";

      if (!hasRealFlight && (enginesOff || !enginesKnown)) return "boarding";
    }

    return currentPhase;
  }

  if (isFiniteNumber(msl)) {
    tracker.maxAirborneMsl = tracker.maxAirborneMsl === null ? msl : Math.max(tracker.maxAirborneMsl, msl);
  }

  if (justBecameAirborne || (currentPhase === "takeoff" && agl < 5000 && vs > 100)) {
    return "initial_climb";
  }

  const descentWatermark = getDescentWatermark(tracker);
  const belowCruiseWatermark =
    isFiniteNumber(msl) &&
    isFiniteNumber(descentWatermark) &&
    msl < descentWatermark - 1000;
  const deliberateDescent =
    vs < DESCENT_VS_MAX_FPM &&
    belowCruiseWatermark &&
    hasDescentIntent(telemetry) &&
    !cruiseIntent;

  if (deliberateDescent) return "descent";

  if ((destNm !== null && destNm < 5) || (agl < 2000 && telemetry.gear === 1)) {
    return "final_approach";
  }

  const inTerminalDistance = destNm !== null && destNm >= 5 && destNm < 30;
  const inTerminalAltitude = agl < 10000 && agl >= 2000;
  const approachSequenceStarted =
    currentPhase === "descent" ||
    currentPhase === "approach" ||
    currentPhase === "final_approach" ||
    currentPhase === "landing";

  if (
    (inTerminalDistance && (inTerminalAltitude || approachSequenceStarted || !cruiseIntent)) ||
    (approachSequenceStarted && inTerminalAltitude)
  ) {
    return "approach";
  }

  if (agl < 5000 && vs > 100 && climbIntent) return "initial_climb";

  if (cruiseIntent) return "cruise";

  if (agl >= 5000 && vs > CLIMB_VS_MIN_FPM && climbIntent) return "climb";

  return currentPhase;
};

export const deriveFlightPhase = (telemetry, tracker, flags, now = Date.now()) => {
  if (!tracker.lastTickAt) tracker.lastTickAt = now;

  if (!tracker.hasBootstrapped && !telemetry.onGround && tracker.totalAirborneMs < 120000) {
    tracker.totalAirborneMs = 120000;
  }

  if (!telemetry.onGround) {
    if (!tracker.airborneSince) tracker.airborneSince = now;
    tracker.totalAirborneMs += Math.max(0, now - tracker.lastTickAt);
  } else {
    tracker.airborneSince = 0;
  }

  tracker.lastTickAt = now;

  if (tracker.currentPhase === "cruise" && isFiniteNumber(telemetry.msl)) {
    tracker.maxCruiseMsl =
      tracker.maxCruiseMsl === null ? telemetry.msl : Math.max(tracker.maxCruiseMsl, telemetry.msl);
  }

  const currentPhase = tracker.currentPhase || telemetry.phase || "preflight";
  const desiredPhase = pickDesiredPhase(telemetry, tracker, flags, now);
  if (isDeparturePhase(desiredPhase)) {
    tracker.departureStarted = true;
  }

  if (
    (!tracker.hasBootstrapped || currentPhase === "preflight") &&
    desiredPhase !== "preflight" &&
    desiredPhase !== "boarding"
  ) {
    tracker.currentPhase = desiredPhase;
    tracker.hasBootstrapped = true;
    tracker.candidatePhase = null;
    tracker.candidateSince = 0;
    tracker.departureStarted = tracker.departureStarted || isDeparturePhase(desiredPhase);
    tracker.lastOnGround = telemetry.onGround;
    return desiredPhase;
  }

  tracker.hasBootstrapped = true;

  if (desiredPhase === currentPhase) {
    tracker.candidatePhase = null;
    tracker.candidateSince = 0;
    tracker.departureStarted = tracker.departureStarted || isDeparturePhase(currentPhase);
    tracker.lastOnGround = telemetry.onGround;
    return currentPhase;
  }

  if (tracker.candidatePhase !== desiredPhase) {
    tracker.candidatePhase = desiredPhase;
    tracker.candidateSince = now;
    tracker.lastOnGround = telemetry.onGround;
    return currentPhase;
  }

  const debounceMs = PHASE_DEBOUNCE_MS[desiredPhase] ?? 5000;
  if (now - tracker.candidateSince >= debounceMs) {
    tracker.currentPhase = desiredPhase;
    tracker.candidatePhase = null;
    tracker.candidateSince = 0;

    if (desiredPhase === "cruise" && isFiniteNumber(telemetry.msl)) {
      tracker.maxCruiseMsl =
        tracker.maxCruiseMsl === null ? telemetry.msl : Math.max(tracker.maxCruiseMsl, telemetry.msl);
    }

    tracker.departureStarted = tracker.departureStarted || isDeparturePhase(desiredPhase);
    tracker.lastOnGround = telemetry.onGround;
    return desiredPhase;
  }

  tracker.lastOnGround = telemetry.onGround;
  return currentPhase;
};
