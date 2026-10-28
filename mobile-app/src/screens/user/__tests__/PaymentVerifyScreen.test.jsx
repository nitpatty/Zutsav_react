import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import PaymentVerifyScreen from '../PaymentVerifyScreen';
import { useAuthStore } from '../../../store/authStore';
import { resetPaymentRecoveryState } from '../../../utils/paymentRecovery';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));

const CART_TXN = 'ZUT_CART_1700000000000_abc123';
const LEGACY_TXN = 'ZOM_1700000000000_abc123';
const nav = () => ({ replace: jest.fn(), navigate: jest.fn() });

// microtasks only — timers are advanced explicitly
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
const tick = (ms) => act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
const mount = async (params, navigation = nav()) => {
  render(<PaymentVerifyScreen navigation={navigation} route={{ params }} />);
  await flush();
  return navigation;
};

beforeEach(() => {
  jest.useFakeTimers();
  api.get.mockReset(); api.post.mockReset();
  resetPaymentRecoveryState();
  useAuthStore.setState({ user: { _id: 'u1', role: 'user' } });
});
afterEach(() => { jest.useRealTimers(); });

describe('PaymentVerifyScreen — endpoint selection', () => {
  it('marketplace checkout (ZUT_CART_) is verified on /checkout/verify/:txn', async () => {
    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1', status: 'paid' } } });
    await mount({ merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(`/checkout/verify/${CART_TXN}`);
  });

  it('a pending legacy marketplace order (ZOM_) still verifies on its own route', async () => {
    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1' } } });
    await mount({ merchantTransactionId: LEGACY_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(api.get).toHaveBeenCalledWith(`/marketplace/orders/verify-phonepe/${LEGACY_TXN}`);
  });

  it('booking payments keep /bookings/verify-phonepe/:txn', async () => {
    api.get.mockResolvedValue({ data: { success: true } });
    await mount({ merchantTransactionId: 'ZUT_B_1', bookingId: 'b1', type: 'booking' });
    expect(api.get).toHaveBeenCalledWith('/bookings/verify-phonepe/ZUT_B_1');
  });

  it('the default type is a booking (existing behaviour)', async () => {
    api.get.mockResolvedValue({ data: { success: true } });
    await mount({ merchantTransactionId: 'ZUT_B_2', bookingId: 'b1' });
    expect(api.get).toHaveBeenCalledWith('/bookings/verify-phonepe/ZUT_B_2');
  });

  it('remaining-balance payments keep /bookings/verify-remaining/:txn', async () => {
    api.get.mockResolvedValue({ data: { success: true } });
    await mount({ merchantTransactionId: 'ZUT_R_1', bookingId: 'b1', type: 'booking-remaining' });
    expect(api.get).toHaveBeenCalledWith('/bookings/verify-remaining/ZUT_R_1');
  });
});

describe('PaymentVerifyScreen — marketplace payment states', () => {
  const params = { merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' };

  it('success: shows Payment Successful and View Order opens the order detail', async () => {
    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1', status: 'paid' } } });
    const navigation = await mount(params);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    fireEvent.press(screen.getByText('View Order'));
    expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
  });

  it('an already-verified transaction is handled as success (safe repeat verification)', async () => {
    api.get.mockResolvedValue({ data: { success: true, alreadyVerified: true, order: { _id: 'ord1', status: 'paid' } } });
    await mount(params);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(1); // polling stopped
    await tick(10000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('pending is NOT success: keeps polling, then succeeds once the server confirms', async () => {
    api.get
      .mockResolvedValueOnce({ data: { success: false, state: 'PENDING', order: { _id: 'ord1', status: 'pending_payment' } } })
      .mockResolvedValueOnce({ data: { success: false, state: 'PENDING' } })
      .mockResolvedValue({ data: { success: true, order: { _id: 'ord1', status: 'paid' } } });
    await mount(params);
    expect(screen.getByText('Verifying Payment')).toBeTruthy();
    expect(screen.queryByText('Payment Successful!')).toBeNull();

    await tick(3000);
    expect(screen.queryByText('Payment Successful!')).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(2);

    await tick(3000);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('a terminal gateway failure shows Payment Failed with the code, offers View Order — and no booking-style retry', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED', order: { _id: 'ord1', status: 'pending_payment' } } });
    const navigation = await mount(params);
    expect(screen.getByText('Payment Failed')).toBeTruthy();
    expect(screen.getByText('PAYMENT_DECLINED')).toBeTruthy();
    expect(screen.queryByText('Retry Payment')).toBeNull();
    fireEvent.press(screen.getByText('View Order'));
    expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
    await tick(10000);
    expect(api.get).toHaveBeenCalledTimes(1); // stopped polling
  });

  it('transient network errors do not fail the payment — polling continues and recovers', async () => {
    api.get
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue({ data: { success: true, order: { _id: 'ord1' } } });
    await mount(params);
    expect(screen.queryByText('Payment Failed')).toBeNull();
    await tick(3000);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
  });

  it('an unknown/404 record keeps polling (never reported as paid)', async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: { message: 'Payment record not found' } } });
    await mount(params);
    await tick(6000);
    expect(screen.queryByText('Payment Successful!')).toBeNull();
    expect(screen.getByText('Verifying Payment')).toBeTruthy();
  });

  it('times out after 20 checks with Check Again, which verifies again', async () => {
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    await mount(params);
    await tick(3000 * 20);
    expect(screen.getByText('Still Confirming')).toBeTruthy();
    const callsAtTimeout = api.get.mock.calls.length;

    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1' } } });
    fireEvent.press(screen.getByText('Check Again'));
    await flush();

    expect(api.get.mock.calls.length).toBeGreaterThan(callsAtTimeout);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
  });

  it('a missing transaction id fails immediately without calling any endpoint', async () => {
    await mount({ orderId: 'ord1', type: 'marketplace' });
    expect(screen.getByText('Payment Failed')).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('PaymentVerifyScreen — retry transactions and late payments (marketplace)', () => {
  const RETRY_TXN = 'ZUT_CART_RETRY_1700000000000_abc123_deadbeef';

  it('a retry transaction (ZUT_CART_RETRY_…) is verified on /checkout/verify for the SAME order', async () => {
    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1', status: 'paid' } } });
    const navigation = await mount({ merchantTransactionId: RETRY_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(api.get).toHaveBeenCalledWith(`/checkout/verify/${RETRY_TXN}`);
    expect(screen.getByText('Payment Successful!')).toBeTruthy();
    fireEvent.press(screen.getByText('View Order'));
    expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
  });

  it('a failed marketplace payment points the customer back to the order to retry — no new order needed', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED', order: { _id: 'ord1', status: 'pending_payment' } } });
    const navigation = await mount({ merchantTransactionId: RETRY_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(screen.getByText('Payment Failed')).toBeTruthy();
    expect(screen.getByText('PAYMENT_DECLINED')).toBeTruthy();
    expect(screen.getByText(/Open it to retry the payment/)).toBeTruthy();
    fireEvent.press(screen.getByText('View Order'));
    expect(navigation.replace).toHaveBeenCalledWith('OrderDetail', { orderId: 'ord1' });
  });

  it('a payment the order could no longer accept (expired / duplicate) is NEVER shown as success and tells the customer not to pay again', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_NEEDS_REVIEW', state: 'COMPLETED', reconciliation: 'PAID_AFTER_EXPIRY', order: { _id: 'ord1', status: 'payment_failed' } } });
    await mount({ merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' });

    expect(screen.queryByText('Payment Successful!')).toBeNull();
    expect(screen.getByText('Payment Failed')).toBeTruthy();
    expect(screen.getByText(/We received your payment, but this order could no longer accept it/)).toBeTruthy();
    expect(screen.getByText(/do not pay again/)).toBeTruthy();
    expect(screen.queryByText(/Open it to retry the payment/)).toBeNull();
    await tick(10000);
    expect(api.get).toHaveBeenCalledTimes(1); // terminal — polling stopped
  });

  it('an expired order is not reported as verified (the server no longer answers alreadyVerified for it)', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_DECLINED', state: 'FAILED', order: { _id: 'ord1', status: 'payment_failed' } } });
    await mount({ merchantTransactionId: CART_TXN, orderId: 'ord1', type: 'marketplace' });
    expect(screen.queryByText('Payment Successful!')).toBeNull();
    expect(screen.getByText('Payment Failed')).toBeTruthy();
  });
});

describe('PaymentVerifyScreen — booking behaviour is unchanged', () => {
  it('a failed booking payment still offers Retry Payment on the same booking', async () => {
    api.get.mockResolvedValue({ data: { success: false, code: 'X', state: 'FAILED' } });
    api.post.mockResolvedValue({ data: { redirectUrl: 'https://pay.example.invalid/r', merchantTransactionId: 'ZUT_B_9' } });
    const navigation = await mount({ merchantTransactionId: 'ZUT_B_1', bookingId: 'b1', type: 'booking' });
    expect(screen.getByText('Retry Payment')).toBeTruthy();
    expect(screen.getByText('Your booking is saved — you can retry the same booking anytime.')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('a successful booking payment continues to the booking, not an order', async () => {
    api.get.mockResolvedValue({ data: { success: true } });
    const navigation = await mount({ merchantTransactionId: 'ZUT_B_1', bookingId: 'b1', type: 'booking' });
    fireEvent.press(screen.getByText('View Booking'));
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b1' });
  });
});
