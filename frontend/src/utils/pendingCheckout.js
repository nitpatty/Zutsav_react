// Generic "resume after login" storage for any checkout flow (booking today;
// marketplace/temple/astrology/donation checkouts can reuse the same shape
// later via their own `type`). Session-scoped on purpose — a pending
// checkout should not silently resurrect in a different browser session.

const KEY = 'zutsav_pending_checkout';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h — stale attempts should not auto-resume/auto-charge later

export function savePendingCheckout(type, payload, resumePath) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ type, payload, resumePath, savedAt: Date.now() }));
  } catch { /* storage unavailable (private mode, quota) — resume simply won't happen */ }
}

/** Returns the saved entry if present, fresh, and matching `type` — otherwise null. */
export function getPendingCheckout(type) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (type && parsed.type !== type) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  try { sessionStorage.removeItem(KEY); } catch { /* non-fatal */ }
}
