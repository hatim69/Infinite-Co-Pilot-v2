import React from 'react';
import { Activity, Mic, Wifi } from 'lucide-react';
import { speechManager } from '../../utils/speech';

const Header = ({ telemetry, isConnected }) => {
  const isVoiceEnabled = speechManager.audioUnlocked;
  
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

  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6 pb-6 border-b border-slate-700/50">
      <div className="flex items-center gap-4">
        <img src="/favicon.jpeg" alt="FlightDeck Logo" className="w-12 h-12 rounded shadow-lg border border-slate-700/50" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            FlightDeck
          </h1>
          <p className="text-sm text-teal-400 italic mt-0.5 font-medium tracking-wide">
            Your intelligent second seat
          </p>
        </div>
      </div>
      
      <div className="flex flex-col items-start md:items-end gap-3 w-full md:w-auto mt-4 md:mt-0">
        <div className="text-left md:text-right">
          <div className="text-xl font-bold text-slate-200 font-mono">
            {isConnected ? (telemetry.name || 'Aircraft Active') : 'Standing By'}
          </div>
          <div className="text-sm text-slate-400 uppercase tracking-widest mt-1">
            {isConnected ? phase : 'Awaiting Connection'}
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-2">
          <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${isConnected ? 'text-teal-400' : 'text-slate-500'}`}>
            <Wifi className="w-3.5 h-3.5" />
            Link
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${isVoiceEnabled ? 'text-teal-400' : 'text-slate-500'}`}>
            <Mic className="w-3.5 h-3.5" />
            Voice
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${telemetry.name ? 'text-teal-400' : 'text-slate-500'}`}>
            <Activity className="w-3.5 h-3.5" />
            Live
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
