import * as SecureStore from 'expo-secure-store';
import api, { imageUrl } from '../axios';

// Replace the transport so the real axios instance (base URL, interceptors) is
// exercised without any network I/O. The adapter records the final request config.
let lastRequest;
beforeEach(() => {
  lastRequest = undefined;
  api.defaults.adapter = async (config) => {
    lastRequest = config;
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
});

describe('api client request contract', () => {
  it('targets the configured API base URL with a JSON content type and 30 s timeout', async () => {
    await api.get('/auth/me');
    expect(lastRequest.baseURL).toBe('https://api.test.invalid/api');
    expect(lastRequest.url).toBe('/auth/me');
    expect(lastRequest.timeout).toBe(30000);
    expect(lastRequest.headers['Content-Type']).toBe('application/json');
  });

  it('attaches the stored JWT as a Bearer token', async () => {
    await SecureStore.setItemAsync('zutsav_token', 'synthetic.jwt.token');
    await api.get('/auth/me');
    expect(lastRequest.headers.Authorization).toBe('Bearer synthetic.jwt.token');
  });

  it('sends no Authorization header when logged out', async () => {
    await api.get('/poojas');
    expect(lastRequest.headers.Authorization).toBeUndefined();
  });

  it('still sends the request if SecureStore throws', async () => {
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore unavailable'));
    await expect(api.get('/poojas')).resolves.toMatchObject({ status: 200 });
    expect(lastRequest.headers.Authorization).toBeUndefined();
  });
});

describe('imageUrl', () => {
  const BASE = 'https://api.test.invalid';

  it('returns null for empty values', () => {
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl(undefined)).toBeNull();
    expect(imageUrl('')).toBeNull();
  });

  it('passes absolute URLs through untouched', () => {
    expect(imageUrl('https://cdn.example.invalid/a.png')).toBe('https://cdn.example.invalid/a.png');
  });

  it('prefixes bare upload paths with the base URL', () => {
    expect(imageUrl('uploads/poojas/a.png')).toBe(`${BASE}/uploads/poojas/a.png`);
  });

  it('never produces a double slash for paths with leading slashes', () => {
    expect(imageUrl('/uploads/poojas/a.png')).toBe(`${BASE}/uploads/poojas/a.png`);
    expect(imageUrl('//uploads/poojas/a.png')).toBe(`${BASE}/uploads/poojas/a.png`);
  });
});
