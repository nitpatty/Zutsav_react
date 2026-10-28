import React from 'react';
import { render, screen } from '@testing-library/react-native';
import api from '../../../api/axios';
import PanditRatingsScreen from '../PanditRatingsScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/pandit/StickyActionBar', () => ({ useTabBarClearance: () => 0 }));

// Synthetic body in the exact shape of GET /api/pandits/me/ratings.
const body = {
  success: true,
  ratings: [
    { _id: 'b1', bookingNumber: 'ZB-1001', poojaId: { name: 'Griha Pravesh' }, rating: 5, review: 'Wonderful ceremony, very punctual.', ratingDate: '2026-03-02T10:00:00.000Z', completedAt: '2026-03-01T12:00:00.000Z' },
    { _id: 'b2', bookingNumber: 'ZB-1002', poojaId: { name: 'Satyanarayan Katha' }, rating: 4, review: '', completedAt: '2026-03-05T12:00:00.000Z' },
  ],
  averageRating: 4.5,
  totalReviews: 2,
};

beforeEach(() => api.get.mockReset());

describe('PanditRatingsScreen (F-11)', () => {
  it('requests the ratings endpoint and renders review text, date and total from the real response', async () => {
    api.get.mockResolvedValue({ data: body });
    render(<PanditRatingsScreen />);

    expect(await screen.findByText('Wonderful ceremony, very punctual.')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/pandits/me/ratings');
    expect(screen.getByText('2 reviews')).toBeTruthy();
    expect(screen.getByText('4.5')).toBeTruthy();
    expect(screen.getByText('02 Mar 2026')).toBeTruthy(); // ratingDate
    expect(screen.getByText('05 Mar 2026')).toBeTruthy(); // falls back to completedAt
    expect(screen.getByText('Griha Pravesh')).toBeTruthy();
    expect(screen.getByText('Satyanarayan Katha')).toBeTruthy();
  });

  it('does not show a placeholder customer name or an invalid date', async () => {
    api.get.mockResolvedValue({ data: body });
    render(<PanditRatingsScreen />);
    await screen.findByText('2 reviews');
    expect(screen.queryByText('User')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('uses the singular for a single review', async () => {
    api.get.mockResolvedValue({ data: { ...body, ratings: [body.ratings[0]], totalReviews: 1, averageRating: 5 } });
    render(<PanditRatingsScreen />);
    expect(await screen.findByText('1 review')).toBeTruthy();
  });

  it('shows the empty state (and no summary card) when there are no reviews', async () => {
    api.get.mockResolvedValue({ data: { success: true, ratings: [], averageRating: 0, totalReviews: 0 } });
    render(<PanditRatingsScreen />);
    expect(await screen.findByText('No reviews yet')).toBeTruthy();
    expect(screen.queryByText(/review(s)?$/)).toBeNull();
  });

  it('does not crash on missing optional fields (no review, no dates, no pooja, null summary)', async () => {
    api.get.mockResolvedValue({ data: { ratings: [{ _id: 'x', rating: 3 }], averageRating: null, totalReviews: null } });
    render(<PanditRatingsScreen />);
    expect(await screen.findByText('Pooja')).toBeTruthy(); // neutral fallback label
    expect(screen.getByText('1 review')).toBeTruthy();     // falls back to the row count
  });

  it('shows an error toast and an empty list when the request fails', async () => {
    const Toast = require('react-native-toast-message').default;
    api.get.mockRejectedValue(new Error('Network Error'));
    render(<PanditRatingsScreen />);
    expect(await screen.findByText('No reviews yet')).toBeTruthy();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Could not load ratings' });
  });
});
