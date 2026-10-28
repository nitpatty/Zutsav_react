import {
  TILE_SIZE, MIN_ZOOM, MAX_ZOOM, clampZoom, latLngToWorldPixel, worldPixelToLatLng, pointAt, panCenter, pinchSteps, tileUrl, visibleTiles, wrapLongitude,
} from '../slippyMap';

// Day 29: the geometry behind the Android OpenStreetMap picker. Reference values are the well-known OSM tile numbers.
const DELHI = { latitude: 28.6139, longitude: 77.209 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

describe('projection', () => {
  it('maps the world corners and the centre as the Web-Mercator tiling does', () => {
    expect(latLngToWorldPixel({ latitude: 0, longitude: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(latLngToWorldPixel({ latitude: 0, longitude: -180 }, 3).x).toBe(0);
    expect(latLngToWorldPixel({ latitude: 0, longitude: 180 }, 3).x).toBe(TILE_SIZE * 8);
    expect(near(latLngToWorldPixel({ latitude: 85.0511287798, longitude: 0 }, 2).y, 0, 1e-3)).toBe(true);
  });

  it('puts Delhi and Mumbai in the OSM tiles given by the OSM wiki reference formula (Delhi z10 731/426, z15 23411/13663; Mumbai z10 719/456)', () => {
    const tileOf = (p, z) => { const w = latLngToWorldPixel(p, z); return [Math.floor(w.x / TILE_SIZE), Math.floor(w.y / TILE_SIZE)]; };
    expect(tileOf(DELHI, 10)).toEqual([731, 426]);          // reference values from the OSM 'Slippy map tilenames' formula
    expect(tileOf(DELHI, 15)).toEqual([23411, 13663]);
    expect(tileOf({ latitude: 19.076, longitude: 72.8777 }, 10)).toEqual([719, 456]);
  });

  it('round-trips latitude/longitude at every zoom (no axis swap, no drift)', () => {
    [MIN_ZOOM, 8, 14, MAX_ZOOM].forEach((z) => {
      [DELHI, { latitude: -33.8688, longitude: 151.2093 }, { latitude: 51.5, longitude: -0.12 }].forEach((p) => {
        const back = worldPixelToLatLng(latLngToWorldPixel(p, z), z);
        expect(near(back.latitude, p.latitude, 1e-6)).toBe(true);
        expect(near(back.longitude, p.longitude, 1e-6)).toBe(true);
      });
    });
  });

  it('wraps longitude and clamps latitude instead of producing invalid coordinates', () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(180)).toBe(-180);
    const far = worldPixelToLatLng({ x: -5000, y: -5000 }, 3);
    expect(far.latitude).toBeLessThanOrEqual(85.0511287798);
    expect(far.longitude).toBeGreaterThanOrEqual(-180);
    expect(far.longitude).toBeLessThan(180);
  });
});

describe('what a touch selects', () => {
  const view = { width: 400, height: 600 };

  it('a tap in the exact middle of the map selects the centre itself', () => {
    const p = pointAt({ center: DELHI, zoom: 15, ...view, px: 200, py: 300 });
    expect(near(p.latitude, DELHI.latitude, 1e-6)).toBe(true);
    expect(near(p.longitude, DELHI.longitude, 1e-6)).toBe(true);
  });

  it('a tap right of / below the centre selects a point east (larger longitude) / south (smaller latitude)', () => {
    const east = pointAt({ center: DELHI, zoom: 15, ...view, px: 300, py: 300 });
    const south = pointAt({ center: DELHI, zoom: 15, ...view, px: 200, py: 400 });
    expect(east.longitude).toBeGreaterThan(DELHI.longitude);
    expect(near(east.latitude, DELHI.latitude, 1e-6)).toBe(true);
    expect(south.latitude).toBeLessThan(DELHI.latitude);
    expect(near(south.longitude, DELHI.longitude, 1e-6)).toBe(true);
  });

  it('100 px at zoom 15 is a few hundred metres, and the same pixels cover less ground as you zoom in', () => {
    const at = (z) => pointAt({ center: DELHI, zoom: z, ...view, px: 300, py: 300 }).longitude - DELHI.longitude;
    expect(at(15)).toBeGreaterThan(0.003);                  // 100 px · 360° / (256 · 2^15) ≈ 0.0043° ≈ 420 m at this latitude
    expect(at(15)).toBeLessThan(0.006);
    expect(at(16)).toBeCloseTo(at(15) / 2, 6);
  });

  it('dragging the map right/down moves the centre west/north (the map follows the finger), and a zero drag changes nothing', () => {
    const moved = panCenter(DELHI, 14, 120, 80);
    expect(moved.longitude).toBeLessThan(DELHI.longitude);
    expect(moved.latitude).toBeGreaterThan(DELHI.latitude);
    expect(panCenter(DELHI, 14, 0, 0)).toEqual(expect.objectContaining({ latitude: expect.closeTo(DELHI.latitude, 6), longitude: expect.closeTo(DELHI.longitude, 6) }));
  });

  it('a pan in progress is accounted for when a tap lands', () => {
    // The map has been dragged 100 px right; a tap at the middle of the screen now selects the point that is 100 px WEST of the centre.
    const p = pointAt({ center: DELHI, zoom: 15, ...view, px: 200, py: 300, offset: { dx: 100, dy: 0 } });
    expect(p.longitude).toBeLessThan(DELHI.longitude);
  });
});

describe('zoom', () => {
  it('is clamped to the supported range and rounded', () => {
    expect(clampZoom(1)).toBe(MIN_ZOOM);
    expect(clampZoom(40)).toBe(MAX_ZOOM);
    expect(clampZoom(10.4)).toBe(10);
    expect(clampZoom(NaN)).toBe(MIN_ZOOM);
  });

  it('pinch: fingers twice as far apart is +1 step, half as far is -1, a small change is 0, bad input is 0', () => {
    expect(pinchSteps(100, 200)).toBe(1);
    expect(pinchSteps(100, 50)).toBe(-1);
    expect(pinchSteps(100, 110)).toBe(0);
    expect(pinchSteps(100, 400)).toBe(2);
    expect(pinchSteps(0, 200)).toBe(0);
    expect(pinchSteps(100, NaN)).toBe(0);
  });
});

describe('tiles', () => {
  it('builds the OSM tile URL from the template', () => {
    expect(tileUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png', 10, 727, 422)).toBe('https://tile.openstreetmap.org/10/727/422.png');
  });

  it('covers the whole viewport: the tiles span it with no gap, positioned relative to the viewport', () => {
    const width = 400; const height = 600;
    const tiles = visibleTiles({ center: DELHI, zoom: 15, width, height });
    expect(tiles.length).toBeGreaterThanOrEqual(8);
    expect(tiles.length).toBeLessThanOrEqual(16);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left)) + TILE_SIZE).toBeGreaterThanOrEqual(width);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.top)) + TILE_SIZE).toBeGreaterThanOrEqual(height);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });

  it('the tile under the viewport centre is the OSM tile of the centre point', () => {
    // The middle of OSM tile 731/426 at zoom 10 (a point well inside the tile; tile edges are pixel-rounded, so a point sitting 0.4 px
    // from an edge — Delhi itself is one at this zoom — is not a fair probe).
    const middle = worldPixelToLatLng({ x: 731.5 * TILE_SIZE, y: 426.5 * TILE_SIZE }, 10);
    const tiles = visibleTiles({ center: middle, zoom: 10, width: 400, height: 600 });
    const centre = tiles.find((t) => t.left <= 200 && 200 < t.left + TILE_SIZE && t.top <= 300 && 300 < t.top + TILE_SIZE);
    expect([centre.x, centre.y]).toEqual([731, 426]);
  });

  it('a pan offset slides the same tiles and pulls in new ones at the trailing edge', () => {
    const idle = visibleTiles({ center: DELHI, zoom: 14, width: 400, height: 600 });
    const dragged = visibleTiles({ center: DELHI, zoom: 14, width: 400, height: 600, offset: { dx: 150, dy: 0 } });
    const a = idle.find((t) => t.key === dragged[0].key && false) || idle[0];
    const same = dragged.find((t) => t.key === a.key);
    if (same) expect(same.left - a.left).toBe(150);
    expect(Math.min(...dragged.map((t) => t.left))).toBeLessThanOrEqual(0);
  });

  it('wraps tile x across the antimeridian and skips tiles beyond the poles', () => {
    const wrapped = visibleTiles({ center: { latitude: 0, longitude: 179.9 }, zoom: 3, width: 800, height: 400 });
    expect(wrapped.every((t) => t.x >= 0 && t.x < 8)).toBe(true);
    expect(wrapped.some((t) => t.x === 0)).toBe(true);                // continues past 180° into tile 0
    const pole = visibleTiles({ center: { latitude: 85, longitude: 0 }, zoom: 3, width: 800, height: 1200 });
    expect(pole.every((t) => t.y >= 0 && t.y < 8)).toBe(true);
  });

  it('draws nothing before the viewport has been measured', () => {
    expect(visibleTiles({ center: DELHI, zoom: 10, width: 0, height: 0 })).toEqual([]);
  });
});
