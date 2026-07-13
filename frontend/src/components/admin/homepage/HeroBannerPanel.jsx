import React, { useEffect, useState } from 'react';
import { Upload, Trash2, ArrowUp, ArrowDown, ImageOff } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';
import { getImageUrl } from '../../../config';
import { ZutsavLoaderInline } from '../../shared/ZutsavLoader';

export default function HeroBannerPanel() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ altText: '', linkUrl: '' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    API.get('/hero-banners/admin')
      .then(({ data }) => setBanners(data.banners || []))
      .catch(() => toast.error('Could not load hero banners'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const upload = async () => {
    if (!file) { toast.error('Choose an image first'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('image', file);
    fd.append('altText', form.altText);
    fd.append('linkUrl', form.linkUrl);
    try {
      await API.post('/hero-banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Banner uploaded');
      setForm({ altText: '', linkUrl: '' });
      setFile(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const toggleActive = async (b) => {
    setBusyId(b._id);
    try {
      await API.patch(`/hero-banners/${b._id}`, { isActive: !b.isActive });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally { setBusyId(null); }
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete banner "${b.altText || 'untitled'}"? This cannot be undone.`)) return;
    setBusyId(b._id);
    try {
      await API.delete(`/hero-banners/${b._id}`);
      toast.success('Banner deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally { setBusyId(null); }
  };

  const move = async (index, direction) => {
    const newOrder = [...banners];
    const target = index + direction;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setBanners(newOrder);
    try {
      await API.patch('/hero-banners/reorder', { order: newOrder.map((b) => b._id) });
    } catch (err) {
      toast.error('Reorder failed');
      load();
    }
  };

  if (loading) return <ZutsavLoaderInline />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Add Hero Banner</h2>
          <p className="text-xs text-gray-400 mt-0.5">Shown as a slide in the homepage hero. Falls back to the default visual when no banners are active.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="label">Banner Image</label>
            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => setFile(e.target.files[0])} className="text-sm" />
            <p className="text-xs text-gray-400 mt-1">JPG, PNG, or WEBP · Max 5 MB</p>
          </div>
          <div>
            <label className="label">Alt Text</label>
            <input className="input" value={form.altText} onChange={(e) => setForm((f) => ({ ...f, altText: e.target.value }))} placeholder="e.g. Griha Pravesh havan ceremony" />
          </div>
          <div>
            <label className="label">Link URL (optional)</label>
            <input className="input" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="/poojas or https://..." />
          </div>
          <button type="button" onClick={upload} disabled={uploading} className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-60">
            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload Banner'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Current Banners ({banners.length})</h2>
        </div>
        {banners.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">
            <ImageOff size={28} className="mx-auto mb-2" />
            No banners yet — the homepage hero shows its default visual.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {banners.map((b, i) => (
              <li key={b._id} className="px-6 py-4 flex items-center gap-4">
                <img src={getImageUrl(b.image)} alt={b.altText || ''} className="w-24 h-16 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{b.altText || <span className="text-gray-400">No alt text</span>}</p>
                  <p className="text-xs text-gray-400 truncate">{b.linkUrl || 'No link'}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === banners.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Move down">
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(b)}
                    disabled={busyId === b._id}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${b.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {b.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button type="button" onClick={() => remove(b)} disabled={busyId === b._id} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" aria-label="Delete banner">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
