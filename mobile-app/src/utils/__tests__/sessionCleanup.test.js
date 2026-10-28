import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalSession, clearUserScopedData, CART_KEY } from '../sessionCleanup';
import { useCartStore } from '../../store/cartStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePanditStatusStore } from '../../store/panditStatusStore';
import { saveCache, loadCache } from '../offlineCache';
import { disconnectSocket } from '../socket';

jest.mock('../../api/axios', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../socket', () => ({ disconnectSocket: jest.fn() }));

// Synthetic private data for "account A".
const PRIVATE_ITEM = { productId: 'p1', variantId: null, name: 'Private Item A', price: 100, quantity: 2 };
const PRIVATE_NOTIFICATION = { _id: 'n1', title: 'Private Notification A', isRead: false };

async function seedAccountA() {
  await SecureStore.setItemAsync('zutsav_token', 'tokA');
  await SecureStore.setItemAsync('zutsav_user', JSON.stringify({ _id: 'uA' }));
  await AsyncStorage.setItem(CART_KEY, JSON.stringify([PRIVATE_ITEM]));
  await AsyncStorage.setItem('zutsav_checkout_attempt', JSON.stringify({ key: 'zc_interrupted_attempt_key_A', fingerprint: 'f', createdAt: 1 }));
  await AsyncStorage.setItem('zutsav_order_retry', JSON.stringify({ orderA: { key: 'zc_interrupted_retry_key_A', createdAt: 1 } }));
  await saveCache('notifications', [PRIVATE_NOTIFICATION]);
  await saveCache('anything-else', { secret: 'A' });
  useCartStore.setState({ items: [PRIVATE_ITEM] });
  useNotificationStore.setState({ notifications: [PRIVATE_NOTIFICATION], unreadCount: 1, loading: false });
  usePanditStatusStore.setState({ pandit: { status: 'approved' }, phase: 'loaded', checkedOnce: true, lastFetchedAt: new Date() });
}

async function asyncStorageKeys() {
  return (await AsyncStorage.getAllKeys()).slice().sort();
}

beforeEach(() => {
  useCartStore.setState({ items: [] });
  useNotificationStore.setState({ notifications: [], unreadCount: 0, loading: false });
  usePanditStatusStore.getState().reset();
});

describe('clearLocalSession', () => {
  it('removes credentials, cart, every offline cache entry and resets all per-user stores', async () => {
    await seedAccountA();

    const { errors } = await clearLocalSession();

    expect(errors).toEqual([]);
    expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
    expect(await SecureStore.getItemAsync('zutsav_user')).toBeNull();
    expect(await AsyncStorage.getItem(CART_KEY)).toBeNull();
    expect(await AsyncStorage.getItem('zutsav_checkout_attempt')).toBeNull(); // an interrupted checkout's key is per-account
    expect(await AsyncStorage.getItem('zutsav_order_retry')).toBeNull();      // …and so are interrupted payment-retry keys
    expect(await loadCache('notifications')).toBeNull();
    expect(await loadCache('anything-else')).toBeNull();
    expect(await asyncStorageKeys()).toEqual([]);

    expect(useCartStore.getState().items).toEqual([]);
    expect(useNotificationStore.getState()).toMatchObject({ notifications: [], unreadCount: 0, loading: false });
    expect(usePanditStatusStore.getState()).toMatchObject({ pandit: null, phase: 'idle', checkedOnce: false, lastFetchedAt: null });
    expect(disconnectSocket).toHaveBeenCalled();
  });

  it('preserves device-level preferences and shared config', async () => {
    await seedAccountA();
    await AsyncStorage.setItem('zutsav_theme', 'saffron');
    await AsyncStorage.setItem('zutsav_unrelated_app_flag', 'onboarded');
    await SecureStore.setItemAsync('zutsav_language', 'hi');

    await clearLocalSession();

    expect(await AsyncStorage.getItem('zutsav_theme')).toBe('saffron');
    expect(await AsyncStorage.getItem('zutsav_unrelated_app_flag')).toBe('onboarded');
    expect(await SecureStore.getItemAsync('zutsav_language')).toBe('hi');
    expect(await asyncStorageKeys()).toEqual(['zutsav_theme', 'zutsav_unrelated_app_flag']);
  });

  it('is idempotent: repeated and concurrent calls do not throw or corrupt state', async () => {
    await seedAccountA();
    await AsyncStorage.setItem('zutsav_theme', 'saffron');

    const results = await Promise.all([clearLocalSession(), clearLocalSession(), clearLocalSession()]);
    await clearLocalSession();
    await clearLocalSession();

    results.forEach((r) => expect(r.errors).toEqual([]));
    expect(await asyncStorageKeys()).toEqual(['zutsav_theme']);
    expect(useCartStore.getState().items).toEqual([]);
    // concurrent callers share one run (single credential deletion pass)
    const tokenDeletes = SecureStore.deleteItemAsync.mock.calls.filter(([k]) => k === 'zutsav_token');
    expect(tokenDeletes.length).toBe(3); // 1 shared concurrent run + 2 sequential reruns
  });

  it('works when there is nothing to clear', async () => {
    await expect(clearLocalSession()).resolves.toEqual({ errors: [] });
  });

  it('keeps going and reports when one step fails', async () => {
    await seedAccountA();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    AsyncStorage.getAllKeys.mockRejectedValueOnce(new Error('disk error')); // one-shot, then real mock again

    const { errors } = await clearLocalSession();

    expect(errors).toEqual([{ step: 'offlineCache', message: 'disk error' }]);
    expect(warn).toHaveBeenCalled();
    // every other step still completed
    expect(await SecureStore.getItemAsync('zutsav_token')).toBeNull();
    expect(await AsyncStorage.getItem(CART_KEY)).toBeNull();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(usePanditStatusStore.getState().phase).toBe('idle');

    warn.mockRestore();
  });

  it('reports a credential-deletion failure but still clears the rest', async () => {
    await seedAccountA();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore locked'));

    const { errors } = await clearLocalSession();

    expect(errors).toEqual([{ step: 'zutsav_token', message: 'keystore locked' }]);
    expect(await SecureStore.getItemAsync('zutsav_user')).toBeNull();
    expect(useCartStore.getState().items).toEqual([]);
    warn.mockRestore();
  });
});

describe('clearUserScopedData', () => {
  it('clears per-account data but leaves the credentials alone', async () => {
    await seedAccountA();
    await AsyncStorage.setItem('zutsav_theme', 'saffron');

    await clearUserScopedData();

    expect(await SecureStore.getItemAsync('zutsav_token')).toBe('tokA');
    expect(await asyncStorageKeys()).toEqual(['zutsav_theme']);
    expect(useCartStore.getState().items).toEqual([]);
  });
});

describe('in-flight requests from the previous account', () => {
  it('a notification fetch that resolves after cleanup neither repopulates the store nor rewrites the cache', async () => {
    const api = require('../../api/axios').default;
    let release;
    api.get.mockReturnValue(new Promise((r) => { release = r; }));

    const pending = useNotificationStore.getState().fetch();
    await Promise.resolve();
    await clearLocalSession();
    release({ data: { notifications: [PRIVATE_NOTIFICATION] } });
    await pending;
    await new Promise((r) => setTimeout(r, 0));

    expect(useNotificationStore.getState()).toMatchObject({ notifications: [], loading: false });
    expect(await loadCache('notifications')).toBeNull();
  });

  it('a cart load that resolves after cleanup does not resurrect the old cart', async () => {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify([PRIVATE_ITEM]));
    let release;
    AsyncStorage.getItem.mockImplementationOnce(() => new Promise((r) => { release = r; }));

    const pending = useCartStore.getState().load();
    await Promise.resolve();
    await clearLocalSession();
    release(JSON.stringify([PRIVATE_ITEM]));
    await pending;

    expect(useCartStore.getState().items).toEqual([]);
  });
});
