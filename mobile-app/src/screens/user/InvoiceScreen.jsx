import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, formatDateTime, formatStatus } from '../../utils/helpers';
import ScreenHeader from '../../components/ScreenHeader';
import LoadingSpinner from '../../components/LoadingSpinner';

// Native, theme-aware invoice view (booking or marketplace order) with a
// Share/Download PDF action. Intentionally not a copy of the website's print
// HTML — this respects dark mode and the app's own typography/colors.
export default function InvoiceScreen({ route }) {
  const { type, id } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const url = type === 'order' ? `/marketplace/orders/${id}/invoice` : `/bookings/${id}/invoice`;
    api.get(url)
      .then(({ data }) => setData(data))
      .catch(() => Toast.show({ type: 'error', text1: 'Could not load invoice' }))
      .finally(() => setLoading(false));
  }, [type, id]);

  const handleShare = async () => {
    try {
      setSharing(true);
      const html = type === 'order' ? buildOrderHtml(data) : buildBookingHtml(data);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        Toast.show({ type: 'error', text1: 'Sharing is not available on this device' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Could not generate invoice PDF' });
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!data) return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title="Invoice" />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.textSecondary }}>Invoice not available</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Invoice" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {type === 'order' ? <OrderInvoice data={data} C={C} /> : <BookingInvoice data={data} C={C} />}

        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: C.primary, opacity: sharing ? 0.6 : 1 }]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
        >
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.shareBtnText}>{sharing ? 'Preparing…' : 'Share / Download PDF'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.sectionTitle, { color: C.text }]}>{title}</Text>
      <View style={{ gap: 8, marginTop: 10 }}>{children}</View>
    </View>
  );
}

function Row({ label, value, C, bold = false }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: C.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: bold ? C.primary : C.text }, bold && { fontWeight: '800', fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

function BookingInvoice({ data, C }) {
  const { booking, paymentLedger = [] } = data;
  const ud = booking.userDetails || {};
  const addressStr = [ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', ') || '—';

  return (
    <>
      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[styles.brand, { color: C.primary }]}>Zutsav Enterprises</Text>
        <Text style={[styles.brandSub, { color: C.textSecondary }]}>Tax Invoice</Text>
        <Text style={[styles.invoiceNo, { color: C.textSecondary }]}>Booking #{booking.bookingNumber || booking._id?.slice(-8).toUpperCase()}</Text>
      </View>

      <Section title="Bill To" C={C}>
        <Row label="Name" value={ud.name || '—'} C={C} />
        <Row label="Phone" value={ud.phone || '—'} C={C} />
        {ud.email ? <Row label="Email" value={ud.email} C={C} /> : null}
        <Row label="Address" value={addressStr} C={C} />
      </Section>

      <Section title="Booking Details" C={C}>
        <Row label="Service" value={booking.poojaId?.name || '—'} C={C} />
        <Row label="Date & Time" value={booking.scheduledDate ? `${formatDateTime(booking.scheduledDate)}` : '—'} C={C} />
        <Row label="Pandit" value={booking.panditId?.name || 'Being assigned'} C={C} />
        {booking.kitId?.name ? <Row label="Samagri Kit" value={booking.kitId.name} C={C} /> : null}
      </Section>

      <Section title="Amount Breakdown" C={C}>
        <Row label="Pooja Service" value={formatCurrency(booking.poojaAmount || 0)} C={C} />
        {booking.kitAmount > 0 && <Row label="Samagri Kit" value={formatCurrency(booking.kitAmount)} C={C} />}
        {booking.platformFee > 0 && <Row label="Platform Fee" value={formatCurrency(booking.platformFee)} C={C} />}
        {(booking.kitGST > 0 || booking.platformGST > 0 || booking.taxAmount > 0) && (
          <Row label="GST" value={formatCurrency((booking.kitGST || 0) + (booking.platformGST || 0) + (booking.taxAmount || 0))} C={C} />
        )}
        <View style={[styles.divider, { backgroundColor: C.border }]} />
        <Row label="Grand Total" value={formatCurrency(booking.grandTotal || 0)} C={C} bold />
        <Row label="Amount Paid" value={formatCurrency(booking.amountPaid || 0)} C={C} />
        {booking.remainingAmount > 0 && <Row label="Balance Due" value={formatCurrency(booking.remainingAmount)} C={C} />}
      </Section>

      {paymentLedger.length > 0 && (
        <Section title={paymentLedger.length > 1 ? `Payment History (${paymentLedger.length} payments)` : 'Payment'} C={C}>
          {paymentLedger.map((p, i) => (
            <View key={p._id || i} style={[styles.paymentRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 8 }]}>
              <Row label={`Payment ${i + 1} — ${formatStatus(p.paymentType)}`} value={formatCurrency(p.amount)} C={C} />
              <Text style={[styles.paymentMeta, { color: C.textSecondary }]}>
                {p.paidAt ? formatDateTime(p.paidAt) : ''} {p.merchantTransactionId ? `· ${p.merchantTransactionId}` : ''}
              </Text>
            </View>
          ))}
        </Section>
      )}
    </>
  );
}

