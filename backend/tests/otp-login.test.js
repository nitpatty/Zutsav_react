/**
 * Tests for OTP Login (email/phone → OTP → existing-account login).
 *
 *   - POST /api/auth/login/otp/send   (requestLoginOTP)
 *   - POST /api/auth/login/otp/verify (verifyLoginOTP)
 *
 * Uses Node's built-in test runner (node:test) — no framework dependency.
 * Run:  cd backend && npm test   (or: node --test tests/otp-login.test.js)
 *
 * Runs against a dedicated TEST database (MONGO_URI_TEST or
 * mongodb://127.0.0.1:27017/zutsav_otp_login_test) and drops it before and
 * after the run. Never touches dev/prod data.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'otp-login-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_otp_login_test';

const User = require('../src/models/User');
const Pandit = require('../src/models/Pandit');
const OTP = require('../src/models/OTP');
const AdminSession = require('../src/models/AdminSession');
const LoginHistory = require('../src/models/LoginHistory');
const WhatsAppPreference = require('../src/models/WhatsAppPreference');
const WhatsAppConsentEvent = require('../src/models/WhatsAppConsentEvent');
const consentService = require('../src/services/consentService');
const authController = require('../src/controllers/auth.controller');
const otpLoginController = require('../src/controllers/otpLogin.controller');
const OtpService = require('../notification-engine/otp/OtpService');
const { NotificationEngine } = require('../notification-engine');

let _seq = 0;
const uniqPhone = () => String(9_000000000 + (_seq++)); // 9XXXXXXXXX, first digit 9
const uniqEmail = () => `otplogin${Date.now()}_${_seq}@test.zutsav.local`;

let emitCalls = [];
let emittedOtps = [];
const originalEmit = NotificationEngine.emit;

async function cleanCollections() {
  await Promise.all([
    User.deleteMany({}),
    Pandit.deleteMany({}),
    OTP.deleteMany({}),
    AdminSession.deleteMany({}),
    LoginHistory.deleteMany({}),
    WhatsAppPreference.deleteMany({}),
    WhatsAppConsentEvent.deleteMany({}),
  ]);
}

/** Mock Express res for controller-level tests. Explicit res.status(c) wins;
 * handlers that only call res.json(...) resolve with Express's implicit 200. */
function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
  };
  return res;
}

function mockReq(body, headers = {}) {
  return { body, headers, socket: {}, ip: '127.0.0.1', connection: {} };
}

function call(handler, req) {
  const res = mockRes();
  const errOut = [];
  return handler(req, res, (e) => errOut.push(e))
    .then(() => {
      if (errOut.length) throw errOut[0];
      return res;
    });
}

/** Register a user through the EXISTING complete-registration flow. */
async function registerUser(channel, extraBody = {}) {
  const phone = uniqPhone();
  const email = uniqEmail();
  await OTP.create({ identifier: channel === 'email' ? email : phone, channel, otp: '123456', purpose: 'registration', verified: true });
  const res = await call(authController.completeRegistration, mockReq({
    name: 'Test User', email, phone, password: 'secret123', channel, ...extraBody,
  }));
  assert.equal(res.statusCode, 201);
  const user = await User.findOne({ email: email.toLowerCase() });
  return { phone, email, user };
}

/** Send a login OTP for an identifier and return { res, sentOtp }. */
async function sendLoginOtp(emailOrPhone) {
  const before = emittedOtps.length;
  const res = await call(otpLoginController.requestLoginOTP, mockReq({ emailOrPhone }));
  const sentOtp = emittedOtps.length > before ? emittedOtps[emittedOtps.length - 1].otp : null;
  return { res, sentOtp };
}

// ─────────────────────────────────────────────────────────────────────────────

before(async () => {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), WhatsAppPreference.init(), WhatsAppConsentEvent.init()]);
  NotificationEngine.emit = async (name, payload) => {
    emitCalls.push(name);
    // normalizeUserPayload nests the code under otp.code (canonical payload shape).
    if (payload?.otp?.code) emittedOtps.push({ name, otp: payload.otp.code });
  };
});

