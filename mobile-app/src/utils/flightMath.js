export const calculateVSpeeds = (aircraftName, weightKG) => {
  const weightTonnes = weightKG / 1000;
  const name = (aircraftName || '').toUpperCase();
  let vr = 140, v1 = 135, v2 = 150;

  if (name.includes("A320")) { 
    vr = Math.round(134 + ((weightTonnes - 62)/2)); 
    v1 = vr - 5; v2 = vr + 12; 
  } else if (name.includes("777-3") || name.includes("77W")) { 
    vr = Math.round(158 + ((weightTonnes - 250)/2)); 
    v1 = vr - 5; v2 = vr + 13; 
  } else if (name.includes("777-2") || name.includes("772") || name.includes("77L")) { 
    vr = Math.round(151 + ((weightTonnes - 220)/2)); 
    v1 = vr - 5; v2 = vr + 13; 
  } else if (name.includes("737-8")) { 
    vr = Math.round(138 + ((weightTonnes - 65)/2)); 
    v1 = vr - 4; v2 = vr + 11; 
  } else if (name.includes("A350-1000") || name.includes("A35K")) { 
    vr = Math.round(155 + ((weightTonnes - 260)/2)); 
    v1 = vr - 6; v2 = vr + 12; 
  } else if (name.includes("A350") || name.includes("A359")) { 
    vr = Math.round(154 + ((weightTonnes - 220)/2)); 
    v1 = vr - 5; v2 = vr + 12; 
  } else if (name.includes("A330-3") || name.includes("A333")) { 
    vr = Math.round(150 + ((weightTonnes - 180)/2)); 
    v1 = vr - 5; v2 = vr + 12; 
  } else { 
    vr = Math.round(140 + ((weightTonnes - 60)/2)); 
    v1 = vr - 5; v2 = vr + 12; 
  }
  
  return { v1, vr, v2 };
};

export const formatTime = (ticks) => {
  try {
    const rawTicks = BigInt(ticks);
    // 1 tick = 100ns -> 10,000 ticks = 1ms
    const totalMs = rawTicks / 10000n;
    
    // Extract just the time of day (milliseconds since midnight)
    // There are 86,400,000 milliseconds in a day
    const msSinceMidnight = Number(totalMs % 86400000n);
    
    const hours = Math.floor(msSinceMidnight / 3600000);
    const minutes = Math.floor((msSinceMidnight % 3600000) / 60000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } catch (e) {
    return '---';
  }
};
