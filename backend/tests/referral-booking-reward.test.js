/**
 * Tests for the Referral Booking Reward system (automatic grant).
 *
 * Covers:
 *   - Existing +10 registration reward is unchanged
 *   - Completed Pooja booking → automatic reward for the referrer
 *   - Completed Kit booking → automatic reward for the referrer
 *   - Product / Marketplace orders (Order model) → NO reward
 *   - Reward amount comes from admin config (default 50, not hardcoded)
 *   - Per-referred-user limit (default 5; 0 disables; 1 allows one)
 *   - Independent limits for different referred users
 *   - Per-booking idempotency (sequential + concurrent duplicates)
 *   - Concurrency-safe limit enforcement (no 6th reward at the boundary)
 *   - Wallet ledger integrity (exactly one credit per reward)
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && npm test
 *
 * Runs against a dedicated TEST database and drops it before and after.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'referral-booking-reward-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_referral_booking_reward_test';

// Models
const User = require('../src/models/User');
const UserReferralCode = require('../src/models/UserReferralCode');
const UserWallet = require('../src/models/UserWallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const UserReferralBookingReward = require('../src/models/UserReferralBookingReward');
const Booking = require('../src/models/Booking');
const Order = require('../src/models/Order');
const OTP = require('../src/models/OTP');
const SystemSettings = require('../src/models/SystemSettings');

// Services / controllers
const userReferralService = require('../src/services/userReferralService');
const walletService = require('../src/services/walletService');
const settingsService = require('../src/utils/settingsService');
const authController = require('../src/controllers/auth.controller');

// Notification engine mock
const { NotificationEngine } = require('../notification-engine');
let emitCalls = [];
const originalEmit = NotificationEngine.emit;

// Helpers
let _seq = 20000;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqEmail = () => `rbr${Date.now()}_${_seq}@test.zutsav.local`;

function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
  return res;
}

function mockReq(body, headers = {}) {
  return { body, headers, socket: {} };
}

async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    UserReferralCode.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    UserReferralBookingReward.deleteMany({}),
    Booking.deleteMany({}),
    Order.deleteMany({}),
    OTP.deleteMany({}),
  ]);
}

async function setupDefaultSettings() {
  await SystemSettings.deleteMany({});
  await SystemSettings.create({
    userReferralEnabled: true,
    userReferralDefaultValidityDays: 30,
    userReferralDailyLimit: 5,
    userReferralRegistrationRewardCoins: 10,
    userReferralBookingRewardCoins: 50,
    maxRewardedBookingsPerReferredUser: 5,
    coinMonetaryValue: null,
  });
  settingsService.invalidate();
}

/** Set a single setting and invalidate the cache. */
async function setSetting(key, value) {
  await SystemSettings.updateOne({}, { $set: { [key]: value } });
  settingsService.invalidate();
}

