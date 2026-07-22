/**
 * ONE-OFF DATA FIX (idempotent): resolves the "0/1 configured" incident
 * traced in the client-dump forensic audit (2026-07-22).
 *
 * Root cause (proven by replaying the real Admin UI -> List -> Dry Run code
 * path against the client's restored data, not assumed): a batch operation
 * on 2026-07-21 (three inserts 49 seconds apart, plus one earlier on
 * 2026-07-08) created duplicate NotificationMapping documents for 4
 * event/recipient/channel combinations, each with whatsappTemplateName set
 * but whatsappVariables left empty. getNotificationMappings sorts
 * { eventName: 1, priority: -1, createdAt: -1 } — with priority tied at 0,
 * the newer (broken) document always sorts first, and the Admin UI's
 * NotifEventRow renders mappings in that exact order with no dedup. Every
 * admin opening the top row for these events was opening the broken
 * duplicate; the already-correct sibling mapping sat right below it,
 * unused. No code defect — the checklist logic correctly reported an
 * empty array as empty. This script fixes the data only.
 *
 * For 3 events, a correctly-configured sibling already exists — this
 * script copies its variables onto the broken duplicate (so a dry-run on
 * either row is now accurate) and disables the duplicate (so
 * EventDispatcher's `enabled: true` query never enqueues two jobs for one
 * real trigger). For PASSWORD_RESET_WHATSAPP_OTP/pandit, neither existing
 * document was configured — the older (2026-07-13) one is fixed and kept
 * enabled as the canonical mapping; the newer (2026-07-21) duplicate is
 * fixed too (so a dry-run on it is also accurate) and disabled.
 *
 * Safety properties:
 *   - No document is ever deleted. _id, createdAt, and version history
 *     (NotificationMappingVersion — untouched by this script entirely)
 *     are all preserved.
 *   - Only $set on whatsappVariables / whatsappButtonType /
 *     whatsappButtonPayloadPath / enabled — no other field, no schema
 *     change, no other collection.
 *   - Change-detected: a document already in the target state contributes
 *     to "Already Correct", not "Updated"/"Disabled" — safe to run any
 *     number of times.
 *
 * Run manually via `node src/scripts/fixDuplicateWhatsappMappings.js` from
 * the backend/ directory, with MONGO_URI pointed at the target database.
 *
 * See docs/notification-mapping-fix-report.md for the audit report this
 * script's output was captured into.
 */
const SCRIPT_VERSION = '1.0.0';

require('dotenv').config();
const mongoose = require('mongoose');
const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');

