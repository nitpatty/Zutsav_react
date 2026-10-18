/**
 * Location provider tests — OAuth layer, response normalisers, fallback,
 * redaction, caching and Temple compatibility.
 *
 * Scope: backend/src/services/olaAuth.js + locationService.js (the shared
 * provider both Temple and Pandit use). No test touches the network: axios
 * is patched in-process (node --test isolates this file in its own process)
 * and settingsService is stubbed so no MongoDB connection is required.
 *
 * Live provider behaviour (OAuth token acquisition + all three Places
 * endpoints returning HTTP 200 with Ola payloads, provider: 'ola-maps') was
 * verified separately against the real vendor API — these tests lock the
 * contract so it cannot silently regress.
 */

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const settings = require('../src/utils/settingsService');
const axios = require('axios');
const { createOlaAuth, DEFAULT_TTL_MS, REFRESH_MARGIN_MS } = require('../src/services/olaAuth');
const svc = require('../src/services/locationService');

/* ── helpers ───────────────────────────────────────────────────────────── */

const realGet = axios.get;
const realPost = axios.post;
const realSettingsGet = settings.get;

let creds = {}; // controls settingsService: { clientId?, clientSecret?, apiKey? }

beforeEach(() => {
  creds = {};
  settings.get = async (field) => creds[field === 'olaMapsClientId' ? 'clientId'
    : field === 'olaMapsClientSecret' ? 'clientSecret' : 'apiKey'] || null;
  svc.__testing.clearCache();
  svc.__testing.resetAuth();
  svc.__testing.resetHealth();
});

afterEach(() => {
  axios.get = realGet;
  axios.post = realPost;
  settings.get = realSettingsGet;
});

const TOKEN = 'test-token-aaaa1111';
const CID = 'test-client-id-1111';
const CSEC = 'test-client-secret-2222';

function tokenHttp(tokens = [TOKEN]) {
  let i = 0;
  axios.post = async () => ({ data: { access_token: tokens[Math.min(i, tokens.length - 1)] } , __calls: ++i });
}

function olaThenNominatim({ olaFails = true, olaPayload = null, nominatimPayload = [] } = {}) {
  const calls = [];
  axios.post = async () => ({ data: { access_token: TOKEN } });
  axios.get = async (url, config) => {
    calls.push({ url, config });
    if (String(url).includes('api.olamaps.io')) {
      if (olaFails) { const e = new Error('Request failed with status code 403'); e.response = { status: 403 }; throw e; }
      return { data: olaPayload };
    }
    return { data: nominatimPayload };
  };
  return calls;
}

const OLA_AUTOCOMPLETE = {
  status: 'ok', error_message: '', info_messages: [],
  predictions: [
    { reference: 'r1', description: 'Connaught Place, New Delhi, Delhi, 110001, India', place_id: 'ola:1', types: ['street_address'], geometry: { location: { lat: 28.6283, lng: 77.2155 } } },
    { reference: 'r2', description: 'Connaught Place Market, New Delhi, Delhi, 110001, India', place_id: 'ola:2', types: ['route'], geometry: { location: { lat: 28.6301, lng: 77.2170 } } },
  ],
};

const OLA_GEOCODE_MIXED = {
  status: 'ok',
  geocodingResults: [
    { formatted_address: 'New Delhi, Bahadurgarh, Delhi, 110035, India', types: ['postal_code'], geometry: { location: { lat: 28.677936, lng: 77.158882 } } },
    { formatted_address: 'New Delhi, Bahadurgarh, Delhi, 110001, India', types: ['postal_code'], geometry: { location: { lat: 28.623105, lng: 77.218474 } } },
    { formatted_address: 'Connaught Place, Hanuman Road Area, New Delhi, Delhi, 110001, India', types: ['street_address'], geometry: { location: { lat: 28.6315, lng: 77.2167 } } },
  ],
};

