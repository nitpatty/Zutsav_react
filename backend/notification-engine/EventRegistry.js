/**
 * Notification Event Registry
 * Canonical list of all platform events that can trigger notifications.
 * Event names are SCREAMING_SNAKE_CASE and must never be changed after release.
 */

const EVENTS = {
  // ── Auth ────────────────────────────────────────────────────────────
  OTP_VERIFICATION:             'OTP_VERIFICATION',
  USER_REGISTERED:              'USER_REGISTERED',

  // ── Payment ─────────────────────────────────────────────────────────
  PAYMENT_SUCCESS:              'PAYMENT_SUCCESS',
  PARTIAL_PAYMENT_RECEIVED:     'PARTIAL_PAYMENT_RECEIVED',
  FINAL_PAYMENT_RECEIVED:       'FINAL_PAYMENT_RECEIVED',

  // ── Booking ─────────────────────────────────────────────────────────
  BOOKING_CONFIRMED:            'BOOKING_CONFIRMED',
  BOOKING_CANCELLED:            'BOOKING_CANCELLED',
  BOOKING_REFUNDED:             'BOOKING_REFUNDED',
  SERVICE_COMPLETION_OTP:       'SERVICE_COMPLETION_OTP',
  SERVICE_REMINDER_24H:         'SERVICE_REMINDER_24H',
  SERVICE_REMINDER_1H:          'SERVICE_REMINDER_1H',
  SERVICE_COMPLETED:            'SERVICE_COMPLETED',
  INVOICE_GENERATED:            'INVOICE_GENERATED',
  FEEDBACK_REQUEST:             'FEEDBACK_REQUEST',

  // ── Pandit Assignment ───────────────────────────────────────────────
  PANDIT_ASSIGNED:              'PANDIT_ASSIGNED',         // notify user: pandit was assigned
  PANDIT_ASSIGNMENT_PENDING:    'PANDIT_ASSIGNMENT_PENDING', // notify pandit: new booking to accept
  PANDIT_ACCEPTED:              'PANDIT_ACCEPTED',         // notify user + admin: pandit accepted
  PANDIT_REJECTED:              'PANDIT_REJECTED',         // notify admin: pandit rejected

  // ── Pandit Lifecycle ────────────────────────────────────────────────
  PANDIT_APPROVED:              'PANDIT_APPROVED',
  KYC_SUBMITTED:                'KYC_SUBMITTED',
  KYC_APPROVED:                 'KYC_APPROVED',
  KYC_REJECTED:                 'KYC_REJECTED',
  KYC_REUPLOAD_REQUIRED:        'KYC_REUPLOAD_REQUIRED',
  PAYOUT_RELEASED:              'PAYOUT_RELEASED',

  // ── Marketplace Orders ──────────────────────────────────────────────
  ORDER_CONFIRMED:              'ORDER_CONFIRMED',
  ORDER_PACKED:                 'ORDER_PACKED',
  ORDER_SHIPPED:                'ORDER_SHIPPED',
  ORDER_OUT_FOR_DELIVERY:       'ORDER_OUT_FOR_DELIVERY',
  ORDER_DELIVERED:              'ORDER_DELIVERED',
  ORDER_CANCELLED:              'ORDER_CANCELLED',
  ORDER_REFUNDED:               'ORDER_REFUNDED',
  DELIVERY_OTP_SENT:            'DELIVERY_OTP_SENT',

  // ── Referrals ───────────────────────────────────────────────────────
  REFERRAL_BOOKING_CREATED:     'REFERRAL_BOOKING_CREATED',   // notify pandit + admin
  REFERRAL_PENDING_REMARK:      'REFERRAL_PENDING_REMARK',    // notify pandit: submit remark
  REFERRAL_REMARK_SUBMITTED:    'REFERRAL_REMARK_SUBMITTED',  // notify admin

  // ── Account ─────────────────────────────────────────────────────────
  ACCOUNT_DELETION_REQUESTED:   'ACCOUNT_DELETION_REQUESTED',
  ACCOUNT_DELETION_CANCELLED:   'ACCOUNT_DELETION_CANCELLED',
  ACCOUNT_RESTORED:             'ACCOUNT_RESTORED',
  ORDER_PLACED:                 'ORDER_PLACED',
};

