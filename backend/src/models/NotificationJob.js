const mongoose = require('mongoose');

/**
 * Durable notification delivery queue (MongoDB-backed — no Redis dependency).
 * One job = one (mapping × recipient) delivery attempt chain for a single
 * event emission. The worker (notification-engine/queue/Worker.js) claims
 * due jobs atomically, renders, sends via the channel registry, and
 * advances status with exponential backoff on failure.
 */
const notificationJobSchema = new mongoose.Schema(
  {
    eventName:  { type: String, required: true },
    mappingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationMapping', required: true },
    channel:    { type: String, enum: ['email', 'whatsapp', 'sms', 'push', 'inapp', 'webhook'], required: true },

    recipient: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      phone:  { type: String, default: '' },
      email:  { type: String, default: '' },
    },

    // The normalized payload (PayloadNormalizer output) at the time the
    // event was emitted — a durable snapshot, so a retry hours later still
    // renders with the data as it was when the event actually happened.
    normalizedPayload: { type: mongoose.Schema.Types.Mixed, required: true },

    status: {
      type: String,
      enum: ['queued', 'processing', 'delivered', 'failed', 'retrying', 'dead_letter', 'skipped', 'cancelled'],
      default: 'queued',
      index: true,
    },

    attempts:     { type: Number, default: 0 },
    maxAttempts:  { type: Number, default: 5 },
    nextAttemptAt:{ type: Date, default: Date.now, index: true },
    lastError:    { type: String, default: '' },

    // Set by the atomic claim step so two worker ticks can never process
    // the same job twice (exactly-once delivery attempt semantics).
    claimedAt: { type: Date, default: null },

    logId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationLog', default: null },
  },
  { timestamps: true }
);

notificationJobSchema.index({ status: 1, nextAttemptAt: 1 });
notificationJobSchema.index({ eventName: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);
