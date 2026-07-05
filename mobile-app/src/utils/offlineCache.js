import AsyncStorage from '@react-native-async-storage/async-storage';

// Tiny cache-aside helper pair, mirroring the same AsyncStorage key-prefix
// convention already used by themeStore.js ('zutsav_theme'). Not a sync
// engine — just "remember the last good response so a screen isn't blank
// while offline, or before this fetch resolves."
const PREFIX = 'zutsav_cache_';

export async function saveCache(key, data) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {}
}

export async function loadCache(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
