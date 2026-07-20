const mongoose = require('mongoose');

const templeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  address:     { type: String, required: true },
  city:        { type: String, required: true },
  state:       { type: String, required: true },
  pincode:     { type: String },
  description: { type: String },
  category:      { type: String, default: '' },
  primaryDeity:  { type: String, default: '' },
  openingHours:  { type: String, default: '' },
  coverImage:  { type: String, default: '' },        // banner image, distinct from the `images` gallery
  images:      [{ type: String }],
  latitude:    { type: Number },
  longitude:   { type: Number },
  isActive:    { type: Boolean, default: true },
  isFeatured:  { type: Boolean, default: false },
  homepageRank:{ type: Number, default: null },      // curated "Featured Temples" order; null = not curated
  // Admin-facing state; isActive (public gate) is kept in sync with this by the controller.
  status:      { type: String, enum: ['draft', 'published', 'hidden', 'archived'], default: 'published' },
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date, default: null },

  // Bumped only when a translatable field actually changes (see updateTemple) —
  // cached translations compare against this to detect staleness.
  translationVersion: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('Temple', templeSchema);