// Category metadata for admin UI grouping
const EVENT_CATEGORIES = {
  OTP_VERIFICATION:             { label: 'OTP Verification',            category: 'Auth'        },
  USER_REGISTERED:              { label: 'User Registered',             category: 'Auth'        },
  PAYMENT_SUCCESS:              { label: 'Payment Success',             category: 'Payment'     },
  PARTIAL_PAYMENT_RECEIVED:     { label: 'Partial Payment Received',    category: 'Payment'     },
  FINAL_PAYMENT_RECEIVED:       { label: 'Final Payment Received',      category: 'Payment'     },
  BOOKING_CONFIRMED:            { label: 'Booking Confirmed',           category: 'Booking'     },
  BOOKING_CANCELLED:            { label: 'Booking Cancelled',           category: 'Booking'     },
  BOOKING_REFUNDED:             { label: 'Booking Refunded',            category: 'Booking'     },
  SERVICE_COMPLETION_OTP:       { label: 'Service Completion OTP',      category: 'Booking'     },
  SERVICE_REMINDER_24H:         { label: 'Service Reminder (24h)',      category: 'Booking'     },
  SERVICE_REMINDER_1H:          { label: 'Service Reminder (1h)',       category: 'Booking'     },
  SERVICE_COMPLETED:            { label: 'Service Completed',           category: 'Booking'     },
  INVOICE_GENERATED:            { label: 'Invoice Generated',           category: 'Booking'     },
  FEEDBACK_REQUEST:             { label: 'Feedback Request',            category: 'Booking'     },
  PANDIT_ASSIGNED:              { label: 'Pandit Assigned (User View)', category: 'Pandit'      },
  PANDIT_ASSIGNMENT_PENDING:    { label: 'New Booking (Pandit View)',   category: 'Pandit'      },
  PANDIT_ACCEPTED:              { label: 'Pandit Accepted Booking',     category: 'Pandit'      },
  PANDIT_REJECTED:              { label: 'Pandit Rejected Booking',     category: 'Pandit'      },
  PANDIT_APPROVED:              { label: 'Pandit Profile Approved',     category: 'Pandit'      },
  KYC_SUBMITTED:                { label: 'KYC Submitted',              category: 'Pandit'      },
  KYC_APPROVED:                 { label: 'KYC Approved',               category: 'Pandit'      },
  KYC_REJECTED:                 { label: 'KYC Rejected',               category: 'Pandit'      },
  KYC_REUPLOAD_REQUIRED:        { label: 'KYC Re-upload Required',     category: 'Pandit'      },
  PAYOUT_RELEASED:              { label: 'Payout Released',            category: 'Pandit'      },
  ORDER_CONFIRMED:              { label: 'Order Confirmed',            category: 'Marketplace' },
  ORDER_PACKED:                 { label: 'Order Packed',               category: 'Marketplace' },
  ORDER_SHIPPED:                { label: 'Order Shipped',              category: 'Marketplace' },
  ORDER_OUT_FOR_DELIVERY:       { label: 'Order Out for Delivery',     category: 'Marketplace' },
  ORDER_DELIVERED:              { label: 'Order Delivered',            category: 'Marketplace' },
  ORDER_CANCELLED:              { label: 'Order Cancelled',            category: 'Marketplace' },
  ORDER_REFUNDED:               { label: 'Order Refunded',             category: 'Marketplace' },
  DELIVERY_OTP_SENT:            { label: 'Delivery OTP Sent',         category: 'Marketplace' },
  REFERRAL_BOOKING_CREATED:     { label: 'Referral Booking Created',  category: 'Referral'    },
  REFERRAL_PENDING_REMARK:      { label: 'Referral Remark Required',  category: 'Referral'    },
  REFERRAL_REMARK_SUBMITTED:    { label: 'Referral Remark Submitted',   category: 'Referral'    },
  ACCOUNT_DELETION_REQUESTED:   { label: 'Account Deletion Requested',  category: 'Account'     },
  ACCOUNT_DELETION_CANCELLED:   { label: 'Account Deletion Cancelled',  category: 'Account'     },
  ACCOUNT_RESTORED:             { label: 'Account Restored',            category: 'Account'     },
  ORDER_PLACED:                 { label: 'Order Placed (Marketplace)',   category: 'Marketplace' },
};

module.exports = { EVENTS, EVENT_CATEGORIES };
