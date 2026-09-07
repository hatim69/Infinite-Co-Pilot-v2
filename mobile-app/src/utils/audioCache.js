import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Base URL from our environment variables
const CDN_URL = process.env.EXPO_PUBLIC_AUDIO_CDN_URL || "";
const AUDIO_CACHE_DIR = `${FileSystem.documentDirectory}audio_cache/`;

const getAudioCacheFileUri = (remoteFileName) => {
  const safeLocalName = remoteFileName.replace(/\//g, "_");
  return {
    safeLocalName,
    localFileUri: `${AUDIO_CACHE_DIR}${safeLocalName}`,
  };
};

export const isLocalCachedAudioUri = (uri) =>
  typeof uri === "string" && uri.startsWith(AUDIO_CACHE_DIR);

export const getExistingCachedAudioUri = async (remoteFileName) => {
  if (!remoteFileName) return null;

  const { localFileUri } = getAudioCacheFileUri(remoteFileName);
  const fileInfo = await FileSystem.getInfoAsync(localFileUri);
  return fileInfo.exists ? localFileUri : null;
};

/**
 * Downloads an audio file from the CDN if it isn't already cached.
 * Returns the local file URI, which can be passed directly to expo-audio.
 * If downloading fails, it gracefully falls back to returning the remote URL directly for streaming.
 *
 * @param {string} remoteFileName - e.g., "announcements/air-france.mp3"
 * @param {string} fallbackFileName - e.g., "announcements/fallback.mp3"
 * @param {{ allowRemoteFallback?: boolean }} options - Set allowRemoteFallback false for local-only playback paths.
 * @returns {Promise<string>} - The URI to the audio file (local file:// or remote https://).
 */
export const getCachedAudioUri = async (remoteFileName, fallbackFileName = null, options = {}) => {
  const allowRemoteFallback = options.allowRemoteFallback !== false;

  if (!CDN_URL) {
    console.error("[AudioCache] CDN URL not set in .env! Did you restart the Expo server (npx expo start -c)?");
    Alert.alert("Missing Config", "EXPO_PUBLIC_AUDIO_CDN_URL is not set in this build.");
    return null;
  }

  const remoteUrl = `${CDN_URL.replace(/\/$/, '')}/${remoteFileName}`;
  const { safeLocalName, localFileUri } = getAudioCacheFileUri(remoteFileName);

  try {
    // 1. Ensure the cache directory exists
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(AUDIO_CACHE_DIR, { intermediates: true });
    }

    // 2. Check if the file is already downloaded
    const fileInfo = await FileSystem.getInfoAsync(localFileUri);
    if (fileInfo.exists) {
      if (fileInfo.size < 1024) { // 1KB
        console.log(`[AudioCache] Cached file is suspiciously small (${fileInfo.size} bytes). Deleting it.`);
        await FileSystem.deleteAsync(localFileUri, { idempotent: true });
      } else {
        console.log(`[AudioCache] Serving from LOCAL device cache: ${safeLocalName}`);
        return localFileUri;
      }
    }

    // 3. Download the file from R2
    console.log(`[AudioCache] Downloading to device: ${remoteUrl}`);
    const downloadResult = await FileSystem.downloadAsync(remoteUrl, localFileUri, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36"
      }
    });
    
    if (downloadResult.status === 200) {
      const contentType = downloadResult.headers && (downloadResult.headers['Content-Type'] || downloadResult.headers['content-type']);
      if (contentType && contentType.includes('text/html')) {
        await FileSystem.deleteAsync(localFileUri, { idempotent: true });
        throw new Error(`Server returned HTML instead of audio. Cloudflare challenge suspected.`);
      }
      console.log(`[AudioCache] Successfully saved locally: ${safeLocalName}`);
      return downloadResult.uri;
    } else {
      await FileSystem.deleteAsync(localFileUri, { idempotent: true });
      throw new Error(`Server returned status code ${downloadResult.status}`);
    }

  } catch (error) {
    console.warn(`[AudioCache] Local caching failed for ${remoteFileName}:`, error.message);
    Alert.alert("Audio Download Error", `Failed to cache ${remoteFileName}: ${error.message}`);
    
    if (allowRemoteFallback) {
      console.log(`[AudioCache] Falling back to streaming directly from remote URL...`);
    } else {
      console.log(`[AudioCache] Remote streaming fallback disabled for this request.`);
    }
    
    // Fallback 1: Try to stream the requested file directly
    if (allowRemoteFallback && error.message && !error.message.includes("404")) {
      return remoteUrl;
    }

    // Fallback 2: Try the fallback file
    if (fallbackFileName && fallbackFileName !== remoteFileName) {
      console.log(`[AudioCache] Attempting to use fallback file: ${fallbackFileName}`);
      return await getCachedAudioUri(fallbackFileName, null, options);
    }

    return null;
  }
};
