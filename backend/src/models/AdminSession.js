const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema({
  sid:           { type: String, required: true, unique: true },   // jti embedded in the JWT
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive:      { type: Boolean, default: true },
  ipAddress:     { type: String, default: '' },
  userAgent:     { type: String, default: '' },
  browser:       { type: String, default: '' },
  os:            { type: String, default: '' },
  issuedAt:      { type: Date, default: Date.now },
  expiresAt:     { type: Date, required: true },        // mirrors the JWT exp claim
  lastSeenAt:    { type: Date, default: Date.now },       // bumped opportunistically by protect()
  revokedAt:     { type: Date, default: null },
  revokedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedReason: { type: String, default: '' },          // 'force_logout' | 'suspended' | 'logout' | 'password_reset' | 'admin_deleted'
}, { timestamps: true });

adminSessionSchema.index({ userId: 1, isActive: 1 });
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-cleanup
adminSessionSchema.index({ isActive: 1, lastSeenAt: 1 });              // "online admins" query

module.exports = mongoose.model('AdminSession', adminSessionSchema);
