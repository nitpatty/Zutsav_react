import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../api/axios';
import { useAuthStore } from '../authStore';
import { useCartStore } from '../cartStore';
import { useNotificationStore } from '../notificationStore';
import { usePanditStatusStore } from '../panditStatusStore';
import { loadCache } from '../../utils/offlineCache';
import { autocompletePlaces } from '../../services/geocodingService';

// Integration of the REAL axios client (interceptors), auth store, cleanup and the
// per-user stores. Only the transport is replaced: no request leaves the process.
jest.mock('../../utils/socket', () => ({ disconnectSocket: jest.fn() }));

const A = { _id: 'uA', name: 'User A', email: 'a@example.invalid', role: 'user' };
const B = { _id: 'uB', name: 'User B', email: 'b@example.invalid', role: 'user' };
const P = { _id: 'pP', name: 'Pandit P', email: 'p@example.invalid', role: 'pandit' };
const TOKENS = { 'a@example.invalid': 'tokA', 'b@example.invalid': 'tokB', 'p@example.invalid': 'tokP' };
const USERS = { 'a@example.invalid': A, 'b@example.invalid': B, 'p@example.invalid': P };

let calls;
let handler; // (config, body) => { status?, data?, networkError?, timeout?, delayMs? }

const httpError = (config, status, data) => Object.assign(
  new Error(`Request failed with status code ${status}`),
  { config, isAxiosError: true, response: { status, data, headers: {}, config } },
);

beforeEach(() => {
  calls = [];
  handler = () => ({ status: 200, data: {} });
  api.defaults.adapter = async (config) => {
    const body = config.data ? JSON.parse(config.data) : undefined;
    calls.push({ method: config.method, url: config.url, auth: config.headers.Authorization, body });
    const r = await handler(config, body);
    if (r.networkError) throw Object.assign(new Error('Network Error'), { config, isAxiosError: true, code: 'ERR_NETWORK' });
    if (r.timeout) throw Object.assign(new Error('timeout of 30000ms exceeded'), { config, isAxiosError: true, code: 'ECONNABORTED' });
    if (r.status >= 400) throw httpError(config, r.status, r.data);
    return { data: r.data, status: r.status || 200, statusText: 'OK', headers: {}, config };
  };

  useAuthStore.setState({ user: null, token: null, loading: false, ready: true });
  useCartStore.setState({ items: [] });
  useNotificationStore.setState({ notifications: [], unreadCount: 0, loading: false });
  usePanditStatusStore.getState().reset();
});

const settle = async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const callsTo = (url) => calls.filter((c) => c.url === url);

// Standard login-capable server.
// `extra` overrides take priority over the defaults.
const loginServer = (extra = () => undefined) => (config, body) => {
  const override = extra(config, body);
  if (override) return override;
  if (config.url === '/auth/login') return { data: { success: true, token: TOKENS[body.emailOrPhone], user: USERS[body.emailOrPhone] } };
  if (config.url === '/auth/logout') return { data: { success: true } };
  return { status: 200, data: {} };
};

const signIn = async (email) => useAuthStore.getState().login(email, 'synthetic-password');

const dumpStorage = async () => {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  const secure = [await SecureStore.getItemAsync('zutsav_token'), await SecureStore.getItemAsync('zutsav_user')];
  return JSON.stringify({ pairs, secure });
};

const expectSignedOut = async () => {
  expect(useAuthStore.getState()).toMatchObject({ user: null, token: null, loading: false });
  expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
  expect(await SecureStore.getItemAsync('zutsav_user')).toBeNull();
};

describe('F-01 — persistent session request', () => {
  it('password login sends rememberMe: true', async () => {
    handler = loginServer();
    await signIn('a@example.invalid');
    expect(callsTo('/auth/login')[0].body).toEqual({ emailOrPhone: 'a@example.invalid', password: 'synthetic-password', rememberMe: true });
    expect(useAuthStore.getState()).toMatchObject({ token: 'tokA', user: A });
    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tokA');
  });

  it('OTP login sends the same rememberMe: true and persists the session', async () => {
    handler = (config, body) => (config.url === '/auth/login/otp/verify'
      ? { data: { success: true, token: 'tokA', user: A, rememberMe: true } } : { data: {} });
    await useAuthStore.getState().loginWithOtp('9876543210', '123456');
    expect(callsTo('/auth/login/otp/verify')[0].body).toEqual({ emailOrPhone: '9876543210', otp: '123456', rememberMe: true });
    expect(useAuthStore.getState()).toMatchObject({ token: 'tokA', user: A });
    expect(await SecureStore.getItemAsync('zutsav_user')).toBe(JSON.stringify(A));
  });

  it('hydrate restores a stored session', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'tokA');
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(A));
    useAuthStore.setState({ ready: false });
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState()).toMatchObject({ token: 'tokA', user: A, ready: true });
  });
});

