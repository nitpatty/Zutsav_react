import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Users, BookOpen, IndianRupee, Clock, CheckCircle, XCircle, Plus, User, LayoutDashboard, CalendarDays, ShoppingBag, MapPin, Tv, Package, Star, Trash2, Gift, Sparkles, Percent, Tag, Mail, ClipboardList, Truck, ChevronDown, RotateCcw, Search, Settings, CreditCard, MessageSquare, Cpu, Image, Shield, Save, Eye, EyeOff, Upload, AlertTriangle, ShieldCheck, FileText, Loader, X, BadgeCheck, Phone, Globe, Edit3, ToggleLeft, ToggleRight, RefreshCw, Download, ExternalLink, Navigation, ChevronRight, Receipt, Ban, Archive, Copy, Bell, BellOff, Zap, Filter, Send, ChevronUp, Activity } from 'lucide-react';
import CommunicationCenter from '../components/admin/CommunicationCenter';
import ZutsavLoader, { ZutsavLoaderInline } from '../components/shared/ZutsavLoader';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ProfilePhoto from '../components/shared/ProfilePhoto';
import MapPicker, { forwardGeocode } from '../components/shared/MapPicker';
import PincodeInput from '../components/shared/PincodeInput';


const statusColor  = { pending_payment:'badge-pending', paid:'badge-paid', pandit_assigned:'badge-assigned', pandit_accepted:'badge-approved', pending_reassignment:'badge-rejected', completion_requested:'badge-pending', completed:'badge-approved', cancelled:'badge-rejected' };
const statusLabel  = { pending_payment:'Pending Payment', paid:'New Booking', pandit_assigned:'Pandit Assigned', pandit_accepted:'Pandit Accepted', pending_reassignment:'Needs Reassignment', completion_requested:'Completion Pending', completed:'Completed', cancelled:'Cancelled', refunded:'Refunded', with_kit:'With Kit' };
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
      {tab === 'notifications'         && <NotificationsTab />}
      {tab === 'system-settings'       && <SystemSettingsTab />}
      {tab === 'payouts'               && <PayoutsTab />}
      {tab === 'blog-management'       && <BlogManagementTab />}
      {tab === 'invoices'              && <InvoicesTab />}
      {tab === 'profile'               && <AdminProfile user={user} refreshUser={refreshUser} />}
    </div>
  );
}

// ─── Activity Feed helpers ────────────────────────────────────
const ACTIVITY_ICON_MAP = {
  // Bookings
  booking_paid:                  { Icon: CreditCard,    bg: '#ecfdf5', color: '#059669' },
  status_changed_to_cancelled:   { Icon: XCircle,       bg: '#fef2f2', color: '#dc2626' },
  booking_completed_otp:         { Icon: CheckCircle,   bg: '#ecfdf5', color: '#059669' },
  otp_verified_completion:       { Icon: ShieldCheck,   bg: '#eff6ff', color: '#2563eb' },
  completion_otp_generated:      { Icon: ShieldCheck,   bg: '#eff6ff', color: '#2563eb' },
  pandit_assigned:               { Icon: Users,         bg: '#eef0f8', color: '#1B1F3B' },
  completion_approved:           { Icon: CheckCircle,   bg: '#ecfdf5', color: '#059669' },
  completion_rejected:           { Icon: XCircle,       bg: '#fef2f2', color: '#dc2626' },
  // Payments
  payout_assigned:               { Icon: IndianRupee,   bg: '#fefce8', color: '#ca8a04' },
  payout_completed:              { Icon: IndianRupee,   bg: '#ecfdf5', color: '#059669' },
  // Orders
  order_paid:                    { Icon: ShoppingBag,   bg: '#eef0f8', color: '#1B1F3B' },
  order_confirmed:               { Icon: ClipboardList, bg: '#eff6ff', color: '#2563eb' },
  order_packed:                  { Icon: Package,       bg: '#fefce8', color: '#ca8a04' },
  order_delivered:               { Icon: CheckCircle,   bg: '#ecfdf5', color: '#059669' },
  order_cancelled:               { Icon: XCircle,       bg: '#fef2f2', color: '#dc2626' },
  order_refunded:                { Icon: RotateCcw,     bg: '#fef2f2', color: '#dc2626' },
  // Shipping
  kit_tackipost_shipped:         { Icon: Truck,         bg: '#eff6ff', color: '#2563eb' },
  kit_delivery_updated:          { Icon: Package,       bg: '#fefce8', color: '#ca8a04' },
  delivery_otp_verified:         { Icon: ShieldCheck,   bg: '#ecfdf5', color: '#059669' },
  order_shipped:                 { Icon: Truck,         bg: '#eff6ff', color: '#2563eb' },
  order_out_for_delivery:        { Icon: Navigation,    bg: '#fefce8', color: '#d97706' },
  shipment_created:              { Icon: Truck,         bg: '#eff6ff', color: '#2563eb' },
  shipment_picked_up:            { Icon: Package,       bg: '#eff6ff', color: '#2563eb' },
  shipment_in_transit:           { Icon: Navigation,    bg: '#fefce8', color: '#d97706' },
  shipment_out_for_delivery:     { Icon: MapPin,        bg: '#fff7ed', color: '#ea580c' },
  shipment_delivered:            { Icon: CheckCircle,   bg: '#ecfdf5', color: '#059669' },
  shipment_cancelled:            { Icon: XCircle,       bg: '#fef2f2', color: '#dc2626' },
  shipment_pending_courier_selection: { Icon: Search,   bg: '#f5f3ff', color: '#7c3aed' },
  // Referrals
  referral_created:              { Icon: Gift,          bg: '#fdf4ff', color: '#9333ea' },
  referral_sent:                 { Icon: Mail,          bg: '#fdf4ff', color: '#9333ea' },
  referral_opened:               { Icon: Eye,           bg: '#fdf4ff', color: '#7c3aed' },
  referral_booked:               { Icon: BookOpen,      bg: '#fdf4ff', color: '#7c3aed' },
  referral_completed:            { Icon: Star,          bg: '#fefce8', color: '#ca8a04' },
  referral_settled:              { Icon: IndianRupee,   bg: '#ecfdf5', color: '#059669' },
  referral_pending_remark:       { Icon: Clock,         bg: '#fff7ed', color: '#ea580c' },
  referral_remark_submitted:     { Icon: ClipboardList, bg: '#eff6ff', color: '#2563eb' },
  referral_admin_review:         { Icon: Eye,           bg: '#fef2f2', color: '#dc2626' },
  referral_assigned:             { Icon: CheckCircle,   bg: '#ecfdf5', color: '#059669' },
  // Users
  user_registered:               { Icon: User,          bg: '#eff6ff', color: '#2563eb' },
  pandit_pending:                { Icon: Users,         bg: '#fefce8', color: '#ca8a04' },
  pandit_approved:               { Icon: BadgeCheck,    bg: '#ecfdf5', color: '#059669' },
  pandit_rejected:               { Icon: XCircle,       bg: '#fef2f2', color: '#dc2626' },
  pandit_suspended:              { Icon: Ban,           bg: '#fef2f2', color: '#dc2626' },
  pandit_reupload_required:      { Icon: Upload,        bg: '#fff7ed', color: '#ea580c' },
  pandit_under_review:           { Icon: Eye,           bg: '#eff6ff', color: '#2563eb' },
  // Admin
  delete_pandit:                 { Icon: Trash2,        bg: '#fef2f2', color: '#dc2626' },
  admin_delete_user:             { Icon: Trash2,        bg: '#fef2f2', color: '#dc2626' },
  admin_cancel_deletion:         { Icon: RotateCcw,     bg: '#ecfdf5', color: '#059669' },
};

