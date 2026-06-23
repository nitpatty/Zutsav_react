import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, BookOpen, IndianRupee, Clock, CheckCircle, XCircle, Plus, User, LayoutDashboard, CalendarDays, ShoppingBag, MapPin, Tv, Package, Star, Trash2, Gift, Sparkles, Percent, Tag, Mail, ClipboardList, Truck, ChevronDown, RotateCcw, Search, Settings, CreditCard, MessageSquare, Cpu, Image, Shield, Save, Eye, EyeOff, Upload, AlertTriangle, ShieldCheck, FileText, Loader, X, BadgeCheck, Phone, Globe, Edit3, ToggleLeft, ToggleRight } from 'lucide-react';
import CommunicationCenter from '../components/admin/CommunicationCenter';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ProfilePhoto from '../components/shared/ProfilePhoto';
import MapPicker, { forwardGeocode } from '../components/shared/MapPicker';
import PincodeInput from '../components/shared/PincodeInput';


const statusColor  = { pending_payment:'badge-pending', paid:'badge-paid', pandit_assigned:'badge-assigned', pandit_accepted:'badge-approved', pending_reassignment:'badge-rejected', completion_requested:'badge-pending', completed:'badge-approved', cancelled:'badge-rejected' };
const statusLabel  = { pending_payment:'Pending Payment', paid:'Paid', pandit_assigned:'Pandit Assigned', pandit_accepted:'Pandit Accepted', pending_reassignment:'Needs Reassignment', completion_requested:'Completion Pending', completed:'Completed', cancelled:'Cancelled', with_kit:'With Kit' };
const kitStatusColor = { pending:'bg-gray-100 text-gray-600', packed:'bg-blue-100 text-blue-700', shipped:'bg-amber-100 text-amber-700', out_for_delivery:'bg-orange-100 text-orange-700', delivered:'bg-green-100 text-green-700' };
const kitStatusLabel = { pending:'Pending', packed:'Packed', shipped:'Shipped', out_for_delivery:'Out for Delivery', delivered:'Delivered' };
const panditStatus = { pending:'badge-pending', under_review:'badge-paid', approved:'badge-approved', rejected:'badge-rejected', suspended:'badge-rejected', reupload_required:'badge-pending' };

export default function AdminDashboard() {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'dashboard';

  return (
    <div className="p-4 md:p-6">
      {tab === 'dashboard'     && <DashboardTab />}
      {tab === 'bookings'      && <BookingsTab />}
      {tab === 'pandits'       && <PanditsTab />}
      {tab === 'pandit-poojas' && <PanditPoojasTab />}
      {tab === 'users'         && <UsersTab />}
      {tab === 'poojas'        && <PoojasTab />}
      {tab === 'marketplace'   && <MarketplaceTab />}
      {tab === 'orders'        && <OrdersTab />}
      {tab === 'festivals'              && <FestivalsTab />}
      {tab === 'education-masters'     && <EducationMastersTab />}
      {tab === 'specialization-masters'&& <SpecializationMastersTab />}
      {tab === 'temples'               && <TemplesTab />}
      {tab === 'livestreams'           && <LivestreamsTab />}
      {tab === 'referrals'             && <ReferralStatsTab />}
      {tab === 'comm-center'           && <CommunicationCenter />}
      {tab === 'system-settings'       && <SystemSettingsTab />}
      {tab === 'payouts'               && <PayoutsTab />}
      {tab === 'profile'               && <AdminProfile user={user} refreshUser={refreshUser} />}
    </div>
  );
}

