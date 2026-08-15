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
 *
 * v1.1.0 (2026-07-28 sync audit — see
 * docs/notification-bootstrap-sync-audit-2026-07-28.md): a full field-by-field
 * diff against the live working database found the 41 WhatsApp entries below
 * still matched with zero drift, but 10 verified mappings were missing
 * entirely — 4 WhatsApp events (PANDIT_ACCEPTED, PANDIT_ASSIGNED,
 * PANDIT_ASSIGNMENT_PENDING, REFERRAL_PENDING_REMARK) plus, extending this
 * script's scope for the first time beyond WhatsApp, 4 Email and 2 In-App
 * mappings (VERIFIED_EMAIL_MAPPINGS / VERIFIED_INAPP_MAPPINGS below). Same
 * idempotency rules apply per channel: create if absent, fill in if the
 * channel's content fields are blank, never overwrite a non-blank field an
 * administrator may have customized. One legacy mapping (PASSWORD_RESET/user,
 * disabled, not in EventRegistry.EVENTS, superseded by
 * PASSWORD_RESET_EMAIL_OTP/PASSWORD_RESET_WHATSAPP_OTP) was found in the
 * database and deliberately excluded — see the audit doc.
 *
 * v1.2.0 (Phase 5 — WhatsApp consent): every verified mapping now carries a
 * communication `purpose` classification (ACCOUNT / BOOKING / ORDER /
 * SERVICE / MARKETING — see docs/whatsapp-consent-phase-5-outbound-gate.md
 * for the per-mapping rationale). Purpose follows its own fill-if-blank
 * contract, INDEPENDENT of channel content: a mapping whose purpose is blank
 * (pre-v1.2.0 doc) gets the verified classification; a purpose that already
 * matches is a no-op; a purpose an administrator explicitly set to something
 * else is NEVER overwritten (same customization-preservation principle as
 * the channel-content fields). A fresh database gets all 51 verified
 * mappings with purposes populated on first run; a second run makes zero
 * unnecessary writes. MARKETING purposes will be consent-gated on outbound
 * WhatsApp (WhatsAppChannel.send); none of the 51 verified mappings are
 * MARKETING today.
 *
 * v1.3.0 (Phase 5.1 — feedback as an optional action in a transactional
 * message; see docs/whatsapp-consent-phase-5-1-feedback-service-flow.md):
 *   - SERVICE_COMPLETED now carries `whatsappUrlButtons` — View Receipt
 *     (dynamic URL, parameter booking.id → /invoice/{{1}}) and Rate Your
 *     Experience (static URL → /my-bookings). Purpose stays SERVICE: the
 *     presence of an optional feedback action does NOT make the message
 *     marketing, and the Phase 5 consent gate never blocks it.
 *   - FEEDBACK_REQUEST is created DISABLED: per the client clarification
 *     there is no standalone feedback-asking WhatsApp message anymore, and
 *     no code path emits it (the three completion emitters and the hourly
 *     cron were removed in 5.1). The entry is kept (with its verified
 *     template/variables) so a fresh DB never sends a standalone feedback
 *     ask; on an EXISTING DB bootstrap still preserves whatever state the
 *     admin has (it never force-disables a mapping that is already enabled).
 *   - `whatsappUrlButtons` follows the same channel-content fill-if-blank
 *     contract as template/variables: created on a fresh DB, filled only
 *     when the mapping's WhatsApp content is otherwise blank, never
 *     overwritten on an already-configured mapping (so an existing
 *     deployment adopts the buttons deliberately — via the Admin UI or a
 *     blank mapping — after its Meta template declares them).
 */
