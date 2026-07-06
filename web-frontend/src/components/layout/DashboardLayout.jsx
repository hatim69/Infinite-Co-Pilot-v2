import React from 'react';
import Header from './Header';
import FlightStrip from './FlightStrip';
import CockpitOverview from './CockpitOverview';
import SimulatorLink from '../status/SimulatorLink';
import CrewAssistant from '../assistant/CrewAssistant';
import CalloutLog from '../assistant/CalloutLog';
import FlightMetric from '../cards/FlightMetric';
import SystemStatus from '../cards/SystemStatus';
import { Settings, Droplet, Battery, Flame, SunDim, Map, ShieldAlert, Zap, Compass, Crosshair } from 'lucide-react';

const DashboardLayout = ({ connectionStatus, connectedIp, telemetry, onManualConnect, logs }) => {
  const isConnected = connectionStatus === 'FLIGHT LINK ACTIVE';

  return (
    <div className="max-w-screen-2xl mx-auto p-4 md:p-6 lg:p-8">
      <Header telemetry={telemetry} isConnected={isConnected} />
      
      {isConnected && (
        <FlightStrip telemetry={telemetry} isConnected={isConnected} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Main Column */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          <CockpitOverview telemetry={telemetry} isConnected={isConnected} />

          {/* Conditional Systems Display */}
          {isConnected && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-xs uppercase text-slate-500 font-semibold tracking-widest mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Systems Overview
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SystemStatus label="Gear" icon={Crosshair} value={telemetry.gear === 1 ? 'DOWN' : (telemetry.gear === 2 || telemetry.gear === 5 || telemetry.gear === 0) ? 'UP' : telemetry.gear !== -1 ? 'MOVING' : '---'} />
                <SystemStatus label="Flaps" icon={ShieldAlert} value={telemetry.flaps !== -1 ? `${telemetry.flaps}°` : '---'} />
                <SystemStatus label="Spoilers" icon={Droplet} value={telemetry.spoilers === 0 ? 'OFF' : telemetry.spoilers === 1 ? 'FLIGHT' : telemetry.spoilers === 2 ? 'ARMED' : '---'} />
                <SystemStatus label="Brakes" icon={ShieldAlert} value={telemetry.brakes === 1 ? 'SET' : telemetry.brakes === 0 ? 'REL' : '---'} />
                
                <SystemStatus label="APU" icon={Battery} value={telemetry.apu === 0 ? 'OFF' : telemetry.apu === 1 ? 'STARTING' : telemetry.apu === 2 ? 'ON' : '---'} />
                <SystemStatus label="Engines" icon={Flame} value={Object.values(telemetry.engines || {}).some(s => s === 2) ? `ENG ${Object.entries(telemetry.engines).filter(([_, s]) => s === 2).map(([n]) => n).join(', ')} ON` : Object.keys(telemetry.engines || {}).length > 0 ? 'OFF' : '---'} />
                
                <SystemStatus label="Landing Lts" icon={SunDim} value={telemetry.landing === 1 ? 'ON' : telemetry.landing === 0 ? 'OFF' : '---'} />
                <SystemStatus label="Autopilot" icon={Zap} value={telemetry.autopilot === 1 ? 'ON' : telemetry.autopilot === 0 ? 'OFF' : '---'} />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {!isConnected && (
            <div className="h-48">
              <SimulatorLink 
                status={connectionStatus} 
                ip={connectedIp} 
                onManualConnect={onManualConnect} 
              />
            </div>
          )}

          <div className="flex-1 min-h-[300px]">
            <CrewAssistant telemetry={telemetry} isConnected={isConnected} />
          </div>

          <div className="h-[250px]">
            <CalloutLog logs={logs} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardLayout;
