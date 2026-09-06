const mongoose = require('mongoose');

/**
 * CouponCampaign — a promotional coupon broadcast.
 *
 * A campaign stores ONLY campaign configuration (which coupon, which
 * channel/mapping/audience, when to run) — the coupon itself remains the
 * single source of truth for validity/limits (see CouponService), and
 * delivery is composed through the existing Notification Engine:
 *   campaign → audience discovery (consent-aware) → per-recipient enqueue of
 *   a NotificationJob onto the existing durable queue → Worker →
 *   WhatsAppChannel.send (where the purpose=MARKETING outbound consent gate
 *   is re-enforced against the recipient's current consent).
 *
 * This model never duplicates coupon or notification logic.
 *
 * Status lifecycle:
 *   DRAFT     → editable, not scheduled, no recipients
 *   SCHEDULED → DRAFT with a future scheduledAt; becomes RUNNING when due
 *   RUNNING   → recipients are being discovered/enqueued
 *   COMPLETED → all eligible recipients enqueued (final audience discovered)
 *   CANCELLED → stopped by an admin; no further recipients enqueued
 *   FAILED    → validation/enqueue halted by an unrecoverable error
 */

const couponCampaignSchema = new mongoose.Schema(
  {
    // Human-readable campaign title for the admin list.
    name: { type: String, required: true, trim: true },

    // The coupon being promoted (Coupon document is the source of truth for
    // validity/limits — a campaign never copies discount logic).
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },

    // The NotificationMapping whose template carries this campaign's copy.
    // MUST be eventName=CAMPAIGN_COUPON, recipientType=user, purpose=MARKETING
    // (purpose=MARKETING is what keeps the WhatsApp outbound consent gate
    // active per recipient at send time).
    mappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotificationMapping',
      required: true,
      index: true,
    },

    // Delivery channel for this campaign. The campaign foundation supports
    // WhatsApp marketing only (the only channel with a real outbound consent
    // gate). Email is HARD-BLOCKED until a genuine email marketing consent
    // gate exists (EmailChannel has none). Value is validated against the
    // engine's channel set but the campaign service rejects 'email'/'inapp'
    // until they are intentionally supported.
    channel: {
      type: String,
      enum: ['whatsapp', 'email', 'inapp'],
      default: 'whatsapp',
      required: true,
    },

    // Audience selection strategy. v1 supports ALL_MARKETING_OPTED_IN_USERS
    // (the users whose WhatsAppPreference.whatsapp.marketing.status is
    // 'opted_in' — the same state the channel gate reads live). Others are
    // intended for future segmentation and are rejected by the service until
    // implemented.
    audienceType: {
      type: String,
      enum: ['ALL_MARKETING_OPTED_IN_USERS', 'SPECIFIC_USERS', 'LANGUAGE', 'LOCATION', 'ACTIVITY', 'CUSTOM_SEGMENT'],
      default: 'ALL_MARKETING_OPTED_IN_USERS',
    },

    // Optional explicit user allow-list (future segmentation; today only
    // relevant when audienceType=SPECIFIC_USERS which is not yet supported).
    targetUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Optional filter for the future LANGUAGE/LOCATION/ACTIVITY selection
    // strategies (stored for extensibility; unused today).
    filter: { type: mongoose.Schema.Types.Mixed, default: {} },

    // When to run. null = send immediately on start. A future value is the
    // scheduled run time (SCHEDULED until then).
    scheduledAt: { type: Date, default: null },
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: '' },

    status: {
      type: String,
      enum: ['DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED'],
      default: 'DRAFT',
      index: true,
    },
    failReason: { type: String, default: '' },

    // ── Delivery counters (denormalized for admin dashboard) ───────────
    totalAudience:  { type: Number, default: 0 }, // discovered eligible recipients
    scheduledCount: { type: Number, default: 0 }, // recipients enqueued to the queue
    deliveredCount: { type: Number, default: 0 }, // WhatsApp accepted the send
    skippedCount:   { type: Number, default: 0 }, // consent/validation blocked per recipient
    failedCount:    { type: Number, default: 0 }, // job dead-lettered

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Human-readable note for why the campaign exists (internal).
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

// Compound index for dashboard queries (list by status, then recency).
couponCampaignSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CouponCampaign', couponCampaignSchema);