const BOOTSTRAP_VERSION = '1.3.0';

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
  eventName, recipientType, enabled, purpose: 'ACCOUNT',
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
  { eventName: 'USER_REGISTERED', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'new_user_registered',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'PAYMENT_SUCCESS', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'payment_success',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('payment.amount', 'Amount paid')]) },
  { eventName: 'PARTIAL_PAYMENT_RECEIVED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'partial_payment_received',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.remainingAmount', 'Remaining balance')]) },
  { eventName: 'FINAL_PAYMENT_RECEIVED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'final_payment_received',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('payment.amount', 'Amount paid'), v('booking.amount', 'Booking total')]) },
  { eventName: 'PAYMENT_FAILED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'payment_failed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('payment.amount', 'Amount')]) },
  { eventName: 'BOOKING_CONFIRMED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'booking_confirmed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('booking.number', 'Booking number')]) },
  { eventName: 'BOOKING_CANCELLED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'booking_cancelled',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('reason', 'Reason')]) },
  { eventName: 'BOOKING_REFUNDED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'booking_refunded',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('refund.amount', 'Refund amount')]) },
  { eventName: 'SERVICE_REMINDER_24H', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'service_reminder_24h',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('pandit.name', 'Pandit name')]) },
  { eventName: 'SERVICE_REMINDER_1H', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'service_reminder_1h',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name'), v('booking.time', 'Time'), v('pandit.name', 'Pandit name')]) },
  { eventName: 'SERVICE_COMPLETED', recipientType: 'user', enabled: true, purpose: 'SERVICE',
    whatsappTemplateName: 'service_completed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('booking.poojaName', 'Pooja name')]),
    // Phase 5.1 — feedback as an OPTIONAL ACTION on a purely transactional
    // message (purpose stays SERVICE). The Meta template is authoritative:
    // the channel only sends button parameters for URL buttons the synced
    // `service_completed` template actually declares. Destinations reuse the
    // existing protected routes (see the phase doc §11):
    //   View Receipt         → {clientUrl}/invoice/{booking.id}   (dynamic URL)
    //   Rate Your Experience → {clientUrl}/my-bookings            (static URL)
    whatsappUrlButtons: [
      { text: 'View Receipt',         urlTemplate: '/invoice/{{1}}', parameterPath: 'booking.id' },
      { text: 'Rate Your Experience', urlTemplate: '/my-bookings',  parameterPath: '' },
    ] },
  { eventName: 'INVOICE_GENERATED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'invoice_generated',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.number', 'Booking number'), v('booking.amount', 'Amount')]) },
  // Phase 5.1: DISABLED on fresh DBs — no standalone feedback-asking
  // WhatsApp message anymore (client clarification). Feedback is an optional
  // action on SERVICE_COMPLETED. The entry is retained for compatibility
  // (verified template + variables + purpose SERVICE); nothing emits this
  // event since 5.1 removed every FEEDBACK_REQUEST emit. On existing DBs
  // bootstrap preserves the admin's current state (never force-disables).
  { eventName: 'FEEDBACK_REQUEST', recipientType: 'user', enabled: false, purpose: 'SERVICE',
    whatsappTemplateName: 'feedback_request',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('booking.poojaName', 'Pooja name')]) },
  { eventName: 'KIT_SHIPPED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'kit_shipped',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('kit.courier', 'Courier'), v('kit.trackingId', 'Tracking ID')]) },
  { eventName: 'KIT_DELIVERED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'kit_delivered',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ORDER_CONFIRMED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_confirmed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_PACKED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_packed',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_SHIPPED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_shipped',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number'), v('order.courierName', 'Courier'), v('order.trackingNumber', 'Tracking number')]) },
  { eventName: 'ORDER_OUT_FOR_DELIVERY', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_out_for_delivery',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_DELIVERED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_delivered',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'ORDER_CANCELLED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_cancelled',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number'), v('reason', 'Reason')]) },
  { eventName: 'ORDER_REFUNDED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    whatsappTemplateName: 'order_refunded',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('order.number', 'Order number')]) },
  { eventName: 'PANDIT_POOJA_REJECTED', recipientType: 'pandit', enabled: true, purpose: 'SERVICE',
    whatsappTemplateName: 'pandit_pooja_rejected',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pooja.name', 'Pooja name'), v('pooja.rejectionReason', 'Rejection reason')]) },
  { eventName: 'PANDIT_REGISTERED', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'pandit_registered',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name')]) },
  // Added in the 2026-07-28 sync audit — verified against the working
  // database, confirmed against the synced (APPROVED) WhatsAppTemplate body
  // param count for each template.
  { eventName: 'PANDIT_ACCEPTED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'pandit_accepted',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('pandit.name', 'Pandit name'), v('booking.number', 'Booking number')]) },
  { eventName: 'PANDIT_ASSIGNED', recipientType: 'user', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'pandit_assigned',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('pandit.name', 'Pandit name'), v('booking.date', 'Date'), v('booking.time', 'Time'), v('booking.number', 'Booking number')]) },
  { eventName: 'PANDIT_ASSIGNMENT_PENDING', recipientType: 'pandit', enabled: true, purpose: 'SERVICE',
    whatsappTemplateName: 'pandit_assignment_pending',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('booking.poojaName', 'Pooja name'), v('booking.date', 'Date'), v('booking.time', 'Time')]) },
  { eventName: 'REFERRAL_PENDING_REMARK', recipientType: 'pandit', enabled: true, purpose: 'SERVICE',
    whatsappTemplateName: 'referral_pending_remark',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('booking.number', 'Booking number')]) },
  { eventName: 'PANDIT_POOJA_APPROVED', recipientType: 'pandit', enabled: true, purpose: 'SERVICE',
    whatsappTemplateName: 'pandit_pooja_approved',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pooja.name', 'Pooja name'), v('pooja.approvedPrice', 'Approved price')]) },
  { eventName: 'PANDIT_APPROVED', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'pandit_approved',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name')]) },
  { eventName: 'KYC_APPROVED', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'kyc_approved',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name')]) },
  { eventName: 'KYC_REJECTED', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'kyc_rejected',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pandit.reason', 'Reason')]) },
  { eventName: 'KYC_REUPLOAD_REQUIRED', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'kyc_reupload_required',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('pandit.reason', 'Reason')]) },
  { eventName: 'ACCOUNT_RESTORED', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'account_restored',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ACCOUNT_DELETED', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'account_deleted',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ACCOUNT_DELETION_CANCELLED', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'account_deletion_cancelled',
    whatsappVariables: withPositions([v('customer.name', 'Customer name')]) },
  { eventName: 'ACCOUNT_DELETION_REQUESTED', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    whatsappTemplateName: 'account_deletion_requested',
    whatsappVariables: withPositions([v('customer.name', 'Customer name'), v('account.scheduledDeletionDate', 'Scheduled deletion date')]) },
  { eventName: 'REFERRAL_BOOKING_CREATED', recipientType: 'referral_pandit', enabled: true, purpose: 'BOOKING',
    whatsappTemplateName: 'referral_booking_created',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('booking.number', 'Booking number')]) },
  { eventName: 'PAYOUT_RELEASED', recipientType: 'pandit', enabled: true, purpose: 'SERVICE',
    whatsappTemplateName: 'payout_released',
    whatsappVariables: withPositions([v('pandit.name', 'Pandit name'), v('payment.amount', 'Amount')]) },
];

