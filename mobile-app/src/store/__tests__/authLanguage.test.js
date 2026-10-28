import * as SecureStore from 'expo-secure-store';
import api from '../../api/axios';
import { useAuthStore } from '../authStore';
import { useCartStore } from '../cartStore';
import { useLanguageStore, LANGUAGE_STORAGE_KEY } from '../../i18n/languageStore';

// Real axios client (interceptors) + real auth store + real cleanup; only the transport is replaced.
jest.mock('../../utils/socket', () => ({ disconnectSocket: jest.fn() }));

let calls;
let respond;
const user = (over = {}) => ({ _id: 'u1', name: 'Asha', email: 'a@example.invalid', role: 'user', ...over });
const stored = () => SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200, data: {} });
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params });
    const r = respond(config);
    if (r.status >= 400) {
      throw Object.assign(new Error(`HTTP ${r.status}`), { config, isAxiosError: true, response: { status: r.status, data: r.data, headers: {}, config } });
    }
    return { data: r.data, status: r.status || 200, statusText: 'OK', headers: {}, config };
  };
  useAuthStore.setState({ user: null, token: null, loading: false, ready: true });
  useCartStore.setState({ items: [] });
});

describe('sign-in: the account language preference wins', () => {
  it('password login applies and persists the account language over the device language', async () => {
    await useLanguageStore.getState().setLanguage('ta');
    respond = () => ({ data: { token: 'tok', user: user({ preferredLanguage: 'hi' }) } });
    await useAuthStore.getState().login('a@example.invalid', 'secret1');
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
  });

  it('OTP login behaves the same', async () => {
    respond = () => ({ data: { token: 'tok', user: user({ preferredLanguage: 'mr' }) } });
    await useAuthStore.getState().loginWithOtp('a@example.invalid', '123456');
    expect(useLanguageStore.getState().language).toBe('mr');
  });

  it('registration (setSession) applies the language the server stored', async () => {
    await useAuthStore.getState().setSession('tok', user({ preferredLanguage: 'gu' }));
    expect(useLanguageStore.getState().language).toBe('gu');
    expect(await stored()).toBe('gu');
  });

  it('getMe (refreshUser) applies it too', async () => {
    useAuthStore.setState({ user: user(), token: 'tok' });
    respond = () => ({ data: { user: user({ preferredLanguage: 'bn' }) } });
    await useAuthStore.getState().refreshUser();
    expect(useLanguageStore.getState().language).toBe('bn');
  });

  it.each([
    ['omits the field', {}],
    ['sends null', { preferredLanguage: null }],
    ['sends an unsupported value', { preferredLanguage: 'xx' }],
    ['sends a region-tagged value', { preferredLanguage: 'hi-IN' }],
  ])('keeps the device language when the account %s', async (_n, extra) => {
    await useLanguageStore.getState().setLanguage('te');
    respond = () => ({ data: { token: 'tok', user: user(extra) } });
    await useAuthStore.getState().login('a@example.invalid', 'secret1');
    expect(useLanguageStore.getState().language).toBe('te');
    expect(await stored()).toBe('te');
  });

  it('a deletion-pending login stores no session and changes no language', async () => {
    await useLanguageStore.getState().setLanguage('te');
    respond = () => ({ data: { deletionPending: true, token: 'restore-token', user: user({ preferredLanguage: 'hi' }) } });
    await useAuthStore.getState().login('a@example.invalid', 'secret1');
    expect(useAuthStore.getState().token).toBeNull();
    expect(useLanguageStore.getState().language).toBe('te');
  });

  it('a failed login leaves the language alone', async () => {
    await useLanguageStore.getState().setLanguage('te');
    respond = () => ({ status: 401, data: { message: 'Invalid credentials' } });
    await expect(useAuthStore.getState().login('a@example.invalid', 'bad')).rejects.toBeTruthy();
    expect(useLanguageStore.getState().language).toBe('te');
  });

  it('applying the account value never writes it back to the server', async () => {
    respond = () => ({ data: { token: 'tok', user: user({ preferredLanguage: 'hi' }) } });
    await useAuthStore.getState().login('a@example.invalid', 'secret1');
    expect(calls.filter((c) => c.url === '/auth/preferred-language')).toHaveLength(0);
    expect(calls.map((c) => c.method)).toEqual(['post']);
  });
});

describe('background refresh vs an unsynced local choice', () => {
  it('refreshUser does not revert a choice the server has not accepted yet', async () => {
    await useLanguageStore.getState().setLanguage('ta');
    useLanguageStore.setState({ pendingSync: 'ta' });
    useAuthStore.setState({ user: user(), token: 'tok' });
    respond = () => ({ data: { user: user({ preferredLanguage: 'hi' }) } });
    await useAuthStore.getState().refreshUser();
    expect(useLanguageStore.getState().language).toBe('ta');
  });

  it('a fresh sign-in as someone else does reset to that account (and drops the pending marker)', async () => {
    await useLanguageStore.getState().setLanguage('ta');
    useLanguageStore.setState({ pendingSync: 'ta' });
    respond = () => ({ data: { token: 'tok2', user: user({ _id: 'u2', preferredLanguage: 'hi' }) } });
    await useAuthStore.getState().login('b@example.invalid', 'secret1');
    expect(useLanguageStore.getState()).toMatchObject({ language: 'hi', pendingSync: null });
  });
});

describe('logout and session expiry keep the device language and nothing private', () => {
  const signedIn = async () => {
    await useLanguageStore.getState().setLanguage('hi');
    await SecureStore.setItemAsync('zutsav_token', 'tok');
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(user({ preferredLanguage: 'hi' })));
    useAuthStore.setState({ user: user({ preferredLanguage: 'hi' }), token: 'tok' });
    useCartStore.setState({ items: [{ productId: 'p1', quantity: 1 }] });
  };

  it('logout: language stays (memory and storage); credentials and the cart are cleared', async () => {
    await signedIn();
    await useAuthStore.getState().logout();
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
    expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
    expect(await SecureStore.getItemAsync('zutsav_user')).toBeNull();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('confirmed session expiry: language stays; the session is wiped as before', async () => {
    await signedIn();
    await useAuthStore.getState().expireSession();
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
    expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('logout while offline still keeps the language', async () => {
    await signedIn();
    api.defaults.adapter = async (config) => { throw Object.assign(new Error('Network Error'), { config, isAxiosError: true, code: 'ERR_NETWORK' }); };
    await useAuthStore.getState().logout();
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
  });

  it('the account language is not carried to the next person: they get their own at sign-in', async () => {
    await signedIn();
    await useAuthStore.getState().logout();
    respond = () => ({ data: { token: 'tok2', user: user({ _id: 'u2', preferredLanguage: 'en' }) } });
    await useAuthStore.getState().login('b@example.invalid', 'secret1');
    expect(useLanguageStore.getState().language).toBe('en');
  });
});

describe('startup hydration of the auth store does not touch the language', () => {
  it('restoring a stored session leaves the device language as it was', async () => {
    await useLanguageStore.getState().setLanguage('kn');
    await SecureStore.setItemAsync('zutsav_token', 'tok');
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(user({ preferredLanguage: 'hi' })));
    useAuthStore.setState({ ready: false });
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().user).toBeTruthy();
    expect(useLanguageStore.getState().language).toBe('kn');
  });
});
