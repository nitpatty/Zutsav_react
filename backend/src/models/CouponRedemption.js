const mongoose = require('mongoose');

/**
 * CouponRedemption — immutable ledger record for each coupon usage.
 *
 * One record per coupon+booking pair. Idempotent via idempotencyKey.
 * Created when a coupon is successfully validated and applied at checkout.
 */

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },

    purchaseType: {
      type: String,
      enum: ['POOJA', 'PRODUCTS', 'KITS', 'MARKETPLACE'],
      default: 'POOJA',
    },

    discountType: {
      type: String,
      enum: ['FIXED', 'PERCENTAGE'],
      default: 'FIXED',
    },

    discountApplied: {
      type: Number,
      required: true,
      min: 0,
    },

    cartValue: {
      type: Number,
      required: true,
      min: 0,
    },

    finalPayable: {
      type: Number,
      required: true,
      min: 0,
    },

    redeemedAt: {
      type: Date,
      default: Date.now,
    },

    // Unique per coupon+booking — prevents double redemption
    idempotencyKey: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    // ── Campaign attribution (Coupon Marketing foundation) ─────────────
    // Where the coupon use originated. 'manual' = typed at checkout (default,
    // preserves all pre-existing behavior); 'campaign' = the redemption was
    // driven by a coupon marketing campaign (deep-link / prefill). Optional
    // so existing callers that don't pass a source keep working unchanged.
    source: {
      type: String,
      enum: ['manual', 'campaign'],
      default: 'manual',
      index: true,
    },

    // The CouponCampaign (if any) that this redemption is attributed to. Used
    // by analytics to measure campaign-driven conversions. Null for manual
    // redemptions and for any pre-existing data.
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CouponCampaign',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Query: check if user already redeemed a specific coupon
couponRedemptionSchema.index({ couponId: 1, userId: 1 });

module.exports = mongoose.model('CouponRedemption', couponRedemptionSchema);
