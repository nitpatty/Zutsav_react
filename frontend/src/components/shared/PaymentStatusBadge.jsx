import React from 'react';

// Canonical booking-status label/color map — single source of truth so pages stop
// re-implementing their own copy (MyBookings.jsx, AdminDashboard.jsx, InvoicePage.jsx
// previously each had their own).
export const STATUS_META = {
  pending_payment:      { label: 'Pending Payment',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  paid:                 { label: 'Confirmed',          color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  pandit_assigned:      { label: 'Pandit Assigned',   color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200' },
  pandit_accepted:      { label: 'Pandit Confirmed',  color: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200' },
  pending_reassignment: { label: 'Finding Pandit',    color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  completion_requested: { label: 'Verifying',         color: 'text-indigo-700',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  completed:            { label: 'Completed',         color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  cancelled:            { label: 'Cancelled',         color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200' },
  refunded:             { label: 'Refunded',          color: 'text-gray-700',    bg: 'bg-gray-50',    border: 'border-gray-200' },
  closed:               { label: 'Closed',            color: 'text-gray-500',    bg: 'bg-gray-50',    border: 'border-gray-200' },
};

export const PAYMENT_STATUS_META = {
  PENDING:          { label: 'Payment Pending',  color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  PARTIALLY_PAID:   { label: 'Partially Paid',   color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  FULLY_PAID:       { label: 'Fully Paid',       color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200'  },
  REFUNDED:         { label: 'Refunded',         color: 'text-gray-700',   bg: 'bg-gray-50',   border: 'border-gray-200'   },
  FAILED:           { label: 'Payment Failed',   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
};

/**
 * Resolves ONE badge for a booking — never both a status badge and a payment
 * badge at once. While a booking is still awaiting payment (status ===
 * 'pending_payment'), the payment axis is the only informative one, so that's
 * what's shown ("Payment Pending" / "Payment Failed"). Once payment is settled
 * (or admin approves Pay Later/COD), the booking-lifecycle label takes over.
 */
export function resolveBookingBadge({ status, paymentStatus, paymentWorkflow }) {
  if (status === 'pending_payment') {
    return PAYMENT_STATUS_META[paymentStatus] || PAYMENT_STATUS_META.PENDING;
  }
  if (status === 'paid' && paymentWorkflow === 'PAY_LATER') {
    return { label: 'Confirmed · Pay Later', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' };
  }
  if (status === 'paid' && paymentWorkflow === 'COD') {
    return { label: 'Confirmed · COD', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' };
  }
  return STATUS_META[status] || STATUS_META.pending_payment;
}

export default function PaymentStatusBadge({ status, paymentStatus, paymentWorkflow, className = '' }) {
  const meta = resolveBookingBadge({ status, paymentStatus, paymentWorkflow });
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border whitespace-nowrap ${meta.bg} ${meta.color} ${meta.border} ${className}`}>
      {meta.label}
    </span>
  );
}
