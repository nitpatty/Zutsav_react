import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../../api/axios';
import OrderDetailScreen from '../OrderDetailScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

let focusHandler;
const unsubscribe = jest.fn();
const mockNav = {
  navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(),
  addListener: jest.fn((event, handler) => { if (event === 'focus') focusHandler = handler; return unsubscribe; }),
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const ORDER_ID = 'order0000000000000000001';
const TXN2 = 'ZUT_CART_RETRY_1700000000000_abc123_deadbeef';
const STORE_KEY = 'zutsav_order_retry';
const order = (over = {}) => ({
  _id: ORDER_ID, orderNumber: 'ORD-2001', status: 'pending_payment', createdAt: '2026-03-02T09:15:00.000Z',
  totalAmount: 236, paymentProvider: 'phonepe', shippingAddress: { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  items: [{ productId: 'p1', variantId: 'v1', variantLabel: '500g', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 }],
  statusTimeline: [{ status: 'pending_payment', timestamp: '2026-03-02T09:15:00.000Z', note: '' }],
  ...over,
});
const retryOK = (over = {}) => ({ data: { success: true, orderId: ORDER_ID, merchantTransactionId: TXN2, redirectUrl: 'https://pay.example.invalid/redirect/x', order: order(), ...over } });
const http = (status, code, extra = {}) => ({ response: { status, data: { success: false, code, message: `server says ${code}`, ...extra } } });

let openURL;
const retryCalls = () => api.post.mock.calls.filter(([u]) => /retry-payment/.test(u));
const mount = async (o = order()) => {
  api.get.mockResolvedValue({ data: { order: o } });
  render(<OrderDetailScreen route={{ params: { orderId: ORDER_ID } }} />);
  await screen.findByText(`Order #${o.orderNumber}`);
};
const tapRetry = () => fireEvent.press(screen.getByText('Retry Payment'));

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); Toast.show.mockClear(); unsubscribe.mockClear(); focusHandler = undefined;
  Object.values(mockNav).forEach((f) => f.mockClear && f.mockClear());
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => openURL.mockRestore());

describe('retry action visibility (server-backed order state)', () => {
  it('is shown for a pending-payment order', async () => {
    await mount();
    expect(screen.getByText('Retry Payment')).toBeTruthy();
    expect(screen.getByText('Payment pending')).toBeTruthy();
  });

  it.each(['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'refunded'])('is NOT shown for a %s order', async (status) => {
    await mount(order({ status }));
    expect(screen.queryByText('Retry Payment')).toBeNull();
    expect(screen.queryByText('Payment pending')).toBeNull();
  });

  it('is not shown for an expired (payment_failed) order, which explains why', async () => {
    await mount(order({ status: 'payment_failed', statusTimeline: [{ status: 'payment_failed', timestamp: '2026-03-03T09:15:00.000Z', note: 'Expired: no payment received within 60 minutes' }] }));
    expect(screen.queryByText('Retry Payment')).toBeNull();
    expect(screen.getByText(/not paid in time and has been closed/)).toBeTruthy();
    expect(screen.getByText('Expired: no payment received within 60 minutes')).toBeTruthy(); // the audit trail is visible
  });

  it('is not shown for a cancelled order, which explains why', async () => {
    await mount(order({ status: 'cancelled' }));
    expect(screen.queryByText('Retry Payment')).toBeNull();
    expect(screen.getByText(/cancelled and can no longer be paid/)).toBeTruthy();
  });
});

