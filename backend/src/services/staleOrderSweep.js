const Order = require('../models/Order');
const ordersConfig = require('../config/orders.config');
const orderPayments = require('./orderPayments');

/**
 * Closes marketplace orders that have been unpaid for longer than the configured lifetime
 * (config/orders.config — OFF unless MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES is set to a valid value).
 *
 * An order is closed ONLY when ALL of this holds, checked at the moment of the change:
 *   • it is still `pending_payment` and was created at/before the cutoff;
 *   • the gateway has been asked about EVERY attempt that could hold money and each one is terminal
 *     WITHOUT payment (a failed/abandoned attempt, or one that never reached the gateway);
 *   • no attempt is PENDING or SUCCESS.
 * Anything uncertain (gateway error, no state, still PENDING) is left alone and looked at again next run — an
 * order is never expired on a guess. If the gateway reports the order was actually PAID, it is settled as paid
 * instead (stock deducted once), never expired.
 *
 * The closing status is the existing `payment_failed` (already rendered by the website; `cancelled` would inflate
 * cancellation stats and imply a customer/admin action). It is a single atomic conditional update that also
 * writes the timeline entry, so racing payment confirmation, a second worker or a repeated run cannot duplicate it
 * or overwrite a payment. Stock is NOT touched: marketplace stock is only deducted after verified payment, so an
 * unpaid order holds no reservation (admin cancel likewise restores stock only for paid statuses). Orders and
 * their payment attempts are never deleted. No customer notification is sent (no approved template exists).
 *
 * A late successful payment on an order closed here follows services/orderPayments.applySuccessfulPayment: the
 * order is not reopened, the payment is recorded on the attempt (needsReconciliation) + timeline for a human.
 */
const MAX_PER_RUN = 500; // bounds one run; the rest is picked up by the next one

async function sweepStalePendingOrders({ expiry = ordersConfig.resolvePendingOrderExpiry(), now = Date.now(), maxPerRun = MAX_PER_RUN } = {}) {
  const summary = {
    enabled: expiry.enabled, reason: expiry.reason,
    scanned: 0, expired: 0, settledPaid: 0, skippedInProgress: 0, skippedUncertain: 0, errors: 0,
  };
  if (!expiry.enabled) return summary;

  const cutoff = new Date(now - expiry.ms);
  const cursor = Order.find({ status: 'pending_payment', createdAt: { $lte: cutoff } }).sort({ createdAt: 1 }).limit(maxPerRun).cursor();

  for await (const order of cursor) {
    summary.scanned += 1;
    try {
      const r = await orderPayments.reconcileOrderAttempts(order, { note: 'Payment confirmed via PhonePe (stale-order sweep)' });
      if (r.state === 'paid') { summary.settledPaid += 1; continue; }
      if (r.state === 'in_progress') { summary.skippedInProgress += 1; continue; }
      if (r.state === 'unknown') { summary.skippedUncertain += 1; continue; }

      const closed = await Order.findOneAndUpdate(
        {
          _id: order._id, status: 'pending_payment', createdAt: { $lte: cutoff },
          paymentAttempts: { $not: { $elemMatch: { status: { $in: ['PENDING', 'SUCCESS'] } } } },
        },
        {
          $set:  { status: 'payment_failed' },
          $push: { statusTimeline: { status: 'payment_failed', timestamp: new Date(now), note: `Expired: no payment received within ${expiry.minutes} minutes` } },
        },
        { new: true },
      );
      if (closed) summary.expired += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[StaleOrderSweep] order ${order._id}: ${err.message}`);
    }
  }
  return summary;
}

module.exports = { sweepStalePendingOrders, MAX_PER_RUN };
