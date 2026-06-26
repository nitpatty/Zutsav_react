const mongoose = require('mongoose');

const productCategorySchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  slug:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  description:  { type: String, default: '' },
  icon:         { type: String, default: '🛍️' },   // emoji icon
  image:        { type: String, default: null },    // uploaded image path
  featured:     { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  isActive:     { type: Boolean, default: true },
  seoTitle:     { type: String, default: '' },
  seoDescription: { type: String, default: '' },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

productCategorySchema.index({ displayOrder: 1, name: 1 });

module.exports = mongoose.model('ProductCategory', productCategorySchema);
