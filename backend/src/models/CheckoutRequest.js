const mongoose = require('mongoose');

/**
 * Idempotency record for POST /api/checkout/cart (one row per customer + key).
 *
 * The UNIQUE index on { userId, operation, key } is what makes the claim atomic across
 * requests, processes and workers — there is no in-memory state. A client that retries
 * after a lost response sends the same key and gets the original result back instead of a
 * second order.
 *
 * Deliberately NOT stored: the request body (only a SHA-256 fingerprint, used to reject a
 * key re-used with a different cart), card/UPI details or any gateway credential. The
 * gateway's payment-page URL is kept so a replay can hand the customer the link they never
 * received; it is returned only to the same authenticated owner and expires with the row.
 *
 * Lifecycle:
 *   processing    claimed; nothing persisted yet                       (lockedUntil guards a crashed worker)
 *   order_created order/bookings persisted, gateway step not finished  (a retry resumes ONLY the gateway step)
 *   completed     gateway payment created; replays return the stored result
 *
 * Rows expire (TTL) after 24 h. Creating this new collection's indexes is safe on an empty
 * collection and touches no existing data.
 */
const checkoutRequestSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  operation:   { type: String, default: 'cart_checkout' },
  key:         { type: String, required: true },
  fingerprint: { type: String, required: true },

  state: { type: String, enum: ['processing', 'order_created', 'completed'], default: 'processing' },
  lockedUntil: { type: Date, default: null },

  // Fixed at claim time so order creation is repeatable without duplicating anything.
  merchantTransactionId: { type: String, required: true },

  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  bookingIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  totals:     { type: mongoose.Schema.Types.Mixed, default: null }, // { bookingTotal, productTotal, combinedTotal }
  payable:    { type: Number, default: null },                       // amount sent to the gateway
  redirectUrl: { type: String, default: null },

  expireAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
}, { timestamps: true });

checkoutRequestSchema.index({ userId: 1, operation: 1, key: 1 }, { unique: true });
checkoutRequestSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CheckoutRequest', checkoutRequestSchema);
