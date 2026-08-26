/**
 * Translation provider resolver — the seam that keeps Zutsav's translation
 * engine provider-independent.
 *
 *   services/translationService.js
 *        ↓ translateWithFallback()
 *   ┌── sarvam.provider.js  (primary — Indian-language optimized)
 *   ├── groq.provider.js    (temporary fallback, pre-existing engine)
 *   └── bhashini (future)   — add bhashini.provider.js + one entry below
 *
 * Contract is intentionally minimal:
 *   provider = { name, isConfigured(): Promise<boolean>,
 *                translate(text, targetLanguage, opts): Promise<string> }
 *
 * Request volume is controlled upstream of this module: results are
 * persisted per (entityType, entityId, language) and concurrent misses are
 * coalesced by the Mongo single-flight lock in translationService.js, so
 * identical content never triggers duplicate provider calls here.
 *
 * Rollout control: set TRANSLATION_PROVIDER=groq to temporarily prefer
 * Groq again (e.g. while Sarvam credits/quota are being sorted out) without
 * a code change. The non-selected provider remains as fallback either way.
 */

const sarvamProvider = require('./sarvam.provider');
const groqProvider = require('./groq.provider');
const { readEnv } = require('../../config/env');

const ALL_PROVIDERS = [sarvamProvider, groqProvider];

function orderedProviders() {
  const preferred = String(readEnv('TRANSLATION_PROVIDER', 'auto') || 'auto').toLowerCase();
  const primary = ALL_PROVIDERS.find((p) => p.name === preferred);
  if (!primary) return ALL_PROVIDERS; // 'auto' or unknown value -> default order
  return [primary, ...ALL_PROVIDERS.filter((p) => p !== primary)];
}

/**
 * Translate `text` into `targetLanguage`, trying configured providers in
 * order. Never silently swallows repeated provider failure — every attempt
 * is logged with provider name, language pair, duration and outcome.
 *
 * @param {{ text: string, sourceLanguage?: string, targetLanguage: string, maxTokens?: number }} params
 * @returns {Promise<{ text: string, provider: string }>}
 * @throws when no provider succeeds (caller falls back to source-language text)
 */
async function translateWithFallback({ text, sourceLanguage = 'en', targetLanguage, maxTokens }) {
  const startedAt = Date.now();
  const attempted = [];

  for (const provider of orderedProviders()) {
    let configured;
    try {
      configured = await provider.isConfigured();
    } catch {
      configured = false;
    }
    if (!configured) continue;

    try {
      const translated = await provider.translate(text, targetLanguage, { sourceLanguage, maxTokens });
      console.log(
        `[Translation] provider=${provider.name} ok ${sourceLanguage}->${targetLanguage} `
        + `chars=${String(text).length} dur=${Date.now() - startedAt}ms`
      );
      return { text: translated, provider: provider.name };
    } catch (err) {
      attempted.push(provider.name);
      console.error(`[Translation] provider=${provider.name} failed ${sourceLanguage}->${targetLanguage}: ${err.message}`);
    }
  }

  const err = new Error(`All translation providers failed (${attempted.join(', ') || 'none configured'})`);
  err.translationProvidersAttempted = attempted;
  throw err;
}

module.exports = { translateWithFallback };
