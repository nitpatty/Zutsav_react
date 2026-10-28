import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, amtWords, fmtInvoiceDate, fmtInvoiceLong } from '../../utils/helpers';
import { company } from '../../config/company.config';
import {
  mapBookingInvoiceResponse, buildInvoiceView, summariseInvoice,
} from '../../utils/bookingInvoice';
import { buildBookingInvoiceHtml, esc } from '../../utils/bookingInvoiceHtml';
import ScreenHeader from '../../components/ScreenHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useTranslation } from '../../i18n';

const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const STATUS_CFG = {
  FULLY_PAID:     { label: 'Paid in Full',       color: '#15803d', bg: '#dcfce7' },
  PARTIALLY_PAID: { label: 'Partially Paid',     color: '#c2410c', bg: '#ffedd5' },
  PENDING:        { label: 'Payment Pending',    color: '#b45309', bg: '#fef3c7' },
  REFUNDED:       { label: 'Refunded',           color: '#374151', bg: '#f3f4f6' },
  FAILED:         { label: 'Payment Failed',     color: '#b91c1c', bg: '#fee2e2' },
  CANCELLED:      { label: 'Cancelled',          color: '#6b7280', bg: '#f3f4f6' },
  UNKNOWN:        { label: 'Status Unavailable', color: '#6b7280', bg: '#f3f4f6' },
};

function StatusPill({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.PENDING;
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

export default function InvoiceScreen({ route }) {
  const { type, id } = route.params || {};
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [data, setData] = useState(null);                 // marketplace order payload
  const [bookingData, setBookingData] = useState(null);   // { booking, invoices } — persisted booking invoices
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [selected, setSelected] = useState(0);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (type === 'order') {
        const { data: res } = await api.get(`/marketplace/orders/${id}/invoice`);
        setData(res);
      } else {
        // Official persisted invoices (same API as the website's InvoicePage). The older
        // /bookings/:id/invoice returns { booking, paymentLedger } — no invoice documents.
        const { data: res } = await api.get(`/invoices/booking/${id}`);
        setBookingData(mapBookingInvoiceResponse(res));
        setSelected(0);
      }
    } catch (err) {
      const status = err?.response?.status;
      // the kind is stored (not the text) so a language change never re-runs the load or leaves old-language text
      setErrorMsg(status === 403 || status === 404 ? 'access' : 'failed');
    } finally {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => { load(); }, [load]);

  const invoices = bookingData?.invoices || [];
  const view = useMemo(() => {
    if (type === 'order' || !invoices.length) return null;
    const inv = invoices[Math.min(selected, invoices.length - 1)];
    return buildInvoiceView(inv, bookingData.booking, company);
  }, [type, invoices, selected, bookingData]);

  const handleShare = async () => {
    try {
      setSharing(true);
      const html = type === 'order' ? buildOrderHtml(data) : buildBookingInvoiceHtml(view);
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      } else {
        Toast.show({ type: 'error', text1: t('invoice.noSharing') });
      }
    } catch {
      Toast.show({ type: 'error', text1: t('invoice.pdfFailed') });
    } finally {
      setSharing(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const Message = ({ title, body, actionLabel }) => (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScreenHeader title={t('invoice.title')} />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 }}>
        <Ionicons name="document-text-outline" size={48} color={C.border} />
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
        {body ? <Text style={{ color: C.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>{body}</Text> : null}
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: C.primary }]} onPress={load} accessibilityRole="button">
          <Text style={styles.retryText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (errorMsg) return <Message title={errorMsg === 'access' ? t('invoice.notFoundAccess') : t('invoice.loadFailed')} actionLabel={t('common.retry')} />;
  if (type === 'order' && !data) return <Message title={t('invoice.unavailable')} actionLabel={t('common.retry')} />;
  if (type !== 'order' && !invoices.length) {
    return (
      <Message
        title={t('invoice.none')}
        body={t('invoice.noneBody')}
        actionLabel={t('invoice.refresh')}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('invoice.title')} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        {type === 'order' ? (
          <OrderInvoice data={data} C={C} />
        ) : (
          <>
            {invoices.length > 1 && (
              <InvoiceSelector invoices={invoices} selected={selected} onSelect={setSelected} C={C} />
            )}
            <BookingInvoice view={view} invoices={invoices} C={C} />
          </>
        )}

        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: C.primary, opacity: sharing ? 0.6 : 1 }]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
        >
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.shareBtnText}>{sharing ? t('invoice.preparing') : t('invoice.share')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SecLabel({ children }) {
  return <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 10 }}>{children}</Text>;
}

