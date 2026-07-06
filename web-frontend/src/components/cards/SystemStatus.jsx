import React from 'react';

const SystemStatus = ({ label, value, status, icon: Icon }) => {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded p-3 flex justify-between items-center transition-colors hover:bg-slate-800/60">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-500" aria-hidden="true" />}
        <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold font-mono text-slate-200">
          {value !== undefined && value !== null ? value : '---'}
        </div>
        {status && (
          <div className="text-[10px] text-slate-500 uppercase mt-0.5">{status}</div>
        )}
      </div>
    </div>
  );
};

export default SystemStatus;
