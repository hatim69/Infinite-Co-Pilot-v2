export const aircraftPerformanceData = [
  {
    "aircraft": "Airbus A220-300",
    "engine": "Pratt & Whitney PW1500G",
    "flaps": ["0", "1", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 60.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 1.05, "vrBase": 72, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 12, "trimHeavy": 32, "trimRefLow": 45, "trimRefHigh": 70.9,
    "vrefScale": 0.82, "vrefBase": 68,
    "rotationPitch": 12.5, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Airbus A318-100",
    "engine": "CFM International CFM56",
    "flaps": ["0", "1", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 55.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.90, "vrBase": 82, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 10, "trimHeavy": 28, "trimRefLow": 45, "trimRefHigh": 68.0,
    "vrefScale": 0.78, "vrefBase": 74,
    "rotationPitch": 15.0, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Airbus A319-100",
    "engine": "IAE V2500",
    "flaps": ["0", "1", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 60.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.87, "vrBase": 83, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 12, "trimHeavy": 32, "trimRefLow": 47, "trimRefHigh": 75.5,
    "vrefScale": 0.76, "vrefBase": 76,
    "rotationPitch": 15.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Airbus A320-200",
    "engine": "CFM International CFM56",
    "flaps": ["0", "1", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 72.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.83, "vrBase": 84, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 12, "trimHeavy": 33, "trimRefLow": 50, "trimRefHigh": 78.0,
    "vrefScale": 0.75, "vrefBase": 78,
    "rotationPitch": 15.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Airbus A321-200",
    "engine": "IAE V2500",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 80.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.74, "vrBase": 92, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 10, "trimHeavy": 28, "trimRefLow": 57, "trimRefHigh": 93.5,
    "vrefScale": 0.70, "vrefBase": 82,
    "rotationPitch": 12.5, "tailstrikeRisk": "Very High"
  },
  {
    "aircraft": "Airbus A330-200",
    "engine": "RR Trent 700",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 190.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.20, "vrBase": 106, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 140, "trimRefHigh": 242.0,
    "vrefScale": 0.28, "vrefBase": 85,
    "rotationPitch": 13.5, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Airbus A330-200F",
    "engine": "RR Trent 700",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 195.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "3",
    "vrScale": 0.21, "vrBase": 105, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 130, "trimRefHigh": 233.0,
    "vrefScale": 0.29, "vrefBase": 84,
    "rotationPitch": 13.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Airbus A330-300",
    "engine": "GE CF6-80E1",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 210.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.18, "vrBase": 108, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 15, "trimHeavy": 37, "trimRefLow": 150, "trimRefHigh": 242.0,
    "vrefScale": 0.26, "vrefBase": 88,
    "rotationPitch": 12.0, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Airbus A330-800neo",
    "engine": "RR Trent 7000",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 200.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.19, "vrBase": 106, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 152, "trimRefHigh": 251.0,
    "vrefScale": 0.27, "vrefBase": 86,
    "rotationPitch": 13.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Airbus A330-900neo",
    "engine": "RR Trent 7000",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 215.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.17, "vrBase": 109, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 15, "trimHeavy": 37, "trimRefLow": 158, "trimRefHigh": 251.0,
    "vrefScale": 0.25, "vrefBase": 89,
    "rotationPitch": 11.5, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Airbus A340-600",
    "engine": "RR Trent 500",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 280.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.11, "vrBase": 120, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 14, "trimHeavy": 35, "trimRefLow": 205, "trimRefHigh": 380.0,
    "vrefScale": 0.21, "vrefBase": 92,
    "rotationPitch": 11.0, "tailstrikeRisk": "Very High"
  },
  {
    "aircraft": "Airbus A350-900",
    "engine": "RR Trent XWB",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 240.0, "low": "1+F", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.15, "vrBase": 115, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 165, "trimRefHigh": 280.0,
    "vrefScale": 0.22, "vrefBase": 90,
    "rotationPitch": 12.5, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Airbus A350-1000",
    "engine": "RR Trent XWB-97",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 260.0, "low": "1+F", "high": "2", "short": "3" },
    "landingFlaps": "FULL",
    "vrScale": 0.25, "vrBase": 80, "v1Offset": 6, "v2Offset": 5,
    "trimLight": 14, "trimHeavy": 35, "trimRefLow": 180, "trimRefHigh": 319.0,
    "vrefScale": 0.16, "vrefBase": 98,
    "rotationPitch": 9.5, "tailstrikeRisk": "Very High"
  },
  {
    "aircraft": "Airbus A380-800",
    "engine": "Engine Alliance GP7200",
    "flaps": ["0", "1", "1+F", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 450.0, "low": "2", "high": "3", "short": "3" },
    "landingFlaps": "FULL",
    "vrScale": 0.07, "vrBase": 122, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 18, "trimHeavy": 44, "trimRefLow": 320, "trimRefHigh": 575.0,
    "vrefScale": 0.14, "vrefBase": 96,
    "rotationPitch": 13.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Boeing 717-200",
    "engine": "RR BR715",
    "flaps": ["0", "5", "13", "18", "25", "30", "40"],
    "takeoffLogic": { "threshold": 48.0, "low": "5", "high": "13", "short": "18" },
    "landingFlaps": "30",
    "vrScale": 1.15, "vrBase": 78, "v1Offset": 3, "v2Offset": 6,
    "trimLight": 10, "trimHeavy": 28, "trimRefLow": 36, "trimRefHigh": 54.9,
    "vrefScale": 0.92, "vrefBase": 78,
    "rotationPitch": 14.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Boeing 737-700",
    "engine": "CFM56-7B",
    "flaps": ["1", "2", "5", "10", "15", "25", "30", "40"],
    "takeoffLogic": { "threshold": 62.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.95, "vrBase": 81, "v1Offset": 3, "v2Offset": 5,
    "trimLight": 12, "trimHeavy": 32, "trimRefLow": 44, "trimRefHigh": 70.1,
    "vrefScale": 0.84, "vrefBase": 81,
    "rotationPitch": 15.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Boeing 737-800",
    "engine": "CFM56-7B",
    "flaps": ["1", "2", "5", "10", "15", "25", "30", "40"],
    "takeoffLogic": { "threshold": 70.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.88, "vrBase": 84, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 11, "trimHeavy": 30, "trimRefLow": 48, "trimRefHigh": 79.0,
    "vrefScale": 0.81, "vrefBase": 84,
    "rotationPitch": 13.0, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Boeing 737-8 MAX",
    "engine": "CFM LEAP-1B",
    "flaps": ["1", "2", "5", "10", "15", "25", "30", "40"],
    "takeoffLogic": { "threshold": 72.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.86, "vrBase": 85, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 11, "trimHeavy": 30, "trimRefLow": 52, "trimRefHigh": 82.2,
    "vrefScale": 0.80, "vrefBase": 85,
    "rotationPitch": 13.0, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Boeing 737-900",
    "engine": "CFM56-7B",
    "flaps": ["1", "2", "5", "10", "15", "25", "30", "40"],
    "takeoffLogic": { "threshold": 75.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.82, "vrBase": 88, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 10, "trimHeavy": 27, "trimRefLow": 52, "trimRefHigh": 85.1,
    "vrefScale": 0.78, "vrefBase": 87,
    "rotationPitch": 11.5, "tailstrikeRisk": "Very High"
  },
  {
    "aircraft": "Boeing 747-200",
    "engine": "Pratt & Whitney JT9D",
    "flaps": ["1", "5", "10", "20", "25", "30"],
    "takeoffLogic": { "threshold": 320.0, "low": "10", "high": "20", "short": "20" },
    "landingFlaps": "30",
    "vrScale": 0.13, "vrBase": 118, "v1Offset": 6, "v2Offset": 7,
    "trimLight": 17, "trimHeavy": 42, "trimRefLow": 200, "trimRefHigh": 377.0,
    "vrefScale": 0.18, "vrefBase": 94,
    "rotationPitch": 12.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Boeing 747-400",
    "engine": "GE CF6-80C2",
    "flaps": ["1", "5", "10", "20", "25", "30"],
    "takeoffLogic": { "threshold": 340.0, "low": "10", "high": "20", "short": "20" },
    "landingFlaps": "30",
    "vrScale": 0.11, "vrBase": 122, "v1Offset": 6, "v2Offset": 6,
    "trimLight": 17, "trimHeavy": 42, "trimRefLow": 210, "trimRefHigh": 397.0,
    "vrefScale": 0.17, "vrefBase": 96,
    "rotationPitch": 12.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Boeing 747-8",
    "engine": "GEnx-2B67",
    "flaps": ["1", "5", "10", "20", "25", "30"],
    "takeoffLogic": { "threshold": 380.0, "low": "10", "high": "20", "short": "20" },
    "landingFlaps": "30",
    "vrScale": 0.09, "vrBase": 126, "v1Offset": 5, "v2Offset": 6,
    "trimLight": 16, "trimHeavy": 39, "trimRefLow": 255, "trimRefHigh": 448.0,
    "vrefScale": 0.15, "vrefBase": 100,
    "rotationPitch": 11.5, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Boeing 757-200",
    "engine": "RR RB211",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 92.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.68, "vrBase": 91, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 14, "trimHeavy": 35, "trimRefLow": 68, "trimRefHigh": 116.0,
    "vrefScale": 0.64, "vrefBase": 88,
    "rotationPitch": 14.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Boeing 767-300",
    "engine": "GE CF6-80C2",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 150.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.35, "vrBase": 102, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 16, "trimHeavy": 42, "trimRefLow": 100, "trimRefHigh": 158.8,
    "vrefScale": 0.39, "vrefBase": 91,
    "rotationPitch": 13.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Boeing 777-200ER",
    "engine": "GE90-94B",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 240.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.18, "vrBase": 112, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 18, "trimHeavy": 44, "trimRefLow": 160, "trimRefHigh": 297.5,
    "vrefScale": 0.25, "vrefBase": 92,
    "rotationPitch": 13.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Boeing 777-200LR",
    "engine": "GE90-115B",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 260.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.16, "vrBase": 114, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 18, "trimHeavy": 44, "trimRefLow": 168, "trimRefHigh": 347.5,
    "vrefScale": 0.24, "vrefBase": 93,
    "rotationPitch": 13.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Boeing 777-300ER",
    "engine": "GE90-115B",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 290.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.13, "vrBase": 119, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 15, "trimHeavy": 38, "trimRefLow": 195, "trimRefHigh": 351.5,
    "vrefScale": 0.21, "vrefBase": 96,
    "rotationPitch": 11.5, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Boeing 777F",
    "engine": "GE90-110B",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 270.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.15, "vrBase": 115, "v1Offset": 5, "v2Offset": 5,
    "trimLight": 17, "trimHeavy": 43, "trimRefLow": 167, "trimRefHigh": 347.8,
    "vrefScale": 0.23, "vrefBase": 94,
    "rotationPitch": 12.5, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Boeing 787-8",
    "engine": "RR Trent 1000",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 180.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.26, "vrBase": 105, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 17, "trimHeavy": 42, "trimRefLow": 139, "trimRefHigh": 227.9,
    "vrefScale": 0.32, "vrefBase": 90,
    "rotationPitch": 13.5, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Boeing 787-9",
    "engine": "GEnx-1B",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 200.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.22, "vrBase": 108, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 150, "trimRefHigh": 254.0,
    "vrefScale": 0.29, "vrefBase": 92,
    "rotationPitch": 12.5, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Boeing 787-10",
    "engine": "GEnx-1B",
    "flaps": ["1", "5", "15", "20", "25", "30"],
    "takeoffLogic": { "threshold": 220.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "30",
    "vrScale": 0.19, "vrBase": 111, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 15, "trimHeavy": 37, "trimRefLow": 157, "trimRefHigh": 254.0,
    "vrefScale": 0.26, "vrefBase": 94,
    "rotationPitch": 11.5, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Bombardier CRJ-200",
    "engine": "GE CF34-3B",
    "flaps": ["0", "8", "20", "30", "45"],
    "takeoffLogic": { "threshold": 21.0, "low": "8", "high": "20", "short": "20" },
    "landingFlaps": "45",
    "vrScale": 1.95, "vrBase": 88, "v1Offset": 5, "v2Offset": 6,
    "trimLight": 10, "trimHeavy": 28, "trimRefLow": 16, "trimRefHigh": 23.1,
    "vrefScale": 1.62, "vrefBase": 92,
    "rotationPitch": 14.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Bombardier CRJ-700",
    "engine": "GE CF34-8C1",
    "flaps": ["0", "8", "20", "30", "45"],
    "takeoffLogic": { "threshold": 32.0, "low": "8", "high": "20", "short": "20" },
    "landingFlaps": "45",
    "vrScale": 1.45, "vrBase": 90, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 9, "trimHeavy": 26, "trimRefLow": 23, "trimRefHigh": 34.0,
    "vrefScale": 1.28, "vrefBase": 94,
    "rotationPitch": 13.5, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Bombardier CRJ-900",
    "engine": "GE CF34-8C5",
    "flaps": ["0", "8", "20", "30", "45"],
    "takeoffLogic": { "threshold": 36.0, "low": "8", "high": "20", "short": "20" },
    "landingFlaps": "45",
    "vrScale": 1.32, "vrBase": 92, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 8, "trimHeavy": 24, "trimRefLow": 25, "trimRefHigh": 38.3,
    "vrefScale": 1.15, "vrefBase": 96,
    "rotationPitch": 12.5, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "Bombardier CRJ-1000",
    "engine": "GE CF34-8C5",
    "flaps": ["0", "8", "20", "30", "45"],
    "takeoffLogic": { "threshold": 39.0, "low": "8", "high": "20", "short": "20" },
    "landingFlaps": "45",
    "vrScale": 1.25, "vrBase": 93, "v1Offset": 4, "v2Offset": 5,
    "trimLight": 8, "trimHeavy": 22, "trimRefLow": 27, "trimRefHigh": 41.6,
    "vrefScale": 1.08, "vrefBase": 97,
    "rotationPitch": 11.5, "tailstrikeRisk": "Very High"
  },
  {
    "aircraft": "Bombardier Dash 8 Q400",
    "engine": "PW150A Turboprop",
    "flaps": ["0", "5", "10", "15", "35"],
    "takeoffLogic": { "threshold": 26.0, "low": "5", "high": "15", "short": "15" },
    "landingFlaps": "35",
    "vrScale": 1.65, "vrBase": 72, "v1Offset": 3, "v2Offset": 4,
    "trimLight": 9, "trimHeavy": 26, "trimRefLow": 20, "trimRefHigh": 29.6,
    "vrefScale": 1.40, "vrefBase": 78,
    "rotationPitch": 10.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Embraer E175",
    "engine": "GE CF34-8E",
    "flaps": ["0", "1", "2", "3", "4", "5", "FULL"],
    "takeoffLogic": { "threshold": 36.0, "low": "1", "high": "2", "short": "3" },
    "landingFlaps": "5",
    "vrScale": 1.35, "vrBase": 82, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 11, "trimHeavy": 30, "trimRefLow": 25, "trimRefHigh": 37.5,
    "vrefScale": 1.18, "vrefBase": 86,
    "rotationPitch": 14.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "Embraer E190",
    "engine": "GE CF34-10E",
    "flaps": ["0", "1", "2", "3", "4", "5", "FULL"],
    "takeoffLogic": { "threshold": 44.0, "low": "1", "high": "2", "short": "3" },
    "landingFlaps": "5",
    "vrScale": 1.12, "vrBase": 86, "v1Offset": 4, "v2Offset": 4,
    "trimLight": 10, "trimHeavy": 27, "trimRefLow": 32, "trimRefHigh": 51.8,
    "vrefScale": 1.02, "vrefBase": 89,
    "rotationPitch": 12.5, "tailstrikeRisk": "High"
  },
  {
    "aircraft": "McDonnell Douglas DC-10",
    "engine": "GE CF6-50C",
    "flaps": ["0", "5", "15", "22", "35", "50"],
    "takeoffLogic": { "threshold": 210.0, "low": "15", "high": "22", "short": "22" },
    "landingFlaps": "35",
    "vrScale": 0.24, "vrBase": 108, "v1Offset": 7, "v2Offset": 8,
    "trimLight": 17, "trimHeavy": 42, "trimRefLow": 140, "trimRefHigh": 263.0,
    "vrefScale": 0.31, "vrefBase": 92,
    "rotationPitch": 13.0, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "McDonnell Douglas DC-10F",
    "engine": "GE CF6-50C",
    "flaps": ["0", "5", "15", "22", "35", "50"],
    "takeoffLogic": { "threshold": 220.0, "low": "15", "high": "22", "short": "22" },
    "landingFlaps": "35",
    "vrScale": 0.23, "vrBase": 109, "v1Offset": 7, "v2Offset": 8,
    "trimLight": 17, "trimHeavy": 42, "trimRefLow": 130, "trimRefHigh": 263.0,
    "vrefScale": 0.30, "vrefBase": 93,
    "rotationPitch": 12.5, "tailstrikeRisk": "Low"
  },
  {
    "aircraft": "McDonnell Douglas MD-11",
    "engine": "PW4460",
    "flaps": ["0", "10", "15", "28", "35", "50"],
    "takeoffLogic": { "threshold": 230.0, "low": "15", "high": "28", "short": "28" },
    "landingFlaps": "35",
    "vrScale": 0.21, "vrBase": 112, "v1Offset": 6, "v2Offset": 7,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 150, "trimRefHigh": 286.0,
    "vrefScale": 0.28, "vrefBase": 96,
    "rotationPitch": 12.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "McDonnell Douglas MD-11F",
    "engine": "GE CF6-80C2",
    "flaps": ["0", "10", "15", "28", "35", "50"],
    "takeoffLogic": { "threshold": 240.0, "low": "15", "high": "28", "short": "28" },
    "landingFlaps": "35",
    "vrScale": 0.20, "vrBase": 114, "v1Offset": 6, "v2Offset": 7,
    "trimLight": 16, "trimHeavy": 40, "trimRefLow": 145, "trimRefHigh": 286.0,
    "vrefScale": 0.27, "vrefBase": 97,
    "rotationPitch": 11.5, "tailstrikeRisk": "Medium"
  }
];

export const getFlapString = (aircraftName, flapIndex) => {
  if (flapIndex < 0) return 'UP';
  const config = findAircraftConfig(aircraftName);

  if (config && config.flaps) {
    const hasZero = config.flaps[0] === "0";

    if (hasZero) {
      if (flapIndex < config.flaps.length) {
        return config.flaps[flapIndex] === "0" ? "UP" : config.flaps[flapIndex];
      }
    } else {
      if (flapIndex === 0) return "UP";
      if (flapIndex > 0 && flapIndex - 1 < config.flaps.length) {
        return config.flaps[flapIndex - 1];
      }
    }
  }

  // Fallback if not found
  return flapIndex === 0 ? "UP" : `${flapIndex}`;
};

function applyEnvironmentalCorrections(baseSpeed, oat, headwindComp) {
  // OAT Correction: ISA deviation mapping (15C baseline)
  const oatCorrection = Math.round((oat - 15) / 10);

  // Wind Correction: Negative for headwinds, positive for tailwinds
  let windCorrection = 0;
  if (headwindComp > 0) {
    windCorrection = -Math.floor(headwindComp / 10);
  } else if (headwindComp < 0) {
    const tailwind = Math.abs(headwindComp);
    windCorrection = Math.floor(tailwind / 5) * 2;
  }

  return Math.round(baseSpeed + oatCorrection + windCorrection);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Resolve an aircraft name to its config entry.
 *
 * A plain `find` with a bidirectional `includes` returns whichever entry sits
 * first in the array, so "A330-200F" matched "A330-200" and quietly returned
 * the passenger variant's numbers. Same for the DC-10F and MD-11F. We now
 * prefer an exact match, then fall back to the LONGEST partial match, which
 * keeps the freighter from losing to its shorter passenger counterpart.
 */
function findAircraftConfig(aircraftName) {
  const nameUpper = (aircraftName || '').toUpperCase().trim();
  if (!nameUpper) return undefined;

  const exact = aircraftPerformanceData.find(
    (c) => c.aircraft.toUpperCase() === nameUpper
  );
  if (exact) return exact;

  let best;
  let bestLen = -1;
  for (const c of aircraftPerformanceData) {
    const cUpper = c.aircraft.toUpperCase();
    if (nameUpper.includes(cUpper) || cUpper.includes(nameUpper)) {
      if (cUpper.length > bestLen) {
        best = c;
        bestLen = cUpper.length;
      }
    }
  }
  return best;
}

/**
 * Nose-up trim, as an Infinite Flight percentage (0-100).
 *
 * Trim is interpolated between a light-weight setting and an MTOW setting.
 * Because the output is a blend of two in-range endpoints it can never escape
 * that range, so no post-hoc clamp is needed.
 *
 * `trimLight`  is calibrated for the aircraft near its low-payload weight,
 *              flying the LOW takeoff flap setting.
 * `trimHeavy`  is calibrated at MTOW flying the HIGH takeoff flap setting.
 *
 * Since heavier weights also select more flap, the flap effect is already
 * baked into the interpolation and the curve stays continuous — there is no
 * step at the flap-change threshold.
 */
function calculateTrim(config, weight, flapOverride = null) {
  const span = config.trimRefHigh - config.trimRefLow;
  const loadFactor = span > 0
    ? clamp01((weight - config.trimRefLow) / span)
    : 0;

  let trim = config.trimLight + (config.trimHeavy - config.trimLight) * loadFactor;

  // More flap = more lift at lower AoA = less nose-up trim required.
  // Applied only when the pilot overrides the recommended flap setting.
  if (flapOverride !== null && Array.isArray(config.flaps)) {
    const recommended = weight > config.takeoffLogic.threshold
      ? config.takeoffLogic.high
      : config.takeoffLogic.low;
    const iRec = config.flaps.indexOf(recommended);
    const iSel = config.flaps.indexOf(String(flapOverride));
    if (iRec !== -1 && iSel !== -1 && iSel !== iRec) {
      trim *= Math.pow(0.80, iSel - iRec);
    }
  }

  return Math.max(0, Math.min(100, Math.round(trim * 10) / 10));
}

export const calculatePerformance = (aircraftName, weightKG, oat = 15, headwindComp = 0, flapOverride = null) => {
  const weight = weightKG / 1000;

  const config = findAircraftConfig(aircraftName);

  if (!config) {
    const vrBase = Math.round(140 + ((weight - 60) / 2));
    return {
      v1: vrBase - 5,
      vr: vrBase,
      v2: vrBase + 12,
      trim: Math.round((14 + 26 * clamp01((weight - 40) / 200)) * 10) / 10,
      vref: vrBase - 5,
      takeoffFlaps: "1"
    };
  }

  const vrBaseCalc = (weight * config.vrScale) + config.vrBase;
  const vr = applyEnvironmentalCorrections(vrBaseCalc, oat, headwindComp);

  const v1 = vr - config.v1Offset;
  const v2 = vr + config.v2Offset;

  const trim = calculateTrim(config, weight, flapOverride);

  const vrefBaseCalc = (weight * config.vrefScale) + config.vrefBase;
  const vref = applyEnvironmentalCorrections(vrefBaseCalc, oat, headwindComp);

  let recommendedFlaps = config.takeoffLogic.low;
  if (weight > config.takeoffLogic.threshold) {
    recommendedFlaps = config.takeoffLogic.high;
  }

  return {
    v1,
    vr,
    v2,
    trim,
    vref,
    takeoffFlaps: recommendedFlaps
  };
};
