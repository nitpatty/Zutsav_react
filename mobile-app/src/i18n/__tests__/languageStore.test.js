import * as SecureStore from 'expo-secure-store';
import { useLanguageStore, applyAccountLanguage, LANGUAGE_STORAGE_KEY, __resetLanguageStore } from '../languageStore';

const stored = () => SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);

describe('hydrate (startup)', () => {
  it('starts in English, not ready, nothing pending', () => {
    const s = useLanguageStore.getState();
    expect(s.language).toBe('en');
    expect(s.ready).toBe(false);
    expect(s.pendingSync).toBeNull();
  });

  it('applies the stored language and only then becomes ready', async () => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, 'hi');
    const p = useLanguageStore.getState().hydrate();
    expect(useLanguageStore.getState().ready).toBe(false); // the read has not finished yet
    await p;
    expect(useLanguageStore.getState()).toMatchObject({ language: 'hi', ready: true });
  });

  it('is English when nothing is stored', async () => {
    await useLanguageStore.getState().hydrate();
    expect(useLanguageStore.getState()).toMatchObject({ language: 'en', ready: true });
  });

  it.each(['xx', 'hi-IN', 'HI-in', '', '   ', 'klingon'])('ignores a stale/unsupported stored value %p (English, still ready)', async (value) => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, value);
    await useLanguageStore.getState().hydrate();
    expect(useLanguageStore.getState()).toMatchObject({ language: 'en', ready: true });
  });

  it('normalises the case of a stored code', async () => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, 'TA');
    await useLanguageStore.getState().hydrate();
    expect(useLanguageStore.getState().language).toBe('ta');
  });

  it('falls back to English and still becomes ready when storage throws', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));
    await expect(useLanguageStore.getState().hydrate()).resolves.toBeUndefined();
    expect(useLanguageStore.getState()).toMatchObject({ language: 'en', ready: true });
  });

  it('reads storage once, however many callers await it', async () => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, 'mr');
    SecureStore.getItemAsync.mockClear();
    await Promise.all([useLanguageStore.getState().hydrate(), useLanguageStore.getState().hydrate(), useLanguageStore.getState().hydrate()]);
    expect(SecureStore.getItemAsync.mock.calls.filter(([k]) => k === LANGUAGE_STORAGE_KEY)).toHaveLength(1);
    expect(useLanguageStore.getState().language).toBe('mr');
  });

  it('does not overwrite a language the user picked while storage was being read', async () => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, 'hi');
    const p = useLanguageStore.getState().hydrate();
    await useLanguageStore.getState().setLanguage('ta');
    await p;
    expect(useLanguageStore.getState().language).toBe('ta');
  });
});

describe('setLanguage (local preference)', () => {
  it('switches immediately and persists it', async () => {
    expect(await useLanguageStore.getState().setLanguage('gu')).toBe(true);
    expect(useLanguageStore.getState().language).toBe('gu');
    expect(await stored()).toBe('gu');
  });

  it('accepts a mixed-case code and stores it lower-case', async () => {
    await useLanguageStore.getState().setLanguage('Bn');
    expect(useLanguageStore.getState().language).toBe('bn');
    expect(await stored()).toBe('bn');
  });

  it.each(['xx', 'hi-IN', '', null, undefined, 42])('rejects %p without changing anything', async (code) => {
    await useLanguageStore.getState().setLanguage('hi');
    expect(await useLanguageStore.getState().setLanguage(code)).toBe(false);
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
  });

  it('keeps the in-memory language when persisting fails', async () => {
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(useLanguageStore.getState().setLanguage('te')).resolves.toBe(true);
    expect(useLanguageStore.getState().language).toBe('te');
  });

  it('survives a restart: reset + hydrate returns to the persisted language', async () => {
    await useLanguageStore.getState().setLanguage('kn');
    __resetLanguageStore();
    expect(useLanguageStore.getState().language).toBe('en');
    await useLanguageStore.getState().hydrate();
    expect(useLanguageStore.getState().language).toBe('kn');
  });
});

describe('applyAccountLanguage (account preference from an authenticated response)', () => {
  it('account preference wins and is persisted locally', async () => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, 'ta');
    expect(await applyAccountLanguage({ preferredLanguage: 'hi' })).toBe(true);
    expect(useLanguageStore.getState().language).toBe('hi');
    expect(await stored()).toBe('hi');
  });

  it('waits for the startup read first (the account value is not overwritten by a late hydrate)', async () => {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, 'ta');
    await applyAccountLanguage({ preferredLanguage: 'mr' });
    expect(useLanguageStore.getState()).toMatchObject({ language: 'mr', ready: true });
  });

  it('keeps the device preference when the account has no value', async () => {
    await useLanguageStore.getState().setLanguage('ml');
    for (const user of [{}, { preferredLanguage: undefined }, { preferredLanguage: null }, { preferredLanguage: '' }, null, undefined]) {
      expect(await applyAccountLanguage(user)).toBe(false);
      expect(useLanguageStore.getState().language).toBe('ml');
    }
    expect(await stored()).toBe('ml');
  });

  it.each(['xx', 'hi-IN', 'klingon', 'EN-GB', 7, {}, ['hi']])('keeps the device preference for an unsupported/unusable account value %p', async (value) => {
    await useLanguageStore.getState().setLanguage('pa');
    expect(await applyAccountLanguage({ preferredLanguage: value })).toBe(false);
    expect(useLanguageStore.getState().language).toBe('pa');
    expect(await stored()).toBe('pa');
  });

  it('is a no-op when the account value is already in effect', async () => {
    await useLanguageStore.getState().setLanguage('hi');
    SecureStore.setItemAsync.mockClear();
    expect(await applyAccountLanguage({ preferredLanguage: 'hi' })).toBe(false);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("accepts the account's English too (DB value wins)", async () => {
    await useLanguageStore.getState().setLanguage('hi');
    expect(await applyAccountLanguage({ preferredLanguage: 'en' })).toBe(true);
    expect(useLanguageStore.getState().language).toBe('en');
  });

  it('a background refresh does not overwrite a local choice the server has not accepted yet; a new sign-in does', async () => {
    await useLanguageStore.getState().setLanguage('ta');
    useLanguageStore.setState({ pendingSync: 'ta' });

    expect(await applyAccountLanguage({ preferredLanguage: 'hi' })).toBe(false); // refresh
    expect(useLanguageStore.getState().language).toBe('ta');

    expect(await applyAccountLanguage({ preferredLanguage: 'hi' }, { force: true })).toBe(true); // sign-in
    expect(useLanguageStore.getState()).toMatchObject({ language: 'hi', pendingSync: null });
  });
});
