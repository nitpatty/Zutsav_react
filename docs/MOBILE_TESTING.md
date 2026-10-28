# Mobile App Testing

Foundation for audit finding **F-14**. Scope: `mobile-app/` only.

## Run

```bash
cd mobile-app
npm test            # jest (watch-friendly; pass -- --watch yourself if wanted)
npm run test:ci     # jest --ci --runInBand --watchAll=false  (use in CI)
```

No device, emulator or network is needed.

## Stack (Expo SDK 51 / React Native 0.74.5 / React 18.2.0)

| Package | Version | Why |
|---|---|---|
| `jest-expo` | `~51.0.4` | SDK-51 preset (transform, haste, native-module setup) |
| `jest` | `^29.2.1` | Version range required by `jest-expo` 51 |
| `react-test-renderer` | `18.2.0` | Must equal the installed `react` |
| `@testing-library/react-native` | `^12.9.0` | Component rendering; v12 declares peers `react>=16.8`, `react-native>=0.59` |

Config: `mobile-app/jest.config.js`, `mobile-app/jest.setup.js`. Babel is unchanged
(`babel-preset-expo` + reanimated plugin). Tests live in `src/**/__tests__/*.test.[jt]s(x)`.

## Isolation rules

`jest.setup.js` installs, and resets before every test:

- in-memory `expo-secure-store`
- official in-memory `@react-native-async-storage/async-storage` mock
- `src/config/env` pinned to `https://*.test.invalid` (babel-preset-expo inlines
  `EXPO_PUBLIC_*` at transform time, so env vars cannot be overridden at runtime)
- `global.fetch` that rejects, so an un-mocked call fails loudly

Rules for new tests: mock `src/api/axios` (or set `api.defaults.adapter`) — never hit a
real host; use synthetic fixtures only (no real tokens, emails, payment data); do not rely on
test order (`npx jest --randomize` must pass); no coverage thresholds until a baseline is agreed.
Navigation is not mocked yet — add a `@react-navigation/native` mock when the first
screen/navigator test needs it.

## What is covered (baseline)

- `utils/priceEngine` — fee/GST/kit/urgent-surcharge math, paisa rounding, missing input
- `utils/bookingDateRules` — IST cutoff boundary, urgent window, month/leap/year rollover, invalid input
- `utils/helpers` — booking badge resolution, slot time, amount-in-words, referral URL
- `api/axios` — base URL, Bearer-token attachment, `imageUrl` mapping
- `store/authStore` — login, OTP login, deletion-pending, hydrate, logout, profile helpers (mocked API client)
- `store/authSession` — F-01/F-15 integration through the REAL axios client + stores (stub transport):
  `rememberMe: true` payloads, 401 expiry cleanup, concurrent-401 idempotency, stale-token 401,
  credential-endpoint 401s, 403/5xx/offline/timeout keep the session, `refreshUser`,
  logout cleanup, User A → User B isolation
- `utils/sessionCleanup` — what is cleared vs preserved, idempotency, partial-failure reporting,
  in-flight requests from the previous account
- `navigation/RootNavigator.session` — real `RootNavigator` (child navigators stubbed): User/Pandit
  stacks return to Auth after a confirmed 401, not after a network error
- `screens/user/BookingDetailScreen` — F-10 rating payload (`review`, not `comment`; stars, trimming,
  duplicate-tap guard, failure) and F-23 cancel eligibility + refund-preview/cancel flow
- `screens/user/BookingsScreen.cancel` — F-23 Cancel link in the list
- `utils/bookingRules` — F-23 list, plus a drift guard that reads the backend's
  `USER_CANCELLABLE_STATUSES` (read-only; skipped if the backend folder is absent)
- `screens/pandit/PanditRatingsScreen` + `utils/panditRatings` — F-11 real response shape
- `screens/user/LivestreamsScreen` + `utils/livestream` — F-12 real fields, safe YouTube-only open
- `screens/user/TemplesScreen`, `TempleDetailScreen` + `utils/temple` — F-13 real fields, gallery/viewer
- `utils/bookingInvoice` + `screens/user/InvoiceScreen` — F-02 official persisted booking invoices:
  endpoint, invoice number/date/status, stored amounts + GST split, customer/seller snapshot, multiple
  invoices (selector, per-invoice PDF), empty/error/retry, no recalculation from live catalog, and static
  guards that no code calls the legacy endpoint and no Pandit screen opens the customer invoice
- `BookingDetailScreen` rating eligibility — "Rate this Pooja" only for a completed booking with no `rating`
- `utils/marketplaceCheckout` + `screens/user/CartScreen.checkout` — F-03 unified checkout: payload is ids +
  quantities only, `/checkout/cart` (never the legacy endpoint), server payable shown, double-tap lock, cart kept
  on failure, no local "paid" claim
- `screens/user/PaymentVerifyScreen` — verify endpoint per transaction family, pending/failed/success/timeout/retry
- `screens/user/OrderScreens` — order history/detail navigation, server-stored GST display, invoice access
- `components/ui/Badge` — RNTL render smoke test

Backend retry/expiry (isolated, local `*_test` DBs only): `node --test tests/order-payment-retry.test.js tests/stale-order-expiry.test.js
tests/legacy-marketplace-payment.test.js`.

Backend (isolated): `cd backend && node --test tests/checkout-products.test.js tests/checkout-integrity.test.js` — runs the real
`cartCheckout`/`verifyCartPayment` controllers against a **local `*_test` database only** (the file refuses any
other URI) with PhonePe stubbed. It pins the variant sale-price rule, per-product tax, ignored client money
fields, stock/availability errors, the response contract and verify idempotency/ownership. It does not run the
rest of the backend suite.

## Not covered / known gaps

- **Partial-payment amounts** are computed inline in `screens/user/BookingFlowScreen.jsx`
  (min amount, `< grandTotal`, percentage options), not in `priceEngine`. They need extracting
  into a util before they can be unit-tested; deliberately not done under F-14.
- Only `RootNavigator` has a navigation test (child navigators stubbed). No individual screen,
  socket, or E2E (Maestro/Detox) tests yet.
- Jest passing and `expo export` succeeding do **not** verify runtime behaviour on a device.

## Session & per-user state (F-01 / F-15) — behaviour the tests pin

- Both login methods send `rememberMe: true`. Backend: `true` → `JWT_EXPIRES_IN_REMEMBERED`
  (code default `30d`), otherwise `JWT_EXPIRES_IN_SESSION` (default `1d`). The production values
  were not inspected; the app encodes no duration. Admin-tier tokens ignore the flag.
- A 401 is a confirmed expiry only if the request carried a Bearer token that is still the
  current stored token, and the URL is not `/auth/login`, `/auth/delete-account/check-password`
  or `/auth/logout` (those 401 for wrong credentials). Then `authStore.expireSession()` →
  `clearSession()` → `utils/sessionCleanup.clearLocalSession()`; `RootNavigator` falls back to Auth.
- 403, timeouts, offline and 5xx never clear the session. `refreshUser` resolves `null` after a
  confirmed 401 and **rethrows** every other error.
- Cleared on logout/expiry: SecureStore `zutsav_token`, `zutsav_user`; AsyncStorage `zutsav_cart`
  and all `zutsav_cache_*`; cart, notification, pandit-status stores; geocoding cache; socket.
  Preserved: AsyncStorage `zutsav_theme`, SecureStore `zutsav_language`, any other key.
  Adding a new per-account key or store? Add it to `utils/sessionCleanup.js` and a test.

## Invoice contract (F-02) and Pandit documents

- Customer booking invoice: `GET /api/invoices/booking/:bookingId` → `{ success, booking, invoices[] }`
  (authenticated; owner or admin only; oldest first; includes cancelled/archived; creates legacy invoices on demand
  for old paid bookings; returns `[]` for a booking with no successful payment). Same API as the website's
  `InvoicePage`. `GET /api/invoices/number/:no` (owner/admin; manual invoices admin-only) exists but is not needed
  on mobile. The legacy `GET /api/bookings/:id/invoice` returns `{ booking, paymentLedger }` (no invoice
  documents) and the website does not use it — mobile no longer does either.
- Booking invoices persist totals, payment amounts, `gstBreakdown` and a customer/booking snapshot. They do **not**
  persist line items or a seller snapshot (only manual invoices do), so — like the website — lines are derived
  from the booking with persisted amounts, and the seller is the shared company config unless a `sellerSnapshot`
  is present.
- **Pandit:** there is no Pandit invoice. The website has no Pandit entry to `InvoicePage`, no Pandit screen
  navigates to `Invoice` (a route is registered in `PanditNavigator` but unreachable), and the persisted-invoice
  endpoints answer 403 to a non-owner. Pandit earnings documents are the Earnings screens/`/pandits/me/*` APIs.
  Backend note for the owner (not changed): the legacy `/bookings/:id/invoice` also authorises the *assigned
  Pandit* and returns the whole booking plus successful payment-ledger rows; nothing in either client uses that.

## Marketplace checkout contract (F-03)

- `POST /api/checkout/cart` (authenticated) — mobile sends `{ products: [{ productId, variantId?, quantity }],
  shippingAddress }` only. The server prices every line: `variant.salePrice ?? variant.price` for variant lines,
  `product.salePrice ?? product.price` otherwise; tax = the product's own `taxRate`; it also checks stock and
  availability. Response `201 { success, merchantTransactionId (ZUT_CART_…), redirectUrl, order, bookings, totals:
  { bookingTotal, productTotal, combinedTotal } }`; `order.items[]` carry `price, taxRate, taxAmount, total`.
