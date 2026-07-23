import React from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * SystemStatus — a data cell used in the systems grid.
 * Shows a label + icon on the left, value on the right.
 * Supports an optional 'highlight' prop for values that are active/on.
 */
const SystemStatus = ({ label, value, icon: Icon, highlight }) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const isActive = highlight || (typeof value === 'string' && (value === 'ON' || value === 'SET' || value === 'CONN' || value === 'ACTIVE' || value === 'ARMED'));
  const isWarning = typeof value === 'string' && (value === 'MOVING');
  const isSingleColumn = width < 360;
  const isThreeColumn = width >= 760;
  const itemWidth = isSingleColumn ? '100%' : isThreeColumn ? '32%' : '48%';

  return (
    <View style={[
      styles.container,
      { width: itemWidth },
      { backgroundColor: theme.surface, borderColor: theme.border },
      isActive && { borderColor: theme.accentActiveBorder, backgroundColor: theme.accentActive },
      isWarning && styles.containerWarning,
    ]}>
      <View style={styles.left}>
        {Icon && <Icon size={12} color={theme.textDim} style={styles.icon} />}
        <Text style={[styles.label, { color: theme.textDim }]} numberOfLines={isSingleColumn ? 2 : 1}>{label}</Text>
      </View>
      <Text
        style={[
          styles.value,
          { color: theme.textSlate },
          isActive && { color: theme.accentText },
          isWarning && styles.valueWarning,
        ]}
        numberOfLines={isSingleColumn ? 2 : 1}
      >
        {value !== undefined && value !== null && value !== '' ? value : '...'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 44,
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
    minWidth: 0,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    flexShrink: 1,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '58%',
  },
  valueWarning: {
    color: '#FBBF24',
  },
});

export default SystemStatus;
