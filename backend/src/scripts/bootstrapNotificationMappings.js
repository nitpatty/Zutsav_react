/**
 * OFFICIAL INITIALIZATION PATH for Notification Mapping configuration.
 *
 * After (1) Application Startup and (2) WhatsApp Template Sync, running this
 * script is the only remaining step required to bring any database — brand
 * new or existing — up to the same verified WhatsApp mapping configuration
 * as every other deployment of this codebase. No other repair script should
 * be needed afterwards.
 *
 * This consolidates and supersedes:
 *   - seedOtpTemplateMappings.js
 *   - seedPasswordResetMappings.js
 *   - fixOtpVerificationWhatsappVariables.js
 *   - fixWhatsappVariableMappings.js
 * (all four are still present, now marked deprecated, kept only for
 * historical reference — see the banner at the top of each.)
 *
 * WHAT THIS DOES NOT DO, ON PURPOSE:
 * This script does not, and will never, infer a payload path from a Meta
 * template. A template only reveals how many {{n}} placeholders exist and
 * generic example text ("123456") — never which real business field belongs
 * in which position. That mapping is business knowledge a human has to
 * supply once. VERIFIED_MAPPINGS below is exactly that knowledge, already
 * supplied — re-derived from the four scripts above and independently
 * re-confirmed against this project's real, working database on
 * 2026-07-22 (see the verification note above each block). Any event NOT
 * listed here has no verified reference data and will correctly still
 * require one-time manual configuration through the Admin UI — that is a
 * permanent, intentional property of this system, not a gap. Auto-guessing
 * a payload path is exactly the failure mode WhatsAppProvider.js's own
 * history warns about (an earlier version silently sent literal strings
 * like "customer.name" to real customers) — this script will never do that.
 *
 * BEHAVIOR (idempotent, safe to run against any database at any time):
 *   - Mapping does not exist for (eventName, recipientType, channel:whatsapp)
 *       -> CREATE it with the verified template/variables/button config.
 *   - Mapping exists with whatsappVariables: [] (incomplete/unconfigured)
 *       -> FILL IN the verified template/variables/button config. Existing
 *          enabled/priority/label/recipientType/eventName are left exactly
 *          as they are — bootstrap only completes WhatsApp config, never
 *          touches administrative fields.
 *   - Mapping exists with whatsappVariables already non-empty
 *       -> PRESERVED, untouched. An administrator has already configured
 *          this mapping (whether or not it matches the reference data
 *          exactly — it may be a deliberate customization) and bootstrap
 *          never overwrites that without being asked to.
 *   - Named exceptions (corrected even when variables are already set,
 *     since these are known bug fixes, not variable-completion cases):
 *       - SERVICE_COMPLETION_OTP: known-wrong legacy template
 *         ("puja_completed", see fixWhatsappVariableMappings.js's own
 *         history) corrected to "whatsapp_verification".
 *       - PARTIAL_PAYMENT_RECEIVED: known-wrong legacy variable mapping
 *         (position 3 pointed at booking.amount/"Booking total" instead of
 *         booking.remainingAmount — see the 2026-07-26 "Remaining balance
 *         shows booking total" investigation) corrected to the verified
 *         mapping below. Only this exact known-wrong signature is
 *         corrected; any other mismatch is still treated as a deliberate
 *         admin customization and preserved.
 *
 * REPORT: after every run, writes docs/notification-bootstrap-report.md —
 * what was created, what was filled in, what was left alone, and (reusing
 * notification-engine/bootstrap.js's own validateWhatsAppMappings — no
 * duplicate logic) exactly which mappings, if any, still need a human.
 *
 * Run via `node src/scripts/bootstrapNotificationMappings.js` from backend/,
 * with MONGO_URI pointed at the target database.
 */
const BOOTSTRAP_VERSION = '1.0.0';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');
const { validateWhatsAppMappings } = require('../../notification-engine/bootstrap');

const v = (payloadPath, label) => ({ payloadPath, label });
const withPositions = (vars) => vars.map((x, i) => ({ position: i + 1, ...x }));
const otpEntry = (eventName, recipientType, enabled = true) => ({
  eventName, recipientType, enabled,
  whatsappTemplateName: 'whatsapp_verification',
  whatsappVariables: withPositions([v('otp.code', 'OTP code')]),
  whatsappButtonType: 'copy_code', whatsappButtonPayloadPath: 'otp.code',
});

