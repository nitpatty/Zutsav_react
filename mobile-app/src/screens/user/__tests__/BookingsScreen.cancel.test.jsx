import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import BookingsScreen from '../BookingsScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, setSessionExpiredHandler: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const item = (status) => ({
  _id: `booking-${status}-0001`, status, paymentStatus: 'FULLY_PAID', paymentMode: 'FULL',
  grandTotal: 2118, amountPaid: 2118, scheduledDate: '2026-03-01T06:30:00.000Z', scheduledTime: '10:00',
  poojaId: { name: `Pooja ${status}` }, userDetails: {}, paymentAttempts: [],
});

const renderList = async (status) => {
  api.get.mockResolvedValue({ data: { bookings: [item(status)] } });
  render(<BookingsScreen />);
  await screen.findByText(`Pooja ${status}`);
};

beforeEach(() => { api.get.mockReset(); mockNavigate.mockClear(); });

describe('F-23 — Cancel link in the My Bookings list', () => {
  it('is not offered for completion_requested (backend rejects cancelling it)', async () => {
    await renderList('completion_requested');
    expect(screen.queryByText('Cancel')).toBeNull();
    expect(screen.getByText('View Invoice')).toBeTruthy(); // the rest of the action row is unchanged
  });

  it.each(['completed'])('is not offered for %s', async (status) => {
    await renderList(status);
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it.each(['paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment'])(
    'is still offered for %s and opens the booking detail', async (status) => {
      await renderList(status);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockNavigate).toHaveBeenCalledWith('BookingDetail', { bookingId: `booking-${status}-0001` });
    },
  );
});
