/**
 * Tests for the WhatsApp Consent Phase 5 implementation — the OUTBOUND
 * consent gate + communication purpose:
 *   - NotificationMapping.purpose (enum, UNKNOWN default, never marketing by default)
 *   - WhatsAppChannel consent gate: MARKETING requires explicit opted_in;
 *     opted_out / not_set / missing preference block; ACCOUNT/BOOKING/ORDER/
 *     SERVICE always continue (transactional communication never blocked)
 *   - Retry semantics: the gate re-reads consent at every execution
 *   - Per-recipient consent evaluation
 *   - bootstrapNotificationMappings.js v1.2.0: fresh DB, idempotency (second
 *     run = zero writes), existing-DB compatibility (blank purpose filled,
 *     admin-customized purpose preserved, content customizations preserved)
 *   - validateWhatsAppMappings purpose visibility check
 *
 * Uses Node's built-in test runner (node:test). Run: cd backend && node --test
 * Runs against a dedicated TEST database (MONGO_URI_TEST or
 * mongodb://127.0.0.1:27017/zutsav_consent_phase5_test) and drops the
 * affected collections before the run. Never touches dev/prod data.
 *
 * NOTE: this suite intentionally uses its OWN database, separate from
 * consent-phase1-3.test.js — node --test runs files concurrently in
 * separate processes, and sharing a DB would let each suite's deleteMany
 * wipe the other's fixtures mid-run.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_consent_phase5_test';

const User = require('../src/models/User');
const WhatsAppTemplate = require('../src/models/WhatsAppTemplate');
const NotificationMapping = require('../src/models/NotificationMapping');
const WhatsAppPreference = require('../src/models/WhatsAppPreference');
const WhatsAppConsentEvent = require('../src/models/WhatsAppConsentEvent');
const consentService = require('../src/services/consentService');
const WhatsAppChannel = require('../notification-engine/channels/WhatsAppChannel');
const WhatsAppProvider = require('../notification-engine/providers/WhatsAppProvider');
const { validateWhatsAppMappings } = require('../notification-engine/bootstrap');
const bootstrap = require('../src/scripts/bootstrapNotificationMappings');

let _seq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++)); // 9XXXXXXXXX, 10 digits, first digit 9
const uniqName = () => `Phase5 User ${_seq}`;

async function cleanCollections() {
  await Promise.all([
    NotificationMapping.deleteMany({}),
    WhatsAppTemplate.deleteMany({}),
    User.deleteMany({}),
    WhatsAppPreference.deleteMany({}),
    WhatsAppConsentEvent.deleteMany({}),
  ]);
}

async function createUser({ phone, withPreference = false, marketing = null, service = null }) {
  const user = await User.create({
    name: uniqName(),
    phone,
    email: `phase5_${Date.now()}_${_seq}@test.zutsav.local`,
    password: 'dummy-hash-not-used',
  });
  if (withPreference) {
    await consentService.getOrCreatePreference({ userId: user._id, phone, whatsappVerified: true });
    if (marketing === true) {
      await consentService.recordOptIn({ userId: user._id, phone, purpose: 'marketing', source: 'preference_center' });
    } else if (marketing === false) {
      await consentService.recordOptOut({ userId: user._id, phone, purpose: 'marketing', source: 'whatsapp_keyword' });
    }
    if (service === false) {
      await consentService.recordOptOut({ userId: user._id, phone, purpose: 'service', source: 'preference_center' });
    }
  }
  return user;
}

/** Fully-valid WhatsApp fixture: template + mapping + payload that pass the
 * channel's template/validator checks, so a successful send reaches the
 * (patched) provider. */
async function createWhatsAppFixture({ purpose, eventName = 'BOOKING_CONFIRMED', user }) {
  const tmpl = await WhatsAppTemplate.create({
    name: 'test_marketing',
    status: 'APPROVED',
    language: 'en',
    syncedAt: new Date(),
    components: [{ type: 'BODY', text: 'Hello {{1}}' }],
  });
  const mapping = await NotificationMapping.create({
    eventName,
    recipientType: 'user',
    channel: 'whatsapp',
    purpose,
    whatsappTemplateName: tmpl.name,
    whatsappVariables: [{ position: 1, payloadPath: 'customer.name', label: 'Customer name' }],
    enabled: true,
  });
  const payload = {
    _eventName: eventName,
    customer: { name: uniqName(), userId: String(user._id), phone: user.phone, email: user.email },
    booking: { number: 'ZUT-TEST-001', date: '2026-08-20', time: '10:00 AM' },
  };
  return { tmpl, mapping, payload };
}

