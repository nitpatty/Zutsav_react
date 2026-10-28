/**
 * Official booking-invoice mapping (F-02).
 *
 * Source of truth: the PERSISTED Invoice documents returned by
 *   GET /api/invoices/booking/:bookingId  →  { success, booking, invoices: [Invoice] }
 * (backend/src/controllers/invoice.controller.js — the same API the website's
 * InvoicePage uses). Invoices are ordered oldest-first and can be several per
 * booking (e.g. an advance and a final payment), including cancelled ones.
 *
 * Rules this module enforces:
 *  - Amounts, GST split, invoice number/date/status and the customer snapshot come
 *    from the invoice document. Nothing is recalculated from today's catalog prices
 *    or GST settings, and no invoice number is ever substituted (the booking number
 *    is a different identifier and is shown separately as the "Order No").
 *  - Booking invoices store totals, not line items: lines are derived from the booking
 *    exactly as the website does, but every AMOUNT is the persisted one.
 *  - Seller identity: a persisted `sellerSnapshot` wins when present. Booking invoices
 *    carry none (only manual invoices do), so — like the website — the shared company
 *    config is used for them. It is never mixed with a snapshot.
 *  - Nothing is fabricated: missing optional values stay empty.
 */

export const PMT_LABEL = { PARTIAL: 'Advance Payment', REMAINING: 'Final Payment', FULL: 'Full Payment' };

const num = (v) => { const n = Number(v); return v != null && Number.isFinite(n) ? n : 0; };
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const round2 = (n) => Math.round(n * 100) / 100;

/** Validates the response and keeps only customer booking invoices. */
export function mapBookingInvoiceResponse(body) {
  const booking = body?.booking && typeof body.booking === 'object' ? body.booking : null;
  const list = Array.isArray(body?.invoices) ? body.invoices : (body?.invoice ? [body.invoice] : []);
  const invoices = list.filter((i) => i && typeof i === 'object' && str(i.invoiceNumber) && i.source !== 'manual');
  return { booking, invoices };
}

// ── status helpers (ported from the website's InvoicePage) ──────────────────
const ACTIVE_BOOKING_STATUSES = ['paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment', 'completion_requested', 'completed'];

export function resolvePaymentStatus(invoice, b) {
  if (invoice?.status === 'cancelled' || b?.status === 'cancelled') return 'CANCELLED';
  if (!b || !Object.keys(b).length) return 'UNKNOWN';
  if (['FULLY_PAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED'].includes(b.paymentStatus)) return b.paymentStatus;
  return ACTIVE_BOOKING_STATUSES.includes(b.status) ? 'FULLY_PAID' : 'PENDING';
}

/** What happened to the money on a cancelled invoice — from the booking's refund record. */
export function cancelledPaymentNote(b) {
  if (!b || !(num(b.amountPaid) > 0)) return 'Not Applicable';
  if (['completed', 'processed'].includes(b.refund?.status)) return 'Refunded';
  if (['pending', 'approved'].includes(b.refund?.status)) return 'Refund Pending';
  return 'Payment Cancelled';
}

// ── pricing: persisted invoice values only ──────────────────────────────────
export function pricingOf(invoice) {
  const kitGST = num(invoice.kitGST);
  const platformGST = num(invoice.platformGST);
  return {
    poojaAmount: num(invoice.poojaAmount),
    kitAmount: num(invoice.kitAmount),
    kitGST,
    platformFee: num(invoice.platformFee),
    platformGST,
    urgentSurcharge: num(invoice.urgentSurcharge),
    totalTax: invoice.totalGST != null ? num(invoice.totalGST) : kitGST + platformGST,
    grandTotal: num(invoice.grandTotal),
  };
}

const kitsOf = (b) => (b?.kitIds?.length > 0 ? b.kitIds : (b?.kitId ? [b.kitId] : []));

/**
 * Line items: descriptions from the booking (as on the website), amounts from the
 * invoice. A kit's *current* catalog price is only used per kit when the kits'
 * prices add up exactly to the persisted kit amount; otherwise one combined line
 * carries the persisted amount, so lines can never contradict the stored total.
 */
