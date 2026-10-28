const mongoose = require('mongoose');
const Order = require('../models/Order');
const CheckoutRequest = require('../models/CheckoutRequest');
const phonepe = require('../utils/phonepe'); // looked up at call time (stub-friendly)
const { urls } = require('../config');
const ordersConfig = require('../config/orders.config');
const idempotency = require('../services/checkoutIdempotency');
const orderPayments = require('../services/orderPayments');

/**
 * POST /api/checkout/orders/:id/retry-payment   (owner only)
 *
 * Start a NEW payment attempt for an EXISTING unpaid marketplace order. The order is never recreated or
 * modified: same id, number, items, snapshots and persisted payable (`order.totalAmount`). The client sends
 * only an idempotency key — never an amount, items or prices — and today's catalog/tax settings are never
 * consulted. Each attempt gets a fresh `ZUT_CART_RETRY_…` transaction id (so the app's and the webhook's
 * ZUT_CART_ routing keeps working) and is appended to `order.paymentAttempts` (history is never rewritten).
 *
 * Protection (all persistent, none process-local):
 *   • `idempotencyKey` is REQUIRED. A CheckoutRequest row (unique {user, operation, key}) makes a lost-response
 *     retry return the same attempt/link, and a concurrent duplicate gets 409.
 *   • The attempt is allocated by ONE conditional update that requires status pending_payment AND no PENDING
 *     attempt, so two keys / devices cannot both open an attempt, and a retry cannot slip in after the order
 *     was paid, expired or cancelled.
 *   • Before allocating, every earlier PENDING attempt is checked with the gateway: confirmed paid → the order
 *     is settled and the retry refused; still pending → refused (no second live payment); unclear → refused.
 * Success is never claimed here — only verification / the webhook can mark an order paid.
 */
const fail = (res, status, code, message, extra = {}) => res.status(status).json({ success: false, code, message, ...extra });

function eligibility(order) {
  if (orderPayments.wasPaid(order)) return { status: 409, code: 'ORDER_ALREADY_PAID', message: 'This order has already been paid.' };
  if (order.status === 'payment_failed') return { status: 409, code: 'ORDER_EXPIRED', message: 'The payment window for this order has closed. Please place a new order.' };
  if (order.status === 'cancelled') return { status: 409, code: 'ORDER_CANCELLED', message: 'This order was cancelled and can no longer be paid.' };
  if (order.status !== 'pending_payment') return { status: 409, code: 'ORDER_NOT_PAYABLE', message: 'This order is not awaiting payment.' };
  const expiry = ordersConfig.resolvePendingOrderExpiry();
  // The order's lifetime runs from its ORIGINAL creation — retrying never grants a fresh window.
  if (expiry.enabled && Date.now() - new Date(order.createdAt).getTime() >= expiry.ms) {
    return { status: 409, code: 'ORDER_EXPIRED', message: 'The payment window for this order has closed. Please place a new order.' };
  }
  if (!(order.totalAmount > 0)) return { status: 409, code: 'ORDER_NOT_PAYABLE', message: 'There is nothing to pay on this order.' };
  return null;
}

async function responseBody(recordId, { replay = false } = {}) {
  const record = await CheckoutRequest.findById(recordId);
  const order = await Order.findById(record.orderId);
  const attempt = (order.paymentAttempts || []).find((a) => a.merchantTransactionId === record.merchantTransactionId) || null;
  const payable = order.status === 'pending_payment' && attempt && attempt.status === 'PENDING';
  return {
    success: true,
    orderId: order._id,
    merchantTransactionId: record.merchantTransactionId,
    // the payment link is only (re)issued while this attempt can still be paid
    redirectUrl: payable && record.redirectUrl ? record.redirectUrl : undefined,
    order,
    attempt,
    totals: record.totals,
    ...(replay ? { idempotentReplay: true } : {}),
  };
}

