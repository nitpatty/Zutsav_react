const router = require('express').Router();
const ctrl   = require('../controllers/checkout.controller');
const { protect } = require('../middleware/auth');

router.post('/webhook',         ctrl.cartWebhook);           // PhonePe callback (no auth)
router.post('/cart',   protect, ctrl.cartCheckout);          // Combined cart checkout
router.get('/verify/:merchantTransactionId', protect, ctrl.verifyCartPayment);

module.exports = router;
