import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../authStore';
import { useCartStore } from '../cartStore';
import { apiErrorMessage } from '../../utils/apiMessage';
import { TOKENS, accountFor, installServer, settle, PUBLIC_ADMIN_MESSAGE } from './authRoleGate.helpers';

// PUBLIC build: the Admin module is the real public stand-in (no Admin available). The real auth store, real axios
// client and real session cleanup run; only the transport is replaced.
jest.mock('../../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('../../variants/adminModule', () => jest.requireActual('../../variants/adminModule.public'));

let server;

beforeEach(() => {
  server = installServer();
  useAuthStore.setState({ user: null, token: null, loading: false, ready: false });
  useCartStore.setState({ items: [] });
});

const stored = async () => ({
  token: await SecureStore.getItemAsync('zutsav_token'),
  user: await SecureStore.getItemAsync('zutsav_user'),
});
const expectNothingStored = async () => {
  expect(await stored()).toEqual({ token: null, user: null });
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
};
const expectSignedOut = () => {
  const s = useAuthStore.getState();
  expect(s.user).toBeNull();
  expect(s.token).toBeNull();
};
const seedSession = async (role) => {
  await SecureStore.setItemAsync('zutsav_token', TOKENS[role] || 'synthetic.token.other');
  await SecureStore.setItemAsync('zutsav_user', JSON.stringify(accountFor(role)));
  SecureStore.setItemAsync.mockClear();
};

describe('public build: password sign-in', () => {
  it.each(['user', 'pandit'])('accepts a %s and persists the session', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };
    await useAuthStore.getState().login(`${role}@example.invalid`, 'synthetic-password');

    const s = useAuthStore.getState();
    expect(s.user).toEqual(accountFor(role));
    expect(s.token).toBe(TOKENS[role]);
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
    await settle();
    expect(server.callsTo('/auth/logout')).toHaveLength(0);
  });

  it.each(['admin', 'system_admin'])('rejects a %s with the approved message before anything is persisted', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };

    const err = await useAuthStore.getState().login(`${role}@example.invalid`, 'synthetic-password').catch((e) => e);

    expect(err.code).toBe('ROLE_NOT_SUPPORTED');
    expect(err.message).toBe(PUBLIC_ADMIN_MESSAGE);
    expect(apiErrorMessage(err, 'Login failed')).toBe(PUBLIC_ADMIN_MESSAGE); // what every sign-in screen shows
    await expectNothingStored();
    expectSignedOut();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it.each(['admin', 'system_admin'])('asks the server to end the %s session it just created (existing POST /auth/logout)', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };
    await useAuthStore.getState().login(`${role}@example.invalid`, 'synthetic-password').catch(() => {});
    await settle();

    const logouts = server.callsTo('/auth/logout');
    expect(logouts).toHaveLength(1);
    expect(logouts[0]).toMatchObject({ method: 'post', auth: `Bearer ${TOKENS[role]}` });
  });

  it.each(['network', 'http500'])('still rejects, and persists nothing, when revocation fails (%s)', async (mode) => {
    server.logout = mode;
    server.login = { token: TOKENS.admin, user: accountFor('admin') };

    const err = await useAuthStore.getState().login('admin@example.invalid', 'synthetic-password').catch((e) => e);
    await settle();

    expect(err.message).toBe(PUBLIC_ADMIN_MESSAGE);
    expect(server.callsTo('/auth/logout')).toHaveLength(1);
    await expectNothingStored();
    expectSignedOut();
  });

  it.each([
    ['an unrecognised role', accountFor('superuser')],
    ['a differently-cased role', accountFor('Admin')],
    ['a missing role', { _id: 'x1', name: 'No Role' }],
    ['a null role', { _id: 'x2', role: null }],
  ])('rejects %s before persistence, with the generic wording', async (_label, user) => {
    server.login = { token: 'synthetic.token.other', user };

    const err = await useAuthStore.getState().login('x@example.invalid', 'synthetic-password').catch((e) => e);

    expect(err.code).toBe('ROLE_NOT_SUPPORTED');
    expect(err.message).toBe('Sorry, this account type is not supported in this app.');
    expect(err.message).not.toBe(PUBLIC_ADMIN_MESSAGE);
    await expectNothingStored();
    expectSignedOut();
  });

  it('rejects a response with no user at all', async () => {
    server.login = { token: 'synthetic.token.other' };
    const err = await useAuthStore.getState().login('x@example.invalid', 'synthetic-password').catch((e) => e);
    expect(err.code).toBe('ROLE_NOT_SUPPORTED');
    await expectNothingStored();
  });

  it('rejects an Admin whose account is in the deletion grace period before the restore card can be offered', async () => {
    server.login = { token: TOKENS.admin, user: accountFor('admin'), deletionPending: true };
    const err = await useAuthStore.getState().login('admin@example.invalid', 'synthetic-password').catch((e) => e);
    expect(err.message).toBe(PUBLIC_ADMIN_MESSAGE);
    await expectNothingStored();
  });

  it('never writes a rejected token to the console', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    server.logout = 'network';
    server.login = { token: TOKENS.admin, user: accountFor('admin') };
    await useAuthStore.getState().login('admin@example.invalid', 'synthetic-password').catch(() => {});
    await settle();
    const printed = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    spies.forEach((s) => s.mockRestore());
    expect(printed).not.toContain(TOKENS.admin);
  });

  it('a rejected Admin attempt does not disturb the cart of the device', async () => {
    useCartStore.setState({ items: [{ productId: 'p1', quantity: 1 }] });
    server.login = { token: TOKENS.admin, user: accountFor('admin') };
    await useAuthStore.getState().login('admin@example.invalid', 'synthetic-password').catch(() => {});
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

describe('public build: OTP sign-in', () => {
  it.each(['user', 'pandit'])('accepts a %s and persists the session', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };
    await useAuthStore.getState().loginWithOtp('9876543210', '123456');
    expect(useAuthStore.getState().user).toEqual(accountFor(role));
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
  });

  it.each(['admin', 'system_admin'])('rejects a %s before persistence and ends its server session', async (role) => {
    server.login = { token: TOKENS[role], user: accountFor(role) };
    const err = await useAuthStore.getState().loginWithOtp('9876543210', '123456').catch((e) => e);
    await settle();
    expect(err.message).toBe(PUBLIC_ADMIN_MESSAGE);
    await expectNothingStored();
    expectSignedOut();
    expect(server.callsTo('/auth/logout')[0]).toMatchObject({ auth: `Bearer ${TOKENS[role]}` });
  });

  it('rejects an unknown role before persistence', async () => {
    server.login = { token: 'synthetic.token.other', user: accountFor('superuser') };
    const err = await useAuthStore.getState().loginWithOtp('9876543210', '123456').catch((e) => e);
    expect(err.code).toBe('ROLE_NOT_SUPPORTED');
    await expectNothingStored();
  });
});

