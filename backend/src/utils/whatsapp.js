const axios           = require('axios');
const settings        = require('./settingsService');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const NotificationLog  = require('../models/NotificationLog');
const { whatsapp: whatsappConfig } = require('../config/integrations.config');

async function _cfg() {
  const phoneNumberId = await settings.get('whatsappPhoneNumberId', process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken   = await settings.get('whatsappAccessToken',   process.env.WHATSAPP_ACCESS_TOKEN);
  const apiVersion    = await settings.get('whatsappApiVersion',    process.env.WHATSAPP_API_VERSION || 'v18.0');
  return { phoneNumberId, accessToken, apiVersion };
}

/**
 * Normalize phone to E.164 digits (no leading +).
 * Handles: 10-digit, 12-digit with 91, +91 prefix, or already correct.
 */
function normalizePhone(to) {
  const digits = String(to).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits;  // 919876543210
  if (digits.length === 10) return `91${digits}`;                       // 9876543210
  return digits;                                                        // other formats
}

/**
 * Send an approved WhatsApp template message.
 * Automatically logs to NotificationLog unless meta._noInternalLog = true.
 * Throws on Meta API error so callers can log the failure properly.
 * Returns null (without throwing) only when WhatsApp is not configured.
 *
 * meta: { event, recipientId, recipientName, _noInternalLog }
 */
const sendWhatsApp = async (to, templateName, components = [], languageCode = 'en', meta = {}) => {
  const { phoneNumberId, accessToken, apiVersion } = await _cfg();
  if (!accessToken || !phoneNumberId) {
    console.warn('[WhatsApp] Not configured — skipping send for template:', templateName);
    return null;
  }

  const phone = normalizePhone(to);
  const url   = `${whatsappConfig.graphApiBase}/${apiVersion}/${phoneNumberId}/messages`;

  // If caller used default 'en', try to use the template's stored language from DB so we match
  // Meta's available translation for the approved template.
  let tmpl = null;
  let autoFillInfo = null;
  try {
    tmpl = await WhatsAppTemplate.findOne({ name: templateName }).lean();
    if (tmpl && tmpl.language) {
      if (!languageCode || languageCode === 'en') languageCode = tmpl.language;
    }
  } catch (e) {
    tmpl = null;
  }

  // If components are empty (e.g. admin Test Send), infer body parameters from the stored template
  // so Meta doesn't reject for missing parameters. Uses example values from DB when available.
  if ((!components || components.length === 0) && tmpl?.components) {
    try {
      const bodyComp = (Array.isArray(tmpl.components) ? tmpl.components : []).find(
        (c) => String(c.type || c.component_type || '').toLowerCase() === 'body'
      );
      let expected = 0;
      if (bodyComp) {
        const text = String(bodyComp.text || JSON.stringify(bodyComp) || '');
        const placeholderMatches = Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g));
        const maxIndex = placeholderMatches.length
          ? Math.max(...placeholderMatches.map((m) => parseInt(m[1], 10)))
          : 0;
        expected = maxIndex;
      }
      if (expected > 0) {
        let exampleValues = [];
        try {
          const ex = bodyComp.example || bodyComp.examples || null;
          if (ex) {
            if (Array.isArray(ex.body_text) && ex.body_text.length > 0) {
              const first = ex.body_text[0];
              exampleValues = Array.isArray(first) ? first.map((v) => String(v)) : [String(first)];
            } else if (Array.isArray(ex) && ex.length > 0) {
              exampleValues = ex.map((v) => String(v));
            }
          }
        } catch (e) { exampleValues = []; }

        const params = Array.from({ length: expected }, (_, i) => ({
          type: 'text',
          text: exampleValues[i] !== undefined ? String(exampleValues[i]) : `param${i + 1}`,
        }));
        components = [{ type: 'body', parameters: params }];
        autoFillInfo = { body: { expected, values: params.map((p) => p.text) }, buttons: [] };
        console.log(`[WhatsApp] Auto-filled ${expected} body param(s) for "${templateName}" using examples: ${JSON.stringify(exampleValues)}`);

        // Also auto-fill URL button parameters if any
        const buttonsComp = (Array.isArray(tmpl.components) ? tmpl.components : []).find(
          (c) => String(c.type || '').toLowerCase() === 'buttons'
        );
        if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
          buttonsComp.buttons.forEach((btn, btnIndex) => {
            try {
              const btnUrl = String(btn.url || btn.text || '');
              const matches = Array.from(btnUrl.matchAll(/{{\s*(\d+)\s*}}/g)).map((m) => parseInt(m[1], 10));
              if (matches.length > 0) {
                const buttonParams = matches.map((n) => ({
                  type: 'text',
                  text: exampleValues[n - 1] !== undefined ? String(exampleValues[n - 1]) : (params[n - 1]?.text || `param${n}`),
                }));
                components.push({ type: 'button', sub_type: 'url', index: String(btnIndex), parameters: buttonParams });
                if (autoFillInfo) autoFillInfo.buttons.push({ index: btnIndex, params: buttonParams.map((p) => p.text) });
                console.log(`[WhatsApp] Auto-filled ${buttonParams.length} button param(s) for URL button index ${btnIndex}`);
              }
            } catch (e) {
              console.warn('[WhatsApp] Failed to infer button parameters:', e?.message || e);
            }
          });
        }
      }
    } catch (e) {
      console.warn('[WhatsApp] Failed to infer template parameters:', e?.message || e);
    }
  }

  // Create a log entry unless the caller (commLogger) is handling its own logging
  let logEntry = null;
  if (!meta._noInternalLog) {
    logEntry = await NotificationLog.create({
      type:           'whatsapp',
      event:          meta.event || 'system',
      templateName,
      recipientPhone: phone,
      recipientId:    meta.recipientId || null,
      recipientName:  meta.recipientName || '',
      status:         'processing',
    }).catch(() => null);
  }

  let res;
  try {
    res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                phone,
        type:              'template',
        template:          { name: templateName, language: { code: languageCode }, components },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    // Surface Meta Graph API error body so callers/logs can show the exact reason
    const metaBody = err.response?.data || err.response || null;
    const metaMsg  = metaBody?.error?.message
      || (metaBody && typeof metaBody === 'object' ? JSON.stringify(metaBody) : null)
      || err.message;
    const e = new Error(metaMsg);
    e.meta       = metaBody;
    e.autoFilled = autoFillInfo || null;
    if (logEntry) {
      logEntry.status = 'failed';
      logEntry.error  = metaMsg;
      if (metaBody) logEntry.metadata = { metaError: metaBody };
      await logEntry.save().catch(() => {});
    }
    throw e;
  }

  // Meta returns HTTP 200 even for some soft errors — check for error object in body
  if (res.data?.error) {
    const metaErr = res.data.error;
    const e = new Error(`Meta API error ${metaErr.code}: ${metaErr.message || JSON.stringify(metaErr)}`);
    e.meta       = metaErr;
    e.autoFilled = autoFillInfo || null;
    if (logEntry) {
      logEntry.status = 'failed';
      logEntry.error  = e.message;
      logEntry.metadata = { metaError: metaErr };
      await logEntry.save().catch(() => {});
    }
    throw e;
  }

  if (autoFillInfo) {
    try { res.data._autoFilled = autoFillInfo; } catch (e) { /* ignore */ }
  }

  if (logEntry) {
    logEntry.status   = 'sent';
    logEntry.response = { msgId: res.data?.messages?.[0]?.id };
    await logEntry.save().catch(() => {});
  }

  console.log(`[WhatsApp] Sent template "${templateName}" to ${phone} — msgId: ${res.data?.messages?.[0]?.id}`);
  return res.data;
};

/**
 * Freeform text is NOT supported on WhatsApp Business API for business-initiated messages.
 * This stub exists so legacy imports don't crash — it always throws.
 */
const sendWhatsAppText = async () => {
  throw new Error('Freeform text messages are not supported on WhatsApp Business API. Use an approved template.');
};

module.exports = {
  sendWhatsApp,
  sendWhatsAppText,
};
