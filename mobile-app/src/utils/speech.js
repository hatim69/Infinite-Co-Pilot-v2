/**
 * speech.js
 *
 * Manages all audio output for Infinite Co-Pilot:
 *   - TTS announcements via expo-speech (all standard callouts)
 *   - Amazon Polly Neural TTS for the arrival welcome announcement
 *   - Chime, boarding announcements, boarding music, and siren via expo-audio
 *
 * Background audio is configured so announcements fire even when the user
 * switches to the game app. iOS keeps the existing audio-background anchor;
 * Android runtime lifetime is owned by the app foreground service.
 *
 * Polly backend URL is read from EXPO_PUBLIC_POLLY_BACKEND_URL env var.
 * Falls back to expo-speech automatically if the backend is unreachable.
 */

import * as Speech from "expo-speech";
import { Asset } from "expo-asset";
import { createAudioPlayer, setAudioModeAsync, preload } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getCachedAudioUri, getExistingCachedAudioUri, isLocalCachedAudioUri } from "./audioCache";
import { staticAudioMap } from "./staticAudioMap";
import { runtimeTrace } from "./runtimeTrace";

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
const STATIC_AUDIO_START_TIMEOUT_MS = 1200;
const POLLY_AUDIO_START_TIMEOUT_MS = 2500;
const CHIME_START_TIMEOUT_MS = 700;
const CHIME_MAX_WAIT_MS = 2500;
const BOARDING_ANNOUNCEMENT_START_TIMEOUT_MS = 3000;
const BOARDING_ANNOUNCEMENT_MAX_WAIT_MS = 180000;
const EXPO_SPEECH_MIN_TIMEOUT_MS = 3500;
const EXPO_SPEECH_MAX_TIMEOUT_MS = 45000;
const EXPO_SPEECH_MS_PER_WORD = 520;
const QUEUE_ACTION_TIMEOUT_MS = 15000;
const MAX_SPEECH_QUEUE_LENGTH = 120;
const STATIC_AUDIO_START_OFFSET_SEC = 0.035;
const BOARDING_MUSIC_FADE_MS = 1400;
const BACKGROUND_KEEP_ALIVE_INTERVAL_MS = 45000;
const BACKGROUND_AUDIO_PLAYER_OPTIONS = {
  updateInterval: 1000,
  keepAudioSessionActive: true,
};
const EFFECT_AUDIO_PLAYER_OPTIONS = {
  keepAudioSessionActive: true,
};
const CHIME_AUDIO_PLAYER_OPTIONS = {
  updateInterval: 50,
  keepAudioSessionActive: true,
};
const STATIC_AUDIO_PLAYER_OPTIONS = {
  updateInterval: 100,
  keepAudioSessionActive: true,
};
const AUDIO_RESOURCES = Object.freeze({
  BOARDING_ANNOUNCEMENT: "boardingAnnouncePlayer",
  STATIC_AUDIO: "staticAudioPlayer",
  POLLY: "pollyPlayer",
  EXPO_SPEECH: "expoSpeech",
  CHIME: "chimePlayer",
  CURRENT_ANNOUNCEMENT: "currentAnnouncementPlayer",
  CURRENT_CALLOUT: "currentCalloutPlayer",
});
const QUEUE_CHANNELS = Object.freeze(["cockpit", "cabin"]);
const STATIC_PLAYER_HEALTH = Object.freeze({
  HEALTHY: "healthy",
  RECOVERING: "recovering",
  FAILED: "failed",
});
const STATIC_AUDIO_MAX_RETRY_COUNT = 1;
const CHIME_AUDIO_ASSET = require("../../assets/chime.mp3");
const PTU_BARK_ASSET = require("../../assets/audio/ptu-bark.mp3");
const PASSENGER_NOISES_ASSET = require("../../assets/audio/boarding_noise.mp3");
const BACKGROUND_AUDIO_ASSET = require("../../assets/silent.m4a");
const LOCK_SCREEN_ARTWORK_ASSET = require("../../assets/images/icon.png");

const normalizeSpeechOptions = (options, defaultTone = "default") => {
  if (typeof options === "string") return { tone: options };
  return { tone: defaultTone, ...(options || {}) };
};

const hasUriScheme = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9+.-]*:/i.test(value);

const usesBackgroundAudioAnchor = () => Platform.OS !== "android";

class SpeechManager {
  constructor() {
    this.speechQueue = [];
    this.cabinQueue = [];
    this.sirenPlaying = false;
    this.ptuPlaying = false;
    this.addLog = null;
    this.lastSpokenText = "";
    this.lastSpokenAt = 0;
    this.voicePreference = "female";
    this.voiceEnabled = true;
    this.radioMicEffectEnabled = true;

    // Volumes — 100% by default; user adjusts via settings
    this.masterVolume = 1.0;
    this.coPilotVolume = 1.0;
    this.boardingMusicVolume = 0.25;
    this.safetyBriefingVolume = 1.0;
    this.passengerNoisesVolume = 0.5;
    this.passengerNoisesEnabled = true;
    this.chimeEnabled = true;

    this.boardingMusic = null;
    this.passengerNoisePlayer = null;
    this.sirenPlayer = null;
    this.chimePlayer = null;
    this.boardingAnnouncePlayer = null;
    this.boardingAnnounceFinish = null;
    this.silentPlayer = null;
    this.pollyPlayer = null; // dedicated player for Polly audio
    this.staticAudioPlayer = null;
    this.staticAudioPlayerHealth = STATIC_PLAYER_HEALTH.HEALTHY;
    this.activeStaticLease = null;
    this._staticPlaybackId = 0;
    this._staticSourceGeneration = 0;
    this._staticPlayerRebuildCount = 0;
    this.currentAnnouncementPlayer = null;
    this.currentAnnouncementFinish = null;
    this.currentAnnouncementTone = "default";
    this.currentCalloutPlayer = null;
    this.currentCalloutFinish = null;
    this.currentChimeFinish = null;
    this._boardingMusicFadeTimer = null;
    this._boardingMusicFadeFinish = null;
    this._lockScreenArtworkUrl = null;
    this._backgroundSessionState = { active: false, connectedIp: "" };
    this._backgroundMediaRefreshTimers = new Set();
    this._backgroundAnchorResumeTimer = null;
    this._backgroundAnchorStatusSubscription = null;
    this._backgroundKeepAliveTimer = null;
    this._backgroundAnchorPromise = null;
    this._boardingMusicPrefetches = new Map();
    this._boardingMusicCachedUris = new Map();
    this._audioConfigured = false;
    this.isProcessingQueue = false;
    this.isProcessingCabinQueue = false;
    this.expoSpeechActive = false;
    this._playbackGeneration = 0;
    this._speechPlaybackDepth = 0;
    this._busyAudioResources = new Set();
    this._channelBusy = {
      cockpit: false,
      cabin: false,
    };
    this._schedulerScheduled = false;

    // In-memory Polly response cache: Map<"text|voiceId", base64DataUri>
    // Avoids repeat network calls for identical text+voice combinations.
    this.pollyCache = new Map();

    this.ready = this.init();
  }

  _clearPlayerMediaSession(player) {
    if (!player) return;
    try {
      if (typeof player.clearLockScreenControls === "function") {
        player.clearLockScreenControls();
      } else if (typeof player.setActiveForLockScreen === "function") {
        player.setActiveForLockScreen(false);
      }
    } catch (e) { }
  }

  _disposePlayer(player, { pause = true } = {}) {
    if (!player) return;
    this._clearPlayerMediaSession(player);
    try {
      if (pause && typeof player.pause === "function") player.pause();
    } catch (e) { }
    try {
      if (typeof player.remove === "function") player.remove();
      else if (typeof player.release === "function") player.release();
    } catch (e) { }
  }

  _getActivePlayerCount() {
    return new Set([
      this.boardingMusic,
      this.sirenPlayer,
      this.chimePlayer,
      this.boardingAnnouncePlayer,
      this.silentPlayer,
      this.pollyPlayer,
      this.staticAudioPlayer,
      this.currentAnnouncementPlayer,
      this.currentCalloutPlayer,
    ].filter(Boolean)).size;
  }

  getDiagnostics() {
    return {
      queueSize: this.speechQueue.length,
      cabinQueueSize: this.cabinQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      isProcessingCabinQueue: this.isProcessingCabinQueue,
      expoSpeechActive: this.expoSpeechActive,
      voiceEnabled: this.voiceEnabled,
      radioMicEffectEnabled: this.radioMicEffectEnabled,
      speechPlaybackDepth: this._speechPlaybackDepth,
      playerCount: this._getActivePlayerCount(),
      boardingMusicActive: Boolean(this.boardingMusic),
      boardingAnnouncementActive: Boolean(this.boardingAnnouncePlayer),
      currentAnnouncementActive: Boolean(this.currentAnnouncementPlayer),
      currentCalloutActive: Boolean(this.currentCalloutPlayer),
      staticAudioPlayerActive: Boolean(this.staticAudioPlayer),
      staticAudioLeaseActive: Boolean(this.activeStaticLease),
      staticAudioPlayerHealth: this.staticAudioPlayerHealth,
      busyAudioResources: Array.from(this._busyAudioResources),
    };
  }

  _isStaticLeaseCurrent(lease) {
    return Boolean(
      lease &&
      !lease.resolved &&
      this.activeStaticLease === lease &&
      lease.generation === this._playbackGeneration
    );
  }

  _traceStaticPlayer(event, payload = {}) {
    runtimeTrace(event, {
      source: "expo-audio",
      owner: "SpeechManager",
      playerHealth: this.staticAudioPlayerHealth,
      activeLeaseId: this.activeStaticLease?.id || null,
      staticPlayerActive: Boolean(this.staticAudioPlayer),
      playerCount: this._getActivePlayerCount(),
      ...payload,
    }, { throttleMs: 0 });
  }

  _describeAudioSource(audioAsset) {
    if (typeof audioAsset === "number") return `asset:${audioAsset}`;
    if (typeof audioAsset === "string") return audioAsset;
    if (audioAsset?.uri) return audioAsset.uri;
    return String(audioAsset || "unknown");
  }

  _selectStaticAudioAsset(staticAudioEntry) {
    const voice = this.voicePreference === "male" ? "male" : "female";
    if (this.radioMicEffectEnabled) {
      const radioKey = `${voice}Radio`;
      return staticAudioEntry[radioKey] || staticAudioEntry[voice] || staticAudioEntry.female;
    }
    return staticAudioEntry[voice] || staticAudioEntry.female;
  }

  _statusTimeMillis(status, key) {
    const value = status?.[key];
    if (typeof value === "number") return value;
    if (key === "positionMillis" && typeof status?.currentTime === "number") {
      return Math.round(status.currentTime * 1000);
    }
    if (key === "durationMillis" && typeof status?.duration === "number") {
      return Math.round(status.duration * 1000);
    }
    return null;
  }

  _traceStaticLeaseDebug(event, lease, payload = {}) {
    runtimeTrace("speech.static_lease_debug", {
      source: "expo-audio",
      owner: "SpeechManager",
      debugEvent: event,
      leaseId: lease?.id || null,
      audioSource: lease?.source || null,
      activeLeaseId: this.activeStaticLease?.id || null,
      generation: lease?.generation ?? this._playbackGeneration,
      currentGeneration: this._playbackGeneration,
      playerHealth: this.staticAudioPlayerHealth,
      ...payload,
    }, { throttleMs: 0 });
  }

