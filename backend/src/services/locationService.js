/**
 * Location Service — provider-agnostic place search / geocoding.
 *
 * Public operations (all normalize into plain application shapes, callers
 * never see raw vendor payloads):
 *
 *   searchPlaces(query)        → { found, provider, results:[{label,lat,lng,placeId}] }
 *   geocodeAddress(query)      → { found, provider, lat, lng, label }
 *   reverseGeocode(lat, lng)   → { found, provider, displayName }
 *
 * Provider order:
 *   1. Ola Maps  (primary — Indian-location quality; OAuth 2.0 client-credentials)
 *   2. Nominatim (fallback — kept so an Ola outage/credential problem degrades
 *      gracefully instead of breaking the admin form. Fallback responses are
 *      marked `providerUnavailable: true` and are never cached long when the
 *      cause was an Ola authentication failure, so recovery is visible fast.)
 *
 * Authentication (see services/olaAuth.js for the token layer):
 *   - OAuth 2.0 is used whenever OLA_MAPS_CLIENT_ID + OLA_MAPS_CLIENT_SECRET
 *     are configured — the working method (verified against
 *     https://maps.olakrutrim.com/docs/auth).
 *   - A separately configured API key (`OLA_MAPS_API_KEY`, documented vendor
 *     mode) is preserved as an explicit fallback for deployments that only
 *     have a key. The Client ID/Secret are NEVER sent as an `api_key`.
 *   - Credentials resolve server-side only (env, with the same Config Center
 *     lookup pattern other keys use). Nothing here is ever returned by an
 *     endpoint or logged: every log line passes through redaction.
 */

const axios = require('axios');
const settings = require('../utils/settingsService');
const { readEnv } = require('../config/env');
const { olamaps } = require('../config/integrations.config');
const { createOlaAuth } = require('./olaAuth');

const ENV_API_KEY = readEnv('OLA_MAPS_API_KEY') || '';
const ENV_CLIENT_ID = readEnv('OLA_MAPS_CLIENT_ID') || '';
const ENV_CLIENT_SECRET = readEnv('OLA_MAPS_CLIENT_SECRET') || '';
const REQUEST_TIMEOUT_MS = 8000;

/* ── Small TTL cache for identical text queries ─────────────────────────── */
/* Place data for a given query string doesn't change within minutes, and
   admins commonly re-run the same search while editing. A tiny process-local
   cache absorbs those repeats without introducing Redis. Never caches
   reverse-geocode results (cheap, coordinates vary continuously).

   Entries carry their own TTL: results produced while Ola was failing are
   cached only briefly (FALLBACK_CACHE_TTL_MS) so an auth/credential fix
   becomes visible almost immediately instead of being masked by a
   long-lived cached fallback. */

const CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 300;
const _cache = new Map(); // key → { value, at, ttl }

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > (hit.ttl || CACHE_TTL_MS)) { _cache.delete(key); return undefined; }
  return hit.value;
}

function cacheSet(key, value, ttlMs = CACHE_TTL_MS) {
  if (_cache.size >= CACHE_MAX_ENTRIES) {
    _cache.delete(_cache.keys().next().value);
  }
  _cache.set(key, { value, at: Date.now(), ttl: ttlMs });
}

/* ── Credential resolution ─────────────────────────────────────────────── */
/* Same read pattern as every other vendor key (DB value wins, env fallback).
   SystemSettings currently has no olaMaps* fields (strict schema), so env is
   the effective source in practice; the lookup is kept for parity and for a
   future Config Center field. Failures (DB down) fall back to env. */

function readSetting(field, fallback) {
  return settings.get(field, fallback || null).catch(() => fallback || null);
}

async function getOlaCredentials() {
  const [clientId, clientSecret, apiKey] = await Promise.all([
    readSetting('olaMapsClientId', ENV_CLIENT_ID),
    readSetting('olaMapsClientSecret', ENV_CLIENT_SECRET),
    readSetting('olaMapsApiKey', ENV_API_KEY),
  ]);
  return { clientId: clientId || '', clientSecret: clientSecret || '', apiKey: apiKey || '' };
}

