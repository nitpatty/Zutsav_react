/**
 * All Transactional Email Templates — master idempotent bootstrap.
 *
 * Brings any target database (new or existing) up to the same verified set of
 * transactional `email`-channel NotificationMappings in ONE run, from the
 * declarative registry in
 * notification-engine/email/allTransactionalEmailTemplates.js.
 *
 * Contract (mirrors bootstrapNotificationMappings.applyEmailEntry exactly):
 *   - Only entries marked `status: 'APPROVED_FOR_BOOTSTRAP'` are ever written.
 *   - Mapping absent  -> CREATE it (enabled:true, purpose = registry purpose).
 *   - Mapping present with BOTH emailSubject and emailHtml blank
 *         -> FILL them in (non-destructive) + fill a blank/UNKNOWN purpose.
 *   - Mapping present with non-blank content
 *         -> if it exactly matches the registry reference: ALREADY-CORRECT
 *            (no write); otherwise PRESERVED-CUSTOM (never overwritten).
 *   - A disabled mapping is NEVER auto-enabled; an explicit non-UNKNOWN
 *     purpose is NEVER overwritten; WhatsApp/In-App content is never touched.
 *   - MappingCache is invalidated per event after any real write.
 *
 * Modes:
 *   --apply     perform the writes.
 *   --dry-run   (default) compute + report only; zero writes.
 *
 * Report: docs/email-all-transactional-bootstrap-report.md (unless
 * BOOTSTRAP_EMAILS_NO_REPORT=1).
 *
 * Run from backend/:
 *   node src/scripts/bootstrapAllTransactionalEmailTemplates.js --dry-run
 *   node src/scripts/bootstrapAllTransactionalEmailTemplates.js --apply
 *
 * v1.0.0 — all-transactional email bootstrap phase
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');
const {
  STATUS,
  TRANSACTIONAL_EMAIL_TEMPLATES,
  APPROVED_EMAIL_TEMPLATES,
} = require('../../notification-engine/email/allTransactionalEmailTemplates');

const SCRIPT_VERSION = '1.0.0';
const DEFAULT_MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav';
const REPORT_PATH = process.env.BOOTSTRAP_EMAILS_REPORT || path.resolve(__dirname, '../../../docs/email-all-transactional-bootstrap-report.md');

const ACTIONS = {
  CREATED: 'CREATED',
  ALREADY_CORRECT: 'ALREADY-CORRECT',
  UPDATED: 'UPDATED-NONDESTRUCTIVELY',
  PRESERVED_CUSTOM: 'PRESERVED-CUSTOM',
  SKIPPED_BLOCKED: 'SKIPPED-BLOCKED',
  SKIPPED_NOT_REACHABLE: 'SKIPPED-NOT-REACHABLE',
  SKIPPED_NOT_VERIFIED: 'SKIPPED-NOT-VERIFIED',
  ERROR: 'ERROR',
};

function emailFilter(entry) {
  return { eventName: entry.eventName, recipientType: entry.recipientType, channel: 'email' };
}

/**
 * Purpose fill-if-blank contract (same as bootstrapNotificationMappings):
 * only fill when the existing purpose is blank/UNKNOWN; an explicit
 * non-UNKNOWN purpose is an admin decision and is preserved.
 */
function purposeDelta(entry, existing) {
  const purpose = entry.purpose || 'UNKNOWN';
  if (!existing.purpose || existing.purpose === 'UNKNOWN') {
    return { fields: { purpose }, action: 'purpose-set' };
  }
  if (existing.purpose === purpose) return { fields: {}, action: 'purpose-matches' };
  return { fields: {}, action: 'purpose-preserved' };
}

/**
 * Apply one approved entry. `dryRun` computes the action without writing.
 * Returns { eventName, recipientType, purpose, action, id, purposeAction }.
 */
