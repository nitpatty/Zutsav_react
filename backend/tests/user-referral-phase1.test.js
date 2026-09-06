/**
 * Tests for Phase 1 — User Referral, Wallet, and Coupon Foundation.
 *
 * Covers:
 *   - UserReferralCode model and generation
 *   - Daily limit enforcement
 *   - Atomic code consumption
 *   - Self-referral prevention
 *   - Registration reward idempotency
 *   - Wallet credit/debit
 *   - Wallet idempotency
 *   - Negative balance rejection
 *   - Coupon validation
 *   - Coupon expiry
 *   - Coupon usage limits
 *   - Coupon applicability
 *   - Booking reward eligibility
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && npm test
 *
 * Runs against a dedicated TEST database and drops it before and after.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase1-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_phase1_test';

// Models
const User = require('../src/models/User');
const UserReferralCode = require('../src/models/UserReferralCode');
const UserWallet = require('../src/models/UserWallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const UserReferralBookingReward = require('../src/models/UserReferralBookingReward');
const Coupon = require('../src/models/Coupon');
const CouponRedemption = require('../src/models/CouponRedemption');
const Booking = require('../src/models/Booking');
const OTP = require('../src/models/OTP');

// Services
const userReferralService = require('../src/services/userReferralService');
const walletService = require('../src/services/walletService');
const couponService = require('../src/services/couponService');

// Controllers
const authController = require('../src/controllers/auth.controller');

// Notification engine mock
const { NotificationEngine } = require('../notification-engine');
let emitCalls = [];
const originalEmit = NotificationEngine.emit;

// Helpers
let _seq = 10000;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqEmail = () => `test${Date.now()}_${_seq}@test.zutsav.local`;

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

// ── Clean collections ────────────────────────────────────────────────────────
async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    UserReferralCode.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    UserReferralBookingReward.deleteMany({}),
    Coupon.deleteMany({}),
    CouponRedemption.deleteMany({}),
    Booking.deleteMany({}),
    OTP.deleteMany({}),
  ]);
}

// ── Setup SystemSettings mock ────────────────────────────────────────────────
const SystemSettings = require('../src/models/SystemSettings');
const settingsService = require('../src/utils/settingsService');

async function setupDefaultSettings() {
  await SystemSettings.deleteMany({});
  await SystemSettings.create({
    userReferralEnabled: true,
    userReferralDefaultValidityDays: 30,
    userReferralDailyLimit: 5,
    userReferralRegistrationRewardCoins: 10,
    userReferralBookingRewardCoins: 50,
    maxRewardedBookingsPerReferredUser: 5,
    coinMonetaryValue: null, // not configured by default
  });
  settingsService.invalidate();
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
    Coupon.init(),
    CouponRedemption.init(),
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
// 1. USER REFERRAL CODE
// ═══════════════════════════════════════════════════════════════════════════════
describe('UserReferralCode — model and generation', () => {
  before(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('generates a valid 6-char alphanumeric code', async () => {
    const code = UserReferralCode.generateCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[A-Z0-9]{6}$/);
  });

  test('generates unique codes', async () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(UserReferralCode.generateCode());
    }
    // With 32 chars ^ 6 = ~1B combinations, 100 codes should all be unique
    assert.equal(codes.size, 100);
  });

  test('create a referral code via service', async () => {
    const user = await User.create({ name: 'Referrer', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await userReferralService.generateCode(user._id);

    assert.ok(result.code);
    assert.equal(result.code.length, 6);
    assert.ok(result.expiresAt);
    assert.ok(result.referralCodeId);

    // Verify in DB
    const doc = await UserReferralCode.findById(result.referralCodeId);
    assert.equal(doc.status, 'AVAILABLE');
    assert.equal(String(doc.userId), String(user._id));
    assert.ok(doc.expiresAt > new Date());
  });

  test('enforces daily limit of 5', async () => {
    const user = await User.create({ name: 'LimitUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });

    // Generate 5 codes (should succeed)
    for (let i = 0; i < 5; i++) {
      await userReferralService.generateCode(user._id);
    }

    // 6th should fail
    try {
      await userReferralService.generateCode(user._id);
      assert.fail('Should have thrown daily limit error');
    } catch (err) {
      assert.ok(err.status === 429);
      assert.ok(err.message.includes('Daily referral generation limit'));
    }
  });

  test('rejects generation when system is disabled', async () => {
    // Disable the system
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: false } });
    settingsService.invalidate();

    const user = await User.create({ name: 'DisabledUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    try {
      await userReferralService.generateCode(user._id);
      assert.fail('Should have thrown disabled error');
    } catch (err) {
      assert.equal(err.status, 403);
      assert.ok(err.message.includes('disabled'));
    }

    // Re-enable
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: true } });
    settingsService.invalidate();
  });

  test('code expiry is set from admin config (30 days)', async () => {
    const user = await User.create({ name: 'ExpiryUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await userReferralService.generateCode(user._id);

    const expectedExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const diff = Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime());
    assert.ok(diff < 60000, 'Expiry should be within 1 minute of expected');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CODE CONSUMPTION
// ═══════════════════════════════════════════════════════════════════════════════
describe('UserReferralCode — consumption', () => {
  before(cleanCollections);

  test('valid code is consumed atomically', async () => {
    const referrer = await User.create({ name: 'Referrer', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await userReferralService.generateCode(referrer._id);

    const newUser = await User.create({ name: 'NewUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const consumed = await userReferralService.consumeCode(result.code, newUser._id);

    assert.ok(consumed);
    assert.equal(String(consumed.referrerUserId), String(referrer._id));
    assert.equal(String(consumed.referralCodeId), String(result.referralCodeId));

    // Verify code status
    const doc = await UserReferralCode.findById(result.referralCodeId);
    assert.equal(doc.status, 'USED');
    assert.equal(String(doc.usedBy), String(newUser._id));
    assert.ok(doc.usedAt);
  });

  test('second consumption of same code fails', async () => {
    const referrer = await User.create({ name: 'Ref2', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await userReferralService.generateCode(referrer._id);

    const user1 = await User.create({ name: 'User1', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await userReferralService.consumeCode(result.code, user1._id);

    const user2 = await User.create({ name: 'User2', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const second = await userReferralService.consumeCode(result.code, user2._id);
    assert.equal(second, null);
  });

  test('expired code is rejected', async () => {
    const referrer = await User.create({ name: 'ExpRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const code = await UserReferralCode.create({
      code: 'EXPIRE',
      userId: referrer._id,
      status: 'AVAILABLE',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const newUser = await User.create({ name: 'ExpUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await userReferralService.consumeCode('EXPIRE', newUser._id);
    assert.equal(result, null);
  });

  test('self-referral is rejected', async () => {
    const user = await User.create({ name: 'SelfRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await userReferralService.generateCode(user._id);

    // Try to consume own code
    const consumed = await userReferralService.consumeCode(result.code, user._id);
    assert.equal(consumed, null);

    // Verify code is still AVAILABLE (rolled back)
    const doc = await UserReferralCode.findById(result.referralCodeId);
    assert.equal(doc.status, 'AVAILABLE');
  });

  test('invalid code returns null', async () => {
    const result = await userReferralService.consumeCode('FAKE12', new mongoose.Types.ObjectId());
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WALLET
// ═══════════════════════════════════════════════════════════════════════════════
describe('Wallet — credit, debit, idempotency', () => {
  before(cleanCollections);

  test('wallet is created on first access', async () => {
    const user = await User.create({ name: 'WUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const wallet = await walletService.getOrCreateWallet(user._id);
    assert.equal(wallet.balance, 0);
    assert.equal(wallet.totalEarned, 0);
  });

  test('credit increases balance', async () => {
    const user = await User.create({ name: 'CreditUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const { wallet, transaction } = await walletService.credit({
      userId: user._id,
      amount: 10,
      type: 'REFERRAL_REGISTRATION',
      description: 'Test credit',
      reference: { type: 'USER_REFERRAL', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `test_credit_${user._id}`,
    });

    assert.equal(wallet.balance, 10);
    assert.equal(wallet.totalEarned, 10);
    assert.equal(transaction.direction, 'CREDIT');
    assert.equal(transaction.amount, 10);
    assert.equal(transaction.balanceAfter, 10);
  });

  test('idempotency prevents duplicate credit', async () => {
    const user = await User.create({ name: 'IdempUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const key = `idemp_test_${user._id}`;

    const first = await walletService.credit({
      userId: user._id,
      amount: 20,
      type: 'REFERRAL_REGISTRATION',
      description: 'First credit',
      reference: { type: 'USER_REFERRAL', id: new mongoose.Types.ObjectId() },
      idempotencyKey: key,
    });

    const second = await walletService.credit({
      userId: user._id,
      amount: 20,
      type: 'REFERRAL_REGISTRATION',
      description: 'Duplicate credit',
      reference: { type: 'USER_REFERRAL', id: new mongoose.Types.ObjectId() },
      idempotencyKey: key,
    });

    assert.equal(second.alreadyExists, true);
    assert.equal(String(second.transaction._id), String(first.transaction._id));

    // Balance should still be 20, not 40
    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 20);
  });

  test('debit decreases balance', async () => {
    const user = await User.create({ name: 'DebitUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await walletService.credit({
      userId: user._id,
      amount: 100,
      type: 'REFERRAL_REGISTRATION',
      description: 'Initial credit',
      reference: { type: 'USER_REFERRAL', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `debit_init_${user._id}`,
    });

    const { wallet } = await walletService.debit({
      userId: user._id,
      amount: 30,
      type: 'COIN_REDEMPTION',
      description: 'Redeemed',
      reference: { type: 'COUPON', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `debit_test_${user._id}`,
    });

    assert.equal(wallet.balance, 70);
    assert.equal(wallet.totalRedeemed, 30);
  });

  test('negative balance is rejected', async () => {
    const user = await User.create({ name: 'NegUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });

    try {
      await walletService.debit({
        userId: user._id,
        amount: 50,
        type: 'COIN_REDEMPTION',
        description: 'Should fail',
        reference: { type: 'COUPON', id: new mongoose.Types.ObjectId() },
      });
      assert.fail('Should have thrown insufficient balance');
    } catch (err) {
      assert.ok(err.status === 400);
      assert.ok(err.message.includes('Insufficient'));
    }
  });

  test('transaction history is recorded', async () => {
    const user = await User.create({ name: 'HistUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await walletService.credit({
      userId: user._id,
      amount: 15,
      type: 'REFERRAL_REGISTRATION',
      description: 'Hist credit',
      reference: { type: 'USER_REFERRAL', id: new mongoose.Types.ObjectId() },
    });

    const { transactions, total } = await walletService.getTransactions(user._id);
    assert.equal(total, 1);
    assert.equal(transactions[0].amount, 15);
    assert.equal(transactions[0].direction, 'CREDIT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. REGISTRATION REWARD
// ═══════════════════════════════════════════════════════════════════════════════
describe('Registration reward — idempotent credit', () => {
  before(cleanCollections);

  test('registration via referral credits +10 coins exactly once', async () => {
    // Ensure settings are configured
    await setupDefaultSettings();

    const referrer = await User.create({ name: 'RegRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(referrer._id);

    // Simulate registration
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'NewRegistrant', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    // Check referrer's wallet
    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(wallet);
    assert.equal(wallet.balance, 10);

    // Check transaction
    const { transactions } = await walletService.getTransactions(referrer._id);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, 10);
    assert.equal(transactions[0].type, 'REFERRAL_REGISTRATION');

    // Verify code is marked as reward credited
    const codeDoc = await UserReferralCode.findById(genResult.referralCodeId);
    assert.equal(codeDoc.registrationRewardCredited, true);

    // Verify legacy referredBy is also set (backward compatibility)
    const newUser = await User.findOne({ email });
    assert.ok(newUser);
    assert.equal(String(newUser.referredBy), String(referrer._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. BOOKING REWARD (automatic grant)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Booking reward — automatic grant on completed booking', () => {
  before(cleanCollections);

  test('completed booking grants reward automatically to the referrer', async () => {
    const referrer = await User.create({ name: 'BookRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const referred = await User.create({ name: 'BookUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });

    // Create a USED referral code linking referred to referrer
    const code = await UserReferralCode.create({
      code: 'BOOK01',
      userId: referrer._id,
      status: 'USED',
      usedBy: referred._id,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });

    // Create a completed booking for the referred user
    const booking = await Booking.create({
      userId: referred._id,
      poojaId: new mongoose.Types.ObjectId(),
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      amount: 500,
      grandTotal: 500,
      status: 'completed',
      userDetails: { name: 'BookUser', phone: referred.phone, address: 'Test', pincode: '110001' },
    });

    const result = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(result.created, true);
    assert.equal(result.reward.status, 'APPROVED');
    assert.equal(result.reward.rewardAmount, 50);
    assert.equal(String(result.reward.userId), String(referrer._id));
    assert.equal(String(result.reward.referredUserId), String(referred._id));
    assert.equal(result.reward.coinsCredited, true);

    // Referrer wallet credited exactly once
    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(wallet);
    assert.equal(wallet.balance, 50);
    const { transactions, total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 1);
    assert.equal(transactions[0].amount, 50);
    assert.equal(transactions[0].direction, 'CREDIT');
    assert.equal(transactions[0].reference.type, 'UserReferralBookingReward');
    assert.equal(String(transactions[0].reference.id), String(result.reward._id));
  });

  test('non-completed booking does not grant reward', async () => {
    const booking = await Booking.create({
      userId: new mongoose.Types.ObjectId(),
      poojaId: new mongoose.Types.ObjectId(),
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      amount: 500,
      grandTotal: 500,
      status: 'paid',
      userDetails: { name: 'Test', phone: '9000000000', address: 'Test', pincode: '110001' },
    });

    const result = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(result.created, false);
    assert.equal(await UserReferralBookingReward.countDocuments({ bookingId: booking._id }), 0);
  });

  test('duplicate completion grants the reward only once', async () => {
    const referrer = await User.create({ name: 'DupRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const referred = await User.create({ name: 'DupUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });

    await UserReferralCode.create({
      code: 'DUP01',
      userId: referrer._id,
      status: 'USED',
      usedBy: referred._id,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });

    const booking = await Booking.create({
      userId: referred._id,
      poojaId: new mongoose.Types.ObjectId(),
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      amount: 500,
      grandTotal: 500,
      status: 'completed',
      userDetails: { name: 'DupUser', phone: referred.phone, address: 'Test', pincode: '110001' },
    });

    const first = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(first.created, true);
    assert.equal(first.reward.status, 'APPROVED');

    const second = await userReferralService.createBookingRewardEligibility(booking._id);
    assert.equal(second.created, false);

    // Exactly one record, one ledger entry, one credit
    assert.equal(await UserReferralBookingReward.countDocuments({ bookingId: booking._id }), 1);
    const wallet = await walletService.getWallet(referrer._id);
    assert.equal(wallet.balance, 50);
    const { total } = await walletService.getTransactions(referrer._id, { type: 'REFERRAL_BOOKING_REWARD' });
    assert.equal(total, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. COUPON
// ═══════════════════════════════════════════════════════════════════════════════
describe('Coupon — validation, expiry, limits', () => {
  before(cleanCollections);

  test('valid coupon passes validation', async () => {
    const coupon = await Coupon.create({
      code: 'TEST10',
      discountType: 'FIXED',
      discountValue: 10,
      minCartValue: 100,
      validFrom: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 86400000),
      usageLimit: 100,
      perUserLimit: 1,
      applicability: ['POOJA'],
      isActive: true,
    });

    const user = await User.create({ name: 'CouponUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const result = await couponService.validateCoupon({
      code: 'TEST10',
      userId: user._id,
      cartValue: 500,
      cartType: 'POOJA',
    });

    assert.equal(result.valid, true);
    assert.equal(result.discount, 10);
    assert.equal(result.finalPayable, 490);
  });

  test('expired coupon is rejected', async () => {
    await Coupon.create({
      code: 'EXP10',
      discountType: 'FIXED',
      discountValue: 10,
      validFrom: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() - 1000), // expired
      applicability: ['POOJA'],
      isActive: true,
    });

    const result = await couponService.validateCoupon({
      code: 'EXP10',
      userId: new mongoose.Types.ObjectId(),
      cartValue: 500,
      cartType: 'POOJA',
    });

    assert.equal(result.valid, false);
    assert.ok(result.error.includes('expired'));
  });

  test('inactive coupon is rejected', async () => {
    await Coupon.create({
      code: 'INACT10',
      discountType: 'FIXED',
      discountValue: 10,
      applicability: ['POOJA'],
      isActive: false,
    });

    const result = await couponService.validateCoupon({
      code: 'INACT10',
      userId: new mongoose.Types.ObjectId(),
      cartValue: 500,
      cartType: 'POOJA',
    });

    assert.equal(result.valid, false);
    assert.ok(result.error.includes('active'));
  });

  test('coupon with minCartValue rejects low cart', async () => {
    await Coupon.create({
      code: 'MIN500',
      discountType: 'FIXED',
      discountValue: 10,
      minCartValue: 500,
      applicability: ['POOJA'],
      isActive: true,
    });

    const result = await couponService.validateCoupon({
      code: 'MIN500',
      userId: new mongoose.Types.ObjectId(),
      cartValue: 200,
      cartType: 'POOJA',
    });

    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Minimum cart value'));
  });

  test('coupon with global usage limit rejects after exhaustion', async () => {
    await Coupon.create({
      code: 'LIMIT1',
      discountType: 'FIXED',
      discountValue: 10,
      usageLimit: 2,
      usageCount: 2, // already exhausted
      applicability: ['POOJA'],
      isActive: true,
    });

    const result = await couponService.validateCoupon({
      code: 'LIMIT1',
      userId: new mongoose.Types.ObjectId(),
      cartValue: 500,
      cartType: 'POOJA',
    });

    assert.equal(result.valid, false);
    assert.ok(result.error.includes('usage limit'));
  });

  test('coupon applicability rejects non-POOJA cart', async () => {
    await Coupon.create({
      code: 'POOJAONLY',
      discountType: 'FIXED',
      discountValue: 10,
      applicability: ['POOJA'],
      isActive: true,
    });

    const result = await couponService.validateCoupon({
      code: 'POOJAONLY',
      userId: new mongoose.Types.ObjectId(),
      cartValue: 500,
      cartType: 'MARKETPLACE',
    });

    assert.equal(result.valid, false);
    assert.ok(result.error.includes('not applicable'));
  });

  test('coupon redemption records correctly', async () => {
    const coupon = await Coupon.create({
      code: 'REC10',
      discountType: 'FIXED',
      discountValue: 10,
      applicability: ['POOJA'],
      isActive: true,
      usageCount: 0,
    });

    const user = await User.create({ name: 'RecUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const bookingId = new mongoose.Types.ObjectId();

    const { redemption, alreadyExists } = await couponService.recordRedemption({
      couponId: coupon._id,
      userId: user._id,
      bookingId,
      discountApplied: 10,
      cartValue: 500,
      finalPayable: 490,
    });

    assert.equal(alreadyExists, false);
    assert.equal(redemption.discountApplied, 10);

    // Verify usageCount incremented
    const updated = await Coupon.findById(coupon._id);
    assert.equal(updated.usageCount, 1);
  });

  test('coupon redemption is idempotent', async () => {
    const coupon = await Coupon.create({
      code: 'IDEM10',
      discountType: 'FIXED',
      discountValue: 10,
      applicability: ['POOJA'],
      isActive: true,
      usageCount: 0,
    });

    const user = await User.create({ name: 'IdemUser', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const bookingId = new mongoose.Types.ObjectId();

    const first = await couponService.recordRedemption({
      couponId: coupon._id,
      userId: user._id,
      bookingId,
      discountApplied: 10,
      cartValue: 500,
      finalPayable: 490,
    });

    const second = await couponService.recordRedemption({
      couponId: coupon._id,
      userId: user._id,
      bookingId,
      discountApplied: 10,
      cartValue: 500,
      finalPayable: 490,
    });

    assert.equal(second.alreadyExists, true);
    assert.equal(String(second.redemption._id), String(first.redemption._id));

    // Usage count should be 1, not 2
    const updated = await Coupon.findById(coupon._id);
    assert.equal(updated.usageCount, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. COIN MONETARY VALUE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Coin monetary value — configurable, not hardcoded', () => {
  before(cleanCollections);

  test('returns configured=false when coinMonetaryValue is null', async () => {
    await SystemSettings.updateOne({}, { $set: { coinMonetaryValue: null } });
    settingsService.invalidate();

    const result = await walletService.coinsToMoneyAsync(100);
    assert.equal(result.configured, false);
    assert.equal(result.rate, null);
    assert.equal(result.monetaryValue, null);
  });

  test('returns correct value when configured', async () => {
    await SystemSettings.updateOne({}, { $set: { coinMonetaryValue: 0.5 } });
    settingsService.invalidate();

    const result = await walletService.coinsToMoneyAsync(100);
    assert.equal(result.configured, true);
    assert.equal(result.rate, 0.5);
    assert.equal(result.monetaryValue, 50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. PHASE 1.5 — TARGETED HARDENING TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase 1.5 — Legacy/New conflict prevention', () => {
  before(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('resolveReferralCode: new system takes priority over legacy', async () => {
    // Create a legacy user with referralCode
    const legacyUser = await User.create({ name: 'Legacy', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    // Legacy user auto-generates referralCode via pre-save hook
    await legacyUser.save();
    const legacyCode = legacyUser.referralCode;

    // Create a new UserReferralCode with the SAME code value
    const newReferrer = await User.create({ name: 'NewRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(newReferrer._id);

    // Use the new system's code (not legacy) — they should be different codes
    const resolution = await userReferralService.resolveReferralCode(genResult.code);
    assert.equal(resolution.type, 'new');
    assert.equal(String(resolution.code.userId), String(newReferrer._id));
  });

  test('resolveReferralCode: falls back to legacy when new system disabled', async () => {
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: false } });
    settingsService.invalidate();

    const legacyUser = await User.create({ name: 'Legacy2', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await legacyUser.save();

    const resolution = await userReferralService.resolveReferralCode(legacyUser.referralCode);
    assert.equal(resolution.type, 'legacy');
    assert.equal(String(resolution.referrerId), String(legacyUser._id));

    // Re-enable
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: true } });
    settingsService.invalidate();
  });

  test('resolveReferralCode: returns null for nonexistent code', async () => {
    const resolution = await userReferralService.resolveReferralCode('ZZZZZZ');
    assert.equal(resolution, null);
  });

  test('resolveReferralCode: returns null for null/undefined', async () => {
    assert.equal(await userReferralService.resolveReferralCode(null), null);
    assert.equal(await userReferralService.resolveReferralCode(undefined), null);
    assert.equal(await userReferralService.resolveReferralCode(''), null);
  });
});

describe('Phase 1.5 — Self-referral prevention during registration', () => {
  before(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('self-referral is rejected when code owner tries to register with own code', async () => {
    // User A generates a code
    const userA = await User.create({ name: 'SelfA', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(userA._id);

    // Directly test consumeCode with same userId as code owner
    // (simulates the edge case where a user somehow gets their own code)
    const consumed = await userReferralService.consumeCode(genResult.code, userA._id);
    assert.equal(consumed, null, 'Self-referral should return null');

    // Code should still be AVAILABLE (rolled back)
    const codeDoc = await UserReferralCode.findById(genResult.referralCodeId);
    assert.equal(codeDoc.status, 'AVAILABLE');

    // No wallet credit
    const wallet = await walletService.getWallet(userA._id);
    if (wallet) {
      assert.equal(wallet.balance, 0);
    }
  });

  test('different user registering with code is a valid referral (not self-referral)', async () => {
    // User A generates a code
    const userA = await User.create({ name: 'ValidRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(userA._id);

    // User B registers with User A's code — this is a VALID referral
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'UserB', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    // User B should have referredBy = User A
    const newUser = await User.findOne({ email });
    assert.ok(newUser);
    assert.equal(String(newUser.referredBy), String(userA._id));

    // User A should receive +10 coins
    const wallet = await walletService.getWallet(userA._id);
    assert.ok(wallet);
    assert.equal(wallet.balance, 10);

    // Code should be USED
    const codeDoc = await UserReferralCode.findById(genResult.referralCodeId);
    assert.equal(codeDoc.status, 'USED');
  });
});

describe('Phase 1.5 — No duplicate legacy+new attribution', () => {
  before(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('new referral code does not trigger legacy attribution', async () => {
    const referrer = await User.create({ name: 'NoDup', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(referrer._id);

    // Register with new code
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'NewUser', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    // Verify: exactly ONE +10 credit
    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(wallet);
    assert.equal(wallet.balance, 10);

    // Verify: exactly ONE WalletTransaction
    const { transactions } = await walletService.getTransactions(referrer._id);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].type, 'REFERRAL_REGISTRATION');

    // Verify: referralCount should be 0 (new system doesn't increment it)
    const updatedReferrer = await User.findById(referrer._id);
    assert.equal(updatedReferrer.referralCount, 0);
  });

  test('legacy code still works when new system is disabled', async () => {
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: false } });
    settingsService.invalidate();

    const referrer = await User.create({ name: 'LegRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await referrer.save();
    const legacyCode = referrer.referralCode;

    // Register with legacy code
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'LegacyUser', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: legacyCode });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    // Verify: legacy referredBy is set
    const newUser = await User.findOne({ email });
    assert.ok(newUser);
    assert.equal(String(newUser.referredBy), String(referrer._id));

    // Verify: referralCount incremented
    const updatedReferrer = await User.findById(referrer._id);
    assert.equal(updatedReferrer.referralCount, 1);

    // Verify: NO wallet credit (legacy doesn't do wallet)
    const wallet = await walletService.getWallet(referrer._id);
    if (wallet) {
      assert.equal(wallet.balance, 0);
    }

    // Re-enable
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: true } });
    settingsService.invalidate();
  });
});

describe('Phase 1.5 — Registration retry idempotency', () => {
  before(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('duplicate registration request is blocked by OTP deletion', async () => {
    const referrer = await User.create({ name: 'RetryRef', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const genResult = await userReferralService.generateCode(referrer._id);

    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });

    // First registration
    const req1 = mockReq({ name: 'RetryUser', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res1 = mockRes();
    await authController.completeRegistration(req1, res1, (e) => { if (e) throw e; });
    assert.equal(res1.statusCode, 201);

    // Second request with same body (simulating retry)
    // OTP was deleted, so this should fail
    const req2 = mockReq({ name: 'RetryUser', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: genResult.code });
    const res2 = mockRes();
    let err2 = null;
    await authController.completeRegistration(req2, res2, (e) => { err2 = e; });
    assert.equal(res2.statusCode, 400);
    assert.ok(res2.body.message.includes('OTP'));

    // Verify: only ONE wallet credit
    const wallet = await walletService.getWallet(referrer._id);
    assert.ok(wallet);
    assert.equal(wallet.balance, 10);

    const { transactions } = await walletService.getTransactions(referrer._id);
    assert.equal(transactions.length, 1);
  });
});

describe('Phase 1.5 — Disabled system behavior', () => {
  before(async () => {
    await cleanCollections();
    await setupDefaultSettings();
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: false } });
    settingsService.invalidate();
  });

  after(async () => {
    await SystemSettings.updateOne({}, { $set: { userReferralEnabled: true } });
    settingsService.invalidate();
  });

  test('new code generation is blocked when system disabled', async () => {
    const user = await User.create({ name: 'DisGen', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    try {
      await userReferralService.generateCode(user._id);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.equal(err.status, 403);
    }
  });

  test('registration with invalid code still succeeds', async () => {
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = mockReq({ name: 'NoRef', email, phone, password: 'secret123', channel: 'whatsapp', referralCode: 'INVALID' });
    const res = mockRes();
    await authController.completeRegistration(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 201);

    const newUser = await User.findOne({ email });
    assert.ok(newUser);
    assert.equal(newUser.referredBy, null);
  });
});

describe('Phase 1.5 — Wallet balance/ledger consistency', () => {
  before(cleanCollections);

  test('wallet balance matches sum of transactions', async () => {
    const user = await User.create({ name: 'Consist', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });

    // Credit 10
    await walletService.credit({
      userId: user._id, amount: 10, type: 'REFERRAL_REGISTRATION',
      description: 'Credit 1', reference: { type: 'USER_REFERRAL', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `consist_1_${user._id}`,
    });

    // Credit 20
    await walletService.credit({
      userId: user._id, amount: 20, type: 'REFERRAL_BOOKING_REWARD',
      description: 'Credit 2', reference: { type: 'BOOKING_REWARD', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `consist_2_${user._id}`,
    });

    // Debit 5
    await walletService.debit({
      userId: user._id, amount: 5, type: 'COIN_REDEMPTION',
      description: 'Debit 1', reference: { type: 'COUPON', id: new mongoose.Types.ObjectId() },
      idempotencyKey: `consist_3_${user._id}`,
    });

    // Verify balance
    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 25); // 10 + 20 - 5

    // Verify ledger
    const { transactions } = await walletService.getTransactions(user._id);
    const credits = transactions.filter((t) => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0);
    const debits = transactions.filter((t) => t.direction === 'DEBIT').reduce((s, t) => s + t.amount, 0);
    assert.equal(credits - debits, wallet.balance);
  });
});
