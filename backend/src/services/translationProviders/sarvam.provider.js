/**
 * Sarvam AI translation provider — primary content-translation engine.
 *
 * Wraps the official Sarvam Translate REST API (POST /translate,
 * `api-subscription-key` header, model `sarvam-translate:v1`). Used ONLY
 * server-side; the key is never exposed to browsers, logs, or API responses.
 *
 * Responsibilities kept deliberately narrow (the caching/single-flight/
 * persistence machinery lives in services/translationService.js):
 *   - app language code -> Sarvam language-code mapping
 *   - placeholder protection ({{var}} templates, <<<T{n}>>> batch markers)
 *   - safe chunking under Sarvam's 2,000-char per-request input limit
 *   - timeout + bounded retries with exponential backoff (429/5xx/network)
 *
 * Future providers (e.g. Bhashini) should export the same tiny contract:
 *   { name, isConfigured(): Promise<boolean>, translate(text, targetLanguage, opts): Promise<string> }
 */

const axios = require('axios');
const settings = require('../../utils/settingsService');
const { readEnv } = require('../../config/env');
const { sarvam } = require('../../config/integrations.config');

// App languages (config/languages.config.js ISO 639-1 codes) -> Sarvam
// locale codes. Only the languages Zutsav actually exposes are mapped —
// do NOT add entries for scheduled languages the product doesn't offer.
// Note Sarvam's Odia code is 'od-IN' (not 'or-IN').
const SARVAM_LANGUAGE_CODES = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  bn: 'bn-IN',
  pa: 'pa-IN',
  or: 'od-IN',
};

const RETRYABLE_NET_CODES = new Set([
  'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EPIPE',
]);

// ── Placeholder protection ────────────────────────────────────────────────
// Masked before translation, restored after. Sentinels are alphanumeric so
// NMT engines copy them verbatim; post-translation verification guarantees
// correctness — if any token was mutated/dropped, the ORIGINAL text is
// returned instead of corrupted output (field-level safe fallback).
const PROTECTED_TOKEN_RE = /\{\{[^{}]*\}\}|<<<T\d+>>>/g;
const SENTINEL_PREFIX = 'ZPH';
const SENTINEL_RE = /ZPH(\d+)Z/g;

function maskProtectedTokens(text) {
  const tokens = [];
  const masked = String(text).replace(PROTECTED_TOKEN_RE, (match) => {
    tokens.push(match);
    return `${SENTINEL_PREFIX}${tokens.length - 1}Z`;
  });
  return { masked, tokens };
}

function unmaskProtectedTokens(text, tokens) {
  return String(text).replace(SENTINEL_RE, (_, i) => tokens[Number(i)] ?? `${SENTINEL_PREFIX}${i}Z`);
}

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

/** True when every original protected token survived into the output verbatim. */
function protectedTokensIntact(tokens, output) {
  return tokens.every((t) => countOccurrences(output, t) >= 1) && ![...output.matchAll(/ZPH\d+Z/g)].length;
}

// ── Chunking ──────────────────────────────────────────────────────────────
// Sarvam Translate v1 accepts ~2,000 chars/request. We split UNDER our own
// lower cap, preferring (in order): existing line breaks — which keeps the
// `<<<T{n}>>>` batch rows used by utils/htmlTranslate.js intact — then
// sentence endings, then word boundaries. Never mid-word unless a single
// token exceeds the cap outright. Separators travel with each unit so the
// translated chunks reassemble to the same structure.
function splitProse(line, maxChars) {
  const pieces = [];
  let rest = line;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = Math.max(
      window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '),
      window.lastIndexOf('। '), window.lastIndexOf('\n')
    );
    if (cut !== -1) cut += 1; // keep the punctuation with the left piece
    else cut = window.lastIndexOf(' ') + 1; // word boundary
    if (cut <= 0) cut = maxChars; // single token longer than the cap — hard split
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length) pieces.push(rest);
  return pieces;
}

/**
 * Split `text` into chunks of at most `maxChars` chars without losing
 * structure. Returns null when the text already fits (fast path).
 * Each chunk is `{ text, joinAfter }`; rebuilding is
 * `chunks.map(c => translated(c.text) + c.joinAfter).join('')`.
 */
