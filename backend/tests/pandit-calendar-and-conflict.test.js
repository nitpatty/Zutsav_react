/**
 * Pandit Schedule Calendar + Booking-time Conflict Integrity
 *
 * Covers the shared logic behind three coordinated behaviours:
 *   1. GET /api/pandits/me/schedule-calendar  (per-day availability + bookings)
 *   2. The accept/assign time-overlap gate     (findConflictingBooking)
 *   3. The realtime `pandit_schedule_changed` signal
 *
 * The tests exercise src/services/panditScheduleService.js directly, which is
 * the SAME module the controllers call, so a green suite here means the HTTP
 * layer is deriving its calendar and its conflicts from verified primitives.
 *
 * Uses Node's built-in test runner against a dedicated TEST database.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'pandit-schedule-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI =
  process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_pandit_schedule_test';

const User = require('../src/models/User');
const Pandit = require('../src/models/Pandit');
const Pooja = require('../src/models/Pooja');
const Booking = require('../src/models/Booking');
const notificationService = require('../src/utils/notificationService');
const svc = require('../src/services/panditScheduleService');

let user, pooja, poojaNoDuration;

before(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(TEST_URI);
  await Promise.all([
    User.deleteMany({}),
    Pandit.deleteMany({}),
    Pooja.deleteMany({}),
    Booking.deleteMany({}),
  ]);

  user = await User.create({
    name: 'Booker', email: 'booker-schedule@test.com', phone: '9200000001',
    password: 'hashed', role: 'user',
  });
  pooja = await Pooja.create({
    name: 'Duration Pooja', slug: 'duration-pooja', price: 1000,
    durationValue: 2, durationUnit: 'hours',
    createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
  });
  poojaNoDuration = await Pooja.create({
    name: 'No Duration Pooja', slug: 'no-duration-pooja', price: 500,
    createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
  });
});

after(async () => {
  await Promise.all([
    User.deleteMany({}),
    Pandit.deleteMany({}),
    Pooja.deleteMany({}),
    Booking.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

function makeBooking(overrides = {}) {
  return Booking.create({
    bookingNumber: `T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: user._id,
    poojaId: pooja._id,
    userDetails: {
      name: 'Booker', phone: '9200000001', address: 'Somewhere', pincode: '560001',
    },
    scheduledDate: new Date('2026-08-15'),
    scheduledTime: '10:00',
    amount: 1000,
    ...overrides,
  });
}

// Pandit requires a unique email + phone and a 1:1 unique userId link, so each
// pandit gets its own User account.
let panditSeq = 0;
async function makePandit(name, overrides = {}) {
  panditSeq += 1;
  const userId = `user-${panditSeq}@schedule.test`;
  const panditEmail = `pandit-${panditSeq}@schedule.test`;
  const account = await User.create({
    name, email: userId, phone: `93${String(panditSeq).padStart(8, '0')}`,
    password: 'hashed', role: 'pandit',
  });
  const pandit = await Pandit.create({
    name, email: panditEmail, phone: `94${String(panditSeq).padStart(8, '0')}`,
    userId: account._id,
    status: 'approved', canReceiveBookings: true, isOnline: true,
    ...overrides,
  });
  return { pandit, account };
}

// ── Time parsing ────────────────────────────────────────────────────────────
describe('parseTimeToMinutes', () => {
  test('parses 24-hour HH:mm', () => {
    assert.equal(svc.parseTimeToMinutes('10:00'), 600);
    assert.equal(svc.parseTimeToMinutes('00:00'), 0);
    assert.equal(svc.parseTimeToMinutes('23:59'), 1439);
  });

  test('parses HH:mm:ss and 12-hour forms', () => {
    assert.equal(svc.parseTimeToMinutes('10:30:00'), 630);
    assert.equal(svc.parseTimeToMinutes('10:00 AM'), 600);
    assert.equal(svc.parseTimeToMinutes('12:00 AM'), 0);
    assert.equal(svc.parseTimeToMinutes('12:00 PM'), 720);
    assert.equal(svc.parseTimeToMinutes('1:15 PM'), 795);
  });

  test('returns null for unparseable values instead of assuming free', () => {
    for (const bad of ['', null, undefined, 'morning', '25:00', '10:61', '13:00 PM']) {
      assert.equal(svc.parseTimeToMinutes(bad), null);
    }
  });
});

// ── Duration derivation ─────────────────────────────────────────────────────
describe('durationMinutesFromPooja', () => {
  test('hours and days', () => {
    assert.equal(svc.durationMinutesFromPooja({ durationValue: 2, durationUnit: 'hours' }), 120);
    assert.equal(svc.durationMinutesFromPooja({ durationValue: 1, durationUnit: 'days' }), 1440);
  });
  test('unknown duration yields null (occupancy falls back to 1 min)', () => {
    assert.equal(svc.durationMinutesFromPooja(null), null);
    assert.equal(svc.durationMinutesFromPooja({ name: 'x' }), null);
    assert.equal(svc.occupiedMinutes(null), svc.MIN_OCCUPIED_MINUTES);
  });
});

// ── Availability derivation ─────────────────────────────────────────────────
describe('dayAvailability', () => {
  const base = { weeklySchedule: [], specialDates: [], blockedPeriods: [], availabilitySlots: [] };

  test('leave covers an inclusive date range', () => {
    const pandit = { ...base, blockedPeriods: [{ startDate: new Date('2026-08-10'), endDate: new Date('2026-08-12') }] };
    assert.equal(svc.dayAvailability(pandit, '2026-08-10'), 'leave');
    assert.equal(svc.dayAvailability(pandit, '2026-08-12'), 'leave');
    assert.equal(svc.dayAvailability(pandit, '2026-08-13'), 'none');
  });

  test('special dates: unavailable vs custom', () => {
    const pandit = {
      ...base,
      specialDates: [
        { date: new Date('2026-08-20'), type: 'unavailable' },
        { date: new Date('2026-08-21'), type: 'custom' },
      ],
    };
    assert.equal(svc.dayAvailability(pandit, '2026-08-20'), 'unavailable');
    assert.equal(svc.dayAvailability(pandit, '2026-08-21'), 'special');
  });

  test('weekly schedule: disabled day is off, enabled is available, short single slot is limited', () => {
    // 2026-08-17 is a Monday (dayOfWeek = 1).
    const pandit = {
      ...base,
      weeklySchedule: [
        { dayOfWeek: 0, enabled: false, slots: [] },
        { dayOfWeek: 1, enabled: true, slots: [{ start: '09:00', end: '12:00' }] },
        { dayOfWeek: 2, enabled: true, slots: [{ start: '09:00', end: '14:00' }] },
      ],
    };
    assert.equal(svc.dayAvailability(pandit, '2026-08-16'), 'off');       // Sunday
    assert.equal(svc.dayAvailability(pandit, '2026-08-17'), 'limited');   // Monday, 3h single slot
    assert.equal(svc.dayAvailability(pandit, '2026-08-18'), 'available'); // Tuesday, 5h
  });

  test('legacy availabilitySlots fallback', () => {
    const pandit = {
      ...base,
      availabilitySlots: [{
        startDate: new Date('2026-08-01'), endDate: new Date('2026-08-31'),
        daysOfWeek: [1], isActive: true,
      }],
    };
    assert.equal(svc.dayAvailability(pandit, '2026-08-17'), 'available'); // Monday in range
    assert.equal(svc.dayAvailability(pandit, '2026-08-18'), 'none');      // Tuesday
  });

  test('date keys are timezone-independent (no device-local drift)', () => {
    // A Date stored exactly at UTC midnight must map back to the same day.
    assert.equal(svc.dayOfWeekFromKey('2026-08-15'), 6); // Saturday
  });
});

// ── Status precedence ───────────────────────────────────────────────────────
describe('resolveDayStatus precedence', () => {
  test('booking on an otherwise free/off day renders blue', () => {
    assert.equal(svc.resolveDayStatus('available', true), 'blue');
    assert.equal(svc.resolveDayStatus('off', true), 'blue');
    assert.equal(svc.resolveDayStatus('none', true), 'blue');
  });
  test('limited/special/red keep their own fill (booking shown as an indicator)', () => {
    assert.equal(svc.resolveDayStatus('limited', true), 'limited');
    assert.equal(svc.resolveDayStatus('special', true), 'special');
    assert.equal(svc.resolveDayStatus('leave', true), 'leave');
    assert.equal(svc.resolveDayStatus('unavailable', true), 'unavailable');
  });
  test('no booking → base availability unchanged', () => {
    assert.equal(svc.resolveDayStatus('available', false), 'available');
    assert.equal(svc.resolveDayStatus('leave', false), 'leave');
  });
});

// ── Calendar assembly ───────────────────────────────────────────────────────
describe('buildCalendarDays', () => {
  test('emits one entry per day, marks booking days and leave conflicts', () => {
    const pandit = {
      weeklySchedule: [{ dayOfWeek: 1, enabled: true, slots: [{ start: '09:00', end: '18:00' }] }],
      specialDates: [],
      blockedPeriods: [{ startDate: new Date('2026-08-11'), endDate: new Date('2026-08-11') }],
      availabilitySlots: [],
    };
    const bookings = [
      {
        _id: 'b1', bookingNumber: 'B1', status: 'pandit_accepted',
        scheduledDate: new Date('2026-08-11'), scheduledTime: '10:00',
        poojaId: { name: 'Conflict Pooja', durationValue: 1, durationUnit: 'hours' },
        userDetails: { name: 'Alice' },
      },
      {
        _id: 'b2', bookingNumber: 'B2', status: 'completed',
        scheduledDate: new Date('2026-08-17'), scheduledTime: '11:00',
        poojaId: { name: 'Done Pooja' }, userDetails: { name: 'Bob' },
      },
    ];
    const days = svc.buildCalendarDays(pandit, '2026-08-10', '2026-08-18', bookings);

    assert.equal(days.length, 9);
    const d11 = days.find((d) => d.date === '2026-08-11');
    assert.equal(d11.availability, 'leave');
    assert.equal(d11.hasBooking, true);
    assert.equal(d11.scheduleConflict, true);   // booking on a leave day
    assert.equal(d11.bookings[0].customerName, 'Alice');

    const d17 = days.find((d) => d.date === '2026-08-17');
    assert.equal(d17.availability, 'available');
    assert.equal(d17.hasBooking, false);        // completed does not occupy
    assert.equal(d17.bookingCount, 1);          // but is visible history
    assert.equal(d17.status, 'available');

    const d10 = days.find((d) => d.date === '2026-08-10'); // Monday → weekly slot day
    assert.equal(d10.status, 'available');
    assert.deepEqual(d10.bookings, []);

    const d16 = days.find((d) => d.date === '2026-08-16'); // Sunday → not scheduled
    assert.equal(d16.status, 'off');
    assert.deepEqual(d16.bookings, []);
  });

  test('never leaks customer phone / address / financial fields', () => {
    const pandit = { weeklySchedule: [], specialDates: [], blockedPeriods: [], availabilitySlots: [] };
    const serialized = svc.serializeBookingForPandit({
      _id: 'x', bookingNumber: 'X', status: 'pandit_assigned',
      scheduledDate: new Date('2026-08-15'), scheduledTime: '10:00',
      poojaId: { name: 'P' }, userDetails: { name: 'Alice', phone: '9999999999', address: 'secret' },
      amount: 99999,
    });
    assert.equal(serialized.customerName, 'Alice');
    assert.equal(serialized.phone, undefined);
    assert.equal(serialized.address, undefined);
    assert.equal(serialized.amount, undefined);
    assert.equal(serialized.actionable, true);
  });
});

// ── Conflict detection (DB-backed) ──────────────────────────────────────────
describe('findConflictingBooking', () => {
  let pandit;

  before(async () => {
    ({ pandit } = await makePandit('Conflict Pandit'));
  });

  test('blocks an overlapping occupying booking', async () => {
    await makeBooking({ panditId: pandit._id, status: 'pandit_accepted', scheduledTime: '10:00' });
    const conflict = await svc.findConflictingBooking({
      panditId: pandit._id, dateKey: '2026-08-15', scheduledTime: '11:00', durationMinutes: 120,
    });
    assert.ok(conflict);
    assert.equal(conflict.scheduledTime, '10:00');
  });

  test('allows a non-overlapping booking later the same day', async () => {
    const conflict = await svc.findConflictingBooking({
      panditId: pandit._id, dateKey: '2026-08-15', scheduledTime: '12:00', durationMinutes: 120,
    });
    assert.equal(conflict, null);
  });

  test('allows back-to-back bookings that only touch at the boundary', async () => {
    await makeBooking({ panditId: pandit._id, status: 'pandit_assigned', scheduledTime: '14:00' });
    // Existing 14:00 + 2h ends at 16:00; a 16:00 start must not conflict.
    const conflict = await svc.findConflictingBooking({
      panditId: pandit._id, dateKey: '2026-08-15', scheduledTime: '16:00', durationMinutes: 120,
    });
    assert.equal(conflict, null);
  });

  test('ignores non-occupying statuses (paid / cancelled / completed)', async () => {
    const { pandit: other } = await makePandit('Paid Pandit');
    await makeBooking({ panditId: other._id, status: 'paid', scheduledTime: '10:00' });
    await makeBooking({ panditId: other._id, status: 'cancelled', scheduledTime: '10:00' });
    await makeBooking({ panditId: other._id, status: 'completed', scheduledTime: '10:00' });
    const conflict = await svc.findConflictingBooking({
      panditId: other._id, dateKey: '2026-08-15', scheduledTime: '10:00', durationMinutes: 60,
    });
    assert.equal(conflict, null);
  });

  test('excludes the booking being accepted (never conflicts with itself)', async () => {
    const self = await makeBooking({ panditId: pandit._id, status: 'pandit_assigned', scheduledTime: '20:00' });
    const conflict = await svc.findConflictingBooking({
      panditId: pandit._id, dateKey: '2026-08-15', scheduledTime: '20:00', durationMinutes: 60,
      excludeBookingId: self._id,
    });
    assert.equal(conflict, null);
  });

  test('detects a multi-day booking spilling into the checked day', async () => {
    const multi = await Pooja.create({
      name: 'Multi Day', slug: `multi-day-${Date.now()}`, price: 100,
      durationValue: 2, durationUnit: 'days', createdByRole: 'admin', approvalStatus: 'approved', isActive: true,
    });
    const { pandit: spillPandit } = await makePandit('Spill Pandit');
    await makeBooking({
      panditId: spillPandit._id, poojaId: multi._id, status: 'pandit_accepted',
      scheduledDate: new Date('2026-09-01'), scheduledTime: '23:00',
    });
    // Starts 2026-09-01 23:00, runs 2 days → blocks most of 2026-09-02/03.
    const conflict = await svc.findConflictingBooking({
      panditId: spillPandit._id, dateKey: '2026-09-02', scheduledTime: '10:00', durationMinutes: 60,
    });
    assert.ok(conflict);
    assert.equal(conflict.dateKey, '2026-09-01');
  });

  test('zero-duration bookings still collide at the same time (1-min floor)', async () => {
    const noDur = await makeBooking({
      panditId: pandit._id, poojaId: poojaNoDuration._id, status: 'pandit_accepted', scheduledTime: '22:00',
    });
    const conflict = await svc.findConflictingBooking({
      panditId: pandit._id, dateKey: '2026-08-15', scheduledTime: '22:00', durationMinutes: null,
    });
    assert.ok(conflict);
    assert.equal(conflict.bookingId, String(noDur._id));
  });
});

// ── Concurrency lock ────────────────────────────────────────────────────────
describe('withPanditDateLock', () => {
  test('serialises operations per (pandit, day) while different keys run in parallel', async () => {
    const order = [];
    const slow = svc.withPanditDateLock('p1', '2026-08-15', async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 40));
      order.push('a-end');
      return 'a';
    });
    const fast = svc.withPanditDateLock('p1', '2026-08-15', async () => {
      order.push('b-start');
      order.push('b-end');
      return 'b';
    });
    const results = await Promise.all([slow, fast]);
    assert.deepEqual(results, ['a', 'b']);
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);

    const otherDay = svc.withPanditDateLock('p1', '2026-08-16', async () => 'c');
    assert.equal(await otherDay, 'c');
  });

  test('a failing operation does not deadlock the lock', async () => {
    await assert.rejects(
      svc.withPanditDateLock('p2', '2026-08-15', async () => { throw new Error('boom'); }),
      /boom/,
    );
    assert.equal(await svc.withPanditDateLock('p2', '2026-08-15', async () => 'ok'), 'ok');
  });
});

// ── Realtime signal ─────────────────────────────────────────────────────────
describe('notifyPanditScheduleChanged', () => {
  test('emits pandit_schedule_changed to the pandit user room (and not otherwise)', async () => {
    const calls = [];
    const original = notificationService.emitToUser;
    notificationService.emitToUser = (userId, event, payload) => {
      calls.push({ userId: String(userId), event, payload });
      return true;
    };
    try {
      const { pandit: p, account } = await makePandit('Notif Pandit');
      await svc.notifyPanditScheduleChanged({
        panditId: p._id, bookingId: 'abc', dateKey: '2026-08-15', reason: 'booking_assigned',
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].userId, String(account._id));
      assert.equal(calls[0].event, 'pandit_schedule_changed');
      assert.equal(calls[0].payload.reason, 'booking_assigned');
    } finally {
      notificationService.emitToUser = original;
    }
  });

  test('does nothing for a pandit with no linked user account', async () => {
    const calls = [];
    const original = notificationService.emitToUser;
    notificationService.emitToUser = (...args) => { calls.push(args); return true; };
    try {
      // A pandit record without a linked account must be a silent no-op.
      const { pandit: orphan } = await makePandit('Orphan Pandit');
      await Pandit.updateOne({ _id: orphan._id }, { $set: { userId: null } });
      await svc.notifyPanditScheduleChanged({ panditId: orphan._id, reason: 'x' });
      assert.equal(calls.length, 0);
    } finally {
      notificationService.emitToUser = original;
    }
  });
});
