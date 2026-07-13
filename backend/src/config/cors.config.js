const { readEnv } = require('./env');
const { clientUrl, adminUrl } = require('./urls.config');

function parseList(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// ADDITIONAL_CORS_ORIGINS covers any extra domain (staging, a second brand,
// a white-label subdomain, etc.) beyond the primary client/admin URLs.
const additionalOrigins = parseList(readEnv('ADDITIONAL_CORS_ORIGINS'));

// Static, env-derived default — always available synchronously, used as the
// bootstrap fallback before the DB is reachable and if the Deployment tab
// (System Configuration Center) hasn't set an override.
const allowedOrigins = [...new Set([clientUrl, adminUrl, ...additionalOrigins])];

/**
 * DB-aware allowed-origins resolver. Deployment-tab saves (deployWebsiteUrl /
 * deployAdminUrl) take effect here immediately — settingsService's 5-minute
 * cache is invalidated on every Config Center save, so this reflects a
 * change well before the cache would naturally expire. Falls back to the
 * static list above if nothing is set in the DB, so behavior is unchanged
 * on a fresh install with no Config Center saves yet.
 */
async function getAllowedOrigins() {
  try {
    const settingsService = require('../utils/settingsService');
    const [dbWebsiteUrl, dbAdminUrl] = await Promise.all([
      settingsService.get('deployWebsiteUrl'),
      settingsService.get('deployAdminUrl'),
    ]);
    return [...new Set([clientUrl, adminUrl, dbWebsiteUrl, dbAdminUrl, ...additionalOrigins].filter(Boolean))];
  } catch {
    return allowedOrigins;
  }
}

module.exports = { allowedOrigins, getAllowedOrigins };
