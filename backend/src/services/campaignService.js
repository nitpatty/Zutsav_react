/**
 * Coupon Campaign Service — create/validate/schedule/cancel campaigns and
 * drive their delivery by composing existing systems (CouponService for the
 * coupon, the Notification Engine's durable JobQueue + MARKETING mapping +
 * WhatsApp outbound consent gate for delivery). Campaign logic here is
 * orchestration only — coupon validity/limits and per-recipient consent stay
 * in their owning services and models.
 *
 * Delivery model (scale-safe, idempotent, partial-failure tolerant):
 *   startCampaign() → cursor-paginated audience discovery (
 *     campaignAudienceService) → for each eligible recipient insert an
 *     idempotent CouponCampaignRecipient + enqueue one NotificationJob via
 *     the EXISTING durable queue (JobQueue.enqueue). The enqueue sweep is
 *     interruptible: enqueueBatch() returns how far it got, and the single
 *     unique (campaignId+userId+channel) index guarantees a recipient is
 *     never enqueued twice even if a sweep restarts. The Worker then delivers
 *     each job off the request path; WhatsAppChannel re-evaluates the
 *     recipient's live marketing consent (skip if they opted out after being
 *     enqueued).
 *
 * Channels: WhatsApp marketing is the only supported channel for the
 * foundation (the only one with a real outbound consent gate). Email is
 * HARD-BLOCKED here — EmailChannel has no consent gate, so we refuse to
 * broadcast to it until a genuine email marketing consent policy exists.
 */

const mongoose = require('mongoose');
const CouponCampaign = require('../models/CouponCampaign');
const CouponCampaignRecipient = require('../models/CouponCampaignRecipient');
const Coupon = require('../models/Coupon');
const NotificationMapping = require('../models/NotificationMapping');
const JobQueue = require('../../notification-engine/queue/JobQueue');
const campaignAudienceService = require('./campaignAudienceService');
const { normalizeUserPayload } = require('../../notification-engine/variables/PayloadNormalizer');

const VALID_STATUSES = ['DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED'];

// Only WhatsApp marketing is supported in the foundation. Email is blocked
// until a real email marketing consent gate exists (EmailChannel has none);
// in-app is not yet treated as a consentable marketing surface.
const SUPPORTED_CHANNELS = ['whatsapp'];

