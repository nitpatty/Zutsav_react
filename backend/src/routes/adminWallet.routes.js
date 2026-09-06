/**
 * Admin Wallet Routes — /api/admin/wallet
 *
 * View user wallets, list all transactions, and perform manual adjustments.
 */

const router = require('express').Router();
const ctrl = require('../controllers/adminWallet.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// ── Wallet Management ───────────────────────────────────────────────────────
router.get('/', ctrl.listWallets);
router.get('/transactions', ctrl.listTransactions);
router.get('/user/:userId', ctrl.getUserWallet);
router.post('/user/:userId/credit', ctrl.creditWallet);
router.post('/user/:userId/debit', ctrl.debitWallet);

module.exports = router;
