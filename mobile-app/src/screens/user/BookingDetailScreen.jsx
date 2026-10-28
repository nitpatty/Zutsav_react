import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, TextInput, Modal, ActivityIndicator, Share
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, formatStatus, refundStatusColor, resolveBookingBadge, paymentStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import { canUserCancel } from '../../utils/bookingRules';
import { useAuthStore } from '../../store/authStore';
import { openPaymentPage, resumeBookingPayment, isValidTransactionId } from '../../utils/paymentRecovery';
import PendingPaymentBanner from '../../components/shared/PendingPaymentBanner';
import { getCouponDisplay, getCoinDisplay } from '../../utils/discountDisplay';
import { useTranslation, useFormatters } from '../../i18n';
import { bookingStatusLabel, paymentStatusLabel, refundStatusLabel, paymentModeLabel } from '../../utils/bookingStatusLabels';

export default function BookingDetailScreen({ navigation, route }) {
  const { formatDateTime } = useFormatters();
  const { bookingId } = route.params || {};
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?._id);
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [booking,         setBooking]         = useState(null);
  const [referralDetails, setReferralDetails] = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [acting,          setActing]          = useState(false);

  // Rating modal
  const [ratingModal, setRatingModal] = useState(false);
  const [ratingVal,   setRatingVal]   = useState(5);
  const [ratingText,  setRatingText]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // Cancel modal
  const [cancelModal,   setCancelModal]   = useState(false);
  const [refundPreview, setRefundPreview] = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelling,    setCancelling]    = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/bookings/${bookingId}`);
      setBooking(data.data || data.booking);
      setReferralDetails(data.referralDetails || null);
    } catch {
      Toast.show({ type: 'error', text1: t('bookings.detailLoadFailed') });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetch(); }, [bookingId]);

  const handleRetryPayment = async () => {
    try {
      setActing(true);
      const { data } = await api.post(`/bookings/${bookingId}/retry-payment`);
      if (data.alreadyInFlight) {
        // A live attempt exists on the server: never start a second one — verify THAT transaction.
        const resumed = await resumeBookingPayment({ navigation, userId, bookingId, merchantTransactionId: data.merchantTransactionId });
        if (!resumed) Toast.show({ type: 'info', text1: t('bookings.attemptInProgress'), text2: t('bookings.pullToRefresh') });
        return;
      }
      if (data.redirectUrl && isValidTransactionId(data.merchantTransactionId)) {
        const opened = await openPaymentPage({
          userId,
          context: { type: 'booking', merchantTransactionId: data.merchantTransactionId, bookingId },
          redirectUrl: data.redirectUrl,
        });
        if (!opened.opened) {
          Toast.show({ type: 'error', text1: opened.reason === 'invalid_url' ? t('orders.retryInvalidLink') : t('bookings.startFailed') });
          return;
        }
        navigation.navigate('PaymentVerify', {
          merchantTransactionId: data.merchantTransactionId,
          bookingId,
          type: 'booking',
        });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || t('bookings.startFailed') });
    } finally { setActing(false); }
  };

  const handlePayRemaining = async () => {
    Alert.alert(
      t('bookings.payRemainingTitle'),
      t('bookings.payRemainingConfirm', { amount: formatCurrency(booking.remainingAmount || 0) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cart.payNow'),
          onPress: async () => {
            try {
              setActing(true);
              const { data } = await api.post(`/bookings/${bookingId}/pay-remaining`);
              if (data.redirectUrl && isValidTransactionId(data.merchantTransactionId)) {
                const opened = await openPaymentPage({
                  userId,
                  context: { type: 'booking-remaining', merchantTransactionId: data.merchantTransactionId, bookingId },
                  redirectUrl: data.redirectUrl,
                });
                if (!opened.opened) {
                  Toast.show({ type: 'error', text1: opened.reason === 'invalid_url' ? t('orders.retryInvalidLink') : t('bookings.startFailed') });
                  return;
                }
                navigation.navigate('PaymentVerify', {
                  merchantTransactionId: data.merchantTransactionId,
                  bookingId,
                  type: 'booking-remaining',
                });
              }
            } catch (err) {
              // 409 = a remaining-balance payment is already in progress; its response names the transaction. Resume it, never start another.
              if (err.response?.status === 409 && await resumeBookingPayment({ navigation, userId, bookingId, merchantTransactionId: err.response?.data?.merchantTransactionId })) return;
              Toast.show({ type: 'error', text1: err.response?.data?.message || t('bookings.failed') });
            } finally { setActing(false); }
          },
        },
      ]
    );
  };

  const handleSubmitRating = async () => {
    try {
      setSubmitting(true);
      // Backend (booking.controller rateBooking) reads `review`, not `comment`;
      // an empty string is the accepted "no written review" value.
      await api.post(`/bookings/${bookingId}/rate`, { rating: ratingVal, review: ratingText.trim() });
      Toast.show({ type: 'success', text1: t('bookings.thanks') });
      setRatingModal(false);
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || t('bookings.ratingFailed') });
    } finally { setSubmitting(false); }
  };

  const openCancelModal = async () => {
    setCancelModal(true);
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/bookings/${bookingId}/refund-preview`);
      setRefundPreview(data.refundPreview);
    } catch (err) {
      Toast.show({ type: 'error', text1: t('bookings.previewFailed') });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    try {
      setCancelling(true);
      await api.patch(`/bookings/${bookingId}/cancel`, { reason: cancelReason.trim() });
      Toast.show({ type: 'success', text1: t('bookings.cancelled') });
      setCancelModal(false);
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || t('bookings.cancelFailed') });
    } finally {
      setCancelling(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: t('bookings.shareText', {
          pooja: booking.poojaId?.name || '—',
          date: booking.scheduledDate ? formatDateTime(booking.scheduledDate) : '—',
          pandit: booking.panditId?.name || t('bookings.beingAssigned'),
          amount: formatCurrency(booking.grandTotal ?? booking.amount ?? 0),
          status: bookingStatusLabel(booking.status, t),
          id: booking._id?.slice(-8).toUpperCase(),
        }),
      });
    } catch {
      // user dismissed
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!booking) return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title={t('bookings.detailTitle')} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.textSecondary }}>{t('bookings.notFound')}</Text>
      </View>
    </View>
  );

  const ud = booking.userDetails || {};
  const addressStr = [ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', ') || '—';
  const couponInfo = getCouponDisplay(booking); // persisted values only; grandTotal is already net of them
  const coinInfo = getCoinDisplay(booking);
  const hasRemaining = booking.paymentMode === 'PARTIAL' && booking.remainingAmount > 0 && booking.paymentStatus !== 'FULLY_PAID';
  // Same rule the server enforces in rateBooking: only a completed booking whose
  // persisted `rating` is still unset can be rated (the website reads `b.rating`
  // the same way). `userRated` is not a field the API returns.
  const canRate = booking.status === 'completed' && (booking.rating === null || booking.rating === undefined);
  const canCancel = canUserCancel(booking.status);
  const hasRefund = booking.refund && booking.refund.status && booking.refund.status !== 'none';
  const canRetryPayment = booking.status === 'pending_payment';
  const badge = resolveBookingBadge(booking);
  const attempts = booking.paymentAttempts || [];
  const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('bookings.detailTitle')} />
      <PendingPaymentBanner navigation={navigation} kind="booking" bookingId={bookingId} onResolved={() => fetch(true)} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        {/* Status card */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.statusRow}>
            <Text style={[styles.poojaName, { color: C.text }]}>{booking.poojaId?.name || t('home.poojaFallback')}</Text>
            <StatusBadge status={badge.value} colorMap={badge.colorMap} label={badge.colorMap === paymentStatusColor ? paymentStatusLabel(badge.value, t) : bookingStatusLabel(badge.value, t)} />
          </View>
          <Text style={[styles.bookingId, { color: C.textSecondary }]}>{t('bookings.idLabel', { id: booking._id?.slice(-8).toUpperCase() })}</Text>
        </View>

        {/* Schedule */}
        <InfoCard title={t('bookings.scheduleTitle')} C={C}>
          <Row label={t('bookings.dateTime')} value={booking.scheduledDate ? formatDateTime(booking.scheduledDate) : '—'} C={C} />
          {booking.language && <Row label={t('booking.language')} value={booking.language} C={C} />}
          <Row label={t('booking.address')} value={addressStr} C={C} />
          {booking.specialNote && <Row label={t('bookings.note')} value={booking.specialNote} C={C} />}
        </InfoCard>

        {/* Pandit */}
        {booking.panditId && (
          <InfoCard title={t('bookings.panditTitle')} C={C}>
            <Row label={t('bookings.name')} value={booking.panditId.name  || '—'} C={C} />
            <Row label={t('bookings.phone')} value={booking.panditId.phone || '—'} C={C} />
            {booking.panditId.languages?.length > 0 && <Row label={t('bookings.languages')} value={booking.panditId.languages.join(', ')} C={C} />}
            {booking.panditId.experience ? <Row label={t('bookings.experience')} value={t('bookings.years', { n: booking.panditId.experience })} C={C} /> : null}
          </InfoCard>
        )}

        {/* Referral */}
        {referralDetails && (
          <InfoCard title={t('bookings.referredBy')} C={C}>
            <Row label={t('bookings.pandit')} value={referralDetails.panditName  || '—'} C={C} />
            <Row label={t('bookings.status')} value={formatStatus(referralDetails.status)} C={C} />
            {referralDetails.remark ? <Row label={t('bookings.remark')} value={referralDetails.remark} C={C} /> : null}
          </InfoCard>
        )}

        {/* Payment */}
        <InfoCard title={t('orders.payment')} C={C}>
          <Row label={t('orders.totalAmount')} value={formatCurrency(booking.grandTotal ?? booking.amount ?? 0)} C={C} />
          {couponInfo && <Row label={t('orders.coupon', { code: couponInfo.code })} value={t('bookings.couponOff', { amount: formatCurrency(couponInfo.discount) })} C={C} />}
          {coinInfo && <Row label={t('bookings.coinsRedeemed', { n: coinInfo.coins })} value={t('bookings.couponOff', { amount: formatCurrency(coinInfo.value) })} C={C} />}
          <Row label={t('bookings.paidAmount')} value={formatCurrency(booking.amountPaid  || 0)} C={C} />
          {hasRemaining && <Row label={t('bookings.pendingAmount')} value={formatCurrency(booking.remainingAmount || 0)} C={C} highlight />}
          <Row label={t('bookings.paymentMode')} value={paymentModeLabel(booking.paymentMode, t) || '—'} C={C} />
          <Row label={t('bookings.paymentStatus')} value={paymentStatusLabel(booking.paymentStatus, t) || '—'} C={C} />
          {attempts.length > 0 && (
            <Row label={t('bookings.retryAttempts')} value={String(attempts.length)} C={C} />
          )}
          {lastAttempt?.initiatedAt && (
            <Row label={t('bookings.lastAttempt')} value={formatDateTime(lastAttempt.initiatedAt)} C={C} />
          )}
          {lastAttempt?.failureReason && (
            <Row label={t('bookings.failureReason')} value={lastAttempt.failureReason} C={C} highlight />
          )}
        </InfoCard>

        {/* Refund status */}
        {hasRefund && (
          <InfoCard title={t('bookings.refundTitle')} C={C}>
            <Row label={t('bookings.eligibleAmount')} value={formatCurrency(booking.refund.eligibleAmount || 0)} C={C} />
            <Row label={t('bookings.refundedAmount')} value={formatCurrency(booking.refund.refundedAmount || 0)} C={C} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{t('bookings.status')}</Text>
              <StatusBadge status={booking.refund.status} colorMap={refundStatusColor} label={refundStatusLabel(booking.refund.status, t)} small />
            </View>
          </InfoCard>
        )}

        {/* Actions */}
        {canRetryPayment && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#DC2626' }]}
            onPress={handleRetryPayment}
            disabled={acting}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>
              {acting ? t('bookings.pleaseWait') : t('orders.retryPayment')}
            </Text>
          </TouchableOpacity>
        )}

        {hasRemaining && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.primary }]}
            onPress={handlePayRemaining}
            disabled={acting}
            activeOpacity={0.85}
          >
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>
              {acting ? t('bookings.pleaseWait') : t('bookings.payRemaining', { amount: formatCurrency(booking.remainingAmount || 0) })}
            </Text>
          </TouchableOpacity>
        )}

        {canRate && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
            onPress={() => setRatingModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="star" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>{t('bookings.rate')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: C.border }]}
          onPress={() => navigation.navigate('Invoice', { type: 'booking', id: bookingId })}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={18} color={C.text} />
          <Text style={[styles.outlineBtnText, { color: C.text }]}>{t('orders.downloadInvoice')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: C.border }]}
          onPress={handleShare}
          activeOpacity={0.85}
        >
          <Ionicons name="share-outline" size={18} color={C.text} />
          <Text style={[styles.outlineBtnText, { color: C.text }]}>{t('bookings.share')}</Text>
        </TouchableOpacity>

        {canCancel && (
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: '#DC262640' }]}
            onPress={openCancelModal}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={[styles.outlineBtnText, { color: '#DC2626' }]}>{t('bookings.cancelBooking')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Rating Modal */}
      <Modal visible={ratingModal} transparent animationType="slide" onRequestClose={() => setRatingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t('bookings.ratingTitle')}</Text>

            {/* Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setRatingVal(v)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={v > 1 ? t('bookings.stars', { n: v }) : t('bookings.star', { n: v })}
                  accessibilityState={{ selected: v === ratingVal }}
                >
                  <Ionicons name={v <= ratingVal ? 'star' : 'star-outline'} size={36} color="#D97706" />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.reviewInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder={t('bookings.reviewPlaceholder')}
              placeholderTextColor={C.textSecondary}
              value={ratingText}
              onChangeText={setRatingText}
              multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setRatingModal(false)}>
                <Text style={[styles.cancelBtnText, { color: C.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: C.primary }]}
                onPress={handleSubmitRating}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>{submitting ? t('bookings.submitting') : t('bookings.submit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel Modal */}
      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => setCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>{t('bookings.cancelBooking')}</Text>

            {previewLoading ? (
              <ActivityIndicator color={C.primary} />
            ) : refundPreview ? (
              <View style={{ gap: 8 }}>
                <Row label={t('bookings.totalPaid')} value={formatCurrency(refundPreview.grandTotal || 0)} C={C} />
                <Row label={t('bookings.refundable')} value={formatCurrency(refundPreview.refundableAmount || 0)} C={C} highlight />
                {refundPreview.nonRefundableTotal > 0 && <Row label={t('bookings.nonRefundable')} value={formatCurrency(refundPreview.nonRefundableTotal)} C={C} />}
              </View>
            ) : (
              <Text style={{ color: C.textSecondary, fontSize: 13 }}>{t('bookings.previewUnavailable')}</Text>
            )}

            <TextInput
              style={[styles.reviewInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder={t('bookings.reasonPlaceholder')}
              placeholderTextColor={C.textSecondary}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setCancelModal(false)}>
                <Text style={[styles.cancelBtnText, { color: C.text }]}>{t('bookings.keepBooking')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#DC2626' }]}
                onPress={handleConfirmCancel}
                disabled={cancelling}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>{cancelling ? t('bookings.cancelling') : t('bookings.confirmCancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoCard({ title, children, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.cardTitle, { color: C.text }]}>{title}</Text>
      <View style={{ gap: 8, marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Row({ label, value, C, highlight = false }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: highlight ? C.primary : C.text }, highlight && { fontWeight: '800' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 16 },
  statusRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  poojaName:  { fontSize: 17, fontWeight: '700', flex: 1 },
  bookingId:  { fontSize: 12, marginTop: 4 },
  cardTitle:  { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLabel:   { fontSize: 13, flex: 1 },
  rowVal:     { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: '#00000066',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16,
  },
  modalTitle:  { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  starsRow:    { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  reviewInput: {
    borderWidth: 1.5, borderRadius: 12, padding: 12,
    fontSize: 14, minHeight: 80, textAlignVertical: 'top',
  },
  modalBtns:   { flexDirection: 'row', gap: 12 },
  cancelBtn:   { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  submitBtn:   { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
