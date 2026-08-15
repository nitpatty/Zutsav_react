# WhatsApp Consent — Phase 1–3 Implementation Report

**Status:** Implemented and tested. Inbound webhook, outbound consent gate, templates, bootstrap purpose classification, and admin/preference-center UI are intentionally NOT part of this batch (see §11 Known Limitations).
**Scope:** Data model (User fields, `WhatsAppPreference`, `WhatsAppConsentEvent`), centralized consent service, signup consent integration on website + mobile + backend.

---

## 1. What Was Implemented

### Phase 1 — Data model
- **`User`**: added `whatsappVerified` (Boolean, default `false`) and `whatsappVerifiedAt` (Date, default `null`) — additive, backward compatible. Semantics: proof of control over the number via WhatsApp OTP; **never** consent.
- **`WhatsAppPreference`** (new collection): current per-user consent state — `whatsapp.service`, `whatsapp.marketing`, plus future `email`/`sms` blocks, `lastOptInAt`/`lastOptOutAt`. Indexes: unique `userId`, `phone`, `whatsapp.marketing.status`.
- **`WhatsAppConsentEvent`** (new collection): immutable append-only consent history — `channel/purpose/action/source/consentText/consentVersion/timestamp/ipAddress/userAgent/whatsappMessageId`. Indexes: `(userId, timestamp)`, `(phone, timestamp)`, unique+sparse `whatsappMessageId` (webhook idempotency key). No update/delete surface.

### Phase 2 — Consent service
- **`backend/src/services/consentService.js`** — the single place for consent state transitions:
  `getPreference`, `getPreferenceByPhone`, `getUserByPhone`, `getOrCreatePreference`, `setWhatsAppState`, `createConsentEvent`, `recordOptIn`, `recordOptOut`, `hasMarketingConsent`, `hasServicePermission`, `normalizeWhatsAppPhone`, `phoneVariants`.
- Reuses `WhatsAppProvider.normalizePhone` (one normalization rule codebase-wide) and `auditService.extractRequestMeta` for IP/UA provenance.

### Phase 3 — Signup consent integration
- **Backend** `POST /api/auth/complete-registration`: accepts optional `serviceConsent` / `marketingConsent` (+ per-purpose `consentText`/`consentVersion`), sets `whatsappVerified` from the verified OTP record's channel, creates the preference, and records explicit consent events only.
- **Website** `frontend/src/pages/Register.jsx`: consent checkboxes on the password step (service pre-checked, marketing unchecked by default).
- **Mobile** `mobile-app/src/screens/auth/SetPasswordScreen.jsx`: same dual-consent checkboxes, same payload shape, same backend endpoint.

---

## 2. Files Changed

| File | Change | Why |
|---|---|---|
| `backend/src/models/User.js` | Added `whatsappVerified`, `whatsappVerifiedAt` | Persist number verification (forward-only; no backfill) without touching existing users |
| `backend/src/models/WhatsAppPreference.js` | **New** | Current consent state, per audit §9.2 structure; enums for status/source; unique userId + phone + marketing-status indexes |
| `backend/src/models/WhatsAppConsentEvent.js` | **New** | Immutable consent audit trail, per audit §9.3; `(userId, timestamp)`, `(phone, timestamp)`, unique+sparse `whatsappMessageId` |
| `backend/src/services/consentService.js` | **New** | Centralized consent state machine + phone normalization; all 6 consent rules implemented |
| `backend/src/controllers/auth.controller.js` | `completeRegistration` accepts consent fields; sets `whatsappVerified`; `captureSignupConsent()` helper | Signup consent capture, run only after User(+Pandit) fully created so a failed registration never leaves orphaned consent records |
| `frontend/src/pages/Register.jsx` | Consent checkbox UI (service pre-checked, marketing unchecked) + payload fields | Client Rule 1: OTP verification ≠ marketing opt-in; marketing must be an explicit choice |
| `mobile-app/src/screens/auth/SetPasswordScreen.jsx` | Same dual-consent UI + payload fields | Website/mobile parity — same backend source of truth |
| `backend/tests/consent-phase1-3.test.js` | **New** | 25 tests (node:test) covering models, service rules, and signup integration |
| `backend/package.json` | Added `"test": "node --test tests/"` | Framework-free test entry point (Node built-in runner; no new dependencies) |

