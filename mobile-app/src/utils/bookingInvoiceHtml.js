import { formatCurrency, amtWords, fmtInvoiceDate, fmtInvoiceLong } from './helpers';

const STATUS_TEXT = {
  FULLY_PAID: 'Paid in Full', PARTIALLY_PAID: 'Partially Paid', PENDING: 'Payment Pending',
  REFUNDED: 'Refunded', FAILED: 'Payment Failed', CANCELLED: 'Cancelled', UNKNOWN: 'Status Unavailable',
};

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Printable HTML for ONE persisted invoice (the one selected on screen), built
 * only from the view model of utils/bookingInvoice.buildInvoiceView — so the PDF
 * shows the same official invoice number, seller, amounts and tax as the screen.
 */
export function buildBookingInvoiceHtml(view) {
  const { seller, customer, details, lineItems, pricing, tax, payment } = view;
  const itemRows = lineItems.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.desc)}<br/><span style="font-size:12px;color:#9ca3af">${esc(it.sub)}</span></td><td style="text-align:right">${it.qty}</td><td style="text-align:right">${formatCurrency(it.rate)}</td><td style="text-align:right">${formatCurrency(it.amt)}</td></tr>`).join('');
  const taxCells = (t) => (tax.split === 'igst'
    ? `<td style="text-align:right">${formatCurrency(t)}</td>`
    : tax.split === 'cgst_sgst'
      ? `<td style="text-align:right">${formatCurrency(t / 2)}</td><td style="text-align:right">${formatCurrency(t / 2)}</td>`
      : '');
  const taxHead = tax.split === 'igst' ? '<th>IGST</th>' : tax.split === 'cgst_sgst' ? '<th>CGST</th><th>SGST</th>' : '';
  const taxRows = tax.rows.map((r) => `<tr><td>${r.key === 'kit' ? 'Samagri Kit' : 'Platform Convenience Fee'} — GST</td><td style="text-align:right">${formatCurrency(r.taxable)}</td><td style="text-align:right">${r.rate != null ? `${r.rate}%` : ''}</td>${taxCells(r.tax)}<td style="text-align:right">${formatCurrency(r.tax)}</td></tr>`).join('');
  const totalCells = tax.split === 'igst'
    ? `<td style="text-align:right">${formatCurrency(tax.igst)}</td>`
    : tax.split === 'cgst_sgst' ? `<td style="text-align:right">${formatCurrency(tax.cgst)}</td><td style="text-align:right">${formatCurrency(tax.sgst)}</td>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:Helvetica,Arial,sans-serif;padding:0;margin:0;color:#1C1917">
    <div style="background:#1B1F3B;padding:32px 36px">
      <h1 style="color:#D4AF37;margin:0;font-size:26px">${esc(seller.name)}</h1>
      <p style="color:rgba(255,255,255,0.45);margin:4px 0 0;font-size:11px">${esc(seller.addr1)}<br/>${esc(seller.addr2)}<br/>GSTIN: ${esc(seller.gstin)}${seller.pan ? ` · PAN: ${esc(seller.pan)}` : ''}</p>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h2 style="color:#1B1F3B;margin:0;font-size:18px">Tax Invoice</h2>
      <p style="color:#6b7280;font-size:12px;margin:2px 0">${esc(view.paymentTypeLabel)}${view.status !== 'active' ? ` · ${esc(view.status.toUpperCase())}` : ''}</p>
      <p style="font-size:13px;margin:6px 0">Invoice No: <b>${esc(view.invoiceNumber)}</b><br/>Order No: ${esc(view.bookingNumber)}<br/>Issue Date: ${esc(fmtInvoiceDate(view.invoiceDate))}<br/>Service Date: ${esc(fmtInvoiceLong(view.serviceDate))}<br/>Place of Supply: ${esc(view.placeOfSupply)}</p>
      <h3>Bill To</h3>
      <p>${esc(customer.name)}<br/>${esc(customer.phone)}${customer.email ? '<br/>' + esc(customer.email) : ''}<br/>${esc([customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', '))}</p>
      <h3>Booking Details</h3>
      <p>Service: ${esc(details.service)}<br/>Time: ${esc(view.serviceTime)}<br/>Pandit: ${esc(details.pandit || '—')}</p>
    </div>
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h3>Order Items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#1B1F3B;color:white">
          <th style="padding:8px 10px;text-align:left">#</th><th style="padding:8px 10px;text-align:left">Item</th>
          <th style="padding:8px 10px;text-align:right">Qty</th><th style="padding:8px 10px;text-align:right">Rate</th><th style="padding:8px 10px;text-align:right">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr><td colspan="3"></td><td style="text-align:right;font-weight:600;padding:8px 10px;border-top:1px solid #e5e7eb">Subtotal</td><td style="text-align:right;padding:8px 10px;border-top:1px solid #e5e7eb">${formatCurrency(view.subtotal)}</td></tr>
          ${tax.total > 0 ? `<tr><td colspan="3"></td><td style="text-align:right;font-weight:600;padding:6px 10px">${esc(tax.totalLabel)}</td><td style="text-align:right;padding:6px 10px">${formatCurrency(tax.total)}</td></tr>` : ''}
          <tr style="background:#1B1F3B"><td colspan="3"></td><td style="text-align:right;color:#D4AF37;font-weight:900;padding:12px 10px">GRAND TOTAL</td><td style="text-align:right;color:#D4AF37;font-weight:900;font-size:18px;padding:12px 10px">${formatCurrency(pricing.grandTotal)}</td></tr>
        </tfoot>
      </table>
    </div>
    ${tax.total > 0 ? `<div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h3>Tax Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#4c1d95;color:white"><th style="text-align:left;padding:6px 8px">Item</th><th>Taxable</th><th>Rate</th>${taxHead}<th>Total Tax</th></tr></thead>
        <tbody>${taxRows}</tbody>
        <tfoot><tr style="font-weight:bold"><td>Total Tax Collected</td><td></td><td>GST</td>${totalCells}<td style="text-align:right">${formatCurrency(tax.total)}</td></tr></tfoot>
      </table>
    </div>` : ''}
    <div style="padding:24px 36px;border-bottom:1px solid #e5e7eb">
      <h3>Payment</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr><td>Order Total</td><td style="text-align:right">${formatCurrency(payment.orderTotal)}</td></tr>
        ${payment.previouslyPaid > 0 ? `<tr><td>Previously Paid</td><td style="text-align:right">${formatCurrency(payment.previouslyPaid)}</td></tr>` : ''}
        <tr style="font-weight:bold"><td>This Invoice</td><td style="text-align:right">${formatCurrency(payment.thisInvoice)}</td></tr>
        ${payment.outstanding > 0 ? `<tr><td>Balance Due</td><td style="text-align:right">${formatCurrency(payment.outstanding)}</td></tr>` : ''}
        <tr><td>Payment Status</td><td style="text-align:right">${esc(STATUS_TEXT[payment.status] || STATUS_TEXT.UNKNOWN)}</td></tr>
        ${payment.merchantTransactionId ? `<tr><td>Merchant Txn ID</td><td style="text-align:right">${esc(payment.merchantTransactionId)}</td></tr>` : ''}
      </table>
      <p style="font-style:italic;color:#374151;font-size:12px;margin-top:12px">${esc(amtWords(payment.thisInvoice))}</p>
    </div>
    <div style="background:#1B1F3B;padding:24px 36px;text-align:center">
      <p style="color:#D4AF37;font-weight:800;font-size:15px;margin:0">🙏 Thank you for choosing Zutsav!</p>
      <p style="color:rgba(255,255,255,0.65);font-size:12px;margin:6px 0 0">${esc(seller.email)} · ${esc(seller.phone)} · ${esc(seller.web)}</p>
      <p style="color:rgba(255,255,255,0.35);font-size:10px;margin:12px 0 0">This is a computer-generated invoice</p>
    </div>
  </body></html>`;
}
