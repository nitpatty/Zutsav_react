import {
  mapBookingInvoiceResponse, buildInvoiceView, buildLineItems, pricingOf, resolvePaymentStatus,
  cancelledPaymentNote, summariseInvoice,
} from '../bookingInvoice';
import { buildBookingInvoiceHtml } from '../bookingInvoiceHtml';
import { COMPANY, booking, invoice, finalInvoice, responseBody } from './invoiceFixtures';

describe('mapBookingInvoiceResponse', () => {
  it('returns the booking and every persisted invoice, oldest first as sent', () => {
    const out = mapBookingInvoiceResponse(responseBody([invoice(), finalInvoice()]));
    expect(out.booking.bookingNumber).toBe('ZB-2026-0042');
    expect(out.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-2026-000101', 'INV-2026-000102']);
  });

  it('returns an empty list when the booking has no invoice', () => {
    expect(mapBookingInvoiceResponse(responseBody([])).invoices).toEqual([]);
  });

  it('never substitutes the booking number for a missing invoice number — such rows are dropped', () => {
    const out = mapBookingInvoiceResponse(responseBody([invoice({ invoiceNumber: '' }), invoice({ invoiceNumber: undefined })]));
    expect(out.invoices).toEqual([]);
  });

  it('excludes manual (admin-only) invoices from the customer view', () => {
    const out = mapBookingInvoiceResponse(responseBody([invoice({ source: 'manual', invoiceNumber: 'MAN-2026-000001' }), invoice()]));
    expect(out.invoices.map((i) => i.invoiceNumber)).toEqual(['INV-2026-000101']);
  });

  it('accepts the single-invoice shape ({ invoice }) and tolerates garbage', () => {
    expect(mapBookingInvoiceResponse({ booking: booking(), invoice: invoice() }).invoices).toHaveLength(1);
    [undefined, null, {}, { invoices: null }, { invoices: 'x' }, { invoices: [null, 5, 'a'] }].forEach((b) => {
      expect(mapBookingInvoiceResponse(b).invoices).toEqual([]);
    });
  });
});

describe('buildInvoiceView — official persisted data', () => {
  const view = buildInvoiceView(invoice(), booking(), COMPANY);

  it('shows the official invoice number and date, with the booking number kept separate', () => {
    expect(view.invoiceNumber).toBe('INV-2026-000101');
    expect(view.invoiceDate).toBe('2026-03-02T09:15:00.000Z');
    expect(view.bookingNumber).toBe('ZB-2026-0042');
    expect(view.invoiceNumber).not.toBe(view.bookingNumber);
    expect(view.status).toBe('active');
    expect(view.paymentTypeLabel).toBe('Advance Payment');
  });

  it('uses the persisted amounts and GST breakdown', () => {
    expect(view.pricing).toMatchObject({ poojaAmount: 2000, platformFee: 100, platformGST: 18, kitAmount: 300, kitGST: 54, urgentSurcharge: 20, totalTax: 72, grandTotal: 2492 });
    expect(view.tax).toMatchObject({ total: 72, split: 'cgst_sgst', cgst: 36, sgst: 36, igst: 0 });
    expect(view.subtotal).toBe(2420); // 2000 + 300 + 100 + 20
    expect(view.subtotal + view.tax.total).toBe(view.pricing.grandTotal);
  });

  it('derives tax rates from the stored amounts, not from a hard-coded 18%', () => {
    expect(view.tax.rows).toEqual([
      { key: 'platform', taxable: 100, tax: 18, rate: 18 },
      { key: 'kit', taxable: 300, tax: 54, rate: 18 },
    ]);
    const odd = buildInvoiceView(invoice({ platformGST: 5, kitGST: 0, totalGST: 5, kitAmount: 0, gstBreakdown: { cgst: 2.5, sgst: 2.5, igst: 0, isInterstate: false } }), booking(), COMPANY);
    expect(odd.tax.rows[0].rate).toBe(5); // a historical 5% invoice is shown as 5%, not 18%
  });

  it('builds lines from persisted amounts, including the urgent surcharge', () => {
    expect(view.lineItems.map((l) => [l.desc, l.amt])).toEqual([
      ['Griha Pravesh', 2000], ['Griha Kit', 300], ['Platform Convenience Fee', 100], ['Urgent Booking Surcharge', 20],
    ]);
  });

  it('does not recalculate with today\'s catalog: invoiced kit price and pooja name win', () => {
    const kitLine = view.lineItems.find((l) => l.desc === 'Griha Kit');
    expect(kitLine.amt).toBe(300);            // not the live catalog 999
    expect(kitLine.rate).toBe(300);
    expect(view.lineItems[0].desc).toBe('Griha Pravesh'); // snapshot, not "CURRENT-CATALOG Pooja Name"
    expect(JSON.stringify(view)).not.toContain('999');
  });

  it('uses the immutable customer snapshot over the live booking details', () => {
    expect(view.customer).toMatchObject({ name: 'Asha Test', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', phone: '9111111111' });
    expect(view.placeOfSupply).toBe('KARNATAKA');
    expect(JSON.stringify(view.customer)).not.toContain('BOOKING-TIME');
  });

  it('falls back to booking details only for snapshot fields that are empty', () => {
    const v = buildInvoiceView(invoice({ customerEmail: '', customerName: '' }), booking(), COMPANY);
    expect(v.customer.email).toBe('live@example.invalid');
    expect(v.customer.name).toBe('BOOKING-TIME Name');
    expect(v.customer.state).toBe('Karnataka');
  });

  it('takes the CGST/SGST vs IGST decision from the stored breakdown, not a state guess', () => {
    // booking state is Uttar Pradesh (a "same-state" guess) but the invoice recorded an interstate supply
    const v = buildInvoiceView(invoice({ gstBreakdown: { cgst: 0, sgst: 0, igst: 72, isInterstate: true } }), booking(), COMPANY);
    expect(v.tax).toMatchObject({ split: 'igst', igst: 72, cgst: 0, sgst: 0 });
    expect(v.tax.totalLabel).toBe('IGST (18%)');
    expect(view.tax.totalLabel).toBe('GST — CGST + SGST (18%)');
  });

  it('does not invent a CGST/SGST split when no breakdown was stored', () => {
    const v = buildInvoiceView(invoice({ gstBreakdown: undefined }), booking(), COMPANY);
    expect(v.tax.split).toBeNull();
    expect(v.tax.total).toBe(72);
    expect(v.tax.totalLabel).toBe('GST (18%)');
  });

  it('shows the payment breakdown of THIS invoice, including balance due', () => {
    expect(view.payment).toMatchObject({ orderTotal: 2492, previouslyPaid: 0, thisInvoice: 1000, outstanding: 1492, gateway: 'phonepe', merchantTransactionId: 'MT-TEST-1' });
    const second = buildInvoiceView(finalInvoice(), booking({ paymentStatus: 'FULLY_PAID' }), COMPANY);
    expect(second.invoiceNumber).toBe('INV-2026-000102');
    expect(second.payment).toMatchObject({ previouslyPaid: 1000, thisInvoice: 1492, outstanding: 0, status: 'FULLY_PAID' });
    expect(second.paymentTypeLabel).toBe('Final Payment');
  });
});

describe('seller identity', () => {
  it('uses the shared company config for booking invoices (they carry no seller snapshot — same as the website)', () => {
    const { seller } = buildInvoiceView(invoice(), booking(), COMPANY);
    expect(seller).toMatchObject({ fromSnapshot: false, gstin: COMPANY.gstin, pan: COMPANY.pan, addr1: COMPANY.addr1, name: 'ZUTSAV PVT. LTD.' });
  });

  it('prefers a persisted sellerSnapshot and never mixes it with the config identity', () => {
    const snap = { legalName: 'Snapshot Legal Pvt Ltd', gstin: '29SNAPSHOT0000Z1', pan: 'SNAPSHOT00', address: '9 Snapshot Rd', state: 'Karnataka' };
    const { seller } = buildInvoiceView(invoice({ sellerSnapshot: snap }), booking(), COMPANY);
    expect(seller).toMatchObject({ fromSnapshot: true, name: 'Snapshot Legal Pvt Ltd', gstin: '29SNAPSHOT0000Z1', pan: 'SNAPSHOT00', addr1: '9 Snapshot Rd', addr2: 'Karnataka' });
    expect(seller.gstin).not.toBe(COMPANY.gstin);
    expect(seller.pan).not.toBe(COMPANY.pan);
  });

  it('ignores an empty snapshot object', () => {
    expect(buildInvoiceView(invoice({ sellerSnapshot: { legalName: '', gstin: '' } }), booking(), COMPANY).seller.fromSnapshot).toBe(false);
  });
});

describe('kit lines never contradict the persisted kit amount', () => {
  const pricing = pricingOf(invoice());
  const two = (a, b) => booking({ kitIds: [{ name: 'Kit A', discountPrice: a }, { name: 'Kit B', discountPrice: b }], kitId: null });

  it('lists each kit when current prices add up to the invoiced kit amount', () => {
    const lines = buildLineItems(invoice(), two(100, 200), pricing).filter((l) => l.sub === 'Pooja samagri kit');
    expect(lines.map((l) => [l.desc, l.amt])).toEqual([['Kit A', 100], ['Kit B', 200]]);
  });

  it('collapses to one combined line with the persisted amount when catalog prices have since changed', () => {
    const lines = buildLineItems(invoice(), two(150, 250), pricing);
    const kit = lines.filter((l) => /^Samagri Kits/.test(l.desc));
    expect(kit).toHaveLength(1);
    expect(kit[0]).toMatchObject({ desc: 'Samagri Kits (2)', sub: 'Kit A, Kit B', amt: 300 });
  });

  it('shows a single unnamed kit line when the booking has no kit documents', () => {
    const lines = buildLineItems(invoice(), booking({ kitId: null, kitIds: [] }), pricing);
    expect(lines.find((l) => l.desc === 'Samagri Kit').amt).toBe(300);
  });
});

describe('status, cancellation and missing data', () => {
  it('maps cancelled invoices/bookings and explains what happened to the money', () => {
    expect(resolvePaymentStatus({ status: 'cancelled' }, booking())).toBe('CANCELLED');
    expect(resolvePaymentStatus(invoice(), booking({ status: 'cancelled' }))).toBe('CANCELLED');
    expect(cancelledPaymentNote(booking({ amountPaid: 0 }))).toBe('Not Applicable');
    expect(cancelledPaymentNote(booking({ refund: { status: 'completed' } }))).toBe('Refunded');
    expect(cancelledPaymentNote(booking({ refund: { status: 'pending' } }))).toBe('Refund Pending');
    expect(cancelledPaymentNote(booking({ refund: { status: 'none' } }))).toBe('Payment Cancelled');
    const v = buildInvoiceView(invoice({ status: 'cancelled' }), booking({ refund: { status: 'pending' } }), COMPANY);
    expect(v.payment).toMatchObject({ status: 'CANCELLED', cancelledNote: 'Refund Pending', outstanding: 0 });
  });

  it('falls back through booking payment status, then lifecycle status', () => {
    expect(resolvePaymentStatus(invoice(), booking({ paymentStatus: 'FULLY_PAID' }))).toBe('FULLY_PAID');
    expect(resolvePaymentStatus(invoice(), booking({ paymentStatus: undefined, status: 'completed' }))).toBe('FULLY_PAID');
    expect(resolvePaymentStatus(invoice(), booking({ paymentStatus: undefined, status: 'pending_payment' }))).toBe('PENDING');
    expect(resolvePaymentStatus(invoice(), null)).toBe('UNKNOWN');
  });

  it('renders a sparse invoice without crashing or fabricating values', () => {
    const sparse = { invoiceNumber: 'INV-2026-000999', paymentType: 'FULL', amountPaid: 500, grandTotal: 500 };
    const v = buildInvoiceView(sparse, null, COMPANY);
    expect(v.invoiceNumber).toBe('INV-2026-000999');
    expect(v.bookingNumber).toBe('');
    expect(v.invoiceDate).toBeNull();
    expect(v.customer).toMatchObject({ name: '', phone: '', city: '' });
    expect(v.placeOfSupply).toBe('INDIA');
    expect(v.lineItems).toEqual([expect.objectContaining({ amt: 500 })]); // one line = the persisted total
    expect(v.tax).toMatchObject({ total: 0, rows: [], split: null });
    expect(v.payment.status).toBe('UNKNOWN');
  });

  it('treats null / non-numeric amounts as 0 and uses kitGST + platformGST when totalGST is absent', () => {
    const p = pricingOf({ poojaAmount: null, platformFee: 'abc', kitGST: 10, platformGST: 8 });
    expect(p).toMatchObject({ poojaAmount: 0, platformFee: 0, totalTax: 18, grandTotal: 0 });
  });

  it('summarises invoices for the history list', () => {
    expect(summariseInvoice(finalInvoice({ status: 'cancelled' }))).toEqual({
      id: 'inv-b', invoiceNumber: 'INV-2026-000102', label: 'Final Payment', status: 'cancelled',
      date: '2026-03-05T11:00:00.000Z', amountPaid: 1492, merchantTransactionId: 'MT-TEST-2',
    });
  });
});

describe('buildBookingInvoiceHtml (PDF/share)', () => {
  it('is built from the selected invoice only', () => {
    const html = buildBookingInvoiceHtml(buildInvoiceView(finalInvoice(), booking({ paymentStatus: 'FULLY_PAID' }), COMPANY));
    expect(html).toContain('INV-2026-000102');
    expect(html).not.toContain('INV-2026-000101');
    expect(html).toContain('ZB-2026-0042');   // as the Order No, separate from the invoice number
    expect(html).toContain('Final Payment');
    expect(html).toContain(COMPANY.gstin);
  });

  it('prints the snapshot seller instead of the config seller when a snapshot exists', () => {
    const snap = { legalName: 'Snapshot Legal Pvt Ltd', gstin: '29SNAPSHOT0000Z1', address: '9 Snapshot Rd', state: 'Karnataka' };
    const html = buildBookingInvoiceHtml(buildInvoiceView(invoice({ sellerSnapshot: snap }), booking(), COMPANY));
    expect(html).toContain('Snapshot Legal Pvt Ltd');
    expect(html).toContain('29SNAPSHOT0000Z1');
    expect(html).not.toContain(COMPANY.gstin);
  });

  it('escapes customer-controlled text', () => {
    const html = buildBookingInvoiceHtml(buildInvoiceView(invoice({ customerName: '<script>alert(1)</script> & "Co"' }), booking(), COMPANY));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;');
  });

  it('marks cancelled invoices and shows the stored tax split', () => {
    const html = buildBookingInvoiceHtml(buildInvoiceView(invoice({ status: 'cancelled' }), booking(), COMPANY));
    expect(html).toContain('CANCELLED');
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
  });
});
