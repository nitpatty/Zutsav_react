import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDateTime, formatCurrency, formatStatus, orderStatusColor, shipmentStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Timeline from '../../components/shared/Timeline';
import { OutlineButton } from '../../components/shared/AppButton';

const INVOICE_ELIGIBLE = ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export default function OrderDetailScreen({ route }) {
  const { orderId } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/marketplace/orders/${orderId}`);
      setOrder(data.data || data.order);
    } catch { Toast.show({ type: 'error', text1: 'Could not load order' }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [orderId]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!order) return <View style={{ flex: 1 }}><ScreenHeader title="Order Detail" /></View>;

  const addr = order.shippingAddress || {};
  const addressStr = [addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '—';
  const shipment = order.shipment;
  const showOtpNotice = order.deliveryOTP?.sentAt && !order.deliveryOTP?.verified && order.status === 'out_for_delivery';
  const canDownloadInvoice = INVOICE_ELIGIBLE.includes(order.status);

  const orderTimeline = (order.statusTimeline || []).map((t) => ({
    label: formatStatus(t.status),
    note:  t.note,
    at:    t.timestamp,
  }));
  const shipmentTimeline = (shipment?.shipmentHistory || []).map((h) => ({
    label: formatStatus(h.status),
    note:  h.note,
    at:    h.timestamp,
  }));

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Order Detail" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <View style={styles.row}>
            <Text style={[styles.orderId, { color: C.textSecondary }]}>Order #{order.orderNumber || order._id?.slice(-6).toUpperCase()}</Text>
            <StatusBadge status={order.status} colorMap={orderStatusColor} />
          </View>
          <Text style={[styles.date, { color: C.textSecondary }]}>{formatDateTime(order.createdAt)}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Items</Text>
          {(order.items || []).map((item, i) => (
            <View key={i} style={[styles.itemRow, { borderTopColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: C.text }]}>{item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</Text>
                <Text style={[styles.itemQty, { color: C.textSecondary }]}>Qty: {item.quantity} × {formatCurrency(item.price)}</Text>
              </View>
              <Text style={[styles.itemPrice, { color: C.primary }]}>{formatCurrency(item.total ?? item.price * item.quantity)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Delivery Address</Text>
          <Text style={[styles.addrText, { color: C.text }]}>{addr.name}{addr.phone ? ` · ${addr.phone}` : ''}</Text>
          <Text style={[styles.addrText, { color: C.textSecondary }]}>{addressStr}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Payment</Text>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: C.textSecondary }]}>Total Amount</Text>
            <Text style={[styles.totalVal, { color: C.primary }]}>{formatCurrency(order.totalAmount)}</Text>
          </View>
          {order.paymentProvider && (
            <Text style={[styles.metaText, { color: C.textSecondary }]}>via {formatStatus(order.paymentProvider)}{order.phonePeTransactionId ? ` · ${order.phonePeTransactionId}` : ''}</Text>
          )}
        </View>

        {shipment && (
          <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Shipment & Tracking</Text>
              <StatusBadge status={shipment.shipmentStatus} colorMap={shipmentStatusColor} small />
            </View>
            <View style={{ gap: 6, marginTop: 10 }}>
              {shipment.courierName && <MetaRow label="Courier" value={shipment.courierName} C={C} />}
              {(shipment.trackingNumber || shipment.awbNumber) && (
                <MetaRow label="Tracking No." value={shipment.trackingNumber || shipment.awbNumber} C={C} />
              )}
              {shipment.estimatedDelivery && <MetaRow label="Est. Delivery" value={formatDateTime(shipment.estimatedDelivery)} C={C} />}
              {shipment.driverName && <MetaRow label="Delivery Executive" value={`${shipment.driverName}${shipment.driverPhone ? ' · ' + shipment.driverPhone : ''}`} C={C} />}
              {shipment.trackingUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(shipment.trackingUrl)} activeOpacity={0.7}>
                  <Text style={[styles.trackLink, { color: C.primary }]}>Track Shipment ↗</Text>
                </TouchableOpacity>
              )}
            </View>
            {shipmentTimeline.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Timeline events={shipmentTimeline} />
              </View>
            )}
          </View>
        )}

        {showOtpNotice && (
          <View style={[styles.otpBanner, { backgroundColor: '#FEF3C720', borderColor: '#D97706' }]}>
            <Ionicons name="key-outline" size={16} color="#92400E" />
            <Text style={styles.otpText}>A delivery OTP has been sent to your registered email/WhatsApp. Share it with the delivery executive to confirm receipt.</Text>
          </View>
        )}

        {orderTimeline.length > 0 && (
          <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Order Timeline</Text>
            <View style={{ marginTop: 10 }}>
              <Timeline events={orderTimeline} />
            </View>
          </View>
        )}

        {canDownloadInvoice && (
          <OutlineButton
            title="Download Invoice"
            icon={<Ionicons name="document-text-outline" size={18} color={C.primary} />}
            onPress={() => navigation.navigate('Invoice', { type: 'order', id: orderId })}
            C={C}
            fullWidth
          />
        )}
      </ScrollView>
    </View>
  );
}

function MetaRow({ label, value, C }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.metaLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.metaVal, { color: C.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  card: {
    borderRadius: 20, padding: 16, gap: 8,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.09, shadowRadius: 12, elevation: 3,
  },
  row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId:    { fontSize: 13, fontWeight: '600' },
  date:       { fontSize: 12 },
  cardTitle:  { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  itemName:   { fontSize: 13, fontWeight: '600' },
  itemQty:    { fontSize: 12, marginTop: 2 },
  itemPrice:  { fontSize: 14, fontWeight: '700' },
  addrText:   { fontSize: 13, lineHeight: 20 },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14 },
  totalVal:   { fontSize: 18, fontWeight: '800' },
  metaText:   { fontSize: 12 },
  metaLabel:  { fontSize: 12 },
  metaVal:    { fontSize: 12, fontWeight: '600' },
  trackLink:  { fontSize: 13, fontWeight: '700', marginTop: 4 },
  otpBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12 },
  otpText:    { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
});
