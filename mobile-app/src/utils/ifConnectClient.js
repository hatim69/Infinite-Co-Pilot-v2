/**
 * ifConnectClient.js
 *
 * A purpose-built React Native implementation of the Infinite Flight Connect v2
 * binary protocol. This replaces the Node.js-only ifc2.js library which is
 * incompatible with react-native-tcp-socket due to missing APIs like
 * setKeepAlive(), and the emit('error') pattern on native sockets.
 *
 * Protocol overview:
 * 1. Phase 1 — Manifest: Connect TCP to IF port 10112, send command code -1,
 *    receive a CSV manifest of all available commands and their data types.
 * 2. Phase 2 — Poll: Open a second TCP connection, cycle through registered
 *    commands sending GET requests and reading binary responses in sequence.
 *
 * Request format:  [Int32LE: cmdCode][Int8: 0=GET]           = 5 bytes
 * Response format: [Int32LE: cmdCode][Int32LE: dataLen][data] = 8+ bytes
 */

import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { runtimeTrace } from './runtimeTrace';

const DEFAULT_PORT = 10112;
const MANIFEST_TIMEOUT_MS = 15000;
const WATCHDOG_INTERVAL_MS = 3000;
const WATCHDOG_STALE_RECONNECT_MS = 5000;
const WATCHDOG_STALE_FORCE_RECONNECT_MS = 15000;
const RECONNECT_DELAY_MS = 2000;

/** IF Connect v2 data type codes */
const DataType = {
  BOOLEAN: 0,
  INTEGER: 1,
  FLOAT: 2,
  DOUBLE: 3,
  STRING: 4,
  LONG: 5,
};

