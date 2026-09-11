/**
 * udp.web.js
 *
 * Web stub & bridge client for react-native-udp.
 * Connects to the local bridge WebSocket on port 8088 and forwards
 * real UDP discovery packets received from Infinite Flight on the local network.
 */

import { EventEmitter } from "events";
import { Buffer } from "buffer";

const BRIDGE_WS_URL = "ws://localhost:8088";

class MockUdpSocket extends EventEmitter {
  constructor() {
    super();
    this._ws = null;
  }

  bind(port, address, callback) {
    if (typeof callback === "function") callback();

    this._connectBridge();
    return this;
  }

  _connectBridge() {
    try {
      this._ws = new WebSocket(BRIDGE_WS_URL);

      this._ws.onopen = () => {
        console.log("[UDPWeb] Discovery bridge link active.");
      };

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "udp_discovery" && msg.rawJson) {
            const buf = Buffer.from(msg.rawJson, "utf8");
            this.emit("message", buf, msg.rinfo || { address: "127.0.0.1", port: 15000 });
          } else if (msg.event === "device_list" && Array.isArray(msg.devices)) {
            for (const dev of msg.devices) {
              const payload = JSON.stringify({
                Addresses: [dev.ip],
                Port: dev.port || 10112,
                DeviceName: dev.deviceName || dev.deviceId,
                State: dev.state || "Playing",
              });
              const buf = Buffer.from(payload, "utf8");
              this.emit("message", buf, { address: dev.ip, port: dev.port || 10112 });
            }
          }
        } catch (e) {}
      };

      this._ws.onerror = () => {
        // Fallback: emit virtual demo flight device if bridge is not running
        setTimeout(() => {
          const demoPayload = JSON.stringify({
            Addresses: ["127.0.0.1"],
            Port: 10112,
            DeviceName: "Cockpit Simulator (Web Demo)",
            State: "Playing",
          });
          this.emit("message", Buffer.from(demoPayload, "utf8"), {
            address: "127.0.0.1",
            port: 10112,
          });
        }, 1000);
      };

      this._ws.onclose = () => {
        this._ws = null;
      };
    } catch (err) {
      console.warn("[UDPWeb] Error connecting to bridge:", err);
    }
  }

  setBroadcast(flag) {}
  setMulticastTTL(ttl) {}
  setMulticastLoopback(flag) {}
  addMembership(multicastAddress) {}
  dropMembership(multicastAddress) {}
  send(msg, offset, length, port, address, callback) {
    if (typeof callback === "function") callback();
  }
  close(callback) {
    if (this._ws) {
      try { this._ws.close(); } catch (e) {}
      this._ws = null;
    }
    if (typeof callback === "function") callback();
  }
  address() {
    return { address: "127.0.0.1", port: 15000, family: "IPv4" };
  }
}

const dgram = {
  createSocket: (options, callback) => {
    const socket = new MockUdpSocket();
    if (typeof callback === "function") {
      socket.on("message", callback);
    }
    return socket;
  },
  Socket: MockUdpSocket,
};

export default dgram;
export { MockUdpSocket as Socket };
