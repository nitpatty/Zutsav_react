import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import { formatCurrency } from '../../../utils/helpers';
import OrdersScreen from '../OrdersScreen';
import OrderDetailScreen from '../OrderDetailScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

// An order as persisted by the unified checkout (checkout.controller.js): per-item rate/tax are the SERVER's.
//   Ghee   ₹100 × 2 @ 18%  → tax 36   → total 236
//   Incense ₹250 × 1 @ 5%  → tax 12.5 → total 262.5          payable 498.5
const unifiedOrder = (over = {}) => ({
  _id: 'order0000000000000000001', orderNumber: 'ORD-1001', status: 'paid', createdAt: '2026-03-02T09:15:00.000Z',
  totalAmount: 498.5, paymentProvider: 'phonepe', phonePeTransactionId: 'GT-TEST-1',
  shippingAddress: { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
  items: [
    { productId: 'p1', variantId: 'v1', name: 'Ghee', price: 100, quantity: 2, taxRate: 18, taxAmount: 36, total: 236 },
    { productId: 'p2', variantId: null, name: 'Incense', price: 250, quantity: 1, taxRate: 5, taxAmount: 12.5, total: 262.5 },
  ],
  ...over,
});

beforeEach(() => { api.get.mockReset(); Object.values(mockNav).forEach((f) => f.mockClear()); });

describe('OrdersScreen (history)', () => {
  it('lists orders with their server totals and opens the order detail on tap', async () => {
    api.get.mockResolvedValue({ data: { orders: [unifiedOrder()] } });
    render(<OrdersScreen />);

    expect(await screen.findByText(formatCurrency(498.5))).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/marketplace/orders/my', { params: { sort: '-createdAt', limit: 50 } });
    fireEvent.press(screen.getByText('2 item(s)'));
    expect(mockNav.navigate).toHaveBeenCalledWith('OrderDetail', { orderId: 'order0000000000000000001' });
  });

  it('shows the empty state when there are no orders', async () => {
    api.get.mockResolvedValue({ data: { orders: [] } });
    render(<OrdersScreen />);
    expect(await screen.findByText('No orders yet')).toBeTruthy();
  });
});

describe('OrderDetailScreen — server-persisted pricing', () => {
  const open = async (order) => {
    api.get.mockResolvedValue({ data: { order } });
    render(<OrderDetailScreen route={{ params: { orderId: order._id } }} />);
    await screen.findByText(`Order #${order.orderNumber}`);
  };

  it('loads the order from the marketplace order API (unchanged)', async () => {
    await open(unifiedOrder());
    expect(api.get).toHaveBeenCalledWith('/marketplace/orders/order0000000000000000001');
  });

  it('shows each item\'s stored tax and the stored totals — different catalog rates preserved, none invented', async () => {
    await open(unifiedOrder());
    expect(screen.getByText(/Qty: 2 × .*100.*\+ GST .*36.*\(18%\)/)).toBeTruthy();
    expect(screen.getByText(/Qty: 1 × .*250.*\+ GST .*12\.5.*\(5%\)/)).toBeTruthy();
    expect(screen.getByText(formatCurrency(236))).toBeTruthy();     // stored line totals
    expect(screen.getByText(formatCurrency(262.5))).toBeTruthy();
    expect(screen.getByText('Items subtotal')).toBeTruthy();
    expect(screen.getByText(formatCurrency(450))).toBeTruthy();     // Σ price×qty
    expect(screen.getByText('GST')).toBeTruthy();
    expect(screen.getByText(formatCurrency(48.5))).toBeTruthy();    // Σ stored taxAmount
    expect(screen.getByText(formatCurrency(498.5))).toBeTruthy();   // order.totalAmount, as stored
  });

  it('an untaxed / older order shows no GST rows at all', async () => {
    await open(unifiedOrder({
      totalAmount: 200,
      items: [{ productId: 'p1', name: 'Diya', price: 100, quantity: 2, total: 200 }],
    }));
    expect(screen.queryByText('GST')).toBeNull();
    expect(screen.queryByText('Items subtotal')).toBeNull();
    expect(screen.queryByText(/\+ GST/)).toBeNull();
    expect(screen.getAllByText(formatCurrency(200)).length).toBeGreaterThan(0);
  });

  it('a pending-payment order is shown as such, with no invoice offered', async () => {
    await open(unifiedOrder({ status: 'pending_payment' }));
    expect(screen.getByText('Pending Payment')).toBeTruthy();
    expect(screen.queryByText('Download Invoice')).toBeNull();
  });

  it('order invoice access is unchanged: a paid order offers Download Invoice → Invoice(order)', async () => {
    await open(unifiedOrder());
    fireEvent.press(screen.getByText('Download Invoice'));
    expect(mockNav.navigate).toHaveBeenCalledWith('Invoice', { type: 'order', id: 'order0000000000000000001' });
  });

  it('shows an error state without crashing when the order cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    render(<OrderDetailScreen route={{ params: { orderId: 'x' } }} />);
    await waitFor(() => expect(require('react-native-toast-message').default.show).toHaveBeenCalledWith({ type: 'error', text1: 'Could not load order' }));
  });
});
