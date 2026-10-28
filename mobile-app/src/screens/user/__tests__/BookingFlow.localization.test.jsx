import fs from 'fs';
import path from 'path';
import React from 'react';
import { Alert, Linking, Switch } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatCurrency } from '../../../utils/helpers';
import BookingFlowScreen from '../BookingFlowScreen';
import KitItemsSheet from '../../../components/shared/KitItemsSheet';

// F-08 Phase 5: the booking wizard. Only UI wording is translated. The booking request, ids, dates, language/payment-mode
// values, prices and every financial calculation are the same in every UI language, and a language switch while the
// wizard is open refreshes display text only (pooja / kit name & description) without touching the draft.

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, imageUrl: (p) => p, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title, subtitle }) => <Text>{`HEADER:${title}|${subtitle || ''}`}</Text> };
});
jest.mock('../../../components/shared/AddressPicker', () => ({ __esModule: true, default: () => null }));

const hi = getTranslator('hi');
const ta = getTranslator('ta');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

const TXN = 'ZUT_1700000000000_abc123_deadbeef';
const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };
const FAKE_NOW = new Date('2026-03-10T05:00:00.000Z');
const REAL_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'];

const NAMES = { en: 'Satyanarayan Katha', hi: 'सत्यनारायण कथा', ta: 'சத்தியநாராயண கதை' };
const KIT_NAMES = { en: 'Ganga Kit', hi: 'गंगा किट', ta: 'கங்கா கிட்' };
// The pooja passed through navigation (as from the list) and what the server returns on a refresh. The refresh response
// deliberately carries DIFFERENT prices/languages: none of those may reach the draft.
const poojaDoc = (lang, over = {}) => ({ _id: 'p1', name: NAMES[lang], shortDesc: `short-${lang}`, price: 1000, languages: ['Hindi'], ...over });
const kitDoc = (lang, over = {}) => ({ _id: 'k1', name: KIT_NAMES[lang], description: `kit-${lang}`, discountPrice: 200, items: [], ...over });

let calls; let kitsEnabled; let walletResponse; let partialPayment; let poojaGet; let refreshOver; let kitRefreshOver;
const langNow = () => useLanguageStore.getState().language;
const serveGets = () => {
  api.get.mockImplementation(async (url) => {
    calls.push({ url, lang: langNow() });
    if (url === '/settings/public') return { data: { settings: {} } };
    if (url.startsWith('/bookings/pricing-preview')) {
      return { data: { pricing: { commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0 }, partialPayment } };
    }
    if (url.startsWith('/marketplace/kits/by-pooja')) {
      const lang = langNow();
      return { data: { kits: kitsEnabled ? [kitDoc(lang, lang === 'en' ? {} : kitRefreshOver)] : [] } };
    }
    if (url === '/wallet') {
      if (walletResponse instanceof Error) throw walletResponse;
      return walletResponse;
    }
    if (url.startsWith('/poojas/')) {
      if (poojaGet) return poojaGet(url, langNow());
      const lang = langNow();
      return { data: { pooja: poojaDoc(lang, lang === 'en' ? {} : refreshOver) } };
    }
    throw new Error(`unexpected GET ${url}`);
  });
};
const wallet = (over = {}) => ({ data: { wallet: { balance: 500, coinMonetaryValue: 0.5, coinRedemptionMinCoins: 100, ...over } } });
const createdBody = (over = {}) => ({ data: { success: true, booking: { _id: 'b0000000000000000000001' }, merchantTransactionId: TXN, redirectUrl: 'https://pay.example.invalid/redirect/x', chargeAmount: 1000, ...over } });
const postCalls = () => api.post.mock.calls;
const bookingBody = () => postCalls()[0][1];
const getCalls = (prefix) => calls.filter((c) => c.url.startsWith(prefix));

const tap = (label) => fireEvent.press(screen.getByText(label));
const renderFlow = (params = { pooja: poojaDoc('en') }) => render(<BookingFlowScreen navigation={navigation} route={{ params }} />);

