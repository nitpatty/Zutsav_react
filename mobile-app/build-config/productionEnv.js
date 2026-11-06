'use strict';

// The backend endpoints a RELEASE bundle is allowed to be built for.
//
// Expo inlines process.env.EXPO_PUBLIC_* into the JavaScript bundle at build time, and src/config/env.js falls back to a LAN
// development host when one is unset. A Release APK must therefore never be bundled from whatever happens to be in the shell or
// in .env: scripts/gradle-bundle.js calls this check before the bundler starts and refuses the build when anything is missing
// or is not an externally reachable HTTPS endpoint. Only the shell environment is validated (Expo lets a shell variable win
// over every .env file), so a missing variable is an error, never a silent fall-back to .env.
//
// The mapping below comes from the production Nginx configuration (zutsav.com, TLS on 443):
//   EXPO_PUBLIC_API_URL   https://zutsav.com/api   location /api/ { proxy_pass http://localhost:5000; }  (no URI part: the /api prefix is kept)
//   EXPO_PUBLIC_BASE_URL  https://zutsav.com       same server block: uploads (location ^~ /uploads/) and Socket.IO (location /socket.io/) live here
//   EXPO_PUBLIC_WEB_URL   https://zutsav.com       same server block: the website (referral links are `${WEB_URL}/r/<token>`)
// The Socket.IO client connects to BASE_URL (src/config/urls.config.js) on its default path /socket.io, i.e. wss://zutsav.com/socket.io.

const API_URL = 'EXPO_PUBLIC_API_URL';
const BASE_URL = 'EXPO_PUBLIC_BASE_URL';
const WEB_URL = 'EXPO_PUBLIC_WEB_URL';
const REQUIRED = [API_URL, BASE_URL, WEB_URL];
const API_PATH = '/api';
const SOCKET_PATH = '/socket.io';

// Names that never resolve on the public internet, whatever they look like.
const RESERVED_TLDS = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'private', 'test', 'example', 'invalid', 'arpa'];

function hostProblem(host) {
  if (host.startsWith('[') || host.includes(':')) return 'is an IPv6 address; use the public DNS name';
  if (/^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return 'is an IP address (loopback, LAN and emulator addresses are not reachable by users); use the public DNS name';
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((l) => l === '')) return 'is not a fully qualified public DNS name';
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return 'does not end in a public top-level domain';
  if (RESERVED_TLDS.includes(tld)) return `uses the non-public domain suffix ".${tld}"`;
  return null;
}

// Returns { url } for a valid value, { problem } otherwise. Never echoes the raw value: it could carry credentials.
function parseEndpoint(name, raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') return { problem: `${name} is not set. A Release bundle needs the production endpoint in the build environment (it never falls back to .env or a development host).` };
  let url;
  try { url = new URL(value); } catch (e) { return { problem: `${name} is not a valid absolute URL.` }; }
  if (url.protocol !== 'https:') return { problem: `${name} must be an https:// URL (cleartext HTTP is blocked in Release builds).` };
  if (url.username || url.password) return { problem: `${name} must not contain credentials.` };
  if (url.port) return { problem: `${name} must use the default HTTPS port (443); production is served on 443.` };
  if (url.search || url.hash) return { problem: `${name} must not carry a query string or fragment.` };
  const why = hostProblem(url.hostname);
  if (why) return { problem: `${name}: host ${why}.` };
  return { url };
}

// Every reason the environment cannot be used for a Release bundle (empty when it can).
function productionEnvProblems(env = process.env) {
  const problems = [];
  const parsed = {};
  for (const name of REQUIRED) {
    const r = parseEndpoint(name, env[name]);
    if (r.problem) problems.push(r.problem); else parsed[name] = r.url;
  }
  if (parsed[API_URL] && parsed[API_URL].pathname !== API_PATH) {
    problems.push(`${API_URL} must end with exactly "${API_PATH}" (no trailing slash): Nginx forwards /api/ to the backend with the prefix kept, so a missing or doubled prefix breaks every request.`);
  }
  for (const name of [BASE_URL, WEB_URL]) {
    if (parsed[name] && parsed[name].pathname !== '/') problems.push(`${name} must be the site origin only, without a path.`);
  }
  if (parsed[API_URL] && parsed[BASE_URL] && parsed[API_URL].origin !== parsed[BASE_URL].origin) {
    problems.push(`${API_URL} and ${BASE_URL} must be the same origin: uploads and Socket.IO are served by the same backend as the API.`);
  }
  return problems;
}

// What a log may say about a valid environment: scheme, host and path only.
function describeProductionEnv(env = process.env) {
  const api = new URL(env[API_URL].trim());
  const base = new URL(env[BASE_URL].trim());
  const web = new URL(env[WEB_URL].trim());
  return {
    api: `${api.origin}${api.pathname}`,
    base: base.origin,
    web: web.origin,
    socket: `wss://${base.host}${SOCKET_PATH}`,
  };
}

module.exports = { API_PATH, API_URL, BASE_URL, REQUIRED, SOCKET_PATH, WEB_URL, describeProductionEnv, productionEnvProblems };
