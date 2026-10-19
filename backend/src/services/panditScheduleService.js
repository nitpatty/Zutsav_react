/**
 * panditScheduleService — the SINGLE authoritative source for
 * "what does a Pandit's calendar look like on a given day?".
 *
 * It centralises four things that were previously scattered or missing:
 *
 *   1. DAY KEYS. A Booking's calendar day is the UTC date part of
 *      `scheduledDate`, because the app persists it as `new Date('YYYY-MM-DD')`
 *      (UTC midnight). This mirrors utils/bookingDateRules.toDateString() and
 *      the frontend's utils/bookingDateRules.js, so the SAME string day is
 *      derived on the server, in the browser and in tests — no device-timezone
 *      off-by-one. (`scheduledTime` is stored as a plain local wall-clock
 *      string such as "10:00" or "10:00 AM".)
 *
 *   2. OCCUPANCY. Which booking statuses actually reserve the Pandit's time.
 *      Derived from the existing `getMyDashboard` ACTIVE_STATUSES list —
 *      `pandit_assigned | pandit_accepted | completion_requested`.
 *      Cancelled / rejected (pending_reassignment) / refunded / closed release
 *      the slot; `paid` bookings have no pandit yet; `completed` ceremonies are
 *      over. Nothing new is invented here.
 *
 *   3. TIME CONFLICTS. `findConflictingBooking()` returns the first existing
 *      occupying booking whose [start, end) interval overlaps a proposed one.
 *      Duration comes from the Pooja (durationValue/durationUnit), exactly like
 *      booking.controller.js#computeUnlockTime. When a Pooja has no duration,
 *      the booking occupies a minimum of one minute so two bookings at the same
 *      time still collide — no travel/preparation buffer is added because the
 *      application defines none.
 *
 *   4. SERIALISATION. A single, minimal, pandit-facing shape that never leaks
 *      customer contact details or financial internals.
 *
 * CONCURRENCY
 * -----------
 * `withPanditDateLock()` serialises any read-check-write for one Pandit on one
 * calendar day inside this Node process, so two simultaneous assign/accept
 * requests cannot both pass an availability check before either writes. This
 * matches the existing in-process locking style (checkout idempotency,
 * panditCancellationService) and avoids introducing a new infrastructure
 * dependency. It is a single-process guarantee (see server.js).
 */

const Booking = require('../models/Booking');
const Pandit = require('../models/Pandit');
const { toDateString, addDays } = require('../utils/bookingDateRules');
const notificationService = require('../utils/notificationService');

/** Booking statuses that reserve the Pandit's time slot. */
const OCCUPYING_BOOKING_STATUSES = ['pandit_assigned', 'pandit_accepted', 'completion_requested'];

/**
 * Statuses relevant to the Pandit's calendar panel. Occupying statuses plus
 * `completed` (shown for past dates as history, never as an occupancy).
 */
const CALENDAR_RELEVANT_STATUSES = [...OCCUPYING_BOOKING_STATUSES, 'completed'];

/** Degenerate-interval guard when a Pooja has no duration. Not a buffer. */
const MIN_OCCUPIED_MINUTES = 1;

/**
 * How far back to look for a multi-day booking that started on an earlier date
 * and spills into the day being checked. Pooja.durationValue is capped at 30.
 */
const MAX_MULTIDAY_LOOKBACK_DAYS = 31;

