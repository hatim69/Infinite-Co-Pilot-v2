import React, { useState } from 'react';
import { getAirlineDomain } from '../../utils/airlineDomains';

const LiveryLogo = ({ livery }) => {
  const [imgError, setImgError] = useState(false);
  
  if (!livery || livery.toLowerCase() === 'generic' || livery.toLowerCase().includes('factory')) {
    return null;
  }

  const domain = getAirlineDomain(livery);
  
  if (!domain || imgError) {
    return null;
  }

  return (
    <div className="bg-white rounded p-1 shadow-sm border border-slate-700/50 flex items-center justify-center h-10 w-10 shrink-0">
      <img 
        src={`https://logo.clearbit.com/${domain}`} 
        alt={`${livery} logo`} 
        className="max-h-full max-w-full object-contain"
        onError={() => setImgError(true)}
      />
    </div>
  );
};

export default LiveryLogo;