function OrderInvoice({ data, C }) {
  const { order, shipment } = data;
  const addr = order.shippingAddress || {};
  const addressStr = [addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '—';
  const totalTax = (order.items || []).reduce((sum, it) => sum + (it.taxAmount || 0), 0);

  return (
    <>
      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[styles.brand, { color: C.primary }]}>Zutsav Enterprises</Text>
        <Text style={[styles.brandSub, { color: C.textSecondary }]}>Tax Invoice</Text>
        <Text style={[styles.invoiceNo, { color: C.textSecondary }]}>Order #{order.orderNumber || order._id?.slice(-8).toUpperCase()}</Text>
      </View>

      <Section title="Bill To" C={C}>
        <Row label="Name" value={addr.name || order.userId?.name || '—'} C={C} />
        <Row label="Phone" value={addr.phone || order.userId?.phone || '—'} C={C} />
        <Row label="Address" value={addressStr} C={C} />
      </Section>

      <Section title="Items" C={C}>
        {(order.items || []).map((item, i) => (
          <View key={i} style={[styles.itemRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: C.text }]}>{item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</Text>
              <Text style={[styles.itemQty, { color: C.textSecondary }]}>Qty {item.quantity} × {formatCurrency(item.price)}</Text>
            </View>
            <Text style={[styles.itemTotal, { color: C.primary }]}>{formatCurrency(item.total ?? item.price * item.quantity)}</Text>
          </View>
        ))}
      </Section>

      <Section title="Amount Breakdown" C={C}>
        {totalTax > 0 && <Row label="GST" value={formatCurrency(totalTax)} C={C} />}
        <View style={[styles.divider, { backgroundColor: C.border }]} />
        <Row label="Grand Total" value={formatCurrency(order.totalAmount || 0)} C={C} bold />
      </Section>

      <Section title="Payment" C={C}>
        <Row label="Provider" value={formatStatus(order.paymentProvider || '—')} C={C} />
        {order.phonePeTransactionId ? <Row label="Transaction ID" value={order.phonePeTransactionId} C={C} /> : null}
        <Row label="Order Date" value={formatDateTime(order.createdAt)} C={C} />
      </Section>

      {shipment?.trackingNumber ? (
        <Section title="Shipment" C={C}>
          <Row label="Courier" value={shipment.courierName || '—'} C={C} />
          <Row label="Tracking No." value={shipment.trackingNumber || shipment.awbNumber || '—'} C={C} />
        </Section>
      ) : null}
    </>
  );
}

