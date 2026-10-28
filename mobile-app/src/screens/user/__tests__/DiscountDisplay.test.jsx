import React from 'react';
import { render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import BookingDetailScreen from '../BookingDetailScreen';
import OrderDetailScreen from '../OrderDetailScreen';
import { getCouponDisplay, getCoinDisplay } from '../../../utils/discountDisplay';

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
}));

const booking = (over = {}) => ({
  _id: 'b0000000000000000000001', status: 'confirmed', paymentStatus: 'FULLY_PAID', paymentMode: 'FULL',
  grandTotal: 1800, amountPaid: 1800, scheduledDate: '2026-03-01T06:30:00.000Z',
  poojaId: { name: 'Griha Pravesh' }, userDetails: { city: 'Pune' }, auditLog: [], ...over,
});
const order = (over = {}) => ({
  _id: 'order0000000000000000001', orderNumber: 'ORD-3001', status: 'paid', createdAt: '2026-03-02T09:15:00.000Z',
  totalAmount: 186, paymentProvider: 'phonepe', shippingAddress: { name: 'Asha', address: '12 Lane', city: 'Pune' },
  items: [{ productId: 'p1', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 }],
  statusTimeline: [], ...over,
});

const showBooking = async (b) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/bookings/b1') return { data: { booking: b } };
    throw new Error(`unexpected GET ${url}`);
  });
  render(<BookingDetailScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} route={{ params: { bookingId: 'b1' } }} />);
  await screen.findByText('Griha Pravesh');
};
const showOrder = async (o) => {
  api.get.mockResolvedValue({ data: { order: o } });
  render(<OrderDetailScreen route={{ params: { orderId: 'o1' } }} />);
  await screen.findByText(`Order #${o.orderNumber}`);
};

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

describe('discountDisplay helpers (persisted values only)', () => {
  it('returns a coupon only with a code AND a positive finite discount', () => {
    expect(getCouponDisplay({ couponCode: ' SAVE50 ', couponDiscount: 50 })).toEqual({ code: 'SAVE50', discount: 50 });
    expect(getCouponDisplay({ couponCode: 'SAVE50', couponDiscount: 0 })).toBeNull();
    expect(getCouponDisplay({ couponCode: 'SAVE50', couponDiscount: -5 })).toBeNull();
    expect(getCouponDisplay({ couponCode: 'SAVE50', couponDiscount: NaN })).toBeNull();
    expect(getCouponDisplay({ couponCode: 'SAVE50', couponDiscount: '50' })).toBeNull();
    expect(getCouponDisplay({ couponCode: null, couponDiscount: 50 })).toBeNull();
    expect(getCouponDisplay({ couponCode: '   ', couponDiscount: 50 })).toBeNull();
    expect(getCouponDisplay({})).toBeNull();
    expect(getCouponDisplay(null)).toBeNull();
  });

  it('returns coins only when both the count and the value are positive finite numbers', () => {
    expect(getCoinDisplay({ coinCoins: 20, coinValue: 20 })).toEqual({ coins: 20, value: 20 });
    expect(getCoinDisplay({ coinCoins: 0, coinValue: 0 })).toBeNull();
    expect(getCoinDisplay({ coinCoins: 20, coinValue: 0 })).toBeNull();
    expect(getCoinDisplay({ coinCoins: 0, coinValue: 20 })).toBeNull();
    expect(getCoinDisplay({ coinCoins: -1, coinValue: 5 })).toBeNull();
    expect(getCoinDisplay({ coinCoins: Infinity, coinValue: 5 })).toBeNull();
    expect(getCoinDisplay({ coinCoins: 5, coinValue: undefined })).toBeNull();
    expect(getCoinDisplay(undefined)).toBeNull();
  });
});

