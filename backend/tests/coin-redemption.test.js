/**
 * Tests for the Coin Redemption system (services + wallet endpoint exposure).
 *
 * Covers:
 *   - resolveCoinRedemption(): no-op when no coins requested
 *   - Coupon + coins are mutually exclusive (400)
 *   - Cart product items are not eligible (400)
 *   - Payable must be positive (400)
 *   - Unconfigured coinMonetaryValue → 400
 *   - Minimum balance threshold (coinRedemptionMinCoins) gates eligibility
 *   - Requested coins never exceed the wallet balance (400 / cap)
 *   - Redeemed coins never exceed the payable (cap at floor(payable/rate))
 *   - Coins that cover no part of the payable are rejected
 *   - settleCoinRedemption(): no-op when no coins carried
 *   - Settle requires phonePeMerchantTransactionId (silent no-op guard)
 *   - Settlement debits balance once, increments totalRedeemed, ledger entry
 *   - Idempotent per merchant transaction (verify + webhook both safe)
 *   - Multiple bookings aggregated into a single COIN_REDEMPTION debit
 *   - GET /api/wallet exposes coinMonetaryValue + coinRedemptionMinCoins
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && node --tests tests/*.test.js
 *       (or modern Node: node --test tests/coin-redemption.test.js)
 *
 * Runs against a dedicated TEST database and drops it before and after.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'coin-redemption-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_coin_redemption_test';

// Models
const User = require('../src/models/User');
const UserWallet = require('../src/models/UserWallet');
const WalletTransaction = require('../src/models/WalletTransaction');
const SystemSettings = require('../src/models/SystemSettings');

// Services / controllers
const { resolveCoinRedemption, settleCoinRedemption } = require('../src/services/coinRedemptionService');
const walletService = require('../src/services/walletService');
const settingsService = require('../src/utils/settingsService');
const walletController = require('../src/controllers/wallet.controller');

// Helpers
let _seq = 40000;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqEmail = () => `coin${Date.now()}_${_seq}@test.zutsav.local`;
const coins = (n) => new mongoose.Types.ObjectId();

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
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
    SystemSettings.deleteMany({}),
  ]);
}

async function setupDefaultSettings() {
  await SystemSettings.deleteMany({});
  await SystemSettings.create({
    coinMonetaryValue: 2,
    coinRedemptionMinCoins: 5,
  });
  settingsService.invalidate();
}

/** Set a single setting and invalidate the cache. */
async function setSetting(key, value) {
  await SystemSettings.updateOne({}, { $set: { [key]: value } });
  settingsService.invalidate();
}

