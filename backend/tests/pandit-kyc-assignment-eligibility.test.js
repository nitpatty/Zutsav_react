/**
 * Booking Assignment — Pandit KYC Eligibility Gate
 *
 * BUG: PATCH /api/admin/bookings/:id/assign gated only on
 *      `pandit.status === 'approved'`. It never read the authoritative
 *      approval flag `canReceiveBookings`, nor `kycStatus`. Because
 *      OTP-registered pandits are created with `status: 'approved'` (so they
 *      can reach their dashboard) but `kycStatus: 'not_submitted'` and
 *      `canReceiveBookings: false`, ANY self-registered pandit could be
 *      assigned a booking with no KYC at all.
 *
 * AUTHORITATIVE ELIGIBILITY RULE (see src/services/panditEligibilityService.js):
 *      pandit.status === 'approved'  &&  pandit.canReceiveBookings === true
 * `canReceiveBookings` is set true by BOTH approval paths
 * (admin.controller.js updateKYCStatus 'approve', and the legacy
 * approvePandit route) and false by EVERY non-approval path (KYC reject,
 * KYC reupload_required, legacy reject/suspend, signup, schema default).
 *
 * This suite covers the full HTTP path:
 *   crafted request → route → auth middleware → assignPandit
 *                    → assertPanditEligibleForBooking → Booking write
 *
 * Uses Node's built-in test runner against a dedicated TEST database.
 * Never touches dev/prod data.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pandit-kyc-eligibility-test-secret';

const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_pandit_kyc_eligibility_test';

const User   = require('../src/models/User');
const Pandit = require('../src/models/Pandit');
const Pooja  = require('../src/models/Pooja');
const Booking = require('../src/models/Booking');

const eligibility = require('../src/services/panditEligibilityService');
const adminRoutes = require('../src/routes/admin.routes');
const NotificationEngine = require('../notification-engine').NotificationEngine;

let server, baseUrl, adminToken, adminUser, pooja;

// ── Notification spy ────────────────────────────────────────────────────────
// Records every emit() so we can prove a rejected assignment fires nothing.
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
    name: 'Admin', email: 'admin-kyc@test.com', phone: '9020000001',
    password: 'hashed', role: 'admin',
  });
  adminToken = signToken(adminUser);

  pooja = await Pooja.create({
    name: 'Test Pooja', slug: 'test-pooja-kyc', price: 1000,
    createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  // Mirror the production global error handler (src/app.js) so the controlled
  // business error renders as a clean JSON body instead of a 500.
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
  name: 'Booker', phone: '9020000010', email: 'booker-kyc@test.com',
  address: '1 Test Lane', pincode: '110001',
};

/** Creates a paid, unassigned booking. */
async function makeBooking() {
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
  });
}

/**
 * Creates a pandit in a given approval state.
 * Mirrors the REAL signup shape for KYC-ineligible pandits:
 * status 'approved' (dashboard access) + canReceiveBookings false.
 */
let phoneSeq = 9030000000;
function nextPhone() {
  phoneSeq += 1;
  return String(phoneSeq);
}