  _getReusableStaticPlayer() {
    if (
      this.staticAudioPlayer &&
      this.staticAudioPlayerHealth !== STATIC_PLAYER_HEALTH.FAILED
    ) {
      return this.staticAudioPlayer;
    }

    if (this.staticAudioPlayer) {
      this._removeReusableStaticPlayer("health_failed");
    }

    const player = createAudioPlayer(null, STATIC_AUDIO_PLAYER_OPTIONS);
    this.staticAudioPlayer = player;
    this.staticAudioPlayerHealth = STATIC_PLAYER_HEALTH.HEALTHY;
    this._traceStaticPlayer("speech.static_player_created", {
      rebuildCount: this._staticPlayerRebuildCount,
    });
    return player;
  }

  _removeReusableStaticPlayer(reason = "removed") {
    const player = this.staticAudioPlayer;
    if (!player) return;

    if (this.currentAnnouncementPlayer === player) this.currentAnnouncementPlayer = null;
    if (this.currentCalloutPlayer === player) this.currentCalloutPlayer = null;

    this.staticAudioPlayer = null;
    this._disposePlayer(player, { pause: true });
    this._traceStaticPlayer("speech.static_player_removed", { reason });
  }

  _getQueue(channel = "cockpit") {
    return channel === "cabin" ? this.cabinQueue : this.speechQueue;
  }

  _traceQueue(event, channel, payload = {}) {
    runtimeTrace(event, {
      source: "speech-queue",
      owner: "SpeechManager",
      channel,
      cockpitQueueSize: this.speechQueue.length,
      cabinQueueSize: this.cabinQueue.length,
      playerCount: this._getActivePlayerCount(),
      ...payload,
    }, { throttleMs: 0 });
  }

  _enqueueSpeech(entry, channel = "cockpit") {
    const queue = this._getQueue(channel);
    runtimeTrace("speech.enqueue", {
      source: entry.action ? "queue-action" : "speechManager.speak",
      owner: "SpeechManager",
      channel,
      tone: entry.options?.tone,
      priority: Boolean(entry.options?.priority),
      queueSize: queue.length,
      playerCount: this._getActivePlayerCount(),
    }, { throttleMs: 0 });

    if (entry.spokenText) {
      const duplicateIndex = queue.findIndex(
        (queued) =>
          queued.spokenText === entry.spokenText &&
          Boolean(queued.options?.priority) === Boolean(entry.options?.priority)
      );
      if (duplicateIndex !== -1) queue.splice(duplicateIndex, 1);
    }

    if (!entry.options?.priority) {
      queue.push(entry);
      this._traceQueue("speech.queue_item_queued", channel, {
        tone: entry.options?.tone,
        hasAction: typeof entry.action === "function",
        text: entry.spokenText,
      });
      this._trimSpeechQueue(channel);
      return;
    }

    const firstNormalIndex = queue.findIndex(
      (queued) => !queued.options?.priority
    );
    if (firstNormalIndex === -1) queue.push(entry);
    else queue.splice(firstNormalIndex, 0, entry);
    this._traceQueue("speech.queue_item_queued", channel, {
      tone: entry.options?.tone,
      priority: true,
      hasAction: typeof entry.action === "function",
      text: entry.spokenText,
    });
    this._trimSpeechQueue(channel);
  }

  _trimSpeechQueue(channel = "cockpit") {
    const queue = this._getQueue(channel);
    while (queue.length > MAX_SPEECH_QUEUE_LENGTH) {
      const dropIndex = queue.findIndex((queued) => !queued.options?.priority);
      queue.splice(dropIndex === -1 ? 0 : dropIndex, 1);
      console.warn("[Speech] Speech queue overflow; dropped the oldest queued announcement.");
    }
  }

  _enqueueAction(action, options = {}, channel = "cockpit") {
    this._enqueueSpeech({ action, options }, channel);
    this._scheduleQueues();
  }

  enqueueCabinAction(action, options = {}) {
    return new Promise((resolve) => {
      this._enqueueAction(async () => {
        try {
          const result = await Promise.resolve().then(action);
          resolve(result);
          return result;
        } catch (error) {
          resolve(false);
          throw error;
        }
      }, options, "cabin");
    });
  }

