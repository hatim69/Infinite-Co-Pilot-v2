/**
 * speech.js
 *
 * Manages all audio output for Infinite Co-Pilot:
 *   - TTS announcements via expo-speech (all standard callouts)
 *   - Amazon Polly Neural TTS for the arrival welcome announcement
 *   - Chime, boarding announcements, boarding music, and siren via expo-audio
 *
 * Background audio is configured so announcements fire even when the user
 * switches to the game app. Requires UIBackgroundModes: ["audio"] in app.json.
 *
 * Polly backend URL is read from EXPO_PUBLIC_POLLY_BACKEND_URL env var.
 * Falls back to expo-speech automatically if the backend is unreachable.
 */

import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCachedAudioUri } from "./audioCache";
import { staticAudioMap } from "./staticAudioMap";

// ─── Polly backend URL (set in mobile-app/.env) ───────────────────────────────
// Must be your Mac's LAN IP when running locally (not 'localhost' on device).
// e.g. EXPO_PUBLIC_POLLY_BACKEND_URL=http://192.168.1.10:3001
const POLLY_BACKEND_URL = process.env.EXPO_PUBLIC_POLLY_BACKEND_URL || "";

class SpeechManager {
  constructor() {
    this.speechQueue = [];
    this.sirenPlaying = false;
    this.addLog = null;
    this.lastSpokenText = "";
    this.lastSpokenAt = 0;
    this.voicePreference = "female";
    this.voiceEnabled = true;

    // Volumes — 100% by default; user adjusts via settings
    this.masterVolume = 1.0;
    this.coPilotVolume = 1.0;
    this.boardingMusicVolume = 0.5;
    this.safetyBriefingVolume = 1.0;
    this.chimeEnabled = true;

    this.boardingMusic = null;
    this.sirenPlayer = null;
    this.chimePlayer = null;
    this.boardingAnnouncePlayer = null;
    this.silentPlayer = null;
    this.pollyPlayer = null; // dedicated player for Polly audio
    this._audioConfigured = false;
    this.isProcessingQueue = false;

    // In-memory Polly response cache: Map<"text|voiceId", base64DataUri>
    // Avoids repeat network calls for identical text+voice combinations.
    this.pollyCache = new Map();

    this.init();
  }

  async init() {
    // Load saved voice preference and volumes
    try {
      const pref = await AsyncStorage.getItem("voicePreference");
      if (pref) this.voicePreference = pref;

      const storedVolumes = await AsyncStorage.getItem("appVolumes");
      if (storedVolumes) {
        const parsed = JSON.parse(storedVolumes);
        this.masterVolume = parsed.masterVolume ?? 1.0;
        this.coPilotVolume = parsed.coPilotVolume ?? 1.0;
        this.boardingMusicVolume = parsed.boardingMusicVolume ?? 1.0;
        this.safetyBriefingVolume = parsed.safetyBriefingVolume ?? 1.0;
        this.chimeEnabled = parsed.chimeEnabled ?? true;
      }
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
      if (this.boardingMusic) {
        try { this.boardingMusic.pause(); } catch (e) {}
      }
      if (this.boardingAnnouncePlayer) {
        try { this.boardingAnnouncePlayer.pause(); } catch (e) {}
      }
      Speech.stop();
      this.speechQueue = [];
      this.isProcessingQueue = false;
    } else {
      if (this.boardingMusic) {
        try { this.boardingMusic.play(); } catch (e) {}
      }
      if (this.boardingAnnouncePlayer) {
        try { this.boardingAnnouncePlayer.play(); } catch (e) {}
      }
    }
    return this.voiceEnabled;
  }


  setLogger(loggerFn) {
    this.addLog = loggerFn;
  }

  async setVoicePreference(preference) {
    this.voicePreference = preference;
    await AsyncStorage.setItem("voicePreference", preference);
  }