/**
 * Verified reference data. Every (eventName, recipientType, template,
 * variables) tuple below was re-confirmed by direct query against this
 * project's real working database on 2026-07-22 — see the investigation
 * this script's commit is attached to. None of it is inferred from a
 * template body; all of it traces back to a human having configured it
 * correctly at some point (via the Admin UI or one of the four deprecated
 * scripts this file consolidates).
 */
const VERIFIED_MAPPINGS = [
  // ── OTP-style events — shared Authentication template ──────────────────
  // (from fixOtpVerificationWhatsappVariables.js / seedOtpTemplateMappings.js / seedPasswordResetMappings.js)
  otpEntry('OTP_VERIFICATION', 'user'),
  otpEntry('OTP_VERIFICATION', 'pandit'),
  otpEntry('SERVICE_COMPLETION_OTP', 'user'),
  otpEntry('DELIVERY_OTP_SENT', 'user'),
  otpEntry('PASSWORD_RESET_WHATSAPP_OTP', 'user'),
  // pandit variant re-verified during the 2026-07-22 duplicate-mapping
  // incident investigation, same template/single-placeholder pattern as
  // every other OTP-style event above — not part of any of the four
  // original scripts, added here from that investigation's own findings.
  otpEntry('PASSWORD_RESET_WHATSAPP_OTP', 'pandit'),

  // ── Business events (from fixWhatsappVariableMappings.js) ───────────────
  { eventName: 'USER_REGISTERED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'new_user_registered',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'PAYMENT_SUCCESS', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'payment_success',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('payment.amount', 'Amount paid')]) },
  { eventName: 'PARTIAL_PAYMENT_RECEIVED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'partial_payment_received',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.remainingAmount', 'Remaining balance')]) },
  { eventName: 'FINAL_PAYMENT_RECEIVED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'final_payment_received',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.amount', 'Booking total')]) },
  { eventName: 'PAYMENT_FAILED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'payment_failed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('payment.amount', 'Amount')]) },
  { eventName: 'BOOKING_CONFIRMED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'booking_confirmed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('booking.number', 'Booking number')]) },
  { eventName: 'BOOKING_CANCELLED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'booking_cancelled',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('reason', 'Reason')]) },
  { eventName: 'BOOKING_REFUNDED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'booking_refunded',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('refund.amount', 'Refund amount')]) },
  { eventName: 'SERVICE_REMINDER_24H', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'service_reminder_24h',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('pandit.name', 'Pandit name')]) },
  { eventName: 'SERVICE_REMINDER_1H', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'service_reminder_1h',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.time', 'Time'), v('pandit.name', 'Pandit name')]) },
  { eventName: 'SERVICE_COMPLETED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'service_completed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('booking.poojaName', 'Pooja name')]) },
  { eventName: 'INVOICE_GENERATED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'invoice_generated',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('booking.amount', 'Amount')]) },
  { eventName: 'FEEDBACK_REQUEST', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'feedback_request',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name')]) },
  { eventName: 'KIT_SHIPPED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'kit_shipped',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('kit.courier', 'Courier'), v('kit.trackingId', 'Tracking ID')]) },
  { eventName: 'KIT_DELIVERED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'kit_delivered',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ORDER_CONFIRMED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_confirmed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_PACKED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_packed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_SHIPPED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_shipped',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number'), v('order.courierName', 'Courier'), v('order.trackingNumber', 'Tracking number')]) },
  { eventName: 'ORDER_OUT_FOR_DELIVERY', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_out_for_delivery',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_DELIVERED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_delivered',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_CANCELLED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_cancelled',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number'), v('reason', 'Reason')]) },
  { eventName: 'ORDER_REFUNDED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'order_refunded',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'PANDIT_POOJA_REJECTED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'pandit_pooja_rejected',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pooja.name', 'Pooja name'), v('pooja.rejectionReason', 'Rejection reason')]) },
  { eventName: 'PANDIT_REGISTERED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'pandit_registered',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name')]) },
  { eventName: 'PANDIT_POOJA_APPROVED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'pandit_pooja_approved',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pooja.name', 'Pooja name'), v('pooja.approvedPrice', 'Approved price')]) },
  { eventName: 'PANDIT_APPROVED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'pandit_approved',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name')]) },
  { eventName: 'KYC_APPROVED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'kyc_approved',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name')]) },
  { eventName: 'KYC_REJECTED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'kyc_rejected',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pandit.reason', 'Reason')]) },
  { eventName: 'KYC_REUPLOAD_REQUIRED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'kyc_reupload_required',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pandit.reason', 'Reason')]) },
  { eventName: 'ACCOUNT_RESTORED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'account_restored',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ACCOUNT_DELETED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'account_deleted',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ACCOUNT_DELETION_CANCELLED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'account_deletion_cancelled',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ACCOUNT_DELETION_REQUESTED', recipientType: 'user', enabled: true,
    whatsappTemplateName: 'account_deletion_requested',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('account.scheduledDeletionDate', 'Scheduled deletion date')]) },
  { eventName: 'REFERRAL_BOOKING_CREATED', recipientType: 'referral_pandit', enabled: true,
    whatsappTemplateName: 'referral_booking_created',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('booking.number', 'Booking number')]) },
  { eventName: 'PAYOUT_RELEASED', recipientType: 'pandit', enabled: true,
    whatsappTemplateName: 'payout_released',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('payment.amount', 'Amount')]) },
];

