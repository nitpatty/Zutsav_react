import { urls } from '../config';

/**
 * Legal documents & admin-configured footer links (F-04) — pure mapping/validation, no I/O.
 *
 * Public contracts (no authentication; backend/src):
 *   GET /api/documents                 → { documents: [{ documentType, label, exists, originalName, mimeType, size,
 *                                          updatedAt, viewUrl: '/api/documents/<type>/view' | '' }] }   (always all 5 types)
 *   GET /api/documents/:type           → { document: <same shape> }
 *   GET /api/documents/:type/view      → the file (PDF/DOC/DOCX), Content-Disposition: inline
 *   GET /api/settings/public           → { settings: { footerLinks: [
 *                                          { id, label, linkType: 'url', url } |
 *                                          { id, label, linkType: 'document', path: '/legal/link/<id>' } ] } }
 *                                        (enabled links only, already ordered; `path` is a WEBSITE route)
 *   GET /api/footer-links/:id          → { document: { exists:false } | { exists:true, label, mimeType, kind, fileName, size,
 *                                          updatedAt, viewUrl, downloadUrl } }   kind: 'pdf' | 'image' | 'download'
 *   GET /api/footer-links/:id/view     → inline only for PDF/PNG/JPEG/GIF/WebP, otherwise an attachment
 *   GET /api/footer-links/:id/download → always an attachment
 *
 * Everything that comes from the server is treated as untrusted: only the documented route shapes are ever
 * opened, ids must match the backend's id format, and admin-entered URLs are re-validated (http/https only).
 */

// The five fixed documents the backend can serve (backend/src/controllers/legalDocument.controller.js).
// Titles are NOT hard-coded here — they come from the response; this set only whitelists the route.
export const LEGAL_DOCUMENT_TYPES = ['privacy', 'terms', 'refund-policy', 'about-us', 'vision'];

const LINK_ID_RE = /^[a-f0-9]{16}$/;
const MAX_URL = 2048;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // the backend refuses larger uploads
const INLINE_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export const isValidLinkId = (id) => typeof id === 'string' && LINK_ID_RE.test(id);
export const isLegalDocumentType = (type) => LEGAL_DOCUMENT_TYPES.includes(type);

/**
 * Normalised href for an absolute http(s) URL, otherwise null — same rules as the website
 * (frontend/src/utils/footerLinks.js safeHttpUrl) and the server: no other schemes, no embedded
 * credentials, no whitespace/control characters, bounded length, a hostname.
 */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  // eslint-disable-next-line no-control-regex
  if (!v || v.length > MAX_URL || /[\u0000- \u007f]/.test(v)) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

