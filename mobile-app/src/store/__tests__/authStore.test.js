import * as SecureStore from 'expo-secure-store';
import api from '../../api/axios';
import { useAuthStore } from '../authStore';

// The HTTP client is mocked: no request ever leaves the process.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), patch: jest.fn() },
  setSessionExpiredHandler: jest.fn(),
}));

// socket.io-client is irrelevant here; cleanup only needs disconnectSocket.
jest.mock('../../utils/socket', () => ({ disconnectSocket: jest.fn() }));

// Synthetic fixtures shaped like the backend responses
// (backend/src/controllers/auth.controller.js, otpLogin.controller.js).
const USER = { _id: 'u_test_1', name: 'Test User', email: 'test.user@example.invalid', role: 'user' };
const PANDIT = { _id: 'p_test_1', name: 'Test Pandit', email: 'test.pandit@example.invalid', role: 'pandit' };
const TOKEN = 'synthetic.jwt.token';

const initialState = { user: null, token: null, loading: false, ready: false };

beforeEach(() => {
  api.post.mockReset();
  api.get.mockReset();
  api.patch.mockReset();
  useAuthStore.setState(initialState);
});

const stored = async () => ({
  token: await SecureStore.getItemAsync('zutsav_token'),
  user: await SecureStore.getItemAsync('zutsav_user'),
});

describe('login (password)', () => {
  it('persists token + user to SecureStore and updates state on success', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: TOKEN, user: USER, rememberMe: false } });

    const result = await useAuthStore.getState().login('test.user@example.invalid', 'synthetic-password');

    expect(api.post).toHaveBeenCalledWith(
      '/auth/login',
      { emailOrPhone: 'test.user@example.invalid', password: 'synthetic-password', rememberMe: true },
    );
    expect(result.token).toBe(TOKEN);
    const s = useAuthStore.getState();
    expect(s.token).toBe(TOKEN);
    expect(s.user).toEqual(USER);
    expect(s.loading).toBe(false);
    expect(await stored()).toEqual({ token: TOKEN, user: JSON.stringify(USER) });
  });

  it('works for a pandit account (role is preserved as returned)', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: TOKEN, user: PANDIT } });
    await useAuthStore.getState().login('9876543210', 'synthetic-password');
    expect(useAuthStore.getState().user.role).toBe('pandit');
  });

  it('sets loading while the request is in flight', async () => {
    let resolve;
    api.post.mockReturnValue(new Promise((r) => { resolve = r; }));
    const pending = useAuthStore.getState().login('a@example.invalid', 'x');
    expect(useAuthStore.getState().loading).toBe(true);
    resolve({ data: { token: TOKEN, user: USER } });
    await pending;
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('does NOT create a session for a deletion-pending account, but returns the payload', async () => {
    const data = { success: true, token: TOKEN, user: USER, deletionPending: true, deletionRequestedAt: '2026-01-01T00:00:00.000Z' };
    api.post.mockResolvedValue({ data });

    const result = await useAuthStore.getState().login('a@example.invalid', 'x');

    expect(result).toEqual(data);
    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null, loading: false });
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('rethrows API errors, resets loading, and persists nothing', async () => {
    const err = Object.assign(new Error('Request failed'), { response: { status: 401, data: { message: 'Invalid credentials' } } });
    api.post.mockRejectedValue(err);

    await expect(useAuthStore.getState().login('a@example.invalid', 'bad')).rejects.toBe(err);

    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null, loading: false });
    expect(await stored()).toEqual({ token: null, user: null });
  });
});

describe('OTP login', () => {
  it('sendLoginOtp posts the identifier and returns the response body', async () => {
    api.post.mockResolvedValue({ data: { success: true, message: 'OTP sent' } });
    const data = await useAuthStore.getState().sendLoginOtp('9876543210');
    expect(api.post).toHaveBeenCalledWith('/auth/login/otp/send', { emailOrPhone: '9876543210' });
    expect(data).toEqual({ success: true, message: 'OTP sent' });
  });

  it('loginWithOtp persists the session on success', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: TOKEN, user: USER, rememberMe: false } });

    const data = await useAuthStore.getState().loginWithOtp('9876543210', '123456');

    expect(api.post).toHaveBeenCalledWith('/auth/login/otp/verify', { emailOrPhone: '9876543210', otp: '123456', rememberMe: true });
    expect(data.token).toBe(TOKEN);
    expect(useAuthStore.getState()).toMatchObject({ token: TOKEN, user: USER });
    expect(await stored()).toEqual({ token: TOKEN, user: JSON.stringify(USER) });
  });

  it('loginWithOtp does not persist a session for a deletion-pending account', async () => {
    const payload = { success: true, token: TOKEN, user: USER, deletionPending: true };
    api.post.mockResolvedValue({ data: payload });

    const data = await useAuthStore.getState().loginWithOtp('9876543210', '123456');

    expect(data).toEqual(payload);
    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null });
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('loginWithOtp propagates a wrong-OTP error without touching state', async () => {
    const err = Object.assign(new Error('Request failed'), { response: { status: 400, data: { message: 'Invalid OTP' } } });
    api.post.mockRejectedValue(err);
    await expect(useAuthStore.getState().loginWithOtp('9876543210', '000000')).rejects.toBe(err);
    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null });
    expect(await stored()).toEqual({ token: null, user: null });
  });
});

describe('hydrate', () => {
  it('restores a persisted session and marks the store ready', async () => {
    await SecureStore.setItemAsync('zutsav_token', TOKEN);
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(USER));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toMatchObject({ token: TOKEN, user: USER, ready: true });
  });

  it('is ready-but-logged-out when nothing is stored', async () => {
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, ready: true });
  });

  it('is ready-but-logged-out when the stored user JSON is corrupt', async () => {
    await SecureStore.setItemAsync('zutsav_token', TOKEN);
    await SecureStore.setItemAsync('zutsav_user', '{not json');
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, ready: true });
  });
});

describe('logout (existing public contract)', () => {
  beforeEach(async () => {
    await useAuthStore.getState().setSession(TOKEN, USER);
  });

  it('calls the server, deletes stored credentials and clears user/token', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    await useAuthStore.getState().logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout', undefined, { timeout: 5000 });
    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null });
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('still clears the local session when the server call fails (best-effort)', async () => {
    api.post.mockRejectedValue(new Error('Network Error'));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(useAuthStore.getState()).toMatchObject({ user: null, token: null });
    expect(await stored()).toEqual({ token: null, user: null });
  });
});

describe('profile helpers', () => {
  it('updateUser patches the profile and persists the returned user', async () => {
    await useAuthStore.getState().setSession(TOKEN, USER);
    const updated = { ...USER, name: 'Renamed User' };
    api.patch.mockResolvedValue({ data: { user: updated } });

    const result = await useAuthStore.getState().updateUser({ name: 'Renamed User' });

    expect(api.patch).toHaveBeenCalledWith('/users/profile', { name: 'Renamed User' });
    expect(result).toEqual(updated);
    expect(useAuthStore.getState().user).toEqual(updated);
    expect((await stored()).user).toBe(JSON.stringify(updated));
  });

  it('refreshUser stores the user returned by /auth/me', async () => {
    await useAuthStore.getState().setSession(TOKEN, USER);
    const fresh = { ...USER, name: 'Fresh Name' };
    api.get.mockResolvedValue({ data: { user: fresh } });

    await expect(useAuthStore.getState().refreshUser()).resolves.toEqual(fresh);
    expect(useAuthStore.getState().user).toEqual(fresh);
  });
});
