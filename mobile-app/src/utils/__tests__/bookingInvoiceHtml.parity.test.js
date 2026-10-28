import fs from 'fs';
import path from 'path';
import { buildInvoiceView, WITHOUT_KIT } from '../bookingInvoice';
import { buildBookingInvoiceHtml, INVOICE_PAGE, esc } from '../bookingInvoiceHtml';
import { formatCurrency, amtWords, fmtInvoiceDate, fmtInvoiceLong } from '../helpers';
import { COMPANY, booking, invoice, finalInvoice } from './invoiceFixtures';

// Website/mobile PDF parity (docs/INVOICE_SOURCE_OF_TRUTH_AUDIT.md, Option C). The fixture reproduces the SHAPE and the amounts of the
// invoice the owner compared (single full payment, IGST, one kit); every name, number and id below is synthetic.
const SAMPLE_ISSUE = '2026-10-28T13:07:00.000Z';
const SAMPLE_SERVICE = '2026-10-31T00:00:00.000Z';

const sampleInvoice = (over = {}) => invoice({
  _id: 'inv-s', invoiceNumber: 'INV-2026-000037', bookingNumber: 'ZUT-SAMPLE-1', poojaName: 'Ganesh Laxmi Puja',
  scheduledDate: SAMPLE_SERVICE, scheduledTime: '08:00', invoiceDate: SAMPLE_ISSUE,
  customerName: 'Sample Customer', customerPhone: '9000000001', customerEmail: 'sample@example.invalid',
  customerAddress: '1 Sample Road', customerCity: '', customerState: '', customerPincode: '110000',
  paymentType: 'FULL', paymentGateway: 'phonepe', merchantTransactionId: 'ZUT_SAMPLE_MERCHANT', gatewayTransactionId: 'GATEWAY-SAMPLE-ID',
  amountPaid: 2442.5, previouslyPaid: 0, outstandingAfter: 0, grandTotal: 2442.5,
  poojaAmount: 2000, kitAmount: 275, kitGST: 49.5, platformFee: 100, platformGST: 18, urgentSurcharge: 0, totalGST: 67.5,
  gstBreakdown: { cgst: 0, sgst: 0, igst: 67.5, isInterstate: true },
  ...over,
});
const sampleBooking = (over = {}) => booking({
  bookingNumber: 'ZUT-SAMPLE-1', status: 'paid', paymentStatus: 'FULLY_PAID', amountPaid: 2442.5, remainingAmount: 0,
  scheduledDate: SAMPLE_SERVICE, scheduledTime: '08:00', language: 'Hindi', withKit: true, isUrgent: false, bookingType: 'normal',
  poojaId: { _id: 'pj1', name: 'CURRENT-CATALOG Name' }, panditId: { _id: 'pd1', name: 'Pandit Sample' },
  kitId: { _id: 'k1', name: 'basic kit', discountPrice: 275 }, kitIds: [],
  userDetails: { name: 'LIVE NAME', phone: '9000000002', email: 'live@example.invalid', address: '1 Sample Road', city: '', state: '', pincode: '110000' },
  ...over,
});
const html = (inv = sampleInvoice(), b = sampleBooking(), company = COMPANY) => buildBookingInvoiceHtml(buildInvoiceView(inv, b, company));
const text = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/\s*\n\s*/g, '\n');
const idx = (h, s) => { const i = h.indexOf(s); expect(i).toBeGreaterThan(-1); return i; };

