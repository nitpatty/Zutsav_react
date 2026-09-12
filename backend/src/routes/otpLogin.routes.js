const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/otpLogin.controller');

// Every route here is intentionally unauthenticated (it IS a login flow) — a
// dedicated tighter limit blunts brute-force, enumeration and OTP-flooding on
// top of app.js's global authLimiter, exactly like the forgot-password router.
const loginOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.use(loginOtpLimiter);

router.post('/send',   ctrl.requestLoginOTP);
router.post('/verify', ctrl.verifyLoginOTP);

module.exports = router;