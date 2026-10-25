/**
 * Manual Billing — kit search/pricing, custom (non-catalog) items and the
 * bill-level "Apply tax" control.
 *
 * Complements manual-billing.test.js (numbering, payments, isolation) and uses a
 * DIFFERENT database name because `node --test` runs files in parallel and each
 * file drops its database.
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
const Kit            = require('../src/models/Kit');
const User           = require('../src/models/User');
const InventoryLog   = require('../src/models/InventoryLog');
const SystemSettings = require('../src/models/SystemSettings');
const settingsService = require('../src/utils/settingsService');
const { calculateManualBillLines } = require('../src/utils/manualBillCalculator');

const TEST_URI = process.env.MONGO_URI_TEST_BILLING_EXT
  || 'mongodb://127.0.0.1:27017/zutsav_manual_billing_ext_test';

let server, port, adminToken, userToken;

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

const rnd = () => Math.random().toString(36).slice(2, 8);

async function makeProduct(overrides = {}) {
  const n = rnd();
  return Product.create({
    name: `Test Product ${n}`, slug: `test-product-${n}`, category: 'Test',
    price: 100, stock: 100, taxRate: 18, isActive: true, ...overrides,
  });
}

async function makeKit(components, overrides = {}) {
  const n = rnd();
  return Kit.create({
    name: `Test Kit ${n}`, slug: `test-kit-${n}`, description: 'kit description',
    items: components.map((p) => ({ productId: p._id, quantity: 1 })),
    discountPrice: 500, taxRate: 5, isActive: true, ...overrides,
  });
}

async function configureRegistration(overrides = {}) {
  const reg = {
    id: 'reg_test', legalName: 'Zutsav Test Enterprises', gstin: '07AACCZ8054C1ZB',
    pan: 'AACCZ8054C', address: 'Test Address, New Delhi', state: 'Delhi', stateCode: '07',
    isActive: true, isDefault: true, ...overrides,
  };
  await SystemSettings.findOneAndUpdate({}, { $set: { companyBillingRegistrations: [reg] } }, { upsert: true });
  settingsService.invalidate();
  return reg;
}

let keySeq = 0;
const nextKey = (p = 'ext') => `${p}-${Date.now()}-${++keySeq}-${rnd()}`;

const preview = (items, extra = {}) =>
  api('POST', '/api/admin/manual-billing/preview', { items, customerState: 'Delhi', ...extra });

const finalize = (items, extra = {}) =>
  api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: nextKey(),
    registrationId: 'reg_test',
    customer: { name: 'Ext Customer', phone: '9876500100', state: 'Delhi' },
    items,
    ...extra,
  });

async function rejectWithDetails(promise, pattern) {
  let caught;
  try { await promise; } catch (err) { caught = err; }
  assert.ok(caught, 'expected the promise to reject');
  assert.match([caught.message, ...(caught.details || [])].join(' | '), pattern);
}

const custom = (overrides = {}) => ({
  type: 'custom', name: 'Haldi', description: '50g', quantity: 1, unitPrice: 150, taxRate: 0, ...overrides,
});

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([Invoice.init(), InvoiceCounter.init(), OfflinePayment.init(), Kit.init()]);

  const admin = await User.create({
    name: 'Ext Admin', email: 'ext-admin@example.com', phone: '9000000021',
    password: 'secret123', role: 'admin',
  });
  const user = await User.create({
    name: 'Ext Customer', email: 'ext-user@example.com', phone: '9000000022',
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
    OfflinePayment.collection.deleteMany({}),
    PaymentLedger.deleteMany({}),
    Booking.deleteMany({}),
    Product.deleteMany({}),
    Kit.deleteMany({}),
    InventoryLog.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);
  settingsService.invalidate();
  await configureRegistration();
});

/* ═══════════════════════════ CATALOG + KITS ══════════════════════════════ */

test('catalog search returns matching products AND eligible kits, typed', async () => {
  const p = await makeProduct({ name: 'Ganga Jal Bottle', sku: 'GJ-1' });
  const kit = await makeKit([p], { name: 'Ganga Pooja Kit', slug: 'ganga-pooja-kit' });

  const byName = await (await api('GET', '/api/admin/manual-billing/catalog?search=ganga')).json();
  assert.equal(byName.products.length, 1);
  assert.equal(byName.products[0].type, 'product');
  assert.equal(byName.products[0].name, 'Ganga Jal Bottle');
  assert.equal(byName.kits.length, 1);
  assert.equal(byName.kits[0].type, 'kit');
  assert.equal(String(byName.kits[0]._id), String(kit._id));
  assert.equal(byName.kits[0].price, 500);
  assert.equal(byName.kits[0].itemCount, 1);

  // Kits are also found by slug; products by SKU (existing behaviour preserved).
  const bySlug = await (await api('GET', '/api/admin/manual-billing/catalog?search=ganga-pooja-kit')).json();
  assert.equal(bySlug.kits.length, 1);
  const bySku = await (await api('GET', '/api/admin/manual-billing/catalog?search=GJ-1')).json();
  assert.equal(bySku.products.length, 1);
  assert.equal(bySku.kits.length, 0);

  // Regex metacharacters in the search text are literal, not a pattern.
  const meta = await (await api('GET', `/api/admin/manual-billing/catalog?search=${encodeURIComponent('.*')}`)).json();
  assert.equal(meta.products.length + meta.kits.length, 0);
});

test('the legacy products endpoint is unchanged and never returns kits', async () => {
  const p = await makeProduct({ name: 'Camphor' });
  await makeKit([p], { name: 'Camphor Kit' });
  const body = await (await api('GET', '/api/admin/manual-billing/products?search=camphor')).json();
  assert.equal(body.products.length, 1);
  assert.equal(body.kits, undefined);
});

