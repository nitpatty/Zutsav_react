const crypto  = require('crypto');
const bcrypt   = require('bcryptjs');

const Booking       = require('../models/Booking');
const Referral      = require('../models/Referral');
const PaymentLedger = require('../models/PaymentLedger');
const Pooja         = require('../models/Pooja');
const Pandit        = require('../models/Pandit');
const Kit           = require('../models/Kit');
const User          = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');
const { isAdminRole } = require('../utils/roleUtils');

const { createOrder, verifySignature }                                        = require('../utils/razorpay');
const { createPhonePeOrder, checkPhonePeStatus, verifyWebhookChecksum }       = require('../utils/phonepe');
const { recordAttemptInitiated, recordAttemptResult }                         = require('../utils/paymentAttempts');
const settings                                                                = require('../utils/settingsService');
const { urls }                                                                = require('../config');
const { generateInvoiceForPayment }  = require('../utils/invoiceGenerator');
const { calculateRefundBreakdown }   = require('../utils/refundEngine');
const { NotificationEngine }         = require('../../notification-engine');
const { calculatePricing: calcPricing, roundToPaise } = require('../utils/financeUtils');
const { normalizeBookingPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const { resolveApprovedPayoutAmount } = require('../utils/payoutUtils');
const OtpService = require('../../notification-engine/otp/OtpService');

// ── Pricing engine (delegates to the centralized financeUtils engine) ─────────
async function calculatePricing(pooja, kitPrice = 0) {
  const commissionType  = await settings.get('platformCommissionType', 'percent');
  const commissionPct   = await settings.get('platformCommissionPercent', 0);
  const commissionFixed = await settings.get('platformCommissionFixed', 0);
  const gstPct          = await settings.get('platformGstPercent', 0);

  const poojaPrice = typeof pooja === 'number' ? pooja : (pooja.salePrice || pooja.price || 0);

  return calcPricing({
    poojaPrice,
    kitPrice,
    commissionPercent: commissionPct,
    commissionFixed,
    commissionType,
    gstPercent: gstPct,
  });
}

async function resolveKitPrice(kitId, isUrgent) {
  if (isUrgent || !kitId) return { kitPrice: 0, resolvedKitId: null };
  const kit = await Kit.findById(kitId).select('discountPrice isActive');
  if (!kit || !kit.isActive) return { kitPrice: 0, resolvedKitId: null };
  return { kitPrice: kit.discountPrice || 0, resolvedKitId: kitId };
}

// ── Partial payment config ─────────────────────────────────────────────────────
async function getPartialPaymentConfig() {
  const enabled   = await settings.get('partialPaymentEnabled',   false);
  const minAmount = await settings.get('partialPaymentMinAmount', 500);
  const mode      = await settings.get('partialPaymentMode',      'fixed');
  const options   = await settings.get('partialPaymentOptions',   [500, 1000, 1500]);
  return { enabled, minAmount, mode, options };
}

// Validate + resolve the actual charge amount for a payment request.
async function resolveChargeAmount(grandTotal, paymentMode, partialAmount) {
  if (paymentMode !== 'PARTIAL') return { chargeAmount: grandTotal, paymentType: 'FULL' };

  const { enabled, minAmount } = await getPartialPaymentConfig();
  if (!enabled) throw Object.assign(new Error('Partial payment is not enabled'), { status: 400 });

  const charge = roundToPaise(Number(partialAmount) || 0);
  if (charge < minAmount) throw Object.assign(
    new Error(`Minimum partial payment is ₹${minAmount}`), { status: 400 }
  );
  if (charge >= grandTotal) throw Object.assign(
    new Error('Partial amount must be less than the grand total'), { status: 400 }
  );
  if (grandTotal - charge < 1) throw Object.assign(
    new Error('Remaining amount cannot be zero'), { status: 400 }
  );

  return { chargeAmount: charge, paymentType: 'PARTIAL' };
}

// ── Post-payment referral link-up ──────────────────────────────────────────────

async function fireReferralNotifications(booking, poojaName) {
  try {
    const ref = booking.referral;
    if (!ref?.referralId) return;

    const referral = await Referral.findById(ref.referralId);
    if (!referral) return;

    // Advance referral: BOOKED → PENDING_REMARK
    referral.bookingId = booking._id;
    referral.status    = 'PENDING_REMARK';
    referral.statusHistory.push({ status: 'BOOKED',         note: 'Payment confirmed' });
    referral.statusHistory.push({ status: 'PENDING_REMARK', note: 'Awaiting pandit mandatory remark' });
    await referral.save();

    const refPandit = await Pandit.findById(referral.panditId).select('userId name phone email');

    const payload = normalizeBookingPayload({ booking, pandit: refPandit, poojaName });

    NotificationEngine.emit('REFERRAL_BOOKING_CREATED', payload).catch(() => {});
    NotificationEngine.emit('REFERRAL_PENDING_REMARK',  payload).catch(() => {});
  } catch { /* non-fatal */ }
}

async function onPaymentSuccess(booking, poojaName) {
  const payload = normalizeBookingPayload({ booking, poojaName });

  NotificationEngine.emit('PAYMENT_SUCCESS',    payload).catch(() => {});
  NotificationEngine.emit('BOOKING_CONFIRMED',  payload).catch(() => {});
  fireReferralNotifications(booking, poojaName).catch(() => {});
}

async function onPartialPaymentSuccess(booking, poojaName) {
  const payload = normalizeBookingPayload({ booking, poojaName });
  NotificationEngine.emit('PARTIAL_PAYMENT_RECEIVED', payload).catch(() => {});
}

async function onFinalPaymentSuccess(booking, poojaName) {
  const payload = normalizeBookingPayload({ booking, poojaName });
  NotificationEngine.emit('FINAL_PAYMENT_RECEIVED', payload).catch(() => {});
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/bookings/create-order  (Razorpay — legacy)
exports.createBookingOrder = async (req, res, next) => {
  try {
    const { poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId } = req.body;

    const pooja = await Pooja.findById(poojaId);
    if (!pooja || !pooja.isActive) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const pricing   = await calculatePricing(pooja);
    const rpOrder   = await createOrder(pricing.finalAmount, 'INR', `booking_${Date.now()}`);

    const booking = await Booking.create({
      userId: req.user._id,
      poojaId,
      scheduledDate:   new Date(scheduledDate),
      scheduledTime,
      language:        language || 'Hindi',
      specialNote,
      userDetails,
      ...pricing,
      amount:          pricing.finalAmount,
      grandTotal:      pricing.grandTotal,
      amountPaid:      0,
      remainingAmount: 0,
      paymentMode:     'FULL',
      paymentStatus:   'PENDING',
      razorpayOrderId: rpOrder.id,
      status:          'pending_payment',
      isUrgent:        isUrgent === true || isUrgent === 'true',
      withKit:         withKit  === true || withKit  === 'true',
      kitId:           kitId || null,
    });

    res.status(201).json({
      success: true, booking,
      razorpayOrder: { id: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency, keyId: process.env.RAZORPAY_KEY_ID },
      pricing,
    });
  } catch (err) { next(err); }
};

// POST /api/bookings/verify-payment  (Razorpay — legacy)
exports.verifyPayment = async (req, res, next) => {
  try {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const isValid = verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) return res.status(400).json({ success: false, message: 'Payment verification failed' });

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        status: 'paid', razorpayPaymentId, razorpaySignature,
        paymentStatus: 'FULLY_PAID', amountPaid: 0, remainingAmount: 0, // legacy: backfill
      },
      { new: true }
    ).populate('poojaId', 'name');

    // Backfill amountPaid for legacy Razorpay bookings
    if (booking && booking.amountPaid === 0) {
      booking.amountPaid      = booking.grandTotal || booking.amount || 0;
      booking.remainingAmount = 0;
      await booking.save();
    }

    await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
    await onPaymentSuccess(booking, booking.poojaId?.name || '');

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

// POST /api/bookings/create-phonepe-order
exports.createPhonePeBooking = async (req, res, next) => {
  try {
    const {
      poojaId, scheduledDate, scheduledTime, language, specialNote,
      userDetails, isUrgent, withKit, kitId,
      paymentMode = 'FULL', partialAmount,
      referralToken,
    } = req.body;

    const urgent = isUrgent === true || isUrgent === 'true';

    const pooja = await Pooja.findById(poojaId);
    if (!pooja || !pooja.isActive) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const { kitPrice, resolvedKitId } = await resolveKitPrice(kitId, urgent);
    const pricing               = await calculatePricing(pooja, kitPrice);
    const merchantTransactionId = `ZUT_${Date.now()}_${req.user._id.toString().slice(-6)}`;
    const clientUrl             = urls.clientUrl;

    const pMode = String(paymentMode).toUpperCase() === 'PARTIAL' ? 'PARTIAL' : 'FULL';
    let chargeAmount, paymentType;
    try {
      ({ chargeAmount, paymentType } = await resolveChargeAmount(pricing.grandTotal, pMode, partialAmount));
    } catch (err) {
      return res.status(err.status || 400).json({ success: false, message: err.message });
    }

    // ── Validate referral token (backend-only; never trust raw IDs from frontend) ──
    let resolvedReferral = {};
    if (referralToken) {
      const referral = await Referral.findOne({
        token:     referralToken,
        expiresAt: { $gt: new Date() },
        status:    { $nin: ['BOOKED','PENDING_REMARK','REMARK_SUBMITTED','ADMIN_REVIEW','ASSIGNED','COMPLETED','SETTLED'] },
      });
      if (referral) {
        resolvedReferral = {
          referralId:        referral._id,
          referringPanditId: referral.panditId,
          referralToken,
        };
      }
    }

    const booking = await Booking.create({
      userId:        req.user._id,
      poojaId,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      language:      language || 'Hindi',
      specialNote,
      userDetails,
      poojaAmount:      pricing.poojaAmount,
      kitAmount:        pricing.kitAmount,
      kitGST:           pricing.kitGST,
      platformFee:      pricing.platformFee,
      platformGST:      pricing.platformGST,
      taxAmount:        pricing.kitGST,
      grandTotal:       pricing.grandTotal,
      baseAmount:       pricing.baseAmount,
      commissionPercent:pricing.commissionPercent,
      commissionAmount: pricing.commissionAmount,
      gstPercent:       pricing.gstPercent,
      gstAmount:        pricing.gstAmount,
      amount:           pricing.grandTotal,
      paymentMode:      pMode,
      paymentStatus:    'PENDING',
      amountPaid:       0,
      remainingAmount:  pricing.grandTotal,
      paymentProvider:              'phonepe',
      phonePeMerchantTransactionId: merchantTransactionId,
      status:                       'pending_payment',
      bookingType:     urgent ? 'urgent' : 'normal',
      isUrgent:        urgent,
      withKit:         !!resolvedKitId,
      kitId:           resolvedKitId,
      referral:        resolvedReferral,
    });

    // Record in ledger
    await PaymentLedger.create({
      bookingId:             booking._id,
      amount:                chargeAmount,
      paymentType,
      paymentStatus:         'PENDING',
      merchantTransactionId,
    });

    recordAttemptInitiated(booking, { merchantTransactionId, amount: chargeAmount, paymentType });
    await booking.save();

    const { redirectUrl } = await createPhonePeOrder({
      merchantTransactionId,
      amount:      chargeAmount,
      userId:      req.user._id,
      redirectUrl: `${clientUrl}/payment-callback/${merchantTransactionId}`,
      callbackUrl: `${urls.serverUrl}/api/bookings/phonepe-webhook`,
    });

    res.status(201).json({
      success: true, booking, redirectUrl, merchantTransactionId, pricing,
      paymentMode: pMode, chargeAmount, remainingAmount: pricing.grandTotal - chargeAmount,
    });
  } catch (err) { next(err); }
};

// GET /api/bookings/verify-phonepe/:merchantTransactionId
exports.verifyPhonePePayment = async (req, res, next) => {
  try {
    const { merchantTransactionId } = req.params;
    const booking = await Booking.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
      .populate('poojaId', 'name');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Already fully processed
    if (['FULLY_PAID', 'PARTIALLY_PAID'].includes(booking.paymentStatus) && booking.status === 'paid') {
      return res.json({ success: true, booking, alreadyVerified: true });
    }

    const result = await checkPhonePeStatus(merchantTransactionId);

    if (result.success) {
      // Look up ledger to know exact charged amount
      const ledger = await PaymentLedger.findOne({ merchantTransactionId });
      const chargedAmount = ledger?.amount ?? booking.grandTotal;
      const remaining     = booking.grandTotal - chargedAmount;

      booking.status               = 'paid';
      booking.phonePeTransactionId = result.transactionId;
      booking.amountPaid           = chargedAmount;
      booking.remainingAmount      = remaining;
      booking.paymentStatus        = remaining > 0 ? 'PARTIALLY_PAID' : 'FULLY_PAID';
      await recordAttemptResult(booking, merchantTransactionId, { status: 'SUCCESS' }, booking.poojaId?.name || '');
      await booking.save();

      if (ledger) {
        ledger.paymentStatus        = 'SUCCESS';
        ledger.phonePeTransactionId = result.transactionId;
        ledger.paidAt               = new Date();
        await ledger.save();
        await generateInvoiceForPayment(booking, ledger, booking.poojaId?.name || '');
      }

      await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });

      if (booking.paymentStatus === 'PARTIALLY_PAID') {
        await onPartialPaymentSuccess(booking, booking.poojaId?.name || '');
      } else {
        await onPaymentSuccess(booking, booking.poojaId?.name || '');
      }

      return res.json({ success: true, booking });
    }

    // Mark ledger + booking as failed if payment failed (not pending)
    if (result.state && result.state !== 'PENDING') {
      const ledger = await PaymentLedger.findOne({ merchantTransactionId });
      if (ledger && ledger.paymentStatus === 'PENDING') {
        ledger.paymentStatus = 'FAILED';
        await ledger.save();
      }
      await recordAttemptResult(booking, merchantTransactionId, {
        status: 'FAILED', gatewayCode: result.code, gatewayState: result.state,
        failureReason: result.code || result.state || 'Payment failed',
      }, booking.poojaId?.name || '');
      await booking.save();
    }

    res.json({ success: false, code: result.code, state: result.state, booking });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/retry-payment
// Reuses the existing booking — never creates a new Booking, never re-fires
// BOOKING_CREATED/PAYMENT_SUCCESS notifications. Booking._id and bookingNumber
// are unchanged; only a new PhonePe order + PaymentLedger row + attempt entry
// are created, and phonePeMerchantTransactionId is repointed at the new attempt
// so the existing verify/webhook lookups keep working unmodified.
exports.retryPayment = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (String(booking.userId) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    if (booking.status !== 'pending_payment')
      return res.status(400).json({ success: false, message: 'This booking is not awaiting payment' });

    // Guard against duplicate in-flight payments (same pattern as pay-remaining)
    const inflight = await PaymentLedger.findOne({ bookingId: booking._id, paymentStatus: 'PENDING' });
    if (inflight) {
      return res.json({
        success: true,
        redirectUrl: null,
        merchantTransactionId: inflight.merchantTransactionId,
        alreadyInFlight: true,
        message: 'A payment attempt is already in progress for this booking',
      });
    }

    // Reuse the amount/type of the most recent attempt on THIS booking (covers both
    // FULL and PARTIAL original charges) — never trust a client-supplied amount.
    // Falls back to the full grand total only if no prior ledger row exists at all,
    // which should not happen since one is always created at booking creation time.
    const lastLedger = await PaymentLedger.findOne({ bookingId: booking._id }).sort({ createdAt: -1 });
    const chargeAmount = lastLedger?.amount || booking.grandTotal || booking.amount;
    const paymentType  = lastLedger?.paymentType || (booking.paymentMode === 'PARTIAL' ? 'PARTIAL' : 'FULL');

    if (!chargeAmount || chargeAmount <= 0)
      return res.status(400).json({ success: false, message: 'Nothing left to charge on this booking' });

    const merchantTransactionId = `ZUT_RETRY_${Date.now()}_${req.user._id.toString().slice(-6)}`;
    const clientUrl             = urls.clientUrl;

    await PaymentLedger.create({
      bookingId:             booking._id,
      amount:                chargeAmount,
      paymentType,
      paymentStatus:         'PENDING',
      merchantTransactionId,
    });

    booking.phonePeMerchantTransactionId = merchantTransactionId;
    recordAttemptInitiated(booking, { merchantTransactionId, amount: chargeAmount, paymentType });
    await booking.save();

    const { redirectUrl } = await createPhonePeOrder({
      merchantTransactionId,
      amount:      chargeAmount,
      userId:      req.user._id,
      redirectUrl: `${clientUrl}/payment-callback/${merchantTransactionId}`,
      callbackUrl: `${urls.serverUrl}/api/bookings/phonepe-webhook`,
    });

    res.json({ success: true, redirectUrl, merchantTransactionId, chargeAmount });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/pay-remaining
exports.payRemaining = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (String(booking.userId) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    if (booking.paymentStatus !== 'PARTIALLY_PAID')
      return res.status(400).json({ success: false, message: 'No remaining balance on this booking' });

    const remaining = booking.remainingAmount;
    if (remaining <= 0)
      return res.status(400).json({ success: false, message: 'Remaining amount is already zero' });

    // Guard against duplicate in-flight payments
    const inflight = await PaymentLedger.findOne({
      bookingId:     booking._id,
      paymentType:   'REMAINING',
      paymentStatus: 'PENDING',
    });
    if (inflight) {
      return res.status(409).json({
        success: false,
        message: 'A remaining payment is already in progress for this booking',
        merchantTransactionId: inflight.merchantTransactionId,
      });
    }

    const merchantTransactionId = `ZUT_REM_${Date.now()}_${req.user._id.toString().slice(-6)}`;
    const clientUrl             = urls.clientUrl;

    await PaymentLedger.create({
      bookingId:             booking._id,
      amount:                remaining,
      paymentType:           'REMAINING',
      paymentStatus:         'PENDING',
      merchantTransactionId,
    });

    const { redirectUrl } = await createPhonePeOrder({
      merchantTransactionId,
      amount:      remaining,
      userId:      req.user._id,
      redirectUrl: `${clientUrl}/payment-callback/${merchantTransactionId}`,
      callbackUrl: `${urls.serverUrl}/api/bookings/phonepe-webhook`,
    });

    res.json({
      success: true,
      redirectUrl,
      merchantTransactionId,
      remainingAmount: remaining,
      poojaName: booking.poojaId?.name || '',
    });
  } catch (err) { next(err); }
};

// GET /api/bookings/verify-remaining/:merchantTransactionId
exports.verifyRemainingPayment = async (req, res, next) => {
  try {
    const { merchantTransactionId } = req.params;

    const ledger = await PaymentLedger.findOne({ merchantTransactionId, paymentType: 'REMAINING' });
    if (!ledger) return res.status(404).json({ success: false, message: 'Payment record not found' });

    const booking = await Booking.findById(ledger.bookingId).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Already processed
    if (booking.paymentStatus === 'FULLY_PAID' && ledger.paymentStatus === 'SUCCESS') {
      return res.json({ success: true, booking, alreadyVerified: true });
    }

    const result = await checkPhonePeStatus(merchantTransactionId);

    if (result.success) {
      booking.amountPaid      = booking.grandTotal;
      booking.remainingAmount = 0;
      booking.paymentStatus   = 'FULLY_PAID';
      await booking.save();

      ledger.paymentStatus        = 'SUCCESS';
      ledger.phonePeTransactionId = result.transactionId;
      ledger.paidAt               = new Date();
      await ledger.save();
      await generateInvoiceForPayment(booking, ledger, booking.poojaId?.name || '');

      await onFinalPaymentSuccess(booking, booking.poojaId?.name || '');

      return res.json({ success: true, booking });
    }

    if (result.state && result.state !== 'PENDING') {
      ledger.paymentStatus = 'FAILED';
      await ledger.save();
    }

    res.json({ success: false, code: result.code, state: result.state, booking });
  } catch (err) { next(err); }
};

// POST /api/bookings/phonepe-webhook
exports.phonePeWebhook = async (req, res) => {
  try {
    const { response } = req.body;
    const xVerify = req.headers['x-verify'];

    if (!await verifyWebhookChecksum(response, xVerify)) return res.status(400).json({ success: false });

    const decoded               = JSON.parse(Buffer.from(response, 'base64').toString());
    const merchantTransactionId = decoded?.data?.merchantTransactionId;
    const phonePeTransactionId  = decoded?.data?.transactionId;
    const isSuccess              = decoded?.code === 'PAYMENT_SUCCESS';
    const isTerminalFailure      = !isSuccess && decoded?.data?.state && decoded.data.state !== 'PENDING';

    if (!merchantTransactionId || (!isSuccess && !isTerminalFailure)) {
      return res.json({ success: true });
    }

    // ── Remaining payment webhook ──────────────────────────────
    if (merchantTransactionId.startsWith('ZUT_REM_')) {
      const ledger = await PaymentLedger.findOne({ merchantTransactionId, paymentType: 'REMAINING' });
      if (ledger && ledger.paymentStatus === 'PENDING') {
        if (isSuccess) {
          const booking = await Booking.findById(ledger.bookingId).populate('poojaId', 'name');
          if (booking) {
            booking.amountPaid      = booking.grandTotal;
            booking.remainingAmount = 0;
            booking.paymentStatus   = 'FULLY_PAID';
            await booking.save();

            ledger.paymentStatus        = 'SUCCESS';
            ledger.phonePeTransactionId = phonePeTransactionId;
            ledger.paidAt               = new Date();
            await ledger.save();
            await generateInvoiceForPayment(booking, ledger, booking.poojaId?.name || '');

            await onFinalPaymentSuccess(booking, booking.poojaId?.name || '');
          }
        } else {
          ledger.paymentStatus = 'FAILED';
          await ledger.save();
        }
      }
      return res.json({ success: true });
    }

    // ── Standard single-booking webhook (also covers ZUT_RETRY_ retries) ──
    const booking = await Booking.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
      .populate('poojaId', 'name');

    if (booking && booking.status !== 'paid') {
      const ledger = await PaymentLedger.findOne({ merchantTransactionId });

      if (isSuccess) {
        const chargedAmount = ledger?.amount ?? booking.grandTotal;
        const remaining     = booking.grandTotal - chargedAmount;

        booking.status               = 'paid';
        booking.phonePeTransactionId = phonePeTransactionId;
        booking.amountPaid           = chargedAmount;
        booking.remainingAmount      = remaining;
        booking.paymentStatus        = remaining > 0 ? 'PARTIALLY_PAID' : 'FULLY_PAID';
        await recordAttemptResult(booking, merchantTransactionId, { status: 'SUCCESS' }, booking.poojaId?.name || '');
        await booking.save();

        if (ledger && ledger.paymentStatus !== 'SUCCESS') {
          ledger.paymentStatus        = 'SUCCESS';
          ledger.phonePeTransactionId = phonePeTransactionId;
          ledger.paidAt               = new Date();
          await ledger.save();
          await generateInvoiceForPayment(booking, ledger, booking.poojaId?.name || '');
        }

        await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });

        if (booking.paymentStatus === 'PARTIALLY_PAID') {
          await onPartialPaymentSuccess(booking, booking.poojaId?.name || '');
        } else {
          await onPaymentSuccess(booking, booking.poojaId?.name || '');
        }
      } else if (ledger && ledger.paymentStatus === 'PENDING') {
        ledger.paymentStatus = 'FAILED';
        await ledger.save();
        await recordAttemptResult(booking, merchantTransactionId, {
          status: 'FAILED', gatewayCode: decoded?.code, gatewayState: decoded?.data?.state,
          failureReason: decoded?.code || decoded?.data?.state || 'Payment failed',
        }, booking.poojaId?.name || '');
        await booking.save();
      }
    }

    res.json({ success: true });
  } catch { res.json({ success: true }); }
};

