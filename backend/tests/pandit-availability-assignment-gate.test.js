/**
 * Booking Assignment — Pandit AVAILABILITY (Online/Offline) Gate
 *
 * BUG: The Pandit Dashboard shows the pandit's status from `Pandit.isOnline`
 *      (toggled via PATCH /api/pandits/me/online-status), yet the Admin
 *      Assign/Reassign Pandit flow never consulted that flag:
 *        - GET  /api/admin/pandits/available  (recommended + in-coverage)
 *        - GET  /api/admin/pandits/search     (manual search)
 *        - PATCH /api/admin/bookings/:id/assign (the mutation itself)
 *      An Offline pandit therefore still appeared as a recommended,
 *      in-coverage candidate and could even be assigned by a direct API
 *      call. "In coverage" is geographic eligibility only and must never
 *      override the Offline status.
 *
 * AUTHORITATIVE AVAILABILITY RULE (see src/services/panditEligibilityService.js):
 *      pandit.isOnline === true  &&  pandit.isAvailableForBookings !== false
 * `isOnline` is fail-closed: the dashboard renders "Offline" for ANY falsy
 * value (including a missing field), so only an explicit true is Online.
 * Client-submitted isOnline/available/status flags are NEVER trusted.
 *
 * Candidate discovery now excludes Offline pandits; the mutation re-validates
 * atomically (conditional findOneAndUpdate) so a pandit who goes Offline
 * after appearing in search results cannot be assigned from a stale result.
 *
 * Uses Node's built-in test runner against a dedicated TEST database.
 * Never touches dev/prod data.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pandit-availability-gate-test-secret';

const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_pandit_availability_test';

const User    = require('../src/models/User');
const Pandit  = require('../src/models/Pandit');
const Pooja   = require('../src/models/Pooja');
const Booking = require('../src/models/Booking');

const eligibility = require('../src/services/panditEligibilityService');
const adminRoutes = require('../src/routes/admin.routes');
const NotificationEngine = require('../notification-engine').NotificationEngine;

let server, baseUrl, adminToken, adminUser, pooja;

// ── Notification spy ────────────────────────────────────────────────────────
let emitted = [];
let originalEmit;

before(() => {
  originalEmit = NotificationEngine.emit.bind(NotificationEngine);
  NotificationEngine.emit = (event, payload) => {
    emitted.push(event);
    return Promise.resolve();
  };
});
after(() => {
  NotificationEngine.emit = originalEmit;
});

function signToken(user) {
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
}

async function resetData() {
  await Promise.all([
    User.deleteMany({}),
    Pandit.deleteMany({}),
    Pooja.deleteMany({}),
    Booking.deleteMany({}),
  ]);
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await resetData();

  adminUser = await User.create({
    name: 'Admin', email: 'admin-avail@test.com', phone: '9100000001',
    password: 'hashed', role: 'admin',
  });
  adminToken = signToken(adminUser);

  pooja = await Pooja.create({
    name: 'Availability Pooja', slug: 'availability-pooja', price: 1000,
    createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  // Mirror the production global error handler (src/app.js).
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({
      success: false,
      ...(typeof err.code === 'string' ? { code: err.code } : {}),
      message: err.message || 'Internal Server Error',
    });
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await resetData();
  await mongoose.connection.close();
});

// ── Fixtures ────────────────────────────────────────────────────────────────
const USER = {
  name: 'Booker', phone: '9100000010', email: 'booker-avail@test.com',
  address: '1 Test Lane', pincode: '110001',
};

/** Creates a paid, unassigned booking. */
async function makeBooking(overrides = {}) {
  return Booking.create({
    bookingNumber: `KB${Date.now()}${Math.floor(Math.random() * 1000)}`,
    userId: adminUser._id,
    poojaId: pooja._id,
    userDetails: USER,
    scheduledDate: new Date(Date.now() + 86400000),
    scheduledTime: '10:00',
    amount: 1000,
    grandTotal: 1000,
    status: 'paid',
    paymentStatus: 'FULLY_PAID',
    amountPaid: 1000,
    ...overrides,
  });
}

let phoneSeq = 9110000000;
function nextPhone() {
  phoneSeq += 1;
  return String(phoneSeq);
}

