# WhatsApp Consent — Phase 5: Outbound Consent Gate

Status: **IMPLEMENTED** (Phases 1–4 complete; this is the enforcement phase).
Scope: communication `purpose` on `NotificationMapping`, a single consent gate
in the WhatsApp channel, and bootstrap v1.2.0 with verified purposes for all
51 mappings. Preference Center, admin consent UI, inbound opt-in keywords,
resubscribe flow, new Meta templates, and email/SMS enforcement are **out of
scope** and remain for later phases.

---

## 1. Existing outbound architecture

Verified from code (not assumed):

```
Business controller / job
        ↓  NotificationEngine.emit(eventName, payload, { channel? })
EventDispatcher.dispatch()            → MappingCache.getEnabledMappings(eventName)
        ↓                             → resolveRecipients(mapping.recipientType, payload)
NotificationJob  (one per mapping × recipient: { mappingId, channel, recipient: { userId, phone, email }, normalizedPayload })
        ↓
Worker.processJob(job)                → re-loads the mapping FRESH from MongoDB (.lean())
ChannelRegistry.get(job.channel)
        ↓
WhatsAppChannel.send(mapping, payload, recipient)
        ↓
buildVariableChecklist + TemplateValidator.validate   (pre-send structural guards)
        ↓
TemplateEngine.render → WhatsAppProvider.send         (Meta Cloud API)
```

Key verified facts that shaped the design:

- **`WhatsAppChannel.send()` (line 125) is the only live call to
  `WhatsAppProvider.send`** in the entire repository. The legacy
  `src/utils/whatsapp.js` `sendWhatsApp()` is dead code with zero callers.
  OTP sends go through the engine too (`NotificationEngine.emit(...,
  { channel })` in `auth.controller.js` / `passwordReset.controller.js`).
  ⇒ **One enforcement point covers 100% of outbound WhatsApp.**
- `Worker.processJob` re-fetches the mapping from MongoDB on **every**
  execution, and the gate reads consent fresh from MongoDB on every send ⇒
  retries and delayed jobs re-evaluate consent automatically.
- `job.recipient` carries the **actual recipient's** `userId`/`phone`/`email`
  (resolved per `mapping.recipientType` — user / pandit / referral_pandit /
  admin). Consent is evaluated against that userId, never the event initiator
  or admin.

## 2. Purpose model

A single enum on `NotificationMapping`, channel-independent (one
classification per mapping row):

| Purpose | Meaning |
|---|---|
| `ACCOUNT` | authentication / security / account lifecycle |
| `BOOKING` | booking lifecycle (confirmation, status, reminders, invoices, payment for a booking) |
| `ORDER` | marketplace / order lifecycle (confirmation, packing, shipping, delivery, refunds) |
| `SERVICE` | transactional / service-operational communication |
| `MARKETING` | promotional / advertising / campaign — **the only consent-gated purpose** |
| `UNKNOWN` | unclassified (default). **Blocks nothing**, never treated as marketing |

Semantics enforced:
- `MARKETING` requires explicit `whatsapp.marketing.status === 'opted_in'`.
- `whatsappVerified` is **never** marketing consent.
- Service consent is **never** marketing consent.
- All non-marketing purposes bypass the gate, so transactional communication
  is never blocked by a marketing opt-out.

## 3. Purpose classification table (all 51 verified mappings)

### WhatsApp (45)

