/**
 * panditEligibilityService — the SINGLE authoritative source of truth for
 * "is this Pandit currently allowed to receive a booking assignment?".
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `Pandit` carries two independent, parallel approval fields that are written
 * by two different admin routes and can drift apart:
 *
 *   - `status`      enum: pending | under_review | approved | rejected |
 *                            suspended | reupload_required
 *                  written by PATCH /api/admin/pandits/:id/approve
 *                  (the legacy route). NOTE: `status: 'approved'` is also set
 *                  at *signup* for OTP-registered pandits
 *                  (auth.controller.js) purely so they can reach their
 *                  dashboard — it is NOT evidence of KYC approval.
 *
 *   - `kycStatus`   enum: not_submitted | submitted | approved | rejected |
 *                            reupload_required
 *                  written by PATCH /api/admin/pandits/:id/kyc (the reviewed
 *                  KYC flow). Approval here does NOT touch `status`.
 *
 * The only field that *both* approval paths set to `true`, that *every*
 * non-approval path (KYC reject, KYC reupload-required, legacy reject,
 * legacy suspend, signup) sets to `false`, and that the project already uses
 * as the eligibility gate on its "eligible pandits for assignment" query
 * (getAvailablePandits) is `canReceiveBookings`.
 *
 * `canReceiveBookings` is therefore the derived, authoritative eligibility
 * flag. It is deliberately NOT inferred from profile completeness, account
 * existence, phone verification, registration, document upload, KYC
 * submission, or booking history.
 *
 * NOTE ON `kycStatus`: it is intentionally NOT required to be 'approved'
 * here. The legacy approve route sets `canReceiveBookings: true` without ever
 * writing `kycStatus`, so requiring `kycStatus === 'approved'` would break the
 * legacy-approved cohort that the project already treats as eligible.
 * `canReceiveBookings` is the single gate; `kycStatus` is surfaced for UI
 * labelling only.
 *
 * USAGE — every booking-assignment path must call assertPanditEligibleForBooking
 * BEFORE any write (booking mutation, assignment status, timestamps, audit
 * entries, notifications).
 */

/** Machine-readable business error code. Follows the existing `code` field
 *  convention already used by the project (see pandit.controller.js, which
 *  returns `code: 'OTP_REQUIRED'` alongside `success: false`). */
const PANDIT_KYC_NOT_APPROVED = 'PANDIT_KYC_NOT_APPROVED';

/** Reused verbatim from the pre-existing assignPandit check so that
 *  "pandit missing" and "pandit not approved" keep their original wording. */
const PANDIT_NOT_APPROVED_MESSAGE = 'Pandit not found or not approved';

const PANDIT_KYC_NOT_APPROVED_MESSAGE =
  'Booking cannot be assigned to this Pandit because their KYC is not approved.';

/**
 * Controlled business error. Carries an HTTP `status` and a string `code` so
 * the global error handler (src/app.js) renders a clean JSON body instead of a
 * 500. Never a raw throw of a generic Error.
 */
class PanditEligibilityError extends Error {
  constructor(message, { code, status = 400 } = {}) {
    super(message);
    this.name = 'PanditEligibilityError';
    this.status = status;
    if (code) this.code = code;
  }
}

/**
 * The authoritative rule. Both conditions must hold.
 *
 * 1. `status === 'approved'`  — pre-existing rule, kept unchanged.
 * 2. `canReceiveBookings === true` — the KYC/approval eligibility flag.
 *
 * Rule 2 is strictly narrower than the pre-existing rule, so this can only
 * reject assignments that were never valid; it cannot block an assignment
 * that previously succeeded.
 */
function isPanditEligibleForBooking(pandit) {
  if (!pandit) return false;
  if (pandit.status !== 'approved') return false;
  return pandit.canReceiveBookings === true;
}

/**
 * Explains *why* a pandit is ineligible, for admin-facing messages. Returns
 * null when the pandit is eligible.
 */
function getPanditIneligibilityReason(pandit) {
  if (!pandit) return 'not_found';
  if (pandit.status !== 'approved') return 'not_approved';
  if (pandit.canReceiveBookings !== true) return 'kyc_not_approved';
  return null;
}

/**
 * The gate. Throws PanditEligibilityError when the pandit may not receive a
 * booking. Callers MUST invoke this before performing any mutation.
 */
function assertPanditEligibleForBooking(pandit) {
  const reason = getPanditIneligibilityReason(pandit);
  if (reason === null) return pandit;

  if (reason === 'kyc_not_approved') {
    throw new PanditEligibilityError(PANDIT_KYC_NOT_APPROVED_MESSAGE, {
      code: PANDIT_KYC_NOT_APPROVED,
    });
  }

  // not_found / not_approved — preserve the original wording and status.
  throw new PanditEligibilityError(PANDIT_NOT_APPROVED_MESSAGE, {});
}

/** 24-char hex ObjectId shape check. A malformed id is a client error (400),
 *  not a server error — without this guard `Pandit.findById` throws a CastError
 *  that surfaces as a 500. */
const MONGO_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
function isValidPanditId(panditId) {
  return typeof panditId === 'string' && MONGO_OBJECT_ID_RE.test(panditId);
}

/**
 * THE complete gate: resolves the pandit and enforces eligibility in one
 * call, so no assignment path can accidentally look a pandit up without also
 * validating it. Returns the Pandit document on success; throws
 * PanditEligibilityError otherwise. Performs no writes.
 */
async function loadEligiblePanditForBooking(panditId) {
  if (!isValidPanditId(panditId)) {
    throw new PanditEligibilityError(PANDIT_NOT_APPROVED_MESSAGE, {});
  }
  const Pandit = require('../models/Pandit');
  const pandit = await Pandit.findById(panditId);
  assertPanditEligibleForBooking(pandit);
  return pandit;
}

/**
 * Mongo query fragment matching exactly the set of pandits that
 * assertPanditEligibleForBooking will accept. Spread into listing/search
 * queries so a client can never even *see* a pandit it could not assign.
 *
 * This is UI convenience only — it is NOT the security boundary. The
 * authoritative boundary is assertPanditEligibleForBooking.
 */
const PANDIT_BOOKING_ELIGIBILITY_FILTER = {
  status: 'approved',
  canReceiveBookings: true,
};

/**
 * Annotates a pandit payload with the eligibility verdict so admin UIs can
 * mark an ineligible pandit as "KYC not approved" and disable the action
 * without the client having to re-derive the rule.
 */
function withBookingEligibility(panditDoc) {
  const obj = panditDoc?.toObject ? panditDoc.toObject() : { ...panditDoc };
  obj.isEligibleForBooking = isPanditEligibleForBooking(panditDoc);
  return obj;
}

module.exports = {
  PANDIT_KYC_NOT_APPROVED,
  PANDIT_KYC_NOT_APPROVED_MESSAGE,
  PANDIT_NOT_APPROVED_MESSAGE,
  PANDIT_BOOKING_ELIGIBILITY_FILTER,
  PanditEligibilityError,
  isPanditEligibleForBooking,
  getPanditIneligibilityReason,
  assertPanditEligibleForBooking,
  loadEligiblePanditForBooking,
  isValidPanditId,
  withBookingEligibility,
};
