const router = require('express').Router();
const ctrl   = require('../controllers/pooja.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadProfile, uploadPooja } = require('../middleware/upload');

// ── Public ───────────────────────────────────────────────────
router.get('/categories',      ctrl.getCategories);
router.get('/',                ctrl.getPoojas);

// ── Admin: named routes MUST come before /:slug / /:id ───────
router.get('/admin-catalog',      protect, authorize('admin'), ctrl.getAdminPoojas);
router.get('/homepage-popular',   protect, authorize('admin'), ctrl.getHomepagePopular);
router.put('/homepage-popular',   protect, authorize('admin'), ctrl.setHomepagePopular);

// ── Admin: categories — full admin list/detail/restore/status, MUST come
// before the generic /:slug catch-all below ───────────────────
router.get('/admin/categories',                protect, authorize('admin'), ctrl.getAdminCategories);
router.get('/admin/categories/:id',             protect, authorize('admin'), ctrl.getAdminCategoryDetail);
router.patch('/admin/categories/:id/restore',   protect, authorize('admin'), ctrl.restoreCategory);
router.patch('/admin/categories/:id/status',    protect, authorize('admin'), ctrl.toggleCategoryStatus);

router.get('/:slug/reviews',   ctrl.getPoojaReviews);
router.get('/:slug',           ctrl.getPoojaBySlug);

// ── Admin: categories CRUD (create/update/delete — existing paths, hardened) ─
router.post('/categories',     protect, authorize('admin'), uploadProfile.single('image'), ctrl.createCategory);
router.patch('/categories/:id',protect, authorize('admin'), uploadProfile.single('image'), ctrl.updateCategory);
router.delete('/categories/:id',protect, authorize('admin'), ctrl.deleteCategory);

// ── Admin: inline image upload for the rich text (TipTap) fields ─────
router.post('/upload-image',   protect, authorize('admin'), uploadPooja.single('image'), ctrl.uploadImage);

// ── Admin: pooja CRUD ─────────────────────────────────────────
router.post('/',               protect, authorize('admin'), uploadProfile.single('image'), ctrl.createPooja);
router.patch('/:id/status',    protect, authorize('admin'), ctrl.togglePoojaStatus);
router.patch('/:id',           protect, authorize('admin'), uploadProfile.single('image'), ctrl.updatePooja);
router.delete('/:id',          protect, authorize('admin'), ctrl.deletePooja);

module.exports = router;