const OLA_GEOCODE_POSTAL_ONLY = {
  status: 'ok',
  geocodingResults: [
    { formatted_address: 'Noida, Uttar Pradesh, 201020, India', types: ['postal_code'], geometry: { location: { lat: 28.622006, lng: 77.347784 } } },
    { formatted_address: 'Noida, Uttar Pradesh, 201301, India', types: ['postal_code'], geometry: { location: { lat: 28.579339, lng: 77.328704 } } },
  ],
};

const OLA_REVERSE = {
  status: 'ok', error_message: '', info_messages: [],
  results: [
    { formatted_address: 'Foody Night, Connaught Place, New Delhi, Delhi, 110001, India', types: ['restaurant'], distance_meters: 6, geometry: { location: { lat: 28.63145, lng: 77.21668 } } },
    { formatted_address: 'Hanuman Road Area, Connaught Place, New Delhi, Delhi, 110001, India', types: ['street_address', 'route'], distance_meters: 40, geometry: { location: { lat: 28.6319, lng: 77.2160 } } },
  ],
};

/* ── olaAuth: token acquisition, expiry, single-flight, redaction ──────── */

test('olaAuth: acquires a token and reuses it until expiry', async () => {
  let posts = 0;
  const auth = createOlaAuth({
    tokenUrl: 'https://api.olamaps.io/auth/v1/token',
    http: { post: async () => { posts++; return { data: { access_token: TOKEN } }; } },
  });
  const t1 = await auth.getAccessToken({ clientId: CID, clientSecret: CSEC });
  assert.equal(t1, TOKEN);
  const t2 = await auth.getAccessToken({ clientId: CID, clientSecret: CSEC });
  assert.equal(t2, TOKEN);
  assert.equal(posts, 1, 'second call must be served from cache');
});

test('olaAuth: honors expires_in and re-mints after it elapses', async () => {
  let t = 1_000_000;
  let posts = 0;
  const auth = createOlaAuth({
    tokenUrl: 'u', now: () => t,
    http: { post: async () => { posts++; return { data: { access_token: `tok${posts}`, expires_in: 120 } }; } },
  });
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), 'tok1');
  t += 59 * 1000; // inside the 60s refresh margin
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), 'tok1');
  assert.equal(posts, 1);
  t += 61 * 1000; // past expiresAt - margin
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), 'tok2');
  assert.equal(posts, 2);
});

test('olaAuth: uses the default TTL when the response omits expires_in', async () => {
  let t = 1_000_000;
  let posts = 0;
  const auth = createOlaAuth({
    tokenUrl: 'u', now: () => t,
    http: { post: async () => { posts++; return { data: { access_token: `tok${posts}` } }; } }, // no expires_in (live behaviour)
  });
  await auth.getAccessToken({ clientId: CID, clientSecret: CSEC });
  t += DEFAULT_TTL_MS - REFRESH_MARGIN_MS - 1000;
  await auth.getAccessToken({ clientId: CID, clientSecret: CSEC });
  assert.equal(posts, 1, 'still cached inside default TTL minus margin');
  t += REFRESH_MARGIN_MS + 2000;
  await auth.getAccessToken({ clientId: CID, clientSecret: CSEC });
  assert.equal(posts, 2, 're-minted once the default TTL window passed');
});

test('olaAuth: single-flight — concurrent callers share one token request', async () => {
  let posts = 0;
  const auth = createOlaAuth({
    tokenUrl: 'u',
    http: { post: async () => { posts++; await new Promise((r) => setTimeout(r, 40)); return { data: { access_token: TOKEN } }; } },
  });
  const values = await Promise.all(
    Array.from({ length: 10 }, () => auth.getAccessToken({ clientId: CID, clientSecret: CSEC }))
  );
  assert.deepEqual(new Set(values), new Set([TOKEN]));
  assert.equal(posts, 1, 'ten concurrent callers must trigger exactly one mint');
});

