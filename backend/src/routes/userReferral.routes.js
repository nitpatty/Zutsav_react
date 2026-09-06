/**
 * User Referral Routes — /api/user-referrals
 *
 * Completely separate from Pandit Referral (/api/referral/*).
 * These routes handle User → User referral code operations.
 */

const router = require('express').Router();
const ctrl = require('../controllers/userReferral.controller');
const { protect, authorize } = require('../middleware/auth');

// ── Public ──────────────────────────────────────────────────────────────────
// Validate a referral code (for registration page auto-fill)
router.get('/validate/:code', ctrl.validateCode);

// ── Authenticated user ──────────────────────────────────────────────────────
router.use(protect);

// Generate a new referral code
router.post('/generate', authorize('user'), ctrl.generateCode);

// List my referral codes
router.get('/my', authorize('user'), ctrl.listMyCodes);

// Get current settings (read-only; full admin CRUD in Admin phase)
router.get('/settings', ctrl.getSettings);

module.exports = router;