describe('F-01 — confirmed session expiry (401)', () => {
  beforeEach(async () => {
    handler = loginServer();
    await signIn('a@example.invalid');
    await useCartStore.getState().addItem({ productId: 'p1', name: 'Item', price: 10, stock: 5 });
    usePanditStatusStore.setState({ pandit: { status: 'approved' }, phase: 'loaded', checkedOnce: true });
  });

  it('a 401 on an authenticated request clears persisted + in-memory auth and all per-user state', async () => {
    handler = loginServer((config) => (config.url === '/bookings' ? { status: 401, data: { message: 'Invalid or expired token' } } : undefined));

    await expect(api.get('/bookings')).rejects.toMatchObject({ response: { status: 401 } });
    await settle();

    await expectSignedOut();
    expect(useCartStore.getState().items).toEqual([]);
    expect(await AsyncStorage.getItem('zutsav_cart')).toBeNull();
    expect(usePanditStatusStore.getState()).toMatchObject({ pandit: null, phase: 'idle' });
  });

  it('does NOT call the server logout endpoint', async () => {
    handler = loginServer((config) => (config.url === '/bookings' ? { status: 401 } : undefined));
    await api.get('/bookings').catch(() => {});
    await settle();
    expect(callsTo('/auth/logout')).toHaveLength(0);
  });

  it('a burst of concurrent 401s triggers exactly one cleanup and every caller still gets its error', async () => {
    handler = loginServer((config) => (config.url.startsWith('/burst') ? { status: 401 } : undefined));
    SecureStore.deleteItemAsync.mockClear();

    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => api.get(`/burst/${i}`)));
    await settle();

    results.forEach((r) => {
      expect(r.status).toBe('rejected');
      expect(r.reason.response.status).toBe(401);
    });
    const tokenDeletes = SecureStore.deleteItemAsync.mock.calls.filter(([k]) => k === 'zutsav_token');
    expect(tokenDeletes).toHaveLength(1);
    await expectSignedOut();
  });

  it('a late 401 for an old token does not sign out a newer session', async () => {
    let release;
    handler = loginServer((config) => (config.url === '/slow'
      ? new Promise((r) => { release = () => r({ status: 401 }); }) : undefined));

    const slow = api.get('/slow').catch(() => {}); // sent with tokA
    await settle();
    await useAuthStore.getState().setSession('tokB', B); // user re-authenticated meanwhile
    release();
    await slow;
    await settle();

    expect(useAuthStore.getState()).toMatchObject({ token: 'tokB', user: B });
    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tokB');
  });

  it.each([
    ['/auth/login', 'a failed login (wrong password)'],
    ['/auth/delete-account/check-password', 'a wrong password on the delete-account check'],
  ])('401 from %s (%s) is a credential error, not an expired session', async (url) => {
    handler = loginServer((config) => (config.url === url ? { status: 401, data: { message: 'Incorrect password' } } : undefined));
    const before = useAuthStore.getState().token;

    await expect(api.post(url, { password: 'wrong' })).rejects.toMatchObject({ response: { status: 401 } });
    await settle();

    expect(useAuthStore.getState()).toMatchObject({ token: before, user: A });
    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tokA');
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('an anonymous 401 (no Bearer token sent) is ignored', async () => {
    handler = loginServer((config) => (config.url === '/public' ? { status: 401 } : undefined));
    await api.get('/public', { headers: { Authorization: undefined }, transformRequest: [(d, h) => { delete h.Authorization; return d; }] }).catch(() => {});
    await settle();
    expect(callsTo('/public')[0].auth).toBeUndefined(); // really sent without a token
    expect(useAuthStore.getState().user).toEqual(A);
  });
});

