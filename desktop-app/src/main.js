/**
 * main.js
 *
 * Electron Main Process for Infinite Co-Pilot Desktop Companion.
 * Launches the background IF Connect bridge and hosts the cockpit window.
 */

const { app, BrowserWindow, shell, Menu, powerSaveBlocker } = require("electron");
const path = require("path");
const fs = require("fs");
const { startBridge, stopBridge } = require("./bridge");

// Prevent Chromium from throttling timers, sockets, and renderers when window is minimized or occluded
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

let mainWindow = null;
let powerSaveId = null;
const BRIDGE_PORT = 8088;

// Production Vercel URL or local development fallback
const PRODUCTION_URL = "https://infinite-co-pilot.vercel.app";
const TARGET_URL =
  process.env.COPILOT_WEB_URL ||
  (process.env.NODE_ENV === "development"
    ? `http://localhost:${BRIDGE_PORT}`
    : PRODUCTION_URL);

async function createWindow() {
  // Check for local exported web bundle (for local fallback)
  const localDistPath = path.resolve(__dirname, "../../mobile-app/dist");
  const staticDir = fs.existsSync(localDistPath) ? localDistPath : null;

  try {
    console.log(`[Desktop Main] Checking Infinite Flight bridge on port ${BRIDGE_PORT}...`);
    const res = await startBridge({ port: BRIDGE_PORT, staticDir });
    if (res?.reused) {
      console.log(`[Desktop Main] ✅ Reusing active Infinite Flight bridge on port ${BRIDGE_PORT}.`);
    } else {
      console.log(`[Desktop Main] ✅ Infinite Flight bridge started on port ${BRIDGE_PORT}.`);
    }
  } catch (err) {
    console.warn(`[Desktop Main] Bridge startup note:`, err.message);
  }

  const iconPath =
    process.platform === "win32"
      ? path.join(__dirname, "../build/icon.ico")
      : path.join(__dirname, "../build/icon.png");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: "#0a0e17",
    title: "Infinite Co-Pilot",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      backgroundThrottling: false, // Keep JS execution, timers, and WebSockets at full speed when minimized
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Set dock icon on macOS (helpful during development)
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = path.join(__dirname, "../build/icon.png");
    if (fs.existsSync(dockIcon)) {
      try {
        app.dock.setIcon(dockIcon);
      } catch (e) {}
    }
  }

  // Open external links in default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Handle remote URL load failure (e.g. offline, maintenance, or DNS failure)
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame === false || validatedURL.includes("fallback.html")) return;
      console.warn(`[Desktop Window] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
      const fallbackPath = path.join(__dirname, "fallback.html");
      if (fs.existsSync(fallbackPath)) {
        mainWindow.loadFile(fallbackPath, { query: { url: validatedURL } });
      }
    }
  );

  console.log(`[Desktop Window] Loading cockpit UI from: ${TARGET_URL}`);
  mainWindow.loadURL(TARGET_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Prevent OS-level sleep and App Nap while Co-Pilot is active
  try {
    powerSaveId = powerSaveBlocker.start("prevent-app-suspension");
    console.log(`[Desktop Main] Power save blocker active (ID: ${powerSaveId}) - App Nap and background suspension disabled.`);
  } catch (e) {}

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopBridge();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  stopBridge();
  if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
    powerSaveId = null;
  }
});
