/**
 * Phase 4 — inbound WhatsApp webhook tests.
 *
 * Covers: Meta subscription verification (GET), X-Hub-Signature-256
 * verification against the raw body (POST), tolerant payload parsing, exact
 * opt-out keyword detection, known/unknown user handling, wamid idempotency
 * (sequential + concurrent), and consent invariants (marketing opted_out,
 * service + whatsappVerified untouched, append-only history, source
 * whatsapp_keyword).
 *
 * Runs against a dedicated TEST database (zutsav_consent_webhook_test) and a
 * throwaway HTTP server that replicates the production wiring
 * (express.json + rawBody verify callback + the webhook router).
 *
 * Run:  cd backend && npm test   (or: node --test)
 */

process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'test-verify-token';
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'test-app-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const mongoose = require('mongoose');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_consent_webhook_test';

const User = require('../src/models/User');
const WhatsAppPreference = require('../src/models/WhatsAppPreference');
const WhatsAppConsentEvent = require('../src/models/WhatsAppConsentEvent');
const webhookService = require('../src/services/whatsappWebhookService');
const consentService = require('../src/services/consentService');
const webhookRouter = require('../src/routes/whatsappWebhook.routes');

let server;
let baseUrl;
let _seq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++)); // 10 digits, first digit 9
const uniqEmail = () => `webhook${Date.now()}_${_seq}@test.zutsav.local`;

const SECRET = process.env.WHATSAPP_APP_SECRET;

function sign(rawBody) {
  const hex = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  return `sha256=${hex}`;
}

/** Build a realistic Meta Cloud API webhook JSON string. */
function webhookPayload({ from = '919876543210', wamid = `wamid.test.${Date.now()}.${_seq++}`, type = 'text', text = 'STOP', timestamp = '1755000000' } = {}) {
  const value = {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '15550000000', phone_number_id: '123456789' },
  };
  if (type === 'status') {
    value.statuses = [{ id: wamid, status: 'read', timestamp }];
  } else {
    value.messages = [{ from, id: wamid, type, timestamp, text: { body: text } }];
  }
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '111111111111111', changes: [{ field: 'messages', value }] }],
  });
}

async function postWebhook(rawBody, { signature } = {}) {
  return fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signature !== undefined ? signature : sign(rawBody),
    },
    body: rawBody,
  });
}

function getWebhook(params) {
  const qs = new URLSearchParams(params).toString();
  return fetch(`${baseUrl}/api/webhooks/whatsapp?${qs}`, { method: 'GET' });
}

async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    WhatsAppPreference.deleteMany({}),
    WhatsAppConsentEvent.deleteMany({}),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), WhatsAppPreference.init(), WhatsAppConsentEvent.init()]);

  // Minimal replica of the production wiring (express.json + rawBody + router).
  const app = express();
  app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use('/api/webhooks/whatsapp', webhookRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ── 1. Meta subscription verification (GET) ─────────────────────────────────

describe('Meta webhook verification (GET)', () => {
  test('valid verify token → challenge echoed', async () => {
    const res = await getWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN, 'hub.challenge': '1234567890' });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '1234567890');
  });

  test('invalid verify token → 403', async () => {
    const res = await getWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong-token', 'hub.challenge': 'abc' });
    assert.equal(res.status, 403);
  });

  test('missing challenge → 403', async () => {
    const res = await getWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN });
    assert.equal(res.status, 403);
  });

  test('wrong mode → 403', async () => {
    const res = await getWebhook({ 'hub.mode': 'unsubscribe', 'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN, 'hub.challenge': 'abc' });
    assert.equal(res.status, 403);
  });
});

// ── 2. Signature verification (POST) ────────────────────────────────────────

describe('X-Hub-Signature-256 verification (POST)', () => {
  before(cleanCollections);

  test('valid signature → 200 accepted', async () => {
    const res = await postWebhook(webhookPayload({ text: 'Hello' }));
    assert.equal(res.status, 200);
  });

  test('invalid signature → 403 and nothing persisted', async () => {
    const raw = webhookPayload({ text: 'STOP', wamid: 'wamid.bad.sig' });
    const res = await postWebhook(raw, { signature: 'sha256=' + '0'.repeat(64) });
    assert.equal(res.status, 403);
    assert.equal(await WhatsAppConsentEvent.countDocuments({ whatsappMessageId: 'wamid.bad.sig' }), 0);
  });

  test('missing signature → 403', async () => {
    const res = await postWebhook(webhookPayload({ text: 'STOP' }), { signature: '' });
    assert.equal(res.status, 403);
  });

  test('modified body fails verification', async () => {
    // Signed payload A; delivered as payload B (different text, same otherwise).
    const rawA = webhookPayload({ text: 'STOP', wamid: 'wamid.modified' });
    const rawB = webhookPayload({ text: 'CANCEL', wamid: 'wamid.modified' });
    const sigA = sign(rawA);
    const res = await postWebhook(rawB, { signature: sigA });
    assert.equal(res.status, 403);
    assert.equal(await WhatsAppConsentEvent.countDocuments({ whatsappMessageId: 'wamid.modified' }), 0);
  });
});