- `GET /api/checkout/verify/:txn` (owner only) → `{ success:true, order, alreadyVerified? }` or `{ success:false,
  code, state, order }`. The app picks the verify route by transaction family (ZUT_CART_ → `/checkout/verify`,
  an older ZOM_ order → its legacy route), as the website's PaymentCallback does. Success = the server's answer only.
- The cart is cleared right after the server accepts the order (the order then exists as `pending_payment`) — same
  as the website. A failed request keeps the cart.

## Checkout integrity hardening (post-F-03)

Backend (`checkout.controller.js`, `models/CheckoutRequest.js`, `services/checkoutIdempotency.js`):

- **Eligibility** (same rules the shop lists and the legacy endpoint enforced): a product must exist, be active, not
  `isDeleted`, and not `visibilityType: 'kit_only'`; a `variantId` must be one of that product's own active variants;
  quantity must be a whole number ≥ 1 (0 / negative / fractional / text used to be silently turned into 1); stock is
  checked against the TOTAL requested across duplicate lines. An unavailable item now **rejects the cart (400)** —
  it used to be silently dropped while the customer was charged for the rest. *This applies to every caller of
  `/checkout/cart`, including the website (no website code changed).*
- **Variant label** (`"500g"`) is snapshotted on `order.items[].variantLabel`; prices/tax are unchanged.
- **Timeline / notification:** the order is created with a `pending_payment` entry; payment confirmation is one atomic
  `pending_payment → paid` update that also pushes the `paid` entry, so verify + webhook racing (or repeated verifies)
  record and deduct stock exactly once. `ORDER_PLACED` (the event the legacy endpoint emitted at creation) is emitted
  once, only after the request fully succeeded — never for a rejected request, never on a replay. By default it is inert:
  its transactional email is deliberately "default skip" and `ORDER_CONFIRMED` (sent when an admin confirms) is the
  approved customer email. `ORDER_PAID` exists in the registry but nothing emits it.
- **Idempotency** (opt-in, so the website is unaffected): send `idempotencyKey` (body) or `Idempotency-Key` (header),
  16–128 chars of `[A-Za-z0-9_.:-]`. A unique index on `CheckoutRequest { userId, operation, key }` makes the claim
  atomic across workers/restarts. Same key + same cart → the original result (`200 { idempotentReplay: true }`, with the
  payment link only while still unpaid); same key + different cart → `422 IDEMPOTENCY_KEY_REUSED`; another request holds
  the claim → `409 CHECKOUT_IN_PROGRESS` (+ `Retry-After`); an attempt that saved the order but failed at the gateway is
  **resumed** for the same order/transaction id (`201 { resumed: true }`); an expired lock left by a crashed worker is
  taken over with a single conditional update and never builds a second order. Validation failures release the key.
  Rows hold only a SHA-256 fingerprint (no cart, address or credentials), the payment-page URL, and expire after 24 h.
  Mixed carts that contain pooja bookings are covered by the claim, but a crash mid-way through booking creation
  answers `409 CHECKOUT_STATE_UNKNOWN` rather than guessing (no client sends bookings with a key today).

Mobile (`utils/checkoutAttempt.js`, `CartScreen`): one key per logical attempt, persisted in AsyncStorage
(`zutsav_checkout_attempt`, cleared on logout/expiry), reused while the cart + address are unchanged and the outcome is
uncertain (no response / timeout / 5xx / "still processing"); discarded after a definitive outcome (order created, or a
4xx rejection). A changed cart is a new attempt.

Deployment notes: `CheckoutRequest` is a **new collection** — no migration and no change to existing `Order` data or
indexes. Its indexes (unique + TTL) are created by Mongoose `autoIndex` (the project default; nothing sets it to false),
instantly on an empty collection; if a deployment disables `autoIndex`, run `CheckoutRequest.createIndexes()` once. No
transactions or replica set are assumed. Duplicate prevention was tested with concurrent same-key requests against a real
MongoDB (see `backend/tests/checkout-integrity.test.js`); it has not been exercised against the real PhonePe.

## Marketplace payment retry and stale-order expiry

**Retry** — `POST /api/checkout/orders/:id/retry-payment` (`backend/src/controllers/orderRetry.controller.js`), owner only.
Body: `{ idempotencyKey }` (REQUIRED, 16–128 chars) — nothing else is read: no amount, items or prices. It starts a NEW payment
attempt for the SAME order: the order id/number/items/stored tax/shipping/owner/`createdAt` never change and the gateway is
charged the order's persisted `totalAmount`; today's catalog and tax settings are never consulted.
- Answers: `201 { orderId, merchantTransactionId, redirectUrl, order, attempt }`; `200 … idempotentReplay` for a repeat of the
  same key (same attempt and link, no second gateway transaction); `404 ORDER_NOT_FOUND` for an unknown order **and** for someone
  else's (identical bodies — nothing leaks); `409` `ORDER_ALREADY_PAID` / `ORDER_EXPIRED` / `ORDER_CANCELLED` / `ORDER_NOT_PAYABLE`
  / `PAYMENT_IN_PROGRESS` (an earlier attempt is still pending at the gateway; body carries its transaction id) /
  `CHECKOUT_IN_PROGRESS` (same key still being set up); `422 IDEMPOTENCY_KEY_REUSED` (key used for another order);
  `503 PAYMENT_STATUS_UNKNOWN` (the gateway could not confirm the earlier attempt — no new attempt is ever opened on a guess).
- Transaction ids are `ZUT_CART_RETRY_<ms>_<user6>_<random8>`: they keep the `ZUT_CART_` prefix, so the app's verify routing and the
  checkout webhook work unchanged, and the random suffix keeps ids unique even for two retries in the same millisecond.
- History: `Order.paymentAttempts[]` (append-only; `PENDING | SUCCESS | FAILED | INITIATION_FAILED`, gateway code/state, timestamps,
  `needsReconciliation`). `order.phonePeMerchantTransactionId` tracks the current attempt; verify/webhook (new **and** legacy `ZOM_`)
  find an order by ANY attempt's transaction id. A timeline line records each retry.
- Concurrency (all persistent; no process-local state, no MongoDB transaction assumed): the key claim is a unique-indexed
  `CheckoutRequest` row (`operation: order_retry_payment`); the attempt is allocated by ONE conditional update that requires
  `pending_payment` and no PENDING attempt (so two keys/devices cannot both open one, and a retry cannot slip in after the order was
  paid/expired/cancelled); before allocating, every earlier PENDING attempt is checked with the gateway (paid → settle + refuse;
  pending → refuse; unclear → refuse). A gateway failure leaves the attempt `INITIATION_FAILED` and the same key resumes it with the
  same transaction id. Success is only ever set by verify/webhook.

**Expiry** — `services/staleOrderSweep.js`, scheduled from `utils/cleanupJobs.js` (same `setInterval` pattern as the existing payment
sweep, every 10 min). **OFF unless `MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES` is set** (whole number ≥ 30; unset → disabled and no timer is
scheduled; malformed → disabled + a startup warning). No default is invented (the 24 h `CheckoutRequest` retention is an idempotency
window, and the existing 30-min value only decides when to *ask the gateway*). The same setting makes retry refuse orders older than the
limit; retry never extends it (the clock runs from the original `createdAt`).
An order is closed only if it is still `pending_payment`, older than the limit, the gateway has been asked about EVERY attempt that could
hold money and all are terminal without payment (or never reached the gateway), and none is PENDING/SUCCESS. Anything uncertain
(gateway error, no state, still PENDING) is left alone; a confirmed payment is settled as **paid** instead. The change is one atomic
conditional update that sets the existing status **`payment_failed`** (already rendered by the website and mobile; `cancelled` would imply
a customer/admin action and inflate cancellation stats) and writes the timeline entry — so repeated runs, several workers, or a racing
payment confirmation cannot duplicate or overwrite anything. Orders and attempts are never deleted; **no stock is touched** (marketplace
stock is deducted only after verified payment, and admin cancel restores it only for paid statuses, so an unpaid order holds no
reservation); no customer notification is sent (no approved template exists).

**Late / duplicate payments (explicit policy)** — a SUCCESSFUL gateway payment that cannot be applied (order already expired/closed,
cancelled, or paid by a different attempt) is never lost and never reopens the order: the attempt is marked `SUCCESS` with
`needsReconciliation` + a reason (`PAID_AFTER_EXPIRY`, `PAID_AFTER_CANCELLATION`, `DUPLICATE_PAYMENT`), one timeline line is written,
an error is logged (`[OrderPayments] RECONCILE …`), and verify answers `{ success:false, code:'PAYMENT_NEEDS_REVIEW', reconciliation }`
(the app tells the customer not to pay again). **There is no refund API or admin screen for marketplace payments** — settling these is
manual: find them with `db.orders.find({ "paymentAttempts.needsReconciliation": true })`, then refund through the PhonePe dashboard and/or
restore the order by hand. Recommended: an admin "payments needing review" list and a gateway-refund action (not built here).

**Mobile** — `OrderDetailScreen` offers *Retry Payment* only while the server says the order is `pending_payment`; it sends only the key,
reuses it after an uncertain outcome (timeout/network/5xx/"still setting up", survives an app restart) and discards it after a definite
answer; ignores duplicate taps (ref lock + disabled button); opens only an `https` link; then goes to `PaymentVerify` with the new
`ZUT_CART_RETRY_…` id (verified on `/checkout/verify`). Closed/cancelled orders show why. The order is re-read from the server on focus.

