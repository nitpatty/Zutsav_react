import {
  parseCutoffTime, formatTimeLabel, todayIST, istMinutesOfDay, isUrgentCutoffReached,
  addDays, getUrgentWindow, formatDateLabel, toDateString,
} from '../bookingDateRules';

// All instants are explicit UTC so results never depend on the machine timezone.
// IST = UTC+05:30, so 18:30 IST = 13:00 UTC.
const utc = (iso) => new Date(iso);

describe('parseCutoffTime', () => {
  it('parses valid HH:mm', () => {
    expect(parseCutoffTime('18:30')).toEqual([18, 30]);
    expect(parseCutoffTime('00:00')).toEqual([0, 0]);
    expect(parseCutoffTime('23:59')).toEqual([23, 59]);
  });

  it.each(['24:00', '12:60', '9:30', '18:3', '', 'abc', '18:30:00'])('rejects %p', (v) => {
    expect(parseCutoffTime(v)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseCutoffTime(null)).toBeNull();
    expect(parseCutoffTime(undefined)).toBeNull();
    expect(parseCutoffTime(1830)).toBeNull();
  });
});

describe('formatTimeLabel', () => {
  it('renders 12-hour labels', () => {
    expect(formatTimeLabel('18:30')).toBe('6:30 PM');
    expect(formatTimeLabel('00:00')).toBe('12 AM');
    expect(formatTimeLabel('12:00')).toBe('12 PM');
    expect(formatTimeLabel('09:05')).toBe('9:05 AM');
  });

  it('echoes invalid input unchanged', () => {
    expect(formatTimeLabel('bad')).toBe('bad');
  });
});

describe('IST clock helpers', () => {
  it('todayIST rolls over at IST midnight, not UTC midnight', () => {
    expect(todayIST(utc('2026-03-10T18:29:59Z'))).toBe('2026-03-10'); // 23:59:59 IST
    expect(todayIST(utc('2026-03-10T18:30:00Z'))).toBe('2026-03-11'); // 00:00:00 IST
  });

  it('istMinutesOfDay reads the IST wall clock', () => {
    expect(istMinutesOfDay(utc('2026-03-10T13:00:00Z'))).toBe(18 * 60 + 30);
    expect(istMinutesOfDay(utc('2026-03-10T18:30:00Z'))).toBe(0);
  });
});

describe('isUrgentCutoffReached', () => {
  it('is false one minute before and true exactly at the default 18:30 IST cutoff', () => {
    expect(isUrgentCutoffReached(utc('2026-03-10T12:59:00Z'))).toBe(false);
    expect(isUrgentCutoffReached(utc('2026-03-10T13:00:00Z'))).toBe(true);
  });

  it('honours an admin-configured cutoff', () => {
    const at1830IST = utc('2026-03-10T13:00:00Z');
    expect(isUrgentCutoffReached(at1830IST, '20:00')).toBe(false);
    expect(isUrgentCutoffReached(at1830IST, '18:00')).toBe(true);
  });

  it('falls back to 18:30 for an invalid cutoff', () => {
    expect(isUrgentCutoffReached(utc('2026-03-10T12:59:00Z'), 'nonsense')).toBe(false);
    expect(isUrgentCutoffReached(utc('2026-03-10T13:00:00Z'), 'nonsense')).toBe(true);
  });
});

describe('addDays', () => {
  it('handles month, year and leap-day boundaries', () => {
    expect(addDays('2026-03-10', 1)).toBe('2026-03-11');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('getUrgentWindow', () => {
  it('before cutoff: tomorrow through day-after-tomorrow, never today', () => {
    const w = getUrgentWindow(utc('2026-03-10T12:59:00Z'));
    expect(w).toMatchObject({
      cutoffReached: false, minDaysFromNow: 1, maxDaysFromNow: 2,
      earliestDate: '2026-03-11', latestDate: '2026-03-12', cutoffTime: '18:30',
    });
  });

  it('at cutoff: only day-after-tomorrow', () => {
    const w = getUrgentWindow(utc('2026-03-10T13:00:00Z'));
    expect(w).toMatchObject({
      cutoffReached: true, minDaysFromNow: 2,
      earliestDate: '2026-03-12', latestDate: '2026-03-12',
    });
  });

  it('uses the IST date even when UTC is still on the previous day', () => {
    // 2026-03-10 20:00 UTC = 2026-03-11 01:30 IST → "today" is the 11th, cutoff not reached.
    const w = getUrgentWindow(utc('2026-03-10T20:00:00Z'));
    expect(w.earliestDate).toBe('2026-03-12');
    expect(w.latestDate).toBe('2026-03-13');
    expect(w.cutoffReached).toBe(false);
  });

  it('crosses a month end', () => {
    const w = getUrgentWindow(utc('2026-12-30T13:00:00Z')); // after cutoff on 30 Dec IST
    expect(w.earliestDate).toBe('2027-01-01');
    expect(w.latestDate).toBe('2027-01-01');
  });

  it('applies a custom cutoff and reports it', () => {
    const w = getUrgentWindow(utc('2026-03-10T13:00:00Z'), '20:00');
    expect(w.cutoffReached).toBe(false);
    expect(w.cutoffTime).toBe('20:00');
  });

  it('reports the default cutoff when the supplied one is invalid', () => {
    expect(getUrgentWindow(utc('2026-03-10T12:00:00Z'), 'x').cutoffTime).toBe('18:30');
  });
});

describe('formatDateLabel', () => {
  it('formats YYYY-MM-DD without Intl', () => {
    expect(formatDateLabel('2026-03-05')).toBe('5 March 2026');
    expect(formatDateLabel('2026-12-31')).toBe('31 December 2026');
  });
});

describe('toDateString', () => {
  it('uses the UTC calendar day of a Date (mirrors the server)', () => {
    expect(toDateString(new Date('2026-03-10T00:00:00.000Z'))).toBe('2026-03-10');
    expect(toDateString(new Date('2026-03-10T23:59:59.000Z'))).toBe('2026-03-10');
  });

  it('extracts the day from ISO strings', () => {
    expect(toDateString('2026-03-10T00:00:00.000Z')).toBe('2026-03-10');
    expect(toDateString('2026-03-10')).toBe('2026-03-10');
  });

  it('returns null for missing or invalid values', () => {
    expect(toDateString(null)).toBeNull();
    expect(toDateString(undefined)).toBeNull();
    expect(toDateString(new Date('not a date'))).toBeNull();
    expect(toDateString('garbage')).toBeNull();
  });
});
