// Footer-link helpers shared by the public footer and the admin form.
// The server re-validates everything; these rules mirror
// backend/src/utils/footerLinks.js so admins get immediate, accurate feedback and
// the footer never renders anything unsafe even if bad data slipped into settings.

export const MAX_LABEL = 60;
export const MAX_URL = 2048;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Mirrors backend/src/utils/footerLinks.js (the server is the authority and re-checks
// everything, including the file's real content). Any ordinary file type is accepted;
// executables, scripts, macro-enabled Office files and web pages are refused.
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'msi', 'msp', 'com', 'scr', 'pif', 'cpl', 'sys', 'drv', 'ocx', 'lnk', 'reg', 'inf', 'msc', 'gadget',
  'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa', 'app', 'appimage', 'elf', 'so', 'dylib',
  'bat', 'cmd', 'sh', 'bash', 'zsh', 'csh', 'ksh', 'ps1', 'psm1', 'vbs', 'vbe', 'vb', 'js', 'mjs', 'cjs', 'jse', 'wsf', 'wsh', 'hta',
  'jar', 'war', 'class', 'php', 'php3', 'php4', 'php5', 'php7', 'phtml', 'phar', 'asp', 'aspx', 'ashx', 'asmx', 'cshtml',
  'jsp', 'jspx', 'cgi', 'pl', 'py', 'pyc', 'rb', 'lua',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm', 'sldm',
  'html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml', 'chm',
]);
const WEB_PAGE_EXTENSIONS = ['html', 'htm', 'xhtml', 'shtml', 'mht', 'mhtml'];
const BLOCKED_NAMES = new Set(['.htaccess', '.htpasswd', 'web.config', '.user.ini']);

/** @returns {string} why the file name is refused, or '' when it is acceptable */
export function blockedNameReason(fileName) {
  const name = String(fileName || '').split(/[\\/]/).pop().trim();
  if (!name) return 'The file has no name';
  if (name.length > 255) return 'The file name is too long';
  if (BLOCKED_NAMES.has(name.toLowerCase())) return 'This file name is not allowed';
  const bad = name.toLowerCase().split('.').slice(1).find((seg) => BLOCKED_EXTENSIONS.has(seg));
  if (!bad) return '';
  return WEB_PAGE_EXTENSIONS.includes(bad)
    ? 'Web pages cannot be uploaded — use “Attach URL” for web pages'
    : `Executable, script and macro-enabled files (.${bad}) cannot be uploaded`;
}

/** Returns the normalized href for an absolute http(s) URL, otherwise null. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  // eslint-disable-next-line no-control-regex -- rejecting control characters/whitespace is the point
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

const normalizeLabelKey = (s) => String(s || '').replace(/\s+/g, ' ').trim().normalize('NFKC').toLowerCase();

/**
 * Footer entries ready to render: only safe destinations, no repeated ids, and
 * nothing that duplicates a fixed legal document already shown in the footer.
 */
export function prepareFooterLinks(links, fixedDocs = []) {
  const fixed = new Set((Array.isArray(fixedDocs) ? fixedDocs : []).map((d) => normalizeLabelKey(d && d.label)));
  const seen = new Set();
  const out = [];
  (Array.isArray(links) ? links : []).forEach((l) => {
    if (!l || typeof l.id !== 'string' || typeof l.label !== 'string' || seen.has(l.id)) return;
    if (!l.label.trim() || fixed.has(normalizeLabelKey(l.label))) return;
    if (l.linkType === 'url') {
      const href = safeHttpUrl(l.url);
      if (!href) return;
      seen.add(l.id);
      out.push({ id: l.id, label: l.label, linkType: 'url', href });
    } else if (l.linkType === 'document' && typeof l.path === 'string' && /^\/legal\/link\/[a-f0-9]{16}$/.test(l.path)) {
      seen.add(l.id);
      out.push({ id: l.id, label: l.label, linkType: 'document', href: l.path });
    }
  });
  return out;
}

/**
 * Validate the add/edit form. `existing` is the link being edited (or null).
 * @returns {Object<string,string>} field → message; empty when valid
 */
export function validateFooterLinkForm({ label, linkType, url, file }, existing = null) {
  const errors = {};
  const name = String(label || '').replace(/\s+/g, ' ').trim();
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(String(label || '').replace(/\s/g, ' '))) errors.label = 'Display name contains invalid characters';
  else if (!name) errors.label = 'Display name is required';
  else if (name.length > MAX_LABEL) errors.label = `At most ${MAX_LABEL} characters`;

  if (linkType !== 'url' && linkType !== 'document') {
    errors.linkType = 'Choose Attach URL or Upload Document';
    return errors;
  }
  if (linkType === 'url') {
    if (!String(url || '').trim()) errors.url = 'Enter the URL';
    else if (!safeHttpUrl(url)) errors.url = 'Enter a valid http:// or https:// URL';
  } else {
    const needsFile = !existing || existing.linkType !== 'document';
    if (!file) {
      if (needsFile) errors.file = 'Choose a file to upload';
    } else if (blockedNameReason(file.name)) {
      errors.file = blockedNameReason(file.name);
    } else if (file.size > MAX_FILE_SIZE) {
      errors.file = 'File must be 10 MB or smaller';
    } else if (file.size === 0) {
      errors.file = 'The file is empty';
    }
  }
  return errors;
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