describe('BookingDetailScreen — persisted discounts', () => {
  it('shows a recorded coupon and keeps the persisted total as the Total Amount', async () => {
    await showBooking(booking({ couponCode: 'SAVE200', couponDiscount: 200 }));
    expect(screen.getByText('Coupon (SAVE200)')).toBeTruthy();
    expect(screen.getByText(/₹200 off/)).toBeTruthy();
    expect(screen.getByText('Total Amount')).toBeTruthy();
    expect(screen.getAllByText('₹1,800').length).toBeGreaterThan(0); // grandTotal / paid, unchanged
    expect(screen.queryByText(/Coins redeemed/)).toBeNull();
  });

  it('shows recorded coin redemption (count and value)', async () => {
    await showBooking(booking({ coinCoins: 150, coinValue: 75 }));
    expect(screen.getByText('Coins redeemed (150)')).toBeTruthy();
    expect(screen.getByText(/₹75 off/)).toBeTruthy();
    expect(screen.queryByText(/^Coupon \(/)).toBeNull();
    expect(screen.getAllByText('₹1,800').length).toBeGreaterThan(0);
  });

  it('shows no discount rows when the fields are absent (and invents nothing from the totals)', async () => {
    await showBooking(booking({ poojaAmount: 2000, grandTotal: 1800 }));
    expect(screen.queryByText(/^Coupon \(/)).toBeNull();
    expect(screen.queryByText(/Coins redeemed/)).toBeNull();
    expect(screen.queryByText(/ off$/)).toBeNull();
  });

  it('ignores zero, negative, NaN and code-less optional fields without rendering NaN/undefined', async () => {
    await showBooking(booking({ couponCode: 'X', couponDiscount: 0, coinCoins: 10, coinValue: 0 }));
    expect(screen.queryByText(/^Coupon \(/)).toBeNull();
    expect(screen.queryByText(/Coins redeemed/)).toBeNull();
    expect(screen.queryByText(/NaN|undefined|null/)).toBeNull();
  });

  it('ignores a coupon discount recorded without a code', async () => {
    await showBooking(booking({ couponCode: null, couponDiscount: 300, coinCoins: -4, coinValue: -2 }));
    expect(screen.queryByText(/^Coupon \(/)).toBeNull();
    expect(screen.queryByText(/Coins redeemed/)).toBeNull();
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });
});

describe('OrderDetailScreen — persisted coupon', () => {
  it('shows the recorded coupon as a deduction and leaves the persisted total unchanged', async () => {
    await showOrder(order({ couponCode: 'FEST50', couponDiscount: 50 }));
    expect(screen.getByText('Coupon (FEST50)')).toBeTruthy();
    expect(screen.getByText('−₹50')).toBeTruthy();
    expect(screen.getByText('₹186')).toBeTruthy(); // totalAmount exactly as persisted
    expect(screen.getByText('Items subtotal')).toBeTruthy();
    expect(screen.getByText('GST')).toBeTruthy();
  });

  it('shows no coupon row for an order without a coupon', async () => {
    await showOrder(order({ totalAmount: 236, couponCode: null, couponDiscount: 0 }));
    expect(screen.queryByText(/^Coupon \(/)).toBeNull();
    expect(screen.getAllByText('₹236')).toHaveLength(2); // item line total + persisted order total
  });

  it('ignores absent or malformed coupon fields and never renders NaN', async () => {
    await showOrder(order({ couponCode: 'X', couponDiscount: 'abc' }));
    expect(screen.queryByText(/^Coupon \(/)).toBeNull();
    expect(screen.queryByText(/NaN|undefined/)).toBeNull();
  });

  it('does not invent a coin line for orders, even if stray coin fields are present', async () => {
    await showOrder(order({ coinCoins: 50, coinValue: 50 }));
    expect(screen.queryByText(/Coins redeemed/)).toBeNull();
  });

  it('keeps the retry entry point for a pending-payment order that carries a coupon', async () => {
    await showOrder(order({ status: 'pending_payment', couponCode: 'FEST50', couponDiscount: 50 }));
    expect(screen.getByText('Retry Payment')).toBeTruthy();
    expect(screen.getByText('Coupon (FEST50)')).toBeTruthy();
  });
});
