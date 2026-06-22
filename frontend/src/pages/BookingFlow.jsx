import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, CheckCircle, ArrowRight, ArrowLeft, Shield, Sparkles, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PincodeInput from '../components/shared/PincodeInput';
import { formatDuration } from '../utils/durationFormatter';

// ── Inline Calendar ───────────────────────────────────────────

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function CalendarPicker({ value, onChange }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const selectedDate = value ? new Date(value + 'T00:00:00') : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const firstDay  = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells     = Array.from({ length: firstDay + daysInMon }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  const isDisabled = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    return d < today;
  };
  const isSelected = (day) => {
    if (!selectedDate || !day) return false;
    return selectedDate.getFullYear() === viewYear &&
           selectedDate.getMonth()    === viewMonth &&
           selectedDate.getDate()     === day;
  };
  const isToday = (day) => {
    return today.getFullYear() === viewYear &&
           today.getMonth()    === viewMonth &&
           today.getDate()     === day;
  };

  const handleSelect = (day) => {
    if (!day || isDisabled(day)) return;
    const d = new Date(viewYear, viewMonth, day);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--t-border)', background: 'white' }}>
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--t-border)', background: '#fff8f0' }}>
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-saffron-100 transition-colors">
          <ChevronLeft size={16} className="text-saffron-600" />
        </button>
        <span className="font-semibold text-sm font-sans" style={{ color: '#1B1F3B' }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-saffron-100 transition-colors">
          <ChevronRight size={16} className="text-saffron-600" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--t-border)' }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-2 font-sans">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 p-2 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dis  = isDisabled(day);
          const sel  = isSelected(day);
          const tod  = isToday(day);
          return (
            <button
              key={i}
              onClick={() => handleSelect(day)}
              disabled={dis}
              className={`w-full aspect-square rounded-xl text-xs font-semibold font-sans transition-all flex items-center justify-center
                ${dis  ? 'text-gray-200 cursor-not-allowed'
                : sel  ? 'text-white shadow-md'
                : tod  ? 'border-2 text-saffron-600 bg-saffron-50'
                : 'text-gray-700 hover:bg-saffron-50 hover:text-saffron-700'}
              `}
              style={sel ? { background: 'linear-gradient(135deg, #FF6B00, #ff9020)', borderColor: 'transparent' }
                         : tod ? { borderColor: '#FF6B00' } : {}}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      {value && (
        <div className="px-4 py-2.5 border-t text-center font-sans text-sm font-medium text-saffron-700" style={{ borderColor: 'var(--t-border)', background: '#fff8f0' }}>
          Selected: {new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}

// ── Step Definitions (dynamic — kit step only when kits exist) ─

function buildSteps(hasKits) {
  const base = [
    { id: 0, icon: '🙏', label: 'Pooja',    desc: 'Review details'   },
    { id: 1, icon: '🌐', label: 'Language',  desc: 'Choose language'  },
    { id: 2, icon: '📅', label: 'Date',      desc: 'Pick a date'      },
    { id: 3, icon: '📋', label: 'Details',   desc: 'Your information' },
  ];
  if (hasKits) base.push({ id: 4, icon: '📦', label: 'Kit',      desc: 'Samagri kit'     });
  base.push(     { id: hasKits ? 5 : 4, icon: '✨', label: 'Review', desc: 'Pay & confirm' });
  return base;
}

// ── Main Component ────────────────────────────────────────────

export default function BookingFlow() {
  const { poojaSlug } = useParams();
  const { user }      = useAuth();

  const [step,    setStep]    = useState(0);
  const [pooja,   setPooja]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState(false);

  const [pricing,        setPricing]        = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [linkedKits,     setLinkedKits]     = useState([]);
  const [kitsLoading,    setKitsLoading]    = useState(false);

  const [details, setDetails] = useState({
    name:          user?.name     || '',
    phone:         user?.phone    || '',
    email:         user?.email    || '',
    address:       '',
    pincode:       user?.pincode  || '',
    state:         user?.state    || '',
    city:          user?.city     || '',
    district:      user?.district || '',
    scheduledDate: '',
    scheduledTime: '',
    language:      '',
    specialNote:   '',
    withKit:       false,
    kitId:         '',
  });
  const [errors, setErrors] = useState({});

  const set = (field) => (e) => {
    setDetails((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  // ── Load pooja ───────────────────────────────────────────────
  useEffect(() => {
    API.get(`/poojas/${poojaSlug}`)
      .then(({ data }) => {
        setPooja(data.pooja);
        // Pre-select first language if only one
        if (data.pooja?.languages?.length === 1) {
          setDetails((prev) => ({ ...prev, language: data.pooja.languages[0] }));
        }
      })
      .catch(() => toast.error('Pooja not found'))
      .finally(() => setLoading(false));
  }, [poojaSlug]);

  // ── Load pricing + kits once pooja is known ──────────────────
  useEffect(() => {
    if (!pooja?._id) return;

    setPricingLoading(true);
    API.get(`/bookings/pricing-preview?poojaId=${pooja._id}`)
      .then(({ data }) => setPricing(data.pricing || null))   // ← data.pricing (not data)
      .catch(() => {})
      .finally(() => setPricingLoading(false));

    setKitsLoading(true);
    API.get(`/marketplace/kits/by-pooja/${pooja._id}`)
      .then(({ data }) => setLinkedKits(data.kits || []))
      .catch(() => {})
      .finally(() => setKitsLoading(false));
  }, [pooja?._id]);

  const hasKits   = linkedKits.length > 0;
  const STEPS     = buildSteps(hasKits);
  const lastStep  = STEPS[STEPS.length - 1].id;
  const kitStep   = hasKits ? 4 : -1;
  const reviewStep = hasKits ? 5 : 4;

  const selectedKit = linkedKits.find((k) => k._id === details.kitId);
  const kitPrice    = details.withKit && selectedKit ? (selectedKit.discountPrice || 0) : 0;

  const baseAmount       = pricing?.baseAmount       ?? pooja?.price ?? 0;
  const commissionAmount = pricing?.commissionAmount ?? 0;
  const gstAmount        = pricing?.gstAmount        ?? 0;
  const finalAmount      = (pricing?.finalAmount ?? pooja?.price ?? 0) + kitPrice;

  // ── Validation ───────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (step === 1 && !details.language && pooja?.languages?.length > 0) e.language = 'Please select a language';
    if (step === 2 && !details.scheduledDate) e.scheduledDate = 'Please select a date';
    if (step === 3) {
      if (!details.name)    e.name    = 'Required';
      if (!details.phone)   e.phone   = 'Required';
      else if (!/^[6-9]\d{9}$/.test(details.phone)) e.phone = 'Invalid phone number';
      if (!details.address) e.address = 'Required';
      if (!details.pincode) e.pincode = 'Required';
    }
    if (step === kitStep && details.withKit && !details.kitId) {
      e.kitId = 'Please select a kit';
    }
    return e;
  };

  const handleNext = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    // Skip time input if not set, default to a reasonable time
    if (step === 2 && !details.scheduledTime) {
      setDetails((prev) => ({ ...prev, scheduledTime: '10:00' }));
    }
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePay = async () => {
    setPaying(true);
    try {
      const { data } = await API.post('/bookings/create-phonepe-order', {
        poojaId:       pooja._id,
        scheduledDate: details.scheduledDate,
        scheduledTime: details.scheduledTime || '10:00',
        language:      details.language,
        specialNote:   details.specialNote,
        withKit:       details.withKit,
        kitId:         details.withKit && details.kitId ? details.kitId : undefined,
        userDetails: {
          name:     details.name,
          phone:    details.phone,
          email:    details.email,
          address:  details.address,
          pincode:  details.pincode,
          state:    details.state,
          city:     details.city,
          district: details.district,
        },
      });
      window.location.href = data.redirectUrl;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
      setPaying(false);
    }
  };

  // ── Loading / not found ───────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAF6EE' }}>
      <div className="text-center">
        <div className="text-5xl animate-float mb-4">🪔</div>
        <p className="text-gray-400 text-sm font-sans">Loading ceremony details...</p>
      </div>
    </div>
  );

  if (!pooja) return (
    <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: '#FAF6EE' }}>
      <p className="text-gray-500">Pooja not found</p>
    </div>
  );

  const currentStepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen py-8 sacred-pattern" style={{ background: '#FAF6EE' }}>
      <div className="max-w-xl mx-auto px-4">

        {/* ── Step progress bar ──────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-[1.25rem] left-0 right-0 h-0.5 bg-gray-200 z-0">
              <div
                className="h-full transition-all duration-500"
                style={{
                  background:  'linear-gradient(90deg, #FF6B00, #ff9020)',
                  width:       `${currentStepIdx === 0 ? 0 : (currentStepIdx / (STEPS.length - 1)) * 100}%`,
                }}
              />
            </div>
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex flex-col items-center gap-1.5 relative z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base transition-all duration-300
                  ${idx < currentStepIdx ? 'bg-saffron-500'
                  : idx === currentStepIdx ? '' : 'bg-white border-2 border-gray-200'}`}
                  style={idx === currentStepIdx ? { background: 'linear-gradient(135deg, #FF6B00, #ff9020)' } : {}}
                >
                  {idx < currentStepIdx
                    ? <CheckCircle size={18} className="text-white" />
                    : <span className="text-sm">{s.icon}</span>
                  }
                </div>
                <p className={`text-[10px] font-bold font-sans ${idx <= currentStepIdx ? 'text-saffron-600' : 'text-gray-400'}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── STEP 0: Pooja Overview ──────────────────────────── */}
        {step === 0 && (
          <div className="bg-white rounded-3xl shadow-premium overflow-hidden animate-fade-in">
            {pooja.image ? (
              <div className="h-44 overflow-hidden relative">
                <img src={`http://localhost:5000/${pooja.image}`} alt={pooja.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5">
                  <h2 className="font-display font-bold text-white text-2xl" style={{ letterSpacing: '-0.02em' }}>{pooja.name}</h2>
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #FF6B00, #ff9020)' }}>
                <div className="absolute inset-0 sacred-pattern opacity-20" />
                <span className="text-5xl relative z-10">🪔</span>
              </div>
            )}

            <div className="p-6">
              {!pooja.image && (
                <h2 className="font-display font-bold text-gray-900 text-2xl mb-1" style={{ letterSpacing: '-0.02em' }}>{pooja.name}</h2>
              )}
              {pooja.shortDesc && (
                <p className="text-gray-500 text-sm leading-relaxed mt-2 font-sans">{pooja.shortDesc}</p>
              )}
              {formatDuration(pooja) && (
                <div className="flex items-center gap-2 mt-2 text-gray-400 text-sm font-sans">
                  <Clock size={13} className="text-saffron-400" /><span>{formatDuration(pooja)}</span>
                </div>
              )}
              {pooja.description && (
                <div className="mt-4">
                  <h4 className="font-semibold text-gray-800 text-sm mb-1.5 font-sans">About this Ceremony</h4>
                  <p className="text-sm text-gray-500 leading-relaxed font-sans">{pooja.description}</p>
                </div>
              )}
              {pooja.benefits?.length > 0 && (
                <div className="mt-4 p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50">
                  <h4 className="font-semibold text-emerald-700 text-xs mb-2 font-sans uppercase tracking-wide">Spiritual Benefits</h4>
                  <ul className="space-y-1">
                    {pooja.benefits.map((b, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-center gap-2 font-sans">
                        <CheckCircle size={12} className="text-emerald-500 shrink-0" />{b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Price + CTA */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 font-sans">Starting from</p>
                  {pricingLoading ? (
                    <div className="h-8 w-24 bg-gray-100 animate-pulse rounded mt-0.5" />
                  ) : (
                    <span className="font-display text-3xl font-bold text-saffron-600" style={{ letterSpacing: '-0.02em' }}>
                      ₹{(pricing?.baseAmount ?? pooja.price).toLocaleString('en-IN')}
                    </span>
                  )}
                  {pricing && pricing.commissionAmount > 0 && (
                    <p className="text-[11px] text-gray-400 font-sans mt-0.5">+ platform fee & taxes</p>
                  )}
                </div>
                <button onClick={handleNext} className="btn-primary inline-flex items-center gap-2 px-6 py-3 font-sans">
                  Book Now <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: Language Selection ──────────────────────── */}
        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-premium p-6 animate-fade-in">
            <StepHeader icon="🌐" title="Select Language" desc="Choose the language for your ceremony" />

            {pooja.languages?.length > 0 ? (
              <div className="space-y-2 mt-5">
                {pooja.languages.map((lang) => (
                  <label key={lang}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      details.language === lang
                        ? 'border-saffron-400 bg-saffron-50'
                        : 'border-gray-200 hover:border-saffron-200 hover:bg-orange-50'
                    }`}
                    onClick={() => { setDetails((p) => ({...p, language: lang})); setErrors((p) => ({...p, language: ''})); }}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      details.language === lang ? 'border-saffron-500' : 'border-gray-300'
                    }`}>
                      {details.language === lang && (
                        <div className="w-2.5 h-2.5 rounded-full bg-saffron-500" />
                      )}
                    </div>
                    <span className={`font-semibold font-sans text-sm ${
                      details.language === lang ? 'text-saffron-700' : 'text-gray-700'
                    }`}>{lang}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="mt-5 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-700 font-sans">No specific language configured for this pooja. The pandit will communicate in your preferred language.</p>
              </div>
            )}

            {errors.language && <p className="text-red-500 text-xs mt-3 font-sans">{errors.language}</p>}

            <NavButtons onBack={handleBack} onNext={handleNext} />
          </div>
        )}

        {/* ── STEP 2: Date Selection ──────────────────────────── */}
        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-premium p-6 animate-fade-in">
            <StepHeader icon="📅" title="Select Ceremony Date" desc="Choose a date for your ceremony" />

            <div className="mt-5">
              <CalendarPicker
                value={details.scheduledDate}
                onChange={(d) => { setDetails((p) => ({...p, scheduledDate: d})); setErrors((p) => ({...p, scheduledDate: ''})); }}
              />
            </div>

            {/* Optional: preferred time */}
            <div className="mt-4">
              <label className="label text-xs text-gray-500">Preferred Start Time <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="time" className="input font-sans text-sm"
                value={details.scheduledTime}
                onChange={(e) => setDetails((p) => ({...p, scheduledTime: e.target.value}))} />
            </div>

            {errors.scheduledDate && <p className="text-red-500 text-xs mt-2 font-sans">{errors.scheduledDate}</p>}

            <NavButtons onBack={handleBack} onNext={handleNext} />
          </div>
        )}

        {/* ── STEP 3: Ceremony Details ────────────────────────── */}
        {step === 3 && (
          <div className="bg-white rounded-3xl shadow-premium p-6 animate-fade-in">
            <StepHeader icon="📋" title="Your Details" desc="Tell us about the ceremony location" />

            <div className="space-y-4 mt-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full Name *</label>
                  <input className={`input font-sans ${errors.name ? 'border-red-400' : ''}`}
                    value={details.name} onChange={set('name')} placeholder="Your full name" />
                  {errors.name && <p className="text-red-500 text-xs mt-1 font-sans">{errors.name}</p>}
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input className={`input font-sans ${errors.phone ? 'border-red-400' : ''}`}
                    value={details.phone} maxLength={10} placeholder="10-digit mobile"
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/,'').slice(0,10);
                      setDetails((p) => ({...p, phone: v}));
                      setErrors((p) => ({...p, phone: ''}));
                    }} />
                  {errors.phone && <p className="text-red-500 text-xs mt-1 font-sans">{errors.phone}</p>}
                </div>
              </div>

              <div>
                <label className="label">Ceremony Address *</label>
                <textarea rows={2} className={`input resize-none font-sans ${errors.address ? 'border-red-400' : ''}`}
                  value={details.address} onChange={set('address')}
                  placeholder="House no., street, area, landmark..." />
                {errors.address && <p className="text-red-500 text-xs mt-1 font-sans">{errors.address}</p>}
              </div>

              <div>
                <label className="label">Pincode *</label>
                <PincodeInput
                  value={details.pincode}
                  onChange={(v) => setDetails((p) => ({...p, pincode: v}))}
                  onFill={({ state, city, district }) => setDetails((p) => ({...p, state, city, district}))}
                  error={errors.pincode}
                />
              </div>

              {details.state && (
                <div className="grid grid-cols-3 gap-2">
                  {[['state','State'],['city','City'],['district','District']].map(([f,l]) => (
                    <div key={f}>
                      <label className="label text-xs">{l}</label>
                      <input className="input bg-gray-50 text-sm font-sans" value={details[f]} onChange={set(f)} />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="label">Special Note <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                <textarea rows={2} className="input resize-none font-sans"
                  value={details.specialNote} onChange={set('specialNote')}
                  placeholder="Any special requirements for the pandit..." />
              </div>
            </div>

            <NavButtons onBack={handleBack} onNext={handleNext} />
          </div>
        )}

        {/* ── STEP 4: Kit Selection (only when kits exist) ─────── */}
        {step === kitStep && hasKits && (
          <div className="bg-white rounded-3xl shadow-premium p-6 animate-fade-in">
            <StepHeader icon="📦" title="Samagri Kit" desc="Add a ready-to-use kit with all required items" />

            {/* Without/With Kit toggle */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { val: false, label: 'Without Kit', sub: 'Arrange samagri yourself', icon: '🙏' },
                { val: true,  label: 'With Kit',    sub: 'Delivered to your address', icon: '📦' },
              ].map(({ val, label, sub, icon }) => (
                <div
                  key={String(val)}
                  onClick={() => { setDetails((p) => ({...p, withKit: val, kitId: val ? p.kitId : ''})); setErrors((p) => ({...p, kitId: ''})); }}
                  className={`rounded-2xl border-2 p-4 cursor-pointer transition-all text-center ${
                    details.withKit === val
                      ? 'border-saffron-400 bg-saffron-50'
                      : 'border-gray-200 hover:border-saffron-200'
                  }`}
                >
                  <div className="text-2xl mb-1.5">{icon}</div>
                  <p className={`font-bold text-sm font-sans ${details.withKit === val ? 'text-saffron-700' : 'text-gray-700'}`}>{label}</p>
                  <p className="text-[11px] text-gray-400 font-sans mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* Kit cards (when With Kit selected) */}
            {details.withKit && (
              <div className="mt-5 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide font-sans">Select a kit</p>
                {kitsLoading ? (
                  <div className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
                ) : (
                  linkedKits.map((k) => {
                    const items = k.items?.map((it) => it.productId?.name).filter(Boolean) || [];
                    return (
                      <div
                        key={k._id}
                        onClick={() => { setDetails((p) => ({...p, kitId: k._id})); setErrors((p) => ({...p, kitId: ''})); }}
                        className={`rounded-2xl border-2 p-4 cursor-pointer transition-all ${
                          details.kitId === k._id
                            ? 'border-saffron-400 bg-saffron-50'
                            : 'border-gray-200 hover:border-saffron-200'
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-amber-50 shrink-0 flex items-center justify-center">
                            {k.image
                              ? <img src={`http://localhost:5000/${k.image}`} alt={k.name} className="w-full h-full object-cover" />
                              : <span className="text-2xl">📦</span>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold text-sm text-gray-800 font-sans">{k.name}</p>
                              <span className="font-display text-base font-bold text-saffron-600 shrink-0">
                                ₹{(k.discountPrice || 0).toLocaleString('en-IN')}
                              </span>
                            </div>
                            {k.description && (
                              <p className="text-xs text-gray-500 font-sans mt-0.5 line-clamp-2">{k.description}</p>
                            )}
                            {items.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {items.slice(0, 5).map((name, i) => (
                                  <span key={i} className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-sans">{name}</span>
                                ))}
                                {items.length > 5 && (
                                  <span className="text-[10px] text-gray-400 font-sans">+{items.length - 5} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        {details.kitId === k._id && (
                          <div className="mt-2 pt-2 border-t border-saffron-200 flex items-center gap-1.5">
                            <CheckCircle size={12} className="text-saffron-600" />
                            <span className="text-xs text-saffron-600 font-semibold font-sans">Selected</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {errors.kitId && <p className="text-red-500 text-xs font-sans">{errors.kitId}</p>}
              </div>
            )}

            <NavButtons onBack={handleBack} onNext={handleNext} />
          </div>
        )}

        {/* ── STEP 5 / 4: Review & Pay ────────────────────────── */}
        {step === reviewStep && (
          <div className="bg-white rounded-3xl shadow-premium p-6 animate-fade-in">
            <StepHeader icon="✨" title="Review & Pay" desc="Confirm your ceremony booking" />

            {/* Pooja summary card */}
            <div className="mt-5 rounded-2xl p-4 border border-saffron-100" style={{ background: 'linear-gradient(135deg, #fff8f0, #FAF6EE)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-saffron-100 shrink-0">
                  {pooja.image
                    ? <img src={`http://localhost:5000/${pooja.image}`} alt={pooja.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xl">🪔</div>
                  }
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm font-sans">{pooja.name}</p>
                  {formatDuration(pooja) && <p className="text-xs text-gray-400 font-sans">{formatDuration(pooja)}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs font-sans">
                {[
                  ['Language', details.language],
                  ['Date',     details.scheduledDate ? new Date(details.scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : ''],
                  ['Time',     details.scheduledTime || '10:00 AM'],
                  ['Address',  details.address ? `${details.address}${details.city ? ', ' + details.city : ''}` : ''],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <span className="text-gray-400">{label}: </span>
                    <span className="text-gray-700 font-medium">{value}</span>
                  </div>
                ))}
              </div>
              {details.specialNote && (
                <p className="text-xs text-gray-400 font-sans mt-2 pt-2 border-t border-saffron-100">
                  Note: <span className="text-gray-600">{details.specialNote}</span>
                </p>
              )}
            </div>

            {/* Kit summary */}
            {details.withKit && selectedKit && (
              <div className="mt-3 rounded-2xl p-3 border border-amber-200 bg-amber-50 flex items-center gap-3">
                <Package size={16} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800 font-sans">{selectedKit.name}</p>
                  {selectedKit.description && <p className="text-xs text-amber-600 font-sans truncate">{selectedKit.description}</p>}
                </div>
                <span className="font-bold text-amber-700 font-sans text-sm shrink-0">₹{(selectedKit.discountPrice || 0).toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Price breakdown */}
            <div className="mt-3 rounded-2xl border border-saffron-200 overflow-hidden">
              <div className="bg-saffron-50 px-4 py-2.5 border-b border-saffron-200">
                <p className="text-xs font-bold text-saffron-700 font-sans uppercase tracking-wide">Price Breakdown</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <PriceLine label="Base Ceremony Fee" amount={baseAmount} />
                {commissionAmount > 0 && (
                  <PriceLine label={`Platform Fee (${pricing.commissionPercent}%)`} amount={commissionAmount} muted />
                )}
                {gstAmount > 0 && (
                  <PriceLine label={`GST (${pricing.gstPercent}%)`} amount={gstAmount} muted />
                )}
                {kitPrice > 0 && (
                  <PriceLine label={`Kit — ${selectedKit?.name}`} amount={kitPrice} muted />
                )}
                <div className="border-t border-saffron-100 pt-2 flex justify-between items-center">
                  <span className="font-bold text-gray-800 font-sans text-sm">Grand Total</span>
                  <span className="font-display text-xl font-bold text-saffron-600">
                    ₹{finalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Trust bar */}
            <div className="mt-3 flex items-center gap-2.5 py-2.5 px-3.5 rounded-xl border border-blue-100 bg-blue-50">
              <Shield size={13} className="text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700 font-sans">Secure payment via PhonePe · UPI, Cards, Net Banking supported</p>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={handleBack} className="btn-outline flex items-center gap-2 font-sans">
                <ArrowLeft size={14} /> Edit
              </button>
              <button onClick={handlePay} disabled={paying} className="btn-primary flex-1 py-3.5 text-base font-sans">
                {paying ? 'Processing...' : `Pay ₹${finalAmount.toLocaleString('en-IN')} 🙏`}
              </button>
            </div>
          </div>
        )}

        {/* Reassurance footer */}
        <div className="mt-6 flex items-center justify-center gap-5 text-xs text-gray-400 font-sans">
          <span className="flex items-center gap-1.5"><CheckCircle size={11} className="text-saffron-400" /> Verified Pandit</span>
          <span className="flex items-center gap-1.5"><Shield size={11} className="text-saffron-400" /> Secure Payment</span>
          <span className="flex items-center gap-1.5"><Sparkles size={11} className="text-saffron-400" /> 4.9★ Rated</span>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────

function StepHeader({ icon, title, desc }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
        style={{ background: 'linear-gradient(135deg, #FF6B00, #ff9020)' }}>
        {icon}
      </div>
      <div>
        <h2 className="font-display font-bold text-gray-900 text-xl" style={{ letterSpacing: '-0.02em' }}>{title}</h2>
        <p className="text-xs text-gray-400 font-sans">{desc}</p>
      </div>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Continue', nextIcon }) {
  return (
    <div className="flex gap-3 mt-6">
      <button onClick={onBack} className="btn-outline flex items-center gap-2 font-sans">
        <ArrowLeft size={14} /> Back
      </button>
      <button onClick={onNext} className="btn-primary flex-1 flex items-center justify-center gap-2 font-sans">
        {nextLabel} {nextIcon || <ArrowRight size={15} />}
      </button>
    </div>
  );
}

function PriceLine({ label, amount, muted = false }) {
  return (
    <div className="flex justify-between items-center text-sm font-sans">
      <span className={muted ? 'text-gray-500' : 'text-gray-700'}>{label}</span>
      <span className={`font-medium ${muted ? 'text-gray-600' : 'text-gray-800'}`}>
        ₹{Number(amount || 0).toLocaleString('en-IN')}
      </span>
    </div>
  );
}
