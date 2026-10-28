import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import { useNotificationStore } from '../../../store/notificationStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatDate, formatDateTime, formatDateWithOptions, getCalendarLabels } from '../../../i18n/formatters';
import { formatCurrency, formatDate as legacyFormatDate, formatDateTime as legacyFormatDateTime } from '../../../utils/helpers';
import BookingDetailScreen from '../BookingDetailScreen';
import OrdersScreen from '../OrdersScreen';
import OrderDetailScreen from '../OrderDetailScreen';
import WalletScreen from '../WalletScreen';
import NotificationsScreen from '../NotificationsScreen';
import FestivalsScreen from '../FestivalsScreen';

// Day 27: display formatting (dates, months, weekdays, time, relative time) follows the selected language on the
// customer screens. Money is NOT localized (INR keeps ₹ + Indian grouping + Latin digits in every language), and nothing
// that is sent, stored or calculated may change with the language: these tests also assert the requests made and the
// amounts shown are identical in English and Hindi.

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const hi = getTranslator('hi');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const DEVANAGARI = /[ऀ-ॿ]/;

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset && f.mockReset());
  Object.values(mockNav).forEach((f) => f.mockClear());
  useNotificationStore.setState({ notifications: [], unreadCount: 0, loading: false });
});

const writes = () => [...api.post.mock.calls, ...api.patch.mock.calls, ...api.delete.mock.calls];
const gets = () => api.get.mock.calls.map(([url]) => url);

describe('BookingDetailScreen — date/time localized, amounts and requests untouched', () => {
  const SCHEDULED = '2026-03-01T06:30:00.000Z';
  const booking = (over = {}) => ({
    _id: 'b0000000000000000000001', status: 'paid', paymentStatus: 'PARTIALLY_PAID', paymentMode: 'PARTIAL',
    grandTotal: 2118, amountPaid: 1000, remainingAmount: 1118, scheduledDate: SCHEDULED,
    poojaId: { name: 'Griha Pravesh' }, userDetails: { city: 'Pune' }, auditLog: [
      { action: 'status_changed_to_paid', at: '2026-02-20T08:00:00.000Z' },
    ], ...over,
  });
  const route = { params: { bookingId: 'b1' } };
  const open = async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/bookings/b1') return { data: { booking: booking() } };
      throw new Error(`unexpected GET ${url}`);
    });
    render(<BookingDetailScreen navigation={mockNav} route={route} />);
    await screen.findByText('Griha Pravesh');
  };

  // Same cold-start warm-up as BookingDetailScreen.test.jsx (Day 25): the first render of this screen is ~20x a later one, so
  // pay it before any test's timed waits instead of letting it land in whichever test runs first.
  beforeAll(async () => {
    api.get.mockImplementation(async () => ({ data: { booking: booking() } }));
    const view = render(<BookingDetailScreen navigation={mockNav} route={route} />);
    await screen.findByText('Griha Pravesh', {}, { timeout: 60000 });
    view.unmount();
  }, 120000);

  it('English: the date row is exactly what it was (the booking timeline itself was removed in Day 29)', async () => {
    await open();
    expect(screen.getAllByText(legacyFormatDateTime(SCHEDULED)).length).toBeGreaterThan(0);
    expect(screen.queryByText(legacyFormatDateTime('2026-02-20T08:00:00.000Z'))).toBeNull();   // no timeline entry date any more
  });

  it('Hindi: the date row uses Hindi month names with the same moment; amounts are the same text; nothing is sent', async () => {
    await setLang('hi');
    await open();
    const scheduled = formatDateTime(SCHEDULED, 'hi');
    expect(scheduled).toMatch(DEVANAGARI);
    expect(scheduled).not.toBe(legacyFormatDateTime(SCHEDULED));
    expect(scheduled.endsWith(legacyFormatDateTime(SCHEDULED).split(', ')[1])).toBe(true);   // same HH:mm — only the date words changed
    expect(screen.getAllByText(scheduled).length).toBeGreaterThan(0);
    expect(screen.queryByText(legacyFormatDateTime(SCHEDULED))).toBeNull();
    // money: identical strings to English, computed by the unchanged helper
    expect(screen.getAllByText(formatCurrency(2118)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatCurrency(1000)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatCurrency(1118)).length).toBeGreaterThan(0);
    // no booking/payment request was made because of formatting
    expect(gets()).toEqual(['/bookings/b1']);
    expect(writes()).toEqual([]);
  });

  it('switching the language re-renders the same booking in place: only date words change, no extra write', async () => {
    await open();
    const before = gets().length;
    await setLang('hi');
    await waitFor(() => expect(screen.getAllByText(formatDateTime(SCHEDULED, 'hi')).length).toBeGreaterThan(0));
    expect(screen.getAllByText(formatCurrency(2118)).length).toBeGreaterThan(0);
    expect(writes()).toEqual([]);
    expect(gets().slice(0, before)).toEqual(['/bookings/b1']);
    expect(gets().every((u) => u === '/bookings/b1')).toBe(true);
  });
});

