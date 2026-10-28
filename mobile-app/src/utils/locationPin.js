import { isEmbeddedMapAvailable, sanitizeCoords } from './mapConfig';

/**
 * Location "pin" rules shared by every address form (User profile, booking/checkout, address book, Pandit address).
 *
 * A pin is a latitude/longitude PAIR that was attached to an address by an explicit user action
 * (search suggestion, GPS, map confirm) or loaded from a saved address. It is only trustworthy while the address
 * it was attached to is unchanged:
 *   - a manual edit of an address field makes it STALE → it must not be saved or submitted;
 *   - choosing a new place / GPS fix attaches a NEW pin and clears the stale state;
 *   - programmatic fills (search components, pincode lookup, loading a saved address) never make a pin stale.
 * A pair is always sent whole: both numbers, or both null — never half.
 */

/** The address fields that identify the place a pin belongs to (the same set on every mobile form). */
export const ADDRESS_IDENTITY_FIELDS = ['address', 'pincode', 'city', 'state', 'district'];

/** Fields an autocomplete result's `components` may fill (only those that exist on the mobile forms). */
export const COMPONENT_FIELDS = ['pincode', 'city', 'state', 'district'];

export const PIN_SOURCES = { saved: 'Saved', search: 'Search', gps: 'GPS', map: 'Map' };

/** { latitude, longitude, source, stale } or null. Invalid / placeholder coordinates never become a pin. */
export function makePin(coords, source = 'saved') {
  const valid = sanitizeCoords(coords);
  return valid ? { coords: valid, source: PIN_SOURCES[source] ? source : 'saved', stale: false } : null;
}

/** Coordinates of an autocomplete selection `{ lat, lng }` in the `{ latitude, longitude }` form. */
export function coordsFromSelection(selection) {
  return sanitizeCoords({ latitude: selection?.lat, longitude: selection?.lng });
}

/** Both-or-neither coordinates for an API body. A stale, missing or invalid pin yields `{ null, null }`. */
export function pinCoordsForSave(pin) {
  if (!pin || pin.stale) return { latitude: null, longitude: null };
  const valid = sanitizeCoords(pin.coords);
  return valid ? { latitude: valid.latitude, longitude: valid.longitude } : { latitude: null, longitude: null };
}

/** Same rule for an object that carries `latitude` / `longitude` fields (booking details, saved-address forms). */
export function pairForSave(obj) {
  const valid = sanitizeCoords({ latitude: obj?.latitude, longitude: obj?.longitude });
  return valid ? { latitude: valid.latitude, longitude: valid.longitude } : { latitude: null, longitude: null };
}

export const hasPair = (obj) => !!sanitizeCoords({ latitude: obj?.latitude, longitude: obj?.longitude });

/**
 * Address fields that an autocomplete selection provides. Only non-empty strings for the supported fields; a
 * pincode must be 6 digits. Missing or empty `components` (Nominatim fallback) simply yield `{}`; nothing is invented.
 * The address text itself is only filled when the form's address is empty (a typed address is never overwritten).
 */
export function fieldsFromSelection(selection, currentAddress = '') {
  const out = {};
  const components = selection?.components && typeof selection.components === 'object' ? selection.components : {};
  COMPONENT_FIELDS.forEach((key) => {
    const raw = components[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) return;
    if (key === 'pincode' && !/^\d{6}$/.test(value)) return;
    out[key] = value;
  });
  const label = typeof selection?.label === 'string' ? selection.label.trim() : '';
  if (label && !String(currentAddress || '').trim()) out.address = label;
  return out;
}

/** True when a patch changes at least one address-identity field of `current`. */
export function changesAddress(current = {}, patch = {}) {
  return ADDRESS_IDENTITY_FIELDS.some((k) => k in patch && String(patch[k] ?? '') !== String(current[k] ?? ''));
}

const PIN_SOURCE_KEYS = { saved: 'location.pinSaved', search: 'location.pinSearch', map: 'location.pinMap' };

/**
 * Button/summary text: the coordinates and where they came from, or the call to action when there is no pin.
 * Pass the translator `t` to get the label in the UI language; without it the English text is returned (unchanged
 * behaviour for callers that have not been localized yet). The numbers are never altered, only the words around them.
 */
export function formatPinLabel(coords, source, t) {
  const valid = sanitizeCoords(coords);
  if (valid) {
    const origin = t
      ? (source === 'gps' ? 'GPS' : (PIN_SOURCE_KEYS[source] ? t(PIN_SOURCE_KEYS[source]) : undefined)) // "GPS" is an acronym, kept as is
      : PIN_SOURCES[source];
    return `📍 ${valid.latitude.toFixed(5)}, ${valid.longitude.toFixed(5)}${origin ? ` · ${origin}` : ''}`;
  }
  if (t) return isEmbeddedMapAvailable() ? t('location.pinPick') : t('location.pinUseCurrent');
  return isEmbeddedMapAvailable() ? 'Pick on Map' : 'Use Current Location';
}

export const STALE_PIN_NOTICE = 'Address changed — pick the location again (search or current location) so the saved position matches.';
