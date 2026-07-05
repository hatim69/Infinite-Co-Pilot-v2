const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const IFC2 = require("ifc2");
const path = require("path");
const dgram = require("dgram");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../web-frontend")));

server.listen(3000, () => {
    console.log("[PROXY] Server running on http://localhost:3000");
    console.log("[PROXY] Awaiting Infinite Flight auto-discovery on UDP port 15000...");
    console.log("[PROXY] (If auto-discovery gets stuck, you can type your device IP directly in the dashboard UI!)");
});

let isConnected = false;
let lastDataTime = 0;
let currentIP = null;

const discoverySocket = dgram.createSocket('udp4');

discoverySocket.on('error', (err) => {
    console.error("[PROXY] Discovery socket error:", err);
});

discoverySocket.on('message', (msg) => {
    try {
        const data = JSON.parse(msg.toString());
        if (!isConnected && data.port && data.addresses) {
            // Filter out Tailscale/VPN (100.x.x.x) and Link-Local (169.254.x.x) IPs
            const ipv4s = data.addresses.filter(ip => {
                if (ip.includes(':')) return false; // skip IPv6
                if (ip.startsWith('100.')) return false; // skip VPN/Tailscale
                if (ip.startsWith('169.254.')) return false; // skip Link-Local
                return true;
            }).sort((a, b) => {
                // Prioritize standard private IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
                const getScore = (ip) => {
                    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return 1; 
                    return 2; 
                };
                return getScore(a) - getScore(b);
            });

            if (ipv4s.length > 0 && ipv4s[0] !== currentIP) {
                console.log(`[DISCOVERY] Found valid local device IP: ${ipv4s[0]}`);
                connectToIF(ipv4s[0]);
            }
        }
    } catch (e) {
        // Suppress parsing errors for non-JSON UDP noise
    }
});

// Explicitly bind to UDP port 15000 on all IPv4 addresses
try {
    discoverySocket.bind(15000, '0.0.0.0');
} catch (e) {
    console.error("[PROXY] Failed to bind discovery socket:", e);
}

function connectToIF(ip) {
    if (isConnected && currentIP === ip) return;
    
    // If we're switching IPs, clean up the previous connection
    if (isConnected) {
        console.log(`[PROXY] Closing previous connection to ${currentIP} to switch to ${ip}...`);
        try { IFC2.close(); } catch(e) {}
        isConnected = false;
    }

    isConnected = true;
    currentIP = ip;
    lastDataTime = Date.now(); // Feed the watchdog

    console.log(`[PROXY] Connecting to IFC2 at ${ip}:10112...`);
    io.emit("connection_status", { status: "connecting", ip: ip });
    
    try {
        IFC2.init(() => {
            console.log(`[PROXY] Successfully connected to Infinite Flight on ${ip}!`);
            io.emit("connection_status", { status: "connected", ip: ip });
            const polls = [
                "aircraft/0/indicated_airspeed", "aircraft/0/groundspeed", "aircraft/0/vertical_speed",
                "aircraft/0/altitude_msl", "aircraft/0/systems/landing_gear/state",
                "aircraft/0/systems/battery/main_battery/amp_draw", "aircraft/0/aircraft_id",
                "aircraft/0/is_on_ground", "aircraft/0/systems/flaps/state", 
                "aircraft/0/systems/spoilers/state", "aircraft/0/systems/signs/seatbelt",
                "aircraft/0/systems/signs/no_smoking", "aircraft/0/systems/load/total_weight",
                "simulator/time_local", "environment/temperature", "aircraft/0/systems/parking_brake/state",
                "aircraft/0/systems/engines/0/throttle_lever", "infiniteflight/nearest_airport",
                "aircraft/0/systems/apu/apu/state", "aircraft/0/systems/autopilot/on",
                "aircraft/0/systems/beacon_lights_switch", "aircraft/0/systems/nav_lights_switch",
                "aircraft/0/systems/strobe_lights_switch", "aircraft/0/systems/landing_lights_switch",
                "aircraft/0/is_pushback_active", "aircraft/0/name", "aircraft/0/livery",
                "aircraft/0/systems/engines/0/state"
            ];
            polls.forEach(p => { 
                try { IFC2.pollRegister(p); } catch(e) {} 
            });
        }, { host: ip, port: 10112 });
    } catch(e) {
        console.error("[PROXY] Connection initiation crashed:", e);
        isConnected = false;
        currentIP = null;
        io.emit("connection_status", { status: "disconnected" });
    }
}

// Fix for BigInt JSON serialization crash
BigInt.prototype.toJSON = function() { return Number(this); };

