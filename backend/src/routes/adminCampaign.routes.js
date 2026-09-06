/**
 * Admin Coupon Campaign Routes — /api/admin/campaigns
 *
 * Coupon marketing campaign management (create, preview/dry-run, start/continue,
 * schedule, cancel) and per-recipient delivery outcome views.
 */

const router = require('express').Router();
const ctrl = require('../controllers/adminCampaign.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// ── Campaign Management ───────────────────────────────────────────────────
router.get('/', ctrl.listCampaigns);
router.post('/', ctrl.createCampaign);
router.get('/:id', ctrl.getCampaign);
router.post('/:id/preview', ctrl.previewCampaign);
router.post('/:id/start', ctrl.startCampaign);
router.post('/:id/continue', ctrl.continueCampaign);
router.post('/:id/cancel', ctrl.cancelCampaign);

// ── Recipient Delivery Outcomes ───────────────────────────────────────────
router.get('/:id/recipients', ctrl.listRecipients);

module.exports = router;
