const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:         { type: String, required: true },
  variantId:    { type: String, default: null },
  variantLabel: { type: String, default: null },
  price:        { type: Number, required: true },
  quantity:     { type: Number, required: true, min: 1 },
  taxRate:      { type: Number, default: 0 },
  taxAmount:    { type: Number, default: 0 },
  total:        { type: Number, required: true },
}, { _id: false });

const timelineEntrySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note:      { type: String, default: '' },
}, { _id: false });

// One entry per payment attempt (initial checkout + every retry). Never removed or overwritten, so
// the full payment history stays auditable. Mirrors Booking.paymentAttempts.
//   INITIATION_FAILED: the gateway call itself failed — no money can have moved for that transaction.
//   needsReconciliation: the gateway reports a SUCCESSFUL payment that could not be applied to the order
//     (it had already expired / been cancelled / been paid by another attempt). It is never silently
//     dropped and the order is never silently reopened — a human settles it (refund or manual action).
const paymentAttemptSchema = new mongoose.Schema({
  merchantTransactionId: { type: String, required: true },
  amount:                { type: Number },
  status:                { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'INITIATION_FAILED'], default: 'PENDING' },
  gatewayCode:           { type: String, default: '' },
  gatewayState:          { type: String, default: '' },
  failureReason:         { type: String, default: '' },
  initiatedAt:           { type: Date, default: Date.now },
  completedAt:           { type: Date, default: null },
  needsReconciliation:   { type: Boolean, default: false },
  reconciliationReason:  { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items:       [orderItemSchema],
  totalAmount: { type: Number, required: true },

  shippingAddress: {
    name:     { type: String, required: true },
    phone:    { type: String, required: true },
    address:  { type: String, required: true },
    pincode:  { type: String, required: true },
    state:    { type: String },
    city:     { type: String },
    district: { type: String },
  },

  status: {
    type: String,
    enum: [
      'pending_payment',
      'paid',          // payment received — order placed
      'confirmed',     // admin confirmed
      'packed',        // packed & ready to ship
      'shipped',       // handed to courier
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded',
      'payment_failed',
      'processing',    // legacy alias for confirmed
    ],
    default: 'pending_payment',
  },

  statusTimeline: [timelineEntrySchema],

  cancelReason:  { type: String },
  refundStatus:  { type: String, enum: ['none', 'requested', 'processed'], default: 'none' },

  paymentProvider:              { type: String, enum: ['phonepe', 'razorpay'], default: 'phonepe' },
  phonePeMerchantTransactionId: { type: String },   // the CURRENT/latest attempt's transaction id
  phonePeTransactionId:         { type: String },
  paymentAttempts:              { type: [paymentAttemptSchema], default: [] },
  // Legacy Razorpay fields — kept for old records
  razorpayOrderId:              { type: String },
  razorpayPaymentId:            { type: String },
  razorpaySignature:            { type: String },

  trackingId: { type: String },
  courier:    { type: String },

  // Reference to the Shipment record created for this order (null = no shipment yet)
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', default: null },

  // Delivery OTP (for Out-For-Delivery confirmation) ─────────
  deliveryOTP: {
    hash:        { type: String,  default: null },   // bcrypt hash — never store plain OTP
    expiry:      { type: Date,    default: null },
    verified:    { type: Boolean, default: false },
    verifiedAt:  { type: Date,    default: null },
    verifiedBy:  { type: String,  default: null },   // admin name / delivery exec name
    attempts:    { type: Number,  default: 0 },
    generatedAt: { type: Date,    default: null },
    sentAt:      { type: Date,    default: null },
  },

  // Coupon applied at checkout (optional — null when no coupon used)
  couponCode:     { type: String, default: null },
  couponId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
  couponDiscount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

// Additive, non-unique indexes (cannot fail on existing data). Payment verification / webhooks / retry look
// an order up by transaction id — across the current id AND every attempt — and the stale-order sweep scans
// pending orders by age. Without these each lookup is a full collection scan. Built by Mongoose autoIndex.
orderSchema.index({ phonePeMerchantTransactionId: 1 });
orderSchema.index({ 'paymentAttempts.merchantTransactionId': 1 });
orderSchema.index({ status: 1, createdAt: 1 });

orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    const count = await this.constructor.countDocuments();
    this.orderNumber = `ZOM${Date.now().toString().slice(-6)}${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
