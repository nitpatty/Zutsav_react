import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { urls } from '../config';
import { useLanguageStore } from '../i18n/languageStore';
import { applyContentLanguage } from './contentLanguage';

const api = axios.create({
  baseURL: urls.apiUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from secure storage on every request
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('zutsav_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {}
  return config;
});

// Ask for server-translated content in the app's UI language (GET + supported non-English code only — see
// contentLanguage.js). Reads the language store directly (no React, no store → API call), so there is no cycle.
api.interceptors.request.use((config) => applyContentLanguage(config, useLanguageStore.getState().language));

// ── Session expiry ───────────────────────────────────────────────────────────
// This module must not import the auth store (authStore → api would become a
// cycle), so the store registers a callback here instead (see authStore.js).
let sessionExpiredHandler = null;
export const setSessionExpiredHandler = (fn) => { sessionExpiredHandler = fn; };

// Endpoints that answer 401 for a wrong *credential*, not an invalid session:
// a failed login, a wrong password on the delete-account check (an authenticated
// route), and the logout call itself (local cleanup follows it anyway).
// Matched on the path so a typo'd password never signs the user out.
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/delete-account/check-password', '/auth/logout'];
const isCredentialEndpoint = (url = '') => CREDENTIAL_ENDPOINTS.some((p) => url.startsWith(p));

// A 401 is only a confirmed session expiry when ALL of these hold:
//  - the server actually answered with 401 (never a timeout / offline / 403 / 5xx);
//  - the request carried a Bearer token (an anonymous 401 says nothing about a session);
//  - it was not a credential-check endpoint (above);
//  - that token is still the CURRENT stored one. A late 401 for an old token
//    (e.g. arriving after the user re-logged-in, or after cleanup already ran)
//    must not sign out the new session.
async function isConfirmedSessionExpiry(err) {
  if (err?.response?.status !== 401) return false;
  const sent = err.config?.headers?.Authorization;
  if (!sent || isCredentialEndpoint(err.config?.url)) return false;
  try {
    const current = await SecureStore.getItemAsync('zutsav_token');
    return !!current && sent === `Bearer ${current}`;
  } catch {
    return false;
  }
}

// Global error normalisation
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (sessionExpiredHandler && await isConfirmedSessionExpiry(err)) {
      // Fire-and-forget: the handler is idempotent (a burst of concurrent 401s
      // shares one cleanup) and the original error is still rejected to the caller.
      Promise.resolve()
        .then(sessionExpiredHandler)
        .catch((e) => console.warn('[auth] session-expiry handler failed:', e?.message));
    }
    return Promise.reject(err);
  }
);

export const imageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // Strip any leading slash(es) — most upload endpoints return a bare
  // `uploads/...` path, but a couple (e.g. pooja images) return one with a
  // leading slash. Naively concatenating that onto baseUrl produces a
  // double slash (`host//uploads/...`) that the static file server won't
  // match, so the image silently fails to load. Mirrors the same guard in
  // the web app's getImageUrl().
  return `${urls.baseUrl}/${path.replace(/^\/+/, '')}`;
};

export default api;
