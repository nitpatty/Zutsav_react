const Blog         = require('../models/Blog');
const BlogCategory = require('../models/BlogCategory');
const BlogComment  = require('../models/BlogComment');
const BlogLike     = require('../models/BlogLike');
const BlogBookmark = require('../models/BlogBookmark');
const User         = require('../models/User');
const path         = require('path');

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeHTML(html = '') {
  // Strip script tags and dangerous event handlers (basic XSS protection)
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

async function enrichWithUserInteractions(blogs, userId) {
  if (!userId || !blogs.length) return blogs;
  const ids = blogs.map((b) => b._id);
  const [likes, bookmarks] = await Promise.all([
    BlogLike.find({ blogId: { $in: ids }, userId }).select('blogId').lean(),
    BlogBookmark.find({ blogId: { $in: ids }, userId }).select('blogId').lean(),
  ]);
  const likedSet      = new Set(likes.map((l) => String(l.blogId)));
  const bookmarkedSet = new Set(bookmarks.map((b) => String(b.blogId)));
  return blogs.map((b) => ({
    ...b,
    isLiked:      likedSet.has(String(b._id)),
    isBookmarked: bookmarkedSet.has(String(b._id)),
  }));
}

// ─── Public: Blog Listing ────────────────────────────────────────────────────

// GET /api/blogs
exports.getBlogs = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 12,
      category, tag, search,
      featured, trending, editorsPick, hero,
      author,
    } = req.query;

    const query = { status: 'published' };
    if (category)   query.category   = category;
    if (tag)        query.tags        = tag;
    if (author)     query.authorId    = author;
    if (featured === 'true')    query.isFeatured    = true;
    if (trending === 'true')    query.isTrending    = true;
    if (editorsPick === 'true') query.isEditorsPick = true;
    if (hero === 'true')        query.isHomepageHero = true;
    if (search) {
      query.$or = [
        { title:   new RegExp(search, 'i') },
        { excerpt: new RegExp(search, 'i') },
        { tags:    new RegExp(search, 'i') },
      ];
    }

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('category', 'name slug icon color')
        .select('-content')
        .sort({ publishedAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit)
        .lean(),
      Blog.countDocuments(query),
    ]);

    const userId = req.user?._id;
    const enriched = await enrichWithUserInteractions(blogs, userId);

    res.json({ success: true, blogs: enriched, total, page: +page, pages: Math.ceil(total / +limit) });
  } catch (err) { next(err); }
};

// GET /api/blogs/categories
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await BlogCategory.find({ isActive: true }).sort({ order: 1, name: 1 }).lean();
    res.json({ success: true, categories });
  } catch (err) { next(err); }
};

// GET /api/blogs/tags/popular
exports.getPopularTags = async (req, res, next) => {
  try {
    const result = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 30 },
    ]);
    res.json({ success: true, tags: result.map((r) => ({ tag: r._id, count: r.count })) });
  } catch (err) { next(err); }
};

// GET /api/blogs/:slug
exports.getBlogBySlug = async (req, res, next) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug, status: 'published' })
      .populate('category', 'name slug icon color')
      .lean();
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // Increment view count (fire-and-forget)
    Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } }).catch(() => {});

    let isLiked = false, isBookmarked = false;
    if (req.user?._id) {
      const [like, bookmark] = await Promise.all([
        BlogLike.exists({ blogId: blog._id, userId: req.user._id }),
        BlogBookmark.exists({ blogId: blog._id, userId: req.user._id }),
      ]);
      isLiked = !!like;
      isBookmarked = !!bookmark;
    }

    // Related blogs (same category, exclude current)
    const relatedQuery = { status: 'published', _id: { $ne: blog._id } };
    if (blog.category) relatedQuery.category = blog.category._id || blog.category;
    const related = await Blog.find(relatedQuery)
      .populate('category', 'name slug icon color')
      .select('-content')
      .sort({ publishedAt: -1 })
      .limit(4)
      .lean();

    res.json({ success: true, blog: { ...blog, isLiked, isBookmarked }, related });
  } catch (err) { next(err); }
};

// ─── Authenticated: Write Blogs ──────────────────────────────────────────────

