/**
 * WhatsApp Channel
 * Sends a WhatsApp template message for a given mapping + payload.
 * Template name comes from the NotificationMapping document (admin-configured).
 * Variables are resolved from the payload using the mapping's whatsappVariables config.
 */

const { sendWhatsApp } = require('../../src/utils/whatsapp');
const { buildWhatsAppComponents, resolve } = require('../VariableResolver');

/**
 * @param {Object} mapping  - NotificationMapping document
 * @param {Object} payload  - Normalized event payload
 * @param {string} phone    - Recipient phone number
 * @returns {Promise<Object|null>}
 */
async function send(mapping, payload, phone) {
  if (!phone) {
    console.warn('[WhatsApp Channel] No phone number for mapping:', mapping._id);
    return null;
  }
  if (!mapping.whatsappTemplateName) {
    console.warn('[WhatsApp Channel] No template name configured for mapping:', mapping._id);
    return null;
  }

  // Build components from admin-configured variable mappings, or fall back to any
  // pre-built components already in payload._whatsappComponents
  const components = (mapping.whatsappVariables && mapping.whatsappVariables.length > 0)
    ? buildWhatsAppComponents(mapping.whatsappVariables, payload)
    : (payload._whatsappComponents || []);

  const recipientId   = resolve(`${mapping.recipientType}.id`, payload)
    || resolve(`${mapping.recipientType}.userId`, payload)
    || null;
  const recipientName = resolve(`${mapping.recipientType}.name`, payload) || '';

  return sendWhatsApp(
    phone,
    mapping.whatsappTemplateName,
    components,
    mapping.whatsappLanguage || 'en',
    {
      event:         payload._eventName || '',
      recipientId,
      recipientName,
    },
  );
}

module.exports = { send };
