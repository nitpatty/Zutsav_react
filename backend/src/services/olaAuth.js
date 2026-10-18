/**
 * Ola Maps OAuth 2.0 — client-credentials token management.
 *
 * Flow (official docs: https://maps.olakrutrim.com/docs/auth):
 *   POST {baseUrl}/auth/v1/token   Content-Type: application/x-www-form-urlencoded
 *   grant_type=client_credentials&scope=openid&client_id=...&client_secret=...
 *   → { access_token }             (observed: no expires_in/token_type fields)
 *   Places calls then send:        Authorization: Bearer <access-token>
 *
 * Because the endpoint does not advertise an expiry, TTL defaults to
 * 30 minutes; a token is proactively re-minted 60s before `expiresAt`, and
 * any HTTP 401/403 from a Places call triggers exactly one forced re-mint
 * (see locationService) before the failure surfaces to the caller.
 *
 * Security rules enforced here — none of these are optional:
 *   - the access token, client id and client secret live in process memory
 *     only: never persisted to MongoDB, never logged, never returned by an
 *     HTTP endpoint, never put in a URL query string;
 *   - single-flight minting: concurrent callers share one in-flight token
 *     request instead of stampeding the token endpoint;
 *   - a failed/invalid mint is never cached as a success;
 *   - `redact()` strips token + credential material from any string a
 *     caller intends to log (defense in depth: callers also avoid logging
 *     request configs, this catches accidental interpolation).
 *
 * The HTTP client and clock are injectable so tests can exercise expiry,
 * single-flight and failure paths without real time or real credentials.
 */

const axios = require('axios');

const DEFAULT_TTL_MS = 30 * 60 * 1000;  // when the token response omits expires_in
const REFRESH_MARGIN_MS = 60 * 1000;    // re-mint this long before expiry

function createOlaAuth({ tokenUrl, timeoutMs = 8000, http, now, onEvent } = {}) {
  const client = http || axios;
  const clock = typeof now === 'function' ? now : Date.now;
  const emit = typeof onEvent === 'function' ? onEvent : () => {};

  let cache = null;   // { value, expiresAt, gen }
  let flight = null;  // { gen, promise } — resolves to token string | null
  let gen = 0;
  const secrets = new Set(); // values scrubbed by redact(); in-memory only

  function rememberSecrets(creds, token) {
    for (const s of [creds && creds.clientId, creds && creds.clientSecret, token]) {
      if (typeof s === 'string' && s.length >= 6) secrets.add(s);
    }
  }

  async function mint(creds) {
    rememberSecrets(creds);
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'openid',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }).toString();

    try {
      const res = await client.post(tokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        timeout: timeoutMs,
      });
      const data = res && res.data;
      const value = data && typeof data.access_token === 'string' && data.access_token
        ? data.access_token
        : null;
      if (!value) {
        emit({ type: 'token-invalid', at: clock(), message: 'token endpoint returned no access_token' });
        return null;
      }
      rememberSecrets(null, value);
      const expRaw = Number(data.expires_in);
      const ttl = Number.isFinite(expRaw) && expRaw > 0 ? expRaw * 1000 : DEFAULT_TTL_MS;
      const expiresAt = clock() + ttl;
      emit({ type: 'token-ok', at: clock(), expiresAt });
      return { value, expiresAt };
    } catch (err) {
      // Redacted before the event ever reaches a logger.
      const status = err && err.response && err.response.status ? err.response.status : null;
      emit({
        type: 'token-failed',
        at: clock(),
        status,
        message: redact((err && err.message) || 'unknown error'),
      });
      return null;
    }
  }

  /**
   * Return a valid bearer token, minting (or re-minting) it if needed.
   * Returns null when credentials are absent or acquisition failed — the
   * caller must treat null as "Ola unavailable", never as an empty token.
   *
   * @param {{clientId:string, clientSecret:string}} creds
   * @param {{invalidate?:boolean}} [opts] invalidate: drop the cached token
   *   first (used exactly once after a Places 401/403).
   */
  async function getAccessToken(creds, { invalidate = false } = {}) {
    if (!creds || !creds.clientId || !creds.clientSecret) return null;

    if (invalidate) { gen += 1; cache = null; }
    const myGen = gen;

    if (cache && cache.gen === myGen && clock() < cache.expiresAt - REFRESH_MARGIN_MS) {
      return cache.value;
    }
    if (flight && flight.gen === myGen) return flight.promise; // single-flight join

    const pending = { gen: myGen, promise: (async () => {
      const minted = await mint(creds);
      if (minted && gen === myGen) cache = { value: minted.value, expiresAt: minted.expiresAt, gen: myGen };
      return minted ? minted.value : null;
    })() };
    flight = pending;
    try {
      return await pending.promise;
    } finally {
      if (flight === pending) flight = null;
    }
  }

  /** Scrub token/credential material from a string destined for a log. */
  function redact(text) {
    let s = String(text == null ? '' : text);
    for (const secret of secrets) {
      if (secret) s = s.split(secret).join('[REDACTED]');
    }
    return s
      .replace(/(access_token"?\s*[:=]\s*"?)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
      .replace(/(client_secret=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(client_id=)[^&\s]+/gi, '$1[REDACTED]');
  }

  /** Secret-free status snapshot for health reporting and tests. */
  function describe() {
    const live = !!cache && clock() < cache.expiresAt - REFRESH_MARGIN_MS;
    return {
      tokenCached: live,
      tokenExpiresAt: cache ? new Date(cache.expiresAt).toISOString() : null,
      minting: !!flight,
    };
  }

  /** Test hook — drops all in-memory token state. */
  function reset() {
    cache = null;
    flight = null;
    gen = 0;
    secrets.clear();
  }

  return { getAccessToken, redact, describe, reset };
}

module.exports = { createOlaAuth, DEFAULT_TTL_MS, REFRESH_MARGIN_MS };
