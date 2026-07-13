const router = require('express').Router();
const ctrl = require('../controllers/legalDocument.controller');
const { uploadLegalDocument } = require('../middleware/upload');

// Mounted under /api/admin/documents by admin.routes.js, which already
// applies `protect, authorize('admin')` globally — no separate auth here.

// Translates multer size/type-filter failures into a clean 400 instead of
// falling through to the generic 500 error handler in app.js.
const handleUpload = (req, res, next) => {
  uploadLegalDocument.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    next();
  });
};

router.post('/:type', handleUpload, ctrl.uploadOrReplace);
router.put('/:type', handleUpload, ctrl.uploadOrReplace);
router.delete('/:type', ctrl.deleteDocument);

module.exports = router;
