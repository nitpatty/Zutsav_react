import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, TextInput, Modal, ActivityIndicator, Share
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime, formatCurrency, formatStatus, formatAuditAction, bookingStatusColor, refundStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Timeline from '../../components/shared/Timeline';

const CANCELLABLE_STATUSES = ['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment', 'completion_requested'];

export default function BookingDetailScreen({ navigation, route }) {
  const { bookingId } = route.params || {};
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
      Toast.show({ type: 'error', text1: 'Could not load booking' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetch(); }, [bookingId]);

  const handlePayRemaining = async () => {
    Alert.alert(
      'Pay Remaining',
      `Pay the remaining ${formatCurrency(booking.remainingAmount || 0)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            try {
              setActing(true);
              const { data } = await api.post(`/bookings/${bookingId}/pay-remaining`);
              if (data.redirectUrl) {
                const { Linking } = require('react-native');
                await Linking.openURL(data.redirectUrl);
                navigation.navigate('PaymentVerify', {
                  merchantTransactionId: data.merchantTransactionId,
                  bookingId,
                  type: 'booking-remaining',
                });
              }
            } catch (err) {
              Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
            } finally { setActing(false); }
          },
        },
      ]
    );
  };

  const handleSubmitRating = async () => {
    try {
      setSubmitting(true);
      await api.post(`/bookings/${bookingId}/rate`, { rating: ratingVal, comment: ratingText.trim() });
      Toast.show({ type: 'success', text1: 'Thank you for your review!' });
      setRatingModal(false);
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Rating failed' });
    } finally { setSubmitting(false); }
  };

  const openCancelModal = async () => {
    setCancelModal(true);
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/bookings/${bookingId}/refund-preview`);
      setRefundPreview(data.refundPreview);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Could not load refund preview' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    try {
      setCancelling(true);
      await api.patch(`/bookings/${bookingId}/cancel`, { reason: cancelReason.trim() });
      Toast.show({ type: 'success', text1: 'Booking cancelled' });
      setCancelModal(false);
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not cancel booking' });
    } finally {
      setCancelling(false);
    }
  };

  const handleShare = async () => {
    try {
      const ud = booking.userDetails || {};
      const lines = [
        `🪔 *Zutsav Booking*`,
        `Pooja: ${booking.poojaId?.name || '—'}`,
        `Date: ${booking.scheduledDate ? formatDateTime(booking.scheduledDate) : '—'}`,
        `Pandit: ${booking.panditId?.name || 'Being assigned'}`,
        `Amount: ${formatCurrency(booking.grandTotal ?? booking.amount ?? 0)}`,
        `Status: ${formatStatus(booking.status)}`,
        `Booking ID: ${booking._id?.slice(-8).toUpperCase()}`,
        ``,
        `Track: zutsav.com/my-bookings`,
      ];
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user dismissed
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!booking) return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title="Booking Detail" />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.textSecondary }}>Booking not found</Text>
      </View>
    </View>
  );

  const ud = booking.userDetails || {};
  const addressStr = [ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', ') || '—';
  const hasRemaining = booking.paymentMode === 'PARTIAL' && booking.remainingAmount > 0 && booking.paymentStatus !== 'FULLY_PAID';
  const canRate = booking.status === 'completed' && !booking.userRated;
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
  const hasRefund = booking.refund && booking.refund.status && booking.refund.status !== 'none';

  const timelineEvents = (booking.auditLog || []).map((a) => ({
    label: formatAuditAction(a.action),
    note:  a.note,
    at:    a.at,
  }));

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Booking Detail" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        {/* Status card */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.statusRow}>
            <Text style={[styles.poojaName, { color: C.text }]}>{booking.poojaId?.name || 'Pooja'}</Text>
            <StatusBadge status={booking.status} colorMap={bookingStatusColor} />
          </View>
          <Text style={[styles.bookingId, { color: C.textSecondary }]}>ID: {booking._id?.slice(-8).toUpperCase()}</Text>
        </View>

        {/* Schedule */}
        <InfoCard title="Schedule" C={C}>
          <Row label="Date & Time" value={booking.scheduledDate ? formatDateTime(booking.scheduledDate) : '—'} C={C} />
          {booking.language && <Row label="Language" value={booking.language} C={C} />}
          <Row label="Address" value={addressStr} C={C} />
          {booking.specialNote && <Row label="Note" value={booking.specialNote} C={C} />}
        </InfoCard>

        {/* Pandit */}
        {booking.panditId && (
          <InfoCard title="Assigned Pandit" C={C}>
            <Row label="Name"  value={booking.panditId.name  || '—'} C={C} />
            <Row label="Phone" value={booking.panditId.phone || '—'} C={C} />
            {booking.panditId.languages?.length > 0 && <Row label="Languages" value={booking.panditId.languages.join(', ')} C={C} />}
            {booking.panditId.experience ? <Row label="Experience" value={`${booking.panditId.experience} yrs`} C={C} /> : null}
          </InfoCard>
        )}

        {/* Referral */}
        {referralDetails && (
          <InfoCard title="Referred by Pandit" C={C}>
            <Row label="Pandit"  value={referralDetails.panditName  || '—'} C={C} />
            <Row label="Status"  value={formatStatus(referralDetails.status)} C={C} />
            {referralDetails.remark ? <Row label="Remark" value={referralDetails.remark} C={C} /> : null}
          </InfoCard>
        )}

        {/* Payment */}
        <InfoCard title="Payment" C={C}>
          <Row label="Total Amount"  value={formatCurrency(booking.grandTotal ?? booking.amount ?? 0)} C={C} />
          <Row label="Paid Amount"   value={formatCurrency(booking.amountPaid  || 0)} C={C} />
          {hasRemaining && <Row label="Pending Amount" value={formatCurrency(booking.remainingAmount || 0)} C={C} highlight />}
          <Row label="Payment Mode"   value={formatStatus(booking.paymentMode)   || '—'} C={C} />
          <Row label="Payment Status" value={formatStatus(booking.paymentStatus) || '—'} C={C} />
        </InfoCard>

        {/* Refund status */}
        {hasRefund && (
          <InfoCard title="Refund Status" C={C}>
            <Row label="Eligible Amount" value={formatCurrency(booking.refund.eligibleAmount || 0)} C={C} />
            <Row label="Refunded Amount" value={formatCurrency(booking.refund.refundedAmount || 0)} C={C} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: C.textSecondary }]}>Status</Text>
              <StatusBadge status={booking.refund.status} colorMap={refundStatusColor} small />
            </View>
          </InfoCard>
        )}

        {/* Timeline */}
        <InfoCard title="Booking Timeline" C={C}>
          <Timeline events={timelineEvents} />
        </InfoCard>

        {/* Actions */}
        {hasRemaining && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.primary }]}
            onPress={handlePayRemaining}
            disabled={acting}
            activeOpacity={0.85}
          >
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>
              {acting ? 'Please wait…' : `Pay Remaining ${formatCurrency(booking.remainingAmount || 0)}`}
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
            <Text style={styles.actionBtnText}>Rate this Pooja</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: C.border }]}
          onPress={() => navigation.navigate('Invoice', { type: 'booking', id: bookingId })}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={18} color={C.text} />
          <Text style={[styles.outlineBtnText, { color: C.text }]}>Download Invoice</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: C.border }]}
          onPress={handleShare}
          activeOpacity={0.85}
        >
          <Ionicons name="share-outline" size={18} color={C.text} />
          <Text style={[styles.outlineBtnText, { color: C.text }]}>Share Booking</Text>
        </TouchableOpacity>

        {canCancel && (
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: '#DC262640' }]}
            onPress={openCancelModal}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={[styles.outlineBtnText, { color: '#DC2626' }]}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Rating Modal */}
      <Modal visible={ratingModal} transparent animationType="slide" onRequestClose={() => setRatingModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Rate Your Experience</Text>

            {/* Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((v) => (
                <TouchableOpacity key={v} onPress={() => setRatingVal(v)} activeOpacity={0.8}>
                  <Ionicons name={v <= ratingVal ? 'star' : 'star-outline'} size={36} color="#D97706" />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.reviewInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Share your experience (optional)…"
              placeholderTextColor={C.textSecondary}
              value={ratingText}
              onChangeText={setRatingText}
              multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setRatingModal(false)}>
                <Text style={[styles.cancelBtnText, { color: C.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: C.primary }]}
                onPress={handleSubmitRating}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel Modal */}
      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => setCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Cancel Booking</Text>

            {previewLoading ? (
              <ActivityIndicator color={C.primary} />
            ) : refundPreview ? (
              <View style={{ gap: 8 }}>
                <Row label="Total Paid" value={formatCurrency(refundPreview.grandTotal || 0)} C={C} />
                <Row label="Refundable Amount" value={formatCurrency(refundPreview.refundableAmount || 0)} C={C} highlight />
                {refundPreview.nonRefundableTotal > 0 && <Row label="Non-Refundable" value={formatCurrency(refundPreview.nonRefundableTotal)} C={C} />}
              </View>
            ) : (
              <Text style={{ color: C.textSecondary, fontSize: 13 }}>Refund preview unavailable</Text>
            )}

            <TextInput
              style={[styles.reviewInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Reason for cancellation (optional)…"
              placeholderTextColor={C.textSecondary}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setCancelModal(false)}>
                <Text style={[styles.cancelBtnText, { color: C.text }]}>Keep Booking</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#DC2626' }]}
                onPress={handleConfirmCancel}
                disabled={cancelling}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>{cancelling ? 'Cancelling…' : 'Confirm Cancel'}</Text>
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
