import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency } from '../../../utils/helpers';
import CartScreen from '../CartScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, imageUrl: (p) => p, setSessionExpiredHandler: jest.fn() }));
jest.mock('../../../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
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

const mockNav = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

// Local cart: ₹100×2 (variant, sale price already chosen when added) + ₹250×1 → local estimate ₹450, no tax.
const CART = [
  { productId: 'p1', variantId: 'v1', name: 'Ghee (500g)', price: 100, quantity: 2, stock: 9 },
  { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1, stock: 5 },
];
// Server truth (checkout.controller.js): per-product tax is added → the payable differs from the local estimate.
const serverOK = (over = {}) => ({
  success: true, merchantTransactionId: 'ZUT_CART_1700000000000_abc123', redirectUrl: 'https://pay.example.invalid/redirect/xyz', bookings: [],
  order: { _id: 'ord1', status: 'pending_payment', phonePeMerchantTransactionId: 'ZUT_CART_1700000000000_abc123', totalAmount: 498.5, items: [] },
  totals: { bookingTotal: 0, productTotal: 498.5, combinedTotal: 498.5 }, ...over,
});

let alertSpy; let openURL;
const UNCERTAIN_MSG = 'We could not confirm your order. Tap Place Order again — it will not create a duplicate.';
const checkoutCalls = () => api.post.mock.calls.filter(([u]) => u === '/checkout/cart');

const fillForm = () => {
  fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'Asha Test');
  fireEvent.changeText(screen.getByPlaceholderText('10-digit mobile'), '9111111111');
  fireEvent.press(screen.getByTestId('fill-address'));
};
const placeOrder = async () => { fireEvent.press(screen.getByText('Place Order')); };
const renderCart = async (items = CART) => {
  await act(async () => { useCartStore.setState({ items }); });
  render(<CartScreen />);
  await screen.findByText('Place Order');
};

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear(); Object.values(mockNav).forEach((f) => f.mockClear());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  useAuthStore.setState({ user: null, token: null });
  useCartStore.setState({ items: [] });
});
afterEach(() => { alertSpy.mockRestore(); openURL.mockRestore(); });

