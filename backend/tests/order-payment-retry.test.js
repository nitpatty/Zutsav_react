/**
 * POST /api/checkout/orders/:id/retry-payment — a new payment attempt for an EXISTING unpaid marketplace order.
 *
 * Covers: owner-only access, eligibility, preserved order/amount, fresh ZUT_CART_ transaction ids, attempt
 * history, idempotent + concurrent retries, gateway-failure recovery, earlier-attempt reconciliation, races with
 * payment confirmation, the optional lifetime limit, and the late/duplicate-payment policy.
 *
 * ISOLATION: real controllers against a LOCAL `*_test` database only (any other URI is refused). PhonePe is
 * replaced by per-transaction stubs — no payment request, no network, no production data.
 *
 * Run:  backend> node --test tests/order-payment-retry.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'order-retry-test-secret';

const { test, before, after, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_order_retry_test';
{
  const u = new URL(TEST_URI);
  const dbName = u.pathname.replace(/^\//, '');
  if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || !/_test$/.test(dbName)) {
    throw new Error(`Refusing to run: MONGO_URI_TEST must be a local database whose name ends in "_test" (got host "${u.hostname}", db "${dbName}")`);
  }
}

// ── gateway stubs (installed BEFORE the controllers are required) ────────────────────────────────
const phonepe = require('../src/utils/phonepe');
const created = [];                 // every createPhonePeOrder call
let createFailures = 0;             // next N createPhonePeOrder calls throw
const gatewayState = new Map();     // txn → status result | Error ; default = PENDING
const PENDING = { success: false, code: 'PENDING', state: 'PENDING', transactionId: null };
const FAILED  = { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED', transactionId: null };
const PAID    = (id) => ({ success: true, code: 'PAYMENT_SUCCESS', state: 'COMPLETED', transactionId: id });
phonepe.createPhonePeOrder = async (args) => {
  created.push(args);
  if (createFailures > 0) { createFailures -= 1; throw new Error('gateway unavailable'); }
  return { redirectUrl: `https://pay.example.invalid/redirect/${args.merchantTransactionId}` };
};
phonepe.checkPhonePeStatus = async (txn) => {
  const v = gatewayState.has(txn) ? gatewayState.get(txn) : PENDING;
  if (v instanceof Error) throw v;
  return v;
};
phonepe.verifyWebhookChecksum = async () => true;

const { NotificationEngine } = require('../notification-engine');
NotificationEngine.emit = async () => {};

const Product         = require('../src/models/Product');
const Order           = require('../src/models/Order');
const InventoryLog    = require('../src/models/InventoryLog');
const CheckoutRequest = require('../src/models/CheckoutRequest');
const checkout        = require('../src/controllers/checkout.controller');
const retry           = require('../src/controllers/orderRetry.controller');

const oid = () => new mongoose.Types.ObjectId();
let _n = 0;
const mockRes = () => ({
  statusCode: 200, body: null, headers: {},
  status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, set(k, v) { this.headers[k] = v; return this; },
});
async function call(handler, req) {
  const res = mockRes(); let error = null;
  await handler(req, res, (e) => { error = e; });
  if (error) throw error;
  return res;
}
const userA = { _id: oid(), name: 'Asha Test', email: 'asha@example.invalid', phone: '9111111111' };
const userB = { _id: oid(), name: 'Bhanu Test', email: 'bhanu@example.invalid', phone: '9222222222' };
const ADDRESS = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' };
const KEY = (s) => `retry-key-${s}-0123456789abcdef`;
const checkoutCart = (products, who = userA) => call(checkout.cartCheckout, { user: who, body: { products, shippingAddress: ADDRESS } });
const retryPayment = (orderId, key, who = userA, headers) => call(retry.retryOrderPayment, { user: who, params: { id: String(orderId) }, headers, body: key === undefined ? {} : { idempotencyKey: key } });
const verify = (txn, who = userA) => call(checkout.verifyCartPayment, { user: who, params: { merchantTransactionId: txn } });
const webhook = (txn, transactionId) => call(checkout.cartWebhook, {
  body: { response: Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: txn, transactionId } })).toString('base64') },
  headers: { 'x-verify': 'stub' },
});
const waitFor = async (fn, ms = 1500) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };
const retryCreates = () => created.filter((c) => c.merchantTransactionId.startsWith('ZUT_CART_RETRY_'));

/** A real checkout → an order with its first (failed/abandoned) attempt. */
async function placedOrder({ price = 100, taxRate = 18, stock = 20, qty = 2, name } = {}) {
  _n += 1;
  const product = await Product.create({ name: name || `Retry Product ${_n}`, slug: `retry-product-${_n}`, category: 'test', price, stock, taxRate });
  const res = await checkoutCart([{ productId: product._id, quantity: qty }]);
  assert.equal(res.statusCode, 201);
  const order = await Order.findById(res.body.order._id);
  return { product, order, txn1: res.body.merchantTransactionId };
}
const attemptsOf = async (orderId) => (await Order.findById(orderId).lean()).paymentAttempts;

