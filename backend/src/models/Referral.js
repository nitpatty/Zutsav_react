const mongoose = require('mongoose');
const crypto   = require('crypto');

const statusHistorySchema = new mongoose.Schema({
  status: { type: String },
  note:   { type: String, default: '' },
  at:     { type: Date, default: Date.now },
}, { _id: false });

const referralSchema = new mongoose.Schema({
  // Secure token — used in public URL, never exposes DB id
  token: { type: String, unique: true, index: true },

  // Referring pandit
  panditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit', required: true, index: true },

  // Target user details (entered by pandit at creation)
  userMobile: { type: String, required: true },
  userEmail:  { type: String, default: '' },

  // Optional pre-fill
  poojaId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Pooja', default: null },
  preferredDate: { type: Date, default: null },

  // State machine
  // CREATED → SENT → OPENED → BOOKED → PENDING_REMARK → REMARK_SUBMITTED → ADMIN_REVIEW → ASSIGNED → COMPLETED → SETTLED
  status: {
    type: String,
    enum: ['CREATED', 'SENT', 'OPENED', 'BOOKED', 'PENDING_REMARK', 'REMARK_SUBMITTED', 'ADMIN_REVIEW', 'ASSIGNED', 'COMPLETED', 'SETTLED'],
    default: 'CREATED',
  },

  expiresAt: { type: Date, required: true },

  // Linked after payment success
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

  // Mandatory remark from referring pandit (required after BOOKED)
  remark:            { type: String, default: '' },
  remarkSubmittedAt: { type: Date,   default: null },

  statusHistory: [statusHistorySchema],
}, { timestamps: true });

// Auto-generate a cryptographically secure token before first save
referralSchema.pre('save', function (next) {
  if (!this.token) {
    this.token = crypto.randomBytes(32).toString('hex');
  }
  next();
});

module.exports = mongoose.model('Referral', referralSchema);
