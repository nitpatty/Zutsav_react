const mongoose = require('mongoose');

// Generic AI-translation cache. One document per (entityType, entityId, language).
// Reused across every content type registered in config/translatable.config.js —
// never model this per content type.
const translationSchema = new mongoose.Schema({
  entityType: { type: String, required: true },
  entityId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  language:   { type: String, required: true, lowercase: true, trim: true },

  status: { type: String, enum: ['pending', 'ready', 'failed'], default: 'pending' },

  translatedFields: { type: mongoose.Schema.Types.Mixed, default: {} },

  version:      { type: Number, default: 0 }, // source doc's translationVersion at time of success
  translatedBy: { type: String, default: '' }, // provider name recorded at generation time (e.g. 'sarvam', 'groq')
  translatedAt: { type: Date, default: null },
  lastUsedAt:   { type: Date, default: null },
  lockedAt:     { type: Date, default: null }, // set when status flips to 'pending', used by stale-lock sweep
  attempts:     { type: Number, default: 0 },
  lastError:    { type: String, default: '' },
}, { timestamps: true });

translationSchema.index({ entityType: 1, entityId: 1, language: 1 }, { unique: true });
translationSchema.index({ status: 1, lockedAt: 1 });

module.exports = mongoose.model('Translation', translationSchema);
