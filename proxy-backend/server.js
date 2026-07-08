const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const IFC2 = require("ifc2");
const path = require("path");
const dgram = require("dgram");
const net = require("net");
const os = require("os");

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

const discoveredDevices = new Map();
let selectedDeviceId = null;

// Clean up offline devices periodically (devices that haven't broadcasted in 10s)
setInterval(() => {
	const now = Date.now();
	let changed = false;
	for (const [id, dev] of discoveredDevices.entries()) {
		if (now - dev.lastSeen > 10000) {
			discoveredDevices.delete(id);
			changed = true;
			console.log(`[DISCOVERY] Device offline (removed): ${dev.deviceName} (${id})`);
		}
	}
	if (changed) {
		io.emit("discovered_devices", Array.from(discoveredDevices.values()));
	}
}, 2000);

// Track failed connection attempts to avoid getting stuck trying to connect to unreachable IPs
const failedIPs = new Map();
const FAILURE_BLACKLIST_DURATION_MS = 20000; // 20 seconds blacklist

function markIPAsFailed(ip) {
	console.log(`[PROXY] Marking IP ${ip} as failed/unreachable.`);
	failedIPs.set(ip, Date.now());
}

function getLocalIPv4s() {
	const interfaces = os.networkInterfaces();
	const ips = [];
	for (const name of Object.keys(interfaces)) {
		for (const netInterface of interfaces[name]) {
			if (netInterface.family === 'IPv4' && !netInterface.internal) {
				ips.push(netInterface.address);
			}
		}
	}
	return ips;
}

function getSubnetMatchScore(ip, localIPs) {
	let maxMatch = 0;
	const ipParts = ip.split('.');
	for (const localIP of localIPs) {
		const localParts = localIP.split('.');
		let matchCount = 0;
		for (let i = 0; i < 4; i++) {
			if (ipParts[i] === localParts[i]) {
				matchCount++;
			} else {
				break;
			}
		}
		if (matchCount > maxMatch) {
			maxMatch = matchCount;
		}
	}
	return maxMatch;
}

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

