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
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import notifee, { AndroidImportance, AndroidColor } from '@notifee/react-native';

notifee.registerForegroundService((notification) => {
  return new Promise(() => {
    // The service will keep running as long as this promise is unresolved,
    // which keeps our socket polling and speech synthesis alive in the background.
  });
});
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

import { useTelemetry } from "./src/hooks/useTelemetry";
import { speechManager } from "./src/utils/speech";
import { getFlapString } from "./src/utils/calculatePerformance";

import SystemStatus from "./src/components/cards/SystemStatus";
import FlightStrip from "./src/components/layout/FlightStrip";
import CrewAssistant from "./src/components/assistant/CrewAssistant";

// ─── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ title, icon: Icon, color }) => (
  <View style={styles.sectionHeaderContainer}>
    {Icon && <Icon size={13} color={color} style={styles.sectionHeaderIcon} />}
    <Text style={styles.sectionHeader}>{title}</Text>
  </View>
);

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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const {
    connectionStatus,
    connectedIp,
    telemetry,
    manualConnect,
    discoveredDevices,
    selectDevice,
    disconnectDevice,
  } = useTelemetry();

  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), text: "System initialized. Awaiting simulator..." },
  ]);
  const [manualIp, setManualIp] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voicePreference, setVoicePreferenceState] = useState("female");
  const [showLogs, setShowLogs] = useState(true);
  const [isInBackground, setIsInBackground] = useState(false);

  useEffect(() => {
    // Sync initial voice preference
    setTimeout(() => {
      setVoicePreferenceState(speechManager.voicePreference);
    }, 500);
  }, []);

  const scrollViewRef = useRef(null);
  const logScrollRef = useRef(null);

  const isConnected = connectionStatus === "FLIGHT LINK ACTIVE";
  const isConnecting = connectionStatus === "CONNECTING...";

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

  // Manage Background Foreground Service (Persistent Notification)
  useEffect(() => {
    async function manageForegroundService() {
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
    setLogs([{ time: new Date().toLocaleTimeString(), text: "System initialized. Awaiting simulator..." }]);
  };

  const [dashboardPage, setDashboardPage] = useState(0);
  const totalPages = 5;
  const pageTitles = [
    "CREW ASSISTANT",
    "FLIGHT INSTRUMENTS",
    "AIRCRAFT & CABIN",
    "SYSTEMS & POWER",
    "GROUND & LIGHTS",
  ];

  // ─── Connection Screen ────────────────────────────────────────────────────
  const renderConnectionScreen = () => (
    <View style={styles.connectionCard}>
      {/* Status icon */}
      <View style={styles.connectionIconWrapper}>
        {isConnecting ? (
          <Radio size={40} color="#F59E0B" />
        ) : (
          <WifiOff size={40} color="#334155" />
        )}
      </View>

      <Text style={styles.connectionTitle}>
        {isConnecting ? "Connecting to Infinite Flight..." : "No Simulator Detected"}
      </Text>
      <Text style={styles.connectionSubtitle}>
        {isConnecting
          ? `Reaching out to ${connectedIp}...`
          : "Make sure Infinite Flight is running and your device is on the same WiFi network."}
      </Text>

      {/* Discovered Devices */}
      {discoveredDevices.length > 0 && (
        <View style={styles.discoveredSection}>
          <Text style={styles.discoveredLabel}>
            <Wifi size={12} color="#34D399" /> DETECTED DEVICES
          </Text>
          {discoveredDevices.map((device, i) => (
            <TouchableOpacity
              key={i}
              style={styles.deviceRow}
              onPress={() => selectDevice(device.deviceId)}
              activeOpacity={0.7}
            >
              <View style={styles.deviceDot} />
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{device.deviceName}</Text>
                <Text style={styles.deviceIp}>{device.ip}</Text>
              </View>
              <View style={styles.deviceConnectBtn}>
                <Text style={styles.deviceConnectText}>CONNECT</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Manual IP */}
      <View style={styles.manualSection}>
        <Text style={styles.manualLabel}>MANUAL IP OVERRIDE</Text>
        <View style={styles.manualRow}>
          <TextInput
            style={styles.input}
            placeholder="192.168.1.x"
            placeholderTextColor="#3D5268"
            value={manualIp}
            onChangeText={setManualIp}
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => manualConnect(manualIp)}
            activeOpacity={0.8}
          >
            <Text style={styles.connectBtnText}>GO</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ─── Dashboard ────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.pagerHeader}>
          <TouchableOpacity 
            style={styles.pagerBtn} 
            onPress={() => setDashboardPage(p => p === 0 ? totalPages - 1 : p - 1)}
          >
            <ChevronLeft size={20} color="#94A3B8" />
          </TouchableOpacity>
          <Text style={styles.pagerTitle}>{pageTitles[dashboardPage]}</Text>
          <TouchableOpacity 
            style={styles.pagerBtn} 
            onPress={() => setDashboardPage(p => p === totalPages - 1 ? 0 : p + 1)}
          >
            <ChevronRight size={20} color="#94A3B8" />
          </TouchableOpacity>
        </View>
        
        <View style={{ flex: 1 }}>
          {/* Page 0: Crew Assistant */}
          {dashboardPage === 0 && (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <CrewAssistant telemetry={telemetry} isConnected={isConnected} />
            <View style={[styles.card, { flex: 1, marginBottom: 20 }]}>
              <TouchableOpacity style={styles.cardHeader} onPress={() => setShowLogs((v) => !v)} activeOpacity={0.8}>
                <View style={styles.cardHeaderLeft}>
                  <Radio size={14} color="#60A5FA" style={{ marginRight: 8 }} />
                  <Text style={styles.cardTitle}>Co-Pilot Speech Log</Text>
                  {logs.length > 1 && (
                    <View style={styles.logCountBadge}>
                      <Text style={styles.logCountText}>{logs.length}</Text>
                    </View>
                  )}
                </View>
                {showLogs ? <ChevronUp size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
              </TouchableOpacity>
              {showLogs && (
                <View style={[styles.logsContainer, { flex: 1 }]}>
                  <ScrollView ref={logScrollRef} showsVerticalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1 }}>
                    {logs.map((log, index) => (
                      <View key={index} style={styles.logEntry}>
                        <Text style={styles.logTime}>{log.time}</Text>
                        <Text style={styles.logText}>{log.text}</Text>
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
              <View style={styles.systemsCard}>
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
              <View style={styles.systemsCard}>
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
              <View style={styles.systemsCard}>
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
                  <SystemStatus label="Battery" value={telemetry.batteryVolts > 0 ? `${telemetry.batteryVolts.toFixed(1)}V` : telemetry.batteryAmp > 0 ? `${telemetry.batteryAmp.toFixed(1)}A` : telemetry.battery === 1 ? "ON" : telemetry.battery === 0 ? "OFF" : null} icon={Battery} />
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
              <View style={styles.systemsCard}>
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
        </View>
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#07111F" />

      <View style={[styles.scrollContent, { flex: 1 }]}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Infinite Co-Pilot</Text>
            {isInBackground && isConnected && (
              <View style={styles.backgroundBadge}>
                <Text style={styles.backgroundBadgeText}>RUNNING IN BACKGROUND</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={toggleVoiceGender} style={[styles.iconBtn, { width: 'auto', paddingHorizontal: 10 }]} activeOpacity={0.7}>
              <Text style={{color: '#9CA3AF', fontSize: 11, fontWeight: 'bold'}}>{voicePreference === 'female' ? 'FEMALE' : 'MALE'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleVoice} style={styles.iconBtn} activeOpacity={0.7}>
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
                  ? styles.statusActive
                  : isConnecting
                  ? styles.statusConnecting
                  : styles.statusWaiting,
              ]}
            >
              <PulseDot active={isConnected} />
              <Text style={styles.statusText}>
                {isConnected ? 'ACTIVE' : isConnecting ? 'CONNECTING' : 'WAITING'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Main content ──────────────────────────────────────────── */}
        {isConnected ? renderDashboard() : renderConnectionScreen()}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07111F",
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
    color: "#F8FAFC",
    letterSpacing: -0.3,
  },
  backgroundBadge: {
    marginTop: 4,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  backgroundBadgeText: {
    color: "#2DD4BF",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderWidth: 1,
    borderColor: "#1E293B",
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
  statusActive: {
    backgroundColor: "rgba(13, 148, 136, 0.15)",
    borderWidth: 1,
    borderColor: "#0D9488",
  },
  statusConnecting: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  statusWaiting: {
    backgroundColor: "rgba(71, 85, 105, 0.3)",
    borderWidth: 1,
    borderColor: "#334155",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  // Connection screen
  connectionCard: {
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
  },
  connectionIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  connectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F1F5F9",
    textAlign: "center",
    marginBottom: 8,
  },
  connectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
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
    color: "#34D399",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  deviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34D399",
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600",
  },
  deviceIp: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  deviceConnectBtn: {
    backgroundColor: "rgba(13, 148, 136, 0.2)",
    borderWidth: 1,
    borderColor: "#0D9488",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deviceConnectText: {
    color: "#2DD4BF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  manualSection: {
    width: "100%",
  },
  manualLabel: {
    color: "#475569",
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
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 1,
    borderColor: "#1E293B",
    color: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  connectBtn: {
    backgroundColor: "#0D9488",
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
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  pagerTitle: {
    color: "#E2E8F0",
    fontWeight: "bold",
    fontSize: 14,
    letterSpacing: 1.2,
  },
  pagerBtn: {
    padding: 8,
  },
  systemsCard: {
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.4)",
    padding: 16,
  },
  sectionHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 41, 59, 0.8)",
    paddingBottom: 8,
    marginBottom: 12,
    marginTop: 16,
  },
  sectionHeaderIcon: {
    marginRight: 8,
  },
  sectionHeader: {
    color: "#475569",
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
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
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
    color: "#64748B",
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
    backgroundColor: "rgba(7, 17, 31, 0.8)",
    borderRadius: 10,
    padding: 12,
    height: 180,
    borderWidth: 1,
    borderColor: "#0F172A",
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
    color: "#334155",
    fontSize: 10,
    marginRight: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginTop: 2,
    flexShrink: 0,
  },
  logText: {
    color: "#CBD5E1",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
