/**
 * Tests for the Global Urgent Booking Price Hike feature.
 *
 * BUSINESS RULE (final):
 *   The urgent surcharge is added to the EXISTING GROSS GRAND TOTAL AFTER the
 *   current tax / fee calculations (poojaAmount + platformFee + platformGST +
 *   kitAmount + kitGST) and BEFORE coupon / coin deductions. It never re-taxes
 *   the fee/kit components and never re-runs the base pricing. Normal bookings
 *   are ALWAYS unaffected, even when a hike is configured.
 *
 *   percent mode → urgentSurcharge = calculatePercentage(grandTotal, hikePercent)
 *   fixed mode   → urgentSurcharge = roundToPaise(hikeFixed)
 *
 * Covers:
 *   A. Engine (financeUtils.calculatePricing) — math + invariants
 *   B. GET /api/bookings/pricing-preview via booking.controller.getPricingPreview
 *   C. Settings API persistence (systemSettings.controller)
 *   D. Booking model persistence (urgent + normal + legacy spread path)
 *   E. Invoice snapshot (invoiceGenerator carries the surcharge line item)
 *
 * Uses Node's built-in test runner (node:test).
 * Run:  backend> node --test tests/urgent-pricing.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'urgent-pricing-test-secret';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_urgent_pricing_test';

const { calculatePricing, calculatePercentage, roundToPaise } = require('../src/utils/financeUtils');
const settingsService = require('../src/utils/settingsService');

const Booking = require('../src/models/Booking');
const Pooja   = require('../src/models/Pooja');
const Kit     = require('../src/models/Kit');
const User    = require('../src/models/User');
const SystemSettings = require('../src/models/SystemSettings');
const Invoice = require('../src/models/Invoice');
const InvoiceCounter = require('../src/models/InvoiceCounter');
const PaymentLedger  = require('../src/models/PaymentLedger');

const bookingController = require('../src/controllers/booking.controller');
const settingsController = require('../src/controllers/systemSettings.controller');
const { generateInvoiceForPayment } = require('../src/utils/invoiceGenerator');

// ── Helpers ──────────────────────────────────────────────────────────────────
let _seq = 80000;
let _slugSeq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++));
const uniqEmail = () => `urgent${Date.now()}_${_seq}@test.zutsav.local`;
const oid = () => new mongoose.Types.ObjectId();

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
}

function buildPooja() {
  _slugSeq += 1;
  const seq = _slugSeq;
  return { name: `Test Pooja ${seq}`, slug: `test-pooja-${seq}`, price: 1500, salePrice: 1500, mrp: 1800, isActive: true };
}
function buildKit() {
  _slugSeq += 1;
  const seq = _slugSeq;
  return {
    name: `Test Samagri ${seq}`,
    slug: `test-samagri-${seq}`,
    items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1 }],
    price: 250, discountPrice: 200, isActive: true,
  };
}

// Standard commission config used across engine tests
const COMMISSION = { commissionPercent: 10, commissionFixed: 0, commissionType: 'percent', gstPercent: 18 };
// Expected gross for pooja 1500, commission 10%, GST 18%:
//   poojaAmount=1500, platformFee=150, platformGST=27 → gross = 1677
const GROSS_1500 = 1500 + 150 + 27; // 1677

async function cleanDb() {
  await Promise.all([
    Booking.deleteMany({}),
    Pooja.deleteMany({}),
    Kit.deleteMany({}),
    User.deleteMany({}),
    SystemSettings.deleteMany({}),
    Invoice.deleteMany({}),
    InvoiceCounter.deleteMany({}),
    PaymentLedger.deleteMany({}),
  ]);
}

/** Seed settings with commission + an urgent hike config, then invalidate cache. */
async function seedSettings(extra = {}) {
  await SystemSettings.deleteMany({});
  await SystemSettings.create({
    platformCommissionType: 'percent',
    platformCommissionPercent: 10,
    platformCommissionFixed: 0,
    platformGstPercent: 18,
    urgentBookingHikeType: 'percent',
    urgentBookingHikePercent: 5,
    urgentBookingHikeFixed: 0,
    ...extra,
  });
  settingsService.invalidate();
}

