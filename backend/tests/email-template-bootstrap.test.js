/**
 * All Transactional Email Templates — bootstrap regression suite.
 *
 * Verifies the master email bootstrap registry + script:
 *   1. Registry integrity (valid events/statuses, no duplicate key, approved
 *      entries complete, non-approved entries carry a reason).
 *   2. Every approved template renders through the one TemplateEngine: required
 *      variables resolve, no referenced placeholder is missing, and payload
 *      values are HTML-escaped / subjects CR/LF-sanitized.
 *   3. Shared shell: footer + CTA markers are used (never authored per-template)
 *      and the shared render context fills them with no marker leakage.
 *   4. No localhost URL is authored into any approved template.
 *   5. Idempotent DB apply: first run creates the approved set, second run is
 *      all ALREADY-CORRECT, and no non-approved mapping is ever created.
 *   6. Non-destructive contract: admin-customized content is preserved, a
 *      disabled mapping is never re-enabled, and the OTP/password-reset family
 *      is left untouched.
 *
 * Uses Node's built-in test runner against a dedicated TEST database
 * (MONGO_URI_TEST or mongodb://127.0.0.1:27017/zutsav_email_bootstrap_test).
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_email_bootstrap_test';

const NotificationMapping = require('../src/models/NotificationMapping');
const {
  STATUS,
  TRANSACTIONAL_EMAIL_TEMPLATES,
  APPROVED_EMAIL_TEMPLATES,
} = require('../notification-engine/email/allTransactionalEmailTemplates');
const {
  normalizeBookingPayload,
  normalizeOrderPayload,
  normalizePanditPayload,
  normalizePoojaRequestPayload,
  normalizeUserPayload,
} = require('../notification-engine/variables/PayloadNormalizer');
const { extractPlaceholders } = require('../notification-engine/variables/VariableResolver');
const { validate } = require('../notification-engine/templates/TemplateValidator');
const TemplateEngine = require('../notification-engine/templates/TemplateEngine');
const EmailRenderContext = require('../notification-engine/email/EmailRenderContext');
const {
  FOOTER_MARKER, CTA_MARKER,
} = EmailRenderContext;

const bootstrap = require('../src/scripts/bootstrapAllTransactionalEmailTemplates');
const { run: runBootstrap, ACTIONS } = bootstrap;

const APPROVED = APPROVED_EMAIL_TEMPLATES;

// ── Representative canonical payloads (PayloadNormalizer output shapes) ─────
const sampleUser = { _id: 'u1', name: 'Asha', email: 'asha@example.com', phone: '9999999999' };
const samplePandit = { _id: 'p1', userId: 'u2', name: 'Guru Ji', email: 'guru@example.com', phone: '8888888888' };
const sampleBooking = {
  _id: 'b1',
  bookingNumber: 'BK-1001',
  scheduledDate: new Date('2026-10-01T00:00:00Z'),
  scheduledTime: '10:00 AM',
  grandTotal: 2100,
  amountPaid: 500,
  paymentStatus: 'PARTIALLY_PAID',
  status: 'paid',
  userDetails: { name: 'Asha', phone: '9999999999', email: 'asha@example.com' },
};
const sampleOrder = {
  _id: 'o1',
  orderNumber: 'OR-2001',
  totalAmount: 999,
  status: 'confirmed',
  userId: sampleUser,
  refundStatus: 'processed',
};
const sampleRequest = {
  poojaName: 'Navratri Pooja',
  expectedPrice: 1100,
  adminApprovedPrice: 1200,
  rejectionReason: 'Incomplete details',
};

const bookingPayload = () => normalizeBookingPayload({
  booking: sampleBooking,
  user: sampleUser,
  pandit: samplePandit,
  poojaName: 'Satyanarayan Pooja',
  payment: { amount: 500 },
  refund: { amount: 500, status: 'processed' },
  reason: 'Schedule conflict',
  kit: { courier: 'BlueDart', trackingId: 'BD123' },
  otp: '654321',
});
const orderPayload = () => normalizeOrderPayload({
  order: sampleOrder,
  user: sampleUser,
  shipment: { courierName: 'BlueDart', trackingNumber: 'BD123' },
  reason: 'Damaged',
});
const userPayload = () => normalizeUserPayload({
  user: sampleUser,
  scheduledDate: '1 October 2026',
  requestedDate: '1 September 2026',
  reason: 'Requested',
});
const panditPayload = () => normalizePanditPayload({
  pandit: samplePandit,
  user: sampleUser,
  reason: 'Blurry document',
  amount: 1500,
});
const poojaRequestPayload = () => normalizePoojaRequestPayload({
  request: sampleRequest,
  pandit: samplePandit,
});

const BOOKING_EVENTS = [
  'BOOKING_CONFIRMED', 'PAYMENT_SUCCESS', 'SERVICE_REMINDER_24H', 'SERVICE_REMINDER_1H',
  'INVOICE_GENERATED', 'BOOKING_CANCELLED', 'PARTIAL_PAYMENT_RECEIVED', 'FINAL_PAYMENT_RECEIVED',
  'PAYMENT_FAILED', 'BOOKING_REFUNDED', 'KIT_SHIPPED', 'PANDIT_ASSIGNMENT_PENDING',
];
const ORDER_EVENTS = ['ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_REFUNDED'];
const USER_EVENTS = ['ACCOUNT_DELETED', 'ACCOUNT_DELETION_CANCELLED', 'ACCOUNT_RESTORED'];
const PANDIT_EVENTS = ['PANDIT_APPROVED', 'KYC_APPROVED', 'KYC_REJECTED', 'KYC_REUPLOAD_REQUIRED'];
const POOJA_EVENTS = ['PANDIT_POOJA_REQUEST_CREATED', 'PANDIT_POOJA_APPROVED', 'PANDIT_POOJA_REJECTED'];

function payloadFor(eventName) {
  if (ORDER_EVENTS.includes(eventName)) return orderPayload();
  if (USER_EVENTS.includes(eventName)) return userPayload();
  if (PANDIT_EVENTS.includes(eventName)) return panditPayload();
  if (POOJA_EVENTS.includes(eventName)) return poojaRequestPayload();
  return bookingPayload();
}

function sampleDeps(overrides = {}) {
  return {
    get: (field, fallback) => Promise.resolve(fallback),
    company: {
      name: 'Zutsav',
      supportEmail: 'support@zutsav.com',
      supportPhone: '+91 90000 00000',
      privacyUrl: 'https://zutsav.com/privacy',
      termsUrl: 'https://zutsav.com/terms',
      websiteUrl: 'https://zutsav.com',
    },
    urls: { clientUrl: 'https://app.zutsav.com' },
    production: false,
    ...overrides,
  };
}

before(async () => {
  await mongoose.connect(TEST_URI);
});
after(async () => {
  await mongoose.disconnect();
});

async function cleanMappings() {
  await NotificationMapping.deleteMany({});
}

// ═════════════════════════════════════════════════════════════════════════
// 1. REGISTRY INTEGRITY
// ═════════════════════════════════════════════════════════════════════════
describe('transactional email registry', () => {
  test('every entry is a well-formed email mapping with a valid status', () => {
    assert.ok(APPROVED.length >= 20, `expected a broad approved set, got ${APPROVED.length}`);
    for (const e of TRANSACTIONAL_EMAIL_TEMPLATES) {
      assert.equal(e.channel, 'email', `${e.eventName} channel`);
      assert.ok(['user', 'pandit', 'admin', 'referral_pandit'].includes(e.recipientType), `${e.eventName} recipientType`);
      assert.ok([STATUS.APPROVED, STATUS.BLOCKED, STATUS.NOT_VERIFIED].includes(e.status), `${e.eventName} status`);
      assert.equal(typeof e.eventName, 'string');
    }
  });

  test('there is no duplicate (eventName, recipientType) key', () => {
    const seen = new Set();
    for (const e of TRANSACTIONAL_EMAIL_TEMPLATES) {
      const key = `${e.eventName}::${e.recipientType}`;
      assert.equal(seen.has(key), false, `duplicate registry entry ${key}`);
      seen.add(key);
    }
  });

  test('approved entries are complete and carry provenance', () => {
    for (const e of APPROVED) {
      assert.ok(e.emailSubject, `${e.eventName} subject`);
      assert.ok(e.emailHtml, `${e.eventName} html`);
      assert.ok(e.purpose && e.purpose !== 'UNKNOWN', `${e.eventName} purpose`);
      assert.ok(Array.isArray(e.requiredVariables) && e.requiredVariables.length, `${e.eventName} requiredVariables`);
      assert.ok(e.normalizer, `${e.eventName} normalizer`);
      assert.ok(e.recipientSource, `${e.eventName} recipientSource`);
      assert.ok(e.actualEmitter, `${e.eventName} actualEmitter`);
    }
  });

  test('non-approved entries are documented with a reason (and never have content)', () => {
    const excluded = TRANSACTIONAL_EMAIL_TEMPLATES.filter((e) => e.status !== STATUS.APPROVED);
    assert.ok(excluded.length > 0);
    for (const e of excluded) {
      assert.ok(e.reason && e.reason.length > 0, `${e.eventName} needs a reason`);
      assert.equal(e.emailHtml, '', `${e.eventName} must not carry authored html`);
      assert.equal(typeof e.reachable, 'boolean', `${e.eventName} reachable flag`);
    }
  });

  test('every template placeholder is declared required or optional', () => {
    for (const e of APPROVED) {
      const declared = new Set([...e.requiredVariables, ...e.optionalVariables]);
      const referenced = extractPlaceholders(`${e.emailSubject} ${e.emailHtml}`);
      for (const ph of referenced) {
        assert.ok(declared.has(ph), `${e.eventName} references undeclared {{${ph}}}`);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. RENDER CORRECTNESS
// ═════════════════════════════════════════════════════════════════════════
describe('approved templates render cleanly', () => {
  test('validator passes for a representative payload on every approved event', () => {
    for (const e of APPROVED) {
      const payload = payloadFor(e.eventName);
      const raw = `${e.emailSubject} ${e.emailHtml}`;
      const result = validate(e.eventName, raw, payload);
      assert.equal(result.valid, true, `${e.eventName} invalid: missing ${result.missing.join(', ')}`);
    }
  });

  test('rendered body escapes payload HTML and no raw script leaks', () => {
    for (const e of APPROVED) {
      const payload = payloadFor(e.eventName);
      if (payload.customer) payload.customer.name = '<script>alert(1)</script>';
      if (payload.pandit) payload.pandit.name = '<script>alert(2)</script>';
      const { subject, html } = TemplateEngine.render('email', {
        emailSubject: e.emailSubject, emailHtml: e.emailHtml,
      }, payload);
      assert.equal(/<script>/i.test(html), false, `${e.eventName} leaked unescaped markup`);
      assert.equal(/[\r\n]/.test(subject), false, `${e.eventName} subject has CR/LF`);
    }
  });

  test('no approved template authors a localhost/private URL', () => {
    for (const e of APPROVED) {
      const raw = `${e.emailSubject} ${e.emailHtml}`;
      assert.equal(/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(raw), false, `${e.eventName} authors a localhost URL`);
    }
  });

  test('approved templates use the shared shell footer + CTA markers', () => {
    for (const e of APPROVED) {
      assert.ok(e.emailHtml.includes(FOOTER_MARKER), `${e.eventName} missing shared footer marker`);
      assert.ok(e.emailHtml.includes(CTA_MARKER), `${e.eventName} missing shared CTA marker`);
    }
  });

  test('shared render context fills markers and drops none', async () => {
    const entry = APPROVED.find((e) => e.eventName === 'BOOKING_CONFIRMED');
    const payload = payloadFor(entry.eventName);
    const { subject, html } = TemplateEngine.render('email', {
      emailSubject: entry.emailSubject, emailHtml: entry.emailHtml,
    }, payload);

    const ctx = await EmailRenderContext.attach(payload, sampleDeps());
    const final = EmailRenderContext.apply(html, ctx);

    assert.equal(final.includes(FOOTER_MARKER), false, 'footer marker leaked');
    assert.equal(final.includes(CTA_MARKER), false, 'CTA marker leaked');
    assert.ok(ctx.footerHtml.includes('support@zutsav.com'), 'footer should carry support email');
    assert.ok(ctx.ctaHtml.includes('/my-bookings'), 'shared CTA should target /my-bookings');
    assert.ok(final.includes('/my-bookings'), 'CTA missing from rendered email');
  });

  test('production context omits localhost links entirely', async () => {
    const html = `<p>x</p>${FOOTER_MARKER}${CTA_MARKER}`;
    const ctx = await EmailRenderContext.attach({}, sampleDeps({
      production: true,
      company: { name: 'Zutsav', supportEmail: 's@zutsav.com', websiteUrl: 'http://localhost:3000' },
      urls: { clientUrl: 'http://localhost:3000' },
    }));
    const final = EmailRenderContext.apply(html, ctx);
    assert.equal(/localhost|127\.0\.0\.1/i.test(final), false, 'production email must not contain localhost');
    assert.equal(ctx.ctaHtml, '', 'no CTA button without a safe app URL');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. IDEMPOTENT APPLY
// ═════════════════════════════════════════════════════════════════════════
describe('bootstrap apply', () => {
  before(async () => {
    await cleanMappings();
  });

  test('--apply creates exactly the approved set and nothing else', async () => {
    const result = await runBootstrap({ dryRun: false, writeReport: false });
    assert.equal(result.stats[ACTIONS.CREATED], APPROVED.length);

    const emails = await NotificationMapping.find({ channel: 'email' }).lean();
    assert.equal(emails.length, APPROVED.length);

    for (const e of APPROVED) {
      const doc = emails.find((d) => d.eventName === e.eventName && d.recipientType === e.recipientType);
      assert.ok(doc, `${e.eventName} (${e.recipientType}) not created`);
      assert.equal(doc.purpose, e.purpose, `${e.eventName} purpose`);
      assert.equal(doc.emailSubject, e.emailSubject, `${e.eventName} subject`);
      assert.equal(doc.emailHtml, e.emailHtml, `${e.eventName} html`);
      assert.equal(doc.enabled, true, `${e.eventName} should be enabled`);
    }

    assert.equal(await NotificationMapping.countDocuments({ eventName: 'CAMPAIGN_COUPON', channel: 'email' }), 0);
  });

  test('a second --apply is fully idempotent (all ALREADY-CORRECT, no writes)', async () => {
    const result = await runBootstrap({ dryRun: false, writeReport: false });
    assert.equal(result.stats[ACTIONS.ALREADY_CORRECT], APPROVED.length);
    assert.equal(result.stats[ACTIONS.CREATED] || 0, 0);
    assert.equal(result.stats[ACTIONS.UPDATED] || 0, 0);

    const emails = await NotificationMapping.find({ channel: 'email' }).lean();
    assert.equal(emails.length, APPROVED.length);
  });

  test('dry-run performs zero writes', async () => {
    await cleanMappings();
    await NotificationMapping.create({
      eventName: 'OTP_VERIFICATION', recipientType: 'user', channel: 'email', purpose: 'ACCOUNT',
      emailSubject: 'Your code', emailHtml: '<p>{{otp.code}}</p>', enabled: true,
    });

    const result = await runBootstrap({ dryRun: true, writeReport: false });
    assert.equal(result.stats[ACTIONS.CREATED], APPROVED.length, 'dry-run should report planned creates');

    const emails = await NotificationMapping.find({ channel: 'email' }).lean();
    assert.equal(emails.length, 1, 'dry-run must not create mappings');
    assert.equal(emails[0].eventName, 'OTP_VERIFICATION');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 4. NON-DESTRUCTIVE CONTRACT
// ═════════════════════════════════════════════════════════════════════════
describe('non-destructive guarantees', () => {
  before(async () => {
    await cleanMappings();
  });

  test('admin-customized content is preserved, never overwritten', async () => {
    await NotificationMapping.create({
      eventName: 'SERVICE_REMINDER_24H', recipientType: 'user', channel: 'email', purpose: 'BOOKING',
      emailSubject: 'My custom reminder', emailHtml: '<p>Custom {{customer.name}}</p>', enabled: true,
    });

    const result = await runBootstrap({ dryRun: false, writeReport: false });
    const own = result.applied.find((r) => r.eventName === 'SERVICE_REMINDER_24H');
    assert.equal(own.action, ACTIONS.PRESERVED_CUSTOM);

    const doc = await NotificationMapping.findOne({ eventName: 'SERVICE_REMINDER_24H', channel: 'email' }).lean();
    assert.equal(doc.emailSubject, 'My custom reminder');
    assert.equal(doc.emailHtml, '<p>Custom {{customer.name}}</p>');
  });

  test('a blank mapping is filled without changing its enabled flag or explicit purpose', async () => {
    await cleanMappings();
    await NotificationMapping.create({
      eventName: 'ORDER_CONFIRMED', recipientType: 'user', channel: 'email',
      purpose: 'ORDER', emailSubject: '', emailHtml: '', enabled: false,
    });

    const result = await runBootstrap({ dryRun: false, writeReport: false });
    const own = result.applied.find((r) => r.eventName === 'ORDER_CONFIRMED');
    assert.equal(own.action, ACTIONS.UPDATED);

    const doc = await NotificationMapping.findOne({ eventName: 'ORDER_CONFIRMED', channel: 'email' }).lean();
    assert.ok(doc.emailSubject.length > 0, 'content should be filled');
    assert.equal(doc.enabled, false, 'a disabled mapping must never be auto-enabled');
    assert.equal(doc.purpose, 'ORDER', 'explicit purpose preserved');
  });

  test('a blank/UNKNOWN purpose is filled from the registry', async () => {
    await cleanMappings();
    await NotificationMapping.create({
      eventName: 'KIT_SHIPPED', recipientType: 'user', channel: 'email',
      purpose: 'UNKNOWN', emailSubject: '', emailHtml: '', enabled: true,
    });

    await runBootstrap({ dryRun: false, writeReport: false });
    const doc = await NotificationMapping.findOne({ eventName: 'KIT_SHIPPED', channel: 'email' }).lean();
    assert.equal(doc.purpose, 'ORDER');
  });

  test('OTP/password-reset family is never touched (and pandit OTP stays disabled)', async () => {
    await cleanMappings();
    await NotificationMapping.create([
      {
        eventName: 'OTP_VERIFICATION', recipientType: 'user', channel: 'email', purpose: 'ACCOUNT',
        emailSubject: 'Your OTP', emailHtml: '<p>{{otp.code}}</p>', enabled: true,
      },
      {
        eventName: 'OTP_VERIFICATION', recipientType: 'pandit', channel: 'email', purpose: 'ACCOUNT',
        emailSubject: 'Dead', emailHtml: '<p>dead</p>', enabled: false,
      },
      {
        eventName: 'PASSWORD_RESET_EMAIL_OTP', recipientType: 'user', channel: 'email', purpose: 'ACCOUNT',
        emailSubject: 'Reset {{otp.code}}', emailHtml: '<p>{{otp.code}}</p>', enabled: true,
      },
    ]);

    await runBootstrap({ dryRun: false, writeReport: false });

    const userOtp = await NotificationMapping.findOne({ eventName: 'OTP_VERIFICATION', recipientType: 'user' }).lean();
    assert.equal(userOtp.emailSubject, 'Your OTP');
    assert.equal(userOtp.enabled, true);
    const panditOtp = await NotificationMapping.findOne({ eventName: 'OTP_VERIFICATION', recipientType: 'pandit' }).lean();
    assert.equal(panditOtp.enabled, false);
    const reset = await NotificationMapping.findOne({ eventName: 'PASSWORD_RESET_EMAIL_OTP' }).lean();
    assert.equal(reset.emailSubject, 'Reset {{otp.code}}');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 5. REPORT
// ═════════════════════════════════════════════════════════════════════════
describe('bootstrap report', () => {
  test('report markdown contains every required section', () => {
    const md = bootstrap.buildReportMarkdown({
      applied: [{ eventName: 'BOOKING_CONFIRMED', recipientType: 'user', purpose: 'BOOKING', action: ACTIONS.CREATED, id: 'x', actualEmitter: 'e' }],
      skipped: [{ eventName: 'CAMPAIGN_COUPON', recipientType: 'user', action: ACTIONS.SKIPPED_BLOCKED, reachable: true, reason: 'marketing' }],
      mode: 'dry-run',
      dbName: 'test',
      dbHost: 'localhost',
    });
    for (const needle of ['# All Transactional Email Templates', 'BOOKING_CONFIRMED', 'CAMPAIGN_COUPON', 'SKIPPED-BLOCKED', 'Contract notes']) {
      assert.ok(md.includes(needle), `report missing "${needle}"`);
    }
  });
});
