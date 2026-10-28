import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import api from '../../api/axios';
import {
  PENDING_PAYMENT_KEY, MAX_PENDING, PENDING_TTL_MS, MIN_RECOVERY_INTERVAL_MS,
  normalizeContext, savePendingPayment, loadPendingPayments, removePendingPayment, clearPendingPayments,
  classifyVerifyResponse, verifyTransaction, markVerificationActive, isVerificationActive,
  recoverPendingPayments, openPaymentPage, resumeBookingPayment, subscribePendingPayments,
  bookingTypeForTxn, isValidTransactionId, resetPaymentRecoveryState,
} from '../paymentRecovery';

jest.mock('../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

const USER_A = 'userA000000000000000001';
const USER_B = 'userB000000000000000002';
const T0 = 1_700_000_000_000;
const BOOKING = { type: 'booking', merchantTransactionId: 'ZUT_1700000000000_abc123', bookingId: 'bk1' };
const REMAINING = { type: 'booking-remaining', merchantTransactionId: 'ZUT_REM_1700000000001_abc123', bookingId: 'bk1' };
const CART = { type: 'marketplace', merchantTransactionId: 'ZUT_CART_1700000000002_abc123', orderId: 'ord1' };
const RETRY = { type: 'marketplace', merchantTransactionId: 'ZUT_CART_RETRY_1700000000003_abc123_deadbeef', orderId: 'ord1' };
const LEGACY = { type: 'marketplace', merchantTransactionId: 'ZOM_1700000000004_abc123', orderId: 'ord2' };
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const rawStore = async () => JSON.parse(await AsyncStorage.getItem(PENDING_PAYMENT_KEY));

// Only the spies a test creates are restored: jest.restoreAllMocks() would also wipe the AsyncStorage mock's implementation.
const spies = [];
const spy = (obj, method) => { const s = jest.spyOn(obj, method); spies.push(s); return s; };
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  api.get.mockReset();
  resetPaymentRecoveryState();
});
afterEach(() => { spies.splice(0).forEach((s) => s.mockRestore()); });

