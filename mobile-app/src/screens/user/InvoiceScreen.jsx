import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Share, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, formatDateTime, formatStatus, amtWords, fmtInvoiceDate, fmtInvoiceLong } from '../../utils/helpers';
import { company } from '../../config/company.config';
import ScreenHeader from '../../components/ScreenHeader';
import LoadingSpinner from '../../components/LoadingSpinner';

const PMT_LABEL = { PARTIAL: 'Advance Payment', REMAINING: 'Final Payment', FULL: 'Full Payment' };
const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

function resolvePricing(b) {
  const hasNew = (b.poojaAmount > 0 || b.platformFee > 0 || b.grandTotal > 0);
  if (hasNew) {
    return {
      poojaAmount: b.poojaAmount || 0,
      kitAmount:   b.kitAmount   || 0,
      kitGST:      b.kitGST      || 0,
      platformFee: b.platformFee || 0,
      platformGST: b.platformGST || 0,
      totalTax:    (b.kitGST || 0) + (b.platformGST || 0),
      grandTotal:  b.grandTotal || b.amount || 0,
    };
  }
  return {
    poojaAmount:  b.baseAmount || b.amount || 0,
    kitAmount:    0,
    kitGST:       0,
    platformFee:  b.commissionAmount || 0,
    platformGST:  b.gstAmount || 0,
    totalTax:     b.gstAmount || 0,
    grandTotal:   b.amount || 0,
  };
}

function resolvePaymentStatus(b) {
  if (b.paymentStatus === 'FULLY_PAID')    return 'FULLY_PAID';
  if (b.paymentStatus === 'PARTIALLY_PAID') return 'PARTIALLY_PAID';
  if (b.paymentStatus === 'REFUNDED')      return 'REFUNDED';
  if (b.paymentStatus === 'FAILED')        return 'FAILED';
  const ACTIVE = ['paid','pandit_assigned','pandit_accepted','pending_reassignment','completion_requested','completed'];
  if (ACTIVE.includes(b.status)) return 'FULLY_PAID';
  return 'PENDING';
}

const STATUS_CFG = {
  FULLY_PAID:     { label: 'Paid in Full',     color: '#15803d', bg: '#dcfce7' },
  PARTIALLY_PAID: { label: 'Partially Paid',   color: '#c2410c', bg: '#ffedd5' },
  PENDING:        { label: 'Payment Pending',  color: '#b45309', bg: '#fef3c7' },
  REFUNDED:       { label: 'Refunded',         color: '#374151', bg: '#f3f4f6' },
  FAILED:         { label: 'Payment Failed',   color: '#b91c1c', bg: '#fee2e2' },
};

function StatusPill({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.PENDING;
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function buildLineItems(b, pricing) {
  const items = [];
  if (pricing.poojaAmount > 0) {
    items.push({
      desc: b.poojaId?.name || 'Pooja Service',
      sub: 'Spiritual ceremony service',
      qty: 1, rate: pricing.poojaAmount, amt: pricing.poojaAmount,
    });
  }
  if (b.withKit && b.kitId && pricing.kitAmount > 0) {
    items.push({
      desc: b.kitId.name || 'Samagri Kit',
      sub: 'Pooja samagri kit',
      qty: 1, rate: pricing.kitAmount, amt: pricing.kitAmount,
    });
  }
  if (pricing.platformFee > 0) {
    items.push({
      desc: 'Platform Convenience Fee',
      sub: 'Booking, support & service platform charges',
      qty: 1, rate: pricing.platformFee, amt: pricing.platformFee,
    });
  }
  if (items.length === 0) {
    items.push({
      desc: b.poojaId?.name || 'Pooja Service',
      sub: 'Spiritual ceremony service',
      qty: 1, rate: b.amount || 0, amt: b.amount || 0,
    });
  }
  return items;
}

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
    } catch {
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

function SecLabel({ children, C }) {
  return <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 10 }}>{children}</Text>;
}

function InfoRow({ label, value, bold, gold }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'flex-end', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: gold ? '#D4AF37' : bold ? 'white' : 'rgba(255,255,255,0.8)', minWidth: 150, textAlign: 'left' }}>{value}</Text>
    </View>
  );
}

