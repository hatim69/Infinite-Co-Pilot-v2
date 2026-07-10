import React from 'react';
import ConnectionStatus from '../status/ConnectionStatus';
import SpeechLog from './SpeechLog';
import TelemetryCard from '../cards/TelemetryCard';
import { Plane, Scale, Gauge, Wind, Activity, ArrowUpFromLine, CheckCircle, Zap, ShieldAlert, Power, Sun, MapPin, Clock, Lightbulb } from 'lucide-react';
import { getFlapString } from '../../utils/calculatePerformance';

const Layout = ({ connectionStatus, connectedIp, telemetry, onManualConnect, logs }) => {
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
      <ConnectionStatus 
        status={connectionStatus} 
        ip={connectedIp} 
        onManualConnect={onManualConnect} 
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Telemetry Area */}
        <div className="lg:col-span-3 space-y-8">
          
          <section aria-labelledby="section-flight-data">
            <h2 id="section-flight-data" className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4 border-b border-slate-700/50 pb-2">Primary Flight Data</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <TelemetryCard label="Aircraft" icon={Plane} value={telemetry.name || 'Waiting for Data'} highlight />
              <TelemetryCard label="Weight" icon={Scale} value={telemetry.weight > 0 ? Math.round(telemetry.weight) : 'Waiting for Data'} unit="KG" />
              <TelemetryCard label="IAS" icon={Gauge} value={telemetry.ias > 0 ? Math.round(telemetry.ias) : '0'} unit="KTS" highlight />
              <TelemetryCard label="GS" icon={Wind} value={telemetry.gs > 0 ? Math.round(telemetry.gs) : '0'} unit="KTS" />
              <TelemetryCard label="VS" icon={Activity} value={telemetry.vs !== 0 ? Math.round(telemetry.vs) : '0'} unit="FPM" />
              <TelemetryCard label="Altitude" icon={ArrowUpFromLine} value={telemetry.msl > 0 ? Math.round(telemetry.msl) : '0'} unit="FT MSL" highlight />
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section aria-labelledby="section-systems">
              <h2 id="section-systems" className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4 border-b border-slate-700/50 pb-2">Core Systems</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <TelemetryCard label="Gear" icon={CheckCircle} value={telemetry.gear === 1 ? 'DOWN' : (telemetry.gear === 2 || telemetry.gear === 5 || telemetry.gear === 0) ? 'UP' : telemetry.gear !== -1 ? 'MOVING' : 'Waiting for Data'} />
                <TelemetryCard label="Flaps" icon={ShieldAlert} value={telemetry.flaps !== -1 ? getFlapString(telemetry.name, telemetry.flaps) : 'Waiting for Data'} />
                <TelemetryCard label="Spoilers" icon={ShieldAlert} value={telemetry.spoilers === 0 ? 'OFF' : telemetry.spoilers === 1 ? 'FLIGHT' : telemetry.spoilers === 2 ? 'ARMED' : 'Waiting for Data'} />
                <TelemetryCard label="Brakes" icon={CheckCircle} value={telemetry.brakes === 1 ? 'SET' : telemetry.brakes === 0 ? 'REL' : 'Waiting for Data'} />
                <TelemetryCard label="Autopilot" icon={Activity} value={telemetry.autopilot === 1 ? 'ON' : telemetry.autopilot === 0 ? 'OFF' : 'Waiting for Data'} />
                <TelemetryCard label="Throttle" icon={Zap} value={telemetry.throttle >= 0 ? `${Math.round(telemetry.throttle * 100)}%` : 'Waiting for Data'} />
              </div>
            </section>

            <section aria-labelledby="section-power">
              <h2 id="section-power" className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4 border-b border-slate-700/50 pb-2">Power & Ground</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <TelemetryCard label="Battery" icon={Power} value={telemetry.battery === 1 ? 'ON' : telemetry.battery === 0 ? 'OFF' : 'Waiting for Data'} />
                <TelemetryCard label="APU" icon={Power} value={telemetry.apu === 0 ? 'OFF' : telemetry.apu === 1 ? 'STARTING' : telemetry.apu === 2 ? 'ON' : 'Waiting for Data'} />
                <TelemetryCard label="Engines" icon={Power} value={Object.values(telemetry.engines || {}).some(s => s === 2) ? `ENG ${Object.entries(telemetry.engines).filter(([_, s]) => s === 2).map(([n]) => n).join(', ')} ON` : Object.keys(telemetry.engines || {}).length > 0 ? 'OFF' : 'Waiting for Data'} />
                <TelemetryCard label="Pushback" icon={CheckCircle} value={telemetry.pushback === 1 ? 'ACTIVE' : telemetry.pushback === 0 ? 'OFF' : 'Waiting for Data'} />
                <TelemetryCard label="Seatbelts" icon={ShieldAlert} value={telemetry.seatbelt === 1 ? 'ON' : telemetry.seatbelt === 0 ? 'OFF' : 'Waiting for Data'} />
                <TelemetryCard label="No Smoking" icon={ShieldAlert} value={telemetry.smoking === 1 ? 'ON' : telemetry.smoking === 0 ? 'OFF' : 'Waiting for Data'} />
              </div>
            </section>
          </div>

          <section aria-labelledby="section-environment">
            <h2 id="section-environment" className="text-sm font-semibold text-slate-300 uppercase tracking-widest mb-4 border-b border-slate-700/50 pb-2">Environment & Lights</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <TelemetryCard label="Beacon" icon={Lightbulb} value={telemetry.beacon === 1 ? 'ON' : telemetry.beacon === 0 ? 'OFF' : 'Waiting for Data'} />
              <TelemetryCard label="Strobe" icon={Lightbulb} value={telemetry.strobe === 1 ? 'ON' : telemetry.strobe === 0 ? 'OFF' : 'Waiting for Data'} />
              <TelemetryCard label="Nav Lights" icon={Lightbulb} value={telemetry.nav === 1 ? 'ON' : telemetry.nav === 0 ? 'OFF' : 'Waiting for Data'} />
              <TelemetryCard label="Landing Lts" icon={Lightbulb} value={telemetry.landing === 1 ? 'ON' : telemetry.landing === 0 ? 'OFF' : 'Waiting for Data'} />
              <TelemetryCard label="Local Time" icon={Clock} value={telemetry.time} />
              <TelemetryCard label="Nearest Apt" icon={MapPin} value={telemetry.airport} />
            </div>
          </section>

        </div>

        {/* Sidebar Log Area */}
        <div className="lg:col-span-1 h-96 lg:h-auto">
          <SpeechLog logs={logs} />
        </div>
      </div>
    </div>
  );
};

export default Layout;