// Walks the wizard (labels differ by language; ids and the chosen values are the same).
const walk = async (L, { withKit = false, note } = {}) => {
  await screen.findByText(L('home.bookNow'));
  tap(L('home.bookNow'));
  tap(L('booking.continue'));                                   // type → (kit preference) / date
  if (withKit) {
    tap(L('booking.withKit'));
    tap(L('booking.continue'));
    fireEvent.press(await screen.findByText(KIT_NAMES[langNow()] || KIT_NAMES.en));
    tap(L('booking.continue'));
  }
  tap('20');
  tap(L('booking.continue'));
  tap('10:00');
  tap(L('booking.continue'));                                   // language is preselected (single language)
  tap(L('booking.continue'));                                   // details (profile pre-filled)
  if (note) fireEvent.changeText(screen.getByPlaceholderText(L('booking.notePlaceholder')), note);
  tap(L('booking.continue'));
  await screen.findByText(L('booking.reviewTitle'));
};
const reviewPay = (L, amount) => screen.getByText(L('booking.payBtn', { amount: formatCurrency(amount) }));

beforeEach(() => {
  jest.useFakeTimers({ now: FAKE_NOW, doNotFake: REAL_TIMERS });
  api.get.mockReset(); api.post.mockReset();
  Toast.show.mockClear(); Object.values(navigation).forEach((f) => f.mockClear());
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  calls = []; kitsEnabled = false; walletResponse = wallet(); partialPayment = { enabled: false }; poojaGet = null;
  refreshOver = { price: 9999, languages: ['Sanskrit'], durationValue: 99 };
  kitRefreshOver = { discountPrice: 999 };
  serveGets();
  useAuthStore.setState({ user: { _id: 'u1', name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru' } });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); useAuthStore.setState({ user: null }); });

describe('BookingFlowScreen localization — labels, validation and messages', () => {
  it('Hindi: step wording is translated from the overview to the review; server-localized pooja text is shown as received', async () => {
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    expect(await screen.findByText('HEADER:सत्यनारायण कथा|')).toBeTruthy();
    expect(screen.getByText(hi('booking.startingFrom'))).toBeTruthy();
    expect(screen.getByText(hi('booking.feesNote'))).toBeTruthy();
    expect(screen.getByText('short-hi')).toBeTruthy();
    tap(hi('home.bookNow'));
    expect(screen.getByText(hi('booking.typeTitle'))).toBeTruthy();
    expect(screen.getByText(hi('booking.normalTitle'))).toBeTruthy();
    expect(screen.getByText(hi('booking.urgentTag2'))).toBeTruthy();
    expect(screen.getByText(`HEADER:सत्यनारायण कथा|${hi('booking.stepOf', { n: 1, total: 6 })}`)).toBeTruthy();
    tap(hi('booking.continue'));
    expect(screen.getByText(hi('booking.dateTitle'))).toBeTruthy();
    expect(screen.getByText(hi('booking.dateInfoNormal'))).toBeTruthy();
  });

  it('English wording is unchanged', async () => {
    renderFlow();
    await screen.findByText('Book Now');
    expect(screen.getByText('Starting from')).toBeTruthy();
    tap('Book Now');
    expect(screen.getByText('Select Booking Type')).toBeTruthy();
    expect(screen.getByText('Scheduled ceremony')).toBeTruthy();
    expect(screen.getByText('HEADER:Satyanarayan Katha|Step 1 of 6')).toBeTruthy();
  });

  it('validation toasts are translated: date, time and details', async () => {
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    await screen.findByText(hi('home.bookNow'));
    tap(hi('home.bookNow')); tap(hi('booking.continue'));
    tap(hi('booking.continue'));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('booking.dateRequired') });
    tap('20'); tap(hi('booking.continue'));
    tap(hi('booking.continue'));
    expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('booking.timeRequired') });
  });

  it('review in Hindi: price breakdown and pay button are translated and the amounts are the same numbers', async () => {
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    [hi('booking.priceBreakdown'), hi('booking.poojaService'), hi('booking.gstExempt'), hi('booking.grandTotal'), hi('booking.trust'), hi('booking.editDetails')]
      .forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getAllByText(formatCurrency(1000)).length).toBeGreaterThan(0);
    expect(reviewPay(hi, 1000)).toBeTruthy();
    expect(screen.getByText(`${hi('booking.date')}:`)).toBeTruthy();
    expect(screen.getByText('Hindi')).toBeTruthy();                          // the pooja's language value is data, shown as supplied
  });

  it('Hindi booking sends the same request as English: ids, ISO date, slot, API language/payment-mode values, note', async () => {
    api.post.mockResolvedValue(createdBody());
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi, { note: 'ਕਿਰਪਾ ਕਰਕੇ ਸ਼ੰਖ ਲਿਆਓ' });
    fireEvent.press(reviewPay(hi, 1000));
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(postCalls()[0][0]).toBe('/bookings/create-phonepe-order');
    expect(bookingBody()).toMatchObject({
      poojaId: 'p1', scheduledDate: '2026-03-20', scheduledTime: '10:00', language: 'Hindi', specialNote: 'ਕਿਰਪਾ ਕਰਕੇ ਸ਼ੰਖ ਲਿਆਓ',
      withKit: false, isUrgent: false, paymentMode: 'FULL',
      userDetails: expect.objectContaining({ name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001' }),
    });
    expect(bookingBody().partialAmount).toBeUndefined();
    expect(bookingBody().coinRedemptionCoins).toBeUndefined();
  });

  it('the payment prompt shows the SERVER charge in the translated wording; Pay Now keeps the recovery hand-off', async () => {
    api.post.mockResolvedValue(createdBody({ chargeAmount: 1000 }));
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    fireEvent.press(reviewPay(hi, 1000));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [title, message, buttons, options] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi('cart.payTitle'));
    expect(message).toBe(hi('cart.payMessage', { amount: formatCurrency(1000) }));
    expect(buttons.map((b) => b.text)).toEqual([hi('cart.payNow'), hi('common.cancel')]);
    expect(options).toEqual({ cancelable: false });
    await act(async () => { await buttons[0].onPress(); });
    expect(Linking.openURL).toHaveBeenCalledWith('https://pay.example.invalid/redirect/x');
    expect(navigation.replace).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: TXN, bookingId: 'b0000000000000000000001', type: 'booking' });
  });

  it('an unusable payment link or a missing charge is reported in Hindi and never opens the gateway', async () => {
    await setLang('hi');
    api.post.mockResolvedValueOnce(createdBody({ redirectUrl: 'http://pay.example.invalid/x' }));
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    fireEvent.press(reviewPay(hi, 1000));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('booking.invalidLink') }));
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b0000000000000000000001' });
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('an unconfirmed booking (no answer) shows the translated "check My Bookings" alert and never auto-retries', async () => {
    await setLang('hi');
    api.post.mockRejectedValue(new Error('network down'));
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    fireEvent.press(reviewPay(hi, 1000));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [title, body, buttons] = Alert.alert.mock.calls[0];
    expect(title).toBe(hi('booking.uncertainTitle'));
    expect(body).toBe(hi('booking.uncertainBody'));
    expect(buttons.map((b) => b.text)).toEqual([hi('booking.checkMyBookings'), hi('booking.tryAgainAnyway')]);
    buttons[0].onPress();
    expect(navigation.navigate).toHaveBeenCalledWith('BookingsTab', { screen: 'BookingsList' });
    expect(postCalls()).toHaveLength(1);
  });

  it('a definitive server rejection shows the server message as-is; without one, the translated fallback', async () => {
    await setLang('hi');
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Slot unavailable' } } });
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    fireEvent.press(reviewPay(hi, 1000));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Slot unavailable' }));
    api.post.mockRejectedValueOnce({ response: { status: 400, data: {} } });
    fireEvent.press(reviewPay(hi, 1000));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('booking.bookingFailed') }));
  });

  it('coin redemption keeps its behaviour in Hindi: translated labels, same coin count in the request', async () => {
    api.post.mockResolvedValue(createdBody({ chargeAmount: 750 }));
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    expect(await screen.findByText(hi('booking.useCoins'))).toBeTruthy();
    expect(screen.getByText(hi('booking.coinBalance', { balance: 500, rate: 0.5 }))).toBeTruthy();
    act(() => { fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true); });
    expect(screen.getByText(hi('booking.coinSummary', { n: 500, amount: formatCurrency(250) }))).toBeTruthy();
    expect(screen.getByText(hi('booking.amountToPay'))).toBeTruthy();
    fireEvent.press(reviewPay(hi, 750));
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(bookingBody().coinRedemptionCoins).toBe(500);
  });

  it('partial payment keeps its rules in Hindi: translated prompts, same amounts and payment-mode value', async () => {
    partialPayment = { enabled: true, minAmount: 500, mode: 'fixed', options: [500, 700] };
    api.post.mockResolvedValue(createdBody({ chargeAmount: 500 }));
    await setLang('hi');
    renderFlow({ pooja: poojaDoc('hi') });
    await walk(hi);
    expect(screen.getByText(hi('booking.paymentOption'))).toBeTruthy();
    expect(screen.getByText(hi('booking.payFullSub', { amount: formatCurrency(1000) }))).toBeTruthy();
    tap(hi('booking.payPartial'));
    expect(screen.getByText(hi('booking.customAmount'))).toBeTruthy();
    expect(screen.getByText(hi('booking.payLater'))).toBeTruthy();
    expect(screen.getByText(hi('booking.totalBooking'))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('booking.payBtnPartial', { amount: formatCurrency(500) })));
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(bookingBody()).toMatchObject({ paymentMode: 'PARTIAL', partialAmount: 500 });
  });

  it('the kit sheet labels are translated and its data is untouched', async () => {
    await setLang('hi');
    render(<KitItemsSheet visible kit={{ name: 'गंगा किट', discountPrice: 200, items: [{ productId: { _id: 'x', name: 'Ganga Jal' }, quantity: 2 }] }} onClose={() => {}} />);
    expect(screen.getByText(hi('booking.kitItemsOne', { n: 1 }))).toBeTruthy();
    expect(screen.getByText(hi('booking.includedItems'))).toBeTruthy();
    expect(screen.getByText('Ganga Jal')).toBeTruthy();
    expect(screen.getByText(hi('booking.kitFootNote'))).toBeTruthy();
  });
});

