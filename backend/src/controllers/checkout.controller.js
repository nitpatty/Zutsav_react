const Booking  = require('../models/Booking');
const Pooja    = require('../models/Pooja');
const Kit      = require('../models/Kit');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const CheckoutRequest = require('../models/CheckoutRequest');
const mongoose = require('mongoose');
const settings = require('../utils/settingsService');
const { deductStock } = require('../utils/inventoryUtils');
const { createPhonePeOrder, checkPhonePeStatus, verifyWebhookChecksum } = require('../utils/phonepe');
const { recordAttemptInitiated, recordAttemptResult } = require('../utils/paymentAttempts');
const { NotificationEngine } = require('../../notification-engine');
const { urls } = require('../config');
const { calculatePricing, calculateItemTax } = require('../utils/financeUtils');
const { normalizeBookingPayload, normalizeOrderPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const idempotency = require('../services/checkoutIdempotency');
const orderPayments = require('../services/orderPayments');
const ordersConfig = require('../config/orders.config');
const couponService = require('../services/couponService');
const { resolveCoinRedemption, settleCoinRedemption } = require('../services/coinRedemptionService');
const bookingDateRules = require('../utils/bookingDateRules');

// Delegates to the centralized financeUtils engine — accepts Pooja document or plain number
async function computePricing(pooja, kitPrice = 0, urgent = false) {
  const commissionType  = await settings.get('platformCommissionType', 'percent');
  const commissionPct   = await settings.get('platformCommissionPercent', 0);
  const commissionFixed = await settings.get('platformCommissionFixed', 0);
  const gstPct          = await settings.get('platformGstPercent', 0);
  const hikeType        = await settings.get('urgentBookingHikeType', 'percent');
  const hikePct         = await settings.get('urgentBookingHikePercent', 0);
  const hikeFixed       = await settings.get('urgentBookingHikeFixed', 0);

  const poojaPrice = typeof pooja === 'number' ? pooja : (pooja.salePrice || pooja.price || 0);

  return calculatePricing({
    poojaPrice,
    kitPrice,
    commissionPercent: commissionPct,
    commissionFixed,
    commissionType,
    gstPercent: gstPct,
    urgent,
    urgentHikeType:    hikeType,
    urgentHikePercent: hikePct,
    urgentHikeFixed:   hikeFixed,
  });
}

const fail = (status, message, extra = {}) => ({ status, body: { success: false, message, ...extra } });
const { newTxnId } = idempotency;

/**
 * Core of POST /api/checkout/cart. Returns { status, body } instead of writing the response so
 * cartCheckout() below can wrap it with the (optional) idempotency claim. Behaviour for callers
 * that send no idempotency key is unchanged except where noted inline (eligibility, quantity).
 *
 * ctx (all optional): { merchantTransactionId, onOrderCreated(info) }
 */
async function runCartCheckout(req, ctx = {}) {
    const { bookings: bookingItems = [], products: productItems = [], shippingAddress, couponCode } = req.body;
    // Coins + coupons are mutually exclusive — resolve coin redemption first so
    // a conflicting request is rejected before any pricing/coupon work happens.
    const hasCoupon = !!(couponCode && typeof couponCode === 'string' && couponCode.trim());

    if (bookingItems.length === 0 && productItems.length === 0) {
      return fail(400, 'Cart is empty');
    }

    const clientUrl = urls.clientUrl;
    const serverUrl = urls.serverUrl;
    const merchantTransactionId = ctx.merchantTransactionId || newTxnId(req.user._id);

    // ── 1. Resolve and create booking records ──────────────────
    const createdBookings = [];
    let bookingTotal = 0;

    for (const item of bookingItems) {
      const { poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId, kitIds } = item;
      const urgent = isUrgent === true || isUrgent === 'true';

      // Urgent date eligibility — validate before the phonepe order is created.
      if (urgent) {
        const verdict = await bookingDateRules.validateUrgentDate(scheduledDate);
        if (!verdict.valid) {
          return fail(400, verdict.message);
        }
      }

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

      const pricing = await computePricing(pooja, kitPrice, urgent);

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
        urgentSurcharge:  pricing.urgentSurcharge,
        urgentHikeType:   pricing.urgentHikeType,
        urgentHikePercent: pricing.urgentHikePercent,
        urgentHikeFixed:  pricing.urgentHikeFixed,
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

      // Quantities must be whole numbers ≥ 1. (Previously 0, negatives and garbage were silently
      // turned into 1 — i.e. the customer was charged for something they did not ask for.)
      const qtyOf = (pi) => {
        const n = Number(pi?.quantity);
        return Number.isInteger(n) && n >= 1 ? n : null;
      };
      // Total requested per product+variant, so two lines for the same item cannot together
      // exceed the stock that each line passes on its own.
      const requested = new Map();
      for (const pi of productItems) {
        const q = qtyOf(pi);
        if (q) {
          const k = `${pi.productId}|${pi.variantId || ''}`;
          requested.set(k, (requested.get(k) || 0) + q);
        }
      }

      for (const pi of productItems) {
        if (!mongoose.isValidObjectId(pi?.productId)) {
          return fail(400, 'Product not available');
        }
        // Eligibility mirrors what the shop lists and what the legacy order endpoint enforced:
        // active, not soft-deleted, and not a kit-only component.
        const product = await Product.findById(pi.productId)
          .select('name price salePrice stock images variants taxRate isActive isDeleted visibilityType');
        if (!product) return fail(400, 'Product not available');
        if (product.isDeleted === true || product.isActive === false)
          return fail(400, `"${product.name}" is no longer available`);
        if (product.visibilityType === 'kit_only')
          return fail(400, `"${product.name}" cannot be purchased individually`);

        const qty = qtyOf(pi);
        if (!qty) return fail(400, `Invalid quantity for ${product.name}`);
        const totalQty = requested.get(`${pi.productId}|${pi.variantId || ''}`) || qty;

        let unitPrice = product.salePrice ?? product.price ?? 0;
        let variantLabel = null;

        if (pi.variantId) {
          // The variant must be one of THIS product's own active variants.
          const variant = product.variants?.find(v => v.variantId === pi.variantId);
          if (!variant || variant.isActive === false)
            return fail(400, `Selected variant not available for ${product.name}`);
          if (variant.stock < totalQty)
            return fail(400, `Only ${variant.stock} unit${variant.stock !== 1 ? 's' : ''} of ${product.name} (${variant.quantity}) in stock`);
          unitPrice = variant.salePrice ?? variant.price ?? unitPrice;
          variantLabel = variant.quantity || null; // customer-facing label ("500g"), snapshotted on the order
        } else {
          if (product.stock < totalQty)
            return fail(400, `Only ${product.stock} unit${product.stock !== 1 ? 's' : ''} of ${product.name} in stock`);
        }
        unitPrice = unitPrice || 0;
        const productTaxRate = product.taxRate || 0;
        const itemTax = calculateItemTax(unitPrice, qty, productTaxRate);
        const itemTotal = unitPrice * qty + itemTax;

        orderItems.push({
          productId: pi.productId,
          variantId: pi.variantId || null,
          variantLabel,
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
          // Same convention as the legacy marketplace endpoint: the first entry is written at creation.
          statusTimeline: [{ status: 'pending_payment', timestamp: new Date() }],
          paymentProvider: 'phonepe',
          shippingAddress: resolvedShipping,
        });
      }
    }

    // ── 3. Single PhonePe payment for combined total ───────────
    let combinedTotal = bookingTotal + productTotal;
    if (combinedTotal === 0) {
      return fail(400, 'Combined cart total is zero');
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
        return fail(400, 'Invalid coupon code');
      }
      let eligibleBooking = 0, eligibleProduct = 0;
      if (coupon.applicability.includes('POOJA')) eligibleBooking += bookingTotal;
      if (coupon.applicability.some(a => ['PRODUCTS', 'MARKETPLACE'].includes(a))) eligibleProduct += productTotal;
      eligibleAmount = eligibleBooking + eligibleProduct;
      if (eligibleAmount <= 0) {
        return fail(400, 'This coupon is not applicable to any item in your cart');
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
        return fail(400, couponResult.error);
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

    // Everything is persisted and priced. Record that (idempotent checkouts only) BEFORE the
    // gateway call: if that call fails or the process dies, a retry with the same key finishes
    // this payment step instead of creating another order.
    if (ctx.onOrderCreated) {
      await ctx.onOrderCreated({
        orderId: createdOrder?._id || null,
        bookingIds: createdBookings.map((x) => x.booking._id),
        totals: { bookingTotal, productTotal, combinedTotal },
        payable: combinedTotal,
      });
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
      emitOrderPlaced(createdOrder, req.user);
      return { status: 201, body: {
        success: true,
        paidWithCoins: true,
        merchantTransactionId,
        bookings: createdBookings.map((b) => b.booking),
        order: createdOrder,
        totals: { bookingTotal, productTotal, combinedTotal },
        coinCoinsUsed,
        coinValueUsed,
      } };
    }

    // Attempt history: this transaction is recorded on the order BEFORE the gateway call, so even a failed
    // initiation is visible (and a later retry/sweep knows no money can have moved for it).
    if (createdOrder) await orderPayments.recordAttemptInitiated(createdOrder._id, { txn: merchantTransactionId, amount: combinedTotal });

    let redirectUrl;
    try {
      ({ redirectUrl } = await createPhonePeOrder({
        merchantTransactionId,
        amount:      combinedTotal,
        userId:      req.user._id,
        redirectUrl: `${clientUrl}/payment-callback/${merchantTransactionId}?cart=1`,
        callbackUrl: `${serverUrl}/api/checkout/webhook`,
      }));
    } catch (err) {
      if (createdOrder) await orderPayments.markAttemptInitiationFailed(createdOrder._id, merchantTransactionId, err.message).catch(() => {});
      throw err;
    }

    emitOrderPlaced(createdOrder, req.user);
    return { status: 201, body: {
      success: true,
      merchantTransactionId,
      redirectUrl,
      bookings: createdBookings.map((b) => b.booking),
      order:    createdOrder,
      totals: { bookingTotal, productTotal, combinedTotal },
      couponDiscount: couponDiscount || undefined,
      coinCoinsUsed: coinCoinsUsed || undefined,
      coinValueUsed: coinValueUsed || undefined,
    } };
}

// ORDER_PLACED — the same event the legacy marketplace endpoint emitted at creation. It is emitted
// once, only when the checkout request has fully succeeded (the order persisted AND the payment
// created), never for a rejected request, and never on an idempotent replay. Best-effort like every
// other notification emit here; with the default notification mappings it is inert (its transactional
// email is intentionally "default skip"; ORDER_CONFIRMED is the approved customer email).
function emitOrderPlaced(order, user) {
  if (!order) return;
  NotificationEngine.emit('ORDER_PLACED', normalizeOrderPayload({ order, user })).catch(() => {});
}

// POST /api/checkout/cart
// Creates all bookings + marketplace order in one go and issues a single PhonePe payment.
// Body:
//   bookings: [{ poojaId, scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit, kitId }]
//   products: [{ productId, variantId, quantity }]  (optional)
//   idempotencyKey (optional, or an `Idempotency-Key` header): 16–128 chars. When sent, a retry of the
//     same request (e.g. after a lost response) returns the original result instead of a second order.
//     Callers that omit it behave exactly as before (the website does not send one yet).
exports.cartCheckout = async (req, res, next) => {
  try {
    const parsed = idempotency.readKey(req);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    // No key → original behaviour.
    if (!parsed.key) {
      const result = await runCartCheckout(req);
      return res.status(result.status).json(result.body);
    }

    const claim = await idempotency.claim({
      userId: req.user._id, key: parsed.key, fingerprint: idempotency.fingerprintCartCheckout(req.body),
    });

    if (claim.status === 'mismatch') {
      return res.status(422).json({
        success: false, code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This idempotency key was already used for a different cart. Start a new checkout with a new key.',
      });
    }
    if (claim.status === 'in_progress') {
      res.set('Retry-After', String(claim.retryAfterSeconds));
      return res.status(409).json({
        success: false, code: 'CHECKOUT_IN_PROGRESS',
        message: 'Your checkout is still being processed. Please retry in a few seconds.',
        retryAfterSeconds: claim.retryAfterSeconds,
      });
    }
    if (claim.status === 'replay') {
      return res.status(200).json(await replayBody(claim.record));
    }
    if (claim.status === 'resume') {
      return resumeCheckout(req, res, claim.record);
    }

    // claim.status === 'new' — this request owns the checkout. If an earlier worker died after
    // persisting documents for this claim's (fixed) transaction id, never build a second set.
    const record = claim.record;
    const txn = record.merchantTransactionId;
    const [leftoverOrder, leftoverBookings] = await Promise.all([
      Order.findOne({ userId: req.user._id, phonePeMerchantTransactionId: txn }),
      Booking.find({ userId: req.user._id, phonePeMerchantTransactionId: txn }).select('_id grandTotal'),
    ]);
    if (leftoverOrder || leftoverBookings.length) {
      if (leftoverBookings.length) {
        return res.status(409).json({
          success: false, code: 'CHECKOUT_STATE_UNKNOWN',
          message: 'An earlier attempt of this checkout did not finish. Please contact support before trying again.',
        });
      }
      await idempotency.markOrderCreated(record, {
        orderId: leftoverOrder._id, bookingIds: [],
        totals: { bookingTotal: 0, productTotal: leftoverOrder.totalAmount, combinedTotal: leftoverOrder.totalAmount },
        payable: leftoverOrder.totalAmount,
      });
      return resumeCheckout(req, res, await CheckoutRequest.findById(record._id));
    }

    let persisted = false;
    const ctx = {
      merchantTransactionId: txn,
      onOrderCreated: async (info) => { await idempotency.markOrderCreated(record, info); persisted = true; },
    };
    let result;
    try {
      result = await runCartCheckout(req, ctx);
    } catch (err) {
      if (!persisted) await idempotency.release(record).catch(() => {});
      else await idempotency.unlock(record).catch(() => {}); // keep the claim; the retry resumes the payment step right away
      throw err;
    }
    if (result.status >= 400) {
      if (!persisted) await idempotency.release(record).catch(() => {});
    } else {
      await idempotency.markCompleted(record, { redirectUrl: result.body.redirectUrl });
    }
    return res.status(result.status).json(result.body);
  } catch (err) { next(err); }
};

// Rebuild the original answer from current database state (never from a stored copy of the body).
async function replayBody(record) {
  const [order, bookings] = await Promise.all([
    record.orderId ? Order.findById(record.orderId) : null,
    record.bookingIds.length ? Booking.find({ _id: { $in: record.bookingIds } }) : [],
  ]);
  const stillUnpaid = (!order || order.status === 'pending_payment') && bookings.every((b) => b.status !== 'paid');
  return {
    success: true,
    idempotentReplay: true,
    merchantTransactionId: record.merchantTransactionId,
    // The payment link is only handed back while there is still something to pay.
    redirectUrl: stillUnpaid && record.redirectUrl ? record.redirectUrl : undefined,
    bookings,
    order,
    totals: record.totals,
  };
}

// An earlier attempt persisted everything but never created the gateway payment (error or crash).
// Finish exactly that step for the SAME transaction id — no new order, no re-pricing.
async function resumeCheckout(req, res, record) {
    const payable = record.payable;
    if (!(payable > 0)) {
      return res.status(409).json({ success: false, code: 'CHECKOUT_STATE_UNKNOWN', message: 'This checkout cannot be resumed. Please contact support.' });
    }
    if (record.orderId) await orderPayments.recordAttemptInitiated(record.orderId, { txn: record.merchantTransactionId, amount: payable });
    let redirectUrl;
    try {
      ({ redirectUrl } = await createPhonePeOrder({
        merchantTransactionId: record.merchantTransactionId,
        amount:      payable,
        userId:      req.user._id,
        redirectUrl: `${urls.clientUrl}/payment-callback/${record.merchantTransactionId}?cart=1`,
        callbackUrl: `${urls.serverUrl}/api/checkout/webhook`,
      }));
    } catch (err) {
      if (record.orderId) await orderPayments.markAttemptInitiationFailed(record.orderId, record.merchantTransactionId, err.message).catch(() => {});
      await idempotency.unlock(record).catch(() => {});
      throw err;
    }
    if (record.orderId) await orderPayments.markAttemptPending(record.orderId, record.merchantTransactionId);
    await idempotency.markCompleted(record, { redirectUrl });
    const body = await replayBody(await CheckoutRequest.findById(record._id));
    emitOrderPlaced(body.order, req.user); // the original request never reached this point, so this is the first and only emit
    // A failure above leaves the claim in order_created (its lock expires), so the next retry can try again.
    return res.status(201).json({ ...body, idempotentReplay: undefined, resumed: true });
}

// GET /api/checkout/verify/:merchantTransactionId
exports.verifyCartPayment = async (req, res, next) => {
  try {
    const { merchantTransactionId } = req.params;

    const bookings = await Booking.find({ phonePeMerchantTransactionId: merchantTransactionId })
      .populate('poojaId', 'name');
    // The order owning this transaction — its current one OR any earlier/retry attempt.
    const order = await orderPayments.findOrderByTxn(merchantTransactionId);

    if (!bookings.length && !order) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    // Every resource behind this transaction must belong to the caller —
    // possession of a (predictable) transaction ID is not authorization.
    const notOwned =
      bookings.some((b) => String(b.userId) !== String(req.user._id)) ||
      (order && String(order.userId) !== String(req.user._id));
    if (notOwned) return res.status(403).json({ success: false, message: 'Access denied' });

    // "Already paid" means the order really WAS paid — not merely "no longer pending": an expired
    // (payment_failed) or never-paid cancelled order must not read as success.
    // For an order this transaction must be the one that PAID it: an older/other attempt of an already-paid order
    // still goes to the gateway, so a second (duplicate) payment through it is detected, not waved through.
    const alreadyPaid = bookings.every((b) => b.status === 'paid')
      && (!order || (orderPayments.wasPaid(order) && orderPayments.paidByTxn(order, merchantTransactionId)));
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
      let paidOrder = order;
      let review = null;
      if (order) {
        const applied = await orderPayments.applySuccessfulPayment(order, merchantTransactionId, result.transactionId, 'Payment confirmed via PhonePe');
        paidOrder = applied.order;           // winner, or the already-paid / unchanged order
        if (applied.won) await deductStock(applied.won.items, applied.won._id); // exactly once, by the caller that won the transition
        if (applied.outcome === 'needs_review') review = applied.reason;
      }

      // Coin redemption settlement (idempotent per merchant transaction —
      // safe even if the webhook also fires for the same checkout).
      await settleCoinRedemption(bookings);
      if (review) {
        // The gateway took the money but the order can no longer accept it (expired / cancelled / paid by
        // another attempt). Never reported as a normal success, never silently reopened, never lost: it is
        // recorded on the attempt + order timeline for manual reconciliation.
        return res.json({ success: false, code: 'PAYMENT_NEEDS_REVIEW', state: 'COMPLETED', reconciliation: review, bookings, order: paidOrder });
      }
      return res.json({ success: true, bookings, order: paidOrder });
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

    // A terminal gateway failure is written to the order's attempt history. The order itself stays
    // pending_payment (and retryable) — a failed payment is an incomplete checkout, not a cancellation.
    if (order && result.state && result.state !== 'PENDING') {
      await orderPayments.markAttemptFailed(order, merchantTransactionId, { code: result.code, state: result.state, reason: result.code || result.state });
    }

    res.json({ success: false, code: result.code, state: result.state, bookings, order: order ? await Order.findById(order._id) : order });
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
      const order = await orderPayments.findOrderByTxn(merchantTransactionId);

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
      if (order) {
        if (isSuccess) {
          // Same single code path as verify: atomic pending→paid (stock deducted once by the winner), or — if the
          // order can no longer take it — recorded for reconciliation instead of being dropped.
          const applied = await orderPayments.applySuccessfulPayment(order, merchantTransactionId, decoded?.data?.transactionId, 'Payment confirmed via PhonePe webhook');
          if (applied.won) deductStock(applied.won.items, applied.won._id).catch(() => {});
        } else {
          await orderPayments.markAttemptFailed(order, merchantTransactionId, { code: decoded?.code, state: decoded?.data?.state, reason: decoded?.code || decoded?.data?.state });
        }
      }

      // Coin redemption settlement (idempotent per merchant transaction —
      // safe even if the verify endpoint also settled it).
      if (isSuccess) await settleCoinRedemption(bookings);
    }

    res.json({ success: true });
  } catch { res.json({ success: true }); }
};
