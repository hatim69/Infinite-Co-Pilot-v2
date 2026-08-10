const {
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * withWakeLock
 *
 * Registers a small native module (InfiniteCoPilotWakeLock) that acquires a
 * PARTIAL_WAKE_LOCK for the duration of active monitoring.
 *
 * Why this exists: `androidFlightRuntime.js` already runs a Notifee
 * foreground service (FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE +
 * FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) whenever monitoring is active.
 * That keeps the *process* from being killed and satisfies Android 14+'s
 * requirement to declare a service type, but it does not by itself stop the
 * CPU from suspending when the screen turns off — that is governed by
 * PowerManager wake locks, a separate Android subsystem. Without a held
 * wake lock, the JS timers driving IF Connect's TCP poll loop
 * (ifConnectClient.js) can stop firing once the CPU sleeps, even though the
 * foreground-service notification stays visible. OEM power managers vary in
 * how aggressively they suspend a backgrounded app's CPU scheduling even
 * with an active foreground service (this is the most likely explanation
 * for "works for hours on iQOO, dies in the background on Samsung" reported
 * by the user — Samsung's One UI power management is documented to be more
 * aggressive here than stock/Vivo/iQOO defaults).
 *
 * The wake lock is acquired with a bounded 12-hour timeout (never
 * indefinite) as a safety net against battery drain if release() is ever
 * missed (crash, force-kill) — comfortably longer than the 8+ hour flights
 * this app targets, per Android's own documented best practice of always
 * bounding PARTIAL_WAKE_LOCK acquisitions.
 */

// android.permission.WAKE_LOCK is declared via the standard `android.permissions`
// array in app.json (alongside FOREGROUND_SERVICE, POST_NOTIFICATIONS, etc.)
// rather than injected here, to keep permission declarations in one place.

function withWakeLockNativeModule(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const packageName = config.android?.package || "com.infinitecopilot.app";
      const packagePath = packageName.replace(/\./g, "/");
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java",
        packagePath
      );

      fs.mkdirSync(dir, { recursive: true });

      const moduleCode = `package ${packageName}

import android.content.Context
import android.os.PowerManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Acquires/releases a single PARTIAL_WAKE_LOCK for the duration of active
 * Infinite Flight monitoring, so the JS telemetry poll loop keeps running
 * with the screen off. Bounded to 12 hours per acquire() call as a safety
 * net — release() is always expected to be called explicitly when
 * monitoring ends, but the timeout guarantees the lock cannot leak forever
 * if that call is ever missed (process kill, crash).
 */
class WakeLockModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var wakeLock: PowerManager.WakeLock? = null
  private val timeoutMs = 12L * 60L * 60L * 1000L // 12 hours

  override fun getName(): String = "InfiniteCoPilotWakeLock"

  @ReactMethod
  fun acquire(promise: Promise) {
    try {
      val existing = wakeLock
      if (existing != null && existing.isHeld) {
        promise.resolve(true)
        return
      }
      val powerManager =
        reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      val lock = powerManager.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "InfiniteCoPilot:MonitoringWakeLock"
      )
      lock.setReferenceCounted(false)
      lock.acquire(timeoutMs)
      wakeLock = lock
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WAKE_LOCK_ACQUIRE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun release(promise: Promise) {
    try {
      val existing = wakeLock
      if (existing != null && existing.isHeld) {
        existing.release()
      }
      wakeLock = null
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("WAKE_LOCK_RELEASE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun isHeld(promise: Promise) {
    promise.resolve(wakeLock?.isHeld == true)
  }
}
`;

      const packageCode = `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class WakeLockPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(WakeLockModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

      fs.writeFileSync(path.join(dir, "WakeLockModule.kt"), moduleCode);
      fs.writeFileSync(path.join(dir, "WakeLockPackage.kt"), packageCode);
      return config;
    },
  ]);
}

function withWakeLockRegistration(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes("WakeLockPackage()")) {
      // New-Architecture Expo template (SDK 54+/RN 0.8x): packages are built
      // via `PackageList(this).packages.apply { add(...) }` inside
      // getDefaultReactHost(), not a plain getPackages() override.
      const applyAnchor =
        "// Packages that cannot be autolinked yet can be added manually here, for example:";
      // Older template fallback (pre New-Architecture-only default).
      const legacyAnchor = "val packages = PackageList(this).packages";

      if (contents.includes(applyAnchor)) {
        contents = contents.replace(
          applyAnchor,
          `${applyAnchor}\n          add(WakeLockPackage())`
        );
      } else if (contents.includes(legacyAnchor)) {
        contents = contents.replace(
          legacyAnchor,
          `${legacyAnchor}\n          packages.add(WakeLockPackage())`
        );
      } else {
        console.warn(
          "[withWakeLock] Could not find a recognized package-registration anchor in " +
            "MainApplication.kt to auto-register WakeLockPackage. Add " +
            "`add(WakeLockPackage())` inside the packages list manually."
        );
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withWakeLock(config) {
  config = withWakeLockNativeModule(config);
  config = withWakeLockRegistration(config);
  return config;
};