// GET /api/bookings/pricing-preview?poojaId=xxx[&kitId=yyy]
exports.getPricingPreview = async (req, res, next) => {
  try {
    const { poojaId, kitId } = req.query;
    const pooja = await Pooja.findById(poojaId).select('name price salePrice mrp taxEnabled taxRate');
    if (!pooja) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const { kitPrice } = await resolveKitPrice(kitId, false);
    const pricing      = await calculatePricing(pooja, kitPrice);
    const ppConfig     = await getPartialPaymentConfig();

    res.json({ success: true, pricing, poojaName: pooja.name, partialPayment: ppConfig });
  } catch (err) { next(err); }
};

// GET /api/bookings/my
exports.getMyBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, paymentStatus } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const bookings = await Booking.find(query)
      .populate('poojaId',  'name image price')
      .populate('panditId', 'name phone profilePhoto')
      .populate('kitId',    'name image discountPrice')
      .sort({ createdAt: -1 })
      .limit(+limit)
      .skip((+page - 1) * +limit);

    const total = await Booking.countDocuments(query);
    res.json({ success: true, bookings, total, page: +page });
  } catch (err) { next(err); }
};

// GET /api/bookings/by-number/:bookingNumber
exports.getBookingByNumber = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, userId: req.user._id }).select('_id');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, bookingId: booking._id });
  } catch (err) { next(err); }
};