  async setVolumes(volumes) {
    this.masterVolume = volumes.masterVolume ?? this.masterVolume;
    this.coPilotVolume = volumes.coPilotVolume ?? this.coPilotVolume;
    this.boardingMusicVolume = volumes.boardingMusicVolume ?? this.boardingMusicVolume;
    this.safetyBriefingVolume = volumes.safetyBriefingVolume ?? this.safetyBriefingVolume;
    this.chimeEnabled = volumes.chimeEnabled ?? this.chimeEnabled;

    try {
      await AsyncStorage.setItem("appVolumes", JSON.stringify({
        masterVolume: this.masterVolume,
        coPilotVolume: this.coPilotVolume,
        boardingMusicVolume: this.boardingMusicVolume,
        safetyBriefingVolume: this.safetyBriefingVolume,
        chimeEnabled: this.chimeEnabled,
      }));
    } catch (e) {
      console.log("[Speech] Error saving volumes:", e);
    }

    // Apply live volume updates to any currently-playing players
    if (this.boardingMusic) {
      this.boardingMusic.volume = this.masterVolume * this.boardingMusicVolume;
    }
    if (this.boardingAnnouncePlayer) {
      this.boardingAnnouncePlayer.volume = this.masterVolume * this.safetyBriefingVolume;
    }
    if (this.chimePlayer) {
      this.chimePlayer.volume = this.masterVolume;
    }
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
    // Volume is controlled exclusively by the settings sliders — no hidden multipliers.
    return profiles[tone] || profiles.default;
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

      if (options.withChime && this.chimeEnabled) {
        try {
          if (!this.chimePlayer) {
            this.chimePlayer = createAudioPlayer(require("../../assets/chime.mp3"));
            this.chimePlayer.volume = this.masterVolume;
            this.chimePlayer.play();
          } else {
            // Await the seek so play() always starts from position 0, not wherever
            // the previous playback left off — this was causing the intermittent delay.
            await this.chimePlayer.seekTo(0);
            this.chimePlayer.play();
          }
        } catch (e) {}
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // ── If there is a pre-recorded audio file for this exact text ────────
      const staticAudioEntry = staticAudioMap[spokenText];
      if (staticAudioEntry) {
        await new Promise((resolve) => {
          try {
            const audioAsset = staticAudioEntry[this.voicePreference] || staticAudioEntry.female;
            const player = createAudioPlayer(audioAsset);
            player.volume = profile.volume * this.masterVolume * this.coPilotVolume;
            player.play();
            
            let isResolved = false;
            const finish = () => {
              if (isResolved) return;
              isResolved = true;
              try { player.release(); } catch(e){}
              resolve();
            };

            // Poll for completion since expo-audio API varies
            const checkInterval = setInterval(() => {
              try {
                if (player.duration > 0 && player.currentTime >= player.duration - 0.1) {
                  clearInterval(checkInterval);
                  finish();
                } else if (!player.playing && player.currentTime > 0) {
                  clearInterval(checkInterval);
                  finish();
                }
              } catch (e) {
                clearInterval(checkInterval);
                finish();
              }
            }, 250);

            // Safety timeout (max 10 seconds for any static voice line)
            setTimeout(() => {
              clearInterval(checkInterval);
              finish();
            }, 10000);

          } catch (e) {
            resolve();
          }
        });
      } 
      // ── If this queue item was routed through Polly, use speakPolly ────────
      else if (options._pollyVoiceId) {
        await this.speakPolly(spokenText, options._pollyVoiceId, profile);
      } else {
        await new Promise((resolve) => {
          let finalPitch = profile.pitch;
          let voiceId = undefined;

          if (this.voicePreference === "male") {
            if (this.availableVoices) {
              let maleVoice = this.availableVoices.find(
                (v) => v.language.startsWith("en") && (v.name === "Aaron" || v.name === "Daniel" || v.name === "Arthur")
              );
              if (!maleVoice) {
                maleVoice = this.availableVoices.find(
                  (v) => v.language.startsWith("en") && (v.name.toLowerCase().includes("male") || v.identifier.toLowerCase().includes("male"))
                );
              }
              if (!maleVoice) {
                maleVoice = this.availableVoices.find(
                  (v) => v.language.startsWith("en") && (v.identifier.includes("-iom") || v.identifier.includes("-tpd") || v.identifier.includes("-rjs") || v.identifier.includes("-gpl"))
                );
              }
              if (!maleVoice) {
                maleVoice = this.availableVoices.find(
                  (v) => v.language.startsWith("en") && (v.name.includes("Alex") || v.name.includes("Fred"))
                );
              }
              if (maleVoice) {
                voiceId = maleVoice.identifier;
              } else {
                finalPitch = finalPitch * 0.9;
              }
            } else {
              finalPitch = finalPitch * 0.9;
            }
          }

          // Apply master + co-pilot volume from settings
          Speech.speak(spokenText, {
            voice: voiceId,
            rate: profile.rate,
            pitch: finalPitch,
            volume: profile.volume * this.masterVolume * this.coPilotVolume,
            onDone: resolve,
            onStopped: resolve,
            onError: resolve,
          });
        });
      }
    }

    this.isProcessingQueue = false;
  }