function chunkText(text, maxChars) {
  const str = String(text ?? '');
  if (!str || str.length <= maxChars) return null;

  const units = [];
  const lines = str.split('\n');
  lines.forEach((line, li) => {
    const joinAfter = li < lines.length - 1 ? '\n' : '';
    if (line.length <= maxChars) {
      units.push({ text: line, joinAfter });
      return;
    }
    const pieces = splitProse(line, maxChars);
    pieces.forEach((p, pi) => units.push({ text: p, joinAfter: pi < pieces.length - 1 ? '' : joinAfter }));
  });

  const chunks = [];
  let cur = null;
  for (const u of units) {
    if (!cur) cur = { text: u.text, joinAfter: u.joinAfter };
    else if (cur.text.length + cur.joinAfter.length + u.text.length <= maxChars) {
      cur.text += cur.joinAfter + u.text;
      cur.joinAfter = u.joinAfter;
    } else {
      chunks.push(cur);
      cur = { text: u.text, joinAfter: u.joinAfter };
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ── HTTP ──────────────────────────────────────────────────────────────────
function describeError(err) {
  if (err.response) {
    const body = typeof err.response.data === 'string'
      ? err.response.data.slice(0, 200)
      : JSON.stringify(err.response.data)?.slice(0, 200);
    return `HTTP ${err.response.status} ${body || ''}`.trim();
  }
  if (err.code === 'ECONNABORTED') return `timeout after ${sarvam.timeoutMs}ms`;
  return `${err.code || ''} ${err.message || 'unknown error'}`.trim();
}

function isRetryable(err) {
  if (err.response) {
    const s = err.response.status;
    return s === 429 || s === 503 || (s >= 500 && s <= 599);
  }
  return RETRYABLE_NET_CODES.has(err.code);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callSarvam(input, { apiKey, model, sourceCode, targetCode, http }) {
  const client = http || axios;
  try {
    const { data } = await client.post(
      sarvam.translateUrl,
      {
        input,
        source_language_code: sourceCode,
        target_language_code: targetCode,
        model,
      },
      {
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: sarvam.timeoutMs,
      }
    );

    const translated = data?.translated_text;
    if (typeof translated !== 'string' || !translated.trim()) {
      console.error('[Sarvam] ⚠ Empty/invalid response body:', JSON.stringify(data).slice(0, 300));
      throw new Error('Empty response from Sarvam');
    }
    return translated;
  } catch (err) {
    // Log classification only — never the key, never full request payloads.
    console.error(`[Sarvam] ❌ ${describeError(err)}`);
    throw err;
  }
}

async function translateWithRetries(chunk, ctx, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callSarvam(chunk, ctx);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryable(err)) break;
      const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(`[Sarvam] ⚠ attempt ${attempt}/${maxAttempts} failed (${describeError(err)}) — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function isConfigured() {
  const key = await settings.get('sarvamApiKey', readEnv('SARVAM_API_KEY'));
  return Boolean(key);
}

/**
 * Translate `text` into `targetLanguage`.
 * @param {string} text
 * @param {string} targetLanguage - app language code, e.g. 'hi'
 * @param {{ sourceLanguage?: string, http?: object }} [opts]
 * @returns {Promise<string>}
 */
async function translate(text, targetLanguage, opts = {}) {
  const apiKey = await settings.get('sarvamApiKey', readEnv('SARVAM_API_KEY'));
  if (!apiKey) throw new Error('Sarvam API key is not configured');

  const targetCode = SARVAM_LANGUAGE_CODES[targetLanguage];
  if (!targetCode) throw new Error(`Language '${targetLanguage}' is not mapped for Sarvam`);
  const sourceCode = SARVAM_LANGUAGE_CODES[opts.sourceLanguage || 'en'] || 'en-IN';
  const model = await settings.get('sarvamModel', process.env.SARVAM_MODEL || sarvam.defaultModel);

  const { masked, tokens } = maskProtectedTokens(text);
  const ctx = { apiKey, model, sourceCode, targetCode, http: opts.http };

  const chunks = chunkText(masked, sarvam.maxInputChars);
  let output;
  if (!chunks) {
    output = masked.trim() ? await translateWithRetries(masked, ctx) : masked;
  } else {
    const parts = [];
    for (const chunk of chunks) {
      parts.push(chunk.text.trim() ? await translateWithRetries(chunk.text, ctx) : chunk.text);
    }
    output = parts.map((p, i) => p + chunks[i].joinAfter).join('');
  }

  const restored = unmaskProtectedTokens(output, tokens);
  if (tokens.length && !protectedTokensIntact(tokens, restored)) {
    // Sarvam mutated a placeholder/marker — return the source text rather
    // than risk corrupting template variables or breaking the caller's
    // delimiter contract. Callers treat this like any other field fallback.
    console.error(`[Sarvam] ⚠ Protected tokens mutated during translation (${tokens.length} masked) — returning source text`);
    return String(text);
  }
  return restored;
}

module.exports = {
  name: 'sarvam',
  isConfigured,
  translate,
  // exported for tests / future tooling only
  SARVAM_LANGUAGE_CODES,
  maskProtectedTokens,
  unmaskProtectedTokens,
  protectedTokensIntact,
  chunkText,
};
