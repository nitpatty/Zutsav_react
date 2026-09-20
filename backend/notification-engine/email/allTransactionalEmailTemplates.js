/**
 * All Transactional Email Templates — single source of truth.
 *
 * The ONE declarative registry of every transactional `email`-channel mapping
 * this phase is allowed to bootstrap. `src/scripts/bootstrapAllTransactionalEmailTemplates.js`
 * reads this list and applies only the entries marked
 * `status: 'APPROVED_FOR_BOOTSTRAP'`; everything else is listed here on purpose
 * (so the audit is exhaustive and reviewable) and is reported but never
 * written.
 *
 * STATUS CONTRACT
 *   APPROVED_FOR_BOOTSTRAP — audited: a live emitter exists, the recipient
 *                            email is actually resolved by the dispatcher, and
 *                            the content is transactional. May be created.
 *   BLOCKED               — must never be created by automation. A hard
 *                            technical/policy reason to omit it entirely.
 *   NOT_VERIFIED          — not approved for this phase. `reachable` says
 *                            whether a real emitter with a resolvable email
 *                            exists (true) or not (false); the report maps
 *                            false → SKIPPED-NOT-REACHABLE, true →
 *                            SKIPPED-NOT-VERIFIED.
 *
 * CONTENT CONTRACT (identical to Phase 1 — see phase1EmailTemplates.js)
 *   - emailHtml is authored shell/body markup reusing the shared Phase 1 shell
 *     (buildShellHtml): branded header, body, shared footer marker and shared
 *     CTA marker. Neither the footer nor the CTA is authored per-template.
 *   - Every {{path}} is a canonical payload path (PayloadNormalizer.js) and is
 *     escaped exactly once at render time by VariableResolver.interpolateHtml;
 *     subjects are CR/LF-sanitized by interpolateSubject.
 *   - No localhost/private URL is ever authored into a template.
 *   - Only fields that actually exist on the event's canonical payload are
 *     referenced; each required/optional declaration is verified against the
 *     emitter and the per-event VariableSchemas.
 *
 * The registry is intentionally data-only: no I/O, no DB access, no side
 * effects — so the bootstrap script and the test suite can require it freely.
 *
 * v1.0.0 — all-transactional email bootstrap phase
 */

const { buildShellHtml, BOOKING_CONFIRMED_ENTRY, PAYMENT_SUCCESS_ENTRY } = require('./phase1EmailTemplates');

const STATUS = {
  APPROVED: 'APPROVED_FOR_BOOTSTRAP',
  BLOCKED: 'BLOCKED',
  NOT_VERIFIED: 'NOT_VERIFIED',
};

const APPROVED_STATUSES = [STATUS.APPROVED];
const NON_APPROVED_STATUSES = [STATUS.BLOCKED, STATUS.NOT_VERIFIED];

/** Shared body copy styling — mirrors the Phase 1 authored body exactly. */
const H1_STYLE = 'margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#111827;';
const P_STYLE = 'margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;';
const LABEL_STYLE = 'padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;';
const VALUE_STYLE = 'padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;';
const NOTE_STYLE = 'margin:0 0 18px 0;padding:12px 14px;background-color:#fef2f2;border-left:3px solid #b91c1c;border-radius:0 4px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#374151;';
const CLOSING_STYLE = 'margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;';

/** One label/value row in the shared details card. */
function infoRow(label, value, bold = false) {
  return `
      <tr>
        <td style="${LABEL_STYLE}">${label}</td>
        <td style="${VALUE_STYLE}${bold ? 'font-weight:bold;' : ''}">${value}</td>
      </tr>`;
}

