/**
 * Generic AI-translation cache engine.
 *
 * English is always the source of truth. Any content type registered in
 * config/translatable.config.js can be translated via getTranslation() with
 * zero new engine code — only a config entry.
 *
 * Flow: cache hit -> return cached. Cache miss/stale -> acquire a Mongo-based
 * single-flight lock (see Translation model), translate via Groq, cache the
 * result. A concurrent request for the same (entityType, entityId, language)
 * waits briefly for the in-flight result instead of triggering a second Groq
 * call. If Groq is unavailable or the wait times out, falls back to the
 * English source — never throws, never blocks the page.
 */

const Translation = require('../models/Translation');
const translatable = require('../config/translatable.config');
const { translateText } = require('../utils/groq');
const { translateHtml, translateStringArray } = require('../utils/htmlTranslate');

const WAIT_POLL_MS = 700;
const WAIT_MAX_ATTEMPTS = 8; // ~5.6s max wait for a concurrent in-flight translation

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function englishFields(source, fieldConfig) {
  const out = {};
  for (const key of Object.keys(fieldConfig)) out[key] = source[key];
  return out;
}

async function translateField(sourceValue, fieldDef, language) {
  if (sourceValue === undefined || sourceValue === null) return sourceValue;

  const groqTranslate = (batched) => translateText(batched, language, { maxTokens: fieldDef.maxTokens });

  switch (fieldDef.type) {
    case 'text':
      if (!String(sourceValue).trim()) return sourceValue;
      return translateText(sourceValue, language, { maxTokens: fieldDef.maxTokens });

    case 'html':
      return translateHtml(sourceValue, groqTranslate);

    case 'string[]':
      return translateStringArray(sourceValue, groqTranslate);

    case 'object[]': {
      // Array of objects with a per-key type map, e.g. FAQs: [{question, answer}].
      // No current Blog field uses this, but the engine supports it now so
      // Phase-2 entity types (Pooja faqs, etc.) are config-only additions.
      const shape = fieldDef.shape || {};
      return Promise.all(
        (sourceValue || []).map(async (item) => {
          const translatedItem = {};
          for (const key of Object.keys(shape)) {
            translatedItem[key] = await translateField(item[key], { type: shape[key], maxTokens: fieldDef.maxTokens }, language);
          }
          return { ...item, ...translatedItem };
        })
      );
    }

    default:
      return sourceValue;
  }
}

async function generateTranslation(entityType, entityId, language, source, cfg, sourceVersion) {
  const startedAt = Date.now();
  try {
    const fieldEntries = Object.keys(cfg.fields);
    const translatedValues = await Promise.all(
      fieldEntries.map((key) => translateField(source[key], cfg.fields[key], language))
    );
    const translatedFields = {};
    fieldEntries.forEach((key, i) => { translatedFields[key] = translatedValues[i]; });

    await Translation.findOneAndUpdate(
      { entityType, entityId, language },
      {
        $set: {
          status: 'ready',
          translatedFields,
          version: sourceVersion,
          translatedAt: new Date(),
          translatedBy: 'groq',
          lastError: '',
        },
        $inc: { attempts: 0 },
      }
    );

    console.log(`[Translation] ${entityType}/${entityId}/${language} -> generated in ${Date.now() - startedAt}ms`);
    return translatedFields;
  } catch (err) {
    await Translation.findOneAndUpdate(
      { entityType, entityId, language },
      { $set: { status: 'failed', lastError: err.message }, $inc: { attempts: 1 } }
    );
    console.error(`[Translation] ${entityType}/${entityId}/${language} -> failed after ${Date.now() - startedAt}ms:`, err.message);
    throw err;
  }
}

