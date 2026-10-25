/**
 * Invoice share links — admin lifecycle, public token access, DTO allowlist,
 * logging hygiene and rate limiting.
 *
 * Uses its own database (node --test runs files in parallel). Test data only.
 *
 * NOTE: the public router counts FAILED lookups per IP (max 20 / 15 min,
 * in-memory), so the failing-token probes below are kept well under that
 * budget and the final test deliberately exhausts it.
 */

process.env.PAYMENT_MODE = 'mock';
process.env.MOCK_PAYMENT_OUTCOME = 'success';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'invoice-share-test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http   = require('http');
const mongoose = require('mongoose');
const jwt    = require('jsonwebtoken');

const Invoice          = require('../src/models/Invoice');
const InvoiceCounter   = require('../src/models/InvoiceCounter');
const InvoiceShareLink = require('../src/models/InvoiceShareLink');
const OfflinePayment   = require('../src/models/OfflinePayment');
const PaymentLedger    = require('../src/models/PaymentLedger');
const AdminAuditLog    = require('../src/models/AdminAuditLog');
const Booking          = require('../src/models/Booking');
const Pooja            = require('../src/models/Pooja');
const Product          = require('../src/models/Product');
const User             = require('../src/models/User');
const SystemSettings   = require('../src/models/SystemSettings');
const settingsService  = require('../src/utils/settingsService');
const svc              = require('../src/services/invoiceShareService');

const TEST_URI = process.env.MONGO_URI_TEST_INVOICE_SHARE
  || 'mongodb://127.0.0.1:27017/zutsav_invoice_share_test';

let server, port, adminToken, userToken, panditToken, customerUser;

const url = (p) => `http://127.0.0.1:${port}${p}`;
const api = (method, path, body, token = adminToken) =>
  fetch(url(path), {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
// Public calls never carry credentials.
const pub = (token, init) => fetch(url(`/api/public/invoices/${token}`), init);

const rnd = () => Math.random().toString(36).slice(2, 8);
let keySeq = 0;
const nextKey = () => `share-${Date.now()}-${++keySeq}-${rnd()}`;

const tokenOf = (share) => share.path.split('/').pop();
const NOT_AVAILABLE = /invalid or is no longer available/;

async function configureRegistration() {
  await SystemSettings.findOneAndUpdate({}, { $set: { companyBillingRegistrations: [{
    id: 'reg_test', legalName: 'Zutsav Test Enterprises', gstin: '07AACCZ8054C1ZB', pan: 'AACCZ8054C',
    address: 'Test Address, New Delhi', state: 'Delhi', stateCode: '07', isActive: true, isDefault: true,
  }] } }, { upsert: true });
  settingsService.invalidate();
}

async function makeManualInvoice({ price = 100, taxRate = 0, customer = {}, extra = {} } = {}) {
  const n = rnd();
  const p = await Product.create({
    name: `Share Product ${n}`, slug: `share-product-${n}`, category: 'Test',
    price, stock: 50, taxRate, isActive: true,
  });
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: nextKey(),
    registrationId: 'reg_test',
    customer: { name: 'Priya Sharma', phone: '9876543210', email: 'priya@example.com', address: '12 Lotus Lane', state: 'Delhi', ...customer },
    items: [{ productId: p._id.toString(), quantity: 2 }],
    applyTax: false,
    ...extra,
  });
  const out = await res.json();
  assert.equal(res.status, 201, JSON.stringify(out));
  return { product: p, ...out };
}