// ── Email mappings, verified against the working database in the 2026-07-28
// sync audit. Same rule as WhatsApp: this is real HTML a human wrote and
// confirmed sends correctly, not template inference.
const VERIFIED_EMAIL_MAPPINGS = [
  { eventName: 'OTP_VERIFICATION', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    emailSubject: 'Your Zutsav OTP Code',
    emailHtml: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🤔 Zutsav — Verify Your Account</h2>
          <p>Namaste <strong>{{customer.name}}</strong>,</p>
          <p>Your OTP code for account verification is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>` },
  { eventName: 'OTP_VERIFICATION', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    emailSubject: 'Your Zutsav OTP Code',
    emailHtml: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🤔 Zutsav — Verify Your Account</h2>
          <p>Namaste <strong>{{customer.name}}</strong>,</p>
          <p>Your OTP code for account verification is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>` },
  { eventName: 'PASSWORD_RESET_EMAIL_OTP', recipientType: 'user', enabled: true, purpose: 'ACCOUNT',
    emailSubject: 'Your Zutsav Password Reset Code',
    emailHtml: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🔐 Zutsav — Password Reset</h2>
          <p>Hi <strong>{{customer.name}}</strong>,</p>
          <p>Your Zutsav password reset code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>.</p>
          <p style="color:#6b7280;font-size:14px">If you didn't request this, please ignore this message — your password will not be changed.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>` },
  { eventName: 'PASSWORD_RESET_EMAIL_OTP', recipientType: 'pandit', enabled: true, purpose: 'ACCOUNT',
    emailSubject: 'Your Zutsav Password Reset Code',
    emailHtml: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🔐 Zutsav — Password Reset</h2>
          <p>Hi <strong>{{pandit.name}}</strong>,</p>
          <p>Your Zutsav password reset code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>.</p>
          <p style="color:#6b7280;font-size:14px">If you didn't request this, please ignore this message — your password will not be changed.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>` },
];

// ── In-App mappings, verified against the working database in the 2026-07-28
// sync audit.
const VERIFIED_INAPP_MAPPINGS = [
  { eventName: 'KIT_SHIPPED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    label: 'Kit Shipped (In-App)',
    inAppType: 'kit_shipped',
    inAppTitle: 'Your Samagri Kit Has Been Shipped!',
    inAppMessage: 'Your pooja samagri kit for booking #{{booking.number}} has been dispatched via {{kit.courier}}. Tracking ID: {{kit.trackingId}}. It will arrive before your scheduled pooja.' },
  { eventName: 'KIT_DELIVERED', recipientType: 'user', enabled: true, purpose: 'ORDER',
    label: 'Kit Delivered (In-App)',
    inAppType: 'kit_delivered',
    inAppTitle: 'Samagri Kit Delivered!',
    inAppMessage: 'Your pooja samagri kit for booking #{{booking.number}} has been delivered. You are all set for your pooja!' },
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

/** Purpose fill-if-blank contract (Phase 5, v1.2.0) — INDEPENDENT of a
 * mapping's channel-content state: a blank purpose gets the verified
 * classification, a matching purpose is a no-op, and a purpose an
 * administrator explicitly set to something else is NEVER overwritten
 * (same customization-preservation principle as the content fields).
 * Returns { fields, action } — `fields` is non-empty only when a write is
 * actually needed (so a second run makes zero unnecessary writes). */
function purposeDelta(entry, existing) {
  const purpose = entry.purpose || '';
  if (!existing) return { fields: {}, action: 'purpose-created' };
  if (!purpose)  return { fields: {}, action: 'no-purpose' };
  // 'UNKNOWN' — the schema default / unclassified state — counts as blank:
  // a verified entry (whether a pre-v1.2.0 doc whose field Mongoose hydrates
  // as the default, or one explicitly left at the default) gets its verified
  // classification. Only an EXPLICIT non-UNKNOWN purpose is an admin
  // customization and is preserved. Either way the write is skipped when the
  // value already matches, so a second run makes zero unnecessary writes.
  if (!existing.purpose || existing.purpose === 'UNKNOWN') {
    return { fields: { purpose }, action: 'purpose-set' };
  }
  if (existing.purpose === purpose) return { fields: {}, action: 'purpose-matches' };
  return { fields: {}, action: 'purpose-preserved' };
}

/** Attach the purpose outcome to a result record, writing the purpose only
 * when it is genuinely blank. Never throws for a purpose mismatch. */
async function applyPurposeDelta(entry, existing, result) {
  const { fields, action } = purposeDelta(entry, existing);
  if (Object.keys(fields).length) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: fields });
  }
  result.purposeAction = action;
  return result;
}

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
  if (entry.whatsappUrlButtons) bootstrapFields.whatsappUrlButtons = entry.whatsappUrlButtons;

  if (!existing) {
    const created = await NotificationMapping.create({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'whatsapp',
      enabled: entry.enabled !== false,
      purpose: entry.purpose || 'UNKNOWN',
      ...bootstrapFields,
    });
    return { entry, action: 'created', id: created._id, purposeAction: 'purpose-created' };
  }

  let result;

  // Named exception: known-wrong legacy template, corrected regardless of
  // whether variables are already set (see fixWhatsappVariableMappings.js's
  // own documented history of this specific bug).
  if (entry.eventName === 'SERVICE_COMPLETION_OTP' && existing.whatsappTemplateName === 'puja_completed') {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    result = { entry, action: 'corrected-legacy-template', id: existing._id };
    return applyPurposeDelta(entry, existing, result);
  }

  // Named exception: known-wrong "remaining balance shows total" mapping,
  // corrected regardless of whether variables are already set (see
  // LEGACY_WRONG_PARTIAL_PAYMENT_VARIABLES above for the incident this
  // traces back to). A mismatch that ISN'T this exact known-wrong signature
  // is still treated as a deliberate admin customization and preserved.
  if (entry.eventName === 'PARTIAL_PAYMENT_RECEIVED'
    && sameVariables(existing.whatsappVariables, LEGACY_WRONG_PARTIAL_PAYMENT_VARIABLES)) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    result = { entry, action: 'corrected-legacy-mapping', id: existing._id };
    return applyPurposeDelta(entry, existing, result);
  }

  if ((existing.whatsappVariables || []).length === 0) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    result = { entry, action: 'configured', id: existing._id };
    return applyPurposeDelta(entry, existing, result);
  }

  const matchesReference = sameVariables(existing.whatsappVariables, entry.whatsappVariables)
    && existing.whatsappTemplateName === entry.whatsappTemplateName;
  result = { entry, action: matchesReference ? 'already-correct' : 'preserved-custom', id: existing._id };
  return applyPurposeDelta(entry, existing, result);
}

