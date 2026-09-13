import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import API from '../api/axios';
import ZutsavLoader from '../components/shared/ZutsavLoader';
import { company as CO, handleImageError } from '../config';
import { useSettings } from '../context/SettingsContext';

/* ─────────────────────────────────────────────────────────
   Formatters
──────────────────────────────────────────────────────────── */
const INR = (n) =>
  `₹${(+(n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtLong = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

/* ── Number to Indian words ─────────────────────────────── */
const W1 = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
             'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
             'Seventeen', 'Eighteen', 'Nineteen'];
const W10 = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function _w(n) {
  if (n === 0) return '';
  if (n < 20)  return W1[n] + ' ';
  if (n < 100) return W10[Math.floor(n / 10)] + (n % 10 ? ' ' + W1[n % 10] : '') + ' ';
  if (n < 1000)     return W1[Math.floor(n / 100)] + ' Hundred ' + _w(n % 100);
  if (n < 100000)   return _w(Math.floor(n / 1000)) + 'Thousand ' + _w(n % 1000);
  if (n < 10000000) return _w(Math.floor(n / 100000)) + 'Lakh ' + _w(n % 100000);
  return _w(Math.floor(n / 10000000)) + 'Crore ' + _w(n % 10000000);
}
function amtWords(num) {
  if (!num || num === 0) return 'Zero Rupees Only';
  const r = Math.floor(num);
  const p = Math.round((num - r) * 100);
  let s = _w(r).trim() + ' Rupees';
  if (p > 0) s += ' and ' + _w(p).trim() + ' Paise';
  return s + ' Only';
}

/* ─────────────────────────────────────────────────────────
   Pricing resolver — handles new GST fields + legacy fields
──────────────────────────────────────────────────────────── */
function resolvePricing(b) {
  const hasNew = (b.poojaAmount > 0 || b.platformFee > 0 || b.grandTotal > 0);
  if (hasNew) {
    const poojaAmt  = b.poojaAmount  || 0;
    const kitAmt    = b.kitAmount    || 0;
    const kitGST    = b.kitGST       || 0;
    const platFee   = b.platformFee  || 0;
    const platGST   = b.platformGST  || 0;
    return {
      poojaAmount:  poojaAmt,
      kitAmount:    kitAmt,
      kitGST,
      platformFee:  platFee,
      platformGST:  platGST,
      urgentSurcharge: b.urgentSurcharge || 0,
      totalTax:     kitGST + platGST,
      grandTotal:   b.grandTotal || b.amount || 0,
    };
  }
  // Legacy: derive from amount + commissionAmount + gstAmount
  return {
    poojaAmount:  b.baseAmount || b.amount || 0,
    kitAmount:    0,
    kitGST:       0,
    platformFee:  b.commissionAmount || 0,
    platformGST:  b.gstAmount || 0,
    urgentSurcharge: b.urgentSurcharge || 0,
    totalTax:     b.gstAmount || 0,
    grandTotal:   b.amount || 0,
  };
}

/* ─────────────────────────────────────────────────────────
   Effective payment status (handles backward-compat)

   Cancellation is a terminal state and always takes priority over
   whatever paymentStatus the booking happened to be in when it was
   cancelled — cancelBooking() only flips paymentStatus to REFUNDED
   when something was actually paid (booking.controller.js), so a
   booking cancelled *before* any payment keeps paymentStatus:'PENDING'
   forever. Without this check that reads as "still pending", which is
   wrong — the order isn't pending, it's cancelled.

   `b` (booking) is expected to always be present — bookings are never
   hard-deleted anywhere in this codebase, cancellation only ever sets
   status:'cancelled'. If it's still missing, that's an orphaned
   invoice->booking reference (data integrity issue), not a normal
   invoice state, so this returns 'UNKNOWN' rather than guessing.
──────────────────────────────────────────────────────────── */
function resolvePaymentStatus(invoice, b) {
  if (invoice?.status === 'cancelled' || b?.status === 'cancelled') return 'CANCELLED';
  if (!b) return 'UNKNOWN';
  if (b.paymentStatus === 'FULLY_PAID')    return 'FULLY_PAID';
  if (b.paymentStatus === 'PARTIALLY_PAID') return 'PARTIALLY_PAID';
  if (b.paymentStatus === 'REFUNDED')      return 'REFUNDED';
  if (b.paymentStatus === 'FAILED')        return 'FAILED';
  const ACTIVE = ['paid','pandit_assigned','pandit_accepted','pending_reassignment','completion_requested','completed'];
  if (ACTIVE.includes(b.status)) return 'FULLY_PAID';
  return 'PENDING';
}

/* What happened to the money on a cancelled invoice — derived from the
   same booking.refund subdocument the cancellation flow already
   populates (booking.controller.js cancelBooking), never guessed. */
function cancelledPaymentNote(b) {
  if (!b) return 'Not Applicable';
  if (!((b.amountPaid || 0) > 0)) return 'Not Applicable';
  if (['completed', 'processed'].includes(b.refund?.status)) return 'Refunded';
  if (['pending', 'approved'].includes(b.refund?.status)) return 'Refund Pending';
  return 'Payment Cancelled';
}

/* ─────────────────────────────────────────────────────────
   Print-safe CSS — tuned so a complete booking invoice fits
   on ONE A4 portrait page (see invoiceLayout audit).
   - 6mm @page margins (was 10mm) recover ~10mm of height.
   - #zut-inv expands to the full printable width so the
     narrowing that used to re-wrap grids/tables is avoided.
   - Every .inv-block section is kept unbroken (no mid-section
     page split) — the compact layout must stay within one page.
──────────────────────────────────────────────────────────── */
const PRINT_CSS = `
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background: white !important; margin: 0 !important; }
    .no-print { display: none !important; }
    .inv-wrap  { background: white !important; padding: 0 !important; min-height: auto !important; }
    #zut-inv   { box-shadow: none !important; border-radius: 0 !important;
                 max-width: none !important; width: 100% !important; margin: 0 !important; }
    .inv-block { page-break-inside: avoid; break-inside: avoid; }
    @page { size: A4 portrait; margin: 6mm; }
  }
