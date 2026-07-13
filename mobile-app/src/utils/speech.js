/**
 * speech.js
 *
 * Manages all audio output for Infinite Co-Pilot:
 *   - TTS announcements via expo-speech
 *   - Chime, boarding announcements, boarding music, and siren via expo-audio
 *
 * Background audio is configured so announcements fire even when the user
 * switches to the game app. Requires UIBackgroundModes: ["audio"] in app.json.
 */

import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";

class SpeechManager {
  constructor() {
    this.speechQueue = [];
    this.sirenPlaying = false;
    this.addLog = null;
    this.lastSpokenText = "";
    this.lastSpokenAt = 0;
    this.isDucking = false;
    this.voicePreference = "female";
    this.voiceEnabled = true;
    this.boardingMusic = null;
    this.sirenPlayer = null;
    this.chimePlayer = null;
    this.boardingAnnouncePlayer = null;
    this.silentPlayer = null;
    this._audioConfigured = false;
    this.isProcessingQueue = false;
    this.init();
  }

  async init() {
    // Load saved voice preference
    try {
      const pref = await AsyncStorage.getItem("voicePreference");
      if (pref) this.voicePreference = pref;
    } catch (e) {}

    // Configure audio session for background playback
    // This allows TTS and audio to continue when the user switches to the game.
    await this._configureAudioSession();

    // Fetch available system voices
    try {
      this.availableVoices = await Speech.getAvailableVoicesAsync();
    } catch (e) {}

    // Preload chime for instant zero-latency playback
    try {
      this.chimePlayer = createAudioPlayer(require("../../assets/chime.mp3"));
    } catch (e) {}

    // Initialize silent looping audio to keep iOS alive indefinitely
    try {
      // Using a genuine silent .wav file instead of a 0-volume mp3
      // This prevents the MediaToolbox/AVAudioBuffer spam and stuttering issues on iOS
      this.silentPlayer = createAudioPlayer(require("../../assets/silent.wav"));
      this.silentPlayer.volume = 1; // Real silence doesn't need to be 0 volume
      this.silentPlayer.loop = true;
      this.silentPlayer.play();
    } catch (e) {}
  }