test('olaAuth: invalidate forces a fresh mint (401 recovery path)', async () => {
  let i = 0;
  const auth = createOlaAuth({
    tokenUrl: 'u',
    http: { post: async () => ({ data: { access_token: `tok${++i}` } }) },
  });
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), 'tok1');
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), 'tok1');
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }, { invalidate: true }), 'tok2');
});

test('olaAuth: failed mint returns null and is never cached as success', async () => {
  let posts = 0;
  const auth = createOlaAuth({
    tokenUrl: 'u',
    http: { post: async () => { posts++; const e = new Error('Request failed with status code 401'); e.response = { status: 401 }; throw e; } },
  });
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), null);
  assert.equal(auth.describe().tokenCached, false);
  assert.equal(await auth.getAccessToken({ clientId: CID, clientSecret: CSEC }), null);
  assert.equal(posts, 2, 'a failed mint must not be cached — next call retries');
});

test('olaAuth: redact() strips token, client id and client secret', async () => {
  const auth = createOlaAuth({
    tokenUrl: 'u',
    http: { post: async () => ({ data: { access_token: TOKEN } }) },
  });
  await auth.getAccessToken({ clientId: CID, clientSecret: CSEC });
  const dirty = `Bearer ${TOKEN} client_id=${CID}&client_secret=${CSEC} access_token: ${TOKEN} ${TOKEN}`;
  const clean = auth.redact(dirty);
  for (const secret of [TOKEN, CID, CSEC]) {
    assert.ok(!clean.includes(secret), `redacted output must not contain ${secret.slice(0, 4)}…`);
  }
  assert.ok(clean.includes('[REDACTED]'));
});

test('olaAuth: no credentials → null without any HTTP call', async () => {
  let posts = 0;
  const auth = createOlaAuth({ tokenUrl: 'u', http: { post: async () => { posts++; return { data: {} }; } } });
  assert.equal(await auth.getAccessToken({ clientId: '', clientSecret: '' }), null);
  assert.equal(posts, 0);
});

/* ── locationService: auth wiring ──────────────────────────────────────── */

test('locationService: OAuth mode sends Bearer token, never api_key', async () => {
  creds = { clientId: CID, clientSecret: CSEC, apiKey: 'legacy-key-should-not-be-used' };
  tokenHttp();
  const gets = [];
  axios.get = async (url, config) => { gets.push({ url, config }); return { data: OLA_AUTOCOMPLETE }; };

  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(out.found, true);
  assert.equal(out.provider, 'ola-maps');
  assert.equal(gets.length, 1);
  assert.equal(gets[0].config.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(gets[0].config.params.api_key, undefined, 'OAuth must not fall back to api_key');
});

test('locationService: api-key mode preserved when only a key is configured', async () => {
  creds = { apiKey: 'only-a-key-123' };
  const gets = [];
  axios.get = async (url, config) => { gets.push({ url, config }); return { data: OLA_AUTOCOMPLETE }; };
  axios.post = async () => { throw new Error('token endpoint must not be used in api-key mode'); };

  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(out.provider, 'ola-maps');
  assert.equal(gets[0].config.params.api_key, 'only-a-key-123');
  assert.equal(gets[0].config.headers.Authorization, undefined);
});

test('locationService: no credentials at all → Nominatim, no Ola/anonymous call, not flagged unavailable', async () => {
  creds = {};
  const calls = olaThenNominatim({ olaFails: false, olaPayload: null, nominatimPayload: [
    { display_name: 'Connaught Place, New Delhi', lat: '28.6315', lon: '77.2167', place_id: 101 },
  ] });
  // With no credentials the service must not even try Ola (mode 'none'):
  axios.get = async (url, config) => {
    assert.ok(!String(url).includes('api.olamaps.io'), 'no anonymous Ola call allowed');
    return { data: [{ display_name: 'Connaught Place, New Delhi', lat: '28.6315', lon: '77.2167', place_id: 101 }] };
  };
  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(out.found, true);
  assert.equal(out.provider, 'nominatim');
  assert.ok(!out.providerUnavailable, 'unconfigured is not a failure');
  assert.equal(calls.length, 0);
});

test('locationService: Places401 re-mints the token exactly once and retries', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp(['tok-first', 'tok-second']);
  let gets = 0;
  axios.get = async (url, config) => {
    gets++;
    if (gets === 1) { const e = new Error('Request failed with status code 401'); e.response = { status: 401 }; throw e; }
    assert.equal(config.headers.Authorization, 'Bearer tok-second');
    return { data: OLA_AUTOCOMPLETE };
  };
  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(out.provider, 'ola-maps');
  assert.equal(gets, 2);
});

