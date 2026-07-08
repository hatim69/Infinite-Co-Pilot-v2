const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const IFC2 = require("ifc2");
const path = require("path");
const dgram = require("dgram");
const net = require("net");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const originalEnqueueCommand = IFC2.enqueueCommand.bind(IFC2);
IFC2.enqueueCommand = (cmd, action = IFC2.GETCMD, val) => {
	const manifestEntry = IFC2?.infiniteFlight?.manifestByName?.[cmd];

	if (!manifestEntry) {
		console.warn(`[PROXY] Skipping unavailable Connect command: ${cmd}`);
		return;
	}

	return originalEnqueueCommand(cmd, action, val);
};

// Serve static frontend files from web-frontend directory
app.use(express.static(path.join(__dirname, "../web-frontend")));
server.listen(3000, () => {
	console.log("[PROXY] Server running on http://localhost:3000");
	console.log(
		"[PROXY] Awaiting Infinite Flight auto-discovery on UDP port 15000...",
	);
	console.log(
		"[PROXY] (If auto-discovery gets stuck, you can type your device IP directly in the dashboard UI!)",
	);
});

let isConnected = false;
let lastDataTime = 0;
let currentDeviceIP = null;

function cleanupIFC2() {
	console.log("[PROXY] Cleaning up IFC2 connection and listeners...");
	
	// Reset IFC2 internal state
	if (IFC2) {
		IFC2.isConnected = false;
		IFC2.isWaiting = false;
		IFC2.isPollWaiting = false;
		IFC2.q = [];
		IFC2.pollQ = [];
		IFC2.waitList = [];
		IFC2.ifData = {};
		IFC2.pollBuffer = null;
		IFC2.qBuffer = null;

		// Clean up sockets
		const socketNames = ['clientSocket', 'manifestSocket', 'pollSocket'];
		socketNames.forEach(sName => {
			if (IFC2.infiniteFlight && IFC2.infiniteFlight[sName]) {
				const socket = IFC2.infiniteFlight[sName];
				try {
					socket.destroy();
					socket.removeAllListeners();
				} catch (e) {
					console.error(`[PROXY] Error destroying ${sName}:`, e);
				}
				delete IFC2.infiniteFlight[sName];
				IFC2.infiniteFlight[sName] = new net.Socket();
			}
		});

		// Reset manifest variables
		if (IFC2.infiniteFlight) {
			IFC2.infiniteFlight.manifestData = "";
			IFC2.infiniteFlight.manifestByName = {};
			IFC2.infiniteFlight.manifestByCommand = {};
			IFC2.infiniteFlight.manifestLength = 0;
			IFC2.infiniteFlight.manifestBuffer = null;
		}
	}
}

const discoverySocket = dgram.createSocket("udp4");
discoverySocket.bind(15000, "0.0.0.0");

discoverySocket.on("message", (msg) => {
	try {
		const data = JSON.parse(msg.toString());
		if (!isConnected && data.addresses) {
			// Priority sorting: Skip VPNs/Tailscale (100.x.x.x) and Link-Local (169.x.x.x)
			const ipv4s = data.addresses
				.filter((ip) => {
					if (ip.includes(":")) return false; // Skip IPv6
					if (ip.startsWith("100.")) return false; // Skip Tailscale/VPN
					if (ip.startsWith("169.254.")) return false; // Skip Link-Local autoconfig
					return true;
				})
				.sort((a, b) => {
					const getScore = (ip) => {
						if (
							ip.startsWith("192.168.") ||
							ip.startsWith("10.") ||
							ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
						)
							return 1;
						return 2;
					};
					return getScore(a) - getScore(b);
				});

			if (ipv4s.length > 0) {
				console.log(
					`[DISCOVERY] Found valid local device IP: ${ipv4s[0]}`,
				);
				connectToIF(ipv4s[0]);
			}
		}
	} catch (e) {
		// Suppress parsing errors on corrupted UDP frames
	}
});

io.on("connection", (socket) => {
	// Send immediate connection state status to the frontend
	socket.emit("connection_status", {
		status: isConnected ? "connected" : "disconnected",
		ip: currentDeviceIP,
	});

	socket.on("force_connect", (data) => {
		if (data && data.ip) {
			console.log(
				`[USER] Received manual connection request to IP: ${data.ip}`,
			);
			// Reset active state to force standard TCP handshake
			isConnected = false;
			connectToIF(data.ip);
		}
	});
});