// GET /api/bookings/:id
exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('poojaId',  'name image price duration description')
      .populate('panditId', 'name phone profilePhoto specializations languages experience')
      .populate('kitId',    'name image discountPrice')
      .populate('referral.referringPanditId', 'name phone profilePhoto');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const isOwner = booking.userId.toString() === req.user._id.toString();
    const isAdmin = isAdminRole(req.user.role);
    let isPandit = false;
    let approvedFee;
    if (!isOwner && !isAdmin && req.user.role === 'pandit' && booking.panditId) {
      const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id poojaCharges');
      // booking.panditId is already populated above, so compare against its ._id, not the doc itself
      isPandit = Boolean(pandit && booking.panditId._id.toString() === pandit._id.toString());
      // Pandit-facing "what will I earn" figure — always the admin-approved rate for
      // this pandit+pooja, never the pandit's own self-declared expected price, and
      // never derived independently of resolveApprovedPayoutAmount (single source of
      // truth also used for the actual payout at completion).
      if (isPandit) approvedFee = resolveApprovedPayoutAmount(booking, pandit);
    }
    if (!isOwner && !isAdmin && !isPandit)
      return res.status(403).json({ success: false, message: 'Access denied' });

    // Fetch payment history from ledger
    const ledger = await PaymentLedger.find({ bookingId: booking._id }).sort({ createdAt: 1 }).lean();

    // Referral details (status/remark live on the separate Referral doc)
    let referralDetails = null;
    if (booking.referral?.referralId) {
      const ref = await Referral.findById(booking.referral.referralId).select('status remark remarkSubmittedAt').lean();
      if (ref) {
        referralDetails = {
          ...ref,
          panditName:  booking.referral.referringPanditId?.name,
          panditPhone: booking.referral.referringPanditId?.phone,
        };
      }
    }

    res.json({ success: true, booking, paymentLedger: ledger, referralDetails, approvedFee });
  } catch (err) { next(err); }
};

