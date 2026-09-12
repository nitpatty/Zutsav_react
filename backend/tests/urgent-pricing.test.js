/**
 * Tests for the Global Urgent Booking Price Hike feature.
 *
 * BUSINESS RULE (final):
 *   The urgent surcharge is a SEPARATE pricing component computed ONLY from the
 *   ORIGINAL Pooja base price (poojaAmount) — NEVER from platform fee/GST, kit
 *   amount/GST, the gross total, coupon, coins, or the final payable. It is
 *   added to the EXISTING gross grandTotal AFTER the current tax / fee
 *   calculations (poojaAmount + platformFee + platformGST + kitAmount + kitGST)
 *   and BEFORE coupon / coin deductions. It never re-taxes the fee/kit
 *   components and never re-runs the base pricing. Normal bookings are ALWAYS
 *   unaffected, even when a hike is configured.
 *
 *   percent mode → urgentSurcharge = calculatePercentage(poojaAmount, hikePercent)
 *   fixed mode   → urgentSurcharge = roundToPaise(hikeFixed)   (not multiplied)
 *
 *   Example: Pooja ₹2,000 → existing gross ₹2,118 → 1% surcharge ₹20 (NOT
 *   ₹21.18 on the gross) → urgent gross ₹2,138.
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
const WalletTransaction = require('../src/models/WalletTransaction');
const UserWallet = require('../src/models/UserWallet');
const UserReferralCode           = require('../src/models/UserReferralCode');
const UserReferralBookingReward  = require('../src/models/UserReferralBookingReward');

const bookingController = require('../src/controllers/booking.controller');
const settingsController = require('../src/controllers/systemSettings.controller');
const { generateInvoiceForPayment } = require('../src/utils/invoiceGenerator');
const couponService          = require('../src/services/couponService');
const { resolveCoinRedemption } = require('../src/services/coinRedemptionService');
const poojaLoyaltyService    = require('../src/services/poojaLoyaltyService');
const userReferralService    = require('../src/services/userReferralService');

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
    WalletTransaction.deleteMany({}),
    UserWallet.deleteMany({}),
    UserReferralCode.deleteMany({}),
    UserReferralBookingReward.deleteMany({}),
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
    WalletTransaction.init(), UserWallet.init(), UserReferralCode.init(), UserReferralBookingReward.init(),
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

  test('#5 urgent percent 5% → surcharge is 5% of the POOJA BASE and grandTotal includes it', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(p.urgentSurcharge, 75);                       // 5% of poojaAmount 1500
    assert.equal(p.grandTotal, roundToPaise(GROSS_1500 + 75)); // 1752
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
    // poojaAmount=1000.5, platformFee=100.05, platformGST=18.01 → gross=1118.56
    // base surcharge = 10% of 1000.5 = 100.05 (never 10% of the gross 1118.56)
    assert.equal(p.urgentSurcharge, 100.05);
    assert.equal(p.grandTotal, roundToPaise(1118.56 + 100.05)); // 1218.61
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
    assert.equal(p.urgentSurcharge, 75);
    assert.equal(p.grandTotal, 1752);
  });

  test('#12 zero gross can never produce a negative surcharge', () => {
    const p = calculatePricing({ poojaPrice: 0, commissionPercent: 0, commissionFixed: 0, commissionType: 'percent', gstPercent: 0, urgent: true, urgentHikePercent: 5 });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.grandTotal, 0);
  });

  test('#13 grandTotal === finalAmount and both carry the hike', () => {
    const p = calculatePricing({ poojaPrice: 1500, ...COMMISSION, urgent: true, urgentHikePercent: 5 });
    assert.equal(p.finalAmount, p.grandTotal);
    assert.equal(p.grandTotal, 1752);
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

  test('#16 percent hike is based ONLY on the Pooja base — a kit in the gross does NOT change the surcharge', () => {
    // gross with kit = 1500 + 150 + 27 + 200 + 36 = 1913
    const noKit = calculatePricing({ poojaPrice: 1500, kitPrice: 0, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    const withKit = calculatePricing({ poojaPrice: 1500, kitPrice: 200, ...COMMISSION, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(withKit.kitAmount, 200);
    assert.equal(withKit.kitGST, 36);
    assert.equal(withKit.urgentSurcharge, 75, '5% of the Pooja base — same whether or not a kit is present');
    assert.equal(withKit.urgentSurcharge, noKit.urgentSurcharge);
    assert.equal(withKit.grandTotal, 1988); // 1913 + 75
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
    assert.equal(urgent.urgentSurcharge, 75);
    assert.equal(normal.urgentSurcharge, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. PRICING PREVIEW — GET /api/bookings/pricing-preview (DB-backed hooks)
// ═══════════════════════════════════════════════════════════════════════════════
describe('getPricingPreview — isUrgent threading', () => {
  beforeEach(async () => { await cleanDb(); await seedSettings(); });

  test('#19 isUrgent=true + percent hike → surcharge 5% of the Pooja base, kit skipped (urgent)', async () => {
    const body = await requestPreview({ isUrgent: 'true' });
    assert.equal(body.success, true);
    assert.equal(body.pricing.urgentSurcharge, 75);
    assert.equal(body.pricing.grandTotal, 1752);
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
    assert.equal(yes.pricing.urgentSurcharge, 75);
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
    assert.equal(reloaded.grandTotal, 1752);
    assert.equal(reloaded.urgentSurcharge, 75);
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
    assert.equal(invoice.grandTotal, 1752);
    assert.equal(invoice.urgentSurcharge, 75);
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
    assert.equal(breakdownTotal, 1988);
    assert.equal(inv1.grandTotal, breakdownTotal, 'line items sum to the hiked grand total');
  });

  test('#33 preview ⇄ engine ⇄ booking all agree on the FINAL AUTHORITATIVE urgent amount', async () => {
    await seedSettings({ urgentBookingHikeType: 'percent', urgentBookingHikePercent: 5, urgentBookingHikeFixed: 0 });

    // 1) Preview — same code path the UI uses for isUrgent=true
    const preview = await requestPreview({ isUrgent: 'true' });
    assert.equal(preview.pricing.grandTotal, 1752);
    assert.equal(preview.pricing.urgentSurcharge, 75);

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

// ═══════════════════════════════════════════════════════════════════════════════
// E. EXACT CLIENT EXAMPLE — surcharge from the ORIGINAL Pooja base price only
//    Pooja ₹2,000 → existing gross ₹2,118 → 1% surcharge ₹20 → urgent gross ₹2,138
// ═══════════════════════════════════════════════════════════════════════════════
describe('Exact client example — ₹2,000 Pooja + 1% urgent hike', () => {
  // fee = 2000 × 5% = 100, GST = 100 × 18% = 18 → gross = 2118
  const CLIENT_CFG = { poojaPrice: 2000, kitPrice: 0, commissionPercent: 5, commissionFixed: 0, commissionType: 'percent', gstPercent: 18 };

  test('#34 normal booking unchanged — existing gross is exactly ₹2,118', () => {
    const p = calculatePricing(CLIENT_CFG);
    assert.equal(p.poojaAmount, 2000);
    assert.equal(p.platformFee, 100);
    assert.equal(p.platformGST, 18);
    assert.equal(p.kitAmount, 0);
    assert.equal(p.kitGST, 0);
    assert.equal(p.grandTotal, 2118);
    assert.equal(p.urgentSurcharge, 0);
  });

  test('#35 1% urgent → surcharge ₹20 (NOT ₹21.18 on the gross), urgent gross ₹2,138', () => {
    const p = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1 });
    assert.equal(p.urgentSurcharge, 20);        // 2000 × 1% — the ORIGINAL Pooja base
    assert.notEqual(p.urgentSurcharge, 21.18);  // would have been the old gross-based result (2118 × 1%)
    assert.equal(p.grandTotal, 2138);           // 2118 + 20
    assert.equal(p.finalAmount, 2138);
  });

  test('#36 platform fee/GST are NEVER recalculated on the hiked base', () => {
    const p = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1 });
    assert.equal(p.platformFee, 100, 'fee stays 5% of 2000 — never 5% of 2020');
    assert.equal(p.platformGST, 18, 'GST stays 18% of the fee 100 — never recomputed off the surcharge');
    assert.equal(p.poojaAmount, 2000, 'the pricing base itself is untouched');
  });

  test('#37 5% → ₹100 surcharge, 100% → ₹2,000 surcharge, 0% → no surcharge', () => {
    const five = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 5 });
    assert.equal(five.urgentSurcharge, 100);
    assert.equal(five.grandTotal, 2218);
    const all = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 100 });
    assert.equal(all.urgentSurcharge, 2000);
    assert.equal(all.grandTotal, 4118);
    const none = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 0 });
    assert.equal(none.urgentSurcharge, 0);
    assert.equal(none.grandTotal, 2118);
  });

  test('#38 fixed mode — ₹50 → ₹50, ₹500 → ₹500 (never multiplied)', () => {
    const small = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'fixed', urgentHikeFixed: 50 });
    assert.equal(small.urgentSurcharge, 50);
    assert.equal(small.grandTotal, 2168);
    const big = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'fixed', urgentHikeFixed: 500 });
    assert.equal(big.urgentSurcharge, 500);
    assert.equal(big.grandTotal, 2618);
  });

  test('#39 surcharge uses the ORIGINAL Pooja base only — kit/coupon/coin/gross never alter it', () => {
    const noKit  = calculatePricing({ ...CLIENT_CFG, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1 });
    const withKit = calculatePricing({ ...CLIENT_CFG, kitPrice: 200, urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1 });
    assert.equal(withKit.grandTotal, 2374, 'gross with kit = 2118 + 200 + 36 = 2354; +20');
    assert.equal(withKit.urgentSurcharge, noKit.urgentSurcharge, 'surcharge is identical — only the Pooja base matters');
    assert.equal(withKit.urgentSurcharge, 20);
  });

  test('#40 five configured but booking normal → normal booking completely unchanged', () => {
    const p = calculatePricing({ ...CLIENT_CFG, urgent: false, urgentHikeType: 'percent', urgentHikePercent: 1 });
    assert.equal(p.urgentSurcharge, 0);
    assert.equal(p.grandTotal, 2118);
    assert.equal(p.platformFee, 100);
    assert.equal(p.platformGST, 18);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. PRICING PREVIEW PARITY — preview ⇄ engine ⇄ booking for the exact example
// ═══════════════════════════════════════════════════════════════════════════════
describe('Preview parity — ₹2,000 Pooja + 1% hike', () => {
  beforeEach(async () => {
    await cleanDb();
    await seedSettings({
      platformCommissionPercent: 5,
      platformCommissionFixed: 0,
      platformGstPercent: 18,
      urgentBookingHikeType: 'percent',
      urgentBookingHikePercent: 1,
      urgentBookingHikeFixed: 0,
    });
  });

  async function preview2000() {
    const pooja = await Pooja.create({ name: 'Pooja 2000', slug: 'pooja-2000', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    const res = mockRes();
    await bookingController.getPricingPreview({ query: { poojaId: pooja._id.toString(), isUrgent: 'true' } }, res, (e) => { if (e) throw e; });
    return res.body;
  }

  test('#41 preview shows ₹20 urgent surcharge and ₹2,138 total — no display drift', async () => {
    const body = await preview2000();
    assert.equal(body.success, true);
    assert.equal(body.pricing.urgentSurcharge, 20);
    assert.equal(body.pricing.grandTotal, 2138);
  });

  test('#42 preview ⇄ engine ⇄ actual booking all agree at ₹2,138 before coupon/coins', async () => {
    const preview = await preview2000();

    const eng = calculatePricing({
      poojaPrice: 2000, kitPrice: 0,
      commissionPercent: 5, commissionFixed: 0, commissionType: 'percent', gstPercent: 18,
      urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1, urgentHikeFixed: 0,
    });
    assert.equal(eng.urgentSurcharge, preview.pricing.urgentSurcharge);
    assert.equal(eng.grandTotal, preview.pricing.grandTotal);
    assert.equal(eng.grandTotal, 2138);

    const user = await createUser();
    const pooja = await Pooja.create({ name: 'Pooja 2000b', slug: 'pooja-2000b', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'E2K', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: eng.poojaAmount,
      kitAmount: eng.kitAmount,
      kitGST: eng.kitGST,
      platformFee: eng.platformFee,
      platformGST: eng.platformGST,
      grandTotal: eng.grandTotal,
      urgentSurcharge: eng.urgentSurcharge,
      urgentHikeType: eng.urgentHikeType,
      urgentHikePercent: eng.urgentHikePercent,
      amount: eng.grandTotal,
      bookingType: 'urgent',
      isUrgent: true,
    });
    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, preview.pricing.grandTotal);
    assert.equal(reloaded.grandTotal, 2138);
    assert.equal(reloaded.urgentSurcharge, 20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. COUPON — applies AFTER the urgent surcharge using existing CouponService
// ═══════════════════════════════════════════════════════════════════════════════
describe('Coupon after urgent surcharge', () => {
  beforeEach(async () => { await cleanDb(); });

  test('#43 coupon discount is computed against the hiked grand total (existing behavior, unchanged)', async () => {
    // 10% POOJA coupon — same discount engine used at booking time
    const coupon = {
      discountType: 'PERCENTAGE',
      discountValue: 10,
      maxDiscount: 10000,
    };
    const normal  = couponService.calculateDiscount({ ...coupon }, 2118);
    const urgent  = couponService.calculateDiscount({ ...coupon }, 2138);
    assert.equal(normal.discount, 211.8, 'normal booking unchanged');
    assert.equal(urgent.discount, 213.8, 'coupon sees the urgent-inclusive gross 2138');
    assert.equal(urgent.finalPayable, 1924.2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. COINS — existing redemption applied on the post-coupon payable
// ═══════════════════════════════════════════════════════════════════════════════
describe('Coin redemption after coupon on the hiked payable', () => {
  beforeEach(async () => {
    await cleanDb();
    await seedSettings({ coinMonetaryValue: 2, coinRedemptionMinCoins: 0 });
  });

  test('#44 coins apply on the post-coupon hiked payable with existing rules intact', async () => {
    const user = await createUser();
    await UserWallet.create({ userId: user._id, balance: 10, totalEarned: 10, totalRedeemed: 0 });
    const res = await resolveCoinRedemption({ userId: user._id, coinCoins: 5, payable: 1924.2 });
    assert.equal(res.requested, 5);
    assert.equal(res.coinCoinsUsed, 5);
    assert.equal(res.coinValueUsed, 10, '5 coins × ₹2 — existing monetary value untouched');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. LOYALTY COINS — reward base stays the ORIGINAL Pooja amount (not the gross)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Pooja loyalty reward base for urgent bookings', () => {
  beforeEach(async () => {
    await cleanDb();
    await seedSettings({ poojaBookingCoinRewardPercent: 5 });
  });

  test('#45 loyalty reward uses poojaAmount 2000 — never the hiked 2138/2020', async () => {
    const user = await createUser();
    const pooja = await Pooja.create({ name: 'Loyalty Pooja', slug: 'loyalty-pooja', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'L', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: 2000,
      platformFee: 100,
      platformGST: 18,
      grandTotal: 2138,
      urgentSurcharge: 20,
      urgentHikeType: 'percent',
      urgentHikePercent: 1,
      amount: 2138,
      status: 'completed',
      bookingType: 'urgent',
      isUrgent: true,
    });

    const result = await poojaLoyaltyService.grantPoojaLoyaltyReward(booking._id);
    assert.equal(result.granted, true);
    assert.equal(result.baseAmount, 2000, 'reward base is the ORIGINAL Pooja amount');
    assert.equal(result.coins, 100, '5% of 2000 = 100 — NOT 5% of 2138 or 2020');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. HISTORICAL BOOKINGS — the actual surcharge is preserved forever
// ═══════════════════════════════════════════════════════════════════════════════
describe('Historical urgent bookings survive later admin setting changes', () => {
  test('#46 booking keeps its ₹20 surcharge even when the global hike later changes', async () => {
    await cleanDb();
    await seedSettings({ platformCommissionPercent: 5, platformCommissionFixed: 0, platformGstPercent: 18, urgentBookingHikeType: 'percent', urgentBookingHikePercent: 1, urgentBookingHikeFixed: 0 });
    const user = await createUser();
    const pooja = await Pooja.create({ name: 'Hist Pooja', slug: 'hist-pooja', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'H', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: 2000,
      platformFee: 100,
      platformGST: 18,
      grandTotal: 2138,
      urgentSurcharge: 20,
      urgentHikeType: 'percent',
      urgentHikePercent: 1,
      amount: 2138,
      bookingType: 'urgent',
      isUrgent: true,
    });

    await seedSettings({ platformCommissionPercent: 5, platformCommissionFixed: 0, platformGstPercent: 18, urgentBookingHikeType: 'fixed', urgentBookingHikePercent: 0, urgentBookingHikeFixed: 500 });

    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, 2138, 'historical total untouched');
    assert.equal(reloaded.urgentSurcharge, 20, 'historical surcharge retained for audit');
    assert.equal(reloaded.urgentHikePercent, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. CLIENT OVERRIDE — the server-computed surcharge always wins
//    createPhonePeBooking never reads req.body.urgentSurcharge: every pricing
//    field is derived from pricing = calculatePricing(...) server-side and the
//    booking stores exactly those values. Simulated below with an attacker body
//    spread BEFORE the authoritative pricing fields (mirrors the controller).
// ═══════════════════════════════════════════════════════════════════════════════
describe('Client cannot override the urgent surcharge', () => {
  test('#47 attacker-supplied surcharge/total in the body is never persisted', async () => {
    await cleanDb();
    const pricing = calculatePricing({
      poojaPrice: 2000, kitPrice: 0,
      commissionPercent: 5, commissionFixed: 0, commissionType: 'percent', gstPercent: 18,
      urgent: true, urgentHikeType: 'percent', urgentHikePercent: 1, urgentHikeFixed: 0,
    });

    const attackerBody = { urgentSurcharge: 999999, urgentHikePercent: 99, grandTotal: 1, amount: 1, poojaAmount: 1, platformFee: 1, platformGST: 1 };

    const user = await createUser();
    const pooja = await Pooja.create({ name: 'Sec Pooja', slug: 'sec-pooja', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    // Field order mirrors createPhonePeBooking: req.user/pooja/body context first,
    // authoritative `pricing.*` values assigned AFTER, so they always win.
    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'S', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      ...attackerBody,
      poojaAmount:  pricing.poojaAmount,
      platformFee:  pricing.platformFee,
      platformGST:  pricing.platformGST,
      grandTotal:   pricing.grandTotal,
      urgentSurcharge: pricing.urgentSurcharge,
      urgentHikePercent: pricing.urgentHikePercent,
      amount:           pricing.grandTotal,
      bookingType: 'urgent',
      isUrgent: true,
    });

    const reloaded = await Booking.findById(booking._id).lean();
    assert.equal(reloaded.grandTotal, 2138);
    assert.equal(reloaded.urgentSurcharge, 20);
    assert.equal(reloaded.platformFee, 100);
    assert.equal(reloaded.platformGST, 18);
    assert.notEqual(reloaded.urgentSurcharge, 999999);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// L. REFERRAL REWARDS — completely untouched by the urgent surcharge
// ═══════════════════════════════════════════════════════════════════════════════
describe('Referral rewards unaffected by the urgent surcharge', () => {
  beforeEach(async () => { await cleanDb(); await seedSettings(); });

  async function completedBabysitterBooking(userId, poojaId, isUrgent) {
    const pricing = calculatePricing({
      poojaPrice: 2000, kitPrice: 0,
      commissionPercent: 5, commissionFixed: 0, commissionType: 'percent', gstPercent: 18,
      urgent: isUrgent, urgentHikeType: 'percent', urgentHikePercent: 1, urgentHikeFixed: 0,
    });
    return Booking.create({
      userId,
      poojaId,
      userDetails: { name: 'R', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: pricing.poojaAmount,
      platformFee: pricing.platformFee,
      platformGST: pricing.platformGST,
      grandTotal:  pricing.grandTotal,
      urgentSurcharge: pricing.urgentSurcharge,
      urgentHikePercent: pricing.urgentHikePercent,
      amount: pricing.grandTotal,
      status: 'completed',
      bookingType: isUrgent ? 'urgent' : 'normal',
      isUrgent: !!isUrgent,
    });
  }

  test('#48 referral booking reward for urgent === normal (flat, surcharge has no effect)', async () => {
    const referrer = await User.create({ name: 'Referrer A', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const referred = await User.create({ name: 'Referred B', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const pooja = await Pooja.create({ name: 'Ref Pooja', slug: 'ref-pooja', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    const referralCode = await UserReferralCode.create({
      code: 'REF' + Math.random().toString(36).slice(2, 5).toUpperCase(),
      userId: referrer._id,
      usedBy: referred._id,
      status: 'USED',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      rewardedBookingIds: [],
    });

    const normal = await completedBabysitterBooking(referred._id, pooja._id, false);
    const urgent = await completedBabysitterBooking(referred._id, pooja._id, true);
    assert.equal(normal.grandTotal, 2118);
    assert.equal(urgent.grandTotal, 2138);

    const n = await userReferralService.createBookingRewardEligibility(normal._id);
    const u = await userReferralService.createBookingRewardEligibility(urgent._id);
    assert.equal(n.created, true);
    assert.equal(u.created, true);
    assert.equal(n.reward.rewardAmount, u.reward.rewardAmount, 'flat setting-driven amount — urgent surcharge has no effect');
    assert.equal(u.reward.rewardAmount, 50, 'settings.default userReferralBookingRewardCoins');
    assert.ok(referralCode._id, 'referral code exercised');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M. PAYMENT — receives the hiked final amount; verification/retry never re-hike
// ═══════════════════════════════════════════════════════════════════════════════
describe('Payment uses the stored hiked amount (no double-apply)', () => {
  test('#49 stored authoritative amount flows to payment/invoice unchanged', async () => {
    await cleanDb();
    const user = await createUser();
    const pooja = await Pooja.create({ name: 'Pay Pooja', slug: 'pay-pooja', price: 2000, salePrice: 2000, mrp: 2200, isActive: true });
    const booking = await Booking.create({
      userId: user._id,
      poojaId: pooja._id,
      userDetails: { name: 'P', phone: uniqPhone(), address: 'X', pincode: '110001', state: 'UP' },
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      poojaAmount: 2000,
      platformFee: 100,
      platformGST: 18,
      grandTotal: 2138,
      urgentSurcharge: 20,
      urgentHikeType: 'percent',
      urgentHikePercent: 1,
      amount: 2138,
      amountPaid: 2138,
      remainingAmount: 0,
      status: 'paid',
      paymentStatus: 'FULLY_PAID',
      bookingType: 'urgent',
      isUrgent: true,
    });
    const ledger = await PaymentLedger.create({
      bookingId: booking._id,
      amount: booking.grandTotal, // verify/webhook/retry always use the STORED amount
      paymentType: 'FULL',
      paymentStatus: 'SUCCESS',
      merchantTransactionId: `TX_PAY_${_seq}`,
      paidAt: new Date(),
    });
    const invoice = await generateInvoiceForPayment(booking, ledger, 'Test Pooja');
    assert.equal(invoice.grandTotal, 2138, 'payment receives the hiked amount exactly once');
    assert.equal(invoice.urgentSurcharge, 20);
    assert.equal(invoice.totalGST, 18, 'no GST re-derived from the surcharge at payment time');
  });
});