**Untouched by design:** `WhatsAppChannel.js`, `EventDispatcher.js`, `NotificationMapping.js`, `bootstrapNotificationMappings.js`, WhatsApp templates, Chatwoot, all payment/booking/order logic.

---

## 3. Database Changes

### Models / fields
- `User` + `whatsappVerified: Boolean (default false)` + `whatsappVerifiedAt: Date (default null)`.
- New collection `whatsapppreferences` (model `WhatsAppPreference`).
- New collection `whatsappconsentevents` (model `WhatsAppConsentEvent`).

### Indexes (auto-created by Mongoose on connection, per the project's existing convention)
- `WhatsAppPreference`: `{ userId: 1 }` unique; `{ phone: 1 }`; `{ 'whatsapp.marketing.status': 1 }`.
- `WhatsAppConsentEvent`: `{ userId: 1, timestamp: -1 }`; `{ phone: 1, timestamp: -1 }`; `{ whatsappMessageId: 1 }` unique+sparse.

### Safety / deployment
- All changes are additive; existing documents remain valid; no migration script required.
- The `whatsappMessageId` field has **no schema default** — it is absent for non-webhook events, which is what makes the unique+sparse index safe (sparse excludes documents lacking the field, so events without a wamid never collide).
- No production data was modified, deleted, or reset. Tests run against a dedicated database (`zutsav_consent_test`) and drop only that database.

---

## 4. Consent State Rules (as implemented)

| Concept | Storage | Semantics |
|---|---|---|
| `whatsappVerified` | `User.whatsappVerified` + mirrored on `WhatsAppPreference.whatsappVerified` | Number was verified via WhatsApp OTP. **Never** implies consent (RULE 1) |
| Service consent | `WhatsAppPreference.whatsapp.service.status` | Default `opted_in` (RULE 3 — transactional messaging keeps working); `opted_out` blocks; no preference doc ⇒ allowed |
| Marketing consent | `WhatsAppPreference.whatsapp.marketing.status` | Strictly opt-in (RULE 2): only `opted_in` = consented; `not_set`/`opted_out` = not consented |
| History | `WhatsAppConsentEvent` | Append-only: `OPT_IN`/`OPT_OUT` per purpose with source, timestamp, consent text/version, IP/UA, optional wamid (RULE 4/5/6) |

Event-vs-default rule: **explicit actions create events; defaults never do.** A signup with `serviceConsent: true` creates an `OPT_IN` event (source `signup`); `marketingConsent: true` creates one (source `signup_checkbox`). A decline (`false`) updates current state only; absent fields leave defaults with no fabricated history.

---

## 5. Signup Flow (new)

```
Register (web/mobile) → OTP channel (email|whatsapp) → OTP verify → password + consent step
    │  serviceConsent (pre-checked) | marketingConsent (unchecked)
    ▼
POST /auth/complete-registration
    │  otpRecord.channel === 'whatsapp' → user.whatsappVerified = true (+timestamp)
    │  User.create (role user|pandit) → Pandit.create (if pandit)  ← all failure paths passed
    ▼
captureSignupConsent()   [best-effort; runs only after account fully created]
    │  getOrCreatePreference(userId, phone, whatsappVerified)
    │  serviceConsent true  → recordOptIn  (source 'signup', OPT_IN event)
    │  serviceConsent false → setWhatsAppState opted_out (no event)
    │  marketingConsent true  → recordOptIn (source 'signup_checkbox', OPT_IN event)
    │  marketingConsent false/absent → stays not_set (no event)
    ▼
OTP record deleted → USER_REGISTERED emitted → JWT issued → auto-login
```

