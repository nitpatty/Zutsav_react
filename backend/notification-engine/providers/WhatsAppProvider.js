/**
 * WhatsApp Provider — pure Meta Cloud API send primitive, extracted from
 * src/utils/whatsapp.js. No internal logging (Worker/NotificationLogger owns
 * that now). Same phone normalization and template-language lookup as before.
 *
 * Sends exactly the `components` it is given — it does not invent or
 * substitute parameters. (A prior version silently filled missing body
 * parameters from the template's Meta-submission "example" values whenever
 * `components` was empty. That example data is admin-authored text meant for
 * Meta's review UI, not verified real-looking content — in production this
 * shipped literal payload-path strings like "customer.name" to real
 * customers whenever a NotificationMapping's `whatsappVariables` was left
 * empty. The fix is at the call site: WhatsAppChannel.send() now checks the
 * mapping's configured variable count against the template's actual
 * required parameter count — via countExpectedBodyParams() below — and
 * skips with a clear reason instead of sending, rather than this module
 * silently papering over a misconfigured mapping.)
 */

const axios = require('axios');
const settings = require('../../src/utils/settingsService');
const WhatsAppTemplate = require('../../src/models/WhatsAppTemplate');
const { whatsapp: whatsappConfig } = require('../../src/config/integrations.config');

async function cfg() {
  const phoneNumberId = await settings.get('whatsappPhoneNumberId', process.env.WHATSAPP_PHONE_NUMBER_ID);
  const accessToken   = await settings.get('whatsappAccessToken', process.env.WHATSAPP_ACCESS_TOKEN);
  const apiVersion    = await settings.get('whatsappApiVersion', process.env.WHATSAPP_API_VERSION || 'v18.0');
  return { phoneNumberId, accessToken, apiVersion };
}

/** Normalize phone to E.164 digits (no leading +). */
function normalizePhone(to) {
  const digits = String(to).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * How many numbered {{n}} body placeholders a Meta-synced WhatsAppTemplate's
 * approved body actually requires. Used by WhatsAppChannel.send() to verify
 * a mapping's configured `whatsappVariables` actually covers what the
 * template needs, before ever attempting to send.
 */
function countExpectedBodyParams(tmpl) {
  const bodyComp = (Array.isArray(tmpl?.components) ? tmpl.components : []).find(
    (c) => String(c.type || c.component_type || '').toLowerCase() === 'body'
  );
  if (!bodyComp) return 0;
  const text = String(bodyComp.text || '');
  const matches = Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g));
  return matches.length ? Math.max(...matches.map((m) => parseInt(m[1], 10))) : 0;
}

/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.templateName
 * @param {Array}  [opts.components]
 * @param {string} [opts.languageCode]
 * @returns {Promise<object>} Meta API response data
 * @throws on missing config or Meta API error (including the "soft error in a 200" case)
 */
async function send({ to, templateName, components = [], languageCode = 'en' }) {
  const { phoneNumberId, accessToken, apiVersion } = await cfg();
  if (!accessToken || !phoneNumberId) {
    throw new Error('WhatsApp not configured (missing access token/phone number id)');
  }

  const phone = normalizePhone(to);
  const url = `${whatsappConfig.graphApiBase}/${apiVersion}/${phoneNumberId}/messages`;

  let tmpl = null;
  try { tmpl = await WhatsAppTemplate.findOne({ name: templateName }).lean(); } catch { tmpl = null; }
  if (tmpl?.language && (!languageCode || languageCode === 'en')) languageCode = tmpl.language;

  let res;
  try {
    res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const metaBody = err.response?.data || err.response || null;
    const metaMsg = metaBody?.error?.message
      || (metaBody && typeof metaBody === 'object' ? JSON.stringify(metaBody) : null)
      || err.message;
    const e = new Error(metaMsg);
    e.meta = metaBody;
    throw e;
  }

  if (res.data?.error) {
    const metaErr = res.data.error;
    const e = new Error(`Meta API error ${metaErr.code}: ${metaErr.message || JSON.stringify(metaErr)}`);
    e.meta = metaErr;
    throw e;
  }

  return res.data;
}

module.exports = { send, normalizePhone, countExpectedBodyParams };
