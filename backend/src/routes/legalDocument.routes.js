const router = require('express').Router();
const ctrl = require('../controllers/legalDocument.controller');

// Public — no auth required
router.get('/', ctrl.listPublic);
router.get('/:type', ctrl.getPublicOne);
router.get('/:type/view', ctrl.viewDocument);

module.exports = router;
