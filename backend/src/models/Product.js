const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  variantId: { type: String },
  quantity:  { type: String, required: true },  // e.g. "5g", "50g", "1kg"
  sku:       { type: String, default: null },
  price:     { type: Number, required: true, min: 0 },
  salePrice: { type: Number, default: null },
  stock:     { type: Number, default: 0, min: 0 },
  isActive:  { type: Boolean, default: true },
}, { _id: false });

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  sku:         { type: String, unique: true, sparse: true },
  category:    { type: String, required: true },
  description: { type: String },
  price:       { type: Number, default: 0, min: 0 },
  salePrice:   { type: Number, default: null },
  stock:       { type: Number, default: 0 },
  variants:    { type: [variantSchema], default: [] },
  images:      [{ type: String }],
  isActive:       { type: Boolean, default: true },
  isFeatured:     { type: Boolean, default: false },
  tags:           [{ type: String }],
  taxRate:        { type: Number, default: 0, min: 0, max: 100 }, // GST % e.g. 5, 12, 18
  visibilityType: { type: String, enum: ['marketplace', 'kit_only', 'both'], default: 'marketplace' },
  isDeleted:      { type: Boolean, default: false },
  deletedAt:      { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
