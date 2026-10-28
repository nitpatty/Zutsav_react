import React from 'react';
import { Alert, Linking, Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatCurrency } from '../../../utils/helpers';
import { bookingStatusLabel, paymentStatusLabel, refundStatusLabel, paymentModeLabel } from '../../../utils/bookingStatusLabels';
import BookingsScreen from '../BookingsScreen';
import BookingDetailScreen from '../BookingDetailScreen';

// F-08 Phase 5: bookings list and booking details. Only the label of a KNOWN status/mode is translated; the values
// themselves, ids, amounts, persisted discount rows and every action/payload are exactly as before.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title }) => <Text>{`HEADER:${title}`}</Text> };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const hi = getTranslator('hi');
const en = getTranslator('en');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

const row = (over = {}) => ({
  _id: 'booking-0000000000000001', status: 'paid', paymentStatus: 'FULLY_PAID', paymentMode: 'FULL', grandTotal: 2118, amountPaid: 2118,
  scheduledDate: '2026-03-01T06:30:00.000Z', scheduledTime: '10:00', poojaId: { name: 'Griha Pravesh' }, userDetails: {}, paymentAttempts: [], ...over,
});
const detail = (over = {}) => ({
  _id: 'b0000000000000000000001', status: 'completed', paymentStatus: 'FULLY_PAID', paymentMode: 'FULL', grandTotal: 2118, amountPaid: 2118,
  scheduledDate: '2026-03-01T06:30:00.000Z', language: 'Hindi', specialNote: 'Early please',
  poojaId: { name: 'Griha Pravesh' }, panditId: { name: 'Pt. Sharma', phone: '9000000001', languages: ['Hindi', 'Sanskrit'], experience: 12 },
  userDetails: { address: '12 Test Lane', city: 'Pune', state: 'Maharashtra', pincode: '411001' }, auditLog: [], paymentAttempts: [], ...over,
});

beforeEach(() => {
  api.get.mockReset(); api.post.mockReset(); api.patch.mockReset();
  Toast.show.mockClear(); mockNavigate.mockClear(); Object.values(navigation).forEach((f) => f.mockClear());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  useAuthStore.setState({ user: { _id: 'u1', name: 'Asha' } });
});
afterEach(() => { jest.restoreAllMocks(); useAuthStore.setState({ user: null }); });

