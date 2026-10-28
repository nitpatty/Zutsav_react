# Payment return and deep links audit (Day 11 — F-06 + F-18)

Date: 2026-10-26 · Branch `main` · HEAD `e77ef97` (plus uncommitted work from Days 1–10)
Method: **static source inspection only.** No code, test, package, environment, native or existing documentation file was changed.
No test or backend process was started, no PhonePe/Ola/Google endpoint was called, no payment or order record was touched, and no `.env`
value, credential, token or signing file was read (only variable *names* from `*.env.example` and `docs/DEPLOYMENT_CONFIGURATION.md`).
Anything that needs a device, a real gateway or the production hosting is marked **Not verified** and listed in §10.

## 1. Executive summary

1. **Every payment flow confirms payment on the server.** Success is only ever set by (a) `checkPhonePeStatus()` — a server-to-gateway
   status call — behind an owner-checked verify endpoint, or (b) a webhook whose X-VERIFY checksum is validated against the configured
   salt. No redirect, deep link, transaction id or query parameter is treated as proof of payment, on the backend, the website or the app.
2. **The browser return does not come back to the app, and cannot today.** PhonePe is told to return the browser to the *website*:
   `${CLIENT_URL}/payment-callback/<txn>` (`?cart=1` for marketplace). That page sits behind the website's `ProtectedRoute`, so a mobile
   user — who has no website session in the phone's browser — is sent to the website login page. The Android manifest has **no HTTPS
   intent filter and no `autoVerify`**, and **no `assetlinks.json` exists anywhere in the repository**, so an HTTPS return could not
   open the app even if the user were logged in. (F-06 and F-18 are both confirmed.)
3. **The app does not rely on the return at all.** After `Linking.openURL(redirectUrl)` it immediately navigates to `PaymentVerify`, which
   polls the server (20 × 3 s = 60 s), then shows "Still Confirming" with a manual "Check Again". That design is safe (server-authoritative)
   but fragile: polling starts *while the user is still paying*, nothing re-checks when the app returns to the foreground
   (`AppState` is not used anywhere), and the screen's context lives only in navigation params (lost if the app is killed).
4. **Flows differ and must not be conflated:** booking (`ZUT_`, `ZUT_RETRY_`, `ZUT_REM_`; own verify routes and webhook), unified
   marketplace checkout (`ZUT_CART_`, `ZUT_CART_RETRY_`; `/api/checkout/*`), legacy marketplace (`ZOM_`; `/api/marketplace/orders/*`).
   The mobile app never *creates* a legacy `ZOM_` order; it only verifies one that is still pending.
5. **Most serious confirmed problems** (details §7): (A) a booking whose webhook is missed *and* whose user never re-verifies stays
   `pending_payment` forever — the 10-minute sweep deliberately skips successful payments and booking retry answers `alreadyInFlight`
   without asking the gateway; (B) the booking and cart webhooks swallow every error and answer 200, so PhonePe will not redeliver after a
   transient failure; (C) check-then-act (non-atomic) booking transitions can double-run side effects if verify and webhook race;
   (D) payment return lands on a login-gated website page; (E) deep links: scheme-only filters, mismatched host assumptions, referral
   param mismatch on warm start.
6. **Recommendation:** keep server verification exactly as is. Make the app resilient *without* depending on any link first
   (persist the pending payment, re-verify on foreground/launch, handle `alreadyInFlight`), then — only after the owner confirms the
   canonical host, PhonePe's redirect rules and signing — add verified Android App Links for `/payment-callback/*` as an *optional
   accelerator* that merely opens the same server-verified screen. Phases and owners are in §9.

## 2. Text diagrams of the actual flows

### 2.1 Booking (initial, retry, remaining)

```
App BookingFlowScreen "Pay"
  POST /api/bookings/create-phonepe-order  (auth)   → Booking(pending_payment) + PaymentLedger(PENDING), txn ZUT_<ms>_<last6 userId>
      backend createPhonePeOrder({ redirectUrl: <CLIENT_URL>/payment-callback/<txn>, callbackUrl: <SERVER_URL>/api/bookings/phonepe-webhook })
  ← { redirectUrl (PhonePe pay page), merchantTransactionId, booking, chargeAmount }
  Alert "Complete Payment" → [Pay Now] Linking.openURL(redirectUrl); navigation.replace('PaymentVerify', { txn, bookingId, type:'booking' })
        │                                              │
        │ user pays in PhonePe/browser                 └─► PaymentVerify polls GET /api/bookings/verify-phonepe/<txn> every 3 s (≤ 20×)
        ▼                                                    owner check → checkPhonePeStatus(txn) → settle booking+ledger+invoice → {success, booking}
  PhonePe ──server→server──► POST /api/bookings/phonepe-webhook (checksum) → same settlement if booking.status !== 'paid'   (SEPARATE from the browser return)
  PhonePe ──browser──► <CLIENT_URL>/payment-callback/<txn>  (WEBSITE page, login required) — the app is not involved
Retry:     POST /api/bookings/:id/retry-payment  → txn ZUT_RETRY_…, booking.phonePeMerchantTransactionId repointed; blocked while a ledger is PENDING (→ {alreadyInFlight, merchantTransactionId, redirectUrl:null})
Remaining: POST /api/bookings/:id/pay-remaining  → txn ZUT_REM_…, type 'booking-remaining' → GET /api/bookings/verify-remaining/<txn>; webhook branch ZUT_REM_ in the same webhook
Sweep:     every 10 min, bookings pending ≥ 30 min: gateway status → FAILED if terminal-failed; SUCCESS is skipped on purpose
```

