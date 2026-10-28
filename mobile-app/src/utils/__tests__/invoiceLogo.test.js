import {
  resolveLogoUrl, fetchLogoDataUri, loadInvoiceLogo, isInvoiceLogoDataUri, __resetInvoiceLogoCache, MAX_LOGO_BYTES,
} from '../invoiceLogo';

// Deterministic fixtures: no network, no FileReader. 1×1 PNG.
const B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_URI = `data:image/png;base64,${B64}`;
const BASE = 'http://192.168.0.192:5000';
const API = `${BASE}/api`;

const headers = (type) => ({ get: (k) => (k.toLowerCase() === 'content-type' ? type : null) });
const imageResponse = (type = 'image/png', size = 100) => ({ ok: true, headers: headers(type), blob: async () => ({ size }) });
const readOk = async () => `data:application/octet-stream;base64,${B64}`;      // a reader may guess any mime: only the verified one is used
const settingsResponse = (logo) => ({ ok: true, json: async () => ({ success: true, settings: { logo } }) });

beforeEach(() => __resetInvoiceLogoCache());

describe('resolveLogoUrl — only the trusted backend origin, never a guessed or foreign URL', () => {
  it('turns a stored path into an absolute URL on the backend (like the website\'s getImageUrl)', () => {
    expect(resolveLogoUrl('uploads/logos/logo.png', BASE)).toBe(`${BASE}/uploads/logos/logo.png`);
    expect(resolveLogoUrl('/uploads/logos/logo.png', BASE)).toBe(`${BASE}/uploads/logos/logo.png`);
    expect(resolveLogoUrl('//uploads/logos/logo.png', `${BASE}/`)).toBe(`${BASE}/uploads/logos/logo.png`);
  });

  it('accepts an absolute URL only when it is on the same origin as the backend', () => {
    expect(resolveLogoUrl(`${BASE}/uploads/logos/a.webp`, BASE)).toBe(`${BASE}/uploads/logos/a.webp`);
    expect(resolveLogoUrl('https://evil.example/logo.png', BASE)).toBeNull();
    expect(resolveLogoUrl(`${BASE}.evil.example/logo.png`, BASE)).toBeNull();     // prefix trick
    expect(resolveLogoUrl('http://192.168.0.192:5001/logo.png', BASE)).toBeNull(); // another port
  });

  it.each([
    ['empty / missing', ''], ['whitespace', '   '], [null, null], [undefined, undefined], ['a number', 42], ['an object', {}],
    ['a javascript: URL', 'javascript:alert(1)'], ['a data: URL', PNG_URI], ['path traversal', 'uploads/../../etc/passwd'],
    ['a query string', 'uploads/logo.png?x=1'], ['a fragment', 'uploads/logo.png#x'], ['a quote (attribute injection)', 'uploads/x" onerror="alert(1)'],
    ['a space', 'uploads/my logo.png'], ['a backslash', 'uploads\\logo.png'], ['an over-long value', `uploads/${'a'.repeat(400)}.png`],
  ])('refuses %s', (_n, v) => expect(resolveLogoUrl(v, BASE)).toBeNull());

  it('refuses everything when no backend origin is configured', () => {
    expect(resolveLogoUrl('uploads/logo.png', '')).toBeNull();
    expect(resolveLogoUrl('uploads/logo.png', null)).toBeNull();
  });
});

describe('isInvoiceLogoDataUri — the only shape the document accepts', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])('accepts a base64 %s data URI', (m) => {
    expect(isInvoiceLogoDataUri(`data:${m};base64,${B64}`)).toBe(true);
  });

  it.each([
    ['a remote URL', 'https://example.com/logo.png'], ['an HTML data URI', `data:text/html;base64,${B64}`], ['an unsupported image type', `data:image/gif;base64,${B64}`],
    ['a non-base64 data URI', 'data:image/png,abc'], ['an attribute-breaking value', `data:image/png;base64,${B64}" onerror="alert(1)`],
    ['markup', '<img src=x>'], ['empty', ''], ['null', null], ['a number', 1], ['an over-size value', `data:image/png;base64,${'A'.repeat(Math.ceil(MAX_LOGO_BYTES * 3) + 10)}`],
  ])('rejects %s', (_n, v) => expect(isInvoiceLogoDataUri(v)).toBe(false));
});

