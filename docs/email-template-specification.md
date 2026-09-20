# Zutsav Notification Engine — Email Template Specification (Audit A–Q)

**Audit type:** READ-ONLY. No code, DB, template, or mapping changes made.
**Date:** 2026-09-19
**Evidence:** live `zutsav` DB dumps (`audit-matrix.js`, `audit-emails-full.js`) + source reads. Every fact cites `file:line`.

46 mapped events across 3 channels (53 mappings total). Only 4 are email; only 2 are live (both OTP, both `recipientType: user`). All other transactional events run WhatsApp-only (plus 2 in-app). Email is a working, first-class channel (63 delivered/processing email logs; larksuite SMTP port 465) but the email template inventory is effectively 2 templates.

---

## A. EXECUTIVE SUMMARY

- **2 live email templates** today: `OTP_VERIFICATION` (user) and `PASSWORD_RESET_EMAIL_OTP` (user), both `purpose: ACCOUNT`.
- **2 disabled + structurally dead** pandit-email OTP mappings (no emitter ever populates `payload.pandit` for OTP events).
- Email channel has **no consent gate** (unlike WhatsApp); `CAMPAIGN_COUPON` email is **hard-blocked** at the service layer until a genuine email marketing consent policy exists.
- Engine capabilities are complete: per-value HTML escaping, subject header-injection defense, required-var + placeholder validation, durable queue, retries (max 5, backoff 30s–30min), OTP encryption at rest, single-writer logging, admin dry-run + real-send tester.

---

## B. TOTAL NUMBER OF EMAIL MAPPINGS

**4 of 53 mappings are `channel: 'email'`** (DB dump live `zutsav`).

| Channel | Count |
|---|---|
| whatsapp | 47 |
| email | 4 |
| inapp | 2 |
| **Total** | **53** (46 unique events) |

Email breakdown: **2 enabled (both user OTP), 2 disabled (both pandit OTP)**, all `purpose: ACCOUNT`.

---

## C. COMPLETE EMAIL MAPPING INVENTORY

Full documents dumped live. 4 mappings; no `emailTemplateName` used; `emailMetadata: null`.

### C1. OTP_VERIFICATION / user / email — **ENABLED** — `_id 6a40b3325c89dc5c587ba94b`

- **purpose:** ACCOUNT | **enabled:** true
- **emailSubject:** `Your Zutsav OTP Code`
- **placeholders:** `{{customer.name}}`, `{{otp.code}}`
- **emailHtml:**

```html
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🤔 Zutsav — Verify Your Account</h2>
          <p>Namaste <strong>{{customer.name}}</strong>,</p>
          <p>Your OTP code for account verification is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>
```

### C2. OTP_VERIFICATION / pandit / email — **DISABLED** — `_id 6a40b3535c89dc5c587ba963`

Same subject + same HTML as C1 (identical `{{customer.name}}` copy).

### C3. PASSWORD_RESET_EMAIL_OTP / user / email — **ENABLED** — `_id 6a5477fa845402ee16ff3c3b`

- **purpose:** ACCOUNT | **enabled:** true
- **emailSubject:** `Your Zutsav Password Reset Code`
- **placeholders:** `{{customer.name}}`, `{{otp.code}}`
- **emailHtml:**

```html
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#b91c1c">🔐 Zutsav — Password Reset</h2>
          <p>Hi <strong>{{customer.name}}</strong>,</p>
          <p>Your Zutsav password reset code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#d97706;text-align:center;padding:20px;background:#fef3c7;border-radius:12px;margin:20px 0">{{otp.code}}</div>
          <p style="color:#6b7280;font-size:14px">This code is valid for <strong>10 minutes</strong>.</p>
          <p style="color:#6b7280;font-size:14px">If you didn't request this, please ignore this message — your password will not be changed.</p>
          <p style="color:#b91c1c">🙏 Team Zutsav</p>
        </div>
```

### C4. PASSWORD_RESET_EMAIL_OTP / pandit / email — **DISABLED** — `_id 6a5487fe6f20deb3ef881f30`

