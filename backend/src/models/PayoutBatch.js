const mongoose = require('mongoose');

const payoutBatchSchema = new mongoose.Schema({
  batchId:         { type: String, unique: true },
  panditId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit', required: true },
  bookingIds:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
  totalAmount:     { type: Number, required: true, min: 0 },
  paidDate:        { type: Date, default: Date.now },
  paidByAdminId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidByAdminName: { type: String, default: 'Admin' },
  paymentMethod:   { type: String, enum: ['bank_transfer', 'upi', 'cash', 'other'], default: 'bank_transfer' },
  note:            { type: String, default: '' },
}, { timestamps: true });

payoutBatchSchema.pre('save', async function (next) {
  if (!this.batchId) {
    const count = await this.constructor.countDocuments();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.batchId = `PB${dateStr}${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('PayoutBatch', payoutBatchSchema);
