/**
 * Custom footer links — validation, content sniffing and the public DTO.
 * Pure helpers (no Express/DB) so every rule is unit-testable.
 */

const fs = require('fs');
const path = require('path');

const MAX_LINKS = 20;
const MAX_LABEL = 60;
const MAX_URL = 2048;
const ID_RE = /^[a-f0-9]{16}$/;

class FooterLinkError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'FooterLinkError';
    this.status = status;
    this.statusCode = status;
  }
}

/** Collapse whitespace; reject control characters and empty/over-long names. */
function normalizeLabel(raw) {
  if (typeof raw !== 'string') throw new FooterLinkError('Display name is required');
  if (/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/.test(raw)) {
    throw new FooterLinkError('Display name contains invalid or hidden control characters');
  }
  const label = raw.replace(/\s+/g, ' ').trim();
  if (!label) throw new FooterLinkError('Display name is required');
  if (label.length > MAX_LABEL) throw new FooterLinkError(`Display name must be at most ${MAX_LABEL} characters`);
  return label;
}

const labelKeyOf = (label) => label.normalize('NFKC').toLowerCase();

/**
 * Accept only absolute http(s) URLs. Rejects javascript:/data:/file:/etc.,
 * embedded credentials, whitespace and control characters. Returns the
 * normalized href.
 */
function validateUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new FooterLinkError('A URL is required for this link type');
  const value = raw.trim();
  if (value.length > MAX_URL) throw new FooterLinkError(`URL must be at most ${MAX_URL} characters`);
  if (/[\u0000- \u007f]/.test(value)) throw new FooterLinkError('URL must not contain spaces or control characters');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new FooterLinkError('Enter a valid URL, e.g. https://example.com/page');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new FooterLinkError('Only http:// and https:// URLs are allowed');
  }
  if (parsed.username || parsed.password) throw new FooterLinkError('URLs with embedded credentials are not allowed');
  if (!parsed.hostname) throw new FooterLinkError('Enter a valid URL, e.g. https://example.com/page');
  return parsed.href;
}

/** Strict boolean from JSON booleans or multipart "true"/"false" strings. */
function parseBool(value, field) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new FooterLinkError(`${field} must be true or false`);
}

/* ── Uploaded-file policy ─────────────────────────────────────────────────────
 * Footer links accept ordinary files of almost any type, so there is deliberately
 * no allowlist of extensions. Safety comes from four layers instead:
 *   1. BLOCKED: executable / script / macro-enabled / web-page formats are refused.
 *   2. Content is inspected: for every type we can verify, the real bytes (magic
 *      numbers) must match the extension; disguised executables (PE, ELF, Mach-O,
 *      shebang scripts) are refused whatever the extension says.
 *   3. The stored MIME type is derived server-side from the verified type — never
 *      from the browser. Unknown types are application/octet-stream.
 *   4. On the way out, only PDF and common raster images may render inline; every
 *      other type is a forced download (Content-Disposition: attachment, nosniff).
 * Files are stored under a server-generated name whose extension is one of the
 * KNOWN_TYPES keys (otherwise ".bin"), never an attacker-chosen one.            */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // keep in sync with uploadFooterFile in middleware/upload.js

const BLOCKED_EXTENSIONS = new Set([
  // native executables / installers / system files
  'exe', 'dll', 'msi', 'msp', 'com', 'scr', 'pif', 'cpl', 'sys', 'drv', 'ocx', 'lnk', 'reg', 'inf', 'msc', 'gadget',
  'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa', 'app', 'appimage', 'elf', 'so', 'dylib',
  // scripts and server-side code
  'bat', 'cmd', 'sh', 'bash', 'zsh', 'csh', 'ksh', 'ps1', 'psm1', 'vbs', 'vbe', 'vb', 'js', 'mjs', 'cjs', 'jse', 'wsf', 'wsh', 'hta',
  'jar', 'war', 'class', 'php', 'php3', 'php4', 'php5', 'php7', 'phtml', 'phar', 'asp', 'aspx', 'ashx', 'asmx', 'cshtml',
  'jsp', 'jspx', 'cgi', 'pl', 'py', 'pyc', 'rb', 'lua',
  // macro-enabled Office formats
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm', 'sldm',
  // web pages / active documents (use "Attach URL" for pages)
  'html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml', 'chm',
]);
const WEB_PAGE_EXTENSIONS = ['html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml'];
const BLOCKED_NAMES = new Set(['.htaccess', '.htpasswd', 'web.config', '.user.ini']);

