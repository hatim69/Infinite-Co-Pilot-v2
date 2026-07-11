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
  SafeAreaView,
  ScrollView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Animated,
  AppState,
  Platform,
} from "react-native";
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
  const [showLogs, setShowLogs] = useState(true);
  const [isInBackground, setIsInBackground] = useState(false);

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
  const renderDashboard = () => (
    <View style={styles.dashboardGrid}>
      {/* Crew Assistant */}
      <CrewAssistant telemetry={telemetry} isConnected={isConnected} />

      {/* Systems Card */}
      <View style={styles.systemsCard}>
        <SectionHeader title="Aircraft" icon={Plane} color="#60A5FA" />
        <View style={styles.gridContainer}>
          <SystemStatus label="Aircraft" value={telemetry.name || "---"} icon={Plane} />
          <SystemStatus label="Livery" value={telemetry.livery || "---"} icon={Plane} />
          <SystemStatus
            label="Weight"
            value={telemetry.weight ? `${Math.round(telemetry.weight)} kg` : "---"}
            icon={Zap}
          />
        </View>

        <SectionHeader title="Performance" icon={Activity} color="#34D399" />
        <View style={styles.gridContainer}>
          <SystemStatus
            label="V1"
            value={telemetry.performance ? `${telemetry.performance.v1} kts` : "---"}
            icon={Activity}
          />
          <SystemStatus
            label="VR"
            value={telemetry.performance ? `${telemetry.performance.vr} kts` : "---"}
            icon={Activity}
          />
          <SystemStatus
            label="V2"
            value={telemetry.performance ? `${telemetry.performance.v2} kts` : "---"}
            icon={Activity}
          />
          <SystemStatus
            label="VREF"
            value={telemetry.performance ? `${telemetry.performance.vref} kts` : "---"}
            icon={Activity}
          />
          <SystemStatus
            label="Trim"
            value={telemetry.performance ? `${telemetry.performance.trim}` : "---"}
            icon={Crosshair}
          />
          <SystemStatus
            label="T/O Flaps"
            value={telemetry.performance ? `${telemetry.performance.takeoffFlaps}` : "---"}
            icon={ShieldAlert}
          />
        </View>

        <SectionHeader title="Flight Systems" icon={Settings} color="#60A5FA" />
        <View style={styles.gridContainer}>
          <SystemStatus
            label="Gear"
            value={
              telemetry.gear === 1
                ? "DOWN"
                : telemetry.gear === 2 || telemetry.gear === 5 || telemetry.gear === 0
                ? "UP"
                : telemetry.gear !== -1
                ? "MOVING"
                : "---"
            }
            icon={Crosshair}
          />
          <SystemStatus
            label="Flaps"
            value={getFlapString(telemetry.name, telemetry.flaps)}
            icon={ShieldAlert}
          />
          <SystemStatus
            label="Spoilers"
            value={
              telemetry.spoilers === 0
                ? "OFF"
                : telemetry.spoilers === 1
                ? "FLIGHT"
                : telemetry.spoilers === 2
                ? "ARMED"
                : "---"
            }
            icon={Droplet}
          />
          <SystemStatus
            label="Brakes"
            value={telemetry.brakes === 1 ? "SET" : telemetry.brakes === 0 ? "REL" : "---"}
            icon={ShieldAlert}
          />
          <SystemStatus
            label="Autopilot"
            value={telemetry.autopilot === 1 ? "ON" : telemetry.autopilot === 0 ? "OFF" : "---"}
            icon={Zap}
          />
          <SystemStatus
            label="VNAV"
            value={telemetry.vnav === 1 ? "ON" : telemetry.vnav === 0 ? "OFF" : "---"}
            icon={Zap}
          />
        </View>

        <SectionHeader title="Power & Engines" icon={Power} color="#FBBF24" />
        <View style={styles.gridContainer}>
          <SystemStatus
            label="Battery"
            value={
              telemetry.batteryVolts > 0
                ? `${telemetry.batteryVolts.toFixed(1)}V`
                : telemetry.batteryAmp > 0
                ? `${telemetry.batteryAmp.toFixed(1)}A`
                : telemetry.battery === 1
                ? "ON"
                : telemetry.battery === 0
                ? "OFF"
                : "---"
            }
            icon={Battery}
          />
          <SystemStatus
            label="APU"
            value={
              telemetry.apu === 0
                ? "OFF"
                : telemetry.apu === 1
                ? "STARTING"
                : telemetry.apu === 2
                ? "ON"
                : "---"
            }
            icon={Zap}
          />
          <SystemStatus
            label="Engines"
            value={
              Object.values(telemetry.engines || {}).some((s) => s === 2)
                ? `ENG ${Object.entries(telemetry.engines)
                    .filter(([, s]) => s === 2)
                    .map(([n]) => n)
                    .join(",")} ON`
                : Object.keys(telemetry.engines || {}).length > 0
                ? "OFF"
                : "---"
            }
            icon={Flame}
          />
          <SystemStatus
            label="Throttle"
            value={
              telemetry.throttle !== null ? `${Math.round(telemetry.throttle * 100)}%` : "---"
            }
            icon={Flame}
          />
        </View>

        <SectionHeader title="Cabin & Crew" icon={Users} color="#C084FC" />
        <View style={styles.gridContainer}>
          <SystemStatus
            label="Seatbelt"
            value={telemetry.seatbelt === 1 ? "ON" : telemetry.seatbelt === 0 ? "OFF" : "---"}
            icon={User}
          />
          <SystemStatus
            label="No Smoking"
            value={telemetry.smoking === 1 ? "ON" : telemetry.smoking === 0 ? "OFF" : "---"}
            icon={Ban}
          />
          <SystemStatus
            label="Local Time"
            value={telemetry.time !== "---" ? telemetry.time : "---"}
            icon={Clock}
          />
          <SystemStatus
            label="Airport"
            value={telemetry.airport !== "---" ? telemetry.airport : "---"}
            icon={Plane}
          />
        </View>

        <SectionHeader title="Ground Services" icon={ArrowLeftRight} color="#FB923C" />
        <View style={styles.gridContainer}>
          <SystemStatus
            label="Pushback"
            value={telemetry.pushback === 1 ? "ACTIVE" : telemetry.pushback === 0 ? "OFF" : "---"}
            icon={ArrowLeftRight}
          />
          <SystemStatus
            label="Belt Loader"
            value={
              telemetry.beltLoader === 1 ? "CONN" : telemetry.beltLoader === 0 ? "DISC" : "---"
            }
            icon={ArrowLeftRight}
          />
          <SystemStatus
            label="Catering"
            value={telemetry.catering === 1 ? "CONN" : telemetry.catering === 0 ? "DISC" : "---"}
            icon={ArrowLeftRight}
          />
          <SystemStatus
            label="GPU"
            value={telemetry.gpu === 1 ? "CONN" : telemetry.gpu === 0 ? "DISC" : "---"}
            icon={Zap}
          />
          <SystemStatus
            label="Pallet Loader"
            value={
              telemetry.palletLoader === 1 ? "CONN" : telemetry.palletLoader === 0 ? "DISC" : "---"
            }
            icon={ArrowLeftRight}
          />
          <SystemStatus
            label="Stairs"
            value={telemetry.stairs === 1 ? "CONN" : telemetry.stairs === 0 ? "DISC" : "---"}
            icon={ArrowLeftRight}
          />
        </View>

        <SectionHeader title="External Lights" icon={SunDim} color="#FACC15" />
        <View style={styles.gridContainer}>
          <SystemStatus
            label="Beacon"
            value={telemetry.beacon === 1 ? "ON" : telemetry.beacon === 0 ? "OFF" : "---"}
            icon={SunDim}
          />
          <SystemStatus
            label="Strobe"
            value={telemetry.strobe === 1 ? "ON" : telemetry.strobe === 0 ? "OFF" : "---"}
            icon={SunDim}
          />
          <SystemStatus
            label="Nav"
            value={telemetry.nav === 1 ? "ON" : telemetry.nav === 0 ? "OFF" : "---"}
            icon={SunDim}
          />
          <SystemStatus
            label="Landing"
            value={telemetry.landing === 1 ? "ON" : telemetry.landing === 0 ? "OFF" : "---"}
            icon={SunDim}
          />
        </View>
      </View>
    </View>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#07111F" />

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            {/* Voice toggle */}
            <TouchableOpacity onPress={toggleVoice} style={styles.iconBtn} activeOpacity={0.7}>
              {voiceEnabled ? (
                <Volume2 size={18} color="#34D399" />
              ) : (
                <VolumeX size={18} color="#F59E0B" />
              )}
            </TouchableOpacity>

            {/* Disconnect button when connected */}
            {isConnected && (
              <TouchableOpacity
                onPress={disconnectDevice}
                style={[styles.iconBtn, styles.iconBtnDanger]}
                activeOpacity={0.7}
              >
                <RefreshCw size={16} color="#F87171" />
              </TouchableOpacity>
            )}

            {/* Status badge */}
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
              <Text style={styles.statusText}>{connectionStatus}</Text>
            </View>
          </View>
        </View>

        {/* ── Flight Strip (when connected) ─────────────────────────── */}
        {isConnected && <FlightStrip telemetry={telemetry} />}

        {/* ── Main content ──────────────────────────────────────────── */}
        {isConnected ? renderDashboard() : renderConnectionScreen()}

        {/* ── Speech Log ────────────────────────────────────────────── */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardHeader}
            onPress={() => setShowLogs((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeaderLeft}>
              <Radio size={14} color="#60A5FA" style={{ marginRight: 8 }} />
              <Text style={styles.cardTitle}>Co-Pilot Speech Log</Text>
              {logs.length > 1 && (
                <View style={styles.logCountBadge}>
                  <Text style={styles.logCountText}>{logs.length}</Text>
                </View>
              )}
            </View>
            {showLogs ? (
              <ChevronUp size={16} color="#64748B" />
            ) : (
              <ChevronDown size={16} color="#64748B" />
            )}
          </TouchableOpacity>

          {showLogs && (
            <View style={styles.logsContainer}>
              <ScrollView
                ref={logScrollRef}
                style={styles.logsScroll}
                showsVerticalScrollIndicator={false}
              >
                {logs.map((log, i) => (
                  <View key={i} style={styles.logRow}>
                    <Text style={styles.logTime}>[{log.time}]</Text>
                    <Text style={styles.logText}>🎙️ "{log.text}"</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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
    flexDirection: "column",
    gap: 16,
  },
  systemsCard: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
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
