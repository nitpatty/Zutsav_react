import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../../api/axios';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatCurrency } from '../../../utils/helpers';
import { orderStatusLabel, shipmentStatusLabel } from '../../../utils/orderStatusLabels';
import CartScreen from '../CartScreen';
import OrdersScreen from '../OrdersScreen';
import OrderDetailScreen from '../OrderDetailScreen';

// F-08 Phase 4: cart, order history and order detail. Only labels/messages are translated. Product and variant ids,
// quantities, prices, the checkout request, the idempotency key, order data (names, numbers, amounts, ids, status
// constants, coupon codes) and every payment-recovery route stay exactly as before.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, imageUrl: (p) => p, setSessionExpiredHandler: jest.fn() }));
jest.mock('../../../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text, View } = require('react-native');
  return { __esModule: true, default: ({ title, right }) => <View><Text>{`HEADER:${title}`}</Text>{right}</View> };
});
jest.mock('../../../components/shared/AddressPicker', () => ({
  __esModule: true,
  default: ({ onChange }) => {
    const { TouchableOpacity, Text } = require('react-native');
    return require('react').createElement(
      TouchableOpacity,
      { testID: 'fill-address', onPress: () => onChange({ address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' }) },
      require('react').createElement(Text, null, 'fill address'),
    );
  },
}));

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const hi = getTranslator('hi');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

const CART = [
  { productId: 'p1', variantId: 'v1', name: 'Ghee (500g)', price: 100, quantity: 2, stock: 9 },
  { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1, stock: 5 },
];
const serverOK = (over = {}) => ({
  success: true, merchantTransactionId: 'ZUT_CART_1700000000000_abc123', redirectUrl: 'https://pay.example.invalid/redirect/xyz', bookings: [],
  order: { _id: 'ord1', status: 'pending_payment', phonePeMerchantTransactionId: 'ZUT_CART_1700000000000_abc123', totalAmount: 498.5, items: [] },
  totals: { bookingTotal: 0, productTotal: 498.5, combinedTotal: 498.5 }, ...over,
});
const checkoutCalls = () => api.post.mock.calls.filter(([u]) => u === '/checkout/cart');
const ATTEMPT_KEY = 'zutsav_checkout_attempt';

let alertSpy; let openURL;
beforeEach(async () => {
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear(); Object.values(mockNav).forEach((f) => f.mockClear && f.mockClear());
  mockNav.addListener.mockImplementation(() => jest.fn());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  useAuthStore.setState({ user: null, token: null });
  await act(async () => { useCartStore.setState({ items: [] }); });
});
afterEach(() => { alertSpy.mockRestore(); openURL.mockRestore(); });

// ── Cart ─────────────────────────────────────────────────────────────────────
describe('CartScreen localization', () => {
  const renderCart = async (items = CART, placeOrderLabel = 'Place Order') => {
    await act(async () => { useCartStore.setState({ items }); });
    render(<CartScreen />);
    await screen.findByText(placeOrderLabel);
  };
  const fillForm = (labels = { name: 'Your name', phone: '10-digit mobile' }) => {
    fireEvent.changeText(screen.getByPlaceholderText(labels.name), 'Asha Test');
    fireEvent.changeText(screen.getByPlaceholderText(labels.phone), '9111111111');
    fireEvent.press(screen.getByTestId('fill-address'));
  };
  const hiForm = { name: hi('cart.namePlaceholder'), phone: hi('cart.phonePlaceholder') };

  it('Hindi: every label is translated; stored names, prices and quantities are shown as stored', async () => {
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    expect(screen.getByText(`HEADER:${hi('cart.title')}`)).toBeTruthy();
    expect(screen.getByText(hi('cart.deliverTo'))).toBeTruthy();
    expect(screen.getByText(hi('profile.fullNameRequired'))).toBeTruthy();
    expect(screen.getByText(hi('cart.phoneRequired'))).toBeTruthy();
    expect(screen.getByText(hi('cart.subtotal', { n: 2 }))).toBeTruthy();
    expect(screen.getByText(hi('cart.taxHint'))).toBeTruthy();
    expect(screen.getByText('Ghee (500g)')).toBeTruthy();
    expect(screen.getByText('Incense')).toBeTruthy();
    expect(screen.getByText(formatCurrency(450))).toBeTruthy();         // local estimate semantics unchanged (Σ price × qty, no tax)
    expect(screen.getByLabelText(hi('cart.increase', { name: 'Ghee (500g)' }))).toBeTruthy();
    expect(screen.getByLabelText(hi('cart.decrease', { name: 'Ghee (500g)' }))).toBeTruthy();
    expect(screen.getByLabelText(hi('cart.remove', { name: 'Incense' }))).toBeTruthy();
    expect(screen.queryByText('Place Order')).toBeNull();
  });

  it('quantity controls change only the quantity, in any language', async () => {
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    fireEvent.press(screen.getByLabelText(hi('cart.increase', { name: 'Incense' })));
    await waitFor(() => expect(useCartStore.getState().items.find((i) => i.productId === 'p2').quantity).toBe(2));
    expect(useCartStore.getState().items.find((i) => i.productId === 'p2')).toEqual({ productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 2, stock: 5 });
    fireEvent.press(screen.getByLabelText(hi('cart.decrease', { name: 'Ghee (500g)' })));
    await waitFor(() => expect(useCartStore.getState().items.find((i) => i.productId === 'p1').quantity).toBe(1));
  });

  it('empty cart is translated and still leads back', async () => {
    await setLang('hi');
    render(<CartScreen />);
    expect(await screen.findByText(hi('cart.emptyTitle'))).toBeTruthy();
    expect(screen.getByText(hi('cart.emptySubtitle'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('cart.goToShop')));
    expect(mockNav.goBack).toHaveBeenCalled();
  });

  it('Hindi checkout sends exactly the same request as English (ids, variantId, quantities, address, one key) and no money data', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    fillForm(hiForm);
    fireEvent.press(screen.getByText(hi('cart.placeOrder')));
    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(checkoutCalls()[0][1]).toStrictEqual({
      products: [{ productId: 'p1', quantity: 2, variantId: 'v1' }, { productId: 'p2', quantity: 1 }],
      shippingAddress: { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' },
      idempotencyKey: expect.stringMatching(/^zc_[a-z0-9_]{16,}$/),
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.get).not.toHaveBeenCalled();                              // nothing but the checkout call
  });

  it('the payment prompt is translated and shows the SERVER payable; Pay Now keeps the recovery hand-off', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    fillForm(hiForm);
    fireEvent.press(screen.getByText(hi('cart.placeOrder')));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    const [title, message, buttons] = alertSpy.mock.calls[0];
    expect(title).toBe(hi('cart.payTitle'));
    expect(message).toBe(hi('cart.payMessage', { amount: formatCurrency(498.5) }));
    expect(message).not.toContain(formatCurrency(450));
    expect(buttons.map((b) => b.text)).toEqual([hi('cart.payNow'), hi('common.cancel')]);

    await act(async () => { await buttons[0].onPress(); });
    expect(openURL).toHaveBeenCalledWith('https://pay.example.invalid/redirect/xyz');
    expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: 'ZUT_CART_1700000000000_abc123', orderId: 'ord1', type: 'marketplace' });
    buttons[1].onPress();
    expect(mockNav.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
  });

  it('an unsafe payment link is refused with the translated message and the order is opened instead', async () => {
    api.post.mockResolvedValue({ data: serverOK({ redirectUrl: 'http://pay.example.invalid/x' }) });
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    fillForm(hiForm);
    fireEvent.press(screen.getByText(hi('cart.placeOrder')));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('cart.invalidPaymentLink') }));
    expect(mockNav.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('failure messages: uncertain / in progress / definitive (server text as-is, translated fallback)', async () => {
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    fillForm(hiForm);
    const tap = () => fireEvent.press(screen.getByText(hi('cart.placeOrder')));

    api.post.mockRejectedValueOnce(new Error('network down'));
    tap();
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('cart.uncertain') }));

    api.post.mockRejectedValueOnce({ response: { status: 409, data: { code: 'CHECKOUT_IN_PROGRESS' } } });
    tap();
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('cart.inProgress') }));

    api.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Pincode not serviceable' } } });
    tap();
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Pincode not serviceable' }));

    api.post.mockRejectedValueOnce({ response: { status: 400, data: {} } });
    tap();
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('cart.orderFailed') }));
    expect(useCartStore.getState().items).toHaveLength(2);               // a failed checkout never touches the cart
  });

  it('a language change keeps the cart, makes no request, and the retry after it reuses the SAME idempotency key', async () => {
    await renderCart();
    fillForm();
    api.post.mockRejectedValue(new Error('network down'));
    fireEvent.press(screen.getByText('Place Order'));
    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    const firstKey = checkoutCalls()[0][1].idempotencyKey;
    const stored = JSON.parse(await AsyncStorage.getItem(ATTEMPT_KEY));
    expect(stored.key).toBe(firstKey);
    const cartBefore = JSON.stringify(useCartStore.getState().items);

    await setLang('hi');
    expect(await screen.findByText(hi('cart.placeOrder'))).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);                           // changing the language never submits anything
    expect(api.get).not.toHaveBeenCalled();
    expect(JSON.stringify(useCartStore.getState().items)).toBe(cartBefore);
    expect(JSON.parse(await AsyncStorage.getItem(ATTEMPT_KEY)).key).toBe(firstKey);

    fireEvent.press(screen.getByText(hi('cart.placeOrder')));
    await waitFor(() => expect(checkoutCalls()).toHaveLength(2));
    expect(checkoutCalls()[1][1].idempotencyKey).toBe(firstKey);        // same logical attempt → the server returns the original order
  });

  it('no coupon, coin or combined-checkout control exists on the cart in any language', async () => {
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    expect(screen.queryByText(/coupon|coin|कूपन|सिक्के/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/coupon|कूपन/i)).toBeNull();
  });

  it('Clear Cart confirmation is translated and still empties the cart', async () => {
    await setLang('hi');
    await renderCart(CART, hi('cart.placeOrder'));
    fireEvent.press(screen.UNSAFE_getAllByProps({ name: 'trash-outline', size: 20 })[0]);
    expect(alertSpy).toHaveBeenCalledWith(hi('cart.clearTitle'), hi('cart.clearMessage'), expect.any(Array));
    const buttons = alertSpy.mock.calls[0][2];
    expect(buttons.map((b) => b.text)).toEqual([hi('common.cancel'), hi('cart.clearConfirm')]);
    await act(async () => { await buttons[1].onPress(); });
    expect(useCartStore.getState().items).toEqual([]);
  });
});

