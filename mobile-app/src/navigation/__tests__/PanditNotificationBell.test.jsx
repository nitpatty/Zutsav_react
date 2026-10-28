import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import api from '../../api/axios';
import { useNotificationStore } from '../../store/notificationStore';
import PanditNavigator from '../PanditNavigator';

// Day 29 (issue D): the bell on the Pandit dashboard did nothing on the device. Root cause: it navigates to the route
// 'PanditNotifications', which was registered only in the Profile tab's stack — a navigate() from the Home stack cannot reach a
// sibling tab's nested screen, so the action was unhandled. This renders the REAL Pandit navigator (real route registry); only the
// dashboard (which hosts the real bell) and the notification centre (a marker) are stubbed.

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('../../screens/pandit/PanditDashboardScreen', () => {
  const { Text, View } = require('react-native');
  const NotificationBell = require('../../components/NotificationBell').default;
  return { __esModule: true, default: () => <View><Text>DASHBOARD_SCREEN</Text><NotificationBell notifScreen="PanditNotifications" /></View> };
});
jest.mock('../../screens/pandit/PanditNotificationsScreen', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>PANDIT_NOTIFICATIONS_SCREEN</Text> };
});

const writes = () => [...api.post.mock.calls, ...api.patch.mock.calls, ...api.delete.mock.calls];

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset && f.mockReset());
  useNotificationStore.setState({ notifications: [], unreadCount: 3, loading: false });
});

describe('Pandit dashboard notification bell', () => {
  it('opens the Pandit notification centre when tapped, and sends nothing', async () => {
    render(<NavigationContainer><PanditNavigator /></NavigationContainer>);
    expect(await screen.findByText('DASHBOARD_SCREEN')).toBeTruthy();
    expect(screen.queryByText('PANDIT_NOTIFICATIONS_SCREEN')).toBeNull();

    fireEvent.press(screen.getByLabelText('Notifications'));

    expect(await screen.findByText('PANDIT_NOTIFICATIONS_SCREEN')).toBeTruthy();
    expect(writes()).toEqual([]);                     // opening the screen is not "mark as read"
    expect(api.get).not.toHaveBeenCalled();           // the stubbed screens made no request; the bell itself makes none
  });

  it('the bell is an accessible button with a label and shows the unread count', async () => {
    render(<NavigationContainer><PanditNavigator /></NavigationContainer>);
    await screen.findByText('DASHBOARD_SCREEN');
    const bell = screen.getByLabelText('Notifications');
    expect(bell.props.accessibilityRole).toBe('button');
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });
});
