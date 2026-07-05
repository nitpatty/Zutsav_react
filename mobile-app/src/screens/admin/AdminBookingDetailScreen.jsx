import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, FlatList, Modal, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime, formatCurrency, formatStatus, bookingStatusColor } from '../../utils/helpers';
import { callPhone, openWhatsApp, openMaps } from '../../utils/quickActions';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

// Mirrors backend's BOOKING_TRANSITIONS (admin.controller.js) — client-side
// copy only used to hide an action that would 400 anyway; the backend
// remains the source of truth and still enforces this.
const BOOKING_TRANSITIONS = {
  pending_payment:      ['paid', 'cancelled'],
  paid:                 ['pandit_assigned', 'cancelled'],
  pandit_assigned:      ['pandit_accepted', 'pending_reassignment', 'paid', 'cancelled'],
  pandit_accepted:      ['completion_requested', 'pandit_assigned', 'cancelled'],
  pending_reassignment: ['pandit_assigned', 'cancelled'],
  completion_requested: ['completed', 'pandit_accepted', 'cancelled'],
  completed:            ['refunded', 'closed'],
  cancelled:            ['refunded', 'closed'],
  refunded:             ['closed'],
  closed:               [],
};

export default function AdminBookingDetailScreen({ route }) {
  const { bookingId } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [booking,    setBooking]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pandit assignment
  const [assignModal, setAssignModal] = useState(false);
  const [pandits,     setPandits]     = useState([]);
  const [panditsLoading, setPanditsLoading] = useState(false);
  const [assigning,   setAssigning]   = useState(false);

  // Cancel booking
  const [cancelModal,  setCancelModal]  = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling,   setCancelling]   = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/admin/bookings/${bookingId}`);
      setBooking(data.data || data.booking);
    } catch { Toast.show({ type: 'error', text1: 'Could not load booking' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [bookingId]);

  const openAssignModal = async () => {
    setAssignModal(true);
    try {
      setPanditsLoading(true);
      const { data } = await api.get('/admin/pandits', { params: { limit: 100, isAvailable: true } });
      setPandits(data.data || data.pandits || []);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load pandits' });
    } finally { setPanditsLoading(false); }
  };

  const handleAssign = async (panditId) => {
    try {
      setAssigning(true);
      await api.patch(`/admin/bookings/${bookingId}/assign`, { panditId });
      Toast.show({ type: 'success', text1: 'Pandit assigned!' });
      setAssignModal(false);
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Assignment failed' });
    } finally { setAssigning(false); }
  };

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await api.patch(`/admin/bookings/${bookingId}/status`, { status: 'cancelled', cancelReason: cancelReason.trim() || undefined });
      Toast.show({ type: 'success', text1: 'Booking cancelled' });
      setCancelModal(false);
      setCancelReason('');
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not cancel booking' });
    } finally { setCancelling(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!booking) return null;

  const ud = booking.userDetails || {};
  const addressStr = [ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', ') || '—';
  const canAssign = ['paid', 'pandit_assigned'].includes(booking.status);
  const canCancel = (BOOKING_TRANSITIONS[booking.status] || []).includes('cancelled');
  const canRefund = ['cancelled', 'refunded'].includes(booking.status) || (booking.refund && booking.refund.status !== 'none');
  const hasReferral = !!booking.referral?.referralId;
  const referral = booking.referral?.referralId || {};
  const referringPandit = booking.referral?.referringPanditId || {};

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Booking Detail" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}>
            <Text style={[styles.title, { color: C.text }]}>{booking.poojaId?.name || 'Pooja'}</Text>
            <StatusBadge status={booking.status} colorMap={bookingStatusColor} />
          </View>
          <Text style={[styles.id, { color: C.textSecondary }]}>ID: {booking._id?.slice(-8).toUpperCase()}</Text>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction icon="call" label="Call" C={C} onPress={() => callPhone(ud.phone || booking.userId?.phone)} />
          <QuickAction icon="logo-whatsapp" label="WhatsApp" C={C} onPress={() => openWhatsApp(ud.phone || booking.userId?.phone)} />
          <QuickAction icon="location" label="Maps" C={C} onPress={() => openMaps(addressStr)} />
          <QuickAction icon="document-text" label="Invoice" C={C} onPress={() => navigation.navigate('Invoice', { type: 'booking', id: bookingId })} />
        </View>

        <InfoCard title="Devotee" C={C}>
          <Row l="Name"  v={ud.name  || booking.userId?.name  || '—'} C={C} />
          <Row l="Phone" v={ud.phone || booking.userId?.phone || '—'} C={C} />
          {ud.email && <Row l="Email" v={ud.email} C={C} />}
        </InfoCard>

        <InfoCard title="Assigned Pandit" C={C}>
          <Row l="Name"  v={booking.panditId?.name || booking.panditId?.userId?.name || 'Unassigned'} C={C} />
          {booking.panditId?.phone && <Row l="Phone" v={booking.panditId.phone} C={C} />}
        </InfoCard>

        {hasReferral && (
          <InfoCard title="Referral" C={C}>
            <Row l="Referred By" v={referringPandit.name || '—'} C={C} />
            {referringPandit.phone && <Row l="Pandit Phone" v={referringPandit.phone} C={C} />}
            <Row l="Status" v={formatStatus(referral.status)} C={C} />
            {referral.remark ? <Row l="Remark" v={referral.remark} C={C} /> : null}
          </InfoCard>
        )}

        <InfoCard title="Schedule" C={C}>
          <Row l="Date & Time" v={booking.scheduledDate ? formatDateTime(booking.scheduledDate) : '—'} C={C} />
          {booking.language && <Row l="Language" v={booking.language} C={C} />}
          <Row l="Address" v={addressStr} C={C} />
          {booking.specialNote && <Row l="Note" v={booking.specialNote} C={C} />}
        </InfoCard>

        <InfoCard title="Payment" C={C}>
          <Row l="Total"     v={formatCurrency(booking.grandTotal ?? booking.amount ?? 0)} C={C} highlight />
          <Row l="Paid"      v={formatCurrency(booking.amountPaid || 0)} C={C} />
          {booking.remainingAmount > 0 && <Row l="Remaining" v={formatCurrency(booking.remainingAmount)} C={C} />}
          <Row l="Mode"      v={formatStatus(booking.paymentMode)   || '—'} C={C} />
          <Row l="Status"    v={formatStatus(booking.paymentStatus) || '—'} C={C} />
        </InfoCard>

        {canAssign && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: C.primary }]}
            onPress={openAssignModal}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>
              {booking.panditId ? 'Reassign Pandit' : 'Assign Pandit'}
            </Text>
          </TouchableOpacity>
        )}

        {canRefund && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0891B2' }]}
            onPress={() => navigation.navigate('Refunds', { screen: 'AdminRefundDetail', params: { bookingId } })}
            activeOpacity={0.85}
          >
            <Ionicons name="cash" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Refund</Text>
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#DC2626' }]}
            onPress={() => setCancelModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Pandit selection modal */}
      <Modal visible={assignModal} transparent animationType="slide" onRequestClose={() => setAssignModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Select Pandit</Text>
              <TouchableOpacity onPress={() => setAssignModal(false)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            {panditsLoading ? (
              <LoadingSpinner />
            ) : (
              <FlatList
                data={pandits}
                keyExtractor={(p) => p._id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.panditRow, { borderBottomColor: C.border }]}
                    onPress={() => {
                      Alert.alert('Assign Pandit', `Assign ${item.userId?.name || item.name} to this booking?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Assign', onPress: () => handleAssign(item._id) },
                      ]);
                    }}
                    activeOpacity={0.8}
                    disabled={assigning}
                  >
                    <View style={[styles.panditAvatar, { backgroundColor: C.primary + '20' }]}>
                      <Text style={[styles.panditAvatarText, { color: C.primary }]}>
                        {(item.userId?.name || item.name || 'P').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.panditName, { color: C.text }]}>{item.userId?.name || item.name || '—'}</Text>
                      <Text style={[styles.panditMeta, { color: C.textSecondary }]}>
                        {item.averageRating ? `★ ${item.averageRating.toFixed(1)} · ` : ''}
                        {item.poojaTypes?.slice(0, 2).join(', ') || ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { color: C.textSecondary }]}>No available pandits</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Cancel booking modal */}
      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => setCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Cancel Booking</Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Reason for cancellation (optional)…"
              placeholderTextColor={C.textSecondary}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: C.border }]} onPress={() => setCancelModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Keep Booking</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: '#DC2626' }]} onPress={handleCancel} disabled={cancelling}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{cancelling ? 'Cancelling…' : 'Confirm Cancel'}</Text>
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
    <TouchableOpacity style={[styles.quickBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={18} color={C.primary} />
      <Text style={[styles.quickLabel, { color: C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InfoCard({ title, children, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.cardTitle, { color: C.text }]}>{title}</Text>
      <View style={{ gap: 6, marginTop: 6 }}>{children}</View>
    </View>
  );
}

function Row({ l, v, C, highlight = false }) {
  return (
    <View style={styles.rowItem}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{l}</Text>
      <Text style={[styles.rowVal, { color: highlight ? C.primary : C.text }, highlight && { fontWeight: '800' }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  card:         { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title:        { fontSize: 17, fontWeight: '700', flex: 1 },
  id:           { fontSize: 12 },
  cardTitle:    { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem:      { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:     { fontSize: 13, flex: 1 },
  rowVal:       { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  quickRow:     { flexDirection: 'row', gap: 10 },
  quickBtn:     { flex: 1, alignItems: 'center', gap: 4, borderRadius: 14, borderWidth: 1, paddingVertical: 12 },
  quickLabel:   { fontSize: 11, fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay:  { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 32, gap: 14,
  },
  modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  panditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  panditAvatar:  { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  panditAvatarText: { fontSize: 16, fontWeight: '800' },
  panditName:    { fontSize: 14, fontWeight: '700' },
  panditMeta:    { fontSize: 12, marginTop: 2 },
  emptyText:     { textAlign: 'center', padding: 20, fontSize: 14 },
  reasonInput:   { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalBtns:     { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalConfirmBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