test('inactive kits are not searchable and cannot be billed', async () => {
  const p = await makeProduct();
  const kit = await makeKit([p], { name: 'Retired Kit', isActive: false });

  const found = await (await api('GET', '/api/admin/manual-billing/catalog?search=retired')).json();
  assert.equal(found.kits.length, 0);

  const res = await preview([{ type: 'kit', kitId: kit._id.toString(), quantity: 1 }]);
  assert.equal(res.status, 400);
  assert.match((await res.json()).details.join(' '), /kit not found or is not active/);

  const fin = await finalize([{ type: 'kit', kitId: kit._id.toString(), quantity: 1 }]);
  assert.equal(fin.status, 400);
  assert.equal(await Invoice.countDocuments(), 0);
});

test('kit price and tax rate are server-authoritative (client values are ignored)', async () => {
  const p = await makeProduct();
  const kit = await makeKit([p], { discountPrice: 500, taxRate: 5 });
  const res = await preview([{
    type: 'kit', kitId: kit._id.toString(), quantity: 2,
    unitPrice: 1, price: 1, discountPrice: 1, taxRate: 0, taxAmount: 0, lineTotal: 1,
  }], {});
  assert.equal(res.status, 200);
  const body = await res.json();
  const line = body.lines[0];
  assert.equal(line.lineType, 'kit');
  assert.equal(line.unitPrice, 500);
  assert.equal(line.taxRate, 5);
  assert.equal(line.taxAmount, 50);   // 1000 × 5%
  assert.equal(line.lineTotal, 1050);
  assert.equal(body.totals.grandTotal, 1050);
});

test('kit sales never touch product stock or inventory logs, product lines still do', async () => {
  const component = await makeProduct({ stock: 10 });
  const loose = await makeProduct({ stock: 10, taxRate: 0 });
  const kit = await makeKit([component], { discountPrice: 300, taxRate: 0 });

  const res = await finalize([
    { type: 'kit', kitId: kit._id.toString(), quantity: 3 },
    { productId: loose._id.toString(), quantity: 4 },
  ], { applyTax: false });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();

  assert.equal((await Product.findById(component._id).lean()).stock, 10, 'kit components are not deducted');
  assert.equal((await Product.findById(loose._id).lean()).stock, 6, 'plain product line deducts once');
  const logs = await InventoryLog.find({ invoiceId: invoice._id }).lean();
  assert.equal(logs.length, 1);
  assert.equal(String(logs[0].productId), String(loose._id));

  const kitLine = invoice.lineItems.find((l) => l.lineType === 'kit');
  assert.equal(String(kitLine.kitId), String(kit._id));
  assert.equal(kitLine.productId, null);
  assert.equal(kitLine.unitPrice, 300);

  // Cancellation restores only the product line, exactly once.
  const cancel = await api('PATCH', `/api/admin/invoices/${invoice._id}/cancel`, { reason: 'test' });
  assert.equal(cancel.status, 200);
  assert.equal((await Product.findById(component._id).lean()).stock, 10);
  assert.equal((await Product.findById(loose._id).lean()).stock, 10);
  assert.equal(await InventoryLog.countDocuments({ invoiceId: invoice._id, reason: 'manual_sale_cancelled' }), 1);
});

test('a kit-only bill needs no stock and deducts nothing', async () => {
  const component = await makeProduct({ stock: 0 }); // would fail any component stock check
  const kit = await makeKit([component], { discountPrice: 250, taxRate: 0 });
  const res = await finalize([{ type: 'kit', kitId: kit._id.toString(), quantity: 1 }], { applyTax: false });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();
  assert.equal(invoice.stockDeducted, false);
  assert.equal(await InventoryLog.countDocuments(), 0);
});

test('duplicate lines of one SKU are checked against stock together', async () => {
  const p = await makeProduct({ stock: 10, taxRate: 0 });
  const res = await finalize([
    { productId: p._id.toString(), quantity: 6 },
    { productId: p._id.toString(), quantity: 6 },
  ]);
  assert.equal(res.status, 400);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal(await InvoiceCounter.countDocuments(), 0, 'no invoice number is burned by a pre-check failure');
  assert.equal((await Product.findById(p._id).lean()).stock, 10);
});

/* ═══════════════════════════ CUSTOM ITEMS ════════════════════════════════ */

test('a custom-only bill finalizes as a snapshot without touching catalog, stock or users', async () => {
  const bystander = await makeProduct({ stock: 7, price: 10 });
  const usersBefore = await User.countDocuments();
  const productsBefore = await Product.countDocuments();
  const kitsBefore = await Kit.countDocuments();

  const res = await finalize([
    custom({ name: 'Haldi', description: '50g', sku: 'HAL-50', unit: 'pack', quantity: 2, unitPrice: 150, taxRate: 0 }),
  ], { applyTax: false, payment: { amount: 300, method: 'CASH' } });
  assert.equal(res.status, 201);
  const { invoice } = await res.json();

  assert.match(invoice.invoiceNumber, /^MAN-\d{4}-\d{6}$/);
  assert.equal(invoice.grandTotal, 300);
  assert.equal(invoice.stockDeducted, false);
  const line = invoice.lineItems[0];
  assert.equal(line.lineType, 'custom');
  assert.equal(line.productId, null);
  assert.equal(line.kitId, null);
  assert.equal(line.name, 'Haldi');
  assert.equal(line.variantLabel, '50g');
  assert.equal(line.sku, 'HAL-50');
  assert.equal(line.unit, 'pack');
  assert.equal(line.unitPrice, 150);

  assert.equal(await Product.countDocuments(), productsBefore);
  assert.equal(await Kit.countDocuments(), kitsBefore);
  assert.equal(await User.countDocuments(), usersBefore, 'no customer account is created');
  assert.equal(await InventoryLog.countDocuments(), 0);
  assert.equal((await Product.findById(bystander._id).lean()).stock, 7);
});