| Event | Recipient | Template | Purpose | Reason |
|---|---|---|---|---|
| OTP_VERIFICATION | user | whatsapp_verification | ACCOUNT | authentication OTP |
| OTP_VERIFICATION | pandit | whatsapp_verification | ACCOUNT | authentication OTP |
| SERVICE_COMPLETION_OTP | user | whatsapp_verification | ACCOUNT | verification OTP (same auth template) |
| DELIVERY_OTP_SENT | user | whatsapp_verification | ACCOUNT | verification OTP |
| PASSWORD_RESET_WHATSAPP_OTP | user | whatsapp_verification | ACCOUNT | verification OTP |
| PASSWORD_RESET_WHATSAPP_OTP | pandit | whatsapp_verification | ACCOUNT | verification OTP |
| USER_REGISTERED | user | new_user_registered | ACCOUNT | account creation |
| PAYMENT_SUCCESS | user | payment_success | BOOKING | payment for a booking (booking.number) |
| PARTIAL_PAYMENT_RECEIVED | user | partial_payment_received | BOOKING | booking payment |
| FINAL_PAYMENT_RECEIVED | user | final_payment_received | BOOKING | booking payment |
| PAYMENT_FAILED | user | payment_failed | BOOKING | booking payment |
| BOOKING_CONFIRMED | user | booking_confirmed | BOOKING | booking confirmation |
| BOOKING_CANCELLED | user | booking_cancelled | BOOKING | booking status |
| BOOKING_REFUNDED | user | booking_refunded | BOOKING | booking refund |
| SERVICE_REMINDER_24H | user | service_reminder_24h | BOOKING | appointment info within booking lifecycle |
| SERVICE_REMINDER_1H | user | service_reminder_1h | BOOKING | appointment info within booking lifecycle |
| SERVICE_COMPLETED | user | service_completed | SERVICE | service completion update |
| INVOICE_GENERATED | user | invoice_generated | BOOKING | invoice for a booking |
| FEEDBACK_REQUEST | user | feedback_request | SERVICE | post-service feedback; **review recommended** (see §20) |
| KIT_SHIPPED | user | kit_shipped | ORDER | kit shipment tracking |
| KIT_DELIVERED | user | kit_delivered | ORDER | kit delivery |
| ORDER_CONFIRMED | user | order_confirmed | ORDER | order confirmation |
| ORDER_PACKED | user | order_packed | ORDER | order status |
| ORDER_SHIPPED | user | order_shipped | ORDER | shipping update |
| ORDER_OUT_FOR_DELIVERY | user | order_out_for_delivery | ORDER | delivery update |
| ORDER_DELIVERED | user | order_delivered | ORDER | delivery update |
| ORDER_CANCELLED | user | order_cancelled | ORDER | order status |
| ORDER_REFUNDED | user | order_refunded | ORDER | order refund |
| PANDIT_POOJA_REJECTED | pandit | pandit_pooja_rejected | SERVICE | pandit service request workflow |
| PANDIT_REGISTERED | pandit | pandit_registered | ACCOUNT | pandit account creation *(no live emitter — see §19)* |
| PANDIT_ACCEPTED | user | pandit_accepted | BOOKING | pandit accepted for user's booking |
| PANDIT_ASSIGNED | user | pandit_assigned | BOOKING | pandit assigned to booking *(no live emitter — §19)* |
| PANDIT_ASSIGNMENT_PENDING | pandit | pandit_assignment_pending | SERVICE | pandit assignment workflow *(no live emitter — §19)* |
| REFERRAL_PENDING_REMARK | pandit | referral_pending_remark | SERVICE | referral program workflow |
| PANDIT_POOJA_APPROVED | pandit | pandit_pooja_approved | SERVICE | pooja request approval |
| PANDIT_APPROVED | pandit | pandit_approved | ACCOUNT | pandit account approval |
| KYC_APPROVED | pandit | kyc_approved | ACCOUNT | KYC verification status |
| KYC_REJECTED | pandit | kyc_rejected | ACCOUNT | KYC verification status |
| KYC_REUPLOAD_REQUIRED | pandit | kyc_reupload_required | ACCOUNT | KYC verification status |
| ACCOUNT_RESTORED | user | account_restored | ACCOUNT | account lifecycle |
| ACCOUNT_DELETED | user | account_deleted | ACCOUNT | account lifecycle |
| ACCOUNT_DELETION_CANCELLED | user | account_deletion_cancelled | ACCOUNT | account lifecycle |
| ACCOUNT_DELETION_REQUESTED | user | account_deletion_requested | ACCOUNT | account lifecycle |
| REFERRAL_BOOKING_CREATED | referral_pandit | referral_booking_created | BOOKING | booking created via referral |
| PAYOUT_RELEASED | pandit | payout_released | SERVICE | payout/settlement for services |

### Email (4)

| Event | Recipient | Purpose |
|---|---|---|
| OTP_VERIFICATION | user | ACCOUNT |
| OTP_VERIFICATION | pandit | ACCOUNT |
| PASSWORD_RESET_EMAIL_OTP | user | ACCOUNT |
| PASSWORD_RESET_EMAIL_OTP | pandit | ACCOUNT |

### In-App (2)

