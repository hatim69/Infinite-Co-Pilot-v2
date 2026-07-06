import React, { useState } from 'react';

const SimulatorLink = ({ status, ip, onManualConnect }) => {
  const [manualIp, setManualIp] = useState('');

  const handleConnect = (e) => {
    e.preventDefault();
    if (manualIp) onManualConnect(manualIp);
  };

  const isConnected = status === 'FLIGHT LINK ACTIVE';

  return (
    <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-6 h-full flex flex-col justify-center">
      <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Simulator Link</h2>
      </div>

      {isConnected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></div>
            <span className="text-teal-400 font-bold tracking-wide">Flight Link Active</span>
          </div>
          <p className="text-sm text-slate-400">Receiving live telemetry from {ip}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Status</div>
            <div className="text-amber-400 font-bold">{status}</div>
          </div>
          
          <form onSubmit={handleConnect} className="flex flex-col gap-2 mt-2">
            <label htmlFor="ip-address" className="text-xs text-slate-500 uppercase tracking-wider">Manual Override IP</label>
            <div className="flex gap-2">
              <input
                id="ip-address"
                type="text"
                placeholder="192.168.1.5"
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono w-full focus:outline-none focus:border-teal-500 transition-colors"
              />
              <button
                type="submit"
                className="bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-600/50 hover:border-teal-500 font-semibold px-4 py-2 rounded text-sm transition active:scale-95 whitespace-nowrap"
              >
                Connect
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default SimulatorLink;