test('custom item validation rejects malformed names, quantities, prices and rates', async () => {
  const bad = [
    [custom({ name: '' }), /name is required/],
    [custom({ name: '   ' }), /name is required/],
    [custom({ name: { $gt: '' } }), /name is required/],
    [custom({ name: 'x'.repeat(201) }), /name must be at most 200/],
    [custom({ description: 'd'.repeat(201) }), /description must be at most 200/],
    [custom({ description: { a: 1 } }), /description must be text/],
    [custom({ sku: 's'.repeat(65) }), /sku must be at most 64/],
    [custom({ unit: 'u'.repeat(21) }), /unit must be at most 20/],
    [custom({ quantity: 0 }), /quantity/],
    [custom({ quantity: -3 }), /quantity/],
    [custom({ quantity: 1.5 }), /quantity/],
    [custom({ quantity: 'abc' }), /quantity/],
    [custom({ quantity: 10001 }), /quantity/],
    [custom({ unitPrice: -1 }), /unit price/],
    [custom({ unitPrice: 'abc' }), /unit price/],
    [custom({ unitPrice: '' }), /unit price/],
    [custom({ unitPrice: undefined }), /unit price/],
    [custom({ unitPrice: null }), /unit price/],
    [custom({ unitPrice: NaN }), /unit price/],
    [custom({ unitPrice: Infinity }), /unit price/],
    [custom({ unitPrice: '1e3' }), /unit price/],
    [custom({ unitPrice: 10.999 }), /unit price/],
    [custom({ unitPrice: 0.1 + 0.2 }), /unit price/],
    [custom({ unitPrice: 100000000 }), /unit price/],
    [custom({ unitPrice: { v: 1 } }), /unit price/],
    [custom({ taxRate: 101 }), /tax rate/],
    [custom({ taxRate: -1 }), /tax rate/],
    [custom({ taxRate: 'abc' }), /tax rate/],
    [custom({ taxRate: 4.555 }), /tax rate/],
    [{ type: 'bogus', quantity: 1 }, /type must be one of/],
    [{ type: 'kit', quantity: 1 }, /valid kitId/],
    [{ type: 'kit', kitId: 'not-an-id', quantity: 1 }, /valid kitId/],
  ];
  for (const [line, pattern] of bad) {
    await rejectWithDetails(calculateManualBillLines([line], { applyTax: false }), pattern);
  }

  // Same rules through the API: 400, nothing persisted, no number consumed.
  const res = await finalize([custom({ unitPrice: -5 })], { applyTax: false });
  assert.equal(res.status, 400);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal(await InvoiceCounter.countDocuments(), 0);
});

test('custom item accepts zero price, 2-decimal money and numeric strings', async () => {
  const r = await calculateManualBillLines([
    custom({ unitPrice: 0, taxRate: 0 }),
    custom({ name: 'B', unitPrice: '49.50', taxRate: '4.5', quantity: 2 }),
  ], {});
  assert.equal(r.lines[0].lineTotal, 0);
  assert.equal(r.lines[1].unitPrice, 49.5);
  assert.equal(r.lines[1].taxRate, 4.5);
  assert.equal(r.lines[1].taxAmount, 4.46); // 99 × 4.5% = 4.455 → 4.46
});

test('custom lines need an explicit tax rate only when tax is applied', async () => {
  const noRate = custom({ taxRate: undefined });
  await rejectWithDetails(
    calculateManualBillLines([noRate], {}),
    /explicit tax rate/
  );
  const res = await preview([noRate], {});
  assert.equal(res.status, 400);

  const off = await calculateManualBillLines([noRate], { applyTax: false });
  assert.equal(off.grandTotal, 150);
  assert.equal(off.lines[0].taxRate, 0);
  assert.equal(off.lines[0].configuredTaxRate, null);

  // An explicit 0 (exempt) is a valid, deliberate choice.
  const exempt = await calculateManualBillLines([custom({ taxRate: 0 })], {});
  assert.equal(exempt.totalTax, 0);
  assert.equal(exempt.lines[0].configuredTaxRate, 0);
});

test('custom line snapshots survive later catalog edits and carry through a mixed bill', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18, name: 'Original Product' });
  const kit = await makeKit([p], { discountPrice: 500, taxRate: 5, name: 'Original Kit' });
  const res = await finalize([
    { productId: p._id.toString(), quantity: 1 },
    { type: 'kit', kitId: kit._id.toString(), quantity: 1 },
    custom({ name: 'Loose Flowers', unitPrice: 40, taxRate: 0 }),
  ], {});
  assert.equal(res.status, 201);
  const { invoice } = await res.json();

  await Product.findByIdAndUpdate(p._id, { $set: { price: 999, taxRate: 0, name: 'Changed' } });
  await Kit.findByIdAndUpdate(kit._id, { $set: { discountPrice: 1, taxRate: 0, name: 'Changed Kit' } });

  const stored = await Invoice.findById(invoice._id).lean();
  assert.deepEqual(stored.lineItems.map((l) => l.lineType), ['product', 'kit', 'custom']);
  assert.deepEqual(stored.lineItems.map((l) => l.name), ['Original Product', 'Original Kit', 'Loose Flowers']);
  assert.deepEqual(stored.lineItems.map((l) => l.unitPrice), [100, 500, 40]);
  assert.equal(stored.grandTotal, 118 + 525 + 40);

  // Only the product line was stock-tracked.
  assert.equal(await InventoryLog.countDocuments({ invoiceId: invoice._id }), 1);
});

