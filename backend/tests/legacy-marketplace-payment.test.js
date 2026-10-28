/**
 * Legacy marketplace payment handlers (the `ZOM_` path: GET /marketplace/orders/verify-phonepe/:txn and the
 * /marketplace/orders/phonepe-webhook) now share services/orderPayments with the unified checkout, so they get the
 * same guarantees: atomic pending→paid with stock deducted once, lookup across every attempt (after a retry), and
 * the explicit late/duplicate-payment policy instead of silently reporting success for an order that was closed.
 *
 * ISOLATION: real code against a LOCAL `*_test` database only (any other URI is refused); PhonePe is stubbed.
 *
 * Run:  backend> node --test tests/legacy-marketplace-payment.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'legacy-marketplace-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_legacy_order_pay_test';
{
  const u = new URL(TEST_URI);
  const dbName = u.pathname.replace(/^\//, '');
  if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || !/_test$/.test(dbName)) {
    throw new Error(`Refusing to run: MONGO_URI_TEST must be a local database whose name ends in "_test" (got host "${u.hostname}", db "${dbName}")`);
  }
}

const phonepe = require('../src/utils/phonepe');
const gatewayState = new Map();
const PENDING = { success: false, code: 'PENDING', state: 'PENDING', transactionId: null };
const FAILED  = { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED', transactionId: null };
const PAID    = (id) => ({ success: true, code: 'PAYMENT_SUCCESS', state: 'COMPLETED', transactionId: id });
phonepe.createPhonePeOrder = async (a) => ({ redirectUrl: `https://pay.example.invalid/redirect/${a.merchantTransactionId}` });
phonepe.checkPhonePeStatus = async (txn) => (gatewayState.has(txn) ? gatewayState.get(txn) : PENDING);
phonepe.verifyWebhookChecksum = async () => true;

const { NotificationEngine } = require('../notification-engine');
NotificationEngine.emit = async () => {};

const Product         = require('../src/models/Product');
const Order           = require('../src/models/Order');
const CheckoutRequest = require('../src/models/CheckoutRequest');
const marketplace     = require('../src/controllers/marketplace.controller');
const retry           = require('../src/controllers/orderRetry.controller');

const oid = () => new mongoose.Types.ObjectId();
const mockRes = () => ({ statusCode: 200, body: null, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, set(k, v) { this.headers[k] = v; return this; } });
async function call(handler, req) { const res = mockRes(); let e = null; await handler(req, res, (x) => { e = x; }); if (e) throw e; return res; }
const user = { _id: oid(), name: 'Asha Test', email: 'asha@example.invalid', phone: '9111111111' };
const ADDRESS = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru' };
const verifyLegacy = (txn, who = user) => call(marketplace.verifyPhonePeOrder, { user: who, params: { merchantTransactionId: txn } });
const webhookLegacy = (txn, transactionId) => call(marketplace.phonePeWebhook, {
  body: { response: Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: txn, transactionId } })).toString('base64') },
  headers: { 'x-verify': 'stub' },
});
const retryPayment = (orderId, key) => call(retry.retryOrderPayment, { user, params: { id: String(orderId) }, body: { idempotencyKey: key } });
const waitFor = async (fn, ms = 1500) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

let _n = 0;
/** An order exactly as the legacy endpoint created it: ZOM_ transaction id, no payment-attempt history. */
async function legacyOrder({ stock = 10, qty = 2, status = 'pending_payment' } = {}) {
  _n += 1;
  const product = await Product.create({ name: `Legacy ${_n}`, slug: `legacy-order-${_n}`, category: 'test', price: 100, stock });
  const txn = `ZOM_1700000000000_${_n}abcde`;
  const order = await Order.create({
    userId: user._id, totalAmount: 100 * qty, status, phonePeMerchantTransactionId: txn, shippingAddress: ADDRESS,
    statusTimeline: [{ status: 'pending_payment', timestamp: new Date() }],
    items: [{ productId: product._id, name: product.name, price: 100, quantity: qty, total: 100 * qty }],
  });
  return { product, order, txn };
}

before(async () => { await mongoose.connect(TEST_URI); await CheckoutRequest.init(); });
beforeEach(async () => { gatewayState.clear(); await Promise.all([Product.deleteMany({}), Order.deleteMany({}), CheckoutRequest.deleteMany({})]); });
after(async () => { await Promise.all([Product.deleteMany({}), Order.deleteMany({}), CheckoutRequest.deleteMany({})]); await mongoose.disconnect(); });