before(async () => { await mongoose.connect(TEST_URI); await CheckoutRequest.init(); await Order.init(); });
beforeEach(async () => {
  created.length = 0; createFailures = 0; gatewayState.clear();
  delete process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES;
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({}), CheckoutRequest.deleteMany({})]);
});
afterEach(() => { delete process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES; });
after(async () => {
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({}), CheckoutRequest.deleteMany({})]);
  await mongoose.disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('first attempt is recorded by checkout', () => {
  test('a new order carries its initial PENDING attempt (history starts at creation)', async () => {
    const { order, txn1 } = await placedOrder({ price: 100, taxRate: 18, qty: 2 });
    assert.equal(order.paymentAttempts.length, 1);
    assert.equal(order.paymentAttempts[0].merchantTransactionId, txn1);
    assert.equal(order.paymentAttempts[0].status, 'PENDING');
    assert.equal(order.paymentAttempts[0].amount, 236);
  });
});

describe('retry — access, validation, eligibility', () => {
  test('the owner can retry an eligible pending-payment order after the previous attempt failed', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const res = await retryPayment(order._id, KEY('ok'));

    assert.equal(res.statusCode, 201);
    assert.equal(String(res.body.orderId), String(order._id));
    assert.ok(res.body.merchantTransactionId.startsWith('ZUT_CART_RETRY_'));
    assert.ok(res.body.merchantTransactionId.startsWith('ZUT_CART_'), 'must keep the ZUT_CART_ prefix used for verification routing');
    assert.notEqual(res.body.merchantTransactionId, txn1);
    assert.equal(res.body.redirectUrl, `https://pay.example.invalid/redirect/${res.body.merchantTransactionId}`);
    assert.equal(res.body.order.status, 'pending_payment');          // success is never claimed here
    assert.equal(res.body.order.phonePeMerchantTransactionId, res.body.merchantTransactionId);
  });

  test('another customer gets the same 404 as for a non-existent order — nothing leaks, nothing is claimed or charged', async () => {
    const { order } = await placedOrder();
    const foreign = await retryPayment(order._id, KEY('foreign'), userB);
    const missing = await retryPayment(oid(), KEY('missing'), userB);
    assert.equal(foreign.statusCode, 404);
    assert.deepEqual(foreign.body, missing.body);
    assert.equal(foreign.body.code, 'ORDER_NOT_FOUND');
    assert.equal(await CheckoutRequest.countDocuments({ operation: 'order_retry_payment' }), 0);
    assert.equal(retryCreates().length, 0);
    assert.equal((await attemptsOf(order._id)).length, 1);
  });

  test('a malformed order id is a 404', async () => {
    const res = await call(retry.retryOrderPayment, { user: userA, params: { id: 'not-an-id' }, body: { idempotencyKey: KEY('bad') } });
    assert.equal(res.statusCode, 404);
  });

  test('an idempotency key is required and must be well-formed', async () => {
    const { order } = await placedOrder();
    const none = await retryPayment(order._id, undefined);
    assert.equal(none.statusCode, 400);
    assert.equal(none.body.code, 'IDEMPOTENCY_KEY_REQUIRED');
    const bad = await retryPayment(order._id, 'short');
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.code, 'IDEMPOTENCY_KEY_INVALID');
    assert.equal(retryCreates().length, 0);
  });

  for (const [label, patch, code] of [
    ['paid', { status: 'paid', phonePeTransactionId: 'GT-PAID' }, 'ORDER_ALREADY_PAID'],
    ['confirmed', { status: 'confirmed', phonePeTransactionId: 'GT-PAID' }, 'ORDER_ALREADY_PAID'],
    ['shipped', { status: 'shipped', phonePeTransactionId: 'GT-PAID' }, 'ORDER_ALREADY_PAID'],
    ['delivered', { status: 'delivered', phonePeTransactionId: 'GT-PAID' }, 'ORDER_ALREADY_PAID'],
    ['expired (payment_failed)', { status: 'payment_failed' }, 'ORDER_EXPIRED'],
    ['cancelled', { status: 'cancelled' }, 'ORDER_CANCELLED'],
  ]) {
    test(`a ${label} order cannot be retried (${code}); no attempt, no gateway call, key released`, async () => {
      const { order } = await placedOrder();
      await Order.updateOne({ _id: order._id }, { $set: patch });
      const res = await retryPayment(order._id, KEY(label.replace(/\W/g, '')));
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.code, code);
      assert.equal(retryCreates().length, 0);
      assert.equal((await attemptsOf(order._id)).length, 1);
      assert.equal(await CheckoutRequest.countDocuments({ operation: 'order_retry_payment' }), 0);
    });
  }

  test('an order with nothing payable is refused', async () => {
    const { order } = await placedOrder();
    await Order.updateOne({ _id: order._id }, { $set: { totalAmount: 0 } });
    const res = await retryPayment(order._id, KEY('zero'));
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'ORDER_NOT_PAYABLE');
  });
});

