/**
 * Notification Engine hardening regression suite.
 *
 * Covers the six security/hygiene fixes:
 *   1. Email body values are HTML-escaped; email subjects are CR/LF-sanitized
 *      (VariableResolver / TemplateEngine).
 *   2. OTP generation uses a CSPRNG, always a 6-digit string (OtpService).
 *   3. OTP fields are encrypted at enqueue, decrypted only for rendering, and
 *      never persisted in plaintext in NotificationJob or NotificationLog
 *      (otpPayload / JobQueue / Worker / bootstrap).
 *   4. OTP_VERIFICATION declares otp.code as a required variable.
 *   5. NotificationMapping purpose backfill classifies blank purposes, never
 *      overwrites an admin-set purpose, and leaves unknown events ambiguous.
 *   6. Dead pandit OTP email mappings are disabled (documented, reversible).
 *
 * Uses Node's built-in test runner. Runs against a dedicated TEST database
 * (MONGO_URI_TEST or mongodb://127.0.0.1:27017/zutsav_notification_hardening_test)
 * and drops the affected collections before each block. Never touches
 * dev/prod data.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_notification_hardening_test';

const NotificationMapping = require('../src/models/NotificationMapping');
const NotificationJob = require('../src/models/NotificationJob');
const NotificationLog = require('../src/models/NotificationLog');

const JobQueue = require('../notification-engine/queue/JobQueue');
const Worker = require('../notification-engine/queue/Worker');
const bootstrap = require('../notification-engine/bootstrap');
const EmailProvider = require('../notification-engine/providers/EmailProvider');
const TemplateEngine = require('../notification-engine/templates/TemplateEngine');
const TemplateValidator = require('../notification-engine/templates/TemplateValidator');
const { getRequiredVariables } = require('../notification-engine/variables/VariableSchemas');
const VariableResolver = require('../notification-engine/variables/VariableResolver');
const OtpService = require('../notification-engine/otp/OtpService');
const otpPayload = require('../notification-engine/security/otpPayload');
const { run: runPurposeBackfill, buildClassificationMap } = require('../src/scripts/backfillNotificationMappingPurpose');
const { run: runDeadPanditCleanup } = require('../src/scripts/disableDeadPanditEmailMappings');

async function cleanCollections() {
  await Promise.all([
    NotificationMapping.deleteMany({}),
    NotificationJob.deleteMany({}),
    NotificationLog.deleteMany({}),
  ]);
}

before(async () => {
  await mongoose.connect(TEST_URI);
});
after(async () => {
  await mongoose.disconnect();
});

// ═════════════════════════════════════════════════════════════════════════
// 1. EMAIL INTERPOLATION HARDENING
// ═════════════════════════════════════════════════════════════════════════
describe('email interpolation hardening', () => {
  test('escapeHtml neutralizes every HTML metacharacter', () => {
    const out = VariableResolver.escapeHtml(`<img src=x onerror="alert('x')"> & '`);
    assert.equal(out, '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; &#39;');
  });

  test('interpolateHtml escapes payload values but leaves template markup', () => {
    const payload = { customer: { name: '<b>Bob & Alice</b>' } };
    const html = VariableResolver.interpolateHtml('<p>{{customer.name}}</p>', payload);
    assert.equal(html, '<p>&lt;b&gt;Bob &amp; Alice&lt;/b&gt;</p>');
  });

  test('interpolateSubject strips CR/LF (header-injection guard)', () => {
    const payload = { customer: { name: 'Hi\r\nBcc: evil@example.com' } };
    const subject = VariableResolver.interpolateSubject('Subject {{customer.name}}', payload);
    assert.equal(/[\r\n]/.test(subject), false);
    assert.equal(subject, 'Subject Hi Bcc: evil@example.com');
  });

  test('renderEmail escapes the body and sanitizes the subject', () => {
    const mapping = {
      emailSubject: 'Hi {{customer.name}}',
      emailHtml: '<h1>{{customer.name}}</h1>',
    };
    const payload = { customer: { name: 'A\r\nB & <script>alert(1)</script>' } };
    const { subject, html } = TemplateEngine.render('email', mapping, payload);
    assert.equal(/[\r\n]/.test(subject), false);
    assert.ok(html.startsWith('<h1>'));
    assert.ok(html.endsWith('</h1>'));
    assert.equal(html.includes('<script>'), false);
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. OTP GENERATION
// ═════════════════════════════════════════════════════════════════════════
describe('OTP generation', () => {
  test('is always a 6-character numeric string', () => {
    for (let i = 0; i < 3000; i++) {
      assert.match(OtpService.generate(), /^\d{6}$/);
    }
  });

  test('hash/compare round-trips', async () => {
    const otp = OtpService.generate();
    const hashed = await OtpService.hash(otp);
    assert.equal(await OtpService.compare(otp, hashed, true), true);
    assert.equal(await OtpService.compare('000000', hashed, true), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. OTP PAYLOAD REDACTION
// ═════════════════════════════════════════════════════════════════════════
describe('OTP payload redaction', () => {
  test('encrypts otp.code without leaking plaintext and does not mutate input', () => {
    const payload = { customer: { name: 'A' }, otp: { code: '123456' } };
    const safe = otpPayload.redactSensitivePayload(payload);
    assert.notEqual(safe.otp.code, '123456');
    assert.ok(otpPayload.isEncrypted(safe.otp.code));
    assert.equal(JSON.stringify(safe).includes('123456'), false);
    assert.equal(payload.otp.code, '123456');
  });

  test('rehydrate restores the exact code (including leading zero)', () => {
    const safe = otpPayload.redactSensitivePayload({ otp: { code: '042817' } });
    const back = otpPayload.rehydrateSensitivePayload(safe);
    assert.equal(back.otp.code, '042817');
  });

  test('preserves non-sensitive fields and Date instances', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    const safe = otpPayload.redactSensitivePayload({
      booking: { date }, amount: 500, coupon: { code: 'SAVE10' }, otp: { code: '111111' },
    });
    assert.equal(safe.booking.date, date);
    assert.equal(safe.amount, 500);
    assert.equal(safe.coupon.code, 'SAVE10');
  });

  test('collectSensitiveValues finds canonical and alternate paths', () => {
    const values = otpPayload.collectSensitiveValues({
      otp: { code: '246810' }, verificationCode: '998877', resetCode: '',
    });
    assert.deepEqual(values.sort(), ['246810', '998877']);
  });

  test('scrubText and scrubDeep replace sensitive values in rendered content', () => {
    const secrets = ['246810'];
    assert.equal(otpPayload.scrubText('code is 246810', secrets), 'code is [REDACTED]');
    const scrubbed = otpPayload.scrubDeep({ body: 'code 246810', n: 5 }, secrets);
    assert.equal(scrubbed.body, 'code [REDACTED]');
    assert.equal(scrubbed.n, 5);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 4. OTP PERSISTENCE (job + log)
// ═════════════════════════════════════════════════════════════════════════
describe('OTP persistence in the queue and logs', () => {
  const originalEmailSend = EmailProvider.send;
  let emailCalls = [];

  before(async () => {
    await cleanCollections();
    emailCalls = [];
    EmailProvider.send = async (opts) => {
      emailCalls.push(opts);
      return { messageId: 'test-message-id' };
    };
    await bootstrap.init();
  });

  after(() => {
    EmailProvider.send = originalEmailSend;
  });

  const OTP = '246810';

  test('a queued job stores the OTP encrypted, never as plaintext', async () => {
    const mapping = await NotificationMapping.create({
      eventName: 'OTP_VERIFICATION', recipientType: 'user', channel: 'email', purpose: 'ACCOUNT',
      emailSubject: 'Your code', emailHtml: '<p>Your code is {{otp.code}}</p>', enabled: true,
    });
    await JobQueue.enqueue({
      eventName: 'OTP_VERIFICATION',
      mappingId: mapping._id,
      channel: 'email',
      recipient: { userId: null, phone: '', email: 'hardening@test.zutsav.local' },
      normalizedPayload: { customer: { name: 'Hardening', email: 'hardening@test.zutsav.local' }, otp: { code: OTP } },
    });

    const job = await NotificationJob.findOne({ eventName: 'OTP_VERIFICATION' });
    assert.equal(JSON.stringify(job.toObject()).includes(OTP), false);
    assert.ok(otpPayload.isEncrypted(job.normalizedPayload.otp.code));
  });

  test('the worker renders the real OTP (delivery correctness preserved)', async () => {
    await Worker.tick();
    assert.equal(emailCalls.length, 1);
    assert.ok(String(emailCalls[0].html).includes(OTP), 'provider must receive the real code');
    const job = await NotificationJob.findOne({ eventName: 'OTP_VERIFICATION' });
    assert.equal(job.status, 'delivered');
  });

  test('no NotificationLog row contains the plaintext OTP', async () => {
    const logs = await NotificationLog.find({ event: 'OTP_VERIFICATION' }).lean();
    assert.ok(logs.length >= 2, 'expected processing + delivered logs');
    for (const log of logs) {
      assert.equal(JSON.stringify(log).includes(OTP), false, `log (${log.status}) leaked the OTP`);
    }
    const delivered = logs.find((l) => l.status === 'delivered');
    assert.ok(delivered);
    assert.ok(String(delivered.renderedContent.html).includes(otpPayload.REDACTED));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 5. OTP VARIABLE SCHEMA
// ═════════════════════════════════════════════════════════════════════════
describe('OTP_VERIFICATION required variables', () => {
  test('declares otp.code', () => {
    assert.ok(getRequiredVariables('OTP_VERIFICATION').includes('otp.code'));
  });

  test('validator rejects a payload with no OTP', () => {
    const result = TemplateValidator.validate('OTP_VERIFICATION', '', { customer: { name: 'A' } });
    assert.equal(result.valid, false);
    assert.ok(result.missing.includes('otp.code'));
  });

  test('validator accepts a payload with a name and OTP', () => {
    const result = TemplateValidator.validate('OTP_VERIFICATION', '', {
      customer: { name: 'A' }, otp: { code: '123456' },
    });
    assert.equal(result.valid, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 6. PURPOSE BACKFILL
// ═════════════════════════════════════════════════════════════════════════
describe('NotificationMapping purpose backfill', () => {
  before(async () => {
    await cleanCollections();
    const now = new Date();
    // Raw inserts bypass Mongoose defaults — exactly pre-v1.2.0 documents.
    await NotificationMapping.collection.insertMany([
      { eventName: 'BOOKING_CONFIRMED', recipientType: 'user', channel: 'whatsapp', enabled: true, createdAt: now, updatedAt: now },
      { eventName: 'CAMPAIGN_COUPON', recipientType: 'user', channel: 'whatsapp', enabled: true, createdAt: now, updatedAt: now },
      { eventName: 'SERVICE_COMPLETED', recipientType: 'user', channel: 'whatsapp', enabled: true, purpose: 'SERVICE', createdAt: now, updatedAt: now },
      { eventName: 'USER_REGISTERED', recipientType: 'user', channel: 'whatsapp', enabled: true, purpose: 'MARKETING', createdAt: now, updatedAt: now },
      { eventName: 'BLOG_PUBLISHED', recipientType: 'user', channel: 'whatsapp', enabled: true, createdAt: now, updatedAt: now },
    ]);
  });

  test('classification map is authoritative (CAMPAIGN_COUPON → MARKETING)', () => {
    const { map } = buildClassificationMap();
    assert.equal(map.get('CAMPAIGN_COUPON'), 'MARKETING');
    assert.equal(map.get('BOOKING_CONFIRMED'), 'BOOKING');
    assert.equal(map.get('USER_REGISTERED'), 'ACCOUNT');
    assert.equal(map.has('BLOG_PUBLISHED'), false);
  });

  test('fills blank purposes, preserves admin-set ones, leaves unknown ambiguous', async () => {
    const result = await runPurposeBackfill({ leaveConnected: true });
    assert.equal(result.stats.classified, 2);
    assert.equal(result.stats['already-valid'], 1);
    assert.equal(result.stats['preserved-custom'], 1);
    assert.equal(result.stats.ambiguous, 1);

    const booking = await NotificationMapping.findOne({ eventName: 'BOOKING_CONFIRMED' }).lean();
    assert.equal(booking.purpose, 'BOOKING');
    const campaign = await NotificationMapping.findOne({ eventName: 'CAMPAIGN_COUPON' }).lean();
    assert.equal(campaign.purpose, 'MARKETING', 'the marketing gate must become active');
    const custom = await NotificationMapping.findOne({ eventName: 'USER_REGISTERED' }).lean();
    assert.equal(custom.purpose, 'MARKETING', 'admin-set purpose must never be overwritten');
    const blog = await NotificationMapping.findOne({ eventName: 'BLOG_PUBLISHED' }).lean();
    assert.equal(blog.purpose, undefined, 'ambiguous events are left untouched');
  });

  test('is idempotent — a second run classifies nothing new', async () => {
    const result = await runPurposeBackfill({ leaveConnected: true });
    assert.equal(result.stats.classified, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 7. DEAD PANDIT EMAIL MAPPINGS
// ═════════════════════════════════════════════════════════════════════════
describe('dead pandit email mapping cleanup', () => {
  before(async () => {
    await cleanCollections();
    await NotificationMapping.create([
      { eventName: 'OTP_VERIFICATION', recipientType: 'pandit', channel: 'email', purpose: 'ACCOUNT', emailSubject: 'x', emailHtml: 'y', enabled: true },
      { eventName: 'PASSWORD_RESET_EMAIL_OTP', recipientType: 'pandit', channel: 'email', purpose: 'ACCOUNT', emailSubject: 'x', emailHtml: 'y', enabled: true },
      { eventName: 'OTP_VERIFICATION', recipientType: 'user', channel: 'email', purpose: 'ACCOUNT', emailSubject: 'x', emailHtml: 'y', enabled: true },
    ]);
  });

  test('disables exactly the two dead pandit email mappings', async () => {
    const result = await runDeadPanditCleanup({ leaveConnected: true });
    assert.equal(result.results.every((r) => r.action === 'disabled'), true);

    const panditOtp = await NotificationMapping.findOne({ eventName: 'OTP_VERIFICATION', recipientType: 'pandit' }).lean();
    const panditReset = await NotificationMapping.findOne({ eventName: 'PASSWORD_RESET_EMAIL_OTP', recipientType: 'pandit' }).lean();
    assert.equal(panditOtp.enabled, false);
    assert.equal(panditReset.enabled, false);

    // The live user-recipient mapping is untouched.
    const userOtp = await NotificationMapping.findOne({ eventName: 'OTP_VERIFICATION', recipientType: 'user' }).lean();
    assert.equal(userOtp.enabled, true);
  });

  test('is idempotent — a second run reports already-disabled', async () => {
    const result = await runDeadPanditCleanup({ leaveConnected: true });
    assert.equal(result.results.every((r) => r.action === 'already-disabled'), true);
  });
});
