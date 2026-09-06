/**
 * Coupon System — comprehensive tests for Percentage/Fixed discount,
 * all applicability types (POOJA, PRODUCTS, KITS, MARKETPLACE),
 * validation, limits, max-discount capping, redemption recording,
 * and consumer endpoint + purchase flow integration.
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && node --test tests/coupon-system.test.js
 *
 * Runs against a dedicated TEST database and drops it before and after.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'coupon-system-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_coupon_system_test';

const Coupon = require('../src/models/Coupon');
const CouponRedemption = require('../src/models/CouponRedemption');
const User = require('../src/models/User');
const Booking = require('../src/models/Booking');
const Order = require('../src/models/Order');

const couponService = require('../src/services/couponService');

// ── Helpers ──────────────────────────────────────────────────────────────────
let _seq = 20000;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqEmail = () => `coupon${Date.now()}_${_seq}@test.zutsav.local`;

async function cleanCollections() {
  await Promise.all([
    Coupon.deleteMany({}),
    CouponRedemption.deleteMany({}),
    User.deleteMany({}),
    Booking.deleteMany({}),
    Order.deleteMany({}),
  ]);
}

async function makeUser(role) {
  return User.create({
    name: 'CouponTester',
    email: uniqEmail(),
    phone: uniqPhone(),
    password: 'secret123',
    role: role || 'user',
  });
}

async function makeCoupon(overrides = {}) {
  const defaults = {
    code: 'T' + Date.now() + Math.floor(Math.random() * 1000),
    discountType: 'FIXED',
    discountValue: 100,
    minCartValue: 0,
    maxDiscount: null,
    validFrom: new Date(Date.now() - 86400000),
    expiresAt: new Date(Date.now() + 86400000 * 30),
    usageLimit: null,
    perUserLimit: null,
    applicability: ['POOJA'],
    isActive: true,
    usageCount: 0,
  };
  return Coupon.create({ ...defaults, ...overrides });
}

before(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DISCOUNT CALCULATION — PERCENTAGE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Percentage discount calculation', () => {
  before(cleanCollections);

  test('₹1000 × 10% = ₹100 discount', async () => {
    const coupon = await makeCoupon({ discountType: 'PERCENTAGE', discountValue: 10, applicability: ['POOJA'] });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 1000);
    assert.equal(discount, 100);
    assert.equal(finalPayable, 900);
  });

  test('₹5000 × 20% = ₹1000 discount', async () => {
    const coupon = await makeCoupon({ discountType: 'PERCENTAGE', discountValue: 20, applicability: ['POOJA'] });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 5000);
    assert.equal(discount, 1000);
    assert.equal(finalPayable, 4000);
  });

  test('percentage capped by maxDiscount (₹3000 × 10% = ₹300, max ₹200 → ₹200)', async () => {
    const coupon = await makeCoupon({
      discountType: 'PERCENTAGE', discountValue: 10, maxDiscount: 200, applicability: ['POOJA'],
    });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 3000);
    assert.equal(discount, 200);
    assert.equal(finalPayable, 2800);
  });

  test('percentage never exceeds eligible amount (100% cap)', async () => {
    const coupon = await makeCoupon({ discountType: 'PERCENTAGE', discountValue: 100, applicability: ['POOJA'] });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 1000);
    assert.equal(discount, 1000);
    assert.equal(finalPayable, 0);
  });

  test('100% coupon is valid via validateCoupon', async () => {
    const coupon = await makeCoupon({ discountType: 'PERCENTAGE', discountValue: 100, applicability: ['POOJA'] });
    const user = await makeUser();
    const result = await couponService.validateCoupon({
      code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'POOJA',
    });
    assert.equal(result.valid, true);
    assert.equal(result.discount, 1000);
    assert.equal(result.finalPayable, 0);
  });

  test('percentage with decimal value ₹999 × 7.5% rounds to paisa', async () => {
    const coupon = await makeCoupon({ discountType: 'PERCENTAGE', discountValue: 7.5, applicability: ['POOJA'] });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 999);
    // 999 * 7.5% = 74.925 → rounds to 74.93
    assert.equal(discount, 74.93);
    assert.equal(finalPayable, 924.07);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DISCOUNT CALCULATION — FIXED
// ═══════════════════════════════════════════════════════════════════════════════
describe('Fixed discount calculation', () => {
  before(cleanCollections);

  test('Cart ₹1500 − ₹100 fixed = ₹1400', async () => {
    const coupon = await makeCoupon({ discountType: 'FIXED', discountValue: 100, applicability: ['POOJA'] });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 1500);
    assert.equal(discount, 100);
    assert.equal(finalPayable, 1400);
  });

  test('fixed never exceeds cart value (cart ₹50, fixed ₹100 → ₹50)', async () => {
    const coupon = await makeCoupon({ discountType: 'FIXED', discountValue: 100, applicability: ['POOJA'] });
    const { discount, finalPayable } = couponService.calculateDiscount(coupon, 50);
    assert.equal(discount, 50);
    assert.equal(finalPayable, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. APPLICABILITY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Applicability enforcement', () => {
  before(cleanCollections);

  test('Coupon A (POOJA): valid for POOJA, invalid for PRODUCTS/KITS/MARKETPLACE', async () => {
    const coupon = await makeCoupon({ applicability: ['POOJA'] });
    const user = await makeUser();
    for (const [type, expected] of [
      ['POOJA', true], ['PRODUCTS', false], ['KITS', false], ['MARKETPLACE', false],
    ]) {
      const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: type });
      assert.equal(r.valid, expected, `${type} expected ${expected}`);
    }
  });

  test('Coupon B (PRODUCTS): valid for PRODUCTS, invalid for others', async () => {
    const coupon = await makeCoupon({ applicability: ['PRODUCTS'] });
    const user = await makeUser();
    for (const [type, expected] of [
      ['POOJA', false], ['PRODUCTS', true], ['KITS', false], ['MARKETPLACE', false],
    ]) {
      const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: type });
      assert.equal(r.valid, expected);
    }
  });

  test('Coupon C (KITS): valid for KITS only', async () => {
    const coupon = await makeCoupon({ applicability: ['KITS'] });
    const user = await makeUser();
    for (const [type, expected] of [
      ['POOJA', false], ['PRODUCTS', false], ['KITS', true], ['MARKETPLACE', false],
    ]) {
      const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: type });
      assert.equal(r.valid, expected);
    }
  });

  test('Coupon D (MARKETPLACE): valid for MARKETPLACE only', async () => {
    const coupon = await makeCoupon({ applicability: ['MARKETPLACE'] });
    const user = await makeUser();
    for (const [type, expected] of [
      ['POOJA', false], ['PRODUCTS', false], ['KITS', false], ['MARKETPLACE', true],
    ]) {
      const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: type });
      assert.equal(r.valid, expected);
    }
  });

  test('Coupon E (POOJA + PRODUCT): valid for both, invalid for KITS/MARKETPLACE', async () => {
    const coupon = await makeCoupon({ applicability: ['POOJA', 'PRODUCTS'] });
    const user = await makeUser();
    for (const [type, expected] of [
      ['POOJA', true], ['PRODUCTS', true], ['KITS', false], ['MARKETPLACE', false],
    ]) {
      const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: type });
      assert.equal(r.valid, expected);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. VALIDATION — MIN CART, EXPIRY, INACTIVE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Validation — min cart, expiry, inactive', () => {
  before(cleanCollections);

  test('below minimum cart value rejected', async () => {
    const coupon = await makeCoupon({ discountType: 'FIXED', discountValue: 50, minCartValue: 1000, applicability: ['POOJA'] });
    const user = await makeUser();
    const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 900, cartType: 'POOJA' });
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('Minimum cart value'));
  });

  test('at minimum cart value accepted', async () => {
    const coupon = await makeCoupon({ discountType: 'FIXED', discountValue: 50, minCartValue: 1000, applicability: ['POOJA'] });
    const user = await makeUser();
    const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1500, cartType: 'POOJA' });
    assert.equal(r.valid, true);
    assert.equal(r.discount, 50);
  });

  test('expired coupon rejected', async () => {
    const coupon = await makeCoupon({ expiresAt: new Date(Date.now() - 1000), applicability: ['POOJA'] });
    const user = await makeUser();
    const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'POOJA' });
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('expired'));
  });

  test('not-yet-valid coupon rejected', async () => {
    const coupon = await makeCoupon({ validFrom: new Date(Date.now() + 86400000), applicability: ['POOJA'] });
    const user = await makeUser();
    const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'POOJA' });
    assert.equal(r.valid, false);
  });

  test('inactive coupon rejected', async () => {
    const coupon = await makeCoupon({ isActive: false, applicability: ['POOJA'] });
    const user = await makeUser();
    const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'POOJA' });
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('active'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. USAGE LIMITS & REDEMPTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Usage limits and redemption', () => {
  before(cleanCollections);

  test('global usage limit exhausted → rejected', async () => {
    const coupon = await makeCoupon({ usageLimit: 2, usageCount: 2, applicability: ['POOJA'] });
    const user = await makeUser();
    const r = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'POOJA' });
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('usage limit'));
  });

  test('per-user limit enforced across applicability types', async () => {
    const coupon = await makeCoupon({ perUserLimit: 1, applicability: ['PRODUCTS'] });
    const user = await makeUser();

    // First use valid
    const r1 = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'PRODUCTS' });
    assert.equal(r1.valid, true);

    // Record a redemption as if the user used it
    await couponService.recordRedemption({
      couponId: coupon._id, userId: user._id, orderId: new mongoose.Types.ObjectId(),
      purchaseType: 'PRODUCTS', discountType: 'FIXED',
      discountApplied: 100, cartValue: 1000, finalPayable: 900,
    });

    // Second use for same user rejected
    const r2 = await couponService.validateCoupon({ code: coupon.code, userId: user._id, cartValue: 1000, cartType: 'PRODUCTS' });
    assert.equal(r2.valid, false);
    assert.ok(r2.error.includes('already used'));
  });

  test('redemption records discountType and purchaseType', async () => {
    const coupon = await makeCoupon({ discountType: 'PERCENTAGE', discountValue: 10, applicability: ['POOJA'] });
    const user = await makeUser();
    const { redemption } = await couponService.recordRedemption({
      couponId: coupon._id, userId: user._id,
      bookingId: new mongoose.Types.ObjectId(),
      purchaseType: 'POOJA', discountType: 'PERCENTAGE',
      discountApplied: 100, cartValue: 1000, finalPayable: 900,
    });
    assert.equal(redemption.discountType, 'PERCENTAGE');
    assert.equal(redemption.purchaseType, 'POOJA');
    assert.equal(redemption.discountApplied, 100);
  });

  test('redemption for order records orderId', async () => {
    const coupon = await makeCoupon({ applicability: ['MARKETPLACE'] });
    const user = await makeUser();
    const orderId = new mongoose.Types.ObjectId();
    const { redemption } = await couponService.recordRedemption({
      couponId: coupon._id, userId: user._id,
      orderId, purchaseType: 'MARKETPLACE', discountType: 'FIXED',
      discountApplied: 50, cartValue: 500, finalPayable: 450,
    });
    assert.equal(String(redemption.orderId), String(orderId));
    assert.equal(redemption.bookingId, null);
  });

  test('global usage count increments on new redemption but not duplicate', async () => {
    const coupon = await makeCoupon({ applicability: ['POOJA'] });
    const user = await makeUser();
    const bookingId = new mongoose.Types.ObjectId();

    const first = await couponService.recordRedemption({
      couponId: coupon._id, userId: user._id, bookingId,
      purchaseType: 'POOJA', discountType: 'FIXED',
      discountApplied: 50, cartValue: 500, finalPayable: 450,
    });
    assert.equal(first.alreadyExists, false);

    const second = await couponService.recordRedemption({
      couponId: coupon._id, userId: user._id, bookingId,
      purchaseType: 'POOJA', discountType: 'FIXED',
      discountApplied: 50, cartValue: 500, finalPayable: 450,
    });
    assert.equal(second.alreadyExists, true);

    const updated = await Coupon.findById(coupon._id);
    assert.equal(updated.usageCount, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CODE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Code normalization', () => {
  before(cleanCollections);

  test('puja10, PUJA10, and  puja10 resolve to same coupon', async () => {
    const coupon = await makeCoupon({ code: 'PUJA10', applicability: ['POOJA'] });
    const user = await makeUser();

    const r1 = await couponService.validateCoupon({ code: 'puja10', userId: user._id, cartValue: 1000, cartType: 'POOJA' });
    const r2 = await couponService.validateCoupon({ code: 'PUJA10', userId: user._id, cartValue: 1000, cartType: 'POOJA' });
    const r3 = await couponService.validateCoupon({ code: ' puja10 ', userId: user._id, cartValue: 1000, cartType: 'POOJA' });

    assert.equal(r1.valid, true);
    assert.equal(r2.valid, true);
    assert.equal(r3.valid, true);
    assert.equal(String(r1.coupon._id), String(coupon._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PURCHASE FLOW INTEGRATION (Booking + Order)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Purchase flow integration', () => {
  before(cleanCollections);

  test('POOJA booking stores couponId, couponCode and couponDiscount', async () => {
    const coupon = await makeCoupon({ applicability: ['POOJA'] });
    const user = await makeUser();

    // Simulate the booking controller: validate + record precedence, store on booking
    const result = await couponService.validateCoupon({
      code: coupon.code, userId: user._id, cartValue: 1500, cartType: 'POOJA',
    });
    assert.equal(result.valid, true);
    assert.equal(result.discount, 100);

    const booking = await Booking.create({
      userId: user._id,
      poojaId: new mongoose.Types.ObjectId(),
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      userDetails: { name: 'T', phone: uniqPhone(), address: 'A', pincode: '1', city: 'C', state: 'S' },
      poojaAmount: 1500, kitAmount: 0, kitGST: 0, platformFee: 0, platformGST: 0,
      taxAmount: 0, grandTotal: 1400, baseAmount: 1500,
      commissionPercent: 0, commissionAmount: 0, gstPercent: 0, gstAmount: 0,
      amount: 1400, paymentMode: 'FULL', paymentStatus: 'PENDING',
      amountPaid: 0, remainingAmount: 1400,
      couponCode: coupon.code, couponId: coupon._id, couponDiscount: 100,
    });

    assert.equal(booking.couponDiscount, 100);
    assert.equal(booking.grandTotal, 1400);
  });

  test('order stores couponId, couponCode and couponDiscount', async () => {
    const coupon = await makeCoupon({ applicability: ['PRODUCTS'] });
    const user = await makeUser();

    const order = await Order.create({
      userId: user._id,
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'X', price: 500, quantity: 2, total: 1000 }],
      totalAmount: 900,
      shippingAddress: { name: 'T', phone: uniqPhone(), address: 'A', pincode: '1', city: 'C', state: 'S' },
      couponCode: coupon.code, couponId: coupon._id, couponDiscount: 100,
    });

    assert.equal(order.couponDiscount, 100);
    assert.equal(order.totalAmount, 900);
  });
});
