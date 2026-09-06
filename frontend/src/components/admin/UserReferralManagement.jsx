import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Gift, Clock, CheckCircle, XCircle, Settings, Search,
  RefreshCw, Loader, ChevronDown, Eye, ToggleLeft, ToggleRight,
  Coins, AlertTriangle, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../api/axios';
import { useTranslation } from 'react-i18next';

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader size={24} className="animate-spin text-saffron-500" />
    </div>
  );
}

// ── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/admin/user-referrals/overview')
      .then(({ data }) => setOverview(data.overview))
      .catch(() => toast.error('Could not load overview'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!overview) return <p className="text-gray-400 text-center py-8">No data available</p>;

  const cards = [
    { label: 'Total Codes', value: overview.totalCodes, icon: Gift, bg: 'bg-blue-50', ic: 'text-blue-600' },
    { label: 'Available', value: overview.availableCodes, icon: Clock, bg: 'bg-green-50', ic: 'text-green-600' },
    { label: 'Used', value: overview.usedCodes, icon: CheckCircle, bg: 'bg-amber-50', ic: 'text-amber-600' },
    { label: 'Expired', value: overview.expiredCodes, icon: XCircle, bg: 'bg-red-50', ic: 'text-red-600' },
    { label: 'Referred Users', value: overview.uniqueReferredUsers, icon: Users, bg: 'bg-purple-50', ic: 'text-purple-600' },
    { label: 'Reg. Reward Coins', value: overview.registrationRewardCoins, icon: Coins, bg: 'bg-saffron-50', ic: 'text-saffron-600' },
    { label: 'Booking Reward Coins', value: overview.bookingRewardCoins, icon: Coins, bg: 'bg-indigo-50', ic: 'text-indigo-600' },
    { label: 'Pending Rewards', value: overview.pendingRewards, icon: Clock, bg: 'bg-orange-50', ic: 'text-orange-600' },
    { label: 'Approved Rewards', value: overview.approvedRewards, icon: CheckCircle, bg: 'bg-green-50', ic: 'text-green-600' },
    { label: 'Denied Rewards', value: overview.deniedRewards, icon: XCircle, bg: 'bg-red-50', ic: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map(({ label, value, icon: Icon, bg, ic }) => (
        <div key={label} className={`${bg} rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm`}>
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0">
            <Icon size={18} className={ic} />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Referral Codes Tab ──────────────────────────────────────────────────────
function CodesTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: '20' });
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    API.get(`/admin/user-referrals/codes?${params}`)
      .then(({ data }) => {
        setCodes(data.codes);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error('Could not load referral codes'))
      .finally(() => setLoading(false));
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  const statusColors = {
    AVAILABLE: 'bg-green-100 text-green-700',
    USED: 'bg-blue-100 text-blue-700',
    EXPIRED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-saffron-400">
            <option value="">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="USED">Used</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by code, user name, email, phone…"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-saffron-400"
          />
          <button onClick={handleSearch} className="p-2 bg-gray-100 rounded-xl hover:bg-gray-200">
            <Search size={16} className="text-gray-500" />
          </button>
        </div>
        <span className="text-xs text-gray-400">{total} total</span>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Referrer</th>
                  <th className="px-4 py-3 font-semibold">Referred User</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Expires</th>
                  <th className="px-4 py-3 font-semibold">Used At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {codes.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No referral codes found</td></tr>
                )}
                {codes.map((c) => (
                  <tr key={c._id} className="hover:bg-saffron-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold">{c.code}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{c.referrerName}</p>
                      <p className="text-xs text-gray-400">{c.referrerEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      {c.referredUserName ? (
                        <>
                          <p className="text-gray-800">{c.referredUserName}</p>
                          <p className="text-xs text-gray-400">{c.referredUserEmail}</p>
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${c.isExpired ? 'bg-red-100 text-red-700' : statusColors[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.isExpired ? 'Expired' : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.usedAt ? new Date(c.usedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
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
    </div>
  );
}

// ── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    API.get('/admin/user-referrals/settings')
      .then(({ data }) => setForm(data.settings))
      .catch(() => toast.error('Could not load settings'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await API.patch('/admin/user-referrals/settings', form);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
      <h3 className="text-lg font-bold text-gray-800 mb-6">User Referral Settings</h3>

      <div className="space-y-5">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div>
            <p className="font-semibold text-gray-800 text-sm">User Referral System</p>
            <p className="text-xs text-gray-500 mt-0.5">Enable or disable the user referral program</p>
          </div>
          <button onClick={() => setForm(f => ({ ...f, userReferralEnabled: !f.userReferralEnabled }))}
            className={`relative w-12 h-7 rounded-full transition-colors ${form.userReferralEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${form.userReferralEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* Validity */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Default Referral Validity (days)</label>
          <input type="number" min="1" value={form.userReferralDefaultValidityDays || 30}
            onChange={(e) => setForm(f => ({ ...f, userReferralDefaultValidityDays: Number(e.target.value) }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
          <p className="text-xs text-gray-400 mt-1">How long each generated referral code remains valid</p>
        </div>

        {/* Daily limit */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Daily Referral Generation Limit</label>
          <input type="number" min="1" value={form.userReferralDailyLimit || 5}
            onChange={(e) => setForm(f => ({ ...f, userReferralDailyLimit: Number(e.target.value) }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
          <p className="text-xs text-gray-400 mt-1">Max referral codes a user can generate per day</p>
        </div>

        {/* Registration reward */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Registration Reward (coins)</label>
          <input type="number" min="0" value={form.userReferralRegistrationRewardCoins || 10}
            onChange={(e) => setForm(f => ({ ...f, userReferralRegistrationRewardCoins: Number(e.target.value) }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
          <p className="text-xs text-gray-400 mt-1">Coins credited to referrer when referred user registers</p>
        </div>

        {/* Booking reward */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Booking Reward (coins)</label>
          <input type="number" min="0" value={form.userReferralBookingRewardCoins || 50}
            onChange={(e) => setForm(f => ({ ...f, userReferralBookingRewardCoins: Number(e.target.value) }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
          <p className="text-xs text-gray-400 mt-1">Coins auto-credited to referrer when a referred user's qualifying Pooja/Kit booking is completed</p>
        </div>

        {/* Max rewarded bookings per referred user */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Max Rewarded Bookings Per Referred User</label>
          <input type="number" min="0" value={form.maxRewardedBookingsPerReferredUser ?? 5}
            onChange={(e) => setForm(f => ({ ...f, maxRewardedBookingsPerReferredUser: Number(e.target.value) }))}
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-saffron-400" />
          <p className="text-xs text-gray-400 mt-1">Max qualifying completed bookings per referred user that generate a reward for the referrer. Set to 0 to disable booking rewards (registration reward is unaffected).</p>
        </div>

        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-saffron-500 text-white rounded-xl font-semibold text-sm hover:bg-saffron-600 disabled:opacity-50 transition-colors">
          {saving ? <Loader size={14} className="animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// ── Booking Rewards Tab ─────────────────────────────────────────────────────
function BookingRewardsTab() {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('PENDING');
  const [actionNote, setActionNote] = useState('');
  const [actingId, setActingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: '20' });
    if (status) params.set('status', status);
    API.get(`/admin/booking-rewards?${params}`)
      .then(({ data }) => {
        setRewards(data.rewards);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      })
      .catch(() => toast.error('Could not load booking rewards'))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this booking reward? Coins will be credited to the referrer.')) return;
    setActingId(id);
    try {
      await API.patch(`/admin/booking-rewards/${id}/approve`, { note: actionNote });
      toast.success('Reward approved and coins credited!');
      setActionNote('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed');
    } finally {
      setActingId(null);
    }
  };

  const handleDeny = async (id) => {
    const note = window.prompt('Reason for denying this reward (optional):');
    if (note === null) return; // user cancelled
    setActingId(id);
    try {
      await API.patch(`/admin/booking-rewards/${id}/deny`, { note });
      toast.success('Reward denied');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Denial failed');
    } finally {
      setActingId(null);
    }
  };

  const statusColors = {
    PENDING: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-green-100 text-green-700',
    DENIED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        {['PENDING', 'APPROVED', 'DENIED', ''].map((s) => (
          <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${status === s ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'}`}>
            {s || 'All'}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{total} total</span>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                  <th className="px-4 py-3 font-semibold">Referrer</th>
                  <th className="px-4 py-3 font-semibold">Referred User</th>
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rewards.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No booking rewards found</td></tr>
                )}
                {rewards.map((r) => (
                  <tr key={r._id} className="hover:bg-saffron-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{r.userId?.name || '—'}</p>
                      <p className="text-xs text-gray-400">{r.userId?.phone || r.userId?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{r.referredUserId?.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700 font-mono text-xs">{r.bookingId?.bookingNumber || '—'}</p>
                      <p className="text-xs text-gray-400">{r.bookingId?.scheduledDate?.split('T')[0] || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-saffron-600">{r.rewardAmount} coins</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColors[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleApprove(r._id)} disabled={actingId === r._id}
                            className="px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 disabled:opacity-50 font-medium">
                            {actingId === r._id ? '…' : 'Approve'}
                          </button>
                          <button onClick={() => handleDeny(r._id)} disabled={actingId === r._id}
                            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-100 disabled:opacity-50 font-medium">
                            Deny
                          </button>
                        </div>
                      )}
                      {r.status === 'APPROVED' && (
                        <span className="text-xs text-green-600">
                          {r.coinsCredited ? `+${r.rewardAmount} credited` : 'Approved'}
                        </span>
                      )}
                      {r.status === 'DENIED' && r.adminNote && (
                        <span className="text-xs text-gray-400 italic" title={r.adminNote}>
                          {r.adminNote.length > 30 ? r.adminNote.slice(0, 30) + '…' : r.adminNote}
                        </span>
                      )}
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
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function UserReferralManagement() {
  const [subTab, setSubTab] = useState('overview');

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Eye },
    { key: 'codes', label: 'Referral Codes', icon: Gift },
    { key: 'rewards', label: 'Booking Rewards', icon: CheckCircle },
    { key: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">User Referral Management</h2>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              subTab === key ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-saffron-300'
            }`}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'overview' && <OverviewTab />}
      {subTab === 'codes' && <CodesTab />}
      {subTab === 'rewards' && <BookingRewardsTab />}
      {subTab === 'settings' && <SettingsTab />}
    </div>
  );
}
