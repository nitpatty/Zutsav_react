import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, formatStatus, orderStatusColor, shipmentStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import Timeline from '../../components/shared/Timeline';
import { OutlineButton, PrimaryButton } from '../../components/shared/AppButton';
import { summariseOrderTax } from '../../utils/marketplaceCheckout';
import { getCouponDisplay } from '../../utils/discountDisplay';
import { useAuthStore } from '../../store/authStore';
import { useTranslation, useFormatters } from '../../i18n';
import { orderStatusLabel, shipmentStatusLabel } from '../../utils/orderStatusLabels';
import { openPaymentPage } from '../../utils/paymentRecovery';
import PendingPaymentBanner from '../../components/shared/PendingPaymentBanner';
import {
  canOfferRetry, retryUnavailableNote, isSafePaymentUrl, mapRetryResponse,
  getOrCreateRetryKey, clearRetryKey, classifyRetryFailure,
} from '../../utils/orderRetry';

const INVOICE_ELIGIBLE = ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export default function OrderDetailScreen({ route }) {
  const { formatDateTime } = useFormatters();
  const { orderId } = route.params || {};
  const { t } = useTranslation();
  const navigation = useNavigation();
  const userId = useAuthStore((s) => s.user?._id);
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false); // synchronous guard — a disabled button alone cannot stop two taps in one frame

  const fetch = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get(`/marketplace/orders/${orderId}`);
      setOrder(data.data || data.order);
    } catch { Toast.show({ type: 'error', text1: t('orders.detailLoadFailed') }); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetch(); }, [orderId]);

  // Coming back from the payment-status screen: re-read the order from the server so the retry action and the
  // status always reflect its real, authoritative state.
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => fetch(true));
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, [navigation, orderId]);

  // Pay for THIS order again (a new payment attempt on the same order). Only the idempotency key is sent — the
  // server charges the order's stored payable. Success is never claimed here: the payment-status screen asks the
  // server (/checkout/verify) using the new transaction id.
  const handleRetryPayment = async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    try {
      const { key } = await getOrCreateRetryKey(orderId);
      const { data } = await api.post(`/checkout/orders/${orderId}/retry-payment`, { idempotencyKey: key });
      const attempt = mapRetryResponse(data);
      await clearRetryKey(orderId); // definite answer — the next retry (after another failure) is a new attempt
      const verifyParams = { merchantTransactionId: attempt.merchantTransactionId, orderId, type: 'marketplace' };

      if (!attempt.redirectUrl) { // nothing left to pay on this attempt (e.g. it was already paid) — let the server say
        navigation.navigate('PaymentVerify', verifyParams);
        return;
      }
      if (!isSafePaymentUrl(attempt.redirectUrl)) {
        Toast.show({ type: 'error', text1: t('orders.retryInvalidLink') });
        fetch(true);
        return;
      }
      // Persists the recovery record BEFORE opening the payment page; if it cannot be opened, the status screen still tracks the payment.
      await openPaymentPage({
        userId,
        context: { type: 'marketplace', merchantTransactionId: attempt.merchantTransactionId, orderId },
        redirectUrl: attempt.redirectUrl,
      });
      navigation.navigate('PaymentVerify', verifyParams);
    } catch (err) {
      const failure = classifyRetryFailure(err);
      if (failure.kind !== 'uncertain') await clearRetryKey(orderId); // uncertain → keep the key so a retry is the SAME attempt
      switch (failure.kind) {
        case 'in_progress':
          Toast.show({ type: 'info', text1: t('orders.retryInProgress') });
          if (failure.merchantTransactionId) navigation.navigate('PaymentVerify', { merchantTransactionId: failure.merchantTransactionId, orderId, type: 'marketplace' });
          break;
        case 'already_paid':
          Toast.show({ type: 'info', text1: t('orders.retryAlreadyPaid') });
          fetch(true);
          break;
        case 'expired':
          Toast.show({ type: 'error', text1: t('orders.retryExpired') });
          fetch(true);
          break;
        case 'unavailable':
          Toast.show({ type: 'error', text1: err.response?.data?.message || t('orders.retryUnavailable') });
          fetch(true);
          break;
        case 'status_unknown':
          Toast.show({ type: 'error', text1: t('orders.retryStatusUnknown') });
          break;
        case 'rejected':
          Toast.show({ type: 'error', text1: err.response?.data?.message || t('orders.retryRejected') });
          break;
        default:
          Toast.show({ type: 'error', text1: t('orders.retryUncertain') });
      }
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!order) return <View style={{ flex: 1 }}><ScreenHeader title={t('orders.detailTitle')} /></View>;

  const addr = order.shippingAddress || {};
  const addressStr = [addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '—';
  const shipment = order.shipment;
  const showOtpNotice = order.deliveryOTP?.sentAt && !order.deliveryOTP?.verified && order.status === 'out_for_delivery';
  const canDownloadInvoice = INVOICE_ELIGIBLE.includes(order.status);
  const orderTax = summariseOrderTax(order); // server-persisted item tax; null for untaxed/older orders
  const couponInfo = getCouponDisplay(order); // persisted values only; totalAmount is already net of the coupon
  const showRetry = canOfferRetry(order);
  // retryUnavailableNote decides WHETHER a note applies (from the order status); the wording is localized here.
  const unavailableNote = retryUnavailableNote(order) ? t(order.status === 'payment_failed' ? 'orders.noteClosed' : 'orders.noteCancelled') : null;

  const orderTimeline = (order.statusTimeline || []).map((entry) => ({
    label: orderStatusLabel(entry.status, t),
    note:  entry.note,
    at:    entry.timestamp,
  }));
  const shipmentTimeline = (shipment?.shipmentHistory || []).map((h) => ({
    label: shipmentStatusLabel(h.status, t),
    note:  h.note,
    at:    h.timestamp,
  }));

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('orders.detailTitle')} />
      <PendingPaymentBanner navigation={navigation} kind="marketplace" orderId={orderId} onResolved={() => fetch(true)} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(true); }} tintColor={C.primary} />}
      >
        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <View style={styles.row}>
            <Text style={[styles.orderId, { color: C.textSecondary }]}>{t('orders.orderNumber', { number: order.orderNumber || order._id?.slice(-6).toUpperCase() })}</Text>
            <StatusBadge status={order.status} colorMap={orderStatusColor} label={orderStatusLabel(order.status, t)} />
          </View>
          <Text style={[styles.date, { color: C.textSecondary }]}>{formatDateTime(order.createdAt)}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>{t('orders.items')}</Text>
          {(order.items || []).map((item, i) => (
            <View key={i} style={[styles.itemRow, { borderTopColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: C.text }]}>{item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</Text>
                <Text style={[styles.itemQty, { color: C.textSecondary }]}>
                  {t('orders.qtyLine', { n: item.quantity, price: formatCurrency(item.price) })}
                  {item.taxAmount > 0 ? ` ${t(item.taxRate > 0 ? 'orders.gstExtraRate' : 'orders.gstExtra', { amount: formatCurrency(item.taxAmount), rate: item.taxRate })}` : ''}
                </Text>
              </View>
              <Text style={[styles.itemPrice, { color: C.primary }]}>{formatCurrency(item.total ?? item.price * item.quantity)}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>{t('orders.deliveryAddress')}</Text>
          <Text style={[styles.addrText, { color: C.text }]}>{addr.name}{addr.phone ? ` · ${addr.phone}` : ''}</Text>
          <Text style={[styles.addrText, { color: C.textSecondary }]}>{addressStr}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>{t('orders.payment')}</Text>
          {orderTax && (
            <>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{t('orders.itemsSubtotal')}</Text>
                <Text style={[styles.itemQty, { color: C.text }]}>{formatCurrency(orderTax.subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{t('orders.gst')}</Text>
                <Text style={[styles.itemQty, { color: C.text }]}>{formatCurrency(orderTax.tax)}</Text>
              </View>
            </>
          )}
          {couponInfo && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{t('orders.coupon', { code: couponInfo.code })}</Text>
              <Text style={[styles.itemQty, { color: C.text }]}>{`−${formatCurrency(couponInfo.discount)}`}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: C.textSecondary }]}>{t('orders.totalAmount')}</Text>
            <Text style={[styles.totalVal, { color: C.primary }]}>{formatCurrency(order.totalAmount)}</Text>
          </View>
          {order.paymentProvider && (
            <Text style={[styles.metaText, { color: C.textSecondary }]}>{t('orders.via', { provider: formatStatus(order.paymentProvider) })}{order.phonePeTransactionId ? ` · ${order.phonePeTransactionId}` : ''}</Text>
          )}
        </View>

        {shipment && (
          <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { color: C.text }]}>{t('orders.shipmentTitle')}</Text>
              <StatusBadge status={shipment.shipmentStatus} colorMap={shipmentStatusColor} label={shipmentStatusLabel(shipment.shipmentStatus, t)} small />
            </View>
            <View style={{ gap: 6, marginTop: 10 }}>
              {shipment.courierName && <MetaRow label={t('orders.courier')} value={shipment.courierName} C={C} />}
              {(shipment.trackingNumber || shipment.awbNumber) && (
                <MetaRow label={t('orders.trackingNo')} value={shipment.trackingNumber || shipment.awbNumber} C={C} />
              )}
              {shipment.estimatedDelivery && <MetaRow label={t('orders.estDelivery')} value={formatDateTime(shipment.estimatedDelivery)} C={C} />}
              {shipment.driverName && <MetaRow label={t('orders.deliveryExecutive')} value={`${shipment.driverName}${shipment.driverPhone ? ' · ' + shipment.driverPhone : ''}`} C={C} />}
              {shipment.trackingUrl && (
                <TouchableOpacity onPress={() => Linking.openURL(shipment.trackingUrl)} activeOpacity={0.7}>
                  <Text style={[styles.trackLink, { color: C.primary }]}>{t('orders.trackShipment')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {shipmentTimeline.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Timeline events={shipmentTimeline} formatDateTime={formatDateTime} />
              </View>
            )}
          </View>
        )}

        {showOtpNotice && (
          <View style={[styles.otpBanner, { backgroundColor: '#FEF3C720', borderColor: '#D97706' }]}>
            <Ionicons name="key-outline" size={16} color="#92400E" />
            <Text style={styles.otpText}>{t('orders.otpNotice')}</Text>
          </View>
        )}

        {orderTimeline.length > 0 && (
          <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('orders.orderTimeline')}</Text>
            <View style={{ marginTop: 10 }}>
              <Timeline events={orderTimeline} formatDateTime={formatDateTime} />
            </View>
          </View>
        )}

        {showRetry && (
          <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('orders.paymentPending')}</Text>
            <Text style={[styles.metaText, { color: C.textSecondary }]}>
              {t('orders.paymentPendingDesc')}
            </Text>
            <PrimaryButton
              title={retrying ? t('orders.openingPayment') : t('orders.retryPayment')}
              icon={<Ionicons name="card-outline" size={18} color="#fff" />}
              onPress={handleRetryPayment}
              disabled={retrying}
              C={C}
              fullWidth
            />
          </View>
        )}

        {unavailableNote && (
          <View style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}>
            <Text style={[styles.metaText, { color: C.textSecondary }]}>{unavailableNote}</Text>
          </View>
        )}

        {canDownloadInvoice && (
          <OutlineButton
            title={t('orders.downloadInvoice')}
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
