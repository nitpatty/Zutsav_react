import React from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import PaymentVerifyScreen from '../PaymentVerifyScreen';
import { useAuthStore } from '../../../store/authStore';
import {
  PENDING_PAYMENT_KEY, loadPendingPayments, isVerificationActive, resetPaymentRecoveryState,
} from '../../../utils/paymentRecovery';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));

const BOOKING_TXN = 'ZUT_1700000000000_abc123';
const RETRY_TXN = 'ZUT_RETRY_1700000000009_abc123';
const CART_TXN = 'ZUT_CART_1700000000000_abc123';
const LEGACY_TXN = 'ZOM_1700000000000_abc123';
const PENDING = { data: { success: false, state: 'PENDING' } };
const PAID = { data: { success: true } };
const nav = () => ({ replace: jest.fn(), navigate: jest.fn() });

const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
const tick = (ms) => act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
const mount = async (params, navigation = nav()) => {
  render(<PaymentVerifyScreen navigation={navigation} route={{ params }} />);
  await flush();
  return navigation;
};
const stored = async () => loadPendingPayments('u1');

// A controllable AppState: `state` is what the screen reads; `emit` delivers a change event to its listener.
let listeners;
let appState;
const setAppState = (next) => { appState = next; };
const emit = async (next) => { setAppState(next); await act(async () => { listeners.slice().forEach((l) => l(next)); }); await flush(); };

beforeEach(() => {
  jest.useFakeTimers();
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear();
  resetPaymentRecoveryState();
  useAuthStore.setState({ user: { _id: 'u1', role: 'user' } });
  listeners = [];
  appState = 'active';
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  AppState.addEventListener = jest.fn((type, listener) => { listeners.push(listener); return { remove: () => { listeners = listeners.filter((l) => l !== listener); } }; });
});
afterEach(() => { jest.useRealTimers(); });

