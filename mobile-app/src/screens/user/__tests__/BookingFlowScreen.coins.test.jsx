import React from 'react';
import { Alert, Linking, Switch } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import BookingFlowScreen from '../BookingFlowScreen';

// Drives the REAL booking wizard to its Review step and exercises the coin-redemption behaviour that already ships:
// wallet context → eligibility → toggle → POST /bookings/create-phonepe-order → payment prompt. No new rules are
// asserted; every expectation mirrors the implementation and the backend contract in docs/MOBILE_F07_CHECKOUT_PARITY_AUDIT.md.
jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  imageUrl: (p) => p,
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/shared/AddressPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/shared/KitItemsSheet', () => ({ __esModule: true, default: () => null }));

const TXN = 'ZUT_1700000000000_abc123_deadbeef';
const POOJA = { _id: 'p1', name: 'Satyanarayan Katha', price: 1000, languages: ['Hindi'] };
const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

// Only `Date` is faked (mid-month, so "the 20th" is always a bookable normal-booking day); timers stay real.
const FAKE_NOW = new Date('2026-03-10T05:00:00.000Z');
const REAL_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'];

let walletResponse;
let partialPayment;
const serveGets = () => {
  api.get.mockImplementation(async (url) => {
    if (url === '/settings/public') return { data: { settings: {} } };
    if (url.startsWith('/bookings/pricing-preview')) {
      return { data: { pricing: { commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0 }, partialPayment } };
    }
    if (url.startsWith('/marketplace/kits/by-pooja')) return { data: { kits: [] } };
    if (url === '/wallet') {
      if (walletResponse instanceof Error) throw walletResponse;
      return walletResponse;
    }
    throw new Error(`unexpected GET ${url}`);
  });
};
const wallet = (over = {}) => ({ data: { wallet: { balance: 500, totalEarned: 500, totalRedeemed: 0, coinMonetaryValue: 0.5, coinRedemptionMinCoins: 100, ...over } } });
const created = (over = {}) => ({
  data: { success: true, booking: { _id: 'b0000000000000000000001' }, merchantTransactionId: TXN, redirectUrl: 'https://pay.example.invalid/redirect/x', chargeAmount: 750, ...over },
});

