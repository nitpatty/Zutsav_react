import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import API from '../api/axios';
import ZutsavLoader from '../components/shared/ZutsavLoader';

/* ─────────────────────────────────────────────────────────
   Company constants — matches legal registration
──────────────────────────────────────────────────────────── */
const CO = {
  name:   'Zutsav Enterprises',
  gstin:  '09AAAFZ1234Z1Z5',
  pan:    'AAAFZ1234Z',
  addr1:  'E-012, Assotech The Nest, Crossing Republik',
  addr2:  'Ghaziabad, Uttar Pradesh - 201016',
  email:  'info@zutsav.com',
  phone:  '+91-8851576605',
  web:    'www.zutsav.com',
  state:  'Uttar Pradesh',
};

/* ─────────────────────────────────────────────────────────
   Formatters
──────────────────────────────────────────────────────────── */
const INR = (n) =>
  `₹${(+(n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    totalTax:     b.gstAmount || 0,
    grandTotal:   b.amount || 0,
  };
}

/* ─────────────────────────────────────────────────────────
   Effective payment status (handles backward-compat)
──────────────────────────────────────────────────────────── */
function resolvePaymentStatus(b) {
  if (b.paymentStatus === 'FULLY_PAID')    return 'FULLY_PAID';
  if (b.paymentStatus === 'PARTIALLY_PAID') return 'PARTIALLY_PAID';
  if (b.paymentStatus === 'REFUNDED')      return 'REFUNDED';
  if (b.paymentStatus === 'FAILED')        return 'FAILED';
  const ACTIVE = ['paid','pandit_assigned','pandit_accepted','pending_reassignment','completion_requested','completed'];
  if (ACTIVE.includes(b.status)) return 'FULLY_PAID';
  return 'PENDING';
}

/* ─────────────────────────────────────────────────────────
   Print-safe CSS
──────────────────────────────────────────────────────────── */
const PRINT_CSS = `
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background: white !important; margin: 0 !important; }
    .no-print { display: none !important; }
    .inv-wrap  { background: white !important; padding: 0 !important; min-height: auto !important; }
    #zut-inv   { box-shadow: none !important; border-radius: 0 !important;
                 max-width: none !important; margin: 0 !important; }
    @page { margin: 10mm; size: A4; }
  }