/** A shared details card — only rows with an always-present value by default. */
function infoCard(rows) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">${rows.map((r) => infoRow(r[0], r[1], r[2])).join('')}
    </table>`;
}

/**
 * Build the shared authored body block used by every new template.
 * `greeting` is the raw {{path}} (customer.name for user events, pandit.name
 * for pandit events).
 */
function emailBody({ greeting, intro, rows = [], note = '', closing = '' }) {
  return `
    <h1 style="${H1_STYLE}">Namaste ${greeting}</h1>
    <p style="${P_STYLE}">${intro}</p>
    ${rows.length ? infoCard(rows) : ''}
    ${note ? `<div style="${NOTE_STYLE}">${note}</div>` : ''}
    ${closing ? `<p style="${CLOSING_STYLE}">${closing}</p>` : ''}`;
}

/** Wrap an authored body in the shared Phase 1 shell (header + footer/CTA markers). */
function shell(bodyHtml) {
  return buildShellHtml(bodyHtml);
}

/** An approved transactional email entry. */
function approved(entry) {
  return {
    channel: 'email',
    status: STATUS.APPROVED,
    optionalVariables: [],
    ...entry,
  };
}

/** A non-approved inventory entry (documented, never written). */
function excluded(status, entry) {
  return {
    channel: 'email',
    emailSubject: '',
    emailHtml: '',
    requiredVariables: [],
    optionalVariables: [],
    reachable: false,
    ...entry,
    status,
  };
}

// ── APPROVED — Phase 1 (already live; included so the audit is exhaustive) ──
const PHASE1_APPROVED = [
  approved({
    eventName: BOOKING_CONFIRMED_ENTRY.eventName,
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: BOOKING_CONFIRMED_ENTRY.emailSubject,
    emailHtml: BOOKING_CONFIRMED_ENTRY.emailHtml,
    requiredVariables: ['customer.name', 'booking.number'],
    optionalVariables: ['booking.date', 'booking.time', 'booking.poojaName'],
    actualEmitter: 'src/controllers/booking.controller.js onPaymentSuccess (booking.controller.js:131)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
    reason: 'Phase 1 mapping — reused verbatim from phase1EmailTemplates.js.',
  }),
  approved({
    eventName: PAYMENT_SUCCESS_ENTRY.eventName,
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: PAYMENT_SUCCESS_ENTRY.emailSubject,
    emailHtml: PAYMENT_SUCCESS_ENTRY.emailHtml,
    requiredVariables: ['customer.name', 'booking.number', 'payment.amount'],
    optionalVariables: [],
    actualEmitter: 'src/controllers/booking.controller.js onPaymentSuccess (booking.controller.js:130)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
    reason: 'Phase 1 mapping — reused verbatim from phase1EmailTemplates.js.',
  }),
];

// ── APPROVED — booking lifecycle ────────────────────────────────────────────
const BOOKING_APPROVED = [
  approved({
    eventName: 'SERVICE_REMINDER_24H',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Reminder — your pooja is scheduled for tomorrow',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'This is a friendly reminder that your pooja booking is scheduled for tomorrow. Here are your details:',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Pooja', '{{booking.poojaName}}'],
        ['Date', '{{booking.date}}'],
        ['Time', '{{booking.time}}'],
      ],
      closing: 'Please keep your phone handy — our team may reach out closer to the scheduled time for any last-minute details.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: ['booking.number', 'booking.poojaName', 'booking.date', 'booking.time'],
    actualEmitter: 'src/utils/cleanupJobs.js run24hReminder (cleanupJobs.js:103)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'SERVICE_REMINDER_1H',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Starting soon — your pooja begins in about an hour',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your pooja is scheduled to begin in about an hour. Here are the details:',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Pooja', '{{booking.poojaName}}'],
        ['Time', '{{booking.time}}'],
      ],
      closing: 'Our pandit ji will reach the venue as scheduled. Please ensure someone is available to receive them.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: ['booking.number', 'booking.poojaName', 'booking.time'],
    actualEmitter: 'src/utils/cleanupJobs.js run1hReminder (cleanupJobs.js:156)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'INVOICE_GENERATED',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Invoice for your booking {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your invoice is ready for the pooja booking below.',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Pooja', '{{booking.poojaName}}'],
        ['Total amount', '₹{{booking.amount}}', true],
      ],
      closing: 'You can view all your bookings any time from the button below.',
    })),
    requiredVariables: ['customer.name', 'booking.number', 'booking.amount'],
    optionalVariables: ['booking.poojaName'],
    actualEmitter: 'src/utils/cleanupJobs.js runInvoiceJob (cleanupJobs.js:210); src/controllers/admin.controller.js:1867,1928; src/controllers/booking.controller.js:1130',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
    reason: 'Also emitted on the marketplace order-delivered path (admin.controller.js:3281) where booking.number is blank — the validator safely skips that send.',
  }),
  approved({
    eventName: 'BOOKING_CANCELLED',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Booking Cancelled — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your pooja booking has been cancelled. Here are the details:',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Pooja', '{{booking.poojaName}}'],
        ['Date', '{{booking.date}}'],
        ['Time', '{{booking.time}}'],
        ['Reason', '{{reason}}'],
      ],
      closing: 'If a refund is applicable, it will be processed as per our cancellation policy. If you did not request this, please contact our support team.',
    })),
    requiredVariables: ['customer.name', 'booking.number'],
    optionalVariables: ['booking.poojaName', 'booking.date', 'booking.time', 'reason'],
    actualEmitter: 'src/controllers/booking.controller.js:952 (customer); src/controllers/admin.controller.js:1833 (admin)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'PARTIAL_PAYMENT_RECEIVED',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Partial Payment Received — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'We received a partial payment for your booking. Here are the details:',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Amount received', '₹{{payment.amount}}', true],
        ['Remaining balance', '₹{{booking.remainingAmount}}', true],
      ],
      closing: 'You can pay the remaining balance any time from the button below.',
    })),
    requiredVariables: ['customer.name', 'payment.amount', 'booking.remainingAmount'],
    optionalVariables: ['booking.number'],
    actualEmitter: 'src/controllers/booking.controller.js onPartialPaymentSuccess (booking.controller.js:137)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'FINAL_PAYMENT_RECEIVED',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Final Payment Received — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'We received your final payment. Your booking is now fully paid.',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Amount paid', '₹{{payment.amount}}', true],
        ['Booking total', '₹{{booking.amount}}'],
      ],
      closing: 'Thank you! Your booking is fully confirmed and our team is preparing for your pooja.',
    })),
    requiredVariables: ['customer.name', 'booking.amount'],
    optionalVariables: ['booking.number', 'payment.amount'],
    actualEmitter: 'src/controllers/booking.controller.js onFinalPaymentSuccess (booking.controller.js:142)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'PAYMENT_FAILED',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Payment could not be completed — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your recent payment attempt for this booking could not be completed.',
      rows: [
        ['Booking number', '{{booking.number}}'],
      ],
      closing: 'Your booking is safe. You can retry the payment any time from your bookings page.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: ['booking.number'],
    actualEmitter: 'src/utils/paymentAttempts.js recordAttemptResult (paymentAttempts.js:47)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
    reason: 'The payment amount is intentionally not shown — a failed attempt has no reliable charged amount on the payload.',
  }),
  approved({
    eventName: 'BOOKING_REFUNDED',
    recipientType: 'user',
    purpose: 'BOOKING',
    emailSubject: 'Refund Processed — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'A refund has been processed for your booking.',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Refund amount', '₹{{refund.amount}}', true],
      ],
      closing: 'The amount will reflect in your original payment method as per your bank’s timelines.',
    })),
    requiredVariables: ['customer.name', 'booking.number'],
    optionalVariables: ['refund.amount'],
    actualEmitter: 'src/controllers/admin.controller.js:1197,1857',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
];

// ── APPROVED — marketplace order lifecycle ──────────────────────────────────
const ORDER_APPROVED = [
  approved({
    eventName: 'ORDER_CONFIRMED',
    recipientType: 'user',
    purpose: 'ORDER',
    emailSubject: 'Order Confirmed — {{order.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Thank you for your order. We have confirmed it and will keep you updated as it progresses.',
      rows: [
        ['Order number', '{{order.number}}'],
        ['Order total', '₹{{order.total}}'],
      ],
      closing: 'You can view all your orders any time from the button below.',
    })),
    requiredVariables: ['customer.name', 'order.number'],
    optionalVariables: ['order.total'],
    actualEmitter: 'src/controllers/admin.controller.js updateOrderStatus (admin.controller.js:2198 via ORDER_CONFIRMED)',
    normalizer: 'normalizeOrderPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'ORDER_DELIVERED',
    recipientType: 'user',
    purpose: 'ORDER',
    emailSubject: 'Order Delivered — {{order.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your order has been delivered. We hope you love it.',
      rows: [
        ['Order number', '{{order.number}}'],
        ['Order total', '₹{{order.total}}'],
        ['Courier', '{{order.courierName}}'],
        ['Tracking number', '{{order.trackingNumber}}'],
      ],
      closing: 'Thank you for choosing Zutsav.',
    })),
    requiredVariables: ['customer.name', 'order.number'],
    optionalVariables: ['order.total', 'order.courierName', 'order.trackingNumber'],
    actualEmitter: 'src/controllers/admin.controller.js:2198,2622,2691,3280',
    normalizer: 'normalizeOrderPayload',
    recipientSource: 'payload.customer.email',
    reason: 'Courier/tracking are blank on the OTP-verified delivery path (admin.controller.js:3280) — the rows render empty rather than failing.',
  }),
  approved({
    eventName: 'ORDER_REFUNDED',
    recipientType: 'user',
    purpose: 'ORDER',
    emailSubject: 'Order Refunded — {{order.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'A refund has been processed for your order.',
      rows: [
        ['Order number', '{{order.number}}'],
        ['Order total', '₹{{order.total}}'],
      ],
      closing: 'The amount will reflect in your original payment method as per your bank’s timelines.',
    })),
    requiredVariables: ['customer.name', 'order.number'],
    optionalVariables: ['order.total'],
    actualEmitter: 'src/controllers/admin.controller.js updateOrderStatus (admin.controller.js:2198 via ORDER_REFUNDED)',
    normalizer: 'normalizeOrderPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'KIT_SHIPPED',
    recipientType: 'user',
    purpose: 'ORDER',
    emailSubject: 'Your Pooja Kit Has Been Shipped — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'The samagri kit for your pooja booking has been shipped.',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Courier', '{{kit.courier}}'],
        ['Tracking ID', '{{kit.trackingId}}'],
      ],
      closing: 'We will notify you again once your kit is delivered.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: ['booking.number', 'kit.courier', 'kit.trackingId'],
    actualEmitter: 'src/controllers/admin.controller.js:3093,3133',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.customer.email',
  }),
];

// ── APPROVED — account lifecycle ────────────────────────────────────────────
const ACCOUNT_APPROVED = [
  approved({
    eventName: 'ACCOUNT_DELETED',
    recipientType: 'user',
    purpose: 'ACCOUNT',
    emailSubject: 'Your Zutsav account has been deleted',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'This is to confirm that your Zutsav account has been permanently deleted as requested.',
      rows: [
        ['Name', '{{customer.name}}'],
        ['Requested on', '{{account.requestedDate}}'],
      ],
      closing: 'Thank you for being part of Zutsav. If you have any questions, our support team is here to help.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: ['account.requestedDate'],
    actualEmitter: 'src/utils/cleanupJobs.js performDeletionCleanup (cleanupJobs.js:51)',
    normalizer: 'normalizeUserPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'ACCOUNT_DELETION_CANCELLED',
    recipientType: 'user',
    purpose: 'ACCOUNT',
    emailSubject: 'Your account deletion request has been cancelled',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your scheduled account deletion has been cancelled and your account remains active.',
      rows: [
        ['Name', '{{customer.name}}'],
      ],
      closing: 'No further action is needed from your side. We are glad you are staying with Zutsav.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: [],
    actualEmitter: 'src/controllers/admin.controller.js cancelAccountDeletion (admin.controller.js:903)',
    normalizer: 'normalizeUserPayload',
    recipientSource: 'payload.customer.email',
  }),
  approved({
    eventName: 'ACCOUNT_RESTORED',
    recipientType: 'user',
    purpose: 'ACCOUNT',
    emailSubject: 'Welcome back — your Zutsav account is active',
    emailHtml: shell(emailBody({
      greeting: '{{customer.name}}',
      intro: 'Your account has been restored and is active again.',
      rows: [
        ['Name', '{{customer.name}}'],
      ],
      closing: 'We are glad to have you back. You can continue booking poojas as usual.',
    })),
    requiredVariables: ['customer.name'],
    optionalVariables: [],
    actualEmitter: 'src/controllers/auth.controller.js cancelAccountDeletion (auth.controller.js:687)',
    normalizer: 'normalizeUserPayload',
    recipientSource: 'payload.customer.email',
  }),
];

// ── APPROVED — pandit lifecycle ─────────────────────────────────────────────
const PANDIT_APPROVED = [
  approved({
    eventName: 'PANDIT_APPROVED',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    emailSubject: 'Your Pandit profile has been approved',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'Congratulations! Your Pandit profile on Zutsav has been approved. You can now receive booking requests.',
      rows: [
        ['Name', '{{pandit.name}}'],
      ],
      closing: 'Please keep your profile and availability up to date to get more bookings.',
    })),
    requiredVariables: ['pandit.name'],
    optionalVariables: [],
    actualEmitter: 'src/controllers/admin.controller.js updatePanditStatus (admin.controller.js:630)',
    normalizer: 'normalizePanditPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'KYC_APPROVED',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    emailSubject: 'Your KYC verification is approved',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'Your KYC documents have been verified and approved.',
      rows: [
        ['Name', '{{pandit.name}}'],
      ],
      closing: 'You can now receive bookings on Zutsav. Thank you for completing your verification.',
    })),
    requiredVariables: ['pandit.name'],
    optionalVariables: [],
    actualEmitter: 'src/controllers/admin.controller.js updateKYCStatus (admin.controller.js:662)',
    normalizer: 'normalizePanditPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'KYC_REJECTED',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    emailSubject: 'Action needed — your KYC verification was not approved',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'Unfortunately, your KYC verification could not be approved.',
      rows: [
        ['Name', '{{pandit.name}}'],
        ['Reason', '{{pandit.reason}}'],
      ],
      note: 'Please review the reason above and upload corrected documents from your profile.',
      closing: 'If you have any questions, our support team is happy to help.',
    })),
    requiredVariables: ['pandit.name'],
    optionalVariables: ['pandit.reason'],
    actualEmitter: 'src/controllers/admin.controller.js updateKYCStatus (admin.controller.js:670)',
    normalizer: 'normalizePanditPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'KYC_REUPLOAD_REQUIRED',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    emailSubject: 'Action needed — please re-upload your KYC documents',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'We need you to re-upload your KYC documents to complete verification.',
      rows: [
        ['Name', '{{pandit.name}}'],
        ['Reason', '{{pandit.reason}}'],
      ],
      note: 'Please log in and upload corrected documents from your profile.',
      closing: 'Once re-uploaded, our team will review your documents again.',
    })),
    requiredVariables: ['pandit.name'],
    optionalVariables: ['pandit.reason'],
    actualEmitter: 'src/controllers/admin.controller.js updateKYCStatus (admin.controller.js:678)',
    normalizer: 'normalizePanditPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'PANDIT_POOJA_REQUEST_CREATED',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    emailSubject: 'Pooja request submitted — {{pooja.name}}',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'We received your request to add a new pooja. Our team will review it shortly.',
      rows: [
        ['Pooja name', '{{pooja.name}}'],
        ['Expected price', '₹{{pooja.expectedPrice}}'],
      ],
      closing: 'We will notify you once your request has been reviewed.',
    })),
    requiredVariables: ['pandit.name', 'pooja.name'],
    optionalVariables: ['pooja.expectedPrice'],
    actualEmitter: 'src/controllers/poojaRequest.controller.js (poojaRequest.controller.js:107)',
    normalizer: 'normalizePoojaRequestPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'PANDIT_POOJA_APPROVED',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    emailSubject: 'Pooja request approved — {{pooja.name}}',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'Your pooja request has been approved and is now live on Zutsav.',
      rows: [
        ['Pooja name', '{{pooja.name}}'],
        ['Approved price', '₹{{pooja.approvedPrice}}', true],
      ],
      closing: 'You can start receiving bookings for this pooja.',
    })),
    requiredVariables: ['pandit.name', 'pooja.name', 'pooja.approvedPrice'],
    optionalVariables: [],
    actualEmitter: 'src/controllers/poojaRequest.controller.js (poojaRequest.controller.js:204)',
    normalizer: 'normalizePoojaRequestPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'PANDIT_POOJA_REJECTED',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    emailSubject: 'Update on your pooja request — {{pooja.name}}',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'After review, your pooja request could not be approved.',
      rows: [
        ['Pooja name', '{{pooja.name}}'],
        ['Reason', '{{pooja.rejectionReason}}'],
      ],
      closing: 'You can update the details and submit a new request any time.',
    })),
    requiredVariables: ['pandit.name', 'pooja.name'],
    optionalVariables: ['pooja.rejectionReason'],
    actualEmitter: 'src/controllers/poojaRequest.controller.js (poojaRequest.controller.js:255)',
    normalizer: 'normalizePoojaRequestPayload',
    recipientSource: 'payload.pandit.email',
  }),
  approved({
    eventName: 'PANDIT_ASSIGNMENT_PENDING',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    emailSubject: 'New booking assigned — {{booking.number}}',
    emailHtml: shell(emailBody({
      greeting: '{{pandit.name}}',
      intro: 'A new pooja booking has been assigned to you. Please review the details and accept it from your dashboard.',
      rows: [
        ['Booking number', '{{booking.number}}'],
        ['Pooja', '{{booking.poojaName}}'],
        ['Date', '{{booking.date}}'],
        ['Time', '{{booking.time}}'],
      ],
      closing: 'Please accept or decline promptly so we can keep the customer informed.',
    })),
    requiredVariables: ['pandit.name', 'booking.number'],
    optionalVariables: ['booking.poojaName', 'booking.date', 'booking.time'],
    actualEmitter: 'src/controllers/admin.controller.js assignPandit (admin.controller.js:1760)',
    normalizer: 'normalizeBookingPayload',
    recipientSource: 'payload.pandit.email',
  }),
];

// ── BLOCKED — must never be auto-created ────────────────────────────────────
const BLOCKED = [
  excluded(STATUS.BLOCKED, {
    eventName: 'CAMPAIGN_COUPON',
    recipientType: 'user',
    purpose: 'MARKETING',
    reachable: true,
    actualEmitter: 'src/services/campaignService.js',
    reason: 'Marketing communication. Email marketing consent/unsubscribe infrastructure is not implemented, and campaignService.validateChannel hard-blocks the email channel for campaigns.',
  }),
  excluded(STATUS.BLOCKED, {
    eventName: 'OTP_VERIFICATION',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    reachable: false,
    actualEmitter: 'n/a — dead mapping',
    reason: 'Intentionally disabled dead mapping (disableDeadPanditEmailMappings.js). Must remain disabled and untouched.',
  }),
  excluded(STATUS.BLOCKED, {
    eventName: 'PASSWORD_RESET_EMAIL_OTP',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    reachable: false,
    actualEmitter: 'n/a — dead mapping',
    reason: 'Intentionally disabled dead mapping (disableDeadPanditEmailMappings.js). Must remain disabled and untouched.',
  }),
];

// ── NOT_VERIFIED — audited but not approved for this phase ──────────────────
const NOT_VERIFIED = [
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'ORDER_PLACED',
    recipientType: 'user',
    purpose: 'ORDER',
    reachable: true,
    actualEmitter: 'src/controllers/marketplace.controller.js (marketplace.controller.js:428)',
    reason: 'Default skip. ORDER_PLACED fires at order creation before payment; the transactional post-payment email is ORDER_CONFIRMED (approved).',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'KYC_SUBMITTED',
    recipientType: 'pandit',
    purpose: 'ACCOUNT',
    reachable: true,
    actualEmitter: 'src/controllers/pandit.controller.js (pandit.controller.js:116)',
    reason: 'Default skip. KYC submission is an internal hand-off to review; approval/rejection/reupload (approved) are the actionable pandit-facing emails.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'ACCOUNT_DELETION_REQUESTED',
    recipientType: 'user',
    purpose: 'ACCOUNT',
    reachable: true,
    actualEmitter: 'src/controllers/auth.controller.js (auth.controller.js:640)',
    reason: 'Default skip. Not in the approved account set for this phase.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'FEEDBACK_REQUEST',
    recipientType: 'user',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'none — no emitter',
    reason: 'No emitter. Standalone feedback-asking was removed (Phase 5.1); feedback is an optional action on SERVICE_COMPLETED, never its own message.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'PANDIT_ASSIGNED',
    recipientType: 'user',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'none — no emitter',
    reason: 'No emitter. The live assignment notification is PANDIT_ASSIGNMENT_PENDING to the pandit.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'PAYMENT_CREATED',
    recipientType: 'user',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'none — no emitter',
    reason: 'No emitter in the codebase.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'REFUND_INITIATED',
    recipientType: 'user',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'none — no emitter',
    reason: 'No emitter. Booking refunds are communicated via BOOKING_REFUNDED (approved).',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'REFUND_COMPLETED',
    recipientType: 'user',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'none — no emitter',
    reason: 'No emitter. Booking refunds are communicated via BOOKING_REFUNDED (approved).',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'PANDIT_ACCEPTED',
    recipientType: 'pandit',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'src/controllers/pandit.controller.js (pandit.controller.js:555)',
    reason: 'Not reachable for email: the emitter passes pandit {userId,name,phone} with no email, so the dispatcher cannot resolve a pandit email.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'PANDIT_REJECTED',
    recipientType: 'pandit',
    purpose: 'BOOKING',
    reachable: false,
    actualEmitter: 'src/controllers/pandit.controller.js (pandit.controller.js:607)',
    reason: 'Not reachable for email: the emitter passes pandit {userId,name,phone} with no email.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'PAYOUT_RELEASED',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    reachable: false,
    actualEmitter: 'src/controllers/admin.controller.js (admin.controller.js:2899,2955)',
    reason: 'Not reachable for email: pandit is selected as name/userId/phone only (no email), so the dispatcher cannot resolve a pandit email.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'REFERRAL_BOOKING_CREATED',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    reachable: true,
    actualEmitter: 'src/controllers/booking.controller.js (booking.controller.js:122)',
    reason: 'Pandit Referral flows are explicitly out of scope for this phase.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'REFERRAL_PENDING_REMARK',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    reachable: true,
    actualEmitter: 'src/controllers/booking.controller.js (booking.controller.js:123)',
    reason: 'Pandit Referral flows are explicitly out of scope for this phase.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'REFERRAL_REMARK_SUBMITTED',
    recipientType: 'pandit',
    purpose: 'SERVICE',
    reachable: true,
    actualEmitter: 'src/controllers/referral.controller.js',
    reason: 'Pandit Referral flows are explicitly out of scope for this phase.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'ADMIN_CREATED',
    recipientType: 'admin',
    purpose: 'ACCOUNT',
    reachable: false,
    actualEmitter: 'not audited — out of scope',
    reason: 'Admin-facing notifications are out of scope for transactional customer email bootstrap.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'ADMIN_PASSWORD_RESET',
    recipientType: 'admin',
    purpose: 'ACCOUNT',
    reachable: false,
    actualEmitter: 'not audited — out of scope',
    reason: 'Admin-facing notifications are out of scope for transactional customer email bootstrap.',
  }),
  excluded(STATUS.NOT_VERIFIED, {
    eventName: 'ADMIN_LOGIN',
    recipientType: 'admin',
    purpose: 'ACCOUNT',
    reachable: false,
    actualEmitter: 'not audited — out of scope',
    reason: 'Admin-facing notifications are out of scope for transactional customer email bootstrap.',
  }),
];

const TRANSACTIONAL_EMAIL_TEMPLATES = [
  ...PHASE1_APPROVED,
  ...BOOKING_APPROVED,
  ...ORDER_APPROVED,
  ...ACCOUNT_APPROVED,
  ...PANDIT_APPROVED,
  ...BLOCKED,
  ...NOT_VERIFIED,
];

/** Approved entries only — the set the bootstrap script writes. */
const APPROVED_EMAIL_TEMPLATES = TRANSACTIONAL_EMAIL_TEMPLATES.filter((e) => e.status === STATUS.APPROVED);

module.exports = {
  STATUS,
  APPROVED_STATUSES,
  NON_APPROVED_STATUSES,
  TRANSACTIONAL_EMAIL_TEMPLATES,
  APPROVED_EMAIL_TEMPLATES,
  // Body helpers (exported so tests/reports can reason about authored content)
  emailBody,
  infoCard,
  shell,
};
