/**
 * Coupon Controller — consumer-facing coupon validation and preview.
 *
 * Routes are mounted under /api/coupons.
 * Requires authentication (user must be logged in to validate their coupon).
 */

const couponService = require('../services/couponService');

// ── Validate + preview coupon discount ──────────────────────────────────────
/**
 * POST /api/coupons/validate
 *
 * Validates a coupon and returns the computed discount without recording it.
 * The frontend calls this to show a preview before the user places an order.
 *
 * Body:
 *   code      {string}  — coupon code
 *   cartValue {number}  — eligible amount (the portion of the cart this coupon applies to)
 *   cartType  {string}  — POOJA | PRODUCTS | KITS | MARKETPLACE
 *
 * Returns:
 *   { valid, discount, finalPayable, coupon: { code, discountType, discountValue, maxDiscount, minCartValue } }
 */
exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, cartValue, cartType = 'POOJA' } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    if (cartValue == null || isNaN(Number(cartValue)) || Number(cartValue) < 0) {
      return res.status(400).json({ success: false, message: 'Valid cart value is required' });
    }

    const validCartTypes = ['POOJA', 'PRODUCTS', 'KITS', 'MARKETPLACE'];
    if (!validCartTypes.includes(cartType)) {
      return res.status(400).json({ success: false, message: `Invalid cart type. Must be one of: ${validCartTypes.join(', ')}` });
    }

    const result = await couponService.validateCoupon({
      code,
      userId: req.user._id,
      cartValue: Number(cartValue),
      cartType,
    });

    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Return sanitized coupon info (never expose internal fields)
    res.json({
      success: true,
      valid: true,
      discount: result.discount,
      finalPayable: result.finalPayable,
      coupon: {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: result.coupon.discountValue,
        maxDiscount: result.coupon.maxDiscount,
        minCartValue: result.coupon.minCartValue,
      },
    });
  } catch (err) {
    next(err);
  }
};
