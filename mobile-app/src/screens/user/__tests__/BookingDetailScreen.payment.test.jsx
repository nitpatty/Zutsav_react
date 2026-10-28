import React from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import BookingDetailScreen from '../BookingDetailScreen';
import { useAuthStore } from '../../../store/authStore';
import { loadPendingPayments, resetPaymentRecoveryState } from '../../../utils/paymentRecovery';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const TXN = 'ZUT_RETRY_1700000000009_abc123';
const REM_TXN = 'ZUT_REM_1700000000010_abc123';
const PAY_URL = 'https://pay.example.invalid/transact/pay?token=abc';
const route = { params: { bookingId: 'b1' } };
const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });

const booking = (over = {}) => ({
  _id: 'b1', bookingNumber: 'ZB-1', status: 'pending_payment', paymentStatus: 'FAILED', paymentMode: 'FULL',
  grandTotal: 2118, amountPaid: 0, remainingAmount: 0, scheduledDate: '2026-03-01T06:30:00.000Z',
  poojaId: { name: 'Griha Pravesh' }, userDetails: { city: 'Pune' }, auditLog: [], ...over,
});
const open = async (b, navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() }) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/bookings/b1') return { data: { booking: b } };
    throw new Error(`unexpected GET ${url}`);
  });
  render(<BookingDetailScreen navigation={navigation} route={route} />);
  await screen.findByText('Griha Pravesh');
  return navigation;
};
const stored = () => loadPendingPayments('u1');
let openURL;

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear();
  resetPaymentRecoveryState();
  useAuthStore.setState({ user: { _id: 'u1', role: 'user' } });
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => { openURL.mockRestore(); });

describe('Retry Payment', () => {
  it('saves the recovery record BEFORE opening the payment page, then verifies the new transaction', async () => {
    const navigation = await open(booking());
    api.post.mockResolvedValue({ data: { success: true, redirectUrl: PAY_URL, merchantTransactionId: TXN, chargeAmount: 2118 } });
    AsyncStorage.setItem.mockClear();
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/bookings/b1/retry-payment');
    expect(openURL).toHaveBeenCalledWith(PAY_URL);
    expect(AsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(openURL.mock.invocationCallOrder[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: TXN, bookingId: 'b1', type: 'booking' });
    expect(await stored()).toEqual([expect.objectContaining({ merchantTransactionId: TXN, bookingId: 'b1', type: 'booking' })]);
  });

  it('alreadyInFlight: verifies the transaction the SERVER returned — no second payment, no browser', async () => {
    const navigation = await open(booking());
    api.post.mockResolvedValue({ data: { success: true, alreadyInFlight: true, redirectUrl: null, merchantTransactionId: TXN } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: TXN, bookingId: 'b1', type: 'booking' });
    expect(await stored()).toEqual([expect.objectContaining({ merchantTransactionId: TXN })]);
  });

  it('alreadyInFlight without a usable transaction id: an honest "in progress" notice — nothing fabricated, nothing opened', async () => {
    const navigation = await open(booking());
    api.post.mockResolvedValue({ data: { success: true, alreadyInFlight: true, redirectUrl: null } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();

    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'info', text1: 'A payment attempt is already in progress' }));
    expect(await stored()).toEqual([]);
  });

  it.each([['http://pay.example.invalid/x'], ['javascript:alert(1)'], ['zutsav://x'], ['https://localhost/x']])(
    'an unsafe payment link (%s) is refused: no open, no navigation, no record',
    async (redirectUrl) => {
      const navigation = await open(booking());
      api.post.mockResolvedValue({ data: { success: true, redirectUrl, merchantTransactionId: TXN } });
      fireEvent.press(screen.getByText('Retry Payment'));
      await flush();
      expect(openURL).not.toHaveBeenCalled();
      expect(navigation.navigate).not.toHaveBeenCalled();
      expect(await stored()).toEqual([]);
      expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    },
  );

  it('a server rejection shows its message and starts nothing', async () => {
    const navigation = await open(booking());
    api.post.mockRejectedValue({ response: { status: 400, data: { message: 'This booking is not awaiting payment' } } });
    fireEvent.press(screen.getByText('Retry Payment'));
    await flush();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', text1: 'This booking is not awaiting payment' }));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe('Pay Remaining', () => {
  const partial = () => booking({ status: 'paid', paymentMode: 'PARTIAL', paymentStatus: 'PARTIALLY_PAID', amountPaid: 500, remainingAmount: 1618 });
  const confirmPayNow = async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fireEvent.press(screen.getByText(/Pay Remaining/));
    const buttons = alert.mock.calls[0][2];
    alert.mockRestore();
    await act(async () => { await buttons.find((b) => b.text === 'Pay Now').onPress(); });
    await flush();
  };

  it('opens the validated payment page after saving a booking-remaining record', async () => {
    const navigation = await open(partial());
    api.post.mockResolvedValue({ data: { success: true, redirectUrl: PAY_URL, merchantTransactionId: REM_TXN, remainingAmount: 1618 } });
    await confirmPayNow();
    expect(api.post).toHaveBeenCalledWith('/bookings/b1/pay-remaining');
    expect(openURL).toHaveBeenCalledWith(PAY_URL);
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: REM_TXN, bookingId: 'b1', type: 'booking-remaining' });
    expect(await stored()).toEqual([expect.objectContaining({ merchantTransactionId: REM_TXN, type: 'booking-remaining' })]);
  });

  it('409 "already in progress" resumes the transaction the server named — never a second payment', async () => {
    const navigation = await open(partial());
    api.post.mockRejectedValue({ response: { status: 409, data: { message: 'A remaining payment is already in progress for this booking', merchantTransactionId: REM_TXN } } });
    await confirmPayNow();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: REM_TXN, bookingId: 'b1', type: 'booking-remaining' });
    expect(await stored()).toEqual([expect.objectContaining({ merchantTransactionId: REM_TXN, type: 'booking-remaining' })]);
  });

  it('409 without a transaction id shows the server message and opens nothing', async () => {
    const navigation = await open(partial());
    api.post.mockRejectedValue({ response: { status: 409, data: { message: 'A remaining payment is already in progress for this booking' } } });
    await confirmPayNow();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', text1: 'A remaining payment is already in progress for this booking' }));
  });

  it('an unsafe payment link is refused', async () => {
    const navigation = await open(partial());
    api.post.mockResolvedValue({ data: { success: true, redirectUrl: 'http://pay.example.invalid/x', merchantTransactionId: REM_TXN } });
    await confirmPayNow();
    expect(openURL).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(await stored()).toEqual([]);
  });
});

describe('recovery banner on the booking', () => {
  it('shows "Check status" for THIS booking\'s pending payment and opens PaymentVerify; the banner is absent for another booking', async () => {
    const { savePendingPayment } = require('../../../utils/paymentRecovery');
    await savePendingPayment('u1', { type: 'booking', merchantTransactionId: TXN, bookingId: 'b1' });
    await savePendingPayment('u1', { type: 'booking', merchantTransactionId: 'ZUT_1700000000050_zzz999', bookingId: 'other' });
    const navigation = await open(booking());
    fireEvent.press(await screen.findByLabelText('Check payment status'));
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', expect.objectContaining({ merchantTransactionId: TXN, bookingId: 'b1', type: 'booking' }));
  });
});
