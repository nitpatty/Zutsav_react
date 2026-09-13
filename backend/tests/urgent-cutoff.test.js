/**
 * Tests for the Urgent Booking Date & Dynamic Cutoff Rule.
 *
 * BUSINESS RULE (final):
 *   When bookingType === 'urgent', in IST:
 *     - Today is NEVER allowed.
 *     - Before cutoff (urgentBookingCutoffTime from SystemSettings)
 *       → earliest = tomorrow, latest = day-after-tomorrow.
 *     - At/after cutoff
 *       → earliest = day-after-tomorrow, latest = day-after-tomorrow.
 *     - Beyond day-after-tomorrow → rejected.
 *   i.e. minDaysFromNow = cutoffReached ? 2 : 1, maxDaysFromNow = 2.
 *   Normal bookings are NOT restricted by this module.
 *
 * Covers:
 *   A. getUrgentWindow — IST offset/cutoff derivation with default 18:30
 *   B. validateUrgentDate — accept/reject per default window
 *   C. Input normalization (Date object / ISO string / junk)
 *   D. Controller enforcement — createPhonePeBooking/createBookingOrder reject invalid dates
 *   E. Dynamic cutoff — custom SystemSettings values (17:00, 23:59, 00:00)
 *   F. formatTimeLabel — 12-hour label rendering
 *
 * Uses Node's built-in test runner (node:test).
 * Run:  backend> node --test tests/urgent-cutoff.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'urgent-cutoff-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_urgent_cutoff_test';

const rules = require('../src/utils/bookingDateRules');
const bookingController = require('../src/controllers/booking.controller');
const settingsService = require('../src/utils/settingsService');
const SystemSettings = require('../src/models/SystemSettings');

// ── Deterministic IST instants (IST = UTC + 05:30) ────────────────────────────
// new Date(Date.UTC(y, m-1, d, hh-5, mm-30)) lands on HH:MM IST for that day.
const istInstant = (y, m, d, hh, mm) => new Date(Date.UTC(y, m - 1, d, hh - 5, mm - 30));

const REF_Y = 2026, REF_M = 1, REF_D = 15; // fixed "today" = 2026-01-15 (IST)
const TODAY       = '2026-01-15';
const TOMORROW    = '2026-01-16';
const DAY_AFTER   = '2026-01-17';
const BEYOND      = '2026-01-18';

const BEFORE_CUTOFF = istInstant(REF_Y, REF_M, REF_D, 10, 0);   // 10:00 IST
const AT_CUTOFF     = istInstant(REF_Y, REF_M, REF_D, 18, 30);  // 18:30 IST exactly
const AFTER_CUTOFF  = istInstant(REF_Y, REF_M, REF_D, 19, 0);   // 19:00 IST

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
}

// ── Connect / disconnect ─────────────────────────────────────────────────────
before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  settingsService.invalidate();
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    settingsService.invalidate();
    await mongoose.disconnect();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// A. WINDOW — default 18:30 cutoff, IST derivation
// ═══════════════════════════════════════════════════════════════════════════════
describe('getUrgentWindow — default 18:30 IST', () => {
  test('#1 before 18:30 IST → earliest tomorrow (min=1), latest day-after (max=2)', async () => {
    const w = await rules.getUrgentWindow(BEFORE_CUTOFF);
    assert.equal(w.cutoffReached, false);
    assert.equal(w.minDaysFromNow, 1);
    assert.equal(w.maxDaysFromNow, 2);
    assert.equal(w.earliestDate, TOMORROW);
    assert.equal(w.latestDate, DAY_AFTER);
    assert.equal(w.cutoffTime, '18:30');
  });

  test('#2 exactly at 18:30 IST → cutoff reached, earliest day-after (min=2)', async () => {
    const w = await rules.getUrgentWindow(AT_CUTOFF);
    assert.equal(w.cutoffReached, true);
    assert.equal(w.minDaysFromNow, 2);
    assert.equal(w.maxDaysFromNow, 2);
    assert.equal(w.earliestDate, DAY_AFTER);
    assert.equal(w.latestDate, DAY_AFTER);
  });

  test('#3 after 18:30 IST → earliest day-after (min=2)', async () => {
    const w = await rules.getUrgentWindow(AFTER_CUTOFF);
    assert.equal(w.cutoffReached, true);
    assert.equal(w.minDaysFromNow, 2);
    assert.equal(w.maxDaysFromNow, 2);
    assert.equal(w.earliestDate, DAY_AFTER);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. VALIDATION — accept/reject per default window
// ═══════════════════════════════════════════════════════════════════════════════
describe('validateUrgentDate — default cutoff', () => {
  test('#4 today is NEVER allowed before the cutoff', async () => {
    const v = await rules.validateUrgentDate(TODAY, BEFORE_CUTOFF);
    assert.equal(v.valid, false);
    assert.match(v.message, /cannot be scheduled for today/i);
    assert.equal(v.earliestDate, TOMORROW);
  });

  test('#5 tomorrow is allowed before the cutoff', async () => {
    const v = await rules.validateUrgentDate(TOMORROW, BEFORE_CUTOFF);
    assert.equal(v.valid, true);
  });

  test('#6 day-after-tomorrow is allowed before the cutoff', async () => {
    const v = await rules.validateUrgentDate(DAY_AFTER, BEFORE_CUTOFF);
    assert.equal(v.valid, true);
  });

  test('#7 beyond day-after-tomorrow is rejected', async () => {
    const v = await rules.validateUrgentDate(BEYOND, BEFORE_CUTOFF);
    assert.equal(v.valid, false);
    assert.match(v.message, /only available/i);
  });

  test('#8 tomorrow is rejected AFTER the cutoff', async () => {
    const v = await rules.validateUrgentDate(TOMORROW, AFTER_CUTOFF);
    assert.equal(v.valid, false);
    assert.match(v.message, /past 6:30 PM/i);
    assert.equal(v.earliestDate, DAY_AFTER);
  });

  test('#9 exactly at 18:30 tomorrow is rejected too', async () => {
    const v = await rules.validateUrgentDate(TOMORROW, AT_CUTOFF);
    assert.equal(v.valid, false);
  });

  test('#10 day-after-tomorrow is still allowed after the cutoff', async () => {
    const v = await rules.validateUrgentDate(DAY_AFTER, AFTER_CUTOFF);
    assert.equal(v.valid, true);
  });

  test('#11 today is rejected after the cutoff', async () => {
    const v = await rules.validateUrgentDate(TODAY, AFTER_CUTOFF);
    assert.equal(v.valid, false);
  });

  test('#12 beyond is rejected after the cutoff', async () => {
    const v = await rules.validateUrgentDate(BEYOND, AFTER_CUTOFF);
    assert.equal(v.valid, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. INPUT NORMALIZATION — Date objects / ISO strings / junk
// ═══════════════════════════════════════════════════════════════════════════════
describe('validateUrgentDate — input normalization', () => {
  test('#13 accepts a Date object (UTC-midnight, how controllers persist)', async () => {
    const v = await rules.validateUrgentDate(new Date('2026-01-16'), BEFORE_CUTOFF);
    assert.equal(v.valid, true);
  });

  test('#14 accepts an ISO datetime string, using only the date part', async () => {
    const v = await rules.validateUrgentDate('2026-01-16T00:00:00.000Z', BEFORE_CUTOFF);
    assert.equal(v.valid, true);
  });

  test('#15 rejects unparseable / missing scheduledDate', async () => {
    assert.equal((await rules.validateUrgentDate(null, BEFORE_CUTOFF)).valid, false);
    assert.equal((await rules.validateUrgentDate('not-a-date', BEFORE_CUTOFF)).valid, false);
    assert.equal((await rules.validateUrgentDate(undefined, BEFORE_CUTOFF)).valid, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. CONTROLLER ENFORCEMENT — createPhonePeBooking/createBookingOrder reject invalid
// ═══════════════════════════════════════════════════════════════════════════════
describe('createPhonePeBooking — urgent date enforcement', () => {
  test('#16 urgent + today → 400 before any payment/order work', async () => {
    const req = { body: { poojaId: new mongoose.Types.ObjectId().toString(), scheduledDate: rules.todayIST(), isUrgent: true }, user: { _id: new mongoose.Types.ObjectId() } };
    const res = mockRes();
    await bookingController.createPhonePeBooking(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message);
  });

  test('#17 legacy createBookingOrder also rejects invalid urgent dates', async () => {
    const req = { body: { poojaId: new mongoose.Types.ObjectId().toString(), scheduledDate: rules.todayIST(), isUrgent: true }, user: { _id: new mongoose.Types.ObjectId() } };
    const res = mockRes();
    await bookingController.createBookingOrder(req, res, (e) => { if (e) throw e; });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });

  test('#18 urgent + day-after → passes validation (downstream 404 for missing pooja, never a 400)', async () => {
    const req = { body: { poojaId: new mongoose.Types.ObjectId().toString(), scheduledDate: rules.addDays(rules.todayIST(), 2), isUrgent: true }, user: { _id: new mongoose.Types.ObjectId() } };
    const res = mockRes();
    await bookingController.createPhonePeBooking(req, res, (e) => { if (e) throw e; });
    assert.notEqual(res.statusCode, 400, 'valid urgent date must not be rejected');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. DYNAMIC CUTOFF — SystemSettings values override the default
// ═══════════════════════════════════════════════════════════════════════════════
describe('getUrgentWindow — dynamic cutoff from SystemSettings', () => {
  const TWO_THIRTY_PM = istInstant(REF_Y, REF_M, REF_D, 14, 30); // 14:30 IST

  test('#19 custom cutoff 17:00 → at 14:30 IST tomorrow is allowed', async () => {
    await SystemSettings.updateOne({}, { $set: { urgentBookingCutoffTime: '17:00' } }, { upsert: true });
    settingsService.invalidate();
    const w = await rules.getUrgentWindow(TWO_THIRTY_PM);
    assert.equal(w.cutoffReached, false, '14:30 is before 17:00');
    assert.equal(w.cutoffTime, '17:00');
    assert.equal(w.earliestDate, TOMORROW);
  });

  test('#20 custom cutoff 17:00 → at 17:05 tomorrow is rejected', async () => {
    const at1705 = istInstant(REF_Y, REF_M, REF_D, 17, 5);
    const w = await rules.getUrgentWindow(at1705);
    assert.equal(w.cutoffReached, true, '17:05 is at/after 17:00');
    assert.equal(w.earliestDate, DAY_AFTER);
  });

  test('#21 custom cutoff 23:59 → tomorrow allowed at 23:58', async () => {
    await SystemSettings.updateOne({}, { $set: { urgentBookingCutoffTime: '23:59' } }, { upsert: true });
    settingsService.invalidate();
    const at2358 = istInstant(REF_Y, REF_M, REF_D, 23, 58);
    const w = await rules.getUrgentWindow(at2358);
    assert.equal(w.cutoffReached, false, '23:58 is before 23:59');
    assert.equal(w.earliestDate, TOMORROW);
  });

  test('#22 custom cutoff 23:59 → at 23:59 tomorrow is rejected', async () => {
    const at2359 = istInstant(REF_Y, REF_M, REF_D, 23, 59);
    const w = await rules.getUrgentWindow(at2359);
    assert.equal(w.cutoffReached, true, '23:59 is at/after 23:59');
    assert.equal(w.earliestDate, DAY_AFTER);
  });

  test('#23 custom cutoff 00:00 → at 00:01 tomorrow is rejected (cutoff at midnight)', async () => {
    await SystemSettings.updateOne({}, { $set: { urgentBookingCutoffTime: '00:00' } }, { upsert: true });
    settingsService.invalidate();
    const at0001 = istInstant(REF_Y, REF_M, REF_D + 1, 0, 1); // 00:01 IST on Jan 16
    const w = await rules.getUrgentWindow(at0001);
    assert.equal(w.cutoffReached, true, '00:01 is at/after 00:00');
    assert.equal(w.cutoffTime, '00:00');
  });

  test('#24 validateUrgentDate with custom cutoff 17:00 → message mentions "5 PM"', async () => {
    await SystemSettings.updateOne({}, { $set: { urgentBookingCutoffTime: '17:00' } }, { upsert: true });
    settingsService.invalidate();
    const at1705 = istInstant(REF_Y, REF_M, REF_D, 17, 5);
    const v = await rules.validateUrgentDate(TOMORROW, at1705);
    assert.equal(v.valid, false);
    assert.match(v.message, /past 5 PM/i, 'message should mention the custom 5 PM cutoff');
  });

  test('#25 missing setting in DB → falls back to 18:30 default', async () => {
    await SystemSettings.updateOne({}, { $unset: { urgentBookingCutoffTime: '' } }, { upsert: true });
    settingsService.invalidate();
    const w = await rules.getUrgentWindow(BEFORE_CUTOFF);
    assert.equal(w.cutoffTime, '18:30');
    assert.equal(w.cutoffReached, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. formatTimeLabel — 12-hour label rendering
// ═══════════════════════════════════════════════════════════════════════════════
describe('formatTimeLabel', () => {
  test('#26 18:30 → "6:30 PM"', () => {
    assert.equal(rules.formatTimeLabel('18:30'), '6:30 PM');
  });
  test('#27 17:00 → "5 PM"', () => {
    assert.equal(rules.formatTimeLabel('17:00'), '5 PM');
  });
  test('#28 00:00 → "12 AM"', () => {
    assert.equal(rules.formatTimeLabel('00:00'), '12 AM');
  });
  test('#29 23:59 → "11:59 PM"', () => {
    assert.equal(rules.formatTimeLabel('23:59'), '11:59 PM');
  });
  test('#30 06:00 → "6 AM"', () => {
    assert.equal(rules.formatTimeLabel('06:00'), '6 AM');
  });
  test('#31 invalid input → returns raw string', () => {
    assert.equal(rules.formatTimeLabel('not-a-time'), 'not-a-time');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. parseCutoffTime — input validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('parseCutoffTime', () => {
  test('#32 valid formats', () => {
    assert.deepEqual(rules.parseCutoffTime('18:30'), [18, 30]);
    assert.deepEqual(rules.parseCutoffTime('00:00'), [0, 0]);
    assert.deepEqual(rules.parseCutoffTime('23:59'), [23, 59]);
    assert.deepEqual(rules.parseCutoffTime('06:00'), [6, 0]);
    assert.deepEqual(rules.parseCutoffTime('12:15'), [12, 15]);
  });
  test('#33 invalid formats return null', () => {
    assert.equal(rules.parseCutoffTime('24:00'), null);
    assert.equal(rules.parseCutoffTime('18:60'), null);
    assert.equal(rules.parseCutoffTime('abc'), null);
    assert.equal(rules.parseCutoffTime(''), null);
    assert.equal(rules.parseCutoffTime(null), null);
    assert.equal(rules.parseCutoffTime(undefined), null);
    assert.equal(rules.parseCutoffTime(1830), null);
  });
});