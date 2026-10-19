/**
 * Payment mode security + regression tests.
 *
 * Covers the mock/sandbox/live separation introduced in
 * src/config/payment.config.js and src/utils/phonepe.js:
 *
 *   A. Mode resolution (env precedence, invalid values, legacy PHONEPE_ENV)
 *   B. Credential resolution (explicit credentials only, no hardcoded fallbacks,
 *      live refuses PhonePe's public TEST credentials)
 *   C. Mock gateway behaviour (create/status/webhook checksums, outcomes,
 *      sandbox webhook salt separation, no-database fallback)
 *   D. Production guards (mock unreachable case-insensitively, startup
 *      refuses unsafe config in any NODE_ENV casing)
 *   E. Booking lifecycle in mock mode (client payload manipulation cannot mark
 *      a payment paid; verify/webhook idempotency; forged webhooks rejected)
 *      + mock control-plane authentication/ownership over HTTP, ownership
 *      checks on the user-facing verify endpoints, cross-worker mock state,
 *      outcome expiry and TTL cleanup.
 *
 * No test touches the real gateway: axios is patched in-process and mock mode
 * performs no HTTP at all. Part E runs against a dedicated TEST database.
 *
 * Run:  cd backend && node --test tests/payment-mode.test.js
 */

// Mock mode is selected for the whole process (app.js mounting + Part E).
process.env.PAYMENT_MODE = 'mock';
process.env.MOCK_PAYMENT_OUTCOME = 'success';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'payment-mode-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const paymentConfig = require('../src/config/payment.config');
const phonepe       = require('../src/utils/phonepe');
const settings      = require('../src/utils/settingsService');
const axios         = require('axios');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_payment_mode_test';

/* ─────────────────────────── helpers ─────────────────────────── */

const realSettingsGet = settings.get;
const realAxiosPost   = axios.post;
const realAxiosGet    = axios.get;

let dbCreds = {}; // what the stubbed settingsService "database" holds

function stubSettings() {
  settings.get = async (field, fallback) => {
    const v = dbCreds[field];
    return v !== undefined && v !== null && v !== '' ? v : (fallback ?? null);
  };
}

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
}

function sha256Hex(input) {
  return require('crypto').createHash('sha256').update(input).digest('hex');
}

/** Public PhonePe test credentials — used only to prove they are refused. */
const PUBLIC_TEST_MERCHANT = 'PGTESTPAYUAT86';
const PUBLIC_TEST_SALT    = '96434309-7796-489d-8924-ab56988a6076';

beforeEach(async () => {
  dbCreds = {};
  stubSettings();
  await phonepe.resetMockPayments();
  delete process.env.MOCK_PAYMENT_OUTCOME;
});

after(() => {
  settings.get = realSettingsGet;
  axios.post   = realAxiosPost;
  axios.get    = realAxiosGet;
});

/* ───────────────── A. mode resolution ───────────────── */

describe('payment mode resolution', () => {
  test('PAYMENT_MODE=mock selects mock', () => {
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PAYMENT_MODE: 'mock' } }), 'mock');
  });

  test('PAYMENT_MODE is case-insensitive and trimmed', () => {
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PAYMENT_MODE: '  Live ' } }), 'live');
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PAYMENT_MODE: 'SANDBOX' } }), 'sandbox');
  });

  test('an invalid PAYMENT_MODE throws instead of silently picking another mode', () => {
    assert.throws(
      () => paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PAYMENT_MODE: 'testing' } }),
      (err) => err instanceof paymentConfig.PaymentConfigError && /PAYMENT_MODE/.test(err.message)
    );
    // …and in particular never degrades to sandbox/live
    assert.throws(() => paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PAYMENT_MODE: 'prod' } }));
  });

  test('legacy PHONEPE_ENV maps uat/sandbox -> sandbox, prod -> live', () => {
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PHONEPE_ENV: 'uat' } }), 'sandbox');
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PHONEPE_ENV: 'prod' } }), 'live');
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PHONEPE_ENV: 'sandbox' } }), 'sandbox');
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PHONEPE_ENV: 'production' } }), 'live');
  });

  test('an unknown legacy PHONEPE_ENV throws rather than defaulting to a mode', () => {
    assert.throws(() => paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PHONEPE_ENV: 'staging-ish' } }),
      (err) => err instanceof paymentConfig.PaymentConfigError);
  });

  test('PAYMENT_MODE wins over the legacy PHONEPE_ENV', () => {
    assert.equal(
      paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: { PAYMENT_MODE: 'live', PHONEPE_ENV: 'uat' } }),
      'live'
    );
  });

  test('no env vars -> env resolver returns null (default decided later)', () => {
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'development', env: {} }), null);
  });

  test('full resolver: SystemSettings.phonepeEnv is used when env is silent (existing architecture)', async () => {
    dbCreds.phonepeEnv = 'prod';
    assert.equal(await paymentConfig.resolvePaymentMode({ nodeEnv: 'development', env: {} }), 'live');
    dbCreds.phonepeEnv = 'sandbox';
    assert.equal(await paymentConfig.resolvePaymentMode({ nodeEnv: 'development', env: {} }), 'sandbox');
  });

  test('full resolver: env beats SystemSettings', async () => {
    dbCreds.phonepeEnv = 'sandbox';
    assert.equal(await paymentConfig.resolvePaymentMode({ nodeEnv: 'development', env: { PAYMENT_MODE: 'live' } }), 'live');
  });

  test('full resolver: SystemSettings still beats the legacy PHONEPE_ENV (existing precedence)', async () => {
    dbCreds.phonepeEnv = 'prod';
    assert.equal(
      await paymentConfig.resolvePaymentMode({ nodeEnv: 'development', env: { PHONEPE_ENV: 'uat' } }),
      'live',
      'admin SystemSettings override must keep winning over the legacy env fallback'
    );
    dbCreds.phonepeEnv = 'sandbox';
    assert.equal(
      await paymentConfig.resolvePaymentMode({ nodeEnv: 'production', env: { PHONEPE_ENV: 'prod' } }),
      'live',
      'in production the DB override is never consulted — the legacy env var decides'
    );
  });

  test('non-production with nothing configured defaults to sandbox (pre-existing behaviour)', async () => {
    assert.equal(await paymentConfig.resolvePaymentMode({ nodeEnv: 'development', env: {} }), 'sandbox');
  });

  test('production never derives the mode from SystemSettings defaults', async () => {
    dbCreds.phonepeEnv = 'sandbox'; // mongoose default an operator never chose
    await assert.rejects(
      () => paymentConfig.resolvePaymentMode({ nodeEnv: 'production', env: {} }),
      (err) => err instanceof paymentConfig.PaymentConfigError && /production/.test(err.message)
    );
  });
});

