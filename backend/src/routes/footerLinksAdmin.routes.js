const router = require('express').Router();
const ctrl = require('../controllers/footerLinks.controller');
const { uploadFooterFile } = require('../middleware/upload');

// Mounted under /api/admin/footer-links by admin.routes.js, which already applies
// `protect, authorize('admin')` — no separate auth here.

// General files up to 10 MB (executables/scripts refused, content verified in the
// controller); multer failures become a clean 400. Non-multipart (JSON) requests
// pass straight through.
const handleUpload = (req, res, next) => {
  uploadFooterFile.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    next();
  });
};

router.get('/', ctrl.listLinks);
router.post('/', handleUpload, ctrl.createLink);
router.put('/order', ctrl.reorderLinks);          // before /:id
router.patch('/:id', handleUpload, ctrl.updateLink);
router.delete('/:id', ctrl.deleteLink);

module.exports = router;
