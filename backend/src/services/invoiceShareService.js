/**
 * Invoice sharing — token handling, eligibility policy and the customer-safe
 * public DTO.
 *
 * Security model (see also InvoiceShareLink):
 *   - The URL is a bearer credential: 256-bit random token, base64url.
 *   - Only SHA-256(token) is used for lookup; the encrypted copy exists solely
 *     so an authenticated admin can retrieve the same link again.
 *   - Public responses are built from explicit allowlists below — a Mongoose
 *     document is never serialized directly.
 */

const crypto = require('crypto');
const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const OfflinePayment = require('../models/OfflinePayment');
const InvoiceShareLink = require('../models/InvoiceShareLink');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url, unpadded
const SHAREABLE_STATUSES = ['active', 'cancelled'];

/* ── Token primitives ─────────────────────────────────────────────────────── */

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isWellFormedToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

function encryptionKey() {
  const secret = process.env.INVOICE_SHARE_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('INVOICE_SHARE_SECRET or JWT_SECRET must be configured');
  return crypto.createHash('sha256').update(`invoice-share-link:v1:${secret}`).digest();
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

/** @returns {string|null} null when the record cannot be decrypted (e.g. secret rotated) */
function decryptToken(blob) {
  try {
    const [iv, tag, ct] = String(blob).split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const token = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return isWellFormedToken(token) ? token : null;
  } catch {
    return null;
  }
}

const sharePath = (token) => `/share/invoice/${token}`;

/* ── Eligibility policy ───────────────────────────────────────────────────────
 * Shareable: a persisted invoice that is active or cancelled (a cancelled
 * invoice is shared WITH its cancelled state). Not shareable: archived
 * invoices, and booking invoices whose booking record can no longer be loaded
 * (the customer view cannot be rendered faithfully). Drafts never reach this
 * point — manual bills only become Invoice documents at finalization.        */
async function getShareEligibility(invoice) {
  if (!invoice || !invoice.invoiceNumber) {
    return { eligible: false, reason: 'Only finalized invoices can be shared.' };
  }
  if (invoice.status === 'archived') {
    return { eligible: false, reason: 'Archived invoices cannot be shared.' };
  }
  if (!SHAREABLE_STATUSES.includes(invoice.status)) {
    return { eligible: false, reason: 'This invoice status cannot be shared.' };
  }
  if (invoice.source === 'manual') {
    if (!Array.isArray(invoice.lineItems) || invoice.lineItems.length === 0 || !invoice.sellerSnapshot) {
      return { eligible: false, reason: 'This manual invoice has no saved line items to share.' };
    }
    return { eligible: true, reason: '' };
  }
  if (!invoice.bookingId || !(await Booking.exists({ _id: invoice.bookingId }))) {
    return { eligible: false, reason: 'The booking behind this invoice could not be found.' };
  }
  return { eligible: true, reason: '' };
}

/* ── Link lifecycle ───────────────────────────────────────────────────────── */

async function createShareRecord(invoiceId, adminId) {
  const token = generateToken();
  const record = await InvoiceShareLink.create({
    invoiceId,
    tokenHash: hashToken(token),
    tokenCipher: encryptToken(token),
    createdBy: adminId || null,
  });
  return { record, token };
}

/** Shape returned to admins. `path` is present only when the token is retrievable. */
function toAdminShare(record) {
  if (!record) return null;
  const base = {
    status: record.status,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt || null,
  };
  if (record.status !== 'active') return base;
  const token = decryptToken(record.tokenCipher);
  return token
    ? { ...base, path: sharePath(token), linkAvailable: true }
    : { ...base, linkAvailable: false };
}

/* ── Customer-safe DTO ────────────────────────────────────────────────────── */

const maskPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 4 ? `${'X'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : '';
};

const maskEmail = (e) => {
  const [local, domain] = String(e || '').split('@');
  return local && domain ? `${local[0]}***@${domain}` : '';
};

const pick = (obj, keys) => {
  const out = {};
  const src = obj || {};
  keys.forEach((k) => { if (src[k] !== undefined) out[k] = src[k]; });
  return out;
};

const LINE_KEYS   = ['lineType', 'name', 'variantLabel', 'sku', 'hsn', 'unit', 'quantity', 'unitPrice', 'discount', 'taxRate', 'taxAmount', 'lineTotal'];
const SELLER_KEYS = ['legalName', 'gstin', 'pan', 'address', 'state', 'stateCode'];
const GST_KEYS    = ['cgst', 'sgst', 'igst', 'isInterstate'];
const TAX_KEYS    = ['taxApplied', 'taxMode', 'manualTaxRate', 'taxableValue', 'totalGST', 'grandTotal'];

/** Fields common to both invoice kinds. Never includes ids, notes or cancel reasons. */
function baseInvoiceDto(invoice) {
  return {
    invoiceNumber: invoice.invoiceNumber,
    source: invoice.source === 'manual' ? 'manual' : 'booking',
    invoiceDate: invoice.invoiceDate,
    status: invoice.status,
    cancelledAt: invoice.status === 'cancelled' ? invoice.cancelledAt || null : null,
    paymentType: invoice.paymentType,
    amountPaid: invoice.amountPaid,
    previouslyPaid: invoice.previouslyPaid || 0,
    outstandingAfter: invoice.outstandingAfter || 0,
    gstBreakdown: pick(invoice.gstBreakdown, GST_KEYS),
    ...pick(invoice, TAX_KEYS),
  };
}

async function buildManualDto(invoice) {
  const rows = await OfflinePayment.find({ invoiceId: invoice._id }).sort({ createdAt: 1 }).lean();
  const sum = (kind) => rows.filter((r) => r.kind === kind).reduce((s, r) => s + (r.amount || 0), 0);
  const netReceived = Math.round((sum('RECEIPT') - sum('REVERSAL')) * 100) / 100;
  return {
    invoice: {
      ...baseInvoiceDto(invoice),
      customerName: invoice.customerName,
      customerPhone: maskPhone(invoice.customerPhone),
      customerEmail: maskEmail(invoice.customerEmail),
      customerAddress: invoice.customerAddress,
      customerCity: invoice.customerCity,
      customerState: invoice.customerState,
      customerPincode: invoice.customerPincode,
      lineItems: (invoice.lineItems || []).map((l) => pick(l, LINE_KEYS)),
      sellerSnapshot: pick(invoice.sellerSnapshot, SELLER_KEYS),
    },
    // Dates/amounts/method only — references, notes and operator names stay internal.
    payments: rows.map((r) => ({ kind: r.kind, method: r.method, amount: r.amount, receivedAt: r.receivedAt || r.createdAt })),
    paymentSummary: {
      netReceived,
      outstanding: Math.max(0, Math.round(((invoice.grandTotal || 0) - netReceived) * 100) / 100),
    },
  };
}

async function buildBookingDto(invoice) {
  const b = await Booking.findById(invoice.bookingId)
    .populate('poojaId', 'name')
    .populate('panditId', 'name')
    .populate('kitIds', 'name discountPrice')
    .populate('kitId', 'name discountPrice')
    .lean();
  if (!b) return null;
  const kits = (b.kitIds && b.kitIds.length ? b.kitIds : (b.kitId ? [b.kitId] : []))
    .map((k) => pick(k, ['name', 'discountPrice']));
  const ud = b.userDetails || {};
  return {
    invoice: {
      ...baseInvoiceDto(invoice),
      ...pick(invoice, ['poojaAmount', 'kitAmount', 'kitGST', 'platformFee', 'platformGST', 'urgentSurcharge']),
    },
    booking: {
      ...pick(b, [
        'bookingNumber', 'scheduledDate', 'scheduledTime', 'language', 'bookingType', 'isUrgent', 'withKit',
        'urgentHikeType', 'urgentHikePercent', 'urgentHikeFixed', 'status', 'paymentStatus', 'amountPaid',
        'remainingAmount', 'amount', 'createdAt',
        'poojaAmount', 'kitAmount', 'kitGST', 'platformFee', 'platformGST', 'urgentSurcharge', 'grandTotal',
        'baseAmount', 'commissionAmount', 'gstAmount',
      ]),
      poojaId: pick(b.poojaId, ['name']),
      panditId: b.panditId ? pick(b.panditId, ['name']) : null,
      kitIds: kits,
      refund: pick(b.refund, ['status']),
      userDetails: {
        name: ud.name,
        phone: maskPhone(ud.phone),
        email: maskEmail(ud.email),
        address: ud.address, city: ud.city, district: ud.district, state: ud.state, pincode: ud.pincode,
      },
    },
  };
}

/** Public payload for an invoice, or null when it cannot be rendered safely. */
async function buildPublicInvoiceDto(invoice) {
  return invoice.source === 'manual' ? buildManualDto(invoice) : buildBookingDto(invoice);
}

/**
 * Resolve a raw token to its invoice. Returns null for every failure mode
 * (malformed, unknown, revoked, ineligible, missing invoice) so callers can
 * answer all of them identically.
 */
async function resolveShareToken(token) {
  if (!isWellFormedToken(token)) return null;
  const link = await InvoiceShareLink.findOne({ tokenHash: hashToken(token), status: 'active' }).lean();
  if (!link) return null;
  const invoice = await Invoice.findById(link.invoiceId).lean();
  if (!invoice) return null;
  const { eligible } = await getShareEligibility(invoice);
  return eligible ? invoice : null;
}

module.exports = {
  TOKEN_RE,
  generateToken,
  hashToken,
  isWellFormedToken,
  encryptToken,
  decryptToken,
  sharePath,
  getShareEligibility,
  createShareRecord,
  toAdminShare,
  buildPublicInvoiceDto,
  resolveShareToken,
};
