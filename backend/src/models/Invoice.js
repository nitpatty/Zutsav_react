const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────────────────────
  invoiceNumber:   { type: String, required: true, unique: true }, // INV-2026-000001

  // ── Relationships ───────────────────────────────────────────────────────────
  bookingId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Booking',        required: true },
  paymentLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentLedger',  default: null  },
  customerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',           required: true },

  // ── Immutable booking snapshot (captured at invoice-generation time) ────────
  bookingNumber:   { type: String, required: true },
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

  // ── Invoice timestamp ───────────────────────────────────────────────────────
  invoiceDate:     { type: Date, default: Date.now },

  // ── Payment details for THIS invoice ───────────────────────────────────────
  paymentType:           { type: String, enum: ['FULL', 'PARTIAL', 'REMAINING'], required: true },
  paymentGateway:        { type: String, default: 'phonepe' },
  merchantTransactionId: { type: String, default: '' },
  gatewayTransactionId:  { type: String, default: '' },

  // ── Payment amount breakdown ────────────────────────────────────────────────
  amountPaid:       { type: Number, required: true }, // paid in THIS invoice
  previouslyPaid:   { type: Number, default: 0 },     // cumulative paid BEFORE this invoice
  outstandingAfter: { type: Number, default: 0 },     // balance remaining AFTER this invoice

  // ── Full order totals (immutable booking snapshot) ──────────────────────────
  grandTotal:    { type: Number, default: 0 },
  poojaAmount:   { type: Number, default: 0 },
  kitAmount:     { type: Number, default: 0 },
  kitGST:        { type: Number, default: 0 },
  platformFee:   { type: Number, default: 0 },
  platformGST:   { type: Number, default: 0 },
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

  // ── Audit trail ─────────────────────────────────────────────────────────────
  generatedBy:    { type: String, default: 'system' }, // 'system' | 'admin' | 'migration'
  ipAddress:      { type: String, default: '' },
  invoiceVersion: { type: Number, default: 1 },

  // ── Cancellation record ─────────────────────────────────────────────────────
  cancelledAt:  { type: Date,   default: null },
  cancelledBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelReason: { type: String, default: '' },
}, { timestamps: true });

invoiceSchema.index({ bookingId: 1 });
invoiceSchema.index({ customerId: 1, createdAt: -1 });
invoiceSchema.index({ paymentLedgerId: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ bookingNumber: 1 });
invoiceSchema.index({ merchantTransactionId: 1 });
invoiceSchema.index({ gatewayTransactionId: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
