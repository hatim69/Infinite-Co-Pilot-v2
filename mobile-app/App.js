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
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Animated,
  Alert,
  AppState,
  Platform,
  Image,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from '@react-native-async-storage/async-storage';

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
import { getFlapString } from "./src/utils/calculatePerformance";

import SystemStatus from "./src/components/cards/SystemStatus";
import FlightStrip from "./src/components/layout/FlightStrip";
import CrewAssistant from "./src/components/assistant/CrewAssistant";
import BackgroundReliability from "./src/components/cards/BackgroundReliability";
import Sidebar from "./src/components/ui/Sidebar";
import Gatekeeper from "./src/components/ui/Gatekeeper";
import { BETA_EXPIRY_DATE, SUPABASE_URL } from "./src/utils/beta";
import * as Sentry from '@sentry/react-native';

const FLIGHT_DECK_MIN_PREP_MS = 900;
const FLIGHT_DECK_PREP_TIMEOUT_MS = 6000;

Sentry.init({
  dsn: 'https://66233b21396117323bd0f22ac62893bf@o4511750585450496.ingest.de.sentry.io/4511750588399696',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

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
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  const { theme, activeTheme } = useTheme();
  const window = useWindowDimensions();
  const responsive = useMemo(() => {
    const width = window.width || 0;
    const height = window.height || 0;
    const fontScale = window.fontScale || 1;
    const shortestSide = Math.min(width, height);
    const longestSide = Math.max(width, height);
    const isTinyWidth = width < 340;
    const isCompactWidth = width < 390;
    const isNarrow = width < 480;
    const isShort = height < 620;
    const isMicroWindow = width < 300 || height < 360;
    const isLandscape = width > height;
    const isTablet = shortestSide >= 600 || longestSide >= 900;
    const outerPadding = isTinyWidth ? 8 : isCompactWidth ? 10 : isNarrow ? 12 : 16;
    const pagePadding = isTinyWidth ? 0 : isCompactWidth ? 6 : isNarrow ? 10 : 16;
    const cardPadding = isTinyWidth ? 14 : isCompactWidth ? 18 : 24;
    const contentMaxWidth = isTablet ? 760 : undefined;

    return {
      width,
      height,
      fontScale,
      isTinyWidth,
      isCompactWidth,
      isNarrow,
      isShort,
      isMicroWindow,
      isLandscape,
      isTablet,
      outerPadding,
      pagePadding,
      cardPadding,
      contentMaxWidth,
      showHeaderTitle: width >= 260,
      showStatusLabel: width >= 310 && height >= 320,
    };
  }, [window.width, window.height, window.fontScale]);

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
  const [isBetaVerified, setIsBetaVerified] = useState(false);
  const [isBetaExpired, setIsBetaExpired] = useState(false);
  const [betaNetworkError, setBetaNetworkError] = useState(false);

  const {
    connectionStatus,
    connectedIp,
    telemetry,
    manualConnect,
    discoveredDevices,
    selectDevice,
    disconnectDevice,
    resetForConnectingFlight,
    handleAppStateChange: handleSessionAppStateChange,
    subscribeSessionEvents,
    whenAudioReady,
    setSpeechLogger,
    getVoicePreference,
    toggleVoice: toggleSessionVoice,
    setVoicePreference: setSessionVoicePreference,
  } = useTelemetry(disableAutoConnect || !isBetaVerified);

  useEffect(() => {
    let isMounted = true;
    const minimumPrep = new Promise((resolve) => setTimeout(resolve, FLIGHT_DECK_MIN_PREP_MS));
    const audioReady = Promise.race([
      whenAudioReady().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, FLIGHT_DECK_PREP_TIMEOUT_MS)),
    ]);

    const checkBetaStatus = async () => {
      try {
        const verified = await AsyncStorage.getItem('beta_verified');
        const masterVerified = await AsyncStorage.getItem('beta_verified_master');
        
        if (verified === 'true' || masterVerified === 'true') {
          setIsBetaVerified(true);
        }

        if (masterVerified === 'true') {
          return; // Master key bypasses expiration and network checks
        }
        
        // Use Supabase itself as the source of truth for internet time to avoid third-party API downtime
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, { method: 'HEAD' });
        const dateHeader = response.headers.get('date');
        
        if (!dateHeader) {
          throw new Error('No date header');
        }
        
        const currentUnix = new Date(dateHeader).getTime();
        const expiryUnix = new Date(BETA_EXPIRY_DATE).getTime();
        
        if (currentUnix > expiryUnix) {
          setIsBetaExpired(true);
        }
      } catch (e) {
        setBetaNetworkError(true);
      }
    };

    Promise.all([minimumPrep, audioReady, checkBetaStatus()]).finally(() => {
      if (isMounted) setIsSplashVisible(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // Sync initial voice preference
    setTimeout(() => {
      setVoicePreferenceState(getVoicePreference());
    }, 500);
  }, []);

  const scrollViewRef = useRef(null);
  const logScrollRef = useRef(null);

  const isActive = connectionStatus === "FLIGHT LINK ACTIVE";
  const isReconnecting = connectionStatus === "RECONNECTING...";
  const isConnected = isActive || isReconnecting;
  const isConnecting = connectionStatus === "CONNECTING..." || connectionStatus === "VERIFYING STATE...";



  // Wire up the speech logger
  useEffect(() => {
    setSpeechLogger((text) => {
      setLogs((prev) => [
        ...prev,
        { time: new Date().toLocaleTimeString(), text },
      ]);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSessionEvents((event) => {
      if (event?.type === "alert") {
        Alert.alert(event.title, event.message, event.buttons || [{ text: "OK" }]);
      }
    });

    return unsubscribe;
  }, []);

  // Track app background state
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setIsInBackground(state === "background" || state === "inactive");
      handleSessionAppStateChange(state);
    });
    return () => sub.remove();
  }, []);



  const toggleVoice = () => {
    const enabled = toggleSessionVoice();
    setVoiceEnabled(enabled);
  };

  const toggleVoiceGender = async () => {
    const next = voicePreference === "female" ? "male" : "female";
    await setSessionVoicePreference(next);
    setVoicePreferenceState(next);
  };

  const handleDisconnect = () => {
    disconnectDevice();
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

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logScrollRef.current) {
      setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [logs, dashboardPage, showLogs]);

  // ─── Splash Screen ────────────────────────────────────────────────────────
  const renderSplashScreen = () => (
    <View style={[styles.splashContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.splashLogoWrapper, responsive.isShort && styles.splashLogoWrapperCompact, { backgroundColor: theme.accentBg, borderColor: theme.accent }]}>
        <Plane size={responsive.isShort ? 38 : 60} color={theme.accent} />
      </View>
      <Text style={[styles.splashTitle, responsive.isTinyWidth && styles.splashTitleCompact, { color: theme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>
        Infinite Co-Pilot
      </Text>
      <Text style={[styles.splashSubtitle, responsive.isTinyWidth && styles.splashSubtitleCompact, { color: theme.accentText }]} numberOfLines={2}>
        PREPARING FLIGHT DECK...
      </Text>
    </View>
  );

  // ─── Connection Screen ────────────────────────────────────────────────────
  const renderConnectionScreen = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={responsive.outerPadding}
      style={styles.flexFill}
    >
      <ScrollView
        style={styles.flexFill}
        contentContainerStyle={[
          styles.centeredScrollContent,
          responsive.isShort && styles.centeredScrollContentShort,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.connectionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              padding: responsive.cardPadding,
              maxWidth: responsive.contentMaxWidth || 520,
            },
          ]}
        >
          {/* Status icon */}
          <View
            style={[
              styles.connectionIconWrapper,
              responsive.isShort && styles.connectionIconWrapperCompact,
              { backgroundColor: theme.iconBtn, borderColor: theme.borderMid },
            ]}
          >
            {isConnecting ? (
              <Radio size={responsive.isShort ? 32 : 40} color="#F59E0B" />
            ) : (
              <WifiOff size={responsive.isShort ? 32 : 40} color={theme.textDim} />
            )}
          </View>

          <Text
            style={[
              styles.connectionTitle,
              responsive.isTinyWidth && styles.connectionTitleCompact,
              { color: theme.textPrimary },
            ]}
          >
            {isConnecting
              ? "Connecting to Infinite Flight..."
              : discoveredDevices.length > 1
                ? "Multiple Clients Detected"
                : "No Simulator Detected"}
          </Text>
          <Text
            style={[
              styles.connectionSubtitle,
              responsive.isTinyWidth && styles.connectionSubtitleCompact,
              { color: theme.textMuted },
            ]}
          >
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
                  style={[
                    styles.deviceRow,
                    responsive.isTinyWidth && styles.deviceRowCompact,
                    { backgroundColor: theme.surfaceMid, borderColor: theme.border },
                  ]}
                  onPress={() => selectDevice(device.deviceId)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.deviceDot, { backgroundColor: theme.accentText }]} />
                  <View style={styles.deviceInfo}>
                    <Text style={[styles.deviceName, { color: theme.textSecondary }]} numberOfLines={1}>
                      {device.deviceName}
                    </Text>
                    <Text style={[styles.deviceIp, { color: theme.textMuted }]} numberOfLines={1}>
                      {device.ip}
                    </Text>
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
            <View style={[styles.manualRow, responsive.isTinyWidth && styles.manualRowStacked]}>
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
                style={[styles.connectBtn, responsive.isTinyWidth && styles.connectBtnStacked, { backgroundColor: theme.connectBtn }]}
                onPress={() => manualConnect(manualIp)}
                activeOpacity={0.8}
              >
                <Text style={styles.connectBtnText}>GO</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderDashboardPageShell = (children, options = {}) => (
    <View
      style={[
        styles.dashboardPage,
        { paddingHorizontal: responsive.pagePadding },
        responsive.contentMaxWidth && { maxWidth: responsive.contentMaxWidth, alignSelf: "center", width: "100%" },
      ]}
    >
      {options.scrollable === false ? (
        children
      ) : (
        <ScrollView
          style={styles.flexFill}
          contentContainerStyle={[
            styles.dashboardScrollContent,
            options.contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );

  const renderSystemsPage = (children) =>
    renderDashboardPageShell(
      <View style={[styles.systemsCard, { backgroundColor: theme.surfaceCard, borderColor: theme.borderSoft }]}>
        {children}
      </View>
    );

  // ─── Background Mode (Minimal) ────────────────────────────────────────────
  const renderBackgroundMode = () => (
    <View style={[styles.splashContainer, { backgroundColor: theme.surface, borderColor: theme.border, flex: 1, padding: 20 }]}>
      <View style={[styles.splashLogoWrapper, responsive.isShort && styles.splashLogoWrapperCompact, { backgroundColor: theme.accentBg, borderColor: theme.accent, marginBottom: 16 }]}>
        <PulseDot active={true} />
      </View>
      <Text style={[styles.splashTitle, responsive.isTinyWidth && styles.splashTitleCompact, { color: theme.textPrimary, textAlign: 'center', fontSize: responsive.isTinyWidth ? 20 : 22 }]}>Background Mode Active</Text>
      <Text style={[styles.splashSubtitle, responsive.isTinyWidth && styles.splashSubtitleCompact, { color: theme.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 8 }]}>
        UI rendering is minimized to conserve resources. Callouts and telemetry are running perfectly in the background.
      </Text>
    </View>
  );

  // ─── Dashboard ────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    return (
      <View style={{ flex: 1 }}>
        <View style={[styles.pagerHeader, responsive.isTinyWidth && styles.pagerHeaderCompact, { backgroundColor: theme.pagerHeader, borderColor: theme.border }]}>
          <TouchableOpacity
            style={styles.pagerBtn}
            onPress={() => setDashboardPage(p => p === 0 ? totalPages - 1 : p - 1)}
          >
            <ChevronLeft size={20} color={theme.textSlate} />
          </TouchableOpacity>
          <Text
            style={[styles.pagerTitle, responsive.isTinyWidth && styles.pagerTitleCompact, { color: theme.textSecondary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {pageTitles[dashboardPage]}
          </Text>
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
            renderDashboardPageShell(
              <>
              <CrewAssistant
                telemetry={telemetry}
                isConnected={isConnected}
                onResetConnectingFlight={resetForConnectingFlight}
                layoutMode={responsive.isTinyWidth ? "compact" : responsive.isTablet ? "tablet" : "default"}
              />
              <BackgroundReliability />
              <View style={[styles.card, responsive.isShort && styles.cardCompact, { backgroundColor: theme.surfaceMid, borderColor: theme.border }]}>
                <TouchableOpacity style={styles.cardHeader} onPress={() => setShowLogs((v) => !v)} activeOpacity={0.8}>
                  <View style={styles.cardHeaderLeft}>
                    <Radio size={14} color="#60A5FA" style={{ marginRight: 8 }} />
                    <Text style={[styles.cardTitle, { color: theme.textDim }]} numberOfLines={1}>Co-Pilot Speech Log</Text>
                    {logs.length > 1 && (
                      <View style={styles.logCountBadge}>
                        <Text style={styles.logCountText}>{logs.length}</Text>
                      </View>
                    )}
                  </View>
                  {showLogs ? <ChevronUp size={16} color={theme.textMuted} /> : <ChevronDown size={16} color={theme.textMuted} />}
                </TouchableOpacity>
                {showLogs && (
                  <View
                    style={[
                      styles.logsContainer,
                      responsive.isShort && styles.logsContainerCompact,
                      { backgroundColor: theme.logsBg, borderColor: theme.logsBorder },
                    ]}
                  >
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
              </>,
              { contentContainerStyle: styles.crewPageContent }
            )
          )}

          {/* Page 1: Flight Instruments */}
          {dashboardPage === 1 && (
            renderSystemsPage(
              <>
                <SectionHeader title="Flight Instruments" icon={Activity} color="#34D399" />
                <View style={styles.gridContainer}>
                  <SystemStatus label="IAS" value={telemetry.ias !== null ? `${Math.round(telemetry.ias)} kts` : null} icon={Activity} />
                  <SystemStatus label="GS" value={telemetry.gs !== null ? `${Math.round(telemetry.gs)} kts` : null} icon={Activity} />
                  <SystemStatus label="VS" value={telemetry.vs !== null ? `${Math.round(telemetry.vs)} fpm` : null} icon={Activity} />
                  <SystemStatus label="ALT" value={telemetry.msl !== null ? `${Math.round(telemetry.msl)} ft` : null} icon={Activity} />
                  <SystemStatus label="AGL" value={telemetry.agl !== null ? `${Math.round(telemetry.agl)} ft` : null} icon={Activity} />
                </View>
              </>
            )
          )}

          {/* Page 2: Aircraft & Cabin */}
          {dashboardPage === 2 && (
            renderSystemsPage(
              <>
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
              </>
            )
          )}

          {/* Page 3: Systems & Power */}
          {dashboardPage === 3 && (
            renderSystemsPage(
              <>
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
              </>
            )
          )}

          {/* Page 4: Ground Services */}
          {dashboardPage === 4 && (
            renderSystemsPage(
              <>
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
              </>
            )
          )}
        </FadeTransition>

        {isReconnecting && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 50, justifyContent: 'center', alignItems: 'center' }]}>
            <TouchableOpacity 
              activeOpacity={1} 
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface, opacity: 0.9 }]} 
            />
            <Radio size={48} color="#F59E0B" />
            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold', marginTop: 16 }}>Connection Lost</Text>
            <Text style={{ color: theme.textPrimary, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
              Trying to reconnect to simulator...
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.bg} />

      <View style={[styles.scrollContent, { flex: 1, padding: responsive.outerPadding, paddingBottom: responsive.outerPadding }]}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={[styles.header, responsive.isTinyWidth && styles.headerCompact]}>
          <View style={styles.headerLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image 
                source={activeTheme === 'silver' ? require('./assets/images/in_app_logo_light.png') : require('./assets/images/in_app_logo_dark.png')} 
                style={{ height: 24, width: 32, marginRight: 8 }}
                resizeMode="contain"
              />
              {responsive.showHeaderTitle && (
                <Text
                  style={[styles.title, { color: theme.textPrimary, fontSize: 16, lineHeight: 18, flexShrink: 1 }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  Infinite{"\n"}Co-Pilot
                </Text>
              )}
            </View>
            {isInBackground && isConnected && (
              <View style={[styles.backgroundBadge, { backgroundColor: theme.accentBg }]}>
                <Text style={[styles.backgroundBadgeText, { color: theme.accentText }]}>RUNNING IN BACKGROUND</Text>
              </View>
            )}
          </View>
          <View style={[styles.headerRight, responsive.isCompactWidth && styles.headerRightCompact]}>
            <TouchableOpacity onPress={() => setSidebarVisible(true)} style={[styles.iconBtn, { backgroundColor: theme.iconBtn, borderColor: theme.iconBtnBorder }]} activeOpacity={0.7}>
              <Settings size={18} color={theme.textSlate} />
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
                isActive
                  ? { backgroundColor: theme.accentBg, borderWidth: 1, borderColor: theme.accent }
                  : isReconnecting
                    ? { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderWidth: 1, borderColor: '#F59E0B' }
                    : isConnecting
                      ? styles.statusConnecting
                      : { backgroundColor: 'rgba(71, 85, 105, 0.3)', borderWidth: 1, borderColor: theme.border },
              ]}
            >
              <PulseDot active={isActive} />
              {responsive.showStatusLabel && (
                <Text style={[styles.statusText, { color: theme.textPrimary }]} numberOfLines={1}>
                  {isActive ? 'ACTIVE' : isReconnecting ? 'RECONNECTING' : isConnecting ? 'CONNECTING' : 'WAITING'}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Main content ──────────────────────────────────────────── */}
        {isSplashVisible ? (
          <FadeTransition key="splash">
            {renderSplashScreen()}
          </FadeTransition>
        ) : betaNetworkError ? (
          <FadeTransition key="networkError">
            <View style={[styles.splashContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.splashLogoWrapper, responsive.isShort && styles.splashLogoWrapperCompact, { backgroundColor: 'rgba(248, 113, 113, 0.1)', borderColor: '#F87171' }]}>
                <WifiOff size={responsive.isShort ? 32 : 40} color="#F87171" />
              </View>
              <Text style={[styles.splashTitle, responsive.isTinyWidth && styles.splashTitleCompact, { color: theme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>Network Required</Text>
              <Text style={[styles.splashSubtitle, responsive.isTinyWidth && styles.splashSubtitleCompact, { color: theme.textMuted, textAlign: 'center', marginHorizontal: 20 }]}>
                An active internet connection is required to verify the beta period.
              </Text>
            </View>
          </FadeTransition>
        ) : isBetaExpired ? (
          <FadeTransition key="expiredError">
            <View style={[styles.splashContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.splashLogoWrapper, responsive.isShort && styles.splashLogoWrapperCompact, { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: '#F59E0B' }]}>
                <Clock size={responsive.isShort ? 32 : 40} color="#F59E0B" />
              </View>
              <Text style={[styles.splashTitle, responsive.isTinyWidth && styles.splashTitleCompact, { color: theme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>Beta Expired</Text>
              <Text style={[styles.splashSubtitle, responsive.isTinyWidth && styles.splashSubtitleCompact, { color: theme.textMuted, textAlign: 'center', marginHorizontal: 20 }]}>
                The closed beta period has ended. Thank you for testing!
              </Text>
            </View>
          </FadeTransition>
        ) : !isBetaVerified ? (
          <FadeTransition key="gatekeeper">
            <Gatekeeper onVerify={() => setIsBetaVerified(true)} />
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
        voicePreference={voicePreference}
        toggleVoiceGender={toggleVoiceGender}
      />
    </SafeAreaView>
  );
}

// ─── Root Export (wraps with ThemeProvider) ────────────────────────────────────
export default Sentry.wrap(function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
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
    gap: 10,
  },
  headerCompact: {
    marginBottom: 10,
    marginTop: 4,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  headerRightCompact: {
    gap: 6,
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
    width: 44,
    height: 44,
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
    minHeight: 36,
    flexShrink: 1,
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
  splashLogoWrapperCompact: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 14,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  splashTitleCompact: {
    fontSize: 22,
    textAlign: "center",
  },
  splashSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  splashSubtitleCompact: {
    fontSize: 10,
    letterSpacing: 1,
    textAlign: "center",
  },

  // Connection screen
  centeredScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  centeredScrollContentShort: {
    justifyContent: "flex-start",
  },
  connectionCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    alignItems: "center",
    width: "100%",
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
  connectionIconWrapperCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 12,
  },
  connectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  connectionTitleCompact: {
    fontSize: 16,
  },
  connectionSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  connectionSubtitleCompact: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 0,
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
    gap: 10,
  },
  deviceRowCompact: {
    padding: 10,
  },
  deviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deviceInfo: {
    flex: 1,
    minWidth: 0,
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
  manualRowStacked: {
    flexDirection: "column",
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
    minHeight: 44,
  },
  connectBtnStacked: {
    width: "100%",
  },
  connectBtnText: {
    color: "white",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
  },

  // Dashboard
  dashboardPage: {
    flex: 1,
  },
  dashboardScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  crewPageContent: {
    paddingBottom: 20,
  },
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
  pagerHeaderCompact: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: 0,
    marginBottom: 10,
  },
  pagerTitle: {
    fontWeight: "bold",
    fontSize: 14,
    letterSpacing: 1.2,
    flex: 1,
    textAlign: "center",
    minWidth: 0,
  },
  pagerTitleCompact: {
    fontSize: 12,
    letterSpacing: 0.8,
  },
  pagerBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
  cardCompact: {
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingBottom: 10,
    marginBottom: 0,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
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
  logsContainerCompact: {
    minHeight: 120,
    height: 140,
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