const labelKey = (s) => String(s || '').replace(/\s+/g, ' ').trim().normalize('NFKC').toLowerCase();
const cleanText = (v, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Display-safe file name: no path segments or control characters. */
export const safeDisplayName = (name) => cleanText(String(name || '').split(/[\\/]/).pop(), 255);

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Fixed documents ready to show: only the whitelisted types the backend reports as PUBLISHED (`exists`), in the
 * server's order, with the server's label and the ONE documented view route for that type.
 */
export function mapLegalDocuments(body) {
  const list = Array.isArray(body?.documents) ? body.documents : [];
  const seen = new Set();
  const out = [];
  list.forEach((d) => {
    if (!d || typeof d !== 'object' || d.exists !== true) return;
    const type = d.documentType;
    if (!isLegalDocumentType(type) || seen.has(type)) return;
    const label = cleanText(d.label, 120);
    if (!label || d.viewUrl !== `/api/documents/${type}/view`) return;
    seen.add(type);
    out.push({
      type, label,
      mimeType: cleanText(d.mimeType, 120), fileName: safeDisplayName(d.originalName),
      size: Number(d.size) || 0, updatedAt: d.updatedAt || null,
    });
  });
  return out;
}

/**
 * Admin-configured links from GET /api/settings/public. Mirrors the website's prepareFooterLinks: unique valid ids,
 * a non-empty label, nothing that duplicates a published fixed document's title, URL entries only with a safe
 * http(s) URL, document entries only with the documented `/legal/link/<id>` path for their own id.
 * The server already filtered disabled links and ordered them — that order is kept.
 */
export function prepareFooterLinks(links, fixedDocs = []) {
  const fixed = new Set((Array.isArray(fixedDocs) ? fixedDocs : []).map((d) => labelKey(d && d.label)));
  const seen = new Set();
  const out = [];
  (Array.isArray(links) ? links : []).forEach((l) => {
    if (!l || typeof l !== 'object' || !isValidLinkId(l.id) || seen.has(l.id)) return;
    const label = cleanText(l.label, 120);
    if (!label || fixed.has(labelKey(label))) return;
    if (l.linkType === 'url') {
      const href = safeHttpUrl(l.url);
      if (!href) return;
      seen.add(l.id);
      out.push({ id: l.id, label, linkType: 'url', href });
    } else if (l.linkType === 'document' && l.path === `/legal/link/${l.id}`) {
      seen.add(l.id);
      out.push({ id: l.id, label, linkType: 'document' });
    }
  });
  return out;
}

/** Only the documented file routes are ever opened; anything else the server might return is refused. */
export function isAllowedFilePath(path) {
  if (typeof path !== 'string') return false;
  if (/^\/api\/footer-links\/[a-f0-9]{16}\/(view|download)$/.test(path)) return true;
  const m = path.match(/^\/api\/documents\/([a-z-]+)\/view$/);
  return !!m && isLegalDocumentType(m[1]);
}

/** Absolute URL for a documented file route (null when the path is not one of them). */
export function fileUrl(path) {
  return isAllowedFilePath(path) ? `${urls.baseUrl}${path}` : null;
}

/**
 * Describe a fixed document (GET /api/documents/:type) for the viewer.
 * Returns null when it is not (or no longer) published.
 */
export function describeFixedDocument(type, body) {
  const d = body?.document;
  if (!isLegalDocumentType(type) || !d || d.exists !== true || d.viewUrl !== `/api/documents/${type}/view`) return null;
  const mimeType = cleanText(d.mimeType, 120);
  const url = fileUrl(d.viewUrl);
  if (!url) return null;
  return {
    title: cleanText(d.label, 120) || 'Document', fileName: safeDisplayName(d.originalName), mimeType,
    size: Number(d.size) || 0, updatedAt: d.updatedAt || null,
    mode: 'external',                 // no in-app PDF/Office renderer: hand off to the device's viewer/browser
    isPdf: mimeType === 'application/pdf',
    openUrl: url, downloadUrl: url,   // the documented route is the only one (inline for PDF; Office files download)
  };
}

/**
 * Describe an admin-uploaded file (GET /api/footer-links/:id) using the SERVER's `kind` decision.
 *   image    → shown in the app (only if the MIME is one of the safe raster types)
 *   pdf      → opened in the device's PDF viewer/browser, with a download option
 *   download → offered as a download only (never rendered)
 * Anything missing, deleted/disabled (`exists:false`), oversized or unrecognised → null (shown as unavailable).
 */
export function describeFooterFile(id, body) {
  const d = body?.document;
  if (!isValidLinkId(id) || !d || d.exists !== true) return null;
  if (!['pdf', 'image', 'download'].includes(d.kind)) return null;
  const view = fileUrl(d.viewUrl);
  const download = fileUrl(d.downloadUrl);
  if (!view || !download || d.viewUrl !== `/api/footer-links/${id}/view` || d.downloadUrl !== `/api/footer-links/${id}/download`) return null;
  const size = Number(d.size) || 0;
  if (size > MAX_FILE_SIZE) return null;
  const mimeType = cleanText(d.mimeType, 120);
  const showImage = d.kind === 'image' && INLINE_IMAGE_MIMES.includes(mimeType);
  return {
    title: cleanText(d.label, 120) || 'File', fileName: safeDisplayName(d.fileName), mimeType, size,
    updatedAt: d.updatedAt || null,
    mode: showImage ? 'image' : (d.kind === 'pdf' ? 'pdf' : 'download'),
    imageUrl: showImage ? view : null,
    openUrl: d.kind === 'pdf' ? view : null,
    downloadUrl: download,
  };
}
