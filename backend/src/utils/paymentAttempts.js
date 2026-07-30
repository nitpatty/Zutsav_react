// Shared payment-attempt tracking for Booking documents.
// Every creation/verify/webhook site (single booking, cart, pay-remaining, retry)
// calls into this instead of re-implementing attempt bookkeeping — keeps
// paymentAttempts[], lastPaymentAttemptAt and the FAILED transition consistent
// across all three payment flows.

const { NotificationEngine } = require('../../notification-engine');
const { normalizeBookingPayload } = require('../../notification-engine/variables/PayloadNormalizer');

// Call when a new PhonePe order is created against a booking (initial attempt or retry).
// Does not save the booking — caller is expected to .save() alongside its other changes.
function recordAttemptInitiated(booking, { merchantTransactionId, amount, paymentType }) {
  booking.paymentAttempts.push({
    merchantTransactionId,
    amount,
    paymentType,
    status: 'PENDING',
    initiatedAt: new Date(),
  });
  booking.lastPaymentAttemptAt = new Date();

  // A booking whose previous attempt failed is being retried — payment is in-flight again.
  if (booking.paymentStatus === 'FAILED') booking.paymentStatus = 'PENDING';
}

// Call when a PhonePe order reaches a terminal state (SUCCESS or FAILED), from either
// the user-triggered verify endpoints or the webhook. Idempotent: only flips
// booking.paymentStatus and fires PAYMENT_FAILED the first time this attempt is
// resolved, so webhook replay / repeated polling never double-transitions or
// double-notifies. Never touches booking.status — a failed payment is an incomplete
// checkout, not a cancellation.
async function recordAttemptResult(booking, merchantTransactionId, { status, gatewayCode, gatewayState, failureReason }, poojaName = '') {
  const attempt = booking.paymentAttempts.find((a) => a.merchantTransactionId === merchantTransactionId);
  const wasPending = !attempt || attempt.status === 'PENDING';

  if (attempt) {
    attempt.status        = status;
    attempt.gatewayCode   = gatewayCode || '';
    attempt.gatewayState  = gatewayState || '';
    attempt.failureReason = failureReason || '';
    attempt.completedAt   = new Date();
  }

  if (status === 'FAILED' && wasPending) {
    booking.paymentStatus = 'FAILED';
    const payload = normalizeBookingPayload({ booking, poojaName });
    NotificationEngine.emit('PAYMENT_FAILED', payload).catch(() => {});
  }
}

module.exports = { recordAttemptInitiated, recordAttemptResult };
