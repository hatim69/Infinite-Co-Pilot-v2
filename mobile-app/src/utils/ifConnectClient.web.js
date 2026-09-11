/**
 * ifConnectClient.web.js
 *
 * Web implementation of ifConnectClient.
 * Connects to the local bridge WebSocket on port 8088 to stream real-time
 * Infinite Flight telemetry and send cockpit SET commands over the network.
 */

const BRIDGE_WS_URL = "ws://localhost:8088";

class IFConnectClientWeb {
  constructor() {
    this._listeners = {};
    this._ws = null;
    this._isConnected = false;
    this._host = null;
    this._port = 10112;
    this._successCallback = null;
    this._pollQ = [];
    this._reconnectTimer = null;
  }

  // ─── Event Emitter ───────────────────────────────────────────────────────────

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this;
  }

  off(event, handler) {
    if (!this._listeners[event]) return this;
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
    return this;
  }

  _emit(event, data) {
    const handlers = this._listeners[event];
    if (!handlers) return;
    for (const h of handlers) {
      try {
        h(data);
      } catch (err) {
        console.warn(`[IFConnectWeb] Listener error for ${event}:`, err);
      }
    }
  }

  getDiagnostics() {
    return {
      source: "web-bridge",
      isConnected: this._isConnected,
      host: this._host,
      port: this._port,
      pollQueueSize: this._pollQ.length,
      wsState: this._ws ? this._ws.readyState : "closed",
    };
  }

  recoverPollSocket(reason = "manual-recovery") {
    if (!this._isConnected) return false;
    this._sendToBridge({ action: "connect", host: this._host, port: this._port });
    return true;
  }

  // ─── Connection Lifecycle ───────────────────────────────────────────────────

  init(successCallback, params = {}) {
    this._successCallback = successCallback;
    let h = params.host ? params.host.trim() : "127.0.0.1";
    if (h === "localhost") h = "127.0.0.1";
    this._host = h;
    this._port = params.port || 10112;

    this._ensureWebSocket(() => {
      this._sendToBridge({
        action: "connect",
        host: this._host,
        port: this._port,
      });

      // Register already queued commands
      for (const cmd of this._pollQ) {
        this._sendToBridge({ action: "pollRegister", command: cmd });
      }
    });
  }

  _ensureWebSocket(onReady) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      if (onReady) onReady();
      return;
    }

    try {
      this._ws = new WebSocket(BRIDGE_WS_URL);

      this._ws.onopen = () => {
        console.log("[IFConnectWeb] Connected to local telemetry bridge!");
        if (onReady) onReady();
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "connect") {
            this._isConnected = true;
            this._emit("connect");
            if (typeof this._successCallback === "function") {
              this._successCallback();
            }
          } else if (msg.event === "data") {
            this._emit("data", { command: msg.command, data: msg.data });
          } else if (msg.event === "disconnect") {
            this._isConnected = false;
            this._emit("disconnect");
          } else if (msg.event === "error") {
            this._emit("error", { message: msg.message });
          }
        } catch (e) {
          console.warn("[IFConnectWeb] Parse error on WS packet:", e);
        }
      };

      this._ws.onerror = (err) => {
        console.warn("[IFConnectWeb] WebSocket error (is the bridge running with npm run web?):", err);
      };

      this._ws.onclose = () => {
        this._isConnected = false;
        this._ws = null;
      };
    } catch (err) {
      console.warn("[IFConnectWeb] Could not connect to bridge WebSocket:", err);
    }
  }

  _sendToBridge(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  pollRegister(cmd) {
    if (!this._pollQ.includes(cmd)) {
      this._pollQ.push(cmd);
    }
    this._sendToBridge({ action: "pollRegister", command: cmd });
  }

  set(commandName, value) {
    this._sendToBridge({ action: "set", command: commandName, value });
    return true;
  }

  close(callback) {
    this._isConnected = false;
    this._sendToBridge({ action: "close" });
    if (callback) callback();
  }
}

const ifConnect = new IFConnectClientWeb();
export default ifConnect;
