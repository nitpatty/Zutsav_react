const mongoose = require('mongoose');

/**
 * InvoiceShareLink — bearer-token links that let a customer open ONE invoice
 * without logging in.
 *
 * Kept in its own collection (not on Invoice) so token material can never leak
 * through the many endpoints that return whole Invoice documents.
 *
 * The raw token is never stored. Two derived values are:
 *   tokenHash   — SHA-256 of the token; the only thing public lookups touch.
 *   tokenCipher — the token AES-256-GCM encrypted with a server-side key, so an
 *                 authorized admin can re-open Share and copy the SAME link
 *                 without minting a new token each time. A database leak alone
 *                 therefore reveals neither tokens nor working links.
 *
 * Lifecycle: 'active' → 'revoked' (terminal). Regeneration revokes the active
 * record and inserts a new one, so the old token stops working immediately. A
 * partial unique index guarantees at most ONE active link per invoice, which
 * also makes concurrent "create or reuse" calls race-safe.
 */
const invoiceShareLinkSchema = new mongoose.Schema({
  invoiceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  tokenHash:   { type: String, required: true, unique: true },
  tokenCipher: { type: String, required: true },
  status:      { type: String, enum: ['active', 'revoked'], default: 'active' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt:   { type: Date, default: null },
  revokedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

invoiceShareLinkSchema.index(
  { invoiceId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_share_per_invoice' }
);

module.exports = mongoose.model('InvoiceShareLink', invoiceShareLinkSchema);