/* ═══════════════════════════ TAX TOGGLE + TOTALS ═════════════════════════ */

test('Haldi example: tax OFF bills the base price, tax ON adds the validated rate once', async () => {
  const haldi = await makeProduct({ name: 'Haldi', price: 150, taxRate: 4.5 });
  const items = [{ productId: haldi._id.toString(), quantity: 1 }];

  const off = await (await preview(items, { applyTax: false })).json();
  assert.equal(off.taxApplied, false);
  assert.equal(off.totals.grossTotal, 150);
  assert.equal(off.totals.totalTax, 0);
  assert.equal(off.totals.grandTotal, 150);
  assert.equal(off.lines[0].taxAmount, 0);
  assert.equal(off.lines[0].taxRate, 0);
  assert.deepEqual(off.taxBreakdown, []);
  assert.equal(off.gstBreakdown.cgst + off.gstBreakdown.sgst + off.gstBreakdown.igst, 0);

  const on = await (await preview(items, { applyTax: true, manualTaxRate: 4.5 })).json();
  assert.equal(on.taxApplied, true);
  assert.equal(on.totals.totalTax, 6.75);
  assert.equal(on.totals.grandTotal, 156.75);
  assert.deepEqual(on.taxBreakdown, [{ rate: 4.5, taxableValue: 150, taxAmount: 6.75 }]);
});

test('an omitted applyTax keeps the legacy taxed contract; non-booleans are rejected', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  const items = [{ productId: p._id.toString(), quantity: 1 }];
  const legacy = await (await preview(items)).json();
  assert.equal(legacy.totals.grandTotal, 118);

  for (const bad of ['false', 'true', 0, 1, 'no', {}, []]) {
    const res = await preview(items, { applyTax: bad });
    assert.equal(res.status, 400, `applyTax=${JSON.stringify(bad)} must be rejected`);
    assert.match((await res.json()).message, /applyTax/);
  }
});

test('mixed rates are taxed per line from the catalog and aggregated; no first-item rate is reused', async () => {
  const a = await makeProduct({ price: 100, taxRate: 18 });
  const b = await makeProduct({ price: 200, taxRate: 5 });
  const kit = await makeKit([a], { discountPrice: 300, taxRate: 12 });
  const items = [
    { productId: a._id.toString(), quantity: 1 },
    { productId: b._id.toString(), quantity: 1 },
    { type: 'kit', kitId: kit._id.toString(), quantity: 1 },
    custom({ unitPrice: 50, taxRate: 0 }),
  ];
  const on = await (await preview(items, {})).json();
  assert.deepEqual(on.lines.map((l) => l.taxRate), [18, 5, 12, 0]);
  assert.deepEqual(on.lines.map((l) => l.taxAmount), [18, 10, 36, 0]);
  assert.equal(on.totals.grossTotal, 650);
  assert.equal(on.totals.totalTax, 64);
  assert.equal(on.totals.grandTotal, 714);
  assert.deepEqual(on.taxBreakdown.map((r) => r.rate), [5, 12, 18]);

  const off = await (await preview(items, { applyTax: false })).json();
  assert.equal(off.totals.grandTotal, 650);
  assert.equal(off.totals.totalTax, 0);
  // The catalog classification is not discarded when tax is off.
  assert.deepEqual(off.lines.map((l) => l.configuredTaxRate), [18, 5, 12, 0]);
});

test('discount reduces the taxable value once and tax is charged on the discounted amount', async () => {
  const p = await makeProduct({ price: 200, taxRate: 10 });
  const items = [{ productId: p._id.toString(), quantity: 1, discount: 50 }];

  const on = await (await preview(items, { applyTax: true, manualTaxRate: 10 })).json();
  assert.equal(on.totals.grossTotal, 200);
  assert.equal(on.totals.discountTotal, 50);
  assert.equal(on.totals.taxableValue, 150);
  assert.equal(on.totals.totalTax, 15);
  assert.equal(on.totals.grandTotal, 165);

  const off = await (await preview(items, { applyTax: false })).json();
  assert.equal(off.totals.taxableValue, 150);
  assert.equal(off.totals.grandTotal, 150);
});

test('monetary rounding is per line, to the paisa, and totals add up exactly', async () => {
  const r = await calculateManualBillLines([
    custom({ name: 'A', unitPrice: 33.33, quantity: 3, taxRate: 5 }),   // 99.99 → tax 5.00 (4.9995)
    custom({ name: 'B', unitPrice: 0.01, quantity: 3, taxRate: 18 }),   // 0.03 → tax 0.01 (0.0054)
  ], {});
  assert.equal(r.lines[0].taxAmount, 5);
  assert.equal(r.lines[0].lineTotal, 104.99);
  assert.equal(r.lines[1].taxAmount, 0.01);
  assert.equal(r.totalTax, 5.01);
  assert.equal(r.grandTotal, 105.03);
  assert.equal(r.grandTotal, Math.round((r.taxableValue + r.totalTax) * 100) / 100);
});

