import React from 'react';
import { Alert, Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import api from '../../../api/axios';
import WalletScreen from '../WalletScreen';
import MyReferralsScreen from '../MyReferralsScreen';
import { useLanguageStore } from '../../../i18n/languageStore';
import { DICTIONARIES } from '../../../i18n/locales';

jest.mock('../../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }));
jest.mock('../../../components/ScreenHeader', () => ({ __esModule: true, default: ({ title }) => require('react').createElement(require('react-native').Text, { testID: 'header-title' }, title) }));
const mockSetString = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a) => mockSetString(...a) }));

const hi = DICTIONARIES.hi;
const ta = DICTIONARIES.ta;
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const title = () => screen.getByTestId('header-title').props.children;
const httpError = (status, message) => Object.assign(new Error('fail'), { response: { status, data: message ? { message } : {} } });

describe('WalletScreen', () => {
  const wallet = (over = {}) => ({ balance: 120, totalEarned: 200, totalRedeemed: 80, coinMonetaryValue: 0.25, coinRedemptionMinCoins: 100, ...over });
  const tx = (over = {}) => ({ _id: 't1', type: 'REFERRAL_BOOKING_REWARD', direction: 'CREDIT', amount: 50, description: 'Booking reward', createdAt: '2026-03-01T06:30:00.000Z', ...over });
  const serve = ({ w = { data: { wallet: wallet() } }, h = { data: { transactions: [], total: 0 } } } = {}) => {
    api.get.mockImplementation(async (url) => {
      if (url === '/wallet') { if (w instanceof Error) throw w; return w; }
      if (url.startsWith('/wallet/transactions')) { if (h instanceof Error) throw h; return h; }
      throw new Error(`unexpected GET ${url}`);
    });
  };
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); api.patch.mockReset(); });

  it('English is unchanged', async () => {
    serve({ h: { data: { total: 1, transactions: [tx()] } } });
    render(<WalletScreen />);
    expect(await screen.findByText('Current Balance')).toBeTruthy();
    expect(title()).toBe('My Wallet');
    expect(screen.getByText('Earned')).toBeTruthy();
    expect(screen.getByText('Redeemed')).toBeTruthy();
    expect(screen.getByText('Transaction History')).toBeTruthy();
    expect(screen.getByText('Coin Redemption')).toBeTruthy();
    expect(screen.getByText(/1 coin = ₹0\.25 · Redeemable at checkout for Pooja bookings/)).toBeTruthy();
    expect(screen.getByText('Requires at least 100 coins — you qualify ✓')).toBeTruthy();
    expect(screen.getByText('Referral Booking Reward')).toBeTruthy();
  });

  it('renders in Hindi: labels, rate card with the exact configured rate and threshold, history rows — numbers untouched', async () => {
    await setLang('hi');
    serve({ h: { data: { total: 2, transactions: [tx(), tx({ _id: 't2', type: 'COIN_REDEMPTION', direction: 'DEBIT', amount: 20, description: 'Used' })] } } });
    render(<WalletScreen />);
    expect(await screen.findByText(hi.wallet.balanceLabel)).toBeTruthy();
    expect(title()).toBe(hi.wallet.pageTitle);
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText(hi.wallet.totalEarned)).toBeTruthy();
    expect(screen.getByText(hi.wallet.totalRedeemed)).toBeTruthy();
    expect(screen.getByText(hi.wallet.coinRate.replace('{{rate}}', '0.25'))).toBeTruthy();
    expect(screen.getByText(hi.wallet.minQualifies.replace('{{min}}', '100'))).toBeTruthy();
    expect(screen.getByText(hi.wallet.typeBookingReward)).toBeTruthy();
    expect(screen.getAllByText(hi.wallet.coinCardTitle)).toHaveLength(2); // the rate card title and the transaction type share this wording
    expect(screen.getByText(hi.wallet.credit)).toBeTruthy();
    expect(screen.getByText(hi.wallet.debit)).toBeTruthy();
    expect(screen.getByText('+50')).toBeTruthy();
    expect(screen.getByText('-20')).toBeTruthy();
  });

  it('the shortfall message interpolates both numbers; no rate means no coin card and no assumed conversion', async () => {
    await setLang('hi');
    serve({ w: { data: { wallet: wallet({ balance: 30 }) } } });
    const { unmount } = render(<WalletScreen />);
    expect(await screen.findByText(hi.wallet.minShort.replace('{{min}}', '100').replace('{{balance}}', '30'))).toBeTruthy();
    unmount();

    serve({ w: { data: { wallet: wallet({ coinMonetaryValue: null }) } } });
    render(<WalletScreen />);
    await screen.findByText(hi.wallet.balanceLabel);
    expect(screen.queryByText(hi.wallet.coinCardTitle)).toBeNull();
    expect(screen.queryByText(/₹/)).toBeNull();
  });

  it('empty history vs history failure vs wallet failure stay distinct, each localized', async () => {
    await setLang('hi');
    serve();
    const first = render(<WalletScreen />);
    expect(await screen.findByText(hi.wallet.noTransactionsTitle)).toBeTruthy();
    expect(screen.queryByText(hi.wallet.historyError)).toBeNull();
    first.unmount();

    serve({ h: httpError(500, 'boom') });
    const second = render(<WalletScreen />);
    expect(await screen.findByText(hi.wallet.historyError)).toBeTruthy();
    expect(screen.queryByText(hi.wallet.noTransactionsTitle)).toBeNull();
    expect(screen.getByText('120')).toBeTruthy();
    second.unmount();

    serve({ w: httpError(500, 'Wallet service down') });
    const third = render(<WalletScreen />);
    expect(await screen.findByText('Wallet service down')).toBeTruthy();   // server message kept
    third.unmount();

    serve({ w: Object.assign(new Error('Network Error'), { request: {} }) });
    render(<WalletScreen />);
    expect(await screen.findByText(hi.wallet.error)).toBeTruthy();         // localized fallback
  });

  it('the requests are exactly the same as in English (paths and parameters)', async () => {
    serve();
    const { unmount } = render(<WalletScreen />);
    await screen.findByText('Current Balance');
    const english = api.get.mock.calls.map((c) => c[0]).sort();
    unmount();
    api.get.mockClear();

    await setLang('hi');
    serve();
    render(<WalletScreen />);
    await screen.findByText(hi.wallet.balanceLabel);
    expect(api.get.mock.calls.map((c) => c[0]).sort()).toEqual(english);
    expect(english).toEqual(['/wallet', '/wallet/transactions?page=1&limit=20']);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('unknown transaction types keep their raw name and a valid icon (no icon warning) in Hindi', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await setLang('hi');
      serve({ h: { data: { total: 1, transactions: [tx({ type: 'FUTURE_TYPE' })] } } });
      render(<WalletScreen />);
      expect(await screen.findByText('FUTURE_TYPE')).toBeTruthy();
      expect(warn.mock.calls.filter(([m]) => /not a valid icon name/.test(String(m)))).toEqual([]);
    } finally { warn.mockRestore(); }
  });

  it('a language switch re-renders the screen in place, in the new language', async () => {
    serve({ h: { data: { total: 1, transactions: [tx()] } } });
    render(<WalletScreen />);
    expect(await screen.findByText('Current Balance')).toBeTruthy();
    await setLang('ta');
    expect(await screen.findByText(ta.wallet.balanceLabel)).toBeTruthy();
    expect(title()).toBe(ta.wallet.pageTitle);
    expect(screen.getByText('120')).toBeTruthy();
  });
});

