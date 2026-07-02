const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const IFC2 = require("ifc2");
const path = require("path");

const HTTP_PORT = 3000;
const TARGET_IP = '192.168.29.66';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Serve your frontend files
app.use(express.static(path.join(__dirname, "../web-frontend")));

server.listen(HTTP_PORT, () => {
  console.log(`[PROXY] Server running on http://localhost:${HTTP_PORT}`);
});

// Initialize IFC2
IFC2.init(() => {
    console.log("[PROXY] ✓ Device connected successfully");
}, { host: TARGET_IP, port: 10112 });

// Wait for the manifest to load
IFC2.eventEmitter.once("IFC2manifest", () => {
    console.log("[PROXY] Manifest loaded. Waiting 1s to stabilize...");
    setTimeout(() => {
        const polls = [
            "aircraft/0/indicated_airspeed",
            "aircraft/0/altitude_msl",
            "aircraft/0/systems/landing_gear/state"
        ];
        polls.forEach(poll => {
            try { IFC2.pollRegister(poll); } catch(e) {}
        });
        console.log("[PROXY] Polling active");
    }, 1000);
});

// Forward data to browser
IFC2.eventEmitter.on("IFC2data", data => {
    io.emit("telemetry_update", { command: data.command, data: data.data });
});

IFC2.eventEmitter.on("IFC2error", err => {
    console.error("[PROXY] IFC2 error:", err);
});