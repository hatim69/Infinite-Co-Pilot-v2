const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const IFC2 = require("ifc2");
const path = require("path");
const dgram = require("dgram");

const HTTP_PORT = 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "../web-frontend")));

server.listen(HTTP_PORT, () => {
    console.log("[PROXY] Server running on http://localhost:3000");
});

let isConnected = false;

const discoverySocket = dgram.createSocket('udp4');
discoverySocket.bind(15000, () => {
    console.log("[PROXY] Listening for Simulator broadcasts...");
});

discoverySocket.on('message', (msg) => {
    try {
        const data = JSON.parse(msg.toString());
        if (!isConnected && data.port) {
            console.log("[PROXY] Auto-discovery detected Simulator!");
            connectToIF(data.addresses[0]); 
        }
    } catch (e) {}
});

function connectToIF(ip) {
    if (isConnected) return;
    isConnected = true;
    discoverySocket.close();

    console.log(`[PROXY] Connecting to IFC2 at ${ip}:10112...`);

    IFC2.init(() => {
        console.log("[PROXY] ✓ IFC2 connection established");
    }, { host: ip, port: 10112 });

    IFC2.eventEmitter.once("IFC2manifest", () => {
        setTimeout(() => {
            const polls = [
                "aircraft/0/indicated_airspeed",
                "aircraft/0/groundspeed",
                "aircraft/0/vertical_speed",
                "aircraft/0/altitude_msl",
                "aircraft/0/systems/landing_gear/state",
                "aircraft/0/systems/battery/main_battery/voltage",
                "aircraft/0/aircraft_id",
                "aircraft/0/is_on_ground",
                "aircraft/0/systems/flaps/state",
                "aircraft/0/systems/spoilers/state",
                "aircraft/0/systems/signs/seatbelt"
            ];
            polls.forEach(poll => { try { IFC2.pollRegister(poll); } catch(e) {} });
            console.log("[PROXY] All SOP telemetry polls active.");
        }, 500); 
    });
}

IFC2.eventEmitter.on("IFC2data", data => {
    const serializeData = (val) => {
        if (typeof val === 'bigint') return Number(val);
        if (val !== null && typeof val === 'object') {
            const newVal = Array.isArray(val) ? [] : {};
            for (const key in val) {
                newVal[key] = serializeData(val[key]);
            }
            return newVal;
        }
        return val;
    };

    io.emit("telemetry_update", { 
        command: data.command, 
        data: serializeData(data.data) 
    });
});

IFC2.eventEmitter.on("IFC2error", err => {
    console.error("[PROXY] IFC2 error:", err);
});