describe('starting a retry', () => {
  it('posts ONLY the idempotency key to the order\'s retry endpoint — no amount, items or prices', async () => {
    api.post.mockResolvedValue(retryOK());
    await mount();
    tapRetry();
    await waitFor(() => expect(retryCalls()).toHaveLength(1));

    expect(retryCalls()[0][0]).toBe(`/checkout/orders/${ORDER_ID}/retry-payment`);
    const body = retryCalls()[0][1];
    expect(Object.keys(body)).toEqual(['idempotencyKey']);
    expect(body.idempotencyKey).toMatch(/^zc_[a-z0-9_]{16,}$/);
  });

  it('opens the server\'s https payment page, then verifies the NEW ZUT_CART_ transaction for the SAME order', async () => {
    api.post.mockResolvedValue(retryOK());
    await mount();
    tapRetry();

    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: TXN2, orderId: ORDER_ID, type: 'marketplace' }));
    expect(openURL).toHaveBeenCalledWith('https://pay.example.invalid/redirect/x');
    expect(TXN2.startsWith('ZUT_CART_')).toBe(true);
  });

  it('never creates a new order or re-prices: no checkout / legacy order endpoint is called', async () => {
    api.post.mockResolvedValue(retryOK());
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalled());
    expect(api.post.mock.calls.map(([u]) => u)).toEqual([`/checkout/orders/${ORDER_ID}/retry-payment`]);
  });

  it('the screen keeps showing the ORIGINAL order (same number, items, total) and never claims payment success', async () => {
    api.post.mockResolvedValue(retryOK());
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalled());
    expect(screen.getByText('Order #ORD-2001')).toBeTruthy();
    expect(screen.getByText(/Ghee \(500g\)/)).toBeTruthy();
    expect(screen.queryByText(/success|paid in full|payment successful/i)).toBeNull();
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('refuses to open a non-https payment link; nothing is opened and the user stays on the order', async () => {
    api.post.mockResolvedValue(retryOK({ redirectUrl: 'http://pay.example.invalid/x' }));
    await mount();
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'The payment link is not valid. Please try again later.' }));
    expect(openURL).not.toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('with no link in the response (nothing left to pay on that attempt) it goes to server verification, not to a link', async () => {
    api.post.mockResolvedValue(retryOK({ redirectUrl: undefined }));
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: TXN2, orderId: ORDER_ID, type: 'marketplace' }));
    expect(openURL).not.toHaveBeenCalled();
  });

  it('still tracks the payment if the device cannot open the link', async () => {
    openURL.mockRejectedValueOnce(new Error('no handler'));
    api.post.mockResolvedValue(retryOK());
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', expect.objectContaining({ merchantTransactionId: TXN2 })));
  });
});

describe('duplicate taps', () => {
  it('rapid repeated taps send ONE request while it is in flight', async () => {
    let release;
    api.post.mockReturnValue(new Promise((r) => { release = r; }));
    await mount();
    tapRetry();
    await waitFor(() => expect(retryCalls()).toHaveLength(1));
    fireEvent.press(screen.getByText('Opening payment…'));
    fireEvent.press(screen.getByText('Opening payment…'));
    await act(async () => {});
    expect(retryCalls()).toHaveLength(1);

    await act(async () => { release(retryOK()); });
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledTimes(1));
    expect(retryCalls()).toHaveLength(1);
  });

  it('two taps in the same tick still make a single request', async () => {
    api.post.mockResolvedValue(retryOK());
    await mount();
    const btn = screen.getByText('Retry Payment');
    await act(async () => { fireEvent.press(btn); fireEvent.press(btn); });
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalled());
    expect(retryCalls()).toHaveLength(1);
  });
});

describe('retry keys: same logical attempt vs a new one', () => {
  const keyOf = (i) => retryCalls()[i][1].idempotencyKey;

  it('after an uncertain outcome (timeout / network / 5xx / still setting up) the next tap REUSES the key', async () => {
    await mount();
    for (const failure of [
      Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }),
      new Error('Network Error'),
      http(502),
      http(409, 'CHECKOUT_IN_PROGRESS'),
    ]) {
      api.post.mockRejectedValueOnce(failure);
      const n = retryCalls().length;
      tapRetry();
      await waitFor(() => expect(retryCalls()).toHaveLength(n + 1));
      await waitFor(() => expect(Toast.show).toHaveBeenCalledTimes(n + 1));
    }
    expect(new Set([0, 1, 2, 3].map(keyOf)).size).toBe(1);
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'We could not start the payment. Tap Retry Payment again — it will not create a duplicate attempt.' });
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('the key survives an app restart (a fresh screen instance reuses it)', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await mount();
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());
    const first = keyOf(0);
    expect(JSON.parse(await AsyncStorage.getItem(STORE_KEY))[ORDER_ID].key).toBe(first);
    screen.unmount();

    api.post.mockResolvedValueOnce(retryOK());
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalled());
    expect(keyOf(1)).toBe(first);
  });

  it('after the server answered (attempt opened), the key is discarded — the next retry is a NEW attempt', async () => {
    api.post.mockResolvedValue(retryOK());
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledTimes(1));
    expect(await AsyncStorage.getItem(STORE_KEY)).toBeNull();

    mockNav.navigate.mockClear();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledTimes(1));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });
});

