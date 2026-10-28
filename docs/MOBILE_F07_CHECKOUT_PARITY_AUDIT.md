# Mobile F-07 checkout parity audit (Day 13) — coupons, coins, referrals, unified cart

Date: 2026-10-27 · Branch `main` · HEAD `e77ef97` (plus uncommitted work from Days 1–12)
Method: **static source inspection only.** No source, test, package, environment or existing documentation file was changed; no test or
backend process was started; no payment gateway, coupon, wallet or referral endpoint was called; no coupon was consumed, no coin redeemed, no
order created, no database record read or written; no `.env` value was read. Anything that needs runtime evidence or an owner decision is marked
**Not verified** or **Owner decision**. Prior test counts (mobile 54 suites / 1,099 tests after Day 12) are historical and were **not re-run**.

## 1. Executive summary

1. **Every F-07 capability exists on the website and in the backend; mobile has only part of it.**
   - *Marketplace coupons*, *booking coupons*, *coin redemption*, *Pandit referral tokens*, *user referral codes* and a **real combined
     pooja-plus-product cart with ONE payment** are all implemented on the website (`CartPage.jsx`, `BookingFlow.jsx`, `ReviewStep.jsx`,
     `CartContext.jsx`) and supported by the backend (`POST /api/checkout/cart`, `POST /api/bookings/create-phonepe-order`, `POST /api/coupons/validate`,
     `GET /api/wallet`).
   - Mobile today: **no coupon UI anywhere; coin redemption only in the single-booking flow; product-only cart; no Pandit `referralToken`;
     user-referral code entry works at registration** (typed, or via the cold-start link).
2. **A combined pooja-plus-product cart genuinely exists** — `POST /api/checkout/cart` takes `bookings[]` **and** `products[]`, creates all
   Booking documents plus one Order, and starts **one** PhonePe transaction for the combined total (`checkout.controller.js:59-463`). The website
   uses it (`CartPage.jsx:159-165`: "Add poojas or products to your cart and checkout together"). It is **not** a new backend architecture
   task — the backend is ready; the work is mobile cart/checkout/recovery plumbing plus owner decisions (§9).
3. **The backend recalculates every payable amount server-side** (coupon discount, coin value, booking pricing, product price and tax). No
   client value is trusted as the amount. The *preview* endpoint, however, takes a client-supplied `cartValue`, and the website's mixed-cart preview
   passes the wrong base (§6/§7).
4. **Mobile cannot safely reuse the cart-coupon path unchanged.** Confirmed backend/website issues that a mobile implementation would inherit: the cart
   endpoint validates the coupon **after** persisting the Booking/Order (a rejected coupon leaves an orphan `pending_payment` order); coupon
   redemptions are counted **per booking/order**, never released on failure/expiry/cancellation, and limit-checked with read-then-act code; coins are
   not reserved at checkout and the wallet debit is not atomic. These are backend decisions, not mobile bugs (§7, §9).
5. **Safest next phase (mobile-only, no new financial logic):** display the **already-persisted** discounts (`couponCode`, `couponDiscount`,
   `coinCoins`, `coinValue`) on Booking/Order detail, and add contract/UI tests for the coin redemption that already exists in `BookingFlowScreen`
   (currently untested). Booking-coupon apply/remove can follow as a mobile-only phase; marketplace-cart coupons and the combined cart depend on
   backend/owner decisions.

## 2. Website inventory (parity reference)

