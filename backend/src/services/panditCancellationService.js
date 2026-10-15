/**
 * panditCancellationService — the SINGLE authoritative source of truth for
 * "may the assigned Pandit cancel this booking it has already accepted?".
 *
 * WHY A SEPARATE SERVICE
 * ---------------------
 * This is the first TIME-BASED booking gate in the codebase. Every other
 * booking-date rule (the urgent-booking window, the 3-day normal-booking lead
 * time) is expressed as a CALENDAR-DAY boundary in IST, never as an exact
 * millisecond offset from the ceremony instant. This file deliberately reuses
 * that same convention by consuming the existing primitives exported from
 * src/utils/bookingDateRules.js — no new date library, no new timezone
 * handling, no second source of calendar truth.
 *
 * THE STATE THAT MEANS "PANDIT HAS ACCEPTED"
 * ------------------------------------------
 * `booking.status === 'pandit_accepted'`. This is the project's own
 * authoritative representation, written by acceptBooking()
 * (src/controllers/pandit.controller.js) and gated on by the query filter in
 * both acceptBooking and rejectBooking. It is NOT inferred from any UI label.
 * `pandit_accepted` is also the ONLY accepted-state value in the Booking
 * status enum (see src/models/Booking.js).
 *
 * WHY THE TARGET STATE IS `pending_reassignment`, NOT `cancelled`
 * -------------------------------------------------------------
 * A Pandit cancelling an already-accepted booking does not resolve the
 * customer's booking — it means the customer still needs a service and Admin
 * must arrange a replacement. `pending_reassignment` is the project's
 * existing "awaiting a replacement Pandit" state:
 *   - assignPandit() already accepts it as a source status
 *     (assignableStatuses = paid | pending_reassignment | pandit_assigned),
 *     so the booking becomes eligible for the EXISTING reassignment flow;
 *   - it is already reachable today for customers (a Pandit rejection lands
 *     there), so no new customer-facing status is introduced;
 *   - unlike `cancelled`, it does NOT seed the refund sub-document and does
 *     NOT mark paymentStatus REFUNDED, so customer refund logic is untouched.
 * The booking is deliberately NOT auto-assigned another Pandit — that stays a
 * human/Admin decision, and no automatic reassignment algorithm is introduced.
 *
 * CANCELLATION METADATA — NO NEW FIELDS
 * -------------------------------------
 * The Booking model has exactly ONE cancellation field, `cancelReason`
 * (src/models/Booking.js), and NO cancellation-source/actor field; its
 * auditLog sub-document has `action`, `performedBy`, `performedByName`,
 * `note`, `at` but no role field. Rather than introduce parallel fields, this
 * service reuses both:
 *   - `cancelReason`  carries the Pandit's stated reason;
 *   - `auditLog`      carries action `pandit_cancelled_accepted` with the
 *                      Pandit's user id + name, which is what distinguishes a
 *                      Pandit cancellation from a customer or admin one.
 */

const bookingDateRules = require('../utils/bookingDateRules');

/**
 * Business rule: a Pandit may cancel an accepted booking until 2 days before
 * the scheduled pooja date.
 */
const PANDIT_CANCELLATION_WINDOW_DAYS = 2;

/** The authoritative "Pandit has accepted this booking" state. */
const PANDIT_ACCEPTED_STATUS = 'pandit_accepted';

/** State the booking moves into so Admin can arrange a replacement Pandit. */
const PANDIT_CANCELLATION_TARGET_STATUS = 'pending_reassignment';

/**
 * auditLog action for a Pandit-initiated cancellation of an ACCEPTED booking.
 * Deliberately distinct from the existing `pandit_rejected` action (pre-accept
 * decline) and from `status_changed_to_cancelled` (customer/admin cancel).
 */
const PANDIT_CANCELLED_AUDIT_ACTION = 'pandit_cancelled_accepted';

/** Machine-readable business error codes. */
const PANDIT_CANCELLATION_CODES = {
  NOT_ACCEPTED: 'PANDIT_CANCELLATION_NOT_ACCEPTED',
  WINDOW_CLOSED: 'PANDIT_CANCELLATION_WINDOW_CLOSED',
  NOT_CANCELLABLE: 'PANDIT_CANCELLATION_NOT_CANCELLABLE',
  ALREADY_CANCELLED: 'PANDIT_CANCELLATION_ALREADY_PROCESSED',
  CONFLICT: 'PANDIT_CANCELLATION_CONFLICT',
  REASON_REQUIRED: 'PANDIT_CANCELLATION_REASON_REQUIRED',
};

