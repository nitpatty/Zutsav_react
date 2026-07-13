const mongoose = require('mongoose');

const blogCommentSchema = new mongoose.Schema({
  blogId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Blog',    required: true },
  authorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  authorName:   { type: String, required: true },
  authorRole:   { type: String, enum: ['admin', 'pandit', 'user'], required: true },
  authorAvatar: { type: String, default: '' },
  content:      { type: String, required: true, trim: true, maxlength: 1000 },
  parentId:     { type: mongoose.Schema.Types.ObjectId, ref: 'BlogComment', default: null },
  isApproved:   { type: Boolean, default: true },
}, { timestamps: true });

blogCommentSchema.index({ blogId: 1, createdAt: -1 });
blogCommentSchema.index({ parentId: 1 });
blogCommentSchema.index({ authorId: 1 });

module.exports = mongoose.model('BlogComment', blogCommentSchema);
