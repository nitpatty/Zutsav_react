/**
 * Consent Service — the single place responsible for consent state
 * transitions (current state in WhatsAppPreference + immutable history in
 * WhatsAppConsentEvent). Every future consumer (signup, preference center,
 * inbound STOP webhook, outbound consent gate) goes through this module; no
 * other code writes preference/consent documents directly.
 *
 * STATE RULES (hard requirements — see docs/whatsapp-consent-architecture-audit.md):
 *
 *  RULE 1 — WhatsApp verification != consent.
 *    whatsappVerified === true NEVER means marketing or service consent.
 *
 *  RULE 2 — Marketing is strictly opt-in.
 *    Only whatsapp.marketing.status === 'opted_in' is consented. 'not_set'
 *    (and 'opted_out') are NOT consented.
 *
 *  RULE 3 — Service communication defaults to allowed.
 *    whatsapp.service.status defaults to 'opted_in' so transactional
 *    communication keeps functioning. This default is a SYSTEM DEFAULT, not
 *    an explicit consent action — it is never recorded as a consent event.
 *
 *  RULE 4 — Opt-in: update current state + append immutable OPT_IN event.
 *  RULE 5 — Opt-out: update current state + append immutable OPT_OUT event.
 *    Previous events are never deleted or modified (append-only).
 *  RULE 6 — Idempotency: createConsentEvent is idempotent for webhook-driven
 *    events via the unique+sparse whatsappMessageId index (a replayed wamid
 *    returns the existing event instead of duplicating it).
 */

const User = require('../models/User');
const WhatsAppPreference = require('../models/WhatsAppPreference');
const WhatsAppConsentEvent = require('../models/WhatsAppConsentEvent');
// Reuse the exact normalization semantics already used by the WhatsApp
// provider — one phone-normalization rule for the whole codebase, never a
// second conflicting copy.
const { normalizePhone } = require('../../notification-engine/providers/WhatsAppProvider');

// ── Phone normalization ──────────────────────────────────────────────────────
// 10-digit Indian number → 91XXXXXXXXXX; E.164 digits kept; non-digits
// stripped. Inbound webhook `from` values and stored preference.phone both use
// this form so lookups match.

function normalizeWhatsAppPhone(phone) {
  return normalizePhone(phone);
}

/** Lookup variants for a phone: E.164 digits + the bare 10-digit form that
 * User.phone stores (the User schema holds a 10-digit Indian number). */
function phoneVariants(phone) {
  const e164 = normalizeWhatsAppPhone(phone);
  const ten  = e164.length === 12 && e164.startsWith('91') ? e164.slice(2) : e164;
  return [...new Set([e164, ten])].filter(Boolean);
}

// ── Current-state reads ─────────────────────────────────────────────────────

async function getPreference(userId) {
  if (!userId) return null;
  try {
    return await WhatsAppPreference.findOne({ userId });
  } catch (err) {
    // userId not castable to ObjectId (e.g. an admin dry-run sample id) —
    // treat as "no preference", never a hard error at the consent gate.
    if (err && err.name === 'CastError') return null;
    throw err;
  }
}

/** Look up a preference by phone (any variant — E.164 or 10-digit). */
async function getPreferenceByPhone(phone) {
  const e164 = normalizeWhatsAppPhone(phone);
  if (!e164) return null;
  return WhatsAppPreference.findOne({ phone: e164 });
}

/** Find the User document for a phone (E.164 or 10-digit). */
async function getUserByPhone(phone) {
  for (const variant of phoneVariants(phone)) {
    const user = await User.findOne({ phone: variant }).lean();
    if (user) return user;
  }
  return null;
}

/**
 * Marketing consent: ONLY an explicit whatsapp.marketing.status === 'opted_in'
 * counts. No preference doc or 'not_set'/'opted_out' ⇒ false (RULE 2).
 */
async function hasMarketingConsent(userId) {
  const pref = await getPreference(userId);
  if (!pref) return false;
  return pref.whatsapp?.marketing?.status === 'opted_in';
}

/**
 * Service permission: transactional communication stays enabled unless the
 * user explicitly opted out (RULE 3). No preference doc (or 'not_set',
 * which is the default) ⇒ allowed.
 */
async function hasServicePermission(userId) {
  const pref = await getPreference(userId);
  if (!pref) return true; // no preference yet → default service permission (RULE 3)
  return pref.whatsapp?.service?.status !== 'opted_out';
}

// ── State transitions ───────────────────────────────────────────────────────

/**
 * Default current-preference document. Service defaults to 'opted_in'
 * (system default, source '' — no event is ever created for it); marketing
 * defaults to 'not_set' (not consented until an explicit opt-in).
 */
function buildDefaultPreference({ userId, phone, whatsappVerified }) {
  return {
    userId,
    phone: normalizeWhatsAppPhone(phone || ''),
    whatsappVerified: !!whatsappVerified,
    whatsapp: {
      service:   { status: 'opted_in', source: '', timestamp: new Date() },
      marketing: { status: 'not_set',  source: '', timestamp: null },
    },
    email: {
      service:   { status: 'not_set', source: '', timestamp: null },
      marketing: { status: 'not_set', source: '', timestamp: null },
    },
    sms: {
      service:   { status: 'not_set', source: '', timestamp: null },
      marketing: { status: 'not_set', source: '', timestamp: null },
    },
  };
}

