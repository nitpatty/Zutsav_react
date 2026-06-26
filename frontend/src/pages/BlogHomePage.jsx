import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Search, Heart, Eye, Clock, TrendingUp, Tag, Bookmark,
  ChevronLeft, ChevronRight, PenSquare, Sparkles, ArrowRight,
  BookOpen, Users, Star, X, RefreshCw,
} from 'lucide-react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMG_BASE = 'http://localhost:5000/';

function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return IMG_BASE + path;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatNumber(n) {
  if (!n && n !== 0) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// Gradient fallbacks keyed by index
const CARD_GRADIENTS = [
  'from-amber-100 to-orange-50',
  'from-rose-100 to-pink-50',
  'from-violet-100 to-purple-50',
  'from-emerald-100 to-teal-50',
  'from-sky-100 to-blue-50',
  'from-yellow-100 to-amber-50',
  'from-indigo-100 to-blue-50',
  'from-fuchsia-100 to-rose-50',
];

const CATEGORY_COLORS = [
  '#D4AF37', '#FF6B00', '#1B1F3B', '#6366F1',
  '#10B981', '#F59E0B', '#EC4899', '#3B82F6',
];

// ─── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
      <div className="h-48 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-3 bg-gray-200 rounded w-1/4" />
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="flex items-center gap-3 pt-2">
          <div className="w-8 h-8 bg-gray-200 rounded-full" />
          <div className="h-3 bg-gray-200 rounded w-24" />
          <div className="h-3 bg-gray-200 rounded w-16 ml-auto" />
        </div>
      </div>
    </div>
  );
}

// ─── Blog card ─────────────────────────────────────────────────────────────────

