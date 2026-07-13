const mongoose = require('mongoose');

const poojaRequestSchema = new mongoose.Schema({
  requestId: { type: String, unique: true },

  panditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit', required: true, index: true },

  poojaName:   { type: String, required: true, trim: true },
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'PoojaCategory', required: true },
  description: { type: String, default: '' },
  shortDesc:   { type: String, default: '' },

  estimatedDuration:     { type: Number, required: true, min: 1, max: 30 },
  estimatedDurationUnit: { type: String, enum: ['hours', 'days'], required: true },

  // Pandit's proposed price — never a string, always a validated positive Number.
  expectedPrice: { type: Number, required: true, min: 0.01 },

  requirements: [{ type: String }],
  benefits:     [{ type: String }],
  languages:    [{ type: String }],
  image:        { type: String, default: null },

  status: {
    type: String,
    // 'changes_requested' is reserved for a future-ready state per spec —
    // no workflow is built for it yet, only the enum slot exists.
    enum: ['pending', 'approved', 'rejected', 'changes_requested'],
    default: 'pending',
    index: true,
  },

  adminApprovedPrice: { type: Number, min: 0.01, default: null },
  rejectionReason:    { type: String, default: '' },
  adminNote:           { type: String, default: '' },

  reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String, default: '' },
  reviewedAt:     { type: Date, default: null },

  // Set on approval; unique+sparse guarantees a request can never spawn
  // more than one live catalogue Pooja even under concurrent/duplicate calls.
  poojaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pooja', default: null },
}, { timestamps: true });

poojaRequestSchema.index({ status: 1, createdAt: -1 });
poojaRequestSchema.index({ panditId: 1, createdAt: -1 });
poojaRequestSchema.index({ poojaId: 1 }, { unique: true, sparse: true });

poojaRequestSchema.pre('save', async function (next) {
  if (!this.requestId) {
    const count = await this.constructor.countDocuments();
    this.requestId = `PPR${Date.now().toString().slice(-6)}${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('PoojaRequest', poojaRequestSchema);
