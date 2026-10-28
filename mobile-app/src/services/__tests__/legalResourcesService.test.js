import api from '../../api/axios';
import {
  loadLegalDocuments, loadFooterLinks, peekLegalCache, isLegalCacheFresh, prepareLinks, resetLegalCache, LEGAL_CACHE_TTL_MS,
} from '../legalResourcesService';

jest.mock('../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));

const docBody = (labels = ['Privacy Policy']) => ({
  documents: labels.map((label, i) => ({ documentType: ['privacy', 'terms'][i], label, exists: true, originalName: 'x.pdf', mimeType: 'application/pdf', size: 1, viewUrl: `/api/documents/${['privacy', 'terms'][i]}/view` })),
});
const settingsBody = (links) => ({ success: true, settings: { platformName: 'Zutsav', footerLinks: links } });
const LINK = (id, label) => ({ id, label, linkType: 'url', url: 'https://example.com' });
const A = 'a1b2c3d4e5f60718';
const B = '0123456789abcdef';

const route = (handlers) => api.get.mockImplementation(async (url) => {
  const h = handlers[url];
  if (!h) throw new Error(`unexpected GET ${url}`);
  return typeof h === 'function' ? h() : h;
});
const callsTo = (url) => api.get.mock.calls.filter(([u]) => u === url).length;

beforeEach(() => { api.get.mockReset(); resetLegalCache(); });

describe('endpoints', () => {
  it('reads the public documents list and the public settings — nothing else', async () => {
    route({ '/documents': { data: docBody() }, '/settings/public': { data: settingsBody([LINK(A, 'Careers')]) } });
    const docs = await loadLegalDocuments();
    const links = await loadFooterLinks();
    expect(api.get.mock.calls.map(([u]) => u)).toEqual(['/documents', '/settings/public']);
    expect(docs.map((d) => d.type)).toEqual(['privacy']);
    expect(links).toEqual([LINK(A, 'Careers')]);
  });

  it('a settings response without footerLinks is an empty configuration', async () => {
    route({ '/settings/public': { data: { success: true, settings: { platformName: 'Zutsav' } } } });
    expect(await loadFooterLinks()).toEqual([]);
    resetLegalCache();
    route({ '/settings/public': { data: {} } });
    expect(await loadFooterLinks()).toEqual([]);
  });
});

describe('cache and refresh', () => {
  it('serves the cache inside the TTL — repeated navigation makes no new requests', async () => {
    route({ '/documents': { data: docBody() } });
    await loadLegalDocuments();
    await loadLegalDocuments();
    await loadLegalDocuments();
    expect(callsTo('/documents')).toBe(1);
  });

  it('refetches once the TTL has expired, so admin changes are not hidden forever', async () => {
    route({ '/settings/public': () => ({ data: settingsBody([LINK(A, 'Old name')]) }) });
    expect((await loadFooterLinks())[0].label).toBe('Old name');

    route({ '/settings/public': () => ({ data: settingsBody([LINK(A, 'New name'), LINK(B, 'Added')]) }) });
    const later = Date.now() + LEGAL_CACHE_TTL_MS + 1;
    const fresh = await loadFooterLinks({ now: later });
    expect(fresh.map((l) => l.label)).toEqual(['New name', 'Added']);
    expect(callsTo('/settings/public')).toBe(2);
  });

  it('force (pull-to-refresh / Retry) always goes to the server', async () => {
    route({ '/documents': () => ({ data: docBody(['One']) }) });
    await loadLegalDocuments();
    route({ '/documents': () => ({ data: docBody(['Two']) }) });
    expect((await loadLegalDocuments({ force: true }))[0].label).toBe('Two');
    expect(callsTo('/documents')).toBe(2);
  });

  it('concurrent callers share ONE in-flight request', async () => {
    let release;
    api.get.mockImplementation(() => new Promise((r) => { release = () => r({ data: docBody() }); }));
    const calls = [loadLegalDocuments(), loadLegalDocuments(), loadLegalDocuments({ force: true })];
    release();
    const results = await Promise.all(calls);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
  });

  it('a failed request is not cached: the next call tries again, and the error reaches the caller', async () => {
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    await expect(loadLegalDocuments()).rejects.toThrow('Network Error');
    route({ '/documents': { data: docBody() } });
    expect((await loadLegalDocuments()).length).toBe(1);
  });

  it('a failed refresh leaves the last good data available for display', async () => {
    route({ '/documents': { data: docBody(['Kept']) } });
    await loadLegalDocuments();
    api.get.mockRejectedValueOnce(new Error('offline'));
    await expect(loadLegalDocuments({ force: true })).rejects.toThrow('offline');
    expect(peekLegalCache().documents[0].label).toBe('Kept');
  });

  it('the two sections load and fail independently', async () => {
    route({ '/documents': { data: docBody() }, '/settings/public': () => { throw new Error('settings down'); } });
    const [d, l] = await Promise.allSettled([loadLegalDocuments(), loadFooterLinks()]);
    expect(d.status).toBe('fulfilled');
    expect(l.status).toBe('rejected');
    expect(isLegalCacheFresh()).toBe(false);
  });

  it('reports freshness only when both sections are cached within the TTL', async () => {
    route({ '/documents': { data: docBody() }, '/settings/public': { data: settingsBody([]) } });
    expect(isLegalCacheFresh()).toBe(false);
    await Promise.all([loadLegalDocuments(), loadFooterLinks()]);
    expect(isLegalCacheFresh()).toBe(true);
    expect(isLegalCacheFresh(Date.now() + LEGAL_CACHE_TTL_MS + 1)).toBe(false);
  });
});

describe('prepareLinks', () => {
  it('validates the raw links against the published documents', async () => {
    route({ '/documents': { data: docBody(['Privacy Policy']) } });
    const docs = await loadLegalDocuments();
    const out = prepareLinks([LINK(A, 'Privacy Policy'), LINK(B, 'Press')], docs);
    expect(out.map((l) => l.label)).toEqual(['Press']);
  });
});