test('locationService: persistent401 → auth-failed, honest Nominatim fallback, short cache TTL', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async (url, config) => {
    if (String(url).includes('api.olamaps.io')) {
      const e = new Error('Request failed with status code 401'); e.response = { status: 401 }; throw e;
    }
    return { data: [{ display_name: 'Connaught Place, New Delhi', lat: '28.6315', lon: '77.2167', place_id: 1 }] };
  };
  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(out.found, true);
  assert.equal(out.provider, 'nominatim', 'fallback must be labelled nominatim');
  assert.equal(out.providerUnavailable, true);
  const peek = svc.__testing.cachePeek('search:connaught place');
  assert.equal(peek.ttlMs, 30000, 'auth-failure fallbacks must use the short TTL');
});

test('locationService: token endpoint down → auth-unavailable, no Places call, fallback runs', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  axios.post = async () => { throw new Error('ECONNREFUSED'); };
  const seen = [];
  axios.get = async (url, config) => {
    seen.push(String(url));
    assert.ok(!config.headers || !config.headers.Authorization, 'must not call Places without a token');
    return { data: [{ display_name: 'Sector 18, Noida', lat: '28.5707', lon: '77.3229', place_id: 2 }] };
  };
  const out = await svc.geocodeAddress('Sector 18, Noida, Uttar Pradesh 201301, India');
  assert.equal(out.found, true);
  assert.equal(out.provider, 'nominatim');
  assert.equal(out.providerUnavailable, true);
  assert.equal(seen.length, 1, 'only the Nominatim call happens');
  assert.ok(seen[0].includes('nominatim.openstreetmap.org'));
});

test('locationService: rate-limit (429) is not retried and is reported as rate-limited', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  let olaGets = 0;
  axios.get = async (url, config) => {
    if (String(url).includes('api.olamaps.io')) {
      olaGets++;
      const e = new Error('Request failed with status code 429'); e.response = { status: 429 }; throw e;
    }
    return { data: [{ display_name: 'Connaught Place, New Delhi', lat: '28.6315', lon: '77.2167', place_id: 3 }] };
  };
  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(olaGets, 1, '429 must not trigger the token-refresh retry');
  assert.equal(out.found, true);
  assert.equal(out.provider, 'nominatim');
  assert.equal(out.providerUnavailable, true);
});

test('locationService: non-OK provider status (e.g. REQUEST_DENIED) is a failure, not a success', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: { status: 'REQUEST_DENIED', error_message: 'denied' } });
  const out = await svc.geocodeAddress('Connaught Place, New Delhi');
  assert.equal(out.found, false);
  assert.equal(out.providerUnavailable, true);
});

test('locationService: both providers failing → found:false with providerUnavailable', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => { const e = new Error('boom'); e.response = { status: 500 }; throw e; };
  const out = await svc.geocodeAddress('Connaught Place, New Delhi');
  assert.deepEqual(out, { found: false, providerUnavailable: true });
});

/* ── normalisers + row ranking ─────────────────────────────────────────── */

