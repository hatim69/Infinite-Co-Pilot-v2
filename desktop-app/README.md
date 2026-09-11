# Infinite Co-Pilot Desktop Companion (Mac & Windows)

The native desktop companion for **Infinite Co-Pilot**. It loads the live cockpit dashboard from your cloud deployment (Vercel) while silently running the local Infinite Flight Connect v2 bridge in the background.

---

## Architecture & Developer Control

* **Live Cloud Dashboard**: The desktop window streams the web UI directly from your live Vercel URL (`https://infinite-copilot.vercel.app` or your custom domain).
* **Remote Kill-Switch / Maintenance**: If you shut down the site, turn on maintenance mode, or require user authentication on Vercel, the desktop app immediately updates for every user without requiring app updates.
* **Silent Bridge Engine**: The background process listens on local UDP port `15000` to auto-discover iPhone/iPad/simulator devices and streams telemetry via TCP port `10112` and WebSockets on `port 8088`.
* **Zero Configuration**: Users double-click the app on Mac or Windows. It opens the cockpit window and connects automatically to their phone on Wi-Fi.

---

## Quick Start (Development)

1. Ensure the web bundle is built or the web dev server is running:
   ```bash
   cd ../mobile-app && npm run build:web
   ```
2. Start the desktop app:
   ```bash
   cd desktop-app
   npm start
   ```

To specify a custom remote Vercel URL:
```bash
COPILOT_WEB_URL="https://your-app.vercel.app" npm start
```

---

## Building Installers

### macOS (`.dmg` & `.zip` for Apple Silicon & Intel)
```bash
npm run build:mac
```
Output: `dist-electron/Infinite Co-Pilot-1.0.0.dmg` and `Infinite Co-Pilot-1.0.0-mac.zip`.

### Windows (`.exe` NSIS installer & portable)
```bash
npm run build:win
```
Output: `dist-electron/Infinite Co-Pilot Setup 1.0.0.exe` and portable `.exe`.

### Multi-Platform (Mac + Windows)
```bash
npm run build:all
```
*(Note: Building Windows `.exe` from macOS uses Wine/Docker or can be run directly on Windows or via GitHub Actions).*

---

## Offline / Maintenance Fallback

If the user's internet is down or your Vercel server is temporarily offline, the app displays a built-in dark cockpit fallback screen (`fallback.html`) with a "Retry Connection" button, ensuring users never see an ugly white browser crash screen.
