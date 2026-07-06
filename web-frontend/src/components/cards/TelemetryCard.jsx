import React from 'react';

const TelemetryCard = ({ label, value, unit, status, highlight, icon: Icon }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between shadow-sm transition-all hover:border-slate-600 hover:shadow-md h-full">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />}
        <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">
          {label}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold font-mono ${highlight ? 'text-teal-400' : 'text-slate-100'}`}>
          {value !== undefined && value !== null ? value : 'Waiting for Data'}
        </span>
        {unit && value !== 'Waiting for Data' && value !== 'Not Available' && (
          <span className="text-sm font-medium text-slate-500 font-mono">{unit}</span>
        )}
      </div>
      {status && (
        <div className="mt-2 text-xs font-medium text-slate-400">
          {status}
        </div>
      )}
    </div>
  );
};

export default TelemetryCard;
