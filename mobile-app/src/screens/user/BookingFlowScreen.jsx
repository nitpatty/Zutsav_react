import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, FlatList, Image, Alert, Linking, Modal, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency } from '../../utils/helpers';
import { calculatePrice, roundToPaise } from '../../utils/priceEngine';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import AddressPicker from '../../components/shared/AddressPicker';

// ── Time slots (same as website) ─────────────────────────────
const TIME_SLOTS = [
  '05:00','05:30','06:00','06:30','07:00','07:30','08:00','08:30',
  '09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00',
];
const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${suffix}`;
};

// ── Months / weekdays for calendar ───────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CalendarPicker({ value, onChange, minDaysFromNow = 0, maxDaysFromNow = null, C }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [vy, setVY] = useState(today.getFullYear());
  const [vm, setVM] = useState(today.getMonth());

  const firstDay = new Date(vy, vm, 1).getDay();
  const daysInMon = new Date(vy, vm + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMon }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  const minDate = new Date(today); minDate.setDate(minDate.getDate() + minDaysFromNow);
  const maxDate = maxDaysFromNow !== null ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDaysFromNow) : null;

  const isDisabled = (d) => {
    const date = new Date(vy, vm, d);
    return date < minDate || (maxDate !== null && date > maxDate);
  };

  const toStr = (d) => {
    const date = new Date(vy, vm, d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const isSelected = (d) => value === toStr(d);
  const isToday = (d) => today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === d;

  return (
    <View style={[styles.calendar, { borderColor: C.border, backgroundColor: C.surface }]}>
      <View style={[styles.calHeader, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => vm === 0 ? (setVM(11), setVY(y => y - 1)) : setVM(m => m - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={18} color={C.primary} />
        </TouchableOpacity>
        <Text style={[styles.calMonth, { color: C.text }]}>{FULL_MONTHS[vm]} {vy}</Text>
        <TouchableOpacity onPress={() => vm === 11 ? (setVM(0), setVY(y => y + 1)) : setVM(m => m + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={18} color={C.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.calDays}>
        {DAYS.map(d => <Text key={d} style={[styles.calDayLabel, { color: C.textSecondary }]}>{d}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={i} style={styles.calCell} />;
          const dis = isDisabled(day);
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <TouchableOpacity
              key={i}
              style={[styles.calCell, sel && { backgroundColor: C.primary, borderRadius: 10 }, tod && !sel && { borderWidth: 1.5, borderColor: C.primary, borderRadius: 10 }]}
              onPress={() => !dis && onChange(toStr(day))}
              disabled={dis}
              activeOpacity={0.7}
            >
              <Text style={[styles.calDayNum, { color: dis ? C.border : sel ? '#fff' : tod ? C.primary : C.text }]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {value && (
        <View style={[styles.calSelected, { borderTopColor: C.border }]}>
          <Text style={[styles.calSelectedText, { color: C.primary }]}>
            {new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Steps ────────────────────────────────────────────────────
const STEP = {
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

const STEP_LABEL = {
  [STEP.OVERVIEW]:   { icon: '🙏', label: 'Pooja' },
  [STEP.TYPE]:       { icon: '⚡', label: 'Type' },
  [STEP.KIT_PREF]:  { icon: '📦', label: 'Samagri' },
  [STEP.KIT_SELECT]: { icon: '🛍️', label: 'Kit' },
  [STEP.DATE]:       { icon: '📅', label: 'Date' },
  [STEP.TIME]:       { icon: '🕐', label: 'Time' },
  [STEP.LANGUAGE]:   { icon: '🌐', label: 'Language' },
  [STEP.DETAILS]:    { icon: '📋', label: 'Details' },
  [STEP.REVIEW]:     { icon: '✨', label: 'Review' },
};

function buildSteps(isUrgent, withKit, hasKits) {
  return [
    STEP.OVERVIEW,
    STEP.TYPE,
    ...(hasKits && !isUrgent ? [STEP.KIT_PREF] : []),
    ...(hasKits && !isUrgent && withKit ? [STEP.KIT_SELECT] : []),
    STEP.DATE,
    STEP.TIME,
    STEP.LANGUAGE,
    STEP.DETAILS,
    STEP.REVIEW,
  ];
}

export default function BookingFlowScreen({ navigation, route }) {
  const { poojaId, pooja: poojaParam } = route.params || {};
  const { theme } = useThemeStore();
  const { user } = useAuthStore();
  const C = theme.colors;

  const [stepId,    setStepId]    = useState(STEP.OVERVIEW);
  const [pooja,     setPooja]     = useState(poojaParam || null);
  const [loading,   setLoading]   = useState(!poojaParam);
  const [submitting, setSubmitting] = useState(false);

  // Pricing
  const [rates,         setRates]         = useState({ commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0 });
  const [partialConfig, setPartialConfig] = useState({ enabled: false, minAmount: 500, mode: 'fixed', options: [] });

  // Kits
  const [kits,        setKits]        = useState([]);
  const [kitsLoading, setKitsLoading] = useState(false);

  // Booking choices
  const [isUrgent,  setIsUrgent]  = useState(false);
  const [withKit,   setWithKit]   = useState(false);
  const [kitId,     setKitId]     = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [language,      setLanguage]      = useState('');
  const [paymentMode,   setPaymentMode]   = useState('FULL');
  const [partialAmount, setPartialAmount] = useState(0);

  // User details
  const [userDetails, setUserDetails] = useState({
    name:     user?.name     || '',
    phone:    user?.phone    || '',
    email:    user?.email    || '',
    address:  user?.address  || '',
    pincode:  user?.pincode  || '',
    state:    user?.state    || '',
    city:     user?.city     || '',
    district: user?.district || '',
  });
  const [specialNote, setSpecialNote] = useState('');

  // Load pooja
  useEffect(() => {
    if (!poojaParam && poojaId) {
      api.get(`/poojas/${poojaId}`)
        .then(({ data }) => setPooja(data.pooja || data.data))
        .catch(() => Toast.show({ type: 'error', text1: 'Could not load pooja details' }))
        .finally(() => setLoading(false));
    }
  }, [poojaId]);

  // Load pricing + kits + saved addresses once pooja is set
  useEffect(() => {
    if (!pooja?._id) return;

    api.get(`/bookings/pricing-preview?poojaId=${pooja._id}`)
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
    api.get(`/marketplace/kits/by-pooja/${pooja._id}`)
      .then(({ data }) => setKits(data.kits || []))
      .catch(() => {})
      .finally(() => setKitsLoading(false));

    if (pooja.languages?.length === 1) setLanguage(pooja.languages[0]);
  }, [pooja?._id]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!pooja) return null;

  const hasKits = kits.length > 0;
  const selectedKit = kits.find(k => k._id === kitId) || null;
  const activeSteps = buildSteps(isUrgent, withKit, hasKits);
  const currentIdx = activeSteps.indexOf(stepId);
  const barSteps = activeSteps.filter(s => s !== STEP.OVERVIEW);
  const barIdx = barSteps.indexOf(stepId);

  const poojaPrice = pooja.salePrice || pooja.price || 0;
  const kitPrice = withKit && !isUrgent && selectedKit ? (selectedKit.discountPrice || 0) : 0;
  const pricing = calculatePrice({
    poojaPrice,
    kitPrice,
    commissionPercent: rates.commissionPercent,
    commissionFixed:   rates.commissionFixed,
    commissionType:    rates.commissionType,
    gstPercent:        rates.gstPercent,
  });
  const { grandTotal } = pricing;

  const goNext = () => {
    const next = activeSteps[currentIdx + 1];
    if (next) setStepId(next);
  };
  const goBack = () => {
    const prev = activeSteps[currentIdx - 1];
    if (prev) setStepId(prev);
  };

  const handleSetUrgent = (urgent) => {
    setIsUrgent(urgent);
    if (urgent) { setWithKit(false); setKitId(''); }
  };

  const handleSubmit = async () => {
    if (paymentMode === 'PARTIAL') {
      if (!partialAmount || partialAmount < partialConfig.minAmount) {
        Toast.show({ type: 'error', text1: `Minimum partial payment is ₹${partialConfig.minAmount}` });
        return;
      }
      if (partialAmount >= grandTotal) {
        Toast.show({ type: 'error', text1: 'Partial amount must be less than the grand total' });
        return;
      }
    }

    const ud = {
      name: userDetails.name, phone: userDetails.phone, email: userDetails.email,
      address: userDetails.address, pincode: userDetails.pincode, state: userDetails.state, city: userDetails.city,
      district: userDetails.district,
    };
    try {
      setSubmitting(true);
      const { data } = await api.post('/bookings/create-phonepe-order', {
        poojaId:      pooja._id,
        scheduledDate,
        scheduledTime: scheduledTime || '10:00',
        language:     language || (pooja.languages?.[0] || 'Hindi'),
        specialNote:  specialNote.trim() || undefined,
        withKit:      withKit && !isUrgent,
        kitId:        withKit && !isUrgent && kitId ? kitId : undefined,
        isUrgent,
        paymentMode,
        partialAmount: paymentMode === 'PARTIAL' ? partialAmount : undefined,
        userDetails:  ud,
      });

      if (data.redirectUrl) {
        Alert.alert('Complete Payment',
          `Pay ${formatCurrency(data.chargeAmount || grandTotal)} via PhonePe. After payment, return to the app.`,
          [
            { text: 'Pay Now', onPress: async () => {
              try { await Linking.openURL(data.redirectUrl); } catch {}
              navigation.replace('PaymentVerify', { merchantTransactionId: data.merchantTransactionId, bookingId: data.booking._id, type: 'booking' });
            }},
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.replace('BookingDetail', { bookingId: data.booking._id }) },
          ]
        );
      } else {
        Toast.show({ type: 'success', text1: 'Booking created!' });
        navigation.replace('BookingDetail', { bookingId: data.booking._id });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Booking failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const isDetailsValid = userDetails.name && userDetails.phone && userDetails.address && userDetails.pincode;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={pooja.name} subtitle={stepId === STEP.OVERVIEW ? '' : `Step ${barIdx + 1} of ${barSteps.length}`} />

      {/* Progress bar (hidden on overview) */}
      {stepId !== STEP.OVERVIEW && (
        <View style={[styles.progressBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
            {barSteps.map((sid, idx) => {
              const done = idx < barIdx;
              const curr = idx === barIdx;
              return (
                <View key={sid} style={styles.stepChip}>
                  <View style={[styles.stepDot, done && { backgroundColor: C.primary }, curr && { backgroundColor: C.primary }]}>
                    {done
                      ? <Ionicons name="checkmark" size={10} color="#fff" />
                      : <Text style={{ fontSize: 10 }}>{STEP_LABEL[sid]?.icon}</Text>
                    }
                  </View>
                  <Text style={[styles.stepChipLabel, { color: curr ? C.primary : C.textSecondary }]}>{STEP_LABEL[sid]?.label}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {stepId === STEP.OVERVIEW && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            {pooja.image && (
              <Image source={{ uri: imageUrl(pooja.image) }} style={styles.poojaHeroImg} />
            )}
            <View style={{ padding: 16, gap: 12 }}>
              <Text style={[styles.poojaTitle, { color: C.text }]}>{pooja.name}</Text>
              {pooja.durationValue && (
                <View style={styles.row}>
                  <Ionicons name="time-outline" size={14} color={C.textSecondary} />
                  <Text style={[styles.subText, { color: C.textSecondary }]}>{pooja.durationValue} {pooja.durationUnit}</Text>
                </View>
              )}
              {pooja.shortDesc && <Text style={[styles.shortDesc, { color: C.textSecondary }]}>{pooja.shortDesc}</Text>}

              {pooja.requirements?.length > 0 && (
                <View style={[styles.infoBox, { backgroundColor: '#FEF3C720', borderColor: '#D97706' }]}>
                  <Text style={[styles.infoBoxTitle, { color: '#92400E' }]}>Requirements / Samagri</Text>
                  {pooja.requirements.slice(0, 6).map((r, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: '#D97706' }]} />
                      <Text style={[styles.bulletText, { color: C.text }]}>{r}</Text>
                    </View>
                  ))}
                  {pooja.requirements.length > 6 && (
                    <Text style={{ color: '#D97706', fontSize: 12, marginTop: 4 }}>+{pooja.requirements.length - 6} more items</Text>
                  )}
                </View>
              )}

              {pooja.benefits?.length > 0 && (
                <View style={[styles.infoBox, { backgroundColor: '#D1FAE520', borderColor: '#059669' }]}>
                  <Text style={[styles.infoBoxTitle, { color: '#065F46' }]}>Spiritual Benefits</Text>
                  {pooja.benefits.slice(0, 5).map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Ionicons name="checkmark-circle" size={12} color="#059669" />
                      <Text style={[styles.bulletText, { color: C.text }]}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.priceRow, { borderTopColor: C.border }]}>
                <View>
                  <Text style={[styles.priceLabel, { color: C.textSecondary }]}>Starting from</Text>
                  <Text style={[styles.priceAmount, { color: C.primary }]}>{formatCurrency(poojaPrice)}</Text>
                  <Text style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>Platform fee & taxes shown at checkout</Text>
                </View>
                <TouchableOpacity style={[styles.bookNowBtn, { backgroundColor: C.primary }]} onPress={goNext} activeOpacity={0.85}>
                  <Text style={styles.bookNowText}>Book Now</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── TYPE ─────────────────────────────────────────────── */}
        {stepId === STEP.TYPE && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="⚡" title="Select Booking Type" sub="Choose how soon you need this ceremony" C={C} />
            <TypeCard
              selected={!isUrgent}
              onPress={() => handleSetUrgent(false)}
              icon="📅"
              title="Normal Booking"
              desc="Schedule at your preferred date and time. Samagri kit delivery available."
              tags={['Scheduled ceremony','Kit available']}
              color={C.primary}
              C={C}
            />
            <TypeCard
              selected={isUrgent}
              onPress={() => handleSetUrgent(true)}
              icon="⚡"
              title="Urgent Booking"
              desc="Need a pandit immediately or within a few hours. No kit delivery."
              tags={['Same-day ceremony','No kit delivery']}
              color="#DC2626"
              C={C}
            />
            <NavRow onBack={goBack} onNext={goNext} C={C} />
          </View>
        )}

        {/* ── KIT PREF ─────────────────────────────────────────── */}
        {stepId === STEP.KIT_PREF && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="📦" title="Samagri Kit" sub="Would you like to add a puja kit?" C={C} />
            <View style={styles.kitPrefRow}>
              <KitPrefCard selected={!withKit} onPress={() => { setWithKit(false); setKitId(''); }} icon="🙏" title="Without Kit" sub="I'll arrange samagri myself" C={C} />
              <KitPrefCard selected={withKit} onPress={() => setWithKit(true)} icon="📦" title="With Kit" sub="Delivered to your address" badge="CONVENIENT" C={C} />
            </View>
            <NavRow onBack={goBack} onNext={goNext} C={C} />
          </View>
        )}

        {/* ── KIT SELECT ───────────────────────────────────────── */}
        {stepId === STEP.KIT_SELECT && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="🛍️" title="Select a Samagri Kit" sub="Choose the right kit for your ceremony" C={C} />
            {kitsLoading ? <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} /> : kits.map(kit => (
              <TouchableOpacity
                key={kit._id}
                style={[styles.kitCard, { backgroundColor: C.surface, borderColor: kitId === kit._id ? C.primary : C.border, borderWidth: kitId === kit._id ? 2 : 1 }]}
                onPress={() => setKitId(kit._id)}
                activeOpacity={0.85}
              >
                <View style={styles.kitCardRow}>
                  <View style={[styles.kitIconWrap, { backgroundColor: C.primary + '15' }]}>
                    {kit.image
                      ? <Image source={{ uri: imageUrl(kit.image) }} style={styles.kitImg} />
                      : <Text style={{ fontSize: 24 }}>📦</Text>
                    }
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.kitName, { color: C.text }]}>{kit.name}</Text>
                    {kit.description && <Text style={[styles.kitDesc, { color: C.textSecondary }]} numberOfLines={2}>{kit.description}</Text>}
                    <Text style={[styles.kitPrice, { color: C.primary }]}>{formatCurrency(kit.discountPrice || 0)}</Text>
                  </View>
                  {kitId === kit._id && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
                </View>
              </TouchableOpacity>
            ))}
            {!kitId && <Text style={{ color: '#DC2626', fontSize: 12 }}>Please select a kit to continue</Text>}
            <NavRow onBack={goBack} onNext={() => { if (!kitId) { Toast.show({ type: 'error', text1: 'Please select a kit' }); return; } goNext(); }} C={C} />
          </View>
        )}

        {/* ── DATE ─────────────────────────────────────────────── */}
        {stepId === STEP.DATE && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="📅" title="Select Ceremony Date" sub={isUrgent ? 'Today, tomorrow or day after only' : 'Minimum 3 days in advance'} C={C} />
            <View style={[styles.infoBox, { backgroundColor: isUrgent ? '#FEE2E220' : '#FEF3C720', borderColor: isUrgent ? '#DC2626' : '#D97706' }]}>
              <Text style={{ color: isUrgent ? '#991B1B' : '#92400E', fontSize: 12 }}>
                {isUrgent
                  ? '⚡ Urgent bookings available for today, tomorrow, or day after tomorrow only.'
                  : 'ℹ️ Normal bookings require at least 3 days advance notice.'}
              </Text>
            </View>
            <CalendarPicker value={scheduledDate} onChange={setScheduledDate} minDaysFromNow={isUrgent ? 0 : 3} maxDaysFromNow={isUrgent ? 2 : null} C={C} />
            <NavRow onBack={goBack} onNext={() => { if (!scheduledDate) { Toast.show({ type: 'error', text1: 'Please select a date' }); return; } goNext(); }} C={C} />
          </View>
        )}

        {/* ── TIME ─────────────────────────────────────────────── */}
        {stepId === STEP.TIME && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="🕐" title="Select Start Time" sub="Choose when the ceremony should begin" C={C} />
            <View style={styles.timeGrid}>
              {TIME_SLOTS.map(slot => (
                <TouchableOpacity
                  key={slot}
                  style={[styles.timeSlot, { borderColor: scheduledTime === slot ? C.primary : C.border, backgroundColor: scheduledTime === slot ? C.primary : C.surface }]}
                  onPress={() => setScheduledTime(slot)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.timeSlotText, { color: scheduledTime === slot ? '#fff' : C.text }]}>{fmtTime(slot)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {scheduledDate && scheduledTime && (
              <View style={[styles.infoBox, { backgroundColor: '#D1FAE520', borderColor: '#059669' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={14} color="#059669" />
                  <Text style={{ color: '#065F46', fontSize: 12 }}>
                    {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} at {fmtTime(scheduledTime)}
                  </Text>
                </View>
              </View>
            )}
            <NavRow onBack={goBack} onNext={() => { if (!scheduledTime) { Toast.show({ type: 'error', text1: 'Please select a time slot' }); return; } goNext(); }} C={C} />
          </View>
        )}

        {/* ── LANGUAGE ─────────────────────────────────────────── */}
        {stepId === STEP.LANGUAGE && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="🌐" title="Select Language" sub="Language for mantras and ceremony" C={C} />
            {(pooja.languages?.length > 0 ? pooja.languages : ['Hindi', 'Sanskrit', 'English']).map(lang => (
              <TouchableOpacity
                key={lang}
                style={[styles.langRow, { borderColor: language === lang ? C.primary : C.border, backgroundColor: language === lang ? C.primary + '12' : C.surface }]}
                onPress={() => setLanguage(lang)}
                activeOpacity={0.8}
              >
                <View style={[styles.radioCircle, { borderColor: language === lang ? C.primary : C.border }]}>
                  {language === lang && <View style={[styles.radioDot, { backgroundColor: C.primary }]} />}
                </View>
                <Text style={[styles.langText, { color: language === lang ? C.primary : C.text }]}>{lang}</Text>
              </TouchableOpacity>
            ))}
            <NavRow onBack={goBack} onNext={() => { if (!language) { Toast.show({ type: 'error', text1: 'Please select a language' }); return; } goNext(); }} C={C} />
          </View>
        )}

        {/* ── DETAILS ──────────────────────────────────────────── */}
        {stepId === STEP.DETAILS && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="📋" title="Your Details" sub="Ceremony location and contact info" C={C} />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Full Name *</Text>
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={userDetails.name} onChangeText={v => setUserDetails(p => ({ ...p, name: v }))} placeholder="Your name" placeholderTextColor={C.textSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Phone *</Text>
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={userDetails.phone} onChangeText={v => setUserDetails(p => ({ ...p, phone: v.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit mobile" placeholderTextColor={C.textSecondary} keyboardType="phone-pad" maxLength={10} />
              </View>
            </View>

            {user && (
              <View style={{ gap: 8 }}>
                <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Ceremony Address</Text>
                <AddressPicker
                  mode="picker"
                  allowInlineNew
                  value={{ address: userDetails.address, pincode: userDetails.pincode, state: userDetails.state, city: userDetails.city, district: userDetails.district }}
                  onChange={(fields) => setUserDetails(p => ({ ...p, ...fields }))}
                />
              </View>
            )}

            <View>
              <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Special Note (optional)</Text>
              <TextInput style={[styles.input, { borderColor: C.border, color: C.text, height: 70, textAlignVertical: 'top' }]} value={specialNote} onChangeText={setSpecialNote} placeholder="Any special requirements for the pandit…" placeholderTextColor={C.textSecondary} multiline />
            </View>

            <NavRow onBack={goBack} onNext={() => { if (!isDetailsValid) { Toast.show({ type: 'error', text1: 'Please fill all required fields' }); return; } goNext(); }} C={C} />
          </View>
        )}

        {/* ── REVIEW ───────────────────────────────────────────── */}
        {stepId === STEP.REVIEW && (
          <View style={{ gap: 12 }}>
            <StepHeader icon="✨" title="Review & Pay" sub="Confirm your ceremony booking" C={C} />

            {/* Booking summary */}
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <View style={styles.reviewRow}>
                {pooja.image && <Image source={{ uri: imageUrl(pooja.image) }} style={styles.reviewImg} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.reviewPoojaName, { color: C.text }]}>{pooja.name}</Text>
                  {isUrgent && <Text style={styles.urgentBadge}>⚡ Urgent</Text>}
                </View>
              </View>
              <View style={[styles.reviewGrid, { borderTopColor: C.border }]}>
                {[
                  ['Date', scheduledDate ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''],
                  ['Time', scheduledTime ? fmtTime(scheduledTime) : ''],
                  ['Language', language],
                  ['Address', userDetails.address ? `${userDetails.address}${userDetails.city ? ', ' + userDetails.city : ''}` : ''],
                ].filter(([, v]) => v).map(([l, v]) => (
                  <View key={l} style={styles.reviewItem}>
                    <Text style={[styles.reviewItemLabel, { color: C.textSecondary }]}>{l}:</Text>
                    <Text style={[styles.reviewItemVal, { color: C.text }]}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Price breakdown */}
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Price Breakdown</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                <PriceRow label="Pooja Service" amount={pricing.poojaAmount} C={C} sub="Religious services are GST-exempt" />
                {pricing.platformFee > 0 && (
                  <PriceRow
                    label={rates.commissionType === 'fixed' ? `Platform Fee (₹${rates.commissionFixed} fixed)` : `Platform Fee (${rates.commissionPercent}%)`}
                    amount={pricing.platformFee} C={C} muted sub="Convenience fee"
                  />
                )}
                {pricing.platformGST > 0 && <PriceRow label={`GST on Platform Fee (${rates.gstPercent}%)`} amount={pricing.platformGST} C={C} muted />}
                {pricing.kitAmount > 0 && <PriceRow label={`Samagri Kit — ${selectedKit?.name}`} amount={pricing.kitAmount} C={C} muted sub="Delivered to ceremony address" />}
                {pricing.kitGST > 0 && <PriceRow label={`GST on Kit (${rates.gstPercent}%)`} amount={pricing.kitGST} C={C} muted />}
                <View style={[styles.divider, { backgroundColor: C.border }]} />
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: C.text }]}>Grand Total</Text>
                  <Text style={[styles.totalAmount, { color: C.primary }]}>{formatCurrency(pricing.grandTotal)}</Text>
                </View>
              </View>
            </View>

            {/* Payment option */}
            {partialConfig.enabled && (
              <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[styles.cardTitle, { color: C.text }]}>Payment Option</Text>
                <View style={{ gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.payModeRow, { borderColor: paymentMode === 'FULL' ? C.primary : C.border, backgroundColor: paymentMode === 'FULL' ? C.primary + '10' : C.surface }]}
                    onPress={() => setPaymentMode('FULL')}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.radioCircle, { borderColor: paymentMode === 'FULL' ? C.primary : C.border }]}>
                      {paymentMode === 'FULL' && <View style={[styles.radioDot, { backgroundColor: C.primary }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payModeTitle, { color: C.text }]}>Pay Full Amount</Text>
                      <Text style={[styles.payModeSub, { color: C.textSecondary }]}>Pay {formatCurrency(pricing.grandTotal)} now · No pending balance</Text>
                    </View>
                    <Text style={[styles.payModeAmt, { color: C.primary }]}>{formatCurrency(pricing.grandTotal)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.payModeRow, { borderColor: paymentMode === 'PARTIAL' ? '#D97706' : C.border, backgroundColor: paymentMode === 'PARTIAL' ? '#FEF3C720' : C.surface }]}
                    onPress={() => {
                      setPaymentMode('PARTIAL');
                      const opts = partialConfig.mode === 'percentage'
                        ? partialConfig.options.map(p => roundToPaise(pricing.grandTotal * p / 100))
                        : partialConfig.options;
                      if (opts.length > 0 && !partialAmount) setPartialAmount(opts[0]);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.radioCircle, { borderColor: paymentMode === 'PARTIAL' ? '#D97706' : C.border }]}>
                      {paymentMode === 'PARTIAL' && <View style={[styles.radioDot, { backgroundColor: '#D97706' }]} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.payModeTitle, { color: C.text }]}>Pay Partial Amount</Text>
                      <Text style={[styles.payModeSub, { color: C.textSecondary }]}>Minimum ₹{partialConfig.minAmount} · Pay rest later</Text>
                    </View>
                  </TouchableOpacity>

                  {paymentMode === 'PARTIAL' && (
                    <View style={{ gap: 10, paddingLeft: 4 }}>
                      {partialConfig.options.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {partialConfig.options.map((opt) => {
                            const resolvedAmt = partialConfig.mode === 'percentage'
                              ? roundToPaise(pricing.grandTotal * opt / 100)
                              : opt;
                            const label = partialConfig.mode === 'percentage' ? `${opt}%` : formatCurrency(resolvedAmt);
                            const isDisabled = resolvedAmt < partialConfig.minAmount || resolvedAmt >= pricing.grandTotal;
                            const isSelected = partialAmount === resolvedAmt;
                            return (
                              <TouchableOpacity
                                key={opt}
                                disabled={isDisabled}
                                onPress={() => setPartialAmount(resolvedAmt)}
                                style={[
                                  styles.partialOptBtn,
                                  { borderColor: isSelected ? '#D97706' : '#FDE68A', backgroundColor: isSelected ? '#D97706' : 'transparent', opacity: isDisabled ? 0.4 : 1 },
                                ]}
                                activeOpacity={0.8}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : '#B45309' }}>
                                  {label}{partialConfig.mode === 'percentage' ? ` (${formatCurrency(resolvedAmt)})` : ''}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      <View>
                        <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Or enter custom amount</Text>
                        <TextInput
                          style={[styles.input, { borderColor: C.border, color: C.text }]}
                          value={partialAmount ? String(partialAmount) : ''}
                          onChangeText={(v) => setPartialAmount(Math.max(0, parseInt(v.replace(/\D/g, ''), 10) || 0))}
                          placeholder={`Min ₹${partialConfig.minAmount}`}
                          placeholderTextColor={C.textSecondary}
                          keyboardType="number-pad"
                        />
                        {partialAmount > 0 && partialAmount < partialConfig.minAmount && (
                          <Text style={{ color: '#DC2626', fontSize: 11, marginTop: 4 }}>Minimum partial payment is ₹{partialConfig.minAmount}</Text>
                        )}
                      </View>

                      {partialAmount >= partialConfig.minAmount && partialAmount < pricing.grandTotal && (
                        <View style={[styles.partialSummary, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                          <View style={styles.priceLineRow}>
                            <Text style={{ fontSize: 13, color: '#78350F' }}>Pay Now</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>{formatCurrency(partialAmount)}</Text>
                          </View>
                          <View style={styles.priceLineRow}>
                            <Text style={{ fontSize: 13, color: '#78350F' }}>Pay Later</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>{formatCurrency(pricing.grandTotal - partialAmount)}</Text>
                          </View>
                          <View style={[styles.divider, { backgroundColor: '#FDE68A', marginVertical: 4 }]} />
                          <View style={styles.priceLineRow}>
                            <Text style={{ fontSize: 11, color: '#92400E' }}>Total Booking Amount</Text>
                            <Text style={{ fontSize: 11, color: '#92400E' }}>{formatCurrency(pricing.grandTotal)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Trust line */}
            <View style={[styles.trustRow, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <Ionicons name="shield-checkmark" size={14} color="#3B82F6" />
              <Text style={styles.trustText}>Secure payment via PhonePe · UPI, Cards, Net Banking</Text>
            </View>

            {/* Pay button */}
            <TouchableOpacity
              style={[styles.payBtn, { backgroundColor: C.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.payBtnText}>
                    {paymentMode === 'PARTIAL' && partialAmount >= partialConfig.minAmount
                      ? `Pay ${formatCurrency(partialAmount)} Now 🙏`
                      : `Pay ${formatCurrency(pricing.grandTotal)} 🙏`}
                  </Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={[styles.backBtnAlt, { borderColor: C.border }]} onPress={goBack}>
              <Ionicons name="arrow-back" size={16} color={C.text} />
              <Text style={[styles.backBtnAltText, { color: C.text }]}>Edit Details</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Small helper components ───────────────────────────────────
function StepHeader({ icon, title, sub, C }) {
  return (
    <View style={styles.stepHeaderRow}>
      <View style={styles.stepHeaderIcon}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <View>
        <Text style={[styles.stepTitle, { color: C.text }]}>{title}</Text>
        {sub && <Text style={[styles.stepSub, { color: C.textSecondary }]}>{sub}</Text>}
      </View>
    </View>
  );
}

function NavRow({ onBack, onNext, nextLabel = 'Continue', C }) {
  return (
    <View style={styles.navRow}>
      <TouchableOpacity style={[styles.navBack, { borderColor: C.border }]} onPress={onBack} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={16} color={C.text} />
        <Text style={[styles.navBackText, { color: C.text }]}>Back</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.navNext, { backgroundColor: C.primary }]} onPress={onNext} activeOpacity={0.85}>
        <Text style={styles.navNextText}>{nextLabel}</Text>
        <Ionicons name="arrow-forward" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function TypeCard({ selected, onPress, icon, title, desc, tags, color, C }) {
  return (
    <TouchableOpacity
      style={[styles.typeCard, { borderColor: selected ? color : C.border, backgroundColor: selected ? color + '10' : C.surface }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.typeCardRow}>
        <View style={[styles.typeIcon, { backgroundColor: selected ? color + '20' : C.background }]}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.typeTitle, { color: selected ? color : C.text }]}>{title}</Text>
          <Text style={[styles.typeDesc, { color: C.textSecondary }]}>{desc}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {tags.map(t => (
              <View key={t} style={[styles.tagPill, { borderColor: color + '50', backgroundColor: color + '10' }]}>
                <Text style={{ fontSize: 10, color, fontWeight: '600' }}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.radioCircle, { borderColor: selected ? color : C.border }]}>
          {selected && <View style={[styles.radioDot, { backgroundColor: color }]} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function KitPrefCard({ selected, onPress, icon, title, sub, badge, C }) {
  return (
    <TouchableOpacity
      style={[styles.kitPrefCard, { borderColor: selected ? C.primary : C.border, backgroundColor: selected ? C.primary + '10' : C.surface }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {badge && <View style={styles.kitBadge}><Text style={styles.kitBadgeText}>{badge}</Text></View>}
      <Text style={{ fontSize: 28, marginBottom: 4 }}>{icon}</Text>
      <Text style={[styles.kitPrefTitle, { color: selected ? C.primary : C.text }]}>{title}</Text>
      <Text style={[styles.kitPrefSub, { color: C.textSecondary }]}>{sub}</Text>
    </TouchableOpacity>
  );
}

function PriceRow({ label, amount, C, muted = false, sub }) {
  return (
    <View style={styles.priceLineRow}>
      <View>
        <Text style={{ fontSize: 13, color: muted ? C.textSecondary : C.text }}>{label}</Text>
        {sub && <Text style={{ fontSize: 10, color: C.textSecondary }}>{sub}</Text>}
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: muted ? C.textSecondary : C.text }}>{formatCurrency(amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  progressBar:    { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  stepChip:       { alignItems: 'center', gap: 3 },
  stepDot:        { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
  stepChipLabel:  { fontSize: 9, fontWeight: '600' },
  card:           { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardTitle:      { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  poojaHeroImg:   { width: '100%', height: 180, resizeMode: 'cover' },
  poojaTitle:     { fontSize: 22, fontWeight: '800', fontStyle: 'italic' },
  row:            { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subText:        { fontSize: 13 },
  shortDesc:      { fontSize: 13, lineHeight: 20 },
  infoBox:        { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  infoBoxTitle:   { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  bulletRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet:         { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  bulletText:     { flex: 1, fontSize: 12, lineHeight: 18 },
  priceRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  priceLabel:     { fontSize: 11 },
  priceAmount:    { fontSize: 28, fontWeight: '800', fontStyle: 'italic' },
  bookNowBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  bookNowText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  stepHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepHeaderIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  stepTitle:      { fontSize: 20, fontWeight: '800', fontStyle: 'italic' },
  stepSub:        { fontSize: 12, marginTop: 2 },
  navRow:         { flexDirection: 'row', gap: 10, marginTop: 4 },
  navBack:        { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  navBackText:    { fontWeight: '600', fontSize: 14 },
  navNext:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 13 },
  navNextText:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  typeCard:       { borderRadius: 16, borderWidth: 2, padding: 14 },
  typeCardRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  typeIcon:       { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  typeTitle:      { fontSize: 15, fontWeight: '700' },
  typeDesc:       { fontSize: 12, lineHeight: 18 },
  tagPill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  kitPrefRow:     { flexDirection: 'row', gap: 12 },
  kitPrefCard:    { flex: 1, borderRadius: 16, borderWidth: 2, padding: 14, alignItems: 'center', gap: 4 },
  kitBadge:       { position: 'absolute', top: -8, right: -8, backgroundColor: '#16A34A', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  kitBadgeText:   { color: '#fff', fontSize: 9, fontWeight: '700' },
  kitPrefTitle:   { fontSize: 14, fontWeight: '700' },
  kitPrefSub:     { fontSize: 11, textAlign: 'center' },
  kitCard:        { borderRadius: 14, padding: 14 },
  kitCardRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kitIconWrap:    { width: 56, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  kitImg:         { width: 56, height: 56, resizeMode: 'cover' },
  kitName:        { fontSize: 14, fontWeight: '700' },
  kitDesc:        { fontSize: 12, lineHeight: 16 },
  kitPrice:       { fontSize: 15, fontWeight: '800' },
  calendar:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  calHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  calMonth:       { fontSize: 14, fontWeight: '700' },
  calDays:        { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 6 },
  calDayLabel:    { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calGrid:        { flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  calCell:        { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  calDayNum:      { fontSize: 13, fontWeight: '500' },
  calSelected:    { borderTopWidth: StyleSheet.hairlineWidth, padding: 10, alignItems: 'center' },
  calSelectedText: { fontSize: 12, fontWeight: '600' },
  timeGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeSlot:       { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, minWidth: '30%' },
  timeSlotText:   { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  langRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 14, padding: 14 },
  langText:       { fontSize: 15, fontWeight: '600' },
  radioCircle:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  radioDot:       { width: 10, height: 10, borderRadius: 5 },
  fieldRow:       { flexDirection: 'row', gap: 10 },
  fieldLabel:     { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input:          { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  reviewRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  reviewImg:      { width: 44, height: 44, borderRadius: 10, resizeMode: 'cover' },
  reviewPoojaName: { fontSize: 15, fontWeight: '700' },
  urgentBadge:    { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  reviewGrid:     { borderTopWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  reviewItem:     { flexDirection: 'row', gap: 8 },
  reviewItemLabel: { fontSize: 12, width: 60 },
  reviewItemVal:  { flex: 1, fontSize: 12, fontWeight: '500' },
  priceLineRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  divider:        { height: 1 },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel:     { fontSize: 15, fontWeight: '800' },
  totalAmount:    { fontSize: 24, fontWeight: '800', fontStyle: 'italic' },
  payModeRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 14, padding: 12 },
  payModeTitle:   { fontSize: 14, fontWeight: '700' },
  payModeSub:     { fontSize: 11, marginTop: 2 },
  payModeAmt:     { fontSize: 14, fontWeight: '800' },
  partialOptBtn:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  partialSummary: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  trustRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  trustText:      { fontSize: 12, color: '#3B82F6', flex: 1 },
  payBtn:         { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  payBtnText:     { color: '#fff', fontSize: 16, fontWeight: '800' },
  backBtnAlt:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13 },
  backBtnAltText: { fontWeight: '600', fontSize: 14 },
});
