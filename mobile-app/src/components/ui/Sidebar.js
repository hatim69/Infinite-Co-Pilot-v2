/**
 * Sidebar.js — Infinite Co-Pilot
 *
 * A slide-in settings panel from the right edge.
 * Sections:
 *  1. Appearance — 3 theme swatches
 *  2. Audio      — volume sliders + chime toggle
 *  3. About      — app version + Discord link
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Switch,
  Linking,
  ScrollView,
  Dimensions,
  Platform,
  Modal,
  TextInput,
  Alert
} from 'react-native';
import { X, Volume2, Palette, Info, MessageCircle, Check, Settings, Bug } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';

import { useTheme, THEMES } from '../../context/ThemeContext';
import { speechManager } from '../../utils/speech';
import Slider from './Slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.min(SCREEN_WIDTH * 0.88, 360);
const APP_VERSION = '1.0.2';
const DISCORD_URL = 'https://discord.gg/hb3HkrfBEK';

// ─── Theme Swatch ─────────────────────────────────────────────────────────────

function ThemeSwatch({ themeKey, themeData, isActive, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress(themeKey);
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.swatchWrapper}>
      <Animated.View
        style={[
          styles.swatchCard,
          {
            backgroundColor: themeData.swatch[0],
            borderColor: isActive ? themeData.swatch[1] : 'rgba(255,255,255,0.1)',
            borderWidth: isActive ? 2 : 1,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Mini preview stripes */}
        <View style={[styles.swatchAccent, { backgroundColor: themeData.swatch[1] }]} />
        <View style={[styles.swatchBar, { backgroundColor: themeData.swatch[1] + '60' }]} />
        <View style={[styles.swatchBar, { backgroundColor: themeData.swatch[1] + '30', width: '60%' }]} />

        {/* Active check */}
        {isActive && (
          <View style={[styles.swatchCheck, { backgroundColor: themeData.swatch[1] }]}>
            <Check size={10} color="#FFFFFF" strokeWidth={3} />
          </View>
        )}
      </Animated.View>
      <Text
        style={[
          styles.swatchLabel,
          { color: isActive ? themeData.swatch[1] : '#94A3B8', fontWeight: isActive ? '700' : '500' },
        ]}
      >
        {themeData.label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Volume Slider Row ─────────────────────────────────────────────────────────

function VolumeSliderRow({ label, value, onValueChange, theme }) {
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderLabelRow}>
        <Text style={[styles.sliderLabel, { color: theme.textLabel }]}>{label}</Text>
        <Text style={[styles.sliderValue, { color: theme.textSlate }]}>
          {Math.round(value * 100)}%
        </Text>
      </View>
      <Slider
        minimumValue={0}
        maximumValue={1}
        value={value}
        onValueChange={onValueChange}
        fillColor={theme.sliderFill}
        trackColor={theme.sliderTrack}
      />
    </View>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SidebarSection({ icon: Icon, title, theme, children }) {
  return (
    <View style={[styles.section, { borderTopColor: theme.borderMid }]}>
      <View style={styles.sectionHeader}>
        <Icon size={13} color={theme.accent} style={{ marginRight: 7 }} />
        <Text style={[styles.sectionTitle, { color: theme.textDim }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar({ visible, onClose, isBackgroundMode, setIsBackgroundMode, disableAutoConnect, setDisableAutoConnect, voicePreference, toggleVoiceGender }) {
  const { theme, activeTheme, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Control modal mount state for exit animations
  const [isModalVisible, setModalVisible] = useState(visible);

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);

  const handleFeedbackSubmit = () => {
    if (!feedbackText.trim() || !feedbackEmail.trim()) return;
    setIsSendingFeedback(true);
    try {
      const eventId = Sentry.captureMessage("User Feedback Submitted");
      Sentry.captureEvent({
        type: 'feedback',
        level: 'info',
        contexts: {
          feedback: {
            message: feedbackText,
            contact_email: feedbackEmail,
            name: "Beta Tester",
            associated_event_id: eventId,
          }
        }
      });
      setFeedbackText('');
      setFeedbackEmail('');
      Alert.alert("Feedback Sent", "Thank you for helping us improve!");
    } catch (e) {
      console.log("Feedback error:", e);
      Alert.alert("Error", "Failed to send feedback. Please try again.");
    }
    setIsSendingFeedback(false);
  };

  const [volumes, setVolumes] = useState({
    masterVolume: 1.0,
    coPilotVolume: 1.0,
    boardingMusicVolume: 0.5,
    safetyBriefingVolume: 1.0,
    chimeEnabled: true,
  });

  // Sync volumes when sidebar opens
  useEffect(() => {
    if (visible) {
      setVolumes({
        masterVolume: speechManager.masterVolume,
        coPilotVolume: speechManager.coPilotVolume,
        boardingMusicVolume: speechManager.boardingMusicVolume,
        safetyBriefingVolume: speechManager.safetyBriefingVolume,
        chimeEnabled: speechManager.chimeEnabled,
      });
    }
  }, [visible]);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: false,
          damping: 22,
          stiffness: 200,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: false,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [visible, translateX, backdropOpacity]);

  const updateVolume = (key, value) => {
    setVolumes((prev) => ({ ...prev, [key]: value }));
    speechManager.setVolumes({ [key]: value });
  };

  const openDiscord = () => {
    Linking.openURL(DISCORD_URL).catch(() => { });
  };

  if (!isModalVisible) return null;

  return (
    <Modal visible={isModalVisible} transparent={true} animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }} pointerEvents="box-none">
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              styles.backdrop,
              { opacity: backdropOpacity, backgroundColor: theme.overlayBg },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Panel */}
        <Animated.View
          style={[
            styles.panel,
            {
              width: SIDEBAR_WIDTH,
              backgroundColor: theme.surfaceStrong,
              borderLeftColor: theme.border,
              transform: [{ translateX }],
              marginTop: insets.top,
              marginBottom: insets.bottom,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.panelHeader, { borderBottomColor: theme.borderMid }]}>
            <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Settings</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.iconBtn, borderColor: theme.iconBtnBorder }]} activeOpacity={0.7}>
              <X size={18} color={theme.textSlate} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* ── General ─────────────────────────────────────────────── */}
            <SidebarSection icon={Settings} title="GENERAL" theme={theme}>
              <View style={[styles.toggleRow, { borderTopWidth: 0, marginTop: 0, paddingTop: 4 }]}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={[styles.sliderLabel, { color: theme.textLabel }]}>Background Mode</Text>
                  <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
                    Minimizes UI to save performance. Callouts and TTS continue running.
                  </Text>
                </View>
                <Switch
                  value={isBackgroundMode}
                  onValueChange={setIsBackgroundMode}
                  trackColor={{ false: theme.borderMid, true: theme.switchTrack }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.sliderTrack}
                />
              </View>

              <View style={[styles.toggleRow, { borderTopColor: theme.borderMid }]}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={[styles.sliderLabel, { color: theme.textLabel }]}>Disable Auto-Connect</Text>
                  <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
                    Require manual connection to the simulator.
                  </Text>
                </View>
                <Switch
                  value={disableAutoConnect}
                  onValueChange={setDisableAutoConnect}
                  trackColor={{ false: theme.borderMid, true: theme.switchTrack }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.sliderTrack}
                />
              </View>
            </SidebarSection>

            {/* ── Appearance ─────────────────────────────────────────────── */}
            <SidebarSection icon={Palette} title="APPEARANCE" theme={theme}>
              <View style={styles.swatchRow}>
                {Object.entries(THEMES).map(([key, td]) => (
                  <ThemeSwatch
                    key={key}
                    themeKey={key}
                    themeData={td}
                    isActive={activeTheme === key}
                    onPress={setTheme}
                  />
                ))}
              </View>
            </SidebarSection>

            {/* ── Audio ──────────────────────────────────────────────────── */}
            <SidebarSection icon={Volume2} title="AUDIO" theme={theme}>
              <VolumeSliderRow
                label="Master Volume"
                value={volumes.masterVolume}
                onValueChange={(val) => updateVolume('masterVolume', val)}
                theme={theme}
              />
              <VolumeSliderRow
                label="Co-Pilot Voice"
                value={volumes.coPilotVolume}
                onValueChange={(val) => updateVolume('coPilotVolume', val)}
                theme={theme}
              />
              <VolumeSliderRow
                label="Boarding Music"
                value={volumes.boardingMusicVolume}
                onValueChange={(val) => updateVolume('boardingMusicVolume', val)}
                theme={theme}
              />
              <VolumeSliderRow
                label="Safety Briefing"
                value={volumes.safetyBriefingVolume}
                onValueChange={(val) => updateVolume('safetyBriefingVolume', val)}
                theme={theme}
              />

              {/* Voice Gender toggle */}
              <View style={[styles.toggleRow, { borderTopColor: theme.borderMid }]}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={[styles.sliderLabel, { color: theme.textLabel }]}>Co-Pilot Voice</Text>
                  <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
                    Choose between male and female voices
                  </Text>
                </View>
                <TouchableOpacity onPress={toggleVoiceGender} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.surfaceMid || 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: theme.borderMid }} activeOpacity={0.7}>
                  <Text style={{ color: theme.textPrimary, fontSize: 11, fontWeight: 'bold' }}>{voicePreference === 'female' ? 'FEMALE' : 'MALE'}</Text>
                </TouchableOpacity>
              </View>

              {/* Chime toggle */}
              <View style={[styles.toggleRow, { borderTopColor: theme.borderMid }]}>
                <View>
                  <Text style={[styles.sliderLabel, { color: theme.textLabel }]}>Notification Chime</Text>
                  <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
                    Play chime with sign changes
                  </Text>
                </View>
                <Switch
                  value={volumes.chimeEnabled}
                  onValueChange={(val) => updateVolume('chimeEnabled', val)}
                  trackColor={{ false: theme.borderMid, true: theme.switchTrack }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.sliderTrack}
                />
              </View>
            </SidebarSection>

            {/* ── Testing ────────────────────────────────────────────────── */}
            {/* <SidebarSection icon={Volume2} title="TESTING" theme={theme}>
              <TouchableOpacity
                style={[styles.discordBtn, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}
                onPress={() => {
                  const welcomeText = "Ladies and gentlemen, welcome to our test airport. We have safely landed, and the local time is currently 12:00 PM with an outside temperature of 25°C. We hope you enjoyed the cruise, and we look forward to welcoming you on board again soon.";
                  const pollyVoice = speechManager.voicePreference === "male" ? "Matthew" : "Ruth";
                  speechManager.speakWithPollyFallback(welcomeText, pollyVoice, { tone: "briefing" });
                }}
                activeOpacity={0.75}
              >
                <Volume2 size={16} color={theme.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.discordLabel, { color: theme.textPrimary }]}>Test Arrival Message</Text>
                  <Text style={[styles.discordSub, { color: theme.textMuted }]}>
                    Plays the arrival announcement
                  </Text>
                </View>
              </TouchableOpacity>
            </SidebarSection> */}

            {/* ── Feedback ────────────────────────────────────────────────── */}
            <SidebarSection icon={Bug} title="FEEDBACK & BUGS" theme={theme}>
              <View style={[styles.feedbackContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.feedbackInput, { color: theme.textPrimary, borderColor: theme.borderMid, backgroundColor: theme.inputBg || 'rgba(0,0,0,0.1)' }]}
                  placeholder="Email"
                  placeholderTextColor={theme.textFaint || '#64748B'}
                  value={feedbackEmail}
                  onChangeText={setFeedbackEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextInput
                  style={[styles.feedbackInput, styles.feedbackTextArea, { color: theme.textPrimary, borderColor: theme.borderMid, backgroundColor: theme.inputBg || 'rgba(0,0,0,0.1)' }]}
                  placeholder="What's on your mind? Found a bug?"
                  placeholderTextColor={theme.textFaint || '#64748B'}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  multiline={true}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder, opacity: (!feedbackText.trim() || !feedbackEmail.trim() || isSendingFeedback) ? 0.5 : 1 }]}
                  onPress={handleFeedbackSubmit}
                  disabled={!feedbackText.trim() || !feedbackEmail.trim() || isSendingFeedback}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.submitBtnText, { color: theme.accent }]}>
                    {isSendingFeedback ? "SENDING..." : "SUBMIT FEEDBACK"}
                  </Text>
                </TouchableOpacity>
              </View>
            </SidebarSection>

            {/* ── About ──────────────────────────────────────────────────── */}
            <SidebarSection icon={Info} title="ABOUT" theme={theme}>
              {/* Version row */}
              <View style={[styles.aboutRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <View>
                  <Text style={[styles.aboutAppName, { color: theme.textPrimary }]}>Infinite Co-Pilot</Text>
                  <Text style={[styles.aboutSub, { color: theme.textMuted }]}>
                    Real-time flight assistant
                  </Text>
                </View>
                <View style={[styles.versionBadge, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}>
                  <Text style={[styles.versionText, { color: theme.accentText }]}>v{APP_VERSION}</Text>
                </View>
              </View>

              {/* Discord button */}
              <TouchableOpacity
                style={[styles.discordBtn, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}
                onPress={openDiscord}
                activeOpacity={0.75}
              >
                <MessageCircle size={16} color={theme.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.discordLabel, { color: theme.textPrimary }]}>Join our Discord</Text>
                  <Text style={[styles.discordSub, { color: theme.textMuted }]}>
                    Community, support, bug-reports & updates
                  </Text>
                </View>
                <View style={[styles.discordArrow, { backgroundColor: theme.accentBgStrong }]}>
                  <Text style={[styles.discordArrowText, { color: theme.accent }]}>↗</Text>
                </View>
              </TouchableOpacity>
            </SidebarSection>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },

  // Header
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollArea: {
    flex: 1,
  },
  scrollContent: {
  },

  // Sections
  section: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Theme swatches
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  swatchWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  swatchCard: {
    width: '100%',
    aspectRatio: 0.85,
    borderRadius: 14,
    padding: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    gap: 5,
  },
  swatchAccent: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 24,
    height: 4,
    borderRadius: 2,
  },
  swatchBar: {
    height: 5,
    borderRadius: 3,
    width: '100%',
  },
  swatchCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Volume sliders
  sliderRow: {
    marginBottom: 14,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sliderLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  sliderValue: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },

  // Chime toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    marginBottom: 8,
  },
  toggleSub: {
    fontSize: 11,
    marginTop: 3,
  },

  // About section
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  aboutAppName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  aboutSub: {
    fontSize: 11,
    marginTop: 3,
  },
  versionBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Discord button
  discordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  discordLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  discordSub: {
    fontSize: 11,
    marginTop: 2,
  },
  discordArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  discordArrowText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // Feedback section
  feedbackContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  feedbackInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 10,
  },
  feedbackTextArea: {
    height: 80,
  },
  submitBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
