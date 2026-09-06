const mongoose = require('mongoose');

/**
 * CouponCampaignRecipient — per-recipient delivery ledger for a campaign.
 *
 * One document per (campaignId + userId + channel) delivery. The unique
 * compound index is the campaign-level idempotency key: a recipient is
 * enqueued at most once per campaign per channel, no matter how many times
 * the (interruptible) enqueue sweep runs or how the worker retries.
 *
 * This mirrors the per-recipient delivery-outcome model the campaign needs
 * (partial failures never fail a whole campaign): each row independently
 * tracks whether the corresponding NotificationJob reached the channel
 * (delivered), was skipped by the consent gate / validation, or dead-lettered.
 */

const couponCampaignRecipientSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CouponCampaign',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    channel: {
      type: String,
      enum: ['whatsapp', 'email', 'inapp'],
      default: 'whatsapp',
    },

    // The durable NotificationJob created for this recipient (if any). null
    // means never enqueued (e.g. cancelled before the sweep reached them).
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationJob', default: null },

    // Per-recipient delivery state.
    //   pending      → selected, not yet enqueued
    //   enqueued     → a job was created and is awaiting/being processed
    //   delivered    → channel accepted the send (job status 'delivered')
    //   skipped      → consent/validation blocked (job status 'skipped')
    //   failed       → job dead-lettered after retries
    //   cancelled    → campaign was cancelled before this recipient went out
    status: {
      type: String,
      enum: ['pending', 'enqueued', 'delivered', 'skipped', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    lastError: { type: String, default: '' },
    enqueuedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Campaign idempotency key: a recipient is enqueued at most once per
// (campaign + user + channel).
couponCampaignRecipientSchema.index({ campaignId: 1, userId: 1, channel: 1 }, { unique: true });

// Page recipients per campaign (audience status page).
couponCampaignRecipientSchema.index({ campaignId: 1, status: 1 });

module.exports = mongoose.model('CouponCampaignRecipient', couponCampaignRecipientSchema);
