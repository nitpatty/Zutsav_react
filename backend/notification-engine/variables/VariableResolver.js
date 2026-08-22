/**
 * Variable Resolver (v2)
 *
 * Resolves dot-notation paths from a normalized payload (see
 * PayloadNormalizer.js) and interpolates {{path}} placeholders in templates.
 * Hardened version of the original notification-engine/VariableResolver.js:
 *   - never throws on missing/undefined intermediate paths
 *   - distinguishes "resolved but empty" from "path does not exist at all"
 *     (existsPath) so the validator can tell a genuinely missing variable
 *     apart from a legitimately blank one (e.g. no kit on this booking)
 *   - Date values are formatted for display rather than showing [object Object]
 */

function existsPath(path, payload) {
  if (!path || !payload) return false;
  const parts = String(path).split('.');
  let val = payload;
  for (const p of parts) {
    if (val === null || typeof val !== 'object' || !(p in val)) return false;
    val = val[p];
  }
  return val !== undefined;
}

function resolve(path, payload) {
  if (!path || !payload) return '';
  const parts = String(path).split('.');
  let val = payload;
  for (const p of parts) {
    if (val === null || val === undefined) return '';
    val = val[p];
  }
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return val.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return String(val);
}

/** All {{path}} placeholders referenced by a template string, de-duplicated. */
function extractPlaceholders(template) {
  if (!template) return [];
  const matches = String(template).matchAll(/\{\{([\w.]+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

function interpolate(template, payload) {
  if (!template) return '';
  return String(template).replace(/\{\{([\w.]+)\}\}/g, (_, path) => resolve(path, payload));
}

/**
 * Build the button parameters the WhatsApp Cloud API needs for one URL
 * button. The mapping's `urlButtons` are reference data (text + display URL
 * + payload path); the ACTUAL button set comes from the Meta-synced
 * template (`declaredUrlButtons`), and the Cloud API only ever receives the
 * dynamic suffix value(s) — the URL itself lives in the approved template.
 *
 * Contract (protects against #132018-class failures): a button parameter is
 * emitted ONLY when the synced template declares a URL button at the same
 * index. Mismatches and unresolvable parameters are recorded on `warnings`
 * (an optional mutable array) and the button is omitted — never sent.
 *
 * @param {Array}  urlButtons          mapping config [{ text, urlTemplate, parameterPath }]
 * @param {object} declaredUrlButtons  index -> { type, url, hasPlaceholders } (from WhatsAppProvider)
 * @param {object} payload             normalized payload
 * @param {Array}  [warnings]          out-param: human-readable diagnostics
 * @param {number} [baseIndex]         Meta button index offset (1 when a copy_code button occupies index 0)
 * @returns {Array} Meta button components (empty when nothing is sent)
 */
function buildWhatsAppButtonComponents(urlButtons, declaredUrlButtons, payload, warnings = [], baseIndex = 0) {
  if (!Array.isArray(urlButtons) || urlButtons.length === 0 || !declaredUrlButtons) return [];

  const components = [];
  urlButtons.forEach((b, i) => {
    const index = baseIndex + i;
    const declared = declaredUrlButtons[index];
    if (!declared) {
      warnings.push(`URL button "${b.text || '#' + index}" (index ${index}) is NOT declared by the synced Meta template — omitted. Re-create/sync the Meta template with this URL button first.`);
      return;
    }
    if (declared.hasPlaceholders) {
      const value = resolve(b.parameterPath, payload);
      if (!b.parameterPath || value === '') {
        warnings.push(`URL button "${b.text || '#' + index}" (index ${index}) parameter "${b.parameterPath || '(none)'}" resolved empty — button omitted.`);
        return;
      }
      components.push({ type: 'button', sub_type: 'url', index: String(index), parameters: [{ type: 'text', text: value }] });
    }
    // STATIC URL button (no {{n}} placeholder): omit the component entirely.
    // Meta fills the approved URL itself — a button component with an empty
    // `parameters` array is malformed there and rejected with "(#132018)
    // There's an issue with the parameters in your template". Only buttons
    // that actually carry a dynamic value may appear as components.
  });
  return components;
}

/**
 * Build a WhatsApp components array from positional variable mappings, plus
 * an optional "Copy Code" quick-reply button (used by OTP-style templates
 * like "whatsapp_verification" — the button's value must match the body's
 * code parameter, so it's resolved from the payload independently rather
 * than assumed to equal body parameter #1), plus optional URL buttons
 * (transactional actions like View Receipt / Rate Your Experience).
 *
 * variableMappings: [{ position: 1, payloadPath: 'customer.name' }, ...]
 * buttonConfig: { type: 'copy_code', payloadPath: 'otp.code' } | null
 * urlButtons: [{ text, urlTemplate, parameterPath }] (mapping config)
 * declaredUrlButtons: index -> { type, url, hasPlaceholders } — from the
 *   synced WhatsAppTemplate; null/undefined means no URL-button info is
 *   available, in which case URL buttons are safely omitted (never sent).
 * warnings: optional out-param — human-readable button diagnostics.
 */
function buildWhatsAppComponents(variableMappings, payload, buttonConfig = null, urlButtons = [], declaredUrlButtons = null, warnings = []) {
  const components = [];

  if (variableMappings && variableMappings.length > 0) {
    const sorted = [...variableMappings].sort((a, b) => a.position - b.position);
    const parameters = sorted.map((v) => ({
      type: 'text',
      text: resolve(v.payloadPath, payload) || '',
    }));
    components.push({ type: 'body', parameters });
  }

  if (buttonConfig?.type === 'copy_code' && buttonConfig.payloadPath) {
    const code = resolve(buttonConfig.payloadPath, payload) || '';
    // Meta's approved OTP "Copy Code" templates (e.g. "whatsapp_verification")
    // declare their BUTTONS component as a dynamic URL button
    // (https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}),
    // not a native OTP/copy_code button type. The Cloud API therefore expects
    // sub_type "url" with a "text" parameter carrying the code — sending
    // sub_type "copy_code"/"coupon_code" against a URL-type button is what
    // Meta rejects with "(#132018) There's an issue with the parameters in
    // your template".
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    });
  }

  // URL buttons follow the copy_code button in index space (Meta indexes
  // buttons 0..n-1 across the whole BUTTONS component).
  const baseIndex = buttonConfig?.type === 'copy_code' ? 1 : 0;
  components.push(...buildWhatsAppButtonComponents(urlButtons, declaredUrlButtons, payload, warnings, baseIndex));

  return components;
}

module.exports = {
  resolve, existsPath, interpolate, extractPlaceholders,
  buildWhatsAppComponents, buildWhatsAppButtonComponents,
};
