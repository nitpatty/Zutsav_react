import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Heart, Bookmark, Share2, MessageCircle, Clock, Eye,
  ChevronLeft, Send, Trash2, MoreHorizontal, Flag, Link2,
  Twitter, Facebook,
} from 'lucide-react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import ZutsavLoader from '../components/shared/ZutsavLoader';
import { getImageUrl as imgUrl } from '../config';
import { isAdminRole } from '../utils/roleUtils';
import { useTranslatedBlog } from '../hooks/useTranslatedBlog';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatNumber(n) {
  if (!n && n !== 0) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// Uses the shared i18n instance directly (t() outside React) — same
// convention as BlogHomePage.jsx's relativeTime().
function relativeTime(dateStr) {
  if (!dateStr) return '';
  const t = i18n.t.bind(i18n);
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('blog.justNow', 'just now');
  if (mins < 60) return t('blog.minsAgo', '{{n}}m ago', { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('blog.hoursAgo', '{{n}}h ago', { n: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 30) return t('blog.daysAgo', '{{n}}d ago', { n: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t('blog.monthsAgo', '{{n}}mo ago', { n: months });
  return t('blog.yearsAgo', '{{n}}y ago', { n: Math.floor(months / 12) });
}

// ─── Reading progress hook ─────────────────────────────────────────────────────

function useReadingProgress(articleRef) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const el = articleRef.current;
      if (!el) return;
      const { top, height } = el.getBoundingClientRect();
      const windowH = window.innerHeight;
      const scrolled = Math.max(0, -top);
      const total = height - windowH;
      if (total <= 0) { setProgress(100); return; }
      setProgress(Math.min(100, Math.round((scrolled / total) * 100)));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [articleRef]);

  return progress;
}

// ─── Share sheet ───────────────────────────────────────────────────────────────

function ShareSheet({ title, onClose }) {
  const { t } = useTranslation();
  const url = window.location.href;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      toast.success(t('blogDetail.linkCopied', 'Link copied!'));
      onClose();
    });
  }

  function shareTwitter() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
      '_blank'
    );
    onClose();
  }

  function shareFacebook() {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      '_blank'
    );
    onClose();
  }

  return (
    <div className="absolute right-0 top-12 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-64 font-sans">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{t('blogDetail.shareThisArticle', 'Share this article')}</p>
      <div className="space-y-1">
        <button
          onClick={copy}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors"
        >
          <Link2 size={15} className="text-gray-400" /> {t('blogDetail.copyLink', 'Copy link')}
        </button>
        <button
          onClick={shareTwitter}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sky-50 text-sm text-gray-700 transition-colors"
        >
          <Twitter size={15} className="text-sky-500" /> {t('blogDetail.shareOnTwitter', 'Share on Twitter')}
        </button>
        <button
          onClick={shareFacebook}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-sm text-gray-700 transition-colors"
        >
          <Facebook size={15} className="text-blue-600" /> {t('blogDetail.shareOnFacebook', 'Share on Facebook')}
        </button>
      </div>
    </div>
  );
}

// ─── Comment component ─────────────────────────────────────────────────────────

