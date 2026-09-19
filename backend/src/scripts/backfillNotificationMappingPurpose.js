#!/usr/bin/env node
/**
 * NotificationMapping purpose backfill (mapping hygiene).
 *
 * WHY: every mapping in the current production dump predates the `purpose`
 * field, so `purpose` is absent on all of them. The Phase 5 WhatsApp consent
 * gate keys on `purpose === 'MARKETING'` — with the field absent, a marketing
 * mapping (CAMPAIGN_COUPON) is never gated, and a marketing message can be
 * sent to an opted-out recipient. This script fills the verified/known
 * classification for every existing mapping.
 *
 * CONTRACT (deliberately conservative):
 *   - idempotent: re-running makes zero writes once every mapping is classified
 *   - never overwrites an admin-set, non-UNKNOWN purpose
 *   - never guesses: a mapping whose event has no authoritative classification
 *     is left UNKNOWN and reported for manual review
 *   - never deletes, disables, or edits any other field
 *   - invalidates the in-process mapping cache per touched event
 *
 * Authoritative source = bootstrapNotificationMappings.js's verified arrays
 * (the same data the bootstrapper seeds), plus a small, explicitly-reasoned
 * set of extra event classifications for events the verified lists do not
 * cover. No extra classification is ever MARKETING unless the verified data
 * already says so.
 *
 * Usage:
 *   node src/scripts/backfillNotificationMappingPurpose.js            # apply
 *   node src/scripts/backfillNotificationMappingPurpose.js --dry-run  # report only
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');
const bootstrap = require('./bootstrapNotificationMappings');

/**
 * Event-level classifications for events that have mappings but are not in
 * bootstrap's verified arrays. Every entry is transactional/non-marketing —
 * no value here is 'MARKETING' (marketing classification stays exclusive to
 * the verified CAMPAIGN_COUPON mapping, so this backfill can never widen the
 * consent gate's scope by guesswork).
 */
const EXTRA_PURPOSES = {
  // Auth / account security
  PASSWORD_RESET: 'ACCOUNT',
  OTP_CREATED: 'ACCOUNT',
  OTP_VERIFIED: 'ACCOUNT',
  LOGIN_SUCCESS: 'ACCOUNT',
  LOGIN_FAILED: 'ACCOUNT',
  ADMIN_CREATED: 'ACCOUNT',
  ADMIN_UPDATED: 'ACCOUNT',
  ADMIN_SUSPENDED: 'ACCOUNT',
  ADMIN_ACTIVATED: 'ACCOUNT',
  ADMIN_PASSWORD_RESET: 'ACCOUNT',
  ADMIN_LOGIN: 'ACCOUNT',
  ADMIN_LOGOUT: 'ACCOUNT',
  KYC_SUBMITTED: 'ACCOUNT',

  // Booking lifecycle
  BOOKING_CREATED: 'BOOKING',
  BOOKING_COMPLETED: 'BOOKING',
  PAYMENT_CREATED: 'BOOKING',
  REFUND_INITIATED: 'BOOKING',
  REFUND_COMPLETED: 'BOOKING',

  // Marketplace order lifecycle
  ORDER_CREATED: 'ORDER',
  ORDER_PLACED: 'ORDER',
  ORDER_PAID: 'ORDER',
  MARKETPLACE_ORDER: 'ORDER',
  DELIVERY_OTP_SENT: 'ORDER',

  // Service operations
  SERVICE_COMPLETION_OTP: 'SERVICE',
  PANDIT_POOJA_REQUEST_CREATED: 'SERVICE',
  PANDIT_REJECTED: 'SERVICE',
  REFERRAL_REMARK_SUBMITTED: 'SERVICE',
};

/** The authoritative event → purpose map. Verified arrays win over EXTRA. */
function buildClassificationMap() {
  const map = new Map();
  const conflicts = new Set();

  const verified = [
    ...bootstrap.VERIFIED_MAPPINGS,
    ...bootstrap.VERIFIED_EMAIL_MAPPINGS,
    ...bootstrap.VERIFIED_INAPP_MAPPINGS,
  ];
  for (const entry of verified) {
    const purpose = entry.purpose;
    if (!purpose || purpose === 'UNKNOWN') continue;
    const existing = map.get(entry.eventName);
    if (existing && existing !== purpose) { conflicts.add(entry.eventName); continue; }
    map.set(entry.eventName, purpose);
  }

  for (const [eventName, purpose] of Object.entries(EXTRA_PURPOSES)) {
    if (!map.has(eventName)) map.set(eventName, purpose);
  }

  // An event the verified data itself classifies inconsistently is NOT
  // auto-resolved — surface it as ambiguous rather than pick a side.
  for (const eventName of conflicts) map.delete(eventName);

  return { map, conflicts: [...conflicts] };
}

