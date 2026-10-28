// Which of a booking's official invoices is the CURRENT one (display + share on the Invoice screen).
//
// What the data model says (backend/src/models/Invoice.js, backend/src/utils/invoiceGenerator.js):
//  - A booking gets ONE invoice PER PAYMENT (one per PaymentLedger entry): e.g. an advance (`paymentType` PARTIAL) and later a final
//    payment (REMAINING), or a single FULL one.
//  - `invoiceDate` is the time of THAT payment (`ledger.paidAt`), `previouslyPaid` / `outstandingAfter` snapshot the position at
//    that payment — so the invoice of the most recent payment is the one that shows where the booking stands now.
//  - `status` is 'active' | 'cancelled' | 'archived'; invoices are never deleted.
//  - GET /api/invoices/booking/:id returns them ordered by `invoiceDate` ascending (OLDEST FIRST), so index 0 is the oldest payment.
//  - `invoiceVersion` is never set beyond its default of 1 and `invoiceNumber` is a formatted string: neither orders anything, and
//    this module uses neither. Device time and array position are not used as the primary signal either (position only breaks ties).
//
// The rule: the current invoice is the ACTIVE invoice with the latest persisted `invoiceDate`. If none is active (e.g. a cancelled
// booking whose invoices were all cancelled), the latest of all of them is shown — clearly marked by the screen as cancelled — so the
// customer still reaches their document. Older invoices stay selectable. Pure functions; nothing is mutated or recalculated.

const statusOf = (invoice) => (invoice && invoice.status) || 'active';
const timeOf = (invoice) => {
  const t = invoice ? Date.parse(invoice.invoiceDate) : NaN;
  return Number.isFinite(t) ? t : -Infinity;           // an unreadable date never wins over a readable one
};

/** The identifier the screen tracks a selection by (same value as `summariseInvoice(...).id`). */
export const invoiceKey = (invoice) => (invoice && (invoice._id || invoice.invoiceNumber)) || null;

/** Index of the current invoice in `invoices`, or -1 when there are none. Ties go to the later entry in the API's oldest-first order. */
export function currentInvoiceIndex(invoices) {
  if (!Array.isArray(invoices) || invoices.length === 0) return -1;
  const all = invoices.map((_, i) => i);
  const active = all.filter((i) => statusOf(invoices[i]) === 'active');
  const pool = active.length > 0 ? active : all;
  return pool.reduce((best, i) => (best === -1 || timeOf(invoices[i]) >= timeOf(invoices[best]) ? i : best), -1);
}

/**
 * The index to show: the invoice the user explicitly picked (tracked by key, so a reload or a changed order cannot shift it onto a
 * different invoice), otherwise the current one. A picked invoice that is no longer in the list falls back to the current one.
 */
export function resolveSelectedIndex(invoices, selectedKey) {
  if (!Array.isArray(invoices) || invoices.length === 0) return -1;
  const picked = selectedKey == null ? -1 : invoices.findIndex((inv) => invoiceKey(inv) === selectedKey);
  return picked >= 0 ? picked : currentInvoiceIndex(invoices);
}
