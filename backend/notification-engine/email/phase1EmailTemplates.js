/**
 * Phase 1 — Email Templates (first email family: BOOKING)
 *
 * The two mappings this phase owns, both on the `email` channel,
 * recipientType `user`, purpose BOOKING. This module is the ONLY source for
 * the Phase 1 authored email content; the apply script
 * (src/scripts/applyPhase1EmailTemplates.js) upserts these entries using the
 * exact same fill-if-blank / preserve-custom bootstrap contract as the
 * verified bootstrapNotificationMappings applyEmailEntry — it never
 * overwrites an administrator's existing non-blank subject/html, and it never
 * touches the WhatsApp/In-App content of any mapping (OTP/password-reset
 * family and pandit-family included).
 *
 * Render-time contract (unchanged, single escaping rule): the emailHtml here
 * is authored shell/body content where every {{variable}} is escaped exactly
 * once by the single VariableResolver. The shared footer/CTA are NOT part of
 * this authored escaping rule — they are assembled at render time by
 * EmailRenderContext (from trusted config/settings, each value escaped) and
 * swapped in for the two inert markers below. Markers that stay un-rendered
 * are dropped by the shell builder, so a template never leaks a raw marker
 * comment to a real customer.
 */

const {
  FOOTER_MARKER,
  CTA_MARKER,
} = require('./EmailRenderContext');

const PURPOSE = 'BOOKING';

/** Shared header strip rendered above every Phase 1 body. */
const SHELL_HEADER_HTML = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="padding:0;border-radius:6px 6px 0 0;background-color:#b91c1c;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.2;font-weight:bold;color:#ffffff;">
              ZUTSAV
            </td>
            <td style="padding:20px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.2;color:#fecaca;text-align:right;">
              Pooja &amp; Seva Bookings
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`;

/** Wrap authored body HTML in the shared email shell with footer/CTA markers. */
function buildShellHtml(bodyHtml) {
  return `
  <div style="background-color:#f3f4f6;padding:28px 12px;">
    ${SHELL_HEADER_HTML}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:0 0 6px 6px;">
      <tr>
        <td style="padding:28px;">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 24px 28px;">
          ${CTA_MARKER}
          ${FOOTER_MARKER}
        </td>
      </tr>
    </table>
  </div>`;
}

/** Booking Confirmed (user / email). Fixed subject + branded shell body. */
const BOOKING_CONFIRMED_ENTRY = {
  eventName: 'BOOKING_CONFIRMED',
  emailSubject: 'Booking Confirmed — {{booking.number}}',
  emailHtml: buildShellHtml(`
    <h1 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#111827;">Namaste {{customer.name}}</h1>
    <p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
      Your pooja booking has been confirmed. Here are your details:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
      <tr>
        <td style="padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;">Booking number</td>
        <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;font-weight:bold;">{{booking.number}}</td>
      </tr>
      <tr>
        <td style="padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;">Date</td>
        <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">{{booking.date}}</td>
      </tr>
      <tr>
        <td style="padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;">Time</td>
        <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">{{booking.time}}</td>
      </tr>
      <tr>
        <td style="padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;">Pooja</td>
        <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">{{booking.poojaName}}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
      Please keep your phone handy — our team may reach out closer to the scheduled
      time for any last-minute details.
    </p>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
      You can view all your bookings any time from the button below.
    </p>
  `),
};

/** Payment Received (user / email). Fixed subject + branded shell body. */
const PAYMENT_SUCCESS_ENTRY = {
  eventName: 'PAYMENT_SUCCESS',
  emailSubject: 'Payment Received — {{booking.number}}',
  emailHtml: buildShellHtml(`
    <h1 style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;color:#111827;">Namaste {{customer.name}}</h1>
    <p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
      We received your payment for booking <strong>{{booking.number}}</strong>. Thank you!
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
      <tr>
        <td style="padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;">Amount received</td>
        <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;font-weight:bold;">₹{{payment.amount}}</td>
      </tr>
      <tr>
        <td style="padding:3px 12px 3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;white-space:nowrap;">Booking number</td>
        <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;">{{booking.number}}</td>
      </tr>
    </table>
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#374151;">
      Your booking is fully confirmed and our team is preparing for your pooja.
      You can view the details any time from the button below.
    </p>
  `),
};

module.exports = {
  PURPOSE,
  SHELL_HEADER_HTML,
  buildShellHtml,
  BOOKING_CONFIRMED_ENTRY,
  PAYMENT_SUCCESS_ENTRY,
  PHASE1_EMAIL_ENTRIES: [BOOKING_CONFIRMED_ENTRY, PAYMENT_SUCCESS_ENTRY],
};
