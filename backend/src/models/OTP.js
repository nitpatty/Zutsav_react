const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  identifier: { type: String, required: true },  // email or phone
  channel:    { type: String, enum: ['email', 'whatsapp'], required: true },
  otp:        { type: String, required: true },
  purpose:    { type: String, default: 'registration' },
  verified:   { type: Boolean, default: false },
  attempts:   { type: Number, default: 0 },
  // Resend tracking — only used by purposes that enforce a resend cap/cooldown
  // (password_reset today); other purposes leave these at their defaults.
  resendCount: { type: Number, default: 0 },
  lastSentAt:  { type: Date, default: Date.now },
  createdAt:  { type: Date, default: Date.now, expires: 600 }, // TTL 10 minutes
});

otpSchema.index({ identifier: 1, purpose: 1 });

module.exports = mongoose.model('OTP', otpSchema);