Same subject + HTML as C3 — **BUT** greets `Hi <strong>{{pandit.name}}</strong>`. Only template referencing a `pandit.*` placeholder, and it can never resolve (see G/H).

**Provenance:** C1/C2 from `scripts/bootstrapNotificationMappings.js` VERIFIED_EMAIL_MAPPINGS (only fills when both subject+HTML blank); C3/C4 from `scripts/seedPasswordResetMappings.js:47-67` (upsert).

---

## D. COMPLETE VARIABLE INVENTORY

### D1. Canonical payload shape (`notification-engine/variables/PayloadNormalizer.js:10-27`)

Every key always present, `''`/`0` when unknown — never `undefined`:

```
customer: { userId, name, phone, email, address }
booking:  { id, number, date, time, amount, remainingAmount, status, language, poojaName }
payment:  { amount, method, transactionId, status }
order:    { id, number, total, status, courierName, trackingNumber }
pandit:   { userId, name, phone, email }   (+ reason, batchId, bookingCount on pandit-lifecycle)
kit:      { amount, courier, trackingId }
refund:   { amount, status }
otp:      { code }
reason:   string        (passwordReset: '' unless supplied)
account:  { scheduledDeletionDate, requestedDate }   (normalizeUserPayload only)
pooja:    { name, expectedPrice, approvedPrice, rejectionReason }   (poojaRequest only)
coupon:   { code, discountType, discountValue, minCartValue, maxDiscount, expiresAt, label, campaignName }   (campaign only)
user:     alias → customer   booking.bookingNumber/scheduledDate/scheduledTime/amountPaid/grandTotal   (legacy aliases)
```

Notes:
- A requested path with no real value renders `''` — **exists, so validation passes, but blanks output** (never `undefined`, never `[object Object]`).
- Date values formatted `en-IN` `day month year` via `VariableResolver.resolve`.
- Legacy aliases (`user`, `booking.bookingNumber`, `booking.scheduledDate`, `booking.scheduledTime`, `booking.amountPaid`, `booking.grandTotal`) resolve for pre-rebuild authored templates.

### D2. Required-variable schema (`notification-engine/variables/VariableSchemas.js:15-75`)

`TemplateValidator` enforces non-blank for required vars and existence for every `{{placeholder}}`.

- **Email-relevant:** `OTP_VERIFICATION` = `[customer.name, otp.code]`; `PASSWORD_RESET_EMAIL_OTP` = `[customer.name, otp.code]`.
- Others: PAYMENT_CREATED `[customer.name, payment.amount]`; PAYMENT_SUCCESS `[customer.name, booking.number, payment.amount]`; PAYMENT_FAILED `[customer.name, payment.amount]`; PARTIAL `[customer.name, payment.amount, booking.remainingAmount]`; FINAL `[customer.name, booking.amount]`; REFUND_* `[customer.name, refund.amount]`; BOOKING_CREATED/CANCELLED/COMPLETED/REFUNDED `[customer.name, booking.number]`; BOOKING_CONFIRMED `[customer.name, booking.number, booking.date, booking.time]`; SERVICE_COMPLETION_OTP `[customer.name, otp.code]`; INVOICE `[customer.name, booking.number, booking.amount]`; PANDIT_* name/number variants; ORDER_* `[customer.name, order.number(+total for PLACED)]`; DELIVERY_OTP `[customer.name, otp.code]`; CAMPAIGN_COUPON falls back to `DEFAULT_REQUIRED [customer.name]`.

### D3. Sample payload for dry-run/send (`src/controllers/admin.controller.js:3997-4058 buildSamplePayload`)

Union of all 5 normalizers + coupon, `otp: '123456'` (transient), `_eventName`. Every canonical path resolves here.

---

## E. CURRENT EMAIL SUBJECTS (exactly 2)

1. `Your Zutsav OTP Code` (both OTP_VERIFICATION mappings)
2. `Your Zutsav Password Reset Code` (both PASSWORD_RESET_EMAIL_OTP mappings)

