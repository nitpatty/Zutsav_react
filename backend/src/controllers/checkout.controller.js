const Booking  = require('../models/Booking');
const Pooja    = require('../models/Pooja');
const Kit      = require('../models/Kit');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const settings = require('../utils/settingsService');
const { deductStock } = require('../utils/inventoryUtils');
const { createPhonePeOrder, checkPhonePeStatus, verifyWebhookChecksum } = require('../utils/phonepe');
const { notifyBookingCreated } = require('../utils/notificationService');
const { sendBookingConfirmedEmail } = require('../utils/email');
const { notifyBookingConfirmed }    = require('../utils/whatsapp');

// Mirrors calculatePricing in booking.controller — accepts Pooja document or plain number
async function computePricing(pooja, kitPrice = 0) {
  const commissionType  = await settings.get('platformCommissionType', 'percent');
  const commissionPct   = await settings.get('platformCommissionPercent', 0);
  const commissionFixed = await settings.get('platformCommissionFixed', 0);
  const gstPct          = await settings.get('platformGstPercent', 0);

  const rawPrice    = typeof pooja === 'number' ? pooja : (pooja.salePrice || pooja.price || 0);
  const poojaAmount = Math.round(rawPrice);
  const platformFee = commissionType === 'fixed'
    ? Math.round(commissionFixed)
    : Math.round((poojaAmount * commissionPct) / 100);
  const platformGST  = Math.round((platformFee * gstPct) / 100);
  const kitAmount    = Math.round(kitPrice);
  const kitGST       = Math.round((kitAmount * gstPct) / 100);
  const grandTotal   = poojaAmount + platformFee + platformGST + kitAmount + kitGST;

  return {
    poojaAmount, platformFee, platformGST, kitAmount, kitGST, grandTotal,
    commissionType, commissionPercent: commissionPct, commissionFixed, gstPercent: gstPct,
    taxAmount: kitGST, baseAmount: poojaAmount, commissionAmount: platformFee,
    gstAmount: platformGST + kitGST,
  };
}

