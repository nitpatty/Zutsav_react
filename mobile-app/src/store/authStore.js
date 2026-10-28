import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api, { setSessionExpiredHandler } from '../api/axios';
import { clearLocalSession, clearUserScopedData } from '../utils/sessionCleanup';
import { applyAccountLanguage } from '../i18n/languageStore';

// Mobile always asks for the backend's persistent-session lifetime. The token is
// kept in SecureStore until it expires or the user logs out, so the short
// non-"remember" JWT (JWT_EXPIRES_IN_SESSION, default 1d — meant for browser
// sessionStorage) would just sign the user out daily. The backend maps
// `rememberMe: true` to JWT_EXPIRES_IN_REMEMBERED (code default '30d'); the
// duration is a server setting and is deliberately NOT encoded in the app.
// Admin-tier tokens ignore this flag (ADMIN_JWT_EXPIRES_IN, server sessions).
const REMEMBER_ME = true;

// Concurrent 401s all route here; they share one run.
let expiryInFlight = null;

export const useAuthStore = create((set, get) => ({
  user:    null,
  token:   null,
  loading: false,
  ready:   false,   // hydration complete

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('zutsav_token');
      const raw   = await SecureStore.getItemAsync('zutsav_user');
      if (token && raw) {
        set({ token, user: JSON.parse(raw), ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  login: async (emailOrPhone, password) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/auth/login', { emailOrPhone, password, rememberMe: REMEMBER_ME });
      if (!data.deletionPending) {
        await clearUserScopedData(); // no previous account's cart/cache may carry over
        await SecureStore.setItemAsync('zutsav_token', data.token);
        await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
        set({ user: data.user, token: data.token, loading: false });
        await applyAccountLanguage(data.user, { force: true }); // the account's language preference wins at login
      } else {
        set({ loading: false });
      }
      return data;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  setSession: async (token, user) => {
    await clearUserScopedData();
    await SecureStore.setItemAsync('zutsav_token', token);
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(user));
    set({ user, token });
    await applyAccountLanguage(user, { force: true });
  },

  sendLoginOtp: async (emailOrPhone) => {
    const { data } = await api.post('/auth/login/otp/send', { emailOrPhone });
    return data;
  },

  loginWithOtp: async (emailOrPhone, otp) => {
    const { data } = await api.post('/auth/login/otp/verify', { emailOrPhone, otp, rememberMe: REMEMBER_ME });
    // deletion_pending accounts resume the 30-day grace period — no token is
    // issued and no session is persisted (mirrors password login)
    if (!data.deletionPending) {
      await clearUserScopedData();
      await SecureStore.setItemAsync('zutsav_token', data.token);
      await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token });
      await applyAccountLanguage(data.user, { force: true });
    }
    return data;
  },

  // Wipes the local session: credentials, per-account caches/stores (see
  // utils/sessionCleanup) and the in-memory auth state, which makes RootNavigator
  // fall back to the Auth stack. Local only — never calls the server. Idempotent.
  clearSession: async () => {
    try {
      await clearLocalSession();
    } finally {
      set({ user: null, token: null, loading: false });
    }
  },

  // Called (via the API client) after the backend confirmed the token is invalid.
  // A burst of concurrent 401s shares a single cleanup run.
  expireSession: () => {
    if (!expiryInFlight) {
      expiryInFlight = get().clearSession().finally(() => { expiryInFlight = null; });
    }
    return expiryInFlight;
  },

  logout: async () => {
    try {
      // Short timeout: a dead network must not hold the user on the screen.
      await api.post('/auth/logout', undefined, { timeout: 5000 });
    } catch {
      // Server-side logout is best-effort — proceed with local cleanup
      // even if the API is unreachable (network error, server down).
    }
    await get().clearSession();
  },

  // Confirmed invalid session (401) → full local cleanup, resolves null.
  // Anything else (offline, timeout, 5xx, 403, …) keeps the valid local session
  // and is rethrown so the caller can report it and offer a retry.
  refreshUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
      set({ user: data.user });
      await applyAccountLanguage(data.user);
      return data.user;
    } catch (err) {
      if (err?.response?.status === 401) {
        await get().expireSession();
        return null;
      }
      throw err;
    }
  },

  updateUser: async (updates) => {
    const { data } = await api.patch('/users/profile', updates);
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(data.user));
    set({ user: data.user });
    return data.user;
  },

  setUser: (user) => set({ user }),
}));

// Wire the API client's 401 detection to the store (the client can't import it).
setSessionExpiredHandler(() => useAuthStore.getState().expireSession());
