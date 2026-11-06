import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import RootNavigator from '../RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { usePanditStatusStore } from '../../store/panditStatusStore';

// PUBLIC build: the Admin module is the REAL public stand-in (adminModule.public), not a mock of it. The real
// RootNavigator, role policy, stores and API client run; only the transport and the child navigators are stubbed
// (each renders a marker, the stack navigator renders its first screen).
jest.mock('@react-navigation/native-stack', () => {
  const R = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }) => {
        const first = R.Children.toArray(children)[0];
        return first ? R.createElement(first.props.component) : null;
      },
      Screen: () => null,
    }),
  };
});
function mockMarker(label) {
  return () => require('react').createElement(require('react-native').Text, null, label);
}
jest.mock('../AuthNavigator', () => ({ __esModule: true, default: mockMarker('AUTH_STACK') }));
jest.mock('../UserNavigator', () => ({ __esModule: true, default: mockMarker('USER_STACK') }));
jest.mock('../PanditNavigator', () => ({ __esModule: true, default: mockMarker('PANDIT_STACK') }));
jest.mock('../PanditGateNavigator', () => ({ __esModule: true, default: mockMarker('PANDIT_GATE_STACK') }));
// Any attempt to load the real Admin navigator in this build is a failure.
jest.mock('../AdminNavigator', () => { throw new Error('the public build must not load the Admin navigator'); });
jest.mock('../../variants/adminModule', () => jest.requireActual('../../variants/adminModule.public'));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../utils/socket', () => ({
  connectSocket: jest.fn(async () => null),
  disconnectSocket: jest.fn(),
  onNotification: jest.fn(() => () => {}),
}));

const ACCOUNT = (role) => ({ _id: `id_${role}`, name: `Test ${role}`, email: `${role}@example.invalid`, role });
const ADMIN_MESSAGE = 'Sorry, this account is registered as an Admin account. Please use the Zutsav Admin app to sign in.';
const ALL_MARKERS = ['USER_STACK', 'PANDIT_STACK', 'PANDIT_GATE_STACK', 'ADMIN_STACK', 'AUTH_STACK'];
const shown = () => ALL_MARKERS.filter((m) => screen.queryByText(m));

let panditStatus;
let calls;

beforeEach(() => {
  panditStatus = 'approved';
  calls = [];
  api.defaults.adapter = async (config) => {
    calls.push({ url: config.url, auth: config.headers.Authorization });
    const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/pandits/me') return ok({ pandit: { status: panditStatus } });
    if (config.url === '/notifications/unread-count') return ok({ count: 0 });
    return ok({});
  };
  useAuthStore.setState({ user: null, token: null, loading: false, ready: true });
  useCartStore.setState({ items: [] });
  usePanditStatusStore.getState().reset();
});

const signIn = async (user, token) => {
  await act(async () => { await useAuthStore.getState().setSession(token, user); });
};
// A session placed straight in the store - how an Admin session left by an earlier install could reach routing.
const injectSession = async (user, token) => {
  await act(async () => { useAuthStore.setState({ user, token }); });
};

describe('RootNavigator in the public build', () => {
  it('shows the Auth stack when signed out', () => {
    render(<RootNavigator />);
    expect(shown()).toEqual(['AUTH_STACK']);
  });

  it('routes a User to the User navigator', async () => {
    render(<RootNavigator />);
    await signIn(ACCOUNT('user'), 'tokU');
    await waitFor(() => expect(screen.getByText('USER_STACK')).toBeTruthy());
    expect(shown()).toEqual(['USER_STACK']);
  });

  it('routes an approved Pandit to the Pandit navigator', async () => {
    render(<RootNavigator />);
    await signIn(ACCOUNT('pandit'), 'tokP');
    await waitFor(() => expect(screen.getByText('PANDIT_STACK')).toBeTruthy());
    expect(shown()).toEqual(['PANDIT_STACK']);
  });

  it('routes a Pandit awaiting approval through the existing Pandit gate', async () => {
    panditStatus = 'under_review';
    render(<RootNavigator />);
    await signIn(ACCOUNT('pandit'), 'tokP');
    await waitFor(() => expect(screen.getByText('PANDIT_GATE_STACK')).toBeTruthy());
    expect(shown()).toEqual(['PANDIT_GATE_STACK']);
  });

  it.each(['admin', 'system_admin'])('never shows a %s the User or Admin navigator: the session is ended with the approved message', async (role) => {
    render(<RootNavigator />);
    await injectSession(ACCOUNT(role), 'tokAdmin');

    // not even for a moment
    expect(screen.queryByText('USER_STACK')).toBeNull();
    expect(screen.queryByText('ADMIN_STACK')).toBeNull();

    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(shown()).toEqual(['AUTH_STACK']);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: ADMIN_MESSAGE });
  });

  it('asks the server to end the Admin session it was holding', async () => {
    render(<RootNavigator />);
    await injectSession(ACCOUNT('admin'), 'tokAdmin');
    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    await waitFor(() => expect(calls.some((c) => c.url === '/auth/logout')).toBe(true));
    expect(calls.find((c) => c.url === '/auth/logout').auth).toBe('Bearer tokAdmin');
  });

  it('does not open a realtime connection or fetch notifications for an Admin session', async () => {
    const { connectSocket } = require('../../utils/socket');
    render(<RootNavigator />);
    await injectSession(ACCOUNT('admin'), 'tokAdmin');
    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(connectSocket).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url === '/notifications/unread-count')).toBe(false);
  });

  it.each([
    ['an unrecognised role', { _id: 'x1', role: 'superuser' }],
    ['a missing role', { _id: 'x2' }],
  ])('never serves %s from the User navigator', async (_label, account) => {
    render(<RootNavigator />);
    await injectSession(account, 'tokX');
    expect(screen.queryByText('USER_STACK')).toBeNull();
    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(shown()).toEqual(['AUTH_STACK']);
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Sorry, this account type is not supported in this app.' });
  });

  it('a User session that signs out still returns to the Auth stack (existing behaviour)', async () => {
    render(<RootNavigator />);
    await signIn(ACCOUNT('user'), 'tokU');
    await waitFor(() => expect(screen.getByText('USER_STACK')).toBeTruthy());
    await act(async () => { await useAuthStore.getState().logout(); });
    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
  });
});
