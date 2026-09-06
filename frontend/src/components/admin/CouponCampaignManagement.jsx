import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Loader, Play, Ban, Eye, RefreshCw,
  Tag, ListChecks, AlertTriangle,
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

const STATUS_META = {
  DRAFT:     { label: 'Draft',     color: '#6b7280', bg: '#f3f4f6' },
  SCHEDULED: { label: 'Scheduled', color: '#ca8a04', bg: '#fefce8' },
  RUNNING:   { label: 'Running',   color: '#2563eb', bg: '#eff6ff' },
  COMPLETED: { label: 'Completed', color: '#059669', bg: '#ecfdf5' },
  CANCELLED: { label: 'Cancelled', color: '#dc2626', bg: '#fee2e2' },
  FAILED:    { label: 'Failed',    color: '#dc2626', bg: '#fee2e2' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Create Campaign Modal ───────────────────────────────────────────────────
function CreateModal({ onClose, onSaved }) {
  const [coupons, setCoupons] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [form, setForm] = useState({
    name: '', couponId: '', mappingId: '', channel: 'whatsapp',
    scheduledAt: '', description: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, m] = await Promise.all([
          API.get('/admin/coupons?limit=500'),
          API.get('/admin/notifications/mappings?eventName=CAMPAIGN_COUPON&channel=whatsapp&limit=500'),
        ]);
        const activeCoupons = (c.data.coupons || []).filter((x) => x.isActive);
        const eligible = (m.data.mappings || []).filter(
          (x) => x.purpose === 'MARKETING' && x.recipientType === 'user' && x.enabled
        );
        setCoupons(activeCoupons);
        setMappings(eligible);
      } catch (e) {
        toast.error('Could not load coupons/mappings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Campaign name is required'); return; }
    if (!form.couponId) { toast.error('Select a coupon'); return; }
    if (!form.mappingId) { toast.error('Select a MARKETING WhatsApp template mapping'); return; }
    setSaving(true);
    try {
      await API.post('/admin/campaigns', {
        name: form.name.trim(),
        couponId: form.couponId,
        mappingId: form.mappingId,
        channel: form.channel,
        scheduledAt: form.scheduledAt || null,
        description: form.description,
      });
      toast.success('Campaign created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Create Coupon Campaign</h3>
        {loading ? <LoadingSpinner /> : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Campaign Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Dussehra 2026 Offer"
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Coupon *</label>
              <select value={form.couponId} onChange={(e) => setForm(f => ({ ...f, couponId: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400">
                <option value="">Select coupon</option>
                {coupons.map((c) => (
                  <option key={c._id} value={c._id}>{c.code} — {c.discountType} {c.discountValue}</option>
                ))}
              </select>
              {coupons.length === 0 && <p className="text-xs text-amber-600 mt-1">No active coupons. Create one under Coupons first.</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp Template (MARKETING mapping) *</label>
              <select value={form.mappingId} onChange={(e) => setForm(f => ({ ...f, mappingId: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400">
                <option value="">Select mapping</option>
                {mappings.map((m) => (
                  <option key={m._id} value={m._id}>{m.label || m.whatsappTemplateName} ({m.whatsappTemplateName})</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Must reference the coupon in its template (e.g. {"{{coupon.code}}"}). Configurable under Notification Engine.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Channel</label>
                <select value={form.channel} disabled
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 bg-gray-50 outline-none">
                  <option value="whatsapp">WhatsApp (marketing opt-in)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Schedule (optional)</label>
                <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Description (internal)</label>
              <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400"
                placeholder="Why is this campaign running?" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: '#1B1F3B' }}>
                {saving && <Loader size={14} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Recipients Modal ────────────────────────────────────────────────────────
function RecipientsModal({ campaign, onClose }) {
  const [recipients, setRecipients] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r, d] = await Promise.all([
          API.get(`/admin/campaigns/${campaign._id}/recipients?limit=100`),
          API.get(`/admin/campaigns/${campaign._id}`),
        ]);
        setRecipients(r.data.recipients || []);
        setSummary(d.data.recipientSummary || {});
      } catch (e) {
        toast.error('Could not load recipients');
      } finally {
        setLoading(false);
      }
    })();
  }, [campaign._id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Recipients — {campaign.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Delivery outcomes per recipient (sample)</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {['delivered', 'skipped', 'failed', 'enqueued', 'pending'].map((k) => (
            <div key={k} className="rounded-xl border p-3 text-center">
              <p className="text-xl font-bold text-gray-800">{summary[k] || 0}</p>
              <p className="text-xs text-gray-500 capitalize">{k}</p>
            </div>
          ))}
        </div>
        <div className="p-4">
          {loading ? <LoadingSpinner /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase">
                  <th className="pb-2">User</th><th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recipients.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-gray-400">No recipients yet</td></tr>}
                {recipients.map((r) => (
                  <tr key={r._id} className="border-t">
                    <td className="py-2">
                      <div className="font-medium text-gray-700">{r.userId?.name || '—'}</div>
                      <div className="text-xs text-gray-400">{r.userId?.phone || ''}</div>
                    </td>
                    <td className="py-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function CouponCampaignManagement() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [viewRecipients, setViewRecipients] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await API.get(`/admin/campaigns${params}`);
      setCampaigns(data.campaigns || []);
    } catch (e) {
      toast.error('Could not load campaigns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id, action) => {
    try {
      if (action === 'start') {
        await API.post(`/admin/campaigns/${id}/start`);
        toast.success('Campaign started');
      } else if (action === 'continue') {
        await API.post(`/admin/campaigns/${id}/continue`);
        toast.success('Enqueue continued');
      } else if (action === 'cancel') {
        if (!window.confirm('Cancel this campaign? Queued messages will be stopped.')) return;
        await API.post(`/admin/campaigns/${id}/cancel`, { reason: 'cancelled by admin' });
        toast.success('Campaign cancelled');
      } else if (action === 'preview') {
        const { data } = await API.post(`/admin/campaigns/${id}/preview`);
        const s = data.samples?.[0];
        toast(
          (t) => (
            <div className="text-left">
              <p className="font-semibold mb-1">Audience: {data.totalAudience} users</p>
              {s && <p className="text-xs text-gray-600">Sample → {s.recipient?.name} ({s.recipient?.phone})</p>}
              <p className="text-xs mt-1 text-gray-500">Template: {data.mapping?.whatsappTemplateName || '—'}</p>
            </div>
          ),
          { duration: 4000 }
        );
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
            Coupon Campaigns
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Broadcast coupons to WhatsApp-marketing-opted-in users via the Notification Engine (MARKETING consent gate stays active).
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: '#1B1F3B' }}>
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Info banner */}
      <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
        <p className="text-xs text-gray-600">
          Email is intentionally disabled for campaigns until a genuine email marketing consent policy exists.
          WhatsApp messages only reach users who have explicitly opted in to marketing, and each recipient's
          consent is re-checked at send time. In-app/push are future work.
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-saffron-400">
          <option value="">All statuses</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <button onClick={load} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50" title="Refresh">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* List */}
      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          {campaigns.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No campaigns yet. Create your first coupon campaign.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Coupon</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Audience</th>
                    <th className="px-4 py-3">Delivered</th>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c._id} className="border-t hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{c.name}</div>
                        <div className="text-xs text-gray-400">by {c.createdBy?.name || 'system'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-orange-50 text-orange-700">
                          <Tag size={12} /> {c.couponId?.code || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-gray-700">{c.totalAudience ?? 0}</td>
                      <td className="px-4 py-3 text-gray-700">{c.deliveredCount ?? 0}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(c.scheduledAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button title="Preview audience" onClick={() => handleAction(c._id, 'preview')}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Eye size={14} /></button>
                          {(['DRAFT', 'SCHEDULED'].includes(c.status)) && (
                            <button title="Start / send now" onClick={() => handleAction(c._id, 'start')}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-green-600"><Play size={14} /></button>
                          )}
                          {c.status === 'RUNNING' && (
                            <button title="Continue enqueue" onClick={() => handleAction(c._id, 'continue')}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-blue-600"><RefreshCw size={14} /></button>
                          )}
                          {!['COMPLETED', 'CANCELLED'].includes(c.status) && (
                            <button title="Cancel campaign" onClick={() => handleAction(c._id, 'cancel')}
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-red-500"><Ban size={14} /></button>
                          )}
                          <button title="Recipients" onClick={() => setViewRecipients(c)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><ListChecks size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSaved={load} />}
      {viewRecipients && <RecipientsModal campaign={viewRecipients} onClose={() => setViewRecipients(null)} />}
    </div>
  );
}
