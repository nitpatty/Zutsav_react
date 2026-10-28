/**
 * POST /api/checkout/cart — products-only carts, and GET /api/checkout/verify/:txn.
 *
 * Pins the server-authoritative marketplace pricing the mobile app now relies on
 * (audit F-03): variant sale-price rule, per-product tax, ignoring client money
 * fields, stock/availability errors, the response contract, and verification.
 *
 * ISOLATION: runs the real controllers against a LOCAL `*_test` database only
 * (refuses any other URI) and replaces the PhonePe gateway with a stub — no payment
 * request, no production data, no other collection is touched.
 *
 * Run:  backend> node --test tests/checkout-products.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'checkout-products-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_checkout_products_test';
{
  const u = new URL(TEST_URI);
  const dbName = u.pathname.replace(/^\//, '');
  if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) || !/_test$/.test(dbName)) {
    throw new Error(`Refusing to run: MONGO_URI_TEST must be a local database whose name ends in "_test" (got host "${u.hostname}", db "${dbName}")`);
  }
}

// The controller destructures the gateway helpers at load time, so stub BEFORE requiring it.
const phonepe = require('../src/utils/phonepe');
const gatewayCalls = [];
let gatewayStatus = { success: true, transactionId: 'GT-TEST-1', state: 'COMPLETED' };
phonepe.createPhonePeOrder = async (args) => {
  gatewayCalls.push(args);
  return { redirectUrl: `https://pay.example.invalid/redirect/${args.merchantTransactionId}` };
};
phonepe.checkPhonePeStatus = async () => gatewayStatus;

const Product      = require('../src/models/Product');
const Order        = require('../src/models/Order');
const InventoryLog = require('../src/models/InventoryLog');
const checkout     = require('../src/controllers/checkout.controller');

const oid = () => new mongoose.Types.ObjectId();
let _n = 0;

function mockRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
}
async function call(handler, req) {
  const res = mockRes();
  let error = null;
  await handler(req, res, (e) => { error = e; });
  if (error) throw error;
  return res;
}
const user = oid();
const ADDRESS = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' };
const cart = (products, extra = {}) => call(checkout.cartCheckout, { user: { _id: user }, body: { products, shippingAddress: ADDRESS, ...extra } });

async function makeProduct(over = {}) {
  _n += 1;
  return Product.create({ name: `Test Product ${_n}`, slug: `test-product-${_n}`, category: 'test', price: 250, stock: 10, taxRate: 0, ...over });
}

before(async () => { await mongoose.connect(TEST_URI); });
beforeEach(async () => {
  gatewayCalls.length = 0;
  gatewayStatus = { success: true, transactionId: 'GT-TEST-1', state: 'COMPLETED' };
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({})]);
});
after(async () => {
  await Promise.all([Product.deleteMany({}), Order.deleteMany({}), InventoryLog.deleteMany({})]); // leave the test DB empty
  await mongoose.disconnect();
});

describe('cartCheckout — pricing is decided by the server', () => {
  test('non-variant product: unit price × qty plus the product\'s own tax rate', async () => {
    const p = await makeProduct({ price: 250, taxRate: 5 });
    const res = await cart([{ productId: p._id, quantity: 2 }]);

    assert.equal(res.statusCode, 201);
    const item = res.body.order.items[0];
    assert.equal(item.price, 250);
    assert.equal(item.taxRate, 5);
    assert.equal(item.taxAmount, 25);          // 500 × 5%
    assert.equal(item.total, 525);
    assert.equal(res.body.order.totalAmount, 525);
    assert.equal(gatewayCalls[0].amount, 525); // the gateway is asked for exactly the server total
  });

  test('product.salePrice wins over price when set', async () => {
    const p = await makeProduct({ price: 300, salePrice: 240, taxRate: 0 });
    const res = await cart([{ productId: p._id, quantity: 1 }]);
    assert.equal(res.body.order.items[0].price, 240);
    assert.equal(res.body.order.totalAmount, 240);
  });

  test('variant with a sale price: the VARIANT sale price is charged and taxed', async () => {
    const p = await makeProduct({
      price: 999, salePrice: 888, taxRate: 18, // product-level prices must be ignored for a variant line
      variants: [{ variantId: 'v500', quantity: '500g', price: 120, salePrice: 100, stock: 10 }],
    });
    const res = await cart([{ productId: p._id, variantId: 'v500', quantity: 2 }]);

    const item = res.body.order.items[0];
    assert.equal(item.variantId, 'v500');
    assert.equal(item.price, 100);              // sale price, not the 120 regular price
    assert.equal(item.taxAmount, 36);           // 200 × 18%
    assert.equal(item.total, 236);
    assert.equal(res.body.order.totalAmount, 236);
    assert.equal(gatewayCalls[0].amount, 236);
  });

  test('variant without a sale price: the variant regular price is used', async () => {
    const p = await makeProduct({ price: 999, taxRate: 0, variants: [{ variantId: 'v1', quantity: '1kg', price: 120, salePrice: null, stock: 5 }] });
    const res = await cart([{ productId: p._id, variantId: 'v1', quantity: 1 }]);
    assert.equal(res.body.order.items[0].price, 120);
  });

  test('different catalog tax rates are applied per product and persisted', async () => {
    const a = await makeProduct({ price: 100, taxRate: 18 });
    const b = await makeProduct({ price: 250, taxRate: 5 });
    const c = await makeProduct({ price: 40, taxRate: 0 });
    const res = await cart([{ productId: a._id, quantity: 2 }, { productId: b._id, quantity: 1 }, { productId: c._id, quantity: 3 }]);

    const [ia, ib, ic] = res.body.order.items;
    assert.deepEqual([ia.taxRate, ib.taxRate, ic.taxRate], [18, 5, 0]);
    assert.deepEqual([ia.taxAmount, ib.taxAmount, ic.taxAmount], [36, 12.5, 0]);
    assert.equal(res.body.order.totalAmount, 236 + 262.5 + 120);
    assert.equal(res.body.totals.productTotal, 618.5);
    assert.equal(res.body.totals.combinedTotal, 618.5);

    const stored = await Order.findById(res.body.order._id).lean();
    assert.deepEqual(stored.items.map((i) => i.taxRate), [18, 5, 0]); // persisted, not just returned
  });

  test('client-supplied price / tax / total fields are ignored', async () => {
    const p = await makeProduct({ price: 250, taxRate: 5 });
    const res = await cart(
      [{ productId: p._id, quantity: 1, price: 1, taxAmount: 0, taxRate: 0, total: 1 }],
      { totalAmount: 1, amount: 1, grandTotal: 1 },
    );
    assert.equal(res.body.order.items[0].price, 250);
    assert.equal(res.body.order.items[0].taxAmount, 12.5);
    assert.equal(res.body.order.totalAmount, 262.5);
    assert.equal(gatewayCalls[0].amount, 262.5);
  });
});

describe('cartCheckout — response contract the mobile app maps', () => {
  test('201 body: ids, redirect, order, totals', async () => {
    const p = await makeProduct({ price: 100, taxRate: 18 });
    const res = await cart([{ productId: p._id, quantity: 1 }]);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.match(res.body.merchantTransactionId, /^ZUT_CART_\d+_[0-9a-f]{6}$/);
    assert.equal(res.body.redirectUrl, `https://pay.example.invalid/redirect/${res.body.merchantTransactionId}`);
    assert.deepEqual(res.body.bookings, []);
    assert.deepEqual(res.body.totals, { bookingTotal: 0, productTotal: 118, combinedTotal: 118 });
    assert.equal(res.body.order.status, 'pending_payment');
    assert.equal(res.body.order.phonePeMerchantTransactionId, res.body.merchantTransactionId);
    assert.equal(String(res.body.order.userId), String(user));
    assert.equal(res.body.order.shippingAddress.pincode, '560001');
    assert.equal(res.body.paidWithCoins, undefined);
  });

  test('stock is NOT deducted at creation — only after payment is confirmed', async () => {
    const p = await makeProduct({ price: 100, stock: 10 });
    await cart([{ productId: p._id, quantity: 4 }]);
    assert.equal((await Product.findById(p._id)).stock, 10);
  });
});

describe('cartCheckout — invalid or unavailable items', () => {
  test('insufficient variant stock → 400 with the server message; no order, no gateway call', async () => {
    const p = await makeProduct({ name: 'Ghee', variants: [{ variantId: 'v1', quantity: '500g', price: 100, stock: 1 }] });
    const res = await cart([{ productId: p._id, variantId: 'v1', quantity: 3 }]);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Only 1 unit of Ghee (500g) in stock');
    assert.equal(await Order.countDocuments(), 0);
    assert.equal(gatewayCalls.length, 0);
  });

  test('insufficient stock on a non-variant product → 400', async () => {
    const p = await makeProduct({ name: 'Incense', stock: 2 });
    const res = await cart([{ productId: p._id, quantity: 5 }]);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Only 2 units of Incense in stock');
    assert.equal(await Order.countDocuments(), 0);
  });

  test('unknown or inactive variant → 400', async () => {
    const p = await makeProduct({ name: 'Ghee', variants: [{ variantId: 'v1', quantity: '500g', price: 100, stock: 9, isActive: false }] });
    for (const variantId of ['nope', 'v1']) {
      const res = await cart([{ productId: p._id, variantId, quantity: 1 }]);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, 'Selected variant not available for Ghee');
    }
  });

  // (Changed deliberately: an unavailable item used to be silently dropped while the customer was
  // charged for the rest. It is now rejected, as the legacy order endpoint always did.)
  test('an inactive product rejects the whole cart — nothing is silently dropped', async () => {
    const live = await makeProduct({ price: 100 });
    const off = await makeProduct({ name: 'Retired Item', price: 500, isActive: false });
    const res = await cart([{ productId: off._id, quantity: 1 }, { productId: live._id, quantity: 1 }]);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, '"Retired Item" is no longer available');
    assert.equal(await Order.countDocuments(), 0);
    assert.equal(gatewayCalls.length, 0);
  });

  test('a product that does not exist rejects the cart and creates nothing', async () => {
    const res = await cart([{ productId: oid(), quantity: 1 }]);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Product not available');
    assert.equal(await Order.countDocuments(), 0);
    assert.equal(gatewayCalls.length, 0);
  });

  test('an empty cart is rejected', async () => {
    const res = await cart([]);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Cart is empty');
  });
});

describe('verifyCartPayment', () => {
  const placeOrder = async (qty = 2) => {
    const p = await makeProduct({ price: 100, stock: 10, taxRate: 18 });
    const res = await cart([{ productId: p._id, quantity: qty }]);
    return { p, txn: res.body.merchantTransactionId, orderId: res.body.order._id };
  };
  const verify = (txn, asUser = user) => call(checkout.verifyCartPayment, { user: { _id: asUser }, params: { merchantTransactionId: txn } });

  test('confirmed payment marks the order paid and deducts stock once; a repeat is "alreadyVerified"', async () => {
    const { p, txn, orderId } = await placeOrder(2);

    const first = await verify(txn);
    assert.equal(first.body.success, true);
    assert.equal(first.body.order.status, 'paid');
    assert.equal(first.body.alreadyVerified, undefined);
    assert.equal((await Product.findById(p._id)).stock, 8);

    const again = await verify(txn);
    assert.equal(again.body.success, true);
    assert.equal(again.body.alreadyVerified, true);
    assert.equal((await Product.findById(p._id)).stock, 8);   // not deducted twice
    assert.equal((await Order.findById(orderId)).status, 'paid');
  });

  test('a PENDING gateway state is reported as not-success and leaves the order unpaid', async () => {
    const { txn, orderId } = await placeOrder();
    gatewayStatus = { success: false, state: 'PENDING', code: 'PAYMENT_PENDING' };
    const res = await verify(txn);
    assert.equal(res.body.success, false);
    assert.equal(res.body.state, 'PENDING');
    assert.equal((await Order.findById(orderId)).status, 'pending_payment');
  });

  test('a failed gateway state is reported with its code and leaves the order unpaid', async () => {
    const { p, txn, orderId } = await placeOrder();
    gatewayStatus = { success: false, state: 'FAILED', code: 'PAYMENT_DECLINED' };
    const res = await verify(txn);
    assert.deepEqual([res.body.success, res.body.state, res.body.code], [false, 'FAILED', 'PAYMENT_DECLINED']);
    assert.equal((await Order.findById(orderId)).status, 'pending_payment');
    assert.equal((await Product.findById(p._id)).stock, 10);
  });

  test('only the owner can verify (possessing the transaction id is not authorization)', async () => {
    const { txn, orderId } = await placeOrder();
    const res = await verify(txn, oid());
    assert.equal(res.statusCode, 403);
    assert.equal((await Order.findById(orderId)).status, 'pending_payment'); // and nothing was advanced
  });

  test('an unknown transaction id → 404', async () => {
    const res = await verify('ZUT_CART_0_nothing');
    assert.equal(res.statusCode, 404);
  });
});
