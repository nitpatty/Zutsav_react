/**
 * Manual Billing — numbering, calculations, offline payments, inventory,
 * idempotency, authorization and isolation regression.
 *
 * Runs against the real `src/app` over HTTP on an ephemeral port with a
 * dedicated local test database dropped before and after.
 */

process.env.PAYMENT_MODE = 'mock';
process.env.MOCK_PAYMENT_OUTCOME = 'success';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'manual-billing-test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('http');
const mongoose = require('mongoose');
const jwt    = require('jsonwebtoken');

const Invoice        = require('../src/models/Invoice');
const InvoiceCounter = require('../src/models/InvoiceCounter');
const OfflinePayment = require('../src/models/OfflinePayment');
const PaymentLedger  = require('../src/models/PaymentLedger');
const Booking        = require('../src/models/Booking');
const Product        = require('../src/models/Product');
const User           = require('../src/models/User');
const InventoryLog   = require('../src/models/InventoryLog');
const SystemSettings = require('../src/models/SystemSettings');
const settingsService = require('../src/utils/settingsService');
const { generateInvoiceNumber, generateInvoiceNumberForSeries } = require('../src/utils/invoiceGenerator');
const { calculateManualBillLines } = require('../src/utils/manualBillCalculator');

async function rejectWithDetails(promise, pattern) {
  let caught;
  try { await promise; } catch (err) { caught = err; }
  assert.ok(caught, 'expected the promise to reject');
  const text = [caught.message, ...(caught.details || [])].join(' | ');
  assert.match(text, pattern);
}

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_manual_billing_test';

let server, port, adminToken, userToken, adminId;

const url = (p) => `http://127.0.0.1:${port}${p}`;
const api = (method, path, body, token = adminToken) =>
  fetch(url(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function makeProduct(overrides = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  const doc = {
    name: `Test Product ${n}`,
    slug: `test-product-${n}`,
    category: 'Test',
    price: 100,
    stock: 100,
    taxRate: 18,
    isActive: true,
    ...overrides,
  };
  return Product.create(doc);
}

async function configureRegistration(overrides = {}) {
  const reg = {
    id: 'reg_test',
    legalName: 'Zutsav Test Enterprises',
    gstin: '07AACCZ8054C1ZB',
    pan: 'AACCZ8054C',
    address: 'Test Address, New Delhi',
    state: 'Delhi',
    stateCode: '07',
    isActive: true,
    isDefault: true,
    ...overrides,
  };
  await SystemSettings.findOneAndUpdate({}, { $set: { companyBillingRegistrations: [reg] } }, { upsert: true });
  settingsService.invalidate();
  return reg;
}

async function waitForIndexes() {
  await Promise.all([Invoice.init(), InvoiceCounter.init(), OfflinePayment.init()]);
}

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await waitForIndexes();

  const admin = await User.create({
    name: 'Billing Admin', email: 'billing-admin@example.com', phone: '9000000011',
    password: 'secret123', role: 'admin',
  });
  adminId = admin._id;
  const user = await User.create({
    name: 'Billing Customer', email: 'billing-user@example.com', phone: '9000000012',
    password: 'secret123', role: 'user',
  });
  adminToken = jwt.sign({ id: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  userToken  = jwt.sign({ id: user._id.toString() },  process.env.JWT_SECRET, { expiresIn: '1h' });

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
    Invoice.deleteMany({}),
    InvoiceCounter.deleteMany({}),
    // OfflinePayment is append-only by design — test cleanup uses the raw
    // collection, the same escape hatch the retention-cleanup workflow uses.
    OfflinePayment.collection.deleteMany({}),
    PaymentLedger.deleteMany({}),
    Booking.deleteMany({}),
    Product.deleteMany({}),
    InventoryLog.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);
  settingsService.invalidate();
});

/* ═══════════════════════════ NUMBERING ═══════════════════════════════════ */

test('automatic INV series keeps the historic INV-YYYY-NNNNNN format', async () => {
  const year = new Date().getFullYear();
  const n1 = await generateInvoiceNumber();
  const n2 = await generateInvoiceNumber();
  assert.equal(n1, `INV-${year}-000001`);
  assert.equal(n2, `INV-${year}-000002`);
});

test('manual MAN series is independent and starts at 000001', async () => {
  const year = new Date().getFullYear();
  assert.equal(await generateInvoiceNumberForSeries('MAN'), `MAN-${year}-000001`);
  assert.equal(await generateInvoiceNumber(), `INV-${year}-000001`);
  assert.equal(await generateInvoiceNumberForSeries('MAN'), `MAN-${year}-000002`);
});

test('legacy counters without a series are claimed as INV without resetting seq', async () => {
  const year = new Date().getFullYear();
  await InvoiceCounter.collection.insertOne({ year, seq: 41 });
  const number = await generateInvoiceNumber();
  assert.equal(number, `INV-${year}-000042`);
  const legacy = await InvoiceCounter.findOne({ year, series: 'INV' }).lean();
  assert.equal(legacy.seq, 42);
});

test('concurrent manual numbering never issues a duplicate', async () => {
  const results = await Promise.all(
    Array.from({ length: 25 }, () => generateInvoiceNumberForSeries('MAN'))
  );
  assert.equal(new Set(results).size, 25);
  const seqs = results.map((n) => Number(n.split('-')[2])).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: 25 }, (_, i) => i + 1));
});

