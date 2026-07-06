import React from 'react';

const FlightStrip = ({ telemetry, isConnected }) => {
  if (!isConnected) return null;

  // Basic phase inference (can be lifted up to a shared utility later)
  let phase = "PREFLIGHT";
  if (telemetry.gs > 40 && telemetry.onGround) phase = "TAKEOFF";
  else if (!telemetry.onGround && telemetry.vs > 400 && telemetry.msl < 10000) phase = "CLIMB (INIT)";
  else if (!telemetry.onGround && telemetry.vs > 200) phase = "CLIMB";
  else if (!telemetry.onGround && Math.abs(telemetry.vs) <= 200 && telemetry.msl > 10000) phase = "CRUISE";
  else if (!telemetry.onGround && telemetry.vs < -200) phase = "DESCENT";
  else if (!telemetry.onGround && telemetry.gear === 1 && telemetry.flaps > 0) phase = "APPROACH";
  else if (telemetry.onGround && telemetry.gs > 30 && telemetry.throttle < 0.1) phase = "ROLLOUT";
  else if (telemetry.onGround && telemetry.gs > 5 && telemetry.gs <= 30) phase = "TAXI";

  const fl = telemetry.msl > 0 ? `FL${Math.floor(telemetry.msl / 100)}` : 'GND';

  return (
    <div className="bg-teal-900/20 border-y md:border md:rounded-lg border-teal-500/30 mb-8 p-3 shadow-inner text-teal-300">
      <div className="flex flex-col md:flex-row justify-between items-center px-4 md:px-8 font-mono tracking-widest text-sm md:text-base font-semibold">
        <div className="flex justify-between w-full md:w-1/3">
          <span>{telemetry.name || 'A/C'}</span>
          <span className="text-teal-400/80">{phase}</span>
        </div>
        
        <div className="hidden md:block text-teal-500/50">|</div>
        
        <div className="flex justify-between w-full md:w-1/2 mt-2 md:mt-0">
          <span>{fl}</span>
          <span>{telemetry.ias > 0 ? Math.round(telemetry.ias) : '0'} KT</span>
          <span>{telemetry.vs !== 0 ? Math.round(telemetry.vs) : '0'} FPM</span>
        </div>
      </div>
    </div>
  );
};

export default FlightStrip;
