const mongoose = require('mongoose');

const loginHistorySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event:     { type: String, enum: ['login_success', 'login_failed', 'logout', 'force_logout'], required: true },
  reason:    { type: String, default: '' },       // e.g. 'invalid_password' | 'account_suspended' | 'session_revoked'
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  browser:   { type: String, default: '' },
  os:        { type: String, default: '' },
  sessionId: { type: String, default: '' },       // AdminSession sid — set for login_success/logout only
}, { timestamps: true });

loginHistorySchema.index({ userId: 1, createdAt: -1 });
loginHistorySchema.index({ event: 1, createdAt: -1 });
loginHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('LoginHistory', loginHistorySchema);
