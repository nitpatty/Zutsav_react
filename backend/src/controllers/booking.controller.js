const crypto  = require('crypto');
const bcrypt   = require('bcryptjs');

const Booking = require('../models/Booking');
const Pooja   = require('../models/Pooja');
const Pandit  = require('../models/Pandit');
const User    = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');

const { createOrder, verifySignature }                         = require('../utils/razorpay');
const { createPhonePeOrder, checkPhonePeStatus, verifyWebhookChecksum } = require('../utils/phonepe');
const settings                                                 = require('../utils/settingsService');
const { notifyBookingCreated }                                 = require('../utils/notificationService');
const { sendBookingConfirmedEmail, sendCompletionOtpEmail }    = require('../utils/email');
const { notifyBookingConfirmed, sendCompletionOtpWhatsApp }    = require('../utils/whatsapp');

// ── Commission helper ─────────────────────────────────────────

async function calculatePricing(basePrice) {
  const commissionPct = await settings.get('platformCommissionPercent', 0);
  const gstPct        = await settings.get('platformGstPercent', 0);

  const commissionAmt = Math.round((basePrice * commissionPct) / 100);
  const subtotal      = basePrice + commissionAmt;
  const gstAmt        = Math.round((subtotal * gstPct) / 100);
  const finalAmount   = subtotal + gstAmt;

  return {
    baseAmount:        basePrice,
    commissionPercent: commissionPct,
    commissionAmount:  commissionAmt,
    gstPercent:        gstPct,
    gstAmount:         gstAmt,
    finalAmount,
  };
}

// ── Post-payment notifications ────────────────────────────────

async function onPaymentSuccess(booking, poojaName) {
  // In-app
  notifyBookingCreated(booking.userId, booking.bookingNumber, poojaName).catch(() => {});
  // Email
  sendBookingConfirmedEmail(booking, poojaName).catch(() => {});
  // WhatsApp (approved template only)
  notifyBookingConfirmed(booking, poojaName).catch(() => {});
}

// ── Routes ────────────────────────────────────────────────────

