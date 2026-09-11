/**
 * audioCache.web.js
 *
 * Web implementation of audio cache.
 * Routes audio requests through the local bridge's CORS-enabled proxy on port 8088,
 * enabling seamless streaming of boarding music and safety briefing announcements
 * without browser CORS blocks.
 */

const BRIDGE_AUDIO_BASE = "http://localhost:8088/audio";

export const isLocalCachedAudioUri = (uri) => typeof uri === "string" && uri.length > 0;

export const getExistingCachedAudioUri = async (remoteFileName) => {
  if (!remoteFileName) return null;
  return `${BRIDGE_AUDIO_BASE}?file=${encodeURIComponent(remoteFileName)}`;
};

export const getCachedAudioUri = async (remoteFileName, fallbackFileName = null) => {
  if (!remoteFileName) return null;
  let url = `${BRIDGE_AUDIO_BASE}?file=${encodeURIComponent(remoteFileName)}`;
  if (fallbackFileName) {
    url += `&fallback=${encodeURIComponent(fallbackFileName)}`;
  }
  return url;
};
