/**
 * Marketplace checkout (F-03) — the unified, server-authoritative flow.
 *
 * Request  POST /api/checkout/cart   (authenticated; the same endpoint the website's CartPage uses)
 *   { products: [{ productId, variantId?, quantity }], shippingAddress }
 *   (`bookings`, `couponCode` and `coinRedemptionCoins` are optional on the server and are
 *    intentionally NOT sent by this screen — coupons/coins/pooja items are F-07 work.)
 *
 * The SERVER resolves everything that costs money (backend/src/controllers/checkout.controller.js):
 *   unit price = variant.salePrice ?? variant.price  (variant items)  |  product.salePrice ?? product.price
 *   tax        = calculateItemTax(unit price, qty, product.taxRate)  — the catalog's own rate
 *   stock / availability checks, order persistence and the PhonePe amount.
 * The client therefore sends ids + quantities only — never a price, tax or total.
 *
 * Response (201)  { success, merchantTransactionId, redirectUrl, order, bookings, totals:
 *   { bookingTotal, productTotal, combinedTotal }, paidWithCoins? }
 *   `order` is the persisted Order (items[] carry price, taxRate, taxAmount, total; totalAmount is the payable).
 *
 * Verification  GET /api/checkout/verify/:merchantTransactionId  (owner only)
 *   → { success: true, order, bookings, alreadyVerified? } | { success: false, code, state, order, bookings }
 */

export const CART_TXN_PREFIX = 'ZUT_CART_';

/**
 * ids + quantities only; `variantId` is included only for variant items. `idempotencyKey` (see
 * utils/checkoutAttempt) lets the server recognise a retry of the same attempt instead of creating
 * a second order; it is optional so callers without one behave as before.
 */
export function buildCheckoutPayload(items, shippingAddress, idempotencyKey) {
  const payload = {
    products: items.map((i) => {
      const line = { productId: i.productId, quantity: Math.max(1, parseInt(i.quantity, 10) || 1) };
      if (i.variantId) line.variantId = i.variantId;
      return line;
    }),
    shippingAddress,
  };
  if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
  return payload;
}

/**
 * Validates the checkout response and extracts what the app needs. Throws on a
 * malformed body instead of guessing — the caller reports it and keeps the cart.
 */
export function mapCheckoutResponse(data) {
  const order = data?.order;
  const merchantTransactionId = data?.merchantTransactionId || order?.phonePeMerchantTransactionId;
  if (!data?.success || !order || !order._id || !merchantTransactionId) {
    throw new Error('Unexpected checkout response');
  }
  const payable = Number.isFinite(Number(data.totals?.combinedTotal))
    ? Number(data.totals.combinedTotal)
    : Number(order.totalAmount) || 0;
  return {
    merchantTransactionId,
    redirectUrl: typeof data.redirectUrl === 'string' && data.redirectUrl ? data.redirectUrl : null,
    order,
    orderId: order._id,
    payable,
    paidWithCoins: data.paidWithCoins === true,
  };
}

/**
 * Which endpoint verifies a payment. Booking flows are unchanged. A marketplace
 * order is verified by its transaction family, exactly like the website's
 * PaymentCallback: unified checkout transactions (ZUT_CART_…) use /checkout/verify;
 * an order created earlier by the legacy endpoint (ZOM_…) that is still awaiting
 * payment keeps its own verify route.
 */
export function verifyEndpoint(type, merchantTransactionId) {
  if (type === 'booking-remaining') return `/bookings/verify-remaining/${merchantTransactionId}`;
  if (type === 'booking') return `/bookings/verify-phonepe/${merchantTransactionId}`;
  return String(merchantTransactionId).startsWith(CART_TXN_PREFIX)
    ? `/checkout/verify/${merchantTransactionId}`
    : `/marketplace/orders/verify-phonepe/${merchantTransactionId}`;
}

/** Persisted per-item tax (server values) for display; null when the order carries none. */
export function summariseOrderTax(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const tax = items.reduce((s, it) => s + (Number(it.taxAmount) || 0), 0);
  if (!(tax > 0)) return null;
  const subtotal = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);
  return { subtotal: Math.round(subtotal * 100) / 100, tax: Math.round(tax * 100) / 100 };
}
