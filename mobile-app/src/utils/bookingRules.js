/**
 * Booking rules shared by the User booking screens.
 *
 * USER_CANCELLABLE_STATUSES mirrors the authoritative server rule in
 * backend/src/controllers/booking.controller.js (cancelBooking →
 * USER_CANCELLABLE_STATUSES). The server rejects every other status with a 400,
 * so the app must not offer Cancel for them. Keep the two lists identical;
 * `completion_requested` is deliberately NOT included.
 */
export const USER_CANCELLABLE_STATUSES = [
  'pending_payment',
  'paid',
  'pandit_assigned',
  'pandit_accepted',
  'pending_reassignment',
];

export const canUserCancel = (status) => USER_CANCELLABLE_STATUSES.includes(status);
