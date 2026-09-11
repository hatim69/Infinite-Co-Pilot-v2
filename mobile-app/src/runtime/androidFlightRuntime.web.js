/**
 * androidFlightRuntime.web.js
 * Web fallback for AndroidFlightRuntime.
 */

class AndroidFlightRuntimeWeb {
  constructor() {
    this.monitoringActive = false;
    this.serviceActive = false;
  }

  isSupported() {
    return false;
  }

  startMonitoring() {
    return Promise.resolve();
  }

  stopMonitoring() {
    return Promise.resolve();
  }

  updateNotification() {}

  on() {}

  off() {}
}

const androidFlightRuntime = new AndroidFlightRuntimeWeb();
export default androidFlightRuntime;