test('GST split follows seller/customer state when tax is on, and is zero when tax is off', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  const items = [{ productId: p._id.toString(), quantity: 1 }];

  const intra = await (await preview(items, { applyTax: true, manualTaxRate: 18, customerState: 'Delhi' })).json();
  assert.deepEqual(intra.gstBreakdown, { igst: 0, cgst: 9, sgst: 9, isInterstate: false });

  const inter = await (await preview(items, { applyTax: true, manualTaxRate: 18, customerState: 'Maharashtra' })).json();
  assert.deepEqual(inter.gstBreakdown, { igst: 18, cgst: 0, sgst: 0, isInterstate: true });

  // A different seller registration state flips the same customer to inter-state.
  await configureRegistration({ id: 'reg_mh', state: 'Maharashtra', gstin: '27AACCZ8054C1ZB', stateCode: '27', isDefault: true });
  const flipped = await (await preview(items, { applyTax: true, manualTaxRate: 18, customerState: 'Delhi', registrationId: 'reg_mh' })).json();
  assert.equal(flipped.gstBreakdown.isInterstate, true);

  const off = await (await preview(items, { applyTax: false, customerState: 'Maharashtra' })).json();
  assert.equal(off.gstBreakdown.igst, 0);
  assert.equal(off.gstBreakdown.cgst, 0);
  assert.equal(off.totals.grandTotal, 100);
});

test('preview and finalized invoice agree for all three tax modes', async () => {
  const p = await makeProduct({ price: 149.99, taxRate: 12 });
  const kit = await makeKit([p], { discountPrice: 333.33, taxRate: 5 });
  for (const taxInput of [{ applyTax: true, manualTaxRate: 12 }, { applyTax: false }, {}]) {
    const items = [
      { productId: p._id.toString(), quantity: 3, discount: 7.5 },
      { type: 'kit', kitId: kit._id.toString(), quantity: 2 },
      custom({ unitPrice: 19.99, quantity: 4, taxRate: 18 }),
    ];
    const pv = await (await preview(items, { ...taxInput, customerState: 'Maharashtra' })).json();
    const res = await finalize(items, {
      ...taxInput, expectedGrandTotal: pv.totals.grandTotal, expectedTotalTax: pv.totals.totalTax,
      customer: { name: 'Parity Customer', phone: '9876500101', state: 'Maharashtra' },
    });
    assert.equal(res.status, 201);
    const { invoice } = await res.json();

    assert.equal(invoice.taxApplied, taxInput.applyTax !== false);
    assert.equal(invoice.taxMode, pv.taxMode);
    assert.equal(invoice.manualTaxRate ?? null, pv.manualTaxRate);
    assert.equal(invoice.taxableValue, pv.totals.taxableValue);
    assert.equal(Math.round(invoice.lineItems.reduce((t, l) => t + l.lineTotal, 0) * 100) / 100, invoice.grandTotal, 'line totals add up to the grand total');
    assert.equal(invoice.grandTotal, pv.totals.grandTotal);
    assert.equal(invoice.totalGST, pv.totals.totalTax);
    assert.deepEqual(invoice.gstBreakdown, pv.gstBreakdown);
    assert.deepEqual(
      invoice.lineItems.map((l) => [l.lineType, l.unitPrice, l.discount, l.taxRate, l.taxAmount, l.lineTotal]),
      pv.lines.map((l) => [l.lineType, l.unitPrice, l.discount, l.taxRate, l.taxAmount, l.lineTotal])
    );
  }
});

test('client-supplied totals, rates and stale expectations never change what is billed', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  const items = [{
    productId: p._id.toString(), quantity: 1,
    unitPrice: 1, taxRate: 0, taxAmount: 0, lineTotal: 1, lineType: 'custom',
  }];
  const tampered = {
    applyTax: true, manualTaxRate: 18, grandTotal: 1, totalTax: 0, totals: { grandTotal: 1 }, taxBreakdown: [],
    gstBreakdown: { cgst: 0, sgst: 0, igst: 0 }, stockDeducted: true, status: 'cancelled', invoiceNumber: 'HACK-1',
    taxRate: 0, billTaxRate: 0,
  };

  const pv = await (await preview(items, tampered)).json();
  assert.equal(pv.totals.grandTotal, 118);
  assert.equal(pv.lines[0].lineType, 'product');

  // A manipulated "what I saw" total is refused (409) and nothing is persisted.
  const stale = await finalize(items, { ...tampered, expectedGrandTotal: 1 });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).message, /total changed since the preview/);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal(await InvoiceCounter.countDocuments(), 0);
  assert.equal(await OfflinePayment.countDocuments(), 0);
  assert.equal((await Product.findById(p._id).lean()).stock, 100);

  // The honest total passes, and protected fields still come from the server.
  const ok = await finalize(items, { ...tampered, expectedGrandTotal: 118 });
  assert.equal(ok.status, 201);
  const { invoice } = await ok.json();
  assert.equal(invoice.grandTotal, 118);
  assert.equal(invoice.status, 'active');
  assert.match(invoice.invoiceNumber, /^MAN-/);
  assert.equal(invoice.stockDeducted, true);
});

test('a catalog price change between preview and finalize is caught by the stale-total guard', async () => {
  const p = await makeProduct({ price: 100, taxRate: 0 });
  const items = [{ productId: p._id.toString(), quantity: 1 }];
  const pv = await (await preview(items, { applyTax: false })).json();
  await Product.findByIdAndUpdate(p._id, { $set: { price: 120 } });
  const res = await finalize(items, { applyTax: false, expectedGrandTotal: pv.totals.grandTotal });
  assert.equal(res.status, 409);
  assert.equal(await Invoice.countDocuments(), 0);
});

/* ═══════════════════ PAYMENTS / IDEMPOTENCY / REGRESSION ═════════════════ */

