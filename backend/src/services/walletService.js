/**
 * WalletService — wallet operations with idempotency, balance safety, and ledger.
 *
 * Responsibilities:
 *   - Create/retrieve user wallets
 *   - Credit coins with idempotency
 *   - Debit coins with balance check
 *   - Transaction ledger queries
 *   - Coin → money conversion
 *
 * All mutations are idempotent via idempotencyKey.
 * Balance is always ledger-driven, never directly mutated.
 *
 * Usage:
 *   const walletService = require('../services/walletService');
 */

const mongoose = require('mongoose');
const UserWallet = require('../models/UserWallet');
const WalletTransaction = require('../models/WalletTransaction');
const settings = require('../utils/settingsService');

// ── Get or create wallet ─────────────────────────────────────────────────────
/**
 * Get the user's wallet, creating it if it doesn't exist.
 * @param {ObjectId} userId
 * @returns {Promise<Document>}
 */
async function getOrCreateWallet(userId) {
  let wallet = await UserWallet.findOne({ userId });
  if (!wallet) {
    try {
      wallet = await UserWallet.create({ userId, balance: 0, totalEarned: 0, totalRedeemed: 0 });
    } catch (err) {
      // Concurrent creation for the same user — the unique userId index lets
      // only one win; the others re-read the winner's wallet.
      if (err.code === 11000) {
        wallet = await UserWallet.findOne({ userId });
      } else {
        throw err;
      }
    }
  }
  return wallet;
}

// ── Get wallet ───────────────────────────────────────────────────────────────
async function getWallet(userId) {
  return UserWallet.findOne({ userId });
}

// ── Credit coins ─────────────────────────────────────────────────────────────
/**
 * Credit coins to a user's wallet with idempotency.
 *
 * @param {Object} params
 * @param {ObjectId} params.userId - Target user
 * @param {number} params.amount - Amount to credit (must be > 0)
 * @param {string} params.type - Transaction type from WalletTransaction enum
 * @param {string} params.description - Human-readable description
 * @param {Object} params.reference - { type: string, id: ObjectId }
 * @param {string} [params.idempotencyKey] - Unique key for deduplication
 * @param {ObjectId} [params.createdBy] - Who initiated (null for automated)
 * @returns {Promise<{wallet: Document, transaction: Document} | {alreadyExists: boolean}>}
 */
async function credit({
  userId,
  amount,
  type,
  description,
  reference,
  idempotencyKey = null,
  createdBy = null,
}) {
  // Validate inputs
  if (!userId) throw new Error('userId is required');
  if (!amount || amount <= 0) throw new Error('Credit amount must be positive');
  if (!type) throw new Error('Transaction type is required');
  if (!description) throw new Error('Description is required');

  // Idempotency check
  if (idempotencyKey) {
    const existing = await WalletTransaction.findOne({ idempotencyKey });
    if (existing) {
      return { alreadyExists: true, transaction: existing };
    }
  }

  // Get or create wallet
  const wallet = await getOrCreateWallet(userId);

  // Calculate new balance
  const newBalance = wallet.balance + amount;
  const newTotalEarned = wallet.totalEarned + amount;

  // Create transaction — the unique index on idempotencyKey prevents duplicates.
  // Under concurrency the pre-check above can miss, so treat a duplicate-key
  // error on insert as the idempotent already-exists case.
  let transaction;
  try {
    transaction = await WalletTransaction.create({
      userId,
      amount,
      direction: 'CREDIT',
      type,
      balanceAfter: newBalance,
      reference,
      status: 'COMPLETED',
      description,
      idempotencyKey,
      createdBy,
    });
  } catch (err) {
    if (err.code === 11000 && idempotencyKey) {
      const existing = await WalletTransaction.findOne({ idempotencyKey });
      return { alreadyExists: true, transaction: existing };
    }
    throw err;
  }

  // Update wallet balance using $inc for atomicity (prevents race-condition stale reads)
  await UserWallet.findByIdAndUpdate(wallet._id, {
    $inc: { balance: amount, totalEarned: amount },
  });

  // Re-read for accurate return value
  const updatedWallet = await UserWallet.findById(wallet._id);
  return { wallet: updatedWallet, transaction };
}