function InfoRow({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'flex-end', alignItems: 'baseline' }}>
      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{label}</Text>
      <Text testID={`invoice-meta-${label}`} style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', minWidth: 150, textAlign: 'left' }}>{value}</Text>
    </View>
  );
}

// Several invoices can exist for one booking (e.g. advance + final payment): pick
// which official document is shown — and shared as PDF.
function InvoiceSelector({ invoices, selected, onSelect, C }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>{t('invoice.count', { n: invoices.length })}</SecLabel>
      <View style={{ gap: 8 }}>
        {invoices.map((inv, i) => {
          const s = summariseInvoice(inv);
          const active = i === selected;
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => onSelect(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('invoice.a11yInvoice', { number: s.invoiceNumber })}
              style={{ borderWidth: 1.5, borderColor: active ? C.primary : C.border, backgroundColor: active ? C.primary + '14' : 'transparent', borderRadius: 12, padding: 10 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: C.text }}>{s.invoiceNumber}</Text>
                <Text style={{ fontWeight: '800', fontSize: 13, color: C.text }}>{formatCurrency(s.amountPaid)}</Text>
              </View>
              <Text style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>
                {s.label}{s.date ? ` · ${fmtInvoiceDate(s.date)}` : ''}{s.status !== 'active' ? ` · ${s.status.toUpperCase()}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function InvoiceHeader({ view }) {
  const { seller } = view;
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: '#1B1F3B' }}>
      <View style={{ padding: 20 }}>
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: '900', color: '#D4AF37' }}>
            {seller.name}
          </Text>
        </View>
        <View style={{ gap: 3 }}>
          {seller.addr1 ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{seller.addr1}</Text> : null}
          {seller.addr2 ? <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>{seller.addr2}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            {seller.gstin ? <Text style={{ color: '#D4AF37', fontSize: 11, fontWeight: '700' }}>GSTIN: {seller.gstin}</Text> : null}
            {seller.pan ? <Text style={{ color: '#D4AF37', fontSize: 11, fontWeight: '700' }}>PAN: {seller.pan}</Text> : null}
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{seller.email} · {seller.phone} · {seller.web}</Text>
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ color: '#D4AF37', fontSize: 22, fontWeight: '900', letterSpacing: 2 }}>TAX INVOICE</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>{view.paymentTypeLabel}</Text>
        </View>
        <StatusPill status={view.payment.status} />
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 4 }}>
        {[
          ['Invoice No',      view.invoiceNumber],
          ['Order No',        view.bookingNumber || '—'],
          ['Issue Date',      fmtInvoiceDate(view.invoiceDate)],
          ['Service Date',    fmtInvoiceLong(view.serviceDate)],
          ['Place of Supply', view.placeOfSupply],
          ...(view.status !== 'active' ? [['Invoice Status', view.status.toUpperCase()]] : []),
        ].map(([k, v]) => (
          <InfoRow key={k} label={k} value={v} />
        ))}
      </View>
      {view.payment.status === 'CANCELLED' && (
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, paddingHorizontal: 20, paddingBottom: 14, textAlign: 'right' }}>
          Payment: {view.payment.cancelledNote}
        </Text>
      )}
    </View>
  );
}

function BillToSection({ title, ud, C }) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>{title}</SecLabel>
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

function BookingDetailsGrid({ view, C }) {
  const d = view.details;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>Booking Details</SecLabel>
      <View style={{ gap: 10 }}>
        {[
          { i: '🪔', l: 'Service',      v: d.service || '—' },
          { i: '📅', l: 'Date',         v: fmtInvoiceLong(view.serviceDate) },
          { i: '⏰', l: 'Time',         v: view.serviceTime || '—' },
          ...(d.language ? [{ i: '🌐', l: 'Language', v: d.language }] : []),
          { i: '⚡', l: 'Booking Type', v: d.urgent ? 'URGENT' : 'Normal' },
          { i: '📍', l: 'Location',     v: d.location || '—' },
          { i: '👤', l: 'Pandit',       v: d.pandit || '—' },
          { i: '📦', l: 'Samagri Kit',  v: d.kit },
          { i: '🆔', l: 'Booking ID',   v: view.bookingNumber || '—' },
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

function OrderItemsTable({ view, C }) {
  const { lineItems, tax, pricing } = view;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>Order Items</SecLabel>
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
          <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(view.subtotal)}</Text>
        </View>
        {tax.total > 0 && (
          <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10 }}>
            <View style={{ flex: 4.5, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '600' }}>{tax.totalLabel}</Text>
            </View>
            <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 11, color: C.text }}>{formatCurrency(tax.total)}</Text>
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

function PaymentDetailsCard({ view, C }) {
  const p = view.payment;
  const isPartial = p.outstanding > 0;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>Payment Details</SecLabel>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <AmountCard label="Order Total" amount={p.orderTotal} bg="#f0f4ff" border="#c7d2fe" color="#1B1F3B" />
        {p.previouslyPaid > 0 && <AmountCard label="Previously Paid" amount={p.previouslyPaid} bg="#f0f9ff" border="#bae6fd" color="#0369a1" />}
        <AmountCard label="This Invoice" amount={p.thisInvoice} bg="#f0fdf4" border="#bbf7d0" color="#15803d" />
        {isPartial && <AmountCard label="Balance Due" amount={p.outstanding} bg="#fff7ed" border="#fed7aa" color="#c2410c" />}
      </View>

      {(p.merchantTransactionId || p.gatewayTransactionId) && (
        <View style={{ padding: 14, backgroundColor: '#f8f9ff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e7ff', gap: 8 }}>
          {[
            { k: 'Payment Type', v: view.paymentTypeLabel },
            ...(p.gateway ? [{ k: 'Payment Gateway', v: p.gateway.toUpperCase() }] : []),
            ...(p.merchantTransactionId ? [{ k: 'Merchant Txn ID', v: p.merchantTransactionId }] : []),
            ...(p.gatewayTransactionId ? [{ k: 'Gateway Txn ID', v: p.gatewayTransactionId }] : []),
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

const TH = { color: 'white', fontWeight: '700', fontSize: 9, letterSpacing: 1, textAlign: 'right' };

function TaxSummaryTable({ view, C }) {
  const { tax } = view;
  if (tax.total <= 0) return null;
  const cols = tax.split === 'igst' ? ['IGST'] : tax.split === 'cgst_sgst' ? ['CGST', 'SGST'] : [];

  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>Tax Summary</SecLabel>
      <View style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#4c1d95', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Text style={[TH, { flex: 2.5, textAlign: 'left' }]}>ITEM</Text>
          <Text style={[TH, { flex: 1 }]}>TAXABLE</Text>
          <Text style={[TH, { flex: 1 }]}>RATE</Text>
          {cols.map((c) => <Text key={c} style={[TH, { flex: 1 }]}>{c}</Text>)}
          <Text style={[TH, { flex: 1.2 }]}>TOTAL</Text>
        </View>
        {tax.rows.map((r) => (
          <TaxRow key={r.key} label={r.key === 'kit' ? 'Samagri Kit GST' : 'Platform Fee GST'} row={r} split={tax.split} C={C} />
        ))}
        <View style={{ flexDirection: 'row', backgroundColor: '#4c1d95', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 10, marginTop: 4 }}>
          <Text style={{ flex: 2.5, color: 'white', fontWeight: '800', fontSize: 11 }}>Total Tax Collected</Text>
          <Text style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 10 }}>GST</Text>
          {tax.split === 'igst' && (
            <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '800', fontSize: 11 }}>{formatCurrency(tax.igst)}</Text>
          )}
          {tax.split === 'cgst_sgst' && (
            <>
              <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '800', fontSize: 11 }}>{formatCurrency(tax.cgst)}</Text>
              <Text style={{ flex: 1, textAlign: 'right', color: 'white', fontWeight: '800', fontSize: 11 }}>{formatCurrency(tax.sgst)}</Text>
            </>
          )}
          <Text style={{ flex: 1.2, textAlign: 'right', color: '#c4b5fd', fontWeight: '900', fontSize: 14 }}>{formatCurrency(tax.total)}</Text>
        </View>
      </View>
    </View>
  );
}

function TaxRow({ label, row, split, C }) {
  const cell = { flex: 1, textAlign: 'right', fontSize: 11, color: C.text };
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
      <Text style={{ flex: 2.5, fontSize: 11, color: C.text }}>{label}</Text>
      <Text style={cell}>{formatCurrency(row.taxable)}</Text>
      <Text style={cell}>{row.rate != null ? `${row.rate}%` : '—'}</Text>
      {split === 'igst' && <Text style={cell}>{formatCurrency(row.tax)}</Text>}
      {split === 'cgst_sgst' && (
        <>
          <Text style={cell}>{formatCurrency(row.tax / 2)}</Text>
          <Text style={cell}>{formatCurrency(row.tax / 2)}</Text>
        </>
      )}
      <Text style={[cell, { flex: 1.2, fontWeight: '700' }]}>{formatCurrency(row.tax)}</Text>
    </View>
  );
}

function PaymentHistory({ invoices, bookingNumber, C }) {
  if (invoices.length <= 1) return null;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <SecLabel>{`Payment History for Order ${bookingNumber || ''}`}</SecLabel>
      <View style={{ gap: 16, marginTop: 4 }}>
        {invoices.map((inv, i) => {
          const e = summariseInvoice(inv);
          return (
            <View key={e.id || i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: e.status === 'cancelled' ? '#b91c1c' : '#15803d', marginTop: 4, borderWidth: 2, borderColor: '#bbf7d0' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 13, color: C.text }}>
                      {e.label}
                      {e.status !== 'active' && (
                        <Text style={{ marginLeft: 6, fontSize: 10, color: '#b91c1c', backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          {' '}{e.status.toUpperCase()}{' '}
                        </Text>
                      )}
                    </Text>
                    <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 1 }}>
                      {e.invoiceNumber}{e.merchantTransactionId ? ` · Txn: ${e.merchantTransactionId}` : ''}
                    </Text>
                    {e.date ? <Text style={{ fontSize: 10, color: C.textSecondary }}>{fmtInvoiceDate(e.date)}</Text> : null}
                  </View>
                  <Text style={{ fontWeight: '900', fontSize: 16, color: '#15803d' }}>{formatCurrency(e.amountPaid)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function AmountInWordsCard({ view, C }) {
  return (
    <View style={[styles.card, { backgroundColor: '#f8f9ff', borderColor: C.border }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <SecLabel>Amount in Words</SecLabel>
          <Text style={{ fontStyle: 'italic', color: '#374151', fontSize: 13, fontWeight: '600', lineHeight: 20 }}>
            {amtWords(view.payment.thisInvoice)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Payment Status</Text>
          <StatusPill status={view.payment.status} />
        </View>
      </View>
    </View>
  );
}

function InvoiceFooter({ contact = company }) {
  const genTime = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', hour12: false });
  return (
    <View style={{ backgroundColor: '#1B1F3B', borderRadius: 16, padding: 24, gap: 12 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: '#D4AF37', fontWeight: '800', fontSize: 15 }}>🙏 Thank you for choosing Zutsav!</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>May your prayers be answered with divine grace.</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
        {[
          { k: 'Support', v: contact.email },
          { k: 'WhatsApp', v: contact.phone },
          { k: 'Website', v: contact.web },
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

function BookingInvoice({ view, invoices, C }) {
  return (
    <>
      <InvoiceHeader view={view} />
      <BillToSection title="BILL TO" ud={view.customer} C={C} />
      <BookingDetailsGrid view={view} C={C} />
      <OrderItemsTable view={view} C={C} />
      <PaymentDetailsCard view={view} C={C} />
      <TaxSummaryTable view={view} C={C} />
      <PaymentHistory invoices={invoices} bookingNumber={view.bookingNumber} C={C} />
      <AmountInWordsCard view={view} C={C} />
      <InvoiceFooter contact={view.seller} />
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
        <Text style={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: '900', color: '#D4AF37'}}>ZUTSAV PVT. LTD.</Text>
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>Tax Invoice</Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 8 }}>Order #{displayInvNumber}</Text>
        <View style={{ marginTop: 8 }}>
          <StatusPill status="FULLY_PAID" />
        </View>
      </View>

      <BillToSection title="Bill To" ud={ud} C={C} />

      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <SecLabel>Items</SecLabel>
        {(order.items || []).map((item, i) => (
          <View key={i} style={[i > 0 && { borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 8 }]}>
            <Text style={[styles.itemName, { color: C.text }]}>{item.name}{item.variantLabel ? ` (${item.variantLabel})` : ''}</Text>
            <Text style={[styles.itemQty, { color: C.textSecondary }]}>Qty {item.quantity} × {formatCurrency(item.price)}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <SecLabel>Amount Breakdown</SecLabel>
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

function buildOrderHtml({ order }) {
  const addr = order.shippingAddress || {};
  const itemRows = (order.items || []).map((it) => `<tr><td>${esc(it.name)}${it.variantLabel ? ' (' + esc(it.variantLabel) + ')' : ''}</td><td>${it.quantity}</td><td style="text-align:right">${formatCurrency(it.total ?? it.price * it.quantity)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Helvetica,Arial,sans-serif;padding:0;margin:0;color:#1C1917">
    <div style="background:#1B1F3B;padding:32px 36px">
      <h1 style="color:#D4AF37;margin:0;font-size:26px">ZUTSAV PVT. LTD.</h1>
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
  retryBtn:    { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 4, borderRadius: 20,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
