import api from '../../api/axios';
import { autocompletePlaces, reverseGeocodeLocation, clearGeocodingCache } from '../geocodingService';
import * as service from '../geocodingService';

jest.mock('../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const suggestion = (over = {}) => ({
  label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:abc123',
  components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', locality: 'Fort' }, ...over,
});
const body = (results, over = {}) => ({ data: { success: true, found: results.length > 0, provider: 'ola-maps', results, ...over } });

beforeEach(() => {
  api.get.mockReset();
  clearGeocodingCache();
});

describe('autocompletePlaces — request', () => {
  it('is GET /location/autocomplete with the trimmed text as `q` (path relative to the client baseURL, no /api prefix)', async () => {
    api.get.mockResolvedValue(body([suggestion()]));
    await autocompletePlaces('  Fort Mumbai  ');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/location/autocomplete', { params: { q: 'Fort Mumbai' } });
  });

  it.each(['', '  ', 'ab', ' a ', null, undefined])('makes no request for %p (shorter than 3 characters)', async (text) => {
    expect(await autocompletePlaces(text)).toEqual({ found: false });
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('autocompletePlaces — result normalisation', () => {
  it('keeps label, lat, lng, placeId and components', async () => {
    api.get.mockResolvedValue(body([suggestion()]));
    expect(await autocompletePlaces('Fort')).toEqual({
      found: true,
      results: [{
        label: 'Fort, Mumbai, Maharashtra, India', lat: 18.9322, lng: 72.8347, placeId: 'ola:abc123',
        components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', locality: 'Fort' },
      }],
    });
  });

  it('Nominatim fallback results (no components, numeric-string coordinates) are accepted', async () => {
    api.get.mockResolvedValue(body([{ label: 'Pune, Maharashtra, India', lat: '18.5204', lng: '73.8567', placeId: '' }], { provider: 'nominatim', providerUnavailable: true }));
    const res = await autocompletePlaces('Pune');
    expect(res).toEqual({ found: true, results: [{ label: 'Pune, Maharashtra, India', lat: 18.5204, lng: 73.8567, placeId: '', components: {} }] });
  });

  it('missing, null or empty components become {}; unknown component keys and blank values are dropped', async () => {
    api.get.mockResolvedValue(body([
      suggestion({ label: 'A place', lat: 10, lng: 20, components: undefined }),
      suggestion({ label: 'B place', lat: 11, lng: 21, components: null }),
      suggestion({ label: 'C place', lat: 12, lng: 22, components: { city: ' Pune ', state: '', secret: 'x', pincode: 5 } }),
    ]));
    const { results } = await autocompletePlaces('place');
    expect(results.map((r) => r.components)).toEqual([{}, {}, { city: 'Pune' }]);
  });

  it('suggestions without a valid label or coordinates are discarded; valid siblings survive', async () => {
    api.get.mockResolvedValue(body([
      suggestion({ label: 'No lat', lat: undefined }), suggestion({ label: 'Text coords', lat: 'x', lng: 'y' }),
      suggestion({ label: 'Out of range', lat: 123, lng: 400 }), suggestion({ label: 'Null island', lat: 0, lng: 0 }),
      suggestion({ label: '   ' }), null, 'junk', suggestion({ label: 'Good one', lat: 12.9716, lng: 77.5946 }),
    ]));
    const res = await autocompletePlaces('anything');
    expect(res.results.map((r) => r.label)).toEqual(['Good one']);
  });

  it('when every suggestion is unusable the answer is "no match", not an error', async () => {
    api.get.mockResolvedValue(body([suggestion({ lat: 999 })]));
    expect(await autocompletePlaces('nothing usable')).toEqual({ found: false });
  });

  it('never returns fields the server did not provide in a known shape (no raw payload passthrough)', async () => {
    api.get.mockResolvedValue(body([{ ...suggestion(), provider_raw: { token: 'secret' }, extra: 1 }]));
    const [r] = (await autocompletePlaces('Fort')).results;
    expect(Object.keys(r).sort()).toEqual(['components', 'label', 'lat', 'lng', 'placeId']);
  });
});

describe('autocompletePlaces — no match vs unavailable vs session expiry', () => {
  it('a working search with no results is { found: false } and is not flagged unavailable', async () => {
    api.get.mockResolvedValue({ data: { success: true, found: false, provider: 'ola-maps', results: [] } });
    expect(await autocompletePlaces('zzzzzz')).toEqual({ found: false });
  });

  it('the backend\'s HTTP 200 + success:false (both providers failed) is "unavailable"', async () => {
    api.get.mockResolvedValue({ data: { success: false, message: 'Location search unavailable', found: false, results: [] } });
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false, unavailable: true });
  });

  it('found:false with providerUnavailable is "unavailable" (the fallback also found nothing)', async () => {
    api.get.mockResolvedValue({ data: { success: true, found: false, results: [], providerUnavailable: true } });
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false, unavailable: true });
  });

  it.each([[500], [502], [503], [429]])('HTTP %i is "unavailable"', async (status) => {
    api.get.mockRejectedValue(httpError(status));
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false, unavailable: true });
  });

  it('a network failure / timeout (no response) is "unavailable"', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false, unavailable: true });
  });

  it('HTTP 401 is reported as sessionExpired — never as an empty result or an outage', async () => {
    api.get.mockRejectedValue(httpError(401));
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false, sessionExpired: true });
  });

  it('other client errors (e.g. 400 query too long) are a plain no-match, not an outage', async () => {
    api.get.mockRejectedValue(httpError(400));
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false });
  });

  it('never exposes raw error text, status codes or payloads to the caller', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('boom: Bearer abc.def'), { response: { status: 500, data: { stack: 'trace', token: 'x' } } }));
    const res = await autocompletePlaces('Mumbai');
    expect(JSON.stringify(res)).not.toMatch(/boom|Bearer|trace|token|500/);
  });
});

