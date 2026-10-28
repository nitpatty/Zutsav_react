import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import WalletScreen from '../WalletScreen';
import { I18nProvider } from '../../../i18n';

// The app mounts I18nProvider (App.jsx), which keeps `t` referentially stable; WalletScreen's fetch callbacks depend on it.
const renderWallet = () => render(<I18nProvider><WalletScreen /></I18nProvider>);

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));

const wallet = (over = {}) => ({
  balance: 120, totalEarned: 200, totalRedeemed: 80,
  coinMonetaryValue: 0.5, coinRedemptionMinCoins: 100, ...over,
});
const tx = (over = {}) => ({
  _id: 't1', type: 'REFERRAL_BOOKING_REWARD', direction: 'CREDIT', amount: 50,
  description: 'Booking reward', createdAt: '2026-03-01T06:30:00.000Z', ...over,
});

const serve = ({ w = { data: { wallet: wallet() } }, t = { data: { transactions: [], total: 0 } } } = {}) => {
  api.get.mockImplementation(async (url) => {
    if (url === '/wallet') { if (w instanceof Error) throw w; return w; }
    if (url.startsWith('/wallet/transactions')) { if (t instanceof Error) throw t; return t; }
    throw new Error(`unexpected GET ${url}`);
  });
};
const httpError = (status, message) => Object.assign(new Error(message || 'fail'), { response: { status, data: message ? { message } : {} } });

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