describe('context validation and what is stored', () => {
  it('keeps only the known, validated fields — no amount, address, token, URL or query string', async () => {
    const ok = await savePendingPayment(USER_A, {
      ...BOOKING, amount: 1999, address: '12 MG Road', authToken: 'secret-token', redirectUrl: 'https://pay.example.invalid/x?token=SECRETQUERY',
      phone: '9999999999', booking: { grandTotal: 5 },
    }, { now: T0 });
    expect(ok).toBe(true);
    const raw = await AsyncStorage.getItem(PENDING_PAYMENT_KEY);
    expect(JSON.parse(raw)).toEqual({
      v: 1,
      items: [{ userId: USER_A, type: 'booking', merchantTransactionId: BOOKING.merchantTransactionId, bookingId: 'bk1', createdAt: T0, updatedAt: T0 }],
    });
    for (const secret of ['1999', 'MG Road', 'secret-token', 'SECRETQUERY', '9999999999', 'grandTotal', 'redirect']) expect(raw).not.toContain(secret);
  });

  it.each([
    ['unknown type', { ...BOOKING, type: 'refund' }],
    ['missing transaction', { type: 'booking', bookingId: 'bk1' }],
    ['malformed transaction (path characters)', { ...BOOKING, merchantTransactionId: '../../etc/passwd' }],
    ['transaction too short', { ...BOOKING, merchantTransactionId: 'ZUT_1' }],
    ['transaction with spaces', { ...BOOKING, merchantTransactionId: 'ZUT 1700000000000 abc' }],
    ['booking without a booking id', { type: 'booking', merchantTransactionId: BOOKING.merchantTransactionId }],
    ['marketplace without an order id', { type: 'marketplace', merchantTransactionId: CART.merchantTransactionId }],
    ['an id with injection characters', { ...BOOKING, bookingId: 'bk1/../x' }],
  ])('refuses %s', async (_n, bad) => {
    expect(normalizeContext({ ...bad, userId: USER_A })).toBeNull();
    expect(await savePendingPayment(USER_A, bad)).toBe(false);
    expect(await AsyncStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });

  it('refuses a missing or malformed user id', async () => {
    expect(await savePendingPayment(undefined, BOOKING)).toBe(false);
    expect(await savePendingPayment('bad id!', BOOKING)).toBe(false);
    expect(await savePendingPayment(null, BOOKING)).toBe(false);
  });

  it.each([BOOKING, REMAINING, CART, RETRY, LEGACY])('accepts the real transaction families (%#)', async (ctx) => {
    expect(await savePendingPayment(USER_A, ctx, { now: T0 })).toBe(true);
    expect((await loadPendingPayments(USER_A, { now: T0 }))[0]).toMatchObject({ merchantTransactionId: ctx.merchantTransactionId, type: ctx.type });
  });

  it('transaction id helper and booking-family rule', () => {
    expect(isValidTransactionId(BOOKING.merchantTransactionId)).toBe(true);
    expect(isValidTransactionId('x')).toBe(false);
    expect(isValidTransactionId(undefined)).toBe(false);
    expect(bookingTypeForTxn('ZUT_REM_1_abcdefgh')).toBe('booking-remaining');
    expect(bookingTypeForTxn('ZUT_RETRY_1_abcdefgh')).toBe('booking');
    expect(bookingTypeForTxn('ZUT_1_abcdefgh')).toBe('booking');
  });
});

describe('persistence and account isolation', () => {
  it('survives a process restart (in-memory state gone, storage kept)', async () => {
    await savePendingPayment(USER_A, CART, { now: T0 });
    resetPaymentRecoveryState(); // simulates a fresh process: only AsyncStorage remains
    expect(await loadPendingPayments(USER_A, { now: T0 + 1000 })).toEqual([
      expect.objectContaining({ merchantTransactionId: CART.merchantTransactionId, orderId: 'ord1', userId: USER_A }),
    ]);
  });

  it('one user cannot see (or inherit) another user\'s pending payment, and the foreign record is dropped', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    expect(await loadPendingPayments(USER_B, { now: T0 })).toEqual([]);
    expect(await AsyncStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();            // removed, not left lying around
    expect(await loadPendingPayments(USER_A, { now: T0 })).toEqual([]);            // ...so A does not get it back either
  });

  it('saving as a new user discards the previous account\'s leftovers', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    await savePendingPayment(USER_B, CART, { now: T0 + 1 });
    const items = (await rawStore()).items;
    expect(items.map((i) => i.userId)).toEqual([USER_B]);
  });

  it('is cleared for everyone on logout cleanup', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    await clearPendingPayments();
    expect(await loadPendingPayments(USER_A, { now: T0 })).toEqual([]);
  });

  it('several pending payments for the SAME user are kept side by side, newest first, one per transaction', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    await savePendingPayment(USER_A, CART, { now: T0 + 10 });
    await savePendingPayment(USER_A, BOOKING, { now: T0 + 20 }); // same txn again: updated, not duplicated
    const items = await loadPendingPayments(USER_A, { now: T0 + 30 });
    expect(items.map((i) => i.merchantTransactionId)).toEqual([BOOKING.merchantTransactionId, CART.merchantTransactionId]);
    expect(items[0].createdAt).toBe(T0);          // creation time preserved
    expect(items[0].updatedAt).toBe(T0 + 20);
  });

  it(`is bounded: only the ${MAX_PENDING} newest are kept`, async () => {
    for (let i = 0; i < MAX_PENDING + 2; i += 1) {
      await savePendingPayment(USER_A, { type: 'booking', bookingId: `bk${i}`, merchantTransactionId: `ZUT_17000000000${i}_abc123` }, { now: T0 + i });
    }
    const items = await loadPendingPayments(USER_A, { now: T0 + 100 });
    expect(items).toHaveLength(MAX_PENDING);
    expect(items[0].bookingId).toBe(`bk${MAX_PENDING + 1}`);
    expect(items.some((i) => i.bookingId === 'bk0')).toBe(false);
  });

  it('a record older than the retention window is only a stale pointer and is dropped', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    expect(await loadPendingPayments(USER_A, { now: T0 + PENDING_TTL_MS - 1 })).toHaveLength(1);
    expect(await loadPendingPayments(USER_A, { now: T0 + PENDING_TTL_MS + 1 })).toEqual([]);
  });

  it('removes one transaction without touching the others', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    await savePendingPayment(USER_A, CART, { now: T0 + 1 });
    await removePendingPayment(USER_A, BOOKING.merchantTransactionId);
    expect((await loadPendingPayments(USER_A, { now: T0 + 2 })).map((i) => i.merchantTransactionId)).toEqual([CART.merchantTransactionId]);
  });
});

