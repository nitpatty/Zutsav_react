import { isEmbeddedMapAvailable, sanitizeCoords } from '../mapConfig';

describe('isEmbeddedMapAvailable', () => {
  it('never mounts the Google-backed react-native-maps view on Android (no Google Maps configuration exists)', () => {
    expect(isEmbeddedMapAvailable({ os: 'android' })).toBe(false);
  });

  it('iOS (Apple Maps, no key) keeps the embedded map', () => {
    expect(isEmbeddedMapAvailable({ os: 'ios' })).toBe(true);
  });

  it('is not switched on by any environment variable', () => {
    const before = process.env.EXPO_PUBLIC_ANDROID_MAPS_ENABLED;
    process.env.EXPO_PUBLIC_ANDROID_MAPS_ENABLED = 'true';
    try { expect(isEmbeddedMapAvailable({ os: 'android' })).toBe(false); }
    finally { if (before === undefined) delete process.env.EXPO_PUBLIC_ANDROID_MAPS_ENABLED; else process.env.EXPO_PUBLIC_ANDROID_MAPS_ENABLED = before; }
  });

  it('defaults to the real platform (jest-expo runs as iOS)', () => {
    expect(isEmbeddedMapAvailable()).toBe(true);
  });
});

describe('sanitizeCoords', () => {
  it('accepts numbers and numeric strings (API / forms return both) and returns numbers', () => {
    expect(sanitizeCoords({ latitude: 19.076, longitude: 72.8777 })).toEqual({ latitude: 19.076, longitude: 72.8777 });
    expect(sanitizeCoords({ latitude: '19.076', longitude: ' 72.8777 ' })).toEqual({ latitude: 19.076, longitude: 72.8777 });
    expect(sanitizeCoords({ latitude: -33.86, longitude: -151.2 })).toEqual({ latitude: -33.86, longitude: -151.2 });
  });

  it('accepts the exact range limits', () => {
    expect(sanitizeCoords({ latitude: 90, longitude: 180 })).toEqual({ latitude: 90, longitude: 180 });
    expect(sanitizeCoords({ latitude: -90, longitude: -180 })).toEqual({ latitude: -90, longitude: -180 });
  });

  it.each([
    [null], [undefined], ['19,72'], [5], [[]], [{}],
    [{ latitude: 19 }], [{ longitude: 72 }], [{ latitude: '', longitude: '' }], [{ latitude: '  ', longitude: '72' }],
    [{ latitude: NaN, longitude: 72 }], [{ latitude: Infinity, longitude: 72 }], [{ latitude: 'abc', longitude: 72 }],
    [{ latitude: null, longitude: 72 }], [{ latitude: true, longitude: 72 }],
    [{ latitude: 90.0001, longitude: 72 }], [{ latitude: 19, longitude: 180.5 }], [{ latitude: -91, longitude: 0.5 }], [{ latitude: 999, longitude: 999 }],
  ])('rejects %j', (bad) => expect(sanitizeCoords(bad)).toBeNull());

  it('rejects the (0, 0) placeholder but not a real point on one axis', () => {
    expect(sanitizeCoords({ latitude: 0, longitude: 0 })).toBeNull();
    expect(sanitizeCoords({ latitude: '0', longitude: '0' })).toBeNull();
    expect(sanitizeCoords({ latitude: 0, longitude: 36.8 })).toEqual({ latitude: 0, longitude: 36.8 });
  });
});
