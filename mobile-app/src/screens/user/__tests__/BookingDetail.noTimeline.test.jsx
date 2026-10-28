import React from 'react';
import { render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import BookingDetailScreen from '../BookingDetailScreen';
import PanditBookingDetailScreen from '../../pandit/PanditBookingDetailScreen';
import OrderDetailScreen from '../OrderDetailScreen';
import { formatCurrency } from '../../../utils/helpers';

// Day 29 (issue A): the BOOKING TIMELINE card (Pandit Assigned / Pandit Accepted …) is removed from the customer Booking Detail
// screen and from the Pandit Booking Detail screen. Everything else on the customer screen stays, the shared Timeline component is
// untouched (the customer Order Detail still uses it), and no data, request or payload changed.

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/pandit/StickyActionBar', () => {
  const R = require('react');
  return { __esModule: true, default: ({ children }) => R.createElement(R.Fragment, null, children), useStickyActionBarHeight: () => 0, useTabBarClearance: () => 0 };
});
const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => jest.fn()) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const AUDIT = [
  { action: 'admin_note_added', at: '2026-02-20T08:00:00.000Z', note: 'Auto-assigned' },
  { action: 'payment_reminder_sent', at: '2026-02-20T09:30:00.000Z', note: '' },
];
const booking = (over = {}) => ({
  _id: 'b0000000000000000000001', status: 'pandit_accepted', paymentStatus: 'PARTIALLY_PAID', paymentMode: 'PARTIAL',
  grandTotal: 2118, amountPaid: 1000, remainingAmount: 1118, scheduledDate: '2026-03-01T06:30:00.000Z',
  couponCode: 'SAVE200', couponDiscount: 200, coinCoins: 20, coinValue: 20,
  poojaId: { name: 'Griha Pravesh' }, userDetails: { city: 'Pune', name: 'Asha' }, panditId: { name: 'Pt. Sharma' },
  auditLog: AUDIT, ...over,
});
// Labels unique to the timeline (the status names such as 'Pandit Accepted' also appear in the status badge, so they are not used here).
const TIMELINE_TEXT = ['Booking Timeline', 'Admin Note Added', 'Payment Reminder Sent', 'Auto-assigned'];

const serve = (b) => api.get.mockImplementation(async (url) => {
  if (url === '/bookings/b1') return { data: { booking: b } };
  throw new Error(`unexpected GET ${url}`);
});
const writes = () => [...api.post.mock.calls, ...api.patch.mock.calls];

describe('customer Booking Detail has no timeline, keeps everything else', () => {
  // Cold-start warm-up, as in BookingDetailScreen.test.jsx (Day 25): pay the heavy first render before any timed wait.
  beforeAll(async () => {
    serve(booking());
    const view = render(<BookingDetailScreen navigation={mockNav} route={{ params: { bookingId: 'b1' } }} />);
    await screen.findByText('Griha Pravesh', {}, { timeout: 60000 });
    view.unmount();
  }, 120000);
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.patch.mockReset(); });

  const open = async (b) => {
    serve(b);
    render(<BookingDetailScreen navigation={mockNav} route={{ params: { bookingId: 'b1' } }} />);
    await screen.findByText('Griha Pravesh');
  };

  it('does not render the timeline card or any audit event, even when the booking carries audit events', async () => {
    await open(booking());
    TIMELINE_TEXT.forEach((txt) => expect(screen.queryByText(txt)).toBeNull());
    expect(screen.queryByText('No activity yet')).toBeNull();      // not an empty timeline either
  });

  it('keeps payment info, totals, persisted coupon/coin rows and the booking actions', async () => {
    await open(booking());
    expect(screen.getByText('Date & Time')).toBeTruthy();
    expect(screen.getAllByText(formatCurrency(2118)).length).toBeGreaterThan(0);      // total
    expect(screen.getAllByText(formatCurrency(1000)).length).toBeGreaterThan(0);      // paid
    expect(screen.getAllByText(formatCurrency(1118)).length).toBeGreaterThan(0);      // remaining
    expect(screen.getByText('Coupon (SAVE200)')).toBeTruthy();
    expect(screen.getByText(/Coins redeemed/i)).toBeTruthy();
    expect(screen.getByText('Download Invoice')).toBeTruthy();
    expect(screen.getByText('Share Booking')).toBeTruthy();
    expect(screen.getByText('Cancel Booking')).toBeTruthy();
    expect(screen.getByText('Pt. Sharma')).toBeTruthy();
  });

  it('does not change what is requested or sent', async () => {
    await open(booking());
    expect(api.get.mock.calls.map(([u]) => u)).toEqual(['/bookings/b1']);
    expect(writes()).toEqual([]);
  });
});

describe('Pandit Booking Detail has no timeline either', () => {
  it('does not render the timeline card or audit events, and keeps the booking details', async () => {
    api.get.mockReset();
    serve(booking({ status: 'pandit_assigned' }));
    render(<PanditBookingDetailScreen route={{ params: { bookingId: 'b1' } }} />);
    expect(await screen.findByText('Griha Pravesh')).toBeTruthy();
    TIMELINE_TEXT.forEach((txt) => expect(screen.queryByText(txt)).toBeNull());
    expect(screen.queryByText('No activity yet')).toBeNull();
  });
});

describe('the shared Timeline component is not disabled', () => {
  it('the customer Order Detail still renders its order timeline', async () => {
    api.get.mockReset();
    api.get.mockResolvedValue({ data: { order: {
      _id: 'order0000000000000000001', orderNumber: 'ORD-3001', status: 'paid', createdAt: '2026-03-02T09:15:00.000Z',
      totalAmount: 236, paymentProvider: 'phonepe', shippingAddress: { name: 'Asha', address: '12 Lane', city: 'Pune' },
      items: [{ productId: 'p1', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 }],
      statusTimeline: [{ status: 'paid', timestamp: '2026-03-02T09:16:00.000Z', note: 'Paid via gateway' }],
    } } });
    render(<OrderDetailScreen route={{ params: { orderId: 'o1' } }} />);
    expect(await screen.findByText('Order Timeline')).toBeTruthy();
    expect(screen.getByText('Paid via gateway')).toBeTruthy();
  });
});
