import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowRight, CheckSquare, ShieldCheck, Square } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

const PHASE_META = {
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
    preflight: [common.parked, common.enginesOff],
    boarding: [common.onGround, common.parked, common.enginesOff],
    pushback: [
      common.onGround,
      { label: "Pushback active", met: telemetry.pushback === 1 },
      { label: "Departure sequence started", met: true },
    ],
    taxi_out: [
      common.onGround,
      { label: "Boarding complete", met: true },
      common.enginesReady,
      { label: "Below takeoff speed", met: gs < 35 },
    ],
    takeoff: [common.onGround, { label: "Accelerating", met: gs >= 35 }, common.takeoffPower],
    initial_climb: [common.airborne, common.lowClimb, { label: "Positive rate", met: vs > 100 }],
    climb: [common.airborne, common.aboveFive, common.climbRate],
    cruise: [common.airborne, common.aboveFive, common.levelFlight],
    descent: [common.airborne, common.descentRate, { label: "Descent intent verified", met: phase === "descent" }],
    approach: [common.airborne, common.destination30, { label: "Descent/terminal profile", met: phase === "approach" }],
    final_approach: [common.airborne, common.final, { label: "Landing configuration", met: telemetry.gear === 1 || phase === "final_approach" }],
    landing: [common.onGround, common.touchdown, { label: "Arrival sequence active", met: true }],
    taxi_in: [common.onGround, common.taxiSpeed, { label: "After landing", met: true }],
    deboarding: [common.onGround, common.parked, common.enginesOff, common.brakesSet],
  };

  return byPhase[phase] || byPhase.preflight;
};

const CrewAssistant = ({ telemetry, isConnected }) => {
  const { theme } = useTheme();
  const phase = isConnected ? telemetry.phase || "preflight" : "preflight";
  const details = PHASE_META[phase] || PHASE_META.preflight;
  const nextPhase = details.next;
  const nextDetails = nextPhase ? PHASE_META[nextPhase] : null;
  const conditions = isConnected ? getConditions(phase, telemetry) : [];

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
            {nextDetails ? nextDetails.title : "Complete"}
          </Text>
        </View>
      </View>

      {isConnected && conditions.length > 0 && (
        <View style={[styles.conditions, { borderTopColor: theme.borderMid }]}>
          <Text style={[styles.microLabel, { color: theme.textDim }]}>Conditions</Text>
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
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 14,
  },
  titleContainer: {
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