async function applyEmailEntry(entry, { dryRun = false } = {}) {
  const filter = emailFilter(entry);
  const existing = await NotificationMapping.findOne(filter);

  const bootstrapFields = {
    emailSubject: entry.emailSubject,
    emailHtml: entry.emailHtml,
    bootstrapVersion: SCRIPT_VERSION,
    bootstrappedAt: new Date(),
  };

  const base = {
    eventName: entry.eventName,
    recipientType: entry.recipientType,
    purpose: entry.purpose,
    id: existing ? existing._id : null,
  };

  if (!existing) {
    if (dryRun) return { ...base, action: ACTIONS.CREATED, dryRun: true, purposeAction: 'purpose-created' };
    const created = await NotificationMapping.create({
      eventName: entry.eventName,
      recipientType: entry.recipientType,
      channel: 'email',
      enabled: true,
      purpose: entry.purpose || 'UNKNOWN',
      ...bootstrapFields,
    });
    return { ...base, id: created._id, action: ACTIONS.CREATED, purposeAction: 'purpose-created' };
  }

  if (!existing.emailSubject && !existing.emailHtml) {
    const { fields, action: purposeAction } = purposeDelta(entry, existing);
    if (dryRun) return { ...base, action: ACTIONS.UPDATED, dryRun: true, purposeAction };
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: { ...bootstrapFields, ...fields } });
    return { ...base, action: ACTIONS.UPDATED, purposeAction };
  }

  const matchesReference = existing.emailSubject === entry.emailSubject
    && existing.emailHtml === entry.emailHtml;
  const result = {
    ...base,
    action: matchesReference ? ACTIONS.ALREADY_CORRECT : ACTIONS.PRESERVED_CUSTOM,
  };

  const { fields, action: purposeAction } = purposeDelta(entry, existing);
  result.purposeAction = purposeAction;
  if (!dryRun && Object.keys(fields).length) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: fields });
  }
  return result;
}

/** Map a non-approved registry entry to its report category. */
function excludedAction(entry) {
  if (entry.status === STATUS.BLOCKED) return ACTIONS.SKIPPED_BLOCKED;
  return entry.reachable === false ? ACTIONS.SKIPPED_NOT_REACHABLE : ACTIONS.SKIPPED_NOT_VERIFIED;
}

function tally(results) {
  const counts = {};
  for (const r of results) counts[r.action] = (counts[r.action] || 0) + 1;
  return counts;
}