const sameVariables = (a, b) => JSON.stringify(a || []) === JSON.stringify(b);

// Known-wrong legacy variable set for PARTIAL_PAYMENT_RECEIVED (see the
// 2026-07-26 "Remaining balance shows booking total" investigation): the
// WhatsApp template body reads "...Remaining balance: ₹{{3}}" but position 3
// was mapped to booking.amount (the grand total) instead of the newly added
// booking.remainingAmount. Databases already bootstrapped before this fix
// carry this exact wrong mapping and need it corrected, same as the
// SERVICE_COMPLETION_OTP legacy-template exception below.
const LEGACY_WRONG_PARTIAL_PAYMENT_VARIABLES = withPositions([
  v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.amount', 'Booking total'),
]);

/** Applies one VERIFIED_MAPPINGS entry to the database. Never overwrites an
 * already-configured mapping except the one named SERVICE_COMPLETION_OTP
 * legacy-template exception. Returns a result record for the report. */
async function applyEntry(entry) {
  const filter = { eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp' };
  const existing = await NotificationMapping.findOne(filter);

  const bootstrapFields = {
    whatsappTemplateName: entry.whatsappTemplateName,
    whatsappVariables: entry.whatsappVariables,
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
  };
  if (entry.whatsappButtonType) bootstrapFields.whatsappButtonType = entry.whatsappButtonType;
  if (entry.whatsappButtonPayloadPath) bootstrapFields.whatsappButtonPayloadPath = entry.whatsappButtonPayloadPath;

  if (!existing) {
    const created = await NotificationMapping.create({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp',
      enabled: entry.enabled !== false,
      ...bootstrapFields,
    });
    return { entry, action: 'created', id: created._id };
  }

  // Named exception: known-wrong legacy template, corrected regardless of
  // whether variables are already set (see fixWhatsappVariableMappings.js's
  // own documented history of this specific bug).
  if (entry.eventName === 'SERVICE_COMPLETION_OTP' && existing.whatsappTemplateName === 'puja_completed') {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    return { entry, action: 'corrected-legacy-template', id: existing._id };
  }

  // Named exception: known-wrong "remaining balance shows total" mapping,
  // corrected regardless of whether variables are already set (see
  // LEGACY_WRONG_PARTIAL_PAYMENT_VARIABLES above for the incident this
  // traces back to). A mismatch that ISN'T this exact known-wrong signature
  // is still treated as a deliberate admin customization and preserved.
  if (entry.eventName === 'PARTIAL_PAYMENT_RECEIVED'
    && sameVariables(existing.whatsappVariables, LEGACY_WRONG_PARTIAL_PAYMENT_VARIABLES)) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    return { entry, action: 'corrected-legacy-mapping', id: existing._id };
  }

  if ((existing.whatsappVariables || []).length === 0) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    return { entry, action: 'configured', id: existing._id };
  }

  const matchesReference = sameVariables(existing.whatsappVariables, entry.whatsappVariables)
    && existing.whatsappTemplateName === entry.whatsappTemplateName;
  return { entry, action: matchesReference ? 'already-correct' : 'preserved-custom', id: existing._id };
}

