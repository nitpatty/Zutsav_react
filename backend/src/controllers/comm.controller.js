const axios           = require('axios');
const EmailTemplate   = require('../models/EmailTemplate');
const WhatsAppTemplate= require('../models/WhatsAppTemplate');
const TriggerRule     = require('../models/TriggerRule');
const NotificationLog = require('../models/NotificationLog');
const { loggedSendEmail, loggedSendWhatsApp, loggedSendWhatsAppText } = require('../utils/commLogger');

// ─── Helpers ────────────────────────────────────────────────────────────────

const ok  = (res, data, status = 200) => res.status(status).json({ success: true,  ...data });
const err = (res, msg,  status = 400) => res.status(status).json({ success: false, message: msg });

// Replace {{variable}} placeholders in template with provided values map
const interpolate = (text, vars = {}) =>
  text.replace(/\{\{(\w[\w.]*)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);


// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

exports.listEmailTemplates = async (req, res) => {
  try {
    const templates = await EmailTemplate.find().sort({ createdAt: -1 }).lean();
    ok(res, { templates });
  } catch (e) { err(res, e.message, 500); }
};

exports.getEmailTemplate = async (req, res) => {
  try {
    const t = await EmailTemplate.findById(req.params.id).lean();
    if (!t) return err(res, 'Template not found', 404);
    ok(res, { template: t });
  } catch (e) { err(res, e.message, 500); }
};

exports.createEmailTemplate = async (req, res) => {
  try {
    const { name, slug, subject, htmlContent, variables, description } = req.body;
    if (!name || !slug || !subject || !htmlContent) return err(res, 'name, slug, subject, htmlContent are required');

    const exists = await EmailTemplate.findOne({ slug });
    if (exists) return err(res, 'A template with this slug already exists');

    const template = await EmailTemplate.create({ name, slug, subject, htmlContent, variables, description });
    ok(res, { template }, 201);
  } catch (e) { err(res, e.message, 500); }
};

exports.updateEmailTemplate = async (req, res) => {
  try {
    const { name, slug, subject, htmlContent, variables, description, isActive } = req.body;
    const template = await EmailTemplate.findByIdAndUpdate(
      req.params.id,
      { name, slug, subject, htmlContent, variables, description, isActive },
      { new: true, runValidators: true }
    );
    if (!template) return err(res, 'Template not found', 404);
    ok(res, { template });
  } catch (e) { err(res, e.message, 500); }
};

exports.deleteEmailTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findByIdAndDelete(req.params.id);
    if (!template) return err(res, 'Template not found', 404);
    ok(res, { message: 'Template deleted' });
  } catch (e) { err(res, e.message, 500); }
};


// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

exports.listWhatsAppTemplates = async (req, res) => {
  try {
    const templates = await WhatsAppTemplate.find().sort({ name: 1 }).lean();
    ok(res, { templates });
  } catch (e) { err(res, e.message, 500); }
};

// Only enabled + approved templates — used by Test Send dropdown
exports.listEnabledTemplates = async (req, res) => {
  try {
    const templates = await WhatsAppTemplate.find({
      isActive: true,
      status:   'APPROVED',
    })
      .select('name language category assignedTrigger status')
      .sort({ name: 1 })
      .lean();
    ok(res, { templates });
  } catch (e) { err(res, e.message, 500); }
};

exports.syncWhatsAppTemplates = async (req, res) => {
  try {
    const settings = require('../utils/settingsService');
    const accessToken       = await settings.get('whatsappAccessToken',      process.env.WHATSAPP_ACCESS_TOKEN);
    const businessAccountId = await settings.get('whatsappBusinessAccountId', process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
    const apiVersion        = await settings.get('whatsappApiVersion',        process.env.WHATSAPP_API_VERSION || 'v18.0');

    if (!accessToken || !businessAccountId)
      return err(res, 'WhatsApp Access Token and Business Account ID are required. Set them in Admin → Settings → WhatsApp or in .env', 400);

    const url = `https://graph.facebook.com/${apiVersion}/${businessAccountId}/message_templates`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 200 },
    });

    const fetched = response.data?.data || [];
    let synced = 0;
    const activeNames = [];

    for (const t of fetched) {
      if (t.status === 'DELETED') continue;
      await WhatsAppTemplate.findOneAndUpdate(
        { name: t.name },
        {
          metaId:     t.id,
          language:   t.language,
          category:   t.category,
          status:     t.status,
          components: t.components || [],
          syncedAt:   new Date(),
        },
        { upsert: true, new: true }
      );
      activeNames.push(t.name);
      synced++;
    }

    // Remove DB records for templates deleted from Meta
    if (activeNames.length > 0) {
      await WhatsAppTemplate.deleteMany({ name: { $nin: activeNames } });
    }

    ok(res, { message: `Synced ${synced} templates from Meta` });
  } catch (e) {
    const detail = e.response?.data?.error?.message || e.message;
    err(res, `Meta sync failed: ${detail}`, 500);
  }
};