/* ───────────────── B. credential resolution ───────────────── */

describe('PhonePe credential resolution', () => {
  test('mock mode needs no credentials and talks to no host', async () => {
    const cfg = await paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'development', env: { PAYMENT_MODE: 'mock' } });
    assert.equal(cfg.mode, 'mock');
    assert.equal(cfg.baseUrl, null);
    assert.equal(cfg.merchantId, null);
    assert.equal(cfg.saltKey, null);
  });

  test('sandbox requires explicitly configured credentials', async () => {
    await assert.rejects(
      () => paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'development', env: { PAYMENT_MODE: 'sandbox' } }),
      (err) => err instanceof paymentConfig.PaymentConfigError
        && /PHONEPE_MERCHANT_ID/.test(err.message)
        && /PHONEPE_SALT_KEY/.test(err.message)
        && /no built-in fallback/i.test(err.message)
    );
  });

  test('live requires explicitly configured credentials', async () => {
    dbCreds.phonepeMerchantId = 'merchant_live_ok';
    await assert.rejects(
      () => paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'production', env: { PAYMENT_MODE: 'live' } }),
      (err) => err instanceof paymentConfig.PaymentConfigError && /PHONEPE_SALT_KEY/.test(err.message)
    );
  });

  test('explicit sandbox credentials resolve to the sandbox host', async () => {
    dbCreds.phonepeMerchantId = 'sandbox_merchant_1';
    dbCreds.phonepeSaltKey    = 'sandbox_salt_not_public';
    const cfg = await paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'development', env: { PAYMENT_MODE: 'sandbox' } });
    assert.equal(cfg.mode, 'sandbox');
    assert.match(cfg.baseUrl, /pg-sandbox/);
    assert.equal(cfg.merchantId, 'sandbox_merchant_1');
    assert.equal(cfg.saltIndex, '1');
  });

  test('explicit live credentials resolve to the production host', async () => {
    dbCreds.phonepeMerchantId = 'live_merchant_1';
    dbCreds.phonepeSaltKey    = 'live_salt_abc';
    dbCreds.phonepeSaltIndex  = '2';
    const cfg = await paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'production', env: { PAYMENT_MODE: 'live' } });
    assert.equal(cfg.mode, 'live');
    assert.match(cfg.baseUrl, /api\.phonepe\.com/);
    assert.equal(cfg.saltIndex, '2');
  });

  test('env credentials are accepted as the fallback when System Settings are empty', async () => {
    const cfg = await paymentConfig.resolvePhonePeCredentials({
      nodeEnv: 'development',
      env: { PAYMENT_MODE: 'sandbox', PHONEPE_MERCHANT_ID: 'env_merchant', PHONEPE_SALT_KEY: 'env_salt' },
    });
    assert.equal(cfg.merchantId, 'env_merchant');
    assert.equal(cfg.saltKey, 'env_salt');
  });

  test('live mode refuses PhonePe\'s publicly known TEST credentials', async () => {
    for (const [merchant, salt] of [[PUBLIC_TEST_MERCHANT, 'some_real_salt'], ['live_merchant_1', PUBLIC_TEST_SALT]]) {
      dbCreds.phonepeMerchantId = merchant;
      dbCreds.phonepeSaltKey    = salt;
      await assert.rejects(
        () => paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'production', env: { PAYMENT_MODE: 'live' } }),
        (err) => err instanceof paymentConfig.PaymentConfigError && /TEST/.test(err.message)
      );
    }
  });

  test('the same public test credentials are still allowed in sandbox mode (existing dev workflow)', async () => {
    dbCreds.phonepeMerchantId = PUBLIC_TEST_MERCHANT;
    dbCreds.phonepeSaltKey    = PUBLIC_TEST_SALT;
    const cfg = await paymentConfig.resolvePhonePeCredentials({ nodeEnv: 'development', env: { PAYMENT_MODE: 'sandbox' } });
    assert.equal(cfg.mode, 'sandbox');
    assert.match(cfg.baseUrl, /pg-sandbox/);
  });

  test('phonepe.js carries no built-in credential literals', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/utils/phonepe.js'), 'utf8');
    assert.ok(!src.includes(PUBLIC_TEST_MERCHANT), 'no hardcoded test merchant id');
    assert.ok(!src.includes(PUBLIC_TEST_SALT), 'no hardcoded test salt key');
  });
});

/* ───────────────── C. mock gateway behaviour ───────────────── */

