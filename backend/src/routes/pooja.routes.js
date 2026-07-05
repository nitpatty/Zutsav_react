const router = require('express').Router();
const ctrl   = require('../controllers/pooja.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/upload');

// ── Public ───────────────────────────────────────────────────
router.get('/categories',      ctrl.getCategories);
router.get('/',                ctrl.getPoojas);

// ── Admin: named routes MUST come before /:slug / /:id ───────
router.get('/admin-catalog',   protect, authorize('admin'), ctrl.getAdminPoojas);

router.get('/:slug',           ctrl.getPoojaBySlug);

// ── Admin: categories CRUD ───────────────────────────────────
router.post('/categories',     protect, authorize('admin'), uploadProfile.single('image'), ctrl.createCategory);
router.patch('/categories/:id',protect, authorize('admin'), uploadProfile.single('image'), ctrl.updateCategory);
router.delete('/categories/:id',protect, authorize('admin'), ctrl.deleteCategory);

// ── Admin: pooja CRUD ─────────────────────────────────────────
router.post('/',               protect, authorize('admin'), uploadProfile.single('image'), ctrl.createPooja);
router.patch('/:id/status',    protect, authorize('admin'), ctrl.togglePoojaStatus);
router.patch('/:id',           protect, authorize('admin'), uploadProfile.single('image'), ctrl.updatePooja);
router.delete('/:id',          protect, authorize('admin'), ctrl.deletePooja);

module.exports = router;
