const paymentConfig = require('../config/payment.config');
const phonepe       = require('../utils/phonepe');
const Booking       = require('../models/Booking');
const Order         = require('../models/Order');
const PaymentLedger = require('../models/PaymentLedger');

/**
 * Mock payment simulator control plane.
 *
 * Mounted ONLY when PAYMENT_MODE=mock (see src/app.js) and always behind
 * `protect` (see routes/mockPayment.routes.js). Mock mode itself is refused
 * in production by config/payment.config.js, and the rejectIfNotMock guard
 * below is defence in depth: if the module is ever reached in production the
 * endpoints behave as if they do not exist.
 *
 * Authorization: a merchantTransactionId is predictable (timestamp + id
 * fragment), so the routes never trust it alone. Every request resolves the
 * transaction through the actual Booking / Order / PaymentLedger records and
 * must match the authenticated user's id. Unknown and foreign transactions
 * are indistinguishable — both return the same generic 404. Outcomes can
 * only be driven while the associated payment is still in flight; a
 * completed payment cannot be reset through this control plane.
 *
 * These endpoints never mark anything paid by themselves — they only record
 * the simulated gateway outcome. The actual state transition always happens
 * in the existing server-side verify endpoints (GET /api/bookings/verify-
 * phonepe/:id, /api/checkout/verify/:id, /api/marketplace/orders/verify-
 * phonepe/:id) and webhooks, which read the outcome through
 * phonepe.checkPhonePeStatus exactly as they read the real gateway.
 */

function rejectIfNotMock(res) {
  if (!paymentConfig.isMockEnabled()) {
    res.status(404).json({ success: false, message: 'Not found' });
    return true;
  }
  return false;
}

/**
 * Resolve a transaction through its real records and check authorization.
 * Returns { found, owned, inflight }:
 *   found    — some Booking/Order/ledger references this transaction
 *   owned    — every referencing record belongs to `userId`
 *   inflight — at least one referencing record still awaits payment, i.e. the
 *              outcome may still be driven
 */
async function resolveMockTransaction(merchantTransactionId, userId) {
  const [booking, order, ledger] = await Promise.all([
    Booking.findOne({ phonePeMerchantTransactionId: merchantTransactionId }),
    Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId }),
    PaymentLedger.findOne({ merchantTransactionId }),
  ]);

  const claims = [];
  if (booking) {
    claims.push({ userId: booking.userId, inflight: booking.status === 'pending_payment' });
  }
  if (order) {
    claims.push({ userId: order.userId, inflight: order.status === 'pending_payment' });
  }
  if (ledger) {
    const ledgerBooking =
      booking && String(booking._id) === String(ledger.bookingId)
        ? booking
        : await Booking.findById(ledger.bookingId);
    claims.push({ userId: ledgerBooking ? ledgerBooking.userId : null, inflight: ledger.paymentStatus === 'PENDING' });
  }

  if (!claims.length) return { found: false, owned: false, inflight: false };
  const owned = claims.every((c) => c.userId != null && String(c.userId) === String(userId));
  return { found: true, owned, inflight: claims.some((c) => c.inflight) };
}

// GET /api/payments/mock/:merchantTransactionId
exports.getOutcome = async (req, res, next) => {
  try {
    if (rejectIfNotMock(res)) return;
    const { merchantTransactionId } = req.params;

    const claim = await resolveMockTransaction(merchantTransactionId, req.user._id);
    if (!claim.found || !claim.owned) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({
      success: true,
      merchantTransactionId,
      outcome: await phonepe.getMockOutcome(merchantTransactionId),
      mock: true,
    });
  } catch (err) { next(err); }
};

// POST /api/payments/mock/:merchantTransactionId   { outcome: 'success'|'failure'|'pending' }
exports.setOutcome = async (req, res, next) => {
  try {
    if (rejectIfNotMock(res)) return;
    const { merchantTransactionId } = req.params;

    const claim = await resolveMockTransaction(merchantTransactionId, req.user._id);
    if (!claim.found || !claim.owned) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    if (!claim.inflight) {
      return res.status(409).json({
        success: false,
        message: 'This payment is already complete; its outcome cannot be changed',
      });
    }

    const outcome = await phonepe.setMockOutcome(merchantTransactionId, req.body?.outcome);
    res.json({ success: true, merchantTransactionId, outcome, mock: true });
  } catch (err) {
    if (err instanceof paymentConfig.PaymentConfigError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};