### 2.2 Unified marketplace checkout (and booking-in-cart)

```
App CartScreen "Place Order"
  POST /api/checkout/cart { products, shippingAddress, idempotencyKey }   → Order(pending_payment), txn ZUT_CART_<ms>_<last6>, attempt PENDING
      redirectUrl: <CLIENT_URL>/payment-callback/<txn>?cart=1    callbackUrl: <SERVER_URL>/api/checkout/webhook
  Alert [Pay Now] → Linking.openURL(redirectUrl) (https only) → navigation.navigate('PaymentVerify', { txn, orderId, type:'marketplace' })
  PaymentVerify → GET /api/checkout/verify/<txn>  (txn starts ZUT_CART_)
      owner check on every booking+order for the txn → checkPhonePeStatus → orderPayments.applySuccessfulPayment (ATOMIC pending→paid; stock once)
      → { success, order, bookings } | { success:false, code, state, order } | { code:'PAYMENT_NEEDS_REVIEW', … }
  Webhook: POST /api/checkout/webhook (ZUT_CART_* only) → same applySuccessfulPayment
  Cart is cleared locally as soon as the order exists on the server (before payment) — never on payment success.
```

### 2.3 Marketplace payment retry

```
OrderDetailScreen "Retry Payment"
  POST /api/checkout/orders/:id/retry-payment { idempotencyKey }   (owner only; same 404 for "not yours" and "missing")
      eligibility → reconcileOrderAttempts (asks the gateway about earlier PENDING attempts) → atomic allocate attempt
      txn ZUT_CART_RETRY_<ms>_<last6>_<rand>; redirectUrl <CLIENT_URL>/payment-callback/<txn>?cart=1; callbackUrl <SERVER_URL>/api/checkout/webhook
  → open PhonePe (https only) → PaymentVerify (type 'marketplace') → GET /api/checkout/verify/<txn>   (txn → order found via ANY attempt)
  Errors: PAYMENT_IN_PROGRESS → app opens PaymentVerify for the returned txn; ORDER_ALREADY_PAID / ORDER_EXPIRED / … → toast + re-read order
  On screen focus the order is re-read from the server (GET /api/marketplace/orders/:id — database state, not a gateway check).
```

### 2.4 Legacy marketplace (`ZOM_`)

```
(Website/legacy) POST /api/marketplace/orders/create → txn ZOM_…, redirectUrl <CLIENT_URL>/payment-callback/<txn> (NO ?cart=1), callbackUrl …/api/marketplace/orders/phonepe-webhook
App: only verifies an existing pending order:  type 'marketplace' + txn NOT starting ZUT_CART_  →  GET /api/marketplace/orders/verify-phonepe/<txn>
Backend: resolves the order by ANY attempt txn (orderPayments.findOrderByTxn), owner check, checkPhonePeStatus, applySuccessfulPayment.
Webhook /api/marketplace/orders/phonepe-webhook handles SUCCESS only (failure is learned later from verify); errors go to next(err) → 5xx (PhonePe can retry).
```

## 3. Payment flow inventory and contract matrix