describe('malformed or failing storage never crashes and never decides a payment', () => {
  it.each([
    ['not JSON', '{oops'],
    ['wrong version', JSON.stringify({ v: 99, items: [] })],
    ['wrong shape', JSON.stringify({ v: 1, items: 'nope' })],
    ['a bare array', JSON.stringify([])],
    ['null', 'null'],
  ])('%s is ignored and removed', async (_n, raw) => {
    await AsyncStorage.setItem(PENDING_PAYMENT_KEY, raw);
    expect(await loadPendingPayments(USER_A, { now: T0 })).toEqual([]);
    expect(await AsyncStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });

  it('invalid entries inside a valid store are filtered out; valid ones survive', async () => {
    const good = { userId: USER_A, type: 'booking', merchantTransactionId: BOOKING.merchantTransactionId, bookingId: 'bk1', createdAt: T0, updatedAt: T0 };
    await AsyncStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ v: 1, items: [good, { userId: USER_A, type: 'hack', merchantTransactionId: 'x' }, null, 'junk', 7] }));
    expect(await loadPendingPayments(USER_A, { now: T0 })).toEqual([good]);
  });

  it('a failing write reports false (never throws, never "saved")', async () => {
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full')); // the mock's own jest.fn: spyOn+mockRestore would wipe it
    await expect(savePendingPayment(USER_A, BOOKING, { now: T0 })).resolves.toBe(false);
  });

  it('a failing read behaves as "nothing pending"', async () => {
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('unavailable'));
    await expect(loadPendingPayments(USER_A, { now: T0 })).resolves.toEqual([]);
  });

  it('a failing removal reports false', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: T0 });
    AsyncStorage.removeItem.mockRejectedValueOnce(new Error('x')); // the last item is removed through removeItem
    await expect(removePendingPayment(USER_A, BOOKING.merchantTransactionId)).resolves.toBe(false);
  });
});

describe('classifyVerifyResponse — only the server\'s verdict counts', () => {
  it.each([
    [{ success: true, booking: {} }, 'paid'],
    [{ success: true, alreadyVerified: true }, 'paid'],
    [{ alreadyVerified: true }, 'paid'],
    [{ success: false, code: 'PAYMENT_NEEDS_REVIEW', state: 'COMPLETED' }, 'needs_review'],
    [{ success: false, code: 'PAYMENT_ERROR', state: 'FAILED' }, 'failed'],
    [{ success: false, state: 'DECLINED' }, 'failed'],
    [{ success: false, state: 'PENDING' }, 'pending'],
    [{ success: false }, 'pending'],
    [{}, 'pending'],
    [undefined, 'pending'],
    [null, 'pending'],
    ['<html>gateway</html>', 'pending'],
    [{ success: 'true' }, 'pending'],          // a string is not the server's boolean
    [{ status: 'SUCCESS', code: 'PAYMENT_SUCCESS' }, 'pending'], // client-style success words are not proof
  ])('%j → %s', (data, kind) => {
    expect(classifyVerifyResponse(data).kind).toBe(kind);
  });
});

