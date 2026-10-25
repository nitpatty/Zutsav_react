/**
 * Invoice share links.
 *
 * Admin management (mounted under /api/admin, behind protect + authorize('admin')):
 *   GET  /invoices/:id/share             current state — never creates anything
 *   POST /invoices/:id/share             create the link, or reuse the existing active one
 *   POST /invoices/:id/share/regenerate  revoke the active link and issue a new token
 *   POST /invoices/:id/share/revoke      revoke the active link
 *
 * Public (mounted at /api/public/invoices, NO authentication):
 *   GET  /:token                         read-only, customer-safe invoice DTO
 *
 * Nothing here writes to invoices, payments, stock or ledgers, and no raw token
 * is ever logged, audited or placed in an error message.
 */

const Invoice = require('../models/Invoice');
const InvoiceShareLink = require('../models/InvoiceShareLink');
const svc = require('../services/invoiceShareService');
const { audit } = require('../services/auditService');

const NOT_AVAILABLE = 'This invoice link is invalid or is no longer available.';

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}

async function loadInvoice(id) {
  if (!/^[a-f0-9]{24}$/i.test(String(id || ''))) throw httpError(404, 'Invoice not found');
  const invoice = await Invoice.findById(id).lean();
  if (!invoice) throw httpError(404, 'Invoice not found');
  return invoice;
}

async function requireEligible(invoice) {
  const eligibility = await svc.getShareEligibility(invoice);
  if (!eligibility.eligible) throw httpError(409, eligibility.reason);
}

const activeLinkOf = (invoiceId) => InvoiceShareLink.findOne({ invoiceId, status: 'active' });

function auditShare(req, invoice, action, record, note) {
  // Only identifiers and the lifecycle state — never the token or its hash.
  audit(req, {
    module: 'invoice', action, severity: action === 'create_invoice_share_link' ? 'info' : 'warning',
    targetType: 'invoice', targetId: invoice._id, targetName: invoice.invoiceNumber,
    newValues: { shareLinkId: record ? String(record._id) : null, source: invoice.source || 'booking', invoiceStatus: invoice.status },
    note,
  }).catch(() => {});
}

/* ── Admin ─────────────────────────────────────────────────────────────────── */

exports.getInvoiceShare = async (req, res, next) => {
  try {
    const invoice = await loadInvoice(req.params.id);
    const eligibility = await svc.getShareEligibility(invoice);
    const record = await activeLinkOf(invoice._id)
      || await InvoiceShareLink.findOne({ invoiceId: invoice._id }).sort({ createdAt: -1 });
    res.json({ success: true, eligible: eligibility.eligible, reason: eligibility.reason, share: svc.toAdminShare(record) });
  } catch (err) { next(err); }
};

exports.createInvoiceShare = async (req, res, next) => {
  try {
    const invoice = await loadInvoice(req.params.id);
    await requireEligible(invoice);

    let record = await activeLinkOf(invoice._id);
    if (record) {
      // Reopening Share reuses the live link — no new token, nothing invalidated.
      return res.json({ success: true, reused: true, share: svc.toAdminShare(record) });
    }
    try {
      ({ record } = await svc.createShareRecord(invoice._id, req.user._id));
    } catch (err) {
      if (err && err.code === 11000) {
        // Lost a race with a concurrent request: reuse the winner.
        record = await activeLinkOf(invoice._id);
        if (record) return res.json({ success: true, reused: true, share: svc.toAdminShare(record) });
      }
      throw err;
    }
    auditShare(req, invoice, 'create_invoice_share_link', record, 'Public invoice link created');
    res.status(201).json({ success: true, reused: false, share: svc.toAdminShare(record) });
  } catch (err) { next(err); }
};

exports.regenerateInvoiceShare = async (req, res, next) => {
  try {
    const invoice = await loadInvoice(req.params.id);
    await requireEligible(invoice);

    // Revoke first: the old token stops resolving before the new one exists.
    await InvoiceShareLink.updateMany(
      { invoiceId: invoice._id, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: req.user._id } }
    );
    let record;
    try {
      ({ record } = await svc.createShareRecord(invoice._id, req.user._id));
    } catch (err) {
      if (err && err.code === 11000) record = await activeLinkOf(invoice._id);
      if (!record) throw err;
    }
    auditShare(req, invoice, 'regenerate_invoice_share_link', record, 'Public invoice link regenerated; previous link revoked');
    res.status(201).json({ success: true, share: svc.toAdminShare(record) });
  } catch (err) { next(err); }
};

exports.revokeInvoiceShare = async (req, res, next) => {
  try {
    const invoice = await loadInvoice(req.params.id); // revoking never needs eligibility
    const record = await InvoiceShareLink.findOneAndUpdate(
      { invoiceId: invoice._id, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: req.user._id } },
      { new: true }
    );
    if (!record) throw httpError(404, 'This invoice has no active share link');
    auditShare(req, invoice, 'revoke_invoice_share_link', record, 'Public invoice link revoked');
    res.json({ success: true, share: svc.toAdminShare(record) });
  } catch (err) { next(err); }
};

/* ── Public ────────────────────────────────────────────────────────────────── */

// Invalid, unknown, revoked, ineligible and malformed tokens are indistinguishable.
const notAvailable = (res) => res.status(404).json({ success: false, message: NOT_AVAILABLE });

exports.getPublicInvoice = async (req, res) => {
  try {
    const invoice = await svc.resolveShareToken(req.params.token);
    if (!invoice) return notAvailable(res);
    const dto = await svc.buildPublicInvoiceDto(invoice);
    if (!dto) return notAvailable(res);
    res.json({ success: true, ...dto });
  } catch (err) {
    // Deliberately not next(err): the shared error handler logs full stacks.
    // Tokens are hashed before any query, so the message cannot contain one.
    console.error('[PublicInvoice] lookup failed:', err && err.message);
    res.status(500).json({ success: false, message: 'Unable to load this invoice right now.' });
  }
};

exports.NOT_AVAILABLE = NOT_AVAILABLE;