`;

/* ─────────────────────────────────────────────────────────
   Micro-components
──────────────────────────────────────────────────────────── */
const STATUS_CFG = {
  FULLY_PAID:    { label: 'Paid in Full',     bg:'#dcfce7', color:'#15803d', border:'#86efac' },
  PARTIALLY_PAID:{ label: 'Partially Paid',   bg:'#ffedd5', color:'#c2410c', border:'#fed7aa' },
  PENDING:       { label: 'Payment Pending',  bg:'#fef3c7', color:'#b45309', border:'#fde68a' },
  REFUNDED:      { label: 'Refunded',         bg:'#f3f4f6', color:'#374151', border:'#d1d5db' },
  FAILED:        { label: 'Payment Failed',   bg:'#fee2e2', color:'#b91c1c', border:'#fca5a5' },
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
      padding:'11px 14px',
      textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 700 : 400,
      fontSize: small ? 12 : 14,
      color: gold ? '#D4AF37' : bold ? '#111827' : '#374151',
    }}>
      {children}
    </td>
  );
}

function TH({ children, right }) {
  return (
    <th style={{
      padding:'11px 14px', textAlign: right ? 'right' : 'left',
      fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase',
      color:'white',
    }}>
      {children}
    </th>
  );
}

/* ─────────────────────────────────────────────────────────
   Line-items builder
──────────────────────────────────────────────────────────── */
function buildLineItems(b, pricing) {
  const items = [];
  if (pricing.poojaAmount > 0) {
    items.push({
      desc: b.poojaId?.name || 'Pooja Service',
      sub: [
        'Spiritual ceremony service',
        b.language && `Language: ${b.language}`,
        (b.bookingType === 'urgent' || b.isUrgent) && '⚡ Urgent Booking',
        (!b.withKit || !b.kitId) && 'Kit: Without Samagri',
      ].filter(Boolean).join(' · '),
      qty: 1,
      rate: pricing.poojaAmount,
      amt:  pricing.poojaAmount,
    });
  }
  if (b.withKit && b.kitId && pricing.kitAmount > 0) {
    items.push({
      desc: b.kitId.name || 'Samagri Kit',
      sub:  'Pooja samagri kit',
      qty:  1,
      rate: pricing.kitAmount,
      amt:  pricing.kitAmount,
    });
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

  const pricing   = resolvePricing(invoice || b);
  const pmtStatus = resolvePaymentStatus(b);
  const lineItems = buildLineItems(b, pricing);
  const subtotal  = lineItems.reduce((s, i) => s + i.amt, 0);

  // Prefer invoice fields; fall back to booking fields for legacy data
  const amtPaid         = invoice?.amountPaid      ?? b.amountPaid  ?? (pmtStatus === 'FULLY_PAID' ? pricing.grandTotal : 0);
  const previouslyPaid  = invoice?.previouslyPaid  ?? 0;
  const outstandingAfter = invoice?.outstandingAfter ?? b.remainingAmount ?? 0;
  const isPartial       = outstandingAfter > 0;
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
        <div style={{ background:'#1B1F3B', padding:'36px 44px',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:32, flexWrap:'wrap' }}>

          {/* Left: company */}
          <div>
            <div style={{ marginBottom:18 }}>
              <span style={{ fontFamily:'Georgia, serif', fontSize:30, fontWeight:900,
                color:'#D4AF37', letterSpacing:-1 }}>Zu</span>
              <span style={{ fontFamily:'Georgia, serif', fontSize:30, fontWeight:900,
                color:'#FF7043', letterSpacing:-1 }}>ts</span>
              <span style={{ fontFamily:'Georgia, serif', fontSize:30, fontWeight:900,
                color:'#D4AF37', letterSpacing:-1 }}>av</span>
              <span style={{ color:'rgba(255,255,255,0.35)', fontSize:11, marginLeft:10,
                letterSpacing:3, textTransform:'uppercase', verticalAlign:'middle' }}>
                Enterprises
              </span>
            </div>
            <div style={{ color:'rgba(255,255,255,0.8)', fontSize:13, lineHeight:1.8 }}>
              <div>{CO.addr1}</div>
              <div>{CO.addr2}</div>
              <div style={{ marginTop:6, fontSize:12, color:'rgba(255,255,255,0.55)' }}>
                <span style={{ color:'#D4AF37', fontWeight:700 }}>GSTIN:</span> {CO.gstin}&nbsp;&nbsp;
                <span style={{ color:'#D4AF37', fontWeight:700 }}>PAN:</span> {CO.pan}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>
                {CO.email} · {CO.phone} · {CO.web}
              </div>
            </div>
          </div>

          {/* Right: invoice meta */}
          <div style={{ textAlign:'right' }}>
            <div style={{ color:'#D4AF37', fontSize:34, fontWeight:900,
              fontFamily:'Georgia, serif', letterSpacing:3, textTransform:'uppercase' }}>
              Tax Invoice
            </div>
            <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11,
              letterSpacing:1.5, textTransform:'uppercase', marginBottom:12 }}>
              {paymentTypeLabel}
            </div>
            <div style={{ display:'grid', rowGap:5 }}>
              {[
                ['Invoice No',     displayInvNumber],
                ['Order No',       b.bookingNumber],
                ['Issue Date',     fmtShort(invoice?.invoiceDate || b.createdAt)],
                ['Service Date',   fmtLong(b.scheduledDate)],
                ['Place of Supply',(ud.state || ud.city || 'India').toUpperCase()],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', gap:16, justifyContent:'flex-end',
                  fontSize:13, alignItems:'baseline' }}>
                  <span style={{ color:'rgba(255,255,255,0.45)' }}>{k}</span>
                  <span style={{ color:'white', fontWeight:600,
                    minWidth:170, textAlign:'left' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:18 }}>
              <StatusPill status={pmtStatus} />
            </div>
          </div>
        </div>

        {/* ── 2. BILL TO / SERVICE AT ────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
          {['BILL TO', 'SERVICE AT'].map((title) => (
            <div key={title} style={{
              padding:'22px 44px',
              borderBottom:'1px solid #e5e7eb',
              borderRight: title === 'BILL TO' ? '1px solid #e5e7eb' : 'none',
            }}>
              <SecLabel>{title}</SecLabel>
              <div style={{ fontSize:16, fontWeight:800, color:'#111827', marginBottom:4 }}>{ud.name || '—'}</div>
              {ud.email && <div style={{ fontSize:13, color:'#6b7280' }}>{ud.email}</div>}
              {ud.phone && <div style={{ fontSize:13, color:'#6b7280' }}>{ud.phone}</div>}
              <div style={{ marginTop:6, fontSize:13, color:'#374151', lineHeight:1.6 }}>
                {[ud.address, ud.city, ud.district !== ud.city ? ud.district : null]
                  .filter(Boolean).join(', ')}
              </div>
              {(ud.state || ud.pincode) && (
                <div style={{ fontSize:13, color:'#374151' }}>
                  {[ud.state, ud.pincode].filter(Boolean).join(' — ')}
                </div>
              )}
              <div style={{ marginTop:4, fontSize:11, color:'#9ca3af' }}>GSTIN: Unregistered</div>
            </div>
          ))}
        </div>

        {/* ── 3. BOOKING DETAILS ─────────────────────────── */}
        <div style={{ background:'#f8f9ff', padding:'22px 44px', borderBottom:'1px solid #e5e7eb' }}>
          <SecLabel>Booking Details</SecLabel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
            gap:'14px 36px' }}>
            {[
              { i:'🪔', l:'Service',    v: b.poojaId?.name || '—' },
              { i:'📅', l:'Date',       v: fmtLong(b.scheduledDate) },
              { i:'⏰', l:'Time',       v: b.scheduledTime || '—' },
              { i:'🌐', l:'Language',   v: b.language || 'Hindi' },
              { i:'⚡', l:'Booking Type', v: (b.bookingType === 'urgent' || b.isUrgent) ? 'URGENT' : 'Normal' },
              { i:'📍', l:'Location',   v: [ud.address, ud.city].filter(Boolean).join(', ') || '—' },
              { i:'👤', l:'Pandit',     v: b.panditId?.name || (b.status === 'paid' || b.status === 'pandit_assigned' ? 'Being Assigned' : '—') },
              (b.withKit && b.kitId) ? { i:'🎁', l:'Samagri Kit', v: b.kitId.name } : { i:'📦', l:'Samagri Kit', v: 'Without Samagri' },
              { i:'🆔', l:'Booking ID', v: b.bookingNumber },
            ].map(({ i, l, v }) => (
              <div key={l}>
                <div style={{ fontSize:10, color:'#9ca3af', fontWeight:700, letterSpacing:1,
                  textTransform:'uppercase', marginBottom:3 }}>{i} {l}</div>
                <div style={{ fontSize:14, color:'#111827', fontWeight:500, lineHeight:1.4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. ORDER ITEMS TABLE ───────────────────────── */}
        <div style={{ padding:'22px 44px', borderBottom:'1px solid #e5e7eb' }}>
          <SecLabel>Order Items</SecLabel>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:14 }}>
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
                  <td style={{ padding:'13px 14px' }}>
                    <div style={{ fontWeight:700, color:'#111827', fontSize:14 }}>{item.desc}</div>
                    <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>{item.sub}</div>
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
                <td style={{ padding:'10px 14px', textAlign:'right',
                  color:'#6b7280', fontWeight:600, fontSize:13 }}>Subtotal</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontSize:13 }}>{INR(subtotal)}</td>
              </tr>
              {pricing.totalTax > 0 && (
                <tr>
                  <td colSpan={3} />
                  <td style={{ padding:'6px 14px', textAlign:'right',
                    color:'#6b7280', fontWeight:600, fontSize:13 }}>
                    {isInterState ? 'IGST (18%)' : 'GST — CGST 9% + SGST 9%'}
                  </td>
                  <td style={{ padding:'6px 14px', textAlign:'right', fontSize:13 }}>{INR(pricing.totalTax)}</td>
                </tr>
              )}
              <tr style={{ background:'#1B1F3B' }}>
                <td colSpan={3} />
                <td style={{ padding:'15px 14px', textAlign:'right',
                  color:'#D4AF37', fontWeight:900, fontSize:15, letterSpacing:1 }}>
                  GRAND TOTAL
                </td>
                <td style={{ padding:'15px 14px', textAlign:'right',
                  color:'#D4AF37', fontWeight:900, fontSize:20 }}>
                  {INR(pricing.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── 5. PAYMENT DETAILS ─────────────────────────── */}
        <div style={{ padding:'22px 44px', borderBottom:'1px solid #e5e7eb' }}>
          <SecLabel>Payment Details</SecLabel>

          {/* Amount cards */}
          <div style={{ display:'grid',
            gridTemplateColumns: previouslyPaid > 0
              ? (isPartial ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr')
              : (isPartial ? '1fr 1fr 1fr' : '1fr 1fr'),
            gap:16, marginBottom:20 }}>
            <div style={{ background:'#f0f4ff', borderRadius:14, padding:'16px 20px',
              border:'1.5px solid #c7d2fe' }}>
              <div style={{ fontSize:11, color:'#6b7280', marginBottom:6, textTransform:'uppercase',
                letterSpacing:0.8 }}>Order Total</div>
              <div style={{ fontSize:24, fontWeight:900, color:'#1B1F3B' }}>{INR(pricing.grandTotal)}</div>
            </div>
            {previouslyPaid > 0 && (
              <div style={{ background:'#f0f9ff', borderRadius:14, padding:'16px 20px',
                border:'1.5px solid #bae6fd' }}>
                <div style={{ fontSize:11, color:'#6b7280', marginBottom:6, textTransform:'uppercase',
                  letterSpacing:0.8 }}>Previously Paid</div>
                <div style={{ fontSize:24, fontWeight:900, color:'#0369a1' }}>{INR(previouslyPaid)}</div>
              </div>
            )}
            <div style={{ background:'#f0fdf4', borderRadius:14, padding:'16px 20px',
              border:'1.5px solid #bbf7d0' }}>
              <div style={{ fontSize:11, color:'#6b7280', marginBottom:6, textTransform:'uppercase',
                letterSpacing:0.8 }}>This Invoice</div>
              <div style={{ fontSize:24, fontWeight:900, color:'#15803d' }}>{INR(amtPaid)}</div>
            </div>
            {isPartial && (
              <div style={{ background:'#fff7ed', borderRadius:14, padding:'16px 20px',
                border:'1.5px solid #fed7aa' }}>
                <div style={{ fontSize:11, color:'#6b7280', marginBottom:6, textTransform:'uppercase',
                  letterSpacing:0.8 }}>Balance Due</div>
                <div style={{ fontSize:24, fontWeight:900, color:'#c2410c' }}>{INR(outstandingAfter)}</div>
              </div>
            )}
          </div>

          {/* Payment gateway details */}
          {(invoice?.merchantTransactionId || b.phonePeMerchantTransactionId || b.phonePeTransactionId) && (
            <div style={{ padding:'16px 20px', background:'#f8f9ff', borderRadius:12,
              border:'1px solid #e0e7ff',
              display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
              gap:'10px 28px' }}>
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
                  <div style={{ fontSize:10, color:'#9ca3af', letterSpacing:0.8,
                    textTransform:'uppercase', marginBottom:3 }}>{k}</div>
                  <div style={{ fontSize:13, color:'#1B1F3B', fontWeight:600, wordBreak:'break-all' }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 6. PAYMENT HISTORY ─────────────────────────── */}
        {invoices.length > 1 && (
          <div style={{ padding:'22px 44px', borderBottom:'1px solid #e5e7eb' }}>
            <SecLabel>Payment History for Order {b.bookingNumber}</SecLabel>
            <div style={{ position:'relative', paddingLeft:28 }}>
              <div style={{ position:'absolute', left:8, top:6, bottom:6,
                width:2, background:'#e5e7eb' }} />
              {invoices.map((e, i) => (
                <div key={e._id || i} style={{ position:'relative',
                  marginBottom: i < invoices.length - 1 ? 20 : 0 }}>
                  <div style={{ position:'absolute', left:-28, top:4,
                    width:16, height:16, borderRadius:'50%',
                    background: e.status === 'cancelled' ? '#b91c1c' : '#15803d',
                    border:'2px solid white', boxShadow:'0 0 0 2px #bbf7d0' }} />
                  <div style={{ display:'flex', justifyContent:'space-between',
                    alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>
                        {PMT_LABEL[e.paymentType] || 'Payment'}
                        {e.status !== 'active' && (
                          <span style={{ marginLeft:8, fontSize:11, color:'#b91c1c',
                            background:'#fee2e2', padding:'2px 8px', borderRadius:6 }}>
                            {e.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>
                        {e.invoiceNumber} · Txn: {e.merchantTransactionId}
                      </div>
                      {e.invoiceDate && (
                        <div style={{ fontSize:12, color:'#9ca3af' }}>{fmtShort(e.invoiceDate)}</div>
                      )}
                    </div>
                    <div style={{ fontWeight:900, fontSize:18, color:'#15803d' }}>{INR(e.amountPaid)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 7. TAX SUMMARY ─────────────────────────────── */}
        {totalGST > 0 && (
          <div style={{ padding:'22px 44px', borderBottom:'1px solid #e5e7eb' }}>
            <SecLabel>Tax Summary</SecLabel>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#4c1d95' }}>
                  <th style={{ padding:'10px 14px', textAlign:'left', color:'white',
                    fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                    Item Description
                  </th>
                  <th style={{ padding:'10px 14px', textAlign:'right', color:'white',
                    fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                    Taxable Amount
                  </th>
                  <th style={{ padding:'10px 14px', textAlign:'right', color:'white',
                    fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                    Rate
                  </th>
                  {isInterState ? (
                    <th style={{ padding:'10px 14px', textAlign:'right', color:'white',
                      fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                      IGST
                    </th>
                  ) : (
                    <>
                      <th style={{ padding:'10px 14px', textAlign:'right', color:'white',
                        fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                        CGST (9%)
                      </th>
                      <th style={{ padding:'10px 14px', textAlign:'right', color:'white',
                        fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                        SGST (9%)
                      </th>
                    </>
                  )}
                  <th style={{ padding:'10px 14px', textAlign:'right', color:'white',
                    fontWeight:700, fontSize:11, letterSpacing:1, textTransform:'uppercase' }}>
                    Total Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {pricing.platformFee > 0 && pricing.platformGST > 0 && (
                  <tr style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'11px 14px' }}>Platform Convenience Fee Tax</td>
                    <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.platformFee)}</td>
                    <td style={{ padding:'11px 14px', textAlign:'right' }}>18%</td>
                    {isInterState ? (
                      <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.platformGST)}</td>
                    ) : (
                      <>
                        <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.platformGST / 2)}</td>
                        <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.platformGST / 2)}</td>
                      </>
                    )}
                    <td style={{ padding:'11px 14px', textAlign:'right', fontWeight:700 }}>{INR(pricing.platformGST)}</td>
                  </tr>
                )}
                {pricing.kitGST > 0 && (
                  <tr style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'11px 14px' }}>{b.kitId?.name || 'Samagri Kit'} — GST</td>
                    <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.kitAmount)}</td>
                    <td style={{ padding:'11px 14px', textAlign:'right' }}>18%</td>
                    {isInterState ? (
                      <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.kitGST)}</td>
                    ) : (
                      <>
                        <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.kitGST / 2)}</td>
                        <td style={{ padding:'11px 14px', textAlign:'right' }}>{INR(pricing.kitGST / 2)}</td>
                      </>
                    )}
                    <td style={{ padding:'11px 14px', textAlign:'right', fontWeight:700 }}>{INR(pricing.kitGST)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr style={{ background:'#4c1d95' }}>
                  <td style={{ padding:'11px 14px', color:'white', fontWeight:800 }}>Total Tax Collected</td>
                  <td />
                  <td style={{ padding:'11px 14px', textAlign:'right', color:'rgba(255,255,255,0.7)',
                    fontWeight:700 }}>GST</td>
                  {isInterState ? (
                    <td style={{ padding:'11px 14px', textAlign:'right', color:'white', fontWeight:800 }}>
                      {INR(igst)}
                    </td>
                  ) : (
                    <>
                      <td style={{ padding:'11px 14px', textAlign:'right', color:'white', fontWeight:800 }}>
                        {INR(cgst)}
                      </td>
                      <td style={{ padding:'11px 14px', textAlign:'right', color:'white', fontWeight:800 }}>
                        {INR(sgst)}
                      </td>
                    </>
                  )}
                  <td style={{ padding:'11px 14px', textAlign:'right', color:'#c4b5fd',
                    fontWeight:900, fontSize:16 }}>
                    {INR(totalGST)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── 8. AMOUNT IN WORDS + STATUS ────────────────── */}
        <div style={{ padding:'20px 44px', background:'#f8f9ff',
          borderBottom:'1px solid #e5e7eb',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          flexWrap:'wrap', gap:16 }}>
          <div>
            <SecLabel>Amount in Words</SecLabel>
            <div style={{ fontStyle:'italic', color:'#374151', fontSize:14,
              fontWeight:600, maxWidth:520, lineHeight:1.5 }}>
              {amtWords(amtPaid)}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'#9ca3af', marginBottom:6,
              textTransform:'uppercase', letterSpacing:0.8 }}>Payment Status</div>
            <StatusPill status={pmtStatus} />
          </div>
        </div>

        {/* ── 9. FOOTER ──────────────────────────────────── */}
        <div style={{ background:'#1B1F3B', padding:'28px 44px' }}>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ color:'#D4AF37', fontWeight:800, fontSize:16,
              fontFamily:'Georgia, serif', marginBottom:6 }}>
              🙏 Thank you for choosing Zutsav!
            </div>
            <div style={{ color:'rgba(255,255,255,0.65)', fontSize:13 }}>
              May your prayers be answered with divine grace.
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:32,
            marginBottom:16, flexWrap:'wrap' }}>
            {[['Support', CO.email], ['WhatsApp', CO.phone], ['Website', CO.web]].map(([k, v]) => (
              <div key={k} style={{ textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)',
                  textTransform:'uppercase', letterSpacing:1, marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:600 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.12)',
            paddingTop:14, display:'flex', justifyContent:'space-between',
            flexWrap:'wrap', gap:8 }}>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:11 }}>
              This is a computer-generated invoice · Valid for Input Tax Credit (ITC) where applicable
            </span>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:11 }}>
              Generated: {genTime}
            </span>
          </div>
        </div>

      </div>
      {/* end invoice document */}
    </div>
  );
}