function esc(v) { return String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function buildBookingHtml({ booking, paymentLedger = [] }) {
  const ud = booking.userDetails || {};
  const rows = paymentLedger.map((p, i) => `<tr><td>Payment ${i + 1} (${esc(p.paymentType)})</td><td>${p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-IN') : ''}</td><td style="text-align:right">${formatCurrency(p.amount)}</td></tr>`).join('');
  return `<html><body style="font-family:Helvetica,Arial,sans-serif;padding:24px;color:#1C1917">
    <h1 style="color:#B8962E;margin-bottom:0">Zutsav Enterprises</h1>
    <p style="color:#78716C;margin-top:4px">Tax Invoice · Booking #${esc(booking.bookingNumber || booking._id)}</p>
    <h3>Bill To</h3>
    <p>${esc(ud.name)}<br/>${esc(ud.phone)}${ud.email ? '<br/>' + esc(ud.email) : ''}<br/>${esc([ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', '))}</p>
    <h3>Booking Details</h3>
    <p>Service: ${esc(booking.poojaId?.name)}<br/>Date: ${booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString('en-IN') : ''}<br/>Pandit: ${esc(booking.panditId?.name || 'Being assigned')}</p>
    <h3>Amount</h3>
    <table style="width:100%;border-collapse:collapse">
      <tr><td>Pooja Service</td><td style="text-align:right">${formatCurrency(booking.poojaAmount || 0)}</td></tr>
      ${booking.kitAmount ? `<tr><td>Samagri Kit</td><td style="text-align:right">${formatCurrency(booking.kitAmount)}</td></tr>` : ''}
      ${booking.platformFee ? `<tr><td>Platform Fee</td><td style="text-align:right">${formatCurrency(booking.platformFee)}</td></tr>` : ''}
      <tr style="font-weight:bold;border-top:1px solid #ccc"><td>Grand Total</td><td style="text-align:right">${formatCurrency(booking.grandTotal || 0)}</td></tr>
      <tr><td>Amount Paid</td><td style="text-align:right">${formatCurrency(booking.amountPaid || 0)}</td></tr>
      ${booking.remainingAmount ? `<tr><td>Balance Due</td><td style="text-align:right">${formatCurrency(booking.remainingAmount)}</td></tr>` : ''}
    </table>
    ${rows ? `<h3>Payment History</h3><table style="width:100%;border-collapse:collapse">${rows}</table>` : ''}
  </body></html>`;
}

function buildOrderHtml({ order }) {
  const addr = order.shippingAddress || {};
  const itemRows = (order.items || []).map((it) => `<tr><td>${esc(it.name)}${it.variantLabel ? ' (' + esc(it.variantLabel) + ')' : ''}</td><td>${it.quantity}</td><td style="text-align:right">${formatCurrency(it.total ?? it.price * it.quantity)}</td></tr>`).join('');
  return `<html><body style="font-family:Helvetica,Arial,sans-serif;padding:24px;color:#1C1917">
    <h1 style="color:#B8962E;margin-bottom:0">Zutsav Enterprises</h1>
    <p style="color:#78716C;margin-top:4px">Tax Invoice · Order #${esc(order.orderNumber || order._id)}</p>
    <h3>Bill To</h3>
    <p>${esc(addr.name || order.userId?.name)}<br/>${esc(addr.phone || order.userId?.phone)}<br/>${esc([addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', '))}</p>
    <h3>Items</h3>
    <table style="width:100%;border-collapse:collapse">${itemRows}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:8px">
      <tr style="font-weight:bold;border-top:1px solid #ccc"><td>Grand Total</td><td style="text-align:right">${formatCurrency(order.totalAmount || 0)}</td></tr>
    </table>
    <h3>Payment</h3>
    <p>Provider: ${esc(order.paymentProvider)}${order.phonePeTransactionId ? '<br/>Transaction ID: ' + esc(order.phonePeTransactionId) : ''}</p>
  </body></html>`;
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  card:        { borderRadius: 16, borderWidth: 1, padding: 16 },
  brand:       { fontSize: 20, fontWeight: '800', fontStyle: 'italic' },
  brandSub:    { fontSize: 12, marginTop: 2 },
  invoiceNo:   { fontSize: 12, marginTop: 8 },
  sectionTitle:{ fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLabel:    { fontSize: 13, flex: 1 },
  rowVal:      { fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  divider:     { height: 1, marginVertical: 4 },
  paymentRow:  { gap: 2 },
  paymentMeta: { fontSize: 11 },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName:    { fontSize: 13, fontWeight: '600' },
  itemQty:     { fontSize: 12, marginTop: 2 },
  itemTotal:   { fontSize: 14, fontWeight: '700' },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  shareBtnText:{ color: '#fff', fontSize: 15, fontWeight: '700' },
});