describe('retry — the original order is preserved', () => {
  test('same order id/number/items/amount/owner; catalog price & tax changes do not alter what is charged', async () => {
    const { order, product, txn1 } = await placedOrder({ price: 100, taxRate: 18, qty: 2 });
    const before = (await Order.findById(order._id).lean());
    gatewayState.set(txn1, FAILED);
    // the catalog moves on after the order was placed
    await Product.updateOne({ _id: product._id }, { $set: { price: 999, salePrice: 777, taxRate: 5 } });

    const res = await retryPayment(order._id, KEY('preserve'));
    assert.equal(res.statusCode, 201);
    assert.equal(retryCreates()[0].amount, 236, 'the gateway is charged the persisted payable, not a re-priced one');

    const after = await Order.findById(order._id).lean();
    assert.equal(after.orderNumber, before.orderNumber);
    assert.equal(String(after.userId), String(before.userId));
    assert.equal(after.totalAmount, before.totalAmount);
    assert.deepEqual(after.items, before.items);                  // price, taxRate, taxAmount, total, variant snapshot
    assert.deepEqual(after.shippingAddress, before.shippingAddress);
    assert.equal(+new Date(after.createdAt), +new Date(before.createdAt)); // the order's age is untouched
    assert.equal(await Order.countDocuments(), 1);                 // no new order
  });

  test('the client cannot influence the charge: extra body fields are ignored', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const res = await call(retry.retryOrderPayment, {
      user: userA, params: { id: String(order._id) },
      body: { idempotencyKey: KEY('tamper'), amount: 1, totalAmount: 1, products: [{ productId: oid(), quantity: 99 }], price: 1 },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(retryCreates()[0].amount, 236);
  });

  test('attempt history is append-only: earlier attempts stay with their outcome', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const r1 = await retryPayment(order._id, KEY('h1'));
    gatewayState.set(r1.body.merchantTransactionId, FAILED);
    const r2 = await retryPayment(order._id, KEY('h2'));

    const attempts = await attemptsOf(order._id);
    assert.deepEqual(attempts.map((a) => [a.merchantTransactionId, a.status]), [
      [txn1, 'FAILED'], [r1.body.merchantTransactionId, 'FAILED'], [r2.body.merchantTransactionId, 'PENDING'],
    ]);
    assert.equal(attempts[0].gatewayCode, 'PAYMENT_DECLINED');
    const o = await Order.findById(order._id).lean();
    assert.equal(o.phonePeMerchantTransactionId, r2.body.merchantTransactionId);
    assert.equal(o.statusTimeline.filter((t) => /Payment retry started/.test(t.note)).length, 2);
  });

  test('a legacy order without attempt history (only a transaction id) can be retried too', async () => {
    const p = await Product.create({ name: 'Legacy', slug: 'legacy-1', category: 'test', price: 50, stock: 5 });
    const o = await Order.create({
      userId: userA._id, totalAmount: 50, status: 'pending_payment', phonePeMerchantTransactionId: 'ZUT_CART_legacy_1', shippingAddress: ADDRESS,
      items: [{ productId: p._id, name: 'Legacy', price: 50, quantity: 1, total: 50 }],
    });
    assert.equal(o.paymentAttempts.length, 0);
    gatewayState.set('ZUT_CART_legacy_1', FAILED);
    const res = await retryPayment(o._id, KEY('legacy'));
    assert.equal(res.statusCode, 201);
    const attempts = await attemptsOf(o._id);
    assert.deepEqual(attempts.map((a) => [a.merchantTransactionId, a.status]).slice(0, 1), [['ZUT_CART_legacy_1', 'FAILED']]);
    assert.equal(attempts.length, 2);
  });
});

