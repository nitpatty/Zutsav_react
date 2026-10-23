/**
 * Manual Billing controller — Admin-created offline product sales.
 *
 * Scope guarantees:
 *   - Never creates/modifies a Booking.
 *   - Never calls PhonePe / Razorpay / mock-payment code.
 *   - Never touches PaymentLedger (offline money lives in OfflinePayment).
 *   - Never issues coupons, coins, wallet credit, referral or loyalty rewards.
 *   - All prices/taxes/totals are server-derived; client monetary inputs are
 *     limited to an optional per-line discount and the amount actually received.
 */

const Invoice       = require('../models/Invoice');
const OfflinePayment = require('../models/OfflinePayment');
const Product       = require('../models/Product');
const User          = require('../models/User');
const { generateInvoiceNumberForSeries } = require('../utils/invoiceGenerator');
const billingRegistrations = require('../utils/billingRegistrationService');
const {
  ManualBillValidationError,
  calculateManualBillLines,
  buildManualBill,
} = require('../utils/manualBillCalculator');
const { deductManualSaleStock, restoreManualSaleStock } = require('../utils/inventoryUtils');
const { audit } = require('../services/auditService');

const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER'];
const MANUAL_SERIES   = 'MAN';

function badRequest(message, details = []) {
  const err = new Error(message);
  err.status = 400;
  err.statusCode = 400;
  err.details = details;
  return err;
}

function normalizeMethod(value) {
  const m = String(value || '').toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = { BANK: 'BANK_TRANSFER', BANKTRANSFER: 'BANK_TRANSFER', ONLINE: 'UPI' };
  return aliases[m] || m;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function cleanString(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validateCustomerInput(input) {
  const customer = isPlainObject(input) ? input : {};
  const customerId = customer.customerId ? String(customer.customerId) : null;
  if (customerId && !/^[a-f0-9]{24}$/i.test(customerId)) {
    throw badRequest('customerId is not a valid identifier');
  }

  const phone = cleanString(customer.phone, 20).replace(/[\s-]/g, '').replace(/^\+?91/, '');
  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    throw badRequest('Customer phone must be a valid 10-digit Indian mobile number');
  }

  const snapshot = {
    name:    cleanString(customer.name, 200),
    phone,
    email:   cleanString(customer.email, 200).toLowerCase(),
    address: cleanString(customer.address, 500),
    pincode: cleanString(customer.pincode, 10),
    state:   cleanString(customer.state, 100),
    city:    cleanString(customer.city, 100),
  };
  if (snapshot.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.email)) {
    throw badRequest('Customer email is not valid');
  }
  return { customerId, snapshot };
}

async function buildCustomerContext(input) {
  const { customerId, snapshot } = validateCustomerInput(input);

  if (customerId) {
    const user = await User.findOne({ _id: customerId, isDeleted: { $ne: true } })
      .select('name phone email address pincode state city')
      .lean();
    if (!user) throw badRequest('Selected customer was not found');

    const merged = {
      name:    snapshot.name    || user.name    || '',
      phone:   snapshot.phone   || user.phone   || '',
      email:   snapshot.email   || user.email   || '',
      address: snapshot.address || user.address || '',
      pincode: snapshot.pincode || user.pincode || '',
      state:   snapshot.state   || user.state   || '',
      city:    snapshot.city    || user.city    || '',
    };
    if (!merged.name) throw badRequest('Customer name is required');
    return { customerId, ...merged };
  }

  // Walk-in: snapshot-only, NO User account is ever created.
  if (!snapshot.name || snapshot.name.length < 2) {
    throw badRequest('Walk-in customer name is required (at least 2 characters)');
  }
  if (!snapshot.phone && !snapshot.address) {
    throw badRequest('Walk-in customer requires a phone number or an address');
  }
  return { customerId: null, ...snapshot };
}

