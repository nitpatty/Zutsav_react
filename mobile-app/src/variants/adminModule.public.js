// Public-app stand-in for ./adminModule.js: same exports, no Admin code.
// It must never import an Admin screen, navigator, drawer or any Admin-only dependency (a Jest guard enforces this),
// because the point of this file is that none of that reaches the public bundle.
export const AdminNavigator = null;
export const ADMIN_AVAILABLE = false;