**Deployment notes** — new env key `MARKETPLACE_PENDING_ORDER_EXPIRY_MINUTES` (documented in `backend/.env.example`; leave unset to keep
expiry off). `Order` gains `paymentAttempts` (additive, defaulted) and three **non-unique** indexes (`phonePeMerchantTransactionId`,
`paymentAttempts.merchantTransactionId`, `{status, createdAt}`) built by Mongoose `autoIndex` on first start — safe on existing data, but on a
very large `orders` collection create them first during low traffic. No data migration: older orders simply have no attempt history and are
handled (their current transaction id is recorded as an attempt the first time it is needed). A malformed expiry value never stops startup.
Not exercised against the real PhonePe: whether PhonePe reports abandoned pay-page transactions as terminal (rather than PENDING) decides
how soon such orders become expirable; until it does they are left pending, by design.

Still open: payment-retry for orders created together with pooja bookings in one cart retries only the order's own payable (the bookings
keep their own retry via `/bookings/:id/retry-payment`); the old combined transaction is reconciled first so the order cannot be paid twice
silently.

## Legal documents and dynamic footer links (F-04)

**Access.** Settings → "Legal & Resources" (`LegalResources` route). Pandit Settings renders the same `SettingsScreen`, and both
`UserNavigator` and `PanditNavigator` register `LegalResources` and `LegalDocument`. An *unapproved* Pandit sits behind
`PanditGateNavigator`, which has no Settings at all (approval rules unchanged), so they do not reach this screen.

**Endpoints (all public, no auth, no backend change):**
- `GET /api/documents` → `documents[{documentType,label,exists,originalName,mimeType,size,updatedAt,viewUrl}]`. Only the five whitelisted types
  with `exists:true` and `viewUrl === /api/documents/<type>/view` are listed; titles come from the server.
- `GET /api/documents/:type` and `GET /api/documents/:type/view` – detail and the file (opened outside the app).
- `GET /api/settings/public` → `settings.footerLinks[{id,label,linkType:'url',url}|{id,label,linkType:'document',path}]` (enabled only, server order).
- `GET /api/footer-links/:id` → `{document:{exists,label,mimeType,kind,fileName,size,viewUrl,downloadUrl}}`, then `viewUrl`/`downloadUrl`.

**Refresh.** Module-local cache in `services/legalResourcesService.js` (60 s TTL, not cleared on logout because it is public data, no new store).
Concurrent callers share one request; pull-to-refresh and Retry force a reload; returning to the screen reloads only if the cache expired; a failed
refresh keeps the last good data with a notice. Documents and links load and fail independently.

**File handling (no new dependency, no native rebuild – core `Linking` + `Image`):** a PNG/JPEG/GIF/WebP custom file is shown in the app; PDF is
opened in the device viewer (plus Download); Word/Excel/other files are offered as a download with a "cannot be previewed" message. Nothing
uploaded is rendered or executed in the app. Fixed documents are PDF/DOC/DOCX, opened/downloaded through their `/view` route.

**Security.** Admin URLs must pass `safeHttpUrl` (http/https, no credentials/control chars/whitespace, ≤2048) at list time and again at tap time;
`javascript:`, `intent:`, `file:`, `data:`, `tel:`, app schemes are dropped. File routes must match `/api/footer-links/<16hex>/(view|download)` or
`/api/documents/<whitelisted>/view`, built on the configured server origin; storage paths (`/uploads/...`) and KYC routes are never requested.
Route params are validated before any request. No URL is logged.

**Not covered / limitations.** No in-app PDF viewer (PDF opens externally). Behaviour was verified by Jest with mocked APIs and an Android
bundle export only – not on a device or emulator, and not against a live server. Backend footer-link / legal-document behaviour is covered by the
existing backend tests (`footer-links.test.js`, `legal-documents-viewer.test.js`).

## Android release hardening and Google Maps (F-24 / F-16)

Full guide: `docs/ANDROID_RELEASE_AND_MAPS.md`. Tests: `src/config/__tests__/androidRelease.test.js` (static guards on the committed
`android/` manifest and Gradle file: cleartext only in the debug overlay, backup off, no `RECORD_AUDIO`/`SYSTEM_ALERT_WINDOW` in release,
release never debug-signed, no Google Maps configuration and no Ola/Google key anywhere in the app — Ola Maps is backend-only),
`src/utils/__tests__/mapConfig.test.js`, `src/components/shared/__tests__/MapPicker.test.jsx` and `MapPicker.android.test.jsx`
(map available / map not mounted on Android with GPS fallback / invalid coordinates).
These do not compile native code; no emulator, device, release build or real Ola account was available.

## Location entry: GPS + backend search, no embedded Android map (Day 10)