describe('retry — idempotency and concurrency', () => {
  test('repeating the same request (lost response) returns the SAME attempt and link — no second gateway transaction', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const first = await retryPayment(order._id, KEY('lost'));
    const again = await retryPayment(order._id, KEY('lost'));

    assert.equal(again.statusCode, 200);
    assert.equal(again.body.idempotentReplay, true);
    assert.equal(again.body.merchantTransactionId, first.body.merchantTransactionId);
    assert.equal(again.body.redirectUrl, first.body.redirectUrl);
    assert.equal(retryCreates().length, 1);
    assert.equal((await attemptsOf(order._id)).length, 2);
  });

  test('rapid repeated taps (same key, concurrent) create exactly one attempt and one gateway transaction', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const results = await Promise.all(Array.from({ length: 8 }, () => retryPayment(order._id, KEY('burst'))));

    assert.equal(retryCreates().length, 1);
    assert.equal((await attemptsOf(order._id)).length, 2);
    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
    for (const r of results) assert.ok([200, 201, 409].includes(r.statusCode), `unexpected ${r.statusCode}`);
    assert.equal(await CheckoutRequest.countDocuments({ operation: 'order_retry_payment' }), 1);
  });

  test('concurrent retries with DIFFERENT keys (two devices): only one attempt is ever opened', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => retryPayment(order._id, KEY(`dev${i}`))));

    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
    assert.equal(retryCreates().length, 1);
    assert.equal((await attemptsOf(order._id)).filter((a) => a.status === 'PENDING').length, 1);
    for (const r of results.filter((x) => x.statusCode !== 201)) assert.equal(r.statusCode, 409);
  });

  test('a key re-used for a DIFFERENT order is rejected', async () => {
    const a = await placedOrder();
    const b = await placedOrder();
    gatewayState.set(a.txn1, FAILED);
    gatewayState.set(b.txn1, FAILED);
    await retryPayment(a.order._id, KEY('shared'));
    const res = await retryPayment(b.order._id, KEY('shared'));
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal((await attemptsOf(b.order._id)).length, 1);
  });

  test('a retry request is scoped to the customer: the same key from another customer cannot touch the order', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    await retryPayment(order._id, KEY('scoped'));
    const other = await retryPayment(order._id, KEY('scoped'), userB);
    assert.equal(other.statusCode, 404);
  });

  test('a replay after the attempt was paid no longer hands out the payment link', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const first = await retryPayment(order._id, KEY('paidreplay'));
    gatewayState.set(first.body.merchantTransactionId, PAID('GT-R1'));
    await verify(first.body.merchantTransactionId);
    const replay = await retryPayment(order._id, KEY('paidreplay'));
    assert.equal(replay.body.idempotentReplay, true);
    assert.equal(replay.body.redirectUrl, undefined);
    assert.equal(replay.body.order.status, 'paid');
  });
});