// POST /api/bookings/create-order  (Razorpay — legacy)
exports.createBookingOrder = async (req, res, next) => {
  try {
    const { poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId } = req.body;

    const pooja = await Pooja.findById(poojaId);
    if (!pooja || !pooja.isActive) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const pricing   = await calculatePricing(pooja.price);
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
      { status: 'paid', razorpayPaymentId, razorpaySignature },
      { new: true }
    ).populate('poojaId', 'name');

    await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
    await onPaymentSuccess(booking, booking.poojaId?.name || '');

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

// POST /api/bookings/create-phonepe-order
exports.createPhonePeBooking = async (req, res, next) => {
  try {
    const { poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId } = req.body;

    const pooja = await Pooja.findById(poojaId);
    if (!pooja || !pooja.isActive) return res.status(404).json({ success: false, message: 'Pooja not found' });

    const pricing               = await calculatePricing(pooja.price);
    const merchantTransactionId = `ZUT_${Date.now()}_${req.user._id.toString().slice(-6)}`;
    const clientUrl             = process.env.CLIENT_URL || 'http://localhost:3000';

    const booking = await Booking.create({
      userId:        req.user._id,
      poojaId,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      language:      language || 'Hindi',
      specialNote,
      userDetails,
      ...pricing,
      amount:                       pricing.finalAmount,
      paymentProvider:              'phonepe',
      phonePeMerchantTransactionId: merchantTransactionId,
      status:                       'pending_payment',
      isUrgent:                     isUrgent === true || isUrgent === 'true',
      withKit:                      withKit  === true || withKit  === 'true',
      kitId:                        kitId || null,
    });

    const { redirectUrl } = await createPhonePeOrder({
      merchantTransactionId,
      amount:      pricing.finalAmount,
      userId:      req.user._id,
      redirectUrl: `${clientUrl}/payment-callback/${merchantTransactionId}`,
      callbackUrl: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/bookings/phonepe-webhook`,
    });

    res.status(201).json({ success: true, booking, redirectUrl, merchantTransactionId, pricing });
  } catch (err) { next(err); }
};

// GET /api/bookings/verify-phonepe/:merchantTransactionId
exports.verifyPhonePePayment = async (req, res, next) => {
  try {
    const { merchantTransactionId } = req.params;
    const booking = await Booking.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
      .populate('poojaId', 'name');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status === 'paid') return res.json({ success: true, booking, alreadyVerified: true });

    const result = await checkPhonePeStatus(merchantTransactionId);

    if (result.success) {
      booking.status               = 'paid';
      booking.phonePeTransactionId = result.transactionId;
      await booking.save();

      await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
      await onPaymentSuccess(booking, booking.poojaId?.name || '');

      return res.json({ success: true, booking });
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

    if (decoded?.code === 'PAYMENT_SUCCESS' && merchantTransactionId) {
      const booking = await Booking.findOne({ phonePeMerchantTransactionId: merchantTransactionId })
        .populate('poojaId', 'name');

      if (booking && booking.status !== 'paid') {
        booking.status               = 'paid';
        booking.phonePeTransactionId = decoded?.data?.transactionId;
        await booking.save();
        await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
        await onPaymentSuccess(booking, booking.poojaId?.name || '');
      }
    }

    res.json({ success: true });
  } catch { res.json({ success: true }); }
};

// GET /api/bookings/pricing-preview?poojaId=xxx  — show breakdown before payment
exports.getPricingPreview = async (req, res, next) => {
  try {
    const { poojaId } = req.query;
    const pooja = await Pooja.findById(poojaId).select('price name');
    if (!pooja) return res.status(404).json({ success: false, message: 'Pooja not found' });
    const pricing = await calculatePricing(pooja.price);
    res.json({ success: true, pricing, poojaName: pooja.name });
  } catch (err) { next(err); }
};

// GET /api/bookings/my
exports.getMyBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;

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

// GET /api/bookings/:id
exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('poojaId',  'name image price duration description')
      .populate('panditId', 'name phone profilePhoto specializations')
      .populate('kitId',    'name image discountPrice');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Access denied' });

    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/request-completion  — pandit requests completion, generates OTP
exports.requestCompletion = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('poojaId', 'name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Only the assigned pandit's user account may call this
    const pandit = await Pandit.findOne({ userId: req.user._id });
    if (!pandit || booking.panditId?.toString() !== pandit._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorised' });

    if (booking.status !== 'pandit_accepted')
      return res.status(400).json({ success: false, message: 'Booking must be in pandit_accepted status' });

    // Generate 6-digit OTP
    const rawOtp    = String(Math.floor(100000 + Math.random() * 900000));
    const hashedOtp = await bcrypt.hash(rawOtp, 8);
    const expiry    = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    booking.status                    = 'completion_requested';
    booking.completionOtp             = hashedOtp;
    booking.completionOtpExpiry       = expiry;
    booking.completionOtpRequestedAt  = new Date();
    booking.auditLog.push({
      action:          'completion_otp_generated',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Pandit',
    });
    await booking.save();

    const poojaName = booking.poojaId?.name || 'Pooja';

    // Send OTP to user
    sendCompletionOtpEmail(booking, poojaName, rawOtp).catch(() => {});
    sendCompletionOtpWhatsApp(booking, poojaName, rawOtp).catch(() => {});

    res.json({ success: true, message: 'OTP sent to user. Ask user to share it with you.' });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/verify-completion-otp  — pandit submits OTP user shared
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

    const valid = await bcrypt.compare(String(otp), booking.completionOtp);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    booking.status            = 'completed';
    booking.completedAt       = new Date();
    booking.completionOtp     = null;
    booking.completionOtpExpiry = null;
    booking.verifiedByName    = req.user.name || 'Pandit';
    booking.verifiedAt        = new Date();
    booking.payout.status     = 'pending';
    booking.auditLog.push({
      action:          'otp_verified_completion',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Pandit',
    });
    await booking.save();

    // Audit log
    AdminAuditLog.create({
      action:          'booking_completed_otp',
      performedBy:     req.user._id,
      performedByName: req.user.name || 'Pandit',
      targetId:        booking._id,
      targetType:      'booking',
      targetName:      booking.bookingNumber,
    }).catch(() => {});

    res.json({ success: true, message: 'Booking completed successfully', booking });
  } catch (err) { next(err); }
};
