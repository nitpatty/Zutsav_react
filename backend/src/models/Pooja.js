const mongoose = require('mongoose');

const poojaSchema = new mongoose.Schema({
  // Legacy single-category (kept for backward compat; prefer categoryIds)
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'PoojaCategory' },
  // Multi-category support
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PoojaCategory' }],
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String },
  shortDesc:   { type: String },
  price:        { type: Number, required: true, min: 0 },
  mrp:          { type: Number, min: 0 },            // original/crossed-out price (display only)
  salePrice:    { type: Number, min: 0 },            // effective booking price (overrides price if set)
  taxEnabled:   { type: Boolean, default: false },   // apply GST on pooja price
  taxRate:      { type: Number, min: 0, max: 100, default: 0 }, // GST % (e.g. 18)
  durationValue:{ type: Number, min: 1, max: 30 },
  durationUnit: { type: String, enum: ['hours', 'days'] },
  duration:     { type: String },           // legacy free-text, kept for backward compat
  image:        { type: String },
  gallery:     [{ type: String }],
  requirements:[{ type: String }],          // samagri list
  benefits:    [{ type: String }],
  languages:   [{ type: String }],
  isActive:    { type: Boolean, default: true },
  isFeatured:  { type: Boolean, default: false },
  rating:      { type: Number, default: 0 },
  totalBookings:{ type: Number, default: 0 },

  // Pandit-created pooja support
  createdByRole:  { type: String, enum: ['admin', 'pandit'], default: 'admin' },
  panditId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Pandit', default: null },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'inactive'],
    default: 'approved', // existing admin poojas remain visible
  },
  adminNote:  { type: String },
  isDeleted:  { type: Boolean, default: false },
  deletedAt:  { type: Date, default: null },
}, { timestamps: true });

// Keep categoryId in sync with first element of categoryIds for legacy callers
poojaSchema.pre('save', function (next) {
  if (this.categoryIds?.length > 0 && !this.categoryId) {
    this.categoryId = this.categoryIds[0];
  } else if (this.categoryId && (!this.categoryIds || this.categoryIds.length === 0)) {
    this.categoryIds = [this.categoryId];
  }
  next();
});

module.exports = mongoose.model('Pooja', poojaSchema);
