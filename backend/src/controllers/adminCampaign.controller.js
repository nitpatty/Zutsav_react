/**
 * Admin Coupon Campaign Controller — create/preview/start/schedule/cancel
 * coupon marketing campaigns and view recipient delivery outcomes.
 *
 * Routes are mounted under /api/admin/campaigns (see adminCampaign.routes.js).
 * All endpoints require admin authorization (enforced at the router level).
 *
 * The controller is a thin HTTP layer over campaignService — it performs no
 * coupon/notification/payoff logic itself.
 */

const CouponCampaign = require('../models/CouponCampaign');
const CouponCampaignRecipient = require('../models/CouponCampaignRecipient');
const campaignService = require('../services/campaignService');
const { audit } = require('../services/auditService');
const campaignAudienceService = require('../services/campaignAudienceService');

// ── List campaigns (paginated) ────────────────────────────────────────────
exports.listCampaigns = async (req, res, next) => {
  try {
    // Lazily start any SCHEDULED campaigns that are now due before listing,
    // so the admin list reflects reality without a separate cron.
    await campaignService.startDueCampaigns().catch(() => {});

    const { page = 1, limit = 20, status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const total = await CouponCampaign.countDocuments(filter);
    const campaigns = await CouponCampaign.find(filter)
      .populate('couponId', 'code discountType discountValue isActive')
      .populate('mappingId', 'eventName purpose whatsappTemplateName label enabled')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({ success: true, campaigns, total, page: +page, totalPages: Math.ceil(total / +limit) });
  } catch (err) {
    next(err);
  }
};

// ── Get single campaign + recipient summary ───────────────────────────────
exports.getCampaign = async (req, res, next) => {
  try {
    const campaign = await CouponCampaign.findById(req.params.id)
      .populate('couponId', 'code discountType discountValue minCartValue maxDiscount expiresAt isActive')
      .populate('mappingId', 'eventName purpose whatsappTemplateName whatsappLanguage label enabled')
      .populate('createdBy', 'name')
      .lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const summary = await CouponCampaignRecipient.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const recipientSummary = {};
    summary.forEach((s) => { recipientSummary[s._id] = s.count; });

    res.json({ success: true, campaign, recipientSummary });
  } catch (err) {
    next(err);
  }
};

// ── Create campaign ───────────────────────────────────────────────────────
exports.createCampaign = async (req, res, next) => {
  try {
    const {
      name, couponId, mappingId, channel = 'whatsapp',
      audienceType, filter, targetUserIds, scheduledAt, description,
    } = req.body;

    const campaign = await campaignService.createCampaign({
      name, couponId, mappingId, channel,
      audienceType, filter, targetUserIds, scheduledAt,
      createdBy: req.user._id, description,
    });

    audit(req, {
      module: 'coupon_campaign', action: 'create_campaign',
      targetType: 'coupon_campaign', targetId: campaign._id, targetName: campaign.name,
      newValues: { channel, audienceType, status: campaign.status },
      severity: 'info',
    }).catch(() => {});

    res.status(201).json({ success: true, campaign });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── Dry-run preview (never enqueues) ──────────────────────────────────────
exports.previewCampaign = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    const result = await campaignService.previewCampaign({ campaignId: req.params.id, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── Start (send now) ──────────────────────────────────────────────────────
exports.startCampaign = async (req, res, next) => {
  try {
    const result = await campaignService.startCampaign({
      campaignId: req.params.id, actorId: req.user._id,
      maxPages: Number(req.body.maxPages) || undefined,
    });

    audit(req, {
      module: 'coupon_campaign', action: 'start_campaign',
      targetType: 'coupon_campaign', targetId: result.campaign._id, targetName: result.campaign.name,
      newValues: { status: result.campaign.status, sweep: result.sweep },
      severity: 'info',
    }).catch(() => {});

    res.json({ success: true, ...result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── Continue a RUNNING campaign's enqueue sweep ───────────────────────────
exports.continueCampaign = async (req, res, next) => {
  try {
    const sweep = await campaignService.continueEnqueue({ campaignId: req.params.id });
    res.json({ success: true, sweep });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── Cancel campaign ───────────────────────────────────────────────────────
exports.cancelCampaign = async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const campaign = await campaignService.cancelCampaign({
      campaignId: req.params.id, actorId: req.user._id, reason,
    });

    audit(req, {
      module: 'coupon_campaign', action: 'cancel_campaign',
      targetType: 'coupon_campaign', targetId: campaign._id, targetName: campaign.name,
      newValues: { status: campaign.status, reason: reason || '' },
      severity: 'warning',
    }).catch(() => {});

    res.json({ success: true, campaign });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
};

// ── List recipients (paginated, filterable by status) ─────────────────────
exports.listRecipients = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const campaign = await CouponCampaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const filter = { campaignId: campaign._id };
    if (status) filter.status = status;

    const total = await CouponCampaignRecipient.countDocuments(filter);
    const recipients = await CouponCampaignRecipient.find(filter)
      .populate('userId', 'name email phone preferredLanguage')
      .sort({ createdAt: 1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({ success: true, recipients, total, page: +page, totalPages: Math.ceil(total / +limit) });
  } catch (err) {
    next(err);
  }
};
