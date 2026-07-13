const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/ai.controller');
const guidedCtrl = require('../controllers/guidedRecommend.controller');
const { optionalAuth } = require('../middleware/auth');

// AI Guide is a fully public discovery feature — reachable by guests, login
// is only ever required at a transactional checkpoint (booking payment, via
// useCheckoutAuthGuard). Applies to both the default freeform chat and the
// guided/booking-discovery mode. A tighter dedicated limit applies on top of
// the global apiLimiter in app.js since both now take anonymous traffic
// against a paid LLM API.
const guidedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

router.post('/chat', guidedLimiter, optionalAuth, ctrl.chat);

router.get('/guided-intents', guidedCtrl.getIntents);
router.post('/guided-recommend', guidedLimiter, optionalAuth, guidedCtrl.recommend);

module.exports = router;