/** Every weekday enabled so date-based schedule filtering never excludes a fixture. */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, enabled: true }));

/**
 * Creates a pandit. Defaults model a fully-eligible, ONLINE, in-coverage
 * pandit; individual fields can be overridden per scenario.
 */
async function makePandit(name, {
  status = 'approved',
  kycStatus = 'approved',
  canReceiveBookings = true,
  isOnline = true,
  isAvailableForBookings,
  city = 'Jaipur',
  serviceCoverage = { type: 'city', radiusKm: 25 },
  extra = {},
} = {}) {
  const phone = nextPhone();
  const user = await User.create({
    name, email: `${name.toLowerCase().replace(/\s+/g, '-')}-${phone}@test.com`,
    phone, password: 'hashed', role: 'pandit',
  });
  return Pandit.create({
    userId: user._id, name, phone, email: user.email,
    status, kycStatus, canReceiveBookings, isOnline, city, serviceCoverage,
    weeklySchedule: ALL_DAYS,
    ...(isAvailableForBookings !== undefined ? { isAvailableForBookings } : {}),
    ...extra,
  });
}

// ── HTTP helpers ────────────────────────────────────────────────────────────
function assign(bookingId, panditId, body = {}) {
  return fetch(`${baseUrl}/api/admin/bookings/${bookingId}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ panditId, ...body }),
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));
}

function availablePandits(query = {}) {
  const params = new URLSearchParams({
    date: new Date(Date.now() + 86400000).toISOString(),
    userCity: 'Jaipur',
    userState: 'Rajasthan',
    ...query,
  });
  return fetch(`${baseUrl}/api/admin/pandits/available?${params}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));
}