let pooja;
async function makeBookingInvoice({ status = 'active', bookingStatus = 'paid', withBooking = true } = {}) {
  const n = rnd();
  const booking = withBooking ? await Booking.create({
    bookingNumber: `BK-${n}`,
    userId: customerUser._id,
    poojaId: pooja._id,
    userDetails: {
      name: 'Rahul Verma', phone: '9811122233', email: 'rahul@example.com',
      address: '5 Temple Road', city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001',
      latitude: 26.8, longitude: 80.9,
    },
    scheduledDate: new Date(Date.now() + 10 * 864e5),
    scheduledTime: '09:00',
    poojaAmount: 1000, platformFee: 100, platformGST: 18, grandTotal: 1118, amount: 1118,
    status: bookingStatus, paymentStatus: 'FULLY_PAID', amountPaid: 1118,
    phonePeMerchantTransactionId: `PHONEPE-MERCH-SECRET-${n}`,
    phonePeTransactionId: `PHONEPE-GW-SECRET-${n}`,
  }) : null;
  const invoice = await Invoice.create({
    invoiceNumber: `INV-2099-${String(Math.floor(Math.random() * 900000) + 100000)}`,
    source: 'booking',
    bookingId: booking ? booking._id : new mongoose.Types.ObjectId(),
    bookingNumber: `BK-${n}`,
    customerId: customerUser._id,
    customerName: 'Rahul Verma',
    paymentType: 'FULL', paymentGateway: 'phonepe',
    merchantTransactionId: `MTX-SECRET-${n}`, gatewayTransactionId: `GTX-SECRET-${n}`,
    amountPaid: 1118, outstandingAfter: 0,
    grandTotal: 1118, poojaAmount: 1000, platformFee: 100, platformGST: 18, totalGST: 18,
    gstBreakdown: { cgst: 0, sgst: 0, igst: 18, isInterstate: true },
    status,
    ipAddress: '10.9.8.7', generatedBy: 'system',
  });
  return { booking, invoice };
}

const createShare = async (invoiceId) => {
  const res = await api('POST', `/api/admin/invoices/${invoiceId}/share`);
  assert.ok([200, 201].includes(res.status), `create share → ${res.status}`);
  return (await res.json()).share;
};

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([Invoice.init(), InvoiceCounter.init(), OfflinePayment.init(), InvoiceShareLink.init()]);

  const admin = await User.create({ name: 'Share Admin', email: 'share-admin@example.com', phone: '9000000031', password: 'secret123', role: 'admin' });
  customerUser = await User.create({ name: 'Share Customer', email: 'share-user@example.com', phone: '9000000032', password: 'secret123', role: 'user' });
  const pandit = await User.create({ name: 'Share Pandit', email: 'share-pandit@example.com', phone: '9000000033', password: 'secret123', role: 'pandit' });
  const sign = (u) => jwt.sign({ id: u._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  adminToken = sign(admin); userToken = sign(customerUser); panditToken = sign(pandit);

  pooja = await Pooja.create({ name: 'Satyanarayan Katha', slug: 'satyanarayan-share', price: 1000, createdByRole: 'admin', approvalStatus: 'approved', isActive: true });

  const app = require('../src/app');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, () => { port = server.address().port; resolve(); }));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Promise.all([
    Invoice.deleteMany({}), InvoiceCounter.deleteMany({}), InvoiceShareLink.deleteMany({}),
    OfflinePayment.collection.deleteMany({}), PaymentLedger.deleteMany({}), Booking.deleteMany({}),
    Product.deleteMany({}), SystemSettings.deleteMany({}), AdminAuditLog.collection.deleteMany({}),
  ]);
  settingsService.invalidate();
  await configureRegistration();
});

/* ═══════════════════════════ ADMIN: CREATE / REUSE ═══════════════════════ */

test('an admin creates a share link; reopening Share reuses the same token', async () => {
  const { invoice } = await makeManualInvoice();
  const first = await api('POST', `/api/admin/invoices/${invoice._id}/share`);
  assert.equal(first.status, 201);
  const a = await first.json();
  assert.equal(a.reused, false);
  assert.match(a.share.path, /^\/share\/invoice\/[A-Za-z0-9_-]{43}$/);
  assert.equal(a.share.status, 'active');

  const again = await api('POST', `/api/admin/invoices/${invoice._id}/share`);
  assert.equal(again.status, 200);
  const b = await again.json();
  assert.equal(b.reused, true);
  assert.equal(b.share.path, a.share.path, 'reopening must not mint a new token');

  const state = await (await api('GET', `/api/admin/invoices/${invoice._id}/share`)).json();
  assert.equal(state.eligible, true);
  assert.equal(state.share.path, a.share.path);
  assert.equal(await InvoiceShareLink.countDocuments({ invoiceId: invoice._id }), 1);

  // The old token keeps working after the "reopen".
  assert.equal((await pub(tokenOf(a.share))).status, 200);
});

