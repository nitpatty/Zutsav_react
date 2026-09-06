/**
 * PoojaLoyaltyService — global Pooja booking loyalty coin reward.
 *
 * When a user's eligible Pooja booking reaches COMPLETED, the user (the booker)
 * automatically receives loyalty coins = pre-tax pooja service amount × global
 * admin-configured percentage / 100.
 *
 * This is a GLOBAL rule — one percentage for all eligible Pooja bookings.
 * It is independent of the referral systems: referred and non-referred users
 * are equally eligible, and the recipient is always the user who completed
 * the Pooja (never the referrer).
 *
 * Integration: called from every booking-completion path (pandit OTP verify,
 * admin approve-completion, admin status → completed). Fire-and-forget with
 * error logging at the call sites.
 *
 * Idempotency: exactly one reward per booking. The wallet credit uses the
 * unique idempotencyKey `pooja_loyalty_reward_<bookingId>` on
 * WalletTransaction (unique index) — the wallet ledger itself is the durable,
 * concurrency-safe guard, so duplicate completion events / concurrent handlers
 * can never double-credit.
 *
 * Usage:
 *   const poojaLoyaltyService = require('../services/poojaLoyaltyService');
 *   await poojaLoyaltyService.grantPoojaLoyaltyReward(bookingId);
 */

const Booking = require('../models/Booking');
const settings = require('../utils/settingsService');
const walletService = require('./walletService');
const { calculatePercentage } = require('../utils/financeUtils');

/**
 * Grant the global Pooja loyalty reward for a completed booking.
 *
 * Reward base: booking.poojaAmount — the authoritative PRE-TAX Pooja service
 * price (GST-exempt; coupon discounts apply only to the payable total and do
 * NOT reduce this stored service amount).
 *
 * Rounding: reuses financeUtils.calculatePercentage (roundToPaise) — the
 * documented 2-decimal (paisa-style) convention. Wallet coins are decimal
 * (WalletTransaction.amount is a plain Number), so fractional coin rewards
 * such as 49.95 are supported.
 *
 * @param {ObjectId} bookingId - The completed qualifying Pooja booking
 * @returns {Promise<{granted: boolean, coins?: number, percent?: number,
 *                    baseAmount?: number, bookingId?: ObjectId, reason?: string}>}
 */
async function grantPoojaLoyaltyReward(bookingId) {
  // Only a COMPLETED booking earns loyalty coins (not created/paid/confirmed).
  const booking = await Booking.findById(bookingId)
    .select('userId status poojaAmount bookingNumber')
    .lean();

  if (!booking || booking.status !== 'completed') {
    return { granted: false, reason: 'not-completed' };
  }

  // Global percentage from admin config — never hardcoded.
  const percent = await settings.get('poojaBookingCoinRewardPercent', 5);

  // 0% → no reward (no ledger noise). Negative values are rejected at the
  // settings layer, so any non-positive value here means "disabled".
  if (!(percent > 0)) {
    return { granted: false, reason: 'percent-disabled' };
  }

  // Authoritative pre-tax service amount.
  const baseAmount = Number(booking.poojaAmount) || 0;
  if (baseAmount <= 0) {
    return { granted: false, reason: 'no-base-amount' };
  }

  const coins = calculatePercentage(baseAmount, percent);

  // Credit through the existing wallet ledger (idempotent per booking).
  await walletService.credit({
    userId: booking.userId,
    amount: coins,
    type: 'POOJA_LOYALTY_REWARD',
    description: `Pooja Booking Loyalty Reward — Booking #${booking.bookingNumber || booking._id}`,
    reference: { type: 'BOOKING', id: booking._id },
    idempotencyKey: `pooja_loyalty_reward_${booking._id}`,
  });

  // Audit trail on the booking (idempotency itself lives in the wallet ledger).
  await Booking.findByIdAndUpdate(booking._id, {
    $set: {
      loyaltyRewardCoins: coins,
      loyaltyRewardPercent: percent,
      loyaltyRewardBaseAmount: baseAmount,
      loyaltyRewardCreditedAt: new Date(),
    },
  });

  return { granted: true, coins, percent, baseAmount, bookingId: booking._id };
}

module.exports = { grantPoojaLoyaltyReward };