/** Which documented auth mode applies. OAuth wins whenever fully configured. */
function authModeFor(creds) {
  if (creds.clientId && creds.clientSecret) return 'oauth';
  if (creds.apiKey) return 'api-key';
  return 'none';
}

/* ── Redacted logging + secret-free provider health ────────────────────── */

const _health = {
  authMode: null,            // 'oauth' | 'api-key' | 'none'
  oauth: 'unknown',          // 'configured' | 'partial' | 'not-configured'
  tokenAcquiredAt: null,
  tokenExpiresAt: null,
  lastOlaSuccessAt: null,
  lastOlaFailureAt: null,
  lastOlaFailure: null,      // skipReason, e.g. 'auth-failed'
  consecutiveOlaFailures: 0,
};

function redactLog(text) {
  let s = olaAuth.redact(String(text == null ? '' : text));
  if (ENV_API_KEY) s = s.split(ENV_API_KEY).join('[REDACTED]');
  if (ENV_CLIENT_ID) s = s.split(ENV_CLIENT_ID).join('[REDACTED]');
  if (ENV_CLIENT_SECRET) s = s.split(ENV_CLIENT_SECRET).join('[REDACTED]');
  return s;
}

function warn(msg) {
  console.warn(redactLog(msg));
}

function recordOlaSuccess() {
  _health.lastOlaSuccessAt = Date.now();
  _health.consecutiveOlaFailures = 0;
}

function recordOlaFailure(reason) {
  _health.lastOlaFailureAt = Date.now();
  _health.lastOlaFailure = reason;
  _health.consecutiveOlaFailures += 1;
}

