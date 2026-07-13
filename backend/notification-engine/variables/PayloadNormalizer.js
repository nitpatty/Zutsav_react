/**
 * Payload Normalizer
 *
 * THE fix for the "wrong customer name / wrong amount" bug: every business
 * event normalizes its raw Mongoose documents (Booking, Order, Pandit, User)
 * into ONE canonical payload shape here, exactly once, before the event is
 * emitted. Every template/channel downstream reads from this same shape —
 * there is no longer a separate ad hoc "which field has the name" decision
 * made per email/WhatsApp function.
 *
 * Canonical shape (all keys always present, empty string/0 when unknown —
 * never undefined, so {{path}} interpolation never renders "undefined"):
 *   {
 *     customer: { userId, name, phone, email, address },
 *     booking:  { id, number, date, time, amount, status, language },
 *     payment:  { amount, method, transactionId, status },
 *     order:    { id, number, total, status },
 *     pandit:   { userId, name, phone, email },
 *     kit:      { amount },
 *     refund:   { amount, status },
 *     otp:      { code },
 *   }
 *
 * `customer.userId`/`pandit.userId` are routing metadata (which User
 * document/Socket.IO room to notify) — not meant for template display,
 * but kept alongside the display fields so there is one payload object,
 * not a parallel "who to notify" side-channel.
 */

function toPlain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

const emptyCustomer = () => ({ userId: '', name: '', phone: '', email: '', address: '' });

/**
 * Handles a raw ObjectId, a populated User document/ref field, a plain id
 * string, or a plain literal object with no real id at all (e.g. the
 * synthetic {name,email,phone} passed for pre-registration OTP, where no
 * User document exists yet) — the last case must resolve to '', not a
 * stringified "[object Object]".
 */
function idOf(refOrId) {
  if (!refOrId) return '';
  if (typeof refOrId === 'object') {
    if (refOrId._id) return String(refOrId._id);
    if (typeof refOrId.toHexString === 'function') return refOrId.toHexString(); // raw ObjectId instance
    return ''; // plain object with no real id available
  }
  return String(refOrId);
}

/**
 * Resolve the customer identity for a booking.
 * Precedence: userDetails captured at booking time (what the customer
 * actually typed for THIS booking) — falls back to the authenticated
 * User profile only for fields userDetails didn't capture (there is no
 * email field guaranteed on userDetails).
 */
function customerFromBooking(booking, user) {
  const ud = booking.userDetails || {};
  return {
    userId:  idOf(user) || idOf(booking.userId),
    name:    ud.name    || user?.name  || '',
    phone:   ud.phone   || user?.phone || '',
    email:   ud.email   || user?.email || '',
    address: ud.address || '',
  };
}

/**
 * Resolve the customer identity for a marketplace order.
 * shippingAddress has no email field by schema — email must come from the
 * populated User document.
 */
function customerFromOrder(order, user) {
  const sa = order.shippingAddress || {};
  const populatedUser = user || (order.userId && typeof order.userId === 'object' ? order.userId : null);
  return {
    userId:  idOf(populatedUser) || idOf(order.userId),
    name:    sa.name    || populatedUser?.name  || '',
    phone:   sa.phone   || populatedUser?.phone || '',
    email:   populatedUser?.email || '',
    address: sa.address || '',
  };
}

function customerFromUser(user) {
  if (!user) return emptyCustomer();
  return { userId: idOf(user), name: user.name || '', phone: user.phone || '', email: user.email || '', address: '' };
}

function pandItInfo(pandit) {
  if (!pandit) return { userId: '', name: '', phone: '', email: '' };
  return { userId: idOf(pandit.userId), name: pandit.name || '', phone: pandit.phone || '', email: pandit.email || '' };
}

/**
 * Backward-compatible aliases for admin-authored templates written against
 * the pre-rebuild ad hoc payload shape ({{user.name}}, {{booking.bookingNumber}},
 * {{booking.scheduledDate}}, {{booking.scheduledTime}}, {{booking.amountPaid}},
 * {{booking.grandTotal}}) — confirmed live in the production NotificationMapping
 * collection. New templates should prefer the canonical customer.name /
 * booking.number etc., but existing authored content keeps resolving correctly without a
 * content migration. Applied once, at the end of every normalize*Payload().
 */
function withLegacyAliases(payload) {
  return {
    ...payload,
    user: payload.customer,
    booking: {
      ...payload.booking,
      bookingNumber: payload.booking.number,
      scheduledDate: payload.booking.date,
      scheduledTime: payload.booking.time,
      amountPaid:    payload.payment.amount,
      grandTotal:    payload.booking.amount,
    },
  };
}

/**
 * Normalize a booking-centric event (booking created/confirmed/cancelled,
 * payment success/partial/final, service completion, etc.)
 *
 * @param {object} opts
 * @param {object} opts.booking  - Booking Mongoose doc or plain object (required)
 * @param {object} [opts.user]   - populated User doc, if available
 * @param {object} [opts.pandit] - populated Pandit doc, if a pandit is involved
 * @param {string} [opts.poojaName]
 * @param {object} [opts.payment] - { amount, method, transactionId, status }
 * @param {object} [opts.refund]  - { amount, status }
 * @param {string} [opts.otp]
 * @param {string} [opts.reason] - e.g. pandit rejection reason, cancellation reason
 * @param {object} [opts.kit]    - { courier, trackingId } for kit shipment/delivery events
 */