function validateChannel(channel) {
  if (!channel) throw httpError(400, 'Channel is required');
  if (!SUPPORTED_CHANNELS.includes(channel)) {
    throw httpError(
      422,
      `Channel "${channel}" is not supported for coupon campaigns. This build supports WhatsApp marketing only (it is the only channel with an outbound marketing consent gate). Email remains disabled until a genuine email marketing consent policy exists.`
    );
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Validation helpers ────────────────────────────────────────────────────

async function validateMapping(mappingId) {
  const mapping = await NotificationMapping.findById(mappingId).lean();
  if (!mapping) throw httpError(404, 'Notification mapping not found');
  if (mapping.eventName !== 'CAMPAIGN_COUPON') {
    throw httpError(422, `Mapping must be for event CAMPAIGN_COUPON (found "${mapping.eventName}")`);
  }
  if (mapping.recipientType !== 'user') {
    throw httpError(422, 'Campaign mappings must use recipientType "user"');
  }
  if (mapping.purpose !== 'MARKETING') {
    throw httpError(422, 'Campaign mapping must be classified purpose=MARKETING so the WhatsApp outbound consent gate stays active');
  }
  if (!mapping.enabled) {
    throw httpError(422, 'Campaign mapping must be enabled');
  }
  if (mapping.channel !== 'whatsapp') {
    throw httpError(422, 'Campaign mapping must be a whatsapp mapping');
  }
  return mapping;
}

async function validateCoupon(couponId) {
  const coupon = await Coupon.findById(couponId).lean();
  if (!coupon) throw httpError(404, 'Coupon not found');
  if (!coupon.isActive) throw httpError(422, 'Coupon must be active to run a campaign');
  return coupon;
}

/**
 * Create a campaign. Enforces channel/mapping/coupon invariants and the
 * supported audience strategy. If scheduledAt is in the future the campaign
 * is created SCHEDULED; otherwise DRAFT (ready to start).
 *
 * channel is stored for auditing/idempotency but validated to 'whatsapp'.
 */
async function createCampaign({
  name, couponId, mappingId, channel = 'whatsapp', audienceType = 'ALL_MARKETING_OPTED_IN_USERS',
  filter, targetUserIds, scheduledAt, createdBy, description,
}) {
  if (!name || !String(name).trim()) throw httpError(400, 'Campaign name is required');
  validateChannel(channel);
  await validateMapping(mappingId);
  await validateCoupon(couponId);

  if (audienceType !== 'ALL_MARKETING_OPTED_IN_USERS') {
    throw httpError(422, `Audience strategy "${audienceType}" is not yet supported — use ALL_MARKETING_OPTED_IN_USERS`);
  }

  const hasFutureSchedule = scheduledAt && new Date(scheduledAt).getTime() > Date.now();
  const status = hasFutureSchedule ? 'SCHEDULED' : 'DRAFT';

  const campaign = await CouponCampaign.create({
    name: String(name).trim(),
    couponId,
    mappingId,
    channel,
    audienceType,
    filter,
    targetUserIds: targetUserIds || [],
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    status,
    createdBy,
    updatedBy: createdBy,
    description: description || '',
  });

  return campaign;
}

// ── Payload builder — inject coupon into the canonical normalized shape ──
// The normalized user payload already carries customer.{name,phone,email,
// userId}. We add a `coupon` section so a CAMPAIGN_COUPON template can
// reference {{coupon.code}}, {{coupon.discountLabel}}, etc.
function buildCampaignPayload({ user, coupon, campaign }) {
  const base = normalizeUserPayload({ user });
  const label = coupon.discountType === 'PERCENTAGE'
    ? `${coupon.discountValue}% off`
    : `₹${coupon.discountValue} off`;
  return {
    ...base,
    coupon: {
      code: coupon.code || '',
      discountType: coupon.discountType || '',
      discountValue: coupon.discountValue != null ? Number(coupon.discountValue) : 0,
      minCartValue: coupon.minCartValue || 0,
      maxDiscount: coupon.maxDiscount,
      expiresAt: coupon.expiresAt || null,
      label,
      campaignName: campaign.name || '',
    },
  };
}

// ── Lifecycle transitions ─────────────────────────────────────────────────

async function updateStatus(campaign, status, extra = {}) {
  campaign.status = status;
  Object.assign(campaign, extra);
  await campaign.save();
  return campaign;
}

/**
 * Enqueue the delivery sweep for a RUNNING campaign. Composes audience
 * discovery (cursor paged, consent-aware) with the durable queue. Safe to
 * call repeatedly — recipients already inserted are skipped by the unique
 * (campaignId+userId+channel) index.
 *
 * @param {string|CouponCampaign} campaignOrId
 * @param {object} [opts]
 * @param {number} [opts.maxPages] - run at most this many pages per call
 *   (default Infinity → run to completion). Lets an API call advance a big
 *   campaign incrementally under the request timeout.
 * @returns {Promise<{ processed, remaining, complete }>}
 */
async function enqueueRecipients(campaignOrId, opts = {}) {
  const campaign = typeof campaignOrId === 'string'
    ? await CouponCampaign.findById(campaignOrId)
    : campaignOrId;
  if (!campaign) throw httpError(404, 'Campaign not found');

  const coupon = await Coupon.findById(campaign.couponId).lean();
  if (!coupon) throw httpError(404, `Coupon ${campaign.couponId} not found`);

  const maxPages = Number.isFinite(opts.maxPages) && opts.maxPages > 0 ? opts.maxPages : Infinity;
  let batchSize = Number(opts.batchSize) || campaignAudienceService.DEFAULT_PAGE_SIZE;

  let cursor = null;
  let processed = 0;
  let pages = 0;

  while (pages < maxPages) {
    const { recipients, nextCursor, complete } = await campaignAudienceService.discoverPage(campaign, { cursor, limit: batchSize });
    pages += 1;

    if (recipients.length === 0) {
      // No more eligible recipients.
      await markCompleted(campaign);
      return { processed, remaining: 0, complete: true };
    }

    for (const rec of recipients) {
      const inserted = await upsertRecipient(campaign, coupon, rec);
      if (inserted) processed += 1;
    }

    cursor = nextCursor;
    if (complete) {
      await markCompleted(campaign);
      return { processed, remaining: 0, complete: true };
    }
  }

  return { processed, remaining: -1, complete: false };
}

/** Idempotent insert of a CouponCampaignRecipient + enqueue of its job. */
async function upsertRecipient(campaign, coupon, rec) {
  const userId = new mongoose.Types.ObjectId(rec.userId);

  // Idempotency gate — the unique compound index is the final authority; the
  // find first is just to produce a clean return without a duplicate-key
  // error we then have to swallow.
  const existing = await CouponCampaignRecipient.findOne({ campaignId: campaign._id, userId, channel: campaign.channel });
  if (existing) return false;

  // Snapshot the per-recipient normalized payload (mirrors the engine's
  // durable-payload philosophy: a retry hours later renders what was true at
  // enqueue time for this specific user).
  const payload = buildCampaignPayload({ user: userForPayload(rec), coupon, campaign });
  let job = null;
  try {
    job = await JobQueue.enqueue({
      eventName: 'CAMPAIGN_COUPON',
      mappingId: campaign.mappingId,
      channel: campaign.channel,
      recipient: { userId, phone: rec.phone, email: rec.email },
      normalizedPayload: payload,
    });
  } catch (err) {
    // Enqueue failed for this one recipient (e.g. BSON cast) — record it as
    // failed but continue the sweep; a single recipient never fails a whole
    // campaign.
    await CouponCampaignRecipient.create({
      campaignId: campaign._id, userId, channel: campaign.channel,
      status: 'failed', lastError: `enqueue: ${err.message}`,
    });
    return false;
  }

  try {
    await CouponCampaignRecipient.create({
      campaignId: campaign._id, userId, channel: campaign.channel,
      jobId: job ? job._id : null, status: 'enqueued', enqueuedAt: new Date(),
    });
  } catch (err) {
    // Unique index collision under concurrency — the recipient is already
    // tracked; cancel the duplicate job so it isn't delivered twice.
    if (job && job._id) await JobQueue.markCancelled(job._id, 'duplicate recipient record');
    return false;
  }

  await CouponCampaign.updateOne({ _id: campaign._id }, { $inc: { scheduledCount: 1 } });
  return true;
}

/** Lightweight user snapshot for the payload (name/email/phone/language). */
function userForPayload(rec) {
  return {
    _id: rec.userId,
    name: rec.name,
    email: rec.email,
    phone: rec.phone,
    preferredLanguage: rec.preferredLanguage,
  };
}

// markCompleted guards against re-completing a CANCELLED campaign, which must
// stay in its terminal CANCELLED state.
async function markCompleted(campaign) {
  if (campaign.status === 'CANCELLED' || campaign.status === 'COMPLETED') return campaign;
  const totalAudience = await CouponCampaignRecipient.countDocuments({ campaignId: campaign._id });
  const delivered = await CouponCampaignRecipient.countDocuments({ campaignId: campaign._id, status: { $in: ['delivered', 'enqueued'] } });
  campaign.status = 'COMPLETED';
  campaign.completedAt = new Date();
  campaign.totalAudience = totalAudience;
  campaign.deliveredCount = delivered;
  await campaign.save();
  return campaign;
}

// ════════════════════════════════════════════════════════════════════════
// LIFECYCLE ACTIONS
// ════════════════════════════════════════════════════════════════════════

/**
 * Start a campaign now. Accepts DRAFT or SCHEDULED (and re-start of an
 * interrupted RUNNING sweep). Idempotent per-recipient.
 * @returns {{ campaign, sweep }}
 */
async function startCampaign({ campaignId, actorId, maxPages }) {
  const campaign = await CouponCampaign.findById(campaignId);
  if (!campaign) throw httpError(404, 'Campaign not found');
  if (campaign.status === 'COMPLETED') throw httpError(409, 'Campaign already completed');
  if (campaign.status === 'CANCELLED') throw httpError(409, 'Campaign is cancelled and cannot be restarted');
  if (campaign.status === 'FAILED') throw httpError(409, 'Campaign failed; create a new one');

  validateChannel(campaign.channel);
  await validateMapping(campaign.mappingId); // re-validate on start
  await validateCoupon(campaign.couponId);

  if (campaign.status !== 'RUNNING') {
    await updateStatus(campaign, 'RUNNING', { startedAt: new Date(), updatedBy: actorId });
  }

  const sweep = await enqueueRecipients(campaign, { maxPages });
  return { campaign, sweep };
}

/**
 * Advance an already-RUNNING campaign's enqueue sweep (used to resume a
 * large campaign across multiple calls / after a worker restart).
 */
async function continueEnqueue({ campaignId }) {
  const campaign = await CouponCampaign.findById(campaignId);
  if (!campaign) throw httpError(404, 'Campaign not found');
  if (campaign.status !== 'RUNNING') throw httpError(409, `Cannot continue enqueue from status ${campaign.status}`);
  return enqueueRecipients(campaign, { maxPages: Infinity });
}

/**
 * Cancel a campaign. Marks it CANCELLED and cancels any queued
 * NotificationJobs still awaiting delivery for its recipients, so a campaign
 * stopped mid-flight does not keep sending.
 */
async function cancelCampaign({ campaignId, actorId, reason = '' }) {
  const campaign = await CouponCampaign.findById(campaignId);
  if (!campaign) throw httpError(404, 'Campaign not found');
  const terminal = ['COMPLETED', 'CANCELLED'];
  if (terminal.includes(campaign.status)) {
    throw httpError(409, `Campaign already ${campaign.status.toLowerCase()}`);
  }

  await updateStatus(campaign, 'CANCELLED', {
    cancelledAt: new Date(),
    cancelledBy: actorId || campaign.createdBy || null,
    cancelReason: reason || '',
    updatedBy: actorId,
  });

  // Cancel still-queued jobs for this campaign's recipients.
  const recs = await CouponCampaignRecipient.find({ campaignId: campaign._id, status: 'enqueued', jobId: { $ne: null } }).select('jobId');
  const jobIds = recs.map((r) => r.jobId);
  if (jobIds.length) {
    await NotificationJobMassCancel(jobIds);
  }
  await CouponCampaignRecipient.updateMany(
    { campaignId: campaign._id, status: { $in: ['pending', 'enqueued'] } },
    { $set: { status: 'cancelled' } }
  );

  return campaign;
}

/** Cancel only jobs that have NOT been claimed yet (queued/retrying). */
async function NotificationJobMassCancel(jobIds) {
  const NotificationJob = require('../models/NotificationJob');
  await NotificationJob.updateMany(
    { _id: { $in: jobIds }, status: { $in: ['queued', 'retrying'] } },
    { $set: { status: 'cancelled', lastError: 'campaign cancelled' } }
  );
}

/**
 * Preview the audience & message that WOULD send — never enqueues. Used by
 * the admin dry-run screen.
 */
async function previewCampaign({ campaignId, limit = 5, includeMessage = true }) {
  const campaign = await CouponCampaign.findById(campaignId);
  if (!campaign) throw httpError(404, 'Campaign not found');
  validateChannel(campaign.channel);

  const coupon = await Coupon.findById(campaign.couponId).lean();
  const mapping = await NotificationMapping.findById(campaign.mappingId).lean();
  const total = await campaignAudienceService.countAudience(campaign);

  const { recipients } = await campaignAudienceService.discoverPage(campaign, { limit: Number(limit) || 5 });
  const samples = recipients.map((rec) => {
    const payload = buildCampaignPayload({ user: userForPayload(rec), coupon, campaign });
    return { recipient: rec, payload };
  });

  return {
    totalAudience: total,
    channel: campaign.channel,
    coupon: coupon ? { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue } : null,
    mapping: mapping ? {
      id: mapping._id, eventName: mapping.eventName, purpose: mapping.purpose,
      whatsappTemplateName: mapping.whatsappTemplateName, enabled: mapping.enabled,
    } : null,
    samples,
  };
}

/**
 * Start any SCHEDULED campaigns that are now due. Called by the admin list /
 * status endpoints (a lightweight lazily-triggered scheduler) and designed to
 * be driven by a cron too. Returns the campaigns started.
 */
async function startDueCampaigns() {
  const now = new Date();
  const due = await CouponCampaign.find({ status: 'SCHEDULED', scheduledAt: { $lte: now } });
  const started = [];
  for (const campaign of due) {
    try {
      await startCampaign({ campaignId: campaign._id, maxPages: 50 });
      started.push(String(campaign._id));
    } catch (err) {
      // Never let one bad campaign block the rest.
      console.error(`[Campaign] scheduled start failed for ${campaign._id}:`, err.message);
    }
  }
  return started;
}

/**
 * Settlement hook registered with the Notification Worker (see bootstrap).
 * Called once per job as it reaches a terminal outcome. For a campaign job
 * (event CAMPAIGN_COUPON / a CouponCampaignRecipient with this jobId) it
 * reconciles the per-recipient ledger and the campaign's aggregate counters
 * so the admin sees real delivery outcomes, and so a per-recipient failure is
 * recorded without failing the whole campaign.
 *
 * Registered via Worker.setOnJobSettled(settleJob). No-op when the job is not
 * a campaign job or already settled — safe to call on any job.
 *
 * @param {object} job     - the NotificationJob document (already advanced)
 * @param {string} status  - 'delivered' | 'skipped' | 'failed' | 'dead_letter'
 * @param {string} error   - lastError text if any
 */
async function settleJob(job, status, error = '') {
  try {
    if (job?.eventName !== 'CAMPAIGN_COUPON') return;
    const jobId = job._id;
    const rec = await CouponCampaignRecipient.findOne({ jobId, status: 'enqueued' });
    if (!rec) return; // already settled or not a campaign-generated recipient

    let recStatus;
    const inc = {};
    switch (status) {
      case 'delivered':
        recStatus = 'delivered';
        inc.deliveredCount = 1;
        break;
      case 'skipped':
        recStatus = 'skipped';
        inc.skippedCount = 1;
        break;
      case 'failed':
      case 'dead_letter':
        recStatus = 'failed';
        inc.failedCount = 1;
        break;
      default:
        return;
    }

    await CouponCampaignRecipient.updateOne(
      { _id: rec._id },
      { $set: { status: recStatus, lastError: error || '', deliveredAt: status === 'delivered' ? new Date() : null } }
    );
    await CouponCampaign.updateOne({ _id: rec.campaignId }, { $inc: inc });
  } catch (err) {
    // Ledger sync must never break the worker.
    console.error('[Campaign] settlement sync failed:', err.message);
  }
}

module.exports = {
  createCampaign,
  startCampaign,
  continueEnqueue,
  cancelCampaign,
  previewCampaign,
  startDueCampaigns,
  buildCampaignPayload,
  enqueueRecipients,
  settleJob,
  validateChannel,
  SUPPORTED_CHANNELS,
  VALID_STATUSES,
};