function BlogCard({ blog, index, onLike }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const coverUrl = imgUrl(blog.featuredImage);
  const authorInitial = (blog.authorName || blog.author?.name || 'A').charAt(0).toUpperCase();
  const authorAvatar = imgUrl(blog.authorAvatar || blog.author?.avatar);
  const catColor = blog.category?.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length];

  function handleLikeClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error('Sign in to like posts');
      return;
    }
    onLike(blog._id);
  }

  return (
    <Link
      to={`/blog/${blog.slug}`}
      className="group bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300 flex flex-col"
    >
      {/* Cover image */}
      <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${gradient}`}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={blog.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <BookOpen size={36} className="opacity-30 text-gray-500" />
          </div>
        )}
        {/* Category badge */}
        {blog.category && (
          <span
            className="absolute top-3 left-3 text-white text-[11px] font-bold px-2.5 py-1 rounded-full font-sans tracking-wide"
            style={{ backgroundColor: catColor }}
          >
            {blog.category.icon ? `${blog.category.icon} ` : ''}{blog.category.name}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <h3
          className="font-bold text-gray-900 text-base leading-snug mb-2 line-clamp-2 group-hover:text-indigo-800 transition-colors"
          style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.1rem', letterSpacing: '-0.01em' }}
        >
          {blog.title}
        </h3>

        {blog.excerpt && (
          <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 mb-4 font-sans flex-1">
            {blog.excerpt}
          </p>
        )}

        {/* Author row */}
        <div className="flex items-center gap-2.5 mt-auto pt-3 border-t border-gray-50">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-400 to-indigo-600">
            {authorAvatar ? (
              <img src={authorAvatar} alt={authorInitial} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold font-sans">{authorInitial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gray-700 font-sans truncate block">
              {blog.authorName || blog.author?.name || 'Anonymous'}
            </span>
            {blog.authorRole && (
              <span className="text-[10px] text-indigo-500 font-sans truncate block">{blog.authorRole}</span>
            )}
          </div>

          <div className="flex items-center gap-3 text-gray-400 shrink-0">
            {blog.readingTime && (
              <span className="flex items-center gap-1 text-[11px] font-sans">
                <Clock size={11} />{blog.readingTime}m
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-sans">
              <Eye size={11} />{formatNumber(blog.views)}
            </span>
            <button
              onClick={handleLikeClick}
              className={`flex items-center gap-1 text-[11px] font-sans transition-colors ${
                blog.isLiked ? 'text-rose-500' : 'text-gray-400 hover:text-rose-400'
              }`}
            >
              <Heart size={11} className={blog.isLiked ? 'fill-rose-500' : ''} />
              {formatNumber(blog.likes)}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 font-sans mt-2">{relativeTime(blog.publishedAt || blog.createdAt)}</p>
      </div>
    </Link>
  );
}

// ─── Trending sidebar item ─────────────────────────────────────────────────────

function TrendingItem({ blog, rank }) {
  return (
    <Link to={`/blog/${blog.slug}`} className="group flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <span
        className="text-3xl font-bold leading-none shrink-0 mt-0.5"
        style={{ fontFamily: '"Cormorant Garamond"', color: '#D4AF37', opacity: 0.5 + rank * 0.1 }}
      >
        0{rank}
      </span>
      <div className="min-w-0">
        <h4
          className="text-sm font-semibold text-gray-800 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-snug mb-1"
          style={{ fontFamily: '"Cormorant Garamond"' }}
        >
          {blog.title}
        </h4>
        <div className="flex items-center gap-2 text-[11px] text-gray-400 font-sans">
          {blog.readingTime && <span className="flex items-center gap-1"><Clock size={10} />{blog.readingTime}m</span>}
          <span className="flex items-center gap-1"><Eye size={10} />{formatNumber(blog.views)}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Featured hero blog ────────────────────────────────────────────────────────

function FeaturedHeroBlog({ blog }) {
  const coverUrl = imgUrl(blog.featuredImage);
  const authorInitial = (blog.authorName || blog.author?.name || 'A').charAt(0).toUpperCase();
  const authorAvatar = imgUrl(blog.authorAvatar || blog.author?.avatar);

  return (
    <Link
      to={`/blog/${blog.slug}`}
      className="group relative block rounded-3xl overflow-hidden mb-10"
      style={{ minHeight: 380 }}
    >
      {/* Background */}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={blog.title}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-800 to-indigo-600" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Featured badge */}
      <div className="absolute top-5 left-5">
        <span
          className="text-white text-xs font-bold px-3 py-1.5 rounded-full font-sans tracking-wider uppercase"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #FF6B00)' }}
        >
          ✦ Featured
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end h-full p-7" style={{ minHeight: 380 }}>
        {blog.category && (
          <span className="text-xs font-bold uppercase tracking-widest mb-3 font-sans" style={{ color: '#D4AF37' }}>
            {blog.category.icon ? `${blog.category.icon} ` : ''}{blog.category.name}
          </span>
        )}
        <h2
          className="text-white font-bold text-2xl md:text-3xl lg:text-4xl leading-tight mb-3 group-hover:text-amber-100 transition-colors max-w-2xl"
          style={{ fontFamily: '"Cormorant Garamond"', letterSpacing: '-0.02em' }}
        >
          {blog.title}
        </h2>
        {blog.excerpt && (
          <p className="text-gray-300 text-sm font-sans line-clamp-2 max-w-xl mb-4">{blog.excerpt}</p>
        )}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 shrink-0">
            {authorAvatar ? (
              <img src={authorAvatar} alt={authorInitial} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">{authorInitial}</span>
            )}
          </div>
          <span className="text-sm font-semibold text-white font-sans">
            {blog.authorName || blog.author?.name || 'Anonymous'}
          </span>
          {blog.readingTime && (
            <span className="text-xs text-gray-400 font-sans flex items-center gap-1">
              <Clock size={11} />{blog.readingTime} min read
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlogHomePage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-persisted state
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [tag, setTag] = useState(searchParams.get('tag') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');

  // Data
  const [blogs, setBlogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [popularTags, setPopularTags] = useState([]);
  const [trendingBlogs, setTrendingBlogs] = useState([]);
  const [editorBlogs, setEditorBlogs] = useState([]);
  const [featuredBlog, setFeaturedBlog] = useState(null);

  // Loading
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingTrending, setLoadingTrending] = useState(true);

  const LIMIT = 12;

  // ── Debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Sync URL params ──────────────────────────────────────────────────────────
  useEffect(() => {
    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (category) params.category = category;
    if (tag) params.tag = tag;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, category, tag, page, setSearchParams]);

  // ── Fetch blogs ──────────────────────────────────────────────────────────────
  const fetchBlogs = useCallback(async () => {
    setLoadingBlogs(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        ...(category && { category }),
        ...(tag && { tag }),
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      const { data } = await API.get(`/blogs?${params}`);
      setBlogs(data.blogs || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error('Could not load blogs');
      }
      setBlogs([]);
    } finally {
      setLoadingBlogs(false);
    }
  }, [page, category, tag, debouncedSearch]);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  // ── Fetch categories ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingCategories(true);
    API.get('/blogs/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {})
      .finally(() => setLoadingCategories(false));
  }, []);

  // ── Fetch popular tags ───────────────────────────────────────────────────────
  useEffect(() => {
    API.get('/blogs/tags/popular')
      .then(({ data }) => setPopularTags(data.tags || []))
      .catch(() => {});
  }, []);

  // ── Fetch trending + editor's pick + featured ────────────────────────────────
  useEffect(() => {
    setLoadingTrending(true);
    Promise.all([
      API.get('/blogs?trending=true&limit=5').catch(() => ({ data: { blogs: [] } })),
      API.get('/blogs?featured=true&limit=1').catch(() => ({ data: { blogs: [] } })),
      API.get('/blogs?featured=true&limit=3').catch(() => ({ data: { blogs: [] } })),
    ])
      .then(([trendRes, featRes, editorRes]) => {
        setTrendingBlogs(trendRes.data.blogs || []);
        setFeaturedBlog((featRes.data.blogs || [])[0] || null);
        setEditorBlogs(editorRes.data.blogs || []);
      })
      .finally(() => setLoadingTrending(false));
  }, []);

  // ── Like a blog ───────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (blogId) => {
    try {
      const { data } = await API.post(`/blogs/${blogId}/like`);
      setBlogs(prev =>
        prev.map(b =>
          b._id === blogId
            ? { ...b, isLiked: data.liked, likes: data.likes }
            : b
        )
      );
    } catch {
      toast.error('Could not update like');
    }
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const mainBlogs = useMemo(() => blogs, [blogs]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: '#FAF8F5' }}>

      {/* ══════════════════════════════════════════
          1. HERO
      ══════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #1B1F3B 0%, #2c2250 60%, #1B1F3B 100%)' }}
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #D4AF37 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

        {/* Glow orbs */}
        <div className="absolute top-0 left-1/3 w-72 h-72 rounded-full blur-[120px] opacity-15 pointer-events-none"
          style={{ background: '#D4AF37' }} />
        <div className="absolute bottom-0 right-1/4 w-56 h-56 rounded-full blur-[100px] opacity-10 pointer-events-none"
          style={{ background: '#FF6B00' }} />

        <div className="relative max-w-4xl mx-auto px-4 py-20 md:py-28 text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37' }}>
            <Sparkles size={12} />
            The Zutsav Blog
          </div>

          <h1
            className="font-bold text-white mb-5 leading-tight"
            style={{
              fontFamily: '"Cormorant Garamond"',
              fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
              letterSpacing: '-0.03em',
            }}
          >
            Stories from the{' '}
            <span style={{ color: '#D4AF37' }}>Sacred Journey</span>
          </h1>

          <p className="text-gray-300 text-base md:text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Wisdom, rituals, and spiritual insights from pandits, devotees,
            and the Zutsav community
          </p>

          {/* Search bar */}
          <div className="relative max-w-lg mx-auto mb-8">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search stories, rituals, festivals…"
              className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-white/10 border border-white/15 text-white placeholder-gray-400 focus:outline-none focus:border-amber-400/50 focus:bg-white/15 transition-all text-sm"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setDebouncedSearch(''); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Write button for authenticated users */}
          {isAuthenticated && (
            <Link
              to="/blog/write"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 shadow-lg"
              style={{ background: 'linear-gradient(135deg, #D4AF37, #FF6B00)', color: '#fff' }}
            >
              <PenSquare size={15} />
              Write a Blog
            </Link>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          2. CATEGORY PILLS
      ══════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 overflow-x-auto py-3 hide-scrollbar">
            {/* All pill */}
            <button
              onClick={() => { setCategory(''); setTag(''); setPage(1); }}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                !category && !tag
                  ? 'border-indigo-800 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 bg-white'
              }`}
              style={!category && !tag ? { background: '#1B1F3B' } : {}}
            >
              All
            </button>

            {loadingCategories
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="shrink-0 h-8 w-24 bg-gray-100 rounded-full animate-pulse" />
                ))
              : categories.map((cat, i) => (
                  <button
                    key={cat._id}
                    onClick={() => { setCategory(cat.slug || cat._id); setTag(''); setPage(1); }}
                    className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                      category === (cat.slug || cat._id)
                        ? 'text-white border-transparent'
                        : 'border-gray-200 text-gray-600 hover:text-indigo-700 bg-white hover:border-indigo-200'
                    }`}
                    style={
                      category === (cat.slug || cat._id)
                        ? { backgroundColor: cat.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length], borderColor: 'transparent' }
                        : {}
                    }
                  >
                    {cat.icon && <span>{cat.icon}</span>}
                    {cat.name}
                  </button>
                ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          MAIN LAYOUT
      ══════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 py-10">

        {/* Active filters notice */}
        {(debouncedSearch || category || tag) && (
          <div className="flex items-center gap-3 mb-6 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm font-sans">
            <Search size={14} className="text-indigo-400 shrink-0" />
            <span className="text-indigo-700 flex-1">
              {debouncedSearch && <span>Search: <strong>"{debouncedSearch}"</strong> </span>}
              {category && <span>Category filter active </span>}
              {tag && <span>Tag: <strong>#{tag}</strong></span>}
            </span>
            <button
              onClick={() => { setSearchInput(''); setDebouncedSearch(''); setCategory(''); setTag(''); setPage(1); }}
              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 font-semibold"
            >
              <X size={13} /> Clear
            </button>
          </div>
        )}

        {/* Featured hero blog */}
        {!loadingBlogs && featuredBlog && !debouncedSearch && !category && !tag && page === 1 && (
          <FeaturedHeroBlog blog={featuredBlog} />
        )}

        <div className="flex gap-8 items-start">

          {/* ── Left: Blog grid (2/3) ── */}
          <main className="flex-1 min-w-0">

            {loadingBlogs ? (
              <div className="grid sm:grid-cols-2 gap-6">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : mainBlogs.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
                  style={{ background: 'linear-gradient(135deg, #F5F0FF, #EDE8FF)' }}
                >
                  <BookOpen size={32} className="text-indigo-300" />
                </div>
                <h3
                  className="text-2xl font-bold text-gray-800 mb-2"
                  style={{ fontFamily: '"Cormorant Garamond"' }}
                >
                  No stories found
                </h3>
                <p className="text-gray-500 text-sm max-w-xs mb-6">
                  {debouncedSearch
                    ? `No blogs match "${debouncedSearch}". Try a different keyword.`
                    : 'There are no blogs in this category yet. Check back soon.'}
                </p>
                <button
                  onClick={() => { setSearchInput(''); setDebouncedSearch(''); setCategory(''); setTag(''); setPage(1); }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#1B1F3B' }}
                >
                  <RefreshCw size={14} />
                  Browse All Stories
                </button>
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-6 mb-8">
                  {mainBlogs.map((blog, i) => (
                    <BlogCard
                      key={blog._id}
                      blog={blog}
                      index={i}
                      onLike={handleLike}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {pages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-indigo-700 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {Array.from({ length: pages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm font-sans">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`w-9 h-9 rounded-xl text-sm font-semibold font-sans transition-all ${
                              page === p
                                ? 'text-white'
                                : 'border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'
                            }`}
                            style={page === p ? { background: '#1B1F3B' } : {}}
                          >
                            {p}
                          </button>
                        )
                      )}

                    <button
                      onClick={() => setPage(p => Math.min(pages, p + 1))}
                      disabled={page === pages}
                      className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 hover:text-indigo-700 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* Results count */}
                <p className="text-center text-xs text-gray-400 font-sans mt-3">
                  Showing {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} of {total} stories
                </p>
              </>
            )}
          </main>

          {/* ── Right sidebar (1/3) ── */}
          <aside className="hidden lg:block w-80 xl:w-96 shrink-0 space-y-6">

            {/* Trending */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-amber-500" />
                <h3
                  className="font-bold text-gray-800 text-base"
                  style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.15rem' }}
                >
                  Trending Now
                </h3>
              </div>

              {loadingTrending ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-6 h-6 bg-gray-100 rounded" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-gray-100 rounded w-full" />
                        <div className="h-3 bg-gray-100 rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : trendingBlogs.length === 0 ? (
                <p className="text-sm text-gray-400 font-sans">No trending posts yet.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {trendingBlogs.map((blog, i) => (
                    <TrendingItem key={blog._id} blog={blog} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>

            {/* Popular Tags */}
            {popularTags.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Tag size={15} className="text-indigo-400" />
                  <h3
                    className="font-bold text-gray-800"
                    style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.15rem' }}
                  >
                    Popular Tags
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {popularTags.map(({ tag: t, count }) => (
                    <button
                      key={t}
                      onClick={() => { setTag(t); setCategory(''); setPage(1); }}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all font-sans ${
                        tag === t
                          ? 'text-white border-transparent'
                          : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700 bg-gray-50'
                      }`}
                      style={tag === t ? { background: '#1B1F3B' } : {}}
                    >
                      #{t}
                      <span className="opacity-60">({count})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Editor's Pick */}
            {editorBlogs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Star size={15} className="text-amber-400 fill-amber-400" />
                  <h3
                    className="font-bold text-gray-800"
                    style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.15rem' }}
                  >
                    Editor's Pick
                  </h3>
                </div>
                <div className="space-y-4">
                  {editorBlogs.map((blog, i) => {
                    const coverUrl = imgUrl(blog.featuredImage);
                    const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length];
                    return (
                      <Link
                        key={blog._id}
                        to={`/blog/${blog.slug}`}
                        className="group flex gap-3 items-start"
                      >
                        <div className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br ${gradient}`}>
                          {coverUrl ? (
                            <img src={coverUrl} alt={blog.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                              <BookOpen size={18} className="opacity-40 text-gray-500" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            className="text-sm font-semibold text-gray-800 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-snug mb-1"
                            style={{ fontFamily: '"Cormorant Garamond"' }}
                          >
                            {blog.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 font-sans">
                            {blog.readingTime && (
                              <span className="flex items-center gap-1">
                                <Clock size={10} />{blog.readingTime}m
                              </span>
                            )}
                            <span>{relativeTime(blog.publishedAt || blog.createdAt)}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Write CTA for logged-in users */}
            {isAuthenticated && (
              <div
                className="rounded-2xl p-5 text-white text-center"
                style={{ background: 'linear-gradient(135deg, #1B1F3B, #2c2250)' }}
              >
                <PenSquare size={24} className="mx-auto mb-3 opacity-70" />
                <h4
                  className="font-bold text-lg mb-1.5"
                  style={{ fontFamily: '"Cormorant Garamond"' }}
                >
                  Share Your Story
                </h4>
                <p className="text-gray-300 text-xs mb-4 font-sans">
                  Inspire the Zutsav community with your spiritual insights.
                </p>
                <Link
                  to="/blog/write"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#D4AF37', color: '#1B1F3B' }}
                >
                  Write a Blog <ArrowRight size={13} />
                </Link>
              </div>
            )}

            {/* Join CTA for guests */}
            {!isAuthenticated && (
              <div
                className="rounded-2xl p-5 text-white text-center"
                style={{ background: 'linear-gradient(135deg, #1B1F3B, #2c2250)' }}
              >
                <Users size={24} className="mx-auto mb-3 opacity-70" />
                <h4
                  className="font-bold text-lg mb-1.5"
                  style={{ fontFamily: '"Cormorant Garamond"' }}
                >
                  Join the Community
                </h4>
                <p className="text-gray-300 text-xs mb-4 font-sans">
                  Sign in to like posts, save stories, and write your own.
                </p>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#D4AF37', color: '#1B1F3B' }}
                >
                  Get Started <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