test('payment limits follow the (untaxed) bill total; partial payments still track the balance', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  const items = [{ productId: p._id.toString(), quantity: 1 }];

  // 118 would be fine on a taxed bill but is an overpayment on the untaxed 100.
  const over = await finalize(items, { applyTax: false, payment: { amount: 118, method: 'CASH' } });
  assert.equal(over.status, 400);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal(await OfflinePayment.countDocuments(), 0);
  assert.equal((await Product.findById(p._id).lean()).stock, 100);

  const part = await finalize(items, { applyTax: false, payment: { amount: 40, method: 'UPI' } });
  assert.equal(part.status, 201);
  const { invoice } = await part.json();
  assert.equal(invoice.paymentType, 'PARTIAL');
  assert.equal(invoice.amountPaid, 40);
  assert.equal(invoice.outstandingAfter, 60);
  assert.equal(await OfflinePayment.countDocuments({ invoiceId: invoice._id }), 1);
});

test('retrying a custom-item bill with the same key yields one invoice and one receipt', async () => {
  const body = {
    idempotencyKey: 'ext-idem-0000001',
    registrationId: 'reg_test',
    customer: { name: 'Idem Ext', phone: '9876500102' },
    items: [custom({ unitPrice: 80, quantity: 2, taxRate: 0 })],
    applyTax: false,
    payment: { amount: 160, method: 'CASH' },
  };
  const r1 = await api('POST', '/api/admin/manual-billing/invoices', body);
  const r2 = await api('POST', '/api/admin/manual-billing/invoices', body);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).idempotentReplay, true);
  assert.equal(await Invoice.countDocuments({ source: 'manual' }), 1);
  assert.equal(await OfflinePayment.countDocuments(), 1);
  assert.equal(await PaymentLedger.countDocuments(), 0);
  assert.equal(await Booking.countDocuments(), 0);
});

