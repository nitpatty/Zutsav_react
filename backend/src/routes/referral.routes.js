const router = require('express').Router();
const ctrl   = require('../controllers/referral.controller');
const { protect, authorize } = require('../middleware/auth');

// ── Public ──────────────────────────────────────────────────────────────────
// Validate a referral token (opens landing page — marks as OPENED)
router.get('/validate/:token', ctrl.validateToken);

// ── Pandit-only ─────────────────────────────────────────────────────────────
router.post('/',               protect, authorize('pandit', 'admin'), ctrl.createReferral);
router.get('/my',              protect, authorize('pandit', 'admin'), ctrl.getMyReferrals);
router.patch('/:id/remark',    protect, authorize('pandit', 'admin'), ctrl.submitRemark);

// ── Admin-only ───────────────────────────────────────────────────────────────
router.get('/admin/list',      protect, authorize('admin'), ctrl.adminListReferrals);
router.get('/analytics',       protect, authorize('admin'), ctrl.getReferralAnalytics);
router.patch('/:id/status',    protect, authorize('admin'), ctrl.adminUpdateStatus);

// ── Legacy user referral program ─────────────────────────────────────────────
router.get('/user/my',         protect,                     ctrl.getMyReferral);
router.get('/admin/stats',     protect, authorize('admin'), ctrl.getAdminReferralStats);

module.exports = router;
