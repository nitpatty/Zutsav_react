/**
 * Booking Date Rules (web) — urgent-booking eligibility + the dynamic cutoff.
 *
 * Mirrors backend/src/utils/bookingDateRules.js so the picker disables exactly
 * what the server will accept, computed in IST regardless of the visitor's
 * device timezone:
 *   - Today is NEVER allowed for urgent.
 *   - Before cutoff (urgentBookingCutoffTime, default '18:30' IST)
 *     → earliest = tomorrow,       latest = day-after-tomorrow.
 *   - At/after cutoff
 *     → earliest = day-after-tomorrow, latest = day-after-tomorrow.
 *
 * The cutoff value is NOT hardcoded — callers pass the Admin-controlled value
 * ('HH:mm') read from GET /api/settings/public, so web, mobile and backend
 * all operate on the SAME global business setting.
 *
 * All window math is string-based ('YYYY-MM-DD') to avoid timezone drift.
 */

const TIMEZONE        = 'Asia/Kolkata';
const DEFAULT_CUTOFF  = '18:30';

/** Parse a 'HH:mm' string into [hours, minutes]. Returns null when invalid. */
export function parseCutoffTime(cutoffTime) {
  if (typeof cutoffTime !== 'string') return null;
  const m = cutoffTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/** Render a 'HH:mm' string as a friendly 12-hour label, e.g. '18:30' → '6:30 PM'. */
export function formatTimeLabel(hhmm) {
  const parsed = parseCutoffTime(hhmm);
  if (!parsed) return String(hhmm);
  const [h, m] = parsed;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** 'YYYY-MM-DD' that an instant falls on in IST. */
export function dateStrInTimezone(date, timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/** 'YYYY-MM-DD' representing "today" in IST. */
export function todayIST(date = new Date()) {
  return dateStrInTimezone(date, TIMEZONE);
}

/** Minutes-since-midnight on the IST wall clock of `date`. */
export function istMinutesOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === 'hour')   hour   = Number(p.value);
    if (p.type === 'minute') minute = Number(p.value);
  }
  return hour * 60 + minute;
}

/** True when the IST clock is at/after the given urgent cutoff (default '18:30'). */
export function isUrgentCutoffReached(date = new Date(), cutoffTime = DEFAULT_CUTOFF) {
  const parsed = parseCutoffTime(cutoffTime);
  const [hh, mm] = parsed || parseCutoffTime(DEFAULT_CUTOFF);
  return istMinutesOfDay(date) >= hh * 60 + mm;
}

/** Add `n` days to a 'YYYY-MM-DD' string (UTC date math, TZ-safe). */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Urgent-booking date window for an instant and cutoff (defaults to now/'18:30'). */
export function getUrgentWindow(date = new Date(), cutoffTime = DEFAULT_CUTOFF) {
  const resolvedCutoff = parseCutoffTime(cutoffTime) ? cutoffTime : DEFAULT_CUTOFF;
  const cutoffReached = isUrgentCutoffReached(date, resolvedCutoff);
  const minDaysFromNow = cutoffReached ? 2 : 1;
  const maxDaysFromNow = 2;
  const today = todayIST(date);
  return {
    minDaysFromNow,
    maxDaysFromNow,
    cutoffReached,
    cutoffTime: resolvedCutoff,
    earliestDate: addDays(today, minDaysFromNow),
    latestDate:   addDays(today, maxDaysFromNow),
  };
}

/** Compare two 'YYYY-MM-DD' strings. */
export function isDateWithin(dateStr, minDate, maxDate) {
  return (!minDate || dateStr >= minDate) && (!maxDate || dateStr <= maxDate);
}

/** Render a 'YYYY-MM-DD' as a friendly label. */
export function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}