function isBlankPurpose(purpose) {
  return !purpose || purpose === 'UNKNOWN';
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.leaveConnected=false] - tests reuse an open connection
 * @param {boolean} [opts.dryRun=false]         - report only, no writes
 */
async function run({ leaveConnected = false, dryRun = false } = {}) {
  const wasConnected = mongoose.connection.readyState === 1;
  if (!wasConnected) await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);
  console.log(`backfillNotificationMappingPurpose ${dryRun ? '(DRY RUN — no writes)' : '(apply)'}`);

  const { map, conflicts } = buildClassificationMap();
  const mappings = await NotificationMapping.find({}).lean();
  console.log(`Scanning ${mappings.length} mapping(s); ${map.size} event(s) have an authoritative classification.\n`);

  const results = [];
  for (const m of mappings) {
    const current = m.purpose;
    const classified = map.get(m.eventName);

    if (isBlankPurpose(current)) {
      if (!classified) {
        results.push({ action: 'ambiguous', id: m._id, eventName: m.eventName, channel: m.channel, recipientType: m.recipientType });
        continue;
      }
      if (!dryRun) {
        await NotificationMapping.updateOne({ _id: m._id }, { $set: { purpose: classified } });
      }
      MappingCache.invalidate(m.eventName);
      results.push({ action: 'classified', id: m._id, eventName: m.eventName, channel: m.channel, recipientType: m.recipientType, purpose: classified });
    } else if (classified && current === classified) {
      results.push({ action: 'already-valid', id: m._id, eventName: m.eventName, purpose: current });
    } else if (classified) {
      results.push({ action: 'preserved-custom', id: m._id, eventName: m.eventName, purpose: current, verified: classified });
    } else {
      results.push({ action: 'ambiguous', id: m._id, eventName: m.eventName, channel: m.channel, recipientType: m.recipientType, purpose: current });
    }
  }

  const stats = { classified: 0, 'already-valid': 0, 'preserved-custom': 0, ambiguous: 0 };
  for (const r of results) stats[r.action] = (stats[r.action] || 0) + 1;
  const distribution = results.reduce((acc, r) => {
    const p = r.purpose || map.get(r.eventName) || 'UNKNOWN';
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {});

  console.log('================ BACKFILL STATISTICS ================');
  console.log(`Classified (was blank):    ${stats.classified || 0}`);
  console.log(`Already valid:             ${stats['already-valid'] || 0}`);
  console.log(`Preserved (admin custom):  ${stats['preserved-custom'] || 0}`);
  console.log(`Ambiguous (left UNKNOWN):  ${stats.ambiguous || 0}`);
  console.log('\nFinal purpose distribution:');
  for (const [purpose, count] of Object.entries(distribution).sort()) {
    console.log(`  ${purpose.padEnd(10)} ${count}`);
  }

  if (conflicts.length) {
    console.log('\nVerified-data conflicts (NOT auto-resolved):');
    conflicts.forEach((e) => console.log(`  - ${e}`));
  }

  const ambiguous = results.filter((r) => r.action === 'ambiguous');
  if (ambiguous.length) {
    console.log('\nAmbiguous mappings needing a manual purpose decision:');
    ambiguous.forEach((r) => console.log(
      `  - ${r.eventName} / ${r.recipientType} / ${r.channel} (${r.id})${r.purpose ? ` — current: ${r.purpose}` : ''}`
    ));
  }

  if (!wasConnected && !leaveConnected) await mongoose.disconnect();
  return { total: mappings.length, stats, distribution, ambiguous, conflicts, results };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error('Purpose backfill failed:', err);
    process.exit(1);
  });
}

module.exports = { run, buildClassificationMap, EXTRA_PURPOSES };
