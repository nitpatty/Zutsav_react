// Single place that reads `process.env.EXPO_PUBLIC_*`. Expo inlines these at
// build time (see ../../eas.json for per-profile overrides and
// ../../DEPLOYMENT_CONFIGURATION.md for the full guide).
//
// Previously api.js, socket.js, and helpers.js each independently hardcoded
// a *different* fallback IP for the same backend (192.168.0.192, 192.168.1.100,
// and app.zutsav.com respectively) — meaning if EXPO_PUBLIC_API_URL was ever
// unset, the REST API, image loading, and websocket would silently point at
// three different hosts. This is now the one fallback.
const DEV_FALLBACK_HOST = 'http://192.168.1.100:5000';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || `${DEV_FALLBACK_HOST}/api`;
export const BASE_URL = process.env.EXPO_PUBLIC_BASE_URL || DEV_FALLBACK_HOST;
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://app.zutsav.com';