test('the token is random, unrelated to ids/numbers, and stored only hashed + encrypted', async () => {
  const { invoice: i1 } = await makeManualInvoice();
  const { invoice: i2 } = await makeManualInvoice();
  const t1 = tokenOf(await createShare(i1._id));
  const t2 = tokenOf(await createShare(i2._id));

  assert.notEqual(t1, t2);
  assert.equal(Buffer.from(t1, 'base64url').length, 32, '256 bits of entropy');
  for (const t of [t1, t2]) {
    assert.ok(!t.includes(i1.invoiceNumber) && !t.includes(String(i1._id)));
  }

  const record = await InvoiceShareLink.findOne({ invoiceId: i1._id }).lean();
  assert.equal(record.tokenHash, crypto.createHash('sha256').update(t1).digest('hex'));
  assert.ok(!JSON.stringify(record).includes(t1), 'raw token is not persisted');
  assert.equal(svc.decryptToken(record.tokenCipher), t1);
});

test('only admins can manage share links (401 anonymous, 403 user and pandit)', async () => {
  const { invoice } = await makeManualInvoice();
  const calls = [
    ['GET', `/api/admin/invoices/${invoice._id}/share`],
    ['POST', `/api/admin/invoices/${invoice._id}/share`],
    ['POST', `/api/admin/invoices/${invoice._id}/share/regenerate`],
    ['POST', `/api/admin/invoices/${invoice._id}/share/revoke`],
  ];
  for (const [method, path] of calls) {
    assert.equal((await api(method, path, undefined, null)).status, 401, `${method} ${path} anonymous`);
    assert.equal((await api(method, path, undefined, userToken)).status, 403, `${method} ${path} user`);
    assert.equal((await api(method, path, undefined, panditToken)).status, 403, `${method} ${path} pandit`);
  }
  assert.equal(await InvoiceShareLink.countDocuments(), 0, 'nothing was created by unauthorized callers');

  // Even the customer who owns a booking invoice cannot mint or reveal its link.
  const { invoice: bookingInvoice } = await makeBookingInvoice();
  assert.equal((await api('POST', `/api/admin/invoices/${bookingInvoice._id}/share`, undefined, userToken)).status, 403);
});

/* ═══════════════════════════ PUBLIC ACCESS ═══════════════════════════════ */

test('a valid token loads exactly its own manual invoice with no login', async () => {
  const mine = await makeManualInvoice({ customer: { name: 'Priya Sharma' } });
  const other = await makeManualInvoice({ customer: { name: 'Someone Else', phone: '9876501234', email: 'other@example.com' } });
  const token = tokenOf(await createShare(mine.invoice._id));
  await createShare(other.invoice._id);

  const res = await pub(token); // no Authorization header, no cookies
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);

  const body = await res.json();
  assert.equal(body.invoice.invoiceNumber, mine.invoice.invoiceNumber);
  assert.equal(body.invoice.customerName, 'Priya Sharma');
  assert.ok(!JSON.stringify(body).includes('Someone Else'));
  assert.ok(!JSON.stringify(body).includes(other.invoice.invoiceNumber));
  assert.equal(body.invoice.lineItems.length, 1);
  assert.equal(body.invoice.sellerSnapshot.gstin, '07AACCZ8054C1ZB');
});

