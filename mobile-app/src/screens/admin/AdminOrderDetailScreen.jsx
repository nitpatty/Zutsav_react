import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime, formatCurrency, orderStatusColor, formatStatus } from '../../utils/helpers';
import { callPhone } from '../../utils/quickActions';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const STATUS_ACTIONS = {
  paid:             { next: 'confirmed',       label: 'Confirm Order' },
  confirmed:        { next: 'packed',          label: 'Mark Packed' },
  packed:           { next: 'shipped',         label: 'Mark Shipped' },
  shipped:          { next: 'out_for_delivery', label: 'Out for Delivery' },
  out_for_delivery: { next: 'delivered',       label: 'Mark Delivered' },
};

// Shipment can be generated while the order is confirmed/packed (before the
// plain linear "Mark Shipped" step) — it attaches real courier/tracking info
// and auto-advances the order to 'shipped' server-side.
const SHIPMENT_ELIGIBLE = ['confirmed', 'packed'];
const CANCELLABLE = ['pending_payment', 'paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery'];

export default function AdminOrderDetailScreen({ route }) {
  const { orderId } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [order,      setOrder]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating,   setUpdating]   = useState(false);

  // Generate shipment
  const [shipModal, setShipModal] = useState(false);
  const [manualType, setManualType] = useState('courier');
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [deliveryPartner, setDeliveryPartner] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [expectedTime, setExpectedTime] = useState('');
  const [shipping, setShipping] = useState(false);

  // Cancel order
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/admin/orders/${orderId}`);
      setOrder(data.data || data.order);
    } catch { Toast.show({ type: 'error', text1: 'Could not load order' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [orderId]);

  const handleUpdateStatus = async () => {
    const action = STATUS_ACTIONS[order?.status];
    if (!action) return;
    Alert.alert('Update Status', `Move order to "${formatStatus(action.next)}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm', onPress: async () => {
          try {
            setUpdating(true);
            await api.patch(`/admin/orders/${orderId}/status`, { status: action.next });
            Toast.show({ type: 'success', text1: `Order ${formatStatus(action.next)}` });
            fetch(true);
          } catch (err) {
            Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
          } finally { setUpdating(false); }
        }
      }
    ]);
  };

  const resetShipForm = () => {
    setManualType('courier'); setCourierName(''); setTrackingNumber('');
    setDeliveryPartner(''); setDriverName(''); setDriverPhone(''); setVehicleNumber(''); setExpectedTime('');
  };

  const handleGenerateShipment = async () => {
    if (!trackingNumber.trim()) { Toast.show({ type: 'error', text1: 'Enter a tracking/AWB number' }); return; }
    if (manualType === 'courier' && !courierName.trim()) { Toast.show({ type: 'error', text1: 'Enter courier name' }); return; }
    if (manualType === 'local_delivery' && !deliveryPartner.trim()) { Toast.show({ type: 'error', text1: 'Enter delivery partner' }); return; }
    try {
      setShipping(true);
      await api.post(`/admin/orders/${orderId}/shipment/manual`, {
        manualType,
        courierName: manualType === 'courier' ? courierName.trim() : undefined,
        deliveryPartner: manualType === 'local_delivery' ? deliveryPartner.trim() : undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
        expectedTime: expectedTime.trim() || undefined,
        trackingNumber: trackingNumber.trim(),
      });
      Toast.show({ type: 'success', text1: 'Shipment created' });
      setShipModal(false);
      resetShipForm();
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not create shipment' });
    } finally { setShipping(false); }
  };

  const handleCancelOrder = async () => {
    try {
      setCancelling(true);
      await api.patch(`/admin/orders/${orderId}/status`, { status: 'cancelled', cancelReason: cancelReason.trim() || undefined });
      Toast.show({ type: 'success', text1: 'Order cancelled' });
      setCancelModal(false);
      setCancelReason('');
      fetch(true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not cancel order' });
    } finally { setCancelling(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!order) return null;

  const nextAction = STATUS_ACTIONS[order.status];
  const canGenerateShipment = SHIPMENT_ELIGIBLE.includes(order.status);
  const canCancel = CANCELLABLE.includes(order.status);
  const addr = order.shippingAddress || {};
  const addressStr = [addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Order Detail" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.row}><Text style={[styles.orderId, { color: C.textSecondary }]}>Order #{order.orderNumber || order._id?.slice(-6).toUpperCase()}</Text><StatusBadge status={order.status} colorMap={orderStatusColor} /></View>
          <Text style={[styles.date, { color: C.textSecondary }]}>{formatDateTime(order.createdAt)}</Text>
        </View>

        <View style={styles.quickRow}>
          <QuickAction icon="call" label="Call Customer" C={C} onPress={() => callPhone(order.userId?.phone || addr.phone)} />
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Customer</Text>
          <Row label="Name"  value={order.userId?.name  || '—'} C={C} />
          <Row label="Phone" value={order.userId?.phone || addr.phone || '—'} C={C} />
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Items ({order.items?.length || 0})</Text>
          {(order.items || []).map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={[styles.itemName, { color: C.text }]}>{item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</Text>
              <Text style={[styles.itemQty, { color: C.textSecondary }]}>×{item.quantity}</Text>
              <Text style={[styles.itemPrice, { color: C.primary }]}>{formatCurrency(item.total ?? item.price * item.quantity)}</Text>
            </View>
          ))}
        </View>

        {addressStr ? (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Delivery Address</Text>
            <Text style={[styles.addrText, { color: C.textSecondary }]}>{addressStr}</Text>
          </View>
        ) : null}

        {order.shipmentId && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Shipment</Text>
            {order.courier && <Row label="Courier" value={order.courier} C={C} />}
            {order.trackingId && <Row label="Tracking No." value={order.trackingId} C={C} />}
          </View>
        )}

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Payment</Text>
          <Row label="Total" value={formatCurrency(order.totalAmount)} C={C} highlight />
          <Row label="Payment Status" value={formatStatus(order.paymentStatus)} C={C} />
        </View>

        {canGenerateShipment && (
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={() => setShipModal(true)} activeOpacity={0.85}>
            <Ionicons name="cube-outline" size={18} color={C.text} />
            <Text style={{ color: C.text, fontWeight: '700' }}>Generate Shipment</Text>
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: '#DC262640' }]} onPress={() => setCancelModal(true)} activeOpacity={0.85}>
            <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
            <Text style={{ color: '#DC2626', fontWeight: '700' }}>Cancel Order</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {nextAction && (
        <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.primary }]} onPress={handleUpdateStatus} disabled={updating} activeOpacity={0.85}>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{updating ? 'Updating…' : nextAction.label}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Generate shipment modal */}
      <Modal visible={shipModal} transparent animationType="slide" onRequestClose={() => setShipModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalBox, { backgroundColor: C.surface }]} contentContainerStyle={{ gap: 12 }}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Generate Shipment</Text>

            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.typePill, { borderColor: manualType === 'courier' ? C.primary : C.border, backgroundColor: manualType === 'courier' ? C.primary : C.background }]} onPress={() => setManualType('courier')}>
                <Text style={{ color: manualType === 'courier' ? '#fff' : C.text, fontWeight: '600', fontSize: 13 }}>Courier</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typePill, { borderColor: manualType === 'local_delivery' ? C.primary : C.border, backgroundColor: manualType === 'local_delivery' ? C.primary : C.background }]} onPress={() => setManualType('local_delivery')}>
                <Text style={{ color: manualType === 'local_delivery' ? '#fff' : C.text, fontWeight: '600', fontSize: 13 }}>Local Delivery</Text>
              </TouchableOpacity>
            </View>

            {manualType === 'courier' ? (
              <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={courierName} onChangeText={setCourierName} placeholder="Courier Name (e.g. FedEx)" placeholderTextColor={C.textSecondary} />
            ) : (
              <>
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={deliveryPartner} onChangeText={setDeliveryPartner} placeholder="Delivery Partner" placeholderTextColor={C.textSecondary} />
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={driverName} onChangeText={setDriverName} placeholder="Driver Name" placeholderTextColor={C.textSecondary} />
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={driverPhone} onChangeText={setDriverPhone} placeholder="Driver Phone" placeholderTextColor={C.textSecondary} keyboardType="phone-pad" />
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="Vehicle Number" placeholderTextColor={C.textSecondary} />
                <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={expectedTime} onChangeText={setExpectedTime} placeholder="Expected Time (e.g. 09:00-10:00)" placeholderTextColor={C.textSecondary} />
              </>
            )}
            <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={trackingNumber} onChangeText={setTrackingNumber} placeholder="Tracking / AWB Number *" placeholderTextColor={C.textSecondary} />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => { setShipModal(false); resetShipForm(); }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: C.primary }]} onPress={handleGenerateShipment} disabled={shipping}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{shipping ? 'Creating…' : 'Create Shipment'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Cancel order modal */}
      <Modal visible={cancelModal} transparent animationType="slide" onRequestClose={() => setCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.modalTitle, { color: C.text }]}>Cancel Order</Text>
            <TextInput
              style={[styles.reasonInput, { borderColor: C.border, color: C.text, backgroundColor: C.background }]}
              placeholder="Reason for cancellation (optional)…"
              placeholderTextColor={C.textSecondary}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: C.border }]} onPress={() => setCancelModal(false)}>
                <Text style={{ color: C.text, fontWeight: '600' }}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#DC2626' }]} onPress={handleCancelOrder} disabled={cancelling}>
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
      <Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Row({ label, value, C, highlight = false }) {
  return (
    <View style={styles.rowItem}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: highlight ? C.primary : C.text }, highlight && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card:       { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId:    { fontSize: 13, fontWeight: '600' },
  date:       { fontSize: 12 },
  cardTitle:  { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem:    { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel:   { fontSize: 13, flex: 1 },
  rowVal:     { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName:   { flex: 1, fontSize: 13, fontWeight: '500' },
  itemQty:    { fontSize: 13 },
  itemPrice:  { fontSize: 14, fontWeight: '700' },
  addrText:   { fontSize: 13, lineHeight: 20 },
  quickRow:   { flexDirection: 'row', gap: 10 },
  quickBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 12 },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, borderWidth: 1.5 },
  footer:     { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalBox:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  typeRow:    { flexDirection: 'row', gap: 8 },
  typePill:   { flex: 1, alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingVertical: 10 },
  input:      { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  reasonInput: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  modalBtns:  { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn:  { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  confirmBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
});
