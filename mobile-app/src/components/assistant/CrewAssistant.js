import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mic, CheckSquare, ShieldCheck, Zap } from 'lucide-react-native';
import { speechManager } from '../../utils/speech';

const CrewAssistant = ({ telemetry, isConnected }) => {
  const [voiceEnabled, setVoiceEnabled] = useState(speechManager.voiceEnabled);

  const toggleVoice = () => {
    const isNowEnabled = speechManager.toggleVoice();
    setVoiceEnabled(isNowEnabled);
  };

  let phaseTitle = "Standing By";
  let checklist = [];
  let nextAction = "Connect simulator to begin crew monitoring.";
  
  if (isConnected) {
    if (telemetry.gs > 40 && telemetry.onGround) {
      phaseTitle = "Takeoff Roll";
      checklist = ["Thrust set", "Airspeed alive"];
      nextAction = "Rotate";
    } else if (!telemetry.onGround && telemetry.msl < 10000) {
      phaseTitle = "Climb Phase";
      checklist = ["Positive rate", "Gear up"];
      nextAction = "Monitor speed & 10,000ft lights";
    } else if (!telemetry.onGround && telemetry.msl > 10000 && Math.abs(telemetry.vs) <= 200) {
      phaseTitle = "Cruise Monitoring";
      checklist = ["Systems normal", "Fuel flow stable"];
      nextAction = "Descent preparation";
    } else if (!telemetry.onGround && telemetry.vs < -200) {
      phaseTitle = "Descent Profile";
      checklist = ["Altitude decreasing", "Speed checked"];
      nextAction = "Approach briefing";
    } else if (telemetry.onGround && telemetry.gs <= 40) {
      phaseTitle = "Ground Operations";
      checklist = ["Engines stable", "Taxi clearance"];
      nextAction = "Configure aircraft for departure";
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.headerRow}>
          <View style={styles.titleContainer}>
            <View style={styles.iconWrapper}>
              <ShieldCheck size={20} color="#2DD4BF" />
            </View>
            <Text style={styles.headerTitle}>FLIGHTDECK ASSISTANT</Text>
          </View>

          {!voiceEnabled ? (
            <TouchableOpacity onPress={toggleVoice} style={styles.voiceBtnDisabled}>
              <Mic size={14} color="#FBBF24" />
              <Text style={styles.voiceBtnTextDisabled}>Enable Voice</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={toggleVoice} style={styles.voiceBtnEnabled}>
              <Mic size={14} color="#2DD4BF" />
              <Text style={styles.voiceBtnTextEnabled}>Voice Active</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.phaseTitle}>{phaseTitle}</Text>
          
          {isConnected && checklist.length > 0 && (
            <View style={styles.checklist}>
              {checklist.map((item, idx) => (
                <View key={idx} style={styles.checklistItem}>
                  <CheckSquare size={16} color="#14B8A6" style={styles.checkIcon} />
                  <Text style={styles.checklistText}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.nextActionBox}>
        <Text style={styles.nextActionLabel}>NEXT ACTION</Text>
        <View style={styles.nextActionContent}>
          <Zap size={16} color="#FBBF24" style={styles.zapIcon} />
          <Text style={styles.nextActionText}>{nextAction}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderColor: 'rgba(51, 65, 85, 0.8)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    justifyContent: 'space-between',
    minHeight: 250,
  },
  topSection: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.5)',
    paddingBottom: 12,
    marginBottom: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrapper: {
    backgroundColor: 'rgba(20, 184, 166, 0.2)',
    padding: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
    letterSpacing: 1.5,
  },
  voiceBtnDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217, 119, 6, 0.2)',
    borderColor: 'rgba(217, 119, 6, 0.5)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  voiceBtnTextDisabled: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  voiceBtnEnabled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
    borderColor: 'rgba(20, 184, 166, 0.2)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  voiceBtnTextEnabled: {
    color: '#2DD4BF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  content: {
    marginBottom: 16,
  },
  phaseTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  checklist: {
    gap: 8,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  checkIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  checklistText: {
    fontSize: 14,
    color: '#CBD5E1',
  },
  nextActionBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 8,
    padding: 12,
    borderColor: 'rgba(51, 65, 85, 0.5)',
    borderWidth: 1,
  },
  nextActionLabel: {
    fontSize: 10,
    color: '#64748B',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  nextActionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  zapIcon: {
    marginTop: 2,
    marginRight: 6,
  },
  nextActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FBBF24',
    flex: 1,
  },
});

export default CrewAssistant;
