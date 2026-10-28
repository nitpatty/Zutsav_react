/**
 * Mobile i18n: a small custom layer (no third-party library).
 *
 *   import { useTranslation } from '../../i18n';
 *   const { t, language } = useTranslation();
 *   <Text>{t('nav.home')}</Text>              // English fallback for any key a locale does not have yet
 *   t('auth.deletionPendingBody', { date })   // {{date}} is inserted literally (safe for user-provided values)
 *
 * Layout: locales/ (catalogue + dictionaries) · translate.js (lookup, interpolation, stable `t`) ·
 * languageStore.js (device language + SecureStore) · languagePreference.js (account sync; imports the API client).
 *
 * `t` keeps one identity per language — also when no <I18nProvider> is mounted — so it is safe in hook
 * dependency arrays (WalletScreen's fetch callbacks depend on it).
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useLanguageStore } from './languageStore';
import { getTranslator } from './translate';
import { getFormatters } from './formatters';
import { toAvailableLocale, DEFAULT_LOCALE } from './locales';

export { useLanguageStore } from './languageStore';
export {
  SUPPORTED_LOCALES, SUPPORTED_LOCALE_CODES, AVAILABLE_LOCALES, DEFAULT_LOCALE,
  isSupportedLocale, isAvailableLocale, toAvailableLocale,
} from './locales';
export { getTranslator, interpolate } from './translate';
export { getFormatters } from './formatters';

const I18nContext = createContext(null);

function useI18nValue() {
  const stored = useLanguageStore((s) => s.language);
  const language = toAvailableLocale(stored) || DEFAULT_LOCALE;
  // Memoised on the language alone: same `{ t, language }` object until the language really changes.
  return useMemo(() => ({ t: getTranslator(language), language }), [language]);
}

/** Makes `t()` available to the tree. Optional: `useTranslation()` also works without it. */
export function I18nProvider({ children }) {
  const value = useI18nValue();
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `{ t, language }` for the current UI language. Re-renders the caller when the language changes. */
export function useTranslation() {
  const ctx = useContext(I18nContext);
  const fallback = useI18nValue(); // hooks must run unconditionally
  return ctx || fallback;
}

/**
 * Display formatters (dates, weekdays, months, relative time) for the current UI language — same identity until the
 * language changes. Display only: never feed the returned strings into a request or a calculation. See ./formatters.js.
 */
export function useFormatters() {
  const { language } = useTranslation();
  return useMemo(() => getFormatters(language), [language]);
}

export default { I18nProvider, useTranslation, useLanguageStore };
