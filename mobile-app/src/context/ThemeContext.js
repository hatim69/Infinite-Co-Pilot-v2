/**
 * ThemeContext.js — Infinite Co-Pilot
 *
 * Provides three color themes:
 *  - 'default'  → Deep-space teal (the original official look)
 *  - 'silver'   → iPhone 17 Pro Max Silver (bright titanium light theme)
 *  - 'deepblue' → iPhone 17 Pro Max Deep Blue (rich ocean-navy dark theme)
 *
 * Usage:
 *   const { theme, activeTheme, setTheme } = useTheme();
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Theme Definitions ────────────────────────────────────────────────────────

export const THEMES = {
  default: {
    id: 'default',
    label: 'Official',
    swatch: ['#07111F', '#0D9488'],

    // Backgrounds
    bg: '#07111F',
    surface: 'rgba(15, 23, 42, 0.7)',
    surfaceStrong: 'rgba(15, 23, 42, 0.95)',
    surfaceMid: 'rgba(15, 23, 42, 0.6)',
    surfaceDeep: 'rgba(7, 17, 31, 0.95)',
    surfaceCard: 'rgba(15, 23, 42, 0.4)',
    surfaceLogs: 'rgba(7, 17, 31, 0.8)',
    overlayBg: 'rgba(0, 0, 0, 0.6)',

    // Borders
    border: '#1E293B',
    borderMid: 'rgba(51, 65, 85, 0.5)',
    borderSoft: 'rgba(51, 65, 85, 0.4)',
    borderDeep: '#0F172A',
    borderInner: 'rgba(30, 41, 59, 0.8)',

    // Accent / primary
    accent: '#0D9488',
    accentBg: 'rgba(13, 148, 136, 0.15)',
    accentBgStrong: 'rgba(13, 148, 136, 0.2)',
    accentBorder: '#0D9488',
    accentText: '#2DD4BF',
    accentActive: 'rgba(13, 148, 136, 0.08)',
    accentActiveBorder: 'rgba(13, 148, 136, 0.4)',

    // Text
    textPrimary: '#F8FAFC',
    textSecondary: '#E2E8F0',
    textMuted: '#64748B',
    textFaint: '#334155',
    textSlate: '#94A3B8',
    textLabel: '#CBD5E1',
    textDim: '#475569',

    // Status
    statusBar: 'light-content',
    iconBtn: 'rgba(30, 41, 59, 0.8)',
    iconBtnBorder: '#1E293B',

    // Specific UI
    connectBtn: '#0D9488',
    pagerHeader: 'rgba(15, 23, 42, 0.6)',
    crewAssistantBg: 'rgba(30, 41, 59, 0.8)',
    crewAssistantBorder: 'rgba(51, 65, 85, 0.8)',
    nextActionBg: 'rgba(15, 23, 42, 0.5)',
    logsBg: 'rgba(7, 17, 31, 0.8)',
    logsBorder: '#0F172A',
    sliderFill: '#34D399',
    sliderTrack: 'rgba(51, 65, 85, 0.6)',
    switchTrack: '#0D9488',
    inputBg: 'rgba(15, 23, 42, 0.9)',
  },

  silver: {
    id: 'silver',
    label: 'Silver',
    swatch: ['#E8EAED', '#9CA3AF'],

    // Backgrounds
    bg: '#F0F2F5',
    surface: 'rgba(255, 255, 255, 0.92)',
    surfaceStrong: 'rgba(255, 255, 255, 0.98)',
    surfaceMid: 'rgba(248, 249, 251, 0.9)',
    surfaceDeep: 'rgba(240, 242, 245, 0.98)',
    surfaceCard: 'rgba(255, 255, 255, 0.7)',
    surfaceLogs: 'rgba(230, 233, 238, 0.9)',
    overlayBg: 'rgba(0, 0, 0, 0.4)',

    // Borders
    border: '#D1D5DB',
    borderMid: 'rgba(156, 163, 175, 0.4)',
    borderSoft: 'rgba(156, 163, 175, 0.3)',
    borderDeep: '#C4C8CE',
    borderInner: 'rgba(209, 213, 219, 0.8)',

    // Accent / primary
    accent: '#6B7280',
    accentBg: 'rgba(107, 114, 128, 0.1)',
    accentBgStrong: 'rgba(107, 114, 128, 0.18)',
    accentBorder: '#9CA3AF',
    accentText: '#374151',
    accentActive: 'rgba(107, 114, 128, 0.08)',
    accentActiveBorder: 'rgba(107, 114, 128, 0.35)',

    // Text
    textPrimary: '#0F172A',
    textSecondary: '#1E293B',
    textMuted: '#6B7280',
    textFaint: '#9CA3AF',
    textSlate: '#6B7280',
    textLabel: '#374151',
    textDim: '#4B5563',

    // Status
    statusBar: 'dark-content',
    iconBtn: 'rgba(255, 255, 255, 0.85)',
    iconBtnBorder: '#D1D5DB',

    // Specific UI
    connectBtn: '#4B5563',
    pagerHeader: 'rgba(255, 255, 255, 0.8)',
    crewAssistantBg: 'rgba(255, 255, 255, 0.88)',
    crewAssistantBorder: 'rgba(209, 213, 219, 0.8)',
    nextActionBg: 'rgba(240, 242, 245, 0.7)',
    logsBg: 'rgba(230, 233, 238, 0.8)',
    logsBorder: '#C4C8CE',
    sliderFill: '#6B7280',
    sliderTrack: 'rgba(156, 163, 175, 0.4)',
    switchTrack: '#9CA3AF',
    inputBg: 'rgba(255, 255, 255, 0.9)',
  },

  deepblue: {
    id: 'deepblue',
    label: 'Deep Blue',
    swatch: ['#080E1A', '#3B82F6'],

    // Backgrounds
    bg: '#060C18',
    surface: 'rgba(8, 20, 40, 0.9)',
    surfaceStrong: 'rgba(6, 15, 32, 0.98)',
    surfaceMid: 'rgba(8, 20, 40, 0.75)',
    surfaceDeep: 'rgba(4, 10, 22, 0.98)',
    surfaceCard: 'rgba(10, 22, 44, 0.5)',
    surfaceLogs: 'rgba(4, 10, 22, 0.85)',
    overlayBg: 'rgba(0, 0, 8, 0.7)',

    // Borders
    border: '#1A2D4A',
    borderMid: 'rgba(59, 130, 246, 0.2)',
    borderSoft: 'rgba(26, 45, 74, 0.6)',
    borderDeep: '#0D1B32',
    borderInner: 'rgba(26, 45, 74, 0.9)',

    // Accent / primary
    accent: '#3B82F6',
    accentBg: 'rgba(59, 130, 246, 0.15)',
    accentBgStrong: 'rgba(59, 130, 246, 0.22)',
    accentBorder: '#3B82F6',
    accentText: '#93C5FD',
    accentActive: 'rgba(59, 130, 246, 0.1)',
    accentActiveBorder: 'rgba(59, 130, 246, 0.4)',

    // Text
    textPrimary: '#EFF6FF',
    textSecondary: '#DBEAFE',
    textMuted: '#4A6494',
    textFaint: '#1E3A5F',
    textSlate: '#7BA4D4',
    textLabel: '#BFDBFE',
    textDim: '#2D5080',

    // Status
    statusBar: 'light-content',
    iconBtn: 'rgba(10, 22, 44, 0.85)',
    iconBtnBorder: '#1A2D4A',

    // Specific UI
    connectBtn: '#3B82F6',
    pagerHeader: 'rgba(8, 20, 40, 0.7)',
    crewAssistantBg: 'rgba(8, 18, 36, 0.85)',
    crewAssistantBorder: 'rgba(59, 130, 246, 0.2)',
    nextActionBg: 'rgba(4, 12, 26, 0.6)',
    logsBg: 'rgba(4, 10, 22, 0.85)',
    logsBorder: '#0D1B32',
    sliderFill: '#3B82F6',
    sliderTrack: 'rgba(26, 45, 74, 0.8)',
    switchTrack: '#3B82F6',
    inputBg: 'rgba(6, 15, 32, 0.9)',
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext({
  theme: THEMES.default,
  activeTheme: 'default',
  setTheme: () => {},
});

const STORAGE_KEY = '@infinite_copilot_theme';

export function ThemeProvider({ children }) {
  const [activeTheme, setActiveTheme] = useState('default');

  // Load persisted theme on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && THEMES[saved]) {
          setActiveTheme(saved);
        }
      })
      .catch(() => {});
  }, []);

  const setTheme = (id) => {
    if (!THEMES[id]) return;
    setActiveTheme(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ theme: THEMES[activeTheme], activeTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