describe('mock gateway', () => {
  test('createPhonePeOrder in mock mode makes no HTTP call and echoes the app redirect', async () => {
    axios.post = async () => { throw new Error('mock mode must not call the gateway'); };
    const out = await phonepe.createPhonePeOrder({
      merchantTransactionId: 'ZUT_TEST_1',
      amount: 100,
      userId: 'u1',
      callbackUrl: 'http://localhost:5000/api/bookings/phonepe-webhook',
      redirectUrl: 'http://localhost:3000/payment-callback/ZUT_TEST_1',
    });
    assert.equal(out.mock, true);
    assert.equal(out.redirectUrl, 'http://localhost:3000/payment-callback/ZUT_TEST_1');
    assert.equal(out.merchantTransactionId, 'ZUT_TEST_1');
  });

  test('undriven mock transactions default to success (happy-path E2E)', async () => {
    await phonepe.createPhonePeOrder({ merchantTransactionId: 'ZUT_TEST_2', amount: 10, userId: 'u', redirectUrl: 'r', callbackUrl: 'c' });
    const s = await phonepe.checkPhonePeStatus('ZUT_TEST_2');
    assert.equal(s.success, true);
    assert.equal(s.state, 'COMPLETED');
    assert.match(s.transactionId, /^MOCKTXN_/);
  });

  test('MOCK_PAYMENT_OUTCOME overrides the default outcome', async () => {
    process.env.MOCK_PAYMENT_OUTCOME = 'pending';
    try {
      await phonepe.createPhonePeOrder({ merchantTransactionId: 'ZUT_TEST_3', amount: 10, userId: 'u', redirectUrl: 'r', callbackUrl: 'c' });
      const s = await phonepe.checkPhonePeStatus('ZUT_TEST_3');
      assert.equal(s.success, false);
      assert.equal(s.state, 'PENDING');
    } finally {
      delete process.env.MOCK_PAYMENT_OUTCOME;
    }
  });

  test('an invalid MOCK_PAYMENT_OUTCOME fails instead of silently becoming success', () => {
    process.env.MOCK_PAYMENT_OUTCOME = 'whatever';
    try {
      assert.throws(() => paymentConfig.mockDefaultOutcome(), (err) => err instanceof paymentConfig.PaymentConfigError);
    } finally {
      delete process.env.MOCK_PAYMENT_OUTCOME;
    }
  });

  test('outcomes can be driven to success / failure / pending per transaction', async () => {
    assert.equal(await phonepe.setMockOutcome('ZUT_TEST_4', 'failure'), 'failure');
    assert.equal((await phonepe.checkPhonePeStatus('ZUT_TEST_4')).state, 'FAILED');

    assert.equal(await phonepe.setMockOutcome('ZUT_TEST_4', 'pending'), 'pending');
    assert.equal((await phonepe.checkPhonePeStatus('ZUT_TEST_4')).state, 'PENDING');

    assert.equal(await phonepe.setMockOutcome('ZUT_TEST_4', 'success'), 'success');
    assert.equal((await phonepe.checkPhonePeStatus('ZUT_TEST_4')).success, true);
  });

  test('an unknown outcome is rejected', async () => {
    await assert.rejects(() => phonepe.setMockOutcome('ZUT_TEST_5', 'paid'), (err) => err instanceof paymentConfig.PaymentConfigError);
  });

  test('webhook checksums: valid mock checksum passes, wrong/public-test-salt checksums fail', async () => {
    const body = Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: 'ZUT_TEST_6' } })).toString('base64');
    assert.equal(await phonepe.verifyWebhookChecksum(body, phonepe.getMockWebhookChecksum(body)), true);
    assert.equal(await phonepe.verifyWebhookChecksum(body, sha256Hex(body + PUBLIC_TEST_SALT) + '###1'), false);
    assert.equal(await phonepe.verifyWebhookChecksum(body, 'garbage'), false);
    assert.equal(await phonepe.verifyWebhookChecksum(body, undefined), false);
  });

  test('sandbox webhook checksums: configured salt accepted, public test salt rejected', async () => {
    // Offline: verifyWebhookChecksum performs no HTTP. Temporarily resolves sandbox mode.
    const prev = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = 'sandbox';
    dbCreds.phonepeMerchantId = 'sandbox_merchant_cfg';
    dbCreds.phonepeSaltKey    = 'sandbox_salt_cfg';
    try {
      const body = Buffer.from(JSON.stringify({ code: 'PAYMENT_SUCCESS', data: { merchantTransactionId: 'ZUT_SBX_1' } })).toString('base64');
      assert.equal(await phonepe.verifyWebhookChecksum(body, sha256Hex(body + 'sandbox_salt_cfg') + '###1'), true,
        'the configured sandbox salt must authenticate callbacks');
      assert.equal(await phonepe.verifyWebhookChecksum(body, sha256Hex(body + PUBLIC_TEST_SALT) + '###1'), false,
        'PhonePe\'s public test salt must never authenticate a configured-environment callback');
      assert.equal(await phonepe.verifyWebhookChecksum(body, ''), false);
      assert.equal(await phonepe.verifyWebhookChecksum(body, undefined), false);
    } finally {
      dbCreds = {};
      if (prev === undefined) delete process.env.PAYMENT_MODE; else process.env.PAYMENT_MODE = prev;
    }
  });

  test('mock webhook verification works without any database connection (process-local fallback)', async () => {
    // Sections A–D run before mongoose.connect: state must remain functional.
    await phonepe.setMockOutcome('ZUT_NOCONN_1', 'failure');
    assert.equal(await phonepe.getMockOutcome('ZUT_NOCONN_1'), 'failure');
    assert.equal((await phonepe.checkPhonePeStatus('ZUT_NOCONN_1')).state, 'FAILED');
  });

  test('resetMockPayments clears driven outcomes', async () => {
    await phonepe.setMockOutcome('ZUT_TEST_7', 'failure');
    await phonepe.resetMockPayments();
    assert.equal(await phonepe.getMockOutcome('ZUT_TEST_7'), 'success');
  });
});

/* ───────────────── D. production guards ───────────────── */

