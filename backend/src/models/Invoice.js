const mongoose = require('mongoose');

// ── Manual-billing line-item snapshot ────────────────────────────────────────
// Persisted ONLY on source:'manual' invoices. Captured at finalization so
// later catalog price / tax-rate / name changes never alter a historical
// invoice. Booking invoices continue to derive line items from the Booking.
const invoiceLineItemSchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  variantId:    { type: String,   default: null },
  name:         { type: String,   required: true },
  variantLabel: { type: String,   default: '' },
  sku:          { type: String,   default: '' },
  hsn:          { type: String,   default: '' },   // configured later on Product; empty until then
  quantity:     { type: Number,   required: true, min: 1 },
  unitPrice:    { type: Number,   required: true, min: 0 },
  discount:     { type: Number,   default: 0, min: 0 },
  taxRate:      { type: Number,   default: 0, min: 0, max: 100 },
  taxAmount:    { type: Number,   default: 0, min: 0 },
  lineTotal:    { type: Number,   required: true, min: 0 },
}, { _id: false });

// ── Seller (company GST registration) snapshot ──────────────────────────────
// Snapshotted from Admin System Settings at finalization so later settings
// edits never rewrite historical tax documents. `isFallback` marks the
// unconfigured recommended default — the Admin must explicitly confirm it.
const sellerSnapshotSchema = new mongoose.Schema({
  registrationId:      { type: String, default: '' },
  legalName:           { type: String, default: '' },
  gstin:               { type: String, default: '' },
  pan:                 { type: String, default: '' },
  address:             { type: String, default: '' },
  state:               { type: String, default: '' },
  stateCode:           { type: String, default: '' }, // derived from GSTIN prefix
  isFallback:          { type: Boolean, default: false },
  taxIdentityConfirmed:{ type: Boolean, default: false },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────────────────────
  invoiceNumber:   { type: String, required: true, unique: true }, // INV-2026-000001 | MAN-2026-000001

  // ── Source discriminator ───────────────────────────────────────────────────
  // 'booking' = automatic PhonePe/booking invoice (all historical documents).
  // 'manual'  = Admin-created offline-sale invoice. Default preserves every
  // existing document and every existing write path untouched.
  source: { type: String, enum: ['booking', 'manual'], default: 'booking' },

  // ── Relationships ───────────────────────────────────────────────────────────
  // Required for booking invoices only (enforced in the pre-validate hook so
  // historical semantics are preserved exactly). Manual invoices have no
  // Booking and may have no User at all (walk-in → snapshot-only customer).
  bookingId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Booking',        default: null },
  paymentLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentLedger',  default: null  },
  customerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',           default: null },

  // ── Immutable booking snapshot (captured at invoice-generation time) ────────
  bookingNumber:   { type: String, default: '' },
  poojaName:       { type: String, default: '' },
  scheduledDate:   { type: Date,   default: null },
  scheduledTime:   { type: String, default: '' },

  // ── Immutable customer snapshot ─────────────────────────────────────────────
  customerName:    { type: String, default: '' },
  customerPhone:   { type: String, default: '' },
  customerEmail:   { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  customerPincode: { type: String, default: '' },
  customerState:   { type: String, default: '' },
  customerCity:    { type: String, default: '' },

  // ── Immutable line items + seller snapshot (manual invoices only) ───────────
  lineItems:  { type: [invoiceLineItemSchema], default: null },
  sellerRegistrationId: { type: String, default: '' },
  sellerSnapshot:       { type: sellerSnapshotSchema, default: null },

  // ── Invoice timestamp ───────────────────────────────────────────────────────
  invoiceDate:     { type: Date, default: Date.now },

  // ── Payment details for THIS invoice ───────────────────────────────────────
  paymentType:           { type: String, enum: ['FULL', 'PARTIAL', 'REMAINING'], required: true },
  // 'offline' = money received outside any gateway (manual invoices).
  paymentGateway:        { type: String, default: 'phonepe' },
  merchantTransactionId: { type: String, default: '' },
  gatewayTransactionId:  { type: String, default: '' },

  // ── Payment amount breakdown ────────────────────────────────────────────────
  amountPaid:       { type: Number, required: true }, // cumulative received for THIS invoice
  previouslyPaid:   { type: Number, default: 0 },     // cumulative paid BEFORE this invoice
  outstandingAfter: { type: Number, default: 0 },     // balance remaining AFTER this invoice

  // ── Full order totals (immutable booking snapshot) ──────────────────────────
  grandTotal:    { type: Number, default: 0 },
  poojaAmount:   { type: Number, default: 0 },
  kitAmount:     { type: Number, default: 0 },
  kitGST:        { type: Number, default: 0 },
  platformFee:   { type: Number, default: 0 },
  platformGST:   { type: Number, default: 0 },
  urgentSurcharge: { type: Number, default: 0 }, // urgent booking price hike line item
  totalGST:      { type: Number, default: 0 },

  // ── GST breakdown (computed at generation time, immutable) ──────────────────
  gstBreakdown: {
    cgst:         { type: Number,  default: 0 },
    sgst:         { type: Number,  default: 0 },
    igst:         { type: Number,  default: 0 },
    isInterstate: { type: Boolean, default: false },
  },

  // ── Invoice lifecycle ────────────────────────────────────────────────────────
  // Invoices are NEVER physically deleted — only soft-cancelled or archived.
  status: {
    type:    String,
    enum:    ['active', 'cancelled', 'archived'],
    default: 'active',
  },

  isLegacy:      { type: Boolean, default: false }, // true = retroactively created from old data

  // ── Manual-billing operational flags ────────────────────────────────────────
  // Stock deduction / restoration happen outside the Invoice document write;
  // these flags are flipped with an atomic conditional update so a retried
  // request can never deduct or restore twice.
  idempotencyKey: { type: String, default: null },
  stockDeducted:  { type: Boolean, default: false },
  stockRestored:  { type: Boolean, default: false },
  createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Audit trail ─────────────────────────────────────────────────────────────
  generatedBy:    { type: String, default: 'system' }, // 'system' | 'admin' | 'migration'
  ipAddress:      { type: String, default: '' },
  invoiceVersion: { type: Number, default: 1 },

  // ── Cancellation record ─────────────────────────────────────────────────────
  cancelledAt:  { type: Date,   default: null },
  cancelledBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelReason: { type: String, default: '' },
}, { timestamps: true });

// ── Source-aware requiredness (preserves historic booking semantics) ─────────
invoiceSchema.pre('validate', function (next) {
  if (this.source === 'manual') {
    if (!this.customerId && !(this.customerName || '').trim()) {
      this.invalidate('customerName', 'Manual invoices require a customerId or a customer snapshot name');
    }
    if (!Array.isArray(this.lineItems) || this.lineItems.length === 0) {
      this.invalidate('lineItems', 'Manual invoices require at least one line item');
    }
    const sg = this.sellerSnapshot;
    if (!sg || !(sg.gstin || '').trim() || !(sg.legalName || '').trim()) {
      this.invalidate('sellerSnapshot', 'Manual invoices require a seller registration snapshot');
    }
  } else {
    // booking (default) — identical to the historic required:true constraints
    if (!this.bookingId)     this.invalidate('bookingId',     'Booking invoices require bookingId');
    if (!this.bookingNumber) this.invalidate('bookingNumber', 'Booking invoices require bookingNumber');
    if (!this.customerId)    this.invalidate('customerId',    'Booking invoices require customerId');
  }
  next();
});

invoiceSchema.index({ bookingId: 1 });
invoiceSchema.index({ customerId: 1, createdAt: -1 });
invoiceSchema.index({ paymentLedgerId: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ bookingNumber: 1 });
invoiceSchema.index({ merchantTransactionId: 1 });
invoiceSchema.index({ gatewayTransactionId: 1 });
invoiceSchema.index({ source: 1, invoiceDate: -1 });
// Idempotent manual-invoice creation: only string keys are indexed, so the
// many null defaults on booking invoices never collide (partialFilterExpression).
invoiceSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
