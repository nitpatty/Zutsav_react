# WhatsApp Consent — Phase 4: Inbound WhatsApp Webhook

**Status:** Implemented and tested (24 new tests; full suite 49/49 green).
**Scope:** Meta webhook subscription verification, `X-Hub-Signature-256` security, tolerant payload parsing, phone normalization, user identification, opt-out keyword detection, consent state update + immutable event via `consentService`, wamid idempotency, safe unknown-user handling.

**Not in this phase (later phases):** outbound consent gate, `NotificationMapping.purpose`, preference center, admin consent UI, new Meta templates, `bootstrapNotificationMappings.js` changes.

---

## 1. Webhook Architecture

```
Meta WhatsApp Cloud API (inbound: messages / statuses)
        │  delivery (signed with the Meta App Secret)
        ▼
POST /api/webhooks/whatsapp          ← mounted in backend/src/app.js
        │  X-Hub-Signature-256 verified against the RAW body
        ▼
whatsappWebhook.controller.receiveWebhook
        │  parsePayload() — tolerant (statuses/echo/malformed → nothing to do)
        ▼
whatsappWebhookService.processMessages / processMessage
        │  isOptOutMessage() — exact approved keyword match
        │  consentService.getUserByPhone(normalized phone)
        │  wamid idempotency check (WhatsAppConsentEvent.whatsappMessageId)
        ▼
consentService.recordOptOut({ purpose:'marketing', source:'whatsapp_keyword', whatsappMessageId })
        │
        ├── WhatsAppPreference: whatsapp.marketing → opted_out (current state)
        └── WhatsAppConsentEvent: OPT_OUT event (immutable history)
        ▼
HTTP 200 fast acknowledgement
```

Outbound flow is untouched: business code still goes `NotificationEngine.emit(...)` → worker → `WhatsAppChannel` → `WhatsAppProvider` → Meta. The inbound webhook is a **separate, additive path** that never touches the outbound pipeline.

**Chatwoot:** this repository contains no Chatwoot code. The client's Chatwoot is wired Meta→Chatwoot via its own webhook subscription (external configuration). The Zutsav webhook is an additional consumer of the same Meta app and does **not** consume, delete, or alter messages in any way that affects Chatwoot — both endpoints receive their own copy of the payload. See §12.

---

## 2. Endpoint(s)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/webhooks/whatsapp` | Meta subscription verification (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| `POST` | `/api/webhooks/whatsapp` | Message/status deliveries (requires valid `X-Hub-Signature-256`) |

Files:
- `backend/src/routes/whatsappWebhook.routes.js` — route mounting (no auth middleware; authenticity is the Meta handshake + signature)
- `backend/src/controllers/whatsappWebhook.controller.js` — verification + receive logic
- `backend/src/services/whatsappWebhookService.js` — parsing, keyword detection, user lookup, consent processing

`app.js` wiring:
- `express.json()` now has a `verify` callback that stores the raw bytes on `req.rawBody` (needed for signature verification).
- The webhook path is **exempted from the `/api/` per-IP rate limiter** (Meta retries must not be throttled; wamid idempotency makes retries safe).
- Route mounted at `/api/webhooks/whatsapp` alongside the other `/api/` routes.

---

## 3. Meta Verification Flow (GET)

Meta calls the endpoint when you add it in the app dashboard with query params:

- `hub.mode` — `subscribe`
- `hub.verify_token` — your configured token
- `hub.challenge` — random string to echo back

Behavior:
1. `mode === 'subscribe'` **and** `verify_token` present **and** `challenge` present.
2. `verify_token` is compared **timing-safely** against the configured token (`WHATSAPP_VERIFY_TOKEN` / settings key `whatsappVerifyToken`).
3. Match → `200` with the challenge echoed verbatim (Meta registers the webhook).
4. No match / missing params → `403 Forbidden` (challenge never echoed).

Secrets are never logged; only a generic "verification rejected" diagnostic is emitted.

---

## 4. Signature Verification (POST)

Every POST is validated with `X-Hub-Signature-256` before anything else:

```
expected = 'sha256=' + HMAC_SHA256(metaAppSecret, RAW_BODY).hex
```

- Verified against **`req.rawBody`** — the exact bytes received — captured by the `express.json` `verify` callback. Never against `JSON.stringify(req.body)` (body parsing can normalize whitespace/ordering and break the signature).
- Comparison is **timing-safe** (`crypto.timingSafeEqual`, length-mismatch safe).
- Missing raw body or missing signature header → `403`.
- App secret unset → `500` "not configured" (config error, not a security bypass).
- Mismatch → `403`; **no parsing, no consent processing, no DB writes**.
- The app secret and signature values are never logged.