async function createUser(name = 'CoinUser') {
  return User.create({ name, email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
}

/** Create a wallet with a given coin balance directly. */
async function seedWallet(userId, balance) {
  return UserWallet.create({ userId, balance, totalEarned: balance, totalRedeemed: 0 });
}

/** Build a fake booking doc shape used by settleCoinRedemption. */
function fakeBooking(userId, opts = {}) {
  return {
    _id: coins(),
    userId,
    phonePeMerchantTransactionId: opts.txnId !== undefined ? opts.txnId : `TX_${_seq}`,
    coinCoins: opts.coinCoins || 0,
    coinValue: opts.coinValue || 0,
  };
}

// ── Connect / disconnect ─────────────────────────────────────────────────────
before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.init(),
    UserWallet.init(),
    WalletTransaction.init(),
    SystemSettings.init(),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RESOLVE — validation & rules
// ═══════════════════════════════════════════════════════════════════════════════
describe('resolveCoinRedemption — validation rules', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('no coins requested → no-op result, no throw, no wallet required', async () => {
    const res = await resolveCoinRedemption({ userId: coins(), coinCoins: 0, payable: 500 });
    assert.deepEqual(res, { requested: 0, coinCoinsUsed: 0, coinValueUsed: 0 });
  });

  test('coupon + coins are mutually exclusive (400)', async () => {
    await assert.rejects(
      resolveCoinRedemption({ userId: coins(), coinCoins: 10, hasCoupon: true, payable: 500 }),
      (err) => err.status === 400 && /cannot be used together/.test(err.message)
    );
  });

  test('cart product items are not eligible (400)', async () => {
    await assert.rejects(
      resolveCoinRedemption({ userId: coins(), coinCoins: 10, productItems: [{ productId: coins() }], payable: 500 }),
      (err) => err.status === 400 && /only available for Pooja/.test(err.message)
    );
  });

  test('non-positive payable is rejected (400)', async () => {
    await assert.rejects(
      resolveCoinRedemption({ userId: coins(), coinCoins: 10, payable: 0 }),
      (err) => err.status === 400 && /only available for Pooja/.test(err.message)
    );
  });

  test('unconfigured coin value is rejected (400)', async () => {
    await setSetting('coinMonetaryValue', null);
    await assert.rejects(
      resolveCoinRedemption({ userId: coins(), coinCoins: 10, payable: 500 }),
      (err) => err.status === 400 && /not configured/.test(err.message)
    );
  });

  test('wallet balance below the minimum threshold is rejected (400)', async () => {
    const user = await createUser('BelowMin');
    await seedWallet(user._id, 3); // min is 5
    await assert.rejects(
      resolveCoinRedemption({ userId: user._id, coinCoins: 2, payable: 500 }),
      (err) => err.status === 400 && /minimum of 5/.test(err.message)
    );
  });

  test('minimum threshold of 0 (default) enables redemption from the first coin', async () => {
    await setSetting('coinRedemptionMinCoins', 0);
    const user = await createUser('TinyWallet');
    await seedWallet(user._id, 1);
    const res = await resolveCoinRedemption({ userId: user._id, coinCoins: 1, payable: 500 });
    assert.equal(res.coinCoinsUsed, 1);
    assert.equal(res.coinValueUsed, 2);
  });

  test('requested coins exceed balance → 400 with a clear message', async () => {
    const user = await createUser('OverReq');
    await seedWallet(user._id, 10);
    await assert.rejects(
      resolveCoinRedemption({ userId: user._id, coinCoins: 20, payable: 1000 }),
      (err) => err.status === 400 && /up to 10 coins/.test(err.message)
    );
  });

  test('eligible request computes coins and value at the admin rate', async () => {
    const user = await createUser('Eligible'); // rate 2, min 5
    await seedWallet(user._id, 10);
    const res = await resolveCoinRedemption({ userId: user._id, coinCoins: 6, payable: 100 });
    assert.equal(res.coinCoinsUsed, 6);
    assert.equal(res.coinValueUsed, 12);
  });

  test('coins are capped by the wallet balance — requested exactly the balance fully redeems', async () => {
    const user = await createUser('BalanceCapped');
    await seedWallet(user._id, 4);
    await setSetting('coinRedemptionMinCoins', 0);
    const res = await resolveCoinRedemption({ userId: user._id, coinCoins: 4, payable: 1000 });
    assert.equal(res.coinCoinsUsed, 4);
    assert.equal(res.coinValueUsed, 8);
  });

  test('coins are capped by the payable (never credit more than owed)', async () => {
    const user = await createUser('PayableCapped'); // rate 2
    await seedWallet(user._id, 50);
    await setSetting('coinRedemptionMinCoins', 0);
    const res = await resolveCoinRedemption({ userId: user._id, coinCoins: 50, payable: 3 });
    assert.equal(res.coinCoinsUsed, 1);   // floor(3/2)
    assert.equal(res.coinValueUsed, 2);
  });

  test('coins that cover no part of the payable are rejected (400)', async () => {
    const user = await createUser('NoCover'); // rate 2
    await seedWallet(user._id, 50);
    await setSetting('coinRedemptionMinCoins', 0);
    await assert.rejects(
      resolveCoinRedemption({ userId: user._id, coinCoins: 10, payable: 1 }), // floor(1/2) = 0
      (err) => err.status === 400 && /do not cover any part/.test(err.message)
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SETTLE — wallet debit after payment success
// ═══════════════════════════════════════════════════════════════════════════════
describe('settleCoinRedemption — wallet debit', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('no coins carried → no-op, no ledger entry', async () => {
    const user = await createUser('NoCoins');
    await seedWallet(user._id, 100);
    const settled = await settleCoinRedemption([fakeBooking(user._id, { coinCoins: 0 })]);
    assert.equal(settled, false);
    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
    assert.equal(await WalletTransaction.countDocuments(), 0);
  });

  test('missing merchant transaction id → silent no-op guard', async () => {
    const user = await createUser('NoTxn');
    await seedWallet(user._id, 100);
    const settled = await settleCoinRedemption([fakeBooking(user._id, { coinCoins: 10, txnId: null })]);
    assert.equal(settled, false);
    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 100);
  });

  test('successful settlement debits balance and creates a COIN_REDEMPTION ledger entry', async () => {
    const user = await createUser('SettleOk');
    await seedWallet(user._id, 100);
    const settled = await settleCoinRedemption([fakeBooking(user._id, { coinCoins: 30, coinValue: 60, txnId: 'TX_SETTLE_OK' })]);
    assert.equal(settled, true);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 70);
    assert.equal(wallet.totalRedeemed, 30);

    const { transactions } = await walletService.getTransactions(user._id, { type: 'COIN_REDEMPTION' });
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, 30);
    assert.equal(transactions[0].direction, 'DEBIT');
    assert.equal(transactions[0].idempotencyKey, 'COIN_REDEMPTION_TX_SETTLE_OK');
  });

  test('settlement is idempotent per merchant transaction (verify + webhook both fire)', async () => {
    const user = await createUser('IdemSettle');
    await seedWallet(user._id, 100);
    const booking = fakeBooking(user._id, { coinCoins: 30, coinValue: 60, txnId: 'TX_IDEM' });

    const first = await settleCoinRedemption([booking]);
    const second = await settleCoinRedemption([booking]);

    assert.equal(first, true);
    assert.equal(second, true); // walletService.debit returns alreadyExists (non-throwing)

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 70, 'debited exactly once');
    assert.equal(wallet.totalRedeemed, 30);

    const { transactions, total } = await walletService.getTransactions(user._id, { type: 'COIN_REDEMPTION' });
    assert.equal(total, 1, 'exactly one ledger entry');
    assert.equal(transactions[0].amount, 30);
  });

  test('multiple bookings for one checkout are aggregated into a single debit', async () => {
    const user = await createUser('Aggregate');
    await seedWallet(user._id, 100);
    const bookings = [
      fakeBooking(user._id, { txnId: 'ZUT_CART_1', coinCoins: 12, coinValue: 24 }),
      fakeBooking(user._id, { txnId: 'ZUT_CART_1', coinCoins: 18, coinValue: 36 }),
    ];

    const settled = await settleCoinRedemption(bookings);
    assert.equal(settled, true);

    const wallet = await walletService.getWallet(user._id);
    assert.equal(wallet.balance, 70);

    const { transactions, total } = await walletService.getTransactions(user._id, { type: 'COIN_REDEMPTION' });
    assert.equal(total, 1);
    assert.equal(transactions[0].amount, 30);
    assert.equal(transactions[0].idempotencyKey, 'COIN_REDEMPTION_ZUT_CART_1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WALLET ENDPOINT — redemption context exposed to clients
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/wallet — redemption context', () => {
  beforeEach(async () => {
    await cleanCollections();
    await setupDefaultSettings();
  });

  test('returns coinMonetaryValue + coinRedemptionMinCoins alongside balance', async () => {
    const user = await createUser('WalletCtx');
    await seedWallet(user._id, 7);

    const req = { user: { _id: user._id }, params: {}, query: {} };
    const res = mockRes();
    await walletController.getWallet(req, res, (e) => { if (e) throw e; });

    assert.equal(res.body.success, true);
    assert.equal(res.body.wallet.balance, 7);
    assert.equal(res.body.wallet.coinMonetaryValue, 2);
    assert.equal(res.body.wallet.coinRedemptionMinCoins, 5);
  });

  test('exposes default 0 threshold and null value when unconfigured', async () => {
    const user = await createUser('WalletDefault');
    await seedWallet(user._id, 0);
    await SystemSettings.updateOne({}, { $set: { coinMonetaryValue: null, coinRedemptionMinCoins: 0 } });
    settingsService.invalidate();

    const req = { user: { _id: user._id }, params: {}, query: {} };
    const res = mockRes();
    await walletController.getWallet(req, res, (e) => { if (e) throw e; });

    assert.equal(res.body.wallet.coinMonetaryValue, null);
    assert.equal(res.body.wallet.coinRedemptionMinCoins, 0);
  });
});