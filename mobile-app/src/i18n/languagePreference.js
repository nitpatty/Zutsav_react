/**
 * User-initiated language change: local first, then (only when signed in) the account preference.
 *
 *   PATCH /api/auth/preferred-language   body { preferredLanguage: '<code>' }   → { success, preferredLanguage }
 *   (backend/src/controllers/auth.controller.js updatePreferredLanguage; auth required; 400 'Unsupported language')
 *
 * Rules (tested):
 *  - The local language changes and is persisted immediately, whatever happens to the request.
 *  - Guests make no request. Choosing the language already in effect makes no request.
 *  - At most one request is in flight; quick successive changes collapse so the LAST choice is what the server ends
 *    with, and a choice the account already has is never re-sent.
 *  - A failed request keeps the local language and is reported to the caller as `synced: false`; it never clears the
 *    session (a 401 is handled by the shared API client's session-expiry logic, not here).
 *  - Values received FROM the server (login, getMe) are applied by applyAccountLanguage() and are never written back.
 */
import * as SecureStore from 'expo-secure-store';
import api from '../api/axios';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from './languageStore';
import { toAvailableLocale } from './locales';

let wanted = null;      // latest code the account should end up with
let running = null;     // promise of the single sync loop (callers await it)
let active = false;     // true while that loop is executing
let lastResult = null;

async function remember(code) {
  // Keep the cached user (and its SecureStore copy) in step so a later refresh does not look stale.
  const { user } = useAuthStore.getState();
  if (!user) return;
  const next = { ...user, preferredLanguage: code };
  useAuthStore.setState({ user: next });
  try { await SecureStore.setItemAsync('zutsav_user', JSON.stringify(next)); } catch { /* cache only */ }
}

async function syncLoop() {
  active = true; // set synchronously, so a caller can never miss a running loop
  let result = { synced: true };
  while (wanted) {
    const code = wanted;
    wanted = null;
    const { token, user } = useAuthStore.getState();
    if (!token) { result = { synced: false, reason: 'guest' }; continue; }
    if (user?.preferredLanguage === code) { result = { synced: true, skipped: true }; continue; }
    try {
      await api.patch('/auth/preferred-language', { preferredLanguage: code });
      await remember(code);
      if (useLanguageStore.getState().pendingSync === code) useLanguageStore.setState({ pendingSync: null });
      result = { synced: true };
    } catch (error) {
      useLanguageStore.setState({ pendingSync: code }); // keep the local choice until the server accepts it
      result = { synced: false, reason: 'request-failed', error };
    }
  }
  active = false; // same tick as the final `wanted` check: nothing can slip in between
  lastResult = result;
  return result;
}

/**
 * @param {string} code a supported + available locale code
 * @returns {Promise<{ changed: boolean, synced: boolean, reason?: string, error?: unknown }>}
 */
export async function changeLanguage(code) {
  const next = toAvailableLocale(code);
  if (!next) return { changed: false, synced: false, reason: 'unavailable' };
  if (useLanguageStore.getState().language === next && !wanted && !active) {
    return { changed: false, synced: true, reason: 'unchanged' };
  }
  await useLanguageStore.getState().setLanguage(next);
  if (!useAuthStore.getState().token) return { changed: true, synced: false, reason: 'guest' };

  wanted = next;
  if (!active) running = syncLoop(); // a running loop will pick `wanted` up itself
  const result = await running;
  return { changed: true, ...result };
}

export const __resetLanguagePreference = () => { wanted = null; running = null; active = false; lastResult = null; };
export const __lastSyncResult = () => lastResult;
