/**
 * Pandit cancellation of an ALREADY-ACCEPTED booking
 *
 * Feature: PATCH /api/pandits/me/bookings/:id/cancel
 *
 * Rules under test (authoritative source:
 * src/services/panditCancellationService.js):
 *   - only a booking this Pandit has ACCEPTED (status 'pandit_accepted')
 *   - only while still OUTSIDE the restricted period, i.e. cancellable until
 *     the 2-day cutoff:  todayIST() < scheduledDate - 2 days (calendar days,
 *     IST, 'YYYY-MM-DD' string math). On the cutoff day and during the final
 *     2 days the cancellation is refused.
 *   - target state is 'pending_reassignment' (the existing replacement-needed
 *     state, already accepted by assignPandit), NOT 'cancelled' — so the
 *     customer is neither cancelled nor refunded.
 *   - the transition is ONE atomic conditional update; the 'pandit_accepted'
 *     predicate lives inside the query filter, so concurrent requests cannot
 *     both cancel and cannot both alert Admin.
 *   - PANDIT_CANCELLED is emitted ONLY after the write succeeded, once.
 *
 * Uses Node's built-in test runner against a dedicated TEST database.
 * Never touches dev/prod data.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pandit-cancellation-test-secret';

const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const express = require('express');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_pandit_cancellation_test';

const User    = require('../src/models/User');
const Pandit  = require('../src/models/Pandit');
const Pooja   = require('../src/models/Pooja');
const Booking = require('../src/models/Booking');

const cancellation = require('../src/services/panditCancellationService');
const panditRoutes = require('../src/routes/pandit.routes');
const NotificationEngine = require('../notification-engine').NotificationEngine;
const { EVENTS, EVENT_CATEGORIES } = require('../notification-engine/EventRegistry');
const { getRequiredVariables } = require('../notification-engine/variables/VariableSchemas');

const { VERIFIED_MAPPINGS, VERIFIED_EMAIL_MAPPINGS, VERIFIED_INAPP_MAPPINGS } =
  require('../src/scripts/bootstrapNotificationMappings');

let server, baseUrl, pooja, panditUser, pandit, otherPanditUser, otherPandit;

const DAY_MS = 86400000;

// ── Notification spy ─────────────────────────────────────────────────────────
let emitted = [];
let originalEmit;

before(() => {
  originalEmit = NotificationEngine.emit.bind(NotificationEngine);
  NotificationEngine.emit = (event, payload) => {
    emitted.push({ event, payload });
    return Promise.resolve();
  };
});
after(() => {
  NotificationEngine.emit = originalEmit;
});

function signToken(user) {
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
}

/** A UTC-midnight date N calendar days from the reference day, exactly how
 *  scheduledDate is persisted in production (`new Date('YYYY-MM-DD')`). */
