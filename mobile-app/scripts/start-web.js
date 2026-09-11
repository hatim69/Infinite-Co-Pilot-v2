/**
 * start-web.js
 *
 * One-step launcher for Infinite Co-Pilot Web Edition.
 * Starts the local Infinite Flight WebSocket bridge and Expo Web concurrently.
 */

const { spawn } = require("child_process");
const path = require("path");

// 1. Start the bridge
console.log("[Launcher] Starting Infinite Flight local bridge...");
require("./bridge.js");

// 2. Launch Expo Web
console.log("[Launcher] Starting Expo Web Dev Server...");
const expo = spawn("npx", ["expo", "start", "--web"], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    EXPO_NO_TELEMETRY: "1",
  },
});

expo.on("close", (code) => {
  console.log(`[Launcher] Expo Web process exited with code ${code}`);
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  console.log("\n[Launcher] Shutting down...");
  expo.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  expo.kill("SIGTERM");
  process.exit(0);
});
