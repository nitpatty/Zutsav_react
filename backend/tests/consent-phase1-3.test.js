/**
 * Tests for the WhatsApp Consent Phase 1-3 implementation:
 *   - User model whatsappVerified / whatsappVerifiedAt
 *   - WhatsAppPreference (current consent state)
 *   - WhatsAppConsentEvent (immutable history)
 *   - consentService state rules
 *   - Signup integration (POST /auth/complete-registration handler)
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && npm test   (or: node --test tests/)
 *
 * Runs against a dedicated TEST database (MONGO_URI_TEST or
 * mongodb://127.0.0.1:27017/zutsav_consent_test) and drops it before and
 * after the run. Never touches dev/prod data.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'consent-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_consent_test';

const User = require('../src/models/User');
const Pandit = require('../src/models/Pandit');
const OTP = require('../src/models/OTP');
const WhatsAppPreference = require('../src/models/WhatsAppPreference');
const WhatsAppConsentEvent = require('../src/models/WhatsAppConsentEvent');
const consentService = require('../src/services/consentService');
const authController = require('../src/controllers/auth.controller');
const { NotificationEngine } = require('../notification-engine');

let _seq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++)); // 9XXXXXXXXX, 10 digits, first digit 9
const uniqEmail = () => `consent${Date.now()}_${_seq}@test.zutsav.local`;

let emitCalls = [];
const originalEmit = NotificationEngine.emit;

async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    Pandit.deleteMany({}),
    OTP.deleteMany({}),
    WhatsAppPreference.deleteMany({}),
    WhatsAppConsentEvent.deleteMany({}),
  ]);
}

/** Mock Express res for controller-level tests. */
function mockRes() {
  const res = {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
  return res;
}

function mockReq(body, headers = {}) {
  return { body, headers, socket: {} };
}

async function registerUser({ channel, role = 'user', extraBody = {}, otpChannel } = {}) {
  const phone = uniqPhone();
  const email = uniqEmail();
  const otpDocChannel = otpChannel || channel;
  await OTP.create({
    identifier: otpDocChannel === 'email' ? email : phone,
    channel: otpDocChannel,
    otp: '123456',
    purpose: 'registration',
    verified: true,
  });
  const req = mockReq({ name: 'Test User', email, phone, password: 'secret123', channel, role, ...extraBody });
  const res = mockRes();
  let errOut = null;
  await authController.completeRegistration(req, res, (e) => { errOut = e; });
  if (errOut) throw errOut;
  return { phone, email, res };
}

// ─────────────────────────────────────────────────────────────────────────────

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  // Ensure indexes exist (including the unique+sparse wamid index) before tests.
  await Promise.all([User.init(), WhatsAppPreference.init(), WhatsAppConsentEvent.init()]);
  // Spy on the notification engine so we can assert USER_REGISTERED fires.
  NotificationEngine.emit = async (name) => { emitCalls.push(name); };
});

