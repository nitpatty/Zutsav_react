import { AppState } from 'react-native';
import Toast from 'react-native-toast-message';
import { act, renderHook } from '@testing-library/react-native';
import usePaymentRecovery, { announceRecovery } from '../usePaymentRecovery';
import { recoverPendingPayments } from '../../utils/paymentRecovery';

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../utils/paymentRecovery', () => ({ recoverPendingPayments: jest.fn() }));

const CUSTOMER = { _id: 'u1', role: 'user' };
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

let handlers;
let remove;
beforeEach(() => {
  jest.clearAllMocks();
  handlers = [];
  remove = jest.fn();
  recoverPendingPayments.mockResolvedValue([]);
  AppState.addEventListener = jest.fn((type, handler) => {
    const subscription = { type, handler };
    handlers.push(subscription);
    return { remove: () => { remove(); handlers.splice(handlers.indexOf(subscription), 1); } }; // a removed listener stops receiving events
  });
});
const moveTo = async (state) => { await act(async () => { handlers.forEach((h) => h.handler(state)); }); await flush(); };

describe('when it runs', () => {
  it('cold start: runs once for a signed-in customer after the session is ready', async () => {
    renderHook(() => usePaymentRecovery({ user: CUSTOMER, ready: true }));
    await flush();
    expect(recoverPendingPayments).toHaveBeenCalledTimes(1);
    expect(recoverPendingPayments).toHaveBeenCalledWith('u1');
  });

  it('waits for the session to be restored: no authenticated request before `ready`', async () => {
    const { rerender } = renderHook((p) => usePaymentRecovery(p), { initialProps: { user: null, ready: false } });
    await flush();
    expect(recoverPendingPayments).not.toHaveBeenCalled();

    rerender({ user: CUSTOMER, ready: false }); // user known but initialisation still running
    await flush();
    expect(recoverPendingPayments).not.toHaveBeenCalled();

    rerender({ user: CUSTOMER, ready: true });
    await flush();
    expect(recoverPendingPayments).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['logged out', null],
    ['a pandit', { _id: 'p1', role: 'pandit' }],
    ['an admin', { _id: 'a1', role: 'admin' }],
    ['a user without an id', { role: 'user' }],
  ])('never runs for %s', async (_n, user) => {
    renderHook(() => usePaymentRecovery({ user, ready: true }));
    await flush();
    expect(recoverPendingPayments).not.toHaveBeenCalled();
    expect(handlers).toHaveLength(0);
  });

  it('returning from the background / PhonePe triggers a fresh check; going to the background or other states does not', async () => {
    renderHook(() => usePaymentRecovery({ user: CUSTOMER, ready: true }));
    await flush();
    recoverPendingPayments.mockClear();

    await moveTo('background');
    await moveTo('inactive');
    expect(recoverPendingPayments).not.toHaveBeenCalled();

    await moveTo('active');
    expect(recoverPendingPayments).toHaveBeenCalledTimes(1);
    expect(handlers[0].type).toBe('change');
  });

  it('a different account signing in gets its own check (never the previous user\'s id)', async () => {
    const { rerender } = renderHook((p) => usePaymentRecovery(p), { initialProps: { user: CUSTOMER, ready: true } });
    await flush();
    rerender({ user: { _id: 'u2', role: 'user' }, ready: true });
    await flush();
    expect(recoverPendingPayments.mock.calls.map((c) => c[0])).toEqual(['u1', 'u2']);
    expect(remove).toHaveBeenCalledTimes(1); // the first account's foreground subscription was released
  });

  it('logging out releases the foreground subscription', async () => {
    const { rerender } = renderHook((p) => usePaymentRecovery(p), { initialProps: { user: CUSTOMER, ready: true } });
    await flush();
    rerender({ user: null, ready: true });
    expect(remove).toHaveBeenCalledTimes(1);
    recoverPendingPayments.mockClear();
    await moveTo('active');
    expect(recoverPendingPayments).not.toHaveBeenCalled();
  });

  it('unmounting releases the subscription and ignores a late result', async () => {
    let resolveRun;
    recoverPendingPayments.mockReturnValue(new Promise((r) => { resolveRun = r; }));
    const { unmount } = renderHook(() => usePaymentRecovery({ user: CUSTOMER, ready: true }));
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    resolveRun([{ kind: 'paid', context: {} }]);
    await flush();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('a failed recovery run is swallowed (best effort) and does not break the app', async () => {
    recoverPendingPayments.mockRejectedValue(new Error('boom'));
    renderHook(() => usePaymentRecovery({ user: CUSTOMER, ready: true }));
    await expect(flush()).resolves.toBeUndefined();
  });
});

describe('what the customer is told (never navigates, never blocks)', () => {
  const run = async (results) => {
    recoverPendingPayments.mockResolvedValue(results);
    renderHook(() => usePaymentRecovery({ user: CUSTOMER, ready: true }));
    await flush();
  };

  it('a payment the SERVER confirmed → a success notice', async () => {
    await run([{ kind: 'paid', context: {} }]);
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', text1: 'Payment confirmed' }));
  });

  it('a terminal failure → a calm notice that it can be retried', async () => {
    await run([{ kind: 'failed', context: {} }]);
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'info', text1: 'A payment was not completed' }));
  });

  it('needs-review → tells the customer not to pay again', async () => {
    await run([{ kind: 'needs_review', context: {} }]);
    expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', text2: expect.stringMatching(/Do not pay again/) }));
  });

  it.each([['pending'], ['unknown'], ['not_found'], ['unauthorized'], ['skipped'], ['forbidden']])('"%s" shows nothing (the banner offers "Check status")', async (kind) => {
    await run([{ kind, context: {} }]);
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('announceRecovery says nothing for an empty run', () => {
    announceRecovery([]);
    expect(Toast.show).not.toHaveBeenCalled();
  });
});
