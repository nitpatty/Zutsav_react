import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock, CheckCircle, ArrowRight, ArrowLeft, Shield, Sparkles,
  Package, ChevronLeft, ChevronRight, Zap, Calendar, X, ShoppingCart,
  Eye, Tag, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth }  from '../context/AuthContext';
import { useCart }  from '../context/CartContext';
import PincodeInput from '../components/shared/PincodeInput';
import { formatDuration } from '../utils/durationFormatter';
import { calculatePrice, kitSavingsPct, formatINR } from '../utils/priceEngine';

// ─────────────────────────────────────────────────────────────
// STEP DEFINITIONS
// Steps are dynamic — kit steps hidden for urgent bookings
// ─────────────────────────────────────────────────────────────

const STEP_IDS = {
  OVERVIEW:   'overview',
  TYPE:       'type',
  KIT_PREF:  'kit-pref',
  KIT_SELECT: 'kit-select',
  DATE:       'date',
  TIME:       'time',
  LANGUAGE:   'language',
  DETAILS:    'details',
  REVIEW:     'review',
};

const STEP_META = {
  [STEP_IDS.OVERVIEW]:   { icon: '🙏', label: 'Pooja',    desc: 'Review ceremony'  },
  [STEP_IDS.TYPE]:       { icon: '⚡', label: 'Type',     desc: 'Normal or Urgent' },
  [STEP_IDS.KIT_PREF]:  { icon: '📦', label: 'Samagri',  desc: 'Kit preference'   },
  [STEP_IDS.KIT_SELECT]: { icon: '🛍️', label: 'Kit',      desc: 'Select kit'       },
  [STEP_IDS.DATE]:       { icon: '📅', label: 'Date',     desc: 'Pick a date'      },
  [STEP_IDS.TIME]:       { icon: '🕐', label: 'Time',     desc: 'Select time'      },
  [STEP_IDS.LANGUAGE]:   { icon: '🌐', label: 'Language', desc: 'Choose language'  },
  [STEP_IDS.DETAILS]:    { icon: '📋', label: 'Details',  desc: 'Your information' },
  [STEP_IDS.REVIEW]:     { icon: '✨', label: 'Review',   desc: 'Pay & confirm'    },
};

function buildActiveSteps(isUrgent, withKit, hasKits) {
  return [
    STEP_IDS.OVERVIEW,
    STEP_IDS.TYPE,
    ...(hasKits && !isUrgent ? [STEP_IDS.KIT_PREF] : []),
    ...(hasKits && !isUrgent && withKit ? [STEP_IDS.KIT_SELECT] : []),
    STEP_IDS.DATE,
    STEP_IDS.TIME,
    STEP_IDS.LANGUAGE,
    STEP_IDS.DETAILS,
    STEP_IDS.REVIEW,
  ];
}

