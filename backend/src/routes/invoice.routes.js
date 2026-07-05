const router = require('express').Router();
const ctrl   = require('../controllers/invoice.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// Static paths must come before :param routes to avoid shadowing
router.get('/my',                    ctrl.getMyInvoices);
router.get('/booking/:bookingId',    ctrl.getInvoicesByBooking);
router.get('/number/:invoiceNumber', ctrl.getInvoiceByNumber);

module.exports = router;
