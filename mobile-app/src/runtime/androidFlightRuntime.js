import { Platform } from "react-native";
import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
} from "@notifee/react-native";

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
    this._registerForegroundService();
  }

  isSupported() {
    return Platform.OS === "android" && Boolean(notifee?.registerForegroundService);
  }

  isMonitoringActive() {
    return this.monitoringActive;
  }

  _registerForegroundService() {
    if (!this.isSupported()) return;
    if (globalThis.__INFINITE_COPILOT_ANDROID_FGS_REGISTERED__) return;

    globalThis.__INFINITE_COPILOT_ANDROID_FGS_REGISTERED__ = true;
    notifee.registerForegroundService(() => {
      if (!this.monitoringActive) {
        return Promise.resolve();
      }

      this.serviceActive = true;
      this._retainSession();

      return new Promise((resolve) => {
        this.serviceResolve = () => {
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
    this.handlers.onAcquireSession?.();
  }

  _releaseSession() {
    if (!this.sessionRetained) return;
    this.sessionRetained = false;
    this.handlers.onReleaseSession?.();
  }

  async _ensureChannel() {
    return notifee.createChannel({
      id: CHANNEL_ID,
      name: "Flight Monitoring",
      importance: AndroidImportance.LOW,
    });
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
    this.monitoringActive = true;

    try {
      await notifee.requestPermission();
    } catch (error) {
      console.log("[AndroidRuntime] Notification permission request failed:", error?.message || error);
    }

    const channelId = await this._ensureChannel();
    await notifee.displayNotification(this._createNotification({ channelId, connectedIp }));
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
