import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Idempotency key for one LOGICAL marketplace-checkout attempt (POST /api/checkout/cart).
 *
 * Why: if the request times out after the server already created the order, a naive retry would
 * create a second pending order. The server de-duplicates on { customer, key }, so the app must
 * send the SAME key for every retry of an attempt whose outcome it does not know — and a NEW key
 * for a genuinely new order.
 *
 *  - The key is persisted (AsyncStorage) so it survives an app restart mid-checkout.
 *  - It is reused only while the cart + delivery details are unchanged (a changed cart is a
 *    different order and the server would reject the key reuse with 422).
 *  - It is kept after an UNCERTAIN outcome (no response / timeout / 5xx / "still processing").
 *  - It is cleared after a DEFINITIVE outcome: the order was created (success) or the server
 *    rejected the request (4xx), so the next tap is a fresh attempt.
 *  - It is per-account data: utils/sessionCleanup removes it on logout / session expiry.
 *
 * No dependency: Hermes has no crypto.randomUUID, and the key does not need to be secret — it only
 * has to be unique per attempt and per customer (the server scopes it to the authenticated user).
 */
export const ATTEMPT_STORAGE_KEY = 'zutsav_checkout_attempt';
const MAX_AGE_MS = 20 * 60 * 60 * 1000; // stays below the server's 24 h idempotency retention

// 16–128 chars from [A-Za-z0-9_] — a subset of what the server accepts.
export function newIdempotencyKey(now = Date.now(), rand = Math.random) {
  const chunk = () => Math.floor(rand() * 36 ** 8).toString(36).padStart(8, '0');
  return `zc_${now.toString(36)}_${chunk()}${chunk()}${chunk()}`;
}

// Small non-cryptographic hash (cyrb53) so the cart/address are not written to storage in clear text.
function hash(str) {
  let h1 = 0xdeadbeef; let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Identity of "this exact order": items (order-independent) + delivery details. */
export function cartFingerprint(items, shipping = {}) {
  const lines = items
    .map((i) => `${i.productId}|${i.variantId || ''}|${parseInt(i.quantity, 10) || 0}`)
    .sort();
  const addr = ['name', 'phone', 'address', 'pincode', 'state', 'city', 'district'].map((k) => shipping[k] || '');
  return hash(JSON.stringify({ lines, addr }));
}

/**
 * The key to send now: the stored one when it belongs to this same cart and is still fresh,
 * otherwise a new one (persisted before use). Storage trouble never blocks checkout — it just
 * falls back to a fresh key.
 */
export async function getOrCreateAttempt(items, shipping, { now = Date.now() } = {}) {
  const fingerprint = cartFingerprint(items, shipping);
  try {
    const raw = await AsyncStorage.getItem(ATTEMPT_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.key && saved.fingerprint === fingerprint && now - saved.createdAt < MAX_AGE_MS) {
        return { key: saved.key, reused: true };
      }
    }
  } catch { /* unreadable → start a new attempt */ }

  const key = newIdempotencyKey(now);
  try {
    await AsyncStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify({ key, fingerprint, createdAt: now }));
  } catch { /* the key is still used for this tap; only cross-restart reuse is lost */ }
  return { key, reused: false };
}

export async function clearAttempt() {
  try { await AsyncStorage.removeItem(ATTEMPT_STORAGE_KEY); } catch { /* nothing else to do */ }
}

/**
 * 'definitive' — the server answered and nothing was left half-done (a 4xx rejection): the next
 *                tap is a new attempt.
 * 'in_progress'— the server says the same checkout is still running: wait and retry with the same key.
 * 'uncertain'  — no answer / timeout / 5xx / unreadable success: the order may or may not exist, so the
 *                SAME key must be reused.
 */
export function classifyFailure(err) {
  const status = err?.response?.status;
  if (!status) return 'uncertain';
  if (status === 409 && err.response?.data?.code === 'CHECKOUT_IN_PROGRESS') return 'in_progress';
  if (status === 409 && err.response?.data?.code === 'CHECKOUT_STATE_UNKNOWN') return 'definitive';
  if (status >= 500) return 'uncertain';
  return 'definitive';
}
