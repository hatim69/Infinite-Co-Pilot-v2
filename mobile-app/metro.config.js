const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    if (moduleName === "react-native-tcp-socket") {
      return {
        filePath: path.resolve(__dirname, "src/stubs/tcp-socket.web.js"),
        type: "sourceFile",
      };
    }
    if (moduleName === "react-native-udp") {
      return {
        filePath: path.resolve(__dirname, "src/stubs/udp.web.js"),
        type: "sourceFile",
      };
    }
    if (moduleName === "@notifee/react-native") {
      return {
        filePath: path.resolve(__dirname, "src/stubs/notifee.web.js"),
        type: "sourceFile",
      };
    }
    if (moduleName === "react-native-purchases") {
      return {
        filePath: path.resolve(__dirname, "src/stubs/purchases.web.js"),
        type: "sourceFile",
      };
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