describe('Orders and Order detail — dates localized, totals and requests untouched', () => {
  const order = {
    _id: 'order0000000000000000001', orderNumber: 'ORD-1001', status: 'paid', createdAt: '2026-03-02T09:15:00.000Z',
    totalAmount: 498.5, paymentProvider: 'phonepe',
    shippingAddress: { name: 'Asha', phone: '9111111111', address: '12 Lane', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    items: [{ productId: 'p1', variantId: 'v1', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 }],
    statusTimeline: [{ status: 'paid', timestamp: '2026-03-02T09:16:00.000Z' }],
  };

  it('Orders list (Hindi): the order date is localized, the amount is the unchanged ₹ text, the request is the same', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { orders: [order] } });
    render(<OrdersScreen />);
    expect(await screen.findByText(formatCurrency(498.5))).toBeTruthy();
    const date = formatDate(order.createdAt, 'dd MMM yyyy', 'hi');
    expect(date).toMatch(DEVANAGARI);
    expect(screen.getByText(date)).toBeTruthy();
    expect(screen.queryByText(legacyFormatDate(order.createdAt))).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/marketplace/orders/my', { params: { sort: '-createdAt', limit: 50 } });
  });

  it('Orders list (English): date unchanged', async () => {
    api.get.mockResolvedValue({ data: { orders: [order] } });
    render(<OrdersScreen />);
    expect(await screen.findByText(legacyFormatDate(order.createdAt))).toBeTruthy();
  });

  it('Order detail (Hindi): order date-time and the timeline are localized, every amount is the unchanged text', async () => {
    await setLang('hi');
    api.get.mockResolvedValue({ data: { order } });
    render(<OrderDetailScreen route={{ params: { orderId: order._id } }} />);
    expect(await screen.findByText(formatDateTime(order.createdAt, 'hi'))).toBeTruthy();
    expect(screen.getByText(formatDateTime('2026-03-02T09:16:00.000Z', 'hi'))).toBeTruthy();   // timeline (shared component)
    expect(screen.getAllByText(formatCurrency(498.5)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatCurrency(236)).length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(`/marketplace/orders/${order._id}`);
  });
});