const MESSAGES = {
  [PANDIT_CANCELLATION_CODES.NOT_ACCEPTED]:
    'Only a booking you have already accepted can be cancelled. Reject it instead if you have not accepted it yet.',
  [PANDIT_CANCELLATION_CODES.NOT_CANCELLABLE]:
    'This booking can no longer be cancelled because it is no longer in an accepted state.',
  [PANDIT_CANCELLATION_CODES.ALREADY_CANCELLED]:
    'This booking has already been processed and can no longer be cancelled.',
  [PANDIT_CANCELLATION_CODES.CONFLICT]:
    'This booking was just updated by another request. Please reload and try again.',
  [PANDIT_CANCELLATION_CODES.REASON_REQUIRED]:
    'Cancellation reason is required and must be at least 10 characters.',
};

/**
 * Controlled business error. Carries an HTTP `status` and a string `code`, so
 * the global error handler (src/app.js) renders a clean JSON business response
 * instead of a 500. Never a raw throw of a generic Error.
 */
class PanditCancellationError extends Error {
  constructor(message, { code, status = 400 } = {}) {
    super(message);
    this.name = 'PanditCancellationError';
    this.status = status;
    if (code) this.code = code;
  }
}

/**
 * THE DATE RULE — calendar-day boundary, in IST, on 'YYYY-MM-DD' strings.
 *
 * Chosen interpretation: CALENDAR-DAY CUTOFF, not an exact 48-hour offset.
 * This matches every existing booking-date eligibility rule in the project
 * (getUrgentWindow / validateUrgentDate in src/utils/bookingDateRules.js, and
 * the 3-day normal-booking lead time), which all compare whole calendar days
 * rather than instants.
 *
 * `scheduledDate` is persisted via `new Date('YYYY-MM-DD')`, i.e. UTC
 * midnight, so it is normalised back to its UTC calendar day with
 * toDateString() and compared as a string against todayIST(). This avoids the
 * UTC-midnight / IST-mismatch drift that raw Date comparison would introduce.
 *
 *   pooja 30 Sep  → cutoff 28 Sep  → cancellable on 27 Sep, NOT on 28 Sep
 *
 * @param {Date|string} scheduledDate
 * @param {Date} [now]
 * @returns {{ scheduledDateStr, cutoffDateStr, todayStr, daysUntil, cancellable, windowClosedLabel }}
 */
function getPanditCancellationWindow(scheduledDate, now = new Date()) {
  const scheduledDateStr = bookingDateRules.toDateString(scheduledDate);
  const todayStr = bookingDateRules.todayIST(now);

  if (!scheduledDateStr) {
    return {
      scheduledDateStr: null,
      cutoffDateStr: null,
      todayStr,
      daysUntil: null,
      cancellable: false,
      windowClosedLabel: null,
    };
  }

  const cutoffDateStr = bookingDateRules.addDays(
    scheduledDateStr,
    -PANDIT_CANCELLATION_WINDOW_DAYS
  );

  // Whole calendar days between today and the ceremony. Date.UTC is
  // 0-indexed on month, so the 'MM' segment is decremented explicitly; the
  // arithmetic stays in UTC calendar space to match bookingDateRules.addDays.
  const [sy, sm, sd] = scheduledDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const daysUntil = Math.round(
    (Date.UTC(sy, sm - 1, sd) - Date.UTC(ty, tm - 1, td)) / (24 * 60 * 60 * 1000)
  );

  return {
    scheduledDateStr,
    cutoffDateStr,
    todayStr,
    daysUntil,
    // Allowed only while strictly before the cutoff day.
    cancellable: todayStr < cutoffDateStr,
    windowClosedLabel: bookingDateRules.formatDateLabel(cutoffDateStr),
  };
}

function windowClosedMessage(window) {
  const when = window?.windowClosedLabel
    ? ` as of ${window.windowClosedLabel}`
    : '';
  return (
    `Cancellation is no longer available for this booking${when} — ` +
    `a Pandit must cancel an accepted booking at least ` +
    `${PANDIT_CANCELLATION_WINDOW_DAYS} days before the scheduled date.`
  );
}

/**
 * Evaluates whether a cancellation is permitted. Pure — no writes, no throws.
 * Every rejection reason is explicit and stable so the UI and the tests can
 * assert on it.
 *
 * @param {object} booking  Booking document (needs status, panditId, scheduledDate)
 * @returns {{ allowed: boolean, code?: string, message?: string, window: object }}
 */