// ─── Dashboard Stats ─────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    API.get('/admin/dashboard').then(({ data }) => { setStats(data.stats); setRecent(data.recentBookings); });
  }, []);

  if (!stats) return <LoadingSpinner />;

  const cards = [
    { label: 'Total Users',      value: stats.totalUsers,    icon: Users,          bgStyle: { background: '#eef0f8' }, iconStyle: { color: '#1B1F3B' } },
    { label: 'Active Pandits',   value: stats.totalPandits,  icon: Users,          bgStyle: { background: '#ecfdf5' }, iconStyle: { color: '#059669' } },
    { label: 'Pending KYC',      value: stats.pendingPandits,icon: Clock,          bgStyle: { background: '#fefce8' }, iconStyle: { color: '#ca8a04' } },
    { label: 'Total Bookings',   value: stats.totalBookings, icon: BookOpen,       bgStyle: { background: '#f5f3ff' }, iconStyle: { color: '#7c3aed' } },
    { label: 'Total Orders',     value: stats.totalOrders || 0, icon: Package,     bgStyle: { background: 'rgba(249,115,22,0.1)' }, iconStyle: { color: '#ea580c' } },
    { label: 'Pending Orders',   value: stats.pendingOrders || 0, icon: Clock,     bgStyle: { background: '#fefce8' }, iconStyle: { color: '#d97706' } },
    { label: 'Low Stock Items',  value: stats.lowStockProducts || 0, icon: XCircle, bgStyle: { background: '#fef2f2' }, iconStyle: { color: '#dc2626' } },
    { label: 'Total Revenue',    value: `₹${(stats.totalRevenue||0).toLocaleString('en-IN')}`, icon: IndianRupee, bgStyle: { background: 'rgba(27,31,59,0.06)' }, iconStyle: { color: '#1B1F3B' } },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"', letterSpacing: '-0.01em' }}>Dashboard Overview</h1>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg font-mono">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, bgStyle, iconStyle }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={bgStyle}>
              <Icon size={18} style={iconStyle} />
            </div>
            <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: '"Cormorant Garamond"', letterSpacing: '-0.01em' }}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-sans">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <h2 className="font-bold text-gray-800 mb-4">Recent Paid Bookings</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs">
              <th className="pb-2.5 text-gray-400 font-semibold">Booking #</th>
              <th className="pb-2.5 text-gray-400 font-semibold">User</th>
              <th className="pb-2.5 text-gray-400 font-semibold">Pooja</th>
              <th className="pb-2.5 text-gray-400 font-semibold">Amount</th>
              <th className="pb-2.5 text-gray-400 font-semibold">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {recent.map((b) => (
                <tr key={b._id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-2.5 font-mono text-xs text-gray-400">{b.bookingNumber}</td>
                  <td className="py-2.5 font-semibold text-gray-800">{b.userId?.name}</td>
                  <td className="py-2.5 text-gray-600">{b.poojaId?.name}</td>
                  <td className="py-2.5 font-bold" style={{ color: '#D4AF37', fontFamily: '"Cormorant Garamond"', fontSize: '1rem' }}>₹{b.amount?.toLocaleString('en-IN')}</td>
                  <td className="py-2.5 text-gray-400 text-xs">{new Date(b.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Bookings Tab ─────────────────────────────────────────────
function BookingsTab() {
  const [bookings,       setBookings]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState('paid');
  const [selected,       setSelected]       = useState(null);
  const [pandits,        setPandits]        = useState([]);
  const [panditId,       setPanditId]       = useState('');
  const [assigning,      setAssigning]      = useState(false);
  const [loadingPandits,  setLoadingPandits]  = useState(false);
  const [panditFareAmount, setPanditFareAmount] = useState('');

  // Payout modal state
  const [payoutBooking,  setPayoutBooking]  = useState(null);
  const [payoutAmount,   setPayoutAmount]   = useState('');
  const [payoutNote,     setPayoutNote]     = useState('');
  const [payoutRef,      setPayoutRef]      = useState('');
  const [payoutAction,   setPayoutAction]   = useState('assign'); // 'assign' | 'paid'
  const [savingPayout,   setSavingPayout]   = useState(false);

  // Kit delivery modal state
  const [kitBooking,  setKitBooking]  = useState(null);
  const [kitForm,     setKitForm]     = useState({ status: 'pending', type: 'manual', trackingId: '', courier: '', remarks: '' });
  const [kitSaving,        setKitSaving]        = useState(false);
  const [tekipostShipping, setTekipostShipping]  = useState(false);

  const load = () => {
    setLoading(true);
    const params = filter === 'with_kit'
      ? '?withKit=true&limit=50'
      : `?status=${filter}&limit=50`;
    API.get(`/admin/bookings${params}`)
      .then(({ data }) => setBookings(data.bookings))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const openKitModal = (b) => {
    setKitBooking(b);
    setKitForm({
      status:     b.kitDelivery?.status     || 'pending',
      type:       b.kitDelivery?.type       || 'manual',
      trackingId: b.kitDelivery?.trackingId || '',
      courier:    b.kitDelivery?.courier    || '',
      remarks:    b.kitDelivery?.remarks    || '',
    });
  };

  const handleKitDelivery = async () => {
    setKitSaving(true);
    try {
      const { data } = await API.patch(`/admin/bookings/${kitBooking._id}/kit-delivery`, kitForm);
      setBookings((prev) => prev.map((b) => b._id === kitBooking._id ? data.booking : b));
      toast.success('Kit delivery updated!');
      setKitBooking(null);
    } catch {
      toast.error('Update failed');
    }
    setKitSaving(false);
  };

  const handleTekipostShip = async () => {
    if (!window.confirm('Create a Tekipost shipment for this booking? This will auto-assign a courier and generate an AWB.')) return;
    setTekipostShipping(true);
    try {
      const { data } = await API.post(`/admin/bookings/${kitBooking._id}/kit-delivery/tackipost`);
      setBookings((prev) => prev.map((b) => b._id === kitBooking._id ? data.booking : b));
      setKitBooking(data.booking);
      setKitForm(f => ({ ...f, type: 'courier', status: 'shipped', trackingId: data.trackingId, courier: data.courier }));
      toast.success(`Shipped via ${data.courier}! AWB: ${data.trackingId}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Tekipost shipment failed');
    }
    setTekipostShipping(false);
  };

  const openAssign = async (booking) => {
    setSelected(booking);
    setPanditId('');
    setPandits([]);
    setPanditFareAmount('');
    setLoadingPandits(true);
    try {
      const date      = booking.scheduledDate?.split('T')[0];
      const userCity  = booking.userDetails?.city    || '';
      const userState = booking.userDetails?.state   || '';
      const pincode   = booking.userDetails?.pincode || '';
      const poojaId   = booking.poojaId?._id || booking.poojaId || '';

      let userLat = '';
      let userLng = '';
      if (pincode) {
        try {
          const geoRes  = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
          const geoData = await geoRes.json();
          const post    = geoData?.[0]?.PostOffice?.[0];
          if (post?.Latitude && post?.Longitude &&
              !isNaN(parseFloat(post.Latitude)) && !isNaN(parseFloat(post.Longitude))) {
            userLat = post.Latitude;
            userLng = post.Longitude;
          }
        } catch { /* non-fatal; fall back to city matching */ }
      }

      const params = new URLSearchParams({ date, userCity, userState, bookingId: booking._id });
      if (userLat && userLng) { params.set('userLat', userLat); params.set('userLng', userLng); }
      if (poojaId)            { params.set('poojaId', poojaId); }

      const { data } = await API.get(`/admin/pandits/available?${params}`);
      setPandits(data.pandits);
    } catch {
      toast.error('Could not load available pandits');
    } finally {
      setLoadingPandits(false);
    }
  };

  const handleAssign = async () => {
    if (!panditId) { toast.error('Please select a pandit'); return; }
    setAssigning(true);
    try {
      const body = { panditId };
      if (panditFareAmount && !isNaN(+panditFareAmount) && +panditFareAmount > 0) {
        body.panditFareAmount = +panditFareAmount;
      }
      await API.patch(`/admin/bookings/${selected._id}/assign`, body);
      toast.success('Pandit assigned! Notification sent to pandit.');
      setSelected(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleApproveCompletion = async (bookingId) => {
    try {
      await API.patch(`/admin/bookings/${bookingId}/approve-completion`);
      toast.success('Booking marked as Completed.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not approve completion');
    }
  };

  const handleRejectCompletion = async (bookingId) => {
    const reason = window.prompt('Reason for rejecting completion (required):');
    if (!reason || !reason.trim()) return;
    try {
      await API.patch(`/admin/bookings/${bookingId}/reject-completion`, { reason: reason.trim() });
      toast.success('Completion request rejected. Pandit has been notified.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reject completion');
    }
  };

  const openPayoutAssign = (booking) => {
    setPayoutBooking(booking);
    setPayoutAmount(booking.payout?.amount || '');
    setPayoutNote('');
    setPayoutRef('');
    setPayoutAction('assign');
  };

  const openMarkPaid = (booking) => {
    setPayoutBooking(booking);
    setPayoutRef('');
    setPayoutAction('paid');
  };

  const handlePayoutSave = async () => {
    setSavingPayout(true);
    try {
      if (payoutAction === 'assign') {
        if (!payoutAmount || +payoutAmount <= 0) { toast.error('Enter a valid payout amount'); return; }
        await API.patch(`/admin/bookings/${payoutBooking._id}/assign-payout`, { amount: +payoutAmount, note: payoutNote });
        toast.success('Payout assigned.');
      } else {
        await API.patch(`/admin/bookings/${payoutBooking._id}/mark-payout-paid`, { transactionRef: payoutRef });
        toast.success('Payout marked as paid.');
      }
      setPayoutBooking(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payout action failed');
    } finally {
      setSavingPayout(false);
    }
  };

  const coverageLabel = (p) => {
    if (p.coverageType === 'radius') return `${p.coverageRadiusKm} km radius`;
    if (p.coverageType === 'city')   return `City: ${p.city || '—'}`;
    if (p.coverageType === 'district') return `District: ${p.district || '—'}`;
    if (p.coverageType === 'state') return `State: ${p.state || '—'}`;
    return 'Pan India';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Booking Management</h1>

      <div className="flex gap-2 flex-wrap">
        {['paid','pandit_assigned','pandit_accepted','pending_reassignment','completion_requested','completed','cancelled','pending_payment'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${filter === s ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'} ${s === 'pending_reassignment' && filter !== s ? 'border-red-200 text-red-600' : ''}`}>
            {statusLabel[s]}
          </button>
        ))}
        <button onClick={() => setFilter('with_kit')}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${filter === 'with_kit' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:border-amber-400'}`}>
          📦 With Kit
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                {['Booking #','User','Location','Pooja','Date/Time','Amount','Status','Pandit','Action'].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {bookings.map((b) => (
                  <tr key={b._id} className="hover:bg-saffron-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.bookingNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{b.userId?.name}</p>
                      <p className="text-xs text-gray-400">{b.userDetails?.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-600">{b.userDetails?.city || '—'}</p>
                      <p className="text-xs text-gray-400">{b.userDetails?.state || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{b.poojaId?.name}</p>
                      {b.withKit && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">📦 WITH KIT</span>
                          {b.kitDelivery?.status && b.kitDelivery.status !== 'pending' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${kitStatusColor[b.kitDelivery.status] || ''}`}>
                              {kitStatusLabel[b.kitDelivery.status]}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{b.scheduledDate?.split('T')[0]} {b.scheduledTime}</td>
                    <td className="px-4 py-3 font-bold text-saffron-600">₹{b.amount?.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3"><span className={statusColor[b.status] || 'badge-pending'}>{statusLabel[b.status]}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{b.panditId?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {b.status === 'paid' && (
                          <button onClick={() => openAssign(b)} className="bg-saffron-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-saffron-600 transition-colors whitespace-nowrap">
                            Assign Pandit
                          </button>
                        )}
                        {b.status === 'pandit_assigned' && (
                          <button onClick={() => openAssign(b)} className="bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-purple-600 transition-colors whitespace-nowrap">
                            Reassign
                          </button>
                        )}
                        {b.status === 'pending_reassignment' && (
                          <button onClick={() => openAssign(b)} className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap font-semibold">
                            Reassign Pandit
                          </button>
                        )}
                        {b.status === 'pandit_accepted' && (
                          <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-1 rounded-lg">Awaiting pooja</span>
                        )}
                        {b.status === 'completion_requested' && (
                          <div className="flex gap-1.5">
                            <button onClick={() => handleApproveCompletion(b._id)} className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap font-medium" style={{ background: '#1B1F3B', color: 'white' }}>
                              ✓ Approve
                            </button>
                            <button onClick={() => handleRejectCompletion(b._id)} className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap font-medium bg-red-100 text-red-700 hover:bg-red-200">
                              ✗ Reject
                            </button>
                          </div>
                        )}
                        {b.status === 'completed' && (!b.payout || b.payout.status === 'none') && (
                          <button onClick={() => openPayoutAssign(b)} className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap">
                            Assign Payout
                          </button>
                        )}
                        {b.status === 'completed' && b.payout?.status === 'pending' && (
                          <button onClick={() => openMarkPaid(b)} className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap">
                            Mark Payout Paid
                          </button>
                        )}
                        {b.status === 'completed' && b.payout?.status === 'completed' && (
                          <span className="text-[10px] text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-lg">Paid ₹{b.payout.amount}</span>
                        )}
                        {b.withKit && (
                          <button onClick={() => openKitModal(b)} className="bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors whitespace-nowrap">
                            📦 Kit Delivery
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bookings.length === 0 && <p className="text-center py-10 text-gray-400">No bookings found</p>}
        </div>
      )}

      {/* Location-aware assignment modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-gray-800 text-xl mb-4">
              {selected.status === 'pending_reassignment' ? 'Reassign Pandit' : 'Assign Pandit'}
            </h2>

            {/* Booking summary */}
            <div className="bg-saffron-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-700">{selected.poojaId?.name}</p>
                  <p className="text-gray-500">{selected.scheduledDate?.split('T')[0]} · {selected.scheduledTime}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">Platform price</p>
                  <p className="font-bold text-saffron-600">₹{selected.poojaId?.price?.toLocaleString('en-IN') || selected.amount?.toLocaleString('en-IN') || '—'}</p>
                </div>
              </div>
            </div>

            {/* User location info */}
            <div className="border border-blue-100 bg-blue-50 rounded-xl p-3 mb-4 text-xs">
              <p className="font-bold text-blue-700 mb-1">User Location</p>
              <p className="text-blue-800">{selected.userDetails?.name} · {selected.userDetails?.phone}</p>
              <p className="text-blue-600">{[selected.userDetails?.address, selected.userDetails?.city, selected.userDetails?.district, selected.userDetails?.state, selected.userDetails?.pincode].filter(Boolean).join(', ')}</p>
            </div>

            {/* Rejection history (shown only when reassigning after rejection) */}
            {selected.status === 'pending_reassignment' && selected.panditRejections?.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-xs">
                <p className="font-bold text-red-700 mb-2">Previously Rejected By</p>
                <div className="space-y-1.5">
                  {selected.panditRejections.map((r, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="font-semibold text-red-800 shrink-0">{r.panditName}:</span>
                      <span className="text-red-600 italic">"{r.reason}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingPandits ? (
              <div className="text-center py-6 text-gray-400 text-sm">Loading eligible pandits…</div>
            ) : pandits.length === 0 ? (
              <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl mb-4">No available pandits for this date.</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {pandits.length} pandit{pandits.length !== 1 ? 's' : ''} available · <span className="text-green-600">Green = within coverage</span> · <span className="text-red-500">Red = outside area</span>
                </p>
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {pandits.map((p) => {
                    const outOfCoverage = p.withinCoverage === false;
                    return (
                      <label
                        key={p._id}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-colors ${outOfCoverage ? 'border-red-100 bg-red-50/40 opacity-60 cursor-not-allowed' : panditId === p._id ? 'border-saffron-400 bg-saffron-50 cursor-pointer' : 'border-gray-200 hover:border-saffron-200 cursor-pointer'}`}
                      >
                        <input
                          type="radio" name="pandit" value={p._id}
                          checked={panditId === p._id}
                          onChange={() => !outOfCoverage && setPanditId(p._id)}
                          disabled={outOfCoverage}
                          className="accent-saffron-500 mt-1 shrink-0"
                        />
                        <div className="w-10 h-10 bg-saffron-100 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                          {p.profilePhoto ? <img src={`http://localhost:5000/${p.profilePhoto}`} className="w-full h-full object-cover" alt="" /> : <User size={16} className="text-saffron-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                            {p.isOnline && <span className="w-2 h-2 bg-green-500 rounded-full" title="Online" />}
                            {outOfCoverage ? (
                              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Outside area</span>
                            ) : (
                              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">In coverage</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">{p.phone || p.email || ''}</p>
                          <p className="text-[11px] text-gray-400">{p.city || '—'}{p.state ? `, ${p.state}` : ''}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {p.distanceKm !== null && (
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">{p.distanceKm} km away</span>
                            )}
                            <span className="text-[10px] text-gray-400">{coverageLabel(p)}</span>
                            {p.experience > 0 && (
                              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{p.experience}y exp</span>
                            )}
                            {p.rating > 0 && (
                              <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full">★ {p.rating.toFixed(1)} ({p.totalReviews || 0})</span>
                            )}
                            {p.totalBookings > 0 && (
                              <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded-full">{p.totalBookings} bookings</span>
                            )}
                          </div>
                          {/* Expected charges vs platform price */}
                          {(p.expectedChargesForPooja !== null && p.expectedChargesForPooja !== undefined) && (
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                                Pandit expects ₹{p.expectedChargesForPooja.toLocaleString('en-IN')}
                              </span>
                              {selected.poojaId?.price && (
                                <span className="text-[10px] font-bold text-saffron-700 bg-saffron-50 px-1.5 py-0.5 rounded-full">
                                  Platform ₹{selected.poojaId.price.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {/* Agreed fare amount (admin-only) */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                Final Agreed Fare Amount <span className="text-gray-400 font-normal normal-case">(optional — admin only, not shown to user or pandit)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">₹</span>
                <input
                  type="number" min="0"
                  className="input pl-7"
                  placeholder="Negotiated fare (leave blank to skip)"
                  value={panditFareAmount}
                  onChange={(e) => setPanditFareAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setSelected(null)} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleAssign} disabled={assigning || !panditId} className="btn-primary flex-1">
                {assigning ? 'Assigning...' : selected.status === 'pending_reassignment' ? 'Reassign & Notify Pandit' : 'Assign & Notify Pandit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout modal */}
      {payoutBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-gray-800 text-xl mb-4">
              {payoutAction === 'assign' ? 'Assign Payout' : 'Mark Payout as Paid'}
            </h2>

            {/* Booking summary */}
            <div className="bg-saffron-50 rounded-xl p-4 mb-4 text-sm space-y-1">
              <p className="font-semibold text-gray-700">#{payoutBooking.bookingNumber} · {payoutBooking.poojaId?.name}</p>
              <p className="text-gray-500">Pandit: <strong>{payoutBooking.panditId?.name || '—'}</strong></p>
              <p className="text-gray-500">Booking amount: <strong>₹{payoutBooking.amount?.toLocaleString('en-IN')}</strong></p>
              {payoutAction === 'paid' && (
                <p className="text-gray-700 font-medium">Approved payout: <strong>₹{payoutBooking.payout?.amount?.toLocaleString('en-IN')}</strong></p>
              )}
            </div>

            {/* Pandit payment details */}
            {(() => {
              const bank = payoutBooking.panditId?.bankDetails;
              const upi  = payoutBooking.panditId?.upiDetails;
              const hasBank = !!(bank?.accountNumber?.trim());
              const hasUpi  = !!(upi?.upiId?.trim());

              if (!hasBank && !hasUpi) {
                return (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                    <p className="text-sm font-bold text-red-700 mb-1">⚠ Cannot Process Payout</p>
                    <p className="text-xs text-red-600">
                      Pandit <strong>{payoutBooking.panditId?.name}</strong> has not added any bank account or UPI details.
                      Ask the pandit to update their payment information before processing this payout.
                    </p>
                  </div>
                );
              }

              return (
                <div className="border border-gray-100 rounded-xl p-4 mb-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pandit Payment Details</p>
                  {hasBank && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600">🏦 Bank Account</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {bank.accountHolderName && (
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">Account Holder</p>
                            <p className="font-semibold text-gray-800">{bank.accountHolderName}</p>
                          </div>
                        )}
                        {bank.bankName && (
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">Bank</p>
                            <p className="font-semibold text-gray-800">{bank.bankName}</p>
                          </div>
                        )}
                        {bank.accountNumber && (
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">Account Number</p>
                            <p className="font-semibold text-gray-800 font-mono">
                              {'•'.repeat(Math.max(0, bank.accountNumber.length - 4))}{bank.accountNumber.slice(-4)}
                            </p>
                          </div>
                        )}
                        {bank.ifscCode && (
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">IFSC Code</p>
                            <p className="font-semibold text-gray-800 font-mono">{bank.ifscCode}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {hasUpi && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600">📱 UPI</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-gray-400 mb-0.5">UPI ID</p>
                          <p className="font-semibold text-gray-800">{upi.upiId}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-gray-400 mb-0.5">UPI Verified</p>
                          <p className={`font-semibold ${upi.isVerified ? 'text-green-700' : 'text-orange-600'}`}>
                            {upi.isVerified ? '✓ Yes' : 'Not Verified'}
                          </p>
                        </div>
                        {upi.verifiedName && (
                          <div className="bg-gray-50 rounded-lg p-2 col-span-2">
                            <p className="text-gray-400 mb-0.5">Verified Name</p>
                            <p className="font-semibold text-gray-800">{upi.verifiedName}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-3">
              {payoutAction === 'assign' ? (
                <>
                  <div>
                    <label className="label">Payout Amount (₹) *</label>
                    <input
                      type="number" min="0" step="100"
                      className="input text-sm"
                      placeholder="e.g. 1500"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Note (optional)</label>
                    <input
                      className="input text-sm"
                      placeholder="e.g. Standard rate for this pooja"
                      value={payoutNote}
                      onChange={(e) => setPayoutNote(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="label">Transaction Reference (optional)</label>
                  <input
                    className="input text-sm"
                    placeholder="UPI ref / NEFT ref / etc."
                    value={payoutRef}
                    onChange={(e) => setPayoutRef(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setPayoutBooking(null)} className="btn-outline flex-1">Cancel</button>
              <button
                onClick={handlePayoutSave}
                disabled={savingPayout || (() => {
                  const b = payoutBooking.panditId?.bankDetails;
                  const u = payoutBooking.panditId?.upiDetails;
                  return !b?.accountNumber?.trim() && !u?.upiId?.trim();
                })()}
                className="btn-primary flex-1"
              >
                {savingPayout ? 'Saving...' : payoutAction === 'assign' ? 'Assign Payout' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kit Delivery Modal */}
      {kitBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-gray-800 text-xl mb-1">Kit Delivery Management</h2>
            <p className="text-xs text-gray-400 mb-4">Booking #{kitBooking.bookingNumber} · {kitBooking.poojaId?.name}</p>

            {/* Current kit info */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm">
              <p className="font-semibold text-amber-800 mb-1">📦 Kit: {kitBooking.kitId?.name || 'Samagri Kit'}</p>
              <p className="text-amber-700 text-xs">Delivery to: {kitBooking.userDetails?.address}, {kitBooking.userDetails?.city} - {kitBooking.userDetails?.pincode}</p>
              <p className="text-amber-700 text-xs">Pooja date: {kitBooking.scheduledDate?.split('T')[0]}</p>
              {kitBooking.kitDelivery?.trackingId && (
                <div className="mt-2 pt-2 border-t border-amber-200">
                  <p className="text-amber-800 text-xs font-semibold">Current: {kitBooking.kitDelivery.courier} · AWB: {kitBooking.kitDelivery.trackingId}</p>
                  {kitBooking.kitDelivery.labelUrl && (
                    <a href={kitBooking.kitDelivery.labelUrl} target="_blank" rel="noreferrer"
                      className="text-blue-600 text-xs underline mt-1 inline-block">
                      🖨 Print Shipping Label
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Tekipost auto-ship */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-4">
              <p className="text-indigo-800 text-xs font-semibold mb-2">🚀 Auto-Ship via Tekipost</p>
              <p className="text-indigo-600 text-xs mb-2">Automatically assign a courier, generate AWB &amp; shipping label</p>
              <button
                onClick={handleTekipostShip}
                disabled={tekipostShipping}
                className="w-full py-2 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ background: '#1B1F3B' }}
              >
                {tekipostShipping ? '⏳ Creating Shipment...' : '📦 Ship via Tekipost'}
              </button>
            </div>

            <div className="space-y-3">
              {/* Delivery type */}
              <div>
                <label className="label">Delivery Type</label>
                <select className="input text-sm" value={kitForm.type} onChange={e => setKitForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="manual">Manual (hand delivery)</option>
                  <option value="courier">Courier</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="label">Delivery Status</label>
                <select className="input text-sm" value={kitForm.status} onChange={e => setKitForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="pending">Pending (not packed yet)</option>
                  <option value="packed">Packed</option>
                  <option value="shipped">Shipped (user will be notified)</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>

              {/* Courier name */}
              {kitForm.type === 'courier' && (
                <div>
                  <label className="label">Courier Name</label>
                  <input
                    className="input text-sm"
                    placeholder="e.g. Delhivery, DTDC, Blue Dart..."
                    value={kitForm.courier}
                    onChange={e => setKitForm(f => ({ ...f, courier: e.target.value }))}
                  />
                </div>
              )}

              {/* Tracking ID */}
              {kitForm.type === 'courier' && (
                <div>
                  <label className="label">Tracking ID / AWB</label>
                  <input
                    className="input text-sm font-mono"
                    placeholder="Enter tracking number"
                    value={kitForm.trackingId}
                    onChange={e => setKitForm(f => ({ ...f, trackingId: e.target.value }))}
                  />
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="label">Remarks (optional)</label>
                <input
                  className="input text-sm"
                  placeholder="Any notes for admin reference"
                  value={kitForm.remarks}
                  onChange={e => setKitForm(f => ({ ...f, remarks: e.target.value }))}
                />
              </div>
            </div>

            {kitForm.status === 'shipped' && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                User will receive an in-app notification when you save this status.
              </div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={() => setKitBooking(null)} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleKitDelivery} disabled={kitSaving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors" style={{ background: '#D4AF37' }}>
                {kitSaving ? 'Saving...' : 'Update Kit Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pandit Profile Drawer ────────────────────────────────────
function PanditProfileDrawer({ panditId, onClose }) {
  const [pandit,   setPandit]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [prices,   setPrices]   = useState({});   // { poojaId: approvedPrice }
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    setLoading(true);
    API.get(`/admin/pandits/${panditId}`)
      .then(({ data }) => {
        setPandit(data.pandit);
        // Pre-fill editable approved prices from existing data
        const init = {};
        (data.pandit.poojaCharges || []).forEach((c) => {
          const id = typeof c.poojaId === 'object' ? c.poojaId?._id : c.poojaId;
          if (id && c.approvedPrice != null) init[id] = c.approvedPrice;
        });
        setPrices(init);
      })
      .catch(() => toast.error('Failed to load pandit profile'))
      .finally(() => setLoading(false));
  }, [panditId]);

  const saveApprovedPrices = async () => {
    const priceList = Object.entries(prices)
      .filter(([, v]) => v !== '' && v != null)
      .map(([poojaId, approvedPrice]) => ({ poojaId, approvedPrice: +approvedPrice }));
    if (priceList.length === 0) { toast.error('Enter at least one approved price'); return; }
    setSaving(true);
    try {
      await API.patch(`/admin/pandits/${panditId}/pooja-price`, { prices: priceList });
      toast.success('Approved prices saved');
      // Refresh local poojaCharges display
      const { data } = await API.get(`/admin/pandits/${panditId}`);
      setPandit(data.pandit);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const kycBadge = {
    not_submitted:    'bg-gray-100 text-gray-600',
    submitted:        'bg-blue-100 text-blue-700',
    approved:         'bg-green-100 text-green-700',
    rejected:         'bg-red-100 text-red-700',
    reupload_required:'bg-purple-100 text-purple-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50" onClick={onClose} />
      {/* Drawer panel */}
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            {pandit && (
              <>
                <h2 className="font-bold text-gray-800 text-lg truncate">{pandit.name}</h2>
                <p className="text-xs text-gray-400">{pandit.email} · {pandit.phone}</p>
              </>
            )}
            {loading && <div className="h-5 w-48 bg-gray-100 rounded-lg animate-pulse" />}
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0">
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader size={28} className="text-gray-300 animate-spin" />
          </div>
        ) : pandit ? (
          <div className="flex-1 p-6 space-y-6">
            {/* Profile card */}
            <div className="flex gap-4 items-start">
              <div className="w-16 h-16 bg-saffron-100 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center">
                {pandit.profilePhoto
                  ? <img src={`http://localhost:5000/${pandit.profilePhoto}`} className="w-full h-full object-cover" alt="" />
                  : <User size={24} className="text-saffron-400" />}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kycBadge[pandit.kycStatus || 'not_submitted']}`}>
                    KYC: {(pandit.kycStatus || 'not_submitted').replace(/_/g, ' ')}
                  </span>
                  <span className={panditStatus[pandit.status] || 'badge-pending'}>
                    {pandit.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{pandit.bio || <span className="text-gray-300 italic">No bio</span>}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                  <span className="flex items-center gap-1"><Star size={11} /> {pandit.rating?.toFixed(1) || '0.0'} ({pandit.totalReviews || 0} reviews)</span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {pandit.experience || 0} yrs exp</span>
                  {pandit.city && <span className="flex items-center gap-1"><MapPin size={11} /> {pandit.city}, {pandit.state}</span>}
                </div>
              </div>
            </div>

            {/* Personal Info */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Personal Info</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Father Name', pandit.fatherName],
                  ['Gender',      pandit.gender],
                  ['DOB',         pandit.dob ? new Date(pandit.dob).toLocaleDateString('en-IN') : null],
                  ['City',        pandit.city],
                  ['State',       pandit.state],
                  ['Pincode',     pandit.pincode],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="font-medium text-gray-700 capitalize">{val}</p>
                  </div>
                ) : null)}
              </div>
              {pandit.languages?.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Languages</p>
                  <div className="flex flex-wrap gap-1">
                    {pandit.languages.map((l) => (
                      <span key={l} className="bg-white border border-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {pandit.specializations?.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Specializations</p>
                  <div className="flex flex-wrap gap-1">
                    {pandit.specializations.map((s, i) => (
                      <span key={i} className="bg-saffron-50 text-saffron-700 text-xs px-2 py-0.5 rounded-full border border-saffron-200">
                        {s.name}{s.yearsOfExperience > 0 ? ` (${s.yearsOfExperience}y)` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Service Coverage</p>
                <p className="text-sm text-gray-700 capitalize">
                  {pandit.serviceCoverage?.type?.replace(/_/g, ' ') || 'city'}
                  {pandit.serviceCoverage?.type === 'radius' && ` (${pandit.serviceCoverage.radiusKm} km)`}
                </p>
              </div>
            </div>

            {/* Pooja Services & Pricing */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pooja Services & Pricing</p>
                <span className="text-xs text-gray-400">{pandit.selectedPoojas?.length || 0} poojas selected</span>
              </div>

              {(!pandit.selectedPoojas || pandit.selectedPoojas.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-4">No poojas selected by this pandit</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 text-[10px] text-gray-400 uppercase tracking-wide">
                      <span>Pooja</span>
                      <span className="w-20 text-right">Expected ₹</span>
                      <span className="w-28 text-right">Approved Price</span>
                      <span className="w-16 text-center">Status</span>
                    </div>
                    {pandit.selectedPoojas.map((pooja) => {
                      const poojaId = typeof pooja === 'object' ? pooja._id : pooja;
                      const poojaName = typeof pooja === 'object' ? pooja.name : poojaId;
                      const charge = (pandit.poojaCharges || []).find(
                        (c) => (typeof c.poojaId === 'object' ? c.poojaId?._id : c.poojaId)?.toString() === poojaId?.toString()
                      );
                      const isApproved = charge?.priceApprovalStatus === 'approved';
                      return (
                        <div key={poojaId} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center bg-white rounded-xl px-3 py-2.5 border border-gray-100">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{poojaName}</p>
                            {typeof pooja === 'object' && pooja.categoryId?.name && (
                              <p className="text-[10px] text-gray-400">{pooja.categoryId.name}</p>
                            )}
                          </div>
                          <div className="w-20 text-right text-sm text-gray-600 font-medium">
                            {charge?.expectedCharges > 0 ? `₹${charge.expectedCharges}` : <span className="text-gray-300">—</span>}
                          </div>
                          <div className="w-28 flex items-center gap-1">
                            <span className="text-xs text-gray-500">₹</span>
                            <input
                              type="number" min="0" step="100"
                              className="input text-sm text-right py-1 px-2 w-full"
                              placeholder="Set price"
                              value={prices[poojaId] ?? ''}
                              onChange={(e) => setPrices((p) => ({ ...p, [poojaId]: e.target.value }))}
                            />
                          </div>
                          <div className="w-16 flex justify-center">
                            {isApproved ? (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                                <BadgeCheck size={10} /> Set
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Pending</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={saveApprovedPrices} disabled={saving}
                    className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm">
                    <Save size={14} /> {saving ? 'Saving...' : 'Save Approved Prices'}
                  </button>
                </>
              )}
            </div>

            {/* KYC Documents */}
            {pandit.kycFrontImage && (
              <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">KYC Documents</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ['Front', pandit.kycFrontImage],
                    ['Back',  pandit.kycBackImage],
                    ['Selfie',pandit.kycSelfieImage],
                    ['Address Proof', pandit.kycAddressProof],
                  ].map(([label, url]) => url ? (
                    <a key={label} href={`http://localhost:5000/${url}`} target="_blank" rel="noopener noreferrer"
                      className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-2 hover:border-saffron-300 transition-colors">
                      <FileText size={14} className="text-saffron-500 shrink-0" />
                      <span className="text-xs text-gray-600">{label}</span>
                    </a>
                  ) : null)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Profile not found</div>
        )}
      </div>
    </div>
  );
}

// ─── Pandits / KYC Tab ────────────────────────────────────────
const KYC_FILTER_TABS = [
  { key: 'submitted',          label: 'Pending Review',   color: 'bg-blue-500 text-white' },
  { key: 'approved',           label: 'KYC Approved',     color: 'bg-green-500 text-white' },
  { key: 'rejected',           label: 'KYC Rejected',     color: 'bg-red-500 text-white' },
  { key: 'reupload_required',  label: 'Re-upload',        color: 'bg-purple-500 text-white' },
  { key: 'not_submitted',      label: 'Not Submitted',    color: 'bg-gray-500 text-white' },
  { key: '',                   label: 'All',              color: 'bg-gray-800 text-white' },
];

const KYC_BADGE_COLORS = {
  not_submitted:    'bg-gray-100 text-gray-600',
  submitted:        'bg-blue-100 text-blue-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-700',
  reupload_required:'bg-purple-100 text-purple-700',
};

function calcAdminCompletion(p) {
  const checks = [
    !!p.profilePhoto, !!p.fatherName, !!p.gender, !!p.dob, !!p.bio, !!p.address,
    (p.languages?.length > 0), (p.qualifications?.length > 0),
    (p.specializations?.length > 0), (p.selectedPoojas?.length > 0),
    !!(p.bankDetails?.accountNumber || p.upiDetails?.upiId),
    !!(p.kycStatus && p.kycStatus !== 'not_submitted'),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function PanditsTab() {
  const [pandits,       setPandits]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [kycFilter,     setKycFilter]     = useState('submitted');
  const [expanded,      setExpanded]      = useState(null);
  const [search,        setSearch]        = useState('');
  const [profileDrawer, setProfileDrawer] = useState(null); // panditId

  // KYC action modal state
  const [modal,         setModal]         = useState(null); // { panditId, action: 'reject'|'reupload' }
  const [reason,        setReason]        = useState('');
  const [submitting,    setSubmitting]    = useState(false);

  // Delete modal state
  const [deleteModal,   setDeleteModal]   = useState(null); // { panditId, panditName }
  const [deleting,      setDeleting]      = useState(false);

  const load = () => {
    setLoading(true);
    const qs = kycFilter ? `kycStatus=${kycFilter}&limit=50` : 'limit=50';
    API.get(`/admin/pandits?${qs}`)
      .then(({ data }) => setPandits(data.pandits || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [kycFilter]);

  const filteredPandits = search.trim()
    ? pandits.filter((p) => {
        const q = search.toLowerCase();
        return p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.phone?.includes(q) || p.city?.toLowerCase().includes(q);
      })
    : pandits;

  const kycAction = async (id, action, actionReason) => {
    try {
      await API.patch(`/admin/pandits/${id}/kyc`, { kycAction: action, reason: actionReason });
      toast.success(`KYC ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'reupload requested'}`);
      setModal(null); setReason('');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleApprove = (id) => kycAction(id, 'approve', '');

  const handleRejectOrReupload = async () => {
    if (!reason.trim() || reason.trim().length < 5) { toast.error('Please provide a reason (min 5 characters)'); return; }
    setSubmitting(true);
    await kycAction(modal.panditId, modal.action, reason.trim());
    setSubmitting(false);
  };

  const legacyStatusUpdate = async (id, status) => {
    let adminNote = '';
    if (status === 'suspended') adminNote = window.prompt('Suspension reason (optional):') || '';
    try {
      await API.patch(`/admin/pandits/${id}/approve`, { status, adminNote });
      toast.success(`Status updated to ${status.replace(/_/g, ' ')}`);
      load();
    } catch { toast.error('Failed'); }
  };

  const handleDeletePandit = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await API.delete(`/admin/pandits/${deleteModal.panditId}`);
      toast.success(`Pandit "${deleteModal.panditName}" deleted permanently`);
      setDeleteModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const REJECT_REASONS = [
    'Invalid document', 'Unreadable / blurry image', 'Mismatch in details',
    'Duplicate submission', 'Expired document', 'Other',
  ];

  return (
    <div className="space-y-4">
      {profileDrawer && (
        <PanditProfileDrawer panditId={profileDrawer} onClose={() => setProfileDrawer(null)} />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Pandit Directory</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-8 py-1.5 text-sm w-52" placeholder="Search name, city, phone..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={load} className="text-xs text-gray-400 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
            <RotateCcw size={12} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {KYC_FILTER_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setKycFilter(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${kycFilter === key ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-4">
          {filteredPandits.map((p) => {
            const completion = calcAdminCompletion(p);
            const kycStatus  = p.kycStatus || 'not_submitted';
            const isExpanded = expanded === p._id;

            return (
              <div key={p._id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Header row */}
                <div className="p-5 flex flex-col sm:flex-row items-start gap-4">
                  <div className="w-14 h-14 bg-saffron-100 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                    {p.profilePhoto
                      ? <img src={`http://localhost:5000/${p.profilePhoto}`} className="w-full h-full object-cover" alt="" />
                      : <User size={22} className="text-saffron-400" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-800">{p.name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${KYC_BADGE_COLORS[kycStatus]}`}>
                        KYC: {kycStatus.replace(/_/g, ' ')}
                      </span>
                      <span className={panditStatus[p.status] || 'badge-pending'}>
                        {p.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{p.email} · {p.phone}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {p.govtIdType ? p.govtIdType.toUpperCase() : 'No ID'} ·
                      {' '}{p.experience || 0} yrs exp ·
                      {' '}{p.city ? `${p.city}, ${p.state}` : p.state || '—'}
                    </p>
                    {/* Profile completion bar */}
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${completion}%`, background: completion >= 70 ? '#22c55e' : '#D4AF37' }} />
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{completion}% profile</span>
                    </div>
                    {p.kycRejectionReason && (
                      <p className="text-xs text-red-600 mt-1">Rejection reason: {p.kycRejectionReason}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Joined: {new Date(p.createdAt).toLocaleDateString('en-IN')}
                      {p.kycSubmittedAt && ` · KYC submitted: ${new Date(p.kycSubmittedAt).toLocaleDateString('en-IN')}`}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap shrink-0 items-start">
                    <button onClick={() => setProfileDrawer(p._id)}
                      className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1">
                      <User size={12} /> View Profile
                    </button>
                    <button onClick={() => setExpanded(isExpanded ? null : p._id)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg flex items-center gap-1">
                      <FileText size={12} /> {isExpanded ? 'Hide' : 'View Docs'}
                    </button>
                    {kycStatus === 'submitted' && (
                      <>
                        <button onClick={() => handleApprove(p._id)}
                          className="flex items-center gap-1 text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600">
                          <ShieldCheck size={13} /> Approve KYC
                        </button>
                        <button onClick={() => { setModal({ panditId: p._id, action: 'reupload' }); setReason(''); }}
                          className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-200">
                          <Upload size={13} /> Req. Re-upload
                        </button>
                        <button onClick={() => { setModal({ panditId: p._id, action: 'reject' }); setReason(''); }}
                          className="flex items-center gap-1 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600">
                          <XCircle size={13} /> Reject KYC
                        </button>
                      </>
                    )}
                    {(kycStatus === 'rejected' || kycStatus === 'reupload_required') && (
                      <span className="text-xs text-gray-400 px-3 py-1.5">Waiting for re-submission</span>
                    )}
                    {p.status !== 'suspended' && (
                      <button onClick={() => legacyStatusUpdate(p._id, 'suspended')}
                        className="flex items-center gap-1 text-xs bg-orange-100 text-orange-600 px-3 py-1.5 rounded-lg hover:bg-orange-200">
                        Suspend
                      </button>
                    )}
                    {p.status === 'suspended' && (
                      <button onClick={() => legacyStatusUpdate(p._id, 'approved')}
                        className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200">
                        Unsuspend
                      </button>
                    )}
                    <button onClick={() => setDeleteModal({ panditId: p._id, panditName: p.name })}
                      className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>

                {/* Expanded KYC documents */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">KYC Documents</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        ['Front Image',           p.kycFrontImage],
                        ['Back Image',            p.kycBackImage],
                        ['Selfie',                p.kycSelfieImage],
                        ['Address Proof',         p.kycAddressProof],
                        ['Legacy Govt ID',        p.govtIdImage],
                      ].map(([label, url]) => (
                        <div key={label} className="bg-white rounded-xl border border-gray-100 p-3">
                          <p className="text-[10px] text-gray-400 mb-1.5">{label}</p>
                          {url ? (
                            <a href={`http://localhost:5000/${url}`} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-saffron-600 hover:underline flex items-center gap-1">
                              <FileText size={12} /> View
                            </a>
                          ) : <p className="text-[10px] text-gray-300">Not uploaded</p>}
                        </div>
                      ))}
                      <div className="bg-white rounded-xl border border-gray-100 p-3">
                        <p className="text-[10px] text-gray-400 mb-1.5">ID Type</p>
                        <p className="text-xs font-semibold capitalize">{p.govtIdType || '—'}</p>
                        {p.govtIdNumber && <p className="text-[10px] text-gray-500 mt-0.5">{p.govtIdNumber}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredPandits.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
              <ShieldCheck size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">{search ? 'No pandits match your search' : 'No pandits in this category'}</p>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">Delete Pandit Account</h3>
            <p className="text-sm text-gray-500 mb-1">
              This action will permanently remove the pandit account and related profile records.
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-4">"{deleteModal.panditName}"</p>
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-5">
              Active booking assignments will be released. Completed bookings are preserved for audit.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal(null)} disabled={deleting}
                className="btn-outline flex-1 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDeletePandit} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject / Reupload modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-800 text-lg mb-1">
              {modal.action === 'reject' ? 'Reject KYC' : 'Request Re-upload'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              {modal.action === 'reject'
                ? 'The pandit will be notified with your reason and asked to re-submit.'
                : 'The pandit will be asked to re-upload specific documents.'}
            </p>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick reasons</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {REJECT_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${reason === r ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {r}
                </button>
              ))}
            </div>

            <label className="label">Reason * <span className="text-gray-400 font-normal">(min 5 characters)</span></label>
            <textarea className="input min-h-[80px] resize-none text-sm mb-4"
              placeholder="Describe the issue…"
              value={reason} onChange={(e) => setReason(e.target.value)} />

            <div className="flex gap-3">
              <button onClick={() => { setModal(null); setReason(''); }} className="btn-outline flex-1">
                Cancel
              </button>
              <button onClick={handleRejectOrReupload} disabled={submitting || reason.trim().length < 5}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors ${modal.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {submitting ? 'Submitting…' : (modal.action === 'reject' ? 'Confirm Rejection' : 'Request Re-upload')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────
function UsersTab() {
  const [userView,   setUserView]   = useState('all'); // 'all' | 'deletion_pending'
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [delUserModal, setDelUserModal] = useState(null); // { userId, userName }
  const [deletingUser, setDeletingUser] = useState(false);

  const loadUsers = () => {
    setLoading(true);
    const qs = userView === 'deletion_pending'
      ? `accountStatus=deletion_pending&limit=50`
      : `search=${search}&limit=50`;
    API.get(`/admin/users?${qs}`)
      .then(({ data }) => setUsers(data.users || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (userView === 'deletion_pending') { loadUsers(); return; }
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
  }, [search, userView]);

  const handleDeleteUser = async () => {
    if (!delUserModal) return;
    setDeletingUser(true);
    try {
      await API.delete(`/admin/users/${delUserModal.userId}`);
      toast.success(`User "${delUserModal.userName}" permanently deleted`);
      setDelUserModal(null);
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally { setDeletingUser(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">User Management</h1>
        {userView === 'all' && (
          <input className="input w-64" placeholder="Search name, phone, email..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all',              label: 'All Users' },
          { key: 'deletion_pending', label: '🗑 Deletion Pending' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setUserView(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${userView === key ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── All Users table ─────────────────────────────────── */}
      {userView === 'all' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                {['Name','Phone','Email','Role','Joined','Status','Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-400"><LoadingSpinner /></td></tr>
                ) : users.map((u) => (
                  <tr key={u._id} className="hover:bg-saffron-50/30">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500">{u.phone}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.email || '—'}</td>
                    <td className="px-4 py-3"><span className="capitalize text-xs bg-saffron-50 text-saffron-700 px-2 py-0.5 rounded-full">{u.role}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3">
                      {u.accountStatus === 'deletion_pending'
                        ? <span className="badge-rejected text-[10px]">Deletion Pending</span>
                        : <span className={u.isActive ? 'badge-approved' : 'badge-rejected'}>{u.isActive ? 'Active' : 'Suspended'}</span>}
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={async () => {
                        await API.patch(`/admin/users/${u._id}/status`, { isActive: !u.isActive });
                        setUsers((prev) => prev.map((x) => x._id === u._id ? { ...x, isActive: !u.isActive } : x));
                        toast.success('Status updated');
                      }} className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50">
                        {u.isActive ? 'Suspend' : 'Activate'}
                      </button>
                      <button onClick={() => setDelUserModal({ userId: u._id, userName: u.name })}
                        className="text-xs border border-red-200 text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Deletion Pending table ──────────────────────────── */}
      {userView === 'deletion_pending' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? <div className="py-10 text-center"><LoadingSpinner /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-red-50 text-left text-xs text-gray-500 border-b">
                  {['Name','Email','Phone','Requested','Scheduled Deletion','Status','Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {users.length === 0 && (
                    <tr><td colSpan={7} className="py-10 text-center text-gray-400">No accounts pending deletion</td></tr>
                  )}
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-red-50/30">
                      <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{u.phone}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {u.deletionRequestedAt ? new Date(u.deletionRequestedAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-red-600">
                        {u.scheduledDeletionDate ? new Date(u.scheduledDeletionDate).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-rejected text-[10px]">Deletion Pending</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={async () => {
                            try {
                              await API.patch(`/admin/users/${u._id}/cancel-deletion`);
                              toast.success('Deletion cancelled');
                              loadUsers();
                            } catch { toast.error('Failed'); }
                          }} className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-lg hover:bg-green-200 whitespace-nowrap">
                            Cancel Deletion
                          </button>
                          <button onClick={() => setDelUserModal({ userId: u._id, userName: u.name })}
                            className="text-xs bg-red-500 text-white px-2.5 py-1 rounded-lg hover:bg-red-600 whitespace-nowrap">
                            Delete Now
                          </button>
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

      {/* ── Delete user confirmation modal ──────────────────── */}
      {delUserModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">Delete User Account</h3>
            <p className="text-sm text-gray-500 mb-1">
              This will permanently remove all data for:
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-4">"{delUserModal.userName}"</p>
            <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-5">
              This action cannot be undone. Notifications and sessions will be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDelUserModal(null)} disabled={deletingUser} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleDeleteUser} disabled={deletingUser}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deletingUser ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Poojas Tab ───────────────────────────────────────────────
const EMPTY_POOJA_FORM = { name:'', categoryIds:[], price:'', durationValue:'', durationUnit:'hours', shortDesc:'', description:'', requirements:'', benefits:'', languages:'Hindi, English, Sanskrit' };
const POOJA_STATUS_TABS = ['all','active','inactive','deleted','featured'];

function PoojaFormFields({ form, setForm, categories, image, setImage }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleCategory = (id) => setForm((f) => {
    const ids = f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id];
    return { ...f, categoryIds: ids };
  });
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Name *</label><input required className="input" value={form.name} onChange={set('name')} /></div>
        <div>
          <label className="label">Categories * <span className="text-gray-400 text-xs font-normal">(select one or more)</span></label>
          <div className="border rounded-xl p-2 max-h-36 overflow-y-auto grid grid-cols-2 gap-1" style={{ borderColor: 'var(--t-border)' }}>
            {categories.map((c) => (
              <label key={c._id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer hover:bg-saffron-50 text-xs">
                <input type="checkbox" checked={form.categoryIds.includes(c._id)} onChange={() => toggleCategory(c._id)} className="accent-saffron-500" />
                <span className="text-gray-700">{c.name}</span>
              </label>
            ))}
          </div>
          {form.categoryIds.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one category</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Price (₹) *</label><input required type="number" min="0" className="input" value={form.price} onChange={set('price')} /></div>
        <div>
          <label className="label">Duration</label>
          <div className="flex gap-2">
            <input type="number" min="1" max="30" className="input w-24" placeholder="e.g. 2" value={form.durationValue} onChange={set('durationValue')} />
            <select className="input flex-1" value={form.durationUnit} onChange={set('durationUnit')}>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>
      </div>
      <div><label className="label">Short Description</label><input className="input" value={form.shortDesc} onChange={set('shortDesc')} /></div>
      <div><label className="label">Full Description</label><textarea rows={3} className="input resize-none" value={form.description} onChange={set('description')} /></div>
      <div><label className="label">Supported Languages <span className="text-gray-400 text-xs font-normal">(comma-separated — shown to user in booking)</span></label><input className="input" placeholder="Hindi, English, Sanskrit..." value={form.languages} onChange={set('languages')} /></div>
      <div><label className="label">Requirements (comma-separated)</label><input className="input" placeholder="Rice, Ghee, Flowers..." value={form.requirements} onChange={set('requirements')} /></div>
      <div><label className="label">Benefits (comma-separated)</label><input className="input" value={form.benefits} onChange={set('benefits')} /></div>
      <div>
        <label className="label">Image</label>
        <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} className="text-sm" />
        {image && <p className="text-xs text-gray-400 mt-1">{image.name}</p>}
      </div>
    </>
  );
}

function PoojasTab() {
  const [categories,   setCategories]   = useState([]);
  const [poojas,       setPoojas]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [catForm,      setCatForm]      = useState({ name: '', description: '' });
  const [poojaForm,    setPoojaForm]    = useState(EMPTY_POOJA_FORM);
  const [catImage,     setCatImage]     = useState(null);
  const [poojaImage,   setPoojaImage]   = useState(null);
  const [tab2,         setTab2]         = useState('poojas');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search,       setSearch]       = useState('');
  const [editingPooja, setEditingPooja] = useState(null);

  const reload = () => {
    setLoading(true);
    Promise.all([
      API.get('/poojas/categories'),
      API.get(`/poojas/admin-catalog?status=${statusFilter}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
    ]).then(([cats, pjs]) => {
      setCategories(cats.data.categories || []);
      setPoojas(pjs.data.poojas || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [statusFilter]);

  const handleSearchSubmit = (e) => { e.preventDefault(); reload(); };

  // ── Category CRUD ──
  const createCategory = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', catForm.name);
    fd.append('description', catForm.description);
    if (catImage) fd.append('image', catImage);
    try {
      await API.post('/poojas/categories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Category created!');
      setCatForm({ name:'', description:'' }); setCatImage(null);
      API.get('/poojas/categories').then(({ data }) => setCategories(data.categories || []));
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  // ── Pooja CRUD ──
  const buildPoojaFD = (form, image) => {
    const fd = new FormData();
    if (form.name)         fd.append('name', form.name);
    if (form.price)        fd.append('price', form.price);
    if (form.durationValue)fd.append('durationValue', form.durationValue);
    if (form.durationUnit) fd.append('durationUnit', form.durationUnit);
    if (form.shortDesc)    fd.append('shortDesc', form.shortDesc);
    if (form.description)  fd.append('description', form.description);
    fd.set('categoryIds',    JSON.stringify(form.categoryIds));
    fd.set('requirements',   JSON.stringify(form.requirements.split(',').map((s) => s.trim()).filter(Boolean)));
    fd.set('benefits',       JSON.stringify(form.benefits.split(',').map((s) => s.trim()).filter(Boolean)));
    fd.set('languages',      JSON.stringify(form.languages.split(',').map((s) => s.trim()).filter(Boolean)));
    if (image) fd.append('image', image);
    return fd;
  };

  const handleCreatePooja = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.post('/poojas', buildPoojaFD(poojaForm, poojaImage), { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Pooja added!');
      setPoojaForm(EMPTY_POOJA_FORM); setPoojaImage(null);
      setTab2('poojas');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const startEditPooja = (p) => {
    setEditingPooja(p);
    // Build categoryIds from whichever field is populated
    const ids = (p.categoryIds?.length > 0
      ? p.categoryIds.map((c) => c._id || c)
      : p.categoryId ? [p.categoryId?._id || p.categoryId] : []);
    setPoojaForm({
      name:          p.name,
      categoryIds:   ids,
      price:         String(p.price),
      durationValue: p.durationValue ? String(p.durationValue) : '',
      durationUnit:  p.durationUnit || 'hours',
      shortDesc:     p.shortDesc || '',
      description:   p.description || '',
      requirements:  (p.requirements || []).join(', '),
      benefits:      (p.benefits     || []).join(', '),
      languages:     (p.languages    || []).join(', ') || 'Hindi, English, Sanskrit',
    });
    setPoojaImage(null);
    setTab2('edit-pooja');
  };

  const handleUpdatePooja = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.patch(`/poojas/${editingPooja._id}`, buildPoojaFD(poojaForm, poojaImage), { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Pooja updated!');
      setEditingPooja(null); setPoojaForm(EMPTY_POOJA_FORM); setPoojaImage(null);
      setTab2('poojas');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleTogglePooja = async (p) => {
    try {
      await API.patch(`/poojas/${p._id}/status`);
      toast.success(p.isActive ? 'Pooja deactivated' : 'Pooja activated');
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDeletePooja = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This is permanent if no bookings exist.`)) return;
    try {
      await API.delete(`/poojas/${p._id}`);
      toast.success('Pooja deleted');
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const toggleFeatured = async (p) => {
    await API.patch(`/poojas/${p._id}`, { isFeatured: !p.isFeatured });
    reload();
  };

  const navBtn = (v, lbl) => (
    <button key={v} onClick={() => setTab2(v)}
      className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${tab2===v ? 'bg-saffron-500 text-white' : 'bg-white border text-gray-600'}`}>
      {lbl || v.replace('-', ' ')}
    </button>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Pooja Management</h1>
      <div className="flex gap-2 flex-wrap">
        {navBtn('poojas', 'Poojas')}
        {navBtn('categories', 'Categories')}
        {navBtn('add-category', '+ Add Category')}
        {navBtn('add-pooja', '+ Add Pooja')}
      </div>

      {/* ── Categories ── */}
      {tab2 === 'categories' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {categories.map((c) => (
            <div key={c._id} className="bg-white rounded-xl p-4 border border-saffron-100 text-center">
              {c.image && <img src={`http://localhost:5000/${c.image}`} className="w-12 h-12 mx-auto rounded-full object-cover mb-2" alt="" />}
              <p className="font-semibold text-sm text-gray-800">{c.name}</p>
              <p className="text-xs text-gray-400 mt-1">{c.isActive ? 'Active' : 'Inactive'}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Poojas List ── */}
      {tab2 === 'poojas' && (
        <div className="space-y-3">
          {/* Search + Status Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9 text-sm w-64" placeholder="Search poojas..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </form>
            <div className="flex gap-1 flex-wrap">
              {POOJA_STATUS_TABS.map((s) => (
                <button key={s} onClick={() => { setStatusFilter(s); setSearch(''); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${statusFilter===s ? 'bg-saffron-500 text-white' : 'bg-white border text-gray-500 hover:border-saffron-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-white rounded-xl animate-pulse border border-gray-100" />)}</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-saffron-50 text-xs text-gray-500 text-left border-b">
                  {['Pooja','Category','Price','Featured','Status','Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {poojas.map((p) => (
                    <tr key={p._id} className={p.isDeleted ? 'opacity-50 bg-red-50/20' : 'hover:bg-gray-50/50 transition-colors'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.image
                            ? <img src={`http://localhost:5000/${p.image}`} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                            : <div className="w-8 h-8 rounded-lg bg-saffron-50 flex items-center justify-center shrink-0 text-sm">🪔</div>}
                          <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {(p.categoryIds?.length > 0
                          ? p.categoryIds.map((c) => c.name || c).join(', ')
                          : p.categoryId?.name) || '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-saffron-600 text-xs">₹{p.price?.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        {!p.isDeleted && (
                          <button onClick={() => toggleFeatured(p)}
                            className={`text-xs px-2 py-0.5 rounded-full ${p.isFeatured ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.isFeatured ? '⭐ Yes' : 'No'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.isDeleted
                          ? <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Deleted</span>
                          : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {p.isActive ? 'Active' : 'Inactive'}
                            </span>}
                      </td>
                      <td className="px-4 py-3">
                        {!p.isDeleted && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEditPooja(p)} title="Edit"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Edit3 size={13} />
                            </button>
                            <button onClick={() => handleTogglePooja(p)} title={p.isActive ? 'Deactivate' : 'Activate'}
                              className={`p-1.5 rounded-lg transition-colors ${p.isActive ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                              {p.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button onClick={() => handleDeletePooja(p)} title="Delete"
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {poojas.length === 0 && (
                    <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">No poojas found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Category ── */}
      {tab2 === 'add-category' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-md">
          <h2 className="font-bold text-gray-800 mb-4">Add Category</h2>
          <form onSubmit={createCategory} className="space-y-4">
            <div><label className="label">Name *</label><input required className="input" value={catForm.name} onChange={(e)=>setCatForm({...catForm,name:e.target.value})} /></div>
            <div><label className="label">Description</label><textarea rows={2} className="input resize-none" value={catForm.description} onChange={(e)=>setCatForm({...catForm,description:e.target.value})} /></div>
            <div><label className="label">Category Image</label><input type="file" accept="image/*" onChange={(e)=>setCatImage(e.target.files[0])} className="text-sm" /></div>
            <button type="submit" className="btn-primary flex items-center gap-2"><Plus size={16} />Create Category</button>
          </form>
        </div>
      )}

      {/* ── Add Pooja ── */}
      {tab2 === 'add-pooja' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-xl">
          <h2 className="font-bold text-gray-800 mb-4">Add Pooja</h2>
          <form onSubmit={handleCreatePooja} className="space-y-4">
            <PoojaFormFields form={poojaForm} setForm={setPoojaForm} categories={categories} image={poojaImage} setImage={setPoojaImage} />
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2"><Plus size={16} />{saving ? 'Adding...' : 'Add Pooja'}</button>
          </form>
        </div>
      )}

      {/* ── Edit Pooja ── */}
      {tab2 === 'edit-pooja' && editingPooja && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => { setTab2('poojas'); setEditingPooja(null); }} className="text-sm text-saffron-600 hover:underline">← Back</button>
            <h2 className="font-bold text-gray-800">Edit: {editingPooja.name}</h2>
          </div>
          <form onSubmit={handleUpdatePooja} className="space-y-4">
            <PoojaFormFields form={poojaForm} setForm={setPoojaForm} categories={categories} image={poojaImage} setImage={setPoojaImage} />
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2"><Save size={16} />{saving ? 'Saving...' : 'Save Changes'}</button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Festivals Tab ────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function SyncResultCard({ result, onDismiss }) {
  if (!result) return null;
  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-green-800">Sync Complete</h3>
        <button onClick={onDismiss} className="text-green-600 text-xs hover:underline">Dismiss</button>
      </div>
      <p className="text-sm text-green-700 mb-3">{result.message}</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Imported', value: result.report?.imported ?? 0, color: 'bg-saffron-100 text-saffron-700' },
          { label: 'Updated',  value: result.report?.updated  ?? 0, color: 'bg-blue-100 text-blue-700'     },
          { label: 'Skipped',  value: result.report?.skipped  ?? 0, color: 'bg-gray-100 text-gray-600'     },
        ].map(({ label, value, color }) => (
          <div key={label} className={`${color} rounded-xl p-2.5 text-center`}>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FestivalsTab() {
  const currentYear = new Date().getFullYear();
  const [view,       setView]       = useState('sync');
  const [festivals,  setFestivals]  = useState([]);
  const [syncLogs,   setSyncLogs]   = useState([]);
  const [form,       setForm]       = useState({ name:'', date:'', tithiDate:'', panchang:'', description:'' });
  const [syncMonth,  setSyncMonth]  = useState(new Date().getMonth() + 1);
  const [syncYear,   setSyncYear]   = useState(currentYear);
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [warnCache,  setWarnCache]  = useState(null);
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 2 + i);

  const reload = () => {
    API.get('/festivals').then(({ data }) => setFestivals(data.festivals));
    API.get('/festivals/sync-logs').then(({ data }) => setSyncLogs(data.logs || [])).catch(() => {});
  };

  useEffect(() => { reload(); }, []);

  const doSync = async (force = false) => {
    setSyncing(true);
    setWarnCache(null);
    setSyncResult(null);
    try {
      const { data } = await API.post('/festivals/sync', { month: syncMonth, year: syncYear, force });
      if (data.alreadyCached && !force) {
        setWarnCache(data);
        return;
      }
      if (!data.success) {
        toast.error(data.message || 'Sync failed');
        return;
      }
      setSyncResult(data);
      toast.success(data.message);
      reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect to Google Apps Script');
    } finally {
      setSyncing(false);
    }
  };

  const createFestival = async (e) => {
    e.preventDefault();
    try {
      await API.post('/festivals', form);
      toast.success('Festival added!');
      setForm({ name:'', date:'', tithiDate:'', panchang:'', description:'' });
      reload();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const sourceColor = (src) => {
    if (src === 'googlesheets') return 'bg-green-50 text-green-700';
    if (src === 'drikpanchang') return 'bg-blue-50 text-blue-700';
    if (src === 'csv')          return 'bg-purple-50 text-purple-700';
    return 'bg-gray-50 text-gray-600';
  };

  const typeColor = (t) => {
    if (t === 'festival') return 'bg-saffron-50 text-saffron-700';
    if (t === 'tithi')    return 'bg-blue-50 text-blue-700';
    if (t === 'vrat')     return 'bg-orange-50 text-orange-700';
    if (t === 'panchang') return 'bg-purple-50 text-purple-700';
    return 'bg-green-50 text-green-700';
  };

  const statusBadge = (s) => {
    if (s === 'success') return 'bg-green-100 text-green-700';
    if (s === 'failed')  return 'bg-red-100 text-red-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Festival / Tithi / Panchang</h1>
        <div className="flex gap-2 flex-wrap">
          {[['sync','Festival Data Sync'],['add','Manual Add'],['list','All Records']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view===v ? 'bg-saffron-500 text-white' : 'bg-white border text-gray-600 hover:border-saffron-300'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sync View ── */}
      {view === 'sync' && (
        <div className="space-y-6">
          {/* Sync card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={18} className="text-saffron-500" />
              <h2 className="font-bold text-gray-800">Festival Data Sync</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Fetch festival, tithi and panchang data automatically via Google Apps Script connected to Google Sheets.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="label">Month</label>
                <select className="input" value={syncMonth} onChange={(e) => { setSyncMonth(+e.target.value); setWarnCache(null); setSyncResult(null); }}>
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <select className="input" value={syncYear} onChange={(e) => { setSyncYear(+e.target.value); setWarnCache(null); setSyncResult(null); }}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Already-cached warning */}
            {warnCache && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-yellow-800 mb-1">Already Synced Recently</p>
                <p className="text-xs text-yellow-700 mb-3">{warnCache.message}</p>
                <div className="flex gap-2">
                  <button onClick={() => doSync(true)} disabled={syncing} className="flex-1 btn-primary text-sm py-2">
                    {syncing ? 'Syncing...' : 'Force Re-Sync'}
                  </button>
                  <button onClick={() => setWarnCache(null)} className="flex-1 btn-outline text-sm py-2">Cancel</button>
                </div>
              </div>
            )}

            {!warnCache && (
              <button onClick={() => doSync(false)} disabled={syncing}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                {syncing
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Fetching Festival Data...</>
                  : <><Sparkles size={16} /> Fetch Festival Data</>
                }
              </button>
            )}

            {syncing && (
              <p className="text-xs text-center text-gray-500 mt-2 animate-pulse">
                Connecting to Google Apps Script… this may take up to 60 seconds
              </p>
            )}
          </div>

          {/* Sync result */}
          {syncResult && <SyncResultCard result={syncResult} onDismiss={() => setSyncResult(null)} />}

          {/* Sync history */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Clock size={15} className="text-gray-500" />
              <h2 className="font-semibold text-gray-700">Sync History</h2>
            </div>
            {syncLogs.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">No sync history yet. Perform a sync to see logs here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-saffron-50 text-xs text-gray-500 text-left border-b">
                    {['Month','Year','Imported','Updated','Skipped','Status','Synced At'].map(h => (
                      <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {syncLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-saffron-50/30">
                        <td className="px-4 py-3 font-medium text-gray-700">{MONTH_NAMES[(log.month || 1) - 1]}</td>
                        <td className="px-4 py-3 text-gray-600">{log.year}</td>
                        <td className="px-4 py-3 text-saffron-600 font-bold">{log.recordsImported ?? 0}</td>
                        <td className="px-4 py-3 text-blue-600 font-bold">{log.recordsUpdated ?? 0}</td>
                        <td className="px-4 py-3 text-gray-400">{log.recordsSkipped ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(log.status)}`}>{log.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(log.createdAt).toLocaleDateString('en-IN')}{' '}
                          {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Manual Add ── */}
      {view === 'add' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-md">
          <h2 className="font-bold text-gray-800 mb-4">Add Festival Manually</h2>
          <form onSubmit={createFestival} className="space-y-3">
            <div><label className="label">Festival Name</label><input className="input" placeholder="e.g. Diwali" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Date *</label><input required type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className="label">Tithi</label><input className="input" placeholder="e.g. Shukla Paksha Panchami" value={form.tithiDate} onChange={(e) => setForm({ ...form, tithiDate: e.target.value })} /></div>
            <div><label className="label">Panchang Info</label><input className="input" placeholder="Additional panchang details" value={form.panchang} onChange={(e) => setForm({ ...form, panchang: e.target.value })} /></div>
            <div><label className="label">Description</label><textarea rows={2} className="input resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <button type="submit" className="btn-primary flex items-center gap-2"><Plus size={16} />Add Entry</button>
          </form>
        </div>
      )}

      {/* ── All Records ── */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-saffron-50 text-xs text-gray-500 text-left border-b">
                {['Festival / Entry','Date','Tithi / Vrat','Type','Source','Actions'].map(h => (
                  <th key={h} className="px-4 py-3">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {festivals.map((f) => (
                  <tr key={f._id}>
                    <td className="px-4 py-3 font-semibold text-gray-800 max-w-[200px] truncate">
                      {f.name || <span className="text-gray-400 italic text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(f.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 text-xs text-saffron-600 max-w-[140px] truncate">
                      {f.tithiDate || f.vrat || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor(f.dataType)}`}>
                        {f.dataType || 'festival'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sourceColor(f.source)}`}>{f.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={async () => { await API.delete(`/festivals/${f._id}`); reload(); toast.success('Removed'); }}
                        className="text-xs text-red-500 hover:underline">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {festivals.length === 0 && (
              <p className="text-center py-8 text-gray-400">No festival data yet. Use Festival Data Sync to fetch data.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Education Masters Tab ────────────────────────────────────
function EducationMastersTab() {
  const [masters,  setMasters]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState({ name: '', allowCustom: false });
  const [editItem, setEditItem] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [view,     setView]     = useState('list'); // 'list' | 'add'

  const load = () => {
    setLoading(true);
    API.get('/admin/education-masters?includeInactive=true')
      .then(({ data }) => setMasters(data.masters || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await API.post('/admin/education-masters', form);
      toast.success('Education category added');
      setForm({ name: '', allowCustom: false });
      setView('list');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (id, updates) => {
    try {
      await API.patch(`/admin/education-masters/${id}`, updates);
      toast.success('Updated');
      setEditItem(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleToggle = (m) => handleEdit(m._id, { isActive: !m.isActive });
  const handleDelete = async (id) => {
    if (!window.confirm('Disable this education category?')) return;
    await handleEdit(id, { isActive: false });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Education Masters</h1>
          <p className="text-sm text-gray-500 mt-1">Control what qualification categories pandits can select. No free-text entry.</p>
        </div>
        <button onClick={() => setView(view === 'add' ? 'list' : 'add')}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> {view === 'add' ? 'View List' : 'Add Category'}
        </button>
      </div>

      {view === 'add' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-md">
          <h2 className="font-bold text-gray-800 mb-4">Add Education Category</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">Category Name *</label>
              <input required className="input" placeholder="e.g. Acharya, Shastri, Vedacharya..."
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="allowCustom" checked={form.allowCustom}
                onChange={(e) => setForm({ ...form, allowCustom: e.target.checked })}
                className="w-4 h-4 accent-saffron-500" />
              <label htmlFor="allowCustom" className="text-sm text-gray-600">
                This is an "Others" option (shows custom text entry)
              </label>
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> {saving ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </div>
      )}

      {view === 'list' && (
        loading ? <LoadingSpinner /> : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-saffron-50 text-xs text-gray-500 text-left border-b">
                  {['Category Name','Others Option','Status','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {masters.map((m) => (
                    <tr key={m._id} className={`hover:bg-saffron-50/30 ${!m.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {editItem === m._id ? (
                          <input autoFocus className="input text-sm py-1 w-48"
                            defaultValue={m.name}
                            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== m.name) handleEdit(m._id, { name: e.target.value.trim() }); setEditItem(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditItem(null); }}
                          />
                        ) : (
                          <span className="cursor-pointer hover:text-saffron-600" onClick={() => setEditItem(m._id)}>{m.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.allowCustom ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'}`}>
                          {m.allowCustom ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {m.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleToggle(m)}
                            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${m.isActive ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                            {m.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => setEditItem(m._id)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                            Rename
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {masters.length === 0 && (
                <p className="text-center py-10 text-gray-400">No education categories yet. Add some above.</p>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Specialization Masters Tab ───────────────────────────────
function SpecializationMastersTab() {
  const [masters,  setMasters]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState({ name: '' });
  const [editItem, setEditItem] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [view,     setView]     = useState('list');

  const load = () => {
    setLoading(true);
    API.get('/admin/specialization-masters?includeInactive=true')
      .then(({ data }) => setMasters(data.masters || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await API.post('/admin/specialization-masters', form);
      toast.success('Specialization added');
      setForm({ name: '' });
      setView('list');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (id, updates) => {
    try {
      await API.patch(`/admin/specialization-masters/${id}`, updates);
      toast.success('Updated');
      setEditItem(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleToggle = (m) => handleEdit(m._id, { isActive: !m.isActive });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Specialization Masters</h1>
          <p className="text-sm text-gray-500 mt-1">Control what specializations pandits can select. No free-text entry allowed.</p>
        </div>
        <button onClick={() => setView(view === 'add' ? 'list' : 'add')}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> {view === 'add' ? 'View List' : 'Add Specialization'}
        </button>
      </div>

      {view === 'add' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-md">
          <h2 className="font-bold text-gray-800 mb-4">Add Specialization</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="label">Specialization Name *</label>
              <input required className="input" placeholder="e.g. Vastu Shastra, Astrology, Palmistry..."
                value={form.name} onChange={(e) => setForm({ name: e.target.value })} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> {saving ? 'Adding...' : 'Add Specialization'}
            </button>
          </form>
        </div>
      )}

      {view === 'list' && (
        loading ? <LoadingSpinner /> : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-saffron-50 text-xs text-gray-500 text-left border-b">
                  {['Specialization Name','Status','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {masters.map((m) => (
                    <tr key={m._id} className={`hover:bg-saffron-50/30 ${!m.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {editItem === m._id ? (
                          <input autoFocus className="input text-sm py-1 w-48"
                            defaultValue={m.name}
                            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== m.name) handleEdit(m._id, { name: e.target.value.trim() }); setEditItem(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditItem(null); }}
                          />
                        ) : (
                          <span className="cursor-pointer hover:text-saffron-600" onClick={() => setEditItem(m._id)}>{m.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {m.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleToggle(m)}
                            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${m.isActive ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                            {m.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => setEditItem(m._id)} className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                            Rename
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {masters.length === 0 && (
                <p className="text-center py-10 text-gray-400">No specializations yet. Add some above.</p>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Admin Profile ────────────────────────────────────────────
function AdminProfile({ user, refreshUser }) {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.patch('/users/profile', form);
      await refreshUser();
      toast.success('Profile updated!');
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <ProfilePhoto currentPhoto={user?.profilePhoto} onUpdate={refreshUser} />
        <div className="mt-4 text-center">
          <p className="font-bold text-gray-800">{user?.name}</p>
          <p className="text-sm text-gray-500">Admin · {user?.phone}</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <h2 className="font-semibold text-gray-700 mb-4">Update Details</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
        </form>
      </div>
    </div>
  );
}

// ─── Pandit Poojas Approval Tab ───────────────────────────────
function PanditPoojasTab() {
  const [poojas,  setPoojas]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('pending');

  const load = () => {
    setLoading(true);
    API.get(`/admin/pandit-poojas?status=${filter}`)
      .then(({ data }) => setPoojas(data.poojas))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const decide = async (id, approvalStatus) => {
    const adminNote = approvalStatus === 'rejected' ? window.prompt('Rejection reason (optional):') || '' : '';
    try {
      await API.patch(`/admin/pandit-poojas/${id}/approve`, { approvalStatus, adminNote });
      toast.success(`Pooja ${approvalStatus}`);
      load();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Pandit Pooja Approvals</h1>
      <p className="text-sm text-gray-500">Poojas created by pandits require admin approval before appearing publicly.</p>

      <div className="flex gap-2 flex-wrap">
        {['pending','approved','rejected'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${filter===s ? 'bg-saffron-500 text-white' : 'bg-white border text-gray-600 hover:border-saffron-300'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {poojas.map((p) => (
            <div key={p._id} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
              {p.image
                ? <img src={`http://localhost:5000/${p.image}`} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                : <div className="w-14 h-14 rounded-xl bg-saffron-50 flex items-center justify-center text-2xl shrink-0">🪔</div>
              }
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-bold text-gray-800">{p.name}</h3>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${p.approvalStatus==='pending' ? 'bg-yellow-100 text-yellow-700' : p.approvalStatus==='approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {p.approvalStatus}
                  </span>
                </div>
                <p className="text-sm text-gray-500">By: {p.panditId?.name} ({p.panditId?.phone})</p>
                <p className="text-xs text-gray-400">Category: {p.categoryId?.name} · ₹{p.price?.toLocaleString()}</p>
                {p.adminNote && <p className="text-xs text-red-600 mt-1">Note: {p.adminNote}</p>}
              </div>
              {filter === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => decide(p._id, 'approved')} className="flex items-center gap-1 text-xs bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600">
                    <CheckCircle size={13} /> Approve
                  </button>
                  <button onClick={() => decide(p._id, 'rejected')} className="flex items-center gap-1 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600">
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {poojas.length === 0 && <p className="text-center py-10 text-gray-400">No poojas in this status</p>}
        </div>
      )}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────
const ORDER_STATUS_META = {
  paid:             { label: 'Order Placed',    color: 'bg-blue-100 text-blue-700'    },
  confirmed:        { label: 'Confirmed',        color: 'bg-indigo-100 text-indigo-700'},
  packed:           { label: 'Packed',           color: 'bg-purple-100 text-purple-700'},
  shipped:          { label: 'Shipped',          color: 'bg-orange-100 text-orange-700'},
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-amber-100 text-amber-700'  },
  delivered:        { label: 'Delivered',        color: 'bg-green-100 text-green-700'  },
  cancelled:        { label: 'Cancelled',        color: 'bg-red-100 text-red-700'      },
  refunded:         { label: 'Refunded',         color: 'bg-gray-100 text-gray-600'    },
};

const STATUS_TRANSITIONS = {
  paid:             ['confirmed', 'cancelled'],
  confirmed:        ['packed', 'cancelled'],
  packed:           ['shipped', 'cancelled'],
  shipped:          ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered:        ['refunded'],
  cancelled:        ['refunded'],
};

function OrdersTab() {
  const [orders,       setOrders]       = useState([]);
  const [stats,        setStats]        = useState({});
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQ,      setSearchQ]      = useState('');
  const [selected,     setSelected]     = useState(null);
  const [actionOrder,  setActionOrder]  = useState(null);
  const [newStatus,    setNewStatus]    = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [trackingId,   setTrackingId]   = useState('');
  const [courier,      setCourier]      = useState('');
  const [updating,     setUpdating]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (searchQ)      params.set('search', searchQ);
      const { data } = await API.get(`/admin/orders?${params}`);
      setOrders(data.orders || []);
      setStats(data.stats || {});
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, [statusFilter, searchQ]);

  useEffect(() => { load(); }, [load]);

  const openAction = (order) => {
    setActionOrder(order);
    setNewStatus('');
    setCancelReason('');
    setTrackingId(order.trackingId || '');
    setCourier(order.courier || '');
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) { toast.error('Select a status'); return; }
    setUpdating(true);
    try {
      await API.patch(`/admin/orders/${actionOrder._id}/status`, { status: newStatus, cancelReason });
      toast.success('Order status updated');
      setActionOrder(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setUpdating(false); }
  };

  const handleShipmentUpdate = async () => {
    if (!trackingId && !courier) { toast.error('Enter tracking ID or courier name'); return; }
    setUpdating(true);
    try {
      await API.patch(`/admin/orders/${actionOrder._id}/shipment`, { trackingId, courier });
      toast.success('Shipment info saved');
      setActionOrder(null);
      load();
    } catch { toast.error('Failed to save shipment info'); }
    finally { setUpdating(false); }
  };

  const nextStatuses = actionOrder ? (STATUS_TRANSITIONS[actionOrder.status] || []) : [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"' }}>Order Management</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders',   value: stats.totalOrders   || 0, color: '#1B1F3B' },
          { label: 'Pending',        value: stats.pendingOrders || 0, color: '#d97706' },
          { label: 'Delivered',      value: stats.deliveredOrders||0, color: '#059669' },
          { label: 'Revenue',        value: `₹${(stats.totalRevenue||0).toLocaleString('en-IN')}`, color: '#D4AF37' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold" style={{ color, fontFamily: '"Cormorant Garamond"' }}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 py-2 text-sm"
            placeholder="Search order #..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['', 'paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-500 hover:border-indigo-300'}`}
              style={statusFilter === s ? { background: '#1B1F3B' } : {}}>
              {s ? (ORDER_STATUS_META[s]?.label || s) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-14 skeleton rounded-xl"/>)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Package size={40} className="mx-auto mb-3 text-gray-200" />
          <p>No orders found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Order #', 'Customer', 'Items', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const meta = ORDER_STATUS_META[o.status];
                  return (
                    <tr key={o._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">#{o.orderNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-xs">{o.userId?.name || '—'}</p>
                        <p className="text-gray-400 text-[10px]">{o.userId?.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {o.items?.[0]?.name}{o.items?.length > 1 ? ` +${o.items.length-1}` : ''}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"' }}>
                        ₹{o.totalAmount?.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta?.color || 'bg-gray-100 text-gray-500'}`}>
                          {meta?.label || o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(o.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openAction(o)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                          style={{ background: '#1B1F3B', color: 'white' }}>
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order action modal */}
      {actionOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 text-lg">Manage Order #{actionOrder.orderNumber}</h2>
              <button onClick={() => setActionOrder(null)} className="text-gray-400 hover:text-gray-600 p-1"><XCircle size={18} /></button>
            </div>

            {/* Order summary */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs space-y-1">
              <p className="font-semibold text-gray-700">{actionOrder.userId?.name} · {actionOrder.userId?.phone}</p>
              <p className="text-gray-500">{actionOrder.shippingAddress?.city}, {actionOrder.shippingAddress?.state}</p>
              <p className="text-gray-600">{actionOrder.items?.length} item(s) · ₹{actionOrder.totalAmount?.toLocaleString('en-IN')}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ORDER_STATUS_META[actionOrder.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                  {ORDER_STATUS_META[actionOrder.status]?.label || actionOrder.status}
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Items</p>
              {actionOrder.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100">
                  <span className="text-gray-700">{item.name} ×{item.quantity}</span>
                  <span className="font-semibold">₹{item.total?.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>

            {/* Shipment tracking */}
            <div className="mb-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Truck size={12} /> Shipment Info</p>
              <input className="input text-sm" placeholder="Courier name (e.g. DTDC, BlueDart)" value={courier} onChange={(e) => setCourier(e.target.value)} />
              <input className="input text-sm font-mono" placeholder="Tracking number" value={trackingId} onChange={(e) => setTrackingId(e.target.value)} />
              <button onClick={handleShipmentUpdate} disabled={updating}
                className="w-full py-2 text-sm rounded-xl font-semibold transition-colors border border-gray-200 hover:bg-gray-50">
                Save Shipment Info
              </button>
            </div>

            {/* Status update */}
            {nextStatuses.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Update Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {nextStatuses.map((s) => (
                    <button key={s} onClick={() => setNewStatus(s)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${newStatus === s ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      → {ORDER_STATUS_META[s]?.label || s}
                    </button>
                  ))}
                </div>
                {newStatus === 'cancelled' && (
                  <input className="input text-sm mt-2" placeholder="Cancellation reason (optional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                )}
                {newStatus && (
                  <button onClick={handleStatusUpdate} disabled={updating}
                    className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all"
                    style={{ background: '#1B1F3B' }}>
                    {updating ? 'Updating...' : `Confirm: ${ORDER_STATUS_META[newStatus]?.label || newStatus}`}
                  </button>
                )}
              </div>
            )}

            {nextStatuses.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">No further status transitions available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Marketplace Tab (Products + Kits) ────────────────────────
const VISIBILITY_META = {
  marketplace: { label: 'Marketplace', cls: 'bg-green-100 text-green-700' },
  kit_only:    { label: 'Kit Only',    cls: 'bg-blue-100 text-blue-700'   },
  both:        { label: 'Both',        cls: 'bg-purple-100 text-purple-700' },
};

const EMPTY_PRODUCT_FORM = {
  name: '', category: 'samagri', price: '', salePrice: '', stock: '',
  description: '', tags: '', visibilityType: 'marketplace', taxRate: '', variants: [],
};

function VariantBuilder({ variants, setVariants }) {
  const add = () => setVariants((v) => [...v, { quantity: '', price: '', salePrice: '', stock: '', isActive: true }]);
  const rm  = (i) => setVariants((v) => v.filter((_, idx) => idx !== i));
  const upd = (i, k, val) => setVariants((v) => v.map((item, idx) => idx === i ? { ...item, [k]: val } : item));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label mb-0">Quantity Variants</label>
        <span className="text-xs text-gray-400">If variants are used, Price/Stock above are ignored</span>
      </div>
      {variants.length > 0 && (
        <div className="space-y-2 mb-2">
          <div className="grid gap-2 text-xs font-medium text-gray-400 px-1" style={{ gridTemplateColumns: '1fr 90px 90px 70px 40px 28px' }}>
            <span>Quantity (5g, 50g, 1kg…)</span>
            <span>Price (₹)</span>
            <span>Sale Price</span>
            <span>Stock</span>
            <span>Active</span>
            <span />
          </div>
          {variants.map((v, i) => (
            <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 90px 90px 70px 40px 28px' }}>
              <input className="input text-sm" placeholder="e.g. 50g" value={v.quantity}
                onChange={(e) => upd(i, 'quantity', e.target.value)} />
              <input type="number" min="0" className="input text-sm" placeholder="₹" value={v.price}
                onChange={(e) => upd(i, 'price', e.target.value)} />
              <input type="number" min="0" className="input text-sm" placeholder="₹ (opt)" value={v.salePrice || ''}
                onChange={(e) => upd(i, 'salePrice', e.target.value)} />
              <input type="number" min="0" className="input text-sm" placeholder="0" value={v.stock}
                onChange={(e) => upd(i, 'stock', e.target.value)} />
              <button type="button" onClick={() => upd(i, 'isActive', !v.isActive)}
                className={`w-9 h-5 rounded-full transition-colors relative ${v.isActive !== false ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${v.isActive !== false ? 'left-4' : 'left-0.5'}`} />
              </button>
              <button type="button" onClick={() => rm(i)}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-lg leading-none shrink-0">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={add}
        className="text-sm text-saffron-600 hover:underline flex items-center gap-1">
        <Plus size={12} /> Add Variant
      </button>
    </div>
  );
}

function ProductForm({ form, setForm, images, setImages, onSubmit, submitLabel, loading }) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const variants    = form.variants || [];
  const setVariants = (fn) => setForm((f) => ({ ...f, variants: typeof fn === 'function' ? fn(f.variants || []) : fn }));
  const hasVariants = variants.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Name *</label><input required className="input" value={form.name} onChange={set('name')} /></div>
        <div>
          <label className="label">Category *</label>
          <select required className="input" value={form.category} onChange={set('category')}>
            {['samagri','rudraksha','yantra','incense','idol','books','pooja_essentials','other'].map((c) => (
              <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Price/Stock (flat) — dimmed when variants present */}
      {!hasVariants && (
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Price (₹) *</label><input required type="number" min="0" className="input" value={form.price} onChange={set('price')} /></div>
          <div><label className="label">Sale Price</label><input type="number" min="0" className="input" value={form.salePrice} onChange={set('salePrice')} /></div>
          <div><label className="label">Stock *</label><input required type="number" min="0" className="input" value={form.stock} onChange={set('stock')} /></div>
        </div>
      )}
      {hasVariants && (
        <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
          Price and Stock are managed per-variant below.
        </div>
      )}

      <VariantBuilder variants={variants} setVariants={setVariants} />

      {form.sku && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">SKU:</span>
          <code className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{form.sku}</code>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Visibility *</label>
          <select className="input" value={form.visibilityType} onChange={set('visibilityType')}>
            <option value="marketplace">Marketplace Product — visible to customers</option>
            <option value="kit_only">Kit Only — not visible in marketplace</option>
            <option value="both">Both — visible in marketplace and kits</option>
          </select>
        </div>
        <div>
          <label className="label">Tax Rate (GST %)</label>
          <input type="number" min="0" max="100" step="0.5" className="input" placeholder="e.g. 5, 12, 18" value={form.taxRate} onChange={set('taxRate')} />
        </div>
      </div>
      <div><label className="label">Description</label><textarea rows={2} className="input resize-none" value={form.description} onChange={set('description')} /></div>
      <div><label className="label">Tags (comma-separated)</label><input className="input" value={form.tags} onChange={set('tags')} /></div>
      <div>
        <label className="label">Images (up to 5)</label>
        <input type="file" accept="image/*" multiple onChange={(e) => setImages([...e.target.files])} className="text-sm" />
        {images.length > 0 && <p className="text-xs text-gray-400 mt-1">{images.length} file(s) selected</p>}
      </div>
      <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
        <Plus size={16} /> {submitLabel}
      </button>
    </form>
  );
}

function MarketplaceTab() {
  const [view,          setView]          = useState('products');
  const [products,      setProducts]      = useState([]);
  const [kits,          setKits]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [search,        setSearch]        = useState('');
  const [editingProd,   setEditingProd]   = useState(null);
  const [productForm,   setProductForm]   = useState(EMPTY_PRODUCT_FORM);
  const [productImages, setProductImages] = useState([]);

  const [kitForm,         setKitForm]         = useState({ name:'', description:'', discountType:'percentage', discountValue:'0', isFeatured:false, taxRate:'' });
  const [kitItems,        setKitItems]        = useState([{ productId:'', quantity:1 }]);
  const [kitLinkedPoojas, setKitLinkedPoojas] = useState([]);
  const [kitImage,        setKitImage]        = useState(null);
  const [kitTotalCost,    setKitTotalCost]    = useState(0);
  const [kitSellingPrice, setKitSellingPrice] = useState('');
  const [kitPriceOverride,setKitPriceOverride]= useState(false);
  const [availablePoojas, setAvailablePoojas] = useState([]);
  const [editingKit,      setEditingKit]      = useState(null);
  const [kitSearch,       setKitSearch]       = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      API.get('/marketplace/admin/products'),
      API.get('/marketplace/kits?limit=50'),
      API.get('/poojas/admin-catalog?status=active'),
    ]).then(([p, k, pj]) => {
      setProducts(p.data.products || []);
      setKits(k.data.kits || []);
      setAvailablePoojas(pj.data.poojas || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Kit builder products: active, non-deleted. Products with variants only need any in-stock variant.
  const kitBuilderProducts = products.filter((p) => {
    if (!p.isActive || p.isDeleted) return false;
    if (p.variants?.length > 0) return p.variants.some((v) => v.isActive !== false && v.stock > 0);
    return p.stock > 0;
  });

  // Frontend search filter
  const filteredProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase()) ||
    (p.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  // Auto-recompute kit pricing
  useEffect(() => {
    const valid = kitItems.filter((i) => i.productId);
    if (!valid.length) { setKitTotalCost(0); if (!kitPriceOverride) setKitSellingPrice(''); return; }
    let total = 0;
    for (const item of valid) {
      const prod = kitBuilderProducts.find((p) => p._id === item.productId);
      if (prod) {
        const variant = item.variantId ? prod.variants?.find((v) => v.variantId === item.variantId) : null;
        const unitPrice = variant ? variant.price : (prod.salePrice || prod.price);
        total += unitPrice * item.quantity;
      }
    }
    setKitTotalCost(total);
    if (!kitPriceOverride) {
      const disc = parseFloat(kitForm.discountValue) || 0;
      let sell = kitForm.discountType === 'percentage' ? total - (total * disc) / 100 : total - disc;
      setKitSellingPrice(Math.max(0, Math.round(sell)).toString());
    }
  }, [kitItems, kitForm.discountType, kitForm.discountValue, products, kitPriceOverride]);

  // ── Product CRUD ──────────────────────────────────────────
  const startEdit = (p) => {
    setEditingProd(p);
    setProductForm({
      name:           p.name,
      sku:            p.sku || '',
      category:       p.category,
      price:          String(p.price || ''),
      salePrice:      p.salePrice ? String(p.salePrice) : '',
      stock:          String(p.stock || ''),
      description:    p.description || '',
      tags:           (p.tags || []).join(', '),
      visibilityType: p.visibilityType || 'marketplace',
      taxRate:        p.taxRate !== undefined ? String(p.taxRate) : '',
      variants:       (p.variants || []).map((v) => ({
        quantity:  v.quantity,
        price:     String(v.price),
        salePrice: v.salePrice ? String(v.salePrice) : '',
        stock:     String(v.stock),
        isActive:  v.isActive !== false,
      })),
    });
    setProductImages([]);
    setView('edit-product');
  };

  const buildProductFD = (form, images) => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'variants' || k === 'sku') return; // handled separately
      if (v !== '') fd.append(k, v);
    });
    fd.set('tags', JSON.stringify(form.tags.split(',').map((s) => s.trim()).filter(Boolean)));
    if (form.variants?.length > 0) {
      fd.set('variants', JSON.stringify(form.variants));
    }
    images.forEach((f) => fd.append('images', f));
    return fd;
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.post('/marketplace/products', buildProductFD(productForm, productImages), { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Product created');
      setProductForm(EMPTY_PRODUCT_FORM);
      setProductImages([]);
      setView('products');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.patch(`/marketplace/products/${editingProd._id}`, buildProductFD(productForm, productImages), { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Product updated');
      setEditingProd(null);
      setProductForm(EMPTY_PRODUCT_FORM);
      setProductImages([]);
      setView('products');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteProduct = async (p) => {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try {
      await API.delete(`/marketplace/products/${p._id}`);
      toast.success('Product deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete'); }
  };

  const handleToggleProduct = async (p) => {
    try {
      await API.patch(`/marketplace/products/${p._id}/status`);
      toast.success(p.isActive ? 'Product deactivated' : 'Product activated');
      load();
    } catch { toast.error('Failed'); }
  };

  // ── Kit CRUD ──────────────────────────────────────────────
  const handleCreateKit = async (e) => {
    e.preventDefault();
    const valid = kitItems.filter((i) => i.productId);
    if (!valid.length) { toast.error('Add at least one product'); return; }
    if (!kitSellingPrice || +kitSellingPrice < 0) { toast.error('Enter a valid selling price'); return; }
    const fd = new FormData();
    fd.append('name', kitForm.name);
    fd.append('description', kitForm.description);
    fd.append('discountType', kitForm.discountType);
    fd.append('discountValue', kitForm.discountValue);
    fd.append('discountPrice', kitSellingPrice);
    fd.append('isFeatured', String(kitForm.isFeatured));
    fd.append('taxRate', kitForm.taxRate || '0');
    fd.append('items', JSON.stringify(valid));
    fd.append('linkedPoojas', JSON.stringify(kitLinkedPoojas));
    if (kitImage) fd.append('image', kitImage);
    setSaving(true);
    try {
      await API.post('/marketplace/kits', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Kit created');
      setKitForm({ name:'', description:'', discountType:'percentage', discountValue:'0', isFeatured:false, taxRate:'' });
      setKitItems([{ productId:'', quantity:1 }]);
      setKitLinkedPoojas([]);
      setKitImage(null); setKitTotalCost(0); setKitSellingPrice(''); setKitPriceOverride(false);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteKit = async (id) => {
    if (!window.confirm('Remove kit?')) return;
    try {
      await API.delete(`/marketplace/kits/${id}`);
      toast.success('Kit removed');
      load();
    } catch { toast.error('Failed to remove kit'); }
  };

  const startEditKit = (k) => {
    setEditingKit(k);
    setKitForm({ name: k.name, description: k.description || '', discountType: k.discountType || 'percentage', discountValue: String(k.discountValue || 0), isFeatured: k.isFeatured || false, taxRate: k.taxRate !== undefined ? String(k.taxRate) : '' });
    setKitItems(k.items?.map((item) => ({ productId: item.productId?._id || item.productId, variantId: item.variantId || null, variantLabel: item.variantLabel || null, quantity: item.quantity })) || [{ productId: '', quantity: 1 }]);
    setKitLinkedPoojas((k.linkedPoojas || []).map((p) => p._id || p));
    setKitSellingPrice(String(k.discountPrice || 0));
    setKitPriceOverride(true);
    setKitTotalCost(k.totalCost || 0);
    setKitImage(null);
    setView('edit-kit');
  };

  const handleUpdateKit = async (e) => {
    e.preventDefault();
    const valid = kitItems.filter((i) => i.productId);
    if (!valid.length) { toast.error('Add at least one product'); return; }
    const fd = new FormData();
    fd.append('name', kitForm.name);
    fd.append('description', kitForm.description);
    fd.append('discountType', kitForm.discountType);
    fd.append('discountValue', kitForm.discountValue);
    fd.append('discountPrice', kitSellingPrice);
    fd.append('isFeatured', String(kitForm.isFeatured));
    fd.append('taxRate', kitForm.taxRate || '0');
    fd.append('items', JSON.stringify(valid));
    fd.append('linkedPoojas', JSON.stringify(kitLinkedPoojas));
    if (kitImage) fd.append('image', kitImage);
    setSaving(true);
    try {
      await API.patch(`/marketplace/kits/${editingKit._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Kit updated');
      setEditingKit(null);
      setView('kits');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const navBtn = (v, lbl) => (
    <button key={v} onClick={() => setView(v)}
      className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view===v ? 'bg-saffron-500 text-white' : 'bg-white border text-gray-600'}`}>
      {lbl || v.replace('-', ' ')}
    </button>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Marketplace Management</h1>
      <div className="flex gap-2 flex-wrap">
        {navBtn('products', 'Products')}
        {navBtn('kits', 'Kits')}
        {navBtn('add-product', '+ Add Product')}
        {navBtn('add-kit', '+ Add Kit')}
      </div>

      {/* ── Products List ── */}
      {view === 'products' && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 text-sm" placeholder="Search by name, category, tag..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-white rounded-xl animate-pulse border border-gray-100" />)}</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
                  {['Product','Category','Visibility','Price','Stock','Status','Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredProducts.map((p) => (
                    <tr key={p._id} className={p.isDeleted ? 'opacity-50 bg-red-50/20' : 'hover:bg-gray-50/50 transition-colors'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.images?.[0]
                            ? <img src={`http://localhost:5000/${p.images[0]}`} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                            : <div className="w-8 h-8 rounded-lg bg-saffron-50 flex items-center justify-center shrink-0 text-sm">📦</div>}
                          <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize text-xs">{p.category}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(VISIBILITY_META[p.visibilityType] || VISIBILITY_META.marketplace).cls}`}>
                          {(VISIBILITY_META[p.visibilityType] || VISIBILITY_META.marketplace).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-saffron-600 text-xs whitespace-nowrap">
                        {p.salePrice ? <><s className="text-gray-400 font-normal">₹{p.price}</s> ₹{p.salePrice}</> : `₹${p.price}`}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{p.stock}</td>
                      <td className="px-4 py-3">
                        {p.isDeleted
                          ? <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Deleted</span>
                          : <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {p.isActive ? 'Active' : 'Inactive'}
                            </span>}
                      </td>
                      <td className="px-4 py-3">
                        {!p.isDeleted && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(p)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Edit3 size={13} />
                            </button>
                            <button onClick={() => handleToggleProduct(p)} title={p.isActive ? 'Deactivate' : 'Activate'}
                              className={`p-1.5 rounded-lg transition-colors ${p.isActive ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                              {p.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button onClick={() => handleDeleteProduct(p)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredProducts.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-gray-400 text-sm">No products found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add Product ── */}
      {view === 'add-product' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-xl">
          <h2 className="font-bold text-gray-800 mb-4">Add Product</h2>
          <ProductForm form={productForm} setForm={setProductForm} images={productImages} setImages={setProductImages}
            onSubmit={handleCreateProduct} submitLabel="Add Product" loading={saving} />
        </div>
      )}

      {/* ── Edit Product ── */}
      {view === 'edit-product' && editingProd && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => { setView('products'); setEditingProd(null); }} className="text-sm text-saffron-600 hover:underline">← Back</button>
            <h2 className="font-bold text-gray-800">Edit: {editingProd.name}</h2>
          </div>
          <ProductForm form={productForm} setForm={setProductForm} images={productImages} setImages={setProductImages}
            onSubmit={handleUpdateProduct} submitLabel="Save Changes" loading={saving} />
        </div>
      )}

      {/* ── Kits List ── */}
      {view === 'kits' && !loading && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 text-sm" placeholder="Search kits by name..." value={kitSearch} onChange={(e) => setKitSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {kits.filter((k) => !kitSearch || k.name.toLowerCase().includes(kitSearch.toLowerCase())).map((k) => (
              <div key={k._id} className="bg-white rounded-2xl border border-gray-100 p-4">
                {k.image && <img src={`http://localhost:5000/${k.image}`} alt="" className="w-full h-32 object-cover rounded-xl mb-3" />}
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-semibold text-gray-800">{k.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{k.items?.length} items · {k.linkedPoojas?.length > 0 ? `${k.linkedPoojas.length} poojas linked` : 'No poojas linked'}</p>
                    {k.totalCost > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">Cost: ₹{k.totalCost?.toLocaleString('en-IN')}
                        {k.discountValue > 0 && <span className="ml-1 text-green-600"> − {k.discountType === 'percentage' ? `${k.discountValue}%` : `₹${k.discountValue}`}</span>}
                      </p>
                    )}
                    <p className="text-saffron-600 font-bold text-sm mt-0.5">Sell: ₹{k.discountPrice?.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEditKit(k)} title="Edit" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit3 size={14} /></button>
                    <button onClick={() => handleDeleteKit(k._id)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {k.items?.slice(0, 4).map((item, i) => (
                    <span key={i} className="text-xs bg-saffron-50 text-saffron-700 px-2 py-0.5 rounded-full">
                      {item.productId?.name || '—'}{item.variantLabel ? ` (${item.variantLabel})` : ''} ×{item.quantity}
                    </span>
                  ))}
                  {k.items?.length > 4 && <span className="text-xs text-gray-400">+{k.items.length - 4} more</span>}
                </div>
              </div>
            ))}
            {kits.filter((k) => !kitSearch || k.name.toLowerCase().includes(kitSearch.toLowerCase())).length === 0 && (
              <p className="text-gray-400 text-sm col-span-2">{kitSearch ? 'No kits match your search.' : 'No kits yet.'}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Add Kit ── */}
      {view === 'add-kit' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-2xl">
          <h2 className="font-bold text-gray-800 mb-4">Create Kit</h2>
          <form onSubmit={handleCreateKit} className="space-y-4">
            <div><label className="label">Kit Name *</label><input required className="input" value={kitForm.name} onChange={(e)=>setKitForm({...kitForm,name:e.target.value})} /></div>
            <div><label className="label">Description</label><textarea rows={2} className="input resize-none" value={kitForm.description} onChange={(e)=>setKitForm({...kitForm,description:e.target.value})} /></div>

            <div>
              <label className="label">Kit Items * <span className="text-gray-400 font-normal text-xs">(includes kit-only products)</span></label>
              <div className="space-y-2">
                {kitItems.map((item, idx) => {
                  // Resolve the selected product and optionally selected variant
                  const prod = kitBuilderProducts.find((p) => p._id === item.productId);
                  const variant = prod?.variants?.find((v) => v.variantId === item.variantId);
                  const unitPrice = variant ? variant.price : (prod ? (prod.salePrice || prod.price) : 0);
                  // Kit dropdown value: "productId" for flat, "productId::variantId" for variants
                  const selectValue = item.variantId ? `${item.productId}::${item.variantId}` : (item.productId || '');
                  return (
                    <div key={idx} className="flex gap-2 items-center">
                      <select className="input flex-1 text-sm" value={selectValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          const [pid, vid] = val.includes('::') ? val.split('::') : [val, null];
                          const p = kitBuilderProducts.find((p) => p._id === pid);
                          const vt = vid ? p?.variants?.find((v) => v.variantId === vid) : null;
                          const n = [...kitItems];
                          n[idx] = { ...n[idx], productId: pid, variantId: vid || null, variantLabel: vt?.quantity || null };
                          setKitItems(n);
                        }}>
                        <option value="">Select product</option>
                        {kitBuilderProducts.map((p) =>
                          p.variants?.length > 0 ? (
                            <optgroup key={p._id} label={p.name + (p.visibilityType === 'kit_only' ? ' (Kit Only)' : '')}>
                              {p.variants.filter((v) => v.isActive !== false && v.stock > 0).map((v) => (
                                <option key={v.variantId} value={`${p._id}::${v.variantId}`}>
                                  {v.quantity} — ₹{v.price} (Stock: {v.stock})
                                </option>
                              ))}
                            </optgroup>
                          ) : (
                            <option key={p._id} value={p._id}>
                              {p.name} — ₹{p.salePrice || p.price}{p.visibilityType === 'kit_only' ? ' (Kit Only)' : ''}
                            </option>
                          )
                        )}
                      </select>
                      <input type="number" min="1" className="input w-20 text-sm" value={item.quantity}
                        onChange={(e)=>{ const n=[...kitItems]; n[idx].quantity=+e.target.value||1; setKitItems(n); }} />
                      {prod && <span className="text-xs text-saffron-600 font-medium whitespace-nowrap">₹{(unitPrice * item.quantity).toLocaleString('en-IN')}</span>}
                      <button type="button" onClick={() => setKitItems(kitItems.filter((_,i)=>i!==idx))} className="text-red-400 hover:text-red-600 text-lg px-1">×</button>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setKitItems([...kitItems,{productId:'',quantity:1}])} className="text-sm text-saffron-600 mt-2 hover:underline">+ Add Item</button>
            </div>

            {kitTotalCost > 0 && (
              <div className="bg-saffron-50 border border-saffron-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Product Total Cost</span>
                  <span className="text-lg font-bold text-gray-800">₹{kitTotalCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Discount Type</label>
                    <div className="flex gap-2">
                      {[['percentage','% Percent'],['fixed','₹ Fixed']].map(([val,lbl]) => (
                        <button key={val} type="button" onClick={() => { setKitForm({...kitForm,discountType:val}); setKitPriceOverride(false); }}
                          className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-2 rounded-lg border font-medium transition-colors ${kitForm.discountType===val?'bg-saffron-500 text-white border-saffron-500':'bg-white text-gray-600 border-gray-300'}`}>
                          {val==='percentage'?<Percent size={11}/>:<Tag size={11}/>} {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Discount Value</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{kitForm.discountType==='percentage'?'%':'₹'}</span>
                      <input type="number" min="0" max={kitForm.discountType==='percentage'?100:kitTotalCost} className="input pl-7" value={kitForm.discountValue}
                        onChange={(e)=>{ setKitForm({...kitForm,discountValue:e.target.value}); setKitPriceOverride(false); }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-saffron-200 pt-3">
                  <span className="text-sm font-semibold text-gray-700">Selling Price</span>
                  <input type="number" min="0"
                    className={`input w-32 text-right font-bold text-lg ${kitPriceOverride?'border-saffron-400 bg-yellow-50':'bg-green-50 border-green-300'}`}
                    value={kitSellingPrice}
                    onChange={(e)=>{ setKitSellingPrice(e.target.value); setKitPriceOverride(true); }}
                    onFocus={()=>setKitPriceOverride(true)} />
                </div>
                {kitPriceOverride && <button type="button" onClick={()=>setKitPriceOverride(false)} className="text-xs text-saffron-600 hover:underline">↺ Recalculate from discount</button>}
                {+kitSellingPrice > kitTotalCost && <p className="text-xs text-orange-600 bg-orange-50 rounded-lg p-2">⚠ Selling price exceeds product total cost.</p>}
              </div>
            )}
            {kitTotalCost === 0 && <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center text-sm text-gray-500">Select products above to see auto-calculated pricing</div>}

            <div>
              <label className="label">Link to Poojas <span className="text-gray-400 font-normal text-xs">(kit will be offered during these bookings)</span></label>
              <div className="border rounded-xl p-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-1" style={{ borderColor: 'var(--t-border)' }}>
                {availablePoojas.map((p) => (
                  <label key={p._id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer hover:bg-saffron-50 text-xs">
                    <input type="checkbox" checked={kitLinkedPoojas.includes(p._id)}
                      onChange={() => setKitLinkedPoojas((prev) => prev.includes(p._id) ? prev.filter((x) => x !== p._id) : [...prev, p._id])}
                      className="accent-saffron-500" />
                    <span className="text-gray-700 truncate">{p.name}</span>
                  </label>
                ))}
                {availablePoojas.length === 0 && <p className="text-xs text-gray-400 col-span-2">No active poojas found</p>}
              </div>
              {kitLinkedPoojas.length > 0 && <p className="text-xs text-saffron-600 mt-1">{kitLinkedPoojas.length} pooja(s) linked</p>}
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <div><label className="label">Kit Image</label><input type="file" accept="image/*" onChange={(e)=>setKitImage(e.target.files[0])} className="text-sm" /></div>
              <div>
                <label className="label">Tax Rate (GST %)</label>
                <input type="number" min="0" max="100" step="0.5" className="input" placeholder="e.g. 5, 12, 18" value={kitForm.taxRate} onChange={(e)=>setKitForm({...kitForm,taxRate:e.target.value})} />
              </div>
              <div className="pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={kitForm.isFeatured} onChange={(e)=>setKitForm({...kitForm,isFeatured:e.target.checked})} />
                  <span className="text-sm text-gray-700">Featured Kit</span>
                </label>
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 w-full justify-center"><Plus size={16}/>{saving?'Creating...':'Create Kit'}</button>
          </form>
        </div>
      )}

      {/* ── Edit Kit ── */}
      {view === 'edit-kit' && editingKit && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => { setView('kits'); setEditingKit(null); }} className="text-sm text-saffron-600 hover:underline">← Back</button>
            <h2 className="font-bold text-gray-800">Edit Kit: {editingKit.name}</h2>
          </div>
          <form onSubmit={handleUpdateKit} className="space-y-4">
            <div><label className="label">Kit Name *</label><input required className="input" value={kitForm.name} onChange={(e)=>setKitForm({...kitForm,name:e.target.value})} /></div>
            <div><label className="label">Description</label><textarea rows={2} className="input resize-none" value={kitForm.description} onChange={(e)=>setKitForm({...kitForm,description:e.target.value})} /></div>

            <div>
              <label className="label">Kit Items * <span className="text-gray-400 font-normal text-xs">(includes kit-only products)</span></label>
              <div className="space-y-2">
                {kitItems.map((item, idx) => {
                  const prod = kitBuilderProducts.find((p) => p._id === item.productId);
                  const variant = prod?.variants?.find((v) => v.variantId === item.variantId);
                  const unitPrice = variant ? variant.price : (prod ? (prod.salePrice || prod.price) : 0);
                  const selectValue = item.variantId ? `${item.productId}::${item.variantId}` : (item.productId || '');
                  return (
                    <div key={idx} className="flex gap-2 items-center">
                      <select className="input flex-1 text-sm" value={selectValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          const [pid, vid] = val.includes('::') ? val.split('::') : [val, null];
                          const p = kitBuilderProducts.find((p) => p._id === pid);
                          const vt = vid ? p?.variants?.find((v) => v.variantId === vid) : null;
                          const n = [...kitItems];
                          n[idx] = { ...n[idx], productId: pid, variantId: vid || null, variantLabel: vt?.quantity || null };
                          setKitItems(n);
                        }}>
                        <option value="">Select product</option>
                        {kitBuilderProducts.map((p) =>
                          p.variants?.length > 0 ? (
                            <optgroup key={p._id} label={p.name + (p.visibilityType === 'kit_only' ? ' (Kit Only)' : '')}>
                              {p.variants.filter((v) => v.isActive !== false && v.stock > 0).map((v) => (
                                <option key={v.variantId} value={`${p._id}::${v.variantId}`}>
                                  {v.quantity} — ₹{v.price} (Stock: {v.stock})
                                </option>
                              ))}
                            </optgroup>
                          ) : (
                            <option key={p._id} value={p._id}>
                              {p.name} — ₹{p.salePrice || p.price}{p.visibilityType === 'kit_only' ? ' (Kit Only)' : ''}
                            </option>
                          )
                        )}
                      </select>
                      <input type="number" min="1" className="input w-20 text-sm" value={item.quantity}
                        onChange={(e)=>{ const n=[...kitItems]; n[idx].quantity=+e.target.value||1; setKitItems(n); }} />
                      {prod && <span className="text-xs text-saffron-600 font-medium whitespace-nowrap">₹{(unitPrice * item.quantity).toLocaleString('en-IN')}</span>}
                      <button type="button" onClick={() => setKitItems(kitItems.filter((_,i)=>i!==idx))} className="text-red-400 hover:text-red-600 text-lg px-1">×</button>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setKitItems([...kitItems,{productId:'',quantity:1}])} className="text-sm text-saffron-600 mt-2 hover:underline">+ Add Item</button>
            </div>

            {kitTotalCost > 0 && (
              <div className="bg-saffron-50 border border-saffron-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Product Total Cost</span>
                  <span className="text-lg font-bold text-gray-800">₹{kitTotalCost.toLocaleString('en-IN')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Discount Type</label>
                    <div className="flex gap-2">
                      {[['percentage','% Percent'],['fixed','₹ Fixed']].map(([val,lbl]) => (
                        <button key={val} type="button" onClick={() => { setKitForm({...kitForm,discountType:val}); setKitPriceOverride(false); }}
                          className={`flex-1 flex items-center justify-center gap-1 text-xs px-2 py-2 rounded-lg border font-medium transition-colors ${kitForm.discountType===val?'bg-saffron-500 text-white border-saffron-500':'bg-white text-gray-600 border-gray-300'}`}>
                          {val==='percentage'?<Percent size={11}/>:<Tag size={11}/>} {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Discount Value</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{kitForm.discountType==='percentage'?'%':'₹'}</span>
                      <input type="number" min="0" className="input pl-7" value={kitForm.discountValue}
                        onChange={(e)=>{ setKitForm({...kitForm,discountValue:e.target.value}); setKitPriceOverride(false); }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-saffron-200 pt-3">
                  <span className="text-sm font-semibold text-gray-700">Selling Price</span>
                  <input type="number" min="0"
                    className={`input w-32 text-right font-bold text-lg ${kitPriceOverride?'border-saffron-400 bg-yellow-50':'bg-green-50 border-green-300'}`}
                    value={kitSellingPrice}
                    onChange={(e)=>{ setKitSellingPrice(e.target.value); setKitPriceOverride(true); }} />
                </div>
              </div>
            )}

            <div>
              <label className="label">Link to Poojas <span className="text-gray-400 font-normal text-xs">(kit will be offered during these bookings)</span></label>
              <div className="border rounded-xl p-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-1" style={{ borderColor: 'var(--t-border)' }}>
                {availablePoojas.map((p) => (
                  <label key={p._id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer hover:bg-saffron-50 text-xs">
                    <input type="checkbox" checked={kitLinkedPoojas.includes(p._id)}
                      onChange={() => setKitLinkedPoojas((prev) => prev.includes(p._id) ? prev.filter((x) => x !== p._id) : [...prev, p._id])}
                      className="accent-saffron-500" />
                    <span className="text-gray-700 truncate">{p.name}</span>
                  </label>
                ))}
                {availablePoojas.length === 0 && <p className="text-xs text-gray-400 col-span-2">No active poojas found</p>}
              </div>
              {kitLinkedPoojas.length > 0 && <p className="text-xs text-saffron-600 mt-1">{kitLinkedPoojas.length} pooja(s) linked</p>}
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="label">Kit Image</label>
                {editingKit.image && <img src={`http://localhost:5000/${editingKit.image}`} alt="" className="w-16 h-16 object-cover rounded-lg mb-1" />}
                <input type="file" accept="image/*" onChange={(e)=>setKitImage(e.target.files[0])} className="text-sm" />
              </div>
              <div>
                <label className="label">Tax Rate (GST %)</label>
                <input type="number" min="0" max="100" step="0.5" className="input" placeholder="e.g. 5, 12, 18" value={kitForm.taxRate} onChange={(e)=>setKitForm({...kitForm,taxRate:e.target.value})} />
              </div>
              <div className="pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={kitForm.isFeatured} onChange={(e)=>setKitForm({...kitForm,isFeatured:e.target.checked})} />
                  <span className="text-sm text-gray-700">Featured Kit</span>
                </label>
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 w-full justify-center"><Edit3 size={16}/>{saving?'Saving...':'Save Changes'}</button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Temples Tab ──────────────────────────────────────────────
const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

function TemplesTab() {
  const [temples, setTemples] = useState([]);
  const [form,    setForm]    = useState({ name:'', address:'', city:'', state:'', pincode:'', description:'' });
  const [mapCoords, setMapCoords] = useState(INDIA_CENTER);
  const [images,  setImages]  = useState([]);
  const [view,    setView]    = useState('list');
  const [saving,  setSaving]  = useState(false);
  const [geoStatus, setGeoStatus] = useState('idle'); // 'idle' | 'loading' | 'notfound'
  const geocodeTimerRef   = useRef(null);
  const userChangedFormRef = useRef(false);

  const load = () => API.get('/temples?limit=50').then(({ data }) => setTemples(data.temples));
  useEffect(() => { load(); }, []);

  // Debounced forward geocoding when address/city/state fields change
  useEffect(() => {
    if (!userChangedFormRef.current) return;
    const hasContent = form.address || form.city || form.state;
    if (!hasContent) return;

    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeoStatus('loading');

    geocodeTimerRef.current = setTimeout(async () => {
      const result = await forwardGeocode(form.address, form.city, form.state, form.pincode);
      if (result.found) {
        setMapCoords({ lat: result.lat, lng: result.lng });
        setGeoStatus('idle');
      } else {
        setGeoStatus('notfound');
        setTimeout(() => setGeoStatus((prev) => prev === 'notfound' ? 'idle' : prev), 3000);
      }
    }, 900);
  }, [form.address, form.city, form.state]);

  // When pincode auto-fills city/state, geocode immediately
  const handlePincodeFill = useCallback(({ state, city }) => {
    if (!city && !state) return;
    userChangedFormRef.current = true;
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeoStatus('loading');
    forwardGeocode('', city, state, '').then((result) => {
      if (result.found) {
        setMapCoords({ lat: result.lat, lng: result.lng });
        setGeoStatus('idle');
      } else {
        setGeoStatus('notfound');
        setTimeout(() => setGeoStatus((prev) => prev === 'notfound' ? 'idle' : prev), 3000);
      }
    });
  }, []);

  const handleFormChange = useCallback((field) => (e) => {
    userChangedFormRef.current = true;
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }, []);

  const handlePinMove = useCallback((lat, lng, address) => {
    setMapCoords({ lat, lng });
    if (address) {
      setForm((prev) => ({ ...prev, address: address.split(',').slice(0, 3).join(',').trim() }));
    }
  }, []);

  const createTemple = async (e) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
    fd.append('latitude',  mapCoords.lat);
    fd.append('longitude', mapCoords.lng);
    images.forEach((f) => fd.append('images', f));
    try {
      await API.post('/temples', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Temple added with map location!');
      setForm({ name:'', address:'', city:'', state:'', pincode:'', description:'' });
      setMapCoords(INDIA_CENTER);
      setImages([]);
      setView('list');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteTemple = async (id) => {
    if (!window.confirm('Remove temple?')) return;
    await API.delete(`/temples/${id}`);
    toast.success('Temple removed');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Temple Directory</h1>
        <button onClick={() => setView(view === 'add' ? 'list' : 'add')}
          className={view === 'add' ? 'btn-outline text-sm px-4 py-2' : 'btn-primary text-sm px-4 py-2 flex items-center gap-2'}>
          {view === 'add' ? '← Back to List' : <><Plus size={16} />Add Temple</>}
        </button>
      </div>

      {view === 'add' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left — form */}
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="font-bold text-gray-800 mb-4">Add Temple</h2>
            <form onSubmit={createTemple} className="space-y-4">
              <div>
                <label className="label">Temple Name *</label>
                <input required className="input" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} />
              </div>
              <div>
                <label className="label">Pincode</label>
                <PincodeInput
                  value={form.pincode}
                  onChange={(v) => { userChangedFormRef.current = true; setForm((p) => ({ ...p, pincode: v })); }}
                  onFill={({ state, city, district }) => {
                    setForm((p) => ({ ...p, state, city }));
                    handlePincodeFill({ state, city });
                  }}
                />
              </div>
              {(form.state || form.city) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">City</label>
                    <input className="input bg-saffron-50" value={form.city} onChange={handleFormChange('city')} />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input className="input bg-saffron-50" value={form.state} onChange={handleFormChange('state')} />
                  </div>
                </div>
              )}
              {!form.state && !form.city && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">City *</label><input required className="input" value={form.city} onChange={handleFormChange('city')} /></div>
                  <div><label className="label">State *</label><input required className="input" value={form.state} onChange={handleFormChange('state')} /></div>
                </div>
              )}
              <div>
                <label className="label">Address</label>
                <input className="input" value={form.address} onChange={handleFormChange('address')} placeholder="Auto-filled when pin is dragged" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs text-gray-500">Latitude</label>
                  <input className="input bg-blue-50 text-sm font-mono" readOnly value={mapCoords.lat.toFixed(6)} />
                </div>
                <div>
                  <label className="label text-xs text-gray-500">Longitude</label>
                  <input className="input bg-blue-50 text-sm font-mono" readOnly value={mapCoords.lng.toFixed(6)} />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea rows={3} className="input resize-none" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} />
              </div>
              <div>
                <label className="label">Temple Images (up to 5)</label>
                <input type="file" accept="image/*" multiple onChange={(e)=>setImages([...e.target.files])} className="text-sm" />
              </div>
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 w-full justify-center">
                {saving ? 'Adding...' : <><Plus size={16} />Add Temple</>}
              </button>
            </form>
          </div>

          {/* Right — map */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <MapPin size={14} className="text-saffron-500" /> Drag pin or click to set exact location
            </p>
            {geoStatus === 'loading' && (
              <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl">
                <Loader size={12} className="animate-spin shrink-0" />
                Updating map location...
              </div>
            )}
            {geoStatus === 'notfound' && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                Nearby location shown — enter more details for a precise pin.
              </div>
            )}
            <MapPicker
              lat={mapCoords.lat}
              lng={mapCoords.lng}
              onPinMove={handlePinMove}
              height="440px"
            />
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {temples.map((t) => (
            <div key={t._id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              {t.images?.[0]
                ? <img src={`http://localhost:5000/${t.images[0]}`} alt="" className="w-full h-36 object-cover" />
                : <div className="w-full h-36 bg-saffron-50 flex items-center justify-center text-4xl">🛕</div>
              }
              <div className="p-4">
                <p className="font-bold text-gray-800">{t.name}</p>
                <p className="text-sm text-gray-500 mt-0.5">{t.city}, {t.state}</p>
                {t.latitude && <p className="text-xs text-blue-500 mt-1">{t.latitude.toFixed(4)}, {t.longitude.toFixed(4)}</p>}
                <button onClick={() => deleteTemple(t._id)} className="mt-2 text-xs text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          ))}
          {temples.length === 0 && <p className="col-span-3 text-center py-10 text-gray-400">No temples added yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Livestreams Tab ──────────────────────────────────────────
function LivestreamsTab() {
  const [streams,  setStreams]  = useState([]);
  const [temples,  setTemples]  = useState([]);
  const [form,     setForm]     = useState({ templeId:'', title:'', description:'', youtubeUrl:'' });
  const [view,     setView]     = useState('list');
  const [saving,   setSaving]   = useState(false);

  const load = () => {
    Promise.all([
      API.get('/livestreams'),
      API.get('/temples?limit=100'),
    ]).then(([s, t]) => { setStreams(s.data.livestreams); setTemples(t.data.temples); });
  };

  useEffect(() => { load(); }, []);

  const createStream = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.post('/livestreams', form);
      toast.success('Livestream added');
      setForm({ templeId:'', title:'', description:'', youtubeUrl:'' });
      setView('list');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteStream = async (id) => {
    await API.delete(`/livestreams/${id}`);
    toast.success('Removed');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Livestream Management</h1>
        <button onClick={() => setView(view === 'add' ? 'list' : 'add')}
          className={view === 'add' ? 'btn-outline text-sm px-4 py-2' : 'btn-primary text-sm px-4 py-2 flex items-center gap-2'}>
          {view === 'add' ? '← Back' : <><Plus size={16} />Add Livestream</>}
        </button>
      </div>

      {view === 'add' && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 max-w-md">
          <h2 className="font-bold text-gray-800 mb-4">Add Livestream</h2>
          <form onSubmit={createStream} className="space-y-4">
            <div>
              <label className="label">Temple *</label>
              <select required className="input" value={form.templeId} onChange={(e)=>setForm({...form,templeId:e.target.value})}>
                <option value="">Select temple</option>
                {temples.map((t) => <option key={t._id} value={t._id}>{t.name}, {t.city}</option>)}
              </select>
            </div>
            <div><label className="label">Title *</label><input required className="input" placeholder="e.g. Morning Aarti" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} /></div>
            <div><label className="label">YouTube URL *</label><input required type="url" className="input" placeholder="https://youtube.com/watch?v=..." value={form.youtubeUrl} onChange={(e)=>setForm({...form,youtubeUrl:e.target.value})} /></div>
            <div><label className="label">Description</label><textarea rows={2} className="input resize-none" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} /></div>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? 'Adding...' : <><Plus size={16} />Add Livestream</>}
            </button>
          </form>
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-3">
          {streams.map((s) => (
            <div key={s._id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-saffron-50 rounded-xl flex items-center justify-center shrink-0">
                  <Tv size={18} className="text-saffron-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{s.title}</p>
                  <p className="text-xs text-gray-500">{s.templeId?.name} — {s.templeId?.city}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a href={s.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">View</a>
                <button onClick={() => deleteStream(s._id)} className="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          ))}
          {streams.length === 0 && <p className="text-center py-10 text-gray-400">No livestreams yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Referral Stats Tab ────────────────────────────────────────
function ReferralStatsTab() {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/referral/admin/stats')
      .then(({ data: d }) => setData(d.stats))
      .catch(() => toast.error('Could not load referral stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Referral Statistics</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-saffron-50 rounded-xl flex items-center justify-center">
            <Users size={22} className="text-saffron-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{data?.totalReferred ?? 0}</p>
            <p className="text-sm text-gray-500">Total Users Referred</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
            <Gift size={22} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{data?.usersWithCode ?? 0}</p>
            <p className="text-sm text-gray-500">Users with Referral Code</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-700">Top Referrers</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {data?.topReferrers?.length === 0 && (
            <p className="text-center py-10 text-gray-400">No referrals yet.</p>
          )}
          {data?.topReferrers?.map((u, i) => (
            <div key={u._id} className="px-5 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-saffron-100 text-saffron-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.phone} {u.email ? `· ${u.email}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs font-mono bg-saffron-50 text-saffron-700 px-2 py-0.5 rounded-lg">{u.referralCode}</span>
                <span className="font-bold text-saffron-600">{u.referralCount} refs</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── System Settings Tab ──────────────────────────────────────
const SETTING_SECTIONS = [
  { key: 'general',   label: 'General',   icon: Settings },
  { key: 'payment',    label: 'Payment',    icon: CreditCard },
  { key: 'commission', label: 'Commission', icon: Percent },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageSquare },
  { key: 'email',     label: 'Email',     icon: Mail },
  { key: 'ai',        label: 'AI',        icon: Cpu },
  { key: 'media',     label: 'Media',     icon: Image },
  { key: 'security',  label: 'Security',  icon: Shield },
];

function SecretInput({ label, name, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder || 'Enter value to update'}
          className="input pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

// ─── General Settings Section (logo upload + contact) ─────────
function GeneralSettingsSection({ form, setForm, saving, setSaving }) {
  const [logoFile, setLogoFile] = useState(null);
  const set = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const saveText = async () => {
    setSaving(true);
    try {
      await API.patch('/admin/settings', {
        platformName:   form.platformName   || '',
        contactEmail:   form.contactEmail   || '',
        supportPhone:   form.supportPhone   || '',
        supportAddress: form.supportAddress || '',
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    setSaving(true);
    const fd = new FormData();
    fd.append('logo', logoFile);
    try {
      const { data } = await API.patch('/admin/settings', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Logo uploaded');
      setLogoFile(null);
      if (data.logo) setForm((f) => ({ ...f, logo: data.logo }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setSaving(false); }
  };

  const currentLogoUrl = form.logo
    ? (form.logo.startsWith('http') ? form.logo : `http://localhost:5000/${form.logo}`)
    : null;

  return (
    <SectionForm title="General Settings" onSave={saveText} saving={saving}>
      <Field label="Platform Name" name="platformName" value={form.platformName || ''} onChange={set} />

      {/* Logo upload */}
      <div>
        <label className="label">Platform Logo</label>
        {currentLogoUrl && (
          <div className="mb-3 flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <img src={currentLogoUrl} alt="Current logo" className="h-10 max-w-[120px] object-contain" />
            <p className="text-xs text-gray-400">Current logo</p>
          </div>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
          onChange={(e) => setLogoFile(e.target.files[0])}
          className="text-sm"
        />
        <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP, or SVG · Max 5 MB</p>
        {logoFile && (
          <button type="button" onClick={uploadLogo} disabled={saving}
            className="btn-primary text-xs px-3 py-1.5 mt-2 flex items-center gap-1">
            <Upload size={12} /> {saving ? 'Uploading...' : 'Upload Logo'}
          </button>
        )}
      </div>

      <Field label="Contact Email" name="contactEmail" type="email" value={form.contactEmail || ''} onChange={set} />
      <Field label="Support Phone" name="supportPhone" value={form.supportPhone || ''} onChange={set} placeholder="+91-XXXXXXXXXX" />
      <Field label="Support Address" name="supportAddress" value={form.supportAddress || ''} onChange={set} placeholder="New Delhi, India" />
    </SectionForm>
  );
}

function SystemSettingsTab() {
  const [section,  setSection]  = useState('general');
  const [form,     setForm]     = useState({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    API.get('/admin/settings')
      .then(({ data }) => setForm(data.settings || {}))
      .catch(() => toast.error('Could not load settings'))
      .finally(() => setLoading(false));
  }, []);

  const set = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const save = async (fields) => {
    setSaving(true);
    const payload = {};
    fields.forEach(k => { payload[k] = form[k] ?? ''; });
    try {
      await API.patch('/admin/settings', payload);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const sectionContent = {
    general: (
      <GeneralSettingsSection form={form} setForm={setForm} saving={saving} setSaving={setSaving} />
    ),
    payment: (
      <SectionForm title="Payment — PhonePe" onSave={() => save(['phonepeEnv','phonepeMerchantId','phonepeSaltKey','phonepeSaltIndex','phonepeWebhookUrl','phonepeRedirectUrl'])} saving={saving}>
        <div>
          <label className="label">Environment</label>
          <div className="flex gap-3">
            {['sandbox','prod'].map(env => (
              <label key={env} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="phonepeEnv" value={env} checked={(form.phonepeEnv || 'sandbox') === env} onChange={set} />
                <span className={`text-sm font-medium ${env === 'prod' ? 'text-red-600' : 'text-green-600'}`}>
                  {env === 'prod' ? 'Production' : 'Sandbox'}
                </span>
              </label>
            ))}
          </div>
          {form.phonepeEnv === 'prod' && (
            <p className="mt-1 text-xs text-red-600 bg-red-50 rounded-lg p-2">
              Production mode will charge real money. Verify all credentials before saving.
            </p>
          )}
        </div>
        <Field label="Merchant ID" name="phonepeMerchantId" value={form.phonepeMerchantId || ''} onChange={set} />
        <SecretInput label="Salt Key" name="phonepeSaltKey" value={form.phonepeSaltKey || ''} onChange={set} />
        <Field label="Salt Index" name="phonepeSaltIndex" value={form.phonepeSaltIndex || '1'} onChange={set} />
        <Field label="Webhook Callback URL" name="phonepeWebhookUrl" value={form.phonepeWebhookUrl || ''} onChange={set} placeholder="https://yourdomain.com/api/bookings/phonepe/callback" />
        <Field label="Redirect URL (after payment)" name="phonepeRedirectUrl" value={form.phonepeRedirectUrl || ''} onChange={set} placeholder="https://yourdomain.com/booking-status" />
      </SectionForm>
    ),
    commission: (
      <SectionForm title="Platform Commission & Tax" onSave={() => save(['platformCommissionPercent','platformGstPercent'])} saving={saving}>
        <InfoBox>These percentages are applied on top of the base pooja price and shown transparently to users at checkout.</InfoBox>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Platform Commission (%)</label>
            <div className="relative">
              <input type="number" name="platformCommissionPercent" min="0" max="100" step="0.5"
                value={form.platformCommissionPercent ?? 0} onChange={set} className="input pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="label">GST / Tax (%)</label>
            <div className="relative">
              <input type="number" name="platformGstPercent" min="0" max="100" step="0.5"
                value={form.platformGstPercent ?? 0} onChange={set} className="input pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ background: '#f8f9fa', borderColor: 'var(--t-border)' }}>
          <p className="text-xs font-semibold text-gray-600 mb-2">Preview (example ₹1000 pooja):</p>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between"><span>Base Price</span><span>₹1,000</span></div>
            <div className="flex justify-between"><span>Commission ({form.platformCommissionPercent || 0}%)</span><span>₹{Math.round(1000 * (form.platformCommissionPercent || 0) / 100)}</span></div>
            <div className="flex justify-between"><span>GST ({form.platformGstPercent || 0}%)</span><span>₹{Math.round((1000 + Math.round(1000 * (form.platformCommissionPercent || 0) / 100)) * (form.platformGstPercent || 0) / 100)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1 mt-1" style={{ borderColor: 'var(--t-border)' }}>
              <span>Total Charged</span>
              <span style={{ color: '#1B1F3B' }}>
                ₹{1000 + Math.round(1000 * (form.platformCommissionPercent || 0) / 100) + Math.round((1000 + Math.round(1000 * (form.platformCommissionPercent || 0) / 100)) * (form.platformGstPercent || 0) / 100)}
              </span>
            </div>
          </div>
        </div>
      </SectionForm>
    ),
    whatsapp: (
      <SectionForm title="WhatsApp (Meta Cloud API)" onSave={() => save(['whatsappAppId','whatsappPhoneNumberId','whatsappBusinessAccountId','whatsappAccessToken','whatsappApiVersion'])} saving={saving}>
        <Field label="Meta App ID" name="whatsappAppId" value={form.whatsappAppId || ''} onChange={set} />
        <Field label="Phone Number ID" name="whatsappPhoneNumberId" value={form.whatsappPhoneNumberId || ''} onChange={set} />
        <Field label="Business Account ID (WABA ID)" name="whatsappBusinessAccountId" value={form.whatsappBusinessAccountId || ''} onChange={set} placeholder="Needed for template sync" />
        <SecretInput label="Access Token" name="whatsappAccessToken" value={form.whatsappAccessToken || ''} onChange={set} />
        <Field label="API Version" name="whatsappApiVersion" value={form.whatsappApiVersion || 'v18.0'} onChange={set} placeholder="v18.0" />
        <InfoBox>Enter the permanent System User token from your Meta Business Manager. Business Account ID (WABA ID) is required to sync templates. Template messages require an approved WhatsApp Business Account.</InfoBox>
      </SectionForm>
    ),
    email: (
      <SectionForm title="Email / SMTP" onSave={() => save(['emailService','emailSmtpHost','emailSmtpPort','emailSmtpUser','emailSmtpPassword','emailSenderName'])} saving={saving}>
        <Field label="Sender Name" name="emailSenderName" value={form.emailSenderName || 'Zutsav'} onChange={set} placeholder="Zutsav" />
        <Field label="SMTP Host" name="emailSmtpHost" value={form.emailSmtpHost || ''} onChange={set} placeholder="smtp.larksuite.com" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">SMTP Port</label>
            <select name="emailSmtpPort" value={form.emailSmtpPort || 587} onChange={set} className="input">
              <option value={587}>587 (STARTTLS)</option>
              <option value={465}>465 (SSL)</option>
              <option value={25}>25 (Plain)</option>
            </select>
          </div>
          <Field label="SMTP Username" name="emailSmtpUser" type="email" value={form.emailSmtpUser || ''} onChange={set} />
        </div>
        <SecretInput label="SMTP Password" name="emailSmtpPassword" value={form.emailSmtpPassword || ''} onChange={set} />
        <InfoBox>Recommended: smtp.larksuite.com port 587 (STARTTLS) or 465 (SSL). Credentials are stored encrypted.</InfoBox>
        <TestEmailButton />
      </SectionForm>
    ),
    ai: (
      <SectionForm title="AI — Groq" onSave={() => save(['groqApiKey','groqModel'])} saving={saving}>
        <SecretInput label="Groq API Key" name="groqApiKey" value={form.groqApiKey || ''} onChange={set} />
        <div>
          <label className="label">Model</label>
          <select name="groqModel" value={form.groqModel || 'llama-3.3-70b-versatile'} onChange={set} className="input">
            {['llama-3.3-70b-versatile','llama-3.1-70b-versatile','llama-3.1-8b-instant','mixtral-8x7b-32768','gemma2-9b-it'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <InfoBox>Get your API key from console.groq.com. The llama-3.3-70b model gives the best quality for spiritual queries.</InfoBox>
      </SectionForm>
    ),
    media: (
      <SectionForm title="Media — Cloudinary" onSave={() => save(['cloudinaryCloudName','cloudinaryApiKey','cloudinaryApiSecret'])} saving={saving}>
        <Field label="Cloud Name" name="cloudinaryCloudName" value={form.cloudinaryCloudName || ''} onChange={set} />
        <Field label="API Key" name="cloudinaryApiKey" value={form.cloudinaryApiKey || ''} onChange={set} />
        <SecretInput label="API Secret" name="cloudinaryApiSecret" value={form.cloudinaryApiSecret || ''} onChange={set} />
        <InfoBox>Find credentials at cloudinary.com → Dashboard. Currently the platform stores uploads locally — Cloudinary integration can be wired in as an upload middleware upgrade.</InfoBox>
      </SectionForm>
    ),
    security: (
      <SectionForm title="Security" onSave={() => save(['sessionTimeoutMinutes','otpExpiryMinutes','passwordMinLength','passwordRequireUpper','passwordRequireSymbol'])} saving={saving}>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Session Timeout (min)" name="sessionTimeoutMinutes" type="number" value={form.sessionTimeoutMinutes ?? 60} onChange={set} />
          <Field label="OTP Expiry (min)" name="otpExpiryMinutes" type="number" value={form.otpExpiryMinutes ?? 10} onChange={set} />
          <Field label="Min Password Length" name="passwordMinLength" type="number" value={form.passwordMinLength ?? 6} onChange={set} />
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="passwordRequireUpper" checked={!!form.passwordRequireUpper} onChange={set} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700">Require uppercase letter in password</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" name="passwordRequireSymbol" checked={!!form.passwordRequireSymbol} onChange={set} className="w-4 h-4 rounded" />
            <span className="text-sm text-gray-700">Require symbol in password</span>
          </label>
        </div>
        <InfoBox>Password rules and session timeout apply to new authentications. Existing sessions are not invalidated retroactively.</InfoBox>
      </SectionForm>
    ),
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(27,31,59,0.08)' }}>
          <Settings size={18} style={{ color: '#1B1F3B' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"' }}>System Settings</h1>
          <p className="text-xs text-gray-400">All credentials stored in database — no server restart needed</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Section nav */}
        <aside className="hidden md:flex flex-col gap-1 w-44 flex-shrink-0">
          {SETTING_SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                section === key
                  ? 'text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={section === key ? { background: '#1B1F3B' } : {}}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </aside>

        {/* Mobile section selector */}
        <div className="md:hidden w-full">
          <select
            className="input mb-4"
            value={section}
            onChange={e => setSection(e.target.value)}
          >
            {SETTING_SECTIONS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          {sectionContent[section]}
        </div>
      </div>
    </div>
  );
}

function SectionForm({ title, children, onSave, saving }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">{title}</h2>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl text-white transition-all disabled:opacity-60"
          style={{ background: '#1B1F3B' }}
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save Section'}
        </button>
      </div>
      <div className="px-6 py-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );
}

// ─── Payout Management Tab ────────────────────────────────────
const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi',           label: 'UPI' },
  { value: 'cash',          label: 'Cash' },
  { value: 'other',         label: 'Other' },
];

function PayoutsTab() {
  const [view,          setView]          = useState('pending');   // 'pending' | 'history'
  const [pendingGroups, setPendingGroups] = useState([]);
  const [history,       setHistory]       = useState([]);
  const [historyStats,  setHistoryStats]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [payModal,      setPayModal]      = useState(null); // { type: 'batch'|'single', panditId?, bookingId?, amount, label }
  const [payMethod,     setPayMethod]     = useState('bank_transfer');
  const [payNote,       setPayNote]       = useState('');
  const [paying,        setPaying]        = useState(false);
  const [batchDetail,   setBatchDetail]   = useState(null); // expanded batch in history
  const loadPending = () => {
    setLoading(true);
    API.get('/admin/payouts/pending')
      .then(({ data }) => setPendingGroups(data.groups || []))
      .finally(() => setLoading(false));
  };
  const loadHistory = () => {
    setLoading(true);
    API.get('/admin/payouts/history?limit=50')
      .then(({ data }) => { setHistory(data.batches || []); setHistoryStats(data.stats); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (view === 'pending') loadPending();
    else loadHistory();
  }, [view]);

  const openPayModal = (type, panditId, bookingId, amount, label) => {
    setPayModal({ type, panditId, bookingId, amount, label });
    setPayMethod('bank_transfer');
    setPayNote('');
  };

  const confirmPay = async () => {
    setPaying(true);
    try {
      if (payModal.type === 'batch') {
        await API.post(`/admin/payouts/pay-batch/${payModal.panditId}`, { paymentMethod: payMethod, note: payNote });
        toast.success('Bulk payout processed successfully');
      } else {
        await API.post(`/admin/payouts/pay-single/${payModal.bookingId}`, { paymentMethod: payMethod, note: payNote });
        toast.success('Payout processed successfully');
      }
      setPayModal(null);
      loadPending();
    } catch (err) { toast.error(err.response?.data?.message || 'Payment failed'); }
    finally { setPaying(false); }
  };

  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">
      {/* Pay modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
              <IndianRupee size={22} className="text-green-600" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">Confirm Payout</h3>
            <p className="text-sm text-gray-500 mb-1">{payModal.label}</p>
            <p className="text-2xl font-bold text-green-700 mb-4">{fmt(payModal.amount)}</p>
            <label className="label">Payment Method</label>
            <select className="input mb-3 text-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <label className="label">Note (optional)</label>
            <input className="input mb-5 text-sm" placeholder="Transaction ref, remarks..." value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setPayModal(null)} disabled={paying} className="btn-outline flex-1">Cancel</button>
              <button onClick={confirmPay} disabled={paying}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors">
                {paying ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Payout Management</h1>
        <button onClick={() => view === 'pending' ? loadPending() : loadHistory()}
          className="text-xs text-gray-400 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
          <RotateCcw size={12} /> Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[{ key: 'pending', label: 'Pending Payouts' }, { key: 'history', label: 'Payout History' }].map(({ key, label }) => (
          <button key={key} onClick={() => setView(key)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${view === key ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : view === 'pending' ? (
        // ── Pending payouts ──────────────────────────────────
        <div className="space-y-5">
          {pendingGroups.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <CheckCircle size={40} className="text-green-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">All caught up!</p>
              <p className="text-gray-400 text-sm mt-1">No pending payouts at this time.</p>
            </div>
          ) : pendingGroups.map((group) => {
            const pandit = group.pandit;
            return (
              <div key={pandit?._id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Pandit header */}
                <div className="p-5 flex flex-col sm:flex-row items-start gap-4 bg-gray-50 border-b border-gray-100">
                  <div className="w-12 h-12 bg-saffron-100 rounded-xl flex items-center justify-center shrink-0">
                    <User size={20} className="text-saffron-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800">{pandit?.name || 'Unknown Pandit'}</h3>
                    <p className="text-sm text-gray-500">{pandit?.phone} · {pandit?.email}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-gray-400">{group.bookings.length} pending pooja{group.bookings.length > 1 ? 's' : ''}</span>
                      {pandit?.bankDetails?.accountNumber && (
                        <span className="text-xs text-gray-400">Bank: {pandit.bankDetails.bankName || 'on file'} ••{pandit.bankDetails.accountNumber.slice(-4)}</span>
                      )}
                      {pandit?.upiDetails?.upiId && !pandit?.bankDetails?.accountNumber && (
                        <span className="text-xs text-gray-400">UPI: {pandit.upiDetails.upiId}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold text-green-700">{fmt(group.totalAmount)}</p>
                    <p className="text-xs text-gray-400 mb-3">Total Due</p>
                    <button onClick={() => openPayModal('batch', pandit?._id, null, group.totalAmount, `Pay all ${group.bookings.length} poojas for ${pandit?.name}`)}
                      className="flex items-center gap-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-xl transition-colors">
                      <IndianRupee size={14} /> Pay All ({group.bookings.length})
                    </button>
                  </div>
                </div>
                {/* Individual bookings */}
                <div className="divide-y divide-gray-50">
                  {group.bookings.map((b) => (
                    <div key={b._id} className="px-5 py-3.5 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{b.poojaId?.name || 'Pooja Service'}</p>
                        <p className="text-xs text-gray-400">
                          #{b.bookingNumber} · {b.userId?.name} · Verified: {fmtDate(b.verifiedAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-gray-800">{fmt(b.payout?.amount)}</p>
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                      </div>
                      <button onClick={() => openPayModal('single', null, b._id, b.payout?.amount, `Pay for ${b.poojaId?.name} — #${b.bookingNumber}`)}
                        className="shrink-0 text-xs text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors">
                        Pay Now
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── Payout history ───────────────────────────────────
        <div className="space-y-4">
          {historyStats && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Paid Out',   value: fmt(historyStats.totalPaidOut),   color: 'text-green-700 bg-green-50'  },
                { label: 'Pending Payouts',  value: historyStats.pendingCount,          color: 'text-amber-700 bg-amber-50'  },
                { label: 'Pending Amount',   value: fmt(historyStats.pendingAmount),   color: 'text-orange-700 bg-orange-50'},
              ].map(({ label, value, color }) => (
                <div key={label} className={`rounded-2xl p-4 ${color} border border-current/10`}>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs mt-1 opacity-70">{label}</p>
                </div>
              ))}
            </div>
          )}
          {history.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <IndianRupee size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400">No payout batches yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Batch ID</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Pandit</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Payment</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Date</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Bookings</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Amount</th>
                    <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map((batch) => (
                    <>
                      <tr key={batch._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{batch.batchId}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{batch.panditId?.name || '—'}</p>
                          <p className="text-xs text-gray-400">{batch.panditId?.phone}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {PAYMENT_METHODS.find(m => m.value === batch.paymentMethod)?.label || batch.paymentMethod}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDate(batch.paidDate)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {batch.bookingIds?.length || 0} booking{(batch.bookingIds?.length || 0) !== 1 ? 's' : ''}
                          {batch.note && <p className="text-gray-400 italic">"{batch.note}"</p>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(batch.totalAmount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Paid</span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setBatchDetail(batchDetail === batch._id ? null : batch._id)}
                            className="text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                            {batchDetail === batch._id ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {batchDetail === batch._id && (
                        <tr key={`${batch._id}-detail`} className="bg-saffron-50">
                          <td colSpan={8} className="px-6 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 border-b border-saffron-100">
                                  <th className="text-left font-semibold py-1 pr-4">Booking #</th>
                                  <th className="text-left font-semibold py-1 pr-4">Pooja</th>
                                  <th className="text-right font-semibold py-1">Amount Paid</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-saffron-100">
                                {(batch.bookingIds || []).map((b) => (
                                  <tr key={b?._id || b?.toString()}>
                                    <td className="py-1.5 pr-4 font-mono font-bold text-gray-700">
                                      {b?.bookingNumber || '—'}
                                    </td>
                                    <td className="py-1.5 pr-4 text-gray-600">{b?.poojaId?.name || '—'}</td>
                                    <td className="py-1.5 text-right font-semibold text-green-700">{fmt(b?.payout?.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
      <span className="shrink-0 mt-0.5">ℹ</span>
      <span>{children}</span>
    </div>
  );
}

function TestEmailButton() {
  const [email, setEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const handleTest = async () => {
    if (!email) { toast.error('Enter a test email address'); return; }
    setTesting(true);
    try {
      await API.post('/admin/settings/test-email', { testEmail: email });
      toast.success('Test email sent! Check your inbox.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed — check SMTP settings');
    } finally { setTesting(false); }
  };
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="label">Test Connection</label>
        <input type="email" className="input" placeholder="test@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <button type="button" onClick={handleTest} disabled={testing}
        className="px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
        style={{ background: testing ? '#f3f4f6' : '#1B1F3B', color: testing ? '#9ca3af' : '#fff', borderColor: '#1B1F3B' }}>
        {testing ? 'Sending…' : 'Send Test'}
      </button>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin text-4xl">🪔</div>
    </div>
  );
}