describe('public build: setSession (registration / account restore)', () => {
  it.each(['user', 'pandit'])('stores a %s session', async (role) => {
    await useAuthStore.getState().setSession(TOKENS[role], accountFor(role));
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
  });

  it.each(['admin', 'system_admin', 'superuser'])('refuses a %s session before storing it', async (role) => {
    await expect(useAuthStore.getState().setSession('synthetic.token.x', accountFor(role))).rejects.toMatchObject({ code: 'ROLE_NOT_SUPPORTED' });
    await expectNothingStored();
    expectSignedOut();
  });
});

describe('public build: hydrate', () => {
  it.each(['user', 'pandit'])('restores a stored %s session normally', async (role) => {
    await seedSession(role);
    await useAuthStore.getState().hydrate();
    const s = useAuthStore.getState();
    expect(s.ready).toBe(true);
    expect(s.user).toEqual(accountFor(role));
    expect(s.token).toBe(TOKENS[role]);
    expect(await stored()).toEqual({ token: TOKENS[role], user: JSON.stringify(accountFor(role)) });
    await settle();
    expect(server.calls).toHaveLength(0);
  });

  it.each(['admin', 'system_admin'])('clears a stored %s session and starts signed out', async (role) => {
    await seedSession(role);
    await AsyncStorage.setItem('zutsav_cart', JSON.stringify([{ productId: 'p1', quantity: 1 }]));

    await useAuthStore.getState().hydrate();

    const s = useAuthStore.getState();
    expect(s.ready).toBe(true);
    expectSignedOut();
    expect(await stored()).toEqual({ token: null, user: null });
    expect(await AsyncStorage.getItem('zutsav_cart')).toBeNull(); // per-account data goes with it
  });

  it.each(['admin', 'system_admin'])('asks the server to end the stored %s session, using the stored token', async (role) => {
    await seedSession(role);
    await useAuthStore.getState().hydrate();
    await settle();
    const logouts = server.callsTo('/auth/logout');
    expect(logouts).toHaveLength(1);
    expect(logouts[0].auth).toBe(`Bearer ${TOKENS[role]}`);
  });

  it('clears a stored session whose role is unknown or missing', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.token.other');
    await SecureStore.setItemAsync('zutsav_user', JSON.stringify({ _id: 'x', name: 'No Role' }));
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut();
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('still becomes ready and signed out when the server cannot be reached', async () => {
    server.logout = 'network';
    await seedSession('admin');
    await useAuthStore.getState().hydrate();
    await settle();
    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut();
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('leaves no authenticated state when SecureStore refuses to delete, and cleans up on the next start', async () => {
    await seedSession('admin');
    SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));
    SecureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut(); // no partial session in memory, whatever is left on disk
    warn.mockRestore();

    useAuthStore.setState({ user: null, token: null, ready: false });
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut();
    expect(await stored()).toEqual({ token: null, user: null });
  });

  it('becomes ready and signed out when reading the store fails', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut();
  });

  it('becomes ready and signed out when the stored user is corrupt', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.token.other');
    await SecureStore.setItemAsync('zutsav_user', '{not json');
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut();
  });

  it('signed-out start is unchanged', async () => {
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().ready).toBe(true);
    expectSignedOut();
    await settle();
    expect(server.calls).toHaveLength(0);
  });
});

describe('public build: rejectUnsupportedSession (role changed while signed in)', () => {
  it('clears the session locally and asks the server to end it', async () => {
    await seedSession('admin');
    useAuthStore.setState({ user: accountFor('admin'), token: TOKENS.admin, ready: true });

    await useAuthStore.getState().rejectUnsupportedSession();
    await settle();

    expectSignedOut();
    expect(await stored()).toEqual({ token: null, user: null });
    expect(server.callsTo('/auth/logout')[0].auth).toBe(`Bearer ${TOKENS.admin}`);
  });
});