function searchPandits(q) {
  return fetch(`${baseUrl}/api/admin/pandits/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) }));
}

/** Snapshot of every field the assignment flow could mutate. */
async function snapshot(bookingId) {
  const b = await Booking.findById(bookingId).lean();
  return {
    panditId: b.panditId, status: b.status, panditAssignedAt: b.panditAssignedAt,
    auditLogLength: b.auditLog.length,
  };
}

function ids(data) {
  return (data.pandits || []).map((p) => String(p._id));
}

beforeEach(() => { emitted = []; });

// ═══════════════════════════════════════════════════════════════════════════
describe('panditEligibilityService — availability rule (unit)', () => {
  test('online + master switch on (or missing) is available', () => {
    assert.equal(eligibility.isPanditAvailableForAssignment({ isOnline: true }), true);
    assert.equal(eligibility.isPanditAvailableForAssignment({
      isOnline: true, isAvailableForBookings: true,
    }), true);
  });

  test('offline is unavailable', () => {
    assert.equal(eligibility.isPanditAvailableForAssignment({ isOnline: false }), false);
  });

  test('missing / unknown isOnline is unavailable (fail-closed, mirrors the dashboard badge)', () => {
    for (const isOnline of [undefined, null, 'true', 1, 0, 'yes']) {
      assert.equal(
        eligibility.isPanditAvailableForAssignment({ isOnline }),
        false,
        `expected isOnline=${String(isOnline)} to be unavailable`,
      );
    }
  });

  test('master booking switch explicitly OFF is unavailable even when Online', () => {
    assert.equal(eligibility.isPanditAvailableForAssignment({
      isOnline: true, isAvailableForBookings: false,
    }), false);
  });

  test('null pandit is unavailable', () => {
    assert.equal(eligibility.isPanditAvailableForAssignment(null), false);
  });

  test('assert throws PANDIT_NOT_AVAILABLE (400) for an offline pandit', () => {
    try {
      eligibility.assertPanditAvailableForAssignment({ isOnline: false });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.name, 'PanditEligibilityError');
      assert.equal(err.status, 400);
      assert.equal(err.code, 'PANDIT_NOT_AVAILABLE');
      assert.match(err.message, /offline/i);
    }
  });

  test('assert returns the pandit when available', () => {
    const p = { isOnline: true };
    assert.equal(eligibility.assertPanditAvailableForAssignment(p), p);
  });

  test('shared Mongo availability filter matches the rule', () => {
    const f = eligibility.PANDIT_BOOKING_AVAILABILITY_FILTER;
    assert.equal(f.isOnline, true);
    assert.deepEqual(f.isAvailableForBookings, { $ne: false });
  });

  test('KYC eligibility rule itself is unchanged by the availability work', () => {
    assert.equal(eligibility.isPanditEligibleForBooking({
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    }), true);
    assert.equal(eligibility.isPanditEligibleForBooking({
      status: 'approved', kycStatus: 'rejected', canReceiveBookings: false,
    }), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CANDIDATE DISCOVERY — recommended / in-coverage list', () => {
  test('1. Offline + KYC approved + in coverage → NOT offered as a candidate', async () => {
    const offline = await makePandit('AvailOfflineInCov', { isOnline: false });

    const { status, data } = await availablePandits();

    assert.equal(status, 200);
    assert.ok(!ids(data).includes(String(offline._id)),
      'offline pandit must not appear in the available/recommended list');
  });

  test('2. Online + KYC approved + in coverage → offered and within coverage', async () => {
    const online = await makePandit('AvailOnlineInCov', { isOnline: true });

    const { status, data } = await availablePandits();

    assert.equal(status, 200);
    assert.ok(ids(data).includes(String(online._id)),
      'online eligible pandit must remain a candidate (positive control)');
    const row = data.pandits.find((p) => String(p._id) === String(online._id));
    assert.equal(row.withinCoverage, true);
    assert.equal(row.isEligibleForBooking, true);
  });

  test('3. Offline + KYC approved + outside coverage → remains ineligible (absent)', async () => {
    const offlineOutOfTown = await makePandit('AvailOfflineOutOfCov', {
      isOnline: false, city: 'Delhi',
    });

    const { data } = await availablePandits();
    assert.ok(!ids(data).includes(String(offlineOutOfTown._id)),
      'offline out-of-coverage pandit must not appear');
  });

  test('"in coverage" does NOT override Offline — an online out-of-town control still appears', async () => {
    // Proves test 1's exclusion is the availability rule, not geography:
    // same out-of-coverage city as above, but Online → returned (annotated
    // out-of-coverage, per the existing UI design where coverage is an
    // annotation, not a hard filter).
    const onlineOutOfTown = await makePandit('AvailOnlineOutOfCov', {
      isOnline: true, city: 'Delhi',
    });

    const { data } = await availablePandits();
    assert.ok(ids(data).includes(String(onlineOutOfTown._id)));
    const row = data.pandits.find((p) => String(p._id) === String(onlineOutOfTown._id));
    assert.equal(row.withinCoverage, false);
  });

  test('4. Online + KYC not approved → remains ineligible (absent from candidates)', async () => {
    const kycRejected = await makePandit('AvailKycRejected', {
      isOnline: true, kycStatus: 'rejected', canReceiveBookings: false,
    });
    const neverApplied = await makePandit('AvailNeverApplied', {
      isOnline: true, kycStatus: 'not_submitted', canReceiveBookings: false,
    });

    const { data } = await availablePandits();
    assert.ok(!ids(data).includes(String(kycRejected._id)));
    assert.ok(!ids(data).includes(String(neverApplied._id)));
  });

  test('master switch OFF (Online but unavailable for bookings) is also excluded', async () => {
    const switchedOff = await makePandit('AvailSwitchedOff', {
      isOnline: true, isAvailableForBookings: false,
    });

    const { data } = await availablePandits();
    assert.ok(!ids(data).includes(String(switchedOff._id)));
  });

  test('6. mixed candidate list contains only candidates passing availability + existing rules', async () => {
    const okOnline      = await makePandit('MixOnlineOk',      { isOnline: true, extra: {
      selectedPoojas: [pooja._id],
    } });
    const offline       = await makePandit('MixOffline',       { isOnline: false, extra: {
      selectedPoojas: [pooja._id],
    } });
    const onLeave       = await makePandit('MixOnLeave',       { isOnline: true, extra: {
      selectedPoojas: [pooja._id],
      blockedPeriods: [{
        startDate: new Date(Date.now() + 3600000),
        endDate:   new Date(Date.now() + 86400000 * 2),
        title: 'Vacation',
      }],
    } });
    const wrongPooja    = await makePandit('MixWrongPooja',    { isOnline: true, extra: {
      selectedPoojas: [new mongoose.Types.ObjectId()],
    } });
    const kycBad        = await makePandit('MixKycBad',        { isOnline: true, kycStatus: 'rejected', canReceiveBookings: false, extra: {
      selectedPoojas: [pooja._id],
    } });

    const { data } = await availablePandits({ poojaId: String(pooja._id) });
    const shown = ids(data);

    assert.ok(shown.includes(String(okOnline._id)),  'fully-eligible online pandit must be offered');
    assert.ok(!shown.includes(String(offline._id)),  'offline pandit must be excluded');
    assert.ok(!shown.includes(String(onLeave._id)),  'pandit on leave stays excluded (existing rule intact)');
    assert.ok(!shown.includes(String(wrongPooja._id)), 'pandit without the pooja specialization stays excluded (existing rule intact)');
    assert.ok(!shown.includes(String(kycBad._id)),   'KYC-ineligible pandit stays excluded (existing rule intact)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CANDIDATE DISCOVERY — manual search', () => {
  test('5. Offline pandit is excluded from manual search; online twin is returned', async () => {
    const offline = await makePandit('SearchOfflineProbe', { isOnline: false });
    const online  = await makePandit('SearchOnlineProbe',  { isOnline: true });

    const { status, data } = await searchPandits('SearchOfflineProbe');
    assert.equal(status, 200);
    const found = ids(data);
    assert.ok(!found.includes(String(offline._id)),
      'offline pandit must not be searchable as an assignable candidate');
    // Positive control on the shared prefix proves the query matched and the
    // availability filter (not a non-matching query) excluded the offline one.
    const control = await searchPandits('SearchOnlineProbe');
    assert.ok(ids(control.data).includes(String(online._id)));
  });

  test('search never returns offline pandits for any matching query', async () => {
    await makePandit('CommonNameAlpha', { isOnline: false });
    await makePandit('CommonNameBeta',  { isOnline: true });
    await makePandit('CommonNameGamma', { isOnline: true, isAvailableForBookings: false });

    const { data } = await searchPandits('CommonName');
    const found = ids(data);
    assert.equal(found.length, 1, 'only the fully-available pandit may be returned');
    data.pandits.forEach((p) => {
      assert.equal(p.isOnline, true);
      assert.notEqual(p.isAvailableForBookings, false);
      assert.equal(p.isEligibleForBooking, true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('BACKEND ENFORCEMENT — direct assignment/reassignment API calls', () => {
  test('7+8+11+12. direct assignment to an Offline pandit is rejected: no mutation, no notification', async () => {
    const booking = await makeBooking();
    const offline = await makePandit('DirectOffline', { isOnline: false });
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, offline._id);

    assert.equal(status, 400);
    assert.equal(data.success, false);
    assert.equal(data.code, 'PANDIT_NOT_AVAILABLE');
    assert.match(data.message, /offline/i);

    // 11. booking completely unchanged
    assert.deepEqual(await snapshot(booking._id), before);
    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId, null);
    assert.equal(after.status, 'paid');
    assert.equal(after.auditLog.length, 0);

    // no pandit-side mutation
    assert.equal((await Pandit.findById(offline._id)).totalBookings, 0);

    // 12. no notification of any kind
    assert.deepEqual(emitted, []);
  });

  test('7. direct REASSIGNMENT (from pending_reassignment) to an Offline pandit is rejected; booking untouched', async () => {
    const booking  = await makeBooking();
    const first    = await makePandit('ReassignFirstOk',  { isOnline: true });
    const offline  = await makePandit('ReassignOffline',  { isOnline: false });

    // First assignment succeeds; pandit "rejects" → pending_reassignment.
    assert.equal((await assign(booking._id, first._id)).status, 200);
    await Booking.findByIdAndUpdate(booking._id, {
      status: 'pending_reassignment', panditId: null,
    });
    const before = await snapshot(booking._id);
    emitted = [];

    const { status, data } = await assign(booking._id, offline._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_NOT_AVAILABLE');
    assert.deepEqual(await snapshot(booking._id), before);
    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId, null);
    assert.equal(after.status, 'pending_reassignment');
    assert.equal((await Pandit.findById(offline._id)).totalBookings, 0);
    assert.deepEqual(emitted, []);
  });

  test('reassignment after a pandit CANCELLATION (pending_reassignment) to an Offline pandit is rejected', async () => {
    // Same entry point as the cancellation workflow produces: booking parked
    // in pending_reassignment with panditId released.
    const booking = await makeBooking({ status: 'pending_reassignment', panditId: null });
    const offline = await makePandit('CancelThenOffline', { isOnline: false });
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, offline._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_NOT_AVAILABLE');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('9. a client cannot bypass the gate by submitting Online/Available flags in the body', async () => {
    const booking = await makeBooking();
    const offline = await makePandit('BodyBypass', { isOnline: false });
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, offline._id, {
      isOnline: true,
      available: true,
      isAvailableForBookings: true,
      isEligibleForBooking: true,
      status: 'approved',
    });

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_NOT_AVAILABLE');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('10. STALE candidate: pandit goes Offline after discovery → the assignment is rejected', async () => {
    // The exact reported race: pandit appears in the candidate list while
    // Online, then toggles Offline before the admin confirms.
    const booking = await makeBooking();
    const pandit  = await makePandit('StaleCandidate', { isOnline: true });

    const discovery = await availablePandits();
    assert.ok(ids(discovery.data).includes(String(pandit._id)),
      'precondition: pandit was offered while Online');

    // Pandit toggles Offline on their dashboard — the admin's open modal is
    // now stale.
    await Pandit.findByIdAndUpdate(pandit._id, { isOnline: false });
    const before = await snapshot(booking._id);
    emitted = [];

    const { status, data } = await assign(booking._id, pandit._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_NOT_AVAILABLE');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.equal((await Pandit.findById(pandit._id)).totalBookings, 0);
    assert.deepEqual(emitted, []);
  });

  test('10b. stale master switch: pandit turns the bookings switch OFF after discovery → rejected', async () => {
    const booking = await makeBooking();
    const pandit  = await makePandit('StaleSwitch', { isOnline: true });

    const discovery = await availablePandits();
    assert.ok(ids(discovery.data).includes(String(pandit._id)));

    await Pandit.findByIdAndUpdate(pandit._id, { isAvailableForBookings: false });
    const before = await snapshot(booking._id);
    emitted = [];

    const { status, data } = await assign(booking._id, pandit._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_NOT_AVAILABLE');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('online + KYC-approved pandit is still assigned (positive control; notification + counter intact)', async () => {
    const booking = await makeBooking();
    const pandit  = await makePandit('StillAssignable', {
      isOnline: true, extra: { totalBookings: 4 },
    });

    const { status, data } = await assign(booking._id, pandit._id);

    assert.equal(status, 200);
    assert.equal(data.success, true);

    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId.toString(), pandit._id.toString());
    assert.equal(after.status, 'pandit_assigned');
    assert.equal(after.auditLog.length, 1);

    assert.equal((await Pandit.findById(pandit._id)).totalBookings, 5);
    assert.deepEqual(emitted, ['PANDIT_ASSIGNMENT_PENDING']);
  });

  test('reassignment to an ONLINE eligible pandit still works end-to-end', async () => {
    const booking = await makeBooking();
    const first   = await makePandit('ReassignOkFirst', { isOnline: true });
    const second  = await makePandit('ReassignOkSecond', { isOnline: true });

    assert.equal((await assign(booking._id, first._id)).status, 200);
    await Booking.findByIdAndUpdate(booking._id, { status: 'pending_reassignment', panditId: null });

    const { status } = await assign(booking._id, second._id);

    assert.equal(status, 200);
    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId.toString(), second._id.toString());
    assert.equal(after.status, 'pandit_assigned');
  });

  test('availability does NOT loosen the KYC gate: online + KYC-rejected is still rejected as KYC', async () => {
    const booking  = await makeBooking();
    const kycBad   = await makePandit('OnlineButKycBad', {
      isOnline: true, kycStatus: 'rejected', canReceiveBookings: false,
    });
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, kycBad._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('availability does NOT loosen booking-status rules: offline check still never mutates a cancelled booking', async () => {
    const booking = await makeBooking({ status: 'cancelled' });
    const offline = await makePandit('OfflineVsCancelled', { isOnline: false });
    const before  = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, offline._id);

    assert.equal(status, 400);
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });
});
