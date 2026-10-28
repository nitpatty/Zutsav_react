/**
 * Locale-aware DISPLAY formatting for dates, weekdays, months, times and relative time (Day 27).
 *
 * Display only: callers keep passing the same stored values (ISO strings, Date objects) and construct them exactly as
 * before; nothing here is ever fed back into a request, a calculation or a comparison.
 *
 * Policy (tested):
 *  - English keeps the legacy output byte for byte (`utils/helpers` / `toLocaleDateString('en-IN')`), so every existing
 *    English string and test is unchanged.
 *  - Another language uses Intl with its BCP-47 tag (`hi-IN`, `ta-IN`, …) and LATIN digits (`-u-nu-latn`) — the rest of the
 *    UI (counts, prices, OTPs, PINs, ids) is Latin-digit, and native digits next to them would read as inconsistent.
 *    Month and weekday names, field order and separators come from the locale.
 *  - A locale the runtime cannot actually format (Hermes without that ICU data, a stub in a test) falls back to English
 *    formatting instead of silently printing the wrong thing; English is only the fallback, never the default for others.
 *  - Time of day is the app's existing 24-hour `HH:mm`, in the device time zone, built from the Date's local fields
 *    (no Intl `timeZone` option — Hermes' support for it is unreliable, see utils/bookingDateRules.js).
 *  - Relative time ("5 minutes ago") has no Intl dependency: Hermes does not ship Intl.RelativeTimeFormat, so non-English
 *    wording comes from the `common.ago*` dictionary keys.
 *  - Money is NOT formatted here: `utils/helpers.formatCurrency` already prints INR with the Indian grouping and `₹` in
 *    Latin digits for every language (see docs/MOBILE_TESTING.md, Day 27).
 */
import { parseISO } from 'date-fns';
import { formatDate as legacyFormatDate, formatDateTime as legacyFormatDateTime, timeAgo as legacyTimeAgo } from '../utils/helpers';
import { DEFAULT_LOCALE, toAvailableLocale } from './locales';
import { getTranslator } from './translate';

/** Tag used for English and as the fallback: exactly the locale every legacy call site hardcoded. */
export const FALLBACK_FORMAT_TAG = 'en-IN';

const DIGITS = 'latn';

const tagCache = new Map();
const dateFormatCache = new Map();

/**
 * The Intl tag used to format dates for a UI language, or FALLBACK_FORMAT_TAG when the runtime cannot format it.
 * Checked once per language: the locale must be listed by `supportedLocalesOf` AND resolve to itself (a runtime can
 * "construct" an unsupported locale by silently using its default one).
 */
export function resolveFormatLocale(language) {
  const code = toAvailableLocale(language) || DEFAULT_LOCALE;
  if (tagCache.has(code)) return tagCache.get(code);
  let tag = FALLBACK_FORMAT_TAG;
  if (code !== DEFAULT_LOCALE) {
    try {
      const base = `${code}-IN`;
      const candidate = `${base}-u-nu-${DIGITS}`;
      const listed = Intl.DateTimeFormat.supportedLocalesOf([base]).length > 0;
      const resolved = new Intl.DateTimeFormat(candidate).resolvedOptions().locale;
      if (listed && typeof resolved === 'string' && resolved.toLowerCase().startsWith(code)) tag = candidate;
    } catch {
      tag = FALLBACK_FORMAT_TAG;
    }
  }
  tagCache.set(code, tag);
  return tag;
}

function dateTimeFormat(tag, options) {
  const key = `${tag}|${JSON.stringify(options)}`;
  if (!dateFormatCache.has(key)) dateFormatCache.set(key, new Intl.DateTimeFormat(tag, options));
  return dateFormatCache.get(key);
}

/** Test helper: forget the per-runtime support decision and the cached formatters. */
export function __resetFormatterCaches() {
  tagCache.clear();
  dateFormatCache.clear();
  calendarSets.clear();
  formatterSets.clear();
}

const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

// Same input rules as utils/helpers.formatDate: a string goes through parseISO (a date-only "2026-03-01" is local midnight,
// never shifted by UTC), a Date or a timestamp is used as is, nothing/empty is "no date".
function toDate(input) {
  if (input == null || input === '') return null;
  const d = typeof input === 'string' ? parseISO(input) : new Date(input);
  return isValidDate(d) ? d : null;
}

const pad2 = (n) => String(n).padStart(2, '0');