test('fallback seller identity still requires explicit confirmation for custom/untaxed bills', async () => {
  await SystemSettings.deleteMany({});
  settingsService.invalidate();
  const res = await api('POST', '/api/admin/manual-billing/invoices', {
    idempotencyKey: 'ext-fallback-0001',
    registrationId: 'fallback',
    customer: { name: 'Walk In', phone: '9876543210' },
    items: [custom({ taxRate: 0 })],
    applyTax: false,
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /fallback/i);
  assert.equal(await Invoice.countDocuments(), 0);
});

test('catalog endpoint is admin-only', async () => {
  const anon = await api('GET', '/api/admin/manual-billing/catalog?search=x', undefined, null);
  assert.equal(anon.status, 401);
  const nonAdmin = await api('GET', '/api/admin/manual-billing/catalog?search=x', undefined, userToken);
  assert.equal(nonAdmin.status, 403);
});

test('booking invoices gain no tax flag, and manual invoices record it explicitly', async () => {
  assert.equal(Invoice.schema.path('taxApplied').options.default, undefined);

  const off = await (await finalize([custom({ taxRate: 0 })], { applyTax: false })).json();
  const on  = await (await finalize([custom({ taxRate: 0 })], { applyTax: true, manualTaxRate: 5 })).json();
  assert.equal(off.invoice.taxApplied, false);
  assert.equal(on.invoice.taxApplied, true);
});


/* ═══════════════ MANUAL BILL-LEVEL TAX PERCENTAGE ════════════════════════ */

// Illustrative scenario: gross 5150, discount 2000, base 3150, 5% → 157.50 → 3307.50.
async function scenarioItems() {
  const a = await makeProduct({ price: 1000, taxRate: 18 });   // 3 × 1000, discount 1200
  const b = await makeProduct({ price: 2150, taxRate: 0 });    // 1 × 2150, discount 800
  return [
    { productId: a._id.toString(), quantity: 3, discount: 1200 },
    { productId: b._id.toString(), quantity: 1, discount: 800 },
  ];
}

test('manual rate: tax = round(discounted base × percentage / 100, 2), applied once', async () => {
  const items = await scenarioItems();
  const body = await (await preview(items, { applyTax: true, manualTaxRate: 5 })).json();
  assert.equal(body.taxMode, 'manual_bill_rate');
  assert.equal(body.manualTaxRate, 5);
  assert.equal(body.totals.grossTotal, 5150);
  assert.equal(body.totals.discountTotal, 2000);
  assert.equal(body.totals.taxableValue, 3150);
  assert.equal(body.totals.totalTax, 157.5);
  assert.equal(body.totals.grandTotal, 3307.5);
  assert.deepEqual(body.taxBreakdown, [{ rate: 5, taxableValue: 3150, taxAmount: 157.5 }]);
  // Discount counted once, tax once: line totals add up to the same grand total.
  const lineSum = Math.round(body.lines.reduce((t, l) => t + l.lineTotal, 0) * 100) / 100;
  assert.equal(lineSum, 3307.5);
});

test('manual rate overrides catalog/kit/custom rates but keeps their classification', async () => {
  const p = await makeProduct({ price: 100, taxRate: 18 });
  const kit = await makeKit([p], { discountPrice: 200, taxRate: 12 });
  const items = [
    { productId: p._id.toString(), quantity: 1 },
    { type: 'kit', kitId: kit._id.toString(), quantity: 1 },
    custom({ unitPrice: 100, taxRate: 28 }),
  ];
  const body = await (await preview(items, { applyTax: true, manualTaxRate: 5 })).json();
  assert.equal(body.totals.taxableValue, 400);
  assert.equal(body.totals.totalTax, 20);          // 5% of 400 — not 18 / 12 / 28
  assert.equal(body.totals.grandTotal, 420);
  assert.deepEqual(body.lines.map((l) => l.taxRate), [5, 5, 5]);
  assert.deepEqual(body.lines.map((l) => l.configuredTaxRate), [18, 12, 28]);
  assert.deepEqual(body.lines.map((l) => l.taxAmount), [5, 10, 5]);

  // A custom line needs NO tax rate of its own under a manual bill rate.
  const noRate = await preview([custom({ taxRate: undefined })], { applyTax: true, manualTaxRate: 5 });
  assert.equal(noRate.status, 200);
});

test('changing the percentage changes tax and total; 0 is an explicit valid rate', async () => {
  const items = await scenarioItems();
  const totals = {};
  for (const rate of [0, 5, 12, 18, 7.25]) {
    totals[rate] = (await (await preview(items, { applyTax: true, manualTaxRate: rate })).json()).totals;
  }
  assert.equal(totals[0].totalTax, 0);
  assert.equal(totals[0].grandTotal, 3150);
  assert.equal(totals[12].totalTax, 378);
  assert.equal(totals[12].grandTotal, 3528);
  assert.equal(totals[18].totalTax, 567);
  assert.equal(totals[7.25].totalTax, 228.38);      // 3150 × 7.25% = 228.375 → 228.38
  assert.equal(totals[7.25].grandTotal, 3378.38);
  const typed = await (await preview(items, { applyTax: true, manualTaxRate: '12' })).json();
  assert.equal(typed.totals.grandTotal, 3528);       // numeric string, as typed
});

test('line tax shares are whole paise and always sum to the bill tax', async () => {
  const lines = [];
  for (let i = 0; i < 7; i += 1) {
    lines.push(custom({ name: `L${i}`, unitPrice: 33.33 + i, quantity: 1 + (i % 3), taxRate: 0 }));
  }
  const r = await calculateManualBillLines(lines, { applyTax: true, manualTaxRate: 5.55 });
  const sumTaxPaise = Math.round(r.lines.reduce((t, l) => t + l.taxAmount, 0) * 100);
  assert.equal(sumTaxPaise, Math.round(r.totalTax * 100));
  assert.equal(r.totalTax, Math.round(r.taxableValue * 5.55) / 100);
  for (const l of r.lines) {
    assert.ok(Math.abs(l.taxAmount * 100 - Math.round(l.taxAmount * 100)) < 1e-6);
  }
  assert.equal(r.grandTotal, Math.round((r.taxableValue + r.totalTax) * 100) / 100);
});

test('tax OFF ignores any (even invalid) percentage the client still sends', async () => {
  const items = await scenarioItems();
  for (const stale of [18, '18', 'abc', -5, 500, null]) {
    const res = await preview(items, { applyTax: false, manualTaxRate: stale });
    assert.equal(res.status, 200, `stale rate ${String(stale)} must not matter when tax is off`);
    const body = await res.json();
    assert.equal(body.taxMode, 'none');
    assert.equal(body.manualTaxRate, null);
    assert.equal(body.totals.totalTax, 0);
    assert.equal(body.totals.grandTotal, 3150);
    assert.ok(body.lines.every((l) => l.taxRate === 0 && l.taxAmount === 0));
  }
  const fin = await finalize(items, { applyTax: false, manualTaxRate: 18 });
  assert.equal(fin.status, 201);
  const { invoice } = await fin.json();
  assert.equal(invoice.taxApplied, false);
  assert.equal(invoice.taxMode, 'none');
  assert.equal(invoice.manualTaxRate ?? null, null);
  assert.equal(invoice.totalGST, 0);
  assert.equal(invoice.grandTotal, 3150);
});

test('tax ON requires a valid percentage — missing, malformed and out-of-range are rejected', async () => {
  const items = await scenarioItems();
  for (const rate of [undefined, null, '']) {
    const res = await preview(items, { applyTax: true, manualTaxRate: rate });
    assert.equal(res.status, 400, `rate ${String(rate)}`);
    assert.match(JSON.stringify(await res.json()), /tax percentage is required/);
  }
  const invalid = [-1, -0.01, 100.01, 101, 1000, 5.555, '5.555', 'abc', '5%', '1e1', ' ', NaN,
    true, false, [], {}, { $gt: 0 }, '0x10', '--5'];
  for (const rate of invalid) {
    const res = await preview(items, { applyTax: true, manualTaxRate: rate });
    assert.equal(res.status, 400, `rate ${JSON.stringify(rate)} must be rejected`);
  }
  for (const rate of [0, 100, 0.01, '99.99']) {
    const res = await preview(items, { applyTax: true, manualTaxRate: rate });
    assert.equal(res.status, 200, `rate ${rate} is within range`);
  }
  // Finalize rejects too, with nothing persisted or consumed.
  assert.equal((await finalize(items, { applyTax: true, manualTaxRate: 'abc' })).status, 400);
  assert.equal((await finalize(items, { applyTax: true })).status, 400);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal(await InvoiceCounter.countDocuments(), 0);
  assert.equal(await OfflinePayment.countDocuments(), 0);
  assert.equal(await InventoryLog.countDocuments(), 0);
});

test('a percentage without an explicit applyTax is refused (no silent mode guess)', async () => {
  const items = await scenarioItems();
  const res = await preview(items, { manualTaxRate: 5 });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /applyTax/);
});

