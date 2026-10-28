import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../../api/axios';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import CartScreen from '../CartScreen';

// Checkout retry semantics: one idempotency key per LOGICAL attempt (see utils/checkoutAttempt).
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

const CART = [
  { productId: 'p1', variantId: 'v1', name: 'Ghee (500g)', price: 100, quantity: 2, stock: 9 },
  { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1, stock: 5 },
];
const serverOK = (over = {}) => ({
  success: true, merchantTransactionId: 'ZUT_CART_1700000000000_abc123', redirectUrl: 'https://pay.example.invalid/redirect/xyz', bookings: [],
  order: { _id: 'ord1', status: 'pending_payment', phonePeMerchantTransactionId: 'ZUT_CART_1700000000000_abc123', totalAmount: 498.5, items: [] },
  totals: { bookingTotal: 0, productTotal: 498.5, combinedTotal: 498.5 }, ...over,
});
const UNCERTAIN_MSG = 'We could not confirm your order. Tap Place Order again — it will not create a duplicate.';
const STORE_KEY = 'zutsav_checkout_attempt';

let alertSpy; let openURL;
const checkoutCalls = () => api.post.mock.calls.filter(([u]) => u === '/checkout/cart');
const keyOf = (i) => checkoutCalls()[i][1].idempotencyKey;
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

describe('CartScreen — safe retries (idempotency key)', () => {
  it('retrying after a timeout reuses the SAME key (the server then returns the original order)', async () => {
    api.post.mockRejectedValueOnce(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }));
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: UNCERTAIN_MSG }));

    api.post.mockResolvedValueOnce({ data: serverOK({ idempotentReplay: true }) });
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));

    expect(checkoutCalls()).toHaveLength(2);
    expect(keyOf(1)).toBe(keyOf(0));
    expect(await AsyncStorage.getItem(STORE_KEY)).toBeNull(); // attempt finished → key discarded
  });

  it('keeps the key across several uncertain failures (network, 5xx, "still processing")', async () => {
    await renderCart();
    fillForm();
    const failures = [
      new Error('Network Error'),
      { response: { status: 502, data: {} } },
      { response: { status: 409, data: { code: 'CHECKOUT_IN_PROGRESS', message: 'busy' } } },
    ];
    for (let i = 0; i < failures.length; i += 1) {
      api.post.mockRejectedValueOnce(failures[i]);
      await placeOrder();
      await waitFor(() => expect(checkoutCalls()).toHaveLength(i + 1));
      await waitFor(() => expect(Toast.show).toHaveBeenCalledTimes(i + 1));
    }
    expect(new Set([0, 1, 2].map(keyOf)).size).toBe(1);
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Your order is still being processed. Please try again in a moment.' });
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('survives an app restart: the persisted key is reused for the same cart', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());
    const firstKey = keyOf(0);
    expect(JSON.parse(await AsyncStorage.getItem(STORE_KEY)).key).toBe(firstKey);
    screen.unmount();

    api.post.mockResolvedValueOnce({ data: serverOK() });
    render(<CartScreen />); // a fresh screen instance over the same persisted cart
    await screen.findByText('Place Order');
    fillForm();
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(keyOf(1)).toBe(firstKey);
  });

  it('a server rejection (4xx) ends the attempt: the next tap gets a NEW key', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Only 1 unit of Incense in stock' } } });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Only 1 unit of Incense in stock' }));
    expect(await AsyncStorage.getItem(STORE_KEY)).toBeNull();

    api.post.mockResolvedValueOnce({ data: serverOK() });
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('changing the cart after an uncertain failure starts a new attempt (new key)', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('Increase quantity of Incense'));
    await waitFor(() => expect(useCartStore.getState().items.find((i) => i.productId === 'p2').quantity).toBe(2));
    api.post.mockResolvedValueOnce({ data: serverOK() });
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('a later, separate order never reuses the key of a completed one', async () => {
    api.post.mockResolvedValue({ data: serverOK() });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    screen.unmount();

    await act(async () => { useCartStore.setState({ items: CART }); }); // the customer buys the very same things again
    render(<CartScreen />);
    await screen.findByText('Place Order');
    fillForm();
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('a replayed order that is already paid goes to server verification, with no payment link', async () => {
    api.post.mockResolvedValue({ data: serverOK({ idempotentReplay: true, redirectUrl: undefined }) });
    await renderCart();
    fillForm();
    await placeOrder();
    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('PaymentVerify', {
      merchantTransactionId: 'ZUT_CART_1700000000000_abc123', orderId: 'ord1', type: 'marketplace',
    }));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('works when storage is unavailable (still sends a key; just no cross-restart reuse)', async () => {
    await renderCart();
    fillForm();
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('storage down')); // reading the saved attempt fails…
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('storage down')); // …and so does saving the new one
    api.post.mockResolvedValueOnce({ data: serverOK() });
    await placeOrder();
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(keyOf(0)).toMatch(/^zc_/);
  });
});