describe('fetchLogoDataUri — download, verify, embed; any problem gives null', () => {
  const run = (response, extra = {}) => fetchLogoDataUri(`${BASE}/uploads/logos/logo.png`, { fetchImpl: jest.fn(async () => response), readAsDataUrl: readOk, ...extra });

  it('returns a data URI of the VERIFIED image type (not the reader\'s guess)', async () => {
    expect(await run(imageResponse('image/png'))).toBe(PNG_URI);
    expect(await run(imageResponse('image/jpg'))).toBe(`data:image/jpeg;base64,${B64}`);       // common mislabel of JPEG
    expect(await run(imageResponse('image/webp'))).toBe(`data:image/webp;base64,${B64}`);
    expect(await run(imageResponse('image/svg+xml; charset=utf-8'))).toBe(`data:image/svg+xml;base64,${B64}`);
  });

  it('requests exactly the given URL with GET and no credentials', async () => {
    const fetchImpl = jest.fn(async () => imageResponse());
    await fetchLogoDataUri(`${BASE}/uploads/logos/logo.png`, { fetchImpl, readAsDataUrl: readOk });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/uploads/logos/logo.png`);
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
    expect(JSON.stringify(fetchImpl.mock.calls[0][1])).not.toMatch(/authorization|bearer|cookie/i);
  });

  it.each([
    ['a 404', { ok: false, status: 404, headers: headers('text/html') }],
    ['an HTML error page served with 200', imageResponse('text/html')],
    ['an unsupported image type', imageResponse('image/gif')],
    ['a missing content type', imageResponse('')],
    ['an empty body', imageResponse('image/png', 0)],
    ['an oversize image', imageResponse('image/png', MAX_LOGO_BYTES + 1)],
    ['no response at all', undefined],
  ])('returns null for %s', async (_n, response) => expect(await run(response)).toBeNull());

  it('returns null when the body cannot be read, or the reader returns something that is not a data URI', async () => {
    expect(await run(imageResponse(), { readAsDataUrl: async () => { throw new Error('unreadable'); } })).toBeNull();
    expect(await run(imageResponse(), { readAsDataUrl: async () => 'not a data uri' })).toBeNull();
    expect(await run(imageResponse(), { readAsDataUrl: async () => 'data:image/png;base64,!!!not-base64!!!' })).toBeNull();
    expect(await run(imageResponse(), { readAsDataUrl: async () => undefined })).toBeNull();
  });

  it('returns null (never throws) on a network failure or an invalid URL argument', async () => {
    expect(await fetchLogoDataUri(`${BASE}/x.png`, { fetchImpl: async () => { throw new Error('offline'); } })).toBeNull();
    expect(await fetchLogoDataUri('', {})).toBeNull();
    expect(await fetchLogoDataUri(null, {})).toBeNull();
  });
});

describe('loadInvoiceLogo — public settings → trusted URL → embedded image', () => {
  const deps = (routes, extra = {}) => ({
    apiUrl: API, baseUrl: BASE, readAsDataUrl: readOk,
    fetchImpl: jest.fn(async (url) => {
      const hit = Object.entries(routes).find(([k]) => url === k);
      if (!hit) throw new Error(`unexpected fetch ${url}`);
      return typeof hit[1] === 'function' ? hit[1]() : hit[1];
    }),
    ...extra,
  });

  it('reads the logo path from the PUBLIC settings endpoint and embeds that file', async () => {
    const d = deps({ [`${API}/settings/public`]: settingsResponse('uploads/logos/logo.png'), [`${BASE}/uploads/logos/logo.png`]: imageResponse() });
    expect(await loadInvoiceLogo(d)).toBe(PNG_URI);
    expect(d.fetchImpl.mock.calls.map(([u]) => u)).toEqual([`${API}/settings/public`, `${BASE}/uploads/logos/logo.png`]);
    d.fetchImpl.mock.calls.forEach(([, init]) => expect(JSON.stringify(init)).not.toMatch(/authorization|bearer/i));   // public: no token
  });

  it('downloads the same logo only once while its URL is unchanged, and again when the admin changes it', async () => {
    const d = deps({ [`${API}/settings/public`]: settingsResponse('uploads/logos/a.png'), [`${BASE}/uploads/logos/a.png`]: imageResponse() });
    await loadInvoiceLogo(d);
    await loadInvoiceLogo(d);
    expect(d.fetchImpl.mock.calls.filter(([u]) => u.endsWith('a.png')).length).toBe(1);
    const d2 = deps({ [`${API}/settings/public`]: settingsResponse('uploads/logos/b.png'), [`${BASE}/uploads/logos/b.png`]: imageResponse('image/jpeg') });
    expect(await loadInvoiceLogo(d2)).toBe(`data:image/jpeg;base64,${B64}`);
  });

  it.each([
    ['no logo configured', { [`${API}/settings/public`]: settingsResponse('') }],
    ['the settings request failing', { [`${API}/settings/public`]: { ok: false, status: 500 } }],
    ['the settings request being offline', { [`${API}/settings/public`]: () => { throw new Error('offline'); } }],
    ['an invalid settings body', { [`${API}/settings/public`]: { ok: true, json: async () => { throw new Error('bad json'); } } }],
    ['a settings body without settings', { [`${API}/settings/public`]: { ok: true, json: async () => ({}) } }],
    ['a logo on a foreign host (untrusted)', { [`${API}/settings/public`]: settingsResponse('https://evil.example/logo.png') }],
    ['the logo file being missing', { [`${API}/settings/public`]: settingsResponse('uploads/logos/gone.png'), [`${BASE}/uploads/logos/gone.png`]: { ok: false, status: 404, headers: headers('text/html') } }],
    ['the logo being an unsupported type', { [`${API}/settings/public`]: settingsResponse('uploads/logos/x.gif'), [`${BASE}/uploads/logos/x.gif`]: imageResponse('image/gif') }],
  ])('resolves null (never rejects) for %s', async (_n, routes) => {
    await expect(loadInvoiceLogo(deps(routes))).resolves.toBeNull();
  });

  it('never calls a foreign host even when the settings point at one', async () => {
    const d = deps({ [`${API}/settings/public`]: settingsResponse('https://evil.example/logo.png') });
    await loadInvoiceLogo(d);
    expect(d.fetchImpl.mock.calls.map(([u]) => u)).toEqual([`${API}/settings/public`]);
  });

  it('gives up after the time limit instead of blocking the invoice', async () => {
    jest.useFakeTimers();
    try {
      const d = deps({ [`${API}/settings/public`]: () => new Promise(() => {}) }, { timeoutMs: 1000 });
      const p = loadInvoiceLogo(d);
      jest.advanceTimersByTime(1001);
      await expect(p).resolves.toBeNull();
    } finally { jest.useRealTimers(); }
  });

  it('resolves null when no API URL is configured', async () => {
    await expect(loadInvoiceLogo({ apiUrl: '', baseUrl: BASE, fetchImpl: jest.fn() })).resolves.toBeNull();
  });
});

describe('the logo module stays self-contained', () => {
  it('uses no authenticated client, no new dependency and no localization layer', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'invoiceLogo.js'), 'utf8');
    expect(/api\/axios|SecureStore|expo-asset|expo-file-system|i18n|useTranslation/.test(src)).toBe(false);
    expect(/^import .* from '(?!\.\.?\/)[^']+'/m.test(src)).toBe(false);          // only relative imports: nothing from node_modules
  });
});
