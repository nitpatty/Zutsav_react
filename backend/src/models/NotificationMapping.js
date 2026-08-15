const mongoose = require('mongoose');
const { EVENTS } = require('../../notification-engine/EventRegistry');

const EVENT_VALUES      = Object.values(EVENTS);
const RECIPIENT_TYPES   = ['user', 'pandit', 'admin', 'referral_pandit'];
const CHANNELS          = ['whatsapp', 'email', 'inapp'];

// Communication purpose classification (Phase 5 — WhatsApp consent).
// MARKETING-purpose WhatsApp messages are consent-gated on outbound send
// (WhatsAppChannel) — they require explicit marketing opt-in. All other
// purposes (and UNKNOWN, which blocks nothing) bypass the gate so
// transactional/service communication is never blocked by marketing
// opt-out. Purpose is NEVER auto-inferred: a mapping without an explicit
// purpose stays UNKNOWN (never silently treated as marketing), and the
// boot-time validateWhatsAppMappings audit flags unclassified mappings.
const PURPOSES = ['ACCOUNT', 'BOOKING', 'ORDER', 'SERVICE', 'MARKETING', 'UNKNOWN'];

// One entry in the WhatsApp body parameters array: position → payload path
const whatsappVariableSchema = new mongoose.Schema({
  position:    { type: Number, required: true },
  payloadPath: { type: String, required: true },  // e.g. 'user.name', 'booking.bookingNumber'
  label:       { type: String, default: '' },       // human-readable hint for admin UI
}, { _id: false });

// One URL button on a WhatsApp template (Phase 5.1 — transactional messages
// may carry OPTIONAL actions like "View Receipt" / "Rate Your Experience";
// the message purpose stays SERVICE/BOOKING/ORDER, never MARKETING). The
// Meta-synced template is authoritative: at send time WhatsAppChannel emits
// button parameters ONLY for URL buttons the synced template actually
// declares at the matching index (a parameter the template doesn't declare
// is exactly what Meta rejects with #132018). `urlTemplate` is reference /
// dry-run display only — the real URL lives in the Meta template, and the
// Cloud API only ever receives the dynamic suffix value(s). `parameterPath`
// is the normalized-payload path whose resolved value fills the URL's {{n}}
// placeholder; leave empty for a static (placeholder-free) URL.
const whatsappUrlButtonSchema = new mongoose.Schema({
  text:          { type: String, default: '' },  // display text — must match the Meta template
  urlTemplate:   { type: String, default: '' },  // e.g. '/invoice/{{1}}' or '/my-bookings' (reference only)
  parameterPath: { type: String, default: '' },  // e.g. 'booking.id' — dynamic URL suffix
}, { _id: false });

const notificationMappingSchema = new mongoose.Schema(
  {
    eventName: {
      type:     String,
      enum:     EVENT_VALUES,
      required: true,
      index:    true,
    },

    recipientType: {
      type:     String,
      enum:     RECIPIENT_TYPES,
      required: true,
    },

    channel: {
      type:     String,
      enum:     CHANNELS,
      required: true,
    },

    // ── WhatsApp config ────────────────────────────────────────────────
    // Template name from the Meta-synced WhatsAppTemplate collection.
    whatsappTemplateName: { type: String, default: '' },
    whatsappLanguage:     { type: String, default: 'en' },
    // Positional variable mappings: [{position:1, payloadPath:'user.name'}, ...]
    whatsappVariables:    { type: [whatsappVariableSchema], default: [] },
    // OTP-style templates (e.g. "whatsapp_verification") ship a "Copy Code"
    // quick-reply button whose value must match the body's code — expressed
    // separately since it's a button component, not a body parameter.
    whatsappButtonType:     { type: String, enum: ['none', 'copy_code'], default: 'none' },
    whatsappButtonPayloadPath: { type: String, default: '' },
    // Optional URL buttons (array order = Meta button index). Transactional
    // templates may declare up to the template's own button count; only
    // template-declared buttons are ever sent.
    whatsappUrlButtons:     { type: [whatsappUrlButtonSchema], default: [] },

    // ── Email config ───────────────────────────────────────────────────
    // If blank, the engine uses the built-in legacy handler for this event.
    emailTemplateName: { type: String, default: '' },
    emailSubject:      { type: String, default: '' },
    emailHtml:         { type: String, default: '' }, // full HTML with {{variable}} placeholders

    // ── In-App config ──────────────────────────────────────────────────
    inAppType:    { type: String, default: '' }, // e.g. 'booking_confirmed'
    inAppTitle:   { type: String, default: '' }, // supports {{variable}} placeholders
    inAppMessage: { type: String, default: '' }, // supports {{variable}} placeholders

    // ── Communication purpose ───────────────────────────────────────────
    // Classifies outbound communication: ACCOUNT (auth/security/account),
    // BOOKING (booking lifecycle), ORDER (marketplace/order lifecycle),
    // SERVICE (transactional/service operational), MARKETING
    // (promotional — consent-gated on WhatsApp), UNKNOWN (unclassified —
    // blocks nothing). Existing mappings predating this field read as
    // UNKNOWN until classified (bootstrap v1.2.0 fills the verified value;
    // admin edits can set it anytime).
    purpose: { type: String, enum: PURPOSES, default: 'UNKNOWN', index: true },

    // ── Control ────────────────────────────────────────────────────────
    enabled:  { type: Boolean, default: true,  index: true },
    priority: { type: Number,  default: 0 },    // higher = dispatched first
    label:    { type: String,  default: '' },   // human-readable name for admin UI

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Bumped only when inAppTitle/inAppMessage actually change — the in-app
    // template is translated once per language and reused across every
    // notification sent for this event (see translationService.js).
    translationVersion: { type: Number, default: 1 },

    // ── Bootstrap provenance (optional) ─────────────────────────────────
    // Set only when this mapping's channel config (WhatsApp template/
    // variables/button, Email subject/HTML, or In-App type/title/message)
    // was created or filled in by scripts/bootstrapNotificationMappings.js
    // from its verified reference data, rather than hand-configured through
    // the Admin UI. Never set retroactively on documents bootstrap didn't
    // touch — absence means "admin-configured" or "predates bootstrap."
    bootstrapVersion: { type: String, default: '' },
    bootstrappedAt:   { type: Date,   default: null },
  },
  { timestamps: true }
);

// Compound index so Dispatcher fetches all active mappings for an event in one query
notificationMappingSchema.index({ eventName: 1, enabled: 1, priority: -1 });

module.exports = mongoose.model('NotificationMapping', notificationMappingSchema);
module.exports.PURPOSES = PURPOSES;
