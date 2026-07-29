import { AppState, Platform } from "react-native";

const TRACE_ENABLED = process.env.EXPO_PUBLIC_RUNTIME_TRACE_ENABLED !== "false";
const DEFAULT_THROTTLE_MS = 10000;

const lastLogByKey = new Map();

const getRuntime = () => ({
  runtime: "js",
  platform: Platform.OS,
  appState: AppState.currentState || "unknown",
});

export function runtimeTrace(stage, details = {}, { throttleMs = DEFAULT_THROTTLE_MS, key = stage } = {}) {
  if (!TRACE_ENABLED) return;

  const now = Date.now();
  const previous = lastLogByKey.get(key) || 0;
  if (throttleMs > 0 && now - previous < throttleMs) return;
  lastLogByKey.set(key, now);

  const payload = {
    ts: new Date(now).toISOString(),
    stage,
    ...getRuntime(),
    ...details,
  };

  try {
    console.log(`[RuntimeTrace] ${JSON.stringify(payload)}`);
  } catch (error) {
    console.log("[RuntimeTrace] log failed", stage, error?.message || error);
  }
}
