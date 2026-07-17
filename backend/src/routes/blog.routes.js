const router          = require('express').Router();
const ctrl            = require('../controllers/blog.controller');
const { protect, optionalAuth } = require('../middleware/auth');
const blogPermission  = require('../middleware/blogPermission');
const { uploadBlog }  = require('../middleware/upload');

// ── Public routes (no auth required) ─────────────────────────────────────────
// NOTE: /:slug matches exactly ONE path segment, so it never shadows
// two-segment routes like /permissions/check or /me/blogs registered below.
router.get('/',              ctrl.getBlogs);
router.get('/categories',    ctrl.getCategories);
router.get('/tags/popular',  ctrl.getPopularTags);
// optionalAuth (not protect): anonymous readers must still see published
// posts; getBlogBySlug itself decides whether a non-published blog is
// visible to the (optional) req.user as the author/admin.
router.get('/:slug',         optionalAuth, ctrl.getBlogBySlug);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(protect);

router.get('/permissions/check', ctrl.checkPermission);
router.get('/me/blogs',          ctrl.getMyBlogs);
router.get('/me/bookmarks',      ctrl.getMyBookmarks);
// By-id fetch for the editor's "load for edit" flow (owner/admin only) —
// distinct from GET /:slug, which is the public/author-aware read-by-slug
// endpoint used for the rendered article page.
router.get('/id/:id',            ctrl.getBlogForEdit);

// Write — requires blog permission toggle to be ON for this role
router.post('/',             blogPermission, ctrl.createBlog);
router.put('/:id',           ctrl.updateBlog);
router.delete('/:id',        ctrl.deleteBlog);

// Engagement
router.post('/:id/like',     ctrl.toggleLike);
router.post('/:id/bookmark', ctrl.toggleBookmark);
router.post('/:id/share',    ctrl.shareBlog);

// Comments
router.get('/:id/comments',               ctrl.getComments);
router.post('/:id/comments',              ctrl.addComment);
router.delete('/:id/comments/:commentId', ctrl.deleteComment);

// Image upload (for editor)
router.post('/upload-image', uploadBlog.single('image'), ctrl.uploadImage);

module.exports = router;
