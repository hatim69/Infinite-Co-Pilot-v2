/**
 * bridge.js
 *
 * Local WebSocket Bridge for Infinite Co-Pilot Web Edition.
 *
 * Bridges Infinite Flight Connect v2 (UDP 15000 discovery & TCP 10112 telemetry)
 * to local WebSocket (port 8088) so the web app can run with 100% full live
 * flight telemetry from your physical iPhone/iPad or local simulator.
 */

const http = require("http");
const net = require("net");
const dgram = require("dgram");
const WebSocket = require("ws");

const WS_PORT = 8088;
const IF_DISCOVERY_PORT = 15000;
const IF_DEFAULT_TCP_PORT = 10112;

const DataType = {
  BOOLEAN: 0,
  INTEGER: 1,
  FLOAT: 2,
  DOUBLE: 3,
  STRING: 4,
  LONG: 5,
};

// ─── WebSocket Server ─────────────────────────────────────────────────────────

const CDN_BASE_URL = "https://cdn.dakshaggarwal.dev";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost:8088"}`);

  if (parsedUrl.pathname === "/audio") {
    const file = parsedUrl.searchParams.get("file");
    const fallback = parsedUrl.searchParams.get("fallback");
    if (!file) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing file param");
      return;
    }

    let targetUrl = `${CDN_BASE_URL}/${file.replace(/^\//, "")}`;

    try {
      let audioRes = await fetch(targetUrl);
      if (!audioRes.ok && fallback) {
        targetUrl = `${CDN_BASE_URL}/${fallback.replace(/^\//, "")}`;
        audioRes = await fetch(targetUrl);
      }
      if (!audioRes.ok) {
        res.writeHead(audioRes.status, {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        });
        res.end("Audio file not found on CDN");
        return;
      }
      res.writeHead(200, {
        "Content-Type": audioRes.headers.get("content-type") || "audio/mpeg",
        "Content-Length": audioRes.headers.get("content-length"),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      });
      const arrayBuf = await audioRes.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
      return;
    } catch (err) {
      console.warn("[Bridge Audio] Proxy error:", err.message);
      res.writeHead(500, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(err.message);
      return;
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "Infinite Co-Pilot Web Bridge Active", port: WS_PORT }));
});

const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// ─── UDP Auto-Discovery ───────────────────────────────────────────────────────

let udpSocket = null;
const discoveredDevices = new Map();

function startUdpDiscovery() {
  try {
    udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    udpSocket.on("error", (err) => {
      console.warn("[Bridge UDP] Socket error:", err.message);
    });

    udpSocket.on("message", (msg, rinfo) => {
      try {
        const text = msg.toString("utf8");
        const json = JSON.parse(text);
        const addrs = json.Addresses || json.addresses || [];
        const ip = (rinfo && rinfo.address) || addrs[0] || "";
        const devId = (json.deviceId || json.deviceName || ip || "unknown").trim();
        const devName = (json.deviceName || json.deviceId || "Infinite Flight Device").trim();

        discoveredDevices.set(devId, {
          deviceId: devId,
          deviceName: devName,
          ip: ip,
          port: json.Port || json.port || IF_DEFAULT_TCP_PORT,
          state: json.State ?? json.state ?? "Playing",
          lastSeen: Date.now(),
        });

        broadcast({
          event: "udp_discovery",
          rawJson: text,
          rinfo: { address: ip, port: (rinfo && rinfo.port) || IF_DISCOVERY_PORT },
        });
      } catch (e) {}
    });

    udpSocket.bind(IF_DISCOVERY_PORT, "0.0.0.0", () => {
      try {
        udpSocket.addMembership("239.255.255.250");
      } catch (e) {}
      console.log(`[Bridge UDP] Listening for Infinite Flight broadcasts on port ${IF_DISCOVERY_PORT}...`);
    });
  } catch (err) {
    console.warn("[Bridge UDP] Failed to initialize discovery socket:", err.message);
  }
}

// Periodically clean up offline devices & broadcast active list
setInterval(() => {
  const now = Date.now();
  for (const [id, dev] of discoveredDevices.entries()) {
    if (now - dev.lastSeen > 12000) {
      discoveredDevices.delete(id);
    }
  }

  // Include any discovered devices plus the optional Demo Simulator device
  const deviceList = [
    ...Array.from(discoveredDevices.values()),
    {
      deviceId: "web_simulator",
      deviceName: "Cockpit Simulator (Web Demo)",
      ip: "127.0.0.1",
      port: 10112,
      state: "Playing",
    },
  ];

  broadcast({
    event: "device_list",
    devices: deviceList,
  });
}, 2500);

