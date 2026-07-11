import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

/**
 * SystemStatus — a data cell used in the systems grid.
 * Shows a label + icon on the left, value on the right.
 * Supports an optional 'highlight' prop for values that are active/on.
 */
const SystemStatus = ({ label, value, icon: Icon, highlight }) => {
  const isActive = highlight || (typeof value === 'string' && (value === 'ON' || value === 'SET' || value === 'CONN' || value === 'ACTIVE' || value === 'ARMED'));
  const isWarning = typeof value === 'string' && (value === 'MOVING');

  return (
    <View style={[
      styles.container,
      isActive && styles.containerActive,
      isWarning && styles.containerWarning,
    ]}>
      <View style={styles.left}>
        {Icon && <Icon size={12} color="#475569" style={styles.icon} />}
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
      </View>
      <Text
        style={[
          styles.value,
          isActive && styles.valueActive,
          isWarning && styles.valueWarning,
        ]}
        numberOfLines={1}
      >
        {value !== undefined && value !== null && value !== '' ? value : '---'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '48.5%',
    marginBottom: 8,
  },
  containerActive: {
    borderColor: 'rgba(13, 148, 136, 0.4)',
    backgroundColor: 'rgba(13, 148, 136, 0.08)',
  },
  containerWarning: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 4,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    fontSize: 9,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    flexShrink: 1,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#94A3B8',
    textAlign: 'right',
    flexShrink: 0,
  },
  valueActive: {
    color: '#2DD4BF',
  },
  valueWarning: {
    color: '#FBBF24',
  },
});

export default SystemStatus;