describe('legacy ZOM_ verify', () => {
  test('a confirmed payment pays the order once: one timeline entry, stock deducted once, repeats are harmless', async () => {
    const { order, product, txn } = await legacyOrder({ stock: 10, qty: 3 });
    gatewayState.set(txn, PAID('GT-LEG'));
    const first = await verifyLegacy(txn);
    await verifyLegacy(txn);
    await verifyLegacy(txn);

    assert.equal(first.body.success, true);
    assert.equal(first.body.order.status, 'paid');
    const o = await Order.findById(order._id).lean();
    assert.equal(o.statusTimeline.filter((t) => t.status === 'paid').length, 1);
    assert.equal(o.statusTimeline.find((t) => t.status === 'paid').note, 'Payment confirmed via PhonePe');
    assert.equal(o.phonePeTransactionId, 'GT-LEG');
    assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 7));
    assert.equal((await Product.findById(product._id)).stock, 7);
  });

  test('an unpaid / pending / failed payment is reported as before and leaves the order pending', async () => {
    const a = await legacyOrder(); const b = await legacyOrder();
    gatewayState.set(a.txn, PENDING); gatewayState.set(b.txn, FAILED);
    const pending = await verifyLegacy(a.txn);
    const failed = await verifyLegacy(b.txn);
    assert.deepEqual([pending.body.success, pending.body.state], [false, 'PENDING']);
    assert.deepEqual([failed.body.success, failed.body.state], [false, 'FAILED']);
    assert.equal((await Order.findById(b.order._id)).status, 'pending_payment');
    assert.equal((await Order.findById(b.order._id)).paymentAttempts[0].status, 'FAILED');
  });

  test('a payment on an EXPIRED legacy order is not reported as success, not reopened, and is recorded for reconciliation', async () => {
    const { order, product, txn } = await legacyOrder({ stock: 10, status: 'payment_failed' });
    gatewayState.set(txn, PAID('GT-LATE'));
    const res = await verifyLegacy(txn);

    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'PAYMENT_NEEDS_REVIEW');
    assert.equal(res.body.reconciliation, 'PAID_AFTER_EXPIRY');
    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'payment_failed');
    assert.equal(o.paymentAttempts[0].needsReconciliation, true);
    assert.equal((await Product.findById(product._id)).stock, 10);
    await verifyLegacy(txn);
    assert.equal((await Order.findById(order._id).lean()).statusTimeline.filter((t) => /manual reconciliation/.test(t.note)).length, 1);
  });

  test('another customer cannot verify the order', async () => {
    const { txn } = await legacyOrder();
    gatewayState.set(txn, PAID('GT-X'));
    const res = await verifyLegacy(txn, { _id: oid() });
    assert.equal(res.statusCode, 403);
  });
});

describe('legacy ZOM_ webhook', () => {
  test('pays the order once even if delivered repeatedly', async () => {
    const { order, product, txn } = await legacyOrder({ stock: 10, qty: 2 });
    await Promise.all([webhookLegacy(txn, 'GT-W'), webhookLegacy(txn, 'GT-W'), webhookLegacy(txn, 'GT-W')]);
    assert.ok(await waitFor(async () => (await Order.findById(order._id)).status === 'paid'));
    assert.ok(await waitFor(async () => (await Product.findById(product._id)).stock === 8));
    await new Promise((r) => setTimeout(r, 80));
    assert.equal((await Product.findById(product._id)).stock, 8);
    const o = await Order.findById(order._id).lean();
    assert.equal(o.statusTimeline.filter((t) => t.status === 'paid').length, 1);
    assert.equal(o.statusTimeline.find((t) => t.status === 'paid').note, 'Payment confirmed via PhonePe webhook');
  });

  test('a late webhook for an expired order is recorded, not applied', async () => {
    const { order, product, txn } = await legacyOrder({ stock: 10, status: 'payment_failed' });
    await webhookLegacy(txn, 'GT-W-LATE');
    const o = await Order.findById(order._id).lean();
    assert.equal(o.status, 'payment_failed');
    assert.equal(o.paymentAttempts[0].needsReconciliation, true);
    assert.equal((await Product.findById(product._id)).stock, 10);
  });
});

describe('after a retry, the ORIGINAL ZOM_ transaction is still recognised', () => {
  test('verify and webhook on the old transaction find the order through its attempt history', async () => {
    const { order, txn } = await legacyOrder({ stock: 10, qty: 1 });
    gatewayState.set(txn, FAILED);
    const r = await retryPayment(order._id, 'legacy-retry-key-0123456789abcdef');
    assert.equal(r.statusCode, 201);
    const o1 = await Order.findById(order._id).lean();
    assert.equal(o1.phonePeMerchantTransactionId, r.body.merchantTransactionId); // current txn moved on…
    assert.deepEqual(o1.paymentAttempts.map((a) => a.merchantTransactionId), [txn, r.body.merchantTransactionId]); // …old one kept

    // the customer pays the new attempt through the legacy endpoint…
    gatewayState.set(r.body.merchantTransactionId, PAID('GT-NEW'));
    assert.equal((await verifyLegacy(r.body.merchantTransactionId)).body.success, true);

    // …and the old transaction later also turns out to have been paid: found, flagged, never applied twice
    gatewayState.set(txn, PAID('GT-OLD'));
    const dup = await verifyLegacy(txn);
    assert.equal(dup.statusCode, 200, 'the old transaction is found (previously a 404 after a retry)');
    assert.equal(dup.body.code, 'PAYMENT_NEEDS_REVIEW');
    assert.equal(dup.body.reconciliation, 'DUPLICATE_PAYMENT');
    const o2 = await Order.findById(order._id).lean();
    assert.equal(o2.status, 'paid');
    assert.equal(o2.phonePeTransactionId, 'GT-NEW');
  });
});
