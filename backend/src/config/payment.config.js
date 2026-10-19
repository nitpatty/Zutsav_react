/**
 * Payment mode + PhonePe credential resolution — single source of truth.
 *
 * Three explicit modes exist; nothing is ever selected implicitly from a
 * hardcoded credential or from "whatever happens to be in the repo":
 *
 *   mock     Local payment simulation. No gateway HTTP call, no credentials,
 *            no real money. Used by local development and automated tests to
 *            drive the booking/checkout lifecycle end to end. Structurally
 *            impossible in production: `PAYMENT_MODE=mock` fails startup and
 *            the mock routes are never mounted.
 *   sandbox  Real PhonePe sandbox (preprod) integration using EXPLICITLY
 *            configured sandbox credentials. No real money moves.
 *   live     Real PhonePe production integration using EXPLICITLY configured
 *            production credentials. Real money moves.
 *
 * Mode precedence (highest first) — mirrors the existing
 * `settingsService.get(field, envFallback)` architecture:
 *
 *   1. PAYMENT_MODE env var                 (canonical, new; mock only lives here)
 *   2. SystemSettings.phonepeEnv            (existing admin setting; non-production only)
 *   3. PHONEPE_ENV env var                  (existing: uat/sandbox/test -> sandbox, prod -> live)
 *   4. default                              (sandbox outside production)
 *
 * Production never guesses: if neither PAYMENT_MODE nor PHONEPE_ENV is set,
 * startup fails instead of silently falling back to sandbox/test credentials.
 *
 * Credentials (merchant id / salt key / salt index) are ALWAYS read from
 * System Settings or the environment. There are no built-in fallbacks — a
 * missing credential is a hard error, never a silent default.
 */

const { NODE_ENV, readEnv } = require('./env');

const MODES = ['mock', 'sandbox', 'live'];

/**
 * PhonePe's publicly documented sandbox/test credentials. These are NOT
 * secrets (PhonePe publishes them for its own sandbox), but they must never
 * sign a live request — live mode refuses them outright.
 */
const KNOWN_TEST_MERCHANT_IDS = ['PGTESTPAYUAT86'];
const KNOWN_TEST_SALT_KEYS    = ['96434309-7796-489d-8924-ab56988a6076'];

/** Safe outcomes a mock payment can be driven to. */
const MOCK_OUTCOMES = ['success', 'failure', 'pending'];

class PaymentConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentConfigError';
    this.code = 'PAYMENT_CONFIG';
    this.status = 503;
  }
}

function isProduction(nodeEnv = NODE_ENV) {
  return String(nodeEnv).toLowerCase() === 'production';
}

/** Map the legacy `phonepeEnv` / `PHONEPE_ENV` vocabulary onto a mode. */
function mapLegacyPhonePeEnv(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  if (['prod', 'production', 'live'].includes(v)) return 'live';
  if (['sandbox', 'uat', 'test', 'sbx'].includes(v)) return 'sandbox';
  return null; // unknown — caller decides (throws, never silently remaps)
}

/**
 * Environment-only mode resolution (synchronous, no DB). Used at startup
 * (before Mongo is connected) and as the highest-precedence source of the
 * full resolver below.
 *
 * Returns 'mock' | 'sandbox' | 'live', or null when no env var decides.
 * Throws PaymentConfigError on an invalid value or mock-in-production — an
 * invalid mode must never silently select a different one.
 */
function resolvePaymentModeFromEnv({ nodeEnv = NODE_ENV, env = process.env } = {}) {
  const raw = env.PAYMENT_MODE;
  if (raw !== undefined && String(raw).trim() !== '') {
    const mode = String(raw).trim().toLowerCase();
    if (!MODES.includes(mode)) {
      throw new PaymentConfigError(
        `PAYMENT_MODE must be one of ${MODES.join('|')} (got '${String(raw).trim()}'). ` +
        'No other mode will be selected instead.'
      );
    }
    if (mode === 'mock' && isProduction(nodeEnv)) {
      throw new PaymentConfigError('PAYMENT_MODE=mock is not allowed when NODE_ENV=production.');
    }
    return mode;
  }

  const legacy = env.PHONEPE_ENV;
  if (legacy !== undefined && String(legacy).trim() !== '') {
    const mode = mapLegacyPhonePeEnv(legacy);
    if (!mode) {
      throw new PaymentConfigError(
        `PHONEPE_ENV must be uat|sandbox|test or prod|production (got '${String(legacy).trim()}').`
      );
    }
    return mode;
  }

  return null;
}