test('invalid, unknown, malformed and id/number-as-token requests all get the same generic 404', async () => {
  const { invoice } = await makeManualInvoice();
  await createShare(invoice._id);
  const candidates = [
    crypto.randomBytes(32).toString('base64url'),   // well-formed but unknown
    'short-token',                                    // malformed
    invoice.invoiceNumber,                            // invoice number
    String(invoice._id),                              // mongo id
  ];
  const bodies = [];
  for (const c of candidates) {
    const res = await pub(c);
    assert.equal(res.status, 404, `token candidate must fail: ${c.slice(0, 8)}…`);
    bodies.push(await res.json());
  }
  for (const b of bodies) {
    assert.equal(b.success, false);
    assert.match(b.message, NOT_AVAILABLE);
  }
  assert.deepEqual(bodies[0], bodies[2], 'unknown and malformed are indistinguishable');
});

test('public responses use an allowlist: no internal ids, audit, gateway or payment-reference data', async () => {
  const { invoice } = await makeManualInvoice({
    extra: { payment: { amount: 50, method: 'UPI', reference: 'UTR-SECRET-9988', note: 'INTERNAL-NOTE-XYZ' } },
  });
  const token = tokenOf(await createShare(invoice._id));
  const body = await (await pub(token)).json();
  const text = JSON.stringify(body);

  for (const forbidden of [
    String(invoice._id), String(invoice.createdBy), String(invoice.idempotencyKey), invoice.ipAddress || 'no-ip-value',
    'UTR-SECRET-9988', 'INTERNAL-NOTE-XYZ', 'Share Admin', 'recordedBy',
    'idempotencyKey', 'createdBy', 'ipAddress', 'stockDeducted', 'generatedBy', 'paymentGateway',
    'merchantTransactionId', 'gatewayTransactionId', 'cancelReason', 'productId', 'kitId', 'sellerRegistrationId',
    'configuredTaxRate', 'taxIdentityConfirmed',
  ]) {
    assert.ok(!text.includes(forbidden), `public payload must not contain ${forbidden}`);
  }
  assert.ok(!/"_id"/.test(text) && !/"__v"/.test(text));

  // Customer contact details are masked in transit.
  assert.equal(body.invoice.customerPhone, 'XXXXXX3210');
  assert.equal(body.invoice.customerEmail, 'p***@example.com');
  // The ledger is summarised without references/notes/operators.
  assert.deepEqual(Object.keys(body.payments[0]).sort(), ['amount', 'kind', 'method', 'receivedAt']);
});

test('a public visitor cannot modify invoices or payments', async () => {
  const { invoice } = await makeManualInvoice();
  const token = tokenOf(await createShare(invoice._id));
  const before = await Invoice.findById(invoice._id).lean();

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await pub(token, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : JSON.stringify({ status: 'cancelled', grandTotal: 1, amountPaid: 999 }) });
    assert.equal(res.status, 404, `${method} on the public route is not a thing`);
  }
  const extra = await fetch(url(`/api/public/invoices/${token}/payments`), { method: 'POST' });
  assert.equal(extra.status, 404);

  // The private APIs stay private.
  assert.equal((await api('POST', `/api/admin/manual-billing/invoices/${invoice._id}/payments`, { amount: 10, method: 'CASH', idempotencyKey: 'x'.repeat(12) }, null)).status, 401);
  assert.equal((await api('PATCH', `/api/admin/invoices/${invoice._id}/cancel`, { reason: 'x' }, null)).status, 401);
  assert.equal((await api('GET', `/api/invoices/number/${invoice.invoiceNumber}`, undefined, null)).status, 401);

  const after = await Invoice.findById(invoice._id).lean();
  assert.deepEqual(after, before);
  assert.equal(await OfflinePayment.countDocuments(), 0);
  assert.equal(await PaymentLedger.countDocuments(), 0);
});

/* ═══════════════════════════ LIFECYCLE ═══════════════════════════════════ */

