/**
 * Email Channel (v2)
 *
 * Single path: every mapping renders through TemplateEngine + the one
 * VariableResolver, validated by TemplateValidator before sending. The old
 * LEGACY_EMAIL_HANDLERS hardcoded-per-event fallback is gone — that map was
 * the root cause of the "wrong customer name/amount" bug (each legacy
 * function read a different ad hoc object path). Every mapping must have
 * its own emailSubject + emailHtml authored (via the admin UI).
 */

const TemplateEngine = require('../templates/TemplateEngine');
const TemplateValidator = require('../templates/TemplateValidator');
const EmailProvider = require('../providers/EmailProvider');

/**
 * @param {object} mapping   - NotificationMapping document
 * @param {object} payload   - normalized payload (see PayloadNormalizer.js)
 * @param {object} recipient - { email, phone, userId }
 */
async function send(mapping, payload, recipient) {
  const email = recipient?.email;
  if (!email) return { skip: true, reason: 'No email address for recipient' };

  if (!mapping.emailSubject || !mapping.emailHtml) {
    return { skip: true, reason: 'Mapping has no email subject/HTML configured' };
  }

  const eventName = payload._eventName || mapping.eventName || '';
  const rawText = TemplateEngine.rawTemplateText('email', mapping);
  const validation = TemplateValidator.validate(eventName, rawText, payload);
  if (!validation.valid) {
    return {
      skip: true,
      reason: `Missing required variable(s): ${validation.missing.join(', ')}`,
      templateName: mapping.emailTemplateName || '',
      missing: validation.missing,
    };
  }

  const { subject, html } = TemplateEngine.render('email', mapping, payload);
  const response = await EmailProvider.send({ to: email, subject, html });

  return { response, renderedContent: { subject, html } };
}

module.exports = { send };
