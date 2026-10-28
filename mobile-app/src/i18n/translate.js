/**
 * Pure translation helpers (no React, no storage): lookup with English fallback, safe interpolation,
 * and one stable translator function per language.
 */
import { DICTIONARIES, DEFAULT_LOCALE, TRANSLATED_NAMESPACES, toAvailableLocale } from './locales';

/** Resolves 'nav.home' in a nested dictionary; only string leaves count (a namespace object is "missing"). */
export function resolve(dictionary, path) {
  if (!dictionary || typeof path !== 'string') return undefined;
  let node = dictionary;
  for (const part of path.split('.')) {
    if (node == null || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const TOKEN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

/**
 * Replaces {{name}} tokens. The replacement is computed by a FUNCTION, so a value such as "$&" or "$1" is inserted
 * literally and never treated as a String.replace pattern; parameter names are matched by lookup, never compiled
 * into a RegExp. A token without a matching parameter is left visible rather than silently dropped.
 */
export function interpolate(template, params) {
  if (typeof template !== 'string' || !params || typeof params !== 'object') return template;
  return template.replace(TOKEN, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) && params[name] != null ? String(params[name]) : match
  ));
}

const warned = new Set();
function warnMissing(language, key) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const id = `${language}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  // Only the locale code and the key — never parameter values (they can be user data).
  // eslint-disable-next-line no-console
  console.warn(`[i18n] missing translation key "${key}" for "${language}"`);
}
export const __resetMissingKeyWarnings = () => warned.clear();

const translators = new Map();

/**
 * One translator per language, created once and reused — so `t` keeps the same identity across renders and
 * is safe in hook dependency arrays. Lookup order: language → English → the key itself (only for a key that
 * does not exist even in English, i.e. a developer error, which is also warned about).
 */
export function getTranslator(language) {
  const code = toAvailableLocale(language) || DEFAULT_LOCALE;
  if (!translators.has(code)) {
    const primary = DICTIONARIES[code];
    const english = DICTIONARIES[DEFAULT_LOCALE];
    translators.set(code, (key, params) => {
      let value = resolve(primary, key);
      if (value === undefined) {
        // A namespace that is not in TRANSLATED_NAMESPACES yet falls back to English by design — only a missing
        // key inside a namespace this locale is supposed to cover is worth a warning.
        if (code !== DEFAULT_LOCALE && TRANSLATED_NAMESPACES.includes(String(key).split('.')[0])) warnMissing(code, key);
        value = resolve(english, key);
        if (value === undefined) {
          warnMissing(DEFAULT_LOCALE, key);
          return key;
        }
      }
      return interpolate(value, params);
    });
  }
  return translators.get(code);
}
