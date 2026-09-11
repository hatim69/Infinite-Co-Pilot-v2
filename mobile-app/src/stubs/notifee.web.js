/**
 * notifee.web.js
 * Web stub for @notifee/react-native.
 * Prevents bundling failures and provides safe no-ops in browser environments.
 */

export const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
};

export const AndroidForegroundServiceType = {
  FOREGROUND_SERVICE_TYPE_NONE: 0,
  FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1,
  FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK: 2,
  FOREGROUND_SERVICE_TYPE_PHONE_CALL: 4,
  FOREGROUND_SERVICE_TYPE_LOCATION: 8,
  FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE: 16,
  FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION: 32,
  FOREGROUND_SERVICE_TYPE_MICROPHONE: 128,
  FOREGROUND_SERVICE_TYPE_HEALTH: 256,
  FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING: 512,
  FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED: 1024,
  FOREGROUND_SERVICE_TYPE_SHORT_SERVICE: 2048,
  FOREGROUND_SERVICE_TYPE_SPECIAL_USE: 1073741824,
};

export const EventType = {
  DISMISSED: 0,
  PRESS: 1,
  ACTION_PRESS: 2,
  DELIVERED: 3,
  APP_BLOCKED: 4,
  CHANNEL_BLOCKED: 5,
  CHANNEL_GROUP_BLOCKED: 6,
  TRIGGER_NOTIFICATION_CREATED: 7,
};

const notifee = {
  isBatteryOptimizationEnabled: async () => false,
  openBatteryOptimizationSettings: async () => {},
  getPowerManagerInfo: async () => ({}),
  openPowerManagerSettings: async () => {},
  createChannel: async () => "flight_monitoring",
  displayNotification: async () => "notification-id",
  stopForegroundService: async () => {},
  registerForegroundService: () => {},
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => () => {},
  cancelNotification: async () => {},
  cancelAllNotifications: async () => {},
  setBadgeCount: async () => {},
  getBadgeCount: async () => 0,
};

export default notifee;
