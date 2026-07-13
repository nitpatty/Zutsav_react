import React, { useEffect, useState } from 'react';
import { Plus, CheckCircle, Clock, XCircle, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { getImageUrl } from '../config';

const STATUS_BADGE = {
  pending:  'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};
const STATUS_ICON = {
  pending:  <Clock size={13} className="text-yellow-500" />,
  approved: <CheckCircle size={13} className="text-green-500" />,
  rejected: <XCircle size={13} className="text-red-500" />,
};

const fmtINR = (n) => `₹${(+(n || 0)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function RequestForm({ categories, onSave, onCancel, loading }) {
  const [form, setForm] = useState({
    poojaName: '', categoryId: '', description: '', shortDesc: '',
    expectedPrice: '', estimatedDuration: '', estimatedDurationUnit: 'hours',
    requirements: '', benefits: '', languages: '',
  });
  const [image, setImage] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.poojaName || !form.categoryId) {
      toast.error('Pooja name and category are required');
      return;
    }
    const price = Number(form.expectedPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Expected Price must be a number greater than zero');
      return;
    }
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    if (image) fd.append('image', image);
    onSave(fd);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Pooja Name *</label>
          <input className="input" placeholder="e.g. Mahamrityunjaya Jaap" value={form.poojaName} onChange={set('poojaName')} />
        </div>
        <div>
          <label className="label">Category *</label>
          <select className="input" value={form.categoryId} onChange={set('categoryId')}>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Short Description</label>
        <input className="input" placeholder="One-line summary" value={form.shortDesc} onChange={set('shortDesc')} />
      </div>

      <div>
        <label className="label">Full Description</label>
        <textarea className="input min-h-[80px] resize-none text-sm" value={form.description} onChange={set('description')} placeholder="Detailed pooja description..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Expected Price (₹) *</label>
          <input type="number" min="0.01" step="0.01" className="input" value={form.expectedPrice} onChange={set('expectedPrice')} placeholder="e.g. 3000" />
          <p className="text-xs text-gray-400 mt-1">What you believe is a fair service charge. Admin sets the final price.</p>
        </div>
        <div>
          <label className="label">Estimated Duration *</label>
          <div className="flex gap-2">
            <input
              type="number" min="1" max="30"
              className="input w-24"
              placeholder="e.g. 2"
              value={form.estimatedDuration}
              onChange={set('estimatedDuration')}
            />
            <select className="input flex-1" value={form.estimatedDurationUnit} onChange={set('estimatedDurationUnit')}>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Requirements <span className="text-gray-400 text-xs">(comma-separated)</span></label>
          <input className="input text-sm" placeholder="Flowers, Ghee, ..." value={form.requirements} onChange={set('requirements')} />
        </div>
        <div>
          <label className="label">Benefits <span className="text-gray-400 text-xs">(comma-separated)</span></label>
          <input className="input text-sm" placeholder="Peace, Prosperity, ..." value={form.benefits} onChange={set('benefits')} />
        </div>
        <div>
          <label className="label">Languages <span className="text-gray-400 text-xs">(comma-separated)</span></label>
          <input className="input text-sm" placeholder="Hindi, Sanskrit, ..." value={form.languages} onChange={set('languages')} />
        </div>
      </div>

      <div>
        <label className="label">Pooja Image</label>
        <input type="file" accept="image/*" className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-saffron-50 file:text-saffron-700"
          onChange={(e) => setImage(e.target.files[0])} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5">
          {loading ? 'Submitting...' : 'Submit for Approval'}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline flex-1 py-2.5">Cancel</button>
      </div>

      <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100">
        Your request will be reviewed by admin. It becomes bookable only after approval, at the admin-approved price.
      </p>
    </form>
  );
}

export default function PanditMyPoojas() {
  const [requests,   setRequests]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [view,       setView]       = useState('list'); // 'list' | 'create'

  const loadRequests = () => {
    API.get('/pandit/pooja-requests').then(({ data }) => setRequests(data.requests)).catch(() => toast.error('Failed to load requests')).finally(() => setLoading(false));
  };

  useEffect(() => {
    API.get('/poojas/categories').then(({ data }) => setCategories(data.categories));
    loadRequests();
  }, []);

  const handleCreate = async (fd) => {
    ['requirements', 'benefits', 'languages'].forEach((k) => {
      const val = fd.get(k);
      if (val) fd.set(k, JSON.stringify(val.split(',').map((s) => s.trim()).filter(Boolean)));
    });
    setSaving(true);
    try {
      await API.post('/pandit/pooja-requests', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Pooja request submitted for approval');
      setView('list');
      loadRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  if (view === 'create') return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-sm text-saffron-600 hover:underline">← Back</button>
        <h1 className="text-xl font-bold text-gray-800">Request New Pooja</h1>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <RequestForm categories={categories} onSave={handleCreate} onCancel={() => setView('list')} loading={saving} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Requested Poojas</h1>
          <p className="text-sm text-gray-500 mt-1">Track your custom pooja submissions and their approval status.</p>
        </div>
        <button onClick={() => setView('create')} className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5">
          <Plus size={16} /> Request New Pooja
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-gray-100" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <span className="text-5xl block mb-3">🪔</span>
          <p className="text-gray-500">No pooja requests yet. Request your first custom pooja to get started.</p>
          <button onClick={() => setView('create')} className="btn-primary mt-4 px-6 py-2 text-sm">
            Request New Pooja
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r._id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4 shadow-sm">
              {r.image
                ? <img src={getImageUrl(r.image)} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                : <div className="w-16 h-16 rounded-xl bg-saffron-50 flex items-center justify-center shrink-0 text-2xl">🪔</div>
              }
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-gray-800">{r.poojaName}</h3>
                  <span className={`flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.status]}`}>
                    {STATUS_ICON[r.status]}
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{r.categoryId?.name} · Submitted {fmtDate(r.createdAt)}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><IndianRupee size={11} /> Expected {fmtINR(r.expectedPrice)}</span>
                  {r.status === 'approved' && (
                    <span className="flex items-center gap-1 text-green-700 font-medium"><IndianRupee size={11} /> Approved {fmtINR(r.adminApprovedPrice)}</span>
                  )}
                </div>
                {r.status === 'approved' && r.reviewedByName && (
                  <p className="text-xs text-gray-400 mt-0.5">Approved by {r.reviewedByName} on {fmtDate(r.reviewedAt)}</p>
                )}
                {r.status === 'rejected' && r.rejectionReason && (
                  <p className="text-xs text-red-600 mt-1">Reason: {r.rejectionReason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