// POST /api/blogs — requires blogPermission middleware
exports.createBlog = async (req, res, next) => {
  try {
    const {
      title, content, excerpt, category, tags,
      seoTitle, seoDescription, ogImage, canonicalUrl,
      featuredImage, scheduledAt,
    } = req.body;

    const user     = req.user;
    const settings = req.blogSettings || {};

    // Determine initial status based on role and approval settings
    let status = 'draft';
    if (req.body.action === 'publish' || req.body.action === 'submit') {
      if (user.role === 'admin' && settings.blogAdminRequireApproval !== true) {
        status = 'published';
      } else if (user.role === 'pandit' && settings.blogPanditRequireApproval !== false) {
        status = 'pending_review';
      } else if (user.role === 'user' && settings.blogUserRequireApproval !== false) {
        status = 'pending_review';
      } else {
        status = 'published';
      }
    }
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      status = 'scheduled';
    }

    const blog = await Blog.create({
      title,
      content:  sanitizeHTML(content || ''),
      excerpt:  excerpt || '',
      category: category || null,
      tags:     Array.isArray(tags) ? tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
      seoTitle, seoDescription, ogImage, canonicalUrl,
      featuredImage: featuredImage || '',
      scheduledAt:   scheduledAt ? new Date(scheduledAt) : null,
      authorId:       user._id,
      authorRole:     user.role,
      authorName:     user.name,
      authorAvatar:   user.profilePhoto || '',
      authorVerified: user.role === 'admin' || user.role === 'pandit',
      status,
      publishedAt:    status === 'published' ? new Date() : null,
      publishedBy:    status === 'published' ? user._id : null,
    });

    res.status(201).json({ success: true, blog, message: status === 'published' ? 'Blog published!' : status === 'pending_review' ? 'Blog submitted for review.' : 'Draft saved.' });
  } catch (err) { next(err); }
};

// PUT /api/blogs/:id
exports.updateBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    // Ownership check
    if (String(blog.authorId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this blog' });
    }

    const {
      title, content, excerpt, category, tags,
      seoTitle, seoDescription, ogImage, canonicalUrl, featuredImage,
    } = req.body;

    const updates = {
      title, excerpt, category, seoTitle, seoDescription, ogImage, canonicalUrl, featuredImage,
      content:  sanitizeHTML(content || blog.content),
      tags:     Array.isArray(req.body.tags) ? req.body.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : blog.tags,
    };

    // Re-submit for review if editing a rejected blog
    if (req.body.action === 'submit' && blog.status === 'rejected') {
      updates.status         = 'pending_review';
      updates.rejectionReason = '';
    }
    if (req.body.action === 'publish' && req.user.role === 'admin') {
      updates.status      = 'published';
      updates.publishedAt = blog.publishedAt || new Date();
    }

    Object.assign(blog, updates);
    await blog.save();

    res.json({ success: true, blog });
  } catch (err) { next(err); }
};

// DELETE /api/blogs/:id
exports.deleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    if (String(blog.authorId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await Promise.all([
      Blog.deleteOne({ _id: blog._id }),
      BlogComment.deleteMany({ blogId: blog._id }),
      BlogLike.deleteMany({ blogId: blog._id }),
      BlogBookmark.deleteMany({ blogId: blog._id }),
    ]);

    res.json({ success: true, message: 'Blog deleted' });
  } catch (err) { next(err); }
};

// GET /api/blogs/my
exports.getMyBlogs = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { authorId: req.user._id };
    if (status) query.status = status;

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('category', 'name slug icon color')
        .sort({ createdAt: -1 })
        .limit(+limit)
        .skip((+page - 1) * +limit)
        .lean(),
      Blog.countDocuments(query),
    ]);

    res.json({ success: true, blogs, total });
  } catch (err) { next(err); }
};

// ─── Likes / Bookmarks ───────────────────────────────────────────────────────

// POST /api/blogs/:id/like
exports.toggleLike = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog || blog.status !== 'published') return res.status(404).json({ success: false, message: 'Blog not found' });

    const existing = await BlogLike.findOne({ blogId: blog._id, userId: req.user._id });
    if (existing) {
      await BlogLike.deleteOne({ _id: existing._id });
      await Blog.findByIdAndUpdate(blog._id, { $inc: { likesCount: -1 } });
      return res.json({ success: true, liked: false, likesCount: Math.max(0, blog.likesCount - 1) });
    }

    await BlogLike.create({ blogId: blog._id, userId: req.user._id });
    await Blog.findByIdAndUpdate(blog._id, { $inc: { likesCount: 1 } });
    res.json({ success: true, liked: true, likesCount: blog.likesCount + 1 });
  } catch (err) { next(err); }
};