  async _runQueueAction(action, options = {}) {
    if (options.detached) {
      Promise.resolve()
        .then(action)
        .catch((error) => {
          console.log("[Speech] Detached queue action failed:", error?.message || error);
        });
      return undefined;
    }

    let timeoutId;
    const timeoutMs =
      options.actionTimeoutMs === false ? false : options.actionTimeoutMs || QUEUE_ACTION_TIMEOUT_MS;
    if (timeoutMs === false) {
      return Promise.resolve().then(action);
    }
    try {
      return await Promise.race([
        Promise.resolve().then(action),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            console.warn("[Speech] Queue action timed out; continuing queue.");
            resolve();
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  _enqueueCallout(entry) {
    const calloutEntry = {
      ...entry,
      options: { ...(entry.options || {}), priority: true, _staticOwner: "callout" },
    };

    this._enqueueSpeech(calloutEntry, "cockpit");
    this.processQueue();
  }

  _normalizeResources(resources = []) {
    const values = Array.isArray(resources) ? resources : [resources];
    return Array.from(new Set(values.filter(Boolean)));
  }

  _getEntryResources(entry = {}) {
    const { spokenText, options = {}, action } = entry;
    if (typeof action === "function") {
      return this._normalizeResources(options.resources);
    }

    const resources = [];
    if (options.withChime && this._isSignChimeRequest(options)) {
      resources.push(AUDIO_RESOURCES.CHIME);
    }

    if (spokenText && staticAudioMap[spokenText]) {
      resources.push(AUDIO_RESOURCES.STATIC_AUDIO);
      resources.push(
        options._staticOwner === "callout"
          ? AUDIO_RESOURCES.CURRENT_CALLOUT
          : AUDIO_RESOURCES.CURRENT_ANNOUNCEMENT
      );
      return this._normalizeResources(resources);
    }

    if (options._pollyVoiceId) {
      resources.push(AUDIO_RESOURCES.POLLY, AUDIO_RESOURCES.CURRENT_ANNOUNCEMENT);
      return this._normalizeResources(resources);
    }

    resources.push(AUDIO_RESOURCES.EXPO_SPEECH);
    return this._normalizeResources(resources);
  }

  _areResourcesFree(resources = []) {
    return this._normalizeResources(resources).every(
      (resource) => !this._busyAudioResources.has(resource)
    );
  }

  _acquireResources(resources = []) {
    for (const resource of this._normalizeResources(resources)) {
      this._busyAudioResources.add(resource);
    }
  }

  _releaseResources(resources = []) {
    for (const resource of this._normalizeResources(resources)) {
      this._busyAudioResources.delete(resource);
    }
  }

  _releaseReservationResources(reservation, resources = []) {
    const normalized = this._normalizeResources(resources);
    this._releaseResources(normalized);
    reservation.resources = reservation.resources.filter(
      (resource) => !normalized.includes(resource)
    );
  }

  async _waitForResources(resources = []) {
    const normalized = this._normalizeResources(resources);
    if (this._areResourcesFree(normalized)) return;

    await new Promise((resolve) => {
      const check = () => {
        if (this._areResourcesFree(normalized)) {
          resolve();
          return;
        }
        setTimeout(check, 25);
      };
      check();
    });
  }

  async _runWithTemporaryResources(resources, action, context = {}) {
    const normalized = this._normalizeResources(resources);
    await this._waitForResources(normalized);
    this._acquireResources(normalized);
    runtimeTrace("speech.scheduler_resource_acquired", {
      source: "speech-scheduler",
      owner: "SpeechManager",
      resources: normalized,
      busyAudioResources: Array.from(this._busyAudioResources),
      ...context,
    }, { throttleMs: 0 });
    try {
      return await Promise.resolve().then(action);
    } finally {
      this._releaseResources(normalized);
      runtimeTrace("speech.scheduler_resource_released", {
        source: "speech-scheduler",
        owner: "SpeechManager",
        resources: normalized,
        busyAudioResources: Array.from(this._busyAudioResources),
        ...context,
      }, { throttleMs: 0 });
      this._scheduleQueues();
    }
  }

  _setChannelProcessing(channel, isProcessing) {
    if (channel === "cabin") this.isProcessingCabinQueue = isProcessing;
    else this.isProcessingQueue = isProcessing;
  }

  _getQueueSource(channel) {
    return channel === "cabin"
      ? "speechManager.processCabinQueue"
      : "speechManager.processQueue";
  }

  _scheduleQueues() {
    if (this._schedulerScheduled) return Promise.resolve(false);
    this._schedulerScheduled = true;
    return Promise.resolve().then(() => {
      this._schedulerScheduled = false;
      return this._drainScheduler();
    });
  }

  _drainScheduler() {
    if (!this.voiceEnabled) return false;

    let startedAny = false;
    let startedThisPass = false;
    do {
      startedThisPass = false;
      for (const channel of QUEUE_CHANNELS) {
        if (this._channelBusy[channel]) continue;

        const queue = this._getQueue(channel);
        const entry = queue[0];
        if (!entry) continue;

        const resources = this._getEntryResources(entry);
        if (!this._areResourcesFree(resources)) {
          this._traceQueue("speech.scheduler_waiting_for_resources", channel, {
            resources,
            busyAudioResources: Array.from(this._busyAudioResources),
            text: entry.spokenText,
            hasAction: typeof entry.action === "function",
          });
          continue;
        }

        queue.shift();
        this._startScheduledEntry(channel, entry, resources);
        startedAny = true;
        startedThisPass = true;
      }
    } while (startedThisPass);

    return startedAny;
  }

  _startScheduledEntry(channel, entry, resources) {
    const generation = this._playbackGeneration;
    const reservation = {
      resources: this._normalizeResources(resources),
    };
    const { spokenText, options = {}, action } = entry;
    const queue = this._getQueue(channel);

    this._channelBusy[channel] = true;
    this._setChannelProcessing(channel, true);
    this._acquireResources(reservation.resources);

    runtimeTrace("speech.queue_start", {
      source: this._getQueueSource(channel),
      owner: "SpeechManager",
      channel,
      generation,
      resources: reservation.resources,
      ...this.getDiagnostics(),
    }, { throttleMs: 0 });

    runtimeTrace("speech.queue_item_start", {
      source: action ? "queue-action" : "speech-queue",
      owner: "SpeechManager",
      channel,
      generation,
      tone: options.tone,
      priority: Boolean(options.priority),
      hasAction: typeof action === "function",
      staticAudio: Boolean(spokenText && staticAudioMap[spokenText]),
      resources: reservation.resources,
      queueSize: queue.length,
      playerCount: this._getActivePlayerCount(),
    }, { throttleMs: 0 });

    Promise.resolve()
      .then(() => this._runScheduledQueueEntry(channel, entry, reservation, generation))
      .catch((e) => {
        console.log("[Speech] Queue item failed:", e);
        runtimeTrace("speech.queue_item_error", {
          source: "speech-queue",
          owner: "SpeechManager",
          channel,
          error: e?.message || String(e),
          queueSize: queue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
      })
      .finally(() => {
        this._releaseResources(reservation.resources);
        this._channelBusy[channel] = false;
        this._setChannelProcessing(channel, false);
        runtimeTrace("speech.queue_idle", {
          source: this._getQueueSource(channel),
          owner: "SpeechManager",
          channel,
          generation,
          ...this.getDiagnostics(),
        }, { throttleMs: 0 });
        this._scheduleQueues();
      });
  }

  async _runScheduledQueueEntry(channel, entry, reservation, generation) {
    const { spokenText, options = {}, profile, action } = entry;
    if (typeof action === "function") {
      await this._runQueueAction(action, options);
      return;
    }

    this.currentAnnouncementTone = options.tone || "default";

    if (!options._logged) {
      this._logSpeech(spokenText, options);
    }

    options._onPlaybackStart?.({ channel, spokenText });
    this._traceQueue("speech.playback_started", channel, {
      text: spokenText,
      tone: options.tone,
      resources: reservation.resources,
    });

    try {
      if (options.withChime && this._isSignChimeRequest(options)) {
        await this._playChimeNow();
        if (generation !== this._playbackGeneration) return;
      }

      const staticAudioEntry = staticAudioMap[spokenText];
      if (staticAudioEntry) {
        const audioAsset = this._selectStaticAudioAsset(staticAudioEntry);
        const startedStaticPlayback = await this._playStaticAudio(
          audioAsset,
          profile.volume * this.masterVolume * (this.currentAnnouncementTone === "briefing" ? this.safetyBriefingVolume : this.coPilotVolume),
          {
            owner: options._staticOwner || "announcement",
            maxWaitMs:
              options._staticOwner === "callout"
                ? this._getCalloutMaxWaitMs(spokenText)
                : this._getStaticAudioMaxWaitMs(spokenText, options.tone),
          }
        );
        if (!startedStaticPlayback && generation === this._playbackGeneration) {
          this._releaseReservationResources(reservation, [
            AUDIO_RESOURCES.STATIC_AUDIO,
            options._staticOwner === "callout"
              ? AUDIO_RESOURCES.CURRENT_CALLOUT
              : AUDIO_RESOURCES.CURRENT_ANNOUNCEMENT,
          ]);
          await this._runWithTemporaryResources(
            [AUDIO_RESOURCES.EXPO_SPEECH],
            () => this._speakWithExpoSpeech(spokenText, profile),
            {
              channel,
              text: spokenText,
              reason: "static_audio_fallback",
            }
          );
        }
      } else if (options._pollyVoiceId) {
        await this.speakPolly(spokenText, options._pollyVoiceId, profile, {
          fallback: () =>
            generation === this._playbackGeneration
              ? this._runWithTemporaryResources(
                [AUDIO_RESOURCES.EXPO_SPEECH],
                () => this._speakExpofallback(spokenText, profile),
                {
                  channel,
                  text: spokenText,
                  reason: "polly_fallback",
                }
              )
              : undefined,
        });
      } else {
        await this._speakWithExpoSpeech(spokenText, profile);
      }
    } finally {
      options._onPlaybackFinish?.({ channel, spokenText });
      this._traceQueue("speech.playback_finished", channel, {
        text: spokenText,
        tone: options.tone,
        resources: reservation.resources,
      });
    }
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

  _markLoggedOptions(spokenText, options = {}) {
    if (!spokenText || options._logged) return options;
    this._logSpeech(spokenText, options);
    return { ...options, _logged: true };
  }

  _beginSpeechAudio() {
    this._speechPlaybackDepth += 1;
  }

  _endSpeechAudio() {
    this._speechPlaybackDepth = Math.max(0, this._speechPlaybackDepth - 1);
  }

  _getWordCount(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  _getStaticAudioMaxWaitMs(spokenText, tone) {
    if (tone === "callout") return this._getCalloutMaxWaitMs(spokenText);
    if (tone === "briefing") return 45000;

    const wordCount = this._getWordCount(spokenText);
    if (wordCount <= 4) return 2500;
    if (wordCount <= 8) return 3500;
    if (wordCount <= 14) return 5000;
    return Math.min(15000, this._getExpoSpeechTimeoutMs(spokenText));
  }

  _stopSpeechPlayback({ clearQueues = false } = {}) {
    this._playbackGeneration += 1;
    if (clearQueues) {
      this.speechQueue = [];
      this.cabinQueue = [];
    }
    this._busyAudioResources.clear();
    this._channelBusy = {
      cockpit: false,
      cabin: false,
    };
    this._schedulerScheduled = false;
    Speech.stop();
    this.expoSpeechActive = false;
    this._stopCurrentAnnouncement();
    this.currentAnnouncementPlayer = null;
    if (this.currentCalloutFinish) this.currentCalloutFinish({ interrupted: true });
    else this._disposePlayer(this.currentCalloutPlayer);
    this.currentCalloutPlayer = null;
    if (this.currentChimeFinish) this.currentChimeFinish({ interrupted: true });
    else this._disposePlayer(this.chimePlayer);
    this.chimePlayer = null;
    if (this.boardingAnnounceFinish) this.boardingAnnounceFinish({ reason: "interrupted", interrupted: true });
    else this._disposePlayer(this.boardingAnnouncePlayer);
    this.boardingAnnouncePlayer = null;
    this._speechPlaybackDepth = 0;
    this.stopBoardingAnnouncement();
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
        this._endSpeechAudio();
        this.expoSpeechActive = false;
        this._scheduleBackgroundMediaRefresh();
        runtimeTrace("speech.expo_speech_finish", {
          source: "expo-speech.callback",
          owner: "SpeechManager",
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        resolve();
      };

      try {
        Promise.resolve(this._ensureBackgroundAnchor())
          .then(() => {
            this.expoSpeechActive = true;
            this._beginSpeechAudio();
            runtimeTrace("speech.expo_speech_start", {
              source: "expo-speech",
              owner: "SpeechManager",
              queueSize: this.speechQueue.length,
              playerCount: this._getActivePlayerCount(),
            }, { throttleMs: 0 });
            safetyTimer = setTimeout(() => {
              console.warn("[Speech] Expo Speech callback timed out; continuing queue.");
              try { Speech.stop(); } catch (e) { }
              finish();
            }, this._getExpoSpeechTimeoutMs(text));

            Speech.speak(text, {
              voice: voiceId,
              rate: profile.rate,
              pitch,
              volume: profile.volume * this.masterVolume * (this.currentAnnouncementTone === "briefing" ? this.safetyBriefingVolume : this.coPilotVolume),
              onDone: finish,
              onStopped: finish,
              onError: finish,
            });
          })
          .catch(finish);
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
    if (!usesBackgroundAudioAnchor()) return;
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

  async _ensureBackgroundAnchor({ force = false } = {}) {
    if (this._backgroundAnchorPromise && !force) {
      return this._backgroundAnchorPromise;
    }

    const ensurePromise = this._ensureBackgroundAnchorNow({ force });
    this._backgroundAnchorPromise = ensurePromise;
    try {
      return await ensurePromise;
    } finally {
      if (this._backgroundAnchorPromise === ensurePromise) {
        this._backgroundAnchorPromise = null;
      }
    }
  }

  async _ensureBackgroundAnchorNow({ force = false } = {}) {
    await this._configureAudioSession();
    if (!usesBackgroundAudioAnchor()) {
      this._releaseBackgroundAnchor();
      return;
    }

    if (!this.silentPlayer) {
      this.silentPlayer = createAudioPlayer(
        BACKGROUND_AUDIO_ASSET,
        BACKGROUND_AUDIO_PLAYER_OPTIONS
      );
      this.silentPlayer.volume = 1;
      this.silentPlayer.loop = true;
      this._installBackgroundAnchorResumeGuard();
    }

    try {
      if (force && typeof this.silentPlayer.seekTo === "function") {
        await this.silentPlayer.seekTo(0, 0, 0);
      }
    } catch (e) { }

    try {
      if (!this.silentPlayer.playing && typeof this.silentPlayer.play === "function") {
        this.silentPlayer.play();
      }
    } catch (e) {
      console.log("[Speech] Background anchor play failed:", e?.message || e);
    }

    await this._activateBackgroundMediaSession();
    this._startBackgroundKeepAlive();
  }

  _startBackgroundKeepAlive() {
    if (!usesBackgroundAudioAnchor()) return;
    if (this._backgroundKeepAliveTimer) return;

    this._backgroundKeepAliveTimer = setInterval(() => {
      this._ensureBackgroundAnchor({ force: true }).catch((e) => {
        console.log("[Speech] Background keep-alive failed:", e?.message || e);
      });
    }, BACKGROUND_KEEP_ALIVE_INTERVAL_MS);
  }

  _scheduleBackgroundMediaRefresh(delays = [0, 250, 1000]) {
    if (!usesBackgroundAudioAnchor()) return;
    if (!this.silentPlayer) return;

    delays.forEach((delay) => {
      const timer = setTimeout(() => {
        this._backgroundMediaRefreshTimers.delete(timer);
        this._activateBackgroundMediaSession();
      }, delay);
      this._backgroundMediaRefreshTimers.add(timer);
    });
  }

  _recoverBackgroundAudioSession(delays = [0, 250, 1000]) {
    if (!usesBackgroundAudioAnchor()) {
      this._configureAudioSession().catch(() => { });
      return;
    }
    this._ensureBackgroundAnchor({ force: true }).catch((e) => {
      console.log("[Speech] Background audio recovery failed:", e?.message || e);
    });
    this._scheduleBackgroundMediaRefresh(delays);
  }

  _installBackgroundAnchorResumeGuard() {
    if (!usesBackgroundAudioAnchor()) return;
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
    if (!usesBackgroundAudioAnchor()) return;
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

  _releaseBackgroundAnchor() {
    this._backgroundMediaRefreshTimers.forEach((timer) => clearTimeout(timer));
    this._backgroundMediaRefreshTimers.clear();

    if (this._backgroundAnchorResumeTimer) {
      clearTimeout(this._backgroundAnchorResumeTimer);
      this._backgroundAnchorResumeTimer = null;
    }

    if (this._backgroundKeepAliveTimer) {
      clearInterval(this._backgroundKeepAliveTimer);
      this._backgroundKeepAliveTimer = null;
    }

    if (this._backgroundAnchorStatusSubscription) {
      try {
        this._backgroundAnchorStatusSubscription.remove();
      } catch (e) { }
      this._backgroundAnchorStatusSubscription = null;
    }

    if (this.silentPlayer) {
      try {
        if (typeof this.silentPlayer.setActiveForLockScreen === "function") {
          this.silentPlayer.setActiveForLockScreen(false);
        }
      } catch (e) { }
      this._disposePlayer(this.silentPlayer, { pause: true });
      this.silentPlayer = null;
    }
  }

  _stopCurrentAnnouncement() {
    if (this.currentAnnouncementFinish) {
      this.currentAnnouncementFinish({ interrupted: true });
      return;
    }
    this._disposePlayer(this.currentAnnouncementPlayer);
    this.currentAnnouncementPlayer = null;
  }

  async _playChimeNow() {
    if (!this.chimeEnabled) return false;

    try {
      await this._ensureBackgroundAnchor();
    } catch (e) {
      console.log("[Speech] Chime background anchor failed:", e);
    }

    return new Promise((resolve) => {
      let player;
      let subscription;
      let checkInterval;
      let startTimer;
      let safetyTimer;
      let resolved = false;
      let hasStartedPlayback = false;

      const finish = ({ interrupted = false } = {}) => {
        if (resolved) return;
        resolved = true;
        if (subscription) {
          try { subscription.remove(); } catch (e) { }
        }
        if (checkInterval) clearInterval(checkInterval);
        if (startTimer) clearTimeout(startTimer);
        if (safetyTimer) clearTimeout(safetyTimer);
        if (this.chimePlayer === player) {
          this.chimePlayer = null;
        }
        if (this.currentChimeFinish === finish) {
          this.currentChimeFinish = null;
        }
        this._disposePlayer(player, { pause: true });
        this._endSpeechAudio();
        this._recoverBackgroundAudioSession([0, 400]);
        runtimeTrace("speech.chime_finish", {
          source: "expo-audio",
          owner: "SpeechManager",
          interrupted,
          started: hasStartedPlayback,
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        resolve(interrupted || hasStartedPlayback);
      };

      const markPlaybackStarted = (status) => {
        if (hasStartedPlayback) return;
        if (
          status?.playing ||
          status?.didJustFinish ||
          status?.currentTime > 0 ||
          player?.playing ||
          player?.currentTime > 0
        ) {
          hasStartedPlayback = true;
        }
      };

      try {
        if (this.chimePlayer) {
          this._disposePlayer(this.chimePlayer, { pause: true });
          this.chimePlayer = null;
        }

        player = createAudioPlayer(CHIME_AUDIO_ASSET, CHIME_AUDIO_PLAYER_OPTIONS);
        player.volume = this.masterVolume;
        this.chimePlayer = player;
        this.currentChimeFinish = finish;

        subscription = player.addListener("playbackStatusUpdate", (status) => {
          markPlaybackStarted(status);
          if (
            status.error ||
            status.didJustFinish ||
            (status.currentTime > 0 &&
              status.duration > 0 &&
              status.currentTime >= status.duration - 0.05)
          ) {
            finish();
          }
        });

        checkInterval = setInterval(() => {
          try {
            markPlaybackStarted();
            if (player.duration > 0 && player.currentTime >= player.duration - 0.05) {
              finish();
            }
          } catch (e) {
            finish();
          }
        }, 50);

        startTimer = setTimeout(() => {
          if (hasStartedPlayback) return;
          console.warn("[Speech] Chime did not start; continuing queue.");
          finish();
        }, CHIME_START_TIMEOUT_MS);

        safetyTimer = setTimeout(finish, CHIME_MAX_WAIT_MS);

        this._beginSpeechAudio();
        player.play();
        markPlaybackStarted();
        runtimeTrace("speech.chime_start", {
          source: "expo-audio",
          owner: "SpeechManager",
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        this._scheduleBackgroundMediaRefresh([0, 400]);
      } catch (e) {
        console.log("[Speech] Chime play failed:", e);
        finish();
      }
    });
  }

  _isSignChimeRequest(options = {}) {
    return options.chimeReason === "seatbelt_sign" || options.chimeReason === "no_smoking_sign";
  }

  async _playStaticAudio(
    audioAsset,
    volume,
    {
      owner = "announcement",
      maxWaitMs = 10000,
      startAtSeconds = STATIC_AUDIO_START_OFFSET_SEC,
    } = {}
  ) {
    const requestGeneration = this._playbackGeneration;
    for (let retryCount = 0; retryCount <= STATIC_AUDIO_MAX_RETRY_COUNT; retryCount += 1) {
      const result = await this._playStaticAudioLease(audioAsset, volume, {
        owner,
        maxWaitMs,
        startAtSeconds,
        retryCount,
        requestGeneration,
      });

      if (result.shouldRetry && retryCount < STATIC_AUDIO_MAX_RETRY_COUNT) {
        this.staticAudioPlayerHealth = STATIC_PLAYER_HEALTH.RECOVERING;
        this._staticPlayerRebuildCount += 1;
        this._traceStaticLeaseDebug("player_rebuilt", {
          id: result.leaseId,
          generation: result.generation,
          source: this._describeAudioSource(audioAsset),
        }, {
          reason: result.reason,
          retryCount: retryCount + 1,
          rebuildCount: this._staticPlayerRebuildCount,
        });
        this._traceStaticPlayer("speech.static_player_rebuilt", {
          reason: result.reason,
          leaseId: result.leaseId,
          generation: result.generation,
          retryCount: retryCount + 1,
          rebuildCount: this._staticPlayerRebuildCount,
        });
        this._removeReusableStaticPlayer(`recovering_${result.reason || "error"}`);
        continue;
      }

      if (result.nativeFailure && !result.started && !result.interrupted) {
        this.staticAudioPlayerHealth = STATIC_PLAYER_HEALTH.FAILED;
        this._removeReusableStaticPlayer(`failed_${result.reason || "error"}`);
      }

      const played = result.interrupted || result.started;
      if (!played) {
        this._traceStaticLeaseDebug("fallback_triggered", {
          id: result.leaseId,
          generation: result.generation,
          source: this._describeAudioSource(audioAsset),
        }, {
          reason: result.reason,
          retryCount,
        });
      }
      return played;
    }

    return false;
  }

  async _playStaticAudioLease(
    audioAsset,
    volume,
    {
      owner = "announcement",
      maxWaitMs = 10000,
      startAtSeconds = STATIC_AUDIO_START_OFFSET_SEC,
      retryCount = 0,
      requestGeneration = this._playbackGeneration,
    } = {}
  ) {
    try {
      await this._ensureBackgroundAnchor();
    } catch (e) { }

    if (requestGeneration !== this._playbackGeneration) {
      return {
        interrupted: true,
        started: false,
        nativeFailure: false,
        reason: "generation_changed_before_start",
        shouldRetry: false,
        leaseId: null,
        generation: requestGeneration,
      };
    }

    return new Promise((resolve) => {
      let player;
      let playbackStage = "setup";
      const lease = {
        id: ++this._staticPlaybackId,
        sourceGeneration: ++this._staticSourceGeneration,
        generation: requestGeneration,
        owner,
        audioAsset,
        source: this._describeAudioSource(audioAsset),
        subscription: null,
        checkInterval: null,
        safetyTimer: null,
        startTimer: null,
        resolved: false,
        started: false,
        speechAudioBegun: false,
        replaceStarted: false,
        replaceCompleted: false,
        seekStarted: false,
        seekCompleted: false,
        playCalled: false,
        playbackStarted: false,
        playbackAdvanced: false,
        lastPositionMillis: null,
        playbackBaselineMillis: null,
        retryCount,
      };
      this._traceStaticLeaseDebug("lease_created", lease, {
        ownerType: owner,
        retryCount,
      });

      const finish = ({
        interrupted = false,
        reason = "complete",
        nativeFailure = false,
      } = {}) => {
        if (lease.resolved) return;
        lease.resolved = true;

        if (lease.subscription) {
          this._traceStaticLeaseDebug("listener_removed", lease, {
            reason,
            interrupted,
            completionReason: reason,
          });
          try { lease.subscription.remove(); } catch (e) { }
        }
        if (lease.checkInterval) clearInterval(lease.checkInterval);
        if (lease.safetyTimer) clearTimeout(lease.safetyTimer);
        if (lease.startTimer) clearTimeout(lease.startTimer);

        if (this.activeStaticLease === lease) this.activeStaticLease = null;
        if (this.currentAnnouncementFinish === finish) this.currentAnnouncementFinish = null;
        if (this.currentCalloutFinish === finish) this.currentCalloutFinish = null;
        if (this.currentAnnouncementPlayer === player) this.currentAnnouncementPlayer = null;
        if (this.currentCalloutPlayer === player) this.currentCalloutPlayer = null;

        try {
          if (player && typeof player.pause === "function") player.pause();
        } catch (e) { }

        if (lease.speechAudioBegun) this._endSpeechAudio();
        this._recoverBackgroundAudioSession();
        this._traceStaticPlayer("speech.static_audio_finish", {
          ownerType: owner,
          interrupted,
          started: lease.started,
          reason,
          completionReason: reason,
          nativeFailure,
          leaseId: lease.id,
          generation: lease.generation,
          sourceGeneration: lease.sourceGeneration,
          retryCount,
          queueSize: this.speechQueue.length,
        });
        this._traceStaticLeaseDebug(
          interrupted ? "lease_cancelled" : "lease_resolved",
          lease,
          {
            reason,
            nativeFailure,
            started: lease.started,
            playbackStarted: lease.playbackStarted,
            replaceCompleted: lease.replaceCompleted,
            seekCompleted: lease.seekCompleted,
            playCalled: lease.playCalled,
            playbackAdvanced: lease.playbackAdvanced,
            sourceGeneration: lease.sourceGeneration,
          }
        );
        resolve({
          interrupted,
          started: lease.started,
          nativeFailure,
          reason,
          shouldRetry: Boolean(nativeFailure && !lease.started && !interrupted),
          leaseId: lease.id,
          generation: lease.generation,
          sourceGeneration: lease.sourceGeneration,
        });
      };

      lease.finish = finish;

      const getPlaybackSnapshot = (status) => {
        const statusPositionMillis = this._statusTimeMillis(status, "positionMillis");
        const statusDurationMillis = this._statusTimeMillis(status, "durationMillis");
        const playerPositionMillis =
          typeof player?.currentTime === "number"
            ? Math.round(player.currentTime * 1000)
            : null;
        const playerDurationMillis =
          typeof player?.duration === "number"
            ? Math.round(player.duration * 1000)
            : null;
        const positionMillis =
          typeof statusPositionMillis === "number"
            ? statusPositionMillis
            : playerPositionMillis;
        const durationMillis =
          typeof statusDurationMillis === "number"
            ? statusDurationMillis
            : playerDurationMillis;
        const isPlaying = Boolean(status?.playing ?? status?.isPlaying ?? player?.playing);
        const didJustFinish = Boolean(status?.didJustFinish);
        const isNearEnd =
          typeof positionMillis === "number" &&
          typeof durationMillis === "number" &&
          durationMillis > 0 &&
          positionMillis >= durationMillis - 100;

        return {
          positionMillis,
          durationMillis,
          isPlaying,
          didJustFinish,
          isNearEnd,
          isLoaded: status?.isLoaded ?? player?.isLoaded ?? null,
          playbackState: status?.playbackState ?? null,
        };
      };

      const tracePlaybackEstablished = (snapshot, trigger) => {
        if (lease.playbackStarted) return;
        lease.playbackStarted = true;
        lease.started = true;
        this._traceStaticLeaseDebug("playback_established", lease, {
          trigger,
          positionMillis: snapshot.positionMillis,
          durationMillis: snapshot.durationMillis,
          isPlaying: snapshot.isPlaying,
          didJustFinish: snapshot.didJustFinish,
          playCalled: lease.playCalled,
          playbackAdvanced: lease.playbackAdvanced,
          sourceGeneration: lease.sourceGeneration,
        });
      };

      const markPlaybackStarted = (status, trigger = "status") => {
        const snapshot = getPlaybackSnapshot(status);
        const { positionMillis } = snapshot;
        if (!lease.playCalled) return snapshot;

        if (lease.playbackBaselineMillis === null) {
          lease.playbackBaselineMillis =
            typeof lease.lastPositionMillis === "number"
              ? lease.lastPositionMillis
              : Math.round(startAtSeconds * 1000);
        }

        if (
          typeof positionMillis === "number" &&
          positionMillis > lease.playbackBaselineMillis + 20
        ) {
          if (!lease.playbackAdvanced) {
            lease.playbackAdvanced = true;
            this._traceStaticLeaseDebug("first_playback_progress", lease, {
              trigger,
              positionMillis,
              durationMillis: snapshot.durationMillis,
              playbackBaselineMillis: lease.playbackBaselineMillis,
              isPlaying: snapshot.isPlaying,
              didJustFinish: snapshot.didJustFinish,
              sourceGeneration: lease.sourceGeneration,
            });
          }
        }
        if (typeof positionMillis === "number") lease.lastPositionMillis = positionMillis;

        if (!this._isStaticLeaseCurrent(lease)) return snapshot;
        if (snapshot.isPlaying) {
          tracePlaybackEstablished(snapshot, trigger);
        } else if (lease.playbackAdvanced) {
          tracePlaybackEstablished(
            snapshot,
            snapshot.didJustFinish
              ? `${trigger}:finished_after_progress`
              : `${trigger}:progress`
          );
        }
        return snapshot;
      };

      const handleCompletionCandidate = (status, trigger) => {
        const snapshot = markPlaybackStarted(status, trigger);
        const completionSignal = snapshot.didJustFinish
          ? "didJustFinish"
          : snapshot.isNearEnd
            ? "near_end"
            : null;
        if (!completionSignal) return false;

        const canComplete =
          lease.playCalled &&
          lease.playbackStarted &&
          lease.playbackAdvanced;

        this._traceStaticLeaseDebug(
          canComplete ? "completion_accepted" : "completion_ignored",
          lease,
          {
            trigger,
            completionSignal,
            completionReason: canComplete ? "complete" : "insufficient_playback_evidence",
            positionMillis: snapshot.positionMillis,
            durationMillis: snapshot.durationMillis,
            isPlaying: snapshot.isPlaying,
            didJustFinish: snapshot.didJustFinish,
            isNearEnd: snapshot.isNearEnd,
            isLoaded: snapshot.isLoaded,
            playbackState: snapshot.playbackState,
            replaceCompleted: lease.replaceCompleted,
            seekCompleted: lease.seekCompleted,
            playCalled: lease.playCalled,
            playbackStarted: lease.playbackStarted,
            playbackAdvanced: lease.playbackAdvanced,
            playbackBaselineMillis: lease.playbackBaselineMillis,
            sourceGeneration: lease.sourceGeneration,
          }
        );

        if (!canComplete) return true;
        finish({ reason: "complete" });
        return true;
      };

      try {
        player = this._getReusableStaticPlayer();
        try {
          player._infiniteCoPilotPreviousStaticLeaseId =
            player._infiniteCoPilotCurrentStaticLeaseId || null;
          player._infiniteCoPilotPreviousStaticSourceGeneration =
            player._infiniteCoPilotCurrentStaticSourceGeneration || null;
          player._infiniteCoPilotCurrentStaticLeaseId = lease.id;
          player._infiniteCoPilotCurrentStaticSourceGeneration = lease.sourceGeneration;
        } catch (e) { }
        if (this.activeStaticLease && this.activeStaticLease !== lease) {
          this.activeStaticLease.finish?.({ interrupted: true, reason: "superseded" });
        }
        this.activeStaticLease = lease;
        if (owner === "callout") {
          this.currentCalloutPlayer = player;
          this.currentCalloutFinish = finish;
        } else {
          this.currentAnnouncementPlayer = player;
          this.currentAnnouncementFinish = finish;
        }

        this._traceStaticPlayer("speech.static_audio_lease_start", {
          ownerType: owner,
          leaseId: lease.id,
          generation: lease.generation,
          sourceGeneration: lease.sourceGeneration,
          retryCount,
          queueSize: this.speechQueue.length,
        });

        lease.subscription = player.addListener("playbackStatusUpdate", (status) => {
          if (!this._isStaticLeaseCurrent(lease)) return;
          const snapshot = markPlaybackStarted(status, "status_update");
          this._traceStaticLeaseDebug("status_update", lease, {
            originatingLeaseId: player?._infiniteCoPilotCurrentStaticLeaseId || null,
            previousLeaseId: player?._infiniteCoPilotPreviousStaticLeaseId || null,
            sourceGeneration: lease.sourceGeneration,
            originatingSourceGeneration:
              player?._infiniteCoPilotCurrentStaticSourceGeneration || null,
            previousSourceGeneration:
              player?._infiniteCoPilotPreviousStaticSourceGeneration || null,
            positionMillis: snapshot.positionMillis,
            durationMillis: snapshot.durationMillis,
            isPlaying: snapshot.isPlaying,
            didJustFinish: snapshot.didJustFinish,
            isNearEnd: snapshot.isNearEnd,
            isLoaded: snapshot.isLoaded,
            playbackState: snapshot.playbackState,
            replaceCompleted: lease.replaceCompleted,
            seekCompleted: lease.seekCompleted,
            playCalled: lease.playCalled,
            playbackStarted: lease.playbackStarted,
            playbackAdvanced: lease.playbackAdvanced,
            playbackBaselineMillis: lease.playbackBaselineMillis,
          });
          if (status?.didJustFinish) {
            this._traceStaticLeaseDebug("did_just_finish_received", lease, {
              currentLeaseId: lease.id,
              originatingLeaseId:
                lease.replaceCompleted && lease.playbackAdvanced
                  ? lease.id
                  : player?._infiniteCoPilotPreviousStaticLeaseId || null,
              activeLeaseId: this.activeStaticLease?.id || null,
              positionMillis: snapshot.positionMillis,
              durationMillis: snapshot.durationMillis,
              playbackAdvanced: lease.playbackAdvanced,
              playbackStarted: lease.playbackStarted,
              playCalled: lease.playCalled,
              replaceCompleted: lease.replaceCompleted,
              sourceGeneration: lease.sourceGeneration,
            });
          }
          if (
            status.error
          ) {
            finish({ reason: "status_error", nativeFailure: true });
          } else {
            handleCompletionCandidate(status, "status_update");
          }
        });
        this._traceStaticLeaseDebug("listener_attached", lease, {
          ownerType: owner,
        });

        lease.checkInterval = setInterval(() => {
          if (!this._isStaticLeaseCurrent(lease)) return;
          try {
            handleCompletionCandidate(null, "poll");
          } catch (e) {
            finish({ reason: "poll_error", nativeFailure: true });
          }
        }, 100);

        lease.startTimer = setTimeout(() => {
          if (!this._isStaticLeaseCurrent(lease) || lease.started) return;
          console.warn("[Speech] Static audio did not start; falling back to expo-speech.");
          finish({ reason: "start_timeout" });
        }, STATIC_AUDIO_START_TIMEOUT_MS);

        lease.safetyTimer = setTimeout(() => {
          if (!this._isStaticLeaseCurrent(lease)) return;
          finish({ reason: "safety_timeout" });
        }, maxWaitMs);

        Promise.resolve()
          .then(() => {
            if (!this._isStaticLeaseCurrent(lease)) return undefined;
            try {
              if (typeof player.pause === "function") player.pause();
            } catch (e) { }
            if (!this._isStaticLeaseCurrent(lease)) return undefined;
            playbackStage = "replace";
            if (typeof player.replace === "function") {
              lease.replaceStarted = true;
              this._traceStaticLeaseDebug("replace_called", lease, {
                sourceGeneration: lease.sourceGeneration,
              });
              const replaceResult = player.replace(audioAsset);
              this._traceStaticPlayer("speech.static_audio_replace", {
                leaseId: lease.id,
                generation: lease.generation,
                sourceGeneration: lease.sourceGeneration,
                retryCount,
                success: true,
              });
              return replaceResult;
            }
            throw new Error("Reusable static player does not support replace()");
          })
          .then(() => {
            if (!this._isStaticLeaseCurrent(lease)) return undefined;
            lease.replaceCompleted = true;
            this._traceStaticLeaseDebug("replace_completed", lease, {
              sourceGeneration: lease.sourceGeneration,
            });
            player.volume = volume;
            if (startAtSeconds > 0 && typeof player.seekTo === "function") {
              playbackStage = "seek";
              lease.seekStarted = true;
              this._traceStaticLeaseDebug("seek_called", lease, {
                startAtSeconds,
                sourceGeneration: lease.sourceGeneration,
              });
              return player.seekTo(startAtSeconds, 0, 0);
            }
            return undefined;
          })
          .then(() => {
            if (!this._isStaticLeaseCurrent(lease)) return;
            if (lease.seekStarted) {
              lease.seekCompleted = true;
            }
            lease.playbackBaselineMillis = Math.round(startAtSeconds * 1000);
            this._traceStaticLeaseDebug("seek_completed", lease, {
              startAtSeconds,
              positionMillis: getPlaybackSnapshot().positionMillis,
              durationMillis: getPlaybackSnapshot().durationMillis,
              sourceGeneration: lease.sourceGeneration,
            });
            playbackStage = "play";
            this._beginSpeechAudio();
            lease.speechAudioBegun = true;
            lease.playCalled = true;
            this._traceStaticLeaseDebug("play_called", lease, {
              startAtSeconds,
              playbackBaselineMillis: lease.playbackBaselineMillis,
              sourceGeneration: lease.sourceGeneration,
            });
            player.play();
            markPlaybackStarted(null, "play_call");
            this._traceStaticPlayer("speech.static_audio_start", {
              ownerType: owner,
              leaseId: lease.id,
              generation: lease.generation,
              sourceGeneration: lease.sourceGeneration,
              retryCount,
              queueSize: this.speechQueue.length,
              playSuccess: true,
            });
            this._scheduleBackgroundMediaRefresh([0, 350]);
          })
          .catch((error) => {
            if (!this._isStaticLeaseCurrent(lease)) return;
            console.warn("[Speech] Static audio playback failed:", error?.message || error);
            this._traceStaticPlayer("speech.static_audio_error", {
              ownerType: owner,
              leaseId: lease.id,
              generation: lease.generation,
              sourceGeneration: lease.sourceGeneration,
              retryCount,
              stage: playbackStage,
              error: error?.message || String(error),
              playSuccess: false,
            });
            this._traceStaticLeaseDebug("lease_rejected", lease, {
              stage: playbackStage,
              error: error?.message || String(error),
              sourceGeneration: lease.sourceGeneration,
            });
            finish({ reason: "playback_error", nativeFailure: true });
          });
      } catch (e) {
        this._traceStaticLeaseDebug("lease_rejected", lease, {
          stage: playbackStage,
          error: e?.message || String(e),
          sourceGeneration: lease.sourceGeneration,
        });
        finish({ reason: "setup_error", nativeFailure: true });
      }
    });
  }

  async init() {
    // Load saved voice preference and volumes
    try {
      const pref = await AsyncStorage.getItem("voicePreference");
      if (pref) this.voicePreference = pref;

      const storedRadioMicEffect = await AsyncStorage.getItem("radioMicEffectEnabled");
      if (storedRadioMicEffect !== null) {
        this.radioMicEffectEnabled = storedRadioMicEffect === "true";
      }

      const storedVolumes = await AsyncStorage.getItem("appVolumes");
      if (storedVolumes) {
        const parsed = JSON.parse(storedVolumes);
        this.masterVolume = parsed.masterVolume ?? 1.0;
        this.coPilotVolume = parsed.coPilotVolume ?? 1.0;
        this.boardingMusicVolume = parsed.boardingMusicVolume ?? 1.0;
        this.safetyBriefingVolume = parsed.safetyBriefingVolume ?? 1.0;
        this.passengerNoisesVolume = parsed.passengerNoisesVolume ?? 0.5;
        this.passengerNoisesEnabled = parsed.passengerNoisesEnabled ?? true;
        this.chimeEnabled = parsed.chimeEnabled ?? true;
      }
    } catch (e) { }

    // Configure audio session for background playback
    // This allows TTS and audio to continue when the user switches to the game.
    await this._configureAudioSession();

    // Fetch available system voices
    try {
      this.availableVoices = await Speech.getAvailableVoicesAsync();
    } catch (e) { }

    // Preload chime for instant zero-latency playback
    try {
      this.chimePlayer = createAudioPlayer(CHIME_AUDIO_ASSET, EFFECT_AUDIO_PLAYER_OPTIONS);
    } catch (e) { }

    // Keep an audio session open on platforms that still use audio as the
    // background anchor. Android runtime lifetime is owned by the foreground service.
    try {
      await this._ensureBackgroundAnchor({ force: true });
      this._scheduleBackgroundMediaRefresh([250, 1000, 2500]);
    } catch (e) {
      console.log("[Speech] Background media anchor failed:", e?.message || e);
    }

    // Preload all static audio files to completely eliminate the slight playback gap
    try {
      for (const entry of Object.values(staticAudioMap)) {
        if (entry.female) preload(entry.female).catch(() => { });
        if (entry.male) preload(entry.male).catch(() => { });
        if (entry.femaleRadio) preload(entry.femaleRadio).catch(() => { });
        if (entry.maleRadio) preload(entry.maleRadio).catch(() => { });
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
    this._ensureBackgroundAnchor().catch(() => { });
    this._updateBackgroundMediaMetadata();
    this._scheduleBackgroundMediaRefresh([150, 750]);
  }

  handleAppStateChange(state) {
    const isBackgrounded = state === "background" || state === "inactive";
    this._ensureBackgroundAnchor({ force: isBackgrounded }).catch(() => { });
    this._scheduleBackgroundMediaRefresh(isBackgrounded ? [0, 500, 2000] : [0, 250]);
  }

  async _configureAudioSession() {
    if (this._audioConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,          // Play even when iPhone is on silent
        shouldPlayInBackground: true,     // Keep audio session alive in background
        // interruptionMode: "doNotMix",     // Required by Expo v57 for lock-screen controls
        interruptionMode: "mixWithOthers",
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
        try { this.boardingMusic.pause(); } catch (e) { }
      }
      if (this.boardingAnnouncePlayer) {
        try { this.boardingAnnouncePlayer.pause(); } catch (e) { }
      }
      this._stopSpeechPlayback({ clearQueues: true });
      this.isProcessingQueue = false;
      this.isProcessingCabinQueue = false;
    } else {
      if (this.boardingMusic) {
        try {
          this.boardingMusic.play();
          this._scheduleBackgroundMediaRefresh([0, 500]);
        } catch (e) { }
      }
      if (this.boardingAnnouncePlayer) {
        try {
          this.boardingAnnouncePlayer.play();
          this._scheduleBackgroundMediaRefresh([0, 500]);
        } catch (e) { }
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

  async setRadioMicEffectEnabled(enabled) {
    this.radioMicEffectEnabled = Boolean(enabled);
    try {
      await AsyncStorage.setItem("radioMicEffectEnabled", String(this.radioMicEffectEnabled));
    } catch (e) {
      console.log("[Speech] Error saving radio mic effect setting:", e);
    }
  }

  async toggleRadioMicEffect() {
    await this.setRadioMicEffectEnabled(!this.radioMicEffectEnabled);
    return this.radioMicEffectEnabled;
  }

  async setVolumes(volumes) {
    this.masterVolume = volumes.masterVolume ?? this.masterVolume;
    this.coPilotVolume = volumes.coPilotVolume ?? this.coPilotVolume;
    this.boardingMusicVolume = volumes.boardingMusicVolume ?? this.boardingMusicVolume;
    this.safetyBriefingVolume = volumes.safetyBriefingVolume ?? this.safetyBriefingVolume;
    this.passengerNoisesVolume = volumes.passengerNoisesVolume ?? this.passengerNoisesVolume;
    this.passengerNoisesEnabled = volumes.passengerNoisesEnabled ?? this.passengerNoisesEnabled;
    this.chimeEnabled = volumes.chimeEnabled ?? this.chimeEnabled;

    try {
      await AsyncStorage.setItem("appVolumes", JSON.stringify({
        masterVolume: this.masterVolume,
        coPilotVolume: this.coPilotVolume,
        boardingMusicVolume: this.boardingMusicVolume,
        safetyBriefingVolume: this.safetyBriefingVolume,
        passengerNoisesVolume: this.passengerNoisesVolume,
        passengerNoisesEnabled: this.passengerNoisesEnabled,
        chimeEnabled: this.chimeEnabled,
      }));
    } catch (e) {
      console.log("[Speech] Error saving volumes:", e);
    }

    // Apply live volume updates to any currently-playing players
    if (this.boardingMusic && !this._boardingMusicFadeTimer) {
      this.boardingMusic.volume = this.masterVolume * this.boardingMusicVolume;
    }
    if (this.passengerNoisePlayer && !this._passengerNoiseFadeTimer) {
      this.passengerNoisePlayer.volume = this.masterVolume * this.passengerNoisesVolume;
      if (!this.passengerNoisesEnabled) {
        this.stopPassengerNoises({ fade: true });
      }
    }
    if (this.boardingAnnouncePlayer) {
      this.boardingAnnouncePlayer.volume = this.masterVolume * this.safetyBriefingVolume;
    }
    if (this.chimePlayer) {
      this.chimePlayer.volume = this.masterVolume;
    }
    if (this.currentAnnouncementPlayer) {
      this.currentAnnouncementPlayer.volume = this.masterVolume * (this.currentAnnouncementTone === "briefing" ? this.safetyBriefingVolume : this.coPilotVolume);
    }
    if (this.currentCalloutPlayer) {
      this.currentCalloutPlayer.volume = this.masterVolume * this.coPilotVolume;
    }
  }

  formatText(text, tone) {
    if (tone === "briefing") {
      return text.replace(/,(?!\d)\s*/g, ", ").replace(/\s+/g, " ").trim();
    }
    if (tone === "callout") {
      return text
        .replace(/,(?!\d)\s*/g, ". ")
        .replace(/\b(Gear up|Flaps up|Landing gear up)\b/ig, "$1.")
        .replace(/\.\.+/g, ".")
        .trim();
    }
    if (tone === "caution") {
      return text.replace(/,(?!\d)\s*/g, ". ").replace(/\s+/g, " ").trim();
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

  async _speakOnChannel(text, options = {}, channel = "cockpit") {
    options = normalizeSpeechOptions(options);
    const tone = options.tone || "default";
    const now = Date.now();
    const spokenText = this.formatText(text, tone);

    // De-duplicate rapid identical announcements
    if (!options.bypassDedupe && spokenText === this.lastSpokenText && now - this.lastSpokenAt < 900) return;

    this.lastSpokenText = spokenText;
    this.lastSpokenAt = now;

    if (!this.voiceEnabled) return;

    const profile = this.getVoiceProfile(tone);
    options = this._markLoggedOptions(spokenText, options);

    if (tone === "callout" && staticAudioMap[spokenText] && !options.forceQueue) {
      this._enqueueCallout({
        spokenText,
        options,
        profile,
      });
      return;
    }

    this._enqueueSpeech({ spokenText, options, profile }, channel);
    if (typeof options.afterSpeech === "function") {
      this._enqueueAction(options.afterSpeech, {
        priority: options.priority,
        actionTimeoutMs: options.afterSpeechTimeoutMs,
        detached: options.afterSpeechDetached,
      }, channel);
      return;
    }
    this._scheduleQueues();
  }

  async speak(text, options = {}) {
    return this._speakOnChannel(text, options, "cockpit");
  }

  async speakCabin(text, options = {}) {
    return this._speakOnChannel(text, { ...options, channel: "cabin" }, "cabin");
  }

  async speakAndWait(text, options = {}) {
    return new Promise((resolve) => {
      if (!this.voiceEnabled) {
        resolve(false);
        return;
      }
      this._speakOnChannel(text, {
        ...options,
        bypassDedupe: true,
        afterSpeech: () => resolve(true),
        afterSpeechTimeoutMs: options.afterSpeechTimeoutMs ?? 8000,
      }, options.channel === "cabin" ? "cabin" : "cockpit");
    });
  }

  async processQueue() {
    return this._scheduleQueues();
  }

  async processCabinQueue() {
    return this._scheduleQueues();
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
  async speakPolly(text, voiceId, profile, { fallback } = {}) {
    const fallbackToSpeech = fallback || (() => this._speakExpofallback(text, profile));
    if (!POLLY_BACKEND_URL) {
      // No backend configured — fall back immediately
      console.log("[Polly] No backend URL configured, using expo-speech fallback.");
      return fallbackToSpeech();
    }

    const cacheKey = `${voiceId}|${text}`;

    // ── Cache hit: skip network entirely ──────────────────────────────────────
    if (this.pollyCache.has(cacheKey)) {
      console.log("[Polly] Cache hit, playing from memory.");
      const dataUri = this.pollyCache.get(cacheKey);
      const started = await this._playPollyAudio(dataUri, profile);
      return started ? undefined : fallbackToSpeech();
    }

    // ── Fetch from backend with 3-second timeout ───────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(`${POLLY_BACKEND_URL}/api/tts`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "User-Agent": "InfiniteCoPilotApp/1.0"
        },
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

      const started = await this._playPollyAudio(dataUri, profile);
      return started ? undefined : fallbackToSpeech();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.warn("[Polly] Request timed out (>3s), falling back to expo-speech.");
      } else {
        console.warn("[Polly] Request failed:", err.message, "— falling back to expo-speech.");
      }
      return fallbackToSpeech();
    }
  }

  /**
   * Play a base64 data URI as audio using expo-audio's createAudioPlayer.
   * @private
   */
  async _playPollyAudio(dataUri, profile) {
    try {
      await this._ensureBackgroundAnchor();
    } catch (e) { }

    return new Promise((resolve) => {
      let player;
      let cleanup;
      let checkInterval;
      let safetyTimer;
      let startTimer;
      let resolved = false;
      let hasStartedPlayback = false;

      const finish = ({ interrupted = false } = {}) => {
        if (resolved) return;
        resolved = true;
        if (cleanup) {
          try { cleanup.remove(); } catch (_) { }
        }
        if (checkInterval) clearInterval(checkInterval);
        if (safetyTimer) clearTimeout(safetyTimer);
        if (startTimer) clearTimeout(startTimer);
        if (this.pollyPlayer === player) {
          this.pollyPlayer = null;
        }
        if (this.currentAnnouncementPlayer === player) {
          this.currentAnnouncementPlayer = null;
        }
        if (this.currentAnnouncementFinish === finish) {
          this.currentAnnouncementFinish = null;
        }
        this._disposePlayer(player, { pause: true });
        this._endSpeechAudio();
        this._recoverBackgroundAudioSession();
        runtimeTrace("speech.polly_audio_finish", {
          source: "expo-audio",
          owner: "SpeechManager",
          interrupted,
          started: hasStartedPlayback,
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        resolve(interrupted || hasStartedPlayback);
      };

      const markPlaybackStarted = (status) => {
        if (hasStartedPlayback) return;
        if (
          status?.playing ||
          status?.didJustFinish ||
          status?.currentTime > 0 ||
          player?.playing ||
          player?.currentTime > 0
        ) {
          hasStartedPlayback = true;
        }
      };

      try {
        // Release any previous Polly player
        this._disposePlayer(this.pollyPlayer);
        this.pollyPlayer = null;

        player = createAudioPlayer({ uri: dataUri }, EFFECT_AUDIO_PLAYER_OPTIONS);
        player.volume = profile.volume * this.masterVolume * (this.currentAnnouncementTone === "briefing" ? this.safetyBriefingVolume : this.coPilotVolume);
        this.pollyPlayer = player;
        this.currentAnnouncementPlayer = player;
        this.currentAnnouncementFinish = finish;

        cleanup = player.addListener("playbackStatusUpdate", (status) => {
          markPlaybackStarted(status);
          if (
            status.error ||
            status.didJustFinish ||
            (status.currentTime > 0 &&
              status.duration > 0 &&
              status.currentTime >= status.duration - 0.1)
          ) {
            finish();
          }
        });

        checkInterval = setInterval(() => {
          try {
            markPlaybackStarted();
            if (player.duration > 0 && player.currentTime >= player.duration - 0.1) {
              finish();
            }
          } catch (e) {
            finish();
          }
        }, 250);

        startTimer = setTimeout(() => {
          if (hasStartedPlayback) return;
          console.warn("[Polly] Audio did not start; falling back to expo-speech.");
          finish();
        }, POLLY_AUDIO_START_TIMEOUT_MS);

        safetyTimer = setTimeout(finish, 60000);

        this._beginSpeechAudio();
        player.play();
        markPlaybackStarted();
        runtimeTrace("speech.polly_audio_start", {
          source: "expo-audio",
          owner: "SpeechManager",
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        this._scheduleBackgroundMediaRefresh([0, 350, 1200]);
      } catch (err) {
        console.warn("[Polly] Audio playback failed:", err.message);
        finish();
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
    const channel = options.channel === "cabin" ? "cabin" : "cockpit";
    const now = Date.now();
    const spokenText = this.formatText(text, tone);

    // De-duplicate rapid identical announcements
    if (spokenText === this.lastSpokenText && now - this.lastSpokenAt < 900) return;
    this.lastSpokenText = spokenText;
    this.lastSpokenAt = now;

    if (!this.voiceEnabled) return;

    const profile = this.getVoiceProfile(tone);
    options = this._markLoggedOptions(spokenText, options);

    // Use polly-aware queue entry
    this._enqueueSpeech({ spokenText, options: { ...options, _pollyVoiceId: voiceId }, profile }, channel);
    if (typeof options.afterSpeech === "function") {
      this._enqueueAction(options.afterSpeech, {
        priority: options.priority,
        actionTimeoutMs: options.afterSpeechTimeoutMs,
        detached: options.afterSpeechDetached,
      }, channel);
      return;
    }
    this._scheduleQueues();
  }

  async playChime() {
    await this._playChimeNow();
  }

  async playPTUBurst(durationMs = 8500) {
    if (this.ptuPlaying) return;
    this.ptuPlaying = true;
    try {
      await this._ensureBackgroundAnchor();
    } catch (e) {
      console.log("[Speech] PTU background anchor failed:", e);
    }
    
    try {
      const player = await createAudioPlayer(PTU_BARK_ASSET, EFFECT_AUDIO_PLAYER_OPTIONS);
      player.volume = this.masterVolume;
      player.play();
      
      const waitTime = Math.min(durationMs, 55000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this._disposePlayer(player, { pause: true });
    } catch (err) {
      console.warn("Failed to play PTU burst", err);
    } finally {
      this.ptuPlaying = false;
    }
  }

  async playBoardingAnnouncement(livery, { onFinish } = {}) {
    if (this.boardingAnnounceFinish) {
      await new Promise((resolve) => this._enqueueAction(resolve));
      return;
    }
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
      if (lower.includes("american")) return "announcements/american-airlines.mp3";
      if (lower.includes("british airways")) return "announcements/british-airways.mp3";
      if (lower.includes("caribbean")) return "announcements/caribbean-airlines.mp3";
      if (lower.includes("delta")) return "announcements/delta.mp3";
      if (lower.includes("egyptair")) return "announcements/egyptair.mp3";
      if (lower.includes("emirates")) return "announcements/emirates.mp3";
      if (lower.includes("finnair")) return "announcements/finnair.mp3";
      if (lower.includes("garuda indonesia")) return "announcements/garuda-indonesia.mp3";
      if (lower.includes("indigo")) return "announcements/indigo.mp3";
      if (lower.includes("japan airlines") || lower.includes("jal")) return "announcements/japan-airlines.mp3";
      if (lower.includes("lot") && !lower.includes("aeroflot")) return "announcements/lot.mp3";
      if (lower.includes("lufthansa")) return "announcements/lufthansa.mp3";
      if (lower.includes("malaysia")) return "announcements/malaysia-airlines.mp3";
      if (lower.includes("qatar")) return "announcements/qatar.mp3";
      if (lower.includes("singapore")) return "announcements/singapore-airlines.mp3";
      if (lower.includes("swiss")) return "announcements/swiss.mp3";
      if (lower.includes("thai")) return "announcements/thai-airways.mp3";
      if (lower.includes("turkish")) return "announcements/turkish-airlines.mp3";
      if (lower.includes("united")) return "announcements/united-airlines.mp3";
      if (lower.includes("vietnam")) return "announcements/vietnam-airlines.mp3";
      return "announcements/fallback.mp3";
    };

    return new Promise(async (resolve) => {
      let cleanup = null;
      let checkInterval = null;
      let startTimer = null;
      let watchdogTimer = null;
      let finished = false;
      let hasStartedPlayback = false;
      let playbackProgressed = false;
      let lastPositionMillis = null;
      let lastProgressAt = 0;
      let durationMillis = null;
      let player = null;

      const statusTimeMillis = (status, key) => {
        const value = status?.[key];
        if (typeof value === "number") return value;
        if (key === "positionMillis" && typeof status?.currentTime === "number") {
          return Math.round(status.currentTime * 1000);
        }
        if (key === "durationMillis" && typeof status?.duration === "number") {
          return Math.round(status.duration * 1000);
        }
        return null;
      };

      const snapshotPlayback = (status = null) => {
        const now = Date.now();
        const positionMillis =
          statusTimeMillis(status, "positionMillis") ??
          (typeof player?.currentTime === "number"
            ? Math.round(player.currentTime * 1000)
            : null);
        const nextDurationMillis = statusTimeMillis(status, "durationMillis");
        if (typeof nextDurationMillis === "number" && nextDurationMillis > 0) {
          durationMillis = nextDurationMillis;
        }

        if (
          status?.playing ||
          status?.didJustFinish ||
          (typeof positionMillis === "number" && positionMillis > 0) ||
          player?.playing
        ) {
          hasStartedPlayback = true;
        }

        if (typeof positionMillis === "number") {
          if (
            lastPositionMillis === null ||
            positionMillis > lastPositionMillis + 20
          ) {
            if (lastPositionMillis !== null) playbackProgressed = true;
            lastProgressAt = now;
          }
          lastPositionMillis = positionMillis;
        }

        return {
          positionMillis,
          durationMillis,
          isPlaying: Boolean(status?.playing || player?.playing),
        };
      };

      const buildResult = ({ reason, completed = false, interrupted = false, error = null } = {}) => ({
        reason,
        completed,
        interrupted,
        started: hasStartedPlayback,
        playbackProgressed,
        positionMillis: lastPositionMillis,
        durationMillis,
        error: error ? error?.message || String(error) : undefined,
      });

      const traceWatchdog = (reason, payload = {}) => {
        runtimeTrace("speech.boarding_announcement_watchdog", {
          source: "expo-audio",
          owner: "SpeechManager",
          reason,
          started: hasStartedPlayback,
          playbackProgressed,
          positionMillis: lastPositionMillis,
          durationMillis,
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
          ...payload,
        }, { throttleMs: 0 });
      };

      const scheduleWatchdog = () => {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
          if (finished) return;
          const snapshot = snapshotPlayback();
          const now = Date.now();
          const progressAgeMs = lastProgressAt ? now - lastProgressAt : Infinity;
          const hasRecentProgress = progressAgeMs < BOARDING_ANNOUNCEMENT_MAX_WAIT_MS;
          const stillPlaying = snapshot.isPlaying;

          if (hasStartedPlayback && hasRecentProgress) {
            traceWatchdog("max_wait_timeout_progressing", {
              progressAgeMs,
              isPlaying: stillPlaying,
            });
            scheduleWatchdog();
            return;
          }

          if (!hasStartedPlayback) {
            traceWatchdog("max_wait_timeout_not_started");
            finishCallback({ reason: "start_timeout", completed: false });
            return;
          }

          traceWatchdog("stalled", {
            progressAgeMs,
            isPlaying: stillPlaying,
          });
          finishCallback({ reason: "stalled", completed: false });
        }, BOARDING_ANNOUNCEMENT_MAX_WAIT_MS);
      };

      const finishCallback = ({
        reason = "unknown",
        completed = false,
        interrupted = false,
        error = null,
      } = {}) => {
        if (finished) return;
        finished = true;
        const result = buildResult({ reason, completed, interrupted, error });
        if (cleanup) {
          try { cleanup.remove(); } catch (e) { }
          cleanup = null;
        }
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        if (startTimer) clearTimeout(startTimer);
        if (watchdogTimer) clearTimeout(watchdogTimer);
        if (this.boardingAnnouncePlayer === player) {
          this.boardingAnnouncePlayer = null;
        }
        if (this.boardingAnnounceFinish === finishCallback) {
          this.boardingAnnounceFinish = null;
        }

        if (completed) {
          setTimeout(() => {
            this._disposePlayer(player, { pause: false });
          }, 2000);
        } else {
          this._disposePlayer(player, { pause: true });
        }
        this._endSpeechAudio();
        this._recoverBackgroundAudioSession();
        if (interrupted || this._boardingAnnounceRequestId === playRequestId) {
          this._boardingAnnounceRequestId = null;
          this._isFetchingBoardingAnnounce = false;
          this._fetchingBoardingAnnounceFor = "";
        }
        if (completed && onFinish) onFinish(result);
        runtimeTrace("speech.boarding_announcement_finish", {
          source: "expo-audio",
          owner: "SpeechManager",
          reason,
          completed,
          interrupted,
          started: hasStartedPlayback,
          playbackProgressed,
          positionMillis: lastPositionMillis,
          durationMillis,
          error: result.error,
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        resolve(result);
      };

      try {
        const remoteFileName = getFileName(livery);
        const audioUri = await getCachedAudioUri(remoteFileName, "announcements/fallback.mp3");

        // If we were stopped or disconnected while downloading, abort
        if (this._boardingAnnounceRequestId !== playRequestId) {
          finishCallback({ reason: "interrupted", interrupted: true });
          return;
        }

        if (!audioUri) {
          console.warn("[Speech] Could not get cached audio for boarding announcement.");
          finishCallback({ reason: "error", completed: false });
          return;
        }

        if (this.boardingAnnouncePlayer) {
          this._disposePlayer(this.boardingAnnouncePlayer);
        }
        player = createAudioPlayer(audioUri, STATIC_AUDIO_PLAYER_OPTIONS);
        player.volume = this.masterVolume * this.safetyBriefingVolume;
        this.boardingAnnouncePlayer = player;
        this.boardingAnnounceFinish = finishCallback;

        cleanup = player.addListener("playbackStatusUpdate", (status) => {
          snapshotPlayback(status);
          if (status.didJustFinish) {
            finishCallback({ reason: "native_finished", completed: true });
          } else if (status.error) {
            finishCallback({ reason: "error", completed: false, error: status.error });
          }
        });

        checkInterval = setInterval(() => {
          try {
            snapshotPlayback();
            if (!player) {
              finishCallback({ reason: "error", completed: false });
              return;
            }
          } catch (e) {
            finishCallback({ reason: "error", completed: false, error: e });
          }
        }, 100);

        startTimer = setTimeout(() => {
          if (hasStartedPlayback) return;
          console.warn("[Speech] Boarding announcement did not start; continuing queue.");
          finishCallback({ reason: "start_timeout", completed: false });
        }, BOARDING_ANNOUNCEMENT_START_TIMEOUT_MS);

        scheduleWatchdog();

        if (this.voiceEnabled) {
          await this._ensureBackgroundAnchor();
          this._beginSpeechAudio();
          player.play();
          snapshotPlayback();
          runtimeTrace("speech.boarding_announcement_start", {
            source: "expo-audio",
            owner: "SpeechManager",
            livery,
            queueSize: this.speechQueue.length,
            playerCount: this._getActivePlayerCount(),
          }, { throttleMs: 0 });
          this._scheduleBackgroundMediaRefresh([0, 500, 1500]);
        } else {
          finishCallback({ reason: "interrupted", interrupted: true }); // if voice disabled, finish immediately
        }
      } catch (e) {
        console.log("[Speech] Boarding announcement failed:", e);
        finishCallback({ reason: "error", completed: false, error: e });
      }
    });
  }

  stopBoardingAnnouncement() {
    this._boardingAnnounceRequestId = null;
    if (this.boardingAnnounceFinish) {
      this.boardingAnnounceFinish({ reason: "interrupted", interrupted: true });
      return;
    }
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
    return "music/fallback.mp3";
  }

  _getBoardingMusicFallbackFileName(remoteFileName) {
    return remoteFileName === "music/american-airlines.mp3"
      ? null
      : "music/american-airlines.mp3";
  }

  async _getCachedBoardingMusicUri(livery) {
    const remoteFileName = this._getBoardingMusicFileName(livery);
    const cachedUri = this._boardingMusicCachedUris.get(remoteFileName);
    if (isLocalCachedAudioUri(cachedUri)) return cachedUri;

    const localUri = await getExistingCachedAudioUri(remoteFileName);
    if (localUri) {
      this._boardingMusicCachedUris.set(remoteFileName, localUri);
      return localUri;
    }

    return null;
  }

  ensureBoardingMusicCached(livery, options = {}) {
    if (!livery) return Promise.resolve(null);

    const remoteFileName = this._getBoardingMusicFileName(livery);
    const cachedUri = this._boardingMusicCachedUris.get(remoteFileName);
    if (isLocalCachedAudioUri(cachedUri)) return Promise.resolve(cachedUri);
    if (this._boardingMusicPrefetches.has(remoteFileName)) {
      return this._boardingMusicPrefetches.get(remoteFileName);
    }

    const request = getCachedAudioUri(
      remoteFileName,
      this._getBoardingMusicFallbackFileName(remoteFileName),
      { allowRemoteFallback: false }
    )
      .then((uri) => {
        if (!isLocalCachedAudioUri(uri)) return null;
        this._boardingMusicCachedUris.set(remoteFileName, uri);
        runtimeTrace("speech.boarding_music_cached", {
          source: "audio-cache",
          owner: "SpeechManager",
          livery,
          remoteFileName,
          reason: options.reason || "unspecified",
        }, { throttleMs: 0 });
        return uri;
      })
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
    return this.ensureBoardingMusicCached(livery, { reason: "preload" });
  }

  async playBoardingMusic(livery, options = {}) {
    const fade = options.fade !== false; // Default true
    const durationMs = options.durationMs || BOARDING_MUSIC_FADE_MS;
    const isStartCurrent = typeof options.isStartCurrent === "function"
      ? options.isStartCurrent
      : () => true;

    if (!isStartCurrent()) return false;
    if (this.boardingMusic) return true;
    if (this._isFetchingBoardingMusic && this._fetchingBoardingMusicFor === livery) return false;

    this._isFetchingBoardingMusic = true;
    this._fetchingBoardingMusicFor = livery;

    this._requestCounter = (this._requestCounter || 0) + 1;
    const playRequestId = this._requestCounter;
    this._boardingMusicRequestId = playRequestId;

    try {
      const audioUri = await this._getCachedBoardingMusicUri(livery);

      // If stopped or disconnected while checking the local cache, abort.
      if (this._boardingMusicRequestId !== playRequestId || !isStartCurrent()) {
        this._isFetchingBoardingMusic = false;
        if (this._fetchingBoardingMusicFor === livery) {
          this._fetchingBoardingMusicFor = "";
        }
        return false;
      }

      if (!isLocalCachedAudioUri(audioUri)) {
        console.warn("[Speech] Boarding music is not cached locally yet; skipping immediate playback.");
        return false;
      }

      if (this.boardingMusic) {
        this._disposePlayer(this.boardingMusic);
      }
      if (this._boardingMusicFadeTimer) {
        if (this._boardingMusicFadeFinish) {
          this._boardingMusicFadeFinish();
        } else {
          clearInterval(this._boardingMusicFadeTimer);
          this._boardingMusicFadeTimer = null;
        }
      }
      const player = createAudioPlayer(audioUri, EFFECT_AUDIO_PLAYER_OPTIONS);
      this.boardingMusic = player;
      player.loop = true;
      const targetVolume = this.masterVolume * this.boardingMusicVolume;
      player.volume = fade ? 0 : targetVolume;

      if (this.voiceEnabled) {
        await this._ensureBackgroundAnchor();
        if (
          this._boardingMusicRequestId !== playRequestId ||
          this.boardingMusic !== player ||
          !isStartCurrent()
        ) {
          if (this.boardingMusic === player) this.boardingMusic = null;
          this._disposePlayer(player);
          this._scheduleBackgroundMediaRefresh();
          return false;
        }
        player.play();
        runtimeTrace("speech.boarding_music_start", {
          source: "expo-audio",
          owner: "SpeechManager",
          livery,
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        this._scheduleBackgroundMediaRefresh([0, 500, 1500]);
      }

      if (fade && this.voiceEnabled) {
        const steps = 14;
        const intervalMs = Math.max(50, Math.round(durationMs / steps));
        let step = 0;
        this._boardingMusicFadeTimer = setInterval(() => {
          step += 1;
          try {
            if (
              this._boardingMusicRequestId !== playRequestId ||
              this.boardingMusic !== player ||
              !isStartCurrent()
            ) {
              if (this._boardingMusicFadeTimer) clearInterval(this._boardingMusicFadeTimer);
              this._boardingMusicFadeTimer = null;
              return;
            }
            if (this.boardingMusic) {
              player.volume = Math.min(targetVolume, targetVolume * (step / steps));
            }
          } catch (e) {
            if (this._boardingMusicFadeTimer) clearInterval(this._boardingMusicFadeTimer);
            return;
          }
          if (step >= steps) {
            if (this._boardingMusicFadeTimer) clearInterval(this._boardingMusicFadeTimer);
            this._boardingMusicFadeTimer = null;
          }
        }, intervalMs);
      }
      return Boolean(this.boardingMusic);
    } catch (e) {
      console.log("[Speech] Boarding music failed:", e);
      return false;
    } finally {
      if (this._boardingMusicRequestId === playRequestId) {
        this._isFetchingBoardingMusic = false;
        this._fetchingBoardingMusicFor = "";
      }
    }
  }

  stopBoardingMusic({ fade = false, durationMs = BOARDING_MUSIC_FADE_MS } = {}) {
    this._boardingMusicRequestId = null;
    this._isFetchingBoardingMusic = false;
    this._fetchingBoardingMusicFor = "";
    const player = this.boardingMusic;
    if (!player) return Promise.resolve(false);

    if (this._boardingMusicFadeTimer) {
      if (this._boardingMusicFadeFinish) {
        this._boardingMusicFadeFinish();
      } else {
        clearInterval(this._boardingMusicFadeTimer);
        this._boardingMusicFadeTimer = null;
      }
    }

    return new Promise((resolve) => {
      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        if (this._boardingMusicFadeTimer) {
          clearInterval(this._boardingMusicFadeTimer);
          this._boardingMusicFadeTimer = null;
        }
        if (this._boardingMusicFadeFinish === cleanup) {
          this._boardingMusicFadeFinish = null;
        }
        if (this.boardingMusic === player) {
          this.boardingMusic = null;
        }
        this._disposePlayer(player);
        this._scheduleBackgroundMediaRefresh();
        runtimeTrace("speech.boarding_music_stop", {
          source: "expo-audio",
          owner: "SpeechManager",
          fade,
          queueSize: this.speechQueue.length,
          playerCount: this._getActivePlayerCount(),
        }, { throttleMs: 0 });
        resolve(true);
      };

      if (fade && this.voiceEnabled) {
        const steps = 14;
        const intervalMs = Math.max(50, Math.round(durationMs / steps));
        const startVolume =
          typeof player.volume === "number"
            ? player.volume
            : this.masterVolume * this.boardingMusicVolume;
        let step = 0;
        this._boardingMusicFadeFinish = cleanup;

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
    });
  }

  async playPassengerNoises(options = {}) {
    if (!this.passengerNoisesEnabled) return false;
    if (this.passengerNoisePlayer) return true;

    const fade = options.fade !== false;
    const durationMs = options.durationMs || BOARDING_MUSIC_FADE_MS;

    try {
      if (this._passengerNoiseFadeTimer) {
        if (this._passengerNoiseFadeFinish) {
          this._passengerNoiseFadeFinish();
        } else {
          clearInterval(this._passengerNoiseFadeTimer);
          this._passengerNoiseFadeTimer = null;
        }
      }

      const player = createAudioPlayer(PASSENGER_NOISES_ASSET, EFFECT_AUDIO_PLAYER_OPTIONS);
      this.passengerNoisePlayer = player;
      player.loop = true;
      
      const targetVolume = this.masterVolume * this.passengerNoisesVolume;
      player.volume = fade ? 0 : targetVolume;

      if (this.voiceEnabled) {
        await this._ensureBackgroundAnchor();
        if (this.passengerNoisePlayer !== player) {
          this._disposePlayer(player);
          return false;
        }
        player.play();
        this._scheduleBackgroundMediaRefresh([0, 500]);
      }

      if (fade && this.voiceEnabled) {
        const steps = 14;
        const intervalMs = Math.max(50, Math.round(durationMs / steps));
        let step = 0;
        this._passengerNoiseFadeTimer = setInterval(() => {
          step += 1;
          try {
            if (this.passengerNoisePlayer !== player) {
              if (this._passengerNoiseFadeTimer) clearInterval(this._passengerNoiseFadeTimer);
              this._passengerNoiseFadeTimer = null;
              return;
            }
            player.volume = Math.min(targetVolume, targetVolume * (step / steps));
          } catch (e) {
            if (this._passengerNoiseFadeTimer) clearInterval(this._passengerNoiseFadeTimer);
            return;
          }
          if (step >= steps) {
            if (this._passengerNoiseFadeTimer) clearInterval(this._passengerNoiseFadeTimer);
            this._passengerNoiseFadeTimer = null;
          }
        }, intervalMs);
      }
      return true;
    } catch (e) {
      console.log("[Speech] Passenger noises failed:", e);
      return false;
    }
  }

  stopPassengerNoises({ fade = false, durationMs = BOARDING_MUSIC_FADE_MS } = {}) {
    const player = this.passengerNoisePlayer;
    if (!player) return Promise.resolve(false);

    if (this._passengerNoiseFadeTimer) {
      if (this._passengerNoiseFadeFinish) {
        this._passengerNoiseFadeFinish();
      } else {
        clearInterval(this._passengerNoiseFadeTimer);
        this._passengerNoiseFadeTimer = null;
      }
    }

    return new Promise((resolve) => {
      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        if (this._passengerNoiseFadeTimer) {
          clearInterval(this._passengerNoiseFadeTimer);
          this._passengerNoiseFadeTimer = null;
        }
        if (this._passengerNoiseFadeFinish === cleanup) {
          this._passengerNoiseFadeFinish = null;
        }
        if (this.passengerNoisePlayer === player) {
          this.passengerNoisePlayer = null;
        }
        this._disposePlayer(player);
        resolve(true);
      };

      if (fade && this.voiceEnabled) {
        const steps = 14;
        const intervalMs = Math.max(50, Math.round(durationMs / steps));
        const startVolume = typeof player.volume === "number" ? player.volume : this.masterVolume * this.passengerNoisesVolume;
        let step = 0;
        this._passengerNoiseFadeFinish = cleanup;

        this._passengerNoiseFadeTimer = setInterval(() => {
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
    });
  }

  stopAll() {
    this._stopSpeechPlayback({ clearQueues: true });
    this.isProcessingQueue = false;
    this.isProcessingCabinQueue = false;
    this.stopBoardingMusic({ fade: false });
    this.stopPassengerNoises({ fade: false });
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
    this._removeReusableStaticPlayer("stopAll");
  }
}

export const speechManager = new SpeechManager();