async function createUser() {
  return User.create({ name: 'Urgent User', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
}

async function requestPreview(query) {
  const req = { query: { poojaId: '', ...query } };
  const res = mockRes();
  const pooja = await Pooja.create(buildPooja());
  req.query.poojaId = pooja._id.toString();
  await bookingController.getPricingPreview(req, res, (e) => { if (e) throw e; });
  return res.body;
}

// ── Connect / disconnect ─────────────────────────────────────────────────────
before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    Booking.init(), Pooja.init(), Kit.init(), User.init(),
    SystemSettings.init(), Invoice.init(), InvoiceCounter.init(), PaymentLedger.init(),
  ]);
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// A. ENGINE — math + invariants
// ═══════════════════════════════════════════════════════════════════════════════
describe('Engine — calculatePricing urgent hike', () => {
  beforeEach(async () => { await cleanDb(); await seedSettings(); });

  test('#1 normal booking (no urgent) matches the legacy engine output exactly', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION });
    assert.equal(p.poojaAmount, 1500);
    assert.equal(p.platformFee, 150);
    assert.equal(p.platformGST, 27);
    assert.equal(p.kitAmount, 0);
    assert.equal(p.kitGST, 0);
    assert.equal(p.grandTotal, GROSS_1500);
    assert.equal(p.finalAmount, GROSS_1500);
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.urgentHikeType, null);
  });

  test('#2 percent hike CONFIGURED but booking is normal → ignored, zero surcharge', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: false, urgentHikeType: 'percent', urgentHikePercent: 10 });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.grandTotal, GROSS_1500);
  });

  test('#3 fixed hike CONFIGURED but booking is normal → ignored, zero surcharge', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: false, urgentHikeType: 'fixed', urgentHikeFixed: 500 });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.grandTotal, GROSS_1500);
  });

  test('#4 urgent but percent=0 → no hike configured, unchanged total', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 0 });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.grandTotal, GROSS_1500);
  });

  test('#5 urgent percent 5% → surcharge is 5% of the gross and grandTotal includes it', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(p.urgentSurcharge, 83.85);                      // round(1677 × .05)
    assert.equal(p.grandTotal, roundToPaise(GROSS_1500 + 83.85)); // 1760.85
    assert.equal(p.finalAmount, p.grandTotal);
  });

  test('#6 surcharge sits on the EXISTING total — fee/kit GST are NEVER re-taxed', () => {
    const normal = calculatePricing({ poojaPrice: 1500, kitPrice: 0, ...COMMISSION });
    const urgent = calculatePricing({ poojaPrice: 1500, kitPrice: 0, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(urgent.platformFee, normal.platformFee);    // 150 — untouched
    assert.equal(urgent.platformGST, normal.platformGST);    // 27 — untouched
    assert.equal(urgent.kitGST, normal.kitGST);              // 0 — untouched
    assert.equal(urgent.poojaAmount, normal.poojaAmount);    // 1500 — untouched
    assert.equal(urgent.gstAmount, normal.gstAmount);        // 27 — untouched
  });

  test('#7 percent surcharge rounds to the nearest PAISA', () => {
    const p = calculatePricing({ poojaPrice: 1000.5, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 10 });
    // poojaAmount=1000.5, platformFee=100.05, platformGST=18.01 → gross=1118.56 → 10% = 111.856 → 111.86
    assert.equal(p.urgentSurcharge, 111.86);
    assert.equal(p.grandTotal, roundToPaise(1118.56 + 111.86)); // 1230.42
  });

  test('#8 float-noise rounding (35.855 → 35.86, never 35.85)', () => {
    const p = calculatePricing({ poojaPrice: 3585.5, commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1 });
    assert.equal(p.urgentSurcharge, 35.86);
    assert.equal(p.grandTotal, 3621.36);
  });

  test('#9 fixed mode → surcharge is exactly the fixed amount, independent of price', () => {
    const p = calculatePricing({ poojaPrice: 500, ...COMMISSION, urgent: true, urgentHikeType: 'fixed', urgentHikeFixed: 100 });
    // gross = 500+50+9 = 559 → +100 = 659
    assert.equal(p.urgentSurcharge, 100);
    assert.equal(p.grandTotal, 659);
  });

  test('#10 fixed mode ignores the percent value even when both are set', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'fixed', urgentHikePercent: 5, urgentHikeFixed: 100 });
    assert.equal(p.urgentSurcharge, 100);
    assert.equal(p.grandTotal, 1777);
  });

  test('#11 percent mode ignores the fixed value even when both are set', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5, urgentHikeFixed: 100 });
    assert.equal(p.urgentSurcharge, 83.85);
    assert.equal(p.grandTotal, 1760.85);
  });

  test('#12 zero gross can never produce a negative surcharge', () => {
    const p = calculatePricing({ poojaPrice: 0, commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0, urgent: true, urgentHikePercent: 5 });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.grandTotal, 0);
  });

  test('#13 grandTotal === finalAmount and both carry the hike', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikePercent: 5 });
    assert.equal(p.finalAmount, p.grandTotal);
    assert.equal(p.grandTotal, 1760.85);
    assert.equal(Math.round((p.grandTotal - GROSS_1500) * 100) / 100, p.urgentSurcharge);
  });

  test('#14 urgent pricing exposes the hike metadata for persistence/UI', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'fixed', urgentHikePercent: 5, urgentHikeFixed: 120 });
    assert.equal(p.urgentSurcharge, 120);
    assert.equal(p.urgentHikeType, 'fixed');
    assert.equal(p.urgentHikePercent, 5);
    assert.equal(p.urgentHikeFixed, 120);
  });

  test('#15 normal pricing exposes zero/null hike metadata', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.urgentHikeType, null);
    assert.equal(p.urgentHikePercent, 0);
    assert.equal(p.urgentHikeFixed, 0);
  });

  test('#16 percent hike is calculated on the FULL gross including kit price', () => {
    // gross = 1500+150+27+200+36 = 1913 → 5% = 95.65
    const p = calculatePricing({ poojaPrice: 1500, kitPrice: 200, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(p.kitAmount, 200);
    assert.equal(p.kitGST, 36);
    assert.equal(p.urgentSurcharge, 95.65);
    assert.equal(p.grandTotal, 2008.65);
  });

  test('#17 fixed hike with a kit → kit still in gross, surcharge flat', () => {
    const p = calculatePricing({ poojaPrice: 1500, kitPrice: 200, ...COMMISSION, urgent: true, urgentHikeType: 'fixed', urgentHikeFixed: 150 });
    assert.equal(p.kitAmount, 200);
    assert.equal(p.urgentSurcharge, 150);
    assert.equal(p.grandTotal, 2063);
  });

  test('#18 fix: hike only applies to urgent=true, never leaks into normal config reads', () => {
    const urgent = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    const normal = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: false, urgentHikeType: 'percent', urgentHikePercent: 5, urgentHikeFixed: 999 });
    assert.equal(urgent.urgentSurcharge, 83.85);
    assert.equal(normal.urgentSurcharge, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. PRICING PREVIEW — GET /api/bookings/pricing-preview (DB-backed hooks)
// ═══════════════════════════════════════════════════════════════════════════════
describe('getPricingPreview — isUrgent threading', () => {
  beforeEach(async () => { await cleanDb(); await seedSettings(); });

  test('#19 isUrgent=true + percent hike → surcharge 5% of gross, kit skipped (urgent)', async () => {
    const body = await requestPreview({ isUrgent: 'true' });
    assert.equal(body.success, true);
    assert.equal(body.pricing.urgentSurcharge, 83.85);
    assert.equal(body.pricing.grandTotal, 1760.85);
    assert.equal(body.pricing.kitAmount, 0, 'kits are never charged on urgent previews');
  });

  test('#20 isUrgent absent → pure normal pricing though a hike is configured', async () => {
    const body = await requestPreview({});
    assert.equal(body.pricing.urgentSurcharge, 0);
    assert.equal(body.pricing.grandTotal, GROSS_1500);
  });

  test('#21 isUrgent=false + kitIds → kit charged at full price, NO hike', async () => {
    const kit = await Kit.create(buildKit());
    const body = await requestPreview({ isUrgent: 'false', kitIds: kit._id.toString() });
    assert.equal(body.pricing.urgentSurcharge, 0);
    assert.equal(body.pricing.kitAmount, 200);
    assert.equal(body.pricing.grandTotal, 1913);
  });

  test('#22 isUrgent=true + fixed hike configured → flat surcharge, kit skipped', async () => {
    await seedSettings({ urgentBookingHikeType: 'fixed', urgentBookingHikePercent: 0, urgentBookingHikeFixed: 100 });
    const body = await requestPreview({ isUrgent: 'true' });
    assert.equal(body.pricing.urgentSurcharge, 100);
    assert.equal(body.pricing.grandTotal, 1777);
    assert.equal(body.pricing.urgentHikeType, 'fixed');
  });

  test('#23 numeric "1" accepted as urgent, "0" rejected', async () => {
    const yes = await requestPreview({ isUrgent: '1' });
    assert.equal(yes.pricing.urgentSurcharge, 83.85);
    const no = await requestPreview({ isUrgent: '0' });
    assert.equal(no.pricing.urgentSurcharge, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. SETTINGS API — persistence + sanitization
// ═══════════════════════════════════════════════════════════════════════════════
describe('Settings API — urgent hike fields', () => {
  beforeEach(async () => { await cleanDb(); });

  test('#24 updateSettings persists type + percent + fixed', async () => {
    const req = { body: { urgentBookingHikeType: 'fixed', urgentBookingHikePercent: 7.5, urgentBookingHikeFixed: 250 } };
    const res = mockRes();
    await settingsController.updateSettings(req, res, (e) => { if (e) throw e; });
    assert.equal(res.body.success, true);

    const doc = await SystemSettings.findOne().lean();
    assert.equal(doc.urgentBookingHikeType, 'fixed');
    assert.equal(doc.urgentBookingHikePercent, 7.5);
    assert.equal(doc.urgentBookingHikeFixed, 250);
  });

  test('#25 invalid hike type is silently dropped (never persisted)', async () => {
    const req = { body: { urgentBookingHikeType: 'bogus', urgentBookingHikeFixed: 50, platformCommissionPercent: 10 } };
    const res = mockRes();
    await settingsController.updateSettings(req, res, (e) => { if (e) throw e; });
    const doc = await SystemSettings.findOne().lean();
    assert.equal(doc.urgentBookingHikeType, 'percent', 'default kept');
    assert.equal(doc.urgentBookingHikeFixed, 50);
  });

  test('#26 NaN hike values are dropped, not persisted, and save still succeeds', async () => {
    await SystemSettings.create({ urgentBookingHikePercent: 5 });
    const req = { body: { urgentBookingHikePercent: 'not-a-number', urgentBookingHikeFixed: 75 } };
    const res = mockRes();
    await settingsController.updateSettings(req, res, (e) => { if (e) throw e; });
    const doc = await SystemSettings.findOne().lean();
    assert.equal(doc.urgentBookingHikePercent, 5, 'previous valid value untouched');
    assert.equal(doc.urgentBookingHikeFixed, 75);
  });

  test('#27 getSettings returns the hike fields (not masked)', async () => {
    await seedSettings({ urgentBookingHikeType: 'percent', urgentBookingHikePercent: 8, urgentBookingHikeFixed: 0 });
    const req = { body: {} };
    const res = mockRes();
    await settingsController.getSettings(req, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.settings.urgentBookingHikeType, 'percent');
    assert.equal(res.body.settings.urgentBookingHikePercent, 8);
    assert.equal(res.body.settings.urgentBookingHikeFixed, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. BOOKING PERSISTENCE — the exact field sets the create-flows write
// ═══════════════════════════════════════════════════════════════════════════════
describe('Booking persistence — urgent surcharge fields', () => {
  beforeEach(async () => { await cleanDb(); });

  test('#28 create-phonepe style urgent booking round-trips (final authoritative amount)', async () => {
    const user = await createUser();
    const pooja = await Pooja.create(buildPooja());
    const pricing = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });

    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'A', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: pricing.poojaAmount,
      kitAmount: pricing.kitAmount,
      kitGST: pricing.kitGST,
      platformFee: pricing.platformFee,
      platformGST: pricing.platformGST,
      taxAmount: pricing.kitGST,
      grandTotal: pricing.grandTotal,
      urgentSurcharge: pricing.urgentSurcharge,
      urgentHikeType: pricing.urgentHikeType,
      urgentHikePercent: pricing.urgentHikePercent,
      urgentHikeFixed: pricing.urgentHikeFixed,
      amount: pricing.grandTotal,
      bookingType: 'urgent',
      isUrgent: true,
      status: 'pending_payment',
    });

    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, 1760.85);
    assert.equal(reloaded.urgentSurcharge, 83.85);
    assert.equal(reloaded.urgentHikeType, 'percent');
    assert.equal(reloaded.urgentHikePercent, 5);
  });

  test('#29 normal booking persists zero surcharge (hike fields default)', async () => {
    const user = await createUser();
    const pooja = await Pooja.create(buildPooja());
    const pricing = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: false });

    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'B', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: pricing.poojaAmount,
      grandTotal: pricing.grandTotal,
      amount: pricing.grandTotal,
      bookingType: 'normal',
      isUrgent: false,
    });

    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, GROSS_1500);
    assert.equal(reloaded.urgentSurcharge, 0);
    assert.equal(reloaded.urgentHikeType, 'percent', 'schema default');
  });

  test('#30 legacy create-order spread path (…pricing) carries the hike fields', async () => {
    const user = await createUser();
    const pooja = await Pooja.create(buildPooja());
    const pricing = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'fixed', urgentHikeFixed: 100 });

    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'C', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      ...pricing,
      amount: pricing.finalAmount,
      grandTotal: pricing.grandTotal,
      isUrgent: true,
      bookingType: 'urgent',
    });

    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, 1777);
    assert.equal(reloaded.urgentSurcharge, 100);
    assert.equal(reloaded.urgentHikeType, 'fixed');
    assert.equal(reloaded.amount, 1777);
  });

  test('#31 early-payment invoices snapshot the surcharge; totalGST is unaffected by the hike', async () => {
    const user = await createUser();
    const pooja = await Pooja.create(buildPooja());
    const pricing = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });

    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'D', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: pricing.poojaAmount,
      kitAmount: pricing.kitAmount,
      kitGST: pricing.kitGST,
      platformFee: pricing.platformFee,
      platformGST: pricing.platformGST,
      grandTotal: pricing.grandTotal,
      urgentSurcharge: pricing.urgentSurcharge,
      urgentHikeType: pricing.urgentHikeType,
      urgentHikePercent: pricing.urgentHikePercent,
      amount: pricing.grandTotal,
      amountPaid: pricing.grandTotal,
      remainingAmount: 0,
      status: 'paid',
      paymentStatus: 'FULLY_PAID',
      isUrgent: true,
      bookingType: 'urgent',
    });

    const ledger = await PaymentLedger.create({
      bookingId: booking._id,
      amount: pricing.grandTotal,
      paymentType: 'FULL',
      paymentStatus: 'SUCCESS',
      merchantTransactionId: `TX_INV_${_seq}`,
      paidAt: new Date(),
    });

    const invoice = await generateInvoiceForPayment(booking, ledger, 'Test Pooja');
    assert.ok(invoice);
    assert.equal(invoice.grandTotal, 1760.85);
    assert.equal(invoice.urgentSurcharge, 83.85);
    assert.equal(invoice.totalGST, 27, 'GST components unchanged — surcharge is not re-taxed');
  });

  test('#32 invoice idempotency + complete breakdown sums to the hiked grand total', async () => {
    const user = await createUser();
    const pooja = await Pooja.create(buildPooja());
    const pricing = calculatePricing({ poojaPrice: 1500, kitPrice: 200, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });

    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'E', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: pricing.poojaAmount,
      kitAmount: pricing.kitAmount,
      kitGST: pricing.kitGST,
      platformFee: pricing.platformFee,
      platformGST: pricing.platformGST,
      grandTotal: pricing.grandTotal,
      urgentSurcharge: pricing.urgentSurcharge,
      amount: pricing.grandTotal,
      amountPaid: pricing.grandTotal,
      remainingAmount: 0,
      status: 'paid',
      paymentStatus: 'FULLY_PAID',
      isUrgent: true,
      bookingType: 'urgent',
    });
    const ledger = await PaymentLedger.create({
      bookingId: booking._id,
      amount: pricing.grandTotal,
      paymentType: 'FULL',
      paymentStatus: 'SUCCESS',
      merchantTransactionId: `TX_INV_${_seq}`,
      paidAt: new Date(),
    });

    const inv1 = await generateInvoiceForPayment(booking, ledger, 'Test Pooja');
    const inv2 = await generateInvoiceForPayment(booking, ledger, 'Test Pooja');
    assert.equal(inv2._id.toString(), inv1._id.toString(), 'idempotent');

    const base = inv1.poojaAmount + inv1.kitAmount + inv1.kitGST + inv1.platformFee + inv1.platformGST;
    const breakdownTotal = roundToPaise(base + inv1.urgentSurcharge);
    assert.equal(breakdownTotal, 2008.65);
    assert.equal(inv1.grandTotal, breakdownTotal, 'line items sum to the hiked grand total');
  });

  test('#33 preview ⇄ engine ⇄ booking all agree on the FINAL AUTHORITATIVE urgent amount', async () => {
    await seedSettings({ urgentBookingHikeType: 'percent', urgentBookingHikePercent: 5, urgentBookingHikeFixed: 0 });

    // 1) Preview — same code path the UI uses for isUrgent=true
    const preview = await requestPreview({ isUrgent: 'true' });
    assert.equal(preview.pricing.grandTotal, 1760.85);
    assert.equal(preview.pricing.urgentSurcharge, 83.85);

    // 2) Engine — the authoritative pricing engine invoked at booking time
    const eng = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(eng.grandTotal, preview.pricing.grandTotal);
    assert.equal(eng.urgentSurcharge, preview.pricing.urgentSurcharge);

    // 3) Booking — the exact field set create-phonepe-order writes
    const user = await createUser();
    const pooja = await Pooja.create(buildPooja());
    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'F', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: eng.poojaAmount,
      kitAmount: eng.kitAmount,
      kitGST: eng.kitGST,
      platformFee: eng.platformFee,
      platformGST: eng.platformGST,
      taxAmount: eng.kitGST,
      grandTotal: eng.grandTotal,
      urgentSurcharge: eng.urgentSurcharge,
      urgentHikeType: eng.urgentHikeType,
      urgentHikePercent: eng.urgentHikePercent,
      urgentHikeFixed: eng.urgentHikeFixed,
      amount: eng.grandTotal,
      bookingType: 'urgent',
      isUrgent: true,
    });
    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, preview.pricing.grandTotal, 'booking stores the preview-verified authoritative amount');
    assert.equal(reloaded.urgentSurcharge, preview.pricing.urgentSurcharge);
  });
});