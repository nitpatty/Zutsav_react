/**
 * Forgot Password — Email/WhatsApp OTP flow.
 *
 * Mirrors the existing account-deletion OTP pattern in auth.controller.js
 * exactly (same OTP model, same OtpService, same NotificationEngine call
 * shape) — this is not a second OTP system, it's the fourth `purpose` on
 * the one shared OTP collection ('password_reset').
 */
const User = require('../models/User');
const OTP  = require('../models/OTP');
const OtpService = require('../../notification-engine/otp/OtpService');
const { NotificationEngine } = require('../../notification-engine');
const { normalizeUserPayload } = require('../../notification-engine/variables/PayloadNormalizer');
const { audit } = require('../services/auditService');

const PURPOSE = 'password_reset';
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

async function resolveUser(emailOrPhone) {
  const isPhone = /^[6-9]\d{9}$/.test(String(emailOrPhone || '').trim());
  const query = isPhone ? { phone: emailOrPhone.trim() } : { email: String(emailOrPhone || '').trim().toLowerCase() };
  return User.findOne({ ...query, isDeleted: { $ne: true }, isActive: true });
}

function resolveIdentifier(user, channel) {
  return channel === 'email' ? user.email?.toLowerCase() : user.phone;
}

function isStrongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8
    && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

// POST /api/auth/forgot-password/check-account
exports.checkAccount = async (req, res, next) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) return res.status(400).json({ success: false, message: 'Email or mobile number is required' });

    const user = await resolveUser(emailOrPhone);
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found.' });
    }

    const channels = [];
    if (user.email) channels.push({ type: 'email', masked: maskEmail(user.email) });
    if (user.phone) channels.push({ type: 'whatsapp', masked: maskPhone(user.phone) });

    await audit(req, {
      module: 'auth', action: 'password_reset_requested',
      targetType: 'user', targetId: user._id, targetName: user.name,
      targetEmail: user.email || '', targetPhone: user.phone || '',
    });

    res.json({ success: true, channels });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password/send-otp
exports.sendOtp = async (req, res, next) => {
  try {
    const { emailOrPhone, channel } = req.body;
    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'Channel must be email or whatsapp' });
    }

    const user = await resolveUser(emailOrPhone);
    if (!user) return res.status(404).json({ success: false, message: 'No account found.' });

    const identifier = resolveIdentifier(user, channel);
    if (!identifier) {
      return res.status(400).json({ success: false, message: `No ${channel === 'email' ? 'email address' : 'phone number'} on this account` });
    }

    const otp = OtpService.generate();
    const hashedOtp = await OtpService.hash(otp);
    const existing = await OTP.findOne({ identifier, purpose: PURPOSE });

    if (existing) {
      if (existing.resendCount >= MAX_RESENDS) {
        await audit(req, {
          module: 'auth', action: 'password_reset_blocked', severity: 'warning', status: 'failure',
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
        { $set: { otp: hashedOtp, lastSentAt: new Date(), attempts: 0, verified: false }, $inc: { resendCount: 1 } }
      );
    } else {
      await OTP.create({ identifier, channel, otp: hashedOtp, purpose: PURPOSE, resendCount: 0, lastSentAt: new Date() });
    }

    const eventName = channel === 'email' ? 'PASSWORD_RESET_EMAIL_OTP' : 'PASSWORD_RESET_WHATSAPP_OTP';
    await NotificationEngine.emit(eventName, normalizeUserPayload({ user, otp }), { channel }).catch(() => {});

    await audit(req, {
      module: 'auth', action: 'password_reset_otp_sent',
      targetType: 'user', targetId: user._id, targetName: user.name, note: `Delivery method: ${channel}`,
    });

    res.json({ success: true, message: `OTP sent to your ${channel === 'email' ? 'email' : 'WhatsApp'}` });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password/verify-otp
exports.verifyOtp = async (req, res, next) => {
  try {
    const { emailOrPhone, channel, otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: 'OTP is required' });

    const user = await resolveUser(emailOrPhone);
    if (!user) return res.status(404).json({ success: false, message: 'No account found.' });

    const identifier = resolveIdentifier(user, channel);
    const record = await OTP.findOne({ identifier, purpose: PURPOSE });
    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new code.' });
    }

    if (OtpService.isRateLimited(record.attempts)) {
      await OTP.deleteOne({ _id: record._id });
      await audit(req, {
        module: 'auth', action: 'password_reset_blocked', severity: 'warning', status: 'failure',
        targetType: 'user', targetId: user._id, targetName: user.name, note: 'Too many invalid OTP attempts',
      });
      return res.status(400).json({ success: false, message: 'Too many attempts. Please request a new code.' });
    }

    if (!(await OtpService.compare(String(otp).trim(), record.otp, true))) {
      await OTP.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      await audit(req, {
        module: 'auth', action: 'password_reset_otp_failed', severity: 'warning', status: 'failure',
        targetType: 'user', targetId: user._id, targetName: user.name,
      });
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    await OTP.updateOne({ _id: record._id }, { verified: true });

    await audit(req, {
      module: 'auth', action: 'password_reset_otp_verified',
      targetType: 'user', targetId: user._id, targetName: user.name,
    });

    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password/reset
exports.resetPassword = async (req, res, next) => {
  try {
    const { emailOrPhone, channel, newPassword } = req.body;
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.',
      });
    }

    const user = await resolveUser(emailOrPhone);
    if (!user) return res.status(404).json({ success: false, message: 'No account found.' });

    const identifier = resolveIdentifier(user, channel);
    const record = await OTP.findOne({ identifier, purpose: PURPOSE, verified: true });
    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP verification required. Please verify your code first.' });
    }

    const fullUser = await User.findById(user._id).select('+password');
    fullUser.password = newPassword;      // pre-save hook re-hashes
    fullUser.tokenVersion = (fullUser.tokenVersion || 0) + 1; // invalidate every existing session/token
    await fullUser.save();

    await OTP.deleteOne({ _id: record._id });

    await audit(req, {
      module: 'auth', action: 'password_reset_completed',
      targetType: 'user', targetId: user._id, targetName: user.name, severity: 'warning',
    });

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) { next(err); }
};