// Each entry: the mapping to repair, the verified-correct whatsappVariables/
// button config to set on it (copied from its healthy sibling / the same
// reference data fixWhatsappVariableMappings.js uses — not re-derived, not
// guessed), and whether it should end up disabled (a redundant duplicate)
// or enabled (the one canonical mapping for that event/recipient/channel).
const FIXES = [
  {
    _id: '6a4dfe2a8e3cd7a304da1f9f', // OTP_VERIFICATION / user — broken duplicate
    eventName: 'OTP_VERIFICATION', recipientType: 'user',
    whatsappVariables: [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
    whatsappButtonType: 'copy_code', whatsappButtonPayloadPath: 'otp.code',
    targetEnabled: false,
    note: 'duplicate — healthy sibling 6a40b3475c89dc5c587ba953 stays the active mapping',
  },
  {
    _id: '6a5f35ec69407f53f7c998ef', // PASSWORD_RESET_WHATSAPP_OTP / user — broken duplicate
    eventName: 'PASSWORD_RESET_WHATSAPP_OTP', recipientType: 'user',
    whatsappVariables: [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
    whatsappButtonType: 'copy_code', whatsappButtonPayloadPath: 'otp.code',
    targetEnabled: false,
    note: 'duplicate — healthy sibling 6a5477fa845402ee16ff3c3c stays the active mapping',
  },
  {
    _id: '6a5f361d69407f53f7c9992e', // BOOKING_CONFIRMED / user — broken duplicate
    eventName: 'BOOKING_CONFIRMED', recipientType: 'user',
    whatsappVariables: [
      { position: 1, payloadPath: 'customer.name', label: 'Customer name' },
      { position: 2, payloadPath: 'booking.poojaName', label: 'Pooja name' },
      { position: 3, payloadPath: 'booking.date', label: 'Date' },
      { position: 4, payloadPath: 'booking.time', label: 'Time' },
      { position: 5, payloadPath: 'booking.number', label: 'Booking number' },
    ],
    targetEnabled: false,
    note: 'duplicate — healthy sibling 6a5370b8746634fc1fb0568e stays the active mapping',
  },
  {
    _id: '6a5487d46f20deb3ef881f13', // PASSWORD_RESET_WHATSAPP_OTP / pandit — older, becomes canonical
    eventName: 'PASSWORD_RESET_WHATSAPP_OTP', recipientType: 'pandit',
    whatsappVariables: [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
    whatsappButtonType: 'copy_code', whatsappButtonPayloadPath: 'otp.code',
    targetEnabled: true,
    note: 'neither existing document was configured — this one (older, 2026-07-13) becomes canonical',
  },
  {
    _id: '6a5f35fa69407f53f7c9990a', // PASSWORD_RESET_WHATSAPP_OTP / pandit — newer duplicate
    eventName: 'PASSWORD_RESET_WHATSAPP_OTP', recipientType: 'pandit',
    whatsappVariables: [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
    whatsappButtonType: 'copy_code', whatsappButtonPayloadPath: 'otp.code',
    targetEnabled: false,
    note: 'duplicate of 6a5487d46f20deb3ef881f13 — fixed for accurate dry-run, then disabled',
  },
];

const sameVariables = (a, b) => JSON.stringify(a || []) === JSON.stringify(b);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);
  console.log(`fixDuplicateWhatsappMappings.js v${SCRIPT_VERSION}`);
  console.log(`Repairing ${FIXES.length} known-affected NotificationMapping document(s)\n`);

  const stats = { updated: 0, disabled: 0, alreadyCorrect: 0, skipped: 0 };
  const modifiedIds = [];
  const disabledIds = [];
  const skipped = [];

  for (const fix of FIXES) {
    const before = await NotificationMapping.findById(fix._id).lean();

    if (!before) {
      console.log(`SKIP    ${fix._id} — document not found on this database`);
      skipped.push({ id: fix._id, reason: 'not found' });
      stats.skipped++;
      continue;
    }
    if (before.eventName !== fix.eventName || before.recipientType !== fix.recipientType) {
      console.log(`SKIP    ${fix._id} — eventName/recipientType on this database ("${before.eventName}"/"${before.recipientType}") doesn't match what this fix expects ("${fix.eventName}"/"${fix.recipientType}"); not touching an unverified document`);
      skipped.push({ id: fix._id, reason: 'identity mismatch' });
      stats.skipped++;
      continue;
    }

    const variablesChanged = !sameVariables(before.whatsappVariables, fix.whatsappVariables)
      || (fix.whatsappButtonType && before.whatsappButtonType !== fix.whatsappButtonType)
      || (fix.whatsappButtonPayloadPath && before.whatsappButtonPayloadPath !== fix.whatsappButtonPayloadPath);
    const enabledChanged = before.enabled !== fix.targetEnabled;

    if (!variablesChanged && !enabledChanged) {
      console.log(`OK      ${fix.eventName}/${fix.recipientType} (${fix._id}) — already correct, no change needed`);
      stats.alreadyCorrect++;
      continue;
    }

    const update = {};
    if (variablesChanged) {
      update.whatsappVariables = fix.whatsappVariables;
      if (fix.whatsappButtonType) update.whatsappButtonType = fix.whatsappButtonType;
      if (fix.whatsappButtonPayloadPath) update.whatsappButtonPayloadPath = fix.whatsappButtonPayloadPath;
    }
    if (enabledChanged) update.enabled = fix.targetEnabled;

    // $set only — createdAt is never touched; updatedAt advances naturally
    // (schema timestamps), which is correct since a real change occurred.
    await NotificationMapping.findByIdAndUpdate(fix._id, { $set: update });
    MappingCache.invalidate(fix.eventName);

    console.log(`REPAIR  ${fix.eventName}/${fix.recipientType} (${fix._id})`);
    console.log(`          BEFORE: whatsappVariables=${JSON.stringify(before.whatsappVariables)}  enabled=${before.enabled}`);
    console.log(`          AFTER:  whatsappVariables=${JSON.stringify(variablesChanged ? fix.whatsappVariables : before.whatsappVariables)}  enabled=${fix.targetEnabled}`);
    console.log(`          ${fix.note}`);

    if (variablesChanged) { stats.updated++; modifiedIds.push(fix._id); }
    if (enabledChanged) {
      stats.disabled += fix.targetEnabled === false ? 1 : 0;
      if (fix.targetEnabled === false) disabledIds.push(fix._id);
    }
  }

  console.log('\n================ SUMMARY ================');
  console.log(`Modified _id(s) (whatsappVariables/button updated): ${modifiedIds.length ? modifiedIds.join(', ') : 'none'}`);
  console.log(`Disabled duplicate _id(s):                          ${disabledIds.length ? disabledIds.join(', ') : 'none'}`);
  console.log(`Skipped _id(s):                                     ${skipped.length ? skipped.map(s => `${s.id} (${s.reason})`).join(', ') : 'none'}`);
  console.log('\n================ STATISTICS ================');
  console.log(`Updated:         ${stats.updated}`);
  console.log(`Disabled:        ${stats.disabled}`);
  console.log(`Already Correct: ${stats.alreadyCorrect}`);
  console.log(`Skipped:         ${stats.skipped}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