exports.updateWhatsAppTemplate = async (req, res) => {
  try {
    const { assignedTrigger, isActive } = req.body;

    // Build selective update — only touch fields that were actually sent
    const update = {};
    if (isActive        !== undefined) update.isActive        = isActive;
    if (assignedTrigger !== undefined) update.assignedTrigger = assignedTrigger;
    if (Object.keys(update).length === 0) return err(res, 'No fields to update');

    const current = await WhatsAppTemplate.findById(req.params.id).lean();
    if (!current) return err(res, 'Template not found', 404);

    // Compute final state after applying the update
    const finalIsActive        = update.isActive        ?? current.isActive;
    const finalAssignedTrigger = update.assignedTrigger ?? current.assignedTrigger;

    // Validate: only one active template per event
    if (finalIsActive && finalAssignedTrigger && finalAssignedTrigger !== '') {
      const conflict = await WhatsAppTemplate.findOne({
        assignedTrigger: finalAssignedTrigger,
        isActive:        true,
        _id:             { $ne: req.params.id },
      }).lean();
      if (conflict) {
        return err(
          res,
          `Event "${finalAssignedTrigger}" is already mapped to template "${conflict.name}". Disable that template first.`,
          409
        );
      }
    }

    const template = await WhatsAppTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    ok(res, { template });
  } catch (e) { err(res, e.message, 500); }
};


// ═══════════════════════════════════════════════════════════════════════════
// TRIGGER RULES
// ═══════════════════════════════════════════════════════════════════════════

exports.listTriggerRules = async (req, res) => {
  try {
    // Seed rules from EVENTS list for any missing events on first call
    const { EVENTS } = require('../models/TriggerRule');
    const existing = await TriggerRule.find().lean();
    const existingEvents = new Set(existing.map((r) => r.event));

    const toInsert = EVENTS.filter((e) => !existingEvents.has(e.value)).map((e) => ({
      event:    e.value,
      label:    e.label,
      channels: [],
      isActive: false,
    }));
    if (toInsert.length) await TriggerRule.insertMany(toInsert);

    const rules = await TriggerRule.find()
      .populate('channels.emailTemplateId', 'name slug')
      .sort({ event: 1 })
      .lean();
    ok(res, { rules });
  } catch (e) { err(res, e.message, 500); }
};

exports.updateTriggerRule = async (req, res) => {
  try {
    const { channels, isActive, description } = req.body;
    const cleanChannels = (channels || []).map((ch) => ({
      ...ch,
      emailTemplateId:      ch.emailTemplateId || null,
      whatsAppTemplateName: ch.whatsAppTemplateName || '',
    }));
    const rule = await TriggerRule.findByIdAndUpdate(
      req.params.id,
      { channels: cleanChannels, isActive, description },
      { new: true, runValidators: true }
    ).populate('channels.emailTemplateId', 'name slug');
    if (!rule) return err(res, 'Trigger rule not found', 404);
    ok(res, { rule });
  } catch (e) { err(res, e.message, 500); }
};


// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION LOGS
// ═══════════════════════════════════════════════════════════════════════════

exports.getLogs = async (req, res) => {
  try {
    const { status, type, event, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type)   filter.type   = type;
    if (event)  filter.event  = event;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      NotificationLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      NotificationLog.countDocuments(filter),
    ]);
    ok(res, { logs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) { err(res, e.message, 500); }
};