  // ─── Amazon Polly TTS ─────────────────────────────────────────────────────

  /**
   * Synthesize `text` via Amazon Polly Neural TTS and play it immediately.
   * Falls back silently to expo-speech on any network/API error.
   *
   * @param {string} text       - Text to synthesize.
   * @param {string} voiceId    - "Ruth" (female) or "Matthew" (male).
   * @param {object} profile    - Voice profile from getVoiceProfile().
   */
  async speakPolly(text, voiceId, profile) {
    if (!POLLY_BACKEND_URL) {
      // No backend configured — fall back immediately
      console.log("[Polly] No backend URL configured, using expo-speech fallback.");
      return this._speakExpofallback(text, profile);
    }

    const cacheKey = `${voiceId}|${text}`;

    // ── Cache hit: skip network entirely ──────────────────────────────────────
    if (this.pollyCache.has(cacheKey)) {
      console.log("[Polly] Cache hit, playing from memory.");
      const dataUri = this.pollyCache.get(cacheKey);
      return this._playPollyAudio(dataUri, profile);
    }

    // ── Fetch from backend with 3-second timeout ───────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${POLLY_BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Polly backend returned ${response.status}`);
      }

      // Convert audio/mpeg response to base64 data URI
      const arrayBuffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64 = btoa(binary);
      const dataUri = `data:audio/mpeg;base64,${base64}`;

      // Cache for this session
      this.pollyCache.set(cacheKey, dataUri);

