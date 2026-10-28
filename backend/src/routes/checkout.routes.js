const router = require('express').Router();
const ctrl   = require('../controllers/checkout.controller');
const retryCtrl = require('../controllers/orderRetry.controller');
const { protect } = require('../middleware/auth');

router.post('/webhook',         ctrl.cartWebhook);           // PhonePe callback (no auth)
router.post('/cart',   protect, ctrl.cartCheckout);          // Combined cart checkout
router.get('/verify/:merchantTransactionId', protect, ctrl.verifyCartPayment);
router.post('/orders/:id/retry-payment', protect, retryCtrl.retryOrderPayment); // new payment attempt for an existing unpaid order

module.exports = router;