function buildReportMarkdown({ applied, skipped, mode, dbName, dbHost }) {
  const counts = tally(applied);
  const lines = [];

  lines.push('# All Transactional Email Templates — Bootstrap Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Mode: **${mode}**`);
  lines.push(`Script version: ${SCRIPT_VERSION}`);
  lines.push(`Database: ${dbName} @ ${dbHost}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Action | Count |');
  lines.push('| --- | --- |');
  for (const action of Object.values(ACTIONS)) {
    if (counts[action]) lines.push(`| \`${action}\` | ${counts[action]} |`);
  }
  lines.push(`| \`SKIPPED-BLOCKED\` | ${skipped.filter((s) => s.action === ACTIONS.SKIPPED_BLOCKED).length} |`);
  lines.push(`| \`SKIPPED-NOT-REACHABLE\` | ${skipped.filter((s) => s.action === ACTIONS.SKIPPED_NOT_REACHABLE).length} |`);
  lines.push(`| \`SKIPPED-NOT-VERIFIED\` | ${skipped.filter((s) => s.action === ACTIONS.SKIPPED_NOT_VERIFIED).length} |`);
  lines.push('');
  lines.push('## Approved mappings (applied set)');
  lines.push('');
  lines.push('| Event | Recipient | Purpose | Action | Mapping id | Emitter |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of applied) {
    lines.push(`| \`${r.eventName}\` | ${r.recipientType} | ${r.purpose} | \`${r.action}\` | ${r.id || '—'} | ${r.actualEmitter || ''} |`);
  }
  lines.push('');
  lines.push('## Blocked (never auto-created)');
  lines.push('');
  lines.push('| Event | Recipient | Reason |');
  lines.push('| --- | --- | --- |');
  for (const s of skipped.filter((x) => x.action === ACTIONS.SKIPPED_BLOCKED)) {
    lines.push(`| \`${s.eventName}\` | ${s.recipientType} | ${s.reason} |`);
  }
  lines.push('');
  lines.push('## Not verified / not reachable');
  lines.push('');
  lines.push('| Event | Recipient | Category | Reachable | Reason |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const s of skipped.filter((x) => x.action === ACTIONS.SKIPPED_NOT_VERIFIED || x.action === ACTIONS.SKIPPED_NOT_REACHABLE)) {
    lines.push(`| \`${s.eventName}\` | ${s.recipientType} | \`${s.action}\` | ${s.reachable === false ? 'no' : 'yes'} | ${s.reason} |`);
  }
  lines.push('');
  lines.push('## Contract notes');
  lines.push('- Only `APPROVED_FOR_BOOTSTRAP` entries are written. Blocked/not-verified entries are reported, never created.');
  lines.push('- Existing non-blank subject/HTML is never overwritten; an exact reference match is reported `ALREADY-CORRECT`, any other non-blank content is `PRESERVED-CUSTOM`.');
  lines.push('- A blank/UNKNOWN purpose is filled from the registry; an explicit non-UNKNOWN purpose is preserved.');
  lines.push('- A disabled mapping is never auto-enabled. WhatsApp/In-App content is never touched.');
  lines.push('- All emails reuse the shared Phase 1 shell (branded header + shared footer/CTA markers resolved at render time by EmailRenderContext).');
  if (counts[ACTIONS.PRESERVED_CUSTOM]) {
    lines.push('');
    lines.push(`> ${counts[ACTIONS.PRESERVED_CUSTOM]} mapping(s) were PRESERVED-CUSTOM. Review manually before assuming the reference content is live.`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {object} opts
 * @param {boolean} [opts.dryRun=false]
 * @param {boolean} [opts.leaveConnected=false] - for tests
 * @param {boolean} [opts.writeReport]          - override report writing
 */
async function run({ dryRun = true, leaveConnected = false, writeReport } = {}) {
  const mode = dryRun ? 'dry-run' : 'apply';
  const applied = [];
  const skipped = [];

  for (const entry of APPROVED_EMAIL_TEMPLATES) {
    let result;
    try {
      result = await applyEmailEntry(entry, { dryRun });
    } catch (err) {
      result = {
        eventName: entry.eventName,
        recipientType: entry.recipientType,
        purpose: entry.purpose,
        action: ACTIONS.ERROR,
        id: null,
        error: err.message,
      };
    }
    result.actualEmitter = entry.actualEmitter;
    applied.push(result);

    if (!dryRun && result.action !== ACTIONS.ERROR && result.action !== ACTIONS.ALREADY_CORRECT) {
      MappingCache.invalidate(entry.eventName);
    }

    const label = result.action.padEnd(22);
    console.log(`${label} ${mode}  ${entry.eventName} (${entry.recipientType}/email)${result.id ? ` [${result.id}]` : ''}`);
  }

  for (const entry of TRANSACTIONAL_EMAIL_TEMPLATES) {
    if (entry.status === STATUS.APPROVED) continue;
    skipped.push({
      eventName: entry.eventName,
      recipientType: entry.recipientType,
      action: excludedAction(entry),
      reachable: entry.reachable,
      reason: entry.reason || '',
    });
  }

  const shouldWriteReport = writeReport !== undefined
    ? writeReport
    : process.env.BOOTSTRAP_EMAILS_NO_REPORT !== '1';
  if (shouldWriteReport) {
    fs.writeFileSync(REPORT_PATH, buildReportMarkdown({
      applied, skipped, mode,
      dbName: mongoose.connection.name,
      dbHost: mongoose.connection.host,
    }));
    console.log(`Report written to ${REPORT_PATH}`);
  }

  return { mode, applied, skipped, stats: tally(applied) };
}

async function main() {
  const dryRun = !process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI || DEFAULT_MONGO_URI);
  try {
    await run({ dryRun });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error('Bootstrap failed:', err); process.exit(1); });
}

module.exports = {
  run, applyEmailEntry, excludedAction, buildReportMarkdown, purposeDelta,
  ACTIONS, SCRIPT_VERSION, REPORT_PATH,
};
