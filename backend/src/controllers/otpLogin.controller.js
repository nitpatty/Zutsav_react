/**
 * OTP Login — email/phone → OTP → existing-account login.
 *
 * Fifth `purpose` on the one shared OTP collection ('login'). Reuses the exact
 * OTP mechanics of passwordReset.controller.js (bcrypt-hashed OTP, 60s resend
 * cooldown, 3-resend cap, 5-attempt cap, TTL 600s) and the exact token/session
 * issuance of auth.controller.js login (JWT `{ id, v }` — admin-tier tokens get
 * a sid + AdminSession, everyone else gets the plain access token). This is
 * deliberately NOT a second OTP system and NOT a second JWT format.
 *
 * OTP login is authentication, never registration:
 *  - an unknown identifier never creates a User;
 *  - no referral attribution / +10 wallet reward / consent records are created;
 *  - no marketing consent is granted (login ≠ consent; see services/consentService.js).
 *
 * Per the confirmed product requirement the send endpoint discloses existence
 * via { found } so the UI can show the "not registered — would you like to
 * register?" prompt. This is an accepted enumeration trade-off, blunted by a
 * dedicated 10/15min IP limiter (routes/otpLogin.routes.js), uniform 200
 * responses, and zero account-detail leakage (no ids, no verification status).
 */
const User = require('../models/User');
const OTP  = require('../models/OTP');
const AdminSession = require('../models/AdminSession');
const LoginHistory = require('../models/LoginHistory');

const OtpService = require('../../notification-engine/otp/OtpService');
const { NotificationEngine } = require('../../notification-engine');
const { normalizeUserPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const { audit, extractRequestMeta } = require('../services/auditService');
const { isAdminRole } = require('../utils/roleUtils');
const { signToken, signAdminToken, sendToken, parseExpiryMs } = require('./auth.controller');

const PURPOSE = 'login';
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_RESENDS = 3;

function maskEmail(email) {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(3, name.length - 1))}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return '';
  const last4 = phone.slice(-4);
  return `+91 ${'*'.repeat(Math.max(3, phone.length - 4))}${last4}`;
}

// Identifier normalization mirrors auth.controller.js login exactly — phone
// must be a valid `^[6-9]\d{9}$` 10-digit Indian number, everything else is
// treated as an email (trimmed + lowercased, the User model's own convention).
function inferChannel(emailOrPhone) {
  return String(emailOrPhone || '').trim().includes('@') ? 'email' : 'whatsapp';
}

async function findByIdentifier(emailOrPhone) {
  const isPhone = /^[6-9]\d{9}$/.test(String(emailOrPhone || '').trim());
  const query = isPhone
    ? { phone: String(emailOrPhone).trim() }
    : { email: String(emailOrPhone || '').trim().toLowerCase() };
  return User.findOne(query);
}

function resolveIdentifier(user, channel) {
  return channel === 'email' ? user.email?.toLowerCase() : user.phone;
}

// POST /api/auth/login/otp/send
exports.requestLoginOTP = async (req, res, next) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) {
      return res.status(400).json({ success: false, message: 'Email or mobile number is required' });
    }

    const user = await findByIdentifier(emailOrPhone);
    if (!user) {
      // Existence disclosure is the accepted product requirement — see file header.
      return res.json({ success: true, found: false, message: 'No account found with this email/phone.' });
    }

    // Same account-status policy as password login: deleted/suspended accounts
    // are rejected before any OTP is generated or delivered.
    if (user.isDeleted || !user.isActive) {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
    }

    const channel    = inferChannel(emailOrPhone);
    const identifier = resolveIdentifier(user, channel);
    if (!identifier) {
      return res.status(400).json({ success: false, message: `No ${channel === 'email' ? 'email address' : 'phone number'} on this account` });
    }

    const otp        = OtpService.generate();
    const hashedOtp  = await OtpService.hash(otp);
    const existing   = await OTP.findOne({ identifier, purpose: PURPOSE });

    if (existing) {
      if (existing.resendCount >= MAX_RESENDS) {
        await audit(req, {
          module: 'auth', action: 'otp_login_blocked', severity: 'warning', status: 'failure',
          targetType: 'user', targetId: user._id, targetName: user.name, note: 'Maximum resend attempts reached',
        });
        return res.status(429).json({ success: false, message: 'Maximum resend attempts reached. Please try again later.' });
      }
      const sinceLastSend = Date.now() - new Date(existing.lastSentAt).getTime();
      if (sinceLastSend < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - sinceLastSend) / 1000);
        return res.status(429).json({ success: false, message: `Please wait ${waitSec}s before requesting another code.` });
      }
      await OTP.updateOne(
        { _id: existing._id },
        { $set: { otp: hashedOtp, channel, lastSentAt: new Date(), attempts: 0, verified: false }, $inc: { resendCount: 1 } }
      );
    } else {
      await OTP.create({ identifier, channel, otp: hashedOtp, purpose: PURPOSE, resendCount: 0, lastSentAt: new Date() });
    }

    await NotificationEngine.emit('OTP_VERIFICATION', normalizeUserPayload({ user, otp }), { channel }).catch(() => {});

    await audit(req, {
      module: 'auth', action: 'otp_login_otp_sent',
      targetType: 'user', targetId: user._id, targetName: user.name, note: `Delivery method: ${channel}`,
    });

    const masked = channel === 'email' ? maskEmail(user.email) : maskPhone(user.phone);
    res.json({ success: true, found: true, channel, masked, message: `OTP sent to your ${channel === 'email' ? 'email' : 'WhatsApp'}` });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login/otp/verify
