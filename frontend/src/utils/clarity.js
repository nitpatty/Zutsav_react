/**
 * Microsoft Clarity — initialization and tracking utilities.
 *
 * All Clarity interaction is isolated here. No other file should reference
 * window.clarity directly.
 *
 * Privacy model:
 *  - "Balance" mode (Clarity default): all text-input values are masked.
 *  - For extra-sensitive elements (OTP, payment, KYC, Aadhaar, PAN, UPI),
 *    add data-clarity-mask="True" to the JSX element — Clarity will redact
 *    those from recordings and heatmaps without any code change here.
 *  - Only the internal MongoDB _id is ever sent for user identification.
 *    Email, phone, name, and passwords are never sent.
 */

const PROJECT_ID = process.env.REACT_APP_MICROSOFT_CLARITY_PROJECT_ID;
const IS_DEV = process.env.NODE_ENV === 'development';

function log(...args) {
  if (IS_DEV) console.log('[Analytics]', ...args);
}

function warn(...args) {
  if (IS_DEV) console.warn('[Analytics]', ...args);
}

let initialized = false;

/**
 * Injects the official Microsoft Clarity script asynchronously.
 * Safe to call multiple times — guards against duplicate initialization.
 * Silently skips if REACT_APP_MICROSOFT_CLARITY_PROJECT_ID is not set.
 */
export function initClarity() {
  if (!PROJECT_ID) {
    log('REACT_APP_MICROSOFT_CLARITY_PROJECT_ID not configured — analytics disabled.');
    return;
  }

  // Clarity requires a real domain — localhost triggers 400 from s.clarity.ms/collect.
  // Skip initialization in local development to avoid console noise.
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    log('localhost detected — skipping Clarity (no data collected on local dev).');
    return;
  }

  if (initialized) {
    log('Already initialized — skipping duplicate call.');
    return;
  }

  try {
    /* Official Microsoft Clarity snippet — loads asynchronously, never blocks rendering */
    // eslint-disable-next-line no-unused-expressions
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', PROJECT_ID);

    initialized = true;
    log('Initialized — project ID:', PROJECT_ID);
  } catch (err) {
    warn('Initialization failed:', err);
  }
}

/**
 * Dispatches a call to the Clarity queue/function.
 * The snippet installs a queue before the script loads, so calls made
 * immediately after initClarity() are safely buffered.
 */
function callClarity(method, ...args) {
  if (!PROJECT_ID) return;
  try {
    if (typeof window.clarity === 'function') {
      window.clarity(method, ...args);
    }
  } catch (err) {
    warn(`clarity("${method}") call failed:`, err);
  }
}

/**
 * Tags the current page path so Clarity groups SPA navigations correctly.
 * Called on every React Router location change.
 */
export function trackPageView(pathname) {
  if (!PROJECT_ID) return;
  callClarity('set', 'page', pathname);
  log('Page view tracked:', pathname);
}

/**
 * Associates the Clarity session with the user's internal database ID.
 * Only the MongoDB _id and role are sent — never email, phone, or name.
 *
 * Signature: clarity("identify", customUserId, customSessionId, customPageId, friendlyName)
 * We pass null for session/page/friendly to let Clarity manage those.
 */
export function identifyUser(userId, role) {
  if (!PROJECT_ID || !userId) return;
  try {
    callClarity('identify', String(userId), null, null, null);
    callClarity('set', 'userRole', String(role || 'unknown'));
    log('User identified — id:', userId, 'role:', role);
  } catch (err) {
    warn('User identification failed:', err);
  }
}

/**
 * Called when the user logs out.
 * Clarity sessions are scoped to browser tabs and expire automatically.
 * The next identifyUser() call after login establishes a fresh association.
 */
export function clearUserIdentity() {
  log('User identity cleared — Clarity will treat the next session as anonymous.');
}