test('normaliser: autocomplete → labelled results with valid coordinates and placeIds', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: OLA_AUTOCOMPLETE });
  const out = await svc.searchPlaces('Connaught Place');
  assert.equal(out.provider, 'ola-maps');
  assert.equal(out.results.length, 2);
  const [top] = out.results;
  assert.equal(top.label, 'Connaught Place, New Delhi, Delhi, 110001, India');
  assert.equal(top.lat, 28.6283);
  assert.equal(top.lng, 77.2155);
  assert.equal(top.placeId, 'ola:1');
});

test('normaliser: geocode prefers a street row over postal centroids', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: OLA_GEOCODE_MIXED });
  const out = await svc.geocodeAddress('Connaught Place, New Delhi, Delhi 110001');
  assert.equal(out.provider, 'ola-maps');
  assert.equal(out.lat, 28.6315, 'street row must beat postal rows despite lower provider rank');
  assert.ok(out.label.includes('Connaught Place'));
});

test('normaliser: geocode picks the query pincode when all rows are postal', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: OLA_GEOCODE_POSTAL_ONLY });
  const out = await svc.geocodeAddress('Sector 18, Noida, Uttar Pradesh 201301, India');
  assert.equal(out.lat, 28.579339, 'the 201301 row must win, not the first-ranked 201020');
  assert.ok(out.label.includes('201301'));
});

test('normaliser: reverse prefers an address-like row over a nearer business', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: OLA_REVERSE });
  const out = await svc.reverseGeocode(28.6315, 77.2167);
  assert.equal(out.provider, 'ola-maps');
  assert.ok(out.displayName.startsWith('Hanuman Road Area'), 'street row wins over the 6 m restaurant');
});

test('normaliser: Temple-shaped queries stay fully compatible (shared service regression)', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: {
    status: 'ok',
    geocodingResults: [
      { formatted_address: 'Kanaka Durga Temple, Vijayawada, Andhra Pradesh, 520001, India', types: ['place_of_worship', 'hindu_temple'], geometry: { location: { lat: 16.4985, lng: 80.634 } } },
    ],
  } });
  // temple.controller.js:34 builds `${address}, ${city}, ${state}, India`
  const out = await svc.geocodeAddress('Kanaka Durga Temple Ghat Road, Vijayawada, Andhra Pradesh, India');
  assert.equal(out.found, true);
  assert.equal(out.provider, 'ola-maps');
  assert.equal(out.lat, 16.4985);
  assert.equal(out.lng, 80.634);

  axios.get = async () => ({ data: OLA_AUTOCOMPLETE });
  const search = await svc.searchPlaces('Kanaka Durga Temple');
  assert.equal(search.found, true);
  assert.equal(search.provider, 'ola-maps');
});

/* ── Nominatim fallback + double-India suffix ──────────────────────────── */

test('fallback: Nominatim query never receives a doubled ", India" suffix', async () => {
  creds = {};
  const qs = [];
  axios.get = async (url, config) => {
    qs.push(config.params.q);
    return { data: [{ display_name: 'Sector 18, Noida, Uttar Pradesh 201301', lat: '28.5705', lon: '77.3229', place_id: 7 }] };
  };
  await svc.geocodeAddress('Sector 18, Noida, Uttar Pradesh 201301, India');
  await svc.geocodeAddress('Connaught Place, New Delhi, Delhi 110001');
  assert.equal(qs[0], 'Sector 18, Noida, Uttar Pradesh 201301, India', 'already-country query must not gain a second India');
  assert.equal(qs[1], 'Connaught Place, New Delhi, Delhi 110001, India');
  assert.ok(!/India,\s*India$/i.test(qs[0]) && !/India,\s*India$/i.test(qs[1]));
});

