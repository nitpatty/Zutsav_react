const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const User   = require('../models/User');
const Pandit = require('../models/Pandit');
const OTP    = require('../models/OTP');
const Booking       = require('../models/Booking');
const Order         = require('../models/Order');
const Notification  = require('../models/Notification');
const AdminAuditLog = require('../models/AdminAuditLog');
const AdminSession  = require('../models/AdminSession');
const LoginHistory  = require('../models/LoginHistory');
const { isAdminRole } = require('../utils/roleUtils');
const { isSupportedLanguage } = require('../config/languages.config');
const { audit, extractRequestMeta } = require('../services/auditService');
const consentService                 = require('../services/consentService');
const userReferralService            = require('../services/userReferralService');
const walletService                  = require('../services/walletService');
const settings                       = require('../utils/settingsService');
const { NotificationEngine }         = require('../../notification-engine');
const OtpService                     = require('../../notification-engine/otp/OtpService');
const { normalizeUserPayload }       = require('../../notification-engine/variables/PayloadNormalizer');

// `v` (tokenVersion) is embedded so protect()/optionalAuth() can instantly
// invalidate every previously-issued token for a user (see User.js) — used
// by password reset. `rememberMe` controls lifetime only; storage location
// (localStorage vs sessionStorage) is a frontend concern (authStorage.js).
const signToken = (user, rememberMe = true) =>
  jwt.sign(
    { id: user._id, v: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? (process.env.JWT_EXPIRES_IN_REMEMBERED || '30d') : (process.env.JWT_EXPIRES_IN_SESSION || '1d') }
  );

// Admin-tier tokens carry a session id (jti) so a compromised admin session
// can be revoked server-side in real time — see AdminSession + middleware/auth.js.
const signAdminToken = (id) => {
  const sid = crypto.randomUUID();
  const token = jwt.sign({ id, sid }, process.env.JWT_SECRET, {
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '24h',
  });
  return { token, sid };
};

const sendToken = (user, statusCode, res, rememberMe = true) => {
  const token = signToken(user, rememberMe);
  res.status(statusCode).json({ success: true, token, user, rememberMe });
};

const generateOTP = () => OtpService.generate();

