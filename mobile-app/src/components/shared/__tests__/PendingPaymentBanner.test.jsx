import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PendingPaymentBanner from '../PendingPaymentBanner';
import { useAuthStore } from '../../../store/authStore';
import {
  savePendingPayment, removePendingPayment, recoverPendingPayments, resetPaymentRecoveryState,
} from '../../../utils/paymentRecovery';
import api from '../../../api/axios';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() }, setSessionExpiredHandler: jest.fn() }));

const BOOKING = { type: 'booking', merchantTransactionId: 'ZUT_1700000000000_abc123', bookingId: 'bk1' };
const OTHER_BOOKING = { type: 'booking', merchantTransactionId: 'ZUT_1700000000009_zzz999', bookingId: 'bk2' };
const REMAINING = { type: 'booking-remaining', merchantTransactionId: 'ZUT_REM_1700000000001_abc123', bookingId: 'bk1' };
const CART = { type: 'marketplace', merchantTransactionId: 'ZUT_CART_1700000000002_abc123', orderId: 'ord1' };

const nav = () => ({ navigate: jest.fn() });
const settle = () => act(async () => { await new Promise((r) => setImmediate(r)); });

beforeEach(() => {
  api.get.mockReset();
  resetPaymentRecoveryState();
  useAuthStore.setState({ user: { _id: 'u1', role: 'user' } });
});

describe('PendingPaymentBanner', () => {
  it('shows nothing when no payment is pending', async () => {
    render(<PendingPaymentBanner navigation={nav()} kind="booking" />);
    await settle();
    expect(screen.queryByTestId('pending-payment-banner')).toBeNull();
  });

  it('offers "Check status" for this customer\'s pending payment and opens the normal PaymentVerify screen with the stored context', async () => {
    await savePendingPayment('u1', BOOKING);
    const navigation = nav();
    render(<PendingPaymentBanner navigation={navigation} kind="booking" />);
    expect(await screen.findByTestId('pending-payment-banner')).toBeTruthy();
    expect(screen.getByText('A payment is still being confirmed')).toBeTruthy();
    expect(screen.getByText(/Do not pay again until it is confirmed/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Check payment status'));
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', {
      merchantTransactionId: BOOKING.merchantTransactionId, bookingId: 'bk1', orderId: undefined, type: 'booking',
    });
  });

  it('never states that a payment succeeded', async () => {
    await savePendingPayment('u1', BOOKING);
    render(<PendingPaymentBanner navigation={nav()} kind="booking" />);
    await screen.findByTestId('pending-payment-banner');
    expect(screen.queryByText(/successful|succeeded|payment confirmed|has been paid/i)).toBeNull();
  });

  it('is scoped by flow: booking screens show booking payments, order screens show marketplace payments', async () => {
    await savePendingPayment('u1', CART);
    render(<PendingPaymentBanner navigation={nav()} kind="booking" />);
    await settle();
    expect(screen.queryByTestId('pending-payment-banner')).toBeNull();

    render(<PendingPaymentBanner navigation={nav()} kind="marketplace" />);
    expect(await screen.findByTestId('pending-payment-banner')).toBeTruthy();
  });

  it('a booking-remaining payment counts as a booking payment', async () => {
    await savePendingPayment('u1', REMAINING);
    const navigation = nav();
    render(<PendingPaymentBanner navigation={navigation} kind="booking" bookingId="bk1" />);
    fireEvent.press(await screen.findByLabelText('Check payment status'));
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', expect.objectContaining({ type: 'booking-remaining' }));
  });

  it('on a detail screen it shows only THAT booking / order\'s payment', async () => {
    await savePendingPayment('u1', OTHER_BOOKING);
    render(<PendingPaymentBanner navigation={nav()} kind="booking" bookingId="bk1" />);
    await settle();
    expect(screen.queryByTestId('pending-payment-banner')).toBeNull();

    await savePendingPayment('u1', CART);
    render(<PendingPaymentBanner navigation={nav()} kind="marketplace" orderId="someOtherOrder" />);
    await settle();
    expect(screen.queryAllByTestId('pending-payment-banner')).toHaveLength(0);
  });

  it('never shows another account\'s pending payment', async () => {
    await savePendingPayment('u1', BOOKING);
    useAuthStore.setState({ user: { _id: 'u2', role: 'user' } });
    render(<PendingPaymentBanner navigation={nav()} kind="booking" />);
    await settle();
    expect(screen.queryByTestId('pending-payment-banner')).toBeNull();
  });

  it('disappears as soon as the payment is resolved (record removed) — no screen reload needed', async () => {
    await savePendingPayment('u1', BOOKING);
    render(<PendingPaymentBanner navigation={nav()} kind="booking" />);
    await screen.findByTestId('pending-payment-banner');
    await act(async () => { await removePendingPayment('u1', BOOKING.merchantTransactionId); });
    await waitFor(() => expect(screen.queryByTestId('pending-payment-banner')).toBeNull());
  });

  it('appears when a payment is handed off while the screen is already open', async () => {
    render(<PendingPaymentBanner navigation={nav()} kind="marketplace" orderId="ord1" />);
    await settle();
    expect(screen.queryByTestId('pending-payment-banner')).toBeNull();
    await act(async () => { await savePendingPayment('u1', CART); });
    expect(await screen.findByTestId('pending-payment-banner')).toBeTruthy();
  });

  it('tells its screen to re-read the booking/order when the server confirmed a payment in the background', async () => {
    await savePendingPayment('u1', CART);
    const onResolved = jest.fn();
    render(<PendingPaymentBanner navigation={nav()} kind="marketplace" orderId="ord1" onResolved={onResolved} />);
    await screen.findByTestId('pending-payment-banner');

    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1' } } });
    await act(async () => { await recoverPendingPayments('u1', { force: true }); });
    expect(onResolved).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('pending-payment-banner')).toBeNull());
  });

  it('shows nothing when signed out', async () => {
    await savePendingPayment('u1', BOOKING);
    useAuthStore.setState({ user: null });
    render(<PendingPaymentBanner navigation={nav()} kind="booking" />);
    await settle();
    expect(screen.queryByTestId('pending-payment-banner')).toBeNull();
  });
});