/** 'YYYY-MM-DD' → weekday (0=Sun..6=Sat), timezone-independent (UTC parts). */
function dayOfWeekFromKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole-day offset between two 'YYYY-MM-DD' keys (b - a). */
function dayOffset(aKey, bKey) {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/**
 * Parse a stored `scheduledTime` into minutes-since-midnight.
 * Accepts "HH:mm", "HH:mm:ss" and 12-hour "h:mm AM/PM". Returns null when the
 * value cannot be interpreted (such a booking is skipped, never assumed free).
 */
function parseTimeToMinutes(value) {
  if (value == null) return null;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3] ? m[3].toUpperCase() : null;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Duration of a booking in minutes, from its Pooja. Mirrors
 * booking.controller.js#computeUnlockTime. Returns null when unknown.
 */
function durationMinutesFromPooja(pooja) {
  if (!pooja || !pooja.durationValue || !pooja.durationUnit) return null;
  const value = Number(pooja.durationValue);
  if (!Number.isFinite(value) || value <= 0) return null;
  return pooja.durationUnit === 'days' ? value * 24 * 60 : value * 60;
}

/** Minutes the booking occupies, floored at MIN_OCCUPIED_MINUTES. */
function occupiedMinutes(durationMinutes) {
  const value = Number(durationMinutes);
  return Number.isFinite(value) && value > 0 ? value : MIN_OCCUPIED_MINUTES;
}

/**
 * Minimal, pandit-authorized projection of a booking for the calendar panel.
 * Deliberately excludes phone, address, email and all financial fields.
 */
function serializeBookingForPandit(booking, pooja) {
  const dateKey = toDateString(booking.scheduledDate);
  const startMinutes = parseTimeToMinutes(booking.scheduledTime);
  const durationMinutes = durationMinutesFromPooja(pooja || booking.poojaId);
  return {
    _id: String(booking._id),
    bookingNumber: booking.bookingNumber || null,
    status: booking.status,
    scheduledDate: booking.scheduledDate,
    dateKey,
    scheduledTime: booking.scheduledTime || null,
    startMinutes,
    endMinutes: startMinutes == null ? null : startMinutes + occupiedMinutes(durationMinutes),
    durationMinutes,
    poojaName: (pooja || booking.poojaId)?.name || null,
    customerName: booking.userDetails?.name || null,
    language: booking.language || null,
    actionable: booking.status === 'pandit_assigned',
  };
}

/**
 * Base availability for one calendar day from the Pandit's own schedule
 * configuration. Full port of the Pandit Dashboard MiniCalendar rule, but
 * evaluated on timezone-safe date keys:
 *   leave > special(unavailable|custom) > weekly(off|limited|available) >
 *   legacy availabilitySlots > none
 */
function dayAvailability(pandit, dateKey) {
  const weekday = dayOfWeekFromKey(dateKey);

  const onLeave = (pandit.blockedPeriods || []).some((b) => {
    const start = toDateString(b.startDate);
    const end = toDateString(b.endDate);
    return start && end && dateKey >= start && dateKey <= end;
  });
  if (onLeave) return 'leave';

  const special = (pandit.specialDates || []).find((s) => toDateString(s.date) === dateKey);
  if (special) return special.type === 'unavailable' ? 'unavailable' : 'special';

  if (pandit.weeklySchedule && pandit.weeklySchedule.length > 0) {
    const sched = pandit.weeklySchedule.find((d) => d.dayOfWeek === weekday);
    if (!sched || !sched.enabled) return 'off';
    if (sched.slots && sched.slots.length === 1) {
      const start = parseTimeToMinutes(sched.slots[0].start);
      const end = parseTimeToMinutes(sched.slots[0].end);
      // Existing rule: a single slot shorter than 4 hours is "Limited".
      if (start != null && end != null && end - start < 240) return 'limited';
    }
    return 'available';
  }

  const hasLegacySlot = (pandit.availabilitySlots || []).some((slot) => {
    if (!slot.isActive) return false;
    const start = toDateString(slot.startDate);
    const end = toDateString(slot.endDate);
    if (!start || !end || dateKey < start || dateKey > end) return false;
    return !slot.daysOfWeek || slot.daysOfWeek.length === 0 || slot.daysOfWeek.includes(weekday);
  });
  if (hasLegacySlot) return 'available';

  return 'none';
}

/**
 * Final visual status for a calendar cell given base availability and whether
 * an occupying booking exists. Documented precedence:
 *   - booking that changes availability (green/off/none) → 'blue'
 *   - limited/special (yellow) + booking            → 'special'/'limited' (dot)
 *   - leave/unavailable (red) + booking             → red (conflict indicator)
 */
function resolveDayStatus(availability, hasOccupyingBooking) {
  if (!hasOccupyingBooking) return availability;
  if (availability === 'available' || availability === 'off' || availability === 'none') return 'blue';
  return availability;
}

/**
 * Build the per-day calendar for a Pandit over an inclusive date-key range.
 * `bookings` may contain any CALENDAR_RELEVANT_STATUSES records.
 */
function buildCalendarDays(pandit, fromKey, toKey, bookings, excludeStatuses = []) {
  const days = [];
  const byDay = new Map();
  for (const booking of bookings) {
    if (excludeStatuses.includes(booking.status)) continue;
    const key = toDateString(booking.scheduledDate);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(booking);
  }

  let cursor = fromKey;
  // Hard cap mirrors the controller's range guard; prevents accidental loops.
  for (let i = 0; i <= 370 && cursor <= toKey; i += 1) {
    const availability = dayAvailability(pandit, cursor);
    const dayBookings = (byDay.get(cursor) || [])
      .map((b) => serializeBookingForPandit(b, b.poojaId))
      .sort((a, b) => {
        if (a.startMinutes == null && b.startMinutes == null) return 0;
        if (a.startMinutes == null) return 1;
        if (b.startMinutes == null) return -1;
        return a.startMinutes - b.startMinutes;
      });

    const occupying = dayBookings.filter((b) => OCCUPYING_BOOKING_STATUSES.includes(b.status));
    const hasBooking = occupying.length > 0;
    const scheduleConflict =
      hasBooking && (availability === 'leave' || availability === 'unavailable');

    days.push({
      date: cursor,
      availability,
      status: resolveDayStatus(availability, hasBooking),
      hasBooking,
      bookingCount: dayBookings.length,
      occupyingCount: occupying.length,
      scheduleConflict,
      bookings: dayBookings,
    });

    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * First existing occupying booking for `panditId` whose time interval overlaps
 * the proposed [scheduledTime, scheduledTime + duration). Returns a minimal
 * conflict descriptor, or null. `excludeBookingId` skips the booking being
 * assigned/accepted so a booking never conflicts with itself.
 */
async function findConflictingBooking({
  panditId,
  dateKey,
  scheduledTime,
  durationMinutes,
  excludeBookingId = null,
}) {
  const start = parseTimeToMinutes(scheduledTime);
  if (start == null || !dateKey) return null;

  const end = start + occupiedMinutes(durationMinutes);
  const lastDayOffset = Math.floor((end - 1) / 1440);
  const fromKey = addDays(dateKey, -MAX_MULTIDAY_LOOKBACK_DAYS);
  const toKey = addDays(dateKey, lastDayOffset);

  const query = {
    panditId,
    status: { $in: OCCUPYING_BOOKING_STATUSES },
    scheduledDate: { $gte: new Date(fromKey), $lte: new Date(toKey) },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const candidates = await Booking.find(query)
    .populate('poojaId', 'name durationValue durationUnit')
    .select('bookingNumber status scheduledDate scheduledTime poojaId userDetails.name')
    .lean();

  let conflict = null;
  let conflictStart = Infinity;
  for (const candidate of candidates) {
    const otherKey = toDateString(candidate.scheduledDate);
    const otherStart = parseTimeToMinutes(candidate.scheduledTime);
    if (!otherKey || otherStart == null) continue;

    const otherStartAbs = dayOffset(dateKey, otherKey) * 1440 + otherStart;
    const otherEndAbs = otherStartAbs + occupiedMinutes(durationMinutesFromPooja(candidate.poojaId));

    if (otherStartAbs < end && start < otherEndAbs && otherStartAbs < conflictStart) {
      conflictStart = otherStartAbs;
      conflict = candidate;
    }
  }

  if (!conflict) return null;
  return {
    bookingId: String(conflict._id),
    bookingNumber: conflict.bookingNumber || null,
    poojaName: conflict.poojaId?.name || null,
    status: conflict.status,
    dateKey: toDateString(conflict.scheduledDate),
    scheduledTime: conflict.scheduledTime || null,
    startMinutes: parseTimeToMinutes(conflict.scheduledTime),
    durationMinutes: durationMinutesFromPooja(conflict.poojaId),
  };
}

/**
 * Human-readable conflict message for Pandit/Admin responses. Explicitly says
 * that a different time on the same date is fine, so the rejection is
 * understood as a real overlap, not a same-day restriction.
 */
function describeConflict(conflict, dateKey) {
  const time = conflict.scheduledTime || 'the scheduled time';
  const pooja = conflict.poojaName ? `"${conflict.poojaName}" ` : '';
  const ref = conflict.bookingNumber ? ` (#${conflict.bookingNumber})` : '';
  const when = conflict.dateKey || dateKey;
  return `Time conflict on ${when}: another booking is already scheduled at ${time} — ${pooja}${ref}. ` +
    'Bookings at different times on the same day are allowed; only overlapping times are blocked.';
}

/**
 * Serialise every read-check-write touching one Pandit on one calendar day.
 * In-process promise chain: callers run one at a time, so a second request
 * observes the first request's committed write.
 */
const _locks = new Map();
function withPanditDateLock(panditId, dateKey, fn) {
  const key = `${String(panditId)}|${String(dateKey)}`;
  const previous = _locks.get(key) || Promise.resolve();
  const run = previous.then(
    () => fn(),
    () => fn(),
  );
  const guard = run.then(
    () => {},
    () => {},
  );
  _locks.set(key, guard);
  guard.then(() => {
    if (_locks.get(key) === guard) _locks.delete(key);
  });
  return run;
}

/**
 * Push a lightweight `pandit_schedule_changed` signal to a Pandit's sockets so
 * an open calendar refetches authoritative data without a page reload. This
 * reuses the existing Socket.IO server and user-room convention; it is not a
 * persisted notification. Fire-and-forget: never throws to the caller.
 */
async function notifyPanditScheduleChanged({ panditId, alsoPanditId = null, bookingId = null, dateKey = null, reason }) {
  try {
    const ids = [...new Set([panditId, alsoPanditId].filter(Boolean).map(String))];
    for (const id of ids) {
      const pandit = await Pandit.findById(id).select('userId').lean();
      if (pandit?.userId) {
        notificationService.emitToUser(pandit.userId, 'pandit_schedule_changed', {
          bookingId: bookingId ? String(bookingId) : null,
          dateKey,
          reason,
        });
      }
    }
  } catch {
    /* realtime signal is best-effort; REST refetch remains authoritative */
  }
}

module.exports = {
  OCCUPYING_BOOKING_STATUSES,
  CALENDAR_RELEVANT_STATUSES,
  MIN_OCCUPIED_MINUTES,
  MAX_MULTIDAY_LOOKBACK_DAYS,
  dayOfWeekFromKey,
  dayOffset,
  parseTimeToMinutes,
  durationMinutesFromPooja,
  occupiedMinutes,
  serializeBookingForPandit,
  dayAvailability,
  resolveDayStatus,
  buildCalendarDays,
  findConflictingBooking,
  describeConflict,
  withPanditDateLock,
  notifyPanditScheduleChanged,
};
