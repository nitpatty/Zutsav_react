/**
 * Geocoding Service (mobile) — provider-agnostic public API.
 *
 * Mirrors frontend/src/services/geocodingService.js. All provider
 * intelligence lives server-side (backend/src/services/locationService.js):
 * requests go through the authenticated /api/location/* proxy endpoints using
 * the shared `api` axios client (JWT attached by its interceptor), so no
 * vendor key ever reaches the app and provider selection (Ola Maps primary,
 * Nominatim fallback) is a purely server-side concern.
 *
 * Paths are relative to the client's baseURL (which already ends in /api).
 * The forward-geocode endpoint (GET /location/geocode) exists on the backend but is not used by the app, so
 * there is intentionally no client for it here.
 */
import api from '../api/axios';
import { sanitizeCoords } from '../utils/mapConfig';

const cache = new Map();
const CACHE_LIMIT = 200;
function cacheGet(key) { return cache.get(key); }
function cacheSet(key, value) {
  if (!cache.has(key) && cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

// Cached keys are address text the signed-in user typed — dropped on logout.
export function clearGeocodingCache() { cache.clear(); }

const COMPONENT_KEYS = ['pincode', 'city', 'state', 'district', 'locality'];

/** Only the known address parts, as trimmed non-empty strings. Anything else from the server is dropped. */
function normalizeComponents(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  COMPONENT_KEYS.forEach((key) => {
    const value = typeof raw[key] === 'string' ? raw[key].trim() : '';
    if (value) out[key] = value;
  });
  return out;
}

/** One backend suggestion → { label, lat, lng, placeId, components }, or null when it is unusable. */
function normalizeSuggestion(row) {
  const label = typeof row?.label === 'string' ? row.label.trim() : '';
  const coords = sanitizeCoords({ latitude: row?.lat, longitude: row?.lng });
  if (!label || !coords) return null;
  return {
    label,
    lat: coords.latitude,
    lng: coords.longitude,
    placeId: typeof row.placeId === 'string' ? row.placeId : '',
    components: normalizeComponents(row.components),
  };
}

/**
 * Live place suggestions.
 *   { found: true,  results: [{ label, lat, lng, placeId, components }] }
 *   { found: false }                       — the search worked and nothing matched
 *   { found: false, unavailable: true }    — provider/network failure (retryable); never cached
 *   { found: false, sessionExpired: true } — HTTP 401; the shared client's session handling has already run
 * A text shorter than 3 characters makes no request.
 */
export async function autocompletePlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return { found: false };

  const key = `ac:${q.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const { data } = await api.get('/location/autocomplete', { params: { q } });
    const results = Array.isArray(data?.results) ? data.results.map(normalizeSuggestion).filter(Boolean) : [];
    if (data?.found && results.length > 0) {
      const result = { found: true, results };
      cacheSet(key, result);
      return result;
    }
    // The backend answers HTTP 200 + success:false when both providers fail.
    if (data?.success === false || data?.providerUnavailable === true) return { found: false, unavailable: true };
    return { found: false };
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401) return { found: false, sessionExpired: true };
    // Other 4xx (e.g. 400 query too long) are not outages; 429, 5xx, timeouts and offline are.
    if (status && status >= 400 && status < 500 && status !== 429) return { found: false };
    return { found: false, unavailable: true };
  }
}

/**
 * Reverse-geocode a point into a human-readable address (and its address parts when the backend supplies them).
 * Never throws; a failure or invalid point yields an empty label.
 */
export async function reverseGeocodeLocation(lat, lng) {
  const coords = sanitizeCoords({ latitude: lat, longitude: lng });
  if (!coords) return { displayName: '', components: {} };
  try {
    const { data } = await api.get('/location/reverse-geocode', { params: { lat: coords.latitude, lng: coords.longitude } });
    return {
      displayName: typeof data?.displayName === 'string' ? data.displayName : '',
      components: normalizeComponents(data?.components),
    };
  } catch {
    return { displayName: '', components: {} };
  }
}
