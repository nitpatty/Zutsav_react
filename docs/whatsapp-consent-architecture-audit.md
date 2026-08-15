# Zutsav WhatsApp Consent / Opt-In / Opt-Out — Architecture & Implementation-Impact Audit

**Status:** Read-only audit. No code, database, model, route, script, template, or notification mapping was modified to produce this document.
**Scope:** How the client's proposed WhatsApp consent architecture (from the client reference document) fits into the existing Zutsav platform — notification engine, bootstrap system, signup/OTP flow, Chatwoot, outbound WhatsApp sending, and all three clients (website, mobile, admin).
**Method:** Every statement below was verified by reading the actual repository code (paths cited inline). Nothing is assumed.

---

## 1. Executive Summary

### Existing architecture (verified)

Zutsav has a **mature, centralized, outbound-only WhatsApp notification system**:

```
Business controller / scheduled job
  → NotificationEngine.emit(EVENT, normalizedPayload, {channel?})
    → EventDispatcher.dispatch()
      → MappingCache.getEnabledMappings(EVENT)      [NotificationMapping collection, 30s TTL cache]
      → for each enabled mapping: resolveRecipients(recipientType, payload)   [user | pandit | admin | referral_pandit]
      → JobQueue.enqueue(...)                        [durable NotificationJob per mapping × recipient]
        → Worker (5s poll, batch 20)
          → ChannelRegistry.get(channel).send(mapping, payload, recipient)
             • WhatsAppChannel → TemplateEngine.render('whatsapp', …) → WhatsAppProvider → Meta Graph API
             • EmailChannel    → TemplateEngine.render('email', …)    → EmailProvider
             • InAppChannel    → TemplateEngine.render('inapp', …)    → Socket.IO + Notification doc
          → NotificationLog entry (delivered / failed / skipped / dead_letter)
```

Key verified facts:

1. **Every live outbound WhatsApp message already flows through ONE central path.** All senders call `NotificationEngine.emit(...)`; the worker routes every WhatsApp job through `WhatsAppChannel.send()` → `WhatsAppProvider.send()` (Meta Cloud API). The legacy `src/utils/whatsapp.js` `sendWhatsApp()` helper exists but has **zero callers** (dead code). The admin "test send" reuses the same channel path.
2. **The system never receives WhatsApp messages.** There is no Meta webhook route, no `hub.challenge` verification, no `x-hub-signature-256` validation anywhere in the backend. The client's Chatwoot is connected **directly** to the WhatsApp Cloud API webhook (external Meta-side configuration) and completely bypasses the Zutsav backend. There is **no Chatwoot code of any kind** in this repository.
3. **The signup flow verifies a phone number via WhatsApp OTP but persists nothing about it.** OTP verification lives in a transient `OTP` document (`purpose: 'registration'`, `verified: true`) that is **deleted** when the account is created. The `User` model has **no** `whatsappVerified`, no phone-verification timestamp, no communication preferences, and no consent fields.
4. **The notification system has no service-vs-marketing (purpose) concept.** `NotificationMapping` has `eventName / recipientType / channel / enabled / priority / label` and per-channel content, but no `purpose` field. `EventRegistry.EVENT_CATEGORIES` is a UI-grouping label (Auth/Payment/Booking/…), not a consent-gating concept. Meta's own template `category` (`MARKETING / UTILITY / AUTHENTICATION`) is synced and stored on `WhatsAppTemplate` but is not used for gating and does not map 1:1 to the client's required purpose taxonomy.
5. **There is no marketing WhatsApp path today.** `sendBroadcast` (Admin → Communication Center) creates **in-app** notifications only. `NEWSLETTER_SUBSCRIBED` is registered in the event registry but never emitted and has no mapping. So the consent gate's "marketing" branch has nothing to block yet — it is purely future-proofing.
6. **The bootstrap script (`src/scripts/bootstrapNotificationMappings.js`, v1.1.0) is the official initialization path** for notification mappings: 45 WhatsApp + 4 Email + 2 In-App = 51 verified mappings, idempotent, admin-customization-preserving, deterministic on a fresh DB, and it writes `docs/notification-bootstrap-report.md`.

### Client requirement (as documented)

- Node.js + MongoDB become the **source of truth** for WhatsApp consent (not Chatwoot, not Meta).
- Distinguish **A. number verification** (`whatsappVerified`) from **B. service/transactional** consent and **C. marketing** consent.
- Capture consent at signup with two separate opt-in statements (service vs marketing).
- Maintain **current preference state** (`whatsapp_preferences`) **plus immutable consent history** (`whatsapp_consent_events`).
- Detect **STOP / UNSUBSCRIBE / OPT OUT / CANCEL** from incoming WhatsApp messages, record an `OPT_OUT` event, update current state, and continue Chatwoot processing.
- **Centralize** all outbound sending behind a consent-checked messaging service.
- Never delete opt-out history; support re-opt-in cycles.

### Bottom line

The existing architecture is **unusually well positioned** for this requirement:

- The centralized `NotificationEngine.emit()` → channel → provider pipeline means a consent gate can be inserted in exactly **one** place (`WhatsAppChannel.send()`, or one layer above it in the dispatcher) to cover every existing outbound WhatsApp message.
- The `NotificationMapping` model is the correct home for a per-mapping `purpose` field, and the bootstrap script is the correct home for the verified default classification.
- The two genuinely **new** pieces the client requires are (a) an **inbound WhatsApp webhook** (Meta → backend, signature-verified) that does not exist today, and (b) the **consent data model** (`WhatsAppPreference` + `WhatsAppConsentEvent`) plus a consent service and preference APIs.
- **No second notification system should be built.** The existing engine, queue, retry, logging, admin UI, and bootstrap all accommodate the change with small, additive modifications.

---

## 2. Existing WhatsApp Architecture (verified flow)

### 2.1 Outbound (the only direction that exists today)

| Layer | File | Responsibility |
|---|---|---|
| Public API | `backend/notification-engine/NotificationEngine.js` | `emit(eventName, payload, {channel})` — fire-and-forget, never throws |
| Registry | `backend/notification-engine/EventRegistry.js` | Canonical `EVENTS` (72 events) + `EVENT_CATEGORIES` (UI grouping) |
| Dispatcher | `backend/notification-engine/core/EventDispatcher.js` | Looks up enabled mappings (cached), resolves recipients, enqueues one `NotificationJob` per mapping × recipient |
| Mapping cache | `backend/notification-engine/core/MappingCache.js` | 30s TTL in-process cache of `NotificationMapping.find({eventName, enabled:true})`, invalidated on script writes (admin writes rely on TTL expiry — see Risks) |
| Queue | `backend/notification-engine/queue/JobQueue.js` | MongoDB-backed durable queue, atomic claim, exponential backoff (30s→30min cap), dead-letter after 5 attempts |
| Worker | `backend/notification-engine/queue/Worker.js` | 5s poll, batch 20, writes `NotificationLog` |
| Channel registry | `backend/notification-engine/channels/ChannelRegistry.js` | `register/get/has` plugin map |
| WhatsApp channel | `backend/notification-engine/channels/WhatsAppChannel.js` | Template resolution (`mapping.whatsappTemplateName` only), structural variable pre-flight (`buildVariableChecklist`), renders + sends |
| Provider | `backend/notification-engine/providers/WhatsAppProvider.js` | Pure Meta Cloud API primitive: `POST {graphApiBase}/{apiVersion}/{phoneNumberId}/messages`, phone normalization (10-digit → `91…` E.164), template language lookup, throws on Meta error |
| Template engine | `backend/notification-engine/templates/TemplateEngine.js` | Channel-aware render; WhatsApp builds `components` from `whatsappVariables` + optional copy-code button |
| Variable resolver | `backend/notification-engine/variables/VariableResolver.js` | `{{path}}` interpolation, `buildWhatsAppComponents`, OTP copy-code button handling |
| Payload normalizer | `backend/notification-engine/variables/PayloadNormalizer.js` | Canonical payload shape (`customer/booking/payment/order/pandit/kit/refund/otp/account/…`) + legacy aliases |
| Template validator | `backend/notification-engine/templates/TemplateValidator.js` | Per-event `REQUIRED_VARIABLES` check before send |
| Template model | `backend/src/models/WhatsAppTemplate.js` | Meta-synced templates: `name, metaId, language, category (MARKETING/UTILITY/AUTHENTICATION), status (APPROVED/…), components, isActive, syncedAt` |
| Logging | `backend/notification-engine/logging/NotificationLogger.js` + `backend/src/models/NotificationLog.js` | Every send attempt/result |
| Boot audit | `backend/notification-engine/bootstrap.js` | At startup, validates every enabled WhatsApp mapping's variable count against the synced Meta template |

