/**
 * AnnouncementCoordinator.js
 *
 * Owns cross-category audio orchestration policy.
 *
 * FlightSession reports flight events here. SpeechManager remains the execution
 * engine for queues, players, leases, Expo Speech, Polly, music, and fades.
 */

import { speechManager } from "../utils/speech";
import { runtimeTrace } from "../utils/runtimeTrace";

const DEPARTURE_MUSIC_PHASES = new Set(["preflight", "boarding", "pushback", "taxi_out"]);
const ARRIVAL_MUSIC_PHASES = new Set(["taxi_in", "deboarding"]);
const COORDINATOR_VERBOSE_LOGS =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  (typeof process !== "undefined" &&
    process.env?.EXPO_PUBLIC_COORDINATOR_VERBOSE_LOGS === "true");
const DISCONNECT_NOTICE_SETTLE_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class AnnouncementCoordinator {
  constructor(engine = speechManager) {
    this.engine = engine;
    this._musicActionId = 0;
    this._longFormActionId = 0;
    this._safetyBriefingPromise = null;
    this._lastDecisionLogKey = "";
    this.resetFlightState();
  }

  resetFlightState() {
    this._musicActionId += 1;
    this._longFormActionId += 1;
    this._safetyBriefingPromise = null;
    this.state = {
      isConnected: false,
      lastTelemetry: null,
      departureWelcomeEnded: false,
      arrivalWelcomeEnded: false,
      safetyBriefingEnded: false,
      safetyBriefingStatus: "idle",
      boardingMusicStarted: false,
      boardingMusicStopped: false,
      boardingMusicStatus: "idle",
    };
  }

  getDiagnostics() {
    return {
      coordinator: { ...this.state, lastTelemetry: undefined },
      speech: this.engine.getDiagnostics?.(),
    };
  }

  _trace(event, payload = {}) {
    runtimeTrace(event, {
      owner: "AnnouncementCoordinator",
      source: "audio-orchestration",
      boardingMusicStatus: this.state.boardingMusicStatus,
      safetyBriefingStatus: this.state.safetyBriefingStatus,
      speech: this.engine.getDiagnostics?.(),
      ...payload,
    }, { throttleMs: 0 });
  }

  _logDecision(lines, dedupeKey = "") {
    if (!COORDINATOR_VERBOSE_LOGS) return;
    if (dedupeKey && this._lastDecisionLogKey === dedupeKey) return;
    this._lastDecisionLogKey = dedupeKey;
    console.log(`[Coordinator]\n${lines.join("\n")}`);
  }

  _formatLogReason(reason) {
    return String(reason || "unspecified")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  _boardingMusicStartDeniedReason() {
    if (
      this.state.safetyBriefingStatus === "starting" ||
      this.state.safetyBriefingStatus === "playing"
    ) {
      return "Safety Briefing Active";
    }
    if (this.state.boardingMusicStatus === "starting") return "Boarding Music Start In Progress";
    if (this.state.boardingMusicStarted) return "Boarding Music Already Active";
    if (this.state.boardingMusicStopped) return "Boarding Music Stopped By Policy";
    return "Boarding Music Not Admitted";
  }

  _logBoardingMusicStartDenied(requestReason, livery) {
    const deniedReason = this._boardingMusicStartDeniedReason();
    this._trace("announcementCoordinator.boarding_music_denied", {
      requestReason,
      deniedReason,
      livery,
    });
    this._logDecision([
      "Request: Boarding Music Start",
      "Decision: Denied",
      `Reason: ${deniedReason}`,
    ], `music-start-denied:${requestReason}:${deniedReason}:${livery || "none"}`);
  }

  _wrapPlaybackCallbacks(options = {}, category = "cockpit", text = "") {
    const originalStart = options._onPlaybackStart;
    const originalFinish = options._onPlaybackFinish;
    return {
      ...options,
      _coordinatorChannel: category,
      _onPlaybackStart: (...args) => {
        this._trace(`announcementCoordinator.${category}_announcement_started`, {
          text,
          tone: options.tone,
        });
        originalStart?.(...args);
      },
      _onPlaybackFinish: (...args) => {
        this._trace(`announcementCoordinator.${category}_announcement_completed`, {
          text,
          tone: options.tone,
        });
        originalFinish?.(...args);
      },
    };
  }

  _wrapAfterSpeech(options = {}, category = "speech") {
    if (typeof options.afterSpeech !== "function") return options;
    const originalAfterSpeech = options.afterSpeech;
    return {
      ...options,
      afterSpeech: async () => {
        this._trace("announcementCoordinator.after_speech_start", {
          category,
          tone: options.tone,
        });
        try {
          return await originalAfterSpeech();
        } finally {
          this._trace("announcementCoordinator.after_speech_finish", {
            category,
            tone: options.tone,
          });
        }
      },
    };
  }

  speak(text, options = {}) {
    const channel = options.channel === "cabin" ? "cabin" : "cockpit";
    this._trace(`announcementCoordinator.${channel}_announcement_admitted`, {
      text,
      tone: options.tone,
    });
    const wrappedOptions = this._wrapPlaybackCallbacks(
      this._wrapAfterSpeech(options, `${channel}_speech`),
      channel,
      text
    );
    return channel === "cabin"
      ? this.engine.speakCabin(text, wrappedOptions)
      : this.engine.speak(text, wrappedOptions);
  }

  speakWithPollyFallback(text, voiceId, options = {}) {
    const channel = options.channel === "cabin" ? "cabin" : "cockpit";
    this._trace(`announcementCoordinator.${channel}_announcement_admitted`, {
      text,
      tone: options.tone,
      pollyVoiceId: voiceId,
    });
    return this.engine.speakWithPollyFallback(
      text,
      voiceId,
      this._wrapPlaybackCallbacks(
        this._wrapAfterSpeech(options, `${channel}_polly_speech`),
        channel,
        text
      )
    );
  }

  setBackgroundSessionState(state) {
    return this.engine.setBackgroundSessionState(state);
  }

  handleAppStateChange(state) {
    return this.engine.handleAppStateChange(state);
  }

  whenReady() {
    return this.engine.whenReady();
  }

  setLogger(loggerFn) {
    return this.engine.setLogger(loggerFn);
  }

  get voicePreference() {
    return this.engine.voicePreference;
  }

  toggleVoice() {
    return this.engine.toggleVoice();
  }

  setVoicePreference(preference) {
    return this.engine.setVoicePreference(preference);
  }

  isBoardingMusicExpected() {
    return this.state.boardingMusicStarted && !this.state.boardingMusicStopped;
  }

  stopAll() {
    this.engine.stopAll();
    this.resetFlightState();
  }

  playSessionWelcome(text, options = {}) {
    const lastTelemetry = this.state.lastTelemetry;
    const isConnected = this.state.isConnected;
    this.stopAll();
    this.state.lastTelemetry = lastTelemetry;
    this.state.isConnected = isConnected;
    this._trace("announcementCoordinator.welcome_announcement_started", {
      text,
      tone: options.tone,
    });
    return this.speak(text, {
      ...options,
      channel: "cabin",
      _onPlaybackFinish: () => {
        this._trace("announcementCoordinator.welcome_announcement_completed", {
          text,
          tone: options.tone,
        });
      },
    });
  }

  onConnectionPollingStarted() {
    return this.stopBoardingMusic({
      markStopped: false,
      reason: "connection_started",
    });
  }

  async onClientDisconnected({ reason = "unknown" } = {}) {
    this.stopAll();
    await sleep(DISCONNECT_NOTICE_SETTLE_MS);
    this._trace("announcementCoordinator.client_disconnected_notice", {
      reason,
    });
    this._trace("announcementCoordinator.cockpit_announcement_admitted", {
      text: "Client disconnected.",
      tone: "notice",
      reason,
    });
    return this.engine.speakAndWait("Client disconnected.", {
      tone: "notice",
      priority: true,
      _coordinatorChannel: "cockpit",
      _onPlaybackStart: () => {
        this._trace("announcementCoordinator.cockpit_announcement_started", {
          text: "Client disconnected.",
          tone: "notice",
          reason,
        });
      },
      _onPlaybackFinish: () => {
        this._trace("announcementCoordinator.cockpit_announcement_completed", {
          text: "Client disconnected.",
          tone: "notice",
          reason,
        });
      },
    });
  }

  onConnectingFlightReset() {
    return this.stopBoardingMusic({
      fade: true,
      markStopped: false,
      reason: "connecting_flight_reset",
    });
  }

  async startBoardingMusic(livery, options = {}) {
    if (!livery) return false;

    if (
      this.state.safetyBriefingStatus === "starting" ||
      this.state.safetyBriefingStatus === "playing"
    ) {
      this._logBoardingMusicStartDenied(options.reason || "unspecified", livery);
      return false;
    }

    const actionId = ++this._musicActionId;
    const reason = options.reason || "unspecified";
    this._logDecision([
      "Request: Boarding Music Start",
      "Decision: Accepted",
      `Reason: ${this._formatLogReason(reason)}`,
    ], `music-start-accepted:${reason}:${livery}`);
    this.state.boardingMusicStarted = true;
    this.state.boardingMusicStopped = false;
    this.state.boardingMusicStatus = "starting";
    this._trace("announcementCoordinator.boarding_music_requested", {
      reason,
      livery,
    });

    try {
      const started = await this.engine.playBoardingMusic(livery, options);
      if (this._musicActionId !== actionId) {
        this._logDecision([
          "Boarding Music",
          "Cancelled",
          `Reason: Superseded During ${this._formatLogReason(reason)}`,
        ], `music-start-cancelled:${reason}:${livery}`);
        this._trace("announcementCoordinator.boarding_music_cancelled", {
          reason,
          livery,
        });
        return false;
      }

      const active = Boolean(started && this.engine.getDiagnostics?.().boardingMusicActive);
      this.state.boardingMusicStarted = active;
      this.state.boardingMusicStopped = false;
      this.state.boardingMusicStatus = active ? "playing" : "idle";
      this._logDecision([
        "Boarding Music",
        active ? "Started" : "Failed",
        `Reason: ${active ? this._formatLogReason(reason) : "Playback Did Not Become Active"}`,
      ], `music-start-${active ? "started" : "failed"}:${reason}:${livery}`);
      this._trace("announcementCoordinator.boarding_music_started", {
        reason,
        livery,
        active,
      });
      return active;
    } catch (error) {
      if (this._musicActionId === actionId) {
        this.state.boardingMusicStarted = false;
        this.state.boardingMusicStopped = false;
        this.state.boardingMusicStatus = "failed";
      }
      this._logDecision([
        "Boarding Music",
        "Failed",
        `Reason: ${error?.message || String(error)}`,
      ], `music-start-error:${reason}:${livery}`);
      this._trace("announcementCoordinator.boarding_music_start_failed", {
        reason,
        livery,
        error: error?.message || String(error),
      });
      return false;
    }
  }

  async stopBoardingMusic(options = {}) {
    const actionId = ++this._musicActionId;
    const reason = options.reason || "unspecified";
    const markStopped = options.markStopped !== false;
    if (markStopped) {
      this.state.boardingMusicStopped = true;
    }
    this.state.boardingMusicStatus = "stopping";
    this._logDecision([
      "Request: Boarding Music Stop",
      "Decision: Accepted",
      `Reason: ${this._formatLogReason(reason)}`,
    ], `music-stop-accepted:${reason}:${Boolean(options.fade)}`);
    this._trace("announcementCoordinator.boarding_music_stop_requested", {
      reason,
      fade: Boolean(options.fade),
      markStopped,
    });

    try {
      const stopped = await this.engine.stopBoardingMusic(options);
      if (this._musicActionId === actionId) {
        this.state.boardingMusicStarted = false;
        this.state.boardingMusicStatus = "idle";
        this._logDecision([
          "Boarding Music",
          stopped ? "Stopped" : "Stop Not Needed",
          `Reason: ${stopped ? this._formatLogReason(reason) : "No Active Boarding Music"}`,
        ], `music-stopped:${reason}:${Boolean(options.fade)}`);
      } else {
        this._logDecision([
          "Boarding Music",
          "Cancelled",
          `Reason: Superseded During ${this._formatLogReason(reason)}`,
        ], `music-stop-cancelled:${reason}:${Boolean(options.fade)}`);
        this._trace("announcementCoordinator.boarding_music_cancelled", {
          reason,
          fade: Boolean(options.fade),
          markStopped,
        });
      }
      this._trace("announcementCoordinator.boarding_music_stopped", {
        reason,
        fade: Boolean(options.fade),
        markStopped,
      });
      return true;
    } catch (error) {
      if (this._musicActionId === actionId) {
        this.state.boardingMusicStatus = "failed";
      }
      this._logDecision([
        "Boarding Music",
        "Failed",
        `Reason: ${error?.message || String(error)}`,
      ], `music-stop-error:${reason}`);
      this._trace("announcementCoordinator.boarding_music_stop_failed", {
        reason,
        error: error?.message || String(error),
      });
      return false;
    }
  }

  onDepartureWelcomeEnded() {
    this.state.departureWelcomeEnded = true;
    this.evaluateAmbientBoardingMusic({
      telemetry: this.state.lastTelemetry,
      isConnected: this.state.isConnected,
      reason: "departure_welcome_finished",
    });
  }

  onArrivalWelcomeEnded() {
    this.state.arrivalWelcomeEnded = true;
    this.evaluateAmbientBoardingMusic({
      telemetry: this.state.lastTelemetry,
      isConnected: this.state.isConnected,
      reason: "arrival_welcome_finished",
    });
  }

  async playSafetyBriefing(livery) {
    if (this._safetyBriefingPromise) return this._safetyBriefingPromise;

    const actionId = ++this._longFormActionId;
    this.state.safetyBriefingStatus = "starting";
    this.state.boardingMusicStopped = true;
    this._logDecision([
      "Safety Briefing",
      "Started",
    ], `safety-started:${livery}`);
    this._trace("announcementCoordinator.safety_briefing_started", {
      livery,
    });

    this._safetyBriefingPromise = this.stopBoardingMusic({
      fade: true,
      reason: "safety_briefing_start",
    }).then(() => {
      if (this._longFormActionId !== actionId) return false;
      this.state.safetyBriefingStatus = "playing";
      return this.engine.enqueueCabinAction(() => this.engine.playBoardingAnnouncement(livery, {
        onFinish: () => {
          if (this._longFormActionId === actionId) {
            this.state.safetyBriefingEnded = true;
          }
        },
      }), {
        actionTimeoutMs: false,
        reason: "safety_briefing",
        resources: ["boardingAnnouncePlayer"],
      });
    }).then((result) => {
      if (this._longFormActionId !== actionId) {
        this._logDecision([
          "Safety Briefing",
          "Cancelled",
          "Reason: Superseded",
        ], `safety-cancelled:${livery}`);
        this._trace("announcementCoordinator.safety_briefing_cancelled", {
          livery,
          result,
        });
        return result;
      }
      const completed = this.state.safetyBriefingEnded;
      this.state.safetyBriefingStatus = completed ? "completed" : "cancelled";
      this._logDecision([
        "Safety Briefing",
        completed ? "Completed" : "Cancelled",
      ], `safety-${completed ? "completed" : "cancelled"}:${livery}`);
      this._trace("announcementCoordinator.safety_briefing_completed", {
        livery,
        completed,
        result,
      });
      if (completed) {
        this.evaluateAmbientBoardingMusic({
          telemetry: this.state.lastTelemetry,
          isConnected: this.state.isConnected,
          reason: "safety_briefing_finished",
        });
      }
      return result;
    }).catch((error) => {
      if (this._longFormActionId !== actionId) {
        this._logDecision([
          "Safety Briefing",
          "Cancelled",
          `Reason: ${error?.message || String(error)}`,
        ], `safety-cancelled-error:${livery}`);
        this._trace("announcementCoordinator.safety_briefing_cancelled", {
          livery,
          error: error?.message || String(error),
        });
        return false;
      }
      this.state.safetyBriefingStatus = "failed";
      this._logDecision([
        "Safety Briefing",
        "Failed",
        `Reason: ${error?.message || String(error)}`,
      ], `safety-failed:${livery}`);
      this._trace("announcementCoordinator.safety_briefing_failed", {
        livery,
        error: error?.message || String(error),
      });
      return false;
    }).finally(() => {
      if (this._longFormActionId === actionId) {
        this._safetyBriefingPromise = null;
      }
    });

    return this._safetyBriefingPromise;
  }

  evaluateAmbientBoardingMusic({ telemetry, isConnected, reason = "telemetry" } = {}) {
    this.state.lastTelemetry = telemetry || null;
    this.state.isConnected = Boolean(isConnected);

    if (!telemetry?.name || !isConnected) return;

    const isDeparturePhase = DEPARTURE_MUSIC_PHASES.has(telemetry.phase);
    const isArrivalPhase = ARRIVAL_MUSIC_PHASES.has(telemetry.phase);

    if (telemetry.strobe === 1 || telemetry.phase === "takeoff") {
      if (this.isBoardingMusicExpected()) {
        this.stopBoardingMusic({
          fade: true,
          reason: telemetry.strobe === 1 ? "strobe_on" : "takeoff_phase",
        });
      }
    }

    if (this.state.departureWelcomeEnded && isDeparturePhase && telemetry.livery) {
      if (!this.state.boardingMusicStarted && !this.state.boardingMusicStopped) {
        this.startBoardingMusic(telemetry.livery, {
          reason: "departure_phase",
        });
      } else {
        this._logBoardingMusicStartDenied("departure_phase", telemetry.livery);
      }
    }

    if (this.state.safetyBriefingEnded) {
      this.state.safetyBriefingEnded = false;
      if (isDeparturePhase && telemetry.livery) {
        this.state.boardingMusicStopped = false;
        this.startBoardingMusic(telemetry.livery, {
          reason: "safety_briefing_finished",
        });
      }
    }

    if (this.state.arrivalWelcomeEnded) {
      this.state.arrivalWelcomeEnded = false;
      if (isArrivalPhase && telemetry.livery) {
        this.state.boardingMusicStopped = false;
        this.startBoardingMusic(telemetry.livery, {
          reason: "arrival_welcome_finished",
        });
      }
    }

    this._trace("announcementCoordinator.ambient_evaluated", {
      reason,
      phase: telemetry.phase,
      strobe: telemetry.strobe,
      livery: telemetry.livery,
    });
  }

  playSiren() {
    this._logDecision([
      "Request: Siren",
      "Decision: Accepted",
    ], "siren-accepted");
    this._trace("announcementCoordinator.siren_requested");
    const result = this.engine.playSiren();
    this._logDecision([
      "Siren",
      "Requested",
    ], "siren-requested");
    return result;
  }

  async playPTUBurst(durationMs) {
    this._logDecision([
      "Request: PTU Burst",
      "Decision: Accepted",
    ], "ptu-accepted");
    this._trace("announcementCoordinator.ptu_requested");
    try {
      const result = await this.engine.playPTUBurst(durationMs);
      this._logDecision([
        "PTU Burst",
        "Completed",
      ], "ptu-completed");
      return result;
    } catch (error) {
      this._logDecision([
        "PTU Burst",
        "Failed",
        `Reason: ${error?.message || String(error)}`,
      ], "ptu-failed");
      throw error;
    }
  }
}

export const announcementCoordinator = new AnnouncementCoordinator();
export default announcementCoordinator;
