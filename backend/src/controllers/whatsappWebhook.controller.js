/**
 * WhatsApp Webhook Controller — Meta Cloud API inbound webhook.
 *
 *   GET  /api/webhooks/whatsapp  — subscription verification (hub.mode /
 *                                  hub.verify_token / hub.challenge)
 *   POST /api/webhooks/whatsapp  — message/status delivery, protected by
 *                                  X-Hub-Signature-256 (HMAC-SHA256 of the
 *                                  RAW request body with the Meta app secret)
 *
 * Security posture: webhook requests are UNTRUSTED input.
 *   - Invalid verify token → 403, challenge never echoed
 *   - Invalid/missing signature → 403, nothing processed, nothing persisted
 *   - Valid signature → parse + consent-process (if applicable) → 200 fast
 *   - App secret / verify token are never logged
 *   - Stack traces are never returned to Meta
 *
 * The consent source of truth stays in consentService — this controller only
 * orchestrates, it never writes preference/consent documents directly.
 */

const crypto = require('crypto');
const settings = require('../utils/settingsService');
const webhookService = require('../services/whatsappWebhookService');

const VERIFY_MODE = 'subscribe';

async function getVerifyToken() {
  return settings.get('whatsappVerifyToken', process.env.WHATSAPP_VERIFY_TOKEN);
}

async function getAppSecret() {
  return settings.get('whatsappAppSecret', process.env.WHATSAPP_APP_SECRET);
}

/** Timing-safe comparison that tolerates differing lengths (never throws). */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── GET — webhook subscription verification ────────────────────────────────

exports.verifyWebhook = async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === VERIFY_MODE && token && challenge) {
      const expected = await getVerifyToken();
      if (expected && timingSafeEqual(token, expected)) {
        // Echo the challenge verbatim (Meta expects the raw string back).
        return res.status(200).send(String(challenge));
      }
    }

    console.warn('[WhatsAppWebhook] Verification rejected (invalid token/mode/challenge)');
    return res.status(403).send('Forbidden');
  } catch (err) {
    console.error('[WhatsAppWebhook] Verification error:', err.message);
    return res.status(500).send('Internal Server Error');
  }
};

// ── POST — webhook delivery ─────────────────────────────────────────────────

exports.receiveWebhook = async (req, res) => {
  try {
    // 1) Signature verification against the EXACT raw bytes received.
    //    Never verify against req.body — body parsing may have normalized the
    //    original representation. req.rawBody is captured by the express.json
    //    verify() callback in app.js.
    const rawBody = req.rawBody;
    const signature = req.headers['x-hub-signature-256'] || '';
    if (!rawBody || !signature) {
      console.warn('[WhatsAppWebhook] Missing raw body or signature header');
      return res.status(403).json({ success: false, message: 'Invalid signature' });
    }

    const appSecret = await getAppSecret();
    if (!appSecret) {
      console.error('[WhatsAppWebhook] Meta app secret not configured — rejecting webhook');
      return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    if (!timingSafeEqual(expected, signature)) {
      console.warn('[WhatsAppWebhook] Signature mismatch — request rejected');
      return res.status(403).json({ success: false, message: 'Invalid signature' });
    }

    // 2) Tolerant payload parsing. Status webhooks, echoes, unrelated events,
    //    malformed payloads, and payloads without user messages all resolve
    //    to nothing to process — acknowledge quickly.
    const messages = webhookService.parsePayload(rawBody);
    if (!messages) {
      return res.status(200).json({ success: true });
    }

    // 3) Consent processing (opt-out only). Await persistence so the consent
    //    event is durable before we acknowledge — the writes are two quick
    //    indexed DB ops, well within Meta's expectations.
    await webhookService.processMessages(messages);

    // 4) Fast acknowledgement.
    return res.status(200).json({ success: true });
  } catch (err) {
    // A DB failure here should let Meta retry (idempotency makes retries
    // safe). Never leak internals — generic message only.
    console.error('[WhatsAppWebhook] Processing error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

