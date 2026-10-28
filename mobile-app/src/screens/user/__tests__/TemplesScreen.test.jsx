import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import TemplesScreen from '../TemplesScreen';

jest.mock('../../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

// Synthetic documents shaped like backend/src/models/Temple.js (GET /api/temples → { temples }).
const madurai = { _id: 't1', name: 'Sri Test Temple', address: '12 Temple Road', city: 'Madurai', state: 'Tamil Nadu', primaryDeity: 'Meenakshi', openingHours: '5 AM – 9 PM', images: [] };
const bare = { _id: 't2', name: 'Bare Temple', address: 'Main St', city: 'Pune', state: '' };

beforeEach(() => { api.get.mockReset(); mockNavigate.mockClear(); });

describe('TemplesScreen (F-13)', () => {
  it('lists temples with location and the primary deity', async () => {
    api.get.mockResolvedValue({ data: { success: true, temples: [madurai, bare] } });
    render(<TemplesScreen />);

    expect(await screen.findByText('Sri Test Temple')).toBeTruthy();
    expect(screen.getByText('Meenakshi')).toBeTruthy();
    expect(screen.getByText(/Madurai, Tamil Nadu/)).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/temples', { params: { limit: 50 } });
  });

  it('handles a temple with no deity and no state (nothing fabricated)', async () => {
    api.get.mockResolvedValue({ data: { temples: [bare] } });
    render(<TemplesScreen />);
    expect(await screen.findByText('Bare Temple')).toBeTruthy();
    expect(screen.getByText(/Pune/)).toBeTruthy();
    expect(screen.queryByText(/undefined|null/)).toBeNull();
  });

  it('navigation is unchanged: tapping a temple opens TempleDetail with its id and document', async () => {
    api.get.mockResolvedValue({ data: { temples: [madurai] } });
    render(<TemplesScreen />);
    fireEvent.press(await screen.findByText('Sri Test Temple'));
    expect(mockNavigate).toHaveBeenCalledWith('TempleDetail', { templeId: 't1', temple: madurai });
  });

  it('search is unchanged: submitting sends the trimmed term as `search`', async () => {
    api.get.mockResolvedValue({ data: { temples: [madurai] } });
    render(<TemplesScreen />);
    await screen.findByText('Sri Test Temple');

    const input = screen.getByPlaceholderText('Search temples…');
    fireEvent.changeText(input, '  meenakshi ');
    fireEvent(input, 'submitEditing');

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/temples', { params: { limit: 50, search: 'meenakshi' } }));
  });

  it('shows the empty state when nothing matches, and an error toast when loading fails', async () => {
    api.get.mockResolvedValueOnce({ data: { temples: [] } });
    const { unmount } = render(<TemplesScreen />);
    expect(await screen.findByText('No temples found')).toBeTruthy();
    unmount();

    const Toast = require('react-native-toast-message').default;
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<TemplesScreen />);
    expect(await screen.findByText('No temples found')).toBeTruthy();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Could not load temples' });
  });
});
