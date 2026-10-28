/**
 * Locale catalogue.
 *
 * Two DIFFERENT sets, deliberately kept apart:
 *
 *   SUPPORTED_LOCALE_CODES  the codes the website and backend understand
 *                           (backend/src/config/languages.config.js). Only these may be sent to the backend as
 *                           `?lang=` or `preferredLanguage`. Never a region tag such as `hi-IN`.
 *   AVAILABLE_LOCALES       the subset that ALSO has a mobile UI dictionary below — the only languages the app
 *                           can switch its interface to and the only ones the language picker lists.
 *
 * Adding a language: create `<code>.js` with the first-batch keys, import it here and add it to DICTIONARIES.
 * `__tests__/localeParity.test.js` fails if a registered dictionary misses a key or merely copies English.
 */
import en from './en';
import hi from './hi';
import mr from './mr';
import gu from './gu';
import ta from './ta';
import te from './te';
import kn from './kn';
import ml from './ml';
import bn from './bn';
import pa from './pa';
import or from './or';

export const DEFAULT_LOCALE = 'en';

// Same codes, order and native names as backend/src/config/languages.config.js and the website's Settings list.
export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English',   native: 'English' },
  { code: 'hi', name: 'Hindi',     native: 'हिन्दी' },
  { code: 'mr', name: 'Marathi',   native: 'मराठी' },
  { code: 'gu', name: 'Gujarati',  native: 'ગુજરાતી' },
  { code: 'ta', name: 'Tamil',     native: 'தமிழ்' },
  { code: 'te', name: 'Telugu',    native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada',   native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'bn', name: 'Bengali',   native: 'বাংলা' },
  { code: 'pa', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia',      native: 'ଓଡ଼ିଆ' },
];

export const SUPPORTED_LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code);

// Dictionaries shipped in the app. Keep in sync with the imports above.
export const DICTIONARIES = { en, hi, mr, gu, ta, te, kn, ml, bn, pa, or };

// Namespaces every registered dictionary must translate in full (enforced by __tests__/localeParity.test.js):
// batch 1 (Day 17): common, nav, settings, auth · batch 2 (Day 18): profile, address, location, wallet, referrals ·
// batch 3 (Day 19): gallery, home, poojas, temples, festivals, livestreams, panchang ·
// batch 4 (Day 20): shop, cart, orders · batch 5 (Day 21): booking, bookings, payment, invoice · batch 6 (Day 23): family, account, legal · batch 7 (Day 24): notifications, blogs.
// A namespace not listed here is not translated yet and falls back to English in other locales.
export const TRANSLATED_NAMESPACES = [
  'common', 'nav', 'settings', 'auth', 'profile', 'address', 'location', 'wallet', 'referrals',
  'gallery', 'home', 'poojas', 'temples', 'festivals', 'livestreams', 'panchang',
  'shop', 'cart', 'orders',
  'booking', 'bookings', 'payment', 'invoice',
  'family', 'account', 'legal',
  'notifications', 'blogs',
];

export const AVAILABLE_LOCALES = SUPPORTED_LOCALES.filter((l) => Object.prototype.hasOwnProperty.call(DICTIONARIES, l.code));

const normalize = (code) => (typeof code === 'string' ? code.trim().toLowerCase() : '');

export const isSupportedLocale = (code) => SUPPORTED_LOCALE_CODES.includes(normalize(code));

export const isAvailableLocale = (code) => AVAILABLE_LOCALES.some((l) => l.code === normalize(code));

/** A supported + available code, lower-cased, or null (stale/unknown/region-tagged values). */
export const toAvailableLocale = (code) => (isAvailableLocale(code) ? normalize(code) : null);