| Flow | Initiation (app → API) | Txn id | Browser return URL (`redirectUrl`) | Server callback (`callbackUrl`) | Verify route (auth, owner-only) → response | Authoritative success |
|---|---|---|---|---|---|---|
| Booking | `BookingFlowScreen` → `POST /api/bookings/create-phonepe-order` (`booking.controller.js:242`, `:463-469`) | `ZUT_<ms>_<last6 userId>` (`:273`) | `<CLIENT_URL>/payment-callback/<txn>` | `<SERVER_URL>/api/bookings/phonepe-webhook` | `GET /api/bookings/verify-phonepe/:txn` (`:480`) → `{success, booking, alreadyVerified?}` / `{success:false, code, state, booking}` | `checkPhonePeStatus().success` (state `COMPLETED`) **or** signed webhook `code==='PAYMENT_SUCCESS'` |
| Booking retry | `BookingDetailScreen`/`BookingsScreen`/`PaymentVerify` → `POST /api/bookings/:id/retry-payment` (`:561`) | `ZUT_RETRY_<ms>_<last6>` (`:595`) | same shape | same webhook | same verify route (booking row is repointed at the new txn) | same |
| Booking remaining | `BookingDetailScreen` → `POST /api/bookings/:id/pay-remaining` (`:623`) | `ZUT_REM_…` (`:652`) | same shape | same webhook, `ZUT_REM_` branch (`:748`) | `GET /api/bookings/verify-remaining/:txn` (`:682`), mobile `type:'booking-remaining'` | same |
| Unified marketplace | `CartScreen` → `POST /api/checkout/cart` (`checkout.controller.js:483`) | `ZUT_CART_<ms>_<last6>` (`checkoutIdempotency.js:64`) | `<CLIENT_URL>/payment-callback/<txn>?cart=1` (`:443`) | `<SERVER_URL>/api/checkout/webhook` | `GET /api/checkout/verify/:txn` (`:614`) → `{success, order, bookings, alreadyVerified?}` / `{success:false, code, state, order, bookings}` / `{code:'PAYMENT_NEEDS_REVIEW', …}` | `checkPhonePeStatus` + atomic `applySuccessfulPayment`; webhook same |
| Marketplace retry | `OrderDetailScreen` → `POST /api/checkout/orders/:id/retry-payment` (`orderRetry.controller.js:94`) | `ZUT_CART_RETRY_<ms>_<last6>_<hex>` (`checkoutIdempotency.js:69`) | same as unified (`?cart=1`, `orderRetry.controller.js:80`) | same `/api/checkout/webhook` (prefix `ZUT_CART_` matches `:717`) | `GET /api/checkout/verify/:txn` for the SAME order | same |
| Legacy marketplace | not created by the app; website/legacy → `POST /api/marketplace/orders/create` (`marketplace.controller.js:315`) | `ZOM_<ms>_<last6>` (`:390`) | `<CLIENT_URL>/payment-callback/<txn>` (`:426`) | `<SERVER_URL>/api/marketplace/orders/phonepe-webhook` | `GET /api/marketplace/orders/verify-phonepe/:txn` (`:440`) → `{success, state, order}` / `PAYMENT_NEEDS_REVIEW` | same atomic path |

How each client decides which verify route to call (they must agree):

- **Website** `PaymentCallback.jsx:77-129`: `ZOM_` → marketplace route; `ZUT_CART_` → checkout route; `ZUT_REM_` → remaining; everything else → single booking. The `?cart=1` flag is **not read**.
- **App** `PaymentVerifyScreen.jsx:48` + `utils/marketplaceCheckout.js:73-79`: the *screen's `type` param* picks booking / booking-remaining; only for `marketplace` does the prefix matter (`ZUT_CART_` → checkout, otherwise legacy). The two rules are equivalent for every transaction the app can create.

Failure / pending / retry behaviour:

| Flow | Pending | Terminal failure | Retry |
|---|---|---|---|
| Booking | verify returns `{success:false, state:'PENDING'}`; nothing changes | ledger → `FAILED`, attempt recorded, `booking.paymentStatus='FAILED'`, booking stays `pending_payment` | `retry-payment` — refused with `alreadyInFlight` while any ledger row is `PENDING` |
| Remaining | same | ledger → `FAILED` | `pay-remaining` — `409` while a `REMAINING` ledger is `PENDING` |
| Unified/retry/legacy order | verify returns `state:'PENDING'`; retry refuses while an attempt is `PENDING` at the gateway | attempt marked failed; order stays `pending_payment`, retryable | idempotent retry endpoint; expiry is **off** unless `MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES` is set |

## 4. Webhook, callback and idempotency analysis

- **Browser return and server webhook are separate channels.** `redirectUrl` is where the user's browser lands; `callbackUrl` is where PhonePe's server posts. Both are set in `createPhonePeOrder` (`utils/phonepe.js:166-210`), using PhonePe v1 `/pg/v1/pay` with `redirectMode:'REDIRECT'`.
- **Webhook authenticity:** checksum over the base64 body with the explicitly configured salt (`verifyWebhookChecksum`, `phonepe.js:272`); the public PhonePe test salt is refused in live mode (`payment-mode.test.js`). A forged callback fails with 400.
- **Webhook response policy differs by flow:**
  - bookings `phonePeWebhook` and checkout `cartWebhook`: `catch { res.json({ success: true }) }` — **any internal error is answered 200**, so PhonePe will not redeliver (`booking.controller.js:825`, `checkout.controller.js:763`).
  - legacy marketplace webhook: `next(err)` → HTTP 5xx on error (redeliverable) (`marketplace.controller.js:496`).
