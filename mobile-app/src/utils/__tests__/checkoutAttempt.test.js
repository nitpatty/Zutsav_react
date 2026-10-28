import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ATTEMPT_STORAGE_KEY, newIdempotencyKey, cartFingerprint, getOrCreateAttempt, clearAttempt, classifyFailure,
} from '../checkoutAttempt';

// The server accepts 16–128 characters from [A-Za-z0-9_.:-] (backend/src/services/checkoutIdempotency.js).
const SERVER_KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;

const ITEMS = [
  { productId: 'p1', variantId: 'v1', quantity: 2, price: 100, name: 'Ghee' },
  { productId: 'p2', variantId: null, quantity: 1, price: 250, name: 'Incense' },
];
const SHIP = { name: 'Asha Test', phone: '9111111111', address: '12 Test Lane', pincode: '560001', state: 'Karnataka', city: 'Bengaluru', district: 'X' };

describe('newIdempotencyKey', () => {
  it('always satisfies the server\'s key rules', () => {
    for (let i = 0; i < 200; i += 1) expect(newIdempotencyKey()).toMatch(SERVER_KEY_PATTERN);
    expect(newIdempotencyKey(0, () => 0)).toMatch(SERVER_KEY_PATTERN); // worst case: all-zero randomness still ≥ 16 chars
  });

  it('is unique per attempt', () => {
    const keys = new Set(Array.from({ length: 2000 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(2000);
  });
});

describe('cartFingerprint', () => {
  it('ignores item order and presentation fields, but changes with quantity, variant, product or address', () => {
    const base = cartFingerprint(ITEMS, SHIP);
    expect(cartFingerprint([...ITEMS].reverse(), SHIP)).toBe(base);
    expect(cartFingerprint(ITEMS.map((i) => ({ ...i, price: 1, name: 'renamed' })), SHIP)).toBe(base);
    expect(cartFingerprint([{ ...ITEMS[0], quantity: 3 }, ITEMS[1]], SHIP)).not.toBe(base);
    expect(cartFingerprint([{ ...ITEMS[0], variantId: 'v2' }, ITEMS[1]], SHIP)).not.toBe(base);
    expect(cartFingerprint([ITEMS[0]], SHIP)).not.toBe(base);
    expect(cartFingerprint(ITEMS, { ...SHIP, pincode: '110001' })).not.toBe(base);
  });
});

describe('getOrCreateAttempt', () => {
  it('creates and persists a key for a new attempt, then reuses it for the same cart', async () => {
    const first = await getOrCreateAttempt(ITEMS, SHIP);
    expect(first.reused).toBe(false);
    expect(first.key).toMatch(SERVER_KEY_PATTERN);

    const again = await getOrCreateAttempt(ITEMS, SHIP);
    expect(again).toEqual({ key: first.key, reused: true });
  });

  // The persisted record is { key, fingerprint, createdAt }. Only `key` is random; with a fixed `now` the other two are
  // deterministic for this fixture. The sensitive-value scan therefore runs over the record WITHOUT the random key (a
  // random base36 key can contain 'p1' / 'v1' by chance — that made the old raw-string assertion fail ~1.75 % of runs),
  // and the key is validated separately against the documented server format.
  const FIXED_NOW = 1_700_000_000_000;
  const SENSITIVE = ['12 Test Lane', '9111111111', '560001', 'Asha Test', 'Bengaluru', 'Karnataka', 'Ghee', 'Incense', 'p1', 'p2', 'v1'];
  const readRecord = async () => JSON.parse(await AsyncStorage.getItem(ATTEMPT_STORAGE_KEY));

  it('persists exactly { key, fingerprint, createdAt }, with a well-formed key', async () => {
    const { key } = await getOrCreateAttempt(ITEMS, SHIP, { now: FIXED_NOW });
    const record = await readRecord();
    expect(Object.keys(record).sort()).toEqual(['createdAt', 'fingerprint', 'key']);
    expect(record.key).toBe(key);
    expect(record.key).toMatch(SERVER_KEY_PATTERN);
    expect(record.createdAt).toBe(FIXED_NOW);
    expect(record.fingerprint).toBe(cartFingerprint(ITEMS, SHIP));
    expect(record.fingerprint).toMatch(/^[0-9a-z]+$/);
  });

  it('does not persist the cart or address in clear text (scan excludes the random key)', async () => {
    await getOrCreateAttempt(ITEMS, SHIP, { now: FIXED_NOW });
    const { key, ...deterministic } = await readRecord();
    expect(key).toMatch(SERVER_KEY_PATTERN);
    const serialized = JSON.stringify(deterministic);
    SENSITIVE.forEach((s) => expect(serialized).not.toContain(s));
    // no structured cart/address leaked either: every persisted value is a primitive
    Object.values(deterministic).forEach((v) => expect(['string', 'number']).toContain(typeof v));
  });

  it('is not fooled by a random key that happens to contain a product id (the former ~1.75 % false failure)', async () => {
    // Force the random key to contain "p1" and "v1" (base36 chunks 0000p1v1 ×3) — deterministic reproduction.
    const forced = (parseInt('0000p1v1', 36) + 0.5) / 36 ** 8;
    const spy = jest.spyOn(Math, 'random').mockReturnValue(forced);
    try {
      const { key } = await getOrCreateAttempt(ITEMS, SHIP, { now: FIXED_NOW });
      expect(key).toContain('p1');                       // the scenario really occurs…
      expect(key).toContain('v1');
      expect(key).toMatch(SERVER_KEY_PATTERN);
      expect(await AsyncStorage.getItem(ATTEMPT_STORAGE_KEY)).toContain('p1'); // …and a raw-string scan would have failed
      const { key: _random, ...deterministic } = await readRecord();
      SENSITIVE.forEach((s) => expect(JSON.stringify(deterministic)).not.toContain(s)); // …but the real contract still holds
    } finally {
      spy.mockRestore();
    }
  });

  it('uses a new key when the cart or delivery details change', async () => {
    const a = await getOrCreateAttempt(ITEMS, SHIP);
    const b = await getOrCreateAttempt([{ ...ITEMS[0], quantity: 9 }, ITEMS[1]], SHIP);
    expect(b.reused).toBe(false);
    expect(b.key).not.toBe(a.key);
    const c = await getOrCreateAttempt([{ ...ITEMS[0], quantity: 9 }, ITEMS[1]], { ...SHIP, city: 'Pune' });
    expect(c.key).not.toBe(b.key);
  });

  it('does not reuse a stale attempt (older than the server retention window)', async () => {
    const t0 = 1_700_000_000_000;
    const a = await getOrCreateAttempt(ITEMS, SHIP, { now: t0 });
    expect((await getOrCreateAttempt(ITEMS, SHIP, { now: t0 + 19 * 3600 * 1000 })).key).toBe(a.key);
    const stale = await getOrCreateAttempt(ITEMS, SHIP, { now: t0 + 21 * 3600 * 1000 });
    expect(stale.reused).toBe(false);
    expect(stale.key).not.toBe(a.key);
  });

  it('clearAttempt starts the next attempt fresh', async () => {
    const a = await getOrCreateAttempt(ITEMS, SHIP);
    await clearAttempt();
    expect(await AsyncStorage.getItem(ATTEMPT_STORAGE_KEY)).toBeNull();
    expect((await getOrCreateAttempt(ITEMS, SHIP)).key).not.toBe(a.key);
  });

  it('ignores a corrupt stored value and never throws on storage failures', async () => {
    await AsyncStorage.setItem(ATTEMPT_STORAGE_KEY, '{not json');
    expect((await getOrCreateAttempt(ITEMS, SHIP)).reused).toBe(false);

    AsyncStorage.getItem.mockRejectedValueOnce(new Error('boom'));
    AsyncStorage.setItem.mockRejectedValueOnce(new Error('boom'));
    await expect(getOrCreateAttempt(ITEMS, SHIP)).resolves.toMatchObject({ reused: false });

    AsyncStorage.removeItem.mockRejectedValueOnce(new Error('boom'));
    await expect(clearAttempt()).resolves.toBeUndefined();
  });
});

describe('classifyFailure', () => {
  it.each([
    ['no response (network error)', new Error('Network Error'), 'uncertain'],
    ['timeout', Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }), 'uncertain'],
    ['500', { response: { status: 500, data: {} } }, 'uncertain'],
    ['502', { response: { status: 502, data: {} } }, 'uncertain'],
    ['409 still processing', { response: { status: 409, data: { code: 'CHECKOUT_IN_PROGRESS' } } }, 'in_progress'],
    ['409 state unknown', { response: { status: 409, data: { code: 'CHECKOUT_STATE_UNKNOWN' } } }, 'definitive'],
    ['400 validation', { response: { status: 400, data: { message: 'x' } } }, 'definitive'],
    ['401', { response: { status: 401, data: {} } }, 'definitive'],
    ['422 key reused', { response: { status: 422, data: { code: 'IDEMPOTENCY_KEY_REUSED' } } }, 'definitive'],
    ['unreadable success body (mapper error)', new Error('Unexpected checkout response'), 'uncertain'],
  ])('%s → %s', (_label, err, expected) => expect(classifyFailure(err)).toBe(expected));
});