test('failed inserts consume but never reuse a number', async () => {
  const year = new Date().getFullYear();
  const first = await generateInvoiceNumberForSeries('MAN');
  await Invoice.create({
    invoiceNumber: first, source: 'manual', lineItems: [{ name: 'x', quantity: 1, unitPrice: 1, lineTotal: 1 }],
    sellerSnapshot: { legalName: 'x', gstin: '07AACCZ8054C1ZB' },
    customerName: 'x', paymentType: 'REMAINING', amountPaid: 0, grandTotal: 1,
  }).catch(() => {});
  const second = await generateInvoiceNumberForSeries('MAN');
  assert.notEqual(first, second);
  assert.equal(second, `MAN-${year}-000002`);
});

/* ═══════════════════════════ CALCULATIONS ════════════════════════════════ */

test('server derives line prices, tax and totals from the catalog', async () => {
  const p = await makeProduct({ price: 250, taxRate: 18 });
  const result = await calculateManualBillLines([{ productId: p._id.toString(), quantity: 2 }]);
  assert.equal(result.lines[0].unitPrice, 250);
  assert.equal(result.lines[0].taxAmount, 90); // 500 × 18%
  assert.equal(result.lines[0].lineTotal, 590);
  assert.equal(result.grandTotal, 590);
});

test('multiple lines, variants, discounts and rounding are deterministic', async () => {
  const a = await makeProduct({ price: 99.99, taxRate: 12 });
  const b = await makeProduct({
    price: 500, taxRate: 5,
    variants: [{ variantId: 'v1', quantity: '100g', price: 125.5, stock: 10, isActive: true }],
  });
  const result = await calculateManualBillLines([
    { productId: a._id.toString(), quantity: 3, discount: 10 },
    { productId: b._id.toString(), variantId: 'v1', quantity: 2, discount: 0.5 },
  ]);
  assert.equal(result.lines[0].unitPrice, 99.99);
  assert.equal(result.lines[0].taxAmount, 34.8);    // (299.97 − 10) × 12% = 34.7964 → 34.80
  assert.equal(result.lines[1].unitPrice, 125.5);
  assert.equal(result.lines[1].taxAmount, 12.53);   // (251 − 0.5) × 5% = 12.525 → 12.53
  assert.equal(result.grandTotal, Math.round((result.taxableValue + result.totalTax) * 100) / 100);
  assert.ok(result.grandTotal > 0);
});

