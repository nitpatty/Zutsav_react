import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, formatDateTime, formatStatus, refundStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function AdminRefundDetailScreen({ route }) {
  const { bookingId } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [details,    setDetails]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/admin/bookings/${bookingId}/refund-details`);
      setDetails(data.refundDetails);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load refund details' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetch(); }, [bookingId]);

  const process = async (body) => {
    try {
      setActing(true);
      await api.patch(`/admin/bookings/${bookingId}/refund/process`, body);
      Toast.show({ type: 'success', text1: 'Refund updated' });
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not update refund' });
    } finally {
      setActing(false);
    }
  };

  const handleApprove = () => process({ refundStatus: 'approved' });

  const handleReject = async () => {
    await process({ refundStatus: 'rejected', refundedAmount: 0, notes: rejectReason.trim() || undefined });
    setRejectModal(false);
    setRejectReason('');
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!details) return null;

  const status = details.refund?.status || 'none';
  const canApprove = ['pending'].includes(status);
  const canReject = ['pending', 'approved'].includes(status);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Refund Detail" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}>
            <Text style={[styles.title, { color: C.text }]}>{details.bookingNumber}</Text>
            <StatusBadge status={status} colorMap={refundStatusColor} />
          </View>
          <Text style={[styles.sub, { color: C.textSecondary }]}>{details.poojaName}</Text>
        </View>

        <InfoCard title="Customer" C={C}>
          <Row l="Name" v={details.customerName || '—'} C={C} />
          <Row l="Phone" v={details.customerPhone || '—'} C={C} />
        </InfoCard>

        <InfoCard title="Refund Breakdown" C={C}>
          <Row l="Grand Total" v={formatCurrency(details.grandTotal || 0)} C={C} />
          <Row l="Amount Paid" v={formatCurrency(details.amountPaid || 0)} C={C} />
          <Row l="Non-Refundable" v={formatCurrency(details.nonRefundableTotal || 0)} C={C} />
          <Row l="Refundable Amount" v={formatCurrency(details.refundableAmount || 0)} C={C} highlight />
          {details.policy ? <Text style={[styles.policy, { color: C.textSecondary }]}>{details.policy}</Text> : null}
        </InfoCard>

        {details.refund?.refundedAmount > 0 && (
          <InfoCard title="Processed Refund" C={C}>
            <Row l="Refunded Amount" v={formatCurrency(details.refund.refundedAmount)} C={C} />
            {details.refund.transactionId ? <Row l="Transaction ID" v={details.refund.transactionId} C={C} /> : null}
            {details.refund.method ? <Row l="Method" v={formatStatus(details.refund.method)} C={C} /> : null}
            {details.refund.notes ? <Row l="Notes" v={details.refund.notes} C={C} /> : null}
          </InfoCard>
        )}

        {(details.paymentLedger || []).length > 0 && (
          <InfoCard title="Payment Details" C={C}>
            {details.paymentLedger.map((p, i) => (
              <View key={p._id || i} style={i > 0 && { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }}>
                <Row l={formatStatus(p.paymentType)} v={formatCurrency(p.amount)} C={C} />
                <Text style={[styles.ledgerMeta, { color: C.textSecondary }]}>
                  {p.paidAt ? formatDateTime(p.paidAt) : ''} {p.merchantTransactionId ? `· ${p.merchantTransactionId}` : ''}
                </Text>
              </View>
            ))}
          </InfoCard>
        )}

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: C.border }]}
          onPress={() => navigation.navigate('Invoice', { type: 'booking', id: bookingId })}
          activeOpacity={0.85}
        >
          <Ionicons name="document-text-outline" size={18} color={C.text} />
          <Text style={{ color: C.text, fontWeight: '700' }}>View Invoice</Text>
        </TouchableOpacity>

        {canApprove && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#16A34A' }]} onPress={handleApprove} disabled={acting} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{acting ? 'Please wait…' : 'Approve Refund'}</Text>
          </TouchableOpacity>
        )}
        {canReject && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#DC2626' }]} onPress={() => setRejectModal(true)} disabled={acting} activeOpacity={0.85}>
            <Ionicons name="close-circle" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Reject Refund</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Reject Refund</Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Reason for rejection (optional)…"
              placeholderTextColor={C.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: C.border }]} onPress={() => setRejectModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmBtn, { backgroundColor: '#DC2626' }]} onPress={handleReject} disabled={acting}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{acting ? 'Please wait…' : 'Confirm Reject'}</Text>
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
  title:        { fontSize: 16, fontWeight: '700', flex: 1 },
  sub:          { fontSize: 13 },
  cardTitle:    { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem:      { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:     { fontSize: 13, flex: 1 },
  rowVal:       { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  policy:       { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  ledgerMeta:   { fontSize: 11, marginTop: 2 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5,
  },
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
  modalTitle:    { fontSize: 18, fontWeight: '800' },
  reasonInput:   { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalBtns:     { flexDirection: 'row', gap: 12 },
  modalCancelBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  modalConfirmBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
