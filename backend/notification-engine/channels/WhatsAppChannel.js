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
const consentService = require('../../src/services/consentService');

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

  // ── URL-button analysis (Phase 5.1) ────────────────────────────────────
  // The synced Meta template is authoritative: a mapped URL button whose
  // index the template doesn't declare is reported (and later omitted, never
  // sent). This is INFORMATIONAL — it never flips `ok`, because a missing
  // button must not block a transactional service message; the body is
  // still perfectly valid without the optional action buttons.
  const declaredUrlButtons = tmpl ? WhatsAppProvider.getDeclaredUrlButtons(tmpl) : null;
  const buttonRows = (mapping.whatsappUrlButtons || []).map((b, i) => {
    const declared = declaredUrlButtons ? declaredUrlButtons[i] : null;
    const value = b.parameterPath ? resolve(b.parameterPath, payload) : null;
    const ok = !!declared && (!declared.hasPlaceholders || (b.parameterPath && value !== ''));
    const reason = !declared
      ? `Meta template "${templateName}" does not declare a URL button at index ${i} — button omitted (re-create/sync the template with it first)`
      : declared.hasPlaceholders && (!b.parameterPath || value === '')
        ? `Button parameter "${b.parameterPath || '(none)'}" resolved empty — button omitted`
        : null;
    return { index: i, text: b.text, urlTemplate: b.urlTemplate, declared: !!declared, parameterPath: b.parameterPath, value, ok, reason };
  });
  const buttonWarnings = buttonRows.filter((r) => !r.ok).map((r) => r.reason);

  return {
    templateName,
    templateFound: !!tmpl,
    expectedCount,
    configuredCount,
    countMatches,
    rows,
    allResolved,
    declaredUrlButtons,
    buttonRows,
    buttonWarnings,
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

  // ── Outbound consent gate (Phase 5) ───────────────────────────────────
  // Single enforcement point for WhatsApp consent: every NotificationEngine-
  // driven WhatsApp send funnels through send(), so a MARKETING-purpose
  // message is checked here — once, against the ACTUAL recipient's current
  // consent (fresh DB read via consentService, so worker retries re-evaluate
  // and a STOP received after enqueue still blocks the retry). Non-marketing
  // purposes and mappings with no purpose are never gated, so transactional
  // communication (ACCOUNT/BOOKING/ORDER/SERVICE) is never blocked by a
  // marketing opt-out. A mapping with no purpose is never silently treated
  // as marketing — the boot-time validateWhatsAppMappings audit flags
  // unclassified WhatsApp mappings instead.
  if (mapping.purpose === 'MARKETING') {
    const consented = await consentService.hasMarketingConsent(recipient?.userId);
    if (!consented) {
      return {
        skip: true,
        reason: 'marketing_consent_missing',
        purpose: mapping.purpose,
        eventName: mapping.eventName,
      };
    }
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

  const { templateName, languageCode, components, buttonWarnings } =
    TemplateEngine.render('whatsapp', mapping, payload, { declaredUrlButtons: checklist.declaredUrlButtons });
  const response = await WhatsAppProvider.send({ to: phone, templateName, components, languageCode });

  return {
    response,
    renderedContent: { templateName, languageCode, components, buttonWarnings },
    checklist,
  };
}

module.exports = { send, buildVariableChecklist };
