import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import api, { setSessionExpiredHandler } from '../../../api/axios';
import WalletScreen from '../WalletScreen';
import { I18nProvider } from '../../../i18n';

// The app mounts I18nProvider (App.jsx), which keeps `t` referentially stable; WalletScreen's fetch callbacks depend on it.
const renderWallet = () => render(<I18nProvider><WalletScreen /></I18nProvider>);

// The REAL shared API client (interceptors included) with only the transport replaced, so the wallet's 401
// handling is exercised through the same path the rest of the app uses.
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

let requests;
const respond = (status, data) => async (config) => {
  requests.push(config);
  if (status >= 400) {
    const err = new Error(`HTTP ${status}`);
    err.config = config;
    err.response = { status, data, headers: {}, config };
    throw err;
  }
  return { data, status, statusText: 'OK', headers: {}, config };
};

beforeEach(() => { requests = []; setSessionExpiredHandler(null); });
afterAll(() => setSessionExpiredHandler(null));

describe('WalletScreen — authentication through the shared API client', () => {
  it('sends the stored Bearer token on both wallet requests', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.wallet.token');
    api.defaults.adapter = async (config) => {
      requests.push(config);
      const data = config.url === '/wallet' ? { wallet: { balance: 7 } } : { transactions: [], total: 0 };
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    };
    renderWallet();
    await screen.findByText('7');
    expect(requests.map((r) => r.url).sort()).toEqual(['/wallet', '/wallet/transactions?page=1&limit=20']);
    requests.forEach((r) => expect(r.headers.Authorization).toBe('Bearer synthetic.wallet.token'));
  });

  it('a 401 for the current token triggers the session-expiry handler and shows the error state', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.wallet.token');
    const handler = jest.fn();
    setSessionExpiredHandler(handler);
    api.defaults.adapter = respond(401, { message: 'Session expired' });
    renderWallet();
    expect(await screen.findByText('Session expired')).toBeTruthy();
    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(screen.queryByText('Current Balance')).toBeNull();
  });

  it('a 401 on the history request alone expires the session and shows an error — never "No Transactions Yet"', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.wallet.token');
    const handler = jest.fn();
    setSessionExpiredHandler(handler);
    api.defaults.adapter = async (config) => {
      requests.push(config);
      if (config.url === '/wallet') return { data: { wallet: { balance: 7 } }, status: 200, statusText: 'OK', headers: {}, config };
      const err = new Error('HTTP 401');
      err.config = config;
      err.response = { status: 401, data: { message: 'Session expired' }, headers: {}, config };
      throw err;
    };
    renderWallet();
    expect(await screen.findByText(/couldn't load your transaction history/)).toBeTruthy();
    await waitFor(() => expect(handler).toHaveBeenCalled());
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.queryByText('No Transactions Yet')).toBeNull();
  });

  it('a 401 without a stored token (anonymous) does NOT trigger session expiry', async () => {
    await SecureStore.deleteItemAsync('zutsav_token');
    const handler = jest.fn();
    setSessionExpiredHandler(handler);
    api.defaults.adapter = respond(401, { message: 'Not authenticated' });
    renderWallet();
    expect(await screen.findByText('Not authenticated')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(handler).not.toHaveBeenCalled();
  });

  it('a 5xx does not expire the session', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.wallet.token');
    const handler = jest.fn();
    setSessionExpiredHandler(handler);
    api.defaults.adapter = respond(500, { message: 'Server error' });
    renderWallet();
    expect(await screen.findByText('Server error')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(handler).not.toHaveBeenCalled();
  });
});
