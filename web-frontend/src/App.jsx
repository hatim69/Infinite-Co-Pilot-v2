import React, { useState, useEffect } from 'react';
import DashboardLayout from './components/layout/DashboardLayout';
import { useTelemetry } from './hooks/useTelemetry';
import { speechManager } from './utils/speech';

function App() {
  const { connectionStatus, connectedIp, telemetry, manualConnect } = useTelemetry();
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), text: 'System initialized. Receiving Telemetry...' }
  ]);

  useEffect(() => {
    // Setup the speech logger so the SpeechManager can add to our local state
    speechManager.setLogger((text) => {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), text }]);
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#07111F] text-slate-100 font-sans selection:bg-teal-500/30">
      <DashboardLayout 
        connectionStatus={connectionStatus}
        connectedIp={connectedIp}
        telemetry={telemetry}
        onManualConnect={manualConnect}
        logs={logs}
      />
    </main>
  );
}

export default App;
