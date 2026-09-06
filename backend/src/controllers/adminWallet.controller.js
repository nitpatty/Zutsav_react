/**
 * Admin Wallet Controller — view user wallets, list all transactions,
 * and perform manual wallet adjustments (credit/debit).
 *
 * Routes are mounted under /api/admin/wallet.
 * All endpoints require admin authorization.
 */

const UserWallet = require('../models/UserWallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const walletService = require('../services/walletService');

// ── List all wallets (paginated) ────────────────────────────────────────────
exports.listWallets = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;

    let filter = {};
    if (search) {
      const regex = new RegExp(search, 'i');
      const matchingUsers = await User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      }).select('_id').lean();
      filter.userId = { $in: matchingUsers.map(u => u._id) };
    }

    const total = await UserWallet.countDocuments(filter);
    const wallets = await UserWallet.find(filter)
      .populate('userId', 'name email phone')
      .sort({ balance: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      wallets,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
    });
  } catch (err) {
    next(err);
  }
};

// ── Get specific user wallet ────────────────────────────────────────────────
exports.getUserWallet = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const wallet = await UserWallet.findOne({ userId }).populate('userId', 'name email phone').lean();
    if (!wallet) {
      return res.json({ success: true, wallet: null, transactions: [] });
    }

    const transactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, wallet, transactions });
  } catch (err) {
    next(err);
  }
};

// ── List all transactions (paginated, filterable) ───────────────────────────
exports.listTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, direction, search, startDate, endDate } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (direction) filter.direction = direction;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      const matchingUsers = await User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      }).select('_id').lean();
      filter.userId = { $in: matchingUsers.map(u => u._id) };
    }

    const total = await WalletTransaction.countDocuments(filter);
    const transactions = await WalletTransaction.find(filter)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      transactions,
      total,
      page: +page,
      totalPages: Math.ceil(total / +limit),
    });
  } catch (err) {
    next(err);
  }
};

// ── Manual wallet adjustment (credit) ───────────────────────────────────────
exports.creditWallet = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required for manual adjustments' });
    }

    // Verify user exists
    const user = await User.findById(userId).select('name').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const idempotencyKey = `admin_credit_${userId}_${Date.now()}`;
    const result = await walletService.credit({
      userId,
      amount: Number(amount),
      type: 'ADMIN_ADJUSTMENT',
      description: reason.trim(),
      idempotencyKey,
      reference: { type: 'AdminAdjustment', id: req.user._id },
      createdBy: req.user._id,
    });

    res.json({
      success: true,
      message: `${amount} coins credited to ${user.name}`,
      wallet: {
        balance: result.wallet.balance,
        totalEarned: result.wallet.totalEarned,
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── Manual wallet adjustment (debit) ────────────────────────────────────────
exports.debitWallet = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a positive number' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason is required for manual adjustments' });
    }

    // Verify user exists
    const user = await User.findById(userId).select('name').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const idempotencyKey = `admin_debit_${userId}_${Date.now()}`;
    const result = await walletService.debit({
      userId,
      amount: Number(amount),
      type: 'ADMIN_ADJUSTMENT',
      description: reason.trim(),
      idempotencyKey,
      reference: { type: 'AdminAdjustment', id: req.user._id },
      createdBy: req.user._id,
    });

    res.json({
      success: true,
      message: `${amount} coins debited from ${user.name}`,
      wallet: {
        balance: result.wallet.balance,
        totalRedeemed: result.wallet.totalRedeemed,
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};