const tap = (label) => fireEvent.press(screen.getByText(label));
const toReview = async () => {
  render(<BookingFlowScreen navigation={navigation} route={{ params: { pooja: POOJA } }} />);
  await screen.findByText('Book Now');
  tap('Book Now');           // → type
  tap('Continue');           // normal booking → date
  tap('20');                 // 2026-03-20
  tap('Continue');           // → time
  tap('10:00');
  tap('Continue');           // → language (single language is preselected)
  tap('Continue');           // → details (profile pre-filled)
  tap('Continue');           // → review
  await screen.findByText('Review & Pay');
};
const toggleCoins = (on = true) => act(() => { fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', on); });
const payTap = () => fireEvent.press(screen.getByText(/^Pay ₹[\d,.]+( Now)? 🙏$/)); // the pay button only (not the "Pay Full Amount" subtitle)
const bookingBody = () => api.post.mock.calls[0][1];
const alertMessages = () => Alert.alert.mock.calls.map((c) => `${c[0]} | ${c[1]}`);

beforeEach(() => {
  jest.useFakeTimers({ now: FAKE_NOW, doNotFake: REAL_TIMERS });
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear();
  Object.values(navigation).forEach((f) => f.mockClear());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  walletResponse = wallet();
  partialPayment = { enabled: false };
  serveGets();
  useAuthStore.setState({ user: { _id: 'u1', name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru' } });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); useAuthStore.setState({ user: null }); });

describe('coin redemption — wallet context and eligibility', () => {
  it('reads GET /wallet and shows balance and the server-configured rate', async () => {
    await toReview();
    expect(api.get).toHaveBeenCalledWith('/wallet');
    expect(await screen.findByText('Use Coins')).toBeTruthy();
    expect(screen.getByText(/500 coins · ₹0\.5 each/)).toBeTruthy();
    expect(screen.queryByText(/Coins Applied/)).toBeNull(); // off until the user opts in
  });

  it.each([[null], [undefined], [0]])('offers no coin controls when coinMonetaryValue is %p (no assumed rate)', async (rate) => {
    walletResponse = wallet({ coinMonetaryValue: rate });
    await toReview();
    expect(screen.queryByText('Use Coins')).toBeNull();
    expect(screen.queryByText(/Coins Applied/)).toBeNull();
  });

  it('offers no coin controls when the wallet cannot be loaded', async () => {
    walletResponse = Object.assign(new Error('Network Error'), { request: {} });
    await toReview();
    expect(screen.queryByText('Use Coins')).toBeNull();
    expect(screen.getByText(/^Pay ₹1,000/)).toBeTruthy(); // booking still possible without coins
  });

  it('disables the switch and explains the minimum when the balance is under the threshold', async () => {
    walletResponse = wallet({ balance: 50, coinRedemptionMinCoins: 100 });
    await toReview();
    expect(await screen.findByText('Redemption requires at least 100 coins in your wallet')).toBeTruthy();
    expect(screen.UNSAFE_getByType(Switch).props.disabled).toBe(true);
    expect(screen.getByText(/^Pay ₹1,000/)).toBeTruthy();
  });

  it('enables the switch exactly at the threshold', async () => {
    walletResponse = wallet({ balance: 100, coinRedemptionMinCoins: 100 });
    await toReview();
    await screen.findByText('Use Coins');
    expect(screen.UNSAFE_getByType(Switch).props.disabled).toBe(false);
  });
});

describe('coin redemption — what is applied (display estimate) and bounded', () => {
  it('applies min(balance, floor(total / rate)) coins when toggled on', async () => {
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    expect(await screen.findByText('Coins Applied (500 coins)')).toBeTruthy(); // balance 500 < floor(1000/0.5)=2000
    expect(screen.getByText('Amount to Pay')).toBeTruthy();
    expect(screen.getByText(/^Pay ₹750/)).toBeTruthy();
  });

  it('never applies more coins than the payable allows', async () => {
    walletResponse = wallet({ balance: 5000, coinMonetaryValue: 3, coinRedemptionMinCoins: 0 });
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    expect(await screen.findByText('Coins Applied (333 coins)')).toBeTruthy(); // floor(1000 / 3)
    expect(screen.getByText(/^Pay ₹1 /)).toBeTruthy();
  });

  it('removes the redemption when toggled off again', async () => {
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins(true);
    await screen.findByText(/Coins Applied/);
    toggleCoins(false);
    await waitFor(() => expect(screen.queryByText(/Coins Applied/)).toBeNull());
    expect(screen.getByText('Grand Total')).toBeTruthy();
  });
});

describe('coin redemption — submission contract', () => {
  it('sends coinRedemptionCoins plus every existing required field to the single-booking endpoint', async () => {
    api.post.mockResolvedValue(created());
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    payTap();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    expect(api.post.mock.calls[0][0]).toBe('/bookings/create-phonepe-order');
    expect(bookingBody()).toMatchObject({
      poojaId: 'p1', scheduledDate: '2026-03-20', scheduledTime: '10:00', language: 'Hindi',
      withKit: false, isUrgent: false, paymentMode: 'FULL', coinRedemptionCoins: 500,
      userDetails: expect.objectContaining({ name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', city: 'Bengaluru' }),
    });
  });

  it('does not send a client-computed payable/discount — only the coin count', async () => {
    api.post.mockResolvedValue(created());
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    payTap();
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    for (const forbidden of ['amount', 'grandTotal', 'payableTotal', 'chargeAmount', 'coinValue', 'coinCoins', 'discount', 'finalPayable']) {
      expect(bookingBody()).not.toHaveProperty(forbidden);
    }
  });

  it('omits coinRedemptionCoins when coins are not used', async () => {
    api.post.mockResolvedValue(created({ chargeAmount: 1000 }));
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(bookingBody().coinRedemptionCoins).toBeUndefined();
  });

  it('omits coinRedemptionCoins when the wallet is ineligible', async () => {
    walletResponse = wallet({ balance: 10, coinRedemptionMinCoins: 100 });
    api.post.mockResolvedValue(created({ chargeAmount: 1000 }));
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(bookingBody().coinRedemptionCoins).toBeUndefined();
  });

  it('is the single-pooja flow: no coupon, products or cart fields are ever sent with coins', async () => {
    api.post.mockResolvedValue(created());
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    expect(screen.queryByPlaceholderText(/coupon/i)).toBeNull(); // no coupon UI in this phase
    payTap();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    for (const field of ['couponCode', 'couponId', 'products', 'bookings', 'items', 'shippingAddress']) {
      expect(bookingBody()).not.toHaveProperty(field);
    }
    expect(api.post.mock.calls[0][0]).not.toMatch(/checkout\/cart/);
  });
});

describe('payment initiation uses the SERVER charge amount', () => {
  it('shows the server chargeAmount in the payment prompt, not the local estimate', async () => {
    api.post.mockResolvedValue(created({ chargeAmount: 740 })); // local estimate is ₹750
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [title, message] = Alert.alert.mock.calls[0];
    expect(title).toBe('Complete Payment');
    expect(message).toContain('₹740');
    expect(message).not.toContain('₹750');
  });

  it('does not open the payment page or navigate to PaymentVerify until the user chooses Pay Now', async () => {
    api.post.mockResolvedValue(created());
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('failures and repeated taps', () => {
  it('shows the server message on rejection and never a success state', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { success: false, message: 'Coin redemption is not available right now' } } });
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    payTap();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Coin redemption is not available right now' }));
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('treats a 2xx without a booking id as a failure, not a success', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Booking failed' }));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('rapid repeated taps create exactly one booking request', async () => {
    let resolvePost;
    api.post.mockImplementation(() => new Promise((res) => { resolvePost = res; }));
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    const btn = screen.getByText(/^Pay ₹/);
    fireEvent.press(btn); fireEvent.press(btn); fireEvent.press(btn);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => { resolvePost(created()); });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('a tap after the booking exists re-presents its payment prompt instead of creating another booking', async () => {
    api.post.mockResolvedValue(created());
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('an unknown outcome (no server response) warns the user to check My Bookings rather than silently retrying', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }));
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(alertMessages()[0]).toMatch(/We could not confirm your booking/);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });
});

describe('server-authoritative charge amount (Day 15)', () => {
  const settled = (over = {}) => ({
    data: { success: true, booking: { _id: 'b0000000000000000000001', status: 'paid' }, paidWithCoins: true, merchantTransactionId: TXN, coinCoinsUsed: 1000, coinValueUsed: 1000, ...over },
  });
  const expectSafeFailure = () => {
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'We could not confirm the amount to pay. Your booking is saved — open it from My Bookings.' });
    expect(Toast.show).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(Alert.alert).not.toHaveBeenCalled();                       // no payment prompt with an invented amount
    expect(Linking.openURL).not.toHaveBeenCalled();                    // PhonePe never opened
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b0000000000000000000001' }); // server context preserved
    expect(navigation.replace).not.toHaveBeenCalledWith('PaymentVerify', expect.anything());
    expect(api.post).toHaveBeenCalledTimes(1);                         // booking creation is not repeated
  };

  it.each([
    ['missing', undefined],
    ['null', null],
    ['zero', 0],
    ['negative', -5],
    ['a non-numeric string', 'abc'],
    ['a numeric string (not the contract type)', '750'],
    ['Infinity', Infinity],
  ])('a payment link with a %s chargeAmount never opens PhonePe and never uses the local estimate', async (_label, amount) => {
    api.post.mockResolvedValue(created({ chargeAmount: amount }));
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/); // local estimate is ₹750 — it must not appear in a prompt
    payTap();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    expectSafeFailure();
  });

  it('a response with no payment link and no explicit paidWithCoins is a safe failure, not a success', async () => {
    api.post.mockResolvedValue({ data: { success: true, booking: { _id: 'b0000000000000000000001' }, merchantTransactionId: TXN } });
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    expectSafeFailure();
  });

  it('a fully coin-covered booking (paidWithCoins, no link, no chargeAmount) completes without a payment prompt', async () => {
    walletResponse = wallet({ balance: 5000, coinMonetaryValue: 1, coinRedemptionMinCoins: 0 });
    api.post.mockResolvedValue(settled());
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    expect(await screen.findByText('Coins Applied (1000 coins)')).toBeTruthy();
    payTap();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b0000000000000000000001' }));
    expect(bookingBody().coinRedemptionCoins).toBe(1000);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalledWith('PaymentVerify', expect.anything());
  });

  it('paidWithCoins together with a payment link but no chargeAmount is still not trusted', async () => {
    api.post.mockResolvedValue(created({ chargeAmount: undefined, paidWithCoins: true }));
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    expectSafeFailure();
  });

  it('a server rejection shows its message and creates nothing', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { success: false, message: 'Pooja not available' } } });
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Pooja not available' }));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('partial payment: sends PARTIAL + partialAmount and the prompt shows the server charge, not the full total', async () => {
    partialPayment = { enabled: true, minAmount: 100, mode: 'fixed', options: [300] };
    api.post.mockResolvedValue(created({ chargeAmount: 300, paymentMode: 'PARTIAL', remainingAmount: 700 }));
    await toReview();
    await screen.findByText('Pay Partial Amount');
    tap('Pay Partial Amount');
    await screen.findByText('Pay ₹300 Now 🙏');
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(bookingBody()).toMatchObject({ paymentMode: 'PARTIAL', partialAmount: 300 });
    const message = Alert.alert.mock.calls[0][1];
    expect(message).toContain('₹300');
    expect(message).not.toContain('₹1,000');
  });

  it('partial payment with an invalid server chargeAmount fails safely too', async () => {
    partialPayment = { enabled: true, minAmount: 100, mode: 'fixed', options: [300] };
    api.post.mockResolvedValue(created({ chargeAmount: null, paymentMode: 'PARTIAL' }));
    await toReview();
    await screen.findByText('Pay Partial Amount');
    tap('Pay Partial Amount');
    await screen.findByText('Pay ₹300 Now 🙏');
    payTap();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
    expectSafeFailure();
  });

  it('after an ambiguous (no-response) result a second tap does NOT send another booking request', async () => {
    api.post.mockRejectedValue(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }));
    await toReview();
    await screen.findByText('Use Coins');
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    payTap();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(alertMessages().every((m) => /We could not confirm your booking/.test(m))).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('keeps the coin-redemption request body exactly as before (no new fields)', async () => {
    api.post.mockResolvedValue(created());
    await toReview();
    await screen.findByText('Use Coins');
    toggleCoins();
    await screen.findByText(/Coins Applied/);
    payTap();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(Object.keys(JSON.parse(JSON.stringify(bookingBody()))).sort()).toEqual(
      ['coinRedemptionCoins', 'isUrgent', 'language', 'paymentMode', 'poojaId', 'scheduledDate', 'scheduledTime', 'userDetails', 'withKit'],
    );
  });
});
