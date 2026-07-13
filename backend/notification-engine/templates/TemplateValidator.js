/**
 * Template Validator
 *
 * Pre-send validation gate: never send a notification with a missing
 * required variable or an unresolvable template placeholder. Called by the
 * worker immediately before rendering/sending each job.
 */

const { extractPlaceholders, existsPath, resolve } = require('../variables/VariableResolver');
const { getRequiredVariables } = require('../variables/VariableSchemas');

/**
 * @param {string} eventName
 * @param {string} templateContent  - raw template string(s) concatenated (subject+body, etc.)
 * @param {object} payload          - normalized payload (see PayloadNormalizer.js)
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validate(eventName, templateContent, payload) {
  const missing = new Set();

  // Required variables for this event must resolve to a non-blank value.
  for (const reqPath of getRequiredVariables(eventName)) {
    if (!existsPath(reqPath, payload) || resolve(reqPath, payload) === '') {
      missing.add(reqPath);
    }
  }

  // Every placeholder the template actually references must exist on the
  // canonical payload shape (catches typos like {{custommer.name}}).
  for (const ph of extractPlaceholders(templateContent)) {
    if (!existsPath(ph, payload)) {
      missing.add(ph);
    }
  }

  return { valid: missing.size === 0, missing: [...missing] };
}

module.exports = { validate };
