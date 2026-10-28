// Which `?lang=` (if any) a request should carry. Contract: the backend picks localized CONTENT from the `lang` query
// parameter on GET requests (not Accept-Language) and recognises only its 11 codes (backend/src/config/languages.config.js);
// English is the default, so it is simply omitted. Mirrors frontend/src/api/axios.js.
//
// Rules (one predictable order, unit-tested):
//   • GET only — POST/PATCH/PUT/DELETE bodies and params are never touched.
//   • Skipped for English.
//   • Only a supported code is ever sent (never `hi-IN`, never an arbitrary value).
//   • A `lang` the caller already supplied — in `params` or inside the URL's query string — always wins; no duplicate.
//   • Existing params are preserved.
import { SUPPORTED_LOCALE_CODES, DEFAULT_LOCALE } from '../i18n/locales';

const hasLangInUrl = (url) => typeof url === 'string' && /[?&]lang=/.test(url);

export function applyContentLanguage(config, language) {
  if (!config || String(config.method || 'get').toLowerCase() !== 'get') return config;
  if (!language || language === DEFAULT_LOCALE || !SUPPORTED_LOCALE_CODES.includes(language)) return config;
  if (hasLangInUrl(config.url)) return config;

  const params = config.params;
  if (typeof URLSearchParams !== 'undefined' && params instanceof URLSearchParams) {
    if (!params.has('lang')) {
      const copy = new URLSearchParams(params);
      copy.set('lang', language);
      config.params = copy;
    }
    return config;
  }
  if (params && typeof params === 'object' && Object.prototype.hasOwnProperty.call(params, 'lang')) return config;
  config.params = { ...(params || {}), lang: language };
  return config;
}