describe('the supplied-sample invoice (synthetic): identity, dates and persisted amounts', () => {
  const h = html();

  it('prints the official invoice number and the (separate) order number', () => {
    expect(h).toContain('INV-2026-000037');
    expect(h).toContain('Order No');
    expect(text(h)).toContain('ZUT-SAMPLE-1');
    expect(h).toContain('Full Payment');
  });

  it('prints the issue date, the service date and the place of supply as before', () => {
    expect(h).toContain(fmtInvoiceDate(SAMPLE_ISSUE));
    expect(h).toContain(fmtInvoiceLong(SAMPLE_SERVICE));
    expect(h).toContain('Issue Date');
    expect(h).toContain('Service Date');
    expect(h).toContain('Place of Supply');
    expect(h).toContain('INDIA');                                  // no state/city on the invoice or booking → the existing fallback, nothing invented
  });

  it('prints the persisted amounts: ₹2,375 subtotal, IGST ₹67.5, grand total ₹2,442.5', () => {
    const t = text(h);
    expect(t).toContain(formatCurrency(2375));
    expect(t).toContain('IGST (18%)');
    expect(t).toContain(formatCurrency(67.5));
    expect(t).toContain(formatCurrency(2442.5));
    expect(t).toContain('GRAND TOTAL');
    expect(t).toContain(amtWords(2442.5));
  });

  it('prints the three line items with their persisted rates and amounts', () => {
    const t = text(h);
    ['Ganesh Laxmi Puja', 'basic kit', 'Platform Convenience Fee'].forEach((n) => expect(t).toContain(n));
    [2000, 275, 100].forEach((n) => expect(t).toContain(formatCurrency(n)));
    expect(t).toContain('Unit Price');
  });

  it('the tax summary carries the persisted taxable amounts and taxes, and one IGST column (no CGST/SGST)', () => {
    const t = text(h);
    expect(t).toContain('Tax Summary');
    expect(t).toContain('Taxable Amount');
    expect(t).toContain('Platform Convenience Fee — GST');
    expect(t).toContain('basic kit — GST');                        // the website's wording: the kit's own name
    expect(t).toContain(formatCurrency(49.5));
    expect(t).toContain(formatCurrency(18));
    expect(t).toContain('Total Tax Collected');
    expect(h).toContain('>IGST<');
    expect(h).not.toMatch(/>CGST<|>SGST</);
  });

  it('the payment section shows the order total, this invoice, the gateway and both transaction ids, and the status', () => {
    const t = text(h);
    ['Order Total', 'This Invoice', 'Payment Type', 'Payment Gateway', 'PHONEPE', 'Merchant Txn ID', 'ZUT_SAMPLE_MERCHANT', 'Gateway Txn ID', 'GATEWAY-SAMPLE-ID', 'Paid in Full'].forEach((s) => expect(t).toContain(s));
    expect(t).not.toContain('Previously Paid');
    expect(t).not.toContain('Balance Due');
  });

  it('the booking-details panel carries service, date, time, language, type, location, Pandit, kit and booking id', () => {
    const t = text(h);
    ['Booking Details', 'Service', 'Date', 'Time', '08:00', 'Language', 'Hindi', 'Booking Type', 'Normal', 'Location', '1 Sample Road', 'Pandit', 'Pandit Sample', 'Samagri Kit', 'Booking ID'].forEach((s) => expect(t).toContain(s));
  });

  it('keeps the website\'s section order', () => {
    const order = ['Tax Invoice', 'Bill To', 'Booking Details', 'Order Items', 'Payment Details', 'Tax Summary', 'Amount in Words', 'Thank you for choosing Zutsav'].map((s) => idx(h, s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the footer carries the tagline, the configured contacts and the existing computer-generated line', () => {
    const t = text(h);
    ['Thank you for choosing Zutsav!', 'May your prayers be answered with divine grace.', 'Support', 'WhatsApp', 'Website', COMPANY.email, COMPANY.phone, COMPANY.web, 'This is a computer-generated invoice'].forEach((s) => expect(t).toContain(s));
  });

  it('the seller identity still comes from the configured company (unchanged source)', () => {
    const t = text(h);
    ['ZUTSAV PVT. LTD.', COMPANY.addr1, COMPANY.addr2, COMPANY.gstin, COMPANY.pan].forEach((s) => expect(t).toContain(s));
  });
});

describe('content that has no authoritative source is NOT printed (owner/compliance decisions pending)', () => {
  it.each([
    ['Payment Method', /Payment Method/i],
    ['a UPI claim', /UPI/],
    ['customer GSTIN wording', /Unregistered/i],
    ['the ITC statement', /Input Tax Credit|\bITC\b/],
    ['a render-time generated timestamp', /Generated:/i],
    ['a separate Service At block', /Service At/i],
  ])('no %s', (_n, re) => {
    expect(re.test(text(html()))).toBe(false);
    expect(re.test(text(html(sampleInvoice({ paymentType: 'PARTIAL', outstandingAfter: 500 }))))).toBe(false);
  });

  it('prints no discount, coupon or coin lines — the invoice has no such fields', () => {
    expect(/discount|coupon|coin/i.test(text(html()))).toBe(false);
  });

  it('prints no hard-coded tax rate: the rate is the one derived from the stored amounts', () => {
    const h = html(sampleInvoice({ kitAmount: 1000, kitGST: 120, platformFee: 100, platformGST: 12, totalGST: 132, grandTotal: 3232, amountPaid: 3232,
      gstBreakdown: { cgst: 0, sgst: 0, igst: 132, isInterstate: true } }));
    const t = text(h);
    expect(t).toContain('12%');
    expect(t).not.toContain('18%');
  });
});

describe('financial integrity: the document represents the persisted invoice, whatever the layout', () => {
  it('every amount equals the view model\'s (and nothing is recalculated from the booking)', () => {
    const b = sampleBooking({ amountPaid: 1, grandTotal: 1, remainingAmount: 999 });      // a booking that disagrees with the invoice
    const view = buildInvoiceView(sampleInvoice(), b, COMPANY);
    const t = text(buildBookingInvoiceHtml(view));
    expect(view.pricing.grandTotal).toBe(2442.5);
    expect(t).toContain(formatCurrency(2442.5));
    expect(t).not.toContain('Balance Due');
  });

  it('a final payment does not double-count the advance: previously paid is shown separately and this invoice is its own amount', () => {
    const t = text(html(finalInvoice(), booking()));
    expect(t).toContain('Previously Paid');
    expect(t).toContain(formatCurrency(1000));
    expect(t).toContain(formatCurrency(1492));                    // this invoice
    expect(t).toContain(formatCurrency(2492));                    // order total
    expect(t).not.toContain('Balance Due');
    expect(t).toContain(amtWords(1492));
  });

  it('an advance invoice shows its balance due', () => {
    const t = text(html(invoice(), booking()));
    expect(t).toContain('Balance Due');
    expect(t).toContain(formatCurrency(1492));
    expect(t).not.toContain('Previously Paid');
  });

  it('CGST/SGST invoices (stored breakdown) print the split, half of each row\'s tax per column', () => {
    const h = html(sampleInvoice({ gstBreakdown: { cgst: 33.75, sgst: 33.75, igst: 0, isInterstate: false } }));
    expect(h).toContain('>CGST<');
    expect(h).toContain('>SGST<');
    expect(h).not.toContain('>IGST<');
    const t = text(h);
    expect(t).toContain(formatCurrency(24.75));                   // kit GST 49.5 / 2
    expect(t).toContain(formatCurrency(9));                       // platform GST 18 / 2
    expect(t).toContain(formatCurrency(33.75));                   // stored total per component
  });

  it('with no stored breakdown it neither invents a split nor a split column', () => {
    const h = html(sampleInvoice({ gstBreakdown: undefined }));
    expect(h).not.toMatch(/>IGST<|>CGST<|>SGST</);
    expect(text(h)).toContain(formatCurrency(67.5));
  });

  it('multi-kit: a changed catalog price cannot change the persisted lines or totals', () => {
    const two = [{ name: 'Kit A', discountPrice: 400 }, { name: 'Kit B', discountPrice: 400 }];   // today's prices (800) ≠ invoiced 275
    const h = html(sampleInvoice(), sampleBooking({ kitId: undefined, kitIds: two }));
    const t = text(h);
    expect(t).toContain('Samagri Kits (2)');
    expect(t).toContain(formatCurrency(275));
    expect(t).not.toContain(formatCurrency(400));
    expect(t).toContain(formatCurrency(2442.5));
    expect(t).toContain('Kit A — GST'.replace('Kit A', 'Kit A, Kit B'));
  });

  it('multi-kit whose catalog prices still add up is listed per kit, summing to the persisted amount', () => {
    const two = [{ name: 'Kit A', discountPrice: 100 }, { name: 'Kit B', discountPrice: 175 }];
    const t = text(html(sampleInvoice(), sampleBooking({ kitId: undefined, kitIds: two })));
    expect(t).toContain('Kit A');
    expect(t).toContain('Kit B');
    expect(t).toContain(formatCurrency(2375));
  });

  it('is a pure function of the view: a different clock gives byte-identical output', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2030-01-01T00:00:00Z'));
      const a = html();
      jest.setSystemTime(new Date('2041-06-06T12:00:00Z'));
      expect(html()).toBe(a);
    } finally { jest.useRealTimers(); }
  });
});

