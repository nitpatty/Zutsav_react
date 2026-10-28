/**
 * POST /api/checkout/cart — integrity hardening (post-F-03):
 *   • product / variant eligibility and quantity rules
 *   • variant-label snapshot on the order
 *   • order status timeline + ORDER_PLACED notification (exactly once, never for rejected requests)
 *   • idempotent retries (replay, concurrency, key reuse, crash takeover, gateway-failure resume)
 *   • website-style calls WITHOUT a key keep working unchanged
 *
 * ISOLATION: runs the real controllers against a LOCAL `*_test` database only (refuses any other
 * URI), with PhonePe and the notification engine replaced by in-process stubs — no payment request,
 * no message sent, no production data.
 *
 * Run:  backend> node --test tests/checkout-integrity.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'checkout-integrity-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_checkout_integrity_test';
{
  const u = new URL(TEST_URI);
  const dbName = u.pathname.replace(/^\//, '');
  if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || !/_test$/.test(dbName)) {
    throw new Error(`Refusing to run: MONGO_URI_TEST must be a local database whose name ends in "_test" (got host "${u.hostname}", db "${dbName}")`);
  }
}

// Gateway stub — installed BEFORE the controller is required (it destructures at load time).
const phonepe = require('../src/utils/phonepe');
const gatewayCalls = [];
let gatewayFailures = 0; // next N createPhonePeOrder calls throw
let gatewayStatus = { success: true, transactionId: 'GT-TEST-1', state: 'COMPLETED' };
phonepe.createPhonePeOrder = async (args) => {
  gatewayCalls.push(args);
  if (gatewayFailures > 0) { gatewayFailures -= 1; throw new Error('gateway unavailable'); }
  return { redirectUrl: `https://pay.example.invalid/redirect/${args.merchantTransactionId}` };
};
phonepe.checkPhonePeStatus = async () => gatewayStatus;
phonepe.verifyWebhookChecksum = async () => true;

// Notification stub — records instead of sending.
const { NotificationEngine } = require('../notification-engine');
const emitted = [];
NotificationEngine.emit = async (event, payload) => { emitted.push({ event, payload }); };

const Product         = require('../src/models/Product');
const Order           = require('../src/models/Order');
const InventoryLog    = require('../src/models/InventoryLog');
const CheckoutRequest = require('../src/models/CheckoutRequest');
const idem            = require('../src/services/checkoutIdempotency');
const checkout        = require('../src/controllers/checkout.controller');

const oid = () => new mongoose.Types.ObjectId();
let _n = 0;
const mockRes = () => ({
  statusCode: 200, body: null, headers: {},
  status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; }, set(k, v) { this.headers[k] = v; return this; },
});
async function call(handler, req) {
  const res = mockRes();
  let error = null;
  await handler(req, res, (e) => { error = e; });
  if (error) throw error;
  return res;
}
const userA = { _id: oid(), name: 'Asha Test', email: 'asha@example.invalid', phone: '9111111111' };
const userB = { _id: oid(), name: 'Bhanu Test', email: 'bhanu@example.invalid', phone: '9222222222' };
const ADDRESS = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' };
const cart = (products, extra = {}, who = userA, headers) =>
  call(checkout.cartCheckout, { user: who, headers, body: { products, shippingAddress: ADDRESS, ...extra } });
const verify = (txn, who = userA) => call(checkout.verifyCartPayment, { user: who, params: { merchantTransactionId: txn } });
const webhook = (txn, transactionId = 'GT-WEBHOOK') => call(checkout.cartWebhook, {
  body: { response: Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: txn, transactionId } })).toString('base64') },
  headers: { 'x-verify': 'stub' },
});
const KEY = (s) => `test-key-${s}-0123456789abcdef`; // ≥ 16 chars

async function makeProduct(over = {}) {
  _n += 1;
  return Product.create({ name: `Test Product ${_n}`, slug: `integrity-product-${_n}`, category: 'test', price: 100, stock: 10, taxRate: 0, ...over });
}
const waitFor = async (fn, ms = 1500) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)); } return false; };

before(async () => {
  await mongoose.connect(TEST_URI);
  await CheckoutRequest.init(); // the unique index must exist before any concurrency assertion
});
beforeEach(async () => {
  gatewayCalls.length = 0; emitted.length = 0; gatewayFailures = 0;
  gatewayStatus = { success: true, transactionId: 'GT-TEST-1', state: 'COMPLETED' };
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({}), CheckoutRequest.deleteMany({})]);
});
after(async () => {
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({}), CheckoutRequest.deleteMany({})]);
  await mongoose.disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('product & variant eligibility', () => {
  const rejected = async (productsOrFn, message) => {
    const products = typeof productsOrFn === 'function' ? await productsOrFn() : productsOrFn;
    const res = await cart(products);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, message);
    assert.equal(await Order.countDocuments(), 0);
    assert.equal(gatewayCalls.length, 0);
    assert.equal(emitted.length, 0);
  };

  test('an active, visible product is purchasable (control)', async () => {
    const p = await makeProduct();
    const res = await cart([{ productId: p._id, quantity: 1 }]);
    assert.equal(res.statusCode, 201);
  });

  test('visibilityType "marketplace" and "both" are purchasable', async () => {
    for (const visibilityType of ['marketplace', 'both']) {
      const p = await makeProduct({ visibilityType });
      assert.equal((await cart([{ productId: p._id, quantity: 1 }])).statusCode, 201);
    }
  });

  test('a kit-only product cannot be bought on its own', async () => {
    await rejected(async () => {
      const p = await makeProduct({ name: 'Kit Component', visibilityType: 'kit_only' });
      return [{ productId: p._id, quantity: 1 }];
    }, '"Kit Component" cannot be purchased individually');
  });

  test('a soft-deleted product is rejected even if it is still flagged active', async () => {
    await rejected(async () => {
      const p = await makeProduct({ name: 'Gone Item', isDeleted: true, isActive: true });
      return [{ productId: p._id, quantity: 1 }];
    }, '"Gone Item" is no longer available');
  });

  test('an inactive product is rejected', async () => {
    await rejected(async () => {
      const p = await makeProduct({ name: 'Paused Item', isActive: false });
      return [{ productId: p._id, quantity: 1 }];
    }, '"Paused Item" is no longer available');
  });

  test('a missing product and a malformed product id are rejected cleanly (no 500)', async () => {
    await rejected([{ productId: oid(), quantity: 1 }], 'Product not available');
    await rejected([{ productId: 'not-an-object-id', quantity: 1 }], 'Product not available');
  });

  test('a variant id that belongs to a DIFFERENT product is rejected', async () => {
    await rejected(async () => {
      await makeProduct({ name: 'Ghee', variants: [{ variantId: 'only-on-ghee', quantity: '500g', price: 100, stock: 9 }] });
      const other = await makeProduct({ name: 'Incense', variants: [{ variantId: 'incense-v', quantity: '10pc', price: 50, stock: 9 }] });
      return [{ productId: other._id, variantId: 'only-on-ghee', quantity: 1 }];
    }, 'Selected variant not available for Incense');
  });

  test('a variant id on a product that has no variants is rejected (never silently priced as a flat item)', async () => {
    await rejected(async () => {
      const p = await makeProduct({ name: 'Plain' });
      return [{ productId: p._id, variantId: 'ghost', quantity: 1 }];
    }, 'Selected variant not available for Plain');
  });

  test.each = undefined; // (node:test has no .each — explicit cases below)
  for (const [label, quantity] of [['zero', 0], ['negative', -3], ['fractional', 1.5], ['text', 'abc'], ['null', null], ['missing', undefined]]) {
    test(`quantity ${label} is rejected, not silently turned into 1`, async () => {
      await rejected(async () => {
        const p = await makeProduct({ name: 'Diya' });
        return [{ productId: p._id, quantity }];
      }, 'Invalid quantity for Diya');
    });
  }

  test('a numeric-string quantity such as "2" is accepted as the integer 2', async () => {
    const p = await makeProduct({ price: 100 });
    const res = await cart([{ productId: p._id, quantity: '2' }]);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.order.items[0].quantity, 2);
  });

  test('stock is checked against the TOTAL requested across duplicate lines', async () => {
    const p = await makeProduct({ name: 'Camphor', stock: 5 });
    await rejected([{ productId: p._id, quantity: 3 }, { productId: p._id, quantity: 3 }], 'Only 5 units of Camphor in stock');
    assert.equal((await cart([{ productId: p._id, quantity: 3 }, { productId: p._id, quantity: 2 }])).statusCode, 201); // exactly the stock
  });

  test('variant stock is also checked across duplicate lines', async () => {
    const p = await makeProduct({ name: 'Ghee', variants: [{ variantId: 'v1', quantity: '500g', price: 100, stock: 4 }] });
    await rejected(
      [{ productId: p._id, variantId: 'v1', quantity: 3 }, { productId: p._id, variantId: 'v1', quantity: 2 }],
      'Only 4 units of Ghee (500g) in stock',
    );
  });

  test('prices come from the CURRENT catalog at checkout time', async () => {
    const p = await makeProduct({ price: 100 });
    await Product.updateOne({ _id: p._id }, { $set: { price: 130 } });
    const res = await cart([{ productId: p._id, quantity: 1, price: 100 }]);
    assert.equal(res.body.order.items[0].price, 130);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('variant snapshot on the order', () => {
  test('the selected variant label is persisted and returned; non-variant items carry null', async () => {
    const withV = await makeProduct({ name: 'Ghee', taxRate: 18, variants: [{ variantId: 'v500', quantity: '500g', price: 120, salePrice: 100, stock: 9 }] });
    const plain = await makeProduct({ name: 'Incense', price: 40 });
    const res = await cart([{ productId: withV._id, variantId: 'v500', quantity: 2 }, { productId: plain._id, quantity: 1 }]);

    const [a, b] = res.body.order.items;
    assert.equal(a.variantLabel, '500g');
    assert.equal(b.variantLabel, null);
    // pricing and tax are untouched by the change
    assert.deepEqual([a.price, a.taxAmount, a.total], [100, 36, 236]);

    const stored = await Order.findById(res.body.order._id).lean();
    assert.equal(stored.items[0].variantLabel, '500g');
    assert.equal(stored.items[1].variantLabel, null);
  });

  test('it is a snapshot: renaming the catalog variant later does not rewrite the order', async () => {
    const p = await makeProduct({ variants: [{ variantId: 'v1', quantity: '1kg', price: 100, stock: 9 }] });
    const res = await cart([{ productId: p._id, variantId: 'v1', quantity: 1 }]);
    await Product.updateOne({ _id: p._id, 'variants.variantId': 'v1' }, { $set: { 'variants.$.quantity': '2kg' } });
    assert.equal((await Order.findById(res.body.order._id)).items[0].variantLabel, '1kg');
  });

  test('an older order without a label still loads (label reads as null)', async () => {
    const o = await Order.create({
      userId: userA._id, totalAmount: 50, status: 'paid', shippingAddress: ADDRESS,
      items: [{ productId: oid(), name: 'Old Item', variantId: 'x', price: 50, quantity: 1, total: 50 }],
    });
    const loaded = await Order.findById(o._id);
    assert.equal(loaded.items[0].name, 'Old Item');
    assert.equal(loaded.items[0].variantLabel, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('status timeline and ORDER_PLACED', () => {
  test('creation writes the pending_payment entry; one ORDER_PLACED is emitted for the persisted order', async () => {
    const p = await makeProduct({ price: 250, taxRate: 5 });
    const res = await cart([{ productId: p._id, quantity: 1 }]);

    const stored = await Order.findById(res.body.order._id).lean();
    assert.equal(stored.statusTimeline.length, 1);
    assert.equal(stored.statusTimeline[0].status, 'pending_payment');
    assert.ok(stored.statusTimeline[0].timestamp instanceof Date);

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].event, 'ORDER_PLACED');
    assert.equal(emitted[0].payload.order.id, String(stored._id));
    assert.equal(emitted[0].payload.order.total, 262.5);
    assert.equal(emitted[0].payload.customer.email, 'asha@example.invalid');
  });

  test('rejected requests emit nothing (validation, stock, invalid coupon, empty cart)', async () => {
    const p = await makeProduct({ stock: 1 });
    await cart([{ productId: p._id, quantity: 5 }]);                       // stock
    await cart([{ productId: oid(), quantity: 1 }]);                       // unavailable
    await cart([{ productId: p._id, quantity: 1 }], { couponCode: 'NOPE-NOT-A-COUPON' }); // rejected after pricing
    await cart([]);                                                         // empty
    assert.equal(emitted.length, 0);
  });

  test('a failed gateway call emits nothing; the event fires once when the payment step is completed', async () => {
    const p = await makeProduct();
    gatewayFailures = 1;
    await assert.rejects(cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('gw') }), /gateway unavailable/);
    assert.equal(emitted.length, 0);

    const res = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('gw') });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.resumed, true);
    assert.equal(emitted.length, 1);
    assert.equal(await Order.countDocuments(), 1);
  });

  test('payment confirmation appends exactly one "paid" entry (repeat verifies add nothing)', async () => {
    const p = await makeProduct();
    const { body } = await cart([{ productId: p._id, quantity: 1 }]);
    await verify(body.merchantTransactionId);
    await verify(body.merchantTransactionId);
    await verify(body.merchantTransactionId);

    const o = await Order.findById(body.order._id).lean();
    assert.deepEqual(o.statusTimeline.map((t) => t.status), ['pending_payment', 'paid']);
    assert.equal(o.statusTimeline[1].note, 'Payment confirmed via PhonePe');
    assert.equal(o.phonePeTransactionId, 'GT-TEST-1');
  });

  test('concurrent verify calls and the webhook produce ONE paid entry and ONE stock deduction', async () => {
    const p = await makeProduct({ stock: 10 });
    const { body } = await cart([{ productId: p._id, quantity: 3 }]);

    await Promise.all([
      verify(body.merchantTransactionId), verify(body.merchantTransactionId), verify(body.merchantTransactionId),
      webhook(body.merchantTransactionId), verify(body.merchantTransactionId),
    ]);

    assert.ok(await waitFor(async () => (await Product.findById(p._id)).stock === 7), 'stock should be deducted once');
    await new Promise((r) => setTimeout(r, 150)); // a double deduction would land here
    assert.equal((await Product.findById(p._id)).stock, 7);
    const o = await Order.findById(body.order._id).lean();
    assert.equal(o.status, 'paid');
    assert.equal(o.statusTimeline.filter((t) => t.status === 'paid').length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('idempotency', () => {
  const buy = async (over = {}) => makeProduct({ price: 100, taxRate: 18, stock: 20, ...over });

  test('first request with a key behaves exactly like a keyless one', async () => {
    const p = await buy();
    const res = await cart([{ productId: p._id, quantity: 2 }], { idempotencyKey: KEY('first') });
    assert.equal(res.statusCode, 201);
    assert.match(res.body.merchantTransactionId, /^ZUT_CART_/);
    assert.equal(res.body.order.totalAmount, 236);
    assert.equal(res.body.idempotentReplay, undefined);
    assert.ok(res.body.redirectUrl);
  });

  test('same customer + same key + same payload → no second order; the original is returned', async () => {
    const p = await buy();
    const first = await cart([{ productId: p._id, quantity: 2 }], { idempotencyKey: KEY('same') });
    const second = await cart([{ productId: p._id, quantity: 2 }], { idempotencyKey: KEY('same') });

    assert.equal(second.statusCode, 200);
    assert.equal(second.body.idempotentReplay, true);
    assert.equal(String(second.body.order._id), String(first.body.order._id));
    assert.equal(second.body.merchantTransactionId, first.body.merchantTransactionId);
    assert.equal(second.body.redirectUrl, first.body.redirectUrl); // the customer who lost the response still gets the link
    assert.deepEqual(second.body.totals, first.body.totals);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(gatewayCalls.length, 1);
    assert.equal(emitted.length, 1);   // the replay did not notify again
  });

  test('retry after a lost response (client timeout) identifies the original order', async () => {
    const p = await buy();
    await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('timeout') }); // response "never arrived"
    const retry = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('timeout') });
    assert.equal(retry.body.idempotentReplay, true);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(await CheckoutRequest.countDocuments(), 1);
  });

  test('several retries stay one order', async () => {
    const p = await buy();
    for (let i = 0; i < 5; i += 1) await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('many') });
    assert.equal(await Order.countDocuments(), 1);
  });

  test('CONCURRENT requests with the same key create at most one order', async () => {
    const p = await buy();
    const results = await Promise.all(Array.from({ length: 10 }, () => cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('race') })));

    assert.equal(await Order.countDocuments(), 1, 'exactly one order');
    assert.equal(await CheckoutRequest.countDocuments(), 1);
    assert.equal(gatewayCalls.length, 1, 'exactly one gateway payment');
    assert.equal(emitted.length, 1, 'exactly one ORDER_PLACED');
    const created = results.filter((r) => r.statusCode === 201);
    assert.equal(created.length, 1);
    for (const r of results) assert.ok([200, 201, 409].includes(r.statusCode), `unexpected ${r.statusCode}`);
    for (const r of results.filter((x) => x.statusCode === 409)) assert.equal(r.body.code, 'CHECKOUT_IN_PROGRESS');

    // once the winner is done, every loser's retry resolves to that same order
    const after = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('race') });
    assert.equal(after.body.idempotentReplay, true);
    assert.equal(String(after.body.order._id), String(created[0].body.order._id));
  });

  test('a key re-used with a DIFFERENT cart is rejected and creates nothing', async () => {
    const p = await buy();
    await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('reuse') });
    const res = await cart([{ productId: p._id, quantity: 2 }], { idempotencyKey: KEY('reuse') });
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(await Order.countDocuments(), 1);

    const changedAddress = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('reuse'), shippingAddress: { ...ADDRESS, pincode: '110001' } });
    assert.equal(changedAddress.statusCode, 422);
  });

  test('different keys are distinct, intentional orders', async () => {
    const p = await buy();
    const a = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('one') });
    const b = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('two') });
    assert.notEqual(String(a.body.order._id), String(b.body.order._id));
    assert.notEqual(a.body.merchantTransactionId, b.body.merchantTransactionId);
    assert.equal(await Order.countDocuments(), 2);
  });

  test('the key is scoped to the authenticated customer', async () => {
    const p = await buy();
    const a = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('shared') }, userA);
    const b = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('shared') }, userB);
    assert.equal(b.statusCode, 201);                       // not a replay of A's order
    assert.notEqual(String(a.body.order._id), String(b.body.order._id));
    assert.equal(String(b.body.order.userId), String(userB._id));
    assert.equal(await Order.countDocuments(), 2);
  });

  test('the key may be sent as the Idempotency-Key header', async () => {
    const p = await buy();
    const h = { 'idempotency-key': KEY('header') };
    const a = await cart([{ productId: p._id, quantity: 1 }], {}, userA, h);
    const b = await cart([{ productId: p._id, quantity: 1 }], {}, userA, h);
    assert.equal(b.body.idempotentReplay, true);
    assert.equal(String(b.body.order._id), String(a.body.order._id));
    // header and body together must agree
    const bad = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('other') }, userA, h);
    assert.equal(bad.statusCode, 400);
  });

  test('malformed keys are rejected before anything happens', async () => {
    const p = await buy();
    for (const bad of ['short', 'has spaces in the key 0123456789', 'x'.repeat(129), 12345678901234567890, ['array-key-0123456789abcdef']]) {
      const res = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: bad });
      assert.equal(res.statusCode, 400, `key ${JSON.stringify(bad)}`);
      assert.match(res.body.message, /idempotencyKey/);
    }
    assert.equal(await Order.countDocuments(), 0);
    assert.equal(await CheckoutRequest.countDocuments(), 0);
  });

  test('website-style calls WITHOUT a key still work, and each one is its own order (unchanged behaviour)', async () => {
    const p = await buy();
    const a = await cart([{ productId: p._id, quantity: 1 }]);
    const b = await cart([{ productId: p._id, quantity: 1 }]);
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 201);
    assert.notEqual(String(a.body.order._id), String(b.body.order._id));
    assert.equal(await CheckoutRequest.countDocuments(), 0); // no idempotency state is created
  });

  test('a validation failure frees the key, so the same key can be used once the cart is fixed', async () => {
    const p = await buy({ stock: 1 });
    const bad = await cart([{ productId: p._id, quantity: 5 }], { idempotencyKey: KEY('fix') });
    assert.equal(bad.statusCode, 400);
    assert.equal(await CheckoutRequest.countDocuments(), 0);

    const good = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('fix') });
    assert.equal(good.statusCode, 201);
    assert.equal(await Order.countDocuments(), 1);
  });

  test('state is persisted in the database (not process memory) and stores no cart contents, address or credentials', async () => {
    const p = await buy();
    const res = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('persist') });
    const row = await CheckoutRequest.findOne({ userId: userA._id, key: KEY('persist') }).lean();

    assert.equal(row.state, 'completed');
    assert.equal(String(row.orderId), String(res.body.order._id));
    assert.match(row.fingerprint, /^[0-9a-f]{64}$/);
    assert.ok(row.expireAt > new Date());
    const text = JSON.stringify(row);
    for (const forbidden of ['12 Test Lane', '9111111111', '560001', 'Asha Test', 'SALT', 'password', String(p._id)]) {
      assert.ok(!text.includes(forbidden), `row must not contain ${forbidden}`);
    }
  });

  test('the uniqueness is enforced by the database index itself', async () => {
    const dup = { userId: userA._id, operation: 'cart_checkout', key: KEY('index'), fingerprint: 'f', merchantTransactionId: 'T1' };
    await CheckoutRequest.create(dup);
    await assert.rejects(CheckoutRequest.create({ ...dup, merchantTransactionId: 'T2' }), (e) => e.code === 11000);
    const indexes = await CheckoutRequest.collection.indexes();
    const unique = indexes.find((i) => i.unique && i.key.userId === 1 && i.key.key === 1);
    assert.ok(unique, 'unique {userId, operation, key} index must exist');
    assert.ok(indexes.some((i) => i.key.expireAt === 1 && i.expireAfterSeconds === 0), 'TTL index must exist');
  });

  test('a replay after payment no longer hands out the payment link', async () => {
    const p = await buy();
    const first = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('paid') });
    await verify(first.body.merchantTransactionId);
    const replay = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('paid') });
    assert.equal(replay.body.idempotentReplay, true);
    assert.equal(replay.body.redirectUrl, undefined);
    assert.equal(replay.body.order.status, 'paid');
  });

  test('a gateway failure after the order was saved: the retry resumes the SAME order (no duplicate)', async () => {
    const p = await buy();
    gatewayFailures = 1;
    await assert.rejects(cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('resume') }), /gateway unavailable/);
    const orderAfterFailure = await Order.findOne({});
    assert.ok(orderAfterFailure, 'the order was persisted before the gateway step');
    assert.equal((await CheckoutRequest.findOne({})).state, 'order_created');

    const retry = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('resume') });
    assert.equal(retry.statusCode, 201);
    assert.equal(retry.body.resumed, true);
    assert.equal(String(retry.body.order._id), String(orderAfterFailure._id));
    assert.equal(retry.body.merchantTransactionId, orderAfterFailure.phonePeMerchantTransactionId);
    assert.ok(retry.body.redirectUrl);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(gatewayCalls[1].merchantTransactionId, gatewayCalls[0].merchantTransactionId); // same transaction id
    assert.equal(gatewayCalls[1].amount, gatewayCalls[0].amount);                                  // same amount, not re-priced
    assert.equal((await CheckoutRequest.findOne({})).state, 'completed');
  });

  test('a request that arrives while another holds the claim gets 409 CHECKOUT_IN_PROGRESS (nothing created)', async () => {
    const p = await buy();
    const body = { products: [{ productId: p._id, quantity: 1 }], shippingAddress: ADDRESS };
    await CheckoutRequest.create({
      userId: userA._id, operation: 'cart_checkout', key: KEY('busy'), fingerprint: idem.fingerprintCartCheckout(body),
      merchantTransactionId: 'ZUT_CART_busy', state: 'processing', lockedUntil: new Date(Date.now() + 60_000),
    });
    const res = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('busy') });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'CHECKOUT_IN_PROGRESS');
    assert.equal(res.headers['Retry-After'], '5');
    assert.equal(await Order.countDocuments(), 0);
  });

  test('a crashed worker (expired lock, order already saved) is taken over WITHOUT creating a second order', async () => {
    const p = await buy();
    const products = [{ productId: p._id, quantity: 1 }];
    const fingerprint = idem.fingerprintCartCheckout({ products, shippingAddress: ADDRESS });
    const txn = 'ZUT_CART_crashed_1';
    const orphan = await Order.create({
      userId: userA._id, totalAmount: 118, status: 'pending_payment', phonePeMerchantTransactionId: txn, shippingAddress: ADDRESS,
      items: [{ productId: p._id, name: p.name, price: 100, quantity: 1, taxRate: 18, taxAmount: 18, total: 118 }],
    });
    await CheckoutRequest.create({
      userId: userA._id, operation: 'cart_checkout', key: KEY('crash'), fingerprint, merchantTransactionId: txn,
      state: 'processing', lockedUntil: new Date(Date.now() - 1000), // the dead worker's lock has expired
    });

    const res = await cart(products, { idempotencyKey: KEY('crash') });
    assert.equal(res.statusCode, 201);
    assert.equal(String(res.body.order._id), String(orphan._id));
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(gatewayCalls[0].merchantTransactionId, txn);
    assert.equal(gatewayCalls[0].amount, 118);
  });

  test('two requests racing to take over the same expired lock: only one proceeds', async () => {
    const p = await buy();
    const products = [{ productId: p._id, quantity: 1 }];
    await CheckoutRequest.create({
      userId: userA._id, operation: 'cart_checkout', key: KEY('takeover'), fingerprint: idem.fingerprintCartCheckout({ products, shippingAddress: ADDRESS }),
      merchantTransactionId: 'ZUT_CART_takeover_1', state: 'processing', lockedUntil: new Date(Date.now() - 1000),
    });
    const results = await Promise.all(Array.from({ length: 6 }, () => cart(products, { idempotencyKey: KEY('takeover') })));
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(gatewayCalls.length, 1);
    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
  });

  test('replay never bypasses ownership: another customer cannot verify or replay someone else\'s order', async () => {
    const p = await buy();
    const a = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('own') }, userA);
    const forbidden = await verify(a.body.merchantTransactionId, userB);
    assert.equal(forbidden.statusCode, 403);
    assert.equal((await Order.findById(a.body.order._id)).status, 'pending_payment');
    const bReplay = await cart([{ productId: p._id, quantity: 1 }], { idempotencyKey: KEY('own') }, userB);
    assert.equal(bReplay.statusCode, 201);
    assert.notEqual(String(bReplay.body.order._id), String(a.body.order._id));
  });

  test('payment verification is unchanged for idempotent checkouts (owner-only, authoritative state)', async () => {
    const p = await buy({ stock: 10 });
    const a = await cart([{ productId: p._id, quantity: 2 }], { idempotencyKey: KEY('verify') });
    gatewayStatus = { success: false, state: 'PENDING', code: 'PAYMENT_PENDING' };
    const pending = await verify(a.body.merchantTransactionId);
    assert.equal(pending.body.success, false);
    assert.equal((await Order.findById(a.body.order._id)).status, 'pending_payment');

    gatewayStatus = { success: true, transactionId: 'GT-OK', state: 'COMPLETED' };
    const ok = await verify(a.body.merchantTransactionId);
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.order.status, 'paid');
    assert.equal((await Product.findById(p._id)).stock, 8);
  });
});