describe('F-01 — failures that are NOT proof of an expired session', () => {
  beforeEach(async () => {
    handler = loginServer();
    await signIn('a@example.invalid');
    await useCartStore.getState().addItem({ productId: 'p1', name: 'Item', price: 10, stock: 5 });
  });

  it.each([
    ['403 Forbidden', { status: 403, data: { message: 'Forbidden' } }],
    ['500 Internal Server Error', { status: 500 }],
    ['503 Service Unavailable', { status: 503 }],
    ['network error (offline)', { networkError: true }],
    ['timeout', { timeout: true }],
  ])('%s keeps the session, storage and per-user state', async (_label, response) => {
    handler = loginServer((config) => (config.url === '/flaky' ? response : undefined));

    await expect(api.get('/flaky')).rejects.toBeDefined();
    await settle();

    expect(useAuthStore.getState()).toMatchObject({ token: 'tokA', user: A });
    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tokA');
    expect(await SecureStore.getItemAsync('zutsav_user')).toBe(JSON.stringify(A));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(await AsyncStorage.getItem('zutsav_cart')).not.toBeNull();
  });
});

describe('F-01 — refreshUser', () => {
  beforeEach(async () => {
    handler = loginServer();
    await signIn('a@example.invalid');
  });

  it('success stores and returns the fresh user', async () => {
    const fresh = { ...A, name: 'Fresh' };
    handler = loginServer((config) => (config.url === '/auth/me' ? { data: { user: fresh } } : undefined));
    await expect(useAuthStore.getState().refreshUser()).resolves.toEqual(fresh);
    expect(useAuthStore.getState().user).toEqual(fresh);
  });

  it('a confirmed 401 is fully cleaned up before it resolves (null) and never calls server logout', async () => {
    handler = loginServer((config) => (config.url === '/auth/me' ? { status: 401 } : undefined));
    await expect(useAuthStore.getState().refreshUser()).resolves.toBeNull();
    await expectSignedOut(); // no settle(): cleanup is awaited, not fire-and-forget
    expect(callsTo('/auth/logout')).toHaveLength(0);
  });

  it.each([
    ['network error', { networkError: true }],
    ['timeout', { timeout: true }],
    ['500', { status: 500 }],
    ['503', { status: 503 }],
    ['403', { status: 403 }],
  ])('%s is rethrown and the valid local session is kept', async (_l, response) => {
    handler = loginServer((config) => (config.url === '/auth/me' ? response : undefined));

    await expect(useAuthStore.getState().refreshUser()).rejects.toBeDefined();
    await settle();

    expect(useAuthStore.getState()).toMatchObject({ token: 'tokA', user: A, loading: false });
    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tokA');
  });

  it('a retry after a transient failure succeeds', async () => {
    handler = loginServer((config) => (config.url === '/auth/me' ? { networkError: true } : undefined));
    await expect(useAuthStore.getState().refreshUser()).rejects.toBeDefined();
    handler = loginServer((config) => (config.url === '/auth/me' ? { data: { user: A } } : undefined));
    await expect(useAuthStore.getState().refreshUser()).resolves.toEqual(A);
  });
});

