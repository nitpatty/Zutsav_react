import fs from 'fs';
import path from 'path';
import {
  DICTIONARIES, SUPPORTED_LOCALES, SUPPORTED_LOCALE_CODES, AVAILABLE_LOCALES, TRANSLATED_NAMESPACES,
  isSupportedLocale, isAvailableLocale, toAvailableLocale, DEFAULT_LOCALE,
} from '../locales';
import { resolve } from '../translate';

// The codes the website and the backend understand (backend/src/config/languages.config.js). Pinned here on purpose:
// a change on either side must be a conscious change to this list.
const BACKEND_CODES = ['en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa', 'or'];

const flat = (obj, prefix = '') => Object.entries(obj || {}).flatMap(([k, v]) => (
  v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
));
const firstBatch = (dict) => Object.fromEntries(TRANSLATED_NAMESPACES.flatMap((ns) => flat({ [ns]: dict[ns] })));
const tokens = (s) => (String(s).match(/\{\{\s*\w+\s*\}\}/g) || []).map((x) => x.replace(/\s+/g, '')).sort();

const en = firstBatch(DICTIONARIES.en);
const enKeys = Object.keys(en);

// Strings that are legitimately the same in English and in a translation (none today; add with a reason).
const IDENTICAL_TO_ENGLISH_ALLOWED = new Set([]);

describe('locale catalogue', () => {
  it('supports exactly the website/backend codes, in order, with native names', () => {
    expect(SUPPORTED_LOCALE_CODES).toEqual(BACKEND_CODES);
    SUPPORTED_LOCALES.forEach((l) => { expect(l.name).toBeTruthy(); expect(l.native).toBeTruthy(); });
  });

  it('the selectable (available) languages are a subset of the supported codes and each has a dictionary', () => {
    AVAILABLE_LOCALES.forEach((l) => {
      expect(SUPPORTED_LOCALE_CODES).toContain(l.code);
      expect(DICTIONARIES[l.code]).toBeTruthy();
    });
    expect(Object.keys(DICTIONARIES).sort()).toEqual(AVAILABLE_LOCALES.map((l) => l.code).sort());
    expect(AVAILABLE_LOCALES.map((l) => l.code)).toContain(DEFAULT_LOCALE);
  });

  it('classifies codes: supported, available, and the safe fallback for everything else', () => {
    expect(isSupportedLocale('hi')).toBe(true);
    expect(isSupportedLocale(' HI ')).toBe(true);
    expect(isSupportedLocale('hi-IN')).toBe(false);
    expect(isSupportedLocale('xx')).toBe(false);
    expect(isSupportedLocale(undefined)).toBe(false);
    expect(isAvailableLocale('hi')).toBe(true);
    expect(toAvailableLocale('HI')).toBe('hi');
    expect(toAvailableLocale('hi-IN')).toBeNull();
    expect(toAvailableLocale('xx')).toBeNull();
    expect(toAvailableLocale(null)).toBeNull();
    expect(toAvailableLocale({})).toBeNull();
  });
});

describe('first-batch dictionary parity', () => {
  const others = AVAILABLE_LOCALES.map((l) => l.code).filter((c) => c !== DEFAULT_LOCALE);

  it('English defines the first-batch namespaces', () => {
    TRANSLATED_NAMESPACES.forEach((ns) => expect(Object.keys(DICTIONARIES.en[ns] || {}).length).toBeGreaterThan(0));
    expect(enKeys.length).toBeGreaterThan(90);
  });

  it.each(others)('%s: has every first-batch key, no extras, only non-empty strings', (code) => {
    const dict = firstBatch(DICTIONARIES[code]);
    expect(Object.keys(dict).filter((k) => !(k in en))).toEqual([]);       // no stray keys
    expect(enKeys.filter((k) => !(k in dict))).toEqual([]);                // nothing missing
    Object.entries(dict).forEach(([k, v]) => {
      expect(typeof v).toBe('string');
      expect(v.trim()).not.toBe('');
      expect([k, v.includes('undefined') || v.includes('[object')]).toEqual([k, false]);
    });
  });

  it.each(others)('%s: is a translation, not a copy of English', (code) => {
    const dict = firstBatch(DICTIONARIES[code]);
    const same = enKeys.filter((k) => dict[k] === en[k] && !IDENTICAL_TO_ENGLISH_ALLOWED.has(k));
    expect(same).toEqual([]);
  });

  it.each(others)('%s: keeps the same {{placeholders}} as English in every string', (code) => {
    const dict = firstBatch(DICTIONARIES[code]);
    enKeys.forEach((k) => expect([k, tokens(dict[k])]).toEqual([k, tokens(en[k])]));
  });

  it.each(others)('%s: is written in its own script (no English-only values for text keys)', (code) => {
    const dict = firstBatch(DICTIONARIES[code]);
    // Every value must contain at least one non-ASCII letter, i.e. is not plain English/Latin text.
    const latinOnly = enKeys.filter((k) => /^[\x00-\x7F]*$/.test(dict[k]));
    expect(latinOnly).toEqual([]);
  });
});

describe('every key the first batch uses in code exists in English', () => {
  const srcRoot = path.join(__dirname, '..', '..');
  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); }
      else if (/\.(jsx?|js)$/.test(e.name)) files.push(p);
    });
  }(srcRoot));

  const used = new Map(); // key -> first file
  files.forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const patterns = [
      /\bt\(\s*'([A-Za-z]+\.[A-Za-z0-9.]+)'/g,                         // t('nav.home')
      /\b(?:labelKey|descKey):\s*'([A-Za-z]+\.[A-Za-z0-9.]+)'/g,       // { labelKey: 'auth.devotee' }
      /getTranslator\([^)]*\)\(\s*'([A-Za-z]+\.[A-Za-z0-9.]+)'/g,      // getTranslator(code)('settings.…')
      // any quoted dictionary key: label→key maps (addressLabels, PIN_SOURCE_KEYS), tRef.current('…'), etc.
      /['"]((?:common|nav|settings|auth|profile|address|location|wallet|referrals|gallery|home|poojas|temples|festivals|livestreams|panchang|shop|cart|orders|booking|bookings|payment|invoice|family|account|legal|notifications|blogs)\.[A-Za-z0-9]+)['"]/g,
    ];
    patterns.forEach((re) => { let m; while ((m = re.exec(text))) if (!used.has(m[1])) used.set(m[1], path.relative(srcRoot, file)); });
  });

  it('finds the keys (guards against the scan silently matching nothing)', () => {
    expect(used.size).toBeGreaterThan(80);
  });

  it('has no typo\'d or missing key anywhere in src/', () => {
    const missing = [...used.entries()].filter(([k]) => resolve(DICTIONARIES.en, k) === undefined).map(([k, f]) => `${k} (${f})`);
    expect(missing).toEqual([]);
  });

  it('every first-batch English key is actually used somewhere (no dead keys)', () => {
    // Keys that already existed before the dictionaries were extended and that no screen renders today. They are
    // translated so they are ready if a screen starts using them; any NEW key must be used (this list must not grow).
    const KEPT = new Set([
      'common.retry', 'wallet.pageSubtitle', 'wallet.noTransactionsDesc', 'wallet.loading', 'wallet.retry',
      'referrals.pageSubtitle', 'referrals.shareOther', 'referrals.usedDate',
    ]);
    const unused = enKeys.filter((k) => !used.has(k) && !KEPT.has(k));
    expect(unused).toEqual([]);
  });
});