| Capability | Source (file:line) | Behaviour verified in code |
|---|---|---|
| Combined cart | `context/CartContext.jsx:26-116` | One localStorage cart (`CART_KEY`) of `POOJA` items (added from the booking flow via `addPooja`, `BookingFlow.jsx:448-466`, storing a client **pricing snapshot**) and `PRODUCT` items (`addProduct`). Totals `poojaTotal`, `productSubtotal`, `productTaxTotal`, `grandTotal` are **display-only**. |
| Combined checkout | `pages/CartPage.jsx:127-178` | `POST /checkout/cart { bookings, products, shippingAddress (only if products), couponCode, coinRedemptionCoins }`; then `clearCart()` **before** the redirect; `paidWithCoins` → goes to `/payment-callback/<txn>`; else `window.location.href = data.redirectUrl`. No idempotency key, no `referralToken`. |
| Marketplace/cart coupon apply | `CartPage.jsx:42-71` | `POST /coupons/validate { code, cartValue: grandTotal, cartType }` where `cartType = 'POOJA'` for **any cart containing a pooja** (even mixed) and `'PRODUCTS'` for products only. Stores `{ code, discount, … }` from the response; displays `discount` from the *preview*. |
| Coupon remove | `CartPage.jsx:90-93`, `ReviewStep.jsx` | Clears local `appliedCoupon`; sending no `couponCode` removes it at checkout. Applying a coupon clears coins and vice-versa (also enforced by the backend). |
| Booking coupon | `BookingFlow.jsx:322-346`, `ReviewStep.jsx:16-230` | `POST /coupons/validate { code, cartValue: pricing.grandTotal (client), cartType: 'POOJA' }`; checkout sends `couponCode`. |
| Coin balance / redemption | `CartPage.jsx:30-88, 487-520`, `BookingFlow.jsx:56-66, 250-256`, `ReviewStep.jsx:17-22, 139-230` | `GET /wallet` → `balance`, `coinMonetaryValue`, `coinRedemptionMinCoins`. Eligible only when `coinRate > 0`, `balance ≥ min`, **no coupon**, and (cart) **no products**. Sends `coinRedemptionCoins = min(balance, floor(total / rate))`; UI "−₹" is a client estimate. |
| Partial payment + discounts | `BookingFlow.jsx:354-393` | `create-phonepe-order` with `paymentMode`, `partialAmount`, `couponCode`, `coinRedemptionCoins`, `referralToken`. |
| User referral code | `pages/Register.jsx:229-280, 529-532, 592-600` | `/register?ref=<CODE>` pre-fills (max 10 chars, upper-case); `POST /auth/complete-registration { referralCode }`. |
| Pandit referral | `pages/ReferralLanding.jsx:41-88`, `components/booking/constants.js:70-78`, `BookingFlow.jsx:34, 147-153, 393-396` | `/r/<token>` validates (`GET /referral/validate/:token`), keeps it in `sessionStorage['zutsav_referral']`, forwards `?referralToken=` into `/book/<slug>`; the single-booking request sends `referralToken` and the stored copy is cleared afterwards. |
| Wallet / referral pages | `pages/Wallet.jsx`, `pages/MyReferrals.jsx` | Wallet balance + history; user-referral codes. |

## 3. Backend inventory

| API (mounted path) | Auth | Request → response (source) | Notes |
|---|---|---|---|
| `POST /api/coupons/validate` (`coupon.routes.js`, `coupon.controller.js:22-70`) | JWT | `{ code, cartValue, cartType ∈ POOJA\|PRODUCTS\|KITS\|MARKETPLACE }` → `{ success, valid, discount, finalPayable, coupon:{ code, discountType, discountValue, maxDiscount, minCartValue } }`; 400 `{ success:false, message }` | **Preview only**; `cartValue` is client-supplied. There is no endpoint that lists a user's coupons. |
| `GET /api/wallet` (`wallet.controller.js`) | JWT | `{ wallet:{ balance, totalEarned, totalRedeemed, createdAt, updatedAt, coinMonetaryValue, coinRedemptionMinCoins } }` | `coinMonetaryValue` is an admin setting (null when unconfigured) — no rate may be assumed. |
| `GET /api/wallet/transactions?page&limit&type&direction` | JWT | `{ transactions, total, page }` | Ledger (`WalletTransaction`, unique `idempotencyKey`). |
| `POST /api/checkout/cart` (`checkout.controller.js:483`) | JWT | `{ bookings[], products[], shippingAddress, couponCode, coinRedemptionCoins, idempotencyKey? }` → 201 `{ merchantTransactionId, redirectUrl, bookings, order, totals:{ bookingTotal, productTotal, combinedTotal }, couponDiscount?, coinCoinsUsed?, coinValueUsed?, paidWithCoins? }` | Idempotency fingerprint covers bookings, products, address, `couponCode` **and** `coinRedemptionCoins` (`checkoutIdempotency.js:44-64`). |
| `GET /api/checkout/verify/:txn`, `POST /api/checkout/webhook`, `POST /api/checkout/orders/:id/retry-payment` | JWT / signed webhook / JWT | (Day 11/12 audits) | Retry charges the order's **persisted** `totalAmount`; the coupon is never re-validated on retry. |
| `POST /api/bookings/create-phonepe-order` (`booking.controller.js:242-477`) | JWT | adds `paymentMode`, `partialAmount`, `couponCode`, `coinRedemptionCoins`, `referralToken` → `{ booking, redirectUrl, merchantTransactionId, chargeAmount, remainingAmount, couponDiscount?, paidWithCoins?, coinCoinsUsed?, coinValueUsed? }` | Coupon validated **before** the Booking is created (`:276-322`). Coins/coupon mutually exclusive; `payableTotal ≤ 0` handled inline (`:445-461`). |
| `POST /api/auth/complete-registration` (`auth.controller.js:140-235`) | public + verified OTP | `referralCode` → atomic `consumeCode` (single-use, expiring), `User.referredBy`, referrer's wallet credit (idempotent key `referral_registration_<codeId>`) | Setting `userReferralRegistrationRewardCoins` (default 10 in code); `userReferralEnabled` flag defaults to false. |
| `GET /api/user-referrals/validate/:code` (public), `POST …/generate`, `GET …/my`, `GET …/settings` | public / user | `userReferral.controller.js` | |
| `GET /api/referral/validate/:token` (public), `POST/GET /api/referral…` (Pandit/admin) | | `referral.controller.js` | Pandit referral tokens, 30-day expiry. |
| Legacy `POST /api/marketplace/orders/create` | JWT | validates coupon **before** creating the Order; items are **not taxed** | Not used by mobile. |

