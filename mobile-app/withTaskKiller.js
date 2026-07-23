const {
  withDangerousMod,
  withAndroidManifest,
  withMainActivity,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withTaskKiller(config) {
  config = withTaskKillerServiceFile(config);
  config = withTaskKillerManifest(config);
  config = withTaskKillerMainActivity(config);
  return config;
}

function withTaskKillerServiceFile(config) {
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

      const serviceCode = `package ${packageName};

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/**
 * TaskRemovedKillService
 * 
 * A temporary beta workaround to terminate the React Native Android process 
 * when the user swipes the app away from the Recent Apps screen.
 * 
 * Without this, the background audio session and foreground service
 * keep the process alive indefinitely.
 */
public class TaskRemovedKillService extends Service {
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // We want the service to run until the task is removed, but not to restart if killed.
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        
        // Terminate the process immediately when the app is swiped away from Recents.
        // This ensures all media sessions, sockets, and JS background threads are destroyed.
        android.os.Process.killProcess(android.os.Process.myPid());
    }
}
`;

      fs.writeFileSync(path.join(dir, "TaskRemovedKillService.java"), serviceCode);
      return config;
    },
  ]);
}

function withTaskKillerManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application[0];

    if (!application.service) {
      application.service = [];
    }

    const existingService = application.service.find(
      (s) => s.$["android:name"] === ".TaskRemovedKillService"
    );

    if (!existingService) {
      application.service.push({
        $: {
          "android:name": ".TaskRemovedKillService",
          "android:exported": "false",
          "android:stopWithTask": "false",
        },
      });
    }

    return config;
  });
}

function withTaskKillerMainActivity(config) {
  return withMainActivity(config, async (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes("TaskRemovedKillService::class.java")) {
      // Find the super.onCreate(...) call inside onCreate
      contents = contents.replace(
        /super\.onCreate\((.*?)\)/,
        `super.onCreate($1)\n    try {\n      startService(android.content.Intent(this, TaskRemovedKillService::class.java))\n    } catch (e: Exception) {\n      e.printStackTrace()\n    }`
      );
    }
    
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withTaskKiller;