test('revoking invalidates the link immediately; a revoked link can be regenerated', async () => {
  const { invoice } = await makeManualInvoice();
  const t1 = tokenOf(await createShare(invoice._id));
  assert.equal((await pub(t1)).status, 200);

  const revoke = await api('POST', `/api/admin/invoices/${invoice._id}/share/revoke`);
  assert.equal(revoke.status, 200);
  assert.equal((await revoke.json()).share.status, 'revoked');
  const gone = await pub(t1);
  assert.equal(gone.status, 404);
  assert.match((await gone.json()).message, NOT_AVAILABLE);

  const state = await (await api('GET', `/api/admin/invoices/${invoice._id}/share`)).json();
  assert.equal(state.share.status, 'revoked');
  assert.equal(state.share.path, undefined, 'a revoked link is never handed back');
  assert.equal((await api('POST', `/api/admin/invoices/${invoice._id}/share/revoke`)).status, 404, 'nothing left to revoke');

  const regen = await api('POST', `/api/admin/invoices/${invoice._id}/share/regenerate`);
  assert.equal(regen.status, 201);
  const t2 = tokenOf((await regen.json()).share);
  assert.notEqual(t2, t1);
  assert.equal((await pub(t2)).status, 200);
  assert.equal((await pub(t1)).status, 404, 'the revoked token stays dead');
});

test('regenerating an active link invalidates the previous token and enables the new one', async () => {
  const { invoice } = await makeManualInvoice();
  const t1 = tokenOf(await createShare(invoice._id));
  const t2 = tokenOf((await (await api('POST', `/api/admin/invoices/${invoice._id}/share/regenerate`)).json()).share);

  assert.notEqual(t1, t2);
  assert.equal((await pub(t1)).status, 404);
  assert.equal((await pub(t2)).status, 200);
  assert.equal(await InvoiceShareLink.countDocuments({ invoiceId: invoice._id, status: 'active' }), 1);
  assert.equal(await InvoiceShareLink.countDocuments({ invoiceId: invoice._id, status: 'revoked' }), 1);

  // And "create" now hands back the NEW token.
  assert.equal(tokenOf(await createShare(invoice._id)), t2);
});

test('concurrent creates converge on one active link', async () => {
  const { invoice } = await makeManualInvoice();
  const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', `/api/admin/invoices/${invoice._id}/share`)));
  assert.ok(results.every((r) => [200, 201].includes(r.status)));
  const paths = new Set((await Promise.all(results.map((r) => r.json()))).map((b) => b.share.path));
  assert.equal(paths.size, 1);
  assert.equal(await InvoiceShareLink.countDocuments({ invoiceId: invoice._id, status: 'active' }), 1);
});

test('share management is audited without the token', async () => {
  const { invoice } = await makeManualInvoice();
  const t1 = tokenOf(await createShare(invoice._id));
  const t2 = tokenOf((await (await api('POST', `/api/admin/invoices/${invoice._id}/share/regenerate`)).json()).share);
  await api('POST', `/api/admin/invoices/${invoice._id}/share/revoke`);

  let logs = [];
  for (let i = 0; i < 20 && logs.length < 3; i += 1) {
    await new Promise((r) => setTimeout(r, 50));
    logs = await AdminAuditLog.find({ action: /invoice_share_link$/ }).lean();
  }
  assert.deepEqual(logs.map((l) => l.action).sort(), ['create_invoice_share_link', 'regenerate_invoice_share_link', 'revoke_invoice_share_link']);
  const text = JSON.stringify(logs);
  assert.ok(!text.includes(t1) && !text.includes(t2));
  assert.ok(!text.includes(crypto.createHash('sha256').update(t1).digest('hex')), 'hashes are not audited either');
  assert.ok(logs.every((l) => l.targetName === invoice.invoiceNumber && l.module === 'invoice'));
});

test('a rotated server secret makes the link un-retrievable but never breaks the customer link', async () => {
  const { invoice } = await makeManualInvoice();
  const token = tokenOf(await createShare(invoice._id));
  const original = process.env.INVOICE_SHARE_SECRET;
  process.env.INVOICE_SHARE_SECRET = 'a-completely-different-secret';
  try {
    const state = await (await api('GET', `/api/admin/invoices/${invoice._id}/share`)).json();
    assert.equal(state.share.status, 'active');
    assert.equal(state.share.linkAvailable, false);
    assert.equal(state.share.path, undefined);
    assert.equal((await pub(token)).status, 200, 'lookup uses the hash, not the cipher');
  } finally {
    if (original === undefined) delete process.env.INVOICE_SHARE_SECRET; else process.env.INVOICE_SHARE_SECRET = original;
  }
});

