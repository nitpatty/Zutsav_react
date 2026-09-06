/**
 * Phase 3 — Admin Service Tests
 *
 * Tests admin service logic for:
 *   - Referral settings CRUD
 *   - Wallet manual adjustments (credit/debit)
 *   - Booking reward approval/denial
 *   - Coupon CRUD and toggle
 *
 * Uses Node's built-in test runner (node:test).
 * Runs against a dedicated TEST database.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase3-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_phase3_test';

// Models
const User = require('../src/models/User');
const UserReferralCode = require('../src/models/UserReferralCode');
const UserReferralBookingReward = require('../src/models/UserReferralBookingReward');
const UserWallet = require('../src/models/UserWallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const Coupon = require('../src/models/Coupon');
const CouponRedemption = require('../src/models/CouponRedemption');
const SystemSettings = require('../src/models/SystemSettings');

// Services
const walletService = require('../src/services/walletService');
const settingsService = require('../src/utils/settingsService');

// ── Test data ───────────────────────────────────────────────────────────────
let adminUser, referrerUser, referredUser;

// ── Setup / Teardown ────────────────────────────────────────────────────────
before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  // Drop test collections
  await Promise.all([
    User.deleteMany({}),
    UserReferralCode.deleteMany({}),
    UserReferralBookingReward.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    Coupon.deleteMany({}),
    CouponRedemption.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);

  adminUser = await User.create({
    name: 'Admin Test',
    email: 'admin-phase3@test.com',
    phone: '9000000001',
    password: 'hashedpassword',
    role: 'admin',
  });
  referrerUser = await User.create({
    name: 'Referrer Test',
    email: 'referrer-phase3@test.com',
    phone: '9000000002',
    password: 'hashedpassword',
    role: 'user',
  });
  referredUser = await User.create({
    name: 'Referred Test',
    email: 'referred-phase3@test.com',
    phone: '9000000003',
    password: 'hashedpassword',
    role: 'user',
  });
});

after(async () => {
  await Promise.all([
    User.deleteMany({}),
    UserReferralCode.deleteMany({}),
    UserReferralBookingReward.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    Coupon.deleteMany({}),
    CouponRedemption.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

// ── Tests ───────────────────────────────────────────────────────────────────
describe('Phase 3 — Admin Services', () => {

  // ── Referral Settings ───────────────────────────────────────────────────
  describe('Referral Settings', () => {
    test('should have correct defaults', async () => {
      const enabled = await settingsService.get('userReferralEnabled', false);
      const dailyLimit = await settingsService.get('userReferralDailyLimit', 5);
      const regReward = await settingsService.get('userReferralRegistrationRewardCoins', 10);
      const bookReward = await settingsService.get('userReferralBookingRewardCoins', 50);

      assert.equal(enabled, false);
      assert.equal(dailyLimit, 5);
      assert.equal(regReward, 10);
      assert.equal(bookReward, 50);
    });

    test('should update settings via SystemSettings', async () => {
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { userReferralDailyLimit: 8, userReferralEnabled: true } },
        { upsert: true },
      );
      settingsService.invalidate();

      const limit = await settingsService.get('userReferralDailyLimit', 5);
      const enabled = await settingsService.get('userReferralEnabled', false);
      assert.equal(limit, 8);
      assert.equal(enabled, true);

      // Reset
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { userReferralDailyLimit: 5, userReferralEnabled: false } },
        { upsert: true },
      );
      settingsService.invalidate();
    });

    test('should store coin monetary value as null when not configured', async () => {
      const coinValue = await settingsService.get('coinMonetaryValue', null);
      assert.equal(coinValue, null);
    });

    test('should store coin monetary value when configured', async () => {
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { coinMonetaryValue: 0.5 } },
        { upsert: true },
      );
      settingsService.invalidate();

      const coinValue = await settingsService.get('coinMonetaryValue', null);
      assert.equal(coinValue, 0.5);

      // Reset
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { coinMonetaryValue: null } },
        { upsert: true },
      );
      settingsService.invalidate();
    });
  });

  // ── Wallet Manual Adjustment ────────────────────────────────────────────
  describe('Wallet Manual Adjustment', () => {
    test('should credit coins via WalletService', async () => {
      const result = await walletService.credit({
        userId: referrerUser._id,
        amount: 100,
        type: 'ADMIN_ADJUSTMENT',
        description: 'Admin test credit',
        idempotencyKey: `admin_credit_test_${Date.now()}`,
        reference: { type: 'AdminAdjustment', id: adminUser._id },
        createdBy: adminUser._id,
      });

      assert.ok(result);
      assert.ok(result.wallet);
      assert.ok(result.wallet.balance >= 100);
    });

    test('should create a wallet transaction record', async () => {
      const tx = await WalletTransaction.findOne({
        userId: referrerUser._id,
        type: 'ADMIN_ADJUSTMENT',
        direction: 'CREDIT',
      }).sort({ createdAt: -1 });

      assert.ok(tx);
      assert.equal(tx.amount, 100);
      assert.equal(tx.direction, 'CREDIT');
      assert.equal(tx.status, 'COMPLETED');
    });

    test('should debit coins via WalletService', async () => {
      const walletBefore = await UserWallet.findOne({ userId: referrerUser._id });
      const balanceBefore = walletBefore.balance;

      await walletService.debit({
        userId: referrerUser._id,
        amount: 30,
        type: 'ADMIN_ADJUSTMENT',
        description: 'Admin test debit',
        idempotencyKey: `admin_debit_test_${Date.now()}`,
        reference: { type: 'AdminAdjustment', id: adminUser._id },
        createdBy: adminUser._id,
      });

      const walletAfter = await UserWallet.findOne({ userId: referrerUser._id });
      assert.equal(walletAfter.balance, balanceBefore - 30);
    });

    test('should reject debit exceeding balance', async () => {
      try {
        await walletService.debit({
          userId: referrerUser._id,
          amount: 999999,
          type: 'ADMIN_ADJUSTMENT',
          description: 'Exceeding balance test',
          idempotencyKey: `admin_debit_exceed_${Date.now()}`,
          reference: { type: 'AdminAdjustment', id: adminUser._id },
        });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.status === 400 || err.message.includes('insufficient'));
      }
    });

    test('should not create duplicate credit with same idempotency key', async () => {
      const key = `idempotent_credit_test_${Date.now()}`;

      await walletService.credit({
        userId: referrerUser._id,
        amount: 50,
        type: 'ADMIN_ADJUSTMENT',
        description: 'First credit',
        idempotencyKey: key,
        reference: { type: 'AdminAdjustment', id: adminUser._id },
      });

      // Try again with same key
      await walletService.credit({
        userId: referrerUser._id,
        amount: 50,
        type: 'ADMIN_ADJUSTMENT',
        description: 'Duplicate credit',
        idempotencyKey: key,
        reference: { type: 'AdminAdjustment', id: adminUser._id },
      });

      // Should only have one transaction with this key
      const txs = await WalletTransaction.find({ idempotencyKey: key });
      assert.equal(txs.length, 1);
    });

    test('should maintain balance/ledger consistency', async () => {
      const wallet = await UserWallet.findOne({ userId: referrerUser._id });
      const txAgg = await WalletTransaction.aggregate([
        { $match: { userId: referrerUser._id, status: 'COMPLETED' } },
        {
          $group: {
            _id: '$direction',
            total: { $sum: '$amount' },
          },
        },
      ]);

      const credits = txAgg.find(g => g._id === 'CREDIT')?.total || 0;
      const debits = txAgg.find(g => g._id === 'DEBIT')?.total || 0;
      const expectedBalance = credits - debits;

      assert.equal(wallet.balance, expectedBalance);
    });
  });

  // ── Booking Reward Approval ─────────────────────────────────────────────
  describe('Booking Reward Approval', () => {
    let pendingReward;

    before(async () => {
      pendingReward = await UserReferralBookingReward.create({
        userId: referrerUser._id,
        referredUserId: referredUser._id,
        referralCodeId: new mongoose.Types.ObjectId(),
        bookingId: new mongoose.Types.ObjectId(),
        status: 'PENDING',
        rewardAmount: 50,
      });
    });

    test('should approve a pending reward', async () => {
      const balanceBefore = await UserWallet.findOne({ userId: referrerUser._id });

      // Simulate approval: update status + credit wallet
      const rewardAmount = await settingsService.get('userReferralBookingRewardCoins', 50);
      const idempotencyKey = `referral_booking_reward_${pendingReward._id}`;

      await walletService.credit({
        userId: referrerUser._id,
        amount: rewardAmount,
        type: 'REFERRAL_BOOKING_REWARD',
        description: 'Booking reward for completed pooja',
        idempotencyKey,
        reference: { type: 'UserReferralBookingReward', id: pendingReward._id },
        createdBy: adminUser._id,
      });

      pendingReward.status = 'APPROVED';
      pendingReward.rewardAmount = rewardAmount;
      pendingReward.adminDecisionBy = adminUser._id;
      pendingReward.adminDecisionAt = new Date();
      pendingReward.coinsCredited = true;
      pendingReward.coinsCreditedAt = new Date();
      await pendingReward.save();

      const reward = await UserReferralBookingReward.findById(pendingReward._id);
      assert.equal(reward.status, 'APPROVED');
      assert.equal(reward.coinsCredited, true);

      const balanceAfter = await UserWallet.findOne({ userId: referrerUser._id });
      assert.equal(balanceAfter.balance, balanceBefore.balance + rewardAmount);
    });

    test('should not double-credit on repeated approval', async () => {
      const balanceBefore = await UserWallet.findOne({ userId: referrerUser._id });
      const txCountBefore = await WalletTransaction.countDocuments({
        userId: referrerUser._id,
        type: 'REFERRAL_BOOKING_REWARD',
      });

      // Try to credit again with same idempotency key
      const idempotencyKey = `referral_booking_reward_${pendingReward._id}`;
      await walletService.credit({
        userId: referrerUser._id,
        amount: 50,
        type: 'REFERRAL_BOOKING_REWARD',
        description: 'Duplicate attempt',
        idempotencyKey,
        reference: { type: 'UserReferralBookingReward', id: pendingReward._id },
      });

      const balanceAfter = await UserWallet.findOne({ userId: referrerUser._id });
      const txCountAfter = await WalletTransaction.countDocuments({
        userId: referrerUser._id,
        type: 'REFERRAL_BOOKING_REWARD',
      });

      assert.equal(balanceAfter.balance, balanceBefore.balance);
      assert.equal(txCountAfter, txCountBefore);
    });

    test('should deny a pending reward without crediting', async () => {
      const reward2 = await UserReferralBookingReward.create({
        userId: referrerUser._id,
        referredUserId: referredUser._id,
        referralCodeId: new mongoose.Types.ObjectId(),
        bookingId: new mongoose.Types.ObjectId(),
        status: 'PENDING',
        rewardAmount: 50,
      });

      reward2.status = 'DENIED';
      reward2.adminDecisionBy = adminUser._id;
      reward2.adminDecisionAt = new Date();
      await reward2.save();

      const reward = await UserReferralBookingReward.findById(reward2._id);
      assert.equal(reward.status, 'DENIED');
    });
  });

  // ── Coupon Management ───────────────────────────────────────────────────
  describe('Coupon Management', () => {
    test('should create a coupon', async () => {
      const coupon = await Coupon.create({
        code: 'TESTPHASE3',
        discountType: 'FIXED',
        discountValue: 10,
        minCartValue: 1000,
        applicability: ['POOJA'],
        isActive: true,
        usageCount: 0,
        createdBy: adminUser._id,
      });

      assert.ok(coupon);
      assert.equal(coupon.code, 'TESTPHASE3');
      assert.equal(coupon.discountValue, 10);
      assert.equal(coupon.isActive, true);
    });

    test('should normalize coupon code to uppercase', async () => {
      const coupon = await Coupon.create({
        code: 'lowercase',
        discountType: 'FIXED',
        discountValue: 5,
        applicability: ['POOJA'],
        isActive: true,
        usageCount: 0,
        createdBy: adminUser._id,
      });

      assert.equal(coupon.code, 'LOWERCASE');
    });

    test('should reject duplicate coupon code', async () => {
      try {
        await Coupon.create({
          code: 'TESTPHASE3',
          discountType: 'FIXED',
          discountValue: 20,
          applicability: ['POOJA'],
          isActive: true,
          usageCount: 0,
          createdBy: adminUser._id,
        });
        assert.fail('Should have thrown duplicate key error');
      } catch (err) {
        assert.ok(err.code === 11000);
      }
    });

    test('should toggle coupon active status', async () => {
      const coupon = await Coupon.findOne({ code: 'TESTPHASE3' });
      coupon.isActive = false;
      await coupon.save();

      const updated = await Coupon.findOne({ code: 'TESTPHASE3' });
      assert.equal(updated.isActive, false);

      // Toggle back
      updated.isActive = true;
      await updated.save();
    });

    test('should update coupon fields', async () => {
      const coupon = await Coupon.findOne({ code: 'TESTPHASE3' });
      coupon.discountValue = 15;
      coupon.minCartValue = 500;
      await coupon.save();

      const updated = await Coupon.findOne({ code: 'TESTPHASE3' });
      assert.equal(updated.discountValue, 15);
      assert.equal(updated.minCartValue, 500);
    });

    test('should support both global and per-user usage limits', async () => {
      const coupon = await Coupon.create({
        code: 'LIMITED',
        discountType: 'FIXED',
        discountValue: 10,
        usageLimit: 100,
        perUserLimit: 1,
        applicability: ['POOJA'],
        isActive: true,
        usageCount: 0,
        createdBy: adminUser._id,
      });

      assert.equal(coupon.usageLimit, 100);
      assert.equal(coupon.perUserLimit, 1);
    });

    test('should support lifetime coupon (no expiry)', async () => {
      const coupon = await Coupon.create({
        code: 'LIFETIME',
        discountType: 'FIXED',
        discountValue: 10,
        expiresAt: null,
        applicability: ['POOJA'],
        isActive: true,
        usageCount: 0,
        createdBy: adminUser._id,
      });

      assert.equal(coupon.expiresAt, null);
    });

    test('should not affect historical data when coupon is updated', async () => {
      const coupon = await Coupon.findOne({ code: 'TESTPHASE3' });
      const originalValue = coupon.discountValue;

      // Create a fake historical redemption
      const redemption = await CouponRedemption.create({
        couponId: coupon._id,
        userId: referredUser._id,
        bookingId: new mongoose.Types.ObjectId(),
        discountApplied: originalValue,
        cartValue: 1500,
        finalPayable: 1500 - originalValue,
        redeemedAt: new Date(),
        idempotencyKey: `redeem_hist_${Date.now()}`,
      });

      // Update coupon
      coupon.discountValue = 25;
      await coupon.save();

      // Historical redemption should still have original value
      const histRedemption = await CouponRedemption.findById(redemption._id);
      assert.equal(histRedemption.discountApplied, originalValue);
    });
  });

  // ── Settings Regression ─────────────────────────────────────────────────
  describe('Settings Regression', () => {
    test('changing reward amount should not affect existing transactions', async () => {
      const txBefore = await WalletTransaction.countDocuments({ userId: referrerUser._id });

      // Change setting
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { userReferralRegistrationRewardCoins: 25 } },
        { upsert: true },
      );
      settingsService.invalidate();

      const txAfter = await WalletTransaction.countDocuments({ userId: referrerUser._id });
      assert.equal(txAfter, txBefore);

      // Reset
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { userReferralRegistrationRewardCoins: 10 } },
        { upsert: true },
      );
      settingsService.invalidate();
    });

    test('changing coin value should not rewrite historical amounts', async () => {
      // Create a transaction first to have something to check
      await walletService.credit({
        userId: referrerUser._id,
        amount: 75,
        type: 'ADMIN_ADJUSTMENT',
        description: 'Test for historical amount check',
        idempotencyKey: `hist_amount_test_${Date.now()}`,
        reference: { type: 'AdminAdjustment', id: adminUser._id },
      });

      const txBefore = await WalletTransaction.findOne({
        userId: referrerUser._id,
        type: 'ADMIN_ADJUSTMENT',
        direction: 'CREDIT',
        description: 'Test for historical amount check',
      });

      const originalAmount = txBefore.amount;

      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { coinMonetaryValue: 2.0 } },
        { upsert: true },
      );
      settingsService.invalidate();

      const txAfter = await WalletTransaction.findById(txBefore._id);

      assert.equal(txAfter.amount, originalAmount);

      // Reset
      await SystemSettings.findOneAndUpdate(
        {},
        { $set: { coinMonetaryValue: null } },
        { upsert: true },
      );
      settingsService.invalidate();
    });
  });

  // ── Coin Monetary Value (global Wallet / Coins) ───────────────────────────
  describe('Coin Monetary Value — global Wallet/Coins setting', () => {
    const adminUserReferralController = require('../src/controllers/adminUserReferral.controller');
    const systemSettingsController = require('../src/controllers/systemSettings.controller');

    function mockRes() {
      const res = {
        statusCode: 0,
        body: null,
        status(c) { this.statusCode = c; return this; },
        json(d) { this.body = d; return this; },
      };
      return res;
    }

    test('admin can set coin monetary value via the global settings controller (string coerced)', async () => {
      const req = { body: { coinMonetaryValue: '0.5' } };
      const res = mockRes();
      await systemSettingsController.updateSettings(req, res);
      assert.equal(res.body.success, true);
      settingsService.invalidate();
      assert.equal(await settingsService.get('coinMonetaryValue', null), 0.5);
    });

    test('negative coin monetary value is rejected (400) and does not change the stored value', async () => {
      await SystemSettings.findOneAndUpdate({}, { $set: { coinMonetaryValue: 1 } }, { upsert: true });
      settingsService.invalidate();

      const req = { body: { coinMonetaryValue: -5 } };
      const res = mockRes();
      await systemSettingsController.updateSettings(req, res);
      assert.equal(res.statusCode, 400);

      settingsService.invalidate();
      assert.equal(await settingsService.get('coinMonetaryValue', null), 1);
    });

    test('non-numeric coin monetary value is rejected (400) and does not change the stored value', async () => {
      await SystemSettings.findOneAndUpdate({}, { $set: { coinMonetaryValue: 1 } }, { upsert: true });
      settingsService.invalidate();

      const req = { body: { coinMonetaryValue: 'abc' } };
      const res = mockRes();
      await systemSettingsController.updateSettings(req, res);
      assert.equal(res.statusCode, 400);

      settingsService.invalidate();
      assert.equal(await settingsService.get('coinMonetaryValue', null), 1);
    });

    test('empty coin monetary value resets to null (not configured)', async () => {
      await SystemSettings.findOneAndUpdate({}, { $set: { coinMonetaryValue: 1 } }, { upsert: true });
      settingsService.invalidate();

      const req = { body: { coinMonetaryValue: '' } };
      const res = mockRes();
      await systemSettingsController.updateSettings(req, res);
      assert.equal(res.body.success, true);

      settingsService.invalidate();
      assert.equal(await settingsService.get('coinMonetaryValue', null), null);
    });

    test('referral settings GET no longer returns coinMonetaryValue', async () => {
      await SystemSettings.findOneAndUpdate({}, { $set: { coinMonetaryValue: 2 } }, { upsert: true });
      settingsService.invalidate();

      const req = { body: {} };
      const res = mockRes();
      await adminUserReferralController.getSettings(req, res);
      assert.equal(res.body.success, true);
      assert.equal('coinMonetaryValue' in res.body.settings, false);
    });

    test('referral settings PATCH no longer owns coinMonetaryValue', async () => {
      await SystemSettings.findOneAndUpdate({}, { $set: { coinMonetaryValue: 3 } }, { upsert: true });
      settingsService.invalidate();

      const req = { body: { coinMonetaryValue: 99 } };
      const res = mockRes();
      await adminUserReferralController.updateSettings(req, res);
      // No valid referral fields present → rejected, and the global value stays intact
      assert.equal(res.statusCode, 400);

      settingsService.invalidate();
      assert.equal(await settingsService.get('coinMonetaryValue', null), 3);
    });

    test('wallet redemption conversion still reads the global coin monetary value', async () => {
      await SystemSettings.findOneAndUpdate({}, { $set: { coinMonetaryValue: 0.5 } }, { upsert: true });
      settingsService.invalidate();

      const result = await walletService.coinsToMoneyAsync(100);
      assert.equal(result.configured, true);
      assert.equal(result.rate, 0.5);
      assert.equal(result.monetaryValue, 50);
    });
  });
});
