import React, { useState } from 'react';
import { Activity, Mic, Wifi, Navigation } from 'lucide-react';
import { speechManager } from '../../utils/speech';

const Header = ({ telemetry, isConnected }) => {
  const isVoiceEnabled = speechManager.audioUnlocked;
  const [voicePref, setVoicePref] = useState(speechManager.voicePreference || 'female');
  
  // Basic phase inference
  let phase = "Preflight";
  if (telemetry.gs > 40 && telemetry.onGround) phase = "Takeoff Roll";
  else if (!telemetry.onGround && telemetry.vs > 400 && telemetry.msl < 10000) phase = "Initial Climb";
  else if (!telemetry.onGround && telemetry.vs > 200) phase = "Climb";
  else if (!telemetry.onGround && Math.abs(telemetry.vs) <= 200 && telemetry.msl > 10000) phase = "Cruise";
  else if (!telemetry.onGround && telemetry.vs < -200) phase = "Descent";
  else if (!telemetry.onGround && telemetry.gear === 1 && telemetry.flaps > 0) phase = "Approach";
  else if (telemetry.onGround && telemetry.gs > 30 && telemetry.throttle < 0.1) phase = "Rollout";
  else if (telemetry.onGround && telemetry.gs > 5 && telemetry.gs <= 30) phase = "Taxi";

  const toggleVoicePref = () => {
    const nextPref = voicePref === 'female' ? 'male' : 'female';
    speechManager.setVoicePreference(nextPref);
    setVoicePref(nextPref);
    if (speechManager.audioUnlocked) {
      speechManager.speak(`Voice changed to ${nextPref}.`, { tone: "notice" });
    }
  };

  return (
    <header className="flex flex-row justify-between items-center mb-6 pb-6 border-b border-slate-700/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
          <Navigation className="w-4 h-4 transform rotate-45" />
        </div>
        <h1 className="text-lg font-bold tracking-widest text-slate-100 uppercase">
          FlightDeck
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${isConnected ? 'text-teal-400' : 'text-slate-500'}`}>
          <Wifi className="w-3.5 h-3.5" />
          Link
        </div>
        <button 
          onClick={toggleVoicePref}
          title="Toggle Voice Gender (Female / Male)"
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300 transition hover:text-white active:scale-95">
          <Mic className="w-3.5 h-3.5" />
          {voicePref}
        </button>
        <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${telemetry.name ? 'text-teal-400' : 'text-slate-500'}`}>
          <Activity className="w-3.5 h-3.5" />
          Live
        </div>
      </div>
    </header>
  );
};

export default Header;