/* ═══════════════════════════ ELIGIBILITY / STATES ════════════════════════ */

test('unknown or malformed invoice ids cannot be shared; archived and orphaned invoices are refused', async () => {
  assert.equal((await api('POST', `/api/admin/invoices/${new mongoose.Types.ObjectId()}/share`)).status, 404);
  assert.equal((await api('POST', '/api/admin/invoices/not-an-id/share')).status, 404);

  const { invoice } = await makeManualInvoice();
  await Invoice.updateOne({ _id: invoice._id }, { $set: { status: 'archived' } });
  const archived = await api('POST', `/api/admin/invoices/${invoice._id}/share`);
  assert.equal(archived.status, 409);
  assert.match((await archived.json()).message, /Archived/);
  const state = await (await api('GET', `/api/admin/invoices/${invoice._id}/share`)).json();
  assert.equal(state.eligible, false);
  assert.match(state.reason, /Archived/);

  const { invoice: orphan } = await makeBookingInvoice({ withBooking: false });
  const orphanRes = await api('POST', `/api/admin/invoices/${orphan._id}/share`);
  assert.equal(orphanRes.status, 409);
  assert.equal(await InvoiceShareLink.countDocuments(), 0, 'no link exists for ineligible invoices');
});

test('archiving an invoice kills its existing public link', async () => {
  const { invoice } = await makeManualInvoice();
  const token = tokenOf(await createShare(invoice._id));
  assert.equal((await pub(token)).status, 200);
  assert.equal((await api('PATCH', `/api/admin/invoices/${invoice._id}/archive`)).status, 200);
  assert.equal((await pub(token)).status, 404);
});

test('a cancelled invoice is shared WITH its cancelled state and no internal reason', async () => {
  const { invoice } = await makeManualInvoice({ extra: { payment: { amount: 200, method: 'CASH' } } });
  const token = tokenOf(await createShare(invoice._id));
  assert.equal((await api('PATCH', `/api/admin/invoices/${invoice._id}/cancel`, { reason: 'INTERNAL-CANCEL-REASON' })).status, 200);

  const body = await (await pub(token)).json();
  assert.equal(body.invoice.status, 'cancelled');
  assert.ok(body.invoice.cancelledAt);
  assert.ok(!JSON.stringify(body).includes('INTERNAL-CANCEL-REASON'));

  // A cancelled invoice can still be shared (as cancelled) from the register.
  const share = await createShare(invoice._id);
  assert.equal(tokenOf(share), token);
});

/* ═══════════════════════════ INVOICE CORRECTNESS ═════════════════════════ */

test('manual invoice shows the saved snapshot, not current catalog or tax settings', async () => {
  const p = await Product.create({ name: 'Snapshot Lamp', slug: `snap-${rnd()}`, category: 'Test', price: 250, stock: 10, taxRate: 18, isActive: true });
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: nextKey(), registrationId: 'reg_test',
    customer: { name: 'Snap Customer', phone: '9876500777', state: 'Karnataka' },
    items: [{ productId: p._id.toString(), quantity: 2, discount: 50 }],
    applyTax: true, manualTaxRate: 5,
    payment: { amount: 100, method: 'UPI', reference: 'UTR-1' },
  });
  assert.equal(res.status, 201);
  const created = (await res.json()).invoice;
  const token = tokenOf(await createShare(created._id));

  await Product.updateOne({ _id: p._id }, { $set: { price: 9999, taxRate: 0, name: 'Renamed' } });
  await SystemSettings.deleteMany({});
  settingsService.invalidate();
  await User.updateMany({}, { $set: { name: 'Changed Name' } });

  const body = await (await pub(token)).json();
  const inv = body.invoice;
  assert.equal(inv.lineItems[0].name, 'Snapshot Lamp');
  assert.equal(inv.lineItems[0].unitPrice, 250);
  assert.equal(inv.lineItems[0].discount, 50);
  assert.equal(inv.taxMode, 'manual_bill_rate');
  assert.equal(inv.manualTaxRate, 5);
  assert.equal(inv.taxableValue, 450);
  assert.equal(inv.totalGST, 22.5);
  assert.equal(inv.grandTotal, 472.5);
  assert.deepEqual(inv.gstBreakdown, { cgst: 0, sgst: 0, igst: 22.5, isInterstate: true });
  assert.equal(inv.sellerSnapshot.legalName, 'Zutsav Test Enterprises');
  assert.equal(inv.customerName, 'Snap Customer');
});

