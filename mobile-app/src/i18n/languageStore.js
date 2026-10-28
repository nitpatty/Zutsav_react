/**
 * Device-level UI language: in memory + SecureStore `zutsav_language`.
 *
 * This module imports no API client and no auth store (the API client and the auth store both import THIS file),
 * so there is no import cycle and no re-entrant HTTP from a store update.
 *
 * Policy (tested):
 *  - English is the safe default; a stored/received code is used only if it is a supported code that also has a
 *    shipped dictionary (`toAvailableLocale`); anything else — stale, region-tagged, unknown — is ignored.
 *  - `hydrate()` is idempotent and always sets `ready`, even if SecureStore throws.
 *  - The account preference applies only when the account actually carries a usable value; an omitted or
 *    unusable value leaves the device preference untouched.
 *  - The language is device-level: sessionCleanup deliberately keeps `zutsav_language` on logout.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_LOCALE, toAvailableLocale } from './locales';

export const LANGUAGE_STORAGE_KEY = 'zutsav_language';

let hydratePromise = null;

export const useLanguageStore = create((set, get) => ({
  language: DEFAULT_LOCALE,
  ready: false,
  // A language the user chose that the server has not confirmed yet (offline / failed PATCH). In memory only.
  pendingSync: null,

  /** Reads the stored language once. Safe to await from anywhere; never rejects. */
  hydrate: () => {
    if (!hydratePromise) {
      hydratePromise = (async () => {
        try {
          const stored = toAvailableLocale(await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY));
          // Do not clobber a language the user picked while storage was still being read.
          if (stored && !get().ready && get().language === DEFAULT_LOCALE) set({ language: stored });
        } catch {
          // storage unavailable → English
        } finally {
          set({ ready: true });
        }
      })();
    }
    return hydratePromise;
  },

  /**
   * Switches the UI language and persists it locally (also used for an account value received at login).
   * Returns false (and changes nothing) for an unavailable code. Never calls the server.
   */
  setLanguage: async (code) => {
    const next = toAvailableLocale(code);
    if (!next) return false;
    set({ language: next });
    try {
      await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // the in-memory language still applies for this session
    }
    return true;
  },
}));

/**
 * Applies `user.preferredLanguage` from an authenticated response. Account value wins; a missing/unusable value
 * changes nothing. Never talks to the server.
 *   force: true  → a new sign-in (login, OTP login, registration): the account value always wins and any unsynced
 *                  local choice is dropped.
 *   force: false → a background refresh (getMe): an unsynced local choice (failed PATCH) is NOT overwritten by the
 *                  server's older value during this session.
 * @returns {Promise<boolean>} true when the UI language changed
 */
export async function applyAccountLanguage(user, { force = false } = {}) {
  const raw = user && typeof user.preferredLanguage === 'string' ? user.preferredLanguage : '';
  const preferred = toAvailableLocale(raw);
  if (!preferred) return false;
  await useLanguageStore.getState().hydrate();
  if (force) useLanguageStore.setState({ pendingSync: null });
  else if (useLanguageStore.getState().pendingSync) return false;
  if (useLanguageStore.getState().language === preferred) return false;
  return useLanguageStore.getState().setLanguage(preferred);
}

/** Test helper: forget the one-shot hydration so a test can start from a clean store. */
export function __resetLanguageStore() {
  hydratePromise = null;
  useLanguageStore.setState({ language: DEFAULT_LOCALE, ready: false, pendingSync: null });
}
