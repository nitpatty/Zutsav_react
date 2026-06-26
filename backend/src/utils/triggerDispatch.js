const TriggerRule = require('../models/TriggerRule');
const { sendWhatsApp } = require('./whatsapp');
const { sendEmail }    = require('./email');

const interpolate = (text, vars = {}) =>
  String(text || '').replace(/\{\{(\w[\w.]*)\}\}/g, (_, k) => {
    const parts = k.split('.');
    let val = vars;
    for (const p of parts) val = val?.[p];
    return val !== undefined && val !== null ? String(val) : `{{${k}}}`;
  });

/**
 * Fire all active channels of a TriggerRule for the given event.
 *
 * payload shape:
 *   user:       { phone, email, name, id }  — the customer
 *   pandit:     { phone, email, name, id }  — the assigned pandit (optional)
 *   admin:      { phone, email, name, id }  — admin recipient (optional)
 *   components: []                          — WhatsApp template body components
 *   emailVars:  {}                          — flat/nested vars for email template interpolation
 *
 * Returns true if a TriggerRule was found and had active channels, false otherwise.
 * Never throws — all errors are caught internally.
 */
async function dispatchTriggerEvent(eventName, payload = {}) {
  try {
    const rule = await TriggerRule.findOne({ event: eventName, isActive: true })
      .populate('channels.emailTemplateId', 'name slug subject htmlContent')
      .lean();

    if (!rule || !rule.channels?.length) return false;

    const activeChannels = rule.channels.filter((ch) => ch.isActive);
    if (!activeChannels.length) return false;

    for (const ch of activeChannels) {
      const targets = [];
      const { user, pandit, admin } = payload;

      if (['user', 'both'].includes(ch.recipient) && user)   targets.push(user);
      if (['pandit', 'both'].includes(ch.recipient) && pandit) targets.push(pandit);
      if (ch.recipient === 'admin' && admin) targets.push(admin);

      for (const t of targets) {
        const baseMeta = {
          event:         eventName,
          recipientName: t.name  || '',
          recipientId:   t.id    || null,
        };

        if (ch.type === 'whatsapp' && ch.whatsAppTemplateName && t.phone) {
          await sendWhatsApp(
            t.phone,
            ch.whatsAppTemplateName,
            payload.components || [],
            'en',
            baseMeta,
          ).catch((e) => console.error(`[TriggerDispatch] WA send failed (${eventName}):`, e.message));
        }

        if (ch.type === 'email' && ch.emailTemplateId && t.email) {
          const tmpl = ch.emailTemplateId;
          if (tmpl?.htmlContent) {
            const vars    = payload.emailVars || {};
            const html    = interpolate(tmpl.htmlContent, vars);
            const subject = interpolate(tmpl.subject || '', vars);
            await sendEmail(t.email, subject, html, { ...baseMeta, templateName: tmpl.slug || tmpl.name || '' })
              .catch((e) => console.error(`[TriggerDispatch] Email send failed (${eventName}):`, e.message));
          }
        }
      }
    }

    return true;
  } catch (e) {
    console.error('[TriggerDispatch] Unexpected error dispatching event:', eventName, e.message);
    return false;
  }
}

module.exports = { dispatchTriggerEvent };