test('withIndia: pure helper cases (regression examples from the audit)', () => {
  const { withIndia } = svc.__testing;
  assert.equal(withIndia('Sector 18, Noida, Uttar Pradesh 201301'), 'Sector 18, Noida, Uttar Pradesh 201301, India');
  assert.equal(withIndia('Sector 18, Noida, Uttar Pradesh 201301, India'), 'Sector 18, Noida, Uttar Pradesh 201301, India');
  assert.equal(withIndia('India Gate, New Delhi'), 'India Gate, New Delhi, India', 'an India-named landmark still gets the country suffix');
  assert.equal(withIndia(''), '');
});

/* ── caching behaviour ─────────────────────────────────────────────────── */

test('cache: healthy Ola results use the long TTL; query repeat avoids a second Ola call', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  let olaGets = 0;
  axios.get = async () => { olaGets++; return { data: OLA_AUTOCOMPLETE }; };
  await svc.searchPlaces('Connaught Place');
  assert.equal(olaGets, 1);
  const peek = svc.__testing.cachePeek('search:connaught place');
  assert.equal(peek.ttlMs, 300000);
  const again = await svc.searchPlaces('Connaught Place');
  assert.equal(olaGets, 1, 'repeat served from cache');
  assert.equal(again.found, true);
});

test('cache: Nominatim-only deployments cache normally (no-key is not a failure)', async () => {
  creds = {};
  axios.get = async (url, config) => ({ data: [{ display_name: 'Agra, Uttar Pradesh', lat: '27.1767', lon: '78.0081', place_id: 9 }] });
  await svc.geocodeAddress('Agra, Uttar Pradesh');
  assert.equal(svc.__testing.cachePeek('geocode:agra, uttar pradesh').ttlMs, 300000);
});

test('cache: reverse geocode is never cached', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  let gets = 0;
  axios.get = async () => { gets++; return { data: OLA_REVERSE }; };
  await svc.reverseGeocode(28.6315, 77.2167);
  await svc.reverseGeocode(28.6315, 77.2167);
  assert.equal(gets, 2);
});

/* ── health + redaction observability ──────────────────────────────────── */

test('health: reports oauth mode + timestamps and never leaks secrets', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: OLA_AUTOCOMPLETE });
  await svc.searchPlaces('Connaught Place');

  const health = await svc.getProviderHealth();
  assert.equal(health.provider, 'ola-maps');
  assert.equal(health.authMode, 'oauth');
  assert.equal(health.oauth, 'configured');
  assert.equal(health.token.cached, true);
  assert.ok(health.lastSuccessAt, 'a successful Ola call must be timestamped');
  assert.equal(health.consecutiveFailures, 0);

  const dump = JSON.stringify(health);
  for (const secret of [TOKEN, CID, CSEC]) assert.ok(!dump.includes(secret));
  assert.ok(!dump.includes('Bearer'));
});

test('health: failures are observable (reason + consecutive counter)', async () => {
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => { const e = new Error('nope'); e.response = { status: 403 }; throw e; };
  await svc.searchPlaces('Connaught Place');
  const health = await svc.getProviderHealth();
  assert.ok(health.lastFailureAt);
  assert.ok(['auth-failed', 'rate-limited', 'provider-error'].includes(health.lastFailure));
  assert.ok(health.consecutiveFailures >= 1);
});

test('redact: service-level log redaction covers env credentials too', async () => {
  // Redaction is defense-in-depth for strings that contain material the
  // service has actually handled — run a real flow first so the token layer
  // knows the active credentials, then redact a dirty string.
  creds = { clientId: CID, clientSecret: CSEC };
  tokenHttp();
  axios.get = async () => ({ data: OLA_AUTOCOMPLETE });
  await svc.searchPlaces('Connaught Place');

  const dirty = `token=${TOKEN} id=${CID} secret=${CSEC} Bearer ${TOKEN}`;
  const clean = svc.__testing.redact(dirty);
  for (const secret of [TOKEN, CID, CSEC]) assert.ok(!clean.includes(secret));
  assert.ok(clean.includes('[REDACTED]'));
});