const ACTIVITY_FILTERS = [
  { key: 'all',       label: 'All'       },
  { key: 'bookings',  label: 'Bookings'  },
  { key: 'payments',  label: 'Payments'  },
  { key: 'orders',    label: 'Orders'    },
  { key: 'shipping',  label: 'Shipping'  },
  { key: 'referrals', label: 'Referrals' },
  { key: 'users',     label: 'Users'     },
  { key: 'admin',     label: 'Admin'     },
];

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function ActivityFeed({ activities, loading, onRefresh }) {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');

  const filtered = activeFilter === 'all'
    ? activities
    : activities.filter(a => a.category === activeFilter);

  return (
    <div className="bg-white rounded-2xl border border-gray-100" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.1rem' }}>
          Recent Activity
        </h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="px-5 pb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
        {ACTIVITY_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className="flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
            style={activeFilter === key
              ? { background: '#1B1F3B', color: '#fff' }
              : { background: '#f3f4f6', color: '#6b7280' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-50" />

      {/* Timeline */}
      <div className="px-5 py-3 max-h-[520px] overflow-y-auto space-y-0.5">
        {loading && (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
            <Loader size={16} className="animate-spin mr-2" /> Loading activity…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">No recent activity in this category.</div>
        )}
        {!loading && filtered.map((item, idx) => {
          const iconMeta = ACTIVITY_ICON_MAP[item.type] || { Icon: Clock, bg: '#f3f4f6', color: '#9ca3af' };
          const { Icon } = iconMeta;
          const isLast = idx === filtered.length - 1;

          return (
            <div
              key={item.id}
              onClick={() => navigate(`?tab=${item.navigateTo}`)}
              className="flex gap-3 py-2.5 group cursor-pointer hover:bg-gray-50/60 rounded-xl px-2 -mx-2 transition-colors"
            >
              {/* Icon + vertical line */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: iconMeta.bg }}
                >
                  <Icon size={14} style={{ color: iconMeta.color }} />
                </div>
                {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1.5" style={{ minHeight: '12px' }} />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
                    {item.relatedName && (
                      <p className="text-xs font-medium mt-0.5" style={{ color: '#1B1F3B' }}>{item.relatedName}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-gray-400 whitespace-nowrap">{relativeTime(item.timestamp)}</p>
                    {item.entityNumber && (
                      <p className="text-xs font-mono text-gray-300 mt-0.5">{String(item.entityNumber).length > 12 ? String(item.entityNumber).slice(0,12)+'…' : item.entityNumber}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={12} className="text-gray-300" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dashboard Stats ─────────────────────────────────────────
function DashboardTab() {
  const [stats,      setStats]      = useState(null);
  const [activities, setActivities] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);

  const loadDashboard = useCallback(() => {
    setFeedLoading(true);
    API.get('/admin/dashboard').then(({ data }) => {
      setStats(data.stats);
      setActivities(data.recentActivity || []);
    }).finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

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

      <ActivityFeed activities={activities} loading={feedLoading} onRefresh={loadDashboard} />
    </div>
  );
}

// ─── Bookings Tab ─────────────────────────────────────────────
function BookingsTab() {
  const [bookings,       setBookings]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState('paid');
  const [referralFilter, setReferralFilter] = useState('');
  const [search,         setSearch]         = useState('');
  const [selected,          setSelected]          = useState(null);
  const [pandits,           setPandits]           = useState([]);
  const [panditId,          setPanditId]          = useState('');
  const [assigning,         setAssigning]         = useState(false);
  const [loadingPandits,    setLoadingPandits]    = useState(false);
  const [panditSearch,      setPanditSearch]      = useState('');
  const [searchResults,     setSearchResults]     = useState([]);
  const [searchLoading,     setSearchLoading]     = useState(false);
  const [assignmentMethod,  setAssignmentMethod]  = useState('nearby_recommendation');

  // Payout modal state
  const [payoutBooking,  setPayoutBooking]  = useState(null);
  const [payoutAmount,   setPayoutAmount]   = useState('');
  const [payoutNote,     setPayoutNote]     = useState('');
  const [payoutRef,      setPayoutRef]      = useState('');
  const [payoutAction,   setPayoutAction]   = useState('assign'); // 'assign' | 'paid'
  const [savingPayout,   setSavingPayout]   = useState(false);

  // Order details modal state
  const [viewBooking, setViewBooking] = useState(null);

  // Kit delivery modal state
  const [kitBooking,  setKitBooking]  = useState(null);
  const [kitForm,     setKitForm]     = useState({ status: 'pending', type: 'manual', trackingId: '', courier: '', remarks: '' });
  const [kitSaving,        setKitSaving]        = useState(false);
  const [tekipostShipping, setTekipostShipping]  = useState(false);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filter === 'with_kit') {
      params.set('withKit', 'true');
    } else if (filter) {
      params.set('status', filter);
    }
    if (referralFilter) params.set('referralFilter', referralFilter);
    API.get(`/admin/bookings?${params}`)
      .then(({ data }) => setBookings(data.bookings))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, referralFilter]);

  const q = search.trim().toLowerCase();
  const filteredBookings = q
    ? bookings.filter((b) =>
        (b.bookingNumber || '').toLowerCase().includes(q) ||
        (b.userId?.name  || '').toLowerCase().includes(q) ||
        (b.userDetails?.phone || '').includes(q) ||
        (b.poojaId?.name || '').toLowerCase().includes(q) ||
        (b.panditId?.name || '').toLowerCase().includes(q)
      )
    : bookings;

  const exportExcel = async () => {
    try {
      const params = filter === 'with_kit' ? '?withKit=true' : `?status=${filter}`;
      const res = await API.get(`/admin/bookings/export${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `bookings_${filter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

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
    setPanditSearch('');
    setSearchResults([]);
    setAssignmentMethod('nearby_recommendation');
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
      toast.error('Could not load nearby pandits');
    } finally {
      setLoadingPandits(false);
    }
  };

  const handleAssign = async () => {
    if (!panditId) { toast.error('Please select a pandit'); return; }
    setAssigning(true);
    try {
      await API.patch(`/admin/bookings/${selected._id}/assign`, { panditId, assignmentMethod });
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

  // Refund modal state
  const [refundBooking,    setRefundBooking]    = useState(null);
  const [refundDetails,    setRefundDetails]    = useState(null);
  const [refundDetailsLoading, setRefundDetailsLoading] = useState(false);
  const [refundNote,       setRefundNote]       = useState('');
  const [refundRef,        setRefundRef]        = useState('');
  const [refundMethod,     setRefundMethod]     = useState('original_payment');
  const [refundStatusSel,  setRefundStatusSel]  = useState('processed');
  const [processingRefund, setProcessingRefund] = useState(false);

  const openRefundModal = async (booking) => {
    setRefundBooking(booking);
    setRefundNote('');
    setRefundRef(booking.refund?.transactionId || '');
    setRefundMethod(booking.refund?.method || 'original_payment');
    setRefundStatusSel('processed');
    setRefundDetails(null);
    setRefundDetailsLoading(true);
    try {
      const { data } = await API.get(`/admin/bookings/${booking._id}/refund-details`);
      setRefundDetails(data.refundDetails);
    } catch {
      // Show modal with basic info if details fetch fails
    } finally {
      setRefundDetailsLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!refundRef.trim()) { toast.error('Please enter transaction / reference ID'); return; }
    setProcessingRefund(true);
    try {
      await API.patch(`/admin/bookings/${refundBooking._id}/refund/process`, {
        refundedAmount: refundDetails?.refundableAmount ?? 0,
        transactionId:  refundRef,
        method:         refundMethod,
        notes:          refundNote,
        refundStatus:   refundStatusSel,
      });
      toast.success('Refund recorded successfully');
      setRefundBooking(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Refund action failed');
    } finally {
      setProcessingRefund(false);
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
        {['paid','pandit_assigned','pandit_accepted','pending_reassignment','completion_requested','completed','cancelled','refunded','pending_payment'].map((s) => (
          <button key={s} onClick={() => { setFilter(s); setSearch(''); }}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${filter === s ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'} ${s === 'pending_reassignment' && filter !== s ? 'border-red-200 text-red-600' : ''}`}>
            {statusLabel[s]}
          </button>
        ))}
        <button onClick={() => { setFilter('with_kit'); setSearch(''); }}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${filter === 'with_kit' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200 hover:border-amber-400'}`}>
          📦 With Kit
        </button>
      </div>

      {/* Referral sub-filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs font-semibold text-gray-400 mr-1">🤝 Referral:</span>
        {[
          { val: '',           label: 'All' },
          { val: 'referred',   label: 'Referred' },
          { val: 'normal',     label: 'No Referral' },
          { val: 'pending',    label: 'Pending' },
          { val: 'accepted',   label: 'Accepted' },
          { val: 'reassigned', label: 'Reassigned' },
          { val: 'rejected',   label: 'Rejected' },
        ].map(({ val, label }) => (
          <button key={val} onClick={() => setReferralFilter(val)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${referralFilter === val ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Search + Export row */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by booking #, user, phone, pooja, pandit…"
          className="flex-1 min-w-[240px] text-sm border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100"
        />
        <button
          onClick={exportExcel}
          className="flex items-center gap-2 text-sm font-semibold bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors whitespace-nowrap"
        >
          ⬇ Export Excel
        </button>
        {q && (
          <span className="text-xs text-gray-400">{filteredBookings.length} result{filteredBookings.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-saffron-50 text-left text-xs text-gray-500 border-b">
                {['Booking #','Booked On','User','Location','Pooja','Puja Date','Amount / Payment','Status','Pandit','Referral','Action'].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filteredBookings.map((b) => (
                  <tr key={b._id} className="hover:bg-saffron-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.bookingNumber}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">
                        {b.userId?.name || b.userDetails?.name || b.userDetails?._deletedName || '—'}
                        {!b.userId && b.userDetails?._deletedAt && (
                          <span className="ml-1.5 text-[10px] text-red-400 font-normal">(deleted)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{b.userDetails?.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-600">{b.userDetails?.city || '—'}</p>
                      <p className="text-xs text-gray-400">{b.userDetails?.state || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{b.poojaId?.name}</p>
                      {b.withKit && (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">📦 WITH KIT</span>
                            {b.kitDelivery?.status && b.kitDelivery.status !== 'pending' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${kitStatusColor[b.kitDelivery.status] || ''}`}>
                                {kitStatusLabel[b.kitDelivery.status]}
                              </span>
                            )}
                          </div>
                          {b.kitId?.name && (
                            <p className="text-[10px] text-amber-700 font-medium">{b.kitId.name}</p>
                          )}
                        </div>
                      )}
                      {b.linkedOrder?.items?.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium mt-0.5">
                          🛍️ {b.linkedOrder.items.length} product{b.linkedOrder.items.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{b.scheduledDate?.split('T')[0]} {b.scheduledTime}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-saffron-600" style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1rem' }}>
                        ₹{((b.grandTotal || b.amount || 0) + (b.linkedOrder?.totalAmount || 0)).toLocaleString('en-IN')}
                      </p>
                      {b.linkedOrder?.totalAmount > 0 ? (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">Pooja + Products</span>
                      ) : b.withKit ? (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Pooja + Kit</span>
                      ) : (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Pooja Only</span>
                      )}
                      {b.paymentStatus === 'PARTIALLY_PAID' && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[10px] text-green-700 font-medium">Paid ₹{(b.amountPaid || 0).toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-red-600 font-semibold">Pending ₹{(b.remainingAmount || 0).toLocaleString('en-IN')}</p>
                          <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">PARTIAL</span>
                        </div>
                      )}
                      {b.paymentStatus === 'FULLY_PAID' && b.paymentMode === 'PARTIAL' && (
                        <p className="text-[10px] text-green-600 font-medium mt-1">Fully Paid ✓</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={statusColor[b.status] || 'badge-pending'}>{statusLabel[b.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{b.panditId?.name || '—'}</td>
                    <td className="px-4 py-3 min-w-[120px]">
                      {b.referral?.referralId ? (
                        <div className="space-y-1">
                          {(() => {
                            const s = b.referral.referralId?.status || '';
                            const colorMap = {
                              COMPLETED: 'bg-green-100 text-green-700', SETTLED: 'bg-green-200 text-green-800',
                              ADMIN_REVIEW: 'bg-purple-100 text-purple-700', ASSIGNED: 'bg-blue-100 text-blue-700',
                              PENDING_REMARK: 'bg-amber-100 text-amber-700', REMARK_SUBMITTED: 'bg-cyan-100 text-cyan-700',
                            };
                            const cls = colorMap[s] || 'bg-amber-100 text-amber-700';
                            const labelMap = {
                              CREATED: 'Referred', SENT: 'Link Sent', OPENED: 'Opened',
                              BOOKED: 'Booked', PENDING_REMARK: 'Remark Pending', REMARK_SUBMITTED: 'Remark In',
                              ADMIN_REVIEW: 'In Review', ASSIGNED: 'Assigned', COMPLETED: 'Completed', SETTLED: 'Settled',
                            };
                            return (
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
                                🤝 {labelMap[s] || s || 'Referred'}
                              </span>
                            );
                          })()}
                          <p className="text-[10px] text-gray-500 leading-snug">{b.referral.referringPanditId?.name || '—'}</p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => setViewBooking(b)}
                          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Eye size={13} /> View Details
                        </button>
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
                        {b.status === 'cancelled' && (
                          <button onClick={() => openRefundModal(b)} className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap font-semibold">
                            ↩ Refund
                          </button>
                        )}
                        {b.status === 'refunded' && (
                          <span className="text-[10px] text-green-700 font-semibold bg-green-50 border border-green-200 px-2 py-1 rounded-lg">✓ Refunded</span>
                        )}
                        {b.withKit && (
                          <button onClick={() => openKitModal(b)} className={`text-white text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${b.kitDelivery?.status === 'delivered' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}>
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

      {/* Pandit Assignment Modal */}
      {selected && (() => {
        const isSearchMode = panditSearch.trim().length >= 2;

        const PanditCard = ({ p, fromSearch }) => {
          const outOfCoverage  = !fromSearch && p.withinCoverage === false;
          const isSelected     = panditId === p._id;
          const isRecommended  = !!p.isRecommended;
          const photoUrl = p.profilePhoto
            ? (p.profilePhoto.startsWith('http') ? p.profilePhoto : `http://localhost:5000/${p.profilePhoto}`)
            : null;

          return (
            <button
              type="button"
              disabled={outOfCoverage}
              onClick={() => {
                if (outOfCoverage) return;
                setPanditId(p._id);
                setAssignmentMethod(fromSearch ? 'manual_search' : 'nearby_recommendation');
              }}
              className={[
                'w-full text-left rounded-xl border transition-all duration-150 p-3',
                outOfCoverage
                  ? 'border-gray-100 bg-gray-50/60 opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-400'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center shrink-0 border border-indigo-200">
                  {photoUrl
                    ? <img src={photoUrl} className="w-full h-full object-cover" alt="" />
                    : <User size={14} className="text-indigo-400" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-800 text-sm leading-tight">{p.name}</span>
                      {p.isOnline && <span className="w-1.5 h-1.5 bg-green-500 rounded-full" title="Online" />}
                      {isRecommended && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">⭐ Referring Pandit</span>
                      )}
                      {!fromSearch && (
                        outOfCoverage
                          ? <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Outside area</span>
                          : <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">In coverage</span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full shrink-0">Selected</span>
                    )}
                  </div>

                  {/* Contact + location row */}
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {[p.phone, p.email].filter(Boolean).join('  ·  ')}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                    {p.languages?.length > 0 && <span className="ml-1 text-gray-300">· {p.languages.slice(0, 2).join(', ')}</span>}
                  </p>

                  {/* Badges row */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.distanceKm !== null && (
                      <span className="text-[9px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">{p.distanceKm} km</span>
                    )}
                    {p.experience > 0 && (
                      <span className="text-[9px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{p.experience}y exp</span>
                    )}
                    {p.rating > 0 && (
                      <span className="text-[9px] font-semibold bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-full">★ {p.rating.toFixed(1)} ({p.totalReviews || 0})</span>
                    )}
                    {(p.activeBookings ?? 0) > 0 && (
                      <span className="text-[9px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">{p.activeBookings} active</span>
                    )}
                    {p.totalBookings > 0 && (
                      <span className="text-[9px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-full">{p.totalBookings} total</span>
                    )}
                    {!fromSearch && p.coverageType && (
                      <span className="text-[9px] text-gray-400 px-1.5 py-0.5 rounded-full bg-gray-50">{coverageLabel(p)}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>

              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
                    {selected.status === 'pending_reassignment' ? 'Reassign Pandit' : 'Assign Pandit'}
                  </h2>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">#{selected.bookingNumber}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-500 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                {/* Booking summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pooja</p>
                    <p className="font-semibold text-gray-800">{selected.poojaId?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date & Time</p>
                    <p className="font-medium text-gray-700">{selected.scheduledDate?.split('T')[0] || '—'}{selected.scheduledTime ? ` · ${selected.scheduledTime}` : ''}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Customer & Address</p>
                    <p className="font-medium text-gray-800">{selected.userDetails?.name} · {selected.userDetails?.phone}</p>
                    <p className="text-gray-500">{[selected.userDetails?.address, selected.userDetails?.city, selected.userDetails?.district, selected.userDetails?.state, selected.userDetails?.pincode].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                </div>

                {/* Rejection history */}
                {selected.status === 'pending_reassignment' && selected.panditRejections?.length > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs">
                    <p className="font-bold text-red-600 mb-2 uppercase tracking-wide text-[10px]">Previously Rejected By</p>
                    <div className="space-y-1">
                      {selected.panditRejections.map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="font-semibold text-red-700 shrink-0">{r.panditName}:</span>
                          <span className="text-red-500 italic">"{r.reason}"</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search box */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                    Search Pandit
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      value={panditSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPanditSearch(val);
                        // Debounced search
                        clearTimeout(window.__panditSearchTimer);
                        if (val.trim().length >= 2) {
                          setSearchLoading(true);
                          window.__panditSearchTimer = setTimeout(async () => {
                            try {
                              const { data } = await API.get(`/admin/pandits/search?q=${encodeURIComponent(val.trim())}`);
                              setSearchResults(data.pandits || []);
                            } catch {
                              setSearchResults([]);
                            } finally {
                              setSearchLoading(false);
                            }
                          }, 300);
                        } else {
                          setSearchResults([]);
                          setSearchLoading(false);
                        }
                      }}
                      placeholder="Search by name, phone, or email…"
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                    />
                    {searchLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      </span>
                    )}
                  </div>
                  {!isSearchMode && (
                    <p className="text-[10px] text-gray-400 mt-1">Search by full name, partial name, phone, or email</p>
                  )}
                </div>

                {/* Pandit list */}
                {isSearchMode ? (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                      Search Results {!searchLoading && `(${searchResults.length})`}
                    </p>
                    {searchLoading ? (
                      <div className="text-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-gray-400">Searching…</p>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <User size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="font-medium text-sm">No pandits found</p>
                        <p className="text-xs mt-0.5">Try searching by name, phone, or email</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {searchResults.map((p) => <PanditCard key={p._id} p={p} fromSearch={true} />)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                      Recommended Nearby Pandits {!loadingPandits && `(${pandits.length})`}
                    </p>
                    {loadingPandits ? (
                      <div className="text-center py-8">
                        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-gray-400">Finding nearby pandits…</p>
                      </div>
                    ) : pandits.length === 0 ? (
                      <div className="text-center py-10 text-gray-400">
                        <Users size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="font-medium text-sm">No pandits available for this date</p>
                        <p className="text-xs mt-0.5">Use the search above to find a pandit manually</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-gray-400">
                          <span className="text-green-600 font-semibold">●</span> In coverage  ·  <span className="text-red-500 font-semibold">●</span> Outside area  ·  Sorted by distance
                        </p>
                        {pandits.map((p) => <PanditCard key={p._id} p={p} fromSearch={false} />)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 space-y-2">
                {panditId && (
                  <p className="text-[10px] text-indigo-600 font-semibold text-center">
                    {assignmentMethod === 'manual_search' ? '🔍 Assigning via Manual Search' : '📍 Assigning via Nearby Recommendation'}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelected(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={assigning || !panditId}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                    style={{ background: '#1B1F3B' }}
                  >
                    {assigning ? 'Assigning…' : selected.status === 'pending_reassignment' ? 'Reassign & Notify' : 'Assign & Notify Pandit'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* Refund Modal */}
      {refundBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-lg">
            <h2 className="font-bold text-gray-800 text-xl mb-1">Process Refund</h2>
            <p className="text-sm text-gray-500 mb-4">
              Booking <span className="font-mono font-semibold">{refundBooking.bookingNumber}</span>
              {refundBooking.poojaId?.name && <> · {refundBooking.poojaId.name}</>}
            </p>

            {/* Customer info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-sm">
              <p className="font-semibold text-gray-800">{refundBooking.userDetails?.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{refundBooking.userDetails?.phone}</p>
            </div>

            {/* Refund breakdown */}
            {refundDetailsLoading ? (
              <div className="rounded-xl border border-green-100 bg-green-50 p-4 mb-4 text-center text-sm text-green-600">
                Calculating refund breakdown…
              </div>
            ) : refundDetails ? (
              <div className="rounded-xl border border-green-200 overflow-hidden mb-4">
                <div className="px-4 py-2.5 bg-green-50 border-b border-green-200">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wide">Refund Breakdown</p>
                </div>
                <div className="px-4 py-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount Paid by Customer</span>
                    <span className="font-semibold">₹{refundDetails.amountPaid?.toLocaleString('en-IN')}</span>
                  </div>
                  {refundDetails.platformFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-red-600">Less: Platform Fee (non-refundable)</span>
                      <span className="font-semibold text-red-600">− ₹{refundDetails.platformFee?.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {refundDetails.platformGST > 0 && (
                    <div className="flex justify-between">
                      <span className="text-red-600">Less: GST on Platform Fee (non-refundable)</span>
                      <span className="font-semibold text-red-600">− ₹{refundDetails.platformGST?.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-green-200 pt-2 text-green-700">
                    <span>Refundable Amount</span>
                    <span>₹{refundDetails.refundableAmount?.toLocaleString('en-IN')}</span>
                  </div>
                  {refundDetails.kitAmount > 0 && (
                    <div className="flex justify-between text-xs text-gray-400 pt-1">
                      <span>Kit Amount</span>
                      <span>₹{refundDetails.kitAmount?.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {refundDetails.kitGST > 0 && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Kit GST</span>
                      <span>₹{refundDetails.kitGST?.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>
                {refundDetails.refundableAmount === 0 && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      The entire payment was applied to non-refundable charges. No refund is due to the customer.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Previous refund record (if any) */}
            {refundBooking.refund?.status && refundBooking.refund.status !== 'none' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 mb-4 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">Existing Refund Record</p>
                <p>Status: <span className="capitalize font-bold">{refundBooking.refund.status}</span></p>
                {refundBooking.refund.transactionId && <p>Txn ID: {refundBooking.refund.transactionId}</p>}
                {refundBooking.refund.refundedAmount > 0 && <p>Amount: ₹{refundBooking.refund.refundedAmount?.toLocaleString('en-IN')}</p>}
                {refundBooking.refund.approvedByName && <p>By: {refundBooking.refund.approvedByName}</p>}
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Refund Status</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  value={refundStatusSel}
                  onChange={(e) => setRefundStatusSel(e.target.value)}
                >
                  <option value="approved">Approved</option>
                  <option value="processed">Processed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Refund Method</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                >
                  <option value="original_payment">Original Payment Method</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                  <option value="upi">UPI</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Transaction / UTR Reference ID <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  placeholder="e.g. RZP123456789 / UTR number"
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
                <textarea
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
                  rows={2}
                  placeholder="Additional notes for audit record…"
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRefundBooking(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={processingRefund || refundDetailsLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                {processingRefund ? 'Saving…' : `↩ Record Refund ₹${(refundDetails?.refundableAmount || 0).toLocaleString('en-IN')}`}
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

      {viewBooking && (
        <OrderDetailsModal booking={viewBooking} onClose={() => setViewBooking(null)} />
      )}
    </div>
  );
}

// ─── Order Details Modal ──────────────────────────────────────
const REFERRAL_STATUS_CFG = {
  CREATED:          { bg: 'bg-gray-50',     border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-600',     label: 'Created'          },
  SENT:             { bg: 'bg-blue-50',     border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',     label: 'Link Sent'        },
  OPENED:           { bg: 'bg-indigo-50',   border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', label: 'Link Opened'      },
  BOOKED:           { bg: 'bg-teal-50',     border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700',     label: 'Booked'           },
  PENDING_REMARK:   { bg: 'bg-amber-50',    border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',   label: 'Remark Pending'   },
  REMARK_SUBMITTED: { bg: 'bg-cyan-50',     border: 'border-cyan-200',   badge: 'bg-cyan-100 text-cyan-700',     label: 'Remark Submitted' },
  ADMIN_REVIEW:     { bg: 'bg-purple-50',   border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', label: 'Admin Review'     },
  ASSIGNED:         { bg: 'bg-blue-50',     border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',     label: 'Assigned'         },
  COMPLETED:        { bg: 'bg-green-50',    border: 'border-green-200',  badge: 'bg-green-100 text-green-700',   label: 'Completed'        },
  SETTLED:          { bg: 'bg-green-50',    border: 'border-green-300',  badge: 'bg-green-200 text-green-800',   label: 'Settled'          },
};

const IMG_BASE_ADMIN = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function ReferralDetailSection({ booking: b }) {
  const ref        = b.referral;
  const referral   = ref?.referralId;          // populated Referral document
  const panditSeed = ref?.referringPanditId;   // basic populated fields (used as initial state)

  // Full/latest pandit profile fetched live so changes to photo/contact/languages
  // are always reflected here without needing a re-deployment.
  const [pandit,        setPandit]        = useState(panditSeed || null);
  const [fetchingPandit,setFetchingPandit]= useState(false);

  const [updating,         setUpdating]         = useState(false);
  const [localStatus,      setLocalStatus]      = useState(referral?.status || 'ADMIN_REVIEW');
  const [selectStatus,     setSelectStatus]     = useState(referral?.status || 'ADMIN_REVIEW');
  const [copied,           setCopied]           = useState('');

  // Fetch the latest pandit profile by ID (not by name / email / phone)
  useEffect(() => {
    const pid = panditSeed?._id || panditSeed;
    if (!pid) return;
    setFetchingPandit(true);
    API.get(`/admin/pandits/${pid}`)
      .then(({ data }) => { if (data.pandit) setPandit(data.pandit); })
      .catch(() => { /* fall back to populated data — non-fatal */ })
      .finally(() => setFetchingPandit(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!referral) return null;

  // ── Helpers ───────────────────────────────────────────────────
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const getStatusDate = (status) => {
    const entry = referral.statusHistory?.find((h) => h.status === status);
    return fmtDate(entry?.at);
  };

  const panditDisplayId = pandit?._id
    ? `PDT-${String(pandit._id).slice(-6).toUpperCase()}`
    : '—';
  const isVerified = pandit?.kycStatus === 'approved';
  const isActive   = pandit?.status    === 'approved';

  const maskedToken = b.referral?.referralToken
    ? `••••••${b.referral.referralToken.slice(-4).toUpperCase()}`
    : '—';

  const cfg      = REFERRAL_STATUS_CFG[localStatus] || REFERRAL_STATUS_CFG.ADMIN_REVIEW;
  const hasRemark = !!referral?.remark;

  const createdDate = fmtDate(referral.createdAt);
  const openedDate  = getStatusDate('OPENED');
  const bookedDate  = getStatusDate('BOOKED') || fmtDate(b.createdAt);
  const expiryDate  = fmtDate(referral.expiresAt);

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const handleUpdateStatus = async () => {
    if (!referral?._id || selectStatus === localStatus) return;
    setUpdating(true);
    try {
      await API.patch(`/referral/${referral._id}/status`, { status: selectStatus });
      setLocalStatus(selectStatus);
      toast.success('Referral stage updated');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const STAGE_KEYS = Object.keys(REFERRAL_STATUS_CFG);
  const currentStageIdx = STAGE_KEYS.indexOf(localStatus);

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">🤝 Pandit Referral</p>

      {/* ── Referring Pandit Mini Profile Card ──────────────────── */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm bg-white">

        {/* Premium accent bar */}
        <div className="h-1" style={{ background: 'linear-gradient(90deg,#1B1F3B 0%,#D4AF37 60%,#FF6B00 100%)' }} />

        <div className="p-4">

          {/* Top row: Avatar · Identity · Action */}
          <div className="flex items-start gap-4 mb-4">

            {/* Circular photo with verification dot */}
            <div className="relative shrink-0">
              {pandit?.profilePhoto ? (
                <img
                  src={`${IMG_BASE_ADMIN}/${pandit.profilePhoto}`}
                  alt={pandit.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-100 shadow"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-indigo-50 border-2 border-gray-100 shadow flex items-center justify-center text-3xl">
                  🙏
                </div>
              )}
              {fetchingPandit && (
                <div className="absolute inset-0 rounded-full bg-white/50 flex items-center justify-center">
                  <Loader size={14} className="text-indigo-400 animate-spin" />
                </div>
              )}
              {isVerified && !fetchingPandit && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center shadow">
                  <CheckCircle size={9} className="text-white" />
                </div>
              )}
            </div>

            {/* Name · ID · Badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-900 text-base leading-tight" style={{ fontFamily: '"Cormorant Garamond",serif' }}>
                  {pandit?.name || panditSeed?.name || '—'}
                </h3>
                {isVerified && (
                  <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                    <BadgeCheck size={9} /> Verified
                  </span>
                )}
              </div>

              {/* Unique Pandit ID */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs font-mono text-gray-400">{panditDisplayId}</p>
                <button
                  onClick={() => copy(panditDisplayId, 'id')}
                  className="text-gray-300 hover:text-indigo-500 transition-colors"
                  title="Copy Pandit ID"
                >
                  {copied === 'id'
                    ? <CheckCircle size={10} className="text-green-500" />
                    : <Copy size={10} />}
                </button>
              </div>

              {/* Status pill row */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {isActive ? '● Active' : `● ${pandit?.status || 'Unknown'}`}
                </span>
                {isVerified && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                    KYC Approved
                  </span>
                )}
              </div>
            </div>

            {/* Quick: open referral history in new tab */}
            <a
              href="/admin?tab=referrals"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              title="View all referrals by this pandit"
            >
              <ExternalLink size={10} /> Referrals
            </a>
          </div>

          {/* Contact & Profile grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">

            {/* Email */}
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-base leading-none mt-0.5">📧</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Email</p>
                <p className="text-xs text-gray-700 font-medium truncate">{pandit?.email || '—'}</p>
              </div>
              {pandit?.email && (
                <button onClick={() => copy(pandit.email, 'email')} className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="Copy email">
                  {copied === 'email' ? <CheckCircle size={11} className="text-green-500" /> : <Copy size={11} />}
                </button>
              )}
            </div>

            {/* Phone */}
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-base leading-none mt-0.5">📞</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Phone</p>
                <p className="text-xs text-gray-700 font-medium">{pandit?.phone || '—'}</p>
              </div>
              {pandit?.phone && (
                <button onClick={() => copy(pandit.phone, 'phone')} className="shrink-0 text-gray-300 hover:text-indigo-500 transition-colors" title="Copy phone">
                  {copied === 'phone' ? <CheckCircle size={11} className="text-green-500" /> : <Copy size={11} />}
                </button>
              )}
            </div>

            {/* Location */}
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-base leading-none mt-0.5">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Location</p>
                <p className="text-xs text-gray-700 font-medium">
                  {[pandit?.city, pandit?.state].filter(Boolean).join(', ') || pandit?.district || '—'}
                </p>
              </div>
            </div>

            {/* Experience */}
            <div className="flex items-start gap-2 min-w-0">
              <span className="text-base leading-none mt-0.5">🕉️</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Experience</p>
                <p className="text-xs text-gray-700 font-medium">
                  {pandit?.experience ? `${pandit.experience} Years` : '—'}
                </p>
              </div>
            </div>

            {/* Languages — full width row */}
            {(pandit?.languages?.length > 0) && (
              <div className="col-span-2 flex items-start gap-2 min-w-0">
                <span className="text-base leading-none mt-0.5">🌐</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Languages</p>
                  <div className="flex flex-wrap gap-1">
                    {pandit.languages.map((l) => (
                      <span key={l} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md font-medium">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick action strip */}
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
            <button
              onClick={() => copy(panditDisplayId, 'id2')}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              {copied === 'id2' ? <CheckCircle size={10} className="text-green-500" /> : <Copy size={10} />}
              Copy Pandit ID
            </button>
            {pandit?.email && (
              <button
                onClick={() => copy(pandit.email, 'email2')}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {copied === 'email2' ? <CheckCircle size={10} className="text-green-500" /> : <Copy size={10} />}
                Copy Email
              </button>
            )}
            {pandit?.phone && (
              <button
                onClick={() => copy(pandit.phone, 'phone2')}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {copied === 'phone2' ? <CheckCircle size={10} className="text-green-500" /> : <Copy size={10} />}
                Copy Phone
              </button>
            )}
            <a
              href="/admin?tab=pandits"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={10} /> View Full Profile
            </a>
            <a
              href="/admin?tab=referrals"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={10} /> All Referrals
            </a>
          </div>
        </div>
      </div>

      {/* ── Referral Metadata Card ───────────────────────────────── */}
      <div className={`rounded-2xl border p-4 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Referral Details</p>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.label}</span>
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[['Created', createdDate], ['Opened', openedDate], ['Booked', bookedDate]].map(([label, val]) => (
            <div key={label} className="bg-white/70 rounded-xl px-3 py-2 border border-white/50">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-xs text-gray-800 font-semibold mt-0.5">{val || '—'}</p>
            </div>
          ))}
        </div>

        {/* Token / Source / Expiry grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white/70 rounded-xl px-3 py-2 border border-white/50">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Source</p>
            <p className="text-xs text-gray-800 font-semibold mt-0.5">Referral Link</p>
          </div>
          <div className="bg-white/70 rounded-xl px-3 py-2 border border-white/50">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Token</p>
            <p className="text-xs font-mono text-gray-700 font-semibold mt-0.5 tracking-wider">{maskedToken}</p>
          </div>
          <div className="bg-white/70 rounded-xl px-3 py-2 border border-white/50">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Expires</p>
            <p className="text-xs text-gray-800 font-semibold mt-0.5">{expiryDate || '—'}</p>
          </div>
        </div>

        {/* Stage tracker (horizontal pipeline) */}
        <div className="bg-white/70 rounded-xl px-3 py-3 mb-3 border border-white/50 overflow-x-auto">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2.5">Current Stage</p>
          <div className="flex items-center gap-0 min-w-max">
            {STAGE_KEYS.map((key, idx) => {
              const isDone    = idx < currentStageIdx;
              const isCurrent = idx === currentStageIdx;
              const { label } = REFERRAL_STATUS_CFG[key];
              return (
                <React.Fragment key={key}>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 transition-all ${
                      isDone    ? 'bg-indigo-500 border-indigo-500' :
                      isCurrent ? 'bg-amber-400 border-amber-400' :
                                  'bg-white border-gray-300'
                    }`}>
                      {isDone    && <CheckCircle size={8} className="text-white" />}
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <p className={`text-[8px] font-medium whitespace-nowrap mt-0.5 ${
                      isDone || isCurrent ? 'text-indigo-600' : 'text-gray-300'
                    }`}>{label}</p>
                  </div>
                  {idx < STAGE_KEYS.length - 1 && (
                    <div className={`w-4 h-px shrink-0 mb-3.5 ${isDone ? 'bg-indigo-400' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Admin: update stage */}
        <div className="flex items-center gap-2 pt-3 border-t border-current/20">
          <select
            value={selectStatus}
            onChange={(e) => setSelectStatus(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-indigo-400"
          >
            {STAGE_KEYS.map((val) => (
              <option key={val} value={val}>{REFERRAL_STATUS_CFG[val].label}</option>
            ))}
          </select>
          <button
            onClick={handleUpdateStatus}
            disabled={updating || selectStatus === localStatus}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {updating ? 'Saving…' : 'Update Stage'}
          </button>
        </div>
      </div>

      {/* ── Mandatory Remark ────────────────────────────────────── */}
      <div className={`rounded-2xl border p-4 ${hasRemark ? 'bg-cyan-50/60 border-cyan-100' : 'bg-amber-50/60 border-amber-100'}`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: hasRemark ? '#0891b2' : '#d97706' }}>
            Pandit's Mandatory Remark
          </p>
          {referral.remarkSubmittedAt && (
            <span className="text-[10px] text-gray-400">
              {fmtDate(referral.remarkSubmittedAt)}
            </span>
          )}
        </div>
        {hasRemark ? (
          <div className="bg-white rounded-xl border border-cyan-100 px-3 py-2.5">
            <p className="text-sm text-gray-700 leading-relaxed italic">"{referral.remark}"</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">
            {localStatus === 'PENDING_REMARK'
              ? 'Awaiting mandatory remark from the referring pandit.'
              : 'No remark submitted yet.'}
          </p>
        )}
      </div>
    </div>
  );
}

function OrderDetailsModal({ booking: b, onClose }) {
  const [payments,        setPayments]        = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    setLoadingPayments(true);
    API.get(`/admin/bookings/${b._id}/payments`)
      .then(({ data }) => setPayments(data.payments || []))
      .catch(() => {})
      .finally(() => setLoadingPayments(false));
  }, [b._id]);

  const productItems = b.linkedOrder?.items || [];
  const hasProducts  = productItems.length > 0;
  const hasKit       = b.withKit;
  const productTotal = b.linkedOrder?.totalAmount || 0;
  const productGST   = productItems.reduce((s, i) => s + (i.taxAmount || 0), 0);
  const bookingTotal = b.grandTotal || b.amount || 0;
  const orderTotal   = bookingTotal + productTotal;

  // Payment-aware computed values — fall back gracefully for older bookings without paymentStatus
  const paymentStatus   = b.paymentStatus   || (b.status !== 'pending_payment' ? 'FULLY_PAID' : 'PENDING');
  const amountPaid      = b.amountPaid      != null ? b.amountPaid      : (b.status !== 'pending_payment' ? bookingTotal : 0);
  const remainingAmount = b.remainingAmount != null ? b.remainingAmount : Math.max(0, bookingTotal - amountPaid);
  const paymentMode     = b.paymentMode     || 'FULL';

  const psConfig = ({
    FULLY_PAID:     { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',   divider: 'border-green-200',  label: '✓ Fully Paid' },
    PARTIALLY_PAID: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', divider: 'border-orange-200', label: '◑ Partially Paid' },
    PENDING:        { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', divider: 'border-yellow-200', label: '⏳ Pending Payment' },
    REFUNDED:       { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',     divider: 'border-blue-200',   label: '↩ Refunded' },
    FAILED:         { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',       divider: 'border-red-200',    label: '✗ Failed' },
  })[paymentStatus] || { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600', divider: 'border-gray-200', label: paymentStatus || '—' };

  const successPayments = payments.filter((p) => p.paymentStatus === 'SUCCESS');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4 py-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Sticky header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
          <div>
            <h2 className="font-bold text-gray-800 text-xl" style={{ fontFamily: '"Cormorant Garamond"', letterSpacing: '-0.01em' }}>Order Details</h2>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{b.bookingNumber}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={statusColor[b.status] || 'badge-pending'}>{statusLabel[b.status]}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* Section 1 — Customer */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">👤 Customer Information</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 bg-gray-50 rounded-2xl p-4">
              <OdItem label="Name"    value={b.userId?.name  || b.userDetails?.name  || b.userDetails?._deletedName  || '—'} />
              <OdItem label="Phone"   value={b.userId?.phone || b.userDetails?.phone || b.userDetails?._deletedPhone || '—'} />
              <OdItem label="Email"   value={b.userId?.email || b.userDetails?.email || '—'} />
              <OdItem label="Address" value={[b.userDetails?.address, b.userDetails?.city, b.userDetails?.state, b.userDetails?.pincode].filter(Boolean).join(', ') || '—'} />
              {!b.userId && b.userDetails?._deletedAt && (
                <div className="col-span-2">
                  <span className="text-[10px] text-red-400 bg-red-50 px-2 py-0.5 rounded-full">Account deleted on {new Date(b.userDetails._deletedAt).toLocaleDateString('en-IN')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2 — Booking */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">📋 Booking Information</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 bg-gray-50 rounded-2xl p-4">
              <OdItem label="Pooja"         value={b.poojaId?.name || '—'} />
              <OdItem label="Language"      value={b.language || '—'} />
              <OdItem label="Ceremony Date" value={b.scheduledDate?.split('T')[0] || '—'} />
              <OdItem label="Ceremony Time" value={b.scheduledTime || '—'} />
              <OdItem label="Booking Type"  value={b.isUrgent ? '⚡ Urgent' : 'Normal'} />
              <OdItem label="Booked On"     value={b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'} />
              {b.specialNote && (
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Special Note</p>
                  <p className="text-sm text-gray-700 mt-0.5 italic">"{b.specialNote}"</p>
                </div>
              )}
            </div>
            {b.panditId && (
              <div className="mt-3 bg-indigo-50 rounded-2xl p-4">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Assigned Pandit</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <OdItem label="Pandit"          value={b.panditId.name || '—'} />
                  <OdItem label="Phone"           value={b.panditId.phone || '—'} />
                  {b.payout?.amount > 0          && <OdItem label="Payout Assigned" value={`₹${Number(b.payout.amount).toLocaleString('en-IN')}`} />}
                  {b.payout?.status              && <OdItem label="Payout Status"   value={b.payout.status} />}
                  {b.payout?.paidAt              && <OdItem label="Payout Date"     value={new Date(b.payout.paidAt).toLocaleDateString('en-IN')} />}
                  {b.payout?.transactionRef      && <OdItem label="Payout Ref"      value={b.payout.transactionRef} mono />}
                </div>
              </div>
            )}
          </div>

          {/* Section — Pandit Referral */}
          {b.referral?.referralId && (
            <ReferralDetailSection booking={b} />
          )}

          {/* Section 3 — Kit (conditional) */}
          {hasKit && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">📦 Kit Details</p>
              <div className="bg-amber-50 rounded-2xl p-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <OdItem label="Kit Name"        value={b.kitId?.name || '—'} />
                  <OdItem label="Kit Price"       value={b.kitAmount > 0 ? `₹${Number(b.kitAmount).toLocaleString('en-IN')}` : '—'} />
                  <OdItem label="Delivery Status" value={b.kitDelivery?.status || 'pending'} />
                  {b.kitDelivery?.courier    && <OdItem label="Courier"     value={b.kitDelivery.courier} />}
                  {b.kitDelivery?.trackingId && <OdItem label="Tracking ID" value={b.kitDelivery.trackingId} mono />}
                  {b.kitDelivery?.remarks    && <OdItem label="Remarks"     value={b.kitDelivery.remarks} />}
                </div>
                {b.kitId?.items?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Kit Contents</p>
                    <div className="space-y-1.5">
                      {b.kitId.items.map((ki, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-medium">{ki.productId?.name || 'Item'}</span>
                          <span className="text-gray-400">×{ki.quantity || 1}</span>
                          {ki.variantLabel && <span className="text-gray-400">({ki.variantLabel})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 4 — Products (conditional) */}
          {hasProducts && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">🛍️ Products Ordered</p>
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                {productItems.map((item, idx) => (
                  <div key={idx} className={`flex items-center justify-between px-4 py-3 ${idx < productItems.length - 1 ? 'border-b border-gray-50' : ''} ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name || item.productId?.name || 'Product'}</p>
                      {item.variantLabel && <p className="text-xs text-gray-400">{item.variantLabel}</p>}
                      <p className="text-xs text-gray-400">₹{Number(item.price).toLocaleString('en-IN')} × {item.quantity}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-semibold text-gray-800">₹{Number(item.total || item.price * item.quantity).toLocaleString('en-IN')}</p>
                      {(item.taxAmount || 0) > 0 && (
                        <p className="text-[10px] text-gray-400">incl. ₹{item.taxAmount} GST ({item.taxRate}%)</p>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center px-4 py-3 bg-indigo-50 border-t border-indigo-100">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Products Total</span>
                  <span className="font-bold text-indigo-700" style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.05rem' }}>₹{Number(productTotal).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Section 5 — Price Breakdown (pricing only, no implied payment completion) */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">💰 Price Breakdown</p>
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
              <OdPriceLine label="Pooja Amount"         value={b.poojaAmount || 0} />
              {(b.kitAmount   || 0) > 0 && <OdPriceLine label="Kit Amount"          value={b.kitAmount}   />}
              {(b.platformFee || 0) > 0 && <OdPriceLine label="Platform Fee"        value={b.platformFee} muted />}
              {(b.platformGST || 0) > 0 && <OdPriceLine label="GST on Platform Fee" value={b.platformGST} muted />}
              {(b.kitGST      || 0) > 0 && <OdPriceLine label="GST on Kit"          value={b.kitGST}      muted />}
              {productTotal > 0         && <OdPriceLine label="Marketplace Products" value={productTotal}  />}
              {productGST   > 0         && <OdPriceLine label="GST on Products"      value={productGST}    muted />}
              <div className="border-t border-gray-200 pt-3 mt-1">
                <OdPriceLine label="Grand Total" value={orderTotal} bold />
              </div>
            </div>
          </div>

          {/* Section 6 — Payment Summary (payment-aware: never implies Grand Total == Paid) */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">💳 Payment Summary</p>

            {/* Hero status card */}
            <div className={`rounded-2xl p-5 mb-3 border ${psConfig.bg} ${psConfig.border}`}>
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${psConfig.badge}`}>
                  {psConfig.label}
                </span>
                <span className="text-xs text-gray-500">
                  {paymentMode === 'PARTIAL' ? 'Partial Payment Plan' : 'Full Payment'}
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Grand Total</span>
                  <span className="text-base font-bold text-gray-900" style={{ fontFamily: '"Cormorant Garamond"' }}>
                    ₹{Number(bookingTotal).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    {amountPaid > 0 && <span className="text-sm leading-none">✅</span>}
                    Amount Paid
                  </span>
                  <span className={`text-base font-bold ${amountPaid > 0 ? 'text-green-700' : 'text-gray-400'}`} style={{ fontFamily: '"Cormorant Garamond"' }}>
                    ₹{Number(amountPaid).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className={`flex justify-between items-center pt-3 border-t ${psConfig.divider}`}>
                  <span className={`text-sm font-semibold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-700'}`}>
                    Pending Amount
                  </span>
                  <span className={`text-base font-bold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-700'}`} style={{ fontFamily: '"Cormorant Garamond"' }}>
                    ₹{Number(remainingAmount).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment details grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 bg-gray-50 rounded-2xl p-4">
              <OdItem label="Gateway"      value={b.paymentProvider ? b.paymentProvider.charAt(0).toUpperCase() + b.paymentProvider.slice(1) : 'PhonePe'} />
              <OdItem label="Payment Type" value={paymentMode === 'PARTIAL' ? 'Partial Payment' : 'Full Payment'} />
              {successPayments[0]?.paidAt && (
                <OdItem label="Payment Date" value={new Date(successPayments[0].paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              )}
              {b.phonePeTransactionId         && <OdItem label="Transaction ID" value={b.phonePeTransactionId}         mono />}
              {b.phonePeMerchantTransactionId && <OdItem label="Merchant Ref"   value={b.phonePeMerchantTransactionId} mono />}
            </div>
          </div>

          {/* Section 7 — Payment History (all ledger entries) */}
          {!loadingPayments && payments.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">📋 Payment History</p>
              <div className="space-y-3">
                {payments.map((payment, idx) => {
                  const isSuccess = payment.paymentStatus === 'SUCCESS';
                  const isPending = payment.paymentStatus === 'PENDING';
                  return (
                    <div key={payment._id || idx} className={`rounded-2xl p-4 border ${
                      isSuccess ? 'bg-green-50 border-green-200' :
                      isPending ? 'bg-yellow-50 border-yellow-200' :
                      'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">Payment #{idx + 1}</span>
                          <span className="text-xs text-gray-400">
                            {payment.paymentType === 'PARTIAL'   ? '· First Instalment' :
                             payment.paymentType === 'REMAINING' ? '· Remaining Amount' : '· Full Payment'}
                          </span>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          isSuccess ? 'bg-green-100 text-green-700' :
                          isPending ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {isSuccess ? '✓ Completed' : isPending ? '⏳ Pending' : '✗ Failed'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Amount</p>
                          <p className="font-bold text-gray-900" style={{ fontFamily: '"Cormorant Garamond"', fontSize: '1.05rem' }}>₹{Number(payment.amount).toLocaleString('en-IN')}</p>
                        </div>
                        {payment.paidAt && (
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Date</p>
                            <p className="text-sm text-gray-700">{new Date(payment.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                          </div>
                        )}
                        {payment.phonePeTransactionId && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Transaction ID</p>
                            <p className="text-sm text-gray-700 font-mono break-all">{payment.phonePeTransactionId}</p>
                          </div>
                        )}
                        {payment.note && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Note</p>
                            <p className="text-sm text-gray-600 italic">{payment.note}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function OdItem({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm text-gray-700 mt-0.5 ${mono ? 'font-mono text-xs break-all' : ''}`}>{value || '—'}</p>
    </div>
  );
}

function OdPriceLine({ label, value, muted = false, bold = false }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-gray-500 text-xs' : 'text-gray-700'} ${bold ? 'font-bold text-gray-900' : ''}`}>
      <span>{label}</span>
      <span style={bold ? { fontFamily: '"Cormorant Garamond"', fontSize: '1.15rem', color: '#1B1F3B' } : {}}>
        ₹{Number(value || 0).toLocaleString('en-IN')}
      </span>
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
            <ZutsavLoaderInline size={36} />
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

  const exportPanditsCSV = () => {
    const headers = ['Name', 'Phone', 'Email', 'City', 'State', 'KYC Status', 'Profile Status', 'Total Bookings', 'Joined'];
    const rows = filteredPandits.map((p) => [
      p.name || '',
      p.phone || '',
      p.email || '',
      p.city  || '',
      p.state || '',
      p.kycStatus    || '',
      p.status       || '',
      p.totalBookings || 0,
      p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `pandits_${kycFilter}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
          <button onClick={exportPanditsCSV} className="text-xs font-semibold flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors">
            ⬇ Export CSV
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

  const exportUsersCSV = () => {
    const headers = ['Name', 'Phone', 'Email', 'Role', 'Status', 'Joined'];
    const rows = users.map((u) => [
      u.name  || '',
      u.phone || '',
      u.email || '',
      u.role  || '',
      u.isActive ? 'Active' : 'Suspended',
      u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `users_${userView}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
        <div className="flex items-center gap-2 flex-wrap">
          {userView === 'all' && (
            <input className="input w-64" placeholder="Search name, phone, email..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          )}
          <button onClick={exportUsersCSV} className="text-xs font-semibold flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            ⬇ Export CSV
          </button>
        </div>
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
const EMPTY_POOJA_FORM = { name:'', categoryIds:[], price:'', mrp:'', salePrice:'', taxEnabled:false, taxRate:'', durationValue:'', durationUnit:'hours', shortDesc:'', description:'', requirements:'', benefits:'', languages:'Hindi, English, Sanskrit' };
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
        <div>
          <label className="label">MRP (₹) <span className="text-gray-400 text-xs font-normal">(original/crossed price)</span></label>
          <input type="number" min="0" className="input" placeholder="e.g. 5000" value={form.mrp} onChange={set('mrp')} />
        </div>
        <div>
          <label className="label">Sale Price (₹) *</label>
          <input required type="number" min="0" className="input" placeholder="e.g. 3999" value={form.salePrice} onChange={set('salePrice')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Tax / GST</label>
          <div className="flex items-center gap-3 mt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.taxEnabled}
                onChange={(e) => setForm((f) => ({ ...f, taxEnabled: e.target.checked }))}
                className="accent-saffron-500 w-4 h-4"
              />
              <span className="text-sm text-gray-700">Apply GST on pooja price</span>
            </label>
            {form.taxEnabled && (
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" max="100" step="0.5"
                  className="input w-20 text-sm"
                  placeholder="18"
                  value={form.taxRate}
                  onChange={set('taxRate')}
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            )}
          </div>
        </div>
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

  const exportPoojasCSV = () => {
    const headers = ['Name', 'Categories', 'Price (₹)', 'Duration', 'Featured', 'Status'];
    const rows = poojas.map((p) => [
      p.name || '',
      (p.categoryIds || []).map((c) => c.name || c).join('; '),
      p.price || 0,
      p.durationValue ? `${p.durationValue} ${p.durationUnit || ''}` : '',
      p.isFeatured ? 'Yes' : 'No',
      p.isDeleted ? 'Deleted' : p.isActive ? 'Active' : 'Inactive',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `poojas_${statusFilter}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
    fd.append('price', form.salePrice || form.mrp || form.price || '0');
    if (form.mrp)          fd.append('mrp', form.mrp);
    if (form.salePrice)    fd.append('salePrice', form.salePrice);
    fd.append('taxEnabled', String(form.taxEnabled));
    if (form.taxEnabled && form.taxRate) fd.append('taxRate', form.taxRate);
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
      mrp:           p.mrp       ? String(p.mrp)       : '',
      salePrice:     p.salePrice ? String(p.salePrice) : '',
      taxEnabled:    !!p.taxEnabled,
      taxRate:       p.taxRate   ? String(p.taxRate)   : '',
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
            <button onClick={exportPoojasCSV} className="text-xs font-semibold flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              ⬇ Export CSV
            </button>
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
                  ? <><ZutsavLoaderInline size={16} /> Fetching Festival Data...</>
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
// ─── Order Management ─────────────────────────────────────────

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
  shipped:          ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered:        ['refunded'],
  cancelled:        ['refunded'],
};

// ── Invoice print helper ──────────────────────────────────────
function _openInvoiceWindow(order, shipment) {
  const addr      = order.shippingAddress || {};
  const user      = order.userId || {};
  const fmtINR    = (n) => `₹${(+(n || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const invoiceNo = `INV-${order.orderNumber}`;
  const subtotal  = order.items.reduce((s, it) => s + (it.price * it.quantity), 0);
  const total     = order.totalAmount || subtotal;
  const taxAmt    = Math.round(total * 0.18 / 1.18 * 100) / 100;
  const pretax    = Math.round((total - taxAmt) * 100) / 100;

  const itemRows = order.items.map(it => `
    <tr>
      <td class="td">${it.name}${it.variantLabel ? `<br><small style="color:#9ca3af">${it.variantLabel}</small>` : ''}</td>
      <td class="td tc">${it.quantity}</td>
      <td class="td tr">${fmtINR(it.price)}</td>
      <td class="td tr">${it.taxRate ? it.taxRate + '%' : '—'}</td>
      <td class="td tr fw">${fmtINR(it.price * it.quantity)}</td>
    </tr>`).join('');

  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Invoice ${invoiceNo}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#374151;background:#fff;padding:32px}
    .page{max-width:794px;margin:0 auto}
    .header{background:#1B1F3B;color:white;padding:24px 28px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:flex-start}
    .brand{font-size:22px;font-weight:900;font-family:Georgia,serif;color:#D4AF37}
    .brand small{font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);letter-spacing:2px;vertical-align:middle}
    .inv-title{text-align:right;color:#D4AF37;font-size:16px;font-weight:900;font-family:Georgia,serif;letter-spacing:2px}
    .inv-sub{color:rgba(255,255,255,0.6);font-size:11px;margin-top:3px}
    .parties{display:flex;gap:24px;padding:16px 28px;border:1px solid #e5e7eb;border-top:none;background:#f9fafb}
    .party{flex:1}
    .party-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px}
    .party-name{font-weight:700;color:#1B1F3B;margin-bottom:3px}
    .party-sub{font-size:12px;color:#6b7280;line-height:1.5}
    table{width:100%;border-collapse:collapse}
    .th{background:#1B1F3B;color:white;padding:9px 12px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700}
    .td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top}
    tr:nth-child(even) .td{background:#f9fafb}
    .tc{text-align:center}.tr{text-align:right}.fw{font-weight:700}
    .total-row td{padding:9px 12px;border-top:1px solid #e5e7eb;color:#6b7280}
    .grand-row td{padding:12px;background:#1B1F3B;color:#D4AF37;font-weight:900;font-size:15px}
    .paid-box{margin:16px 28px;padding:14px 20px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
    .paid-amt{font-size:20px;font-weight:900;color:#15803d}
    .paid-badge{padding:5px 16px;border-radius:999px;background:#dcfce7;color:#15803d;font-weight:700;font-size:12px;border:1px solid #86efac}
    .footer{text-align:center;color:#9ca3af;font-size:11px;padding:16px 28px 0;line-height:1.7}
    @media print{body{padding:0}.page{max-width:100%}}
  </style>
  </head><body>
  <div class="page">
    <div class="header">
      <div>
        <div class="brand">🪔 Zutsav <small>ENTERPRISES</small></div>
        <div class="inv-sub" style="margin-top:6px">GSTIN: 09AAAFZ1234Z1Z5 | PAN: AAAFZ1234Z</div>
        <div class="inv-sub">info@zutsav.com | +91-8851576605</div>
      </div>
      <div>
        <div class="inv-title">TAX INVOICE</div>
        <div class="inv-sub">Invoice: ${invoiceNo}</div>
        <div class="inv-sub">Order: #${order.orderNumber}</div>
        <div class="inv-sub">Date: ${orderDate}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Bill To</div>
        <div class="party-name">${addr.name || user.name || ''}</div>
        <div class="party-sub">${user.phone || addr.phone || ''}<br>${user.email || ''}</div>
      </div>
      <div class="party">
        <div class="party-label">Ship To</div>
        <div class="party-name">${addr.name || ''}</div>
        <div class="party-sub">${[addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}<br>${addr.phone || ''}</div>
      </div>
      ${shipment ? `<div class="party">
        <div class="party-label">Shipment</div>
        <div class="party-name">${shipment.courierName || shipment.deliveryPartner || 'TekiPost'}</div>
        <div class="party-sub">AWB: ${shipment.awbNumber || shipment.trackingNumber || '—'}<br>Status: ${shipment.shipmentStatus || '—'}</div>
      </div>` : ''}
    </div>

    <table>
      <thead><tr>
        <th class="th" style="text-align:left">Product</th>
        <th class="th tc">Qty</th>
        <th class="th tr">Unit Price</th>
        <th class="th tr">Tax %</th>
        <th class="th tr">Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr class="total-row"><td colspan="4" style="text-align:right">Subtotal (excl. GST)</td><td class="tr">${fmtINR(pretax)}</td></tr>
        <tr class="total-row"><td colspan="4" style="text-align:right">GST @ 18%</td><td class="tr">${fmtINR(taxAmt)}</td></tr>
        <tr class="grand-row"><td colspan="4" style="text-align:right;font-size:13px;font-weight:700">GRAND TOTAL</td><td class="tr">${fmtINR(total)}</td></tr>
      </tfoot>
    </table>

    <div class="paid-box">
      <div>
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:3px">Amount Paid</div>
        <div class="paid-amt">${fmtINR(total)}</div>
      </div>
      <div class="paid-badge">✅ Paid in Full</div>
    </div>

    <div class="footer">
      This is a computer-generated invoice and does not require a physical signature.<br>
      For support: info@zutsav.com | +91-8851576605 | www.zutsav.com
    </div>

    <div style="text-align:center;margin-top:20px">
      <button onclick="window.print()" style="padding:10px 28px;background:#1B1F3B;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨 Print / Save as PDF</button>
    </div>
  </div>
  </body></html>`);
  w.document.close();
}

const SHIPMENT_STATUS_META = {
  pending_courier_selection: { label: 'Select Courier',   color: 'bg-yellow-100 text-yellow-700' },
  created:          { label: 'AWB Generated',    color: 'bg-blue-100 text-blue-700'    },
  picked_up:        { label: 'Picked Up',         color: 'bg-indigo-100 text-indigo-700'},
  in_transit:       { label: 'In Transit',        color: 'bg-purple-100 text-purple-700'},
  out_for_delivery: { label: 'Out for Delivery',  color: 'bg-amber-100 text-amber-700'  },
  delivered:        { label: 'Delivered',         color: 'bg-green-100 text-green-700'  },
  failed_delivery:  { label: 'Failed Delivery',   color: 'bg-red-100 text-red-700'      },
  cancelled:        { label: 'Cancelled',         color: 'bg-red-100 text-red-700'      },
  returned:         { label: 'Returned',          color: 'bg-gray-100 text-gray-600'    },
};

const TRACKING_STEPS = [
  { key: 'created',          label: 'Shipment Created'  },
  { key: 'picked_up',        label: 'Picked Up'         },
  { key: 'in_transit',       label: 'In Transit'        },
  { key: 'out_for_delivery', label: 'Out for Delivery'  },
  { key: 'delivered',        label: 'Delivered'         },
];

const MANUAL_SHIPMENT_STATUS_OPTIONS = [
  { value: 'created',          label: 'Shipment Created'  },
  { value: 'picked_up',        label: 'Picked Up'         },
  { value: 'out_for_delivery', label: 'Out for Delivery'  },
  { value: 'delivered',        label: 'Delivered'         },
  { value: 'failed_delivery',  label: 'Failed Delivery'   },
  { value: 'cancelled',        label: 'Cancelled'         },
  { value: 'returned',         label: 'Returned'          },
];

// ── Manage Order Modal ────────────────────────────────────────
function ManageOrderModal({ order, onClose, onRefresh }) {
  // Shipment state
  const [shipment,        setShipment]        = useState(null);
  const [shipmentLoading, setShipmentLoading] = useState(true);
  const [shippingConfig,  setShippingConfig]  = useState({ couriers: [], localPartners: [] });

  // UI state
  const [shippingMethod,  setShippingMethod]  = useState(null);   // null | 'tekipost' | 'manual'
  const [manualType,      setManualType]      = useState(null);   // null | 'courier' | 'local_delivery'

  // TekiPost multi-step flow
  // tpStep: null → parcel form → courier_select → (done — shipment.status=created)
  const [tpStep,          setTpStep]          = useState(null);
  const [tpParcel,        setTpParcel]        = useState({ weight: '', length: '', width: '', height: '', isCOD: false, codAmount: '' });
  const [tpCouriers,      setTpCouriers]      = useState([]);
  const [tpSelected,      setTpSelected]      = useState(null);    // selected courier object
  const [tpPendingId,     setTpPendingId]     = useState(null);    // shipment._id from init
  const [tpOrderId,       setTpOrderId]       = useState('');      // tekipostOrderId from init
  const [tpIniting,       setTpIniting]       = useState(false);
  const [tpConfirming,    setTpConfirming]    = useState(false);
  const [tpCancelling,    setTpCancelling]    = useState(false);
  const [tpMarkingRefund, setTpMarkingRefund] = useState(false);

  const [syncing,         setSyncing]         = useState(false);

  // Manual courier form
  const [mCourierName,    setMCourierName]    = useState('');
  const [mCourierCustom,  setMCourierCustom]  = useState('');
  const [mTracking,       setMTracking]       = useState('');
  const [mETA,            setMETA]            = useState('');
  const [mRemarks,        setMRemarks]        = useState('');

  // Manual local delivery form
  const [mPartner,        setMPartner]        = useState('');
  const [mPartnerCustom,  setMPartnerCustom]  = useState('');
  const [mDriverName,     setMDriverName]     = useState('');
  const [mDriverPhone,    setMDriverPhone]    = useState('');
  const [mVehicle,        setMVehicle]        = useState('');
  const [mExpectedTime,   setMExpectedTime]   = useState('');
  const [mLocalRemarks,   setMLocalRemarks]   = useState('');

  // Shipment status update
  const [newShipStatus,   setNewShipStatus]   = useState('');
  const [shipStatusNote,  setShipStatusNote]  = useState('');
  const [updatingStatus,  setUpdatingStatus]  = useState(false);

  // Order status
  const [newOrderStatus,  setNewOrderStatus]  = useState('');
  const [cancelReason,    setCancelReason]    = useState('');
  const [updatingOrder,   setUpdatingOrder]   = useState(false);

  // Delivery OTP
  const [otpInput,        setOtpInput]        = useState('');
  const [otpLoading,      setOtpLoading]      = useState(false);
  const [otpGenerated,    setOtpGenerated]    = useState(!!order.deliveryOTP?.generatedAt);
  const [otpVerified,     setOtpVerified]     = useState(!!order.deliveryOTP?.verified);
  const [localOrder,      setLocalOrder]      = useState(order);

  const [saving,          setSaving]          = useState(false);

  useEffect(() => {
    async function loadShipment() {
      try {
        const [{ data: sd }, { data: cd }] = await Promise.all([
          API.get(`/admin/orders/${order._id}/shipment`),
          API.get('/admin/shipping-config'),
        ]);
        setShipment(sd.shipment || null);
        setShippingConfig({ couriers: cd.couriers || [], localPartners: cd.localPartners || [] });
        if (sd.shipment) {
          setShippingMethod(sd.shipment.shippingMethod);
          setManualType(sd.shipment.manualType || null);
          // Resume TekiPost courier selection if admin previously initiated but hadn't confirmed
          if (sd.shipment.shippingMethod === 'tekipost' &&
              sd.shipment.shipmentStatus === 'pending_courier_selection') {
            setTpStep('courier_select');
            setTpPendingId(sd.shipment._id);
            setTpOrderId(sd.shipment.tekipostOrderId || '');
            setTpCouriers(sd.shipment.availableCouriers || []);
          }
        }
      } catch { toast.error('Could not load shipment data'); }
      finally { setShipmentLoading(false); }
    }
    loadShipment();
  }, [order._id]);

  // Step 1: validate parcel info → call TekiPost Single Order API → show courier options
  const handleTekiPostInit = async () => {
    setTpIniting(true);
    try {
      const payload = {
        weight:    tpParcel.weight   ? Number(tpParcel.weight)   : undefined,
        length:    tpParcel.length   ? Number(tpParcel.length)   : undefined,
        width:     tpParcel.width    ? Number(tpParcel.width)    : undefined,
        height:    tpParcel.height   ? Number(tpParcel.height)   : undefined,
        isCOD:     tpParcel.isCOD,
        codAmount: tpParcel.isCOD && tpParcel.codAmount ? Number(tpParcel.codAmount) : undefined,
      };
      const { data } = await API.post(`/admin/orders/${order._id}/shipment/tekipost/init`, payload);
      setShipment(data.shipment);

      // TekiPost auto-selected courier — no courier selection step needed
      if (data.autoConfirmed) {
        toast.success(`Shipment created! AWB: ${data.awbNumber} · ${data.courier}`);
        setTpStep(null);
        return;
      }

      setTpPendingId(data.shipment._id);
      setTpOrderId(data.tekipostOrderId || '');
      setTpCouriers(data.couriers || []);
      setTpStep('courier_select');
      if (data.resumed) toast('Resumed previous courier selection', { icon: '↩️' });
    } catch (err) {
      const errData = err?.response?.data;
      toast.error(errData?.message || 'Failed to get courier options', { duration: 6000 });
      const tpErrors = errData?.tekipostResponse?.errors;
      if (Array.isArray(tpErrors) && tpErrors.length) {
        toast.error(tpErrors.map((e) => `${e.field ? e.field + ': ' : ''}${e.message}`).join('\n'), { duration: 8000 });
      }
    }
    finally { setTpIniting(false); }
  };

  // Step 2: confirm selected courier → generate AWB
  const handleTekiPostConfirm = async () => {
    if (!tpSelected) { toast.error('Select a courier to continue'); return; }
    setTpConfirming(true);
    try {
      const { data } = await API.post(`/admin/orders/${order._id}/shipment/tekipost/confirm`, {
        logisticsId:  tpSelected.logisticsId,
        courierCode:  tpSelected.courierCode,
        courierName:  tpSelected.courierName,
        freightCharge: tpSelected.freightCharge,
      });
      setShipment(data.shipment);
      setTpStep(null);
      toast.success(`AWB ${data.shipment.awbNumber} generated via ${data.shipment.courierName}!`);
      onRefresh();
    } catch (err) {
      const errData = err?.response?.data;
      toast.error(errData?.message || 'Courier confirmation failed', { duration: 6000 });
    }
    finally { setTpConfirming(false); }
  };

  // Cancel AWB (after AWB generation, before pickup)
  const handleTekiPostCancelAWB = async () => {
    if (!window.confirm(`Cancel AWB ${shipment?.awbNumber}? TekiPost will attempt to refund the freight charges to the wallet.`)) return;
    setTpCancelling(true);
    try {
      const reason = window.prompt('Cancellation reason (optional):') || '';
      const { data } = await API.post(`/admin/orders/${order._id}/shipment/tekipost/cancel-awb`, { reason });
      setShipment(data.shipment);
      toast.success(`AWB cancelled. Wallet refund: ₹${data.refundAmount || 0}`);
      onRefresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'AWB cancellation failed', { duration: 6000 });
    }
    finally { setTpCancelling(false); }
  };

  // Admin manually marks wallet refund as completed
  const handleMarkWalletRefunded = async () => {
    setTpMarkingRefund(true);
    try {
      const { data } = await API.patch(`/admin/orders/${order._id}/shipment/tekipost/wallet-refund`);
      setShipment(data.shipment);
      toast.success('Wallet refund marked as completed');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed');
    }
    finally { setTpMarkingRefund(false); }
  };

  const handleManualSave = async () => {
    if (!manualType) { toast.error('Select Courier or Local Delivery'); return; }
    const courierName    = mCourierName   === 'Other' ? mCourierCustom  : mCourierName;
    const partnerName    = mPartner       === 'Other' ? mPartnerCustom  : mPartner;
    if (manualType === 'courier' && !courierName) { toast.error('Select or enter a courier'); return; }
    if (manualType === 'local_delivery' && !partnerName) { toast.error('Select or enter a delivery partner'); return; }
    setSaving(true);
    try {
      const payload = {
        manualType,
        courierName:     manualType === 'courier'        ? courierName  : undefined,
        trackingNumber:  manualType === 'courier'        ? mTracking    : undefined,
        estimatedDelivery: mETA || undefined,
        remarks:         manualType === 'courier'        ? mRemarks     : mLocalRemarks,
        deliveryPartner: manualType === 'local_delivery' ? partnerName  : undefined,
        driverName:      manualType === 'local_delivery' ? mDriverName  : undefined,
        driverPhone:     manualType === 'local_delivery' ? mDriverPhone : undefined,
        vehicleNumber:   manualType === 'local_delivery' ? mVehicle     : undefined,
        expectedTime:    manualType === 'local_delivery' ? mExpectedTime: undefined,
      };
      const { data } = await API.post(`/admin/orders/${order._id}/shipment/manual`, payload);
      setShipment(data.shipment);
      toast.success('Shipment saved!');
      onRefresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to save shipment'); }
    finally { setSaving(false); }
  };

  const handleSyncStatus = async () => {
    setSyncing(true);
    try {
      const { data } = await API.post(`/admin/orders/${order._id}/shipment/sync`);
      setShipment(data.shipment);
      toast.success(`Status synced: ${data.mappedStatus}`);
      onRefresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Sync failed'); }
    finally { setSyncing(false); }
  };

  const handleShipmentStatusUpdate = async () => {
    if (!newShipStatus) { toast.error('Select a shipment status'); return; }
    setUpdatingStatus(true);
    try {
      const { data } = await API.patch(`/admin/orders/${order._id}/shipment/status`, { status: newShipStatus, note: shipStatusNote });
      setShipment(data.shipment);
      setNewShipStatus(''); setShipStatusNote('');
      toast.success('Shipment status updated');
      onRefresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed'); }
    finally { setUpdatingStatus(false); }
  };

  const handleOrderStatusUpdate = async () => {
    if (!newOrderStatus) { toast.error('Select a status'); return; }
    setUpdatingOrder(true);
    try {
      const { data } = await API.patch(`/admin/orders/${order._id}/status`, { status: newOrderStatus, cancelReason });
      toast.success('Order status updated');
      setNewOrderStatus(''); setCancelReason('');
      setLocalOrder(data.order || order);
      if (newOrderStatus === 'out_for_delivery') setOtpGenerated(true);
      onRefresh();
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed'); }
    finally { setUpdatingOrder(false); }
  };

  const handleGenerateOTP = async () => {
    setOtpLoading(true);
    try {
      await API.post(`/admin/orders/${order._id}/delivery-otp/generate`);
      toast.success('Delivery OTP sent to customer via WhatsApp & email');
      setOtpGenerated(true);
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to generate OTP'); }
    finally { setOtpLoading(false); }
  };

  const handleResendOTP = async () => {
    setOtpLoading(true);
    try {
      await API.post(`/admin/orders/${order._id}/delivery-otp/resend`);
      toast.success('New OTP sent to customer');
      setOtpInput('');
    } catch (err) { toast.error(err?.response?.data?.message || 'Failed to resend OTP'); }
    finally { setOtpLoading(false); }
  };

  const handleVerifyOTP = async () => {
    if (!otpInput.trim()) { toast.error('Enter the OTP'); return; }
    setOtpLoading(true);
    try {
      await API.post(`/admin/orders/${order._id}/delivery-otp/verify`, { otp: otpInput.trim() });
      toast.success('OTP verified! Order marked as Delivered.');
      setOtpVerified(true);
      onRefresh();
      onClose();
    } catch (err) { toast.error(err?.response?.data?.message || 'OTP verification failed'); }
    finally { setOtpLoading(false); }
  };

  const handleViewInvoice = async () => {
    try {
      const { data } = await API.get(`/admin/orders/${order._id}/invoice`);
      _openInvoiceWindow(data.order, data.shipment);
    } catch (err) { toast.error('Could not load invoice'); }
  };

  const addr          = order.shippingAddress || {};
  const curStatus     = localOrder.status || order.status;
  const nextStatuses  = STATUS_TRANSITIONS[curStatus] || [];
  const isTekiPost    = shipment?.shippingMethod === 'tekipost';
  const isManual      = shipment?.shippingMethod === 'manual';
  const isPendingCourierSelect = isTekiPost && shipment?.shipmentStatus === 'pending_courier_selection';
  // "isSaved" means a final shipment exists (AWB assigned or manual created) — not just a pending-selection placeholder
  const isSaved       = !!shipment && !isPendingCourierSelect;
  const showOTPPanel  = ['out_for_delivery', 'shipped'].includes(curStatus) && !otpVerified;
  const showInvoiceBtn = ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'].includes(curStatus);

  const SectionHeader = ({ icon: Icon, title }) => (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon size={14} className="text-gray-400" />}
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
    </div>
  );

  const Divider = () => <div className="border-t border-gray-100 my-4" />;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Modal Header */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 font-medium">Manage Order</p>
            <h2 className="font-bold text-gray-800 text-xl" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
              #{order.orderNumber}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${ORDER_STATUS_META[order.status]?.color || 'bg-gray-100 text-gray-500'}`}>
              {ORDER_STATUS_META[order.status]?.label || order.status}
            </span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-0">

          {/* ── Section 1: Customer Details ──────────────── */}
          <SectionHeader icon={User} title="Customer Details" />
          <div className="bg-gray-50 rounded-2xl p-4 space-y-1 mb-4">
            <p className="font-semibold text-gray-800 text-sm">{order.userId?.name || addr.name || '—'}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} /> {order.userId?.phone || addr.phone || '—'}</p>
            {order.userId?.email && <p className="text-xs text-gray-500 flex items-center gap-1"><Mail size={10} /> {order.userId.email}</p>}
            <div className="pt-1">
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5"><MapPin size={10} /> Delivery Address</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                {[addr.address, addr.city, addr.district, addr.state, addr.pincode].filter(Boolean).join(', ') || '—'}
              </p>
            </div>
          </div>

          <Divider />

          {/* ── Section 2: Products Ordered ──────────────── */}
          <SectionHeader icon={Package} title="Products Ordered" />
          <div className="space-y-1.5 mb-4">
            {order.items?.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-700 text-xs">{item.name} <span className="text-gray-400">×{item.quantity}</span></span>
                <span className="font-semibold text-gray-800 text-xs">₹{item.total?.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 font-bold">
              <span className="text-sm text-gray-700">Order Total</span>
              <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '1.1rem', color: '#1B1F3B' }}>
                ₹{order.totalAmount?.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <Divider />

          {/* ── Section 3: Shipment ──────────────────────── */}
          <SectionHeader icon={Truck} title="Shipping Method" />

          {shipmentLoading ? (
            <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
              <Loader size={14} className="animate-spin" /> Loading shipment info...
            </div>
          ) : isSaved ? (
            /* ─ Shipment already created — show details ─ */
            <div className="space-y-4 mb-4">
              {/* Method badge */}
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${isTekiPost ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'}`}>
                  {isTekiPost ? '🚀 TekiPost' : `✋ Manual ${shipment.manualType === 'local_delivery' ? '· Local Delivery' : '· Courier'}`}
                </span>
                {shipment.shipmentStatus && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SHIPMENT_STATUS_META[shipment.shipmentStatus]?.color || 'bg-gray-100 text-gray-500'}`}>
                    {SHIPMENT_STATUS_META[shipment.shipmentStatus]?.label || shipment.shipmentStatus}
                  </span>
                )}
              </div>

              {/* Shipment details grid */}
              <div className="bg-indigo-50 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
                {(shipment.courierName || shipment.deliveryPartner) && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">{isManual && shipment.manualType === 'local_delivery' ? 'Delivery Partner' : 'Courier Partner'}</p>
                    <p className="font-bold text-indigo-900">{shipment.courierName || shipment.deliveryPartner || '—'}</p>
                  </div>
                )}
                {shipment.trackingNumber && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Tracking Number</p>
                    <p className="font-bold text-indigo-900 font-mono">{shipment.trackingNumber}</p>
                  </div>
                )}
                {shipment.awbNumber && shipment.awbNumber !== shipment.trackingNumber && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">AWB</p>
                    <p className="font-bold text-indigo-900 font-mono">{shipment.awbNumber}</p>
                  </div>
                )}
                {shipment.freightCharges > 0 && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Freight Charges</p>
                    <p className="font-bold text-indigo-900">₹{Number(shipment.freightCharges).toLocaleString('en-IN')}</p>
                  </div>
                )}
                {shipment.estimatedDelivery && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Estimated Delivery</p>
                    <p className="font-bold text-indigo-900">
                      {new Date(shipment.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                )}
                {shipment.driverName && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Driver Name</p>
                    <p className="font-bold text-indigo-900">{shipment.driverName}</p>
                  </div>
                )}
                {shipment.driverPhone && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Driver Phone</p>
                    <p className="font-bold text-indigo-900">{shipment.driverPhone}</p>
                  </div>
                )}
                {shipment.vehicleNumber && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Vehicle</p>
                    <p className="font-bold text-indigo-900">{shipment.vehicleNumber}</p>
                  </div>
                )}
                {shipment.expectedTime && (
                  <div>
                    <p className="text-indigo-400 mb-0.5">Expected Time</p>
                    <p className="font-bold text-indigo-900">{shipment.expectedTime}</p>
                  </div>
                )}
                {shipment.remarks && (
                  <div className="col-span-2">
                    <p className="text-indigo-400 mb-0.5">Remarks</p>
                    <p className="text-indigo-800">{shipment.remarks}</p>
                  </div>
                )}
                {shipment.lastSyncedAt && isTekiPost && (
                  <div className="col-span-2">
                    <p className="text-indigo-400 text-[10px]">Last synced: {new Date(shipment.lastSyncedAt).toLocaleString('en-IN')}</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {isTekiPost && !shipment.isCancelled && (
                  <button onClick={handleSyncStatus} disabled={syncing}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors disabled:opacity-50">
                    <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                    {syncing ? 'Syncing...' : 'Refresh Status'}
                  </button>
                )}
                {shipment.labelUrl && (
                  <a href={shipment.labelUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-green-200 text-green-700 hover:bg-green-50 transition-colors">
                    <Download size={12} /> Download Label
                  </a>
                )}
                {shipment.trackingUrl && (
                  <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                    <ExternalLink size={12} /> View Tracking
                  </a>
                )}
                {/* Cancel AWB — only before pickup */}
                {isTekiPost && shipment.awbNumber && !shipment.isCancelled &&
                 ['created'].includes(shipment.shipmentStatus) && (
                  <button onClick={handleTekiPostCancelAWB} disabled={tpCancelling}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                    <X size={12} /> {tpCancelling ? 'Cancelling...' : 'Cancel AWB'}
                  </button>
                )}
              </div>

              {/* Wallet refund status (after AWB cancel) */}
              {shipment.isCancelled && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs space-y-1">
                  <p className="font-bold text-red-700">AWB Cancelled {shipment.cancelledAt ? `— ${new Date(shipment.cancelledAt).toLocaleDateString('en-IN')}` : ''}</p>
                  {shipment.cancellationReason && <p className="text-red-600">{shipment.cancellationReason}</p>}
                  {shipment.walletRefundStatus === 'pending' && (
                    <div className="flex items-center justify-between">
                      <p className="text-amber-700 font-semibold">Wallet refund pending: ₹{shipment.walletRefundAmount || '—'}</p>
                      <button onClick={handleMarkWalletRefunded} disabled={tpMarkingRefund}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50">
                        {tpMarkingRefund ? '...' : 'Mark Refunded'}
                      </button>
                    </div>
                  )}
                  {shipment.walletRefundStatus === 'refunded' && (
                    <p className="text-green-700 font-semibold">Wallet refund completed: ₹{shipment.walletRefundAmount}</p>
                  )}
                </div>
              )}

              {/* Tracking Timeline */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tracking Timeline</p>
                <div className="relative">
                  {TRACKING_STEPS.map((step, idx) => {
                    const histEntry = (shipment.shipmentHistory || []).find(h => h.status === step.key);
                    const reached   = !!(histEntry || shipment.shipmentStatus === step.key ||
                      TRACKING_STEPS.findIndex(s => s.key === shipment.shipmentStatus) > idx);
                    return (
                      <div key={step.key} className="flex items-start gap-3 relative">
                        {idx < TRACKING_STEPS.length - 1 && (
                          <div className="absolute left-[9px] top-5 w-0.5 h-8" style={{ background: reached ? '#1B1F3B' : '#e5e7eb' }} />
                        )}
                        <div className="w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center"
                          style={{ borderColor: reached ? '#1B1F3B' : '#e5e7eb', background: reached ? '#1B1F3B' : 'white' }}>
                          {reached && <CheckCircle size={10} className="text-white" />}
                        </div>
                        <div className="pb-6">
                          <p className={`text-xs font-semibold ${reached ? 'text-gray-800' : 'text-gray-400'}`}>{step.label}</p>
                          {histEntry?.timestamp && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(histEntry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {histEntry?.note && histEntry.note !== step.label && (
                            <p className="text-[10px] text-gray-400 italic">{histEntry.note}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Manual shipment status update */}
              {isManual && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Update Shipment Status</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {MANUAL_SHIPMENT_STATUS_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => setNewShipStatus(opt.value)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${newShipStatus === opt.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {newShipStatus && (
                    <>
                      <input className="input text-xs mb-2" placeholder="Note (optional)" value={shipStatusNote} onChange={e => setShipStatusNote(e.target.value)} />
                      <button onClick={handleShipmentStatusUpdate} disabled={updatingStatus}
                        className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all"
                        style={{ background: '#1B1F3B' }}>
                        {updatingStatus ? 'Updating...' : `Mark as: ${MANUAL_SHIPMENT_STATUS_OPTIONS.find(o => o.value === newShipStatus)?.label}`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ─ No final shipment yet — show selection UI ─ */
            <div className="mb-4">
              {/* Method selection — hidden if admin already initiated a TekiPost order (resuming courier selection) */}
              {!isPendingCourierSelect && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { value: 'tekipost', label: 'TekiPost', icon: '🚀', desc: '2-step: choose your courier, then generate AWB' },
                    { value: 'manual',   label: 'Manual',   icon: '✋', desc: 'Enter courier details manually'                  },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => { setShippingMethod(opt.value); setManualType(null); setTpStep(null); }}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${shippingMethod === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}>
                      <p className="text-lg mb-1">{opt.icon}</p>
                      <p className={`text-sm font-bold ${shippingMethod === opt.value ? 'text-indigo-700' : 'text-gray-700'}`}>{opt.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* TekiPost multi-step flow */}
              {shippingMethod === 'tekipost' && (
                <div className="space-y-4">
                  {/* Step 0: initial prompt OR parcel form */}
                  {tpStep === null && (
                    <div className="space-y-3">
                      <p className="text-xs text-indigo-700 font-semibold bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                        Fill in parcel details and TekiPost will show available couriers for you to choose from.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Weight (kg) *</label>
                          <input type="number" step="0.1" min="0.1" className="input text-sm"
                            placeholder="e.g. 1.5"
                            value={tpParcel.weight}
                            onChange={e => setTpParcel(p => ({ ...p, weight: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Length (cm)</label>
                          <input type="number" min="1" className="input text-sm"
                            placeholder="20"
                            value={tpParcel.length}
                            onChange={e => setTpParcel(p => ({ ...p, length: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Width (cm)</label>
                          <input type="number" min="1" className="input text-sm"
                            placeholder="15"
                            value={tpParcel.width}
                            onChange={e => setTpParcel(p => ({ ...p, width: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Height (cm)</label>
                          <input type="number" min="1" className="input text-sm"
                            placeholder="10"
                            value={tpParcel.height}
                            onChange={e => setTpParcel(p => ({ ...p, height: e.target.value }))} />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={tpParcel.isCOD}
                          onChange={e => setTpParcel(p => ({ ...p, isCOD: e.target.checked }))}
                          className="w-4 h-4 rounded" />
                        <span className="text-xs font-semibold text-gray-600">Cash on Delivery (COD)</span>
                      </label>
                      {tpParcel.isCOD && (
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">COD Amount (₹)</label>
                          <input type="number" min="0" className="input text-sm"
                            placeholder={`Order total: ₹${order.totalAmount}`}
                            value={tpParcel.codAmount}
                            onChange={e => setTpParcel(p => ({ ...p, codAmount: e.target.value }))} />
                        </div>
                      )}
                      <button onClick={handleTekiPostInit} disabled={tpIniting || !tpParcel.weight}
                        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{ background: '#1B1F3B' }}>
                        {tpIniting
                          ? <><Loader size={14} className="animate-spin" /> Fetching Couriers...</>
                          : <><Truck size={14} /> Get Available Couriers</>}
                      </button>
                    </div>
                  )}

                  {/* Step 1: courier selection */}
                  {tpStep === 'courier_select' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-700">Select a Courier</p>
                        <button onClick={() => { setTpStep(null); setTpCouriers([]); setTpSelected(null); }}
                          className="text-[10px] text-gray-400 hover:text-gray-600 underline">
                          ← Change Parcel Info
                        </button>
                      </div>
                      {tpCouriers.length === 0 ? (
                        <div className="text-center py-4 text-xs text-red-600 bg-red-50 rounded-xl border border-red-100">
                          No couriers available for this route. Check TekiPost Logistics Settings.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {tpCouriers.map((c) => (
                            <button key={c.logisticsId || c.courierCode}
                              onClick={() => setTpSelected(c)}
                              className={`w-full p-3 rounded-xl border-2 text-left transition-all ${tpSelected?.logisticsId === c.logisticsId ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200 bg-white'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-xs font-bold text-gray-800">{c.courierName}</p>
                                    {c.isRecommended && (
                                      <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Recommended</span>
                                    )}
                                    {c.isCOD && (
                                      <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">COD</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    {c.serviceType}{c.estimatedDays ? ` · ${c.estimatedDays} day${c.estimatedDays !== 1 ? 's' : ''}` : ''}
                                    {c.pickupDate ? ` · Pickup: ${new Date(c.pickupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold text-indigo-700">₹{Number(c.freightCharge || 0).toLocaleString('en-IN')}</p>
                                  {c.rating && <p className="text-[9px] text-amber-600">★ {c.rating}</p>}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {tpSelected && (
                        <div className="bg-indigo-50 rounded-xl p-3 text-xs border border-indigo-100">
                          <p className="text-indigo-600 font-semibold">Selected: <strong className="text-indigo-900">{tpSelected.courierName}</strong></p>
                          <p className="text-indigo-500 mt-0.5">Freight: ₹{Number(tpSelected.freightCharge || 0).toLocaleString('en-IN')}
                            {tpSelected.estimatedDays ? ` · Est. ${tpSelected.estimatedDays} days` : ''}</p>
                        </div>
                      )}
                      <button onClick={handleTekiPostConfirm}
                        disabled={!tpSelected || tpConfirming}
                        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{ background: '#1B1F3B' }}>
                        {tpConfirming
                          ? <><Loader size={14} className="animate-spin" /> Generating AWB...</>
                          : <><CheckCircle size={14} /> Confirm & Generate AWB</>}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Manual sub-selection */}
              {shippingMethod === 'manual' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'courier',        label: 'Courier',        icon: '📦' },
                      { value: 'local_delivery', label: 'Local Delivery', icon: '🛵' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setManualType(opt.value)}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${manualType === opt.value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <p className="text-base mb-0.5">{opt.icon}</p>
                        <p className={`text-xs font-bold ${manualType === opt.value ? 'text-purple-700' : 'text-gray-600'}`}>{opt.label}</p>
                      </button>
                    ))}
                  </div>

                  {/* Manual Courier Form */}
                  {manualType === 'courier' && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Courier Company *</label>
                        <select className="input text-sm" value={mCourierName} onChange={e => setMCourierName(e.target.value)}>
                          <option value="">Select Courier</option>
                          {shippingConfig.couriers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      {mCourierName === 'Other' && (
                        <input className="input text-sm" placeholder="Courier Name" value={mCourierCustom} onChange={e => setMCourierCustom(e.target.value)} />
                      )}
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Tracking Number</label>
                        <input className="input text-sm font-mono" placeholder="Optional" value={mTracking} onChange={e => setMTracking(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Expected Delivery Date</label>
                        <input type="date" className="input text-sm" value={mETA} onChange={e => setMETA(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Remarks</label>
                        <input className="input text-sm" placeholder="Optional" value={mRemarks} onChange={e => setMRemarks(e.target.value)} />
                      </div>
                      <button onClick={handleManualSave} disabled={saving}
                        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{ background: '#1B1F3B' }}>
                        {saving ? <><Loader size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save Shipment</>}
                      </button>
                    </div>
                  )}

                  {/* Local Delivery Form */}
                  {manualType === 'local_delivery' && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Delivery Partner *</label>
                        <select className="input text-sm" value={mPartner} onChange={e => setMPartner(e.target.value)}>
                          <option value="">Select Partner</option>
                          {shippingConfig.localPartners.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      {mPartner === 'Other' && (
                        <input className="input text-sm" placeholder="Partner Name" value={mPartnerCustom} onChange={e => setMPartnerCustom(e.target.value)} />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Driver Name</label>
                          <input className="input text-sm" placeholder="Optional" value={mDriverName} onChange={e => setMDriverName(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Driver Phone</label>
                          <input className="input text-sm" placeholder="Optional" value={mDriverPhone} onChange={e => setMDriverPhone(e.target.value)} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Vehicle Number</label>
                          <input className="input text-sm" placeholder="Optional" value={mVehicle} onChange={e => setMVehicle(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Expected Time</label>
                          <input className="input text-sm" placeholder="e.g. 3:00 PM" value={mExpectedTime} onChange={e => setMExpectedTime(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Remarks</label>
                        <input className="input text-sm" placeholder="Optional" value={mLocalRemarks} onChange={e => setMLocalRemarks(e.target.value)} />
                      </div>
                      <button onClick={handleManualSave} disabled={saving}
                        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        style={{ background: '#1B1F3B' }}>
                        {saving ? <><Loader size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save Shipment</>}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!shippingMethod && (
                <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
                  Select a shipping method above to create a shipment
                </p>
              )}
            </div>
          )}

          <Divider />

          {/* ── Section 3.5: Delivery OTP ───────────────── */}
          {showOTPPanel && (
            <>
              <SectionHeader icon={ShieldCheck} title="Delivery OTP Verification" />
              <div className="mb-4">
                {otpVerified ? (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle size={18} className="text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-green-800">OTP Verified — Delivery Confirmed</p>
                      <p className="text-xs text-green-600 mt-0.5">Order has been marked as Delivered</p>
                    </div>
                  </div>
                ) : !otpGenerated ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs text-amber-800">Order is out for delivery. Generate a 6-digit OTP and send it to the customer before handing over the package.</p>
                    <button onClick={handleGenerateOTP} disabled={otpLoading}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                      style={{ background: '#D4AF37', color: '#1B1F3B' }}>
                      {otpLoading ? <><Loader size={13} className="animate-spin" /> Sending OTP...</> : <><ShieldCheck size={13} /> Generate & Send Delivery OTP</>}
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-amber-800">OTP sent to customer. Ask the customer for their OTP and enter it below to confirm delivery.</p>
                    <div className="flex gap-2">
                      <input
                        className="input text-center font-mono text-xl tracking-[0.4em] font-bold flex-1"
                        placeholder="000000"
                        maxLength={6}
                        value={otpInput}
                        onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
                      />
                      <button onClick={handleVerifyOTP} disabled={otpLoading || otpInput.length < 6}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
                        style={{ background: '#1B1F3B' }}>
                        {otpLoading ? <Loader size={14} className="animate-spin" /> : 'Verify'}
                      </button>
                    </div>
                    <button onClick={handleResendOTP} disabled={otpLoading}
                      className="w-full text-xs text-amber-700 underline py-1 disabled:opacity-50">
                      {otpLoading ? 'Sending...' : 'Resend new OTP'}
                    </button>
                  </div>
                )}
              </div>
              <Divider />
            </>
          )}

          {/* ── Section 3.6: Invoice ─────────────────────── */}
          {showInvoiceBtn && (
            <>
              <SectionHeader icon={FileText} title="Invoice" />
              <div className="mb-4">
                <button onClick={handleViewInvoice}
                  className="w-full py-2.5 rounded-xl text-sm font-bold border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center gap-2 transition-all">
                  <Download size={13} /> View / Download Invoice
                </button>
              </div>
              <Divider />
            </>
          )}

          {/* ── Section 4: Order Status Timeline ─────────── */}
          <SectionHeader icon={Clock} title="Order Timeline" />
          <div className="space-y-1.5 mb-4">
            {(order.statusTimeline || []).length === 0 ? (
              <p className="text-xs text-gray-400">No timeline entries yet</p>
            ) : (
              [...(order.statusTimeline || [])].reverse().slice(0, 5).map((entry, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: i === 0 ? '#1B1F3B' : '#e5e7eb' }} />
                  <div>
                    <span className="font-semibold text-gray-700">{ORDER_STATUS_META[entry.status]?.label || entry.status}</span>
                    {entry.note && <span className="text-gray-400"> · {entry.note}</span>}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <Divider />

          {/* ── Section 5: Update Order Status ───────────── */}
          {nextStatuses.length > 0 && (
            <div className="mb-4">
              <SectionHeader icon={ChevronRight} title="Update Order Status" />
              <div className="flex flex-wrap gap-1.5 mb-2">
                {nextStatuses.map(s => (
                  <button key={s} onClick={() => setNewOrderStatus(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${newOrderStatus === s ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    → {ORDER_STATUS_META[s]?.label || s}
                  </button>
                ))}
              </div>
              {newOrderStatus === 'cancelled' && (
                <input className="input text-sm mb-2" placeholder="Cancellation reason (optional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
              )}
              {newOrderStatus && (
                <button onClick={handleOrderStatusUpdate} disabled={updatingOrder}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50"
                  style={{ background: '#1B1F3B' }}>
                  {updatingOrder ? 'Updating...' : `Confirm → ${ORDER_STATUS_META[newOrderStatus]?.label || newOrderStatus}`}
                </button>
              )}
            </div>
          )}

          {nextStatuses.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-xl">
              No further order status transitions available
            </p>
          )}

        </div>
      </div>
    </div>
  );
}

function OrdersTab() {
  const [orders,       setOrders]       = useState([]);
  const [stats,        setStats]        = useState({});
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQ,      setSearchQ]      = useState('');
  const [actionOrder,  setActionOrder]  = useState(null);

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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond", serif' }}>Order Management</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders',  value: stats.totalOrders    || 0, color: '#1B1F3B' },
          { label: 'Pending',       value: stats.pendingOrders  || 0, color: '#d97706' },
          { label: 'Delivered',     value: stats.deliveredOrders|| 0, color: '#059669' },
          { label: 'Revenue',       value: `₹${(stats.totalRevenue||0).toLocaleString('en-IN')}`, color: '#D4AF37' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold" style={{ color, fontFamily: '"Cormorant Garamond", serif' }}>{value}</p>
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
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>
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
                  {['Order #', 'Customer', 'Items', 'Amount', 'Status', 'Shipment', 'Date', 'Actions'].map(h => (
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
                        {o.items?.[0]?.name}{o.items?.length > 1 ? ` +${o.items.length - 1}` : ''}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-800" style={{ fontFamily: '"Cormorant Garamond", serif' }}>
                        ₹{o.totalAmount?.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta?.color || 'bg-gray-100 text-gray-500'}`}>
                          {meta?.label || o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {o.shipmentId ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {o.courier || 'Shipped'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Not Created</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setActionOrder(o)}
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

      {/* Full-featured Manage Order Modal */}
      {actionOrder && (
        <ManageOrderModal
          order={actionOrder}
          onClose={() => setActionOrder(null)}
          onRefresh={load}
        />
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
  name: '', category: '', price: '', salePrice: '', stock: '',
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

function ProductForm({ form, setForm, images, setImages, onSubmit, submitLabel, loading, categories = [] }) {
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
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.icon} {c.name}</option>
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

// ── Inventory stock pill ─────────────────────────────────────
function StockPill({ stock }) {
  if (stock === 0)
    return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold bg-red-100 text-red-600 leading-none">OOS</span>;
  if (stock < 10)
    return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-700 leading-none">{stock} ⚠</span>;
  return <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold bg-green-100 text-green-700 leading-none">{stock}</span>;
}

function MarketplaceTab() {
  const [view,          setView]          = useState('products');
  const [products,      setProducts]      = useState([]);
  const [kits,          setKits]          = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [search,        setSearch]        = useState('');
  const [editingProd,   setEditingProd]   = useState(null);
  const [productForm,   setProductForm]   = useState(EMPTY_PRODUCT_FORM);
  const [productImages, setProductImages] = useState([]);

  // ── Category CRUD state ────────────────────────────────────
  const [catLoading,    setCatLoading]    = useState(false);
  const [catSaving,     setCatSaving]     = useState(false);
  const [editingCat,    setEditingCat]    = useState(null);   // null = create mode
  const [catFormOpen,   setCatFormOpen]   = useState(false);
  const [catForm,       setCatForm]       = useState({ name:'', slug:'', description:'', icon:'🛍️', featured:false, displayOrder:0, isActive:true, seoTitle:'', seoDescription:'' });
  const [catImage,      setCatImage]      = useState(null);

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

  const loadCategories = () => {
    setCatLoading(true);
    API.get('/marketplace/admin/categories')
      .then((r) => setCategories(r.data.categories || []))
      .catch(() => {})
      .finally(() => setCatLoading(false));
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      API.get('/marketplace/admin/products'),
      API.get('/marketplace/kits?limit=50'),
      API.get('/poojas/admin-catalog?status=active'),
      API.get('/marketplace/admin/categories'),
    ]).then(([p, k, pj, cats]) => {
      setProducts(p.data.products || []);
      setKits(k.data.kits || []);
      setAvailablePoojas(pj.data.poojas || []);
      setCategories(cats.data.categories || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Category CRUD handlers ────────────────────────────────
  const openCatCreate = () => {
    setEditingCat(null);
    setCatForm({ name:'', slug:'', description:'', icon:'🛍️', featured:false, displayOrder: categories.length, isActive:true, seoTitle:'', seoDescription:'' });
    setCatImage(null);
    setCatFormOpen(true);
  };

  const openCatEdit = (cat) => {
    setEditingCat(cat);
    setCatForm({
      name: cat.name, slug: cat.slug, description: cat.description || '',
      icon: cat.icon || '🛍️', featured: cat.featured || false,
      displayOrder: cat.displayOrder || 0, isActive: cat.isActive !== false,
      seoTitle: cat.seoTitle || '', seoDescription: cat.seoDescription || '',
    });
    setCatImage(null);
    setCatFormOpen(true);
  };

  const handleCatSubmit = async (e) => {
    e.preventDefault();
    setCatSaving(true);
    try {
      const fd = new FormData();
      Object.entries(catForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (catImage) fd.append('image', catImage);
      if (editingCat) {
        await API.patch(`/marketplace/admin/categories/${editingCat._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Category updated');
      } else {
        await API.post('/marketplace/admin/categories', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Category created');
      }
      setCatFormOpen(false);
      loadCategories();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setCatSaving(false); }
  };

  const toggleCatStatus = async (cat) => {
    try {
      await API.patch(`/marketplace/admin/categories/${cat._id}/status`);
      loadCategories();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const deleteCat = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    try {
      await API.delete(`/marketplace/admin/categories/${cat._id}`);
      toast.success('Category deleted');
      loadCategories();
    } catch (err) { toast.error(err.response?.data?.message || 'Cannot delete: products are still assigned to this category'); }
  };

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

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

  const exportProductsCSV = () => {
    const headers = ['Name', 'Category', 'Visibility', 'Price / Variants', 'Stock / Variant Stock', 'Status'];
    const rows = filteredProducts.map((p) => {
      const activeVariants = (p.variants || []).filter(v => v.isActive !== false);
      return [
        p.name || '',
        p.category || '',
        (VISIBILITY_META[p.visibilityType] || VISIBILITY_META.marketplace).label,
        activeVariants.length > 0
          ? activeVariants.map(v => `${v.quantity}: ₹${v.salePrice || v.price}`).join(' | ')
          : p.salePrice ? `₹${p.salePrice}` : `₹${p.price || 0}`,
        activeVariants.length > 0
          ? activeVariants.map(v => `${v.quantity}: ${v.stock}`).join(' | ')
          : (p.totalStock ?? p.stock ?? 0),
        p.isDeleted ? 'Deleted' : p.isActive ? 'Active' : 'Inactive',
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `products_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
        {navBtn('categories', '🏷️ Categories')}
        {navBtn('add-product', '+ Add Product')}
        {navBtn('add-kit', '+ Add Kit')}
      </div>

      {/* ── Products List ── */}
      {view === 'products' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9 text-sm" placeholder="Search by name, category, tag..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button onClick={exportProductsCSV} className="text-xs font-semibold flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              ⬇ Export CSV
            </button>
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
                      <td className="px-4 py-3">
                        {p.variants?.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-semibold border border-indigo-100 whitespace-nowrap">
                            <Package size={9} />
                            {p.variants.filter(v => v.isActive !== false).length} Variant{p.variants.filter(v => v.isActive !== false).length !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="font-bold text-saffron-600 text-xs whitespace-nowrap">
                            {p.salePrice
                              ? <><s className="text-gray-400 font-normal">₹{p.price}</s>{' '}₹{p.salePrice}</>
                              : `₹${p.price || 0}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.variants?.length > 0 ? (
                          <div className="space-y-1 min-w-[120px]">
                            {p.variants.map((v) => (
                              <div key={v.variantId || v.quantity}
                                className={`flex items-center gap-1.5 ${v.isActive === false ? 'opacity-40' : ''}`}>
                                <span className="font-medium text-gray-600 w-9 shrink-0 truncate text-[11px]">{v.quantity}</span>
                                <span className="text-saffron-600 font-semibold text-[11px] shrink-0">
                                  ₹{(v.salePrice || v.price || 0).toLocaleString('en-IN')}
                                </span>
                                <StockPill stock={v.stock ?? 0} />
                              </div>
                            ))}
                            {p.variants.length > 1 && (
                              <div className="text-[10px] text-gray-400 pt-1 mt-0.5 border-t border-gray-100">
                                Total Stock: {p.totalStock ?? p.variants.reduce((s, v) => s + (v.stock || 0), 0)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <StockPill stock={p.totalStock ?? p.stock ?? 0} />
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
            onSubmit={handleCreateProduct} submitLabel="Add Product" loading={saving} categories={categories} />
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
            onSubmit={handleUpdateProduct} submitLabel="Save Changes" loading={saving} categories={categories} />
        </div>
      )}

      {/* ── Categories Management ── */}
      {view === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Category Management</h2>
              <p className="text-xs text-gray-400 mt-0.5">Categories added here appear automatically in the marketplace without code changes.</p>
            </div>
            <button onClick={openCatCreate}
              className="flex items-center gap-2 bg-saffron-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-saffron-600 transition-colors">
              <Plus size={15} /> Add Category
            </button>
          </div>

          {/* Category form modal */}
          {catFormOpen && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 max-w-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">{editingCat ? `Edit: ${editingCat.name}` : 'New Category'}</h3>
                <button onClick={() => setCatFormOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <form onSubmit={handleCatSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Name *</label>
                    <input required className="input" value={catForm.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setCatForm((f) => ({ ...f, name, ...(editingCat ? {} : { slug: autoSlug(name) }) }));
                      }} />
                  </div>
                  <div>
                    <label className="label">Slug * <span className="text-xs text-gray-400">(URL identifier)</span></label>
                    <input required className="input font-mono text-sm" value={catForm.slug}
                      onChange={(e) => setCatForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                      readOnly={!!editingCat} title={editingCat ? 'Slug cannot be changed after creation' : ''} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Icon (emoji)</label>
                    <input className="input text-xl text-center" value={catForm.icon}
                      onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))} maxLength={4} />
                  </div>
                  <div>
                    <label className="label">Display Order</label>
                    <input type="number" min="0" className="input" value={catForm.displayOrder}
                      onChange={(e) => setCatForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))} />
                  </div>
                  <div className="flex flex-col justify-end gap-2 pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={catForm.featured}
                        onChange={(e) => setCatForm((f) => ({ ...f, featured: e.target.checked }))} />
                      <span className="text-sm text-gray-700">Featured</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={catForm.isActive}
                        onChange={(e) => setCatForm((f) => ({ ...f, isActive: e.target.checked }))} />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input h-16 resize-none" value={catForm.description}
                    onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Image (optional)</label>
                  <input type="file" accept="image/*" onChange={(e) => setCatImage(e.target.files[0])} className="text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">SEO Title</label>
                    <input className="input text-sm" value={catForm.seoTitle}
                      onChange={(e) => setCatForm((f) => ({ ...f, seoTitle: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">SEO Description</label>
                    <input className="input text-sm" value={catForm.seoDescription}
                      onChange={(e) => setCatForm((f) => ({ ...f, seoDescription: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={catSaving}
                    className="btn-primary flex items-center gap-2 text-sm">
                    {catSaving ? 'Saving…' : (editingCat ? 'Save Changes' : 'Create Category')}
                  </button>
                  <button type="button" onClick={() => setCatFormOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Categories table */}
          {catLoading ? (
            <div className="space-y-2">{[1,2,3,4].map((i) => <div key={i} className="h-12 bg-white rounded-xl animate-pulse border border-gray-100" />)}</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-xs text-gray-500 border-b">
                  {['Icon','Name','Slug','Products','Order','Featured','Status','Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {categories.map((cat) => (
                    <tr key={cat._id} className={`transition-colors ${cat.isActive ? 'hover:bg-gray-50/50' : 'opacity-60 bg-gray-50/30'}`}>
                      <td className="px-4 py-3 text-xl">{cat.icon}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{cat.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{cat.slug}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(cat.productCount || 0) > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {cat.productCount || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{cat.displayOrder}</td>
                      <td className="px-4 py-3">
                        {cat.featured && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">⭐ Featured</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {cat.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openCatEdit(cat)} title="Edit"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit3 size={13} />
                          </button>
                          <button onClick={() => toggleCatStatus(cat)} title={cat.isActive ? 'Deactivate' : 'Activate'}
                            className={`p-1.5 rounded-lg transition-colors ${cat.isActive ? 'text-gray-400 hover:text-orange-500 hover:bg-orange-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}>
                            {cat.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button onClick={() => deleteCat(cat)} title="Delete"
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {categories.length === 0 && (
                    <tr><td colSpan={8} className="py-12 text-center text-gray-400 text-sm">No categories yet. Click "Add Category" to create one.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
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
                <ZutsavLoaderInline size={14} />
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
  const [userReferrals,   setUserReferrals]   = useState(null);
  const [panditReferrals, setPanditReferrals] = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [view,            setView]            = useState('pandit'); // 'pandit' | 'user'

  useEffect(() => {
    Promise.all([
      API.get('/referral/admin/stats').catch(() => ({ data: { stats: null } })),
      API.get('/referral/analytics').catch(() => ({ data: { analytics: null } })),
    ]).then(([userRes, panditRes]) => {
      setUserReferrals(userRes.data.stats);
      setPanditReferrals(panditRes.data.stats);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const pr = panditReferrals;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">Referral Analytics</h2>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          <button onClick={() => setView('pandit')} className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'pandit' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>🤝 Pandit Referrals</button>
          <button onClick={() => setView('user')}   className={`px-4 py-2 text-sm font-medium transition-colors ${view === 'user'   ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>👥 User Referrals</button>
        </div>
      </div>

      {view === 'pandit' && pr && (
        <>
          {/* Analytics cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Total Referrals Created',  value: pr.totalReferrals    ?? 0,  icon: BookOpen,    bg: 'bg-indigo-50', ic: 'text-indigo-600' },
              { label: 'Resulted in Bookings',     value: pr.bookedReferrals   ?? 0,  icon: CheckCircle, bg: 'bg-teal-50',   ic: 'text-teal-600'   },
              { label: 'Completed Referrals',      value: pr.completedReferrals?? 0,  icon: CheckCircle, bg: 'bg-green-50',  ic: 'text-green-600'  },
              { label: 'Conversion Rate',          value: `${pr.conversionRate ?? 0}%`,icon: Percent,    bg: 'bg-amber-50',  ic: 'text-amber-600'  },
              { label: 'Remark Pending',           value: pr.remarkPending     ?? 0,  icon: BookOpen,    bg: 'bg-red-50',    ic: 'text-red-600'    },
            ].map(({ label, value, icon: Icon, bg, ic }) => (
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

          {/* Top referring pandits */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700">Top Referring Pandits</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {!pr.topReferrers?.length && (
                <p className="text-center py-10 text-gray-400">No pandit referrals yet.</p>
              )}
              {pr.topReferrers?.map((p, i) => (
                <div key={String(p._id)} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{p.panditName || '—'}</p>
                      <p className="text-xs text-gray-400">{p.totalCompleted} completed · {p.totalCreated} created</p>
                    </div>
                  </div>
                  <span className="font-bold text-indigo-600 shrink-0">{p.totalBooked} booked</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === 'user' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-saffron-50 rounded-xl flex items-center justify-center">
                <Users size={22} className="text-saffron-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{userReferrals?.totalReferred ?? 0}</p>
                <p className="text-sm text-gray-500">Total Users Referred</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <Gift size={22} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{userReferrals?.usersWithCode ?? 0}</p>
                <p className="text-sm text-gray-500">Users with Referral Code</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700">Top User Referrers</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {!userReferrals?.topReferrers?.length && <p className="text-center py-10 text-gray-400">No referrals yet.</p>}
              {userReferrals?.topReferrers?.map((u, i) => (
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
        </>
      )}
    </div>
  );
}

// ─── System Settings Tab ──────────────────────────────────────
const SETTING_SECTIONS = [
  { key: 'general',       label: 'General',       icon: Settings },
  { key: 'payment',       label: 'PhonePe',       icon: CreditCard },
  { key: 'payment_rules', label: 'Payment Rules', icon: IndianRupee },
  { key: 'commission',    label: 'Platform Fees', icon: IndianRupee },
  { key: 'whatsapp',      label: 'WhatsApp',      icon: MessageSquare },
  { key: 'email',         label: 'Email',         icon: Mail },
  { key: 'ai',            label: 'AI',            icon: Cpu },
  { key: 'media',         label: 'Media',         icon: Image },
  { key: 'security',      label: 'Security',      icon: Shield },
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
      .then(({ data }) => setForm({
        partialPaymentEnabled:   false,
        partialPaymentMinAmount: 500,
        partialPaymentMode:      'fixed',
        partialPaymentOptions:   [500, 1000, 1500],
        ...(data.settings || {}),
      }))
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
    payment_rules: (() => {
      const ppMode    = form.partialPaymentMode    || 'fixed';
      const ppOptions = Array.isArray(form.partialPaymentOptions) ? form.partialPaymentOptions : [500, 1000, 1500];
      const optionsStr = ppOptions.join(', ');
      return (
        <SectionForm
          title="Payment Rules — Partial Payment"
          onSave={() => save(['partialPaymentEnabled','partialPaymentMinAmount','partialPaymentMode','partialPaymentOptions'])}
          saving={saving}
        >
          <InfoBox>
            Partial payment lets users pay a portion of the booking amount upfront and settle the remaining balance before or on the ceremony day.
            The booking is confirmed immediately upon partial payment.
          </InfoBox>

          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-gray-200 bg-gray-50">
            <div className={`w-12 h-6 rounded-full relative transition-all duration-200 ${form.partialPaymentEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
              onClick={() => setForm(f => ({ ...f, partialPaymentEnabled: !f.partialPaymentEnabled }))}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all duration-200 ${form.partialPaymentEnabled ? 'left-6' : 'left-0.5'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Enable Partial Payment</p>
              <p className="text-xs text-gray-500">Allow users to pay a portion now and remainder later</p>
            </div>
          </label>

          {form.partialPaymentEnabled && (
            <>
              {/* Min amount */}
              <div>
                <label className="label">Minimum Partial Payment Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input type="number" name="partialPaymentMinAmount" min="1" step="1"
                    value={form.partialPaymentMinAmount ?? 500} onChange={set} className="input pl-7" />
                </div>
                <p className="text-xs text-gray-400 mt-1">Users cannot pay less than this amount as a partial payment. Minimum: ₹1</p>
              </div>

              {/* Mode */}
              <div>
                <label className="label">Partial Payment Mode</label>
                <div className="flex gap-3 mt-1">
                  {[
                    { value: 'fixed',      label: '₹ Fixed Amounts', desc: 'e.g. ₹500, ₹1000, ₹1500' },
                    { value: 'percentage', label: '% Percentages',   desc: 'e.g. 25%, 50%, 75%' },
                  ].map(({ value, label, desc }) => (
                    <label key={value}
                      className={`flex-1 flex items-start gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        ppMode === value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-200'
                      }`}
                    >
                      <input type="radio" name="partialPaymentMode" value={value}
                        checked={ppMode === value}
                        onChange={set}
                        className="accent-indigo-600 mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div>
                <label className="label">
                  Predefined Options ({ppMode === 'percentage' ? 'comma-separated percentages, e.g. 25,50,75' : 'comma-separated amounts, e.g. 500,1000,1500'})
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder={ppMode === 'percentage' ? '25,50,75' : '500,1000,1500'}
                  value={optionsStr}
                  onChange={(e) => {
                    const parsed = e.target.value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
                    setForm(f => ({ ...f, partialPaymentOptions: parsed.length > 0 ? parsed : f.partialPaymentOptions }));
                  }}
                />
                <p className="text-xs text-gray-400 mt-1">
                  These become quick-select buttons at checkout. Amounts below the minimum or ≥ grand total are automatically disabled.
                </p>
              </div>

              {/* Preview */}
              <div className="rounded-xl border p-4" style={{ background: '#f8f9fa', borderColor: 'var(--t-border)' }}>
                <p className="text-xs font-semibold text-gray-600 mb-2">Preview (example ₹2000 booking):</p>
                <div className="flex flex-wrap gap-2">
                  {ppOptions.map((opt) => {
                    const resolvedAmt = ppMode === 'percentage' ? Math.round(2000 * opt / 100) : opt;
                    const isValid     = resolvedAmt >= (form.partialPaymentMinAmount ?? 500) && resolvedAmt < 2000;
                    return (
                      <span key={opt} className={`text-xs px-3 py-1.5 rounded-xl font-semibold border-2 ${
                        isValid ? 'border-indigo-400 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-400 line-through'
                      }`}>
                        {ppMode === 'percentage' ? `${opt}% (₹${resolvedAmt})` : `₹${resolvedAmt.toLocaleString('en-IN')}`}
                        {!isValid && ' (disabled)'}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between"><span>Booking Total</span><span>₹2,000</span></div>
                  <div className="flex justify-between text-orange-600 font-semibold"><span>Example: Pay Now</span><span>₹{ppOptions[0] ? (ppMode === 'percentage' ? Math.round(2000 * ppOptions[0] / 100) : ppOptions[0]).toLocaleString('en-IN') : '—'}</span></div>
                  <div className="flex justify-between text-red-500"><span>Remaining Due</span><span>₹{ppOptions[0] ? (2000 - (ppMode === 'percentage' ? Math.round(2000 * ppOptions[0] / 100) : ppOptions[0])).toLocaleString('en-IN') : '—'}</span></div>
                </div>
              </div>
            </>
          )}
        </SectionForm>
      );
    })(),
    commission: (() => {
      const commType   = form.platformCommissionType || 'percent';
      const previewFee = commType === 'fixed'
        ? Math.round(form.platformCommissionFixed || 0)
        : Math.round(1000 * (form.platformCommissionPercent || 0) / 100);
      const previewGst = Math.round((1000 + previewFee) * (form.platformGstPercent || 0) / 100);
      return (
        <SectionForm title="Platform Fees" onSave={() => save(['platformCommissionType','platformCommissionPercent','platformCommissionFixed','platformGstPercent'])} saving={saving}>
          <InfoBox>Commission is added on top of the base pooja price and shown transparently to users at checkout.</InfoBox>

          {/* Commission type toggle */}
          <div>
            <label className="label">Platform Fees Type</label>
            <div className="flex gap-2 mt-1">
              {[
                { value: 'percent', label: '% Percentage', icon: '%' },
                { value: 'fixed',   label: '₹ Fixed Amount', icon: '₹' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set({ target: { name: 'platformCommissionType', value } })}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    commType === value
                      ? 'text-white border-transparent'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={commType === value ? { background: '#1B1F3B' } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Commission value input — changes based on type */}
            <div>
              {commType === 'percent' ? (
                <>
                  <label className="label">Platform Fees (%)</label>
                  <div className="relative">
                    <input type="number" name="platformCommissionPercent" min="0" max="100" step="0.5"
                      value={form.platformCommissionPercent ?? 0} onChange={set} className="input pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                  </div>
                </>
              ) : (
                <>
                  <label className="label">Fixed Platform Amount (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                    <input type="number" name="platformCommissionFixed" min="0" step="1"
                      value={form.platformCommissionFixed ?? 0} onChange={set} className="input pl-7" />
                  </div>
                </>
              )}
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
              <div className="flex justify-between">
                <span>
                  Commission {commType === 'percent'
                    ? `(${form.platformCommissionPercent || 0}%)`
                    : `(₹${form.platformCommissionFixed || 0} fixed)`}
                </span>
                <span>₹{previewFee}</span>
              </div>
              <div className="flex justify-between"><span>GST ({form.platformGstPercent || 0}%)</span><span>₹{previewGst}</span></div>
              <div className="flex justify-between font-bold border-t pt-1 mt-1" style={{ borderColor: 'var(--t-border)' }}>
                <span>Total Charged</span>
                <span style={{ color: '#1B1F3B' }}>₹{1000 + previewFee + previewGst}</span>
              </div>
            </div>
          </div>
        </SectionForm>
      );
    })(),
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

  const exportPayoutsCSV = () => {
    if (view === 'pending') {
      const headers = ['Pandit', 'Bookings Pending', 'Total Amount (₹)'];
      const rows = pendingGroups.map((g) => [
        g.panditName || g.pandit?.name || '',
        g.bookings?.length || 0,
        g.totalAmount || 0,
      ]);
      const csv = [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `pending_payouts_${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['Batch ID', 'Pandit', 'Amount (₹)', 'Method', 'Date', 'Note'];
      const rows = history.map((b) => [
        b._id || '',
        b.panditName || b.pandit?.name || '',
        b.amount || 0,
        b.paymentMethod || '',
        b.paidAt ? new Date(b.paidAt).toLocaleDateString('en-IN') : '',
        b.note || '',
      ]);
      const csv = [headers, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `payout_history_${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  };

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
        <div className="flex items-center gap-2">
          <button onClick={exportPayoutsCSV} className="text-xs font-semibold flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            ⬇ Export CSV
          </button>
          <button onClick={() => view === 'pending' ? loadPending() : loadHistory()}
            className="text-xs text-gray-400 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
            <RotateCcw size={12} /> Refresh
          </button>
        </div>
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
  return <ZutsavLoader />;
}

// ─── Blog Management Tab ──────────────────────────────────────
function BlogManagementTab() {
  const [subTab, setSubTab] = useState('blogs'); // 'blogs' | 'categories' | 'permissions'

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: 'var(--t-border)' }}>
        {[
          { id: 'blogs',       label: 'All Blogs' },
          { id: 'categories',  label: 'Categories' },
          { id: 'permissions', label: 'Permissions' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px"
            style={{
              borderColor:  subTab === t.id ? 'var(--t-primary)' : 'transparent',
              color:        subTab === t.id ? 'var(--t-primary)' : 'var(--t-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'blogs'       && <BlogListSubTab />}
      {subTab === 'categories'  && <BlogCategoriesSubTab />}
      {subTab === 'permissions' && <BlogPermissionsSubTab />}
    </div>
  );
}

// ─── Blog List Sub-tab ────────────────────────────────────────
function BlogListSubTab() {
  const [blogs,    setBlogs]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [role,     setRole]     = useState('');
  const [acting,   setActing]   = useState(null); // blogId being actioned
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (role)   params.set('authorRole', role);
      params.set('limit', '100');
      const { data } = await API.get(`/admin/blogs?${params}`);
      setBlogs(data.blogs || []);
    } catch { toast.error('Failed to load blogs'); }
    finally { setLoading(false); }
  }, [search, status, role]);

  useEffect(() => { load(); }, [load]);

  const action = async (id, endpoint, body = {}) => {
    setActing(id);
    try {
      if (endpoint === 'delete') {
        await API.delete(`/admin/blogs/${id}`);
      } else {
        await API.patch(`/admin/blogs/${id}/${endpoint}`, body);
      }
      toast.success('Done');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Action failed'); }
    finally { setActing(null); }
  };

  const STATUS_BADGE = {
    draft:          { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'Draft'          },
    pending_review: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending Review' },
    published:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Published'      },
    rejected:       { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Rejected'       },
    archived:       { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Archived'       },
    scheduled:      { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Scheduled'      },
  };

  const statusCounts = blogs.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {Object.entries(STATUS_BADGE).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatus(s => s === key ? '' : key)}
            className={`p-3 rounded-xl border text-center transition-all ${status === key ? 'ring-2' : ''}`}
            style={{
              background: 'var(--t-card)',
              borderColor: status === key ? 'var(--t-primary)' : 'var(--t-border)',
              ringColor: 'var(--t-primary)',
            }}
          >
            <div className="text-xl font-bold" style={{ color: 'var(--t-text)' }}>{statusCounts[key] || 0}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--t-muted)' }}>{cfg.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--t-muted)' }} />
          <input
            className="input pl-8 w-full"
            placeholder="Search title or author…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-36" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input w-32" value={role} onChange={e => setRole(e.target.value)}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="pandit">Pandit</option>
          <option value="user">User</option>
        </select>
      </div>

      {/* Table */}
      {loading ? <ZutsavLoaderInline /> : blogs.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--t-muted)' }}>No blogs found.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--t-border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--t-input-bg)', borderBottom: '1px solid var(--t-border)' }}>
              <tr>
                {['Title', 'Author', 'Role', 'Status', 'Views', 'Likes', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--t-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blogs.map((b, i) => {
                const sc = STATUS_BADGE[b.status] || STATUS_BADGE.draft;
                const busy = acting === b._id;
                return (
                  <tr
                    key={b._id}
                    style={{
                      background: i % 2 === 0 ? 'var(--t-card)' : 'var(--t-input-bg)',
                      borderBottom: '1px solid var(--t-border)',
                    }}
                  >
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="font-medium truncate" style={{ color: 'var(--t-text)' }}>{b.title}</div>
                      {b.isFeatured && <span className="text-[10px] text-amber-600 font-semibold">★ Featured</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--t-text)' }}>{b.authorName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                        b.authorRole === 'admin'  ? 'bg-indigo-100 text-indigo-700' :
                        b.authorRole === 'pandit' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{b.authorRole}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${sc.bg} ${sc.text}`}>{sc.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--t-muted)' }}>{b.views || 0}</td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--t-muted)' }}>{b.likesCount || 0}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--t-muted)' }}>
                      {b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* View */}
                        <a
                          href={`/blog/${b.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 text-[11px] rounded-lg font-medium border transition-all"
                          style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}
                        >
                          View
                        </a>
                        {/* Approve */}
                        {b.status === 'pending_review' && (
                          <button
                            disabled={busy}
                            onClick={() => action(b._id, 'approve')}
                            className="px-2 py-1 text-[11px] rounded-lg font-medium bg-green-600 text-white transition-all disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {/* Reject */}
                        {(b.status === 'pending_review' || b.status === 'published') && (
                          <button
                            disabled={busy}
                            onClick={() => { setRejectId(b._id); setRejectNote(''); }}
                            className="px-2 py-1 text-[11px] rounded-lg font-medium bg-red-100 text-red-700 transition-all disabled:opacity-50"
                          >
                            Reject
                          </button>
                        )}
                        {/* Feature toggle */}
                        {b.status === 'published' && (
                          <button
                            disabled={busy}
                            onClick={() => action(b._id, 'feature')}
                            className={`px-2 py-1 text-[11px] rounded-lg font-medium transition-all disabled:opacity-50 ${b.isFeatured ? 'bg-amber-200 text-amber-800' : 'bg-amber-50 text-amber-600'}`}
                          >
                            {b.isFeatured ? 'Unfeature' : 'Feature'}
                          </button>
                        )}
                        {/* Archive */}
                        {b.status !== 'archived' && (
                          <button
                            disabled={busy}
                            onClick={() => action(b._id, 'archive')}
                            className="px-2 py-1 text-[11px] rounded-lg font-medium bg-slate-100 text-slate-600 transition-all disabled:opacity-50"
                          >
                            Archive
                          </button>
                        )}
                        {/* Delete */}
                        <button
                          disabled={busy}
                          onClick={() => { if (window.confirm('Delete this blog permanently?')) action(b._id, 'delete'); }}
                          className="px-2 py-1 text-[11px] rounded-lg font-medium bg-red-600 text-white transition-all disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
            <h3 className="font-bold text-lg" style={{ color: 'var(--t-text)' }}>Reject Blog</h3>
            <textarea
              className="input w-full h-28 resize-none"
              placeholder="Reason for rejection (optional, shown to author)…"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRejectId(null)} className="px-4 py-2 text-sm rounded-xl border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Cancel</button>
              <button
                onClick={() => { action(rejectId, 'reject', { note: rejectNote }); setRejectId(null); }}
                className="px-4 py-2 text-sm rounded-xl font-semibold bg-red-600 text-white"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Blog Categories Sub-tab ──────────────────────────────────
function BlogCategoriesSubTab() {
  const [cats,    setCats]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} | existing cat
  const [saving,  setSaving]  = useState(false);
  const empty = { name: '', slug: '', description: '', icon: '', color: '#1B1F3B', isActive: true, order: 0 };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/blog-categories');
      setCats(data.categories || []);
    } catch { toast.error('Failed to load categories'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      if (editing._id) {
        await API.patch(`/admin/blog-categories/${editing._id}`, editing);
        toast.success('Category updated');
      } else {
        await API.post('/admin/blog-categories', editing);
        toast.success('Category created');
      }
      setEditing(null);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this category? Blogs in it will become uncategorized.')) return;
    try {
      await API.delete(`/admin/blog-categories/${id}`);
      toast.success('Deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg" style={{ color: 'var(--t-text)' }}>Blog Categories</h3>
        <button
          onClick={() => setEditing({ ...empty })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--t-primary)' }}
        >
          <Plus size={15} /> Add Category
        </button>
      </div>

      {loading ? <ZutsavLoaderInline /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cats.map(c => (
            <div key={c._id} className="p-4 rounded-2xl border flex flex-col gap-2" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: c.color + '22' }}>
                  {c.icon || '📝'}
                </div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--t-text)' }}>{c.name}</div>
                  <div className="text-xs" style={{ color: 'var(--t-muted)' }}>{c.slug}</div>
                </div>
                <div className="ml-auto flex gap-1.5">
                  {!c.isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                  <button onClick={() => setEditing({ ...c })} className="p-1.5 rounded-lg" style={{ color: 'var(--t-muted)' }}>
                    <Edit3 size={13} />
                  </button>
                  <button onClick={() => del(c._id)} className="p-1.5 rounded-lg text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {c.description && <p className="text-xs" style={{ color: 'var(--t-muted)' }}>{c.description}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
            <h3 className="font-bold text-lg" style={{ color: 'var(--t-text)' }}>
              {editing._id ? 'Edit Category' : 'New Category'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="label">Name *</label>
                <input className="input w-full" value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Icon (emoji)</label>
                <input className="input w-full" value={editing.icon} placeholder="📝" onChange={e => setEditing(v => ({ ...v, icon: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="label">Color</label>
                  <input type="color" className="input w-full h-10 cursor-pointer p-1" value={editing.color || '#1B1F3B'} onChange={e => setEditing(v => ({ ...v, color: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="label">Order</label>
                  <input type="number" className="input w-full" value={editing.order} min={0} onChange={e => setEditing(v => ({ ...v, order: +e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input w-full" value={editing.description} onChange={e => setEditing(v => ({ ...v, description: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.isActive} onChange={e => setEditing(v => ({ ...v, isActive: e.target.checked }))} />
                <span className="text-sm" style={{ color: 'var(--t-text)' }}>Active</span>
              </label>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-xl border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Cancel</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--t-primary)' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Blog Permissions Sub-tab ─────────────────────────────────
function BlogPermissionsSubTab() {
  const [perms,   setPerms]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/blog-permissions');
      setPerms(data.permissions);
    } catch { toast.error('Failed to load permissions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await API.patch('/admin/blog-permissions', perms);
      toast.success('Blog permissions saved');
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const toggle = (key) => setPerms(p => ({ ...p, [key]: !p[key] }));

  if (loading) return <ZutsavLoaderInline />;
  if (!perms)  return null;

  const roles = [
    {
      key:         'Admin',
      publishKey:  'blogAdminPublish',
      approvalKey: null,
      label:       'Admin',
      desc:        'Admins can always publish directly with no review step.',
      color:       '#1B1F3B',
    },
    {
      key:         'Pandit',
      publishKey:  'blogPanditPublish',
      approvalKey: 'blogPanditRequireApproval',
      label:       'Pandit',
      desc:        'Allow verified pandits to write and publish spiritual content.',
      color:       '#D4AF37',
    },
    {
      key:         'User',
      publishKey:  'blogUserPublish',
      approvalKey: 'blogUserRequireApproval',
      label:       'User',
      desc:        'Allow registered devotees to submit articles for review.',
      color:       '#6366f1',
    },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm mb-6" style={{ color: 'var(--t-muted)' }}>
        Control who can publish blogs. Disabling a role blocks both the UI and the API endpoints (403 returned regardless of frontend state).
      </p>

      {roles.map(r => (
        <div key={r.key} className="p-5 rounded-2xl border" style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
          <div className="flex items-start gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ background: r.color }}
            >
              {r.label[0]}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1" style={{ color: 'var(--t-text)' }}>{r.label}</div>
              <div className="text-xs mb-3" style={{ color: 'var(--t-muted)' }}>{r.desc}</div>
              <div className="flex flex-col gap-2.5">
                {/* Publish toggle */}
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="text-sm" style={{ color: 'var(--t-text)' }}>Can publish blogs</span>
                  <button
                    onClick={() => toggle(r.publishKey)}
                    className="relative w-11 h-6 rounded-full transition-all duration-200 shrink-0"
                    style={{ background: perms[r.publishKey] ? 'var(--t-primary)' : 'var(--t-border)' }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                      style={{ transform: perms[r.publishKey] ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </button>
                </label>
                {/* Approval toggle (not for admin) */}
                {r.approvalKey && (
                  <label className={`flex items-center justify-between gap-4 cursor-pointer ${!perms[r.publishKey] ? 'opacity-40 pointer-events-none' : ''}`}>
                    <span className="text-sm" style={{ color: 'var(--t-text)' }}>Require admin approval before publish</span>
                    <button
                      onClick={() => toggle(r.approvalKey)}
                      className="relative w-11 h-6 rounded-full transition-all duration-200 shrink-0"
                      style={{ background: perms[r.approvalKey] ? 'var(--t-primary)' : 'var(--t-border)' }}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
                        style={{ transform: perms[r.approvalKey] ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </button>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
          style={{ background: 'var(--t-primary)' }}
        >
          {saving ? 'Saving…' : 'Save Permissions'}
        </button>
      </div>
    </div>
  );
}

// ─── Invoices Tab ─────────────────────────────────────────────
const INR_FMT = (n) =>
  `₹${(+(n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

function InvoicesTab() {
  const [invoices, setInvoices]     = useState([]);
  const [total,    setTotal]        = useState(0);
  const [pages,    setPages]        = useState(1);
  const [page,     setPage]         = useState(1);
  const [stats,    setStats]        = useState([]);
  const [monthRev, setMonthRev]     = useState(0);
  const [loading,  setLoading]      = useState(true);
  const [search,   setSearch]       = useState('');
  const [status,   setStatus]       = useState('');
  const [payType,  setPayType]      = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo,   setDateTo]       = useState('');
  const [cancelModal, setCancelModal] = useState(null); // invoice object
  const [cancelReason, setCancelReason] = useState('');
  const [actioning, setActioning]   = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, limit: 50 };
      if (search)   params.search      = search;
      if (status)   params.status      = status;
      if (payType)  params.paymentType = payType;
      if (dateFrom) params.dateFrom    = dateFrom;
      if (dateTo)   params.dateTo      = dateTo;

      const { data } = await API.get('/admin/invoices', { params });
      setInvoices(data.invoices || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setPage(p);
      setStats(data.stats || []);
      setMonthRev(data.monthRevenue || 0);
    } catch { toast.error('Failed to load invoices'); }
    finally  { setLoading(false); }
  }, [search, status, payType, dateFrom, dateTo]);

  useEffect(() => { load(1); }, [load]);

  const exportCSV = async () => {
    try {
      const params = {};
      if (status)   params.status      = status;
      if (payType)  params.paymentType = payType;
      if (dateFrom) params.dateFrom    = dateFrom;
      if (dateTo)   params.dateTo      = dateTo;
      const { data } = await API.get('/admin/invoices/export', { params, responseType: 'blob' });
      const url  = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url; link.download = `zutsav_invoices_${Date.now()}.csv`;
      link.click(); URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
  };

  const cancelInvoice = async () => {
    if (!cancelModal) return;
    setActioning(true);
    try {
      await API.patch(`/admin/invoices/${cancelModal._id}/cancel`, { reason: cancelReason });
      toast.success('Invoice cancelled');
      setCancelModal(null); setCancelReason('');
      load(page);
    } catch { toast.error('Failed to cancel invoice'); }
    finally { setActioning(false); }
  };

  const archiveInvoice = async (inv) => {
    try {
      await API.patch(`/admin/invoices/${inv._id}/archive`);
      toast.success('Invoice archived');
      load(page);
    } catch { toast.error('Failed to archive invoice'); }
  };

  // Aggregate stats
  const activeStats  = stats.find(s => s._id === 'active');
  const totalRevenue = activeStats?.totalAmount || 0;
  const totalCount   = activeStats?.count || 0;

  const STAT_CARDS = [
    { label: 'Total Revenue',    value: INR_FMT(totalRevenue), icon: IndianRupee, bg:'#f0fdf4', border:'#bbf7d0', color:'#15803d' },
    { label: 'This Month',       value: INR_FMT(monthRev),     icon: Clock,       bg:'#f0f4ff', border:'#c7d2fe', color:'#4338ca' },
    { label: 'Total Invoices',   value: totalCount,            icon: Receipt,     bg:'#fff7ed', border:'#fed7aa', color:'#c2410c' },
    { label: 'Active Invoices',  value: total,                 icon: CheckCircle, bg:'#f8f9ff', border:'#e0e7ff', color:'#1B1F3B' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color:'var(--t-text)' }}>Invoice Register</h2>
          <p className="text-sm mt-0.5" style={{ color:'var(--t-muted)' }}>
            Immutable accounting records — {total} result{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background:'var(--t-primary)' }}
        >
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {STAT_CARDS.map(c => (
          <div key={c.label} className="rounded-2xl p-4 border"
            style={{ background:c.bg, borderColor:c.border }}>
            <div className="flex items-center gap-2 mb-2">
              <c.icon size={16} style={{ color:c.color }} />
              <span className="text-xs font-semibold uppercase tracking-wider"
                style={{ color:c.color }}>{c.label}</span>
            </div>
            <div className="text-xl font-black" style={{ color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border p-4 mb-5 flex flex-wrap gap-3"
        style={{ background:'var(--t-card)', borderColor:'var(--t-border)' }}>
        <input
          type="text" placeholder="Search invoice#, order#, name, phone, txn…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl text-sm border"
          style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-text)' }}
        />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm border"
          style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-text)' }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
        <select value={payType} onChange={e => setPayType(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm border"
          style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-text)' }}>
          <option value="">All Types</option>
          <option value="FULL">Full</option>
          <option value="PARTIAL">Advance</option>
          <option value="REMAINING">Final</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm border"
          style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-text)' }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm border"
          style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-text)' }} />
        <button onClick={() => load(1)}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background:'var(--t-primary)' }}>
          <Search size={14} />
        </button>
        <button onClick={() => { setSearch(''); setStatus(''); setPayType(''); setDateFrom(''); setDateTo(''); }}
          className="px-3 py-2 rounded-xl text-sm border"
          style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-muted)' }}>
          Clear
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><ZutsavLoaderInline size={40} /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color:'var(--t-muted)' }}>
          No invoices found matching your filters.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden"
          style={{ background:'var(--t-card)', borderColor:'var(--t-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background:'var(--t-primary)', color:'white' }}>
                  {['Invoice #','Order #','Customer','Type','Date','Amount Paid','Status',''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={inv._id}
                    style={{ background: idx % 2 === 0 ? 'var(--t-card)' : 'var(--t-bg)',
                      borderBottom:'1px solid var(--t-border)' }}>
                    <td className="px-4 py-3 font-mono font-semibold text-xs"
                      style={{ color:'var(--t-primary)' }}>{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-xs font-mono"
                      style={{ color:'var(--t-muted)' }}>{inv.bookingNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm" style={{ color:'var(--t-text)' }}>{inv.customerName}</div>
                      <div className="text-xs" style={{ color:'var(--t-muted)' }}>{inv.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: inv.paymentType === 'PARTIAL' ? '#fef3c7' : inv.paymentType === 'REMAINING' ? '#f0fdf4' : '#f0f4ff',
                          color:      inv.paymentType === 'PARTIAL' ? '#b45309' : inv.paymentType === 'REMAINING' ? '#15803d' : '#4338ca',
                        }}>
                        { inv.paymentType === 'PARTIAL' ? 'Advance' : inv.paymentType === 'REMAINING' ? 'Final' : 'Full' }
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color:'var(--t-muted)' }}>
                      {fmtDate(inv.invoiceDate)}
                    </td>
                    <td className="px-4 py-3 font-bold text-sm" style={{ color:'#15803d' }}>
                      {INR_FMT(inv.amountPaid)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{
                          background: inv.status === 'active' ? '#dcfce7' : inv.status === 'cancelled' ? '#fee2e2' : '#f3f4f6',
                          color:      inv.status === 'active' ? '#15803d' : inv.status === 'cancelled' ? '#b91c1c' : '#374151',
                        }}>
                        {inv.status.toUpperCase()}
                        {inv.isLegacy && ' · Legacy'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <a href={`/invoice/view/${inv.invoiceNumber}`} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-lg border transition-colors"
                          style={{ borderColor:'var(--t-border)', color:'var(--t-muted)' }}
                          title="View Invoice">
                          <Eye size={14} />
                        </a>
                        {inv.status === 'active' && (
                          <>
                            <button
                              onClick={() => { setCancelModal(inv); setCancelReason(''); }}
                              className="p-1.5 rounded-lg border transition-colors"
                              style={{ borderColor:'#fca5a5', color:'#b91c1c' }}
                              title="Cancel Invoice">
                              <Ban size={14} />
                            </button>
                            <button
                              onClick={() => archiveInvoice(inv)}
                              className="p-1.5 rounded-lg border transition-colors"
                              style={{ borderColor:'var(--t-border)', color:'var(--t-muted)' }}
                              title="Archive Invoice">
                              <Archive size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t"
              style={{ borderColor:'var(--t-border)' }}>
              <span className="text-xs" style={{ color:'var(--t-muted)' }}>
                Page {page} of {pages} · {total} invoices
              </span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => load(page - 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40"
                  style={{ borderColor:'var(--t-border)', color:'var(--t-text)' }}>
                  Prev
                </button>
                <button disabled={page >= pages} onClick={() => load(page + 1)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40"
                  style={{ borderColor:'var(--t-border)', color:'var(--t-text)' }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background:'rgba(0,0,0,0.5)' }}>
          <div className="rounded-2xl p-6 max-w-md w-full shadow-2xl"
            style={{ background:'var(--t-card)' }}>
            <h3 className="text-lg font-bold mb-1" style={{ color:'var(--t-text)' }}>
              Cancel Invoice
            </h3>
            <p className="text-sm mb-4" style={{ color:'var(--t-muted)' }}>
              {cancelModal.invoiceNumber} · {cancelModal.customerName}
            </p>
            <p className="text-xs mb-3 p-3 rounded-xl"
              style={{ background:'#fef2f2', color:'#b91c1c' }}>
              Invoices are never deleted — this marks the invoice as cancelled in the audit trail.
            </p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (required)…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm border mb-4"
              style={{ background:'var(--t-bg)', borderColor:'var(--t-border)', color:'var(--t-text)', resize:'none' }}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCancelModal(null)}
                className="px-4 py-2 rounded-xl text-sm border font-semibold"
                style={{ borderColor:'var(--t-border)', color:'var(--t-muted)' }}>
                Back
              </button>
              <button onClick={cancelInvoice} disabled={actioning || !cancelReason.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background:'#b91c1c' }}>
                {actioning ? 'Cancelling…' : 'Cancel Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notification Engine Management Tab ──────────────────────────────────────

const CHANNEL_LABELS = { whatsapp: 'WhatsApp', email: 'Email', inapp: 'In-App' };
const RECIPIENT_LABELS = { user: 'Customer', pandit: 'Pandit', admin: 'Admin', referral_pandit: 'Referral Pandit' };
const CHANNEL_COLORS = {
  whatsapp: { bg: '#dcfce7', text: '#166534' },
  email:    { bg: '#dbeafe', text: '#1e40af' },
  inapp:    { bg: '#ede9fe', text: '#6d28d9' },
};
const LOG_STATUS_COLORS = {
  sent: '#166534', delivered: '#059669', failed: '#dc2626', pending: '#b45309', skipped: '#6b7280',
};

function NotificationsTab() {
  const [view, setView] = useState('mappings');
  const [events, setEvents] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsMeta, setLogsMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [waTemplates, setWaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [logFilterEvent, setLogFilterEvent] = useState('');
  const [logFilterStatus, setLogFilterStatus] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [testModal, setTestModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (view === 'logs') loadLogs(); }, [view, logPage, logFilterEvent, logFilterStatus]);

  async function loadData() {
    setLoading(true);
    try {
      const [evRes, mapRes, tmplRes] = await Promise.all([
        API.get('/admin/notifications/events'),
        API.get('/admin/notifications/mappings'),
        API.get('/admin/notifications/whatsapp-templates'),
      ]);
      setEvents(evRes.data.events || []);
      setMappings(mapRes.data.mappings || []);
      setWaTemplates(tmplRes.data.templates || []);
    } catch { toast.error('Failed to load notification data'); }
    setLoading(false);
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const params = { page: logPage, limit: 20 };
      if (logFilterEvent)  params.event  = logFilterEvent;
      if (logFilterStatus) params.status = logFilterStatus;
      const res = await API.get('/admin/notifications/logs', { params });
      setLogs(res.data.logs || []);
      setLogsMeta(res.data.meta || { total: 0, page: 1, pages: 1 });
    } catch { toast.error('Failed to load logs'); }
    setLogsLoading(false);
  }

  async function saveMapping(form) {
    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await API.post('/admin/notifications/mappings', form);
        toast.success('Mapping created');
      } else {
        await API.patch(`/admin/notifications/mappings/${modal.mapping._id}`, form);
        toast.success('Mapping updated');
      }
      setModal(null);
      await loadData();
    } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
    setSaving(false);
  }

  async function toggleMapping(id, enabled) {
    try {
      await API.patch(`/admin/notifications/mappings/${id}/toggle`, { enabled: !enabled });
      setMappings(m => m.map(x => x._id === id ? { ...x, enabled: !enabled } : x));
    } catch { toast.error('Toggle failed'); }
  }

  async function deleteMapping(id) {
    if (!window.confirm('Delete this mapping?')) return;
    try {
      await API.delete(`/admin/notifications/mappings/${id}`);
      setMappings(m => m.filter(x => x._id !== id));
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  }

  async function testMapping(form) {
    setTesting(true);
    try {
      await API.post('/admin/notifications/test', form);
      toast.success('Test notification sent — check the log');
    } catch (e) { toast.error(e.response?.data?.message || 'Test failed'); }
    setTesting(false);
  }

  const categories = [...new Set(events.map(e => e.category))].sort();
  const filteredEvents = events.filter(e =>
    (!filterEvent || (e.name || '').toLowerCase().includes(filterEvent.toLowerCase()) || (e.label || '').toLowerCase().includes(filterEvent.toLowerCase())) &&
    (!filterCategory || e.category === filterCategory)
  );
  const groupedByCategory = categories.reduce((acc, cat) => {
    acc[cat] = filteredEvents.filter(e => e.category === cat);
    return acc;
  }, {});
  const getMappingsForEvent = (eventName) => mappings.filter(m => m.eventName === eventName);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader className="animate-spin w-8 h-8" style={{ color: 'var(--t-primary)' }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--t-text)' }}>Notification Engine</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--t-muted)' }}>
            Configure channels per event. Changes take effect immediately — no deploy needed.
          </p>
        </div>
        <div className="flex gap-2">
          {[{ key: 'mappings', label: 'Mappings', Icon: Zap }, { key: 'logs', label: 'Logs', Icon: Activity }].map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setView(key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${view === key ? 'text-white' : 'border'}`}
              style={view === key ? { background: 'var(--t-primary)' } : { borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
              <Icon className="w-4 h-4 inline mr-1" />{label}
            </button>
          ))}
          <button onClick={loadData} className="px-3 py-2 rounded-xl border text-sm"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Events',      value: events.length,                           color: '#1B1F3B', Icon: Zap    },
          { label: 'Active Mappings',   value: mappings.filter(m => m.enabled).length,  color: '#059669', Icon: Bell   },
          { label: 'Disabled Mappings', value: mappings.filter(m => !m.enabled).length, color: '#dc2626', Icon: BellOff},
          { label: 'Total Mappings',    value: mappings.length,                          color: '#7c3aed', Icon: Settings },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="rounded-2xl border p-4"
            style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2" style={{ background: color + '15' }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: 'var(--t-text)' }}>{value}</div>
                <div className="text-xs" style={{ color: 'var(--t-muted)' }}>{label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {view === 'mappings' ? (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--t-muted)' }} />
              <input placeholder="Search events…" value={filterEvent} onChange={e => setFilterEvent(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-xl border text-sm w-56"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border text-sm"
              style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {categories.filter(cat => groupedByCategory[cat]?.length > 0).map(cat => (
              <div key={cat} className="rounded-2xl border overflow-hidden"
                style={{ background: 'var(--t-card)', borderColor: 'var(--t-border)' }}>
                <button onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-80 transition-opacity">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm" style={{ color: 'var(--t-text)' }}>{cat}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: 'var(--t-primary)15', color: 'var(--t-primary)' }}>
                      {groupedByCategory[cat].length} events
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>
                      {groupedByCategory[cat].reduce((n, e) => n + getMappingsForEvent(e.name).filter(m => m.enabled).length, 0)} active
                    </span>
                  </div>
                  {expandedCategory === cat
                    ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--t-muted)' }} />
                    : <ChevronDown className="w-4 h-4" style={{ color: 'var(--t-muted)' }} />}
                </button>
                {expandedCategory === cat && (
                  <div className="divide-y" style={{ borderColor: 'var(--t-border)' }}>
                    {groupedByCategory[cat].map(event => (
                      <NotifEventRow key={event.name} event={event}
                        mappings={getMappingsForEvent(event.name)}
                        onAdd={() => setModal({ mode: 'create', mapping: { eventName: event.name, channel: 'whatsapp', recipientType: 'user', enabled: true, priority: 0 } })}
                        onEdit={m => setModal({ mode: 'edit', mapping: m })}
                        onToggle={m => toggleMapping(m._id, m.enabled)}
                        onDelete={m => deleteMapping(m._id)}
                        onTest={m => setTestModal(m)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <select value={logFilterEvent} onChange={e => { setLogFilterEvent(e.target.value); setLogPage(1); }}
              className="px-3 py-2 rounded-xl border text-sm"
              style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
              <option value="">All Events</option>
              {events.map(e => <option key={e.name} value={e.name}>{e.label}</option>)}
            </select>
            <select value={logFilterStatus} onChange={e => { setLogFilterStatus(e.target.value); setLogPage(1); }}
              className="px-3 py-2 rounded-xl border text-sm"
              style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
              <option value="">All Statuses</option>
              {['sent', 'delivered', 'failed', 'pending', 'skipped'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {logsLoading ? (
            <div className="flex justify-center py-12">
              <Loader className="animate-spin w-6 h-6" style={{ color: 'var(--t-primary)' }} />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border" style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No logs found</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--t-bg)', color: 'var(--t-muted)', borderBottom: '1px solid var(--t-border)' }}>
                      {['Event', 'Channel', 'Recipient', 'Template', 'Status', 'Retries', 'Time'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log._id} className="border-t hover:bg-black/5 transition-colors"
                        style={{ borderColor: 'var(--t-border)', background: 'var(--t-card)' }}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--t-bg)', color: 'var(--t-muted)' }}>
                            {log.event || log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: (CHANNEL_COLORS[log.type] || CHANNEL_COLORS.inapp).bg, color: (CHANNEL_COLORS[log.type] || CHANNEL_COLORS.inapp).text }}>
                            {CHANNEL_LABELS[log.type] || log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--t-muted)' }}>
                          {log.recipientName || log.recipientEmail || log.recipientPhone || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--t-muted)' }}>
                          {log.templateName || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold" style={{ color: LOG_STATUS_COLORS[log.status] || '#6b7280' }}>
                            {log.status}
                          </span>
                          {log.error && (
                            <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: '#dc2626' }} title={log.error}>
                              {log.error}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-center" style={{ color: 'var(--t-muted)' }}>{log.retryCount || 0}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--t-muted)' }}>
                          {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {logsMeta.pages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--t-muted)' }}>
                    {logsMeta.total} logs · Page {logsMeta.page} of {logsMeta.pages}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1}
                      className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
                      style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Prev</button>
                    <button onClick={() => setLogPage(p => Math.min(logsMeta.pages, p + 1))} disabled={logPage === logsMeta.pages}
                      className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
                      style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {modal && (
        <NotifMappingModal mode={modal.mode} initial={modal.mapping} waTemplates={waTemplates}
          onSave={saveMapping} onClose={() => setModal(null)} saving={saving} />
      )}
      {testModal && (
        <NotifTestModal mapping={testModal} onTest={testMapping} onClose={() => setTestModal(null)} testing={testing} />
      )}
    </div>
  );
}

function NotifEventRow({ event, mappings, onAdd, onEdit, onToggle, onDelete, onTest }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <span className="font-medium text-sm" style={{ color: 'var(--t-text)' }}>{event.label}</span>
          <code className="text-xs mt-0.5 block" style={{ color: 'var(--t-muted)' }}>{event.name}</code>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0"
          style={{ background: 'var(--t-primary)' }}>
          <Plus className="w-3 h-3" />Add
        </button>
      </div>
      {mappings.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--t-muted)' }}>No mappings — this event fires silently.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map(m => (
            <div key={m._id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--t-bg)', opacity: m.enabled ? 1 : 0.55 }}>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: (CHANNEL_COLORS[m.channel] || CHANNEL_COLORS.inapp).bg, color: (CHANNEL_COLORS[m.channel] || CHANNEL_COLORS.inapp).text }}>
                {CHANNEL_LABELS[m.channel] || m.channel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>
                {RECIPIENT_LABELS[m.recipientType] || m.recipientType}
              </span>
              {(m.whatsappTemplateName || m.emailTemplateName) && (
                <span className="text-xs font-mono" style={{ color: 'var(--t-muted)' }}>
                  {m.whatsappTemplateName || m.emailTemplateName}
                </span>
              )}
              {m.label && <span className="text-xs" style={{ color: 'var(--t-muted)' }}>{m.label}</span>}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => onTest(m)} title="Test send" className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  <Send className="w-3.5 h-3.5" style={{ color: '#7c3aed' }} />
                </button>
                <button onClick={() => onEdit(m)} title="Edit" className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--t-muted)' }} />
                </button>
                <button onClick={() => onToggle(m)} title={m.enabled ? 'Disable' : 'Enable'}
                  className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                  {m.enabled
                    ? <ToggleRight className="w-4 h-4" style={{ color: '#059669' }} />
                    : <ToggleLeft  className="w-4 h-4" style={{ color: '#6b7280' }} />}
                </button>
                <button onClick={() => onDelete(m)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NotifMappingModal({ mode, initial, waTemplates, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    eventName:            initial.eventName            || '',
    recipientType:        initial.recipientType        || 'user',
    channel:              initial.channel              || 'whatsapp',
    whatsappTemplateName: initial.whatsappTemplateName || '',
    whatsappLanguage:     initial.whatsappLanguage     || 'en',
    whatsappVariables:    initial.whatsappVariables    || [],
    emailTemplateName:    initial.emailTemplateName    || '',
    emailSubject:         initial.emailSubject         || '',
    emailHtml:            initial.emailHtml            || '',
    inAppType:            initial.inAppType            || '',
    inAppTitle:           initial.inAppTitle           || '',
    inAppMessage:         initial.inAppMessage         || '',
    enabled:              initial.enabled !== false,
    priority:             initial.priority             || 0,
    label:                initial.label               || '',
  });
  const [varInput, setVarInput] = useState({ position: '', payloadPath: '', label: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addVar = () => {
    if (!varInput.position || !varInput.payloadPath) return;
    set('whatsappVariables', [...form.whatsappVariables, { ...varInput, position: Number(varInput.position) }]);
    setVarInput({ position: '', payloadPath: '', label: '' });
  };
  const removeVar = (i) => set('whatsappVariables', form.whatsappVariables.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ background: 'var(--t-card)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="font-bold text-lg" style={{ color: 'var(--t-text)' }}>
            {mode === 'create' ? 'Add Notification Mapping' : 'Edit Mapping'}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--t-muted)' }} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Event</label>
              <input value={form.eventName} readOnly
                className="w-full px-3 py-2 rounded-xl border text-sm font-mono cursor-default opacity-70"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Label</label>
              <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. WhatsApp to customer"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Channel</label>
              <select value={form.channel} onChange={e => set('channel', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="inapp">In-App</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Recipient</label>
              <select value={form.recipientType} onChange={e => set('recipientType', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
                <option value="user">Customer</option>
                <option value="pandit">Pandit</option>
                <option value="admin">Admin</option>
                <option value="referral_pandit">Referral Pandit</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Priority</label>
              <input type="number" value={form.priority} onChange={e => set('priority', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
          </div>

          {form.channel === 'whatsapp' && (
            <div className="space-y-3 rounded-xl p-4 border" style={{ borderColor: '#bbf7d0', background: '#dcfce715' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#166534' }}>WhatsApp Config</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Template (Meta-synced)</label>
                  <select value={form.whatsappTemplateName} onChange={e => set('whatsappTemplateName', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border text-sm"
                    style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}>
                    <option value="">— select template —</option>
                    {waTemplates.map(t => (
                      <option key={t.name} value={t.name}>{t.name} ({t.language || 'en'})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Language</label>
                  <input value={form.whatsappLanguage} onChange={e => set('whatsappLanguage', e.target.value)} placeholder="en"
                    className="w-full px-3 py-2 rounded-xl border text-sm"
                    style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-2" style={{ color: 'var(--t-muted)' }}>Body Variables (positional)</label>
                {form.whatsappVariables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)', minWidth: 28 }}>
                      #{v.position}
                    </span>
                    <span className="text-xs font-mono flex-1" style={{ color: 'var(--t-text)' }}>{v.payloadPath}</span>
                    {v.label && <span className="text-xs" style={{ color: 'var(--t-muted)' }}>{v.label}</span>}
                    <button onClick={() => removeVar(i)} className="p-1 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input type="number" placeholder="#" value={varInput.position}
                    onChange={e => setVarInput(v => ({ ...v, position: e.target.value }))}
                    className="w-16 px-2 py-1.5 rounded-lg border text-xs"
                    style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
                  <input placeholder="payload.path (e.g. user.name)" value={varInput.payloadPath}
                    onChange={e => setVarInput(v => ({ ...v, payloadPath: e.target.value }))}
                    className="flex-1 px-2 py-1.5 rounded-lg border text-xs font-mono"
                    style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
                  <input placeholder="label" value={varInput.label}
                    onChange={e => setVarInput(v => ({ ...v, label: e.target.value }))}
                    className="w-24 px-2 py-1.5 rounded-lg border text-xs"
                    style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
                  <button onClick={addVar} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#166534' }}>
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--t-muted)' }}>
                  Paths: user.name · user.phone · booking.bookingNumber · booking.poojaName · order.orderNumber · otp
                </p>
              </div>
            </div>
          )}

          {form.channel === 'email' && (
            <div className="space-y-3 rounded-xl p-4 border" style={{ borderColor: '#bfdbfe', background: '#dbeafe15' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#1e40af' }}>Email Config</h4>
              <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
                Leave subject & HTML blank to use the built-in template for this event.
              </p>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Subject</label>
                <input value={form.emailSubject} onChange={e => set('emailSubject', e.target.value)}
                  placeholder="Leave blank to use legacy template"
                  className="w-full px-3 py-2 rounded-xl border text-sm"
                  style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>HTML Body (supports {'{{user.name}}'})</label>
                <textarea rows={5} value={form.emailHtml} onChange={e => set('emailHtml', e.target.value)}
                  placeholder="Leave blank to use built-in HTML template"
                  className="w-full px-3 py-2 rounded-xl border text-sm font-mono"
                  style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)', resize: 'vertical' }} />
              </div>
            </div>
          )}

          {form.channel === 'inapp' && (
            <div className="space-y-3 rounded-xl p-4 border" style={{ borderColor: '#ddd6fe', background: '#ede9fe15' }}>
              <h4 className="text-sm font-semibold" style={{ color: '#6d28d9' }}>In-App Config</h4>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Notification Type</label>
                <input value={form.inAppType} onChange={e => set('inAppType', e.target.value)}
                  placeholder="e.g. booking_confirmed"
                  className="w-full px-3 py-2 rounded-xl border text-sm"
                  style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Title (supports {'{{variables}}'})</label>
                <input value={form.inAppTitle} onChange={e => set('inAppTitle', e.target.value)}
                  placeholder="Booking #{{booking.bookingNumber}} confirmed"
                  className="w-full px-3 py-2 rounded-xl border text-sm"
                  style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Message (supports {'{{variables}}'})</label>
                <textarea rows={3} value={form.inAppMessage} onChange={e => set('inAppMessage', e.target.value)}
                  placeholder="Your {{booking.poojaName}} is confirmed for {{booking.scheduledDate}}"
                  className="w-full px-3 py-2 rounded-xl border text-sm"
                  style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)', resize: 'vertical' }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => set('enabled', !form.enabled)}>
              {form.enabled
                ? <ToggleRight className="w-8 h-8" style={{ color: '#059669' }} />
                : <ToggleLeft  className="w-8 h-8" style={{ color: '#6b7280' }} />}
            </button>
            <span className="text-sm" style={{ color: 'var(--t-text)' }}>
              {form.enabled ? 'Enabled — will fire on event' : 'Disabled — will be skipped'}
            </span>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--t-primary)' }}>
            {saving ? <Loader className="w-4 h-4 animate-spin inline mr-1" /> : <Save className="w-4 h-4 inline mr-1" />}
            {mode === 'create' ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifTestModal({ mapping, onTest, onClose, testing }) {
  const [phone, setPhone]   = useState('');
  const [email, setEmail]   = useState('');
  const [userId, setUserId] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: 'var(--t-card)' }}>
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--t-border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--t-text)' }}>Test Send</h3>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--t-muted)' }} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--t-bg)', color: 'var(--t-muted)' }}>
            <span className="font-mono">{mapping.eventName}</span> →{' '}
            <strong>{CHANNEL_LABELS[mapping.channel]}</strong> →{' '}
            <strong>{RECIPIENT_LABELS[mapping.recipientType]}</strong>
          </div>
          {mapping.channel === 'whatsapp' && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Override Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="91XXXXXXXXXX"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
          )}
          {mapping.channel === 'email' && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>Override Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="test@example.com" type="email"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
          )}
          {mapping.channel === 'inapp' && (
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--t-muted)' }}>User ID to notify</label>
              <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="MongoDB user _id"
                className="w-full px-3 py-2 rounded-xl border text-sm font-mono"
                style={{ background: 'var(--t-bg)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }} />
            </div>
          )}
          <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
            A test payload is used — no real booking/order data required.
          </p>
        </div>
        <div className="flex gap-3 justify-end px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-semibold"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-muted)' }}>Cancel</button>
          <button onClick={() => onTest({ mappingId: mapping._id, testPhone: phone || undefined, testEmail: email || undefined, testUserId: userId || undefined })}
            disabled={testing} className="px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#7c3aed' }}>
            {testing ? <Loader className="w-4 h-4 animate-spin inline mr-1" /> : <Send className="w-4 h-4 inline mr-1" />}
            Send Test
          </button>
        </div>
      </div>
    </div>
  );
}