// ─────────────────────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function CalendarPicker({ value, onChange }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [vy, setVY] = useState(today.getFullYear());
  const [vm, setVM] = useState(today.getMonth());

  const sel = value ? new Date(value + 'T00:00:00') : null;
  const prev = () => vm === 0 ? (setVM(11), setVY(y => y-1)) : setVM(m => m-1);
  const next = () => vm === 11 ? (setVM(0),  setVY(y => y+1)) : setVM(m => m+1);

  const firstDay = new Date(vy, vm, 1).getDay();
  const daysInMon = new Date(vy, vm+1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMon }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  const isDisabled = (d) => new Date(vy, vm, d) < today;
  const isSelected = (d) => sel && sel.getFullYear()===vy && sel.getMonth()===vm && sel.getDate()===d;
  const isToday = (d) => today.getFullYear()===vy && today.getMonth()===vm && today.getDate()===d;

  const pick = (d) => {
    if (!d || isDisabled(d)) return;
    const dt = new Date(vy, vm, d);
    onChange(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`);
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor:'var(--t-border)', background:'white' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor:'var(--t-border)', background:'#fff8f0' }}>
        <button onClick={prev} className="p-1.5 rounded-lg hover:bg-orange-100 transition-colors"><ChevronLeft size={16} className="text-orange-500" /></button>
        <span className="font-semibold text-sm" style={{ color:'#1B1F3B' }}>{MONTHS[vm]} {vy}</span>
        <button onClick={next} className="p-1.5 rounded-lg hover:bg-orange-100 transition-colors"><ChevronRight size={16} className="text-orange-500" /></button>
      </div>
      <div className="grid grid-cols-7 border-b" style={{ borderColor:'var(--t-border)' }}>
        {WEEKDAYS.map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 p-2 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i}/>;
          const dis=isDisabled(day), sel2=isSelected(day), tod=isToday(day);
          return (
            <button key={i} onClick={() => pick(day)} disabled={dis}
              className={`w-full aspect-square rounded-xl text-xs font-semibold transition-all flex items-center justify-center
                ${dis ? 'text-gray-200 cursor-not-allowed' : sel2 ? 'text-white shadow-md' : tod ? 'border-2 text-orange-600 bg-orange-50' : 'text-gray-700 hover:bg-orange-50 hover:text-orange-700'}`}
              style={sel2 ? { background:'linear-gradient(135deg,#FF6B00,#ff9020)' } : tod ? { borderColor:'#FF6B00' } : {}}
            >{day}</button>
          );
        })}
      </div>
      {value && (
        <div className="px-4 py-2.5 border-t text-center text-sm font-medium text-orange-700" style={{ borderColor:'var(--t-border)', background:'#fff8f0' }}>
          {new Date(value+'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TIME SLOTS
// ─────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  '05:00','05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00',
];

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${suffix}`;
}

// ─────────────────────────────────────────────────────────────
// KIT ITEMS MODAL
// ─────────────────────────────────────────────────────────────

function KitItemsModal({ kit, onClose }) {
  const items = kit?.items?.map(it => it.productId?.name).filter(Boolean) || [];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'white' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor:'var(--t-border)', background:'#fff8f0' }}>
          <div>
            <h3 className="font-bold text-gray-900 text-base">{kit?.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} items included</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <X size={14} className="text-gray-500" />
          </button>
        </div>

        {/* Items list */}
        <div className="px-6 py-4 max-h-72 overflow-y-auto">
          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((name, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle size={12} className="text-green-600" />
                  </div>
                  <span className="text-sm text-gray-700">{name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Item list not available</p>
          )}
        </div>

        <div className="px-6 pb-5">
          <p className="text-[11px] text-gray-400 text-center">
            All items are sourced fresh and delivered to your address before the ceremony.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────

function StepHeader({ icon, title, desc }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
        style={{ background:'linear-gradient(135deg,#FF6B00,#ff9020)' }}>{icon}</div>
      <div>
        <h2 className="font-bold text-gray-900 text-xl" style={{ fontFamily:"'Cormorant Garamond',serif", letterSpacing:'-0.01em' }}>{title}</h2>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Continue', loading = false }) {
  return (
    <div className="flex gap-3 mt-6">
      <button onClick={onBack} className="btn-outline flex items-center gap-2 shrink-0">
        <ArrowLeft size={14} /> Back
      </button>
      <button onClick={onNext} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
        {loading ? 'Please wait…' : <>{nextLabel} <ArrowRight size={15} /></>}
      </button>
    </div>
  );
}

function PriceLine({ label, amount, muted = false, highlight = false, sub }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-700'}`}>{label}</span>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-medium shrink-0 ${highlight ? 'text-orange-600 font-bold' : muted ? 'text-gray-600' : 'text-gray-800'}`}>
        {formatINR(amount)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function BookingFlow() {
  const { poojaSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addPooja } = useCart();

  const [stepId, setStepId]  = useState(STEP_IDS.OVERVIEW);
  const [pooja,  setPooja]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState(false);

  // Rates from backend (commission %, gst %)
  const [rates, setRates] = useState({ commissionPercent: 0, gstPercent: 0 });

  const [linkedKits,  setLinkedKits]  = useState([]);
  const [kitsLoading, setKitsLoading] = useState(false);

  // Booking choices
  const [isUrgent, setIsUrgent] = useState(false);
  const [withKit,  setWithKit]  = useState(false);
  const [kitId,    setKitId]    = useState('');

  // Schedule + details
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [language,      setLanguage]      = useState('');
  const [userDetails,   setUserDetails]   = useState({
    name:        user?.name     || '',
    phone:       user?.phone    || '',
    email:       user?.email    || '',
    address:     '',
    pincode:     user?.pincode  || '',
    state:       user?.state    || '',
    city:        user?.city     || '',
    district:    user?.district || '',
    specialNote: '',
  });
  const [errors, setErrors] = useState({});

  // Kit view-items modal
  const [viewItemsKit, setViewItemsKit] = useState(null);

  // ── Load pooja ───────────────────────────────────────────────
  useEffect(() => {
    API.get(`/poojas/${poojaSlug}`)
      .then(({ data }) => {
        setPooja(data.pooja);
        if (data.pooja?.languages?.length === 1) setLanguage(data.pooja.languages[0]);
      })
      .catch(() => toast.error('Pooja not found'))
      .finally(() => setLoading(false));
  }, [poojaSlug]);

  // ── Load pricing rates + kits ────────────────────────────────
  useEffect(() => {
    if (!pooja?._id) return;

    API.get(`/bookings/pricing-preview?poojaId=${pooja._id}`)
      .then(({ data }) => {
        if (data.pricing) {
          setRates({
            commissionPercent: data.pricing.commissionPercent || 0,
            gstPercent:        data.pricing.gstPercent        || 0,
          });
        }
      }).catch(() => {});

    setKitsLoading(true);
    API.get(`/marketplace/kits/by-pooja/${pooja._id}`)
      .then(({ data }) => setLinkedKits(data.kits || []))
      .catch(() => {})
      .finally(() => setKitsLoading(false));
  }, [pooja?._id]);

  const hasKits     = linkedKits.length > 0;
  const selectedKit = linkedKits.find((k) => k._id === kitId) || null;

  // Derived pricing
  const kitPrice = withKit && !isUrgent && selectedKit ? (selectedKit.discountPrice || 0) : 0;
  const pricing  = calculatePrice({
    poojaPrice:        pooja?.price || 0,
    kitPrice,
    commissionPercent: rates.commissionPercent,
    gstPercent:        rates.gstPercent,
  });

  // Active step list (dynamic based on choices)
  const activeSteps = buildActiveSteps(isUrgent, withKit, hasKits);
  const currentIdx  = activeSteps.indexOf(stepId);

  const goNext = useCallback(() => {
    const next = activeSteps[currentIdx + 1];
    if (next) { setStepId(next); window.scrollTo({ top:0, behavior:'smooth' }); }
  }, [activeSteps, currentIdx]);

  const goBack = useCallback(() => {
    const prev = activeSteps[currentIdx - 1];
    if (prev) { setStepId(prev); window.scrollTo({ top:0, behavior:'smooth' }); }
  }, [activeSteps, currentIdx]);

  // ── Validation ───────────────────────────────────────────────
  const validate = useCallback(() => {
    const e = {};
    if (stepId === STEP_IDS.KIT_SELECT && withKit && !kitId) e.kitId = 'Please select a kit';
    if (stepId === STEP_IDS.DATE && !scheduledDate)           e.scheduledDate = 'Please select a date';
    if (stepId === STEP_IDS.TIME && !scheduledTime)           e.scheduledTime = 'Please select a time slot';
    if (stepId === STEP_IDS.LANGUAGE && pooja?.languages?.length > 0 && !language) e.language = 'Please select a language';
    if (stepId === STEP_IDS.DETAILS) {
      if (!userDetails.name)    e.name    = 'Required';
      if (!userDetails.phone)   e.phone   = 'Required';
      else if (!/^[6-9]\d{9}$/.test(userDetails.phone)) e.phone = 'Invalid phone number';
      if (!userDetails.address) e.address = 'Required';
      if (!userDetails.pincode) e.pincode = 'Required';
    }
    return e;
  }, [stepId, withKit, kitId, scheduledDate, scheduledTime, language, pooja, userDetails]);

  const handleNext = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    goNext();
  };

  // ── Urgent toggle — reset kit choices ────────────────────────
  const handleSetUrgent = (urgent) => {
    setIsUrgent(urgent);
    if (urgent) { setWithKit(false); setKitId(''); }
  };

  // ── Pay now ──────────────────────────────────────────────────
  const handlePay = async () => {
    setPaying(true);
    try {
      const { data } = await API.post('/bookings/create-phonepe-order', {
        poojaId:       pooja._id,
        scheduledDate,
        scheduledTime: scheduledTime || '10:00',
        language:      language || (pooja?.languages?.[0] || 'Hindi'),
        specialNote:   userDetails.specialNote,
        withKit:       withKit && !isUrgent,
        kitId:         withKit && !isUrgent && kitId ? kitId : undefined,
        isUrgent,
        userDetails: {
          name:     userDetails.name,
          phone:    userDetails.phone,
          email:    userDetails.email,
          address:  userDetails.address,
          pincode:  userDetails.pincode,
          state:    userDetails.state,
          city:     userDetails.city,
          district: userDetails.district,
        },
      });
      window.location.href = data.redirectUrl;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed. Please try again.');
      setPaying(false);
    }
  };

  // ── Add to cart ──────────────────────────────────────────────
  const handleAddToCart = () => {
    addPooja({
      pooja,
      kit: selectedKit,
      bookingDetails: {
        scheduledDate,
        scheduledTime: scheduledTime || '10:00',
        language: language || (pooja?.languages?.[0] || 'Hindi'),
        specialNote: userDetails.specialNote,
        withKit: withKit && !isUrgent,
        kitId:   withKit && !isUrgent ? kitId : null,
        isUrgent,
        userDetails: { ...userDetails },
      },
      pricing,
    });
    toast.success(`${pooja.name} added to cart!`);
    navigate('/cart');
  };

  // ── Loading / not found ──────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'#FAF6EE' }}>
      <div className="text-center">
        <div className="text-5xl mb-4" style={{ animation:'bounce 1s infinite' }}>🪔</div>
        <p className="text-gray-400 text-sm">Loading ceremony details…</p>
      </div>
    </div>
  );
  if (!pooja) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'#FAF6EE' }}>
      <p className="text-gray-500">Pooja not found</p>
    </div>
  );

  // ── Progress bar steps (hide overview from bar) ──────────────
  const barSteps = activeSteps.filter(s => s !== STEP_IDS.OVERVIEW);
  const barIdx   = barSteps.indexOf(stepId);

  return (
    <div className="min-h-screen py-8" style={{ background:'#FAF6EE' }}>
      <div className="max-w-xl mx-auto px-4">

        {/* ── Progress bar (hidden on overview) ──────────────── */}
        {stepId !== STEP_IDS.OVERVIEW && (
          <div className="mb-8">
            <div className="flex items-center justify-between relative">
              <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 z-0">
                <div className="h-full transition-all duration-500"
                  style={{ background:'linear-gradient(90deg,#FF6B00,#ff9020)', width: barIdx <= 0 ? '0%' : `${(barIdx / (barSteps.length - 1)) * 100}%` }} />
              </div>
              {barSteps.map((sid, idx) => {
                const meta = STEP_META[sid];
                const done = idx < barIdx;
                const curr = idx === barIdx;
                return (
                  <div key={sid} className="flex flex-col items-center gap-1.5 relative z-10">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base transition-all duration-300 ${done ? 'bg-orange-500' : curr ? '' : 'bg-white border-2 border-gray-200'}`}
                      style={curr ? { background:'linear-gradient(135deg,#FF6B00,#ff9020)' } : {}}>
                      {done ? <CheckCircle size={18} className="text-white" /> : <span className="text-sm">{meta.icon}</span>}
                    </div>
                    <p className={`text-[10px] font-bold hidden sm:block ${idx <= barIdx ? 'text-orange-600' : 'text-gray-400'}`}>{meta.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP: POOJA OVERVIEW                                   */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.OVERVIEW && (
          <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
            {pooja.image ? (
              <div className="h-52 overflow-hidden relative">
                <img src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/${pooja.image}`} alt={pooja.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5">
                  <h2 className="font-bold text-white text-2xl" style={{ fontFamily:"'Cormorant Garamond',serif" }}>{pooja.name}</h2>
                  {formatDuration(pooja) && (
                    <div className="flex items-center gap-1.5 mt-1 text-white/70 text-sm">
                      <Clock size={12} /><span>{formatDuration(pooja)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-36 flex items-center justify-center relative overflow-hidden"
                style={{ background:'linear-gradient(135deg,#FF6B00,#ff9020)' }}>
                <span className="text-6xl relative z-10">🪔</span>
              </div>
            )}

            <div className="p-6">
              {!pooja.image && (
                <h2 className="font-bold text-gray-900 text-2xl mb-1" style={{ fontFamily:"'Cormorant Garamond',serif" }}>{pooja.name}</h2>
              )}
              {pooja.shortDesc && <p className="text-gray-500 text-sm leading-relaxed mt-2">{pooja.shortDesc}</p>}
              {pooja.description && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500 leading-relaxed">{pooja.description}</p>
                </div>
              )}

              {pooja.benefits?.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-green-50 border border-green-100">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">Spiritual Benefits</p>
                  <ul className="space-y-1">
                    {pooja.benefits.map((b, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-center gap-2">
                        <CheckCircle size={12} className="text-green-500 shrink-0" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Price + CTA */}
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">Starting from</p>
                  <span className="text-3xl font-bold text-orange-600" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
                    {formatINR(pricing.poojaAmount + pricing.platformFee)}
                  </span>
                  {pricing.platformFee > 0 && (
                    <p className="text-[11px] text-gray-400 mt-0.5">incl. platform fee · kit extra if selected</p>
                  )}
                </div>
                <button onClick={() => setStepId(STEP_IDS.TYPE)} className="btn-primary inline-flex items-center gap-2 px-6 py-3">
                  Book Now <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 1: BOOKING TYPE                                   */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.TYPE && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="⚡" title="Select Booking Type" desc="Choose how soon you need this ceremony" />

            <div className="grid grid-cols-1 gap-4">
              {/* Normal */}
              <div
                onClick={() => handleSetUrgent(false)}
                className={`rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 ${
                  !isUrgent ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200 hover:bg-orange-50/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${!isUrgent ? 'bg-orange-100' : 'bg-gray-100'}`}>
                    📅
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-base ${!isUrgent ? 'text-orange-700' : 'text-gray-700'}`}>Normal Booking</p>
                      {!isUrgent && <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-semibold">Selected</span>}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Schedule at your preferred date and time. Samagri kit delivery available.</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {['Scheduled ceremony','Kit delivery available','Full pandit selection'].map(f => (
                        <span key={f} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${!isUrgent ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
                    {!isUrgent && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              </div>

              {/* Urgent */}
              <div
                onClick={() => handleSetUrgent(true)}
                className={`rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200 ${
                  isUrgent ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-red-200 hover:bg-red-50/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isUrgent ? 'bg-red-100' : 'bg-gray-100'}`}>
                    <Zap size={22} className={isUrgent ? 'text-red-500' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-base ${isUrgent ? 'text-red-700' : 'text-gray-700'}`}>Urgent Booking</p>
                      {isUrgent && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-semibold">Selected</span>}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Need a pandit immediately or within a few hours. Samagri kit not available for urgent bookings.</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {['Quick pandit dispatch','Same-day ceremony','No kit delivery'].map(f => (
                        <span key={f} className={`text-[10px] border px-2 py-0.5 rounded-full ${f === 'No kit delivery' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{f}</span>
                      ))}
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${isUrgent ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                    {isUrgent && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              </div>
            </div>

            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 2: KIT PREFERENCE (only for Normal)              */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.KIT_PREF && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="📦" title="Samagri Kit" desc="Would you like to add a kit for this ceremony?" />

            <div className="grid grid-cols-2 gap-4">
              {/* Without kit */}
              <div
                onClick={() => { setWithKit(false); setKitId(''); }}
                className={`rounded-2xl border-2 p-4 cursor-pointer transition-all text-center ${
                  !withKit ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200'
                }`}
              >
                <div className="text-3xl mb-2">🙏</div>
                <p className={`font-bold text-sm ${!withKit ? 'text-orange-700' : 'text-gray-700'}`}>Without Kit</p>
                <p className="text-[11px] text-gray-400 mt-1">I'll arrange samagri myself</p>
              </div>

              {/* With kit */}
              <div
                onClick={() => setWithKit(true)}
                className={`rounded-2xl border-2 p-4 cursor-pointer transition-all text-center relative ${
                  withKit ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200'
                }`}
              >
                <div className="text-3xl mb-2">📦</div>
                <p className={`font-bold text-sm ${withKit ? 'text-orange-700' : 'text-gray-700'}`}>With Kit</p>
                <p className="text-[11px] text-gray-400 mt-1">Delivered to your address</p>
                <span className="absolute -top-2 -right-2 text-[9px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">CONVENIENT</span>
              </div>
            </div>

            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 3: KIT SELECTION                                  */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.KIT_SELECT && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="🛍️" title="Select a Samagri Kit" desc="Choose the right kit for your ceremony" />

            {kitsLoading ? (
              <div className="space-y-4">
                {[1,2].map(i => <div key={i} className="h-40 bg-gray-100 animate-pulse rounded-2xl" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {linkedKits.map((kit) => {
                  const items     = kit.items?.map(it => it.productId?.name).filter(Boolean) || [];
                  const savings   = kitSavingsPct(kit.totalCost, kit.discountPrice);
                  const isSelected = kitId === kit._id;

                  return (
                    <div
                      key={kit._id}
                      onClick={() => { setKitId(kit._id); setErrors(e => ({...e, kitId:''})); }}
                      className={`rounded-2xl border-2 cursor-pointer transition-all duration-200 overflow-hidden ${
                        isSelected ? 'border-orange-400 shadow-md' : 'border-gray-200 hover:border-orange-200 hover:shadow-sm'
                      }`}
                    >
                      {/* Kit header */}
                      <div className={`px-5 py-4 ${isSelected ? 'bg-orange-50' : 'bg-white'}`}>
                        <div className="flex items-start gap-4">
                          {/* Kit image or icon */}
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-amber-50 shrink-0 flex items-center justify-center">
                            {kit.image
                              ? <img src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/${kit.image}`} alt={kit.name} className="w-full h-full object-cover" />
                              : <span className="text-3xl">📦</span>
                            }
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className={`font-bold text-base ${isSelected ? 'text-orange-800' : 'text-gray-800'}`}>{kit.name}</p>
                                {kit.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{kit.description}</p>}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-orange-600 text-lg" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
                                  {formatINR(kit.discountPrice || 0)}
                                </p>
                                {savings > 0 && (
                                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">{savings}% off</span>
                                )}
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-3 mt-2">
                              <div className="flex items-center gap-1 text-[11px] text-gray-500">
                                <Package size={11} /><span>{items.length} items</span>
                              </div>
                              {savings > 0 && (
                                <div className="flex items-center gap-1 text-[11px] text-green-600">
                                  <Tag size={11} /><span>Save {formatINR(kit.totalCost - kit.discountPrice)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Footer actions */}
                      <div className={`px-5 py-3 border-t flex items-center justify-between ${isSelected ? 'border-orange-200 bg-orange-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewItemsKit(kit); }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Eye size={13} /> View Items
                        </button>

                        {isSelected ? (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
                            <CheckCircle size={13} /> Kit Selected
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setKitId(kit._id); setErrors(e => ({...e, kitId:''})); }}
                            className="text-xs font-semibold text-orange-600 border border-orange-300 px-3 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                          >
                            Select Kit
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {errors.kitId && <p className="text-red-500 text-xs mt-3">{errors.kitId}</p>}
            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 4: DATE                                           */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.DATE && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="📅" title="Select Ceremony Date" desc="Choose your preferred date" />
            <CalendarPicker value={scheduledDate} onChange={d => { setScheduledDate(d); setErrors(e => ({...e, scheduledDate:''})); }} />
            {errors.scheduledDate && <p className="text-red-500 text-xs mt-2">{errors.scheduledDate}</p>}
            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 5: TIME                                           */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.TIME && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="🕐" title="Select Start Time" desc="Choose when the ceremony should begin" />

            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot}
                  onClick={() => { setScheduledTime(slot); setErrors(e => ({...e, scheduledTime:''})); }}
                  className={`py-2.5 px-2 rounded-xl text-sm font-semibold transition-all ${
                    scheduledTime === slot
                      ? 'text-white shadow-md'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700'
                  }`}
                  style={scheduledTime === slot ? { background:'linear-gradient(135deg,#FF6B00,#ff9020)' } : {}}
                >
                  {fmtTime(slot)}
                </button>
              ))}
            </div>

            {errors.scheduledTime && <p className="text-red-500 text-xs mt-3">{errors.scheduledTime}</p>}

            {scheduledDate && scheduledTime && (
              <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2">
                <CheckCircle size={14} className="text-green-600 shrink-0" />
                <p className="text-xs text-green-700 font-medium">
                  {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })} at {fmtTime(scheduledTime)}
                </p>
              </div>
            )}

            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 6: LANGUAGE                                       */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.LANGUAGE && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="🌐" title="Select Language" desc="Language for mantras and ceremony" />

            {pooja.languages?.length > 0 ? (
              <div className="space-y-2">
                {pooja.languages.map(lang => (
                  <div
                    key={lang}
                    onClick={() => { setLanguage(lang); setErrors(e => ({...e, language:''})); }}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      language === lang ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-200 hover:bg-orange-50/40'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${language === lang ? 'border-orange-500' : 'border-gray-300'}`}>
                      {language === lang && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                    </div>
                    <span className={`font-semibold text-sm ${language === lang ? 'text-orange-700' : 'text-gray-700'}`}>{lang}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-700">The pandit will conduct the ceremony in your preferred language.</p>
              </div>
            )}

            {errors.language && <p className="text-red-500 text-xs mt-3">{errors.language}</p>}
            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 7: USER DETAILS                                   */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.DETAILS && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="📋" title="Your Details" desc="Ceremony location and contact info" />

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input className={`input ${errors.name ? 'border-red-400' : ''}`} value={userDetails.name}
                    onChange={e => { setUserDetails(p => ({...p, name: e.target.value})); setErrors(p => ({...p, name:''})); }}
                    placeholder="Your full name" />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input className={`input ${errors.phone ? 'border-red-400' : ''}`} value={userDetails.phone} maxLength={10}
                    placeholder="10-digit mobile"
                    onChange={e => { const v = e.target.value.replace(/\D/,'').slice(0,10); setUserDetails(p => ({...p, phone: v})); setErrors(p => ({...p, phone:''})); }} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>
              </div>

              <div>
                <label className="label">Ceremony Address *</label>
                <textarea rows={2} className={`input resize-none ${errors.address ? 'border-red-400' : ''}`} value={userDetails.address}
                  onChange={e => { setUserDetails(p => ({...p, address: e.target.value})); setErrors(p => ({...p, address:''})); }}
                  placeholder="House no., street, area, landmark…" />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
              </div>

              <div>
                <label className="label">Pincode *</label>
                <PincodeInput
                  value={userDetails.pincode}
                  onChange={v => setUserDetails(p => ({...p, pincode: v}))}
                  onFill={({ state, city, district }) => setUserDetails(p => ({...p, state, city, district}))}
                  error={errors.pincode}
                />
              </div>

              {userDetails.state && (
                <div className="grid grid-cols-3 gap-2">
                  {[['state','State'],['city','City'],['district','District']].map(([f,l]) => (
                    <div key={f}>
                      <label className="label text-xs">{l}</label>
                      <input className="input bg-gray-50 text-sm" value={userDetails[f]}
                        onChange={e => setUserDetails(p => ({...p, [f]: e.target.value}))} />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="label">Special Note <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                <textarea rows={2} className="input resize-none" value={userDetails.specialNote}
                  onChange={e => setUserDetails(p => ({...p, specialNote: e.target.value}))}
                  placeholder="Any special requirements for the pandit…" />
              </div>
            </div>

            <NavButtons onBack={goBack} onNext={handleNext} />
          </div>
        )}

        {/* ────────────────────────────────────────────────────── */}
        {/* STEP 8: REVIEW & PAY                                   */}
        {/* ────────────────────────────────────────────────────── */}
        {stepId === STEP_IDS.REVIEW && (
          <div className="bg-white rounded-3xl shadow-lg p-6">
            <StepHeader icon="✨" title="Review & Pay" desc="Confirm your ceremony booking" />

            {/* Pooja summary */}
            <div className="rounded-2xl p-4 border border-orange-100 mb-4" style={{ background:'linear-gradient(135deg,#fff8f0,#FAF6EE)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-orange-100 shrink-0">
                  {pooja.image
                    ? <img src={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/${pooja.image}`} alt={pooja.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xl">🪔</div>
                  }
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{pooja.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isUrgent && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><Zap size={9}/>Urgent</span>}
                    {formatDuration(pooja) && <p className="text-xs text-gray-400">{formatDuration(pooja)}</p>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                {[
                  ['Date',     scheduledDate ? new Date(scheduledDate+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : ''],
                  ['Time',     scheduledTime ? fmtTime(scheduledTime) : ''],
                  ['Language', language || ''],
                  ['Address',  userDetails.address ? `${userDetails.address}${userDetails.city ? ', '+userDetails.city : ''}` : ''],
                ].filter(([,v]) => v).map(([l,v]) => (
                  <div key={l}><span className="text-gray-400">{l}: </span><span className="text-gray-700 font-medium">{v}</span></div>
                ))}
              </div>
            </div>

            {/* Kit summary */}
            {withKit && selectedKit && !isUrgent && (
              <div className="mb-4 rounded-2xl p-3 border border-amber-200 bg-amber-50 flex items-center gap-3">
                <Package size={16} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">{selectedKit.name}</p>
                  <p className="text-xs text-amber-600">Includes {selectedKit.items?.length || 0} items</p>
                </div>
                <span className="font-bold text-amber-700 text-sm shrink-0">{formatINR(selectedKit.discountPrice || 0)}</span>
              </div>
            )}

            {/* Price breakdown */}
            <div className="rounded-2xl border border-orange-200 overflow-hidden mb-4">
              <div className="bg-orange-50 px-4 py-2.5 border-b border-orange-200">
                <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">Price Breakdown</p>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                <PriceLine
                  label="Pooja Service"
                  amount={pricing.poojaAmount}
                  sub="Religious services are tax-exempt"
                />
                {pricing.platformFee > 0 && (
                  <PriceLine
                    label={`Platform Fee (${rates.commissionPercent}%)`}
                    amount={pricing.platformFee}
                    muted
                    sub="Convenience fee"
                  />
                )}
                {pricing.kitAmount > 0 && (
                  <PriceLine
                    label={`Samagri Kit — ${selectedKit?.name}`}
                    amount={pricing.kitAmount}
                    muted
                    sub="Delivered to ceremony address"
                  />
                )}
                {pricing.taxAmount > 0 && (
                  <PriceLine
                    label={`Product Tax (${rates.gstPercent}% GST on kit)`}
                    amount={pricing.taxAmount}
                    muted
                    sub="Tax on kit only · pooja is tax-exempt"
                  />
                )}

                <div className="border-t border-orange-100 pt-2.5 flex justify-between items-center">
                  <span className="font-bold text-gray-800 text-sm">Grand Total</span>
                  <span className="font-bold text-orange-600 text-2xl" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
                    {formatINR(pricing.grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Trust bar */}
            <div className="flex items-center gap-2.5 py-2.5 px-3.5 rounded-xl border border-blue-100 bg-blue-50 mb-4">
              <Shield size={13} className="text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700">Secure payment via PhonePe · UPI, Cards, Net Banking supported</p>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <button onClick={goBack} className="btn-outline flex items-center gap-2 shrink-0">
                  <ArrowLeft size={14} /> Edit
                </button>
                <button onClick={handlePay} disabled={paying} className="btn-primary flex-1 py-3.5 text-base">
                  {paying ? 'Processing…' : `Pay ${formatINR(pricing.grandTotal)} 🙏`}
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-orange-300 text-orange-700 font-semibold text-sm hover:bg-orange-50 transition-colors"
              >
                <ShoppingCart size={16} /> Add to Cart · Continue Shopping
              </button>
            </div>
          </div>
        )}

        {/* Reassurance footer */}
        {stepId !== STEP_IDS.OVERVIEW && (
          <div className="mt-6 flex items-center justify-center gap-5 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><CheckCircle size={11} className="text-orange-400" /> Verified Pandit</span>
            <span className="flex items-center gap-1.5"><Shield size={11} className="text-orange-400" /> Secure Payment</span>
            <span className="flex items-center gap-1.5"><Sparkles size={11} className="text-orange-400" /> 4.9★ Rated</span>
          </div>
        )}
      </div>

      {/* Kit items modal */}
      {viewItemsKit && <KitItemsModal kit={viewItemsKit} onClose={() => setViewItemsKit(null)} />}
    </div>
  );
}
