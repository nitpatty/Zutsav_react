# Zutsav Notification Engine — Complete Audit & WhatsApp Template Requirement Document

**Status:** Read-only audit. No code was modified to produce this document.
**Scope:** Every notification event in the codebase, its trigger site, its recipient, its current
delivery status, and whether it requires a Meta WhatsApp template.
**Purpose:** Single source of truth for the upcoming Meta WhatsApp template cleanup/rollout —
so every required template can be created once, correctly, with no duplicates and nothing missed.

All findings below were produced by inspecting the actual repository code and by querying the
live development database (`NotificationMapping`, `WhatsAppTemplate`, `NotificationLog`
collections) — nothing in this document is guessed or assumed.

---

## 0. Executive Summary

| Metric | Count |
|---|---|
| Events registered in `EventRegistry.js` | **71** |
| Events with at least one `NotificationEngine.emit()` call site in code | **51** |
| Events registered but **never emitted anywhere** (dead code) | **20** |
| Events with **zero** `NotificationMapping` (any channel) — i.e. currently produce no notification even though the code fires them | **63 (89%)** |
| Events with an active WhatsApp mapping today | **4** distinct events (5 mapping rows) |
| Events with an active Email mapping today | **6** |
| Events with an active In-App mapping today | **2** |
| Meta WhatsApp templates synced into the DB | **17** |
| Of those 17, templates actually referenced by a live mapping | **4** (`payment_success`, `whatsapp_verification`, `hello_world`, `order_cancelled`) |
| Templates synced but **orphaned** (not referenced by any mapping) | **13** |
| Templates with `status: REJECTED` still sitting in the collection | **1** (`puja_comfirmation_verification_code` — also misspelled) |
| Live WhatsApp sends that have actually **failed** at Meta (last 30 days, from `NotificationLog`) | **7**, all `(#132000) Number of parameters does not match the expected number of params` on the `order_confirmed` template, plus 1× `(#132018)` param error on `whatsapp_verification` |
| Recipient types the engine architecturally supports | `user`, `pandit`, `admin`, `referral_pandit` — **there is no `vendor` recipient type or concept anywhere in this codebase** |

**Bottom line:** the notification *engine* (dispatch, queue, retry, template rendering,
variable resolution) is solid and correctly built. The *content layer* on top of it — which
events actually have a WhatsApp template wired up — is only ~6% complete (4 of 71 registered
events), and even one of those 4 live mappings (`BOOKING_CONFIRMED` → `order_confirmed`,
historically) has a documented, currently-reproducing Meta API failure in the logs. This
document exists to make sure the upcoming template-creation pass fixes all of this in one
coordinated round instead of template-by-template guesswork.

---

## 1. Architecture Overview (context for the rest of this document)

```
Controller/Cron job
  → NotificationEngine.emit(EVENT_NAME, normalizedPayload, {channel?})
    → EventDispatcher.dispatch()
      → MappingCache.getEnabledMappings(EVENT_NAME)   [DB: NotificationMapping, 30s TTL cache]
      → for each enabled mapping: resolveRecipients(mapping.recipientType, payload)
      → JobQueue.enqueue(...)  — one durable NotificationJob per (mapping × recipient)
        → Worker (polls every 5s, batch 20)
          → ChannelRegistry.get(mapping.channel).send(mapping, payload, recipient)
             - EmailChannel    → TemplateEngine.render('email', …)    → EmailProvider
             - WhatsAppChannel → TemplateEngine.render('whatsapp', …) → WhatsAppProvider (Meta Graph API)
             - InAppChannel    → TemplateEngine.render('inapp', …)    → Socket.IO + Notification doc
          → NotificationLog entry written (delivered / failed / skipped)
```

Key facts that shape everything below:

- **Every recipient, template, and channel is admin-configured data (`NotificationMapping`
  documents), not code.** A developer adding `NotificationEngine.emit('X', payload)` to a
  controller does nothing on its own — nothing sends until an admin creates a matching
  `NotificationMapping` row in the Notification Engine admin UI. This is why 63 of 71 events
  currently produce zero notifications despite being wired up in code.
- **`payload` is always one of five canonical shapes**, produced by
  `backend/notification-engine/variables/PayloadNormalizer.js`:
  `normalizeBookingPayload`, `normalizeOrderPayload`, `normalizePanditPayload`,
  `normalizePoojaRequestPayload`, `normalizeUserPayload`. Every variable available to any
  WhatsApp template must come from one of these five shapes — see §1.1. **Nothing outside
  these shapes exists** (there is, for example, no "support contact number" field anywhere in
  the payload — see §5.9).
- **Recipient resolution supports exactly four types**: `user` (from `payload.customer`),
  `pandit` (from `payload.pandit`), `referral_pandit` (same resolution as `pandit`, semantically
  distinct for referral events), and `admin` (queries **all** `User` docs with `role: 'admin'`
  directly — ignores the payload entirely). **There is no `vendor` recipient type** — Zutsav has
  no vendor/supplier entity in this codebase, only customers, pandits, and admins.
- **WhatsApp template resolution is a single path**: `NotificationMapping.whatsappTemplateName`
  (a free-text string, admin-typed/selected) is looked up directly — there is **no foreign-key
  enforcement** against the `WhatsAppTemplate` collection, so a typo in this field fails silently
  at send time rather than at configuration time.

### 1.1 Canonical payload shape (this is the complete list of variables that can ever exist)

| Top-level key | Fields | Populated by |
|---|---|---|
| `customer` | `userId, name, phone, email, address` | all normalizers |
| `booking` | `id, number, date, time, amount, status, language, poojaName` | `normalizeBookingPayload` only (empty on order/pandit/pooja/user events) |
| `payment` | `amount, method, transactionId, status` | `normalizeBookingPayload`, partially on `normalizePanditPayload` (amount only) |
| `order` | `id, number, total, status, courierName, trackingNumber` | `normalizeOrderPayload` only |
| `pandit` | `userId, name, phone, email` (+ `reason, batchId, bookingCount` on pandit-lifecycle events) | `normalizeBookingPayload` (when a pandit is involved), `normalizePanditPayload`, `normalizePoojaRequestPayload` |
| `pooja` | `name, expectedPrice, approvedPrice, rejectionReason` | `normalizePoojaRequestPayload` **only** — no other event has this key |
| `kit` | `amount, courier, trackingId` | `normalizeBookingPayload` |
| `refund` | `amount, status` | `normalizeBookingPayload` |
| `otp` | `code` | any normalizer, when an OTP is part of the flow |
| `account` | `scheduledDeletionDate, requestedDate` | `normalizeUserPayload` only |
| `reason` | plain string | `normalizeBookingPayload`, `normalizeOrderPayload`, `normalizeUserPayload` |
| Legacy aliases | `user` (= `customer`), `booking.bookingNumber/scheduledDate/scheduledTime/amountPaid/grandTotal` | applied to every payload for backward compatibility with older mapping content |