**Where the consent gate belongs:** `WhatsAppChannel.send()` is the single funnel every WhatsApp message passes through (including admin test sends). A consent check inserted there — or, cleaner, as a `purpose`-aware check in `EventDispatcher.dispatch()` before enqueue — covers 100% of existing outbound paths. See Section 11.

### 2.2 Inbound (does not exist)

- No `POST /api/webhooks/whatsapp` (or similar) route.
- No `hub.challenge` / verify-token handling.
- No `X-Hub-Signature-256` / Meta webhook secret validation.
- No code that consumes WhatsApp `messages` / `statuses` webhook payloads.
- The only "webhooks" in the repo are **PhonePe payment callbacks** (`booking.routes.js`, `checkout.routes.js`, `marketplace.routes.js`).

**Implication:** the client's "incoming STOP" flow is not a modification of an existing path — it is a **net-new inbound webhook** plus reconfiguration of the Meta app's webhook subscription (currently pointed at Chatwoot) to also/instead hit the Zutsav backend. The webhook can be added to the backend without touching Chatwoot; the two consumers (Zutsav + Chatwoot) can both subscribe to the same Meta webhook fields. This is a Meta-side configuration decision that needs human confirmation (Section 21).

### 2.3 WhatsApp template lifecycle

- Templates are synced from Meta via Admin (Communication → WhatsApp Templates, `comm.controller.js syncWhatsAppTemplates`) into `WhatsAppTemplate`.
- The channel resolves the template **only** by `mapping.whatsappTemplateName`. The legacy `WhatsAppTemplate.assignedTrigger` mechanism is explicitly unused (documented in `WhatsAppChannel.js`).
- `WhatsAppTemplate.category` (Meta's MARKETING/UTILITY/AUTHENTICATION) is synced but **not** used for routing or gating anywhere.

---

## 3. Existing Notification Engine (verified flow)

### 3.1 Core concepts

| Concept | Implementation | Notes |
|---|---|---|
| Event | `EventRegistry.EVENTS` (72 constants) | SCREAMING_SNAKE_CASE; "must never be changed after release" |
| Mapping | `NotificationMapping` (collection) | One row = one (event × recipientType × channel) config with per-channel content |
| Recipient types | `user, pandit, admin, referral_pandit` | Resolved in `EventDispatcher.resolveRecipients`; `admin` = all `User.find({role:'admin'})` |
| Channels | `whatsapp, email, inapp` | Registry plugins; `NotificationJob.channel` enum also lists `sms/push/webhook` (unused) |
| Job | `NotificationJob` | Durable, status-guarded (`queued→processing→delivered|failed|retrying|dead_letter|skipped|cancelled`) |
| Log | `NotificationLog` | Written by Worker per job; searchable in Admin |
| Versioning | `NotificationMappingVersion` | Snapshot on create/update/toggle/restore; admin can restore |
| Cache | `MappingCache` | 30s TTL; invalidated by scripts, self-heals for admin edits |

### 3.2 How a mapping is selected

`MappingCache.getEnabledMappings(eventName)` → `NotificationMapping.find({ eventName, enabled: true }).sort({ priority: -1 })`. No other predicate. **A mapping never knows the "purpose" of the message it produces.**

### 3.3 How content is rendered

- WhatsApp: `TemplateEngine.render('whatsapp')` → `buildWhatsAppComponents(mapping.whatsappVariables, payload, buttonConfig)` → `WhatsAppProvider.send()`.
- Email: `emailSubject`/`emailHtml` with `{{path}}` interpolation.
- In-app: `inAppTitle`/`inAppMessage` → `createNotification()` (Socket.IO `new_notification`).

### 3.4 Admin surface

`AdminDashboard.jsx` → `NotificationEngineAdmin.jsx` (1,043 lines) provides: event list grouped by `EVENT_CATEGORIES`, mapping CRUD, clone, toggle, dry-run/test (with real variable checklist), import/export, history/restore, logs, retry. Routes: `/api/admin/notifications/*` (see `admin.routes.js` lines 144–164).

---

## 4. Existing Chatwoot Architecture (verified flow)

**There is no Chatwoot integration in this repository.**

- `grep -ri chatwoot` across `backend/src`, `backend/notification-engine`, and backend root: **zero matches**.
- No Chatwoot service, model, route, controller, webhook handler, or env configuration exists.
- The client's stated setup — "Chatwoot connected to WhatsApp Cloud API using webhooks" — is configured entirely on the **Meta / Chatwoot side**, and incoming messages currently flow:

```
Customer → WhatsApp Cloud API → Webhook → Chatwoot (contact/conversation)
```

The Zutsav backend is **not** in this path and has no visibility into incoming messages.

**Impact on the consent architecture:**

- The client's Rule 3 ("Node.js + MongoDB source of truth") and Rule 7 ("process incoming WhatsApp messages through the backend webhook") require **building the backend webhook from scratch**.
- Since Meta webhooks can deliver to multiple configured endpoints, Chatwoot can remain untouched; the backend webhook becomes an additional consumer. Confirm which Meta webhook fields are enabled and whether one app can deliver the same payload to both (Section 21).
- **No code conflict with Chatwoot exists** — nothing in the backend would double-process messages today, so the "duplicate processing risk" is limited to Meta-side retry/duplicate deliveries (handled via `wamid` idempotency, Section 12).

---

## 5. Existing Signup / WhatsApp OTP Flow (verified flow)

### 5.1 Website (`frontend/src/pages/Register.jsx`)

Steps: role (devotee/pandit) → name/email/phone → OTP channel (email | whatsapp) → enter OTP → password (+ optional referral code) → `complete-registration` → auto-login.

**There is no consent checkbox, no communication-preferences step, and no marketing opt-in anywhere in the signup UI.** (Verified: no `consent`, `marketing`, `opt-in`, `preference` matches in `Register.jsx`.)

### 5.2 Backend (`backend/src/controllers/auth.controller.js`)

| Endpoint | Behavior (verified) |
|---|---|
| `POST /api/auth/send-otp` | Validates name/email/phone; uniqueness checks; deletes prior `OTP` docs for (identifier, `purpose:'registration'`); creates `OTP` doc (plaintext code); `NotificationEngine.emit('OTP_VERIFICATION', normalizeUserPayload({user:{name,email,phone}, otp}), {channel})` — channel-restricted so a WhatsApp OTP never also emails |
| `POST /api/auth/verify-otp` | Finds `OTP` by (identifier, purpose); rate-limits attempts (5); plaintext compare; sets `verified: true` |
| `POST /api/auth/complete-registration` | Requires a `verified:true` OTP record for (identifier, purpose `'registration'`); creates `User` (and `Pandit` for role=pandit); **deletes the OTP record**; emits `USER_REGISTERED`; returns JWT |
| `POST /api/auth/register` | Legacy no-OTP registration (kept for backward compat/seeding) |
| `POST /api/auth/register-pandit` | Pandit application flow — **no OTP**; creates User + Pandit(pending) |

Password reset (`passwordReset.controller.js`) and pandit KYC document view (`pandit.controller.js`) also emit OTP events through the same engine.

### 5.3 `OTP` model (`backend/src/models/OTP.js`)

`identifier (email|phone), channel (email|whatsapp), otp, purpose, verified, attempts, resendCount, lastSentAt, createdAt (TTL 10 min)`.

### 5.4 `User` model (`backend/src/models/User.js`)

Phone is **required, 10-digit Indian format** (`/^[6-9]\d{9}$/`), unique among non-deleted accounts. **No `whatsappVerified` field. No phone-verification timestamp. No communication preferences. No consent fields. No marketing flag.**

**Consequence:** today the system cannot answer "was this user's number WhatsApp-verified?" — the evidence is a transient OTP record that is deleted at registration, and the `User` doc records nothing. The client's `whatsappVerified` concept therefore requires a **new persisted field** (or the preference doc becomes its home).

---

## 6. Outbound WhatsApp Message Inventory (every sender, verified)

Every outbound WhatsApp message in the repo is produced through the **central engine path**. There are no direct Meta API calls outside the two provider modules (`notification-engine/providers/WhatsAppProvider.js` — live; `src/utils/whatsapp.js` — dead, zero callers).

| # | File / Function | Event(s) | Recipient | Goes through central path? | Notes |
|---|---|---|---|---|---|
| 1 | `booking.controller.js onPaymentSuccess` | `PAYMENT_SUCCESS`, `BOOKING_CONFIRMED` | user | ✅ | Also fires referral notifications |
| 2 | `booking.controller.js onPartialPaymentSuccess` | `PARTIAL_PAYMENT_RECEIVED` | user | ✅ | |
| 3 | `booking.controller.js onFinalPaymentSuccess` | `FINAL_PAYMENT_RECEIVED` | user | ✅ | |
| 4 | `booking.controller.js` (cancel) | `BOOKING_CANCELLED` | user | ✅ | |
| 5 | `booking.controller.js` (completion OTP) | `SERVICE_COMPLETION_OTP` | user | ✅ | |
| 6 | `booking.controller.js` (complete) | `INVOICE_GENERATED`, `FEEDBACK_REQUEST` | user | ✅ | |
| 7 | `booking.controller.js fireReferralNotifications` | `REFERRAL_BOOKING_CREATED`, `REFERRAL_PENDING_REMARK` | referral_pandit / pandit | ✅ | |
| 8 | `checkout.controller.js` (cart webhook) | `BOOKING_CONFIRMED` | user | ✅ | Two branches (success + failure paths) |
| 9 | `marketplace.controller.js` | `ORDER_PLACED` | user | ✅ | |
| 10 | `admin.controller.js` (order status) | `ORDER_CONFIRMED`/`ORDER_PACKED`/`ORDER_SHIPPED`/`ORDER_OUT_FOR_DELIVERY`/`ORDER_DELIVERED` | user | ✅ | Dynamic event name |
| 11 | `admin.controller.js` (order cancel/refund) | `ORDER_CANCELLED`, `ORDER_REFUNDED` | user | ✅ | |
| 12 | `admin.controller.js` (shipment) | `KIT_SHIPPED`, `KIT_DELIVERED` | user | ✅ | |
| 13 | `admin.controller.js` (delivery OTP) | `DELIVERY_OTP_SENT` | user | ✅ | |
| 14 | `admin.controller.js` (pandit assignment) | `PANDIT_ASSIGNMENT_PENDING` | pandit | ✅ | |
| 15 | `admin.controller.js` (booking refund) | `BOOKING_REFUNDED` | user | ✅ | |
| 16 | `admin.controller.js` (KYC review) | `KYC_APPROVED` / `KYC_REJECTED` / `KYC_REUPLOAD_REQUIRED` | pandit | ✅ | |
| 17 | `admin.controller.js` (pandit approval) | `PANDIT_APPROVED` | pandit | ✅ | |
| 18 | `admin.controller.js` (payout) | `PAYOUT_RELEASED` | pandit | ✅ | |
| 19 | `pandit.controller.js` (KYC submit) | `KYC_SUBMITTED` | admin | ✅ | No WhatsApp mapping today |
| 20 | `pandit.controller.js` (accept) | `PANDIT_ACCEPTED` | user | ✅ | |
| 21 | `pandit.controller.js` (reject) | `PANDIT_REJECTED` | admin | ✅ | No WhatsApp mapping today |
| 22 | `pandit.controller.js` (KYC view OTP) | `OTP_VERIFICATION` | pandit | ✅ | channel-restricted |
| 23 | `poojaRequest.controller.js` | `PANDIT_POOJA_REQUEST_CREATED` / `PANDIT_POOJA_APPROVED` / `PANDIT_POOJA_REJECTED` | admin / pandit | ✅ | |
| 24 | `referral.controller.js` | `REFERRAL_REMARK_SUBMITTED` | admin | ✅ | No WhatsApp mapping today |
| 25 | `auth.controller.js` (send-otp) | `OTP_VERIFICATION` | user | ✅ | channel-restricted; pre-registration (no userId) |
| 26 | `auth.controller.js` (deletion OTP) | `OTP_VERIFICATION` | user | ✅ | |
| 27 | `auth.controller.js` (complete registration) | `USER_REGISTERED` | user | ✅ | |
| 28 | `auth.controller.js` (deletion confirm/cancel) | `ACCOUNT_DELETION_REQUESTED` / `ACCOUNT_RESTORED` | user | ✅ | |
| 29 | `passwordReset.controller.js` | `PASSWORD_RESET_EMAIL_OTP` / `PASSWORD_RESET_WHATSAPP_OTP` | user / pandit | ✅ | channel-restricted |
| 30 | `adminManagement.controller.js` | `ADMIN_CREATED`/`ADMIN_UPDATED`/`ADMIN_SUSPENDED`/`ADMIN_ACTIVATED`/`ADMIN_PASSWORD_RESET` | admin | ✅ | No WhatsApp mappings today |
| 31 | `admin.controller.js` (admin login/logout) | `ADMIN_LOGIN` / `ADMIN_LOGOUT` | admin | ✅ | No WhatsApp mappings today |
| 32 | `cleanupJobs.js` (scheduled) | `SERVICE_REMINDER_24H`, `SERVICE_REMINDER_1H`, `FEEDBACK_REQUEST`, `INVOICE_GENERATED`, `ACCOUNT_DELETED` | user | ✅ | Cron-driven |
| 33 | `paymentAttempts.js` | `PAYMENT_FAILED` | user | ✅ | PhonePe terminal-failure sweep |
| 34 | `admin.controller.js testNotificationMapping ({send:true})` | any | admin-chosen | ✅ | Dry-run with real send — same `WhatsAppChannel.send` |
| 35 | `admin.controller.js sendBroadcast` | — | users/pandits | ⚠️ **In-app only** | Creates `Notification` docs; never WhatsApp |

**Conclusion:** the system is already centralized for outbound WhatsApp. **Zero bypass paths exist in live code.** The consent gate needs exactly one insertion point (Section 11).

---

## 7. Existing WhatsApp Event Inventory (classified by purpose)

Basis: the 45 WhatsApp mappings in `bootstrapNotificationMappings.js` (VERIFIED_MAPPINGS), cross-checked against emitters. Client taxonomy: ACCOUNT / BOOKING / ORDER / SERVICE / MARKETING.

### 7.1 ACCOUNT / AUTH (number verification, security, account lifecycle)

| Event | Recipient | Template | Emitted? |
|---|---|---|---|
| OTP_VERIFICATION | user | `whatsapp_verification` | ✅ (signup, deletion OTP) |
| OTP_VERIFICATION | pandit | `whatsapp_verification` | ✅ (KYC view OTP) |
| PASSWORD_RESET_WHATSAPP_OTP | user | `whatsapp_verification` | ✅ |
| PASSWORD_RESET_WHATSAPP_OTP | pandit | `whatsapp_verification` | ✅ |
| USER_REGISTERED | user | `new_user_registered` | ✅ |
| ACCOUNT_RESTORED | user | `account_restored` | ✅ |
| ACCOUNT_DELETED | user | `account_deleted` | ✅ |
| ACCOUNT_DELETION_CANCELLED | user | `account_deletion_cancelled` | ✅ |
| ACCOUNT_DELETION_REQUESTED | user | `account_deletion_requested` | ✅ |

### 7.2 BOOKING / PAYMENT / SERVICE (user-facing)

| Event | Recipient | Template | Emitted? |
|---|---|---|---|
| PAYMENT_SUCCESS | user | `payment_success` | ✅ |
| PARTIAL_PAYMENT_RECEIVED | user | `partial_payment_received` | ✅ |
| FINAL_PAYMENT_RECEIVED | user | `final_payment_received` | ✅ |
| PAYMENT_FAILED | user | `payment_failed` | ✅ |
| BOOKING_CONFIRMED | user | `booking_confirmed` | ✅ |
| BOOKING_CANCELLED | user | `booking_cancelled` | ✅ |
| BOOKING_REFUNDED | user | `booking_refunded` | ✅ |
| SERVICE_REMINDER_24H | user | `service_reminder_24h` | ✅ (cron) |
| SERVICE_REMINDER_1H | user | `service_reminder_1h` | ✅ (cron) |
| SERVICE_COMPLETION_OTP | user | `whatsapp_verification` | ✅ |
| SERVICE_COMPLETED | user | `service_completed` | ✅ |
| INVOICE_GENERATED | user | `invoice_generated` | ✅ |
| FEEDBACK_REQUEST | user | `feedback_request` | ✅ (cron + completion) |
| KIT_SHIPPED | user | `kit_shipped` | ✅ |
| KIT_DELIVERED | user | `kit_delivered` | ✅ |
| PANDIT_ACCEPTED | user | `pandit_accepted` | ✅ |
| PANDIT_ASSIGNED | user | `pandit_assigned` | ❌ **never emitted** (mapping exists, no trigger site) |

### 7.3 PANDIT-FACING (service, pandit recipients)

| Event | Recipient | Template | Emitted? |
|---|---|---|---|
| PANDIT_ASSIGNMENT_PENDING | pandit | `pandit_assignment_pending` | ✅ |
| PANDIT_POOJA_REJECTED | pandit | `pandit_pooja_rejected` | ✅ |
| PANDIT_POOJA_APPROVED | pandit | `pandit_pooja_approved` | ✅ |
| PANDIT_REGISTERED | pandit | `pandit_registered` | ❌ **never emitted** |
| PANDIT_APPROVED | pandit | `pandit_approved` | ✅ |
| KYC_APPROVED | pandit | `kyc_approved` | ✅ |
| KYC_REJECTED | pandit | `kyc_rejected` | ✅ |
| KYC_REUPLOAD_REQUIRED | pandit | `kyc_reupload_required` | ✅ |
| PAYOUT_RELEASED | pandit | `payout_released` | ✅ |
| REFERRAL_BOOKING_CREATED | referral_pandit | `referral_booking_created` | ✅ |
| REFERRAL_PENDING_REMARK | pandit | `referral_pending_remark` | ✅ |

### 7.4 ORDER (marketplace, user-facing)

| Event | Recipient | Template | Emitted? |
|---|---|---|---|
| ORDER_CONFIRMED | user | `order_confirmed` | ✅ |
| ORDER_PACKED | user | `order_packed` | ✅ |
| ORDER_SHIPPED | user | `order_shipped` | ✅ |
| ORDER_OUT_FOR_DELIVERY | user | `order_out_for_delivery` | ✅ |
| ORDER_DELIVERED | user | `order_delivered` | ✅ |
| ORDER_CANCELLED | user | `order_cancelled` | ✅ |
| ORDER_REFUNDED | user | `order_refunded` | ✅ |
| DELIVERY_OTP_SENT | user | `whatsapp_verification` | ✅ |

### 7.5 MARKETING

**None.** No marketing WhatsApp mapping exists. `NEWSLETTER_SUBSCRIBED` is registered but never emitted and has no mapping. Admin broadcast is in-app only.

### 7.6 NEEDS HUMAN REVIEW

- `FEEDBACK_REQUEST` — service follow-up; borderline with "engagement". Default classification SERVICE, confirm with business.
- `PANDIT_ASSIGNED` / `PANDIT_REGISTERED` — bootstrap mappings with **no emitter** (dead/pre-wired). Leave mapping; flag for cleanup or wire the emitter.
- Registered-but-never-emitted events with no mappings (18): `OTP_CREATED, OTP_VERIFIED, LOGIN_SUCCESS, LOGIN_FAILED, BOOKING_CREATED, BOOKING_COMPLETED, PAYMENT_CREATED, ORDER_CREATED, ORDER_PAID, REFUND_INITIATED, REFUND_COMPLETED, MARKETPLACE_ORDER, BLOG_PUBLISHED, FESTIVAL_CREATED, TEMPLE_CREATED, NEWSLETTER_SUBSCRIBED, ADMIN_*` (some) — no WhatsApp impact; ignore for consent purposes.
- Emitted events with **no WhatsApp mapping** (won't send anyway): `KYC_SUBMITTED, PANDIT_REJECTED, REFERRAL_REMARK_SUBMITTED, ADMIN_*`, `ADMIN_LOGIN/LOGOUT` — no consent impact.

---

## 8. Consent Architecture Gap Analysis

| Client requirement | Exists today? | Gap |
|---|---|---|
| Node.js + MongoDB as consent source of truth | ✅ MongoDB is central; backend owns all business logic | None structurally |
| Centralized outbound WhatsApp sending | ✅ One engine path; zero bypasses | Consent gate insertion only |
| Distinguish number-verification vs service vs marketing | ❌ | Needs `whatsappVerified` persistence + purpose taxonomy |
| Capture consent at signup (2 separate statements) | ❌ | Needs UI (web/mobile) + API + storage |
| Current-preference state collection | ❌ | New `WhatsAppPreference` |
| Immutable consent-event history | ❌ | New `WhatsAppConsentEvent` |
| Inbound webhook with STOP detection | ❌ (no inbound at all) | Net-new Meta webhook route + signature verification + keyword engine + Chatwoot passthrough |
| Consent gate on every outbound message | ❌ | Insert in channel/dispatcher layer |
| Never delete opt-out history | ❌ | New event collection design |
| Preference center (users) | ❌ | New UI + API |
| Admin visibility (consent history, current state) | ❌ | New admin UI + API |
| Service messages unaffected by marketing opt-out | n/a (no marketing today) | Design rule: purpose-scoped gating |

---

## 9. Database Changes Required (design only — NOT implemented)

### 9.1 `User` (existing collection)

Additive, optional field (backward compatible):

```
whatsappVerified:  { type: Boolean, default: false }
whatsappVerifiedAt:{ type: Date,    default: null }
```

- Set on `complete-registration` only when the verified OTP channel was `whatsapp` (currently the `channel` field on the OTP record — already available at that point, before the record is deleted).
- **Do not** interpret this as marketing consent (client Rule 1).

### 9.2 `WhatsAppPreference` (new collection — justified)

Why a separate collection rather than more `User` fields:
- Per-channel (whatsapp/email/sms) × per-purpose (service/marketing) state would bloat `User` and require frequent updates to a hot, frequently-read document (JWT-protected profile reads) — preferences change rarely and are read at send-time, a different access pattern.
- Mirrors the client's own model; keeps `User` clean; enables future channels (email/sms) without schema churn.

Shape (matching the client reference, adapted to codebase conventions):

```
{
  userId:        ObjectId (ref User, unique — one current-preference doc per user),
  phone:         String (E.164 digits, normalized same as WhatsAppProvider.normalizePhone),
  whatsappVerified: Boolean,
  whatsapp: {
    service:   { status: 'opted_in'|'opted_out'|'not_set', source: 'signup'|'signup_checkbox'|'whatsapp_keyword'|'preference_center'|'admin', timestamp: Date },
    marketing: { status: ..., source: ..., timestamp: Date }
  },
  email: { service: {...}, marketing: {...} },   // future-proof (client §9)
  sms:   { service: {...}, marketing: {...} },
  lastOptInAt: Date, lastOptOutAt: Date,
  updatedAt, createdAt
}
```

Indexes: `{ userId: 1 }` unique; `{ phone: 1 }` (lookup by phone from webhook); `{ 'whatsapp.marketing.status': 1 }` if admin ever broadcasts. Do not create in this audit.

### 9.3 `WhatsAppConsentEvent` (new collection — justified)

Immutable append-only audit trail. Shape per client reference:

```
{
  userId, phone,
  channel: 'whatsapp',
  purpose: 'service'|'marketing',
  action:  'OPT_IN'|'OPT_OUT',
  source:  'signup'|'signup_checkbox'|'whatsapp_keyword'|'preference_center'|'admin',
  consentText: String,      // exact text shown (signup/preference center)
  consentVersion: String,   // e.g. 'v1.0'
  timestamp: Date,
  ipAddress, userAgent,
  whatsappMessageId: String // wamid when source = whatsapp_keyword
}
```

Indexes: `{ userId: 1, timestamp: -1 }`, `{ phone: 1, timestamp: -1 }`, `{ whatsappMessageId: 1 }` unique-sparse (idempotency key). Immutability: no update/delete routes; admin read-only.

### 9.4 `NotificationMapping` (existing collection)

Add a nullable, backward-compatible field (design decision — see §16 for rationale):

```
purpose: { type: String, enum: ['ACCOUNT','BOOKING','ORDER','SERVICE','MARKETING','UNKNOWN'], default: 'UNKNOWN' }
```

`UNKNOWN` default keeps every existing document safe until classified; a pre-send guard that only blocks `MARKETING` without consent means **no existing mapping is ever blocked by the default**. Classify via bootstrap (§17).

### 9.5 `NotificationJob` (existing collection)

No change required. The purpose can ride along inside `normalizedPayload` (or be derived from the mapping at send time — the job stores `mappingId`).

---

## 10. API Changes Required (design only — NOT implemented)

| Endpoint (conceptual; follow existing route style) | Purpose | Notes |
|---|---|---|
| `POST /api/auth/send-otp` (modify) | Accept optional consent flags (`serviceConsent`, `marketingConsent`) — actually better captured at `complete-registration` | Keep OTP flow unchanged; consent is a registration-time decision |
| `POST /api/auth/complete-registration` (modify) | Accept `serviceConsent` / `marketingConsent` booleans; create `WhatsAppPreference`; write `WhatsAppConsentEvent` (source `signup`/`signup_checkbox`); set `whatsappVerified` when channel = whatsapp | Smallest change; atomic with account creation |
| `GET  /api/users/me/communication-preferences` | Current prefs for the logged-in user | Auth-protected (`protect` middleware) |
| `PUT  /api/users/me/communication-preferences` | Update service/marketing per channel | Records `OPT_IN`/`OPT_OUT` events with source `preference_center`, IP, UA |
| `POST /api/webhooks/whatsapp` (new) | Meta webhook: GET = `hub.challenge` verification; POST = message/status delivery | **Must** verify `X-Hub-Signature-256`; return `200` fast; enqueue consent processing |
| `GET  /api/admin/users/:id/consent` | Admin read of current prefs + event history | Admin-protected; read-only history |
| (optional) `POST /api/admin/users/:id/consent/override` | Admin-initiated preference change (audited) | High-risk; require explicit business approval (§21) |

Design principle: **no client-side pricing/consent authority** — the backend remains the source of truth, consistent with the existing engine philosophy.

---

## 11. Webhook Changes Required (design only — NOT implemented)

### 11.1 New inbound path

```
Meta (messages field) → POST /api/webhooks/whatsapp
  → verify X-Hub-Signature-256 (HMAC-SHA256 of raw body with webhook secret)
  → parse entry[0].changes[0].value.messages[] / .statuses[]
  → for each message:
      - id (wamid) → idempotency check (duplicate/replay guard)
      - from (phone) → normalize E.164 → find user by phone
      - text.body → keyword classifier (STOP/UNSUBSCRIBE/OPT OUT/CANCEL + variants)
      - if opt-out keyword → consent engine: update current preference + append event + (optionally) confirmation reply
      - forward to Chatwoot (or leave Chatwoot as-is if Meta delivers to both) → see §12
  → always respond 200 within Meta's timeout
```

### 11.2 Where it fits in the existing stack

- New route in `backend/src/routes/` mounted in `app.js` (outside `/api/` rate limiter if Meta retries cause 429s — mount on a path that bypasses `apiLimiter`, or whitelist).
- Reuse `settingsService` for the webhook secret (same pattern as `whatsappPhoneNumberId`/`whatsappAccessToken`).
- Reuse `extractRequestMeta`/`audit()` for any admin-tier actions on consent.
- Put keyword logic + preference writes in a **new consent service** (`backend/src/services/` convention: `consentService.js` or `backend/notification-engine/` style module), not inline in the route.

### 11.3 Duplicate / replay protection

- Meta retries deliveries; the same `wamid` can arrive twice.
- `WhatsAppConsentEvent.whatsappMessageId` unique-sparse index → second insert fails → return 200 without re-processing. This is the natural idempotency key; no separate queue needed.

---

## 12. Website / Mobile / Admin Impact (audit — no UI changes made)

### 12.1 Website (`frontend/`)

| Surface | Current | Required change |
|---|---|---|
| `Register.jsx` | Steps: role → info → channel → OTP → password | Add consent step/checkbox: (a) service messages — pre-checked/recommended; (b) marketing — **unchecked by default**. Pass flags to `complete-registration`. Client Rule 1: OTP ≠ marketing consent |
| `Settings.jsx` | "Notifications" tab = link to list; "Preferences" = language only (FuturePreferenceRow placeholder) | Add Communication Preferences section (WhatsApp service/marketing toggles; future email/sms) wired to new endpoints |
| Profile (`Profile.jsx`, `UserDashboard.jsx`) | No preference UI | Optional link to preferences; display `whatsappVerified` badge |

### 12.2 Mobile (`mobile-app/`)

| Surface | Current | Required change |
|---|---|---|
| `screens/auth/RegisterScreen.jsx`, `VerificationChannelScreen.jsx`, `SetPasswordScreen.jsx` | No consent UI (verified: no consent/marketing matches in auth screens) | Same dual-consent step as web |
| `screens/user/SettingsScreen.jsx` | Theme picker only | Add Communication Preferences screen |
| `screens/user/ProfileScreen.jsx` | Menu; "Preferences" links to settings | Wire to new prefs screen |

### 12.3 Admin (`AdminDashboard.jsx` + components)

| Surface | Current | Required change |
|---|---|---|
| `components/admin/NotificationEngineAdmin.jsx` | Mapping form: event/channel/recipient/content; no purpose | Add `purpose` select (ACCOUNT/BOOKING/ORDER/SERVICE/MARKETING/UNKNOWN); display badge on mapping rows; filter by purpose |
| New: user consent view | — | Per-user: WhatsApp verified, service/marketing status, last opt-in/out, source, full event timeline (read-only) |
| New: broadcast | `sendBroadcast` is in-app only | If WhatsApp broadcast is ever added, it MUST go through the engine as a MARKETING mapping (consent-gated). Do not build a direct-to-Meta path |

---

## 13. WhatsApp Template Changes (audit)

**Do not assume new templates are required.** Every message the client enumerates (booking/order/account/service confirmations, OTP) already has an approved template wired through the bootstrap:

### 13.1 Existing templates that can be reused (no change)

- `whatsapp_verification` — OTP (AUTHENTICATION category; also used for service-completion OTP, delivery OTP, password reset)
- `booking_confirmed`, `booking_cancelled`, `booking_refunded`
- `payment_success`, `partial_payment_received`, `final_payment_received`, `payment_failed`
- `service_reminder_24h`, `service_reminder_1h`, `service_completed`, `invoice_generated`, `feedback_request`
- `kit_shipped`, `kit_delivered`
- `order_confirmed`, `order_packed`, `order_shipped`, `order_out_for_delivery`, `order_delivered`, `order_cancelled`, `order_refunded`
- `new_user_registered`, `account_restored`, `account_deleted`, `account_deletion_cancelled`, `account_deletion_requested`
- `pandit_assignment_pending`, `pandit_pooja_approved`, `pandit_pooja_rejected`, `pandit_registered`, `pandit_approved`, `kyc_approved`, `kyc_rejected`, `kyc_reupload_required`, `payout_released`, `referral_booking_created`, `referral_pending_remark`, `pandit_accepted`, `pandit_assigned`

### 13.2 New templates potentially required (human review)

| Message | Verdict |
|---|---|
| **Opt-out confirmation** ("You've been unsubscribed from marketing messages… You can resubscribe anytime") | **NEW TEMPLATE MAY BE REQUIRED** — Meta requires a template for business-initiated replies; a freeform reply to an inbound user message may be permitted within the 24h customer-service window, but a template is the safe, reviewable path |
| Marketing campaigns (offers/discounts) | **NEW TEMPLATES REQUIRED** when marketing is launched — none exist today; Meta requires `MARKETING`-category templates, and **no marketing mapping exists** to reference them |
| Resubscribe/opt-in confirmation | **NEW TEMPLATE MAY BE REQUIRED** |

### 13.3 NEEDS HUMAN REVIEW

- Any new template must be created in Meta (with example values) then synced via the existing `syncWhatsAppTemplates` admin action (or the WABA API), then referenced from a mapping.
- The consent text/version displayed at signup (`consentText`, `consentVersion`) is a **business/legal artifact**, not a template — needs approval (Section 21).
- Templates duplicated across Meta or REJECTED in the collection (per the earlier `notification-engine-whatsapp-audit.md`, e.g. `puja_comfirmation_verification_code`) — cleanup is out of scope here but relevant to the template inventory.

---

## 14. Notification Mapping Changes (audit)

**Design decision:** add a `purpose` field to `NotificationMapping` rather than a parallel abstraction.

Why this location (vs EventRegistry):
- `EventRegistry.EVENTS` is a frozen, additive-only enum whose values are used as DB enums — adding purpose metadata there is possible (`EVENT_CATEGORIES` precedent) but the mapping is where per-recipient/channel reality lives: the same event can target a user (BOOKING) and a pandit (SERVICE) via different mappings (e.g., `PANDIT_ACCEPTED` user-facing vs `PANDIT_ASSIGNMENT_PENDING` pandit-facing). Purpose belongs to the **mapping**, not the event.
- The send path already loads the mapping at both dispatch (for the job) and send time (Worker re-reads by `mappingId`); a gate can read `mapping.purpose` with zero new lookups.

Which mappings require classification (all 45 WhatsApp + 4 Email + 2 In-App — see §7 classification, to be encoded in bootstrap):

- ACCOUNT: OTP_VERIFICATION×2, PASSWORD_RESET_WHATSAPP_OTP×2, USER_REGISTERED, ACCOUNT_RESTORED, ACCOUNT_DELETED, ACCOUNT_DELETION_CANCELLED, ACCOUNT_DELETION_REQUESTED (+ both email OTP mappings, PASSWORD_RESET_EMAIL_OTP×2)
- BOOKING: PAYMENT_SUCCESS, PARTIAL_PAYMENT_RECEIVED, FINAL_PAYMENT_RECEIVED, PAYMENT_FAILED, BOOKING_CONFIRMED, BOOKING_CANCELLED, BOOKING_REFUNDED, KIT_SHIPPED, KIT_DELIVERED, PANDIT_ACCEPTED, PANDIT_ASSIGNED, INVOICE_GENERATED
- SERVICE: SERVICE_REMINDER_24H, SERVICE_REMINDER_1H, SERVICE_COMPLETION_OTP, SERVICE_COMPLETED, FEEDBACK_REQUEST (review), all pandit-facing mappings (PANDIT_ASSIGNMENT_PENDING, PANDIT_POOJA_*, PANDIT_APPROVED, KYC_*, PAYOUT_RELEASED, REFERRAL_*) + in-app KIT mappings
- ORDER: ORDER_CONFIRMED, ORDER_PACKED, ORDER_SHIPPED, ORDER_OUT_FOR_DELIVERY, ORDER_DELIVERED, ORDER_CANCELLED, ORDER_REFUNDED, DELIVERY_OTP_SENT
- MARKETING: none today

**Gate semantics (critical design rule):** the consent gate must only **block** messages whose `mapping.purpose === 'MARKETING'` when marketing consent is absent. Service/account/booking/order messages are **never blocked** by missing marketing consent (client Rule: "Do not automatically block service notifications because marketing consent is false"). The default `purpose: 'UNKNOWN'` therefore blocks nothing — safe by default.

---

## 15. BOOTSTRAP NOTIFICATION MAPPINGS IMPACT (mandatory section)

File: `backend/src/scripts/bootstrapNotificationMappings.js` (v1.1.0, 612 lines). Read in full; not modified.

### 15.1 Current responsibility

The **official initialization path** for NotificationMapping configuration. Consolidates 4 deprecated seed/fix scripts. Brings any database (fresh or existing) to the same verified mapping configuration as every other deployment. Writes `docs/notification-bootstrap-report.md`. Runs the same startup validator (`notification-engine/bootstrap.js` `validateWhatsAppMappings`) at the end. Run manually via `node src/scripts/bootstrapNotificationMappings.js` from `backend/` (not wired into server boot).

### 15.2 Answers to the mandated questions

| # | Question | Answer (verified) |
|---|---|---|
| 1 | Contains all active WhatsApp mappings? | **No** — it contains 45 *verified* WhatsApp mappings. Mappings created through the Admin UI beyond these are not in it (by design — admin is the other authoring path). |
| 2 | Email mappings? | **Yes — 4** (`VERIFIED_EMAIL_MAPPINGS`): OTP_VERIFICATION×2, PASSWORD_RESET_EMAIL_OTP×2 |
| 3 | In-App mappings? | **Yes — 2** (`VERIFIED_INAPP_MAPPINGS`): KIT_SHIPPED, KIT_DELIVERED |
| 4 | Marketing-related mappings? | **No** — none exist anywhere |
| 5 | Only verified mappings? | **Yes** — every entry documented as re-confirmed against the working DB (2026-07-22 / 2026-07-28 audits); explicitly refuses to infer payload paths |
| 6 | Template names? | **Yes** — `whatsappTemplateName` on every WhatsApp entry |
| 7 | WhatsApp variables? | **Yes** — positional `whatsappVariables` (`{position, payloadPath, label}`) |
| 8 | Button configuration? | **Partial** — OTP entries set `whatsappButtonType:'copy_code'` + `whatsappButtonPayloadPath:'otp.code'`; no other buttons |
| 9 | Recipient types? | **Yes** — `user`, `pandit`, `referral_pandit` (no admin WhatsApp mappings in bootstrap) |
| 10 | Enabled state? | **Yes** — `enabled: true` (or explicit false) on every entry |
| 11 | Communication purpose? | **No** — no `purpose` concept anywhere |
| 12 | Consent architecture implementable WITHOUT modifying bootstrap? | **Mostly yes for the gate, no for classification.** The gate + models + webhook + signup all work without touching bootstrap. But the verified purpose classification belongs in bootstrap (it is the "verified reference data" mechanism); without it, every existing mapping stays `UNKNOWN` (safe — blocks nothing) and admins must classify ~45 rows by hand. |
| 13 | If not, exactly what must change? | Add a `purpose` value to each entry in `VERIFIED_MAPPINGS`, `VERIFIED_EMAIL_MAPPINGS`, `VERIFIED_INAPP_MAPPINGS`, have `applyEntry`/`applyEmailEntry`/`applyInAppEntry` include `purpose` in the created/configured fields, and bump `BOOTSTRAP_VERSION` (v1.2.0). The **idempotency contract is preserved**: create-if-absent, fill-in-if-blank, never overwrite a purpose an admin set explicitly (same semantics as `whatsappVariables` today). |
| 14 | Which existing mappings need classification? | All 51 (§14 classification table). |
| 15 | Would new WhatsApp templates require bootstrap updates? | **Only if a mapping references them.** A new marketing template alone needs: Meta creation → sync → new mapping. If the mapping is a verified default, add to bootstrap; if admin-created, no bootstrap change. |
| 16 | Would new notification mappings require bootstrap updates? | Same rule — bootstrap holds *verified defaults*; admin-created mappings bypass it. |
| 17 | New purpose metadata stored in bootstrap? | Yes — as the classification source of truth (see #13). |
| 18 | Administrator customizations safe? | **Yes** — preserved (existing `preserved-custom` behavior); a purpose explicitly set by an admin is never overwritten (same rule as non-blank `whatsappVariables`). |
| 19 | Idempotent? | **Yes** — `(eventName, recipientType, channel)` remains the identity key; adding `purpose` to created/blank-filled rows is idempotent; named legacy exceptions unchanged. |
| 20 | Fresh DB deterministic? | **Yes** — with v1.2.0, a fresh DB reproduces all 51 mappings *including* purposes; without the change, fresh DBs lack purposes (gate still safe due to UNKNOWN default). |

### 15.3 Legacy mappings intentionally excluded (from the file's own docs)

- `PASSWORD_RESET`/user (disabled, not in `EventRegistry.EVENTS`, superseded by the channel-specific OTP events) — deliberately excluded.
- Events without verified reference data are intentionally left for one-time manual admin configuration (documented as a permanent property of the system).

---

## 16. Legacy / Migration Impact

| Existing data | Treatment |
|---|---|
| Existing `User` docs | No migration needed for the new fields (`whatsappVerified` default false). **Backfill:** a one-time script *could* set `whatsappVerified: true` for users who registered via WhatsApp OTP — **but the evidence was deleted** (OTP records TTL-expire in 10 min; registration deletes them). Only partial evidence: `NotificationLog` entries for `OTP_VERIFICATION` + `USER_REGISTERED` same phone. Decision: **do not auto-derive**; treat verification as forward-only unless business approves the log-based backfill (Section 21). |
| Existing `NotificationMapping` docs | `purpose` defaults to `UNKNOWN` → gate blocks nothing → zero behavioral change until classified (bootstrap v1.2.0 or admin). |
| Existing consent state | **None exists.** Marketing consent must default to **false** for every existing user (client Rule 1 — OTP verification ≠ marketing consent). Service consent: treat as implied-allowed for service/transactional messaging (the platform's core function) — confirm with business. |
| `WhatsAppPreference` backfill | For every existing user: create one doc lazily on first consent query (get-or-create), with `whatsapp.marketing.status: 'not_set'` (treated as opted-out for marketing) and `whatsapp.service.status: 'opted_in'` (pending business confirmation). Lazy creation avoids a mass write. |
| `WhatsAppConsentEvent` history | **Starts empty** — no backfill possible (no historical consent). First event for existing users will be their first preference action or STOP keyword. |
| Existing WhatsApp templates | Unchanged; reused as-is (§13.1). |
| Existing bookings/orders/invoices | Untouched. The gate adds a read at send time only. |

---

## 17. Security & Privacy Impact

### 17.1 Technical security requirements (implementable now)

| Concern | Requirement |
|---|---|
| Webhook authenticity | Verify `X-Hub-Signature-256` (HMAC-SHA256 over raw body with Meta app secret) on every POST; store secret via `settingsService`; fail closed (reject unauthenticated payloads) |
| Webhook verification (GET) | `hub.mode=subscribe & hub.verify_token & hub.challenge` handling |
| Duplicate/replay | `wamid` idempotency (unique-sparse index on `WhatsAppConsentEvent.whatsappMessageId`); always 200 fast |
| Phone handling | Normalize exactly like `WhatsAppProvider.normalizePhone` (10-digit → `91…`) so webhook `from` matches `User.phone`; store consent docs with the same normalized form; strip `+` and non-digits |
| Preference-change authorization | `protect` middleware on user endpoints; only the owner's own record; admin endpoints behind `isAdminRole`; consent events are append-only (no update/delete routes) |
| Admin audit | Reuse `auditService.audit()` for admin consent overrides and webhook-config changes (AdminAuditLog) |
| IP / UA capture | Reuse `extractRequestMeta` (already parses IP/UA/browser/OS) for consent-event provenance |
| Consent data access | `WhatsAppPreference`/`WhatsAppConsentEvent` contain PII (phone, IP, UA) — keep them behind auth middleware; do not embed in public user payloads |
| Rate limiting | Keep webhook outside the aggressive `/api/` limiter (Meta retries) but add dedupe; user preference endpoints under normal auth limits |

### 17.2 Regulatory/legal considerations (human verification required — do not invent law)

- Exact STOP keyword list and reply copy per applicable WhatsApp Business Messaging Policy and Indian telecom/commercial-communication rules (client Rule 12) — needs legal/business sign-off.
- `consentText` / `consentVersion` wording at signup — legal review.
- Whether service-transactional WhatsApp messages need a separate explicit consent statement (vs implied by booking) — business/legal decision.
- Marketing default-off for existing users and the log-based verification backfill — business decision.
- Data-retention period for consent events — legal decision.
- Whether to store IP/UA at all for consent events (privacy minimization) — product decision.

---

## 18. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Blocking service messages because marketing consent missing | High | Purpose-scoped gate: only `MARKETING` blocked; `UNKNOWN` default blocks nothing; unit-test every mapping purpose |
| Double-processing STOP (Meta retries / two webhook consumers) | Medium | `wamid` idempotency; 200-fast; single consumer contract |
| Webhook added while Meta still delivers only to Chatwoot → STOP never reaches backend | High | Meta-side config change to add the backend URL; verify in production with a real message before launch |
| Admin mapping edits take up to 30s to affect the cache (MappingCache TTL) | Low | Existing behavior; a newly enabled/disabled marketing mapping lags ≤30s — acceptable; optionally add `MappingCache.invalidate` to admin writes |
| Bootstrap version bump accidentally overwrites admin purpose | Medium | Keep the strict "never overwrite non-blank" contract; `preserved-custom` reporting |
| `whatsappVerified` backfill from logs is unreliable | Medium | Don't auto-derive; forward-only unless approved |
| New inbound webhook increases attack surface | Medium | Signature verification, body-size cap, no user-supplied input trusted |
| Broadcast feature growth to WhatsApp bypasses gate | Medium | If WhatsApp broadcast is added later, it must be a MARKETING mapping through the engine — enforce via code review + the central gate (bypass impossible by construction) |

---

## 19. Open Questions (human/business clarification required)

1. **Chatwoot delivery model:** Should Meta deliver the same webhook to *both* Chatwoot and the Zutsav backend (two configured endpoints), or should the backend receive it first and forward to Chatwoot? This changes where the "continue Chatwoot processing" step lives. (Client doc shows a branch diagram; both are implementable — Zutsav needs to know which.)
2. **Service consent default:** Are service/transactional WhatsApp messages considered implied-consented (current behavior continues) for all existing and new users, with only marketing gated? (Recommended: yes — otherwise every booking confirmation breaks.)
3. **Marketing default for existing users:** Confirm default-off for all existing users (recommended), and whether a one-time email/WhatsApp "please opt in" campaign is desired.
4. **`whatsappVerified` backfill:** OK to leave verification forward-only (no backfill), or should NotificationLog-based inference (OTP_VERIFICATION + USER_REGISTERED same phone) be used?
5. **STOP keyword list & variants:** Exact list (STOP, UNSUBSCRIBE, OPT OUT, CANCEL, Hindi variants?) and whether an opt-out confirmation reply is required.
6. **consentText / consentVersion:** Who owns the exact signup consent wording and versioning? Legal review required.
7. **Per-purpose semantics:** Does the client want marketing opt-out to *also* suppress future marketing emails/SMS (cross-channel), or strictly WhatsApp for now? The preference model supports both.
8. **Admin override:** Is an admin-initiated consent override (e.g., support agent re-subscribing on behalf of a user) allowed? (Recommended: not in v1; if needed, require audit trail + user confirmation.)
9. **Meta template category vs purpose:** Should `WhatsAppTemplate.category` (UTILITY/MARKETING) be surfaced in the admin mapping UI as a hint, or kept internal?
10. **Webhook secret storage:** Use the existing `SystemSettings`/env pattern (recommended) — any preference for a dedicated secret store?

---

## 20. Recommended Implementation Phases (design only — nothing implemented)

Safe sequence that never breaks the existing engine and keeps every phase independently shippable:

- **Phase 1 — Data model.** Add `User.whatsappVerified(+At)`; new `WhatsAppPreference` + `WhatsAppConsentEvent` models; add `NotificationMapping.purpose` (default `UNKNOWN`). No behavior change.
- **Phase 2 — Consent service.** `consentService.js`: `getPreference`, `recordOptIn`, `recordOptOut`, `hasMarketingConsent`, `hasServicePermission`, `createConsentEvent`, phone normalization. Unit tests.
- **Phase 3 — Signup.** Capture dual consent in `complete-registration` (backend) + Register UI (web + mobile); write preference + events; set `whatsappVerified` when channel = whatsapp. Existing OTP flow untouched.
- **Phase 4 — Webhook (inbound).** New `POST /api/webhooks/whatsapp` with signature verification, `hub.challenge`, `wamid` idempotency, STOP keyword detection → consent engine. Chatwoot untouched (delivery model per Q1).
- **Phase 5 — Notification engine gate.** Insert purpose-aware consent check in `WhatsAppChannel.send()` (and mirror in dispatcher if desirable); block only MARKETING-without-consent; log `skipped` reason; add a unit-test harness proving service messages always pass.
- **Phase 6 — Templates.** Only if marketing/opt-out confirmations are approved: create in Meta, sync, reference from new mappings.
- **Phase 7 — Bootstrap.** Bump to v1.2.0: add `purpose` to all 51 verified entries + apply-functions; rerun against a staging copy; verify idempotency + `preserved-custom`.
- **Phase 8 — Website.** Communication Preferences in Settings; consent step in Register; verified badge.
- **Phase 9 — Mobile.** Same screens (Register/Settings/Profile).
- **Phase 10 — Admin.** Purpose field + filter in NotificationEngineAdmin; read-only per-user consent history view; audit hooks.
- **Phase 11 — Testing.** Webhook signature/duplicate/replay tests; STOP flow end-to-end; gate matrix (every purpose × consent state); signup consent persistence; bootstrap idempotency on a fresh DB and on a copy of production; regression on all 51 mappings.

---

## 21. Confirmation of Audit Rules Followed

- ✅ No code, models, controllers, services, routes, or scripts modified.
- ✅ `bootstrapNotificationMappings.js` read in full and **not modified**.
- ✅ No new collections/models designed as *implemented* — §9 is design only.
- ✅ No migrations, indexes, or fix scripts run.
- ✅ No WhatsApp templates or notification mappings created/changed.
- ✅ No assumption that WhatsApp OTP verification = marketing consent.
- ✅ No assumption that every WhatsApp message is marketing.
- ✅ No plan to block service notifications on missing marketing consent (gate is purpose-scoped).
- ✅ No second notification system proposed; Chatwoot untouched.
- ✅ Every claim traced to actual code with file paths cited.
