import React from 'react';

const FlightMetric = ({ label, value, unit, highlight, icon: Icon }) => {
  return (
    <div className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:border-slate-600">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-5 h-5 text-slate-400" aria-hidden="true" />}
        <div className="text-sm uppercase text-slate-400 font-semibold tracking-wider">
          {label}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-4xl font-bold font-mono ${highlight ? 'text-teal-400' : 'text-slate-100'}`}>
          {value !== undefined && value !== null ? value : '---'}
        </span>
        {unit && value !== '---' && value !== 'Waiting for Data' && (
          <span className="text-lg font-medium text-slate-500 font-mono">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default FlightMetric;
