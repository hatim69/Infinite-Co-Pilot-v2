import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Platform, 
  AppState,
  Modal,
  ScrollView,
  SafeAreaView
} from 'react-native';
import notifee from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Settings2, X, Info, Zap } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

const DISMISS_KEY = '@background_reliability_dismissed';

export default function BackgroundReliability() {
  const { theme } = useTheme();
  const [isSupported, setIsSupported] = useState(true);
  const [isOptimized, setIsOptimized] = useState(false);
  const [powerInfo, setPowerInfo] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const checkStatus = async () => {
    if (Platform.OS !== 'android') {
      setIsSupported(false);
      return;
    }

    try {
      const dismissed = await AsyncStorage.getItem(DISMISS_KEY);
      if (dismissed === 'true') {
        setIsDismissed(true);
      }

      // notifee.isBatteryOptimizationEnabled is available on API >= 23
      const enabled = await notifee.isBatteryOptimizationEnabled();

      if (isOptimized !== enabled) {
        setIsOptimized(enabled);
        if (isOptimized === true && enabled === false) {
           console.log("[BackgroundReliability] Battery optimization status changed to: Unrestricted");
        } else if (isOptimized === false && enabled === true && isOptimized !== null) {
           console.log("[BackgroundReliability] Battery optimization status changed to: Optimized");
        }
      }

      try {
        const info = await notifee.getPowerManagerInfo();
        setPowerInfo(info);
      } catch (e) {
        // Safe to ignore, some devices might not support this
        console.log("[BackgroundReliability] getPowerManagerInfo unavailable:", e.message);
      }
      
    } catch (err) {
      console.log("[BackgroundReliability] Unsupported device or API error:", err.message);
      setIsSupported(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkStatus();
    });

    return () => sub.remove();
  }, [isOptimized]); // Include isOptimized to accurately log transition

  // Ensure initial log only triggers when card is actually going to be shown.
  useEffect(() => {
    if (Platform.OS === 'android' && isSupported && isOptimized && !isDismissed) {
      console.log("[BackgroundReliability] Background Reliability recommendation shown");
    }
  }, [isSupported, isOptimized, isDismissed]);

  if (Platform.OS !== 'android' || !isSupported || !isOptimized || isDismissed) {
    return null;
  }

  const handleOpenSettings = async () => {
    console.log("[BackgroundReliability] User opened battery settings");
    try {
      // First try standard battery optimization
      await notifee.openBatteryOptimizationSettings();
    } catch (e) {
      // Fallback to power manager if available
      if (powerInfo && powerInfo.activity) {
        try {
          await notifee.openPowerManagerSettings();
        } catch (err) {
          console.log("[BackgroundReliability] Failed to open power manager settings:", err.message);
        }
      } else {
        console.log("[BackgroundReliability] Failed to open battery optimization settings:", e.message);
      }
    }
  };

  const handleDismissCard = () => {
    console.log("[BackgroundReliability] User dismissed recommendation");
    setModalVisible(false);
  };

  const handleDontRemindMe = async () => {
    console.log("[BackgroundReliability] User selected 'Don't remind me again'");
    await AsyncStorage.setItem(DISMISS_KEY, 'true');
    setIsDismissed(true);
    setModalVisible(false);
  };

  const getOEMGuidance = () => {
    const brand = (Platform.constants.Brand || "").toLowerCase();
    
    switch (brand) {
      case "samsung":
        return "Samsung: Settings → Apps → Infinite Co-Pilot → Battery → Unrestricted";
      case "xiaomi":
      case "poco":
      case "redmi":
        return "Xiaomi/POCO: Settings → Apps → Manage apps → Infinite Co-Pilot → Battery saver → No restrictions";
      case "oneplus":
        return "OnePlus: Settings → Battery → App battery management → Infinite Co-Pilot → Allow foreground/background activity";
      case "oppo":
        return "Oppo: Settings → Battery → App battery management → Infinite Co-Pilot → Allow background activity";
      case "vivo":
        return "Vivo: Settings → Battery → Background power consumption management → Infinite Co-Pilot → Don't restrict background power usage";
      case "realme":
        return "Realme: Settings → Battery → App battery management → Infinite Co-Pilot → Allow background activity";
      case "huawei":
      case "honor":
        return "Huawei/Honor: Settings → Battery → App Launch → Infinite Co-Pilot → Manage manually (Enable all)";
      default:
        return null;
    }
  };

  const oemGuidance = getOEMGuidance();

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.surfaceMid, borderColor: theme.borderSoft }]}>
        <View style={styles.header}>
          <View style={[styles.iconWrapper, { backgroundColor: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.3)' }]}>
            <Zap size={18} color="#38BDF8" />
          </View>
          <Text style={[styles.title, { color: theme.textSecondary }]}>Improve Background Reliability</Text>
        </View>

        <Text style={[styles.description, { color: theme.textMuted }]}>
          Infinite Co-Pilot works best during long flights when Android allows it to continue running in the background without restrictions.
        </Text>

        <TouchableOpacity 
          style={[styles.learnMoreBtn, { backgroundColor: theme.accentBg, borderColor: theme.accentActiveBorder }]} 
          onPress={() => setModalVisible(true)}
          activeOpacity={0.75}
        >
          <Text style={[styles.learnMoreText, { color: theme.accentText }]}>Learn More</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleContainer}>
                <Info size={22} color={theme.accentText} style={{ marginRight: 10 }} />
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Background Reliability</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={[styles.modalText, { color: theme.textSecondary }]}>
                Android systems often stop long-running apps to save battery. For Infinite Co-Pilot to monitor your flight effectively over 8 to 18 hours, it requires unrestricted background activity.
              </Text>
              
              <Text style={[styles.modalText, { color: theme.textSecondary }]}>
                We highly recommend updating your device settings to ensure the best experience and uninterrupted monitoring.
              </Text>

              {oemGuidance && (
                <View style={[styles.oemBox, { backgroundColor: theme.surfaceMid, borderColor: theme.borderSoft }]}>
                  <Text style={[styles.oemTitle, { color: theme.textPrimary }]}>Manufacturer Guidance</Text>
                  <Text style={[styles.oemText, { color: theme.textMuted }]}>{oemGuidance}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={[styles.primaryBtn, { backgroundColor: theme.accent }]} 
                onPress={() => {
                  handleOpenSettings();
                  setModalVisible(false);
                }}
              >
                <Settings2 size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnText}>Open Battery Settings</Text>
              </TouchableOpacity>

              <View style={styles.secondaryActions}>
                <TouchableOpacity onPress={handleDismissCard} style={styles.textBtn}>
                  <Text style={[styles.textBtnLabel, { color: theme.textMuted }]}>Dismiss</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleDontRemindMe} style={styles.textBtn}>
                  <Text style={[styles.textBtnLabel, { color: theme.textMuted }]}>Don't remind me again</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    marginRight: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  learnMoreBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  learnMoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalScroll: {
    marginBottom: 20,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  oemBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
  },
  oemTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  oemText: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalFooter: {
    marginTop: 'auto',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  textBtn: {
    padding: 8,
  },
  textBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