after(async () => {
  NotificationEngine.emit = originalEmit;
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// ── REQUEST OTP ──────────────────────────────────────────────────────────────

describe('OTP login — request OTP', () => {
  before(async () => { await cleanCollections(); emitCalls = []; emittedOtps = []; });

  test('1. Existing registered phone → OTP sent (whatsapp channel, masked +91)', async () => {
    const { phone } = await registerUser('whatsapp');
    const { res, sentOtp } = await sendLoginOtp(phone);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.found, true);
    assert.equal(res.body.channel, 'whatsapp');
    assert.ok(res.body.masked.includes('91'));
    assert.ok(sentOtp && /^\d{6}$/.test(sentOtp));

    const record = await OTP.findOne({ identifier: phone, purpose: 'login' });
    assert.ok(record);
    assert.notEqual(record.otp, sentOtp); // never stored in plaintext
  });

  test('2. Existing registered email → OTP sent (email channel, masked email)', async () => {
    const { email } = await registerUser('email');
    const { res, sentOtp } = await sendLoginOtp(email);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.found, true);
    assert.equal(res.body.channel, 'email');
    assert.ok(res.body.masked.includes('@'));
    assert.ok(sentOtp);
    const record = await OTP.findOne({ identifier: email.toLowerCase(), purpose: 'login' });
    assert.ok(record);
  });

  test('3. Unknown phone → found:false, no OTP doc, no delivery', async () => {
    const phone = uniqPhone();
    const before = emittedOtps.length;
    const { res } = await sendLoginOtp(phone);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.found, false);
    assert.equal(res.body.success, true);
    assert.equal(await OTP.findOne({ identifier: phone, purpose: 'login' }), null);
    assert.equal(emittedOtps.length, before);
  });

  test('4. Unknown email → found:false', async () => {
    const { res } = await sendLoginOtp(uniqEmail());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.found, false);
  });

  test('5. Invalid identifier format → controlled response (no internal error, no OTP)', async () => {
    // Missing value → validation 400; garbage strings → treated as an email
    // lookup that simply does not exist (found:false), never a crash.
    const missing = await call(otpLoginController.requestLoginOTP, mockReq({ emailOrPhone: '' }));
    assert.equal(missing.statusCode, 400);
    const before = await OTP.countDocuments({ purpose: 'login' });
    for (const bad of ['   ', 'abc', '12345', 'not-an-email', '@x']) {
      const { res } = await sendLoginOtp(bad);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.found, false);
    }
    assert.equal(await OTP.countDocuments({ purpose: 'login' }), before); // no OTPs created
  });

  test('6. Deleted/inactive user → rejected 403, no OTP sent', async () => {
    const { phone, user } = await registerUser('whatsapp');
    await User.updateOne({ _id: user._id }, { isDeleted: true });
    const { res } = await sendLoginOtp(phone);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(await OTP.findOne({ identifier: phone, purpose: 'login' }), null);

    await User.updateOne({ _id: user._id }, { isDeleted: false, isActive: false });
    const res2 = await call(otpLoginController.requestLoginOTP, mockReq({ emailOrPhone: phone }));
    assert.equal(res2.statusCode, 403);
    assert.equal(await OTP.findOne({ identifier: phone, purpose: 'login' }), null);
  });

  test('7. Resend cooldown (60s) blocks immediate resend with wait seconds', async () => {
    const { phone } = await registerUser('whatsapp');
    await sendLoginOtp(phone); // first send → creates record
    const { res } = await sendLoginOtp(phone); // immediate second → cooldown
    assert.equal(res.statusCode, 429);
    assert.ok(/wait \d+s/.test(res.body.message));
  });

  test('8. Resend cap (3) blocks further resends', async () => {
    const { phone } = await registerUser('whatsapp');
    await sendLoginOtp(phone);
    const record = await OTP.findOne({ identifier: phone, purpose: 'login' });
    // Simulate prior resends and an expired cooldown so only the cap gates.
    await OTP.updateOne(
      { _id: record._id },
      { $set: { resendCount: 3, lastSentAt: new Date(Date.now() - 120000) } }
    );
    const { res } = await sendLoginOtp(phone);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.success, false);
  });

  test('10. OTP stored as bcrypt hash — not plaintext, verifiable via OtpService', async () => {
    const { phone } = await registerUser('whatsapp');
    const { sentOtp } = await sendLoginOtp(phone);
    const record = await OTP.findOne({ identifier: phone, purpose: 'login' });
    assert.ok(record.otp.startsWith('$2'));
    assert.notEqual(record.otp, sentOtp);
    assert.equal(await OtpService.compare(sentOtp, record.otp, true), true);
  });
});