// POST /api/blogs/:id/bookmark
exports.toggleBookmark = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog || blog.status !== 'published') return res.status(404).json({ success: false, message: 'Blog not found' });

    const existing = await BlogBookmark.findOne({ blogId: blog._id, userId: req.user._id });
    if (existing) {
      await BlogBookmark.deleteOne({ _id: existing._id });
      await Blog.findByIdAndUpdate(blog._id, { $inc: { bookmarksCount: -1 } });
      return res.json({ success: true, bookmarked: false });
    }

    await BlogBookmark.create({ blogId: blog._id, userId: req.user._id });
    await Blog.findByIdAndUpdate(blog._id, { $inc: { bookmarksCount: 1 } });
    res.json({ success: true, bookmarked: true });
  } catch (err) { next(err); }
};

// GET /api/blogs/my-bookmarks
exports.getMyBookmarks = async (req, res, next) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const bookmarks = await BlogBookmark.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(+limit)
      .skip((+page - 1) * +limit)
      .populate({
        path: 'blogId',
        populate: { path: 'category', select: 'name slug icon color' },
        select: '-content',
      })
      .lean();

    const blogs = bookmarks.map((bm) => ({ ...bm.blogId, isBookmarked: true })).filter(Boolean);
    res.json({ success: true, blogs });
  } catch (err) { next(err); }
};

// ─── Comments ────────────────────────────────────────────────────────────────

// GET /api/blogs/:id/comments
exports.getComments = async (req, res, next) => {
  try {
    const comments = await BlogComment.find({ blogId: req.params.id, parentId: null, isApproved: true })
      .sort({ createdAt: -1 })
      .lean();

    const ids = comments.map((c) => c._id);
    const replies = await BlogComment.find({ parentId: { $in: ids }, isApproved: true })
      .sort({ createdAt: 1 })
      .lean();

    const replyMap = {};
    replies.forEach((r) => {
      const key = String(r.parentId);
      if (!replyMap[key]) replyMap[key] = [];
      replyMap[key].push(r);
    });

    const enriched = comments.map((c) => ({ ...c, replies: replyMap[String(c._id)] || [] }));
    res.json({ success: true, comments: enriched });
  } catch (err) { next(err); }
};

// POST /api/blogs/:id/comments
exports.addComment = async (req, res, next) => {
  try {
    const blog = await Blog.findOne({ _id: req.params.id, status: 'published' });
    if (!blog) return res.status(404).json({ success: false, message: 'Blog not found' });

    const { content, parentId } = req.body;
    if (!content || content.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Comment is too short' });
    }

    const comment = await BlogComment.create({
      blogId:       blog._id,
      authorId:     req.user._id,
      authorName:   req.user.name,
      authorRole:   req.user.role,
      authorAvatar: req.user.profilePhoto || '',
      content:      content.trim().substring(0, 1000),
      parentId:     parentId || null,
    });

    await Blog.findByIdAndUpdate(blog._id, { $inc: { commentsCount: 1 } });

    res.status(201).json({ success: true, comment });
  } catch (err) { next(err); }
};

// DELETE /api/blogs/:id/comments/:commentId
exports.deleteComment = async (req, res, next) => {
  try {
    const comment = await BlogComment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    if (String(comment.authorId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await BlogComment.deleteOne({ _id: comment._id });
    await Blog.findByIdAndUpdate(comment.blogId, { $inc: { commentsCount: -1 } });

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) { next(err); }
};

// ─── Image Upload ────────────────────────────────────────────────────────────

// POST /api/blogs/upload-image
exports.uploadImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });
  const url = `/uploads/blogs/${req.file.filename}`;
  res.json({ success: true, url });
};

// ─── Blog Permission Check (public endpoint for UI) ──────────────────────────

// GET /api/blogs/permissions/check
exports.checkPermission = async (req, res, next) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne().lean();
    const role = req.user?.role;

    const canPublish = (
      (role === 'admin'  && settings?.blogAdminPublish  !== false) ||
      (role === 'pandit' && settings?.blogPanditPublish !== false) ||
      (role === 'user'   && settings?.blogUserPublish   !== false)
    );

    const requiresApproval =
      role === 'pandit' ? (settings?.blogPanditRequireApproval !== false) :
      role === 'user'   ? (settings?.blogUserRequireApproval   !== false) :
      false;

    res.json({ success: true, canPublish, requiresApproval });
  } catch (err) { next(err); }
};
