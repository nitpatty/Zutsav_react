const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/passwordReset.controller');

// Every route here is intentionally unauthenticated (that's the point of a
// password-recovery flow) — a dedicated tighter limit blunts brute-force/
// enumeration on top of app.js's global apiLimiter.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.use(forgotPasswordLimiter);

router.post('/check-account', ctrl.checkAccount);
router.post('/send-otp',      ctrl.sendOtp);
router.post('/verify-otp',    ctrl.verifyOtp);
router.post('/reset',         ctrl.resetPassword);

module.exports = router;