// ── Orders ───────────────────────────────────────────────────────────────────
const ORDER_ID = 'order0000000000000000001';
const order = (over = {}) => ({
  _id: ORDER_ID, orderNumber: 'ORD-1001', status: 'paid', createdAt: '2026-03-02T09:15:00.000Z',
  totalAmount: 498.5, paymentProvider: 'phonepe', phonePeTransactionId: 'GT-TEST-1',
  shippingAddress: { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  items: [
    { productId: 'p1', variantId: 'v1', variantLabel: '500g', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 },
    { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1, taxRate: 5, taxAmount: 12.5, total: 262.5 },
  ],
  statusTimeline: [{ status: 'pending_payment', timestamp: '2026-03-02T09:00:00.000Z', note: 'Order created' }, { status: 'paid', timestamp: '2026-03-02T09:15:00.000Z', note: '' }],
  ...over,
});

describe('OrdersScreen localization', () => {
  it('Hindi: title, item count, status label and empty state are translated; amounts, ids and navigation unchanged', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { orders: [order(), order({ _id: 'order0000000000000000002', status: 'out_for_delivery' })] } });
    render(<OrdersScreen />);
    expect(await screen.findByText(hi('orders.statusPaid'))).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('orders.title')}`)).toBeTruthy();
    expect(screen.getByText(hi('orders.statusOutForDelivery'))).toBeTruthy();
    expect(screen.getAllByText(hi('orders.itemCount', { n: 2 })).length).toBe(2);
    expect(screen.getAllByText(formatCurrency(498.5)).length).toBe(2);
    expect(screen.getByText('#000001')).toBeTruthy();                    // the short order id is data
    expect(api.get).toHaveBeenCalledWith('/marketplace/orders/my', { params: { sort: '-createdAt', limit: 50 } });
    fireEvent.press(screen.getAllByText(hi('orders.itemCount', { n: 2 }))[0]);
    expect(mockNav.navigate).toHaveBeenCalledWith('OrderDetail', { orderId: ORDER_ID });
  });

  it('English statuses are exactly the humanized values as before; an unknown status falls back to the humanized value', async () => {
    const en = getTranslator('en');
    const humanized = { pending_payment: 'Pending Payment', paid: 'Paid', confirmed: 'Confirmed', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out For Delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded', payment_failed: 'Payment Failed' };
    Object.entries(humanized).forEach(([status, label]) => expect(orderStatusLabel(status, en)).toBe(label));
    const shipment = { pending_courier_selection: 'Pending Courier Selection', created: 'Created', picked_up: 'Picked Up', in_transit: 'In Transit', out_for_delivery: 'Out For Delivery', delivered: 'Delivered', failed_delivery: 'Failed Delivery', cancelled: 'Cancelled', returned: 'Returned' };
    Object.entries(shipment).forEach(([status, label]) => expect(shipmentStatusLabel(status, en)).toBe(label));
    expect(orderStatusLabel('brand_new_status', hi)).toBe('Brand New Status');
    expect(orderStatusLabel('constructor', hi)).toBe('Constructor');
    expect(orderStatusLabel(undefined, hi)).toBe('');
  });

  it('every known status has a Hindi label different from English', () => {
    ['pending_payment', 'paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded', 'payment_failed']
      .forEach((s) => expect(orderStatusLabel(s, hi)).not.toBe(orderStatusLabel(s, getTranslator('en'))));
  });

  it('empty and error states; a language switch does not refetch (orders are not server-translated)', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { orders: [] } });
    const empty = render(<OrdersScreen />);
    expect(await screen.findByText(hi('orders.emptyTitle'))).toBeTruthy();
    expect(screen.getByText(hi('orders.emptySubtitle'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('cart.goToShop')));
    expect(mockNav.navigate).toHaveBeenCalledWith('ShopTab');
    await setLang('ta');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.get).toHaveBeenCalledTimes(1);
    empty.unmount();

    api.get.mockRejectedValue(new Error('x'));
    render(<OrdersScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: getTranslator('ta')('orders.loadFailed') }));
  });
});

describe('OrderDetailScreen localization', () => {
  const open = async (o, params = {}) => {
    api.get.mockResolvedValue({ data: { order: o } });
    const view = render(<OrderDetailScreen route={{ params: { orderId: o._id, ...params } }} />);
    await screen.findByText(hi('orders.orderNumber', { number: o.orderNumber }));
    return view;
  };

  it('Hindi: labels, status, item lines and stored values; totals and ids exactly as persisted', async () => {
    await setLang('hi');
    await open(order({ couponCode: 'DIWALI10', couponDiscount: 50 }));
    expect(screen.getByText(`HEADER:${hi('orders.detailTitle')}`)).toBeTruthy();
    [hi('orders.items'), hi('orders.deliveryAddress'), hi('orders.payment'), hi('orders.itemsSubtotal'), hi('orders.gst'), hi('orders.totalAmount'), hi('orders.orderTimeline')]
      .forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getAllByText(hi('orders.statusPaid')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ghee \(500g\)/)).toBeTruthy();              // order snapshot: not translated
    expect(screen.getByText(`${hi('orders.qtyLine', { n: 2, price: formatCurrency(100) })} ${hi('orders.gstExtraRate', { amount: formatCurrency(36), rate: 18 })}`)).toBeTruthy();
    expect(screen.getByText(formatCurrency(498.5))).toBeTruthy();        // order.totalAmount as stored
    expect(screen.getByText(`${hi('orders.via', { provider: 'Phonepe' })} · GT-TEST-1`)).toBeTruthy();   // provider text and transaction id are data
    expect(api.get).toHaveBeenCalledWith(`/marketplace/orders/${ORDER_ID}`);
  });

  it('the coupon row appears only from the recorded fields; no coin row; the total never changes', async () => {
    await setLang('hi');
    await open(order({ couponCode: 'DIWALI10', couponDiscount: 50 }));
    expect(screen.getByText(hi('orders.coupon', { code: 'DIWALI10' }))).toBeTruthy();
    expect(screen.getByText(`−${formatCurrency(50)}`)).toBeTruthy();
    expect(screen.getByText(formatCurrency(498.5))).toBeTruthy();
    expect(screen.queryByText(/coin|सिक्के/i)).toBeNull();
  });

  it('no coupon row without a recorded coupon, and none is derived from subtotal + tax − total', async () => {
    await setLang('hi');
    await open(order({ totalAmount: 400 }));                             // 450 + 48.5 − 400 would "imply" a discount; none is recorded
    expect(screen.queryByText(/DIWALI|कूपन/)).toBeNull();
    expect(screen.getByText(formatCurrency(400))).toBeTruthy();
  });

  it('shipment card and timelines use translated statuses; tracking data and link are unchanged', async () => {
    await setLang('hi');
    const o = order({
      status: 'shipped',
      statusTimeline: [{ status: 'paid', timestamp: '2026-03-02T09:15:00.000Z', note: 'Paid via gateway' }, { status: 'shipped', timestamp: '2026-03-03T09:15:00.000Z', note: '' }],
      shipment: {
        shipmentStatus: 'in_transit', courierName: 'BlueDart', trackingNumber: 'TRK123', trackingUrl: 'https://track.example.invalid/TRK123',
        shipmentHistory: [{ status: 'picked_up', timestamp: '2026-03-03T10:00:00.000Z', note: 'Picked from warehouse' }],
      },
    });
    await open(o);
    expect(screen.getByText(hi('orders.shipmentTitle'))).toBeTruthy();
    expect(screen.getByText(hi('orders.shipInTransit'))).toBeTruthy();
    expect(screen.getByText(hi('orders.shipPickedUp'))).toBeTruthy();
    expect(screen.getAllByText(hi('orders.statusShipped')).length).toBeGreaterThan(0);
    expect(screen.getByText(hi('orders.courier'))).toBeTruthy();
    expect(screen.getByText('BlueDart')).toBeTruthy();
    expect(screen.getByText('TRK123')).toBeTruthy();
    expect(screen.getByText('Picked from warehouse')).toBeTruthy();      // server-written timeline note: as received
    fireEvent.press(screen.getByText(hi('orders.trackShipment')));
    expect(openURL).toHaveBeenCalledWith('https://track.example.invalid/TRK123');
  });

  it('invoice navigation is unchanged for a paid order and absent for a pending one', async () => {
    await setLang('hi');
    await open(order());
    fireEvent.press(screen.getByText(hi('orders.downloadInvoice')));
    expect(mockNav.navigate).toHaveBeenCalledWith('Invoice', { type: 'order', id: ORDER_ID });
  });

  it('pending order: translated retry card; the retry request, hand-off and verification route are unchanged', async () => {
    const TXN2 = 'ZUT_CART_RETRY_1700000000000_abc123_deadbeef';
    api.post.mockResolvedValue({ data: { success: true, orderId: ORDER_ID, merchantTransactionId: TXN2, redirectUrl: 'https://pay.example.invalid/redirect/x' } });
    await setLang('hi');
    await open(order({ status: 'pending_payment', statusTimeline: [] }));
    expect(screen.getByText(hi('orders.paymentPending'))).toBeTruthy();
    expect(screen.getByText(hi('orders.paymentPendingDesc'))).toBeTruthy();
    expect(screen.queryByText(hi('orders.downloadInvoice'))).toBeNull();
    fireEvent.press(screen.getByText(hi('orders.retryPayment')));
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: TXN2, orderId: ORDER_ID, type: 'marketplace' }));
    expect(api.post.mock.calls.map(([u]) => u)).toEqual([`/checkout/orders/${ORDER_ID}/retry-payment`]);
    expect(Object.keys(api.post.mock.calls[0][1])).toEqual(['idempotencyKey']);
    expect(openURL).toHaveBeenCalledWith('https://pay.example.invalid/redirect/x');
    expect(TXN2.startsWith('ZUT_CART_RETRY_')).toBe(true);
  });

  it('retry outcomes use translated messages (server text still wins where the server supplies it)', async () => {
    await setLang('hi');
    await open(order({ status: 'pending_payment', statusTimeline: [] }));
    const tap = () => fireEvent.press(screen.getByText(hi('orders.retryPayment')));
    const cases = [
      [{ response: { status: 409, data: { code: 'ORDER_ALREADY_PAID' } } }, 'orders.retryAlreadyPaid'],
      [{ response: { status: 409, data: { code: 'ORDER_EXPIRED' } } }, 'orders.retryExpired'],
      [{ response: { status: 409, data: { code: 'PAYMENT_IN_PROGRESS' } } }, 'orders.retryInProgress'],
      [{ response: { status: 503, data: { code: 'PAYMENT_STATUS_UNKNOWN' } } }, 'orders.retryStatusUnknown'],
      [{ response: { status: 409, data: { code: 'ORDER_CANCELLED' } } }, 'orders.retryUnavailable'],
      [{ response: { status: 400, data: { code: 'SOMETHING' } } }, 'orders.retryRejected'],
      [new Error('network down'), 'orders.retryUncertain'],
    ];
    for (const [err, key] of cases) {
      Toast.show.mockClear();
      api.post.mockRejectedValueOnce(err);
      tap();
      await waitFor(() => expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: hi(key) })));
    }
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { code: 'SOMETHING', message: 'Server says no' } } });
    tap();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Server says no' }));
  });

  it('closed and cancelled orders explain why in the translated wording and offer no retry', async () => {
    await setLang('hi');
    const closed = await open(order({ status: 'payment_failed', statusTimeline: [] }));
    expect(screen.getByText(hi('orders.noteClosed'))).toBeTruthy();
    expect(screen.queryByText(hi('orders.retryPayment'))).toBeNull();
    closed.unmount();
    await open(order({ status: 'cancelled', statusTimeline: [] }));
    expect(screen.getByText(hi('orders.noteCancelled'))).toBeTruthy();
    expect(screen.queryByText(hi('orders.retryPayment'))).toBeNull();
  });

  it('the pending-payment banner is translated and still opens PaymentVerify for the stored payment', async () => {
    const { savePendingPayment } = require('../../../utils/paymentRecovery');
    await setLang('hi');
    useAuthStore.setState({ user: { _id: 'u1', name: 'Asha' }, token: 't' });
    await savePendingPayment('u1', { type: 'marketplace', merchantTransactionId: 'ZUT_CART_1700_pending', orderId: ORDER_ID });
    await open(order());
    expect(await screen.findByText(hi('orders.bannerTitle'))).toBeTruthy();
    expect(screen.getByText(hi('orders.bannerSub'))).toBeTruthy();
    fireEvent.press(screen.getByLabelText(hi('orders.checkStatusLabel')));
    expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: 'ZUT_CART_1700_pending', bookingId: undefined, orderId: ORDER_ID, type: 'marketplace' });
  });

  it('English is unchanged for the same data (labels, qty line, coupon row, total)', async () => {
    api.get.mockResolvedValue({ data: { order: order({ couponCode: 'DIWALI10', couponDiscount: 50 }) } });
    render(<OrderDetailScreen route={{ params: { orderId: ORDER_ID } }} />);
    await screen.findByText('Order #ORD-1001');
    ['Items', 'Delivery Address', 'Payment', 'Items subtotal', 'GST', 'Total Amount', 'Order Timeline', 'Download Invoice'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByText('Qty: 2 × ' + formatCurrency(100) + ' + GST ' + formatCurrency(36) + ' (18%)')).toBeTruthy();
    expect(screen.getByText('Coupon (DIWALI10)')).toBeTruthy();
    expect(screen.getByText('via Phonepe · GT-TEST-1')).toBeTruthy();
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
  });
});