**There is no field for**: support/helpline contact number, company name/branding string, pandit
rating, delivery address city/pincode broken out, invoice number/link, referral code/link, or
pooja duration/date/time on `pooja.*`. Any template that wants these must either (a) hardcode
them as static text in the Meta template body (not a variable), or (b) get a normalizer change
first — flagged explicitly in §5.9 so nothing is invented at template-creation time.

---

## 2 & 3. Categorized Notification Inventory, Recipients & WhatsApp Requirement

Legend for **Fires?**: 🟢 = emitted from a real code path today · 🔴 = registered in
`EventRegistry.js` but **no emit call site exists anywhere** in the codebase (dead/aspirational).
Legend for **Mapped?**: ✅ = has a live `NotificationMapping` today (any channel) · — = none.
**Template Category** follows Meta's three official classes (Utility / Authentication /
Marketing); "N/A" = no WhatsApp template recommended.

### 2.1 Authentication (7 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `OTP_VERIFICATION` | 🟢 `auth.controller.js` (registration + account-deletion OTP) | ✅ WA+Email, user & pandit | Customer / Pandit | **YES** | Live today; sends the actual login/verification code | **Authentication** | `otp.code` |
| `USER_REGISTERED` | 🟢 `auth.controller.js:184` | — | Customer | **YES** | Welcome message after successful signup | Utility | `customer.name` |
| `OTP_CREATED` | 🔴 never emitted | — | — | NO | Dead duplicate of `OTP_VERIFICATION` — see §5.1 | N/A | — |
| `OTP_VERIFIED` | 🔴 never emitted | — | — | NO | Dead — no code path confirms OTP success as a distinct notification | N/A | — |
| `LOGIN_SUCCESS` | 🔴 never emitted (only `ADMIN_LOGIN` fires; regular user login is untracked — see §5.7) | — | Customer | NO (not yet) | Would need a real "new device login" security-alert use case before templating | N/A | — |
| `LOGIN_FAILED` | 🔴 never emitted (admin-tier failures are audit-logged only, not notified) | — | — | NO (not yet) | Same as above | N/A | — |
| `PASSWORD_RESET` | 🔴 never emitted — **no forgot-password flow exists in `auth.controller.js` at all** | — | Customer | **YES, once built** | Standard security-critical flow; template should be pre-approved even before the feature ships since Authentication-category templates are the slowest to get approved | **Authentication** | `otp.code` (per `REQUIRED_VARIABLES`) |

### 2.2 Payment (7 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `PAYMENT_SUCCESS` | 🟢 `booking.controller.js` (`onPaymentSuccess` helper) | — | Customer | **YES** | Core transactional receipt; currently unmapped (§5.2) | Utility | `customer.name`, `booking.number`, `payment.amount`, `payment.method`, `payment.transactionId` |
| `PARTIAL_PAYMENT_RECEIVED` | 🟢 `booking.controller.js` | — | Customer | **YES** | Partial-payment plans need their own receipt | Utility | `customer.name`, `payment.amount`, `booking.amount` (balance context) |
| `FINAL_PAYMENT_RECEIVED` | 🟢 `booking.controller.js` | — | Customer | **YES** | Closes out a partial-payment plan | Utility | `customer.name`, `booking.amount`, `payment.amount` |
| `PAYMENT_CREATED` | 🔴 never emitted | — | — | NO | Dead duplicate of `PAYMENT_SUCCESS`/`ORDER_PLACED` — see §5.1 | N/A | — |
| `PAYMENT_FAILED` | 🔴 **never emitted — real gap** | — | Customer | **YES, once wired up** | No payment-failure notification exists anywhere today; this is a genuine business gap, not just a missing template — see §5.4 | Utility | `customer.name`, `payment.amount` (per `REQUIRED_VARIABLES`) |
| `REFUND_INITIATED` | 🔴 never emitted | — | — | NO | Superseded by `BOOKING_REFUNDED`/`ORDER_REFUNDED` — see §5.1 | N/A | — |
| `REFUND_COMPLETED` | 🔴 never emitted | — | — | NO | Same — dead generic duplicate | N/A | — |

