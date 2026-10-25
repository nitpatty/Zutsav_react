const ADMIN_TIER_ROLES = ['admin', 'system_admin'];

const isAdminRole = (role) => ADMIN_TIER_ROLES.includes(role);

// Blog records intentionally use a three-role public author taxonomy. Keep
// privileged account types grouped as `admin` while their actual identity is
// retained by authorId (and publishing audit fields).
const toBlogAuthorRole = (role) => (isAdminRole(role) ? 'admin' : role);

module.exports = { ADMIN_TIER_ROLES, isAdminRole, toBlogAuthorRole };
