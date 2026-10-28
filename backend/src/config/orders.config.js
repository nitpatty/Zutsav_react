const { readEnv } = require('./env');

/**
 * Pending-payment lifetime of a marketplace order.
 *
 * NO default is invented: the project has no approved order-expiry duration (the 24 h
 * CheckoutRequest retention is an idempotency window, not an order policy, and the 30 min
 * in cleanupJobs is only "when to ask the gateway", never "when to give up"). So expiry is OFF
 * until a deployment sets MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES explicitly:
 *
 *   unset / blank        → disabled: orders never auto-expire and retry has no age limit
 *   whole number ≥ 30    → enabled with that lifetime
 *   anything else        → INVALID: treated as disabled (fail safe — never expire on a guess),
 *                          and reported at startup (config/validate.js) and by the sweep job
 *
 * 30 is the floor because it is the project's own existing "stale payment attempt" age
 * (cleanupJobs.sweepStalePaymentAttempts); a shorter window could close an order whose
 * PhonePe payment page is still open.
 */
const MIN_EXPIRY_MINUTES = 30;
const ENV_NAME = 'MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES';

function resolvePendingOrderExpiry(raw = readEnv(ENV_NAME)) {
  const text = raw == null ? '' : String(raw).trim();
  if (!text) return { enabled: false, valid: true, reason: `${ENV_NAME} is not set — pending marketplace orders never auto-expire` };
  if (!/^\d+$/.test(text)) {
    return { enabled: false, valid: false, reason: `${ENV_NAME}="${text}" is not a whole number of minutes — expiry disabled` };
  }
  const minutes = Number(text);
  if (!Number.isSafeInteger(minutes) || minutes < MIN_EXPIRY_MINUTES) {
    return { enabled: false, valid: false, reason: `${ENV_NAME}=${text} is below the ${MIN_EXPIRY_MINUTES}-minute minimum — expiry disabled` };
  }
  return { enabled: true, valid: true, minutes, ms: minutes * 60 * 1000, reason: `orders expire after ${minutes} min without payment` };
}

module.exports = { ENV_NAME, MIN_EXPIRY_MINUTES, resolvePendingOrderExpiry };
