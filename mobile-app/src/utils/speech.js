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
import { Asset } from "expo-asset";
import { createAudioPlayer, setAudioModeAsync, preload } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCachedAudioUri } from "./audioCache";
import { staticAudioMap } from "./staticAudioMap";

// ─── Polly backend URL (set in mobile-app/.env) ───────────────────────────────
// Must be your Mac's LAN IP when running locally (not 'localhost' on device).
// e.g. EXPO_PUBLIC_POLLY_BACKEND_URL=http://192.168.1.10:3001
const POLLY_BACKEND_URL = process.env.EXPO_PUBLIC_POLLY_BACKEND_URL || "";
const PRECISION_CALLOUT_MAX_WAIT_MS = {
  "80 knots": 2500,
  V1: 2000,
  Rotate: 2200,
  V2: 2000,
};
const DEFAULT_CALLOUT_MAX_WAIT_MS = 5000;
const EXPO_SPEECH_MIN_TIMEOUT_MS = 3500;
const EXPO_SPEECH_MAX_TIMEOUT_MS = 45000;
const EXPO_SPEECH_MS_PER_WORD = 520;
const QUEUE_ACTION_TIMEOUT_MS = 15000;
const STATIC_AUDIO_START_OFFSET_SEC = 0.035;
const BOARDING_MUSIC_FADE_MS = 1400;
const CHIME_AUDIO_ASSET = require("../../assets/chime.mp3");
const BACKGROUND_AUDIO_ASSET = require("../../assets/silent.m4a");
const LOCK_SCREEN_ARTWORK_ASSET = require("../../assets/images/icon.png");

const normalizeSpeechOptions = (options, defaultTone = "default") => {
  if (typeof options === "string") return { tone: options };
  return { tone: defaultTone, ...(options || {}) };
};

const hasUriScheme = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9+.-]*:/i.test(value);

class SpeechManager {
  constructor() {
    this.speechQueue = [];
    this.calloutQueue = [];
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
    this.currentAnnouncementPlayer = null;
    this.currentAnnouncementFinish = null;
    this.currentCalloutPlayer = null;
    this.currentCalloutFinish = null;
    this._boardingMusicFadeTimer = null;
    this._lockScreenArtworkUrl = null;
    this._backgroundSessionState = { active: false, connectedIp: "" };
    this._backgroundMediaRefreshTimers = new Set();
    this._backgroundAnchorResumeTimer = null;
    this._backgroundAnchorStatusSubscription = null;
    this._boardingMusicPrefetches = new Map();
    this._audioConfigured = false;
    this.isProcessingQueue = false;
    this.isProcessingCalloutQueue = false;
    this.expoSpeechActive = false;

    // In-memory Polly response cache: Map<"text|voiceId", base64DataUri>
    // Avoids repeat network calls for identical text+voice combinations.
    this.pollyCache = new Map();

    this.ready = this.init();
  }

  _disposePlayer(player, { pause = true } = {}) {
    if (!player) return;
    try {
      if (pause && typeof player.pause === "function") player.pause();
    } catch (e) {}
    try {
      if (typeof player.remove === "function") player.remove();
      else if (typeof player.release === "function") player.release();
    } catch (e) {}
  }

  _enqueueSpeech(entry) {
    if (!entry.options?.priority) {
      this.speechQueue.push(entry);
      return;
    }

    const firstNormalIndex = this.speechQueue.findIndex(
      (queued) => !queued.options?.priority
    );
    if (firstNormalIndex === -1) this.speechQueue.push(entry);
    else this.speechQueue.splice(firstNormalIndex, 0, entry);
  }

  _enqueueAction(action, options = {}) {
    this._enqueueSpeech({ action, options });
    this.processQueue();
  }

