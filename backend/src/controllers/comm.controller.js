const axios           = require('axios');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const { whatsapp: whatsappConfig } = require('../config/integrations.config');

// ─── Helpers ────────────────────────────────────────────────────────────────

const ok  = (res, data, status = 200) => res.status(status).json({ success: true,  ...data });
const err = (res, msg,  status = 400) => res.status(status).json({ success: false, message: msg });


// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP TEMPLATES — real Meta Cloud API sync, the source of truth for
// which approved templates exist. Everything that used to live in this
// controller alongside it (email templates, trigger rules, notification
// logs, test send) has been superseded by the unified Notification Engine
// admin screen — see admin.controller.js's Notification Mapping Management
// section and /api/admin/notifications/* routes.
// ═══════════════════════════════════════════════════════════════════════════

exports.listWhatsAppTemplates = async (req, res) => {
  try {
    const templates = await WhatsAppTemplate.find().sort({ name: 1 }).lean();
    ok(res, { templates });
  } catch (e) { err(res, e.message, 500); }
};

// Only enabled + approved templates — used by mapping editor's template dropdown
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

    const url = `${whatsappConfig.graphApiBase}/${apiVersion}/${businessAccountId}/message_templates`;
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
    const { isActive } = req.body;
    if (isActive === undefined) return err(res, 'No fields to update');

    const template = await WhatsAppTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive } },
      { new: true }
    );
    if (!template) return err(res, 'Template not found', 404);
    ok(res, { template });
  } catch (e) { err(res, e.message, 500); }
};