// ─── IF Connect TCP Session Manager ──────────────────────────────────────────

class InfiniteFlightTcpSession {
  constructor(wsClient) {
    this.ws = wsClient;
    this.host = null;
    this.port = IF_DEFAULT_TCP_PORT;
    this.manifestSocket = null;
    this.pollSocket = null;
    this.manifestByName = {};
    this.manifestByCommand = {};
    this.pollQ = [];
    this.pollIndex = 0;
    this.isPollWaiting = false;
    this.isConnected = false;
    this.receiveBuffer = null;
    this.simTimer = null;
    this.generation = 0;
  }

  sendToClient(obj) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  connect(host, port = IF_DEFAULT_TCP_PORT) {
    this.close();
    this.generation += 1;
    const gen = this.generation;
    this.host = (host || "127.0.0.1").trim();
    this.port = port || IF_DEFAULT_TCP_PORT;

    if (this.host === "127.0.0.1" || this.host === "localhost") {
      this._startDemoSimulation();
      return;
    }

    console.log(`[Bridge TCP] Connecting to Infinite Flight device at ${this.host}:${this.port}...`);
    this._fetchManifest(gen);
  }

  _fetchManifest(gen) {
    let mBuffer = null;
    let mStringLength = 0;
    let done = false;

    this.manifestSocket = net.createConnection({ host: this.host, port: this.port }, () => {
      console.log(`[Bridge TCP] Connected to Infinite Flight manifest socket on ${this.host}. Requesting manifest...`);
      // Command code -1, GET flag 0
      const buf = Buffer.alloc(5);
      buf.writeInt32LE(-1, 0);
      buf.writeInt8(0, 4);
      this.manifestSocket.write(buf);
    });

    this.manifestSocket.on("data", (chunk) => {
      if (done || this.generation !== gen) return;
      mBuffer = mBuffer ? Buffer.concat([mBuffer, chunk]) : chunk;

      // Header is 12 bytes: cmdCode[4] + totalDataLen[4] + stringLen[4]
      if (mStringLength === 0 && mBuffer.length >= 12) {
        mStringLength = mBuffer.readInt32LE(8);
        console.log(`[Bridge TCP] Manifest string size: ${mStringLength} bytes`);
      }

      if (mStringLength > 0 && mBuffer.length >= 12 + mStringLength) {
        done = true;
        const csvStr = mBuffer.toString("utf8", 12, 12 + mStringLength);
        this._parseManifest(csvStr);

        try {
          this.manifestSocket.destroy();
        } catch (e) {}
        this.manifestSocket = null;

        // Give the simulator 500ms to settle manifest disconnect before opening poll socket
        setTimeout(() => {
          if (this.generation !== gen) return;
          this._connectPollSocket(gen);
        }, 500);
      }
    });

    this.manifestSocket.on("error", (err) => {
      if (done || this.generation !== gen) return;
      console.warn(`[Bridge TCP] Manifest socket error: ${err.message}`);
      this.sendToClient({ event: "error", message: `Connection failed: ${err.message}` });
      this.close();
    });

    this.manifestSocket.on("close", () => {
      if (!done && this.generation === gen) {
        console.warn("[Bridge TCP] Manifest socket closed prematurely.");
      }
    });
  }

