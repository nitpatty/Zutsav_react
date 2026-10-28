import { formatStatus } from './helpers';

// Display labels for booking, payment and refund statuses and the payment mode. The value itself is an API constant and
// is never changed or sent anywhere in translated form — only the text shown for a KNOWN value is translated; an unknown
// value falls back to the humanized text exactly as before. (English texts equal formatStatus(), including the
// upper-case payment statuses/modes the app has always shown.)
const BOOKING_KEYS = {
  pending_payment:      'bookings.stPendingPayment',
  paid:                 'orders.statusPaid',
  pandit_assigned:      'bookings.stPanditAssigned',
  pandit_accepted:      'bookings.stPanditAccepted',
  pending_reassignment: 'bookings.stPendingReassignment',
  completion_requested: 'bookings.stCompletionRequested',
  completed:            'bookings.stCompleted',
  cancelled:            'orders.statusCancelled',
};

const PAYMENT_KEYS = {
  PENDING:        'bookings.payPending',
  PARTIALLY_PAID: 'bookings.payPartial',
  FULLY_PAID:     'bookings.payFull',
  REFUNDED:       'bookings.payRefunded',
  FAILED:         'bookings.payFailed',
};

const REFUND_KEYS = {
  none:      'bookings.rfNone',
  pending:   'bookings.rfPending',
  approved:  'bookings.rfApproved',
  rejected:  'bookings.rfRejected',
  processed: 'bookings.rfProcessed',
  completed: 'bookings.stCompleted',
};

const MODE_KEYS = {
  FULL:    'bookings.modeFull',
  PARTIAL: 'bookings.modePartial',
};

const has = (map, value) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(map, value);
const label = (map) => (value, t) => (has(map, value) ? t(map[value]) : formatStatus(value));

export const bookingStatusLabel = label(BOOKING_KEYS);
export const paymentStatusLabel = label(PAYMENT_KEYS);
export const refundStatusLabel = label(REFUND_KEYS);
export const paymentModeLabel = label(MODE_KEYS);
