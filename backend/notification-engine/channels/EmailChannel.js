/**
 * Email Channel (v2)
 *
 * Single path: every mapping renders through the one TemplateEngine + the one
 * VariableResolver, validated by TemplateValidator before sending, then the
 * shared email shell context (footer + optional CTA) is applied to the rendered
 * HTML before it leaves for the provider.
 *
 * Render-context rule (Phase 1, Part D — single escaping rule kept): the
 * footer/CTA blocks are NOT authored into any template and are NOT escaped by
 * the per-value VariableResolver rule. They are assembled here at render time
 * from trusted config/settings by EmailRenderContext (all values escaped once,
 * localhost/private URLs dropped in production), then swapped in for the inert
 * FOOTER_MARKER/CTA_MARKER tokens EmailRenderContext.apply replaces. A template
 * that never declares a marker renders unchanged — authored content is always
 * the fallback, so no mapping ever breaks because the footer context was
 * unavailable.
 *
 * The old LEGACY_EMAIL_HANDLERS hardcoded-per-event fallback is gone (it was
 * the root cause of the wrong-customer-name/amount bug). Every mapping must
 * have its own emailSubject + emailHtml authored via the admin UI.
 */

const TemplateEngine = require('../templates/TemplateEngine');
const TemplateValidator = require('../templates/TemplateValidator');
const EmailProvider = require('../providers/EmailProvider');
const EmailRenderContext = require('../email/EmailRenderContext');
const { env: appEnv } = require('../../src/config');

/**
 * Apply the shared render context (footer/CTA) to rendered email HTML.
 * Never throws and never blocks a real send: when the trusted footer cannot be
 * built (e.g. settings read fails), the markers are dropped and the email goes
 * out as authored rather than as a broken/commented-out block.
 */
async function applyRenderContext(html, payload, deps) {
  let ctx = null;
  try {
    ctx = await EmailRenderContext.attach(payload, deps);
  } catch (_err) {
    ctx = null;
  }
  return { html: EmailRenderContext.apply(html, ctx), ctx };
}

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
  const { html: finalHtml, ctx } = await applyRenderContext(html, payload, { production: appEnv === 'production' });

  const response = await EmailProvider.send({ to: email, subject, html: finalHtml });

  return { response, renderedContent: { subject, html }, renderContext: ctx };
}

module.exports = { send, applyRenderContext };