/** Same idempotent contract as applyEntry, for the 'email' channel: create if
 * absent, fill in if both emailSubject and emailHtml are blank, otherwise
 * leave an administrator's existing content untouched. */
async function applyEmailEntry(entry) {
  const filter = { eventName: entry.eventName, recipientType: entry.recipientType, channel: 'email' };
  const existing = await NotificationMapping.findOne(filter);

  const bootstrapFields = {
    emailSubject: entry.emailSubject,
    emailHtml: entry.emailHtml,
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
  };

  if (!existing) {
    const created = await NotificationMapping.create({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'email',
      enabled: entry.enabled !== false,
      purpose: entry.purpose || 'UNKNOWN',
      ...bootstrapFields,
    });
    return { entry, action: 'created', id: created._id, purposeAction: 'purpose-created' };
  }

  let result;
  if (!existing.emailSubject && !existing.emailHtml) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    result = { entry, action: 'configured', id: existing._id };
    return applyPurposeDelta(entry, existing, result);
  }

  const matchesReference = existing.emailSubject === entry.emailSubject && existing.emailHtml === entry.emailHtml;
  result = { entry, action: matchesReference ? 'already-correct' : 'preserved-custom', id: existing._id };
  return applyPurposeDelta(entry, existing, result);
}

/** Same idempotent contract as applyEntry, for the 'inapp' channel: create if
 * absent, fill in if both inAppTitle and inAppMessage are blank, otherwise
 * leave an administrator's existing content untouched. */