after(async () => {
  NotificationEngine.emit = originalEmit;
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ── 1. User model ───────────────────────────────────────────────────────────

describe('User model — whatsapp verification fields', () => {
  before(cleanCollections);

  test('whatsappVerified defaults to false, whatsappVerifiedAt defaults to null', async () => {
    const user = await User.create({ name: 'A', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    assert.equal(user.whatsappVerified, false);
    assert.equal(user.whatsappVerifiedAt, null);
  });

  test('existing-user shape stays valid (fields simply absent on old docs)', async () => {
    // Insert a doc shaped like a pre-consent user (no new fields at all).
    const raw = await User.collection.insertOne({ name: 'Old', email: uniqEmail(), phone: uniqPhone(), password: 'hash' });
    const found = await User.findById(raw.insertedId).lean();
    assert.ok(found);
    assert.equal(found.whatsappVerified, undefined); // not present on legacy doc
  });
});

// ── 2. Phone normalization ───────────────────────────────────────────────────

describe('consentService — phone normalization', () => {
  test('normalizes 10-digit, +91, and E.164 forms to 91XXXXXXXXXX', () => {
    assert.equal(consentService.normalizeWhatsAppPhone('9876543210'), '919876543210');
    assert.equal(consentService.normalizeWhatsAppPhone('+91 98765 43210'), '919876543210');
    assert.equal(consentService.normalizeWhatsAppPhone('919876543210'), '919876543210');
  });

  test('phoneVariants returns both E.164 and 10-digit lookup forms', () => {
    assert.deepEqual(consentService.phoneVariants('9876543210'), ['919876543210', '9876543210']);
  });

  test('getUserByPhone matches a User stored as 10-digit via an E.164 query', async () => {
    const user = await User.create({ name: 'P', email: uniqEmail(), phone: '9876000011', password: 'secret123' });
    const found = await consentService.getUserByPhone('+91 98760 00011');
    assert.equal(String(found._id), String(user._id));
  });
});

// ── 3. Preference model + service defaults ───────────────────────────────────

describe('WhatsAppPreference — defaults and current state', () => {
  before(cleanCollections);

  test('getOrCreatePreference builds audit-approved defaults', async () => {
    const user = await User.create({ name: 'B', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const pref = await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone, whatsappVerified: true });
    assert.equal(pref.phone, '91' + user.phone);               // stored E.164
    assert.equal(pref.whatsappVerified, true);
    assert.equal(pref.whatsapp.service.status, 'opted_in');    // RULE 3 default
    assert.equal(pref.whatsapp.marketing.status, 'not_set');   // RULE 2 default
    assert.equal(pref.whatsapp.service.source, '');
    assert.equal(pref.email.service.status, 'not_set');
    assert.equal(pref.sms.marketing.status, 'not_set');
  });

  test('unique userId — second getOrCreate returns the same doc', async () => {
    const user = await User.create({ name: 'C', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    const again = await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    assert.equal(1, await WhatsAppPreference.countDocuments({ userId: user._id }));
    assert.equal(String(again.userId), String(user._id));
  });

  test('getPreferenceByPhone matches the E.164-normalized phone', async () => {
    const user = await User.create({ name: 'D', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    const byPhone = await consentService.getPreferenceByPhone('+91 ' + user.phone);
    assert.equal(String(byPhone.userId), String(user._id));
  });

  test('RULE 2 — hasMarketingConsent is false for not_set and for no preference', async () => {
    const user = await User.create({ name: 'E', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    assert.equal(await consentService.hasMarketingConsent(user._id), false);

    const freshUser = await User.create({ name: 'F', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    assert.equal(await consentService.hasMarketingConsent(freshUser._id), false); // no preference → false
  });

  test('RULE 3 — hasServicePermission defaults to true (with or without preference)', async () => {
    const user = await User.create({ name: 'G', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    assert.equal(await consentService.hasServicePermission(user._id), true);
    const freshUser = await User.create({ name: 'H', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    assert.equal(await consentService.hasServicePermission(freshUser._id), true);
  });
});

// ── 4. Consent history (append-only) ─────────────────────────────────────────

describe('WhatsAppConsentEvent — opt-in / opt-out history', () => {
  before(cleanCollections);

  test('RULE 4 — recordOptIn updates current state and appends an OPT_IN event', async () => {
    const user = await User.create({ name: 'I', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });

    const event = await consentService.recordOptIn({
      userId: user._id, phone: user.phone, purpose: 'marketing', source: 'signup_checkbox',
      consentText: 'Marketing copy v1', consentVersion: 'v1.0',
    });

    const pref = await consentService.getPreference(user._id);
    assert.equal(pref.whatsapp.marketing.status, 'opted_in');
    assert.equal(pref.whatsapp.marketing.source, 'signup_checkbox');
    assert.ok(pref.lastOptInAt);
    assert.equal(await consentService.hasMarketingConsent(user._id), true);

    assert.equal(event.action, 'OPT_IN');
    assert.equal(event.purpose, 'marketing');
    assert.equal(event.source, 'signup_checkbox');
    assert.equal(event.consentText, 'Marketing copy v1');
    assert.equal(event.consentVersion, 'v1.0');
    assert.equal(event.channel, 'whatsapp');
    assert.equal(event.phone, '91' + user.phone);
  });

  test('RULE 5 — recordOptOut updates state, appends OPT_OUT, preserves prior history', async () => {
    const user = await User.create({ name: 'J', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    const inEvent = await consentService.recordOptIn({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'signup_checkbox' });

    const outEvent = await consentService.recordOptOut({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'whatsapp_keyword' });

    const pref = await consentService.getPreference(user._id);
    assert.equal(pref.whatsapp.marketing.status, 'opted_out');
    assert.equal(pref.whatsapp.marketing.source, 'whatsapp_keyword');
    assert.ok(pref.lastOptOutAt);
    assert.equal(await consentService.hasMarketingConsent(user._id), false);

    // Full history preserved: OPT_IN then OPT_OUT — both still present.
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean();
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.action), ['OPT_IN', 'OPT_OUT']);
    assert.equal(events[0]._id.toString(), inEvent._id.toString());
    assert.equal(events[1]._id.toString(), outEvent._id.toString());
  });

  test('append-only — the original OPT_IN event is never mutated by later actions', async () => {
    const user = await User.create({ name: 'K', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone });
    const inEvent = await consentService.recordOptIn({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'signup_checkbox' });
    const snapshot = {
      userId: String(inEvent.userId), phone: inEvent.phone, channel: inEvent.channel,
      purpose: inEvent.purpose, action: inEvent.action, source: inEvent.source,
      consentText: inEvent.consentText, consentVersion: inEvent.consentVersion,
      timestamp: inEvent.timestamp.toISOString(),
    };

    await consentService.recordOptOut({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'preference_center' });
    await consentService.recordOptIn({ userId: user._id, phone: user.phone, purpose: 'marketing', source: 'preference_center' });

    const reloaded = await WhatsAppConsentEvent.findById(inEvent._id).lean();
    // Every consent-relevant field is byte-identical — the event was never
    // updated or deleted by the opt-out / re-opt-in cycle.
    assert.equal(reloaded.userId.toString(), snapshot.userId);
    assert.equal(reloaded.phone, snapshot.phone);
    assert.equal(reloaded.channel, snapshot.channel);
    assert.equal(reloaded.purpose, snapshot.purpose);
    assert.equal(reloaded.action, snapshot.action);
    assert.equal(reloaded.source, snapshot.source);
    assert.equal(reloaded.consentText, snapshot.consentText);
    assert.equal(reloaded.consentVersion, snapshot.consentVersion);
    assert.equal(reloaded.timestamp.toISOString(), snapshot.timestamp);
    // And the full history now shows OPT_IN → OPT_OUT → OPT_IN.
    const actions = (await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean()).map((e) => e.action);
    assert.deepEqual(actions, ['OPT_IN', 'OPT_OUT', 'OPT_IN']);
  });

  test('RULE 6 — whatsappMessageId idempotency: replay returns the existing event, no duplicate', async () => {
    const user = await User.create({ name: 'L', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const first = await consentService.recordOptOut({
      userId: user._id, phone: user.phone, purpose: 'marketing', source: 'whatsapp_keyword', whatsappMessageId: 'wamid.ABC123',
    });
    const second = await consentService.recordOptOut({
      userId: user._id, phone: user.phone, purpose: 'marketing', source: 'whatsapp_keyword', whatsappMessageId: 'wamid.ABC123',
    });

    assert.equal(String(first._id), String(second._id)); // same event returned
    assert.equal(await WhatsAppConsentEvent.countDocuments({ whatsappMessageId: 'wamid.ABC123' }), 1);

    // A different wamid is a genuinely new event.
    const third = await consentService.recordOptIn({
      userId: user._id, phone: user.phone, purpose: 'marketing', source: 'whatsapp_keyword', whatsappMessageId: 'wamid.DEF456',
    });
    assert.notEqual(String(third._id), String(first._id));
  });

  test('events without a whatsappMessageId never collide (sparse index)', async () => {
    const u1 = await User.create({ name: 'M1', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const u2 = await User.create({ name: 'M2', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    await consentService.recordOptIn({ userId: u1._id, phone: u1.phone, purpose: 'marketing', source: 'signup_checkbox' });
    await consentService.recordOptIn({ userId: u2._id, phone: u2.phone, purpose: 'marketing', source: 'signup_checkbox' });
    // Scoped to these users' events (earlier tests in this describe created
    // events that legitimately carry a wamid).
    assert.equal(
      await WhatsAppConsentEvent.countDocuments({ userId: { $in: [u1._id, u2._id] }, whatsappMessageId: { $exists: true } }),
      0
    ); // none of the wamid-less events accidentally stored the field
  });
});

// ── 5. Signup integration (complete-registration handler) ───────────────────

describe('Signup integration — complete-registration', () => {
  before(async () => { await cleanCollections(); emitCalls = []; });

  test('1. Email OTP → whatsappVerified stays false; no consent events', async () => {
    const { res } = await registerUser({ channel: 'email' });
    assert.equal(res.statusCode, 201);
    const user = await User.findOne({ email: res.body.user.email });
    assert.equal(user.whatsappVerified, false);
    assert.equal(user.whatsappVerifiedAt, null);

    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.ok(pref);
    assert.equal(pref.whatsapp.marketing.status, 'not_set');
    assert.equal(await WhatsAppConsentEvent.countDocuments({ userId: user._id }), 0); // no fabricated history
    assert.equal(await consentService.hasMarketingConsent(user._id), false);
  });

  test('2. WhatsApp OTP → whatsappVerified true with timestamp', async () => {
    const { res } = await registerUser({ channel: 'whatsapp' });
    const user = await User.findOne({ email: res.body.user.email });
    assert.equal(user.whatsappVerified, true);
    assert.ok(user.whatsappVerifiedAt instanceof Date);
    assert.equal(await WhatsAppConsentEvent.countDocuments({ userId: user._id }), 0); // verification alone → no events
  });

  test('3. WhatsApp OTP + marketing opted in → opted_in + OPT_IN event (source signup_checkbox)', async () => {
    const { res } = await registerUser({
      channel: 'whatsapp',
      extraBody: {
        serviceConsent: true,
        marketingConsent: true,
        serviceConsentText: 'Service copy', serviceConsentVersion: 'v1.0',
        marketingConsentText: 'Marketing copy', marketingConsentVersion: 'v1.0',
      },
    });
    const user = await User.findOne({ email: res.body.user.email });
    assert.equal(user.whatsappVerified, true);

    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.equal(pref.whatsapp.service.status, 'opted_in');
    assert.equal(pref.whatsapp.marketing.status, 'opted_in');
    assert.equal(await consentService.hasMarketingConsent(user._id), true);

    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean();
    assert.deepEqual(events.map((e) => [e.purpose, e.action, e.source]), [
      ['service', 'OPT_IN', 'signup'],
      ['marketing', 'OPT_IN', 'signup_checkbox'],
    ]);
    assert.equal(events[0].consentText, 'Service copy');
    assert.equal(events[0].consentVersion, 'v1.0');
    assert.equal(events[1].consentText, 'Marketing copy');
    assert.equal(events[1].consentVersion, 'v1.0');
  });

  test('4. WhatsApp OTP + marketing NOT opted in → marketing not_set, NO fake OPT_IN event', async () => {
    const { res } = await registerUser({ channel: 'whatsapp', extraBody: { serviceConsent: true, marketingConsent: false } });
    const user = await User.findOne({ email: res.body.user.email });
    assert.equal(user.whatsappVerified, true);

    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.equal(pref.whatsapp.marketing.status, 'not_set');
    assert.equal(await consentService.hasMarketingConsent(user._id), false);
    // Only the service OPT_IN exists — no marketing event was fabricated.
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).lean();
    assert.equal(events.length, 1);
    assert.equal(events[0].purpose, 'service');
    assert.equal(events[0].action, 'OPT_IN');
  });

  test('5. WhatsApp OTP + explicit service decline → service opted_out, no event fabricated', async () => {
    const { res } = await registerUser({ channel: 'whatsapp', extraBody: { serviceConsent: false } });
    const user = await User.findOne({ email: res.body.user.email });
    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.equal(pref.whatsapp.service.status, 'opted_out');
    assert.equal(await WhatsAppConsentEvent.countDocuments({ userId: user._id }), 0); // decline ≠ action → no history
    assert.equal(await consentService.hasServicePermission(user._id), false);
  });

  test('6. OTP record deleted after registration (existing behavior preserved)', async () => {
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    await authController.completeRegistration(
      mockReq({ name: 'N', email, phone, password: 'secret123', channel: 'whatsapp', role: 'user' }),
      mockRes(), (e) => { throw e; }
    );
    assert.equal(await OTP.countDocuments({ identifier: phone, purpose: 'registration' }), 0);
  });

  test('7. USER_REGISTERED still fires through the notification engine', async () => {
    const before = emitCalls.length;
    await registerUser({ channel: 'whatsapp' });
    assert.ok(emitCalls.slice(before).includes('USER_REGISTERED'));
  });

  test('8. JWT is issued and verifies to the new user id (login continues to work)', async () => {
    const { res } = await registerUser({ channel: 'whatsapp' });
    const token = res.body.token;
    assert.ok(token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(decoded.id, String(res.body.user._id));
    assert.equal(res.body.user.whatsappVerified, true);
  });

  test('9. Pandit registration still works and captures consent', async () => {
    const { res } = await registerUser({ channel: 'whatsapp', role: 'pandit', extraBody: { marketingConsent: true } });
    const user = await User.findOne({ email: res.body.user.email });
    assert.equal(user.role, 'pandit');
    assert.equal(user.whatsappVerified, true);
    const pandit = await Pandit.findOne({ userId: user._id });
    assert.ok(pandit);
    assert.equal(pandit.status, 'approved');
    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.equal(pref.whatsapp.marketing.status, 'opted_in');
  });

  test('10. Referral code flow remains functional', async () => {
    const referrer = await User.create({ name: 'Referrer', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const { res } = await registerUser({ channel: 'whatsapp', extraBody: { referralCode: referrer.referralCode } });
    const user = await User.findOne({ email: res.body.user.email });
    assert.equal(String(user.referredBy), String(referrer._id));
    const updated = await User.findById(referrer._id);
    assert.equal(updated.referralCount, 1);
  });
});