test('invalid inputs are rejected (zero qty, bad discount, inactive product, missing variant)', async () => {
  const p = await makeProduct({ price: 100 });
  const inactive = await makeProduct({ price: 100, isActive: false });
  const variantOnly = await makeProduct({
    price: 0, variants: [{ variantId: 'v', quantity: '1', price: 10, stock: 1, isActive: true }],
  });

  await rejectWithDetails(calculateManualBillLines([{ productId: p._id.toString(), quantity: 0 }]), /quantity/);
  await rejectWithDetails(calculateManualBillLines([{ productId: p._id.toString(), quantity: 1, discount: -5 }]), /discount/);
  await rejectWithDetails(calculateManualBillLines([{ productId: p._id.toString(), quantity: 1, discount: 500 }]), /discount/);
  await rejectWithDetails(calculateManualBillLines([{ productId: inactive._id.toString(), quantity: 1 }]), /not found|active/);
  await rejectWithDetails(calculateManualBillLines([{ productId: variantOnly._id.toString(), quantity: 1 }]), /variant/);
});

test('client-supplied totals/prices are ignored at the API boundary', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  await configureRegistration();
  const res = await api('POST', '/api/admin/manual-billing/preview', {
    items: [{ productId: p._id.toString(), quantity: 1, unitPrice: 1, lineTotal: 1, taxAmount: 0 }],
    customerState: 'Delhi',
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.totals.grandTotal, 118);
  assert.equal(body.gstBreakdown.isInterstate, false);
  assert.equal(body.gstBreakdown.cgst, 9);
  assert.equal(body.gstBreakdown.sgst, 9);
});

test('interstate customer gets IGST from the selected registration state', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  await configureRegistration();
  const res = await api('POST', '/api/admin/manual-billing/preview', {
    items: [{ productId: p._id.toString(), quantity: 1 }],
    customerState: 'Maharashtra',
  });
  const body = await res.json();
  assert.equal(body.gstBreakdown.isInterstate, true);
  assert.equal(body.gstBreakdown.igst, 18);
  assert.equal(body.gstBreakdown.cgst, 0);
});

/* ═══════════════════════════ AUTHORIZATION ═══════════════════════════════ */

test('manual billing endpoints require authentication and an admin role', async () => {
  const p = await makeProduct({ price: 100 });
  const anon = await api('POST', '/api/admin/manual-billing/preview', { items: [] }, null);
  assert.equal(anon.status, 401);

  const nonAdmin = await api('POST', '/api/admin/manual-billing/preview', { items: [] }, userToken);
  assert.equal(nonAdmin.status, 403);

  const ok = await api('POST', '/api/admin/manual-billing/preview', {
    items: [{ productId: p._id.toString(), quantity: 1 }],
  });
  assert.equal(ok.status, 200);
});

/* ═══════════════════ REGISTRATIONS / FALLBACK GATING ═════════════════════ */

test('unconfigured settings expose the centralized recommended fallback', async () => {
  const res = await api('GET', '/api/admin/manual-billing/registrations');
  const body = await res.json();
  assert.equal(body.fallbackInUse, true);
  assert.equal(body.registrations.length, 1);
  assert.equal(body.registrations[0].gstin, '07AACCZ8054C1ZB');
  assert.equal(body.registrations[0].isFallback, true);
});

test('fallback registration cannot issue a tax invoice without explicit confirmation', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'fallback-no-confirm-1',
    registrationId: 'fallback',
    customer: { name: 'Walk In', phone: '9876543210' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 118, method: 'CASH' },
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /fallback/i);
  assert.equal(await Invoice.countDocuments(), 0);
});

