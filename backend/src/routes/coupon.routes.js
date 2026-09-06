/**
 * Coupon Routes — /api/coupons
 *
 * Consumer-facing coupon validation (requires authentication).
 */

const router = require('express').Router();
const ctrl = require('../controllers/coupon.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// Validate coupon and preview discount
router.post('/validate', ctrl.validateCoupon);

module.exports = router;