describe('booking status labels', () => {
  it('English equals the humanized values the app has always shown (including upper-case payment statuses and modes)', () => {
    const cases = {
      booking: [bookingStatusLabel, { pending_payment: 'Pending Payment', paid: 'Paid', pandit_assigned: 'Pandit Assigned', pandit_accepted: 'Pandit Accepted', pending_reassignment: 'Pending Reassignment', completion_requested: 'Completion Requested', completed: 'Completed', cancelled: 'Cancelled' }],
      payment: [paymentStatusLabel, { PENDING: 'PENDING', PARTIALLY_PAID: 'PARTIALLY PAID', FULLY_PAID: 'FULLY PAID', FAILED: 'FAILED' }],
      refund: [refundStatusLabel, { none: 'None', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', processed: 'Processed', completed: 'Completed' }],
      mode: [paymentModeLabel, { FULL: 'FULL', PARTIAL: 'PARTIAL' }],
    };
    Object.values(cases).forEach(([fn, map]) => Object.entries(map).forEach(([value, text]) => expect(fn(value, en)).toBe(text)));
  });

  it('every known value has a Hindi label different from English; unknown values keep the safe humanized fallback', () => {
    ['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment', 'completion_requested', 'completed', 'cancelled']
      .forEach((s) => expect(bookingStatusLabel(s, hi)).not.toBe(bookingStatusLabel(s, en)));
    ['PENDING', 'PARTIALLY_PAID', 'FULLY_PAID', 'REFUNDED', 'FAILED'].forEach((s) => expect(paymentStatusLabel(s, hi)).not.toBe(paymentStatusLabel(s, en)));
    expect(bookingStatusLabel('brand_new_status', hi)).toBe('Brand New Status');
    expect(paymentStatusLabel('constructor', hi)).toBe('Constructor');
    expect(refundStatusLabel(undefined, hi)).toBe('');
    expect(paymentModeLabel('SOMETHING_ELSE', hi)).toBe('SOMETHING ELSE');
  });
});

describe('BookingsScreen localization', () => {
  const renderList = async (items) => {
    api.get.mockResolvedValue({ data: { bookings: items } });
    render(<BookingsScreen />);
    await screen.findByText(`HEADER:${hi('bookings.title')}`);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
  };

  it('English is unchanged: title, chips, status badge, actions', async () => {
    api.get.mockResolvedValue({ data: { bookings: [row()] } });
    render(<BookingsScreen />);
    expect(await screen.findByText('Griha Pravesh')).toBeTruthy();
    expect(screen.getByText('HEADER:My Bookings')).toBeTruthy();
    ['All', 'Paid', 'Pandit Assigned', 'Pandit Accepted', 'Completed', 'Cancelled', 'Failed Payments'].forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.getByText('View Invoice')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('Hindi: title, filter chips, badge, journey and actions are translated; pooja name and amounts as received', async () => {
    await setLang('hi');
    await renderList([row()]);
    expect(await screen.findByText('Griha Pravesh')).toBeTruthy();
    [hi('shop.all'), hi('orders.statusPaid'), hi('bookings.stPanditAssigned'), hi('bookings.tabFailed'), hi('bookings.viewInvoice'), hi('common.cancel')]
      .forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.getByText(hi('bookings.jBooked'))).toBeTruthy();
    expect(screen.getByText(formatCurrency(2118))).toBeTruthy();
  });

  it('filter chips still send the stable status value, not the label', async () => {
    await setLang('hi');
    await renderList([row()]);
    fireEvent.press(screen.getAllByText(hi('bookings.stCompleted'))[0]);
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/bookings/my', { params: { page: 1, limit: 15, sort: '-createdAt', status: 'completed' } }));
    fireEvent.press(screen.getByText(hi('bookings.tabFailed')));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/bookings/my', { params: { page: 1, limit: 15, sort: '-createdAt', status: 'pending_payment' } }));
  });

  it('a pending-payment booking shows the PAYMENT status (translated) and the translated failure notice with the server reason as-is', async () => {
    await setLang('hi');
    await renderList([row({ status: 'pending_payment', paymentStatus: 'FAILED', paymentAttempts: [{ failureReason: 'Bank declined' }] })]);
    expect(await screen.findByText(hi('bookings.payFailed'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.failedWithReason', { reason: 'Bank declined' }))).toBeTruthy();
    expect(screen.getByText(hi('orders.retryPayment'))).toBeTruthy();
  });

  it('retry from the list still posts to the same booking endpoint with no body; success hands off to PaymentVerify', async () => {
    await setLang('hi');
    api.post.mockResolvedValue({ data: { merchantTransactionId: 'ZUT_1700000000000_abc123_deadbeef', redirectUrl: 'https://pay.example.invalid/redirect/x' } });
    await renderList([row({ status: 'pending_payment', paymentStatus: 'PENDING' })]);
    fireEvent.press(await screen.findByText(hi('orders.retryPayment')));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: 'ZUT_1700000000000_abc123_deadbeef', bookingId: 'booking-0000000000000001', type: 'booking' }));
    expect(api.post).toHaveBeenCalledWith('/bookings/booking-0000000000000001/retry-payment');
  });

  it('partial payment, pandit confirmation and kit-delivery lines are translated; AWB and names stay data', async () => {
    await setLang('hi');
    await renderList([row({
      status: 'pandit_accepted', paymentMode: 'PARTIAL', paymentStatus: 'PARTIALLY_PAID', amountPaid: 1000, remainingAmount: 1118,
      panditId: { name: 'Pt. Sharma' }, withKit: true, kitDelivery: { status: 'shipped', trackingId: 'AWB123' },
    })]);
    expect(await screen.findByText(hi('bookings.panditConfirmed', { name: 'Pt. Sharma' }))).toBeTruthy();
    expect(screen.getByText(hi('bookings.kitLine', { status: hi('bookings.kitShippedAwb', { id: 'AWB123' }) }))).toBeTruthy();
    expect(screen.getByText(hi('bookings.amountPaid'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.remaining'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.payRemaining', { amount: formatCurrency(1118) }))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('bookings.payRemaining', { amount: formatCurrency(1118) })));
    expect(mockNavigate).toHaveBeenCalledWith('BookingDetail', { bookingId: 'booking-0000000000000001' });
  });

  it('an unknown booking status never breaks the list: humanized fallback badge', async () => {
    await setLang('hi');
    await renderList([row({ status: 'brand_new_status' })]);
    expect(await screen.findByText('Brand New Status')).toBeTruthy();
  });

  it('empty and error states are translated', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { bookings: [] } });
    const first = render(<BookingsScreen />);
    expect(await screen.findByText(hi('bookings.emptyTitle'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.emptySub'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('bookings.browsePoojas')));
    expect(mockNavigate).toHaveBeenCalledWith('HomeTab');
    first.unmount();
    api.get.mockRejectedValue(new Error('x'));
    render(<BookingsScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('bookings.loadFailed') }));
  });
});

