import api from '../api/axios';
import { mapLegalDocuments, prepareFooterLinks } from '../utils/legalResources';

/**
 * Loads the public legal documents and admin-configured footer links.
 *
 * Both are PUBLIC server configuration (not account data), so the cache is deliberately NOT cleared on logout.
 *  - Short TTL (60 s): returning to the screen shortly after an admin change shows it, without polling and
 *    without a request every time the user navigates back and forth.
 *  - In-flight de-duplication: concurrent callers (mount + focus, two screens) share ONE request.
 *  - `force` (pull-to-refresh / Retry) always goes to the server.
 *  - A failed refresh never destroys what is already cached: the caller gets the error AND can keep showing the
 *    last good data. The two sections load and fail independently.
 * No new global store: module-local memory only, gone on app restart.
 */
export const LEGAL_CACHE_TTL_MS = 60 * 1000;

const entries = {
  documents: { data: null, at: 0, inflight: null },
  links: { data: null, at: 0, inflight: null },
};

const fetchDocuments = async () => {
  const { data } = await api.get('/documents');
  return mapLegalDocuments(data);
};
const fetchRawLinks = async () => {
  const { data } = await api.get('/settings/public');
  return Array.isArray(data?.settings?.footerLinks) ? data.settings.footerLinks : [];
};

function load(name, fetcher, { force = false, now = Date.now() } = {}) {
  const e = entries[name];
  if (e.inflight) return e.inflight;                         // share the running request
  if (!force && e.data && now - e.at < LEGAL_CACHE_TTL_MS) return Promise.resolve(e.data);
  e.inflight = fetcher()
    .then((data) => { e.data = data; e.at = Date.now(); return data; })
    .finally(() => { e.inflight = null; });
  return e.inflight;
}

export const loadLegalDocuments = (opts) => load('documents', fetchDocuments, opts);
/** Raw (server-ordered, enabled-only) footer links; use prepareLinks() to validate for display. */
export const loadFooterLinks = (opts) => load('links', fetchRawLinks, opts);

/** Last successfully loaded data (possibly stale), or null — for showing something during an outage. */
export const peekLegalCache = () => ({ documents: entries.documents.data, links: entries.links.data });
export const isLegalCacheFresh = (now = Date.now()) =>
  !!entries.documents.data && !!entries.links.data
  && now - entries.documents.at < LEGAL_CACHE_TTL_MS && now - entries.links.at < LEGAL_CACHE_TTL_MS;

/** Validated, display-ready links (needs the fixed documents to drop duplicates of their titles). */
export const prepareLinks = (rawLinks, documents) => prepareFooterLinks(rawLinks, documents);

/** Test helper. */
export function resetLegalCache() {
  Object.values(entries).forEach((e) => { e.data = null; e.at = 0; e.inflight = null; });
}
