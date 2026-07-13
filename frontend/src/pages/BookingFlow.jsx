import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Shield, Sparkles, BadgeCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth }  from '../context/AuthContext';
import { useCart }  from '../context/CartContext';
import { useCheckoutAuthGuard } from '../hooks/useCheckoutAuthGuard';
import { getPendingCheckout, clearPendingCheckout } from '../utils/pendingCheckout';
import ZutsavLoader from '../components/shared/ZutsavLoader';
import { calculatePrice } from '../utils/priceEngine';
import { getImageUrl } from '../config';

import { STEP_IDS, STEP_META, buildActiveSteps, getStoredReferralToken } from '../components/booking/constants';
import BookingStepper from '../components/booking/BookingStepper';
import BookingSummaryCard from '../components/booking/BookingSummaryCard';
import PoojaDetailsStep from '../components/booking/PoojaDetailsStep';
import BookingTypeStep from '../components/booking/BookingTypeStep';
import KitPreferenceStep from '../components/booking/KitPreferenceStep';
import KitSelectStep from '../components/booking/KitSelectStep';
import DateStep from '../components/booking/DateStep';
import TimeStep from '../components/booking/TimeStep';
import LanguageStep from '../components/booking/LanguageStep';
import DetailsStep from '../components/booking/DetailsStep';
import ReviewStep from '../components/booking/ReviewStep';
import KitItemsModal from '../components/booking/KitItemsModal';

