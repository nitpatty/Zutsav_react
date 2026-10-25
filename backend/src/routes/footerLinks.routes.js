const router = require('express').Router();
const ctrl = require('../controllers/footerLinks.controller');

// Public — no auth. Only enabled DOCUMENT links are ever served; URL links are
// plain external hrefs and never touch this API.
router.get('/:id', ctrl.getPublicLinkMeta);
router.get('/:id/view', ctrl.viewPublicLink);          // inline for PDF/images, otherwise a download
router.get('/:id/download', ctrl.downloadPublicLink);  // always a download

module.exports = router;
