/**
 * CRITICAL BUG FIX (one-off, idempotent): repairs NotificationMapping.whatsappVariables
 * for every WhatsApp mapping that was left with an empty array after being created
 * through the admin UI.
 *
 * Root cause (see conversation / commit message for full writeup): with
 * `whatsappVariables: []`, the renderer correctly produced zero body
 * parameters — and a since-removed fallback in WhatsAppProvider.js silently
 * substituted Meta's stored template-submission "example" values instead of
 * failing. Those example values were themselves the literal payload-path
 * strings (e.g. "customer.name") typed into Meta's template-submission form
 * by mistake, so real customers received that literal text. Fixed at the
 * code level in WhatsAppChannel.js/WhatsAppProvider.js (mapping is now
 * validated against the template's real required parameter count before
 * anything is sent); this script fixes the underlying data so the corrected
 * code path actually has something valid to send.
 *
 * Each entry's {{n}} position → payloadPath was verified against the real
 * approved Meta template body text (via WhatsAppTemplate, Meta-synced),
 * not assumed — see the audit/template-spec conversation for the per-event
 * derivation.
 *
 * SERVICE_COMPLETION_OTP is handled separately: its mapping had been pointed
 * at the wrong template (`puja_completed`, a Utility template meant for
 * SERVICE_COMPLETED) instead of the shared Authentication template
 * (`whatsapp_verification`) — restored here to match OTP_VERIFICATION's
 * reference configuration.
 *
 * Run manually via `node src/scripts/fixWhatsappVariableMappings.js` from
 * the backend/ directory. Idempotent — only $sets fields, safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const NotificationMapping = require('../models/NotificationMapping');
const MappingCache = require('../../notification-engine/core/MappingCache');

const v = (payloadPath, label) => ({ payloadPath, label });

// eventName -> ordered [{{1}}, {{2}}, ...] payloadPath list, verified against
// the live approved Meta template body for that event's mapping.
const FIXES = {
  USER_REGISTERED:             [v('customer.name', 'Customer name')],
  PAYMENT_SUCCESS:             [v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('payment.amount', 'Amount paid')],
  PARTIAL_PAYMENT_RECEIVED:    [v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.amount', 'Booking total')],
  FINAL_PAYMENT_RECEIVED:      [v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.amount', 'Booking total')],
  PAYMENT_FAILED:               [v('customer.name', 'Customer name'), v('payment.amount', 'Amount')],
  BOOKING_CONFIRMED:            [v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('booking.number', 'Booking number')],
  BOOKING_CANCELLED:            [v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('reason', 'Reason')],
  BOOKING_REFUNDED:             [v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('refund.amount', 'Refund amount')],
  SERVICE_REMINDER_24H:         [v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('pandit.name', 'Pandit name')],
  SERVICE_REMINDER_1H:          [v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.time', 'Time'), v('pandit.name', 'Pandit name')],
  SERVICE_COMPLETED:            [v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('booking.poojaName', 'Pooja name')],
  INVOICE_GENERATED:            [v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('booking.amount', 'Amount')],
  FEEDBACK_REQUEST:             [v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name')],
  KIT_SHIPPED:                  [v('customer.name', 'Customer name'), v('kit.courier', 'Courier'), v('kit.trackingId', 'Tracking ID')],
  KIT_DELIVERED:                [v('customer.name', 'Customer name')],
  ORDER_CONFIRMED:              [v('customer.name', 'Customer name'), v('order.number', 'Order number')],
  ORDER_PACKED:                 [v('customer.name', 'Customer name'), v('order.number', 'Order number')],
  ORDER_SHIPPED:                [v('customer.name', 'Customer name'), v('order.number', 'Order number'), v('order.courierName', 'Courier'), v('order.trackingNumber', 'Tracking number')],
  ORDER_OUT_FOR_DELIVERY:       [v('customer.name', 'Customer name'), v('order.number', 'Order number')],
  ORDER_DELIVERED:              [v('customer.name', 'Customer name'), v('order.number', 'Order number')],
  ORDER_CANCELLED:              [v('customer.name', 'Customer name'), v('order.number', 'Order number'), v('reason', 'Reason')],
  ORDER_REFUNDED:               [v('customer.name', 'Customer name'), v('order.number', 'Order number')],
  PANDIT_POOJA_REJECTED:        [v('pandit.name', 'Pandit name'), v('pooja.name', 'Pooja name'), v('pooja.rejectionReason', 'Rejection reason')],
  PANDIT_REGISTERED:            [v('pandit.name', 'Pandit name')],
  PANDIT_POOJA_APPROVED:        [v('pandit.name', 'Pandit name'), v('pooja.name', 'Pooja name'), v('pooja.approvedPrice', 'Approved price')],
  PANDIT_APPROVED:              [v('pandit.name', 'Pandit name')],
  KYC_APPROVED:                 [v('pandit.name', 'Pandit name')],
  KYC_REJECTED:                 [v('pandit.name', 'Pandit name'), v('pandit.reason', 'Reason')],
  KYC_REUPLOAD_REQUIRED:        [v('pandit.name', 'Pandit name'), v('pandit.reason', 'Reason')],
  ACCOUNT_RESTORED:             [v('customer.name', 'Customer name')],
  ACCOUNT_DELETED:              [v('customer.name', 'Customer name')],
  ACCOUNT_DELETION_CANCELLED:   [v('customer.name', 'Customer name')],
  ACCOUNT_DELETION_REQUESTED:   [v('customer.name', 'Customer name'), v('account.scheduledDeletionDate', 'Scheduled deletion date')],
  REFERRAL_BOOKING_CREATED:     [v('pandit.name', 'Pandit name'), v('booking.number', 'Booking number')],
  PAYOUT_RELEASED:              [v('pandit.name', 'Pandit name'), v('payment.amount', 'Amount')],
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  let fixed = 0, missing = 0;
  for (const [eventName, variables] of Object.entries(FIXES)) {
    const withPosition = variables.map((v, i) => ({ position: i + 1, ...v }));
    const result = await NotificationMapping.findOneAndUpdate(
      { eventName, channel: 'whatsapp' },
      { $set: { whatsappVariables: withPosition } },
      { new: true }
    );
    MappingCache.invalidate(eventName);
    if (result) {
      console.log(`FIXED  ${eventName} (${withPosition.length} variable(s))`);
      fixed++;
    } else {
      console.log(`SKIP   ${eventName} — no whatsapp mapping exists yet, nothing to fix`);
      missing++;
    }
  }

  // SERVICE_COMPLETION_OTP: was pointed at the wrong template entirely
  // ("puja_completed") — restore to the shared Authentication template,
  // matching the OTP_VERIFICATION/DELIVERY_OTP_SENT reference configuration.
  const otpFix = await NotificationMapping.findOneAndUpdate(
    { eventName: 'SERVICE_COMPLETION_OTP', channel: 'whatsapp' },
    {
      $set: {
        whatsappTemplateName: 'whatsapp_verification',
        whatsappLanguage: 'en',
        whatsappVariables: [{ position: 1, payloadPath: 'otp.code', label: 'OTP code' }],
        whatsappButtonType: 'copy_code',
        whatsappButtonPayloadPath: 'otp.code',
      },
    },
    { new: true }
  );
  MappingCache.invalidate('SERVICE_COMPLETION_OTP');
  console.log(otpFix
    ? 'FIXED  SERVICE_COMPLETION_OTP — repointed from "puja_completed" back to "whatsapp_verification"'
    : 'SKIP   SERVICE_COMPLETION_OTP — no whatsapp mapping exists, nothing to fix');

  console.log(`\nDone. Fixed ${fixed + (otpFix ? 1 : 0)}, skipped (no mapping yet) ${missing}.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
