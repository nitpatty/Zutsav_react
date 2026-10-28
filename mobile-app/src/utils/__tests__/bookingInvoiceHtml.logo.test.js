import { buildInvoiceView } from '../bookingInvoice';
import { buildBookingInvoiceHtml } from '../bookingInvoiceHtml';
import { formatCurrency } from '../helpers';
import { COMPANY, booking, invoice, finalInvoice } from './invoiceFixtures';

const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const LOGO = `data:image/png;base64,${B64}`;

const view = (inv = invoice(), b = booking(), company = COMPANY) => buildInvoiceView(inv, b, company);
const plain = (v = view()) => buildBookingInvoiceHtml(v);
const withLogo = (v = view(), logoDataUri = LOGO) => buildBookingInvoiceHtml(v, { logoDataUri });
const text = (h) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/\s*\n\s*/g, '\n');
const lines = (h) => text(h).split('\n').filter(Boolean);

describe('invoice PDF header logo', () => {
  it('embeds the logo as a data URI image in the header, before the invoice title', () => {
    const h = withLogo();
    expect(h).toContain(`<img src="${LOGO}"`);
    expect(h.match(/<img /g)).toHaveLength(1);
    expect(h.indexOf('<img')).toBeLessThan(h.indexOf('Tax Invoice'));
    expect(h.indexOf('<img')).toBeLessThan(h.indexOf('Bill To'));
    expect(h.indexOf('<img')).toBeGreaterThan(h.indexOf('<body>'));
  });

  it('sizes it like the website (height 38, auto width, max 190, contained) with no fixed positioning or overflow risk', () => {
    const tag = withLogo().match(/<img [^>]*>/)[0];
    expect(tag).toContain('height:38px');
    expect(tag).toContain('width:auto');
    expect(tag).toContain('max-width:190px');
    expect(tag).toContain('object-fit:contain');
    expect(tag).toContain('display:block');
    expect(/position\s*:|float\s*:|margin-left\s*:\s*-|z-index/i.test(tag)).toBe(false);
    expect(tag).toContain('alt="Zutsav"');
    expect(tag).not.toMatch(/(^|[;"\s])width:\s*\d+px/);                // no fixed width that could stretch it (max-width only)
  });

  it('sits in the left brand cell, so it cannot overlap the title/meta cell or the seller details', () => {
    const h = withLogo();
    const left = h.slice(h.indexOf('<td style="width:52%'), h.indexOf('<td style="text-align:right">'));
    expect(left).toContain('<img');
    expect(left).toContain('PVT. LTD.');
    expect(left).toContain(COMPANY.addr1);
    expect(left).toContain(COMPANY.gstin);
    expect(left).not.toContain('Tax Invoice');
    expect(left).not.toContain('INV-2026-000101');
  });

  it('like the website, shows the legal suffix under the logo instead of repeating the brand name', () => {
    const t = lines(withLogo());
    expect(t).toContain('PVT. LTD.');
    expect(t).not.toContain('ZUTSAV PVT. LTD.');
    expect(lines(plain())).toContain('ZUTSAV PVT. LTD.');
  });

  it('a seller whose name does not start with the brand word (e.g. a seller snapshot) is still printed in full', () => {
    const v = view(invoice({ sellerSnapshot: { legalName: 'Snapshot Legal Pvt Ltd', gstin: '29SNAPSHOT0000Z1', address: '9 Snapshot Rd', state: 'Karnataka' } }));
    expect(lines(withLogo(v))).toContain('Snapshot Legal Pvt Ltd');
  });

  it('a seller named just "ZUTSAV" does not produce an empty line', () => {
    const v = view(invoice(), booking(), { ...COMPANY });
    v.seller = { ...v.seller, name: 'ZUTSAV' };
    expect(lines(withLogo(v))).toContain('ZUTSAV');
  });
});

describe('the logo changes nothing but the brand block', () => {
  const pairs = [
    ['advance invoice', view(invoice(), booking())],
    ['final invoice', view(finalInvoice(), booking())],
    ['cancelled invoice', view(invoice({ status: 'cancelled' }), booking({ status: 'cancelled' }))],
    ['CGST/SGST invoice', view(invoice({ gstBreakdown: { cgst: 36, sgst: 36, igst: 0, isInterstate: false } }), booking())],
  ];

  it.each(pairs)('%s: every line of the text-only document is still present, with identical values and order', (_n, v) => {
    const a = lines(plain(v)).filter((l) => l !== 'ZUTSAV PVT. LTD.');
    const b = lines(withLogo(v)).filter((l) => l !== 'PVT. LTD.');
    expect(b).toEqual(a);
  });

  it.each(pairs)('%s: removing the brand block gives byte-identical HTML', (_n, v) => {
    const strip = (h) => h.replace(/<img [^>]*\/>\s*<div[^>]*>[^<]*<\/div>|<div style="font-family:Georgia,serif;font-size:21px[^>]*>[^<]*<\/div>/, '<BRAND/>');
    expect(strip(withLogo(v))).toBe(strip(plain(v)));
    expect(strip(plain(v))).toContain('<BRAND/>');
  });

  it('keeps the amounts, GST rows and payment identifiers of the selected invoice', () => {
    const t = text(withLogo(view(finalInvoice(), booking())));
    ['INV-2026-000102', 'ZB-2026-0042', 'MT-TEST-2', 'GT-TEST-2', 'Total Tax Collected', 'GRAND TOTAL', 'Previously Paid'].forEach((s) => expect(t).toContain(s));
    [2492, 1492, 1000, 72, 36].forEach((n) => expect(t).toContain(formatCurrency(n)));
  });

  it('the supplied-sample figures are unchanged (₹2,375 subtotal, IGST ₹67.5, ₹2,442.5)', () => {
    const v = view(invoice({ poojaAmount: 2000, kitAmount: 275, kitGST: 49.5, platformFee: 100, platformGST: 18, totalGST: 67.5, grandTotal: 2442.5, amountPaid: 2442.5,
      paymentType: 'FULL', previouslyPaid: 0, outstandingAfter: 0, gstBreakdown: { cgst: 0, sgst: 0, igst: 67.5, isInterstate: true }, urgentSurcharge: 0 }),
    booking({ isUrgent: false, bookingType: 'normal', withKit: true }));
    const t = text(withLogo(v));
    [2375, 67.5, 2442.5].forEach((n) => expect(t).toContain(formatCurrency(n)));
  });
});

describe('an absent, invalid or untrusted logo gives the existing text-only header', () => {
  const reference = plain();

  it.each([
    ['no options', undefined],
    ['an empty options object', {}],
    ['a null logo', { logoDataUri: null }],
    ['an undefined logo', { logoDataUri: undefined }],
    ['an empty string', { logoDataUri: '' }],
  ])('%s', (_n, options) => {
    const h = options === undefined ? buildBookingInvoiceHtml(view()) : buildBookingInvoiceHtml(view(), options);
    expect(h).toBe(reference);
    expect(h).not.toContain('<img');
    expect(lines(h)).toContain('ZUTSAV PVT. LTD.');
  });

  it.each([
    ['a remote https URL', 'https://example.com/logo.png'],
    ['a remote http URL', 'http://192.168.0.192:5000/uploads/logos/logo.png'],
    ['a file URL', 'file:///data/user/0/com.zutsav.app/logo.png'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an HTML data URI', `data:text/html;base64,${B64}`],
    ['an unsupported image type', `data:image/gif;base64,${B64}`],
    ['a non-base64 data URI', 'data:image/png,<script>alert(1)</script>'],
    ['an attribute-breaking payload', `${LOGO}" onerror="alert(1)`],
    ['markup', '<img src=x onerror=alert(1)>'],
    ['a number', 12345],
    ['an object', { uri: LOGO }],
    ['an over-size data URI', `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`],
  ])('%s is never embedded', (_n, bad) => {
    const h = buildBookingInvoiceHtml(view(), { logoDataUri: bad });
    expect(h).toBe(reference);
    expect(h).not.toContain('<img');
    expect(h).not.toContain('onerror');
  });
});

describe('determinism', () => {
  it('the same invoice data and the same logo always give the same bytes', () => {
    expect(withLogo()).toBe(withLogo());
    expect(withLogo()).not.toBe(plain());
  });

  it('has no external resource: the only image is the embedded data URI', () => {
    const h = withLogo();
    expect(/https?:\/\/|<script|<link/i.test(h)).toBe(false);
    expect([...h.matchAll(/<img [^>]*src="([^"]*)"/g)].map((m) => m[1])).toEqual([LOGO]);
  });
});