Meta's app secret is read via `settingsService.get('whatsappAppSecret', process.env.WHATSAPP_APP_SECRET)` — same pattern as `whatsappPhoneNumberId`/`whatsappAccessToken` (DB-settable via Admin → Settings, env fallback).

---

## 5. Payload Structure

`whatsappWebhookService.parsePayload(rawBody)` tolerantly extracts user messages from the standard Meta Cloud API shape:

```jsonc
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "...",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
        "messages": [{ "from": "919876543210", "id": "wamid....", "type": "text",
                       "timestamp": "1755000000", "text": { "body": "STOP" } }]
        // OR
        "statuses": [{ "id": "...", "status": "read", "timestamp": "..." }]
      }
    }]
  }]
}
```

Extracted per message: `{ from, wamid, type, text, timestamp }`.

Tolerance (each is handled without throwing):
- **Status webhooks** (`value.statuses`) → no messages → nothing to do → `200`.
- **Malformed JSON** → null → `200`.
- **Non-text messages** (image/audio/video/etc.) → parsed; empty `text` → not an opt-out → nothing to do → `200`.
- **Missing `from`** → message skipped.
- **Missing `wamid`** (an opt-out command without an id) → skipped with a log; no consent change (cannot guarantee idempotency).
- **Unrelated Meta events** (empty `entry`/`changes`/`value`) → null → `200`.

---

## 6. Phone Normalization

Single normalization rule, reused from the existing WhatsApp provider:

- `consentService.normalizeWhatsAppPhone(phone)` → `WhatsAppProvider.normalizePhone(phone)`:
  - strips non-digits; 10-digit Indian → `91XXXXXXXXXX`; keeps 12-digit `91…`; passes through other digit strings.
- `consentService.phoneVariants(phone)` also yields the bare 10-digit form used by `User.phone`.

Meta's webhook `from` arrives E.164-style (`919876543210`); `User.phone` stores the bare 10-digit form. `getUserByPhone` tries both variants. No second normalization system was introduced.

---

## 7. User Lookup