export function buildLineItems(invoice, b, pricing) {
  const items = [];
  const book = b || {};
  const isUrgent = book.bookingType === 'urgent' || book.isUrgent;
  const kits = kitsOf(book);
  const poojaName = str(invoice.poojaName) || str(book.poojaId?.name) || 'Pooja Service';

  if (pricing.poojaAmount > 0) {
    items.push({
      desc: poojaName,
      sub: [
        'Spiritual ceremony service',
        book.language && `Language: ${book.language}`,
        isUrgent && 'Urgent Booking',
        (!book.withKit || kits.length === 0) && 'Kit: Without Samagri',
      ].filter(Boolean).join(' · '),
      qty: 1, rate: pricing.poojaAmount, amt: pricing.poojaAmount,
    });
  }

  if (pricing.kitAmount > 0) {
    const names = kits.map((k) => k.name || 'Samagri Kit');
    const liveSum = round2(kits.reduce((s, k) => s + num(k.discountPrice), 0));
    if (kits.length === 0) {
      items.push({ desc: 'Samagri Kit', sub: 'Pooja samagri kit', qty: 1, rate: pricing.kitAmount, amt: pricing.kitAmount });
    } else if (kits.length === 1) {
      items.push({ desc: names[0], sub: 'Pooja samagri kit', qty: 1, rate: pricing.kitAmount, amt: pricing.kitAmount });
    } else if (liveSum === round2(pricing.kitAmount)) {
      kits.forEach((k) => items.push({ desc: k.name || 'Samagri Kit', sub: 'Pooja samagri kit', qty: 1, rate: num(k.discountPrice), amt: num(k.discountPrice) }));
    } else {
      items.push({ desc: `Samagri Kits (${kits.length})`, sub: names.join(', '), qty: 1, rate: pricing.kitAmount, amt: pricing.kitAmount });
    }
  }

  if (pricing.platformFee > 0) {
    items.push({ desc: 'Platform Convenience Fee', sub: 'Booking, support & service platform charges', qty: 1, rate: pricing.platformFee, amt: pricing.platformFee });
  }

  if (pricing.urgentSurcharge > 0) {
    items.push({
      desc: 'Urgent Booking Surcharge',
      sub: book.urgentHikeType === 'fixed' && book.urgentHikeFixed != null
        ? `Flat hike of ₹${num(book.urgentHikeFixed)} on the Pooja price`
        : (book.urgentHikePercent != null ? `${num(book.urgentHikePercent)}% of the Pooja price` : 'Urgent booking surcharge'),
      qty: 1, rate: pricing.urgentSurcharge, amt: pricing.urgentSurcharge,
    });
  }

  // Old invoice with no component amounts: one line carrying the persisted total (never invented).
  if (items.length === 0 && pricing.grandTotal > 0) {
    items.push({ desc: poojaName, sub: 'Spiritual ceremony service', qty: 1, rate: pricing.grandTotal, amt: pricing.grandTotal });
  }
  return items;
}

// ── tax: persisted gstBreakdown + persisted component taxes ─────────────────
const rateOf = (tax, taxable) => (taxable > 0 && tax > 0 ? round2((tax / taxable) * 100) : null);

export function buildTax(invoice, pricing) {
  const g = invoice.gstBreakdown && typeof invoice.gstBreakdown === 'object' ? invoice.gstBreakdown : null;
  // `split` is only known when the invoice stored a breakdown for a taxed document.
  const hasStoredSplit = !!g && (num(g.cgst) + num(g.sgst) + num(g.igst) > 0);
  const split = hasStoredSplit ? (g.isInterstate ? 'igst' : 'cgst_sgst') : null;
  const total = pricing.totalTax;
  const taxableBase = pricing.platformFee + pricing.kitAmount;
  const overallRate = rateOf(total, taxableBase);

  const rows = [];
  if (pricing.platformFee > 0 && pricing.platformGST > 0) {
    rows.push({ key: 'platform', taxable: pricing.platformFee, tax: pricing.platformGST, rate: rateOf(pricing.platformGST, pricing.platformFee) });
  }
  if (pricing.kitGST > 0) {
    rows.push({ key: 'kit', taxable: pricing.kitAmount, tax: pricing.kitGST, rate: rateOf(pricing.kitGST, pricing.kitAmount) });
  }

  const suffix = overallRate != null ? ` (${overallRate}%)` : '';
  return {
    total,
    split,
    cgst: hasStoredSplit ? num(g.cgst) : 0,
    sgst: hasStoredSplit ? num(g.sgst) : 0,
    igst: hasStoredSplit ? num(g.igst) : 0,
    rows,
    totalLabel: split === 'igst' ? `IGST${suffix}` : split === 'cgst_sgst' ? `GST — CGST + SGST${suffix}` : `GST${suffix}`,
  };
}

