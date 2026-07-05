const router = require('express').Router();
const ctrl = require('../controllers/configCenter.controller');

// Mounted under /api/admin/config-center by admin.routes.js, which already
// applies `protect, authorize('admin')` globally — no separate auth here.
router.get('/manifest', ctrl.getManifest);
router.get('/verify', ctrl.verifyConfiguration);
router.get('/history', ctrl.getHistory);
router.get('/history/compare', ctrl.compareHistory);
router.post('/history/:id/restore', ctrl.restoreVersion);
router.get('/', ctrl.getCurrentValues);
router.patch('/:section', ctrl.updateSection);

module.exports = router;
