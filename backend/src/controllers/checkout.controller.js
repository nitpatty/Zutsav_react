const Booking  = require('../models/Booking');
const Pooja    = require('../models/Pooja');
const Kit      = require('../models/Kit');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const settings = require('../utils/settingsService');
const { deductStock } = require('../utils/inventoryUtils');
const { createPhonePeOrder, checkPhonePeStatus, verifyWebhookChecksum } = require('../utils/phonepe');
const { recordAttemptInitiated, recordAttemptResult } = require('../utils/paymentAttempts');
const { NotificationEngine } = require('../../notification-engine');
const { urls } = require('../config');
const { calculatePricing, calculateItemTax } = require('../utils/financeUtils');
const { normalizeBookingPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const couponService = require('../services/couponService');
const { resolveCoinRedemption, settleCoinRedemption } = require('../services/coinRedemptionService');

// Delegates to the centralized financeUtils engine — accepts Pooja document or plain number
async function computePricing(pooja, kitPrice = 0) {
  const commissionType  = await settings.get('platformCommissionType', 'percent');
  const commissionPct   = await settings.get('platformCommissionPercent', 0);
  const commissionFixed = await settings.get('platformCommissionFixed', 0);
  const gstPct          = await settings.get('platformGstPercent', 0);

  const poojaPrice = typeof pooja === 'number' ? pooja : (pooja.salePrice || pooja.price || 0);

  return calculatePricing({
    poojaPrice,
    kitPrice,
    commissionPercent: commissionPct,
    commissionFixed,
    commissionType,
    gstPercent: gstPct,
  });
}

// POST /api/checkout/cart
// Creates all bookings + marketplace order in one go and issues a single PhonePe payment.
// Body:
//   bookings: [{ poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId }]
//   products: [{ productId, variantId, quantity }]  (optional)
exports.cartCheckout = async (req, res, next) => {
  try {
    const { bookings: bookingItems = [], products: productItems = [], shippingAddress, couponCode } = req.body;
    // Coins + coupons are mutually exclusive — resolve coin redemption first so
    // a conflicting request is rejected before any pricing/coupon work happens.
    const hasCoupon = !!(couponCode && typeof couponCode === 'string' && couponCode.trim());

    if (bookingItems.length === 0 && productItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const clientUrl = urls.clientUrl;
    const serverUrl = urls.serverUrl;
    const merchantTransactionId = `ZUT_CART_${Date.now()}_${req.user._id.toString().slice(-6)}`;

    // ── 1. Resolve and create booking records ──────────────────
    const createdBookings = [];
    let bookingTotal = 0;

    for (const item of bookingItems) {
      const { poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId, kitIds } = item;
      const urgent = isUrgent === true || isUrgent === 'true';

      const pooja = await Pooja.findById(poojaId).select('name price salePrice taxEnabled taxRate isActive');
      if (!pooja || !pooja.isActive) continue;

      // Multi-kit: `kitIds` (array) is the new shape; a bare `kitId` is kept as
      // the single-selection alias for older clients. Only ACTIVE kits are
      // charged — the backend is the source of truth for kit pricing.
      const requestedKitIds = kitIds ?? (kitId ? [kitId] : []);
      const ids = [...new Set((requestedKitIds || []).filter(Boolean))];
      let kitPrice = 0;
      let resolvedKitIds = [];
      if (!urgent && ids.length > 0) {
        const kits = await Kit.find({ _id: { $in: ids }, isActive: true }).select('discountPrice').lean();
        kitPrice = kits.reduce((sum, k) => sum + (k.discountPrice || 0), 0);
        resolvedKitIds = kits.map((k) => k._id);
      }

      const pricing = await computePricing(pooja, kitPrice);

      let booking = new Booking({
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
        withKit:     resolvedKitIds.length > 0,
        kitIds:      resolvedKitIds,
        kitId:       resolvedKitIds[0] || null,
      });

      recordAttemptInitiated(booking, { merchantTransactionId, amount: pricing.grandTotal, paymentType: 'FULL' });
      await booking.save();

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
        const itemTax = calculateItemTax(unitPrice, qty, productTaxRate);
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
    let combinedTotal = bookingTotal + productTotal;
    if (combinedTotal === 0) {
      return res.status(400).json({ success: false, message: 'Combined cart total is zero' });
    }

    // ── Coupon validation (server-authoritative) ──────────────
    let couponDiscount = 0;
    let resolvedCoupon = null;
    if (hasCoupon) {
      // Determine eligible amount: only the portions whose category the coupon covers
      let eligibleAmount = 0;
      let eligibleType = null;
      if (bookingTotal > 0) eligibleAmount += bookingTotal;
      if (productTotal > 0) eligibleAmount += productTotal;
      // Determine applicability-eligible portion
      const coupon = await couponService.getCouponByCode(couponCode);
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }
      let eligibleBooking = 0, eligibleProduct = 0;
      if (coupon.applicability.includes('POOJA')) eligibleBooking += bookingTotal;
      if (coupon.applicability.some(a => ['PRODUCTS', 'MARKETPLACE'].includes(a))) eligibleProduct += productTotal;
      eligibleAmount = eligibleBooking + eligibleProduct;
      if (eligibleAmount <= 0) {
        return res.status(400).json({ success: false, message: 'This coupon is not applicable to any item in your cart' });
      }
      eligibleType = coupon.applicability.includes('POOJA') && eligibleBooking > 0
        ? 'POOJA'
        : (coupon.applicability.find(a => a === 'PRODUCTS') || coupon.applicability.find(a => a === 'MARKETPLACE') || 'PRODUCTS');

      const couponResult = await couponService.validateCoupon({
        code: couponCode,
        userId: req.user._id,
        cartValue: eligibleAmount,
        cartType: eligibleType,
      });
      if (!couponResult.valid) {
        return res.status(400).json({ success: false, message: couponResult.error });
      }
      couponDiscount = couponResult.discount;
      resolvedCoupon = couponResult.coupon;
      combinedTotal = Math.max(0, Math.round((combinedTotal - couponDiscount) * 100) / 100);
    }

    // Apply discount to created bookings/order records proportionally where possible
    // (simple approach: store the discount on the booking/order that carries it)
    if (resolvedCoupon && couponDiscount > 0) {
      // Distribute discount to bookings and order
      let remaining = couponDiscount;
      const totalBeforeDiscount = bookingTotal + productTotal;
      for (const { booking } of createdBookings) {
        if (remaining <= 0) break;
        const share = totalBeforeDiscount > 0
          ? Math.round((booking.grandTotal / totalBeforeDiscount) * couponDiscount * 100) / 100
          : 0;
        booking.couponCode = resolvedCoupon.code;
        booking.couponId = resolvedCoupon._id;
        booking.couponDiscount = Math.min(share, remaining, booking.grandTotal);
        booking.grandTotal = Math.max(0, Math.round((booking.grandTotal - booking.couponDiscount) * 100) / 100);
        booking.amount = booking.grandTotal;
        booking.remainingAmount = booking.grandTotal;
        remaining -= booking.couponDiscount;
        await booking.save();
      }
      if (createdOrder && remaining > 0) {
        const share = Math.min(remaining, createdOrder.totalAmount);
        createdOrder.couponCode = resolvedCoupon.code;
        createdOrder.couponId = resolvedCoupon._id;
        createdOrder.couponDiscount = share;
        createdOrder.totalAmount = Math.max(0, Math.round((createdOrder.totalAmount - share) * 100) / 100);
        remaining -= share;
        await createdOrder.save();
      }

      // Record redemptions (one per booking + one for the order)
      for (const { booking } of createdBookings) {
        if (booking.couponDiscount > 0) {
          await couponService.recordRedemption({
            couponId: resolvedCoupon._id,
            userId: req.user._id,
            bookingId: booking._id,
            purchaseType: 'POOJA',
            discountType: resolvedCoupon.discountType,
            discountApplied: booking.couponDiscount,
            cartValue: (booking.grandTotal || 0) + (booking.couponDiscount || 0),
            finalPayable: booking.grandTotal || 0,
          }).catch(() => {});
        }
      }
      if (createdOrder && createdOrder.couponDiscount > 0) {
        await couponService.recordRedemption({
          couponId: resolvedCoupon._id,
          userId: req.user._id,
          orderId: createdOrder._id,
          purchaseType: 'MARKETPLACE',
          discountType: resolvedCoupon.discountType,
          discountApplied: createdOrder.couponDiscount,
          cartValue: (createdOrder.totalAmount || 0) + (createdOrder.couponDiscount || 0),
          finalPayable: createdOrder.totalAmount || 0,
        }).catch(() => {});
      }
    }

    // ── Coin redemption (global Wallet / Coins, server-authoritative) ──────
    // Pooja-only, mutually exclusive with coupons, wallet balance must meet the
    // admin-configured minimum threshold, and redeemed coins never exceed the
    // balance or the payable. The wallet debit itself happens only AFTER the
    // payment succeeds (see settleCoinRedemption below/verify/webhook).
    const coinResolution = await resolveCoinRedemption({
      userId: req.user._id,
      coinCoins: req.body.coinRedemptionCoins,
      hasCoupon,
      productItems,
      payable: combinedTotal,
    });
    const { coinCoinsUsed, coinValueUsed } = coinResolution;

    if (coinValueUsed > 0 && createdBookings.length > 0) {
      // Distribute the reduction across bookings; the LAST booking absorbs the
      // rounding remainder so the sums exactly equal the applied totals.
      const totalBefore = bookingTotal;
      let valueAlloc = 0;
      let coinAlloc = 0;
      for (let i = 0; i < createdBookings.length; i++) {
        const booking = createdBookings[i].booking;
        const isLast = i === createdBookings.length - 1;
        const share = isLast
          ? Math.round((coinValueUsed - valueAlloc) * 100) / 100
          : Math.round((booking.grandTotal / totalBefore) * coinValueUsed * 100) / 100;
        const shareCoins = isLast
          ? coinCoinsUsed - coinAlloc
          : Math.min(coinCoinsUsed - coinAlloc, Math.max(0, Math.round((share / coinValueUsed) * coinCoinsUsed)));
        booking.coinCoins = shareCoins;
        booking.coinValue = share;
        booking.grandTotal = Math.max(0, Math.round((booking.grandTotal - share) * 100) / 100);
        booking.amount = booking.grandTotal;
        booking.remainingAmount = booking.grandTotal;
        await booking.save();
        valueAlloc += share;
        coinAlloc += shareCoins;
      }
      combinedTotal = Math.max(0, Math.round((combinedTotal - coinValueUsed) * 100) / 100);
    }

    // If coins fully covered the payable, skip the payment gateway entirely —
    // settle the wallet debit and mark everything paid inline.
    if (coinValueUsed > 0 && combinedTotal <= 0) {
      await settleCoinRedemption(createdBookings.map((x) => x.booking));
      for (const { booking, poojaName } of createdBookings) {
        booking.status = 'paid';
        booking.paymentStatus = 'FULLY_PAID';
        booking.amountPaid = 0;
        booking.remainingAmount = 0;
        await recordAttemptResult(booking, merchantTransactionId, { status: 'SUCCESS' }, poojaName || '');
        await booking.save();
        await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
        NotificationEngine.emit(
          'BOOKING_CONFIRMED',
          normalizeBookingPayload({ booking, poojaName: poojaName || '' })
        ).catch(() => {});
      }
      return res.status(201).json({
        success: true,
        paidWithCoins: true,
        merchantTransactionId,
        bookings: createdBookings.map((b) => b.booking),
        order: createdOrder,
        totals: { bookingTotal, productTotal, combinedTotal },
        coinCoinsUsed,
        coinValueUsed,
      });
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
      couponDiscount: couponDiscount || undefined,
      coinCoinsUsed: coinCoinsUsed || undefined,
      coinValueUsed: coinValueUsed || undefined,
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
          await recordAttemptResult(booking, merchantTransactionId, { status: 'SUCCESS' }, booking.poojaId?.name || '');
          await booking.save();
          await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
          NotificationEngine.emit(
            'BOOKING_CONFIRMED',
            normalizeBookingPayload({ booking, poojaName: booking.poojaId?.name || '' })
          ).catch(() => {});
        }
      }
      if (order && order.status === 'pending_payment') {
        order.status               = 'paid';
        order.phonePeTransactionId = result.transactionId;
        await order.save();
        await deductStock(order.items, order._id);
      }

      // Coin redemption settlement (idempotent per merchant transaction —
      // safe even if the webhook also fires for the same checkout).
      await settleCoinRedemption(bookings);
      return res.json({ success: true, bookings, order });
    }

    if (result.state && result.state !== 'PENDING') {
      for (const booking of bookings) {
        if (booking.status !== 'paid') {
          await recordAttemptResult(booking, merchantTransactionId, {
            status: 'FAILED', gatewayCode: result.code, gatewayState: result.state,
            failureReason: result.code || result.state || 'Payment failed',
          }, booking.poojaId?.name || '');
          await booking.save();
        }
      }
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
    const isSuccess              = decoded?.code === 'PAYMENT_SUCCESS';
    const isTerminalFailure      = !isSuccess && decoded?.data?.state && decoded.data.state !== 'PENDING';

    if (merchantTransactionId?.startsWith('ZUT_CART_') && (isSuccess || isTerminalFailure)) {
      const bookings = await Booking.find({ phonePeMerchantTransactionId: merchantTransactionId })
        .populate('poojaId', 'name');
      const order = await Order.findOne({ phonePeMerchantTransactionId: merchantTransactionId });

      for (const booking of bookings) {
        if (booking.status !== 'paid') {
          if (isSuccess) {
            booking.status               = 'paid';
            booking.phonePeTransactionId = decoded?.data?.transactionId;
            booking.paymentStatus        = 'FULLY_PAID';
            booking.amountPaid           = booking.grandTotal || booking.amount || 0;
            booking.remainingAmount      = 0;
            await recordAttemptResult(booking, merchantTransactionId, { status: 'SUCCESS' }, booking.poojaId?.name || '');
            await booking.save();
            await Pooja.findByIdAndUpdate(booking.poojaId, { $inc: { totalBookings: 1 } });
            NotificationEngine.emit(
              'BOOKING_CONFIRMED',
              normalizeBookingPayload({ booking, poojaName: booking.poojaId?.name || '' })
            ).catch(() => {});
          } else {
            await recordAttemptResult(booking, merchantTransactionId, {
              status: 'FAILED', gatewayCode: decoded?.code, gatewayState: decoded?.data?.state,
              failureReason: decoded?.code || decoded?.data?.state || 'Payment failed',
            }, booking.poojaId?.name || '');
            await booking.save();
          }
        }
      }
      if (isSuccess && order && order.status === 'pending_payment') {
        order.status               = 'paid';
        order.phonePeTransactionId = decoded?.data?.transactionId;
        await order.save();
        deductStock(order.items, order._id).catch(() => {});
      }

      // Coin redemption settlement (idempotent per merchant transaction —
      // safe even if the verify endpoint also settled it).
      if (isSuccess) await settleCoinRedemption(bookings);
    }

    res.json({ success: true });
  } catch { res.json({ success: true }); }
};
