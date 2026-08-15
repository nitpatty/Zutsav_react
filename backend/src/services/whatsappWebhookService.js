/**
 * WhatsApp Webhook Service — inbound message parsing + consent processing.
 *
 * This is the INBOUND companion to the (outbound) notification engine. It is
 * deliberately small: it only handles what consent processing needs. Normal
 * customer messages are acknowledged and left alone (Chatwoot / support
 * handles them on its own delivery path — this service never consumes or
 * deletes messages).
 *
 * Scope (Phase 4):
 *   - Tolerant parsing of Meta Cloud API webhook payloads
 *   - Exact opt-out keyword detection (approved set only — see below)
 *   - User identification by normalized phone
 *   - consentService.recordOptOut(...) with source 'whatsapp_keyword'
 *   - Database-backed wamid idempotency (unique+sparse index)
 *
 * Explicitly NOT here (later phases):
 *   - Outbound consent gate, preference center, admin UI, new templates.
 */

const WhatsAppConsentEvent = require('../models/WhatsAppConsentEvent');
const consentService = require('./consentService');

/**
 * Approved opt-out commands. Scope comes verbatim from the client reference
 * document ("If a customer sends STOP or supported variants such as
 * UNSUBSCRIBE, OPT OUT, CANCEL"). Matching is EXACT after normalization
 * (uppercase, trimmed, internal whitespace collapsed) — never substring or
 * fuzzy, so normal messages like "Please stop sending updates" or
 * "Where is my booking?" are never misclassified. The exact list remains a
 * business/compliance decision (see docs §Open business decisions).
 */
const OPT_OUT_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'CANCEL']);

/** Normalize inbound text: trim, collapse whitespace, uppercase. */
function normalizeMessageText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** True only for an exact approved opt-out command. */
function isOptOutMessage(text) {
  if (!text) return false;
  return OPT_OUT_KEYWORDS.has(normalizeMessageText(text));
}

/**
 * Parse a Meta Cloud API webhook payload (raw body — already signature-
 * verified by the controller).
 *
 * Tolerates: status webhooks, echo messages, non-text messages, unrelated
 * Meta events, malformed JSON, missing fields. Returns an array of candidate
 * user messages:
 *
 *   [{ from, wamid, type, text, timestamp }]
 *
 * or null when the payload contains no user messages (nothing to process).
 */
function parsePayload(rawBody) {
  let body;
  try {
    body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch (err) {
    return null;
  }

  if (!body || typeof body !== 'object') return null;

  const entries = Array.isArray(body.entry) ? body.entry : [];
  const messages = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || typeof value !== 'object') continue;

      // Only inbound USER messages matter (value.messages). Status updates
      // (value.statuses), echo/own messages, and messages to the business
      // (value.contacts present but messages may still arrive) are handled
      // below by filtering on `from` + `id`.
      if (!Array.isArray(value.messages)) continue;

      for (const m of value.messages) {
        if (!m || typeof m !== 'object') continue;
        // A real user message always carries `from` (the sender's number) and
        // `id` (the wamid). Anything without `from` is not actionable.
        if (m.from === undefined || m.from === null || m.from === '') continue;
        messages.push({
          from: String(m.from),
          wamid: String(m.id || ''),
          type: String(m.type || ''),
          text: String(m?.text?.body || ''),
          timestamp: m.timestamp !== undefined ? String(m.timestamp) : '',
        });
      }
    }
  }

  return messages.length > 0 ? messages : null;
}

/** Mask a phone for logs — show prefix + last 4 digits only. */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 6) return digits ? `****${digits.slice(-4)}` : '(none)';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

/**
 * Process one inbound user message for consent purposes.
 *
 * Returns { processed, reason }:
 *   { processed: false, reason: 'not_optout' }     — normal message, consent untouched
 *   { processed: false, reason: 'missing_wamid' }  — no idempotency key, skipped
 *   { processed: false, reason: 'already_processed' } — wamid already handled
 *   { processed: false, reason: 'unknown_user' }   — no matching Zutsav user
 *   { processed: true,  reason: 'opted_out' }      — consent updated + event written
 *
 * Never throws for expected cases. Unknown users and non-opt-out messages are
 * acknowledged without creating users, preferences, or consent records.
 */
async function processMessage({ from, wamid, type, text, timestamp } = {}) {
  // Only opt-out commands are consent-relevant (Step 13 — normal customer
  // messages must not modify consent).
  if (!isOptOutMessage(text)) {
    return { processed: false, reason: 'not_optout' };
  }

  // wamid is the idempotency key — without it we cannot guarantee a single
  // consent event, so we skip rather than risk duplicates (Meta always sends
  // an id on real messages; its absence means an abnormal payload).
  if (!wamid) {
    console.warn('[WhatsAppWebhook] Opt-out message without wamid — skipped');
    return { processed: false, reason: 'missing_wamid' };
  }

  // Database-backed idempotency: first delivery processes; every replay of
  // the same wamid is recognized and skipped. The unique+sparse index on
  // WhatsAppConsentEvent.whatsappMessageId is the second guard for the
  // concurrent-delivery race (createConsentEvent returns the existing event
  // on a duplicate-key insert).
  const existing = await WhatsAppConsentEvent.findOne({ whatsappMessageId: wamid }).lean();
  if (existing) {
    return { processed: false, reason: 'already_processed' };
  }

  // Identify the Zutsav user by the normalized phone number. Webhook `from`
  // arrives E.164-style (91XXXXXXXXXX); User.phone stores the bare 10-digit
  // form — consentService.normalizeWhatsAppPhone + getUserByPhone handle both.
  const phone = consentService.normalizeWhatsAppPhone(from);
  const user = await consentService.getUserByPhone(phone);
  if (!user) {
    // Unknown sender — acknowledge safely, never fabricate a user or consent
    // history for an unidentifiable person.
    console.log(`[WhatsAppWebhook] Opt-out from unknown phone ${maskPhone(phone)} — acknowledged, no record`);
    return { processed: false, reason: 'unknown_user' };
  }

  const messageTimestamp = parseWebhookTimestamp(timestamp);

  // Single source of truth for consent state transitions (Phase 2 service).
  await consentService.recordOptOut({
    userId: user._id,
    phone,
    whatsappVerified: !!user.whatsappVerified,
    purpose: 'marketing',
    source: 'whatsapp_keyword',
    whatsappMessageId: wamid,
    timestamp: messageTimestamp,
  });

  return { processed: true, reason: 'opted_out' };
}

/** Process a batch of messages; one failure never fails the batch. */
async function processMessages(messages) {
  const results = [];
  for (const message of messages) {
    try {
      results.push(await processMessage(message));
    } catch (err) {
      console.error('[WhatsAppWebhook] Failed to process message', message?.wamid, '-', err.message);
      results.push({ processed: false, reason: 'error' });
    }
  }
  return results;
}

/** Meta timestamps are unix seconds; tolerate invalid/missing → now. */
function parseWebhookTimestamp(value) {
  if (!value) return new Date();
  const ms = Number(value) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return new Date();
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

module.exports = {
  OPT_OUT_KEYWORDS,
  normalizeMessageText,
  isOptOutMessage,
  parsePayload,
  processMessage,
  processMessages,
  maskPhone,
};
