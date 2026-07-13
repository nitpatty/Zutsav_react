const mongoose = require('mongoose');

// Append-only history of System Configuration Center changes. This is
// purely an audit/version trail — the live values always live in
// SystemSettings; this model never becomes a second source of truth.
// Only ever stores the manifest-covered (non-secret) fields — see
// src/config/configManifest.js.
const changedFieldSchema = new mongoose.Schema({
  field:    { type: String, required: true },
  oldValue: { type: String, default: '' },
  newValue: { type: String, default: '' },
}, { _id: false });

const configVersionSchema = new mongoose.Schema({
  section:       { type: String, required: true },
  snapshot:      { type: Object, required: true },
  changedFields: { type: [changedFieldSchema], default: [] },
  updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String, default: '' },
  ipAddress:     { type: String, default: '' },
  action:        { type: String, enum: ['update', 'restore'], default: 'update' },
  note:          { type: String, default: '' },
}, { timestamps: true });

configVersionSchema.index({ section: 1, createdAt: -1 });

module.exports = mongoose.model('ConfigVersion', configVersionSchema);
