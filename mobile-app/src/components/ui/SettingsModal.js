import React, { useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Switch, ScrollView, useWindowDimensions } from "react-native";
import { X, Volume2 } from "lucide-react-native";
import Slider from "./Slider";
import { speechManager } from "../../utils/speech";

export default function SettingsModal({ visible, onClose }) {
  const { height } = useWindowDimensions();
  const isShort = height < 620;
  const [volumes, setVolumes] = useState({
    masterVolume: 1.0,
    coPilotVolume: 1.0,
    boardingMusicVolume: 0.25,
    safetyBriefingVolume: 1.0,
    chimeEnabled: true,
  });

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

  const updateVolume = (key, value) => {
    // Use functional setState so we always spread the latest state, not a stale
    // closure snapshot. Without this, rapidly dragging one slider would reset
    // the others back to wherever they were at the last render.
    setVolumes((prev) => ({ ...prev, [key]: value }));
    // Pass only the changed key — speechManager.setVolumes uses ?? to keep
    // the rest unchanged, and persists the full object to AsyncStorage.
    speechManager.setVolumes({ [key]: value });
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContent, isShort && styles.modalContentCompact, { maxHeight: Math.max(280, height - 40) }]}>
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Volume2 size={18} color="#60A5FA" style={{ marginRight: 8 }} />
              <Text style={styles.title}>Volume Settings</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.slidersContainer}
            showsVerticalScrollIndicator={false}
          >
            <VolumeSlider 
              label="Master Volume" 
              value={volumes.masterVolume} 
              onValueChange={(val) => updateVolume("masterVolume", val)} 
            />
            <VolumeSlider 
              label="Co-Pilot Voice" 
              value={volumes.coPilotVolume} 
              onValueChange={(val) => updateVolume("coPilotVolume", val)} 
            />
            <VolumeSlider 
              label="Boarding Music" 
              value={volumes.boardingMusicVolume} 
              onValueChange={(val) => updateVolume("boardingMusicVolume", val)} 
            />
            <VolumeSlider 
              label="Safety Briefing" 
              value={volumes.safetyBriefingVolume} 
              onValueChange={(val) => updateVolume("safetyBriefingVolume", val)} 
            />

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.label}>Notification Chime</Text>
                <Text style={styles.subtitleText}>Play chime before announcements</Text>
              </View>
              <Switch
                value={volumes.chimeEnabled}
                onValueChange={(val) => updateVolume("chimeEnabled", val)}
                trackColor={{ false: "#334155", true: "#0D9488" }}
                thumbColor={volumes.chimeEnabled ? "#FFFFFF" : "#94A3B8"}
                ios_backgroundColor="#334155"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VolumeSlider({ label, value, onValueChange }) {
  return (
    <View style={styles.sliderRow}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.valueText}>{Math.round(value * 100)}%</Text>
      </View>
      <Slider
        minimumValue={0}
        maximumValue={1}
        value={value}
        onValueChange={onValueChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#1E293B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalContentCompact: {
    padding: 18,
  },
  modalScroll: {
    flexShrink: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.5)",
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F8FAFC",
    flexShrink: 1,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  slidersContainer: {
    gap: 20,
  },
  sliderRow: {
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(51, 65, 85, 0.4)",
  },
  labelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
  valueText: {
    color: "#94A3B8",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  subtitleText: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 4,
  },
});