function normalizeBookingPayload({ booking, user, pandit, poojaName, payment, refund, otp, reason, kit } = {}) {
  const b = toPlain(booking) || {};
  const u = toPlain(user);
  const p = toPlain(pandit);

  return withLegacyAliases({
    customer: customerFromBooking(b, u),
    booking: {
      id:       String(b._id || ''),
      number:   b.bookingNumber || '',
      date:     b.scheduledDate || null,
      time:     b.scheduledTime || '',
      amount:   b.grandTotal ?? b.amount ?? 0,
      status:   b.status || '',
      language: b.language || '',
      poojaName: poojaName || '',
    },
    payment: {
      amount:        payment?.amount ?? b.amountPaid ?? 0,
      method:        payment?.method || b.paymentProvider || '',
      transactionId: payment?.transactionId || b.phonePeTransactionId || b.razorpayPaymentId || '',
      status:        payment?.status || b.paymentStatus || '',
    },
    order: { id: '', number: '', total: 0, status: '' },
    pandit: pandItInfo(p),
    kit: { amount: b.kitAmount ?? 0, courier: kit?.courier || '', trackingId: kit?.trackingId || '' },
    refund: { amount: refund?.amount ?? 0, status: refund?.status || '' },
    otp: { code: otp || '' },
    reason: reason || refund?.reason || '',
  });
}

/**
 * Normalize an order-centric event (order placed/shipped/delivered, etc.)
 *
 * @param {object} opts
 * @param {object} opts.order   - Order Mongoose doc or plain object (required)
 * @param {object} [opts.user]  - populated User doc, if available (falls back to order.userId if populated)
 * @param {object} [opts.shipment] - { courierName, trackingNumber }
 * @param {string} [opts.reason] - e.g. cancellation/refund reason
 * @param {string} [opts.otp]    - delivery OTP code
 */
function normalizeOrderPayload({ order, user, shipment, reason, otp } = {}) {
  const o = toPlain(order) || {};
  const u = toPlain(user);

  return withLegacyAliases({
    customer: customerFromOrder(o, u),
    booking: { id: '', number: '', date: null, time: '', amount: 0, status: '', language: '', poojaName: '' },
    payment: { amount: o.totalAmount ?? 0, method: o.paymentProvider || '', transactionId: '', status: o.status || '' },
    order: {
      id:     String(o._id || ''),
      number: o.orderNumber || '',
      total:  o.totalAmount ?? 0,
      status: o.status || '',
      courierName:     shipment?.courierName || '',
      trackingNumber:  shipment?.trackingNumber || '',
    },
    pandit: { name: '', phone: '', email: '' },
    kit: { amount: 0 },
    refund: { amount: 0, status: o.refundStatus || '' },
    otp: { code: otp || '' },
    reason: reason || '',
  });
}

/**
 * Normalize a pandit-lifecycle event (registration, KYC approve/reject, payout).
 */
function normalizePanditPayload({ pandit, user, reason, amount, batchId, bookingCount } = {}) {
  const p = toPlain(pandit) || {};
  const u = toPlain(user);

  return withLegacyAliases({
    customer: customerFromUser(u),
    booking: { id: '', number: '', date: null, time: '', amount: 0, status: '', language: '', poojaName: '' },
    payment: { amount: amount ?? 0, method: '', transactionId: '', status: '' },
    order: { id: '', number: '', total: 0, status: '' },
    pandit: { ...pandItInfo(p), reason: reason || '', batchId: batchId || '', bookingCount: bookingCount || 0 },
    kit: { amount: 0 },
    refund: { amount: 0, status: '' },
    otp: { code: '' },
  });
}

/**
 * Normalize a pandit custom-pooja-request lifecycle event (submitted,
 * approved, rejected). Adds a `pooja` key on top of the canonical shape —
 * every other normalize*Payload() leaves `pooja` at its usual empty/absent
 * state, so templates on other events never see it populated.
 */
function normalizePoojaRequestPayload({ request, pandit } = {}) {
  const r = toPlain(request) || {};
  const p = toPlain(pandit) || {};

  return withLegacyAliases({
    customer: emptyCustomer(),
    booking: { id: '', number: '', date: null, time: '', amount: 0, status: '', language: '', poojaName: '' },
    payment: { amount: 0, method: '', transactionId: '', status: '' },
    order: { id: '', number: '', total: 0, status: '' },
    pandit: pandItInfo(p),
    kit: { amount: 0 },
    refund: { amount: 0, status: '' },
    otp: { code: '' },
    pooja: {
      name:             r.poojaName || '',
      expectedPrice:    r.expectedPrice ?? 0,
      approvedPrice:    r.adminApprovedPrice ?? 0,
      rejectionReason:  r.rejectionReason || '',
    },
  });
}

/**
 * Normalize a plain user/auth event (registration, login, OTP, password
 * reset, account deletion/restoration). `user` may be a plain object with
 * just name/email/phone (pre-registration OTP — no User document exists yet).
 */
function normalizeUserPayload({ user, otp, reason, scheduledDate, requestedDate } = {}) {
  const u = toPlain(user) || {};
  return withLegacyAliases({
    customer: customerFromUser(u),
    booking: { id: '', number: '', date: null, time: '', amount: 0, status: '', language: '', poojaName: '' },
    payment: { amount: 0, method: '', transactionId: '', status: '' },
    order: { id: '', number: '', total: 0, status: '' },
    pandit: { name: '', phone: '', email: '' },
    kit: { amount: 0 },
    refund: { amount: 0, status: '' },
    otp: { code: otp || '' },
    account: { scheduledDeletionDate: scheduledDate || null, requestedDate: requestedDate || null },
    reason: reason || '',
  });
}

module.exports = {
  normalizeBookingPayload,
  normalizeOrderPayload,
  normalizePanditPayload,
  normalizePoojaRequestPayload,
  normalizeUserPayload,
};