### 2.3 Booking (13 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `BOOKING_CREATED` | 🔴 never emitted | — | — | NO | Dead — bookings only notify once paid (`BOOKING_CONFIRMED`); no separate "created" step exists | N/A | — |
| `BOOKING_CONFIRMED` | 🟢 4 call sites (`booking.controller.js`, `checkout.controller.js` ×2) | ✅ WA+Email | Customer | **YES** | Highest-volume transactional event; **currently has an actively failing WhatsApp mapping** — see §5.3 | **Utility** | `customer.name`, `booking.number`, `booking.date`, `booking.time`, `booking.poojaName`, `pandit.name` (if assigned), `payment.amount` |
| `BOOKING_CANCELLED` | 🟢 `booking.controller.js`, `admin.controller.js` | ✅ WA+Email | Customer | **YES** | Live, but mapping has zero variables configured — see §5.3 | Utility | `customer.name`, `booking.number`, `reason` |
| `BOOKING_REFUNDED` | 🟢 `admin.controller.js` ×2 | — | Customer | **YES** | Distinct from cancellation — refund amount/status matter | Utility | `customer.name`, `booking.number`, `refund.amount`, `refund.status` |
| `BOOKING_COMPLETED` | 🔴 never emitted | — | — | NO | Dead duplicate — `SERVICE_COMPLETED` is the live event for this | N/A | — |
| `SERVICE_COMPLETION_OTP` | 🟢 `booking.controller.js` | — | Customer | **YES** | Pandit-requested completion OTP — same class of security-sensitive code as `OTP_VERIFICATION` | **Authentication** | `otp.code` |
| `SERVICE_REMINDER_24H` | 🟢 cron (`cleanupJobs.js`, every 30 min) | — | Customer | **YES** | Genuine engagement value; only fires from a scheduled job today, still needs a template | Utility | `customer.name`, `booking.date`, `booking.time`, `booking.poojaName`, `pandit.name` |
| `SERVICE_REMINDER_1H` | 🟢 cron (every 10 min) | — | Customer | **YES** | Same as above, shorter horizon | Utility | same as `SERVICE_REMINDER_24H` |
| `SERVICE_COMPLETED` | 🟢 3 code paths + cron safety net (see §5.5) | — | Customer | **YES** | Confirms service delivery | Utility | `customer.name`, `booking.number`, `booking.poojaName` |
| `INVOICE_GENERATED` | 🟢 3 code paths + cron safety net (see §5.5) | — | Customer | **YES** | Should carry a link/number, not the invoice itself (WhatsApp media not currently wired) | Utility | `customer.name`, `booking.number`, `booking.amount` |
| `FEEDBACK_REQUEST` | 🟢 3 code paths + cron safety net (see §5.5) | — | Customer | Optional | Feedback nudges are commonly Marketing-adjacent; recommend Utility if phrased as a service follow-up, Marketing if it includes a review-discount incentive | Utility (as currently worded) or Marketing (if incentivized) | `customer.name`, `booking.poojaName` |
| `KIT_SHIPPED` | 🟢 `admin.controller.js` ×2 | — (only In-App mapped) | Customer | **YES** | Physical kit tracking; currently in-app only, no WhatsApp | Utility | `customer.name`, `kit.courier`, `kit.trackingId` |
| `KIT_DELIVERED` | 🟢 `admin.controller.js` | — (only In-App mapped) | Customer | **YES** | Same | Utility | `customer.name` |

### 2.4 Pandit (14 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `PANDIT_ASSIGNED` | 🔴 **never emitted — real gap** | — | Customer | **YES, once wired up** | Registered specifically as "notify user: pandit was assigned" but no code path fires it — only the pandit-facing `PANDIT_ASSIGNMENT_PENDING` fires; the customer is never told who their pandit is. This is the exact "Booking Assigned" scenario used as the worked example in the template-request brief — see §5.6 | Utility | `customer.name`, `pandit.name`, `booking.number`, `booking.date`, `booking.time`, `booking.poojaName` |
| `PANDIT_ASSIGNMENT_PENDING` | 🟢 `admin.controller.js:1714` | — | Pandit | **YES** | Tells the pandit a new booking needs accept/reject | Utility | `pandit.name`, `booking.number`, `booking.poojaName`, `booking.date`, `booking.time` |
| `PANDIT_ACCEPTED` | 🟢 `pandit.controller.js` | — | Customer (+ admin per code comment, not implemented) | **YES** | Confirms pandit acceptance to the customer | Utility | `customer.name`, `pandit.name`, `booking.number` |
| `PANDIT_REJECTED` | 🟢 `pandit.controller.js` | — | Admin | **NO** (recommend email/in-app/dashboard only) | Internal ops signal ("needs reassignment"), not customer-facing | N/A | `pandit.reason`, `booking.number` |
| `PANDIT_APPROVED` | 🟢 `admin.controller.js:621` (legacy endpoint) | — | Pandit | **YES** | Pandit's profile-approval milestone | Utility | `pandit.name` |
| `PANDIT_POOJA_REQUEST_CREATED` | 🟢 `poojaRequest.controller.js` | — | Admin | **NO** (recommend email/in-app/dashboard only) | Internal review-queue alert | N/A | `pandit.name`, `pooja.name` |
| `PANDIT_POOJA_APPROVED` | 🟢 `poojaRequest.controller.js` | — | Pandit | **YES** | Pandit needs to know their custom pooja is live and at what price | Utility | `pandit.name`, `pooja.name`, `pooja.approvedPrice` |
| `PANDIT_POOJA_REJECTED` | 🟢 `poojaRequest.controller.js` | — | Pandit | **YES** | Rejection reason should reach the pandit | Utility | `pandit.name`, `pooja.name`, `pooja.rejectionReason` |
| `KYC_SUBMITTED` | 🟢 `pandit.controller.js:109` | — | Admin | **NO** (recommend email/in-app/dashboard only) | Internal review-queue alert; also see §5.8 stale-payload bug | N/A | `pandit.name` |
| `KYC_APPROVED` | 🟢 `admin.controller.js:646` | — | Pandit | **YES** | Unlocks ability to receive bookings — important milestone | Utility | `pandit.name` |
| `KYC_REJECTED` | 🟢 `admin.controller.js:654` | — | Pandit | **YES** | Reason should reach the pandit | Utility | `pandit.name`, `pandit.reason` |
| `KYC_REUPLOAD_REQUIRED` | 🟢 `admin.controller.js:662` | — | Pandit | **YES** | Actionable — pandit must re-submit documents | Utility | `pandit.name`, `pandit.reason` |
| `PAYOUT_RELEASED` | 🟢 `admin.controller.js` ×2 (batch + single) | — | Pandit | **YES** | Payment confirmation — high-trust, high-value message | Utility | `pandit.name`, `payment.amount`, `pandit.batchId`/`pandit.bookingCount` (batch only) |
| `PANDIT_REGISTERED` | 🔴 **never emitted — real gap** | — | Pandit + Admin | **YES, once wired up** | `registerPandit` in `auth.controller.js` creates the pandit application but never confirms receipt to the applicant nor alerts admin of a new application to review — see §5.6 | Utility | `pandit.name` |

