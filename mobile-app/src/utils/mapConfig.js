import { Platform } from 'react-native';

/**
 * Can the embedded `react-native-maps` view be shown on this platform?
 *  - Android: `react-native-maps` renders with the Google Maps SDK, which needs a Google Maps key in the manifest.
 *    Zutsav has no Google Maps configuration (its map provider is Ola Maps, used server-side for place search and
 *    geocoding only), and mounting the view without a key fails or shows a blank grey map, so it is never mounted there.
 *    The picker uses the keyless OpenStreetMap tile map (components/shared/OsmTileMap.jsx) instead — see the constants below.
 *  - iOS: Apple Maps, no key.
 * A result of `false` therefore means "use the OpenStreetMap tile map", not "no map".
 */
export function isEmbeddedMapAvailable({ os = Platform.OS } = {}) {
  return os !== 'android';
}

/**
 * Validates coordinates before they reach the map. Accepts numbers or numeric strings (the API/forms return both);
 * rejects NaN/Infinity, out-of-range values and the (0,0) "null island" placeholder. Returns { latitude, longitude }
 * as numbers, or null.
 */
export function sanitizeCoords(coords) {
  if (!coords || typeof coords !== 'object') return null;
  const toNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const latitude = toNumber(coords.latitude);
  const longitude = toNumber(coords.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

// ── OpenStreetMap raster tiles for the Android picker (the website's Leaflet picker uses the same provider) ──────────────────
// One place to change the tile source. The public tile server's usage policy (https://operations.osmfoundation.org/policies/tiles/)
// asks apps to identify themselves and not to generate heavy traffic; if Zutsav's volume outgrows it, point this at a commercial or
// self-hosted raster tile server (same {z}/{x}/{y} scheme) — nothing else changes.
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_TILE_USER_AGENT = 'ZutsavApp/1.0 (com.zutsav.app)';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const TILE_MAP_SAVED_ZOOM = 16;      // street level when a location is already known
export const TILE_MAP_DEFAULT_ZOOM = 5;     // whole-country view when none is
