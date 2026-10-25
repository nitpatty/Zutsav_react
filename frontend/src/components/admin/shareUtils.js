// Clipboard / Web Share helpers for invoice share links. Pure browser APIs — the
// token itself is only ever handled as an opaque part of the URL string.

/** Absolute URL for a server-issued share path (e.g. /share/invoice/<token>). */
export function absoluteShareUrl(path, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  return `${origin}${path}`;
}

/** @returns {Promise<boolean>} whether the text reached the clipboard */
export async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path (insecure origin, denied permission, …) */ }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(area);
    return Boolean(ok);
  } catch {
    return false;
  }
}

/**
 * Use the native share sheet where available, otherwise copy the link.
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
 */
export async function shareLink({ title, text, url }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled'; // user dismissed the sheet
      // any other failure: fall back to copying below
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}
