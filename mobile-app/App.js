/**
 * App.js — Infinite Co-Pilot
 *
 * Main application shell. Handles:
 *  - Connection screen (discovery + manual IP)
 *  - Full-dashboard view when connected
 *  - Speech log
 *  - Background operation indicator
 */

import 'expo-dev-client';
import { useKeepAwake } from 'expo-keep-awake';
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Animated,
  AppState,
  Platform,
  Image,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from '@react-native-async-storage/async-storage';


import notifee, { AndroidImportance, AndroidColor, AndroidForegroundServiceType } from '@notifee/react-native';

if (Platform.OS === 'android' && notifee && notifee.registerForegroundService) {
  notifee.registerForegroundService((notification) => {
    return new Promise(() => {
      // The service will keep running as long as this promise is unresolved,
      // which keeps our socket polling and speech synthesis alive in the background.
    });
  });
}
import {
  Settings,
  Droplet,
  Battery,
  Flame,
  SunDim,
  ShieldAlert,
  Zap,
  Crosshair,
  ArrowLeftRight,
  User,
  Ban,
  Clock,
  Activity,
  Power,
  Users,
  Wifi,
  WifiOff,
  Plane,
  Radio,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react-native";

import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { useTelemetry } from "./src/hooks/useTelemetry";
import { speechManager } from "./src/utils/speech";
import { getFlapString } from "./src/utils/calculatePerformance";

import SystemStatus from "./src/components/cards/SystemStatus";
import FlightStrip from "./src/components/layout/FlightStrip";
import CrewAssistant from "./src/components/assistant/CrewAssistant";
import Sidebar from "./src/components/ui/Sidebar";

// ─── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ title, icon: Icon, color }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.sectionHeaderContainer, { borderBottomColor: theme.borderInner }]}>
      {Icon && <Icon size={13} color={color} style={styles.sectionHeaderIcon} />}
      <Text style={[styles.sectionHeader, { color: theme.textDim }]}>{title}</Text>
    </View>
  );
};

// ─── Pulsing dot for "live" indicator ─────────────────────────────────────────
const PulseDot = ({ active }) => {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim]);

  return (
    <Animated.View
      style={[
        styles.pulseDot,
        { opacity: anim, backgroundColor: active ? "#0D9488" : "#F59E0B" },
      ]}
    />
  );
};

// ─── FadeTransition ───────────────────────────────────────────────────────────
const FadeTransition = ({ children }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View style={{ flex: 1, opacity }}>
      {children}
    </Animated.View>
  );
};

