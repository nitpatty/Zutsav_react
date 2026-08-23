/**
 * Location routes — server-side proxy for place search / geocoding.
 *
 * The Ola Maps API key lives only on the server (env or Config Center);
 * clients call these normalized endpoints instead of the vendor directly,
 * so no privileged credential is ever shipped to the browser.
 *
 * A dedicated limiter sits on top of the global /api limiter because each
 * request here can trigger an outbound paid-provider call.
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/location.controller');
const { protect } = require('../middleware/auth');

const locationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many location requests. Please slow down.' },
});

router.use(protect);
router.use(locationLimiter);

router.get('/autocomplete',    ctrl.autocomplete);
router.get('/geocode',         ctrl.geocode);
router.get('/reverse-geocode', ctrl.reverseGeocode);

module.exports = router;
