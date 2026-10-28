import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency } from '../../../utils/helpers';
import BookingFlowScreen from '../BookingFlowScreen';

// Samagri-kit choice in the REAL booking wizard. "Without Kit" must clear the selected kits (kitIds is an ARRAY of ids,
// the same shape the urgent-booking switch already resets to []), keep the user on the same step, and leave a booking
// request that carries no kit. No pricing or kit rule is asserted beyond what the implementation already does.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, imageUrl: (p) => p, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/shared/AddressPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/shared/KitItemsSheet', () => ({ __esModule: true, default: () => null }));

const TXN = 'ZUT_1700000000000_abc123_deadbeef';
const POOJA = { _id: 'p1', name: 'Satyanarayan Katha', price: 1000, languages: ['Hindi'] };
const KITS = [
  { _id: 'k1', name: 'Ganga Kit', description: 'd1', discountPrice: 200, items: [] },
  { _id: 'k2', name: 'Havan Kit', description: 'd2', discountPrice: 300, items: [] },
];
const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
const FAKE_NOW = new Date('2026-03-10T05:00:00.000Z');
const REAL_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'];

const serveGets = (kits = KITS) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/settings/public') return { data: { settings: {} } };
    if (url.startsWith('/bookings/pricing-preview')) {
      return { data: { pricing: { commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0 }, partialPayment: { enabled: false } } };
    }
    if (url.startsWith('/marketplace/kits/by-pooja')) return { data: { kits } };
    if (url === '/wallet') return { data: { wallet: { balance: 0 } } };
    throw new Error(`unexpected GET ${url}`);
  });
};
const created = (amount) => ({ data: { success: true, booking: { _id: 'b0000000000000000000001' }, merchantTransactionId: TXN, redirectUrl: 'https://pay.example.invalid/redirect/x', chargeAmount: amount } });

const tap = (label) => fireEvent.press(screen.getByText(label));
const bookingBody = () => api.post.mock.calls[0][1];
const kitCards = () => KITS.map((k) => screen.queryByText(k.name));

const openKitPreference = async () => {
  render(<BookingFlowScreen navigation={navigation} route={{ params: { pooja: POOJA } }} />);
  await screen.findByText('Book Now');
  tap('Book Now');
  tap('Continue');                                              // type → Samagri Kit preference
  await screen.findByText('Would you like to add a puja kit?');
};
const pickKits = async (...names) => {
  tap('With Kit');
  tap('Continue');                                              // → kit selection
  for (const name of names) fireEvent.press(await screen.findByText(name));
};
// date, time, (language is preselected), details (profile pre-filled) → review
const finishToReview = async () => {
  tap('20'); tap('Continue');
  tap('10:00'); tap('Continue');
  tap('Continue');                                              // language (preselected)
  tap('Continue');                                              // details (pre-filled)
  await screen.findByText('Review & Pay');
};