describe('server refusals and race outcomes', () => {
  it('an earlier attempt is still pending → goes to ITS verification (keeps the user on the same order flow)', async () => {
    api.post.mockRejectedValueOnce(http(409, 'PAYMENT_IN_PROGRESS', { merchantTransactionId: 'ZUT_CART_1700_inflight' }));
    await mount();
    tapRetry();
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: 'ZUT_CART_1700_inflight', orderId: ORDER_ID, type: 'marketplace' }));
    expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: 'An earlier payment attempt is still being processed.' });
    expect(await AsyncStorage.getItem(STORE_KEY)).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('the order turned out to be paid → says so and refreshes the order from the server (retry disappears)', async () => {
    api.post.mockRejectedValueOnce(http(409, 'ORDER_ALREADY_PAID', { alreadyPaid: true }));
    await mount();
    api.get.mockResolvedValue({ data: { order: order({ status: 'paid' }) } });
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'info', text1: 'This order has already been paid.' }));
    await waitFor(() => expect(screen.queryByText('Retry Payment')).toBeNull());
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('the payment window closed → says so and refreshes (the closed order shows its explanation)', async () => {
    api.post.mockRejectedValueOnce(http(409, 'ORDER_EXPIRED'));
    await mount();
    api.get.mockResolvedValue({ data: { order: order({ status: 'payment_failed' }) } });
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'The payment window for this order has closed. Please place a new order.' }));
    await waitFor(() => expect(screen.queryByText('Retry Payment')).toBeNull());
    expect(screen.getByText(/not paid in time/)).toBeTruthy();
  });

  it.each(['ORDER_CANCELLED', 'ORDER_NOT_PAYABLE'])('%s → shows the server message and refreshes', async (code) => {
    api.post.mockRejectedValueOnce(http(409, code));
    await mount();
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: `server says ${code}` }));
    expect(api.get.mock.calls.length).toBeGreaterThan(1);
  });

  it('the server could not confirm the earlier attempt → asks the user to wait; nothing opens', async () => {
    api.post.mockRejectedValueOnce(http(503, 'PAYMENT_STATUS_UNKNOWN'));
    await mount();
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'We could not confirm your earlier payment attempt. Please try again in a few minutes.' }));
    expect(openURL).not.toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalled();
  });

  it('a malformed 2xx body (e.g. a transaction id the app cannot verify) is an uncertain failure — nothing opens, key kept', async () => {
    api.post.mockResolvedValue({ data: { success: true, orderId: ORDER_ID, merchantTransactionId: 'ZOM_123', redirectUrl: 'https://pay.example.invalid/x' } });
    await mount();
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());
    expect(openURL).not.toHaveBeenCalled();
    expect(mockNav.navigate).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(STORE_KEY)).not.toBeNull();
  });

  it('a definite refusal re-enables the button (the user can try again)', async () => {
    api.post.mockRejectedValueOnce(http(400, 'IDEMPOTENCY_KEY_INVALID'));
    await mount();
    tapRetry();
    await waitFor(() => expect(Toast.show).toHaveBeenCalled());
    expect(screen.getByText('Retry Payment')).toBeTruthy();
  });
});

describe('the order is re-read from the server when the screen regains focus', () => {
  it('subscribes to focus and unsubscribes on unmount', async () => {
    await mount();
    expect(mockNav.addListener).toHaveBeenCalledWith('focus', expect.any(Function));
    screen.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('after returning from a successful payment the retry action is gone (server state wins)', async () => {
    await mount();
    expect(screen.getByText('Retry Payment')).toBeTruthy();
    api.get.mockResolvedValue({ data: { order: order({ status: 'paid' }) } });
    await act(async () => { await focusHandler(); });
    await waitFor(() => expect(screen.queryByText('Retry Payment')).toBeNull());
  });
});
