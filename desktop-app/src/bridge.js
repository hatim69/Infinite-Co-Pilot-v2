/**
 * bridge.js
 *
 * Embedded Infinite Flight Connect v2 Bridge for Infinite Co-Pilot Desktop.
 * Provides UDP discovery (port 15000), TCP telemetry link (port 10112),
 * WebSocket streaming (port 8088), and audio CORS proxy.
 */

const http = require("http");
const net = require("net");
const dgram = require("dgram");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const DEFAULT_WS_PORT = 8088;
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

const CDN_BASE_URL = "https://cdn.dakshaggarwal.dev";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let server = null;
let wss = null;
let udpSocket = null;
let cleanupInterval = null;
const activeSessions = new Set();
const discoveredDevices = new Map();

function broadcast(obj) {
  if (!wss) return;
  const data = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function startUdpDiscovery() {
  try {
    udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    udpSocket.on("error", (err) => {
      console.warn("[Desktop Bridge UDP] Socket error:", err.message);
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
      console.log(`[Desktop Bridge UDP] Listening on port ${IF_DISCOVERY_PORT}...`);
    });
  } catch (err) {
    console.warn("[Desktop Bridge UDP] Failed to initialize discovery socket:", err.message);
  }
}

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

    console.log(`[Desktop Bridge TCP] Connecting to device at ${this.host}:${this.port}...`);
    this._fetchManifest(gen);
  }

  _fetchManifest(gen) {
    let mBuffer = null;
    let mStringLength = 0;
    let done = false;

    this.manifestSocket = net.createConnection({ host: this.host, port: this.port }, () => {
      console.log(`[Desktop Bridge TCP] Connected to manifest socket on ${this.host}.`);
      const buf = Buffer.alloc(5);
      buf.writeInt32LE(-1, 0);
      buf.writeInt8(0, 4);
      this.manifestSocket.write(buf);
    });

    this.manifestSocket.on("data", (chunk) => {
      if (done || this.generation !== gen) return;
      mBuffer = mBuffer ? Buffer.concat([mBuffer, chunk]) : chunk;

      if (mStringLength === 0 && mBuffer.length >= 12) {
        mStringLength = mBuffer.readInt32LE(8);
      }

      if (mStringLength > 0 && mBuffer.length >= 12 + mStringLength) {
        done = true;
        const csvStr = mBuffer.toString("utf8", 12, 12 + mStringLength);
        this._parseManifest(csvStr);

        try { this.manifestSocket.destroy(); } catch (e) {}
        this.manifestSocket = null;

        setTimeout(() => {
          if (this.generation !== gen) return;
          this._connectPollSocket(gen);
        }, 500);
      }
    });

    this.manifestSocket.on("error", (err) => {
      if (done || this.generation !== gen) return;
      console.warn(`[Desktop Bridge TCP] Manifest socket error: ${err.message}`);
      this.sendToClient({ event: "error", message: `Connection failed: ${err.message}` });
      this.close();
    });

    this.manifestSocket.on("close", () => {
      if (!done && this.generation === gen) {
        console.warn("[Desktop Bridge TCP] Manifest socket closed prematurely.");
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
    console.log(`[Desktop Bridge TCP] Parsed manifest: ${count} commands ready.`);
  }

  _connectPollSocket(gen) {
    this.receiveBuffer = null;
    this.isPollWaiting = false;

    this.pollSocket = net.createConnection({ host: this.host, port: this.port }, () => {
      if (this.generation !== gen) return;
      console.log(`[Desktop Bridge TCP] ✅ Live polling link active with ${this.host}!`);
      this.isConnected = true;
      this.sendToClient({ event: "connect", host: this.host, port: this.port });
      this._sendNextPoll(gen);
    });

    this.pollSocket.on("data", (chunk) => {
      if (this.generation !== gen) return;
      this.receiveBuffer = this.receiveBuffer ? Buffer.concat([this.receiveBuffer, chunk]) : chunk;
      this._processReceivedData(gen);
    });

    this.pollSocket.on("error", (err) => {
      if (this.generation !== gen) return;
      console.warn(`[Desktop Bridge TCP] Poll socket error: ${err.message}`);
      this.sendToClient({ event: "error", message: err.message });
      this.close();
    });

    this.pollSocket.on("close", () => {
      if (this.generation !== gen) return;
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
      setTimeout(() => this._sendNextPoll(gen), 0);
      return;
    }

    try {
      this.isPollWaiting = true;
      const buf = Buffer.alloc(5);
      buf.writeInt32LE(cmdInfo.command, 0);
      buf.writeInt8(0, 4);
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
      header.writeInt8(1, 4);
      header.writeInt32LE(valBuf.length, 5);

      this.pollSocket.write(Buffer.concat([header, valBuf]));
    } catch (e) {
      console.warn("[Desktop Bridge TCP] set() write error:", e.message);
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

function startBridge({ port = DEFAULT_WS_PORT, staticDir = null } = {}) {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Private-Network", "true");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

      // Audio Proxy
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
            res.writeHead(audioRes.status, { "Content-Type": "text/plain" });
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
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(err.message);
          return;
        }
      }

      // Static File Serving (if staticDir configured)
      if (staticDir && fs.existsSync(staticDir)) {
        let reqPath = decodeURIComponent(parsedUrl.pathname);
        if (reqPath === "/" || reqPath === "") reqPath = "/index.html";
        let filePath = path.join(staticDir, reqPath);

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(staticDir, "index.html");
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": contentType });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      // Status response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "Infinite Co-Pilot Desktop Bridge Active", port }));
    });

    wss = new WebSocket.Server({ server });

    wss.on("connection", (ws) => {
      const session = new InfiniteFlightTcpSession(ws);
      activeSessions.add(session);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString("utf8"));
          if (msg.action === "connect") session.connect(msg.host, msg.port);
          else if (msg.action === "pollRegister") session.pollRegister(msg.command);
          else if (msg.action === "set") session.set(msg.command, msg.value);
          else if (msg.action === "close") session.close();
        } catch (e) {}
      });

      ws.on("close", () => {
        session.close();
        activeSessions.delete(session);
      });
    });

    startUdpDiscovery();

    cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, dev] of discoveredDevices.entries()) {
        if (now - dev.lastSeen > 12000) discoveredDevices.delete(id);
      }

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

      broadcast({ event: "device_list", devices: deviceList });
    }, 2500);

    server.on("error", (err) => {
      reject(err);
    });

    server.listen(port, "0.0.0.0", () => {
      console.log(`[Desktop Bridge] Active on port ${port}`);
      resolve({ port, server });
    });
  });
}

function stopBridge() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  for (const session of activeSessions) {
    session.close();
  }
  activeSessions.clear();

  if (udpSocket) {
    try { udpSocket.close(); } catch (e) {}
    udpSocket = null;
  }

  if (wss) {
    try { wss.close(); } catch (e) {}
    wss = null;
  }

  if (server) {
    try { server.close(); } catch (e) {}
    server = null;
  }
}

module.exports = {
  startBridge,
  stopBridge,
};