// POST /api/checkout/cart
// Creates all bookings + marketplace order in one go and issues a single PhonePe payment.
// Body:
//   bookings: [{ poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId }]
//   products: [{ productId, variantId, quantity }]  (optional)
exports.cartCheckout = async (req, res, next) => {
  try {
    const { bookings: bookingItems = [], products: productItems = [], shippingAddress } = req.body;

    if (bookingItems.length === 0 && productItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
    const merchantTransactionId = `ZUT_CART_${Date.now()}_${req.user._id.toString().slice(-6)}`;

    // ── 1. Resolve and create booking records ──────────────────
    const createdBookings = [];
    let bookingTotal = 0;

    for (const item of bookingItems) {
      const { poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId } = item;
      const urgent = isUrgent === true || isUrgent === 'true';

      const pooja = await Pooja.findById(poojaId).select('name price salePrice taxEnabled taxRate isActive');
      if (!pooja || !pooja.isActive) continue;

      let kitPrice = 0;
      let resolvedKitId = null;
      if (!urgent && withKit && kitId) {
        const kit = await Kit.findById(kitId).select('discountPrice isActive');
        if (kit && kit.isActive) { kitPrice = kit.discountPrice || 0; resolvedKitId = kitId; }
      }

      const pricing = await computePricing(pooja, kitPrice);

      const booking = await Booking.create({
        userId:        req.user._id,
        poojaId,
        scheduledDate: new Date(scheduledDate),
        scheduledTime: scheduledTime || '10:00',
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
        baseAmount:        pricing.poojaAmount,
        commissionPercent: pricing.commissionPercent,
        commissionAmount:  pricing.platformFee,
        gstPercent:        pricing.gstPercent,
        gstAmount:         pricing.gstAmount,
        amount:            pricing.grandTotal,
        paymentMode:       'FULL',
        paymentStatus:     'PENDING',
        amountPaid:        0,
        remainingAmount:   pricing.grandTotal,
        paymentProvider:              'phonepe',
        phonePeMerchantTransactionId: merchantTransactionId,
        status:                       'pending_payment',
        bookingType: urgent ? 'urgent' : 'normal',
        isUrgent:    urgent,
        withKit:     !!resolvedKitId,
        kitId:       resolvedKitId,
      });

      createdBookings.push({ booking, poojaName: pooja.name });
      bookingTotal += pricing.grandTotal;
    }

    // ── 2. Resolve and create marketplace order ────────────────
    let createdOrder = null;
    let productTotal = 0;

    if (productItems.length > 0) {
      const orderItems = [];

      for (const pi of productItems) {
        const product = await Product.findById(pi.productId).select('name price salePrice stock images variants taxRate isActive');
        if (!product || !product.isActive) continue;

        const qty = Math.max(1, parseInt(pi.quantity) || 1);
        let unitPrice = product.salePrice ?? product.price ?? 0;

        if (pi.variantId) {
          const variant = product.variants?.find(v => v.variantId === pi.variantId);
          if (!variant || variant.isActive === false)
            return res.status(400).json({ success: false, message: `Selected variant not available for ${product.name}` });
          if (variant.stock < qty)
            return res.status(400).json({ success: false, message: `Only ${variant.stock} unit${variant.stock !== 1 ? 's' : ''} of ${product.name} (${variant.quantity}) in stock` });
          unitPrice = variant.salePrice ?? variant.price ?? unitPrice;
        } else {
          if (product.stock < qty)
            return res.status(400).json({ success: false, message: `Only ${product.stock} unit${product.stock !== 1 ? 's' : ''} of ${product.name} in stock` });
        }
        unitPrice = unitPrice || 0;
        const productTaxRate = product.taxRate || 0;
        const itemTax = Math.round((unitPrice * qty * productTaxRate) / 100);
        const itemTotal = unitPrice * qty + itemTax;

        orderItems.push({
          productId: pi.productId,
          variantId: pi.variantId || null,
          name:      product.name,
          price:     unitPrice,
          quantity:  qty,
          taxRate:   productTaxRate,
          taxAmount: itemTax,
          total:     itemTotal,
        });
        productTotal += itemTotal;
      }

      if (orderItems.length > 0) {
        const resolvedShipping = shippingAddress || bookingItems[0]?.userDetails || {};
        createdOrder = await Order.create({
          userId:      req.user._id,
          items:       orderItems,
          totalAmount: productTotal,
          phonePeMerchantTransactionId: merchantTransactionId,
          status:      'pending_payment',
          paymentProvider: 'phonepe',
          shippingAddress: resolvedShipping,
        });
      }
    }

    // ── 3. Single PhonePe payment for combined total ───────────
    const combinedTotal = bookingTotal + productTotal;
    if (combinedTotal === 0) {
      return res.status(400).json({ success: false, message: 'Combined cart total is zero' });
    }

    const { redirectUrl } = await createPhonePeOrder({
      merchantTransactionId,
      amount:      combinedTotal,
      userId:      req.user._id,
      redirectUrl: `${clientUrl}/payment-callback/${merchantTransactionId}?cart=1`,
      callbackUrl: `${serverUrl}/api/checkout/webhook`,
    });

    res.status(201).json({
      success: true,
      merchantTransactionId,
      redirectUrl,
      bookings: createdBookings.map((b) => b.booking),
      order:    createdOrder,
      totals: { bookingTotal, productTotal, combinedTotal },
    });
  } catch (err) { next(err); }
};

// GET /api/checkout/verify/:merchantTransactionId
exports.verifyCartPayment = async (req, res, next) => {
  try {
    const { merchantTransactionId } = req.params;

    const bookings = await Booking.find({ phonePeMerchantTransactionId: merchantTransactionId })
      .populate('poojaId', 'name');
    const order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });

    const alreadyPaid = bookings.every((b) => b.status === 'paid') && (!order || order.status !== 'pending_payment');
    if (alreadyPaid) return res.json({ success: true, bookings, order, alreadyVerified: true });

    const result = await checkPhonePeStatus(merchantTransactionId);

    if (result.success) {
      for (const booking of bookings) {
        if (booking.status !== 'paid') {
          booking.status               = 'paid';
          booking.phonePeTransactionId = result.transactionId;
          booking.paymentStatus        = 'FULLY_PAID';
          booking.amountPaid           = booking.grandTotal || booking.amount || 0;
          booking.remainingAmount      = 0;
          await booking.save();
          await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
          notifyBookingCreated(booking.userId, booking.bookingNumber, booking.poojaId?.name || '').catch(() => {});
          sendBookingConfirmedEmail(booking, booking.poojaId?.name || '').catch(() => {});
          notifyBookingConfirmed(booking, booking.poojaId?.name || '').catch(() => {});
        }
      }
      if (order && order.status === 'pending_payment') {
        order.status               = 'paid';
        order.phonePeTransactionId = result.transactionId;
        await order.save();
        await deductStock(order.items, order._id);
      }
      return res.json({ success: true, bookings, order });
    }

    res.json({ success: false, code: result.code, state: result.state, bookings, order });
  } catch (err) { next(err); }
};

// POST /api/checkout/webhook  (PhonePe server-to-server callback for cart payments)
exports.cartWebhook = async (req, res) => {
  try {
    const { response } = req.body;
    const xVerify = req.headers['x-verify'];

    if (!await verifyWebhookChecksum(response, xVerify)) return res.status(400).json({ success: false });

    const decoded               = JSON.parse(Buffer.from(response, 'base64').toString());
    const merchantTransactionId = decoded?.data?.merchantTransactionId;

    if (decoded?.code === 'PAYMENT_SUCCESS' && merchantTransactionId?.startsWith('ZUT_CART_')) {
      const bookings = await Booking.find({ phonePeMerchantTransactionId: merchantTransactionId })
        .populate('poojaId', 'name');
      const order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });

      for (const booking of bookings) {
        if (booking.status !== 'paid') {
          booking.status               = 'paid';
          booking.phonePeTransactionId = decoded?.data?.transactionId;
          booking.paymentStatus        = 'FULLY_PAID';
          booking.amountPaid           = booking.grandTotal || booking.amount || 0;
          booking.remainingAmount      = 0;
          await booking.save();
          await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
          notifyBookingCreated(booking.userId, booking.bookingNumber, booking.poojaId?.name || '').catch(() => {});
          sendBookingConfirmedEmail(booking, booking.poojaId?.name || '').catch(() => {});
          notifyBookingConfirmed(booking, booking.poojaId?.name || '').catch(() => {});
        }
      }
      if (order && order.status === 'pending_payment') {
        order.status               = 'paid';
        order.phonePeTransactionId = decoded?.data?.transactionId;
        await order.save();
        deductStock(order.items, order._id).catch(() => {});
      }
    }

    res.json({ success: true });
  } catch { res.json({ success: true }); }
};
