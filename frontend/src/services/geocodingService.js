/**
 * Geocoding Service — provider-agnostic public API.
 *
 * Nominatim (OpenStreetMap) is the only provider today, but every caller
 * only ever touches `geocodeLocation` / `reverseGeocodeLocation` and their
 * plain { found, lat, lng, displayName, boundingBox } result shape.
 * Everything below the "NOMINATIM PROVIDER" line is provider-specific;
 * swapping to a different geocoding vendor later means rewriting only
 * that section — no caller anywhere in the app needs to change.
 */
import { thirdParty, company } from '../config';

/* ─────────────────────────────────────────────────────────
   NOMINATIM PROVIDER
   https://operations.osmfoundation.org/policies/nominatim/
──────────────────────────────────────────────────────────── */

const NOMINATIM_BASE = thirdParty.nominatimApiUrl;

// Nominatim's usage policy requires every request to identify the calling
// application via a valid User-Agent (or Referer). Browser `fetch()` cannot
// set a custom User-Agent — it's a forbidden header the browser itself
// strips for security — so the browser's own UA and the page's Referer are
// sent automatically instead. As Nominatim's own docs note this fallback,
// we identify via the `email` query param on every request so their ops
// team can reach us if this integration ever needs attention.
const CONTACT_EMAIL = company.email;

const REQUEST_HEADERS = { Accept: 'application/json', 'Accept-Language': 'en' };

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

function mapNominatimRow(row) {
  const bb = Array.isArray(row.boundingbox) ? row.boundingbox.map(Number) : null;
  return {
    found: true,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lon),
    displayName: row.display_name || '',
    boundingBox: bb && bb.length === 4 ? { south: bb[0], north: bb[1], west: bb[2], east: bb[3] } : null,
  };
}

async function nominatimSearch(query, { signal } = {}) {
  const cached = cacheGet(query);
  if (cached) return cached;

  const url = `${NOMINATIM_BASE}/search?` + new URLSearchParams({
    q: query, format: 'json', addressdetails: '1', limit: '1',
    countrycodes: 'in', email: CONTACT_EMAIL,
  });

  try {
    const res  = await fetch(url, { headers: REQUEST_HEADERS, signal });
    const data = await res.json();
    const result = data.length > 0 ? mapNominatimRow(data[0]) : { found: false };
    cacheSet(query, result);
    return result;
  } catch (err) {
    if (err.name === 'AbortError') return { found: false, aborted: true };
    return { found: false }; // network/parse failure — never thrown to the caller
  }
}

// Structured postal-code search — the Nominatim-recommended way to search by
// PIN code, and materially more reliable than embedding the PIN as trailing
// free text in a `q=` query (which its free-text parser frequently fails to
// resolve for compound/uncommon Indian addresses).
async function nominatimSearchByPincode(pincode, { signal } = {}) {
  const key = `pin:${pincode}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const url = `${NOMINATIM_BASE}/search?` + new URLSearchParams({
    postalcode: pincode, country: 'India', format: 'json', addressdetails: '1', limit: '1', email: CONTACT_EMAIL,
  });

  try {
    const res  = await fetch(url, { headers: REQUEST_HEADERS, signal });
    const data = await res.json();
    const result = data.length > 0 ? mapNominatimRow(data[0]) : { found: false };
    cacheSet(key, result);
    return result;
  } catch (err) {
    if (err.name === 'AbortError') return { found: false, aborted: true };
    return { found: false };
  }
}

async function nominatimReverse(lat, lng, { signal } = {}) {
  const url = `${NOMINATIM_BASE}/reverse?` + new URLSearchParams({
    format: 'json', lat: String(lat), lon: String(lng), email: CONTACT_EMAIL,
  });
  try {
    const res  = await fetch(url, { headers: REQUEST_HEADERS, signal });
    const data = await res.json();
    return { displayName: data.display_name || '' };
  } catch {
    return { displayName: '' };
  }
}

/* ─────────────────────────────────────────────────────────
   PUBLIC API — provider-agnostic, this is what every caller uses
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

/**
 * Geocode a location from whatever fields are available, trying the most
 * accurate combination first (see buildQueryTiers) and falling back to a
 * structured PIN-code lookup last. Never throws — always resolves to
 * { found: false } (or { found: false, aborted: true } if cancelled via
 * `signal`) so callers can show a friendly message instead of crashing.
 *
 * @param {{address?, city?, state?, pincode?, name?}} input
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{found:true, lat:number, lng:number, displayName:string, boundingBox:object|null} | {found:false, aborted?:true}>}
 */
export async function geocodeLocation(input, opts = {}) {
  const tried = new Set();
  for (const q of buildQueryTiers(input)) {
    if (!q || tried.has(q)) continue;
    tried.add(q);
    const result = await nominatimSearch(q, opts);
    if (result.aborted) return result;
    if (result.found) return result;
  }

  if (input.pincode) {
    const result = await nominatimSearchByPincode(input.pincode, opts);
    if (result.found || result.aborted) return result;
  }

  return { found: false };
}

/** Reverse-geocode a lat/lng into a human-readable address (marker drag/click). */
export async function reverseGeocodeLocation(lat, lng, opts = {}) {
  return nominatimReverse(lat, lng, opts);
}