// PATCH /api/bookings/:id/cancel  (user self-cancellation)
const USER_CANCELLABLE_STATUSES = ['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment'];

exports.cancelBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (String(booking.userId) !== String(req.user._id))
      return res.status(403).json({ success: false, message: 'Not authorised to cancel this booking' });

    if (!USER_CANCELLABLE_STATUSES.includes(booking.status))
      return res.status(400).json({ success: false, message: `Booking cannot be cancelled in its current state (${booking.status})` });

    const prevStatus = booking.status;
    const cancelNote = reason || '';
    const poojaName  = booking.poojaId?.name || 'Pooja';
    const phone      = booking.userDetails?.phone;

    // ── Calculate refund using centralized engine ──────────────────────────
    const refundCalc = calculateRefundBreakdown(booking);

    booking.status        = 'cancelled';
    booking.paymentStatus = booking.amountPaid > 0 ? 'REFUNDED' : booking.paymentStatus;
    if (cancelNote) booking.cancelReason = cancelNote;

    // Populate refund subdocument
    booking.refund = {
      eligibleAmount: refundCalc.refundableAmount,
      nonRefundable:  refundCalc.nonRefundableTotal,
      refundedAmount: 0,
      status:         booking.amountPaid > 0 && refundCalc.refundableAmount > 0 ? 'pending' : 'none',
      reason:         cancelNote || 'Cancelled by customer',
      requestedAt:    new Date(),
    };

    booking.auditLog.push({
      action:          'status_changed_to_cancelled',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Customer',
      note:            `Cancelled by user from ${prevStatus}. Eligible refund: ₹${refundCalc.refundableAmount}${cancelNote ? '. Reason: ' + cancelNote : ''}`,
      at:              new Date(),
    });
    await booking.save();

    NotificationEngine.emit(
      'BOOKING_CANCELLED',
      normalizeBookingPayload({ booking, poojaName, refund: { status: 'pending', reason: cancelNote } })
    ).catch(() => {});

    res.json({ success: true, message: 'Booking cancelled successfully', booking, refundBreakdown: refundCalc });
  } catch (err) { next(err); }
};

