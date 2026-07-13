const mongoose = require('mongoose');

// Append-only history of NotificationMapping changes. Purely an audit/version
// trail — the live mapping always lives in NotificationMapping; this model
// never becomes a second source of truth. Mirrors the ConfigVersion pattern
// used by the System Configuration Center.
const changedFieldSchema = new mongoose.Schema({
  field:    { type: String, required: true },
  oldValue: { type: String, default: '' },
  newValue: { type: String, default: '' },
}, { _id: false });

const notificationMappingVersionSchema = new mongoose.Schema({
  mappingId:     { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationMapping', required: true },
  eventName:     { type: String, required: true },
  snapshot:      { type: Object, required: true },
  changedFields: { type: [changedFieldSchema], default: [] },
  updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String, default: '' },
  ipAddress:     { type: String, default: '' },
  action:        { type: String, enum: ['create', 'update', 'toggle', 'delete', 'restore'], default: 'update' },
  note:          { type: String, default: '' },
}, { timestamps: true });

notificationMappingVersionSchema.index({ mappingId: 1, createdAt: -1 });
notificationMappingVersionSchema.index({ eventName: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationMappingVersion', notificationMappingVersionSchema);
