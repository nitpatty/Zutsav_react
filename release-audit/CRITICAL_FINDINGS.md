# Zutsav — Critical Findings Report

These are the findings that must be resolved (or explicitly signed off as accepted risk / descoped) before a production launch. Each entry includes exact file references so an engineer can act without re-deriving the finding.

---

## 1. KYC / Government-ID documents are publicly downloadable with no authentication
**Severity: Production Blocker · Priority: Critical · Status: Bug — CONFIRMED**

Pandit KYC documents — Aadhaar/PAN scans, selfies, address proof — are uploaded via multer to disk and served back out through Express's static file middleware with no auth check of any kind:

- `backend/src/app.js:117` — the `/uploads` static mount
- `backend/src/middleware/upload.js:6-17,50-59` — upload destinations (`kycdocs`, `govtids`) and filename generation

Filenames are generated as `Date.now()-rand(1e6).ext` — not cryptographically random, and enumerable within a known registration-time window (an attacker who knows roughly when a pandit registered can brute-force the timestamp component). Anyone with (or able to guess) a URL can retrieve another person's government ID scan and selfie directly, with zero authentication or ownership check.

**Fix:** Move KYC/govt-ID file serving behind an authenticated controller route that checks the requester is either the document owner or an admin before streaming the file. Switch filename generation to `crypto.randomUUID()` regardless (defense-in-depth, but the auth gate is the actual fix — the current filenames are not meant to be a security boundary).

---

## 2. ReDoS via unescaped regex search on public endpoints
**Severity: Production Blocker · Priority: Critical · Status: Bug — CONFIRMED**

`new RegExp(userInput, 'i')` is constructed directly from `req.query.search` / `req.query.q` with no escaping in roughly ten controllers, several of which sit on completely public, unauthenticated endpoints:

- `backend/src/controllers/temple.controller.js:32-33,79-85`
- `backend/src/controllers/marketplace.controller.js:63,130`
- `backend/src/controllers/pooja.controller.js:51,95,366,532`
- `backend/src/controllers/blog.controller.js:69-71`
- `backend/src/controllers/pandit.controller.js:463,529,756-758`
- `backend/src/controllers/referral.controller.js:103-104`
- `backend/src/controllers/admin.controller.js:812-814,1641,1965,3169-3170,3337,3506`
- `backend/src/controllers/adminManagement.controller.js:75`
- `backend/src/controllers/invoice.controller.js:112`

A search string like `(a+)+$` submitted as a query parameter causes catastrophic regex backtracking, tying up the Node.js event loop for one request — and Node is single-threaded, so this is a real denial-of-service vector against public search endpoints (temple search, product search, pooja search, blog search) that require no login to hit.

Notably, `backend/src/controllers/festival.controller.js:64` already contains a correctly escaped search pattern — the team clearly knows the right technique, it just wasn't applied consistently across the other ~15 controllers.

**Fix:** Wrap every user-supplied search term with the same escaping already used in `festival.controller.js`, or (better) extract it into a shared `escapeRegex()` utility and apply it at every `new RegExp(` call site that takes user input.

---

## 3. Mobile app ships with cleartext traffic enabled
**Severity: Production Blocker · Priority: High · Status: Bug — CONFIRMED**

`mobile-app/android/app/src/main/AndroidManifest.xml:19` sets `android:usesCleartextTraffic="true"`. This was added during development to allow the app to talk to a local dev-machine backend over plain HTTP, but the production configuration (`backend/.env.production.example`) expects an HTTPS `SERVER_URL` (`https://api.zutsav.com`).

Shipping this flag to the Play Store means the app is explicitly configured to permit unencrypted HTTP traffic, which is both a Play Store policy risk and an actual MITM exposure if any request path ever falls back to HTTP.

**Fix:** Remove the flag for release builds (it can stay in a debug-only manifest override), or replace it with a `network_security_config.xml` that only permits cleartext to specific dev-only hostnames/IPs.

---

## 4. Refunds have no automated gateway execution
**Severity: Major · Priority: Critical · Status: Missing — CONFIRMED**

`backend/src/utils/phonepe.js` exports only `createPhonePeOrder`, `checkPhonePeStatus`, and `verifyWebhookChecksum` — there is no refund API call anywhere in the codebase for either PhonePe or the legacy Razorpay integration. The admin `processRefund` action (`backend/src/controllers/admin.controller.js:1093-1166`) validates the refund amount against the eligible amount and writes a database record — but the actual money movement happens entirely outside the platform, manually, via the gateway's own dashboard. There is no reconciliation step that confirms the manually-recorded refund actually matches what happened at PhonePe.