**Rewards that credit coins:** pooja loyalty (`poojaLoyaltyService`, `poojaBookingCoinRewardPercent` default 5 of the pre-tax pooja amount, on completion, idempotent per booking),
user-referral registration and booking rewards (`userReferralService.createBookingRewardEligibility`, on booking completion, unique per booking, capped per referred user).

## 4. Mobile inventory

| Area | Source | Status |
|---|---|---|
| Marketplace cart | `store/cartStore.js` (products only), `CartScreen.jsx`, `utils/marketplaceCheckout.js` | **Implemented**: ids/quantities → `POST /checkout/cart`; local *estimate* (no tax); server totals returned; idempotency key (`utils/checkoutAttempt.js`); Day 12 recovery. Comment `marketplaceCheckout.js:6-7` records "coupons/coins/pooja items are F-07 work". |
| Coupons (marketplace or booking) | — | **Not implemented.** Searched all of `mobile-app/src`: the only matches are comments. |
| Coin balance | `WalletScreen.jsx` (`GET /wallet`, `GET /wallet/transactions`), Profile → "Wallet" | **Implemented** (no test found). |
| Coin redemption | `BookingFlowScreen.jsx:188-190, 262-266, 295-305, 356, 773-818` | **Partially implemented**: booking only (matches the backend rule that products are not eligible). Mirrors server rules locally (`coinEligible`, cap by balance and payable); sends `coinRedemptionCoins`; shows "Coins Applied". The alert uses the server's `chargeAmount`. **No tests.** |
| Booking pricing | `utils/priceEngine.js` (mirror of `financeUtils`), `GET /bookings/pricing-preview` | Display estimate; the server's `chargeAmount` is authoritative. |
| Pandit referral token | — | **Not implemented**: `BookingFlowScreen` never sends `referralToken`; `App.jsx` `linking` maps only `register` (no `/r/<token>`); Pandit referral *creation* screens exist (`PanditReferralScreen.jsx`, `…DetailScreen.jsx`). |
| User referral code | `RegisterScreen.jsx:57-66, 86, 152-156` → `OTPScreen` → `SetPasswordScreen.jsx:51-58` → `complete-registration` | **Implemented** (typed or from `global.__zutsav_referral_code`, set on cold start only; the warm-start `ref`/`referralCode` param mismatch is Day 11 finding P-10). `MyReferralsScreen.jsx` (`/user-referrals/my\|settings\|generate`). No tests found for the referral screens. |
| Combined cart | — | **Not implemented**: no pooja item type in the cart store; `mapCheckoutResponse` (`marketplaceCheckout.js:47-64`) **requires `data.order._id`**, so a booking-only cart response would be rejected. |
| Discount display | `BookingDetailScreen.jsx:268-270`, `OrderDetailScreen.jsx:183-197` | Show `grandTotal` / `totalAmount` only; **no coupon or coin rows**. For a coupon order placed on the website, the order screen shows item subtotal + tax next to a lower `Total Amount` with no discount line. |
| Tests | `CartScreen.checkout.test.jsx` (asserts coupon/coin fields are NOT sent), `marketplaceCheckout.test.js` | Nothing exercises wallet, coin redemption in `BookingFlowScreen`, referral screens, or coupons. |