  _parseManifest(csv) {
    this.manifestByName = {};
    this.manifestByCommand = {};
    const lines = csv.split("\n");
    let count = 0;
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 3) continue;
      const command = parseInt(parts[0], 10);
      const type = parseInt(parts[1], 10);
      const name = parts[2] ? parts[2].trim() : null;
      if (!isNaN(command) && name) {
        const info = { command, type, name };
        this.manifestByName[name] = info;
        this.manifestByCommand[command] = info;
        count++;
      }
    }
    console.log(`[Bridge TCP] Successfully parsed manifest: ${count} commands available.`);
  }

  _connectPollSocket(gen) {
    this.receiveBuffer = null;
    this.isPollWaiting = false;

    console.log(`[Bridge TCP] Opening live poll socket to Infinite Flight (${this.host})...`);
    this.pollSocket = net.createConnection({ host: this.host, port: this.port }, () => {
      if (this.generation !== gen) return;
      console.log(`[Bridge TCP] ✅ Live polling link active with ${this.host}!`);
      this.isConnected = true;
      this.sendToClient({ event: "connect", host: this.host, port: this.port });

      // Start poll cycle
      this._sendNextPoll(gen);
    });

    this.pollSocket.on("data", (chunk) => {
      if (this.generation !== gen) return;
      this.receiveBuffer = this.receiveBuffer ? Buffer.concat([this.receiveBuffer, chunk]) : chunk;
      this._processReceivedData(gen);
    });

    this.pollSocket.on("error", (err) => {
      if (this.generation !== gen) return;
      console.warn(`[Bridge TCP] Poll socket error: ${err.message}`);
      this.sendToClient({ event: "error", message: err.message });
      this.close();
    });

    this.pollSocket.on("close", () => {
      if (this.generation !== gen) return;
      console.log("[Bridge TCP] Poll socket closed.");
      this.sendToClient({ event: "disconnect" });
      this.close();
    });
  }

  _processReceivedData(gen) {
    if (this.generation !== gen) return;

    while (this.receiveBuffer && this.receiveBuffer.length >= 8) {
      const dataLen = this.receiveBuffer.readInt32LE(4);
      const totalLen = 8 + dataLen;
      if (this.receiveBuffer.length < totalLen) break;

      const cmdCode = this.receiveBuffer.readInt32LE(0);
      const cmdInfo = this.manifestByCommand[cmdCode];

      if (cmdInfo) {
        const value = this._decodeValue(cmdInfo.type, this.receiveBuffer, dataLen);
        if (value !== undefined) {
          this.sendToClient({ event: "data", command: cmdInfo.name, data: value });
        }
      }

      if (totalLen < this.receiveBuffer.length) {
        this.receiveBuffer = this.receiveBuffer.slice(totalLen);
      } else {
        this.receiveBuffer = null;
      }

      this.isPollWaiting = false;
      setTimeout(() => this._sendNextPoll(gen), 0);
      break;
    }
  }

  _sendNextPoll(gen) {
    if (this.generation !== gen || !this.isConnected || !this.pollSocket || this.isPollWaiting || this.pollQ.length === 0) return;

    const cmdName = this.pollQ[this.pollIndex % this.pollQ.length];
    this.pollIndex = (this.pollIndex + 1) % this.pollQ.length;
    const cmdInfo = this.manifestByName[cmdName];
    if (!cmdInfo) {
      // If this command isn't in manifest, try next tick
      setTimeout(() => this._sendNextPoll(gen), 0);
      return;
    }

    try {
      this.isPollWaiting = true;
      const buf = Buffer.alloc(5);
      buf.writeInt32LE(cmdInfo.command, 0);
      buf.writeInt8(0, 4); // GET flag
      this.pollSocket.write(buf);
    } catch (e) {
      this.isPollWaiting = false;
    }
  }

  pollRegister(cmd) {
    if (!this.pollQ.includes(cmd)) {
      this.pollQ.push(cmd);
      if (!this.isPollWaiting && this.isConnected && this.pollSocket) {
        this._sendNextPoll(this.generation);
      }
    }
  }

  set(commandName, value) {
    if (!this.isConnected || !this.pollSocket) return;
    const cmdInfo = this.manifestByName[commandName];
    if (!cmdInfo) return;

    try {
      let valBuf;
      switch (cmdInfo.type) {
        case DataType.BOOLEAN:
          valBuf = Buffer.alloc(1);
          valBuf.writeUInt8(value ? 1 : 0, 0);
          break;
        case DataType.INTEGER:
          valBuf = Buffer.alloc(4);
          valBuf.writeInt32LE(Math.round(value), 0);
          break;
        case DataType.FLOAT:
          valBuf = Buffer.alloc(4);
          valBuf.writeFloatLE(Number(value), 0);
          break;
        case DataType.DOUBLE:
          valBuf = Buffer.alloc(8);
          valBuf.writeDoubleLE(Number(value), 0);
          break;
        case DataType.STRING: {
          const str = String(value);
          const strBuf = Buffer.from(str, "utf8");
          valBuf = Buffer.alloc(4 + strBuf.length);
          valBuf.writeInt32LE(strBuf.length, 0);
          strBuf.copy(valBuf, 4);
          break;
        }
        default:
          return;
      }

      const header = Buffer.alloc(9);
      header.writeInt32LE(cmdInfo.command, 0);
      header.writeInt8(1, 4); // SET flag
      header.writeInt32LE(valBuf.length, 5);

      this.pollSocket.write(Buffer.concat([header, valBuf]));
      console.log(`[Bridge TCP] SET ${commandName} = ${value}`);
    } catch (e) {
      console.warn("[Bridge TCP] set() write error:", e.message);
    }
  }

  _decodeValue(type, buffer, dataLen) {
    const offset = 8;
    try {
      switch (type) {
        case DataType.BOOLEAN:
          return buffer.readUInt8(offset) === 1;
        case DataType.INTEGER:
          return buffer.readInt32LE(offset);
        case DataType.FLOAT:
          return buffer.readFloatLE(offset);
        case DataType.DOUBLE:
          return buffer.readDoubleLE(offset);
        case DataType.STRING: {
          const strLen = buffer.readUInt32LE(offset);
          return buffer.toString("utf8", offset + 4, offset + 4 + strLen);
        }
        case DataType.LONG:
          return Number(buffer.readBigInt64LE(offset));
        default:
          return undefined;
      }
    } catch (e) {
      return undefined;
    }
  }

  _startDemoSimulation() {
    this.close();
    console.log("[Bridge Demo] Starting simulated demo flight session...");
    this.isConnected = true;
    this.sendToClient({ event: "connect", host: "127.0.0.1", port: IF_DEFAULT_TCP_PORT });

    let step = 0;
    let ias = 0;
    let msl = 450;
    let agl = 10;
    let vs = 0;
    let flaps = 0;
    let gear = 0;

    this.sendToClient({ event: "data", command: "aircraft/0/name", data: "Airbus A320-200" });
    this.sendToClient({ event: "data", command: "aircraft/0/livery", data: "Air France" });
    this.sendToClient({ event: "data", command: "aircraft/0/systems/load/total_weight", data: 64200 });
    this.sendToClient({ event: "data", command: "infiniteflight/app_state", data: 1 });

    this.simTimer = setInterval(() => {
      step += 1;
      if (step <= 25) {
        ias = Math.min(18, ias + 1);
        flaps = 1;
      } else if (step <= 80) {
        ias += 2.8;
      } else if (step <= 180) {
        vs = 2400;
        agl = Math.round(agl + (vs / 60) * 0.2);
        msl = 450 + agl;
        ias = Math.min(250, ias + 0.8);
        if (agl > 300) gear = 1;
        if (agl > 2000) flaps = 0;
      } else {
        vs = 0;
        msl = 33000;
        agl = 32500;
        ias = 265;
      }

      this.sendToClient({ event: "data", command: "aircraft/0/indicated_airspeed", data: ias });
      this.sendToClient({ event: "data", command: "aircraft/0/groundspeed", data: ias + 5 });
      this.sendToClient({ event: "data", command: "aircraft/0/altitude_msl", data: msl });
      this.sendToClient({ event: "data", command: "aircraft/0/altitude_agl", data: agl });
      this.sendToClient({ event: "data", command: "aircraft/0/vertical_speed", data: vs });
      this.sendToClient({ event: "data", command: "aircraft/0/systems/flaps/state", data: flaps });
      this.sendToClient({ event: "data", command: "aircraft/0/systems/landing_gear/state", data: gear });
      this.sendToClient({ event: "data", command: "aircraft/0/is_on_ground", data: agl < 20 });
      this.sendToClient({ event: "data", command: "aircraft/0/systems/engines/0/n1", data: step > 25 ? 95 : 22 });
      this.sendToClient({ event: "data", command: "aircraft/0/systems/engines/1/n1", data: step > 25 ? 95 : 22 });
    }, 200);
  }

  close() {
    this.isConnected = false;
    this.generation += 1;
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.pollSocket) {
      try { this.pollSocket.destroy(); } catch (e) {}
      this.pollSocket = null;
    }
    if (this.manifestSocket) {
      try { this.manifestSocket.destroy(); } catch (e) {}
      this.manifestSocket = null;
    }
    this.pollQ = [];
    this.pollIndex = 0;
    this.isPollWaiting = false;
    this.receiveBuffer = null;
  }
}

// ─── WebSocket Client Handling ───────────────────────────────────────────────

wss.on("connection", (ws) => {
  console.log("[Bridge WS] Web app client connected to bridge!");
  const session = new InfiniteFlightTcpSession(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString("utf8"));
      if (msg.action === "connect") {
        session.connect(msg.host, msg.port);
      } else if (msg.action === "pollRegister") {
        session.pollRegister(msg.command);
      } else if (msg.action === "set") {
        session.set(msg.command, msg.value);
      } else if (msg.action === "close") {
        session.close();
      }
    } catch (e) {
      console.warn("[Bridge WS] Message parsing error:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("[Bridge WS] Web app client disconnected.");
    session.close();
  });
});

// Start services
server.listen(WS_PORT, "0.0.0.0", () => {
  console.log(`=======================================================`);
  console.log(`✈️  Infinite Co-Pilot Web Bridge active on port ${WS_PORT}`);
  console.log(`📡  Streaming live Infinite Flight telemetry to browser`);
  console.log(`=======================================================`);
  startUdpDiscovery();
});

module.exports = { server, wss };