describe('WalletScreen — transaction date localized, nothing written', () => {
  const OPTIONS = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const CREATED = '2026-03-01T06:30:00.000Z';
  const serve = () => api.get.mockImplementation(async (url) => {
    if (url === '/wallet') return { data: { wallet: { balance: 120, totalEarned: 200, totalRedeemed: 80, coinMonetaryValue: 0.5, coinRedemptionMinCoins: 100 } } };
    if (url.startsWith('/wallet/transactions')) {
      return { data: { transactions: [{ _id: 't1', type: 'REFERRAL_BOOKING_REWARD', direction: 'CREDIT', amount: 50, description: 'Booking reward', createdAt: CREATED }], total: 1 } };
    }
    throw new Error(`unexpected GET ${url}`);
  });

  it('English: same text as before; Hindi: Hindi month name, same moment', async () => {
    serve();
    const english = render(<WalletScreen />);
    expect(await screen.findByText(new Date(CREATED).toLocaleDateString('en-IN', OPTIONS))).toBeTruthy();
    english.unmount();

    await setLang('hi');
    api.get.mockClear();
    serve();
    render(<WalletScreen />);
    const localized = formatDateWithOptions(new Date(CREATED), OPTIONS, 'hi');
    expect(localized).toMatch(DEVANAGARI);
    expect(await screen.findByText(localized)).toBeTruthy();
    expect(writes()).toEqual([]);
    expect(gets().sort()).toEqual(['/wallet', '/wallet/transactions?page=1&limit=20']);
  });
});

describe('NotificationsScreen — relative time localized, read state untouched', () => {
  const serve = (createdAt) => api.get.mockImplementation(async (url) => {
    if (url.startsWith('/notifications/unread-count')) return { data: { count: 1 } };
    if (url.startsWith('/notifications')) {
      return { data: { notifications: [{ _id: 'n1', title: 'T1', message: 'M1', isRead: false, type: 'general', data: {}, createdAt }] } };
    }
    throw new Error(`unexpected GET ${url}`);
  });

  it('English keeps the date-fns wording', async () => {
    serve(new Date(Date.now() - 5 * 60000).toISOString());
    render(<NotificationsScreen />);
    expect(await screen.findByText('5 minutes ago')).toBeTruthy();
  });

  it('Hindi shows the Hindi dictionary wording and makes no read/delete request', async () => {
    await setLang('hi');
    serve(new Date(Date.now() - 5 * 60000).toISOString());
    render(<NotificationsScreen />);
    expect(await screen.findByText(hi('common.agoMinutes', { n: 5 }))).toBeTruthy();
    expect(screen.queryByText('5 minutes ago')).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('an unparseable timestamp renders the dash rather than "Invalid Date"', async () => {
    await setLang('hi');
    serve('not-a-date');
    render(<NotificationsScreen />);
    expect(await screen.findByText('T1')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(/Invalid/)).toBeNull();
  });
});

describe('FestivalsScreen — month title and festival date localized, date-only value not shifted', () => {
  const now = new Date();
  const serve = () => api.get.mockResolvedValue({ data: { festivals: [{ _id: 'f1', name: 'Holi', date: '2026-03-05', description: 'd' }] } });

  it('English: the existing "March 2026"-style title and "Thursday, 05 March 2026" date', async () => {
    serve();
    render(<FestivalsScreen />);
    expect(await screen.findByText('Holi')).toBeTruthy();
    expect(screen.getByText(`${getCalendarLabels('en').monthName(now.getMonth())} ${now.getFullYear()}`)).toBeTruthy();
    expect(screen.getByText(legacyFormatDate('2026-03-05', 'EEEE, dd MMMM yyyy'))).toBeTruthy();
    expect(screen.getByText('Thursday, 05 March 2026')).toBeTruthy();
  });

  it('Hindi: Hindi month title and Hindi weekday/month for the same calendar day; the request is unchanged', async () => {
    await setLang('hi');
    serve();
    render(<FestivalsScreen />);
    expect(await screen.findByText('Holi')).toBeTruthy();
    const title = getCalendarLabels('hi').monthTitle(now.getFullYear(), now.getMonth());
    expect(title).toMatch(DEVANAGARI);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText('गुरुवार, 05 मार्च 2026')).toBeTruthy();      // 5 March 2026 is a Thursday, whatever the time zone
    expect(screen.queryByText('Thursday, 05 March 2026')).toBeNull();
    expect(api.get.mock.calls[0]).toEqual(['/festivals', { params: { year: now.getFullYear(), month: now.getMonth() + 1 } }]);
  });
});