test('paid, partial and outstanding amounts are reported accurately, including reversals', async () => {
  const { invoice } = await makeManualInvoice({ price: 100, extra: { payment: { amount: 80, method: 'CASH' } } });
  const token = tokenOf(await createShare(invoice._id));

  let body = await (await pub(token)).json();
  assert.equal(body.invoice.grandTotal, 200);
  assert.equal(body.paymentSummary.netReceived, 80);
  assert.equal(body.paymentSummary.outstanding, 120);
  assert.equal(body.payments.length, 1);

  const pay = await api('POST', `/api/admin/manual-billing/invoices/${invoice._id}/payments`, { idempotencyKey: nextKey(), amount: 120, method: 'UPI' });
  assert.equal(pay.status, 201);
  body = await (await pub(token)).json();
  assert.equal(body.paymentSummary.netReceived, 200);
  assert.equal(body.paymentSummary.outstanding, 0);

  const receiptId = (await OfflinePayment.findOne({ invoiceId: invoice._id, amount: 120 }).lean())._id;
  await api('POST', `/api/admin/manual-billing/payments/${receiptId}/reverse`, { reason: 'bounced' });
  body = await (await pub(token)).json();
  assert.equal(body.paymentSummary.netReceived, 80);
  assert.equal(body.paymentSummary.outstanding, 120);
  assert.deepEqual(body.payments.map((p) => p.kind), ['RECEIPT', 'RECEIPT', 'REVERSAL']);
});

test('booking invoices share a customer-safe snapshot without gateway ids or other invoices', async () => {
  const { invoice } = await makeBookingInvoice();
  const sibling = await makeBookingInvoice();
  const token = tokenOf(await createShare(invoice._id));
  await createShare(sibling.invoice._id);

  const res = await pub(token);
  assert.equal(res.status, 200);
  const body = await res.json();
  const text = JSON.stringify(body);

  assert.equal(body.invoice.source, 'booking');
  assert.equal(body.invoice.invoiceNumber, invoice.invoiceNumber);
  assert.equal(body.invoice.grandTotal, 1118);
  assert.equal(body.invoice.poojaAmount, 1000);
  assert.equal(body.invoice.platformFee, 100);
  assert.deepEqual(body.invoice.gstBreakdown, { cgst: 0, sgst: 0, igst: 18, isInterstate: true });
  assert.equal(body.booking.poojaId.name, 'Satyanarayan Katha');
  assert.equal(body.booking.userDetails.name, 'Rahul Verma');
  assert.equal(body.booking.userDetails.phone, 'XXXXXX2233');
  assert.equal(body.booking.userDetails.email, 'r***@example.com');

  assert.ok(!text.includes('SECRET'), 'no gateway/merchant transaction ids');
  assert.ok(!text.includes(sibling.invoice.invoiceNumber), 'no other invoices of the same customer');
  for (const forbidden of ['userId', 'customerId', 'merchantTransactionId', 'gatewayTransactionId', 'paymentGateway', 'ipAddress', 'latitude', 'longitude', 'phonePe', String(invoice._id), String(customerUser._id)]) {
    assert.ok(!text.includes(forbidden), `booking payload must not contain ${forbidden}`);
  }
});

