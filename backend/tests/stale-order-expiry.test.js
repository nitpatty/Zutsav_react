/**
 * Stale pending marketplace orders — safe expiry (services/staleOrderSweep.js) and its interaction with
 * payment retry and late payments.
 *
 * ISOLATION: real code against a LOCAL `*_test` database only (any other URI is refused). PhonePe is a
 * per-transaction stub — no payment request, no network, no production data.
 *
 * Run:  backend> node --test tests/stale-order-expiry.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'stale-order-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_stale_order_test';
{
  const u = new URL(TEST_URI);
  const dbName = u.pathname.replace(/^\//, '');
  if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || !/_test$/.test(dbName)) {
    throw new Error(`Refusing to run: MONGO_URI_TEST must be a local database whose name ends in "_test" (got host "${u.hostname}", db "${dbName}")`);
  }
}

const phonepe = require('../src/utils/phonepe');
const statusQueries = [];
const gatewayState = new Map();
const PENDING = { success: false, code: 'PENDING', state: 'PENDING', transactionId: null };
const FAILED  = { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED', transactionId: null };
const PAID    = (id) => ({ success: true, code: 'PAYMENT_SUCCESS', state: 'COMPLETED', transactionId: id });
let createFailures = 0;
phonepe.createPhonePeOrder = async (args) => {
  if (createFailures > 0) { createFailures -= 1; throw new Error('gateway unavailable'); }
  return { redirectUrl: `https://pay.example.invalid/redirect/${args.merchantTransactionId}` };
};
phonepe.checkPhonePeStatus = async (txn) => {
  statusQueries.push(txn);
  const v = gatewayState.has(txn) ? gatewayState.get(txn) : PENDING;
  if (v instanceof Error) throw v;
  return v;
};
phonepe.verifyWebhookChecksum = async () => true;

const { NotificationEngine } = require('../notification-engine');
const emitted = [];
NotificationEngine.emit = async (event) => { emitted.push(event); };

const Product         = require('../src/models/Product');
const Order           = require('../src/models/Order');
const InventoryLog    = require('../src/models/InventoryLog');
const CheckoutRequest = require('../src/models/CheckoutRequest');
const checkout        = require('../src/controllers/checkout.controller');
const retry           = require('../src/controllers/orderRetry.controller');
const ordersConfig    = require('../src/config/orders.config');
const { sweepStalePendingOrders } = require('../src/services/staleOrderSweep');
const cleanupJobs     = require('../src/utils/cleanupJobs');

const oid = () => new mongoose.Types.ObjectId();
let _n = 0;
const mockRes = () => ({ statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, set(k, v) { this.headers[k] = v; return this; } });
async function call(handler, req) { const res = mockRes(); let e = null; await handler(req, res, (x) => { e = x; }); if (e) throw e; return res; }
const user = { _id: oid(), name: 'Asha Test', email: 'asha@example.invalid', phone: '9111111111' };
const ADDRESS = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'X' };
const KEY = (s) => `sweep-key-${s}-0123456789abcdef`;
const verify = (txn, who = user) => call(checkout.verifyCartPayment, { user: who, params: { merchantTransactionId: txn } });
const webhook = (txn, transactionId) => call(checkout.cartWebhook, {
  body: { response: Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: txn, transactionId } })).toString('base64') },
  headers: { 'x-verify': 'stub' },
});
const retryPayment = (orderId, key) => call(retry.retryOrderPayment, { user, params: { id: String(orderId) }, body: { idempotencyKey: key } });
const waitFor = async (fn, ms = 1500) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

const EXPIRY = ordersConfig.resolvePendingOrderExpiry('60'); // 60-minute lifetime for these tests
const backdate = (id, minutes) => Order.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(Date.now() - minutes * 60_000) } });

async function placedOrder({ ageMinutes = 0, stock = 20, qty = 2, price = 100, taxRate = 18 } = {}) {
  _n += 1;
  const product = await Product.create({ name: `Sweep Product ${_n}`, slug: `sweep-product-${_n}`, category: 'test', price, stock, taxRate });
  const res = await call(checkout.cartCheckout, { user, body: { products: [{ productId: product._id, quantity: qty }], shippingAddress: ADDRESS } });
  assert.equal(res.statusCode, 201);
  if (ageMinutes) await backdate(res.body.order._id, ageMinutes);
  return { product, orderId: res.body.order._id, txn1: res.body.merchantTransactionId };
}
const reload = (id) => Order.findById(id).lean();
const expiryEntries = (o) => o.statusTimeline.filter((t) => t.status === 'payment_failed');

before(async () => { await mongoose.connect(TEST_URI); await CheckoutRequest.init(); await Order.init(); });
beforeEach(async () => {
  statusQueries.length = 0; emitted.length = 0; gatewayState.clear(); createFailures = 0;
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({}), CheckoutRequest.deleteMany({})]);
});
after(async () => {
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({}), CheckoutRequest.deleteMany({})]);
  await mongoose.disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('expiry policy configuration — nothing is invented', () => {
  test('unset → disabled, valid (just off)', () => {
    for (const raw of [undefined, '', '   ']) {
      const r = ordersConfig.resolvePendingOrderExpiry(raw);
      assert.equal(r.enabled, false);
      assert.equal(r.valid, true);
      assert.match(r.reason, /not set/);
    }
  });

  test('malformed or too-short values fail safe: disabled AND reported as invalid', () => {
    for (const raw of ['abc', '12', '29', '30.5', '-60', '1e3', '0', '60min']) {
      const r = ordersConfig.resolvePendingOrderExpiry(raw);
      assert.equal(r.enabled, false, raw);
      assert.equal(r.valid, false, raw);
      assert.ok(r.reason.length > 10);
    }
  });

  test('a whole number of minutes ≥ 30 enables expiry with exactly that lifetime', () => {
    const r = ordersConfig.resolvePendingOrderExpiry('30');
    assert.deepEqual([r.enabled, r.minutes, r.ms], [true, 30, 30 * 60_000]);
    assert.equal(ordersConfig.resolvePendingOrderExpiry('1440').ms, 86_400_000);
  });

  test('the sweep does nothing — and says why — when expiry is disabled or invalid', async () => {
    const { orderId } = await placedOrder({ ageMinutes: 60 * 24 * 365 });
    for (const raw of [undefined, 'abc', '10']) {
      const s = await sweepStalePendingOrders({ expiry: ordersConfig.resolvePendingOrderExpiry(raw) });
      assert.equal(s.enabled, false);
      assert.equal(s.scanned, 0);
      assert.ok(s.reason);
    }
    assert.equal((await reload(orderId)).status, 'pending_payment');
    assert.equal(statusQueries.length, 0);
  });

  test('the scheduled job schedules NO timer when expiry is off', () => {
    const before = process._getActiveHandles ? process._getActiveHandles().length : 0;
    delete process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES;
    cleanupJobs.startStaleOrderSweepJob();
    const afterCount = process._getActiveHandles ? process._getActiveHandles().length : 0;
    assert.equal(afterCount, before);
  });
});

describe('which orders are expired', () => {
  test('a stale, unpaid order whose attempts all ended without payment is expired — history preserved', async () => {
    const { orderId, txn1 } = await placedOrder({ ageMinutes: 90 });
    gatewayState.set(txn1, FAILED);
    const s = await sweepStalePendingOrders({ expiry: EXPIRY });

    assert.equal(s.expired, 1);
    const o = await reload(orderId);
    assert.equal(o.status, 'payment_failed');
    assert.equal(expiryEntries(o).length, 1);
    assert.match(expiryEntries(o)[0].note, /^Expired: no payment received within 60 minutes/);
    assert.equal(o.paymentAttempts.length, 1);                       // attempt kept…
    assert.equal(o.paymentAttempts[0].status, 'FAILED');             // …with the outcome the gateway gave
    assert.equal(o.items.length, 1);                                 // order data intact
    assert.equal(await Order.countDocuments(), 1);                   // never deleted
    assert.equal(emitted.filter((e) => e === 'ORDER_CANCELLED').length, 0, 'no misleading cancellation notice');
  });

  test('a recent pending order is left alone (and the gateway is not even asked)', async () => {
    const { orderId } = await placedOrder({ ageMinutes: 10 });
    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.scanned, 0);
    assert.equal((await reload(orderId)).status, 'pending_payment');
    assert.equal(statusQueries.length, 0);
  });

  test('paid and every other non-pending status are never touched', async () => {
    const ids = [];
    for (const patch of [
      { status: 'paid', phonePeTransactionId: 'GT-1' }, { status: 'confirmed', phonePeTransactionId: 'GT-1' },
      { status: 'shipped', phonePeTransactionId: 'GT-1' }, { status: 'delivered', phonePeTransactionId: 'GT-1' },
      { status: 'cancelled' }, { status: 'refunded', phonePeTransactionId: 'GT-1' }, { status: 'payment_failed' },
    ]) {
      const { orderId } = await placedOrder({ ageMinutes: 600 });
      await Order.updateOne({ _id: orderId }, { $set: patch });
      ids.push([orderId, patch.status]);
    }
    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.scanned, 0);
    for (const [id, status] of ids) assert.equal((await reload(id)).status, status);
    assert.equal(statusQueries.length, 0);
  });

  test('the cutoff uses the ORIGINAL creation time — a recent retry attempt does not extend the life', async () => {
    const { orderId, txn1 } = await placedOrder({ ageMinutes: 70 });
    gatewayState.set(txn1, FAILED);
    // a retry started at ~minute 50 (inside the window) — it failed too
    await backdate(orderId, 50);
    const r = await retryPayment(orderId, KEY('extend'));
    assert.equal(r.statusCode, 201);
    gatewayState.set(r.body.merchantTransactionId, FAILED);
    await backdate(orderId, 70); // …and now the order is 70 minutes old, retry or not

    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.expired, 1);
    assert.equal((await reload(orderId)).status, 'payment_failed');
  });

  test('an attempt that never reached the gateway (INITIATION_FAILED) lets the order expire without querying it', async () => {
    _n += 1;
    const product = await Product.create({ name: `NoGw ${_n}`, slug: `nogw-${_n}`, category: 'test', price: 100, stock: 5 });
    createFailures = 1;
    await assert.rejects(call(checkout.cartCheckout, { user, body: { products: [{ productId: product._id, quantity: 1 }], shippingAddress: ADDRESS } }), /gateway unavailable/);
    const o0 = await Order.findOne({});
    assert.equal(o0.paymentAttempts[0].status, 'INITIATION_FAILED');
    await backdate(o0._id, 90);

    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.expired, 1);
    assert.equal(statusQueries.length, 0, 'no money can have moved, so the gateway is not asked');
    assert.equal((await reload(o0._id)).status, 'payment_failed');
  });
});

describe('uncertain outcomes are never expired', () => {
  test('gateway still PENDING / gateway error / no state → left pending, reported, retried next run', async () => {
    const pendingOne = await placedOrder({ ageMinutes: 90 });
    const errorOne = await placedOrder({ ageMinutes: 90 });
    const noStateOne = await placedOrder({ ageMinutes: 90 });
    gatewayState.set(pendingOne.txn1, PENDING);
    gatewayState.set(errorOne.txn1, new Error('gateway timeout'));
    gatewayState.set(noStateOne.txn1, { success: false, code: 'PAYMENT_ERROR' });

    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.expired, 0);
    assert.equal(s.skippedInProgress, 1);
    assert.equal(s.skippedUncertain, 2);
    for (const x of [pendingOne, errorOne, noStateOne]) assert.equal((await reload(x.orderId)).status, 'pending_payment');

    // next run, the gateway has an answer
    gatewayState.set(pendingOne.txn1, FAILED);
    assert.equal((await sweepStalePendingOrders({ expiry: EXPIRY })).expired, 1);
    assert.equal((await reload(pendingOne.orderId)).status, 'payment_failed');
  });

  test('if the gateway says the order WAS paid, it is settled as paid — never expired — and stock is deducted once', async () => {
    const { orderId, product, txn1 } = await placedOrder({ ageMinutes: 90, stock: 10, qty: 3 });
    gatewayState.set(txn1, PAID('GT-SWEEP'));
    const s = await sweepStalePendingOrders({ expiry: EXPIRY });

    assert.equal(s.settledPaid, 1);
    assert.equal(s.expired, 0);
    const o = await reload(orderId);
    assert.equal(o.status, 'paid');
    assert.equal(o.paymentAttempts[0].status, 'SUCCESS');
    assert.equal(expiryEntries(o).length, 0);
    assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 7));
    await sweepStalePendingOrders({ expiry: EXPIRY });          // a second run changes nothing
    assert.equal((await Product.findById(product._id)).stock, 7);
  });

  test('an order with a retry attempt still PENDING at the gateway is not expired', async () => {
    const { orderId, txn1 } = await placedOrder({ ageMinutes: 20 });
    gatewayState.set(txn1, FAILED);
    const r = await retryPayment(orderId, KEY('live'));
    gatewayState.set(r.body.merchantTransactionId, PENDING);   // customer is on the payment page
    await backdate(orderId, 90);

    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.expired, 0);
    assert.equal(s.skippedInProgress, 1);
    assert.equal((await reload(orderId)).status, 'pending_payment');
  });
});

describe('idempotency, concurrency and races', () => {
  test('running the sweep repeatedly does not duplicate the timeline entry or re-process the order', async () => {
    const { orderId, txn1 } = await placedOrder({ ageMinutes: 90 });
    gatewayState.set(txn1, FAILED);
    const first = await sweepStalePendingOrders({ expiry: EXPIRY });
    const second = await sweepStalePendingOrders({ expiry: EXPIRY });
    const third = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(first.expired, 1);
    assert.equal(second.scanned + third.scanned, 0);
    assert.equal(expiryEntries(await reload(orderId)).length, 1);
  });

  test('several workers sweeping at the same moment expire the order exactly once', async () => {
    const orders = [];
    for (let i = 0; i < 4; i += 1) { const o = await placedOrder({ ageMinutes: 90 }); gatewayState.set(o.txn1, FAILED); orders.push(o); }
    const runs = await Promise.all(Array.from({ length: 5 }, () => sweepStalePendingOrders({ expiry: EXPIRY })));

    assert.equal(runs.reduce((n, r) => n + r.expired, 0), 4, 'each order is expired by exactly one worker');
    for (const o of orders) {
      const doc = await reload(o.orderId);
      assert.equal(doc.status, 'payment_failed');
      assert.equal(expiryEntries(doc).length, 1);
    }
  });

  test('sweep racing payment confirmation: the order ends paid OR expired — never both, never a lost payment', async () => {
    for (let i = 0; i < 6; i += 1) {
      const { orderId, product, txn1 } = await placedOrder({ ageMinutes: 90, stock: 10, qty: 2 });
      gatewayState.set(txn1, PAID(`GT-RACE-${i}`));
      const [s, v, w] = await Promise.all([sweepStalePendingOrders({ expiry: EXPIRY }), verify(txn1), webhook(txn1, `GT-RACE-${i}`)]);

      const o = await reload(orderId);
      assert.equal(o.status, 'paid', 'a confirmed payment always wins over expiry');
      assert.equal(expiryEntries(o).length, 0);
      assert.equal(o.paymentAttempts.filter((a) => a.status === 'SUCCESS').length, 1);
      assert.equal(o.paymentAttempts.filter((a) => a.needsReconciliation).length, 0);
      assert.equal(v.statusCode, 200);
      assert.ok(s.expired === 0);
      assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 8));
      await new Promise((r) => setTimeout(r, 40));
      assert.equal((await Product.findById(product._id)).stock, 8, 'stock deducted exactly once');
      assert.equal(w.statusCode, 200);
    }
  });

  test('a payment that lands AFTER the order was expired is recorded for reconciliation, never reopening the order', async () => {
    const { orderId, product, txn1 } = await placedOrder({ ageMinutes: 90, stock: 10, qty: 2 });
    gatewayState.set(txn1, FAILED);
    assert.equal((await sweepStalePendingOrders({ expiry: EXPIRY })).expired, 1);

    gatewayState.set(txn1, PAID('GT-VERY-LATE'));              // the gateway later reports a success
    const v = await verify(txn1);
    assert.equal(v.body.success, false);
    assert.equal(v.body.code, 'PAYMENT_NEEDS_REVIEW');
    assert.equal(v.body.reconciliation, 'PAID_AFTER_EXPIRY');
    await webhook(txn1, 'GT-VERY-LATE');

    const o = await reload(orderId);
    assert.equal(o.status, 'payment_failed');
    assert.equal(o.paymentAttempts[0].needsReconciliation, true);
    assert.equal(o.statusTimeline.filter((t) => /manual reconciliation/.test(t.note)).length, 1);
    assert.equal((await Product.findById(product._id)).stock, 10);
  });

  test('expiry and retry agree: an expired order cannot be retried, and a retry that got in first prevents expiry', async () => {
    const a = await placedOrder({ ageMinutes: 90 });
    gatewayState.set(a.txn1, FAILED);
    await sweepStalePendingOrders({ expiry: EXPIRY });
    process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES = '60';
    const refused = await retryPayment(a.orderId, KEY('afterexpiry'));
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.body.code, 'ORDER_EXPIRED');
    assert.equal((await reload(a.orderId)).paymentAttempts.length, 1);

    // retry first (order still inside the window), then time passes: the live attempt blocks expiry
    process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES = '60';
    const b = await placedOrder({ ageMinutes: 55 });
    gatewayState.set(b.txn1, FAILED);
    const r = await retryPayment(b.orderId, KEY('beforeexpiry'));
    assert.equal(r.statusCode, 201);
    gatewayState.set(r.body.merchantTransactionId, PENDING);
    await backdate(b.orderId, 90);
    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.expired, 0);
    assert.equal((await reload(b.orderId)).status, 'pending_payment');
    delete process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES;
  });
});

describe('stock and financial history', () => {
  test('expiring an unpaid order changes NO stock and writes NO inventory log (nothing was reserved)', async () => {
    const { orderId, product, txn1 } = await placedOrder({ ageMinutes: 90, stock: 10, qty: 4 });
    gatewayState.set(txn1, FAILED);
    assert.equal((await Product.findById(product._id)).stock, 10);          // checkout never reserves stock
    await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal((await reload(orderId)).status, 'payment_failed');
    assert.equal((await Product.findById(product._id)).stock, 10);
    assert.equal(await InventoryLog.countDocuments(), 0);
  });

  test('amounts, items, tax, owner, order number and every attempt survive expiry untouched', async () => {
    const { orderId, txn1 } = await placedOrder({ ageMinutes: 90, qty: 2, price: 100, taxRate: 18 });
    const before = await reload(orderId);
    gatewayState.set(txn1, FAILED);
    await sweepStalePendingOrders({ expiry: EXPIRY });
    const after = await reload(orderId);
    assert.equal(after.totalAmount, before.totalAmount);
    assert.deepEqual(after.items, before.items);
    assert.equal(after.orderNumber, before.orderNumber);
    assert.equal(String(after.userId), String(before.userId));
    assert.deepEqual(after.shippingAddress, before.shippingAddress);
    assert.equal(after.paymentAttempts.length, before.paymentAttempts.length);
    assert.equal(after.statusTimeline.length, before.statusTimeline.length + 1);   // only the expiry entry was added
  });

  test('an unexpected error on one order does not stop the sweep for the others', async () => {
    const bad = await placedOrder({ ageMinutes: 90 });
    const good = await placedOrder({ ageMinutes: 91 });
    gatewayState.set(bad.txn1, new Error('boom'));
    gatewayState.set(good.txn1, FAILED);
    const s = await sweepStalePendingOrders({ expiry: EXPIRY });
    assert.equal(s.expired, 1);
    assert.equal((await reload(good.orderId)).status, 'payment_failed');
    assert.equal((await reload(bad.orderId)).status, 'pending_payment');
  });
});
