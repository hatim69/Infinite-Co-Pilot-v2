import React, { useState, useEffect } from 'react';
import DashboardLayout from './components/layout/DashboardLayout';
import { useTelemetry } from './hooks/useTelemetry';
import { speechManager } from './utils/speech';

function App() {
  const { 
    connectionStatus, 
    connectedIp, 
    telemetry, 
    manualConnect,
    discoveredDevices,
    selectDevice,
    disconnectDevice
  } = useTelemetry();
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), text: 'System initialized. Receiving Telemetry...' }
  ]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    // Setup the speech logger so the SpeechManager can add to our local state
    speechManager.setLogger((text) => {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), text }]);
    });
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'FLIGHT LINK ACTIVE') {
      document.title = "FlightDeck • Standing By";
      return;
    }

    let phase = "Preflight";
    if (telemetry.gs > 40 && telemetry.onGround) phase = "Takeoff Roll";
    else if (!telemetry.onGround && telemetry.vs > 400 && telemetry.msl < 10000) phase = "Initial Climb";
    else if (!telemetry.onGround && telemetry.vs > 200) phase = "Climb";
    else if (!telemetry.onGround && Math.abs(telemetry.vs) <= 200 && telemetry.msl > 10000) phase = "Cruise";
    else if (!telemetry.onGround && telemetry.vs < -200) phase = "Descent";
    else if (!telemetry.onGround && telemetry.gear === 1 && telemetry.flaps > 0) phase = "Approach";
    else if (telemetry.onGround && telemetry.gs > 30 && telemetry.throttle < 0.1) phase = "Rollout";
    else if (telemetry.onGround && telemetry.gs > 5 && telemetry.gs <= 30) phase = "Taxi";

    const name = telemetry.name || "Aircraft";
    document.title = `${name} • ${phase}`;
  }, [telemetry, connectionStatus]);

  const handleUnlockAudio = () => {
    // Play a silent utterance to unlock the speech synthesis engine on mobile/chrome
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    
    // Resume audio context if any exists (dummy play)
    new Audio('data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAATAAADc29mdHdhcmUATGF2ZjUwLjQyLjEwMQAA/8AAQAAAAgAAA0gAAAAAAABV+wAACAAAABQAAABgAAAAaAAAAHAAAACHAAAAigAAAJYAAACnAAAAswAAAMEAAADQAAAA3wAAAO0AAAD/AAABEA==').play().catch(() => {});
    
    setAudioUnlocked(true);
  };

  if (!audioUnlocked) {
    return (
      <main className="min-h-screen bg-[#07111F] text-slate-100 font-sans flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md mx-auto p-6 bg-slate-800/40 rounded-2xl border border-slate-700">
          <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 15l-3-3H5v-4h3l3-3v10z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Audio Initialization Required</h1>
          <p className="text-slate-400 text-sm">
            Chrome's autoplay policies require you to interact with the webpage before any audio, callouts, or boarding music can be played.
          </p>
          <button 
            onClick={handleUnlockAudio}
            className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] hover:shadow-[0_0_30px_rgba(20,184,166,0.5)] active:scale-95"
          >
            Start Infinite Co-Pilot
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07111F] text-slate-100 font-sans selection:bg-teal-500/30">
      <DashboardLayout 
        connectionStatus={connectionStatus}
        connectedIp={connectedIp}
        telemetry={telemetry}
        onManualConnect={manualConnect}
        discoveredDevices={discoveredDevices}
        onSelectDevice={selectDevice}
        onDisconnectDevice={disconnectDevice}
        logs={logs}
      />
    </main>
  );
}

export default App;