// ── POST /api/auth/send-otp ──────────────────────────────────────────────────
exports.sendOTP = async (req, res, next) => {
  try {
    const { name, email, phone, channel } = req.body;

    if (!phone || !email || !name) {
      return res.status(400).json({ success: false, message: 'Name, email, and phone are required' });
    }
    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be email or whatsapp' });
    }

    // Check uniqueness
    if (await User.findOne({ phone })) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const identifier = channel === 'email' ? email.toLowerCase() : phone;
    const otp        = generateOTP();

    // Remove any existing OTP for this identifier/purpose
    await OTP.deleteMany({ identifier, purpose: 'registration' });

    await OTP.create({ identifier, channel, otp, purpose: 'registration' });

    // Send OTP — through the engine only, restricted to the channel the user chose
    await NotificationEngine.emit(
      'OTP_VERIFICATION',
      normalizeUserPayload({ user: { name, email, phone }, otp }),
      { channel }
    ).catch(() => {});

    res.json({ success: true, message: `OTP sent to your ${channel === 'email' ? 'email' : 'WhatsApp'}` });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/verify-otp ────────────────────────────────────────────────
exports.verifyOTP = async (req, res, next) => {
  try {
    const { identifier, otp, purpose = 'registration' } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
    }

    const record = await OTP.findOne({ identifier, purpose });
    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Request a new OTP.' });
    }

    // Limit brute-force
    if (OtpService.isRateLimited(record.attempts)) {
      await OTP.deleteOne({ _id: record._id });
      return res.status(400).json({ success: false, message: 'Too many attempts. Please request a new OTP.' });
    }

    if (!(await OtpService.compare(otp.trim(), record.otp, false))) {
      await OTP.findByIdAndUpdate(record._id, { $inc: { attempts: 1 } });
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    // Mark as verified
    await OTP.findByIdAndUpdate(record._id, { verified: true });

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/complete-registration ─────────────────────────────────────
// OTP-verified registration: name, email, phone, password, channel,
// referralCode, role. Also captures signup-time communication consent
// (serviceConsent / marketingConsent) — separate from OTP verification:
// verifying a WhatsApp OTP proves control of the number (whatsappVerified)
// but never implies marketing consent (see consentService.js).
exports.completeRegistration = async (req, res, next) => {
  try {
    const {
      name, email, phone, password, channel, referralCode, role, preferredLanguage,
      // ── Consent (optional, additive) ──────────────────────────────────
      serviceConsent, marketingConsent,
      serviceConsentText, serviceConsentVersion,
      marketingConsentText, marketingConsentVersion,
    } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Verify the OTP was completed
    const identifier = channel === 'email' ? email.toLowerCase() : phone;
    const otpRecord  = await OTP.findOne({ identifier, purpose: 'registration', verified: true });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP verification required. Please verify your OTP first.' });
    }

    // Uniqueness guards
    if (await User.findOne({ phone })) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const isPandit = role === 'pandit';

    // WhatsApp number verification — the verified OTP record's channel is
    // authoritative. This is proof of control over the number, never consent.
    const whatsappVerified = otpRecord.channel === 'whatsapp';

    // ── Resolve referral code: new system first, then legacy (prevents double attribution) ──
    let referredBy = null;
    let newUserReferralResult = null;
    let referralResolution = null;

    if (referralCode && !isPandit) {
      try {
        referralResolution = await userReferralService.resolveReferralCode(referralCode);
      } catch (err) {
        console.error('[Referral] Code resolution failed:', err.message);
      }
    }

    // ── Create user FIRST (no referral attribution yet) ──────────────────────
    const user = await User.create({
      name, email: email.toLowerCase(), phone, password,
      role: isPandit ? 'pandit' : 'user',
      referredBy: null, // set below after resolution
      ...(whatsappVerified ? { whatsappVerified: true, whatsappVerifiedAt: new Date() } : {}),
      ...(isSupportedLanguage(preferredLanguage) ? { preferredLanguage: preferredLanguage.toLowerCase() } : {}),
    });

    // ── Apply referral attribution (AFTER user exists — safe ordering) ────────
    if (referralResolution) {
      if (referralResolution.type === 'new') {
        // New system: atomically consume code with real userId
        try {
          newUserReferralResult = await userReferralService.consumeCode(referralCode, user._id);
          if (newUserReferralResult) {
            // Set legacy referredBy for backward compatibility
            referredBy = newUserReferralResult.referrerUserId;
            await User.findByIdAndUpdate(user._id, { $set: { referredBy } });

            // Credit +10 coins to referrer's wallet (idempotent)
            const alreadyCredited = await userReferralService.isRegistrationRewardCredited(newUserReferralResult.referralCodeId);
            if (!alreadyCredited) {
              const rewardCoins = await settings.get('userReferralRegistrationRewardCoins', 10);
              if (rewardCoins > 0) {
                const idempotencyKey = `referral_registration_${newUserReferralResult.referralCodeId}`;
                await walletService.credit({
                  userId: newUserReferralResult.referrerUserId,
                  amount: rewardCoins,
                  type: 'REFERRAL_REGISTRATION',
                  description: `Referral Registration Reward — ${user.name} registered via your referral code`,
                  reference: { type: 'USER_REFERRAL', id: newUserReferralResult.referralCodeId },
                  idempotencyKey,
                });
                await userReferralService.markRegistrationRewardCredited(newUserReferralResult.referralCodeId);
              }
            }
          }
        } catch (err) {
          console.error('[Referral] New system consumption failed:', err.message);
        }
      } else if (referralResolution.type === 'legacy') {
        // Legacy system: set referredBy and increment count
        referredBy = referralResolution.referrerId;
        await User.findByIdAndUpdate(user._id, { $set: { referredBy } });
        await User.findByIdAndUpdate(referredBy, { $inc: { referralCount: 1 } });
      }
    }

    // For pandits: create minimal Pandit profile for dashboard access
    if (isPandit) {
      // Check pandit-level uniqueness (separate collection)
      const panditEmailExists = await Pandit.findOne({ email: email.toLowerCase() });
      if (panditEmailExists) {
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ success: false, message: 'Email already registered as pandit' });
      }
      const panditPhoneExists = await Pandit.findOne({ phone });
      if (panditPhoneExists) {
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ success: false, message: 'Phone already registered as pandit' });
      }

      await Pandit.create({
        userId:             user._id,
        name,
        phone,
        email:              email.toLowerCase(),
        status:             'approved',   // immediate dashboard access
        kycStatus:          'not_submitted',
        canReceiveBookings: false,
      });
    }

    // Capture signup-time consent. Runs only AFTER the User (and Pandit, if
    // any) are fully created and every rejection path has passed, so a failed
    // registration never leaves orphaned consent records. Best-effort by
    // design: a consent-write failure must not fail an otherwise-successful
    // account creation (consent can still be captured later via the
    // preference center).
    await captureSignupConsent(req, user, {
      serviceConsent, marketingConsent,
      serviceConsentText, serviceConsentVersion,
      marketingConsentText, marketingConsentVersion,
    });

    // Clean up OTP record
    await OTP.deleteOne({ _id: otpRecord._id });

    NotificationEngine.emit('USER_REGISTERED', normalizeUserPayload({ user })).catch(() => {});

    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
};

