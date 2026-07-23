import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ArrowRight, CheckSquare, RefreshCw, ShieldCheck, Square } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { speechManager } from '../../utils/speech';

const PHASE_META = {
  syncing: { title: "Detecting Phase", next: null, fallbackNextTitle: "First Confirmed Phase" },
  preflight: { title: "Standing By", next: "boarding" },
  boarding: { title: "Boarding", next: "pushback" },
  pushback: { title: "Pushback", next: "taxi_out" },
  taxi_out: { title: "Taxi Out", next: "takeoff" },
  takeoff: { title: "Takeoff Roll", next: "initial_climb" },
  initial_climb: { title: "Initial Climb", next: "climb" },
  climb: { title: "Climb", next: "cruise" },
  cruise: { title: "Cruise", next: "descent" },
  descent: { title: "Descent", next: "approach" },
  approach: { title: "Approach", next: "final_approach" },
  final_approach: { title: "Final Approach", next: "landing" },
  landing: { title: "Landing Rollout", next: "taxi_in" },
  taxi_in: { title: "Taxi In", next: "deboarding" },
  deboarding: { title: "Deboarding", next: null },
};

const pct = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.abs(value) <= 1.25 ? value * 100 : value;
};

const getEngineSummary = (telemetry) => {
  const states = Object.values(telemetry.engines || {});
  const allOff =
    telemetry.allEnginesOff === 1 ||
    (states.length > 0 && states.every((state) => state === 0));
  const anyRunning =
    telemetry.allEnginesOn === 1 ||
    states.some((state) => state === 2);
  const anyStarting = states.some((state) => state === 1);

  return { allOff, anyRunning, anyStarting };
};

const getConditions = (phase, telemetry) => {
  const gs = telemetry.gs ?? 0;
  const vs = telemetry.vs ?? 0;
  const agl = telemetry.agl ?? 0;
  const msl = telemetry.msl ?? 0;
  const n1 = telemetry.n1 ?? 0;
  const throttle = pct(telemetry.throttle);
  const destNm = telemetry.destDist;
  const engines = getEngineSummary(telemetry);
  const pushbackAttached = telemetry.pushback === 1 || telemetry.pushbackTug === true || telemetry.isPushing === true;
  const parked = telemetry.onGround && gs < 1;
  const taxiSpeed = telemetry.onGround && gs >= 1 && gs < 35;
  const takeoffPower = throttle > 70 || n1 > 70;
  const apHolding =
    telemetry.autopilotAlt === 1 &&
    typeof telemetry.autopilotAltTarget === 'number' &&
    Math.abs(msl - telemetry.autopilotAltTarget) <= 500;
  const levelFlight = Math.abs(vs) < 250 || apHolding;
  const destinationKnown = typeof destNm === 'number';

  const common = {
    onGround: { label: "On ground", met: telemetry.onGround === true },
    airborne: { label: "Airborne", met: telemetry.onGround === false },
    parked: { label: "Aircraft parked", met: parked },
    enginesOff: { label: "Engines off", met: engines.allOff },
    enginesReady: {
      label: engines.anyStarting ? "Engines starting" : "Engines running",
      met: engines.anyRunning || engines.anyStarting,
    },
    taxiSpeed: { label: "Taxi speed", met: taxiSpeed },
    runway: { label: "Runway detected", met: telemetry.onRunway === true },
    pushbackAttached: { label: "Pushback connected", met: pushbackAttached },
    pushbackDisconnected: { label: "Pushback disconnected", met: !pushbackAttached },
    takeoffPower: { label: "Takeoff power", met: takeoffPower },
    climbRate: { label: "Positive climb", met: vs > 250 },
    lowClimb: { label: "Below 5,000 AGL", met: agl < 5000 },
    aboveFive: { label: "Above 5,000 AGL", met: agl >= 5000 },
    levelFlight: { label: apHolding ? "AP altitude hold captured" : "Level trend", met: levelFlight },
    descentRate: { label: "Sustained descent", met: vs < -300 },
    destination30: {
      label: destinationKnown ? "Within 30 NM" : "Terminal altitude fallback",
      met: (destinationKnown && destNm < 30 && destNm >= 5) || (!destinationKnown && agl < 10000),
    },
    final: {
      label: destinationKnown ? "Inside 5 NM" : "Gear down below 2,000 AGL",
      met: (destinationKnown && destNm < 5) || (agl < 2000 && telemetry.gear === 1),
    },
    touchdown: { label: "Runway rollout", met: telemetry.onGround === true && gs > 35 },
    brakesSet: { label: "Parking brake set", met: telemetry.brakes === 1 },
  };

  const byPhase = {
    syncing: [
      { label: "Receiving core telemetry", met: true },
      { label: "Waiting for stable phase lock", met: false },
    ],
    preflight: [common.parked, common.enginesOff],
    boarding: [common.onGround, common.parked, common.enginesOff],
    pushback: [
      common.onGround,
      common.pushbackAttached,
    ],
    taxi_out: [
      common.onGround,
      common.enginesReady,
      common.pushbackDisconnected,
      { label: telemetry.onRunway === true ? "Holding below takeoff roll" : "Below takeoff speed", met: gs < 35 },
    ],
    takeoff: [common.onGround, common.runway, { label: "Accelerating", met: gs >= 20 }, common.takeoffPower],
    initial_climb: [common.airborne, common.lowClimb, { label: "Positive rate", met: vs > 100 }],
    climb: [common.airborne, common.aboveFive, common.climbRate],
    cruise: [common.airborne, common.aboveFive, common.levelFlight],
    descent: [common.airborne, common.descentRate, { label: "Descent intent verified", met: phase === "descent" }],
    approach: [common.airborne, common.destination30, { label: "Descent/terminal profile", met: phase === "approach" }],
    final_approach: [common.airborne, common.final, common.runway, { label: "Landing configuration", met: telemetry.gear === 1 || phase === "final_approach" }],
    landing: [common.onGround, common.touchdown, common.runway, { label: "Arrival sequence active", met: true }],
    taxi_in: [common.onGround, common.taxiSpeed, { label: "After landing", met: true }],
    deboarding: [common.onGround, common.parked, common.enginesOff, common.brakesSet],
  };

  return byPhase[phase] || byPhase.preflight;
};