## 5. Checkout parity matrix

| Capability | Website (source) | Backend | Mobile | Contract compatibility | Financial / security | Tests | Gap and next step |
|---|---|---|---|---|---|---|---|
| Marketplace coupon apply/remove | `CartPage.jsx:42-93` | `POST /coupons/validate`; applied inside `/checkout/cart` (`:252-348`) | **Not implemented** | Compatible, **but** product totals are tax-inclusive on the server (`:213-227`) while the mobile cart is a no-tax estimate → a correct preview needs a server-computed base | Preview takes client `cartValue`; commit recomputes. Orphan order on rejection (F07-01) | Backend: cart + coupon only one invalid-coupon case (`checkout-integrity`); service rules in `coupon-system` (26). Mobile: none | Backend/owner decision before mobile (§9 Phase 3). |
| Coin balance display | `Wallet.jsx`, cart/booking | `GET /wallet` | **Implemented** (`WalletScreen`) | Compatible | Display only | No mobile test | Add contract tests. |
| Coin redemption | booking: `ReviewStep`; cart: pooja-only | `resolveCoinRedemption` (`coinRedemptionService.js:40-81`); debit after payment | **Partial** (booking only) | Compatible; mobile mirrors rules locally | Not reserved; non-atomic debit (F07-07) | Backend `coin-redemption` (19). Mobile: none | Add mobile tests first; keep server-authoritative. |
| Booking coupon apply/remove | `BookingFlow.jsx:322-346` | `create-phonepe-order` (`:276-322`) | **Not implemented** | Compatible; `cartValue` for preview must be the pooja-eligible amount | Redemption recorded at creation, never released (F07-05) | Backend service only | Mobile-only phase possible (§9 Phase 2). |
| Referral link/code capture | `Register.jsx`, `ReferralLanding.jsx` | `/user-referrals/validate/:code`, `/referral/validate/:token` | **Partial**: typed code works; cold-start global; no `/r/<token>`; warm-start param mismatch | Compatible | Server enforces single-use, expiry | Backend `user-referral-phase1` (43); mobile none | Depends on F-18 deep links. |
| Referral attribution persistence | `referralToken` in single booking only | `booking.referral` set in `create-phonepe-order`; user referral at registration | User code: yes. Pandit token: **no** | Compatible | **Cart checkout never sets `booking.referral`** (F07-09) | Backend `referral-booking-reward` (19) | Product + backend decision for the cart path. |
| Unified pooja+product cart | `CartPage.jsx`, `CartContext.jsx` | `POST /checkout/cart` (bookings+products, one txn) | **Not implemented** | Backend ready; mobile `mapCheckoutResponse`, recovery context and cart store need extending | One payment; coupon/coins rules differ per category | Backend `checkout-*` cover products/idempotency | Product decision, then large mobile phase (§9 Phase 5). |
| Server-authoritative payable | `data.redirectUrl` charge is server's | booking: `chargeAmount`; cart: `totals.combinedTotal`, `order.totalAmount` | Booking uses `data.chargeAmount`; cart shows server totals after creation | Compatible | Never send a client total | Existing | Keep. |
| Failure / retry after discount | — | Order retry charges persisted `totalAmount` (`orderRetry.controller.js:144`); booking retry uses last ledger amount | Day 12 recovery + retry | Compatible | Coupon not re-validated on retry; not released on abandon (F07-05); coins not yet debited so a failed payment keeps them | `order-payment-retry` (33) | Preserve; document coupon-consumption policy. |
| Cart/order state after creation/payment | `clearCart()` before redirect | order `pending_payment` → paid via verify/webhook | Cart cleared at order creation (Day 5) | Same semantics | — | Existing | Preserve. |

## 6. Source-backed financial calculations and trust boundaries

