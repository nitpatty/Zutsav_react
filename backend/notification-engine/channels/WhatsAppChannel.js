/**
 * WhatsApp Channel (v2)
 *
 * Single template-resolution path: mapping.whatsappTemplateName only. The
 * old competing `sendWhatsAppForEvent`/`getTemplateForEvent` mechanism
 * (WhatsAppTemplate.assignedTrigger) is not used here — nothing in the live
 * mapping configuration ever relied on it (confirmed against the production
 * NotificationMapping collection before this rewrite).
 */

const TemplateEngine = require('../templates/TemplateEngine');
const TemplateValidator = require('../templates/TemplateValidator');
const { resolve, existsPath } = require('../variables/VariableResolver');
const WhatsAppProvider = require('../providers/WhatsAppProvider');
const WhatsAppTemplate = require('../../src/models/WhatsAppTemplate');

/**
 * Builds a per-position expected-vs-resolved breakdown for a WhatsApp
 * mapping against a given payload. This is the single source of truth for
 * both the pre-send guard in send() below and the admin Test/Dry-Run
 * screen (admin.controller.js's testNotificationMapping) — what an admin
 * sees in the dry-run is exactly what would block or allow a real send,
 * never a separate approximation of it.
 *
 * @returns {{ templateName, templateFound, expectedCount, configuredCount,
 *   countMatches, rows: [{position, payloadPath, value, ok, reason}],
 *   allResolved, ok, reason }}
 */
async function buildVariableChecklist(mapping, payload) {
  const templateName = mapping.whatsappTemplateName;
  if (!templateName) {
    return {
      templateName: null, templateFound: false, expectedCount: 0, configuredCount: 0,
      countMatches: false, rows: [], allResolved: false, ok: false,
      reason: 'Mapping has no WhatsApp template configured',
    };
  }

  const tmpl = await WhatsAppTemplate.findOne({ name: templateName }).lean().catch(() => null);
  const expectedCount = tmpl ? WhatsAppProvider.countExpectedBodyParams(tmpl) : null;
  const configured = [...(mapping.whatsappVariables || [])].sort((a, b) => a.position - b.position);
  const configuredCount = configured.length;

  const positions = Math.max(expectedCount || 0, configuredCount);
  const rows = [];
  for (let position = 1; position <= positions; position++) {
    const cfg = configured.find((v) => v.position === position);
    if (!cfg) {
      rows.push({ position, payloadPath: null, value: null, ok: false, reason: 'No variable configured for this position' });
      continue;
    }
    const exists = existsPath(cfg.payloadPath, payload);
    const value = exists ? resolve(cfg.payloadPath, payload) : '';
    const ok = exists && value !== '';
    rows.push({
      position,
      payloadPath: cfg.payloadPath,
      value: exists ? value : null,
      ok,
      reason: ok ? null : (exists ? 'Resolved to an empty value' : `"${cfg.payloadPath}" does not exist on the payload`),
    });
  }

  const countMatches = expectedCount === null ? true : configuredCount === expectedCount;
  const allResolved = rows.every((r) => r.ok);
  const unresolved = rows.filter((r) => !r.ok).map((r) => r.payloadPath || `position ${r.position}`);

  return {
    templateName,
    templateFound: !!tmpl,
    expectedCount,
    configuredCount,
    countMatches,
    rows,
    allResolved,
    ok: !!tmpl && countMatches && allResolved,
    reason: !tmpl
      ? `Template "${templateName}" not found in synced WhatsAppTemplate collection`
      : !countMatches
        ? `Template expects ${expectedCount} variable(s) but this mapping has ${configuredCount} configured`
        : !allResolved
          ? `Variable(s) failed to resolve: ${unresolved.join(', ')}`
          : null,
  };
}

/**
 * @param {object} mapping   - NotificationMapping document
 * @param {object} payload   - normalized payload
 * @param {object} recipient - { phone, email, userId }
 */
async function send(mapping, payload, recipient) {
  const phone = recipient?.phone;
  if (!phone) return { skip: true, reason: 'No phone number for recipient' };

  if (!mapping.whatsappTemplateName) {
    return { skip: true, reason: 'Mapping has no WhatsApp template configured' };
  }

  // Structural guard: the exact number of variables the approved Meta
  // template expects, each one individually resolved against the payload —
  // catches both a #132000-class parameter-count mismatch and a silently
  // blank variable before ever calling Meta. TemplateValidator below is a
  // second, complementary check (an event's declared REQUIRED_VARIABLES,
  // independent of what this specific mapping happens to reference).
  const checklist = await buildVariableChecklist(mapping, payload);
  if (!checklist.ok) {
    return { skip: true, reason: checklist.reason, templateName: mapping.whatsappTemplateName, checklist };
  }

  const eventName = payload._eventName || mapping.eventName || '';
  const rawText = TemplateEngine.rawTemplateText('whatsapp', mapping);
  const validation = TemplateValidator.validate(eventName, rawText, payload);
  if (!validation.valid) {
    return {
      skip: true,
      reason: `Missing required variable(s): ${validation.missing.join(', ')}`,
      templateName: mapping.whatsappTemplateName,
      missing: validation.missing,
      checklist,
    };
  }

  const { templateName, languageCode, components } = TemplateEngine.render('whatsapp', mapping, payload);
  const response = await WhatsAppProvider.send({ to: phone, templateName, components, languageCode });

  return { response, renderedContent: { templateName, languageCode, components }, checklist };
}

module.exports = { send, buildVariableChecklist };