const isCommandSupported = (cmd) => {
	try {
		if (IFC2 && IFC2.infiniteFlight && IFC2.infiniteFlight.manifestByName) {
			return IFC2.infiniteFlight.manifestByName[cmd] !== undefined;
		}
	} catch (e) {}
	return true; // Default fallback to allow standard processing
};

function connectToIF(ip) {
	if (isConnected && currentDeviceIP === ip) return;

	// Broadcast connecting state to frontend
	io.emit("connection_status", { status: "connecting", ip: ip });

	cleanupIFC2();

	isConnected = true;
	currentDeviceIP = ip;
	lastDataTime = Date.now();

	console.log(`[PROXY] Connecting to IFC2 at ${ip}:10112...`);

	try {
		IFC2.init(
			() => {
				console.log(
					`[PROXY] Successfully connected to Infinite Flight on ${ip}!`,
				);
				io.emit("connection_status", { status: "connected", ip: ip });

				// Master parameters list
				const polls = [
					"aircraft/0/indicated_airspeed",
					"aircraft/0/groundspeed",
					"aircraft/0/vertical_speed",
					"aircraft/0/altitude_msl",
					"aircraft/0/altitude_agl",
					"aircraft/0/systems/landing_gear/state",
					"aircraft/0/systems/battery/main_battery/amp_draw",
					"aircraft/0/systems/battery/main_battery/voltage",
					"aircraft/0/aircraft_id",
					"aircraft/0/is_on_ground",
					"aircraft/0/systems/flaps/state",
					"aircraft/0/systems/spoilers/state",
					"aircraft/0/systems/signs/seatbelt",
					"aircraft/0/systems/signs/no_smoking",
					"aircraft/0/systems/load/total_weight",
					"simulator/time_local",
					"environment/temperature",
					"aircraft/0/systems/parking_brake/state",
					"aircraft/0/systems/engines/0/throttle_lever",
					"infiniteflight/nearest_airport",
					"aircraft/0/systems/apu/apu/state",
					"aircraft/0/systems/autopilot/on",
					"aircraft/0/systems/beacon_lights_switch",
					"aircraft/0/systems/nav_lights_switch",
					"aircraft/0/systems/strobe_lights_switch",
					"aircraft/0/systems/landing_lights_switch",
					"aircraft/0/is_pushback_active",
					"aircraft/0/name",
					"aircraft/0/livery",
					"aircraft/0/systems/engines/0/state",
					"aircraft/0/systems/engines/1/state",
					"aircraft/0/systems/engines/2/state",
					"aircraft/0/systems/engines/3/state",
				];

				polls.forEach((p) => {
					try {
						// CRITICAL CRASH PROTECTION: Skip if parameter is missing from active aircraft manifest
						if (!isCommandSupported(p)) {
							console.log(
								`[PROXY] Skipping unsupported parameter for this aircraft: ${p}`,
							);
							return;
						}
						IFC2.pollRegister(p);
					} catch (e) {
						console.error(
							`[PROXY] Failed to register poll ${p}:`,
							e,
						);
					}
				});
			},
			{ host: ip, port: 10112 },
		);
	} catch (e) {
		console.error("[PROXY] Connection handshake crashed:", e);
		isConnected = false;
		io.emit("connection_status", { status: "disconnected" });
	}
}

// Serializes BigInt values as strings to preserve precision for WebSockets
BigInt.prototype.toJSON = function () {
	return this.toString();
};

IFC2.eventEmitter.on("IFC2data", (data) => {
	lastDataTime = Date.now(); // Feed the watchdog
	io.emit("telemetry_update", { command: data.command, data: data.data });
});

// Listen to IFC2 messages and errors
IFC2.eventEmitter.on("IFC2msg", (msg) => {
	if (msg) {
		if (msg.type === "error") {
			console.error(`[PROXY] IFC2 Connection Error (${msg.context}):`, msg.msg);
			if (isConnected) {
				isConnected = false;
				currentDeviceIP = null;
				cleanupIFC2();
				io.emit("connection_status", { status: "disconnected" });
			}
		} else {
			console.log(`[PROXY] IFC2 Info (${msg.context}):`, msg.msg);
		}
	}
});

// Detects silent TCP socket freezes and triggers automatic reconnections
setInterval(() => {
	if (isConnected && Date.now() - lastDataTime > 8000) {
		console.log(
			"[PROXY] Connection dropped silently (no incoming data for 8s). Resetting...",
		);
		isConnected = false;
		currentDeviceIP = null;
		cleanupIFC2();
		io.emit("connection_status", { status: "disconnected" });
	}
}, 4000);