- **Booking price**: `calculatePricing` (`financeUtils`, via `computePricing`/`calculatePricing` in the controllers): pooja amount, platform fee, platform GST, kit amount + kit GST, optional urgent surcharge → `grandTotal`. Mobile `priceEngine.js` mirrors it for display only.
- **Product price**: `unitPrice = variant.salePrice ?? variant.price ?? product.salePrice ?? product.price`; **tax = `calculateItemTax(unit, qty, product.taxRate)`**; `itemTotal = unit × qty + tax` (`checkout.controller.js:195-227`). Order `totalAmount` = Σ tax-inclusive item totals. No shipping/delivery charge is computed anywhere in this path (Not found).
- **Coupon discount**: `calculateDiscount` (`couponService.js:40-57`): FIXED = min(value, eligible); PERCENTAGE = eligible × % / 100, capped by `maxDiscount` and by eligible; rounded to paise. **Applied to the tax-inclusive total**; item/booking tax fields are **not** reduced (the pre-discount tax components stay on the records). Eligible amount (cart): POOJA coupons → Σ booking totals; PRODUCTS/MARKETPLACE coupons → Σ product totals (`:266-269`). Single booking: POOJA → full `grandTotal`; KITS-only → kit amount + kit GST (`booking.controller.js:293-308`) — **KITS coupons work only on the single-booking path**.
- **Coin value**: `coinCoinsUsed = min(requested, wallet.balance, floor(payable / rate))`, `coinValue = coins × rate` with `rate = settings.coinMonetaryValue` (admin; may be null → request refused); eligibility threshold `coinRedemptionMinCoins` is a **minimum wallet balance**, not a per-order minimum. Pooja only, never with a coupon (`coinRedemptionService.js:40-81`).
- **Final payable**: booking = `grandTotal − couponDiscount − coinValue` then `resolveChargeAmount` for partial payment (applied to the *post-discount* payable, `:82-100`); cart = `bookingTotal + productTotal − couponDiscount − coinValue` (`:247-389`).
- **Trust boundary**: the amount PhonePe charges is the server's. Client-supplied values that reach the server are `couponCode`, `coinRedemptionCoins`, `partialAmount` and the ids/quantities; all are validated and capped server-side. The one place a client number is *used for a decision* is the **preview** `cartValue` (`/coupons/validate`).
- **Invoices**: no coupon/coin handling in `invoiceGenerator.js`, `invoice.controller.js`, `Invoice` model or the website invoice (searched) — whether invoice totals reconcile with discounted payments is **Not verified** (needs runtime evidence).

## 7. Security, concurrency and payment-retry findings