- **Idempotency:**
  - Orders (unified, retry, legacy): `applySuccessfulPayment` is an **atomic** `pending_payment → paid` transition; stock is deducted once by the winner; duplicate/late payments are recorded as `needs_review` / `DUPLICATE_PAYMENT`, never applied twice (covered by tests, §8).
  - Bookings and the booking part of a cart: **check-then-act** (`if (booking.status !== 'paid') { …save…; Pooja.$inc; notify }`) in verify (`booking.controller.js:494-535`) and in the webhooks (`:779-812`; `checkout.controller.js:645-660`, `:722-745`). Two concurrent callers can both pass the guard. `generateInvoiceForPayment` is guarded per ledger row (read-then-create), `settleCoinRedemption` is documented idempotent. A true simultaneous race is **Not verified** at runtime and has no test.
- **User returns before the webhook:** the app's verify call asks the gateway itself, so it can settle the payment first; the webhook later finds it already paid and does nothing (orders) or skips (`booking.status !== 'paid'`).
- **App killed / browser closed / user returns later:** the app keeps no record of the pending payment. Marketplace: the order exists and shows `pending_payment`; "Retry Payment" first reconciles earlier attempts with the gateway (`reconcileOrderAttempts`), so a lost webhook is recovered *through retry*. Booking: see finding P-01.
- **Backend jobs:** `startPaymentSweepJob` (every 10 min) asks the gateway about bookings pending ≥ 30 min and marks terminal failures `FAILED`, but **skips successes** ("let the user's own verify/webhook handle success", `cleanupJobs.js:267`). `startStaleOrderSweepJob` can expire stale orders but is **off** unless configured (marketplace expiry must stay off).

## 5. Mobile deep-link configuration audit

| Item | Finding (source) |
|---|---|
| Expo scheme | `app.json:8` `"scheme": "zutsav"`. `android/` is committed, so the manifest — not `app.json` — decides (see Day 8 notes). |
| Android intent filters | `MainActivity` has the LAUNCHER filter and **one** VIEW/DEFAULT/BROWSABLE filter whose only `<data>` entries are `scheme="zutsav"` and `scheme="com.zutsav.app"`. **No `https` data, no host, no path, no `android:autoVerify`.** `launchMode="singleTask"`. `<queries>` declares an https VIEW intent (for opening links), unrelated to receiving them. |
| iOS | `ios.bundleIdentifier` only. **No `associatedDomains`**, no Universal Links config (no `ios/` project in the repo). Out of scope beyond noting it. |
| Expo Linking / Router | `expo-linking`, `expo-router`, `expo-web-browser` are **not installed**. React Native's `Linking` and React Navigation's `linking` prop are used. |
| `linking` config (`App.jsx:27-53`) | `prefixes: ['zutsav://', 'https://www.zutsav.com', 'https://zutsav.com']`; `config.screens` maps **only** `Auth → Register: 'register'`. Custom `getInitialURL` (cold start) and `subscribe` (warm start, `Linking.addEventListener('url')`). No `getStateFromPath` customisation. |
| Hosts that appear | `www.zutsav.com` / `zutsav.com` (`App.jsx`), `app.zutsav.com` (`eas.json` production `EXPO_PUBLIC_WEB_URL`, `.env.example`, `config/env.js` default), `api.zutsav.com` (API), `staging.zutsav.com` (placeholder). The backend's real `CLIENT_URL` (the host actually used for `redirectUrl` and referral links) is an environment value and was **not read**; the documented example is `https://app.yourdomain.com`. |
| What the OS actually routes today | `zutsav://…` and `com.zutsav.app://…` open the app. **HTTPS links do not** — the https prefixes in `App.jsx` are inert unless the OS first hands an https URL to the app (it will not without a verified filter). |
| Mapped routes | Only `register`. **Not mapped:** payment return, order detail, booking detail, `PaymentVerify`, and the Pandit referral `/r/<token>` (website route `App.jsx:256`). A link can therefore never navigate to a payment/order screen today (a safe baseline). |
| Referral handling | Backend builds `<CLIENT_URL>/register?ref=<code>` (`userReferral.controller.js:36`) and `<CLIENT_URL>/r/<token>` (`referral.controller.js:50`). On a **cold start** `AppNavigation.onReady` parses `ref` and stores `global.__zutsav_referral_code` only `if (refCode && !user)` using the `user` captured at first render (may be `null` before hydration even for a logged-in user). On a **warm start** React Navigation passes the query as route param `ref`, but `RegisterScreen.jsx:58` reads `route.params.referralCode`, **not `ref`**, so the code is lost. |
| Authenticated vs unauthenticated | `RootNavigator` mounts `Auth` only when `!user`; a link to a screen in another navigator is unmatched while logged out and is **not queued** for after login. While `!ready`, a spinner renders; `NavigationContainer fallback={null}`. |
| Cold start vs warm start | Both paths exist (`getInitialURL`, `subscribe`). `onReady` reads `getInitialURL()` a second time (harmless duplicate read). A duplicate-delivery guard does not exist, but no payment-affecting route is mapped, so duplicates cannot repeat a side effect today. |
| Unknown / malformed links | No custom handling; React Navigation's matcher returns no state for an unmapped path, so the app opens normally. `extractReferralCode` returns any `ref` value unvalidated (no length/charset check) and the backend validates it later. Runtime behaviour **Not verified**. |
| Tests | No test references `linking`, `getInitialURL`, `intent-filter`, `autoVerify` or `assetlinks`. `config/__tests__/androidRelease.test.js` guards cleartext/backup/permissions/signing, not link filters. |

