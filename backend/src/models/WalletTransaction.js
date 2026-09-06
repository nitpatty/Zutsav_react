const mongoose = require('mongoose');

/**
 * WalletTransaction — immutable ledger record for every wallet balance change.
 *
 * Transactions are append-only. Corrections use compensating transactions,
 * never in-place edits. Each record is idempotent via idempotencyKey.
 *
 * idempotencyKey convention:
 *   referral_registration_<UserReferralCode._id>
 *   referral_booking_reward_<UserReferralBookingReward._id>
 *   pooja_loyalty_reward_<Booking._id>
 *   coupon_redemption_<Booking._id>_<Coupon._id>   (future)
 *   admin_adjustment_<timestamp>_<adminId>          (future)
 */

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: [0, 'Transaction amount must be positive'],
    },

    direction: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
    },

    type: {
      type: String,
      enum: [
        'REFERRAL_REGISTRATION',
        'REFERRAL_BOOKING_REWARD',
        'POOJA_LOYALTY_REWARD',
        'COIN_REDEMPTION',
        'ADMIN_ADJUSTMENT',
      ],
      required: true,
    },

    // Running balance snapshot after this transaction (for audit)
    balanceAfter: {
      type: Number,
      required: true,
    },

    // Business reference — links back to the originating domain entity
    reference: {
      type: { type: String, required: true }, // 'USER_REFERRAL', 'BOOKING_REWARD', 'COUPON', 'ADMIN'
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },

    status: {
      type: String,
      enum: ['COMPLETED', 'REVERSED'],
      default: 'COMPLETED',
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    // Unique per business event — prevents duplicate credits/debits
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true, // allows null for admin adjustments without keys
      index: true,
    },

    // Who initiated (null for automated referral rewards)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Query pattern: list user's transactions chronologically
walletTransactionSchema.index({ userId: 1, createdAt: 1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