describe('WalletScreen — API contract (read-only)', () => {
  it('reads GET /wallet and GET /wallet/transactions?page=1&limit=20, and never writes', async () => {
    serve();
    renderWallet();
    await screen.findByText('Current Balance');
    expect(api.get).toHaveBeenCalledWith('/wallet');
    expect(api.get).toHaveBeenCalledWith('/wallet/transactions?page=1&limit=20');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('has no redemption control on the wallet screen', async () => {
    serve();
    renderWallet();
    await screen.findByText('Current Balance');
    expect(screen.queryByText(/^(Redeem|Redeem Coins|Apply Coins|Use Coins)$/i)).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('WalletScreen — balance and configured metadata', () => {
  it('shows the balance, earned and redeemed totals exactly as returned', async () => {
    serve({ w: { data: { wallet: wallet({ balance: 1234, totalEarned: 2000, totalRedeemed: 766 }) } } });
    renderWallet();
    expect(await screen.findByText('1234')).toBeTruthy();
    expect(screen.getByText('2000')).toBeTruthy();
    expect(screen.getByText('766')).toBeTruthy();
  });

  it('shows the server-configured conversion rate and threshold (not hard-coded) and qualification', async () => {
    serve({ w: { data: { wallet: wallet({ balance: 120, coinMonetaryValue: 0.25, coinRedemptionMinCoins: 100 }) } } });
    renderWallet();
    expect(await screen.findByText(/1 coin = ₹0\.25/)).toBeTruthy();
    expect(screen.getByText(/Requires at least 100 coins — you qualify ✓/)).toBeTruthy();
  });

  it('uses a different configured rate when the server returns one', async () => {
    serve({ w: { data: { wallet: wallet({ coinMonetaryValue: 2, coinRedemptionMinCoins: 0 }) } } });
    renderWallet();
    expect(await screen.findByText(/1 coin = ₹2 /)).toBeTruthy();
    expect(screen.queryByText(/Requires at least/)).toBeNull(); // threshold 0 → nothing to show
  });

  it('shows the shortfall when the balance is under the minimum', async () => {
    serve({ w: { data: { wallet: wallet({ balance: 30, coinRedemptionMinCoins: 100 }) } } });
    renderWallet();
    expect(await screen.findByText(/Requires at least 100 coins — you have 30/)).toBeTruthy();
  });

  it.each([[null], [undefined], [0], ['']])('assumes no conversion rate when coinMonetaryValue is %p', async (rate) => {
    serve({ w: { data: { wallet: wallet({ coinMonetaryValue: rate }) } } });
    renderWallet();
    await screen.findByText('Current Balance');
    expect(screen.queryByText(/1 coin =/)).toBeNull();
    expect(screen.queryByText('Coin Redemption')).toBeNull();
    expect(screen.queryByText(/Requires at least/)).toBeNull();
  });

  it('renders safely when optional wallet fields are absent', async () => {
    serve({ w: { data: { wallet: { balance: 5 } } } });
    renderWallet();
    expect(await screen.findByText('5')).toBeTruthy();
    expect(screen.queryByText(/NaN|undefined|null/)).toBeNull();
    expect(screen.queryByText(/1 coin =/)).toBeNull();
  });
});

describe('WalletScreen — transactions', () => {
  it('shows the empty state when there is no history', async () => {
    serve();
    renderWallet();
    expect(await screen.findByText('No Transactions Yet')).toBeTruthy();
  });

  it('renders credit and debit rows with their type labels and signs', async () => {
    serve({
      t: { data: { total: 2, transactions: [
        tx({ _id: 'a', type: 'REFERRAL_BOOKING_REWARD', direction: 'CREDIT', amount: 50, description: 'Booking reward' }),
        tx({ _id: 'b', type: 'COIN_REDEMPTION', direction: 'DEBIT', amount: 20, description: 'Used on booking' }),
      ] } },
    });
    renderWallet();
    expect(await screen.findByText('Referral Booking Reward')).toBeTruthy();
    expect(screen.getByText('+50')).toBeTruthy();
    expect(screen.getByText('-20')).toBeTruthy();
    expect(screen.getByText('Used on booking')).toBeTruthy();
    expect(screen.queryByText('No Transactions Yet')).toBeNull();
  });

  it('shows an unknown transaction type by its raw name instead of crashing', async () => {
    serve({ t: { data: { total: 1, transactions: [tx({ _id: 'c', type: 'FUTURE_TYPE', description: undefined })] } } });
    renderWallet();
    expect(await screen.findByText('FUTURE_TYPE')).toBeTruthy();
  });

  it('renders unknown and known types with VALID icon names (no "not a valid icon name" warning)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      serve({ t: { data: { total: 5, transactions: [
        tx({ _id: 'u1', type: 'FUTURE_TYPE' }),
        tx({ _id: 'u2', type: undefined }),
        tx({ _id: 'k1', type: 'REFERRAL_REGISTRATION' }),
        tx({ _id: 'k2', type: 'COIN_REDEMPTION', direction: 'DEBIT' }),
        tx({ _id: 'k3', type: 'ADMIN_ADJUSTMENT' }),
      ] } } });
      renderWallet();
      expect(await screen.findByText('FUTURE_TYPE')).toBeTruthy();
      expect(screen.getByText('Referral Registration')).toBeTruthy();
      expect(screen.getByText('Admin Adjustment')).toBeTruthy();
      const iconWarnings = warn.mock.calls.filter(([m]) => /not a valid icon name/.test(String(m)));
      expect(iconWarnings).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('treats a missing transactions array as empty', async () => {
    serve({ t: { data: {} } });
    renderWallet();
    expect(await screen.findByText('No Transactions Yet')).toBeTruthy();
  });

  // Current behaviour, recorded rather than changed in this read-only phase: the screen requests page 1 only
  // (no load-more / page controls) and does not send the type/direction filters the backend accepts.
  it('requests only the first page (no pagination controls exist on this screen)', async () => {
    serve({ t: { data: { total: 45, transactions: [tx()] } } });
    renderWallet();
    await screen.findByText('Referral Booking Reward');
    const txCalls = api.get.mock.calls.filter(([u]) => u.startsWith('/wallet/transactions'));
    expect(txCalls).toEqual([['/wallet/transactions?page=1&limit=20']]);
    expect(screen.queryByText(/Load more|Next|Page 2/i)).toBeNull();
  });
});

describe('WalletScreen — failures', () => {
  it('shows the server message when the wallet cannot be loaded and no balance card', async () => {
    serve({ w: httpError(500, 'Wallet service down') });
    renderWallet();
    expect(await screen.findByText('Wallet service down')).toBeTruthy();
    expect(screen.queryByText('Current Balance')).toBeNull();
    expect(screen.queryByText(/1 coin =/)).toBeNull();
  });

  it('falls back to the generic message when the error carries none (e.g. offline)', async () => {
    serve({ w: Object.assign(new Error('Network Error'), { request: {} }) });
    renderWallet();
    expect(await screen.findByText('Could not load wallet')).toBeTruthy();
  });

  const HISTORY_ERROR = /couldn't load your transaction history/;

  it('history-only failure: keeps the balance and shows an honest error, NOT "No Transactions Yet"', async () => {
    serve({ t: httpError(500, 'boom') });
    renderWallet();
    expect(await screen.findByText('Current Balance')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy(); // the successfully loaded balance is preserved
    expect(await screen.findByText(HISTORY_ERROR)).toBeTruthy();
    expect(screen.queryByText('No Transactions Yet')).toBeNull();
    expect(screen.queryByText('Referral Booking Reward')).toBeNull();
  });

  it('history network failure (no response) is also an error, not an empty wallet', async () => {
    serve({ t: Object.assign(new Error('Network Error'), { request: {} }) });
    renderWallet();
    expect(await screen.findByText(HISTORY_ERROR)).toBeTruthy();
    expect(screen.queryByText('No Transactions Yet')).toBeNull();
  });

  it('a successful empty history still says "No Transactions Yet" and shows no error', async () => {
    serve({ t: { data: { transactions: [], total: 0 } } });
    renderWallet();
    expect(await screen.findByText('No Transactions Yet')).toBeTruthy();
    expect(screen.queryByText(HISTORY_ERROR)).toBeNull();
  });

  it('a successful history shows its rows and no error', async () => {
    serve({ t: { data: { total: 1, transactions: [tx()] } } });
    renderWallet();
    expect(await screen.findByText('Referral Booking Reward')).toBeTruthy();
    expect(screen.queryByText(HISTORY_ERROR)).toBeNull();
    expect(screen.queryByText('No Transactions Yet')).toBeNull();
  });

  it('wallet-only failure: shows the wallet error and still shows the history that loaded', async () => {
    serve({ w: httpError(500, 'Wallet service down'), t: { data: { total: 1, transactions: [tx()] } } });
    renderWallet();
    expect(await screen.findByText('Wallet service down')).toBeTruthy();
    expect(await screen.findByText('Referral Booking Reward')).toBeTruthy();
    expect(screen.queryByText(HISTORY_ERROR)).toBeNull();
  });

  it('a 401 on the history request is an error state, not an empty history', async () => {
    serve({ t: httpError(401, 'Session expired') });
    renderWallet();
    expect(await screen.findByText(HISTORY_ERROR)).toBeTruthy();
    expect(screen.queryByText('No Transactions Yet')).toBeNull();
  });
});
