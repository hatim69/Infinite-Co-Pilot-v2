const { withAndroidManifest, withProjectBuildGradle } = require('@expo/config-plugins');

function withNotifeeMaven(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const mavenRepo = `        maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;
      if (!config.modResults.contents.includes('@notifee/react-native/android/libs')) {
        // Find the 'allprojects { repositories {' block and inject our repo
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
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application[0];
    
    if (!application.service) {
      application.service = [];
    }

    const notifeeService = application.service.find(
      (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
    );
    
    if (notifeeService) {
      notifeeService.$['android:foregroundServiceType'] = 'mediaPlayback|dataSync|shortService';
      notifeeService.$['tools:replace'] = 'android:foregroundServiceType';
    } else {
      application.service.push({
        $: {
          'android:name': 'app.notifee.core.ForegroundService',
          'android:foregroundServiceType': 'mediaPlayback|dataSync|shortService',
          'tools:replace': 'android:foregroundServiceType'
        }
      });
    }

    // Ensure tools namespace is defined in the manifest
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    
    return config;
  });
}

module.exports = function withNotifeeServiceType(config) {
  config = withNotifeeMaven(config);
  config = withNotifeeManifest(config);
  return config;
};
