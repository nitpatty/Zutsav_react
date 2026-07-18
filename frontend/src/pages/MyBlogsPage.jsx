import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PenSquare, Eye, Edit3, Trash2, Copy, Clock, BarChart2, ChevronLeft } from 'lucide-react';
import API from '../api/axios';
import toast from 'react-hot-toast';
import { ZutsavLoaderInline } from '../components/shared/ZutsavLoader';
import { getImageUrl } from '../config';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_TABS = ['all', 'draft', 'pending_review', 'rejected', 'published', 'archived', 'scheduled'];
const STATUS_META = {
  draft:          { icon: '⚪', label: 'Draft',          bg: '#F3F4F6', text: '#374151' },
  pending_review: { icon: '🟡', label: 'Pending Review', bg: '#FEF3C7', text: '#92400E' },
  rejected:       { icon: '🔴', label: 'Rejected',        bg: '#FEE2E2', text: '#991B1B' },
  published:      { icon: '🟢', label: 'Published',       bg: '#DCFCE7', text: '#166534' },
  archived:       { icon: '⚫', label: 'Archived',         bg: '#E5E7EB', text: '#374151' },
  scheduled:      { icon: '🔵', label: 'Scheduled',        bg: '#DBEAFE', text: '#1E40AF' },
};

export default function MyBlogsPage() {
  const navigate = useNavigate();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = status !== 'all' ? { status } : {};
    API.get('/blogs/me/blogs', { params })
      .then(({ data }) => setBlogs(data.blogs || []))
      .catch(() => toast.error('Could not load your blogs'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (blog) => {
    if (!window.confirm(`Delete "${blog.title}"? This cannot be undone.`)) return;
    setDeletingId(blog._id);
    try {
      await API.delete(`/blogs/${blog._id}`);
      toast.success('Blog deleted');
      setBlogs((prev) => prev.filter((b) => b._id !== blog._id));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete blog');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (blog) => {
    setDuplicatingId(blog._id);
    try {
      const { data } = await API.post(`/blogs/${blog._id}/duplicate`);
      toast.success('Blog duplicated — opening the copy as a new draft.');
      navigate(`/blog/edit/${data.blog._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not duplicate blog');
    } finally {
      setDuplicatingId(null);
    }
  };

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: '#FAF8F5' }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate('/blog')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.1rem' }}>
            My Blogs
          </h1>
          <div className="flex-1" />
          <Link
            to="/blog/write"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #FF6B00)' }}
          >
            <PenSquare size={14} /> Write a Blog
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Status filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-2 hide-scrollbar">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                status === s ? 'border-indigo-800 text-white' : 'border-gray-200 text-gray-600 bg-white hover:border-indigo-300'
              }`}
              style={status === s ? { background: '#1B1F3B' } : {}}
            >
              {s === 'all' ? 'All' : STATUS_META[s]?.label || s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><ZutsavLoaderInline size={24} /></div>
        ) : blogs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="text-5xl mb-3">✍️</div>
            <p className="text-gray-500 font-medium mb-4">
              {status === 'all' ? "You haven't written any blogs yet." : `No ${STATUS_META[status]?.label.toLowerCase() || status} blogs.`}
            </p>
            {status === 'all' && (
              <Link
                to="/blog/write"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: '#1B1F3B' }}
              >
                <PenSquare size={14} /> Write Your First Blog
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {blogs.map((b) => {
              const meta = STATUS_META[b.status] || STATUS_META.draft;
              const canEdit = ['draft', 'rejected', 'scheduled', 'published'].includes(b.status);
              const isSameDay = b.createdAt && b.updatedAt &&
                new Date(b.createdAt).toDateString() === new Date(b.updatedAt).toDateString();
              return (
                <div key={b._id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                    {b.featuredImage
                      ? <img src={getImageUrl(b.featuredImage)} alt="" className="w-full h-full object-cover" />
                      : <span className="text-2xl">📝</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                        style={{ background: meta.bg, color: meta.text, borderColor: meta.text + '33' }}
                      >
                        {meta.icon} {meta.label}
                      </span>
                      {b.category?.name && <span className="text-[11px] text-gray-400">{b.category.name}</span>}
                    </div>
                    <p className="font-bold text-gray-800 truncate">{b.title || 'Untitled'}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                      {b.createdAt && <span>Created {formatDate(b.createdAt)}</span>}
                      {!isSameDay && b.updatedAt && <span>· Updated {formatDate(b.updatedAt)}</span>}
                      {b.readingTime && (
                        <span className="flex items-center gap-1"><Clock size={10} />{b.readingTime} min read</span>
                      )}
                      {b.status === 'published' && (
                        <span className="flex items-center gap-1"><BarChart2 size={10} />{b.views || 0} views</span>
                      )}
                    </div>
                    {b.status === 'rejected' && b.rejectionReason && (
                      <p className="text-xs text-red-500 mt-0.5">{b.rejectionReason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {b.slug && (
                      <Link to={`/blog/${b.slug}`} title="View" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                        <Eye size={15} />
                      </Link>
                    )}
                    {canEdit && (
                      <Link to={`/blog/edit/${b._id}`} title="Edit" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
                        <Edit3 size={15} />
                      </Link>
                    )}
                    <button
                      onClick={() => handleDuplicate(b)}
                      disabled={duplicatingId === b._id}
                      title="Duplicate"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
                    >
                      <Copy size={14} />
                    </button>
                    {b.status !== 'published' && (
                      <button
                        onClick={() => handleDelete(b)}
                        disabled={deletingId === b._id}
                        title={b.status === 'draft' ? 'Delete Draft' : 'Delete'}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