describe('F-15 — logout cleanup and account isolation', () => {
  it('explicit logout clears credentials, cart, caches, notifications and pandit state; keeps preferences', async () => {
    handler = loginServer((config) => {
      if (config.url === '/notifications?limit=50') return { data: { notifications: [{ _id: 'n1', title: 'PRIVATE-A' }] } };
      return undefined;
    });
    await signIn('a@example.invalid');
    await useCartStore.getState().addItem({ productId: 'p1', name: 'Private Cart Item A', price: 10, stock: 5 });
    await useNotificationStore.getState().fetch();
    usePanditStatusStore.setState({ pandit: { status: 'approved' }, phase: 'loaded', checkedOnce: true });
    await AsyncStorage.setItem('zutsav_theme', 'saffron');
    await SecureStore.setItemAsync('zutsav_language', 'hi');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(await loadCache('notifications')).not.toBeNull();

    await useAuthStore.getState().logout();

    await expectSignedOut();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useNotificationStore.getState()).toMatchObject({ notifications: [], unreadCount: 0 });
    expect(await loadCache('notifications')).toBeNull();
    expect(usePanditStatusStore.getState()).toMatchObject({ pandit: null, phase: 'idle', checkedOnce: false });
    expect(await AsyncStorage.getItem('zutsav_theme')).toBe('saffron');
    expect(await SecureStore.getItemAsync('zutsav_language')).toBe('hi');
    expect(await AsyncStorage.getAllKeys()).toEqual(['zutsav_theme']);
  });

  it('a Pandit logout resets the pandit gate state', async () => {
    handler = loginServer((config) => (config.url === '/pandits/me' ? { data: { pandit: { status: 'approved', fullName: 'PRIVATE-PANDIT' } } } : undefined));
    await signIn('p@example.invalid');
    await usePanditStatusStore.getState().fetch();
    expect(usePanditStatusStore.getState().pandit.status).toBe('approved');

    await useAuthStore.getState().logout();

    expect(usePanditStatusStore.getState()).toMatchObject({ pandit: null, phase: 'idle', checkedOnce: false, lastFetchedAt: null });
    await expectSignedOut();
  });

  it('local cleanup completes when the server logout fails (offline, 500, or 401)', async () => {
    for (const failure of [{ networkError: true }, { status: 500 }, { status: 401 }]) {
      handler = loginServer((config) => (config.url === '/auth/logout' ? failure : undefined));
      await signIn('a@example.invalid');
      await useCartStore.getState().addItem({ productId: 'p1', name: 'Item', price: 10, stock: 5 });

      await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
      await settle();

      await expectSignedOut();
      expect(useCartStore.getState().items).toEqual([]);
      expect(await AsyncStorage.getItem('zutsav_cart')).toBeNull();
      expect(callsTo('/auth/logout').length).toBeGreaterThan(0);
      calls = [];
    }
  });

  it('User A → logout → User B: nothing of A is visible to B, in memory or in storage', async () => {
    handler = loginServer((config) => {
      if (config.url === '/notifications?limit=50') {
        return config.headers.Authorization === 'Bearer tokA'
          ? { data: { notifications: [{ _id: 'nA', title: 'PRIVATE-NOTIFICATION-A' }] } }
          : { networkError: true }; // B is offline: only the offline cache could leak
      }
      if (config.url === '/location/autocomplete') return { data: { found: true, results: [{ label: '12 Private Lane A', lat: 1, lng: 2 }] } };
      return undefined;
    });

    await signIn('a@example.invalid');
    await useCartStore.getState().addItem({ productId: 'pA', name: 'PRIVATE-CART-A', price: 10, stock: 5 });
    await useNotificationStore.getState().fetch();
    await autocompletePlaces('12 Private Lane');
    await autocompletePlaces('12 Private Lane');
    expect(callsTo('/location/autocomplete')).toHaveLength(1); // second one served from the in-memory cache

    await useAuthStore.getState().logout();
    await signIn('b@example.invalid');

    await useCartStore.getState().load();
    await useNotificationStore.getState().fetch(); // network error → falls back to cache, which must be empty
    expect(useAuthStore.getState().user).toEqual(B);
    expect(useCartStore.getState().items).toEqual([]);
    expect(useNotificationStore.getState().notifications).toEqual([]);

    const dump = await dumpStorage();
    ['PRIVATE-CART-A', 'PRIVATE-NOTIFICATION-A', 'tokA', 'a@example.invalid', 'uA'].forEach((s) => expect(dump).not.toContain(s));

    await autocompletePlaces('12 Private Lane'); // geocode cache was dropped → a fresh request
    expect(callsTo('/location/autocomplete')).toHaveLength(2);
  });

  it('a new login wipes leftovers from an interrupted earlier cleanup (app killed mid-logout)', async () => {
    await AsyncStorage.setItem('zutsav_cart', JSON.stringify([{ productId: 'pA', name: 'STALE-CART-A', price: 1, quantity: 1 }]));
    await AsyncStorage.setItem('zutsav_cache_notifications', JSON.stringify({ data: [{ title: 'STALE-NOTIFICATION-A' }], cachedAt: 1 }));
    await AsyncStorage.setItem('zutsav_theme', 'saffron');
    handler = loginServer();

    await signIn('b@example.invalid');
    await useCartStore.getState().load();

    expect(useCartStore.getState().items).toEqual([]);
    expect(await AsyncStorage.getAllKeys()).toEqual(['zutsav_theme']);
  });

  it('repeated logout and repeated expiry never throw or corrupt state', async () => {
    handler = loginServer();
    await signIn('a@example.invalid');

    await useAuthStore.getState().logout();
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    await expect(useAuthStore.getState().expireSession()).resolves.toBeUndefined();
    await expect(Promise.all([
      useAuthStore.getState().expireSession(),
      useAuthStore.getState().expireSession(),
      useAuthStore.getState().clearSession(),
    ])).resolves.toBeDefined();

    await expectSignedOut();
    // and the store is still usable afterwards
    await signIn('b@example.invalid');
    expect(useAuthStore.getState()).toMatchObject({ token: 'tokB', user: B });
  });
});