- `consentService.getUserByPhone(phone)` queries `User` by each variant of the normalized phone.
- A matching `User` doc is the identity anchor. **No users are ever auto-created.**
- If no user matches (unknown sender):
  - The webhook is acknowledged (`200`).
  - A masked-phone diagnostic is logged (`91****3210` style — no full number).
  - **No** `User`, `WhatsAppPreference`, or `WhatsAppConsentEvent` is created. Anonymous consent records are deliberately not written (client architecture doesn't require them; consent without identity is meaningless for this system).

---

## 8. Opt-Out Processing

**Keyword scope** — verbatim from the client reference document: `STOP`, `UNSUBSCRIBE`, `OPT OUT`, `CANCEL`. Implemented as an isolated, configurable set in `whatsappWebhookService.OPT_OUT_KEYWORDS`.

Matching rules:
- Normalization: trim, collapse internal whitespace, uppercase — `" opt  out "` → `OPT OUT`.
- **Exact command match only.** No substring/fuzzy matching, so `"Please stop"`, `"Stop sending updates"`, `"OPT-OUT"` (hyphen), `"CANCEL ORDER"` are **not** opt-outs.
- The exact list remains a business/compliance decision (see §17).

On a matched opt-out from a **known user**:

```
consentService.recordOptOut({
  userId, phone, whatsappVerified: user.whatsappVerified,
  purpose: 'marketing',
  source: 'whatsapp_keyword',
  whatsappMessageId: wamid,
  timestamp: messageTimestamp,     // Meta unix-seconds, validated
})
```

Effects (verified by tests):
- `WhatsAppPreference.whatsapp.marketing.status` → `opted_out`, `source` → `whatsapp_keyword`, `lastOptOutAt` set.
- `WhatsAppConsentEvent` appended: `action OPT_OUT`, `purpose marketing`, `channel whatsapp`, `source whatsapp_keyword`, `whatsappMessageId` = wamid.
- **`whatsappVerified` unchanged** (both on User and the mirrored preference field).
- **`whatsapp.service` unchanged** — service communication is not disabled by STOP.
- Previous history (e.g. a signup `OPT_IN`) is never deleted — append-only.

**STOP is NOT** account deletion, booking cancellation, service opt-out, or verification removal (per the client requirement).

---

## 9. Idempotency

Two independent, database-backed layers (no in-memory state, no Redis):

1. **Pre-check:** before processing, `processMessage` queries `WhatsAppConsentEvent.findOne({ whatsappMessageId: wamid })`. A replay is recognized and skipped immediately.
2. **Unique+sparse index:** `WhatsAppConsentEvent.whatsappMessageId` is unique+sparse (created in Phase 1). For the concurrent-delivery race — both deliveries pass the pre-check before either inserts — `consentService.createConsentEvent` catches the duplicate-key error (`E11000`) and returns the existing event. Exactly **one** consent event results.

Verified by tests: sequential duplicate delivery → 1 event; `Promise.all` concurrent duplicates → 1 event; a different wamid → a new event.

---

## 10. Error Handling

| Case | Behavior |
|---|---|
| Invalid/missing signature | `403`, nothing processed or persisted |
| Invalid verify token / missing challenge / wrong mode | `403`, challenge never echoed |
| App secret or verify token not configured | `500` "not configured" (no secret leak) |
| Malformed payload / status webhook / no user messages | `200` ack, nothing to do |
| Missing `from` | message skipped |
| Missing `wamid` on an opt-out | skipped + logged, no consent change |
| Unknown user | `200` ack, no records, masked-phone log |
| Duplicate wamid | `200` ack, recognized as already processed |
| DB failure during processing | `500` generic (lets Meta retry; retries are safe via idempotency) |

No stack traces are returned to Meta; no OTPs or message contents are logged; logs carry safe identifiers (wamid, masked phone, reason).

---

## 11. Security

- Webhook requests are treated as **untrusted input**.
- Meta app secret + verify token come from configuration (`WHATSAPP_APP_SECRET` / `WHATSAPP_VERIFY_TOKEN` env, or the same keys in `SystemSettings`); never hardcoded, never logged.
- `X-Hub-Signature-256` verified against the **raw body** with a timing-safe compare.
- No arbitrary user creation; no arbitrary consent modification; all state transitions flow through `consentService` (single source of truth).
- Webhook is exempt from the API rate limiter but protected by signature + wamid dedupe.
- The endpoint is public by design (Meta must reach it); it is not behind JWT auth — authenticity is the Meta handshake/signature.

---

## 12. Chatwoot Interaction

**Observed behavior (verified):** there is no Chatwoot code in this repository. Chatwoot receives WhatsApp messages via its own Meta webhook subscription (Meta-side configuration), completely independent of the Zutsav backend.

**This implementation:**
- Does not forward to Chatwoot (no integration exists to extend).
- Does not consume or delete messages in a way that could prevent Chatwoot processing (the Zutsav webhook is an additional subscription; each consumer gets its own copy).
- For opt-out messages, consent processing happens in Zutsav; whether Chatwoot also sees the message depends entirely on Meta's webhook configuration (both endpoints typically receive the same payload). No suppression logic was invented.

**Deployment requirement:** to activate the Zutsav webhook, add `https://<zutsav-host>/api/webhooks/whatsapp` to the Meta app's webhook subscriptions (same fields Chatwoot uses, e.g. `messages`). Both endpoints can coexist. This is a Meta-side configuration step and should be validated in production with a real message (see §17).

---

## 13. Tests

`backend/tests/whatsapp-webhook-phase4.test.js` — 24 tests, HTTP end-to-end against an ephemeral Express server replicating the production wiring (raw-body `verify` callback + webhook router), on a dedicated test DB (`zutsav_consent_webhook_test`).

| Group | Coverage |
|---|---|
| Meta verification (GET) | valid token → challenge echoed; invalid token → 403; missing challenge → 403; wrong mode → 403 |
| Signature (POST) | valid signature → 200; invalid → 403 + nothing persisted; missing → 403; modified body fails |
| Payload parsing | text message extraction; malformed JSON; status webhook; image message; missing `from` |
| Keyword detection | STOP/stop/" stop "/OPT OUT/opt out/" Opt   Out "/UNSUBSCRIBE/CANCEL → true; "Please stop"/"OPT-OUT"/"Where is my booking?"/empty → false |
| Consent flow (HTTP) | known user STOP → marketing opted_out, source whatsapp_keyword, OPT_OUT event, service + whatsappVerified untouched, history append-only; unknown user → ack, no records; normal message → untouched; missing wamid → nothing; status webhook → nothing |
| Idempotency | sequential duplicate → 1 event; concurrent duplicate → 1 event; distinct wamid → new event |

**Full suite:** `cd backend && npm test` → **49/49 pass** (25 Phase 1–3 + 24 Phase 4). Regression: existing OTP flow, registration, `USER_REGISTERED`, JWT, pandit registration, referral flow, notification engine — all still green; no notification-engine, template, mapping, or bootstrap files were touched.

---

## 14. Environment Variables Required

| Variable | Purpose | Notes |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Echoed during Meta's GET subscription verification | Any strong secret string you choose; add in Meta app dashboard too |
| `WHATSAPP_APP_SECRET` | HMAC key for `X-Hub-Signature-256` verification | From the Meta app dashboard → App Settings |

Convention follows the existing `WHATSAPP_*` prefix (same family as `WHATSAPP_ACCESS_TOKEN` etc.). Both are also readable via `SystemSettings` (`whatsappVerifyToken`, `whatsappAppSecret`) using the existing settings pattern. Documented in `backend/.env.example`.

---

## 15. Deployment Configuration

1. Set `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` in the environment (or Admin → Settings) **before** registering the webhook.
2. Deploy; confirm `GET /api/webhooks/whatsapp` responds `403` without params (not `404`).
3. In the Meta app dashboard, add the webhook endpoint `https://<host>/api/webhooks/whatsapp` with the same verify token and subscribe to the `messages` field. Meta will call the GET handshake; a `200` + challenge echo registers it.
4. Send a real WhatsApp message (e.g. `STOP`) from a registered user's number and confirm: preference → `opted_out`, a `WhatsAppConsentEvent` with `source: whatsapp_keyword`, and `200` responses. Confirm Chatwoot still receives its copy.
5. No migrations needed — all collections/indexes are created by Mongoose automatically on connect (existing convention).

---

## 16. Known Limitations

- **Outbound consent gate not implemented** (Phase 5): `hasMarketingConsent`/`hasServicePermission` exist but nothing consumes them yet; `NotificationMapping` has no `purpose` field.
- **Opt-in inbound keywords not supported** — only opt-out per the client document; re-subscribe comes later (preference center / template phase).
- **Anonymous opt-out records** for unknown senders are intentionally NOT stored (client architecture requires user identity).
- **Chatwoot coexistence** depends on Meta-side webhook configuration (multiple subscribed endpoints) — not verifiable from inside this repo; needs a production smoke test.
- **Webhook endpoint is public** (by design) — protected by signature, but no per-IP rate limit applies to it.
- **Opt-out confirmation reply not sent** — requires a Meta template (business approval), future phase.
- **Keyword list is English-only** per the client document; localization is an open decision.

---

## 17. Open Business Decisions

1. **Keyword scope:** the implemented set (`STOP`, `UNSUBSCRIBE`, `OPT OUT`, `CANCEL`) is verbatim from the client reference. Confirm whether additional variants (e.g. `STOP ALL`, Hindi keywords, `OPT-OUT` with hyphen) are required for WhatsApp/Indian telecom compliance.
2. **Opt-out confirmation message:** whether to reply with a confirmation (requires a new Meta template — blocked on business/legal approval; not implemented).
3. **Chatwoot delivery model:** confirm Meta delivers to both Chatwoot and Zutsav (dual subscription) vs. Zutsav-first-then-forward. Current implementation assumes dual subscription and doesn't interfere with Chatwoot.
4. **STOP semantics:** confirmed as **marketing-only** opt-out. Business sign-off that STOP must not affect service/transactional messages or account state.
5. **Verify token / app secret ownership:** who manages these secrets in production (env vs Admin → Settings) and rotates them.
6. **Retention:** how long `WhatsAppConsentEvent` history is retained (legal decision).

---

## Final Checkpoint (verified)

- [x] Meta verification works (valid/invalid/missing challenge tested)
- [x] Signature verification works against the raw body
- [x] Raw body used correctly (`req.rawBody` via `express.json` verify callback)
- [x] Invalid signatures rejected (403, nothing persisted)
- [x] Valid webhook accepted (200)
- [x] wamid idempotency works (sequential + concurrent → 1 event)
- [x] Phone normalization matches `WhatsAppProvider` (reused directly)
- [x] Known users identified; unknown users safely acknowledged (no records)
- [x] Approved opt-out keyword detected (exact match only)
- [x] Marketing → `opted_out`; service unchanged; `whatsappVerified` unchanged
- [x] Consent event append-only; duplicates impossible
- [x] Normal messages do not change consent
- [x] Chatwoot behavior preserved (no code touched; independent delivery)
- [x] Existing OTP, registration, outbound notifications, notification mappings untouched
- [x] `bootstrapNotificationMappings.js` untouched
- [x] No production data deleted (dedicated test DBs only)
- [x] No secrets logged
- [x] Tests pass (49/49)

**Next phase (awaiting review/instruction):** PHASE 5 — Outbound WhatsApp consent gate (`NotificationMapping.purpose` + `WhatsAppChannel`/dispatcher gate + bootstrap v1.2.0 purpose classification).