// ─── Inner App (uses ThemeContext) ────────────────────────────────────────────
function AppInner() {
  useKeepAwake();
  const { theme } = useTheme();

  const [disableAutoConnect, setDisableAutoConnectState] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('disableAutoConnect').then(val => {
      if (val === 'true') setDisableAutoConnectState(true);
    });
  }, []);

  const setDisableAutoConnect = async (val) => {
    setDisableAutoConnectState(val);
    await AsyncStorage.setItem('disableAutoConnect', val.toString());
  };

  const {
    connectionStatus,
    connectedIp,
    telemetry,
    manualConnect,
    discoveredDevices,
    selectDevice,
    disconnectDevice,
  } = useTelemetry(disableAutoConnect);

  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), text: "System initialized. Awaiting simulator..." },
  ]);
  const [manualIp, setManualIp] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voicePreference, setVoicePreferenceState] = useState("female");
  const [showLogs, setShowLogs] = useState(true);
  const [isInBackground, setIsInBackground] = useState(false);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Sync initial voice preference
    setTimeout(() => {
      setVoicePreferenceState(speechManager.voicePreference);
    }, 500);

    // Request permissions on first open (Android 13+ & iOS)
    async function requestPermissions() {
      try {
        if (!notifee) return;
        await notifee.requestPermission();
      } catch (e) {
        console.log("Permission request failed:", e);
      }
    }
    requestPermissions();
  }, []);

  const scrollViewRef = useRef(null);
  const logScrollRef = useRef(null);

  const isConnected = connectionStatus === "FLIGHT LINK ACTIVE";
  const isConnecting = connectionStatus === "CONNECTING..." || connectionStatus === "VERIFYING STATE...";



  // Wire up the speech logger
  useEffect(() => {
    speechManager.setLogger((text) => {
      setLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), text },
      ]);
    });
  }, []);

  // Track app background state
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setIsInBackground(state === "background" || state === "inactive");
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    async function manageForegroundService() {
      if (!notifee) return;
      if (isConnected) {
        if (Platform.OS === 'android') {
          const channelId = await notifee.createChannel({
            id: 'flight_link',
            name: 'Flight Link Status',
            importance: AndroidImportance.LOW,
          });

          await notifee.displayNotification({
            title: 'Infinite Co-Pilot Active',
            body: 'Monitoring flight telemetry in the background.',
            android: {
              channelId,
              asForegroundService: true,
              foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
              color: notifee.AndroidColor?.AQUA || '#0D9488',
              ongoing: true,
            },
          });
        } else if (Platform.OS === 'ios') {
          // On iOS, we use a standard local notification since foreground services don't exist
          await notifee.requestPermission();
          await notifee.displayNotification({
            id: 'flight_link_ios',
            title: 'Infinite Co-Pilot Active',
            body: 'Monitoring flight telemetry in the background.',
          });
        }
      } else {
        if (Platform.OS === 'android') {
          await notifee.stopForegroundService();
        } else if (Platform.OS === 'ios') {
          await notifee.cancelNotification('flight_link_ios');
        }
      }
    }
    manageForegroundService();
  }, [isConnected]);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logScrollRef.current) {
      setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [logs]);

  const toggleVoice = () => {
    const enabled = speechManager.toggleVoice();
    setVoiceEnabled(enabled);
  };

  const toggleVoiceGender = async () => {
    const next = voicePreference === "female" ? "male" : "female";
    await speechManager.setVoicePreference(next);
    setVoicePreferenceState(next);
  };

  const handleDisconnect = () => {
    disconnectDevice();
    speechManager.stopAll();
  };

  useEffect(() => {
    if (connectionStatus === "CONNECTING...") {
      setLogs([{ time: new Date().toLocaleTimeString(), text: "Starting new flight session..." }]);
    }
  }, [connectionStatus]);

  const [dashboardPage, setDashboardPage] = useState(0);
  const totalPages = 5;
  const pageTitles = [
    "CREW ASSISTANT",
    "FLIGHT INSTRUMENTS",
    "AIRCRAFT & CABIN",
    "SYSTEMS & POWER",
    "GROUND & LIGHTS",
  ];

  // ─── Splash Screen ────────────────────────────────────────────────────────
  const renderSplashScreen = () => (
    <View style={[styles.splashContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.splashLogoWrapper, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
        <Plane size={60} color={theme.accent} />
      </View>
      <Text style={[styles.splashTitle, { color: theme.textPrimary }]}>Infinite Co-Pilot</Text>
      <Text style={[styles.splashSubtitle, { color: theme.accentText }]}>PREPARING FLIGHT DECK...</Text>
    </View>
  );

  // ─── Connection Screen ────────────────────────────────────────────────────
  const renderConnectionScreen = () => (
    <View style={[styles.connectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Status icon */}
      <View style={[styles.connectionIconWrapper, { backgroundColor: theme.iconBtn, borderColor: theme.borderMid }]}>
        {isConnecting ? (
          <Radio size={40} color="#F59E0B" />
        ) : (
          <WifiOff size={40} color={theme.textDim} />
        )}
      </View>

      <Text style={[styles.connectionTitle, { color: theme.textPrimary }]}>
        {isConnecting 
          ? "Connecting to Infinite Flight..." 
          : discoveredDevices.length > 1 
            ? "Multiple Clients Detected" 
            : "No Simulator Detected"}
      </Text>
      <Text style={[styles.connectionSubtitle, { color: theme.textMuted }]}>
        {isConnecting
          ? `Reaching out to ${connectedIp}...`
          : discoveredDevices.length > 1
            ? "Please select a simulator manually from the list below."
            : "Make sure Infinite Flight is running and your device is on the same WiFi network."}
      </Text>

      {/* Discovered Devices */}
      {discoveredDevices.length > 0 && (
        <View style={styles.discoveredSection}>
          <Text style={[styles.discoveredLabel, { color: theme.accentText }]}>
            <Wifi size={12} color={theme.accentText} /> DETECTED DEVICES
          </Text>
          {discoveredDevices.map((device, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.deviceRow, { backgroundColor: theme.surfaceMid, borderColor: theme.border }]}
              onPress={() => selectDevice(device.deviceId)}
              activeOpacity={0.7}
            >
              <View style={[styles.deviceDot, { backgroundColor: theme.accentText }]} />
              <View style={styles.deviceInfo}>
                <Text style={[styles.deviceName, { color: theme.textSecondary }]}>{device.deviceName}</Text>
                <Text style={[styles.deviceIp, { color: theme.textMuted }]}>{device.ip}</Text>
              </View>
              <View style={[styles.deviceConnectBtn, { backgroundColor: theme.accentBgStrong, borderColor: theme.accentBorder }]}>
                <Text style={[styles.deviceConnectText, { color: theme.accentText }]}>CONNECT</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Manual IP */}
      <View style={styles.manualSection}>
        <Text style={[styles.manualLabel, { color: theme.textDim }]}>MANUAL IP OVERRIDE</Text>
        <View style={styles.manualRow}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder="192.168.1.x"
            placeholderTextColor={theme.textFaint}
            value={manualIp}
            onChangeText={setManualIp}
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.connectBtn, { backgroundColor: theme.connectBtn }]}
            onPress={() => manualConnect(manualIp)}
            activeOpacity={0.8}
          >
            <Text style={styles.connectBtnText}>GO</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ─── Background Mode (Minimal) ────────────────────────────────────────────
  const renderBackgroundMode = () => (
    <View style={[styles.splashContainer, { backgroundColor: theme.surface, borderColor: theme.border, flex: 1, padding: 20 }]}>
      <View style={[styles.splashLogoWrapper, { backgroundColor: theme.accentBg, borderColor: theme.accent, marginBottom: 16 }]}>
        <PulseDot active={true} />
      </View>
      <Text style={[styles.splashTitle, { color: theme.textPrimary, textAlign: 'center', fontSize: 22 }]}>Background Mode Active</Text>
      <Text style={[styles.splashSubtitle, { color: theme.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 8 }]}>
        UI rendering is minimized to conserve resources. Callouts, TTS, and telemetry are running perfectly in the background.
      </Text>
    </View>
  );

  // ─── Dashboard ────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.pagerHeader, { backgroundColor: theme.pagerHeader, borderColor: theme.border }]}>
          <TouchableOpacity 
            style={styles.pagerBtn} 
            onPress={() => setDashboardPage(p => p === 0 ? totalPages - 1 : p - 1)}
          >
            <ChevronLeft size={20} color={theme.textSlate} />
          </TouchableOpacity>
          <Text style={[styles.pagerTitle, { color: theme.textSecondary }]}>{pageTitles[dashboardPage]}</Text>
          <TouchableOpacity 
            style={styles.pagerBtn} 
            onPress={() => setDashboardPage(p => p === totalPages - 1 ? 0 : p + 1)}
          >
            <ChevronRight size={20} color={theme.textSlate} />
          </TouchableOpacity>
        </View>
        
        <FadeTransition key={dashboardPage}>
          {/* Page 0: Crew Assistant */}
          {dashboardPage === 0 && (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
            {/* <CrewAssistant telemetry={telemetry} isConnected={isConnected} /> */}
            <View style={[styles.card, { flex: 1, marginBottom: 20, backgroundColor: theme.surfaceMid, borderColor: theme.border }]}>
              <TouchableOpacity style={styles.cardHeader} onPress={() => setShowLogs((v) => !v)} activeOpacity={0.8}>
                <View style={styles.cardHeaderLeft}>
                  <Radio size={14} color="#60A5FA" style={{ marginRight: 8 }} />
                  <Text style={[styles.cardTitle, { color: theme.textDim }]}>Co-Pilot Speech Log</Text>
                  {logs.length > 1 && (
                    <View style={styles.logCountBadge}>
                      <Text style={styles.logCountText}>{logs.length}</Text>
                    </View>
                  )}
                </View>
                {showLogs ? <ChevronUp size={16} color={theme.textMuted} /> : <ChevronDown size={16} color={theme.textMuted} />}
              </TouchableOpacity>
              {showLogs && (
                <View style={[styles.logsContainer, { flex: 1, backgroundColor: theme.logsBg, borderColor: theme.logsBorder }]}>
                  <ScrollView ref={logScrollRef} showsVerticalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1 }}>
                    {logs.map((log, index) => (
                      <View key={index} style={styles.logEntry}>
                        <Text style={[styles.logTime, { color: theme.textFaint }]}>{log.time}</Text>
                        <Text style={[styles.logText, { color: theme.textLabel }]}>{log.text}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
            </View>
          )}

          {/* Page 1: Flight Instruments */}
          {dashboardPage === 1 && (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.systemsCard, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSoft }]}>
                <SectionHeader title="Flight Instruments" icon={Activity} color="#34D399" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="IAS" value={telemetry.ias !== null ? `${Math.round(telemetry.ias)} kts` : null} icon={Activity} />
                  <SystemStatus label="GS" value={telemetry.gs !== null ? `${Math.round(telemetry.gs)} kts` : null} icon={Activity} />
                  <SystemStatus label="VS" value={telemetry.vs !== null ? `${Math.round(telemetry.vs)} fpm` : null} icon={Activity} />
                  <SystemStatus label="ALT" value={telemetry.msl !== null ? `${Math.round(telemetry.msl)} ft` : null} icon={Activity} />
                  <SystemStatus label="AGL" value={telemetry.agl !== null ? `${Math.round(telemetry.agl)} ft` : null} icon={Activity} />
                </View>
              </View>
            </ScrollView>
            </View>
          )}

          {/* Page 2: Aircraft & Cabin */}
          {dashboardPage === 2 && (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.systemsCard, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSoft }]}>
                <SectionHeader title="Aircraft" icon={Plane} color="#60A5FA" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="Aircraft" value={telemetry.name} icon={Plane} />
                  <SystemStatus label="Livery" value={telemetry.livery} icon={Plane} />
                  <SystemStatus label="Weight" value={telemetry.weight ? `${Math.round(telemetry.weight)} kg` : null} icon={Zap} />
                </View>
                <SectionHeader title="Performance" icon={Activity} color="#34D399" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="V1" value={telemetry.performance ? `${telemetry.performance.v1} kts` : null} icon={Activity} />
                  <SystemStatus label="VR" value={telemetry.performance ? `${telemetry.performance.vr} kts` : null} icon={Activity} />
                  <SystemStatus label="V2" value={telemetry.performance ? `${telemetry.performance.v2} kts` : null} icon={Activity} />
                  <SystemStatus label="VREF" value={telemetry.performance ? `${telemetry.performance.vref} kts` : null} icon={Activity} />
                  <SystemStatus label="Trim" value={telemetry.performance ? `${telemetry.performance.trim}` : null} icon={Crosshair} />
                  <SystemStatus label="T/O Flaps" value={telemetry.performance ? `${telemetry.performance.takeoffFlaps}` : null} icon={ShieldAlert} />
                </View>
                <SectionHeader title="Cabin & Crew" icon={Users} color="#C084FC" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="Seatbelt" value={telemetry.seatbelt === 1 ? "ON" : telemetry.seatbelt === 0 ? "OFF" : null} icon={User} />
                  <SystemStatus label="No Smoking" value={telemetry.smoking === 1 ? "ON" : telemetry.smoking === 0 ? "OFF" : null} icon={Ban} />
                  <SystemStatus label="Local Time" value={telemetry.time !== "---" ? telemetry.time : null} icon={Clock} />
                  <SystemStatus label="Airport" value={telemetry.airport !== "---" ? telemetry.airport : null} icon={Plane} />
                </View>
              </View>
            </ScrollView>
            </View>
          )}

          {/* Page 3: Systems & Power */}
          {dashboardPage === 3 && (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.systemsCard, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSoft }]}>
                <SectionHeader title="Flight Systems" icon={Settings} color="#60A5FA" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="Gear" value={telemetry.gear === 1 ? "DOWN" : telemetry.gear === 2 || telemetry.gear === 5 || telemetry.gear === 0 ? "UP" : telemetry.gear !== -1 && telemetry.gear !== null ? "MOVING" : null} icon={Crosshair} />
                  <SystemStatus label="Flaps" value={getFlapString(telemetry.name, telemetry.flaps)} icon={ShieldAlert} />
                  <SystemStatus label="Spoilers" value={telemetry.spoilers === 0 ? "OFF" : telemetry.spoilers === 1 ? "FLIGHT" : telemetry.spoilers === 2 ? "ARMED" : null} icon={Droplet} />
                  <SystemStatus label="Brakes" value={telemetry.brakes === 1 ? "SET" : telemetry.brakes === 0 ? "REL" : null} icon={ShieldAlert} />
                  <SystemStatus label="Autopilot" value={telemetry.autopilot === 1 ? "ON" : telemetry.autopilot === 0 ? "OFF" : null} icon={Zap} />
                  <SystemStatus label="VNAV" value={telemetry.vnav === 1 ? "ON" : telemetry.vnav === 0 ? "OFF" : null} icon={Zap} />
                </View>
                <SectionHeader title="Power & Engines" icon={Power} color="#FBBF24" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="Battery" value={telemetry.battery === 1 ? "ON" : telemetry.battery === 0 ? "OFF" : null} icon={Battery} />
                  <SystemStatus label="APU" value={telemetry.apu === 0 ? "OFF" : telemetry.apu === 1 ? "STARTING" : telemetry.apu === 2 ? "ON" : null} icon={Zap} />
                  <SystemStatus label="Engines" value={Object.values(telemetry.engines || {}).some((s) => s === 2) ? `ENG ${Object.entries(telemetry.engines).filter(([, s]) => s === 2).map(([n]) => n).join(",")} ON` : Object.keys(telemetry.engines || {}).length > 0 ? "OFF" : null} icon={Flame} />
                  <SystemStatus label="Throttle" value={telemetry.throttle !== null ? `${Math.round(telemetry.throttle * 100)}%` : null} icon={Flame} />
                </View>
              </View>
            </ScrollView>
            </View>
          )}

          {/* Page 4: Ground Services */}
          {dashboardPage === 4 && (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[styles.systemsCard, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSoft }]}>
                <SectionHeader title="Ground Services" icon={ArrowLeftRight} color="#FB923C" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="Pushback" value={telemetry.pushback === 1 ? "ACTIVE" : telemetry.pushback === 0 ? "OFF" : null} icon={ArrowLeftRight} />
                  <SystemStatus label="Belt Loader" value={telemetry.beltLoader === 1 ? "CONN" : telemetry.beltLoader === 0 ? "DISC" : null} icon={ArrowLeftRight} />
                  <SystemStatus label="Catering" value={telemetry.catering === 1 ? "CONN" : telemetry.catering === 0 ? "DISC" : null} icon={ArrowLeftRight} />
                  <SystemStatus label="GPU" value={telemetry.gpu === 1 ? "CONN" : telemetry.gpu === 0 ? "DISC" : null} icon={Zap} />
                  <SystemStatus label="Pallet Loader" value={telemetry.palletLoader === 1 ? "CONN" : telemetry.palletLoader === 0 ? "DISC" : null} icon={ArrowLeftRight} />
                  <SystemStatus label="Stairs" value={telemetry.stairs === 1 ? "CONN" : telemetry.stairs === 0 ? "DISC" : null} icon={ArrowLeftRight} />
                </View>
                <SectionHeader title="External Lights" icon={SunDim} color="#FACC15" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="Beacon" value={telemetry.beacon === 1 ? "ON" : telemetry.beacon === 0 ? "OFF" : null} icon={SunDim} />
                  <SystemStatus label="Strobe" value={telemetry.strobe === 1 ? "ON" : telemetry.strobe === 0 ? "OFF" : null} icon={SunDim} />
                  <SystemStatus label="Nav" value={telemetry.nav === 1 ? "ON" : telemetry.nav === 0 ? "OFF" : null} icon={SunDim} />
                  <SystemStatus label="Landing" value={telemetry.landing === 1 ? "ON" : telemetry.landing === 0 ? "OFF" : null} icon={SunDim} />
                </View>
              </View>
            </ScrollView>
            </View>
          )}
        </FadeTransition>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.bg} />

      <View style={[styles.scrollContent, { flex: 1 }]}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Infinite Co-Pilot</Text>
            {isInBackground && isConnected && (
              <View style={[styles.backgroundBadge, { backgroundColor: theme.accentBg }]}>
                <Text style={[styles.backgroundBadgeText, { color: theme.accentText }]}>RUNNING IN BACKGROUND</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setSidebarVisible(true)} style={[styles.iconBtn, { backgroundColor: theme.iconBtn, borderColor: theme.iconBtnBorder }]} activeOpacity={0.7}>
              <Settings size={18} color={theme.textSlate} />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleVoiceGender} style={[styles.iconBtn, { width: 'auto', paddingHorizontal: 10, backgroundColor: theme.iconBtn, borderColor: theme.iconBtnBorder }]} activeOpacity={0.7}>
              <Text style={{color: theme.textSlate, fontSize: 11, fontWeight: 'bold'}}>{voicePreference === 'female' ? 'FEMALE' : 'MALE'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleVoice} style={[styles.iconBtn, { backgroundColor: theme.iconBtn, borderColor: theme.iconBtnBorder }]} activeOpacity={0.7}>
              {voiceEnabled ? (
                <Volume2 size={18} color="#34D399" />
              ) : (
                <VolumeX size={18} color="#F59E0B" />
              )}
            </TouchableOpacity>

            {isConnected && (
              <TouchableOpacity
                onPress={handleDisconnect}
                style={[styles.iconBtn, styles.iconBtnDanger]}
                activeOpacity={0.7}
              >
                <RefreshCw size={16} color="#F87171" />
              </TouchableOpacity>
            )}

            <View
              style={[
                styles.statusBadge,
                isConnected
                  ? { backgroundColor: theme.accentBg, borderWidth: 1, borderColor: theme.accent }
                  : isConnecting
                  ? styles.statusConnecting
                  : { backgroundColor: 'rgba(71, 85, 105, 0.3)', borderWidth: 1, borderColor: theme.border },
              ]}
            >
              <PulseDot active={isConnected} />
              <Text style={[styles.statusText, { color: theme.textPrimary }]}>
                {isConnected ? 'ACTIVE' : isConnecting ? 'CONNECTING' : 'WAITING'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Main content ──────────────────────────────────────────── */}
        {isSplashVisible ? (
          <FadeTransition key="splash">
            {renderSplashScreen()}
          </FadeTransition>
        ) : (
          <FadeTransition key={isConnected ? (isBackgroundMode ? "backgroundMode" : "dashboard") : "connection"}>
            {isConnected ? (isBackgroundMode ? renderBackgroundMode() : renderDashboard()) : renderConnectionScreen()}
          </FadeTransition>
        )}
      </View>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <Sidebar 
        visible={sidebarVisible} 
        onClose={() => setSidebarVisible(false)} 
        isBackgroundMode={isBackgroundMode}
        setIsBackgroundMode={setIsBackgroundMode}
        disableAutoConnect={disableAutoConnect}
        setDisableAutoConnect={setDisableAutoConnect}
      />
    </SafeAreaView>
  );
}

