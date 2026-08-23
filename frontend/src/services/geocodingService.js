/**
 * Geocoding Service — provider-agnostic public API.
 *
 * All provider intelligence lives server-side (backend/src/services/
 * locationService.js): requests go through the authenticated
 * /api/location/* proxy endpoints, so no vendor API key ever reaches the
 * browser and provider selection (Ola Maps primary, Nominatim fallback)
 * is a purely server-side concern.
 *
 * Every caller only touches `geocodeLocation`, `autocompletePlaces`,
 * `reverseGeocodeLocation` and their plain result shapes:
 *   { found, lat, lng, displayName }          — geocode
 *   { found, results:[{label,lat,lng}] }      — autocomplete
 *   { displayName }                            — reverse geocode
 */

import API from '../api/axios';

// Session-lifetime result cache, keyed by exact query. Geocoding results
// for a given query don't change within an admin's editing session, so a
// repeated/retried query (e.g. re-focusing the same field) never re-hits
// the network. Capped defensively so a long admin session can't leak memory.
const cache = new Map();
const CACHE_LIMIT = 200;
function cacheGet(key) { return cache.get(key); }
function cacheSet(key, value) {
  if (!cache.has(key) && cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

function isAbort(err) {
  return err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';
}

/* ─────────────────────────────────────────────────────────
   AUTOCOMPLETE — interactive place search (Ola-backed)
──────────────────────────────────────────────────────────── */

/**
 * Live place suggestions while the user types.
 *
 * @param {string} query
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{found:true, results:Array<{label:string,lat:number,lng:number,placeId?:string}>}
 *                    | {found:false, aborted?:true}>}
 */
export async function autocompletePlaces(query, opts = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return { found: false };

  const key = `ac:${q.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const { data } = await API.get('/location/autocomplete', {
      params: { q },
      signal: opts.signal,
    });
    if (!data?.found || !Array.isArray(data.results)) return { found: false };
    const result = {
      found: true,
      results: data.results.map((r) => ({
        label: r.label || '',
        lat: Number(r.lat),
        lng: Number(r.lng),
        placeId: r.placeId || '',
      })).filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng)),
    };
    cacheSet(key, result);
    return result;
  } catch (err) {
    if (isAbort(err)) return { found: false, aborted: true };
    // Network/server failure — surfaced as "no suggestions", never thrown.
    return { found: false };
  }
}

/* ─────────────────────────────────────────────────────────
   FORWARD GEOCODE — address fields → coordinates
──────────────────────────────────────────────────────────── */

/**
 * Ordered, most-accurate-first search tiers — never search on a partial
 * string when more information is available. India is appended to every
 * tier (Zutsav is India-first) unless the address already names a country.
 */
function buildQueryTiers({ address = '', city = '', state = '', pincode = '', name = '' }) {
  const hasCountry = /india/i.test(address);
  const tier = (parts) => {
    const joined = parts.filter(Boolean).join(', ');
    if (!joined) return '';
    return hasCountry ? joined : `${joined}, India`;
  };
  return [
    tier([address, city, state, pincode]), // Full Address + City + State + PIN
    tier([address, city, state]),          // Address + City + State
    tier([name, city, state]),             // Temple Name + City + State (famous temples resolve well by name)
    tier([city, state]),                   // City + State
  ];
}

async function proxyGeocode(query, opts = {}) {
  const cached = cacheGet(query);
  if (cached) return cached;

  try {
    const { data } = await API.get('/location/geocode', {
      params: { q: query },
      signal: opts.signal,
    });
    const result = data?.found
      ? { found: true, lat: Number(data.lat), lng: Number(data.lng), displayName: data.label || '' }
      : { found: false };
    cacheSet(query, result);
    return result;
  } catch (err) {
    if (isAbort(err)) return { found: false, aborted: true };
    return { found: false }; // network/parse failure — never thrown to the caller
  }
}

/**
 * Geocode a location from whatever fields are available, trying the most
 * accurate combination first (see buildQueryTiers). Never throws — always
 * resolves to { found: false } (or { found: false, aborted: true }) so
 * callers can show a friendly message instead of crashing.
 *
 * @param {{address?, city?, state?, pincode?, name?}} input
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{found:true, lat:number, lng:number, displayName:string} | {found:false, aborted?:true}>}
 */
export async function geocodeLocation(input, opts = {}) {
  const tried = new Set();
  for (const q of buildQueryTiers(input)) {
    if (!q || tried.has(q)) continue;
    tried.add(q);
    const result = await proxyGeocode(q, opts);
    if (result.aborted) return result;
    if (result.found) return result;
  }

  // Structured PIN-code lookup last — materially more reliable for compound
  // Indian addresses than embedding the PIN as trailing free text.
  if (input.pincode) {
    const pinQuery = `${input.pincode}, India`;
    const result = await proxyGeocode(pinQuery, opts);
    if (result.aborted) return result;
    if (result.found) return result;
  }

  return { found: false };
}

/* ─────────────────────────────────────────────────────────
   REVERSE GEOCODE — coordinates → human-readable address
──────────────────────────────────────────────────────────── */

/** Reverse-geocode a lat/lng into a human-readable address (marker drag/click). */
export async function reverseGeocodeLocation(lat, lng, opts = {}) {
  try {
    const { data } = await API.get('/location/reverse-geocode', {
      params: { lat, lng },
      signal: opts.signal,
    });
    return { displayName: data?.displayName || '' };
  } catch (err) {
    if (isAbort(err)) return { displayName: '', aborted: true };
    return { displayName: '' };
  }
}
