/**
 * Location controller — thin HTTP surface over locationService.
 *
 * All three endpoints are authenticated (every current consumer — the temple
 * admin form and the pandit profile map — sits behind login) so the Ola Maps
 * credential is never usable anonymously. Input is strictly validated before
 * any provider call: query length caps bound provider cost, coordinate range
 * checks reject garbage early.
 */

const locationService = require('../services/locationService');

const MAX_QUERY_LENGTH = 200;
const MIN_AUTOCOMPLETE_LENGTH = 2;

// GET /api/location/autocomplete?q=...
exports.autocomplete = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < MIN_AUTOCOMPLETE_LENGTH) {
    return res.json({ success: true, found: false, results: [] });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ success: false, message: 'Query too long' });
  }

  try {
    const result = await locationService.searchPlaces(q);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Location] autocomplete error:', err.message);
    // Provider failures never crash the admin form — an empty result set with
    // a soft error flag lets the UI show its normal "no matches" state.
    return res.json({ success: false, message: 'Location search unavailable', found: false, results: [] });
  }
};

// GET /api/location/geocode?q=...
exports.geocode = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ success: false, message: 'Query required' });
  if (q.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ success: false, message: 'Query too long' });
  }

  try {
    const result = await locationService.geocodeAddress(q);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Location] geocode error:', err.message);
    return res.json({ success: false, message: 'Geocoding unavailable', found: false });
  }
};

// GET /api/location/reverse-geocode?lat=..&lng=..
exports.reverseGeocode = async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ success: false, message: 'Valid numeric lat/lng required' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'Coordinates out of range' });
  }

  try {
    // Round to 6dp (~11cm precision) purely to improve cache/param hygiene.
    const result = await locationService.reverseGeocode(
      Number(lat.toFixed(6)),
      Number(lng.toFixed(6))
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Location] reverse geocode error:', err.message);
    return res.json({ success: false, message: 'Reverse geocoding unavailable', found: false, displayName: '' });
  }
};
