const mongoose = require('mongoose');

const kitItemSchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId:    { type: String, default: null },
  variantLabel: { type: String, default: null },
  quantity:     { type: Number, required: true, min: 1 },
}, { _id: false });

const kitSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  slug:          { type: String, required: true, unique: true, lowercase: true },
  description:   { type: String },
  image:         { type: String },
  items:         { type: [kitItemSchema], validate: [(v) => v.length > 0, 'Kit must have at least one item'] },
  totalCost:     { type: Number, default: 0 },         // auto-calculated sum of product prices × qty
  discountType:  { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  discountValue: { type: Number, default: 0, min: 0 },
  discountPrice: { type: Number, required: true, min: 0 }, // final selling price
  isActive:      { type: Boolean, default: true },
  taxRate:       { type: Number, default: 0, min: 0, max: 100 }, // GST % on the kit
  isFeatured:    { type: Boolean, default: false },
  // Poojas this kit is recommended for (admin-managed mapping)
  linkedPoojas:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Pooja' }],
}, { timestamps: true, toJSON: { virtuals: true } });

module.exports = mongoose.model('Kit', kitSchema);