/**
 * Record signup-time consent (Phase 1-3 of the WhatsApp consent system).
 *
 * Semantics:
 *  - serviceConsent === true   → whatsapp.service opted_in + OPT_IN event
 *    (source 'signup').
 *  - serviceConsent === false  → whatsapp.service opted_out, state-only,
 *    NO event (a decline at signup is an explicit state, not fabricated
 *    history — the user never opted in).
 *  - serviceConsent undefined  → preference keeps its default service
 *    permission (opted_in, source '') so transactional communication keeps
 *    working; no event (RULE 3 — defaults never generate events).
 *  - marketingConsent === true → whatsapp.marketing opted_in + OPT_IN event
 *    (source 'signup_checkbox').
 *  - marketingConsent !== true → marketing stays not_set; no event. Marketing
 *    is strictly opt-in (RULE 2); absence of consent is not an action.
 *
 * consentText/consentVersion are stored verbatim on events — they are the
 * exact client-approved copy shown to the user (business/legal artifact).
 */
async function captureSignupConsent(req, user, {
  serviceConsent, marketingConsent,
  serviceConsentText, serviceConsentVersion,
  marketingConsentText, marketingConsentVersion,
}) {
  try {
    const { ipAddress, userAgent } = extractRequestMeta(req);
    const base = { userId: user._id, phone: user.phone, ipAddress, userAgent };

    try {
      await consentService.getOrCreatePreference({
        userId: user._id,
        phone: user.phone,
        whatsappVerified: !!user.whatsappVerified,
      });
    } catch (err) {
      console.error('[Consent] Failed to create preference for user', user._id, err.message);
    }

    if (serviceConsent === true) {
      await consentService.recordOptIn({
        ...base,
        purpose: 'service',
        source: 'signup',
        consentText: serviceConsentText || '',
        consentVersion: serviceConsentVersion || '',
      });
    } else if (serviceConsent === false) {
      await consentService.setWhatsAppState({
        userId: user._id,
        phone: user.phone,
        whatsappVerified: !!user.whatsappVerified,
        purpose: 'service',
        status: 'opted_out',
        source: 'signup',
      });
    }

    if (marketingConsent === true) {
      await consentService.recordOptIn({
        ...base,
        purpose: 'marketing',
        source: 'signup_checkbox',
        consentText: marketingConsentText || '',
        consentVersion: marketingConsentVersion || '',
      });
    }
  } catch (err) {
    console.error('[Consent] Failed to capture signup consent for user', user?._id, err.message);
  }
}