function evaluatePanditCancellation(booking) {
  const window = getPanditCancellationWindow(booking?.scheduledDate);

  // 1. Booking exists and the Pandit has actually ACCEPTED it. The accepted
  //    state is the authoritative gate; `cancelled`/`refunded`/`closed`/
  //    `completed` and every other status are all rejected by this branch.
  if (booking?.status !== PANDIT_ACCEPTED_STATUS) {
    const isTerminal = ['cancelled', 'refunded', 'closed', 'completed'].includes(booking?.status);
    return {
      allowed: false,
      code: isTerminal
        ? PANDIT_CANCELLATION_CODES.ALREADY_CANCELLED
        : PANDIT_CANCELLATION_CODES.NOT_ACCEPTED,
      message: isTerminal
        ? MESSAGES[PANDIT_CANCELLATION_CODES.ALREADY_CANCELLED]
        : MESSAGES[PANDIT_CANCELLATION_CODES.NOT_ACCEPTED],
      window,
    };
  }

  // 2. The booking must still carry a scheduled date we can evaluate.
  if (!window.scheduledDateStr) {
    return {
      allowed: false,
      code: PANDIT_CANCELLATION_CODES.NOT_CANCELLABLE,
      message: MESSAGES[PANDIT_CANCELLATION_CODES.NOT_CANCELLABLE],
      window,
    };
  }

  // 3. The 2-day restricted period has not begun.
  if (!window.cancellable) {
    return {
      allowed: false,
      code: PANDIT_CANCELLATION_CODES.WINDOW_CLOSED,
      message: windowClosedMessage(window),
      window,
    };
  }

  return { allowed: true, window };
}

/**
 * The gate. Throws PanditCancellationError when the cancellation is not
 * permitted. Callers MUST invoke this BEFORE performing any mutation so a
 * rejected cancellation can never leave partial state behind.
 */
function assertPanditCancellationAllowed(booking) {
  const verdict = evaluatePanditCancellation(booking);
  if (verdict.allowed) return verdict;
  throw new PanditCancellationError(verdict.message, {
    code: verdict.code,
    // A booking that has already moved on is a conflict, not a bad request.
    status: verdict.code === PANDIT_CANCELLATION_CODES.ALREADY_CANCELLED ? 409 : 400,
  });
}

/**
 * Minimum-viable cancellation reason, matching the convention already
 * established by rejectBooking (which requires >= 10 characters). Reuses the
 * existing `cancelReason` field; no new reason taxonomy is invented.
 */
const PANDIT_CANCELLATION_REASON_MIN_LENGTH = 10;

function normalizeCancellationReason(reason) {
  return typeof reason === 'string' ? reason.trim() : '';
}

function assertCancellationReason(reason) {
  const trimmed = normalizeCancellationReason(reason);
  if (trimmed.length < PANDIT_CANCELLATION_REASON_MIN_LENGTH) {
    throw new PanditCancellationError(
      MESSAGES[PANDIT_CANCELLATION_CODES.REASON_REQUIRED],
      { code: PANDIT_CANCELLATION_CODES.REASON_REQUIRED }
    );
  }
  return trimmed;
}

/** 24-char hex ObjectId shape check. A malformed booking id is a client error
 *  (400), not a server error — without this guard `Booking.findById` throws a
 *  Mongoose CastError that the global handler would surface as a 500.
 *  Scoped to this feature rather than a new shared util. */
const MONGO_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
function isValidBookingId(bookingId) {
  return typeof bookingId === 'string' && MONGO_OBJECT_ID_RE.test(bookingId);
}

module.exports = {
  PANDIT_CANCELLATION_WINDOW_DAYS,
  PANDIT_CANCELLATION_REASON_MIN_LENGTH,
  PANDIT_ACCEPTED_STATUS,
  PANDIT_CANCELLATION_TARGET_STATUS,
  PANDIT_CANCELLED_AUDIT_ACTION,
  PANDIT_CANCELLATION_CODES,
  PANDIT_CANCELLATION_MESSAGES: MESSAGES,
  PanditCancellationError,
  getPanditCancellationWindow,
  evaluatePanditCancellation,
  assertPanditCancellationAllowed,
  normalizeCancellationReason,
  assertCancellationReason,
  isValidBookingId,
};