| ID | Severity | Type | Finding | Evidence | Impact | Recommendation |
|---|---|---|---|---|---|---|
| F07-01 | Medium | Confirmed | `POST /checkout/cart` validates the coupon **after** persisting the Bookings (`:107-147`) and the Order (`:232-242`); a rejected coupon returns 400 with those `pending_payment` documents left behind (already noted in `docs/MOBILE_TESTING.md` follow-ups). The single-booking endpoint and the legacy marketplace endpoint validate first. | `checkout.controller.js:252-285` | Orphan unpaid orders/bookings (visible in My Orders / My Bookings, retryable); the expiry sweep is off by default | Backend (needs approval): validate coupon/coins before any `create`. Until then a mobile cart coupon must be pre-validated and still tolerate the 400. |
| F07-02 | Medium | Confirmed | The website's **mixed-cart** coupon preview sends the whole cart total with `cartType: 'POOJA'`, while the server applies a POOJA coupon only to the booking portion and checks `minCartValue` on that portion. Result: over-stated preview discount; a coupon valid for products only is *rejected* in the mixed-cart preview; a coupon can pass the preview and fail at checkout (F07-01). | `CartPage.jsx:42-55` vs `checkout.controller.js:259-285` | Preview ≠ payable; confusing failures | Do **not** copy this to mobile. A correct preview needs a server-computed quote (backend) or a base that matches the server's eligible portion. |
| F07-03 | Low–Medium | Confirmed | In a mixed cart a POOJA-only coupon's discount is split over `bookingTotal + productTotal` (denominator includes products); the unallocated remainder is then applied to the **marketplace order**. The total is right, the per-item attribution is not. | `checkout.controller.js:295-319` | Misattributed discount (refunds, reporting, invoices) | Backend/owner: allocate only to eligible items. |
| F07-04 | Medium | Confirmed | Coupon redemptions are recorded **per booking and per order** (`:321-347`), each doing `usageCount $inc 1` and each counting toward `perUserLimit` (counts documents). One checkout with N bookings + an order consumes N+1 uses. | `couponService.js:158-202`; `checkout.controller.js:321-347` | Limits (`usageLimit`, `perUserLimit`) consumed faster than "one use per checkout" | Owner decision on the unit of "one use"; backend change. |
| F07-05 | Medium | Confirmed | A redemption is recorded at checkout creation and **never released**: no code decrements `usageCount` or reverses a redemption on payment failure, cancellation, refund or order expiry (searched). Errors recording the redemption are swallowed (`.catch(() => {})`), so a discount can be applied without a redemption record. | `couponService.js:199`; `checkout.controller.js:333, 346`; `booking.controller.js:442` | An abandoned/failed payment burns the coupon (default `perUserLimit` 1); swallowed errors bypass limits | Owner decision (when is a coupon "used"?); backend change. |
| F07-06 | Medium | Confirmed (pattern) / race **Not verified** | Limit checks are read-then-act (`validateCoupon` counts, `recordRedemption` `$inc`s unconditionally; the unique key is per coupon+document, not per user). Concurrent checkouts can exceed `usageLimit`/`perUserLimit`. No concurrency test exists. | `couponService.js:114-127, 158-202` | Over-redemption | Backend: conditional/atomic claim; add a concurrency test. |
| F07-07 | Medium | Confirmed (logic) / race **Not verified** | **Coins are not reserved.** They discount the booking at checkout but are debited only after payment (`settleCoinRedemption`). The debit checks `balance` by reading, then writes the ledger row and `$inc`s without a `balance ≥ amount` guard, so two concurrent settlements can overdraw; and if the balance dropped meanwhile the debit **throws inside verify** (the booking is already marked paid) instead of failing cleanly. Two simultaneous checkouts can both be discounted with the same coins. | `walletService.js:146-206`; `coinRedemptionService.js:91-108`; verify paths (`booking.controller.js:532`, `checkout.controller.js:672`) | Free discount / 500 from verify | Backend: reserve or atomically conditional-debit; decide behaviour when settlement fails. Mobile must not rely on a local balance. |
| F07-08 | Low–Medium | Potential | In the cart path a coupon can bring `combinedTotal` to 0 (the guard `combinedTotal === 0` runs *before* the coupon); only the coin path has an inline "paid with coins" branch, so a coupon-only zero total reaches `createPhonePeOrder` with amount 0. The single-booking path handles `payableTotal ≤ 0` for any cause. | `checkout.controller.js:247-249, 288, 405, 439` | Gateway error after documents exist | Verify at runtime; backend fix if confirmed. |
| F07-09 | Medium | Confirmed | `referralToken` (Pandit referral) is honoured **only** by `/bookings/create-phonepe-order`; the cart path never sets `booking.referral`, and the website cart does not send it. Bookings paid through the cart lose Pandit-referral attribution (website too). | `checkout.controller.js:107-144` (no `referral`); `CartPage.jsx:159-165` | Referral attribution lost | Product/backend decision. |
| F07-10 | Low | Confirmed | Mobile never captures or sends `referralToken`, has no `/r/<token>` route, and loses a *warm-start* `ref` (Day 11 P-10). | `BookingFlowScreen.jsx` (no referral), `App.jsx:27-53`, `RegisterScreen.jsx:58` | Pandit referral flow unavailable on mobile | After F-18; mobile-only for the single-booking path. |
| F07-11 | Low–Medium | Confirmed | Discounts are invisible downstream: invoices (backend + website) have no coupon/coin rows; mobile detail screens show only the payable. For a coupon order made on the website the mobile order screen shows subtotal + tax ≠ total. | §4, §6 | Confusing amounts; invoice reconciliation **Not verified** | Mobile: show persisted discount rows (safe, read-only). Invoice: owner/backend. |
| F07-12 | Info | Confirmed | Mobile partial-payment client checks compare against `grandTotal`, not the coin-adjusted payable; the server compares against the post-discount payable (`resolveChargeAmount`), so the server's error is what the user sees. | `BookingFlowScreen.jsx:317-326` vs `booking.controller.js:82-100` | Weaker client validation | Align the client check with the displayed payable. |
| F07-13 | Info | Confirmed | **Day 12 recovery constraints:** `PaymentVerify`/recovery contexts for `type: 'marketplace'` require an `orderId`; `mapCheckoutResponse` requires `order._id`. A booking-only or mixed cart has bookings (and possibly no order), so it needs a new context shape (e.g. booking ids + order id) and verify handling. The `/checkout/verify` response already carries both `bookings` and `order`. | `utils/paymentRecovery.js`, `marketplaceCheckout.js:47-64` | A naive combined cart would break recovery | Design before coding (§9 Phase 5). |
| F07-14 | Info | Confirmed | **Idempotency key reuse:** the server fingerprint includes `couponCode` and `coinRedemptionCoins`; mobile's `cartFingerprint` (`utils/checkoutAttempt.js`) covers only products + address. Adding a coupon without extending the mobile fingerprint would make a retained key return 422 `IDEMPOTENCY_KEY_REUSED` when the coupon changes. | `checkoutIdempotency.js:44-64` | Failed retries | Extend the fingerprint with any F-07 input. |
| F07-15 | Info | Confirmed | Coupon and coin rules differ by endpoint: KITS coupons only on the single booking; coins pooja-only (never with products or a coupon); legacy `/marketplace/orders/create` prices items **without tax** and validates the coupon on the pre-tax total (not used by mobile). | §6 | Mobile must follow the endpoint it uses | Document in the implementation. |