/** @returns {string} a human-readable reason, or '' when the file name is acceptable */
function blockedNameReason(originalName) {
  const name = String(originalName || '').split(/[\\/]/).pop().trim();
  if (!name) return 'The file has no name';
  if (name.length > 255) return 'The file name is too long';
  if (BLOCKED_NAMES.has(name.toLowerCase())) return 'This file name is not allowed';
  // Every dot-separated segment counts, so "invoice.php.jpg" cannot slip through.
  const segments = name.toLowerCase().split('.').slice(1);
  const bad = segments.find((seg) => BLOCKED_EXTENSIONS.has(seg));
  if (bad) {
    return WEB_PAGE_EXTENSIONS.includes(bad)
      ? 'Web pages cannot be uploaded — use "Attach URL" for web pages'
      : `Executable, script and macro-enabled files (.${bad}) cannot be uploaded`;
  }
  return '';
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OOXML = (dir) => (buf) => buf.includes('[Content_Types].xml') && buf.includes(dir);
const ODF = (mime) => (buf) => buf.includes('mimetype') && buf.includes(mime);

// ext → { mime, sig: leading bytes | null, check: extra content test, text, inline }
const KNOWN_TYPES = {
  pdf: { mime: 'application/pdf', sig: Array.from(Buffer.from('%PDF-')), inline: true },
  png: { mime: 'image/png', sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], inline: true },
  jpg: { mime: 'image/jpeg', sig: [0xff, 0xd8, 0xff], inline: true },
  jpeg: { mime: 'image/jpeg', sig: [0xff, 0xd8, 0xff], inline: true },
  gif: { mime: 'image/gif', sig: Array.from(Buffer.from('GIF8')), inline: true },
  webp: { mime: 'image/webp', sig: Array.from(Buffer.from('RIFF')), check: (b) => b.subarray(8, 12).toString('latin1') === 'WEBP', inline: true },
  bmp: { mime: 'image/bmp', sig: Array.from(Buffer.from('BM')), inline: false },
  svg: { mime: 'image/svg+xml', sig: null, inline: false }, // can carry scripts: download only
  txt: { mime: 'text/plain', sig: null, text: true, inline: false },
  csv: { mime: 'text/csv', sig: null, text: true, inline: false },
  rtf: { mime: 'application/rtf', sig: Array.from(Buffer.from('{\\rtf')), inline: false },
  doc: { mime: 'application/msword', sig: OLE, inline: false },
  xls: { mime: 'application/vnd.ms-excel', sig: OLE, inline: false },
  ppt: { mime: 'application/vnd.ms-powerpoint', sig: OLE, inline: false },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: ZIP, check: OOXML('word/'), inline: false },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: ZIP, check: OOXML('xl/'), inline: false },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sig: ZIP, check: OOXML('ppt/'), inline: false },
  odt: { mime: 'application/vnd.oasis.opendocument.text', sig: ZIP, check: ODF('application/vnd.oasis.opendocument.text'), inline: false },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', sig: ZIP, check: ODF('application/vnd.oasis.opendocument.spreadsheet'), inline: false },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', sig: ZIP, check: ODF('application/vnd.oasis.opendocument.presentation'), inline: false },
  zip: { mime: 'application/zip', sig: ZIP, inline: false },
  gz: { mime: 'application/gzip', sig: [0x1f, 0x8b], inline: false },
  '7z': { mime: 'application/x-7z-compressed', sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], inline: false },
  rar: { mime: 'application/vnd.rar', sig: Array.from(Buffer.from('Rar!')), inline: false },
};
const INLINE_MIMES = new Set(Object.values(KNOWN_TYPES).filter((t) => t.inline).map((t) => t.mime));
const isKnown = (ext) => Object.prototype.hasOwnProperty.call(KNOWN_TYPES, ext);

const extensionOf = (name) => {
  const base = String(name || '').split(/[\\/]/).pop();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
};

/** Extension used for the on-disk name: a known-safe one, otherwise ".bin". */
const storedExtension = (name) => (isKnown(extensionOf(name)) ? `.${extensionOf(name)}` : '.bin');

const startsWithBytes = (buf, sig) => buf.length >= sig.length && sig.every((b, i) => buf[i] === b);

/** Native executables / scripts disguised under a harmless extension. */
function looksExecutable(buf) {
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true; // ELF
  if (buf.length >= 4) {
    const w = buf.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(w)) return true; // Mach-O / Java class
  }
  if (buf.length >= 2 && buf[0] === 0x23 && buf[1] === 0x21) return true; // "#!" script
  if (buf.length >= 0x40 && buf[0] === 0x4d && buf[1] === 0x5a) { // "MZ" + a PE header
    const pe = buf.readUInt32LE(0x3c);
    if (pe + 4 <= buf.length && buf.subarray(pe, pe + 4).toString('latin1') === 'PE\0\0') return true;
  }
  return false;
}

