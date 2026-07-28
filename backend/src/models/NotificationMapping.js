const mongoose = require('mongoose');
const { EVENTS } = require('../../notification-engine/EventRegistry');

const EVENT_VALUES      = Object.values(EVENTS);
const RECIPIENT_TYPES   = ['user', 'pandit', 'admin', 'referral_pandit'];
const CHANNELS          = ['whatsapp', 'email', 'inapp'];

// One entry in the WhatsApp body parameters array: position → payload path
const whatsappVariableSchema = new mongoose.Schema({
  position:    { type: Number, required: true },
  payloadPath: { type: String, required: true },  // e.g. 'user.name', 'booking.bookingNumber'
  label:       { type: String, default: '' },       // human-readable hint for admin UI
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

    // ── Email config ───────────────────────────────────────────────────
    // If blank, the engine uses the built-in legacy handler for this event.
    emailTemplateName: { type: String, default: '' },
    emailSubject:      { type: String, default: '' },
    emailHtml:         { type: String, default: '' }, // full HTML with {{variable}} placeholders

    // ── In-App config ──────────────────────────────────────────────────
    inAppType:    { type: String, default: '' }, // e.g. 'booking_confirmed'
    inAppTitle:   { type: String, default: '' }, // supports {{variable}} placeholders
    inAppMessage: { type: String, default: '' }, // supports {{variable}} placeholders

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