// ─── Root Export (wraps with ThemeProvider) ────────────────────────────────────
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    marginTop: 8,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  backgroundBadge: {
    marginTop: 4,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  backgroundBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDanger: {
    borderColor: "rgba(248, 113, 113, 0.3)",
    backgroundColor: "rgba(248, 113, 113, 0.1)",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusConnecting: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  // Splash Screen
  splashContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
  },
  splashLogoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  splashSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },

  // Connection screen
  connectionCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  connectionIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  connectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  connectionSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  discoveredSection: {
    width: "100%",
    marginBottom: 20,
  },
  discoveredLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  deviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: "600",
  },
  deviceIp: {
    fontSize: 12,
    marginTop: 2,
  },
  deviceConnectBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deviceConnectText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  manualSection: {
    width: "100%",
  },
  manualLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  manualRow: {
    flexDirection: "row",
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  connectBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 60,
  },
  connectBtnText: {
    color: "white",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
  },

  // Dashboard
  dashboardGrid: {
    gap: 16,
  },
  pagerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 1,
  },
  pagerTitle: {
    fontWeight: "bold",
    fontSize: 14,
    letterSpacing: 1.2,
  },
  pagerBtn: {
    padding: 8,
  },
  systemsCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  sectionHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingBottom: 8,
    marginBottom: 12,
    marginTop: 16,
  },
  sectionHeaderIcon: {
    marginRight: 8,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },

  // Cards
  card: {
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 0,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  logCountBadge: {
    marginLeft: 8,
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  logCountText: {
    color: "#60A5FA",
    fontSize: 10,
    fontWeight: "700",
  },

  // Logs
  logsContainer: {
    borderRadius: 10,
    padding: 12,
    height: 180,
    borderWidth: 1,
    marginTop: 12,
  },
  logsScroll: {
    flex: 1,
  },
  logRow: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-start",
  },
  logTime: {
    fontSize: 10,
    marginRight: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    lineHeight: 18,
    flexShrink: 0,
  },
  logEntry: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-start",
  },
  logText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
    lineHeight: 18,
  },
});