function InvoiceHeader({ b, invoice, pmtStatus, displayInvNumber, paymentTypeLabel, C }) {
  const ud = b.userDetails || {};
  const genTime = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: '#1B1F3B' }}>
      <View style={{ padding: 20 }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontFamily: SERIF_FONT, fontSize: 26, fontWeight: '900', color: '#D4AF37'}}>
            Zutsav{' '}
            <Text style={{ fontFamily: SERIF_FONT, fontSize: 26, fontWeight: '900', color: '#FF7043' }}>
              Enterprises
            </Text>
          </Text>
        </View>
        <View style={{ gap: 3 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{company.addr1}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{company.addr2}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Text style={{ color: '#D4AF37', fontSize: 11, fontWeight: '700' }}>GSTIN: {company.gstin}</Text>
            <Text style={{ color: '#D4AF37', fontSize: 11, fontWeight: '700' }}>PAN: {company.pan}</Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{company.email} · {company.phone} · {company.web}</Text>
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: '#D4AF37', fontSize: 22, fontWeight: '900', letterSpacing: 2 }}>TAX INVOICE</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>{paymentTypeLabel}</Text>
        </View>
        <StatusPill status={pmtStatus} />
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 4 }}>
        {[
          ['Invoice No',     displayInvNumber],
          ['Order No',       b.bookingNumber],
          ['Issue Date',     fmtInvoiceDate(invoice?.invoiceDate || b.createdAt)],
          ['Service Date',   fmtInvoiceLong(b.scheduledDate)],
          ['Place of Supply',(ud.state || ud.city || 'India').toUpperCase()],
        ].map(([k, v]) => (
          <InfoRow key={k} label={k} value={v} />
        ))}
      </View>
    </View>
  );
}

function BillToSection({ title, ud, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel C={C}>{title}</SecLabel>
      <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 4 }}>{ud.name || '—'}</Text>
      {ud.email ? <Text style={{ fontSize: 12, color: C.textSecondary }}>{ud.email}</Text> : null}
      {ud.phone ? <Text style={{ fontSize: 12, color: C.textSecondary }}>{ud.phone}</Text> : null}
      <Text style={{ fontSize: 12, color: C.text, marginTop: 4, lineHeight: 18 }}>
        {[ud.address, ud.city, ud.district !== ud.city ? ud.district : null].filter(Boolean).join(', ')}
      </Text>
      {(ud.state || ud.pincode) && (
        <Text style={{ fontSize: 12, color: C.text }}>{[ud.state, ud.pincode].filter(Boolean).join(' — ')}</Text>
      )}
      <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>GSTIN: Unregistered</Text>
    </View>
  );
}

function BookingDetailsGrid({ b, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel C={C}>Booking Details</SecLabel>
      <View style={{ gap: 10 }}>
        {[
          { i: '🪔', l: 'Service',       v: b.poojaId?.name || '—' },
          { i: '📅', l: 'Date',          v: fmtInvoiceLong(b.scheduledDate) },
          { i: '⏰', l: 'Time',          v: b.scheduledTime || '—' },
          { i: '🌐', l: 'Language',      v: b.language || 'Hindi' },
          { i: '⚡', l: 'Booking Type',  v: (b.bookingType === 'urgent' || b.isUrgent) ? 'URGENT' : 'Normal' },
          { i: '📍', l: 'Location',      v: [b.userDetails?.address, b.userDetails?.city].filter(Boolean).join(', ') || '—' },
          { i: '👤', l: 'Pandit',        v: b.panditId?.name || (['paid','pandit_assigned'].includes(b.status) ? 'Being Assigned' : '—') },
          { i: '📦', l: 'Samagri Kit',   v: b.withKit && b.kitId ? b.kitId.name : 'Without Samagri' },
          { i: '🆔', l: 'Booking ID',    v: b.bookingNumber },
        ].map(({ i, l, v }) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <Text style={{ fontSize: 12 }}>{i}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: '#9ca3af', fontWeight: '700', letterSpacing: 1 }}>{l}</Text>
              <Text style={{ fontSize: 13, color: C.text, fontWeight: '500', marginTop: 1 }}>{v}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function OrderItemsTable({ lineItems, pricing, isInterState, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel C={C}>Order Items</SecLabel>
      <View style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#1B1F3B', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Text style={{ flex: 2, color: 'white', fontWeight: '700', fontSize: 10, letterSpacing: 1 }}>ITEM</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 10, letterSpacing: 1 }}>QTY</Text>
          <Text style={{ flex: 1.5, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 10, letterSpacing: 1 }}>RATE</Text>
          <Text style={{ flex: 1.5, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 10, letterSpacing: 1 }}>AMOUNT</Text>
        </View>
        {lineItems.map((item, idx) => (
          <View key={idx} style={{ flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.border, backgroundColor: idx % 2 === 1 ? (C.border + '20') : 'transparent' }}>
            <View style={{ flex: 2 }}>
              <Text style={{ fontWeight: '700', fontSize: 12, color: C.text }}>{item.desc}</Text>
              <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 1 }}>{item.sub}</Text>
            </View>
            <Text style={{ flex: 1, textAlign: 'right', fontSize: 12, color: C.text }}>{item.qty}</Text>
            <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 12, color: C.text }}>{formatCurrency(item.rate)}</Text>
            <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 12, fontWeight: '700', color: C.text }}>{formatCurrency(item.amt)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <View style={{ flex: 4.5, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '600' }}>Subtotal</Text>
          </View>
          <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(pricing.poojaAmount + pricing.kitAmount + pricing.platformFee)}</Text>
        </View>
        {pricing.totalTax > 0 && (
          <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10 }}>
            <View style={{ flex: 4.5, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '600' }}>{isInterState ? 'IGST (18%)' : 'GST — CGST 9% + SGST 9%'}</Text>
            </View>
            <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(pricing.totalTax)}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 10, backgroundColor: '#1B1F3B', borderRadius: 8, marginTop: 4 }}>
          <View style={{ flex: 4.5, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: '#D4AF37', letterSpacing: 1 }}>GRAND TOTAL</Text>
          </View>
          <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 18, fontWeight: '900', color: '#D4AF37' }}>{formatCurrency(pricing.grandTotal)}</Text>
        </View>
      </View>
    </View>
  );
}

