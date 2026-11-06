// Shared fixtures for the role-gate suites (authRoleGate.public.test.js / authRoleGate.private.test.js).
// Everything is synthetic: the transport is replaced, no request leaves the process, tokens are made-up strings.
import api from '../../api/axios';

export const TOKENS = {
  user: 'synthetic.token.user',
  pandit: 'synthetic.token.pandit',
  admin: 'synthetic.token.admin',
  system_admin: 'synthetic.token.sysadmin',
};

export const accountFor = (role) => ({ _id: `id_${role}`, name: `Test ${role}`, email: `${role}@example.invalid`, role });

export const PUBLIC_ADMIN_MESSAGE = 'Sorry, this account is registered as an Admin account. Please use the Zutsav Admin app to sign in.';

const networkError = (config) => Object.assign(new Error('Network Error'), { config, isAxiosError: true, code: 'ERR_NETWORK' });
const httpError = (config, status) => Object.assign(new Error(`Request failed with status code ${status}`), {
  config, isAxiosError: true, response: { status, data: {}, headers: {}, config },
});

/**
 * Installs a fake server on the real axios client (interceptors included) and records every request.
 *   login:  what the sign-in endpoints answer with ({ token, user, deletionPending? })
 *   logout: 'ok' | 'network' | 'http500' - how POST /auth/logout behaves
 */
export function installServer() {
  const server = { calls: [], login: undefined, logout: 'ok' };
  api.defaults.adapter = async (config) => {
    const body = config.data ? JSON.parse(config.data) : undefined;
    server.calls.push({ method: config.method, url: config.url, auth: config.headers.Authorization, body });
    const ok = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/auth/login' || config.url === '/auth/login/otp/verify') return ok({ success: true, ...server.login });
    if (config.url === '/auth/logout') {
      if (server.logout === 'network') throw networkError(config);
      if (server.logout === 'http500') throw httpError(config, 500);
      return ok({ success: true });
    }
    return ok({});
  };
  server.callsTo = (url) => server.calls.filter((c) => c.url === url);
  return server;
}

export const settle = async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0)); };
