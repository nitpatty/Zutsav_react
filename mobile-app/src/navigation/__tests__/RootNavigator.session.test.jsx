import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import RootNavigator from '../RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { usePanditStatusStore } from '../../store/panditStatusStore';

// The real RootNavigator + real stores + real API client (interceptors). Only the
// transport and the heavy child navigators are stubbed: each navigator renders a
// marker, and the stack navigator renders its first screen, so what is asserted is
// RootNavigator's own routing decision (Auth vs User vs Pandit vs PanditGate).
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
// function declaration on purpose: jest.mock factories are hoisted above `const`s
function mockMarker(label) {
  return () => require('react').createElement(require('react-native').Text, null, label);
}
jest.mock('../AuthNavigator', () => ({ __esModule: true, default: mockMarker('AUTH_STACK') }));
jest.mock('../UserNavigator', () => ({ __esModule: true, default: mockMarker('USER_STACK') }));
jest.mock('../PanditNavigator', () => ({ __esModule: true, default: mockMarker('PANDIT_STACK') }));
jest.mock('../PanditGateNavigator', () => ({ __esModule: true, default: mockMarker('PANDIT_GATE_STACK') }));
// RootNavigator reaches Admin only through the variants/adminModule seam; this is the Admin-enabled (private) build.
// (The public build is covered by RootNavigator.public.test.jsx, which uses the real public stand-in.)
jest.mock('../../variants/adminModule', () => ({ __esModule: true, AdminNavigator: mockMarker('ADMIN_STACK'), ADMIN_AVAILABLE: true }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../utils/socket', () => ({
  connectSocket: jest.fn(async () => null),
  disconnectSocket: jest.fn(),
  onNotification: jest.fn(() => () => {}),
}));

const USER = { _id: 'uA', name: 'User A', email: 'a@example.invalid', role: 'user' };
const PANDIT = { _id: 'pP', name: 'Pandit P', email: 'p@example.invalid', role: 'pandit' };

let panditStatus;
let expireAll;