## 6. Android App Links and domain ownership

What would have to be true for `https://<host>/payment-callback/<txn>` to open the app (standard Android App Links requirements; the
repo status of each is in the right column):

| Requirement | Status in this repository |
|---|---|
| Android application id | `com.zutsav.app` (`android/app/build.gradle`, `app.json:34`). Same for debug and release (no `applicationIdSuffix`). |
| Host(s) that must open the app | **Undetermined.** Must equal the host in the backend's `CLIENT_URL` (payment `redirectUrl`) and the host(s) used for referral links. Candidates in source: `app.zutsav.com`, `www.zutsav.com`, `zutsav.com`. **Owner must confirm.** |
| Paths | Payment return: `/payment-callback/<txn>` (all flows). Referral: `/register` (query `ref`) and `/r/<token>`. |
| Manifest `<intent-filter android:autoVerify="true">` with `https` + host + path prefix | **Absent.** |
| `https://<host>/.well-known/assetlinks.json` | **Absent**: `frontend/public/` contains only `favicon.svg`, `index.html`, the PDF worker; no `.well-known`; none in `frontend/build/` either. No hosting config in the repo declares it. |
| Fingerprints in `assetlinks.json` | Nothing to compare. Relevant certificates differ by build: debug keystore (dev builds), EAS-managed or local release key (internal APK, `eas.json` `preview`), and the **Play App Signing certificate** for Play installs (`production` is an app bundle). Day 8 stopped release builds from using the debug key; EAS credential injection is still **Not verified**. All applicable SHA-256 fingerprints would be needed; none are in the repo and none must be invented. |
| Host serves the file correctly | The frontend image is `nginx:alpine` with the **default config** and no `nginx.conf` in the repo (`frontend/Dockerfile`). CRA copies `public/` (including a `.well-known` folder) into `build/`, so a file placed there would be served as static JSON — *if* the production host is this image and nothing redirects it. Whether `/payment-callback/*` direct loads work (SPA fallback) in production, and whether http→https or apex→www **redirects** exist (they break verification), is decided by a hosting layer **outside the repo — Not verified**. |
| Environment differences | Production API/web hosts in `eas.json`; staging host is a placeholder (`your-staging-api.zutsav.com`). Debug vs release signing differ; a host-specific `assetlinks.json` per environment/package would be required. |
| PhonePe constraints | The PhonePe documentation page fetched (`…/api-reference/create-payment`) describes `redirectUrl` as "URL where the user will be redirected after a successful/failed payment" and **does not state scheme rules** (custom scheme / App Link); it also describes a newer API than the legacy `/pg/v1/pay` + `redirectMode:'REDIRECT'` + `callbackUrl` this project calls. Whether PhonePe accepts a non-website return, and how its pay page hands off to an App Link, is an **external confirmation** with PhonePe plus a device test. |

## 7. Security and reliability findings

Severity reflects impact if the stated condition occurs. "Confirmed" = visible in source; "Potential" = needs runtime evidence.