      return this._playPollyAudio(dataUri, profile);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.warn("[Polly] Request timed out (>3s), falling back to expo-speech.");
      } else {
        console.warn("[Polly] Request failed:", err.message, "— falling back to expo-speech.");
      }
      return this._speakExpofallback(text, profile);
    }
  }

  /**
   * Play a base64 data URI as audio using expo-audio's createAudioPlayer.
   * @private
   */
  async _playPollyAudio(dataUri, profile) {
    return new Promise((resolve) => {
      try {
        // Release any previous Polly player
        if (this.pollyPlayer) {
          try { this.pollyPlayer.pause(); this.pollyPlayer.release(); } catch (_) {}
          this.pollyPlayer = null;
        }

        const player = createAudioPlayer({ uri: dataUri });
        player.volume = profile.volume * this.masterVolume * this.coPilotVolume;
        this.pollyPlayer = player;

        // Resolve when playback ends (or on error)
        const cleanup = player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish || status.isLoaded === false) {
            try { cleanup.remove(); } catch (_) {}
            resolve();
          }
        });

        // Safety-net resolve after reasonable max time (60s)
        const safetyTimer = setTimeout(() => {
          try { cleanup.remove(); } catch (_) {}
          resolve();
        }, 60000);

        player.play();

        // Override resolve to also clear safetyTimer
        const originalResolve = resolve;
        resolve = () => {
          clearTimeout(safetyTimer);
          originalResolve();
        };
      } catch (err) {
        console.warn("[Polly] Audio playback failed:", err.message);
        resolve();
      }
    });
  }

  /**
   * Fallback: speak `text` using expo-speech with the given profile.
   * @private
   */
  _speakExpofallback(text, profile) {
    return new Promise((resolve) => {
      let finalPitch = profile.pitch;
      let voiceId = undefined;

      if (this.voicePreference === "male") {
        if (this.availableVoices) {
          let maleVoice = this.availableVoices.find(
            (v) => v.language.startsWith("en") && (v.name === "Aaron" || v.name === "Daniel" || v.name === "Arthur")
          );
          if (!maleVoice) {
            maleVoice = this.availableVoices.find(
              (v) => v.language.startsWith("en") && (v.name.toLowerCase().includes("male") || v.identifier.toLowerCase().includes("male"))
            );
          }
          if (!maleVoice) {
            maleVoice = this.availableVoices.find(
              (v) => v.language.startsWith("en") && (v.identifier.includes("-iom") || v.identifier.includes("-tpd") || v.identifier.includes("-rjs") || v.identifier.includes("-gpl"))
            );
          }
          if (!maleVoice) {
            maleVoice = this.availableVoices.find(
              (v) => v.language.startsWith("en") && (v.name.includes("Alex") || v.name.includes("Fred"))
            );
          }
          if (maleVoice) {
            voiceId = maleVoice.identifier;
          } else {
            finalPitch = finalPitch * 0.9;
          }
        } else {
          finalPitch = finalPitch * 0.9;
        }
      }

      Speech.speak(text, {
        voice: voiceId,
        rate: profile.rate,
        pitch: finalPitch,
        volume: profile.volume * this.masterVolume * this.coPilotVolume,
        onDone: resolve,
        onStopped: resolve,
        onError: resolve,
      });
    });
  }

  /**
   * Public helper: speak `text` through Polly with automatic expo-speech fallback.
   * Queues behind other announcements via the standard speech queue.
   *
   * @param {string} text     - Text to synthesize.
   * @param {string} voiceId  - "Ruth" or "Matthew".
   * @param {object} options  - Same options object passed to speak().
   */
  async speakWithPollyFallback(text, voiceId, options = {}) {
    const tone = options.tone || "default";
    const now = Date.now();
    const spokenText = this.formatText(text, tone);

    // De-duplicate rapid identical announcements
    if (spokenText === this.lastSpokenText && now - this.lastSpokenAt < 900) return;
    this.lastSpokenText = spokenText;
    this.lastSpokenAt = now;

    if (this.addLog) this.addLog(spokenText);
    if (!this.voiceEnabled) return;

    const profile = this.getVoiceProfile(tone);

    // Use polly-aware queue entry
    this.speechQueue.push({ spokenText, options: { ...options, _pollyVoiceId: voiceId }, profile });
    this.processQueue();
  }

  async playChime() {
    if (!this.chimeEnabled) return;
    try {
      if (!this.chimePlayer) {
        this.chimePlayer = createAudioPlayer(require("../../assets/chime.mp3"));
        this.chimePlayer.volume = this.masterVolume;
        this.chimePlayer.play();
      } else {
        // Await seek so the chime always starts from the top with no delay
        await this.chimePlayer.seekTo(0);
        this.chimePlayer.play();
      }
    } catch (e) {
      console.log("[Speech] Chime play failed:", e);
    }
  }

  async playBoardingAnnouncement(livery) {
    this.stopBoardingMusic();
    
    if (this.boardingAnnouncePlayer) return;
    if (this._isFetchingBoardingAnnounce && this._fetchingBoardingAnnounceFor === livery) return;

    this._isFetchingBoardingAnnounce = true;
    this._fetchingBoardingAnnounceFor = livery;

    this._requestCounter = (this._requestCounter || 0) + 1;
    const playRequestId = this._requestCounter;
    this._boardingAnnounceRequestId = playRequestId;

    const getFileName = (l) => {
      const lower = (l || "").toLowerCase();
      if (lower.includes("air canada")) return "announcements/air-canada.mp3";
      if (lower.includes("air france")) return "announcements/air-france.mp3";
      if (lower.includes("air india")) return "announcements/air-india.mp3";
      if (lower.includes("british airways")) return "announcements/british-airways.mp3";
      if (lower.includes("delta")) return "announcements/delta.mp3";
      if (lower.includes("emirates")) return "announcements/emirates.mp3";
      if (lower.includes("indigo")) return "announcements/indigo.mp3";
      if (lower.includes("lufthansa")) return "announcements/lufthansa.mp3";
      if (lower.includes("qatar")) return "announcements/qatar.mp3";
      if (lower.includes("singapore")) return "announcements/singapore-airlines.mp3";
      if (lower.includes("turkish")) return "announcements/turkish-airlines.mp3";
      return "announcements/fallback.mp3";
    };

    try {
      const remoteFileName = getFileName(livery);
      const audioUri = await getCachedAudioUri(remoteFileName, "announcements/fallback.mp3");
      
      // If we were stopped or disconnected while downloading, abort
      if (this._boardingAnnounceRequestId !== playRequestId) return;

      if (!audioUri) {
        console.warn("[Speech] Could not get cached audio for boarding announcement.");
        return;
      }

      if (this.boardingAnnouncePlayer) {
        try { this.boardingAnnouncePlayer.release(); } catch (e) {}
      }
      this.boardingAnnouncePlayer = createAudioPlayer(audioUri);
      this.boardingAnnouncePlayer.volume = this.masterVolume * this.safetyBriefingVolume;
      
      if (this.voiceEnabled) {
        this.boardingAnnouncePlayer.play();
      }
      
      setTimeout(() => {
        if (this._boardingAnnounceRequestId === playRequestId && this.voiceEnabled) {
          this.playChime();
        }
      }, 35000);
    } catch (e) {
      console.log("[Speech] Boarding announcement failed:", e);
    } finally {
      if (this._boardingAnnounceRequestId === playRequestId) {
        this._isFetchingBoardingAnnounce = false;
      }
    }
  }

  stopBoardingAnnouncement() {
    this._boardingAnnounceRequestId = null;
    if (this.boardingAnnouncePlayer) {
      try {
        this.boardingAnnouncePlayer.pause();
        this.boardingAnnouncePlayer.release();
      } catch (e) {}
      this.boardingAnnouncePlayer = null;
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

  async playBoardingMusic(livery) {
    if (this.boardingMusic) return;
    if (this._isFetchingBoardingMusic && this._fetchingBoardingMusicFor === livery) return;

    this._isFetchingBoardingMusic = true;
    this._fetchingBoardingMusicFor = livery;

    this._requestCounter = (this._requestCounter || 0) + 1;
    const playRequestId = this._requestCounter;
    this._boardingMusicRequestId = playRequestId;

    const getFileName = (l) => {
      const lower = (l || "").toLowerCase();
      if (lower.includes("american")) return "music/american-airlines.mp3";
      if (lower.includes("cathay")) return "music/cathay-pacific.mp3";
      if (lower.includes("emirates")) return "music/emirates.mp3";
      if (lower.includes("indigo")) return "music/indigo.mp3";
      if (lower.includes("lufthansa")) return "music/lufthansa.mp3";
      if (lower.includes("turkish")) return "music/turkish-airlines.mp3";
      return "music/american-airlines.mp3"; // Fallback
    };

    try {
      const remoteFileName = getFileName(livery);
      const audioUri = await getCachedAudioUri(remoteFileName, "music/american-airlines.mp3");
      
      // If stopped or disconnected while downloading, abort
      if (this._boardingMusicRequestId !== playRequestId) return;

      if (!audioUri) {
        console.warn("[Speech] Could not get cached audio for boarding music.");
        return;
      }

      if (this.boardingMusic) {
        try { this.boardingMusic.release(); } catch (e) {}
      }
      this.boardingMusic = createAudioPlayer(audioUri);
      this.boardingMusic.loop = true;
      this.boardingMusic.volume = this.masterVolume * this.boardingMusicVolume;
      
      if (this.voiceEnabled) {
        this.boardingMusic.play();
      }
    } catch (e) {
      console.log("[Speech] Boarding music failed:", e);
    } finally {
      if (this._boardingMusicRequestId === playRequestId) {
        this._isFetchingBoardingMusic = false;
      }
    }
  }

  stopBoardingMusic() {
    this._boardingMusicRequestId = null;
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
    this.stopBoardingAnnouncement();
    if (this.chimePlayer) {
      try { this.chimePlayer.pause(); this.chimePlayer.release(); } catch (e) {}
      this.chimePlayer = null;
    }
    if (this.sirenPlayer) {
      try { this.sirenPlayer.pause(); this.sirenPlayer.release(); } catch (e) {}
      this.sirenPlayer = null;
    }
    if (this.pollyPlayer) {
      try { this.pollyPlayer.pause(); this.pollyPlayer.release(); } catch (e) {}
      this.pollyPlayer = null;
    }
  }
}

export const speechManager = new SpeechManager();
