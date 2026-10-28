import { urls } from '../config';

/**
 * The official platform logo for the invoice PDF.
 *
 * Source (same as the website's InvoicePage, `useSettings().logoUrl`): the admin-managed `logo` of the PUBLIC, unauthenticated
 * `GET /api/settings/public` (`settings.logo`, an uploaded PNG/JPG/WEBP/SVG stored as a path under the backend origin). Nothing is hard-coded.
 *
 * expo-print renders the HTML in a native web view that does not wait for remote images, so the image is downloaded BEFORE the PDF is
 * generated and embedded as a `data:` URI. Everything here fails soft: any problem (no logo configured, offline, 4xx/5xx, wrong type, too big,
 * unreadable, timeout) resolves to `null` and the invoice falls back to its text-only header. Nothing here throws, and the invoice never waits
 * longer than `TOTAL_TIMEOUT_MS` for the logo.
 *
 * Plain `fetch` (not the authenticated axios client): both requests are public, no token is sent, and the invoice API call set stays exactly
 * as it was.
 */

export const TOTAL_TIMEOUT_MS = 8000;
export const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;     // the data URI is inlined into the PDF's HTML; the upload limit (5 MB) is far larger

// What an uploaded logo can be (backend `logoFilter`: PNG, JPG, WEBP, SVG). `image/jpg` is a common mislabel of JPEG.
const MIME_ALIASES = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/webp': 'image/webp', 'image/svg+xml': 'image/svg+xml' };

// The ONLY shape the invoice HTML accepts for a logo (also re-checked by the template): a base64 image data URI of an allowed type.
const DATA_URI_RE = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
export const isInvoiceLogoDataUri = (v) => typeof v === 'string' && v.length < 3 * MAX_LOGO_BYTES && DATA_URI_RE.test(v);

const stripSlash = (s) => s.replace(/\/+$/, '');

/**
 * The absolute URL of the configured logo, or null when it is missing or not on the trusted backend origin.
 * Accepts a stored path (`uploads/logos/x.png`, like the website's getImageUrl) or an absolute URL on the SAME origin as the app's backend.
 * Anything else (another host, `..` segments, query/fragment, scripts, whitespace) is refused.
 */
export function resolveLogoUrl(logo, baseUrl = urls.baseUrl) {
  const base = typeof baseUrl === 'string' ? stripSlash(baseUrl.trim()) : '';
  if (!base || typeof logo !== 'string') return null;
  const raw = logo.trim();
  if (!raw || raw.length > 300) return null;
  if (/^https?:\/\//i.test(raw)) {
    const rest = raw.startsWith(`${base}/`) ? raw.slice(base.length + 1) : null;
    return rest && /^[\w.\-/]+$/.test(rest) && !rest.includes('..') ? `${base}/${rest}` : null;
  }
  const path = raw.replace(/^\/+/, '');
  if (!path || !/^[\w.\-/]+$/.test(path) || path.includes('..')) return null;
  return `${base}/${path}`;
}

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

const readBlobAsDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('unreadable')));
  reader.onerror = () => reject(new Error('unreadable'));
  reader.readAsDataURL(blob);
});

/** Downloads one image and returns a validated `data:` URI, or null. `deps` exist for tests (no network, no FileReader). */
export async function fetchLogoDataUri(url, deps = {}) {
  try {
    if (typeof url !== 'string' || !url) return null;
    const doFetch = deps.fetchImpl || fetch;
    const read = deps.readAsDataUrl || readBlobAsDataUrl;
    const res = await doFetch(url, { method: 'GET', headers: { Accept: 'image/png,image/jpeg,image/webp,image/svg+xml' } });
    if (!res || !res.ok) return null;
    const type = String(res.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
    const mime = MIME_ALIASES[type];
    if (!mime) return null;                                          // unsupported / not an image (e.g. an HTML error page)
    const blob = await res.blob();
    if (!blob || !(blob.size > 0) || blob.size > MAX_LOGO_BYTES) return null;
    const result = await read(blob);
    const comma = typeof result === 'string' ? result.indexOf(';base64,') : -1;
    if (comma < 0) return null;
    const uri = `data:${mime};base64,${result.slice(comma + ';base64,'.length)}`;   // the type we verified, not whatever the reader guessed
    return isInvoiceLogoDataUri(uri) ? uri : null;
  } catch {
    return null;
  }
}

let cached = { url: null, uri: null };       // one entry: the logo URL is stable, so a re-opened invoice does not download it again

/** Looks up the configured logo and returns its data URI, or null. Never rejects. */
export async function loadInvoiceLogo(deps = {}) {
  try {
    return await withTimeout((async () => {
      const doFetch = deps.fetchImpl || fetch;
      const apiUrl = deps.apiUrl ?? urls.apiUrl;
      if (typeof apiUrl !== 'string' || !apiUrl) return null;
      const res = await doFetch(`${stripSlash(apiUrl)}/settings/public`, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res || !res.ok) return null;
      const body = await res.json();
      const url = resolveLogoUrl(body?.settings?.logo, deps.baseUrl ?? urls.baseUrl);
      if (!url) return null;
      if (cached.url === url && cached.uri) return cached.uri;
      const uri = await fetchLogoDataUri(url, deps);
      if (uri) cached = { url, uri };
      return uri;
    })(), deps.timeoutMs ?? TOTAL_TIMEOUT_MS);
  } catch {
    return null;
  }
}

export const __resetInvoiceLogoCache = () => { cached = { url: null, uri: null }; };
