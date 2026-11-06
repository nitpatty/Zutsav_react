import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api, { setSessionExpiredHandler } from '../api/axios';
import { clearLocalSession, clearUserScopedData } from '../utils/sessionCleanup';
import { applyAccountLanguage } from '../i18n/languageStore';
import { getRoleSupport, roleRejection } from '../variants/roleSupport';

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

// Best-effort server-side revocation of a session this app is refusing to keep, through the EXISTING POST /auth/logout
// (it ends the Admin-tier session record the sign-in just created; it is a no-op for tokens without one). The token is
// passed explicitly because nothing is stored for it, it is never logged, and a failure (offline, timeout, 4xx/5xx)
// is swallowed: the local refusal never depends on it. Callers do not wait for it.
function revokeServerSession(token) {
  if (!token) return Promise.resolve();
  return Promise.resolve()
    .then(() => api.post('/auth/logout', undefined, { timeout: 5000, headers: { Authorization: `Bearer ${token}` } }))
    .catch(() => {});
}

// For a session that was just issued by the server and is NOT stored yet. If this app does not serve the account's
// role, refuse it before anything is written (SecureStore, state, caches) and ask the server to end it.
function refuseUnsupportedSession(user, token) {
  const support = getRoleSupport(user?.role);
  if (support.supported) return;
  revokeServerSession(token);
  throw roleRejection(support.reason);
}

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
        const user = JSON.parse(raw);
        if (getRoleSupport(user?.role).supported) {
          set({ token, user, ready: true });
          return;
        }
        // A session for a role this build does not serve (e.g. an Admin session left by an earlier install): it is never
        // put in state, the stored credentials and per-account data are wiped (never throws), and the server is asked
        // to end it without waiting. The app then starts signed out.
        await clearLocalSession();
        revokeServerSession(token);
        set({ user: null, token: null, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ user: null, token: null, ready: true });
    }
  },

  // Root routing found a signed-in user whose role this build does not serve (e.g. the role changed on the server):
  // end the session locally first, then ask the server to end it.
  rejectUnsupportedSession: async () => {
    const { token } = get();
    await get().clearSession();
    revokeServerSession(token);
  },

  login: async (emailOrPhone, password) => {
    set({ loading: true });
    try {
      const { data } = await api.post('/auth/login', { emailOrPhone, password, rememberMe: REMEMBER_ME });
      refuseUnsupportedSession(data.user, data.token); // before the deletion-pending branch and before any storage
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
    refuseUnsupportedSession(user, token); // before anything is cleared or stored
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
    refuseUnsupportedSession(data.user, data.token); // before the deletion-pending branch and before any storage
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
