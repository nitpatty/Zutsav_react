import React from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { amtWords } from '../../utils/numberToWords';

const INR = (n) =>
  `₹${(+(n ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PMT_LABEL = { PARTIAL: 'Part Payment', REMAINING: 'Balance Due', FULL: 'Paid in Full' };

const PRINT_CSS = `
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { background: white !important; margin: 0 !important; }
    .no-print { display: none !important; }
    .inv-wrap  { background: white !important; padding: 0 !important; min-height: auto !important; }
    #zut-inv   { box-shadow: none !important; border-radius: 0 !important;
                 max-width: none !important; width: 100% !important; margin: 0 !important; }
    .inv-block { page-break-inside: avoid; break-inside: avoid; }
    @page { size: A4 portrait; margin: 8mm; }
  }
`;

const STATUS_CFG = {
  active:    { label: 'Active',    bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  cancelled: { label: 'Cancelled', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
  archived:  { label: 'Archived',  bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' },
};

function SecLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
      textTransform: 'uppercase', color: '#9ca3af', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function TH({ children, right }) {
  return (
    <th style={{
      padding: '8px 10px', textAlign: right ? 'right' : 'left',
      fontWeight: 700, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: 'white',
    }}>{children}</th>
  );
}

function Cell({ children, right, bold, small }) {
  return (
    <td style={{
      padding: '7px 10px',
      textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 700 : 400,
      fontSize: small ? 11.5 : 12.5,
      color: bold ? '#111827' : '#374151',
    }}>{children}</td>
  );
}

// `publicView`: customer-facing, token-shared rendering — no admin navigation,
// no internal seller-identity notice and no payment references / operator names.
export default function ManualInvoiceView({
  invoice, payments = [], paymentSummary, logoUrl, platformName, navigate, publicView = false,
}) {
  const seller = invoice.sellerSnapshot || {};
  const status = STATUS_CFG[invoice.status] || STATUS_CFG.active;
  const gst = invoice.gstBreakdown || {};
  const isInterstate = Boolean(gst.isInterstate);
  const lines = invoice.lineItems || [];
  // Invoices issued before the "Apply tax" option (taxApplied unset) were always taxed.
  const taxApplied = invoice.taxApplied !== false;
  // 'manual_bill_rate': ONE percentage typed by the issuer, applied to the taxable
  // value. It is shown as a single bill-level row; per-line tax columns are hidden
  // because per-line figures are only an apportionment, not per-item statutory rates.
  const isManualRate = invoice.taxMode === 'manual_bill_rate';
  const showLineTax = taxApplied && !isManualRate;
  const COLS = showLineTax ? 8 : 6; // table width in columns (label spans COLS - 1)

  const grossTotal    = lines.reduce((s, l) => s + (l.unitPrice || 0) * (l.quantity || 0), 0);
  const discountTotal = lines.reduce((s, l) => s + (l.discount || 0), 0);
  const taxableValue  = lines.reduce((s, l) => s + Math.max(0, (l.unitPrice || 0) * (l.quantity || 0) - (l.discount || 0)), 0);
  const totalTax      = invoice.totalGST || lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
  const netPaid       = paymentSummary?.netReceived ?? invoice.amountPaid ?? 0;
  const outstanding   = paymentSummary?.outstanding
    ?? Math.max(0, Math.round(((invoice.grandTotal || 0) - netPaid) * 100) / 100);

  const paymentLabel = invoice.status === 'cancelled'
    ? 'Cancelled'
    : outstanding === 0 && netPaid > 0
      ? 'Paid in Full'
      : netPaid > 0 ? 'Partially Paid' : 'Payment Pending';

  const genTime = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="inv-wrap" style={{ background: '#f1f5f9', minHeight: '100vh', padding: '24px 16px', boxSizing: 'border-box' }}>
      <style>{PRINT_CSS}</style>

      <div className="no-print" style={{ maxWidth: 920, margin: '0 auto 20px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {!publicView && (
          <button onClick={() => navigate('/admin?tab=manual-billing')} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
            borderRadius: 10, border: '1.5px solid #d1d5db', background: 'white',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', color: '#374151',
          }}>
            <ArrowLeft size={15} /> Manual Billing
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#6b7280' }}>Invoice #{invoice.invoiceNumber}</span>
        <button onClick={() => window.print()} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px',
          borderRadius: 10, background: '#1B1F3B', color: 'white',
          fontWeight: 700, fontSize: 14, cursor: 'pointer', border: 'none',
        }}>
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      <div id="zut-inv" style={{
        maxWidth: 920, margin: '0 auto', background: 'white', borderRadius: 16,
        boxShadow: '0 8px 48px rgba(0,0,0,0.12)', overflow: 'hidden',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}>
        {/* Header */}
        <div className="inv-block" style={{ background: '#1B1F3B', padding: '18px 34px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              {logoUrl ? (
                <img src={logoUrl} alt={platformName || seller.legalName || 'Seller'}
                  style={{ height: 38, width: 'auto', maxWidth: 190, objectFit: 'contain', display: 'block', background: 'transparent' }} />
              ) : (
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 900,
                  color: '#D4AF37', letterSpacing: 0.5 }}>{seller.legalName || platformName || 'Seller'}</span>
              )}
            </div>
            <div style={{ color: '#D4AF37', fontWeight: 800, fontSize: 11.5,
              letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 7 }}>
              {seller.legalName || '—'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 1.55 }}>
              <div>{seller.address || '—'}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                <span style={{ color: '#D4AF37', fontWeight: 700 }}>GSTIN:</span> {seller.gstin || '—'}&nbsp;&nbsp;
                {seller.pan && <><span style={{ color: '#D4AF37', fontWeight: 700 }}>PAN:</span> {seller.pan}</>}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                Place of business: {[seller.state, seller.stateCode && `(${seller.stateCode})`].filter(Boolean).join(' ') || '—'}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#D4AF37', fontSize: 28, fontWeight: 900,
              fontFamily: 'Georgia, serif', letterSpacing: 3, textTransform: 'uppercase' }}>
              {taxApplied ? 'Tax Invoice' : 'Invoice'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10,
              letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              {PMT_LABEL[invoice.paymentType] || 'Offline Sale'} · {paymentLabel}
            </div>
            <div style={{ display: 'grid', rowGap: 3 }}>
              {[
                ['Invoice No', invoice.invoiceNumber],
                ['Issue Date', fmtDate(invoice.invoiceDate)],
                ['Place of Supply', (invoice.customerState || '—').toUpperCase()],
                ['Source', 'MANUAL / OFFLINE'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 14, justifyContent: 'flex-end',
                  fontSize: 12, alignItems: 'baseline' }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}>{k}</span>
                  <span style={{ color: 'white', fontWeight: 600, minWidth: 160, textAlign: 'left' }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={{
                display: 'inline-block', padding: '5px 18px', borderRadius: 999,
                fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
                background: status.bg, color: status.color, border: `1.5px solid ${status.border}`,
              }}>{status.label}</span>
            </div>
          </div>
        </div>

        {seller.isFallback && !publicView && (
          <div className="inv-block" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '9px 34px' }}>
            <div style={{ fontSize: 11, color: '#92400e' }}>
              <strong>Seller identity notice:</strong> this invoice uses the built-in fallback company
              registration (not an admin-configured registration).
              {seller.taxIdentityConfirmed ? ' The admin confirmed this identity at issuance.' : ''}
            </div>
          </div>
        )}

        {/* Bill to / Sold by */}
        <div className="inv-block" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ padding: '14px 34px', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
            <SecLabel>Bill To</SecLabel>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 3 }}>
              {invoice.customerName || 'Walk-in Customer'}
            </div>
            {invoice.customerEmail && <div style={{ fontSize: 12, color: '#6b7280' }}>{invoice.customerEmail}</div>}
            {invoice.customerPhone && <div style={{ fontSize: 12, color: '#6b7280' }}>{invoice.customerPhone}</div>}
            {(invoice.customerAddress || invoice.customerCity) && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                {[invoice.customerAddress, invoice.customerCity].filter(Boolean).join(', ')}
              </div>
            )}
            {(invoice.customerState || invoice.customerPincode) && (
              <div style={{ fontSize: 12, color: '#374151' }}>
                {[invoice.customerState, invoice.customerPincode].filter(Boolean).join(' — ')}
              </div>
            )}
            <div style={{ marginTop: 3, fontSize: 10.5, color: '#9ca3af' }}>GSTIN: Unregistered</div>
          </div>
          <div style={{ padding: '14px 34px', borderBottom: '1px solid #e5e7eb' }}>
            <SecLabel>Sold By</SecLabel>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 3 }}>
              {seller.legalName || '—'}
            </div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{seller.address || '—'}</div>
            <div style={{ fontSize: 12, color: '#374151' }}>
              {[seller.state, seller.stateCode].filter(Boolean).join(' — ')}
            </div>
            <div style={{ marginTop: 3, fontSize: 10.5, color: '#9ca3af' }}>
              GSTIN: {seller.gstin || '—'}{seller.pan ? ` · PAN: ${seller.pan}` : ''}
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="inv-block" style={{ padding: '12px 34px', borderBottom: '1px solid #e5e7eb' }}>
          <SecLabel>Items Sold</SecLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, tableLayout: 'fixed' }}>
            <colgroup>
              {(showLineTax
                ? ['5%', '35%', '7%', '13%', '12%', '8%', '10%', '10%']
                : ['6%', '44%', '10%', '14%', '12%', '14%']
              ).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: '#1B1F3B' }}>
                <TH>#</TH>
                <TH>Description</TH>
                <TH right>Qty</TH>
                <TH right>Unit Price</TH>
                <TH right>Discount</TH>
                {showLineTax && <TH right>Tax %</TH>}
                {showLineTax && <TH right>Tax</TH>}
                <TH right>{showLineTax ? 'Line Total' : 'Amount'}</TH>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6',
                  background: idx % 2 === 1 ? '#fafafa' : 'white' }}>
                  <Cell small>{idx + 1}</Cell>
                  <td style={{ padding: '7px 10px' }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: 12.5 }}>{l.name}</div>
                    <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 1 }}>
                      {[l.variantLabel, l.sku && `SKU ${l.sku}`, l.hsn && `HSN ${l.hsn}`].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <Cell right>{l.quantity}{l.unit ? ` ${l.unit}` : ''}</Cell>
                  <Cell right>{INR(l.unitPrice)}</Cell>
                  <Cell right>{INR(l.discount)}</Cell>
                  {showLineTax && <Cell right>{l.taxRate || 0}%</Cell>}
                  {showLineTax && <Cell right>{INR(l.taxAmount)}</Cell>}
                  <Cell right bold>{INR(showLineTax ? l.lineTotal : (l.lineTotal || 0) - (l.taxAmount || 0))}</Cell>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {[
                ['Gross', grossTotal],
                ['Discount', -discountTotal],
                ...(taxApplied ? [['Taxable Value', taxableValue]] : []),
              ].map(([k, v]) => (
                <tr key={k}>
                  <td colSpan={COLS - 1} style={{ padding: '4px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{k}</td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 12 }}>{INR(v)}</td>
                </tr>
              ))}
              {isManualRate && (
                <tr>
                  <td colSpan={COLS - 1} style={{ padding: '4px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>
                    Tax @ {invoice.manualTaxRate}% (manually specified)
                  </td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 12 }}>{INR(totalTax)}</td>
                </tr>
              )}
              {!taxApplied ? null : isInterstate ? (
                <tr>
                  <td colSpan={COLS - 1} style={{ padding: '4px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>IGST</td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 12 }}>{INR(gst.igst ?? totalTax)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td colSpan={COLS - 1} style={{ padding: '4px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>CGST</td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 12 }}>{INR(gst.cgst ?? totalTax / 2)}</td>
                  </tr>
                  <tr>
                    <td colSpan={COLS - 1} style={{ padding: '4px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>SGST</td>
                    <td style={{ padding: '4px 10px', textAlign: 'right', fontSize: 12 }}>{INR(gst.sgst ?? totalTax / 2)}</td>
                  </tr>
                </>
              )}
              <tr style={{ background: '#1B1F3B' }}>
                <td colSpan={COLS - 1} style={{ padding: '10px 10px', textAlign: 'right',
                  color: '#D4AF37', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                  GRAND TOTAL
                </td>
                <td style={{ padding: '10px 10px', textAlign: 'right',
                  color: '#D4AF37', fontWeight: 900, fontSize: 17 }}>
                  {INR(invoice.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            {taxApplied
              ? (isInterstate ? 'Inter-state supply — IGST applied.' : 'Intra-state supply — CGST + SGST applied.')
              : 'Tax has not been applied on this invoice.'}
            {isManualRate && ` Tax is charged at ${invoice.manualTaxRate}% on the taxable value, a rate entered by the issuer — not derived from per-item tax classification.`}
            {seller.state ? ` Seller state: ${seller.state}.` : ''}
          </div>
        </div>

        {/* Payments */}
        <div className="inv-block" style={{ padding: '12px 34px', borderBottom: '1px solid #e5e7eb' }}>
          <SecLabel>Payment Summary</SecLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { l: 'Net Received', v: INR(netPaid), bg: '#f0fdf4', b: '#bbf7d0', c: '#15803d' },
              { l: 'Outstanding', v: INR(outstanding), bg: '#fff7ed', b: '#fed7aa', c: outstanding > 0 ? '#c2410c' : '#15803d' },
            ].map(({ l, v, bg, b, c }) => (
              <div key={l} style={{ background: bg, border: `1.5px solid ${b}`, borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {payments.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>No offline payment recorded.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: '#f8f9ff' }}>
                  {['Date', 'Kind', 'Method', ...(publicView ? [] : ['Reference', 'Recorded By']), 'Amount'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Amount' ? 'right' : 'left',
                      color: '#6b7280', fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id || `${p.kind}-${p.receivedAt}-${p.amount}`} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{fmtDate(p.receivedAt || p.createdAt)}</td>
                    <td style={{ padding: '6px 8px', color: p.kind === 'REVERSAL' ? '#b91c1c' : '#15803d', fontWeight: 700 }}>{p.kind}</td>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{p.method || '—'}</td>
                    {!publicView && <td style={{ padding: '6px 8px', color: '#6b7280' }}>{p.reference || '—'}</td>}
                    {!publicView && <td style={{ padding: '6px 8px', color: '#6b7280' }}>{p.recordedByName || '—'}</td>}
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700,
                      color: p.kind === 'REVERSAL' ? '#b91c1c' : '#111827' }}>
                      {p.kind === 'REVERSAL' ? '−' : ''}{INR(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Amount in words + status */}
        <div className="inv-block" style={{ padding: '11px 34px', background: '#f8f9ff',
          borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <SecLabel>Amount in Words</SecLabel>
            <div style={{ fontStyle: 'italic', color: '#374151', fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
              {amtWords(netPaid)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Payment Status
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: outstanding > 0 ? '#c2410c' : '#15803d' }}>
              {paymentLabel}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="inv-block" style={{ background: '#1B1F3B', padding: '16px 34px' }}>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ color: '#D4AF37', fontWeight: 800, fontSize: 14.5, fontFamily: 'Georgia, serif' }}>
              Thank you for your purchase
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 10,
            display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
              Computer-generated {taxApplied ? 'tax invoice' : 'invoice'} · Manual offline sale · Issued by {seller.legalName || '—'}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Generated: {genTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
