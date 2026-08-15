# Zutsav WhatsApp Template Master Specification

**Prepared for:** Manual creation/update of WhatsApp templates in Meta WhatsApp Manager.
**Status:** Audit complete — **no code changes were made** to produce this document.
**Reference snapshot:** `backend/notification-engine-dump/` (DB dump dated **2026-07-21**) provides the only in-repo view of the synced `whatsapptemplates` collection (46 templates). Current code = `bootstrapNotificationMappings.js` v1.3.0 + `notification-engine/`. **All statuses/categories from the dump must be re-verified in Meta at creation time** — the dump is a point-in-time snapshot, not a live query.

**Ground rules applied (per the phase brief):**
- Templates are synced from Meta into `WhatsAppTemplate` via Admin → Communication → WhatsApp Templates → Sync (`comm.controller.js syncWhatsAppTemplates`). The **synced template is authoritative** at send time (`WhatsAppChannel` sends button parameters only for buttons the template declares).
- No template ID, approval status, URL, event name, or variable was invented. Everything below traces to code or the repo dump.
- Meta template `category` (`MARKETING`/`UTILITY`/`AUTHENTICATION`) is **Meta-side data, not the Zutsav `NotificationMapping.purpose`**. They are documented separately and aligned where verified.

---

# 1. Executive Summary

| Metric | Count |
|---|---|
| Total WhatsApp notification mappings in the system | **45** (bootstrap v1.3.0 `VERIFIED_MAPPINGS`) |
| Distinct template names referenced by those 45 mappings | **40** (1 shared template `whatsapp_verification` covers 6 OTP-style mappings) |
| Templates present in the repo dump (`whatsapptemplates.bson`, 2026-07-21) | **46** |
| Templates referenced by mappings but **NOT** in the dump | **0** (every referenced name exists in the dump) |
| Templates in the dump **NOT** referenced by any mapping | **6** (`admin_general_reminder`, `puja_started`, `puja_completed`, `puja_comfirmation_verification_code`, `hello_world`, `order_placed`) |
| Templates to **REUSE AS-IS** | **39** |
| Templates to **UPDATE** | **1** (`service_completed` — add View Receipt + Rate Your Experience URL buttons) |
| Templates to **DEPRECATE / DO NOT USE** | **5** (`feedback_request` — flow retired; `puja_completed`, `puja_comfirmation_verification_code`, `hello_world`, `admin_general_reminder`, `puja_started` — unused) |
| Templates to **CREATE (required by the engine)** | **0** — the engine needs no new template; every mapped event already has an approved template |
| Templates needing **META CATEGORY REVIEW** (currently `MARKETING` in Meta but used transactionally) | **9** (`order_cancelled`, `payment_failed`, `new_user_registered`, `account_deletion_cancelled`, `referral_booking_created`, `pandit_pooja_rejected`, `pandit_pooja_approved`, `admin_general_reminder`, `puja_started`) |
| MARKETING-purpose Zutsav mappings | **0** |

**Headline decisions:**
1. **Only one template needs a real change:** `service_completed` (add 2 URL buttons). Everything else reuses.
2. **No new templates are required by the notification engine.** A few templates exist in Meta that no mapping references — leave them or clean them up (see §6), but do not build new ones.
3. **`feedback_request` is deprecated for WhatsApp** (Phase 5.1 retired the standalone flow). Keep or delete in Meta — nothing references it.
4. **Category hygiene:** 7–9 templates currently carry Meta category `MARKETING` while powering transactional Zutsav purposes. Recommended: re-verify/re-categorize to `UTILITY` in Meta (see §22). This is a Meta-side action, not code.
5. **URL buttons require the production domain** (`<CLIENT_URL>`). Do not hardcode an invented domain — supply `CLIENT_URL`/`FRONTEND_URL` (or the Admin → Settings `deployWebsiteUrl`) value when creating in Meta.

---

# 2. Current WhatsApp Architecture

```
Business controller / scheduled job
  → NotificationEngine.emit(EVENT, normalize*Payload(...))
  → EventDispatcher → NotificationMapping (eventName × recipientType × channel)
  → NotificationJob → Worker
  → WhatsAppChannel.send(mapping, payload, recipient)
      ├─ Consent gate (Phase 5): blocks ONLY mapping.purpose === 'MARKETING' without marketing opt-in.
      ├─ buildVariableChecklist: body-param count vs synced template + URL-button analysis
      └─ TemplateEngine.render → WhatsAppProvider.send → Meta Cloud API
```

Verified facts that constrain template design:

