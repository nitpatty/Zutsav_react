import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/axios';
import { verifyEndpoint } from './marketplaceCheckout';
import { parsePaymentRedirectUrl } from './paymentUrl';

/**
 * Payment recovery (mobile F-06): find a payment again after the user left the app to pay.
 *
 * The app cannot rely on the browser/PhonePe returning to it, so BEFORE handing the device to the payment page it
 * writes a tiny "pending payment" record. On launch, on every return to the foreground and when the relevant screen
 * opens, the app asks the SERVER about that transaction. The record is only a pointer — it is never evidence:
 *   • payment is confirmed only by the server's verify response (gateway status check / validated webhook);
 *   • a redirect, query parameter, transaction prefix or stored value can never mark anything paid.
 *
 * What is stored (versioned): { userId, type, merchantTransactionId, bookingId | orderId, createdAt, updatedAt }.
 * NOT stored: amounts, addresses, booking details, tokens, the payment URL or any query string.
 *
 * Privacy: records are bound to the signed-in account and removed on logout / session expiry (utils/sessionCleanup)
 * and when another account's record is encountered. The trade-off — a payment started and then abandoned by logging out
 * is not resumed automatically — is deliberate: the order/booking still exists on the server and can be re-opened from
 * the user's own lists after signing in again.
 */
export const PENDING_PAYMENT_KEY = 'zutsav_pending_payments';
export const STORE_VERSION = 1;
export const PAYMENT_TYPES = ['booking', 'booking-remaining', 'marketplace'];
export const MAX_PENDING = 5;                       // bounded per user; the oldest is dropped first
export const PENDING_TTL_MS = 3 * 24 * 60 * 60 * 1000; // a record this old is only a stale pointer
export const MIN_RECOVERY_INTERVAL_MS = 5000;       // launch + foreground bursts collapse into one run
const MAX_RECOVERY_PER_RUN = 3;

const TXN_RE = /^[A-Za-z0-9_]{8,80}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// ── Validation ───────────────────────────────────────────────────────────────────────────────

export const isValidTransactionId = (v) => typeof v === 'string' && TXN_RE.test(v);

/** Booking flows know their own identity; only the remaining-balance top-up has its own transaction family. */
export const bookingTypeForTxn = (txn) => (String(txn).startsWith('ZUT_REM_') ? 'booking-remaining' : 'booking');

/** Normalised context (only the known, validated fields) or null. */
export function normalizeContext(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  const { userId, type, merchantTransactionId, bookingId, orderId } = input;
  if (typeof userId !== 'string' || !ID_RE.test(userId)) return null;
  if (!PAYMENT_TYPES.includes(type)) return null;
  if (!isValidTransactionId(merchantTransactionId)) return null;
  const out = { userId, type, merchantTransactionId };
  if (type === 'marketplace') {
    if (typeof orderId !== 'string' || !ID_RE.test(orderId)) return null;
    out.orderId = orderId;
  } else {
    if (typeof bookingId !== 'string' || !ID_RE.test(bookingId)) return null;
    out.bookingId = bookingId;
  }
  const created = Number.isFinite(input.createdAt) ? input.createdAt : now;
  const updated = Number.isFinite(input.updatedAt) ? input.updatedAt : created;
  out.createdAt = created;
  out.updatedAt = updated;
  return out;
}

// ── Change notifications (banners refresh themselves) ──────────────────────────────────────────

const listeners = new Set();
export function subscribePendingPayments(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (event) => listeners.forEach((fn) => { try { fn(event); } catch { /* a listener must never break payment handling */ } });

// ── Storage (never throws; a storage problem never decides a payment outcome) ──────────────────

async function readStore() {
  let raw;
  try { raw = await AsyncStorage.getItem(PENDING_PAYMENT_KEY); } catch { return []; }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== STORE_VERSION || !Array.isArray(parsed.items)) throw new Error('unsupported');
    return parsed.items.map((i) => normalizeContext(i)).filter(Boolean);
  } catch {
    try { await AsyncStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* nothing more to do */ }
    return [];
  }
}

async function writeStore(items) {
  if (items.length === 0) await AsyncStorage.removeItem(PENDING_PAYMENT_KEY);
  else await AsyncStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ v: STORE_VERSION, items }));
}

