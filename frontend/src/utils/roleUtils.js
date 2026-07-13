export const ADMIN_TIER_ROLES = ['admin', 'system_admin'];

export const isAdminRole = (role) => ADMIN_TIER_ROLES.includes(role);
