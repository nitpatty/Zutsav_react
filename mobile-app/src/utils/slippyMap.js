// Web-Mercator "slippy map" arithmetic for the Android location picker (src/components/shared/OsmTileMap.jsx). Pure functions, no
// React Native imports, so the geometry is unit-tested. This is the same tiling scheme Leaflet uses on the website
// (https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png): at zoom z the world is a 2^z × 2^z grid of 256-px tiles.

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;
const MAX_LATITUDE = 85.0511287798;       // the Web-Mercator limit; beyond it the projection is undefined

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clampZoom = (z) => clamp(Math.round(Number.isFinite(z) ? z : MIN_ZOOM), MIN_ZOOM, MAX_ZOOM);
const worldSize = (zoom) => TILE_SIZE * 2 ** zoom;

/** Wraps a longitude into [-180, 180). */
export const wrapLongitude = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

/** Geographic point → pixel on the whole-world map at `zoom` (origin top-left of the world). */
export function latLngToWorldPixel({ latitude, longitude }, zoom) {
  const size = worldSize(zoom);
  const lat = clamp(latitude, -MAX_LATITUDE, MAX_LATITUDE);
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** Inverse of latLngToWorldPixel. Longitude is wrapped; latitude is clamped to the Mercator limit. */
export function worldPixelToLatLng({ x, y }, zoom) {
  const size = worldSize(zoom);
  const lng = wrapLongitude((x / size) * 360 - 180);
  const n = Math.PI - (2 * Math.PI * clamp(y, 0, size)) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { latitude: clamp(lat, -MAX_LATITUDE, MAX_LATITUDE), longitude: lng };
}

/**
 * The point under a touch at (px, py) inside a viewport whose centre shows `center` — i.e. what a tap on the map selects.
 * `offset` is a pan still in progress ({dx, dy} in screen pixels); 0 when idle.
 */
export function pointAt({ center, zoom, width, height, px, py, offset = { dx: 0, dy: 0 } }) {
  const c = latLngToWorldPixel(center, zoom);
  return worldPixelToLatLng({ x: c.x - offset.dx + (px - width / 2), y: c.y - offset.dy + (py - height / 2) }, zoom);
}

/** The centre after the map has been dragged by (dx, dy) screen pixels (dragging right/down moves the centre left/up). */
export function panCenter(center, zoom, dx, dy) {
  const c = latLngToWorldPixel(center, zoom);
  return worldPixelToLatLng({ x: c.x - dx, y: c.y - dy }, zoom);
}

/** Zoom steps for a pinch whose finger distance went from `start` to `end` (0 for a tiny change). */
export function pinchSteps(start, end) {
  if (!(start > 0) || !(end > 0)) return 0;
  const steps = Math.round(Math.log2(end / start));
  return clamp(steps, -4, 4);
}

export const tileUrl = (template, z, x, y) => template.replace('{z}', z).replace('{x}', x).replace('{y}', y);

/**
 * The tiles needed to fill a `width` × `height` viewport centred on `center`, each with its on-screen position. Tile x wraps around
 * the antimeridian; tiles above/below the world are skipped. `offset` shifts everything by a pan in progress.
 */
export function visibleTiles({ center, zoom, width, height, offset = { dx: 0, dy: 0 } }) {
  if (!(width > 0) || !(height > 0)) return [];
  const n = 2 ** zoom;
  const c = latLngToWorldPixel(center, zoom);
  const originX = c.x - width / 2;                             // world pixel at the viewport's left edge
  const originY = c.y - height / 2;
  const firstX = Math.floor((originX - offset.dx) / TILE_SIZE);
  const lastX = Math.floor((originX - offset.dx + width) / TILE_SIZE);
  const firstY = Math.floor((originY - offset.dy) / TILE_SIZE);
  const lastY = Math.floor((originY - offset.dy + height) / TILE_SIZE);
  const tiles = [];
  for (let ty = firstY; ty <= lastY; ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = firstX; tx <= lastX; tx += 1) {
      const wrappedX = ((tx % n) + n) % n;
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        z: zoom, x: wrappedX, y: ty,
        left: Math.round(tx * TILE_SIZE - originX + offset.dx),
        top: Math.round(ty * TILE_SIZE - originY + offset.dy),
      });
    }
  }
  return tiles;
}