describe('missing optional values render safely and are never invented', () => {
  it('no gateway ids: no ids and no gateway box are printed, and no placeholder text leaks', () => {
    const h = html(sampleInvoice({ paymentGateway: '', merchantTransactionId: '', gatewayTransactionId: '' }));
    const t = text(h);
    ['Payment Gateway', 'Merchant Txn ID', 'Gateway Txn ID'].forEach((s) => expect(t).not.toContain(s));
    expect(/undefined|null|NaN/.test(h)).toBe(false);
  });

  it('only a merchant id: the gateway id is not fabricated', () => {
    const t = text(html(sampleInvoice({ gatewayTransactionId: '' })));
    expect(t).toContain('Merchant Txn ID');
    expect(t).not.toContain('Gateway Txn ID');
  });

  it('a booking without a kit says so and the tax row falls back to the generic kit label', () => {
    const t = text(html(sampleInvoice(), sampleBooking({ withKit: false, kitId: null, kitIds: [] })));
    expect(t).toContain(WITHOUT_KIT);
    expect(t).toContain('Samagri Kit — GST');
  });

  it('a blank language is left out rather than defaulted to Hindi; urgent bookings say URGENT', () => {
    const t = text(html(sampleInvoice(), sampleBooking({ language: '', isUrgent: true, bookingType: 'urgent' })));
    expect(t).not.toContain('Hindi');
    expect(t).not.toContain('Language');
    expect(t).toContain('URGENT');
  });

  it('a sparse invoice and a missing booking still render, with no "undefined"/"null"', () => {
    const sparse = { _id: 'x', invoiceNumber: 'INV-2026-000999', paymentType: 'FULL', grandTotal: 500, amountPaid: 500 };
    [buildBookingInvoiceHtml(buildInvoiceView(sparse, null, COMPANY)), buildBookingInvoiceHtml(buildInvoiceView(sparse, {}, COMPANY))].forEach((h) => {
      expect(h).toContain('INV-2026-000999');
      expect(h).toContain(formatCurrency(500));
      expect(/undefined|null|NaN/.test(h)).toBe(false);
    });
  });

  it('a customer without e-mail or phone prints no empty lines for them', () => {
    const h = html(sampleInvoice({ customerEmail: '', customerPhone: '' }), sampleBooking({ userDetails: { name: 'Only Name' } }));
    expect(h).not.toContain('sample@example.invalid');
    expect(h).not.toContain('live@example.invalid');
    expect(text(h)).toContain('Sample Customer');
  });
});