test('a cancelled booking invoice reports its cancelled status publicly', async () => {
  const { invoice } = await makeBookingInvoice({ status: 'cancelled', bookingStatus: 'cancelled' });
  const token = tokenOf(await createShare(invoice._id));
  const body = await (await pub(token)).json();
  assert.equal(body.invoice.status, 'cancelled');
  assert.equal(body.booking.status, 'cancelled');
});

test('sharing does not touch invoice numbering, payments, ledgers or stock', async () => {
  const { invoice, product } = await makeManualInvoice();
  const { invoice: bookingInvoice } = await makeBookingInvoice();
  const snapshot = async () => ({
    counters: await InvoiceCounter.find({}).lean(),
    payments: await OfflinePayment.countDocuments(),
    ledger: await PaymentLedger.countDocuments(),
    stock: (await Product.findById(product._id).lean()).stock,
    invoices: await Invoice.find({}).sort({ invoiceNumber: 1 }).lean(),
  });
  const before = await snapshot();
  for (const id of [invoice._id, bookingInvoice._id]) {
    const t = tokenOf(await createShare(id));
    await pub(t);
    await api('POST', `/api/admin/invoices/${id}/share/regenerate`);
    await api('POST', `/api/admin/invoices/${id}/share/revoke`);
  }
  assert.deepEqual(await snapshot(), before);
});

/* ═══════════════════════════ LOGGING HYGIENE ═════════════════════════════ */

test('raw share tokens never reach stdout/stderr logs, even for failed lookups', async () => {
  const { invoice } = await makeManualInvoice();
  const token = tokenOf(await createShare(invoice._id));
  const bogus = crypto.randomBytes(32).toString('base64url');

  const captured = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const sink = (orig) => (chunk, ...rest) => { captured.push(String(chunk)); return orig(chunk, ...rest); };
  process.stdout.write = sink(origOut);
  process.stderr.write = sink(origErr);
  try {
    await pub(token);
    await pub(bogus);
    await fetch(url(`/api/public/invoices/${token}/extra/segments`));
    await new Promise((r) => setTimeout(r, 100));
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  const logs = captured.join('');
  assert.ok(!logs.includes(token), 'valid token leaked into logs');
  assert.ok(!logs.includes(bogus), 'probed token leaked into logs');
});

/* ═══════════════════════════ BROWSER / CORS ══════════════════════════════ */

test('the public endpoint works cross-origin from the web app without a preflight', async () => {
  // Regression: the customer page once sent a Cache-Control REQUEST header. That forces a
  // CORS preflight, the API only allows Content-Type/Authorization, so browsers blocked
  // every share link (shown as "invalid link") while server-side tests still passed.
  const config = require('../src/config');
  const [origin] = await config.cors.getAllowedOrigins();
  assert.ok(origin, 'an allowed web origin is configured');

  const { invoice } = await makeManualInvoice();
  const token = tokenOf(await createShare(invoice._id));

  const res = await pub(token, { headers: { Origin: origin, Accept: 'application/json, text/plain, */*' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), origin);

  // Documents the constraint the page must respect: extra request headers are not allowed.
  const preflight = await fetch(url(`/api/public/invoices/${token}`), {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'cache-control' },
  });
  const allowed = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(!allowed.includes('cache-control'), 'if this ever changes, the page may send custom headers again');
});

/* ═══════════════════════════ RATE LIMITING (keep last) ═══════════════════ */

test('repeated failed token lookups are rate limited', async () => {
  const { invoice } = await makeManualInvoice();
  await createShare(invoice._id);
  let limited = false;
  for (let i = 0; i < 40 && !limited; i += 1) {
    const res = await pub(crypto.randomBytes(32).toString('base64url'));
    if (res.status === 429) {
      limited = true;
      assert.match((await res.json()).message, /Too many requests/);
    }
  }
  assert.ok(limited, 'token probing must eventually be throttled');
});