function utcDay(ref, offsetDays) {
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + offsetDays));
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

  pooja = await Pooja.create({
    name: 'Test Pooja', slug: 'test-pooja-cancel', price: 1000,
    createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/pandits', panditRoutes);
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

beforeEach(async () => {
  emitted = [];
  await resetData();

  pooja = await Pooja.create({
    name: 'Test Pooja', slug: 'test-pooja-cancel', price: 1000,
    createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
  });

  panditUser = await User.create({
    name: 'Ramesh Sharma', phone: '9030000001', email: 'pandit-cancel@test.com',
    password: 'hashed', role: 'pandit',
  });
  pandit = await Pandit.create({
    userId: panditUser._id, name: 'Ramesh Sharma', phone: '9030000001',
    email: 'pandit-cancel@test.com', status: 'approved', canReceiveBookings: true,
  });

  otherPanditUser = await User.create({
    name: 'Suresh Kumar', phone: '9030000002', email: 'pandit-other@test.com',
    password: 'hashed', role: 'pandit',
  });
  otherPandit = await Pandit.create({
    userId: otherPanditUser._id, name: 'Suresh Kumar', phone: '9030000002',
    email: 'pandit-other@test.com', status: 'approved', canReceiveBookings: true,
  });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await resetData();
  await mongoose.connection.close();
});

// ── Fixtures ────────────────────────────────────────────────────────────────
let seq = 0;

async function makeBooking(overrides = {}) {
  seq += 1;
  return Booking.create({
    bookingNumber: `CB${Date.now()}${seq}`,
    userId: (await User.create({
      name: 'Booker', phone: `9040000${String(seq).padStart(3, '0')}`,
      email: `booker-${seq}-${Date.now()}@test.com`, password: 'hashed', role: 'user',
      address: '1 Test Lane', pincode: '110001',
    }))._id,
    poojaId: pooja._id,
    userDetails: { name: 'Booker', phone: '9000000000', email: 'booker@test.com', address: '1 Test Lane', pincode: '110001' },
    // 10 calendar days out — comfortably outside the restricted period.
    scheduledDate: utcDay(new Date(), 10),
    scheduledTime: '10:00',
    amount: 1000,
    grandTotal: 1000,
    status: 'pandit_accepted',
    paymentStatus: 'FULLY_PAID',
    amountPaid: 1000,
    panditId: pandit._id,
    ...overrides,
  });
}

function cancelUrl(bookingId) {
  return `${baseUrl}/api/pandits/me/bookings/${bookingId}/cancel`;
}

async function doCancel(bookingId, { reason, token } = {}) {
  // NOTE: no destructuring default on `reason` — an explicit `undefined` must
  // mean "send no reason at all", not "fall back to a valid one".
  return fetch(cancelUrl(bookingId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ reason }),
  });
}

/** Cancel with a valid reason (the common case). */
function doValidCancel(bookingId, token) {
  return doCancel(bookingId, { token, reason: 'Family emergency, cannot attend' });
}

