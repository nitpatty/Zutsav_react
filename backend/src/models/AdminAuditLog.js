const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
  action:          { type: String, required: true },           // e.g. 'delete_pandit'
  performedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: '' },               // 'admin' | 'system_admin' at time of action
  targetId:        { type: mongoose.Schema.Types.ObjectId },   // ID of deleted/modified entity
  targetType:      { type: String, default: '' },              // 'pandit', 'user', etc.
  targetName:      { type: String, default: '' },
  targetEmail:     { type: String, default: '' },
  targetPhone:     { type: String, default: '' },
  note:            { type: String, default: '' },              // optional reason

  // ── Centralized audit fields (auditService.js) ────────────────────────
  module:          { type: String, default: '' },               // 'marketplace' | 'booking' | 'auth' | 'admin_management' | ...
  ipAddress:       { type: String, default: '' },
  userAgent:       { type: String, default: '' },
  browser:         { type: String, default: '' },
  os:              { type: String, default: '' },
  requestId:       { type: String, default: '' },
  sessionId:       { type: String, default: '' },               // AdminSession sid, '' for non-admin-tier/pre-migration tokens
  oldValues:       { type: mongoose.Schema.Types.Mixed, default: null },
  newValues:       { type: mongoose.Schema.Types.Mixed, default: null },
  severity:        { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  status:          { type: String, enum: ['success', 'failure'], default: 'success' },
}, { timestamps: true });

// ── Indexes sized for 100k-millions of records ────────────────────────
adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ performedBy: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetId: 1, createdAt: -1 });
adminAuditLogSchema.index({ module: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });
adminAuditLogSchema.index({ sessionId: 1 });

// ── Immutability enforcement ────────────────────────────────────────────
// Audit records must never be altered or removed by application code.
// The one legitimate bulk-deletion path (retention cleanup) bypasses
// Mongoose entirely via the raw collection — see logManagement.controller.js.
adminAuditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function (next) {
  next(new Error('AdminAuditLog records are immutable and cannot be modified'));
});
adminAuditLogSchema.pre(['deleteOne', 'findOneAndDelete', 'deleteMany'], function (next) {
  next(new Error('AdminAuditLog records cannot be deleted directly — use the retention cleanup workflow'));
});

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
