import { formatCurrency, amtWords, fmtInvoiceDate, fmtInvoiceLong } from './helpers';
import { WITHOUT_KIT } from './bookingInvoice';
import { isInvoiceLogoDataUri } from './invoiceLogo';

const STATUS_TEXT = {
  FULLY_PAID: 'Paid in Full', PARTIALLY_PAID: 'Partially Paid', PENDING: 'Payment Pending',
  REFUNDED: 'Refunded', FAILED: 'Payment Failed', CANCELLED: 'Cancelled', UNKNOWN: 'Status Unavailable',
};
// Same palette as the website's StatusPill / the on-screen invoice.
const STATUS_COLOR = {
  FULLY_PAID:     { color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  PARTIALLY_PAID: { color: '#c2410c', bg: '#ffedd5', border: '#fed7aa' },
  PENDING:        { color: '#b45309', bg: '#fef3c7', border: '#fde68a' },
  REFUNDED:       { color: '#374151', bg: '#f3f4f6', border: '#d1d5db' },
  FAILED:         { color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  CANCELLED:      { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
  UNKNOWN:        { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' },
};

/**
 * A4 portrait at 72 PPI, in the units `Print.printToFileAsync` takes (`width` / `height`). expo-print's `margins` option is iOS-only,
 * so the page margins live in the HTML itself (the 28px section padding below) and behave the same on both platforms.
 */
export const INVOICE_PAGE = { width: 595, height: 842 };

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 0; font-family: Helvetica, Arial, sans-serif; color: #1C1917; font-size: 11px; line-height: 1.4; }
  table { border-collapse: collapse; width: 100%; }
  td, th { overflow-wrap: anywhere; word-wrap: break-word; vertical-align: top; }
  .blk { padding: 12px 28px; border-bottom: 1px solid #e5e7eb; page-break-inside: avoid; break-inside: avoid; }
  .lbl { font-size: 8.5px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin: 0 0 8px; }
  .sub { font-size: 9.5px; color: #9ca3af; }
  .r { text-align: right; }
  .pill { display: inline-block; padding: 3px 14px; border-radius: 999px; font-weight: 700; font-size: 11px; letter-spacing: 0.4px; }
  .kv td { padding: 0 0 7px; width: 25%; padding-right: 10px; }
  .kv .k { font-size: 8px; color: #9ca3af; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 2px; }
  .kv .v { font-size: 11px; color: #111827; font-weight: 500; }
  .card { border-radius: 10px; padding: 8px 12px; }
`;

const metaRow = (k, v) => `<tr><td style="color:rgba(255,255,255,0.45);font-size:10.5px;padding:1.5px 12px 1.5px 0;text-align:right;white-space:nowrap">${esc(k)}</td><td style="color:#ffffff;font-weight:600;font-size:10.5px;padding:1.5px 0;text-align:left">${esc(v)}</td></tr>`;

const kvCell = (k, v) => `<td><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></td>`;

/** Rows of `perRow` label/value cells; the last row is padded so the columns line up. */
function kvTable(pairs, perRow) {
  const rows = [];
  for (let i = 0; i < pairs.length; i += perRow) {
    const slice = pairs.slice(i, i + perRow);
    const cells = slice.map(([k, v]) => kvCell(k, v)).join('') + '<td></td>'.repeat(perRow - slice.length);
    rows.push(`<tr>${cells}</tr>`);
  }
  return `<table class="kv" style="table-layout:fixed">${rows.join('')}</table>`;
}

const amountCard = (label, amount, c) => `<td style="padding-right:8px"><div class="card" style="background:${c.bg};border:1.5px solid ${c.border}"><div style="font-size:8.5px;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:3px">${esc(label)}</div><div style="font-size:16px;font-weight:900;color:${c.color}">${formatCurrency(amount)}</div></div></td>`;

/**
 * Printable HTML for ONE persisted invoice (the one selected on screen), built only from the view model of
 * utils/bookingInvoice.buildInvoiceView — so the PDF shows the same official invoice number, seller, amounts, tax and payment
 * identifiers as the screen. Layout and section order follow the website's InvoicePage.
 *
 * Deliberately NOT printed (no authoritative persisted source, or an unapproved legal statement — see docs/INVOICE_SOURCE_OF_TRUTH_AUDIT.md):
 * "Payment Method", the customer "GSTIN: Unregistered" label, the ITC statement, a render-time "Generated" timestamp, and a separate
 * "Service At" block (the website prints the Bill To data again there; no service-address field exists). The output is a pure function of
 * `view` (no clock, no locale layer), so it is byte-identical whatever the UI language.
 *
 * `options.logoDataUri` (optional): the platform logo as a base64 image data URI from utils/invoiceLogo.js. It is validated again here, so only a
 * well-formed image data URI can reach the markup; anything else (or nothing) gives the text-only header. It changes no invoice data.
 */
export function buildBookingInvoiceHtml(view, options = {}) {
  const { seller, customer, details, lineItems, pricing, tax, payment } = view;
  const pay = STATUS_COLOR[payment.status] || STATUS_COLOR.UNKNOWN;
  const statusText = STATUS_TEXT[payment.status] || STATUS_TEXT.UNKNOWN;
  const pill = `<span class="pill" style="background:${pay.bg};color:${pay.color};border:1.5px solid ${pay.border}">${esc(statusText)}</span>`;

  // ── Header ────────────────────────────────────────────────────────────────
  const contactLine = [seller.email, seller.phone, seller.web].filter(Boolean).join(' · ');
  const regLine = [
    seller.gstin ? `<span style="color:#D4AF37;font-weight:700">GSTIN:</span> ${esc(seller.gstin)}` : '',
    seller.pan ? `<span style="color:#D4AF37;font-weight:700">PAN:</span> ${esc(seller.pan)}` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;');
  const meta = [
    ['Invoice No', view.invoiceNumber],
    ['Order No', view.bookingNumber || '—'],
    ['Issue Date', fmtInvoiceDate(view.invoiceDate)],
    ['Service Date', fmtInvoiceLong(view.serviceDate)],
    ['Place of Supply', view.placeOfSupply],
  ].map(([k, v]) => metaRow(k, v)).join('');
  const typeLine = `${view.paymentTypeLabel}${view.status !== 'active' ? ` · ${view.status.toUpperCase()}` : ''}`;

  // Like the website: with the logo, the brand is the image and the gold line carries only the legal suffix ("PVT. LTD."); without it, the
  // seller name stays as the text brand. A name that does not start with the brand word (e.g. a seller snapshot) is always printed in full.
  const logo = isInvoiceLogoDataUri(options?.logoDataUri) ? options.logoDataUri : null;
  const legalSuffix = String(seller.name).replace(/^ZUTSAV\s+/i, '') || String(seller.name);
  const brand = logo
    ? `<img src="${logo}" alt="Zutsav" style="display:block;height:38px;width:auto;max-width:190px;object-fit:contain;margin-bottom:6px"/>
        <div style="color:#D4AF37;font-weight:800;font-size:11.5px;letter-spacing:2px;text-transform:uppercase;margin-bottom:7px">${esc(legalSuffix)}</div>`
    : `<div style="font-family:Georgia,serif;font-size:21px;font-weight:900;color:#D4AF37;letter-spacing:0.5px;margin-bottom:7px">${esc(seller.name)}</div>`;

  const header = `<div style="background:#1B1F3B;padding:18px 28px"><table><tr>
      <td style="width:52%;padding-right:12px">
        ${brand}
        <div style="color:rgba(255,255,255,0.75);font-size:9.5px;line-height:1.55">
          ${seller.addr1 ? `<div>${esc(seller.addr1)}</div>` : ''}${seller.addr2 ? `<div>${esc(seller.addr2)}</div>` : ''}
          ${regLine ? `<div style="margin-top:4px;color:rgba(255,255,255,0.7)">${regLine}</div>` : ''}
          ${contactLine ? `<div style="color:rgba(255,255,255,0.55)">${esc(contactLine)}</div>` : ''}
        </div>
      </td>
      <td style="text-align:right">
        <div style="font-family:Georgia,serif;font-size:24px;font-weight:900;color:#D4AF37;letter-spacing:2px;text-transform:uppercase">Tax Invoice</div>
        <div style="color:rgba(255,255,255,0.45);font-size:9px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">${esc(typeLine)}</div>
        <table style="width:auto;margin-left:auto">${meta}</table>
        <div style="margin-top:9px">${pill}${payment.status === 'CANCELLED' ? `<div style="margin-top:4px;font-size:9.5px;color:rgba(255,255,255,0.55)">Payment: ${esc(payment.cancelledNote)}</div>` : ''}</div>
      </td>
    </tr></table></div>`;

  // ── Bill To ───────────────────────────────────────────────────────────────
  const addrLine = [customer.address, customer.city, customer.district && customer.district !== customer.city ? customer.district : null].filter(Boolean).join(', ');
  const stateLine = [customer.state, customer.pincode].filter(Boolean).join(' — ');
  const billTo = `<div class="blk">
      <p class="lbl">Bill To</p>
      <div style="font-size:13px;font-weight:800;color:#111827;margin-bottom:3px">${esc(customer.name || '—')}</div>
      ${customer.email ? `<div style="color:#6b7280">${esc(customer.email)}</div>` : ''}
      ${customer.phone ? `<div style="color:#6b7280">${esc(customer.phone)}</div>` : ''}
      ${addrLine ? `<div style="margin-top:4px;color:#374151">${esc(addrLine)}</div>` : ''}
      ${stateLine ? `<div style="color:#374151">${esc(stateLine)}</div>` : ''}
    </div>`;

  // ── Booking details (only what the view model actually has; nothing defaulted) ─────────────────────────────
  const bookingPairs = [
    ['Service', details.service || '—'],
    ['Date', fmtInvoiceLong(view.serviceDate)],
    ['Time', view.serviceTime || '—'],
    ...(details.language ? [['Language', details.language]] : []),
    ['Booking Type', details.urgent ? 'URGENT' : 'Normal'],
    ['Location', details.location || '—'],
    ['Pandit', details.pandit || '—'],
    ['Samagri Kit', details.kit],
    ['Booking ID', view.bookingNumber || '—'],
  ];
  const bookingDetails = `<div class="blk" style="background:#f8f9ff"><p class="lbl">Booking Details</p>${kvTable(bookingPairs, 4)}</div>`;

  // ── Order items ───────────────────────────────────────────────────────────
  const itemRows = lineItems.map((it, i) => `<tr style="border-bottom:1px solid #f3f4f6${i % 2 === 1 ? ';background:#fafafa' : ''}">
      <td style="padding:6px 8px;color:#6b7280">${i + 1}</td>
      <td style="padding:6px 8px"><div style="font-weight:700;color:#111827">${esc(it.desc)}</div><div class="sub">${esc(it.sub)}</div></td>
      <td class="r" style="padding:6px 8px">${esc(it.qty)}</td>
      <td class="r" style="padding:6px 8px;color:#374151">${formatCurrency(it.rate)}</td>
      <td class="r" style="padding:6px 8px;font-weight:700;color:#111827">${formatCurrency(it.amt)}</td>
    </tr>`).join('');
  const th = (label, right) => `<th style="padding:7px 8px;color:#ffffff;font-size:9px;letter-spacing:1px;text-transform:uppercase;text-align:${right ? 'right' : 'left'}">${label}</th>`;
  const orderItems = `<div class="blk">
      <p class="lbl">Order Items</p>
      <table style="table-layout:fixed">
        <colgroup><col style="width:6%"/><col style="width:50%"/><col style="width:8%"/><col style="width:18%"/><col style="width:18%"/></colgroup>
        <thead><tr style="background:#1B1F3B">${th('#')}${th('Description')}${th('Qty', true)}${th('Unit Price', true)}${th('Amount', true)}</tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr><td colspan="3" style="border-top:2px solid #e5e7eb"></td><td class="r" style="padding:6px 8px;font-weight:600;color:#6b7280;border-top:2px solid #e5e7eb">Subtotal</td><td class="r" style="padding:6px 8px;border-top:2px solid #e5e7eb">${formatCurrency(view.subtotal)}</td></tr>
          ${tax.total > 0 ? `<tr><td colspan="3"></td><td class="r" style="padding:3px 8px;font-weight:600;color:#6b7280">${esc(tax.totalLabel)}</td><td class="r" style="padding:3px 8px">${formatCurrency(tax.total)}</td></tr>` : ''}
          <tr style="background:#1B1F3B"><td colspan="3"></td><td class="r" style="padding:9px 8px;color:#D4AF37;font-weight:900;font-size:11px;letter-spacing:1px">GRAND TOTAL</td><td class="r" style="padding:9px 8px;color:#D4AF37;font-weight:900;font-size:15px">${formatCurrency(pricing.grandTotal)}</td></tr>
        </tfoot>
      </table>
    </div>`;

  // ── Payment details ───────────────────────────────────────────────────────
  const cards = [
    amountCard('Order Total', payment.orderTotal, { bg: '#f0f4ff', border: '#c7d2fe', color: '#1B1F3B' }),
    payment.previouslyPaid > 0 ? amountCard('Previously Paid', payment.previouslyPaid, { bg: '#f0f9ff', border: '#bae6fd', color: '#0369a1' }) : '',
    amountCard('This Invoice', payment.thisInvoice, { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' }),
    payment.outstanding > 0 ? amountCard('Balance Due', payment.outstanding, { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' }) : '',
  ].filter(Boolean).join('');
  const idPairs = payment.gateway || payment.merchantTransactionId || payment.gatewayTransactionId ? [
    ['Payment Type', view.paymentTypeLabel],
    ...(payment.gateway ? [['Payment Gateway', payment.gateway.toUpperCase()]] : []),
    ...(payment.merchantTransactionId ? [['Merchant Txn ID', payment.merchantTransactionId]] : []),
    ...(payment.gatewayTransactionId ? [['Gateway Txn ID', payment.gatewayTransactionId]] : []),
  ] : [];
  const paymentDetails = `<div class="blk">
      <p class="lbl">Payment Details</p>
      <table style="table-layout:fixed;margin-bottom:8px"><tr>${cards}</tr></table>
      ${idPairs.length ? `<div class="card" style="background:#f8f9ff;border:1px solid #e0e7ff;padding:9px 12px 2px">${kvTable(idPairs, 3)}</div>` : ''}
    </div>`;

  // ── Tax summary: the persisted component taxes and gstBreakdown, nothing re-derived beyond the per-row rate ──────────
  const taxHead = tax.split === 'igst' ? ['IGST'] : tax.split === 'cgst_sgst' ? ['CGST', 'SGST'] : [];
  const kitLabel = details.kit && details.kit !== WITHOUT_KIT ? details.kit : 'Samagri Kit';
  const taxCells = (t) => (tax.split === 'igst'
    ? [t]
    : tax.split === 'cgst_sgst' ? [t / 2, t / 2] : []).map((n) => `<td class="r" style="padding:6px 8px">${formatCurrency(n)}</td>`).join('');
  const taxRows = tax.rows.map((r) => `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:6px 8px">${esc(r.key === 'kit' ? `${kitLabel} — GST` : 'Platform Convenience Fee — GST')}</td><td class="r" style="padding:6px 8px">${formatCurrency(r.taxable)}</td><td class="r" style="padding:6px 8px">${r.rate != null ? `${esc(r.rate)}%` : '—'}</td>${taxCells(r.tax)}<td class="r" style="padding:6px 8px;font-weight:700">${formatCurrency(r.tax)}</td></tr>`).join('');
  const totalCells = tax.split === 'igst'
    ? [tax.igst]
    : tax.split === 'cgst_sgst' ? [tax.cgst, tax.sgst] : [];
  const taxTh = (label, right) => `<th style="padding:6px 8px;color:#ffffff;font-size:8.5px;letter-spacing:1px;text-transform:uppercase;text-align:${right ? 'right' : 'left'}">${label}</th>`;
  const taxSummary = tax.total > 0 ? `<div class="blk">
      <p class="lbl">Tax Summary</p>
      <table>
        <thead><tr style="background:#4c1d95">${taxTh('Item Description')}${taxTh('Taxable Amount', true)}${taxTh('Rate', true)}${taxHead.map((h) => taxTh(h, true)).join('')}${taxTh('Total Tax', true)}</tr></thead>
        <tbody>${taxRows}</tbody>
        <tfoot><tr style="background:#4c1d95"><td style="padding:7px 8px;color:#ffffff;font-weight:800">Total Tax Collected</td><td></td><td class="r" style="padding:7px 8px;color:rgba(255,255,255,0.75);font-weight:700">GST</td>${totalCells.map((n) => `<td class="r" style="padding:7px 8px;color:#ffffff;font-weight:800">${formatCurrency(n)}</td>`).join('')}<td class="r" style="padding:7px 8px;color:#c4b5fd;font-weight:900;font-size:12px">${formatCurrency(tax.total)}</td></tr></tfoot>
      </table>
    </div>` : '';

  // ── Amount in words + status ──────────────────────────────────────────────
  const words = `<div class="blk" style="background:#f8f9ff"><table><tr>
      <td><p class="lbl">Amount in Words</p><div style="font-style:italic;font-weight:600;color:#374151;font-size:11.5px">${esc(amtWords(payment.thisInvoice))}</div></td>
      <td class="r" style="width:34%"><div style="font-size:8.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px">Payment Status</div>${pill}${payment.status === 'CANCELLED' ? `<div style="margin-top:4px;font-size:9.5px;color:#9ca3af">Payment: ${esc(payment.cancelledNote)}</div>` : ''}</td>
    </tr></table></div>`;

  // ── Footer ────────────────────────────────────────────────────────────────
  const contacts = [['Support', seller.email], ['WhatsApp', seller.phone], ['Website', seller.web]].filter(([, v]) => v);
  const footer = `<div style="background:#1B1F3B;padding:14px 28px;text-align:center;page-break-inside:avoid;break-inside:avoid">
      <div style="font-family:Georgia,serif;color:#D4AF37;font-weight:800;font-size:13.5px;margin-bottom:3px">🙏 Thank you for choosing Zutsav!</div>
      <div style="color:rgba(255,255,255,0.65);font-size:10.5px;margin-bottom:9px">May your prayers be answered with divine grace.</div>
      <table style="width:auto;margin:0 auto 9px"><tr>${contacts.map(([k, v]) => `<td style="padding:0 14px;text-align:center"><div style="font-size:8px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px">${esc(k)}</div><div style="font-size:10.5px;color:rgba(255,255,255,0.75);font-weight:600">${esc(v)}</div></td>`).join('')}</tr></table>
      <div style="border-top:1px solid rgba(255,255,255,0.12);padding-top:8px;color:rgba(255,255,255,0.35);font-size:9px">This is a computer-generated invoice</div>
    </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=${INVOICE_PAGE.width}"/><style>${CSS}</style></head><body>${header}${billTo}${bookingDetails}${orderItems}${paymentDetails}${taxSummary}${words}${footer}</body></html>`;
}
