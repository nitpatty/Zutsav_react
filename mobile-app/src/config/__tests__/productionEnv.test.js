/**
 * @jest-environment node
 */
// build-config/productionEnv.js decides which backend endpoints a Release bundle may be built for. Exercised with explicit
// environments only: nothing here reads the real environment, .env, or the network.
const { describeProductionEnv, productionEnvProblems } = require('../../../build-config/productionEnv');

const PROD = { EXPO_PUBLIC_API_URL: 'https://zutsav.com/api', EXPO_PUBLIC_BASE_URL: 'https://zutsav.com', EXPO_PUBLIC_WEB_URL: 'https://zutsav.com' };
const with_ = (over) => ({ ...PROD, ...over });

describe('production endpoints for Release bundles', () => {
  it('accepts the endpoints the production Nginx serves (zutsav.com; /api is forwarded with its prefix kept)', () => {
    expect(productionEnvProblems(PROD)).toEqual([]);
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_API_URL: 'https://zutsav.com/api', EXPO_PUBLIC_WEB_URL: 'https://www.zutsav.com' }))).toEqual([]);
  });

  it('tolerates surrounding whitespace and a trailing slash on origins', () => {
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_BASE_URL: ' https://zutsav.com/ ', EXPO_PUBLIC_WEB_URL: 'https://zutsav.com/' }))).toEqual([]);
  });

  it('describes the selected endpoints, including the Socket.IO endpoint derived from the base URL', () => {
    expect(describeProductionEnv(PROD)).toEqual({ api: 'https://zutsav.com/api', base: 'https://zutsav.com', web: 'https://zutsav.com', socket: 'wss://zutsav.com/socket.io' });
  });

  it.each(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_BASE_URL', 'EXPO_PUBLIC_WEB_URL'])('refuses a missing or blank %s', (name) => {
    expect(productionEnvProblems({ ...PROD, [name]: undefined }).join('\n')).toContain(`${name} is not set`);
    expect(productionEnvProblems({ ...PROD, [name]: '   ' }).join('\n')).toContain(`${name} is not set`);
  });

  it('refuses an empty environment with one problem per variable', () => {
    expect(productionEnvProblems({})).toHaveLength(3);
  });

  it.each([
    ['localhost', 'https://localhost'],
    ['a loopback address', 'https://127.0.0.1'],
    ['the emulator host', 'https://10.0.2.2'],
    ['a 192.168 LAN address', 'https://192.168.0.192'],
    ['a 10.x LAN address', 'https://10.1.2.3'],
    ['a 172.16 LAN address', 'https://172.16.0.5'],
    ['an IPv6 loopback', 'https://[::1]'],
    ['a decimal-encoded IP', 'https://3232235712'],
    ['a hex-encoded IP', 'https://0xC0A80001'],
    ['an mDNS name', 'https://laptop.local'],
    ['an internal name', 'https://api.corp.internal'],
    ['a single-label host', 'https://backend'],
    ['a reserved test domain', 'https://api.zutsav.test'],
  ])('refuses %s as a host', (_label, url) => {
    for (const name of ['EXPO_PUBLIC_BASE_URL', 'EXPO_PUBLIC_WEB_URL']) {
      expect(productionEnvProblems(with_({ [name]: url })).length).toBeGreaterThan(0);
    }
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_API_URL: `${url}/api`, EXPO_PUBLIC_BASE_URL: url })).length).toBeGreaterThan(0);
  });

  it('refuses cleartext http, even on the production host', () => {
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_BASE_URL: 'http://zutsav.com' })).join('\n')).toContain('https://');
  });

  it.each([
    ['an explicit port', 'https://zutsav.com:5000'],
    ['a query string', 'https://zutsav.com/?x=1'],
    ['a fragment', 'https://zutsav.com/#x'],
    ['a path', 'https://zutsav.com/app'],
    ['not a URL', 'zutsav.com'],
  ])('refuses a base URL with %s', (_label, url) => {
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_BASE_URL: url })).length).toBeGreaterThan(0);
  });

  it.each([
    ['no /api prefix', 'https://zutsav.com'],
    ['a trailing slash', 'https://zutsav.com/api/'],
    ['a doubled prefix', 'https://zutsav.com/api/api'],
    ['a different prefix', 'https://zutsav.com/v1'],
  ])('refuses an API URL with %s (Nginx keeps the /api prefix, so exactly one is required)', (_label, url) => {
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_API_URL: url })).join('\n')).toContain('"/api"');
  });

  it('refuses an API on a different origin than the base URL (uploads and Socket.IO share the backend)', () => {
    expect(productionEnvProblems(with_({ EXPO_PUBLIC_API_URL: 'https://api.zutsav.com/api' })).join('\n')).toContain('same origin');
  });

  it('never repeats a rejected value, so a URL with embedded credentials cannot reach a log', () => {
    const secret = 'hunter2-not-a-real-secret';
    const problems = productionEnvProblems(with_({ EXPO_PUBLIC_BASE_URL: `https://user:${secret}@zutsav.com`, EXPO_PUBLIC_WEB_URL: `http://admin:${secret}@192.168.0.1/x` })).join('\n');
    expect(problems).toContain('must not contain credentials');
    expect(problems).not.toContain(secret);
    expect(problems).not.toContain('192.168');
  });
});