- **`WhatsAppTemplate` (synced from Meta) is the single source of truth** for what the Cloud API accepts: the send path only emits button parameters for URL buttons the synced template declares (mismatches are omitted with a warning — never sent, never a #132018 failure).
- **The template name is the only link** between mapping and Meta template: `NotificationMapping.whatsappTemplateName` → `WhatsAppTemplate.name`. No IDs are stored in mappings.
- **Variable contract:** mapping `whatsappVariables` (position → normalized-payload path) must exactly match the template body's `{{n}}` count/order. Verified against the dump — **all 40 referenced templates match** (see §16). Bootstrap's pre-send guard skips (never sends) on a mismatch.
- **Consent is enforced by the Zutsav gate (mapping purpose), not by Meta category.** Meta category still matters for Meta's own policies (see §18).
- The legacy `src/utils/whatsapp.js` `sendWhatsApp()` is dead code (zero callers); the inbound webhook (`/api/webhooks/whatsapp`) is the only other WhatsApp surface and is receive-only. **No direct/side-channel outbound sends exist** — nothing outside the engine sends WhatsApp.

---

# 3. Complete Existing WhatsApp Template Inventory

Source: `bootstrapNotificationMappings.js` v1.3.0 (mapping) + `notification-engine-dump/zutsav/whatsapptemplates.bson` (template, 2026-07-21 snapshot). `bodyParams` = `{{n}}` placeholders in the template body. "Meta cat" = category stored for the template in Meta as of the dump.

| # | Template (Meta) | Meta cat (dump) | Status (dump) | bodyParams | Buttons (dump) | Used by mappings | Zutsav purpose | Action |
|---|---|---|---|---|---|---|---|---|
| 1 | `whatsapp_verification` | AUTHENTICATION | APPROVED | 1 | 1 URL (Copy code → whatsapp.com/otp/code) | OTP_VERIFICATION (user, pandit), SERVICE_COMPLETION_OTP, DELIVERY_OTP_SENT, PASSWORD_RESET_WHATSAPP_OTP (user, pandit) | ACCOUNT | REUSE AS-IS |
| 2 | `new_user_registered` | **MARKETING** | APPROVED | 1 | 0 | USER_REGISTERED | ACCOUNT | REUSE (verify cat) |
| 3 | `payment_success` | UTILITY | APPROVED | 3 | 0 | PAYMENT_SUCCESS | BOOKING | REUSE AS-IS |
| 4 | `partial_payment_received` | UTILITY | APPROVED | 3 | 0 | PARTIAL_PAYMENT_RECEIVED | BOOKING | REUSE AS-IS |
| 5 | `final_payment_received` | UTILITY | APPROVED | 3 | 0 | FINAL_PAYMENT_RECEIVED | BOOKING | REUSE AS-IS |
| 6 | `payment_failed` | **MARKETING** | APPROVED | 2 | 0 | PAYMENT_FAILED | BOOKING | REUSE (verify cat) |
| 7 | `booking_confirmed` | UTILITY | APPROVED | 5 | 0 | BOOKING_CONFIRMED | BOOKING | REUSE AS-IS |
| 8 | `booking_cancelled` | UTILITY | APPROVED | 3 | 0 | BOOKING_CANCELLED | BOOKING | REUSE AS-IS |
| 9 | `booking_refunded` | UTILITY | APPROVED | 3 | 0 | BOOKING_REFUNDED | BOOKING | REUSE AS-IS |
| 10 | `service_reminder_24h` | UTILITY | APPROVED | 5 | 0 | SERVICE_REMINDER_24H | BOOKING | REUSE AS-IS |
| 11 | `service_reminder_1h` | UTILITY | APPROVED | 4 | 0 | SERVICE_REMINDER_1H | BOOKING | REUSE AS-IS |
| 12 | `service_completed` | UTILITY | APPROVED | 3 | **0** | SERVICE_COMPLETED | SERVICE | **UPDATE (add 2 URL buttons)** |
| 13 | `invoice_generated` | UTILITY | APPROVED | 3 | 0 | INVOICE_GENERATED | BOOKING | REUSE AS-IS |
| 14 | `feedback_request` | UTILITY | APPROVED | 2 | 0 | FEEDBACK_REQUEST (disabled mapping) | SERVICE | **DEPRECATE (flow retired)** |
| 15 | `kit_shipped` | UTILITY | APPROVED | 3 | 0 | KIT_SHIPPED | ORDER | REUSE AS-IS |
| 16 | `kit_delivered` | UTILITY | APPROVED | 1 | 0 | KIT_DELIVERED | ORDER | REUSE AS-IS |
| 17 | `order_confirmed` | UTILITY | APPROVED | 2 | 0 | ORDER_CONFIRMED | ORDER | REUSE AS-IS |
| 18 | `order_packed` | UTILITY | APPROVED | 2 | 0 | ORDER_PACKED | ORDER | REUSE AS-IS |
| 19 | `order_shipped` | UTILITY | APPROVED | 4 | 0 | ORDER_SHIPPED | ORDER | REUSE AS-IS |
| 20 | `order_out_for_delivery` | UTILITY | APPROVED | 2 | 0 | ORDER_OUT_FOR_DELIVERY | ORDER | REUSE AS-IS |
| 21 | `order_delivered` | UTILITY | APPROVED | 2 | 0 | ORDER_DELIVERED | ORDER | REUSE AS-IS |
| 22 | `order_cancelled` | **MARKETING** | APPROVED | 3 | 0 | ORDER_CANCELLED | ORDER | REUSE (verify cat) |
| 23 | `order_refunded` | UTILITY | APPROVED | 2 | 0 | ORDER_REFUNDED | ORDER | REUSE AS-IS |
| 24 | `pandit_pooja_rejected` | **MARKETING** | APPROVED | 3 | 0 | PANDIT_POOJA_REJECTED | SERVICE | REUSE (verify cat) |
| 25 | `pandit_registered` | UTILITY | APPROVED | 1 | 0 | PANDIT_REGISTERED (no emitter — dead) | ACCOUNT | REUSE AS-IS (or deprecate) |
| 26 | `pandit_accepted` | UTILITY | APPROVED | 3 | 0 | PANDIT_ACCEPTED | BOOKING | REUSE AS-IS |
| 27 | `pandit_assigned` | UTILITY | APPROVED | 5 | 0 | PANDIT_ASSIGNED (no emitter — dead) | BOOKING | REUSE AS-IS (or deprecate) |
| 28 | `pandit_assignment_pending` | UTILITY | APPROVED | 4 | 0 | PANDIT_ASSIGNMENT_PENDING | SERVICE | REUSE AS-IS |
| 29 | `referral_pending_remark` | UTILITY | APPROVED | 2 | 0 | REFERRAL_PENDING_REMARK | SERVICE | REUSE AS-IS |
| 30 | `pandit_pooja_approved` | **MARKETING** | APPROVED | 3 | 0 | PANDIT_POOJA_APPROVED | SERVICE | REUSE (verify cat) |
| 31 | `pandit_approved` | UTILITY | APPROVED | 1 | 0 | PANDIT_APPROVED | ACCOUNT | REUSE AS-IS |
| 32 | `kyc_approved` | UTILITY | APPROVED | 1 | 0 | KYC_APPROVED | ACCOUNT | REUSE AS-IS |
| 33 | `kyc_rejected` | UTILITY | APPROVED | 2 | 0 | KYC_REJECTED | ACCOUNT | REUSE AS-IS |
| 34 | `kyc_reupload_required` | UTILITY | APPROVED | 2 | 0 | KYC_REUPLOAD_REQUIRED | ACCOUNT | REUSE AS-IS |
| 35 | `account_restored` | UTILITY | APPROVED | 1 | 0 | ACCOUNT_RESTORED | ACCOUNT | REUSE AS-IS |
| 36 | `account_deleted` | UTILITY | APPROVED | 1 | 0 | ACCOUNT_DELETED | ACCOUNT | REUSE AS-IS |
| 37 | `account_deletion_cancelled` | **MARKETING** | APPROVED | 1 | 0 | ACCOUNT_DELETION_CANCELLED | ACCOUNT | REUSE (verify cat) |
| 38 | `account_deletion_requested` | UTILITY | APPROVED | 2 | 0 | ACCOUNT_DELETION_REQUESTED | ACCOUNT | REUSE AS-IS |
| 39 | `referral_booking_created` | **MARKETING** | APPROVED | 2 | 0 | REFERRAL_BOOKING_CREATED | BOOKING | REUSE (verify cat) |
| 40 | `payout_released` | UTILITY | APPROVED | 2 | 0 | PAYOUT_RELEASED | SERVICE | REUSE AS-IS |
| 41 | `admin_general_reminder` | MARKETING | APPROVED | 2 | 0 | — (no mapping) | — | UNUSED / verify or deprecate |
| 42 | `puja_started` | MARKETING | APPROVED | 3 | 0 | — (no mapping) | — | UNUSED / verify or deprecate |
| 43 | `puja_completed` | UTILITY | APPROVED | 1 | 0 | — (legacy; bootstrap repoints `SERVICE_COMPLETION_OTP` **away** from this) | — | **DEPRECATED — DO NOT USE** |
| 44 | `puja_comfirmation_verification_code` | UTILITY | **REJECTED** | 2 | 0 | — | — | **DEPRECATED — DO NOT USE** |
| 45 | `hello_world` | UTILITY | APPROVED | 0 | 0 | — (Meta test template) | — | UNUSED / deprecate |
| 46 | `order_placed` | UTILITY | APPROVED | 3 | 0 | — (no mapping; `ORDER_PLACED` event emitted but unmapped) | — | UNUSED / decision (§21) |

> ⚠️ **Important:** `whatsapp_verification` (`#1`) is used by **6** mappings; every other template by exactly one. The 45 mappings therefore map to 40 distinct names.

---

# 4. Existing Templates — Reuse As-Is

All 39 templates below are APPROVED in the dump, match their mappings' variable counts, need no body change, and need **no** button change:

`whatsapp_verification`, `payment_success`, `partial_payment_received`, `final_payment_received`, `booking_confirmed`, `booking_cancelled`, `booking_refunded`, `service_reminder_24h`, `service_reminder_1h`, `invoice_generated`, `kit_shipped`, `kit_delivered`, `order_confirmed`, `order_packed`, `order_shipped`, `order_out_for_delivery`, `order_delivered`, `order_refunded`, `pandit_registered`, `pandit_accepted`, `pandit_assigned`, `pandit_assignment_pending`, `referral_pending_remark`, `pandit_approved`, `kyc_approved`, `kyc_rejected`, `kyc_reupload_required`, `account_restored`, `account_deleted`, `account_deletion_requested`, `payout_released`.

**7 of these are "REUSE AS-IS, but verify Meta category"** (currently `MARKETING` in Meta; recommended `UTILITY` — see §22): `new_user_registered`, `payment_failed`, `order_cancelled`, `pandit_pooja_rejected`, `pandit_pooja_approved`, `account_deletion_cancelled`, `referral_booking_created`.

**Dead mappings (templates exist, no live emitter — reuse template, no action required):** `pandit_registered` (PANDIT_REGISTERED never emitted), `pandit_assigned` (PANDIT_ASSIGNED never emitted).

---

# 5. Existing Templates — Need Update

**Exactly one template requires a change:**

| Template | Current (dump) | Required | Reason |
|---|---|---|---|
| `service_completed` | APPROVED / UTILITY / 3 body params / **0 buttons** | Add 2 URL buttons (View Receipt, Rate Your Experience) | Phase 5.1: feedback must be an optional action inside the transactional service-completion message (client clarification). The body is unchanged. |

Updating an approved template's buttons in Meta may require **re-approval** — plan for that.

---

# 6. Existing Templates — Deprecated / Do Not Use

| Template | Status | Why |
|---|---|---|
| `feedback_request` | APPROVED (UTILITY) but **no flow uses it** | Phase 5.1 retired the standalone FEEDBACK_REQUEST WhatsApp flow; the mapping is created disabled on fresh DBs and no code emits the event. Keep the template in Meta (harmless) or delete after confirming no history/reporting depends on it. **Do not create a new feedback template.** |
| `puja_completed` | APPROVED (UTILITY) | Legacy; bootstrap's named exception **repoints** `SERVICE_COMPLETION_OTP` away from it to `whatsapp_verification`. No mapping references it. Delete or archive in Meta. |
| `puja_comfirmation_verification_code` | **REJECTED** | Never usable; remove from Meta (or leave rejected — it cannot be sent). |
| `hello_world` | APPROVED (UTILITY) | Meta test template; no mapping. Remove. |
| `admin_general_reminder`, `puja_started` | APPROVED (MARKETING) | No mapping references them; not part of any verified flow. Confirm whether these were manual/admin experiments — if unused, deprecate (they are MARKETING-category, which is the only place a genuine marketing template would live). |

---

# 7. New Templates Required

**None are required by the notification engine.** Every event that sends WhatsApp already has an approved template wired through a verified mapping.

One **edge case (mapping, not template):** `ORDER_PLACED` is emitted by `marketplace.controller.js:381`, and an `order_placed` template **already exists in Meta** (APPROVED, UTILITY, 3 body params), but **no NotificationMapping references it** — so no WhatsApp currently goes out for it. If order placement WhatsApp is desired, the fix is a **mapping** (admin-created, or a future bootstrap entry), **not a template**. Documented as an open decision (§21) — do not create the template again.

---

# 8. SERVICE_COMPLETED Template — Full Meta-Ready Specification

**Current production template (verified from the dump) — body to be PRESERVED:**

> Body: `Hi {{1}}, your {{3}} (Booking {{2}}) has been completed. Thank you for choosing Zutsav.`
> {{1}} = Customer name · {{2}} = Booking number · {{3}} = Pooja name

**Recommended final template:**

| Field | Value |
|---|---|
| Template name | `service_completed` (update in place; if Meta forces a new name for button edits, keep the mapping's `whatsappTemplateName` in sync — a code change, to be done in the separate implementation task) |
| Meta category | **UTILITY** (already UTILITY ✓) |
| Language | `en` (add other languages only if the product ships translated templates — see §21) |
| Header | none (current template has no header) |
| Footer | none |
| Body (unchanged) | `Hi {{1}}, your {{3}} (Booking {{2}}) has been completed. Thank you for choosing Zutsav.` |
| Variable count | **3** |
| Button 1 | **View Receipt** — URL button, dynamic: `https://<CLIENT_URL>/invoice/{{1}}` where `{{1}}` = booking id (`booking.id`, the `_id` of the Booking doc) |
| Button 2 | **Rate Your Experience** — URL button, static: `https://<CLIENT_URL>/my-bookings` (no parameter) |
| Example rendering | `Hi Priya, your Ganesh Puja (Booking ZUT-12345) has been completed. Thank you for choosing Zutsav.`<br>Buttons: `[View Receipt]` → `https://<CLIENT_URL>/invoice/65f0abc1234567890def0001` · `[Rate Your Experience]` → `https://<CLIENT_URL>/my-bookings` |

**Why the client's conceptual copy was NOT adopted verbatim:** the client's example ("We have successfully processed everything for you…") was explicitly guidance, and the existing approved template wording is already transactional, approved, and in production. Per the phase brief: review the existing production template first and preserve existing wording. The body stays as-is; only buttons are added.

**Destinations (verified in code — do not invent):**
- `/invoice/:bookingId` — `App.jsx` protected route; same link `MyBookings.jsx` uses (`/invoice/${b._id}`). Backend `GET /api/bookings/:id/invoice`.
- `/my-bookings` — `App.jsx` protected route; hosts the `StarRating` UI that calls `POST /api/bookings/:id/rate`.
- Both require login; the existing `ProtectedRoute` redirects to `/login?next=…` and returns the user after login.
- `<CLIENT_URL>` = `urls.clientUrl` (env `CLIENT_URL` or `FRONTEND_URL`, default `http://localhost:3000`; also settable via Admin → Settings → `deployWebsiteUrl`). **Supply the real production domain at Meta creation time.**

**Consent:** mapping purpose = `SERVICE` → the Phase 5 gate never blocks this message, including when `whatsapp.marketing.status = opted_out`. The feedback button does **not** change the purpose or category.

---

# 9. Feedback Button Design

- Feedback is an **optional action** on a transactional message. The body is utility-focused; no incentives, offers, or promotional language.
- **View Receipt** = dynamic URL button. The Cloud API receives only the dynamic suffix (booking id); the URL template lives in Meta. The engine's `parameterPath: 'booking.id'` supplies the value from the normalized payload (`booking.id` = Booking `_id`).
- **Rate Your Experience** = static URL button (no parameters) pointing at the existing My Bookings page.
- **Template-authoritative guard (engine, already implemented in Phase 5.1):** `WhatsAppChannel` sends button parameters **only** for URL buttons the synced template declares at the matching index; mismatches are omitted with a warning and never break the body send. Consequence: until `service_completed` is updated + re-synced in Meta, the message still sends (body only) — no downtime, no Meta errors.
- **Deep-link improvement (not required now):** a future `?rate=<bookingId>` on `/my-bookings` that auto-opens the rating widget would make "Rate Your Experience" a dynamic URL with `booking.id` as the parameter. This needs a small web change + a template re-declaration — out of scope for this stage.

---

# 10. Order Template Decision

**Not required at this stage.**

- `ORDER_DELIVERED` uses `order_delivered` (APPROVED, UTILITY, body: *"Hi {{1}}, your order {{2}} has been delivered. Thank you for shopping with Zutsav."*) — a purely transactional message with no feedback mechanism behind it.
- The codebase has **no order-feedback flow** (rating exists only for bookings/pandits). Adding `[Go to Dashboard]` / `[Share Feedback]` buttons to an order template would require inventing a destination and a product flow that do not exist.
- Per the phase brief: do not add feedback to order notifications just because the client mentioned a possible pattern. The engine's URL-button machinery is ready, so this can be added later **if** the business adds order feedback — no architectural work needed then.

---

# 11. Authentication Templates

**One template: `whatsapp_verification`** (AUTHENTICATION / APPROVED) — **REUSE AS-IS, do not touch.**

Body: `*{{1}}* is your verification code. For your security, do not share this code.`
Button: URL "Copy code" → `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}` (parameter = the code).

Used by 6 mappings — all `ACCOUNT` purpose, never consent-gated:
`OTP_VERIFICATION` (user, pandit) · `SERVICE_COMPLETION_OTP` (user) · `DELIVERY_OTP_SENT` (user) · `PASSWORD_RESET_WHATSAPP_OTP` (user, pandit).

Meta policy: AUTHENTICATION-category templates may be sent outside the 24-hour window and are unaffected by marketing opt-out. This aligns with the Zutsav gate (ACCOUNT purpose bypasses it). **No OTP template change is required** — the current implementation provides exactly one variable and the button's expected parameter, matching the template.

---

# 12. Booking Templates

Booking-lifecycle WhatsApp events and their templates (all REUSE AS-IS; `service_completed` is covered in §8):

| Event | Recipient | Template | Purpose | Trigger (verified) |
|---|---|---|---|---|
| BOOKING_CONFIRMED | user | `booking_confirmed` | BOOKING | payment success (`booking.controller.js onPaymentSuccess`; `checkout.controller.js` cart webhook) |
| BOOKING_CANCELLED | user | `booking_cancelled` | BOOKING | user cancel (`cancelBooking`) + admin status change |
| BOOKING_REFUNDED | user | `booking_refunded` | BOOKING | admin refund process / refunded status |
| SERVICE_REMINDER_24H | user | `service_reminder_24h` | BOOKING | cron `cleanupJobs.js` (~24h before) |
| SERVICE_REMINDER_1H | user | `service_reminder_1h` | BOOKING | cron `cleanupJobs.js` (~1h before) |
| SERVICE_COMPLETION_OTP | user | `whatsapp_verification` | ACCOUNT | `requestCompletion` (pandit requests completion) |
| SERVICE_COMPLETED | user | `service_completed` | SERVICE | completion (pandit OTP verify / admin status / admin approve) |
| INVOICE_GENERATED | user | `invoice_generated` | BOOKING | completion paths + `runInvoiceJob` safety-net cron |
| PANDIT_ACCEPTED | user | `pandit_accepted` | BOOKING | `pandit.controller.js` accept |
| PANDIT_ASSIGNED | user | `pandit_assigned` | BOOKING | **no emitter (dead mapping)** |
| KIT_SHIPPED | user | `kit_shipped` | ORDER | admin shipment (TekiPost) |
| KIT_DELIVERED | user | `kit_delivered` | ORDER | admin delivery update |
| REFERRAL_BOOKING_CREATED | referral_pandit | `referral_booking_created` | BOOKING | `fireReferralNotifications` on payment success |

No new booking templates. `invoice_generated` body verified: *"Hi {{1}}, your invoice for booking {{2}} (₹{{3}}) is ready."* (UTILITY).

---

# 13. Payment Templates

| Event | Recipient | Template | Meta cat (dump) | Purpose | Trigger |
|---|---|---|---|---|---|
| PAYMENT_SUCCESS | user | `payment_success` | UTILITY | BOOKING | payment success (booking + cart checkout) |
| PARTIAL_PAYMENT_RECEIVED | user | `partial_payment_received` | UTILITY | BOOKING | partial payment success |
| FINAL_PAYMENT_RECEIVED | user | `final_payment_received` | UTILITY | BOOKING | final/remaining payment success |
| PAYMENT_FAILED | user | `payment_failed` | **MARKETING** | BOOKING | `paymentAttempts.js` terminal-failure sweep |

- `payment_failed` carries **MARKETING category in Meta while the mapping is BOOKING purpose** → recommended re-verify to UTILITY (§22). Body: *"Hi {{1}}, your payment of ₹{{2}} could not be completed…"* (2 params; exact tail wording to verify in Meta).
- No payment **pending/retry/COD/pay-later** WhatsApp events exist in the codebase — do not create templates for them.

---

# 14. Pandit Templates

| Event | Recipient | Template | Purpose | Trigger | Notes |
|---|---|---|---|---|---|
| PANDIT_ASSIGNMENT_PENDING | pandit | `pandit_assignment_pending` | SERVICE | `admin.controller.js` pandit assignment | live |
| PANDIT_POOJA_APPROVED | pandit | `pandit_pooja_approved` | SERVICE | `poojaRequest.controller.js` | Meta cat MARKETING → verify |
| PANDIT_POOJA_REJECTED | pandit | `pandit_pooja_rejected` | SERVICE | `poojaRequest.controller.js` | Meta cat MARKETING → verify |
| PANDIT_APPROVED | pandit | `pandit_approved` | ACCOUNT | admin approval | |
| KYC_APPROVED / KYC_REJECTED / KYC_REUPLOAD_REQUIRED | pandit | `kyc_approved` / `kyc_rejected` / `kyc_reupload_required` | ACCOUNT | `updateKYCStatus` | |
| PAYOUT_RELEASED | pandit | `payout_released` | SERVICE | admin payout | |
| REFERRAL_PENDING_REMARK | pandit | `referral_pending_remark` | SERVICE | `fireReferralNotifications` | |
| PANDIT_REGISTERED | pandit | `pandit_registered` | ACCOUNT | **no emitter (dead)** | |
| REFERRAL_BOOKING_CREATED | referral_pandit | `referral_booking_created` | BOOKING | `fireReferralNotifications` | Meta cat MARKETING → verify |

All REUSE AS-IS. No new pandit templates.

---

# 15. Marketing Templates

**No current marketing WhatsApp templates are required by the existing notification engine.**

Verified:
- **Zero `MARKETING`-purpose NotificationMappings** in bootstrap v1.3.0 (all 45 are ACCOUNT/BOOKING/ORDER/SERVICE).
- **Zero direct-send marketing paths:** every outbound WhatsApp goes through the engine (the legacy `src/utils/whatsapp.js` is dead code; the webhook is inbound-only).
- The only `MARKETING`-category templates in Meta (`admin_general_reminder`, `puja_started`, plus the 7 misfiled transactional ones in §4/§3) have **no mappings**.
- Admin broadcasts (`sendBroadcast`) are **in-app only** — they never touch WhatsApp.

If marketing campaigns are ever launched, they will require **new MARKETING-category templates + MARKETING mappings** (consent-gated by the Phase 5 gate). That is a future, separate initiative — do not build marketing templates now.

---

# 16. Variable Mapping

Contract: mapping `whatsappVariables` count must equal template body `{{n}}` count. Verified against the dump — **all 40 referenced templates MATCH**. Full position map:

| Template | {{1}} | {{2}} | {{3}} | {{4}} | {{5}} |
|---|---|---|---|---|---|
| whatsapp_verification | otp.code (code) | — | — | — | — |
| new_user_registered | customer.name | — | — | — | — |
| payment_success | customer.name | booking.number | payment.amount | — | — |
| partial_payment_received | customer.name | payment.amount | booking.remainingAmount | — | — |
| final_payment_received | customer.name | payment.amount | booking.amount | — | — |
| payment_failed | customer.name | payment.amount | — | — | — |
| booking_confirmed | customer.name | booking.poojaName | booking.date | booking.time | booking.number |
| booking_cancelled | customer.name | booking.number | reason | — | — |
| booking_refunded | customer.name | booking.number | refund.amount | — | — |
| service_reminder_24h | customer.name | booking.poojaName | booking.date | booking.time | pandit.name |
| service_reminder_1h | customer.name | booking.poojaName | booking.time | pandit.name | — |
| service_completed | customer.name | booking.number | booking.poojaName | — | — |
| invoice_generated | customer.name | booking.number | booking.amount | — | — |
| feedback_request (deprecated) | customer.name | booking.poojaName | — | — | — |
| kit_shipped | customer.name | kit.courier | kit.trackingId | — | — |
| kit_delivered | customer.name | — | — | — | — |
| order_confirmed / order_packed / order_out_for_delivery / order_delivered / order_refunded | customer.name | order.number | — | — | — |
| order_shipped | customer.name | order.number | order.courierName | order.trackingNumber | — |
| order_cancelled | customer.name | order.number | reason | — | — |
| pandit_pooja_rejected | pandit.name | pooja.name | pooja.rejectionReason | — | — |
| pandit_registered / pandit_approved / kyc_approved / account_restored / account_deleted / account_deletion_cancelled | name (pandit.name or customer.name) | — | — | — | — |
| pandit_accepted | customer.name | pandit.name | booking.number | — | — |
| pandit_assigned | customer.name | pandit.name | booking.date | booking.time | booking.number |
| pandit_assignment_pending | pandit.name | booking.poojaName | booking.date | booking.time | — |
| referral_pending_remark | pandit.name | booking.number | — | — | — |
| pandit_pooja_approved | pandit.name | pooja.name | pooja.approvedPrice | — | — |
| kyc_rejected / kyc_reupload_required | pandit.name | pandit.reason | — | — | — |
| account_deletion_requested | customer.name | account.scheduledDeletionDate | — | — | — |
| referral_booking_created | pandit.name | booking.number | — | — | — |
| payout_released | pandit.name | payment.amount | — | — | — |

All values come from the canonical normalized payload (`PayloadNormalizer`): `customer.*`, `booking.*`, `payment.*`, `order.*`, `pandit.*`, `kit.*`, `refund.*`, `account.*`, `reason`, `otp.code`.

**SERVICE_COMPLETED button parameter:** `booking.id` (Booking `_id`) — a 4th value NOT part of the body; it feeds the View Receipt URL button only. Body count stays 3; button parameter is independent (Meta distinguishes body vs button parameters). **Status: MATCH.**

---

# 17. Button Mapping

| Template | Button | Type | Dynamic param | Destination |
|---|---|---|---|---|
| whatsapp_verification | Copy code | URL | otp.code | `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}` (Meta's standard OTP URL) |
| **service_completed (update)** | **View Receipt** | **URL** | **booking.id** | **`https://<CLIENT_URL>/invoice/{{1}}`** |
| **service_completed (update)** | **Rate Your Experience** | **URL** | none (static) | **`https://<CLIENT_URL>/my-bookings`** |

- Both service_completed destinations are **authenticated** web routes (login required; `ProtectedRoute` handles redirect + return).
- Mobile behavior: URL buttons open the mobile browser; the mobile app has its own rating modal (`BookingDetailScreen.jsx`) — the button does not deep-link into the app.
- All other templates have **no buttons** — do not add any.

---

# 18. Consent Purpose Mapping

| Zutsav purpose (NotificationMapping) | Meta category (recommended) | Phase 5 gate behavior | Templates |
|---|---|---|---|
| ACCOUNT | AUTHENTICATION (OTP) / UTILITY (account lifecycle) | never gated | whatsapp_verification, new_user_registered*, account_*, kyc_*, pandit_registered, pandit_approved |
| BOOKING | UTILITY | never gated | payment_success, partial_payment_received, final_payment_received, payment_failed*, booking_*, invoice_generated, pandit_accepted, pandit_assigned, referral_booking_created* |
| ORDER | UTILITY | never gated | order_*, kit_shipped, kit_delivered |
| SERVICE | UTILITY | never gated | service_completed, service_reminder_*, pandit_assignment_pending, pandit_pooja_*, referral_pending_remark, payout_released, feedback_request (deprecated) |
| MARKETING | MARKETING | **blocked unless explicit marketing opt-in** | none today |

`*` = currently filed as MARKETING in Meta (dump) but used for a non-marketing purpose → **re-verify/re-categorize to UTILITY** (§22).

**Enforcement summary (already implemented, Phase 5):**
- `MARKETING` mapping + `whatsapp.marketing.status !== 'opted_in'` → **BLOCK** (`marketing_consent_missing`), Meta never called.
- ACCOUNT/BOOKING/ORDER/SERVICE → **always send**, regardless of marketing opt-out. `SERVICE_COMPLETED` with marketing `opted_out` is verified to send (with buttons when the template declares them).
- Meta-side: AUTHENTICATION templates are exempt from marketing opt-out at Meta level; UTILITY templates are governed by the 24-hour customer-service window / opt-in rules — these are Meta policies, not the Zutsav gate, and are noted here for the Meta Manager operator.

---

# 19. Bootstrap Impact

`bootstrapNotificationMappings.js` is at **v1.3.0** and already encodes the 5.1 design. For the template actions in this document, the impact is:

| Template action | Mapping field impact | bootstrap change required? |
|---|---|---|
| `service_completed` **UPDATE** (add 2 URL buttons) | `SERVICE_COMPLETED` mapping already carries `whatsappUrlButtons` (View Receipt / Rate Your Experience) since v1.3.0 | **None** — already present. After Meta update, re-run template sync; sends automatically include buttons. |
| Category re-filing (7 transactional templates → UTILITY) | none (category lives on `WhatsAppTemplate`, synced from Meta, not on mappings) | **None** |
| `feedback_request` deprecate | `FEEDBACK_REQUEST` mapping already `enabled: false` in v1.3.0 (fresh DBs) / preserved (existing DBs); no emitter | **None** |
| Deleting unused templates (`puja_completed`, `hello_world`, etc.) | none | **None** — sync removes DB rows for templates deleted from Meta (existing behavior) |
| `order_placed` mapping (if decision = send order-placed WhatsApp) | would need a **new NotificationMapping** | Would need a bootstrap entry (future task — mapping, not template) |
| If Meta forces a **new template name** for `service_completed` (instead of in-place update) | `SERVICE_COMPLETED.whatsappTemplateName` must change | Would need a bootstrap entry update + a code change (separate implementation task) |

**No bootstrap changes are required for this template preparation stage.**

---

# 20. Meta Creation/Update Checklist

**Primary action — update `service_completed`:**
1. Open Meta WhatsApp Manager → Message Templates.
2. Edit `service_completed` (or duplicate-to-new if Meta requires).
3. Category: **UTILITY** (already UTILITY).
4. Body: keep `Hi {{1}}, your {{3}} (Booking {{2}}) has been completed. Thank you for choosing Zutsav.` (3 variables, unchanged).
5. Add **URL button** `View Receipt` → `https://<CLIENT_URL>/invoice/{{1}}` — provide an example value (e.g. `https://<CLIENT_URL>/invoice/65f0abc1234567890def0001`).
6. Add **URL button** `Rate Your Experience` → `https://<CLIENT_URL>/my-bookings` (static — no example value required).
7. Submit for approval; expect **re-approval** because buttons changed.
8. After approval: Admin → Communication → WhatsApp Templates → **Sync** (this updates `WhatsAppTemplate.components`, after which the engine sends the buttons).

**Secondary actions (recommended, low risk):**
9. Re-file the 7 transactional templates currently `MARKETING` → `UTILITY` (verify each in Meta first): `new_user_registered`, `payment_failed`, `order_cancelled`, `pandit_pooja_rejected`, `pandit_pooja_approved`, `account_deletion_cancelled`, `referral_booking_created`. (Re-filing may also require re-approval.)
10. Clean up unused templates in Meta: `puja_completed`, `puja_comfirmation_verification_code`, `hello_world`, `admin_general_reminder`, `puja_started`, and decide on `feedback_request` (keep or delete) and `order_placed` (see §21).

---

# 21. Open Questions

1. **Production `<CLIENT_URL>`** — confirm the exact production web domain to embed in the service_completed buttons (CLIENT_URL/FRONTEND_URL env or Admin `deployWebsiteUrl`).
2. **Update-in-place vs new template name** — does Meta allow adding buttons to the approved `service_completed`, or must a new name (e.g. `service_completed_v2`) be created (which would require a one-line mapping change in the implementation task)?
3. **Category re-filing** — business sign-off to re-file the 7 `MARKETING`-category templates to `UTILITY` (they are transactional); note re-approval may be required.
4. **`order_placed`** — `ORDER_PLACED` is emitted but has no mapping; the template exists. Should order-placement WhatsApp be enabled (new mapping, future task) or is it intentionally email/in-app only?
5. **Dead mappings** — `PANDIT_ASSIGNED` and `PANDIT_REGISTERED` have templates but no emitters: wire the flows, or delete the mappings/templates?
6. **`feedback_request` template** — keep in Meta (historical) or delete? Nothing sends it.
7. **Languages** — all templates are `en`; does the product require Hindi/regional-language variants (a template-language expansion project, separate from this audit)?
8. **Rate deep-link** — adopt `?rate=<bookingId>` on `/my-bookings` so the Rate button jumps straight to the rating widget (web change + template URL update, future task)?
9. **Order feedback** — if order feedback is added to the product later, `order_delivered` can gain buttons using the same machinery; not required now.

---

# 22. Final Recommended Template List

## A. Update (1)
| Template | Action | Category | Buttons |
|---|---|---|---|
| `service_completed` | **UPDATE** — add 2 URL buttons | UTILITY | View Receipt (dynamic, booking.id) · Rate Your Experience (static) |

## B. Reuse as-is (39)
All templates listed in §4 (including `whatsapp_verification` for the 6 OTP mappings). No changes.

## C. Reuse but re-verify Meta category (7)
`new_user_registered`, `payment_failed`, `order_cancelled`, `pandit_pooja_rejected`, `pandit_pooja_approved`, `account_deletion_cancelled`, `referral_booking_created` — currently `MARKETING` in Meta (dump); recommended `UTILITY`. **Verify current category in Meta first.**

## D. Deprecated / do not use (5–6)
`feedback_request` (flow retired), `puja_completed`, `puja_comfirmation_verification_code` (REJECTED), `hello_world`, `admin_general_reminder`, `puja_started` — confirm unused, then delete/archive in Meta.

## E. Create (0)
No new templates are required by the notification engine.

---

## FINAL META CREATION CHECKLIST (per template action)

**service_completed (UPDATE):**
- [ ] Template name: `service_completed` (or new name per §21-Q2)
- [ ] Category: UTILITY
- [ ] Language: en
- [ ] Header: none
- [ ] Body: `Hi {{1}}, your {{3}} (Booking {{2}}) has been completed. Thank you for choosing Zutsav.`
- [ ] Footer: none
- [ ] Variables: 3 (`{{1}}` customer name, `{{2}}` booking number, `{{3}}` pooja name) — MATCH with code
- [ ] Buttons: View Receipt (URL, dynamic) · Rate Your Experience (URL, static)
- [ ] URL parameters: View Receipt → `booking.id` (`https://<CLIENT_URL>/invoice/{{1}}`); Rate → none (`https://<CLIENT_URL>/my-bookings`)
- [ ] Example rendering: `Hi Priya, your Ganesh Puja (Booking ZUT-12345) has been completed. Thank you for choosing Zutsav.` + `[View Receipt]` / `[Rate Your Experience]`
- [ ] Existing/new: **existing — update**
- [ ] Meta Manager action: UPDATE (expect re-approval) → re-sync in Admin
- [ ] Purpose: SERVICE
- [ ] Consent requirement: none (never marketing-gated; verified to send with marketing opted_out)
- [ ] Code mapping impact: **none** — mapping already configured (bootstrap v1.3.0)

---

## STOP

This stage produced **`docs/whatsapp-template-master-specification.md`** only. No code, mapping, bootstrap, provider, channel, consent, or Meta resources were modified. Wait for instructions before implementing code changes or creating templates in Meta.
