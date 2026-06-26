const mongoose = require('mongoose');

const blogBookmarkSchema = new mongoose.Schema({
  blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

blogBookmarkSchema.index({ blogId: 1, userId: 1 }, { unique: true });
blogBookmarkSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('BlogBookmark', blogBookmarkSchema);
