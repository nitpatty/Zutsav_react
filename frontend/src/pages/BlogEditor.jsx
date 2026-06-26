import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, Eye, Lock, X, Upload, ImageIcon,
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, Quote, Code2, Link2, Undo2, Redo2,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import ZutsavLoader from '../components/shared/ZutsavLoader';

// ─── Constants ─────────────────────────────────────────────────────────────────

const AUTOSAVE_KEY = (id) => `zutsav_blog_draft_${id || 'new'}`;
const AUTOSAVE_INTERVAL = 30000; // 30 s

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stripDangerousPatterns(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
}

// ─── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({ onClick, title, active, disabled, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all select-none
        ${active
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}

function ToolbarSep() {
  return <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />;
}

// ─── Tag input component ───────────────────────────────────────────────────────

function TagInput({ tags, onChange }) {
  const [input, setInput] = useState('');

  function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag || tags.includes(tag) || tags.length >= 10) return;
    onChange([...tags, tag]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  function removeTag(idx) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  return (
    <div className="min-h-[42px] flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-xl border border-gray-200 bg-white focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-sans"
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) { addTag(input); setInput(''); } }}
        placeholder={tags.length === 0 ? 'Add tags (press Enter)...' : ''}
        className="flex-1 min-w-[80px] outline-none text-xs text-gray-700 font-sans bg-transparent"
      />
    </div>
  );
}

// ─── SEO preview ───────────────────────────────────────────────────────────────

function SeoPreview({ title, description }) {
  const displayTitle = title || 'Your blog title here...';
  const displayDesc = description || 'Your SEO description will appear here. Make it compelling and around 150 characters.';
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 font-sans">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Google Preview</p>
      <p className="text-xs text-green-700 mb-0.5">zutsav.in/blog/...</p>
      <p className="text-sm font-medium text-blue-700 leading-tight line-clamp-1 mb-0.5">
        {displayTitle}
      </p>
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
        {displayDesc}
      </p>
    </div>
  );
}

// ─── Auto-resize textarea hook ─────────────────────────────────────────────────

