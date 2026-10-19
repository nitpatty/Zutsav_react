const router = require('express').Router();
const ctrl   = require('../controllers/booking.controller');
const { protect } = require('../middleware/auth');

// Webhook does not require auth (called by PhonePe server)
router.post('/phonepe-webhook', ctrl.phonePeWebhook);

// Pricing preview is public — shown before login on booking page
router.get('/pricing-preview', ctrl.getPricingPreview);

router.use(protect);

// Legacy Razorpay endpoints — deactivated with HTTP 410
// (docs/RAZORPAY_LEGACY_SECURITY_AUDIT.md, findings RZP-01…RZP-08). The
// original handlers remain in booking.controller.js but are no longer
// registered, so no order creation, signature, booking, notification, or
// payment-state logic runs on these paths.
router.post('/create-order',           ctrl.legacyRazorpayGone);
router.post('/verify-payment',         ctrl.legacyRazorpayGone);
router.post('/create-phonepe-order',   ctrl.createPhonePeBooking);

// Verify routes MUST come before /:id routes to avoid Express treating literals as ids
router.get('/verify-phonepe/:merchantTransactionId',   ctrl.verifyPhonePePayment);
router.get('/verify-remaining/:merchantTransactionId', ctrl.verifyRemainingPayment);

router.get('/my',                      ctrl.getMyBookings);
router.get('/by-number/:bookingNumber',ctrl.getBookingByNumber);
router.patch('/:id/cancel',            ctrl.cancelBooking);
router.get('/:id/refund-preview',      ctrl.getRefundPreview);
router.post('/:id/rate',               ctrl.rateBooking);
router.post('/:id/pay-remaining',      ctrl.payRemaining);
router.post('/:id/retry-payment',      ctrl.retryPayment);
router.get('/:id/invoice',             ctrl.getInvoiceData);
router.get('/:id',                     ctrl.getBookingById);

module.exports = router;
