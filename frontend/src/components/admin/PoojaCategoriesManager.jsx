import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search, Plus, Edit3, Trash2, X, Save, ChevronLeft, ChevronRight,
  ArrowUpDown, Loader, FolderOpen, ToggleLeft, ToggleRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import { getImageUrl } from '../../config';

const PAGE_SIZE = 12;

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'empty',    label: 'Empty Categories' },
];

const QUICK_SORTS = [
  { key: 'most-used',  label: 'Most Used',  field: 'count',   dir: 'desc' },
  { key: 'least-used', label: 'Least Used', field: 'count',   dir: 'asc'  },
  { key: 'newest',     label: 'Newest',     field: 'created', dir: 'desc' },
  { key: 'oldest',     label: 'Oldest',     field: 'created', dir: 'asc'  },
];

const SORT_FIELDS = [
  { key: 'name',    label: 'Alphabetical' },
  { key: 'count',   label: 'Pooja Count' },
  { key: 'created', label: 'Created Date' },
  { key: 'updated', label: 'Updated Date' },
  { key: 'status',  label: 'Status' },
];

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const then = new Date(dateStr).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day !== 1 ? 's' : ''} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month !== 1 ? 's' : ''} ago`;
  const year = Math.floor(month / 12);
  return `${year} year${year !== 1 ? 's' : ''} ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PoojaCategoriesManager() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortField, setSortField] = useState('created');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', category }
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/poojas/admin/categories');
      setCategories(data.categories || []);
    } catch {
      toast.error('Failed to load categories');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived: search -> filter -> sort -> paginate ──────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = categories.filter((c) =>
      !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
    );
    if (filterStatus === 'active')   list = list.filter((c) => c.isActive);
    if (filterStatus === 'inactive') list = list.filter((c) => !c.isActive);
    if (filterStatus === 'empty')    list = list.filter((c) => (c.poojaCount || 0) === 0);
    return list;
  }, [categories, search, filterStatus]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case 'name':    return dir * a.name.localeCompare(b.name);
        case 'count':   return dir * ((a.poojaCount || 0) - (b.poojaCount || 0));
        case 'updated': return dir * (new Date(a.updatedAt) - new Date(b.updatedAt));
        case 'status':  return dir * ((a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1);
        case 'created':
        default:        return dir * (new Date(a.createdAt) - new Date(b.createdAt));
      }
    });
    return list;
  }, [filtered, sortField, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pages);
  const paged = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filterStatus, sortField, sortDir]);

  const applyQuickSort = (q) => { setSortField(q.field); setSortDir(q.dir); };

  // ── Optimistic mutation helpers ────────────────────────────────
  const upsertLocal = (cat) => setCategories((prev) => {
    const idx = prev.findIndex((c) => c._id === cat._id);
    if (idx === -1) return [...prev, cat];
    const next = [...prev]; next[idx] = { ...next[idx], ...cat }; return next;
  });
  const removeLocal = (id) => setCategories((prev) => prev.filter((c) => c._id !== id));

  // ── CRUD ────────────────────────────────────────────────────────
  const handleSave = async (form, imageFile) => {
    setSaving(true);
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('description', form.description || '');
    fd.append('icon', form.icon || '🕉️');
    if (modal.mode === 'edit') fd.append('isActive', String(form.isActive));
    if (imageFile) fd.append('image', imageFile);

    try {
      if (modal.mode === 'create') {
        const { data } = await API.post('/poojas/categories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        upsertLocal({ ...data.category, poojaCount: 0, activePoojaCount: 0, inactivePoojaCount: 0, featuredPoojaCount: 0 });
        toast.success('Category created');
      } else {
        const { data } = await API.patch(`/poojas/categories/${modal.category._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        upsertLocal(data.category);
        toast.success('Category updated');
      }
      setModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleToggle = async (cat) => {
    const before = cat.isActive;
    upsertLocal({ ...cat, isActive: !before }); // optimistic
    try {
      const { data } = await API.patch(`/poojas/admin/categories/${cat._id}/status`);
      upsertLocal(data.category);
    } catch (err) {
      upsertLocal({ ...cat, isActive: before }); // rollback
      toast.error(err.response?.data?.message || 'Toggle failed');
    }
  };

  const handleDelete = async (cat, mode, targetCategoryId) => {
    try {
      const { data } = await API.delete(`/poojas/categories/${cat._id}`, { data: mode ? { mode, targetCategoryId } : undefined });
      removeLocal(cat._id);
      setDeleteTarget(null);
      toast.success(data.message || 'Category deleted');
    } catch (err) {
      const resp = err.response?.data;
      if (resp?.requiresMode) {
        // Backend confirms linked poojas exist — keep dialog open showing the 3-way choice
        setDeleteTarget((d) => ({ ...d, linkedCount: resp.linkedCount, requiresMode: true }));
      } else {
        toast.error(resp?.message || 'Delete failed');
      }
    }
  };

  const openView = async (cat) => {
    setViewTarget({ loading: true, name: cat.name });
    try {
      const { data } = await API.get(`/poojas/admin/categories/${cat._id}`);
      setViewTarget(data.category);
    } catch {
      toast.error('Failed to load details');
      setViewTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 text-sm w-64" placeholder="Search categories..." value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${filterStatus === f.key ? 'bg-saffron-500 text-white' : 'bg-white border text-gray-500 hover:border-saffron-300'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {QUICK_SORTS.map((q) => (
            <button key={q.key} onClick={() => applyQuickSort(q)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${sortField === q.field && sortDir === q.dir ? 'bg-gray-800 text-white' : 'bg-white border text-gray-500 hover:border-gray-300'}`}>
              {q.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={sortField} onChange={(e) => setSortField(e.target.value)} className="input-std text-xs py-1.5">
            {SORT_FIELDS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            className="p-1.5 rounded-lg border text-gray-500 hover:border-saffron-300 transition-colors">
            <ArrowUpDown size={14} className={sortDir === 'asc' ? '' : 'rotate-180'} />
          </button>
          <button onClick={() => setModal({ mode: 'create', category: {} })}
            className="btn-primary flex items-center gap-1.5 text-sm whitespace-nowrap">
            <Plus size={15} />Add Category
          </button>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-40 animate-pulse space-y-3">
              <div className="w-10 h-10 rounded-full bg-gray-100 mx-auto" />
              <div className="h-3 bg-gray-100 rounded w-3/4 mx-auto" />
              <div className="h-2 bg-gray-100 rounded w-1/2 mx-auto" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        categories.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <FolderOpen size={48} className="mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-700">No Categories Yet</h3>
            <p className="text-sm text-gray-400 mt-1 mb-4">Create your first category to organize poojas.</p>
            <button onClick={() => setModal({ mode: 'create', category: {} })} className="btn-primary inline-flex items-center gap-1.5 text-sm">
              <Plus size={15} />Add Category
            </button>
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Search size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">No categories match your search or filter.</p>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {paged.map((c) => (
              <CategoryCard key={c._id} category={c}
                onEdit={() => setModal({ mode: 'edit', category: c })}
                onDelete={() => setDeleteTarget({ ...c, linkedCount: null, requiresMode: false })}
                onToggle={() => handleToggle(c)}
                onView={() => openView(c)}
              />
            ))}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-400">{sorted.length} categories · Page {pageSafe} of {pages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe === 1}
                  className="p-1.5 rounded-lg border text-gray-500 disabled:opacity-40"><ChevronLeft size={14} /></button>
                <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={pageSafe === pages}
                  className="p-1.5 rounded-lg border text-gray-500 disabled:opacity-40"><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </>
      )}

      {modal && (
        <CategoryModal mode={modal.mode} initial={modal.category} saving={saving}
          onSave={handleSave} onClose={() => setModal(null)} />
      )}
      {deleteTarget && (
        <DeleteDialog target={deleteTarget} categories={categories}
          onConfirm={(mode, targetCategoryId) => handleDelete(deleteTarget, mode, targetCategoryId)}
          onClose={() => setDeleteTarget(null)} />
      )}
      {viewTarget && (
        <DetailsModal target={viewTarget} onClose={() => setViewTarget(null)} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Category Card
// ═════════════════════════════════════════════════════════════════
function CategoryCard({ category: c, onEdit, onDelete, onToggle, onView }) {
  return (
    <div className="group relative bg-white rounded-xl p-4 border border-saffron-100 text-center hover:shadow-md transition-shadow">
      <button onClick={onView} className="w-full text-left">
        {c.image
          ? <img src={getImageUrl(c.image)} className="w-12 h-12 mx-auto rounded-full object-cover mb-2" alt="" />
          : <div className="w-12 h-12 mx-auto rounded-full bg-saffron-50 flex items-center justify-center text-2xl mb-2">{c.icon || '🕉️'}</div>}
        <p className="font-semibold text-sm text-gray-800 truncate">{c.name}</p>
        {c.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{c.description}</p>}
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {c.isActive ? 'Active' : 'Inactive'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-saffron-50 text-saffron-700 font-medium">
            {c.poojaCount || 0} Pooja{c.poojaCount === 1 ? '' : 's'}
          </span>
        </div>
        <p className="text-[11px] text-gray-300 mt-2">Updated {timeAgo(c.updatedAt)}</p>
      </button>

      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Edit" className="p-1.5 bg-white/90 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg shadow-sm transition-colors">
          <Edit3 size={13} />
        </button>
        <button onClick={onToggle} title={c.isActive ? 'Deactivate' : 'Activate'}
          className="p-1.5 bg-white/90 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg shadow-sm transition-colors">
          {c.isActive ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        </button>
        <button onClick={onDelete} title="Delete" className="p-1.5 bg-white/90 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shadow-sm transition-colors">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Create/Edit Modal
// ═════════════════════════════════════════════════════════════════
function CategoryModal({ mode, initial, saving, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    description: initial.description || '',
    icon: initial.icon || '🕉️',
    isActive: initial.isActive !== false,
  });
  const [imageFile, setImageFile] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Category name is required'); return; }
    onSave(form, imageFile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{mode === 'create' ? 'Add Category' : 'Edit Category'}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label">Name *</label>
            <input required maxLength={100} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">Icon (emoji)</label>
            <input maxLength={4} className="input w-20 text-center text-lg" value={form.icon} onChange={(e) => set('icon', e.target.value)} />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea rows={3} maxLength={500} className="input resize-none" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div>
            <label className="label">Category Image</label>
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} className="text-sm" />
          </div>
          {mode === 'edit' && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => set('isActive', !form.isActive)}>
                {form.isActive ? <ToggleRight size={30} className="text-green-500" /> : <ToggleLeft size={30} className="text-gray-300" />}
              </button>
              <span className="text-sm text-gray-600">{form.isActive ? 'Active' : 'Inactive'}</span>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold text-gray-500">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-60">
              {saving ? <Loader size={15} className="animate-spin" /> : <Save size={15} />}
              {mode === 'create' ? 'Create' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// Delete confirmation (0 poojas = simple; N poojas = 3-way choice)
// ═════════════════════════════════════════════════════════════════
function DeleteDialog({ target, categories, onConfirm, onClose }) {
  const [mode, setMode] = useState('category-only');
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const linkedCount = target.linkedCount ?? target.poojaCount ?? 0;
  const needsChoice = target.requiresMode || linkedCount > 0;
  const otherCategories = categories.filter((c) => c._id !== target._id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Delete Category?</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {needsChoice ? (
            <>
              <p className="text-sm text-gray-600">
                <strong>{target.name}</strong> currently contains <strong>{linkedCount}</strong> pooja{linkedCount === 1 ? '' : 's'}. Choose how to proceed:
              </p>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="mode" checked={mode === 'move'} onChange={() => setMode('move')} className="mt-1" />
                  <span>Move all poojas to another category</span>
                </label>
                {mode === 'move' && (
                  <select className="input-std text-sm w-full" value={targetCategoryId} onChange={(e) => setTargetCategoryId(e.target.value)}>
                    <option value="">— select target category —</option>
                    {otherCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                )}
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="mode" checked={mode === 'category-only'} onChange={() => setMode('category-only')} className="mt-1" />
                  <span>Delete category only (poojas become uncategorized)</span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="mode" checked={mode === 'cascade'} onChange={() => setMode('cascade')} className="mt-1" />
                  <span>Delete category and all linked poojas <span className="text-gray-400">(poojas with existing bookings are deactivated, not deleted)</span></span>
                </label>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">Delete <strong>{target.name}</strong>? This category has no linked poojas.</p>
          )}
        </div>
        <div className="flex gap-3 justify-end p-5 pt-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold text-gray-500">Cancel</button>
          <button
            onClick={() => onConfirm(needsChoice ? mode : undefined, mode === 'move' ? targetCategoryId : undefined)}
            disabled={needsChoice && mode === 'move' && !targetCategoryId}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// View Details
// ═════════════════════════════════════════════════════════════════
function DetailsModal({ target, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{target.name || 'Category Details'}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        {target.loading ? (
          <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-saffron-500" /></div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="text-center">
              {target.image
                ? <img src={getImageUrl(target.image)} className="w-16 h-16 mx-auto rounded-full object-cover" alt="" />
                : <div className="w-16 h-16 mx-auto rounded-full bg-saffron-50 flex items-center justify-center text-3xl">{target.icon || '🕉️'}</div>}
            </div>
            {target.description && <p className="text-sm text-gray-600 text-center">{target.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-800">{target.poojaCount || 0}</div>
                <div className="text-xs text-gray-400">Total Poojas</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-800">{target.featuredPoojaCount || 0}</div>
                <div className="text-xs text-gray-400">Featured</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-green-600">{target.activePoojaCount || 0}</div>
                <div className="text-xs text-gray-400">Active</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-400">{target.inactivePoojaCount || 0}</div>
                <div className="text-xs text-gray-400">Inactive</div>
              </div>
            </div>
            <div className="text-xs text-gray-400 space-y-1 pt-2 border-t border-gray-100">
              <p>Created by {target.createdBy?.name || 'Admin'} on {formatDate(target.createdAt)}</p>
              <p>Last updated {formatDate(target.updatedAt)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