Compounding this: `cancelBooking` (`backend/src/controllers/booking.controller.js:659-671`) sets `paymentStatus: 'REFUNDED'` at the moment of *cancellation request* — before any refund has actually been processed by anyone. Any report or downstream consumer keyed off `paymentStatus` will show a refund as complete when it may not have happened yet.

**Fix:** Either integrate the PhonePe/Razorpay refund API so `processRefund` actually triggers a real refund and reconciles the result, or explicitly document this as an intentional manual-ops workflow and fix the premature `paymentStatus: 'REFUNDED'` write to only happen once `refund.status` reaches a genuinely completed state.

---

## 5. Mobile admin cannot manage the content catalog at all
**Severity: Production Blocker · Priority: Critical · Status: Missing — CONFIRMED**

The web admin panel (`frontend/src/pages/AdminDashboard.jsx`) has 7+ dedicated tabs for catalog and content management: Poojas, Marketplace products, Festivals, Education/Specialization Masters, Temples, Homepage Curation, and Livestreams. Mobile admin (`mobile-app/src/navigation/AdminDrawerContent.jsx:10-25`) has **zero** equivalent screens for any of these — confirmed by comparing the full web tab list against the full mobile drawer item list.

This means an admin using only the mobile app cannot add a new pooja, edit a marketplace product, create a festival entry, or curate the homepage — they must use the web console for all content operations.

**Fix:** Either explicitly scope mobile admin as "operations-only" (bookings, orders, pandits, users, refunds, blog moderation) in release documentation and product messaging, or prioritize building at least read + basic-edit screens for Poojas and Marketplace before considering mobile admin a parity replacement for web.

---

## 6. Mobile admin cannot process pandit payouts
**Severity: Production Blocker · Priority: Critical · Status: Missing — CONFIRMED**

The web admin panel has a dedicated `PayoutsTab` for batch/single pandit payout review and release. A repository-wide grep across `mobile-app/src/screens/admin` confirms **zero** references to payouts anywhere in mobile admin — no screen, no API call, nothing.

This is a real financial-operations gap: if a business's finance/ops staff work primarily from mobile, they cannot release pandit payouts without switching to a desktop browser.

**Fix:** Add a Payouts screen to mobile admin (batch review + release, mirroring the web `PayoutsTab`'s data and actions) before treating mobile as viable for finance-ops staff, or document this as an accepted web-only workflow.

---

## Notable High-Priority Findings (not blockers, but should not ship silently)

- **Naive HTML sanitizer with confirmed bypass, plus zero client-side sanitization before 7 `dangerouslySetInnerHTML` calls** (`backend/src/utils/sanitizeHtml.js:4-10`) — combined with JWT tokens sitting in `localStorage` on web (`frontend/src/utils/authStorage.js:7-23`), this is a real stored-XSS-to-token-theft chain, not two unrelated minor issues.
- **Weak seeded system_admin password** — `backend/src/utils/seedAdmin.js:9-14` creates the platform's first superuser account from a plaintext `.env` value (`Admin@123` in the current environment) with no forced-change flow or MFA.
- **Placeholder JWT secret still in use** — the `.env` `JWT_SECRET` is literally the placeholder text `"zutsav_super_secret_jwt_key_change_in_production"`. This, along with the WhatsApp access token, Gmail app password, and Tekipost credentials currently sitting in that file, must be rotated before production cutover.
- **Zero explicit database indexes on Booking, Order, Pandit, Product, Kit, and Shipment** — fine at current data volume, will degrade materially once real production traffic arrives. Independently confirmed by two separate audit passes.
- **Cart/combo-checkout bookings never receive an Invoice record** — only the single-booking payment path calls `generateInvoiceForPayment`; the cart checkout flow does not, meaning a real subset of paid bookings has no invoice trail.
- **Pandit KYC government-ID-type values don't match the backend schema enum** — mobile's dropdown offers `voter_id`/`driving_license`; the backend model and web registration form expect `voter`/`driving`. Selecting the mismatched options silently writes a value the rest of the system never expects (no `runValidators` on the update call to catch it).
