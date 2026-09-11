/**
 * tcp-socket.web.js
 * Web stub for react-native-tcp-socket.
 * Provides a mock socket interface so imports succeed on web without throwing.
 */

import { EventEmitter } from "events";

class MockTcpSocket extends EventEmitter {
  connect(options, callback) {
    if (typeof callback === "function") callback();
    return this;
  }
  write(data, encoding, callback) {
    if (typeof callback === "function") callback();
    return true;
  }
  end(data, encoding) {
    this.emit("close");
  }
  destroy() {
    this.emit("close");
  }
  pause() { return this; }
  resume() { return this; }
  setTimeout(timeout, callback) { return this; }
  setNoDelay(noDelay) { return this; }
  setKeepAlive(enable, initialDelay) { return this; }
  address() {
    return { address: "127.0.0.1", port: 10112, family: "IPv4" };
  }
}

const TcpSocket = {
  createConnection: (options, callback) => {
    const socket = new MockTcpSocket();
    if (typeof callback === "function") {
      setTimeout(callback, 10);
    }
    return socket;
  },
  connect: (options, callback) => {
    return TcpSocket.createConnection(options, callback);
  },
  createServer: () => new EventEmitter(),
  Socket: MockTcpSocket,
};

export default TcpSocket;
export { MockTcpSocket as Socket };