| ID | Severity | Type | Finding | Evidence | Impact | Next step |
|---|---|---|---|---|---|---|
| P-01 | **High** | Confirmed (logic) / runtime likelihood unknown | A **booking** payment that succeeds at the gateway but whose webhook is lost, with the user not re-verifying, is never applied. The sweep skips successes, `retry-payment` returns `alreadyInFlight` without asking the gateway, and the app then only shows a toast. | `cleanupJobs.js:265-267`; `booking.controller.js:573-582`; `BookingsScreen.jsx:120-123`, `BookingDetailScreen.jsx:61-64` (stop at the toast, unlike `OrderDetailScreen.jsx:81-82`, which opens `PaymentVerify` for the in-flight txn) | Customer charged, booking stays `pending_payment` / ledger `PENDING`; manual support work | App: on `alreadyInFlight` open `PaymentVerify` for the returned txn (small, mobile-only). Backend (separate approval): let the sweep settle confirmed successes, or reconcile in `retry-payment`. |
| P-02 | **High** | Confirmed | Booking and cart webhooks answer **200 on any internal error**, so a transient DB/handler failure is never redelivered; bookings have no other automatic recovery (P-01). | `booking.controller.js:825`; `checkout.controller.js:763` (contrast `marketplace.controller.js:496`) | Same as P-01 | Backend (separate approval): return non-2xx for retryable failures; keep 200 for ignorable events. |
| P-03 | **High (for mobile UX)** | Confirmed | The browser return goes to a **login-gated website page**; a mobile user has no website session, so after paying they land on the website login page, not the app. | `booking.controller.js:467,614,667`; `checkout.controller.js:443,597`; `orderRetry.controller.js:80`; `marketplace.controller.js:426`; `frontend/src/App.jsx:61-69,140-141` | Confusing return; user must switch back to the app manually | Phase 3/4 (§9). The app's in-app polling is why money is still handled correctly. |
| P-04 | Medium | Confirmed | Polling starts immediately after the PhonePe URL is opened and runs for a fixed 60 s; **no foreground/`AppState` re-check**, no persisted pending-payment record. A payment that completes after 60 s shows "Still Confirming" until the user presses "Check Again"; a killed app forgets the payment context. | `PaymentVerifyScreen.jsx:13-14,28-94`; `CartScreen.jsx:103-106`; `BookingFlowScreen.jsx:355-357`; grep: no `AppState` in `mobile-app/src` | Delayed/missed confirmation UI (money handled correctly server-side) | Phase 1. JS-timer behaviour while the app is backgrounded is **Not verified**. |
| P-05 | Medium | Confirmed (race) / runtime Not verified | Booking (and cart-booking) transitions are check-then-act, not atomic. Concurrent verify + webhook can double-run `Pooja.totalBookings $inc` and notifications. Orders are atomic. | `booking.controller.js:494-535 vs 779-812`; `checkout.controller.js:645-660 vs 722-745` | Duplicate counters/notifications | Backend (separate approval): conditional update (`findOneAndUpdate` on status) as `orderPayments` does. No test exists. |
| P-06 | Medium | Potential | `BookingFlowScreen` creates a pending booking *before* the payment alert; the booking endpoint has no idempotency key, and `submitting` is reset in `finally`. If the alert is dismissed without Pay Now/Cancel, a second tap can create another pending booking. (`CartScreen` guards with a ref + idempotency key.) | `BookingFlowScreen.jsx:335-370` | Duplicate pending bookings | Mobile: lock after a successful create; consider `cancelable:false` on the alert. Android dismiss behaviour **Not verified**. |
| P-07 | Medium | Confirmed | HTTPS-only validation of the payment URL exists for cart/order retry but **not** for booking pay/retry/remaining or `PaymentVerify` retry. | `CartScreen.jsx:92`, `orderRetry.js:61` vs `BookingFlowScreen.jsx:356`, `BookingDetailScreen.jsx:67,93`, `BookingsScreen.jsx:125`, `PaymentVerifyScreen.jsx:116` | Defence-in-depth gap (URL comes from the authenticated backend/PhonePe) | Mobile: reuse `isSafePaymentUrl`. |
| P-08 | Medium | Confirmed | **F-18:** no HTTPS intent filter / `autoVerify`; HTTPS prefixes in `App.jsx` are inert at the OS level; no `assetlinks.json` anywhere. | `AndroidManifest.xml` (single custom-scheme filter); §5/§6 | HTTPS referral/payment links open the browser | §9 Phases 2–3 after owner decisions. |
| P-09 | Medium | Confirmed | Host assumptions disagree (`www.zutsav.com`, `zutsav.com`, `app.zutsav.com`); the real `CLIENT_URL` was not available. Verifying the wrong host would silently never match. | `App.jsx:28`; `eas.json:34`; `config/env.js`; `urls.config.js` | App Links would not verify | Owner: confirm the canonical host before any manifest change. |
| P-10 | Low–Medium | Confirmed | Referral link handling: warm-start param name mismatch (`ref` vs `referralCode`); cold-start guard uses a stale `user`; `/r/<token>` unmapped; `ref` value unvalidated. | `App.jsx:56-90`; `RegisterScreen.jsx:58-60` | Referral attribution lost on warm start | Mobile: read `route.params.ref`; validate; map `/r/:token` if desired. |
| P-11 | Low | Confirmed | Webhooks don't cross-check the decoded gateway amount/merchant against the ledger/order (signature only). | `booking.controller.js:737-744`; `checkout.controller.js:712-717` | Defence-in-depth | Backend (optional). |
| P-12 | Low | Confirmed | Legacy webhook records success only; a terminal failure is learned at verify time. | `marketplace.controller.js:487-494` | Attempt stays `PENDING` until verified | Optional. |
| P-13 | Info | Confirmed | **Good:** return URL carries only the transaction id (+ `?cart=1`), no PII/tokens; txn ids are predictable (`ts + last 6 of user id`) but **every verify endpoint checks ownership** and the retry endpoint returns the same 404 for "not yours"/"missing". The app has no link route to payment/order screens, and success is only what the server's verify response says. | `booking.controller.js:488-491,692-694`; `checkout.controller.js:627-632`; `marketplace.controller.js:449-450`; `orderRetry.controller.js:100-103`; `PaymentVerifyScreen.jsx:55-60` | — | Keep. |
| P-14 | Info | Confirmed | Custom schemes (`zutsav://`, `com.zutsav.app://`) are unverified: any installed app can fire them. Safe today because only `register` is mapped; any future link handler must treat the URL as an untrusted hint. | `AndroidManifest.xml`; `App.jsx` | — | Design rule for §9. |

