import React, { useState, useEffect, useCallback } from 'react';
import {
  Tag, Plus, Search, Loader, CheckCircle, XCircle, Edit3,
  ToggleLeft, ToggleRight, Trash2, Eye, Percent,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader size={24} className="animate-spin text-saffron-500" />
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Coupon Form Modal ───────────────────────────────────────────────────────
const APPLICABILITY_OPTIONS = [
  { value: 'POOJA', label: 'Pooja' },
  { value: 'PRODUCTS', label: 'Products' },
  { value: 'KITS', label: 'Kits' },
  { value: 'MARKETPLACE', label: 'Marketplace' },
];

function CouponFormModal({ coupon, onClose, onSave }) {
  const [form, setForm] = useState({
    code: coupon?.code || '',
    discountType: coupon?.discountType || 'FIXED',
    discountValue: coupon?.discountValue || '',
    minCartValue: coupon?.minCartValue || 0,
    maxDiscount: coupon?.maxDiscount ?? '',
    validFrom: coupon?.validFrom ? new Date(coupon.validFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    expiresAt: coupon?.expiresAt ? new Date(coupon.expiresAt).toISOString().split('T')[0] : '',
    usageLimit: coupon?.usageLimit ?? '',
    perUserLimit: coupon?.perUserLimit ?? '',
    applicability: coupon?.applicability || ['POOJA'],
  });
  const [saving, setSaving] = useState(false);

  const isEdit = !!coupon;
  const isPercentage = form.discountType === 'PERCENTAGE';

  const toggleApplicability = (val) => {
    setForm((f) => {
      const has = f.applicability.includes(val);
      const next = has
        ? f.applicability.filter((a) => a !== val)
        : [...f.applicability, val];
      return { ...f, applicability: next };
    });
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('Coupon code is required'); return; }
    if (!form.discountValue || Number(form.discountValue) <= 0) { toast.error('Discount value must be positive'); return; }
    if (isPercentage) {
      const pct = Number(form.discountValue);
      if (pct <= 0 || pct > 100) { toast.error('Percentage must be between 1 and 100'); return; }
      if (form.maxDiscount !== '' && Number(form.maxDiscount) < 0) { toast.error('Max discount must be non-negative'); return; }
    }
    if (form.formErr) { toast.error(form.formErr); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minCartValue: Number(form.minCartValue),
        maxDiscount: !isPercentage ? null : (form.maxDiscount !== '' ? Number(form.maxDiscount) : null),
        usageLimit: form.usageLimit !== '' ? Number(form.usageLimit) : null,
        perUserLimit: form.perUserLimit !== '' ? Number(form.perUserLimit) : null,
        expiresAt: form.expiresAt || null,
      };

      if (isEdit) {
        await API.patch(`/admin/coupons/${coupon._id}`, payload);
        toast.success('Coupon updated');
      } else {
        await API.post('/admin/coupons', payload);
        toast.success('Coupon created');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{isEdit ? 'Edit Coupon' : 'Create Coupon'}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Coupon Code *</label>
            <input type="text" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              disabled={isEdit} placeholder="e.g. PUJA10"
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400 uppercase disabled:bg-gray-50" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Discount Type</label>
              <select value={form.discountType} onChange={(e) => setForm(f => ({ ...f, discountType: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400">
                <option value="FIXED">Fixed (₹)</option>
                <option value="PERCENTAGE">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {isPercentage ? 'Discount Percentage (%) *' : 'Discount Value (₹) *'}
              </label>
              <input type="number" min="1" max={isPercentage ? 100 : undefined}
                value={form.discountValue} onChange={(e) => setForm(f => ({ ...f, discountValue: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
            </div>
          </div>

          {isPercentage && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max Discount (₹)</label>
                <input type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm(f => ({ ...f, maxDiscount: e.target.value }))}
                  placeholder="No limit" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Min Cart Value (₹)</label>
                <input type="number" min="0" value={form.minCartValue} onChange={(e) => setForm(f => ({ ...f, minCartValue: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
              </div>
            </div>
          )}

          {!isPercentage && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Min Cart Value (₹)</label>
                <input type="number" min="0" value={form.minCartValue} onChange={(e) => setForm(f => ({ ...f, minCartValue: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max Discount (₹)</label>
                <input type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm(f => ({ ...f, maxDiscount: e.target.value }))}
                  disabled placeholder="N/A for fixed" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400 bg-gray-50 text-gray-400" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Valid From</label>
              <input type="date" value={form.validFrom} onChange={(e) => setForm(f => ({ ...f, validFrom: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Expires At</label>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                placeholder="No expiry" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Global Usage Limit</label>
              <input type="number" min="0" value={form.usageLimit} onChange={(e) => setForm(f => ({ ...f, usageLimit: e.target.value }))}
                placeholder="Unlimited" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Per-User Limit</label>
              <input type="number" min="0" value={form.perUserLimit} onChange={(e) => setForm(f => ({ ...f, perUserLimit: e.target.value }))}
                placeholder="Unlimited" className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Applicability</label>
            <div className="flex flex-wrap gap-2">
              {APPLICABILITY_OPTIONS.map((opt) => {
                const selected = form.applicability.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleApplicability(opt.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                      selected
                        ? 'bg-saffron-500 text-white border-saffron-500'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {selected ? '✓ ' : ''}{opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-saffron-500 hover:bg-saffron-600 disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Update Coupon' : 'Create Coupon'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Coupon List Tab ─────────────────────────────────────────────────────────
function CouponListTab({ onRefresh }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editCoupon, setEditCoupon] = useState(null);
  const [viewRedemptions, setViewRedemptions] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: '20' });
    if (search) params.set('search', search);
    API.get(`/admin/coupons?${params}`)
      .then(({ data }) => {
        setCoupons(data.coupons);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error('Could not load coupons'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  const toggleActive = async (coupon) => {
    try {
      await API.patch(`/admin/coupons/${coupon._id}/toggle`);
      toast.success(`Coupon ${coupon.isActive ? 'deactivated' : 'activated'}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Toggle failed');
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? ${coupon.usageCount > 0 ? 'This will deactivate it since it has existing redemptions.' : ''}`)) return;
    try {
      await API.delete(`/admin/coupons/${coupon._id}`);
      toast.success('Coupon deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const isExpired = (c) => c.expiresAt && new Date(c.expiresAt) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by coupon code…"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-saffron-400" />
          <button onClick={handleSearch} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200">
            <Search size={16} className="text-gray-500" />
          </button>
        </div>
        <button onClick={() => { setEditCoupon(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-saffron-500 text-white rounded-xl text-sm font-semibold hover:bg-saffron-600">
          <Plus size={15} /> Create Coupon
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Discount</th>
                  <th className="px-4 py-3 font-semibold">Min Cart</th>
                  <th className="px-4 py-3 font-semibold">Applicability</th>
                  <th className="px-4 py-3 font-semibold">Validity</th>
                  <th className="px-4 py-3 font-semibold">Usage</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">No coupons found</td></tr>
                )}
                {coupons.map((c) => (
                  <tr key={c._id} className="hover:bg-saffron-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold">{c.code}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-saffron-600">
                      {c.discountType === 'FIXED'
                        ? `₹${c.discountValue}`
                        : `${c.discountValue}%${c.maxDiscount != null ? ` (Max ₹${c.maxDiscount})` : ''}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">₹{c.minCartValue}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.applicability?.map((a) => (
                          <span key={a} className="px-2 py-0.5 bg-saffron-50 text-saffron-700 text-[10px] font-semibold rounded-full border border-saffron-200">
                            {a}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmtDate(c.validFrom)} — {c.expiresAt ? fmtDate(c.expiresAt) : 'No expiry'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.usageCount || 0}{c.usageLimit ? ` / ${c.usageLimit}` : ''}
                      {c.perUserLimit ? ` (per user: ${c.perUserLimit})` : ''}
                    </td>
                    <td className="px-4 py-3">
                      {isExpired(c) ? (
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-red-100 text-red-700">Expired</span>
                      ) : c.isActive ? (
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700">Active</span>
                      ) : (
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-600">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditCoupon(c); setShowForm(true); }}
                          className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50" title="Edit">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => toggleActive(c)}
                          className={`p-1.5 rounded-lg ${c.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
                          title={c.isActive ? 'Deactivate' : 'Activate'}>
                          {c.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button onClick={() => setViewRedemptions(c)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" title="View Redemptions">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => handleDelete(c)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">← Prev</button>
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <CouponFormModal
          coupon={editCoupon}
          onClose={() => { setShowForm(false); setEditCoupon(null); }}
          onSave={() => { setShowForm(false); setEditCoupon(null); load(); }}
        />
      )}

      {/* Redemptions modal */}
      {viewRedemptions && (
        <RedemptionsModal coupon={viewRedemptions} onClose={() => setViewRedemptions(null)} />
      )}
    </div>
  );
}

// ── Redemptions Modal ───────────────────────────────────────────────────────
function RedemptionsModal({ coupon, onClose }) {
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    API.get(`/admin/coupons/${coupon._id}/redemptions?page=${page}&limit=20`)
      .then(({ data }) => {
        setRedemptions(data.redemptions);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error('Could not load redemptions'))
      .finally(() => setLoading(false));
  }, [coupon._id, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            Redemptions for <span className="font-mono">{coupon.code}</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            {redemptions.length === 0 ? (
              <p className="text-center py-8 text-gray-400">No redemptions yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="px-3 py-2 font-semibold">User</th>
                    <th className="px-3 py-2 font-semibold">Booking</th>
                    <th className="px-3 py-2 font-semibold">Discount</th>
                    <th className="px-3 py-2 font-semibold">Cart Value</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {redemptions.map((r) => (
                    <tr key={r._id}>
                      <td className="px-3 py-2">
                        <p className="text-gray-800">{r.userId?.name || '—'}</p>
                        <p className="text-xs text-gray-400">{r.userId?.phone}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.bookingId?.bookingNumber || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-saffron-600">₹{r.discountApplied}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">₹{r.cartValue}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.redeemedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">← Prev</button>
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40">Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function CouponManagement() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Coupon Management</h2>
      <CouponListTab />
    </div>
  );
}
