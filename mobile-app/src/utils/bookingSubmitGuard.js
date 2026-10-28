/**
 * Client-side guard for "create the booking and start the payment" (POST /api/bookings/create-phonepe-order).
 *
 * That endpoint creates a Booking + ledger row and has NO idempotency key, so a second call is a second booking.
 * This guard stops the app from sending one by accident:
 *   busy      a request is already in flight (rapid taps) — nothing is sent
 *   existing  the booking was already created in this screen — the caller re-presents ITS payment prompt instead
 *   uncertain an earlier request ended without any server answer (timeout / offline): the booking MAY exist, so the
 *             caller must tell the user to check My Bookings and may continue only after an explicit confirmation
 *             (acknowledgeUncertain)
 * What it cannot do: it is in-memory and per screen instance, so it makes no promise about a second device or a
 * reinstall, and it cannot make the server's creation atomic. The real fix for the "timeout after the server created the
 * booking" race is a server-side idempotency key — a separate, unapproved backend task.
 */
export function createBookingSubmitGuard() {
  let inFlight = false;
  let created = null;
  let uncertain = false;

  return {
    /** `create` performs the request and resolves with what the caller needs to re-present the payment prompt. */
    async submit(create) {
      if (inFlight) return { status: 'busy' };
      if (created) return { status: 'existing', created };
      if (uncertain) return { status: 'uncertain' };
      inFlight = true;
      try {
        const result = await create();
        if (result && result.created) created = result.created;
        return { status: 'done', result };
      } catch (err) {
        // A response (any HTTP status) means the server answered and rejected it. No response = unknown outcome.
        if (!err?.response) uncertain = true;
        return { status: 'failed', error: err, uncertain: !err?.response };
      } finally {
        inFlight = false;
      }
    },
    acknowledgeUncertain() { uncertain = false; },
    isBusy: () => inFlight,
    hasCreated: () => !!created,
  };
}
