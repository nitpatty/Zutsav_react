/**
 * Per-event required-variable declarations.
 *
 * Declares which canonical payload paths (see PayloadNormalizer.js) MUST
 * resolve to a non-blank value for a notification on this event to be
 * considered well-formed. Used by TemplateValidator before every send —
 * if a required variable is blank, the send is skipped and logged rather
 * than delivered broken (e.g. "Dear , your payment of ₹ was received").
 *
 * Events not listed here fall back to DEFAULT_REQUIRED.
 */

const DEFAULT_REQUIRED = ['customer.name'];

const REQUIRED_VARIABLES = {
  // Auth
  OTP_CREATED:               ['customer.name', 'otp.code'],
  OTP_VERIFIED:              ['customer.name'],
  LOGIN_SUCCESS:             ['customer.name'],
  LOGIN_FAILED:              ['customer.name'],
  PASSWORD_RESET_EMAIL_OTP:    ['customer.name', 'otp.code'],
  PASSWORD_RESET_WHATSAPP_OTP: ['customer.name', 'otp.code'],
  USER_REGISTERED:           ['customer.name'],

  // Payment
  PAYMENT_CREATED:           ['customer.name', 'payment.amount'],
  PAYMENT_SUCCESS:           ['customer.name', 'booking.number', 'payment.amount'],
  PAYMENT_FAILED:            ['customer.name', 'payment.amount'],
  PARTIAL_PAYMENT_RECEIVED:  ['customer.name', 'payment.amount', 'booking.amount'],
  FINAL_PAYMENT_RECEIVED:    ['customer.name', 'booking.amount'],
  REFUND_INITIATED:          ['customer.name', 'refund.amount'],
  REFUND_COMPLETED:          ['customer.name', 'refund.amount'],

  // Booking
  BOOKING_CREATED:           ['customer.name', 'booking.number'],
  BOOKING_CONFIRMED:         ['customer.name', 'booking.number', 'booking.date', 'booking.time'],
  BOOKING_CANCELLED:         ['customer.name', 'booking.number'],
  BOOKING_REFUNDED:          ['customer.name', 'booking.number'],
  BOOKING_COMPLETED:         ['customer.name', 'booking.number'],
  SERVICE_COMPLETION_OTP:    ['customer.name', 'otp.code'],
  INVOICE_GENERATED:         ['customer.name', 'booking.number', 'booking.amount'],

  // Pandit
  PANDIT_ASSIGNED:           ['customer.name', 'pandit.name', 'booking.number'],
  PANDIT_ASSIGNMENT_PENDING: ['pandit.name', 'booking.number'],
  PANDIT_ACCEPTED:           ['customer.name', 'pandit.name', 'booking.number'],
  PANDIT_REGISTERED:         ['pandit.name'],
  PANDIT_APPROVED:           ['pandit.name'],
  PANDIT_POOJA_REQUEST_CREATED: ['pandit.name', 'pooja.name'],
  PANDIT_POOJA_APPROVED:        ['pandit.name', 'pooja.name', 'pooja.approvedPrice'],
  PANDIT_POOJA_REJECTED:        ['pandit.name', 'pooja.name'],
  KYC_APPROVED:              ['pandit.name'],
  KYC_REJECTED:              ['pandit.name'],
  KYC_REUPLOAD_REQUIRED:     ['pandit.name'],
  PAYOUT_RELEASED:           ['pandit.name', 'payment.amount'],

  // Marketplace
  ORDER_CREATED:             ['customer.name', 'order.number'],
  ORDER_PLACED:              ['customer.name', 'order.number', 'order.total'],
  ORDER_PAID:                ['customer.name', 'order.number'],
  ORDER_SHIPPED:             ['customer.name', 'order.number'],
  ORDER_OUT_FOR_DELIVERY:    ['customer.name', 'order.number'],
  ORDER_DELIVERED:           ['customer.name', 'order.number'],
  ORDER_CANCELLED:           ['customer.name', 'order.number'],
  ORDER_REFUNDED:            ['customer.name', 'order.number'],
  DELIVERY_OTP_SENT:         ['customer.name', 'otp.code'],
  MARKETPLACE_ORDER:         ['customer.name', 'order.number'],
};

function getRequiredVariables(eventName) {
  return REQUIRED_VARIABLES[eventName] || DEFAULT_REQUIRED;
}

module.exports = { REQUIRED_VARIABLES, DEFAULT_REQUIRED, getRequiredVariables };