exports.getLogStats = async (req, res) => {
  try {
    const [byStatus, byType, failedToday] = await Promise.all([
      NotificationLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      NotificationLog.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
      NotificationLog.countDocuments({
        status: 'failed',
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);
    ok(res, { byStatus, byType, failedToday });
  } catch (e) { err(res, e.message, 500); }
};

exports.retryLog = async (req, res) => {
  try {
    const log = await NotificationLog.findById(req.params.id);
    if (!log)                       return err(res, 'Log entry not found', 404);
    if (log.status !== 'failed')    return err(res, 'Only failed notifications can be retried');
    if (log.retryCount >= 5)        return err(res, 'Max retry attempts (5) reached');

    log.status = 'processing';
    log.retryCount += 1;
    await log.save();

    if (log.type === 'email') {
      // Reconstruct email from EmailTemplate if templateName present
      let html = log.metadata?.html || '<p>Retry</p>';
      let subject = log.subject;
      if (log.templateName) {
        const tmpl = await EmailTemplate.findOne({ slug: log.templateName });
        if (tmpl) { html = tmpl.htmlContent; subject = tmpl.subject; }
      }
      try {
        const { sendEmail } = require('../utils/email');
        await sendEmail(log.recipientEmail, subject, html);
        log.status   = 'delivered';
        log.response = { message: 'Retry successful' };
      } catch (e2) {
        log.status = 'failed';
        log.error  = e2.message;
      }
    } else if (log.type === 'whatsapp') {
      try {
        if (!log.templateName || log.templateName === 'freeform') {
          log.status = 'failed';
          log.error  = 'Cannot retry: original message was freeform text (not a template). WhatsApp only supports approved templates.';
        } else {
          const { sendWhatsApp } = require('../utils/whatsapp');
          // Look up the template to get the correct language code
          const tmpl = await WhatsAppTemplate.findOne({ name: log.templateName }).lean();
          await sendWhatsApp(log.recipientPhone, log.templateName, [], tmpl?.language || 'en');
          log.status   = 'delivered';
          log.response = { message: 'Retry successful' };
        }
      } catch (e2) {
        log.status = 'failed';
        log.error  = e2.message;
        if (e2.meta) log.metadata = { ...log.metadata, metaError: e2.meta };
      }
    }

    await log.save();
    ok(res, { log });
  } catch (e) { err(res, e.message, 500); }
};

exports.deleteLog = async (req, res) => {
  try {
    await NotificationLog.findByIdAndDelete(req.params.id);
    ok(res, { message: 'Log deleted' });
  } catch (e) { err(res, e.message, 500); }
};

exports.clearFailedLogs = async (req, res) => {
  try {
    const result = await NotificationLog.deleteMany({ status: 'failed' });
    ok(res, { message: `Deleted ${result.deletedCount} failed logs` });
  } catch (e) { err(res, e.message, 500); }
};


// ═══════════════════════════════════════════════════════════════════════════
// TEST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

exports.testNotification = async (req, res) => {
  try {
    const { type, to, templateSlug, templateId, variables = {} } = req.body;
    if (!type || !to) return err(res, 'type and to are required');

    if (type === 'email') {
      if (!templateSlug) return err(res, 'templateSlug is required for email test');
      const tmpl = await EmailTemplate.findOne({ slug: templateSlug });
      if (!tmpl) return err(res, 'Email template not found');

      const html    = interpolate(tmpl.htmlContent, variables);
      const subject = interpolate(tmpl.subject, variables);

      const log = await loggedSendEmail({
        to,
        subject,
        html,
        event:         'test',
        templateName:  tmpl.slug,
        recipientName: 'Test User',
      });
      return ok(res, { message: 'Test email dispatched', logId: log._id, status: log.status });
    }

    if (type === 'whatsapp') {
      // Always require a template selected from the DB — no free-form text
      if (!templateId) return err(res, 'templateId is required for WhatsApp test. Select an enabled template from the dropdown.');

      const tmpl = await WhatsAppTemplate.findById(templateId).lean();
      if (!tmpl)          return err(res, 'WhatsApp template not found', 404);
      if (!tmpl.isActive) return err(res, 'This template is disabled. Enable it in the WhatsApp tab first.');
      if (tmpl.status !== 'APPROVED') return err(res, `Template status is "${tmpl.status}" — only APPROVED templates can be sent.`);

      const log = await loggedSendWhatsApp({
        to,
        templateName:  tmpl.name,
        languageCode:  tmpl.language || 'en',
        components:    [],   // Test send with empty components — variables show as placeholders
        event:         'test',
        recipientName: 'Test Admin',
      });
      return ok(res, {
        message:      `Test WhatsApp dispatched using template "${tmpl.name}"`,
        templateName: tmpl.name,
        logId:        log._id,
        status:       log.status,
      });
    }

    return err(res, 'type must be "email" or "whatsapp"');
  } catch (e) { err(res, e.message, 500); }
};


// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW STATS (for dashboard tab)
// ═══════════════════════════════════════════════════════════════════════════

exports.getOverview = async (req, res) => {
  try {
    const now  = new Date();
    const day  = new Date(now - 24 * 60 * 60 * 1000);
    const week = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [total, last24h, lastWeek, byStatus, byType, recentFailed] = await Promise.all([
      NotificationLog.countDocuments({}),
      NotificationLog.countDocuments({ createdAt: { $gte: day } }),
      NotificationLog.countDocuments({ createdAt: { $gte: week } }),
      NotificationLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      NotificationLog.aggregate([{ $group: { _id: '$type',   count: { $sum: 1 } } }]),
      NotificationLog.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    ok(res, { stats: { total, last24h, lastWeek }, byStatus, byType, recentFailed });
  } catch (e) { err(res, e.message, 500); }
};
