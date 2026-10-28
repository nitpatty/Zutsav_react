import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguageStore } from '../i18n/languageStore';

// Tiny cache-aside helper pair, mirroring the same AsyncStorage key-prefix
// convention already used by themeStore.js ('zutsav_theme'). Not a sync
// engine — just "remember the last good response so a screen isn't blank
// while offline, or before this fetch resolves."
const PREFIX = 'zutsav_cache_';

// Cached responses can hold server-TRANSLATED content (festivals, notifications…), so an entry is stored under the
// language it was fetched in and is never read back under another one. English keeps the original key
// ('zutsav_cache_<key>'); other languages use 'zutsav_cache_<lang>:<key>'. Every key still starts with PREFIX, so
// clearAllCache() (logout / session expiry) removes all of them.
const cacheKey = (key) => {
  const lang = useLanguageStore.getState().language;
  return PREFIX + (lang && lang !== 'en' ? lang + ':' : '') + key;
};

// Removes every cache entry written by saveCache(). Cached responses are
// per-account (e.g. notifications), so this runs on logout / session expiry.
// Only keys with our prefix are touched — never theme or other app settings.
// Throws on storage failure so the caller can report it.
export async function clearAllCache() {
  const keys = await AsyncStorage.getAllKeys();
  const mine = keys.filter((k) => k.startsWith(PREFIX));
  if (mine.length) await AsyncStorage.multiRemove(mine);
}

export async function saveCache(key, data) {
  try {
    await AsyncStorage.setItem(cacheKey(key), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {}
}

export async function loadCache(key) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(key));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
