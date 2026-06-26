const InvoiceCounter = require('../models/InvoiceCounter');
const Invoice        = require('../models/Invoice');
const PaymentLedger  = require('../models/PaymentLedger');

// Must match the company's registered state for IGST vs CGST+SGST determination.
const COMPANY_STATE_KEYS = ['uttarpradesh', 'up', 'uttar pradesh'];

// ── Atomic sequential invoice number ─────────────────────────────────────────
async function generateInvoiceNumber() {
  const year    = new Date().getFullYear();
  const counter = await InvoiceCounter.findOneAndUpdate(
    { year },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `INV-${year}-${String(counter.seq).padStart(6, '0')}`;
}

// ── GST split helper ──────────────────────────────────────────────────────────
function buildGstBreakdown(totalGST, customerState = '') {
  const cs = customerState.toLowerCase().replace(/\s+/g, '');
  const isInterstate = !COMPANY_STATE_KEYS.includes(cs);
  return isInterstate
    ? { igst: totalGST, cgst: 0,          sgst: 0,          isInterstate: true  }
    : { igst: 0,        cgst: totalGST / 2, sgst: totalGST / 2, isInterstate: false };
}

/**
 * Creates a new Invoice for a successful payment.
 *
 * IDEMPOTENT — calling this multiple times with the same ledger._id is safe.
 * Returns the existing invoice if one already exists for that ledger entry.
 *
 * IMPORTANT: booking.amountPaid and booking.remainingAmount must ALREADY be updated
 * to reflect this payment before calling this function.
 *
 * @param {Object} booking   – Mongoose Booking document (already saved with new amountPaid)
 * @param {Object} ledger    – PaymentLedger document (paymentStatus === 'SUCCESS')
 * @param {string} poojaName – Display name of the pooja service
 * @returns {Promise<Invoice|null>}
 */
async function generateInvoiceForPayment(booking, ledger, poojaName = '') {
  try {
    // Idempotency guard — prevents duplicate invoices on retry / webhook replay
    if (ledger._id) {
      const existing = await Invoice.findOne({ paymentLedgerId: ledger._id });
      if (existing) return existing;
    }

    const invoiceNumber   = await generateInvoiceNumber();
    const totalGST        = (booking.kitGST || 0) + (booking.platformGST || 0);
    const gstBreakdown    = buildGstBreakdown(totalGST, booking.userDetails?.state || '');

    // booking.amountPaid already includes this ledger.amount
    const previouslyPaid   = Math.max(0, (booking.amountPaid || 0) - ledger.amount);
    const outstandingAfter = Math.max(0, booking.remainingAmount || 0);

    const invoice = await Invoice.create({
      invoiceNumber,
      bookingId:             booking._id,
      paymentLedgerId:       ledger._id || null,
      customerId:            booking.userId,
      bookingNumber:         booking.bookingNumber,
      poojaName,
      scheduledDate:         booking.scheduledDate,
      scheduledTime:         booking.scheduledTime,
      customerName:          booking.userDetails?.name    || '',
      customerPhone:         booking.userDetails?.phone   || '',
      customerEmail:         booking.userDetails?.email   || '',
      customerAddress:       booking.userDetails?.address || '',
      customerPincode:       booking.userDetails?.pincode || '',
      customerState:         booking.userDetails?.state   || '',
      customerCity:          booking.userDetails?.city    || '',
      invoiceDate:           ledger.paidAt || new Date(),
      paymentType:           ledger.paymentType,
      paymentGateway:        'phonepe',
      merchantTransactionId: ledger.merchantTransactionId || '',
      gatewayTransactionId:  ledger.phonePeTransactionId  || '',
      amountPaid:            ledger.amount,
      previouslyPaid,
      outstandingAfter,
      grandTotal:   booking.grandTotal   || 0,
      poojaAmount:  booking.poojaAmount  || 0,
      kitAmount:    booking.kitAmount    || 0,
      kitGST:       booking.kitGST       || 0,
      platformFee:  booking.platformFee  || 0,
      platformGST:  booking.platformGST  || 0,
      totalGST,
      gstBreakdown,
      generatedBy: 'system',
    });

    // Back-link the ledger entry to its invoice
    if (ledger._id) {
      await PaymentLedger.findByIdAndUpdate(ledger._id, { invoiceId: invoice._id });
    }

    return invoice;
  } catch (err) {
    // Invoice generation is non-fatal — payments must not be blocked by this
    console.error('[InvoiceGenerator] Failed to create invoice:', err.message);
    return null;
  }
}

/**
 * On-demand migration: creates Invoice records from existing PaymentLedger entries
 * for bookings that predate the Invoice model. Idempotent.
 *
 * @param {Object} booking – populated Booking document (poojaId.name should be populated)
 * @returns {Promise<Invoice[]>}
 */
async function getOrCreateLegacyInvoices(booking) {
  // First try: return any invoices that already exist
  const existing = await Invoice.find({ bookingId: booking._id }).sort({ invoiceDate: 1 }).lean();
  if (existing.length) return existing;

  const ledgers = await PaymentLedger.find({
    bookingId:     booking._id,
    paymentStatus: 'SUCCESS',
  }).sort({ createdAt: 1 });

  const created = [];

  if (ledgers.length) {
    let cumulativePaid = 0;
    for (const ledger of ledgers) {
      // Skip if already linked
      const exists = await Invoice.findOne({ paymentLedgerId: ledger._id });
      if (exists) { cumulativePaid += ledger.amount; created.push(exists); continue; }

      const invoiceNumber = await generateInvoiceNumber();
      const totalGST      = (booking.kitGST || 0) + (booking.platformGST || 0);
      const gstBreakdown  = buildGstBreakdown(totalGST, booking.userDetails?.state || '');

      const inv = await Invoice.create({
        invoiceNumber,
        bookingId:             booking._id,
        paymentLedgerId:       ledger._id,
        customerId:            booking.userId,
        bookingNumber:         booking.bookingNumber,
        poojaName:             booking.poojaId?.name || '',
        scheduledDate:         booking.scheduledDate,
        scheduledTime:         booking.scheduledTime,
        customerName:          booking.userDetails?.name    || '',
        customerPhone:         booking.userDetails?.phone   || '',
        customerEmail:         booking.userDetails?.email   || '',
        customerAddress:       booking.userDetails?.address || '',
        customerPincode:       booking.userDetails?.pincode || '',
        customerState:         booking.userDetails?.state   || '',
        customerCity:          booking.userDetails?.city    || '',
        invoiceDate:           ledger.paidAt || ledger.createdAt,
        paymentType:           ledger.paymentType,
        paymentGateway:        'phonepe',
        merchantTransactionId: ledger.merchantTransactionId || '',
        gatewayTransactionId:  ledger.phonePeTransactionId  || '',
        amountPaid:            ledger.amount,
        previouslyPaid:        cumulativePaid,
        outstandingAfter:      Math.max(0, (booking.grandTotal || 0) - cumulativePaid - ledger.amount),
        grandTotal:  booking.grandTotal  || 0,
        poojaAmount: booking.poojaAmount || 0,
        kitAmount:   booking.kitAmount   || 0,
        kitGST:      booking.kitGST      || 0,
        platformFee: booking.platformFee || 0,
        platformGST: booking.platformGST || 0,
        totalGST,
        gstBreakdown,
        generatedBy: 'migration',
        isLegacy:    true,
      });

      await PaymentLedger.findByIdAndUpdate(ledger._id, { invoiceId: inv._id });
      cumulativePaid += ledger.amount;
      created.push(inv);
    }
  } else if (booking.amountPaid > 0 || booking.status !== 'pending_payment') {
    // Very old bookings with no PaymentLedger — synthesize one invoice from booking fields
    const invoiceNumber = await generateInvoiceNumber();
    const totalGST      = (booking.kitGST || 0) + (booking.platformGST || 0);
    const gstBreakdown  = buildGstBreakdown(totalGST, booking.userDetails?.state || '');
    const amtPaid       = booking.amountPaid || booking.grandTotal || booking.amount || 0;

    const inv = await Invoice.create({
      invoiceNumber,
      bookingId:             booking._id,
      paymentLedgerId:       null,
      customerId:            booking.userId,
      bookingNumber:         booking.bookingNumber,
      poojaName:             booking.poojaId?.name || '',
      scheduledDate:         booking.scheduledDate,
      scheduledTime:         booking.scheduledTime,
      customerName:          booking.userDetails?.name    || '',
      customerPhone:         booking.userDetails?.phone   || '',
      customerEmail:         booking.userDetails?.email   || '',
      customerAddress:       booking.userDetails?.address || '',
      customerPincode:       booking.userDetails?.pincode || '',
      customerState:         booking.userDetails?.state   || '',
      customerCity:          booking.userDetails?.city    || '',
      invoiceDate:           booking.updatedAt || booking.createdAt,
      paymentType:           'FULL',
      paymentGateway:        'phonepe',
      merchantTransactionId: booking.phonePeMerchantTransactionId || '',
      gatewayTransactionId:  booking.phonePeTransactionId || '',
      amountPaid:            amtPaid,
      previouslyPaid:        0,
      outstandingAfter:      Math.max(0, (booking.grandTotal || booking.amount || 0) - amtPaid),
      grandTotal:  booking.grandTotal  || booking.amount || 0,
      poojaAmount: booking.poojaAmount || 0,
      kitAmount:   booking.kitAmount   || 0,
      kitGST:      booking.kitGST      || 0,
      platformFee: booking.platformFee || 0,
      platformGST: booking.platformGST || 0,
      totalGST,
      gstBreakdown,
      generatedBy: 'migration',
      isLegacy:    true,
    });
    created.push(inv);
  }

  return created;
}

module.exports = { generateInvoiceForPayment, getOrCreateLegacyInvoices };
