import React, { useState } from 'react';
import { Link2, Smartphone } from 'lucide-react';

const SimulatorLink = ({ 
  status, 
  ip, 
  onManualConnect, 
  discoveredDevices = [], 
  onSelectDevice, 
  onDisconnectDevice 
}) => {
  const [manualIp, setManualIp] = useState('');

  const handleConnect = (e) => {
    e.preventDefault();
    if (manualIp) onManualConnect(manualIp);
  };

  const isConnected = status === 'FLIGHT LINK ACTIVE';
  const isConnecting = status === 'CONNECTING...';

  return (
    <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-6 flex flex-col justify-between transition-all duration-300">
      <div>
        <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3 justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Simulator Link</h2>
          </div>
          {isConnected && (
            <button 
              onClick={onDisconnectDevice}
              className="text-[10px] uppercase font-bold tracking-widest text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700 hover:border-rose-500/30 px-2 py-0.5 rounded transition"
            >
              Disconnect
            </button>
          )}
        </div>

        {isConnected ? (
          <div className="flex flex-col gap-2 py-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></div>
              <span className="text-teal-400 font-bold tracking-wide text-sm">FLIGHT LINK ACTIVE</span>
            </div>
            <p className="text-xs text-slate-400">
              Receiving live telemetry from <span className="font-mono text-slate-300">{ip}</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status</div>
              <div className={`font-bold text-sm ${isConnecting ? 'text-amber-400' : 'text-slate-400'}`}>
                {status} {ip && <span className="font-mono text-xs opacity-85">({ip})</span>}
              </div>
            </div>

            {/* Discovered Devices Section */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Discovered Devices ({discoveredDevices.length})
              </div>
              
              {discoveredDevices.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                  {discoveredDevices.map((device) => (
                    <div 
                      key={device.deviceId}
                      className="flex items-center justify-between bg-slate-900/60 hover:bg-slate-900/80 border border-slate-700/50 hover:border-teal-500/30 p-2.5 rounded-lg transition duration-200"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-teal-500/10 rounded-md">
                          <Smartphone className="w-3.5 h-3.5 text-teal-400" />
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-semibold text-slate-200">{device.deviceName || 'Unknown Device'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {device.addresses && device.addresses.length > 0 && (
                              <>
                                {device.addresses.find(ip => ip.includes('.') && ip !== '127.0.0.1') || device.addresses[0]}
                                {device.addresses.length > 1 && (
                                  <span className="opacity-60 ml-1">
                                    (+{device.addresses.length - 1} more)
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => onSelectDevice(device.deviceId)}
                        className="bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 hover:border-teal-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition active:scale-95"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 px-4 bg-slate-900/30 border border-dashed border-slate-700/50 rounded-lg text-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping mb-2.5"></div>
                  <div className="text-[11px] font-medium text-slate-400 font-sans">Scanning network...</div>
                  <div className="text-[10px] text-slate-500 mt-1 max-w-[200px] font-sans">
                    Open Infinite Flight on your device and enable "Infinite Flight Connect" in settings.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!isConnected && (
        <form onSubmit={handleConnect} className="flex flex-col gap-2 mt-4 border-t border-slate-700/30 pt-4">
          <label htmlFor="ip-address" className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            Manual Override IP
          </label>
          <div className="flex gap-2">
            <input
              id="ip-address"
              type="text"
              placeholder="192.168.1.5"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              className="bg-slate-900/60 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono w-full focus:outline-none focus:border-teal-500 transition-colors"
            />
            <button
              type="submit"
              className="bg-slate-700/30 hover:bg-teal-600/20 text-slate-300 hover:text-teal-400 border border-slate-700 hover:border-teal-500/40 font-semibold px-3 py-1.5 rounded text-xs transition active:scale-95 whitespace-nowrap"
            >
              Connect
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SimulatorLink;