beforeEach(() => {
  jest.useFakeTimers({ now: FAKE_NOW, doNotFake: REAL_TIMERS });
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear(); Object.values(navigation).forEach((f) => f.mockClear());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  serveGets();
  useAuthStore.setState({ user: { _id: 'u1', name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru' } });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); useAuthStore.setState({ user: null }); });

describe('"Without Kit" in the Samagri Kit step', () => {
  it('does not throw when no kit was selected, stays on the step, and Continue goes straight to the date (no kit-selection step)', async () => {
    await openKitPreference();
    expect(() => tap('Without Kit')).not.toThrow();
    expect(screen.getByText('Would you like to add a puja kit?')).toBeTruthy();   // same step
    tap('Continue');
    expect(screen.getByText('Select Ceremony Date')).toBeTruthy();                 // the kit-selection step is skipped
    expect(screen.queryByText('Select Samagri Kits')).toBeNull();
  });

  it('a booking made after choosing "Without Kit" carries no kit and charges only the pooja', async () => {
    api.post.mockResolvedValue(created(1000));
    await openKitPreference();
    tap('Without Kit');
    tap('Continue');
    await finishToReview();
    expect(screen.queryByText(/Samagri Kit —/)).toBeNull();                        // no kit row in the breakdown
    expect(screen.getAllByText(formatCurrency(1000)).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByText(/^Pay ₹[\d,.]+ 🙏$/));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][0]).toBe('/bookings/create-phonepe-order');
    expect(bookingBody()).toMatchObject({ poojaId: 'p1', scheduledDate: '2026-03-20', scheduledTime: '10:00', withKit: false, isUrgent: false, paymentMode: 'FULL' });
    expect(bookingBody().kitIds).toBeUndefined();
    expect(JSON.stringify(bookingBody())).not.toMatch(/k1|k2/);
  });

  it('after kits were selected, "Without Kit" clears them: no stale kit in the review, the price or the request', async () => {
    api.post.mockResolvedValue(created(1000));
    await openKitPreference();
    await pickKits('Ganga Kit', 'Havan Kit');
    tap('Continue');                                                               // kit selection → date
    expect(screen.getByText('Select Ceremony Date')).toBeTruthy();
    tap('Back'); tap('Back');                                                      // date → kit selection → kit preference
    expect(screen.getByText('Would you like to add a puja kit?')).toBeTruthy();

    expect(() => tap('Without Kit')).not.toThrow();
    tap('Continue');
    expect(screen.getByText('Select Ceremony Date')).toBeTruthy();
    await finishToReview();
    expect(screen.queryByText(/Samagri Kit —/)).toBeNull();
    expect(screen.queryByText(formatCurrency(1500))).toBeNull();                   // 1000 + 200 + 300 would be the stale total
    fireEvent.press(screen.getByText(/^Pay ₹[\d,.]+ 🙏$/));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(bookingBody().withKit).toBe(false);
    expect(bookingBody().kitIds).toBeUndefined();
    expect(JSON.stringify(bookingBody())).not.toMatch(/k1|k2/);
  });

  it('the previous selection is really gone: choosing a kit again starts from an empty selection', async () => {
    await openKitPreference();
    await pickKits('Ganga Kit');
    tap('Back');                                                                   // kit selection → kit preference
    tap('Without Kit');
    tap('With Kit');
    tap('Continue');
    expect(await screen.findByText('Select at least one kit to continue')).toBeTruthy();   // nothing pre-selected any more
    tap('Continue');
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Select at least one kit' });
    expect(screen.getByText('Select Samagri Kits')).toBeTruthy();
  });

  it('choosing a real kit afterwards works as before: its price is added and exactly its id is sent', async () => {
    api.post.mockResolvedValue(created(1300));
    await openKitPreference();
    tap('Without Kit');
    await pickKits('Havan Kit');
    expect(screen.queryByText('Select at least one kit to continue')).toBeNull();
    tap('Continue');
    await finishToReview();
    expect(screen.getByText('Samagri Kit — Havan Kit')).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(1300)).length).toBeGreaterThan(0);   // 1000 + 300
    fireEvent.press(screen.getByText(/^Pay ₹[\d,.]+ 🙏$/));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(bookingBody()).toMatchObject({ withKit: true, kitIds: ['k2'] });
  });

  it('switching to an urgent booking still clears kits the same way (existing behaviour)', async () => {
    await openKitPreference();
    await pickKits('Ganga Kit');
    tap('Back'); tap('Back');                                                      // → type step
    expect(screen.getByText('Select Booking Type')).toBeTruthy();
    tap('Urgent Booking');
    tap('Continue');
    expect(screen.getByText('Select Ceremony Date')).toBeTruthy();                 // urgent bookings have no kit steps
    expect(kitCards().every((c) => c === null)).toBe(true);
  });

  it('a pooja without kits never shows the kit steps (unchanged)', async () => {
    serveGets([]);
    render(<BookingFlowScreen navigation={navigation} route={{ params: { pooja: POOJA } }} />);
    await screen.findByText('Book Now');
    tap('Book Now');
    tap('Continue');
    expect(screen.getByText('Select Ceremony Date')).toBeTruthy();
    expect(screen.queryByText('Without Kit')).toBeNull();
  });
});
