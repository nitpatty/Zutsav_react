const mongoose = require('mongoose');

/**
 * Shared mock payment outcome store — PAYMENT_MODE=mock ONLY.
 *
 * _id is the merchantTransactionId (string, not ObjectId) because transaction
 * IDs are generated as ZUT_... and also used as keys outside the DB.
 */
const mockPaymentStateSchema = new mongoose.Schema(
  {
    _id:              { type: String, required: true },
    outcome:          { type: String, enum: ['success', 'failure', 'pending'], required: true },
    outcomeExpiresAt: { type: Date,   required: true },
    expiresAt:        { type: Date,   required: true },
  },
  { timestamps: true, versionKey: false }
);

mockPaymentStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('MockPaymentState', mockPaymentStateSchema);
