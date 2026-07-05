const mongoose = require('mongoose');

const blogCategorySchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true, maxlength: 60 },
  slug:        { type: String, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '', maxlength: 200 },
  icon:        { type: String, default: '📝' },
  color:       { type: String, default: '#1B1F3B' },
  isActive:    { type: Boolean, default: true },
  order:       { type: Number, default: 0 },
}, { timestamps: true });

blogCategorySchema.pre('validate', function (next) {
  if (!this.slug) {
    this.slug = this.name.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

blogCategorySchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('BlogCategory', blogCategorySchema);