All existing behavior preserved: OTP generation/verification, uniqueness guards, pandit profile creation, referral-code handling, `USER_REGISTERED`, token issuance.

---

## 6. Website Changes

`frontend/src/pages/Register.jsx`:
- New `ConsentRow` component (custom checkbox, saffron theme).
- `DevoteePasswordStep` (shared by devotee and pandit) now includes a "WhatsApp Communication Preferences" section with two checkboxes: service consent (pre-checked) and marketing consent (unchecked).
- Consent flags + the exact client-approved copy (`consentText`/`consentVersion`) are sent to `/auth/complete-registration`.
- Consent wording is **verbatim from the client's reference document** (not invented); flagged for legal review (§12).

---

## 7. Mobile Changes

`mobile-app/src/screens/auth/SetPasswordScreen.jsx`:
- Two consent rows (service pre-checked, marketing unchecked) styled to match the screen, with the same client-approved copy and `consentVersion`.
- The final `complete-registration` call now includes `serviceConsent`, `marketingConsent`, and per-purpose `consentText`/`consentVersion`.
- Uses the existing API client (`api/axios`) and auth store — no new endpoints, no second consent API. Verification channel, OTP, role, and password steps are untouched.

---

## 8. Tests Added

`backend/tests/consent-phase1-3.test.js` (25 tests, Node built-in `node:test`, no new dependencies):

**User** — `whatsappVerified` defaults false; `whatsappVerifiedAt` defaults null; legacy docs without the fields stay valid.
**Phone normalization** — 10-digit → `91…`; `+91` with spaces; E.164 passthrough; `getUserByPhone` matches a 10-digit User via an E.164 query.
**Preference** — defaults (service `opted_in`, marketing `not_set`); unique userId; `getPreferenceByPhone`; `hasMarketingConsent` false for `not_set`/no pref; `hasServicePermission` true by default.
**History** — opt-in updates state + appends `OPT_IN`; opt-out updates state + appends `OPT_OUT` with prior history preserved (`OPT_IN → OPT_OUT`); original event byte-identical after later actions (append-only); wamid replay returns the existing event (idempotency); events without a wamid never collide (sparse index).
**Signup** — (1) email OTP → `whatsappVerified` false; (2) WhatsApp OTP → true + timestamp; (3) WhatsApp + marketing opt-in → `opted_in` + both `OPT_IN` events with consent text/version; (4) WhatsApp + marketing not opted in → `not_set`, **no fake marketing event**; (5) explicit service decline → `opted_out`, no event; (6) OTP record deleted; (7) `USER_REGISTERED` still fires; (8) JWT issued and verifies; (9) pandit registration works + captures consent; (10) referral flow intact.

## 9. Tests Executed

```
cd backend && node --test
✔ User model — whatsapp verification fields
✔ consentService — phone normalization
✔ WhatsAppPreference — defaults and current state
✔ WhatsAppConsentEvent — opt-in / opt-out history
✔ Signup integration — complete-registration
ℹ tests 25 | pass 25 | fail 0
```

Also verified: backend modules load cleanly; `frontend npm run build` compiles; mobile `SetPasswordScreen.jsx` parses via Babel.

---

## 10. Existing Functionality Verified

- ✅ Email OTP registration (tested)
- ✅ WhatsApp OTP registration (tested)
- ✅ Pandit registration + consent (tested)
- ✅ Referral code flow (tested)
- ✅ OTP record deletion behavior unchanged (tested)
- ✅ `USER_REGISTERED` notification still emitted (tested)
- ✅ JWT/auto-login works (tested)
- ✅ Notification engine, WhatsApp provider, email/in-app channels — untouched (no changes to any engine file)
- ✅ Existing WhatsApp templates — untouched
- ✅ `bootstrapNotificationMappings.js` — unchanged (byte-identical)
- ✅ Forgot-password / account-deletion OTP / KYC-view OTP / service-completion OTP / delivery OTP — untouched code paths (OTP service shared, not modified)

