/**
 * Template Engine — channel-aware rendering.
 * Given a NotificationMapping + normalized payload, produces the exact
 * content to send for that channel. All interpolation goes through the
 * one VariableResolver — no channel has its own ad hoc rendering logic.
 */

const { interpolate, buildWhatsAppComponents } = require('../variables/VariableResolver');

function renderEmail(mapping, payload) {
  return {
    subject: interpolate(mapping.emailSubject || '', payload),
    html:    interpolate(mapping.emailHtml || '', payload),
  };
}

function renderWhatsApp(mapping, payload, opts = {}) {
  const buttonConfig = mapping.whatsappButtonType === 'copy_code'
    ? { type: 'copy_code', payloadPath: mapping.whatsappButtonPayloadPath }
    : null;
  // opts.declaredUrlButtons comes from the synced Meta template (computed by
  // WhatsAppChannel.buildVariableChecklist / WhatsAppProvider.getDeclaredUrlButtons).
  // Without it, URL buttons are safely omitted — the template is authoritative.
  const warnings = [];
  const components = buildWhatsAppComponents(
    mapping.whatsappVariables, payload, buttonConfig,
    mapping.whatsappUrlButtons || [], opts.declaredUrlButtons, warnings
  );
  return {
    templateName: mapping.whatsappTemplateName || '',
    languageCode: mapping.whatsappLanguage || 'en',
    components,
    buttonWarnings: warnings,
  };
}

function renderInApp(mapping, payload) {
  return {
    type:    mapping.inAppType || '',
    title:   interpolate(mapping.inAppTitle || '', payload),
    message: interpolate(mapping.inAppMessage || '', payload),
  };
}

function render(channel, mapping, payload, opts = {}) {
  switch (channel) {
    case 'email':   return renderEmail(mapping, payload);
    case 'whatsapp':return renderWhatsApp(mapping, payload, opts);
    case 'inapp':   return renderInApp(mapping, payload);
    default: throw new Error(`No renderer for channel "${channel}"`);
  }
}

/**
 * Flattened raw template text for a channel — used by TemplateValidator to
 * extract every {{path}} placeholder actually referenced before rendering.
 */
function rawTemplateText(channel, mapping) {
  switch (channel) {
    case 'email':    return `${mapping.emailSubject || ''} ${mapping.emailHtml || ''}`;
    case 'whatsapp': {
      const varPaths = (mapping.whatsappVariables || []).map((v) => `{{${v.payloadPath}}}`);
      if (mapping.whatsappButtonType === 'copy_code' && mapping.whatsappButtonPayloadPath) {
        varPaths.push(`{{${mapping.whatsappButtonPayloadPath}}}`);
      }
      // URL-button parameters are resolved against the payload too — including
      // them here lets TemplateValidator catch a typo'd/missing button path
      // before the message is ever rendered.
      for (const b of mapping.whatsappUrlButtons || []) {
        if (b.parameterPath) varPaths.push(`{{${b.parameterPath}}}`);
      }
      return varPaths.join(' ');
    }
    case 'inapp':    return `${mapping.inAppTitle || ''} ${mapping.inAppMessage || ''}`;
    default: return '';
  }
}

module.exports = { render, rawTemplateText };
