const ifc = require('ifc2');
const EventEmitter = require('events');

class IFC2Handler extends EventEmitter {
    constructor() {
        super();
        this.connected = false;
        this.telemetryInterval = null;
    }

    async connect(deviceIP) {
        console.log(`[IFC2] Initializing connection to ${deviceIP}...`);
        
        // Use the .init() method instead of 'new'
        ifc.init(deviceIP);

        // Map library events to your handler's events
        ifc.on('connect', () => {
            this.connected = true;
            console.log('[IFC2] Successfully connected');
            this.emit('connected');
        });

        ifc.on('error', (err) => {
            console.error('[IFC2] Error:', err);
            this.emit('error', err);
        });
    }

    subscribeTelemetry(polls, callback) {
        if (!this.connected) return;

        this.telemetryInterval = setInterval(async () => {
            const telemetryData = {};
            for (const poll of polls) {
                try {
                    // Using the library's built-in get command
                    const val = await ifc.get(poll);
                    telemetryData[poll] = val;
                } catch (e) {
                    telemetryData[poll] = null;
                }
            }
            callback(telemetryData);
        }, 1000);
    }
}

module.exports = IFC2Handler;