Architecture and evidence: `docs/MAPS_ARCHITECTURE_AUDIT.md`. The app reuses the existing authenticated backend endpoints
(`GET /location/autocomplete`, `/location/reverse-geocode`; paths are relative to the client's `/api` baseURL) and holds no
Ola/Google key. Android has no interactive map (the Google-backed `react-native-maps` view is not mounted); iOS keeps its map.
The "Maps" quick action (`utils/quickActions.js`) is a separate external `google.com/maps` link and is unchanged.

**Rules (utils/locationPin.js, hooks/useLocationPin.js):**
- A *pin* (latitude + longitude) is attached by an explicit action (search suggestion, GPS, map confirm) or loaded from a saved address.
- Address identity = `address, pincode, city, state, district`. A *manual* edit that changes one of them makes the pin stale
  (saved as `null / null`); search autofill, pincode lookup (`PincodeInput.onFill`) and loading/opening a saved address never do.
- A new search pick or GPS fix attaches a new pin and clears the stale state. Coordinates are always sent as a whole pair or two nulls.
- Trade-off (strict by design): typing a pincode *after* picking a suggestion that had no pincode component clears the pin;
  enter the pincode first or pick again. `AddressPicker` (controlled by booking/checkout) emits `latitude: null, longitude: null`
  on a manual edit so every parent is correct without an extra flag.
- `autocompletePlaces` returns `{found, results[{label,lat,lng,placeId,components}]}`, `{found:false}` (no match),
  `{found:false, unavailable:true}` (outage / 429 / 5xx / offline / HTTP-200 `success:false`; retry offered) or
  `{found:false, sessionExpired:true}` (401; the shared client's sign-out handling runs, the search UI stays quiet).
- The unused forward-geocode cascade (`geocodeLocation`) was removed; `GET /location/geocode` remains available on the backend.

**Tests:** `utils/__tests__/locationPin.test.js`, `services/__tests__/geocodingService.test.js`,
`components/shared/__tests__/{LocationSearch,MapPicker,MapPicker.android,AddressPicker.location,AddressFormSheet.location}.test.jsx`,
`screens/user/__tests__/{PersonalInfoScreen.location.test.jsx,BookingFlowScreen.location.test.js}`,
`screens/pandit/__tests__/PanditAddressScreen.location.test.jsx`. `BookingFlowScreen` is covered by wiring guards plus the
`AddressPicker` merge-style harness, not an end-to-end submit (the wizard is too large to drive here). No device, emulator,
iOS map, real GPS or live Ola call was available.

## Payment return resilience — mobile F-06 (Day 12)

Basis: `docs/PAYMENT_RETURN_DEEP_LINKS_AUDIT.md`. Mobile only: no backend, website, PhonePe, hosting, App Link or `assetlinks.json` change.
The app cannot count on the browser/PhonePe returning to it (the backend's `redirectUrl` is the login-gated *website* page), so it
remembers the payment and **asks the server** whenever it can.

- **Recovery record** (`utils/paymentRecovery.js`, key `zutsav_pending_payments`, versioned): `{ userId, type, merchantTransactionId,
  bookingId | orderId, createdAt, updatedAt }` only — no amount, address, token, payment URL or query. Up to 5 per user, 3-day retention,
  bound to the signed-in account; another account's / malformed / expired records are dropped; cleared on logout and session expiry
  (`sessionCleanup`). A payment abandoned by logging out is not resumed automatically (privacy over convenience): the booking/order is still
  in the customer's own lists. A storage failure never blocks a payment or changes a verdict.
- **Hand-off** (`openPaymentPage`): validate the URL (`utils/paymentUrl.js`: https only, no credentials, no non-443 port, real DNS host,
  no IP/localhost/custom scheme) → save the record → open it. Used by cart checkout, marketplace retry, booking pay/retry/remaining and
  `PaymentVerify` retry. **Host allow-list: not enforced** — the repository establishes PhonePe's API hosts only, not the hosted pay-page host
  (and mock mode returns a website URL); `allowedHosts` exists for when the owner confirms them.
- **Verification** (`verifyTransaction`): the existing routes — booking `/bookings/verify-phonepe`, remaining `/bookings/verify-remaining`,
  checkout `/checkout/verify` (`ZUT_CART_` and `ZUT_CART_RETRY_`), legacy `/marketplace/orders/verify-phonepe` (`ZOM_`). One in-flight
  request per transaction, shared by the launch check, the foreground check and an open `PaymentVerify`. Only `success`/`alreadyVerified`
  from the server is "paid"; a non-PENDING gateway state is "failed"; everything else (pending, 404, offline, 5xx) is "pending" and keeps the record.
- **When it runs** (`hooks/usePaymentRecovery` in `RootNavigator`): after the session is restored and a customer is signed in — on launch and on
  every return to the foreground; throttled (5 s), ≤ 3 transactions per run, no loop. It never navigates: a confirmed outcome gives a short
  notice; an unconfirmed one leaves the record and the `PendingPaymentBanner` ("Check status") on My Bookings / My Orders / the booking / the order.
- **`PaymentVerify`**: no requests while backgrounded; a guarded check the moment the app returns; the 20 × 3 s window ends in "Still Confirming"
  (never "failed"), the record is kept, and returning to a timed-out screen starts a fresh bounded window.
- **`alreadyInFlight`** (booking retry) and the 409 of pay-remaining now resume verification of the transaction **the server returned** instead of a
  dead-end toast; with no usable id nothing is invented. Payment creation is never repeated.
- **Duplicate booking creation** (`utils/bookingSubmitGuard`, `BookingFlowScreen`): rapid taps → one request; once created, a second tap re-presents
  that booking's payment prompt (the prompt is not dismissable by accident); an answer-less failure (timeout/offline) asks the customer to check
  My Bookings before an explicit "Try Again Anyway". **Client-side only** — it cannot make the server's creation atomic; a server idempotency key
  for `/bookings/create-phonepe-order` is a separate, unapproved backend task.

**Deferred (not done here, not fixed by these changes):** F-18 Android App Links / `assetlinks.json` / canonical host / signing fingerprints; the
website callback requiring a website login; a lost webhook for a booking (the sweep skips successful payments; the app now recovers it only when the
customer's own device re-checks); booking webhook/cart webhook answering 200 on internal errors; the non-atomic booking verify/webhook race;
`retry-payment` answering `alreadyInFlight` without re-checking the gateway.

**Tests:** `utils/__tests__/{paymentUrl,paymentRecovery,bookingSubmitGuard}.test.js`, `hooks/__tests__/usePaymentRecovery.test.jsx`,
`components/shared/__tests__/PendingPaymentBanner.test.jsx`, `screens/user/__tests__/{PaymentVerifyScreen.recovery,BookingDetailScreen.payment}.test.jsx`
and the wiring guard `PaymentLaunch.wiring.test.js`. Not verified: a real PhonePe payment, a physical device / emulator (backgrounding, process
kill, JS timers while backgrounded), the dismissal behaviour of the Android alert, `CartScreen`/`OrderDetailScreen`/`BookingFlowScreen` end-to-end
hand-off (covered by the existing screen tests plus the wiring guard and the shared helper's tests).

## F-07 Phase 1 — persisted discount display, wallet and coin tests (Day 14)

Mobile-only and read-only: no API, backend, payment or checkout behaviour changed (see `docs/MOBILE_F07_CHECKOUT_PARITY_AUDIT.md`).

- **Display.** `utils/discountDisplay.js` offers a row only when the record itself carries a recorded value:
  Booking → `couponCode` + `couponDiscount > 0`, and `coinCoins > 0` + `coinValue > 0`; Order → `couponCode` +
  `couponDiscount > 0` only (the Order schema has no coin fields, so no coin row is ever shown for orders).
  Values must be finite positive numbers; nothing is inferred from totals. `Booking.grandTotal` and `Order.totalAmount`
  are stored **after** the discount (`create-phonepe-order` stores `grandTotal: payableTotal`; the cart path subtracts
  the share before saving), so totals are shown unchanged and the rows are informational
  (booking: "Coupon (CODE) ₹X off"; order: "Coupon (CODE) −₹X" between GST and Total).
- **Tests** (`screens/user/__tests__/`): `DiscountDisplay.test.jsx` (helpers + both detail screens, retry entry point
  kept), `WalletScreen.test.jsx` (contract, configured rate/threshold, null rate, history, failures),
  `WalletScreen.session.test.jsx` (real shared API client: Bearer token, 401 → session-expiry handler, anonymous 401 and
  5xx do not expire), `BookingFlowScreen.coins.test.jsx` (drives the real wizard to Review: eligibility, bounds,
  `coinRedemptionCoins` payload, server `chargeAmount` in the prompt, rejection, repeated taps).
- **WalletScreen tests render inside `I18nProvider`**, as `App.jsx` does. Without it `useTranslation()` returns a new `t`
  each render and the screen's `useCallback([t])` fetchers re-run forever (out-of-memory in Jest). Not a production
  bug while the provider stays mounted, but the screen depends on `t` being stable.
- **Known limitations recorded, not changed:** the wallet screen requests page 1 only (`limit=20`, no load-more, no
  type/direction filters), has no retry button or pull-to-refresh (the locale has an unused `wallet.retry`), shows
  "No Transactions Yet" when only the history request fails, and uses an invalid Ionicons name (`coins-outline`) for
  unknown transaction types. In `BookingFlowScreen`, `chargeAmount: data.chargeAmount || grandTotal` falls back to the
  local estimate if the server omits it (the server always returns it today).
- **Flaky existing test:** `utils/__tests__/checkoutAttempt.test.js` "persists the key but not the cart or address in
  clear text" asserts the stored JSON does not contain `p1`, but the random idempotency key can contain that substring
  (≈1.75 % of runs). Seen once in three randomized runs on Day 14; unrelated to this phase and not edited.

## Day 15 — booking charge safety, test reliability, wallet history errors

Mobile-only; no backend, API, payment-recovery or pricing change. Resolves three of the Day 14 observations above
(the wallet page-1-only / no-retry limitations stand).

- **Booking charge is server-authoritative.** `utils/bookingCharge.js` `readBookingCharge()` replaces
  `chargeAmount: data.chargeAmount || grandTotal`. Contract (`createPhonePeBooking`): a gateway payment returns
  `redirectUrl` + `chargeAmount` (> 0, full or partial); a fully coin-covered booking returns `paidWithCoins: true` with
  **no** `redirectUrl` / `chargeAmount` and is settled inline by the server. Result kinds: `pay` (link + finite
  `chargeAmount > 0`), `settled` (explicit `paidWithCoins === true`, no link), `invalid` (everything else: missing,
  null, 0, negative, NaN/Infinity, numeric string, link without amount, no link without `paidWithCoins`). `invalid`
  never opens PhonePe and never shows a payment prompt: the booking id the server returned is kept and the user is taken
  to its detail screen with "We could not confirm the amount to pay…". The duplicate-submit guard and the "no response →
  check My Bookings" flow are unchanged (no automatic re-submit). `paidWithCoins` alone is not trusted when a payment
  link is present. Tests: `utils/__tests__/bookingCharge.test.js` and the "server-authoritative charge amount" block in
  `BookingFlowScreen.coins.test.jsx` (partial payment included).
- **`checkoutAttempt` test no longer flaky.** The old assertion scanned the whole stored JSON for `p1`/`v1`, which the
  random key (`zc_<time>_<3×base36>`) contains by chance (≈1.75 % of runs). The scan now excludes the random key, with
  a fixed `now`, and the key is validated separately against the server's format; a test forces a key containing
  `p1`/`v1` (mocked `Math.random`) to prove the former false failure is gone. Production key generation is unchanged.
- **Wallet history failure ≠ empty history.** `WalletScreen` tracks `txError`; a failed history request (including a
  401, which still reaches the shared client's session-expiry handler) shows `wallet.historyError` instead of "No
  Transactions Yet", and the loaded balance stays visible. The unknown-type icon is now the valid Ionicons
  `help-circle-outline` (was `coins-outline`, which does not exist). No retry control or pagination was added.

## Day 17 — F-08 localization, phase 1 (framework, preference, API content, core UI)

Mobile-only. Plan and evidence: `docs/MOBILE_LOCALIZATION_AUDIT.md`. **This is the first batch, not a localized app.**

- **Framework (custom layer kept, no dependency):** `src/i18n/` = `locales/` (catalogue + dictionaries), `translate.js`
  (lookup, safe interpolation, one stable `t` per language — also without a provider), `languageStore.js` (device
  language, SecureStore `zutsav_language`), `languagePreference.js` (account sync). English is the default and the
  fallback; a missing key falls back to English (dev warning naming only the locale and key; silent for the
  not-yet-translated `wallet`/`referrals` namespaces); interpolation inserts values literally (`$&` is safe).
  *Supported* codes (the 11 the backend knows) are separate from *available* ones (those with a dictionary — the only
  ones the picker lists and the only ones the UI can switch to).
- **Languages with a first-batch dictionary:** hi, mr, gu, ta, te, kn, ml, bn, pa, or (+ en). Covered keys: `common`,
  `nav`, `settings`, `auth` (103 keys each). 48 per locale are taken from the website's committed dictionary where the
  meaning matches; 55 per locale are new, mobile-specific text. **No native-speaker review has been done** — treat
  every non-English string as a first draft. `__tests__/localeParity.test.js` fails on a missing/extra key, a changed
  placeholder, an untranslated copy of English, or a key used in code that English lacks.
- **Preference:** startup waits for the local read (`App.jsx`, with a 3 s guard) before the first frame; the account's
  `preferredLanguage` wins at password/OTP login, registration and `getMe`, but only when it is a usable value (a missing,
  unsupported or region-tagged value keeps the device language); a refresh never reverts a choice the server has not
  accepted yet. Switching (Settings → App Language) persists locally first, then `PATCH /auth/preferred-language` when
  signed in — one request in flight, last choice wins, nothing re-sent when unchanged, failure keeps the local choice,
  shows a localized info toast and never touches the session. Registration sends `preferredLanguage` (the language in effect).
  `zutsav_language` stays device-level and survives logout / session expiry.
- **API content:** `api/contentLanguage.js` adds `?lang=<code>` to GET requests only, never for English, only for the 11
  supported codes, never overriding a caller's own `lang` (params or URL), no `Accept-Language`. Content screens
  (dashboard, poojas, marketplace, temples, festivals, livestreams, blogs/blog detail, notifications, Pandit dashboard) refetch
  on a language change; the offline cache keys include the language (English keeps the old key) and the notification
  store drops the old list and ignores late old-language responses.
- **Deliberately not translated here (legal / product decisions):** the WhatsApp consent wording on the password
  screen (approved legal text; the same English text is what the request records), invoices, admin screens, API-originated
  error text (shown as-is when present; the fallback is localized).
- **Test harness:** `jest.setup.js` resets the language store before every test, so a language never leaks between tests.
- **Still English / pending:** everything not listed above — booking flow, bookings, marketplace/cart/orders, profile and
  addresses, Pandit screens, wallet/referrals (keyed, English only), legal screens, notifications screen text, location
  picker, forgot/reset password and OTP-login screens, splash. Detail screens that receive their item through navigation
  params (product, temple) and a few secondary lookups do not refetch on a language switch (listed in
  `contentLanguage.integration.test.jsx`). Dates still use English month names and `en-IN` formats. A guest can only
  change the language after signing in (Settings); there is no picker on the login screen.
- **Known behaviours to review:** the backend defaults every account to `en`, so signing in to an account that never chose
  a language switches a device-chosen language back to English (same rule as the website). An unsynced choice survives
  only for the running session.

## Day 18 — F-08 localization, phase 2 (profile, addresses, location, wallet, referrals)

Mobile-only, display text only. **Still not a fully localized app.** Phase 1 notes (framework, preference, `?lang=`) are in the Day 17 section.

- **Covered (all 11 locales — `en` + the 10 dictionaries):** Profile, Personal Information, Change Password, Saved Addresses
  (Address Book, address picker, add/edit sheet, address card), location search, pincode lookup, the map / current-location
  picker, Wallet and My Referrals. Dictionaries now hold 245 keys per locale (`common`, `nav`, `settings`, `auth`,
  `profile`, `address`, `location`, `wallet`, `referrals`); `TRANSLATED_NAMESPACES` (`i18n/locales/index.js`) lists them and
  `localeParity.test.js` fails on any missing/extra key, changed `{{placeholder}}`, English copy or unused new key.
- **Translation provenance:** 75 of the 245 strings per locale come from the website's committed dictionary where the meaning
  matches; 170 were written for this app. Two were deliberately NOT taken from the website because the meaning differs in context
  (address label "Home" = a residence, not the "home page"; pin source "Search" = a noun, not a button). **No native-speaker review
  has been done for any of it.**
- **Data vs display:** saved-address labels `Home` / `Office` / `Other` are API values — only their display is translated
  (`utils/addressLabels.js`); a custom label is shown as typed. Role badges follow `user.role`, not the language. Place names,
  addresses, pincodes, coordinates, referral codes and links are never translated. `formatPinLabel(coords, source, t)` takes an
  optional translator (the English text is unchanged without one); "GPS" is kept as an acronym.
- **Errors:** client-generated messages are localized; a usable server `message` is still shown as-is (`utils/apiMessage.js`).
- **Referral share text** is now written in the sender's language around the unchanged link (the recipient may not read it —
  product decision). `Earn +10 coins per referral` still says "+10" as before (it is not read from the settings response).
- **Behaviour note:** `WalletScreen` and `MyReferralsScreen` build their fetch callbacks on `t`, so a language switch re-reads
  `/wallet`, `/wallet/transactions` and `/user-referrals/my` (GETs only; no writes). No other new request was added.
- **Test limitation:** the referral **Copy Link** action uses `await import('expo-clipboard')`, which Jest cannot execute, so
  under test the screen's own fallback (an alert showing the link) runs. The clipboard-success branch is not exercised here.
- **Still English / pending:** Family Members, Delete Account, forgot/reset password, OTP login, Pandit address/profile screens
  (they reuse the now-localized shared address/location widgets but have their own English text), booking, orders, cart,
  payments, legal, notifications screen text, Pandit workflows, invoices, admin; dates/month names and number formats
  (`date-fns`/`toLocale*` untouched); the `en-IN` date in the deletion-pending card.

## Day 19 — F-08 localization, phase 3 (home, pooja discovery, temples, festivals, livestreams, Panchang)

Mobile-only, display text only. **Still not a fully localized app.** Phases 1–2 are described above.

- **Covered (all 11 locales):** Home/Dashboard, Pooja list (+ its Show More / Show Less), Temples list and detail (+ the shared
  `ImageGallery` labels), Festivals list and detail, Live Poojas, Panchang (daily, weekly, date controls). Dictionaries now hold
  345 keys per locale (100 added: `gallery`, `home`, `poojas`, `temples`, `festivals`, `livestreams`, `panchang`);
  `TRANSLATED_NAMESPACES` lists them and `localeParity.test.js` enforces parity, placeholders, script and "no unused key".
- **Translation provenance:** 112 of the 345 strings per locale come from the website dictionary where the meaning matches; 233
  were written for this app. **All non-English text is a draft — no native-speaker review has been done.**
- **Server content vs UI wording:** pooja, temple, festival and livestream text is translated by the backend (`?lang=`, English
  fallback) and is displayed exactly as received; only labels, placeholders, badges, empty/error text and accessibility labels
  are translated here. IDs, slugs, `youtubeUrl`/`isActive` and the outbound-URL validation are unchanged. A stream is never
  presented as "live"; a missing title falls back to a translated "Live Darshan" (`utils/livestream.js` now returns `''` and the
  screen supplies the fallback).
- **Language-switch refetch (verified):**
  - Temple detail: when the UI language changes while the screen is open it calls the existing `GET /temples/:id` once (the client
    adds `?lang=`), keeps the current content visible meanwhile, ignores a late reply for a superseded language, and on failure
    keeps what is on screen and shows a translated error. Opening it from the list with the item in hand still makes no request.
  - Panchang (daily view): a language change reloads `/panchang` + `/festivals` once; a stale in-flight reply is dropped; if the
    reload fails the previous language's festivals are NOT shown (the language-independent provider data may remain). The weekly
    view shows provider data only and is not refetched.
  - Already refetching since Day 17: Dashboard, Pooja list, Temples list, Festivals list, Livestreams.
- **Panchang provider values are never translated:** tithi/nakshatra/yoga/karana/muhurat names, times, signs, month/samvat strings
  and the `Next Day` marker value stay as supplied; only the words around them ("Rahu Kaal:", "Moon:", "Avoid", "Next Day" label,
  section titles) are localized. No translation service or new API is involved.
- **Temples:** the mobile temple screens do not render a map or coordinates (the document's `latitude`/`longitude` are only passed
  along in the navigation param); that is unchanged and asserted.
- **Coverage guard** (`i18n/__tests__/contentLanguage.integration.test.jsx`): TempleDetail and Panchang left the pending list;
  FestivalDetail is asserted to make no request at all. Still pending (param-driven or secondary lookups): Booking flow, Product
  detail, Pandit referral / blog screens.
- **Known gaps:** Festival detail receives the festival through navigation and there is no single-festival endpoint, so it keeps the
  language it was opened in until the list is reopened; Product detail is the same (marketplace phase). Month and weekday names,
  `formatDate`/`toLocale*` output, `MOON_PHASES` lookup keys and `formatStatus` text remain English (date/month formatting is a
  separate task). Festival list search is a client-side filter over the displayed (already translated) name/description.

## Day 20 — F-08 localization, phase 4 (marketplace, product detail, cart, orders)

Mobile-only, display text only. **Still not a fully localized app.** Earlier phases are described above.

- **Covered (all 11 locales):** Marketplace list (search, category/sort chips, badges, add/in-cart, empty/error), Product detail,
  Cart (including its confirmations, payment prompt and failure messages), My Orders, Order detail (items, payment rows, shipment,
  timelines, retry card and its outcomes, invoice entry) and the shared pending-payment banner. Dictionaries hold 456 keys per
  locale (111 added: `shop`, `cart`, `orders`); `TRANSLATED_NAMESPACES` lists them and `localeParity.test.js` enforces parity,
  placeholders, script and "no unused key". 142 of the 456 strings come from the website dictionary where the meaning matches
  (e.g. order/shipment statuses, "Add", "Cart"); 314 were written for this app. **All non-English text is a draft — no
  native-speaker review has been done.**
- **Backend content vs UI wording:** the backend translates only a product's `name`, `description` and `tags` (never variants, prices,
  stock, SKU or categories). Those fields are shown as received; the marketplace category names are returned in English by the
  categories endpoint and are shown as received. Sort keys, category slugs, product/variant ids and the search text are sent
  unchanged — only chip labels are translated.
- **Product detail refresh (verified gap, now fixed):** the screen used to keep the item it was opened with. When the UI language
  changes while it is open it now calls the same `GET /marketplace/products/:slug` once (the endpoint is slug-based, so the slug
  from the params or from the item is used; the client adds `?lang=`), replaces only the display content, ignores a reply for a
  superseded request and, on failure, keeps what is shown and shows the translated error. The selected variant, the cart and the
  add-to-cart item are not touched; if the refreshed product no longer has the selected variant, nothing else is selected for the
  user (the existing "select a variant" guard applies). Opening it with the item in the current language still makes no request.
  The marketplace list also drops a late reply for an older request.
- **Cart:** the cart stores a name snapshot per line (captured in the language active when the item was added). It is NOT refreshed on
  a language change: that needs one product request per line plus a cart-store write, which also changes the identity of `items`
  that the checkout guard keys on. The remaining limitation is cosmetic (a line keeps the name it was added under); ids, variant ids,
  quantities, prices, the checkout request, the idempotency key lifecycle, the https payment-URL check and the payment-recovery
  hand-off are untouched and covered by tests. No coupon, coin or combined-checkout control was added.
- **Orders:** order data (names, numbers, amounts, ids, transaction ids, coupon code, server timeline notes) is never translated; only
  the label of a KNOWN status is (`utils/orderStatusLabels.js`; unknown statuses keep the humanized value). Order data is not
  server-translated, so these screens do not refetch on a language change. The coupon row still appears only from the persisted
  `couponCode`/`couponDiscount`; no coin row and no derived discount exist. `ZUT_CART_`, `ZUT_CART_RETRY_` and `ZOM_` routing, retry
  eligibility and idempotency are unchanged. `StatusBadge` gained an optional `label` prop (default behaviour unchanged).
- **Known gaps:** server error messages (e.g. a rejected checkout) are shown as the server wrote them; `formatCurrency`, dates and
  `formatStatus(order.paymentProvider)` stay English/INR-formatted; the cart name snapshot above; Booking flow, payment status
  (`PaymentVerify`), Invoice and admin screens are not localized in this batch.

## Day 21 — F-08 localization, phase 5 (booking flow, bookings, payment status, invoice screen controls)

Mobile-only, display text only. **Still not a fully localized app.** Earlier phases are described above.

- **Covered (all 11 locales):** the booking wizard (every step, validation, price breakdown, coin and partial-payment prompts, the
  payment/uncertain-booking alerts, and the kit "View Items" sheet), My Bookings, Booking detail (rows, statuses, refund, rating and
  cancel dialogs, share text), Payment verification (every state and message) and the Invoice **screen's controls** (title,
  invoice selector, share button, empty/error/retry states). 250 new keys per locale (`booking`, `bookings`, `payment`,
  `invoice`) → 706 per locale; 29 of the 250 come from the website dictionary where the meaning matches, 221 were written for this
  app. **All non-English text is a draft — no native-speaker review has been done.**
- **Values vs labels:** booking/payment/refund statuses and the payment mode are API constants — only the label of a KNOWN value is
  translated (`utils/bookingStatusLabels.js`); an unknown value keeps the humanized fallback. English text is exactly what was
  shown before, including the upper-case payment statuses/modes (`PARTIALLY PAID`, `FULL`). Pooja languages (`Hindi`, `Sanskrit`…),
  timeline/audit notes, failure reasons and pandit/customer data are shown as received.
- **Booking wizard and a language switch:** the wizard used to keep the pooja it was opened with. A switch now re-reads the SAME
  pooja and its kits through the existing `GET /poojas/:id` and `GET /marketplace/kits/by-pooja/:id` (the client adds `?lang=`) and
  merges **display fields only** (pooja name/descriptions/lists, kit name/description). The draft (step, date, time, kits,
  details, note, address, coin choice, payment mode), prices, languages and every calculation are untouched; replies for a
  superseded language are ignored; GETs only — no booking/payment request is made; an unchanged language does nothing. If the
  refresh fails the screen keeps what it shows. Kits are matched by id: the list is not re-ordered or extended mid-booking.
- **Payment verification:** the screen keeps messages as `{ key }` (our wording, translated at render time) or `{ raw }` (server
  text, shown unchanged), so the verification effect does not depend on the UI language: a language switch does not restart
  verification, poll again or touch the pending-payment record. Success/failure/needs-review/timeout classification, the 60-second
  window (→ "Still Confirming", never a failure), endpoint selection (`ZUT_CART_`, `ZUT_CART_RETRY_`, `ZOM_`, booking,
  booking-remaining), single-flight and recovery are unchanged.
- **Invoice:** only chrome is translated. `TAX INVOICE`, table headings, GSTIN/PAN, seller/customer blocks, payment pill, tax
  labels and the generated PDF/HTML (`utils/bookingInvoiceHtml.js`, `utils/bookingInvoice.js`) stay as they are; a test asserts the
  HTML is byte-identical across UI languages and that those utilities do not import the localization layer. Invoice localization
  needs a separate product/compliance decision.
- **Consent:** none of these screens contains the WhatsApp-consent wording (it lives in the auth flow and was not touched).
- **Known gaps:** booking timeline entries (`formatAuditAction`) and the referral status are humanized English; calendar month /
  weekday names, `formatDate`/currency output stay as they are (formatting is a separate task); the card layout shows the pandit
  confirmation as one sentence (the name is no longer bold) so the word order can follow each language.
- **Pre-existing issue found in Day 21, FIXED in Day 22 (see below):** in the "Samagri Kit" step the **Without Kit** button called
  `setKitId('')`, which is not defined (the state setter is `setKitIds`), so tapping it threw.

## Day 22 — "Without Kit" crash fix (booking flow)

- **Root cause (confirmed by inspection and reproduced by a failing test before the fix):** the selected kits are held in
  `kitIds` (an **array** of kit ids, setter `setKitIds`). The **Without Kit** card's handler was
  `{ setWithKit(false); setKitId(''); }`; `setKitId` does not exist in the component, so the second statement threw
  `ReferenceError: setKitId is not defined` on every tap (after `withKit` had already been set to false).
- **Fix (one token, `screens/user/BookingFlowScreen.jsx`):** `setKitId('')` → `setKitIds([])`. That is the same reset the urgent-booking
  switch already performs (`setWithKit(false); setKitIds([])`), so the array shape is preserved for every consumer: `selectedKits`
  (`kits.filter(k => kitIds.includes(k._id))`), the kit price (only when `withKit`), the review rows and the booking request
  (`kitIds` is sent only when `withKit && kitIds.length > 0`, otherwise omitted). No other file or rule changed.
- **Behaviour now:** tapping Without Kit does not throw, stays on the same step, drops any kits chosen earlier (they are not left
  behind for a later "With Kit"), Continue goes to the date step (no kit-selection step), the review shows no kit row and only the
  pooja amount, and the request has `withKit: false` and no `kitIds`. Choosing With Kit again starts from an empty selection
  and then works exactly as before.
- **Regression tests** (`screens/user/__tests__/BookingFlowScreen.kit.test.jsx`, 7 tests, driving the real wizard):
  Without Kit with nothing selected; a no-kit booking end to end (review, price, request body); Without Kit after selecting two kits
  (no stale rows, total or ids); the selection is really empty afterwards; picking a real kit after Without Kit (price and
  `kitIds: ['k2']`); the urgent switch still clears kits; a pooja without kits shows no kit steps. Before the fix 6 of the 7 failed
  with the `ReferenceError`; a mutation that stops clearing the selection fails the "really gone" test.
- **Verification:** full `npm run test:ci` — 81 suites, 1,677 tests passed (Day 21: 80 / 1,670; +1 suite, +7 tests); three randomized
  runs (seeds 22, 4711, 60606) each 81 / 1,677; Android Expo export succeeded (bundle compatibility only — not device behaviour);
  `git diff --check` clean; secret scan clean.
- **Remaining:** not verified on a real device. Other documented gaps (timeline notes, formatting, native-speaker review) are
  unchanged.

## Day 23 — F-08 localization, phase 6 (Family Members, account deletion, legal screen controls)

Mobile-only, display text only. **Still not a fully localized app.** Earlier phases are described above.

- **Screen inventory (audited by scanning `screens/user` for screens without the translation hook):** selected — `FamilyMembersScreen`,
  `FamilyMemberFormScreen` (Family Members), `DeleteAccountScreen` (the only remaining account-management screen),
  `LegalResourcesScreen` and `LegalDocumentScreen` (legal/privacy controls). Already localized and left alone: Profile, Personal
  Info, Change Password, Address Book, Wallet, My Referrals, Settings, and every screen of Days 17–21. Found and deliberately NOT
  changed: `NotificationsScreen`, `BlogsScreen`/`BlogDetailScreen` and `AIAssistantScreen` (content features, not account/legal
  controls), and the Pandit and admin trees.
- **Covered:** 91 new keys per locale (`family`, `account`, `legal`) → 797 per locale; all 91 were written for this app (no website
  string matched), reusing existing keys where the meaning was identical (screen titles, Cancel/Delete/Retry, Send/Verify OTP,
  "Continue with Deletion", "Enter your current password", "Invalid OTP"). **All non-English text is a draft — no native-speaker
  review has been done.**
- **Family Members:** the relationship VALUE (`Father`, `Mother`, …) is what the API stores and receives; only its label is
  translated (`utils/familyLabels.js`). The form still submits the English value and trimmed name to the same endpoints, edit
  pre-fills the same fields, and a value outside the list (older data) is shown as stored. Form errors are stored as keys, so a
  message already on screen follows a language change; a language switch neither refetches the list nor disturbs a half-filled form.
- **Delete account:** every step is translated; the channel values (`email`/`whatsapp`), the OTP purpose and all request bodies are
  unchanged, server messages are shown as received, and the delayed sign-out after scheduling is unchanged.
- **Legal/privacy:** only controls are translated (section headings, hints, empty/error/stale states, open/download buttons, the
  "Updated <date>" line). Document titles and admin-configured link labels come from the server and are shown exactly as supplied;
  file names, sizes, the documents themselves, document URLs/ids, URL-safety checks and the F-04 dynamic loading are untouched.
  Tests assert the document descriptors are identical in every UI language and that the legal utilities/service do not import the
  localization layer. A translated control label does not mean the document is translated. No consent wording or consent payload
  exists in these screens.
- **Tests:** `FamilyMembers.localization.test.jsx` (17) and `AccountLegal.localization.test.jsx` (25) — English, Hindi and Tamil paths,
  payload/endpoint/navigation guards, validation, delete flow, failure paths and no-refetch on a switch. Mutations that send the
  translated relationship label or refetch on a language change fail the matching tests.
- **Verification:** full `npm run test:ci` — 83 suites, 1,719 tests passed (Day 22: 81 / 1,677); three randomized runs (seeds 23, 5150,
  88888) each 83 / 1,719; Android Expo export succeeded (bundle compatibility only — not device behaviour); `git diff --check`
  clean; secret scan clean; all 11 dictionaries have 797 keys with identical placeholders.
- **Remaining:** Notifications, Blogs and AI Assistant text; Pandit/admin screens; dates/months/weekdays and currency formatting;
  humanized-English booking-timeline and referral statuses; raw server error messages; native-speaker review; no real-device check.

## Day 24 — F-08 localization, phase 7 (Notifications, Blog list, Blog detail)

Mobile-only, display text only. **Still not a fully localized app.** Earlier phases are described above. The AI Assistant is
deliberately out of this batch.

- **Backend contract (read from `backend/src`):** `GET /notifications` translates `title` and `message` for `?lang=`; `GET /blogs` and
  `GET /blogs/:slug` translate `title`, `excerpt`, `content` (HTML), `tags` and the SEO fields. Category names, author names,
  comments, slugs, ids, image paths and the like/bookmark/read flags are not translated by the server and are shown as received.
  The screens already requested localized content and refetched on a language change (Day 17); this batch adds the missing UI text
  and the missing stale-reply protection.
- **Covered:** 33 new keys per locale (`notifications`: 10, `blogs`: 23) → 830 per locale, all written for this app (none matched the
  website dictionary); the notifications screen title reuses `settings.notifications`. **All non-English text is a draft — no
  native-speaker review has been done.** `NotificationsScreen` is shared with the Pandit and Admin navigators, so its chrome is
  translated there too (no other change).
- **Notifications:** search placeholder, empty/no-match states, the clear-all confirmation and failure message, and the header /
  delete accessibility labels are translated. Ids, read flags, mark-read / mark-all / delete / clear-all requests, the by-number
  navigation lookups and the role-specific handlers are unchanged. The store still drops the previous language's list and ignores
  replies from before a switch; a switch writes nothing (tests assert no PATCH/DELETE).
- **Blog list:** title, search placeholder, empty/error text, read-time ("{n} min read"), the author fallback and the clear-search label
  are translated; the request adds only `lang`; search text survives a language switch; a switch reloads page 1 in the new language
  (later pages are not re-requested — the list is replaced, as before). New: only the latest list request may update the screen.
- **Blog detail:** all controls/toasts are translated (like, save, share, comments, placeholders). New: only the latest blog request
  may update the screen, and a blog already on screen stays visible while the new-language copy loads (previously a blog opened by
  slug alone was swapped for a spinner on a language switch), so the comment draft and like/bookmark state are never reset.
  The comments list is not refetched on a switch (same blog id). Like/bookmark/share/comment payloads are unchanged.
- **Tests:** `Notifications.localization.test.jsx` (10) and `Blogs.localization.test.jsx` (18) use the real API client and store.
  Mutations that remove the stale-reply guards or bring back the spinner swap fail the matching tests.
- **Verification:** full `npm run test:ci` — 85 suites, 1,747 tests passed (Day 23: 83 / 1,719); randomized seeds 24, 7331 and 123123
  each 85 / 1,747 (seed 7331 failed once in an existing BookingDetail test and passed on the immediate rerun together with three
  isolated runs of that file — see the note below); Android Expo export succeeded (bundle compatibility only — not device behaviour);
  `git diff --check` clean; secret scan clean; all 11 dictionaries have 830 keys with identical placeholders.
- **Known intermittent test timing (not caused by this batch):** on a heavily loaded machine two long-standing suites occasionally miss
  React Native Testing Library's default 1 s wait — `Discovery.localization` ("Available Poojas") and `BookingDetailScreen` (rating
  eligibility). Each passed on rerun (22 and 8 consecutive clean runs; the BookingDetail file 3 of 3). A global
  `asyncUtilTimeout` in `jest.setup.js` would remove the risk; it was not changed here.
- **Remaining:** AI Assistant; Pandit/admin screens; relative-time ("5 minutes ago") and other date/month/weekday/currency formatting;
  humanized-English booking-timeline and referral statuses; raw server error messages; native-speaker review; no real-device check.

## Day 25 — stabilizing the two intermittent Jest failures reported in Day 24

Test-only. **No production code, `jest.setup.js`, dependency, lockfile, env, native, backend or website change.** The two flakes
named in the Day 24 note above were reproduced and diagnosed separately; they share one underlying cost (cold start) but fail in
different ways.

- **Cold start (the shared cause):** the first render of a heavy screen (SVG, gradients, animated views, the icon set, modals) costs
  about 2 s on an idle machine — roughly 20x any later test in the same file — and 13–20 s with the CPU saturated. It is paid by
  whichever test runs first, and `--randomize` makes that a different test on every run, which is why the failures looked random.
  React Native Testing Library waits 1 s by default and Jest allows 5 s per test.
- **`Discovery.localization` ("Available Poojas") — wrong budget for a cold first render, not a missing element:** under CPU load
  the failure dump already contained the expected content; it had rendered, but after the 1 s `findByText` window closed (cold render
  plus the data re-render). Nothing was nondeterministic in the mocks (the adapter is a fixed fixture).
- **`BookingDetailScreen` (rating eligibility) — per-test timeout plus leakage into the next test:** the cold first test exceeded
  Jest's 5 s limit (observed 15–20 s under load). A timed-out test is not cancelled: it kept running, and its late `api.post` landed
  inside the next test's `toHaveBeenCalledTimes(1)` / eligibility assertions, so the failure showed up in a different, innocent
  test. Under `--randomize` the cold test varies, which explains why Day 24 saw it in a rating-eligibility test.
- **Fix (test-only):** a `beforeAll` warm-up in each of the two files renders the screen(s) once, waits until the content is
  present, then unmounts — before any test's timed waits. `Discovery.localization` warms `DashboardScreen` and `PoojaListScreen`;
  `BookingDetailScreen.test` also opens the rating modal once. The warm-up waits are generous (60 s inside a 120 s hook timeout) but
  only as a failure budget: they return as soon as the screen is ready, so a passing run is not slower in any meaningful way, and
  the tests' own assertions keep their original default waits and 5 s limit. The mocks, assertions and expected values are unchanged,
  so a real regression (missing element, wrong payload) still fails.
- **Global timeout decision:** `jest.setup.js` and `asyncUtilTimeout` were **not** changed. The cost is per heavy screen, not global; a
  global raise would slow down every genuine failure in all 85 suites and would still not cover the 5 s per-test limit that caused the
  BookingDetail leakage. No sleeps, retries or per-test timeout increases were added.
- **Evidence:** first-test duration with no load fell from 2,329 ms to 87 ms (BookingDetail) and 2,086 ms to 129 ms (Discovery).
  With both files run concurrently under 12 busy-loop workers, 4 of 4 rounds failed before the change and 5 of 5 passed after;
  randomized runs of both files under the same load with seeds 7331, 11, 22, 33 and 44 passed.
- **Verification:** full `npm run test:ci` — 85 suites, 1,747 tests passed (unchanged count); randomized full-suite seeds 25, 9090 and
  424242 each 85 / 1,747. Day 21–24 localization, "Without Kit", payment-recovery, booking-charge and discount suites are in
  those runs and green.
- **Remaining risk (not changed, out of scope):** one full-suite run under sustained 12-worker CPU load failed 1 test — the first
  test of `BookingFlowScreen.coins.test.jsx` ("reads GET /wallet and shows balance and the server-configured rate"), with
  `Exceeded timeout of 5000 ms` (first test 8,952 ms). Same cold-start mechanism; the same `beforeAll` warm-up would remove it.
  It has not been seen on an unloaded machine. Other heavy first-render files may have the same exposure under heavy load; this was
  not audited file by file.

## Day 27 — F-08 phase 8: locale-aware dates, weekdays, months, time and relative time

Mobile-only, display text only. **Still not a fully localized app.** No stored value, request payload, calculation or official
invoice changed.

- **Inventory (what was actually hardcoded):** `utils/helpers.js` (`formatDate`/`formatDateTime`/`timeAgo` — date-fns with English
  patterns; `formatCurrency` — `en-IN` INR) and about 20 screen-local `toLocaleDateString('en-IN', …)` calls; three in-app calendars
  (booking flow, festivals, Panchang jump-to-date) with English month names and `Su Mo …` headers.
- **Design:** `utils/helpers.js` is **unchanged** and still serves the official invoice (`bookingInvoiceHtml.js`, `InvoiceScreen`) and the
  un-localized Pandit/Admin screens. The localized layer is new: `src/i18n/formatters.js` (pure) and `useFormatters()` in `src/i18n`
  (stable per language). Customer screens call it; the same inputs go in, the same Date construction is kept at each call site.
- **Policy (tested):** English output is byte-for-byte the legacy output (it delegates to the legacy helper / the same
  `toLocaleDateString('en-IN', …)` call). Another language formats with Intl using `<code>-IN-u-nu-latn` — the language's month and
  weekday names, field order and separators, but **Latin digits**, because every other number in the UI (counts, prices, OTPs, PINs)
  is Latin and a Bengali/Marathi date next to Latin figures would read as inconsistent. If the owner prefers native digits it is the
  one `DIGITS` constant. A locale the runtime cannot really format falls back to English formatting.
- **Time stays 24-hour `HH:mm`** in the device time zone, built from the Date's local fields (no Intl `timeZone` option — see
  `bookingDateRules.js`). A date-only string is read exactly as before (`parseISO`, local midnight); full ISO timestamps are the same
  instant. Invalid/missing dates show `—` in every language (the old toLocale sites could print "Invalid Date").
- **Relative time** ("5 minutes ago"): English keeps date-fns' wording. Other languages use 11 new `common.ago*` keys in all eleven
  dictionaries (just now, minute/hour/day/month/year one and many; 841 keys per locale, identical placeholders; **all non-English
  text is an unreviewed draft**). Hermes does not ship `Intl.RelativeTimeFormat`, so this has no Intl dependency. A timestamp in the
  future shows "just now" in non-English (the dictionaries carry no "in N minutes"); English keeps date-fns' "in …".
- **Localized screens:** Dashboard, booking flow (calendar title, weekday header, selected/review dates), bookings list and detail
  (date row, `Timeline`), orders list and detail (date, timelines), wallet transaction dates, referrals, notifications and blog comment
  times, blog list/detail, festivals (+ calendar), festival detail, Panchang (+ jump-to-date calendar), family members, legal "Updated"
  line, delete-account and login "deletion scheduled" dates. `Timeline` takes an optional formatter, so the Pandit screens that share it
  keep English; `NotificationsScreen` is shared with Pandit/Admin and follows the language with its already-translated chrome.
- **Currency: deliberately not changed.** INR already prints `₹`, Indian lakh/crore grouping, Latin digits, 0–2 decimals in every
  language. Probing Node's ICU for the eleven `-IN` locales showed CLDR agrees on symbol and decimal mark but **not on grouping**
  (`mr`, `kn`, `ml`, `or` print `₹1,234,567`; the others `₹12,34,567`). A locale-driven formatter would therefore either change
  nothing or print a different amount layout per language, so the shared helper stays language-independent and a test pins the policy.
  `amount || 0` in the helper is pre-existing and was not touched. Not changed: any calculation, coupon/coin value, refund, partial
  payment, API payload or the official invoice (`utils/bookingInvoiceHtml.js`, `InvoiceScreen`, `fmtInvoice*`).
- **Runtime:** nothing here proves device output. Tests run on Node's ICU. Hermes on Android supports `Intl.DateTimeFormat`, but this was
  not run on a device; `resolveFormatLocale` checks `supportedLocalesOf` and that the locale resolves to itself, and falls back to
  English formatting otherwise (tested with stubs). Export confirms bundling only.
- **Tests:** `i18n/__tests__/formatters.test.js` (52: mapping/fallbacks for all eleven codes, English identity with legacy, Hindi exact,
  script/Latin-digit checks per language, date-only and timezone semantics, 24-hour time, relative-time buckets, calendar labels, INR
  policy) and `screens/user/__tests__/Formatting.localization.test.jsx` (12: booking detail incl. language switch, orders, order
  detail, wallet, notifications, festivals — requests, amounts and status values asserted identical). Two existing Hindi tests
  (`AccountLegal`, `Blogs`) were updated from English-formatted to Hindi-formatted dates.
- **Verification:** `npm run test:ci` — 87 suites, 1,811 tests passed (Day 25 baseline 85 / 1,747); randomized seeds 27, 4242 and
  909090 each 87 / 1,811, no failures and no reruns; locale parity/placeholder/script/dead-key checks pass; Android Expo export succeeded
  (bundle compatibility only); `git diff --check` clean.
- **Remaining:** humanized-English booking-timeline and referral statuses; raw server messages; the InvoiceScreen and Pandit/Admin
  formatting; native digits (a product decision); relative time in the future for non-English; native-speaker review; device check; the
  load-sensitive `BookingFlowScreen.coins` first-test timeout from Day 25 is deliberately deferred and did not appear.

## Day 29 — device findings: six fixes

From the first round of on-device testing of the local-Wi-Fi APK. Mobile only; no backend or website change.

- **A — booking timeline removed** from the customer Booking Detail and from the Pandit Booking Detail (the request's heading named both; its
  body said "keep Pandit/Admin" — the heading was followed, so Pandit's screen also lost it; Admin and the website are untouched). The shared
  `Timeline` component stays (Order Detail, Pandit referral detail). `bookings.timelineTitle` was dead after this and was removed from all 11 dictionaries.
- **B — Android now draws a real map.** `components/shared/OsmTileMap.jsx` renders OpenStreetMap raster tiles (the website's provider and
  tiling) with plain React Native views — no new dependency, key or native change (react-native-webview and Leaflet are not installed in the app;
  `react-native-maps` on Android needs a Google key). Same UX as the iOS picker: the pin stays centred and the map moves under it. Drag = pan, tap =
  move the pin there, pinch / +/- buttons = zoom (3–18), GPS and search unchanged, "© OpenStreetMap contributors" shown and linked. Geometry is in
  `utils/slippyMap.js` (checked against the OSM wiki tile formula). If no tile loads the picker shows the (reworded) "map could not be loaded" state with
  Try again. iOS is unchanged. **Owner decision still open:** the public OSM tile server's usage policy may not suit production volume; the tile
  URL is one constant (`OSM_TILE_URL` in `utils/mapConfig.js`). Not verified on a device — Jest checks tile URLs, gesture→coordinate maths and state.
- **C — Pandit dashboard calendar.** `components/pandit/ScheduleCalendar.jsx`, placed in the dashboard column above the booking lists. It shows only
  `GET /pandits/me/schedule-calendar?from&to` (month heading, prev/next, Sun-first grid, today ring, the website's colours and legend, booking and conflict
  dots, selected-day panel; tapping a booking opens the existing booking detail). Read-only; loading/empty/error + Retry; stale replies ignored.
- **D — Pandit notification bell.** Root cause: `PanditNotifications` was registered only in the Profile tab's stack, so `navigate()` from the Home stack
  could not reach it. It is now also registered in the Home stack; the bell has an accessibility label. A test renders the real Pandit navigator (and fails without the route).
- **E — KYC "Recommended" badge.** The title row wraps and the text column may shrink (`minWidth: 0`), so on a narrow screen the badge drops under the title.
  Jest has no layout engine: the test pins the wrapping/shrinking style contract, not pixels.
- **F — profile photo removal** (the website's "Remove" in `ProfilePhoto.jsx`: confirm "Remove profile photo?" then DELETE). Customer: `DELETE /users/profile/photo`;
  Pandit: `DELETE /pandits/me/photo` (both existed). Confirmation first, double-tap guard, success/failure toasts. It is not account deletion and not the KYC document choice.
  5 new `profile.*` keys + 2 `location.*` keys (zoom) in all 11 dictionaries — **unreviewed drafts**; `location.mapUnavailable` was reworded.
- **Tests:** new `BookingDetail.noTimeline`, `PanditNotificationBell`, `PanditKYCScreen.decision`, `ProfilePhotoRemoval`, `ScheduleCalendar`,
  `PanditDashboardScreen.calendar`, `slippyMap`; rewritten `MapPicker.android`; updated `MapPicker`, `LocationWidgets.i18n`, `Bookings.localization`, `Formatting.localization`.

## Follow-ups from F-03 (not fixed here)

- **F-06 (deep link / app return):** `redirectUrl`'s return page is the *website* (`<clientUrl>/payment-callback/<txn>?cart=1`).
  After paying, the user lands on the website and must return to the app, which then polls `/checkout/verify`.
- **F-07:** coupon entry, coin redemption, the unified pooja-plus-product cart and referral attribution are not on
  mobile. `/checkout/cart` already accepts `couponCode` / `coinRedemptionCoins`; the app sends neither.
- Remaining backend observations: a coupon failure happens after the order is created, leaving an orphan
  `pending_payment` order (website path); a mixed cart whose product validation fails leaves its pooja bookings
  created (pre-existing). A variant product requested without a `variantId` is priced as a flat item (existing rule; not changed).
- The cart shows a local items subtotal (no tax); the exact payable is known only after the server creates the order,
  and is shown in the payment prompt. A server-side cart quote endpoint would be needed to show it earlier.

- Admin screens (`AdminBookingDetailScreen`, `AdminRefundDetailScreen`) also open `InvoiceScreen`; they now use
  the persisted-invoice API, which admins are authorised for. Not exercised on a device.
- The website prints a fixed "18%" tax rate and "Payment Method: UPI / PhonePe"; mobile derives the rate from the
  stored amounts and shows only the stored gateway name. `BillToSection` still prints "GSTIN: Unregistered"
  (as before and as on the order invoice).
- `GET /livestreams` has no notion of "currently live" (only `isActive`), so the Livestreams cards say WATCH,
  not LIVE. Streams open in YouTube/the browser via `Linking`; there is no in-app player (no
  `react-native-webview` dependency).
- The Temple model has no phone/website, so those rows were removed. The website's map link (from
  `latitude`/`longitude`) and its temple filters (state/category) are not on mobile.

- The "Remember me" checkbox on `LoginScreen` is not wired to anything (its state is never
  passed to `login`); sessions are always persistent now. Remove it or give it meaning (product decision).
- Backend answers 401 for a wrong password on `POST /auth/delete-account/check-password`
  (an authenticated route). The app works around it by path; 400/403 would be the cleaner contract.
- After a session expiry the user lands on Login with no explanation (no "session expired" message).
- `helpers.formatCurrency` / `fmtInvoice*` depend on `Intl`/ICU locale data; intentionally
  untested here because Node and Hermes differ.
- `mobile-app/%ProgramData%/Microsoft/Windows/UUS/State/_active.uusver` is a tracked stray
  file (Windows artefact) — unrelated, left untouched.