function isoOrNull(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

/**
 * Secret-free Ola availability/authentication status for /api/health.
 * Never includes credentials, tokens or request configuration.
 */
async function getProviderHealth() {
  let creds = null;
  try { creds = await getOlaCredentials(); } catch { creds = null; }
  const mode = creds ? authModeFor(creds) : 'none';
  const oauth = !creds || (!creds.clientId && !creds.clientSecret)
    ? 'not-configured'
    : (creds.clientId && creds.clientSecret ? 'configured' : 'partial');
  const token = olaAuth.describe();
  return {
    provider: 'ola-maps',
    fallback: 'nominatim',
    authMode: mode,
    oauth,
    token: { cached: token.tokenCached, expiresAt: token.tokenExpiresAt },
    lastSuccessAt: isoOrNull(_health.lastOlaSuccessAt),
    lastFailureAt: isoOrNull(_health.lastOlaFailureAt),
    lastFailure: _health.lastOlaFailure,
    consecutiveFailures: _health.consecutiveOlaFailures,
  };
}

/* ── Response normalization ─────────────────────────────────────────────── */
/* Ola's payloads have shifted shape between versions (strings vs numbers,
   `location` vs `geometry.location`, snake_case vs camelCase). These helpers
   accept every observed variant instead of trusting one exact schema. */

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function extractLatLng(entry) {
  // variants: entry.location.{lat,lng} | entry.geometry.location.{lat,lng}
  const candidates = [entry?.location, entry?.geometry?.location];
  for (const loc of candidates) {
    const lat = toNum(loc?.lat);
    const lng = toNum(loc?.lng ?? loc?.lon);
    if (lat !== null && lng !== null) return { lat, lng };
  }
  // top-level lat/lng fallback (some autocomplete shapes flatten them)
  const lat = toNum(entry?.lat);
  const lng = toNum(entry?.lng ?? entry?.lon);
  if (lat !== null && lng !== null) return { lat, lng };
  return null;
}

function extractLabel(entry) {
  return (
    entry?.description ||
    entry?.formattedAddress ||
    entry?.formatted_address ||
    (entry?.structuredFormat
      ? [entry.structuredFormat.mainText?.text || entry.structuredFormat.main_text?.text,
         entry.structuredFormat.secondaryText?.text || entry.structuredFormat.secondary_text?.text]
          .filter(Boolean).join(', ')
      : '') ||
    ''
  ).trim();
}

function pickArray(data, keys) {
  for (const k of keys) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

/* Row ranking — live Ola payloads order `geocodingResults` by provider
   confidence, which for Indian pincode-shaped queries surfaces *any* postal
   code first (e.g. "Connaught Place … 110001" ranked Bahadurgarh 110035
   ~7 km away at index 0). Blindly taking row[0] would pair an address with
   coordinates from a different pincode. Ranking rules:
     - geocode: prefer the row whose label carries the query's 6-digit PIN,
       then non-postal rows (POI/street), keep provider order on ties;
     - reverse: prefer address-like rows over nearby businesses, then the
       nearest row (Ola reverse returns POIs sorted by distance). */

const ADDRESS_LIKE_TYPES = new Set([
  'street_address', 'premise', 'subpremise', 'neighborhood', 'sublocality',
  'sublocality_level_1', 'locality', 'administrative', 'political',
  'postal_code', 'postal_town', 'residential', 'road', 'house_number',
]);
const PINCODE_RE = /\b\d{6}\b/;

function componentByType(components, type) {
  if (!Array.isArray(components)) return null;
  const comp = components.find((c) => Array.isArray(c?.types) && c.types.includes(type));
  if (!comp) return null;
  return comp.long_name || comp.short_name || null;
}

function extractComponents(row) {
  const comps = row?.address_components || row?.addressComponents;
  if (!Array.isArray(comps) || comps.length === 0) return {};
  const pincode = componentByType(comps, 'postal_code');
  const city =
    componentByType(comps, 'locality') ||
    componentByType(comps, 'administrative_area_level_3') ||
    componentByType(comps, 'administrative_area_level_2');
  const state = componentByType(comps, 'administrative_area_level_1');
  const district = componentByType(comps, 'administrative_area_level_2');
  const locality =
    componentByType(comps, 'sublocality_level_1') ||
    componentByType(comps, 'sublocality') ||
    componentByType(comps, 'neighborhood');
  const out = {};
  if (pincode) out.pincode = pincode;
  if (city) out.city = city;
  if (state) out.state = state;
  if (district) out.district = district;
  if (locality) out.locality = locality;
  return out;
}

function pickGeocodeRow(rows, query) {
  const pincode = (String(query || '').match(PINCODE_RE) || [])[0];
  let best = null;
  rows.forEach((row) => {
    const coords = extractLatLng(row);
    const label = extractLabel(row);
    if (!coords || !label) return;
    const types = Array.isArray(row?.types) ? row.types : [];
    const postalOnly = types.length > 0 && types.every((t) => t === 'postal_code' || t === 'postal_town');
    let score = 0;
    if (!postalOnly) score += 2;                                  // street/POI beats a postal centroid
    if (pincode && label.includes(pincode)) score += 1;           // among postal rows, matching PIN wins
    const components = extractComponents(row);
    if (!best || score > best.score) best = { coords, label, score, components };
  });
  return best;
}

function pickReverseRow(rows) {
  let best = null;
  rows.forEach((row) => {
    const label = extractLabel(row);
    if (!label) return;
    const types = Array.isArray(row?.types) ? row.types : [];
    const addressLike = types.some((t) => ADDRESS_LIKE_TYPES.has(t));
    const distRaw = Number(row?.distance_meters);
    const dist = Number.isFinite(distRaw) ? distRaw : Number.MAX_SAFE_INTEGER;
    const score = (addressLike ? 1e12 : 0) - dist;
    const components = extractComponents(row);
    if (!best || score > best.score) best = { label, score, components };
  });
  return best;
}

/* ── OAuth token layer (memory-only; see services/olaAuth.js) ──────────── */

const olaAuth = createOlaAuth({
  tokenUrl: `${olamaps.baseUrl}${olamaps.tokenPath}`,
  timeoutMs: REQUEST_TIMEOUT_MS,
  onEvent: (ev) => {
    if (ev.type === 'token-ok') {
      _health.tokenAcquiredAt = ev.at;
      _health.tokenExpiresAt = ev.expiresAt;
    } else {
      _health.tokenAcquiredAt = null;
      _health.tokenExpiresAt = null;
      _health.lastOlaFailureAt = ev.at;
      _health.lastOlaFailure = 'token-failed';
      warn(`[Location] Ola token acquisition failed${ev.status ? ` (HTTP ${ev.status})` : ''}: ${ev.message}`);
    }
  },
});

/* ── Ola Maps provider ──────────────────────────────────────────────────── */

async function olaRequest(path, params) {
  const creds = await getOlaCredentials();
  const mode = authModeFor(creds);
  _health.authMode = mode;
  _health.oauth = (!creds.clientId && !creds.clientSecret)
    ? 'not-configured'
    : (creds.clientId && creds.clientSecret ? 'configured' : 'partial');
  if (mode === 'none') return { ok: false, skipReason: 'no-key' };

  let finalSkip = 'provider-error';
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = { Accept: 'application/json' };
    const reqParams = { ...params };

    if (mode === 'oauth') {
      const token = await olaAuth.getAccessToken(creds, attempt > 0 ? { invalidate: true } : {});
      if (!token) {
        // No token → do not call Places (an anonymous call is a guaranteed
        // 401 and would only add noise). Fallback still runs.
        recordOlaFailure('auth-unavailable');
        return { ok: false, skipReason: 'auth-unavailable' };
      }
      headers.Authorization = `Bearer ${token}`; // never in the URL, never logged
    } else {
      // Documented API-key mode, kept for key-only deployments.
      reqParams.api_key = creds.apiKey;
    }

    try {
      const { data } = await axios.get(`${olamaps.baseUrl}${path}`, {
        params: reqParams,
        timeout: REQUEST_TIMEOUT_MS,
        headers,
      });

      const status = String(data?.status || '').toUpperCase();
      if (status && !['OK', 'ZERO_RESULTS'].includes(status)) {
        // e.g. INVALID_REQUEST / ACCESS_DENIED — treat as provider failure but
        // log without any credential material.
        warn(`[Location] Ola Maps ${path} responded status=${status}`);
        recordOlaFailure(`provider-status-${status.toLowerCase()}`);
        return { ok: false, skipReason: `provider-status-${status.toLowerCase()}` };
      }
      recordOlaSuccess();
      return { ok: true, data };
    } catch (err) {
      const code = err.response?.status;
      const authFailure = code === 401 || code === 403;
      if (mode === 'oauth' && authFailure && attempt === 0) {
        // Expired/revoked token: re-mint exactly once, then report honestly.
        finalSkip = 'auth-failed';
        continue;
      }
      warn(
        `[Location] Ola Maps ${path} failed${code ? ` (HTTP ${code})` : ''}: ${err.message}`
      );
      const skip = code === 429 ? 'rate-limited' : authFailure ? 'auth-failed' : 'provider-error';
      recordOlaFailure(skip);
      return { ok: false, skipReason: skip };
    }
  }
  recordOlaFailure(finalSkip);
  return { ok: false, skipReason: finalSkip };
}

/** Autocomplete — interactive place search. */
async function olaSearchPlaces(query) {
  const res = await olaRequest(olamaps.autocompletePath, { input: query });
  if (!res.ok) return { ok: false, skipReason: res.skipReason };

  const suggestions = pickArray(res.data, ['suggestions', 'predictions', 'results']);
  const results = [];
  for (const s of suggestions) {
    const coords = extractLatLng(s);
    const label = extractLabel(s);
    if (!coords || !label) continue;
    const components = extractComponents(s);
    results.push({ label, lat: coords.lat, lng: coords.lng, placeId: s.placeId || s.place_id || '', components });
    if (results.length >= 8) break; // result limiting — UI shows top matches only
  }
  return { ok: true, results };
}

/** Forward geocoding — explicit address/place-name → coordinates. */
async function olaGeocodeAddress(query) {
  const res = await olaRequest(olamaps.geocodePath, { address: query });
  if (!res.ok) return { ok: false, skipReason: res.skipReason };

  const rows = pickArray(res.data, ['geocodingResults', 'results']);
  const best = pickGeocodeRow(rows, query);
  if (best) return { ok: true, lat: best.coords.lat, lng: best.coords.lng, label: best.label, components: best.components || {} };
  return { ok: true, empty: true };
}

/** Reverse geocoding — coordinates → human-readable address. */
async function olaReverseGeocode(lat, lng) {
  const res = await olaRequest(olamaps.reverseGeocodePath, { latlng: `${lat},${lng}` });
  if (!res.ok) return { ok: false, skipReason: res.skipReason };

  const rows = pickArray(res.data, ['results', 'addresses']);
  const best = pickReverseRow(rows);
  if (best) return { ok: true, displayName: best.label, components: best.components || {} };
  return { ok: true, empty: true };
}

/* ── Nominatim provider (fallback during migration) ─────────────────────── */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

async function nominatimRequest(params) {
  try {
    const { data } = await axios.get(`${NOMINATIM_BASE}/${params._path}`, {
      params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== '_path')),
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Zutsav/1.0 (location-fallback)',
        Accept: 'application/json',
      },
    });
    return { ok: true, data };
  } catch (err) {
    warn(`[Location] Nominatim ${params._path} failed: ${err.message}`);
    return { ok: false };
  }
}

