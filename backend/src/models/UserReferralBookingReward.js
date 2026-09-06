const mongoose = require('mongoose');

/**
 * UserReferralBookingReward — tracks per-booking referral reward eligibility.
 *
 * Created when a referred user completes a qualifying Pooja.
 * Status lifecycle:
 *   PENDING → APPROVED (coins credited) or DENIED (no coins)
 *
 * One record per qualifying booking/referral pair.
 * Duplicate completion events are idempotent via unique bookingId+referralCodeId.
 */

const userReferralBookingRewardSchema = new mongoose.Schema(
  {
    // The referrer who receives the reward (User A)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The referred user who completed the Pooja (User B)
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Link back to the referral code that established the relationship
    referralCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserReferralCode',
      required: true,
    },

    // The qualifying completed booking
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true, // one reward record per booking
      index: true,
    },

    // Qualifying booking type — POOJA or KIT (kit bookings are pooja bookings
    // with a kit attached). Never PRODUCT/MARKETPLACE (those use the Order model).
    bookingType: {
      type: String,
      enum: ['POOJA', 'KIT'],
      default: 'POOJA',
    },

    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'DENIED'],
      default: 'PENDING',
      required: true,
      index: true,
    },

    // Store the reward amount at time of creation (snapshot from admin config)
    // so historical records remain auditable even if admin changes the setting.
    rewardAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Admin decision tracking
    adminDecisionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    adminDecisionAt: {
      type: Date,
      default: null,
    },
    adminNote: {
      type: String,
      default: '',
    },

    // Wallet credit tracking
    coinsCredited: {
      type: Boolean,
      default: false,
    },
    coinsCreditedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate reward records for the same booking
userReferralBookingRewardSchema.index({ bookingId: 1 }, { unique: true });

// Admin dashboard queries
userReferralBookingRewardSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('UserReferralBookingReward', userReferralBookingRewardSchema);
