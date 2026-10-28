import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { resolve, interpolate, getTranslator, __resetMissingKeyWarnings } from '../translate';
import { I18nProvider, useTranslation, useLanguageStore } from '../index';
import { DICTIONARIES } from '../locales';

let warn;
beforeEach(() => {
  __resetMissingKeyWarnings();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('resolve', () => {
  const dict = { a: { b: 'x' }, n: 5, empty: '' };
  it('returns nested string values only', () => {
    expect(resolve(dict, 'a.b')).toBe('x');
    expect(resolve(dict, 'empty')).toBe('');
    expect(resolve(dict, 'a')).toBeUndefined();      // a namespace object is not a string
    expect(resolve(dict, 'n')).toBeUndefined();
    expect(resolve(dict, 'a.b.c')).toBeUndefined();
    expect(resolve(dict, 'zzz.y')).toBeUndefined();
    expect(resolve(null, 'a')).toBeUndefined();
    expect(resolve(dict, undefined)).toBeUndefined();
  });
  it('ignores inherited properties', () => {
    expect(resolve({}, 'constructor')).toBeUndefined();
    expect(resolve({}, 'toString')).toBeUndefined();
    expect(resolve({}, '__proto__.x')).toBeUndefined();
  });
});

describe('interpolate', () => {
  it('replaces {{name}} tokens, with optional spaces', () => {
    expect(interpolate('Hello {{name}}!', { name: 'Asha' })).toBe('Hello Asha!');
    expect(interpolate('{{ a }} + {{b}}', { a: 1, b: 2 })).toBe('1 + 2');
    expect(interpolate('Resend in {{n}}s', { n: 30 })).toBe('Resend in 30s');
    expect(interpolate('{{x}}{{x}}', { x: 'ab' })).toBe('abab');
  });

  it("never treats a value as a String.replace pattern ($&, $1, $$, $`, $')", () => {
    expect(interpolate('Pay {{amt}} now', { amt: '$&' })).toBe('Pay $& now');
    expect(interpolate('Pay {{amt}} now', { amt: '$1' })).toBe('Pay $1 now');
    expect(interpolate('Pay {{amt}} now', { amt: '$$' })).toBe('Pay $$ now');
    expect(interpolate('Pay {{amt}} now', { amt: "$` and $'" })).toBe("Pay $` and $' now");
    expect(interpolate('Hi {{name}}', { name: '{{name}}' })).toBe('Hi {{name}}'); // not re-expanded
  });

  it('is not affected by regex-sensitive characters in names or values', () => {
    expect(interpolate('Total: {{a.b}}', { 'a.b': '1+1' })).toBe('Total: 1+1');
    expect(interpolate('{{x}}', { x: '(.*)[a-z]+\\d{3}^$' })).toBe('(.*)[a-z]+\\d{3}^$');
    expect(interpolate('{{a}}', { 'a|b': 'wrong', a: 'right' })).toBe('right');
  });

  it('leaves a token visible when its parameter is missing or null, and never throws', () => {
    expect(interpolate('Hi {{name}}', {})).toBe('Hi {{name}}');
    expect(interpolate('Hi {{name}}', { name: null })).toBe('Hi {{name}}');
    expect(interpolate('Hi {{name}}', { name: undefined })).toBe('Hi {{name}}');
    expect(interpolate('Hi {{name}}', undefined)).toBe('Hi {{name}}');
    expect(interpolate('plain', { a: 1 })).toBe('plain');
    expect(interpolate(undefined, { a: 1 })).toBeUndefined();
  });

  it('only matches inherited names when the parameter is an own property', () => {
    expect(interpolate('{{toString}}', {})).toBe('{{toString}}');
  });

  it('stringifies falsy but present values', () => {
    expect(interpolate('{{n}}', { n: 0 })).toBe('0');
    expect(interpolate('{{s}}', { s: '' })).toBe('');
    expect(interpolate('{{b}}', { b: false })).toBe('false');
  });
});

describe('getTranslator', () => {
  it('returns the SAME function for the same language (stable identity)', () => {
    expect(getTranslator('en')).toBe(getTranslator('en'));
    expect(getTranslator('hi')).toBe(getTranslator('hi'));
    expect(getTranslator('en')).not.toBe(getTranslator('hi'));
  });

  it('English is the default and the fallback for unsupported, unavailable, stale or malformed languages', () => {
    for (const bad of [undefined, null, '', 'xx', 'hi-IN', 'HI-in', 123, {}, 'klingon']) {
      expect(getTranslator(bad)).toBe(getTranslator('en'));
      expect(getTranslator(bad)('nav.home')).toBe('Home');
    }
  });

  it('translates in the selected language', () => {
    expect(getTranslator('en')('nav.home')).toBe('Home');
    expect(getTranslator('hi')('nav.home')).toBe(DICTIONARIES.hi.nav.home);
    expect(getTranslator('hi')('nav.home')).not.toBe('Home');
  });

  it('translated namespaces (wallet, referrals, profile, address, location) now render in the locale, not English', () => {
    expect(getTranslator('hi')('wallet.pageTitle')).toBe(DICTIONARIES.hi.wallet.pageTitle);
    expect(getTranslator('hi')('wallet.pageTitle')).not.toBe('My Wallet');
    expect(getTranslator('ta')('referrals.pageTitle')).toBe(DICTIONARIES.ta.referrals.pageTitle);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a namespace that is not translated yet falls back to English silently (no raw key, no warning)', () => {
    DICTIONARIES.en.futureArea = { title: 'English only for now' };
    try {
      expect(getTranslator('hi')('futureArea.title')).toBe('English only for now');
      expect(getTranslator('ta')('futureArea.title')).toBe('English only for now');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      delete DICTIONARIES.en.futureArea;
    }
  });

  it('warns (once) for a missing key inside a namespace the locale must cover, and still falls back to English', () => {
    const original = DICTIONARIES.hi.nav.shop;
    delete DICTIONARIES.hi.nav.shop;
    try {
      expect(getTranslator('hi')('nav.shop')).toBe('Shop');
      expect(getTranslator('hi')('nav.shop')).toBe('Shop');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toBe('[i18n] missing translation key "nav.shop" for "hi"');
    } finally {
      DICTIONARIES.hi.nav.shop = original;
    }
  });

  it('returns the key itself only when it does not exist even in English, and warns', () => {
    expect(getTranslator('en')('nav.doesNotExist')).toBe('nav.doesNotExist');
    expect(getTranslator('hi')('nav.doesNotExist')).toBe('nav.doesNotExist');
    expect(warn).toHaveBeenCalled();
  });

  it('missing-key diagnostics never include parameter values (they can be user data)', () => {
    getTranslator('en')('nav.nope', { email: 'secret@example.invalid', phone: '9876543210' });
    const logged = warn.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(logged).not.toMatch(/secret@example|9876543210/);
  });

  it('interpolates translated templates', () => {
    expect(getTranslator('en')('auth.resendIn', { n: 12 })).toBe('Resend OTP in 12s');
    expect(getTranslator('hi')('auth.resendIn', { n: 12 })).toContain('12');
    expect(getTranslator('en')('auth.deletionPendingBody', { date: '$&' })).toContain('$&');
  });
});

describe('useTranslation / I18nProvider', () => {
  const Probe = ({ onT }) => {
    const { t, language } = useTranslation();
    onT(t);
    return <Text testID="out">{`${language}:${t('nav.home')}`}</Text>;
  };

  it('works without a provider and keeps `t` stable across re-renders', () => {
    const seen = [];
    const { rerender } = render(<Probe onT={(t) => seen.push(t)} />);
    rerender(<Probe onT={(t) => seen.push(t)} />);
    rerender(<Probe onT={(t) => seen.push(t)} />);
    expect(new Set(seen).size).toBe(1);
    expect(screen.getByTestId('out').props.children).toBe('en:Home');
  });

  it('keeps `t` stable with a provider too', () => {
    const seen = [];
    const { rerender } = render(<I18nProvider><Probe onT={(t) => seen.push(t)} /></I18nProvider>);
    rerender(<I18nProvider><Probe onT={(t) => seen.push(t)} /></I18nProvider>);
    expect(new Set(seen).size).toBe(1);
  });

  it.each([['without a provider', false], ['with a provider', true]])('re-renders keyed text immediately on a language switch (%s)', async (_n, withProvider) => {
    const tree = <Probe onT={() => {}} />;
    render(withProvider ? <I18nProvider>{tree}</I18nProvider> : tree);
    expect(screen.getByTestId('out').props.children).toBe('en:Home');
    await act(async () => { await useLanguageStore.getState().setLanguage('hi'); });
    expect(screen.getByTestId('out').props.children).toBe(`hi:${DICTIONARIES.hi.nav.home}`);
    await act(async () => { await useLanguageStore.getState().setLanguage('en'); });
    expect(screen.getByTestId('out').props.children).toBe('en:Home');
  });

  it('a stale stored value in the store still renders English', async () => {
    useLanguageStore.setState({ language: 'xx' });
    render(<Probe onT={() => {}} />);
    expect(screen.getByTestId('out').props.children).toBe('en:Home');
  });
});