function useAutoResize(ref) {
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [ref]);
  return resize;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BlogEditor() {
  const { id } = useParams(); // present on /blog/edit/:id
  const isEditing = !!id;
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  // ── Permissions ───────────────────────────────────────────────────────────
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canPublish, setCanPublish] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState([]);
  const [featuredImage, setFeaturedImage] = useState(null); // URL string
  const [featuredImageFile, setFeaturedImageFile] = useState(null);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  // ── Categories ────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingBlog, setLoadingBlog] = useState(isEditing);
  const [autoSaveStatus, setAutoSaveStatus] = useState(''); // 'saved' | 'saving' | ''
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const titleResizeRef = useRef(null);
  const featuredImageInputRef = useRef(null);
  const inlineImageInputRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  const resizeTitle = useAutoResize(titleRef);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // ── Check permissions ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    API.get('/blogs/permissions/check')
      .then(({ data }) => {
        setCanPublish(data.canPublish !== false);
        setRequiresApproval(!!data.requiresApproval);
        if (data.canPublish === false) setAccessDenied(true);
      })
      .catch(() => {
        // Default to allowing — server-side enforcement is the source of truth
        setCanPublish(true);
      })
      .finally(() => setPermissionsLoading(false));
  }, [isAuthenticated]);

  // ── Load categories ───────────────────────────────────────────────────────
  useEffect(() => {
    API.get('/blogs/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  // ── Load blog for editing ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditing) {
      setLoadingBlog(false);
      // Restore from localStorage if present
      const saved = localStorage.getItem(AUTOSAVE_KEY(null));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.title) setTitle(parsed.title);
          if (parsed.content) {
            setContent(parsed.content);
            if (editorRef.current) editorRef.current.innerHTML = parsed.content;
          }
          if (parsed.category) setCategory(parsed.category);
          if (parsed.tags) setTags(parsed.tags);
          if (parsed.seoTitle) setSeoTitle(parsed.seoTitle);
          if (parsed.seoDescription) setSeoDescription(parsed.seoDescription);
        } catch {}
      }
      return;
    }
    setLoadingBlog(true);
    API.get(`/blogs/${id}`)
      .then(({ data }) => {
        const b = data.blog;
        setTitle(b.title || '');
        setContent(b.content || '');
        setCategory(b.category?._id || b.category || '');
        setTags(b.tags || []);
        setFeaturedImage(b.featuredImage ? (b.featuredImage.startsWith('http') ? b.featuredImage : 'http://localhost:5000/' + b.featuredImage) : null);
        setSeoTitle(b.seoTitle || '');
        setSeoDescription(b.seoDescription || '');
        if (editorRef.current) editorRef.current.innerHTML = b.content || '';
      })
      .catch(() => {
        toast.error('Could not load blog for editing');
        navigate('/blog');
      })
      .finally(() => setLoadingBlog(false));
  }, [id, isEditing, navigate]);

  // Resize title on load
  useEffect(() => {
    if (titleRef.current) resizeTitle();
  }, [title, resizeTitle]);

  // ── Unsaved warning ───────────────────────────────────────────────────────
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);

  // ── Auto-save to localStorage ──────────────────────────────────────────────
  const doLocalSave = useCallback(() => {
    const payload = { title, content, category, tags, seoTitle, seoDescription, savedAt: Date.now() };
    localStorage.setItem(AUTOSAVE_KEY(id || null), JSON.stringify(payload));
    setAutoSaveStatus('saved');
    setTimeout(() => setAutoSaveStatus(''), 3000);
  }, [title, content, category, tags, seoTitle, seoDescription, id]);

  useEffect(() => {
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (title || content) {
        setAutoSaveStatus('saving');
        doLocalSave();
        setHasUnsaved(false);
      }
    }, AUTOSAVE_INTERVAL);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [title, content, category, tags, seoTitle, seoDescription, doLocalSave]);

  // Mark unsaved on any change
  useEffect(() => {
    setHasUnsaved(true);
  }, [title, content, category, tags, featuredImage, seoTitle, seoDescription]);

  // ── Toolbar exec ──────────────────────────────────────────────────────────
  const exec = useCallback((command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML || '');
  }, []);

  const execBlock = useCallback((tag) => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, tag);
    setContent(editorRef.current?.innerHTML || '');
  }, []);

  const insertCodeBlock = useCallback(() => {
    const sel = window.getSelection();
    const selected = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).toString() : '';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = selected || 'code here';
    pre.appendChild(code);
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
      sel.removeAllRanges();
    } else {
      editorRef.current?.appendChild(pre);
    }
    setContent(editorRef.current?.innerHTML || '');
  }, []);

  const insertLink = useCallback(() => {
    const url = window.prompt('Enter URL (https://...)');
    if (!url) return;
    exec('createLink', url);
  }, [exec]);

  // ── Featured image upload ──────────────────────────────────────────────────
  const handleFeaturedImageSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    // Preview immediately
    const objectUrl = URL.createObjectURL(file);
    setFeaturedImage(objectUrl);
    setFeaturedImageFile(file);
  }, []);

  // ── Inline image upload ────────────────────────────────────────────────────
  const handleInlineImageUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await API.post('/blogs/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.url) {
        const img = document.createElement('img');
        img.src = data.url;
        img.alt = file.name;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '12px';
        editorRef.current?.focus();
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          editorRef.current?.appendChild(img);
        }
        setContent(editorRef.current?.innerHTML || '');
      }
    } catch {
      toast.error('Image upload failed');
    } finally {
      setImageUploading(false);
      if (e.target) e.target.value = '';
    }
  }, []);

  // ── Validate ──────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    if (!title.trim()) { toast.error('Please add a title'); return false; }
    if (!content.trim() || content === '<br>') { toast.error('Please write some content'); return false; }
    if (!category) { toast.error('Please select a category'); return false; }
    return true;
  }, [title, content, category]);

  // ── Upload featured image if user picked a new file ──────────────────────
  const uploadFeaturedImageIfNeeded = useCallback(async () => {
    if (!featuredImageFile) return featuredImage || '';
    const fd = new FormData();
    fd.append('image', featuredImageFile);
    const { data } = await API.post('/blogs/upload-image', fd);
    setFeaturedImageFile(null);
    setFeaturedImage(data.url);
    return data.url;
  }, [featuredImageFile, featuredImage]);

  // ── Build payload (JSON, never FormData) ─────────────────────────────────
  const buildPayload = useCallback((action, imageUrl) => ({
    title:          title.trim(),
    content:        stripDangerousPatterns(content),
    category:       category || null,
    tags,
    seoTitle:       seoTitle.trim(),
    seoDescription: seoDescription.trim(),
    featuredImage:  imageUrl ?? featuredImage ?? '',
    action,
  }), [title, content, category, tags, seoTitle, seoDescription, featuredImage]);

  // ── Save draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    doLocalSave();
    try {
      const imageUrl = await uploadFeaturedImageIfNeeded();
      const payload  = buildPayload('draft', imageUrl);
      if (isEditing) {
        await API.put(`/blogs/${id}`, payload);
      } else {
        await API.post('/blogs', payload);
      }
      setHasUnsaved(false);
      toast.success('Draft saved');
    } catch (err) {
      if (err.response?.status !== 401) toast.error('Could not save draft');
    } finally {
      setSaving(false);
    }
  }, [saving, doLocalSave, buildPayload, uploadFeaturedImageIfNeeded, isEditing, id]);

  // ── Publish / submit ──────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!validate()) return;
    if (publishing) return;
    const action = requiresApproval ? 'submit' : 'publish';
    const confirmMsg = requiresApproval
      ? 'Submit this blog for review? It will be published once approved.'
      : 'Publish this blog post now?';
    if (!window.confirm(confirmMsg)) return;

    setPublishing(true);
    try {
      const imageUrl = await uploadFeaturedImageIfNeeded();
      const payload  = buildPayload(action, imageUrl);
      if (isEditing) {
        await API.put(`/blogs/${id}`, payload);
      } else {
        await API.post('/blogs', payload);
      }
      localStorage.removeItem(AUTOSAVE_KEY(id || null));
      setHasUnsaved(false);
      toast.success(requiresApproval ? 'Submitted for review!' : 'Blog published!');
      navigate('/blog');
    } catch (err) {
      if (err.response?.status !== 401) toast.error('Could not publish blog');
    } finally {
      setPublishing(false);
    }
  }, [validate, publishing, requiresApproval, buildPayload, uploadFeaturedImageIfNeeded, isEditing, id, navigate]);

  // ── Query active commands for toolbar highlight ───────────────────────────
  const [activeFormats, setActiveFormats] = useState({});
  const updateActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING / PERMISSION GATES
  // ─────────────────────────────────────────────────────────────────────────

  if (permissionsLoading || loadingBlog) {
    return <ZutsavLoader fullscreen message={loadingBlog ? 'Loading blog...' : 'Checking permissions...'} />;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 font-sans" style={{ backgroundColor: '#FAF8F5' }}>
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}
        >
          <Lock size={32} className="text-amber-500" />
        </div>
        <h2
          className="text-2xl font-bold text-gray-900 mb-2"
          style={{ fontFamily: '"Cormorant Garamond"' }}
        >
          Writing access required
        </h2>
        <p className="text-gray-500 text-sm max-w-xs mb-6">
          Your account does not yet have permission to write blog posts. Please contact the Zutsav team to request access.
        </p>
        <Link
          to="/blog"
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: '#1B1F3B' }}
        >
          <ChevronLeft size={15} /> Back to Blog
        </Link>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: '#FAF8F5' }}>

      {/* Hidden file inputs */}
      <input
        ref={featuredImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFeaturedImageSelect}
      />
      <input
        ref={inlineImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInlineImageUpload}
      />

      {/* ══ Top bar ══ */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          {/* Back */}
          <Link
            to="/blog"
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors shrink-0"
            onClick={(e) => {
              if (hasUnsaved && !window.confirm('You have unsaved changes. Leave anyway?')) e.preventDefault();
            }}
          >
            <ChevronLeft size={16} /> Back
          </Link>

          <div className="w-px h-5 bg-gray-200 shrink-0" />

          {/* Title */}
          <h1
            className="font-bold text-gray-800 flex-1 min-w-0 truncate"
            style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.1rem' }}
          >
            {isEditing ? 'Edit Blog' : 'Write a Blog'}
          </h1>

          {/* Auto-save indicator */}
          <div className="shrink-0 text-xs font-sans transition-all">
            {autoSaveStatus === 'saving' && (
              <span className="text-amber-500 flex items-center gap-1.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Saving...
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-green-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Saved just now
              </span>
            )}
            {hasUnsaved && !autoSaveStatus && (
              <span className="text-gray-400 flex items-center gap-1.5">
                <AlertTriangle size={11} /> Unsaved changes
              </span>
            )}
          </div>

          {/* Mobile sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
          >
            <Eye size={16} />
          </button>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:opacity-90 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #1B1F3B, #2c2250)' }}
            >
              {publishing
                ? 'Publishing...'
                : requiresApproval ? 'Submit for Review' : 'Publish'}
            </button>
          </div>
        </div>
      </header>

      {/* ══ Main layout ══ */}
      <div className="flex flex-1 max-w-7xl mx-auto w-full">

        {/* ── Left: Editor ── */}
        <main className="flex-1 min-w-0 px-4 lg:px-8 py-8">

          {/* Featured image zone */}
          <div className="mb-6">
            {featuredImage ? (
              <div className="relative rounded-2xl overflow-hidden shadow-md group">
                <img
                  src={featuredImage}
                  alt="Featured"
                  className="w-full object-cover"
                  style={{ maxHeight: 340 }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => featuredImageInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-white text-gray-800 text-sm font-semibold hover:bg-gray-100 transition-colors"
                  >
                    Change Image
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFeaturedImage(null); setFeaturedImageFile(null); }}
                    className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => featuredImageInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all text-gray-400 hover:text-indigo-500 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-gray-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                  <ImageIcon size={22} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">Add a cover image</p>
                  <p className="text-xs mt-0.5">Recommended: 1200 x 630px, under 5MB</p>
                </div>
              </button>
            )}
          </div>

          {/* Title textarea */}
          <textarea
            ref={titleRef}
            value={title}
            onChange={e => { setTitle(e.target.value); resizeTitle(); }}
            placeholder="Your blog title..."
            rows={1}
            className="w-full resize-none outline-none text-gray-900 font-bold bg-transparent mb-4 leading-tight overflow-hidden"
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
              letterSpacing: '-0.02em',
            }}
          />

          {/* Rich text toolbar */}
          <div
            className="flex flex-wrap items-center gap-0.5 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm mb-4 sticky z-30"
            style={{ top: '57px' }}
          >
            {/* Format */}
            <ToolbarBtn onClick={() => exec('bold')} title="Bold (Ctrl+B)" active={activeFormats.bold}>
              <Bold size={13} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => exec('italic')} title="Italic (Ctrl+I)" active={activeFormats.italic}>
              <Italic size={13} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => exec('underline')} title="Underline (Ctrl+U)" active={activeFormats.underline}>
              <Underline size={13} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => exec('strikeThrough')} title="Strikethrough" active={activeFormats.strikeThrough}>
              <Strikethrough size={13} />
            </ToolbarBtn>

            <ToolbarSep />

            {/* Headings */}
            <ToolbarBtn onClick={() => execBlock('h2')} title="Heading 2">
              <span className="text-xs font-black leading-none">H2</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => execBlock('h3')} title="Heading 3">
              <span className="text-xs font-black leading-none">H3</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => execBlock('p')} title="Paragraph">
              <span className="text-xs font-black leading-none">P</span>
            </ToolbarBtn>

            <ToolbarSep />

            {/* Lists */}
            <ToolbarBtn onClick={() => exec('insertUnorderedList')} title="Bullet list" active={activeFormats.insertUnorderedList}>
              <List size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => exec('insertOrderedList')} title="Ordered list" active={activeFormats.insertOrderedList}>
              <ListOrdered size={14} />
            </ToolbarBtn>

            {/* Blockquote */}
            <ToolbarBtn onClick={() => execBlock('blockquote')} title="Blockquote">
              <Quote size={14} />
            </ToolbarBtn>

            {/* Code block */}
            <ToolbarBtn onClick={insertCodeBlock} title="Code block">
              <Code2 size={14} />
            </ToolbarBtn>

            <ToolbarSep />

            {/* Link */}
            <ToolbarBtn onClick={insertLink} title="Insert link">
              <Link2 size={14} />
            </ToolbarBtn>

            {/* Inline image */}
            <ToolbarBtn
              onClick={() => inlineImageInputRef.current?.click()}
              title="Insert image"
              disabled={imageUploading}
            >
              {imageUploading
                ? <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <Upload size={13} />
              }
            </ToolbarBtn>

            <ToolbarSep />

            {/* Undo / Redo */}
            <ToolbarBtn onClick={() => exec('undo')} title="Undo (Ctrl+Z)">
              <Undo2 size={14} />
            </ToolbarBtn>
            <ToolbarBtn onClick={() => exec('redo')} title="Redo (Ctrl+Y)">
              <Redo2 size={14} />
            </ToolbarBtn>
          </div>

          {/* Content editor */}
          <div className="relative">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => {
                setContent(e.currentTarget.innerHTML);
                setHasUnsaved(true);
              }}
              onKeyUp={updateActiveFormats}
              onMouseUp={updateActiveFormats}
              onFocus={updateActiveFormats}
              className="outline-none blog-editor-content"
              style={{
                minHeight: 400,
                lineHeight: '1.85',
                fontSize: '1.0625rem',
                color: '#374151',
                fontFamily: 'inherit',
              }}
              data-placeholder="Start writing your story..."
            />
          </div>

        </main>

        {/* ── Right: Sidebar ── */}
        <aside
          className={`
            lg:block shrink-0 w-72 xl:w-80 border-l border-gray-100 bg-white px-5 py-6 space-y-6 overflow-y-auto
            ${sidebarOpen ? 'block' : 'hidden'}
            fixed lg:sticky inset-y-0 right-0 top-14 z-30 lg:z-auto lg:h-[calc(100vh-56px)] shadow-2xl lg:shadow-none
          `}
        >
          {/* Mobile close */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all appearance-none"
            >
              <option value="">Select a category...</option>
              {categories.map(cat => (
                <option key={cat._id} value={cat._id}>{cat.icon ? `${cat.icon} ` : ''}{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              Tags <span className="text-gray-400 font-normal normal-case text-[10px]">(max 10)</span>
            </label>
            <TagInput tags={tags} onChange={setTags} />
            <p className="text-[10px] text-gray-400 mt-1.5 font-sans">Press Enter or comma to add a tag</p>
          </div>

          {/* SEO section */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSeoOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500">SEO Settings</span>
              {seoOpen
                ? <ChevronUp size={14} className="text-gray-400" />
                : <ChevronDown size={14} className="text-gray-400" />
              }
            </button>

            {seoOpen && (
              <div className="px-4 pb-4 space-y-4">
                {/* SEO Title */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-gray-600 font-sans">SEO Title</label>
                    <span className={`text-[10px] font-sans ${seoTitle.length > 90 ? 'text-red-500' : 'text-gray-400'}`}>
                      {seoTitle.length}/100
                    </span>
                  </div>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={e => setSeoTitle(e.target.value.slice(0, 100))}
                    placeholder="SEO-optimized title..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all font-sans"
                  />
                </div>

                {/* SEO Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-gray-600 font-sans">SEO Description</label>
                    <span className={`text-[10px] font-sans ${seoDescription.length > 270 ? 'text-red-500' : 'text-gray-400'}`}>
                      {seoDescription.length}/300
                    </span>
                  </div>
                  <textarea
                    value={seoDescription}
                    onChange={e => setSeoDescription(e.target.value.slice(0, 300))}
                    placeholder="Brief description for search engines..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-none transition-all font-sans"
                  />
                </div>

                {/* Google preview */}
                <SeoPreview
                  title={seoTitle || title}
                  description={seoDescription}
                />
              </div>
            )}
          </div>

          {/* Approval notice */}
          {requiresApproval && (
            <div
              className="rounded-xl p-3 text-xs font-sans"
              style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E' }}
            >
              <p className="font-bold mb-0.5 flex items-center gap-1.5">
                <AlertTriangle size={11} /> Review Required
              </p>
              <p>Your blog will be reviewed by the Zutsav team before being published.</p>
            </div>
          )}

          {/* Publish button (sidebar duplicate for convenience) */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className="w-full py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50 hover:opacity-90 shadow-md"
              style={{ background: 'linear-gradient(135deg, #1B1F3B, #2c2250)' }}
            >
              {publishing
                ? 'Publishing...'
                : requiresApproval ? 'Submit for Review' : 'Publish Now'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="w-full py-2.5 rounded-2xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>
          </div>
        </aside>
      </div>

      {/* ══ Injected styles ══ */}
      <style>{`
        .blog-editor-content:empty:before {
          content: attr(data-placeholder);
          color: #9CA3AF;
          pointer-events: none;
          position: absolute;
        }
        .blog-editor-content h2 {
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: 1.7rem;
          font-weight: 700;
          color: #1B1F3B;
          margin: 1.75rem 0 0.6rem;
          letter-spacing: -0.02em;
          line-height: 1.25;
        }
        .blog-editor-content h3 {
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: 1.3rem;
          font-weight: 700;
          color: #374151;
          margin: 1.25rem 0 0.5rem;
        }
        .blog-editor-content p {
          margin: 0 0 1rem;
        }
        .blog-editor-content blockquote {
          margin: 1.5rem 0;
          padding: 1rem 1.25rem;
          border-left: 4px solid #D4AF37;
          background: linear-gradient(135deg, #FFFBEB, #FEF9EC);
          border-radius: 0 10px 10px 0;
          font-style: italic;
          color: #4B5563;
        }
        .blog-editor-content pre {
          background: #1E1E2E;
          border-radius: 10px;
          padding: 1rem 1.25rem;
          overflow-x: auto;
          margin: 1.25rem 0;
        }
        .blog-editor-content code {
          font-family: "JetBrains Mono", "Fira Code", monospace;
          font-size: 0.875em;
          background: #F1F0FF;
          color: #5B21B6;
          padding: 0.15em 0.45em;
          border-radius: 5px;
        }
        .blog-editor-content pre code {
          background: transparent;
          color: #CDD6F4;
          padding: 0;
        }
        .blog-editor-content ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.75rem 0 1rem;
        }
        .blog-editor-content ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.75rem 0 1rem;
        }
        .blog-editor-content li {
          margin-bottom: 0.3rem;
        }
        .blog-editor-content a {
          color: #4F46E5;
          text-decoration: underline;
        }
        .blog-editor-content img {
          max-width: 100%;
          border-radius: 10px;
          margin: 1rem 0;
        }
      `}</style>
    </div>
  );
}
