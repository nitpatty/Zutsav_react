/**
 * Email Channel
 * Dispatches email notifications for a given mapping + payload.
 *
 * Two modes:
 *  1. Legacy handlers — mapped by event name; delegate to existing email functions.
 *     This preserves battle-tested email HTML without requiring DB storage.
 *  2. Custom template — if mapping.emailSubject + mapping.emailHtml are set,
 *     uses those with {{variable}} interpolation (future use / admin overrides).
 *
 * Admin can enable/disable email per event from the Notification Mapping UI.
 * Future: replace legacy handlers with fully DB-backed email templates.
 */

const { sendEmail } = require('../../src/utils/email');
const { interpolate } = require('../VariableResolver');

// Lazy-require event-specific email functions to avoid circular deps at startup
function _email() { return require('../../src/utils/email'); }

const LEGACY_EMAIL_HANDLERS = {
  PAYMENT_SUCCESS:           (p) => _email().sendBookingConfirmedEmail(p._booking, p._poojaName),
  PARTIAL_PAYMENT_RECEIVED:  (p) => _email().sendPartialPaymentEmail(p._booking, p._poojaName),
  FINAL_PAYMENT_RECEIVED:    (p) => _email().sendFinalPaymentEmail(p._booking, p._poojaName),
  BOOKING_CONFIRMED:         (p) => _email().sendBookingConfirmedEmail(p._booking, p._poojaName),
  BOOKING_CANCELLED:         (p) => _email().sendBookingCancelledEmail(p._booking, p._poojaName, p.booking?.cancelReason),
  BOOKING_REFUNDED:          (p) => _email().sendBookingRefundedEmail(p._booking, p._poojaName),
  SERVICE_COMPLETION_OTP:    (p) => _email().sendCompletionOtpEmail(p._booking, p._poojaName, p.otp),
  INVOICE_GENERATED:         (p) => _email().sendInvoiceEmail(p._booking, p._poojaName),
  FEEDBACK_REQUEST:          (p) => _email().sendFeedbackRequestEmail(p._booking, p._poojaName),
  SERVICE_REMINDER_24H:      (p) => _email().sendServiceReminderEmail && _email().sendServiceReminderEmail(p._booking, p._poojaName, '24h'),
  SERVICE_REMINDER_1H:       (p) => _email().sendServiceReminderEmail && _email().sendServiceReminderEmail(p._booking, p._poojaName, '1h'),
  KYC_APPROVED:              (p) => _email().sendKYCApprovedEmail(p._pandit),
  KYC_REJECTED:              (p) => _email().sendKYCRejectedEmail(p._pandit, p.pandit?.kycRejectionReason || p.reason),
  KYC_REUPLOAD_REQUIRED:     (p) => _email().sendKYCReuploadEmail(p._pandit, p.pandit?.kycRejectionReason || p.reason),
  PANDIT_ASSIGNMENT_PENDING: (p) => _email().sendPanditBookingAssignedEmail(p._pandit, p._booking, p._poojaName),
  PANDIT_ACCEPTED:           (p) => _email().sendPanditAssignedEmail && _email().sendPanditAssignedEmail(p._booking, p._pandit),
  ORDER_SHIPPED:             (p) => _email().sendOrderShippedEmail(p._order, p._shipment),
  ORDER_OUT_FOR_DELIVERY:    (p) => _email().sendOrderStatusEmail(p._order, 'out_for_delivery'),
  ORDER_DELIVERED:           (p) => _email().sendOrderStatusEmail(p._order, 'delivered'),
  ORDER_CANCELLED:           (p) => _email().sendOrderStatusEmail(p._order, 'cancelled'),
  ORDER_REFUNDED:            (p) => _email().sendOrderStatusEmail && _email().sendOrderStatusEmail(p._order, 'refunded'),
  DELIVERY_OTP_SENT:         (p) => _email().sendDeliveryOTPEmail(p._order, p.otp),
};

/**
 * @param {Object} mapping  - NotificationMapping document
 * @param {Object} payload  - Normalized event payload
 * @param {string} email    - Recipient email address
 * @returns {Promise<void>}
 */
async function send(mapping, payload, email) {
  if (!email) return;

  const eventName = payload._eventName || '';

  // Mode 1: Custom HTML template stored in the mapping (admin-overridden)
  if (mapping.emailSubject && mapping.emailHtml) {
    const subject = interpolate(mapping.emailSubject, payload);
    const html    = interpolate(mapping.emailHtml, payload);
    return sendEmail(email, subject, html, {
      event:        eventName,
      templateName: mapping.emailTemplateName || eventName,
    });
  }

  // Mode 2: Legacy handler by event name
  const handler = LEGACY_EMAIL_HANDLERS[eventName];
  if (handler) {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[Email Channel] Legacy handler failed for ${eventName}:`, err.message);
    }
    return;
  }

  console.warn(`[Email Channel] No handler or template for event "${eventName}" on mapping ${mapping._id}`);
}

module.exports = { send };
