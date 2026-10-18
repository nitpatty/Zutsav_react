// Coordinate-pair validation for pandit location endpoints.
//
// A stored location is a PAIR: latitude and longitude must be sent together
// and be finite numbers in range, or both null (explicit clear). A request
// that sends only one half of the pair, a non-numeric value, or an
// out-of-range value is rejected with a caller error (HTTP 400) BEFORE it
// reaches the model — never a CastError/500, and never a stale pin left
// silently attached to a newly-saved address.

const ADDRESS_FIELDS = ['pincode', 'state', 'city', 'district', 'address'];

function validateCoordinatePair(body) {
  const latProvided = body.latitude !== undefined;
  const lngProvided = body.longitude !== undefined;

  // Nothing sent — leave stored coordinates untouched.
  if (!latProvided && !lngProvided) return { ok: true, updates: null };

  if (latProvided !== lngProvided) {
    return { ok: false, message: 'latitude and longitude must be sent together' };
  }

  // Explicit clear: both null.
  if (body.latitude === null && body.longitude === null) {
    return { ok: true, updates: { latitude: null, longitude: null } };
  }
  if (body.latitude === null || body.longitude === null) {
    return {
      ok: false,
      message: 'latitude and longitude must either both be numbers or both be null',
    };
  }

  const latType = typeof body.latitude;
  const lngType = typeof body.longitude;
  const numericShape =
    (latType === 'number' || latType === 'string') &&
    (lngType === 'number' || lngType === 'string');
  const lat = numericShape ? Number(body.latitude) : NaN;
  const lng = numericShape ? Number(body.longitude) : NaN;

  if (
    body.latitude === '' || body.longitude === '' ||
    !Number.isFinite(lat) || !Number.isFinite(lng)
  ) {
    return { ok: false, message: 'latitude and longitude must be numeric' };
  }
  if (Math.abs(lat) > 90) {
    return { ok: false, message: 'latitude must be between -90 and 90' };
  }
  if (Math.abs(lng) > 180) {
    return { ok: false, message: 'longitude must be between -180 and 180' };
  }
  return { ok: true, updates: { latitude: lat, longitude: lng } };
}

function addressFieldsChanged(body) {
  return ADDRESS_FIELDS.some((field) => body[field] !== undefined);
}

module.exports = { validateCoordinatePair, addressFieldsChanged, ADDRESS_FIELDS };
