import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * FlightStrip — primary flight data bar shown at top of dashboard.
 * Displays IAS, GS, VS, ALT MSL, and AGL.
 */
const FlightStrip = ({ telemetry }) => {
  const { theme } = useTheme();

  const fmt = (val, decimals = 0) =>
    val !== null && val !== undefined ? Math.round(val).toFixed(decimals) : '...';

  const vsValue = telemetry.vs !== null && telemetry.vs !== undefined ? Math.round(telemetry.vs) : null;
  const vsStr = vsValue !== null ? (vsValue >= 0 ? `+${vsValue}` : `${vsValue}`) : '...';
  const vsColor = vsValue === null ? theme.textSlate : vsValue > 200 ? '#34D399' : vsValue < -200 ? '#F87171' : theme.textSlate;

  return (
    <View style={[styles.flightStrip, { backgroundColor: theme.surfaceDeep, borderColor: theme.borderDeep }]}>
      <View style={styles.stripBox}>
        <Text style={[styles.stripLabel, { color: theme.textFaint }]}>IAS</Text>
        <Text style={[styles.stripValue, { color: theme.textSecondary }]}>{fmt(telemetry.ias)}</Text>
        <Text style={[styles.stripUnit, { color: theme.border }]}>KTS</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.stripBox}>
        <Text style={[styles.stripLabel, { color: theme.textFaint }]}>GS</Text>
        <Text style={[styles.stripValue, { color: theme.textSecondary }]}>{fmt(telemetry.gs)}</Text>
        <Text style={[styles.stripUnit, { color: theme.border }]}>KTS</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.stripBox}>
        <Text style={[styles.stripLabel, { color: theme.textFaint }]}>VS</Text>
        <Text style={[styles.stripValue, { color: vsColor }]}>{vsStr}</Text>
        <Text style={[styles.stripUnit, { color: theme.border }]}>FPM</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.stripBox}>
        <Text style={[styles.stripLabel, { color: theme.textFaint }]}>ALT</Text>
        <Text style={[styles.stripValue, { color: theme.textSecondary }]}>{fmt(telemetry.msl)}</Text>
        <Text style={[styles.stripUnit, { color: theme.border }]}>FT MSL</Text>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.stripBox}>
        <Text style={[styles.stripLabel, { color: theme.textFaint }]}>AGL</Text>
        <Text style={[styles.stripValue, { color: theme.textSecondary }]}>{fmt(telemetry.agl)}</Text>
        <Text style={[styles.stripUnit, { color: theme.border }]}>FT AGL</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flightStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 16,
    borderWidth: 1,
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
    marginVertical: 4,
    alignSelf: 'stretch',
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  stripValue: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: -0.5,
  },
  stripUnit: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 3,
    textTransform: 'uppercase',
  },
});

export default FlightStrip;
