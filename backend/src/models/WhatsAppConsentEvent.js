const mongoose = require('mongoose');

/**
 * Immutable, append-only consent audit trail.
 *
 * One document per consent action (opt-in / opt-out). There is deliberately
 * NO update/delete surface for this collection — it is written once per
 * action and never modified, so a user's full consent history (e.g.
 * OPT_IN → OPT_OUT → OPT_IN) is preserved for compliance, audits, and
 * customer-support disputes. It is never exposed as a mutable CRUD resource.
 *
 * `whatsappMessageId` (the Meta webhook wamid) is the natural idempotency key
 * for inbound-webhook-driven events: the unique+sparse index guarantees a
 * replayed/delivered-twice message cannot create a duplicate event (see
 * consentService.createConsentEvent).
 */

const PURPOSES = ['service', 'marketing'];
const ACTIONS  = ['OPT_IN', 'OPT_OUT'];
const SOURCES  = ['', 'signup', 'signup_checkbox', 'whatsapp_keyword', 'preference_center', 'admin'];

const whatsappConsentEventSchema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phone:   { type: String, required: true }, // E.164-normalized digits

    channel: { type: String, enum: ['whatsapp'], required: true, default: 'whatsapp' },
    purpose: { type: String, enum: PURPOSES, required: true },
    action:  { type: String, enum: ACTIONS, required: true },
    source:  { type: String, enum: SOURCES, required: true },

    // Exact consent text/version the user was shown. Business/legal artifact —
    // stored verbatim from the client/UI, never invented server-side.
    consentText:    { type: String, default: '' },
    consentVersion: { type: String, default: '' },

    timestamp: { type: Date, default: Date.now },

    // Provenance (HTTP-driven events reuse auditService.extractRequestMeta).
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    // Meta webhook message id (wamid) for keyword-driven (STOP) events.
    // NO default: the field is absent for non-webhook events, which is what
    // makes the unique+sparse index below safe (sparse excludes docs that
    // lack the field, so events without a wamid never collide).
    whatsappMessageId: { type: String },
  },
  { timestamps: true }
);

whatsappConsentEventSchema.index({ userId: 1, timestamp: -1 });
whatsappConsentEventSchema.index({ phone: 1, timestamp: -1 });
whatsappConsentEventSchema.index({ whatsappMessageId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('WhatsAppConsentEvent', whatsappConsentEventSchema);
module.exports.PURPOSES = PURPOSES;
module.exports.ACTIONS  = ACTIONS;
module.exports.SOURCES  = SOURCES;
