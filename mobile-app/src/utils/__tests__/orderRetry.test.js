import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RETRY_STORAGE_KEY, getOrCreateRetryKey, clearRetryKey, canOfferRetry, retryUnavailableNote,
  isSafePaymentUrl, mapRetryResponse, classifyRetryFailure,
} from '../orderRetry';

const SERVER_KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/; // backend/src/services/checkoutIdempotency.js

describe('retry key per order', () => {
  it('creates a valid key, persists it, and reuses it for the same order', async () => {
    const a = await getOrCreateRetryKey('order-1');
    expect(a.reused).toBe(false);
    expect(a.key).toMatch(SERVER_KEY_PATTERN);
    expect(await getOrCreateRetryKey('order-1')).toEqual({ key: a.key, reused: true });
  });

  it('keeps independent keys for different orders', async () => {
    const a = await getOrCreateRetryKey('order-1');
    const b = await getOrCreateRetryKey('order-2');
    expect(b.key).not.toBe(a.key);
    expect((await getOrCreateRetryKey('order-1')).key).toBe(a.key);
    expect((await getOrCreateRetryKey('order-2')).key).toBe(b.key);
  });

  it('clearing one order\'s key leaves the others, and the next attempt gets a NEW key', async () => {
    const a = await getOrCreateRetryKey('order-1');
    const b = await getOrCreateRetryKey('order-2');
    await clearRetryKey('order-1');
    expect((await getOrCreateRetryKey('order-2')).key).toBe(b.key);
    const again = await getOrCreateRetryKey('order-1');
    expect(again.reused).toBe(false);
    expect(again.key).not.toBe(a.key);
  });

  it('removes the storage entry entirely once no order has a pending key', async () => {
    await getOrCreateRetryKey('order-1');
    await clearRetryKey('order-1');
    expect(await AsyncStorage.getItem(RETRY_STORAGE_KEY)).toBeNull();
    await expect(clearRetryKey('never-existed')).resolves.toBeUndefined();
  });

  it('does not reuse a key older than the server retention window', async () => {
    const t0 = 1_700_000_000_000;
    const a = await getOrCreateRetryKey('order-1', { now: t0 });
    expect((await getOrCreateRetryKey('order-1', { now: t0 + 19 * 3600_000 })).key).toBe(a.key);
    const stale = await getOrCreateRetryKey('order-1', { now: t0 + 21 * 3600_000 });
    expect(stale.reused).toBe(false);
    expect(stale.key).not.toBe(a.key);
  });

  it('stores nothing but keys and timestamps (no amounts, items or addresses)', async () => {
    await getOrCreateRetryKey('order-1');
    const stored = JSON.parse(await AsyncStorage.getItem(RETRY_STORAGE_KEY));
    expect(Object.keys(stored['order-1']).sort()).toEqual(['createdAt', 'key']);
  });

  it('survives corrupt or unavailable storage without throwing', async () => {
    await AsyncStorage.setItem(RETRY_STORAGE_KEY, '{not json');
    expect((await getOrCreateRetryKey('order-1')).reused).toBe(false);
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('boom'));
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('boom'));
    await expect(getOrCreateRetryKey('order-2')).resolves.toMatchObject({ reused: false });
    AsyncStorage.getItem.mockRejectedValueOnce(new Error('boom'));
    await expect(clearRetryKey('order-1')).resolves.toBeUndefined();
  });
});

describe('canOfferRetry / retryUnavailableNote (server-backed state only)', () => {
  it('offers retry only for an order still awaiting payment', () => {
    expect(canOfferRetry({ status: 'pending_payment' })).toBe(true);
    for (const status of ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded', 'payment_failed', 'processing']) {
      expect(canOfferRetry({ status })).toBe(false);
    }
    expect(canOfferRetry(null)).toBe(false);
    expect(canOfferRetry(undefined)).toBe(false);
    expect(canOfferRetry({})).toBe(false);
  });

  it('explains orders that were closed, and says nothing for the rest', () => {
    expect(retryUnavailableNote({ status: 'payment_failed' })).toMatch(/not paid in time/);
    expect(retryUnavailableNote({ status: 'cancelled' })).toMatch(/cancelled/);
    for (const status of ['pending_payment', 'paid', 'shipped', 'delivered', undefined]) {
      expect(retryUnavailableNote({ status })).toBeNull();
    }
  });
});