Static — no `{{...}}` in either subject. Interpolated via `interpolateSubject` (`VariableResolver.js:86-89`): resolves each value then `sanitizeHeaderValue` strips `[\r\n\u2028\u2029]` (header-injection defense).

---

## F. CURRENT EMAIL HTML

Exactly the two blocks in C1/C3; same 480px inline-styled shell, amber `#fef3c7` OTP box (`#d97706`, 36px, letter-spacing 8px), 10-minute validity line, `🙏 Team Zutsav` sign-off. Rendered per-value via `interpolateHtml` = `escapeHtml(resolve(...))` escaping `& < > " '` on **values only**; template markup preserved (`VariableResolver.js:60-73`).

---

## G. VARIABLE-SCHEMA ↔ TEMPLATE MISMATCHES (FACTS)

**G1 (latent bug):** C4 (pandit password reset) greets `{{pandit.name}}`, but the only emitter (`passwordReset.controller.js:115`) calls `normalizeUserPayload({ user, otp })` → `payload.pandit = { name:'', phone:'', email:'' }`. `TemplateValidator` sees `pandit.name` **exists** (empty string) → validation passes → renders **"Hi ,"**. Harmless only because C4 is **disabled** — enabling it emails pandits a blank-name message. C2 is safe only because its copy uses `{{customer.name}}`.

Silent-blank risk spots for new templates: any `*_REJECTED` / `reason` text; `booking.poojaName` (empty when `poojaId` unpopulated — most emitters pass `poojaName` explicitly, but KIT_DELIVERED at `admin.controller.js:3137`, ORDER events, and some reminders can be blank); `order.courierName` / `trackingNumber` (blank before shipment); `booking.language` (DB default `'Hindi'`).

**G2 (unexercised):** no template references `booking.amount` / `payment.amount` — rupee amount rendering exists in the shape but is unused.

---

## H. REACHABILITY / DEAD-MAPPING ANALYSIS (FACTS)

Recipient resolution: `EventDispatcher.resolveRecipients` (`core/EventDispatcher.js:36-62`) — `user` → `payload.customer`, `pandit` / `referral_pandit` → `payload.pandit`; requires `userId|phone|email` truthy; empty → 0 recipients, job never enqueued.

| Mapping | Emitters (channel-restricted) | Reachable? |
|---|---|---|
| C1 OTP_VERIF/user | `auth.controller.js:88` (reg OTP), `:577` (delete-otp), `otpLogin.controller.js:121`, `pandit.controller.js:183` — all `normalizeUserPayload(...)` with `{ channel:'email' }`. Pandit KYC OTP flows here too (pandit data lands in `customer`). | **YES** — verified by live logs (63 email logs, OTP_VERIFICATION delivered) |
| C2 OTP_VERIF/pandit | none populate `payload.pandit` | **NO — dead** (also disabled) |
| C3 PASSWORD_RESET/user | `passwordReset.controller.js:115`, `eventName = PASSWORD_RESET_EMAIL_OTP` when `channel==='email'` | **YES** |
| C4 PASSWORD_RESET/pandit | none populate `payload.pandit` | **NO — dead** (also disabled) |

**H1 (design fact):** pandit OTP events are emitted through the **user** recipient path (pandit identity rides inside `customer`), so pandits currently receive the *user* email template (copy: "Namaste {name}, verify your account"). The pandit-specific mappings (email *and* whatsapp) are guaranteed no-ops by the normalizer. **Do not fix by enabling C2/C4 as-is** — they cannot fire without a new emitter that attaches `payload.pandit`.

---

## I. EXISTING EVENTS WITHOUT AN EMAIL MAPPING (FACTS)

**44 of 46 mapped events have no email mapping** (only OTP_VERIFICATION + PASSWORD_RESET_EMAIL_OTP do).