  async _configureAudioSession() {
    if (this._audioConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,          // Play even when iPhone is on silent
        shouldPlayInBackground: true,     // Keep audio session alive in background
        interruptionMode: 'duckOthers',   // Lower other apps' audio (e.g. the game)
        allowsRecording: false,
      });
      this._audioConfigured = true;
      console.log("[Speech] Audio session configured for background playback");
    } catch (e) {
      console.log("[Speech] Audio session config error:", e);
    }
  }

  toggleVoice() {
    this.voiceEnabled = !this.voiceEnabled;
    if (!this.voiceEnabled) {
      this.stopBoardingMusic();
      Speech.stop();
    }
    return this.voiceEnabled;
  }

  setDucking(active) {
    this.isDucking = active;
  }

  setLogger(loggerFn) {
    this.addLog = loggerFn;
  }

  async setVoicePreference(preference) {
    this.voicePreference = preference;
    await AsyncStorage.setItem("voicePreference", preference);
  }

  formatText(text, tone) {
    if (tone === "briefing") {
      return text.replace(/,\s*/g, ", ").replace(/\s+/g, " ").trim();
    }
    if (tone === "callout") {
      return text
        .replace(/,\s*/g, ". ")
        .replace(/\b(Gear up|Flaps up|Landing gear up)\b/g, "$1.")
        .trim();
    }
    if (tone === "caution") {
      return text.replace(/,\s*/g, ". ").replace(/\s+/g, " ").trim();
    }
    return String(text).trim();
  }

  getVoiceProfile(tone) {
    const profiles = {
      briefing: { rate: 0.93, pitch: 1.02, volume: 1 },
      callout: { rate: 0.9, pitch: 0.98, volume: 1 },
      caution: { rate: 0.86, pitch: 0.94, volume: 1 },
      notice: { rate: 0.95, pitch: 1, volume: 1 },
      default: { rate: 0.93, pitch: 1, volume: 1 },
    };
    const profile = profiles[tone] || profiles.default;
    if (this.isDucking) {
      return { ...profile, volume: profile.volume * 0.25 };
    }
    return profile;
  }

  async speak(text, options = {}) {
    // Ensure audio session is configured (lazy init in case init() hasn't resolved yet)
    if (!this._audioConfigured) await this._configureAudioSession();

    const tone = options.tone || "default";
    const now = Date.now();
    const spokenText = this.formatText(text, tone);

    // De-duplicate rapid identical announcements
    if (spokenText === this.lastSpokenText && now - this.lastSpokenAt < 900) return;

    this.lastSpokenText = spokenText;
    this.lastSpokenAt = now;

    // Add to log
    if (this.addLog) {
      this.addLog(spokenText);
    }

    if (!this.voiceEnabled) return;

    const profile = this.getVoiceProfile(tone);
    
    this.speechQueue.push({ spokenText, options, profile });
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.speechQueue.length > 0) {
      const { spokenText, options, profile } = this.speechQueue.shift();

      if (options.withChime) {
        try {
          if (this.chimePlayer) {
            try { this.chimePlayer.release(); } catch (e) {}
          }
          this.chimePlayer = createAudioPlayer(require("../../assets/chime.mp3"));
          this.chimePlayer.play();
        } catch (e) {}
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      await new Promise((resolve) => {
        let finalPitch = profile.pitch;
        let voiceId = undefined;

        if (this.voicePreference === "male") {
          finalPitch = finalPitch * 0.9;
          if (this.availableVoices) {
            const maleVoice = this.availableVoices.find(
              (v) =>
                v.language.startsWith("en") &&
                (v.name.includes("Daniel") || v.name.includes("Arthur") || v.name.includes("Aaron") || v.name.includes("Fred") || v.name.includes("Alex"))
            );
            if (maleVoice) voiceId = maleVoice.identifier;
          }
        }

        Speech.speak(spokenText, {
          voice: voiceId,
          rate: profile.rate,
          pitch: finalPitch,
          onDone: resolve,
          onStopped: resolve,
          onError: resolve,
        });
      });
    }

    this.isProcessingQueue = false;
  }

  playChime() {
    try {
      if (this.chimePlayer) {
        try { this.chimePlayer.release(); } catch (e) {}
      }
      this.chimePlayer = createAudioPlayer(require("../../assets/chime.mp3"));
      this.chimePlayer.play();
    } catch (e) {
      console.log("[Speech] Chime play failed:", e);
    }
  }

  playBoardingAnnouncement(livery) {
    this.stopBoardingMusic();

    const getFile = (l) => {
      const lower = (l || "").toLowerCase();
      if (lower.includes("air canada")) return require("../../assets/announcements/air-canada.mp3");
      if (lower.includes("air france")) return require("../../assets/announcements/air-france.mp3");
      if (lower.includes("air india")) return require("../../assets/announcements/air-india.mp3");
      if (lower.includes("british airways")) return require("../../assets/announcements/british-airways.mp3");
      if (lower.includes("delta")) return require("../../assets/announcements/delta.mp3");
      if (lower.includes("emirates")) return require("../../assets/announcements/emirates.mp3");
      if (lower.includes("indigo")) return require("../../assets/announcements/indigo.mp3");
      if (lower.includes("lufthansa")) return require("../../assets/announcements/lufthansa.mp3");
      if (lower.includes("qatar")) return require("../../assets/announcements/qatar.mp3");
      if (lower.includes("singapore")) return require("../../assets/announcements/singapore-airlines.mp3");
      if (lower.includes("turkish")) return require("../../assets/announcements/turkish-airlines.mp3");
      return require("../../assets/announcements/fallback.mp3");
    };

    try {
      if (this.boardingAnnouncePlayer) {
        try { this.boardingAnnouncePlayer.release(); } catch (e) {}
      }
      this.boardingAnnouncePlayer = createAudioPlayer(getFile(livery));
      this.setDucking(true);
      this.boardingAnnouncePlayer.play();
      setTimeout(() => {
        this.setDucking(false);
        this.playChime();
      }, 35000);
    } catch (e) {
      this.setDucking(false);
      console.log("[Speech] Boarding announcement failed:", e);
    }
  }

  playSiren() {
    if (this.sirenPlaying) return;
    this.sirenPlaying = true;
    // Siren audio commented out until asset confirmed — graceful no-op
    setTimeout(() => {
      this.sirenPlaying = false;
    }, 3000);
  }

  playBoardingMusic(livery) {
    if (this.boardingMusic) return;

    const getFile = (l) => {
      const lower = (l || "").toLowerCase();
      if (lower.includes("american")) return require("../../assets/music/american-airlines.mp3");
      if (lower.includes("cathay")) return require("../../assets/music/cathay-pacific.mp3");
      if (lower.includes("emirates")) return require("../../assets/music/emirates.mp3");
      if (lower.includes("indigo")) return require("../../assets/music/indigo.mp3");
      if (lower.includes("lufthansa")) return require("../../assets/music/lufthansa.mp3");
      if (lower.includes("turkish")) return require("../../assets/music/turkish-airlines.mp3");
      return require("../../assets/music/lufthansa.mp3"); // Fallback
    };

    try {
      const file = getFile(livery);
      if (!file) {
        console.log("[Speech] No boarding music for livery:", livery);
        return;
      }
      if (this.boardingMusic) {
        try { this.boardingMusic.release(); } catch (e) {}
      }
      this.boardingMusic = createAudioPlayer(file);
      this.boardingMusic.loop = true; // expo-audio uses 'loop' instead of 'isLooping'
      this.boardingMusic.volume = 0.35;
      this.boardingMusic.play();
    } catch (e) {
      console.log("[Speech] Boarding music failed:", e);
    }
  }

  stopBoardingMusic() {
    if (this.boardingMusic) {
      try {
        this.boardingMusic.pause();
        this.boardingMusic.release();
      } catch (e) {}
      this.boardingMusic = null;
    }
  }

  stopAll() {
    this.speechQueue = [];
    this.isProcessingQueue = false;
    Speech.stop();
    this.stopBoardingMusic();
    if (this.chimePlayer) {
      try { this.chimePlayer.pause(); this.chimePlayer.release(); } catch (e) {}
      this.chimePlayer = null;
    }
    if (this.boardingAnnouncePlayer) {
      try { this.boardingAnnouncePlayer.pause(); this.boardingAnnouncePlayer.release(); } catch (e) {}
      this.boardingAnnouncePlayer = null;
    }
    if (this.sirenPlayer) {
      try { this.sirenPlayer.pause(); this.sirenPlayer.release(); } catch (e) {}
      this.sirenPlayer = null;
    }
  }
}

export const speechManager = new SpeechManager();
