const mongoose = require('mongoose');

/**
 * Coupon — discount coupon domain model.
 *
 * Supports:
 *   - Fixed-value discounts (₹10 off)
 *   - Percentage discounts (10% off, capped by maxDiscount)
 *   - Global usage limit
 *   - Per-user usage limit
 *   - Configurable applicability: POOJA, PRODUCTS, KITS, MARKETPLACE
 *   - Time-based validity (validFrom → expiresAt)
 *
 * Coupons are admin-created and validated server-side.
 * Client-submitted coupon values are NEVER trusted.
 */

const couponSchema = new mongoose.Schema(
  {
    // Normalized coupon code (uppercase, trimmed)
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    discountType: {
      type: String,
      enum: ['FIXED', 'PERCENTAGE'],
      default: 'FIXED',
      required: true,
    },

    // Fixed: absolute value (₹10). Percentage: used with maxDiscount cap.
    discountValue: {
      type: Number,
      required: true,
      min: [0, 'Discount value must be non-negative'],
    },

    // Minimum cart value required to apply this coupon
    minCartValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Maximum discount cap (relevant for PERCENTAGE type; null = uncapped)
    maxDiscount: {
      type: Number,
      default: null,
      min: 0,
    },

    // Validity window
    validFrom: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null, // null = no expiry (lifetime)
    },

    // Global total usage limit (null = unlimited)
    usageLimit: {
      type: Number,
      default: null,
      min: 0,
    },

    // Per-user usage limit (null = unlimited per user)
    perUserLimit: {
      type: Number,
      default: 1,
      min: 0,
    },

    // Running counter of total global redemptions
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Applicability — which product categories this coupon can discount
    // Supported: POOJA, PRODUCTS, KITS, MARKETPLACE (multi-select allowed)
    applicability: {
      type: [String],
      enum: ['POOJA', 'MARKETPLACE', 'PRODUCTS', 'KITS'],
      default: ['POOJA'],
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Admin who created this coupon
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Useful compound queries
couponSchema.index({ isActive: 1, expiresAt: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
