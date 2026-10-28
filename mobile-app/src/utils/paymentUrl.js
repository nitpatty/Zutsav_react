/**
 * Validation of the payment-page URL the backend returns (`redirectUrl`) before the app hands it to the device.
 *
 * Rules (all must hold):
 *  - a string, ≤ 2048 characters, with no whitespace, control characters or backslashes;
 *  - scheme exactly `https` — `http`, custom/app schemes, `javascript:`, `intent:`, `file:`, `data:` … are refused;
 *  - no embedded credentials (`user:pass@host`) and no port other than 443;
 *  - a real DNS host name: dot-separated labels ending in an alphabetic TLD. That refuses `localhost`, single-label
 *    names, IPv4/IPv6 literals and numeric hosts.
 *
 * Host allow-list: NOT enforced by default. The project establishes PhonePe's *API* hosts (api.phonepe.com,
 * api-preprod.phonepe.com — backend/src/config/integrations.config.js) but nothing in the repository establishes the
 * host of the hosted *pay page* that `redirectUrl` points to, and in mock mode (development only) the backend returns a
 * website URL instead. Guessing a list would risk blocking real payments, so the owner must supply the confirmed hosts;
 * pass them as `allowedHosts` (exact host or parent domain) to enforce them. Never accept a client-provided callback
 * URL or success flag as evidence of payment — this only decides whether the app may OPEN the link.
 *
 * The returned `url` is the trimmed input, unchanged (no re-serialisation), so the hand-off is exactly what the server sent.
 * Callers must not log it (it can carry a payment token in its path/query).
 */
const MAX_URL_LENGTH = 2048;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function parsePaymentRedirectUrl(raw, { allowedHosts } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  if (typeof raw !== 'string') return fail('not_a_string');
  const url = raw.trim();
  if (!url) return fail('empty');
  if (url.length > MAX_URL_LENGTH) return fail('too_long');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f\\]/.test(url)) return fail('invalid_characters');

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (!scheme) return fail('malformed');
  const lower = scheme[1].toLowerCase();
  if (lower === 'http') return fail('insecure');
  if (lower !== 'https') return fail('unsupported_scheme');

  const m = /^https:\/\/([^/?#]*)([/?#].*)?$/i.exec(url);
  if (!m || !m[1]) return fail('malformed');
  const authority = m[1];
  if (authority.includes('@')) return fail('credentials');
  if (authority.startsWith('[')) return fail('host'); // IPv6 literal

  const colon = authority.lastIndexOf(':');
  const host = colon === -1 ? authority : authority.slice(0, colon);
  const port = colon === -1 ? '' : authority.slice(colon + 1);
  if (port !== '' && port !== '443') return fail('port');
  if (!HOST_RE.test(host)) return fail('host');

  if (Array.isArray(allowedHosts) && allowedHosts.length > 0) {
    const h = host.toLowerCase();
    const permitted = allowedHosts.some((a) => {
      const allowed = String(a).toLowerCase();
      return h === allowed || h.endsWith(`.${allowed}`);
    });
    if (!permitted) return fail('host_not_allowed');
  }
  return { ok: true, url };
}

export const isSafePaymentUrl = (raw, options) => parsePaymentRedirectUrl(raw, options).ok;