describe('retry — gateway initiation failure is recoverable and auditable', () => {
  test('the attempt stays on the order as INITIATION_FAILED; the same key resumes it with the SAME transaction id', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    createFailures = 1;
    await assert.rejects(retryPayment(order._id, KEY('gwfail')), /gateway unavailable/);

    const afterFail = await attemptsOf(order._id);
    assert.equal(afterFail.length, 2);
    assert.equal(afterFail[1].status, 'INITIATION_FAILED');
    assert.match(afterFail[1].failureReason, /gateway unavailable/);
    const failedTxn = afterFail[1].merchantTransactionId;

    const resumed = await retryPayment(order._id, KEY('gwfail'));
    assert.equal(resumed.statusCode, 201);
    assert.equal(resumed.body.merchantTransactionId, failedTxn);
    assert.ok(resumed.body.redirectUrl);
    const after = await attemptsOf(order._id);
    assert.equal(after.length, 2, 'no extra attempt was created');
    assert.equal(after[1].status, 'PENDING');
    assert.equal(await Order.countDocuments(), 1);
  });

  test('a new key after an INITIATION_FAILED attempt opens a fresh attempt (nothing can be in flight for the failed one)', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    createFailures = 1;
    await assert.rejects(retryPayment(order._id, KEY('gwA')), /gateway unavailable/);
    const res = await retryPayment(order._id, KEY('gwB'));
    assert.equal(res.statusCode, 201);
    const attempts = await attemptsOf(order._id);
    assert.deepEqual(attempts.map((a) => a.status), ['FAILED', 'INITIATION_FAILED', 'PENDING']);
  });
});

describe('retry — earlier attempts are reconciled with the gateway first', () => {
  test('an earlier attempt still PENDING at the gateway blocks the retry (no second live payment)', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, PENDING);
    const res = await retryPayment(order._id, KEY('inflight'));
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'PAYMENT_IN_PROGRESS');
    assert.equal(res.body.merchantTransactionId, txn1);
    assert.equal(retryCreates().length, 0);
    assert.equal((await attemptsOf(order._id)).length, 1);
    assert.equal(await CheckoutRequest.countDocuments({ operation: 'order_retry_payment' }), 0); // key released
  });

  test('an earlier attempt that actually succeeded settles the order and the retry is refused (ORDER_ALREADY_PAID)', async () => {
    const { order, product, txn1 } = await placedOrder({ stock: 10, qty: 3 });
    gatewayState.set(txn1, PAID('GT-EARLY'));
    const res = await retryPayment(order._id, KEY('earlypaid'));

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'ORDER_ALREADY_PAID');
    assert.equal(res.body.alreadyPaid, true);
    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'paid');
    assert.equal(o.paymentAttempts[0].status, 'SUCCESS');
    assert.equal(retryCreates().length, 0);
    assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 7));
  });

  test('an unclear gateway answer (error / no state) never opens another payment', async () => {
    for (const [label, answer] of [['error', new Error('gateway timeout')], ['no state', { success: false, code: 'PAYMENT_ERROR' }]]) {
      const { order, txn1 } = await placedOrder();
      gatewayState.set(txn1, answer);
      const res = await retryPayment(order._id, KEY(`unclear${label.replace(/\W/g, '')}`));
      assert.equal(res.statusCode, 503, label);
      assert.equal(res.body.code, 'PAYMENT_STATUS_UNKNOWN');
      assert.equal((await attemptsOf(order._id)).length, 1);
    }
    assert.equal(retryCreates().length, 0);
  });

  test('a retry that races a payment confirmation can never reopen or double-pay the order', async () => {
    const { order, product, txn1 } = await placedOrder({ stock: 10, qty: 2 });
    gatewayState.set(txn1, PAID('GT-RACE'));
    const [r, v, w] = await Promise.all([retryPayment(order._id, KEY('race')), verify(txn1), webhook(txn1, 'GT-RACE')]);

    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'paid');
    assert.equal(o.paymentAttempts.filter((a) => a.status === 'SUCCESS').length, 1);
    assert.equal(o.statusTimeline.filter((t) => t.status === 'paid').length, 1);
    assert.equal(o.paymentAttempts.filter((a) => a.needsReconciliation).length, 0);
    assert.ok([409, 201].includes(r.statusCode));
    assert.equal(r.statusCode === 201 ? o.paymentAttempts.length : 1, o.paymentAttempts.length);
    assert.equal(v.statusCode, 200);
    assert.equal(w.statusCode, 200);
    assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 8));
    await new Promise((x) => setTimeout(x, 150));
    assert.equal((await Product.findById(product._id)).stock, 8, 'stock deducted exactly once');
  });
});

