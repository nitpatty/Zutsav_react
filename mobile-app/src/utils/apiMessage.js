// What to show when a request fails. The backend's own `message` is English text we cannot translate on the client, so
// a usable one is shown as-is (it can be more specific than any fallback); when the response has no usable message —
// offline, timeout, empty body, HTML error page — the caller's LOCALIZED fallback is shown instead.
//
// This only chooses text. It never inspects or changes the status handling around it, and it is not used for
// checkout/booking machine codes (those keep their own handling).
const MAX_LENGTH = 300;

export function apiErrorMessage(err, fallback) {
  const message = err?.response?.data?.message;
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (trimmed && trimmed.length <= MAX_LENGTH && !/[<>]/.test(trimmed)) return trimmed;
  }
  return fallback;
}
