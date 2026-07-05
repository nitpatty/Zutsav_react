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
  },
  { timestamps: true }
);

// Compound index so Dispatcher fetches all active mappings for an event in one query
notificationMappingSchema.index({ eventName: 1, enabled: 1, priority: -1 });

module.exports = mongoose.model('NotificationMapping', notificationMappingSchema);
