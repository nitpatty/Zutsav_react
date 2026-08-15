# WhatsApp Consent — Phase 5.1: Feedback as an Optional Action in the Transactional Service-Completion Message

Status: **IMPLEMENTED** (Phase 5 complete; this phase applies the client's
clarification about feedback). Scope: feedback is no longer a standalone
WhatsApp message — it is an **optional URL-button action** on the purely
transactional `SERVICE_COMPLETED` message. The standalone `FEEDBACK_REQUEST`
WhatsApp path is retired (all emitters removed, bootstrap entry disabled on
fresh DBs), while the event itself stays registered and the existing booking
rating UI (web + mobile) is untouched. A **new/changed Meta template is
required** before the buttons can actually be delivered — see §10, §19, and
the STOP condition at the end.

---

## 1. Client Requirement

The client clarified how feedback should be handled:

1. **No standalone WhatsApp message whose primary purpose is asking for
   feedback** (e.g. a bare "Please rate your experience…").
2. Feedback must be an **optional action inside a purely transactional /
   service-related WhatsApp message**, e.g.:

   > "Hi {{1}}, your {{2}} service is now complete. We have successfully
   > processed everything for you. Thank you for choosing us!"
   >
   > [View Receipt] · [Rate Your Experience]

3. Communication preferences are conceptually two buckets:
   - **Promotional Offers → MARKETING** (consent-gated)
   - **Order Updates & Service Feedback → SERVICE / TRANSACTIONAL**
4. **A marketing opt-out must never block** legitimate service/order
   completion communication.
5. A service-completion message may contain an optional feedback action, and
   that does **not** make it marketing.

The client examples are *concepts*, not approved Meta templates — no template
was invented or assumed approved (see §10, §19).

---

## 2. Existing Feedback Flow (audited, as-is before this phase)

