/**
 * Admin Coupon Routes — /api/admin/coupons
 *
 * CRUD operations for coupons, activation/deactivation, and redemption history.
 */

const router = require('express').Router();
const ctrl = require('../controllers/adminCoupon.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// ── Coupon Management ───────────────────────────────────────────────────────
router.get('/', ctrl.listCoupons);
router.get('/:id', ctrl.getCoupon);
router.post('/', ctrl.createCoupon);
router.patch('/:id', ctrl.updateCoupon);
router.patch('/:id/toggle', ctrl.toggleCoupon);
router.delete('/:id', ctrl.deleteCoupon);

// ── Redemption History ──────────────────────────────────────────────────────
router.get('/:id/redemptions', ctrl.listRedemptions);

module.exports = router;
