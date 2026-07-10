import React from 'react';
import Header from './Header';
import FlightStrip from './FlightStrip';
import CockpitOverview from './CockpitOverview';
import SimulatorLink from '../status/SimulatorLink';
import CrewAssistant from '../assistant/CrewAssistant';
import CalloutLog from '../assistant/CalloutLog';
import FlightMetric from '../cards/FlightMetric';
import SystemStatus from '../cards/SystemStatus';
import { Settings, Droplet, Battery, Flame, SunDim, ShieldAlert, Zap, Crosshair, ArrowLeftRight, User, Ban, Clock, Activity, Power, Users } from 'lucide-react';
import { getFlapString } from '../../utils/calculatePerformance';

const DashboardLayout = ({ 
  connectionStatus, 
  connectedIp, 
  telemetry, 
  onManualConnect, 
  discoveredDevices, 
  onSelectDevice, 
  onDisconnectDevice, 
  logs 
}) => {
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
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 flex flex-col gap-6">
              
              {/* Performance Data */}
              <div>
                <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" /> Performance Data
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SystemStatus label="V1 Speed" icon={Zap} value={telemetry.performance ? `${telemetry.performance.v1} kts` : '---'} />
                  <SystemStatus label="VR Speed" icon={Zap} value={telemetry.performance ? `${telemetry.performance.vr} kts` : '---'} />
                  <SystemStatus label="V2 Speed" icon={Zap} value={telemetry.performance ? `${telemetry.performance.v2} kts` : '---'} />
                  <SystemStatus label="VREF" icon={Zap} value={telemetry.performance ? `${telemetry.performance.vref} kts` : '---'} />
                  <SystemStatus label="Trim" icon={Crosshair} value={telemetry.performance ? `${telemetry.performance.trim}` : '---'} />
                  <SystemStatus label="Takeoff Flaps" icon={ShieldAlert} value={telemetry.performance ? `${telemetry.performance.takeoffFlaps}` : '---'} />
                </div>
              </div>

              {/* Flight Systems */}
              <div>
                <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-4 flex items-center gap-2 border-t border-slate-700/50 pt-4">
                  <Settings className="w-4 h-4 text-blue-400" /> Flight Systems
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SystemStatus label="Gear" icon={Crosshair} value={telemetry.gear === 1 ? 'DOWN' : (telemetry.gear === 2 || telemetry.gear === 5 || telemetry.gear === 0) ? 'UP' : telemetry.gear !== -1 ? 'MOVING' : '---'} />
                  <SystemStatus label="Flaps" icon={ShieldAlert} value={getFlapString(telemetry.name, telemetry.flaps)} />
                  <SystemStatus label="Spoilers" icon={Droplet} value={telemetry.spoilers === 0 ? 'OFF' : telemetry.spoilers === 1 ? 'FLIGHT' : telemetry.spoilers === 2 ? 'ARMED' : '---'} />
                  <SystemStatus label="Brakes" icon={ShieldAlert} value={telemetry.brakes === 1 ? 'SET' : telemetry.brakes === 0 ? 'REL' : '---'} />
                  <SystemStatus label="Autopilot" icon={Zap} value={telemetry.autopilot === 1 ? 'ON' : telemetry.autopilot === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="VNAV" icon={Zap} value={telemetry.vnav === 1 ? 'ON' : telemetry.vnav === 0 ? 'OFF' : '---'} />
                </div>
              </div>

              {/* Power & Engines */}
              <div>
                <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-4 flex items-center gap-2 border-t border-slate-700/50 pt-4">
                  <Power className="w-4 h-4 text-amber-400" /> Power & Engines
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SystemStatus 
                    label="Battery" 
                    icon={Battery} 
                    value={telemetry.batteryVolts > 0 ? `${telemetry.batteryVolts.toFixed(1)}V` : (telemetry.batteryAmp > 0 ? `${telemetry.batteryAmp.toFixed(1)}A` : (telemetry.battery === 1 ? 'ON' : telemetry.battery === 0 ? 'OFF' : '---'))} 
                  />
                  <SystemStatus label="APU" icon={Zap} value={telemetry.apu === 0 ? 'OFF' : telemetry.apu === 1 ? 'STARTING' : telemetry.apu === 2 ? 'ON' : '---'} />
                  <SystemStatus label="Engines" icon={Flame} value={Object.values(telemetry.engines || {}).some(s => s === 2) ? `ENG ${Object.entries(telemetry.engines).filter(([_, s]) => s === 2).map(([n]) => n).join(', ')} ON` : Object.keys(telemetry.engines || {}).length > 0 ? 'OFF' : '---'} />
                </div>
              </div>

              {/* Cabin & Crew */}
              <div>
                <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-4 flex items-center gap-2 border-t border-slate-700/50 pt-4">
                  <Users className="w-4 h-4 text-purple-400" /> Cabin & Crew
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SystemStatus label="Seatbelt" icon={User} value={telemetry.seatbelt === 1 ? 'ON' : telemetry.seatbelt === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="No Smoking" icon={Ban} value={telemetry.smoking === 1 ? 'ON' : telemetry.smoking === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="Local Time" icon={Clock} value={telemetry.time !== '---' ? telemetry.time : '---'} />
                </div>
              </div>

              {/* Ground Services */}
              <div>
                <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-4 flex items-center gap-2 border-t border-slate-700/50 pt-4">
                  <ArrowLeftRight className="w-4 h-4 text-orange-400" /> Ground Services
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SystemStatus label="Pushback" icon={ArrowLeftRight} value={telemetry.pushback === 1 ? 'ACTIVE' : telemetry.pushback === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="Belt Loader" icon={ArrowLeftRight} value={telemetry.beltLoader === 1 ? 'CONN' : telemetry.beltLoader === 0 ? 'DISC' : '---'} />
                  <SystemStatus label="Catering" icon={ArrowLeftRight} value={telemetry.catering === 1 ? 'CONN' : telemetry.catering === 0 ? 'DISC' : '---'} />
                  <SystemStatus label="GPU" icon={Zap} value={telemetry.gpu === 1 ? 'CONN' : telemetry.gpu === 0 ? 'DISC' : '---'} />
                  <SystemStatus label="Pallet Loader" icon={ArrowLeftRight} value={telemetry.palletLoader === 1 ? 'CONN' : telemetry.palletLoader === 0 ? 'DISC' : '---'} />
                  <SystemStatus label="Stairs" icon={ArrowLeftRight} value={telemetry.stairs === 1 ? 'CONN' : telemetry.stairs === 0 ? 'DISC' : '---'} />
                </div>
              </div>

              {/* External Lights */}
              <div>
                <h3 className="text-xs uppercase text-slate-400 font-semibold tracking-widest mb-4 flex items-center gap-2 border-t border-slate-700/50 pt-4">
                  <SunDim className="w-4 h-4 text-yellow-400" /> External Lights
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <SystemStatus label="Beacon" icon={SunDim} value={telemetry.beacon === 1 ? 'ON' : telemetry.beacon === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="Strobe" icon={SunDim} value={telemetry.strobe === 1 ? 'ON' : telemetry.strobe === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="Nav" icon={SunDim} value={telemetry.nav === 1 ? 'ON' : telemetry.nav === 0 ? 'OFF' : '---'} />
                  <SystemStatus label="Landing" icon={SunDim} value={telemetry.landing === 1 ? 'ON' : telemetry.landing === 0 ? 'OFF' : '---'} />
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          {!isConnected && (
            <div className="flex flex-col gap-4">
              <SimulatorLink 
                status={connectionStatus} 
                ip={connectedIp} 
                onManualConnect={onManualConnect} 
                discoveredDevices={discoveredDevices}
                onSelectDevice={onSelectDevice}
                onDisconnectDevice={onDisconnectDevice}
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