describe('autocompletePlaces — cache', () => {
  it('serves a repeated query (any case / spacing) from memory', async () => {
    api.get.mockResolvedValue(body([suggestion()]));
    const first = await autocompletePlaces('Fort Mumbai');
    const second = await autocompletePlaces('  fort mumbai ');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('never caches an outage or an empty answer: the next call asks the server again', async () => {
    api.get.mockRejectedValueOnce(httpError(503));
    expect(await autocompletePlaces('Mumbai')).toMatchObject({ unavailable: true });
    api.get.mockResolvedValueOnce({ data: { success: true, found: false, results: [] } });
    expect(await autocompletePlaces('Mumbai')).toEqual({ found: false });
    api.get.mockResolvedValueOnce(body([suggestion()]));
    expect((await autocompletePlaces('Mumbai')).found).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('clearGeocodingCache (run at logout) drops it', async () => {
    api.get.mockResolvedValue(body([suggestion()]));
    await autocompletePlaces('Fort Mumbai');
    clearGeocodingCache();
    await autocompletePlaces('Fort Mumbai');
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe('reverseGeocodeLocation', () => {
  it('is GET /location/reverse-geocode with numeric lat and lng', async () => {
    api.get.mockResolvedValue({ data: { success: true, found: true, provider: 'ola-maps', displayName: 'Fort, Mumbai', components: { city: 'Mumbai', pincode: '400001' } } });
    const res = await reverseGeocodeLocation('18.9322', 72.8347);
    expect(api.get).toHaveBeenCalledWith('/location/reverse-geocode', { params: { lat: 18.9322, lng: 72.8347 } });
    expect(res).toEqual({ displayName: 'Fort, Mumbai', components: { city: 'Mumbai', pincode: '400001' } });
  });

  it('a lookup that finds nothing, fails, or returns a non-string label yields an empty label (never throws)', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, found: false, displayName: '' } });
    expect(await reverseGeocodeLocation(18.9, 72.8)).toEqual({ displayName: '', components: {} });
    api.get.mockRejectedValueOnce(httpError(500));
    expect(await reverseGeocodeLocation(18.9, 72.8)).toEqual({ displayName: '', components: {} });
    api.get.mockResolvedValueOnce({ data: { displayName: { evil: true } } });
    expect(await reverseGeocodeLocation(18.9, 72.8)).toEqual({ displayName: '', components: {} });
  });

  it.each([[NaN, 72], [0, 0], [95, 10], [undefined, undefined], ['a', 'b']])('invalid point (%p, %p) makes no request', async (lat, lng) => {
    expect(await reverseGeocodeLocation(lat, lng)).toEqual({ displayName: '', components: {} });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('is not cached (coordinates vary continuously)', async () => {
    api.get.mockResolvedValue({ data: { displayName: 'X', components: {} } });
    await reverseGeocodeLocation(18.9, 72.8);
    await reverseGeocodeLocation(18.9, 72.8);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe('public surface', () => {
  it('the unused forward-geocode cascade was removed; the backend /location/geocode endpoint is simply not called by the app', () => {
    expect(Object.keys(service).sort()).toEqual(['autocompletePlaces', 'clearGeocodingCache', 'reverseGeocodeLocation']);
  });
});