test('settings rejects a structurally invalid GSTIN/PAN', async () => {
  const res = await api('PATCH', '/api/admin/settings', {
    companyBillingRegistrations: [{
      id: 'bad', legalName: 'Bad Co', gstin: 'NOTAGSTIN', pan: 'BADPAN', state: 'Delhi',
    }],
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.details.some((d) => /GSTIN/.test(d)));
});

test('a configured registration snapshot is written to the invoice', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18, stock: 10 });
  await configureRegistration();
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'configured-reg-0001',
    registrationId: 'reg_test',
    customer: { name: 'Conf Customer', phone: '9876543211', state: 'Delhi' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 118, method: 'CASH' },
  });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();
  assert.match(invoice.invoiceNumber, /^MAN-\d{4}-\d{6}$/);
  assert.equal(invoice.sellerSnapshot.gstin, '07AACCZ8054C1ZB');
  assert.equal(invoice.sellerSnapshot.isFallback, false);
  assert.equal(invoice.paymentGateway, 'offline');
  assert.equal(invoice.source, 'manual');
  assert.equal(invoice.lineItems.length, 1);
});

/* ═══════════════════════ CREATE / IDEMPOTENCY / ISOLATION ════════════════ */

test('walk-in customer creates no User account and stores a snapshot', async () => {
  const p = await makeProduct({ price: 50, taxRate: 0, stock: 5 });
  await configureRegistration();
  const usersBefore = await User.countDocuments();
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'walkin-0000001',
    registrationId: 'reg_test',
    customer: { name: 'Walk In Customer', phone: '9876500001', address: 'Somewhere', state: 'Delhi' },
    items: [{ productId: p._id.toString(), quantity: 2 }],
  });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();
  assert.equal(invoice.customerId, null);
  assert.equal(invoice.customerName, 'Walk In Customer');
  assert.equal(await User.countDocuments(), usersBefore);
});

test('existing customer is linked and snapshotted', async () => {
  const p = await makeProduct({ price: 50, taxRate: 0, stock: 5 });
  await configureRegistration();
  const customer = await User.findOne({ role: 'user' });
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'existing-000001',
    registrationId: 'reg_test',
    customer: { customerId: customer._id.toString() },
    items: [{ productId: p._id.toString(), quantity: 1 }],
  });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();
  assert.equal(String(invoice.customerId), String(customer._id));
  assert.equal(invoice.customerName, 'Billing Customer');
});

test('retried create with the same idempotency key yields one invoice and one receipt', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const payload = {
    idempotencyKey: 'idem-create-0001',
    registrationId: 'reg_test',
    customer: { name: 'Idem Customer', phone: '9876500002' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 100, method: 'UPI', reference: 'UPI-REF-1' },
  };
  const r1 = await api('POST', '/api/admin/manual-billing/invoices', payload);
  const r2 = await api('POST', '/api/admin/manual-billing/invoices', payload);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).idempotentReplay, true);
  assert.equal(await Invoice.countDocuments({ source: 'manual' }), 1);
  assert.equal(await OfflinePayment.countDocuments(), 1);
  assert.equal(await PaymentLedger.countDocuments(), 0);
});

test('manual billing never creates a Booking or a gateway ledger row', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'isolation-00001',
    registrationId: 'reg_test',
    customer: { name: 'Iso Customer', phone: '9876500003' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 100, method: 'CASH' },
  });
  assert.equal(res.status, 201);
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await PaymentLedger.countDocuments(), 0);
});

/* ═══════════════════════════ INVENTORY ══════════════════════════════════ */

test('stock is deducted exactly once, retries never double-deduct', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const payload = {
    idempotencyKey: 'stock-once-0001',
    registrationId: 'reg_test',
    customer: { name: 'Stock Customer', phone: '9876500004' },
    items: [{ productId: p._id.toString(), quantity: 3 }],
  };
  const r1 = await api('POST', '/api/admin/manual-billing/invoices', payload);
  assert.equal(r1.status, 201);
  await api('POST', '/api/admin/manual-billing/invoices', payload);
  const after = await Product.findById(p._id).lean();
  assert.equal(after.stock, 7);
  const logs = await InventoryLog.find({ productId: p._id, reason: 'manual_sale' }).lean();
  assert.equal(logs.length, 1);
  assert.ok(logs[0].invoiceId);
});