export default function BookingFlow() {
  const { poojaSlug } = useParams();
  const [searchParams]   = useSearchParams();
  // URL param takes priority; sessionStorage is the fallback for flows where the
  // user navigated away from the referral URL (e.g. browsed pooja catalogue first
  // or was redirected through login/registration).
  const referralToken = searchParams.get('referralToken') || getStoredReferralToken();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addPooja } = useCart();
  const { requireAuth } = useCheckoutAuthGuard();

  const [stepId, setStepId]  = useState(STEP_IDS.OVERVIEW);
  const [pooja,  setPooja]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying,  setPaying]  = useState(false);
  const [resuming, setResuming] = useState(false); // restoring + auto-paying after a login/register checkpoint

  const [rates, setRates] = useState({ commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0 });
  const [partialConfig, setPartialConfig] = useState({ enabled: false, minAmount: 500, mode: 'fixed', options: [] });
  const [paymentMode, setPaymentMode] = useState('FULL');
  const [partialAmount, setPartialAmount] = useState(0);

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
    address:     user?.address  || '',
    pincode:     user?.pincode  || '',
    state:       user?.state    || '',
    city:        user?.city     || '',
    district:    user?.district || '',
    specialNote: '',
  });
  const [errors, setErrors] = useState({});

  // Referral info loaded from token (if referralToken in URL)
  const [referralInfo, setReferralInfo] = useState(null);

  // Kit view-items modal
  const [viewItemsKit, setViewItemsKit] = useState(null);

  // Saved addresses
  const [savedAddresses,  setSavedAddresses]  = useState([]);
  const [selectedAddrId,  setSelectedAddrId]  = useState('');   // '' = not chosen yet, 'new' = enter manually
  const [saveAddrLabel,   setSaveAddrLabel]   = useState('Home');
  const [wantSaveAddr,    setWantSaveAddr]    = useState(null);  // null | true | false
  const [savingAddr,      setSavingAddr]      = useState(false);

  // Pooja Details page data (Similar Poojas / Upcoming Festivals / Reviews)
  const [similarPoojas,     setSimilarPoojas]     = useState([]);
  const [upcomingFestivals, setUpcomingFestivals] = useState([]);
  const [reviewsData,       setReviewsData]       = useState({ reviews: [], summary: { averageRating: 0, totalReviews: 0 } });
  const [reviewsLoading,    setReviewsLoading]    = useState(false);

  // ── Load saved addresses ─────────────────────────────────────
  // Guests have no account to fetch addresses from — go straight to the
  // manual entry form instead of leaving selectedAddrId stuck at '' (its
  // "not yet resolved" sentinel), which was silently hiding the entire
  // address section for guests: neither the saved-address branch nor the
  // manual-entry branch renders while selectedAddrId is ''.
  useEffect(() => {
    if (!user) { setSelectedAddrId('new'); return; }
    API.get('/users/addresses')
      .then(({ data }) => {
        const addrs = data.addresses || [];
        setSavedAddresses(addrs);
        if (addrs.length > 0) {
          const def = addrs.find(a => a.isDefault) || addrs[0];
          setSelectedAddrId(def._id);
          setUserDetails(p => ({
            ...p,
            address:  def.address  || '',
            pincode:  def.pincode  || '',
            state:    def.state    || '',
            city:     def.city     || '',
            district: def.district || '',
          }));
        } else {
          setSelectedAddrId('new');
        }
      })
      .catch(() => setSelectedAddrId('new'));
  }, [user]);

  // ── Fetch referral info if referralToken is in URL ──────────
  useEffect(() => {
    if (!referralToken) return;
    API.get(`/referral/validate/${referralToken}`)
      .then(({ data }) => setReferralInfo(data.referral))
      .catch(() => {}); // silently ignore — booking still works without referral
  }, [referralToken]);

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
            commissionFixed:   data.pricing.commissionFixed   || 0,
            commissionType:    data.pricing.commissionType    || 'percent',
            gstPercent:        data.pricing.gstPercent        || 0,
          });
        }
        if (data.partialPayment) {
          setPartialConfig(data.partialPayment);
          if (!data.partialPayment.enabled) setPaymentMode('FULL');
        }
      }).catch(() => {});

    setKitsLoading(true);
    API.get(`/marketplace/kits/by-pooja/${pooja._id}`)
      .then(({ data }) => setLinkedKits(data.kits || []))
      .catch(() => {})
      .finally(() => setKitsLoading(false));
  }, [pooja?._id]);

  // ── Pooja Details page data: Similar Poojas / Upcoming Festivals / Reviews ──
  // Fetched once regardless of which tab is active, avoiding fetch-on-tab-click
  // flicker. All three use existing/additive-only endpoints — no mock data.
  useEffect(() => {
    const catId = pooja?.categoryId?._id || pooja?.categoryId || pooja?.categoryIds?.[0]?._id || pooja?.categoryIds?.[0];
    if (!catId || !pooja?._id) return;
    API.get(`/poojas?categoryId=${catId}&limit=6`)
      .then(({ data }) => setSimilarPoojas((data.poojas || []).filter(p => p._id !== pooja._id).slice(0, 4)))
      .catch(() => {});
  }, [pooja?._id, pooja?.categoryId, pooja?.categoryIds]);

  useEffect(() => {
    API.get('/festivals?upcoming=true&limit=4')
      .then(({ data }) => setUpcomingFestivals(data.festivals || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!poojaSlug) return;
    setReviewsLoading(true);
    API.get(`/poojas/${poojaSlug}/reviews?limit=10`)
      .then(({ data }) => setReviewsData({ reviews: data.reviews || [], summary: data.summary || { averageRating: 0, totalReviews: 0 } }))
      .catch(() => {})
      .finally(() => setReviewsLoading(false));
  }, [poojaSlug]);

  const hasKits     = linkedKits.length > 0;
  const selectedKit = linkedKits.find((k) => k._id === kitId) || null;

  // Derived pricing
  const kitPrice = withKit && !isUrgent && selectedKit ? (selectedKit.discountPrice || 0) : 0;
  const pricing  = calculatePrice({
    poojaPrice:        pooja?.salePrice || pooja?.price || 0,
    kitPrice,
    commissionPercent: rates.commissionPercent,
    commissionFixed:   rates.commissionFixed,
    commissionType:    rates.commissionType,
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
    if (urgent) {
      setWithKit(false);
      setKitId('');
    } else if (scheduledDate) {
      // If switching back to Normal, clear date if it falls within the 3-day block
      const t = new Date(); t.setHours(0,0,0,0);
      const minDate = new Date(t); minDate.setDate(minDate.getDate() + 3);
      if (new Date(scheduledDate + 'T00:00:00') < minDate) setScheduledDate('');
    }
  };

  // ── Pay now ──────────────────────────────────────────────────
  // Captures every guest-configurable selection so a login/register
  // checkpoint can restore this exact booking afterward, instead of
  // starting over. See useCheckoutAuthGuard / pendingCheckout.
  const buildBookingSnapshot = () => ({
    poojaSlug, isUrgent, withKit, kitId,
    scheduledDate, scheduledTime, language,
    userDetails, paymentMode, partialAmount, referralToken,
  });

  const handlePay = async () => {
    if (paymentMode === 'PARTIAL') {
      if (!partialAmount || partialAmount < partialConfig.minAmount) {
        toast.error(`Minimum partial payment is ₹${partialConfig.minAmount}`);
        return;
      }
      if (partialAmount >= pricing.grandTotal) {
        toast.error('Partial amount must be less than the grand total');
        return;
      }
    }

    // The one authentication checkpoint for this entire flow — everything
    // before this point (package, date, time, address, review) is guest-
    // accessible. If not logged in, this saves the snapshot above and
    // redirects to /login?next=/book/:slug; the effects below restore it.
    if (!requireAuth('booking', buildBookingSnapshot(), `/book/${poojaSlug}`)) return;

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
        paymentMode,
        partialAmount: paymentMode === 'PARTIAL' ? partialAmount : undefined,
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
        ...(referralToken ? { referralToken } : {}),
      });
      // Booking created — referral context consumed, clear the sessionStorage entry
      try { sessionStorage.removeItem('zutsav_referral'); } catch { /* non-fatal */ }
      window.location.href = data.redirectUrl;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed. Please try again.');
      setPaying(false);
    }
  };

  // ── Resume a booking after a login/register auth checkpoint ───
  // Runs once the user becomes authenticated; restores every selection
  // captured by buildBookingSnapshot() and jumps straight to Review —
  // never back to Home or the pooja overview, never a re-selection.
  useEffect(() => {
    if (!user) return;
    const pending = getPendingCheckout('booking');
    if (!pending || pending.payload.poojaSlug !== poojaSlug) return;

    const p = pending.payload;
    setIsUrgent(p.isUrgent);
    setWithKit(p.withKit);
    setKitId(p.kitId || '');
    setScheduledDate(p.scheduledDate);
    setScheduledTime(p.scheduledTime);
    setLanguage(p.language);
    setUserDetails(p.userDetails);
    setPaymentMode(p.paymentMode);
    setPartialAmount(p.partialAmount || 0);
    setStepId(STEP_IDS.REVIEW);
    clearPendingCheckout();
    setResuming(true);
    // Only re-run if the user or the pooja being viewed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, poojaSlug]);

  // Once state is restored and pricing has finished loading, continue
  // straight into payment — no extra click, matching "must feel seamless".
  useEffect(() => {
    if (resuming && pooja && !loading) {
      setResuming(false);
      handlePay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resuming, pooja, loading]);

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
  // Covers both "still fetching pooja" and "restored, about to auto-pay" so
  // there's no flash of the raw Review step before the payment redirect.
  if (resuming) return <ZutsavLoader fullscreen size={68} message="Resuming your booking…" />;
  if (loading) return <ZutsavLoader fullscreen size={68} message="Loading ceremony details…" />;
  if (!pooja) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:'var(--t-bg)' }}>
      <p className="text-gray-500">Pooja not found</p>
    </div>
  );

  // ── Progress bar steps (hide overview from bar) ──────────────
  const barSteps = activeSteps.filter(s => s !== STEP_IDS.OVERVIEW);
  const barIdx   = barSteps.indexOf(stepId);
  const stepperSteps = barSteps.map(sid => ({ id: sid, icon: STEP_META[sid].icon, label: STEP_META[sid].label }));

  const referralBanner = referralToken && referralInfo?.panditId && (
    <div className="mb-4 rounded-2xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full overflow-hidden bg-green-100 shrink-0">
        {referralInfo.panditId.profilePhoto
          ? <img src={getImageUrl(referralInfo.panditId.profilePhoto)} alt={referralInfo.panditId.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">🙏</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-green-800">Booking via referral from {referralInfo.panditId.name}</p>
        <p className="text-xs text-green-600">Your referral is securely attached to this booking.</p>
      </div>
      <BadgeCheck size={18} className="text-green-600 shrink-0" />
    </div>
  );

  return (
    <div className="min-h-screen py-8" style={{ background: 'var(--t-bg)' }}>
      {stepId === STEP_IDS.OVERVIEW ? (
        <>
          {referralBanner && <div className="max-w-7xl mx-auto px-4">{referralBanner}</div>}
          <PoojaDetailsStep
            pooja={pooja}
            pricing={pricing}
            similarPoojas={similarPoojas}
            upcomingFestivals={upcomingFestivals}
            reviewsData={reviewsData}
            reviewsLoading={reviewsLoading}
            onBookNow={() => setStepId(STEP_IDS.TYPE)}
          />
        </>
      ) : (
        <div className="max-w-6xl mx-auto px-4">
          {referralBanner}

          <BookingStepper steps={stepperSteps} currentIndex={barIdx} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              {stepId === STEP_IDS.TYPE && (
                <BookingTypeStep isUrgent={isUrgent} onSetUrgent={handleSetUrgent} onBack={goBack} onNext={handleNext} />
              )}
              {stepId === STEP_IDS.KIT_PREF && (
                <KitPreferenceStep withKit={withKit} setWithKit={setWithKit} setKitId={setKitId} onBack={goBack} onNext={handleNext} />
              )}
              {stepId === STEP_IDS.KIT_SELECT && (
                <KitSelectStep
                  linkedKits={linkedKits} kitsLoading={kitsLoading} kitId={kitId} setKitId={setKitId}
                  errors={errors} setErrors={setErrors} onViewItems={setViewItemsKit}
                  onBack={goBack} onNext={handleNext}
                />
              )}
              {stepId === STEP_IDS.DATE && (
                <DateStep
                  isUrgent={isUrgent} scheduledDate={scheduledDate} setScheduledDate={setScheduledDate}
                  errors={errors} setErrors={setErrors} onBack={goBack} onNext={handleNext}
                />
              )}
              {stepId === STEP_IDS.TIME && (
                <TimeStep
                  scheduledDate={scheduledDate} scheduledTime={scheduledTime} setScheduledTime={setScheduledTime}
                  errors={errors} setErrors={setErrors} onBack={goBack} onNext={handleNext}
                />
              )}
              {stepId === STEP_IDS.LANGUAGE && (
                <LanguageStep
                  pooja={pooja} language={language} setLanguage={setLanguage}
                  errors={errors} setErrors={setErrors} onBack={goBack} onNext={handleNext}
                />
              )}
              {stepId === STEP_IDS.DETAILS && (
                <DetailsStep
                  userDetails={userDetails} setUserDetails={setUserDetails} errors={errors} setErrors={setErrors} user={user}
                  savedAddresses={savedAddresses} setSavedAddresses={setSavedAddresses}
                  selectedAddrId={selectedAddrId} setSelectedAddrId={setSelectedAddrId}
                  saveAddrLabel={saveAddrLabel} setSaveAddrLabel={setSaveAddrLabel}
                  wantSaveAddr={wantSaveAddr} setWantSaveAddr={setWantSaveAddr}
                  savingAddr={savingAddr} setSavingAddr={setSavingAddr}
                  onBack={goBack} onNext={handleNext}
                />
              )}
              {stepId === STEP_IDS.REVIEW && (
                <ReviewStep
                  pooja={pooja} pricing={pricing} rates={rates} isUrgent={isUrgent} withKit={withKit} selectedKit={selectedKit}
                  scheduledDate={scheduledDate} scheduledTime={scheduledTime} language={language} userDetails={userDetails}
                  referralToken={referralToken} referralInfo={referralInfo}
                  partialConfig={partialConfig} paymentMode={paymentMode} setPaymentMode={setPaymentMode}
                  partialAmount={partialAmount} setPartialAmount={setPartialAmount}
                  paying={paying} onBack={goBack} onPay={handlePay} onAddToCart={handleAddToCart}
                />
              )}
            </div>

            <div className="lg:col-span-1">
              <BookingSummaryCard pooja={pooja} pricing={pricing} reviewsSummary={reviewsData.summary} variant="wizard" />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center gap-5 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><CheckCircle size={11} className="text-orange-400" /> Verified Pandit</span>
            <span className="flex items-center gap-1.5"><Shield size={11} className="text-orange-400" /> Secure Payment</span>
            <span className="flex items-center gap-1.5"><Sparkles size={11} className="text-orange-400" /> {pooja.rating > 0 ? `${pooja.rating}★ Rated` : 'Trusted Ceremony'}</span>
          </div>
        </div>
      )}

      {viewItemsKit && <KitItemsModal kit={viewItemsKit} onClose={() => setViewItemsKit(null)} />}
    </div>
  );
}
