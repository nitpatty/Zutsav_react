/**
 * Tests for WhatsApp Consent Phase 5.1 — feedback as an OPTIONAL ACTION
 * (URL button) inside the transactional SERVICE_COMPLETED message:
 *   - NotificationMapping.whatsappUrlButtons model
 *   - WhatsAppProvider.getDeclaredUrlButtons (template = authoritative)
 *   - VariableResolver URL-button component building (declared-only, safe
 *     omission of undeclared/empty buttons)
 *   - WhatsAppChannel end-to-end: SERVICE_COMPLETED (purpose SERVICE) with
 *     URL buttons still sends when the user's marketing consent is
 *     opted_out (transactional is NEVER blocked); a marketing mapping is
 *     still blocked (regression); undeclared buttons are omitted with a
 *     warning, never sent, and never break the body send
 *   - bootstrapNotificationMappings.js v1.3.0: SERVICE_COMPLETED carries
 *     the View Receipt + Rate Your Experience buttons (purpose SERVICE);
 *     FEEDBACK_REQUEST is created DISABLED on fresh DBs and preserved on
 *     existing DBs; second run stays idempotent
 *   - Static audit: no FEEDBACK_REQUEST emit remains in any completion
 *     path; SERVICE_COMPLETED still fires on all three completion paths
 *
 * Uses Node's built-in test runner (node:test). Run: cd backend && node --test
 * Runs against a dedicated TEST database (MONGO_URI_TEST or
 * mongodb://127.0.0.1:27017/zutsav_consent_phase5_1_test) and drops the
 * affected collections before the run. Never touches dev/prod data.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_consent_phase5_1_test';

const User = require('../src/models/User');
const WhatsAppTemplate = require('../src/models/WhatsAppTemplate');
const NotificationMapping = require('../src/models/NotificationMapping');
const consentService = require('../src/services/consentService');
const WhatsAppChannel = require('../notification-engine/channels/WhatsAppChannel');
const WhatsAppProvider = require('../notification-engine/providers/WhatsAppProvider');
const TemplateEngine = require('../notification-engine/templates/TemplateEngine');
const VariableResolver = require('../notification-engine/variables/VariableResolver');
const bootstrap = require('../src/scripts/bootstrapNotificationMappings');

let _seq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqName = () => `Phase5.1 User ${_seq}`;

async function cleanCollections() {
  await Promise.all([
    NotificationMapping.deleteMany({}),
    WhatsAppTemplate.deleteMany({}),
    User.deleteMany({}),
  ]);
}

/** User with marketing explicitly opted_out (the critical consent state for 5.1). */
async function createOptedOutUser() {
  const user = await User.create({
    name: uniqName(),
    phone: uniqPhone(),
    email: `phase51_${Date.now()}_${_seq}@test.zutsav.local`,
    password: 'dummy-hash-not-used',
  });
  await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone, whatsappVerified: true });
  await consentService.recordOptOut({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'whatsapp_keyword' });
  return user;
}

/**
 * Fully-valid WhatsApp fixture: synced template (optionally declaring URL
 * buttons), mapping (optionally carrying url buttons), and a normalized
 * booking payload with booking.id — passes every channel check so a
 * successful send reaches the (patched) provider.
 */
async function createServiceCompletionFixture({ user, templateButtons = true, mappingButtons = true }) {
  const seq = _seq++; // guaranteed-unique template name per fixture call
  const components = [{ type: 'BODY', text: 'Hi {{1}}, your service is complete. Booking {{2}} {{3}}.' }];
  if (templateButtons) {
    components.push({
      type: 'BUTTONS',
      buttons: [
        { type: 'URL', text: 'View Receipt', url: 'https://zutsav.example/invoice/{{1}}' },
        { type: 'URL', text: 'Rate Your Experience', url: 'https://zutsav.example/my-bookings' },
      ],
    });
  }
  const tmpl = await WhatsAppTemplate.create({
    name: `test_service_completed_${seq}`, // unique per fixture — findOne({name}) must never match a stale doc
    status: 'APPROVED',
    language: 'en',
    category: 'UTILITY',
    syncedAt: new Date(),
    components,
  });
  const mapping = await NotificationMapping.create({
    eventName: 'SERVICE_COMPLETED',
    recipientType: 'user',
    channel: 'whatsapp',
    purpose: 'SERVICE',
    whatsappTemplateName: tmpl.name,
    whatsappVariables: [
      { position: 1, payloadPath: 'customer.name', label: 'Customer name' },
      { position: 2, payloadPath: 'booking.number', label: 'Booking number' },
      { position: 3, payloadPath: 'booking.poojaName', label: 'Pooja name' },
    ],
    whatsappUrlButtons: mappingButtons
      ? [
          { text: 'View Receipt', urlTemplate: '/invoice/{{1}}', parameterPath: 'booking.id' },
          { text: 'Rate Your Experience', urlTemplate: '/my-bookings', parameterPath: '' },
        ]
      : [],
    enabled: true,
  });
  const payload = {
    _eventName: 'SERVICE_COMPLETED',
    customer: { name: uniqName(), userId: String(user._id), phone: user.phone, email: user.email },
    booking: { id: '65f0abc1234567890def0001', number: 'ZUT-TEST-001', poojaName: 'Ganesh Puja' },
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
    return { messages: [{ id: 'wamid.phase51' }] };
  };
});

