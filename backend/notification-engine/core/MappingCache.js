/**
 * In-process TTL cache of enabled NotificationMapping records per event.
 *
 * At 10,000+ mappings, hitting the DB on every single emit() would be
 * wasteful — mappings change rarely (admin edits), so a short TTL cache
 * with explicit invalidation on write keeps emit() cheap without ever
 * serving stale-for-long data.
 */

const NotificationMapping = require('../../src/models/NotificationMapping');

const TTL_MS = 30 * 1000; // 30s — long enough to matter under load, short enough that a missed invalidation self-heals fast

const _cache = new Map(); // eventName -> { mappings, expiresAt }

async function getEnabledMappings(eventName) {
  const hit = _cache.get(eventName);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.mappings;
  }

  const mappings = await NotificationMapping.find({ eventName, enabled: true })
    .sort({ priority: -1 })
    .lean();

  _cache.set(eventName, { mappings, expiresAt: Date.now() + TTL_MS });
  return mappings;
}

/** Call after any NotificationMapping create/update/delete/toggle. */
function invalidate(eventName) {
  if (eventName) {
    _cache.delete(eventName);
  } else {
    _cache.clear();
  }
}

module.exports = { getEnabledMappings, invalidate, TTL_MS };
