import React, { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Calendar, CalendarDays, IndianRupee, Ban,
  CheckCircle, Power, XCircle, RefreshCw, Upload,
  Clock, Star, User, FileText, ShieldCheck,
  BadgeCheck, AlertTriangle, MapPin, BarChart3, Sun,
} from 'lucide-react';
import ZutsavLoader from '../components/shared/ZutsavLoader';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../api/axios';
import AvailabilityManager from '../components/availability/AvailabilityManager';
import { formatDuration } from '../utils/durationFormatter';

const KYC_STATUS_CONFIG = {
  not_submitted:     { label: 'Not Submitted',     color: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400'    },
  submitted:         { label: 'Under Review',      color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
  approved:          { label: 'Approved',          color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'   },
  rejected:          { label: 'Rejected',          color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'     },
  reupload_required: { label: 'Re-upload Required',color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500'  },
};

function calcCompletion(pandit) {
  const checks = [
    !!pandit.profilePhoto,
    !!pandit.fatherName,
    !!pandit.gender,
    !!pandit.dob,
    !!pandit.bio,
    !!pandit.address,
    (pandit.languages?.length > 0),
    (pandit.qualifications?.length > 0),
    (pandit.specializations?.length > 0),
    (pandit.selectedPoojas?.length > 0),
    !!(pandit.bankDetails?.accountNumber || pandit.upiDetails?.upiId),
    !!(pandit.kycStatus && pandit.kycStatus !== 'not_submitted'),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// ─── Application Gate (rejected / suspended accounts) ──────────
function ApplicationGate({ pandit }) {
  const STATUS_CONFIG = {
    rejected: {
      icon:    <XCircle size={40} className="text-red-500" />,
      bg:      'bg-red-50 border-red-200',
      title:   'Account Rejected',
      message: 'Your account was not approved. Please contact support for assistance.',
    },
    suspended: {
      icon:    <Ban size={40} className="text-orange-500" />,
      bg:      'bg-orange-50 border-orange-200',
      title:   'Account Suspended',
      message: 'Your account has been suspended. Contact support to resolve this.',
    },
  };
  const cfg = STATUS_CONFIG[pandit.status] || STATUS_CONFIG.suspended;
  return (
    <div className="min-h-screen bg-spiritual-light flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="text-3xl">🪔</span>
            <span className="font-serif text-3xl font-bold text-maroon-600">Zutsav</span>
          </Link>
        </div>
        <div className={`bg-white rounded-3xl shadow-xl p-8 border ${cfg.bg} space-y-5`}>
          <div className="flex flex-col items-center gap-3 text-center">
            {cfg.icon}
            <h1 className="text-xl font-bold text-gray-800">{cfg.title}</h1>
            <p className="text-gray-600 text-sm leading-relaxed">{cfg.message}</p>
            {pandit.adminNote && (
              <div className="w-full bg-gray-50 rounded-xl p-3 text-left border border-gray-200">
                <p className="text-xs text-gray-500 font-semibold mb-1">Note from Admin:</p>
                <p className="text-sm text-gray-700">{pandit.adminNote}</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
            <button onClick={() => window.location.reload()} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm">
              <RefreshCw size={15} /> Refresh Status
            </button>
            <Link to="/" className="text-center text-sm text-saffron-600 hover:underline">← Back to Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Booking status metadata ────────────────────────────────────
const BOOKING_STATUS_META = {
  pending_payment:      { label: 'Awaiting Payment',   color: 'bg-yellow-100 text-yellow-700'  },
  paid:                 { label: 'Paid',               color: 'bg-blue-100 text-blue-700'      },
  pandit_assigned:      { label: 'Action Required',    color: 'bg-purple-100 text-purple-700'  },
  pandit_accepted:      { label: 'Accepted by You',    color: 'bg-teal-100 text-teal-700'      },
  pending_reassignment: { label: 'Rejected',           color: 'bg-red-100 text-red-600'        },
  completion_requested: { label: 'Completion Pending', color: 'bg-orange-100 text-orange-700'  },
  completed:            { label: 'Completed',          color: 'bg-green-100 text-green-700'    },
  cancelled:            { label: 'Cancelled',          color: 'bg-red-100 text-red-700'        },
};

// ─── Dashboard Home ─────────────────────────────────────────────
function DashboardHome({ pandit, reload }) {
  const [bookings,        setBookings]       = useState([]);
  const [ratings,         setRatings]        = useState([]);
  const [festivals,       setFestivals]      = useState([]);
  const [loading,         setLoading]        = useState(true);
  const [togglingOnline,  setTogglingOnline] = useState(false);

  useEffect(() => {
    const now   = new Date();
    const m1    = now.getMonth() + 1;
    const y1    = now.getFullYear();
    const next  = new Date(y1, now.getMonth() + 1, 1);
    const m2    = next.getMonth() + 1;
    const y2    = next.getFullYear();

    Promise.all([
      API.get('/pandits/me/bookings'),
      API.get('/pandits/me/ratings'),
      API.get(`/festivals?month=${m1}&year=${y1}`),
      API.get(`/festivals?month=${m2}&year=${y2}`),
    ]).then(([bRes, rRes, f1Res, f2Res]) => {
      setBookings(bRes.data.bookings || []);
      setRatings(rRes.data.ratings || []);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const allFests = [
        ...(f1Res.data.festivals || []),
        ...(f2Res.data.festivals || []),
      ];
      setFestivals(
        allFests
          .filter(f => new Date(f.date) >= todayStart)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 5)
      );
    }).catch(() => toast.error('Could not load dashboard data'))
      .finally(() => setLoading(false));
  }, []);

  const toggleOnline = async () => {
    setTogglingOnline(true);
    try {
      await API.patch('/pandits/me/online-status', { isOnline: !pandit.isOnline });
      await reload();
      toast.success(pandit.isOnline ? 'You are now offline' : 'You are now online');
    } catch { toast.error('Failed to update status'); }
    finally { setTogglingOnline(false); }
  };

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 bg-white rounded-2xl border border-gray-100" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100" />)}
      </div>
      <div className="h-44 bg-white rounded-2xl border border-gray-100" />
      <div className="h-44 bg-white rounded-2xl border border-gray-100" />
    </div>
  );

  // ── Derived stats ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cm = new Date().getMonth();
  const cy = new Date().getFullYear();

  const totalAssigned   = bookings.length;
  const activeBookings  = bookings.filter(b => b.status === 'pandit_accepted').length;
  const completedPoojas = bookings.filter(b => b.status === 'completed').length;
  const pendingActions  = bookings.filter(b => b.status === 'pandit_assigned');

  const earningsThisMonth = bookings
    .filter(b => {
      if (b.payout?.status !== 'completed' || !b.payout?.paidAt) return false;
      const d = new Date(b.payout.paidAt);
      return d.getMonth() === cm && d.getFullYear() === cy;
    })
    .reduce((sum, b) => sum + (b.payout?.amount || 0), 0);

  const todaySchedule = bookings
    .filter(b => {
      const d = new Date(b.scheduledDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime() && b.status !== 'cancelled';
    })
    .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));

  const upcomingBookings = bookings
    .filter(b => {
      const d = new Date(b.scheduledDate);
      d.setHours(0, 0, 0, 0);
      return d.getTime() > today.getTime() && ['pandit_assigned', 'pandit_accepted'].includes(b.status);
    })
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))
    .slice(0, 5);

  const recentEarnings = [...bookings]
    .filter(b => b.payout?.status === 'completed')
    .sort((a, b) => new Date(b.payout?.paidAt || 0) - new Date(a.payout?.paidAt || 0))
    .slice(0, 5);

  const recentReviews = [...ratings]
    .sort((a, b) => new Date(b.ratingDate || 0) - new Date(a.ratingDate || 0))
    .slice(0, 3);

  // Performance
  const acceptedCount = bookings.filter(b => ['pandit_accepted', 'completion_requested', 'completed'].includes(b.status)).length;
  const rejectedCount = bookings.filter(b => b.status === 'pending_reassignment').length;
  const completionRate = totalAssigned > 0 ? Math.round((completedPoojas / totalAssigned) * 100) : 0;
  const customerMap = {};
  bookings.forEach(b => {
    const uid = typeof b.userId === 'object' ? b.userId?._id : b.userId;
    if (uid) customerMap[uid] = (customerMap[uid] || 0) + 1;
  });
  const repeatCustomers = Object.values(customerMap).filter(c => c > 1).length;

  // Action required conditions
  const profileIncomplete = calcCompletion(pandit) < 70;
  const kycPending = pandit.kycStatus === 'not_submitted' || pandit.kycStatus === 'reupload_required';
  const showActionRequired = pendingActions.length > 0 || profileIncomplete || kycPending;

  const kycCfg     = KYC_STATUS_CONFIG[pandit.kycStatus || 'not_submitted'];
  const formattedDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const StarDisplay = ({ value }) => (
    <span className="inline-flex gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} size={12} className={s <= Math.round(value) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </span>
  );

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── SECTION 1: Welcome Header ── */}
      <div className="bg-white rounded-2xl border border-saffron-100 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1B1F3B' }}>
              Namaste, {pandit.name} 🙏
            </h1>
            <p className="text-sm text-gray-500 mt-1">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${kycCfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${kycCfg.dot}`} />
              KYC: {kycCfg.label}
            </span>
            <button
              onClick={toggleOnline}
              disabled={togglingOnline}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                pandit.isOnline
                  ? 'bg-green-500 text-white border-green-500 hover:bg-green-600'
                  : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
              }`}
            >
              <Power size={12} />
              {togglingOnline ? 'Updating...' : pandit.isOnline ? 'Online' : 'Offline'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Action Required (shown at top, conditional) ── */}
      {showActionRequired && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <h2 className="font-bold text-amber-900 flex items-center gap-2 mb-3">
            <AlertTriangle size={17} className="text-amber-600" />
            Action Required
          </h2>
          <div className="space-y-2">
            {pendingActions.length > 0 && (
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-amber-100">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Clock size={15} className="text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">Pending Booking Response</p>
                  <p className="text-xs text-gray-500">
                    {pendingActions.length} booking{pendingActions.length !== 1 ? 's' : ''} awaiting your accept/reject
                  </p>
                </div>
                <Link to="/pandit/dashboard?tab=bookings"
                  className="text-xs font-bold text-purple-600 hover:underline shrink-0">
                  Respond →
                </Link>
              </div>
            )}
            {profileIncomplete && (
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-amber-100">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <User size={15} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">Complete Your Profile</p>
                  <p className="text-xs text-gray-500">
                    Profile is {calcCompletion(pandit)}% complete. Reach 70% to receive bookings.
                  </p>
                </div>
                <Link to="/pandit/profile"
                  className="text-xs font-bold text-amber-600 hover:underline shrink-0">
                  Complete →
                </Link>
              </div>
            )}
            {kycPending && (
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-amber-100">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                  <ShieldCheck size={15} className="text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {pandit.kycStatus === 'reupload_required' ? 'Document Re-upload Required' : 'KYC Pending'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {pandit.kycStatus === 'reupload_required'
                      ? pandit.kycRejectionReason || 'Please re-upload your KYC documents.'
                      : 'Submit KYC documents to start receiving bookings.'}
                  </p>
                </div>
                <Link to="/pandit/profile"
                  className="text-xs font-bold text-red-500 hover:underline shrink-0">
                  {pandit.kycStatus === 'reupload_required' ? 'Re-upload →' : 'Submit →'}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTION 2: Quick Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Assigned',    value: totalAssigned,   icon: BookOpen,      color: 'text-blue-600 bg-blue-50'    },
          { label: 'Active Bookings',   value: activeBookings,  icon: CheckCircle,   color: 'text-teal-600 bg-teal-50'    },
          { label: 'Completed Poojas',  value: completedPoojas, icon: BadgeCheck,    color: 'text-green-600 bg-green-50'  },
          { label: 'Earnings This Month', value: `₹${earningsThisMonth.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-amber-600 bg-amber-50' },
          { label: 'Average Rating',    value: pandit.rating ? pandit.rating.toFixed(1) : '—', icon: Star, color: 'text-orange-500 bg-orange-50' },
          { label: 'Total Reviews',     value: pandit.totalReviews || 0, icon: User, color: 'text-purple-600 bg-purple-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}>
              <Icon size={18} />
            </div>
            <p className="text-xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: Today's Schedule ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Sun size={17} style={{ color: '#D4AF37' }} />
            Today's Schedule
          </h2>
          {todaySchedule.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {todaySchedule.length} booking{todaySchedule.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {todaySchedule.length === 0 ? (
          <div className="text-center py-8">
            <CalendarDays size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No bookings scheduled for today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {todaySchedule.map(b => {
              const meta         = BOOKING_STATUS_META[b.status] || { label: b.status, color: 'bg-gray-100 text-gray-600' };
              const addr         = b.userDetails;
              const customerName = addr?.name || b.userId?.name || '—';
              return (
                <div key={b._id} className="flex items-start gap-3 p-3 bg-saffron-50 rounded-xl border border-saffron-100">
                  <div className="bg-white rounded-lg px-2.5 py-2 text-center min-w-[54px] border border-saffron-100 shrink-0">
                    <p className="text-sm font-bold" style={{ color: '#1B1F3B' }}>{b.scheduledTime || '—'}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{b.poojaId?.name || 'Pooja Service'}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{customerName}</p>
                    {addr?.address && (
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <MapPin size={10} className="shrink-0" />
                        {[addr.address, addr.city].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <Link
                    to="/pandit/dashboard?tab=bookings"
                    className="text-xs font-semibold shrink-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-white transition-colors"
                  >
                    View
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 4: Upcoming Bookings ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Calendar size={17} style={{ color: '#1B1F3B' }} />
            Upcoming Bookings
          </h2>
          <Link to="/pandit/dashboard?tab=bookings" className="text-xs font-semibold text-saffron-600 hover:underline">
            View all →
          </Link>
        </div>
        {upcomingBookings.length === 0 ? (
          <div className="text-center py-8">
            <BookOpen size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No upcoming bookings available.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingBookings.map(b => {
              const meta         = BOOKING_STATUS_META[b.status] || { label: b.status, color: 'bg-gray-100 text-gray-600' };
              const customerName = b.userDetails?.name || b.userId?.name || '—';
              return (
                <div key={b._id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-saffron-100 hover:bg-saffron-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{b.poojaId?.name || 'Pooja Service'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(b.scheduledDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} at {b.scheduledTime}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-gray-600">{customerName}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 6: Recent Earnings ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <IndianRupee size={17} style={{ color: '#D4AF37' }} />
            Recent Earnings
          </h2>
          <Link to="/pandit/dashboard?tab=earnings" className="text-xs font-semibold text-saffron-600 hover:underline">
            View all →
          </Link>
        </div>
        {recentEarnings.length === 0 ? (
          <div className="text-center py-8">
            <IndianRupee size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No payout records yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentEarnings.map(b => (
              <div key={b._id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{b.poojaId?.name || 'Pooja Service'}</p>
                  <p className="text-xs text-gray-400">
                    {b.payout?.paidAt
                      ? new Date(b.payout.paidAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
                      : '—'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-700">₹{(b.payout?.amount || 0).toLocaleString('en-IN')}</p>
                  <span className="text-[10px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Paid</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 7: Recent Reviews ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <Star size={17} style={{ color: '#D4AF37' }} />
            Recent Reviews
          </h2>
          <Link to="/pandit/dashboard?tab=earnings" className="text-xs font-semibold text-saffron-600 hover:underline">
            View all →
          </Link>
        </div>
        {recentReviews.length === 0 ? (
          <div className="text-center py-8">
            <Star size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No reviews yet. Complete bookings to start receiving ratings.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentReviews.map(b => (
              <div key={b._id} className="p-4 bg-saffron-50 rounded-xl border border-saffron-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StarDisplay value={b.rating} />
                      <span className="text-xs font-bold text-gray-700">{b.rating}/5</span>
                    </div>
                    {b.review && <p className="text-sm text-gray-600 italic">"{b.review}"</p>}
                    <p className="text-xs text-gray-400 mt-1">{b.poojaId?.name || 'Pooja Service'}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 shrink-0">
                    {b.ratingDate ? new Date(b.ratingDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 8: Upcoming Festivals ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <CalendarDays size={17} style={{ color: '#D4AF37' }} />
            Upcoming Festivals
          </h2>
          <Link to="/pandit/dashboard?tab=festivals" className="text-xs font-semibold text-saffron-600 hover:underline">
            Full calendar →
          </Link>
        </div>
        {festivals.length === 0 ? (
          <div className="text-center py-8">
            <CalendarDays size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No upcoming festivals this month.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {festivals.map(f => (
              <div key={f._id} className="flex gap-3 items-start p-3 rounded-xl border border-gray-100 hover:bg-saffron-50 hover:border-saffron-100 transition-colors">
                <div className="bg-saffron-50 rounded-xl px-2.5 py-2 text-center min-w-[48px] border border-saffron-100 shrink-0">
                  <p className="text-xs font-bold text-saffron-700">
                    {new Date(f.date).toLocaleDateString('en-IN', { day: '2-digit' })}
                  </p>
                  <p className="text-[10px] text-saffron-500">
                    {new Date(f.date).toLocaleDateString('en-IN', { month: 'short' })}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{f.name}</p>
                  {f.tithiDate   && <p className="text-xs text-saffron-600 mt-0.5">{f.tithiDate}</p>}
                  {f.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{f.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTION 9: Performance Overview ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 size={17} style={{ color: '#1B1F3B' }} />
          Performance Overview
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Bookings',       value: totalAssigned },
            { label: 'Accepted',             value: acceptedCount },
            { label: 'Rejected / Reassigned',value: rejectedCount },
            { label: 'Completion Rate',      value: `${completionRate}%` },
            { label: 'Average Rating',       value: pandit.rating ? `${pandit.rating.toFixed(1)} / 5` : '—' },
            { label: 'Repeat Customers',     value: repeatCustomers },
          ].map(({ label, value }) => (
            <div key={label} className="bg-saffron-50 rounded-xl p-3 border border-saffron-100">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-bold mt-1" style={{ color: '#1B1F3B' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Bookings Tab ───────────────────────────────────────────────
function BookingsTab() {
  const [bookings,         setBookings]         = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [statusFilter,     setStatusFilter]     = useState('');
  const [expanded,         setExpanded]         = useState(null);
  const [completing,       setCompleting]       = useState(null);
  const [accepting,        setAccepting]        = useState(null);
  const [rejectModal,      setRejectModal]      = useState(null);
  const [rejectReason,     setRejectReason]     = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);
  const [otpValues,        setOtpValues]        = useState({});  // bookingId → otp string
  const [verifyingOtp,     setVerifyingOtp]     = useState(null);

  const QUICK_REASONS = ['Already booked on that date', 'Out of station', 'Medical emergency', 'Personal reason', 'Other'];

  const load = useCallback(() => {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    API.get(`/pandits/me/bookings${params}`)
      .then(({ data }) => setBookings(data.bookings || []))
      .catch(() => toast.error('Could not load bookings'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const handleAccept = async (bookingId) => {
    setAccepting(bookingId);
    try {
      await API.patch(`/pandits/me/bookings/${bookingId}/accept`);
      toast.success('Booking accepted! Customer and admin have been notified.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not accept booking');
    } finally { setAccepting(null); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 10) {
      toast.error('Please provide a reason (minimum 10 characters)');
      return;
    }
    setSubmittingReject(true);
    try {
      await API.patch(`/pandits/me/bookings/${rejectModal.bookingId}/reject`, { reason: rejectReason });
      toast.success('Booking rejected. Admin has been notified to reassign.');
      setRejectModal(null);
      setRejectReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reject booking');
    } finally { setSubmittingReject(false); }
  };

  const handleRequestCompletion = async (bookingId) => {
    setCompleting(bookingId);
    try {
      await API.patch(`/pandits/me/bookings/${bookingId}/request-completion`);
      toast.success('OTP sent to the user. Ask them for the code to complete the booking.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not request completion');
    } finally { setCompleting(null); }
  };

  const handleVerifyOtp = async (bookingId) => {
    const otp = (otpValues[bookingId] || '').trim();
    if (!otp || otp.length !== 6) { toast.error('Enter the 6-digit OTP from the user'); return; }
    setVerifyingOtp(bookingId);
    try {
      await API.post(`/pandits/me/bookings/${bookingId}/verify-completion-otp`, { otp });
      toast.success('Booking marked as completed!');
      setOtpValues((prev) => { const n = {...prev}; delete n[bookingId]; return n; });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired OTP');
    } finally { setVerifyingOtp(null); }
  };

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1,2,3].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100" />)}
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold" style={{ color: '#1B1F3B', fontFamily: "'Cormorant Garamond', serif" }}>
          My Bookings
          {bookings.length > 0 && <span className="ml-2 text-sm font-normal text-gray-400">({bookings.length})</span>}
        </h2>
        <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: '',                     label: 'All'              },
          { key: 'pandit_assigned',      label: 'Action Required'  },
          { key: 'pandit_accepted',      label: 'Accepted'         },
          { key: 'completion_requested', label: 'Pending Approval' },
          { key: 'completed',            label: 'Completed'        },
          { key: 'cancelled',            label: 'Cancelled'        },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={{
              background: statusFilter === key ? '#1B1F3B' : 'white',
              color:      statusFilter === key ? 'white'   : '#6b7280',
              border:     `1px solid ${statusFilter === key ? '#1B1F3B' : '#e5e7eb'}`,
            }}>
            {label}
          </button>
        ))}
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <BookOpen size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No bookings found.</p>
          <p className="text-xs text-gray-400 mt-1">Admin will assign bookings based on your availability and location.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const meta      = BOOKING_STATUS_META[b.status] || { label: b.status, color: 'bg-gray-100 text-gray-600' };
            const customer  = b.userId || {};
            const isOpen    = expanded === b._id;
            const addr      = b.userDetails;
            const needsAction = b.status === 'pandit_assigned';

            return (
              <div key={b._id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${needsAction ? 'border-purple-200 ring-1 ring-purple-100' : 'border-gray-100'}`}>
                <button className="w-full text-left p-4 flex items-start gap-3" onClick={() => setExpanded(isOpen ? null : b._id)}>
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: needsAction ? '#7c3aed' : '#1B1F3B', minHeight: '48px' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-800 text-sm">{b.poojaId?.name || 'Pooja Service'}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                      {needsAction && <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full animate-pulse">Action needed</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {addr?.name || customer.name || '—'} · {new Date(b.scheduledDate).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' })} at {b.scheduledTime}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5 font-mono">#{b.bookingNumber}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 shrink-0">{isOpen ? '▲ hide' : '▼ details'}</p>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="font-bold text-gray-500 uppercase tracking-wide mb-1.5">Customer</p>
                      <p className="font-semibold text-gray-800">{addr?.name || customer.name || '—'}</p>
                      <p className="text-gray-500">{addr?.phone || customer.phone || '—'}</p>
                      {(addr?.email || customer.email) && <p className="text-gray-400">{addr?.email || customer.email}</p>}
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-gray-500 uppercase tracking-wide mb-1.5">Schedule</p>
                      <p className="font-semibold text-gray-800">
                        {new Date(b.scheduledDate).toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                      </p>
                      <p className="text-gray-500">{b.scheduledTime}</p>
                      {b.language && <p className="text-gray-400">Language: {b.language}</p>}
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <p className="font-bold text-gray-500 uppercase tracking-wide mb-1.5">Service Address</p>
                      <div className="bg-gray-50 rounded-xl p-3 leading-relaxed">
                        <p className="text-gray-700">{[addr?.address, addr?.city, addr?.district, addr?.state, addr?.pincode].filter(Boolean).join(', ')}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-gray-500 uppercase tracking-wide mb-1.5">Status</p>
                      <span className={`inline-block text-[10px] font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span>
                      {b.panditAssignedAt && (
                        <p className="text-gray-400 mt-1">Assigned: {new Date(b.panditAssignedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-gray-500 uppercase tracking-wide mb-1.5">Pooja</p>
                      <p className="font-semibold text-gray-800">{b.poojaId?.name || '—'}</p>
                      {formatDuration(b.poojaId) && <p className="text-gray-400">Duration: {formatDuration(b.poojaId)}</p>}
                    </div>
                    {b.specialNote && (
                      <div className="sm:col-span-2">
                        <p className="font-bold text-gray-500 uppercase tracking-wide mb-1.5">Special Instructions</p>
                        <p className="text-gray-600 bg-amber-50 rounded-xl p-3">{b.specialNote}</p>
                      </div>
                    )}

                    {b.status === 'pandit_assigned' && (
                      <div className="sm:col-span-2 pt-3 border-t border-gray-100 space-y-3">
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                          <p className="text-purple-800 font-semibold text-sm mb-0.5">Please respond to this booking</p>
                          <p className="text-purple-600 text-[11px]">Accept if available on {new Date(b.scheduledDate).toLocaleDateString('en-IN', { day:'numeric', month:'short' })} at {b.scheduledTime}. Reject if you cannot attend.</p>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => handleAccept(b._id)} disabled={accepting === b._id}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors">
                            {accepting === b._id ? 'Accepting…' : '✓ Accept Booking'}
                          </button>
                          <button onClick={() => { setRejectModal({ bookingId: b._id, bookingNumber: b.bookingNumber }); setRejectReason(''); }}
                            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-100 hover:bg-red-200 text-red-700 transition-colors">
                            ✗ Reject Booking
                          </button>
                        </div>
                      </div>
                    )}

                    {b.status === 'pandit_accepted' && (
                      <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
                          <p className="text-teal-700 font-semibold text-sm">✓ You have accepted this booking</p>
                          <p className="text-teal-600 text-[11px] mt-0.5">Perform the pooja on {new Date(b.scheduledDate).toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })} and when done, click the button below to send an OTP to the user.</p>
                        </div>
                        <button onClick={() => handleRequestCompletion(b._id)} disabled={completing === b._id}
                          className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                          style={{ background: '#1B1F3B', color: 'white' }}>
                          {completing === b._id ? 'Sending OTP…' : '🔐 Request OTP to Complete'}
                        </button>
                        <p className="text-[10px] text-gray-400 text-center mt-1.5">An OTP will be sent to the customer — ask them for the code</p>
                      </div>
                    )}

                    {b.status === 'completion_requested' && (
                      <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
                          <p className="text-orange-700 font-semibold text-sm">🔐 OTP Sent to Customer</p>
                          <p className="text-orange-500 text-[10px] mt-0.5">An OTP has been sent to the customer via Email &amp; WhatsApp. Ask the customer for the 6-digit code and enter it below.</p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="6-digit OTP"
                            value={otpValues[b._id] || ''}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                              setOtpValues((prev) => ({ ...prev, [b._id]: v }));
                            }}
                            className="input flex-1 text-center text-lg tracking-widest font-mono"
                          />
                          <button
                            onClick={() => handleVerifyOtp(b._id)}
                            disabled={verifyingOtp === b._id || (otpValues[b._id] || '').length !== 6}
                            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            {verifyingOtp === b._id ? 'Verifying…' : '✓ Verify & Complete'}
                          </button>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <p className="text-[10px] text-gray-400">OTP expires in 10 minutes</p>
                          <button
                            onClick={() => handleRequestCompletion(b._id)}
                            disabled={completing === b._id}
                            className="text-[10px] text-orange-500 hover:text-orange-700 underline disabled:opacity-50"
                          >
                            {completing === b._id ? 'Resending…' : 'Resend OTP'}
                          </button>
                        </div>
                      </div>
                    )}

                    {b.status === 'completed' && (
                      <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                          <p className="text-green-700 font-semibold text-sm">✓ Booking Completed</p>
                          {b.completedAt && <p className="text-green-500 text-[10px] mt-0.5">Verified on {new Date(b.completedAt).toLocaleDateString('en-IN')}{b.verifiedByName ? ` by ${b.verifiedByName}` : ''}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-800 text-lg mb-0.5">Reject Booking</h3>
            <p className="text-xs text-gray-400 mb-4 font-mono">#{rejectModal.bookingNumber}</p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick reasons</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setRejectReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${rejectReason === r ? 'bg-red-100 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {r}
                </button>
              ))}
            </div>
            <label className="label">Reason <span className="text-gray-400 font-normal">(min 10 characters)</span></label>
            <textarea className="input min-h-[80px] resize-none text-sm mb-4"
              placeholder="Describe why you cannot accept this booking…"
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            {rejectReason.length > 0 && rejectReason.length < 10 && (
              <p className="text-xs text-red-500 -mt-3 mb-3">{10 - rejectReason.length} more characters needed</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }} className="btn-outline flex-1">Cancel</button>
              <button onClick={handleReject} disabled={submittingReject || rejectReason.trim().length < 10}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors">
                {submittingReject ? 'Submitting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Festival Calendar Tab ──────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function FestivalsTab() {
  const [festivals, setFestivals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [month,     setMonth]     = useState(new Date().getMonth() + 1);
  const [year,      setYear]      = useState(new Date().getFullYear());

  useEffect(() => {
    setLoading(true);
    API.get(`/festivals?month=${month}&year=${year}`)
      .then(({ data }) => setFestivals(data.festivals))
      .finally(() => setLoading(false));
  }, [month, year]);

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Festival Calendar</h2>
      <div className="flex gap-3 mb-5 flex-wrap">
        <select className="input w-40 text-sm" value={month} onChange={(e) => setMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select className="input w-28 text-sm" value={year} onChange={(e) => setYear(+e.target.value)}>
          {[2024,2025,2026,2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="animate-pulse space-y-3">{[1,2,3].map((i) => <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100" />)}</div>
      ) : festivals.length === 0 ? (
        <div className="text-center py-10 text-gray-400">No festivals this month.</div>
      ) : (
        <div className="space-y-3">
          {festivals.map((f) => (
            <div key={f._id} className="bg-white rounded-2xl border border-saffron-100 p-4 shadow-sm flex gap-4 items-start">
              <div className="bg-saffron-50 rounded-xl p-2.5 text-center min-w-[48px]">
                <p className="text-xs text-saffron-600 font-bold">{new Date(f.date).toLocaleDateString('en-IN',{day:'2-digit'})}</p>
                <p className="text-xs text-saffron-500">{new Date(f.date).toLocaleDateString('en-IN',{month:'short'})}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{f.name}</p>
                {f.tithiDate   && <p className="text-xs text-saffron-600 mt-0.5">{f.tithiDate}</p>}
                {f.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{f.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Earnings Tab ───────────────────────────────────────────────
function EarningsTab({ pandit }) {
  const [earningsView, setEarningsView] = useState('pending');
  const [stats,        setStats]        = useState(null);
  const [pending,      setPending]      = useState([]);
  const [history,      setHistory]      = useState([]);
  const [ratings,      setRatings]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [batchDetail,  setBatchDetail]  = useState(null);

  const fmt     = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const loadEarnings = useCallback(() => {
    setLoading(true);
    Promise.all([
      API.get('/pandits/me/payouts/stats'),
      API.get('/pandits/me/payouts/pending'),
      API.get('/pandits/me/payouts/history'),
      API.get('/pandits/me/ratings'),
    ]).then(([{ data: s }, { data: p }, { data: h }, { data: r }]) => {
      setStats(s.stats);
      setPending(p.bookings || []);
      setHistory(h.batches || []);
      setRatings(r.ratings || []);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadEarnings(); }, [loadEarnings]);

  const StarDisplay = ({ value }) => (
    <span className="inline-flex gap-0.5">
      {[1,2,3,4,5].map((s) => (
        <Star key={s} size={13} className={s <= Math.round(value) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </span>
  );

  if (loading) return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl border border-gray-100" />)}</div>
      <div className="h-48 bg-white rounded-2xl border border-gray-100" />
    </div>
  );

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: '#1B1F3B', fontFamily: "'Cormorant Garamond', serif" }}>My Earnings</h2>
        <button onClick={loadEarnings} disabled={loading} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Earnings',    value: fmt(stats?.totalEarned),   icon: IndianRupee, color: 'text-green-700 bg-green-50',  border: 'border-green-100' },
          { label: 'Pending Payments',  value: fmt(stats?.pendingAmount), icon: Clock,       color: 'text-amber-700 bg-amber-50',  border: 'border-amber-100' },
          { label: 'Paid Out',          value: fmt(stats?.paidAmount),    icon: CheckCircle, color: 'text-blue-700 bg-blue-50',    border: 'border-blue-100'  },
        ].map(({ label, value, icon: Icon, color, border }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} p-5 flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shrink-0`}><Icon size={22} /></div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'pending',  label: `Pending Payments${stats?.pendingCount > 0 ? ` (${stats.pendingCount})` : ''}` },
          { key: 'history',  label: 'Payout History' },
          { key: 'reviews',  label: 'Reviews' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setEarningsView(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${earningsView === key ? 'bg-saffron-500 text-white' : 'bg-white text-gray-600 border hover:border-saffron-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Pending Payments */}
      {earningsView === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center">
              <CheckCircle size={36} className="text-green-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No pending payments. All paid up!</p>
            </div>
          ) : pending.map((b) => (
            <div key={b._id} className="bg-white rounded-2xl border border-amber-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{b.poojaId?.name || 'Pooja Service'}</p>
                  <p className="text-xs text-gray-400">
                    #{b.bookingNumber} · {fmtDate(b.scheduledDate)}
                  </p>
                  {b.verifiedAt && <p className="text-xs text-gray-400">Completed &amp; verified: {fmtDate(b.verifiedAt)}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold text-gray-800">{fmt(b.payout?.amount)}</p>
                  <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Awaiting Admin Payout</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payout History */}
      {earningsView === 'history' && (
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center">
              <IndianRupee size={36} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No payout records yet.</p>
            </div>
          ) : history.map((batch) => (
            <div key={batch._id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <IndianRupee size={18} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{batch.batchId}</span>
                    <span className="text-[10px] text-gray-400">{fmtDate(batch.paidDate)}</span>
                  </div>
                  <p className="text-sm text-gray-500">{batch.bookings?.length || batch.bookingIds?.length || 0} pooja{(batch.bookings?.length || 1) > 1 ? 's' : ''} included</p>
                </div>
                <div className="shrink-0 text-right mr-2">
                  <p className="text-lg font-bold text-green-700">{fmt(batch.totalAmount)}</p>
                  <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Paid</span>
                </div>
                <button onClick={() => setBatchDetail(batchDetail === batch._id ? null : batch._id)}
                  className="shrink-0 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
                  {batchDetail === batch._id ? 'Hide' : 'Details'}
                </button>
              </div>
              {batchDetail === batch._id && batch.bookings?.length > 0 && (
                <div className="border-t border-gray-50 bg-gray-50 px-4 py-3 space-y-2">
                  {batch.bookings.map((b) => (
                    <div key={b._id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-gray-700">{b.poojaId?.name || 'Pooja'}</p>
                        <p className="text-xs text-gray-400">#{b.bookingNumber} · {fmtDate(b.scheduledDate)}</p>
                      </div>
                      <p className="font-semibold text-gray-700">{fmt(b.payout?.amount || b['payout.amount'])}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reviews */}
      {earningsView === 'reviews' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 mb-2">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{pandit.rating ? pandit.rating.toFixed(1) : '—'}</p>
              <p className="text-sm text-gray-500">Avg Rating</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{pandit.totalReviews || 0}</p>
              <p className="text-sm text-gray-500">Total Reviews</p>
            </div>
          </div>
          {ratings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center">
              <Star size={36} className="text-gray-200 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">No reviews yet. Complete bookings to receive ratings.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ratings.map((b) => (
                <div key={b._id} className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StarDisplay value={b.rating} />
                        <span className="text-xs font-bold text-gray-700">{b.rating}/5</span>
                        <span className="text-[10px] text-gray-400 font-mono">#{b.bookingNumber}</span>
                      </div>
                      <p className="text-xs font-semibold text-gray-700">{b.poojaId?.name || 'Pooja Service'}</p>
                      {b.review && <p className="text-xs text-gray-500 mt-1 italic">"{b.review}"</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-400">{fmtDate(b.ratingDate || b.scheduledDate)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function PanditDashboard() {
  const [pandit,  setPandit]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const load = useCallback(() =>
    API.get('/pandits/me')
      .then(({ data }) => setPandit(data.pandit))
      .catch(() => toast.error('Could not load profile'))
      .finally(() => setLoading(false)),
  []);

  useEffect(() => { load(); }, [load]);

  // Redirect legacy profile tab URL to the dedicated profile page
  if (tab === 'profile') return <Navigate to="/pandit/profile" replace />;

  if (loading) return <ZutsavLoader size={60} />;

  if (!pandit) return (
    <div className="flex items-center justify-center py-24 text-center px-4" style={{ color: 'var(--t-muted)' }}>
      <div>
        <p className="text-xl mb-4">Pandit profile not found.</p>
        <Link to="/register" className="btn-primary">Register as Pandit</Link>
      </div>
    </div>
  );

  if (pandit.status === 'rejected' || pandit.status === 'suspended') {
    return <ApplicationGate pandit={pandit} />;
  }

  return (
    <div className="p-4 md:p-6">
      {tab === 'overview'     && <DashboardHome      pandit={pandit} reload={load} />}
      {tab === 'bookings'     && <BookingsTab />}
      {tab === 'availability' && <AvailabilityManager pandit={pandit} onReload={load} />}
      {tab === 'festivals'    && <FestivalsTab />}
      {tab === 'earnings'     && <EarningsTab         pandit={pandit} />}
    </div>
  );
}
