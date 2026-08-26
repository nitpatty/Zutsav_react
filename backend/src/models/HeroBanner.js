const mongoose = require('mongoose');

const heroBannerSchema = new mongoose.Schema({
  image:     { type: String, required: true },
  altText:   { type: String, default: '' },
  linkUrl:   { type: String, default: '' },
  isActive:  { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  translationVersion: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model('HeroBanner', heroBannerSchema);
