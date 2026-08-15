const mongoose = require('mongoose');

/**
 * Current communication consent state, per user.
 *
 * This collection holds only the CURRENT state. The immutable audit trail of
 * every consent action (opt-in / opt-out) lives in WhatsAppConsentEvent — the
 * two are kept separate so current state can be read cheaply at send-time
 * while history is preserved forever.
 *
 * RULES (see services/consentService.js — single source of truth for state
 * transitions):
 *  - whatsappVerified ≠ consent. Number verification never implies service or
 *    marketing consent.
 *  - Marketing is strictly opt-in: only status 'opted_in' means consented;
 *    'not_set' (the default) is treated as NOT consented.
 *  - Service communication defaults to allowed ('opted_in') so transactional
 *    messaging keeps functioning; this default is a system default, not an
 *    explicit consent action, so it never generates a consent event.
 */

const STATUS_VALUES = ['opted_in', 'opted_out', 'not_set'];
// '' = system default (no explicit user action). The other values are the
// audit-approved sources: signup, signup_checkbox, whatsapp_keyword,
// preference_center, admin.
const SOURCE_VALUES = ['', 'signup', 'signup_checkbox', 'whatsapp_keyword', 'preference_center', 'admin'];

const channelPreferenceSchema = new mongoose.Schema(
  {
    status:    { type: String, enum: STATUS_VALUES, default: 'not_set' },
    source:    { type: String, enum: SOURCE_VALUES, default: '' },
    timestamp: { type: Date, default: null },
  },
  { _id: false }
);

const whatsappPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Normalized E.164 digits (91XXXXXXXXXX) — same normalization as
    // WhatsAppProvider.normalizePhone, so an inbound webhook `from` value
    // matches this field directly.
    phone:            { type: String, default: '' },
    whatsappVerified: { type: Boolean, default: false },

    whatsapp: {
      service:   { type: channelPreferenceSchema, default: () => ({}) },
      marketing: { type: channelPreferenceSchema, default: () => ({}) },
    },

    // Future channels per the client's communication-preference model —
    // schema exists now so enabling them later needs no migration.
    email: {
      service:   { type: channelPreferenceSchema, default: () => ({}) },
      marketing: { type: channelPreferenceSchema, default: () => ({}) },
    },
    sms: {
      service:   { type: channelPreferenceSchema, default: () => ({}) },
      marketing: { type: channelPreferenceSchema, default: () => ({}) },
    },

    lastOptInAt:  { type: Date, default: null },
    lastOptOutAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One current-preference document per user.
whatsappPreferenceSchema.index({ userId: 1 }, { unique: true });
// Phone lookup (inbound webhook → preference). Phone stored E.164-normalized.
whatsappPreferenceSchema.index({ phone: 1 });
// Future marketing queries (e.g. a consented broadcast audience).
whatsappPreferenceSchema.index({ 'whatsapp.marketing.status': 1 });

module.exports = mongoose.model('WhatsAppPreference', whatsappPreferenceSchema);
module.exports.STATUS_VALUES = STATUS_VALUES;
module.exports.SOURCE_VALUES = SOURCE_VALUES;
