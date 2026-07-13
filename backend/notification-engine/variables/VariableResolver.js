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
 * Build a WhatsApp components array from positional variable mappings, plus
 * an optional "Copy Code" quick-reply button (used by OTP-style templates
 * like "whatsapp_verification" — the button's value must match the body's
 * code parameter, so it's resolved from the payload independently rather
 * than assumed to equal body parameter #1).
 *
 * variableMappings: [{ position: 1, payloadPath: 'customer.name' }, ...]
 * buttonConfig: { type: 'copy_code', payloadPath: 'otp.code' } | null
 */
function buildWhatsAppComponents(variableMappings, payload, buttonConfig = null) {
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

  return components;
}

module.exports = { resolve, existsPath, interpolate, extractPlaceholders, buildWhatsAppComponents };
