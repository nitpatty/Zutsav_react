const Order = require('../models/Order');
const phonepe = require('../utils/phonepe'); // looked up at call time (stub-friendly)
const { deductStock } = require('../utils/inventoryUtils');

/**
 * Payment bookkeeping for marketplace orders: attempt history, lookup by ANY attempt's transaction id,
 * the one place a verified payment is applied, and reconciliation of earlier attempts.
 *
 * Invariants:
 *  - an order only ever moves pending_payment → paid through applySuccessfulPayment (atomic, once);
 *  - a successful gateway payment is NEVER dropped and an expired/cancelled order is NEVER silently
 *    reopened: it is recorded on the attempt (needsReconciliation) + order timeline for a human;
 *  - attempts are only appended/updated, never removed (financial audit trail).
 */

// Statuses that mean "this order was paid" (cancelled/refunded count only if a payment was actually recorded).
const PAID_STATUSES = ['paid', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const wasPaid = (order) =>
  !!order && (PAID_STATUSES.includes(order.status)
    || (['cancelled', 'refunded'].includes(order.status) && !!order.phonePeTransactionId));

/**
 * Did THIS transaction pay the order? True when its attempt is a clean SUCCESS, or — for orders paid before
 * attempts were tracked — when no attempt succeeded and it is the order's own transaction id.
 */
const paidByTxn = (order, txn) => {
  const attempts = (order && order.paymentAttempts) || [];
  const mine = attempts.find((a) => a.merchantTransactionId === txn);
  if (mine && mine.status === 'SUCCESS' && !mine.needsReconciliation) return true;
  const anyClean = attempts.some((a) => a.status === 'SUCCESS' && !a.needsReconciliation);
  return !anyClean && !!order && order.phonePeMerchantTransactionId === txn;
};

/** Order owning a transaction id — the current one or any historical attempt (retry/legacy). */
const findOrderByTxn = (txn, filter = {}) => Order.findOne({
  ...filter,
  $or: [{ phonePeMerchantTransactionId: txn }, { 'paymentAttempts.merchantTransactionId': txn }],
});

/** Append an attempt unless this transaction is already recorded (idempotent). */
const recordAttemptInitiated = (orderId, { txn, amount }) => Order.updateOne(
  { _id: orderId, 'paymentAttempts.merchantTransactionId': { $ne: txn } },
  { $push: { paymentAttempts: { merchantTransactionId: txn, amount, status: 'PENDING', initiatedAt: new Date() } } },
);

/** The gateway call failed outright — no money can have moved for this transaction. */
const markAttemptInitiationFailed = (orderId, txn, reason) => Order.updateOne(
  { _id: orderId, paymentAttempts: { $elemMatch: { merchantTransactionId: txn, status: 'PENDING' } } },
  { $set: { 'paymentAttempts.$.status': 'INITIATION_FAILED', 'paymentAttempts.$.failureReason': String(reason || 'gateway error').slice(0, 200), 'paymentAttempts.$.completedAt': new Date() } },
);

/** A previously failed initiation was completed on resume (same transaction id). */
const markAttemptPending = (orderId, txn) => Order.updateOne(
  { _id: orderId, paymentAttempts: { $elemMatch: { merchantTransactionId: txn, status: 'INITIATION_FAILED' } } },
  { $set: { 'paymentAttempts.$.status': 'PENDING', 'paymentAttempts.$.failureReason': '', 'paymentAttempts.$.completedAt': null } },
);

/** Make sure an entry exists for a transaction that predates attempt tracking (legacy / earlier unified orders). */
async function ensureAttempt(order, txn) {
  if (!txn || (order.paymentAttempts || []).some((a) => a.merchantTransactionId === txn)) return;
  await recordAttemptInitiated(order._id, { txn, amount: order.totalAmount });
}

/** Terminal gateway failure: only a still-PENDING attempt moves (a SUCCESS is never downgraded). */
async function markAttemptFailed(order, txn, { code, state, reason } = {}) {
  await ensureAttempt(order, txn);
  await Order.updateOne(
    { _id: order._id, paymentAttempts: { $elemMatch: { merchantTransactionId: txn, status: 'PENDING' } } },
    { $set: {
      'paymentAttempts.$.status': 'FAILED', 'paymentAttempts.$.gatewayCode': code || '', 'paymentAttempts.$.gatewayState': state || '',
      'paymentAttempts.$.failureReason': String(reason || code || state || 'Payment failed').slice(0, 200), 'paymentAttempts.$.completedAt': new Date(),
    } },
  );
}

const NOTE = {
  PAID_AFTER_EXPIRY: 'Payment received AFTER this order expired — needs manual reconciliation (refund or manual action)',
  PAID_AFTER_CANCELLATION: 'Payment received for a cancelled order — needs manual reconciliation (refund)',
  DUPLICATE_PAYMENT: 'A second successful payment was received for an already-paid order — needs manual reconciliation (refund)',
  ORDER_NOT_PAYABLE: 'Payment received for an order that can no longer accept it — needs manual reconciliation',
};

/**
 * Apply a gateway-CONFIRMED successful payment to the order that owns `txn`.
 * Returns { order, outcome } where outcome is
 *   'paid'         this call moved pending_payment → paid (caller deducts stock exactly once via `won`)
 *   'already_paid' the order was already paid by this same gateway payment (repeat verify / webhook)
 *   'needs_review' the payment could not be applied (order expired / cancelled / paid by another attempt);
 *                  it is recorded for reconciliation and the order status is left untouched
 */
async function applySuccessfulPayment(order, txn, gatewayTxnId, note) {
  await ensureAttempt(order, txn); // the winning update below needs this transaction's entry to exist
  // ONE atomic write: the order becomes paid AND the paying attempt becomes SUCCESS. A racing verify / webhook /
  // repeat therefore sees a consistent "who paid", with no window between the two.
  const won = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending_payment', 'paymentAttempts.merchantTransactionId': txn },
    {
      $set: {
        status: 'paid', phonePeTransactionId: gatewayTxnId,
        'paymentAttempts.$.status': 'SUCCESS', 'paymentAttempts.$.gatewayCode': 'PAYMENT_SUCCESS',
        'paymentAttempts.$.gatewayState': 'COMPLETED', 'paymentAttempts.$.completedAt': new Date(),
      },
      $push: { statusTimeline: { status: 'paid', timestamp: new Date(), note } },
    },
    { new: true },
  );
  if (won) return { order: won, outcome: 'paid', won };

  const fresh = await Order.findById(order._id);
  if (wasPaid(fresh)) {
    // Same payment confirmed twice (verify racing the webhook, or a repeat) — this attempt is the one that paid.
    if (paidByTxn(fresh, txn)) return { order: fresh, outcome: 'already_paid' };
    // A DIFFERENT attempt paid this order — this is a second successful payment.
    return recordNeedsReview(fresh, txn, gatewayTxnId, 'DUPLICATE_PAYMENT');
  }
  const reason = fresh.status === 'payment_failed' ? 'PAID_AFTER_EXPIRY'
    : fresh.status === 'cancelled' ? 'PAID_AFTER_CANCELLATION' : 'ORDER_NOT_PAYABLE';
  return recordNeedsReview(fresh, txn, gatewayTxnId, reason);
}

