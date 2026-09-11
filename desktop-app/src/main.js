/**
 * main.js
 *
 * Electron Main Process for Infinite Co-Pilot Desktop Companion.
 * Launches the background IF Connect bridge and hosts the cockpit window.
 */

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { startBridge, stopBridge } = require("./bridge");

let mainWindow = null;
const BRIDGE_PORT = 8088;

// Production Vercel URL or local development fallback
const PRODUCTION_URL = "https://infinite-copilot.vercel.app";
const TARGET_URL =
  process.env.COPILOT_WEB_URL ||
  (process.env.NODE_ENV === "development"
    ? `http://localhost:${BRIDGE_PORT}`
    : PRODUCTION_URL);

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: "#0a0e17",
    title: "Infinite Co-Pilot",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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
    (event, errorCode, errorDescription, validatedURL) => {
      console.warn(`[Desktop Window] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
      const fallbackPath = path.join(__dirname, "fallback.html");
      if (fs.existsSync(fallbackPath)) {
        mainWindow.loadFile(fallbackPath);
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
  try {
    // Check for local exported web bundle (for local fallback)
    const localDistPath = path.resolve(__dirname, "../../mobile-app/dist");
    const staticDir = fs.existsSync(localDistPath) ? localDistPath : null;

    console.log(`[Desktop Main] Initializing Infinite Flight bridge on port ${BRIDGE_PORT}...`);
    await startBridge({ port: BRIDGE_PORT, staticDir });
    console.log(`[Desktop Main] Bridge successfully initialized.`);
  } catch (err) {
    console.error(`[Desktop Main] Failed to start bridge:`, err.message);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
});