async function getOrCreatePreference({ userId, phone, whatsappVerified }) {
  const existing = await getPreference(userId);
  if (existing) return existing;
  return WhatsAppPreference.create(buildDefaultPreference({ userId, phone, whatsappVerified }));
}

/**
 * Update the current whatsapp state for a purpose WITHOUT creating a consent
 * event. Used for the "declined at signup" case (explicit false) and by
 * recordOptIn/recordOptOut below (which pair this with an event). Exported so
 * callers that need state-only writes (e.g. signup absence handling) never
 * bypass the service.
 */
async function setWhatsAppState({ userId, phone = '', whatsappVerified, purpose, status, source = '', timestamp = new Date() }) {
  if (!userId || !['service', 'marketing'].includes(purpose)) return null;
  if (!['opted_in', 'opted_out', 'not_set'].includes(status)) return null;
  // Ensure the current-state document exists so state transitions are always
  // consistent, even when a caller forgets getOrCreatePreference first.
  await getOrCreatePreference({ userId, phone, whatsappVerified });
  const set = {
    [`whatsapp.${purpose}.status`]:    status,
    [`whatsapp.${purpose}.source`]:    source,
    [`whatsapp.${purpose}.timestamp`]: timestamp,
  };
  if (status === 'opted_in')  set.lastOptInAt  = timestamp;
  if (status === 'opted_out') set.lastOptOutAt = timestamp;
  return WhatsAppPreference.findOneAndUpdate({ userId }, { $set: set }, { new: true });
}

/**
 * Create an immutable consent event. Idempotent for webhook-driven events:
 * when `whatsappMessageId` is supplied and an event with that id already
 * exists (unique+sparse index), the duplicate insert is skipped and the
 * existing event is returned. Events are never updated or deleted.
 */
async function createConsentEvent({
  userId, phone, purpose, action, source,
  consentText = '', consentVersion = '',
  timestamp = new Date(), ipAddress = '', userAgent = '',
  whatsappMessageId = '',
}) {
  if (!userId || !['service', 'marketing'].includes(purpose) || !['OPT_IN', 'OPT_OUT'].includes(action) || !source) {
    return null;
  }
  try {
    const doc = {
      userId,
      phone: normalizeWhatsAppPhone(phone || ''),
      channel: 'whatsapp',
      purpose, action, source,
      consentText, consentVersion,
      timestamp,
      ipAddress, userAgent,
    };
    // Only include the wamid when actually provided — the unique+sparse index
    // relies on the field being ABSENT for non-webhook events.
    if (whatsappMessageId) doc.whatsappMessageId = whatsappMessageId;
    return await WhatsAppConsentEvent.create(doc);
  } catch (err) {
    // Duplicate key on the unique+sparse whatsappMessageId index = replay of
    // the same inbound message — the event already exists, return it.
    if (whatsappMessageId && err && (err.code === 11000 || /E11000/i.test(err.message || ''))) {
      return WhatsAppConsentEvent.findOne({ whatsappMessageId });
    }
    throw err;
  }
}

/**
 * Opt-in (RULE 4): update current state to opted_in + append OPT_IN event.
 * The consent event is only written when `source` is provided (an explicit
 * action); supplying consentText/consentVersion stores the exact copy shown.
 */
async function recordOptIn({
  userId, phone = '', whatsappVerified, purpose, source,
  consentText = '', consentVersion = '',
  ipAddress = '', userAgent = '', whatsappMessageId = '', timestamp: explicitTimestamp,
}) {
  const timestamp = explicitTimestamp || new Date();
  await setWhatsAppState({ userId, phone, whatsappVerified, purpose, status: 'opted_in', source, timestamp });
  return createConsentEvent({
    userId, phone, purpose, action: 'OPT_IN', source,
    consentText, consentVersion, timestamp, ipAddress, userAgent, whatsappMessageId,
  });
}

/**
 * Opt-out (RULE 5): update current state to opted_out + append OPT_OUT event.
 * Never deletes previous events — full history is preserved.
 */
async function recordOptOut({
  userId, phone = '', whatsappVerified, purpose, source,
  consentText = '', consentVersion = '',
  ipAddress = '', userAgent = '', whatsappMessageId = '', timestamp: explicitTimestamp,
}) {
  const timestamp = explicitTimestamp || new Date();
  await setWhatsAppState({ userId, phone, whatsappVerified, purpose, status: 'opted_out', source, timestamp });
  return createConsentEvent({
    userId, phone, purpose, action: 'OPT_OUT', source,
    consentText, consentVersion, timestamp, ipAddress, userAgent, whatsappMessageId,
  });
}

module.exports = {
  // reads
  getPreference,
  getPreferenceByPhone,
  getUserByPhone,
  hasMarketingConsent,
  hasServicePermission,
  // writes
  getOrCreatePreference,
  setWhatsAppState,
  createConsentEvent,
  recordOptIn,
  recordOptOut,
  // helpers
  normalizeWhatsAppPhone,
  phoneVariants,
};
