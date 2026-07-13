/**
 * One-off setup: points every OTP-delivery business event's WhatsApp mapping
 * at the single already-approved Authentication template ("whatsapp_verification"),
 * instead of requiring a separate Meta template per event.
 *
 * Rationale (see docs/notification-engine-whatsapp-audit.md): Meta's
 * Authentication category renders a fixed body from toggles, not free text —
 * OTP_VERIFICATION, PASSWORD_RESET, SERVICE_COMPLETION_OTP, and
 * DELIVERY_OTP_SENT would all render identical WhatsApp content regardless of
 * business meaning, so they share one Meta template while remaining four
 * fully independent events in EventRegistry/PayloadNormalizer/NotificationLog.
 *
 * OTP_VERIFICATION's existing mapping (created via the admin UI) is the
 * reference implementation and is left untouched — this script only adds the
 * same shape for the other three events.
 *
 * Run manually via `node src/scripts/seedOtpTemplateMappings.js` from the
 * backend/ directory — NOT run automatically on server boot. Idempotent:
 * upserts by (eventName, channel, recipientType), safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');

const SHARED_TEMPLATE = 'whatsapp_verification'; // the one real, Meta-APPROVED Authentication template
const SHARED_LANGUAGE = 'en'; // matches OTP_VERIFICATION's reference mapping; WhatsAppProvider resolves the true
                               // Meta-synced language code (en_US) from WhatsAppTemplate at send time regardless

// eventName -> whether this event's WhatsApp mapping should be active immediately.
// SERVICE_COMPLETION_OTP and DELIVERY_OTP_SENT already emit from live code paths
// (booking.controller.js, admin.controller.js) — safe to enable now.
// PASSWORD_RESET is registered but has no forgot-password flow anywhere in the
// codebase yet (confirmed in the notification-engine audit) — its mapping is
// seeded now so it's ready the moment that feature ships, but stays disabled
// until then so it can never fire against a non-existent flow.
const EVENTS = [
  { eventName: 'SERVICE_COMPLETION_OTP', enabled: true },
  { eventName: 'DELIVERY_OTP_SENT',      enabled: true },
  { eventName: 'PASSWORD_RESET',         enabled: false },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  for (const { eventName, enabled } of EVENTS) {
    const filter = { eventName, channel: 'whatsapp', recipientType: 'user' };
    const update = {
      $set: {
        whatsappTemplateName: SHARED_TEMPLATE,
        whatsappLanguage:     SHARED_LANGUAGE,
        whatsappVariables:    [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
        whatsappButtonType:        'copy_code',
        whatsappButtonPayloadPath: 'otp.code',
        enabled,
      },
    };
    const result = await NotificationMapping.findOneAndUpdate(filter, update, {
      upsert: true, new: true, setDefaultsOnInsert: true,
    });
    MappingCache.invalidate(eventName);
    console.log(`${enabled ? 'ENABLED ' : 'DISABLED'} ${eventName} -> whatsapp:user -> "${SHARED_TEMPLATE}" (mapping ${result._id})`);
  }

  console.log('\nDone. OTP_VERIFICATION mapping left untouched (reference implementation).');
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
