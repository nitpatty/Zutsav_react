/**
 * Wallet Routes — /api/wallet
 *
 * User wallet balance and transaction history endpoints.
 * Mutations (credit/debit) are handled internally by services, not exposed here.
 */

const router = require('express').Router();
const ctrl = require('../controllers/wallet.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// Get wallet balance + summary
router.get('/', ctrl.getWallet);

// Get paginated transaction history
router.get('/transactions', ctrl.getTransactions);

module.exports = router;