async function recordNeedsReview(order, txn, gatewayTxnId, reason) {
  await ensureAttempt(order, txn);
  const flagged = await Order.updateOne(
    { _id: order._id, paymentAttempts: { $elemMatch: { merchantTransactionId: txn, needsReconciliation: { $ne: true } } } },
    {
      $set: {
        'paymentAttempts.$.status': 'SUCCESS', 'paymentAttempts.$.gatewayCode': 'PAYMENT_SUCCESS', 'paymentAttempts.$.gatewayState': 'COMPLETED',
        'paymentAttempts.$.completedAt': new Date(), 'paymentAttempts.$.needsReconciliation': true, 'paymentAttempts.$.reconciliationReason': reason,
      },
      // one audit line, only the first time this payment is seen (repeat verifies/webhooks add nothing)
      $push: { statusTimeline: { status: order.status, timestamp: new Date(), note: `${NOTE[reason]} [txn ${txn}${gatewayTxnId ? `, gateway ${gatewayTxnId}` : ''}]` } },
    },
  );
  if (flagged.modifiedCount) {
    console.error(`[OrderPayments] RECONCILE: order ${order.orderNumber || order._id} (${order.status}) received a successful payment — ${reason}; txn ${txn}`);
  }
  return { order: await Order.findById(order._id), outcome: 'needs_review', reason };
}

/**
 * Ask the gateway about every attempt of this order that could still hold money, and resolve what it can.
 * Result:
 *   { state: 'paid' }                 a payment was confirmed and applied (stock deducted once)
 *   { state: 'in_progress', txn }     an attempt is still genuinely pending at the gateway
 *   { state: 'unknown', txn }         the gateway could not give a definite answer (error / no state) — never guess
 *   { state: 'clear' }                every attempt is terminal without payment — nothing can still be paid
 * Terminal failures are written to the attempt history. INITIATION_FAILED/FAILED/SUCCESS attempts are not re-queried.
 */
async function reconcileOrderAttempts(order, { note = 'Payment confirmed via PhonePe' } = {}) {
  await ensureAttempt(order, order.phonePeMerchantTransactionId);
  const current = await Order.findById(order._id);
  const pending = (current.paymentAttempts || []).filter((a) => a.status === 'PENDING');

  for (const attempt of pending) {
    let result;
    try {
      result = await phonepe.checkPhonePeStatus(attempt.merchantTransactionId);
    } catch {
      return { state: 'unknown', txn: attempt.merchantTransactionId };
    }
    if (result?.success) {
      const applied = await applySuccessfulPayment(current, attempt.merchantTransactionId, result.transactionId, note);
      if (applied.won) await deductStock(applied.won.items, applied.won._id);
      return { state: 'paid', outcome: applied.outcome, order: applied.order };
    }
    if (!result?.state || result.state === 'PENDING') {
      return { state: result?.state === 'PENDING' ? 'in_progress' : 'unknown', txn: attempt.merchantTransactionId };
    }
    await markAttemptFailed(current, attempt.merchantTransactionId, { code: result.code, state: result.state, reason: result.code || result.state });
  }
  return { state: 'clear' };
}

module.exports = {
  PAID_STATUSES, wasPaid, paidByTxn, findOrderByTxn,
  recordAttemptInitiated, markAttemptInitiationFailed, markAttemptPending, markAttemptFailed, ensureAttempt,
  applySuccessfulPayment, reconcileOrderAttempts,
};