beforeEach(() => {
  panditStatus = 'approved';
  expireAll = false;
  api.defaults.adapter = async (config) => {
    const fail = (status) => { throw Object.assign(new Error(`status ${status}`), { config, isAxiosError: true, response: { status, data: {}, headers: {}, config } }); };
    if (expireAll && config.url !== '/auth/login') fail(401);
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

describe('RootNavigator ↔ session expiry', () => {
  it('shows the Auth stack when signed out', () => {
    render(<RootNavigator />);
    expect(screen.getByText('AUTH_STACK')).toBeTruthy();
  });

  it('a signed-in User is returned to the login flow after a confirmed 401', async () => {
    render(<RootNavigator />);
    await signIn(USER, 'tokA');
    await waitFor(() => expect(screen.getByText('USER_STACK')).toBeTruthy());
    expect(screen.queryByText('AUTH_STACK')).toBeNull();

    expireAll = true;
    await act(async () => { await api.get('/bookings').catch(() => {}); });

    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(screen.queryByText('USER_STACK')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
  });

  it('an approved Pandit is returned to the login flow and the pandit gate state is reset', async () => {
    render(<RootNavigator />);
    await signIn(PANDIT, 'tokP');
    await waitFor(() => expect(screen.getByText('PANDIT_STACK')).toBeTruthy());
    expect(usePanditStatusStore.getState().pandit.status).toBe('approved');

    expireAll = true;
    await act(async () => { await api.get('/pandits/me/dashboard').catch(() => {}); });

    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(screen.queryByText('PANDIT_STACK')).toBeNull();
    expect(usePanditStatusStore.getState()).toMatchObject({ pandit: null, phase: 'idle', checkedOnce: false });
  });

  it('a Pandit still awaiting approval sees the gate, and also returns to login on expiry', async () => {
    panditStatus = 'under_review';
    render(<RootNavigator />);
    await signIn(PANDIT, 'tokP');
    await waitFor(() => expect(screen.getByText('PANDIT_GATE_STACK')).toBeTruthy());

    expireAll = true;
    await act(async () => { await api.get('/pandits/me').catch(() => {}); });

    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
  });

  it('a transient failure (network error) does NOT leave the User stack', async () => {
    render(<RootNavigator />);
    await signIn(USER, 'tokA');
    await waitFor(() => expect(screen.getByText('USER_STACK')).toBeTruthy());

    api.defaults.adapter = async (config) => { throw Object.assign(new Error('Network Error'), { config, isAxiosError: true, code: 'ERR_NETWORK' }); };
    await act(async () => { await api.get('/bookings').catch(() => {}); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(screen.getByText('USER_STACK')).toBeTruthy();
    expect(useAuthStore.getState().user).toEqual(USER);
  });

  it('explicit logout returns to the Auth stack and empties the cart', async () => {
    render(<RootNavigator />);
    await signIn(USER, 'tokA');
    await waitFor(() => expect(screen.getByText('USER_STACK')).toBeTruthy());
    await act(async () => { await useCartStore.getState().addItem({ productId: 'p1', name: 'Item', price: 10, stock: 3 }); });
    expect(useCartStore.getState().items).toHaveLength(1);

    await act(async () => { await useAuthStore.getState().logout(); });

    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(useCartStore.getState().items).toEqual([]);
  });
});

describe('RootNavigator ↔ role routing (Admin-enabled build)', () => {
  const ADMIN = { _id: 'aA', name: 'Admin A', email: 'ad@example.invalid', role: 'admin' };
  const SYSTEM_ADMIN = { _id: 'sA', name: 'System A', email: 'sa@example.invalid', role: 'system_admin' };
  const ALL_MARKERS = ['USER_STACK', 'PANDIT_STACK', 'PANDIT_GATE_STACK', 'ADMIN_STACK', 'AUTH_STACK'];
  const shown = () => ALL_MARKERS.filter((m) => screen.queryByText(m));

  // A session injected straight into the store, the way a stale or unusual role would arrive (setSession itself refuses it).
  const injectSession = async (user, token = 'tokX') => {
    await act(async () => { useAuthStore.setState({ user, token }); });
  };

  it('routes a User to the User navigator only', async () => {
    render(<RootNavigator />);
    await signIn(USER, 'tokA');
    await waitFor(() => expect(screen.getByText('USER_STACK')).toBeTruthy());
    expect(shown()).toEqual(['USER_STACK']);
  });

  it('routes an approved Pandit to the Pandit navigator only', async () => {
    render(<RootNavigator />);
    await signIn(PANDIT, 'tokP');
    await waitFor(() => expect(screen.getByText('PANDIT_STACK')).toBeTruthy());
    expect(shown()).toEqual(['PANDIT_STACK']);
  });

  it('routes a Pandit awaiting approval to the existing Pandit gate only', async () => {
    panditStatus = 'under_review';
    render(<RootNavigator />);
    await signIn(PANDIT, 'tokP');
    await waitFor(() => expect(screen.getByText('PANDIT_GATE_STACK')).toBeTruthy());
    expect(shown()).toEqual(['PANDIT_GATE_STACK']);
  });

  it.each([['admin', ADMIN], ['system_admin', SYSTEM_ADMIN]])('routes a %s to the Admin navigator only', async (_role, account) => {
    render(<RootNavigator />);
    await signIn(account, 'tokAdmin');
    await waitFor(() => expect(screen.getByText('ADMIN_STACK')).toBeTruthy());
    expect(shown()).toEqual(['ADMIN_STACK']);
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it.each([
    ['an unrecognised role', { _id: 'x1', role: 'superuser' }],
    ['a differently-cased role', { _id: 'x2', role: 'Admin' }],
    ['a missing role', { _id: 'x3' }],
    ['a null role', { _id: 'x4', role: null }],
  ])('never serves %s from the User navigator: the session is ended and the Auth stack shows', async (_label, account) => {
    render(<RootNavigator />);
    await injectSession(account);

    expect(screen.queryByText('USER_STACK')).toBeNull();
    expect(screen.queryByText('PANDIT_STACK')).toBeNull();
    expect(screen.queryByText('ADMIN_STACK')).toBeNull();

    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(screen.queryByText('USER_STACK')).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'Sorry, this account type is not supported in this app.' });
  });

  it('does not open a realtime connection or load the cart for an unsupported role', async () => {
    const { connectSocket } = require('../../utils/socket');
    render(<RootNavigator />);
    await injectSession({ _id: 'x1', role: 'superuser' });
    await waitFor(() => expect(screen.getByText('AUTH_STACK')).toBeTruthy());
    expect(connectSocket).not.toHaveBeenCalled();
  });
});
