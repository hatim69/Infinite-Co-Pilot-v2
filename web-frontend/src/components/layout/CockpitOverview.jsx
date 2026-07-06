import React from 'react';
import { Plane } from 'lucide-react';

const CockpitOverview = ({ telemetry, isConnected }) => {
  if (!isConnected) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 md:p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
        <Plane className="w-16 h-16 text-slate-600 mb-6 mx-auto animate-pulse" />
        <h2 className="text-2xl font-bold text-slate-300 mb-2">Awaiting Flight Data</h2>
        <p className="text-slate-400">Start Infinite Flight and connect your simulator.<br/>Your cockpit information will appear here.</p>
      </div>
    );
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

  return (
    <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg relative">
      {/* Subtle aviation background (horizon split) */}
      <div className="absolute inset-0 z-0 flex flex-col opacity-5">
        <div className="flex-1 bg-blue-400"></div>
        <div className="h-[2px] bg-white"></div>
        <div className="flex-1 bg-amber-900"></div>
      </div>

      <div className="relative z-10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row justify-between mb-8 gap-6 border-b border-slate-700/50 pb-6">
          <div>
            <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">Aircraft</div>
            <div className="text-3xl font-bold text-slate-100">{telemetry.name || '---'}</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">Current Position</div>
            <div className="text-2xl font-bold text-slate-200">
              {telemetry.airport && telemetry.airport !== '---' ? `Near ${telemetry.airport}` : 'Route Pending'}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">Flight Phase</div>
            <div className="text-2xl font-bold text-teal-400">{phase}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Altitude</div>
            <div className="text-3xl font-mono font-bold text-slate-100 flex items-baseline gap-2">
              <div>
                {telemetry.agl > 0 ? Math.round(telemetry.agl).toLocaleString() : '0'} 
                <span className="text-sm text-slate-500 ml-1">AGL</span>
              </div>
            </div>
            <div className="text-lg font-mono font-semibold text-slate-400 mt-1">
              {telemetry.msl > 0 ? Math.round(telemetry.msl).toLocaleString() : '0'} 
              <span className="text-xs text-slate-500 ml-1">MSL</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Airspeed</div>
            <div className="text-3xl font-mono font-bold text-teal-400">
              {telemetry.ias > 0 ? Math.round(telemetry.ias) : '0'} <span className="text-base text-teal-500/50">KIAS</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Groundspeed</div>
            <div className="text-3xl font-mono font-bold text-slate-300">
              {telemetry.gs > 0 ? Math.round(telemetry.gs) : '0'} <span className="text-base text-slate-500">KT</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Vertical Spd</div>
            <div className="text-3xl font-mono font-bold text-slate-300">
              {telemetry.vs !== 0 ? Math.round(telemetry.vs) : '0'} <span className="text-base text-slate-500">FPM</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CockpitOverview;
