const mongoose = require('mongoose');

const blogLikeSchema = new mongoose.Schema({
  blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

blogLikeSchema.index({ blogId: 1, userId: 1 }, { unique: true });
blogLikeSchema.index({ userId: 1 });

module.exports = mongoose.model('BlogLike', blogLikeSchema);
