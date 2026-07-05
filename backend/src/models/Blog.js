const mongoose = require('mongoose');

function calcReadingTime(html = '') {
  const words = html.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function autoSlug(title) {
  return title.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

const blogSchema = new mongoose.Schema({
  title:   { type: String, required: true, trim: true, maxlength: 200 },
  slug:    { type: String, unique: true, lowercase: true, trim: true },
  content: { type: String, required: true },
  excerpt: { type: String, maxlength: 500, default: '' },

  featuredImage: { type: String, default: '' },

  // Denormalized author info for read performance
  authorId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole:     { type: String, enum: ['admin', 'pandit', 'user'], required: true },
  authorName:     { type: String, required: true },
  authorAvatar:   { type: String, default: '' },
  authorVerified: { type: Boolean, default: false },

  category: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory', default: null },
  tags:     { type: [String], default: [] },

  // SEO
  seoTitle:       { type: String, maxlength: 100, default: '' },
  seoDescription: { type: String, maxlength: 300, default: '' },
  ogImage:        { type: String, default: '' },
  canonicalUrl:   { type: String, default: '' },
  readingTime:    { type: Number, default: 1 },

  // Status workflow
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'published', 'rejected', 'archived', 'scheduled'],
    default: 'draft',
  },
  scheduledAt:     { type: Date, default: null },
  publishedAt:     { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  // Admin curation
  isFeatured:     { type: Boolean, default: false },
  isTrending:     { type: Boolean, default: false },
  isEditorsPick:  { type: Boolean, default: false },
  isHomepageHero: { type: Boolean, default: false },

  // Analytics counters
  views:          { type: Number, default: 0 },
  shares:         { type: Number, default: 0 },
  likesCount:     { type: Number, default: 0 },
  commentsCount:  { type: Number, default: 0 },
  bookmarksCount: { type: Number, default: 0 },

  // Review trail
  publishedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt:   { type: Date, default: null },
  reviewerName: { type: String, default: '' },
}, { timestamps: true });

// Pre-validate: slug, excerpt, readingTime, SEO defaults
blogSchema.pre('validate', async function (next) {
  if (!this.slug) {
    let base = autoSlug(this.title);
    let slug = base;
    let n = 0;
    while (await this.constructor.exists({ slug, _id: { $ne: this._id } })) {
      slug = `${base}-${++n}`;
    }
    this.slug = slug;
  }

  if (!this.excerpt && this.content) {
    const text = this.content.replace(/<[^>]*>/g, '').trim();
    this.excerpt = text.substring(0, 250) + (text.length > 250 ? '...' : '');
  }

  this.readingTime = calcReadingTime(this.content);

  if (!this.seoTitle)       this.seoTitle       = this.title.substring(0, 100);
  if (!this.seoDescription) this.seoDescription = this.excerpt.substring(0, 300);
  if (!this.ogImage)        this.ogImage        = this.featuredImage;

  next();
});

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ authorId: 1 });
blogSchema.index({ category: 1, status: 1 });
blogSchema.index({ tags: 1 });
blogSchema.index({ isFeatured: 1, status: 1 });
blogSchema.index({ isHomepageHero: 1, status: 1 });

module.exports = mongoose.model('Blog', blogSchema);
