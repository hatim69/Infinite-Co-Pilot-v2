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
  const epochTicks = 621355968000000000n;
  if (BigInt(ticks) > epochTicks) {
    const ms = Number((BigInt(ticks) - epochTicks) / 10000n);
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return '---';
};