function validatePaymentInput(input, grandTotal) {
  if (input === undefined || input === null) return null;
  if (!isPlainObject(input)) throw badRequest('payment must be an object');

  const rawAmount = input.amount === undefined || input.amount === null || input.amount === ''
    ? 0
    : Number(input.amount);
  if (!Number.isFinite(rawAmount) || rawAmount < 0) {
    throw badRequest('Received amount must be a non-negative number');
  }
  if (Math.round(rawAmount * 100) / 100 > grandTotal) {
    throw badRequest('Received amount cannot exceed the bill total (overpayment is not supported)');
  }
  const amount = Math.round(rawAmount * 100) / 100;
  if (amount === 0) return { amount: 0, method: null, reference: '', note: '', receivedAt: null };

  const method = normalizeMethod(input.method);
  if (!PAYMENT_METHODS.includes(method)) {
    throw badRequest(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`);
  }

  let receivedAt = null;
  if (input.receivedAt) {
    const d = new Date(input.receivedAt);
    if (isNaN(d.getTime())) throw badRequest('Payment receivedAt is not a valid date');
    if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw badRequest('Payment receivedAt cannot be in the future');
    }
    receivedAt = d;
  }

  return {
    amount,
    method,
    reference: cleanString(input.reference, 120),
    note:      cleanString(input.note, 300),
    receivedAt,
  };
}

async function getPaymentSummary(invoiceId) {
  const rows = await OfflinePayment.find({ invoiceId }).sort({ createdAt: 1 }).lean();
  const receipts = rows.filter((r) => r.kind === 'RECEIPT');
  const reversals = rows.filter((r) => r.kind === 'REVERSAL');
  const totalReceived   = receipts.reduce((s, r) => s + (r.amount || 0), 0);
  const totalReversed   = reversals.reduce((s, r) => s + (r.amount || 0), 0);
  const netReceived     = Math.round((totalReceived - totalReversed) * 100) / 100;
  return {
    payments: rows,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalReversed: Math.round(totalReversed * 100) / 100,
    netReceived,
  };
}

async function recalculateInvoiceBalance(invoiceId, grandTotal) {
  const { netReceived } = await getPaymentSummary(invoiceId);
  const outstanding = Math.max(0, Math.round((grandTotal - netReceived) * 100) / 100);
  const paymentType = outstanding === 0 ? 'FULL' : netReceived > 0 ? 'PARTIAL' : 'REMAINING';
  await Invoice.findByIdAndUpdate(invoiceId, {
    $set: {
      amountPaid: netReceived,
      outstandingAfter: outstanding,
      paymentType,
    },
  });
  return { netReceived, outstanding, paymentType };
}

/* ── GET /api/admin/manual-billing/registrations ───────────────────────────── */
exports.listBillingRegistrations = async (req, res, next) => {
  try {
    const registrations = await billingRegistrations.getActiveRegistrations();
    const fallbackInUse = registrations.some((r) => r.isFallback);
    res.json({
      success: true,
      registrations,
      fallbackInUse,
      warning: fallbackInUse
        ? 'No company billing registration is configured. The recommended fallback is shown and must be confirmed before issuing a tax invoice.'
        : '',
    });
  } catch (err) { next(err); }
};

/* ── POST /api/admin/manual-billing/preview ────────────────────────────────── */
exports.previewManualBill = async (req, res, next) => {
  try {
    const { items, customerState, registrationId } = req.body || {};
    const registration = await billingRegistrations.resolveRegistration(registrationId);
    const computed = await calculateManualBillLines(items);
    const bill = buildManualBill({
      computedLines: computed.lines,
      customerState: customerState || '',
      sellerState:   registration.state,
    });

    res.json({
      success: true,
      registration,
      lines: bill.lines,
      totals: {
        grossTotal:    bill.grossTotal,
        discountTotal: bill.discountTotal,
        taxableValue:  bill.taxableValue,
        totalTax:      bill.totalTax,
        grandTotal:    bill.grandTotal,
      },
      gstBreakdown: bill.gstBreakdown,
      requiresTaxIdentityConfirmation: Boolean(registration.isFallback),
    });
  } catch (err) { next(err); }
};

/* ── POST /api/admin/manual-billing/invoices ───────────────────────────────── */
exports.createManualInvoice = async (req, res, next) => {
  try {
    const body = req.body || {};
    const idempotencyKey = cleanString(body.idempotencyKey, 128);
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw badRequest('idempotencyKey is required (minimum 8 characters)');
    }

    // Idempotent replay — return the already-finalized document untouched.
    const existing = await Invoice.findOne({ idempotencyKey, source: 'manual' }).lean();
    if (existing) {
      const summary = await getPaymentSummary(existing._id);
      return res.json({ success: true, invoice: existing, paymentSummary: summary, idempotentReplay: true });
    }

    const registration = await billingRegistrations.resolveRegistration(body.registrationId);
    if (registration.isFallback && body.taxIdentityConfirmed !== true) {
      throw badRequest(
        'The company billing registration is an unconfigured fallback. Configure it in System Settings or explicitly confirm it (taxIdentityConfirmed: true) before finalizing a tax invoice.'
      );
    }

    const customer = await buildCustomerContext(body.customer);
    const computed = await calculateManualBillLines(body.items);
    const bill = buildManualBill({
      computedLines: computed.lines,
      customerState: customer.state,
      sellerState:   registration.state,
    });
    const payment = validatePaymentInput(body.payment, bill.grandTotal);

    // Stock pre-check (does not mutate) — only for lines linked to a product.
    const deductStock = body.deductStock !== false;
    if (deductStock) {
      const stockErrors = [];
      const productIds = bill.lines.map((l) => l.productId);
      const products = await Product.find({ _id: { $in: productIds } }).lean();
      const byId = new Map(products.map((p) => [String(p._id), p]));
      for (const line of bill.lines) {
        const product = byId.get(String(line.productId));
        if (!product) continue;
        if (line.variantId) {
          const v = (product.variants || []).find((x) => String(x.variantId) === line.variantId);
          if (!v || (v.stock || 0) < line.quantity) {
            stockErrors.push(`${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ''}: insufficient stock`);
          }
        } else if ((product.stock || 0) < line.quantity) {
          stockErrors.push(`${line.name}: insufficient stock`);
        }
      }
      if (stockErrors.length) throw badRequest('Insufficient stock', stockErrors);
    }

    const invoiceNumber = await generateInvoiceNumberForSeries(MANUAL_SERIES);
    const sellerSnapshot = {
      registrationId: registration.id,
      legalName:      registration.legalName,
      gstin:          registration.gstin,
      pan:            registration.pan || '',
      address:        registration.address || '',
      state:          registration.state,
      stateCode:      registration.stateCode || (registration.gstin || '').slice(0, 2),
      isFallback:     Boolean(registration.isFallback),
      taxIdentityConfirmed: Boolean(registration.isFallback) ? body.taxIdentityConfirmed === true : true,
    };

    const paidNow = payment ? payment.amount : 0;
    const outstanding = Math.max(0, Math.round((bill.grandTotal - paidNow) * 100) / 100);

    let invoice;
    try {
      invoice = await Invoice.create({
        invoiceNumber,
        source: 'manual',
        bookingId: null,
        customerId: customer.customerId,
        bookingNumber: '',
        customerName:    customer.name,
        customerPhone:   customer.phone,
        customerEmail:   customer.email,
        customerAddress: customer.address,
        customerPincode: customer.pincode,
        customerState:   customer.state,
        customerCity:    customer.city,
        lineItems: bill.lines,
        sellerRegistrationId: registration.id,
        sellerSnapshot,
        invoiceDate: new Date(),
        paymentType: outstanding === 0 && paidNow > 0 ? 'FULL' : paidNow > 0 ? 'PARTIAL' : 'REMAINING',
        paymentGateway: 'offline',
        merchantTransactionId: '',
        gatewayTransactionId: '',
        amountPaid: paidNow,
        previouslyPaid: 0,
        outstandingAfter: outstanding,
        grandTotal: bill.grandTotal,
        totalGST: bill.totalTax,
        gstBreakdown: bill.gstBreakdown,
        generatedBy: 'admin',
        createdBy: req.user._id,
        ipAddress: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '',
        idempotencyKey,
        stockDeducted: false,
        stockRestored: false,
      });
    } catch (err) {
      if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey) {
        const winner = await Invoice.findOne({ idempotencyKey, source: 'manual' }).lean();
        if (winner) {
          const summary = await getPaymentSummary(winner._id);
          return res.json({ success: true, invoice: winner, paymentSummary: summary, idempotentReplay: true });
        }
      }
      if (err && err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNumber) {
        throw badRequest('Invoice number collision — please retry (the number was consumed and will never be reused)');
      }
      throw err;
    }

    let paymentRecord = null;
    if (payment && payment.amount > 0) {
      try {
        paymentRecord = await OfflinePayment.create({
          invoiceId: invoice._id,
          amount: payment.amount,
          method: payment.method,
          kind: 'RECEIPT',
          reference: payment.reference,
          note: payment.note,
          receivedAt: payment.receivedAt || new Date(),
          recordedBy: req.user._id,
          recordedByName: req.user.name || '',
          idempotencyKey: `${idempotencyKey}:receipt:1`,
          status: 'active',
        });
      } catch (paymentErr) {
        // Recover: never leave a paid invoice without its receipt.
        invoice.status = 'cancelled';
        invoice.cancelledAt = new Date();
        invoice.cancelledBy = req.user._id;
        invoice.cancelReason = 'Automatic cancellation: offline receipt could not be persisted';
        await invoice.save().catch(() => {});
        throw paymentErr;
      }
    }

    // Deduct stock exactly once (atomic flag guard), restoring on failure.
    if (deductStock) {
      const claimed = await Invoice.findOneAndUpdate(
        { _id: invoice._id, stockDeducted: { $ne: true } },
        { $set: { stockDeducted: true } },
        { new: true }
      );
      if (claimed) {
        const { ok, failures } = await deductManualSaleStock(bill.lines, invoice._id, req.user._id);
        if (!ok) {
          // Concurrent sale won the stock after the pre-check → reverse any
          // partial deduction and cancel this invoice (number is consumed).
          await restoreManualSaleStock(bill.lines, invoice._id, req.user._id).catch(() => {});
          await Invoice.findByIdAndUpdate(invoice._id, {
            $set: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancelledBy: req.user._id,
              cancelReason: 'Automatic cancellation: stock became unavailable at finalization',
              stockRestored: true,
            },
          });
          throw badRequest('Insufficient stock at finalization — the sale was not completed', failures);
        }
      }
    }

    audit(req, {
      module: 'invoice', action: 'create_manual_invoice', severity: 'info',
      targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber,
      targetPhone: invoice.customerPhone || '',
      newValues: {
        source: 'manual',
        grandTotal: bill.grandTotal,
        amountPaid: paidNow,
        paymentMethod: payment ? payment.method : null,
        registrationId: registration.id,
        gstin: registration.gstin,
        lineCount: bill.lines.length,
        stockDeducted: Boolean(deductStock),
      },
      note: 'Manual offline-sale invoice finalized',
    }).catch(() => {});

    if (paymentRecord) {
      audit(req, {
        module: 'invoice', action: 'record_offline_payment', severity: 'info',
        targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber,
        newValues: { amount: paymentRecord.amount, method: paymentRecord.method, kind: 'RECEIPT' },
      }).catch(() => {});
    }

    const saved = await Invoice.findById(invoice._id).lean();
    const summary = await getPaymentSummary(invoice._id);
    res.status(201).json({ success: true, invoice: saved, paymentSummary: summary });
  } catch (err) { next(err); }
};

/* ── POST /api/admin/manual-billing/invoices/:id/payments ──────────────────── */
exports.recordOfflinePayment = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, source: 'manual' });
    if (!invoice) return res.status(404).json({ success: false, message: 'Manual invoice not found' });
    if (invoice.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot record a payment against a non-active invoice' });
    }

    const body = req.body || {};
    const idempotencyKey = cleanString(body.idempotencyKey, 128);
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw badRequest('idempotencyKey is required (minimum 8 characters)');
    }

    const existing = await OfflinePayment.findOne({ idempotencyKey }).lean();
    if (existing) {
      const summary = await getPaymentSummary(invoice._id);
      return res.json({ success: true, payment: existing, paymentSummary: summary, idempotentReplay: true });
    }

    const { outstandingAfter } = invoice;
    const payment = validatePaymentInput(body.payment || body, outstandingAfter);
    if (!payment || payment.amount <= 0) {
      throw badRequest('A positive received amount is required');
    }

    // Atomically reserve the amount against the outstanding balance so two
    // concurrent receipts can never overpay the invoice. Rolled back if the
    // immutable receipt row cannot be written.
    const reserved = await Invoice.findOneAndUpdate(
      {
        _id: invoice._id,
        source: 'manual',
        status: 'active',
        outstandingAfter: { $gte: payment.amount },
      },
      {
        $inc: {
          amountPaid: payment.amount,
          outstandingAfter: -payment.amount,
        },
      },
      { new: true }
    );
    if (!reserved) {
      throw badRequest('Payment exceeds the outstanding balance (or the invoice changed concurrently)');
    }

    let record;
    try {
      record = await OfflinePayment.create({
        invoiceId: invoice._id,
        amount: payment.amount,
        method: payment.method,
        kind: 'RECEIPT',
        reference: payment.reference,
        note: payment.note,
        receivedAt: payment.receivedAt || new Date(),
        recordedBy: req.user._id,
        recordedByName: req.user.name || '',
        idempotencyKey,
        status: 'active',
      });
    } catch (err) {
      // Roll the reservation back — no money record, no balance change.
      await Invoice.findByIdAndUpdate(invoice._id, {
        $inc: { amountPaid: -payment.amount, outstandingAfter: payment.amount },
      }).catch(() => {});
      throw err;
    }

    const balance = await recalculateInvoiceBalance(invoice._id, invoice.grandTotal);

    audit(req, {
      module: 'invoice', action: 'record_offline_payment', severity: 'info',
      targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber,
      newValues: { amount: record.amount, method: record.method, kind: 'RECEIPT', outstandingAfter: balance.outstanding },
    }).catch(() => {});

    const summary = await getPaymentSummary(invoice._id);
    res.status(201).json({ success: true, payment: record, paymentSummary: summary });
  } catch (err) { next(err); }
};

/* ── GET /api/admin/manual-billing/invoices/:id/payments ───────────────────── */
exports.getInvoicePayments = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, source: 'manual' }).lean();
    if (!invoice) return res.status(404).json({ success: false, message: 'Manual invoice not found' });
    const summary = await getPaymentSummary(invoice._id);
    res.json({ success: true, invoice, ...summary });
  } catch (err) { next(err); }
};

/* ── POST /api/admin/manual-billing/payments/:id/reverse ───────────────────── */
exports.reverseOfflinePayment = async (req, res, next) => {
  try {
    const original = await OfflinePayment.findById(req.params.id);
    if (!original) return res.status(404).json({ success: false, message: 'Offline payment not found' });
    if (original.kind !== 'RECEIPT') {
      return res.status(400).json({ success: false, message: 'Only a receipt can be reversed' });
    }
    if (original.status === 'reversed') {
      return res.status(400).json({ success: false, message: 'This receipt has already been reversed' });
    }

    const invoice = await Invoice.findOne({ _id: original.invoiceId, source: 'manual' });
    if (!invoice) return res.status(404).json({ success: false, message: 'Manual invoice not found' });
    if (invoice.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot reverse a payment on a non-active invoice' });
    }

    const reason = cleanString(req.body?.reason, 300);
    if (!reason) throw badRequest('A reason is required to reverse an offline payment');

    let reversal;
    try {
      reversal = await OfflinePayment.create({
        invoiceId: original.invoiceId,
        amount: original.amount,
        method: original.method,
        kind: 'REVERSAL',
        reversesPaymentId: original._id,
        reference: original.reference,
        note: reason,
        receivedAt: new Date(),
        recordedBy: req.user._id,
        recordedByName: req.user.name || '',
        idempotencyKey: `reversal:${original._id}`,
        status: 'active',
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(400).json({ success: false, message: 'This receipt has already been reversed' });
      }
      throw err;
    }

    const balance = await recalculateInvoiceBalance(invoice._id, invoice.grandTotal);

    audit(req, {
      module: 'invoice', action: 'reverse_offline_payment', severity: 'warning',
      targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber,
      oldValues: { paymentStatus: original.status },
      newValues: { kind: 'REVERSAL', amount: reversal.amount, reason, outstandingAfter: balance.outstanding },
      note: reason,
    }).catch(() => {});

    const summary = await getPaymentSummary(invoice._id);
    res.status(201).json({ success: true, reversal, paymentSummary: summary });
  } catch (err) { next(err); }
};

/* ── GET /api/admin/manual-billing/products?search= ────────────────────────── */
// Minimal catalog lookup for the billing form — active, non-deleted products
// only, with the variant/stock/tax shape the calculator consumes server-side.
exports.searchProducts = async (req, res, next) => {
  try {
    const search = cleanString(req.query.search, 100);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const query = { isDeleted: { $ne: true }, isActive: true };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ name: re }, { sku: re }, { category: re }];
    }
    const products = await Product.find(query)
      .select('name sku category price salePrice stock variants taxRate')
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    res.json({ success: true, products });
  } catch (err) { next(err); }
};

/* ── Helpers exported for tests / reuse ────────────────────────────────────── */
exports._private = {
  normalizeMethod,
  validateCustomerInput,
  validatePaymentInput,
  getPaymentSummary,
  recalculateInvoiceBalance,
  PAYMENT_METHODS,
  MANUAL_SERIES,
  ManualBillValidationError,
};