### 2.5 Marketplace (12 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `ORDER_PLACED` | 🟢 `marketplace.controller.js:342` | — | Customer | **YES** | Initial order-placed receipt (pre-payment-confirmation) | Utility | `customer.name`, `order.number`, `order.total` |
| `ORDER_CREATED` | 🔴 never emitted | — | — | NO | Dead duplicate of `ORDER_PLACED` — see §5.1 | N/A | — |
| `ORDER_PAID` | 🔴 never emitted | — | — | NO | Dead — `ORDER_CONFIRMED` (below) covers this transition | N/A | — |
| `ORDER_CONFIRMED` | 🟢 `admin.controller.js:2049` (dynamic status map) | — | Customer | **YES** | Order status transition to confirmed | Utility | `customer.name`, `order.number`, `order.total` |
| `ORDER_PACKED` | 🟢 same dynamic map | — | Customer | **YES** | Order status transition | Utility | `customer.name`, `order.number` |
| `ORDER_SHIPPED` | 🟢 4 call sites (dynamic map + 3 direct TekiPost/manual paths — see §5.5) | — | Customer | **YES** | Should carry courier + tracking | Utility | `customer.name`, `order.number`, `order.courierName`, `order.trackingNumber` |
| `ORDER_OUT_FOR_DELIVERY` | 🟢 dynamic map + `syncTekipostOrderStatus` | — | Customer | **YES** | Delivery-day notification | Utility | `customer.name`, `order.number` |
| `ORDER_DELIVERED` | 🟢 3 call sites | — | Customer | **YES** | Delivery confirmation | Utility | `customer.name`, `order.number` |
| `ORDER_CANCELLED` | 🟢 dynamic map | — | Customer | **YES** | Cancellation confirmation | Utility | `customer.name`, `order.number`, `reason` |
| `ORDER_REFUNDED` | 🟢 dynamic map | — | Customer | **YES** | Refund confirmation, marketplace-specific | Utility | `customer.name`, `order.number`, `refund.amount`/`refund.status` (order refund status is on `order.status`/`reason`, not a populated `refund` object — confirm before templating, see §5.9) |
| `DELIVERY_OTP_SENT` | 🟢 `_generateAndSendDeliveryOTP` helper, 2 call sites | — | Customer | **YES** | Delivery-confirmation code | **Authentication** | `otp.code` |
| `MARKETPLACE_ORDER` | 🔴 never emitted | — | — | NO | Dead duplicate of `ORDER_PLACED` — see §5.1 | N/A | — |

### 2.6 Referral (3 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `REFERRAL_BOOKING_CREATED` | 🟢 `booking.controller.js` (`fireReferralNotifications` helper) | — | Pandit (referring) | **YES** | Referring pandit should know their referral converted | Utility | `pandit.name`, `booking.number` |
| `REFERRAL_PENDING_REMARK` | 🟢 same helper | — | Pandit (referring) | **YES** | Actionable — pandit must submit a remark | Utility | `pandit.name`, `booking.number` |
| `REFERRAL_REMARK_SUBMITTED` | 🟢 `referral.controller.js:157` | — | Admin | **NO** (recommend email/in-app/dashboard only) | Internal review signal | N/A | `pandit.name` |

### 2.7 Account (4 events)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `ACCOUNT_DELETION_REQUESTED` | 🟢 `auth.controller.js:453` | ✅ WA+Email | Customer | **YES** | Live today, but currently mapped to Meta's placeholder `hello_world` template — see §5.3 | Utility | `customer.name`, `account.scheduledDeletionDate` |
| `ACCOUNT_DELETION_CANCELLED` | 🟢 `admin.controller.js:862` | — | Customer | **YES** | Confirms the account was NOT deleted | Utility | `customer.name` |
| `ACCOUNT_RESTORED` | 🟢 `auth.controller.js:500` | ✅ Email only | Customer | **YES** | Same lifecycle family — add WhatsApp for parity with `ACCOUNT_DELETED`/`ACCOUNT_DELETION_REQUESTED` | Utility | `customer.name` |
| `ACCOUNT_DELETED` | 🟢 `cleanupJobs.js:48` (30-day grace-period cron) | ✅ Email only | Customer | **YES** | Final confirmation — fires from a cron job after the User doc is already deleted, so this MUST be sent before/atomically with deletion or the phone number becomes unreachable after — see §5.9 | Utility | `customer.name` (payload built from the about-to-be-deleted user, still valid at emit time) |

### 2.8 Admin Management (7 events)

All seven are admin-account lifecycle events (`adminManagement.controller.js`) — the "customer"
in the payload is the admin account being created/modified, not an end user.

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `ADMIN_CREATED` | 🟢 | — | Target admin account | Optional | Contains a plaintext temp password in some variants — **do not put credentials in a WhatsApp template**; recommend Email only | N/A (Email) | `customer.name` |
| `ADMIN_UPDATED` | 🟢 | — | Target admin account | NO | Low-urgency; email/in-app sufficient | N/A | `customer.name` |
| `ADMIN_SUSPENDED` | 🟢 (also reused for soft-delete — see §5.1) | — | Target admin account | Optional | Security-relevant; Utility if templated | Utility | `customer.name` |
| `ADMIN_ACTIVATED` | 🟢 | — | Target admin account | NO | Low-urgency | N/A | `customer.name` |
| `ADMIN_PASSWORD_RESET` | 🟢 | — | Target admin account | **NO — never put `tempPassword` in a WhatsApp template** | Payload literally includes plaintext `tempPassword` (see §5.9); WhatsApp is not an acceptable channel for credential delivery | N/A | — |
| `ADMIN_LOGIN` | 🟢 | — | Target admin | NO | Security-log event, not a template candidate | N/A | — |
| `ADMIN_LOGOUT` | 🟢 | — | Target admin | NO | Same | N/A | — |

### 2.9 Content (3 events) & Marketing (1 event)

| Event | Fires? | Mapped? | Recipient | Template Required? | Reason | Category | Variables available |
|---|---|---|---|---|---|---|---|
| `BLOG_PUBLISHED` | 🔴 never emitted (blog approval uses `createNotification` in-app-only — see §5.2) | — | Blog author (customer) | NO (not yet) | Currently in-app only by design; would become Marketing if ever pushed to WhatsApp | Marketing (if built) | `customer.name` |
| `FESTIVAL_CREATED` | 🔴 never emitted | — | Customer (broadcast) | Future | If built as a "festival is coming" push, this is a classic Marketing broadcast use case, requires WhatsApp opt-in consent per Meta policy | **Marketing** (if built) | `customer.name` (no festival-specific fields exist in any normalizer today) |
| `TEMPLE_CREATED` | 🔴 never emitted | — | Customer (broadcast) | Future | Same caveat as above | **Marketing** (if built) | `customer.name` |
| `NEWSLETTER_SUBSCRIBED` | 🔴 never emitted | — | Customer | Future | Confirmation-of-subscription message, if a subscribe flow is ever wired to the engine | Utility (confirmation) or Marketing (welcome-offer) | `customer.name` |

---

## 4. Variable Mapping — WhatsApp `{{n}}` Positional Format