function Comment({
  comment, blogId, currentUser, onDelete, onReply,
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const authorInitial = (comment.authorName || 'A').charAt(0).toUpperCase();
  const avatarUrl = imgUrl(comment.authorAvatar);
  const isOwn = currentUser && currentUser._id === comment.authorId;

  useEffect(() => {
    function onClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-400 to-indigo-600">
        {avatarUrl
          ? <img src={avatarUrl} alt={authorInitial} className="w-full h-full object-cover" />
          : <span className="text-white text-sm font-bold font-sans">{authorInitial}</span>
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div>
              <span className="text-sm font-bold text-gray-800 font-sans">{comment.authorName || t('blog.anonymous', 'Anonymous')}</span>
              {comment.authorRole && (
                <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-sans">
                  {comment.authorRole}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-gray-400 font-sans">{relativeTime(comment.createdAt)}</span>
              {(isOwn || isAdminRole(currentUser?.role)) && (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(v => !v)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-40 font-sans">
                      {isOwn && (
                        <button
                          onClick={() => { onDelete(comment._id); setMenuOpen(false); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={13} /> {t('blogDetail.delete', 'Delete')}
                        </button>
                      )}
                      {!isOwn && (
                        <button
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          <Flag size={13} /> {t('blogDetail.report', 'Report')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed font-sans">{comment.content}</p>
        </div>

        <button
          onClick={() => onReply(comment)}
          className="mt-1.5 ml-2 text-xs font-semibold text-indigo-500 hover:text-indigo-700 font-sans transition-colors"
        >
          {t('blogDetail.reply', 'Reply')}
        </button>

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100">
            {comment.replies.map(reply => (
              <div key={reply._id} className="flex gap-3">
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600">
                  {imgUrl(reply.authorAvatar)
                    ? <img src={imgUrl(reply.authorAvatar)} alt="" className="w-full h-full object-cover" />
                    : <span className="text-white text-xs font-bold font-sans">{(reply.authorName || 'A').charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="bg-amber-50/60 rounded-2xl rounded-tl-sm px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-800 font-sans">{reply.authorName || t('blog.anonymous', 'Anonymous')}</span>
                      <span className="text-[10px] text-gray-400 font-sans">{relativeTime(reply.createdAt)}</span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed font-sans">{reply.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Related article card ──────────────────────────────────────────────────────

const CARD_GRADIENTS = [
  'from-amber-100 to-orange-50',
  'from-rose-100 to-pink-50',
  'from-violet-100 to-purple-50',
  'from-emerald-100 to-teal-50',
];

function RelatedCard({ blog, index }) {
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const coverUrl = imgUrl(blog.featuredImage);
  return (
    <Link
      to={`/blog/${blog.slug}`}
      className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300 flex flex-col"
    >
      <div className={`h-40 overflow-hidden bg-gradient-to-br ${gradient}`}>
        {coverUrl
          ? <img src={coverUrl} alt={blog.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        }
      </div>
      <div className="p-4 flex flex-col flex-1">
        {blog.category && (
          <span className="text-[10px] font-bold uppercase tracking-widest mb-2 font-sans" style={{ color: '#D4AF37' }}>
            {blog.category.name}
          </span>
        )}
        <h4
          className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors mb-2"
          style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1rem' }}
        >
          {blog.title}
        </h4>
        <div className="mt-auto flex items-center gap-2 text-[11px] text-gray-400 font-sans pt-2 border-t border-gray-50">
          {blog.readingTime && <span className="flex items-center gap-1"><Clock size={10} />{blog.readingTime}m</span>}
          <span className="flex items-center gap-1"><Eye size={10} />{formatNumber(blog.views)}</span>
          <span className="ml-auto">{relativeTime(blog.publishedAt || blog.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlogDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  // Global app-language preference (Settings → Preferences → App Language) —
  // no per-page language state/switcher here; see LanguageContext.jsx.
  const { lang } = useLanguage();

  // Article state
  const [blog, setBlog] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Like / bookmark
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // Share
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef(null);

  // Comments
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { _id, authorName }
  const [submittingComment, setSubmittingComment] = useState(false);

  // Reading progress
  const articleRef = useRef(null);
  const progress = useReadingProgress(articleRef);

  // Close share on outside click
  useEffect(() => {
    function onClick(e) {
      if (shareRef.current && !shareRef.current.contains(e.target)) setShareOpen(false);
    }
    if (shareOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [shareOpen]);

  // ── Fetch blog ─────────────────────────────────────────────────────────────
  // Backend caches/generates the translation for non-English `lang` values
  // (see translationService.js); react-query gives us the session-level
  // cache so re-selecting a previously-viewed language is instant. Thanks to
  // `placeholderData: keepPreviousData` in the hook, `isLoading` is only true
  // on the very first load — a language switch that needs a fresh Groq
  // translation keeps the current article on screen and only flips
  // `isFetching`, so the page never blanks out while translating.
  const { data: blogData, isLoading: blogLoading, isFetching: blogFetching, error: blogQueryError } = useTranslatedBlog(slug, lang);

  useEffect(() => {
    setLoading(blogLoading);
  }, [blogLoading]);

  useEffect(() => {
    if (!blogQueryError) return;
    setError(blogQueryError.response?.status === 404 ? 'not_found' : 'server_error');
  }, [blogQueryError]);

  useEffect(() => {
    if (!blogData) return;
    setError(null);
    setBlog(blogData.blog);
    setRelated(blogData.related || []);
    setLiked(blogData.blog.isLiked || false);
    setLikesCount(blogData.blog.likesCount || 0);
    setBookmarked(blogData.blog.isBookmarked || false);
    // Update document meta
    if (blogData.blog.seoTitle) document.title = blogData.blog.seoTitle;
    else if (blogData.blog.title) document.title = `${blogData.blog.title} | Zutsav Blog`;
  }, [blogData]);

  // ── Fetch comments ─────────────────────────────────────────────────────────
  const fetchComments = useCallback(async (blogId) => {
    if (!blogId) return;
    setCommentsLoading(true);
    try {
      const { data } = await API.get(`/blogs/${blogId}/comments`);
      setComments(data.comments || []);
    } catch {
      // Non-critical — don't toast
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (blog?._id) fetchComments(blog._id);
  }, [blog?._id, fetchComments]);

  // ── Like ──────────────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!isAuthenticated) { toast.error(t('blog.signInToLike', 'Sign in to like posts')); return; }
    if (likeLoading) return;
    setLikeLoading(true);
    // Optimistic
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(v => !v);
    setLikesCount(v => liked ? v - 1 : v + 1);
    try {
      const { data } = await API.post(`/blogs/${blog._id}/like`);
      setLiked(data.liked);
      setLikesCount(data.likesCount);
    } catch {
      setLiked(prevLiked);
      setLikesCount(prevCount);
      toast.error(t('blogDetail.couldNotUpdateLike', 'Could not update like'));
    } finally {
      setLikeLoading(false);
    }
  }, [isAuthenticated, likeLoading, liked, likesCount, blog?._id, t]);

  // ── Bookmark ──────────────────────────────────────────────────────────────
  const handleBookmark = useCallback(async () => {
    if (!isAuthenticated) { toast.error(t('blogDetail.signInToBookmark', 'Sign in to bookmark posts')); return; }
    if (bookmarkLoading) return;
    setBookmarkLoading(true);
    const prev = bookmarked;
    setBookmarked(v => !v);
    try {
      const { data } = await API.post(`/blogs/${blog._id}/bookmark`);
      setBookmarked(data.bookmarked);
      toast.success(data.bookmarked ? t('blogDetail.savedToBookmarks', 'Saved to bookmarks') : t('blogDetail.removedFromBookmarks', 'Removed from bookmarks'), { icon: data.bookmarked ? '🔖' : '✓' });
    } catch {
      setBookmarked(prev);
      toast.error(t('blogDetail.couldNotUpdateBookmark', 'Could not update bookmark'));
    } finally {
      setBookmarkLoading(false);
    }
  }, [isAuthenticated, bookmarkLoading, bookmarked, blog?._id, t]);

  // ── Submit comment ────────────────────────────────────────────────────────
  const handleSubmitComment = useCallback(async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!isAuthenticated) { toast.error(t('blogDetail.signInToComment', 'Sign in to comment')); return; }
    setSubmittingComment(true);
    try {
      const payload = { content: commentText.trim() };
      if (replyingTo) payload.parentId = replyingTo._id;
      const { data } = await API.post(`/blogs/${blog._id}/comments`, payload);
      if (replyingTo) {
        // Attach reply to parent
        setComments(prev =>
          prev.map(c =>
            c._id === replyingTo._id
              ? { ...c, replies: [...(c.replies || []), data.comment] }
              : c
          )
        );
      } else {
        setComments(prev => [data.comment, ...prev]);
      }
      setCommentText('');
      setReplyingTo(null);
      toast.success(t('blogDetail.commentPosted', 'Comment posted'));
    } catch {
      toast.error(t('blogDetail.couldNotPostComment', 'Could not post comment'));
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, isAuthenticated, replyingTo, blog?._id, t]);

  // ── Withdraw a pending submission back to draft (author only) ─────────────
  const [withdrawing, setWithdrawing] = useState(false);
  const handleWithdraw = useCallback(async () => {
    if (withdrawing || !blog) return;
    if (!window.confirm(t('blogDetail.withdrawConfirm', 'Withdraw this submission? It will return to draft so you can keep editing.'))) return;
    setWithdrawing(true);
    try {
      await API.put(`/blogs/${blog._id}`, { action: 'withdraw' });
      toast.success(t('blogDetail.withdrawSuccess', 'Submission withdrawn — you can edit it again.'));
      navigate(`/blog/edit/${blog._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || t('blogDetail.couldNotWithdraw', 'Could not withdraw submission'));
    } finally {
      setWithdrawing(false);
    }
  }, [blog, withdrawing, navigate, t]);

  // ── Delete comment ────────────────────────────────────────────────────────
  const handleDeleteComment = useCallback(async (commentId) => {
    if (!window.confirm(t('blogDetail.deleteCommentConfirm', 'Delete this comment?'))) return;
    try {
      await API.delete(`/blogs/${blog._id}/comments/${commentId}`);
      setComments(prev => prev.filter(c => c._id !== commentId));
      toast.success(t('blogDetail.commentDeleted', 'Comment deleted'));
    } catch {
      toast.error(t('blogDetail.couldNotDeleteComment', 'Could not delete comment'));
    }
  }, [blog?._id, t]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const authorInitial = useMemo(() =>
    (blog?.authorName || 'A').charAt(0).toUpperCase()
  , [blog?.authorName]);

  const authorAvatarUrl = useMemo(() => imgUrl(blog?.authorAvatar), [blog?.authorAvatar]);
  const featuredImageUrl = useMemo(() => imgUrl(blog?.featuredImage), [blog?.featuredImage]);

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return <ZutsavLoader fullscreen message={t('blogDetail.loadingArticle', 'Loading article...')} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ERROR
  // ─────────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 font-sans" style={{ backgroundColor: '#FAF8F5' }}>
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: 'linear-gradient(135deg, #F5F0FF, #EDE8FF)' }}
        >
          <span className="text-4xl">{error === 'not_found' ? '🕯️' : '⚠️'}</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: '"Cormorant Garamond"' }}>
          {error === 'not_found' ? t('blogDetail.storyNotFound', 'Story not found') : t('blogDetail.somethingWentWrong', 'Something went wrong')}
        </h2>
        <p className="text-gray-500 text-sm mb-6 max-w-xs">
          {error === 'not_found'
            ? t('blogDetail.articleMoved', 'This article may have been moved or removed.')
            : t('blogDetail.couldNotLoadArticle', 'We could not load this article. Please try again.')}
        </p>
        <button
          onClick={() => navigate('/blog')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: '#1B1F3B' }}
        >
          <ChevronLeft size={15} /> {t('blogDetail.backToBlog', 'Back to Blog')}
        </button>
      </div>
    );
  }

  if (!blog) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: '#FAF8F5' }}>

      {/* ══ Reading progress bar ══ */}
      <div
        className="fixed top-0 left-0 h-0.5 z-[100] transition-all duration-150"
        style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #D4AF37, #FF6B00)' }}
      />

      {/* ══ Page header ══ */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 font-sans overflow-hidden">
            <Link to="/blog" className="hover:text-indigo-600 transition-colors shrink-0">{t('nav.blog', 'Blog')}</Link>
            {blog.category && (
              <>
                <span>/</span>
                <Link
                  to={`/blog?category=${blog.category.slug || blog.category._id}`}
                  className="hover:text-indigo-600 transition-colors shrink-0"
                >
                  {blog.category.name}
                </Link>
              </>
            )}
            <span>/</span>
            <span className="text-gray-600 truncate">{blog.title}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 lg:py-12">
        <div className="flex gap-8 items-start">

          {/* ══ Article column ══ */}
          <article className="flex-1 min-w-0" ref={articleRef}>

            {/* Review-status banner — only ever rendered when the backend has
                already decided this viewer is allowed to see a non-published
                post (its author or an admin); everyone else gets a 404 for
                any non-published slug, so reaching this branch at all implies
                that authorization. */}
            {blog.status !== 'published' && (() => {
              const isOwnPost  = isAuthenticated && user && String(blog.authorId) === String(user._id);
              const isReviewer = isAuthenticated && !isOwnPost && isAdminRole(user?.role);
              const META = {
                pending_review: { icon: '🟡', label: 'Pending Review', bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
                rejected:       { icon: '🔴', label: 'Rejected',        bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
                draft:          { icon: '⚪', label: 'Draft',            bg: '#F9FAFB', border: '#E5E7EB', text: '#374151' },
                archived:       { icon: '⚫', label: 'Archived',         bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
                scheduled:      { icon: '🔵', label: 'Scheduled',        bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
              };
              const m = META[blog.status] || META.draft;

              // Admin (or any non-author reviewer) previewing this post: the
              // author-facing copy below ("Your blog has been submitted...",
              // Withdraw/Edit actions) never applies to them — moderation
              // itself happens from the admin Blog Management table, so this
              // is just a neutral status tag plus a way back there.
              if (isReviewer) {
                return (
                  <div className="mb-6 flex items-center justify-between gap-3 flex-wrap rounded-2xl border p-4" style={{ background: m.bg, borderColor: m.border }}>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'white', color: m.text }}>
                      {m.icon} {m.label} · Admin Preview
                    </span>
                    <Link
                      to="/admin?tab=blog-management"
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      Back to Blog Management →
                    </Link>
                  </div>
                );
              }

              return (
                <div className="mb-6 rounded-2xl border p-5" style={{ background: m.bg, borderColor: m.border }}>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full mb-3" style={{ background: 'white', color: m.text }}>
                    {m.icon} {m.label}
                  </span>
                  <p className="text-sm leading-relaxed" style={{ color: m.text }}>
                    {blog.status === 'pending_review' &&
                      'Your blog has been submitted successfully. It is currently under review by the Zutsav editorial team. You can view your article while it is under review, but editing is disabled until you withdraw it or receive feedback.'}
                    {blog.status === 'rejected' && (
                      blog.rejectionReason
                        ? <>This blog wasn't approved: <span className="font-semibold">"{blog.rejectionReason}"</span>. You can edit and resubmit it for review.</>
                        : "This blog wasn't approved. You can edit and resubmit it for review."
                    )}
                    {blog.status === 'draft' && 'This is a draft — only visible to you. Continue writing or submit it for review when ready.'}
                    {blog.status === 'archived' && 'This post is archived and not publicly visible.'}
                    {blog.status === 'scheduled' && 'This post is scheduled to publish automatically at its scheduled time.'}
                  </p>
                  {isOwnPost && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {['draft', 'rejected'].includes(blog.status) && (
                        <Link
                          to={`/blog/edit/${blog._id}`}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90"
                          style={{ background: '#1B1F3B' }}
                        >
                          Edit
                        </Link>
                      )}
                      {blog.status === 'pending_review' && (
                        <button
                          onClick={handleWithdraw}
                          disabled={withdrawing}
                          className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {withdrawing ? 'Withdrawing...' : 'Withdraw Submission'}
                        </button>
                      )}
                      <Link
                        to="/my-blogs"
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Back to My Blogs
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Category badge */}
            {blog.category && (
              <Link
                to={`/blog?category=${blog.category.slug || blog.category._id}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-5 transition-opacity hover:opacity-80"
                style={{ background: blog.category.color || '#D4AF37', color: '#fff' }}
              >
                {blog.category.icon && <span>{blog.category.icon}</span>}
                {blog.category.name}
              </Link>
            )}

            {/* Language is a global preference (Settings → Preferences → App
                Language) — no per-page switcher here. A subtle inline hint
                while a not-yet-cached translation generates in the background
                (the article itself stays visible throughout, never blanks). */}
            {blogFetching && !loading && (
              <div className="mb-4 text-[11px] text-gray-400 italic">Translating…</div>
            )}

            {/* Title */}
            <h1
              className="font-bold text-gray-900 leading-tight mb-5"
              style={{
                fontFamily: '"Cormorant Garamond"',
                fontSize: 'clamp(1.8rem, 4vw, 2.75rem)',
                letterSpacing: '-0.02em',
                maxWidth: '600px',
              }}
            >
              {blog.title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 mb-7 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-400 to-indigo-600">
                  {authorAvatarUrl
                    ? <img src={authorAvatarUrl} alt={authorInitial} className="w-full h-full object-cover" />
                    : <span className="text-white font-bold">{authorInitial}</span>
                  }
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-800">{blog.authorName || 'Anonymous'}</span>
                    {blog.authorVerified && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600">✓ Verified</span>
                    )}
                  </div>
                  {blog.authorRole && (
                    <span className="text-[11px] text-indigo-500">{blog.authorRole}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                <span>{formatDate(blog.publishedAt)}</span>
                {blog.readingTime && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {blog.readingTime} min read
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Eye size={11} /> {formatNumber(blog.views)} views
                </span>
              </div>
            </div>

            {/* Featured image */}
            {featuredImageUrl && (
              <div className="mb-8 rounded-2xl overflow-hidden shadow-md">
                <img
                  src={featuredImageUrl}
                  alt={blog.title}
                  className="w-full object-cover"
                  style={{ maxHeight: 480 }}
                />
              </div>
            )}

            {/* Article body */}
            <div
              className="rte-content blog-content mb-10"
              style={{
                maxWidth: '680px',
                lineHeight: '1.85',
                fontSize: '1.0625rem',
                color: '#374151',
              }}
              dangerouslySetInnerHTML={{ __html: blog.content }}
            />

            {/* Tags */}
            {blog.tags && blog.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8 pb-8 border-b border-gray-100">
                {blog.tags.map(tag => (
                  <Link
                    key={tag}
                    to={`/blog?tag=${tag}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 bg-gray-50 hover:bg-indigo-50 transition-all font-sans"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Author card */}
            <div
              className="rounded-2xl p-6 mb-10 flex gap-5 items-start"
              style={{ background: 'linear-gradient(135deg, #F8F7FF, #F0EDFF)', border: '1px solid #E5E0FF' }}
            >
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-400 to-indigo-700 shadow-md">
                {authorAvatarUrl
                  ? <img src={authorAvatarUrl} alt={authorInitial} className="w-full h-full object-cover" />
                  : <span className="text-white text-2xl font-bold">{authorInitial}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className="font-bold text-gray-900 text-lg"
                    style={{ fontFamily: '"Cormorant Garamond"' }}
                  >
                    {blog.authorName || 'Anonymous'}
                  </span>
                  {blog.authorVerified && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">✓ Verified</span>
                  )}
                  {blog.authorRole && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{blog.authorRole}</span>
                  )}
                </div>
                <Link
                  to={`/blog?author=${blog.authorId}`}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors mt-1 inline-block font-sans"
                >
                  More from this author →
                </Link>
              </div>
            </div>

            {/* Mobile engagement bar */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-2xl">
              <div className="flex items-center justify-around h-14 px-4">
                <button
                  onClick={handleLike}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <Heart
                    size={20}
                    className={`transition-colors ${liked ? 'text-rose-500' : 'text-gray-400'}`}
                    style={liked ? { fill: '#F43F5E' } : {}}
                  />
                  <span className="text-[10px] font-semibold text-gray-500 font-sans">{formatNumber(likesCount)}</span>
                </button>
                <button
                  onClick={handleBookmark}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <Bookmark
                    size={20}
                    className={`transition-colors ${bookmarked ? 'text-amber-500' : 'text-gray-400'}`}
                    style={bookmarked ? { fill: '#F59E0B' } : {}}
                  />
                  <span className="text-[10px] font-semibold text-gray-500 font-sans">{t('blogDetail.save', 'Save')}</span>
                </button>
                <div className="relative" ref={shareRef}>
                  <button
                    onClick={() => setShareOpen(v => !v)}
                    className="flex flex-col items-center gap-0.5 min-w-[44px]"
                  >
                    <Share2 size={20} className="text-gray-400" />
                    <span className="text-[10px] font-semibold text-gray-500 font-sans">{t('blogDetail.share', 'Share')}</span>
                  </button>
                  {shareOpen && (
                    <div className="bottom-14">
                      <ShareSheet title={blog.title} onClose={() => setShareOpen(false)} />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex flex-col items-center gap-0.5 min-w-[44px]"
                >
                  <MessageCircle size={20} className="text-gray-400" />
                  <span className="text-[10px] font-semibold text-gray-500 font-sans">{formatNumber(blog.commentsCount)}</span>
                </button>
              </div>
            </div>

            {/* ── Comments section ── */}
            <section id="comments-section" className="mb-20 lg:mb-10">
              <h2
                className="font-bold text-gray-900 mb-6"
                style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.6rem' }}
              >
                {comments.length > 0 ? t('blogDetail.commentCount', '{{count}} Comment(s)', { count: comments.length }) : t('blogDetail.comments', 'Comments')}
              </h2>

              {/* Comment input */}
              {isAuthenticated ? (
                <form onSubmit={handleSubmitComment} className="mb-8">
                  {replyingTo && (
                    <div className="flex items-center gap-2 mb-2 text-xs font-sans text-indigo-600">
                      <span>{t('blogDetail.replyingTo', 'Replying to')} <strong>{replyingTo.authorName}</strong></span>
                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="text-gray-400 hover:text-gray-600 transition-colors underline"
                      >
                        {t('blogDetail.cancel', 'Cancel')}
                      </button>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-400 to-indigo-600">
                      {user?.avatar
                        ? <img src={imgUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
                        : <span className="text-white text-sm font-bold font-sans">{(user?.name || 'U').charAt(0).toUpperCase()}</span>
                      }
                    </div>
                    <div className="flex-1 relative">
                      <textarea
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        placeholder={replyingTo ? t('blogDetail.replyToPlaceholder', 'Reply to {{name}}...', { name: replyingTo.authorName }) : t('blogDetail.shareThoughts', 'Share your thoughts...')}
                        rows={3}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-none text-sm text-gray-700 bg-white transition-all font-sans"
                      />
                      <button
                        type="submit"
                        disabled={!commentText.trim() || submittingComment}
                        className="absolute bottom-3 right-3 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
                        style={{ background: commentText.trim() ? '#1B1F3B' : '#E5E7EB' }}
                      >
                        <Send size={13} className={commentText.trim() ? 'text-white' : 'text-gray-400'} />
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div
                  className="mb-8 rounded-2xl p-5 text-center border border-indigo-100"
                  style={{ background: 'linear-gradient(135deg, #F8F7FF, #F0EDFF)' }}
                >
                  <p className="text-sm text-gray-700 font-sans mb-3">
                    <Link to="/login" className="font-bold text-indigo-700 hover:text-indigo-900 transition-colors">{t('home.signIn', 'Sign in')}</Link>
                    {' '}{t('blogDetail.toJoinConversation', 'to join the conversation')}
                  </p>
                </div>
              )}

              {/* Comments list */}
              {commentsLoading ? (
                <div className="space-y-5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-9 h-9 bg-gray-200 rounded-full shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-1/4" />
                        <div className="h-14 bg-gray-100 rounded-2xl" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm font-sans">{t('blogDetail.noCommentsYet', 'No comments yet. Be the first to share your thoughts!')}</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {comments.map(comment => (
                    <Comment
                      key={comment._id}
                      comment={comment}
                      blogId={blog._id}
                      currentUser={user}
                      onDelete={handleDeleteComment}
                      onReply={(c) => {
                        setReplyingTo(c);
                        document.getElementById('comment-input')?.focus();
                      }}
                    />
                  ))}
                </div>
              )}
            </section>

          </article>

          {/* ══ Sticky floating action bar (desktop only) ══ */}
          <aside className="hidden lg:flex flex-col items-center gap-4 sticky top-24 shrink-0">

            {/* Progress ring */}
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
                <circle cx="22" cy="22" r="18" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                <circle
                  cx="22" cy="22" r="18"
                  fill="none"
                  stroke="#D4AF37"
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
              <span
                className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600 font-sans"
              >
                {progress}%
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-200" />

            {/* Like */}
            <button
              onClick={handleLike}
              className="group w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 border border-gray-100 bg-white hover:shadow-md transition-all"
              title={liked ? 'Unlike' : 'Like'}
            >
              <Heart
                size={18}
                className={`transition-colors ${liked ? 'text-rose-500' : 'text-gray-400 group-hover:text-rose-400'}`}
                style={liked ? { fill: '#F43F5E' } : {}}
              />
              <span className="text-[9px] font-semibold text-gray-500 font-sans">{formatNumber(likesCount)}</span>
            </button>

            {/* Bookmark */}
            <button
              onClick={handleBookmark}
              className="group w-12 h-12 rounded-2xl flex flex-col items-center justify-center border border-gray-100 bg-white hover:shadow-md transition-all"
              title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            >
              <Bookmark
                size={18}
                className={`transition-colors ${bookmarked ? 'text-amber-500' : 'text-gray-400 group-hover:text-amber-400'}`}
                style={bookmarked ? { fill: '#F59E0B' } : {}}
              />
            </button>

            {/* Share */}
            <div className="relative" ref={shareRef}>
              <button
                onClick={() => setShareOpen(v => !v)}
                className="group w-12 h-12 rounded-2xl flex items-center justify-center border border-gray-100 bg-white hover:shadow-md transition-all"
                title="Share"
              >
                <Share2 size={18} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </button>
              {shareOpen && (
                <ShareSheet title={blog.title} onClose={() => setShareOpen(false)} />
              )}
            </div>

            {/* Comments jump */}
            <button
              onClick={() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' })}
              className="group w-12 h-12 rounded-2xl flex flex-col items-center justify-center gap-0.5 border border-gray-100 bg-white hover:shadow-md transition-all"
              title="Comments"
            >
              <MessageCircle size={18} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
              <span className="text-[9px] font-semibold text-gray-500 font-sans">{formatNumber(blog.commentsCount)}</span>
            </button>
          </aside>
        </div>

        {/* ══ Related articles ══ */}
        {related.length > 0 && (
          <section className="mt-10 pt-8 border-t border-gray-200">
            <h2
              className="font-bold text-gray-900 mb-6"
              style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.6rem' }}
            >
              Related Stories
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.slice(0, 4).map((r, i) => (
                <RelatedCard key={r._id} blog={r} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
