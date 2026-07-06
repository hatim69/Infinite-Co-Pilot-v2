import React, { useEffect, useRef } from 'react';

const SpeechLog = ({ logs }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-[#172033] border border-slate-700 rounded-lg p-4 shadow-inner flex flex-col h-full">
      <h2 className="text-sm uppercase text-slate-400 font-bold mb-3 border-b border-slate-700 pb-2 tracking-wider flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        Crew Callout Log
      </h2>
      <div 
        ref={scrollRef}
        className="font-mono text-sm space-y-3 overflow-y-auto flex-1 custom-scrollbar pr-2"
        style={{ minHeight: '150px' }}
        aria-live="polite"
        role="log"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">Receiving Telemetry...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex flex-col animate-fade-in">
              <span className="text-teal-500/70 text-xs mb-0.5">{log.time}</span>
              <span className="text-slate-200">"{log.text}"</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SpeechLog;