For every event marked **YES** above, here is the recommended positional variable order,
built **only** from fields confirmed present in §1.1. This is the format Meta templates require
(`{{1}}`, `{{2}}`, …), matching the existing `NotificationMapping.whatsappVariables` schema
(`{ position, payloadPath, label }`).

> Note: `customer.name` / `pandit.name` is `{{1}}` in every template below for consistency —
> matching the existing convention already used by the two live templates
> (`payment_success`, `whatsapp_verification`).

| Event | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` | `{{5}}` |
|---|---|---|---|---|---|
| `OTP_VERIFICATION` | `otp.code` | — | — | — | — |
| `USER_REGISTERED` | `customer.name` | — | — | — | — |
| `PASSWORD_RESET` (once built) | `customer.name` | `otp.code` | — | — | — |
| `PAYMENT_SUCCESS` | `customer.name` | `booking.number` | `payment.amount` | — | — |
| `PARTIAL_PAYMENT_RECEIVED` | `customer.name` | `payment.amount` | `booking.amount` | — | — |
| `FINAL_PAYMENT_RECEIVED` | `customer.name` | `payment.amount` | `booking.amount` | — | — |
| `PAYMENT_FAILED` (once wired) | `customer.name` | `payment.amount` | — | — | — |
| `BOOKING_CONFIRMED` | `customer.name` | `booking.poojaName` | `booking.date` | `booking.time` | `booking.number` |
| `BOOKING_CANCELLED` | `customer.name` | `booking.number` | `reason` | — | — |
| `BOOKING_REFUNDED` | `customer.name` | `booking.number` | `refund.amount` | — | — |
| `SERVICE_COMPLETION_OTP` | `otp.code` | — | — | — | — |
| `SERVICE_REMINDER_24H` | `customer.name` | `booking.poojaName` | `booking.date` | `booking.time` | `pandit.name` |
| `SERVICE_REMINDER_1H` | `customer.name` | `booking.poojaName` | `booking.time` | `pandit.name` | — |
| `SERVICE_COMPLETED` | `customer.name` | `booking.number` | `booking.poojaName` | — | — |
| `INVOICE_GENERATED` | `customer.name` | `booking.number` | `booking.amount` | — | — |
| `FEEDBACK_REQUEST` | `customer.name` | `booking.poojaName` | — | — | — |
| `KIT_SHIPPED` | `customer.name` | `kit.courier` | `kit.trackingId` | — | — |
| `KIT_DELIVERED` | `customer.name` | — | — | — | — |
| `PANDIT_ASSIGNED` (once wired) | `customer.name` | `pandit.name` | `booking.date` | `booking.time` | `booking.number` |
| `PANDIT_ASSIGNMENT_PENDING` | `pandit.name` | `booking.poojaName` | `booking.date` | `booking.time` | — |
| `PANDIT_ACCEPTED` | `customer.name` | `pandit.name` | `booking.number` | — | — |
| `PANDIT_APPROVED` | `pandit.name` | — | — | — | — |
| `PANDIT_POOJA_APPROVED` | `pandit.name` | `pooja.name` | `pooja.approvedPrice` | — | — |
| `PANDIT_POOJA_REJECTED` | `pandit.name` | `pooja.name` | `pooja.rejectionReason` | — | — |
| `KYC_APPROVED` | `pandit.name` | — | — | — | — |
| `KYC_REJECTED` | `pandit.name` | `pandit.reason` | — | — | — |
| `KYC_REUPLOAD_REQUIRED` | `pandit.name` | `pandit.reason` | — | — | — |
| `PAYOUT_RELEASED` | `pandit.name` | `payment.amount` | — | — | — |
| `PANDIT_REGISTERED` (once wired) | `pandit.name` | — | — | — | — |
| `ORDER_PLACED` | `customer.name` | `order.number` | `order.total` | — | — |
| `ORDER_CONFIRMED` | `customer.name` | `order.number` | — | — | — |
| `ORDER_PACKED` | `customer.name` | `order.number` | — | — | — |
| `ORDER_SHIPPED` | `customer.name` | `order.number` | `order.courierName` | `order.trackingNumber` | — |
| `ORDER_OUT_FOR_DELIVERY` | `customer.name` | `order.number` | — | — | — |
| `ORDER_DELIVERED` | `customer.name` | `order.number` | — | — | — |
| `ORDER_CANCELLED` | `customer.name` | `order.number` | `reason` | — | — |
| `ORDER_REFUNDED` | `customer.name` | `order.number` | — | — | — (confirm refund-amount field before finalizing, §5.9) |
| `DELIVERY_OTP_SENT` | `otp.code` | — | — | — | — |
| `REFERRAL_BOOKING_CREATED` | `pandit.name` | `booking.number` | — | — | — |
| `REFERRAL_PENDING_REMARK` | `pandit.name` | `booking.number` | — | — | — |
| `ACCOUNT_DELETION_REQUESTED` | `customer.name` | `account.scheduledDeletionDate` | — | — | — |
| `ACCOUNT_DELETION_CANCELLED` | `customer.name` | — | — | — | — |
| `ACCOUNT_RESTORED` | `customer.name` | — | — | — | — |
| `ACCOUNT_DELETED` | `customer.name` | — | — | — | — |

Every path above already exists in `PayloadNormalizer.js`/`REQUIRED_VARIABLES` — none of it was
invented. Where the brief's own worked example (`Booking Confirmed` with a `Support Number`
variable) referenced a field that doesn't exist in the payload, it was **not** carried into this
table — see §5.9.

---

## 5. Problems Detected

### 5.1 Dead/duplicate events cluttering the registry (20 events, never emitted)
`OTP_CREATED`, `OTP_VERIFIED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `PASSWORD_RESET`,
`PAYMENT_CREATED`, `PAYMENT_FAILED`, `REFUND_INITIATED`, `REFUND_COMPLETED`, `BOOKING_CREATED`,
`BOOKING_COMPLETED`, `PANDIT_ASSIGNED`, `PANDIT_REGISTERED`, `ORDER_CREATED`, `ORDER_PAID`,
`MARKETPLACE_ORDER`, `BLOG_PUBLISHED`, `FESTIVAL_CREATED`, `TEMPLE_CREATED`,
`NEWSLETTER_SUBSCRIBED`. Several of these (`PAYMENT_CREATED`/`PAYMENT_SUCCESS`,
`ORDER_CREATED`/`ORDER_PLACED`/`MARKETPLACE_ORDER`, `BOOKING_CREATED`/`BOOKING_CONFIRMED`,
`BOOKING_COMPLETED`/`SERVICE_COMPLETED`, `REFUND_INITIATED`/`REFUND_COMPLETED` vs.
`BOOKING_REFUNDED`/`ORDER_REFUNDED`, `OTP_CREATED`/`OTP_VERIFIED` vs. `OTP_VERIFICATION`) are
**semantic duplicates left over from an earlier naming pass** (the `EventRegistry.js` comment at
line 69 confirms a "unified event-driven rebuild" happened additively, without removing the old
names). **Recommendation: do not create Meta templates for any of these 20 — building a template
for a dead event is pure waste.** If/when engineering consolidates the registry, remove the dead
half of each pair.