function PaymentDetailsCard({ b, invoice, pricing, pmtStatus, paymentTypeLabel, C }) {
  const amtPaid = invoice?.amountPaid ?? b.amountPaid ?? (pmtStatus === 'FULLY_PAID' ? pricing.grandTotal : 0);
  const previouslyPaid = invoice?.previouslyPaid ?? 0;
  const outstandingAfter = invoice?.outstandingAfter ?? b.remainingAmount ?? 0;
  const isPartial = outstandingAfter > 0;

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel C={C}>Payment Details</SecLabel>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <AmountCard label="Order Total" amount={pricing.grandTotal} bg="#f0f4ff" border="#c7d2fe" color="#1B1F3B" />
        {previouslyPaid > 0 && <AmountCard label="Previously Paid" amount={previouslyPaid} bg="#f0f9ff" border="#bae6fd" color="#0369a1" />}
        <AmountCard label="This Invoice" amount={amtPaid} bg="#f0fdf4" border="#bbf7d0" color="#15803d" />
        {isPartial && <AmountCard label="Balance Due" amount={outstandingAfter} bg="#fff7ed" border="#fed7aa" color="#c2410c" />}
      </View>

      {(invoice?.merchantTransactionId || b.phonePeMerchantTransactionId || b.phonePeTransactionId) && (
        <View style={{ padding: 14, backgroundColor: '#f8f9ff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e7ff', gap: 8 }}>
          {[
            { k: 'Payment Type',    v: paymentTypeLabel },
            { k: 'Payment Gateway', v: (invoice?.paymentGateway || 'PhonePe').toUpperCase() },
            { k: 'Merchant Txn ID', v: invoice?.merchantTransactionId || b.phonePeMerchantTransactionId },
            ...(invoice?.gatewayTransactionId || b.phonePeTransactionId ? [{ k: 'Gateway Txn ID', v: invoice?.gatewayTransactionId || b.phonePeTransactionId }] : []),
            { k: 'Payment Method',  v: 'UPI / PhonePe' },
          ].map(({ k, v }) => (
            <View key={k}>
              <Text style={{ fontSize: 9, color: '#9ca3af', letterSpacing: 0.8, fontWeight: '700' }}>{k}</Text>
              <Text style={{ fontSize: 12, color: '#1B1F3B', fontWeight: '600' }}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AmountCard({ label, amount, bg, border, color }) {
  return (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: bg, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: border }}>
      <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '900', color }}>{formatCurrency(amount)}</Text>
    </View>
  );
}

function TaxSummaryTable({ pricing, isInterState, b, C }) {
  const totalGST = pricing.totalTax;
  if (totalGST <= 0) return null;

  const cgst = isInterState ? 0 : totalGST / 2;
  const sgst = isInterState ? 0 : totalGST / 2;
  const igst = isInterState ? totalGST : 0;

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel C={C}>Tax Summary</SecLabel>
      <View style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#4c1d95', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Text style={{ flex: 2.5, color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>ITEM</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>TAXABLE</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>RATE</Text>
          {isInterState ? (
            <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>IGST</Text>
          ) : (
            <>
              <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>CGST</Text>
              <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>SGST</Text>
            </>
          )}
          <Text style={{ flex: 1.2, textAlign: 'right', color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1 }}>TOTAL</Text>
        </View>
        {pricing.platformFee > 0 && pricing.platformGST > 0 && (
          <TaxRow label="Platform Fee GST" taxable={pricing.platformFee} tax={pricing.platformGST} isInterState={isInterState} C={C} />
        )}
        {pricing.kitGST > 0 && (
          <TaxRow label={`${b.kitId?.name || 'Kit'} GST`} taxable={pricing.kitAmount} tax={pricing.kitGST} isInterState={isInterState} C={C} />
        )}
        <View style={{ flexDirection: 'row', backgroundColor: '#4c1d95', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 10, marginTop: 4 }}>
          <Text style={{ flex: 2.5, color: 'white', fontWeight: '800', fontSize: 11 }}>Total Tax Collected</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 10 }}>GST</Text>
          {isInterState ? (
            <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '800', fontSize: 11 }}>{formatCurrency(igst)}</Text>
          ) : (
            <>
              <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '800', fontSize: 11 }}>{formatCurrency(cgst)}</Text>
              <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '800', fontSize: 11 }}>{formatCurrency(sgst)}</Text>
            </>
          )}
          <Text style={{ flex: 1.2, textAlign: 'right', color: '#c4b5fd', fontWeight: '900', fontSize: 14 }}>{formatCurrency(totalGST)}</Text>
        </View>
      </View>
    </View>
  );
}