Order status, stock and cart clearing: stock is deducted exactly once on the order paid-transition (tests below); the local cart is cleared when the *order is created* (before payment), by design, with the order retained server-side for retry — consistent with `CartScreen.jsx:78-81`.

## 8. Existing automated-test coverage (names read; **nothing was run in this audit**)

Historical baseline only: Day 10 reported 46 mobile suites / 861 tests passing; backend counts below come from reading the test files.

| Behaviour | Coverage |
|---|---|
| Unified checkout: ownership, idempotency (replay, concurrent, mismatch, header key), one `paid` entry, concurrent verify + webhook → one paid + one stock deduction | **Covered** — `backend/tests/checkout-integrity.test.js` (45), `checkout-products.test.js` |
| Marketplace retry: eligibility, idempotency, one live attempt, late/duplicate/expired payments, webhook for `ZUT_CART_RETRY_`, owner-only | **Covered** — `order-payment-retry.test.js` (42) |
| Stale-order expiry (off by default), sweep vs payment races | **Covered** — `stale-order-expiry.test.js` (26) |
| Legacy `ZOM_` verify/webhook, expired/late, ownership, repeat delivery | **Covered** — `legacy-marketplace-payment.test.js` (10) |
| Payment mode / credential rules / webhook checksum / mock gateway | **Covered** — `payment-mode.test.js` (57) |
| Booking lifecycle in mock mode: create, verify success/failure/pending, owner check, webhook replay, `verifyRemainingPayment` ownership | **Partial** — within `payment-mode.test.js` (calls the controller functions directly) |
| Booking `retry-payment`, `pay-remaining`, `ZUT_REM_` webhook branch, verify+webhook race, `sweepStalePaymentAttempts` | **Not found** (no test mentions `pay-remaining`/`verify-remaining` routes or the sweep) |
| Webhook behaviour on internal errors (200 vs 5xx) | **Not covered** |
| Mobile `PaymentVerifyScreen`: endpoint selection, success/pending/failed/timeout, retry txn, needs-review, booking retry button | **Covered** — `PaymentVerifyScreen.test.jsx`, `marketplaceCheckout.test.js`, `CartScreen.*.test.jsx`, `OrderDetailScreen.retry.test.jsx` |
| Mobile booking pay / retry / pay-remaining launch, `alreadyInFlight` handling, foreground re-verify, deep links, intent filters | **Not covered** |
| Real PhonePe behaviour, App Link verification, hosting, device handoff | **Requires real gateway / device / hosting verification** |

## 9. Recommended target flow and phased plan (not implemented)

Principles: (1) the server stays the only source of payment truth; (2) a return link is an *optional hint that opens the same
server-verified screen*; (3) the browser-checkout fallback keeps working; (4) the return URL carries only the transaction id.

**Target mobile flow:** before opening PhonePe, persist `{ type, merchantTransactionId, orderId|bookingId, startedAt }` (non-sensitive,
cleared at logout by `sessionCleanup`). On app launch **and** on every foreground (`AppState`), if a pending record exists, open/refresh
`PaymentVerify` and call the flow's verify endpoint; stop on a terminal answer; keep "Check again". Pending/inconclusive stays pending —
never success. Navigate to the result only on a server answer. Clear the cart only as today. Reuse the existing idempotent retry.