// GET /api/bookings/:id/refund-preview  (user — shown before confirming cancellation)
exports.getRefundPreview = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (String(booking.userId) !== String(req.user._id) && !isAdminRole(req.user.role))
      return res.status(403).json({ success: false, message: 'Access denied' });

    const breakdown = calculateRefundBreakdown(booking);

    res.json({
      success: true,
      refundPreview: {
        ...breakdown,
        bookingNumber: booking.bookingNumber,
        poojaName:     booking.poojaId?.name || '',
        grandTotal:    booking.grandTotal || booking.amount || 0,
        paymentStatus: booking.paymentStatus,
      },
    });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/rate
exports.rateBooking = async (req, res, next) => {
  try {
    const { rating, review } = req.body;
    const ratingNum = parseInt(rating, 10);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5)
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Access denied' });
    if (booking.status !== 'completed')
      return res.status(400).json({ success: false, message: 'Only completed bookings can be rated' });
    if (booking.rating !== null && booking.rating !== undefined)
      return res.status(400).json({ success: false, message: 'You have already rated this booking' });

    booking.rating     = ratingNum;
    booking.review     = (review || '').trim();
    booking.ratingDate = new Date();
    await booking.save();

    if (booking.panditId) {
      const ratedBookings = await Booking.find({ panditId: booking.panditId, rating: { $ne: null }, status: 'completed' }).select('rating');
      const totalReviews  = ratedBookings.length;
      const avgRating     = totalReviews > 0
        ? Math.round((ratedBookings.reduce((s, b) => s + b.rating, 0) / totalReviews) * 10) / 10
        : 0;
      await Pandit.findByIdAndUpdate(booking.panditId, { rating: avgRating, totalReviews });
    }

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

function computeUnlockTime(booking, pooja) {
  const datePart = booking.scheduledDate instanceof Date
    ? booking.scheduledDate.toISOString().slice(0, 10)
    : String(booking.scheduledDate).slice(0, 10);
  const timePart = booking.scheduledTime || '00:00';
  const startMs  = new Date(`${datePart}T${timePart}:00`).getTime();
  if (isNaN(startMs)) return null;

  let durationMs = 0;
  if (pooja?.durationValue && pooja?.durationUnit) {
    durationMs = pooja.durationUnit === 'days'
      ? pooja.durationValue * 24 * 60 * 60 * 1000
      : pooja.durationValue * 60 * 60 * 1000;
  }
  return new Date(startMs + durationMs);
}

// POST /api/bookings/:id/request-completion
exports.requestCompletion = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name durationValue durationUnit');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit || booking.panditId?.toString() !== pandit._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised' });

    if (booking.status !== 'pandit_accepted')
      return res.status(400).json({ success: false, message: 'Booking must be in pandit_accepted status' });

    const unlockAt = computeUnlockTime(booking, booking.poojaId);
    if (unlockAt && new Date() < unlockAt) {
      const fmt = unlockAt.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      return res.status(400).json({
        success: false,
        message: `Pooja completion can only be requested after ${fmt}. Please wait until the ceremony is over.`,
        unlocksAt: unlockAt.toISOString(),
      });
    }

    const rawOtp    = OtpService.generate();
    const hashedOtp = await OtpService.hash(rawOtp);
    const expiry    = new Date(Date.now() + 10 * 60 * 1000);

    booking.status                    = 'completion_requested';
    booking.completionOtp             = hashedOtp;
    booking.completionOtpExpiry       = expiry;
    booking.completionOtpRequestedAt  = new Date();
    booking.auditLog.push({ action: 'completion_otp_generated', performedBy: req.user._id, performedByName: req.user.name || 'Pandit' });
    await booking.save();

    const poojaName = booking.poojaId?.name || 'Pooja';
    NotificationEngine.emit(
      'SERVICE_COMPLETION_OTP',
      normalizeBookingPayload({ booking, poojaName, otp: rawOtp })
    ).catch(() => {});

    res.json({ success: true, message: 'OTP sent to user. Ask user to share it with you.' });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/verify-completion-otp
