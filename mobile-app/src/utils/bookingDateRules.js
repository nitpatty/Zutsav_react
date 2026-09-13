/**
 * Booking Date Rules (mobile) — urgent-booking eligibility + the dynamic cutoff.
 *
 * Mirrors backend/src/utils/bookingDateRules.js so the picker disables exactly
 * what the server will accept, computed in IST regardless of the device timezone:
 *   - Today is NEVER allowed for urgent.
 *   - Before cutoff (urgentBookingCutoffTime, default '18:30' IST)
 *     → earliest = tomorrow,       latest = day-after-tomorrow.
 *   - At/after cutoff
 *     → earliest = day-after-tomorrow, latest = day-after-tomorrow.
 *
 * The cutoff value is NOT hardcoded — callers pass the Admin-controlled value
 * ('HH:mm') fetched from GET /api/settings/public, so backend, web and mobile
 * all operate on the SAME global business setting.
 *
 * INTENTIONALLY avoids Intl.DateTimeFormat({ timeZone }) here: Hermes' Intl on
 * Android historically lacks full timeZone support. IST is a fixed UTC+05:30
 * (India observes no DST), so we compute it via a constant shift on the UTC
 * clock — identical wall-clock results, zero Intl dependency.
 *
 * All window math is string-based ('YYYY-MM-DD') to avoid timezone drift.
 */

const IST_OFFSET_MIN = 330; // UTC+05:30
const DEFAULT_CUTOFF = '18:30';

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

/** Instant `date` shifted to the IST wall clock (UTC fields read as IST). */
function istShifted(date) {
  return new Date(date.getTime() + IST_OFFSET_MIN * 60000);
}

/** 'YYYY-MM-DD' that an instant falls on in IST. */
export function dateStrInTimezone(date /* , timezone = TIMEZONE */) {
  const d = istShifted(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' representing "today" in IST. */
export function todayIST(date = new Date()) {
  return dateStrInTimezone(date);
}

/** Minutes-since-midnight on the IST wall clock of `date`. */
export function istMinutesOfDay(date = new Date()) {
  const d = istShifted(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
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

/** Render a 'YYYY-MM-DD' as a friendly label (no Intl dependency). */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}