/** Create a referrer + referred user pair linked by a USED referral code. */
async function createReferralPair(referrerName = 'Referrer', referredName = 'Referred') {
  const referrer = await User.create({ name: referrerName, email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
  const referred = await User.create({ name: referredName, email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
  const code = await UserReferralCode.create({
    code: `RBR${String(_seq).slice(-4)}`,
    userId: referrer._id,
    status: 'USED',
    usedBy: referred._id,
    usedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  });
  return { referrer, referred, code };
}

/** Create a Booking for the given user. */
async function createBooking(userId, { status = 'completed', withKit = false } = {}) {
  return Booking.create({
    userId,
    poojaId: new mongoose.Types.ObjectId(),
    scheduledDate: new Date(),
    scheduledTime: '10:00',
    amount: 500,
    grandTotal: 500,
    status,
    withKit,
    kitIds: withKit ? [new mongoose.Types.ObjectId()] : [],
    userDetails: { name: 'Booker', phone: uniqPhone(), address: 'Test', pincode: '110001' },
  });
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
    UserReferralBookingReward.init(),
    Booking.init(),
    Order.init(),
  ]);
  NotificationEngine.emit = async (name) => { emitCalls.push(name); };
});

after(async () => {
  NotificationEngine.emit = originalEmit;
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REGISTRATION REWARD UNCHANGED
// ═══════════════════════════════════════════════════════════════════════════════
describe('Existing registration reward remains +10', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('referral registration still credits exactly +10 coins once', async () => {
    const referrer = await User.create({ name: 'RegRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(referrer._id);

    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'NewRegistrant', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(wallet);
    assert.equal(wallet.balance, 10);
    assert.equal(wallet.totalEarned, 10);

    const { transactions, total } = await walletService.getTransactions(referrer._id);
    assert.equal(total, 1);
    assert.equal(transactions[0].amount, 10);
    assert.equal(transactions[0].type, 'REFERRAL_REGISTRATION');
    assert.equal(transactions[0].direction, 'CREDIT');

    const codeDoc = await UserReferralCode.findById(genResult.referralCodeId);
    assert.equal(codeDoc.status, 'USED');
    assert.equal(codeDoc.registrationRewardCredited, true);
  });

  test('registration reward is NOT affected by the booking limit setting', async () => {
    // Booking limit = 0 must not touch the registration reward.
    await setSetting('maxRewardedBookingsPerReferredUser', 0);

    const referrer = await User.create({ name: 'RegRef2', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(referrer._id);

    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'NewRegistrant2', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 10);

    await setSetting('maxRewardedBookingsPerReferredUser', 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AUTOMATIC REWARD ON QUALIFYING COMPLETED BOOKINGS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Automatic reward on qualifying completed bookings', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('completed Pooja booking grants the referral booking reward', async () => {
    const { referrer, referred, code } = await createReferralPair('PoojaRef', 'PoojaUser');
    const booking = await createBooking(referred._id, { withKit: false });

    const result = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(result.created, true);
    assert.equal(result.reward.status, 'APPROVED');
    assert.equal(result.reward.rewardAmount, 50);
    assert.equal(result.reward.bookingType, 'POOJA');
    assert.equal(String(result.reward.userId), String(referrer._id));
    assert.equal(String(result.reward.referredUserId), String(referred._id));
    assert.equal(String(result.reward.bookingId), String(booking._id));
    assert.equal(result.reward.coinsCredited, true);

    // Referrer wallet credited
    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);

    // Exactly one ledger entry — reference links back to the reward record
    const { transactions, total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 1);
    assert.equal(transactions[0].amount, 50);
    assert.equal(transactions[0].direction, 'CREDIT');
    assert.equal(transactions[0].reference.type, 'UserReferralBookingReward');
    assert.equal(String(transactions[0].reference.id), String(result.reward._id));
    assert.equal(transactions[0].description.includes('PoojaUser'), true);
    assert.equal(transactions[0].description.includes('Pooja'), true);

    // Slot recorded on the referral relationship
    const codeDoc = await UserReferralCode.findById(code._id);
    assert.equal(codeDoc.rewardedBookingIds.length, 1);
    assert.equal(String(codeDoc.rewardedBookingIds[0]), String(booking._id));
  });

  test('completed Kit booking grants the referral booking reward', async () => {
    const { referrer, referred, code } = await createReferralPair('KitRef', 'KitUser');
    const booking = await createBooking(referred._id, { withKit: true });

    const result = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(result.created, true);
    assert.equal(result.reward.status, 'APPROVED');
    assert.equal(result.reward.bookingType, 'KIT');
    assert.equal(result.reward.rewardAmount, 50);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);

    const { transactions } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].description.includes('Kit'), true);
    assert.equal(transactions[0].description.includes('KitUser'), true);

    const codeDoc = await UserReferralCode.findById(code._id);
    assert.equal(codeDoc.rewardedBookingIds.length, 1);
  });

  test('booking NOT in COMPLETED status grants nothing', async () => {
    const { referred } = await createReferralPair('PendingRef', 'PendingUser');
    const booking = await createBooking(referred._id, { status: 'paid' });

    const result = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(result.created, false);
    assert.equal(await UserReferralBookingReward.countDocuments({ bookingId: booking._id }), 0);
  });

  test('booking by a NON-referred user grants nothing', async () => {
    const plainUser = await User.create({ name: 'NoRefUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const booking = await createBooking(plainUser._id);

    const result = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(result.created, false);
    assert.equal(await UserReferralBookingReward.countDocuments(), 0);
  });

  test('Product order (Order model) does NOT grant a reward', async () => {
    const { referrer, referred } = await createReferralPair('ProdRef', 'ProdUser');
    const order = await Order.create({
      userId: referred._id,
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'Product', price: 100, quantity: 1, taxRate: 0, taxAmount: 0, total: 100 }],
      totalAmount: 100,
      status: 'delivered',
      shippingAddress: { name: 'ProdUser', phone: uniqPhone(), address: 'Test', pincode: '110001' },
    });

    // No reward hook exists for orders: nothing is created, nothing credited.
    const result = await userReferralService.createBookingRewardEligibility(order._id);
    assert.equal(result.created, false);
    assert.equal(await UserReferralBookingReward.countDocuments(), 0);
    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(!wallet || wallet.balance === 0);
  });

  test('Marketplace order (Order model) does NOT grant a reward', async () => {
    const { referrer, referred } = await createReferralPair('MktRef', 'MktUser');
    await Order.create({
      userId: referred._id,
      items: [{ productId: new mongoose.Types.ObjectId(), name: 'MarketplaceItem', price: 250, quantity: 2, taxRate: 0, taxAmount: 0, total: 500 }],
      totalAmount: 500,
      status: 'delivered',
      shippingAddress: { name: 'MktUser', phone: uniqPhone(), address: 'Test', pincode: '110001' },
    });

    assert.equal(await UserReferralBookingReward.countDocuments(), 0);
    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(!wallet || wallet.balance === 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REWARD AMOUNT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
describe('Reward amount is admin-configurable (default 50)', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('default reward value is 50', async () => {
    const { referrer, referred } = await createReferralPair('DefRef', 'DefUser');
    const booking = await createBooking(referred._id);
    await userReferralService.createBookingRewardEligibility(booking._id);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);
  });

  test('configured reward value is used (75)', async () => {
    await setSetting('userReferralBookingRewardCoins', 75);

    const { referrer, referred } = await createReferralPair('ConfRef', 'ConfUser');
    const booking = await createBooking(referred._id);
    const result = await userReferralService.createBookingRewardEligibility(booking._id);

    assert.equal(result.reward.rewardAmount, 75);
    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 75);
    const { transactions } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(transactions[0].amount, 75);

    await setSetting('userReferralBookingRewardCoins', 50);
  });

  test('changing the setting does NOT rewrite historical rewards', async () => {
    const { referrer, referred } = await createReferralPair('HistRef', 'HistUser');

    // First reward at default 50
    const b1 = await createBooking(referred._id);
    const r1 = await userReferralService.createBookingRewardEligibility(b1._id);
    assert.equal(r1.reward.rewardAmount, 50);

    // Change to 100, grant a second reward
    await setSetting('userReferralBookingRewardCoins', 100);
    const b2 = await createBooking(referred._id);
    const r2 = await userReferralService.createBookingRewardEligibility(b2._id);
    assert.equal(r2.reward.rewardAmount, 100);

    // First record still snapshots 50
    const stored1 = await UserReferralBookingReward.findById(r1.reward._id);
    assert.equal(stored1.rewardAmount, 50);
    const stored2 = await UserReferralBookingReward.findById(r2.reward._id);
    assert.equal(stored2.rewardAmount, 100);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 150);

    await setSetting('userReferralBookingRewardCoins', 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PER-REFERRED-USER LIMIT
// ═══════════════════════════════════════════════════════════════════════════════
describe('Per-referred-user booking reward limit', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('default limit (5): first five completed bookings reward, sixth does not', async () => {
    const { referrer, referred } = await createReferralPair('LimitRef', 'LimitUser');

    const results = [];
    for (let i = 0; i < 6; i++) {
      const booking = await createBooking(referred._id);
      results.push(await userReferralService.createBookingRewardEligibility(booking._id));
    }

    const approved = results.filter((r) => r.reward?.status === 'APPROVED');
    const denied = results.filter((r) => r.reward?.status === 'DENIED');
    assert.equal(approved.length, 5);
    assert.equal(denied.length, 1);
    assert.equal(denied[0].limitReached, true);
    assert.equal(denied[0].reward.adminNote.includes('Reward limit'), true);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 5 * 50);
    const { total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 5);

    // Referral relationship records exactly 5 allocated bookings
    const code = await UserReferralCode.findOne({ usedBy: referred._id, status: 'USED' });
    assert.equal(code.rewardedBookingIds.length, 5);
  });

  test('limit = 0 → no booking rewards at all', async () => {
    await setSetting('maxRewardedBookingsPerReferredUser', 0);

    const { referrer, referred } = await createReferralPair('ZeroRef', 'ZeroUser');
    const booking = await createBooking(referred._id);
    const result = await userReferralService.createBookingRewardEligibility(booking._id);

    assert.equal(result.created, true);
    assert.equal(result.limitReached, true);
    assert.equal(result.reward.status, 'DENIED');

    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(!wallet || wallet.balance === 0);
    assert.equal(await UserReferralBookingReward.countDocuments({ status: 'APPROVED' }), 0);

    await setSetting('maxRewardedBookingsPerReferredUser', 5);
  });

  test('limit = 1 → only the first qualifying completed booking is rewarded', async () => {
    await setSetting('maxRewardedBookingsPerReferredUser', 1);

    const { referrer, referred } = await createReferralPair('OneRef', 'OneUser');
    const b1 = await createBooking(referred._id);
    const b2 = await createBooking(referred._id);

    const r1 = await userReferralService.createBookingRewardEligibility(b1._id);
    const r2 = await userReferralService.createBookingRewardEligibility(b2._id);

    assert.equal(r1.reward.status, 'APPROVED');
    assert.equal(r2.reward.status, 'DENIED');

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);
    assert.equal(await UserReferralBookingReward.countDocuments({ status: 'APPROVED' }), 1);

    await setSetting('maxRewardedBookingsPerReferredUser', 5);
  });

  test('different referred users have independent limits', async () => {
    const { referrer: refA, referred: rahul } = await createReferralPair('Aaditya', 'Rahul');
    const { referrer: refB, referred: mohit } = await createReferralPair('Aaditya2', 'Mohit');
    assert.equal(String(refA._id) !== String(refB._id), true);

    // Rahul: 6 bookings → 5 rewarded (limit 5)
    for (let i = 0; i < 6; i++) {
      const b = await createBooking(rahul._id);
      await userReferralService.createBookingRewardEligibility(b._id);
    }

    // Mohit: 6 bookings → also 5 rewarded (independent count)
    for (let i = 0; i < 6; i++) {
      const b = await createBooking(mohit._id);
      await userReferralService.createBookingRewardEligibility(b._id);
    }

    const rahulCode = await UserReferralCode.findOne({ usedBy: rahul._id, status: 'USED' });
    const mohitCode = await UserReferralCode.findOne({ usedBy: mohit._id, status: 'USED' });
    assert.equal(rahulCode.rewardedBookingIds.length, 5);
    assert.equal(mohitCode.rewardedBookingIds.length, 5);

    const approvedForRahul = await UserReferralBookingReward.countDocuments({ referredUserId: rahul._id, status: 'APPROVED' });
    const approvedForMohit = await UserReferralBookingReward.countDocuments({ referredUserId: mohit._id, status: 'APPROVED' });
    assert.equal(approvedForRahul, 5);
    assert.equal(approvedForMohit, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. IDEMPOTENCY & CONCURRENCY
// ═══════════════════════════════════════════════════════════════════════════════
describe('Idempotency and concurrency protection', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('same booking completed twice (sequential) → one reward, one ledger entry', async () => {
    const { referrer, referred } = await createReferralPair('IdemRef', 'IdemUser');
    const booking = await createBooking(referred._id);

    const first = await userReferralService.createBookingRewardEligibility(booking._id);
    const second = await userReferralService.createBookingRewardEligibility(booking._id);

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(String(first.reward._id), String(second.reward._id));

    assert.equal(await UserReferralBookingReward.countDocuments({ bookingId: booking._id }), 1);
    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);
    const { total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 1);
  });

  test('same booking completed concurrently → only one reward credited', async () => {
    const { referrer, referred, code } = await createReferralPair('ConcRef', 'ConcUser');
    const booking = await createBooking(referred._id);

    const results = await Promise.all([
      userReferralService.createBookingRewardEligibility(booking._id),
      userReferralService.createBookingRewardEligibility(booking._id),
      userReferralService.createBookingRewardEligibility(booking._id),
    ]);

    // At most one APPROVED; no duplicates
    const approvedCount = await UserReferralBookingReward.countDocuments({ bookingId: booking._id, status: 'APPROVED' });
    assert.equal(approvedCount, 1);
    assert.equal(await UserReferralBookingReward.countDocuments({ bookingId: booking._id }), 1);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);
    const { total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 1);

    const codeDoc = await UserReferralCode.findById(code._id);
    assert.equal(codeDoc.rewardedBookingIds.filter((id) => String(id) === String(booking._id)).length, 1);
    assert.ok(results.some((r) => r.reward?.status === 'APPROVED'));
  });

  test('concurrent completions at the limit boundary cannot exceed the limit', async () => {
    const { referrer, referred, code } = await createReferralPair('RaceRef', 'RaceUser');

    // 6 different completed bookings complete at nearly the same time, limit = 5.
    const bookings = [];
    for (let i = 0; i < 6; i++) {
      bookings.push(await createBooking(referred._id));
    }

    const results = await Promise.all(
      bookings.map((b) => userReferralService.createBookingRewardEligibility(b._id))
    );

    const approved = await UserReferralBookingReward.countDocuments({ referredUserId: referred._id, status: 'APPROVED' });
    const denied = await UserReferralBookingReward.countDocuments({ referredUserId: referred._id, status: 'DENIED' });
    assert.equal(approved, 5, 'exactly 5 bookings may be rewarded');
    assert.equal(denied, 1, 'the 6th booking must be blocked');

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 5 * 50);

    const { total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 5);

    const codeDoc = await UserReferralCode.findById(code._id);
    assert.equal(codeDoc.rewardedBookingIds.length, 5);
    assert.ok(results.some((r) => r.limitReached === true));
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

  test('wallet balance always equals credits − debits; one ledger entry per reward', async () => {
    const { referrer, referred } = await createReferralPair('LedgerRef', 'LedgerUser');

    // 3 qualifying bookings rewarded
    for (let i = 0; i < 3; i++) {
      const b = await createBooking(referred._id);
      await userReferralService.createBookingRewardEligibility(b._id);
    }

    // One non-qualifying (paid) booking — no ledger impact
    const nonQual = await createBooking(referred._id, { status: 'paid' });
    await userReferralService.createBookingRewardEligibility(nonQual._id);

    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 150);

    const { transactions } = await walletService.getTransactions(referrer._id);
    const bookingRewards = transactions.filter((t) => t.type === 'REFERRAL_BOOKING_REWARD');
    assert.equal(bookingRewards.length, 3);
    assert.equal(bookingRewards.every((t) => t.direction === 'CREDIT' && t.status === 'COMPLETED'), true);

    // No duplicate idempotency keys
    const keys = transactions.map((t) => t.idempotencyKey).filter(Boolean);
    assert.equal(new Set(keys).size, keys.length);

    // Record ↔ ledger 1:1 — every APPROVED reward record has a matching ledger entry
    const approved = await UserReferralBookingReward.find({ referredUserId: referred._id, status: 'APPROVED' }).lean();
    assert.equal(approved.length, 3);
    for (const r of approved) {
      const match = await WalletTransaction.findOne({ idempotencyKey: `referral_booking_reward_${r._id}` });
      assert.ok(match, `ledger entry exists for reward ${r._id}`);
      assert.equal(match.amount, r.rewardAmount);
    }
  });
});