exports.verifyCompletionOtp = async (req, res, next) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: 'OTP is required' });

    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit || booking.panditId?.toString() !== pandit._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised' });

    if (booking.status !== 'completion_requested')
      return res.status(400).json({ success: false, message: 'Booking is not awaiting completion OTP' });

    if (!booking.completionOtp || !booking.completionOtpExpiry)
      return res.status(400).json({ success: false, message: 'No OTP found. Please request completion again.' });

    if (new Date() > booking.completionOtpExpiry)
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });

    const valid = await OtpService.compare(String(otp), booking.completionOtp, true);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    booking.status              = 'completed';
    booking.completedAt         = new Date();
    booking.completionOtp       = null;
    booking.completionOtpExpiry = null;
    booking.verifiedByName      = req.user.name || 'Pandit';
    booking.verifiedAt          = new Date();
    booking.payout.status       = 'pending';
    booking.auditLog.push({ action: 'otp_verified_completion', performedBy: req.user._id, performedByName: req.user.name || 'Pandit' });
    await booking.save();

    AdminAuditLog.create({
      action: 'booking_completed_otp', performedBy: req.user._id, performedByName: req.user.name || 'Pandit',
      targetId: booking._id, targetType: 'booking', targetName: booking.bookingNumber,
    }).catch(() => {});

    const completedPoojaName = booking.poojaId?.name || 'Pooja';
    const completionPayload = normalizeBookingPayload({ booking, poojaName: completedPoojaName });
    NotificationEngine.emit('INVOICE_GENERATED', completionPayload).catch(() => {});
    NotificationEngine.emit('FEEDBACK_REQUEST',  completionPayload).catch(() => {});
    NotificationEngine.emit('SERVICE_COMPLETED', completionPayload).catch(() => {});
    Booking.findByIdAndUpdate(booking._id, { invoiceSent: true }).catch(() => {});

    res.json({ success: true, message: 'Booking completed successfully', booking });
  } catch (err) { next(err); }
};