// ── POST /api/auth/register (legacy — kept for backward compat / seeding) ────
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role, referralCode, preferredLanguage } = req.body;

    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const phoneExists = await User.findOne({ phone });
    if (phoneExists) return res.status(400).json({ success: false, message: 'Phone number already registered' });

    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) referredBy = referrer._id;
    }

    const user = await User.create({
      name, email, phone, password,
      role:      isAdminRole(role) ? 'user' : (role || 'user'),
      referredBy,
      ...(isSupportedLanguage(preferredLanguage) ? { preferredLanguage: preferredLanguage.toLowerCase() } : {}),
    });

    if (referredBy) {
      await User.findByIdAndUpdate(referredBy, { $inc: { referralCount: 1 } });
    }

    sendToken(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// Failed-login capture is scoped to admin-tier accounts only — logging every
// mistyped customer phone number would grow LoginHistory unboundedly from
// public bot traffic against arbitrary numbers.
const recordFailedAdminLogin = (req, user, reason) => {
  if (!user || !isAdminRole(user.role)) return;
  const meta = extractRequestMeta(req);
  LoginHistory.create({ userId: user._id, event: 'login_failed', reason, ...meta }).catch(() => {});
  User.updateOne({ _id: user._id }, { $inc: { failedLoginCount: 1 } }).catch(() => {});
  audit(req, {
    module: 'auth', action: 'login_failed', severity: 'warning', status: 'failure',
    targetType: 'user', targetId: user._id, targetName: user.name, note: reason,
  }).catch(() => {});
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { emailOrPhone, password, rememberMe } = req.body;
    if (!emailOrPhone || !password)
      return res.status(400).json({ success: false, message: 'Please provide email/phone and password' });

    const isPhone = /^[6-9]\d{9}$/.test(emailOrPhone);
    const query   = isPhone ? { phone: emailOrPhone } : { email: emailOrPhone.toLowerCase() };

    const user = await User.findOne(query).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!(await user.comparePassword(password))) {
      recordFailedAdminLogin(req, user, 'invalid_password');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive || user.isDeleted) {
      recordFailedAdminLogin(req, user, 'account_suspended');
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
    }

    // Account in deletion grace period — allow login but signal frontend to show restore prompt
    if (user.accountStatus === 'deletion_pending') {
      user.password = undefined;
      const token = signToken(user, rememberMe);
      return res.json({
        success:              true,
        token,
        user,
        rememberMe:           !!rememberMe,
        deletionPending:      true,
        deletionRequestedAt:  user.deletionRequestedAt,
        scheduledDeletionDate: user.scheduledDeletionDate,
      });
    }

    user.password = undefined;

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
      req.user = user; // for audit()'s performedBy/performedByName/performedByRole
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

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Only meaningful for admin-tier sessions (regular users have no server-side
// session record to revoke) — a no-op success for everyone else.
exports.logout = async (req, res, next) => {
  try {
    if (req.sid) {
      await AdminSession.updateOne(
        { sid: req.sid },
        { isActive: false, revokedAt: new Date(), revokedBy: req.user._id, revokedReason: 'logout' }
      );
      const meta = extractRequestMeta(req);
      LoginHistory.create({
        userId: req.user._id, event: 'logout', sessionId: req.sid,
        ipAddress: meta.ipAddress, userAgent: meta.userAgent, browser: meta.browser, os: meta.os,
      }).catch(() => {});
      audit(req, { module: 'auth', action: 'logout', targetType: 'user', targetId: req.user._id, targetName: req.user.name }).catch(() => {});
      NotificationEngine.emit('ADMIN_LOGOUT', normalizeUserPayload({ user: req.user })).catch(() => {});
    }
    res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

// Minimal '1d'/'24h'/'7d'-style duration parser — mirrors jsonwebtoken's own
// subset of zeit/ms syntax closely enough for our AdminSession.expiresAt mirror.
function parseExpiryMs(expiry) {
  const match = /^(\d+)([smhd])$/.exec(String(expiry).trim());
  if (!match) return 24 * 60 * 60 * 1000; // fallback: 24h
  const value = Number(match[1]);
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[match[2]];
  return value * unitMs;
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ── PATCH /api/auth/preferred-language ────────────────────────────────────────
// Settings → Preferences → App Language. Role-independent — every
// authenticated user, regardless of role, updates the same field the same way.
exports.updatePreferredLanguage = async (req, res, next) => {
  try {
    const { preferredLanguage } = req.body;
    if (!isSupportedLanguage(preferredLanguage)) {
      return res.status(400).json({ success: false, message: 'Unsupported language' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { preferredLanguage: preferredLanguage.toLowerCase() },
      { new: true }
    );

    res.json({ success: true, preferredLanguage: user.preferredLanguage });
  } catch (err) { next(err); }
};

// ── POST /api/auth/delete-account/check-password ─────────────────────────────
// Step 2 of deletion flow: verify current password before sending OTP
exports.checkDeletionPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });

    res.json({ success: true, message: 'Password verified' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/delete-account/send-otp ───────────────────────────────────
// Step 3 of deletion flow: send OTP to email or WhatsApp
exports.sendDeletionOTP = async (req, res, next) => {
  try {
    const { channel } = req.body;
    const user = req.user;

    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be email or whatsapp' });
    }
    if (channel === 'email' && !user.email) {
      return res.status(400).json({ success: false, message: 'No email address associated with this account' });
    }

    const identifier = channel === 'email' ? user.email.toLowerCase() : user.phone;
    const otp        = generateOTP();

    await OTP.deleteMany({ identifier, purpose: 'account_deletion' });
    await OTP.create({ identifier, channel, otp, purpose: 'account_deletion' });

    // Send OTP — through the engine only, restricted to the channel the user chose
    await NotificationEngine.emit(
      'OTP_VERIFICATION',
      normalizeUserPayload({ user, otp, reason: 'account_deletion' }),
      { channel }
    ).catch(() => {});

    res.json({ success: true, message: `Verification code sent to your ${channel === 'email' ? 'email' : 'WhatsApp'}` });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/delete-account/confirm ────────────────────────────────────
// Step 4 of deletion flow: final confirmation — runs business rules, sets deletion_pending
exports.confirmAccountDeletion = async (req, res, next) => {
  try {
    const { channel } = req.body; // channel tells us which identifier to look up the verified OTP
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Verify OTP was completed for this session
    const identifier = channel === 'email' ? user.email?.toLowerCase() : user.phone;
    const otpRecord  = await OTP.findOne({ identifier, purpose: 'account_deletion', verified: true });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP verification required. Please complete OTP verification first.' });
    }

    // Business rules: block if active bookings exist
    const activeBooking = await Booking.findOne({
      userId: user._id,
      status: { $in: ['paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment', 'completion_requested'] },
    });
    if (activeBooking) {
      return res.status(400).json({
        success: false,
        message: 'Account cannot be deleted because you have active bookings. Please complete or cancel them first.',
        blockedBy: 'bookings',
      });
    }

    // Business rules: block if pending orders exist
    const activeOrder = await Order.findOne({
      userId: user._id,
      status: { $in: ['paid', 'confirmed', 'packed', 'shipped', 'out_for_delivery'] },
    });
    if (activeOrder) {
      return res.status(400).json({
        success: false,
        message: 'Account cannot be deleted because you have pending orders. Please wait for delivery first.',
        blockedBy: 'orders',
      });
    }

    const now = new Date();
    const scheduledDeletionDate = new Date(now);
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 30);

    await User.findByIdAndUpdate(user._id, {
      accountStatus:         'deletion_pending',
      deletionRequestedAt:   now,
      scheduledDeletionDate,
    });

    NotificationEngine.emit(
      'ACCOUNT_DELETION_REQUESTED',
      normalizeUserPayload({ user, scheduledDate: scheduledDeletionDate.toLocaleDateString('en-IN') })
    ).catch(() => {});

    await OTP.deleteOne({ _id: otpRecord._id });

    await AdminAuditLog.create({
      action:          'user_deletion_requested',
      performedBy:     user._id,
      performedByName: user.name,
      targetId:        user._id,
      targetType:      'user',
      targetName:      user.name,
      targetEmail:     user.email || '',
      targetPhone:     user.phone || '',
      note:            'Self-requested via account settings',
    });

    res.json({
      success:              true,
      message:              'Your account has been scheduled for deletion.',
      deletionRequestedAt:  now,
      scheduledDeletionDate,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/delete-account/cancel ─────────────────────────────────────
// Cancels a pending deletion — called after user logs in during grace period
exports.cancelAccountDeletion = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.accountStatus !== 'deletion_pending') {
      return res.status(400).json({ success: false, message: 'No pending deletion request found on this account' });
    }

    await User.findByIdAndUpdate(user._id, {
      accountStatus:         'active',
      deletionRequestedAt:   null,
      scheduledDeletionDate: null,
    });

    NotificationEngine.emit('ACCOUNT_RESTORED', normalizeUserPayload({ user })).catch(() => {});

    res.json({ success: true, message: 'Your account has been successfully restored.' });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/register-pandit ───────────────────────────────────────────
exports.registerPandit = async (req, res, next) => {
  try {
    const {
      name, email, phone, password,
      govtIdType, govtIdNumber,
      pincode, state, city, district, address,
      bio, experience, specializations, languages,
    } = req.body;

    if (!req.file)
      return res.status(400).json({ success: false, message: 'Government ID image is required' });

    if (await User.findOne({ phone }))
      return res.status(400).json({ success: false, message: 'Phone number already registered' });

    if (email && await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ success: false, message: 'Email already in use' });

    if (await Pandit.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ success: false, message: 'Email already registered as pandit' });

    if (await Pandit.findOne({ phone }))
      return res.status(400).json({ success: false, message: 'Phone already registered as pandit' });

    const user = await User.create({
      name, email, phone, password,
      role: 'pandit',
      pincode, state, city, district,
    });

    await Pandit.create({
      userId:       user._id,
      name,
      phone,
      email:        email.toLowerCase(),
      govtIdType,
      govtIdNumber: govtIdNumber || '',
      govtIdImage:  `uploads/govtids/${req.file.filename}`,
      pincode, state, city, district, address,
      bio:             bio || '',
      experience:      experience ? +experience : 0,
      specializations: specializations ? JSON.parse(specializations) : [],
      languages:       languages        ? JSON.parse(languages)        : [],
      status: 'pending',
    });

    const token = signToken(user);
    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      token,
      user,
    });
  } catch (err) {
    next(err);
  }
};