### 5.2 89% of registered events have zero notification mapping
63 of 71 events (including business-critical ones like `PAYMENT_SUCCESS`, `KYC_APPROVED`,
`PANDIT_POOJA_APPROVED`, every `ORDER_*` status transition, and every `SERVICE_REMINDER_*`) are
correctly emitted by the code but currently reach **zero** recipients on any channel — not
WhatsApp, not email, not even in-app. `EventDispatcher.dispatch()` returns `{enqueued: 0}`
silently in this case; nothing errors, nothing logs a warning visible outside the code. This is
the single biggest gap in the system and the primary reason this audit was commissioned.

### 5.3 Currently-live WhatsApp mappings are broken or misconfigured
Real evidence pulled from the `NotificationLog` collection (not speculation):
- `BOOKING_CONFIRMED` was mapped to the `order_confirmed` Meta template and has **failed 6
  times** with Meta error `(#132000) Number of parameters does not match the expected number of
  params` — a hard mismatch between the template's approved body and the variables sent. (Note:
  the *current* live mapping for `BOOKING_CONFIRMED` is `payment_success`, so this specific
  broken pairing is historical, but it is direct proof this exact class of bug has already
  happened once in production and will happen again without a coordinated template audit.)
- `whatsapp_verification` (used for `OTP_VERIFICATION`) has logged `(#132018) There's an issue
  with the parameters in your template` at least once.
- `BOOKING_CANCELLED`'s live mapping to the `order_cancelled` template has
  **`whatsappVariables: []`** — zero variables configured — even though `BOOKING_CANCELLED`
  requires `customer.name` + `booking.number` per `VariableSchemas.js`. If the approved Meta
  template body has `{{1}}`/`{{2}}` placeholders, every send will fail with the same
  `#132000` error the moment it's exercised (it may simply not have been tested yet).
- `ACCOUNT_DELETION_REQUESTED` is currently mapped to **`hello_world`** — Meta's generic sample
  template — with `whatsappVariables: []`. This is a placeholder that was never replaced with a
  real template; a real account-deletion-confirmation message is not actually being sent today.

### 5.4 Missing payment-failure notification (business gap, not just a template gap)
`PAYMENT_FAILED` is registered and has a `REQUIRED_VARIABLES` entry, but **no controller ever
emits it**. Every payment integration point (`checkout.controller.js`, `booking.controller.js`)
only handles the success path. A customer whose payment fails currently gets no WhatsApp, no
email, and no in-app signal — flag to engineering as a functional gap to close before this event
is worth templating.

### 5.5 Duplicate/overlapping event triads from multiple code paths
The exact same 3-event group (`INVOICE_GENERATED`, `FEEDBACK_REQUEST`, `SERVICE_COMPLETED`)
fires from **three independent controller code paths** that can each mark a booking
`completed` (`booking.controller.js:849-851` pandit OTP-verify, `admin.controller.js:1819-1821`
admin manual status change, `admin.controller.js:1879-1881` admin approve-completion) **plus** a
cron safety net in `cleanupJobs.js`. Similarly `ORDER_SHIPPED` fires from 3 separate admin call
sites (TekiPost auto-confirm, TekiPost manual-confirm, manual/local-courier). None of these paths
currently double-fire for the same booking/order in the flows reviewed, but there is no guard
preventing it if two admin actions on the same record both reach a shipped/completed transition —
worth a code-level dedupe check (e.g. guard on previous status) before WhatsApp volume makes a
duplicate-message complaint visible to a customer.

### 5.6 `PANDIT_ASSIGNED` and `PANDIT_REGISTERED` are registered but dead — real business gaps
- `PANDIT_ASSIGNED` exists specifically to tell the **customer** who their pandit is, per its own
  inline comment in `EventRegistry.js`. It is never emitted. Only `PANDIT_ASSIGNMENT_PENDING`
  (the pandit-facing "you have a new booking" version) fires. Customers today are not notified
  when a pandit is assigned to their booking.
- `PANDIT_REGISTERED` is never emitted from `registerPandit` in `auth.controller.js`. A pandit
  who completes registration gets no confirmation, and admins get no "new application to review"
  alert — they have to notice new `pending`-status pandits manually.

### 5.7 Auth coverage gaps unrelated to templates, worth flagging to engineering
No forgot-password flow exists anywhere in the codebase. Regular (non-admin) user login/logout
produces zero audit trail and zero notification — only admin-tier logins are tracked
(`LoginHistory` + `ADMIN_LOGIN`/`ADMIN_LOGOUT`). Repeated failed OTP attempts are silently
rate-limited with no security alert. None of these block the WhatsApp template project, but they
should be on record since they were surfaced during this audit.

### 5.8 Stale-payload bug in `KYC_SUBMITTED`
`pandit.controller.js:109` builds the `normalizePanditPayload({ pandit })` from the pre-update
local `pandit` variable rather than the result of the `findOneAndUpdate` call — the emitted
payload may not reflect the KYC fields that were just saved. Low impact today since
`KYC_SUBMITTED` is admin-only and unmapped, but will bite if/when it's templated.

