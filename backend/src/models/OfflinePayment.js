const mongoose = require('mongoose');

/**
 * OfflinePayment — dedicated ledger for money received OUTSIDE any payment
 * gateway (Cash / UPI / Bank Transfer / Card / Other) against a manual invoice.
 *
 * NEVER reuse PaymentLedger for this: that collection is booking-bound and
 * gateway-shaped (unique merchantTransactionId + webhook lookup dependencies).
 *
 * Identity: `idempotencyKey` (unique) is the retry guard — the same client
 * retry can never record the same receipt twice. Corrections are made by
 * appending a REVERSAL record, never by editing or deleting history.
 */
const offlinePaymentSchema = new mongoose.Schema({
  invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  amount:     { type: Number, required: true, min: 0 },
  method:     {
    type:    String,
    enum:    ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER'],
    required: true,
  },
  kind:       { type: String, enum: ['RECEIPT', 'REVERSAL'], default: 'RECEIPT' },
  // For a REVERSAL record: the RECEIPT it compensates.
  reversesPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfflinePayment', default: null },
  // Optional operator-supplied reference (UPI ref no., cheque no., bank ref).
  reference:  { type: String, default: '' },
  note:       { type: String, default: '' },
  receivedAt: { type: Date,   default: Date.now },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordedByName: { type: String, default: '' },
  idempotencyKey: { type: String, required: true, unique: true },
  status:     { type: String, enum: ['active', 'reversed'], default: 'active' },
}, { timestamps: true });

offlinePaymentSchema.index({ invoiceId: 1, createdAt: -1 });

// ── Immutability enforcement (mirrors AdminAuditLog) ────────────────────────
// Offline payment history must never be altered or removed by application
// code. The retention-cleanup path (if ever added) must bypass Mongoose via
// the raw collection, exactly like AdminAuditLog's cleanup does.
offlinePaymentSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function (next) {
  next(new Error('OfflinePayment records are immutable — append a REVERSAL record instead of editing'));
});
offlinePaymentSchema.pre(['deleteOne', 'findOneAndDelete', 'deleteMany'], function (next) {
  next(new Error('OfflinePayment records cannot be deleted — append a REVERSAL record instead'));
});

module.exports = mongoose.model('OfflinePayment', offlinePaymentSchema);
