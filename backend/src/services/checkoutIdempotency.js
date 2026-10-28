const crypto = require('crypto');
const CheckoutRequest = require('../models/CheckoutRequest');

const OPERATION = 'cart_checkout';
const OPERATION_ORDER_RETRY = 'order_retry_payment';
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;
const LOCK_MS = 90 * 1000; // how long a claim owner is trusted before another request may take over

/**
 * The key comes from the body field `idempotencyKey` (same name the manual-billing API uses;
 * works from browsers, where CORS only allows Content-Type/Authorization) or the standard
 * `Idempotency-Key` header. Absent → no idempotency (existing website callers keep working).
 * Returns { key } | { key: null } | { error }.
 */
function readKey(req) {
  const fromBody = req.body && req.body.idempotencyKey;
  const fromHeader = req.headers && (req.headers['idempotency-key'] || req.headers['Idempotency-Key']);
  const values = [fromBody, fromHeader].filter((v) => v !== undefined && v !== null && v !== '');
  if (values.length === 0) return { key: null };
  if (values.some((v) => typeof v !== 'string' || !KEY_PATTERN.test(v))) {
    return { error: 'idempotencyKey must be 16–128 characters of letters, digits, "_", ".", ":" or "-"' };
  }
  if (values.length === 2 && values[0] !== values[1]) {
    return { error: 'idempotencyKey in the body and the Idempotency-Key header do not match' };
  }
  return { key: values[0] };
}

const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.keys(v).sort().reduce((o, k) => { if (v[k] !== undefined) o[k] = sortKeys(v[k]); return o; }, {});
  }
  return v;
};

/**
 * SHA-256 of the business content of the cart (ids, quantities, address, coupon/coin input) in a
 * canonical form. Used only to detect the same key being re-used with a different cart; the
 * body itself is never stored.
 */
function fingerprintCartCheckout(body = {}) {
  const addr = body.shippingAddress || {};
  const normalized = {
    bookings: (body.bookings || []).map((b) => ({
      poojaId: String(b.poojaId || ''), scheduledDate: b.scheduledDate || null, scheduledTime: b.scheduledTime || null,
      language: b.language || null, specialNote: b.specialNote || null, isUrgent: b.isUrgent === true || b.isUrgent === 'true',
      withKit: !!b.withKit, kitIds: (b.kitIds || (b.kitId ? [b.kitId] : [])).map(String), userDetails: b.userDetails || null,
    })),
    products: (body.products || []).map((p) => ({
      productId: String(p.productId || ''), variantId: p.variantId || null, quantity: parseInt(p.quantity, 10) || 0,
    })),
    shippingAddress: ['name', 'phone', 'address', 'pincode', 'state', 'city', 'district'].reduce((o, k) => { o[k] = addr[k] || null; return o; }, {}),
    couponCode: typeof body.couponCode === 'string' && body.couponCode.trim() ? body.couponCode.trim() : null,
    coinRedemptionCoins: Math.floor(Number(body.coinRedemptionCoins) || 0),
  };
  return crypto.createHash('sha256').update(JSON.stringify(sortKeys(normalized))).digest('hex');
}

/** Identity of a payment-retry request: the same key may only ever retry the SAME order. */
const fingerprintOrderRetry = (orderId) =>
  crypto.createHash('sha256').update(`${OPERATION_ORDER_RETRY}|${String(orderId)}`).digest('hex');

const newTxnId = (userId) => `ZUT_CART_${Date.now()}_${String(userId).slice(-6)}`;

// A retry gets a FRESH transaction id that keeps the `ZUT_CART_` prefix (the app and the webhook route
// checkout payments by that prefix). The random suffix keeps ids unique even for two retries in the same
// millisecond — a collision here would tie two orders to one payment.
const newRetryTxnId = (userId) => `ZUT_CART_RETRY_${Date.now()}_${String(userId).slice(-6)}_${crypto.randomBytes(4).toString('hex')}`;

const lockUntil = () => new Date(Date.now() + LOCK_MS);

/**
 * Atomically claim { userId, key }. Outcomes:
 *   new        — this request owns the claim and performs the checkout
 *   resume     — an earlier attempt persisted the order but never finished the gateway step; this
 *                request owns that step now
 *   replay     — the original attempt completed; return its result
 *   in_progress— another request holds the claim right now (retry shortly with the same key)
 *   mismatch   — the key was used before with a different cart
 * Mutual exclusion is the unique index; takeover of an expired lock is a single conditional update.
 */
async function claim({ userId, key, fingerprint, operation = OPERATION, txnFactory = newTxnId }) {
  const base = { userId, operation, key };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const record = await CheckoutRequest.create({
        ...base, fingerprint, state: 'processing', lockedUntil: lockUntil(), merchantTransactionId: txnFactory(userId),
      });
      return { status: 'new', record };
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
    }

    const existing = await CheckoutRequest.findOne(base);
    if (!existing) continue; // the row expired between the insert and the read — claim again
    if (existing.fingerprint !== fingerprint) return { status: 'mismatch' };
    if (existing.state === 'completed') return { status: 'replay', record: existing };

    // processing / order_created: only one request may (re)take an expired lock.
    const taken = await CheckoutRequest.findOneAndUpdate(
      { _id: existing._id, state: existing.state, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: new Date() } }] },
      { $set: { lockedUntil: lockUntil() } },
      { new: true },
    );
    if (!taken) {
      const fresh = await CheckoutRequest.findById(existing._id);
      if (fresh && fresh.state === 'completed') return { status: 'replay', record: fresh };
      return { status: 'in_progress', retryAfterSeconds: 5 };
    }
    return { status: taken.state === 'order_created' ? 'resume' : 'new', record: taken };
  }
  return { status: 'in_progress', retryAfterSeconds: 5 };
}

/** Order/bookings are persisted; from here a retry may only finish the gateway step. */
const markOrderCreated = (record, { orderId, bookingIds, totals, payable }) =>
  CheckoutRequest.updateOne({ _id: record._id }, {
    $set: { state: 'order_created', orderId: orderId || null, bookingIds: bookingIds || [], totals, payable, lockedUntil: lockUntil() },
  });

const markCompleted = (record, { redirectUrl }) =>
  CheckoutRequest.updateOne({ _id: record._id }, { $set: { state: 'completed', redirectUrl: redirectUrl || null, lockedUntil: null } });

/** A definitive failure after persistence (e.g. the gateway call threw): free the claim for an immediate retry that resumes. */
const unlock = (record) => CheckoutRequest.updateOne({ _id: record._id, state: { $ne: 'completed' } }, { $set: { lockedUntil: null } });

/** Nothing was persisted (validation failure etc.): free the key so the same cart can be fixed and retried. */
const release = (record) => CheckoutRequest.deleteOne({ _id: record._id, state: 'processing' });

module.exports = { OPERATION, OPERATION_ORDER_RETRY, KEY_PATTERN, readKey, fingerprintCartCheckout, fingerprintOrderRetry, newTxnId, newRetryTxnId, claim, markOrderCreated, markCompleted, unlock, release };
