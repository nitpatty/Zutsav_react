import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import { useAuthStore } from '../../../store/authStore';
import PanditDashboardScreen from '../PanditDashboardScreen';

// Day 29 (issue C): the schedule calendar is part of the Pandit dashboard, stacked in the single mobile column, and everything the
// dashboard already did (quick actions, booking navigation, stats) is unchanged.

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/NotificationBell', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/pandit/StickyActionBar', () => ({ useTabBarClearance: () => 0 }));
jest.mock('../../../hooks/useOnReconnect', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../../utils/bookingDateRules', () => ({ ...jest.requireActual('../../../utils/bookingDateRules'), todayIST: () => '2026-04-15' }));

const dashboard = {
  profile: { name: 'Pt. Sharma', kycStatus: 'approved', isOnline: true, rating: 4.5 },
  today: { bookings: [], earnings: 0 },
  upcoming: { bookings: [{ _id: 'up1', status: 'pandit_accepted', scheduledDate: '2026-04-20T00:00:00.000Z', poojaId: { name: 'Rudrabhishek' }, userId: { name: 'Asha' } }] },
  monthly: { earnings: 5000 }, pending: { referralRemarks: 0 }, performance: {}, trends: { monthly: [] },
};
const calendar = { days: [{
  date: '2026-04-15', availability: 'available', status: 'available', bookingCount: 1, scheduleConflict: false,
  bookings: [{ _id: 'bk-cal', bookingNumber: 'ZB-2001', status: 'pandit_accepted', poojaName: 'Griha Pravesh', customerName: 'Asha', scheduledTime: '09:00', startMinutes: 540, endMinutes: 600, actionable: false }],
}] };

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset && f.mockReset());
  mockNav.navigate.mockClear();
  useAuthStore.setState({ user: { _id: 'p1', name: 'Pt. Sharma', role: 'pandit' } });
  api.get.mockImplementation(async (url) => {
    if (url === '/pandits/me/dashboard') return { data: dashboard };
    if (url === '/pandits/me/payouts/stats') return { data: { stats: { pendingAmount: 0 } } };
    if (url.startsWith('/pandits/me/schedule-calendar')) return { data: calendar };
    if (url.startsWith('/referral/my')) return { data: { referrals: [] } };
    if (url.startsWith('/festivals')) return { data: { festivals: [] } };
    if (url.startsWith('/notifications')) return { data: { notifications: [], count: 0 } };
    throw new Error(`unexpected GET ${url}`);
  });
});

describe('Pandit dashboard — schedule calendar', () => {
  it('shows the calendar section with the current month, loaded from the existing schedule-calendar endpoint', async () => {
    render(<PanditDashboardScreen />);
    expect(await screen.findByText('Schedule Calendar')).toBeTruthy();
    expect(await screen.findByText('April 2026')).toBeTruthy();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/pandits/me/schedule-calendar?from=2026-04-01&to=2026-04-30'));
    expect(await screen.findByText('Griha Pravesh')).toBeTruthy();
  });

  it('is stacked in the same column as the existing sections, which are all still there', async () => {
    render(<PanditDashboardScreen />);
    await screen.findByText('April 2026');
    ['Quick Actions', 'Schedule Calendar', 'Upcoming Pujas'].forEach((s) => expect(screen.getByText(s)).toBeTruthy());
    expect(screen.getByText('Rudrabhishek')).toBeTruthy();           // the existing upcoming list is untouched
  });

  it('tapping a booking in the calendar opens the existing Pandit booking detail with that booking\'s id', async () => {
    render(<PanditDashboardScreen />);
    fireEvent.press(await screen.findByText('Griha Pravesh'));
    expect(mockNav.navigate).toHaveBeenCalledWith('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: 'bk-cal' } });
  });

  it('keeps the existing upcoming-booking navigation and the Availability link', async () => {
    render(<PanditDashboardScreen />);
    await screen.findByText('April 2026');
    fireEvent.press(screen.getByText('Rudrabhishek'));
    expect(mockNav.navigate).toHaveBeenCalledWith('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: 'up1' } });
    fireEvent.press(screen.getAllByText('Availability')[0]);        // the section's link (the quick action goes to the same screen)
    expect(mockNav.navigate).toHaveBeenCalledWith('PanditAvailability', undefined);
  });

  it('pull-to-refresh reloads the dashboard and the calendar', async () => {
    const view = render(<PanditDashboardScreen />);
    await screen.findByText('Griha Pravesh');
    const calendarCalls = () => api.get.mock.calls.filter(([u]) => u.startsWith('/pandits/me/schedule-calendar')).length;
    const before = calendarCalls();
    const control = view.UNSAFE_getByType(RefreshControl);
    await act(async () => { control.props.onRefresh(); });
    await waitFor(() => expect(calendarCalls()).toBe(before + 1));
    expect([api.post, api.patch, api.put, api.delete].every((f) => f.mock.calls.length === 0)).toBe(true);
  });
});
