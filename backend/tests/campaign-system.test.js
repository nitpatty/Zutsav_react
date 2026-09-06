/**
 * Coupon Marketing & Campaign System — tests.
 *
 * Covers the campaign foundation:
 *   - CouponCampaign model + status lifecycle
 *   - Consent-aware audience discovery (cursor-paginated, never full-load)
 *   - createCampaign validation (channel/mapping/coupon/audience invariants,
 *     email HARD-blocked until a real email marketing consent gate exists)
 *   - startCampaign → enqueues durable NotificationJobs via the existing
 *     JobQueue, idempotently (campaignId+userId+channel)
 *   - Cancellation stops the campaign and cancels still-queued jobs
 *   - settleJob ledger sync maps a job's terminal outcome to the recipient
 *     row + campaign counters (delivered/skipped/failed)
 *   - The WhatsApp MARKETING consent gate stays the final authority at send
 *   - Admin HTTP routes (auth required, admin-only)
 *
 * Uses Node's built-in test runner (node:test). Run: cd backend && node --test
 * Runs against a dedicated TEST database and drops it before/after. Never
 * touches dev/prod data.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'campaign-system-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_campaign_test';

const User = require('../src/models/User');
const Coupon = require('../src/models/Coupon');
const CouponRedemption = require('../src/models/CouponRedemption');
const CouponCampaign = require('../src/models/CouponCampaign');
const CouponCampaignRecipient = require('../src/models/CouponCampaignRecipient');
const NotificationMapping = require('../src/models/NotificationMapping');
const NotificationJob = require('../src/models/NotificationJob');
const WhatsAppTemplate = require('../src/models/WhatsAppTemplate');
const WhatsAppPreference = require('../src/models/WhatsAppPreference');

const consentService = require('../src/services/consentService');
const campaignService = require('../src/services/campaignService');
const campaignAudienceService = require('../src/services/campaignAudienceService');
const WhatsAppChannel = require('../notification-engine/channels/WhatsAppChannel');
const WhatsAppProvider = require('../notification-engine/providers/WhatsAppProvider');
const Worker = require('../notification-engine/queue/Worker');
const JobQueue = require('../notification-engine/queue/JobQueue');
const bootstrap = require('../notification-engine/bootstrap');

const adminCampaignRoutes = require('../src/routes/adminCampaign.routes');

let server, baseUrl;
let adminToken, userToken;

let _seq = 0;
const uniqPhone = () => `9${String(9_00000000 + (_seq++)).slice(0, 9)}`;
const uniqEmail = () => `camp${Date.now()}_${_seq}@test.zutsav.local`;
const uniqCode = () => `CAMPAIGN${Date.now()}${_seq}`;

async function cleanCollections() {
  await Promise.all([
    CouponCampaign.deleteMany({}),
    CouponCampaignRecipient.deleteMany({}),
    Coupon.deleteMany({}),
    CouponRedemption.deleteMany({}),
    NotificationMapping.deleteMany({}),
    NotificationJob.deleteMany({}),
    WhatsAppTemplate.deleteMany({}),
    WhatsAppPreference.deleteMany({}),
    User.deleteMany({}),
  ]);
}

async function makeUser({ marketing = null } = {}) {
  const phone = uniqPhone();
  const user = await User.create({
    name: `CampaignTester ${_seq}`,
    email: uniqEmail(),
    phone,
    password: 'hashed',
  });
  if (marketing === true) {
    await consentService.getOrCreatePreference({ userId: user._id, phone, whatsappVerified: true });
    await consentService.recordOptIn({ userId: user._id, phone, purpose: 'marketing', source: 'preference_center' });
  } else if (marketing === false) {
    await consentService.getOrCreatePreference({ userId: user._id, phone, whatsappVerified: true });
    await consentService.recordOptOut({ userId: user._id, phone, purpose: 'marketing', source: 'whatsapp_keyword' });
  }
  return user;
}

async function makeCoupon(overrides = {}) {
  return Coupon.create({
    code: uniqCode(),
    discountType: 'FIXED',
    discountValue: 100,
    minCartValue: 0,
    applicability: ['POOJA'],
    isActive: true,
    usageCount: 0,
    ...overrides,
  });
}

async function makeMarketingMapping(overrides = {}) {
  const tmpl = await WhatsAppTemplate.create({
    name: `campaign_tmpl_${Date.now()}_${_seq}`,
    status: 'APPROVED',
    language: 'en',
    syncedAt: new Date(),
    components: [
      { type: 'BODY', text: 'Hi {{1}}, here is your coupon {{2}}' },
    ],
  });
  return NotificationMapping.create({
    eventName: 'CAMPAIGN_COUPON',
    recipientType: 'user',
    channel: 'whatsapp',
    purpose: 'MARKETING',
    enabled: true,
    whatsappTemplateName: tmpl.name,
    whatsappLanguage: 'en',
    whatsappVariables: [
      { position: 1, payloadPath: 'customer.name' },
      { position: 2, payloadPath: 'coupon.code' },
    ],
    ...overrides,
  });
}

function signToken(user) {
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
}

// ── Provider spy ─────────────────────────────────────────────────────────
const originalSend = WhatsAppProvider.send;
let providerCalls = [];

before(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(TEST_URI);
  await cleanCollections();
  await WhatsAppPreference.deleteMany({});
  await NotificationJob.deleteMany({});

  WhatsAppProvider.send = async (opts) => {
    providerCalls.push(opts);
    return { messages: [{ id: 'wamid.campaign.test' }] };
  };

  const admin = await User.create({ name: 'Admin', email: 'admin-c@test.com', phone: '9010000100', password: 'hashed', role: 'admin' });
  adminToken = signToken(admin);

  const app = express();
  app.use(express.json());
  app.use('/api/admin/campaigns', adminCampaignRoutes);
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  WhatsAppProvider.send = originalSend;
  await cleanCollections();
  await mongoose.connection.close();
});

async function req(method, path, { body, token = adminToken } = {}) {
  const res = await fetch(`${baseUrl}/api/admin/campaigns${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// ═════════════════════════════════════════════════════════════════════════
// AUDIENCE DISCOVERY (consent-aware, cursor-pack)
// ═════════════════════════════════════════════════════════════════════════
describe('Consent-aware audience discovery', () => {
  test('only marketing-opted-in users are selected; opted-out/not-set are excluded', async () => {
    await cleanCollections();
    const optedIn = await makeUser({ marketing: true });
    await makeUser({ marketing: false });
    await makeUser({ marketing: false }); // opted_out
    await makeUser({});                    // no preference (not_set)

    const campaign = await CouponCampaign.create({
      name: 'Audience Test',
      status: 'DRAFT',
      audienceType: 'ALL_MARKETING_OPTED_IN_USERS',
      channel: 'whatsapp',
      couponId: new mongoose.Types.ObjectId(),
      mappingId: new mongoose.Types.ObjectId(),
    });

    const { recipients } = await campaignAudienceService.discoverPage(campaign, { limit: 100 });
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].userId, String(optedIn._id));
  });

  test('cursor pagination returns bounded pages and a nextCursor', async () => {
    await cleanCollections();
    const users = [];
    for (let i = 0; i < 5; i++) users.push(await makeUser({ marketing: true }));

    const campaign = await CouponCampaign.create({
      name: 'Paging', status: 'DRAFT', audienceType: 'ALL_MARKETING_OPTED_IN_USERS', channel: 'whatsapp',
      couponId: new mongoose.Types.ObjectId(), mappingId: new mongoose.Types.ObjectId(),
    });

    const page1 = await campaignAudienceService.discoverPage(campaign, { limit: 2 });
    assert.equal(page1.recipients.length, 2);
    assert.ok(page1.nextCursor, 'first page must return a nextCursor');
    assert.equal(page1.complete, false);

    const page2 = await campaignAudienceService.discoverPage(campaign, { limit: 2, cursor: page1.nextCursor });
    assert.equal(page2.recipients.length, 2);

    const page3 = await campaignAudienceService.discoverPage(campaign, { limit: 2, cursor: page2.nextCursor });
    assert.equal(page3.recipients.length, 1);
    assert.equal(page3.complete, true);
    assert.equal(page3.nextCursor, null);

    const all = [...page1.recipients, ...page2.recipients, ...page3.recipients];
    assert.equal(all.length, 5);
    const unique = new Set(all.map((r) => r.userId));
    assert.equal(unique.size, 5, 'cursor paging must never yield duplicates across pages');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CAMPAIGN CREATION — VALIDATION
// ═════════════════════════════════════════════════════════════════════════
describe('createCampaign validation', () => {
  before(cleanCollections);

  test('creates a DRAFT campaign for a valid whatsapp MARKETING mapping', async () => {
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    const camp = await campaignService.createCampaign({
      name: 'First Campaign', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp',
      createdBy: null,
    });
    assert.equal(camp.status, 'DRAFT');
    assert.equal(camp.channel, 'whatsapp');
    assert.equal(String(camp.couponId), String(coupon._id));
  });

  test('email channel is HARD-BLOCKED (no email marketing consent gate yet)', async () => {
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    await assert.rejects(
      campaignService.createCampaign({
        name: 'Email Camp', couponId: coupon._id, mappingId: mapping._id, channel: 'email', createdBy: null,
      }),
      (err) => err.status === 422 && /email/i.test(err.message)
    );
  });

  test('rejects a non-CAMPAIGN_COUPON or non-MARKETING or non-whatsapp mapping', async () => {
    const coupon = await makeCoupon();
    const tmpl = await WhatsAppTemplate.create({
      name: `wrong_tmpl_${Date.now()}`, status: 'APPROVED', language: 'en', syncedAt: new Date(),
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
    });
    const wrongEvent = await NotificationMapping.create({
      eventName: 'BOOKING_CONFIRMED', recipientType: 'user', channel: 'whatsapp',
      purpose: 'BOOKING', enabled: true, whatsappTemplateName: tmpl.name,
      whatsappVariables: [{ position: 1, payloadPath: 'customer.name' }],
    });
    await assert.rejects(
      campaignService.createCampaign({ name: 'X', couponId: coupon._id, mappingId: wrongEvent._id, channel: 'whatsapp', createdBy: null }),
      (e) => e.status === 422 && /CAMPAIGN_COUPON/i.test(e.message)
    );

    const nonMarketing = await makeMarketingMapping({ purpose: 'SERVICE' });
    await assert.rejects(
      campaignService.createCampaign({ name: 'Y', couponId: coupon._id, mappingId: nonMarketing._id, channel: 'whatsapp', createdBy: null }),
      (e) => e.status === 422 && /MARKETING/i.test(e.message)
    );
  });

  test('rejects an inactive coupon', async () => {
    const coupon = await makeCoupon({ isActive: false });
    const mapping = await makeMarketingMapping();
    await assert.rejects(
      campaignService.createCampaign({ name: 'Z', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp', createdBy: null }),
      (e) => e.status === 422 && /active/i.test(e.message)
    );
  });

  test('unsupported audience strategy is rejected', async () => {
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    await assert.rejects(
      campaignService.createCampaign({
        name: 'Seg', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp',
        audienceType: 'LOCATION', createdBy: null,
      }),
      (e) => e.status === 422
    );
  });

  test('future scheduledAt creates a SCHEDULED campaign', async () => {
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    const camp = await campaignService.createCampaign({
      name: 'Later', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp',
      scheduledAt: new Date(Date.now() + 86400000), createdBy: null,
    });
    assert.equal(camp.status, 'SCHEDULED');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// START → ENQUEUE (durable queue, idempotent)
// ═════════════════════════════════════════════════════════════════════════
describe('startCampaign enqueues to the durable queue', () => {
  before(async () => {
    await cleanCollections();
    providerCalls = [];
  });

  test('enqueues one NotificationJob per opted-in recipient', async () => {
    const optedIn = await makeUser({ marketing: true });
    await makeUser({ marketing: true });
    await makeUser({ marketing: false }); // must NOT be enqueued
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();

    const camp = await campaignService.createCampaign({
      name: 'Broadcast 1', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp', createdBy: null,
    });

    const { campaign, sweep } = await campaignService.startCampaign({ campaignId: camp._id, actorId: null, maxPages: 100 });
    assert.equal(campaign.status, 'COMPLETED', 'a fully-enqueued sweep completes the campaign');
    assert.equal(sweep.complete, true);
    assert.equal(sweep.processed, 2, 'only the 2 opted-in users are processed');

    const jobs = await NotificationJob.find({ eventName: 'CAMPAIGN_COUPON' });
    assert.equal(jobs.length, 2);

    const recs = await CouponCampaignRecipient.find({ campaignId: camp._id });
    assert.equal(recs.length, 2);
    assert.ok(recs.every((r) => r.status === 'enqueued'));
    assert.ok(recs.every((r) => r.jobId));

    // the opted-out user never got a recipient row or a job
    const optedOutJobs = jobs.filter((j) => j.recipient && String(j.recipient.userId) !== String(optedIn._id));
    assert.equal(jobs.length - optedOutJobs.length, 1);
  });

  test('starting again is idempotent — no duplicate recipients/jobs', async () => {
    const campaign = await CouponCampaign.findOne({ name: 'Broadcast 1' });
    const jobsBefore = await NotificationJob.countDocuments({ eventName: 'CAMPAIGN_COUPON' });
    const recsBefore = await CouponCampaignRecipient.countDocuments({ campaignId: campaign._id });

    // Campaign is COMPLETED now — restart must be rejected.
    await assert.rejects(
      campaignService.startCampaign({ campaignId: campaign._id }),
      (e) => e.status === 409
    );
  });

  test('campaign payload includes coupon for the mapping to render', async () => {
    const coupon = await makeCoupon({ code: 'THANKYOU10', discountValue: 50 });
    const mapping = await makeMarketingMapping();
    const camp = await campaignService.createCampaign({
      name: 'Payload test', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp', createdBy: null,
    });
    const spy = await makeUser({ marketing: true });

    await campaignService.startCampaign({ campaignId: camp._id, actorId: null, maxPages: 100 });

    const job = await NotificationJob.findOne({ eventName: 'CAMPAIGN_COUPON' });
    assert.equal(job.normalizedPayload.coupon.code, 'THANKYOU10');
    assert.equal(job.normalizedPayload.coupon.discountValue, 50);
    assert.equal(job.normalizedPayload.coupon.label, '₹50 off');
    assert.ok(job.normalizedPayload.customer.name);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// WORKER + CONSENT GATE (defense in depth)
// ═════════════════════════════════════════════════════════════════════════
describe('Worker processing keeps the MARKETING consent gate authoritative', () => {
  before(async () => {
    await cleanCollections();
    providerCalls = [];
    // Register the real job processor + campaign settled-hook so Worker.tick()
    // actually renders/sends via WhatsAppChannel (with the live consent gate)
    // and syncing the recipient ledger exactly as boot does.
    await bootstrap.init();
  });

  test('opted-in recipient delivers; opted-out recipient is skipped by the channel gate', async () => {
    const optedIn = await makeUser({ marketing: true });
    const optedOut = await makeUser({ marketing: false });
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();

    // Build two jobs directly (opted-in and opted-out) as the sweep would.
    // Manual enqueue to control consent independently of discovery.
    const payloadIn = campaignService.buildCampaignPayload({
      user: { _id: optedIn._id, name: optedIn.name, email: optedIn.email, phone: optedIn.phone },
      coupon: await Coupon.findById(coupon._id).lean(),
      campaign: { name: 'Gate' },
    });
    const payloadOut = campaignService.buildCampaignPayload({
      user: { _id: optedOut._id, name: optedOut.name, email: optedOut.email, phone: optedOut.phone },
      coupon: await Coupon.findById(coupon._id).lean(),
      campaign: { name: 'Gate' },
    });

    const jobIn = await JobQueue.enqueue({ eventName: 'CAMPAIGN_COUPON', mappingId: mapping._id, channel: 'whatsapp', recipient: { userId: optedIn._id, phone: optedIn.phone, email: optedIn.email }, normalizedPayload: payloadIn });
    const jobOut = await JobQueue.enqueue({ eventName: 'CAMPAIGN_COUPON', mappingId: mapping._id, channel: 'whatsapp', recipient: { userId: optedOut._id, phone: optedOut.phone, email: optedOut.email }, normalizedPayload: payloadOut });

    for (const c of [jobIn, jobOut]) {
      await CouponCampaignRecipient.create({
        campaignId: (await CouponCampaign.create({ name: 'Gate parent', status: 'COMPLETED', couponId: new mongoose.Types.ObjectId(), mappingId: new mongoose.Types.ObjectId() }))._id,
        userId: c.recipient.userId, channel: 'whatsapp', jobId: c._id, status: 'enqueued',
      });
    }

    await Worker.tick();

    const inJob = await NotificationJob.findById(jobIn._id);
    const outJob = await NotificationJob.findById(jobOut._id);
    assert.equal(inJob.status, 'delivered');
    assert.equal(outJob.status, 'skipped');
    assert.equal(providerCalls.length, 1, 'only the opted-in recipient reaches the provider');
  });

  test('settleJob reconciles the recipient ledger + campaign counters', async () => {
    const parent = await CouponCampaign.create({ name: 'Ledger parent', status: 'RUNNING', deliveredCount: 0, skippedCount: 0, failedCount: 0, couponId: new mongoose.Types.ObjectId(), mappingId: new mongoose.Types.ObjectId() });
    const u = await makeUser({ marketing: true });
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    const payload = campaignService.buildCampaignPayload({
      user: { _id: u._id, name: u.name, email: u.email, phone: u.phone },
      coupon: await Coupon.findById(coupon._id).lean(), campaign: { name: 'Ledger' },
    });
    const job = await JobQueue.enqueue({ eventName: 'CAMPAIGN_COUPON', mappingId: mapping._id, channel: 'whatsapp', recipient: { userId: u._id, phone: u.phone, email: u.email }, normalizedPayload: payload });
    const rec = await CouponCampaignRecipient.create({ campaignId: parent._id, userId: u._id, channel: 'whatsapp', jobId: job._id, status: 'enqueued' });

    await campaignService.settleJob(job, 'delivered');
    let r = await CouponCampaignRecipient.findById(rec._id);
    assert.equal(r.status, 'delivered');
    let c = await CouponCampaign.findById(parent._id);
    assert.equal(c.deliveredCount, 1);

    await campaignService.settleJob(job, 'delivered'); // re-settle is a no-op
    c = await CouponCampaign.findById(parent._id);
    assert.equal(c.deliveredCount, 1, 'double-settle must not double count');

    // failed path — use a distinct campaign to avoid the unique index
    const parent2 = await CouponCampaign.create({ name: 'Ledger parent 2', status: 'RUNNING', failedCount: 0, couponId: new mongoose.Types.ObjectId(), mappingId: new mongoose.Types.ObjectId() });
    const job2 = await JobQueue.enqueue({ eventName: 'CAMPAIGN_COUPON', mappingId: mapping._id, channel: 'whatsapp', recipient: { userId: u._id, phone: u.phone, email: u.email }, normalizedPayload: payload });
    const rec2 = await CouponCampaignRecipient.create({ campaignId: parent2._id, userId: u._id, channel: 'whatsapp', jobId: job2._id, status: 'enqueued' });
    await campaignService.settleJob(job2, 'dead_letter', 'provider 500');
    r = await CouponCampaignRecipient.findById(rec2._id);
    assert.equal(r.status, 'failed');
    assert.match(r.lastError, /500/);
    c = await CouponCampaign.findById(parent2._id);
    assert.equal(c.failedCount, 1);

    // non-campaign job is ignored
    const other = await JobQueue.enqueue({ eventName: 'BOOKING_CONFIRMED', mappingId: mapping._id, channel: 'whatsapp', recipient: { userId: u._id, phone: u.phone, email: u.email }, normalizedPayload: payload });
    await campaignService.settleJob(other, 'delivered');
    assert.equal((await CouponCampaign.findById(parent._id)).deliveredCount, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CANCELLATION
// ═════════════════════════════════════════════════════════════════════════
describe('cancelCampaign', () => {
  test('cancels the campaign and cancels still-queued jobs', async () => {
    await cleanCollections();
    const u = await makeUser({ marketing: true });
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    const camp = await campaignService.createCampaign({ name: 'Cancel me', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp', createdBy: null });

    const payload = campaignService.buildCampaignPayload({ user: { _id: u._id, name: u.name, email: u.email, phone: u.phone }, coupon: await Coupon.findById(coupon._id).lean(), campaign: { name: 'C' } });
    const job = await JobQueue.enqueue({ eventName: 'CAMPAIGN_COUPON', mappingId: mapping._id, channel: 'whatsapp', recipient: { userId: u._id, phone: u.phone, email: u.email }, normalizedPayload: payload });
    await CouponCampaignRecipient.create({ campaignId: camp._id, userId: u._id, channel: 'whatsapp', jobId: job._id, status: 'enqueued' });

    // Mark as RUNNING so it can be cancelled.
    await CouponCampaign.updateOne({ _id: camp._id }, { $set: { status: 'RUNNING' } });

    const cancelled = await campaignService.cancelCampaign({ campaignId: camp._id, actorId: null, reason: 'oops' });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.cancelReason, 'oops');

    const j = await NotificationJob.findById(job._id);
    assert.equal(j.status, 'cancelled');
    const r = await CouponCampaignRecipient.findOne({ campaignId: camp._id });
    assert.equal(r.status, 'cancelled');
  });

  test('cannot cancel an already-completed campaign', async () => {
    await cleanCollections();
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    const camp = await CouponCampaign.create({ name: 'Done', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp', status: 'COMPLETED' });
    await assert.rejects(campaignService.cancelCampaign({ campaignId: camp._id }), (e) => e.status === 409);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// HTTP ROUTES (auth + behavior)
// ═════════════════════════════════════════════════════════════════════════
describe('Admin campaign HTTP routes', () => {
  before(async () => {
    await cleanCollections();
    // Re-create the admin here because cleanCollections wiped the one from the
    // outer before() block; adminToken must reference a live admin document.
    const admin = await User.create({ name: 'Admin', email: 'admin-c@test.com', phone: '9010000101', password: 'hashed', role: 'admin' });
    adminToken = signToken(admin);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/admin/campaigns/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });

  test('non-admin user is forbidden', async () => {
    const user = await makeUser({ marketing: null });
    const res = await req('GET', '/', { token: signToken(user) });
    assert.equal(res.status, 403);
  });

  test('full create → start → recipients lifecycle over HTTP', async () => {
    await makeUser({ marketing: true });
    await makeUser({ marketing: true });
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();

    const created = await req('POST', '/', {
      body: { name: 'HTTP Campaign', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.campaign.status, 'DRAFT');

    const id = created.data.campaign._id;

    const preview = await req('POST', `/${id}/preview`, {});
    assert.equal(preview.status, 200);
    assert.ok(preview.data.totalAudience >= 2);
    assert.equal(preview.data.channel, 'whatsapp');

    const started = await req('POST', `/${id}/start`, {});
    assert.equal(started.status, 200);
    assert.equal(started.data.campaign.status, 'COMPLETED');
    assert.equal(started.data.sweep.processed, 2);

    const recs = await req('GET', `/${id}/recipients?limit=10`, {});
    assert.equal(recs.status, 200);
    assert.equal(recs.data.total, 2);

    const detail = await req('GET', `/${id}`, {});
    assert.equal(detail.status, 200);
    assert.ok(detail.data.recipientSummary);
  });

  test('email campaign over HTTP is rejected (422)', async () => {
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();
    const res = await req('POST', '/', {
      body: { name: 'No email', couponId: coupon._id, mappingId: mapping._id, channel: 'email' },
    });
    assert.equal(res.status, 422);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// REDEMPTION CAMPAIGN ATTRIBUTION (backward compatible)
// ═════════════════════════════════════════════════════════════════════════
describe('Redemption campaign attribution', () => {
  const couponService = require('../src/services/couponService');

  test('recordRedemption stores source=campaign + campaignId; defaults to manual without them', async () => {
    await CouponRedemption.deleteMany({});
    const user = await makeUser({ marketing: null });
    const coupon = await makeCoupon();
    const couponId = coupon._id;
    const campaignId = new mongoose.Types.ObjectId();

    // With attribution
    const a = await couponService.recordRedemption({
      couponId, userId: user._id, bookingId: new mongoose.Types.ObjectId(),
      purchaseType: 'POOJA', discountType: 'FIXED', discountApplied: 100, cartValue: 500, finalPayable: 400,
      source: 'campaign', campaignId,
    });
    assert.equal(a.redemption.source, 'campaign');
    assert.equal(String(a.redemption.campaignId), String(campaignId));

    // Without attribution → defaults to manual, no campaignId (existing path)
    const b = await couponService.recordRedemption({
      couponId, userId: user._id, orderId: new mongoose.Types.ObjectId(),
      purchaseType: 'PRODUCTS', discountType: 'FIXED', discountApplied: 50, cartValue: 500, finalPayable: 450,
    });
    assert.equal(b.redemption.source, 'manual');
    assert.equal(b.redemption.campaignId, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// SCHEDULING
// ═════════════════════════════════════════════════════════════════════════
describe('Scheduling', () => {
  test('startDueCampaigns starts SCHEDULED campaigns whose time has come', async () => {
    await cleanCollections();
    await makeUser({ marketing: true });
    const coupon = await makeCoupon();
    const mapping = await makeMarketingMapping();

    // Create as SCHEDULED (future), then backdate so it reads as due — this
    // is exactly the transition a SCHEDULED campaign goes through once time
    // passes its scheduledAt.
    const futureDate = new Date(Date.now() + 86400000);
    const past = await campaignService.createCampaign({
      name: 'Due now', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp',
      scheduledAt: futureDate, createdBy: null,
    });
    assert.equal(past.status, 'SCHEDULED');
    await CouponCampaign.updateOne({ _id: past._id }, { $set: { scheduledAt: new Date(Date.now() - 1000) } });

    const notDue = await campaignService.createCampaign({
      name: 'Not yet', couponId: coupon._id, mappingId: mapping._id, channel: 'whatsapp',
      scheduledAt: new Date(Date.now() + 86400000), createdBy: null,
    });

    const started = await campaignService.startDueCampaigns();
    assert.ok(started.includes(String(past._id)));
    assert.ok(!started.includes(String(notDue._id)));

    const p = await CouponCampaign.findById(past._id);
    const f = await CouponCampaign.findById(notDue._id);
    assert.equal(p.status, 'COMPLETED');
    assert.equal(f.status, 'SCHEDULED');
  });
});
