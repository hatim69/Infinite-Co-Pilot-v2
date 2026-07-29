import { Platform } from "react-native";
import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from "@notifee/react-native";
import { runtimeTrace } from "../utils/runtimeTrace";

const CHANNEL_ID = "flight_monitoring";
const NOTIFICATION_ID = "flight_monitoring";

class AndroidFlightRuntime {
  constructor() {
    this.monitoringActive = false;
    this.serviceActive = false;
    this.serviceResolve = null;
    this.sessionRetained = false;
    this.handlers = {};
    this.startPromise = null;
    this.stopPromise = null;
    this.channelId = null;
    this.permissionRequested = false;
    this._registerForegroundService();
  }

  isSupported() {
    return Platform.OS === "android" && Boolean(notifee?.registerForegroundService);
  }

  _registerForegroundService() {
    if (!this.isSupported()) return;
    if (globalThis.__INFINITE_COPILOT_ANDROID_FGS_REGISTERED__) return;

    globalThis.__INFINITE_COPILOT_ANDROID_FGS_REGISTERED__ = true;
    notifee.registerForegroundService(() => {
      runtimeTrace("androidRuntime.service_callback", {
        source: "notifee.registerForegroundService",
        owner: "AndroidFlightRuntime",
        monitoringActive: this.monitoringActive,
        serviceActive: this.serviceActive,
        sessionRetained: this.sessionRetained,
      }, { throttleMs: 0 });
      if (!this.monitoringActive) {
        return Promise.resolve();
      }

      this.serviceActive = true;
      this._retainSession();

      return new Promise((resolve) => {
        this.serviceResolve = () => {
          runtimeTrace("androidRuntime.service_resolve", {
            source: "stopMonitoring",
            owner: "AndroidFlightRuntime",
            monitoringActive: this.monitoringActive,
            serviceActive: this.serviceActive,
            sessionRetained: this.sessionRetained,
          }, { throttleMs: 0 });
          this._releaseSession();
          this.serviceActive = false;
          this.serviceResolve = null;
          resolve();
        };
      });
    });
  }

  _retainSession() {
    if (this.sessionRetained) return;
    this.sessionRetained = true;
    runtimeTrace("androidRuntime.retain_session", {
      source: "foreground-service",
      owner: "AndroidFlightRuntime",
      monitoringActive: this.monitoringActive,
      serviceActive: this.serviceActive,
    }, { throttleMs: 0 });
    this.handlers.onAcquireSession?.();
  }

  _releaseSession() {
    if (!this.sessionRetained) return;
    this.sessionRetained = false;
    runtimeTrace("androidRuntime.release_session", {
      source: "foreground-service",
      owner: "AndroidFlightRuntime",
      monitoringActive: this.monitoringActive,
      serviceActive: this.serviceActive,
    }, { throttleMs: 0 });
    this.handlers.onReleaseSession?.();
  }

  async _ensureChannel() {
    if (this.channelId) return this.channelId;
    this.channelId = await notifee.createChannel({
      id: CHANNEL_ID,
      name: "Flight Monitoring",
      importance: AndroidImportance.LOW,
    });
    return this.channelId;
  }

  async startMonitoring({ connectedIp = "", onAcquireSession, onReleaseSession, onError } = {}) {
    if (!this.isSupported()) return { started: false, reason: "unsupported-platform" };

    this.handlers = {
      onAcquireSession,
      onReleaseSession,
      onError,
    };

    if (this.monitoringActive) {
      await this.updateNotification({ connectedIp });
      runtimeTrace("androidRuntime.start_already_running", {
        source: "FlightSession",
        owner: "AndroidFlightRuntime",
        connectedIp,
        serviceActive: this.serviceActive,
        sessionRetained: this.sessionRetained,
      }, { throttleMs: 0 });
      return { started: true, alreadyRunning: true };
    }

    if (this.startPromise) return this.startPromise;

    this.startPromise = this._startMonitoring({ connectedIp })
      .catch((error) => {
        this.monitoringActive = false;
        this._releaseSession();
        onError?.(error);
        throw error;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  async _startMonitoring({ connectedIp }) {
    const startedAt = Date.now();
    this.monitoringActive = true;
    runtimeTrace("androidRuntime.start", {
      source: "FlightSession",
      owner: "AndroidFlightRuntime",
      connectedIp,
    }, { throttleMs: 0 });

    if (!this.permissionRequested) {
      this.permissionRequested = true;
      try {
        await notifee.requestPermission();
      } catch (error) {
        console.log("[AndroidRuntime] Notification permission request failed:", error?.message || error);
      }
    }

    const channelId = await this._ensureChannel();
    await notifee.displayNotification(this._createNotification({ channelId, connectedIp }));
    console.log(`[AndroidRuntime] Foreground service start requested in ${Date.now() - startedAt}ms`);
    runtimeTrace("androidRuntime.notification_displayed", {
      source: "notifee.displayNotification",
      owner: "AndroidFlightRuntime",
      connectedIp,
      elapsedMs: Date.now() - startedAt,
      serviceActive: this.serviceActive,
      sessionRetained: this.sessionRetained,
    }, { throttleMs: 0 });
    return { started: true };
  }

  async updateNotification({ connectedIp = "" } = {}) {
    if (!this.isSupported() || !this.monitoringActive) return;
    const channelId = await this._ensureChannel();
    await notifee.displayNotification(this._createNotification({ channelId, connectedIp }));
  }

  _createNotification({ channelId, connectedIp }) {
    return {
      id: NOTIFICATION_ID,
      title: "Infinite Co-Pilot Monitoring",
      body: connectedIp
        ? `Monitoring Infinite Flight at ${connectedIp}.`
        : "Monitoring Infinite Flight.",
      android: {
        channelId,
        asForegroundService: true,
        foregroundServiceTypes: [
          AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
          AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
        ],
        color: "#0D9488",
        ongoing: true,
        autoCancel: false,
        pressAction: {
          id: "default",
        },
      },
    };
  }

  async stopMonitoring() {
    if (!this.isSupported()) return;
    if (this.stopPromise) return this.stopPromise;

    this.stopPromise = this._stopMonitoring().finally(() => {
      this.stopPromise = null;
    });

    return this.stopPromise;
  }

  async _stopMonitoring() {
    this.monitoringActive = false;
    runtimeTrace("androidRuntime.stop", {
      source: "FlightSession",
      owner: "AndroidFlightRuntime",
      serviceActive: this.serviceActive,
      sessionRetained: this.sessionRetained,
    }, { throttleMs: 0 });

    if (this.serviceResolve) {
      this.serviceResolve();
    } else {
      this._releaseSession();
      this.serviceActive = false;
    }

    try {
      await notifee.stopForegroundService();
    } catch (error) {
      console.log("[AndroidRuntime] Foreground service stop failed:", error?.message || error);
    }
  }
}

export const androidFlightRuntime = new AndroidFlightRuntime();
export default androidFlightRuntime;