describe('verification and webhook understand every attempt', () => {
  test('the retry transaction verifies the ORIGINAL order, keeping the earlier failed attempt on record', async () => {
    const { order, product, txn1 } = await placedOrder({ stock: 10, qty: 2 });
    gatewayState.set(txn1, FAILED);
    const r = await retryPayment(order._id, KEY('verifyretry'));
    const txn2 = r.body.merchantTransactionId;

    gatewayState.set(txn2, PAID('GT-T2'));
    const v = await verify(txn2);
    assert.equal(v.body.success, true);
    assert.equal(String(v.body.order._id), String(order._id));
    assert.equal(v.body.order.status, 'paid');

    const o = await Order.findById(order._id).lean();
    assert.deepEqual(o.paymentAttempts.map((a) => [a.merchantTransactionId, a.status]), [[txn1, 'FAILED'], [txn2, 'SUCCESS']]);
    assert.equal(o.phonePeTransactionId, 'GT-T2');
    assert.equal((await Product.findById(product._id)).stock, 8);
    const again = await verify(txn2);
    assert.equal(again.body.alreadyVerified, true);
    assert.equal((await Product.findById(product._id)).stock, 8);
  });

  test('the webhook accepts a ZUT_CART_RETRY_ transaction and pays the original order once', async () => {
    const { order, product, txn1 } = await placedOrder({ stock: 10, qty: 1 });
    gatewayState.set(txn1, FAILED);
    const r = await retryPayment(order._id, KEY('hook'));
    await webhook(r.body.merchantTransactionId, 'GT-HOOK');
    await webhook(r.body.merchantTransactionId, 'GT-HOOK');
    assert.ok(await waitFor(async () => (await Order.findById(order._id)).status === 'paid'));
    assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 9));
    await new Promise((x) => setTimeout(x, 100));
    assert.equal((await Product.findById(product._id)).stock, 9);
    assert.equal((await Order.findById(order._id)).statusTimeline.filter((t) => t.status === 'paid').length, 1);
  });

  test('a failed retry is recorded on its attempt and the order stays retryable', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const r = await retryPayment(order._id, KEY('failagain'));
    gatewayState.set(r.body.merchantTransactionId, FAILED);
    const v = await verify(r.body.merchantTransactionId);
    assert.equal(v.body.success, false);
    assert.equal(v.body.state, 'FAILED');
    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'pending_payment');
    assert.equal(o.paymentAttempts[1].status, 'FAILED');
    const third = await retryPayment(order._id, KEY('third'));
    assert.equal(third.statusCode, 201);
  });

  test('verification stays owner-only for retry transactions', async () => {
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    const r = await retryPayment(order._id, KEY('own'));
    gatewayState.set(r.body.merchantTransactionId, PAID('GT-X'));
    const res = await verify(r.body.merchantTransactionId, userB);
    assert.equal(res.statusCode, 403);
    assert.equal((await Order.findById(order._id)).status, 'pending_payment');
  });
});