test('manual rate is persisted for audit and the GST split follows seller/customer state', async () => {
  const items = await scenarioItems();
  const intra = await (await finalize(items, {
    applyTax: true, manualTaxRate: 5, expectedGrandTotal: 3307.5, expectedTotalTax: 157.5,
    customer: { name: 'Intra', phone: '9876500111', state: 'Delhi' },
  })).json();
  const inv = intra.invoice;
  assert.equal(inv.taxApplied, true);
  assert.equal(inv.taxMode, 'manual_bill_rate');
  assert.equal(inv.manualTaxRate, 5);
  assert.equal(inv.taxableValue, 3150);
  assert.equal(inv.totalGST, 157.5);
  assert.equal(inv.grandTotal, 3307.5);
  assert.deepEqual(inv.gstBreakdown, { igst: 0, cgst: 78.75, sgst: 78.75, isInterstate: false });
  assert.deepEqual(inv.lineItems.map((l) => l.configuredTaxRate), [18, 0]);
  assert.equal(inv.sellerSnapshot.gstin, '07AACCZ8054C1ZB');

  const inter = await (await finalize(items, {
    applyTax: true, manualTaxRate: 5,
    customer: { name: 'Inter', phone: '9876500112', state: 'Karnataka' },
  })).json();
  assert.deepEqual(inter.invoice.gstBreakdown, { igst: 157.5, cgst: 0, sgst: 0, isInterstate: true });
  assert.equal(inter.invoice.grandTotal, 3307.5);

  // The stored document is stable against later catalog edits.
  await Product.updateMany({}, { $set: { price: 1, taxRate: 99 } });
  const stored = await Invoice.findById(inv._id).lean();
  assert.equal(stored.grandTotal, 3307.5);
  assert.equal(stored.manualTaxRate, 5);
});

test('client-supplied tax amounts and totals cannot override the server; stale tax is refused', async () => {
  const items = await scenarioItems();
  const tampered = {
    applyTax: true, manualTaxRate: 5,
    taxAmount: 0, totalTax: 0, totalGST: 0, grandTotal: 1, taxableValue: 1, taxMode: 'none', taxApplied: false,
    gstBreakdown: { cgst: 0, sgst: 0, igst: 0 }, taxBreakdown: [],
  };
  const pv = await (await preview(items, tampered)).json();
  assert.equal(pv.totals.totalTax, 157.5);
  assert.equal(pv.totals.grandTotal, 3307.5);
  assert.equal(pv.taxMode, 'manual_bill_rate');

  // A preview taken at 5% cannot be used to finalize at 18%.
  const staleRate = await finalize(items, {
    applyTax: true, manualTaxRate: 18, expectedGrandTotal: 3307.5, expectedTotalTax: 157.5,
  });
  assert.equal(staleRate.status, 409);
  const staleTax = await finalize(items, { ...tampered, expectedGrandTotal: 3307.5, expectedTotalTax: 0 });
  assert.equal(staleTax.status, 409);
  assert.match((await staleTax.json()).message, /tax changed since the preview/);
  assert.equal(await Invoice.countDocuments(), 0);
  assert.equal(await InvoiceCounter.countDocuments(), 0);

  const ok = await finalize(items, { ...tampered, expectedGrandTotal: 3307.5, expectedTotalTax: 157.5 });
  assert.equal(ok.status, 201);
  const { invoice } = await ok.json();
  assert.equal(invoice.grandTotal, 3307.5);
  assert.equal(invoice.totalGST, 157.5);
  assert.equal(invoice.taxMode, 'manual_bill_rate');
});

test('manual-rate bills keep stock, kit, custom, payment and idempotency behaviour', async () => {
  const stocked = await makeProduct({ price: 100, stock: 5, taxRate: 18 });
  const kitProduct = await makeProduct({ stock: 9 });
  const kit = await makeKit([kitProduct], { discountPrice: 300, taxRate: 0 });
  const body = {
    idempotencyKey: 'ext-manual-rate-0001',
    registrationId: 'reg_test',
    customer: { name: 'Manual Rate', phone: '9876500113', state: 'Delhi' },
    items: [
      { productId: stocked._id.toString(), quantity: 2 },
      { type: 'kit', kitId: kit._id.toString(), quantity: 1 },
      custom({ unitPrice: 50, taxRate: undefined }),
    ],
    applyTax: true, manualTaxRate: 10,
    payment: { amount: 100, method: 'CASH' },
  };
  const r1 = await api('POST', '/api/admin/manual-billing/invoices', body);
  const r2 = await api('POST', '/api/admin/manual-billing/invoices', body);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).idempotentReplay, true);
  const { invoice } = await r1.json();
  assert.match(invoice.invoiceNumber, /^MAN-\d{4}-\d{6}$/);
  assert.equal(invoice.taxableValue, 550);           // 200 + 300 + 50
  assert.equal(invoice.totalGST, 55);
  assert.equal(invoice.grandTotal, 605);
  assert.equal(invoice.outstandingAfter, 505);

  assert.equal(await Invoice.countDocuments({ source: 'manual' }), 1);
  assert.equal(await OfflinePayment.countDocuments(), 1);
  assert.equal((await Product.findById(stocked._id).lean()).stock, 3);      // product line deducted once
  assert.equal((await Product.findById(kitProduct._id).lean()).stock, 9);   // kit components untouched
  assert.equal(await InventoryLog.countDocuments({ invoiceId: invoice._id }), 1);

  // Overpaying relative to the taxed total is still rejected; cancellation restores once.
  const over = await finalize([custom({ taxRate: undefined })], { applyTax: true, manualTaxRate: 10, payment: { amount: 200, method: 'CASH' } });
  assert.equal(over.status, 400);   // total is 165
  const cancel = await api('PATCH', `/api/admin/invoices/${invoice._id}/cancel`, { reason: 'test' });
  assert.equal(cancel.status, 200);
  assert.equal((await Product.findById(stocked._id).lean()).stock, 5);
});