async function applyInAppEntry(entry) {
  const filter = { eventName: entry.eventName, recipientType: entry.recipientType, channel: 'inapp' };
  const existing = await NotificationMapping.findOne(filter);

  const bootstrapFields = {
    inAppType: entry.inAppType,
    inAppTitle: entry.inAppTitle,
    inAppMessage: entry.inAppMessage,
    bootstrapVersion: BOOTSTRAP_VERSION,
    bootstrappedAt: new Date(),
  };

  if (!existing) {
    const created = await NotificationMapping.create({
      eventName: entry.eventName, recipientType: entry.recipientType, channel: 'inapp',
      enabled: entry.enabled !== false,
      label: entry.label || '',
      purpose: entry.purpose || 'UNKNOWN',
      ...bootstrapFields,
    });
    return { entry, action: 'created', id: created._id, purposeAction: 'purpose-created' };
  }

  let result;
  if (!existing.inAppTitle && !existing.inAppMessage) {
    await NotificationMapping.updateOne({ _id: existing._id }, { $set: bootstrapFields });
    result = { entry, action: 'configured', id: existing._id };
    return applyPurposeDelta(entry, existing, result);
  }

  const matchesReference = existing.inAppType === entry.inAppType
    && existing.inAppTitle === entry.inAppTitle
    && existing.inAppMessage === entry.inAppMessage;
  result = { entry, action: matchesReference ? 'already-correct' : 'preserved-custom', id: existing._id };
  return applyPurposeDelta(entry, existing, result);
}

