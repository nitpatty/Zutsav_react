import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, Alert, RefreshControl, Modal, TextInput, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { kycStatusColor, formatDate, formatCurrency } from '../../utils/helpers';
import { callPhone, openWhatsApp, openMaps } from '../../utils/quickActions';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const KYC_DOC_FIELDS = [
  { key: 'frontImage',   dbKey: 'kycFrontImage',   label: 'Front Image' },
  { key: 'backImage',    dbKey: 'kycBackImage',    label: 'Back Image' },
  { key: 'selfieImage',  dbKey: 'kycSelfieImage',  label: 'Selfie' },
  { key: 'addressProof', dbKey: 'kycAddressProof', label: 'Address Proof' },
];

// KYC/Govt-ID images are no longer served as static files — fetch through
// the authenticated admin endpoint and render as a data URI (RN's <Image>
// can't attach an Authorization header to a plain uri).
function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function fetchAdminKycDocumentUri(panditId, field) {
  const res = await api.get(`/admin/pandits/${panditId}/kyc-document/${field}`, { responseType: 'blob' });
  return blobToDataUri(res.data);
}

export default function AdminPanditDetailScreen({ navigation, route }) {
  const { panditId } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [pandit,        setPandit]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [acting,        setActing]        = useState(false);
  const [docUris,       setDocUris]       = useState({});

  // Reject modal state
  const [rejectModal,   setRejectModal]   = useState(false);
  const [rejectReason,  setRejectReason]  = useState('');
  const [rejecting,     setRejecting]     = useState(false);

  // Assign booking
  const [assignModal,      setAssignModal]      = useState(false);
  const [bookingsList,     setBookingsList]     = useState([]);
  const [bookingsLoading,  setBookingsLoading]  = useState(false);
  const [assigningBooking, setAssigningBooking] = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/admin/pandits/${panditId}`);
      setPandit(data.data || data.pandit);
    } catch { Toast.show({ type: 'error', text1: 'Could not load pandit' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [panditId]);

  useEffect(() => {
    if (!pandit) return;
    const activeFields = KYC_DOC_FIELDS.map((f) => f.key).filter((key) => pandit.kycDocuments?.[key]);
    if (activeFields.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(activeFields.map(async (key) => {
        try { return [key, await fetchAdminKycDocumentUri(panditId, key)]; }
        catch { return [key, null]; }
      }));
      if (!cancelled) setDocUris(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [pandit?.kycDocuments, panditId]);

  const handleApproveKYC = async () => {
    Alert.alert('Approve KYC', 'Approve this pandit\'s KYC?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          try {
            setActing(true);
            await api.patch(`/admin/pandits/${panditId}/kyc`, { action: 'approve' });
            Toast.show({ type: 'success', text1: 'KYC approved!' });
            fetch(true);
          } catch (err) {
            Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
          } finally { setActing(false); }
        },
      },
    ]);
  };

  const handleRejectKYC = async () => {
    if (!rejectReason.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter a rejection reason' });
      return;
    }
    try {
      setRejecting(true);
      await api.patch(`/admin/pandits/${panditId}/kyc`, { action: 'reject', rejectionReason: rejectReason.trim() });
      Toast.show({ type: 'success', text1: 'KYC rejected' });
      setRejectModal(false);
      setRejectReason('');
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
    } finally { setRejecting(false); }
  };

  const handleDelete = () => {
    Alert.alert('Delete Pandit', `Permanently delete ${pandit?.name || 'this pandit'}? Cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            setActing(true);
            await api.delete(`/admin/pandits/${panditId}`);
            Toast.show({ type: 'success', text1: 'Pandit deleted' });
            navigation.goBack();
          } catch (err) {
            Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
            setActing(false);
          }
        }
      }
    ]);
  };

  const handleToggleActive = () => {
    const panditUser = pandit.userId || pandit;
    const isSuspended = pandit.status === 'suspended';
    const label = isSuspended ? 'Activate' : 'Suspend';
    Alert.alert(`${label} Pandit`, `${label} ${panditUser.name || 'this pandit'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label, style: isSuspended ? 'default' : 'destructive', onPress: async () => {
          try {
            setActing(true);
            await api.patch(`/admin/pandits/${panditId}/approve`, { status: isSuspended ? 'approved' : 'suspended' });
            await api.patch(`/admin/users/${panditUser._id}/status`, { isActive: isSuspended });
            Toast.show({ type: 'success', text1: `Pandit ${isSuspended ? 'activated' : 'suspended'}` });
            fetch(true);
          } catch (err) {
            Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
          } finally { setActing(false); }
        },
      },
    ]);
  };

  const openAssignModal = async () => {
    setAssignModal(true);
    try {
      setBookingsLoading(true);
      const { data } = await api.get('/admin/bookings', { params: { status: 'paid', limit: 20 } });
      setBookingsList(data.bookings || []);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not load bookings' });
    } finally { setBookingsLoading(false); }
  };

  const handleAssignBooking = async (bookingId) => {
    try {
      setAssigningBooking(true);
      await api.patch(`/admin/bookings/${bookingId}/assign`, { panditId });
      Toast.show({ type: 'success', text1: 'Booking assigned!' });
      setAssignModal(false);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Assignment failed' });
    } finally { setAssigningBooking(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!pandit) return null;

  const kycStatus = pandit.kycStatus || 'not_submitted';
  const panditUser = pandit.userId || pandit;
  const isSuspended = pandit.status === 'suspended';
  const canAssignBooking = pandit.status === 'approved';
  const addressStr = [pandit.address, pandit.city, pandit.state, pandit.pincode].filter(Boolean).join(', ');

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={panditUser.name || 'Pandit'} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: C.primary + '20' }]}>
            <Text style={[styles.avatarText, { color: C.primary }]}>
              {(panditUser.name || 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.name, { color: C.text }]}>{panditUser.name}</Text>
          <Text style={[styles.phone, { color: C.textSecondary }]}>{panditUser.phone}</Text>
          {panditUser.email && <Text style={[styles.email, { color: C.textSecondary }]}>{panditUser.email}</Text>}
          <StatusBadge status={kycStatus} colorMap={kycStatusColor} />
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction icon="call" label="Call" C={C} onPress={() => callPhone(panditUser.phone)} />
          <QuickAction icon="logo-whatsapp" label="WhatsApp" C={C} onPress={() => openWhatsApp(panditUser.phone)} />
          <QuickAction icon="location" label="Maps" C={C} onPress={() => openMaps(addressStr)} />
        </View>

        {/* KYC Documents */}
        {Object.values(pandit.kycDocuments || {}).some(Boolean) && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>KYC Documents</Text>
            {pandit.govtIdType && <Row label="ID Type" value={pandit.govtIdType.replace(/_/g, ' ')} C={C} />}
            {pandit.govtIdNumber && <Row label="ID Number" value={pandit.govtIdNumber} C={C} />}
            {KYC_DOC_FIELDS.map(({ key, label }) => pandit.kycDocuments?.[key] ? (
              <View key={key} style={{ gap: 6 }}>
                <Text style={[styles.docLabel, { color: C.textSecondary }]}>{label}</Text>
                {docUris[key] && <Image source={{ uri: docUris[key] }} style={styles.docImg} resizeMode="cover" />}
              </View>
            ) : null)}
          </View>
        )}

        {/* KYC Actions */}
        {kycStatus === 'submitted' && (
          <View style={styles.kycActions}>
            <TouchableOpacity
              style={[styles.approveBtn, { backgroundColor: '#16A34A' }]}
              onPress={handleApproveKYC}
              disabled={acting}
              activeOpacity={0.85}
            >
              <Text style={styles.actionBtnText}>{acting ? '…' : 'Approve KYC'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, { borderColor: '#DC2626' }]}
              onPress={() => setRejectModal(true)}
              disabled={acting}
              activeOpacity={0.85}
            >
              <Text style={[styles.rejectBtnText, { color: '#DC2626' }]}>Reject KYC</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Profile info */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Profile</Text>
          {pandit.experience > 0 && <Row label="Experience" value={`${pandit.experience} years`} C={C} />}
          {pandit.averageRating > 0 && <Row label="Rating" value={`${pandit.averageRating.toFixed(1)} ★`} C={C} />}
          <Row label="Available" value={pandit.isAvailable ? 'Yes' : 'No'} C={C} />
          {pandit.poojaTypes?.length > 0 && <Row label="Pooja Types" value={pandit.poojaTypes.join(', ')} C={C} />}
          {pandit.languages?.length > 0 && <Row label="Languages" value={pandit.languages.join(', ')} C={C} />}
        </View>

        {canAssignBooking && (
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: C.border }]}
            onPress={openAssignModal}
            disabled={acting}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={18} color={C.text} />
            <Text style={{ color: C.text, fontWeight: '700' }}>Assign Booking</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.outlineBtn, { borderColor: isSuspended ? '#16A34A' : '#D97706' }]}
          onPress={handleToggleActive}
          disabled={acting}
          activeOpacity={0.85}
        >
          <Ionicons name={isSuspended ? 'checkmark-circle-outline' : 'pause-circle-outline'} size={18} color={isSuspended ? '#16A34A' : '#D97706'} />
          <Text style={{ color: isSuspended ? '#16A34A' : '#D97706', fontWeight: '700' }}>{isSuspended ? 'Activate Pandit' : 'Suspend Pandit'}</Text>
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity
          style={[styles.deleteBtn, { borderColor: '#DC2626' }]}
          onPress={handleDelete}
          disabled={acting}
          activeOpacity={0.85}
        >
          <Ionicons name="trash" size={18} color="#DC2626" />
          <Text style={styles.deleteBtnText}>Delete Pandit Account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Reject reason modal */}
      <Modal visible={rejectModal} transparent animationType="slide" onRequestClose={() => setRejectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Rejection Reason</Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Enter reason for rejection…"
              placeholderTextColor={C.textSecondary}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => { setRejectModal(false); setRejectReason(''); }}>
                <Text style={[styles.cancelBtnText, { color: C.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.rejectConfirmBtn, { backgroundColor: '#DC2626' }]} onPress={handleRejectKYC} disabled={rejecting} activeOpacity={0.85}>
                <Text style={styles.actionBtnText}>{rejecting ? 'Rejecting…' : 'Reject'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign booking modal */}
      <Modal visible={assignModal} transparent animationType="slide" onRequestClose={() => setAssignModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface, maxHeight: '80%' }]}>
            <View style={styles.assignModalHeader}>
              <Text style={[styles.modalTitle, { color: C.text }]}>Assign Booking</Text>
              <TouchableOpacity onPress={() => setAssignModal(false)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            {bookingsLoading ? (
              <LoadingSpinner />
            ) : (
              <FlatList
                data={bookingsList}
                keyExtractor={(b) => b._id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.bookingRow, { borderBottomColor: C.border }]}
                    onPress={() => {
                      Alert.alert('Assign Booking', `Assign this pandit to ${item.poojaId?.name || 'this booking'}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Assign', onPress: () => handleAssignBooking(item._id) },
                      ]);
                    }}
                    activeOpacity={0.8}
                    disabled={assigningBooking}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { fontSize: 14, color: C.text }]}>{item.poojaId?.name || 'Pooja'}</Text>
                      <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
                        {item.userId?.name || item.userDetails?.name || '—'} · {item.scheduledDate ? formatDate(item.scheduledDate) : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.primary }}>{formatCurrency(item.grandTotal ?? item.amount ?? 0)}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={[styles.docLabel, { color: C.textSecondary, textAlign: 'center', padding: 20 }]}>No unassigned bookings</Text>
                }
              />
            )}
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
      <Text style={{ color: C.text, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Row({ label, value, C }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: C.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  profileCard: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    alignItems: 'center', gap: 6,
  },
  avatarCircle:   { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  avatarText:     { fontSize: 24, fontWeight: '800' },
  name:           { fontSize: 18, fontWeight: '800' },
  phone:          { fontSize: 14 },
  email:          { fontSize: 13 },
  card:           { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  quickRow:       { flexDirection: 'row', gap: 10 },
  quickBtn:       { flex: 1, alignItems: 'center', gap: 4, borderRadius: 14, borderWidth: 1, paddingVertical: 12 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5,
  },
  assignModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bookingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardTitle:      { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  docLabel:       { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  docImg:         { width: '100%', height: 160, borderRadius: 10 },
  kycActions:     { flexDirection: 'row', gap: 10 },
  approveBtn:     { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  rejectBtn:      { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5 },
  actionBtnText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtnText:  { fontWeight: '700', fontSize: 14 },
  row:            { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:       { fontSize: 13, flex: 1 },
  rowVal:         { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14,
  },
  deleteBtnText:  { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  modalOverlay:   { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalTitle:     { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  reasonInput: {
    borderWidth: 1.5, borderRadius: 12, padding: 12,
    fontSize: 14, minHeight: 80, textAlignVertical: 'top',
  },
  modalBtns:      { flexDirection: 'row', gap: 12 },
  cancelBtn:      { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:  { fontSize: 15, fontWeight: '600' },
  rejectConfirmBtn: { flex: 2, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
