/**
 * Booking Date Rules — urgent-booking eligibility + the dynamic cutoff.
 *
 * BUSINESS RULE (single source of truth, timezone-authoritative):
 *   When bookingType === 'urgent', in IST (Asia/Kolkata):
 *     - Today is NEVER allowed.
 *     - Before cutoff (urgentBookingCutoffTime, default 18:30 IST)
 *       → earliest = tomorrow,      latest = day-after-tomorrow.
 *     - At/after cutoff
 *       → earliest = day-after-tomorrow, latest = day-after-tomorrow.
 *   (i.e. minDaysFromNow = cutoffReached ? 2 : 1,  maxDaysFromNow = 2.)
 *
 * The cutoff value is NOT hardcoded — it comes from the global admin
 * SystemSettings field `urgentBookingCutoffTime` ('HH:mm', default '18:30')
 * read through the cached settingsService. The Admin can change it at any
 * time; the new value takes effect on the next booking validation with no
 * server restart.
 *
 * Normal bookings are NOT touched by this module.
 *
 * The project has no date library, so window math is done on plain
 * 'YYYY-MM-DD' strings resolved in IST — never on Date objects — because
 * scheduledDate is persisted via new Date('YYYY-MM-DD') (UTC midnight) and
 * comparing raw Date instants would drift with the server's runtime TZ.
 *
 * Usage:
 *   const rules = require('./bookingDateRules');
 *   await rules.getUrgentWindow();                     // { minDaysFromNow, maxDaysFromNow, cutoffReached, cutoffTime, earliestDate, latestDate }
 *   await rules.validateUrgentDate('2026-09-14');      // { valid, message }
 */

const settingsService = require('./settingsService');

const TIMEZONE         = 'Asia/Kolkata';
const DEFAULT_CUTOFF   = '18:30';

/** Parse a 'HH:mm' string into [hours, minutes]. Returns null when invalid. */
function parseCutoffTime(cutoffTime) {
  if (typeof cutoffTime !== 'string') return null;
  const m = cutoffTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/**
 * Resolve the current urgent cutoff as a validated 'HH:mm' string.
 * If the configured value is missing or somehow invalid at runtime, falls
 * back to the legacy 18:30 default so a bad value can never crash booking
 * validation or alter behavior unexpectedly.
 */
async function resolveUrgentCutoff() {
  const value = await settingsService.get('urgentBookingCutoffTime', DEFAULT_CUTOFF);
  return (typeof value === 'string' && parseCutoffTime(value)) ? value : DEFAULT_CUTOFF;
}

/** Render a 'HH:mm' string as a friendly 12-hour label, e.g. '18:30' → '6:30 PM'. */
function formatTimeLabel(hhmm) {
  const parsed = parseCutoffTime(hhmm);
  if (!parsed) return String(hhmm);
  const [h, m] = parsed;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** 'YYYY-MM-DD' that an instant falls on in IST. */
function dateStrInTimezone(date, timezone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/** 'YYYY-MM-DD' representing "today" in IST. */
function todayIST(date = new Date()) {
  return dateStrInTimezone(date, TIMEZONE);
}

/** Minutes-since-midnight on the IST wall clock of `date`. */
function istMinutesOfDay(date = new Date()) {
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

/** True when the IST clock is at/after the configured urgent cutoff. */
async function isUrgentCutoffReached(date = new Date()) {
  const cutoffTime = await resolveUrgentCutoff();
  const [hh, mm]   = parseCutoffTime(cutoffTime);
  return istMinutesOfDay(date) >= hh * 60 + mm;
}

/** Add `n` days to a 'YYYY-MM-DD' string (UTC date math, TZ-safe). */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Render a 'YYYY-MM-DD' as a friendly label. */
function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Urgent-booking date window for an instant (defaults to now).
 * @returns {Promise<{ minDaysFromNow: number, maxDaysFromNow: number, cutoffReached: boolean, cutoffTime: string, earliestDate: string, latestDate: string }>}
 */
async function getUrgentWindow(date = new Date()) {
  const cutoffTime = await resolveUrgentCutoff();
  const cutoffReached = istMinutesOfDay(date) >= parseCutoffTime(cutoffTime)[0] * 60 + parseCutoffTime(cutoffTime)[1];
  const minDaysFromNow = cutoffReached ? 2 : 1;
  const maxDaysFromNow = 2;
  const today = todayIST(date);
  return {
    minDaysFromNow,
    maxDaysFromNow,
    cutoffReached,
    cutoffTime,
    earliestDate: addDays(today, minDaysFromNow),
    latestDate:   addDays(today, maxDaysFromNow),
  };
}

/**
 * Normalize a scheduledDate value (Date | 'YYYY-MM-DD' | ISO string) to a
 * plain 'YYYY-MM-DD' calendar string. Mirrors how the controllers persist it:
 * `new Date('YYYY-MM-DD')` → UTC midnight → the UTC date part is the intent.
 * Returns null when the value is unparseable.
 */
function toDateString(scheduledDate) {
  if (scheduledDate == null) return null;
  if (scheduledDate instanceof Date) {
    if (isNaN(scheduledDate.getTime())) return null;
    // Dates created via new Date('YYYY-MM-DD') land on UTC midnight.
    return scheduledDate.toISOString().slice(0, 10);
  }
  const str = String(scheduledDate);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(date.getTime())) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Validate a URGENT booking's scheduledDate against the eligibility window.
 * @param {Date|string} scheduledDate
 * @param {Date} [now] - instant for cutoff evaluation (defaults to now)
 * @returns {Promise<{ valid: boolean, minDaysFromNow?: number, maxDaysFromNow?: number, cutoffReached?: boolean, cutoffTime?: string, earliestDate?: string, latestDate?: string, message?: string }>}
 */
async function validateUrgentDate(scheduledDate, now = new Date()) {
  const dateStr = toDateString(scheduledDate);
  if (!dateStr) {
    return { valid: false, message: 'Please provide a valid ceremony date (YYYY-MM-DD).' };
  }

  const win = await getUrgentWindow(now);

  if (dateStr < win.earliestDate) {
    if (win.cutoffReached) {
      return {
        valid: false, ...win,
        message: `It is past ${formatTimeLabel(win.cutoffTime)} — urgent bookings can no longer be scheduled for tomorrow. The earliest available date is ${formatDateLabel(win.earliestDate)} (day after tomorrow).`,
      };
    }
    return {
      valid: false, ...win,
      message: 'Urgent bookings cannot be scheduled for today. The earliest available date is tomorrow (' + formatDateLabel(win.earliestDate) + ').',
    };
  }

  if (dateStr > win.latestDate) {
    return {
      valid: false, ...win,
      message: `Urgent bookings are only available ${formatDateLabel(win.earliestDate)} to ${formatDateLabel(win.latestDate)}.`,
    };
  }

  return { valid: true, ...win, message: '' };
}

module.exports = {
  TIMEZONE,
  DEFAULT_CUTOFF,
  parseCutoffTime,
  resolveUrgentCutoff,
  formatTimeLabel,
  dateStrInTimezone,
  todayIST,
  istMinutesOfDay,
  isUrgentCutoffReached,
  addDays,
  formatDateLabel,
  getUrgentWindow,
  toDateString,
  validateUrgentDate,
};