/**
 * Inspect an uploaded file (already size-limited by multer).
 * @returns {{mimeType:string, inline:boolean}} server-derived type and inline permission
 * @throws {FooterLinkError} when the name is blocked or the bytes do not match / are unsafe
 */
function inspectUpload(filePath, originalName) {
  const reason = blockedNameReason(originalName);
  if (reason) throw new FooterLinkError(reason);

  const buf = fs.readFileSync(filePath);
  if (buf.length === 0) throw new FooterLinkError('The uploaded file is empty');
  if (buf.length > MAX_FILE_SIZE) throw new FooterLinkError('File must be 10 MB or smaller');
  if (looksExecutable(buf)) throw new FooterLinkError('Executable files cannot be uploaded, whatever their extension');

  const ext = extensionOf(originalName);
  if (!isKnown(ext)) return { mimeType: 'application/octet-stream', inline: false };

  const type = KNOWN_TYPES[ext];
  if (type.text) {
    if (buf.subarray(0, 8192).includes(0)) throw new FooterLinkError(`The file content does not look like a .${ext} text file`);
  } else if (type.sig && (!startsWithBytes(buf, type.sig) || (type.check && !type.check(buf)))) {
    throw new FooterLinkError(`The file content does not match a valid .${ext} file`);
  }
  return { mimeType: type.mime, inline: type.inline };
}

/** What the public viewer should do with a stored MIME type. */
function kindOf(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (INLINE_MIMES.has(mimeType)) return 'image';
  return 'download';
}

/**
 * multer/busboy decode multipart file names as Latin-1, but browsers send UTF-8, so
 * "नमस्ते.pdf" arrives as mojibake. Re-decode when the bytes are valid UTF-8.
 */
function decodeUploadName(name) {
  const raw = String(name == null ? '' : name);
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}

/** Header-safe filename for Content-Disposition. */
function safeFileName(name) {
  const cleaned = String(name || 'document').replace(/[\u0000-\u001f\u007f"\\/;:*?<>|]+/g, '_').trim().slice(0, 120);
  return cleaned || 'document';
}

/** RFC 6266 header value: ASCII fallback plus a UTF-8 `filename*`; never contains quotes or CR/LF. */
function contentDisposition(type, name) {
  const clean = safeFileName(name);
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_').replace(/%/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/* ── DTOs ─────────────────────────────────────────────────────────────────── */

const docViewPath = (id) => `/legal/link/${id}`;

/** Customer-safe footer entries: enabled only, ordered, allowlisted fields. */
function toPublicFooterLinks(links) {
  const list = Array.isArray(links) ? links : [];
  return list
    .map((l, index) => ({ l, index }))
    .filter(({ l }) => l && l.enabled !== false && ID_RE.test(String(l.id || '')))
    .sort((a, b) => ((a.l.order || 0) - (b.l.order || 0)) || (a.index - b.index))
    .map(({ l }) => {
      if (l.linkType === 'url') {
        try { return { id: l.id, label: l.label, linkType: 'url', url: validateUrl(l.url) }; } catch { return null; }
      }
      if (l.linkType === 'document' && l.document) {
        return { id: l.id, label: l.label, linkType: 'document', path: docViewPath(l.id) };
      }
      return null;
    })
    .filter(Boolean);
}

/** Admin view of a link — never includes storage paths or stored file names. */
function toAdminLink(l, index = 0) {
  return {
    id: l.id,
    label: l.label,
    linkType: l.linkType,
    url: l.linkType === 'url' ? l.url : '',
    enabled: l.enabled !== false,
    order: l.order ?? index,
    updatedAt: l.updatedAt || null,
    document: l.linkType === 'document' && l.document
      ? {
          originalName: l.document.originalName,
          mimeType: l.document.mimeType,
          size: l.document.size,
          uploadedByName: l.document.uploadedByName || '',
          uploadedAt: l.document.uploadedAt || null,
        }
      : null,
    publicPath: l.linkType === 'document' ? docViewPath(l.id) : '',
  };
}

module.exports = {
  MAX_LINKS, MAX_LABEL, ID_RE, FooterLinkError,
  normalizeLabel, labelKeyOf, validateUrl, parseBool,
  decodeUploadName, contentDisposition, inspectUpload, blockedNameReason, storedExtension, kindOf, INLINE_MIMES, MAX_FILE_SIZE, BLOCKED_EXTENSIONS, safeFileName, toPublicFooterLinks, toAdminLink, docViewPath,
};
