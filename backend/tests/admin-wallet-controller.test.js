/**
 * Admin Wallet Controller Regression Tests
 *
 * Covers the full HTTP path for Admin Wallet credit/debit mutations:
 *   frontend-style request  →  route  →  controller  →  walletService
 *
 * This is the exact path where the "userId is required" runtime bug lived
 * (controller passed positional args to a signature that expects an object).
 *
 * Uses Node's built-in test runner (node:test) against a dedicated TEST db.
 * Builds a minimal Express app (same pattern as whatsapp-webhook-phase4.test.js)
 * and calls real HTTP endpoints via fetch().
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-wallet-controller-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_admin_wallet_test';

const User = require('../src/models/User');
const UserWallet = require('../src/models/UserWallet');
const WalletTransaction = require('../src/models/WalletTransaction');

const adminWalletRoutes = require('../src/routes/adminWallet.routes');

let server, baseUrl;
let adminToken, userToken;
let adminUser, userA, userB;

function signToken(user) {
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await Promise.all([
    User.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
  ]);

  adminUser = await User.create({ name: 'Admin', email: 'admin-w@test.com', phone: '9010000001', password: 'hashed', role: 'admin' });
  userA = await User.create({ name: 'User A', email: 'userA-w@test.com', phone: '9010000002', password: 'hashed', role: 'user' });
  userB = await User.create({ name: 'User B', email: 'userB-w@test.com', phone: '9010000003', password: 'hashed', role: 'user' });

  adminToken = signToken(adminUser);
  userToken = signToken(userA);

  const app = express();
  app.use(express.json());
  app.use('/api/admin/wallet', adminWalletRoutes);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await Promise.all([
    User.deleteMany({}),
    UserWallet.deleteMany({}),
    WalletTransaction.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

async function credit(userId, body, token = adminToken) {
  const res = await fetch(`${baseUrl}/api/admin/wallet/user/${userId}/credit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function debit(userId, body, token = adminToken) {
  const res = await fetch(`${baseUrl}/api/admin/wallet/user/${userId}/debit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function getWallet(userId) {
  const res = await fetch(`${baseUrl}/api/admin/wallet/user/${userId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return { status: res.status, data: await res.json() };
}

describe('Admin Wallet credit/debit (HTTP)', () => {
  test('credit succeeds for a selected user via route userId', async () => {
    const { status, data } = await credit(userA._id, { amount: 10, reason: 'Manual adjustment' });
    assert.equal(status, 200);
    assert.equal(data.success, true);
    assert.equal(data.wallet.balance, 10);
  });

  test('credit creates a CREDIT transaction with admin actor audit', async () => {
    const tx = await WalletTransaction.findOne({ userId: userA._id, direction: 'CREDIT' });
    assert.ok(tx);
    assert.equal(tx.amount, 10);
    assert.equal(tx.type, 'ADMIN_ADJUSTMENT');
    assert.equal(tx.status, 'COMPLETED');
    assert.equal(String(tx.createdBy), String(adminUser._id));
    assert.equal(String(tx.reference.id), String(adminUser._id));
  });

  test('second user credited correctly (no cross-user leakage)', async () => {
    const { status, data } = await credit(userB._id, { amount: 20, reason: 'Manual adjustment' });
    assert.equal(status, 200);
    assert.equal(data.wallet.balance, 20);

    const walletB = await UserWallet.findOne({ userId: userB._id });
    const walletA = await UserWallet.findOne({ userId: userA._id });
    assert.equal(walletB.balance, 20);
    assert.equal(walletA.balance, 10);
  });

  test('debit succeeds and reflects reduced balance', async () => {
    const { status, data } = await debit(userA._id, { amount: 5, reason: 'Manual adjustment' });
    assert.equal(status, 200);
    assert.equal(data.wallet.balance, 5);
  });

  test('debit creates a DEBIT transaction', async () => {
    const tx = await WalletTransaction.findOne({ userId: userA._id, direction: 'DEBIT' });
    assert.ok(tx);
    assert.equal(tx.amount, 5);
    assert.equal(String(tx.createdBy), String(adminUser._id));
  });

  test('consecutive actions yield correct final balance and exact transactions', async () => {
    const initial = (await UserWallet.findOne({ userId: userA._id })).balance;
    const txCountBefore = await WalletTransaction.countDocuments({ userId: userA._id });

    await credit(userA._id, { amount: 10, reason: 'add' });
    await credit(userA._id, { amount: 5, reason: 'add again' });
    await debit(userA._id, { amount: 3, reason: 'sub' });
    await debit(userA._id, { amount: 2, reason: 'sub again' });

    const wallet = await UserWallet.findOne({ userId: userA._id });
    assert.equal(wallet.balance, initial + 10 + 5 - 3 - 2);

    const txCountAfter = await WalletTransaction.countDocuments({ userId: userA._id });
    assert.equal(txCountAfter, txCountBefore + 4);
  });

  test('negative balance remains impossible', async () => {
    const { status, data } = await debit(userB._id, { amount: 999999, reason: 'way too much' });
    assert.equal(status, 400);
    assert.match(data.message, /insufficient/i);
  });

  test('invalid amounts (0 / negative / non-numeric) are rejected cleanly', async () => {
    for (const bad of [0, -5, 'abc']) {
      const c = await credit(userA._id, { amount: bad, reason: 'bad' });
      assert.equal(c.status, 400);
      const d = await debit(userA._id, { amount: bad, reason: 'bad' });
      assert.equal(d.status, 400);
    }
  });

  test('missing reason is rejected', async () => {
    const { status } = await credit(userA._id, { amount: 5, reason: '' });
    assert.equal(status, 400);
  });

  test('invalid target userId is rejected without mutation', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const txBefore = await WalletTransaction.countDocuments({});
    const c = await credit(fakeId, { amount: 10, reason: 'r' });
    assert.equal(c.status, 404);
    const d = await debit(fakeId, { amount: 10, reason: 'r' });
    assert.equal(d.status, 404);
    const txAfter = await WalletTransaction.countDocuments({});
    assert.equal(txAfter, txBefore);
  });

  test('GET wallet reflects updated balance after mutations', async () => {
    const { status, data } = await getWallet(userA._id);
    assert.equal(status, 200);
    assert.equal(data.wallet.balance, (await UserWallet.findOne({ userId: userA._id })).balance);
  });

  test('normal user cannot access admin wallet mutations (authorization)', async () => {
    const c = await credit(userA._id, { amount: 10, reason: 'r' }, userToken);
    assert.equal(c.status, 403);
    const d = await debit(userA._id, { amount: 10, reason: 'r' }, userToken);
    assert.equal(d.status, 403);
  });
});
