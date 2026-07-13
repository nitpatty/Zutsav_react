/**
 * Shared OTP generation/hashing service.
 *
 * Unifies the 3 previously-duplicated 6-digit generators (registration/login
 * auth.controller.js, booking-completion booking.controller.js, marketplace
 * delivery admin.controller.js) into one implementation. Per the confirmed
 * scope for this rebuild, storage location is NOT unified — each domain
 * keeps its existing storage (the global OTP collection for auth, a bcrypt
 * hash on Booking.completionOtp, a bcrypt hash on Order.deliveryOTP), since
 * each already has correct expiry/attempt-limit semantics wired to its own
 * verify endpoint. Only generation, hashing, and comparison are shared.
 */

const bcrypt = require('bcryptjs');

const DEFAULT_MAX_ATTEMPTS = 5;

/** A random 6-digit numeric OTP, e.g. "042817". */
function generate() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hash(otp) {
  return bcrypt.hash(otp, 10);
}

/**
 * @param {string} input       - what the user submitted
 * @param {string} stored      - the stored value (plaintext or bcrypt hash)
 * @param {boolean} isHashed   - whether `stored` is a bcrypt hash (true) or plaintext (false)
 */
async function compare(input, stored, isHashed = true) {
  if (!input || !stored) return false;
  if (isHashed) return bcrypt.compare(input, stored);
  return String(input).trim() === String(stored).trim();
}

function isRateLimited(attempts, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  return (attempts || 0) >= maxAttempts;
}

module.exports = { generate, hash, compare, isRateLimited, DEFAULT_MAX_ATTEMPTS };