function buildReportMarkdown(results, validation) {
  const by = (action) => results.filter((r) => r.action === action);
  const created = by('created');
  const configured = by('configured');
  const corrected = by('corrected-legacy-template');
  const correctedMapping = by('corrected-legacy-mapping');
  const alreadyCorrect = by('already-correct');
  const preservedCustom = by('preserved-custom');

  const line = (r) => `- \`${r.entry.eventName}\` / ${r.entry.recipientType} (\`${r.id}\`) → \`${r.entry.whatsappTemplateName}\``;

  return `# Notification Mappings Bootstrap Report

Generated: ${new Date().toISOString()}
Bootstrap script version: ${BOOTSTRAP_VERSION}
Database: ${mongoose.connection.name} @ ${mongoose.connection.host}

## Summary

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | ${created.length} |
| Configured (existed, was blank) | ${configured.length} |
| Corrected (known-wrong legacy template) | ${corrected.length} |
| Corrected (known-wrong legacy variable mapping) | ${correctedMapping.length} |
| Already correct (matches reference exactly) | ${alreadyCorrect.length} |
| Preserved (existing custom configuration, untouched) | ${preservedCustom.length} |
| **Total verified mappings processed** | **${results.length}** |

## Created
${created.length ? created.map(line).join('\n') : '_none_'}

## Configured (filled in blank whatsappVariables)
${configured.length ? configured.map(line).join('\n') : '_none_'}

## Corrected (legacy wrong template repointed)
${corrected.length ? corrected.map(line).join('\n') : '_none_'}

## Corrected (legacy wrong variable mapping repointed)
${correctedMapping.length ? correctedMapping.map(line).join('\n') : '_none_'}

## Preserved — existing administrator customization left untouched
${preservedCustom.length ? preservedCustom.map(line).join('\n') : '_none_'}

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check:

${validation.problems.length
    ? validation.problems.map((p) => `- ${p}`).join('\n')
    : '_none — every enabled WhatsApp mapping in this database resolves correctly._'}

---
This report is regenerated every time \`bootstrapNotificationMappings.js\` runs and reflects only the most recent run.
`;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);
  console.log(`bootstrapNotificationMappings.js v${BOOTSTRAP_VERSION}`);
  console.log(`Processing ${VERIFIED_MAPPINGS.length} verified mapping(s)\n`);

  const results = [];
  for (const entry of VERIFIED_MAPPINGS) {
    const result = await applyEntry(entry);
    results.push(result);
    MappingCache.invalidate(entry.eventName);
    console.log(`${result.action.toUpperCase().padEnd(24)} ${entry.eventName}/${entry.recipientType} (${result.id})`);
  }

  const stats = results.reduce((acc, r) => { acc[r.action] = (acc[r.action] || 0) + 1; return acc; }, {});
  console.log('\n================ STATISTICS ================');
  console.log(`Created:                 ${stats['created'] || 0}`);
  console.log(`Configured:              ${stats['configured'] || 0}`);
  console.log(`Corrected (legacy):      ${stats['corrected-legacy-template'] || 0}`);
  console.log(`Corrected (mapping):     ${stats['corrected-legacy-mapping'] || 0}`);
  console.log(`Already correct:         ${stats['already-correct'] || 0}`);
  console.log(`Preserved (customized):  ${stats['preserved-custom'] || 0}`);

  console.log('\nRunning full validation (same check as server startup)...');
  const validation = await validateWhatsAppMappings();
  console.log(`Validation: ${validation.ok}/${validation.total} enabled WhatsApp mapping(s) fully configured, ${validation.problems.length} still need manual attention.`);

  const reportPath = path.resolve(__dirname, '../../../docs/notification-bootstrap-report.md');
  fs.writeFileSync(reportPath, buildReportMarkdown(results, validation));
  console.log(`\nReport written to ${reportPath}`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
