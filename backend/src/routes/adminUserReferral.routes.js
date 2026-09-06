/**
 * Admin User Referral Routes — /api/admin/user-referrals
 * Admin Booking Reward Routes — /api/admin/booking-rewards
 *
 * Completely separate from Pandit Referral (/api/referral/*).
 */

const router = require('express').Router();
const ctrl = require('../controllers/adminUserReferral.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// ── Overview / Analytics ────────────────────────────────────────────────────
router.get('/overview', ctrl.getOverview);

// ── Referral Code Management ────────────────────────────────────────────────
router.get('/codes', ctrl.listCodes);

// ── Referral Settings ───────────────────────────────────────────────────────
router.get('/settings', ctrl.getSettings);
router.patch('/settings', ctrl.updateSettings);

module.exports = router;

// ── Booking Reward Routes (separate router) ─────────────────────────────────
const rewardRouter = require('express').Router();
rewardRouter.use(protect, authorize('admin'));
rewardRouter.get('/', ctrl.listBookingRewards);
rewardRouter.patch('/:id/approve', ctrl.approveReward);
rewardRouter.patch('/:id/deny', ctrl.denyReward);

module.exports.userReferralRouter = router;
module.exports.bookingRewardRouter = rewardRouter;
