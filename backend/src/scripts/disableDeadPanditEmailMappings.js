#!/usr/bin/env node
/**
 * Disable the two DEAD pandit OTP email mappings (mapping hygiene).
 *
 * EVIDENCE (verified against the current codebase):
 *   - `OTP_VERIFICATION` / recipientType `pandit` / channel `email`
 *   - `PASSWORD_RESET_EMAIL_OTP` / recipientType `pandit` / channel `email`
 *
 * Every emitter of these events normalizes its payload with
 * `normalizeUserPayload`, which populates `customer` only and leaves
 * `pandit = { name:'', phone:'', email:'' }`. EventDispatcher.resolveRecipients
 * for recipientType `pandit` reads `payload.pandit`, so `hasAnyContact()` is
 * always false and these mappings enqueue ZERO jobs. They can never send.
 *
 * Pandits are User documents, and each of these events also has a `user`
 * recipient mapping (`OTP_VERIFICATION`/user, `PASSWORD_RESET_EMAIL_OTP`/user)
 * which resolves via `payload.customer` and DOES deliver to the pandit's
 * email. The pandit-recipient email mappings are therefore redundant as well
 * as dead. The smallest safe action is to DISABLE them (not delete): explicit,
 * reversible, and it prevents a future "payload path fix" from accidentally
 * turning on a second, duplicate OTP email.
 *
 * Idempotent. Never deletes. Never edits any other field or mapping.
 *
 * Usage:
 *   node src/scripts/disableDeadPanditEmailMappings.js            # apply
 *   node src/scripts/disableDeadPanditEmailMappings.js --dry-run  # report only
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');

const DEAD_MAPPINGS = [
  {
    eventName: 'OTP_VERIFICATION',
    recipientType: 'pandit',
    channel: 'email',
    reason: 'Dead: OTP_VERIFICATION payloads carry customer only (normalizeUserPayload); pandit recipient always empty. The OTP_VERIFICATION/user email mapping already delivers to pandits.',
  },
  {
    eventName: 'PASSWORD_RESET_EMAIL_OTP',
    recipientType: 'pandit',
    channel: 'email',
    reason: 'Dead: password-reset payloads carry customer only; pandit recipient always empty. The PASSWORD_RESET_EMAIL_OTP/user email mapping already delivers to pandits.',
  },
];

async function run({ leaveConnected = false, dryRun = false } = {}) {
  const wasConnected = mongoose.connection.readyState === 1;
  if (!wasConnected) await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);
  console.log(`disableDeadPanditEmailMappings ${dryRun ? '(DRY RUN — no writes)' : '(apply)'}\n`);

  const results = [];
  for (const spec of DEAD_MAPPINGS) {
    const filter = { eventName: spec.eventName, recipientType: spec.recipientType, channel: spec.channel };
    const existing = await NotificationMapping.findOne(filter);

    if (!existing) {
      results.push({ ...spec, action: 'not-present' });
      console.log(`NOT-PRESENT   ${spec.eventName}/${spec.recipientType}/${spec.channel}`);
      continue;
    }

    if (existing.enabled === false) {
      results.push({ ...spec, action: 'already-disabled', id: existing._id });
      console.log(`ALREADY-DISABLED ${spec.eventName}/${spec.recipientType}/${spec.channel} (${existing._id})`);
      continue;
    }

    if (!dryRun) {
      await NotificationMapping.updateOne({ _id: existing._id }, { $set: { enabled: false } });
      MappingCache.invalidate(spec.eventName);
    }
    results.push({ ...spec, action: dryRun ? 'would-disable' : 'disabled', id: existing._id });
    console.log(`${dryRun ? 'WOULD-DISABLE' : 'DISABLED'} ${spec.eventName}/${spec.recipientType}/${spec.channel} (${existing._id})`);
  }

  console.log('\nReasons:');
  DEAD_MAPPINGS.forEach((s) => console.log(`  - ${s.eventName}: ${s.reason}`));

  if (!wasConnected && !leaveConnected) await mongoose.disconnect();
  return { results };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error('Dead-pandit-mapping cleanup failed:', err);
    process.exit(1);
  });
}

module.exports = { run, DEAD_MAPPINGS };