- **ACCOUNT:** ACCOUNT_DELETED, ACCOUNT_DELETION_CANCELLED, ACCOUNT_DELETION_REQUESTED, ACCOUNT_RESTORED (all whatsapp-only)
- **BOOKING:** BOOKING_CONFIRMED, BOOKING_CANCELLED, BOOKING_REFUNDED, SERVICE_REMINDER_24H/1H, SERVICE_COMPLETED, INVOICE_GENERATED, FEEDBACK_REQUEST (whatsapp mapping present; **never emitted** — injected-action model folded it into SERVICE_COMPLETED, per `admin.controller.js:1865-1868` comment)
- **PAYMENT:** PAYMENT_SUCCESS, PARTIAL_PAYMENT_RECEIVED, FINAL_PAYMENT_RECEIVED, PAYMENT_FAILED
- **PANDIT:** PANDIT_APPROVED / KYC_APPROVED / KYC_REJECTED / KYC_REUPLOAD_REQUIRED, PANDIT_POOJA_*, PANDIT_ASSIGNMENT_PENDING (pandit), PANDIT_ACCEPTED/REJECTED (user), PAYOUT_RELEASED (pandit), PANDIT_ASSIGNED (mapping exists; **no emitter found**), REFERRAL_* (referral_pandit/pandit)
- **ORDER/MARKETPLACE:** ORDER_CONFIRMED/PACKED/SHIPPED/OUT_FOR_DELIVERY/DELIVERED/CANCELLED/REFUNDED (whatsapp), DELIVERY_OTP_SENT, KIT_SHIPPED, KIT_DELIVERED (whatsapp+inapp)
- **CAMPAIGN_COUPON:** whatsapp only — email **hard-blocked** (`services/campaignService.js:43-48`, `models/CouponCampaign.js:53-56`)

**Additional facts:** `KYC_SUBMITTED` (`pandit.controller.js:116`), `ORDER_PLACED` (`marketplace.controller.js:429`), `REFERRAL_REMARK_SUBMITTED` (`referral.controller.js:158`), and all `ADMIN_*` (`adminManagement.controller.js`, `auth.controller.js:467/494`) are **emitted with no DB mapping at all** today. `FEEDBACK_REQUEST` and `PANDIT_ASSIGNED` have mappings but no emitter.

---

## J. BRANDING / CONFIGURATION SOURCES (FACTS)

- **`EmailProvider.companyInfo()`** (`providers/EmailProvider.js:12-22`), via `settingsService.get(field, fallback)`: `platformName` → `companyConfig.name` ("Zutsav Enterprises"), `contactEmail` → `companyConfig.supportEmail` (info@zutsav.com), `supportPhone` → `+91-8851576605`, `companyGstin` → `09AAAFZ1234Z1Z5`, `companyPan` → `AAAFZ1234Z`, `deployWebsiteUrl` → `urlsConfig.clientUrl`. **Currently unused by EmailChannel** — templates hardcode "Zutsav".
- **`config/company.config.js`:** name, logo (`COMPANY_LOGO`, default `''`), supportEmail, supportPhone, gstin, pan, privacyUrl, termsUrl, currency INR, timezone Asia/Kolkata.
- **`config/urls.config.js`:** clientUrl (`CLIENT_URL`/`FRONTEND_URL`, default `http://localhost:3000`), serverUrl, adminUrl, socketUrl.
- **Live SystemSettings (DB):** `platformName=""`, `contactEmail="info@zutsav.com"`, `supportPhone=""`, `companyGstin=""`, `companyPan=""`, `deployWebsiteUrl="http://localhost:3000"`, `emailSmtpUser="info@zutsav.com"`, `emailSmtpHost="smtp.larksuite.com"`, `emailSmtpPort=465`, `emailSenderName=""`, `privacyUrl=""`, `termsUrl=""`.
  → Effective brand falls back to company.config everywhere except contactEmail and website URL (both DB-set).
- SMTP: `emailSenderName ''` → fallback to `companyConfig.name`; port 465 → `secure: true`.

---

## K. EMAIL ENGINE CAPABILITIES (FACTS)

