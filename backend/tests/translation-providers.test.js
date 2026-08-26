/**
 * Unit tests for the pluggable translation-provider layer
 * (services/translationProviders/*) introduced when Sarvam AI became the
 * primary content-translation provider (Groq = temporary fallback).
 *
 * No network, no MongoDB: utils/settingsService is stubbed to behave like an
 * empty DB (env fallback wins), provider modules are stubbed via require.cache
 * for resolver tests, and Sarvam HTTP calls are injected via the provider's
 * internal `http` option. Run: npm test (node --test tests/)
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const SETTINGS_PATH = require.resolve(path.join(SRC, 'utils', 'settingsService.js'));
const SARVAM_PATH = require.resolve(path.join(SRC, 'services', 'translationProviders', 'sarvam.provider.js'));
const GROQ_PATH = require.resolve(path.join(SRC, 'services', 'translationProviders', 'groq.provider.js'));
const RESOLVER_PATH = require.resolve(path.join(SRC, 'services', 'translationProviders', 'index.js'));

function stubModule(resolvedPath, exportsObj) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsObj,
  };
}

// ── global stubs — must be installed BEFORE the provider modules load ──────
// Behave like "nothing configured in the DB": settings.get returns its
// fallback, which is exactly what production does for env-only deployments.
stubModule(SETTINGS_PATH, {
  get: async (_field, fallback) => fallback,
  all: async () => ({}),
  invalidate: () => {},
});

// Deterministic env regardless of a developer's local .env
delete process.env.SARVAM_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.SARVAM_MODEL;
delete process.env.TRANSLATION_PROVIDER;

const sarvam = require(SARVAM_PATH);

// ─────────────────────────── language mapping ───────────────────────────

test('maps every app language to its Sarvam locale code', () => {
  const expected = {
    en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', gu: 'gu-IN', ta: 'ta-IN',
    te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', bn: 'bn-IN', pa: 'pa-IN',
  };
  for (const [app, sarvamCode] of Object.entries(expected)) {
    assert.equal(sarvam.SARVAM_LANGUAGE_CODES[app], sarvamCode);
  }
});

test("maps Odia correctly: app code 'or' -> Sarvam 'od-IN' (not 'or-IN')", () => {
  assert.equal(sarvam.SARVAM_LANGUAGE_CODES.or, 'od-IN');
});

test('rejects languages Zutsav does not expose', async () => {
  await assert.rejects(
    () => sarvam.translate('hello', 'fr', { http: { post: async () => { throw new Error('should not be called'); } } }),
    /not mapped/
  );
});

// ─────────────────────────── placeholder protection ──────────────────────

test('mask -> unmask round-trips template variables and batch markers verbatim', () => {
  const original = 'Hello {{customer.name}}, booking #{{booking.number}} <<<T0>>>paid <<<T1>>>₹{{amount}} ok';
  const { masked, tokens } = sarvam.maskProtectedTokens(original);
  assert.equal(tokens.length, 5);
  assert.ok(!/\{\{|<<<T\d+>>>/.test(masked), 'masked text must not contain raw protected tokens');
  const restored = sarvam.unmaskProtectedTokens(masked, tokens);
  assert.equal(restored, original);
});

test('verification fails when a placeholder is mutated by the provider', () => {
  const tokens = ['{{name}}'];
  assert.equal(sarvam.protectedTokensIntact(tokens, 'Namaste {{name}}'), true);
  assert.equal(sarvam.protectedTokensIntact(tokens, 'Namaste ZPH0Z'), false); // sentinel left unrestored
  assert.equal(sarvam.protectedTokensIntact(tokens, 'Namaste'), false); // token dropped
});

// ─────────────────────────── chunking (>2000 char inputs) ────────────────

function rebuild(chunks) {
  return chunks.map((c) => c.text + c.joinAfter).join('');
}

test('short text takes the fast path (no chunking)', () => {
  assert.equal(sarvam.chunkText('tiny', 1900), null);
});

test('multi-line batched text is chunked at line boundaries only, losslessly', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `<<<T${i}>>>This is sample text run number ${i} with a few more words.`);
  const batched = lines.join('\n'); // ~3.9k chars — exceeds Sarvam's limit
  const chunks = sarvam.chunkText(batched, 1900);
  assert.ok(chunks.length >= 2, 'must produce multiple chunks');
  for (const c of chunks) {
    assert.ok(c.text.length <= 1900, `chunk length ${c.text.length} exceeds cap`);
    // every line inside a chunk must be a complete original run (marker intact at line start)
    for (const piece of c.text.split('\n')) {
      assert.match(piece, /^<<<T\d+>>>/);
    }
  }
  assert.equal(rebuild(chunks), batched, 'chunks must reassemble to the original text');
});

test('prose without newlines is chunked at sentence boundaries, never mid-word', () => {
  const sentence = 'Lord Shiva is the destroyer of evil and the patron of yoga and meditation. ';
  const prose = sentence.repeat(40); // ~3k chars, no newlines
  const chunks = sarvam.chunkText(prose, 1900);
  assert.ok(chunks.length >= 2);
  for (let i = 0; i < chunks.length - 1; i++) {
    assert.match(chunks[i].text.trim(), /[.!?।]$/, `chunk ${i} must end at a sentence boundary`);
  }
  assert.equal(rebuild(chunks), prose);
});

test('a single oversized token is hard-split as a last resort', () => {
  const monster = 'x'.repeat(4500);
  const chunks = sarvam.chunkText(monster, 1900);
  assert.ok(chunks.length >= 3);
  assert.equal(rebuild(chunks), monster);
});

// ─────────────────────────── Sarvam HTTP contract ────────────────────────

function echoHttp(log, { mutate } = {}) {
  return {
    async post(url, body, config) {
      log.push({ url, body, headers: config.headers });
      let out = body.input;
      if (mutate) out = out.replace(/ZPH\d+Z/g, ''); // simulate the model destroying sentinels
      return { data: { translated_text: out } };
    },
  };
}

test('sends the documented request shape with header auth (key never in URL/body)', async () => {
  process.env.SARVAM_API_KEY = 'test-key-123';
  try {
    const calls = [];
    const out = await sarvam.translate('Welcome to Zutsav', 'hi', { http: echoHttp(calls) });
    assert.equal(out, 'Welcome to Zutsav');
    assert.equal(calls.length, 1);
    const { url, body, headers } = calls[0];
    assert.equal(url, 'https://api.sarvam.ai/translate');
    assert.equal(headers['api-subscription-key'], 'test-key-123');
    assert.equal(body.model, 'sarvam-translate:v1');
    assert.equal(body.source_language_code, 'en-IN');
    assert.equal(body.target_language_code, 'hi-IN');
    assert.equal(body.input, 'Welcome to Zutsav');
    assert.ok(!JSON.stringify(body).includes('test-key-123'), 'key must never appear in the body');
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('{{placeholders}} survive translation verbatim', async () => {
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    const calls = [];
    const text = 'Your kit for booking {{booking.number}} ships via {{kit.courier}} today.';
    const out = await sarvam.translate(text, 'hi', { http: echoHttp(calls) });
    assert.ok(out.includes('{{booking.number}}') && out.includes('{{kit.courier}}'));
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('long batched content is split into multiple requests under the char cap and reassembled', async () => {
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    const calls = [];
    const lines = Array.from({ length: 60 }, (_, i) => `<<<T${i}>>>Sample spiritual content run number ${i}.`);
    const batched = lines.join('\n');
    assert.ok(batched.length > 1900);
    const out = await sarvam.translate(batched, 'ta', { http: echoHttp(calls) });
    assert.ok(calls.length >= 2, 'expected multiple Sarvam requests');
    for (const c of calls) assert.ok(c.body.input.length <= 1900);
    assert.equal(out, batched, 'echoed chunks must reassemble losslessly with markers intact');
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('returns the SOURCE text untouched when the provider mutates placeholders', async () => {
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    const calls = [];
    const text = 'Hi {{customer.name}}, your OTP is {{otp.code}}.';
    const out = await sarvam.translate(text, 'hi', { http: echoHttp(calls, { mutate: true }) });
    assert.equal(out, text, 'corruptible output must fall back to the source field');
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('retries transient 5xx with backoff, then succeeds', async () => {
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    let attempts = 0;
    const flaky = {
      async post() {
        attempts++;
        if (attempts === 1) {
          const err = new Error('boom');
          err.response = { status: 500, data: { error: { message: 'internal' } } };
          throw err;
        }
        return { data: { translated_text: 'ok' } };
      },
    };
    const out = await sarvam.translate('hello', 'hi', { http: flaky });
    assert.equal(attempts, 2);
    assert.equal(out, 'ok');
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('auth errors (403) fail fast — no retries', async () => {
  process.env.SARVAM_API_KEY = 'bad-key';
  try {
    let attempts = 0;
    const forbidden = {
      async post() {
        attempts++;
        const err = new Error('forbidden');
        err.response = { status: 403, data: { error: { message: 'invalid key' } } };
        throw err;
      },
    };
    await assert.rejects(() => sarvam.translate('hello', 'hi', { http: forbidden }));
    assert.equal(attempts, 1);
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('rate limits (429) are retried', async () => {
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    const statuses = [429, 429, 0]; // succeed on 3rd attempt
    let n = 0;
    const limited = {
      async post() {
        const s = statuses[n++];
        if (s) {
          const err = new Error('rate limited');
          err.response = { status: s, data: {} };
          throw err;
        }
        return { data: { translated_text: 'done' } };
      },
    };
    const out = await sarvam.translate('hello', 'bn', { http: limited });
    assert.equal(out, 'done');
    assert.equal(n, 3);
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

test('timeouts are classified as retryable', async () => {
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    let attempts = 0;
    const slow = {
      async post() {
        attempts++;
        if (attempts === 1) {
          const err = new Error('timeout of 15000ms exceeded');
          err.code = 'ECONNABORTED';
          throw err;
        }
        return { data: { translated_text: 'late but ok' } };
      },
    };
    const out = await sarvam.translate('hello', 'mr', { http: slow });
    assert.equal(attempts, 2);
    assert.equal(out, 'late but ok');
  } finally {
    delete process.env.SARVAM_API_KEY;
  }
});

// ─────────────────────────── resolver / fallback chain ───────────────────

// Stub both providers so resolver tests never touch real engines or keys.
const sarvamCalls = { n: 0 };
const groqCalls = { n: 0 };
const fakes = {
  sarvam: {
    name: 'sarvam',
    isConfigured: async () => true,
    translate: async (t) => { sarvamCalls.n += 1; return `sarvam:${t}`; },
  },
  groq: {
    name: 'groq',
    isConfigured: async () => true,
    translate: async (t) => { groqCalls.n += 1; return `groq:${t}`; },
  },
};
stubModule(SARVAM_PATH, fakes.sarvam);
stubModule(GROQ_PATH, fakes.groq);
const resolver = require(RESOLVER_PATH);

test('primary (sarvam) success means the fallback provider is never called', async () => {
  sarvamCalls.n = 0; groqCalls.n = 0;
  const r = await resolver.translateWithFallback({ text: 'temple', targetLanguage: 'hi' });
  assert.equal(r.text, 'sarvam:temple');
  assert.equal(r.provider, 'sarvam');
  assert.equal(groqCalls.n, 0, 'fallback must NOT be called when primary succeeds');
});

test('when sarvam fails, groq serves the request (and reports which provider won)', async () => {
  sarvamCalls.n = 0; groqCalls.n = 0;
  fakes.sarvam.isConfigured = async () => true;
  fakes.sarvam.translate = async () => { throw new Error('503 unavailable'); };
  const r = await resolver.translateWithFallback({ text: 'pooja', targetLanguage: 'ta' });
  assert.equal(r.provider, 'groq');
  assert.equal(r.text, 'groq:pooja');
  assert.equal(groqCalls.n, 1);
});

test('unconfigured providers are skipped without being called', async () => {
  sarvamCalls.n = 0; groqCalls.n = 0;
  fakes.groq.isConfigured = async () => false;
  await assert.rejects(
    () => resolver.translateWithFallback({ text: 'x', targetLanguage: 'hi' }),
    /All translation providers failed/
  );
  assert.equal(groqCalls.n, 0);
});

test('TRANSLATION_PROVIDER=groq flips the order without code changes (rollback switch)', async () => {
  const order = [];
  fakes.sarvam.isConfigured = async () => true;
  fakes.groq.isConfigured = async () => true;
  fakes.sarvam.translate = async (t) => { order.push('sarvam'); return `sarvam:${t}`; };
  fakes.groq.translate = async (t) => { order.push('groq'); return `groq:${t}`; };

  process.env.TRANSLATION_PROVIDER = 'groq';
  try {
    const r = await resolver.translateWithFallback({ text: 'order', targetLanguage: 'hi' });
    assert.deepEqual(order, ['groq']);
    assert.equal(r.provider, 'groq');
  } finally {
    delete process.env.TRANSLATION_PROVIDER;
  }
});