describe('late and duplicate payments (explicit policy — never lost, never silently reopened)', () => {
  test('a successful payment on an EXPIRED order is not reported as success, not reopened, and is recorded for reconciliation', async () => {
    const { order, product, txn1 } = await placedOrder({ stock: 10, qty: 2 });
    await Order.updateOne({ _id: order._id }, { $set: { status: 'payment_failed' } }); // closed by the stale-order sweep
    gatewayState.set(txn1, PAID('GT-LATE'));

    const v = await verify(txn1);
    assert.equal(v.body.success, false);
    assert.equal(v.body.code, 'PAYMENT_NEEDS_REVIEW');
    assert.equal(v.body.reconciliation, 'PAID_AFTER_EXPIRY');
    assert.notEqual(v.body.alreadyVerified, true);

    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'payment_failed', 'not reopened');
    assert.equal(o.paymentAttempts[0].status, 'SUCCESS');
    assert.equal(o.paymentAttempts[0].needsReconciliation, true);
    assert.equal(o.paymentAttempts[0].reconciliationReason, 'PAID_AFTER_EXPIRY');
    assert.equal(o.statusTimeline.filter((t) => /manual reconciliation/.test(t.note)).length, 1);
    assert.equal((await Product.findById(product._id)).stock, 10, 'stock untouched for an order that was not reopened');

    // repeats and the webhook add nothing more
    await verify(txn1); await webhook(txn1, 'GT-LATE'); await webhook(txn1, 'GT-LATE');
    const o2 = await Order.findById(order._id).lean();
    assert.equal(o2.statusTimeline.filter((t) => /manual reconciliation/.test(t.note)).length, 1);
    assert.equal(o2.status, 'payment_failed');
  });

  test('verifying an expired order whose payment did NOT succeed is a plain failure, never "already verified"', async () => {
    const { order, txn1 } = await placedOrder();
    await Order.updateOne({ _id: order._id }, { $set: { status: 'payment_failed' } });
    gatewayState.set(txn1, FAILED);
    const v = await verify(txn1);
    assert.equal(v.body.success, false);
    assert.equal(v.body.alreadyVerified, undefined);
    assert.equal(v.body.code, 'PAYMENT_DECLINED');
  });

  test('a second successful payment for an already-paid order is flagged DUPLICATE_PAYMENT, never applied twice', async () => {
    const { order, product, txn1 } = await placedOrder({ stock: 10, qty: 2 });
    gatewayState.set(txn1, FAILED);
    const r = await retryPayment(order._id, KEY('dup'));
    const txn2 = r.body.merchantTransactionId;
    gatewayState.set(txn2, PAID('GT-SECOND'));
    await verify(txn2);                                   // the retry attempt pays the order
    gatewayState.set(txn1, PAID('GT-FIRST'));             // …and the ORIGINAL attempt also turns out to have been paid
    const dup = await verify(txn1);

    assert.equal(dup.body.code, 'PAYMENT_NEEDS_REVIEW');
    assert.equal(dup.body.reconciliation, 'DUPLICATE_PAYMENT');
    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'paid');
    assert.equal(o.phonePeTransactionId, 'GT-SECOND');
    assert.equal(o.paymentAttempts.find((a) => a.merchantTransactionId === txn1).needsReconciliation, true);
    assert.equal(o.paymentAttempts.find((a) => a.merchantTransactionId === txn2).needsReconciliation, false);
    assert.equal((await Product.findById(product._id)).stock, 8, 'stock deducted once only');
  });

  test('a payment on a cancelled (never-paid) order is recorded, not lost', async () => {
    const { order, txn1 } = await placedOrder();
    await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
    gatewayState.set(txn1, PAID('GT-CANC'));
    const v = await verify(txn1);
    assert.equal(v.body.code, 'PAYMENT_NEEDS_REVIEW');
    assert.equal(v.body.reconciliation, 'PAID_AFTER_CANCELLATION');
    assert.equal((await Order.findById(order._id)).status, 'cancelled');
  });
});

describe('retry — optional lifetime limit (MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES)', () => {
  const backdate = (id, minutes) => Order.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(Date.now() - minutes * 60_000) } });

  test('unset: there is no age limit — an old pending order is still retryable', async () => {
    const { order, txn1 } = await placedOrder();
    await backdate(order._id, 60 * 24 * 30);
    gatewayState.set(txn1, FAILED);
    assert.equal((await retryPayment(order._id, KEY('noexpiry'))).statusCode, 201);
  });

  test('set: an order past its lifetime is refused (ORDER_EXPIRED); a recent one is allowed', async () => {
    process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES = '60';
    const old = await placedOrder();
    const recent = await placedOrder();
    await backdate(old.order._id, 61);
    await backdate(recent.order._id, 59);
    gatewayState.set(old.txn1, FAILED);
    gatewayState.set(recent.txn1, FAILED);

    const refused = await retryPayment(old.order._id, KEY('oldone'));
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.body.code, 'ORDER_EXPIRED');
    assert.equal((await attemptsOf(old.order._id)).length, 1);
    assert.equal((await retryPayment(recent.order._id, KEY('recentone'))).statusCode, 201);
  });

  test('a retry does not extend the order\'s lifetime (the clock runs from the original creation)', async () => {
    process.env.MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES = '60';
    const { order, txn1 } = await placedOrder();
    gatewayState.set(txn1, FAILED);
    await backdate(order._id, 50);
    const r = await retryPayment(order._id, KEY('lifetime'));
    assert.equal(r.statusCode, 201);
    const created = +new Date((await Order.findById(order._id).lean()).createdAt);
    assert.ok(Date.now() - created >= 49 * 60_000, 'createdAt unchanged by the retry');
    gatewayState.set(r.body.merchantTransactionId, FAILED);
    await backdate(order._id, 61);                                  // time passes
    const later = await retryPayment(order._id, KEY('lifetime2'));
    assert.equal(later.body.code, 'ORDER_EXPIRED');
  });
});
