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
  PANDIT_POOJA_REQUEST_CREATED: 'PANDIT_POOJA_REQUEST_CREATED',
  PANDIT_POOJA_APPROVED:        'PANDIT_POOJA_APPROVED',
  PANDIT_POOJA_REJECTED:        'PANDIT_POOJA_REJECTED',
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
  KIT_SHIPPED:                  'KIT_SHIPPED',
  KIT_DELIVERED:                'KIT_DELIVERED',

  // ── Referrals ───────────────────────────────────────────────────────
  REFERRAL_BOOKING_CREATED:     'REFERRAL_BOOKING_CREATED',   // notify pandit + admin
  REFERRAL_PENDING_REMARK:      'REFERRAL_PENDING_REMARK',    // notify pandit: submit remark
  REFERRAL_REMARK_SUBMITTED:    'REFERRAL_REMARK_SUBMITTED',  // notify admin

  // ── Account ─────────────────────────────────────────────────────────
  ACCOUNT_DELETION_REQUESTED:   'ACCOUNT_DELETION_REQUESTED',
  ACCOUNT_DELETION_CANCELLED:   'ACCOUNT_DELETION_CANCELLED',
  ACCOUNT_RESTORED:             'ACCOUNT_RESTORED',
  ACCOUNT_DELETED:              'ACCOUNT_DELETED',
  ORDER_PLACED:                 'ORDER_PLACED',

  // ── Added for the unified event-driven rebuild (additive only —
  //    existing keys/values above are never renamed or removed) ───────
  OTP_CREATED:                  'OTP_CREATED',
  OTP_VERIFIED:                 'OTP_VERIFIED',
  LOGIN_SUCCESS:                'LOGIN_SUCCESS',
  LOGIN_FAILED:                 'LOGIN_FAILED',
  // PASSWORD_RESET_EMAIL_OTP / PASSWORD_RESET_WHATSAPP_OTP below replace the
  // old generic PASSWORD_RESET (never emitted, no flow existed behind it) —
  // channel-specific so each can carry its own template/wording.
  PASSWORD_RESET_EMAIL_OTP:     'PASSWORD_RESET_EMAIL_OTP',
  PASSWORD_RESET_WHATSAPP_OTP:  'PASSWORD_RESET_WHATSAPP_OTP',
  BOOKING_CREATED:              'BOOKING_CREATED',
  BOOKING_COMPLETED:            'BOOKING_COMPLETED',
  PAYMENT_CREATED:              'PAYMENT_CREATED',
  PAYMENT_FAILED:               'PAYMENT_FAILED',
  ORDER_CREATED:                'ORDER_CREATED',
  ORDER_PAID:                   'ORDER_PAID',
  PANDIT_REGISTERED:            'PANDIT_REGISTERED',
  REFUND_INITIATED:             'REFUND_INITIATED',
  REFUND_COMPLETED:             'REFUND_COMPLETED',
  MARKETPLACE_ORDER:            'MARKETPLACE_ORDER',
  BLOG_PUBLISHED:               'BLOG_PUBLISHED',
  FESTIVAL_CREATED:             'FESTIVAL_CREATED',
  TEMPLE_CREATED:               'TEMPLE_CREATED',
  NEWSLETTER_SUBSCRIBED:        'NEWSLETTER_SUBSCRIBED',

  // ── Admin Management ────────────────────────────────────────────────
  ADMIN_CREATED:                 'ADMIN_CREATED',
  ADMIN_UPDATED:                 'ADMIN_UPDATED',
  ADMIN_SUSPENDED:               'ADMIN_SUSPENDED',
  ADMIN_ACTIVATED:               'ADMIN_ACTIVATED',
  ADMIN_PASSWORD_RESET:          'ADMIN_PASSWORD_RESET',
  ADMIN_LOGIN:                   'ADMIN_LOGIN',
  ADMIN_LOGOUT:                  'ADMIN_LOGOUT',

  // ── Coupon Marketing & Campaigns (Phase: Coupon Campaign Foundation) ─
  // A coupon marketing campaign broadcast. The intended recipientType for
  // campaign mappings is 'user'; the mapping MUST be classified purpose
  // 'MARKETING' so the WhatsApp outbound consent gate stays active (a
  // campaign only ever reaches users who are opted-in to WhatsApp
  // marketing — see WhatsAppChannel.send + campaignService).
  CAMPAIGN_COUPON:               'CAMPAIGN_COUPON',
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
  PANDIT_POOJA_REQUEST_CREATED: { label: 'Pooja Request Submitted',     category: 'Pandit'      },
  PANDIT_POOJA_APPROVED:        { label: 'Pooja Request Approved',      category: 'Pandit'      },
  PANDIT_POOJA_REJECTED:        { label: 'Pooja Request Rejected',      category: 'Pandit'      },
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
  KIT_SHIPPED:                  { label: 'Kit Shipped',               category: 'Booking'     },
  KIT_DELIVERED:                { label: 'Kit Delivered',             category: 'Booking'     },
  REFERRAL_BOOKING_CREATED:     { label: 'Referral Booking Created',  category: 'Referral'    },
  REFERRAL_PENDING_REMARK:      { label: 'Referral Remark Required',  category: 'Referral'    },
  REFERRAL_REMARK_SUBMITTED:    { label: 'Referral Remark Submitted',   category: 'Referral'    },
  ACCOUNT_DELETION_REQUESTED:   { label: 'Account Deletion Requested',  category: 'Account'     },
  ACCOUNT_DELETION_CANCELLED:   { label: 'Account Deletion Cancelled',  category: 'Account'     },
  ACCOUNT_RESTORED:             { label: 'Account Restored',            category: 'Account'     },
  ACCOUNT_DELETED:              { label: 'Account Permanently Deleted', category: 'Account'     },
  ORDER_PLACED:                 { label: 'Order Placed (Marketplace)',   category: 'Marketplace' },

  // ── Added for the unified event-driven rebuild ───────────────────────
  OTP_CREATED:                  { label: 'OTP Created',                 category: 'Auth'        },
  OTP_VERIFIED:                 { label: 'OTP Verified',                category: 'Auth'        },
  LOGIN_SUCCESS:                { label: 'Login Success',               category: 'Auth'        },
  LOGIN_FAILED:                 { label: 'Login Failed',                category: 'Auth'        },
  PASSWORD_RESET_EMAIL_OTP:     { label: 'Password Reset OTP (Email)',    category: 'Auth'        },
  PASSWORD_RESET_WHATSAPP_OTP:  { label: 'Password Reset OTP (WhatsApp)', category: 'Auth'        },
  BOOKING_CREATED:              { label: 'Booking Created',             category: 'Booking'     },
  BOOKING_COMPLETED:            { label: 'Booking Completed',           category: 'Booking'     },
  PAYMENT_CREATED:              { label: 'Payment Created',             category: 'Payment'     },
  PAYMENT_FAILED:               { label: 'Payment Failed',              category: 'Payment'     },
  ORDER_CREATED:                { label: 'Order Created',               category: 'Marketplace' },
  ORDER_PAID:                   { label: 'Order Paid',                  category: 'Marketplace' },
  PANDIT_REGISTERED:            { label: 'Pandit Registered',           category: 'Pandit'      },
  REFUND_INITIATED:             { label: 'Refund Initiated',            category: 'Payment'     },
  REFUND_COMPLETED:             { label: 'Refund Completed',            category: 'Payment'     },
  MARKETPLACE_ORDER:            { label: 'Marketplace Order',           category: 'Marketplace' },
  BLOG_PUBLISHED:               { label: 'Blog Published',              category: 'Content'     },
  FESTIVAL_CREATED:             { label: 'Festival Created',            category: 'Content'     },
  TEMPLE_CREATED:               { label: 'Temple Created',              category: 'Content'     },
  NEWSLETTER_SUBSCRIBED:        { label: 'Newsletter Subscribed',       category: 'Marketing'   },

  // ── Admin Management ─────────────────────────────────────────────────
  ADMIN_CREATED:                 { label: 'Admin Account Created',      category: 'Admin Management' },
  ADMIN_UPDATED:                 { label: 'Admin Account Updated',      category: 'Admin Management' },
  ADMIN_SUSPENDED:               { label: 'Admin Account Suspended',    category: 'Admin Management' },
  ADMIN_ACTIVATED:               { label: 'Admin Account Activated',    category: 'Admin Management' },
  ADMIN_PASSWORD_RESET:          { label: 'Admin Password Reset',       category: 'Admin Management' },
  ADMIN_LOGIN:                   { label: 'Admin Login',                category: 'Admin Management' },
  ADMIN_LOGOUT:                  { label: 'Admin Logout',               category: 'Admin Management' },
  CAMPAIGN_COUPON:               { label: 'Coupon Campaign',            category: 'Marketing'   },
};

module.exports = { EVENTS, EVENT_CATEGORIES };