describe('production guards', () => {
  test('isMockEnabled is false in production even when PAYMENT_MODE=mock', () => {
    assert.equal(paymentConfig.isMockEnabled({ nodeEnv: 'production', env: { PAYMENT_MODE: 'mock' } }), false);
    assert.equal(paymentConfig.isMockEnabled({ nodeEnv: 'development', env: { PAYMENT_MODE: 'mock' } }), true);
    assert.equal(paymentConfig.isMockEnabled({ nodeEnv: 'development', env: {} }), false);
    assert.equal(paymentConfig.isMockEnabled({ nodeEnv: 'development', env: { PAYMENT_MODE: 'nonsense' } }), false);
  });

  test('production startup refuses PAYMENT_MODE=mock', () => {
    const { errors } = paymentConfig.collectStartupErrors({ nodeEnv: 'production', env: { PAYMENT_MODE: 'mock' } });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /mock is not allowed/i);
  });

  test('production startup refuses an unknown PAYMENT_MODE', () => {
    const { errors } = paymentConfig.collectStartupErrors({ nodeEnv: 'production', env: { PAYMENT_MODE: 'preprod' } });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /PAYMENT_MODE/);
  });

  test('production startup refuses to guess a mode when nothing is configured', () => {
    const { errors } = paymentConfig.collectStartupErrors({ nodeEnv: 'production', env: {} });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /explicitly in production/);
  });

  test('production + explicit sandbox is allowed but warns', () => {
    const { errors, warnings } = paymentConfig.collectStartupErrors({ nodeEnv: 'production', env: { PAYMENT_MODE: 'sandbox' } });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /SANDBOX/);
  });

  test('production + live with real-looking env credentials passes', () => {
    const { errors, warnings } = paymentConfig.collectStartupErrors({
      nodeEnv: 'production',
      env: { PAYMENT_MODE: 'live', PHONEPE_MERCHANT_ID: 'live_merchant_xyz', PHONEPE_SALT_KEY: 'live_salt_xyz' },
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  test('production refuses env-level publicly known TEST credentials', () => {
    for (const env of [
      { PAYMENT_MODE: 'live', PHONEPE_MERCHANT_ID: PUBLIC_TEST_MERCHANT, PHONEPE_SALT_KEY: 'live_salt' },
      { PAYMENT_MODE: 'live', PHONEPE_MERCHANT_ID: 'live_merchant', PHONEPE_SALT_KEY: PUBLIC_TEST_SALT },
    ]) {
      const { errors } = paymentConfig.collectStartupErrors({ nodeEnv: 'production', env });
      assert.equal(errors.length, 1);
      assert.match(errors[0], /TEST/);
    }
  });

  test('startup error messages never contain credential values', () => {
    const { errors, warnings } = paymentConfig.collectStartupErrors({
      nodeEnv: 'production',
      env: { PAYMENT_MODE: 'live', PHONEPE_SALT_KEY: PUBLIC_TEST_SALT },
    });
    const text = [...errors, ...warnings].join('\n');
    assert.ok(!text.includes(PUBLIC_TEST_SALT), 'salt value must not be echoed');
  });

  test('non-production startup has no payment errors by default', () => {
    assert.deepEqual(paymentConfig.collectStartupErrors({ nodeEnv: 'development', env: {} }), { errors: [], warnings: [] });
  });

  test('mock control controller 404s outside mock mode', async () => {
    const ctrl = require('../src/controllers/mockPayment.controller');
    const prev = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = 'live';
    try {
      const res = mockRes();
      await ctrl.setOutcome({ params: { merchantTransactionId: 'ZUT_X' }, body: { outcome: 'success' } }, res);
      assert.equal(res.statusCode, 404);
    } finally {
      if (prev === undefined) delete process.env.PAYMENT_MODE; else process.env.PAYMENT_MODE = prev;
    }
  });

  test('production detection is case-insensitive', () => {
    assert.equal(paymentConfig.isProduction('production'), true);
    assert.equal(paymentConfig.isProduction('Production'), true);
    assert.equal(paymentConfig.isProduction('PRODUCTION'), true);
    assert.equal(paymentConfig.isProduction(' development'), false);
    assert.equal(paymentConfig.isProduction('development'), false);
    assert.equal(paymentConfig.isProduction(undefined), false);
  });

  test('NODE_ENV=Production (any case) cannot enable mock mode', () => {
    for (const nodeEnv of ['Production', 'PRODUCTION', 'proDUCTION']) {
      assert.equal(paymentConfig.isMockEnabled({ nodeEnv, env: { PAYMENT_MODE: 'mock' } }), false,
        `NODE_ENV=${nodeEnv} must not allow mock mode`);
      assert.throws(
        () => paymentConfig.resolvePaymentModeFromEnv({ nodeEnv, env: { PAYMENT_MODE: 'mock' } }),
        (err) => err instanceof paymentConfig.PaymentConfigError && /production/i.test(err.message),
        `NODE_ENV=${nodeEnv} must reject PAYMENT_MODE=mock`
      );
      const { errors } = paymentConfig.collectStartupErrors({ nodeEnv, env: { PAYMENT_MODE: 'mock' } });
      assert.equal(errors.length, 1, `NODE_ENV=${nodeEnv} must fail startup for mock mode`);
      assert.match(errors[0], /mock is not allowed/i);
    }
  });

  test('case variations of production still reject a missing or invalid mode', () => {
    const missing = paymentConfig.collectStartupErrors({ nodeEnv: 'PRODUCTION', env: {} });
    assert.equal(missing.errors.length, 1);
    assert.match(missing.errors[0], /explicitly in production/);

    const invalid = paymentConfig.collectStartupErrors({ nodeEnv: 'Production', env: { PAYMENT_MODE: 'nonsense' } });
    assert.equal(invalid.errors.length, 1);
    assert.match(invalid.errors[0], /PAYMENT_MODE/);

    const testCreds = paymentConfig.collectStartupErrors({
      nodeEnv: 'Production',
      env: { PAYMENT_MODE: 'live', PHONEPE_MERCHANT_ID: PUBLIC_TEST_MERCHANT, PHONEPE_SALT_KEY: 'live_salt' },
    });
    assert.equal(testCreds.errors.length, 1);
    assert.match(testCreds.errors[0], /TEST/);
  });

  test('case normalization does not change sandbox/live behaviour in or out of production', () => {
    // Non-production casings keep working exactly as before.
    assert.equal(paymentConfig.isMockEnabled({ nodeEnv: 'Development', env: { PAYMENT_MODE: 'mock' } }), true);
    assert.deepEqual(paymentConfig.collectStartupErrors({ nodeEnv: 'Development', env: {} }), { errors: [], warnings: [] });
    assert.equal(paymentConfig.resolvePaymentModeFromEnv({ nodeEnv: 'Development', env: { PAYMENT_MODE: 'live' } }), 'live');
    // Production + explicit live stays accepted.
    const ok = paymentConfig.collectStartupErrors({
      nodeEnv: 'Production',
      env: { PAYMENT_MODE: 'live', PHONEPE_MERCHANT_ID: 'live_m_xyz', PHONEPE_SALT_KEY: 'live_s_xyz' },
    });
    assert.deepEqual(ok.errors, []);
    assert.deepEqual(ok.warnings, []);
    // Production + sandbox still only warns.
    const sbx = paymentConfig.collectStartupErrors({ nodeEnv: 'Production', env: { PAYMENT_MODE: 'sandbox' } });
    assert.deepEqual(sbx.errors, []);
    assert.equal(sbx.warnings.length, 1);
  });
});

/* ───────────────── E. booking lifecycle (mock mode, TEST database) ───────────────── */

describe('booking/payment lifecycle in mock mode', () => {
  let User, Pooja, Booking, PaymentLedger, Invoice, bookingController;
  let user, otherUser, pooja;
  const { NotificationEngine } = require('../notification-engine');
  const realEmit = NotificationEngine.emit;

  before(async () => {
    await mongoose.connect(TEST_URI);
    await mongoose.connection.dropDatabase();

    settings.invalidate();
    NotificationEngine.emit = async () => {}; // never queue real notifications

    User           = require('../src/models/User');
    Pooja          = require('../src/models/Pooja');
    Booking        = require('../src/models/Booking');
    PaymentLedger  = require('../src/models/PaymentLedger');
    Invoice        = require('../src/models/Invoice');
    bookingController = require('../src/controllers/booking.controller');

    user  = await User.create({ name: 'Payment Mode User', email: `paymode${Date.now()}@test.zutsav.local`, phone: '9812345670', password: 'secret123' });
    otherUser = await User.create({ name: 'Payment Mode Other', email: `paymode2${Date.now()}@test.zutsav.local`, phone: '9812345671', password: 'secret123' });
    pooja = await Pooja.create({ name: 'Payment Mode Pooja', slug: `payment-mode-pooja-${Date.now()}`, price: 1500, salePrice: 1500, mrp: 1800, isActive: true });
  });

  after(async () => {
    NotificationEngine.emit = realEmit;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    settings.invalidate();
  });

  async function createPendingBooking(extraBody = {}) {
    const req = {
      user: { _id: user._id },
      body: {
        poojaId: pooja._id.toString(),
        scheduledDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
        scheduledTime: '10:00-12:00',
        language: 'Hindi',
        userDetails: { name: 'Pay Test', phone: '9876543210', address: '1 Test Street', pincode: '110001', state: 'Delhi' },
        ...extraBody,
      },
    };
    const res = mockRes();
    await bookingController.createPhonePeBooking(req, res, (e) => { throw e; });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const booking = await Booking.findById(res.body.booking._id);
    return { res, booking };
  }

  function verifyRes() {
    return {
      statusCode: 0,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(d) { this.body = d; return this; },
    };
  }

  test('client-submitted paymentStatus/status/amountPaid cannot create a paid booking', async () => {
    const { booking } = await createPendingBooking({
      paymentStatus: 'FULLY_PAID',
      status: 'paid',
      amountPaid: 99999,
      remainingAmount: 0,
    });
    assert.equal(booking.status, 'pending_payment');
    assert.equal(booking.paymentStatus, 'PENDING');
    assert.equal(booking.amountPaid, 0);
    assert.ok(booking.grandTotal > 0, 'server-authoritative amount is preserved');
  });

  test('mock default outcome -> verify marks the booking paid through the real verify path', async () => {
    const { booking } = await createPendingBooking();
    const txn = booking.phonePeMerchantTransactionId;
    assert.ok(txn);
    const totalBookingsBefore = (await Pooja.findById(pooja._id)).totalBookings || 0;

    const req  = { params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} };
    const res  = verifyRes();
    await bookingController.verifyPhonePePayment(req, res, (e) => { throw e; });

    assert.equal(res.body.success, true);
    const paid = await Booking.findById(booking._id);
    assert.equal(paid.status, 'paid');
    assert.equal(paid.paymentStatus, 'FULLY_PAID');
    assert.match(paid.phonePeTransactionId, /^MOCKTXN_/);

    const ledger = await PaymentLedger.findOne({ merchantTransactionId: txn });
    assert.equal(ledger.paymentStatus, 'SUCCESS');

    // Idempotency: a second verify must not double-count anything.
    const res2 = verifyRes();
    await bookingController.verifyPhonePePayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, res2, (e) => { throw e; });
    assert.equal(res2.body.success, true);
    assert.equal(res2.body.alreadyVerified, true);
    const reloaded = await Booking.findById(booking._id).populate('poojaId');
    assert.equal(reloaded.poojaId.totalBookings, totalBookingsBefore + 1, 'totalBookings incremented exactly once');
    assert.equal(await Invoice.countDocuments({ bookingId: booking._id }), 1, 'exactly one invoice');
  });

  test('mock failure outcome -> verify fails the attempt, booking stays pending', async () => {
    const { booking } = await createPendingBooking();
    const txn = booking.phonePeMerchantTransactionId;
    await phonepe.setMockOutcome(txn, 'failure');

    const res = verifyRes();
    await bookingController.verifyPhonePePayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, res, (e) => { throw e; });

    assert.equal(res.body.success, false);
    assert.equal(res.body.state, 'FAILED');
    const still = await Booking.findById(booking._id);
    assert.equal(still.status, 'pending_payment', 'a failed payment is not a cancellation');
    assert.equal(still.paymentStatus, 'FAILED');
    assert.equal((await PaymentLedger.findOne({ merchantTransactionId: txn })).paymentStatus, 'FAILED');
  });

  test('mock pending outcome -> verify leaves the booking untouched', async () => {
    const { booking } = await createPendingBooking();
    const txn = booking.phonePeMerchantTransactionId;
    await phonepe.setMockOutcome(txn, 'pending');

    const res = verifyRes();
    await bookingController.verifyPhonePePayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, res, (e) => { throw e; });

    assert.equal(res.body.success, false);
    assert.equal(res.body.state, 'PENDING');
    const still = await Booking.findById(booking._id);
    assert.equal(still.status, 'pending_payment');
    assert.equal((await PaymentLedger.findOne({ merchantTransactionId: txn })).paymentStatus, 'PENDING');
  });

  test('a client body claiming success does not override a pending gateway outcome', async () => {
    const { booking } = await createPendingBooking();
    const txn = booking.phonePeMerchantTransactionId;
    await phonepe.setMockOutcome(txn, 'pending');

    const res = verifyRes();
    await bookingController.verifyPhonePePayment({
      params: { merchantTransactionId: txn },
      user: { _id: user._id },
      body: { paymentStatus: 'FULLY_PAID', status: 'paid', success: true },
    }, res, (e) => { throw e; });

    assert.equal(res.body.success, false, 'verify only trusts the gateway/mock outcome');
    const still = await Booking.findById(booking._id);
    assert.equal(still.status, 'pending_payment');
  });

  test('webhook rejects a forged checksum signed with PhonePe\'s public test salt', async () => {
    const { booking } = await createPendingBooking();
    const txn = booking.phonePeMerchantTransactionId;
    const body = Buffer.from(JSON.stringify({
      code: 'PAYMENT_SUCCESS',
      data: { merchantTransactionId: txn, transactionId: 'FORGED-1', state: 'COMPLETED' },
    })).toString('base64');

    const res = verifyRes();
    await bookingController.phonePeWebhook({
      body: { response: body },
      headers: { 'x-verify': sha256Hex(body + PUBLIC_TEST_SALT) + '###1' },
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal((await Booking.findById(booking._id)).status, 'pending_payment');
  });

  test('webhook with a valid mock checksum pays the booking and is idempotent', async () => {
    const { booking } = await createPendingBooking();
    const txn = booking.phonePeMerchantTransactionId;
    const totalBookingsBefore = (await Pooja.findById(pooja._id)).totalBookings || 0;
    const body = Buffer.from(JSON.stringify({
      code: 'PAYMENT_SUCCESS',
      data: { merchantTransactionId: txn, transactionId: 'MOCK-WEBHOOK-1', state: 'COMPLETED' },
    })).toString('base64');
    const headers = { 'x-verify': phonepe.getMockWebhookChecksum(body) };

    const res1 = verifyRes();
    await bookingController.phonePeWebhook({ body: { response: body }, headers }, res1);
    assert.equal(res1.body.success, true);
    assert.equal((await Booking.findById(booking._id)).status, 'paid');

    const res2 = verifyRes();
    await bookingController.phonePeWebhook({ body: { response: body }, headers }, res2);
    assert.equal(res2.body.success, true);
    const reloaded = await Booking.findById(booking._id).populate('poojaId');
    assert.equal(reloaded.poojaId.totalBookings, totalBookingsBefore + 1, 'webhook retries must not double-count');
    assert.equal(reloaded.amountPaid, reloaded.grandTotal);
  });

  /* ── F1. mock control plane: authentication + ownership (HTTP) ────────── */

  describe('mock control-plane authorization (HTTP)', () => {
    const jwt = require('jsonwebtoken');
    let server, port, ownerToken, intruderToken;

    before(() => {
      ownerToken    = jwt.sign({ id: user._id.toString() },    process.env.JWT_SECRET, { expiresIn: '1h' });
      intruderToken = jwt.sign({ id: otherUser._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const http = require('http');
      const app  = require('../src/app');
      server = http.createServer(app);
      return new Promise((resolve) => server.listen(0, () => { port = server.address().port; resolve(); }));
    });

    after(() => new Promise((resolve) => server.close(resolve)));

    const url  = (txn) => `http://127.0.0.1:${port}/api/payments/mock/${txn}`;
    const auth = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
    const post = (txn, token, outcome) =>
      fetch(url(txn), { method: 'POST', headers: auth(token), body: JSON.stringify({ outcome }) });

    test('app.js mounts the mock control plane in mock mode (owner end to end)', async () => {
      const { booking } = await createPendingBooking();
      const txn = booking.phonePeMerchantTransactionId;

      const setRes = await post(txn, ownerToken, 'failure');
      assert.equal(setRes.status, 200);
      assert.equal((await setRes.json()).outcome, 'failure');

      const badRes = await post(txn, ownerToken, 'paid');
      assert.equal(badRes.status, 400);

      const getRes = await fetch(url(txn), { headers: auth(ownerToken) });
      assert.equal(getRes.status, 200);
      assert.equal((await getRes.json()).outcome, 'failure');
    });

    test('unauthenticated GET and POST are rejected and write nothing', async () => {
      const { booking } = await createPendingBooking();
      const txn = booking.phonePeMerchantTransactionId;

      assert.equal((await fetch(url(txn))).status, 401, 'unauthenticated GET must be rejected');
      assert.equal((await fetch(url(txn), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'failure' }),
      })).status, 401, 'unauthenticated POST must be rejected');

      const ownerGet = await fetch(url(txn), { headers: auth(ownerToken) });
      assert.equal((await ownerGet.json()).outcome, 'success', 'the rejected POST must not have written an outcome');
    });

    test('a non-owner cannot inspect or change another user\'s mock outcome', async () => {
      const { booking } = await createPendingBooking();
      const txn = booking.phonePeMerchantTransactionId;
      assert.equal((await post(txn, ownerToken, 'failure')).status, 200);

      assert.equal((await fetch(url(txn), { headers: auth(intruderToken) })).status, 404, 'non-owner GET must be rejected');
      assert.equal((await post(txn, intruderToken, 'success')).status, 404, 'non-owner POST must be rejected');

      const ownerGet = await fetch(url(txn), { headers: auth(ownerToken) });
      assert.equal((await ownerGet.json()).outcome, 'failure', 'the intruder must not have changed the outcome');
      assert.equal((await Booking.findById(booking._id)).status, 'pending_payment');
    });

    test('unknown and store-only transaction IDs are rejected safely', async () => {
      // Unknown to every record AND to the mock store.
      assert.equal((await fetch(url('ZUT_UNKNOWN_XYZ'), { headers: auth(ownerToken) })).status, 404);
      assert.equal((await post('ZUT_UNKNOWN_XYZ', ownerToken, 'failure')).status, 404);

      // Present in the mock store but not associated with any Booking/Order/ledger:
      // possession of the store entry alone must not grant control.
      await phonepe.setMockOutcome('ZUT_ORPHAN_XYZ', 'failure');
      assert.equal((await fetch(url('ZUT_ORPHAN_XYZ'), { headers: auth(ownerToken) })).status, 404);
      assert.equal((await post('ZUT_ORPHAN_XYZ', ownerToken, 'success')).status, 404);
      assert.equal(await phonepe.getMockOutcome('ZUT_ORPHAN_XYZ'), 'failure', 'the orphaned outcome is untouched');
    });

    test('a completed transaction cannot have its mock outcome reset', async () => {
      const { booking } = await createPendingBooking();
      const txn = booking.phonePeMerchantTransactionId;
      assert.equal((await post(txn, ownerToken, 'success')).status, 200);

      const vres = verifyRes();
      await bookingController.verifyPhonePePayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, vres, (e) => { throw e; });
      assert.equal(vres.body.success, true);
      assert.equal((await Booking.findById(booking._id)).status, 'paid');

      assert.equal((await post(txn, ownerToken, 'failure')).status, 409, 'a completed transaction must not be reset');
      assert.equal((await post(txn, ownerToken, 'pending')).status, 409);
      const getRes = await fetch(url(txn), { headers: auth(ownerToken) });
      assert.equal((await getRes.json()).outcome, 'success', 'the completed outcome is unchanged');
    });
  });

  /* ── Ownership checks on the user-facing verification endpoints ───────── */

  describe('payment verification ownership', () => {
    const checkoutController     = require('../src/controllers/checkout.controller');
    const marketplaceController  = require('../src/controllers/marketplace.controller');
    const Order                  = require('../src/models/Order');

    async function createMarketplaceOrder(txn) {
      return Order.create({
        userId: user._id,
        items: [{ productId: new mongoose.Types.ObjectId(), name: 'Test Kit', price: 100, quantity: 1, total: 100 }],
        totalAmount: 100,
        shippingAddress: { name: 'Pay Test', phone: '9876543210', address: '1 Test Street', pincode: '110001' },
        status: 'pending_payment',
        phonePeMerchantTransactionId: txn,
      });
    }

    test('another user cannot verify my booking payment, and nothing is mutated', async () => {
      const { booking } = await createPendingBooking();
      const txn = booking.phonePeMerchantTransactionId;
      await phonepe.setMockOutcome(txn, 'success'); // a mutation WOULD happen if the check were missing

      const res = verifyRes();
      await bookingController.verifyPhonePePayment({ params: { merchantTransactionId: txn }, user: { _id: otherUser._id }, body: {} }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);

      const still = await Booking.findById(booking._id);
      assert.equal(still.status, 'pending_payment', 'ownership rejection must not mutate payment state');
      assert.equal(still.paymentStatus, 'PENDING');
      assert.equal((await PaymentLedger.findOne({ merchantTransactionId: txn })).paymentStatus, 'PENDING');

      // The legitimate owner still succeeds.
      const ok = verifyRes();
      await bookingController.verifyPhonePePayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, ok, (e) => { throw e; });
      assert.equal(ok.body.success, true);
      assert.equal((await Booking.findById(booking._id)).status, 'paid');
    });

    test('another user cannot verify my remaining payment, and nothing is mutated', async () => {
      const { booking } = await createPendingBooking();
      booking.paymentStatus  = 'PARTIALLY_PAID';
      booking.remainingAmount = 500;
      await booking.save();
      const txn = `ZUT_REM_TEST_${Date.now()}`;
      await PaymentLedger.create({ bookingId: booking._id, amount: 500, paymentType: 'REMAINING', merchantTransactionId: txn, paymentStatus: 'PENDING' });
      await phonepe.setMockOutcome(txn, 'success');

      const res = verifyRes();
      await bookingController.verifyRemainingPayment({ params: { merchantTransactionId: txn }, user: { _id: otherUser._id }, body: {} }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 403);

      const stillLedger = await PaymentLedger.findOne({ merchantTransactionId: txn });
      assert.equal(stillLedger.paymentStatus, 'PENDING', 'ownership rejection must not mutate the ledger');
      const still = await Booking.findById(booking._id);
      assert.equal(still.paymentStatus, 'PARTIALLY_PAID');

      // The legitimate owner still succeeds.
      const ok = verifyRes();
      await bookingController.verifyRemainingPayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, ok, (e) => { throw e; });
      assert.equal(ok.body.success, true);
      assert.equal((await Booking.findById(booking._id)).paymentStatus, 'FULLY_PAID');
      assert.equal((await PaymentLedger.findOne({ merchantTransactionId: txn })).paymentStatus, 'SUCCESS');
    });

    test('another user cannot verify my cart checkout payment, and nothing is mutated', async () => {
      const { booking } = await createPendingBooking();
      const txn = booking.phonePeMerchantTransactionId;
      await phonepe.setMockOutcome(txn, 'success');

      const res = verifyRes();
      await checkoutController.verifyCartPayment({ params: { merchantTransactionId: txn }, user: { _id: otherUser._id }, body: {} }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 403);
      assert.equal((await Booking.findById(booking._id)).status, 'pending_payment', 'ownership rejection must not mutate payment state');

      const ok = verifyRes();
      await checkoutController.verifyCartPayment({ params: { merchantTransactionId: txn }, user: { _id: user._id }, body: {} }, ok, (e) => { throw e; });
      assert.equal(ok.body.success, true);
      assert.equal((await Booking.findById(booking._id)).status, 'paid');
    });

    test('an unknown transaction ID cannot be verified through the cart endpoint', async () => {
      const res = verifyRes();
      await checkoutController.verifyCartPayment({ params: { merchantTransactionId: 'ZUT_NO_SUCH_TXN' }, user: { _id: user._id }, body: {} }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 404);
      assert.notEqual(res.body.success, true);
    });

    test('another user cannot verify my marketplace order, and nothing is mutated', async () => {
      const txn = `ZOM_TEST_${Date.now()}`;
      const order = await createMarketplaceOrder(txn);
      await phonepe.setMockOutcome(txn, 'success');

      const res = verifyRes();
      await marketplaceController.verifyPhonePeOrder({ params: { merchantTransactionId: txn }, user: { _id: otherUser._id } }, res, (e) => { throw e; });
      assert.equal(res.statusCode, 403);
      assert.equal((await Order.findById(order._id)).status, 'pending_payment', 'ownership rejection must not mutate the order');

      // Unknown transaction → 404, never a status oracle.
      const unknown = verifyRes();
      await marketplaceController.verifyPhonePeOrder({ params: { merchantTransactionId: 'ZOM_NO_SUCH_TXN' }, user: { _id: user._id } }, unknown, (e) => { throw e; });
      assert.equal(unknown.statusCode, 404);

      // The legitimate owner still succeeds.
      const ok = verifyRes();
      await marketplaceController.verifyPhonePeOrder({ params: { merchantTransactionId: txn }, user: { _id: user._id } }, ok, (e) => { throw e; });
      assert.equal(ok.body.success, true);
      assert.equal((await Order.findById(order._id)).status, 'paid');
    });
  });

  /* ── F2/F3. cross-worker consistency, expiry, cleanup ──────────────────── */

  describe('cross-worker mock state and expiry', () => {
    const { execFileSync } = require('child_process');
    const pathMod          = require('path');
    const MockPaymentState = require('../src/models/MockPaymentState');

    test('an outcome driven on one worker is observed by another worker process', async () => {
      const txn = `ZUT_XWORKER_${Date.now()}`;
      await phonepe.setMockOutcome(txn, 'failure');

      const phonepePath = pathMod.join(__dirname, '../src/utils/phonepe.js');
      const script = `
        process.env.PAYMENT_MODE = 'mock';
        const phonepe  = require(${JSON.stringify(phonepePath)});
        const mongoose = require('mongoose');
        (async () => {
          await mongoose.connect(${JSON.stringify(TEST_URI)});
          const outcome = await phonepe.getMockOutcome(${JSON.stringify(txn)});
          const status  = await phonepe.checkPhonePeStatus(${JSON.stringify(txn)});
          const sig     = phonepe.getMockWebhookChecksum('cross-worker-body');
          console.log(JSON.stringify({ outcome, state: status.state, sig }));
          await mongoose.disconnect();
        })().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
      `;
      const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 60000 });
      const workerB = JSON.parse(out.trim().split('\n').pop());

      assert.equal(workerB.outcome, 'failure', 'worker B must observe the outcome driven by worker A');
      assert.equal(workerB.state, 'FAILED', 'worker B must never fall back to the default success');
      assert.equal(
        await phonepe.verifyWebhookChecksum('cross-worker-body', workerB.sig), true,
        'the mock webhook secret must be identical in every worker'
      );
    });

    test('an explicitly driven failure never degrades to success when its state expires', async () => {
      const txn = `ZUT_EXPIRE_${Date.now()}`;
      await phonepe.setMockOutcome(txn, 'failure');
      await MockPaymentState.updateOne({ _id: txn }, { $set: { outcomeExpiresAt: new Date(Date.now() - 1000) } });

      assert.equal(await phonepe.getMockOutcome(txn), 'pending', 'expired explicit outcomes read as pending, never the default success');
      const s = await phonepe.checkPhonePeStatus(txn);
      assert.equal(s.success, false, 'an expired failure must not become a success');
      assert.equal(s.state, 'PENDING');
    });

    test('stale mock outcomes are physically cleaned up by the TTL index', async () => {
      await MockPaymentState.init();
      const indexes = await MockPaymentState.collection.indexes();
      const ttl = indexes.find((i) => i.key && i.key.expiresAt === 1);
      assert.ok(ttl, 'an expiresAt index must exist on MockPaymentState');
      assert.equal(ttl.expireAfterSeconds, 0, 'documents must be deleted at expiresAt');

      const key = `ZUT_TTL_${Date.now()}`;
      await phonepe.setMockOutcome(key, 'pending');
      const doc = await MockPaymentState.findById(key).lean();
      assert.ok(doc, 'the driven state is persisted');
      assert.ok(new Date(doc.expiresAt) > new Date(doc.outcomeExpiresAt),
        'physical cleanup must outlive the logical expiry so expiry-to-pending is always observed first');
    });
  });
});
