import {
  buildCheckoutPayload, mapCheckoutResponse, verifyEndpoint, summariseOrderTax, CART_TXN_PREFIX,
} from '../marketplaceCheckout';

const ADDRESS = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' };

// Shape of POST /api/checkout/cart (checkout.controller.js cartCheckout) for a products-only cart:
// ₹100×2 at 18% (variant sale price) + ₹250×1 at 5% → server totals.
const serverOrder = (over = {}) => ({
  _id: 'ord1', status: 'pending_payment', phonePeMerchantTransactionId: 'ZUT_CART_1700000000000_abc123', totalAmount: 449.5,
  items: [
    { productId: 'p1', variantId: 'v1', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 },
    { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1, taxRate: 5, taxAmount: 12.5, total: 262.5 },
  ],
  ...over,
});
const serverResponse = (over = {}) => ({
  success: true, merchantTransactionId: 'ZUT_CART_1700000000000_abc123', redirectUrl: 'https://pay.example.invalid/redirect/xyz',
  bookings: [], order: serverOrder(), totals: { bookingTotal: 0, productTotal: 498.5, combinedTotal: 498.5 }, ...over,
});

describe('buildCheckoutPayload', () => {
  it('sends product ids, quantities and the address — and nothing that costs money', () => {
    const payload = buildCheckoutPayload([
      { productId: 'p1', variantId: 'v1', name: 'Ghee (500g)', price: 100, quantity: 2, image: 'x.jpg', stock: 9 },
      { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1 },
    ], ADDRESS);

    expect(payload).toStrictEqual({
      products: [
        { productId: 'p1', quantity: 2, variantId: 'v1' },
        { productId: 'p2', quantity: 1 },
      ],
      shippingAddress: ADDRESS,
    });
    const text = JSON.stringify(payload);
    ['price', 'tax', 'total', 'amount', 'couponCode', 'coin', 'bookings'].forEach((k) => expect(text.toLowerCase()).not.toContain(k.toLowerCase()));
  });

  it('omits variantId for non-variant items (null/empty/undefined)', () => {
    const { products } = buildCheckoutPayload([
      { productId: 'a', variantId: null, quantity: 1 }, { productId: 'b', variantId: '', quantity: 1 }, { productId: 'c', quantity: 1 },
    ], ADDRESS);
    products.forEach((p) => expect(p).not.toHaveProperty('variantId'));
  });

  it('keeps the same product with two variants as two lines', () => {
    const { products } = buildCheckoutPayload([
      { productId: 'p1', variantId: 'small', quantity: 1 }, { productId: 'p1', variantId: 'large', quantity: 3 },
    ], ADDRESS);
    expect(products).toEqual([{ productId: 'p1', variantId: 'small', quantity: 1 }, { productId: 'p1', variantId: 'large', quantity: 3 }]);
  });

  it('coerces quantities to positive integers', () => {
    const { products } = buildCheckoutPayload([{ productId: 'a', quantity: '3' }, { productId: 'b', quantity: 0 }, { productId: 'c', quantity: 'x' }], ADDRESS);
    expect(products.map((p) => p.quantity)).toEqual([3, 1, 1]);
  });
});

describe('mapCheckoutResponse', () => {
  it('maps the real unified-checkout response', () => {
    expect(mapCheckoutResponse(serverResponse())).toMatchObject({
      merchantTransactionId: 'ZUT_CART_1700000000000_abc123',
      redirectUrl: 'https://pay.example.invalid/redirect/xyz',
      orderId: 'ord1',
      payable: 498.5,          // totals.combinedTotal — what the gateway is asked to charge
      paidWithCoins: false,
    });
  });

  it('takes the payable from the server, not from client data (falls back to order.totalAmount)', () => {
    expect(mapCheckoutResponse(serverResponse({ totals: undefined })).payable).toBe(449.5);
  });

  it('reads the transaction id from the order when the top-level field is absent', () => {
    expect(mapCheckoutResponse(serverResponse({ merchantTransactionId: undefined })).merchantTransactionId).toBe('ZUT_CART_1700000000000_abc123');
  });

  it('reports a gateway-less response (paidWithCoins) without a redirect', () => {
    const r = mapCheckoutResponse(serverResponse({ paidWithCoins: true, redirectUrl: undefined }));
    expect(r).toMatchObject({ redirectUrl: null, paidWithCoins: true });
  });

  it.each([undefined, null, {}, { success: false }, { success: true }, { success: true, order: {} }, { success: true, order: { _id: 'o' } }])(
    'throws on a malformed body %p instead of guessing', (body) => {
      expect(() => mapCheckoutResponse(body)).toThrow('Unexpected checkout response');
    },
  );
});

describe('verifyEndpoint', () => {
  it('routes unified checkout (ZUT_CART_) transactions to /checkout/verify', () => {
    expect(CART_TXN_PREFIX).toBe('ZUT_CART_');
    expect(verifyEndpoint('marketplace', 'ZUT_CART_170_abc')).toBe('/checkout/verify/ZUT_CART_170_abc');
  });

  it('keeps legacy marketplace (ZOM_) orders on their own verify route', () => {
    expect(verifyEndpoint('marketplace', 'ZOM_170_abc')).toBe('/marketplace/orders/verify-phonepe/ZOM_170_abc');
  });

  it('leaves the booking endpoints exactly as they were', () => {
    expect(verifyEndpoint('booking', 'ZUT_B_1')).toBe('/bookings/verify-phonepe/ZUT_B_1');
    expect(verifyEndpoint('booking-remaining', 'ZUT_R_1')).toBe('/bookings/verify-remaining/ZUT_R_1');
  });

  it('a booking type is never redirected to the checkout endpoint even with a cart-looking id', () => {
    expect(verifyEndpoint('booking', 'ZUT_CART_1_x')).toBe('/bookings/verify-phonepe/ZUT_CART_1_x');
  });
});

describe('summariseOrderTax — server-persisted tax only', () => {
  it('sums the stored per-item tax and the pre-tax subtotal (different catalog rates preserved)', () => {
    expect(summariseOrderTax(serverOrder())).toEqual({ subtotal: 450, tax: 48.5 });
    expect(serverOrder().items.map((i) => i.taxRate)).toEqual([18, 5]);
  });

  it('is null for an untaxed or older order (no tax is invented)', () => {
    expect(summariseOrderTax({ items: [{ price: 100, quantity: 1 }] })).toBeNull();
    expect(summariseOrderTax({ items: [{ price: 100, quantity: 1, taxAmount: 0, taxRate: 0 }] })).toBeNull();
    expect(summariseOrderTax(null)).toBeNull();
    expect(summariseOrderTax({})).toBeNull();
  });
});
