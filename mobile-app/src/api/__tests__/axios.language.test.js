import api from '../axios';
import { useLanguageStore } from '../../i18n/languageStore';
import { applyContentLanguage } from '../contentLanguage';

// The REAL shared client (interceptors included) with only the transport replaced: what is asserted is the final
// request config that would leave the app.
let sent;
beforeEach(() => {
  sent = [];
  api.defaults.adapter = async (config) => {
    sent.push(config);
    return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
});
const last = () => sent[sent.length - 1];
const setLang = (language) => useLanguageStore.setState({ language });

describe('?lang= on GET requests', () => {
  it('adds params.lang for a supported non-English language', async () => {
    setLang('hi');
    await api.get('/poojas');
    expect(last().params).toEqual({ lang: 'hi' });
  });

  it.each(['hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa', 'or'])('sends the bare code for %s', async (code) => {
    setLang(code);
    await api.get('/festivals');
    expect(last().params.lang).toBe(code);
  });

  it('omits lang for English (default behaviour preserved)', async () => {
    setLang('en');
    await api.get('/poojas', { params: { page: 2 } });
    expect(last().params).toEqual({ page: 2 });
    await api.get('/temples');
    expect(last().params).toBeUndefined();
  });

  it.each(['xx', 'hi-IN', 'HI', 'en-US', '', null, undefined, 'klingon'])('never sends an unsupported value (%p)', async (bad) => {
    setLang(bad);
    await api.get('/poojas', { params: { page: 1 } });
    expect(last().params).toEqual({ page: 1 });
    expect(JSON.stringify(last().params)).not.toContain('lang');
  });

  it('preserves existing query parameters', async () => {
    setLang('ta');
    await api.get('/marketplace/products', { params: { page: 3, limit: 12, category: 'incense', search: 'ghee' } });
    expect(last().params).toEqual({ page: 3, limit: 12, category: 'incense', search: 'ghee', lang: 'ta' });
  });

  it('does not mutate the params object the caller passed in', async () => {
    setLang('ta');
    const callerParams = { page: 1 };
    await api.get('/poojas', { params: callerParams });
    expect(callerParams).toEqual({ page: 1 });
  });

  it('a lang the caller supplies in params wins — no duplicate, no override', async () => {
    setLang('ta');
    await api.get('/poojas', { params: { lang: 'hi', page: 1 } });
    expect(last().params).toEqual({ lang: 'hi', page: 1 });
  });

  it('a lang already inside the URL query string wins — no second lang is added', async () => {
    setLang('ta');
    await api.get('/poojas?limit=6&lang=hi');
    expect(last().url).toBe('/poojas?limit=6&lang=hi');
    expect(last().params).toBeUndefined();
  });

  it('works with a URL that has other query text (no lang yet)', async () => {
    setLang('ta');
    await api.get('/poojas?limit=6&isActive=true');
    expect(last().url).toBe('/poojas?limit=6&isActive=true');
    expect(last().params).toEqual({ lang: 'ta' });
  });

  it('a "lang" substring elsewhere in the URL does not suppress it', async () => {
    setLang('ta');
    await api.get('/poojas?language=Hindi');
    expect(last().params).toEqual({ lang: 'ta' });
  });

  it('never sends an Accept-Language header (the backend contract is the query parameter)', async () => {
    setLang('hi');
    await api.get('/poojas');
    const names = Object.keys(last().headers || {}).map((h) => h.toLowerCase());
    expect(names).not.toContain('accept-language');
  });

  it('follows a language switch on the next request', async () => {
    setLang('hi');
    await api.get('/poojas');
    setLang('en');
    await api.get('/poojas');
    setLang('ta');
    await api.get('/poojas');
    expect(sent.map((c) => c.params && c.params.lang)).toEqual(['hi', undefined, 'ta']);
  });
});

describe('only GET carries it; bodies are never touched', () => {
  it.each([['post'], ['patch'], ['put'], ['delete']])('%s: no params, body unchanged', async (method) => {
    setLang('hi');
    const body = { poojaId: 'p1', coinRedemptionCoins: 10, nested: { a: 1 } };
    const before = JSON.stringify(body);
    if (method === 'delete') await api.delete('/things/1');
    else await api[method]('/things', body);
    expect(last().params).toBeUndefined();
    if (method !== 'delete') {
      expect(JSON.parse(last().data)).toEqual(body);
      expect(last().data).not.toContain('lang');
    }
    expect(JSON.stringify(body)).toBe(before);
  });

  it('the preferred-language PATCH itself carries only its own body', async () => {
    setLang('hi');
    await api.patch('/auth/preferred-language', { preferredLanguage: 'hi' });
    expect(JSON.parse(last().data)).toEqual({ preferredLanguage: 'hi' });
    expect(last().params).toBeUndefined();
  });
});

describe('applyContentLanguage (unit)', () => {
  it('handles URLSearchParams without losing existing entries or duplicating lang', () => {
    const params = new URLSearchParams({ page: '1' });
    const out = applyContentLanguage({ method: 'get', url: '/x', params }, 'hi');
    expect(out.params.get('lang')).toBe('hi');
    expect(out.params.get('page')).toBe('1');
    const keep = applyContentLanguage({ method: 'get', url: '/x', params: new URLSearchParams({ lang: 'ta' }) }, 'hi');
    expect(keep.params.get('lang')).toBe('ta');
    expect(keep.params.getAll('lang')).toHaveLength(1);
  });

  it('defaults a missing method to GET and tolerates a missing config', () => {
    expect(applyContentLanguage({ url: '/x' }, 'hi').params).toEqual({ lang: 'hi' });
    expect(applyContentLanguage(undefined, 'hi')).toBeUndefined();
  });
});
