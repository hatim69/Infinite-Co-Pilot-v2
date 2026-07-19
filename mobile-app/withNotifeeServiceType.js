const { withAndroidManifest, withProjectBuildGradle } = require("@expo/config-plugins");

function ensurePermission(androidManifest, permission) {
  const permissions = androidManifest.manifest["uses-permission"] || [];
  if (!permissions.some((entry) => entry.$?.["android:name"] === permission)) {
    permissions.push({ $: { "android:name": permission } });
  }
  androidManifest.manifest["uses-permission"] = permissions;
}

function withNotifeeMaven(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      const mavenRepo = `        maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;
      if (!config.modResults.contents.includes("@notifee/react-native/android/libs")) {
        config.modResults.contents = config.modResults.contents.replace(
          /allprojects\s*\{\s*repositories\s*\{/,
          `allprojects {\n    repositories {\n${mavenRepo}`
        );
      }
    }
    return config;
  });
}

function withNotifeeManifest(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application?.[0];
    if (!application) return config;

    ensurePermission(androidManifest, "android.permission.FOREGROUND_SERVICE");
    ensurePermission(androidManifest, "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE");
    ensurePermission(androidManifest, "android.permission.POST_NOTIFICATIONS");

    application.service = application.service || [];
    application.service = application.service.filter(
      (service) => service.$?.["android:name"] !== "app.notifee.core.ForegroundService"
    );
    application.service.push({
      $: {
        "android:name": "app.notifee.core.ForegroundService",
        "android:foregroundServiceType": "connectedDevice",
        "tools:replace": "android:foregroundServiceType",
      },
    });

    if (!androidManifest.manifest.$["xmlns:tools"]) {
      androidManifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    return config;
  });
}

module.exports = function withNotifeeServiceType(config) {
  config = withNotifeeMaven(config);
  config = withNotifeeManifest(config);
  return config;
};
