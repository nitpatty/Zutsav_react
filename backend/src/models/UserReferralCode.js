const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * UserReferralCode — User → User referral code domain model.
 *
 * Each generated code is unique, expiring, single-use, and admin-configurable.
 * Completely separate from the Pandit Referral system (models/Referral.js).
 *
 * Lifecycle:
 *   AVAILABLE → USED  (consumed at registration)
 *   AVAILABLE → EXPIRED (past expiresAt, never consumed)
 */

const userReferralCodeSchema = new mongoose.Schema(
  {
    // Random 6-character alphanumeric code (uppercase), collision-safe via unique index
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      length: 6,
      index: true,
    },

    // The user who generated this referral code
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['AVAILABLE', 'USED', 'EXPIRED'],
      default: 'AVAILABLE',
      required: true,
    },

    // Expiry — calculated at generation time from admin-configured validity
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    // Populated when a referred user consumes this code
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },

    // Registration reward tracking — prevents duplicate credit
    registrationRewardCredited: {
      type: Boolean,
      default: false,
    },
    registrationRewardCreditedAt: {
      type: Date,
      default: null,
    },

    // Booking reward allocation — one entry per qualifying completed booking
    // that has already generated a reward for the referrer. The array length is
    // the per-referred-user reward count; the max is enforced atomically at
    // grant time via a conditional $addToSet (see userReferralService).
    rewardedBookingIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    }],
  },
  { timestamps: true }
);

// ── Compound indexes for efficient query patterns ──────────────────────────────
// Daily limit check: count codes by userId on current calendar day
userReferralCodeSchema.index({ userId: 1, createdAt: 1 });
// Status-based queries (AVAILABLE codes for a user, etc.)
userReferralCodeSchema.index({ userId: 1, status: 1 });
// Expiry cron / batch job
userReferralCodeSchema.index({ status: 1, expiresAt: 1 });

// ── Auto-generate a cryptographically random 6-char alphanumeric code ──────────
// Uses only uppercase letters and digits for readability (no ambiguous chars).
// Rare collision is handled by the unique index + retry at the service layer.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
const CODE_LENGTH = 6;

function generateCode() {
  let code = '';
  const bytes = crypto.randomBytes(CODE_LENGTH);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

userReferralCodeSchema.statics.generateCode = generateCode;

module.exports = mongoose.model('UserReferralCode', userReferralCodeSchema);