### 5.9 Missing fields that will tempt template-authors to invent variables
The brief's own worked example (`Booking Confirmed`) lists a **`Support Number`** variable.
**No such field exists anywhere in `PayloadNormalizer.js`.** Do not add it to a Meta template
as a dynamic variable — either hardcode Zutsav's support number as static text in the template
body, or file a ticket to add a `support.phone` field to the normalizer/canonical payload shape
first. Similarly: `ORDER_REFUNDED`'s refund amount is not populated onto `normalizeOrderPayload`'s
`refund` object (only `refund.status` is, from `order.refundStatus`) — confirm the real refund
amount field before finalizing that template's variables. `ADMIN_PASSWORD_RESET`'s payload
includes a **plaintext `tempPassword`** — this must never be rendered into a WhatsApp template
(Meta explicitly disallows credential delivery in message templates and it's a security risk
regardless).

### 5.10 `WhatsAppTemplate.assignedTrigger` is dead/vestigial data
The `WhatsAppTemplate` model has an `assignedTrigger` field (e.g. `"service_reminder_24h"`,
`"booking_refunded"`, `"order_shipped"`, `"booking_completed"`, `"booking_started"`). A code
comment in `WhatsAppChannel.js` confirms explicitly: **this field is not read by the current
dispatch logic at all** — the only thing that determines which template fires for which event is
`NotificationMapping.whatsappTemplateName`. Seven of the 17 synced templates have a non-empty
`assignedTrigger` value that looks meaningful but does nothing. Worse, one of them
(`puja_started`, `assignedTrigger: "booking_started"`) references an event
(`BOOKING_STARTED`) **that doesn't exist anywhere in `EventRegistry.js`** — clear evidence this
field is leftover from a prior, different wiring mechanism and should not be trusted or
maintained going forward. **Recommend: stop populating `assignedTrigger` during future Meta
syncs, or remove the field entirely**, so nobody mistakes it for live routing.

### 5.11 No referential integrity between `NotificationMapping.whatsappTemplateName` and `WhatsAppTemplate`
`whatsappTemplateName` is a plain string, not a foreign key. A typo (or a template later renamed
or deleted on Meta) fails silently at send time (`WhatsAppChannel.send()` returns `{skip:true}`
only if the field is *empty* — a non-empty-but-wrong name is sent straight to the Meta API and
fails there, as seen in §5.3). Confirmed today: 0 of the current 5 mappings are broken this way,
but there is no system-level guard against it happening again.

### 5.12 Orphaned/dead Meta templates already synced (13 of 17)
Not referenced by any live mapping: `admin_general_reminder`, `pandit_puja_referral_user`,
`pandit_puja_assigned`, `refund_completed`, `shipment_delivered`, `order_shipped`,
`puja_completed`, `puja_started`, `puja_assigned`, `order_confirmed`, `payment_failed`,
`order_created`, and `puja_comfirmation_verification_code` (**also `REJECTED` status on Meta,
and misspelled** — "comfirmation"). These are exactly the kind of "old, duplicate, inconsistent"
templates the brief flagged as the reason for this audit. **Recommend a disposition decision on
each before the new template-creation pass** — see the per-template table in the Appendix.

### 5.13 Template category (Utility vs. Marketing) is inconsistently assigned today
Comparing near-identical transactional concepts: `order_confirmed` and `order_shipped` are
categorized `UTILITY` on Meta, but `puja_assigned`, `pandit_puja_assigned`, `puja_started`,
`shipment_delivered`, `refund_completed`, `order_cancelled`, and `payment_failed` — all equally
transactional/status-update content — are categorized `MARKETING`. Meta's Marketing category
carries stricter opt-in/consent rules and different pricing than Utility; using it for
transactional-only content either overpays or risks compliance/delivery issues, while using
Utility for anything promotional risks template rejection. **Every template in the Meta Template
Plan (§6) should be assigned its category deliberately from the "Template Category" column in
§2-3, not copied from what an old template happened to use.**

### 5.14 Stale documentation inside the codebase itself
`NotificationMapping.js` (the Mongoose model) still carries a comment claiming *"If blank, the
engine uses the built-in legacy handler for this event"* for the email channel. This is
contradicted by `EmailChannel.js`'s own header comment, which confirms the legacy per-event
hardcoded handler mechanism (`LEGACY_EMAIL_HANDLERS`) **was already removed** as "the root cause
of the wrong customer name/amount bug." An admin reading only the model file could think leaving
`emailTemplateName` blank still works — it does not; every mapping must have its own authored
`emailSubject`/`emailHtml`, confirmed by the `skip` check in `EmailChannel.send()`.

### 5.15 No `vendor` recipient concept
The template-request brief's example categorization mentions "Vendor" as a possible recipient.
**Zutsav's codebase has no vendor/supplier entity or recipient type at all** — only `user`
(customer), `pandit`, and `admin` are resolvable recipient types
(`core/EventDispatcher.js:resolveRecipients`). Do not scope any template to a "Vendor" recipient;
it cannot be delivered by the current engine.

---

## 6. Meta WhatsApp Template Checklist

Every box below corresponds to a row marked **YES** in §2-3. Ordered by rollout priority
(Tier 1 = already live in production traffic and must be fixed correctly; Tier 2 = code fires
today but has zero mapping; Tier 3 = requires an engineering fix to actually fire before the
template has any value).

### Tier 1 — Live traffic today, fix/re-verify before anything else
- [ ] `OTP_VERIFICATION` (Authentication) — re-verify param count against `whatsapp_verification`'s approved body
- [ ] `BOOKING_CONFIRMED` (Utility) — replace/re-verify `payment_success` mapping; this exact event has a documented `#132000` failure history under a different template
- [ ] `BOOKING_CANCELLED` (Utility) — `order_cancelled` mapping currently has **zero** variables wired; must be fixed
- [ ] `ACCOUNT_DELETION_REQUESTED` (Utility) — replace the `hello_world` placeholder with a real template

### Tier 2 — Fires in code today, has no WhatsApp template at all

**Authentication**
- [ ] `SERVICE_COMPLETION_OTP`
- [ ] `DELIVERY_OTP_SENT`

**Payment**
- [ ] `PAYMENT_SUCCESS`
- [ ] `PARTIAL_PAYMENT_RECEIVED`
- [ ] `FINAL_PAYMENT_RECEIVED`

**Booking**
- [ ] `BOOKING_REFUNDED`
- [ ] `SERVICE_REMINDER_24H`
- [ ] `SERVICE_REMINDER_1H`
- [ ] `SERVICE_COMPLETED`
- [ ] `INVOICE_GENERATED`
- [ ] `FEEDBACK_REQUEST`
- [ ] `KIT_SHIPPED`
- [ ] `KIT_DELIVERED`
- [ ] `USER_REGISTERED`

