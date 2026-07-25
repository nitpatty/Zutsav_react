import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { urls } from '../config';

export const formatDate = (date, fmt = 'dd MMM yyyy') => {
  try { return format(typeof date === 'string' ? parseISO(date) : date, fmt); }
  catch { return '—'; }
};

export const formatTime = (date) => formatDate(date, 'HH:mm');
export const formatDateTime = (date) => formatDate(date, 'dd MMM yyyy, HH:mm');

// Formats a raw "HH:mm" booking-slot string (already stored in 24-hour form)
// into a consistent, zero-padded 24-hour display — the single formatter
// every screen showing a booking time slot should use, so none of them
// independently reintroduce 12-hour/AM-PM formatting. Mirrors the web
// equivalent in frontend/src/components/booking/constants.js.
export const formatSlotTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
};
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

// ── Amount in Indian words (for invoices) ──────────────────────
const W1 = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
             'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
             'Seventeen', 'Eighteen', 'Nineteen'];
const W10 = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function _w(n) {
  if (n === 0) return '';
  if (n < 20)  return W1[n] + ' ';
  if (n < 100) return W10[Math.floor(n / 10)] + (n % 10 ? ' ' + W1[n % 10] : '') + ' ';
  if (n < 1000)     return W1[Math.floor(n / 100)] + ' Hundred ' + _w(n % 100);
  if (n < 100000)   return _w(Math.floor(n / 1000)) + 'Thousand ' + _w(n % 1000);
  if (n < 10000000) return _w(Math.floor(n / 100000)) + 'Lakh ' + _w(n % 100000);
  return _w(Math.floor(n / 10000000)) + 'Crore ' + _w(n % 10000000);
}
export const amtWords = (num) => {
  if (!num || num === 0) return 'Zero Rupees Only';
  const r = Math.floor(num);
  const p = Math.round((num - r) * 100);
  let s = _w(r).trim() + ' Rupees';
  if (p > 0) s += ' and ' + _w(p).trim() + ' Paise';
  return s + ' Only';
};

export const fmtInvoiceDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtInvoiceLong = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