// ── VERIFY OTP ───────────────────────────────────────────────────────────────

describe('OTP login — verify OTP', () => {
  before(async () => { await cleanCollections(); emitCalls = []; emittedOtps = []; });

  test('11. Correct OTP → login succeeds, existing JWT format { id, v }', async () => {
    const { phone, user } = await registerUser('whatsapp');
    const { sentOtp } = await sendLoginOtp(phone);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.token);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(decoded.id, String(user._id));
    assert.equal(decoded.v, user.tokenVersion);

    // 17. Session/token shape matches password login exactly.
    assert.equal(res.body.rememberMe, false);
    assert.equal(String(res.body.user._id), String(user._id));
    assert.equal(res.body.user.role, 'user');
    assert.equal(res.body.user.password, undefined);
  });

  test('12. Wrong OTP → rejected, attempts incremented', async () => {
    const { phone, user } = await registerUser('whatsapp');
    await sendLoginOtp(phone);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: '000000' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Invalid OTP/);
    const record = await OTP.findOne({ identifier: phone, purpose: 'login' });
    assert.equal(record.attempts, 1);
    // Wrong OTP does not consume the user.
    assert.equal(await User.countDocuments({ _id: user._id }), 1);
  });

  test('13. Expired/absent OTP → rejected', async () => {
    const { phone } = await registerUser('whatsapp');
    await sendLoginOtp(phone);
    await OTP.deleteMany({ identifier: phone, purpose: 'login' }); // simulate expiry
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: '123456' }));
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /expired or not found/);
  });

  test('14/16. Reused OTP → second verify rejected, OTP consumed after success', async () => {
    const { phone } = await registerUser('whatsapp');
    const { sentOtp } = await sendLoginOtp(phone);
    const first = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(first.statusCode, 200);
    assert.equal(await OTP.countDocuments({ identifier: phone, purpose: 'login' }), 0);

    const second = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(second.statusCode, 400);
    assert.equal(second.body.success, false);
  });

  test('15/37. Excessive verification attempts → locked (OTP deleted after the cap)', async () => {
    const { phone } = await registerUser('whatsapp');
    await sendLoginOtp(phone);
    for (let i = 0; i < 5; i++) { // 1–5 wrong → each increments attempts
      const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: '111111' }));
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
    }
    // 6th attempt → attempts already at the 5-cap → record deleted + locked.
    const locked = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: '111111' }));
    assert.equal(locked.statusCode, 400);
    assert.match(locked.body.message, /Too many attempts/);
    assert.equal(await OTP.findOne({ identifier: phone, purpose: 'login' }), null);
  });

  test('18. Login resolves the SAME existing User — no duplicate creation', async () => {
    const { phone, user } = await registerUser('whatsapp');
    const { sentOtp } = await sendLoginOtp(phone);
    await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(await User.countDocuments({ phone }), 1);
    const reloaded = await User.findById(user._id);
    assert.ok(reloaded);
    assert.equal(String(reloaded._id), String(user._id));
  });

  test('Deletion-pending account → OTP login allowed, returns deletionPending shape', async () => {
    const { phone, user } = await registerUser('whatsapp');
    const now = new Date();
    const scheduled = new Date(now); scheduled.setDate(scheduled.getDate() + 30);
    await User.updateOne({ _id: user._id }, { accountStatus: 'deletion_pending', deletionRequestedAt: now, scheduledDeletionDate: scheduled });
    const { sentOtp } = await sendLoginOtp(phone);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.deletionPending, true);
    assert.ok(res.body.token);
  });
});

// ── REGRESSION ───────────────────────────────────────────────────────────────