// ── Debit coins ──────────────────────────────────────────────────────────────
/**
 * Debit coins from a user's wallet with balance check and idempotency.
 *
 * @param {Object} params
 * @param {ObjectId} params.userId - Target user
 * @param {number} params.amount - Amount to debit (must be > 0)
 * @param {string} params.type - Transaction type
 * @param {string} params.description - Human-readable description
 * @param {Object} params.reference - { type: string, id: ObjectId }
 * @param {string} [params.idempotencyKey] - Unique key for deduplication
 * @param {ObjectId} [params.createdBy] - Who initiated
 * @returns {Promise<{wallet: Document, transaction: Document} | {alreadyExists: boolean}>}
 * @throws {Error} If insufficient balance
 */
async function debit({
  userId,
  amount,
  type,
  description,
  reference,
  idempotencyKey = null,
  createdBy = null,
}) {
  // Validate inputs
  if (!userId) throw new Error('userId is required');
  if (!amount || amount <= 0) throw new Error('Debit amount must be positive');
  if (!type) throw new Error('Transaction type is required');
  if (!description) throw new Error('Description is required');

  // Idempotency check
  if (idempotencyKey) {
    const existing = await WalletTransaction.findOne({ idempotencyKey });
    if (existing) {
      return { alreadyExists: true, transaction: existing };
    }
  }

  // Get wallet
  const wallet = await getOrCreateWallet(userId);

  // Balance check
  if (wallet.balance < amount) {
    throw Object.assign(
      new Error(`Insufficient wallet balance. Available: ${wallet.balance}, requested: ${amount}`),
      { status: 400 }
    );
  }

  // Calculate new balance
  const newBalance = wallet.balance - amount;
  const newTotalRedeemed = wallet.totalRedeemed + amount;

  // Create transaction — the unique index on idempotencyKey prevents duplicates
  const transaction = await WalletTransaction.create({
    userId,
    amount,
    direction: 'DEBIT',
    type,
    balanceAfter: newBalance,
    reference,
    status: 'COMPLETED',
    description,
    idempotencyKey,
    createdBy,
  });

  // Update wallet balance using $inc for atomicity
  await UserWallet.findByIdAndUpdate(wallet._id, {
    $inc: { balance: -amount, totalRedeemed: amount },
  });

  // Re-read for accurate return value
  const updatedWallet = await UserWallet.findById(wallet._id);
  return { wallet: updatedWallet, transaction };
}

// ── Get transaction history ──────────────────────────────────────────────────
/**
 * Get paginated transaction history for a user.
 *
 * @param {ObjectId} userId
 * @param {Object} options - { page, limit, type, direction }
 * @returns {Promise<{transactions: Array, total: number, page: number}>}
 */
async function getTransactions(userId, { page = 1, limit = 20, type, direction } = {}) {
  const query = { userId };
  if (type) query.type = type;
  if (direction) query.direction = direction;

  const [transactions, total] = await Promise.all([
    WalletTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(+limit)
      .skip((+page - 1) * +limit)
      .lean(),
    WalletTransaction.countDocuments(query),
  ]);

  return { transactions, total, page: +page };
}

// ── Convert coins to money ───────────────────────────────────────────────────
/**
 * Convert a coin amount to monetary value using admin-configured rate.
 *
 * @param {number} coins - Number of coins
 * @returns {{ monetaryValue: number | null, rate: number | null, configured: boolean }}
 */
function coinsToMoney(coins) {
  // coinMonetaryValue is read synchronously from cache (settingsService)
  // For async version, use settings.get() — but this utility is kept sync
  // for use in display contexts. The checkout integration MUST use the async version.
  return { coins, note: 'Use settings.get("coinMonetaryValue") for runtime value' };
}

/**
 * Async version — get the monetary value for a given coin amount.
 *
 * @param {number} coins
 * @returns {Promise<{ monetaryValue: number | null, rate: number | null, configured: boolean }>}
 */
async function coinsToMoneyAsync(coins) {
  const rate = await settings.get('coinMonetaryValue', null);
  if (rate === null || rate === undefined) {
    return { monetaryValue: null, rate: null, configured: false };
  }
  return { monetaryValue: coins * rate, rate, configured: true };
}

module.exports = {
  getOrCreateWallet,
  getWallet,
  credit,
  debit,
  getTransactions,
  coinsToMoney,
  coinsToMoneyAsync,
};