// ── Provider spy: record calls instead of hitting Meta ──────────────────────
const originalSend = WhatsAppProvider.send;
let providerCalls = [];

before(async () => {
  await mongoose.connect(TEST_URI);
  await cleanCollections();
  WhatsAppProvider.send = async (opts) => {
    providerCalls.push(opts);
    return { messages: [{ id: 'wamid.test' }] };
  };
});

after(async () => {
  WhatsAppProvider.send = originalSend;
  await mongoose.disconnect();
});

// ═════════════════════════════════════════════════════════════════════════
// PURPOSE MODEL
// ═════════════════════════════════════════════════════════════════════════
describe('NotificationMapping purpose', () => {
  test('accepts every valid purpose', async () => {
    for (const purpose of ['ACCOUNT', 'BOOKING', 'ORDER', 'SERVICE', 'MARKETING', 'UNKNOWN']) {
      const m = await NotificationMapping.create({
        eventName: 'USER_REGISTERED', recipientType: 'user', channel: 'email', purpose,
      });
      assert.equal(m.purpose, purpose);
    }
  });

  test('rejects an invalid purpose', async () => {
    await assert.rejects(
      NotificationMapping.create({
        eventName: 'USER_REGISTERED', recipientType: 'user', channel: 'email', purpose: 'SPAM',
      }),
      /purpose/
    );
  });

  test('defaults to UNKNOWN — never silently marketing', async () => {
    const m = await NotificationMapping.create({
      eventName: 'USER_REGISTERED', recipientType: 'user', channel: 'email',
    });
    assert.equal(m.purpose, 'UNKNOWN');
  });

  test('legacy doc (no purpose field) reads as undefined, not marketing', async () => {
    // Raw insert bypasses Mongoose defaults — exactly a pre-v1.2.0 document.
    const { insertedId } = await NotificationMapping.collection.insertOne({
      eventName: 'USER_REGISTERED', recipientType: 'user', channel: 'email',
      enabled: true, createdAt: new Date(), updatedAt: new Date(),
    });
    const legacy = await NotificationMapping.findById(insertedId).lean();
    assert.equal(legacy.purpose, undefined); // the gate treats this as non-marketing
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CONSENT GATE — MARKETING
// ═════════════════════════════════════════════════════════════════════════
describe('WhatsApp consent gate (MARKETING)', () => {
  let userOptedIn, userOptedOut, userNotSet, userNoPref;

  before(async () => {
    providerCalls = [];
    userOptedIn  = await createUser({ phone: uniqPhone(), withPreference: true, marketing: true });
    userOptedOut = await createUser({ phone: uniqPhone(), withPreference: true, marketing: false });
    userNotSet   = await createUser({ phone: uniqPhone(), withPreference: true, marketing: null });
    userNoPref   = await createUser({ phone: uniqPhone(), withPreference: false });
  });

  test('opted_in → provider is called (marketing allowed)', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user: userOptedIn });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(userOptedIn._id), phone: userOptedIn.phone, email: userOptedIn.email,
    });
    assert.equal(result.skip, undefined);
    assert.equal(providerCalls.length, calls + 1);
    assert.equal(providerCalls[calls].templateName, 'test_marketing');
  });

  test('opted_out → provider NOT called (blocked)', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user: userOptedOut });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(userOptedOut._id), phone: userOptedOut.phone, email: userOptedOut.email,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, calls); // Meta never called
  });

  test('not_set → provider NOT called (blocked)', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user: userNotSet });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(userNotSet._id), phone: userNotSet.phone, email: userNotSet.email,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, calls);
  });

  test('no WhatsAppPreference → provider NOT called (blocked)', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user: userNoPref });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(userNoPref._id), phone: userNoPref.phone, email: userNoPref.email,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, calls);
  });

  test('invalid/sample userId (dry-run id) does not throw — treated as no consent', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user: userOptedIn });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: 'sample-user-id', phone: userOptedIn.phone, email: userOptedIn.email,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, calls);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CONSENT GATE — NON-MARKETING (transactional must NEVER be blocked)
