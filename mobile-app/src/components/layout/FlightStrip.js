import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

/**
 * FlightStrip — primary flight data bar shown at top of dashboard.
 * Displays IAS, GS, VS, ALT MSL, and AGL.
 */
const FlightStrip = ({ telemetry }) => {
  const fmt = (val, decimals = 0) =>
    val !== null && val !== undefined ? Math.round(val).toFixed(decimals) : '---';

  const vsValue = telemetry.vs !== null && telemetry.vs !== undefined ? Math.round(telemetry.vs) : null;
  const vsStr = vsValue !== null ? (vsValue >= 0 ? `+${vsValue}` : `${vsValue}`) : '---';
  const vsColor = vsValue === null ? '#94A3B8' : vsValue > 200 ? '#34D399' : vsValue < -200 ? '#F87171' : '#94A3B8';

  return (
    <View style={styles.flightStrip}>
      <View style={styles.stripBox}>
        <Text style={styles.stripLabel}>IAS</Text>
        <Text style={styles.stripValue}>{fmt(telemetry.ias)}</Text>
        <Text style={styles.stripUnit}>KTS</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.stripBox}>
        <Text style={styles.stripLabel}>GS</Text>
        <Text style={styles.stripValue}>{fmt(telemetry.gs)}</Text>
        <Text style={styles.stripUnit}>KTS</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.stripBox}>
        <Text style={styles.stripLabel}>VS</Text>
        <Text style={[styles.stripValue, { color: vsColor }]}>{vsStr}</Text>
        <Text style={styles.stripUnit}>FPM</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.stripBox}>
        <Text style={styles.stripLabel}>ALT</Text>
        <Text style={styles.stripValue}>{fmt(telemetry.msl)}</Text>
        <Text style={styles.stripUnit}>FT MSL</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.stripBox}>
        <Text style={styles.stripLabel}>AGL</Text>
        <Text style={styles.stripValue}>{fmt(telemetry.agl)}</Text>
        <Text style={styles.stripUnit}>FT AGL</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flightStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(7, 17, 31, 0.95)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  stripBox: {
    alignItems: 'center',
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
    alignSelf: 'stretch',
  },
  stripLabel: {
    color: '#334155',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  stripValue: {
    color: '#E2E8F0',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: -0.5,
  },
  stripUnit: {
    color: '#1E293B',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 3,
    textTransform: 'uppercase',
  },
});

export default FlightStrip;