// ── 3. Payload parsing (unit) ───────────────────────────────────────────────

describe('webhookService.parsePayload', () => {
  test('valid text message → extracts from/wamid/type/text/timestamp', () => {
    const raw = webhookPayload({ from: '919876543210', wamid: 'wamid.1', text: 'STOP', timestamp: '1755000000' });
    const msgs = webhookService.parsePayload(raw);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].from, '919876543210');
    assert.equal(msgs[0].wamid, 'wamid.1');
    assert.equal(msgs[0].text, 'STOP');
    assert.equal(msgs[0].timestamp, '1755000000');
  });

  test('malformed JSON → null', () => {
    assert.equal(webhookService.parsePayload('{not json'), null);
  });

  test('status webhook → null (no user messages)', () => {
    assert.equal(webhookService.parsePayload(webhookPayload({ type: 'status' })), null);
  });

  test('non-text (image) message → parsed but carries no text', () => {
    const msgs = webhookService.parsePayload(webhookPayload({ type: 'image', text: '' }));
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].text, '');
  });

  test('message without `from` → skipped', () => {
    const body = JSON.parse(webhookPayload({ text: 'STOP' }));
    body.entry[0].changes[0].value.messages[0].from = undefined;
    assert.equal(webhookService.parsePayload(JSON.stringify(body)), null);
  });
});

// ── 4. Opt-out keyword detection (unit) ─────────────────────────────────────

describe('webhookService.isOptOutMessage', () => {
  test('approved exact commands → true', () => {
    for (const kw of ['STOP', 'stop', ' Stop ', 'OPT OUT', 'opt out', ' Opt   Out ', 'UNSUBSCRIBE', 'CANCEL', 'cancel']) {
      assert.equal(webhookService.isOptOutMessage(kw), true, `expected true for "${kw}"`);
    }
  });

  test('non-commands and partial matches → false', () => {
    for (const msg of ['Please stop', 'OPT-OUT', 'Stop sending me updates', 'Hi', 'Hello', 'Where is my booking?', 'Can I change my booking?', 'CANCEL ORDER', 'stopped']) {
      assert.equal(webhookService.isOptOutMessage(msg), false, `expected false for "${msg}"`);
    }
  });

  test('empty / missing text → false', () => {
    assert.equal(webhookService.isOptOutMessage(''), false);
    assert.equal(webhookService.isOptOutMessage(null), false);
    assert.equal(webhookService.isOptOutMessage(undefined), false);
  });
});

// ── 5. Consent flow (HTTP end-to-end) ───────────────────────────────────────