| Event | Recipient | Purpose |
|---|---|---|
| KIT_SHIPPED | user | ORDER |
| KIT_DELIVERED | user | ORDER |

**None of the 51 verified mappings is MARKETING** — consistent with the audit
finding that no marketing WhatsApp path exists today. The gate's marketing
branch is therefore future-proofing; when a marketing mapping is added it
will be consent-gated immediately.

## 4. NotificationMapping changes

`backend/src/models/NotificationMapping.js` — additive only:

```js
const PURPOSES = ['ACCOUNT', 'BOOKING', 'ORDER', 'SERVICE', 'MARKETING', 'UNKNOWN'];
purpose: { type: String, enum: PURPOSES, default: 'UNKNOWN', index: true }
```

- Default is `UNKNOWN` — **never** `MARKETING`, so existing mappings can
  never silently become marketing.
- Legacy documents (no field) read as `UNKNOWN` via Mongoose hydration; the
  gate treats anything other than exactly `'MARKETING'` as non-marketing.
- `module.exports.PURPOSES` exposed for consumers.
- Admin API: `purpose` added to `MAPPING_TRACKED_FIELDS` (version history +
  export), `MAPPING_EDITABLE_FIELDS` (PATCH), and the create / clone / import
  handlers (default `'UNKNOWN'`).

## 5. Consent gate location

**`WhatsAppChannel.send()`** — the single authoritative enforcement point.

