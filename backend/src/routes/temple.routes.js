const router = require('express').Router();
const ctrl   = require('../controllers/temple.controller');
const { protect, authorize } = require('../middleware/auth');
const { uploadTemple } = require('../middleware/upload');

// Public
router.get('/',    ctrl.getTemples);

// Admin: named routes MUST come before /:id
router.get('/admin', protect, authorize('admin'), ctrl.getAdminTemples);
router.get('/homepage-featured', protect, authorize('admin'), ctrl.getHomepageFeatured);
router.put('/homepage-featured', protect, authorize('admin'), ctrl.setHomepageFeatured);

router.get('/:id', ctrl.getTemple);

// Admin only
router.post('/',      protect, authorize('admin'), uploadTemple, ctrl.createTemple);
router.post('/:id/duplicate', protect, authorize('admin'), ctrl.duplicateTemple);
router.patch('/:id/status',   protect, authorize('admin'), ctrl.toggleTempleStatus);
router.patch('/:id',  protect, authorize('admin'), uploadTemple, ctrl.updateTemple);
router.delete('/:id', protect, authorize('admin'), ctrl.deleteTemple);

module.exports = router;
