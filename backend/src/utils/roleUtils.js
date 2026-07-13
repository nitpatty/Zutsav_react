const ADMIN_TIER_ROLES = ['admin', 'system_admin'];

const isAdminRole = (role) => ADMIN_TIER_ROLES.includes(role);

module.exports = { ADMIN_TIER_ROLES, isAdminRole };