describe('historical and special invoice states stay safe', () => {
  it('a cancelled invoice is marked in the header and the status block, with the refund note and no balance due', () => {
    const h = html(sampleInvoice({ status: 'cancelled', outstandingAfter: 500 }), sampleBooking({ status: 'cancelled', amountPaid: 2442.5, refund: { status: 'completed' } }));
    const t = text(h);
    expect(t).toContain('Full Payment · CANCELLED');
    expect(t).toContain('Cancelled');
    expect(t).toContain('Payment: Refunded');
    expect(t).not.toContain('Balance Due');
  });

  it('an archived invoice shows its status instead of looking active', () => {
    expect(text(html(sampleInvoice({ status: 'archived' })))).toContain('Full Payment · ARCHIVED');
  });

  it('a legacy invoice with no component amounts carries one line with the persisted total', () => {
    const legacy = sampleInvoice({ isLegacy: true, poojaAmount: 0, kitAmount: 0, kitGST: 0, platformFee: 0, platformGST: 0, totalGST: 0, gstBreakdown: undefined, grandTotal: 1500, amountPaid: 1500 });
    const h = html(legacy);
    const t = text(h);
    expect(t).toContain('Ganesh Laxmi Puja');
    expect(t).toContain(formatCurrency(1500));
    expect(t).not.toContain('Tax Summary');
  });

  it('a snapshot seller replaces the configured identity completely', () => {
    const t = text(html(sampleInvoice({ sellerSnapshot: { legalName: 'Snapshot Legal Pvt Ltd', gstin: '29SNAPSHOT0000Z1', pan: 'SNAPPAN', address: '9 Snapshot Rd', state: 'Karnataka' } })));
    expect(t).toContain('Snapshot Legal Pvt Ltd');
    expect(t).toContain('29SNAPSHOT0000Z1');
    expect(t).not.toContain(COMPANY.gstin);
    expect(t).not.toContain(COMPANY.addr1);
  });
});

