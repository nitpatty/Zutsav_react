const mongoose = require('mongoose');

/**
 * UserWallet — one wallet per user, tracks current coin balance.
 *
 * Balance is always >= 0. Negative balances are rejected at the service layer.
 * All mutations go through WalletService which creates ledger transactions.
 * Never mutate this document directly from controllers.
 */

const userWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // Current available balance (never negative)
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Wallet balance cannot be negative'],
      required: true,
    },

    // Running totals for audit (never decrease — only increase via credits/debits)
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRedeemed: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserWallet', userWalletSchema);
