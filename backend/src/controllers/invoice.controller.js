const Invoice      = require('../models/Invoice');
const Booking      = require('../models/Booking');
const { getOrCreateLegacyInvoices } = require('../utils/invoiceGenerator');

/* ─── Helper ─────────────────────────────────────────────────────────────────
   Load the full booking (populated) needed to render line items in the PDF.   */
async function loadBookingForInvoice(bookingId) {
  return Booking.findById(bookingId)
    .populate('poojaId',  'name category description duration')
    .populate('panditId', 'name phone profilePhoto')
    .populate({
      path:     'kitId',
      select:   'name description discountPrice items',
      populate: { path: 'items.productId', select: 'name price' },
    })
    .lean();
}

/* ═══════════════════════════════════════════════════════════════════════════
   USER ENDPOINTS
══════════════════════════════════════════════════════════════════════════════ */

// GET /api/invoices/booking/:bookingId
// Returns ALL invoices for a booking. Creates legacy invoices on-demand if none exist.
exports.getInvoicesByBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('poojaId', 'name category description duration')
      .populate('panditId', 'name phone profilePhoto')
      .populate({ path: 'kitId', select: 'name description discountPrice items' });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (String(booking.userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let invoices = await Invoice.find({ bookingId: booking._id })
      .sort({ invoiceDate: 1 }).lean();

    // On-demand migration for old bookings that pre-date the Invoice model
    if (!invoices.length) {
      invoices = await getOrCreateLegacyInvoices(booking);
    }

    res.json({ success: true, booking, invoices });
  } catch (err) { next(err); }
};

// GET /api/invoices/number/:invoiceNumber
// Returns a specific invoice + its booking (for PDF rendering).
exports.getInvoiceByNumber = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber }).lean();
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    if (String(invoice.customerId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const booking = await loadBookingForInvoice(invoice.bookingId);

    res.json({ success: true, invoice, booking });
  } catch (err) { next(err); }
};

// GET /api/invoices/my?page=1&limit=20
// Paginated list of the authenticated user's invoices.
exports.getMyInvoices = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = { customerId: req.user._id, status: { $ne: 'cancelled' } };

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ invoiceDate: -1 })
        .limit(+limit).skip((+page - 1) * +limit)
        .lean(),
      Invoice.countDocuments(query),
    ]);

    res.json({ success: true, invoices, total });
  } catch (err) { next(err); }
};

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN ENDPOINTS  (called from admin.routes.js which applies authorize('admin'))
══════════════════════════════════════════════════════════════════════════════ */

// GET /api/admin/invoices
exports.adminGetInvoices = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 50,
      search, status, paymentType, gateway,
      dateFrom, dateTo,
    } = req.query;

    const query = {};
    if (status)      query.status = status;
    if (paymentType) query.paymentType = paymentType.toUpperCase();
    if (gateway)     query.paymentGateway = gateway;

    if (dateFrom || dateTo) {
      query.invoiceDate = {};
      if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
      if (dateTo)   query.invoiceDate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    if (search) {
      const re = new RegExp(search.trim(), 'i');
      query.$or = [
        { invoiceNumber:         re },
        { bookingNumber:         re },
        { customerName:          re },
        { customerPhone:         re },
        { merchantTransactionId: re },
        { gatewayTransactionId:  re },
      ];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ invoiceDate: -1 })
        .limit(+limit).skip((+page - 1) * +limit)
        .lean(),
      Invoice.countDocuments(query),
    ]);

    // Summary stats for dashboard cards
    const stats = await Invoice.aggregate([
      { $group: {
        _id:        '$status',
        count:      { $sum: 1 },
        totalAmount:{ $sum: '$amountPaid' },
      }},
    ]);

    // Revenue this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = await Invoice.aggregate([
      { $match: { status: 'active', invoiceDate: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]);

    res.json({
      success: true,
      invoices,
      total,
      page:         +page,
      pages:        Math.ceil(total / +limit),
      stats,
      monthRevenue: monthRevenue[0]?.total || 0,
    });
  } catch (err) { next(err); }
};

// PATCH /api/admin/invoices/:id/cancel
exports.adminCancelInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    if (invoice.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Invoice is already cancelled' });
    }

    invoice.status       = 'cancelled';
    invoice.cancelledAt  = new Date();
    invoice.cancelledBy  = req.user._id;
    invoice.cancelReason = req.body.reason || '';
    await invoice.save();

    res.json({ success: true, invoice });
  } catch (err) { next(err); }
};

// PATCH /api/admin/invoices/:id/archive
exports.adminArchiveInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    invoice.status = 'archived';
    await invoice.save();

    res.json({ success: true, invoice });
  } catch (err) { next(err); }
};

// GET /api/admin/invoices/export
exports.exportInvoices = async (req, res, next) => {
  try {
    const { dateFrom, dateTo, status, paymentType } = req.query;
    const query = {};
    if (status)      query.status      = status;
    if (paymentType) query.paymentType = paymentType.toUpperCase();
    if (dateFrom || dateTo) {
      query.invoiceDate = {};
      if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
      if (dateTo)   query.invoiceDate.$lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    const invoices = await Invoice.find(query).sort({ invoiceDate: -1 }).limit(10000).lean();

    const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '';
    const headers = [
      'Invoice Number', 'Order Number', 'Customer Name', 'Customer Phone',
      'Customer Email', 'Payment Type', 'Invoice Date', 'Amount Paid (₹)',
      'Previously Paid (₹)', 'Outstanding After (₹)', 'Grand Total (₹)',
      'Total GST (₹)', 'Invoice Status', 'Payment Gateway',
      'Merchant Txn ID', 'Gateway Txn ID',
    ];

    const rows = invoices.map(inv => [
      inv.invoiceNumber,
      inv.bookingNumber,
      inv.customerName,
      inv.customerPhone,
      inv.customerEmail,
      inv.paymentType,
      fmt(inv.invoiceDate),
      inv.amountPaid,
      inv.previouslyPaid,
      inv.outstandingAfter,
      inv.grandTotal,
      inv.totalGST,
      inv.status,
      inv.paymentGateway,
      inv.merchantTransactionId,
      inv.gatewayTransactionId,
    ]);

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zutsav_invoices_${Date.now()}.csv"`);
    res.send('﻿' + csv); // BOM for Excel UTF-8 compatibility
  } catch (err) { next(err); }
};
