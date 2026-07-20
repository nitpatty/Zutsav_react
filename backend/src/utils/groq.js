/**
 * Groq AI chat — llama-3.3-70b-versatile (default).
 *
 * Key lookup order:
 *   1. Admin system-settings (DB, cached 5 min)
 *   2. GROQ_API_KEY env var
 *
 * All upstream errors are logged to stderr so the dev/ops team can
 * diagnose failures without touching the frontend.
 */

const axios    = require('axios');
const settings = require('./settingsService');
const { groq } = require('../config/integrations.config');

const GROQ_URL      = groq.apiUrl;
const DEFAULT_MODEL = groq.defaultModel;

const SYSTEM_PROMPT = `You are a knowledgeable and compassionate spiritual assistant for Zutsav, a Hindu spiritual services platform based in India.

Your role is to help devotees with:
- Pooja recommendations based on their needs (health, prosperity, marriage, protection, etc.)
- Festival and tithi suggestions for auspicious activities
- General FAQ about Hindu rituals and their significance
- Astrology guidance (basic — rashis, graha doshas, shanti poojas)
- Guidance on when to perform which pooja based on occasion
- Explanation of mantras, rituals, and their benefits
- Information about temples, spiritual products, and booking pandits

Guidelines:
- Respond warmly and respectfully in simple English (mix a little Hindi if appropriate)
- Keep answers concise (max 200 words)
- For medical, legal, or financial matters, gently redirect to professionals
- Do not make claims about guaranteed outcomes — use "is believed to", "traditionally helps with"
- Always end responses with "Jai Shri Ram 🙏" or a similar blessing
- You represent Zutsav — keep a professional, spiritual tone`;

/**
 * Low-level Groq call shared by every helper below — one place for API-key
 * lookup, the axios call, and error logging/classification, so each
 * higher-level helper (chat reply, intent classification, ...) only builds
 * its own `messages` array and options.
 */
const _callGroq = async (messages, { temperature = 0.7, max_tokens = 512, timeout = 20000 } = {}) => {
  const apiKey = await settings.get('groqApiKey', process.env.GROQ_API_KEY);
  const model  = await settings.get('groqModel',  process.env.GROQ_MODEL || DEFAULT_MODEL);

  if (!apiKey) {
    console.error('[Groq] ❌ GROQ_API_KEY is not set — add it to .env or Admin › System Settings');
    throw new Error('GROQ_API_KEY is not configured');
  }

  try {
    const { data } = await axios.post(
      GROQ_URL,
      { model, messages, temperature, max_tokens },
      {
        headers: {
          Authorization:  `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout,
      }
    );

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.error('[Groq] ⚠ Empty response body. choices:', JSON.stringify(data?.choices));
      throw new Error('Empty response from Groq');
    }

    return text;

  } catch (err) {
    if (err.response) {
      // HTTP-level error from the Groq API
      console.error(
        `[Groq] ❌ HTTP ${err.response.status} from Groq API.`,
        'Body:', JSON.stringify(err.response.data),
        '| Model:', model,
        '| Key prefix:', apiKey.slice(0, 8) + '…'
      );
    } else if (err.code === 'ECONNABORTED') {
      console.error('[Groq] ❌ Request timed out (>20 s). Check Groq API status.');
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      console.error('[Groq] ❌ Network error — cannot reach api.groq.com:', err.code);
    } else {
      console.error('[Groq] ❌ Unexpected error:', err.message);
    }
    throw err; // let the controller decide the HTTP response
  }
};

/**
 * Send a conversation history to Groq and return the AI reply text.
 * @param {Array<{role: 'user'|'model', text: string}>} history
 * @returns {Promise<string>}
 */
const getGroqResponse = async (history) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role:    m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
  ];
  return _callGroq(messages, { temperature: 0.7, max_tokens: 512 });
};

/**
 * Classify free-typed user text into exactly one of a fixed set of intent
 * keys (see guidedRecommend.controller.js's INTENT_MAP) — used only to route
 * to a real database query, never to generate recommendation content itself.
 * Always returns one of `allowedKeys`, or 'unclear' — never invents a key.
 * @param {string} userText
 * @param {string[]} allowedKeys
 * @returns {Promise<string>}
 */
const classifyIntent = async (userText, allowedKeys) => {
  const prompt = `Classify the user's message into exactly one of these keys: ${allowedKeys.join(', ')}, unclear.
Respond with ONLY the single matching key and nothing else — no punctuation, no explanation.
If the message doesn't clearly match any key, respond "unclear".`;

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: String(userText).slice(0, 500) },
  ];

  try {
    const raw = await _callGroq(messages, { temperature: 0, max_tokens: 10, timeout: 15000 });
    const key = raw.trim().toLowerCase().replace(/[^a-z_]/g, '');
    return allowedKeys.includes(key) ? key : 'unclear';
  } catch {
    // Classification is best-effort routing, not the primary chat path —
    // fail closed to 'unclear' so the caller asks a clarifying question
    // instead of propagating a 503 for what should feel like a quick step.
    return 'unclear';
  }
};

const LANGUAGE_NAMES = {
  hi: 'Hindi', mr: 'Marathi', gu: 'Gujarati', ta: 'Tamil', te: 'Telugu',
  kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', bn: 'Bengali', or: 'Odia',
};

/**
 * Translate a single block of text into the target language, for the
 * content-translation cache (services/translationService.js) — a separate
 * concern from the chat assistant above. Any `<<<T{n}>>>` delimiter markers
 * used by the caller to batch multiple text runs into one call are preserved
 * character-for-character so the caller can split the response back apart.
 * @param {string} text
 * @param {string} targetLanguage - ISO 639-1 code, e.g. 'hi'
 * @param {{ maxTokens?: number }} [opts]
 * @returns {Promise<string>}
 */
const translateText = async (text, targetLanguage, { maxTokens = 1024 } = {}) => {
  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  // Only mention the marker convention when the input actually contains one —
  // describing it unconditionally caused the model to hallucinate <<<T0>>>
  // tokens into plain single-field translations (title/excerpt/seoTitle/...)
  // that never had any markers to begin with.
  const hasMarkers = /<<<T\d+>>>/.test(text);
  const markerInstruction = hasMarkers
    ? ' The text contains marker tokens that look like <<<T0>>>, <<<T1>>>, etc. — copy each one character-for-character in the same relative position; never translate, alter, or invent them.'
    : '';
  const messages = [
    {
      role: 'system',
      content: `You are a professional translator. Translate the user's text into ${languageName}. Preserve the exact meaning, tone, and formatting.${markerInstruction} Output ONLY the translated text, with no preamble, quotes, or explanation.`,
    },
    { role: 'user', content: text },
  ];
  return _callGroq(messages, { temperature: 0.3, max_tokens: maxTokens, timeout: 30000 });
};

// Alias kept so existing code that imported the old name still compiles
const getGeminiResponse = getGroqResponse;

module.exports = { getGroqResponse, getGeminiResponse, classifyIntent, translateText };