Requirements any F-07 work must preserve (Day 11/12): server-authoritative totals; `ZUT_CART_`/`ZUT_CART_RETRY_` and legacy `ZOM_` verification; retry idempotency and the persisted-amount retry; single-flight verification; the user-bound pending-payment record and logout cleanup; "an order may exist while payment is pending"; no success from a redirect/parameter; F-24 Android settings.
**Separate payment-release dependencies (not resolved by this audit):** the payment-URL host allow-list, and real-device / real-PhonePe verification.

## 8. Confirmed gaps versus unverified assumptions

**Confirmed (source):** no coupon UI on mobile; coin redemption only in booking flow and untested; no Pandit `referralToken` on mobile; no combined cart on mobile; no persisted-discount display on mobile; the F07-01…F07-15 items above.

**Not verified (needs runtime or owner input):** coupon/coin races (F07-06/-07); the zero-total coupon path (F07-08); invoice reconciliation with discounts; whether `userReferralEnabled` is on in production; real values of `coinMonetaryValue`, `coinRedemptionMinCoins`, referral reward settings; whether users receive coupon codes through campaigns/notifications (no user-facing list endpoint exists); mobile `WalletScreen`/`MyReferralsScreen` behaviour on a device.

## 9. Recommended phased plan (candidate phases; none started)

