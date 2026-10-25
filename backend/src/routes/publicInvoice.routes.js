const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/invoiceShare.controller');

/**
 * Public, UNAUTHENTICATED invoice access by share token.
 *
 * Mounted in app.js BEFORE the request logger and request monitor on purpose:
 * both would otherwise record req.url / req.path — i.e. the bearer token.
 * Every request under this prefix is therefore terminated inside this router
 * (see the catch-all at the bottom) and never reaches those middlewares.
 */

// Brute-force / token-probing guard: only FAILED lookups (4xx) count, so a
// customer reopening their own link is never throttled by it.
const failedLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// Overall ceiling per client for this endpoint.
const publicInvoiceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
router.use(publicInvoiceLimiter, failedLookupLimiter);

router.get('/:token', ctrl.getPublicInvoice);

// Anything else under /api/public/invoices (other methods, extra path segments)
// ends here with the same generic answer.
router.use((req, res) => res.status(404).json({ success: false, message: ctrl.NOT_AVAILABLE }));

module.exports = router;
