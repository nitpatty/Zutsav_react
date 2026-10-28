import AsyncStorage from '@react-native-async-storage/async-storage';
import { newIdempotencyKey } from './checkoutAttempt';
import { CART_TXN_PREFIX } from './marketplaceCheckout';

/**
 * Retrying payment for an EXISTING unpaid marketplace order
 *   POST /api/checkout/orders/:id/retry-payment   { idempotencyKey }
 *
 * The app sends only the key — never an amount, items or prices; the server charges the order's persisted
 * payable under a fresh `ZUT_CART_RETRY_…` transaction id. The order, its history and its owner never change.
 *
 * One key per LOGICAL retry attempt, persisted per order (survives an app restart):
 *   - reused while the outcome is unknown (no response / timeout / 5xx / "still setting up"), so the server
 *     returns the SAME attempt and link instead of opening another;
 *   - discarded once the server gave a definite answer (attempt opened, or refused), so the next tap after
 *     a genuinely failed payment is a NEW attempt.
 * It is per-account data: utils/sessionCleanup removes it on logout / session expiry.
 */
export const RETRY_STORAGE_KEY = 'zutsav_order_retry';
const MAX_AGE_MS = 20 * 60 * 60 * 1000; // below the server's 24 h idempotency retention

async function readAll() {
  try { return JSON.parse((await AsyncStorage.getItem(RETRY_STORAGE_KEY)) || '{}') || {}; } catch { return {}; }
}
async function writeAll(map) {
  try {
    if (Object.keys(map).length) await AsyncStorage.setItem(RETRY_STORAGE_KEY, JSON.stringify(map));
    else await AsyncStorage.removeItem(RETRY_STORAGE_KEY);
  } catch { /* storage trouble only costs cross-restart reuse */ }
}

export async function getOrCreateRetryKey(orderId, { now = Date.now() } = {}) {
  const map = await readAll();
  const saved = map[orderId];
  if (saved?.key && now - saved.createdAt < MAX_AGE_MS) return { key: saved.key, reused: true };
  const key = newIdempotencyKey(now);
  await writeAll({ ...map, [orderId]: { key, createdAt: now } });
  return { key, reused: false };
}

export async function clearRetryKey(orderId) {
  const map = await readAll();
  if (!(orderId in map)) return;
  const { [orderId]: _removed, ...rest } = map;
  await writeAll(rest);
}

/** Retry is offered only from SERVER state: an order still awaiting payment. (The server also enforces lifetime etc.) */
export const canOfferRetry = (order) => order?.status === 'pending_payment';

/** Plain-language note for an order that cannot be retried (null when nothing needs saying). */
export function retryUnavailableNote(order) {
  switch (order?.status) {
    case 'payment_failed': return 'This order was not paid in time and has been closed. Please place a new order.';
    case 'cancelled': return 'This order was cancelled and can no longer be paid.';
    default: return null;
  }
}

/** Only a well-formed https payment page is ever opened — one shared rule for every payment flow (utils/paymentUrl). */
export { isSafePaymentUrl } from './paymentUrl';

/**
 * Validates a successful retry response. The transaction id MUST keep the `ZUT_CART_` prefix: the app routes
 * verification to /checkout/verify by it. Throws on a malformed body (treated as an uncertain outcome).
 */
export function mapRetryResponse(data) {
  const merchantTransactionId = data?.merchantTransactionId;
  if (!data?.success || !data.orderId || typeof merchantTransactionId !== 'string' || !merchantTransactionId.startsWith(CART_TXN_PREFIX)) {
    throw new Error('Unexpected retry response');
  }
  return {
    orderId: data.orderId,
    merchantTransactionId,
    redirectUrl: typeof data.redirectUrl === 'string' && data.redirectUrl ? data.redirectUrl : null,
    replayed: data.idempotentReplay === true,
  };
}

/**
 * What a failed retry means:
 *   uncertain      no answer / timeout / 5xx / "still setting up" — keep the key, tell the user to tap again
 *   in_progress    an earlier attempt is still pending at the gateway — send them to its verification
 *   already_paid   the order is paid (refresh it)
 *   expired        the order's payment window closed (refresh it)
 *   unavailable    cancelled / not payable / not found
 *   status_unknown the server could not confirm the earlier attempt — try again later
 *   rejected       any other definite refusal
 */
export function classifyRetryFailure(err) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (!status) return { kind: 'uncertain' };
  if (status === 409 && code === 'CHECKOUT_IN_PROGRESS') return { kind: 'uncertain' };
  if (status === 409 && code === 'PAYMENT_IN_PROGRESS') return { kind: 'in_progress', merchantTransactionId: err.response.data.merchantTransactionId || null };
  if (status === 409 && code === 'ORDER_ALREADY_PAID') return { kind: 'already_paid' };
  if (status === 409 && code === 'ORDER_EXPIRED') return { kind: 'expired' };
  if (code === 'ORDER_CANCELLED' || code === 'ORDER_NOT_PAYABLE' || code === 'ORDER_NOT_FOUND') return { kind: 'unavailable' };
  if (status === 503 && code === 'PAYMENT_STATUS_UNKNOWN') return { kind: 'status_unknown' };
  if (status >= 500) return { kind: 'uncertain' };
  return { kind: 'rejected' };
}