// ── seller ──────────────────────────────────────────────────────────────────
export function resolveSeller(invoice, company) {
  const s = invoice.sellerSnapshot;
  if (s && typeof s === 'object' && (str(s.legalName) || str(s.gstin))) {
    return {
      fromSnapshot: true,
      name: str(s.legalName),
      addr1: str(s.address),
      addr2: str(s.state),
      gstin: str(s.gstin),
      pan: str(s.pan),
      email: company.email, phone: company.phone, web: company.web, // contact lines are not part of the snapshot
    };
  }
  return {
    fromSnapshot: false,
    name: 'ZUTSAV PVT. LTD.',
    addr1: company.addr1, addr2: company.addr2, gstin: company.gstin, pan: company.pan,
    email: company.email, phone: company.phone, web: company.web,
  };
}

/** The complete, display-ready model for ONE persisted invoice. */
export function buildInvoiceView(invoice, booking, company) {
  const b = booking || {};
  const ud = b.userDetails || {};
  const pricing = pricingOf(invoice);
  const lineItems = buildLineItems(invoice, b, pricing);
  const tax = buildTax(invoice, pricing);
  const paymentStatus = resolvePaymentStatus(invoice, b);
  const customer = {
    name: str(invoice.customerName) || str(ud.name),
    phone: str(invoice.customerPhone) || str(ud.phone),
    email: str(invoice.customerEmail) || str(ud.email),
    address: str(invoice.customerAddress) || str(ud.address),
    city: str(invoice.customerCity) || str(ud.city),
    district: str(ud.district),
    state: str(invoice.customerState) || str(ud.state),
    pincode: str(invoice.customerPincode) || str(ud.pincode),
  };
  const kits = kitsOf(b);

  return {
    id: invoice._id,
    invoiceNumber: str(invoice.invoiceNumber),
    invoiceDate: invoice.invoiceDate || null,
    status: invoice.status || 'active',
    paymentType: invoice.paymentType || '',
    paymentTypeLabel: PMT_LABEL[invoice.paymentType] || 'Payment Receipt',
    bookingNumber: str(invoice.bookingNumber) || str(b.bookingNumber),
    serviceDate: invoice.scheduledDate || b.scheduledDate || null,
    serviceTime: str(invoice.scheduledTime) || str(b.scheduledTime),
    placeOfSupply: (customer.state || customer.city || 'India').toUpperCase(),
    seller: resolveSeller(invoice, company),
    customer,
    details: {
      service: str(invoice.poojaName) || str(b.poojaId?.name),
      language: str(b.language),
      urgent: !!(b.bookingType === 'urgent' || b.isUrgent),
      location: [customer.address, customer.city].filter(Boolean).join(', '),
      pandit: str(b.panditId?.name) || (['paid', 'pandit_assigned'].includes(b.status) ? 'Being Assigned' : ''),
      kit: b.withKit && kits.length > 0 ? kits.map((k) => k.name || 'Samagri Kit').join(', ') : 'Without Samagri',
    },
    pricing,
    lineItems,
    subtotal: round2(lineItems.reduce((s, i) => s + i.amt, 0)),
    tax,
    payment: {
      status: paymentStatus,
      cancelledNote: paymentStatus === 'CANCELLED' ? cancelledPaymentNote(b) : '',
      orderTotal: pricing.grandTotal,
      previouslyPaid: num(invoice.previouslyPaid),
      thisInvoice: num(invoice.amountPaid),
      outstanding: paymentStatus === 'CANCELLED' ? 0 : num(invoice.outstandingAfter),
      gateway: str(invoice.paymentGateway),
      merchantTransactionId: str(invoice.merchantTransactionId),
      gatewayTransactionId: str(invoice.gatewayTransactionId),
    },
  };
}

/** Compact rows for the multi-invoice "Payment History" list / selector. */
export function summariseInvoice(invoice) {
  return {
    id: invoice._id || invoice.invoiceNumber,
    invoiceNumber: str(invoice.invoiceNumber),
    label: PMT_LABEL[invoice.paymentType] || 'Payment',
    status: invoice.status || 'active',
    date: invoice.invoiceDate || null,
    amountPaid: num(invoice.amountPaid),
    merchantTransactionId: str(invoice.merchantTransactionId),
  };
}
