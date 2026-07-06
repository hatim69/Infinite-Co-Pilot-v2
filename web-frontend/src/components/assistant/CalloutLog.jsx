import React, { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';

const CalloutLog = ({ logs }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-5 shadow-inner flex flex-col h-full">
      <h2 className="text-xs uppercase text-slate-500 font-semibold mb-3 border-b border-slate-700/50 pb-2 tracking-widest flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5" />
        Crew Callout Log
      </h2>
      <div 
        ref={scrollRef}
        className="font-mono text-sm space-y-4 overflow-y-auto flex-1 custom-scrollbar pr-2"
        style={{ minHeight: '120px' }}
        aria-live="polite"
        role="log"
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Receiving Telemetry...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex flex-col animate-fade-in border-l-2 border-slate-700 pl-3">
              <span className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">{log.time}</span>
              <span className="text-slate-300">"{log.text}"</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CalloutLog;
