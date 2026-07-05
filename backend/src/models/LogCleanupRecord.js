const mongoose = require('mongoose');

const logCleanupRecordSchema = new mongoose.Schema({
  logType:         { type: String, required: true },   // e.g. 'notification', 'audit'
  logLabel:        { type: String, required: true },   // human label
  recordsDeleted:  { type: Number, required: true, default: 0 },
  cleanupRule:     { type: String, required: true },   // 'last_7d' | 'last_30d' | 'older_90d' | 'older_180d' | 'older_1y' | 'custom'
  dateRangeFrom:   { type: Date, default: null },
  dateRangeTo:     { type: Date, default: null },
  exportedBefore:  { type: Boolean, default: false },
  exportFormat:    { type: String, default: null },    // 'csv' | 'json' | null
  performedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedByName: { type: String, default: '' },
  ipAddress:       { type: String, default: '' },
  note:            { type: String, default: '' },
}, { timestamps: true });

logCleanupRecordSchema.index({ logType: 1, createdAt: -1 });
logCleanupRecordSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model('LogCleanupRecord', logCleanupRecordSchema);
