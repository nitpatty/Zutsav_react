const Invoice      = require('../models/Invoice');
const Booking      = require('../models/Booking');
const OfflinePayment = require('../models/OfflinePayment');
const { getOrCreateLegacyInvoices } = require('../utils/invoiceGenerator');
const { restoreManualSaleStock } = require('../utils/inventoryUtils');
const { isAdminRole } = require('../utils/roleUtils');
const { audit } = require('../services/auditService');

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
    .populate({
      path:     'kitIds',
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
      .populate({ path: 'kitId', select: 'name description discountPrice items' })
      .populate({ path: 'kitIds', select: 'name description discountPrice items' });

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (String(booking.userId) !== String(req.user._id) && !isAdminRole(req.user.role)) {
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
// Manual invoices have no Booking and are admin-only (D9) — they return the
// persisted line-item snapshot plus the offline payment history instead.
exports.getInvoiceByNumber = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber }).lean();
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    if (invoice.source === 'manual') {
      if (!isAdminRole(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      const rows = await OfflinePayment.find({ invoiceId: invoice._id }).sort({ createdAt: 1 }).lean();
      const totalReceived = rows.filter(r => r.kind === 'RECEIPT').reduce((s, r) => s + (r.amount || 0), 0);
      const totalReversed = rows.filter(r => r.kind === 'REVERSAL').reduce((s, r) => s + (r.amount || 0), 0);
      const netReceived = Math.round((totalReceived - totalReversed) * 100) / 100;
      return res.json({
        success: true,
        invoice,
        booking: null,
        payments: rows,
        paymentSummary: {
          totalReceived: Math.round(totalReceived * 100) / 100,
          totalReversed: Math.round(totalReversed * 100) / 100,
          netReceived,
          outstanding: Math.max(0, Math.round(((invoice.grandTotal || 0) - netReceived) * 100) / 100),
        },
      });
    }

    if (String(invoice.customerId) !== String(req.user._id) && !isAdminRole(req.user.role)) {
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
      search, status, paymentType, gateway, source,
      dateFrom, dateTo,
    } = req.query;

    const query = {};
    if (status)      query.status = status;
    if (paymentType) query.paymentType = paymentType.toUpperCase();
    if (gateway)     query.paymentGateway = gateway;
    if (source === 'booking') query.source = { $ne: 'manual' };
    else if (source === 'manual') query.source = 'manual';

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

    // Revenue this month — gateway/booking revenue (manual/offline excluded)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = await Invoice.aggregate([
      { $match: { status: 'active', invoiceDate: { $gte: monthStart }, source: { $ne: 'manual' } } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]);

    // Manual/offline revenue this month — reported separately (D11)
    const manualMonthRevenue = await Invoice.aggregate([
      { $match: { status: 'active', invoiceDate: { $gte: monthStart }, source: 'manual' } },
      { $group: { _id: null, total: { $sum: '$amountPaid' } } },
    ]);

    // Source breakdown (documents that predate `source` count as booking)
    const sourceStatsRaw = await Invoice.aggregate([
      { $group: {
        _id:         { $ifNull: ['$source', 'booking'] },
        count:       { $sum: 1 },
        totalAmount: { $sum: '$amountPaid' },
      }},
    ]);
    const sourceStats = { booking: { count: 0, totalAmount: 0 }, manual: { count: 0, totalAmount: 0 } };
    sourceStatsRaw.forEach((row) => {
      const key = row._id === 'manual' ? 'manual' : 'booking';
      sourceStats[key].count       += row.count;
      sourceStats[key].totalAmount += row.totalAmount;
    });

    res.json({
      success: true,
      invoices,
      total,
      page:         +page,
      pages:        Math.ceil(total / +limit),
      stats,
      sourceStats,
      monthRevenue: monthRevenue[0]?.total || 0,
      manualMonthRevenue: manualMonthRevenue[0]?.total || 0,
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

    const oldStatus = invoice.status;
    invoice.status       = 'cancelled';
    invoice.cancelledAt  = new Date();
    invoice.cancelledBy  = req.user._id;
    invoice.cancelReason = req.body.reason || '';
    await invoice.save();

    // Manual invoices: restore stock exactly once under an atomic flag guard.
    // Booking invoices are untouched (their cancellation rules live on Booking).
    let stockRestored = false;
    if (invoice.source === 'manual' && invoice.stockDeducted && !invoice.stockRestored) {
      const claimed = await Invoice.findOneAndUpdate(
        { _id: invoice._id, stockRestored: { $ne: true } },
        { $set: { stockRestored: true } },
        { new: true }
      );
      if (claimed) {
        const items = (invoice.lineItems || []).map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          quantity:  l.quantity,
        })).filter((l) => l.productId);
        const result = await restoreManualSaleStock(items, invoice._id, req.user._id);
        stockRestored = result.ok;
        if (!result.ok) {
          console.error('[InvoiceCancel] Manual stock restore had failures:', result.failures);
        }
      }
    }

    audit(req, {
      module: 'invoice', action: 'cancel_invoice', severity: 'warning',
      targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber || String(invoice._id),
      oldValues: { status: oldStatus },
      newValues: { status: 'cancelled', source: invoice.source || 'booking', stockRestored },
      note: invoice.cancelReason,
    }).catch(() => {});

    res.json({ success: true, invoice, stockRestored });
  } catch (err) { next(err); }
};

// PATCH /api/admin/invoices/:id/archive
exports.adminArchiveInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const oldStatus = invoice.status;
    invoice.status = 'archived';
    await invoice.save();

    audit(req, {
      module: 'invoice', action: 'archive_invoice',
      targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber || String(invoice._id),
      oldValues: { status: oldStatus }, newValues: { status: 'archived' },
    }).catch(() => {});

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
      'Merchant Txn ID', 'Gateway Txn ID', 'Invoice Source', 'Seller GSTIN',
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
      inv.source === 'manual' ? 'manual' : 'booking',
      inv.sellerSnapshot?.gstin || '',
    ]);

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zutsav_invoices_${Date.now()}.csv"`);
    res.send('﻿' + csv); // BOM for Excel UTF-8 compatibility
  } catch (err) { next(err); }
};