const fresh = (item, now) => now - item.updatedAt < PENDING_TTL_MS;

/** Records still worth keeping for this user: newest first, unexpired, bounded. Everything else is dropped. */
function keepFor(items, userId, now) {
  return items
    .filter((i) => i.userId === userId && fresh(i, now))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PENDING);
}

/**
 * Remember a payment that is about to be (or has been) handed to the payment page. Idempotent per transaction.
 * @returns {Promise<boolean>} false when the context is invalid or storage failed — the payment itself is NOT blocked.
 */
export async function savePendingPayment(userId, context, { now = Date.now() } = {}) {
  const ctx = normalizeContext({ ...context, userId, updatedAt: now }, now);
  if (!ctx) return false;
  try {
    const stored = await readStore();
    const existing = stored.find((i) => i.userId === userId && i.merchantTransactionId === ctx.merchantTransactionId);
    if (existing) ctx.createdAt = existing.createdAt;
    const others = stored.filter((i) => i.userId === userId && i.merchantTransactionId !== ctx.merchantTransactionId);
    await writeStore(keepFor([ctx, ...others], userId, now)); // another account's leftovers are not kept
    emit({ type: 'changed' });
    return true;
  } catch {
    return false;
  }
}

/** This user's pending payments, newest first. Other accounts' / expired / malformed records are removed, never returned. */
export async function loadPendingPayments(userId, { now = Date.now() } = {}) {
  if (!userId) return [];
  const all = await readStore();
  const mine = keepFor(all, userId, now);
  if (mine.length !== all.length) {
    try { await writeStore(mine); } catch { /* cleanup is best effort */ }
  }
  return mine;
}

export async function removePendingPayment(userId, merchantTransactionId) {
  try {
    const rest = (await readStore()).filter((i) => !(i.userId === userId && i.merchantTransactionId === merchantTransactionId));
    await writeStore(rest);
    emit({ type: 'changed' });
    return true;
  } catch {
    return false;
  }
}

export async function clearPendingPayments() {
  try { await AsyncStorage.removeItem(PENDING_PAYMENT_KEY); } catch { /* session cleanup reports its own errors */ }
  emit({ type: 'changed' });
}

// ── Server verification (single flight per transaction) ───────────────────────────────────────

/**
 * Interprets a verify response using the existing server contract (booking, remaining, checkout and legacy routes):
 *   paid          success:true | alreadyVerified:true      — the server verified the payment
 *   needs_review  code PAYMENT_NEEDS_REVIEW               — money received but the order could not accept it
 *   failed        a non-PENDING gateway `state`           — the gateway reported a terminal failure
 *   pending       anything else (PENDING, no state, …)    — NOT a failure, NOT a success
 */
export function classifyVerifyResponse(data) {
  if (data?.code === 'PAYMENT_NEEDS_REVIEW') return { kind: 'needs_review' };
  if (data?.success === true || data?.alreadyVerified === true) return { kind: 'paid' };
  if (data?.state && data.state !== 'PENDING') return { kind: 'failed', code: data.code || data.state };
  return { kind: 'pending' };
}

function classifyVerifyError(err) {
  const status = err?.response?.status;
  if (status === 401) return { kind: 'unauthorized', status };   // the shared client's session handling has already run
  if (status === 403) return { kind: 'forbidden', status };      // the transaction is not this account's
  if (status === 404) return { kind: 'not_found', status };      // not known (yet) — never treated as paid or failed
  return { kind: 'unknown', status };                             // offline / timeout / 5xx
}

const inflight = new Map();
/**
 * One verify request per transaction at a time: the launch check, a foreground check and an open PaymentVerify
 * screen all share it. Resolves to { kind, data?, code?, status? } and never throws.
 */