describe('recovery record', () => {
  it.each([
    ['booking', { merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking' }],
    ['remaining balance', { merchantTransactionId: 'ZUT_REM_1700000000001_abc123', bookingId: 'bk1', type: 'booking-remaining' }],
    ['marketplace', { merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' }],
    ['legacy marketplace', { merchantTransactionId: LEGACY_TXN, orderId: 'ord2', type: 'marketplace' }],
  ])('the %s payment is remembered while it is being verified, with the right identity', async (_n, params) => {
    api.get.mockResolvedValue(PENDING);
    await mount(params);
    expect(await stored()).toEqual([expect.objectContaining({ ...params, userId: 'u1' })]);
  });

  it('a server-confirmed payment closes the record', async () => {
    api.get.mockResolvedValue(PAID);
    await mount({ merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    expect(await stored()).toEqual([]);
  });

  it('a confirmed gateway failure closes the record (the order/booking remains retryable)', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_ERROR', state: 'FAILED' } });
    await mount({ merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking' });
    expect(screen.getByText('Payment Failed')).toBeTruthy();
    expect(await stored()).toEqual([]);
  });

  it('needs-review closes the record and tells the customer not to pay again', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_NEEDS_REVIEW', state: 'COMPLETED' } });
    await mount({ merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(screen.getByText(/do not pay again/i)).toBeTruthy();
    expect(await stored()).toEqual([]);
  });

  it('pending, network errors and unknown records NEVER erase it', async () => {
    api.get.mockResolvedValueOnce(PENDING).mockRejectedValueOnce(new Error('Network Error')).mockRejectedValue(Object.assign(new Error('nf'), { response: { status: 404 } }));
    await mount({ merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking' });
    await tick(3000); await tick(3000);
    expect(await stored()).toHaveLength(1);
  });

  it('a storage failure does not change the payment verdict', async () => {
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full')); // the pointer could not be written...
    api.get.mockResolvedValue(PAID);
    await mount({ merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking' });
    expect(screen.getByText('Payment Successful!')).toBeTruthy(); // ...which changes nothing about what the server said
  });

  it('registers the transaction as "being verified" while open, and releases it on unmount', async () => {
    api.get.mockResolvedValue(PENDING);
    const view = render(<PaymentVerifyScreen navigation={nav()} route={{ params: { merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking' } }} />);
    await flush();
    expect(isVerificationActive(BOOKING_TXN)).toBe(true);
    view.unmount();
    expect(isVerificationActive(BOOKING_TXN)).toBe(false);
  });
});

describe('a redirect or route parameter is never proof of payment', () => {
  it('success-looking route params do not show success; only the server response does', async () => {
    api.get.mockResolvedValue(PENDING);
    await mount({
      merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking',
      success: true, status: 'SUCCESS', code: 'PAYMENT_SUCCESS', state: 'COMPLETED', paid: 'true', alreadyVerified: true,
    });
    expect(screen.queryByText('Payment Successful!')).toBeNull();
    expect(screen.getByText('Verifying Payment')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(`/bookings/verify-phonepe/${BOOKING_TXN}`); // it asked the server
  });

  it('a transaction prefix alone does not decide anything either: the server\'s pending answer stands', async () => {
    api.get.mockResolvedValue({ data: { state: 'PENDING' } });
    await mount({ merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(screen.queryByText('Payment Successful!')).toBeNull();
  });
});

describe('lifecycle: background, foreground and the 60-second window', () => {
  const params = { merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' };

  it('no requests are made while the app is in the background (the user is paying in PhonePe)', async () => {
    api.get.mockResolvedValue(PENDING);
    setAppState('background');
    await mount(params);
    await tick(3000 * 10);
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByText('Still Confirming')).toBeNull(); // skipped ticks are not counted as checks
  });

  it('returning to the foreground verifies immediately (one request) — no need to force-close the app', async () => {
    api.get.mockResolvedValue(PENDING);
    setAppState('background');
    await mount(params);
    expect(api.get).not.toHaveBeenCalled();

    api.get.mockResolvedValue(PAID);
    await emit('active');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(`/checkout/verify/${CART_TXN}`);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
  });

  it('repeated foreground events while a check is running create ONE request (single flight)', async () => {
    let release;
    api.get.mockImplementation(() => new Promise((r) => { release = () => r(PENDING); }));
    await mount(params); // first check is now in flight
    expect(api.get).toHaveBeenCalledTimes(1);
    await emit('active'); await emit('active'); await emit('active');
    expect(api.get).toHaveBeenCalledTimes(1);
    release();
    await flush();
  });

  it('after 20 unconfirmed checks it says "Still Confirming" — NOT failed — and keeps the record', async () => {
    api.get.mockResolvedValue(PENDING);
    await mount(params);
    await tick(3000 * 20);
    expect(screen.getByText('Still Confirming')).toBeTruthy();
    expect(screen.queryByText('Payment Failed')).toBeNull();
    expect(screen.getByText(/kept on record/i)).toBeTruthy();
    expect(await stored()).toHaveLength(1);
  });

  it('polling stops at the timeout (no endless loop)', async () => {
    api.get.mockResolvedValue(PENDING);
    await mount(params);
    await tick(3000 * 20);
    const calls = api.get.mock.calls.length;
    await tick(3000 * 30);
    expect(api.get.mock.calls.length).toBe(calls);
  });

  it('coming back to a timed-out screen starts a fresh bounded window and can then confirm the payment', async () => {
    api.get.mockResolvedValue(PENDING);
    await mount(params);
    await tick(3000 * 20);
    expect(screen.getByText('Still Confirming')).toBeTruthy();
    const callsAtTimeout = api.get.mock.calls.length;

    api.get.mockResolvedValue(PAID);
    await emit('background');
    await emit('active');
    expect(api.get.mock.calls.length).toBeGreaterThan(callsAtTimeout);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    expect(await stored()).toEqual([]);
  });

  it('a terminal answer stops polling and later foreground events do nothing', async () => {
    api.get.mockResolvedValue(PAID);
    await mount(params);
    const calls = api.get.mock.calls.length;
    await emit('background'); await emit('active');
    await tick(3000 * 5);
    expect(api.get.mock.calls.length).toBe(calls);
  });

  it('a network error never becomes a failure: it keeps trying and recovers', async () => {
    api.get.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValue(PAID);
    await mount(params);
    expect(screen.queryByText('Payment Failed')).toBeNull();
    await tick(3000);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
  });
});

describe('Retry Payment on a failed booking — "already in flight" resumes, never charges twice', () => {
  const failedParams = { merchantTransactionId: BOOKING_TXN, bookingId: 'bk1', type: 'booking' };
  const failScreen = async (navigation) => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_ERROR', state: 'FAILED' } });
    await mount(failedParams, navigation);
    api.get.mockReset();
  };

  it('alreadyInFlight with a DIFFERENT transaction: verifies that one (no new payment, no browser)', async () => {
    const navigation = nav();
    await failScreen(navigation);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    api.post.mockResolvedValue({ data: { success: true, alreadyInFlight: true, redirectUrl: null, merchantTransactionId: RETRY_TXN } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/bookings/bk1/retry-payment');
    expect(navigation.replace).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: RETRY_TXN, bookingId: 'bk1', type: 'booking' });
    expect(open).not.toHaveBeenCalled();
    expect(await stored()).toEqual([expect.objectContaining({ merchantTransactionId: RETRY_TXN, type: 'booking' })]);
    open.mockRestore();
  });

  it('alreadyInFlight for the transaction already on screen: just checks it again', async () => {
    const navigation = nav();
    await failScreen(navigation);
    api.get.mockResolvedValue(PENDING);
    api.post.mockResolvedValue({ data: { success: true, alreadyInFlight: true, redirectUrl: null, merchantTransactionId: BOOKING_TXN } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledWith(`/bookings/verify-phonepe/${BOOKING_TXN}`);
    expect(screen.getByText('Verifying Payment')).toBeTruthy();
  });

  it('alreadyInFlight WITHOUT a usable transaction id: nothing is fabricated; the customer is sent to the booking', async () => {
    const navigation = nav();
    await failScreen(navigation);
    api.post.mockResolvedValue({ data: { success: true, alreadyInFlight: true, redirectUrl: null } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'bk1' });
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: 'A payment attempt is already in progress' }));
    expect(await stored()).toEqual([]);
  });

  it('a normal retry saves the record BEFORE opening the payment page, then verifies the new transaction', async () => {
    const navigation = nav();
    await failScreen(navigation);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    api.post.mockResolvedValue({ data: { success: true, redirectUrl: 'https://pay.example.invalid/x?t=1', merchantTransactionId: RETRY_TXN } });
    AsyncStorage.setItem.mockClear();
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();
    expect(open).toHaveBeenCalledWith('https://pay.example.invalid/x?t=1');
    expect(AsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
    expect(navigation.replace).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: RETRY_TXN, bookingId: 'bk1', type: 'booking' });
    open.mockRestore();
  });

  it.each([['http://pay.example.invalid/x'], ['javascript:alert(1)'], ['zutsav://x'], [null], ['https://127.0.0.1/x']])(
    'an unsafe payment link (%p) is refused: nothing opens, nothing navigates, nothing is stored',
    async (redirectUrl) => {
      const navigation = nav();
      await failScreen(navigation);
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      api.post.mockResolvedValue({ data: { success: true, redirectUrl, merchantTransactionId: RETRY_TXN } });
      fireEvent.press(screen.getByText('Retry Payment'));
      await flush();
      expect(open).not.toHaveBeenCalled();
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(await stored()).toEqual([]);
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
      open.mockRestore();
    },
  );

  it('the stored record never contains the payment URL or its query string', async () => {
    const navigation = nav();
    await failScreen(navigation);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    api.post.mockResolvedValue({ data: { success: true, redirectUrl: 'https://pay.example.invalid/x?token=SECRETQUERY', merchantTransactionId: RETRY_TXN } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();
    expect(await AsyncStorage.getItem(PENDING_PAYMENT_KEY)).not.toMatch(/SECRETQUERY|pay\.example|https/);
    open.mockRestore();
  });
});
