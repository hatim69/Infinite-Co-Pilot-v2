import React, { useState } from 'react';
import { Mic, CheckSquare, ShieldCheck, Zap } from 'lucide-react';
import { speechManager } from '../../utils/speech';

const CrewAssistant = ({ telemetry, isConnected }) => {
  const [audioUnlocked, setAudioUnlocked] = useState(speechManager.audioUnlocked);

  const handleAudioUnlock = () => {
    speechManager.unlockAudio();
    setAudioUnlocked(true);
  };

  // Determine assistant context based on phase
  let phaseTitle = "Standing By";
  let checklist = [];
  let nextAction = "Connect simulator to begin crew monitoring.";
  
  if (isConnected) {
    if (telemetry.gs > 40 && telemetry.onGround) {
      phaseTitle = "Takeoff Roll";
      checklist = ["Thrust set", "Airspeed alive"];
      nextAction = "Rotate";
    } else if (!telemetry.onGround && telemetry.msl < 10000) {
      phaseTitle = "Climb Phase";
      checklist = ["Positive rate", "Gear up"];
      nextAction = "Monitor speed & 10,000ft lights";
    } else if (!telemetry.onGround && telemetry.msl > 10000 && Math.abs(telemetry.vs) <= 200) {
      phaseTitle = "Cruise Monitoring";
      checklist = ["Systems normal", "Fuel flow stable"];
      nextAction = "Descent preparation";
    } else if (!telemetry.onGround && telemetry.vs < -200) {
      phaseTitle = "Descent Profile";
      checklist = ["Altitude decreasing", "Speed checked"];
      nextAction = "Approach briefing";
    } else if (telemetry.onGround && telemetry.gs <= 40) {
      phaseTitle = "Ground Operations";
      checklist = ["Engines stable", "Taxi clearance"];
      nextAction = "Configure aircraft for departure";
    }
  }

  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-6 shadow-lg h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-6 border-b border-slate-700/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-teal-500/20 p-2 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-widest">FlightDeck Assistant</h2>
          </div>
          
          {!audioUnlocked ? (
            <button 
              onClick={handleAudioUnlock}
              className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/50 font-semibold px-3 py-1.5 rounded text-xs transition active:scale-95 flex items-center gap-1.5"
            >
              <Mic className="w-3.5 h-3.5" />
              Enable Voice
            </button>
          ) : (
            <div className="text-teal-400 text-xs font-semibold flex items-center gap-1.5 bg-teal-500/10 px-3 py-1.5 rounded border border-teal-500/20">
              <Mic className="w-3.5 h-3.5" />
              Voice Active
            </div>
          )}
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-slate-100 mb-4">{phaseTitle}</h3>
          
          {isConnected && checklist.length > 0 && (
            <ul className="space-y-2 mb-6">
              {checklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckSquare className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Next Action</div>
        <div className="text-sm font-semibold text-amber-400 flex items-start gap-2">
          <Zap className="w-4 h-4 shrink-0 mt-0.5" />
          {nextAction}
        </div>
      </div>
    </div>
  );
};

export default CrewAssistant;