function buildReportMarkdown(results, emailResults, inAppResults, validation) {
  const by = (action) => results.filter((r) => r.action === action);
  const created = by('created');
  const configured = by('configured');
  const corrected = by('corrected-legacy-template');
  const correctedMapping = by('corrected-legacy-mapping');
  const alreadyCorrect = by('already-correct');
  const preservedCustom = by('preserved-custom');

  const line = (r) => `- \`${r.entry.eventName}\` / ${r.entry.recipientType} (\`${r.id}\`) → \`${r.entry.whatsappTemplateName}\` — purpose: ${r.entry.purpose}`;

  const byChannel = (list, action) => list.filter((r) => r.action === action);
  const emailLine = (r) => `- \`${r.entry.eventName}\` / ${r.entry.recipientType} (\`${r.id}\`) → "${r.entry.emailSubject}" — purpose: ${r.entry.purpose}`;
  const inAppLine = (r) => `- \`${r.entry.eventName}\` / ${r.entry.recipientType} (\`${r.id}\`) → \`${r.entry.inAppType}\` — purpose: ${r.entry.purpose}`;
  const emailCreated = byChannel(emailResults, 'created');
  const emailConfigured = byChannel(emailResults, 'configured');
  const emailAlreadyCorrect = byChannel(emailResults, 'already-correct');
  const emailPreserved = byChannel(emailResults, 'preserved-custom');
  const inAppCreated = byChannel(inAppResults, 'created');
  const inAppConfigured = byChannel(inAppResults, 'configured');
  const inAppAlreadyCorrect = byChannel(inAppResults, 'already-correct');
  const inAppPreserved = byChannel(inAppResults, 'preserved-custom');

  const totalProcessed = results.length + emailResults.length + inAppResults.length;

  // Phase 5 (v1.2.0): purpose outcomes across every channel. A mapping with
  // an explicit admin purpose different from the verified one is preserved
  // (purpose-preserved) — never overwritten.
  const allResults = [...results, ...emailResults, ...inAppResults];
  const purposeBy = (action) => allResults.filter((r) => r.purposeAction === action).length;

  return `# Notification Mappings Bootstrap Report

Generated: ${new Date().toISOString()}
Bootstrap script version: ${BOOTSTRAP_VERSION}
Database: ${mongoose.connection.name} @ ${mongoose.connection.host}

## Summary — WhatsApp

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | ${created.length} |
| Configured (existed, was blank) | ${configured.length} |
| Corrected (known-wrong legacy template) | ${corrected.length} |
| Corrected (known-wrong legacy variable mapping) | ${correctedMapping.length} |
| Already correct (matches reference exactly) | ${alreadyCorrect.length} |
| Preserved (existing custom configuration, untouched) | ${preservedCustom.length} |
| **Total WhatsApp mappings processed** | **${results.length}** |

## Summary — Email

| Outcome | Count |
|---|---|
| Created | ${emailCreated.length} |
| Configured (existed, was blank) | ${emailConfigured.length} |
| Already correct | ${emailAlreadyCorrect.length} |
| Preserved (existing custom content, untouched) | ${emailPreserved.length} |
| **Total Email mappings processed** | **${emailResults.length}** |

## Summary — In-App

| Outcome | Count |
|---|---|
| Created | ${inAppCreated.length} |
| Configured (existed, was blank) | ${inAppConfigured.length} |
| Already correct | ${inAppAlreadyCorrect.length} |
| Preserved (existing custom content, untouched) | ${inAppPreserved.length} |
| **Total In-App mappings processed** | **${inAppResults.length}** |

**Grand total verified mappings processed (all channels): ${totalProcessed}**

## Purpose classification (Phase 5 — WhatsApp consent)

Every verified mapping carries a communication purpose (ACCOUNT / BOOKING /
ORDER / SERVICE / MARKETING). MARKETING-purpose WhatsApp messages require
explicit marketing consent before sending; no verified mapping is MARKETING
today. Purpose follows a fill-if-blank contract independent of channel
content — an administrator-set purpose is never overwritten.

| Outcome | Count |
|---|---|
| Created with purpose | ${purposeBy('purpose-created')} |
| Purpose set (was blank) | ${purposeBy('purpose-set')} |
| Purpose matches verified | ${purposeBy('purpose-matches')} |
| Purpose preserved (admin customization, untouched) | ${purposeBy('purpose-preserved')} |

## Created — WhatsApp
${created.length ? created.map(line).join('\n') : '_none_'}

## Configured (filled in blank whatsappVariables) — WhatsApp
${configured.length ? configured.map(line).join('\n') : '_none_'}

## Corrected (legacy wrong template repointed)
${corrected.length ? corrected.map(line).join('\n') : '_none_'}

## Corrected (legacy wrong variable mapping repointed)
${correctedMapping.length ? correctedMapping.map(line).join('\n') : '_none_'}

## Preserved — existing administrator customization left untouched (WhatsApp)
${preservedCustom.length ? preservedCustom.map(line).join('\n') : '_none_'}

## Created — Email
${emailCreated.length ? emailCreated.map(emailLine).join('\n') : '_none_'}

## Configured (filled in blank subject/HTML) — Email
${emailConfigured.length ? emailConfigured.map(emailLine).join('\n') : '_none_'}

## Preserved — existing administrator content left untouched (Email)
${emailPreserved.length ? emailPreserved.map(emailLine).join('\n') : '_none_'}

## Created — In-App
${inAppCreated.length ? inAppCreated.map(inAppLine).join('\n') : '_none_'}

## Configured (filled in blank title/message) — In-App
${inAppConfigured.length ? inAppConfigured.map(inAppLine).join('\n') : '_none_'}

## Preserved — existing administrator content left untouched (In-App)
${inAppPreserved.length ? inAppPreserved.map(inAppLine).join('\n') : '_none_'}

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check. Note this check
is WhatsApp-specific (Email/In-App have no Meta template to validate against):

${validation.problems.length
    ? validation.problems.map((p) => `- ${p}`).join('\n')
    : '_none — every enabled WhatsApp mapping in this database resolves correctly._'}

---
This report is regenerated every time \`bootstrapNotificationMappings.js\` runs and reflects only the most recent run.
`;
}

