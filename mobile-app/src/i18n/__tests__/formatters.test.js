import { formatCurrency, formatDate as legacyFormatDate, formatDateTime as legacyFormatDateTime, timeAgo as legacyTimeAgo } from '../../utils/helpers';
import { SUPPORTED_LOCALE_CODES } from '../locales';
import { getTranslator } from '../translate';
import {
  FALLBACK_FORMAT_TAG, __resetFormatterCaches, formatDate, formatDateTime, formatDateWithOptions, formatTime,
  getCalendarLabels, getFormatters, resolveFormatLocale, timeAgo,
} from '../formatters';

// Day 27: display formatting for dates, weekdays, months, times and relative time follows the selected language.
// Exact text is asserted for English (it must stay byte-for-byte what it was) and for Hindi; for the other locales the
// assertions are about behaviour that does not depend on the OS's ICU release: the script of the month/weekday names,
// Latin digits, field presence, and that nothing English leaks through. Hermes' own Intl is NOT exercised by these tests
// (Node's ICU is); they prove the logic and the fallback, not the device output.

const CODES = SUPPORTED_LOCALE_CODES;
const NON_ENGLISH = CODES.filter((c) => c !== 'en');
const SCRIPT = {
  hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, gu: /[઀-૿]/, ta: /[஀-௿]/, te: /[ఀ-౿]/,
  kn: /[ಀ-೿]/, ml: /[ഀ-ൿ]/, bn: /[ঀ-৿]/, pa: /[਀-੿]/, or: /[଀-୿]/,
};
const NATIVE_DIGITS = /[०-९૦-૯௦-௯౦-౯೦-೯൦-൯০-৯੦-੯୦-୯]/;

// A Thursday, built from LOCAL fields so the expectation does not depend on the machine's time zone.
const THU = new Date(2026, 2, 5, 14, 5);

beforeEach(() => { __resetFormatterCaches(); });
afterEach(() => { jest.restoreAllMocks(); __resetFormatterCaches(); });

