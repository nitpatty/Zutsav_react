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
 *   1. Ola Maps  (primary — Indian-location quality, verified via POC)
 *   2. Nominatim (fallback — kept during migration so an Ola outage or a
 *      missing key degrades gracefully instead of breaking the admin form;
 *      removal is a post-verification decision)
 *
 * Credential handling: the Ola key lives server-side only. It is read from
 * the System Configuration Center (`olaMapsApiKey`) with an env fallback
 * (`OLA_MAPS_API_KEY`), mirroring how PhonePe/WhatsApp keys are resolved.
 * It is NEVER returned by any endpoint and never logged.
 */

const axios = require('axios');
const settings = require('../utils/settingsService');
const { readEnv } = require('../config/env');
const { olamaps } = require('../config/integrations.config');

const ENV_API_KEY = readEnv('OLA_MAPS_API_KEY') || '';
const REQUEST_TIMEOUT_MS = 8000;

/* ── Small TTL cache for identical text queries ─────────────────────────── */
/* Place data for a given query string doesn't change within minutes, and
   admins commonly re-run the same search while editing. A tiny process-local
   cache absorbs those repeats without introducing Redis. Never caches
   reverse-geocode results (cheap, coordinates vary continuously). */

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const _cache = new Map(); // key → { value, at }

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) { _cache.delete(key); return undefined; }
  return hit.value;
}

function cacheSet(key, value) {
  if (_cache.size >= CACHE_MAX_ENTRIES) {
    _cache.delete(_cache.keys().next().value);
  }
  _cache.set(key, { value, at: Date.now() });
}

async function getApiKey() {
  try {
    return await settings.get('olaMapsApiKey', ENV_API_KEY || null);
  } catch {
    return ENV_API_KEY || null;
  }
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

/* ── Ola Maps provider ──────────────────────────────────────────────────── */

async function olaRequest(path, params) {
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, skipReason: 'no-key' };

  try {
    const { data } = await axios.get(`${olamaps.baseUrl}${path}`, {
      params: { ...params, api_key: apiKey },
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });

    const status = String(data?.status || '').toUpperCase();
    if (status && !['OK', 'ZERO_RESULTS'].includes(status)) {
      // e.g. INVALID_REQUEST / ACCESS_DENIED — treat as provider failure but
      // log without any credential material.
      console.warn(`[Location] Ola Maps ${path} responded status=${status}`);
      return { ok: false, skipReason: `provider-status-${status.toLowerCase()}` };
    }
    return { ok: true, data };
  } catch (err) {
    const code = err.response?.status;
    console.warn(
      `[Location] Ola Maps ${path} failed${code ? ` (HTTP ${code})` : ''}: ${err.message}`
    );
    return { ok: false, skipReason: code === 429 ? 'rate-limited' : 'provider-error' };
  }
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
    results.push({ label, lat: coords.lat, lng: coords.lng, placeId: s.placeId || s.place_id || '' });
    if (results.length >= 8) break; // result limiting — UI shows top matches only
  }
  return { ok: true, results };
}

/** Forward geocoding — explicit address/place-name → coordinates. */
async function olaGeocodeAddress(query) {
  const res = await olaRequest(olamaps.geocodePath, { address: query });
  if (!res.ok) return { ok: false, skipReason: res.skipReason };

  const rows = pickArray(res.data, ['geocodingResults', 'results']);
  for (const row of rows) {
    const coords = extractLatLng(row);
    const label = extractLabel(row);
    if (coords && label) return { ok: true, lat: coords.lat, lng: coords.lng, label };
  }
  return { ok: true, empty: true };
}

/** Reverse geocoding — coordinates → human-readable address. */
async function olaReverseGeocode(lat, lng) {
  const res = await olaRequest(olamaps.reverseGeocodePath, { latlng: `${lat},${lng}` });
  if (!res.ok) return { ok: false, skipReason: res.skipReason };

  const rows = pickArray(res.data, ['results', 'addresses']);
  for (const row of rows) {
    const label = extractLabel(row);
    if (label) return { ok: true, displayName: label };
  }
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
    console.warn(`[Location] Nominatim ${params._path} failed: ${err.message}`);
    return { ok: false };
  }
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
    _path: 'search', q: `${query}, India`, format: 'json', limit: '1', countrycodes: 'in',
  });
  if (!res.ok) return { ok: false };
  const first = (res.data || [])[0];
  if (!first) return { ok: true, empty: true };
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: true, empty: true };
  return { ok: true, lat, lng, label: first.display_name || query };
}

async function nominatimReverseGeocode(lat, lng) {
  const res = await nominatimRequest({
    _path: 'reverse', format: 'json', lat: String(lat), lon: String(lng),
  });
  if (!res.ok) return { ok: false };
  return { ok: true, displayName: res.data?.display_name || '' };
}

/* ── Public API — Ola first, Nominatim fallback on failure/no-key ───────── */

/**
 * Interactive place search (autocomplete).
 * @returns {Promise<{found:boolean, provider?:'ola-maps'|'nominatim', results:Array<{label:string,lat:number,lng:number,placeId:string}>}>}
 */
async function searchPlaces(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return { found: false, results: [] };

  const key = `search:${trimmed.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let out;
  const ola = await olaSearchPlaces(trimmed);
  if (ola.ok && ola.results.length > 0) {
    out = { found: true, provider: 'ola-maps', results: ola.results };
  } else {
    const nomi = await nominatimSearchPlaces(trimmed);
    out = nomi.ok && nomi.results.length > 0
      ? { found: true, provider: 'nominatim', results: nomi.results }
      : { found: false, results: [], providerUnavailable: ola.ok === false && ola.skipReason !== 'no-key' };
  }

  cacheSet(key, out);
  return out;
}

/**
 * Forward geocode an address/place name to its best-match coordinates.
 * @returns {Promise<{found:boolean, provider?:string, lat?:number, lng?:number, label?:string}>}
 */
async function geocodeAddress(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return { found: false };

  const key = `geocode:${trimmed.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let out;
  const ola = await olaGeocodeAddress(trimmed);
  if (ola.ok && ola.lat !== undefined) {
    out = { found: true, provider: 'ola-maps', lat: ola.lat, lng: ola.lng, label: ola.label };
  } else {
    const nomi = await nominatimGeocodeAddress(trimmed);
    out = nomi.ok && nomi.lat !== undefined
      ? { found: true, provider: 'nominatim', lat: nomi.lat, lng: nomi.lng, label: nomi.label }
      : { found: false };
  }

  cacheSet(key, out);
  return out;
}

/**
 * Reverse geocode coordinates into a display address. Never cached.
 * @returns {Promise<{found:boolean, provider?:string, displayName:string}>}
 */
async function reverseGeocode(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return { found: false, displayName: '' };

  const ola = await olaReverseGeocode(la, ln);
  if (ola.ok && ola.displayName) {
    return { found: true, provider: 'ola-maps', displayName: ola.displayName };
  }
  const nomi = await nominatimReverseGeocode(la, ln);
  if (nomi.ok && nomi.displayName) {
    return { found: true, provider: 'nominatim', displayName: nomi.displayName };
  }
  return { found: false, displayName: '' };
}

module.exports = { searchPlaces, geocodeAddress, reverseGeocode };
