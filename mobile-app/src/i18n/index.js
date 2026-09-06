/**
 * Lightweight mobile i18n foundation.
 *
 * Provides:
 *   - A React context with a `t(key, params)` function
 *   - A Zustand store for persisting the selected language
 *   - English translation resources (expandable to other locales later)
 *
 * Usage:
 *   import { useTranslation } from '../../i18n';
 *   const { t } = useTranslation();
 *   <Text>{t('referrals.pageTitle')}</Text>
 */

import React, { createContext, useContext, useMemo } from 'react';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import en from './locales/en';

// ── Supported locales ──────────────────────────────────────────────────────
const LOCALES = { en };

// ── Language store (persisted in SecureStore) ──────────────────────────────
export const useLanguageStore = create((set, get) => ({
  language: 'en',
  ready: false,

  /** Hydrate language from SecureStore on app start */
  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync('zutsav_language');
      if (stored && LOCALES[stored]) {
        set({ language: stored, ready: true });
      } else {
        set({ ready: true });
      }
    } catch {
      set({ ready: true });
    }
  },

  /** Change language and persist */
  setLanguage: async (lang) => {
    if (!LOCALES[lang]) return;
    set({ language: lang });
    try {
      await SecureStore.setItemAsync('zutsav_language', lang);
    } catch {}
  },
}));

// ── i18n Context ───────────────────────────────────────────────────────────
const I18nContext = createContext(null);

/**
 * Resolve a nested key like 'referrals.pageTitle' from a translations object.
 * Supports parameter interpolation: 'Hello {{name}}' → 'Hello World'.
 */
function resolve(obj, path) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str;
  return Object.entries(params).reduce(
    (result, [key, val]) => result.replace(new RegExp(`{{${key}}}`, 'g'), val),
    str,
  );
}

/**
 * i18n Provider — wraps the app to make `t()` available.
 */
export function I18nProvider({ children }) {
  const language = useLanguageStore((s) => s.language);

  const value = useMemo(() => {
    const translations = LOCALES[language] || LOCALES.en;

    /** Translate a key, with optional parameter interpolation */
    const t = (key, params) => {
      const val = resolve(translations, key);
      if (val === undefined) {
        // Fallback to English if key not found in current locale
        const enVal = resolve(LOCALES.en, key);
        return interpolate(enVal ?? key, params);
      }
      return interpolate(val, params);
    };

    return { t, language };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook to access translation function and current language.
 */
export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Graceful fallback if used outside provider (e.g. testing)
    return {
      t: (key, params) => {
        const val = resolve(LOCALES.en, key);
        return interpolate(val ?? key, params);
      },
      language: 'en',
    };
  }
  return ctx;
}

export default { I18nProvider, useTranslation, useLanguageStore };