/**
 * Full bootstrap run: connects to the target database (MONGO_URI), applies
 * every verified mapping, validates, writes the report, disconnects.
 *
 * Extracted from the old auto-running IIFE so tests can drive the exact
 * same code path against a disposable database with a custom report path;
 * the CLI behavior is byte-for-byte identical when run directly.
 *
 * @param {object} [opts]
 * @param {string} [opts.reportPath]  - where to write the report (defaults
 *   to docs/notification-bootstrap-report.md — CLI behavior).
 * @param {boolean} [opts.leaveConnected=false] - for tests that run this
 *   inside an already-connected suite (skips the final disconnect).
 */
async function run({ reportPath: customReportPath, leaveConnected = false } = {}) {
  // Reuse an already-open connection when present (tests run this against
  // the suite's connected test DB); otherwise connect via MONGO_URI (CLI).
  const wasConnected = mongoose.connection.readyState === 1;
  if (!wasConnected) await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}`);
  console.log(`bootstrapNotificationMappings.js v${BOOTSTRAP_VERSION}`);
  console.log(`Processing ${VERIFIED_MAPPINGS.length} WhatsApp + ${VERIFIED_EMAIL_MAPPINGS.length} Email + ${VERIFIED_INAPP_MAPPINGS.length} In-App verified mapping(s)\n`);

  const results = [];
  for (const entry of VERIFIED_MAPPINGS) {
    const result = await applyEntry(entry);
    results.push(result);
    MappingCache.invalidate(entry.eventName);
    console.log(`${result.action.toUpperCase().padEnd(24)} whatsapp  ${entry.eventName}/${entry.recipientType} (${result.id})`);
  }

  const emailResults = [];
  for (const entry of VERIFIED_EMAIL_MAPPINGS) {
    const result = await applyEmailEntry(entry);
    emailResults.push(result);
    MappingCache.invalidate(entry.eventName);
    console.log(`${result.action.toUpperCase().padEnd(24)} email     ${entry.eventName}/${entry.recipientType} (${result.id})`);
  }

  const inAppResults = [];
  for (const entry of VERIFIED_INAPP_MAPPINGS) {
    const result = await applyInAppEntry(entry);
    inAppResults.push(result);
    MappingCache.invalidate(entry.eventName);
    console.log(`${result.action.toUpperCase().padEnd(24)} inapp     ${entry.eventName}/${entry.recipientType} (${result.id})`);
  }

  const allResults = [...results, ...emailResults, ...inAppResults];
  const stats = allResults.reduce((acc, r) => { acc[r.action] = (acc[r.action] || 0) + 1; return acc; }, {});
  console.log('\n================ STATISTICS (all channels) ================');
  console.log(`Created:                 ${stats['created'] || 0}`);
  console.log(`Configured:              ${stats['configured'] || 0}`);
  console.log(`Corrected (legacy):      ${stats['corrected-legacy-template'] || 0}`);
  console.log(`Corrected (mapping):     ${stats['corrected-legacy-mapping'] || 0}`);
  console.log(`Already correct:         ${stats['already-correct'] || 0}`);
  console.log(`Preserved (customized):  ${stats['preserved-custom'] || 0}`);

  console.log('\nRunning full validation (same check as server startup)...');
  const validation = await validateWhatsAppMappings();
  console.log(`Validation: ${validation.ok}/${validation.total} enabled WhatsApp mapping(s) fully configured, ${validation.problems.length} still need manual attention.`);

  const reportPath = customReportPath || path.resolve(__dirname, '../../../docs/notification-bootstrap-report.md');
  fs.writeFileSync(reportPath, buildReportMarkdown(results, emailResults, inAppResults, validation));
  console.log(`\nReport written to ${reportPath}`);

  if (!wasConnected && !leaveConnected) await mongoose.disconnect();
}

// Run only when invoked directly (node src/scripts/bootstrapNotificationMappings.js)
// — requiring this module (e.g. from tests) must not execute a bootstrap run.
if (require.main === module) {
  run().catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  });
}

module.exports = {
  BOOTSTRAP_VERSION,
  VERIFIED_MAPPINGS,
  VERIFIED_EMAIL_MAPPINGS,
  VERIFIED_INAPP_MAPPINGS,
  purposeDelta,
  applyEntry,
  applyEmailEntry,
  applyInAppEntry,
  buildReportMarkdown,
  run,
};