const CrewAssistant = ({ telemetry, isConnected, onResetConnectingFlight }) => {
  const { theme } = useTheme();
  const phase = isConnected ? telemetry.phase || "preflight" : "preflight";
  const details = PHASE_META[phase] || PHASE_META.preflight;
  const nextPhase = details.next;
  const nextDetails = nextPhase ? PHASE_META[nextPhase] : null;
  const conditions = isConnected ? getConditions(phase, telemetry) : [];

  const prevEnginesRef = useRef({});
  const prevGsRef = useRef(0);

  useEffect(() => {
    if (!isConnected) return;

    // 1. Aircraft Type Constraint
    const isAirbusA320Family = (name) => {
      if (!name) return false;
      const lower = name.toLowerCase();
      // Match A318, A319, A320, A321, A320neo, A321neo
      return lower.includes('a318') ||
        lower.includes('a319') ||
        lower.includes('a320') ||
        lower.includes('a321');
    };

    if (!isAirbusA320Family(telemetry.name)) {
      prevEnginesRef.current = telemetry.engines || {};
      prevGsRef.current = telemetry.gs || 0;
      return;
    }

    // 3. Inhibition Logic
    const cargoDoorsOpen = telemetry.cargoDoorsOpen === 1;
    const brakesSet = telemetry.brakes === 1;

    if (cargoDoorsOpen || brakesSet) {
      prevEnginesRef.current = telemetry.engines || {};
      prevGsRef.current = telemetry.gs || 0;
      return;
    }

    const prevEng = prevEnginesRef.current;
    const currEng = telemetry.engines || {};
    const currGs = telemetry.gs || 0;

    // Check Engine 1 & 2 states
    const eng1Prev = prevEng[1] || 0;
    const eng1Curr = currEng[1] || 0;
    const eng2Prev = prevEng[2] || 0;
    const eng2Curr = currEng[2] || 0;

    let shouldPlay = false;

    // Trigger 1: Second Engine Start Sequence
    // One running (2), the other OFF (0) -> STARTING (1)
    if ((eng1Curr === 2 && eng2Prev === 0 && eng2Curr === 1) ||
      (eng2Curr === 2 && eng1Prev === 0 && eng1Curr === 1)) {
      shouldPlay = true;
    }

    // Trigger 2: Single-Engine Taxi (Engine Shutdown)
    // Speed < 30 knots, one ON -> OFF (2 -> 0), other remains ON (2)
    if (currGs < 30) {
      if ((eng1Prev === 2 && eng1Curr === 0 && eng2Curr === 2) ||
        (eng2Prev === 2 && eng2Curr === 0 && eng1Curr === 2)) {
        shouldPlay = true;
      }
    }

    if (shouldPlay) {
      speechManager.playPTUBurst();
    }

    prevEnginesRef.current = currEng;
    prevGsRef.current = currGs;
  }, [telemetry.engines, telemetry.cargoDoorsOpen, telemetry.brakes, telemetry.gs, telemetry.name, isConnected]);

  return (
    <View style={[
      styles.container,
      { backgroundColor: theme.surfaceMid, borderColor: theme.borderSoft }
    ]}>
      <View style={[styles.headerRow, { borderBottomColor: theme.borderMid }]}>
        <View style={styles.titleContainer}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.accentBg, borderColor: theme.accentActiveBorder }]}>
            <ShieldCheck size={18} color={theme.accentText} />
          </View>
          <Text style={[styles.headerTitle, { color: theme.textSecondary }]}>Crew Assistant</Text>
        </View>
        {isConnected && (
          <TouchableOpacity
            style={[
              styles.nextFlightButton,
              { backgroundColor: theme.accentBgStrong, borderColor: theme.accentActiveBorder },
            ]}
            onPress={onResetConnectingFlight}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Prepare next flight"
          >
            <RefreshCw size={13} color={theme.accentText} />
            <Text style={[styles.nextFlightText, { color: theme.accentText }]}>Next Flight</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.phaseRow}>
        <View style={styles.phaseBlock}>
          <Text style={[styles.microLabel, { color: theme.textDim }]}>Current Phase</Text>
          <Text style={[styles.phaseTitle, { color: theme.textPrimary }]}>{details.title}</Text>
        </View>

        <ArrowRight size={18} color={theme.textDim} style={styles.arrowIcon} />

        <View style={styles.phaseBlock}>
          <Text style={[styles.microLabel, { color: theme.textDim }]}>Next Phase</Text>
          <Text style={[styles.nextPhaseTitle, { color: nextDetails ? theme.accentText : theme.textMuted }]}>
            {nextDetails ? nextDetails.title : details.fallbackNextTitle || "Complete"}
          </Text>
        </View>
      </View>

      {isConnected && conditions.length > 0 && (
        <View style={[styles.conditions, { borderTopColor: theme.borderMid }]}>
          <Text style={[styles.microLabel, { color: theme.textDim }]}>Checklist</Text>
          <View style={styles.conditionGrid}>
            {conditions.map((item) => {
              const Icon = item.met ? CheckSquare : Square;
              return (
                <View key={item.label} style={styles.conditionItem}>
                  <Icon
                    size={15}
                    color={item.met ? theme.accentText : theme.textDim}
                    style={styles.conditionIcon}
                  />
                  <Text
                    style={[
                      styles.conditionText,
                      { color: item.met ? theme.textLabel : theme.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 14,
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  nextFlightButton: {
    flexShrink: 0,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextFlightText: {
    fontSize: 11,
    fontWeight: '800',
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  phaseBlock: {
    flex: 1,
    minWidth: 0,
  },
  microLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  phaseTitle: {
    fontSize: 25,
    fontWeight: '800',
  },
  arrowIcon: {
    marginTop: 16,
  },
  nextPhaseTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  conditions: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  conditionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  conditionItem: {
    width: '48%',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  conditionIcon: {
    marginRight: 7,
  },
  conditionText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
});

export default CrewAssistant;
