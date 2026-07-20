const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:    { type: String, required: true },    // booking_created, pandit_assigned, order_placed, etc.
  title:   { type: String, required: true },
  message: { type: String, required: true },
  data:    { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead:  { type: Boolean, default: false, index: true },

  // Notifications are immutable once created, so this never needs bumping —
  // present only so the shared translation-cache contract (translationService.js)
  // applies uniformly. Used for the free-text fallback path (no NotificationMapping
  // template exists for this notification's `type`).
  translationVersion: { type: Number, default: 1 },
}, { timestamps: true });

// Compound index for efficient unread queries per user
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