---

## 11. Known Limitations

- **Inbound WhatsApp webhook — NOT implemented** (Phase 4). No Meta webhook route, no `hub.challenge`, no `X-Hub-Signature-256` validation exists in the backend.
- **STOP / UNSUBSCRIBE keyword processing — NOT implemented.** The `whatsappMessageId` unique+sparse index and `consentService.createConsentEvent` idempotency are ready for it.
- **Outbound consent gate — NOT implemented** (Phase 5). `WhatsAppChannel.js`/`EventDispatcher.js`/`NotificationMapping.js` unchanged; `hasMarketingConsent`/`hasServicePermission` are the ready hooks.
- **Bootstrap purpose classification — NOT implemented** (planned v1.1.0 → v1.2.0 with `purpose` on all 51 mappings, in the notification-engine phase).
- **WhatsApp templates — NOT created or modified** (incl. opt-out confirmation / marketing templates).
- **Admin consent UI — NOT implemented** (Phase 10).
- **Communication preference center — NOT implemented** (user-facing Settings UI + `GET/PUT /users/me/communication-preferences` endpoints are future phases).
- **`registerPandit` (no-OTP pandit application) — does not capture consent** (no number verification in that flow; consent comes later via the preference center).
- **Consent wording**: the exact copy is taken verbatim from the client reference document and stored per event; it is a business/legal artifact and should be reviewed before public release. Until a reviewed text exists, wording lives as clearly named constants in `Register.jsx` and `SetPasswordScreen.jsx` (the two clients must be updated together if changed).
- **Edge case**: if `recordOptIn`/`recordOptOut` is ever called for a user whose preference doesn't exist and no `whatsappVerified` is passed, the preference is created with `whatsappVerified: false` even if the User doc says true (signup always passes the real value; the preference-center phase should sync it explicitly).

---

## 12. Next Recommended Phase

**PHASE 4 — INBOUND WHATSAPP WEBHOOK**, including:
- Meta webhook route (GET `hub.mode`/`hub.verify_token`/`hub.challenge` verification; POST message/status delivery) mounted outside the `/api/` rate limiter.
- `X-Hub-Signature-256` HMAC verification (secret via `settingsService`, same pattern as `whatsappPhoneNumberId`).
- STOP / UNSUBSCRIBE / OPT OUT / CANCEL keyword detection (exact list per applicable WhatsApp + Indian telecom rules — needs legal/business sign-off).
- `wamid` idempotency via the existing unique+sparse `WhatsAppConsentEvent.whatsappMessageId` index + `consentService.createConsentEvent`.
- Phone lookup via `consentService.getUserByPhone` / `getPreferenceByPhone` (E.164 → 10-digit).
- `consentService.recordOptOut({ source: 'whatsapp_keyword', whatsappMessageId })` integration.
- Chatwoot delivery model decision (dual delivery from Meta vs backend-first forwarding) — see audit Open Questions; Chatwoot itself stays untouched.

---

## Final Safety Check

- [x] Existing OTP flow still works (engine untouched; registration OTP path unchanged except additive consent)
- [x] Email registration works (tested)
- [x] WhatsApp registration works (tested)
- [x] Pandit registration works (tested)
- [x] Existing notification engine untouched (no engine files modified)
- [x] Existing WhatsApp templates untouched
- [x] `bootstrapNotificationMappings.js` remains unchanged
- [x] No production data deleted; tests use a dedicated database
- [x] No existing mappings modified
- [x] Marketing is NOT automatically opted in (default `not_set`; `hasMarketingConsent` false)
- [x] WhatsApp verification is NOT treated as marketing consent (RULE 1 enforced in service + tests)
- [x] Consent history is append-only (no update/delete surface; tested)
- [x] Existing users remain functional (additive fields only; legacy-doc test)
- [x] Website and mobile use the same backend consent source (one endpoint, one service)
- [x] No duplicate consent architecture created (one service, two models, existing engine preserved)