// The date-fns patterns the customer screens use, as Intl field sets. A pattern not listed here is formatted by the
// legacy (English) helper rather than guessed.
const PATTERN_OPTIONS = {
  'dd MMM yyyy': { day: '2-digit', month: 'short', year: 'numeric' },
  'dd MMMM yyyy': { day: '2-digit', month: 'long', year: 'numeric' },
  'EEEE, dd MMMM yyyy': { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' },
  'EEEE, dd MMM yyyy': { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' },
  'EEE, dd MMM': { weekday: 'short', day: '2-digit', month: 'short' },
  MMM: { month: 'short' },
  dd: { day: '2-digit' },
  yyyy: { year: 'numeric' },
  EEEE: { weekday: 'long' },
};

/**
 * Drop-in for `helpers.formatDate(input, pattern)` in the selected language. Missing/invalid input → '—' (as before).
 * English → exactly the legacy helper.
 */
export function formatDate(input, pattern = 'dd MMM yyyy', language) {
  const tag = resolveFormatLocale(language);
  const options = PATTERN_OPTIONS[pattern];
  if (tag === FALLBACK_FORMAT_TAG || !options) return legacyFormatDate(input, pattern);
  const d = toDate(input);
  if (!d) return '—';
  try { return dateTimeFormat(tag, options).format(d); } catch { return legacyFormatDate(input, pattern); }
}

/** 24-hour "HH:mm" in the device time zone — the app's existing time display, identical in every language. */
export function formatTime(input) {
  const d = toDate(input);
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '—';
}

/** Drop-in for `helpers.formatDateTime(input)`: "<date>, HH:mm" with the localized date part. */
export function formatDateTime(input, language) {
  const tag = resolveFormatLocale(language);
  if (tag === FALLBACK_FORMAT_TAG) return legacyFormatDateTime(input);
  const d = toDate(input);
  if (!d) return '—';
  return `${formatDate(d, 'dd MMM yyyy', language)}, ${formatTime(d)}`;
}

/**
 * Replacement for the screens' own `date.toLocaleDateString('en-IN', options)`: the caller still builds the Date exactly as
 * before (so date-only values keep their existing local/UTC reading) and passes the same Intl options. English → the very
 * same `toLocaleDateString('en-IN', options)` call. An invalid Date → '—'.
 */
export function formatDateWithOptions(date, options, language) {
  if (!isValidDate(date)) return '—';
  const tag = resolveFormatLocale(language);
  if (tag === FALLBACK_FORMAT_TAG) return date.toLocaleDateString(FALLBACK_FORMAT_TAG, options);
  try { return dateTimeFormat(tag, options).format(date); } catch { return date.toLocaleDateString(FALLBACK_FORMAT_TAG, options); }
}

// Dictionary keys for the non-English relative-time wording (also read by the dead-key scan, hence full literals).
const AGO_KEYS = {
  justNow: 'common.agoJustNow',
  minuteOne: 'common.agoMinuteOne', minutes: 'common.agoMinutes',
  hourOne: 'common.agoHourOne', hours: 'common.agoHours',
  dayOne: 'common.agoDayOne', days: 'common.agoDays',
  monthOne: 'common.agoMonthOne', months: 'common.agoMonths',
  yearOne: 'common.agoYearOne', years: 'common.agoYears',
};

/**
 * Drop-in for `helpers.timeAgo(input)`. English keeps date-fns' wording. Other languages: "just now" under half a minute,
 * then rounded minutes → hours → days (to 29) → months (to 11) → years, from the dictionary. A timestamp in the future
 * (a clock a little ahead of the server's) is "just now" rather than an "in 3 minutes" the dictionaries do not carry.
 * Missing/invalid input → '—' (as before). The value is display text only.
 */
export function timeAgo(input, language, now = Date.now()) {
  const code = toAvailableLocale(language) || DEFAULT_LOCALE;
  if (code === DEFAULT_LOCALE) return legacyTimeAgo(input);
  const d = toDate(input);
  if (!d) return '—';
  const t = getTranslator(code);
  const seconds = (now - d.getTime()) / 1000;
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t(AGO_KEYS.justNow);
  if (minutes < 60) return minutes === 1 ? t(AGO_KEYS.minuteOne) : t(AGO_KEYS.minutes, { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? t(AGO_KEYS.hourOne) : t(AGO_KEYS.hours, { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? t(AGO_KEYS.dayOne) : t(AGO_KEYS.days, { n: days });
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? t(AGO_KEYS.monthOne) : t(AGO_KEYS.months, { n: months });
  const years = Math.max(1, Math.floor(days / 365));
  return years === 1 ? t(AGO_KEYS.yearOne) : t(AGO_KEYS.years, { n: years });
}

const EN_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const calendarSets = new Map();

/**
 * Month title and Sunday-first weekday header for the in-app calendars. English → the existing "March 2026" / "Su Mo …"
 * text; another language → the locale's long month name and short weekday names (display only: the cells still produce the
 * same YYYY-MM-DD values and the same Date arithmetic as before).
 */
export function getCalendarLabels(language) {
  const code = toAvailableLocale(language) || DEFAULT_LOCALE;
  const tag = resolveFormatLocale(code);
  const key = `${code}|${tag}`;
  if (!calendarSets.has(key)) {
    let labels = {
      monthName: (monthIndex) => EN_MONTH_NAMES[monthIndex],
      monthTitle: (year, monthIndex) => `${EN_MONTH_NAMES[monthIndex]} ${year}`,
      weekdays: EN_WEEKDAY_LABELS,
    };
    if (tag !== FALLBACK_FORMAT_TAG) {
      try {
        const month = dateTimeFormat(tag, { month: 'long' });
        const title = dateTimeFormat(tag, { month: 'long', year: 'numeric' });
        const weekday = dateTimeFormat(tag, { weekday: 'short' });
        // 2023-01-01 was a Sunday.
        const weekdays = Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2023, 0, 1 + i)));
        labels = {
          monthName: (monthIndex) => month.format(new Date(2023, monthIndex, 1)),
          monthTitle: (year, monthIndex) => title.format(new Date(year, monthIndex, 1)),
          weekdays,
        };
      } catch {
        // keep the English labels
      }
    }
    calendarSets.set(key, labels);
  }
  return calendarSets.get(key);
}

const formatterSets = new Map();

/** The formatters bound to one language, created once per language so the object keeps its identity across renders. */
export function getFormatters(language) {
  const code = toAvailableLocale(language) || DEFAULT_LOCALE;
  if (!formatterSets.has(code)) {
    formatterSets.set(code, {
      language: code,
      formatDate: (input, pattern) => formatDate(input, pattern, code),
      formatDateTime: (input) => formatDateTime(input, code),
      formatDateWithOptions: (date, options) => formatDateWithOptions(date, options, code),
      timeAgo: (input) => timeAgo(input, code),
      calendarLabels: getCalendarLabels(code),
    });
  }
  return formatterSets.get(code);
}