describe('selection: the document follows the view it is given', () => {
  it('two invoices of one booking produce two different documents, each with only its own identity and payment ids', () => {
    const b = booking();
    const adv = html(invoice(), b);
    const fin = html(finalInvoice(), b);
    expect(adv).toContain('INV-2026-000101');
    expect(adv).toContain('MT-TEST-1');
    expect(adv).not.toContain('INV-2026-000102');
    expect(adv).not.toContain('MT-TEST-2');
    expect(fin).toContain('INV-2026-000102');
    expect(fin).toContain('GT-TEST-2');
    expect(fin).not.toContain('INV-2026-000101');
    expect(fin).not.toContain('GT-TEST-1');
  });
});

describe('document safety and layout contract', () => {
  it('escapes every dynamic field that is new in the document', () => {
    const evil = '<img src=x onerror=alert(1)>&"\'';
    const h = html(
      sampleInvoice({ merchantTransactionId: evil, gatewayTransactionId: evil, customerAddress: evil, customerEmail: evil }),
      sampleBooking({ language: evil, panditId: { name: evil }, kitId: { name: evil, discountPrice: 275 } }),
    );
    expect(h).not.toContain('<img src=x');
    expect(h).toContain(esc(evil));
  });

  it('is A4 portrait: the print options are 595×842 and the markup requests exact colours and unbroken blocks', () => {
    expect(INVOICE_PAGE).toEqual({ width: 595, height: 842 });
    const h = html();
    expect(h).toContain('print-color-adjust: exact');
    expect(h).toContain('page-break-inside: avoid');
    expect(h).toContain('overflow-wrap: anywhere');
    expect(h).toContain('<meta charset="utf-8"/>');
  });

  it('has no external resource (no remote logo/font/script) to fail or leak', () => {
    expect(/https?:\/\/|<script|<link|<img/i.test(html())).toBe(false);
  });

  it('does not depend on the localization layer', () => {
    ['bookingInvoiceHtml.js', 'bookingInvoice.js'].forEach((f) => {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      expect(/i18n|useTranslation|getTranslator/.test(src)).toBe(false);
    });
  });
});
