const mongoose = require('mongoose');

const paymentLedgerSchema = new mongoose.Schema({
  bookingId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  amount:                { type: Number, required: true },
  paymentType:           { type: String, enum: ['FULL', 'PARTIAL', 'REMAINING'], required: true },
  paymentStatus:         { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
  merchantTransactionId: { type: String, required: true, unique: true },
  phonePeTransactionId:  { type: String, default: null },
  note:                  { type: String, default: '' },
  paidAt:                { type: Date, default: null },
  invoiceId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
}, { timestamps: true });

paymentLedgerSchema.index({ bookingId: 1 });

module.exports = mongoose.model('PaymentLedger', paymentLedgerSchema);