describe('MyReferralsScreen', () => {
  const HOURS = 3600 * 1000;
  const code = (over = {}) => ({
    _id: 'c1', code: 'ABC123', status: 'AVAILABLE', isExpired: false, referralLink: 'https://www.zutsav.com/register?ref=ABC123',
    createdAt: new Date(Date.now() - 2 * HOURS).toISOString(), expiresAt: new Date(Date.now() + (2 * 24 + 3) * HOURS + 30 * 60 * 1000).toISOString(), ...over,
  });
  const serve = ({ codes = [code()], settings = { dailyLimit: 5 }, fail } = {}) => {
    api.get.mockImplementation(async (url) => {
      if (url.startsWith('/user-referrals/my')) { if (fail) throw fail; return { data: { codes, total: codes.length } }; }
      if (url === '/user-referrals/settings') return { data: { settings } };
      throw new Error(`unexpected GET ${url}`);
    });
  };
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset(); mockSetString.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('English is unchanged', async () => {
    serve();
    render(<MyReferralsScreen />);
    expect(await screen.findByText('Available')).toBeTruthy();
    expect(title()).toBe('My Referrals');
    expect(screen.getByText('Earn +10 coins per referral')).toBeTruthy();
    expect(screen.getByText('Generate New Referral')).toBeTruthy();
    expect(screen.getByText('Copy Link')).toBeTruthy();
    expect(screen.getByText('Share on WhatsApp')).toBeTruthy();
    expect(screen.getByText(/2d 3h left/)).toBeTruthy();
  });

  it('renders in Hindi; the code, link and dynamic numbers are inserted literally', async () => {
    await setLang('hi');
    serve({ codes: [code(), code({ _id: 'c2', code: 'ZZZ999', status: 'USED', usedBy: 'u9', referralLink: 'https://www.zutsav.com/register?ref=ZZZ999' })] });
    render(<MyReferralsScreen />);
    expect(await screen.findByText(hi.referrals.statusAvailable)).toBeTruthy();
    expect(title()).toBe(hi.referrals.pageTitle);
    expect(screen.getByText(hi.referrals.rewardInfo)).toBeTruthy();
    expect(screen.getByText(hi.referrals.generateCode)).toBeTruthy();
    expect(screen.getByText(hi.referrals.copyLink)).toBeTruthy();
    expect(screen.getByText(hi.referrals.shareWhatsApp)).toBeTruthy();
    expect(screen.getByText(hi.referrals.statusUsed)).toBeTruthy();
    expect(screen.getByText(hi.referrals.referredUser)).toBeTruthy();
    expect(screen.getByText('https://www.zutsav.com/register?ref=ABC123')).toBeTruthy();   // never translated or altered
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.getByText(hi.referrals.dailyLimitInfo.replace('{{used}}', '2').replace('{{limit}}', '5'))).toBeTruthy();
    expect(screen.getAllByText(new RegExp(hi.referrals.timeLeftDaysHours.replace('{{days}}', '2').replace('{{hours}}', '3'))).length).toBeGreaterThan(0);
  });

  it('an expired code shows the localized word', async () => {
    await setLang('hi');
    serve({ codes: [code({ status: 'EXPIRED', isExpired: true, expiresAt: new Date(Date.now() - HOURS).toISOString() })] });
    render(<MyReferralsScreen />);
    expect(await screen.findAllByText(hi.referrals.statusExpired)).not.toHaveLength(0);
  });

  // NOTE: the app copies through a dynamic `await import('expo-clipboard')`, which Jest cannot run (no vm-modules), so
  // here the screen's own fallback runs: it shows the exact link in an alert. The clipboard-success branch (and its
  // `referrals.linkCopied` text) therefore cannot be exercised in this harness — only device testing covers it.
  it('copy: link is never altered; the fallback alert (what runs under Jest) shows it with the localized OK title', async () => {
    await setLang('hi');
    serve();
    render(<MyReferralsScreen />);
    fireEvent.press(await screen.findByText(hi.referrals.copyLink));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(Alert.alert.mock.calls[0]).toEqual([hi.common.ok, 'https://www.zutsav.com/register?ref=ABC123']);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('share sends the localized message around the unchanged link, and the same url parameter', async () => {
    await setLang('hi');
    serve();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    render(<MyReferralsScreen />);
    fireEvent.press(await screen.findByText(hi.referrals.shareWhatsApp));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      message: hi.referrals.shareMessage.replace('{{link}}', 'https://www.zutsav.com/register?ref=ABC123'),
      url: 'https://www.zutsav.com/register?ref=ABC123',
    });
    expect(share.mock.calls[0][0].message).toContain('https://www.zutsav.com/register?ref=ABC123');
  });

  it('the English share message is exactly what it was before', async () => {
    serve();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({});
    render(<MyReferralsScreen />);
    fireEvent.press(await screen.findByText('Share on WhatsApp'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].message).toBe('Join Zutsav using my referral link:\n\nhttps://www.zutsav.com/register?ref=ABC123');
  });

  it('the icon-only share button has a localized accessibility label and the same behavior', async () => {
    await setLang('hi');
    serve();
    const share = jest.spyOn(Share, 'share').mockResolvedValue({});
    render(<MyReferralsScreen />);
    fireEvent.press(await screen.findByLabelText(hi.referrals.shareOther));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  });

  it('generate: same request, localized success alert; failures show the server message or the localized fallback', async () => {
    await setLang('hi');
    serve({ codes: [] });
    api.post.mockResolvedValueOnce({ data: { success: true } });
    render(<MyReferralsScreen />);
    fireEvent.press(await screen.findByText(hi.referrals.generateCode));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/user-referrals/generate');
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(hi.common.ok, hi.referrals.generateSuccess));

    api.post.mockRejectedValueOnce({ response: { status: 429, data: { message: 'Daily limit reached' } } });
    fireEvent.press(screen.getByText(hi.referrals.generateCode));
    await waitFor(() => expect(Alert.alert).toHaveBeenLastCalledWith(hi.common.ok, 'Daily limit reached'));
    api.post.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByText(hi.referrals.generateCode));
    await waitFor(() => expect(Alert.alert).toHaveBeenLastCalledWith(hi.common.ok, hi.referrals.generateError));
  });

  it('empty and failed loads are distinct and localized; retry is localized', async () => {
    await setLang('hi');
    serve({ codes: [] });
    const first = render(<MyReferralsScreen />);
    expect(await screen.findByText(hi.referrals.noReferralsTitle)).toBeTruthy();
    first.unmount();

    serve({ fail: Object.assign(new Error('Network Error'), { request: {} }) });
    render(<MyReferralsScreen />);
    expect(await screen.findByText(hi.referrals.error)).toBeTruthy();
    expect(screen.getByText(hi.referrals.retry)).toBeTruthy();
    expect(screen.queryByText(hi.referrals.noReferralsTitle)).toBeNull();
  });

  it('the daily-limit message is localized and blocks nothing it did not before', async () => {
    await setLang('hi');
    const today = new Date().toISOString();
    serve({ codes: [1, 2, 3].map((n) => code({ _id: `c${n}`, code: `C${n}`, createdAt: today })), settings: { dailyLimit: 3 } });
    render(<MyReferralsScreen />);
    expect(await screen.findByText(hi.referrals.dailyLimitReached.replace('{{used}}', '3').replace('{{limit}}', '3'))).toBeTruthy();
  });

  it('a language switch re-renders in place and leaves the codes and links as they were', async () => {
    serve();
    render(<MyReferralsScreen />);
    expect(await screen.findByText('Available')).toBeTruthy();
    await setLang('ta');
    expect(await screen.findByText(ta.referrals.statusAvailable)).toBeTruthy();
    expect(title()).toBe(ta.referrals.pageTitle);
    expect(screen.getByText('https://www.zutsav.com/register?ref=ABC123')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });
});
