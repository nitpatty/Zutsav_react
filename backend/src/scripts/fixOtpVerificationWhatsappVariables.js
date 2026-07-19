/**
 * ONE-OFF DATA FIX (idempotent): repairs NotificationMapping.whatsappVariables
 * for OTP_VERIFICATION's WhatsApp mapping(s) on whichever database this
 * script is pointed at (via MONGO_URI).
 *
 * Root cause: OTP_VERIFICATION's WhatsApp mapping was hand-configured once,
 * directly through the admin UI, against a single database (local/dev) —
 * this is pure admin-configured runtime data (NotificationMapping documents),
 * not code, and nothing propagates it between environments automatically.
 * Production's equivalent row(s) were left at the schema default
 * (`whatsappVariables: []`), so the WhatsApp Test/Dry-Run screen and the
 * real send-time guard in WhatsAppChannel.buildVariableChecklist() both
 * correctly report "Template expects 1 variable(s) but this mapping has 0
 * configured" — the code is identical in both environments; only the
 * stored document differs. No code change is required; this script brings
 * production's data in line with the already-correct local configuration.
 *
 * Scoped ONLY to OTP_VERIFICATION's whatsappVariables field — every other
 * field on the mapping (whatsappTemplateName, whatsappLanguage, button
 * config, enabled, etc.) is left untouched since those already work today.
 *
 * OTP_VERIFICATION has both `user` and `pandit` recipientType mappings
 * (registration/account-deletion OTP for users, service-completion OTP
 * context for pandits) — both are fixed here.
 *
 * Run manually via `node src/scripts/fixOtpVerificationWhatsappVariables.js`
 * from the backend/ directory, with MONGO_URI pointed at the target
 * database (production or local). Idempotent — only $sets one field, safe
 * to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');

const EVENT_NAME = 'OTP_VERIFICATION';
const CORRECT_VARIABLES = [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);

  const mappings = await NotificationMapping.find({ eventName: EVENT_NAME, channel: 'whatsapp' });

  if (mappings.length === 0) {
    console.log(`SKIP — no whatsapp mapping exists yet for ${EVENT_NAME} on this database.`);
  }

  for (const mapping of mappings) {
    const before = mapping.whatsappVariables.length;
    mapping.whatsappVariables = CORRECT_VARIABLES;
    await mapping.save();
    console.log(`FIXED  ${EVENT_NAME} (${mapping.recipientType}) — whatsappVariables: ${before} -> ${mapping.whatsappVariables.length} (mapping ${mapping._id})`);
  }

  MappingCache.invalidate(EVENT_NAME);
  console.log(`\nDone. ${mappings.length} mapping(s) updated.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