/** Append ", India" only when the query doesn't already name the country —
 *  prevents the double suffix ("…201301, India, India") that degraded the
 *  Nominatim fallback for pincode-shaped addresses. */
function withIndia(query) {
  const q = String(query || '').trim();
  if (!q) return q;
  return /,\s*India\s*$/i.test(q) ? q : `${q}, India`;
}

async function nominatimSearchPlaces(query) {
  const res = await nominatimRequest({
    _path: 'search', q: query, format: 'json', addressdetails: '1',
    limit: '8', countrycodes: 'in',
  });
  if (!res.ok) return { ok: false };
  const results = (res.data || [])
    .map((row) => ({
      label: row.display_name || '',
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lon),
      placeId: row.place_id ? String(row.place_id) : '',
    }))
    .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .slice(0, 8);
  return { ok: true, results };
}

async function nominatimGeocodeAddress(query) {
  const res = await nominatimRequest({
    _path: 'search', q: withIndia(query), format: 'json', limit: '1', countrycodes: 'in', addressdetails: '1',
  });
  if (!res.ok) return { ok: false };
  const first = (res.data || [])[0];
  if (!first) return { ok: true, empty: true };
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: true, empty: true };
  const addr = first.address || {};
  const components = {};
  if (addr.postcode) components.pincode = addr.postcode;
  if (addr.city || addr.town || addr.municipality) components.city = addr.city || addr.town || addr.municipality;
  if (addr.state) components.state = addr.state;
  if (addr.state_district || addr.county) components.district = addr.state_district || addr.county;
  if (addr.suburb || addr.neighbourhood) components.locality = addr.suburb || addr.neighbourhood;
  return { ok: true, lat, lng, label: first.display_name || query, components };
}