| Phase | Scope | Mobile modules | Backend change? | Tests | Risks / decisions | Depends on |
|---|---|---|---|---|---|---|
| 1 — Read-only parity (**recommended first**) | Show persisted `couponCode`, `couponDiscount`, `coinCoins`, `coinValue` on booking/order detail; contract tests for `GET /wallet`, `WalletScreen`, and the **existing** coin redemption in `BookingFlowScreen` (payload, eligibility, server `chargeAmount`) | `BookingDetailScreen`, `OrderDetailScreen`, new tests | No | New screen/contract tests; no payment-flow change | None financial: displays server fields | — |
| 2 — Booking coupon apply/remove | Coupon field in `BookingFlowScreen` (POOJA preview `cartValue` = the pooja-eligible amount; mutually exclusive with coins; send `couponCode` only; show the server's `chargeAmount`/`couponDiscount`) | `BookingFlowScreen`, helper, tests | **No** (reuses `/coupons/validate` + `create-phonepe-order`) | Preview vs commit payloads, exclusivity, invalid/expired/exhausted coupon, partial payment | A coupon is consumed at creation even if payment fails (F07-05) — **owner decision**; preview base must match the server | Phase 1 |
| 3 — Marketplace cart coupon | Coupon field in `CartScreen` | `CartScreen`, `marketplaceCheckout`, `checkoutAttempt` (fingerprint, F07-14) | **Yes, recommended**: validate-before-persist (F07-01) and a server-computed cart quote (tax-inclusive base, F07-02) | Cart + coupon, rejection leaves no order, key reuse | Orphan orders; tax-inclusive base; unit of redemption (F07-04) | Backend/owner approval |
| 4 — Referral | Capture `/r/<token>` and warm-start `ref`; send `referralToken` for single bookings | `App.jsx` linking, `RegisterScreen`, `BookingFlowScreen` | Only if Pandit attribution must also work in the cart (F07-09) | Link parsing, attribution payload | Needs F-18 canonical host/App Links; reward rules are admin-set | F-18 |
| 5 — Combined cart | Pooja items in the cart, one payment | `cartStore`, `BookingFlowScreen` "add to cart", `CartScreen`, `marketplaceCheckout.mapCheckoutResponse`, `paymentRecovery` (new context shape, F07-13), verify navigation | **No new order model required** — the endpoint exists; fix F07-01/-03/-04 first | Combined payloads, recovery, retry, coin/coupon exclusivity | Large; product decision on whether the app should offer it; pricing display for pooja items; address handling | Phases 1–3 |

Never compute a discounted final amount on the client and treat it as authoritative; always display the server's `chargeAmount` / `totals` / `order.totalAmount`.

## 10. Owner / product decisions and external verification

Decisions: when a coupon counts as "used" (creation vs paid; release on failure/cancel/expiry); the unit of one use (per checkout vs per item); discount base (tax-inclusive today) and whether tax/invoices should reflect discounts; whether coins should be reserved and what happens if settlement fails; whether the app should offer the combined cart; whether mobile cart bookings should carry Pandit referral attribution; coin rate / threshold / referral reward values (admin settings — not to be assumed).
External/runtime: concurrency tests for coupon and wallet; the zero-total coupon path; invoice reconciliation; device testing; PhonePe sandbox; the Day 11/12 payment-release items.

## 11. Key source references

Backend: `src/routes/{coupon,wallet,userReferral,referral,checkout,booking}.routes.js`; `src/controllers/{coupon,wallet,userReferral,referral,checkout,booking,auth,marketplace}.controller.js` (`checkout.controller.js:59-463` core, `:252-348` coupon, `:350-389` coins; `booking.controller.js:242-477`); `src/services/{couponService,coinRedemptionService,walletService,userReferralService,poojaLoyaltyService,checkoutIdempotency}.js`; `src/models/{Coupon,CouponRedemption,UserWallet,WalletTransaction,UserReferralCode,Order,Booking}.js`; tests read by name: `coupon-system`, `coin-redemption`, `user-referral-phase1`, `referral-booking-reward`, `pooja-loyalty-reward`, `checkout-integrity`, `order-payment-retry`.
Website: `frontend/src/pages/{CartPage,BookingFlow,Register,ReferralLanding,Wallet,MyReferrals}.jsx`, `components/booking/{ReviewStep.jsx,constants.js}`, `context/CartContext.jsx`.
Mobile: `mobile-app/src/screens/user/{CartScreen,BookingFlowScreen,BookingDetailScreen,OrderDetailScreen,WalletScreen,MyReferralsScreen}.jsx`, `screens/auth/{Register,OTP,SetPassword}Screen.jsx`, `screens/pandit/PanditReferral*.jsx`, `store/cartStore.js`, `utils/{marketplaceCheckout,checkoutAttempt,priceEngine,paymentRecovery}.js`, `App.jsx`.
Read first: `docs/MAPS_ARCHITECTURE_AUDIT.md`, `docs/PAYMENT_RETURN_DEEP_LINKS_AUDIT.md`, `docs/MOBILE_TESTING.md`.

## 12. Scope statement

**No Source Changes Made.** This audit created exactly one file, `docs/MOBILE_F07_CHECKOUT_PARITY_AUDIT.md`. No frontend, backend, mobile, test,
package, lockfile, environment, native or existing documentation file was modified; nothing was staged, committed, pushed or deployed; no
dependency was installed; no test or backend process was started; no payment, coupon, wallet, referral or other endpoint was called; no record was created
or changed; and no secret, credential, personal data or live transaction identifier was read or recorded.