- **Single pipeline:** `NotificationEngine.emit → EventDispatcher → JobQueue.enqueue (redact otp) → Worker (5s poll, batch 20, backoff 30s–30min, maxAttempts 5) → bootstrap.processJob (rehydrate + _eventName) → EmailChannel.send → TemplateEngine.render → EmailProvider → NotificationLogger`.
- **Validation before every send** (`channels/EmailChannel.js:29-39`): required vars non-blank + every `{{placeholder}}` exists (`templates/TemplateValidator.js:18-37`).
- **Rendering:** body `interpolateHtml` (escape `& < > " '` per value); subject `interpolateSubject` (CR/LF/U+2028/29 stripped).
- **Skips** (no retry, logged `skipped`): no recipient email; no subject/HTML configured; validation failure.
- **Admin tester** (`admin.controller.js:4063-4125`): dry-run renders against sample + optional `send: true` calls `channel.send` directly (no DB persistence, no job). Reuses live `resolveRecipients`.
- **Logging:** single writer `NotificationLogger`; OTP fields encrypted at rest (`security/otpPayload`), redacted/scrubbed in logs.
- **Translation:** `config/translatable.config.js:94-101` — `notificationMapping` covers only `inAppTitle`/`inAppMessage`. **Email subject/HTML are NOT translatable** by the AI engine.

---

## L. EMAIL SECURITY FINDINGS (FACTS)

- **Runtime-verified escaping:** payload `& < > " '` → `&amp; &lt; &gt; &quot; &#39;` in body; template markup preserved.
- **Header injection:** subjects sanitized (CR/LF/U+2028/29 → space). Body CR/LF allowed (harmless — not header content).
- **OTP:** encrypted at rest (`otpenc:v1:`, AES-256-GCM); decrypted only in `processJob`; scrubbed from logs/renderedContent/errors.
- **No email consent gate** in `EmailChannel.send` (WhatsApp has the `MARKETING` gate at `channels/WhatsAppChannel.js:170-176`). All 4 email mappings are ACCOUNT purpose so no gate is needed today, but **no unsubscribe/footer mechanism exists** either.
- **Campaign email is deliberately impossible** (service-level hard-block, section J).

---

## M. COMMON TEMPLATE STRUCTURE — RECOMMENDATION

The two live templates already share a shell. Recommended common base for future templates:

1. **Shell:** inline styles only; single column; `max-width:480px` (or 600px for invoice-grade emails); brand strip, greeting, body, CTA/OTP block, soft divider, footer.
2. **Footer data to include:** support email, support phone, `privacyUrl`/`termsUrl`, site link built from `deployWebsiteUrl`. These values exist (J) but are not injected today — recommend adding a `footer` block to the shared normalizer or rendering `companyInfo()` at email render time, since templates cannot reference `companyInfo` currently.
3. **Amounts:** use `₹{{payment.amount}}` etc.; note resolution is plain `String(...)` (no thousand separators) — recommend formatting in the resolver before invoice-grade emails ship.
4. **People/labels:** use `{{customer.name}}` for people; never reference `pandit.*`/`reason` without a guaranteed emitter (see G1/H1).

---

## N. FUTURE EMAIL TEMPLATE IMPLEMENTATION SHEET (recommended transactional set)

| # | Event | recipientType | purpose | Suggested subject | Key placeholders (verified to resolve) |
|---|---|---|---|---|---|
| N1 | BOOKING_CONFIRMED | user | BOOKING | `Booking Confirmed — {{booking.number}}` | customer.name, booking.number, booking.date, booking.time, booking.poojaName, payment.amount |
| N2 | PAYMENT_SUCCESS | user | BOOKING | `Payment Received — {{booking.number}}` | customer.name, booking.number, payment.amount |
| N3 | SERVICE_REMINDER_24H / _1H | user | BOOKING | `Your Pooja is Tomorrow / Soon` | customer.name, booking.date, booking.time, booking.poojaName |
| N4 | INVOICE_GENERATED | user | BOOKING | `Invoice — {{booking.number}}` | customer.name, booking.number, booking.amount |
| N5 | BOOKING_CANCELLED | user | BOOKING | `Booking Cancelled — {{booking.number}}` | customer.name, booking.number, refund.amount, reason |
| N6 | ORDER_CONFIRMED | user | ORDER | `Order Confirmed — {{order.number}}` | customer.name, order.number, order.total |
| N7 | ORDER_DELIVERED | user | ORDER | `Order Delivered — {{order.number}}` | customer.name, order.number, order.courierName, trackingNumber |
| N8 | KIT_SHIPPED | user | ORDER | `Samagri Kit Shipped` | customer.name, kit.courier, kit.trackingId |
| N9 | ACCOUNT_DELETED / _CANCELLED / _RESTORED | user | ACCOUNT | `Account Update` | customer.name, account.* date |
| N10 | CAMPAIGN_COUPON | user | MARKETING | per campaign | customer.name, coupon.code, coupon.label — **requires email consent gate first** |