describe('CartScreen checkout — unified server-authoritative API (F-03)', () => {
  it('posts ids + quantities + address to /checkout/cart, once, and never to the legacy endpoint', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();

    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls.some(([u]) => /marketplace\/orders\/create/.test(u))).toBe(false);
    expect(checkoutCalls()[0][1]).toStrictEqual({
      products: [
        { productId: 'p1', quantity: 2, variantId: 'v1' },   // selected variant reaches the server's pricing
        { productId: 'p2', quantity: 1 },                    // non-variant product: no variantId
      ],
      shippingAddress: { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'Bengaluru Urban' },
      idempotencyKey: expect.stringMatching(/^zc_[a-z0-9_]{16,}$/), // one key per logical attempt
    });
  });

  it('sends no client-side price, tax, total, coupon or coin value', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    const { idempotencyKey, ...rest } = checkoutCalls()[0][1]; // (the random key is not money data)
    expect(idempotencyKey).toBeTruthy();
    const body = JSON.stringify(rest).toLowerCase();
    ['"price"', 'tax', 'total', 'amount', 'coupon', 'coin', '"bookings"'].forEach((k) => expect(body).not.toContain(k));
  });

  it('asks the user to pay the SERVER payable (with tax), not the local estimate', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    const [title, message] = alertSpy.mock.calls[0];
    expect(title).toBe('Complete Payment');
    expect(message).toContain(formatCurrency(498.5));
    expect(message).not.toContain(formatCurrency(450));
  });

  it('Pay Now opens the server-provided PhonePe URL and then verifies the unified transaction', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    const buttons = alertSpy.mock.calls[0][2];
    await act(async () => { await buttons.find((b) => b.text === 'Pay Now').onPress(); });

    expect(openURL).toHaveBeenCalledWith('https://pay.example.invalid/redirect/xyz');
    expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', {
      merchantTransactionId: 'ZUT_CART_1700000000000_abc123', orderId: 'ord1', type: 'marketplace',
    });
  });

  it('Cancel on the payment prompt opens the (still pending) order — no payment is claimed', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    alertSpy.mock.calls[0][2].find((b) => b.text === 'Cancel').onPress();

    expect(mockNav.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('clears the local cart once the server has created the order', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('a server rejection (insufficient stock) shows its message, keeps the cart, and does NOT fall back to the legacy endpoint', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { message: 'Only 1 unit of Incense in stock' } } });
    await renderCart();
    fillForm();
    await placeOrder();

    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Only 1 unit of Incense in stock' }));
    expect(useCartStore.getState().items).toHaveLength(2);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls.some(([u]) => /marketplace\/orders\/create/.test(u))).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('after a failure the same cart can be retried, and the retry succeeds', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Selected variant not available for Ghee' } } });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());

    api.post.mockResolvedValueOnce({ data: serverOK() });
    await placeOrder();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(2);
  });

  it('a network failure reports an uncertain outcome (safe to retry) and keeps the cart', async () => {
    api.post.mockRejectedValue(new Error('Network Error'));
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: UNCERTAIN_MSG }));
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('a malformed 2xx response is an error, not a success — cart kept', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: UNCERTAIN_MSG }));
    expect(useCartStore.getState().items).toHaveLength(2);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('rapid double-tap submits ONE checkout (no duplicate orders)', async () => {
    let release;
    api.post.mockReturnValue(new Promise((r) => { release = r; }));
    await renderCart();
    fillForm();

    fireEvent.press(screen.getByText('Place Order'));
    await waitFor(() => expect(checkoutCalls()).toHaveLength(1));
    fireEvent.press(screen.getByText('Placing Order…'));
    fireEvent.press(screen.getByText('Placing Order…'));
    await act(async () => {});
    expect(checkoutCalls()).toHaveLength(1);

    await act(async () => { release({ data: serverOK() }); });
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(1);
  });

  it('two taps in the same tick (before any re-render) still make a single request', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    const btn = screen.getByText('Place Order');
    await act(async () => { fireEvent.press(btn); fireEvent.press(btn); });
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(checkoutCalls()).toHaveLength(1);
  });

  it('does nothing until the delivery details are valid', async () => {
    await renderCart();
    fireEvent.press(screen.getByText('Place Order'));
    fireEvent.changeText(screen.getByPlaceholderText('Your name'), 'Asha Test');
    fireEvent.changeText(screen.getByPlaceholderText('10-digit mobile'), '91111');
    fireEvent.press(screen.getByText('Place Order'));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a gateway-less response goes to server verification instead of claiming "Order placed successfully"', async () => {
    api.post.mockResolvedValue({ data: serverOK({ paidWithCoins: true, redirectUrl: undefined }) });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('PaymentVerify', {
      merchantTransactionId: 'ZUT_CART_1700000000000_abc123', orderId: 'ord1', type: 'marketplace',
    }));
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('refuses to open a non-https payment link; the order is kept reachable', async () => {
    api.post.mockResolvedValue({ data: serverOK({ redirectUrl: 'http://pay.example.invalid/x' }) });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' }));
    expect(openURL).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('CartScreen — pricing display and unchanged cart behaviour', () => {
  it('labels the local figure as an items subtotal estimate and says tax is added by the server', async () => {
    await renderCart();
    expect(screen.getByText('Items subtotal (2 items)')).toBeTruthy();
    expect(screen.getByText(formatCurrency(450))).toBeTruthy();
    expect(screen.getByText(/Product tax is added at checkout/)).toBeTruthy();
    expect(screen.queryByText(/Place Order ·/)).toBeNull(); // no client total on the order button
  });

  it('does not invent a tax rate or a GST line in the cart', async () => {
    await renderCart();
    expect(screen.queryByText(/18%|GST/)).toBeNull();
  });

  it('quantity increase / decrease / remove still work', async () => {
    await renderCart();
    fireEvent.press(screen.getByLabelText('Increase quantity of Incense'));
    await waitFor(() => expect(useCartStore.getState().items.find((i) => i.productId === 'p2').quantity).toBe(2));

    fireEvent.press(screen.getByLabelText('Decrease quantity of Ghee (500g)'));
    await waitFor(() => expect(useCartStore.getState().items.find((i) => i.productId === 'p1').quantity).toBe(1));

    fireEvent.press(screen.getByLabelText('Remove Ghee (500g)'));
    await waitFor(() => expect(useCartStore.getState().items.map((i) => i.productId)).toEqual(['p2']));
  });

  it('shows the empty state for an empty cart', async () => {
    render(<CartScreen />);
    expect(await screen.findByText('Your cart is empty')).toBeTruthy();
  });
});