| Phase | Owner | Change | Depends on |
|---|---|---|---|
| 0 | Product / ops | Confirm canonical host for web + app links; confirm PhonePe's redirect rules and whether to keep website return; confirm how the Play and EAS signing certs will be obtained. | — |
| 1 | **Mobile only** | Persisted pending-payment + `AppState`/launch re-verification; open `PaymentVerify` for `alreadyInFlight` (bookings); `isSafePaymentUrl` for all payment URLs; lock against double booking creation; tests (unit + screen). No manifest/backend/website change. | none |
| 2 | Mobile + native | After Phase 0: manifest filter `<intent-filter android:autoVerify="true">` for `https` + confirmed host + `pathPrefix="/payment-callback"` (and `/register`, `/r` if referral links are wanted); `linking.config` route `payment-callback/:merchantTransactionId` → `PaymentVerify` with `type` from the txn prefix; allowlisted hosts; strict txn pattern; dedupe `getInitialURL` vs `subscribe`; queue a link for after login; unknown links ignored; fix referral param name. Dev build + device test. | Phase 0; Phase 3 |
| 3 | **Website / hosting (needs explicit approval)** | Serve `/.well-known/assetlinks.json` directly (`application/json`, no redirect, no SPA fallback) with the real SHA-256 fingerprints of every installed-build certificate for package `com.zutsav.app`; confirm `/payment-callback/*` direct loads; make the callback page usable without a website login (or show "Open in app"). | Phase 0, signing |
| 4 | **Backend (needs explicit approval)** | Booking webhook/cart webhook: non-2xx on retryable errors; atomic booking transitions; let the 10-min sweep (or retry) *settle* gateway-confirmed bookings; optional amount cross-check. Only where the audit proved the contract insufficient (P-01, P-02, P-05). | none, separate scope |
| 5 | QA | Device matrix (§10) plus a PhonePe sandbox run. | Phases 1–3 |

Compatibility: do not change `redirectUrl`/`callbackUrl` or any backend route in Phases 1–2; the website callback and webhooks keep working
unchanged. Do not enable marketplace pending-order expiry.

## 10. External configuration, owner decisions and tests required

Owner decisions: canonical HTTPS host (and whether `www`/apex also redirect); whether the website return should stay login-gated;
whether to pursue App Links at all given the in-app verification already works; approval for backend (P-01/P-02/P-05) and website changes.

External configuration (not visible from the repo): production `CLIENT_URL` / `SERVER_URL`; the hosting layer for the frontend (SPA
fallback, redirects, `/.well-known`); PhonePe dashboard/merchant settings and webhook URL registration; Play App Signing and EAS
credentials (SHA-256 fingerprints).

Device / runtime verification still needed (none performed): payment completes while the app is backgrounded and returns after > 60 s;
app killed mid-payment; webhook missed (sandbox); PhonePe return in browser vs PhonePe app; App Link verification state
(`adb shell pm get-app-links com.zutsav.app`) and handoff on Android 12+; behaviour of Linking events with `singleTask`; Android alert
dismissal (P-06); verify + webhook race.

## 11. Key source references

Backend: `src/utils/phonepe.js` (`:166-258,:272`), `src/config/urls.config.js`, `src/routes/{booking,checkout,marketplace,mockPayment}.routes.js`,
`src/controllers/booking.controller.js` (`:242-477,:480-553,:561-620,:623-679,:682-727,:730-826`), `checkout.controller.js` (`:59-463,:483-611,:614-702,:705-764`),
`orderRetry.controller.js` (`:31-175`), `marketplace.controller.js` (`:315-499`), `src/services/{orderPayments,checkoutIdempotency}.js`,
`src/utils/{paymentAttempts,cleanupJobs}.js` (`cleanupJobs.js:241-294`), `server.js:82-83`, `src/models/PaymentLedger.js`.
Website: `frontend/src/App.jsx` (`:61-69,:140-141,:256`), `pages/PaymentCallback.jsx` (`:69-133`), `frontend/Dockerfile`, `frontend/public/`.
Mobile: `App.jsx:27-97`, `android/app/src/main/AndroidManifest.xml`, `app.json`, `eas.json`, `src/navigation/{Root,User,Auth}Navigator.jsx`,
`src/screens/user/{PaymentVerify,Cart,BookingFlow,BookingDetail,Bookings,OrderDetail}Screen.jsx`, `src/screens/auth/RegisterScreen.jsx`,
`src/utils/{marketplaceCheckout,orderRetry,checkoutAttempt,sessionCleanup}.js`.
Tests read: `backend/tests/{checkout-integrity,checkout-products,order-payment-retry,stale-order-expiry,legacy-marketplace-payment,payment-mode}.test.js`,
`mobile-app/src/screens/user/__tests__/{PaymentVerifyScreen,CartScreen.checkout,CartScreen.retry,OrderDetailScreen.retry}.test.jsx`, `utils/__tests__/marketplaceCheckout.test.js`, `config/__tests__/androidRelease.test.js`.

## 12. Scope statement

**No Source Changes Made.** This audit created exactly one file, `docs/PAYMENT_RETURN_DEEP_LINKS_AUDIT.md`. No source, test, backend, frontend,
package, lockfile, environment, native-configuration or existing documentation file was modified; nothing was staged, committed, pushed or
deployed; no dependency was installed; no test or backend process was started or interrupted; no payment, refund, order or booking record
was created or changed; no live gateway or hosting endpoint was called; and no secret, credential, signing file, live transaction id or
personal data was read or recorded.