async function nominatimReverseGeocode(lat, lng) {
  const res = await nominatimRequest({
    _path: 'reverse', format: 'json', lat: String(lat), lon: String(lng),
  });
  if (!res.ok) return { ok: false };
  const addr = res.data?.address || {};
  const components = {};
  if (addr.postcode) components.pincode = addr.postcode;
  if (addr.city || addr.town || addr.municipality) components.city = addr.city || addr.town || addr.municipality;
  if (addr.state) components.state = addr.state;
  if (addr.state_district || addr.county) components.district = addr.state_district || addr.county;
  if (addr.suburb || addr.neighbourhood) components.locality = addr.suburb || addr.neighbourhood;
  return { ok: true, displayName: res.data?.display_name || '', components };
}

/* ── Public API — Ola first, Nominatim fallback on failure/no-key ───────── */

/** Was the Ola attempt itself unhealthy (auth/provider error)? A missing
 *  key is "not configured", not a failure — that's a permanent Nominatim
 *  deployment and caches normally. */
function olaUnhealthy(ola) {
  return ola.ok === false && ola.skipReason !== 'no-key';
}

/**
 * Interactive place search (autocomplete).
 * @returns {Promise<{found:boolean, provider?:'ola-maps'|'nominatim', results:Array<{label:string,lat:number,lng:number,placeId:string}>, providerUnavailable?:boolean}>}
 */