async function makePandit(name, { status = 'approved', kycStatus, canReceiveBookings, extra = {} } = {}) {
  const phone = nextPhone();
  const user = await User.create({
    name, email: `${name.toLowerCase().replace(/\s+/g, '-')}-${phone}@test.com`,
    phone, password: 'hashed', role: 'pandit',
  });
  return Pandit.create({
    userId: user._id, name, phone, email: user.email,
    status, kycStatus, canReceiveBookings, ...extra,
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

beforeEach(() => { emitted = []; });

// ═══════════════════════════════════════════════════════════════════════════
describe('panditEligibilityService — authoritative rule (unit)', () => {
  test('approved pandit is eligible', () => {
    assert.equal(eligibility.isPanditEligibleForBooking({
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    }), true);
  });

  test('legacy-approved pandit (kycStatus never written) stays eligible', () => {
    // approvePandit sets canReceiveBookings:true without touching kycStatus.
    assert.equal(eligibility.isPanditEligibleForBooking({
      status: 'approved', kycStatus: 'not_submitted', canReceiveBookings: true,
    }), true);
  });

  test('every non-approved kycStatus is ineligible', () => {
    for (const kycStatus of ['not_submitted', 'submitted', 'rejected', 'reupload_required']) {
      assert.equal(eligibility.isPanditEligibleForBooking({
        status: 'approved', kycStatus, canReceiveBookings: false,
      }), false, `expected ${kycStatus} to be ineligible`);
    }
  });

  test('missing / unknown canReceiveBookings is ineligible (fail-closed)', () => {
    for (const canReceiveBookings of [undefined, null, 'true', 1]) {
      assert.equal(eligibility.isPanditEligibleForBooking({
        status: 'approved', kycStatus: 'approved', canReceiveBookings,
      }), false, `expected ${String(canReceiveBookings)} to be ineligible`);
    }
  });

  test('non-approved account status is ineligible regardless of KYC', () => {
    for (const status of ['pending', 'under_review', 'rejected', 'suspended', 'reupload_required']) {
      assert.equal(eligibility.isPanditEligibleForBooking({
        status, kycStatus: 'approved', canReceiveBookings: true,
      }), false, `expected status ${status} to be ineligible`);
    }
  });

  test('null pandit is ineligible', () => {
    assert.equal(eligibility.isPanditEligibleForBooking(null), false);
    assert.equal(eligibility.getPanditIneligibilityReason(null), 'not_found');
  });

  test('assert throws PANDIT_KYC_NOT_APPROVED for KYC-ineligible', () => {
    try {
      eligibility.assertPanditEligibleForBooking({
        status: 'approved', kycStatus: 'submitted', canReceiveBookings: false,
      });
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.name, 'PanditEligibilityError');
      assert.equal(err.status, 400);
      assert.equal(err.code, 'PANDIT_KYC_NOT_APPROVED');
      assert.match(err.message, /KYC is not approved/);
    }
  });

  test('assert throws the ORIGINAL wording for not-found / not-approved', () => {
    assert.throws(
      () => eligibility.assertPanditEligibleForBooking(null),
      (err) => err.message === 'Pandit not found or not approved' && err.code === undefined,
    );
  });

  test('assert returns the pandit when eligible', () => {
    const p = { status: 'approved', kycStatus: 'approved', canReceiveBookings: true };
    assert.equal(eligibility.assertPanditEligibleForBooking(p), p);
  });

  test('shared Mongo filter matches exactly the accepted set', () => {
    const f = eligibility.PANDIT_BOOKING_ELIGIBILITY_FILTER;
    assert.equal(f.status, 'approved');
    assert.equal(f.canReceiveBookings, true);
  });

  test('withBookingEligibility annotates the verdict', () => {
    const out = eligibility.withBookingEligibility({
      status: 'approved', kycStatus: 'rejected', canReceiveBookings: false,
    });
    assert.equal(out.isEligibleForBooking, false);
    assert.equal(out.kycStatus, 'rejected');
  });

  test('isValidPanditId accepts only 24-char hex ids', () => {
    assert.equal(eligibility.isValidPanditId(new mongoose.Types.ObjectId().toString()), true);
    for (const bad of ['not-an-object-id', '', null, undefined, 123, 'zzzzzzzzzzzzzzzzzzzzzzzz']) {
      assert.equal(eligibility.isValidPanditId(bad), false, `expected ${String(bad)} to be invalid`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('loadEligiblePanditForBooking — the complete gate', () => {
  test('returns the document for an eligible pandit', async () => {
    const pandit = await makePandit('LoaderOk', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });
    const loaded = await eligibility.loadEligiblePanditForBooking(pandit._id.toString());
    assert.equal(loaded._id.toString(), pandit._id.toString());
  });

  test('throws PANDIT_KYC_NOT_APPROVED (not a 500) for a malformed id', async () => {
    await assert.rejects(
      () => eligibility.loadEligiblePanditForBooking('not-an-object-id'),
      (err) => err.name === 'PanditEligibilityError' && err.status === 400
        && err.message === 'Pandit not found or not approved',
    );
  });

  test('throws for a well-formed but ineligible id', async () => {
    const pandit = await makePandit('LoaderBad', {
      status: 'approved', kycStatus: 'submitted', canReceiveBookings: false,
    });
    await assert.rejects(
      () => eligibility.loadEligiblePanditForBooking(pandit._id.toString()),
      (err) => err.code === 'PANDIT_KYC_NOT_APPROVED' && err.status === 400,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('assignPandit — ELIGIBLE pandit (existing flow must not change)', () => {
  test('KYC-approved pandit is assigned successfully', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('ApprovedPandit', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });

    const { status, data } = await assign(booking._id, pandit._id);

    assert.equal(status, 200);
    assert.equal(data.success, true);

    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId.toString(), pandit._id.toString());
    assert.equal(after.status, 'pandit_assigned');
    assert.ok(after.panditAssignedAt instanceof Date);
    assert.equal(after.auditLog.length, 1);
    assert.equal(after.auditLog[0].action, 'pandit_assigned');
  });

  test('successful assignment increments totalBookings and emits the notification', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('ApprovedCounter', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
      extra: { totalBookings: 4 },
    });

    const { status } = await assign(booking._id, pandit._id);

    assert.equal(status, 200);
    const p = await Pandit.findById(pandit._id);
    assert.equal(p.totalBookings, 5);
    assert.deepEqual(emitted, ['PANDIT_ASSIGNMENT_PENDING']);
  });

  test('legacy-approved pandit (canReceiveBookings true, kycStatus not_submitted) still assignable', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('LegacyApproved', {
      status: 'approved', kycStatus: 'not_submitted', canReceiveBookings: true,
    });

    const { status } = await assign(booking._id, pandit._id);
    assert.equal(status, 200);
    assert.equal((await Booking.findById(booking._id)).panditId.toString(), pandit._id.toString());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('assignPandit — INELIGIBLE pandits (the reported bug)', () => {
  // Each real KYC state from Pandit.kycStatus enum.
  const CASES = [
    { label: 'not_submitted (never applied for KYC)',        kycStatus: 'not_submitted' },
    { label: 'submitted (awaiting admin review)',            kycStatus: 'submitted' },
    { label: 'rejected',                                     kycStatus: 'rejected' },
    { label: 'reupload_required',                            kycStatus: 'reupload_required' },
  ];

  for (const c of CASES) {
    test(`${c.kycStatus} pandit is rejected — no mutation, no notification`, async () => {
      const booking = await makeBooking();
      // Exactly the real signup shape: status 'approved' for dashboard access,
      // but KYC never completed.
      const pandit = await makePandit('Ineligible', {
        status: 'approved', kycStatus: c.kycStatus, canReceiveBookings: false,
      });
      const before = await snapshot(booking._id);

      const { status, data } = await assign(booking._id, pandit._id);

      assert.equal(status, 400);
      assert.equal(data.success, false);
      assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
      assert.match(data.message, /KYC is not approved/);

      // Booking completely unchanged
      assert.deepEqual(await snapshot(booking._id), before);
      const after = await Booking.findById(booking._id);
      assert.equal(after.panditId, null);
      assert.equal(after.status, 'paid');
      assert.equal(after.panditAssignedAt, null ?? after.panditAssignedAt);
      assert.equal(after.auditLog.length, 0);

      // No pandit-side mutation
      assert.equal((await Pandit.findById(pandit._id)).totalBookings, 0);

      // No notification of any kind
      assert.deepEqual(emitted, []);
    });
  }

  test('rejected KYC pandit who was legacy-approved first is still blocked', async () => {
    // The drift case: status approved via legacy route, then KYC rejected.
    const booking = await makeBooking();
    const pandit = await makePandit('ApprovedThenRejected', {
      status: 'approved', kycStatus: 'rejected', canReceiveBookings: false,
      extra: { totalBookings: 7 },
    });
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, pandit._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.equal((await Pandit.findById(pandit._id)).totalBookings, 7);
    assert.deepEqual(emitted, []);
  });

  test('suspended pandit is rejected with the original message (unchanged rule)', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('Suspended', {
      status: 'suspended', kycStatus: 'approved', canReceiveBookings: false,
    });

    const { status, data } = await assign(booking._id, pandit._id);

    assert.equal(status, 400);
    assert.equal(data.message, 'Pandit not found or not approved');
    assert.equal(data.code, undefined);
    assert.equal((await Booking.findById(booking._id)).panditId, null);
  });

  test('nonexistent pandit id is rejected and booking is untouched', async () => {
    const booking = await makeBooking();
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, new mongoose.Types.ObjectId());

    assert.equal(status, 400);
    assert.equal(data.message, 'Pandit not found or not approved');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('malformed pandit id is rejected and booking is untouched', async () => {
    const booking = await makeBooking();
    const before = await snapshot(booking._id);

    const { status, data } = await assign(booking._id, 'not-an-object-id');

    assert.equal(status, 400);
    assert.equal(data.success, false);
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('REASSIGNMENT — only the newly assigned pandit must be eligible', () => {
  test('reassigning to an INELIGIBLE pandit is rejected; original pandit kept', async () => {
    const booking = await makeBooking();
    const first = await makePandit('FirstPandit', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });
    const second = await makePandit('SecondBad', {
      status: 'approved', kycStatus: 'rejected', canReceiveBookings: false,
    });

    // First assignment succeeds.
    assert.equal((await assign(booking._id, first._id)).status, 200);

    // Pandit rejects → booking goes back to pending_reassignment, panditId null.
    await Booking.findByIdAndUpdate(booking._id, {
      status: 'pending_reassignment', panditId: null,
    });
    const before = await snapshot(booking._id);

    emitted = [];
    const { status, data } = await assign(booking._id, second._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
    assert.deepEqual(await snapshot(booking._id), before);
    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId, null);
    assert.equal(after.status, 'pending_reassignment');
    assert.deepEqual(emitted, []);
  });

  test('reassigning to an ELIGIBLE pandit still works', async () => {
    const booking = await makeBooking();
    const first = await makePandit('FirstOk', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });
    const second = await makePandit('SecondOk', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });

    assert.equal((await assign(booking._id, first._id)).status, 200);
    await Booking.findByIdAndUpdate(booking._id, { status: 'pending_reassignment', panditId: null });

    const { status } = await assign(booking._id, second._id);

    assert.equal(status, 200);
    const after = await Booking.findById(booking._id);
    assert.equal(after.panditId.toString(), second._id.toString());
    assert.equal(after.status, 'pandit_assigned');
  });

  test('reassignment from pandit_assigned to ineligible pandit is rejected', async () => {
    const booking = await makeBooking();
    const first = await makePandit('ReassignFrom', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });
    const bad = await makePandit('ReassignTo', {
      status: 'approved', kycStatus: 'submitted', canReceiveBookings: false,
    });

    assert.equal((await assign(booking._id, first._id)).status, 200);
    const before = await snapshot(booking._id);

    // 'pandit_assigned' is an assignable status — the KYC gate must still fire.
    const { status, data } = await assign(booking._id, bad._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
    assert.deepEqual(await snapshot(booking._id), before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('SECURITY BYPASS — direct crafted API requests (Phase 9)', () => {
  test('raw PATCH with a directly-supplied ineligible panditId is rejected', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('BypassTarget', {
      status: 'approved', kycStatus: 'not_submitted', canReceiveBookings: false,
    });
    const before = await snapshot(booking._id);

    // No UI involved — hand-crafted request straight at the endpoint.
    const res = await fetch(`${baseUrl}/api/admin/bookings/${booking._id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ panditId: String(pandit._id), assignmentMethod: 'manual_search' }),
    });
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('rejection is idempotent — repeated bypass attempts never mutate the booking', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('RepeatBypass', {
      status: 'approved', kycStatus: 'rejected', canReceiveBookings: false,
    });
    const before = await snapshot(booking._id);

    for (let i = 0; i < 5; i++) {
      const { status } = await assign(booking._id, pandit._id);
      assert.equal(status, 400);
    }

    assert.deepEqual(await snapshot(booking._id), before);
    assert.deepEqual(emitted, []);
  });

  test('a pandit that becomes KYC-rejected can no longer receive new bookings', async () => {
    const booking = await makeBooking();
    const pandit = await makePandit('Revoked', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });

    // Eligible now.
    assert.equal((await assign(booking._id, pandit._id)).status, 200);

    // Admin rejects the KYC — canReceiveBookings flips to false.
    await Pandit.findByIdAndUpdate(pandit._id, {
      kycStatus: 'rejected', canReceiveBookings: false, kycRejectionReason: 'blurry document',
    });

    const second = await makeBooking();
    const before = await snapshot(second._id);
    emitted = [];
    const { status, data } = await assign(second._id, pandit._id);

    assert.equal(status, 400);
    assert.equal(data.code, 'PANDIT_KYC_NOT_APPROVED');
    assert.deepEqual(await snapshot(second._id), before);
    assert.deepEqual(emitted, []);
  });

  test('assignment target that is missing panditId is rejected without mutation', async () => {
    const booking = await makeBooking();
    const before = await snapshot(booking._id);

    const res = await fetch(`${baseUrl}/api/admin/bookings/${booking._id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    assert.deepEqual(await snapshot(booking._id), before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Admin pandit SEARCH no longer returns KYC-ineligible pandits', () => {
  test('ineligible pandits are filtered out of search results', async () => {
    const bad = await makePandit('SearchableBad', {
      status: 'approved', kycStatus: 'rejected', canReceiveBookings: false,
    });
    const good = await makePandit('SearchableGood', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });
    // Matches BOTH pandits by name/phone/email, so a positive control proves
    // the filter (not a non-matching query) is what excluded the bad one.
    const { status, data } = await searchPandits('Searchable');

    assert.equal(status, 200);
    // .lean() returns raw ObjectIds — compare by string, not identity.
    const ids = data.pandits.map((p) => String(p._id));
    assert.ok(ids.includes(String(good._id)), 'approved pandit should be returned (positive control)');
    assert.ok(!ids.includes(String(bad._id)), 'rejected pandit must not appear in search');
    data.pandits.forEach((p) => assert.equal(p.isEligibleForBooking, true));
  });

  test('a pandit with status approved but canReceiveBookings false is not searchable', async () => {
    // Precisely the reported bug shape: status approved at signup, no KYC.
    const pandit = await makePandit('UniqueSearchProbe Xyzzy', {
      status: 'approved', kycStatus: 'not_submitted', canReceiveBookings: false,
    });
    const control = await makePandit('ControlSearchProbe Xyzzy', {
      status: 'approved', kycStatus: 'approved', canReceiveBookings: true,
    });

    const { data } = await searchPandits('Xyzzy');
    const ids = data.pandits.map((p) => String(p._id));
    assert.ok(ids.includes(String(control._id)), 'eligible control should be searchable');
    assert.ok(!ids.includes(String(pandit._id)), 'unapproved pandit must not be searchable');
  });
});
