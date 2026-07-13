import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { urls } from '../config';

export const formatDate = (date, fmt = 'dd MMM yyyy') => {
  try { return format(typeof date === 'string' ? parseISO(date) : date, fmt); }
  catch { return '—'; }
};

export const formatTime = (date) => formatDate(date, 'hh:mm a');
export const formatDateTime = (date) => formatDate(date, 'dd MMM yyyy, hh:mm a');
export const timeAgo = (date) => {
  try { return formatDistanceToNow(typeof date === 'string' ? parseISO(date) : date, { addSuffix: true }); }
  catch { return '—'; }
};

// Preserves decimal precision (no auto-rounding) — shows up to 2 decimals, only when present.
export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0);

export const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';

export const formatStatus = (status) =>
  (status || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const truncate = (str, n = 80) =>
  str && str.length > n ? str.slice(0, n) + '…' : (str || '');

export const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const isValidPhone = (p) => /^[6-9]\d{9}$/.test(p);
export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Whole-day difference between `date` and today (negative = past, 0 = today).
export const daysUntil = (date) => {
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
};

export const bookingStatusColor = {
  pending_payment:     '#6B7280',
  paid:                '#2563EB',
  pandit_assigned:     '#7C3AED',
  pandit_accepted:     '#059669',
  pending_reassignment:'#D97706',
  completion_requested:'#0891B2',
  completed:           '#16A34A',
  cancelled:           '#DC2626',
};

export const orderStatusColor = {
  pending_payment: '#6B7280',
  paid:            '#2563EB',
  confirmed:       '#7C3AED',
  packed:          '#D97706',
  shipped:         '#0891B2',
  out_for_delivery:'#EA580C',
  delivered:       '#16A34A',
  cancelled:       '#DC2626',
  refunded:        '#9CA3AF',
};

export const kycStatusColor = {
  not_submitted:    '#6B7280',
  submitted:        '#2563EB',
  approved:         '#16A34A',
  rejected:         '#DC2626',
  reupload_required:'#9333EA',
};

export const refundStatusColor = {
  none:      '#6B7280',
  pending:   '#D97706',
  approved:  '#2563EB',
  rejected:  '#DC2626',
  processed: '#0891B2',
  completed: '#16A34A',
};

export const blogStatusColor = {
  draft:          '#6B7280',
  pending_review: '#D97706',
  published:      '#16A34A',
  rejected:       '#DC2626',
  archived:       '#9CA3AF',
  scheduled:      '#7C3AED',
};

export const shipmentStatusColor = {
  pending_courier_selection: '#6B7280',
  created:          '#2563EB',
  picked_up:        '#7C3AED',
  in_transit:       '#0891B2',
  out_for_delivery: '#EA580C',
  delivered:        '#16A34A',
  failed_delivery:  '#DC2626',
  cancelled:        '#DC2626',
  returned:         '#9CA3AF',
};

// Humanizes Booking.auditLog action strings (e.g. "status_changed_to_cancelled")
// for a customer-facing timeline.
export const formatAuditAction = (action) =>
  (action || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const referralStatusColor = {
  CREATED:          '#6B7280',
  SENT:             '#2563EB',
  OPENED:           '#7C3AED',
  BOOKED:           '#0891B2',
  PENDING_REMARK:   '#D97706',
  REMARK_SUBMITTED: '#059669',
  ADMIN_REVIEW:     '#EA580C',
  ASSIGNED:         '#2563EB',
  COMPLETED:        '#16A34A',
  SETTLED:          '#16A34A',
  EXPIRED:          '#9CA3AF',
};

// Builds the shareable public referral URL from a token, matching web's
// `{origin}/r/{token}` pattern (frontend/src/pages/PanditDashboard.jsx).
export const referralUrl = (token) => `${urls.webUrl}/r/${token}`;
