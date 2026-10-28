import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCartStore } from '../store/cartStore';
import { useNotificationStore } from '../store/notificationStore';
import { usePanditStatusStore } from '../store/panditStatusStore';
import { clearAllCache } from './offlineCache';
import { ATTEMPT_STORAGE_KEY } from './checkoutAttempt';
import { RETRY_STORAGE_KEY } from './orderRetry';
import { PENDING_PAYMENT_KEY } from './paymentRecovery';
import { clearGeocodingCache } from '../services/geocodingService';
import { disconnectSocket } from './socket';

/**
 * Local session cleanup — the single place that knows what is per-account.
 * (The auth store's own user/token state is reset by authStore.clearSession,
 * which calls this; this module must not import authStore.)
 *
 * CLEARED (belongs to the signed-in account)
 *   SecureStore   zutsav_token, zutsav_user
 *   AsyncStorage  zutsav_cart, zutsav_checkout_attempt, zutsav_order_retry, zutsav_pending_payments, every zutsav_cache_* entry (e.g. notifications)
 *   in-memory     cart items, notifications/unread count, pandit status/profile,
 *                 geocoding result cache (addresses the user typed), live socket
 *
 * PRESERVED on purpose (device / app-level, not account data)
 *   AsyncStorage  zutsav_theme
 *   SecureStore   zutsav_language
 *   in-memory     global.__zutsav_referral_code (pre-signup deep-link param)
 *
 * Never throws and is safe to call repeatedly: each step runs independently, so
 * one failing storage call cannot leave the others (or the caller) half done.
 * Failures are returned and logged, not swallowed.
 */

export const CART_KEY = 'zutsav_cart';
const CREDENTIAL_KEYS = ['zutsav_token', 'zutsav_user'];

async function runSteps(steps) {
  const errors = [];
  for (const [name, fn] of steps) {
    try { await fn(); } catch (e) { errors.push({ step: name, message: e?.message || String(e) }); }
  }
  if (errors.length) console.warn('[session] cleanup completed with errors:', JSON.stringify(errors));
  return { errors };
}

// Everything account-specific EXCEPT the credentials. Also used just before a
// new session is stored, so an interrupted earlier cleanup (app killed mid-logout)
// can never leak the previous account's cart/cache into the next one.
export function clearUserScopedData() {
  return runSteps([
    ['socket',        () => disconnectSocket()],
    ['cartStore',     () => useCartStore.getState().reset()],
    ['notifications', () => useNotificationStore.getState().reset()],
    ['panditStatus',  () => usePanditStatusStore.getState().reset()],
    ['geocodeCache',  () => clearGeocodingCache()],
    ['cartStorage',   () => AsyncStorage.removeItem(CART_KEY)],
    ['offlineCache',  () => clearAllCache()],
    // an interrupted checkout's idempotency key belongs to the previous account
    ['checkoutAttempt', () => AsyncStorage.removeItem(ATTEMPT_STORAGE_KEY)],
    ['orderRetryKeys', () => AsyncStorage.removeItem(RETRY_STORAGE_KEY)],
    // pointers to the previous account's in-flight payments (transaction + booking/order ids) must never reach the next login
    ['pendingPayments', () => AsyncStorage.removeItem(PENDING_PAYMENT_KEY)],
  ]);
}

// Credentials first (so a crash mid-cleanup never leaves a restorable session
// next to half-cleared data), then everything else. Concurrent callers share one run.
let inFlight = null;
export function clearLocalSession() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const creds = await runSteps(CREDENTIAL_KEYS.map((k) => [k, () => SecureStore.deleteItemAsync(k)]));
    const rest = await clearUserScopedData();
    return { errors: [...creds.errors, ...rest.errors] };
  })().finally(() => { inFlight = null; });
  return inFlight;
}
