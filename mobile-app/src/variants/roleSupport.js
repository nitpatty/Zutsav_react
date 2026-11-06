// Which account roles can THIS build serve? One decision, used by sign-in (store/authStore), session restore
// (authStore.hydrate) and root routing (navigation/RootNavigator), so they can never disagree.
//
//   user, pandit          → always supported
//   admin, system_admin   → supported only when the Admin module is present (variants/adminModule)
//   anything else         → never supported (an unknown role must not be served by the User app)
//
// This is a client-side experience rule, not security: the backend authorizes every request on the role it holds.

export const ROLE_NOT_SUPPORTED = 'ROLE_NOT_SUPPORTED';

export const ADMIN_ACCOUNT_REJECTED_MESSAGE =
  'Sorry, this account is registered as an Admin account. Please use the Zutsav Admin app to sign in.';
export const UNSUPPORTED_ROLE_MESSAGE = 'Sorry, this account type is not supported in this app.';

const ADMIN_TIER_ROLES = ['admin', 'system_admin'];

export const isAdminTierRole = (role) => ADMIN_TIER_ROLES.includes(role);

// Resolved on first use, not at import time: the Admin module pulls in the whole Admin screen tree (which itself uses
// the auth store), and the plain user/pandit paths below never need it.
const adminModule = () => require('./adminModule');

/**
 * @returns {{ supported: true, kind: 'user' | 'pandit' | 'admin' } | { supported: false, reason: 'admin' | 'unknown' }}
 */
export function getRoleSupport(role) {
  if (role === 'user' || role === 'pandit') return { supported: true, kind: role };
  if (isAdminTierRole(role)) {
    const m = adminModule();
    if (m.ADMIN_AVAILABLE === true && m.AdminNavigator) return { supported: true, kind: 'admin' };
    return { supported: false, reason: 'admin' };
  }
  return { supported: false, reason: 'unknown' };
}

export const isRoleSupported = (role) => getRoleSupport(role).supported;

export const unsupportedRoleMessage = (reason) =>
  (reason === 'admin' ? ADMIN_ACCOUNT_REJECTED_MESSAGE : UNSUPPORTED_ROLE_MESSAGE);

// The error a rejected sign-in throws. A plain Error with a `code` (not a subclass) so it survives any transpilation;
// utils/apiMessage shows its message as-is, so every sign-in screen reports it the same way.
export function roleRejection(reason) {
  const err = new Error(unsupportedRoleMessage(reason));
  err.code = ROLE_NOT_SUPPORTED;
  err.reason = reason;
  return err;
}