after(async () => {
  WhatsAppProvider.send = originalSend;
  await mongoose.disconnect();
});

// ═════════════════════════════════════════════════════════════════════════
// MODEL — whatsappUrlButtons
// ═════════════════════════════════════════════════════════════════════════
describe('NotificationMapping whatsappUrlButtons', () => {
  test('persists URL button config and defaults to an empty array', async () => {
    const withButtons = await NotificationMapping.create({
      eventName: 'SERVICE_COMPLETED', recipientType: 'user', channel: 'whatsapp',
      purpose: 'SERVICE',
      whatsappUrlButtons: [
        { text: 'View Receipt', urlTemplate: '/invoice/{{1}}', parameterPath: 'booking.id' },
      ],
    });
    assert.equal(withButtons.whatsappUrlButtons.length, 1);
    assert.equal(withButtons.whatsappUrlButtons[0].parameterPath, 'booking.id');

    const without = await NotificationMapping.create({
      eventName: 'BOOKING_CONFIRMED', recipientType: 'user', channel: 'whatsapp',
      purpose: 'BOOKING',
    });
    assert.deepEqual(without.whatsappUrlButtons, []);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// getDeclaredUrlButtons — the synced template is authoritative
// ═════════════════════════════════════════════════════════════════════════
describe('WhatsAppProvider.getDeclaredUrlButtons', () => {
  test('parses dynamic and static URL buttons by index; ignores non-URL buttons', () => {
    const declared = WhatsAppProvider.getDeclaredUrlButtons({
      components: [
        { type: 'BODY', text: 'Hi {{1}}' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'View Receipt', url: 'https://z.example/invoice/{{1}}' },
            { type: 'QUICK_REPLY', text: 'Reply' },
            { type: 'URL', text: 'Rate', url: 'https://z.example/my-bookings' },
          ],
        },
      ],
    });
    assert.deepEqual(Object.keys(declared), ['0', '2']);
    assert.equal(declared[0].hasPlaceholders, true);
    assert.equal(declared[2].hasPlaceholders, false);
  });

  test('returns {} for a template with no BUTTONS component', () => {
    assert.deepEqual(WhatsAppProvider.getDeclaredUrlButtons({ components: [{ type: 'BODY', text: 'Hi' }] }), {});
    assert.deepEqual(WhatsAppProvider.getDeclaredUrlButtons(null), {});
  });
});

// ═════════════════════════════════════════════════════════════════════════
// COMPONENT BUILDING — declared-only, safe omission
// ═════════════════════════════════════════════════════════════════════════
describe('buildWhatsAppComponents URL buttons', () => {
  const declared = {
    0: { type: 'URL', url: 'https://z.example/invoice/{{1}}', hasPlaceholders: true },
    1: { type: 'URL', url: 'https://z.example/my-bookings', hasPlaceholders: false },
  };
  const buttons = [
    { text: 'View Receipt', urlTemplate: '/invoice/{{1}}', parameterPath: 'booking.id' },
    { text: 'Rate Your Experience', urlTemplate: '/my-bookings', parameterPath: '' },
  ];
  const payload = { customer: { name: 'A' }, booking: { id: 'BOOK-123' } };

  test('declared dynamic + static buttons produce the right components', () => {
    const warnings = [];
    const comps = VariableResolver.buildWhatsAppComponents(
      [{ position: 1, payloadPath: 'customer.name' }], payload, null, buttons, declared, warnings
    );
    const btnComps = comps.filter((c) => c.type === 'button');
    assert.equal(btnComps.length, 2);
    assert.equal(btnComps[0].sub_type, 'url');
    assert.equal(btnComps[0].index, '0');
    assert.deepEqual(btnComps[0].parameters, [{ type: 'text', text: 'BOOK-123' }]);
    assert.equal(btnComps[1].index, '1');
    assert.deepEqual(btnComps[1].parameters, []); // static URL → no parameters
    assert.deepEqual(warnings, []);
  });

  test('undeclared button is omitted with a warning, never sent', () => {
    const warnings = [];
    const comps = VariableResolver.buildWhatsAppComponents(
      [], payload, null, buttons, {}, warnings
    );
    assert.equal(comps.filter((c) => c.type === 'button').length, 0);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /NOT declared/);
  });

  test('dynamic URL button whose parameter resolves empty is omitted with a warning', () => {
    const warnings = [];
    const comps = VariableResolver.buildWhatsAppComponents(
      [], { booking: { id: '' } }, null, buttons, declared, warnings
    );
    assert.equal(comps.filter((c) => c.type === 'button').length, 1); // only static one survives
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /resolved empty/);
  });

  test('with no declared-button info, URL buttons are safely omitted (never sent)', () => {
    const warnings = [];
    const comps = VariableResolver.buildWhatsAppComponents([], payload, null, buttons, null, warnings);
    assert.equal(comps.filter((c) => c.type === 'button').length, 0);
    assert.deepEqual(warnings, []);
  });

  test('copy_code button occupies index 0 and URL buttons shift to 1..n', () => {
    const declaredShift = {
      0: { type: 'URL', url: 'https://wa.me/otp?code={{1}}', hasPlaceholders: true },
      1: { type: 'URL', url: 'https://z.example/invoice/{{1}}', hasPlaceholders: true },
    };
    const warnings = [];
    const comps = VariableResolver.buildWhatsAppComponents(
      [], payload, { type: 'copy_code', payloadPath: 'otp.code' },
      [{ text: 'View Receipt', urlTemplate: '/invoice/{{1}}', parameterPath: 'booking.id' }],
      declaredShift, warnings
    );
    const btnComps = comps.filter((c) => c.type === 'button');
    assert.equal(btnComps.length, 2);
    assert.equal(btnComps[0].index, '0'); // copy code
    assert.equal(btnComps[1].index, '1'); // url button shifted
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CHANNEL END-TO-END — SERVICE_COMPLETED + consent + buttons
// ═════════════════════════════════════════════════════════════════════════
describe('WhatsAppChannel SERVICE_COMPLETED (purpose SERVICE)', () => {
  let optedOutUser;

  before(async () => {
    providerCalls = [];
    optedOutUser = await createOptedOutUser();
  });

  test('sends despite marketing opted_out, with declared URL button parameters', async () => {
    const { tmpl, mapping, payload } = await createServiceCompletionFixture({ user: optedOutUser });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(optedOutUser._id), phone: optedOutUser.phone, email: optedOutUser.email,
    });
    assert.equal(result.skip, undefined, 'SERVICE purpose must never be blocked by marketing opt-out');
    assert.equal(providerCalls.length, 1);

    const sent = providerCalls[0];
    assert.equal(sent.templateName, tmpl.name);
    const btnComps = (sent.components || []).filter((c) => c.type === 'button');
    assert.equal(btnComps.length, 2, 'declared URL buttons must reach the provider');
    assert.deepEqual(btnComps[0].parameters, [{ type: 'text', text: '65f0abc1234567890def0001' }]);
    assert.deepEqual(btnComps[1].parameters, []);
    // Body intact — the transactional message content is untouched.
    const bodyComp = sent.components.find((c) => c.type === 'body');
    assert.equal(bodyComp.parameters.length, 3);
  });

  test('template without URL buttons → body still sends, buttons omitted with warnings (no regression)', async () => {
    providerCalls = [];
    const { mapping, payload } = await createServiceCompletionFixture({ user: optedOutUser, templateButtons: false });
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(optedOutUser._id), phone: optedOutUser.phone, email: optedOutUser.email,
    });
    assert.equal(result.skip, undefined, 'missing template buttons must not block the transactional message');
    assert.equal(providerCalls.length, 1);
    assert.equal(providerCalls[0].components.filter((c) => c.type === 'button').length, 0);
    // The mismatch is visible to admins (dry-run / checklist), never silent.
    assert.ok(result.checklist.buttonWarnings.length >= 2);
    assert.match(result.checklist.buttonWarnings[0], /does not declare a URL button/);
  });

  test('MARKETING mapping is still blocked for an opted-out user (regression)', async () => {
    providerCalls = [];
    const tmpl = await WhatsAppTemplate.create({
      name: 'test_marketing_block', status: 'APPROVED', language: 'en',
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
    });
    const mapping = await NotificationMapping.create({
      eventName: 'ORDER_CONFIRMED', recipientType: 'user', channel: 'whatsapp', purpose: 'MARKETING',
      whatsappTemplateName: tmpl.name,
      whatsappVariables: [{ position: 1, payloadPath: 'customer.name', label: 'Customer name' }],
      enabled: true,
    });
    const payload = {
      _eventName: 'ORDER_CONFIRMED',
      customer: { name: uniqName(), userId: String(optedOutUser._id), phone: optedOutUser.phone, email: optedOutUser.email },
      order: { number: 'ORD-1' },
    };
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(optedOutUser._id), phone: optedOutUser.phone, email: optedOutUser.email,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, 0);
  });

  test('rendered content exposes buttonWarnings for the dry-run UI', async () => {
    const { mapping, payload } = await createServiceCompletionFixture({ user: optedOutUser, templateButtons: false });
    const rendered = TemplateEngine.render('whatsapp', mapping, payload, { declaredUrlButtons: {} });
    assert.equal(rendered.components.filter((c) => c.type === 'button').length, 0);
    assert.equal(rendered.buttonWarnings.length, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// BOOTSTRAP v1.3.0
// ═════════════════════════════════════════════════════════════════════════
describe('bootstrap v1.3.0 — SERVICE_COMPLETED buttons + FEEDBACK_REQUEST disabled', () => {
  test('fresh DB: SERVICE_COMPLETED created with SERVICE purpose + both URL buttons', async () => {
    await NotificationMapping.deleteMany({});
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'SERVICE_COMPLETED' && e.recipientType === 'user');
    assert.ok(entry, 'SERVICE_COMPLETED entry must exist in bootstrap');
    assert.equal(entry.purpose, 'SERVICE');

    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'created');
    assert.equal(result.purposeAction, 'purpose-created');

    const doc = await NotificationMapping.findOne({ eventName: 'SERVICE_COMPLETED', channel: 'whatsapp' }).lean();
    assert.equal(doc.purpose, 'SERVICE');
    assert.equal(doc.whatsappUrlButtons.length, 2);
    assert.equal(doc.whatsappUrlButtons[0].text, 'View Receipt');
    assert.equal(doc.whatsappUrlButtons[0].parameterPath, 'booking.id');
    assert.equal(doc.whatsappUrlButtons[1].text, 'Rate Your Experience');
    assert.equal(doc.whatsappUrlButtons[1].parameterPath, '');
  });

  test('fresh DB: FEEDBACK_REQUEST is created DISABLED (no standalone feedback ask)', async () => {
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'FEEDBACK_REQUEST' && e.recipientType === 'user');
    assert.ok(entry, 'FEEDBACK_REQUEST entry must still exist (retained, disabled)');
    assert.equal(entry.enabled, false, 'bootstrap entry must disable the standalone feedback ask');

    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'created');
    const doc = await NotificationMapping.findOne({ eventName: 'FEEDBACK_REQUEST', channel: 'whatsapp' }).lean();
    assert.equal(doc.enabled, false);
    assert.equal(doc.purpose, 'SERVICE'); // classification unchanged
  });

  test('second run is idempotent — zero unnecessary writes', async () => {
    // First, a FULL first run (the two fresh-DB tests above only applied
    // SERVICE_COMPLETED + FEEDBACK_REQUEST; the rest of the 51 don't exist
    // yet in this database).
    await NotificationMapping.deleteMany({});
    let results = [];
    for (const entry of bootstrap.VERIFIED_MAPPINGS) results.push(await bootstrap.applyEntry(entry));
    for (const entry of bootstrap.VERIFIED_EMAIL_MAPPINGS) results.push(await bootstrap.applyEmailEntry(entry));
    for (const entry of bootstrap.VERIFIED_INAPP_MAPPINGS) results.push(await bootstrap.applyInAppEntry(entry));
    assert.equal(results.filter((r) => r.action === 'created').length, 51);

    // Second run: everything already correct → zero unnecessary writes.
    results = [];
    for (const entry of bootstrap.VERIFIED_MAPPINGS) results.push(await bootstrap.applyEntry(entry));
    for (const entry of bootstrap.VERIFIED_EMAIL_MAPPINGS) results.push(await bootstrap.applyEmailEntry(entry));
    for (const entry of bootstrap.VERIFIED_INAPP_MAPPINGS) results.push(await bootstrap.applyInAppEntry(entry));

    assert.equal(results.filter((r) => r.action === 'created').length, 0);
    assert.equal(results.filter((r) => r.action === 'configured').length, 0);
    assert.equal(results.filter((r) => r.purposeAction === 'purpose-set').length, 0);
    assert.equal(results.filter((r) => r.purposeAction === 'purpose-matches').length, 51);
    assert.ok(results.every((r) => ['already-correct', 'preserved-custom'].includes(r.action)));
  });

  test('existing DB: already-configured SERVICE_COMPLETED is preserved (buttons NOT overwritten)', async () => {
    await NotificationMapping.deleteMany({ eventName: 'SERVICE_COMPLETED', channel: 'whatsapp' });
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'SERVICE_COMPLETED');
    // Pre-existing mapping with correct content but no buttons (pre-5.1 state).
    await NotificationMapping.collection.insertOne({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp',
      enabled: true, purpose: 'SERVICE',
      whatsappTemplateName: entry.whatsappTemplateName,
      whatsappVariables: entry.whatsappVariables,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'already-correct'); // admin-configured content untouched
    assert.equal(result.purposeAction, 'purpose-matches');

    const doc = await NotificationMapping.findOne({ eventName: 'SERVICE_COMPLETED', channel: 'whatsapp' }).lean();
    assert.equal((doc.whatsappUrlButtons || []).length, 0); // preserved — admin adopts buttons deliberately
  });

  test('existing DB: an enabled FEEDBACK_REQUEST mapping is preserved (never force-disabled)', async () => {
    await NotificationMapping.deleteMany({ eventName: 'FEEDBACK_REQUEST', channel: 'whatsapp' });
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'FEEDBACK_REQUEST');
    await NotificationMapping.create({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp',
      enabled: true, purpose: 'SERVICE',
      whatsappTemplateName: entry.whatsappTemplateName,
      whatsappVariables: entry.whatsappVariables,
    });

    const result = await bootstrap.applyEntry(entry);
    assert.equal(result.action, 'already-correct');
    const doc = await NotificationMapping.findOne({ eventName: 'FEEDBACK_REQUEST', channel: 'whatsapp' }).lean();
    assert.equal(doc.enabled, true); // bootstrap preserves the admin's state
  });

  test('button destinations reuse real, existing frontend routes', () => {
    const entry = bootstrap.VERIFIED_MAPPINGS.find((e) => e.eventName === 'SERVICE_COMPLETED');
    const [receipt, rate] = entry.whatsappUrlButtons;
    // App.jsx: <Route path="/invoice/:bookingId"> (protected) — same link MyBookings uses.
    assert.match(receipt.urlTemplate, /^\/invoice\//);
    // App.jsx: <Route path="/my-bookings"> (protected) — hosts the StarRating UI.
    assert.equal(rate.urlTemplate, '/my-bookings');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// STATIC AUDIT — FEEDBACK_REQUEST emitters retired, SERVICE_COMPLETED intact
// ═════════════════════════════════════════════════════════════════════════
describe('static audit of completion emitters', () => {
  const src = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  test('no FEEDBACK_REQUEST emit remains in any completion path or cron', () => {
    for (const [rel, label] of [
      ['src/controllers/booking.controller.js', 'booking.controller'],
      ['src/controllers/admin.controller.js', 'admin.controller'],
      ['src/utils/cleanupJobs.js', 'cleanupJobs'],
    ]) {
      assert.ok(!src(rel).includes("emit('FEEDBACK_REQUEST'"), `${label} must not emit standalone FEEDBACK_REQUEST`);
      assert.ok(!src(rel).includes('emit("FEEDBACK_REQUEST"'), `${label} must not emit standalone FEEDBACK_REQUEST (double-quoted)`);
    }
  });

  test('SERVICE_COMPLETED still fires on all three completion paths', () => {
    assert.equal((src('src/controllers/booking.controller.js').match(/emit\('SERVICE_COMPLETED'/g) || []).length, 1);
    assert.equal((src('src/controllers/admin.controller.js').match(/emit\('SERVICE_COMPLETED'/g) || []).length, 2);
    // The cron never sends completion — and never emits anything now.
    assert.ok(!src('src/utils/cleanupJobs.js').includes("emit('SERVICE_COMPLETED'"));
  });

  test('FEEDBACK_REQUEST stays registered in EventRegistry (frozen enum) but is not emitted', () => {
    const registry = require('../notification-engine/EventRegistry');
    assert.equal(registry.EVENTS.FEEDBACK_REQUEST, 'FEEDBACK_REQUEST');
    // And the only remaining FEEDBACK_REQUEST references are the registry +
    // the disabled bootstrap entry (+ the deprecated fix script) — none is a live emit.
    const bootstrapSrc = src('src/scripts/bootstrapNotificationMappings.js');
    assert.match(bootstrapSrc, /FEEDBACK_REQUEST/);
    assert.match(bootstrapSrc, /enabled: false/);
  });
});
