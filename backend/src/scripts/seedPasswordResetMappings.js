/**
 * One-off setup (idempotent, safe to re-run): creates the NotificationMapping
 * rows for the two new password-reset OTP events, and disables the old
 * generic PASSWORD_RESET mapping/event it replaces (see EventRegistry.js —
 * that event was seeded earlier as a placeholder before this feature existed
 * and is now superseded by the channel-specific events below).
 *
 * WhatsApp reuses the same shared Authentication template ("whatsapp_verification")
 * every other OTP event in this codebase uses (OTP_VERIFICATION, SERVICE_COMPLETION_OTP,
 * DELIVERY_OTP_SENT) — see seedOtpTemplateMappings.js for the precedent this follows.
 *
 * Run manually via `node src/scripts/seedPasswordResetMappings.js` from the
 * backend/ directory — NOT run automatically on server boot.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');

const WHATSAPP_OTP_TEMPLATE = 'whatsapp_verification';

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // ── Retire the old dormant generic event/mapping ──────────────────────
  const disabledOld = await NotificationMapping.updateMany(
    { eventName: 'PASSWORD_RESET' },
    { $set: { enabled: false } }
  );
  MappingCache.invalidate('PASSWORD_RESET');
  console.log(`Disabled ${disabledOld.modifiedCount} old PASSWORD_RESET mapping(s) (superseded).`);

  // ── PASSWORD_RESET_EMAIL_OTP ───────────────────────────────────────────
  const emailResult = await NotificationMapping.findOneAndUpdate(
    { eventName: 'PASSWORD_RESET_EMAIL_OTP', channel: 'email', recipientType: 'user' },
    {
      $set: {
        emailSubject: 'Your Zutsav Password Reset Code',
        emailHtml: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🔐 Zutsav — Password Reset</h2>
          <p>Hi <strong>{{customer.name}}</strong>,</p>
          <p>Your Zutsav password reset code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>.</p>
          <p style="color:#6b7280;font-size:14px">If you didn't request this, please ignore this message — your password will not be changed.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>`,
        enabled: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  MappingCache.invalidate('PASSWORD_RESET_EMAIL_OTP');
  console.log(`PASSWORD_RESET_EMAIL_OTP -> email:user mapping ready (${emailResult._id}).`);

  // ── PASSWORD_RESET_WHATSAPP_OTP ────────────────────────────────────────
  const waResult = await NotificationMapping.findOneAndUpdate(
    { eventName: 'PASSWORD_RESET_WHATSAPP_OTP', channel: 'whatsapp', recipientType: 'user' },
    {
      $set: {
        whatsappTemplateName: WHATSAPP_OTP_TEMPLATE,
        whatsappLanguage: 'en',
        whatsappVariables: [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
        whatsappButtonType: 'copy_code',
        whatsappButtonPayloadPath: 'otp.code',
        enabled: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  MappingCache.invalidate('PASSWORD_RESET_WHATSAPP_OTP');
  console.log(`PASSWORD_RESET_WHATSAPP_OTP -> whatsapp:user mapping ready (${waResult._id}), template "${WHATSAPP_OTP_TEMPLATE}".`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