// ═════════════════════════════════════════════════════════════════════════
describe('WhatsApp consent gate (non-marketing)', () => {
  let userOptedOut;

  before(async () => {
    userOptedOut = await createUser({ phone: uniqPhone(), withPreference: true, marketing: false });
  });

  test('marketing opted_out does NOT block ACCOUNT/BOOKING/ORDER/SERVICE', async () => {
    for (const purpose of ['ACCOUNT', 'BOOKING', 'ORDER', 'SERVICE']) {
      providerCalls = [];
      const { mapping, payload } = await createWhatsAppFixture({ purpose, user: userOptedOut });
      const result = await WhatsAppChannel.send(mapping, payload, {
        userId: String(userOptedOut._id), phone: userOptedOut.phone, email: userOptedOut.email,
      });
      assert.equal(result.skip, undefined, `${purpose} must send despite marketing opt-out`);
      assert.equal(providerCalls.length, 1, `${purpose} must reach the provider`);
    }
  });

  test('mapping with NO purpose is never treated as marketing and never blocks', async () => {
    providerCalls = [];
    const { mapping, payload } = await createWhatsAppFixture({ purpose: undefined, user: userOptedOut });
    // Simulate a legacy doc that predates the purpose field entirely.
    await NotificationMapping.updateOne({ _id: mapping._id }, { $unset: { purpose: '' } });
    const legacy = await NotificationMapping.findById(mapping._id).lean();
    assert.equal(legacy.purpose, undefined);
    const result = await WhatsAppChannel.send(legacy, payload, {
      userId: String(userOptedOut._id), phone: userOptedOut.phone, email: userOptedOut.email,
    });
    assert.equal(result.skip, undefined, 'no-purpose mapping must continue as before');
    assert.equal(providerCalls.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// RETRY SEMANTICS — consent re-read on every execution
// ═════════════════════════════════════════════════════════════════════════
describe('consent gate re-evaluates on retry', () => {
  test('a STOP between enqueue and execution blocks the later attempt', async () => {
    const user = await createUser({ phone: uniqPhone(), withPreference: true, marketing: true });
    providerCalls = [];
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user });
    const recipient = { userId: String(user._id), phone: user.phone, email: user.email };

    // First execution (job created at 10:00, user opted in) → sends.
    const first = await WhatsAppChannel.send(mapping, payload, recipient);
    assert.equal(first.skip, undefined);
    assert.equal(providerCalls.length, 1);

    // User sends STOP (10:01) → marketing opted_out.
    await consentService.recordOptOut({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'whatsapp_keyword' });

    // Worker retry (10:02) → gate reads fresh consent → blocked, no Meta call.
    const retry = await WhatsAppChannel.send(mapping, payload, recipient);
    assert.equal(retry.skip, true);
    assert.equal(retry.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, 1);
  });

  test('opt-in later allows the message again', async () => {
    const user = await createUser({ phone: uniqPhone(), withPreference: true, marketing: false });
    providerCalls = [];
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user });
    const recipient = { userId: String(user._id), phone: user.phone, email: user.email };

    const blocked = await WhatsAppChannel.send(mapping, payload, recipient);
    assert.equal(blocked.reason, 'marketing_consent_missing');

    await consentService.recordOptIn({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'preference_center' });
    const allowed = await WhatsAppChannel.send(mapping, payload, recipient);
    assert.equal(allowed.skip, undefined);
    assert.equal(providerCalls.length, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// PER-RECIPIENT CONSENT
// ═════════════════════════════════════════════════════════════════════════
describe('consent is evaluated per actual recipient', () => {
  test('two users on the same mapping: one sends, one blocks', async () => {
    const a = await createUser({ phone: uniqPhone(), withPreference: true, marketing: true });
    const b = await createUser({ phone: uniqPhone(), withPreference: true, marketing: false });
    providerCalls = [];
    const { mapping, payload } = await createWhatsAppFixture({ purpose: 'MARKETING', user: a });

    const resA = await WhatsAppChannel.send(mapping, payload, { userId: String(a._id), phone: a.phone, email: a.email });
    const resB = await WhatsAppChannel.send(mapping, payload, { userId: String(b._id), phone: b.phone, email: b.email });

    assert.equal(resA.skip, undefined);
    assert.equal(resB.skip, true);
    assert.equal(resB.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, 1); // only recipient A reached the provider
  });
});

// ═════════════════════════════════════════════════════════════════════════
// BOOTSTRAP v1.2.0 — FRESH DATABASE + IDEMPOTENCY
// ═════════════════════════════════════════════════════════════════════════
describe('bootstrap v1.2.0 fresh database', () => {
  test('first run creates all 51 verified mappings with purposes', async () => {
    await NotificationMapping.deleteMany({});
    const results = [];
    for (const entry of bootstrap.VERIFIED_MAPPINGS) results.push(await bootstrap.applyEntry(entry));
    for (const entry of bootstrap.VERIFIED_EMAIL_MAPPINGS) results.push(await bootstrap.applyEmailEntry(entry));
    for (const entry of bootstrap.VERIFIED_INAPP_MAPPINGS) results.push(await bootstrap.applyInAppEntry(entry));

    assert.equal(results.length, 51);
    assert.equal(results.filter((r) => r.action === 'created').length, 51);
    assert.equal(results.filter((r) => r.purposeAction === 'purpose-created').length, 51);

    const total = await NotificationMapping.countDocuments({});
    assert.equal(total, 51);

    const all = await NotificationMapping.find({}).lean();
    assert.ok(all.every((m) => m.purpose), 'every created mapping must carry a purpose');

    const byName = (event, channel, rt = 'user') => all.find((m) => m.eventName === event && m.channel === channel && m.recipientType === rt);
    assert.equal(byName('BOOKING_CONFIRMED', 'whatsapp').purpose, 'BOOKING');
    assert.equal(byName('OTP_VERIFICATION', 'whatsapp').purpose, 'ACCOUNT');
    assert.equal(byName('OTP_VERIFICATION', 'email', 'pandit').purpose, 'ACCOUNT');
    assert.equal(byName('KIT_SHIPPED', 'whatsapp').purpose, 'ORDER');
    assert.equal(byName('KIT_SHIPPED', 'inapp').purpose, 'ORDER');
    assert.equal(byName('USER_REGISTERED', 'whatsapp').purpose, 'ACCOUNT');
    assert.equal(byName('ACCOUNT_DELETION_REQUESTED', 'whatsapp').purpose, 'ACCOUNT');
    assert.equal(byName('SERVICE_REMINDER_24H', 'whatsapp').purpose, 'BOOKING');
    assert.equal(byName('ORDER_SHIPPED', 'whatsapp').purpose, 'ORDER');
    assert.equal(byName('KYC_APPROVED', 'whatsapp', 'pandit').purpose, 'ACCOUNT');
  });

  test('second run is idempotent — zero unnecessary writes', async () => {
    const results = [];
    for (const entry of bootstrap.VERIFIED_MAPPINGS) results.push(await bootstrap.applyEntry(entry));
    for (const entry of bootstrap.VERIFIED_EMAIL_MAPPINGS) results.push(await bootstrap.applyEmailEntry(entry));
    for (const entry of bootstrap.VERIFIED_INAPP_MAPPINGS) results.push(await bootstrap.applyInAppEntry(entry));

    assert.equal(results.filter((r) => r.action === 'created').length, 0);
    assert.equal(results.filter((r) => r.action === 'configured').length, 0);
    assert.equal(results.filter((r) => r.purposeAction === 'purpose-set').length, 0);
    assert.equal(results.filter((r) => r.purposeAction === 'purpose-matches').length, 51);
    assert.ok(results.every((r) => ['already-correct', 'preserved-custom'].includes(r.action)));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// BOOTSTRAP v1.2.0 — EXISTING DATABASE COMPATIBILITY
// ═════════════════════════════════════════════════════════════════════════
describe('bootstrap v1.2.0 existing database compatibility', () => {
  before(async () => { await NotificationMapping.deleteMany({}); });

  test('blank purpose is filled while channel content is left untouched', async () => {
    // Legacy doc: pre-v1.2.0, no purpose field, already correctly configured content.
    await NotificationMapping.collection.insertOne({
      eventName: 'BOOKING_CONFIRMED', recipientType: 'user', channel: 'whatsapp',
      enabled: true,
      whatsappTemplateName: 'booking_confirmed',
      whatsappVariables: [{ position: 1, payloadPath: 'customer.name', label: 'Customer name' },
        { position: 2, payloadPath: 'booking.poojaName', label: 'Pooja name' },
        { position: 3, payloadPath: 'booking.date', label: 'Date' },
        { position: 4, payloadPath: 'booking.time', label: 'Time' },
        { position: 5, payloadPath: 'booking.number', label: 'Booking number' }],
      createdAt: new Date(), updatedAt: new Date(),
    });
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'BOOKING_CONFIRMED');
    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'already-correct');
    assert.equal(result.purposeAction, 'purpose-set');

    const doc = await NotificationMapping.findOne({ eventName: 'BOOKING_CONFIRMED', channel: 'whatsapp' }).lean();
    assert.equal(doc.purpose, 'BOOKING');
    assert.equal(doc.whatsappTemplateName, 'booking_confirmed'); // untouched
    assert.equal(doc.whatsappVariables.length, 5);               // untouched
  });

  test('admin-customized content is preserved AND blank purpose is filled', async () => {
    const customVars = [{ position: 1, payloadPath: 'customer.name', label: 'Name' }];
    await NotificationMapping.collection.insertOne({
      eventName: 'BOOKING_CANCELLED', recipientType: 'user', channel: 'whatsapp',
      enabled: true,
      whatsappTemplateName: 'booking_cancelled',
      whatsappVariables: customVars,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'BOOKING_CANCELLED');
    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'preserved-custom');
    assert.equal(result.purposeAction, 'purpose-set');

    const doc = await NotificationMapping.findOne({ eventName: 'BOOKING_CANCELLED', channel: 'whatsapp' }).lean();
    assert.equal(doc.purpose, 'BOOKING');
    assert.deepEqual(doc.whatsappVariables, customVars); // admin customization untouched
  });

  test('an administrator-set purpose is NEVER overwritten', async () => {
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'BOOKING_REFUNDED');
    // Correct content + deliberately different purpose (verified is BOOKING).
    const existing = await NotificationMapping.create({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp',
      enabled: true, purpose: 'SERVICE',
      whatsappTemplateName: entry.whatsappTemplateName,
      whatsappVariables: entry.whatsappVariables,
    });
    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'already-correct');
    assert.equal(result.purposeAction, 'purpose-preserved');

    const doc = await NotificationMapping.findById(existing._id).lean();
    assert.equal(doc.purpose, 'SERVICE'); // admin's classification wins
  });

  test('disabled mapping keeps its disabled state and gets its purpose filled', async () => {
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'ORDER_CONFIRMED');
    await NotificationMapping.collection.insertOne({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp',
      enabled: false,
      whatsappTemplateName: entry.whatsappTemplateName,
      whatsappVariables: entry.whatsappVariables,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.purposeAction, 'purpose-set');
    const doc = await NotificationMapping.findOne({ eventName: 'ORDER_CONFIRMED', channel: 'whatsapp' }).lean();
    assert.equal(doc.purpose, 'ORDER');
    assert.equal(doc.enabled, false); // bootstrap never re-enables
  });

  test('legacy mapping absent from bootstrap is never touched', async () => {
    await NotificationMapping.collection.insertOne({
      eventName: 'PASSWORD_RESET', recipientType: 'user', channel: 'whatsapp',
      enabled: false,
      whatsappTemplateName: 'password_reset_legacy',
      whatsappVariables: [],
      purpose: undefined,
      createdAt: new Date(), updatedAt: new Date(),
    });
    // Run the FULL loop — the legacy mapping is not in any verified list.
    for (const entry of bootstrap.VERIFIED_MAPPINGS) await bootstrap.applyEntry(entry);
    for (const entry of bootstrap.VERIFIED_EMAIL_MAPPINGS) await bootstrap.applyEmailEntry(entry);
    for (const entry of bootstrap.VERIFIED_INAPP_MAPPINGS) await bootstrap.applyInAppEntry(entry);

    const legacy = await NotificationMapping.findOne({ eventName: 'PASSWORD_RESET', channel: 'whatsapp' }).lean();
    assert.ok(legacy, 'legacy mapping must still exist');
    assert.ok(!legacy.purpose, 'untouched by bootstrap (undefined or BSON null)');
    assert.equal(legacy.enabled, false);
  });

  test('email mapping blank purpose is filled, content preserved', async () => {
    const entry = bootstrap.VERIFIED_EMAIL_MAPPINGS.find((e) => e.eventName === 'PASSWORD_RESET_EMAIL_OTP' && e.recipientType === 'pandit');
    // The previous test's full loop already created this email mapping — drop
    // it so we can exercise the legacy "no purpose" path cleanly.
    await NotificationMapping.deleteMany({ eventName: entry.eventName, recipientType: entry.recipientType, channel: 'email' });
    await NotificationMapping.collection.insertOne({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'email',
      enabled: true,
      emailSubject: entry.emailSubject,
      emailHtml: entry.emailHtml,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const result = await bootstrap.applyEmailEntry(entry);
    assert.equal(result.action, 'already-correct');
    assert.equal(result.purposeAction, 'purpose-set');
    const doc = await NotificationMapping.findOne({ eventName: entry.eventName, recipientType: 'pandit', channel: 'email' }).lean();
    assert.equal(doc.purpose, 'ACCOUNT');
    assert.equal(doc.emailSubject, entry.emailSubject);
  });

  test('report includes purpose in lines and a purpose summary', async () => {
    await NotificationMapping.deleteMany({});
    const results = [];
    // Two fresh entries → both are 'created' (listed in the Created section).
    for (const entry of bootstrap.VERIFIED_MAPPINGS.slice(0, 2)) results.push(await bootstrap.applyEntry(entry));
    const markdown = bootstrap.buildReportMarkdown(results, [], [], { problems: [] });
    assert.match(markdown, /purpose: ACCOUNT/);
    assert.match(markdown, /## Purpose classification \(Phase 5 — WhatsApp consent\)/);
    assert.match(markdown, /Purpose preserved \(admin customization, untouched\)/);
    assert.match(markdown, /\| Created with purpose \| 2 \|/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// BOOTSTRAP VALIDATION — purpose visibility
// ═════════════════════════════════════════════════════════════════════════
describe('validateWhatsAppMappings purpose visibility', () => {
  test('WhatsApp mapping without purpose is flagged; with purpose it is not', async () => {
    await NotificationMapping.deleteMany({});

    const tmpl = await WhatsAppTemplate.create({
      name: 'test_validation', status: 'APPROVED', language: 'en', syncedAt: new Date(),
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
    });
    const vars = [{ position: 1, payloadPath: 'customer.name', label: 'Customer name' }];

    await NotificationMapping.create({
      eventName: 'BOOKING_CONFIRMED', recipientType: 'user', channel: 'whatsapp',
      enabled: true, purpose: 'BOOKING',
      whatsappTemplateName: tmpl.name, whatsappVariables: vars,
    });
    // Legacy doc — no purpose field.
    await NotificationMapping.collection.insertOne({
      eventName: 'BOOKING_CANCELLED', recipientType: 'user', channel: 'whatsapp',
      enabled: true,
      whatsappTemplateName: tmpl.name, whatsappVariables: vars,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const validation = await validateWhatsAppMappings();
    const purposeProblems = validation.problems.filter((p) => p.includes('no communication purpose set'));
    assert.equal(purposeProblems.length, 1);
    assert.match(purposeProblems[0], /BOOKING_CANCELLED/);
    assert.ok(!purposeProblems.some((p) => p.includes('BOOKING_CONFIRMED')));
  });
});
