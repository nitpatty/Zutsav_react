import {
  ADDRESS_IDENTITY_FIELDS, makePin, coordsFromSelection, pinCoordsForSave, pairForSave, hasPair,
  fieldsFromSelection, changesAddress, formatPinLabel,
} from '../locationPin';
import { isEmbeddedMapAvailable } from '../mapConfig';

jest.mock('../mapConfig', () => ({ ...jest.requireActual('../mapConfig'), isEmbeddedMapAvailable: jest.fn(() => true) }));

const MUMBAI = { latitude: 19.076, longitude: 72.8777 };

describe('address identity', () => {
  it('is the same five fields on every mobile address form', () => {
    expect([...ADDRESS_IDENTITY_FIELDS].sort()).toEqual(['address', 'city', 'district', 'pincode', 'state']);
  });

  it('only a real change to one of those fields counts as an address edit', () => {
    const current = { address: '12 MG Road', pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai', name: 'Asha' };
    expect(changesAddress(current, { address: '12 MG Road, Fort' })).toBe(true);
    expect(changesAddress(current, { pincode: '400002' })).toBe(true);
    expect(changesAddress(current, { city: '' })).toBe(true);
    expect(changesAddress(current, { address: '12 MG Road' })).toBe(false);   // typed the same text
    expect(changesAddress(current, { name: 'Someone Else' })).toBe(false);    // unrelated field
    expect(changesAddress(current, { email: 'a@b.co', label: 'Home' })).toBe(false);
    expect(changesAddress({}, { address: '' })).toBe(false);                  // undefined → '' is not a change
  });
});

describe('makePin / pinCoordsForSave — a pin is a whole, valid, current pair or nothing', () => {
  it('a valid pin is saved as its pair', () => {
    expect(pinCoordsForSave(makePin(MUMBAI, 'search'))).toEqual(MUMBAI);
  });

  it('numeric strings from the API become numbers', () => {
    expect(pinCoordsForSave(makePin({ latitude: '19.076', longitude: '72.8777' }))).toEqual(MUMBAI);
  });

  it('a stale pin is saved as null / null', () => {
    expect(pinCoordsForSave({ ...makePin(MUMBAI, 'gps'), stale: true })).toEqual({ latitude: null, longitude: null });
  });

  it.each([[null], [undefined], [{}], [{ latitude: 19 }], [{ longitude: 72 }], [{ latitude: NaN, longitude: 72 }], [{ latitude: 0, longitude: 0 }], [{ latitude: 91, longitude: 72 }]])(
    'invalid coordinates %j never become a pin, and never a half pair',
    (bad) => {
      expect(makePin(bad)).toBeNull();
      expect(pinCoordsForSave(makePin(bad))).toEqual({ latitude: null, longitude: null });
    },
  );

  it('unknown sources fall back to "saved"', () => {
    expect(makePin(MUMBAI, 'bogus').source).toBe('saved');
  });
});

describe('pairForSave / hasPair — objects carrying latitude/longitude (booking details, address forms)', () => {
  it('whole pair in, whole pair out', () => {
    expect(pairForSave({ latitude: 19.076, longitude: 72.8777, address: 'x' })).toEqual(MUMBAI);
    expect(hasPair({ latitude: 19.076, longitude: 72.8777 })).toBe(true);
  });

  it.each([
    [{ latitude: 19.076, longitude: null }], [{ latitude: null, longitude: 72.8777 }], [{ latitude: 19.076 }], [{ longitude: 72.8777 }],
    [{ latitude: '', longitude: '' }], [{ latitude: 'x', longitude: 'y' }], [{}], [null], [undefined],
  ])('half or missing pair %j → both null', (obj) => {
    expect(pairForSave(obj)).toEqual({ latitude: null, longitude: null });
    expect(hasPair(obj)).toBe(false);
  });
});

describe('coordsFromSelection', () => {
  it('converts a suggestion { lat, lng } to { latitude, longitude }', () => {
    expect(coordsFromSelection({ lat: 19.076, lng: 72.8777 })).toEqual(MUMBAI);
  });
  it.each([[undefined], [{}], [{ lat: 'x', lng: 1 }], [{ lat: 0, lng: 0 }], [{ lat: 100, lng: 0 }]])('rejects %j', (bad) => {
    expect(coordsFromSelection(bad)).toBeNull();
  });
});

describe('fieldsFromSelection — what a search result may fill', () => {
  const full = { label: 'Fort, Mumbai, Maharashtra, India', lat: 1, lng: 2, components: { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', locality: 'Fort' } };

  it('full components: fills pincode, city, state, district (and the address when it is empty); locality has no field and is ignored', () => {
    expect(fieldsFromSelection(full, '')).toEqual({
      pincode: '400001', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai City', address: 'Fort, Mumbai, Maharashtra, India',
    });
  });

  it('never overwrites an address the user already typed', () => {
    const out = fieldsFromSelection(full, '12 MG Road');
    expect(out).not.toHaveProperty('address');
    expect(out.city).toBe('Mumbai');
  });

  it('partial components fill only what exists — nothing is invented', () => {
    expect(fieldsFromSelection({ label: 'Pune', components: { city: 'Pune', state: 'Maharashtra' } }, 'typed')).toEqual({ city: 'Pune', state: 'Maharashtra' });
  });

  it.each([[undefined], [null], [{}], ['x']])('missing/empty components (%p) fill nothing but the label', (components) => {
    expect(fieldsFromSelection({ label: 'Somewhere', components }, 'typed')).toEqual({});
    expect(fieldsFromSelection({ label: 'Somewhere', components }, '')).toEqual({ address: 'Somewhere' });
  });

  it('blank strings and malformed pincodes are skipped', () => {
    expect(fieldsFromSelection({ label: 'x', components: { pincode: '4000', city: '  ', state: 7, district: '' } }, 'typed')).toEqual({});
    expect(fieldsFromSelection({ label: 'x', components: { pincode: '40000A' } }, 'typed')).toEqual({});
    expect(fieldsFromSelection({ label: 'x', components: { pincode: ' 400001 ' } }, 'typed')).toEqual({ pincode: '400001' });
  });
});

describe('formatPinLabel', () => {
  beforeEach(() => isEmbeddedMapAvailable.mockReturnValue(true));

  it('shows the coordinates and where they came from', () => {
    expect(formatPinLabel(MUMBAI, 'gps')).toBe('📍 19.07600, 72.87770 · GPS');
    expect(formatPinLabel(MUMBAI, 'search')).toBe('📍 19.07600, 72.87770 · Search');
    expect(formatPinLabel(MUMBAI, 'map')).toBe('📍 19.07600, 72.87770 · Map');
    expect(formatPinLabel(MUMBAI, 'saved')).toBe('📍 19.07600, 72.87770 · Saved');
    expect(formatPinLabel(MUMBAI, undefined)).toBe('📍 19.07600, 72.87770');
  });

  it('without a valid pin it is the call to action — "Pick on Map" where a map exists, "Use Current Location" where it does not', () => {
    expect(formatPinLabel(null, null)).toBe('Pick on Map');
    expect(formatPinLabel({ latitude: 0, longitude: 0 }, 'gps')).toBe('Pick on Map'); // placeholder is never shown as a location
    isEmbeddedMapAvailable.mockReturnValue(false);
    expect(formatPinLabel(null, null)).toBe('Use Current Location');
  });
});