describe('BookingDetailScreen localization', () => {
  const route = { params: { bookingId: 'b1' } };
  const open = async (b, { refundPreview } = {}) => {
    api.get.mockImplementation(async (url) => {
      if (url === '/bookings/b1') return { data: { booking: b } };
      if (url === '/bookings/b1/refund-preview') return { data: { refundPreview: refundPreview || { grandTotal: 2118, refundableAmount: 1800, nonRefundableTotal: 318 } } };
      throw new Error(`unexpected GET ${url}`);
    });
    const view = render(<BookingDetailScreen navigation={navigation} route={route} />);
    await screen.findByText('Griha Pravesh');
    return view;
  };

  it('English is unchanged', async () => {
    await open(detail());
    ['Schedule', 'Date & Time', 'Assigned Pandit', 'Payment', 'Total Amount', 'Paid Amount', 'Payment Mode', 'Payment Status', 'Rate this Pooja', 'Download Invoice', 'Share Booking']
      .forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.queryByText('Booking Timeline')).toBeNull();            // Day 29: removed from the customer screen
    expect(screen.getByText('FULLY PAID')).toBeTruthy();
    expect(screen.getByText('FULL')).toBeTruthy();
    expect(screen.getByText('12 yrs')).toBeTruthy();
  });

  it('Hindi: headings, rows, statuses and mode are translated; server data and amounts are not', async () => {
    await setLang('hi');
    await open(detail({ status: 'paid' }));
    expect(screen.getByText(`HEADER:${hi('bookings.detailTitle')}`)).toBeTruthy();
    [hi('bookings.scheduleTitle'), hi('bookings.dateTime'), hi('bookings.panditTitle'), hi('orders.payment'), hi('orders.totalAmount'), hi('bookings.paidAmount'), hi('bookings.paymentMode'), hi('bookings.paymentStatus')]
      .forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.getByText(hi('bookings.payFull'))).toBeTruthy();       // payment status row
    expect(screen.getByText(hi('bookings.modeFull'))).toBeTruthy();
    expect(screen.getAllByText(hi('orders.statusPaid')).length).toBeGreaterThan(0);   // badge
    expect(screen.getByText(hi('bookings.years', { n: 12 }))).toBeTruthy();
    expect(screen.getByText('Pt. Sharma')).toBeTruthy();                 // pandit data
    expect(screen.getByText('Early please')).toBeTruthy();               // customer-entered note
    expect(screen.getAllByText(formatCurrency(2118)).length).toBeGreaterThan(0);
    expect(screen.getByText('12 Test Lane, Pune, Maharashtra, 411001')).toBeTruthy();
  });

  it('persisted coupon and coin rows come only from the recorded fields; totals are shown as stored; nothing is derived', async () => {
    await setLang('hi');
    const view = await open(detail({ couponCode: 'DIWALI10', couponDiscount: 100, coinCoins: 40, coinValue: 20 }));
    expect(screen.getByText(hi('orders.coupon', { code: 'DIWALI10' }))).toBeTruthy();
    expect(screen.getByText(hi('bookings.couponOff', { amount: formatCurrency(100) }))).toBeTruthy();
    expect(screen.getByText(hi('bookings.coinsRedeemed', { n: 40 }))).toBeTruthy();
    expect(screen.getByText(hi('bookings.couponOff', { amount: formatCurrency(20) }))).toBeTruthy();
    view.unmount();

    await open(detail({ grandTotal: 1500, amountPaid: 1500 }));          // total differs from anything "implied": no discount rows appear
    expect(screen.queryByText(/DIWALI|कूपन|सिक्के/)).toBeNull();
    expect(screen.getAllByText(formatCurrency(1500)).length).toBeGreaterThan(0);
  });

  it('refund card: translated labels and status badge; the refund data is unchanged', async () => {
    await setLang('hi');
    await open(detail({ status: 'cancelled', refund: { status: 'processed', eligibleAmount: 1800, refundedAmount: 1800 } }));
    expect(screen.getByText(hi('bookings.refundTitle'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.rfProcessed'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.eligibleAmount'))).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(1800)).length).toBe(2);
  });

  it('rating: translated modal; the request body and endpoint are unchanged', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await setLang('hi');
    await open(detail());
    fireEvent.press(await screen.findByText(hi('bookings.rate')));
    expect(await screen.findByText(hi('bookings.ratingTitle'))).toBeTruthy();
    fireEvent.press(screen.getByLabelText(hi('bookings.stars', { n: 4 })));
    fireEvent.changeText(screen.getByPlaceholderText(hi('bookings.reviewPlaceholder')), 'बहुत सुंदर पूजा');
    fireEvent.press(screen.getByText(hi('bookings.submit')));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/bookings/b1/rate', { rating: 4, review: 'बहुत सुंदर पूजा' }));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('bookings.thanks') }));
  });

  it('cancel: translated refund preview and buttons; the PATCH payload is unchanged', async () => {
    api.patch.mockResolvedValue({ data: { success: true } });
    await setLang('hi');
    await open(detail({ status: 'paid' }));
    fireEvent.press(screen.getAllByText(hi('bookings.cancelBooking'))[0]);
    expect(await screen.findByText(hi('bookings.totalPaid'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.refundable'))).toBeTruthy();
    expect(screen.getByText(hi('bookings.nonRefundable'))).toBeTruthy();
    expect(screen.getByText(formatCurrency(1800))).toBeTruthy();         // server refundable amount as received
    fireEvent.changeText(screen.getByPlaceholderText(hi('bookings.reasonPlaceholder')), 'तारीख बदल गई');
    fireEvent.press(screen.getByText(hi('bookings.confirmCancel')));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/bookings/b1/cancel', { reason: 'तारीख बदल गई' }));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('bookings.cancelled') }));
  });

  it('pay remaining: translated confirmation; the request and the booking-remaining hand-off are unchanged', async () => {
    api.post.mockResolvedValue({ data: { redirectUrl: 'https://pay.example.invalid/redirect/r', merchantTransactionId: 'ZUT_REM_1700000000000_abc123_deadbeef' } });
    await setLang('hi');
    await open(detail({ status: 'paid', paymentMode: 'PARTIAL', paymentStatus: 'PARTIALLY_PAID', amountPaid: 1000, remainingAmount: 1118 }));
    expect(screen.getByText(hi('bookings.pendingAmount'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('bookings.payRemaining', { amount: formatCurrency(1118) })));
    const [title, message, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi('bookings.payRemainingTitle'));
    expect(message).toBe(hi('bookings.payRemainingConfirm', { amount: formatCurrency(1118) }));
    expect(buttons.map((b) => b.text)).toEqual([hi('common.cancel'), hi('cart.payNow')]);
    await act(async () => { await buttons[1].onPress(); });
    expect(api.post).toHaveBeenCalledWith('/bookings/b1/pay-remaining');
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: 'ZUT_REM_1700000000000_abc123_deadbeef', bookingId: 'b1', type: 'booking-remaining' });
  });

  it('retry payment on a pending booking: translated button; same endpoint and PaymentVerify hand-off', async () => {
    api.post.mockResolvedValue({ data: { redirectUrl: 'https://pay.example.invalid/redirect/x', merchantTransactionId: 'ZUT_1700000000000_abc123_deadbeef' } });
    await setLang('hi');
    await open(detail({ status: 'pending_payment', paymentStatus: 'FAILED', amountPaid: 0, paymentAttempts: [{ initiatedAt: '2026-03-01T06:00:00.000Z', failureReason: 'Bank declined' }] }));
    expect(screen.getByText(hi('bookings.retryAttempts'))).toBeTruthy();
    expect(screen.getByText('Bank declined')).toBeTruthy();              // server-supplied reason, not translated
    fireEvent.press(screen.getByText(hi('orders.retryPayment')));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: 'ZUT_1700000000000_abc123_deadbeef', bookingId: 'b1', type: 'booking' }));
    expect(api.post).toHaveBeenCalledWith('/bookings/b1/retry-payment');
  });

  it('invoice navigation is unchanged and the share text is written in the UI language around the same data', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({});
    await setLang('hi');
    await open(detail({ status: 'paid' }));
    fireEvent.press(screen.getByText(hi('orders.downloadInvoice')));
    expect(navigation.navigate).toHaveBeenCalledWith('Invoice', { type: 'booking', id: 'b1' });
    fireEvent.press(screen.getByText(hi('bookings.share')));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const { message } = share.mock.calls[0][0];
    expect(message).toContain('Griha Pravesh');
    expect(message).toContain('Pt. Sharma');
    expect(message).toContain(formatCurrency(2118));
    expect(message).toContain(hi('orders.statusPaid'));
    expect(message).toContain('00000001');                               // the short booking id
    expect(message).toContain('zutsav.com/my-bookings');
  });

  it('not-found and load-error states are translated', async () => {
    await setLang('hi');
    api.get.mockRejectedValue(new Error('x'));
    render(<BookingDetailScreen navigation={navigation} route={route} />);
    expect(await screen.findByText(hi('bookings.notFound'))).toBeTruthy();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('bookings.detailLoadFailed') });
  });

  it('changing the language never issues a write and does not refetch the booking', async () => {
    await open(detail({ status: 'paid' }));
    const gets = api.get.mock.calls.length;
    await setLang('hi');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.get.mock.calls.length).toBe(gets);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.getByText(hi('bookings.scheduleTitle'))).toBeTruthy();
  });
});