describe('isSafePaymentUrl', () => {
  it('accepts only https payment pages', () => {
    expect(isSafePaymentUrl('https://pay.example.invalid/redirect/x')).toBe(true);
    expect(isSafePaymentUrl('HTTPS://pay.example.invalid/x')).toBe(true);
    for (const bad of ['http://pay.example.invalid/x', 'javascript:alert(1)', 'intent://x#Intent;end', 'file:///etc/passwd', 'zutsav://pay', '//pay.example.invalid', '', null, undefined, 42]) {
      expect(isSafePaymentUrl(bad)).toBe(false);
    }
  });
});

describe('mapRetryResponse', () => {
  const ok = { success: true, orderId: 'ord1', merchantTransactionId: 'ZUT_CART_RETRY_1700000000000_abc123_deadbeef', redirectUrl: 'https://pay.example.invalid/r' };

  it('maps a valid response, keeping the original order id and the ZUT_CART_ transaction id', () => {
    expect(mapRetryResponse(ok)).toEqual({ orderId: 'ord1', merchantTransactionId: ok.merchantTransactionId, redirectUrl: ok.redirectUrl, replayed: false });
    expect(mapRetryResponse({ ...ok, idempotentReplay: true }).replayed).toBe(true);
  });

  it('allows a missing link (the attempt is no longer payable — the server will say so on verification)', () => {
    expect(mapRetryResponse({ ...ok, redirectUrl: undefined }).redirectUrl).toBeNull();
  });

  it.each([
    undefined, null, {}, { success: false }, { ...ok, success: false }, { ...ok, orderId: undefined },
    { ...ok, merchantTransactionId: undefined }, { ...ok, merchantTransactionId: 'ZOM_123' }, { ...ok, merchantTransactionId: 'RETRY_ZUT_CART_1' },
  ])('rejects a malformed response %p (a transaction id without the ZUT_CART_ prefix cannot be verified)', (body) => {
    expect(() => mapRetryResponse(body)).toThrow('Unexpected retry response');
  });
});

describe('classifyRetryFailure', () => {
  const http = (status, code, extra = {}) => ({ response: { status, data: { code, ...extra } } });
  it.each([
    ['network error', new Error('Network Error'), { kind: 'uncertain' }],
    ['timeout', Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }), { kind: 'uncertain' }],
    ['500', http(500), { kind: 'uncertain' }],
    ['502', http(502), { kind: 'uncertain' }],
    ['409 still setting up', http(409, 'CHECKOUT_IN_PROGRESS'), { kind: 'uncertain' }],
    ['409 earlier attempt pending', http(409, 'PAYMENT_IN_PROGRESS', { merchantTransactionId: 'ZUT_CART_1_x' }), { kind: 'in_progress', merchantTransactionId: 'ZUT_CART_1_x' }],
    ['409 earlier attempt pending (no id)', http(409, 'PAYMENT_IN_PROGRESS'), { kind: 'in_progress', merchantTransactionId: null }],
    ['409 already paid', http(409, 'ORDER_ALREADY_PAID'), { kind: 'already_paid' }],
    ['409 expired', http(409, 'ORDER_EXPIRED'), { kind: 'expired' }],
    ['409 cancelled', http(409, 'ORDER_CANCELLED'), { kind: 'unavailable' }],
    ['409 not payable', http(409, 'ORDER_NOT_PAYABLE'), { kind: 'unavailable' }],
    ['404 not found', http(404, 'ORDER_NOT_FOUND'), { kind: 'unavailable' }],
    ['503 status unknown', http(503, 'PAYMENT_STATUS_UNKNOWN'), { kind: 'status_unknown' }],
    ['503 other', http(503), { kind: 'uncertain' }],
    ['400 bad key', http(400, 'IDEMPOTENCY_KEY_INVALID'), { kind: 'rejected' }],
    ['422 key reused', http(422, 'IDEMPOTENCY_KEY_REUSED'), { kind: 'rejected' }],
    ['unreadable success body (mapper error)', new Error('Unexpected retry response'), { kind: 'uncertain' }],
  ])('%s', (_label, err, expected) => expect(classifyRetryFailure(err)).toEqual(expected));
});