test('insufficient stock is rejected before any invoice is written', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 1 });
  await configureRegistration();
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'stock-short-0001',
    registrationId: 'reg_test',
    customer: { name: 'Short Stock', phone: '9876500005' },
    items: [{ productId: p._id.toString(), quantity: 5 }],
  });
  assert.equal(res.status, 400);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal((await Product.findById(p._id).lean()).stock, 1);
});

test('cancelling a manual invoice restores stock exactly once', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const created = await (await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'cancel-stock-001',
    registrationId: 'reg_test',
    customer: { name: 'Cancel Customer', phone: '9876500006' },
    items: [{ productId: p._id.toString(), quantity: 4 }],
  })).json();
  assert.equal((await Product.findById(p._id).lean()).stock, 6);

  const r1 = await api('PATCH', `/api/admin/invoices/${created.invoice._id}/cancel`, { reason: 'customer changed mind' });
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).stockRestored, true);
  assert.equal((await Product.findById(p._id).lean()).stock, 10);

  // Second cancel is rejected by the existing lifecycle guard.
  const r2 = await api('PATCH', `/api/admin/invoices/${created.invoice._id}/cancel`, { reason: 'again' });
  assert.equal(r2.status, 400);
  assert.equal((await Product.findById(p._id).lean()).stock, 10);
  assert.equal(await InventoryLog.countDocuments({ invoiceId: created.invoice._id, reason: 'manual_sale_cancelled' }), 1);
});

/* ═══════════════════════════ PAYMENTS ═══════════════════════════════════ */

test('partial payments accumulate and are idempotent; overpayment is rejected', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const created = await (await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'partial-0000001',
    registrationId: 'reg_test',
    customer: { name: 'Partial Customer', phone: '9876500007' },
    items: [{ productId: p._id.toString(), quantity: 2 }],
    payment: { amount: 50, method: 'CASH' },
  })).json();
  const id = created.invoice._id;
  assert.equal(created.invoice.amountPaid, 50);
  assert.equal(created.invoice.outstandingAfter, 150);

  const p1 = await api('POST', `/api/admin/manual-billing/invoices/${id}/payments`, {
    idempotencyKey: 'partial-receipt-2', amount: 100, method: 'UPI',
  });
  assert.equal(p1.status, 201);
  const p1b = await api('POST', `/api/admin/manual-billing/invoices/${id}/payments`, {
    idempotencyKey: 'partial-receipt-2', amount: 100, method: 'UPI',
  });
  assert.equal(p1b.status, 200);
  assert.equal((await p1b.json()).idempotentReplay, true);

  const over = await api('POST', `/api/admin/manual-billing/invoices/${id}/payments`, {
    idempotencyKey: 'partial-over-003', amount: 500, method: 'CASH',
  });
  assert.equal(over.status, 400);

  const inv = await Invoice.findById(id).lean();
  assert.equal(inv.amountPaid, 150);
  assert.equal(inv.outstandingAfter, 50);
  assert.equal(await OfflinePayment.countDocuments({ invoiceId: id }), 2);
});

test('reversing a receipt recalculates the balance and cannot be repeated', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const created = await (await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'reversal-000001',
    registrationId: 'reg_test',
    customer: { name: 'Reversal Customer', phone: '9876500008' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 100, method: 'CARD' },
  })).json();
  const id = created.invoice._id;
  const paymentId = created.paymentSummary.payments[0]._id;

  const r1 = await api('POST', `/api/admin/manual-billing/payments/${paymentId}/reverse`, { reason: 'card declined' });
  assert.equal(r1.status, 201);
  const inv = await Invoice.findById(id).lean();
  assert.equal(inv.amountPaid, 0);
  assert.equal(inv.outstandingAfter, 100);

  const r2 = await api('POST', `/api/admin/manual-billing/payments/${paymentId}/reverse`, { reason: 'again' });
  assert.equal(r2.status, 400);

  // Immutability: direct edits/deletes of payment history are blocked.
  await assert.rejects(() => OfflinePayment.updateOne({ _id: paymentId }, { $set: { amount: 1 } }), /immutable/i);
  await assert.rejects(() => OfflinePayment.deleteOne({ _id: paymentId }), /cannot be deleted/i);
});