`;

/* ── Legal suffix (INVOICE DISPLAY ONLY) ─────────────────
   The Zutsav brand is carried by the dynamic Platform Logo
   (settings logo → logoUrl) — which must stay untouched.
   The gold text line under the logo shows ONLY the registered
   legal suffix 'PVT. LTD.' so the brand name is never
   duplicated as separate text. platformName still drives the
   logo `alt` below.                                     */
const LEGAL_SUFFIX = 'PVT. LTD.';

/* ─────────────────────────────────────────────────────────
   Micro-components
──────────────────────────────────────────────────────────── */
const STATUS_CFG = {
  FULLY_PAID:    { label: 'Paid in Full',     bg:'#dcfce7', color:'#15803d', border:'#86efac' },
  PARTIALLY_PAID:{ label: 'Partially Paid',   bg:'#ffedd5', color:'#c2410c', border:'#fed7aa' },
  PENDING:       { label: 'Payment Pending',  bg:'#fef3c7', color:'#b45309', border:'#fde68a' },
  REFUNDED:      { label: 'Refunded',         bg:'#f3f4f6', color:'#374151', border:'#d1d5db' },
  FAILED:        { label: 'Payment Failed',   bg:'#fee2e2', color:'#b91c1c', border:'#fca5a5' },
  CANCELLED:     { label: 'Cancelled',        bg:'#f3f4f6', color:'#6b7280', border:'#d1d5db' },
  UNKNOWN:       { label: 'Status Unavailable', bg:'#f3f4f6', color:'#6b7280', border:'#d1d5db' },
};

function StatusPill({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.PENDING;
  return (
    <span style={{
      display:'inline-block', padding:'5px 18px', borderRadius:999,
      fontWeight:700, fontSize:13, letterSpacing:0.5,
      background:c.bg, color:c.color, border:`1.5px solid ${c.border}`,
    }}>{c.label}</span>
  );
}

function SecLabel({ children }) {
  return (
    <div style={{ fontSize:10, fontWeight:800, letterSpacing:'1.5px',
      textTransform:'uppercase', color:'#9ca3af', marginBottom:10 }}>
      {children}
    </div>
  );
}

function Cell({ children, right, bold, gold, small }) {
  return (
    <td style={{
      padding: right ? '8px 12px' : '8px 12px',
      textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 700 : 400,
      fontSize: small ? 11.5 : 13,
      color: gold ? '#D4AF37' : bold ? '#111827' : '#374151',
    }}>
      {children}
    </td>
  );
}

function TH({ children, right }) {
  return (
    <th style={{
      padding:'8px 12px', textAlign: right ? 'right' : 'left',
      fontWeight:700, fontSize:10.5, letterSpacing:1, textTransform:'uppercase',
      color:'white',
    }}>
      {children}
    </th>
  );
}

/* ─────────────────────────────────────────────────────────
   Line-items builder
──────────────────────────────────────────────────────────── */
// Every selected kit becomes its own line item (multi-select). `kitIds` is the
// current field; `kitId` is the legacy single-kit alias on older bookings.
function selectedKitsOf(b) {
  if (b.kitIds?.length > 0) return b.kitIds;
  if (b.kitId) return [b.kitId];
  return [];
}

function buildLineItems(b, pricing) {
  const items = [];
  if (pricing.poojaAmount > 0) {
    items.push({
      desc: b.poojaId?.name || 'Pooja Service',
      sub: [
        'Spiritual ceremony service',
        b.language && `Language: ${b.language}`,
        (b.bookingType === 'urgent' || b.isUrgent) && '⚡ Urgent Booking',
        (!b.withKit || selectedKitsOf(b).length === 0) && 'Kit: Without Samagri',
      ].filter(Boolean).join(' · '),
      qty: 1,
      rate: pricing.poojaAmount,
      amt:  pricing.poojaAmount,
    });
  }
  if (b.withKit && pricing.kitAmount > 0) {
    const kits = selectedKitsOf(b);
    if (kits.length === 0) {
      items.push({
        desc: 'Samagri Kit',
        sub:  'Pooja samagri kit',
        qty:  1,
        rate: pricing.kitAmount,
        amt:  pricing.kitAmount,
      });
    } else {
      kits.forEach((k) => items.push({
        desc: k.name || 'Samagri Kit',
        sub:  'Pooja samagri kit',
        qty:  1,
        rate: k.discountPrice || 0,
        amt:  k.discountPrice || 0,
      }));
    }
  }
  if (pricing.platformFee > 0) {
    items.push({
      desc: 'Platform Convenience Fee',
      sub:  'Booking, support & service platform charges',
      qty:  1,
      rate: pricing.platformFee,
      amt:  pricing.platformFee,
    });
  }
  if (pricing.urgentSurcharge > 0) {
    items.push({
      desc: 'Urgent Booking Surcharge',
      sub:  b.urgentHikeType === 'fixed'
        ? `Flat hike of ₹${b.urgentHikeFixed || 0} on the Pooja price`
        : `${b.urgentHikePercent || 0}% of the Pooja price`,
      qty:  1,
      rate: pricing.urgentSurcharge,
      amt:  pricing.urgentSurcharge,
    });
  }
  // Fallback: old booking with only `amount`
  if (items.length === 0) {
    items.push({
      desc: b.poojaId?.name || 'Pooja Service',
      sub:  'Spiritual ceremony service',
      qty:  1,
      rate: b.amount || 0,
      amt:  b.amount || 0,
    });
  }
  return items;
}

/* ── Payment type label ─────────────────────────────────── */
const PMT_LABEL = { PARTIAL: 'Advance Payment', REMAINING: 'Final Payment', FULL: 'Full Payment' };

/* ════════════════════════════════════════════════════════
   INVOICE PAGE — supports both:
     /invoice/:bookingId        (legacy — loads first invoice for booking)
     /invoice/view/:invoiceNumber  (new — loads specific invoice)
═══════════════════════════════════════════════════════════ */
export default function InvoicePage() {
  const { bookingId, invoiceNumber } = useParams();
  const navigate = useNavigate();
  const { logoUrl, platformName } = useSettings();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    const fetch = invoiceNumber
      ? API.get(`/invoices/number/${invoiceNumber}`)
      : API.get(`/invoices/booking/${bookingId}`);

    fetch
      .then(r => setData(r.data))
      .catch(() => setErr('Invoice not found or you do not have access.'))
      .finally(() => setLoading(false));
  }, [bookingId, invoiceNumber]);

  if (loading) return <ZutsavLoader fullscreen size={64} message="Loading invoice…" />;

  if (err) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
                  background:'#f1f5f9', flexDirection:'column', gap:16 }}>
      <p style={{ color:'#b91c1c', fontWeight:600, fontSize:16 }}>{err}</p>
      <button onClick={() => navigate('/my-bookings')}
        style={{ padding:'10px 24px', borderRadius:12, background:'#1B1F3B',
                 color:'white', fontWeight:700, cursor:'pointer', border:'none' }}>
        Back to My Bookings
      </button>
    </div>
  );

  // /invoice/view/:invoiceNumber → { invoice, booking }
  // /invoice/:bookingId          → { invoices: [...], booking }
  const b       = data.booking;
  const invoice = data.invoice || (data.invoices && data.invoices[0]) || null;
  const invoices = data.invoices || (data.invoice ? [data.invoice] : []);

  // Bookings are never hard-deleted in this system (cancellation only sets
  // status:'cancelled') — so `b` missing here means the invoice's bookingId
  // doesn't resolve to a real booking, an orphaned-reference data problem,
  // not a normal invoice state. Rendering the rest of this page from `b.xxx`
  // would either crash or silently mix invoice-snapshot data with fabricated
  // placeholders on a real tax document — surface it clearly instead.
  if (!b) {
    console.error(
      `[InvoicePage] No booking found for invoice ${invoice?.invoiceNumber || invoiceNumber || ''} ` +
      `(bookingId: ${invoice?.bookingId || bookingId || 'unknown'}). The booking record may have been removed.`
    );
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
                    background:'#f1f5f9', flexDirection:'column', gap:16, padding:24, textAlign:'center' }}>
        <p style={{ color:'#b91c1c', fontWeight:600, fontSize:16, maxWidth:440 }}>
          This invoice's booking details could not be loaded
          {invoice?.invoiceNumber ? ` (Invoice #${invoice.invoiceNumber})` : ''}.
          {invoice?.status === 'cancelled' ? ' This invoice is cancelled.' : ''} Please contact support.
        </p>
        <button onClick={() => navigate('/my-bookings')}
          style={{ padding:'10px 24px', borderRadius:12, background:'#1B1F3B',
                   color:'white', fontWeight:700, cursor:'pointer', border:'none' }}>
          Back to My Bookings
        </button>
      </div>
    );
  }

  const pricing   = resolvePricing(invoice || b);
  const pmtStatus = resolvePaymentStatus(invoice, b);
  const lineItems = buildLineItems(b, pricing);
  const subtotal  = lineItems.reduce((s, i) => s + i.amt, 0);

  // Prefer invoice fields; fall back to booking fields for legacy data
  const amtPaid         = invoice?.amountPaid      ?? b.amountPaid  ?? (pmtStatus === 'FULLY_PAID' ? pricing.grandTotal : 0);
  const previouslyPaid  = invoice?.previouslyPaid  ?? 0;
  const outstandingAfter = invoice?.outstandingAfter ?? b.remainingAmount ?? 0;
  // Cancelled orders never have a real balance still "due" — the service
  // isn't happening — regardless of whatever remainingAmount was snapshotted.
  const isPartial       = pmtStatus !== 'CANCELLED' && outstandingAfter > 0;
  const paymentTypeLabel = PMT_LABEL[invoice?.paymentType] || 'Payment Receipt';
  const displayInvNumber = invoice?.invoiceNumber || b.bookingNumber;

  // GST breakdown — prefer invoice snapshot, else compute from booking
  const gst         = invoice?.gstBreakdown;
  const isInterState = gst ? gst.isInterstate : !['uttarpradesh','up'].includes(
    (b.userDetails?.state || '').toLowerCase().replace(/\s+/g, '')
  );
  const totalGST    = invoice?.totalGST ?? pricing.totalTax ?? 0;
  const cgst        = gst?.cgst ?? (isInterState ? 0 : totalGST / 2);
  const sgst        = gst?.sgst ?? (isInterState ? 0 : totalGST / 2);
  const igst        = gst?.igst ?? (isInterState ? totalGST : 0);

  const genTime = new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' });
  const ud = b.userDetails || {};

  return (
    <div className="inv-wrap" style={{ background:'#f1f5f9', minHeight:'100vh', padding:'24px 16px', boxSizing:'border-box' }}>
      <style>{PRINT_CSS}</style>

      {/* ── Screen toolbar ──────────────────────────────── */}
      <div className="no-print" style={{ maxWidth:920, margin:'0 auto 20px',
        display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button onClick={() => navigate('/my-bookings')} style={{
          display:'flex', alignItems:'center', gap:6, padding:'8px 18px',
          borderRadius:10, border:'1.5px solid #d1d5db', background:'white',
          fontWeight:600, fontSize:14, cursor:'pointer', color:'#374151',
        }}>
          <ArrowLeft size={15} /> My Bookings
        </button>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:13, color:'#6b7280' }}>Invoice #{displayInvNumber}</span>
        <button onClick={() => window.print()} style={{
          display:'flex', alignItems:'center', gap:6, padding:'8px 22px',
          borderRadius:10, background:'#1B1F3B', color:'white',
          fontWeight:700, fontSize:14, cursor:'pointer', border:'none',
        }}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════
          INVOICE DOCUMENT
      ════════════════════════════════════════════════════ */}
      <div id="zut-inv" style={{
        maxWidth:920, margin:'0 auto', background:'white', borderRadius:16,
        boxShadow:'0 8px 48px rgba(0,0,0,0.12)', overflow:'hidden',
        fontFamily:"'Segoe UI', system-ui, -apple-system, sans-serif",
      }}>

        {/* ── 1. HEADER ──────────────────────────────────── */}
        <div className="inv-block" style={{ background:'#1B1F3B', padding:'18px 34px',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:28, flexWrap:'wrap' }}>

          {/* Left: company */}
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
              {logoUrl ? (
                /* Transparent logo — NO white background box. Alpha channel of
                   the uploaded PNG/JPG/WebP/SVG is preserved on the navy header. */
                <img
                  src={logoUrl}
                  alt={platformName || 'Zutsav'}
                  onError={handleImageError}
                  style={{ height:38, width:'auto', maxWidth:190, objectFit:'contain', display:'block', background:'transparent' }}
                />
              ) : (
                <span style={{ fontFamily:'Georgia, serif', fontSize:20, fontWeight:900,
                  color:'#D4AF37', letterSpacing:0.5 }}>{LEGAL_SUFFIX}</span>
              )}
            </div>
            {/* Registered legal suffix — ALWAYS "PVT. LTD."; brand lives in the logo */}
            <div style={{ color:'#D4AF37', fontWeight:800, fontSize:11.5,
              letterSpacing:2, textTransform:'uppercase', marginBottom:7 }}>{LEGAL_SUFFIX}</div>
            <div style={{ color:'rgba(255,255,255,0.75)', fontSize:11, lineHeight:1.55 }}>
              <div>{CO.addr1}</div>
              <div>{CO.addr2}</div>
              <div style={{ marginTop:4, fontSize:11, color:'rgba(255,255,255,0.55)' }}>
                <span style={{ color:'#D4AF37', fontWeight:700 }}>GSTIN:</span> {CO.gstin}&nbsp;&nbsp;
                <span style={{ color:'#D4AF37', fontWeight:700 }}>PAN:</span> {CO.pan}
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)' }}>
                {CO.email} · {CO.phone} · {CO.web}
              </div>
            </div>
          </div>

          {/* Right: invoice meta */}
          <div style={{ textAlign:'right' }}>
            <div style={{ color:'#D4AF37', fontSize:28, fontWeight:900,
              fontFamily:'Georgia, serif', letterSpacing:3, textTransform:'uppercase' }}>
              Tax Invoice
            </div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:10,
              letterSpacing:1.5, textTransform:'uppercase', marginBottom:8 }}>
              {paymentTypeLabel}
            </div>
            <div style={{ display:'grid', rowGap:3 }}>
              {[
                ['Invoice No',     displayInvNumber],
                ['Order No',       b.bookingNumber],
                ['Issue Date',     fmtShort(invoice?.invoiceDate || b.createdAt)],
                ['Service Date',   fmtLong(b.scheduledDate)],
                ['Place of Supply',(ud.state || ud.city || 'India').toUpperCase()],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', gap:14, justifyContent:'flex-end',
                  fontSize:12, alignItems:'baseline' }}>
                  <span style={{ color:'rgba(255,255,255,0.45)' }}>{k}</span>
                  <span style={{ color:'white', fontWeight:600,
                    minWidth:160, textAlign:'left' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:10 }}>
              <StatusPill status={pmtStatus} />
              {pmtStatus === 'CANCELLED' && (
                <div style={{ marginTop:4, fontSize:11, color:'rgba(255,255,255,0.5)' }}>
                  Payment: {cancelledPaymentNote(b)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 2. BILL TO / SERVICE AT ────────────────────── */}
        <div className="inv-block" style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
          {['BILL TO', 'SERVICE AT'].map((title) => (
            <div key={title} style={{
              padding:'14px 34px',
              borderBottom:'1px solid #e5e7eb',
              borderRight: title === 'BILL TO' ? '1px solid #e5e7eb' : 'none',
            }}>
              <SecLabel>{title}</SecLabel>
              <div style={{ fontSize:15, fontWeight:800, color:'#111827', marginBottom:3 }}>{ud.name || '—'}</div>
              {ud.email && <div style={{ fontSize:12, color:'#6b7280' }}>{ud.email}</div>}
              {ud.phone && <div style={{ fontSize:12, color:'#6b7280' }}>{ud.phone}</div>}
              <div style={{ marginTop:4, fontSize:12, color:'#374151', lineHeight:1.5 }}>
                {[ud.address, ud.city, ud.district !== ud.city ? ud.district : null]
                  .filter(Boolean).join(', ')}
              </div>
              {(ud.state || ud.pincode) && (
                <div style={{ fontSize:12, color:'#374151' }}>
                  {[ud.state, ud.pincode].filter(Boolean).join(' — ')}
                </div>
              )}
              <div style={{ marginTop:3, fontSize:10.5, color:'#9ca3af' }}>GSTIN: Unregistered</div>
            </div>
          ))}
        </div>

        {/* ── 3. BOOKING DETAILS ─────────────────────────── */}
        <div className="inv-block" style={{ background:'#f8f9ff', padding:'13px 34px', borderBottom:'1px solid #e5e7eb' }}>
          <SecLabel>Booking Details</SecLabel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))',
            gap:'8px 20px' }}>
            {[
              { i:'🪔', l:'Service',    v: b.poojaId?.name || '—' },
              { i:'📅', l:'Date',       v: fmtLong(b.scheduledDate) },
              { i:'⏰', l:'Time',       v: b.scheduledTime || '—' },
              { i:'🌐', l:'Language',   v: b.language || 'Hindi' },
              { i:'⚡', l:'Booking Type', v: (b.bookingType === 'urgent' || b.isUrgent) ? 'URGENT' : 'Normal' },
              { i:'📍', l:'Location',   v: [ud.address, ud.city].filter(Boolean).join(', ') || '—' },
              { i:'👤', l:'Pandit',     v: b.panditId?.name || (b.status === 'paid' || b.status === 'pandit_assigned' ? 'Being Assigned' : '—') },
              (b.withKit && selectedKitsOf(b).length > 0)
                ? { i:'🎁', l:'Samagri Kit', v: selectedKitsOf(b).map((k) => k.name || 'Samagri Kit').join(', ') }
                : { i:'📦', l:'Samagri Kit', v: 'Without Samagri' },
              { i:'🆔', l:'Booking ID', v: b.bookingNumber },
            ].map(({ i, l, v }) => (
              <div key={l}>
                <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, letterSpacing:1,
                  textTransform:'uppercase', marginBottom:2 }}>{i} {l}</div>
                <div style={{ fontSize:12.5, color:'#111827', fontWeight:500, lineHeight:1.35 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. ORDER ITEMS TABLE ───────────────────────── */}
        <div className="inv-block" style={{ padding:'12px 34px', borderBottom:'1px solid #e5e7eb' }}>
          <SecLabel>Order Items</SecLabel>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'6%' }} />
              <col style={{ width:'56%' }} />
              <col style={{ width:'8%' }} />
              <col style={{ width:'15%' }} />
              <col style={{ width:'15%' }} />
            </colgroup>
            <thead>
              <tr style={{ background:'#1B1F3B' }}>
                <TH>#</TH>
                <TH>Description</TH>
                <TH right>Qty</TH>
                <TH right>Unit Price</TH>
                <TH right>Amount</TH>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={idx} style={{ borderBottom:'1px solid #f3f4f6',
                  background: idx % 2 === 1 ? '#fafafa' : 'white' }}>
                  <Cell small>{idx + 1}</Cell>
                  <td style={{ padding:'7px 12px', overflow:'hidden' }}>
                    <div style={{ fontWeight:700, color:'#111827', fontSize:12.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.desc}</div>
                    <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.sub}</div>
                  </td>
                  <Cell right>{item.qty}</Cell>
                  <Cell right>{INR(item.rate)}</Cell>
                  <Cell right bold>{INR(item.amt)}</Cell>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:'2px solid #e5e7eb' }}>
                <td colSpan={3} />
                <td style={{ padding:'7px 12px', textAlign:'right',
                  color:'#6b7280', fontWeight:600, fontSize:12 }}>Subtotal</td>
                <td style={{ padding:'7px 12px', textAlign:'right', fontSize:12 }}>{INR(subtotal)}</td>
              </tr>
              {pricing.totalTax > 0 && (
                <tr>
                  <td colSpan={3} />
                  <td style={{ padding:'4px 12px', textAlign:'right',
                    color:'#6b7280', fontWeight:600, fontSize:12 }}>
                    {isInterState ? 'IGST (18%)' : 'GST — CGST 9% + SGST 9%'}
                  </td>
                  <td style={{ padding:'4px 12px', textAlign:'right', fontSize:12 }}>{INR(pricing.totalTax)}</td>
                </tr>
              )}
              <tr style={{ background:'#1B1F3B' }}>
                <td colSpan={3} />
                <td style={{ padding:'10px 12px', textAlign:'right',
                  color:'#D4AF37', fontWeight:900, fontSize:13, letterSpacing:1 }}>
                  GRAND TOTAL
                </td>
                <td style={{ padding:'10px 12px', textAlign:'right',
                  color:'#D4AF37', fontWeight:900, fontSize:17 }}>
                  {INR(pricing.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── 5. PAYMENT DETAILS ─────────────────────────── */}
        <div className="inv-block" style={{ padding:'12px 34px', borderBottom:'1px solid #e5e7eb' }}>
          <SecLabel>Payment Details</SecLabel>

          {/* Amount cards */}
          <div style={{ display:'grid',
            gridTemplateColumns: previouslyPaid > 0
              ? (isPartial ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr')
              : (isPartial ? '1fr 1fr 1fr' : '1fr 1fr'),
            gap:12, marginBottom:12 }}>
            <div style={{ background:'#f0f4ff', borderRadius:12, padding:'11px 16px',
              border:'1.5px solid #c7d2fe' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase',
                letterSpacing:0.8 }}>Order Total</div>
              <div style={{ fontSize:19, fontWeight:900, color:'#1B1F3B' }}>{INR(pricing.grandTotal)}</div>
            </div>
            {previouslyPaid > 0 && (
              <div style={{ background:'#f0f9ff', borderRadius:12, padding:'11px 16px',
                border:'1.5px solid #bae6fd' }}>
                <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase',
                  letterSpacing:0.8 }}>Previously Paid</div>
                <div style={{ fontSize:19, fontWeight:900, color:'#0369a1' }}>{INR(previouslyPaid)}</div>
              </div>
            )}
            <div style={{ background:'#f0fdf4', borderRadius:12, padding:'11px 16px',
              border:'1.5px solid #bbf7d0' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase',
                letterSpacing:0.8 }}>This Invoice</div>
              <div style={{ fontSize:19, fontWeight:900, color:'#15803d' }}>{INR(amtPaid)}</div>
            </div>
            {isPartial && (
              <div style={{ background:'#fff7ed', borderRadius:12, padding:'11px 16px',
                border:'1.5px solid #fed7aa' }}>
                <div style={{ fontSize:10, color:'#6b7280', marginBottom:4, textTransform:'uppercase',
                  letterSpacing:0.8 }}>Balance Due</div>
                <div style={{ fontSize:19, fontWeight:900, color:'#c2410c' }}>{INR(outstandingAfter)}</div>
              </div>
            )}
          </div>

          {/* Payment gateway details */}
          {(invoice?.merchantTransactionId || b.phonePeMerchantTransactionId || b.phonePeTransactionId) && (
            <div style={{ padding:'10px 16px', background:'#f8f9ff', borderRadius:10,
              border:'1px solid #e0e7ff',
              display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))',
              gap:'6px 24px' }}>
              {[
                { k:'Payment Type',    v: paymentTypeLabel },
                { k:'Payment Gateway', v: (invoice?.paymentGateway || 'PhonePe').toUpperCase() },
                { k:'Merchant Txn ID', v: invoice?.merchantTransactionId || b.phonePeMerchantTransactionId },
                (invoice?.gatewayTransactionId || b.phonePeTransactionId)
                  ? { k:'Gateway Txn ID', v: invoice?.gatewayTransactionId || b.phonePeTransactionId }
                  : null,
                { k:'Payment Method',  v:'UPI / PhonePe' },
              ].filter(Boolean).map(({ k, v }) => (
                <div key={k}>
                  <div style={{ fontSize:9, color:'#9ca3af', letterSpacing:0.8,
                    textTransform:'uppercase', marginBottom:2 }}>{k}</div>
                  <div style={{ fontSize:12, color:'#1B1F3B', fontWeight:600, wordBreak:'break-all' }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 6. PAYMENT HISTORY ─────────────────────────── */}
        {invoices.length > 1 && (
          <div className="inv-block" style={{ padding:'12px 34px', borderBottom:'1px solid #e5e7eb' }}>
            <SecLabel>Payment History for Order {b.bookingNumber}</SecLabel>
            <div style={{ position:'relative', paddingLeft:26 }}>
              <div style={{ position:'absolute', left:8, top:6, bottom:6,
                width:2, background:'#e5e7eb' }} />
              {invoices.map((e, i) => (
                <div key={e._id || i} style={{ position:'relative',
                  marginBottom: i < invoices.length - 1 ? 10 : 0 }}>
                  <div style={{ position:'absolute', left:-26, top:3,
                    width:14, height:14, borderRadius:'50%',
                    background: e.status === 'cancelled' ? '#b91c1c' : '#15803d',
                    border:'2px solid white', boxShadow:'0 0 0 2px #bbf7d0' }} />
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>
                        {PMT_LABEL[e.paymentType] || 'Payment'}
                        {e.status !== 'active' && (
                          <span style={{ marginLeft:8, fontSize:10, color:'#b91c1c',
                            background:'#fee2e2', padding:'1px 7px', borderRadius:6 }}>
                            {e.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:'#9ca3af', marginTop:1 }}>
                        {e.invoiceNumber} · Txn: {e.merchantTransactionId}
                      </div>
                      {e.invoiceDate && (
                        <div style={{ fontSize:11, color:'#9ca3af' }}>{fmtShort(e.invoiceDate)}</div>
                      )}
                    </div>
                    <div style={{ fontWeight:900, fontSize:16, color:'#15803d' }}>{INR(e.amountPaid)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 7. TAX SUMMARY ─────────────────────────────── */}
        {totalGST > 0 && (
          <div className="inv-block" style={{ padding:'12px 34px', borderBottom:'1px solid #e5e7eb' }}>
            <SecLabel>Tax Summary</SecLabel>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#4c1d95' }}>
                  <th style={{ padding:'7px 12px', textAlign:'left', color:'white',
                    fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                    Item Description
                  </th>
                  <th style={{ padding:'7px 12px', textAlign:'right', color:'white',
                    fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                    Taxable Amount
                  </th>
                  <th style={{ padding:'7px 12px', textAlign:'right', color:'white',
                    fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                    Rate
                  </th>
                  {isInterState ? (
                    <th style={{ padding:'7px 12px', textAlign:'right', color:'white',
                      fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                      IGST
                    </th>
                  ) : (
                    <>
                      <th style={{ padding:'7px 12px', textAlign:'right', color:'white',
                        fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                        CGST (9%)
                      </th>
                      <th style={{ padding:'7px 12px', textAlign:'right', color:'white',
                        fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                        SGST (9%)
                      </th>
                    </>
                  )}
                  <th style={{ padding:'7px 12px', textAlign:'right', color:'white',
                    fontWeight:700, fontSize:10, letterSpacing:1, textTransform:'uppercase' }}>
                    Total Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {pricing.platformFee > 0 && pricing.platformGST > 0 && (
                  <tr style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'7px 12px' }}>Platform Convenience Fee Tax</td>
                    <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.platformFee)}</td>
                    <td style={{ padding:'7px 12px', textAlign:'right' }}>18%</td>
                    {isInterState ? (
                      <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.platformGST)}</td>
                    ) : (
                      <>
                        <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.platformGST / 2)}</td>
                        <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.platformGST / 2)}</td>
                      </>
                    )}
                    <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700 }}>{INR(pricing.platformGST)}</td>
                  </tr>
                )}
                {pricing.kitGST > 0 && (
                  <tr style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'7px 12px' }}>{selectedKitsOf(b).map((k) => k.name || 'Samagri Kit').join(', ')} — GST</td>
                    <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.kitAmount)}</td>
                    <td style={{ padding:'7px 12px', textAlign:'right' }}>18%</td>
                    {isInterState ? (
                      <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.kitGST)}</td>
                    ) : (
                      <>
                        <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.kitGST / 2)}</td>
                        <td style={{ padding:'7px 12px', textAlign:'right' }}>{INR(pricing.kitGST / 2)}</td>
                      </>
                    )}
                    <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700 }}>{INR(pricing.kitGST)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background:'#4c1d95' }}>
                  <td style={{ padding:'8px 12px', color:'white', fontWeight:800 }}>Total Tax Collected</td>
                  <td />
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'rgba(255,255,255,0.7)',
                    fontWeight:700 }}>GST</td>
                  {isInterState ? (
                    <td style={{ padding:'8px 12px', textAlign:'right', color:'white', fontWeight:800 }}>
                      {INR(igst)}
                    </td>
                  ) : (
                    <>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'white', fontWeight:800 }}>
                        {INR(cgst)}
                      </td>
                      <td style={{ padding:'8px 12px', textAlign:'right', color:'white', fontWeight:800 }}>
                        {INR(sgst)}
                      </td>
                    </>
                  )}
                  <td style={{ padding:'8px 12px', textAlign:'right', color:'#c4b5fd',
                    fontWeight:900, fontSize:14 }}>
                    {INR(totalGST)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── 8. AMOUNT IN WORDS + STATUS ────────────────── */}
        <div className="inv-block" style={{ padding:'11px 34px', background:'#f8f9ff',
          borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          flexWrap:'wrap', gap:12 }}>
          <div>
            <SecLabel>Amount in Words</SecLabel>
            <div style={{ fontStyle:'italic', color:'#374151', fontSize:13,
              fontWeight:600, maxWidth:520, lineHeight:1.45 }}>
              {amtWords(amtPaid)}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'#9ca3af', marginBottom:5,
              textTransform:'uppercase', letterSpacing:0.8 }}>Payment Status</div>
            <StatusPill status={pmtStatus} />
            {pmtStatus === 'CANCELLED' && (
              <div style={{ marginTop:5, fontSize:11, color:'#9ca3af' }}>
                Payment: {cancelledPaymentNote(b)}
              </div>
            )}
          </div>
        </div>

        {/* ── 9. FOOTER ──────────────────────────────────── */}
        <div className="inv-block" style={{ background:'#1B1F3B', padding:'16px 34px' }}>
          <div style={{ textAlign:'center', marginBottom:10 }}>
            <div style={{ color:'#D4AF37', fontWeight:800, fontSize:14.5,
              fontFamily:'Georgia, serif', marginBottom:4 }}>
              🙏 Thank you for choosing Zutsav!
            </div>
            <div style={{ color:'rgba(255,255,255,0.65)', fontSize:12 }}>
              May your prayers be answered with divine grace.
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:28,
            marginBottom:10, flexWrap:'wrap' }}>
            {[['Support', CO.email], ['WhatsApp', CO.phone], ['Website', CO.web]].map(([k, v]) => (
              <div key={k} style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)',
                  textTransform:'uppercase', letterSpacing:1, marginBottom:1 }}>{k}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.12)',
            paddingTop:10, display:'flex', justifyContent:'space-between',
            flexWrap:'wrap', gap:6 }}>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:10 }}>
              This is a computer-generated invoice · Valid for Input Tax Credit (ITC) where applicable
            </span>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:10 }}>
              Generated: {genTime}
            </span>
          </div>
        </div>

      </div>
      {/* end invoice document */}
    </div>
  );
}