export function verifyTransaction({ type, merchantTransactionId }) {
  const key = merchantTransactionId;
  if (inflight.has(key)) return inflight.get(key);
  const request = (async () => {
    try {
      const { data } = await api.get(verifyEndpoint(type, merchantTransactionId));
      return { ...classifyVerifyResponse(data), data };
    } catch (err) {
      return classifyVerifyError(err);
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

// ── Screens that are verifying a transaction right now ────────────────────────────────────────

const active = new Map();
/** A mounted PaymentVerify registers its transaction so the background recovery run does not duplicate it. */
export function markVerificationActive(merchantTransactionId) {
  active.set(merchantTransactionId, (active.get(merchantTransactionId) || 0) + 1);
  return () => {
    const n = (active.get(merchantTransactionId) || 1) - 1;
    if (n <= 0) active.delete(merchantTransactionId); else active.set(merchantTransactionId, n);
  };
}
export const isVerificationActive = (merchantTransactionId) => active.has(merchantTransactionId);

// ── Recovery run (app launch / foreground) ────────────────────────────────────────────────────

let recovering = null;
let lastRunAt = 0;

/**
 * Re-check this user's pending payments with the server. At most one run at a time, at most one per
 * MIN_RECOVERY_INTERVAL_MS, at most MAX_RECOVERY_PER_RUN transactions, one request each — there is no polling loop.
 *   paid / failed / needs_review → the record is removed (the server gave a terminal answer)
 *   forbidden                    → removed (not this account's)
 *   pending / not_found / unknown→ kept, so the next launch / foreground / banner can try again
 *   unauthorized                 → kept; the run stops (the session handler decides what happens next)
 * Returns [{ context, kind }] for the transactions it examined.
 */
export function recoverPendingPayments(userId, { now = Date.now(), force = false } = {}) {
  if (!userId) return Promise.resolve([]);
  if (recovering) return recovering;
  if (!force && now - lastRunAt < MIN_RECOVERY_INTERVAL_MS) return Promise.resolve([]);
  lastRunAt = now;
  recovering = (async () => {
    const results = [];
    const pending = (await loadPendingPayments(userId, { now })).slice(0, MAX_RECOVERY_PER_RUN);
    for (const context of pending) {
      if (isVerificationActive(context.merchantTransactionId)) { results.push({ context, kind: 'skipped' }); continue; }
      const outcome = await verifyTransaction(context);
      if (['paid', 'failed', 'needs_review', 'forbidden'].includes(outcome.kind)) {
        await removePendingPayment(userId, context.merchantTransactionId);
      }
      results.push({ context, kind: outcome.kind });
      if (outcome.kind === 'unauthorized') break;
    }
    if (results.some((r) => ['paid', 'failed', 'needs_review'].includes(r.kind))) emit({ type: 'resolved', results });
    return results;
  })().finally(() => { recovering = null; });
  return recovering;
}

// ── Hand-off to the payment page ──────────────────────────────────────────────────────────────

/**
 * The one way the app opens a payment page: validate the URL, persist the recovery record, THEN open it — so a process
 * kill immediately after the hand-off still leaves something to recover.
 *   { opened:false, reason:'invalid_url' } nothing persisted, nothing opened
 *   { opened:false, reason:'open_failed' } the device could not open the link (the record stays: the payment may exist)
 *   { opened:true,  saved:boolean }        saved:false = storage failed; the payment proceeds and PaymentVerify still tracks it
 */
export async function openPaymentPage({ userId, context, redirectUrl, allowedHosts }) {
  const check = parsePaymentRedirectUrl(redirectUrl, { allowedHosts });
  if (!check.ok) return { opened: false, reason: 'invalid_url' };
  const saved = await savePendingPayment(userId, context);
  try {
    await Linking.openURL(check.url);
    return { opened: true, saved };
  } catch {
    return { opened: false, reason: 'open_failed', saved };
  }
}

/**
 * A booking payment is already in flight (the server answered `alreadyInFlight`, or 409 for a remaining-balance top-up):
 * resume verifying THAT transaction instead of starting another. Only the id the server returned is used.
 * @returns {Promise<boolean>} false when the response carried no usable transaction id.
 */
export async function resumeBookingPayment({ navigation, userId, bookingId, merchantTransactionId, replace = false }) {
  if (!isValidTransactionId(merchantTransactionId)) return false;
  const type = bookingTypeForTxn(merchantTransactionId);
  await savePendingPayment(userId, { type, merchantTransactionId, bookingId });
  navigation[replace ? 'replace' : 'navigate']('PaymentVerify', { merchantTransactionId, bookingId, type });
  return true;
}

/** Test / session helper: forget in-memory state (not storage). */
export function resetPaymentRecoveryState() {
  inflight.clear();
  active.clear();
  recovering = null;
  lastRunAt = 0;
  listeners.clear();
}