  async _runQueueAction(action) {
    let timeoutId;
    try {
      await Promise.race([
        Promise.resolve().then(action),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            console.warn("[Speech] Queue action timed out; continuing queue.");
            resolve();
          }, QUEUE_ACTION_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  _enqueueCallout(entry) {
    this._enqueueSpeech({
      ...entry,
      options: { ...(entry.options || {}), priority: true, _staticOwner: "callout" },
    });
    this.processQueue();
  }

  _getCalloutMaxWaitMs(spokenText) {
    return PRECISION_CALLOUT_MAX_WAIT_MS[spokenText] || DEFAULT_CALLOUT_MAX_WAIT_MS;
  }

  _getExpoSpeechTimeoutMs(text) {
    const wordCount = String(text || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.min(
      EXPO_SPEECH_MAX_TIMEOUT_MS,
      Math.max(EXPO_SPEECH_MIN_TIMEOUT_MS, wordCount * EXPO_SPEECH_MS_PER_WORD)
    );
  }

  _getExpoSpeechVoice(profile) {
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

    return { voiceId, pitch: finalPitch };
  }

  _logSpeech(spokenText, options = {}) {
    if (!options.skipLog && this.addLog) {
      this.addLog(spokenText);
    }
  }

  _interruptCurrentNonCalloutAudio() {
    if (this.expoSpeechActive) {
      try { Speech.stop(); } catch (e) {}
      this.expoSpeechActive = false;
    }
    this._stopCurrentAnnouncement();
  }

  _speakWithExpoSpeech(text, profile) {
    return new Promise((resolve) => {
      const { voiceId, pitch } = this._getExpoSpeechVoice(profile);
      let resolved = false;
      let safetyTimer;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        this.expoSpeechActive = false;
        this._scheduleBackgroundMediaRefresh();
        resolve();
      };

      try {
        this.expoSpeechActive = true;
        safetyTimer = setTimeout(() => {
          console.warn("[Speech] Expo Speech callback timed out; continuing queue.");
          try { Speech.stop(); } catch (e) {}
          finish();
        }, this._getExpoSpeechTimeoutMs(text));

        Speech.speak(text, {
          voice: voiceId,
          rate: profile.rate,
          pitch,
          volume: profile.volume * this.masterVolume * this.coPilotVolume,
          onDone: finish,
          onStopped: finish,
          onError: finish,
        });
      } catch (e) {
        finish();
      }
    });
  }

  async _getLockScreenArtworkUrl() {
    if (this._lockScreenArtworkUrl) return this._lockScreenArtworkUrl;

    const asset = Asset.fromModule(LOCK_SCREEN_ARTWORK_ASSET);
    await asset.downloadAsync();
    const assetUri = asset.localUri || asset.uri || null;
    this._lockScreenArtworkUrl = hasUriScheme(assetUri) ? assetUri : null;
    return this._lockScreenArtworkUrl;
  }

  async _getBackgroundSessionMetadata() {
    const { active, connectedIp } = this._backgroundSessionState;
    const artworkUrl = await this._getLockScreenArtworkUrl();
    const metadata = {
      title: "Infinite Co-Pilot",
      artist: active ? "Monitoring Infinite Flight" : "Standing by for Infinite Flight",
      albumTitle: connectedIp ? `Crew Assistant - ${connectedIp}` : "Crew Assistant",
    };
    if (artworkUrl) metadata.artworkUrl = artworkUrl;
    return metadata;
  }

  async _activateBackgroundMediaSession() {
    if (!this.silentPlayer || typeof this.silentPlayer.setActiveForLockScreen !== "function") {
      return;
    }

    try {
      if (!this.silentPlayer.playing && typeof this.silentPlayer.play === "function") {
        this.silentPlayer.play();
      }
      this.silentPlayer.setActiveForLockScreen(
        true,
        await this._getBackgroundSessionMetadata(),
        {
          isLiveStream: true,
          showSeekBackward: false,
          showSeekForward: false,
        }
      );
    } catch (e) {
      console.log("[Speech] Background media session failed:", e?.message || e);
    }
  }

  _scheduleBackgroundMediaRefresh(delays = [0, 250, 1000]) {
    if (!this.silentPlayer) return;

    delays.forEach((delay) => {
      const timer = setTimeout(() => {
        this._backgroundMediaRefreshTimers.delete(timer);
        this._activateBackgroundMediaSession();
      }, delay);
      this._backgroundMediaRefreshTimers.add(timer);
    });
  }

  _installBackgroundAnchorResumeGuard() {
    if (!this.silentPlayer || this._backgroundAnchorStatusSubscription) return;

    try {
      this._backgroundAnchorStatusSubscription = this.silentPlayer.addListener(
        "playbackStatusUpdate",
        (status) => {
          if (status.playing || status.isBuffering) return;
          if (this._backgroundAnchorResumeTimer) return;

          this._backgroundAnchorResumeTimer = setTimeout(() => {
            this._backgroundAnchorResumeTimer = null;
            this._scheduleBackgroundMediaRefresh([0, 300]);
          }, 300);
        }
      );
    } catch (e) {
      console.log("[Speech] Background media guard failed:", e?.message || e);
    }
  }

  async _updateBackgroundMediaMetadata() {
    if (!this.silentPlayer) return;

    try {
      const metadata = await this._getBackgroundSessionMetadata();
      if (typeof this.silentPlayer.updateLockScreenMetadata === "function") {
        this.silentPlayer.updateLockScreenMetadata(metadata);
      } else {
        await this._activateBackgroundMediaSession();
      }
    } catch (e) {
      console.log("[Speech] Background media metadata update failed:", e?.message || e);
    }
  }

  _stopCurrentAnnouncement() {
    if (this.currentAnnouncementFinish) {
      this.currentAnnouncementFinish();
      return;
    }
    this._disposePlayer(this.currentAnnouncementPlayer);
    this.currentAnnouncementPlayer = null;
  }

  async _playChimeNow() {
    if (!this.chimeEnabled) return false;

    try {
      if (this.chimePlayer) {
        this._disposePlayer(this.chimePlayer, { pause: true });
        this.chimePlayer = null;
      }
      
      this.chimePlayer = createAudioPlayer(CHIME_AUDIO_ASSET);
      this.chimePlayer.volume = this.masterVolume;
      this.chimePlayer.play();
      this._scheduleBackgroundMediaRefresh([0, 400]);
      return true;
    } catch (e) {
      console.log("[Speech] Chime play failed:", e);
      return false;
    }
  }

  _playStaticAudio(
    audioAsset,
    volume,
    {
      owner = "announcement",
      maxWaitMs = 10000,
      startAtSeconds = STATIC_AUDIO_START_OFFSET_SEC,
    } = {}
  ) {
    return new Promise((resolve) => {
      let player;
      let subscription;
      let checkInterval;
      let safetyTimer;
      let isResolved = false;
      let hasStartedPlayback = false;

      const finish = () => {
        if (isResolved) return;
        isResolved = true;
        if (subscription) {
          try { subscription.remove(); } catch (e) {}
        }
        if (checkInterval) clearInterval(checkInterval);
        if (safetyTimer) clearTimeout(safetyTimer);
        if (this.currentAnnouncementPlayer === player) {
          this.currentAnnouncementPlayer = null;
        }
        if (this.currentCalloutPlayer === player) {
          this.currentCalloutPlayer = null;
        }
        if (this.currentAnnouncementFinish === finish) {
          this.currentAnnouncementFinish = null;
        }
        if (this.currentCalloutFinish === finish) {
          this.currentCalloutFinish = null;
        }
        this._disposePlayer(player, { pause: true });
        this._scheduleBackgroundMediaRefresh();
        resolve(hasStartedPlayback);
      };

      try {
        player = createAudioPlayer(audioAsset, { updateInterval: 100 });
        if (owner === "callout") {
          this.currentCalloutPlayer = player;
          this.currentCalloutFinish = finish;
        } else {
          this.currentAnnouncementPlayer = player;
          this.currentAnnouncementFinish = finish;
        }
        player.volume = volume;

        subscription = player.addListener("playbackStatusUpdate", (status) => {
          if (
            status.didJustFinish ||
            (status.currentTime > 0 &&
              status.duration > 0 &&
              status.currentTime >= status.duration - 0.1) ||
            (hasStartedPlayback &&
              status.currentTime > 0 &&
              status.playing === false &&
              !status.isBuffering)
          ) {
            finish();
          }
        });

        checkInterval = setInterval(() => {
          try {
            if (player.duration > 0 && player.currentTime >= player.duration - 0.1) {
              finish();
            } else if (
              hasStartedPlayback &&
              !player.playing &&
              player.currentTime > 0 &&
              !player.isBuffering
            ) {
              finish();
            }
          } catch (e) {
            finish();
          }
        }, 100);

        safetyTimer = setTimeout(finish, maxWaitMs);
        Promise.resolve()
          .then(() => {
            if (startAtSeconds > 0 && typeof player.seekTo === "function") {
              return player.seekTo(startAtSeconds, 0, 0);
            }
            return undefined;
          })
          .then(() => {
            player.play();
            hasStartedPlayback = true;
            this._scheduleBackgroundMediaRefresh([0, 350]);
          })
          .catch(finish);
      } catch (e) {
        finish();
      }
    });
  }

  async processCalloutQueue() {
    if (this.isProcessingCalloutQueue) return;
    this.isProcessingCalloutQueue = true;

    try {
      while (this.calloutQueue.length > 0) {
        const { spokenText, profile } = this.calloutQueue.shift();
        const staticAudioEntry = staticAudioMap[spokenText];
        if (!staticAudioEntry) continue;

        try {
          const audioAsset = staticAudioEntry[this.voicePreference] || staticAudioEntry.female;
          
          const startedStaticPlayback = await this._playStaticAudio(
            audioAsset,
            profile.volume * this.masterVolume * this.coPilotVolume,
            {
              owner: "callout",
              maxWaitMs: this._getCalloutMaxWaitMs(spokenText),
            }
          );
          if (!startedStaticPlayback) {
            await this._speakWithExpoSpeech(spokenText, profile);
          }
        } catch (e) {
          console.log("[Speech] Callout failed:", e);
        }
      }
    } finally {
      this.isProcessingCalloutQueue = false;
    }
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
      this.chimePlayer = createAudioPlayer(CHIME_AUDIO_ASSET);
    } catch (e) {}

    // Keep an audio session open so Android continues running JS/audio while the game is foregrounded.
    try {
      this.silentPlayer = createAudioPlayer(BACKGROUND_AUDIO_ASSET);
      this.silentPlayer.volume = 1;
      this.silentPlayer.loop = true;
      await this._activateBackgroundMediaSession();
      this._installBackgroundAnchorResumeGuard();
      this.silentPlayer.play();
      this._scheduleBackgroundMediaRefresh([250, 1000, 2500]);
    } catch (e) {
      console.log("[Speech] Background media anchor failed:", e?.message || e);
    }

    // Preload all static audio files to completely eliminate the slight playback gap
    try {
      for (const entry of Object.values(staticAudioMap)) {
        if (entry.female) preload(entry.female).catch(() => {});
        if (entry.male) preload(entry.male).catch(() => {});
      }
    } catch (e) {
      console.log("[Speech] Failed to preload static audio:", e);
    }
  }

  async whenReady() {
    return this.ready;
  }

  setBackgroundSessionState({ active = false, connectedIp = "" } = {}) {
    this._backgroundSessionState = { active, connectedIp };
    this._updateBackgroundMediaMetadata();
    this._scheduleBackgroundMediaRefresh([150, 750]);
  }

  async _configureAudioSession() {
    if (this._audioConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,          // Play even when iPhone is on silent
        shouldPlayInBackground: true,     // Keep audio session alive in background
        interruptionMode: "duckOthers",   // Lower other apps' audio (e.g. the game)
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
      if (this.expoSpeechActive) {
        Speech.stop();
        this.expoSpeechActive = false;
      }
      this._stopCurrentAnnouncement();
      this.currentAnnouncementPlayer = null;
      if (this.currentCalloutFinish) this.currentCalloutFinish();
      else this._disposePlayer(this.currentCalloutPlayer);
      this.currentCalloutPlayer = null;
      this.speechQueue = [];
      this.calloutQueue = [];
      this.isProcessingQueue = false;
      this.isProcessingCalloutQueue = false;
    } else {
      if (this.boardingMusic) {
        try {
          this.boardingMusic.play();
          this._scheduleBackgroundMediaRefresh([0, 500]);
        } catch (e) {}
      }
      if (this.boardingAnnouncePlayer) {
        try {
          this.boardingAnnouncePlayer.play();
          this._scheduleBackgroundMediaRefresh([0, 500]);
        } catch (e) {}
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
        .replace(/\b(Gear up|Flaps up|Landing gear up)\b/ig, "$1.")
        .replace(/\.\.+/g, ".")
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

    options = normalizeSpeechOptions(options);
    const tone = options.tone || "default";
    const now = Date.now();
    const spokenText = this.formatText(text, tone);

    // De-duplicate rapid identical announcements
    if (spokenText === this.lastSpokenText && now - this.lastSpokenAt < 900) return;

    this.lastSpokenText = spokenText;
    this.lastSpokenAt = now;

    if (!this.voiceEnabled) return;

    const profile = this.getVoiceProfile(tone);

    if (tone === "callout" || options.priority) {
      this._interruptCurrentNonCalloutAudio();
    }

    if (tone === "callout" && staticAudioMap[spokenText] && !options.forceQueue) {
      this._enqueueSpeech({
        spokenText,
        options: { ...options, priority: true, _staticOwner: "callout" },
        profile,
      });
      this.processQueue();
      return;
    }
    
    this._enqueueSpeech({ spokenText, options, profile });
    if (typeof options.afterSpeech === "function") {
      this._enqueueAction(options.afterSpeech, { priority: options.priority });
      return;
    }
    this.processQueue();
  }

  async processQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.speechQueue.length > 0) {
        const { spokenText, options = {}, profile, action } = this.speechQueue.shift();

        try {
          if (typeof action === "function") {
            await this._runQueueAction(action);
            continue;
          }

          if (options.withChime) {
            const playedChime = await this._playChimeNow();
            if (playedChime) {
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }

          this._logSpeech(spokenText, options);

          // ── If there is a pre-recorded audio file for this exact text ────────
          const staticAudioEntry = staticAudioMap[spokenText];
          if (staticAudioEntry) {
            const audioAsset = staticAudioEntry[this.voicePreference] || staticAudioEntry.female;
            const startedStaticPlayback = await this._playStaticAudio(
              audioAsset,
              profile.volume * this.masterVolume * this.coPilotVolume,
              {
                owner: options._staticOwner || "announcement",
                maxWaitMs:
                  options._staticOwner === "callout"
                    ? this._getCalloutMaxWaitMs(spokenText)
                    : 10000,
              }
            );
            if (!startedStaticPlayback) {
              await this._speakWithExpoSpeech(spokenText, profile);
            }
          } 
          // ── If this queue item was routed through Polly, use speakPolly ────────
          else if (options._pollyVoiceId) {
            await this.speakPolly(spokenText, options._pollyVoiceId, profile);
          } else {
            await this._speakWithExpoSpeech(spokenText, profile);
          }
        } catch (e) {
          console.log("[Speech] Queue item failed:", e);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
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
        this._disposePlayer(this.pollyPlayer);
        this.pollyPlayer = null;

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
        this._scheduleBackgroundMediaRefresh([0, 350, 1200]);

        // Override resolve to also clear safetyTimer
        const originalResolve = resolve;
        resolve = () => {
          clearTimeout(safetyTimer);
          this._scheduleBackgroundMediaRefresh();
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
    return this._speakWithExpoSpeech(text, profile);
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
    options = normalizeSpeechOptions(options);
    const tone = options.tone || "default";
    const now = Date.now();
    const spokenText = this.formatText(text, tone);

    // De-duplicate rapid identical announcements
    if (spokenText === this.lastSpokenText && now - this.lastSpokenAt < 900) return;
    this.lastSpokenText = spokenText;
    this.lastSpokenAt = now;

    if (!this.voiceEnabled) return;

    const profile = this.getVoiceProfile(tone);

    // Use polly-aware queue entry
    this._enqueueSpeech({ spokenText, options: { ...options, _pollyVoiceId: voiceId }, profile });
    this.processQueue();
  }

  async playChime() {
    await this._playChimeNow();
  }

  async playBoardingAnnouncement(livery, { fadeBoardingMusic = true } = {}) {
    this.stopBoardingMusic({ fade: fadeBoardingMusic });
    
    if (this.boardingAnnouncePlayer) return;
    if (this._isFetchingBoardingAnnounce && this._fetchingBoardingAnnounceFor === livery) return;

    this._isFetchingBoardingAnnounce = true;
    this._fetchingBoardingAnnounceFor = livery;

    this._requestCounter = (this._requestCounter || 0) + 1;
    const playRequestId = this._requestCounter;
    this._boardingAnnounceRequestId = playRequestId;

    const getFileName = (l) => {
      const lower = (l || "").toLowerCase();
      if (lower.includes("aer lingus")) return "announcements/aer-lingus.mp3";
      if (lower.includes("air canada")) return "announcements/air-canada.mp3";
      if (lower.includes("air china")) return "announcements/air-china.mp3";
      if (lower.includes("air france")) return "announcements/air-france.mp3";
      if (lower.includes("air india")) return "announcements/air-india.mp3";
      if (lower.includes("british airways")) return "announcements/british-airways.mp3";
      if (lower.includes("delta")) return "announcements/delta.mp3";
      if (lower.includes("egyptair")) return "announcements/egyptair.mp3";
      if (lower.includes("emirates")) return "announcements/emirates.mp3";
      if (lower.includes("finnair")) return "announcements/finnair.mp3";
      if (lower.includes("garuda indonesia")) return "announcements/garuda-indonesia.mp3";
      if (lower.includes("indigo")) return "announcements/indigo.mp3";
      if (lower.includes("japan airlines") || lower.includes("jal")) return "announcements/japan-airlines.mp3";
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
        this._disposePlayer(this.boardingAnnouncePlayer);
      }
      this.boardingAnnouncePlayer = createAudioPlayer(audioUri);
      this.boardingAnnouncePlayer.volume = this.masterVolume * this.safetyBriefingVolume;
      
      if (this.voiceEnabled) {
        this.boardingAnnouncePlayer.play();
        this._scheduleBackgroundMediaRefresh([0, 500, 1500]);
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
      this._disposePlayer(this.boardingAnnouncePlayer);
      this.boardingAnnouncePlayer = null;
      this._scheduleBackgroundMediaRefresh();
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

  _getBoardingMusicFileName(livery) {
    const lower = (livery || "").toLowerCase();
    if (lower.includes("american")) return "music/american-airlines.mp3";
    if (lower.includes("cathay")) return "music/cathay-pacific.mp3";
    if (lower.includes("emirates")) return "music/emirates.mp3";
    if (lower.includes("indigo")) return "music/indigo.mp3";
    if (lower.includes("lufthansa")) return "music/lufthansa.mp3";
    if (lower.includes("turkish")) return "music/turkish-airlines.mp3";
    if (lower.includes("aer lingus")) return "music/aer-lingus.mp3";
    if (lower.includes("air canada")) return "music/air-canada.mp3";
    if (lower.includes("air china")) return "music/air-china.mp3";
    if (lower.includes("air france")) return "music/air-france.mp3";
    if (lower.includes("air india")) return "music/air-india.mp3";
    if (lower.includes("air japan")) return "music/air-japan.mp3";
    if (lower.includes("air new zealand") || lower.includes("air nz")) return "music/air-new-zealand.mp3";
    if (lower.includes("air portugal") || lower.includes("tap")) return "music/air-portugal.mp3";
    if (lower.includes("ana") || lower.includes("all nippon")) return "music/ana.mp3";
    if (lower.includes("british airways")) return "music/british-airways.mp3";
    if (lower.includes("brussels")) return "music/brussels-airlines.mp3";
    if (lower.includes("delta")) return "music/delta-air-lines.mp3";
    if (lower.includes("egyptair")) return "music/egyptair.mp3";
    if (lower.includes("ethiopian")) return "music/ethiopian-airlines.mp3";
    if (lower.includes("finnair")) return "music/finnair.mp3";
    if (lower.includes("gulf air")) return "music/gulf-air.mp3";
    if (lower.includes("iran air")) return "music/iran-air.mp3";
    if (lower.includes("klm")) return "music/klm.mp3";
    if (lower.includes("malaysia")) return "music/malaysia-airlines.mp3";
    if (lower.includes("qantas")) return "music/qantas.mp3";
    if (lower.includes("qatar")) return "music/qatar-airways.mp3";
    if (lower.includes("singapore")) return "music/singapore-airlines.mp3";
    if (lower.includes("swiss")) return "music/swiss.mp3";
    if (lower.includes("vietnam")) return "music/vietnam-airlines.mp3";
    if (lower.includes("virgin atlantic")) return "music/virgin-atlantic.mp3";
    if (lower.includes("westjet")) return "music/westjet.mp3";
    return "music/american-airlines.mp3";
  }

  _getBoardingMusicUri(livery) {
    const remoteFileName = this._getBoardingMusicFileName(livery);
    if (this._boardingMusicPrefetches.has(remoteFileName)) {
      return this._boardingMusicPrefetches.get(remoteFileName);
    }

    const request = getCachedAudioUri(remoteFileName, "music/american-airlines.mp3")
      .catch((error) => {
        console.warn("[Speech] Boarding music prefetch failed:", error?.message || error);
        return null;
      })
      .finally(() => {
        this._boardingMusicPrefetches.delete(remoteFileName);
      });

    this._boardingMusicPrefetches.set(remoteFileName, request);
    return request;
  }

  preloadBoardingMusic(livery) {
    if (!livery) return;
    this._getBoardingMusicUri(livery);
  }

  async playBoardingMusic(livery) {
    if (this.boardingMusic) return;
    if (this._isFetchingBoardingMusic && this._fetchingBoardingMusicFor === livery) return;

    this._isFetchingBoardingMusic = true;
    this._fetchingBoardingMusicFor = livery;

    this._requestCounter = (this._requestCounter || 0) + 1;
    const playRequestId = this._requestCounter;
    this._boardingMusicRequestId = playRequestId;

    try {
      const audioUri = await this._getBoardingMusicUri(livery);
      
      // If stopped or disconnected while downloading, abort
      if (this._boardingMusicRequestId !== playRequestId) return;

      if (!audioUri) {
        console.warn("[Speech] Could not get cached audio for boarding music.");
        return;
      }

      if (this.boardingMusic) {
        this._disposePlayer(this.boardingMusic);
      }
      if (this._boardingMusicFadeTimer) {
        clearInterval(this._boardingMusicFadeTimer);
        this._boardingMusicFadeTimer = null;
      }
      this.boardingMusic = createAudioPlayer(audioUri);
      this.boardingMusic.loop = true;
      this.boardingMusic.volume = this.masterVolume * this.boardingMusicVolume;
      
      if (this.voiceEnabled) {
        this.boardingMusic.play();
        this._scheduleBackgroundMediaRefresh([0, 500, 1500]);
      }
    } catch (e) {
      console.log("[Speech] Boarding music failed:", e);
    } finally {
      if (this._boardingMusicRequestId === playRequestId) {
        this._isFetchingBoardingMusic = false;
      }
    }
  }

  stopBoardingMusic({ fade = false, durationMs = BOARDING_MUSIC_FADE_MS } = {}) {
    this._boardingMusicRequestId = null;
    const player = this.boardingMusic;
    if (!player) return;

    if (this._boardingMusicFadeTimer) {
      clearInterval(this._boardingMusicFadeTimer);
      this._boardingMusicFadeTimer = null;
    }

    const cleanup = () => {
      if (this._boardingMusicFadeTimer) {
        clearInterval(this._boardingMusicFadeTimer);
        this._boardingMusicFadeTimer = null;
      }
      if (this.boardingMusic === player) {
        this.boardingMusic = null;
      }
      this._disposePlayer(player);
      this._scheduleBackgroundMediaRefresh();
    };

    if (fade && this.voiceEnabled) {
      const steps = 14;
      const intervalMs = Math.max(50, Math.round(durationMs / steps));
      const startVolume =
        typeof player.volume === "number"
          ? player.volume
          : this.masterVolume * this.boardingMusicVolume;
      let step = 0;

      this._boardingMusicFadeTimer = setInterval(() => {
        step += 1;
        try {
          player.volume = Math.max(0, startVolume * (1 - step / steps));
        } catch (e) {
          cleanup();
          return;
        }
        if (step >= steps) cleanup();
      }, intervalMs);
    } else {
      cleanup();
    }
  }

  stopAll() {
    this.speechQueue = [];
    this.calloutQueue = [];
    this.isProcessingQueue = false;
    this.isProcessingCalloutQueue = false;
    Speech.stop();
    this._stopCurrentAnnouncement();
    this.currentAnnouncementPlayer = null;
    if (this.currentCalloutFinish) this.currentCalloutFinish();
    else this._disposePlayer(this.currentCalloutPlayer);
    this.currentCalloutPlayer = null;
    this.stopBoardingMusic();
    this.stopBoardingAnnouncement();
    if (this.chimePlayer) {
      this._disposePlayer(this.chimePlayer);
      this.chimePlayer = null;
    }
    if (this.sirenPlayer) {
      this._disposePlayer(this.sirenPlayer);
      this.sirenPlayer = null;
    }
    if (this.pollyPlayer) {
      this._disposePlayer(this.pollyPlayer);
      this.pollyPlayer = null;
    }
  }
}

export const speechManager = new SpeechManager();
