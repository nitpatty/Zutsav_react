/**
 * Tests for the Global Pooja Booking Loyalty Coin Reward system.
 *
 * Covers:
 *   - Default percentage = 5%
 *   - Admin can change the percentage (via the settings controller)
 *   - 0% → no coins
 *   - Reward is based on the PRE-TAX pooja service amount (booking.poojaAmount)
 *   - Tax is excluded; coupon discount does not reduce the reward base
 *   - ₹2,000 × 5% = 100; ₹1,500 × 5% = 75; ₹999 × 5% = 49.95 (2dp rounding)
 *   - Only COMPLETED bookings earn coins (paid/created do not)
 *   - Exactly-once per booking (sequential + concurrent)
 *   - Correct user (the booker) wallet credited; correct ledger entry
 *   - Non-referred and referred users both eligible; referrer NOT credited
 *   - Product / Marketplace orders get nothing
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && npm test
 *
 * Runs against a dedicated TEST database and drops it before and after.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pooja-loyalty-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_pooja_loyalty_test';

// Models
const User = require('../src/models/User');
const UserReferralCode = require('../src/models/UserReferralCode');
const UserWallet = require('../src/models/UserWallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const Booking = require('../src/models/Booking');
const Order = require('../src/models/Order');
const SystemSettings = require('../src/models/SystemSettings');

// Services / controllers
const poojaLoyaltyService = require('../src/services/poojaLoyaltyService');
const walletService = require('../src/services/walletService');
const settingsService = require('../src/utils/settingsService');
const systemSettingsController = require('../src/controllers/systemSettings.controller');

// Helpers
let _seq = 30000;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqEmail = () => `plr${Date.now()}_${_seq}@test.zutsav.local`;

function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
  return res;
}

async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    UserReferralCode.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    Booking.deleteMany({}),
    Order.deleteMany({}),
  ]);
}

async function setupDefaultSettings() {
  await SystemSettings.deleteMany({});
  await SystemSettings.create({
    userReferralEnabled: true,
    userReferralRegistrationRewardCoins: 10,
    userReferralBookingRewardCoins: 50,
    maxRewardedBookingsPerReferredUser: 5,
    poojaBookingCoinRewardPercent: 5,
    coinMonetaryValue: null,
  });
  settingsService.invalidate();
}

/** Set a single setting and invalidate the cache. */
async function setSetting(key, value) {
  await SystemSettings.updateOne({}, { $set: { [key]: value } });
  settingsService.invalidate();
}

