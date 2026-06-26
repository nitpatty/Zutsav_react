const router = require('express').Router();
const ctrl   = require('../controllers/booking.controller');
const { protect } = require('../middleware/auth');

// Webhook does not require auth (called by PhonePe server)
router.post('/phonepe-webhook', ctrl.phonePeWebhook);

// Pricing preview is public — shown before login on booking page
router.get('/pricing-preview', ctrl.getPricingPreview);

router.use(protect);

router.post('/create-order',           ctrl.createBookingOrder);
router.post('/verify-payment',         ctrl.verifyPayment);
router.post('/create-phonepe-order',   ctrl.createPhonePeBooking);

// Verify routes MUST come before /:id routes to avoid Express treating literals as ids
router.get('/verify-phonepe/:merchantTransactionId',   ctrl.verifyPhonePePayment);
router.get('/verify-remaining/:merchantTransactionId', ctrl.verifyRemainingPayment);

router.get('/my',                      ctrl.getMyBookings);
router.patch('/:id/cancel',            ctrl.cancelBooking);
router.post('/:id/rate',               ctrl.rateBooking);
router.post('/:id/pay-remaining',      ctrl.payRemaining);
router.get('/:id/invoice',             ctrl.getInvoiceData);
router.get('/:id',                     ctrl.getBookingById);

module.exports = router;