Per mapping: create one `channel:'email'` mapping via the standard upsert (fill `emailSubject` + `emailHtml`; skip/respect bootstrap auto-fill), enable, then dry-run (`POST /api/admin/notifications/mappings/:id/test`) and end with one real send (`{ send: true }`) to a dev inbox.

---

## O. MISSING-TEMPLATE IMPLEMENTATION SHEET (events with no email today)

| Event | Today | Email template status |
|---|---|---|
| FEEDBACK_REQUEST | whatsapp row exists; never emitted | **Don't create** — folded into SERVICE_COMPLETED (invoice carries the reminder action). |
| PANDIT_ASSIGNED | whatsapp row exists; **no emitter** | Don't create until an emitter exists. |
| KYC_SUBMITTED, ORDER_PLACED, REFERRAL_REMARK_SUBMITTED, ADMIN_* | **no mapping at all** | Create only if email is truly desired; REFERRAL_* uses `referral_pandit` recipient (`booking.controller.js:122-123`), ORDER_PLACED payload carries order.number + order.total. |
| All pandit-recipient events (PAYOUT_RELEASED, PANDIT_APPROVED, KYC_*, PANDIT_POOJA_*, PANDIT_ASSIGNMENT_PENDING) | whatsapp-only | Optional; `Pandit.email` exists (required, unique) and these emit `normalizePanditPayload`/`normalizeBookingPayload` → `payload.pandit` is populated → **reachable**. `{{pandit.name}}` is safe here. |

---

## P. BLOCKERS / MISSING DATA

1. **No email consent gate / unsubscribe** — blocks N10 and any MARKETING email (service-level hard-block already present; a gate is engine work, not template work).
2. `SystemSettings` brand fields mostly blank in DB → emails rely on code fallbacks; `deployWebsiteUrl=http://localhost:3000` would emit localhost links if templates start linking (false-domain risk in prod).
3. `companyInfo()` / footer variables are **not reachable from templates** — requires a payload extension or a render-time hook.
4. Email subject/HTML are **not wired into the AI translation engine** (blocks non-English email localization beyond provider-side templates).
5. Email-log `subject` column is blank for engine sends (Worker delivered-log doesn't pass `subject`) — minor observability gap, not a blocker.

---

## Q. EXACT NEXT IMPLEMENTATION ORDER (RECOMMENDED)

1. **Stabilize base:** add render-time footer injection (support email/phone/privacy/terms/site URL) OR add `footer` to the shared normalizers — needed before any new template ships, otherwise authors hardcode "info@zutsav.com" + localhost.
2. **Deal with C4:** keep disabled; do **not** enable as-is. If pandit password-reset email is wanted, emit a pandit-identity path and re-author copy with `{{customer.name}}`.
3. **Ship N1 + N2** (BOOKING_CONFIRMED + PAYMENT_SUCCESS, user/BOOKING) — highest value; all required vars guaranteed by `onPaymentSuccess` (`booking.controller.js:127-133`, `normalizeBookingPayload` supplies customer incl. `userDetails.email`, booking.number/date/time).
4. **Ship N3 + N4** (reminders + invoice) reusing the same shell.
5. **Add email consent + unsubscribe (engine work)** before N9/N10.
6. **Then** the transactional tail (N5–N8) and pandit-recipient emails (O), each verified with the admin dry-run + one real `send:true` to a dev inbox.

---

*All facts verified read-only against live code and the `zutsav` DB. Nothing was modified.*