async function createUser(name = 'LoyaltyUser') {
  return User.create({ name, email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
}

/**
 * Create a Booking with an explicit pre-tax pooja service amount.
 * Tax/commission fields simulate a real booking but must NOT affect the base.
 */
async function createBooking(userId, {
  poojaAmount = 2000,
  status = 'completed',
  taxAmount = 0,
  grandTotal = null,
  couponDiscount = 0,
} = {}) {
  return Booking.create({
    userId,
    poojaId: new mongoose.Types.ObjectId(),
    scheduledDate: new Date(),
    scheduledTime: '10:00',
    amount: grandTotal ?? poojaAmount + taxAmount,
    poojaAmount,
    kitAmount: 0,
    kitGST: taxAmount,
    taxAmount,
    platformFee: 0,
    platformGST: 0,
    grandTotal: grandTotal ?? poojaAmount + taxAmount,
    couponDiscount,
    status,
    userDetails: { name: 'Booker', phone: uniqPhone(), address: 'Test', pincode: '110001' },
  });
}

async function loyaltyTxs(userId) {
  const { transactions, total } = await walletService.getTransactions(userId, { type: 'POOJA_LOYALTY_REWARD' });
  return { transactions, total };
}

// ── Connect / disconnect ─────────────────────────────────────────────────────
before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.init(),
    UserReferralCode.init(),
    UserWallet.init(),
    WalletTransaction.init(),
    Booking.init(),
    Order.init(),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DEFAULT & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Global percentage configuration', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('default percentage is 5', async () => {
    const percent = await settingsService.get('poojaBookingCoinRewardPercent', 5);
    assert.equal(percent, 5);
  });

  test('admin can change the percentage via the settings controller (string coerced)', async () => {
    const req = { body: { poojaBookingCoinRewardPercent: '7' } };
    const res = mockRes();
    await systemSettingsController.updateSettings(req, res);
    assert.equal(res.body.success, true);

    settingsService.invalidate();
    const percent = await settingsService.get('poojaBookingCoinRewardPercent', 5);
    assert.equal(percent, 7);
  });

  test('negative percentage is rejected and does not overwrite the current value', async () => {
    await setSetting('poojaBookingCoinRewardPercent', 5);

    const req = { body: { poojaBookingCoinRewardPercent: -5 } };
    const res = mockRes();
    await systemSettingsController.updateSettings(req, res);
    assert.equal(res.statusCode, 500); // schema min:0 validation error → existing convention

    settingsService.invalidate();
    const percent = await settingsService.get('poojaBookingCoinRewardPercent', 5);
    assert.equal(percent, 5);
  });

  test('non-numeric percentage is sanitized (not persisted)', async () => {
    await setSetting('poojaBookingCoinRewardPercent', 5);

    const req = { body: { poojaBookingCoinRewardPercent: 'abc' } };
    const res = mockRes();
    await systemSettingsController.updateSettings(req, res);
    assert.equal(res.body.success, true);

    settingsService.invalidate();
    const percent = await settingsService.get('poojaBookingCoinRewardPercent', 5);
    assert.equal(percent, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. REWARD CALCULATION (PRE-TAX BASE)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Reward calculation — pre-tax pooja service amount', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('₹2,000 pre-tax at 5% → 100 coins', async () => {
    const user = await createUser('CalcUser');
    const booking = await createBooking(user._id, { poojaAmount: 2000 });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(result.coins, 100);
    assert.equal(result.baseAmount, 2000);
    assert.equal(result.percent, 5);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
  });

  test('₹1,500 pre-tax at 5% → 75 coins', async () => {
    const user = await createUser('CalcUser2');
    const booking = await createBooking(user._id, { poojaAmount: 1500 });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(result.coins, 75);
  });

  test('₹999 pre-tax at 5% → 49.95 coins (2-decimal rounding)', async () => {
    const user = await createUser('CalcUser3');
    const booking = await createBooking(user._id, { poojaAmount: 999 });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(result.coins, 49.95);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 49.95);
  });

  test('tax is EXCLUDED from the reward base', async () => {
    // Spec example: base ₹2,000, tax ₹118, payable ₹2,118 → reward = ₹2,000 × 5% = 100
    const user = await createUser('TaxUser');
    const booking = await createBooking(user._id, {
      poojaAmount: 2000,
      taxAmount: 118,
      grandTotal: 2118,
    });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(result.coins, 100, 'reward must be 100, not 105.9 (2118 × 5%)');
    assert.equal(result.baseAmount, 2000);
  });

  test('coupon discount does NOT reduce the reward base (pre-tax service amount)', async () => {
    // Audited rule: booking.poojaAmount is stored at full price; couponDiscount
    // only reduces the payable total. Base remains the original pre-tax amount.
    const user = await createUser('CouponUser');
    const booking = await createBooking(user._id, {
      poojaAmount: 2000,
      taxAmount: 118,
      grandTotal: 2118,
      couponDiscount: 200, // ₹200 off the payable
    });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(result.coins, 100, 'base stays ₹2,000 despite the ₹200 coupon');
  });

  test('0% → no coins, no ledger entry, no booking marker', async () => {
    await setSetting('poojaBookingCoinRewardPercent', 0);

    const user = await createUser('ZeroUser');
    const booking = await createBooking(user._id, { poojaAmount: 2000 });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, false);
    assert.equal(result.reason, 'percent-disabled');

    const wallet = await walletService.getWallet(user._id);
    assert.ok(!wallet || wallet.balance === 0);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 0);

    const stored = await Booking.findById(booking._id);
    assert.equal(stored.loyaltyRewardCreditedAt, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ELIGIBILITY — ONLY COMPLETED POOJA BOOKINGS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Eligibility — COMPLETED Pooja bookings only', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('completed Pooja booking grants loyalty coins to the booker', async () => {
    const user = await createUser('EligibleUser');
    const booking = await createBooking(user._id, { status: 'completed' });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 1);

    // Booking audit fields recorded
    const stored = await Booking.findById(booking._id);
    assert.equal(stored.loyaltyRewardCoins, 100);
    assert.equal(stored.loyaltyRewardPercent, 5);
    assert.equal(stored.loyaltyRewardBaseAmount, 2000);
    assert.ok(stored.loyaltyRewardCreditedAt);
  });

  test('booking NOT completed (paid) → no loyalty coins', async () => {
    const user = await createUser('PaidUser');
    const booking = await createBooking(user._id, { status: 'paid' });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, false);
    assert.equal(result.reason, 'not-completed');

    const wallet = await walletService.getWallet(user._id);
    assert.ok(!wallet || wallet.balance === 0);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 0);
  });

  test('payment success alone (no completion) → no loyalty coins', async () => {
    const user = await createUser('ConfirmedUser');
    const booking = await createBooking(user._id, { status: 'paid' });

    // Simulate repeated payment/confirmation callbacks — never credited
    await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);

    const wallet = await walletService.getWallet(user._id);
    assert.ok(!wallet || wallet.balance === 0);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 0);
  });

  test('Product order → no loyalty reward', async () => {
    const user = await createUser('ProdUser');
    await Order.create({
      userId: user._id,
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'Product', price: 100, quantity: 1, taxRate: 0, taxAmount: 0, total: 100 }],
      totalAmount: 100,
      status: 'delivered',
      shippingAddress: { name: 'ProdUser', phone: uniqPhone(), address: 'Test', pincode: '110001' },
    });

    const wallet = await walletService.getWallet(user._id);
    assert.ok(!wallet || wallet.balance === 0);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 0);
  });

  test('Marketplace order → no loyalty reward', async () => {
    const user = await createUser('MktUser');
    await Order.create({
      userId: user._id,
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'MarketplaceItem', price: 250, quantity: 2, taxRate: 0, taxAmount: 0, total: 500 }],
      totalAmount: 500,
      status: 'delivered',
      shippingAddress: { name: 'MktUser', phone: uniqPhone(), address: 'Test', pincode: '110001' },
    });

    const wallet = await walletService.getWallet(user._id);
    assert.ok(!wallet || wallet.balance === 0);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. REFERRAL SEPARATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Referral separation — loyalty goes to the booker, not the referrer', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('non-referred user is eligible for loyalty coins', async () => {
    const user = await createUser('NoRefUser');
    const booking = await createBooking(user._id);

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
  });

  test('referred user is also eligible — coins go to the booker, NOT the referrer', async () => {
    const referrer = await createUser('LoyalRef');
    const referred = await createUser('LoyalReferred');
    await UserReferralCode.create({
      code: 'LOY01',
      userId: referrer._id,
      status: 'USED',
      usedBy: referred._id,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });

    const booking = await createBooking(referred._id);
    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(String(result.bookingId), String(booking._id));

    // Booker (referred user) receives the coins
    const bookerWallet = await walletService.getWallet(referred._id);
    assert.equal(bookerWallet.balance, 100);

    // Referrer receives NOTHING from the loyalty rule
    const referrerWallet = await walletService.getWallet(referrer._id);
    assert.ok(!referrerWallet || referrerWallet.balance === 0);
    const referrerLoyalty = await loyaltyTxs(referrer._id);
    assert.equal(referrerLoyalty.total, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. IDEMPOTENCY & CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Idempotency and concurrency — exactly one reward per booking', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('same COMPLETED event processed twice (sequential) → one reward', async () => {
    const user = await createUser('IdemUser');
    const booking = await createBooking(user._id);

    const first = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    const second = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);

    assert.equal(first.granted, true);
    assert.equal(second.granted, true, 'second call is idempotent — no error');

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 1);

    // Exactly one wallet transaction for this booking key
    const key = `pooja_loyalty_reward_${booking._id}`;
    const dup = await WalletTransaction.find({ idempotencyKey: key });
    assert.equal(dup.length, 1);
  });

  test('concurrent completion handlers cannot double-credit', async () => {
    const user = await createUser('ConcUser');
    const booking = await createBooking(user._id);

    const results = await Promise.all([
      poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id),
      poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id),
      poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id),
    ]);

    assert.ok(results.every((r) => r.granted === true), 'all idempotent calls succeed');

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100, 'credited exactly once');
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 1);
  });

  test('concurrent completions of DIFFERENT bookings each credit once', async () => {
    const user = await createUser('MultiUser');
    const bookings = [await createBooking(user._id), await createBooking(user._id), await createBooking(user._id)];

    await Promise.all(bookings.map((b) => poojaLoyaltyService.grantPoojaLoyaltyReward(b._id)));

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 300); // 3 × 100
    const { total } = await loyaltyTxs(user._id);
    assert.equal(total, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. WALLET LEDGER INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Wallet ledger integrity', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('correct user wallet credited and ledger entry created with booking reference', async () => {
    const user = await createUser('LedgerUser');
    const booking = await createBooking(user._id, { poojaAmount: 2000, taxAmount: 118, grandTotal: 2118 });

    await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);

    const { transactions, total } = await loyaltyTxs(user._id);
    assert.equal(total, 1);

    const tx = transactions[0];
    assert.equal(tx.amount, 100);
    assert.equal(tx.direction, 'CREDIT');
    assert.equal(tx.type, 'POOJA_LOYALTY_REWARD');
    assert.equal(tx.status, 'COMPLETED');
    assert.equal(tx.reference.type, 'BOOKING');
    assert.equal(String(tx.reference.id), String(booking._id));
    assert.equal(tx.description.includes('Booking #'), true);
    assert.equal(tx.idempotencyKey, `pooja_loyalty_reward_${booking._id}`);

    // Balance = ledger sum
    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
    assert.equal(wallet.totalEarned, 100);
  });

  test('loyalty coins do not disturb referral/wallet ledger types', async () => {
    const user = await createUser('MixedUser');
    const booking = await createBooking(user._id);

    // A referral-style credit first (simulating separate systems)
    await walletService.credit({
      userId: user._id,
      amount: 50,
      type: 'REFERRAL_BOOKING_REWARD',
      description: 'Referral Booking Reward — test',
      reference: { type: 'UserReferralBookingReward', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `referral_booking_reward_${new mongoose.Types.ObjectId()}`,
    });

    await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 150);

    const { transactions } = await walletService.getTransactions(user._id);
    const types = transactions.map((t) => t.type).sort();
    assert.deepEqual(types, ['POOJA_LOYALTY_REWARD', 'REFERRAL_BOOKING_REWARD']);
  });
});