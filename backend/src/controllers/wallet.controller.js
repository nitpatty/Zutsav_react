/**
 * Wallet Controller — API handlers for user wallet operations.
 *
 * Routes:
 *   GET /api/wallet              — get wallet balance + summary
 *   GET /api/wallet/transactions — get paginated transaction history
 *
 * Wallet mutations (credit/debit) are handled by services internally,
 * not exposed as public API endpoints in this phase.
 */

const walletService = require('../services/walletService');
const settings      = require('../utils/settingsService');

// ── GET /api/wallet ──────────────────────────────────────────────────────────
/**
 * Get the authenticated user's wallet balance and summary.
 * Creates the wallet if it doesn't exist (lazy initialization).
 *
 * Also returns the redemption context the client needs to render the
 * "Use Coins" checkout option (coin monetary value + minimum balance
 * threshold — both configured by Admin under System Settings → Wallet / Coins).
 *
 * Auth: required
 */
exports.getWallet = async (req, res, next) => {
  try {
    const [wallet, coinMonetaryValue, coinRedemptionMinCoins] = await Promise.all([
      walletService.getOrCreateWallet(req.user._id),
      settings.get('coinMonetaryValue', null),
      settings.get('coinRedemptionMinCoins', 0),
    ]);

    res.json({
      success: true,
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
        totalRedeemed: wallet.totalRedeemed,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
        coinMonetaryValue,
        coinRedemptionMinCoins,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/wallet/transactions ─────────────────────────────────────────────
/**
 * Get paginated transaction history for the authenticated user.
 *
 * Query params: page, limit, type, direction
 * Auth: required
 */
exports.getTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, direction } = req.query;

    const { transactions, total, page: currentPage } = await walletService.getTransactions(
      req.user._id,
      { page, limit, type, direction }
    );

    res.json({
      success: true,
      transactions,
      total,
      page: currentPage,
    });
  } catch (err) {
    next(err);
  }
};
