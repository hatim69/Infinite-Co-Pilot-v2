import React, { useState } from 'react';
import { speechManager } from '../../utils/speech';

const ConnectionStatus = ({ status, ip, onManualConnect }) => {
  const [manualIp, setManualIp] = useState('');
  const [audioUnlocked, setAudioUnlocked] = useState(speechManager.audioUnlocked);

  const handleConnect = (e) => {
    e.preventDefault();
    onManualConnect(manualIp);
  };

  const handleAudioUnlock = () => {
    speechManager.unlockAudio();
    setAudioUnlocked(true);
  };

  const isConnected = status === 'FLIGHT LINK ACTIVE';
  const isConnecting = status === 'CONNECTING...';

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-700 pb-4">
      <div>
        <div className="flex items-center gap-3">
          <img src="/favicon.jpeg" alt="Logo" className="w-8 h-8 rounded" />
          <h1 className="text-2xl font-bold tracking-tight text-teal-400">FlightDeck</h1>
        </div>
        <p className="text-xs text-slate-400 italic mt-1 mb-2">Your intelligent second seat</p>
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>Status:</span>
          <span className={`font-bold ${isConnected ? 'text-teal-400' : isConnecting ? 'text-amber-400' : 'text-amber-500'}`} aria-live="polite">
            {status} {ip && `(${ip})`}
          </span>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <form onSubmit={handleConnect} className="flex items-center gap-2 bg-slate-800 p-2 rounded-lg border border-slate-700 text-sm focus-within:border-teal-500 transition-colors">
          <label htmlFor="manual-ip-input" className="sr-only">Manual IP Address</label>
          <span className="text-xs text-slate-400 hidden sm:inline" aria-hidden="true">IP:</span>
          <input 
            type="text" 
            id="manual-ip-input" 
            placeholder="192.168.x.x" 
            value={manualIp}
            onChange={(e) => setManualIp(e.target.value)}
            className="bg-slate-900/50 border border-slate-700 text-slate-200 px-2 py-1 rounded w-32 outline-none focus:border-teal-500 transition font-mono text-xs"
          />
          <button 
            type="submit" 
            className="bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 border border-teal-600/50 hover:border-teal-500 font-semibold px-3 py-1 rounded text-xs transition active:scale-95 focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800"
            aria-label="Connect manually to IP"
          >
            Connect
          </button>
        </form>
        
        {!audioUnlocked ? (
          <button 
            onClick={handleAudioUnlock}
            className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/50 font-bold px-4 py-2 rounded-lg text-sm transition active:scale-95 flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800"
            aria-label="Unlock Audio Features"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
            Unlock Audio
          </button>
        ) : (
          <div className="text-teal-400 font-bold bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 text-sm flex items-center gap-2" aria-label="Audio Active">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            Audio Active
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
