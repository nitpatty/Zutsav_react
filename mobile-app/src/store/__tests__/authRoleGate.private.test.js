import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../authStore';
import { TOKENS, accountFor, installServer, settle } from './authRoleGate.helpers';

// PRIVATE build: the REAL Admin module is loaded (no mock of the seam), so this also proves the store and the Admin
// screen tree can be imported together. The existing Admin-enabled behaviour must be unchanged.
jest.mock('../../utils/socket', () => ({ disconnectSocket: jest.fn() }));

let server;

beforeEach(() => {
  server = installServer();
  useAuthStore.setState({ user: null, token: null, loading: false, ready: false });
});

const stored = async () => ({
  token: await SecureStore.getItemAsync('zutsav_token'),
  user: await SecureStore.getItemAsync('zutsav_user'),
});
const seedSession = async (role) => {
  await SecureStore.setItemAsync('zutsav_token', TOKENS[role]);
  await SecureStore.setItemAsync('zutsav_user', JSON.stringify(accountFor(role)));
};

describe('private build: sign-in', () => {
  it.each(['user', 'pandit', 'admin', 'system_admin'])('accepts and persists a %s (password)', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };
    await useAuthStore.getState().login(`${role}@example.invalid`, 'synthetic-password');

    expect(useAuthStore.getState().user).toEqual(accountFor(role));
    expect(useAuthStore.getState().token).toBe(TOKENS[role]);
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
    await settle();
    expect(server.callsTo('/auth/logout')).toHaveLength(0);
  });

  it.each(['admin', 'system_admin'])('accepts and persists a %s (OTP)', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };
    await useAuthStore.getState().loginWithOtp('9876543210', '123456');
    expect(useAuthStore.getState().user).toEqual(accountFor(role));
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
    await settle();
    expect(server.callsTo('/auth/logout')).toHaveLength(0);
  });

  it.each([['superuser'], ['Admin'], [undefined]])('still rejects an unknown role (%p) before persistence', async (role) => {
    server.login = { token: 'synthetic.token.other', user: { _id: 'x', role } };
    const err = await useAuthStore.getState().login('x@example.invalid', 'synthetic-password').catch((e) => e);
    expect(err.code).toBe('ROLE_NOT_SUPPORTED');
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('accepts an Admin session through setSession', async () => {
    await useAuthStore.getState().setSession(TOKENS.admin, accountFor('admin'));
    expect(await stored()).toEqual({ token: TOKENS.admin, user: JSON.stringify(accountFor('admin')) });
  });
});

describe('private build: hydrate', () => {
  it.each(['user', 'pandit', 'admin', 'system_admin'])('restores a stored %s session', async (role) => {
    await seedSession(role);
    await useAuthStore.getState().hydrate();
    const s = useAuthStore.getState();
    expect(s.ready).toBe(true);
    expect(s.user).toEqual(accountFor(role));
    expect(s.token).toBe(TOKENS[role]);
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
    await settle();
    expect(server.calls).toHaveLength(0); // nothing is revoked or cleared
  });

  it('still clears a stored session with an unknown role', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.token.other');
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify(accountFor('superuser')));
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().ready).toBe(true);
    expect(useAuthStore.getState().user).toBeNull();
    expect(await stored()).toEqual({ token: null, user: null });
  });
});