describe('locale mapping', () => {
  it('English uses the same tag every legacy call site hardcoded; each other language its own India tag with Latin digits', () => {
    expect(resolveFormatLocale('en')).toBe('en-IN');
    expect(FALLBACK_FORMAT_TAG).toBe('en-IN');
    NON_ENGLISH.forEach((code) => expect(resolveFormatLocale(code)).toBe(`${code}-IN-u-nu-latn`));
  });

  it('an unknown, region-tagged or missing language is English', () => {
    ['xx', 'hi-IN', '', null, undefined, {}].forEach((bad) => expect(resolveFormatLocale(bad)).toBe('en-IN'));
  });

  it('falls back to English formatting when the runtime does not list the locale (e.g. Hermes without that ICU data)', () => {
    jest.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockReturnValue([]);
    expect(resolveFormatLocale('hi')).toBe('en-IN');
    expect(formatDate(THU, 'dd MMM yyyy', 'hi')).toBe(legacyFormatDate(THU, 'dd MMM yyyy'));
    expect(getCalendarLabels('hi').weekdays).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('falls back when the runtime "constructs" the locale but silently resolves to another one', () => {
    const Real = Intl.DateTimeFormat;
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((tag, options) => {
      const real = new Real(tag, options);
      return { resolvedOptions: () => ({ ...real.resolvedOptions(), locale: 'en-US' }), format: (d) => real.format(d) };
    });
    Intl.DateTimeFormat.supportedLocalesOf = Real.supportedLocalesOf;
    expect(resolveFormatLocale('ta')).toBe('en-IN');
  });

  it('falls back (does not throw) when Intl itself throws', () => {
    jest.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation(() => { throw new Error('no Intl'); });
    expect(resolveFormatLocale('hi')).toBe('en-IN');
  });
});

describe('dates, months and weekdays', () => {
  it('English output is exactly the legacy helper output for every pattern the screens use', () => {
    ['dd MMM yyyy', 'dd MMMM yyyy', 'EEEE, dd MMMM yyyy', 'EEEE, dd MMM yyyy', 'EEE, dd MMM', 'MMM', 'dd', 'yyyy', 'EEEE']
      .forEach((p) => expect(formatDate(THU, p, 'en')).toBe(legacyFormatDate(THU, p)));
    expect(formatDate(THU, 'dd MMM yyyy', 'en')).toBe('05 Mar 2026');
    expect(formatDateTime(THU, 'en')).toBe(legacyFormatDateTime(THU));
    expect(formatDateTime(THU, 'en')).toBe('05 Mar 2026, 14:05');
  });

  it('English toLocaleDateString-style sites are unchanged', () => {
    const o = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    expect(formatDateWithOptions(THU, o, 'en')).toBe(THU.toLocaleDateString('en-IN', o));
  });

  it('Hindi: month and weekday names are Hindi, digits stay Latin', () => {
    expect(formatDate(THU, 'dd MMM yyyy', 'hi')).toBe('05 मार्च 2026');
    expect(formatDate(THU, 'EEEE, dd MMMM yyyy', 'hi')).toBe('गुरुवार, 05 मार्च 2026');
    expect(formatDate(THU, 'EEEE', 'hi')).toBe('गुरुवार');
    expect(formatDate(THU, 'MMM', 'hi')).toBe('मार्च');
    expect(formatDate(THU, 'dd', 'hi')).toBe('05');
    expect(formatDate(THU, 'yyyy', 'hi')).toBe('2026');
    expect(formatDateTime(THU, 'hi')).toBe('05 मार्च 2026, 14:05');
    expect(formatDateWithOptions(THU, { day: 'numeric', month: 'short' }, 'hi')).toMatch(/^5 मार्च$|^मार्च 5$/);
  });

  it.each(NON_ENGLISH)('%s: month/weekday names are in the language\'s own script, digits are Latin, nothing English leaks', (code) => {
    const full = formatDate(THU, 'EEEE, dd MMMM yyyy', code);
    expect(full).toMatch(SCRIPT[code]);
    expect(full).toContain('2026');
    expect(full).toContain('05');
    expect(full).not.toMatch(NATIVE_DIGITS);
    expect(full).not.toMatch(/Thursday|March|Mar\b/);
    expect(formatDate(THU, 'dd MMM yyyy', code)).toMatch(SCRIPT[code]);
    expect(formatDate(THU, 'EEEE', code)).toMatch(SCRIPT[code]);
    expect(formatDateWithOptions(THU, { weekday: 'long', day: 'numeric', month: 'long' }, code)).toMatch(SCRIPT[code]);
    expect(formatDateTime(THU, code)).toMatch(/, 14:05$/);
  });

  it('every language formats the same moment on the same calendar day (formatting never shifts the day)', () => {
    CODES.forEach((code) => {
      expect(formatDate(THU, 'dd', code)).toBe('05');
      expect(formatDate(THU, 'yyyy', code)).toBe('2026');
    });
  });

  it('a date-only string keeps its local-midnight reading (never shifted by UTC) in every language', () => {
    const local = new Date(2026, 2, 5);
    CODES.forEach((code) => {
      expect(formatDate('2026-03-05', 'EEEE, dd MMMM yyyy', code)).toBe(formatDate(local, 'EEEE, dd MMMM yyyy', code));
    });
  });

  it('a full ISO timestamp is read as the same instant the legacy helper reads', () => {
    const iso = '2026-03-01T06:30:00.000Z';
    expect(formatDate(iso, 'dd MMM yyyy', 'en')).toBe(legacyFormatDate(iso, 'dd MMM yyyy'));
    expect(formatDate(iso, 'dd', 'hi')).toBe(formatDate(new Date(iso), 'dd', 'en'));
  });

  it('missing or invalid input is the same dash in every language, never "Invalid Date" or the epoch', () => {
    CODES.forEach((code) => {
      [null, undefined, '', 'not-a-date', NaN].forEach((bad) => {
        expect(formatDate(bad, 'dd MMM yyyy', code)).toBe('—');
        expect(formatDateTime(bad, code)).toBe('—');
      });
      expect(formatDateWithOptions(new Date('nope'), { day: 'numeric' }, code)).toBe('—');
      expect(formatDateWithOptions(null, { day: 'numeric' }, code)).toBe('—');
    });
    expect(formatTime(null)).toBe('—');
  });

  it('a pattern the formatter does not know is rendered by the legacy helper rather than guessed', () => {
    expect(formatDate(THU, 'yyyy-MM-dd', 'hi')).toBe('2026-03-05');
  });
});

describe('time of day', () => {
  it('stays the app\'s 24-hour HH:mm in the device time zone, identical in every language', () => {
    expect(formatTime(THU)).toBe('14:05');
    expect(formatTime(new Date(2026, 2, 5, 0, 7))).toBe('00:07');
    expect(formatTime(new Date(2026, 2, 5, 23, 59))).toBe('23:59');
    CODES.forEach((code) => expect(formatDateTime(new Date(2026, 2, 5, 9, 3), code)).toMatch(/09:03$/));
  });
});

describe('relative time', () => {
  const NOW = new Date(2026, 2, 5, 12, 0, 0).getTime();
  const ago = (ms) => new Date(NOW - ms).toISOString();
  const S = 1000; const MIN = 60 * S; const HOUR = 60 * MIN; const DAY = 24 * HOUR;

  it('English keeps the existing date-fns wording', () => {
    const iso = new Date(Date.now() - 5 * MIN).toISOString();
    expect(timeAgo(iso, 'en')).toBe(legacyTimeAgo(iso));
    expect(timeAgo(iso, 'en')).toBe('5 minutes ago');
  });

  it('Hindi buckets come from the dictionary', () => {
    const t = getTranslator('hi');
    expect(timeAgo(ago(10 * S), 'hi', NOW)).toBe(t('common.agoJustNow'));
    expect(timeAgo(ago(60 * S), 'hi', NOW)).toBe(t('common.agoMinuteOne'));
    expect(timeAgo(ago(5 * MIN), 'hi', NOW)).toBe('5 मिनट पहले');
    expect(timeAgo(ago(59 * MIN), 'hi', NOW)).toBe(t('common.agoMinutes', { n: 59 }));
    expect(timeAgo(ago(60 * MIN), 'hi', NOW)).toBe(t('common.agoHourOne'));
    expect(timeAgo(ago(3 * HOUR), 'hi', NOW)).toBe('3 घंटे पहले');
    expect(timeAgo(ago(23 * HOUR), 'hi', NOW)).toBe(t('common.agoHours', { n: 23 }));
    expect(timeAgo(ago(24 * HOUR), 'hi', NOW)).toBe(t('common.agoDayOne'));
    expect(timeAgo(ago(29 * DAY), 'hi', NOW)).toBe(t('common.agoDays', { n: 29 }));
    expect(timeAgo(ago(30 * DAY), 'hi', NOW)).toBe(t('common.agoMonthOne'));
    expect(timeAgo(ago(90 * DAY), 'hi', NOW)).toBe(t('common.agoMonths', { n: 3 }));
    expect(timeAgo(ago(330 * DAY), 'hi', NOW)).toBe(t('common.agoMonths', { n: 11 }));
    expect(timeAgo(ago(364 * DAY), 'hi', NOW)).toBe(t('common.agoYearOne'));   // 12 rounded months is a year, never "12 months"
    expect(timeAgo(ago(400 * DAY), 'hi', NOW)).toBe(t('common.agoYearOne'));
    expect(timeAgo(ago(800 * DAY), 'hi', NOW)).toBe(t('common.agoYears', { n: 2 }));
  });

  it.each(NON_ENGLISH)('%s: every bucket is a finished sentence in the language\'s script, with the number inserted and no leftover placeholder', (code) => {
    [10 * S, 60 * S, 5 * MIN, HOUR, 3 * HOUR, DAY, 5 * DAY, 30 * DAY, 90 * DAY, 400 * DAY, 800 * DAY].forEach((ms) => {
      const text = timeAgo(ago(ms), code, NOW);
      expect(text).toMatch(SCRIPT[code]);
      expect(text).not.toMatch(/\{\{|undefined|\bago\b/);
    });
    expect(timeAgo(ago(5 * MIN), code, NOW)).toContain('5');
    expect(timeAgo(ago(5 * MIN), code, NOW)).not.toBe(timeAgo(ago(6 * MIN), code, NOW));
  });

  it('a timestamp in the future (clock a little ahead of the server) is "just now", not an "in N minutes" nobody translated', () => {
    const t = getTranslator('hi');
    expect(timeAgo(new Date(NOW + 3 * MIN).toISOString(), 'hi', NOW)).toBe(t('common.agoJustNow'));
  });

  it('missing or invalid input is the dash in every language', () => {
    CODES.forEach((code) => [null, undefined, '', 'nope'].forEach((bad) => expect(timeAgo(bad, code, NOW)).toBe('—')));
  });
});

describe('calendar labels', () => {
  it('English is the existing "March 2026" title and Su–Sa header', () => {
    const en = getCalendarLabels('en');
    expect(en.monthTitle(2026, 2)).toBe('March 2026');
    expect(en.monthName(11)).toBe('December');
    expect(en.weekdays).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('Hindi: Sunday-first short weekday names and a Hindi month title with a Latin year', () => {
    const hi = getCalendarLabels('hi');
    expect(hi.weekdays).toHaveLength(7);
    expect(hi.weekdays[0]).toBe('रवि');
    expect(hi.weekdays[1]).toBe('सोम');
    expect(hi.monthTitle(2026, 2)).toMatch(/मार्च/);
    expect(hi.monthTitle(2026, 2)).toContain('2026');
  });

  it.each(NON_ENGLISH)('%s: seven non-empty weekday labels, twelve month names, all in the language\'s script', (code) => {
    const labels = getCalendarLabels(code);
    expect(labels.weekdays).toHaveLength(7);
    labels.weekdays.forEach((w) => { expect(w).toMatch(SCRIPT[code]); });
    expect(new Set(labels.weekdays).size).toBe(7);
    for (let m = 0; m < 12; m += 1) { expect(labels.monthName(m)).toMatch(SCRIPT[code]); }
    expect(labels.monthTitle(2026, 2)).toContain('2026');
  });
});

describe('bound formatters', () => {
  it('keep one identity per language and speak that language', () => {
    expect(getFormatters('hi')).toBe(getFormatters('hi'));
    expect(getFormatters('hi')).not.toBe(getFormatters('ta'));
    expect(getFormatters('xx')).toBe(getFormatters('en'));
    expect(getFormatters('hi').formatDate(THU, 'dd MMM yyyy')).toBe('05 मार्च 2026');
    expect(getFormatters('en').formatDate(THU, 'dd MMM yyyy')).toBe('05 Mar 2026');
  });
});

describe('money is not localized by the date formatters (policy pinned here)', () => {
  // INR display is the same in every language by design: ₹, Indian lakh/crore grouping, Latin digits, 0–2 decimals. Per-locale
  // CLDR data does not agree on the grouping (some builds print ₹1,234,567 for mr/kn/ml/or), so a locale-driven formatter
  // would print different amounts in different languages. The shared helper therefore stays language-independent.
  it('INR display policy: ₹, Indian grouping, Latin digits, whole rupees without decimals and up to two decimals when present', () => {
    expect(formatCurrency(0)).toBe('₹0');
    expect(formatCurrency(1000)).toBe('₹1,000');
    expect(formatCurrency(2118)).toBe('₹2,118');
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.5');
    expect(formatCurrency(99.99)).toBe('₹99.99');
    expect(formatCurrency(498.5)).toBe('₹498.5');
    expect(formatCurrency(-50)).toBe('-₹50');
    expect(formatCurrency(1234567.5)).not.toMatch(NATIVE_DIGITS);
  });
});