| # | Question | Answer (verified from code) |
|---|---|---|
| 1 | Where is `FEEDBACK_REQUEST` registered? | `notification-engine/EventRegistry.js` (EVENTS + EVENT_CATEGORIES "Booking") |
| 2 | Where is it triggered? | **4 sites**: `booking.controller.js verifyCompletionOtp`; `admin.controller.js updateBookingStatus` (→ completed); `admin.controller.js approveCompletion`; `utils/cleanupJobs.js runFeedbackReminder` (hourly cron, completed bookings 2–6 h old, `rating: null`) |
| 3 | Which controller/service/job triggers it? | `booking.controller.js` (pandit OTP-verified completion), `admin.controller.js` (admin status change / completion approval), `cleanupJobs.js` (cron) |
| 4 | Which recipient? | `user` (the booking's customer) |
| 5 | Which NotificationMapping? | `FEEDBACK_REQUEST` / user / whatsapp (bootstrap v1.2.0 entry, purpose `SERVICE`) |
| 6 | Which WhatsApp template? | `feedback_request` (Meta-synced `WhatsAppTemplate`) |
| 7 | Email? | No email mapping |
| 8 | In-App? | No in-app mapping |
| 9 | Variables? | `customer.name`, `booking.poojaName` (2 body params) |
| 10 | Buttons? | None (`whatsappButtonType: 'none'`) |
| 11 | What happens after the customer clicks it? | Nothing to click — it is a plain text message |
| 12 | Standalone? | **Yes — a standalone feedback-asking WhatsApp message.** Exactly the shape the client no longer wants |

**Complete flow (before):**

```
Booking completion (pandit OTP verify / admin status / admin approve)
   → NotificationEngine.emit('FEEDBACK_REQUEST', normalizeBookingPayload(...))
   → EventDispatcher → NotificationJob → Worker
   → WhatsAppChannel.send → TemplateEngine.render('feedback_request') → Meta
Cron (hourly): runFeedbackReminder → emit('FEEDBACK_REQUEST') for unrated bookings
```

---

## 3. Existing Service-Completion Flow (audited)

| # | Question | Answer (verified from code) |
|---|---|---|
| Event name | `SERVICE_COMPLETED` (EventRegistry "Booking" category) | |
| Trigger location | **3 sites** — same completion paths that fired `FEEDBACK_REQUEST`: `booking.controller.js verifyCompletionOtp`, `admin.controller.js updateBookingStatus` (→ completed), `admin.controller.js approveCompletion`. All three also emit `INVOICE_GENERATED` and set `invoiceSent` | |
| Recipient | `user` | |
| Mapping | `SERVICE_COMPLETED` / user / whatsapp — purpose `SERVICE` (Phase 5) | |
| Template | `service_completed` (Meta-synced; body params: `customer.name`, `booking.number`, `booking.poojaName`) | |
| Buttons | **None before this phase** | |
| Invoice/receipt/dashboard links | None in the template; the app has `GET /api/bookings/:id/invoice` and the web routes `/invoice/:bookingId` + `/invoice/view/:invoiceNumber` (both behind `ProtectedRoute`); `MyBookings` links `/invoice/{bookingId}` | |

**Conclusion:** `SERVICE_COMPLETED` is *the* transactional completion message
and is the correct host for the optional feedback action (**CASE B**:
transactional message exists, no feedback button — extend it).

---

## 4. Existing Order-Completion Flow (audited)

- Marketplace events (`ORDER_*`) are ORDER purpose; the "delivered" terminal
  update is `ORDER_DELIVERED` / user / `order_delivered` (2 body params),
  purpose `ORDER`, no buttons.
- Emitters: `admin.controller.js` order-status transitions.
- The client's "order updated to completed" example maps conceptually to
  `ORDER_DELIVERED`/`ORDER_CONFIRMED`.
- **Not changed in this phase** (per STEP 3 — only if required). The same
  URL-button machinery built here is directly reusable for an order message
  later (same `whatsappUrlButtons` field, same declared-button guard).

---

## 5. Current FEEDBACK_REQUEST Behavior

- Classified `purpose: SERVICE` (Phase 5) — **unchanged**.
- It was a **standalone** feedback-asking WhatsApp message → the client's
  clarification makes it the redesign candidate. It is now **retired from
  the WhatsApp path** (see §6–§8) but **not deleted**:
  - stays in `EventRegistry.EVENTS` (frozen enum — never removed),
  - keeps its verified template/variables/purpose in bootstrap,
  - existing DB rows are **preserved** (bootstrap never force-deletes or
    force-disables an existing mapping),
  - **no code path emits it anymore** (all 4 emitters removed).

---

## 6. Recommended Architecture

```
Booking completion (same 3 paths as before)
   → emit('SERVICE_COMPLETED', normalizeBookingPayload(...))   [purpose SERVICE]
   → WhatsAppChannel.send
       ├─ consent gate: purpose SERVICE → never blocked by marketing opt-out
       ├─ buildVariableChecklist: body params + URL-button analysis
       │    (template is authoritative — declared buttons only)
       └─ TemplateEngine.render → components = body + declared URL-button params
            • View Receipt         → {clientUrl}/invoice/{booking.id}   (dynamic)
            • Rate Your Experience → {clientUrl}/my-bookings            (static)
   → WhatsAppProvider.send → Meta
```

- **One transactional message at completion** — no duplicate feedback ask.
- **Email/In-App behavior unchanged** (`FEEDBACK_REQUEST` had no email/in-app
  mappings; `SERVICE_COMPLETED` had none either — nothing to migrate).
- The existing booking rating UI (web `MyBookings.jsx` StarRating →
  `POST /api/bookings/:id/rate`; mobile `BookingDetailScreen.jsx` rating
  modal) is the feedback destination and is **untouched**.

---

## 7. Before / After Flow

```
BEFORE (completion):
  INVOICE_GENERATED   (book the customer, "invoice ready")
  FEEDBACK_REQUEST    (standalone "please rate your experience")   ← removed
  SERVICE_COMPLETED   ("your service is complete")                 ← now with buttons

AFTER (completion):
  INVOICE_GENERATED   (unchanged)
  SERVICE_COMPLETED   (transactional body + optional [View Receipt] [Rate Your Experience])
  (no standalone feedback message anywhere — the hourly cron was removed too)
```

---

## 8. Notification Mapping Changes

### BEFORE

| Event | channel | purpose | template | buttons |
|---|---|---|---|---|
| `SERVICE_COMPLETED` | whatsapp | SERVICE | `service_completed` | none |
| `FEEDBACK_REQUEST` | whatsapp | SERVICE | `feedback_request` | none (standalone ask) |

### AFTER

| Event | channel | purpose | template | buttons |
|---|---|---|---|---|
| `SERVICE_COMPLETED` | whatsapp | **SERVICE** (unchanged) | `service_completed` | View Receipt (URL, param `booking.id`) · Rate Your Experience (static URL) |
| `FEEDBACK_REQUEST` | whatsapp | SERVICE (unchanged) | `feedback_request` | **created disabled on fresh DBs**; never emitted |

Purpose semantics (Phase 5 gate, unchanged and re-verified):
- `SERVICE_COMPLETED` purpose = SERVICE → **never** blocked by
  `whatsapp.marketing.status = opted_out`.
- A MARKETING-purpose mapping is still blocked for opted-out users (regression
  test).

---

## 9. Bootstrap Changes

`backend/src/scripts/bootstrapNotificationMappings.js` → **v1.3.0**

- `SERVICE_COMPLETED` entry adds `whatsappUrlButtons`:
  - `{ text: 'View Receipt', urlTemplate: '/invoice/{{1}}', parameterPath: 'booking.id' }`
  - `{ text: 'Rate Your Experience', urlTemplate: '/my-bookings', parameterPath: '' }`
- `FEEDBACK_REQUEST` entry: `enabled: false` (fresh DBs never create a live
  standalone feedback ask; existing DB state is always preserved).
- `applyEntry` writes `whatsappUrlButtons` on create / fill-if-blank, exactly
  like the other WhatsApp content fields — **never overwrites an
  already-configured mapping** (existing deployments adopt the buttons
  deliberately via the Admin UI once their Meta template declares them).
- Idempotency preserved: second run = zero unnecessary writes (tested).

---

## 10. Template Requirements — **META ACTION REQUIRED (approval gate)**

The existing `service_completed` template almost certainly declares **no
URL buttons** (it has a plain 3-parameter body). The Cloud API rejects button
parameters a template does not declare (error class #132018), so the channel
**only sends button parameters for buttons the synced template declares** and
reports the rest as warnings (see §17 "graceful degradation"). Until the Meta
template is updated, `SERVICE_COMPLETED` sends exactly as today (body only).

**Required Meta template change** (create/update + approve, then re-sync via
Admin → Communication → WhatsApp Templates → Sync):

| Field | Value |
|---|---|
| Template name | `service_completed` (update in place, or a new name if Meta requires) |
| Category | **UTILITY** (transactional service status) |
| Body (unchanged) | 3 placeholders (customer name, booking number, pooja name) |
| Button 0 | **View Receipt** — URL button, dynamic: `https://<client-site>/invoice/{{1}}` |
| Button 1 | **Rate Your Experience** — URL button, static: `https://<client-site>/my-bookings` |

`<client-site>` = `urls.clientUrl` (the web app; `CLIENT_URL`/`FRONTEND_URL`
env or Admin → Settings → deployWebsiteUrl). Both destinations are **existing
routes** — nothing invented.

**Do not claim Meta approval.** This phase stops at implementation + report;
the template is a Meta-dashboard/business step requiring approval (STOP
condition, end of this document).

---

## 11. Button Destinations (all verified existing)

| Button | Destination | Route | Auth | Source |
|---|---|---|---|---|
| View Receipt | `{clientUrl}/invoice/{booking.id}` | `App.jsx` `<Route path="/invoice/:bookingId">` (same link `MyBookings` uses) | `ProtectedRoute` | booking payload `booking.id` (normalizer) |
| Rate Your Experience | `{clientUrl}/my-bookings` | `App.jsx` `<Route path="/my-bookings">` (hosts the `StarRating` UI → `POST /api/bookings/:id/rate`) | `ProtectedRoute` | static (no param) |

- Web rating UI: `pages/MyBookings.jsx` (star + review input).
- Mobile rating UI: `screens/user/BookingDetailScreen.jsx` (same endpoint).
- **Enhancement (not built — out of scope):** a `?rate=<bookingId>` deep-link
  on `/my-bookings` that auto-scrolls to / opens the rating widget for the
  specific booking would make the button land directly on the rating flow. The
  URL button would then become dynamic with parameter `booking.id`. Documented
  here as the recommended follow-up (Phase 6/7 candidate).

---

## 12. Consent Behavior

- `SERVICE_COMPLETED` purpose = **SERVICE** → Phase 5 gate is a no-op →
  **always sends**, even with `whatsapp.marketing.status = opted_out`.
- A promotional message (purpose MARKETING) is still **blocked** for the same
  user (`marketing_consent_missing`, provider never called).
- A feedback button inside the service message does **not** change purpose.
- Verified by tests: opted-out user → SERVICE_COMPLETED reaches the provider
  (with buttons when the template declares them); MARKETING mapping → blocked.

---

## 13. Website / Mobile Impact

- **Website:** no runtime behavior change; the rating UI (`MyBookings`) is the
  button's landing page. Admin UI (`NotificationEngineAdmin.jsx`) gains a
  "URL Buttons" editor in the mapping modal (text / destination / payload
  path), so admins can configure buttons on existing mappings once their Meta
  template declares them.
- **Mobile:** unchanged. The app's own booking detail screen already has the
  rating flow; WhatsApp URL buttons open the mobile browser.
- **Auth note:** both destinations are behind `ProtectedRoute`; a logged-out
  customer is redirected to `/login?next=…` and lands back after login (the
  existing guard behavior).

---

## 14. Email / In-App Impact

None. `FEEDBACK_REQUEST` and `SERVICE_COMPLETED` have no email or in-app
mappings; nothing was removed from other channels. The feedback *capability*
(booking rating) is untouched on every channel.

---

## 15. Tests

`backend/tests/consent-phase5-1-feedback.test.js` — **21 tests** (dedicated DB
`zutsav_consent_phase5_1_test`), all passing:

- **Model:** `whatsappUrlButtons` persists; defaults `[]`.
- **Provider:** `getDeclaredUrlButtons` parses BUTTONS components (dynamic vs
  static; ignores non-URL buttons; `{}` when absent).
- **Components:** declared dynamic+static → correct `sub_type`/`index`/
  `parameters`; undeclared button → omitted + warning; empty dynamic param →
  omitted + warning; no declared info → omitted; copy_code + URL shift.
- **Channel e2e:** SERVICE_COMPLETED (purpose SERVICE) with marketing
  `opted_out` → **sends** with both button parameters; template without
  buttons → body still sends, buttons omitted, warnings surfaced; MARKETING
  mapping → still blocked (regression); dry-run renders expose warnings.
- **Bootstrap v1.3.0:** fresh DB → SERVICE_COMPLETED created with purpose
  SERVICE + both buttons; FEEDBACK_REQUEST created **disabled**; second run
  idempotent (51 already-correct, zero writes); existing configured
  SERVICE_COMPLETED preserved (buttons not overwritten); existing enabled
  FEEDBACK_REQUEST preserved; button destinations match real routes.
- **Static audit:** no `FEEDBACK_REQUEST` emit remains in any completion path
  or cron; `SERVICE_COMPLETED` still fires on all 3 completion paths;
  `FEEDBACK_REQUEST` stays in EventRegistry.

**Full suite:** `cd backend && node --test` → **94/94 pass** (73 pre-existing
+ 21 new). `cd frontend && npm run build` → succeeds. (Note: `npm test`
resolves to `node --test tests/`, which fails on this Windows/Node v26 combo
for a pre-existing path-resolution reason unrelated to this change — the
documented `node --test` from `backend/` is the run command.)

---

## 16. Files Changed

| File | Change |
|---|---|
| `backend/src/models/NotificationMapping.js` | `whatsappUrlButtons` subdocument schema |
| `backend/notification-engine/variables/VariableResolver.js` | `buildWhatsAppButtonComponents` + URL-button support in `buildWhatsAppComponents` (declared-only, warnings out-param, copy_code index shift) |
| `backend/notification-engine/providers/WhatsAppProvider.js` | `getDeclaredUrlButtons(tmpl)` — template = authoritative button source |
| `backend/notification-engine/templates/TemplateEngine.js` | render passes declared buttons + returns `buttonWarnings`; `rawTemplateText` includes button parameter paths (validator catches typo'd paths) |
| `backend/notification-engine/channels/WhatsAppChannel.js` | checklist: `declaredUrlButtons` / `buttonRows` / `buttonWarnings` (informational, never blocks); send renders with declared buttons |
| `backend/src/controllers/booking.controller.js` | removed `FEEDBACK_REQUEST` emit (completion path) |
| `backend/src/controllers/admin.controller.js` | removed 2 `FEEDBACK_REQUEST` emits; `whatsappUrlButtons` in tracked/editable/create/clone/import; dry-run renders with declared buttons |
| `backend/src/utils/cleanupJobs.js` | removed `runFeedbackReminder` (function + registration + export) — no standalone feedback cron |
| `backend/src/scripts/bootstrapNotificationMappings.js` | v1.3.0: SERVICE_COMPLETED buttons, FEEDBACK_REQUEST disabled, `applyEntry` writes buttons on create/fill |
| `frontend/src/components/admin/NotificationEngineAdmin.jsx` | URL-buttons editor in mapping modal (form state + handlers + UI) |
| `backend/tests/consent-phase5-1-feedback.test.js` | new — 21 tests |
| `frontend/build/*` | regenerated by `npm run build` (repo convention tracks build output) |

---

## 17. Files NOT Changed

- `WhatsAppProvider.send` transport logic (only an additive helper).
- `consentService`, `WhatsAppPreference`, `WhatsAppConsentEvent`, the Phase 4
  webhook, `hasMarketingConsent`, the Phase 5 consent gate semantics.
- `EventRegistry.js` (frozen enum — `FEEDBACK_REQUEST` stays registered).
- Booking/payment/invoice generation logic; `rateBooking` endpoint.
- Web/mobile booking rating UIs.
- `WhatsAppChannel` gate: MARKETING still blocked; all non-marketing purposes
  unaffected.
- Chatwoot (none in repo).

**Graceful degradation (why nothing breaks before the Meta template exists):**
a mapped URL button whose index the synced template does not declare is
**omitted with a warning** (checklist + dry-run), and the body still sends —
a transactional service message is never held hostage by a pending template
update, and Meta is never sent malformed button parameters.

---

## 18. Open Questions

1. **Meta template** — update `service_completed` (or new name) with the two
   URL buttons, UTILITY category; approval + re-sync required (see §19).
2. **Rate deep-link** — should `Rate Your Experience` become a dynamic URL to
   `/my-bookings?rate={booking.id}` (auto-open rating for that booking)?
   Requires a small web enhancement + template re-declaration.
3. **Order side** — should `ORDER_DELIVERED` get the same treatment
   (transactional + optional feedback)? Machinery is ready; client to confirm.
4. **Retention of the disabled FEEDBACK_REQUEST row** — kept for
   compatibility; can be deleted from DBs at any time (nothing references it).

---

## 19. Meta Template Requirements (STOP — approval gate)

**A Meta template change is required before the buttons can be delivered.**
This phase does **not** create, modify, or claim approval of any Meta
template. Proposed spec for the Meta dashboard / business approval:

- **Template name:** `service_completed` (update in place if Meta allows, else
  a new name + mapping template-name update)
- **Category:** UTILITY
- **Purpose:** transactional service-completion status
- **Body:** the existing 3-placeholder service-completion body (unchanged)
- **Buttons:**
  - URL button **View Receipt** → `https://<client-site>/invoice/{{1}}`
    (1 dynamic suffix parameter: booking id)
  - URL button **Rate Your Experience** → `https://<client-site>/my-bookings`
    (static, no parameter)
- **Reason existing template cannot be reused as-is:** the approved
  `service_completed` declares no BUTTONS component; Meta rejects button
  parameters for undeclared buttons.

Until approval + sync, `SERVICE_COMPLETED` sends the transactional body
without buttons (safe, unchanged behavior) and the admin dry-run shows the
"does not declare a URL button" warnings.

---

## Final Checkpoint

- [x] Existing FEEDBACK_REQUEST flow fully audited (4 emitters; standalone)
- [x] Existing service completion flow audited (`SERVICE_COMPLETED`, 3 paths)
- [x] Existing order completion flow audited (untouched; reusable machinery)
- [x] Existing WhatsApp templates audited (`service_completed` = no buttons)
- [x] Existing buttons audited (copy_code only → URL-button support added)
- [x] Existing feedback destination audited (`/my-bookings` rating UI;
      `/invoice/:bookingId`; both real protected routes)
- [x] Correct transactional notification identified (SERVICE_COMPLETED)
- [x] Feedback treated as optional action; no standalone feedback message
- [x] Service completion remains purpose = SERVICE
- [x] Marketing opt-out does not block service completion (tested)
- [x] Marketing notifications still blocked when opted out (tested)
- [x] Existing booking/service/order behavior preserved (94/94 tests)
- [x] Existing Email/In-App behavior preserved (no mappings touched)
- [x] No duplicate notification created (FEEDBACK_REQUEST emitters removed)
- [x] Bootstrap impact documented + v1.3.0; idempotency preserved (tested)
- [x] No fake URL introduced (both destinations are real routes)
- [x] No Meta template approval assumed (STOP condition below)
- [x] Existing consent architecture untouched; webhook untouched; no Chatwoot
- [x] Tests pass (94/94 backend; frontend build succeeds)
- [x] Documentation created (this file)

**STOP — this phase is complete. A new/updated Meta template is required for
the buttons to render; do not create or claim it without approval.**
