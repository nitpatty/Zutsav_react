const router = require('express').Router();
const ctrl   = require('../controllers/heroBanner.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadHeroBanner } = require('../middleware/upload');

// ── Public ───────────────────────────────────────────────────
router.get('/', ctrl.getPublicBanners);

// ── Admin: named routes MUST come before /:id ─────────────────
router.get('/admin', protect, authorize('admin'), ctrl.getAdminBanners);
router.patch('/reorder', protect, authorize('admin'), ctrl.reorderBanners);

router.post('/',      protect, authorize('admin'), uploadHeroBanner.single('image'), ctrl.createBanner);
router.patch('/:id',  protect, authorize('admin'), uploadHeroBanner.single('image'), ctrl.updateBanner);
router.delete('/:id', protect, authorize('admin'), ctrl.deleteBanner);

module.exports = router;