describe('BookingFlowScreen — language switch while the wizard is open', () => {
  it('keeps the whole draft, refreshes display text only, issues GETs only and never changes a price', async () => {
    kitsEnabled = true;
    api.post.mockResolvedValue(createdBody({ chargeAmount: 1200 }));
    renderFlow();
    await walk(getTranslator('en'), { withKit: true, note: 'Please bring conch' });
    expect(screen.getByText('Samagri Kit — Ganga Kit')).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(1200)).length).toBeGreaterThan(0);          // 1000 pooja + 200 kit
    const getsBefore = calls.length;

    await setLang('hi');
    expect(await screen.findByText(hi('booking.kitLine', { name: 'गंगा किट' }))).toBeTruthy();   // kit name refreshed
    expect(screen.getByText(hi('booking.reviewTitle'))).toBeTruthy();                      // still on the review step
    expect(screen.getByText('HEADER:सत्यनारायण कथा|' + hi('booking.stepOf', { n: 8, total: 8 }))).toBeTruthy();   // pooja name refreshed, same step
    expect(screen.getAllByText(formatCurrency(1200)).length).toBeGreaterThan(0);           // the refresh's 9999 / 999 never reach the draft
    expect(screen.queryByText(formatCurrency(9999))).toBeNull();
    expect(screen.queryByText(formatCurrency(999))).toBeNull();
    expect(postCalls()).toHaveLength(0);                                                   // switching never creates a booking or payment

    const after = calls.slice(getsBefore);
    expect(after.map((c) => c.url).sort()).toEqual(['/marketplace/kits/by-pooja/p1', '/poojas/p1']);   // exactly the two display reads, once each
    expect(after.every((c) => c.lang === 'hi')).toBe(true);

    fireEvent.press(reviewPay(hi, 1200));
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    expect(bookingBody()).toMatchObject({
      poojaId: 'p1', scheduledDate: '2026-03-20', scheduledTime: '10:00', language: 'Hindi',      // not the refresh's ['Sanskrit']
      specialNote: 'Please bring conch', withKit: true, kitIds: ['k1'], isUrgent: false, paymentMode: 'FULL',
    });
  });

  it('keeps coin choice and payment-mode selection across a switch', async () => {
    partialPayment = { enabled: true, minAmount: 500, mode: 'fixed', options: [500] };
    api.post.mockResolvedValue(createdBody({ chargeAmount: 500 }));
    renderFlow();
    await walk(getTranslator('en'));
    act(() => { fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true); });
    tap('Pay Partial Amount');
    await setLang('hi');
    await screen.findByText('HEADER:सत्यनारायण कथा|' + hi('booking.stepOf', { n: 6, total: 6 }));
    expect(screen.getByText(hi('booking.coinSummary', { n: 500, amount: formatCurrency(250) }))).toBeTruthy();   // coins still applied
    expect(screen.getByText(hi('booking.customAmount'))).toBeTruthy();                                            // still the partial option
    expect(postCalls()).toHaveLength(0);
  });

  it('a slow reply for a superseded language cannot overwrite the current display text', async () => {
    const pending = {};
    poojaGet = (url, lang) => new Promise((resolve) => { pending[lang] = () => resolve({ data: { pooja: poojaDoc(lang, refreshOver) } }); });
    renderFlow();
    await screen.findByText('Book Now');
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText(`HEADER:${NAMES.ta}|`)).toBeTruthy();
    await act(async () => { pending.hi(); });                                              // arrives last, must be ignored
    expect(screen.getByText(`HEADER:${NAMES.ta}|`)).toBeTruthy();
    expect(screen.queryByText(`HEADER:${NAMES.hi}|`)).toBeNull();
  });

  it('opened with only the pooja id: a switch while loading shows the newest language, not the late older reply', async () => {
    const pending = {};
    poojaGet = (url, lang) => new Promise((resolve) => { pending[lang] = () => resolve({ data: { pooja: poojaDoc(lang) } }); });
    renderFlow({ poojaId: 'p1' });
    await waitFor(() => expect(pending.en).toBeTruthy());
    await setLang('hi');
    await waitFor(() => expect(pending.hi).toBeTruthy());
    await act(async () => { pending.hi(); });
    expect(await screen.findByText(`HEADER:${NAMES.hi}|`)).toBeTruthy();
    await act(async () => { pending.en(); });
    expect(screen.getByText(`HEADER:${NAMES.hi}|`)).toBeTruthy();
    expect(screen.queryByText(`HEADER:${NAMES.en}|`)).toBeNull();
  });

  it('a failed refresh keeps what is on screen and invents no translation', async () => {
    poojaGet = async () => { throw Object.assign(new Error('boom'), { response: { status: 500, data: {} } }); };
    renderFlow();
    await screen.findByText('Book Now');
    await setLang('hi');
    await waitFor(() => expect(getCalls('/poojas/')).toHaveLength(1));
    expect(screen.getByText('HEADER:Satyanarayan Katha|')).toBeTruthy();
    expect(screen.getByText('short-en')).toBeTruthy();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('no switch, no extra requests: an unchanged language never refetches', async () => {
    renderFlow();
    await screen.findByText('Book Now');
    const count = calls.length;
    await setLang('en');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toHaveLength(count);
  });
});

describe('scope guards', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('the booking, payment and invoice screens carry no WhatsApp-consent wording (that legal text lives only in auth)', () => {
    ['BookingFlowScreen.jsx', 'BookingsScreen.jsx', 'BookingDetailScreen.jsx', 'PaymentVerifyScreen.jsx'].forEach((f) => {
      expect(/consent/i.test(read(f))).toBe(false);
    });
  });

  it('the language refresh never posts: the wizard source issues only the one booking POST', () => {
    const posts = read('BookingFlowScreen.jsx').match(/api\.post\(/g) || [];
    expect(posts).toHaveLength(1);
  });
});