describe('Opt-out consent flow (HTTP)', () => {
  before(cleanCollections);

  test('known user sends STOP → marketing opted_out, event with source whatsapp_keyword, service + whatsappVerified untouched', async () => {
    const phone = uniqPhone();
    const user = await User.create({ name: 'Devotee', email: uniqEmail(), phone, password: 'secret123', whatsappVerified: true, whatsappVerifiedAt: new Date() });
    // User previously opted in to marketing (simulate signup with consent).
    await consentService.recordOptIn({ userId: user._id, phone, whatsappVerified: true, purpose: 'marketing', source: 'signup_checkbox' });

    const wamid = `wamid.flow.${Date.now()}`;
    const res = await postWebhook(webhookPayload({ from: phone, wamid, text: 'STOP' }));
    assert.equal(res.status, 200);

    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.equal(pref.whatsapp.marketing.status, 'opted_out');
    assert.equal(pref.whatsapp.marketing.source, 'whatsapp_keyword');
    assert.ok(pref.lastOptOutAt);
    // Service permission untouched.
    assert.equal(pref.whatsapp.service.status, 'opted_in');
    // whatsappVerified untouched (User + mirrored preference).
    const reloadedUser = await User.findById(user._id);
    assert.equal(reloadedUser.whatsappVerified, true);

    // Sort by createdAt (insertion order) — the webhook's event carries Meta's
    // message timestamp, which is unrelated to append order.
    const events = await WhatsAppConsentEvent.find({ userId: user._id }).sort({ createdAt: 1 }).lean();
    // OPT_IN (signup) then OPT_OUT (keyword) — history append-only.
    assert.deepEqual(events.map((e) => e.action), ['OPT_IN', 'OPT_OUT']);
    const outEvent = events[1];
    assert.equal(outEvent.purpose, 'marketing');
    assert.equal(outEvent.channel, 'whatsapp');
    assert.equal(outEvent.source, 'whatsapp_keyword');
    assert.equal(outEvent.whatsappMessageId, wamid);
    assert.equal(events[0].whatsappMessageId, undefined); // signup event has no wamid
  });

  test('unknown user sends STOP → 200, no user/preference/event created', async () => {
    const usersBefore = await User.countDocuments();
    const prefsBefore = await WhatsAppPreference.countDocuments();
    const eventsBefore = await WhatsAppConsentEvent.countDocuments();

    const res = await postWebhook(webhookPayload({ from: '919999999999', wamid: `wamid.unknown.${Date.now()}`, text: 'STOP' }));
    assert.equal(res.status, 200);
    assert.equal(await User.countDocuments(), usersBefore);
    assert.equal(await WhatsAppPreference.countDocuments(), prefsBefore);
    assert.equal(await WhatsAppConsentEvent.countDocuments(), eventsBefore);
  });

  test('normal customer message → 200, consent completely untouched', async () => {
    const phone = uniqPhone();
    const user = await User.create({ name: 'Devotee2', email: uniqEmail(), phone, password: 'secret123' });
    await consentService.getOrCreatePreference({ userId: user._id, phone, whatsappVerified: false });

    const res = await postWebhook(webhookPayload({ from: phone, wamid: `wamid.normal.${Date.now()}`, text: 'Where is my booking?' }));
    assert.equal(res.status, 200);

    const pref = await WhatsAppPreference.findOne({ userId: user._id });
    assert.equal(pref.whatsapp.marketing.status, 'not_set');
    assert.equal(pref.whatsapp.service.status, 'opted_in');
    assert.equal(await WhatsAppConsentEvent.countDocuments({ userId: user._id }), 0);
  });

  test('opt-out message without wamid → acknowledged, nothing recorded', async () => {
    const phone = uniqPhone();
    await User.create({ name: 'Devotee3', email: uniqEmail(), phone, password: 'secret123' });
    const eventsBefore = await WhatsAppConsentEvent.countDocuments({});
    const raw = webhookPayload({ from: phone, wamid: 'wamid.nowamid', text: 'STOP' });
    const body = JSON.parse(raw);
    body.entry[0].changes[0].value.messages[0].id = '';
    const res = await postWebhook(JSON.stringify(body));
    assert.equal(res.status, 200);
    // No new consent event was created for the wamid-less message.
    assert.equal(await WhatsAppConsentEvent.countDocuments({}), eventsBefore);
  });

  test('status webhook → 200, nothing recorded', async () => {
    const res = await postWebhook(webhookPayload({ type: 'status' }));
    assert.equal(res.status, 200);
  });
});

// ── 6. Idempotency ──────────────────────────────────────────────────────────

describe('wamid idempotency', () => {
  before(cleanCollections);

  test('same wamid delivered twice (sequential) → exactly one consent event', async () => {
    const phone = uniqPhone();
    await User.create({ name: 'Idem1', email: uniqEmail(), phone, password: 'secret123' });
    const wamid = `wamid.seq.${Date.now()}`;

    const r1 = await postWebhook(webhookPayload({ from: phone, wamid, text: 'STOP' }));
    const r2 = await postWebhook(webhookPayload({ from: phone, wamid, text: 'STOP' }));
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(await WhatsAppConsentEvent.countDocuments({ whatsappMessageId: wamid }), 1);
  });

  test('concurrent duplicate deliveries → still exactly one consent event', async () => {
    const phone = uniqPhone();
    await User.create({ name: 'Idem2', email: uniqEmail(), phone, password: 'secret123' });
    const wamid = `wamid.race.${Date.now()}`;
    const raw = webhookPayload({ from: phone, wamid, text: 'CANCEL' });

    const [r1, r2] = await Promise.all([postWebhook(raw), postWebhook(raw)]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(await WhatsAppConsentEvent.countDocuments({ whatsappMessageId: wamid }), 1);
  });

  test('a different wamid is a genuinely new opt-out', async () => {
    const phone = uniqPhone();
    await User.create({ name: 'Idem3', email: uniqEmail(), phone, password: 'secret123' });
    await postWebhook(webhookPayload({ from: phone, wamid: 'wamid.one', text: 'STOP' }));
    await postWebhook(webhookPayload({ from: phone, wamid: 'wamid.two', text: 'STOP' }));
    assert.equal(await WhatsAppConsentEvent.countDocuments({ whatsappMessageId: { $in: ['wamid.one', 'wamid.two'] } }), 2);
  });
});
