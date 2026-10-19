const router = require('express').Router();
const ctrl   = require('../controllers/mockPayment.controller');
const { protect } = require('../middleware/auth');

// Mock payment simulator — only reachable when PAYMENT_MODE=mock; the whole
// router is unmounted (and the handlers 404) in production.
router.use(protect);
router.get('/:merchantTransactionId', ctrl.getOutcome);
router.post('/:merchantTransactionId', ctrl.setOutcome);

module.exports = router;