/**
 * Full mode resolution.
 *
 * Precedence mirrors the existing `settings.get('phonepeEnv', PHONEPE_ENV)`
 * architecture:
 *   1. PAYMENT_MODE env var           (canonical, new; the only source of 'mock')
 *   2. SystemSettings.phonepeEnv      (existing admin setting) — non-production only
 *   3. PHONEPE_ENV env var            (existing legacy selector)
 *   4. default 'sandbox'              (non-production only)
 *
 * Production never guesses and never trusts a DB-only mode: SystemSettings
 * carries a Mongoose default of 'sandbox' that an operator may never have
 * chosen, so in production the mode MUST come from an env var (PAYMENT_MODE
 * or the legacy PHONEPE_ENV) or startup/payment-init fails.
 */
async function resolvePaymentMode({ nodeEnv = NODE_ENV, env = process.env } = {}) {
  // 1. Canonical selector — also validates the value and refuses mock in production.
  if (env.PAYMENT_MODE !== undefined && String(env.PAYMENT_MODE).trim() !== '') {
    return resolvePaymentModeFromEnv({ nodeEnv, env });
  }

  // 2. Existing admin-controlled override (non-production only — see above).
  if (!isProduction(nodeEnv)) {
    const settings = require('../utils/settingsService');
    const fromDb = mapLegacyPhonePeEnv(await settings.get('phonepeEnv', null));
    if (fromDb) return fromDb;
  }

  // 3. Legacy deployment env var (also the only production source besides PAYMENT_MODE).
  if (env.PHONEPE_ENV !== undefined && String(env.PHONEPE_ENV).trim() !== '') {
    const mode = mapLegacyPhonePeEnv(env.PHONEPE_ENV);
    if (!mode) {
      throw new PaymentConfigError(
        `PHONEPE_ENV must be uat|sandbox|test or prod|production (got '${String(env.PHONEPE_ENV).trim()}').`
      );
    }
    return mode;
  }

  // 4. No source at all.
  if (isProduction(nodeEnv)) {
    throw new PaymentConfigError(
      'Payment mode is not configured: set PAYMENT_MODE=live (or PHONEPE_ENV=prod) explicitly in production. ' +
      'Refusing to guess a mode for live payments.'
    );
  }

  return 'sandbox';
}

/**
 * Resolve PhonePe credentials for the current mode. Credentials are read
 * from System Settings (admin-rotatable) with the environment as fallback —
 * never from a hardcoded default.
 *
 * Returns { mode, baseUrl, merchantId, saltKey, saltIndex }.
 *   mock -> baseUrl/merchantId/saltKey/saltIndex are all null.
 * Throws PaymentConfigError when a required credential is missing, or when
 * live mode is configured with PhonePe's publicly known TEST credentials.
 */
async function resolvePhonePeCredentials({ nodeEnv = NODE_ENV, env = process.env } = {}) {
  const mode = await resolvePaymentMode({ nodeEnv, env });

  if (mode === 'mock') {
    return { mode, baseUrl: null, merchantId: null, saltKey: null, saltIndex: null };
  }

  const settings = require('../utils/settingsService');
  const merchantId = (await settings.get('phonepeMerchantId', env.PHONEPE_MERCHANT_ID)) || null;
  const saltKey    = (await settings.get('phonepeSaltKey',    env.PHONEPE_SALT_KEY))    || null;
  // Salt index is not a secret and PhonePe's default is '1'; merchant id and
  // salt key have no default at all.
  const saltIndex  = (await settings.get('phonepeSaltIndex',  env.PHONEPE_SALT_INDEX))  || '1';

  const missing = [];
  if (!merchantId) missing.push('phonepeMerchantId (System Settings) / PHONEPE_MERCHANT_ID (env)');
  if (!saltKey)    missing.push('phonepeSaltKey (System Settings) / PHONEPE_SALT_KEY (env)');
  if (missing.length) {
    throw new PaymentConfigError(
      `PhonePe ${mode} credentials are not configured: ${missing.join('; ')}. ` +
      'There is no built-in fallback credential.'
    );
  }

  if (mode === 'live') {
    if (KNOWN_TEST_MERCHANT_IDS.includes(merchantId) || KNOWN_TEST_SALT_KEYS.includes(saltKey)) {
      throw new PaymentConfigError(
        'live payment mode is configured with a publicly known PhonePe TEST merchant id / salt key. ' +
        'Refusing to sign live requests with test credentials.'
      );
    }
  }

  const { phonepe } = require('../config/integrations.config');
  const baseUrl = mode === 'live' ? phonepe.prodUrl : phonepe.sandboxUrl;

  return { mode, baseUrl, merchantId, saltKey, saltIndex };
}