class IFConnectClient {
  constructor() {
    // Event listener registry
    this._listeners = {};

    // Manifest lookup tables (populated after manifest fetch)
    this._manifestByName = {};
    this._manifestByCommand = {};

    // Poll queue
    this._pollQ = [];
    this._pollIndex = 0;

    // Active TCP socket for polling
    this._pollSocket = null;
    this._mSocket = null; // Track manifest socket to abort on close
    this._receiveBuffer = null;
    this._isPollWaiting = false;

    // Connection state
    this._isConnected = false;
    this._host = null;
    this._port = DEFAULT_PORT;
    this._successCallback = null;

    // Timers
    this._reconnectTimer = null;
    this._watchdogTimer = null;
    this._mTimeout = null;
    this._lastDataTime = 0;
    this._reconnectAttempt = 0;
    this._pollRequestSeq = 0;
    this._pollResponseSeq = 0;
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
      } catch (e) {
        console.warn('[IFConnect] Handler error:', e);
      }
    }
  }

  getDiagnostics() {
    return {
      connected: this._isConnected,
      host: this._host,
      waitingForPollResponse: this._isPollWaiting,
      pollQueueSize: this._pollQ.length,
      pollIndex: this._pollIndex,
      pollRequestSeq: this._pollRequestSeq,
      pollResponseSeq: this._pollResponseSeq,
      lastDataAgeMs: this._lastDataTime ? Date.now() - this._lastDataTime : null,
      reconnectAttempt: this._reconnectAttempt,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Initialize and connect to Infinite Flight.
   * @param {Function} successCallback - Called when fully connected and ready to poll.
   * @param {{ host: string, port?: number }} params
   */
  init(successCallback, params = {}) {
    this._successCallback = successCallback;
    let h = params.host ? params.host.trim() : '127.0.0.1';
    if (h === 'localhost') h = '127.0.0.1';
    this._host = h;
    this._port = params.port || DEFAULT_PORT;
    console.log(`[IFConnect] Connecting to ${this._host}:${this._port}...`);
    runtimeTrace("ifconnect.init", {
      source: "FlightSession.connect",
      host: this._host,
      port: this._port,
      pollQueueSize: this._pollQ.length,
    }, { throttleMs: 0 });
    this._fetchManifest();
  }

  /**
   * Send a SET command to IF for a writable parameter.
   * Encodes the value according to the manifest data type for the command.
   *
   * @param {string} commandName - The IF Connect parameter name (e.g. "aircraft/0/systems/signs/seatbelt")
   * @param {boolean|number|string} value - The value to write
   * @returns {boolean} true if the command was sent, false if not connected or unknown
   */
  set(commandName, value) {
    if (!this._isConnected || !this._pollSocket) {
      console.warn('[IFConnect] set() called but not connected:', commandName);
      return false;
    }
    const cmdInfo = this._manifestByName[commandName];
    if (!cmdInfo) {
      console.warn('[IFConnect] set() — unknown command (not in manifest):', commandName);
      return false;
    }

    try {
      let valueBuf;
      switch (cmdInfo.type) {
        case DataType.BOOLEAN:
          valueBuf = Buffer.alloc(1);
          valueBuf.writeUInt8(value ? 1 : 0, 0);
          break;
        case DataType.INTEGER:
          valueBuf = Buffer.alloc(4);
          valueBuf.writeInt32LE(Math.round(value), 0);
          break;
        case DataType.FLOAT:
          valueBuf = Buffer.alloc(4);
          valueBuf.writeFloatLE(value, 0);
          break;
        case DataType.DOUBLE:
          valueBuf = Buffer.alloc(8);
          valueBuf.writeDoubleLE(value, 0);
          break;
        case DataType.STRING: {
          const strBuf = Buffer.from(String(value), 'utf8');
          valueBuf = Buffer.alloc(4 + strBuf.length);
          valueBuf.writeUInt32LE(strBuf.length, 0);
          strBuf.copy(valueBuf, 4);
          break;
        }
        default:
          console.warn('[IFConnect] set() — unsupported type:', cmdInfo.type);
          return false;
      }

      // Header: [Int32LE: cmdCode][Int8: 1=SET][Int32LE: dataLen]
      const header = Buffer.alloc(9);
      header.writeInt32LE(cmdInfo.command, 0);
      header.writeInt8(1, 4); // SET flag
      header.writeInt32LE(valueBuf.length, 5);

      this._pollSocket.write(Buffer.concat([header, valueBuf]));
      console.log(`[IFConnect] SET ${commandName} = ${value}`);
      return true;
    } catch (e) {
      console.warn('[IFConnect] set() — write error:', e.message);
      return false;
    }
  }

  /**
   * Register a command name to be polled continuously.
   * Only commands present in the manifest will actually be polled.
   */
  pollRegister(cmd) {
    if (this._manifestByName[cmd] && !this._pollQ.includes(cmd)) {
      this._pollQ.push(cmd);
      runtimeTrace("ifconnect.poll_register", {
        source: "FlightSession.connect",
        command: cmd,
        pollQueueSize: this._pollQ.length,
      }, { throttleMs: this._pollQ.length === 1 ? 0 : 10000 });
      // If polling was stalled (e.g. empty queue), restart it
      if (!this._isPollWaiting && this._isConnected && this._pollSocket) {
        this._sendNextPoll();
      }
    }
  }

  /**
   * Gracefully close all connections and reset state.
   * NOTE: This intentionally preserves event listeners so that the useTelemetry
   * hook can remain subscribed across reconnections.
   * @param {Function} [callback]
   */
  close(callback) {
    console.log('[IFConnect] Closing connection');
    runtimeTrace("ifconnect.close", {
      source: "FlightSession/ifConnect",
      ...this.getDiagnostics(),
    }, { throttleMs: 0 });
    this._isConnected = false;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    clearInterval(this._watchdogTimer);
    clearTimeout(this._mTimeout);

    const oldSocket = this._pollSocket;
    if (oldSocket) {
      this._pollSocket = null;
      try {
        oldSocket.destroy();
      } catch (e) {}
    }
    
    if (this._mSocket) {
      try {
        this._mSocket.destroy();
      } catch (e) {}
      this._mSocket = null;
    }

    this._resetState();
    if (callback) callback();
  }

  // ─── Internal: Manifest Phase ─────────────────────────────────────────────

  _fetchManifest() {
    this._mSocket = null;
    let mBuffer = null;
    let mStringLength = 0;
    let done = false;
    this._mTimeout = null;

    const cleanup = () => {
      clearTimeout(this._mTimeout);
      if (this._mSocket) {
        try {
          this._mSocket.destroy();
        } catch (e) {}
        this._mSocket = null;
      }
    };

    try {
      this._mSocket = TcpSocket.createConnection(
        { port: this._port, host: this._host },
        () => {
          console.log('[IFConnect] Manifest socket connected, requesting manifest...');
          runtimeTrace("ifconnect.manifest_connected", {
            source: "react-native-tcp-socket",
            host: this._host,
            port: this._port,
          }, { throttleMs: 0 });
          // Send manifest request: command -1, GET flag 0
          const buf = Buffer.alloc(5);
          buf.writeInt32LE(-1, 0);
          buf.writeInt8(0, 4);
          if (this._mSocket) this._mSocket.write(buf);
        }
      );
    } catch (e) {
      console.log('[IFConnect] TCP Manifest socket creation error (unsupported environment):', e);
      if (!done) {
        done = true;
        cleanup();
        this._emit('error', { message: 'TCP socket not supported in this environment' });
      }
      return;
    }

    this._mSocket.on('data', (rawData) => {
      if (done) return;
      const chunk = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
      mBuffer = mBuffer ? Buffer.concat([mBuffer, chunk]) : chunk;

      // Header is 12 bytes: cmdCode[4] + totalDataLen[4] + stringLen[4]
      if (mStringLength === 0 && mBuffer.length >= 12) {
        mStringLength = mBuffer.readInt32LE(8);
        console.log(`[IFConnect] Manifest string length: ${mStringLength}`);
      }

      if (mStringLength > 0 && mBuffer.length >= 12 + mStringLength) {
        done = true;
        const manifestStr = mBuffer.toString('utf8', 12, 12 + mStringLength);
        this._parseManifest(manifestStr);
        runtimeTrace("ifconnect.manifest_received", {
          source: "tcp.data",
          manifestBytes: mStringLength,
          commandsAvailable: Object.keys(this._manifestByName).length,
        }, { throttleMs: 0 });
        cleanup();
        // Proceed to open the poll socket after a brief delay
        // This ensures the simulator's TCP server has time to properly close the manifest session
        setTimeout(() => {
          if (this._isConnected || !done) return;
          this._openPollSocket();
        }, 500);
      }
    });

    this._mSocket.on('error', (err) => {
      if (done) return;
      console.log('[IFConnect] Manifest error:', err.message);
      done = true;
      cleanup();
      this._emit('error', { message: err.message });
    });

    this._mSocket.on('close', () => {
      if (!done) {
        console.log('[IFConnect] Manifest socket closed prematurely');
      }
    });

    // Abort if manifest takes too long
    this._mTimeout = setTimeout(() => {
      if (!done) {
        done = true;
        console.log('[IFConnect] Manifest fetch timed out');
        cleanup();
        this._emit('error', { message: 'Manifest fetch timed out. Is Infinite Flight running?' });
      }
    }, MANIFEST_TIMEOUT_MS);
  }

  _parseManifest(str) {
    this._manifestByName = {};
    this._manifestByCommand = {};
    const lines = str.split('\n');
    let count = 0;
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const command = parseInt(parts[0], 10);
      const type = parseInt(parts[1], 10);
      const name = parts[2] ? parts[2].trim() : null;
      if (!isNaN(command) && name) {
        this._manifestByCommand[command] = { name, type };
        this._manifestByName[name] = { command, type };
        count++;
      }
    }
    console.log(`[IFConnect] Manifest parsed: ${count} commands available`);
  }

  // ─── Internal: Poll Phase ─────────────────────────────────────────────────

  _openPollSocket() {
    console.log('[IFConnect] Opening poll socket...');

    let socket;
    try {
      socket = TcpSocket.createConnection(
        { port: this._port, host: this._host },
        () => {
          console.log('[IFConnect] Poll socket connected. Starting telemetry stream.');
          this._isConnected = true;
          this._receiveBuffer = null;
          this._isPollWaiting = false;
          this._lastDataTime = Date.now();
          runtimeTrace("ifconnect.poll_socket_connected", {
            source: "react-native-tcp-socket",
            host: this._host,
            port: this._port,
            pollQueueSize: this._pollQ.length,
          }, { throttleMs: 0 });

          // Fire success callback
          if (this._successCallback) {
            try {
              this._successCallback();
            } catch (e) {}
            this._successCallback = null;
          } else {
            this._emit('connect');
          }

          // Start polling
          this._sendNextPoll();

          // Start watchdog to detect silent drops
          this._startWatchdog();
        }
      );
      this._pollSocket = socket;
    } catch (e) {
      console.log('[IFConnect] TCP Poll socket creation error (unsupported environment):', e);
      this._emit('error', { message: 'TCP socket not supported in this environment' });
      return;
    }

    socket.on('data', (rawData) => {
      this._lastDataTime = Date.now();
      this._reconnectAttempt = 0;
      const chunk = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
      this._receiveBuffer = this._receiveBuffer
        ? Buffer.concat([this._receiveBuffer, chunk])
        : chunk;
      this._processReceivedData();
    });

    socket.on('error', (err) => {
      console.log('[IFConnect] Poll socket error:', err.message);
      if (this._pollSocket === socket && this._isConnected) {
        this._scheduleReconnect();
      }
    });

    socket.on('close', () => {
      console.log('[IFConnect] Poll socket closed');
      if (this._pollSocket === socket && this._isConnected) {
        this._scheduleReconnect();
      }
    });
  }

  _processReceivedData() {
    // Process all complete messages in the receive buffer
    while (this._receiveBuffer && this._receiveBuffer.length >= 8) {
      const dataLen = this._receiveBuffer.readInt32LE(4);
      const totalLen = 8 + dataLen;

      // Check if we have the full message
      if (this._receiveBuffer.length < totalLen) break;

      const cmdCode = this._receiveBuffer.readInt32LE(0);
      const cmdInfo = this._manifestByCommand[cmdCode];

      if (cmdInfo) {
        const value = this._decodeValue(cmdInfo.type, this._receiveBuffer, dataLen);
        if (value !== undefined) {
          this._pollResponseSeq += 1;
          runtimeTrace("ifconnect.poll_response", {
            source: "tcp.data",
            command: cmdInfo.name,
            pollResponseSeq: this._pollResponseSeq,
            pollRequestSeq: this._pollRequestSeq,
            pollQueueSize: this._pollQ.length,
          });
          this._emit('data', { command: cmdInfo.name, data: value });
        }
      }

      // Trim processed message from buffer
      if (totalLen < this._receiveBuffer.length) {
        this._receiveBuffer = this._receiveBuffer.slice(totalLen);
      } else {
        this._receiveBuffer = null;
      }

      // Mark as ready and schedule next poll on next tick
      this._isPollWaiting = false;
      // Use setImmediate-style via setTimeout(0) for non-blocking
      setTimeout(() => this._sendNextPoll(), 0);
      break; // Process one message per tick to avoid blocking
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
          return buffer.toString('utf8', offset + 4, offset + 4 + strLen);
        }
        case DataType.LONG:
          // readBigInt64LE returns a BigInt; convert to number for JS compatibility
          return Number(buffer.readBigInt64LE(offset));
        default:
          return undefined;
      }
    } catch (e) {
      return undefined;
    }
  }

  _sendNextPoll() {
    if (
      !this._isConnected ||
      !this._pollSocket ||
      this._isPollWaiting ||
      this._pollQ.length === 0
    ) {
      return;
    }

    // Find next command that exists in the manifest (some aircraft may not support all)
    let attempts = 0;
    let cmdInfo = null;

    while (attempts < this._pollQ.length) {
      const cmd = this._pollQ[this._pollIndex];
      this._pollIndex = (this._pollIndex + 1) % this._pollQ.length;
      cmdInfo = this._manifestByName[cmd];
      if (cmdInfo) break;
      attempts++;
    }

    if (!cmdInfo) return; // No supported commands found

    const buf = Buffer.alloc(5);
    buf.writeInt32LE(cmdInfo.command, 0);
    buf.writeInt8(0, 4); // GET flag

    try {
      this._pollSocket.write(buf);
      this._isPollWaiting = true;
      this._pollRequestSeq += 1;
      runtimeTrace("ifconnect.poll_request", {
        source: "setTimeout/tcp.write",
        command: this._manifestByCommand[cmdInfo.command]?.name || "unknown",
        pollRequestSeq: this._pollRequestSeq,
        pollResponseSeq: this._pollResponseSeq,
        pollQueueSize: this._pollQ.length,
      });
    } catch (e) {
      console.log('[IFConnect] Write error:', e);
      this._isPollWaiting = false;
      this._scheduleReconnect();
    }
  }

  // ─── Internal: Resilience ─────────────────────────────────────────────────

  _startWatchdog() {
    clearInterval(this._watchdogTimer);
    this._watchdogTimer = setInterval(() => {
      if (!this._isConnected) return;
      const staleTime = Date.now() - this._lastDataTime;
      runtimeTrace("ifconnect.watchdog_tick", {
        source: "setInterval",
        staleTimeMs: staleTime,
        ...this.getDiagnostics(),
      }, { throttleMs: 30000 });

      if (staleTime > WATCHDOG_STALE_FORCE_RECONNECT_MS) {
        console.log('[IFConnect] Watchdog: data stale for 15s — forcing poll socket recovery...');
        this._reconnectPollSocket('watchdog-stale-timeout');
      } else if (staleTime > WATCHDOG_STALE_RECONNECT_MS) {
        console.log('[IFConnect] Watchdog: data stale — scheduling reconnect...');
        this._scheduleReconnect('watchdog-stale');
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  _reconnectPollSocket(reason = 'unknown') {
    if (!this._isConnected) return;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    this._reconnectAttempt += 1;
    console.log(`[IFConnect] Rebuilding poll socket (reason: ${reason}, attempt ${this._reconnectAttempt})...`);
    runtimeTrace("ifconnect.poll_socket_rebuild", {
      source: "watchdog/socket",
      reason,
      ...this.getDiagnostics(),
    }, { throttleMs: 0 });
    this._emit('reconnecting', { message: 'Connection lost, reconnecting...' });
    this._receiveBuffer = null;
    this._isPollWaiting = false;
    this._lastDataTime = Date.now();

    const oldSocket = this._pollSocket;
    if (oldSocket) {
      this._pollSocket = null;
      try {
        oldSocket.destroy();
      } catch (e) {}
    }

    // Keep the manifest; just reopen the poll socket
    this._openPollSocket();
  }

  _scheduleReconnect(reason = 'unknown') {
    if (this._reconnectTimer) return; // Only one pending reconnect at a time

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._isConnected) return;
      this._reconnectPollSocket(reason);
    }, RECONNECT_DELAY_MS);
  }

  _resetState() {
    this._pollQ = [];
    this._pollIndex = 0;
    this._receiveBuffer = null;
    this._isPollWaiting = false;
    this._manifestByName = {};
    this._manifestByCommand = {};
    this._lastDataTime = 0;
    this._successCallback = null;
    this._reconnectAttempt = 0;
    this._pollRequestSeq = 0;
    this._pollResponseSeq = 0;
  }
}

// Export a singleton instance — this mirrors the ifc2 module's pattern
const ifConnect = new IFConnectClient();
export default ifConnect;
