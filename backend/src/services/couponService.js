/**
 * CouponService — coupon validation, usage checking, and domain logic.
 *
 * Responsibilities:
 *   - Validate coupon codes (validity, expiry, active, applicability)
 *   - Check global and per-user usage limits
 *   - Calculate discount (server-authoritative)
 *   - Record redemption with idempotency
 *
 * Supports all discount types: FIXED, PERCENTAGE
 * Supports all applicability types: POOJA, PRODUCTS, KITS, MARKETPLACE
 *
 * Usage:
 *   const couponService = require('../services/couponService');
 */

const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');

// ── Normalize coupon code ────────────────────────────────────────────────────
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

// ── Validate numeric inputs ──────────────────────────────────────────────────
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// ── Calculate discount (server-authoritative) ────────────────────────────────
/**
 * Calculate the discount for a coupon against an eligible amount.
 * Pure function — no DB access. Used internally and exported for testing.
 *
 * @param {Object} coupon - Coupon document
 * @param {number} eligibleAmount - Pre-discount eligible amount
 * @returns {{ discount: number, finalPayable: number }}
 */
function calculateDiscount(coupon, eligibleAmount) {
  let discount = 0;

  if (coupon.discountType === 'FIXED') {
    discount = Math.min(coupon.discountValue, eligibleAmount);
  } else if (coupon.discountType === 'PERCENTAGE') {
    discount = (eligibleAmount * coupon.discountValue) / 100;
    if (coupon.maxDiscount != null && coupon.maxDiscount >= 0) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
    discount = Math.min(discount, eligibleAmount);
  }

  discount = Math.round(discount * 100) / 100;
  const finalPayable = Math.max(0, Math.round((eligibleAmount - discount) * 100) / 100);

  return { discount, finalPayable };
}

// ── Validate a coupon ────────────────────────────────────────────────────────
/**
 * Validate a coupon for a given user and cart context.
 *
 * @param {Object} params
 * @param {string} params.code - Coupon code
 * @param {ObjectId} params.userId - User attempting to redeem
 * @param {number} params.cartValue - Total cart value (eligible amount)
 * @param {string} [params.cartType='POOJA'] - Cart type for applicability
 * @returns {Promise<{valid: boolean, coupon?: Document, discount?: number, finalPayable?: number, error?: string}>}
 */
async function validateCoupon({ code, userId, cartValue, cartType = 'POOJA' }) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) {
    return { valid: false, error: 'Coupon code is required' };
  }

  if (!isFiniteNumber(cartValue) || cartValue < 0) {
    return { valid: false, error: 'Invalid cart value' };
  }

  // Find the coupon
  const coupon = await Coupon.findOne({ code: normalizedCode });
  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }

  // Check active status
  if (!coupon.isActive) {
    return { valid: false, error: 'This coupon is no longer active' };
  }

  // Check validity window
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) {
    return { valid: false, error: 'This coupon is not yet valid' };
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { valid: false, error: 'This coupon has expired' };
  }

  // Check applicability
  if (!coupon.applicability.includes(cartType)) {
    return { valid: false, error: `This coupon is not applicable to ${cartType} purchases` };
  }

  // Check minimum cart value
  if (coupon.minCartValue > 0 && cartValue < coupon.minCartValue) {
    return {
      valid: false,
      error: `Minimum cart value of ₹${coupon.minCartValue} required for this coupon`,
    };
  }

  // Check global usage limit
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: 'This coupon has reached its usage limit' };
  }

  // Check per-user usage limit
  if (coupon.perUserLimit !== null && userId) {
    const userRedemptions = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      userId,
    });
    if (userRedemptions >= coupon.perUserLimit) {
      return { valid: false, error: 'You have already used this coupon' };
    }
  }

  // Calculate discount (server-authoritative, never trust client)
  const { discount, finalPayable } = calculateDiscount(coupon, cartValue);

  return {
    valid: true,
    coupon,
    discount,
    finalPayable,
  };
}

// ── Record a redemption ──────────────────────────────────────────────────────
/**
 * Record a coupon redemption with idempotency.
 *
 * @param {Object} params
 * @param {ObjectId} params.couponId
 * @param {ObjectId} params.userId
 * @param {ObjectId} [params.bookingId] - Booking ID (for pooja bookings)
 * @param {ObjectId} [params.orderId] - Order ID (for marketplace orders)
 * @param {string} [params.purchaseType='POOJA'] - Purchase type
 * @param {string} params.discountType - FIXED or PERCENTAGE
 * @param {number} params.discountApplied
 * @param {number} params.cartValue
 * @param {number} params.finalPayable
 * @param {string} [params.source='manual'] - 'manual' | 'campaign' (attribution)
 * @param {ObjectId} [params.campaignId] - CouponCampaign id for attribution
 * @returns {Promise<{redemption: Document, alreadyExists: boolean}>}
 */
async function recordRedemption({
  couponId,
  userId,
  bookingId,
  orderId,
  purchaseType = 'POOJA',
  discountType,
  discountApplied,
  cartValue,
  finalPayable,
  source = 'manual',
  campaignId,
}) {
  // Idempotency key supports both booking and order redemptions
  const refId = bookingId || orderId;
  const idempotencyKey = `coupon_${couponId}_${refId}`;

  // Check idempotency
  const existing = await CouponRedemption.findOne({ idempotencyKey });
  if (existing) {
    return { redemption: existing, alreadyExists: true };
  }

  // Create redemption record
  const redemption = await CouponRedemption.create({
    couponId,
    userId,
    bookingId: bookingId || null,
    orderId: orderId || null,
    purchaseType,
    discountType,
    discountApplied,
    cartValue,
    finalPayable,
    idempotencyKey,
    // Campaign attribution — optional, backward compatible.
    source: ['manual', 'campaign'].includes(source) ? source : 'manual',
    campaignId: campaignId || null,
  });

  // Increment global usage counter atomically
  await Coupon.findByIdAndUpdate(couponId, { $inc: { usageCount: 1 } });

  return { redemption, alreadyExists: false };
}

// ── Get coupon by code ───────────────────────────────────────────────────────
async function getCouponByCode(code) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;
  return Coupon.findOne({ code: normalizedCode });
}

module.exports = {
  validateCoupon,
  recordRedemption,
  getCouponByCode,
  calculateDiscount,
  normalizeCode,
};