describe('verifyTransaction — the existing server routes, one request at a time', () => {
  it.each([
    [{ type: 'booking', merchantTransactionId: BOOKING.merchantTransactionId }, `/bookings/verify-phonepe/${BOOKING.merchantTransactionId}`],
    [{ type: 'booking-remaining', merchantTransactionId: REMAINING.merchantTransactionId }, `/bookings/verify-remaining/${REMAINING.merchantTransactionId}`],
    [{ type: 'marketplace', merchantTransactionId: CART.merchantTransactionId }, `/checkout/verify/${CART.merchantTransactionId}`],
    [{ type: 'marketplace', merchantTransactionId: RETRY.merchantTransactionId }, `/checkout/verify/${RETRY.merchantTransactionId}`],
    [{ type: 'marketplace', merchantTransactionId: LEGACY.merchantTransactionId }, `/marketplace/orders/verify-phonepe/${LEGACY.merchantTransactionId}`],
  ])('%j uses %s', async (ctx, endpoint) => {
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    const outcome = await verifyTransaction(ctx);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(endpoint);
    expect(outcome.kind).toBe('pending');
  });

  it('concurrent callers (launch check + foreground check + an open screen) share ONE request', async () => {
    let release;
    api.get.mockImplementation(() => new Promise((r) => { release = () => r({ data: { success: true } }); }));
    const calls = [verifyTransaction(BOOKING), verifyTransaction(BOOKING), verifyTransaction(BOOKING)];
    release();
    const results = await Promise.all(calls);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.kind)).toEqual(['paid', 'paid', 'paid']);
    // ...and a later call is a new request (nothing is cached)
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    expect((await verifyTransaction(BOOKING)).kind).toBe('pending');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [500, 'unknown'], [503, 'unknown'], [undefined, 'unknown'],
  ])('an HTTP %s answer is "%s" — never paid and never a terminal failure', async (status, kind) => {
    api.get.mockRejectedValue(status ? httpError(status) : Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    expect((await verifyTransaction(BOOKING)).kind).toBe(kind);
  });
});