io.on("connection", (socket) => {
    // Tell the new client the current status
    socket.emit("connection_status", { 
        status: isConnected ? "connected" : "disconnected", 
        ip: currentIP 
    });

    // Listen for manual IP connection requests from the client
    socket.on("force_connect", (data) => {
        if (data && data.ip) {
            console.log(`[USER] Received manual connection request to IP: ${data.ip}`);
            // Prevent duplicate connection warning/leak if already connected to this IP
            if (isConnected && currentIP === data.ip) {
                console.log(`[PROXY] Already connected to ${data.ip}. Ignoring duplicate request.`);
                return;
            }
            // Force reset state to allow manual connection
            isConnected = false;
            connectToIF(data.ip);
        }
    });
});

function connectToIF(ip) {
    if (isConnected && currentIP === ip) return;
    
    // If we're switching IPs, clean up the previous connection
    if (isConnected) {
        console.log(`[PROXY] Closing previous connection to ${currentIP} to switch to ${ip}...`);
        try { IFC2.close(); } catch(e) {}
        isConnected = false;
    }

    isConnected = true;
    currentIP = ip;
    lastDataTime = Date.now(); // Feed the watchdog

    console.log(`[PROXY] Connecting to IFC2 at ${ip}:10112...`);
    io.emit("connection_status", { status: "connecting", ip: ip });
    
    try {
        IFC2.init(() => {
            console.log(`[PROXY] Successfully connected to Infinite Flight on ${ip}!`);
            io.emit("connection_status", { status: "connected", ip: ip });
            const polls = [
                "aircraft/0/indicated_airspeed", "aircraft/0/groundspeed", "aircraft/0/vertical_speed",
                "aircraft/0/altitude_msl", "aircraft/0/systems/landing_gear/state",
                "aircraft/0/systems/battery/main_battery/amp_draw", "aircraft/0/aircraft_id",
                "aircraft/0/is_on_ground", "aircraft/0/systems/flaps/state", 
                "aircraft/0/systems/spoilers/state", "aircraft/0/systems/signs/seatbelt",
                "aircraft/0/systems/signs/no_smoking", "aircraft/0/systems/load/total_weight",
                "simulator/time_local", "environment/temperature", "aircraft/0/systems/parking_brake/state",
                "aircraft/0/systems/engines/0/throttle_lever", "infiniteflight/nearest_airport",
                "aircraft/0/systems/apu/apu/state", "aircraft/0/systems/autopilot/on",
                "aircraft/0/systems/beacon_lights_switch", "aircraft/0/systems/nav_lights_switch",
                "aircraft/0/systems/strobe_lights_switch", "aircraft/0/systems/landing_lights_switch",
                "aircraft/0/is_pushback_active", "aircraft/0/name", "aircraft/0/livery",
                "aircraft/0/systems/engines/0/state",
                "aircraft/0/systems/engines/1/state",
                "aircraft/0/systems/engines/2/state",
                "aircraft/0/systems/engines/3/state"
            ];
            polls.forEach(p => { 
                try { IFC2.pollRegister(p); } catch(e) {} 
            });
        }, { host: ip, port: 10112 });
    } catch(e) {
        console.error("[PROXY] Connection initiation crashed:", e);
        isConnected = false;
        currentIP = null;
        io.emit("connection_status", { status: "disconnected" });
    }
}

// Preserve string serialization of BigInt to keep full precision on the client
const sanitize = (val) => (typeof val === 'bigint' ? val.toString() : val);

IFC2.eventEmitter.on("IFC2data", data => {
    lastDataTime = Date.now(); // Feed the watchdog to confirm data is flowing
    io.emit("telemetry_update", { command: data.command, data: sanitize(data.data) });
});

IFC2.eventEmitter.on("IFC2data", data => {
    lastDataTime = Date.now(); // Feed the watchdog to confirm data is flowing
    io.emit("telemetry_update", { command: data.command, data: data.data });
});

IFC2.eventEmitter.on("IFC2error", err => {
    console.error("[PROXY] IFC2 Error:", err);
    isConnected = false;
    currentIP = null;
    io.emit("connection_status", { status: "disconnected" });
});

// Watchdog: If we are connected but receive no data for 8 seconds, reset
setInterval(() => {
    if (isConnected && Date.now() - lastDataTime > 8000) {
        console.log("[PROXY] Connection hung (no telemetry data received for 8s). Resetting...");
        isConnected = false;
        currentIP = null;
        io.emit("connection_status", { status: "disconnected" });
    }
}, 4000);