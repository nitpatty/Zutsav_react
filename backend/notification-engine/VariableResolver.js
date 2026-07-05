/**
 * Variable Resolver
 * Resolves dot-notation paths from a payload object.
 * Used by all channels to interpolate template variables.
 *
 * Example:
 *   resolve('user.name', { user: { name: 'Ramesh' } }) → 'Ramesh'
 *   interpolate('Hello {{user.name}}', payload)         → 'Hello Ramesh'
 */

function resolve(path, payload) {
  if (!path || !payload) return '';
  const parts = String(path).split('.');
  let val = payload;
  for (const p of parts) {
    if (val === null || val === undefined) return '';
    val = val[p];
  }
  if (val === null || val === undefined) return '';
  return String(val);
}

function interpolate(template, payload) {
  if (!template) return '';
  return String(template).replace(/\{\{([\w.]+)\}\}/g, (_, path) => resolve(path, payload));
}

/**
 * Build a WhatsApp components array from positional variable mappings.
 *
 * variableMappings: [{ position: 1, payloadPath: 'user.name' }, ...]
 * Returns: [{ type: 'body', parameters: [{ type: 'text', text: '...' }, ...] }]
 */
function buildWhatsAppComponents(variableMappings, payload) {
  if (!variableMappings || variableMappings.length === 0) return [];
  const sorted = [...variableMappings].sort((a, b) => a.position - b.position);
  const parameters = sorted.map((v) => ({
    type: 'text',
    text: resolve(v.payloadPath, payload) || '',
  }));
  return [{ type: 'body', parameters }];
}

module.exports = { resolve, interpolate, buildWhatsAppComponents };
