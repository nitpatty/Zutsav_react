/**
 * Groq translation provider — TEMPORARY fallback.
 *
 * Thin adapter over the pre-existing Groq translation helper
 * (utils/groq.js#translateText) so the provider resolver can treat both
 * engines uniformly. Groq stays available until Sarvam is verified in
 * production and Bhashini access lands; remove this file (and its entry
 * in index.js) once neither is needed.
 */

const { translateText } = require('../../utils/groq');
const settings = require('../../utils/settingsService');
const { readEnv } = require('../../config/env');

async function isConfigured() {
  const key = await settings.get('groqApiKey', readEnv('GROQ_API_KEY'));
  return Boolean(key);
}

/**
 * @param {string} text
 * @param {string} targetLanguage - app language code, e.g. 'hi'
 * @param {{ sourceLanguage?: string, maxTokens?: number }} [opts]
 * @returns {Promise<string>}
 */
async function translate(text, targetLanguage, opts = {}) {
  // English is the canonical source for every current caller; the Groq
  // helper has never taken a source language.
  return translateText(text, targetLanguage, { maxTokens: opts.maxTokens });
}

module.exports = { name: 'groq', isConfigured, translate };
