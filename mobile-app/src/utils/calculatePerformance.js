export const aircraftPerformanceData = [
  {
    "aircraft": "Airbus A220-300",
    "engine": "Pratt & Whitney PW1500G",
    "flaps": ["0", "1", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 60.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 1.05, "vrBase": 72, "v1Offset": 4, "v2Offset": 4,
    "trimBase": 35, "trimMinWeight": 45, "trimScale": 0.70,
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
    "trimBase": 34, "trimMinWeight": 45, "trimScale": 0.65,
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
    "trimBase": 33, "trimMinWeight": 50, "trimScale": 0.60,
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
    "trimBase": 30, "trimMinWeight": 55, "trimScale": 0.60,
    "vrefScale": 0.75, "vrefBase": 78,
    "rotationPitch": 15.0, "tailstrikeRisk": "Medium"
  },
  {
    "aircraft": "Airbus A321-200",
    "engine": "IAE V2500",
    "flaps": ["0", "1", "2", "3", "FULL"],
    "takeoffLogic": { "threshold": 80.0, "low": "1", "high": "2", "short": "2" },
    "landingFlaps": "FULL",
    "vrScale": 0.74, "vrBase": 92, "v1Offset": 4, "v2Offset": 4,
    "trimBase": 28, "trimMinWeight": 65, "trimScale": 0.45,
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
    "trimBase": 22, "trimMinWeight": 150, "trimScale": 0.05,
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
    "trimBase": 23, "trimMinWeight": 150, "trimScale": 0.05,
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
    "trimBase": 21, "trimMinWeight": 170, "trimScale": 0.04,
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
    "trimBase": 22, "trimMinWeight": 160, "trimScale": 0.045,
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
    "trimBase": 20, "trimMinWeight": 175, "trimScale": 0.04,
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
    "trimBase": 18, "trimMinWeight": 220, "trimScale": 0.03,
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
    "trimBase": 18, "trimMinWeight": 190, "trimScale": 0.03,
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
    "trimBase": 20, "trimMinWeight": 192, "trimScale": 0.04,
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
    "trimBase": 12, "trimMinWeight": 350, "trimScale": 0.015,
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
    "trimBase": 8.5, "trimMinWeight": 40, "trimScale": 0.15,
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
    "trimBase": 7.2, "trimMinWeight": 50, "trimScale": 0.11,
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
    "trimBase": 6.8, "trimMinWeight": 55, "trimScale": 0.09,
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
    "trimBase": 6.6, "trimMinWeight": 55, "trimScale": 0.09,
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
    "trimBase": 6.4, "trimMinWeight": 60, "trimScale": 0.08,
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
    "trimBase": 9.0, "trimMinWeight": 240, "trimScale": 0.02,
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
    "trimBase": 8.5, "trimMinWeight": 250, "trimScale": 0.018,
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
    "trimBase": 8.0, "trimMinWeight": 280, "trimScale": 0.015,
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
    "trimBase": 7.0, "trimMinWeight": 70, "trimScale": 0.06,
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
    "trimBase": 6.5, "trimMinWeight": 110, "trimScale": 0.035,
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
    "trimBase": 6.0, "trimMinWeight": 180, "trimScale": 0.02,
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
    "trimBase": 5.8, "trimMinWeight": 190, "trimScale": 0.018,
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
    "trimBase": 5.5, "trimMinWeight": 220, "trimScale": 0.015,
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
    "trimBase": 5.8, "trimMinWeight": 200, "trimScale": 0.017,
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
    "trimBase": 7.5, "trimMinWeight": 130, "trimScale": 0.035,
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
    "trimBase": 7.0, "trimMinWeight": 150, "trimScale": 0.03,
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
    "trimBase": 6.8, "trimMinWeight": 170, "trimScale": 0.025,
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
    "trimBase": 7.8, "trimMinWeight": 16, "trimScale": 0.40,
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
    "trimBase": 7.5, "trimMinWeight": 25, "trimScale": 0.25,
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
    "trimBase": 7.2, "trimMinWeight": 28, "trimScale": 0.20,
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
    "trimBase": 7.0, "trimMinWeight": 30, "trimScale": 0.18,
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
    "trimBase": 4.5, "trimMinWeight": 20, "trimScale": 0.20,
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
    "trimBase": 6.5, "trimMinWeight": 28, "trimScale": 0.22,
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
    "trimBase": 6.0, "trimMinWeight": 34, "trimScale": 0.18,
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
    "trimBase": 14.5, "trimMinWeight": 160, "trimScale": 0.05,
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
    "trimBase": 14.8, "trimMinWeight": 160, "trimScale": 0.05,
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
    "trimBase": 12.0, "trimMinWeight": 180, "trimScale": 0.04,
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
    "trimBase": 12.2, "trimMinWeight": 180, "trimScale": 0.04,
    "vrefScale": 0.27, "vrefBase": 97,
    "rotationPitch": 11.5, "tailstrikeRisk": "Medium"
  }
];

export const getFlapString = (aircraftName, flapIndex) => {
  if (flapIndex < 0) return 'UP';
  const nameUpper = (aircraftName || '').toUpperCase();
  const config = aircraftPerformanceData.find(c => {
    const cNameUpper = c.aircraft.toUpperCase();
    return nameUpper.includes(cNameUpper) || cNameUpper.includes(nameUpper);
  });

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

export const calculatePerformance = (aircraftName, weightKG, oat = 15, headwindComp = 0) => {
  const weight = weightKG / 1000;

  const config = aircraftPerformanceData.find(c => {
    const nameUpper = (aircraftName || '').toUpperCase();
    const cNameUpper = c.aircraft.toUpperCase();
    return nameUpper.includes(cNameUpper) || cNameUpper.includes(nameUpper);
  });

  if (!config) {
    const vrBase = Math.round(140 + ((weight - 60) / 2));
    return {
      v1: vrBase - 5,
      vr: vrBase,
      v2: vrBase + 12,
      trim: 20,
      vref: vrBase - 5,
      takeoffFlaps: "1"
    };
  }

  const vrBaseCalc = (weight * config.vrScale) + config.vrBase;
  const vr = applyEnvironmentalCorrections(vrBaseCalc, oat, headwindComp);

  const v1 = vr - config.v1Offset;
  const v2 = vr + config.v2Offset;

  const trim = config.trimBase - ((weight - config.trimMinWeight) * config.trimScale);
  const trimClamped = Math.max(0, Math.round(trim * 10) / 10);

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
    trim: trimClamped,
    vref,
    takeoffFlaps: recommendedFlaps
  };
};
