import * as SecureStore from 'expo-secure-store';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useLanguageStore, LANGUAGE_STORAGE_KEY } from '../languageStore';
import { changeLanguage, __resetLanguagePreference } from '../languagePreference';

jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));
jest.mock('../../utils/socket', () => ({ disconnectSocket: jest.fn() }));

const signIn = (user = { _id: 'u1', preferredLanguage: 'en' }) => useAuthStore.setState({ token: 'tok', user, ready: true });
const patches = () => api.patch.mock.calls.filter(([url]) => url === '/auth/preferred-language');
const stored = () => SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);

beforeEach(() => {
  api.patch.mockReset();
  api.patch.mockResolvedValue({ data: { success: true } });
  __resetLanguagePreference();
  useAuthStore.setState({ user: null, token: null, ready: true, loading: false });
});

describe('changeLanguage — signed in', () => {
  it('changes locally first, persists, then PATCHes the documented endpoint with the exact body', async () => {
    signIn();
    const result = await changeLanguage('hi');
    expect(result).toMatchObject({ changed: true, synced: true });
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith('/auth/preferred-language', { preferredLanguage: 'hi' });
  });

  it('keeps the cached user (state and SecureStore copy) in step after a successful sync', async () => {
    signIn({ _id: 'u1', name: 'Asha', preferredLanguage: 'en' });
    await changeLanguage('ta');
    expect(useAuthStore.getState().user).toMatchObject({ _id: 'u1', name: 'Asha', preferredLanguage: 'ta' });
    expect(JSON.parse(await SecureStore.getItemAsync('zutsav_user'))).toMatchObject({ preferredLanguage: 'ta' });
    expect(useLanguageStore.getState().pendingSync).toBeNull();
  });

  it('makes no request when the language is already in effect', async () => {
    signIn();
    await useLanguageStore.getState().setLanguage('hi');
    const result = await changeLanguage('hi');
    expect(result).toMatchObject({ changed: false, reason: 'unchanged' });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('does not re-send a value the account already has', async () => {
    signIn({ _id: 'u1', preferredLanguage: 'hi' });
    await changeLanguage('hi'); // device was English, account already Hindi
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('rejects an unavailable/unsupported code with no state change and no request', async () => {
    signIn();
    for (const code of ['xx', 'hi-IN', '', null, undefined]) {
      expect(await changeLanguage(code)).toMatchObject({ changed: false, reason: 'unavailable' });
    }
    expect(useLanguageStore.getState().language).toBe('en');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('sends only one request at a time and the LAST choice wins when the user taps quickly', async () => {
    signIn();
    const resolvers = [];
    api.patch.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));

    const a = changeLanguage('hi');
    await Promise.resolve(); await Promise.resolve();
    const b = changeLanguage('ta');
    const c = changeLanguage('mr');
    await new Promise((r) => setTimeout(r, 0));

    expect(patches()).toHaveLength(1);                       // still only the first request in flight
    expect(patches()[0][1]).toEqual({ preferredLanguage: 'hi' });
    expect(useLanguageStore.getState().language).toBe('mr'); // local UI already shows the latest choice

    resolvers[0]({ data: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(patches()).toHaveLength(2);
    expect(patches()[1][1]).toEqual({ preferredLanguage: 'mr' }); // 'ta' was superseded, never sent
    resolvers[1]({ data: {} });
    await Promise.all([a, b, c]);

    expect(patches().map(([, body]) => body.preferredLanguage)).toEqual(['hi', 'mr']);
    expect(useAuthStore.getState().user.preferredLanguage).toBe('mr');
  });

  it('flipping back to the account value before the first request returns sends nothing extra', async () => {
    signIn({ _id: 'u1', preferredLanguage: 'en' });
    const resolvers = [];
    api.patch.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));
    const a = changeLanguage('hi');
    await Promise.resolve(); await Promise.resolve();
    const b = changeLanguage('hi'); // same code while in flight
    await new Promise((r) => setTimeout(r, 0));
    resolvers[0]({ data: {} });
    await Promise.all([a, b]);
    expect(patches()).toHaveLength(1);
  });
});

describe('changeLanguage — failures never break the session or the local choice', () => {
  it('keeps the local language, reports an unsynced result and remembers it is pending', async () => {
    signIn();
    api.patch.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    const result = await changeLanguage('gu');
    expect(result).toMatchObject({ changed: true, synced: false, reason: 'request-failed' });
    expect(useLanguageStore.getState().language).toBe('gu');
    expect(await stored()).toBe('gu');
    expect(useLanguageStore.getState().pendingSync).toBe('gu');
    expect(useAuthStore.getState().user.preferredLanguage).toBe('en'); // the account was NOT changed (no pretending)
  });

  it.each([[500], [400], [403], [401]])('a %i response does not clear the session or the stored token', async (status) => {
    signIn();
    await SecureStore.setItemAsync('zutsav_token', 'tok');
    api.patch.mockRejectedValue({ response: { status, data: { message: 'nope' } } });
    const result = await changeLanguage('te');
    expect(result.synced).toBe(false);
    expect(useAuthStore.getState().token).toBe('tok');
    expect(useAuthStore.getState().user).toBeTruthy();
    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tok');
    expect(useLanguageStore.getState().language).toBe('te');
  });

  it('a later success clears the pending marker', async () => {
    signIn();
    api.patch.mockRejectedValueOnce(new Error('offline'));
    await changeLanguage('kn');
    expect(useLanguageStore.getState().pendingSync).toBe('kn');
    api.patch.mockResolvedValue({ data: {} });
    useAuthStore.setState({ user: { _id: 'u1', preferredLanguage: 'en' } });
    await changeLanguage('ml');
    await changeLanguage('kn');
    expect(useLanguageStore.getState().pendingSync).toBeNull();
  });
});

describe('changeLanguage — guests', () => {
  it('changes and persists locally with no request at all', async () => {
    const result = await changeLanguage('bn');
    expect(result).toMatchObject({ changed: true, synced: false, reason: 'guest' });
    expect(useLanguageStore.getState().language).toBe('bn');
    expect(await stored()).toBe('bn');
    expect(api.patch).not.toHaveBeenCalled();
  });
});
