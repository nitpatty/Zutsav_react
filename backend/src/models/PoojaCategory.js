const mongoose = require('mongoose');

const poojaCategorySchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, index: true },
  slug:        { type: String, required: true, lowercase: true, index: true },
  description: { type: String },
  image:       { type: String },
  icon:        { type: String, default: '🕉️' },
  isActive:    { type: Boolean, default: true },
  sortOrder:   { type: Number, default: 0 },

  // Soft delete — uniqueness of name/slug is enforced at the application
  // layer (see findDuplicateCategoryName in pooja.controller.js) rather than
  // a DB-level unique index, since a hard unique index can't express
  // "unique among non-deleted docs" without a partial-filter index.
  isDeleted:   { type: Boolean, default: false, index: true },
  deletedAt:   { type: Date, default: null },

  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('PoojaCategory', poojaCategorySchema);