// Gateway step of an attempt that is already allocated on the order (fresh, or resumed after a failure).
async function finishGatewayStep(req, res, record) {
  const txn = record.merchantTransactionId;
  const current = await Order.findById(record.orderId);
  const blocked = current ? eligibility(current) : { status: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
  if (blocked && blocked.code !== 'ORDER_NOT_PAYABLE') {
    // paid / expired / cancelled in the meantime — do not open a payment for it
    await orderPayments.markAttemptInitiationFailed(record.orderId, txn, 'order no longer payable').catch(() => {});
    await idempotency.release(record).catch(() => {});
    return fail(res, blocked.status, blocked.code, blocked.message);
  }
  let redirectUrl;
  try {
    ({ redirectUrl } = await phonepe.createPhonePeOrder({
      merchantTransactionId: txn,
      amount:      record.payable,
      userId:      req.user._id,
      redirectUrl: `${urls.clientUrl}/payment-callback/${txn}?cart=1`,
      callbackUrl: `${urls.serverUrl}/api/checkout/webhook`,
    }));
  } catch (err) {
    // Recoverable and auditable: the attempt stays on the order as INITIATION_FAILED and the same key resumes it.
    await orderPayments.markAttemptInitiationFailed(record.orderId, txn, err.message).catch(() => {});
    await idempotency.unlock(record).catch(() => {});
    throw err;
  }
  await orderPayments.markAttemptPending(record.orderId, txn);
  await idempotency.markCompleted(record, { redirectUrl });
  return res.status(201).json(await responseBody(record._id));
}

exports.retryOrderPayment = async (req, res, next) => {
  try {
    const parsed = idempotency.readKey(req);
    if (parsed.error) return fail(res, 400, 'IDEMPOTENCY_KEY_INVALID', parsed.error);
    if (!parsed.key) return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey is required to retry a payment.');

    // Same answer for "does not exist" and "belongs to someone else": nothing leaks about other customers' orders.
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'ORDER_NOT_FOUND', 'Order not found');
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return fail(res, 404, 'ORDER_NOT_FOUND', 'Order not found');

    const claim = await idempotency.claim({
      userId: req.user._id, key: parsed.key, fingerprint: idempotency.fingerprintOrderRetry(order._id),
      operation: idempotency.OPERATION_ORDER_RETRY, txnFactory: idempotency.newRetryTxnId,
    });
    if (claim.status === 'mismatch') {
      return fail(res, 422, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different order. Start a new retry with a new key.');
    }
    if (claim.status === 'in_progress') {
      res.set('Retry-After', String(claim.retryAfterSeconds));
      return fail(res, 409, 'CHECKOUT_IN_PROGRESS', 'Your payment is still being set up. Please retry in a few seconds.', { retryAfterSeconds: claim.retryAfterSeconds });
    }
    if (claim.status === 'replay') return res.status(200).json(await responseBody(claim.record._id, { replay: true }));
    if (claim.status === 'resume') return finishGatewayStep(req, res, claim.record);

    // claim.status === 'new'
    const record = claim.record;
    const release = () => idempotency.release(record).catch(() => {});

    const verdict = eligibility(order);
    if (verdict) { await release(); return fail(res, verdict.status, verdict.code, verdict.message); }

    // 1. Could anything earlier still hold money? (never guess)
    let earlier;
    try { earlier = await orderPayments.reconcileOrderAttempts(order); } catch (err) { await release(); throw err; }
    if (earlier.state === 'paid') {
      await release();
      return fail(res, 409, 'ORDER_ALREADY_PAID', 'This order has already been paid.', { alreadyPaid: true });
    }
    if (earlier.state === 'in_progress') {
      await release();
      return fail(res, 409, 'PAYMENT_IN_PROGRESS', 'An earlier payment attempt for this order is still being processed.', { merchantTransactionId: earlier.txn });
    }
    if (earlier.state === 'unknown') {
      await release();
      return fail(res, 503, 'PAYMENT_STATUS_UNKNOWN', 'We could not confirm your earlier payment attempt. Please try again in a few minutes.');
    }

    // 2. Allocate the attempt atomically. The charge is the order's PERSISTED payable — nothing from the client.
    const txn = record.merchantTransactionId;
    const amount = order.totalAmount;
    const attemptNo = (order.paymentAttempts || []).length + 1;
    const allocated = await Order.findOneAndUpdate(
      {
        _id: order._id, userId: req.user._id, status: 'pending_payment',
        paymentAttempts: { $not: { $elemMatch: { status: 'PENDING' } } },
      },
      {
        $set:  { phonePeMerchantTransactionId: txn },
        $push: {
          paymentAttempts: { merchantTransactionId: txn, amount, status: 'PENDING', initiatedAt: new Date() },
          statusTimeline:  { status: 'pending_payment', timestamp: new Date(), note: `Payment retry started (attempt ${attemptNo})` },
        },
      },
      { new: true },
    );
    if (!allocated) {
      // Lost a race: another request opened an attempt, or the order was paid / expired / cancelled meanwhile.
      await release();
      const now = await Order.findById(order._id);
      const v = now && eligibility(now);
      if (v) return fail(res, v.status, v.code, v.message);
      return fail(res, 409, 'PAYMENT_IN_PROGRESS', 'Another payment attempt for this order is already in progress.');
    }

    await idempotency.markOrderCreated(record, {
      orderId: order._id, bookingIds: [],
      totals: { bookingTotal: 0, productTotal: amount, combinedTotal: amount }, payable: amount,
    });
    return finishGatewayStep(req, res, await CheckoutRequest.findById(record._id));
  } catch (err) { next(err); }
};
