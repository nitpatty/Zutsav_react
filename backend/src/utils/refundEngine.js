/**
 * Centralized Refund Calculation Engine
 *
 * Business Rules (immutable):
 *   1. Platform Fee is NEVER refunded.
 *   2. GST charged on Platform Fee is NEVER refunded.
 *   3. Refundable amount = amountPaid - platformFee - platformGST
 *   4. Refundable amount is always clamped to ≥ 0 (never negative).
 *   5. Calculations are always performed server-side; never trust frontend values.
 *
 * Usage:
 *   const { calculateRefundBreakdown } = require('./refundEngine');
 *   const breakdown = calculateRefundBreakdown(booking);
 */

/**
 * @typedef {object} RefundBreakdown
 * @property {number} amountPaid         – Total actually paid by the customer
 * @property {number} platformFee        – Non-refundable platform commission
 * @property {number} platformGST        – Non-refundable GST on platform fee
 * @property {number} nonRefundableTotal – platformFee + platformGST
 * @property {number} refundableAmount   – What the customer gets back (≥ 0)
 * @property {string} policy             – Human-readable policy note
 */

/**
 * Calculate how much should be refunded for a given booking.
 *
 * Works correctly for:
 *   - Full payments  (amountPaid === grandTotal)
 *   - Partial payments (amountPaid < grandTotal)
 *   - Edge case where amountPaid < platformCharges → refund = 0
 *
 * @param {object} booking  – Mongoose doc or plain object with at least:
 *   amountPaid, platformFee, platformGST
 * @returns {RefundBreakdown}
 */
function calculateRefundBreakdown(booking) {
  const amountPaid  = Math.round(Number(booking.amountPaid  || 0));
  const platformFee = Math.round(Number(booking.platformFee || 0));
  const platformGST = Math.round(Number(booking.platformGST || 0));

  const nonRefundableTotal = platformFee + platformGST;
  const refundableAmount   = Math.max(0, amountPaid - nonRefundableTotal);

  return {
    amountPaid,
    platformFee,
    platformGST,
    nonRefundableTotal,
    refundableAmount,
    policy: 'Platform convenience fee and applicable GST are non-refundable.',
  };
}

/**
 * Validate that a requested refund amount does not exceed the eligible amount.
 * Returns { valid: true } or { valid: false, message: string }.
 *
 * @param {number} requestedAmount
 * @param {number} eligibleAmount  – from calculateRefundBreakdown().refundableAmount
 */
function validateRefundAmount(requestedAmount, eligibleAmount) {
  if (requestedAmount < 0)
    return { valid: false, message: 'Refund amount cannot be negative.' };
  if (requestedAmount > eligibleAmount)
    return { valid: false, message: `Refund amount ₹${requestedAmount} exceeds eligible refund of ₹${eligibleAmount}.` };
  return { valid: true };
}

module.exports = { calculateRefundBreakdown, validateRefundAmount };
