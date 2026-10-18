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
 * Result shapes are identical to the web service so screen logic can match.
 */
import api from '../api/axios';

const cache = new Map();
const CACHE_LIMIT = 200;
function cacheGet(key) { return cache.get(key); }
function cacheSet(key, value) {
  if (!cache.has(key) && cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

export async function autocompletePlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return { found: false };

  const key = `ac:${q.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const { data } = await api.get('/location/autocomplete', { params: { q } });
    if (!data?.found || !Array.isArray(data.results)) return { found: false };
    const result = {
      found: true,
      results: data.results.map((r) => ({
        label: r.label || '',
        lat: Number(r.lat),
        lng: Number(r.lng),
      })).filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng)),
    };
    cacheSet(key, result);
    return result;
  } catch {
    return { found: false }; // network/server failure — never thrown, never cached
  }
}

// Optional `district` (Pandit address form). No `name` tier — a person's name
// is not a location. Duplicate tiers are deduped by the caller.
function buildQueryTiers({ address = '', city = '', state = '', pincode = '', district = '' }) {
  const hasCountry = /india/i.test(address);
  const tier = (parts) => {
    const joined = parts.filter(Boolean).join(', ');
    if (!joined) return '';
    return hasCountry ? joined : `${joined}, India`;
  };
  return [
    tier([address, district, city, state, pincode]),
    tier([address, city, state, pincode]),
    tier([address, city, state]),
    tier([district, city, state]),
    tier([city, state]),
  ].filter(Boolean);
}

async function proxyGeocode(query) {
  const cached = cacheGet(query);
  if (cached) return cached;
  try {
    const { data } = await api.get('/location/geocode', { params: { q: query } });
    const result = data?.found
      ? { found: true, lat: Number(data.lat), lng: Number(data.lng), displayName: data.label || '' }
      : { found: false };
    if (result.found) cacheSet(query, result); // cache successes only
    return result;
  } catch {
    return { found: false };
  }
}

export async function geocodeLocation(input) {
  const tried = new Set();
  for (const q of buildQueryTiers(input)) {
    if (!q || tried.has(q)) continue;
    tried.add(q);
    const result = await proxyGeocode(q);
    if (result.found) return result;
  }
  if (input.pincode) {
    const result = await proxyGeocode(`${input.pincode}, India`);
    if (result.found) return result;
  }
  return { found: false };
}

export async function reverseGeocodeLocation(lat, lng) {
  try {
    const { data } = await api.get('/location/reverse-geocode', { params: { lat, lng } });
    return { displayName: data?.displayName || '' };
  } catch {
    return { displayName: '' };
  }
}