async function searchPlaces(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return { found: false, results: [] };

  const key = `search:${trimmed.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const ola = await olaSearchPlaces(trimmed);
  let out;
  if (ola.ok && ola.results.length > 0) {
    out = { found: true, provider: 'ola-maps', results: ola.results };
  } else {
    const nomi = await nominatimSearchPlaces(trimmed);
    out = nomi.ok && nomi.results.length > 0
      ? { found: true, provider: 'nominatim', results: nomi.results.map(r => ({ ...r, components: {} })), providerUnavailable: olaUnhealthy(ola) }
      : { found: false, results: [], providerUnavailable: olaUnhealthy(ola) };
  }

  // An Ola failure produced this entry → keep it short-lived so the fix is
  // noticed quickly and auth errors never become a long-lived "success".
  cacheSet(key, out, olaUnhealthy(ola) ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS);
  return out;
}

/**
 * Forward geocode an address/place name to its best-match coordinates.
 * @returns {Promise<{found:boolean, provider?:string, lat?:number, lng?:number, label?:string, providerUnavailable?:boolean}>}
 */
async function geocodeAddress(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return { found: false };

  const key = `geocode:${trimmed.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const ola = await olaGeocodeAddress(trimmed);
  let out;
  if (ola.ok && ola.lat !== undefined) {
    out = { found: true, provider: 'ola-maps', lat: ola.lat, lng: ola.lng, label: ola.label, components: ola.components || {} };
  } else {
    const nomi = await nominatimGeocodeAddress(trimmed);
    out = nomi.ok && nomi.lat !== undefined
      ? { found: true, provider: 'nominatim', lat: nomi.lat, lng: nomi.lng, label: nomi.label, providerUnavailable: olaUnhealthy(ola) }
      : { found: false, providerUnavailable: olaUnhealthy(ola) };
  }

  cacheSet(key, out, olaUnhealthy(ola) ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS);
  return out;
}

/**
 * Reverse geocode coordinates into a display address. Never cached.
 * @returns {Promise<{found:boolean, provider?:string, displayName:string, providerUnavailable?:boolean}>}
 */
async function reverseGeocode(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return { found: false, displayName: '' };

  const ola = await olaReverseGeocode(la, ln);
  if (ola.ok && ola.displayName) {
    return { found: true, provider: 'ola-maps', displayName: ola.displayName, components: ola.components || {} };
  }
  const nomi = await nominatimReverseGeocode(la, ln);
  if (nomi.ok && nomi.displayName) {
    return { found: true, provider: 'nominatim', displayName: nomi.displayName, providerUnavailable: olaUnhealthy(ola), components: nomi.components || {} };
  }
  return { found: false, displayName: '', providerUnavailable: olaUnhealthy(ola) };
}

module.exports = {
  searchPlaces,
  geocodeAddress,
  reverseGeocode,
  getProviderHealth,
  // Test-only hooks (used by tests/location-provider.test.js). They expose
  // no credentials: cache inspection returns values the same call would
  // return anyway, and the auth reset drops in-memory token state only.
  __testing: {
    clearCache: () => _cache.clear(),
    cachePeek: (key) => {
      const hit = _cache.get(key);
      return hit ? { value: hit.value, ageMs: Date.now() - hit.at, ttlMs: hit.ttl || CACHE_TTL_MS } : undefined;
    },
    resetAuth: () => { olaAuth.reset(); },
    resetHealth: () => {
      _health.authMode = null;
      _health.oauth = 'unknown';
      _health.tokenAcquiredAt = null;
      _health.tokenExpiresAt = null;
      _health.lastOlaSuccessAt = null;
      _health.lastOlaFailureAt = null;
      _health.lastOlaFailure = null;
      _health.consecutiveOlaFailures = 0;
    },
    redact: (s) => redactLog(s),
    withIndia,
    pickGeocodeRow,
    pickReverseRow,
  },
};
