import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, TextInput, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { COLORS, RADIUS, SPACING, SHADOW, FONT, ICON_SIZE, SIZES } from '../../theme/tokens';
import { formatDateTime, formatCurrency, formatStatus, formatAuditAction, bookingStatusColor } from '../../utils/helpers';
import { callPhone, openWhatsApp, openMaps } from '../../utils/quickActions';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Timeline from '../../components/shared/Timeline';
import { InfoCard, Row } from '../../components/shared/InfoCard';
import StickyActionBar, { useStickyActionBarHeight } from '../../components/pandit/StickyActionBar';

export default function PanditBookingDetailScreen({ route }) {
  const { bookingId } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const actionBarHeight = useStickyActionBarHeight();

  const [booking,         setBooking]         = useState(null);
  const [referralDetails, setReferralDetails] = useState(null);
  const [paymentLedger,   setPaymentLedger]   = useState([]);
  const [approvedFee,     setApprovedFee]     = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [acting,          setActing]          = useState(false);

  // Reject flow
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Completion OTP flow
  const [otpModal,   setOtpModal]   = useState(false);
  const [otp,        setOtp]        = useState('');
  const [verifying,  setVerifying]  = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/bookings/${bookingId}`);
      setBooking(data.booking);
      setReferralDetails(data.referralDetails || null);
      setPaymentLedger(data.paymentLedger || []);
      setApprovedFee(data.approvedFee ?? null);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load booking' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetch(); }, [bookingId]);

  const handleAccept = async () => {
    try {
      setActing(true);
      await api.patch(`/pandits/me/bookings/${bookingId}/accept`);
      Toast.show({ type: 'success', text1: 'Booking accepted!' });
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
    } finally { setActing(false); }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 10) {
      Toast.show({ type: 'error', text1: 'Reason must be at least 10 characters' });
      return;
    }
    try {
      setActing(true);
      await api.patch(`/pandits/me/bookings/${bookingId}/reject`, { reason: rejectReason.trim() });
      Toast.show({ type: 'success', text1: 'Booking rejected' });
      setRejectModal(false);
      setRejectReason('');
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
    } finally { setActing(false); }
  };

  const handleRequestCompletion = async () => {
    try {
      setActing(true);
      await api.patch(`/pandits/me/bookings/${bookingId}/request-completion`);
      Toast.show({ type: 'success', text1: 'OTP sent to devotee!' });
      setOtpModal(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
    } finally { setActing(false); }
  };

  const handleVerifyCompletion = async () => {
    if (!otp.trim()) {
      Toast.show({ type: 'error', text1: 'Enter the OTP from devotee' });
      return;
    }
    try {
      setVerifying(true);
      await api.post(`/pandits/me/bookings/${bookingId}/verify-completion-otp`, { otp: otp.trim() });
      Toast.show({ type: 'success', text1: 'Booking marked as completed!' });
      setOtpModal(false);
      setOtp('');
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Invalid OTP' });
    } finally { setVerifying(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!booking) return null;

  const ud = booking.userDetails || {};
  const addressStr = [ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', ') || '—';

  const timelineEvents = (booking.auditLog || []).map((a) => ({
    label: formatAuditAction(a.action),
    note:  a.note,
    at:    a.at,
  }));

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader title="Booking Detail" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: actionBarHeight }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}>
            <Text style={[styles.poojaName, { color: C.text }]}>{booking.poojaId?.name || 'Pooja'}</Text>
            <StatusBadge status={booking.status} colorMap={bookingStatusColor} />
          </View>
          <Text style={[styles.meta, { color: C.textSecondary }]}>Booking #{booking.bookingNumber || booking._id?.slice(-8).toUpperCase()}</Text>
        </View>

        <View style={styles.feeCard}>
          <View style={styles.feeIconWrap}>
            <Ionicons name="wallet" size={ICON_SIZE.md} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.feeLabel}>Your Approved Fee</Text>
            {approvedFee > 0 ? (
              <>
                <Text style={styles.feeAmount}>{formatCurrency(approvedFee)}</Text>
                <Text style={styles.feeSub}>Admin Approved Rate</Text>
              </>
            ) : (
              <Text style={styles.feePending}>Pending Admin Approval</Text>
            )}
          </View>
        </View>

        <InfoCard title="Devotee" C={C}>
          <Row label="Name"    value={ud.name  || booking.userId?.name  || '—'} C={C} />
          <Row label="Phone"   value={ud.phone || booking.userId?.phone || '—'} C={C} />
          {ud.email && <Row label="Email"  value={ud.email} C={C} />}
        </InfoCard>

        <View style={styles.quickActionsRow}>
          <QuickAction icon="call" label="Call" C={C} onPress={() => callPhone(ud.phone)} />
          <QuickAction icon="logo-whatsapp" label="WhatsApp" C={C} onPress={() => openWhatsApp(ud.phone, `Regarding your ${booking.poojaId?.name || 'pooja'} booking (#${booking.bookingNumber})`)} />
          <QuickAction icon="location" label="Maps" C={C} onPress={() => openMaps(addressStr)} />
        </View>

        <InfoCard title="Schedule" C={C}>
          <Row label="Date & Time"   value={booking.scheduledDate ? formatDateTime(booking.scheduledDate) : '—'} C={C} />
          {booking.language && <Row label="Language" value={booking.language} C={C} />}
          <Row label="Address"       value={addressStr} C={C} />
          {booking.specialNote && <Row label="Note" value={booking.specialNote} C={C} />}
        </InfoCard>

        {referralDetails && (
          <InfoCard title="Referral" C={C}>
            {referralDetails.panditName ? <Row label="Referred By" value={referralDetails.panditName} C={C} /> : null}
            <Row label="Status" value={formatStatus(referralDetails.status)} C={C} />
            {referralDetails.remark ? <Row label="Remark" value={referralDetails.remark} C={C} /> : null}
          </InfoCard>
        )}

        {paymentLedger.length > 1 && (
          <InfoCard title="Payment History" C={C}>
            {paymentLedger.map((p, i) => (
              <View key={p._id || i} style={i > 0 ? { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border } : null}>
                <Row label={formatStatus(p.paymentType) || 'Payment'} value={formatCurrency(p.amount)} C={C} />
                {p.paidAt ? <Text style={[styles.ledgerMeta, { color: C.textSecondary }]}>{formatDateTime(p.paidAt)}</Text> : null}
              </View>
            ))}
          </InfoCard>
        )}

        <InfoCard title="Booking Timeline" C={C}>
          <Timeline events={timelineEvents} />
        </InfoCard>

      </ScrollView>

      {/* Action footer */}
      {booking.status === 'pandit_assigned' && (
        <StickyActionBar>
          <TouchableOpacity style={[styles.rejectBtn, { borderColor: '#DC2626' }]} onPress={() => setRejectModal(true)} disabled={acting}>
            <Text style={[styles.rejectBtnText, { color: '#DC2626' }]}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: '#16A34A' }]} onPress={handleAccept} disabled={acting} activeOpacity={0.85}>
            <Text style={styles.btnText}>{acting ? 'Processing…' : 'Accept'}</Text>
          </TouchableOpacity>
        </StickyActionBar>
      )}

      {booking.status === 'pandit_accepted' && (
        <StickyActionBar>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: C.primary, flex: 1 }]}
            onPress={handleRequestCompletion}
            disabled={acting}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{acting ? 'Sending OTP…' : 'Request Completion'}</Text>
          </TouchableOpacity>
        </StickyActionBar>
      )}

      {booking.status === 'completion_requested' && (
        <StickyActionBar>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: C.primary, flex: 1 }]}
            onPress={() => setOtpModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Enter Completion OTP</Text>
          </TouchableOpacity>
        </StickyActionBar>
      )}

      {/* Reject Modal */}
      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Reject Booking</Text>
            <Text style={[styles.modalSub, { color: C.textSecondary }]}>Please share a reason (min 10 characters). This booking will be reassigned by admin.</Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Reason for rejection…"
              placeholderTextColor={C.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setRejectModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#DC2626' }]} onPress={handleReject} disabled={acting}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{acting ? 'Please wait…' : 'Confirm Reject'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* OTP Modal */}
      <Modal visible={otpModal} transparent animationType="slide" onRequestClose={() => setOtpModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Verify Completion</Text>
            <Text style={[styles.modalSub, { color: C.textSecondary }]}>
              Ask the devotee for the OTP sent to their phone.
            </Text>
            <TextInput
              style={[styles.otpInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Enter OTP"
              placeholderTextColor={C.textSecondary}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => { setOtpModal(false); setOtp(''); }}>
                <Text style={[styles.cancelBtnText, { color: C.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: C.primary }]}
                onPress={handleVerifyCompletion}
                disabled={verifying}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>{verifying ? 'Verifying…' : 'Verify & Complete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function QuickAction({ icon, label, C, onPress }) {
  return (
    <TouchableOpacity style={[styles.quickActionBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={20} color={C.primary} />
      <Text style={[styles.quickActionText, { color: C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 16 },
  feeCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.base,
    borderWidth: 1, borderColor: COLORS.primaryLight,
    ...SHADOW.raised,
  },
  feeIconWrap: {
    width: SIZES.iconContainerMd, height: SIZES.iconContainerMd, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + '18', justifyContent: 'center', alignItems: 'center',
  },
  feeLabel:   { fontSize: FONT.size.label, fontWeight: FONT.weight.bold, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  feeAmount:  { fontSize: FONT.size.heading, fontWeight: FONT.weight.black, color: COLORS.primaryDark, marginTop: 2 },
  feeSub:     { fontSize: FONT.size.caption, color: COLORS.textSecondary, marginTop: 1 },
  feePending: { fontSize: FONT.size.body, fontWeight: FONT.weight.bold, color: COLORS.warning, marginTop: 4 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  poojaName:  { fontSize: 17, fontWeight: '700', flex: 1 },
  meta:       { fontSize: 12, marginTop: 4 },
  ledgerMeta: { fontSize: 11, marginTop: 2 },
  quickActionsRow: { flexDirection: 'row', gap: 10 },
  quickActionBtn:  { flex: 1, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingVertical: 12 },
  quickActionText: { fontSize: 11, fontWeight: '600' },
  rejectBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  rejectBtnText: { fontSize: 15, fontWeight: '700' },
  acceptBtn:  { flex: 2, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  modalSub:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  reasonInput: {
    borderWidth: 1.5, borderRadius: 12, padding: 12,
    fontSize: 14, minHeight: 90, textAlignVertical: 'top',
  },
  otpInput: {
    borderWidth: 1.5, borderRadius: 12, paddingVertical: 14,
    fontSize: 28, fontWeight: '800', letterSpacing: 8,
  },
  modalBtns:  { flexDirection: 'row', gap: 12 },
  cancelBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600' },
  submitBtn:  { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