describe('recoverPendingPayments — cold start and foreground', () => {
  const seed = async (...contexts) => { for (let i = 0; i < contexts.length; i += 1) await savePendingPayment(USER_A, contexts[i], { now: Date.now() + i }); };

  it('cold start: a payment that was completed while the app was gone is confirmed by the server and the record is closed', async () => {
    await seed(CART);
    api.get.mockResolvedValue({ data: { success: true, order: { _id: 'ord1' } } });
    const events = [];
    subscribePendingPayments((e) => events.push(e.type));

    const results = await recoverPendingPayments(USER_A, { force: true });
    expect(api.get).toHaveBeenCalledWith(`/checkout/verify/${CART.merchantTransactionId}`);
    expect(results).toEqual([{ context: expect.objectContaining({ merchantTransactionId: CART.merchantTransactionId }), kind: 'paid' }]);
    expect(await loadPendingPayments(USER_A)).toEqual([]);
    expect(events).toContain('resolved');
  });

  it('a terminal gateway failure closes the record (the order/booking stays retryable on the server)', async () => {
    await seed(BOOKING);
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_ERROR', state: 'FAILED' } });
    expect((await recoverPendingPayments(USER_A, { force: true }))[0].kind).toBe('failed');
    expect(await loadPendingPayments(USER_A)).toEqual([]);
  });

  it('PAYMENT_NEEDS_REVIEW closes the record too, and is reported distinctly', async () => {
    await seed(CART);
    api.get.mockResolvedValue({ data: { success: false, code: 'PAYMENT_NEEDS_REVIEW', state: 'COMPLETED' } });
    expect((await recoverPendingPayments(USER_A, { force: true }))[0].kind).toBe('needs_review');
    expect(await loadPendingPayments(USER_A)).toEqual([]);
  });

  it.each([
    ['still PENDING', () => api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } }), 'pending'],
    ['an unknown record (404)', () => api.get.mockRejectedValue(httpError(404)), 'not_found'],
    ['a network error', () => api.get.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })), 'unknown'],
    ['a server error (503)', () => api.get.mockRejectedValue(httpError(503)), 'unknown'],
  ])('%s keeps the record, so it can be recovered later', async (_n, arrange, kind) => {
    await seed(BOOKING);
    arrange();
    expect((await recoverPendingPayments(USER_A, { force: true }))[0].kind).toBe(kind);
    expect(await loadPendingPayments(USER_A)).toHaveLength(1);
  });

  it('a 401 stops the run and keeps the record (the shared client\'s session handling decides what happens next)', async () => {
    await seed(BOOKING, CART);
    api.get.mockRejectedValue(httpError(401));
    const results = await recoverPendingPayments(USER_A, { force: true });
    expect(results).toHaveLength(1);                 // the second transaction was not attempted
    expect(results[0].kind).toBe('unauthorized');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(await loadPendingPayments(USER_A)).toHaveLength(2);
  });

  it('a 403 means the transaction is not this account\'s: the record is dropped', async () => {
    await seed(BOOKING);
    api.get.mockRejectedValue(httpError(403));
    await recoverPendingPayments(USER_A, { force: true });
    expect(await loadPendingPayments(USER_A)).toEqual([]);
  });

  it('never verifies another account\'s record, and never without a signed-in user', async () => {
    await savePendingPayment(USER_A, BOOKING, { now: Date.now() });
    expect(await recoverPendingPayments(USER_B, { force: true })).toEqual([]);
    expect(await recoverPendingPayments(undefined, { force: true })).toEqual([]);
    expect(api.get).not.toHaveBeenCalled();
  });

  it('leaves a transaction alone while a PaymentVerify screen is verifying it (no duplicate request)', async () => {
    await seed(BOOKING, CART);
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    const release = markVerificationActive(CART.merchantTransactionId);
    expect(isVerificationActive(CART.merchantTransactionId)).toBe(true);

    const results = await recoverPendingPayments(USER_A, { force: true });
    expect(results.find((r) => r.context.merchantTransactionId === CART.merchantTransactionId).kind).toBe('skipped');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(`/bookings/verify-phonepe/${BOOKING.merchantTransactionId}`);
    release();
    expect(isVerificationActive(CART.merchantTransactionId)).toBe(false);
  });

  it('duplicate foreground events create no concurrent requests: overlapping calls share one run', async () => {
    await seed(BOOKING);
    let release;
    api.get.mockImplementation(() => new Promise((r) => { release = () => r({ data: { success: false, state: 'PENDING' } }); }));
    const a = recoverPendingPayments(USER_A, { force: true });
    const b = recoverPendingPayments(USER_A, { force: true });
    const c = recoverPendingPayments(USER_A);
    await settle();
    release();
    await Promise.all([a, b, c]);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('bursts of launch/foreground events inside the minimum interval are collapsed (no polling loop)', async () => {
    await seed(BOOKING);
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    const now = Date.now();
    await recoverPendingPayments(USER_A, { now });
    expect(await recoverPendingPayments(USER_A, { now: now + MIN_RECOVERY_INTERVAL_MS - 1 })).toEqual([]);
    expect(api.get).toHaveBeenCalledTimes(1);
    await recoverPendingPayments(USER_A, { now: now + MIN_RECOVERY_INTERVAL_MS + 1 });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('checks at most three transactions per run, one request each', async () => {
    for (let i = 0; i < 5; i += 1) {
      await savePendingPayment(USER_A, { type: 'booking', bookingId: `bk${i}`, merchantTransactionId: `ZUT_17000000000${i}_abc123` }, { now: Date.now() + i });
    }
    api.get.mockResolvedValue({ data: { success: false, state: 'PENDING' } });
    await recoverPendingPayments(USER_A, { force: true });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('nothing pending → no request at all', async () => {
    expect(await recoverPendingPayments(USER_A, { force: true })).toEqual([]);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('openPaymentPage — validate, persist, THEN hand off', () => {
  const URL = 'https://pay.example.invalid/transact/pay?token=abc';

  it('writes the recovery record before the payment page is opened', async () => {
    const setItem = AsyncStorage.setItem;
    setItem.mockClear();
    const open = spy(Linking, 'openURL').mockResolvedValue(true);
    const result = await openPaymentPage({ userId: USER_A, context: CART, redirectUrl: URL });
    expect(result).toEqual({ opened: true, saved: true });
    expect(open).toHaveBeenCalledWith(URL);
    expect(setItem.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
    expect(await loadPendingPayments(USER_A)).toHaveLength(1);
  });

  it('an invalid payment URL opens nothing and persists nothing', async () => {
    const open = spy(Linking, 'openURL').mockResolvedValue(true);
    for (const bad of ['http://pay.example.invalid/x', 'javascript:alert(1)', 'zutsav://x', '', null, 'https://127.0.0.1/x']) {
      expect(await openPaymentPage({ userId: USER_A, context: CART, redirectUrl: bad })).toEqual({ opened: false, reason: 'invalid_url' });
    }
    expect(open).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });

  it('a storage failure does not block a legitimate payment and is reported honestly (saved:false)', async () => {
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const open = spy(Linking, 'openURL').mockResolvedValue(true);
    expect(await openPaymentPage({ userId: USER_A, context: CART, redirectUrl: URL })).toEqual({ opened: true, saved: false });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('if the device cannot open the link, the record stays (a payment may exist) and the reason is reported', async () => {
    spy(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    expect(await openPaymentPage({ userId: USER_A, context: CART, redirectUrl: URL })).toEqual({ opened: false, reason: 'open_failed', saved: true });
    expect(await loadPendingPayments(USER_A)).toHaveLength(1);
  });

  it('an invalid context is not stored but the (valid) payment page is still opened', async () => {
    const open = spy(Linking, 'openURL').mockResolvedValue(true);
    expect(await openPaymentPage({ userId: USER_A, context: { type: 'booking', merchantTransactionId: 'bad' }, redirectUrl: URL })).toEqual({ opened: true, saved: false });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('never logs the payment URL', async () => {
    const log = spy(console, 'log').mockImplementation(() => {});
    const warn = spy(console, 'warn').mockImplementation(() => {});
    spy(Linking, 'openURL').mockResolvedValue(true);
    await openPaymentPage({ userId: USER_A, context: CART, redirectUrl: URL });
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toContain('token=abc');
  });
});

describe('resumeBookingPayment — "already in flight" resumes the existing transaction', () => {
  const nav = () => ({ navigate: jest.fn(), replace: jest.fn() });

  it('opens PaymentVerify for the transaction the SERVER returned and records it for recovery', async () => {
    const navigation = nav();
    expect(await resumeBookingPayment({ navigation, userId: USER_A, bookingId: 'bk1', merchantTransactionId: BOOKING.merchantTransactionId })).toBe(true);
    expect(navigation.navigate).toHaveBeenCalledWith('PaymentVerify', { merchantTransactionId: BOOKING.merchantTransactionId, bookingId: 'bk1', type: 'booking' });
    expect(await loadPendingPayments(USER_A)).toEqual([expect.objectContaining({ merchantTransactionId: BOOKING.merchantTransactionId, type: 'booking' })]);
  });

  it('a remaining-balance transaction resumes on the remaining-balance verification', async () => {
    const navigation = nav();
    await resumeBookingPayment({ navigation, userId: USER_A, bookingId: 'bk1', merchantTransactionId: REMAINING.merchantTransactionId, replace: true });
    expect(navigation.replace).toHaveBeenCalledWith('PaymentVerify', expect.objectContaining({ type: 'booking-remaining' }));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'x', '../x', 12345])('without a usable transaction id (%p) it fabricates nothing: no navigation, nothing stored', async (txn) => {
    const navigation = nav();
    expect(await resumeBookingPayment({ navigation, userId: USER_A, bookingId: 'bk1', merchantTransactionId: txn })).toBe(false);
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(PENDING_PAYMENT_KEY)).toBeNull();
  });
});