Rationale (verified): it is the only place every NotificationEngine-driven
WhatsApp send passes through; it has `mapping` (purpose) and `recipient`
(the actual recipient's `userId`) in scope; it runs on every worker execution
(fresh consent read on retries). `WhatsAppProvider` stays a pure transport
layer — it never sees purpose or consent (it is deliberately not a business
decision layer).

## 6. Consent enforcement behavior

```js
if (mapping.purpose === 'MARKETING') {
  const consented = await consentService.hasMarketingConsent(recipient?.userId);
  if (!consented) {
    return { skip: true, reason: 'marketing_consent_missing', purpose, eventName };
  }
}
```

- The gate sits **before** the template/variable checks, so a blocked
  marketing message does no template work and — critically — **never calls
  Meta**.
- Blocked results flow through the existing skip path: job → `skipped`,
  `NotificationLog` records `status: 'skipped'`, `error:
  'marketing_consent_missing'`, plus event / recipient / purpose. No new
  logging architecture; no message content logged.
- `consentService` is the only consent reader (`hasMarketingConsent` → fresh
  `WhatsAppPreference` query). No caching of consent in memory.

## 7. Marketing behavior

| Recipient marketing state | Marketing WhatsApp message |
|---|---|
| `opted_in` | **SEND** |
| `opted_out` | **BLOCK** (`marketing_consent_missing`) |
| `not_set` | **BLOCK** |
| no `WhatsAppPreference` | **BLOCK** |
| invalid/sample userId (dry-run) | **BLOCK** (no throw) |

## 8. Non-marketing behavior

`ACCOUNT` / `BOOKING` / `ORDER` / `SERVICE` **always send**, exactly as
before, regardless of marketing consent. A user with `marketing =
opted_out` who has an active booking still receives booking confirmations,
reminders, OTPs, order updates, etc. The gate is a no-op for these purposes.

## 9. Missing preference behavior

- Marketing mapping + no `WhatsAppPreference` → treated as **not consented**
  → blocked. No preference is auto-created and no consent event is
  fabricated by the gate.
- Non-marketing mapping + no preference → **continues normally** (this is
  also `hasServicePermission`'s default behavior from Phase 2).

## 10. Missing purpose behavior

- A mapping with no purpose (legacy doc) or `UNKNOWN` (explicit default) is
  **never** treated as marketing and **never** blocks — behavior identical
  to before the gate existed.
- Visibility: `validateWhatsAppMappings()` (runs at every server boot, and
  inside the bootstrap run) now flags enabled WhatsApp mappings with **no
  purpose at all** (empty/absent) with a clear diagnostic:
  `no communication purpose set (Phase 5 consent classification) — re-run
  bootstrap v1.2.0 or set it in Admin > Notifications`. Explicit `UNKNOWN`
  on admin-created mappings is an intentional safe state and is not flagged.
- The gate itself logs nothing per-send for missing purpose (no log spam);
  boot-time validation is the "fail safely and visibly" channel.

## 11. Direct WhatsApp send inventory

| Path | Bypasses engine? | Purpose | Consent decision |
|---|---|---|---|
| `WhatsAppChannel.send` → `WhatsAppProvider.send` | No | all engine events | gated (this phase) |
| `src/utils/whatsapp.js` `sendWhatsApp` | — | legacy helper | **dead code — zero callers** |
| `NotificationEngine.emit(..., { channel: 'whatsapp' })` (OTP) | No | ACCOUNT (OTP_VERIFICATION / PASSWORD_RESET_WHATSAPP_OTP) | non-marketing → continues |

There are **no live direct calls** to the Meta API outside the channel.
Nothing was retrofitted; nothing was broken.

## 12. Bootstrap v1.2.0 changes

`backend/src/scripts/bootstrapNotificationMappings.js`:

- `BOOTSTRAP_VERSION` → `1.2.0` (header note documents the change).
- Every verified entry (45 WhatsApp + 4 Email + 2 In-App) carries
  `purpose`; the `otpEntry` helper sets `purpose: 'ACCOUNT'` for all six OTP
  entries.
- **Purpose fill-if-blank contract** (independent of channel content):
  - create → purpose stored with the mapping (`purpose-created`);
  - existing, purpose blank **or `UNKNOWN`** → filled with the verified
    purpose (`purpose-set`); `UNKNOWN` counts as blank because it is the
    schema default, never an explicit choice;
  - existing, purpose matches → no-op (`purpose-matches`);
  - existing, **explicit non-UNKNOWN purpose differs** → preserved untouched
    (`purpose-preserved`) — same customization-preservation principle as the
    channel-content fields.
- Report: per-mapping lines now show `— purpose: X`; a dedicated
  `## Purpose classification (Phase 5 — WhatsApp consent)` summary table
  counts created / set / matches / preserved.
- Testability (CLI behavior byte-identical): the auto-run IIFE became
  `run({ reportPath?, leaveConnected? })` guarded by `require.main ===
  module`; module exports the entries, apply functions, `purposeDelta`,
  `buildReportMarkdown`, and `run` for tests.

### Bootstrap idempotency results (disposable DB, `zutsav_bootstrap_cli_test`)

- Run 1: 51 mappings **created**, all with purpose (`exit 0`).
- Run 2: **0 created, 0 configured, 0 purpose-set; 51 already-correct** —
  zero unnecessary writes.
- The 45 "validation problems" seen in the CLI runs are the pre-existing
  template-sync prerequisite (no synced `WhatsAppTemplate` docs exist in a
  bare DB); the script's documented run order is startup → WhatsApp template
  sync → bootstrap. Not a regression.

## 13. Idempotency and retry behavior

- The gate re-reads consent on **every** `send()` execution — the mapping is
  re-fetched fresh by the Worker, and `hasMarketingConsent` queries MongoDB
  fresh. Nothing is cached in memory.
- Proven by test: job created while `opted_in` → user sends STOP → worker
  retry → **blocked**; later opt-in → message allowed again.

## 14. Race-condition behavior

If a marketing send passes the gate and the user sends STOP at nearly the
same time, the message that Meta has already accepted cannot be recalled —
that is the expected distributed-system boundary. The guarantee this phase
provides: **once the gate evaluates current consent at execution time, a
later STOP can never "unsend" an accepted message, and a STOP received
before execution always blocks.** No atomicity is claimed across the
gate→Meta hop (none is possible).

## 15. Tests

`backend/tests/consent-phase5-gate.test.js` (own DB:
`zutsav_consent_phase5_test` — separate from other suites because
`node --test` runs files concurrently). 24 tests, all passing:

- **Purpose model**: valid values accepted; invalid rejected; default
  `UNKNOWN`; legacy doc reads non-marketing.
- **Marketing gate**: `opted_in` → provider called; `opted_out`, `not_set`,
  no-preference, and invalid/sample userId → provider **not** called,
  `marketing_consent_missing`.
- **Non-marketing**: `ACCOUNT`/`BOOKING`/`ORDER`/`SERVICE` with marketing
  `opted_out` all still reach the provider; a mapping with **no purpose**
  continues unchanged.
- **Retry**: STOP between executions blocks the later attempt; opt-in
  re-allows.
- **Per-recipient**: same mapping, two users → one sends, one blocks.
- **Bootstrap fresh DB**: 51 created with purposes (spot-checked); second
  run = zero writes.
- **Bootstrap existing DB**: blank purpose filled (content untouched);
  admin-customized content preserved AND purpose filled; explicit admin
  purpose preserved; disabled mapping keeps disabled state; legacy
  non-bootstrap mapping never touched; email blank purpose filled; report
  contains purpose lines + summary.
- **Validation**: WhatsApp mapping without purpose flagged; with purpose not
  flagged.

## 16. Regression results

Full suite `cd backend && node --test`: **73/73 pass** (25 Phase 1–3 + 24
Phase 4 + 24 Phase 5). Frontend `npm run build` succeeds (only pre-existing
warnings in unrelated files). Verified unchanged: WhatsApp/Email OTP paths,
registration, notification engine, worker retry/skip mechanics, bootstrap
CLI behavior.

## 17. Files changed

| File | Change |
|---|---|
| `backend/src/models/NotificationMapping.js` | `purpose` enum field (default `UNKNOWN`) + `PURPOSES` export |
| `backend/notification-engine/channels/WhatsAppChannel.js` | consent gate at top of `send()` |
| `backend/notification-engine/bootstrap.js` | `validateWhatsAppMappings` flags WhatsApp mappings with no purpose |
| `backend/src/scripts/bootstrapNotificationMappings.js` | v1.2.0: purposes on all 51 entries, `purposeDelta`/`applyPurposeDelta`, report purpose section, `run()` + exports |
| `backend/src/controllers/admin.controller.js` | purpose in tracked/editable fields + create/clone/import |
| `backend/src/services/consentService.js` | `getPreference` tolerates non-ObjectId userId (dry-run safety) |
| `frontend/src/components/admin/NotificationEngineAdmin.jsx` | purpose selector in mapping modal + purpose badge on rows |
| `backend/tests/consent-phase5-gate.test.js` | new — 24 tests |

## 18. Files deliberately NOT changed

`WhatsAppProvider.js` (transport stays purpose-blind), `EventDispatcher.js`,
`MappingCache.js`, `NotificationJob.js`, `NotificationLog.js`,
`NotificationEngine.js`, `EventRegistry.js`, `TemplateEngine.js`,
`TemplateValidator.js`, `VariableSchemas.js`, `PayloadNormalizer.js`,
`OtpService.js`, `bootstrapNotificationMappings` **idempotency semantics**
(only version + purpose added), all WhatsApp templates, the Phase 4 webhook,
the OTP flow, Chatwoot (none in repo), booking/payment/order code, mobile
app, and the website (except the admin mapping UI).

## 19. Known limitations

- **No marketing path exists yet** — the gate's marketing branch is
  untested-in-production (tested in isolation).
- Admin-created mappings default to `UNKNOWN` and are not auto-classified;
  the admin must set purpose (new dropdown in Admin > Notifications).
- `PANDIT_REGISTERED`, `PANDIT_ASSIGNED`, `PANDIT_ASSIGNMENT_PENDING` are
  classified but have no live emitter (pre-existing dead mappings).
- `FEEDBACK_REQUEST` classified `SERVICE`; business review recommended
  (could be considered promotional).
- The boot-time purpose warning only fires for WhatsApp mappings with no
  purpose — `UNKNOWN`-explicit mappings are not flagged (deliberate).
- Skip results (`marketing_consent_missing`) are recorded via the existing
  job/log skip path; there is no dedicated "consent" status string.

## 20. Open business decisions

1. **FEEDBACK_REQUEST purpose** — SERVICE vs MARKETING (marketing would
   consent-gate it).
2. Whether the opt-out confirmation reply (Phase 4) and any future
   marketing templates need Meta template category updates.
3. Whether admin-created custom mappings should default to a purpose other
   than `UNKNOWN` (e.g. required at creation).
4. Whether marketing campaigns should ever be launched on this platform
   (none exist today) — the gate is ready when they are.

---

**Next recommended phase (after review): Phase 6 — Preference Center / User
Communication Preferences UI** (website + mobile), plus the admin consent
history view. Phase 7 would cover the optional opt-in keyword / resubscribe
inbound flow and opt-out confirmation templates.