// GET /api/bookings/:id/invoice  — full invoice data with kit items populated
exports.getInvoiceData = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('poojaId',  'name category description duration')
      .populate('panditId', 'name phone profilePhoto')
      .populate({
        path: 'kitId',
        select: 'name description discountPrice taxRate items',
        populate: { path: 'items.productId', select: 'name price' },
      });

    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    const isOwnerInv = booking.userId.toString() === req.user._id.toString();
    const isAdminInv = isAdminRole(req.user.role);
    let isPanditInv = false;
    if (!isOwnerInv && !isAdminInv && req.user.role === 'pandit' && booking.panditId) {
      const pandit = await Pandit.findOne({ userId: req.user._id }).select('_id');
      // booking.panditId is already populated above, so compare against its ._id, not the doc itself
      isPanditInv = Boolean(pandit && booking.panditId._id.toString() === pandit._id.toString());
    }
    if (!isOwnerInv && !isAdminInv && !isPanditInv)
      return res.status(403).json({ success: false, message: 'Access denied' });

    const paymentLedger = await PaymentLedger
      .find({ bookingId: booking._id, paymentStatus: 'SUCCESS' })
      .sort({ createdAt: 1 }).lean();

    res.json({ success: true, booking, paymentLedger });
  } catch (err) { next(err); }
};