**Pandit**
- [ ] `PANDIT_ASSIGNMENT_PENDING`
- [ ] `PANDIT_ACCEPTED`
- [ ] `PANDIT_APPROVED`
- [ ] `PANDIT_POOJA_APPROVED`
- [ ] `PANDIT_POOJA_REJECTED`
- [ ] `KYC_APPROVED`
- [ ] `KYC_REJECTED`
- [ ] `KYC_REUPLOAD_REQUIRED`
- [ ] `PAYOUT_RELEASED`

**Marketplace**
- [ ] `ORDER_PLACED`
- [ ] `ORDER_CONFIRMED`
- [ ] `ORDER_PACKED`
- [ ] `ORDER_SHIPPED`
- [ ] `ORDER_OUT_FOR_DELIVERY`
- [ ] `ORDER_DELIVERED`
- [ ] `ORDER_CANCELLED`
- [ ] `ORDER_REFUNDED` (confirm refund-amount field first, §5.9)

**Referral**
- [ ] `REFERRAL_BOOKING_CREATED`
- [ ] `REFERRAL_PENDING_REMARK`

**Account**
- [ ] `ACCOUNT_DELETION_CANCELLED`
- [ ] `ACCOUNT_RESTORED`
- [ ] `ACCOUNT_DELETED`

### Tier 3 — Template has clear business value, but an engineering fix must land first (do not template until the code gap is closed — coordinate with engineering)
- [ ] `PANDIT_ASSIGNED` — event never emitted; customer never learns who their pandit is (§5.6)
- [ ] `PANDIT_REGISTERED` — event never emitted; no applicant confirmation (§5.6)
- [ ] `PAYMENT_FAILED` — event never emitted; no failure notification exists at all (§5.4)
- [ ] `PASSWORD_RESET` — feature doesn't exist yet (§2.1, §5.7)

### Explicitly out of scope for WhatsApp templates (do not build)
- All 20 dead/duplicate events listed in §5.1
- All internal/admin-only events (`PANDIT_REJECTED`, `PANDIT_POOJA_REQUEST_CREATED`,
  `KYC_SUBMITTED`, `REFERRAL_REMARK_SUBMITTED`, all 7 Admin Management events) — recommend
  email/in-app/dashboard instead
- `BLOG_PUBLISHED`, `FESTIVAL_CREATED`, `TEMPLE_CREATED`, `NEWSLETTER_SUBSCRIBED` — not
  emitted anywhere today; revisit if/when those features are built as WhatsApp-worthy broadcasts

---

## Appendix A — Disposition of the 17 currently-synced Meta templates

| Template | Status | Category (as synced) | Referenced by a live mapping? | Recommended disposition |
|---|---|---|---|---|
| `payment_success` | APPROVED | UTILITY | ✅ `BOOKING_CONFIRMED` | Keep — but confirm its variable count/order matches `BOOKING_CONFIRMED`'s intended §4 layout before relying on it further |
| `whatsapp_verification` | APPROVED | AUTHENTICATION | ✅ `OTP_VERIFICATION` (user + pandit) | Keep — re-verify param count (§5.3 logged a `#132018` failure) |
| `hello_world` | APPROVED | UTILITY | ✅ `ACCOUNT_DELETION_REQUESTED` | **Retire from this mapping** — it's Meta's generic sample template, not real content (§5.3) |
| `order_cancelled` | APPROVED | MARKETING | ✅ `BOOKING_CANCELLED` | **Re-category to UTILITY** and add the missing variables (§5.3, §5.13) |
| `admin_general_reminder` | APPROVED | MARKETING | — orphaned | Retire or repurpose for `SERVICE_REMINDER_24H`/`SERVICE_REMINDER_1H` — re-category to Utility if kept |
| `puja_comfirmation_verification_code` | **REJECTED** | UTILITY | — orphaned | **Delete from Meta and from the `WhatsAppTemplate` collection** — rejected status + typo in name, dead weight |
| `pandit_puja_referral_user` | APPROVED | MARKETING | — orphaned | Candidate for `REFERRAL_BOOKING_CREATED` if content matches; otherwise retire |
| `pandit_puja_assigned` | APPROVED | MARKETING | — orphaned | Candidate for `PANDIT_ASSIGNMENT_PENDING` — re-category to Utility, this is a transactional "you have a new booking" message, not marketing |
| `refund_completed` | APPROVED | MARKETING | — orphaned | Candidate for `BOOKING_REFUNDED`/`ORDER_REFUNDED` — re-category to Utility |
| `shipment_delivered` | APPROVED | MARKETING | — orphaned | Candidate for `ORDER_DELIVERED` — re-category to Utility |
| `order_shipped` | APPROVED | UTILITY | — orphaned | Candidate for `ORDER_SHIPPED` — category already correct, just needs a mapping |
| `puja_completed` | APPROVED | UTILITY | — orphaned | Candidate for `SERVICE_COMPLETED` — category already correct |
| `puja_started` | APPROVED | MARKETING | — orphaned, `assignedTrigger` points at a non-existent `BOOKING_STARTED` event | **No matching live event exists** — either retire, or this is evidence a "booking started" event should exist but was never built; flag to product before reusing |
| `puja_assigned` | APPROVED | MARKETING | — orphaned | Near-duplicate name of `pandit_puja_assigned` above — reconcile which one is canonical before the rollout, don't ship both |
| `order_confirmed` | APPROVED | UTILITY | — orphaned, but **has a documented production failure history** (§5.3) under a prior mapping | Candidate for `ORDER_CONFIRMED` — must be re-tested for correct param count before reassigning to any event |
| `payment_failed` | APPROVED | MARKETING | — orphaned | Candidate for `PAYMENT_FAILED` once that event is wired up (Tier 3) — re-category to Utility |
| `order_created` | APPROVED | UTILITY | — orphaned | `ORDER_CREATED` is a dead event (§5.1) — candidate for `ORDER_PLACED` instead if content matches, otherwise retire |

---

*This document was generated by inspecting `backend/notification-engine/`, every
`backend/src/controllers/*.js`, `backend/src/utils/cleanupJobs.js`, `backend/server.js`, and by
querying the live `NotificationMapping`, `WhatsAppTemplate`, and `NotificationLog` collections.
No code was modified and no Meta templates were created or edited to produce this document.*