describe('Regression — existing systems untouched', () => {
  before(async () => { await cleanCollections(); emitCalls = []; emittedOtps = []; });

  test('19. Password login still works', async () => {
    const { phone } = await registerUser('whatsapp');
    const res = await call(authController.login, mockReq({ emailOrPhone: phone, password: 'secret123' }));
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
  });

  test('20. Registration OTP still works', async () => {
    const phone = uniqPhone();
    const email = uniqEmail();
    const sent = await call(authController.sendOTP, mockReq({ name: 'A', email, phone, channel: 'whatsapp' }));
    assert.equal(sent.statusCode, 200);
    const record = await OTP.findOne({ identifier: phone, purpose: 'registration' });
    const verified = await call(authController.verifyOTP, mockReq({ identifier: phone, otp: record.otp, purpose: 'registration' }));
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.body.success, true);
  });

  test('21. Registration still creates users correctly', async () => {
    const { user } = await registerUser('whatsapp');
    assert.ok(user);
    assert.equal(user.isActive, true);
  });

  test('22. Referral registration still works', async () => {
    const referrer = await User.create({ name: 'Referrer', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const { user } = await registerUser('whatsapp', { referralCode: referrer.referralCode });
    assert.equal(String(user.referredBy), String(referrer._id));
    const updated = await User.findById(referrer._id);
    assert.equal(updated.referralCount, 1);
  });

  test('23/24. OTP login preserves existing referral relationships — no new attribution', async () => {
    const referrer = await User.create({ name: 'Referrer2', email: uniqEmail(), phone: uniqPhone(), password: 'secret123' });
    const { phone, user } = await registerUser('whatsapp', { referralCode: referrer.referralCode });
    assert.equal(String(user.referredBy), String(referrer._id));

    const { sentOtp } = await sendLoginOtp(phone);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(res.statusCode, 200);

    const reloaded  = await User.findById(user._id);
    const referrer2 = await User.findById(referrer._id);
    assert.equal(String(reloaded.referredBy), String(referrer._id)); // unchanged
    assert.equal(referrer2.referralCount, 1);                        // unchanged — login ≠ registration
  });

  test('25/26. Consent state unchanged by OTP login — no events, no marketing opt-in', async () => {
    const phone = uniqPhone();
    const email = uniqEmail();
    await OTP.create({ identifier: phone, channel: 'whatsapp', otp: '123456', purpose: 'registration', verified: true });
    await call(authController.completeRegistration, mockReq({ name: 'C', email, phone, password: 'secret123', channel: 'whatsapp', serviceConsent: true, marketingConsent: false }));
    const user = await User.findOne({ email: email.toLowerCase() });

    await consentService.getOrCreatePreference({ userId: user._id, phone: user.phone, whatsappVerified: true });
    const prefBefore = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    const eventsBefore = await WhatsAppConsentEvent.countDocuments({ userId: user._id });

    const { sentOtp } = await sendLoginOtp(phone);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    assert.equal(res.statusCode, 200);

    const prefAfter = await WhatsAppPreference.findOne({ userId: user._id }).lean();
    assert.equal(prefAfter.whatsapp.marketing.status, 'not_set'); // NO marketing grant
    assert.equal(prefAfter.whatsapp.service.status, prefBefore.whatsapp.service.status);
    assert.equal(await WhatsAppConsentEvent.countDocuments({ userId: user._id }), eventsBefore);
    assert.equal(await consentService.hasMarketingConsent(user._id), false);
  });

  test('27. Authenticated token issued by OTP login passes protect()-style `v` check', async () => {
    const { phone, user } = await registerUser('whatsapp');
    const { sentOtp } = await sendLoginOtp(phone);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: phone, otp: sentOtp }));
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(decoded.id, String(user._id));
    assert.equal(decoded.v, user.tokenVersion); // middleware accepts when v matches
  });

  test('28. Admin password login is unaffected', async () => {
    const admin = await User.create({ name: 'AdminA', email: uniqEmail(), phone: uniqPhone(), password: 'secret123', role: 'admin' });
    const res = await call(authController.login, mockReq({ emailOrPhone: admin.email, password: 'secret123' }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.role, 'admin');
    assert.ok(res.body.token);
  });

  test('Admin OTP login issues an admin token + AdminSession (same path as password login)', async () => {
    const admin = await User.create({ name: 'AdminB', email: uniqEmail(), phone: uniqPhone(), password: 'secret123', role: 'admin' });

    const { sentOtp } = await sendLoginOtp(admin.email);
    const res = await call(otpLoginController.verifyLoginOTP, mockReq({ emailOrPhone: admin.email, otp: sentOtp }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.user.role, 'admin');
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.ok(decoded.sid, 'admin token carries a sid claim');
    assert.equal(decoded.id, String(admin._id));
    assert.equal(await AdminSession.countDocuments({ userId: admin._id, isActive: true }), 1);
  });
});