// Atomically claims the right to (re)generate a translation. Returns true if
// this call is the "owner" and should proceed to call Groq; false if another
// request already owns it (caller should wait instead).
async function acquireLock(entityType, entityId, language, sourceVersion) {
  // Case 1: an existing 'ready' doc is stale -> flip it to 'pending'.
  const flipped = await Translation.findOneAndUpdate(
    { entityType, entityId, language, status: 'ready', version: { $lt: sourceVersion } },
    { $set: { status: 'pending', lockedAt: new Date() } }
  );
  if (flipped) return true;

  // Case 2: a 'failed' doc can be retried the same way.
  const retried = await Translation.findOneAndUpdate(
    { entityType, entityId, language, status: 'failed' },
    { $set: { status: 'pending', lockedAt: new Date() } }
  );
  if (retried) return true;

  // Case 3: no doc exists yet -> insert one as 'pending'. If a concurrent
  // request already holds the 'pending' lock, the unique index raises
  // E11000 here and this request becomes a waiter instead.
  try {
    await Translation.create({ entityType, entityId, language, status: 'pending', lockedAt: new Date() });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

async function waitForResult(entityType, entityId, language) {
  for (let i = 0; i < WAIT_MAX_ATTEMPTS; i++) {
    await sleep(WAIT_POLL_MS);
    const doc = await Translation.findOne({ entityType, entityId, language }).lean();
    if (doc && doc.status === 'ready') return doc.translatedFields;
    if (doc && doc.status === 'failed') return null;
  }
  return null; // gave up waiting — caller falls back to English
}

/**
 * @param {string} entityType - key in config/translatable.config.js
 * @param {string} entityId
 * @param {string} language - ISO 639-1 code; 'en' or falsy short-circuits to source fields
 * @returns {Promise<{ fields: object, language: string, source: 'source-en'|'cache'|'generated'|'fallback-english' }>}
 */
async function getTranslation(entityType, entityId, language) {
  const cfg = translatable[entityType];
  if (!cfg) throw new Error(`Unknown translatable entityType: ${entityType}`);

  const Model = cfg.model();
  const source = await Model.findById(entityId).lean();
  if (!source) throw new Error(`${entityType} ${entityId} not found`);

  if (!language || language === 'en') {
    return { fields: englishFields(source, cfg.fields), language: 'en', source: 'source-en' };
  }

  const sourceVersion = source[cfg.versionField] || 1;
  const existing = await Translation.findOne({ entityType, entityId, language }).lean();

  if (existing && existing.status === 'ready' && existing.version >= sourceVersion) {
    Translation.updateOne({ _id: existing._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    console.log(`[Translation] ${entityType}/${entityId}/${language} -> cache hit`);
    return { fields: existing.translatedFields, language, source: 'cache' };
  }

  const isOwner = await acquireLock(entityType, entityId, language, sourceVersion);

  if (isOwner) {
    try {
      const translatedFields = await generateTranslation(entityType, entityId, language, source, cfg, sourceVersion);
      return { fields: translatedFields, language, source: 'generated' };
    } catch {
      return { fields: englishFields(source, cfg.fields), language, source: 'fallback-english' };
    }
  }

  console.log(`[Translation] ${entityType}/${entityId}/${language} -> waiting on in-flight translation`);
  const waited = await waitForResult(entityType, entityId, language);
  if (waited) return { fields: waited, language, source: 'generated' };
  return { fields: englishFields(source, cfg.fields), language, source: 'fallback-english' };
}

/**
 * Batched variant of getTranslation() for list endpoints — one bulk cache
 * read instead of N, so a page of 12-20 cards doesn't cost 12-20 round
 * trips. Reuses the exact same lock/generate/fallback primitives above, just
 * orchestrated across many ids at once. `docs` are already-fetched .lean()
 * source documents the list controller has in hand (no extra Model.find()).
 *
 * @param {string} entityType
 * @param {Array<object>} docs - source documents, each with `_id` and the
 *   translatable fields already present (as returned by the list query)
 * @param {string} language
 * @returns {Promise<{ [entityId: string]: object }>} translated fields per id;
 *   entries are omitted for docs that failed to translate AND have no cache
 *   (caller should keep the English fields for those, same as any other fallback)
 */
async function getTranslationsForDocs(entityType, docs, language) {
  if (!language || language === 'en' || !docs || !docs.length) return {};

  const cfg = translatable[entityType];
  if (!cfg) throw new Error(`Unknown translatable entityType: ${entityType}`);

  const ids = docs.map((d) => d._id);
  const existingDocs = await Translation.find({ entityType, entityId: { $in: ids }, language }).lean();
  const existingMap = new Map(existingDocs.map((t) => [String(t.entityId), t]));

  const results = {};
  const misses = [];

  for (const source of docs) {
    const idStr = String(source._id);
    const sourceVersion = source[cfg.versionField] || 1;
    const cached = existingMap.get(idStr);

    if (cached && cached.status === 'ready' && cached.version >= sourceVersion) {
      results[idStr] = cached.translatedFields;
      Translation.updateOne({ _id: cached._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
    } else {
      misses.push({ idStr, source, sourceVersion });
    }
  }

  if (misses.length) {
    const Model = cfg.model();
    await Promise.all(misses.map(async ({ idStr, source, sourceVersion }) => {
      const isOwner = await acquireLock(entityType, source._id, language, sourceVersion);
      if (isOwner) {
        try {
          // The list query that produced `source` may have excluded heavy
          // fields (e.g. Blog's `getBlogs` does `.select('-content')`) —
          // refetch the full document so generation never silently caches a
          // translation with a field permanently missing. Only paid on a
          // miss; cache hits (the common case after warmup) skip this.
          const fullSource = await Model.findById(source._id).lean();
          results[idStr] = await generateTranslation(entityType, source._id, language, fullSource || source, cfg, sourceVersion);
        } catch {
          results[idStr] = englishFields(source, cfg.fields);
        }
        return;
      }
      const waited = await waitForResult(entityType, source._id, language);
      results[idStr] = waited || englishFields(source, cfg.fields);
    }));
  }

  return results;
}

module.exports = { getTranslation, getTranslationsForDocs };
