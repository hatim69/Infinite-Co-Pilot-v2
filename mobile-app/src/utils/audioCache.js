import * as FileSystem from 'expo-file-system/legacy';

// Base URL from our environment variables
const CDN_URL = process.env.EXPO_PUBLIC_AUDIO_CDN_URL || "";

/**
 * Downloads an audio file from the CDN if it isn't already cached.
 * Returns the local file URI, which can be passed directly to expo-audio.
 * If downloading fails, it gracefully falls back to returning the remote URL directly for streaming.
 *
 * @param {string} remoteFileName - e.g., "announcements/air-france.mp3"
 * @param {string} fallbackFileName - e.g., "announcements/fallback.mp3"
 * @returns {Promise<string>} - The URI to the audio file (local file:// or remote https://).
 */
export const getCachedAudioUri = async (remoteFileName, fallbackFileName = null) => {
  if (!CDN_URL) {
    console.error("[AudioCache] CDN URL not set in .env! Did you restart the Expo server (npx expo start -c)?");
    return null;
  }

  const remoteUrl = `${CDN_URL.replace(/\/$/, '')}/${remoteFileName}`;
  const localCacheDir = `${FileSystem.documentDirectory}audio_cache/`;
  const safeLocalName = remoteFileName.replace(/\//g, "_");
  const localFileUri = `${localCacheDir}${safeLocalName}`;

  try {
    // 1. Ensure the cache directory exists
    const dirInfo = await FileSystem.getInfoAsync(localCacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(localCacheDir, { intermediates: true });
    }

    // 2. Check if the file is already downloaded
    const fileInfo = await FileSystem.getInfoAsync(localFileUri);
    if (fileInfo.exists) {
      console.log(`[AudioCache] Serving from LOCAL device cache: ${safeLocalName}`);
      return localFileUri;
    }

    // 3. Download the file from R2
    console.log(`[AudioCache] Downloading to device: ${remoteUrl}`);
    const downloadResult = await FileSystem.downloadAsync(remoteUrl, localFileUri);
    
    if (downloadResult.status === 200) {
      console.log(`[AudioCache] Successfully saved locally: ${safeLocalName}`);
      return downloadResult.uri;
    } else {
      await FileSystem.deleteAsync(localFileUri, { idempotent: true });
      throw new Error(`Server returned status code ${downloadResult.status}`);
    }

  } catch (error) {
    console.warn(`[AudioCache] Local caching failed for ${remoteFileName}:`, error.message);
    console.log(`[AudioCache] Falling back to streaming directly from remote URL...`);
    
    // Fallback 1: Try to stream the requested file directly
    if (error.message && !error.message.includes("404")) {
      return remoteUrl;
    }

    // Fallback 2: Try the fallback file
    if (fallbackFileName && fallbackFileName !== remoteFileName) {
      console.log(`[AudioCache] Attempting to use fallback file: ${fallbackFileName}`);
      return await getCachedAudioUri(fallbackFileName, null);
    }

    return null;
  }
};