function TaxRow({ label, taxable, tax, isInterState, C }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
      <Text style={{ flex: 2.5, fontSize: 11, color: C.text }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(taxable)}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: C.text }}>18%</Text>
      {isInterState ? (
        <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(tax)}</Text>
      ) : (
        <>
          <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(tax / 2)}</Text>
          <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(tax / 2)}</Text>
        </>
      )}
      <Text style={{ flex: 1.2, textAlign: 'right', fontSize: 11, fontWeight: '700', color: C.text }}>{formatCurrency(tax)}</Text>
    </View>
  );
}

function PaymentHistory({ invoices, bookingNumber, C }) {
  if (invoices.length <= 1) return null;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel C={C}>Payment History for Order {bookingNumber}</SecLabel>
      <View style={{ gap: 16, marginTop: 4 }}>
        {invoices.map((e, i) => (
          <View key={e._id || i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#15803d', marginTop: 4, borderWidth: 2, borderColor: '#bbf7d0' }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: C.text }}>
                    {PMT_LABEL[e.paymentType] || 'Payment'}
                    {e.status !== 'active' && (
                      <Text style={{ marginLeft: 6, fontSize: 10, color: '#b91c1c', backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        {' '}{e.status.toUpperCase()}{' '}
                      </Text>
                    )}
                  </Text>
                  <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 1 }}>{e.invoiceNumber} · Txn: {e.merchantTransactionId}</Text>
                  {e.invoiceDate && <Text style={{ fontSize: 10, color: C.textSecondary }}>{fmtInvoiceDate(e.invoiceDate)}</Text>}
                </View>
                <Text style={{ fontWeight: '900', fontSize: 16, color: '#15803d' }}>{formatCurrency(e.amountPaid)}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function AmountInWordsCard({ amtPaid, pmtStatus, C }) {
  return (
    <View style={[styles.card, { backgroundColor: '#f8f9ff', borderColor: C.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SecLabel C={C}>Amount in Words</SecLabel>
          <Text style={{ fontStyle: 'italic', color: '#374151', fontSize: 13, fontWeight: '600', lineHeight: 20 }}>
            {amtWords(amtPaid)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Payment Status</Text>
          <StatusPill status={pmtStatus} />
        </View>
      </View>
    </View>
  );
}

function InvoiceFooter() {
  const genTime = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <View style={{ backgroundColor: '#1B1F3B', borderRadius: 16, padding: 24, gap: 12 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 15 }}>🙏 Thank you for choosing Zutsav!</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>May your prayers be answered with divine grace.</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
        {[
          { k: 'Support', v: company.email },
          { k: 'WhatsApp', v: company.phone },
          { k: 'Website', v: company.web },
        ].map(({ k, v }) => (
          <View key={k} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>{k}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600' }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
          This is a computer-generated invoice · Valid for Input Tax Credit (ITC) where applicable
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Generated: {genTime}</Text>
      </View>
    </View>
  );
}

function BookingInvoice({ data, C }) {
  const { booking, paymentLedger = [], invoices } = data;
  const b = booking;
  const invoice = data.invoice || (data.invoices && data.invoices[0]) || null;
  const allInvoices = invoices || (data.invoice ? [data.invoice] : []);

  const pricing = resolvePricing(invoice || b);
  const pmtStatus = resolvePaymentStatus(b);
  const lineItems = buildLineItems(b, pricing);
  const ud = b.userDetails || {};

  const isInterState = !['uttarpradesh', 'up'].includes((ud.state || '').toLowerCase().replace(/\s+/g, ''));
  const displayInvNumber = invoice?.invoiceNumber || b.bookingNumber;
  const paymentTypeLabel = PMT_LABEL[invoice?.paymentType] || 'Payment Receipt';
  const amtPaid = invoice?.amountPaid ?? b.amountPaid ?? (pmtStatus === 'FULLY_PAID' ? pricing.grandTotal : 0);

  return (
    <>
      <InvoiceHeader b={b} invoice={invoice} pmtStatus={pmtStatus} displayInvNumber={displayInvNumber} paymentTypeLabel={paymentTypeLabel} C={C} />

      <BillToSection title="BILL TO" ud={ud} C={C} />

      <BookingDetailsGrid b={b} C={C} />

      <OrderItemsTable lineItems={lineItems} pricing={pricing} isInterState={isInterState} C={C} />

      <PaymentDetailsCard b={b} invoice={invoice} pricing={pricing} pmtStatus={pmtStatus} paymentTypeLabel={paymentTypeLabel} C={C} />

      <TaxSummaryTable pricing={pricing} isInterState={isInterState} b={b} C={C} />

      <PaymentHistory invoices={allInvoices} bookingNumber={b.bookingNumber} C={C} />

      <AmountInWordsCard amtPaid={amtPaid} pmtStatus={pmtStatus} C={C} />

      {/* Payment Ledger from booking (non-invoice payments) */}
      {paymentLedger.length > 0 && (
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <SecLabel C={C}>{paymentLedger.length > 1 ? `Payment History (${paymentLedger.length} payments)` : 'Payment'}</SecLabel>
          {paymentLedger.map((p, i) => (
            <View key={p._id || i} style={[i > 0 && { borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 8 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: C.text }}>Payment {i + 1} — {formatStatus(p.paymentType)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text }}>{formatCurrency(p.amount)}</Text>
              </View>
              <Text style={{ fontSize: 10, color: C.textSecondary }}>
                {p.paidAt ? formatDateTime(p.paidAt) : ''}{p.merchantTransactionId ? ` · ${p.merchantTransactionId}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <InvoiceFooter />
    </>
  );
}

function OrderInvoice({ data, C }) {
  const { order, shipment } = data;
  const addr = order.shippingAddress || {};
  const addressStr = [addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') || '—';
  const totalTax = (order.items || []).reduce((sum, it) => sum + (it.taxAmount || 0), 0);

  const ud = { name: addr.name || order.userId?.name, phone: addr.phone || order.userId?.phone };
  const displayInvNumber = order.orderNumber || order._id?.slice(-8).toUpperCase();

  return (
    <>
      <View style={{ backgroundColor: '#1B1F3B', borderRadius: 16, padding: 20 }}>
        <Text style={{ fontFamily: SERIF_FONT, fontSize: 26, fontWeight: '900', color: '#D4AF37'}}>Zutsav Enterprises</Text>
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>Tax Invoice</Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 8 }}>Order #{displayInvNumber}</Text>
        <View style={{ marginTop: 8 }}>
          <StatusPill status="FULLY_PAID" />
        </View>
      </View>

      <BillToSection title="Bill To" ud={ud} C={C} />

      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <SecLabel C={C}>Items</SecLabel>
        {(order.items || []).map((item, i) => (
          <View key={i} style={[i > 0 && { borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 8 }]}>
            <Text style={[styles.itemName, { color: C.text }]}>{item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</Text>
            <Text style={[styles.itemQty, { color: C.textSecondary }]}>Qty {item.quantity} × {formatCurrency(item.price)}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <SecLabel C={C}>Amount Breakdown</SecLabel>
        {totalTax > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: C.textSecondary }}>GST</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{formatCurrency(totalTax)}</Text>
          </View>
        )}
        <View style={[styles.divider, { backgroundColor: C.border }]} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.text }}>Grand Total</Text>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.primary }}>{formatCurrency(order.totalAmount || 0)}</Text>
        </View>
      </View>

      <InvoiceFooter />
    </>
  );
}

function esc(v) { return String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function buildBookingHtml({ booking, paymentLedger = [] }) {
  const b = booking;
  const pricing = resolvePricing(b);
  const lineItems = buildLineItems(b, pricing);
  const ud = b.userDetails || {};
  const rows = paymentLedger.map((p, i) => `<tr><td>Payment ${i + 1} (${esc(p.paymentType)})</td><td>${p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-IN') : ''}</td><td style="text-align:right">${formatCurrency(p.amount)}</td></tr>`).join('');
  const itemRows = lineItems.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.desc)}<br/><span style="font-size:12px;color:#9ca3af">${esc(it.sub)}</span></td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${formatCurrency(it.rate)}</td><td style="text-align:right">${formatCurrency(it.amt)}</td></tr>`).join('');
  const totalTax = pricing.totalTax;
  const isInterState = !['uttarpradesh', 'up'].includes((ud.state || '').toLowerCase().replace(/\s+/g, ''));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Helvetica,Arial,sans-serif;padding:0;margin:0;color:#1C1917">
    <div style="background:#1B1F3B;padding:32px 36px">
      <h1 style="color:#D4AF37;margin:0;font-size:26px">Zutsav Enterprises</h1>
      <p style="color:rgba(255,255,255,0.45);margin:4px 0 0;font-size:11px">${company.addr1}<br/>${company.addr2}<br/>GSTIN: ${company.gstin} · PAN: ${company.pan}</p>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h2 style="color:#1B1F3B;margin:0;font-size:18px">Tax Invoice</h2>
      <p style="color:#6b7280;font-size:12px">Booking #${esc(b.bookingNumber || b._id)}</p>
      <h3>Bill To</h3>
      <p>${esc(ud.name)}<br/>${esc(ud.phone)}${ud.email ? '<br/>' + esc(ud.email) : ''}<br/>${esc([ud.address, ud.city, ud.state, ud.pincode].filter(Boolean).join(', '))}</p>
      <h3>Booking Details</h3>
      <p>Service: ${esc(b.poojaId?.name)}<br/>Date: ${b.scheduledDate ? new Date(b.scheduledDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}<br/>Time: ${b.scheduledTime || ''}<br/>Pandit: ${esc(b.panditId?.name || 'Being assigned')}</p>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h3>Order Items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#1B1F3B;color:white">
          <th style="padding:8px 10px;text-align:left">#</th>
          <th style="padding:8px 10px;text-align:left">Item</th>
          <th style="padding:8px 10px;text-align:right">Qty</th>
          <th style="padding:8px 10px;text-align:right">Rate</th>
          <th style="padding:8px 10px;text-align:right">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr><td colspan="3"></td><td style="text-align:right;font-weight:600;padding:8px 10px;border-top:1px solid #e5e7eb">Subtotal</td><td style="text-align:right;padding:8px 10px;border-top:1px solid #e5e7eb">${formatCurrency(pricing.poojaAmount + pricing.kitAmount + pricing.platformFee)}</td></tr>
          ${totalTax > 0 ? `<tr><td colspan="3"></td><td style="text-align:right;font-weight:600;padding:6px 10px">${isInterState ? 'IGST (18%)' : 'GST'}</td><td style="text-align:right;padding:6px 10px">${formatCurrency(totalTax)}</td></tr>` : ''}
          <tr style="background:#1B1F3B"><td colspan="3"></td><td style="text-align:right;color:#D4AF37;font-weight:900;padding:12px 10px">GRAND TOTAL</td><td style="text-align:right;color:#D4AF37;font-weight:900;font-size:18px;padding:12px 10px">${formatCurrency(pricing.grandTotal)}</td></tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h3>Amount</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><td>Pooja Service</td><td style="text-align:right">${formatCurrency(pricing.poojaAmount)}</td></tr>
        ${pricing.kitAmount ? `<tr><td>Samagri Kit</td><td style="text-align:right">${formatCurrency(pricing.kitAmount)}</td></tr>` : ''}
        ${pricing.platformFee ? `<tr><td>Platform Fee</td><td style="text-align:right">${formatCurrency(pricing.platformFee)}</td></tr>` : ''}
        <tr style="font-weight:bold;border-top:1px solid #ccc"><td>Grand Total</td><td style="text-align:right">${formatCurrency(pricing.grandTotal)}</td></tr>
        <tr><td>Amount Paid</td><td style="text-align:right">${formatCurrency(b.amountPaid || 0)}</td></tr>
        ${b.remainingAmount ? `<tr><td>Balance Due</td><td style="text-align:right">${formatCurrency(b.remainingAmount)}</td></tr>` : ''}
      </table>
      <p style="font-style:italic;color:#374151;font-size:12px;margin-top:12px">${amtWords(b.amountPaid || pricing.grandTotal)}</p>
    </div>
    ${rows ? `<div style="padding:24px 36px;border-bottom:1px solid #e5e7eb"><h3>Payment History</h3><table style="width:100%;border-collapse:collapse">${rows}</table></div>` : ''}
    <div style="background:#1B1F3B;padding:24px 36px;text-align:center">
      <p style="color:#D4AF37;font-weight:800;font-size:15px;margin:0">🙏 Thank you for choosing Zutsav!</p>
      <p style="color:rgba(255,255,255,0.65);font-size:12px;margin:6px 0 0">${company.email} · ${company.phone} · ${company.web}</p>
      <p style="color:rgba(255,255,255,0.35);font-size:10px;margin:12px 0 0">This is a computer-generated invoice</p>
    </div>
  </body></html>`;
}

function buildOrderHtml({ order }) {
  const addr = order.shippingAddress || {};
  const itemRows = (order.items || []).map((it) => `<tr><td>${esc(it.name)}${it.variantLabel ? ' (' + esc(it.variantLabel) + ')' : ''}</td><td>${it.quantity}</td><td style="text-align:right">${formatCurrency(it.total ?? it.price * it.quantity)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Helvetica,Arial,sans-serif;padding:0;margin:0;color:#1C1917">
    <div style="background:#1B1F3B;padding:32px 36px">
      <h1 style="color:#D4AF37;margin:0;font-size:26px">Zutsav Enterprises</h1>
      <p style="color:rgba(255,255,255,0.45);margin:4px 0 0;font-size:11px">${company.addr1}<br/>${company.addr2}<br/>GSTIN: ${company.gstin} · PAN: ${company.pan}</p>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h2 style="color:#1B1F3B;margin:0;font-size:18px">Tax Invoice</h2>
      <p style="color:#6b7280;font-size:12px">Order #${esc(order.orderNumber || order._id)}</p>
      <h3>Bill To</h3>
      <p>${esc(addr.name || order.userId?.name)}<br/>${esc(addr.phone || order.userId?.phone)}<br/>${esc([addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', '))}</p>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h3>Items</h3>
      <table style="width:100%;border-collapse:collapse">${itemRows}</table>
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <tr style="font-weight:bold;border-top:1px solid #ccc"><td>Grand Total</td><td style="text-align:right">${formatCurrency(order.totalAmount || 0)}</td></tr>
      </table>
    </div>
    <div style="background:#1B1F3B;padding:24px 36px;text-align:center">
      <p style="color:#D4AF37;font-weight:800;font-size:15px;margin:0">🙏 Thank you for choosing Zutsav!</p>
      <p style="color:rgba(255,255,255,0.65);font-size:12px;margin:6px 0 0">${company.email} · ${company.phone} · ${company.web}</p>
    </div>
  </body></html>`;
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  card:        { borderRadius: 16, borderWidth: 1, padding: 16 },
  divider:     { height: 1, marginVertical: 4 },
  itemName:    { fontSize: 13, fontWeight: '600' },
  itemQty:     { fontSize: 12, marginTop: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 15,
  },
  shareBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pill: {
    paddingHorizontal: 16, paddingVertical: 4, borderRadius: 20,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});