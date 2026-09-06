/**
 * Profile "Promotional Updates" toggle — end-to-end reproduction (Flow B:
 * PATCH /api/users/consent/whatsapp) using the REAL runtime wiring:
 *   express + express.json -> user.routes -> protect (Bearer JWT) ->
 *   user.controller.updateWhatsAppConsent -> consentService ->
 *   WhatsAppPreference + WhatsAppConsentEvent (local MongoDB)
 *   -> the outbound WhatsAppChannel MARKETING consent gate.
 *
 * Registration (Flow A: POST /auth/complete-registration with
 * marketingConsent=true) runs through the SAME auth.controller used in
 * consent-phase1-3.test.js to prove the two flows converge on one
 * consentService and one current-state field.
 *
 * Uses Node's built-in test runner. Run: cd backend && node --test
 * Own database (zutsav_profile_toggle_test) — dropped before/after.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'profile-toggle-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_profile_toggle_test';

const User = require('../src/models/User');
const OTP = require('../src/models/OTP');
const Pandit = require('../src/models/Pandit');
const WhatsAppTemplate = require('../src/models/WhatsAppTemplate');
const NotificationMapping = require('../src/models/NotificationMapping');
const WhatsAppPreference = require('../src/models/WhatsAppPreference');
const WhatsAppConsentEvent = require('../src/models/WhatsAppConsentEvent');
const consentService = require('../src/services/consentService');
const WhatsAppChannel = require('../notification-engine/channels/WhatsAppChannel');
const WhatsAppProvider = require('../notification-engine/providers/WhatsAppProvider');
const authController = require('../src/controllers/auth.controller');

const userRoutes = require('../src/routes/user.routes');

let _seq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++)); // 9XXXXXXXXX
const uniqEmail = () => `toggle${Date.now()}_${_seq}@test.zutsav.local`;
const uniqName  = () => `Toggle User ${_seq}`;

let server, baseUrl;
let providerCalls = [];
const originalProviderSend = WhatsAppProvider.send;

async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    Pandit.deleteMany({}),
    OTP.deleteMany({}),
    WhatsAppPreference.deleteMany({}),
    WhatsAppConsentEvent.deleteMany({}),
    WhatsAppTemplate.deleteMany({}),
    NotificationMapping.deleteMany({}),
  ]);
}

function signToken(user) {
  // Mirrors auth.controller signToken({ id: user._id, v: tokenVersion || 0 }).
  return jwt.sign({ id: String(user._id), v: user.tokenVersion || 0 }, process.env.JWT_SECRET);
}

async function http(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function createUser({ marketingConsent } = {}) {
  const phone = uniqPhone();
  const user = await User.create({
    name: uniqName(),
    phone,
    email: uniqEmail(),
    password: 'dummy-hash-not-used',
  });
  if (marketingConsent === true) {
    await consentService.getOrCreatePreference({ userId: user._id, phone, whatsappVerified: true });
  }
  return user;
}

async function createWhatsAppMarketingFixture(user) {
  const tmpl = await WhatsAppTemplate.create({
    name: 'test_marketing_toggle',
    status: 'APPROVED',
    language: 'en',
    syncedAt: new Date(),
    components: [{ type: 'BODY', text: 'Hello {{1}}' }],
  });
  const mapping = await NotificationMapping.create({
    eventName: 'BOOKING_CONFIRMED',
    recipientType: 'user',
    channel: 'whatsapp',
    purpose: 'MARKETING',
    whatsappTemplateName: tmpl.name,
    whatsappVariables: [{ position: 1, payloadPath: 'customer.name', label: 'Customer name' }],
    enabled: true,
  });
  const payload = {
    _eventName: 'BOOKING_CONFIRMED',
    customer: { name: uniqName(), userId: String(user._id), phone: user.phone, email: user.email },
    booking: { number: 'ZUT-TEST-001', date: '2026-08-20', time: '10:00 AM' },
  };
  return { mapping, payload };
}

// ── Setup ──────────────────────────────────────────────────────────────────

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();

  WhatsAppProvider.send = async (opts) => {
    providerCalls.push(opts);
    return { messages: [{ id: 'wamid.test' }] };
  };

  // Real runtime wiring for the consent endpoints (app.js mounts
  // '/api/users' -> user.routes; user.routes applies protect to everything).
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  console.log(`\n[consent-profile-toggle] reproduction server up at ${baseUrl}`);
});

after(async () => {
  WhatsAppProvider.send = originalProviderSend;
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log('\n[consent-profile-toggle] done');
});

// ═════════════════════════════════════════════════════════════════════════
// FLOW B — PROFILE TOGGLE (PATCH /api/users/consent/whatsapp)
// ═════════════════════════════════════════════════════════════════════════
describe('Profile "Promotional Updates" toggle — runtime reproduction', () => {
  let user, token;

  before(async () => {
    user = await createUser();
    token = signToken(user);
  });

  test('auth: no token → 401 (protect active on the route)', async () => {
    const res = await http('GET', '/api/users/consent/whatsapp');
    assert.equal(res.status, 401);
  });

  test('1. GET consent before toggle → marketing not_set, service opted_in', async () => {
    const res = await http('GET', '/api/users/consent/whatsapp', { token });
    assert.equal(res.status, 200);
    assert.equal(res.json?.success, true);
    assert.equal(res.json?.consent?.whatsapp?.marketing?.status, 'not_set');
    assert.equal(res.json?.consent?.whatsapp?.service?.status, 'opted_in');
    assert.equal(res.json?.consent?.whatsapp?.marketing?.source, '');
  });

  test('2. validation: non-boolean marketingConsent → 400', async () => {
    const res = await http('PATCH', '/api/users/consent/whatsapp', { token, body: { marketingConsent: 'yes' } });
    assert.equal(res.status, 400);
    assert.match(res.json?.message || '', /marketingConsent/);
  });

  test('3. toggle ON → PATCH returns opted_in + source preference_center (changed=true)', async () => {
    const res = await http('PATCH', '/api/users/consent/whatsapp', { token, body: { marketingConsent: true } });
    assert.equal(res.status, 200);
    assert.equal(res.json?.success, true);
    assert.equal(res.json?.changed, true);
    assert.equal(res.json?.consent?.whatsapp?.marketing?.status, 'opted_in');
    assert.equal(res.json?.consent?.whatsapp?.marketing?.source, 'preference_center');
    assert.ok(res.json?.consent?.whatsapp?.marketing?.timestamp);
  });

  test('4. read-after-write: GET immediately returns opted_in', async () => {
    const res = await http('GET', '/api/users/consent/whatsapp', { token });
    assert.equal(res.status, 200);
    assert.equal(res.json?.consent?.whatsapp?.marketing?.status, 'opted_in');
  });

  test('5. DB: WhatsAppPreference document is opted_in / preference_center', async () => {
    const pref = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    assert.ok(pref, 'preference document must exist');
    assert.equal(pref.whatsapp?.marketing?.status, 'opted_in');
    assert.equal(pref.whatsapp?.marketing?.source, 'preference_center');
    assert.ok(pref.whatsapp?.marketing?.timestamp instanceof Date);
    assert.ok(pref.lastOptInAt instanceof Date);
    assert.equal(pref.phone, `91${user.phone}`); // E.164-normalized
  });

  test('6. DB: one OPT_IN consent event (channel whatsapp, source preference_center)', async () => {
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean();
    assert.equal(events.length, 1);
    assert.equal(events[0].channel, 'whatsapp');
    assert.equal(events[0].purpose, 'marketing');
    assert.equal(events[0].action, 'OPT_IN');
    assert.equal(events[0].source, 'preference_center');
    assert.equal(events[0].phone, `91${user.phone}`);
  });

  test('7. consentService agrees: hasMarketingConsent(userId) === true', async () => {
    assert.equal(await consentService.hasMarketingConsent(user._id), true);
  });

  test('8. marketing send gate: opted_in → provider called (allowed)', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppMarketingFixture(user);
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(user._id), phone: user.phone, email: user.email,
    });
    assert.equal(result.skip, undefined);
    assert.equal(providerCalls.length, calls + 1);
  });

  test('9. toggle OFF → PATCH returns opted_out (changed=true)', async () => {
    const res = await http('PATCH', '/api/users/consent/whatsapp', { token, body: { marketingConsent: false } });
    assert.equal(res.status, 200);
    assert.equal(res.json?.changed, true);
    assert.equal(res.json?.consent?.whatsapp?.marketing?.status, 'opted_out');
  });

  test('10. read-after-write: GET returns opted_out', async () => {
    const res = await http('GET', '/api/users/consent/whatsapp', { token });
    assert.equal(res.json?.consent?.whatsapp?.marketing?.status, 'opted_out');
  });

  test('11. DB: status opted_out / preference_center, lastOptOutAt set, lastOptInAt preserved', async () => {
    const pref = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    assert.equal(pref.whatsapp?.marketing?.status, 'opted_out');
    assert.equal(pref.whatsapp?.marketing?.source, 'preference_center');
    assert.ok(pref.lastOptOutAt instanceof Date);
    assert.ok(pref.lastOptInAt instanceof Date);
  });

  test('12. DB: OPT_OUT event appended; OPT_IN history preserved', async () => {
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean();
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.action), ['OPT_IN', 'OPT_OUT']);
    for (const e of events) {
      assert.equal(e.channel, 'whatsapp');
      assert.equal(e.purpose, 'marketing');
      assert.equal(e.source, 'preference_center');
    }
  });

  test('13. consentService agrees: hasMarketingConsent(userId) === false', async () => {
    assert.equal(await consentService.hasMarketingConsent(user._id), false);
  });

  test('14. marketing send gate: opted_out → blocked with marketing_consent_missing, provider not called', async () => {
    const calls = providerCalls.length;
    const { mapping, payload } = await createWhatsAppMarketingFixture(user);
    const result = await WhatsAppChannel.send(mapping, payload, {
      userId: String(user._id), phone: user.phone, email: user.email,
    });
    assert.equal(result.skip, true);
    assert.equal(result.reason, 'marketing_consent_missing');
    assert.equal(providerCalls.length, calls);
  });

  test('15. idempotency: re-saving the same OFF state → changed=false, no duplicate event', async () => {
    const res = await http('PATCH', '/api/users/consent/whatsapp', { token, body: { marketingConsent: false } });
    assert.equal(res.json?.changed, false);
    const outEvents = await WhatsAppConsentEvent.countDocuments({ userId: user._id, action: 'OPT_OUT' });
    assert.equal(outEvents, 1);
  });

  test('16. toggle ON again after OFF → back to opted_in (read-after-write on the DB)', async () => {
    await http('PATCH', '/api/users/consent/whatsapp', { token, body: { marketingConsent: true } });
    const pref = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    assert.equal(pref.whatsapp?.marketing?.status, 'opted_in');
    const res = await http('GET', '/api/users/consent/whatsapp', { token });
    assert.equal(res.json?.consent?.whatsapp?.marketing?.status, 'opted_in');
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean();
    assert.deepEqual(events.map((e) => e.action), ['OPT_IN', 'OPT_OUT', 'OPT_IN']);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// FLOW A vs FLOW B — REGISTRATION == PROFILE, SAME STATE, SAME GATE
// ═════════════════════════════════════════════════════════════════════════
describe('Registration vs Profile comparison (flow divergence check)', () => {
  test('registration marketingConsent=true writes source=signup and the SAME field', async () => {
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = {
      body: { name: 'Reg Toggle User', email, phone, password: 'secret123', channel: 'whatsapp', role: 'user',
              marketingConsent: true, marketingConsentText: 'I agree', marketingConsentVersion: 'v1.2.0' },
      headers: {}, socket: {},
    };
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
    let errOut = null;
    await authController.completeRegistration(req, res, (e) => { errOut = e; });
    if (errOut) throw errOut;
    assert.equal(res.statusCode, 201);

    const user = await User.findOne({ phone }).lean();
    assert.ok(user);
    const pref = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    assert.equal(pref.whatsapp?.marketing?.status, 'opted_in');
    assert.equal(pref.whatsapp?.marketing?.source, 'signup_checkbox');
  });

  test('then the SAME registration user can toggle OFF via the profile PATCH (source→preference_center)', async () => {
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    const req = {
      body: { name: 'Reg Toggle User 2', email, phone, password: 'secret123', channel: 'whatsapp', role: 'user',
              marketingConsent: true },
      headers: {}, socket: {},
    };
    const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
    let errOut = null;
    await authController.completeRegistration(req, res, (e) => { errOut = e; });
    if (errOut) throw errOut;

    const user = await User.findOne({ phone }).lean();
    const token = signToken(user);

    // Profile toggle OFF over real HTTP.
    const off = await http('PATCH', '/api/users/consent/whatsapp', { token, body: { marketingConsent: false } });
    assert.equal(off.json?.changed, true);
    assert.equal(off.json?.consent?.whatsapp?.marketing?.status, 'opted_out');

    const pref = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    assert.equal(pref.whatsapp?.marketing?.status, 'opted_out');
    assert.equal(pref.whatsapp?.marketing?.source, 'preference_center');

    // History: signup OPT_IN + profile OPT_OUT both present, append-only.
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ timestamp: 1 }).lean();
    assert.deepEqual(events.map((e) => ({ a: e.action, s: e.source })), [
      { a: 'OPT_IN', s: 'signup_checkbox' },
      { a: 'OPT_OUT', s: 'preference_center' },
    ]);
  });
});