discoverySocket.on("message", (msg, rinfo) => {
	try {
		const data = JSON.parse(msg.toString());
		if (data.addresses && data.addresses.length > 0) {
			const devId = (data.deviceId || data.deviceName || 'unknown-device').trim();
			const devName = (data.deviceName || data.deviceId || 'Unknown Device').trim();
			
			const addresses = data.addresses.map(ip => ip.trim());
			if (rinfo && rinfo.address && !addresses.includes(rinfo.address)) {
				addresses.push(rinfo.address);
			}

			const device = {
				deviceId: devId,
				deviceName: devName,
				addresses: addresses,
				lastSeen: Date.now(),
				aircraft: data.aircraft || "",
				livery: data.livery || ""
			};
			
			const isNew = !discoveredDevices.has(devId);
			discoveredDevices.set(devId, device);
			
			if (isNew) {
				console.log(`[DISCOVERY] Discovered device: ${devName} (${devId})`);
				io.emit("discovered_devices", Array.from(discoveredDevices.values()));
			}
			
			// Auto-connection logic
			if (!isConnected) {
				// Case 1: The user has selected a device
				if (selectedDeviceId) {
					if (devId === selectedDeviceId) {
						const localIPs = getLocalIPv4s();
						const sortedIPs = [...device.addresses]
							.filter(ip => {
								if (ip.includes(":")) return false; // Skip IPv6
								if (ip.startsWith("100.")) return false; // Skip Tailscale/VPN
								if (ip.startsWith("169.254.")) return false; // Skip Link-Local autoconfig
								return true;
							})
							.sort((a, b) => {
								const aFailed = failedIPs.has(a) && (Date.now() - failedIPs.get(a) < FAILURE_BLACKLIST_DURATION_MS);
								const bFailed = failedIPs.has(b) && (Date.now() - failedIPs.get(b) < FAILURE_BLACKLIST_DURATION_MS);
								if (aFailed !== bFailed) return aFailed ? 1 : -1;
								return getSubnetMatchScore(b, localIPs) - getSubnetMatchScore(a, localIPs);
							});
						
						if (sortedIPs.length > 0) {
							const bestIP = sortedIPs[0];
							const failedTime = failedIPs.get(bestIP);
							const isBestIPBlacklisted = failedTime && (Date.now() - failedTime < FAILURE_BLACKLIST_DURATION_MS);
							
							if (!isBestIPBlacklisted) {
								console.log(`[DISCOVERY] Connecting to selected device ${devName} at ${bestIP}...`);
								connectToIF(bestIP);
							}
						}
					}
				}
				// Case 2: No device selected, but exactly ONE device is found on network (auto-select)
				else if (discoveredDevices.size === 1) {
					selectedDeviceId = devId;
					console.log(`[DISCOVERY] Auto-selecting single discovered device: ${devName}`);
					io.emit("discovered_devices", Array.from(discoveredDevices.values()));
					
					const localIPs = getLocalIPv4s();
					const sortedIPs = [...device.addresses]
						.filter(ip => {
							if (ip.includes(":")) return false;
							if (ip.startsWith("100.")) return false;
							if (ip.startsWith("169.254.")) return false;
							return true;
						})
						.sort((a, b) => {
							const aFailed = failedIPs.has(a) && (Date.now() - failedIPs.get(a) < FAILURE_BLACKLIST_DURATION_MS);
							const bFailed = failedIPs.has(b) && (Date.now() - failedIPs.get(b) < FAILURE_BLACKLIST_DURATION_MS);
							if (aFailed !== bFailed) return aFailed ? 1 : -1;
							return getSubnetMatchScore(b, localIPs) - getSubnetMatchScore(a, localIPs);
						});

					if (sortedIPs.length > 0) {
						const bestIP = sortedIPs[0];
						const failedTime = failedIPs.get(bestIP);
						const isBestIPBlacklisted = failedTime && (Date.now() - failedTime < FAILURE_BLACKLIST_DURATION_MS);
						
						if (!isBestIPBlacklisted) {
							connectToIF(bestIP);
						}
					}
				}
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

	// Send current discovered devices list
	socket.emit("discovered_devices", Array.from(discoveredDevices.values()));

	socket.on("select_device", (data) => {
		const devId = data ? data.deviceId : null;
		console.log(`[USER] Selected device ID: ${devId}`);
		
		if (devId !== selectedDeviceId) {
			selectedDeviceId = devId;
			
			// Disconnect current session to let it bind to the new selection
			isConnected = false;
			currentDeviceIP = null;
			cleanupIFC2();
			io.emit("connection_status", { status: "disconnected" });
			
			if (selectedDeviceId) {
				const device = discoveredDevices.get(selectedDeviceId);
				if (device && device.addresses.length > 0) {
					const localIPs = getLocalIPv4s();
					const sortedIPs = [...device.addresses]
						.filter(ip => {
							if (ip.includes(":")) return false;
							if (ip.startsWith("100.")) return false;
							if (ip.startsWith("169.254.")) return false;
							return true;
						})
						.sort((a, b) => {
							const aFailed = failedIPs.has(a) && (Date.now() - failedIPs.get(a) < FAILURE_BLACKLIST_DURATION_MS);
							const bFailed = failedIPs.has(b) && (Date.now() - failedIPs.get(b) < FAILURE_BLACKLIST_DURATION_MS);
							if (aFailed !== bFailed) return aFailed ? 1 : -1;
							return getSubnetMatchScore(b, localIPs) - getSubnetMatchScore(a, localIPs);
						});
					
					if (sortedIPs.length > 0) {
						connectToIF(sortedIPs[0]);
					}
				}
			}
		}
	});

	socket.on("force_connect", (data) => {
		if (data && data.ip) {
			const manualIP = data.ip.trim();
			console.log(
				`[USER] Received manual connection request to IP: ${manualIP}`,
			);
			// Reset active state to force standard TCP handshake
			isConnected = false;
			selectedDeviceId = null; // Clear auto-selected device if user manually overrides
			connectToIF(manualIP);
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
			
			// Only treat manifest error as fatal connection failure
			if (msg.context === "manifest" && isConnected) {
				console.log("[PROXY] Manifest connection failed. Resetting connection...");
				if (currentDeviceIP) {
					markIPAsFailed(currentDeviceIP);
				}
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
			`[PROXY] Connection dropped silently (no incoming data for 8s) to ${currentDeviceIP || 'unknown'}. Resetting...`,
		);
		if (currentDeviceIP) {
			markIPAsFailed(currentDeviceIP);
		}
		isConnected = false;
		currentDeviceIP = null;
		cleanupIFC2();
		io.emit("connection_status", { status: "disconnected" });
	}
}, 4000);