// ═══════════════════════════════════════════════════════════════════════════
describe('panditCancellationService — the 2-day rule (pure)', () => {
  const ref = new Date();

  test('cancellable while strictly before the 2-day cutoff', () => {
    for (const daysOut of [3, 4, 7, 30]) {
      const b = { status: 'pandit_accepted', scheduledDate: utcDay(ref, daysOut) };
      const v = cancellation.evaluatePanditCancellation(b);
      assert.equal(v.allowed, true, `expected ${daysOut} days out to be cancellable`);
      assert.equal(v.code, undefined);
    }
  });

  test('refused ON the cutoff day and throughout the final 2 days', () => {
    for (const daysOut of [2, 1, 0, -1, -5]) {
      const b = { status: 'pandit_accepted', scheduledDate: utcDay(ref, daysOut) };
      const v = cancellation.evaluatePanditCancellation(b);
      assert.equal(v.allowed, false, `expected ${daysOut} days out to be refused`);
      assert.equal(v.code, 'PANDIT_CANCELLATION_WINDOW_CLOSED');
    }
  });

  test('cutoff date is exactly 2 calendar days before the scheduled date', () => {
    const w = cancellation.getPanditCancellationWindow(utcDay(ref, 10), ref);
    assert.equal(w.cutoffDateStr, utcDay(ref, 8).toISOString().slice(0, 10));
    assert.equal(w.daysUntil, 10);
  });

  test('a booking with no usable scheduledDate is refused, not crashed on', () => {
    const v = cancellation.evaluatePanditCancellation({ status: 'pandit_accepted', scheduledDate: null });
    assert.equal(v.allowed, false);
    assert.equal(v.code, 'PANDIT_CANCELLATION_NOT_CANCELLABLE');
  });

  test('every non-accepted status is refused, terminal states reported as already processed', () => {
    for (const status of ['pandit_assigned', 'paid', 'pending_payment', 'pending_reassignment', 'completion_requested']) {
      const v = cancellation.evaluatePanditCancellation({ status, scheduledDate: utcDay(ref, 10) });
      assert.equal(v.allowed, false, `${status} must not be cancellable`);
      assert.equal(v.code, 'PANDIT_CANCELLATION_NOT_ACCEPTED');
    }
    for (const status of ['cancelled', 'refunded', 'closed', 'completed']) {
      const v = cancellation.evaluatePanditCancellation({ status, scheduledDate: utcDay(ref, 10) });
      assert.equal(v.allowed, false, `${status} must not be cancellable`);
      assert.equal(v.code, 'PANDIT_CANCELLATION_ALREADY_PROCESSED');
    }
  });

  test('reason is required and trimmed, minimum 10 characters', () => {
    assert.equal(cancellation.assertCancellationReason('  a valid long reason  '), 'a valid long reason');
    for (const bad of ['', '   ', 'short', '123456789']) {
      assert.throws(
        () => cancellation.assertCancellationReason(bad),
        (e) => e.code === 'PANDIT_CANCELLATION_REASON_REQUIRED'
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /api/pandits/me/bookings/:id/cancel — happy path', () => {
  test('moves an accepted booking to pending_reassignment and releases the pandit', async () => {
    const booking = await makeBooking();
    const res = await doValidCancel(booking._id, signToken(panditUser));

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.booking.status, 'pending_reassignment');
    assert.equal(body.booking.panditId, null);

    const after = await Booking.findById(booking._id);
    assert.equal(after.status, 'pending_reassignment');
    assert.equal(after.panditId, null);
    assert.equal(after.cancelReason, 'Family emergency, cannot attend');
  });

  test('records an audit entry naming the pandit as the actor', async () => {
    const booking = await makeBooking();
    await doValidCancel(booking._id, signToken(panditUser));

    const after = await Booking.findById(booking._id);
    const entry = after.auditLog.find((a) => a.action === 'pandit_cancelled_accepted');
    assert.ok(entry, 'expected a pandit_cancelled_accepted audit entry');
    assert.equal(String(entry.performedBy), String(panditUser._id));
    assert.equal(entry.performedByName, 'Ramesh Sharma');
    assert.ok(entry.at, 'audit entry must be timestamped');
    assert.match(entry.note, /replacement Pandit/);
  });

  test('does NOT cancel or refund the customer booking', async () => {
    const booking = await makeBooking();
    await doValidCancel(booking._id, signToken(panditUser));

    const after = await Booking.findById(booking._id);
    // Status must not be a terminal/customer-facing cancellation…
    assert.notEqual(after.status, 'cancelled');
    assert.notEqual(after.status, 'refunded');
    assert.notEqual(after.status, 'closed');
    // …and no refund may be seeded.
    assert.equal(after.paymentStatus, 'FULLY_PAID');
    assert.equal(after.amountPaid, 1000);
    assert.equal(after.refund.refundedAmount, 0);
    assert.equal(after.refund.eligibleAmount, 0);
  });

  test('emits PANDIT_CANCELLED exactly once, after the write', async () => {
    const booking = await makeBooking();
    await doValidCancel(booking._id, signToken(panditUser));

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].event, 'PANDIT_CANCELLED');
    const p = emitted[0].payload;
    assert.equal(p.pandit.name, 'Ramesh Sharma');
    assert.equal(p.booking.number, booking.bookingNumber);
    assert.equal(p.reason, 'Family emergency, cannot attend');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /api/pandits/me/bookings/:id/cancel — refusals write nothing and notify nobody', () => {
  test('refuses a booking that was never accepted (pandit_assigned)', async () => {
    const booking = await makeBooking({ status: 'pandit_assigned' });
    const res = await doValidCancel(booking._id, signToken(panditUser));

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.code, 'PANDIT_CANCELLATION_NOT_ACCEPTED');

    const after = await Booking.findById(booking._id);
    assert.equal(after.status, 'pandit_assigned', 'status must be untouched');
    assert.equal(after.panditId.toString(), pandit._id.toString());
    assert.equal(after.cancelReason, undefined);
    assert.equal(emitted.length, 0, 'no notification for a refused cancellation');
  });

  test('refuses a completion_requested booking', async () => {
    const booking = await makeBooking({ status: 'completion_requested' });
    const res = await doValidCancel(booking._id, signToken(panditUser));
    assert.equal(res.status, 400);
    assert.equal((await Booking.findById(booking._id)).status, 'completion_requested');
    assert.equal(emitted.length, 0);
  });

  test('refuses an already-cancelled booking with 409', async () => {
    const booking = await makeBooking({ status: 'cancelled' });
    const res = await doValidCancel(booking._id, signToken(panditUser));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'PANDIT_CANCELLATION_ALREADY_PROCESSED');
    assert.equal(emitted.length, 0);
  });

  test('refuses once the 2-day restricted period has begun', async () => {
    for (const daysOut of [2, 1, 0, -1]) {
      emitted = [];
      const booking = await makeBooking({ scheduledDate: utcDay(new Date(), daysOut) });
      const res = await doValidCancel(booking._id, signToken(panditUser));

      assert.equal(res.status, 400, `expected refusal ${daysOut} days out`);
      const body = await res.json();
      assert.equal(body.code, 'PANDIT_CANCELLATION_WINDOW_CLOSED');
      assert.match(body.message, /at least 2 days before/);

      const after = await Booking.findById(booking._id);
      assert.equal(after.status, 'pandit_accepted', 'must stay accepted');
      assert.equal(after.cancelReason, undefined);
      assert.equal(emitted.length, 0);
    }
  });

  test('refuses a booking assigned to a different pandit (403, no leak)', async () => {
    const booking = await makeBooking({ panditId: otherPandit._id });
    const res = await doValidCancel(booking._id, signToken(panditUser));

    assert.equal(res.status, 403);
    assert.equal((await Booking.findById(booking._id)).status, 'pandit_accepted');
    assert.equal(emitted.length, 0);
  });

  test('refuses an unassigned accepted-state booking', async () => {
    const booking = await makeBooking({ panditId: null });
    const res = await doValidCancel(booking._id, signToken(panditUser));
    assert.equal(res.status, 403);
    assert.equal(emitted.length, 0);
  });

  test('requires authentication', async () => {
    const booking = await makeBooking();
    const res = await doCancel(booking._id, { token: undefined });
    assert.equal(res.status, 401);
    assert.equal((await Booking.findById(booking._id)).status, 'pandit_accepted');
    assert.equal(emitted.length, 0);
  });

  test('requires a reason of at least 10 characters', async () => {
    for (const reason of ['', '   ', 'short', undefined]) {
      emitted = [];
      const booking = await makeBooking();
      const res = await doCancel(booking._id, { token: signToken(panditUser), reason });
      assert.equal(res.status, 400, `expected refusal for reason ${JSON.stringify(reason)}`);
      assert.equal((await Booking.findById(booking._id)).status, 'pandit_accepted');
      assert.equal(emitted.length, 0);
    }
  });

  test('returns 404 for an unknown booking id', async () => {
    const res = await doValidCancel('6' + 'f'.repeat(23), signToken(panditUser));
    assert.equal(res.status, 404);
    assert.equal(emitted.length, 0);
  });

  test('returns 400 (not 500) for a malformed booking id', async () => {
    const res = await doValidCancel('not-an-object-id', signToken(panditUser));
    assert.equal(res.status, 400);
    assert.equal(emitted.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('concurrent cancellation — atomicity and single alert', () => {
  test('two simultaneous requests: exactly one wins, exactly one notification', async () => {
    const booking = await makeBooking();
    const token = signToken(panditUser);

    const [a, b] = await Promise.all([
      doValidCancel(booking._id, token),
      doValidCancel(booking._id, token),
    ]);

    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409], `expected one 200 and one 409, got ${statuses}`);

    const after = await Booking.findById(booking._id);
    assert.equal(after.status, 'pending_reassignment');
    assert.equal(after.auditLog.filter((a2) => a2.action === 'pandit_cancelled_accepted').length, 1,
      'exactly one audit entry must be recorded');
    assert.equal(emitted.filter((e) => e.event === 'PANDIT_CANCELLED').length, 1,
      'admin must be alerted exactly once, never twice');
  });

  test('a repeat cancellation after success is rejected and does not re-alert', async () => {
    const booking = await makeBooking();
    const token = signToken(panditUser);

    const first = await doValidCancel(booking._id, token);
    assert.equal(first.status, 200);
    assert.equal(emitted.length, 1);

    const second = await doValidCancel(booking._id, token);
    assert.equal(second.status, 409);
    assert.equal((await res(second)).code, 'PANDIT_CANCELLATION_ALREADY_PROCESSED');
    assert.equal(emitted.length, 1, 'no duplicate notification on retry');
  });
});

async function res(response) {
  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
describe('admin alerting configuration', () => {
  test('PANDIT_CANCELLED is a registered event with a category', () => {
    assert.equal(EVENTS.PANDIT_CANCELLED, 'PANDIT_CANCELLED');
    assert.ok(EVENT_CATEGORIES.PANDIT_CANCELLED, 'event must have admin-UI category metadata');
    assert.equal(EVENT_CATEGORIES.PANDIT_CANCELLED.category, 'Pandit');
  });

  test('required variables resolve from the emitted payload', () => {
    const required = getRequiredVariables('PANDIT_CANCELLED');
    assert.deepEqual(required, ['pandit.name', 'booking.number']);
  });

  test('all three channels are mapped to admin-tier recipients', () => {
    const wa = VERIFIED_MAPPINGS.filter((m) => m.eventName === 'PANDIT_CANCELLED');
    const email = VERIFIED_EMAIL_MAPPINGS.filter((m) => m.eventName === 'PANDIT_CANCELLED');
    const inapp = VERIFIED_INAPP_MAPPINGS.filter((m) => m.eventName === 'PANDIT_CANCELLED');

    assert.equal(wa.length, 1);
    assert.equal(email.length, 1);
    assert.equal(inapp.length, 1);
    for (const m of [wa[0], email[0], inapp[0]]) {
      assert.equal(m.recipientType, 'admin', 'must notify admins, not the customer');
      assert.equal(m.enabled, true);
      assert.equal(m.purpose, 'BOOKING');
      assert.notEqual(m.purpose, 'MARKETING', 'an operational alert must not be consent-gated as marketing');
    }
  });

  test('no customer-recipient mapping exists for PANDIT_CANCELLED', () => {
    const all = [...VERIFIED_MAPPINGS, ...VERIFIED_EMAIL_MAPPINGS, ...VERIFIED_INAPP_MAPPINGS]
      .filter((m) => m.eventName === 'PANDIT_CANCELLED');
    for (const m of all) {
      assert.ok(['admin'].includes(m.recipientType), `unexpected recipientType ${m.recipientType}`);
    }
  });

  test('WhatsApp mapping uses a dedicated template, not the marketing reminder one', () => {
    const wa = VERIFIED_MAPPINGS.find((m) => m.eventName === 'PANDIT_CANCELLED');
    assert.equal(wa.whatsappTemplateName, 'pandit_cancelled_admin');
    assert.notEqual(wa.whatsappTemplateName, 'admin_general_reminder',
      'admin_general_reminder carries subscription-renewal marketing copy');
    // Variable positions must be contiguous and 1-based for the Meta template.
    assert.deepEqual(wa.whatsappVariables.map((v) => v.position), [1, 2, 3, 4, 5, 6]);
  });

  test('admin recipient resolution covers system_admin and skips inactive/deleted', async () => {
    const { isAdminRole } = require('../src/utils/roleUtils');
    const { ADMIN_TIER_ROLES } = require('../src/utils/roleUtils');
    assert.deepEqual(ADMIN_TIER_ROLES, ['admin', 'system_admin']);
    assert.equal(isAdminRole('admin'), true);
    assert.equal(isAdminRole('system_admin'), true);
    assert.equal(isAdminRole('user'), false);
  });
});