exports.verifyLoginOTP = async (req, res, next) => {
  try {
    const { emailOrPhone, otp, rememberMe } = req.body;
    if (!emailOrPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Email/phone and OTP are required' });
    }

    const user = await findByIdentifier(emailOrPhone);
    if (!user) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new code.' });
    }

    // Same account-status policy as password login is enforced at verification
    // time too — an account suspended/deleted after the OTP was sent is rejected.
    if (user.isDeleted || !user.isActive) {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
    }

    const channel    = inferChannel(emailOrPhone);
    const identifier = resolveIdentifier(user, channel);
    const record     = await OTP.findOne({ identifier, purpose: PURPOSE });
    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new code.' });
    }

    if (OtpService.isRateLimited(record.attempts)) {
      await OTP.deleteOne({ _id: record._id });
      await audit(req, {
        module: 'auth', action: 'otp_login_blocked', severity: 'warning', status: 'failure',
        targetType: 'user', targetId: user._id, targetName: user.name, note: 'Too many invalid OTP attempts',
      });
      return res.status(400).json({ success: false, message: 'Too many attempts. Please request a new code.' });
    }

    if (!(await OtpService.compare(String(otp).trim(), record.otp, true))) {
      await OTP.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      await audit(req, {
        module: 'auth', action: 'otp_login_failed', severity: 'warning', status: 'failure',
        targetType: 'user', targetId: user._id, targetName: user.name,
      });
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    // Atomic single-use: flip verified → true only if it is still false. A
    // concurrent request that already consumed this OTP gets modifiedCount 0
    // and is rejected — the same OTP can never log two sessions in.
    const consumed = await OTP.updateOne(
      { _id: record._id, verified: false },
      { $set: { verified: true } }
    );
    if (consumed.modifiedCount !== 1) {
      return res.status(400).json({ success: false, message: 'OTP already used. Please request a new code.' });
    }
    // Fully consume the record — it is single-use and must never replay.
    await OTP.deleteOne({ _id: record._id });

    user.password = undefined;

    // Account in the 30-day deletion grace period — same shape as password login.
    if (user.accountStatus === 'deletion_pending') {
      const token = signToken(user, !!rememberMe);
      return res.json({
        success: true, token, user, rememberMe: !!rememberMe,
        deletionPending: true,
        deletionRequestedAt: user.deletionRequestedAt,
        scheduledDeletionDate: user.scheduledDeletionDate,
      });
    }

    // Admin-tier accounts get the same sid + AdminSession treatment as password
    // login (revocable server-side sessions, LoginHistory + audit trail).
    if (isAdminRole(user.role)) {
      const { token, sid } = signAdminToken(user._id);
      const meta = extractRequestMeta(req);
      const expiresAt = new Date(Date.now() + parseExpiryMs(process.env.ADMIN_JWT_EXPIRES_IN || '24h'));

      await AdminSession.create({
        sid, userId: user._id, expiresAt,
        ipAddress: meta.ipAddress, userAgent: meta.userAgent, browser: meta.browser, os: meta.os,
      });
      await User.updateOne({ _id: user._id }, {
        lastLoginAt: new Date(), lastLoginIP: meta.ipAddress, failedLoginCount: 0,
      });
      LoginHistory.create({
        userId: user._id, event: 'login_success', sessionId: sid,
        ipAddress: meta.ipAddress, userAgent: meta.userAgent, browser: meta.browser, os: meta.os,
      }).catch(() => {});
      req.user = user;
      req.sid = sid;
      audit(req, { module: 'auth', action: 'login', targetType: 'user', targetId: user._id, targetName: user.name }).catch(() => {});
      NotificationEngine.emit('ADMIN_LOGIN', normalizeUserPayload({ user })).catch(() => {});

      return res.status(200).json({ success: true, token, user });
    }

    sendToken(user, 200, res, !!rememberMe);
  } catch (err) {
    next(err);
  }
};