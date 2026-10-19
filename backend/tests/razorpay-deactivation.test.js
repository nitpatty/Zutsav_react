/**
 * Razorpay legacy endpoint deactivation — focused regression.
 *
 * Proves that:
 *   1. POST /api/bookings/create-order      → HTTP 410 with the legacy-gone payload
 *   2. POST /api/bookings/verify-payment    → HTTP 410 with the legacy-gone payload
 *   3. Neither request executes any legacy Razorpay handler or utility code
 *      (poison-pill instrumentation installed before the app is loaded)
 *   4. No Booking/PaymentLedger state is written by those requests
 *   5. The routes sit behind `protect` exactly as before (401 without a token)
 *   6. Active PhonePe booking endpoints are untouched (live handler, not 410)
 *
 * Runs against the real `src/app` over HTTP on an ephemeral port, with a
 * dedicated local test database that is dropped before and after.
 * No live gateway calls: the PhonePe probe uses an unknown transaction id,
 * which short-circuits to 404 before any gateway status check.
 */

process.env.PAYMENT_MODE = 'mock';
process.env.MOCK_PAYMENT_OUTCOME = 'success';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'razorpay-deactivation-test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

/* ── Poison pills: record (and fail) if any Razorpay code runs ─────────────── */

const razorpayCalls = [];
const razorpayUtil = require('../src/utils/razorpay.js');
for (const fn of ['createOrder', 'verifySignature']) {
  const original = razorpayUtil[fn];
  razorpayUtil[fn] = function instrumented(...args) {
    razorpayCalls.push(fn);
    return original.apply(this, args);
  };
}

// Load the controller AFTER wrapping the utility, so its destructured bindings
// capture the instrumented functions. Then wrap the two legacy handlers too —
// if a request ever reaches them, `legacyCalls` records it.
const legacyCalls = [];
const bookingCtrl = require('../src/controllers/booking.controller');
for (const name of ['createBookingOrder', 'verifyPayment']) {
  const original = bookingCtrl[name];
  bookingCtrl[name] = function instrumentedLegacyHandler(...args) {
    legacyCalls.push(name);
    return original.apply(this, args);
  };
}

const Booking       = require('../src/models/Booking');
const PaymentLedger = require('../src/models/PaymentLedger');
const User          = require('../src/models/User');

/* ── App under test (loads routes after instrumentation) ───────────────────── */

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_razorpay_deactivate_test';
const GONE_BODY = { success: false, message: 'Razorpay payments are no longer supported. Use PhonePe.' };

let server, port, token;

const url  = (p) => `http://127.0.0.1:${port}${p}`;
const post = (p, body, tokenOrNull = token) =>
  fetch(url(p), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tokenOrNull ? { Authorization: `Bearer ${tokenOrNull}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();

  const user = await User.create({ name: 'RZ Gone User', email: 'rz-gone@example.com', phone: '9000000099', password: 'secret123' });
  token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const app = require('../src/app');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, () => { port = server.address().port; resolve(); }));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

/* ── 1-2. Both endpoints answer 410 with the exact legacy-gone payload ─────── */

test('POST /api/bookings/create-order returns 410 Gone', async () => {
  const res = await post('/api/bookings/create-order', { poojaId: new mongoose.Types.ObjectId().toString() });
  assert.equal(res.status, 410);
  assert.deepEqual(await res.json(), GONE_BODY);
});

test('POST /api/bookings/verify-payment returns 410 Gone', async () => {
  const res = await post('/api/bookings/verify-payment', {
    bookingId: new mongoose.Types.ObjectId().toString(),
    razorpayOrderId: 'order_should_never_be_verified',
    razorpayPaymentId: 'pay_should_never_be_verified',
    razorpaySignature: 'sig_should_never_be_checked',
  });
  assert.equal(res.status, 410);
  assert.deepEqual(await res.json(), GONE_BODY);
});

/* ── 3-4. No Razorpay handler / util / state logic executed ────────────────── */

test('the 410 responses execute no legacy Razorpay handler, no util function, and write no payment state', async () => {
  const bookingsBefore = await Booking.countDocuments();
  const ledgerBefore   = await PaymentLedger.countDocuments();

  const r1 = await post('/api/bookings/create-order', { poojaId: new mongoose.Types.ObjectId().toString() });
  const r2 = await post('/api/bookings/verify-payment', { bookingId: new mongoose.Types.ObjectId().toString() });
  assert.equal(r1.status, 410);
  assert.equal(r2.status, 410);

  assert.deepEqual(legacyCalls, [], 'a legacy handler (createBookingOrder/verifyPayment) was executed');
  assert.deepEqual(razorpayCalls, [], 'a Razorpay utility function (createOrder/verifySignature) was executed');
  assert.equal(await Booking.countDocuments(), bookingsBefore, 'Booking state must not change');
  assert.equal(await PaymentLedger.countDocuments(), ledgerBefore, 'PaymentLedger state must not change');
});

/* ── 5. Route registration: gone handler only, auth position unchanged ─────── */

test('booking.routes.js registers only legacyRazorpayGone for the two legacy paths', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'booking.routes.js'), 'utf8');
  assert.match(src, /router\.post\('\/create-order',\s+ctrl\.legacyRazorpayGone\)/);
  assert.match(src, /router\.post\('\/verify-payment',\s+ctrl\.legacyRazorpayGone\)/);
  assert.doesNotMatch(src, /ctrl\.createBookingOrder/, 'legacy createBookingOrder must not be registered');
  assert.doesNotMatch(src, /ctrl\.verifyPayment\b/, 'legacy verifyPayment must not be registered');
  assert.match(src, /router\.use\(protect\)/, 'protect must remain mounted');
});

test('the disabled endpoints still require authentication (401 without a token)', async () => {
  assert.equal((await post('/api/bookings/create-order', {}, null)).status, 401);
  assert.equal((await post('/api/bookings/verify-payment', {}, null)).status, 401);
});

/* ── 6. Active PhonePe endpoints untouched ──────────────────────────────────── */

test('active PhonePe booking endpoints remain live and are not disabled', async () => {
  const res = await fetch(url('/api/bookings/verify-phonepe/ZUT_NO_SUCH_TXN_DEACT_TEST'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404, 'PhonePe verify must hit its live handler (unknown txn → 404), not 410');
  assert.notEqual(res.status, 410);
  assert.deepEqual(razorpayCalls, []);
});