/**
 * Default outcome a mock payment resolves to when nothing has driven it
 * explicitly (so the happy-path booking flow works with zero extra steps).
 * Only meaningful in mock mode.
 */
function mockDefaultOutcome({ env = process.env } = {}) {
  const raw = env.MOCK_PAYMENT_OUTCOME;
  if (raw === undefined || String(raw).trim() === '') return 'success';
  const outcome = String(raw).trim().toLowerCase();
  if (!MOCK_OUTCOMES.includes(outcome)) {
    throw new PaymentConfigError(
      `MOCK_PAYMENT_OUTCOME must be one of ${MOCK_OUTCOMES.join('|')} (got '${String(raw).trim()}').`
    );
  }
  return outcome;
}

/**
 * True only when mock mode is explicitly selected AND the process is not
 * production. Non-throwing: an invalid PAYMENT_MODE is reported by startup
 * validation (validate.js) and must not crash app.js module loading.
 */
function isMockEnabled({ nodeEnv = NODE_ENV, env = process.env } = {}) {
  if (isProduction(nodeEnv)) return false;
  try {
    return resolvePaymentModeFromEnv({ nodeEnv, env }) === 'mock';
  } catch {
    return false;
  }
}

/**
 * Environment-level payment checks for startup validation (no DB access —
 * Mongo is not connected yet). Returns { errors, warnings } of secret-free
 * messages; never includes credential values.
 */
function collectStartupErrors({ nodeEnv = NODE_ENV, env = process.env } = {}) {
  const errors = [];
  const warnings = [];
  let mode = null;

  try {
    mode = resolvePaymentModeFromEnv({ nodeEnv, env });
  } catch (err) {
    errors.push(err.message);
  }

  // An invalid/unsafe mode already reported above — nothing further to check.
  if (errors.length) return { errors, warnings };

  if (!isProduction(nodeEnv)) return { errors, warnings };

  if (!mode) {
    errors.push(
      'PAYMENT_MODE (or the legacy PHONEPE_ENV) must be set explicitly in production — ' +
      'refusing to default payments to sandbox.'
    );
    return { errors, warnings };
  }

  if (mode === 'mock') {
    // resolvePaymentModeFromEnv already threw for this, but keep the guard.
    errors.push('PAYMENT_MODE=mock is not allowed when NODE_ENV=production.');
    return { errors, warnings };
  }

  if (mode === 'sandbox') {
    warnings.push(
      'Payment mode is SANDBOX in production — payments are simulated (no real money). ' +
      'Set PAYMENT_MODE=live once live credentials are configured.'
    );
  }

  // Env-level credential sanity for live/sandbox in production. Credentials
  // may legitimately live in System Settings, so a missing env value is a
  // warning here; a present-but-test value is a hard error.
  if (env.PHONEPE_MERCHANT_ID && KNOWN_TEST_MERCHANT_IDS.includes(String(env.PHONEPE_MERCHANT_ID))) {
    errors.push('PHONEPE_MERCHANT_ID is a publicly known PhonePe TEST merchant id; it cannot be used in production.');
  }
  if (env.PHONEPE_SALT_KEY && KNOWN_TEST_SALT_KEYS.includes(String(env.PHONEPE_SALT_KEY))) {
    errors.push('PHONEPE_SALT_KEY is a publicly known PhonePe TEST salt key; it cannot be used in production.');
  }
  if (mode === 'live' && (!env.PHONEPE_MERCHANT_ID || !env.PHONEPE_SALT_KEY)) {
    warnings.push(
      'PAYMENT_MODE=live but PHONEPE_MERCHANT_ID / PHONEPE_SALT_KEY are not in the environment — ' +
      'they must be present in System Settings or every payment call will fail.'
    );
  }

  return { errors, warnings };
}

module.exports = {
  MODES,
  MOCK_OUTCOMES,
  KNOWN_TEST_MERCHANT_IDS,
  KNOWN_TEST_SALT_KEYS,
  PaymentConfigError,
  isProduction,
  mapLegacyPhonePeEnv,
  resolvePaymentModeFromEnv,
  resolvePaymentMode,
  resolvePhonePeCredentials,
  mockDefaultOutcome,
  isMockEnabled,
  collectStartupErrors,
};
