/**
 * Phase 1 — Email Template Bootstrap (booking + payment emails)
 *
 * Applies ONE additional phase of the Email Phase 1 feature onto a target
 * database. It is intentionally tiny and side-effect-scoped:
 *   - Creates/fills exactly two notification mappings on the `email` channel,
 *     recipientType `user`, purpose `BOOKING`:
 *       • BOOKING_CONFIRMED  → "Booking Confirmed — {{booking.number}}"
 *         (+ shared email shell with footer + "View My Booking" CTA when the
 *         deployment app URL can be safely resolved)
 *       • PAYMENT_SUCCESS    → "Payment Received — {{booking.number}}"
 *   - Is idempotent with the EXACT same fill-if-blank / preserve-custom
 *     contract as bootstrapNotificationMappings.applyEmailEntry (never
 *     overwrites an administrator's existing non-blank subject/html; never
 *     touches the WhatsApp/In-App content of any mapping, other events'
 *     email mappings (OTP/password-reset family), or mappings that are
 *     already configured).
 *   - Invalidates MappingCache for the two event names after any write so the
 *     running server picks up the new/enriched content without a restart.
 *
 * The rendered footer/CTA live in the template HTML itself (a single shared
 * email shell), sourced at boot from production-safe config/settings — see
 * notification-engine/email/EmailRenderContext.js for the safe public URL
 * resolution rules (no localhost/private links ever emitted in production).
 *
 * Run from backend/:  node src/scripts/applyPhase1EmailTemplates.js
 * (expects MONGO_URI / default local mongod; run BEFORE npm test so the
 * integration suite also exercises the bootstrap contract.)
 *
 * v1.0.0 — Phase 1 (first email template phase)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');
const {
  BOOKING_CONFIRMED_ENTRY, PAYMENT_SUCCESS_ENTRY, PURPOSE,
} = require('../../notification-engine/email/phase1EmailTemplates');

const SCRIPT_VERSION = '1.0.0';
const DEFAULT_MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav';
const REPORT_PATH = process.env.PHASE1_EMAIL_REPORT || path.resolve(__dirname, '../../../docs/email-phase1-bootstrap-report.md');

const PHASE1_EMAIL_ENTRIES = [BOOKING_CONFIRMED_ENTRY, PAYMENT_SUCCESS_ENTRY];

/** True when there is nothing to fill (mapping missing on email channel). */
function emailFilter(entry) {
  return { eventName: entry.eventName, recipientType: 'user', channel: 'email' };
}

/**
 * Same fill-if-blank / preserve-custom contract as the verified bootstrap:
 * create when absent, configure when both subject and html are blank, keep
 * an administrator's non-blank content untouched.
 */
async function applyEmailEntry(entry) {
  const filter = emailFilter(entry);
  const existing = await NotificationMapping.findOne(filter);

  const bootstrapFields = {
    emailSubject: entry.emailSubject,
    emailHtml: entry.emailHtml,
    purpose: PURPOSE,
    bootstrapVersion: SCRIPT_VERSION,
  };

  if (!existing) {
    const created = await NotificationMapping.create({
      eventName: entry.eventName,
      recipientType: 'user',
      channel: 'email',
      enabled: true,
      purpose: PURPOSE,
      ...bootstrapFields,
    });
    return { entry: entry.eventName, action: 'created', id: created._id };
  }

  if (!existing.emailSubject && !existing.emailHtml) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    return { entry: entry.eventName, action: 'configured', id: existing._id };
  }

  const matchesReference = existing.emailSubject === entry.emailSubject && existing.emailHtml === entry.emailHtml;
  return { entry: entry.eventName, action: matchesReference ? 'already-correct' : 'preserved-custom', id: existing._id };
}

function buildReportMarkdown(results) {
  const lines = results.map((r) => `- \`${r.entry}\` (user/email) → \`${r.action}\` (\`${r.id}\`)`);
  return `# Phase 1 Email Templates — Bootstrap Report

Generated: ${new Date().toISOString()}
Script version: ${SCRIPT_VERSION}
Database: ${mongoose.connection.name} @ ${mongoose.connection.host}

## Mappings

${lines.join('\n')}

## Contract notes
- Only the two Phase 1 mappings (BOOKING_CONFIRMED, PAYMENT_SUCCESS; channel
  email, recipientType user) are ever written. WhatsApp/In-App content and the
  OTP/password-reset email family are never touched.
- Fill-if-blank and preserve-custom semantics match the verified
  bootstrapNotificationMappings bootstrap. A mapping an administrator already
  customized is reported as \`preserved-custom\` and left untouched.
`;
}

async function run({ leaveConnected = false } = {}) {
  const results = [];
  for (const entry of PHASE1_EMAIL_ENTRIES) {
    const result = await applyEmailEntry(entry);
    results.push(result);
    MappingCache.invalidate(entry.eventName);
    console.log(`${result.action.toUpperCase().padEnd(18)} email  ${result.entry} (${result.id})`);
  }

  if (process.env.PHASE1_EMAIL_NO_REPORT !== '1') {
    fs.writeFileSync(REPORT_PATH, buildReportMarkdown(results));
    console.log(`Report written to ${REPORT_PATH}`);
  }
  return results;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI || DEFAULT_MONGO_URI);
  try {
    await run();
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error('Bootstrap failed:', err); process.exit(1); });
}

module.exports = { run, applyEmailEntry, buildReportMarkdown, PHASE1_EMAIL_ENTRIES };