/* ═══════════════════════ RENDERING / REGISTER ════════════════════════════ */

test('manual invoice renders from its snapshot without a Booking (admin only)', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18, stock: 10 });
  await configureRegistration();
  const created = await (await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'render-0000001',
    registrationId: 'reg_test',
    customer: { name: 'Render Customer', phone: '9876500009', state: 'Delhi' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 118, method: 'CASH' },
  })).json();

  const adminRes = await api('GET', `/api/invoices/number/${created.invoice.invoiceNumber}`);
  assert.equal(adminRes.status, 200);
  const adminBody = await adminRes.json();
  assert.equal(adminBody.booking, null);
  assert.equal(adminBody.invoice.lineItems.length, 1);
  assert.equal(adminBody.invoice.sellerSnapshot.gstin, '07AACCZ8054C1ZB');
  assert.equal(adminBody.paymentSummary.netReceived, 118);

  const userRes = await api('GET', `/api/invoices/number/${created.invoice.invoiceNumber}`, undefined, userToken);
  assert.equal(userRes.status, 403);
});

test('invoice snapshot is immune to later product price/tax changes', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18, stock: 10, name: 'Original Name' });
  await configureRegistration();
  const created = await (await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'snapshot-000001',
    registrationId: 'reg_test',
    customer: { name: 'Snapshot Customer', phone: '9876500010' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
  })).json();

  await Product.findByIdAndUpdate(p._id, { $set: { price: 999, taxRate: 0, name: 'Changed Name' } });
  const inv = await Invoice.findById(created.invoice._id).lean();
  assert.equal(inv.lineItems[0].unitPrice, 100);
  assert.equal(inv.lineItems[0].taxRate, 18);
  assert.equal(inv.lineItems[0].name, 'Original Name');
  assert.equal(inv.grandTotal, 118);
});

test('admin invoice register filters by source and keeps gateway revenue separate', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'register-000001',
    registrationId: 'reg_test',
    customer: { name: 'Register Customer', phone: '9876500011' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 100, method: 'CASH' },
  });

  const manual = await (await api('GET', '/api/admin/invoices?source=manual')).json();
  assert.equal(manual.total, 1);
  assert.equal(manual.sourceStats.manual.count, 1);
  assert.equal(manual.sourceStats.booking.count, 0);
  assert.equal(manual.monthRevenue, 0, 'gateway month revenue excludes manual sales');
  assert.equal(manual.manualMonthRevenue, 100);

  const bookingOnly = await (await api('GET', '/api/admin/invoices?source=booking')).json();
  assert.equal(bookingOnly.total, 0);
});

test('payment history endpoint returns the offline ledger for a manual invoice', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0, stock: 10 });
  await configureRegistration();
  const created = await (await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'history-000001',
    registrationId: 'reg_test',
    customer: { name: 'History Customer', phone: '9876500012' },
    items: [{ productId: p._id.toString(), quantity: 1 }],
    payment: { amount: 100, method: 'BANK_TRANSFER', reference: 'NEFT-123' },
  })).json();

  const res = await api('GET', `/api/admin/manual-billing/invoices/${created.invoice._id}/payments`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.payments.length, 1);
  assert.equal(body.payments[0].method, 'BANK_TRANSFER');
  assert.equal(body.payments[0].reference, 'NEFT-123');
  assert.equal(body.netReceived, 100);
});
