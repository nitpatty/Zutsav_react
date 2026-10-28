# Zutsav — Mobile App vs Website Feature-Parity Audit (User & Pandit)

| | |
|---|---|
| **Report date** | 2026-10-25 |
| **Audit type** | Read-only, static-evidence investigation (no code changes, no deployments, no data created) |
| **Baseline** | Website (`frontend/` + `backend/`) — treated as the reference |
| **Subject** | `mobile-app/` (Expo 51 / React Native 0.74.5) — **User and Pandit roles only** (Admin screens, 21 files, are out of scope) |
| **Repository state at audit** | branch `main`, working tree clean at start (HEAD `e77ef97`) |
| **Status of this document** | Findings and a proposed roadmap only. **No fixes have been implemented. Development awaits explicit approval.** |

> **Headline:** 0 of 107 applicable features are *COMPLETE — VERIFIED*. That is because the mobile app has **no automated tests and no device/E2E evidence** (F-14); under this audit's evidence rule no mobile row can be called verified-complete from reading code alone. The more useful numbers are in Section L: 21 features are **PARTIAL** (a concrete defect or contract mismatch was found in code), 23 are **PENDING** (present on the website, absent on mobile), and 63 implemented features show **no discrepancy in the static trace** but are unverified.

---

## A. Executive Summary

**What was asked.** Compare the mobile app to the website for the User and Pandit roles, treating the website as the baseline, and report gaps without changing anything.

**Result at a glance** (denominator excludes NOT APPLICABLE and NOT PRESENT ON WEBSITE rows; see Section L):

| Audience | COMPLETE — VERIFIED | PARTIAL | PENDING | NOT IMPLEMENTED | BLOCKED | NOT VERIFIED | NOT APPLICABLE | NOT PRESENT ON WEBSITE | Total rows | Denominator (excl. NA + NP) | Verified-complete % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| User | 0 | 15 | 18 | 0 | 0 | 37 | 3 | 7 | 80 | 70 | 0/70 = 0.0% |
| Pandit | 0 | 6 | 5 | 0 | 0 | 26 | 0 | 2 | 39 | 37 | 0/37 = 0.0% |
| **Combined** | 0 | 21 | 23 | 0 | 0 | 63 | 3 | 9 | 119 | 107 | 0/107 = 0.0% |

**Reading the numbers.**
- *Verified-complete is 0% by design of the evidence rule, not because nothing works.* Most of the app's core flows (registration, booking, PhonePe payment and verification, pandit KYC, accept/reject/complete, earnings) have a consistent static trace to the backend contract. They are classed NOT VERIFIED rather than complete.
- *Static-parity indicator (not a verification result):* of 70 applicable User rows, 37 (52.9%) are implemented with no discrepancy found; of 37 applicable Pandit rows, 26 (70.3%). Combined: 63/107 = 58.9%.
- *Mobile is ahead of the website in places:* a paginated My Bookings list (the website shows only 10 — F-27), richer booking detail with payment ledger/refund card, a full address-book manager (the website uses an inline picker).
- *Several earlier "gaps" in docs/MOBILE_FEATURE_GAP_ANALYSIS.md no longer exist* (forgot/reset password, family members, partial payment, panchang model, payment-verify routing, pandit approval gate, wallet). That document is stale (F-26).

**Top findings** (full register in Section L.6, security/reliability view in Section J;28 findings: P0=0, P1=5, P2=16, P3=7):

1. **F-01 (P1)** — Mobile sessions are issued as 1-day "session" tokens but kept forever; expiry leaves a dead authenticated UI.
2. **F-03 (P1)** — Shop checkout on mobile uses a different (older) order endpoint than the website — pricing/tax/coupon/coin differences.
3. **F-02 (P1)** — Customer invoice screen reads data the booking-invoice endpoint does not return.
4. **F-04 (P1)** — Legal documents (Privacy, Terms, Refund, About) and admin-managed footer links are not reachable in the app.
5. **F-14 (P1)** — The mobile app has no automated tests and no test runner.

No **P0** was assigned. F-03 (shop orders created on mobile omit product tax and variant sale prices) becomes P0 if the business confirms product GST must always be charged.

**Recommended first step** (Section M, Phase 1): decide the open product questions (Section N), then stand up a mobile test harness and fix the contract-drift defects that are small, mobile-only and high-value (F-14, F-01, F-15, F-10, F-11, F-12, F-13, F-23).

---

## B. Scope & Methodology

### B.1 Scope
- **In scope:** mobile User role (customer) and Pandit role vs the website equivalents, including the backend contracts they share.
- **Out of scope:** Admin role on mobile (21 screens) and on web; website changes; fixing anything; production/live-environment verification.
- **Baseline rule:** the website is the reference. Where the website itself is defective or lacks a feature, the row is NOT PRESENT ON WEBSITE or the item is logged as a *website baseline* finding (F-27, F-28), not as a mobile gap.

### B.2 Safety constraints observed
No source, manifest, lockfile or config was modified; no dependency installed; no formatter/fixer, migration, seeder or destructive script run; no real booking/order/payment/user/pandit created; no deploy; no reset/stash/clean; nothing committed or staged. The only file written into the repository is this report. Tests used isolated `*_test` databases (`MONGO_URI_TEST` unset) and the mobile bundle was exported to a temporary directory outside the repo (Section K). Scripts and logs live in the session scratchpad, outside the repo. No secrets, tokens or personal data are reproduced here.

### B.3 Evidence types
1. **Static trace (all mobile rows):** read the mobile screen/store, the website equivalent and the backend controller/route/model, and compared endpoints, payloads and field names.
2. **Automated scans** (read-only scripts): extracted every `api.<verb>(...)` call in website (non-admin) and mobile source (Section I); route inventory of the backend; a heuristic check of fields read by mobile screens against backend model definitions; a declared-vs-imported dependency check.
3. **Executed checks:** backend test suite, website test suite, and a Metro/Hermes production bundle of the mobile app (Section K).
4. **Not available:** device/emulator runs, mobile unit/E2E tests, live PhonePe, live backend. These are why nothing mobile is COMPLETE — VERIFIED.

### B.4 Status definitions (exactly one per row)
| Status | Meaning in this report |
|---|---|
| COMPLETE — VERIFIED | Implemented, parity confirmed **and** backed by executed evidence (mobile test or device run). None qualify. |
| PARTIAL | Exists on mobile but a concrete defect, contract mismatch or material omission was found in the code. |
| PENDING | On the website, absent on mobile (no screen/call found by search). Treated as pending parity work; whether it is *intended* to be absent is a product question (Section N). |
| NOT IMPLEMENTED | Reserved for features confirmed deliberately absent/stubbed; none are used — absent features are PENDING until product confirms scope. |
| BLOCKED | Cannot be assessed because of an external blocker. None. |
| NOT VERIFIED | Implemented; static trace found no discrepancy; no executed evidence. Split by evidence depth below. |
| NOT APPLICABLE | The website feature has no meaningful mobile counterpart by design (e.g. browser-only public invoice page). |
| NOT PRESENT ON WEBSITE | The website has no such feature (or it is a placeholder); nothing to match. |

### B.5 Evidence depth for NOT VERIFIED/PARTIAL rows
- **Depth A** — the mobile screen/store source was read end-to-end and compared with web and backend.
- **Depth B** — the screen was *not* read end-to-end; the conclusion rests on the API-call scan (same method + path used as the website) and heuristic field checks. Confidence is capped at Medium.

Applicable rows by depth — User: A=54, B=16; Pandit: A=20, B=17. Confidence labels in the matrices carry the depth.

### B.6 Severity and priority
Row *severity* is a short impact note. Findings use **P0** (data/money integrity or security breach in production), **P1** (user-visible money/compliance/session failure or no safety net), **P2** (functional gap or hardening), **P3** (minor/hygiene/documentation).

### B.7 Known limits of the method
- API scan regexes miss dynamically built URLs (e.g. `PaymentVerifyScreen`); these are called out in Section I.
- Field-name checks are heuristic and were confirmed manually before being reported as findings.
- Production environment values (JWT TTL, PhonePe credentials, gateway return URLs, feature flags) were not inspected.

---

## C. Repo & Architecture Map

| Area | Stack / facts |
|---|---|
| `backend/` | Node/Express + Mongoose, JWT (`protect`/`authorize`/`optionalAuth`), `express-rate-limit`, multer uploads, Socket.IO notifications, PhonePe payments, append-only admin audit log. 422 route handlers across 41 route files (static scan). 34 test files (880 tests). |
| `frontend/` (website) | Create React App, React 18, React Router v6; 43 page components; 51 `<Route>` entries in `App.jsx`; 9 Jest suites / 162 tests. |
| `mobile-app/` | Expo 51 / React Native 0.74.5, React Navigation, zustand stores, expo-secure-store (JWT), axios, Socket.IO client, expo-print/sharing, react-native-maps. 9 auth + 32 user + 22 pandit screens (+21 admin). No test runner. A **bare `android/` project is committed** (50 tracked files). |

**Mobile navigation.** `RootNavigator`: no user → `AuthNavigator`; role `pandit` → `PanditGateNavigator` (status + KYC only) until `pandit.status === 'approved'`, then `PanditNavigator` (4 tabs: Dashboard, Bookings, Referrals, Profile); other roles → `UserNavigator`. Auth state is a zustand store persisted in SecureStore; `panditStatusStore` is a sequence-guarded fetch of `GET /pandits/me`.

**Request path.** `mobile-app/src/api/axios.js` (Bearer token; 401 interceptor) → `/api`. Base URL from `EXPO_PUBLIC_API_URL` (EAS profiles set it; fallback is a LAN dev host). Realtime: `utils/socket.js` (foreground only). Payments: PhonePe via the external browser then `PaymentVerifyScreen` polling `verify-*` endpoints.

**Contract sources for parity.** Backend routes mount under `/api`; the website and mobile share nearly all customer/pandit endpoints (Section I: 114 of 147 website call-shapes are also issued by mobile).

---

## D. Website Feature Inventory (baseline)

Features the website offers to the audience (derived from the matrix rows whose website status is *Implemented*; evidence paths are in Sections F/G).

**User — Authentication** (7): Password login; OTP login; Login of account in deletion grace period → restore; Registration; Forgot / reset password; Session persistence and expiry handling; Logout and per-user client state cleanup.

**User — Account** (2): Change password; Account deletion request.

**User — Profile** (6): View/edit personal details; Profile photo upload; Profile photo removal; Saved address book; Family members; WhatsApp communication consent.

**User — Settings** (2): Theme selection; Language selection + translated content.

**User — Public experience** (7): Guest browsing before login; Hero / promotional banners; Legal documents in-app; Public branding & contact settings; Pandit referral landing link; Admin-issued public invoice share link; Footer custom links.

**User — Pooja discovery** (4): Pooja categories browse → category list; Pooja search and paginated list; Pooja details content; Public pooja reviews and rating summary.

**User — Booking** (9): Booking type; Kit preference and multi-kit selection; Language, special note, contact/address details, saved-address picker, map; Price preview and partial-payment option; Coupon code at booking; Coin; Pandit-referral token captured onto a booking; Add a pooja to the unified cart; Guest-to-login checkpoint with restored booking.

**User — Payment** (7): Create booking order and pay via PhonePe; Verify payment; Retry a failed booking payment on the same booking; Pay remaining balance of a partial payment; Return to the app after the gateway page; Coin-only payment; Wallet balance and coin transaction history.

**User — My bookings** (6): List with status filters and pagination; Booking detail; Cancel booking with refund preview; Rate a completed booking; Booking invoice view / share; Refund status visibility after cancellation.

**User — Marketplace** (8): Browse, categories, search; Product detail with variants and stock; Cart: add / update / remove; Coupon code on cart; Coin redemption on cart; Checkout / order creation and pricing; Order list, detail, shipment tracking, delivery-OTP notice; Order invoice.

**User — Content** (10): Temple directory; Temple detail; Festival list and detail; Panchang daily + week; Blogs: read, search, like, bookmark, comment, share; Blog authoring by customers; My blogs list and bookmarks; Livestreams; AI assistant — free chat; AI guided recommendation.

**User — Notifications** (3): In-app notification list, mark read, delete, clear all; Real-time notification delivery; Tap-through routing from a notification to its booking/order.

**User — Referrals & rewards** (2): Customer referral program; Referral deep link opens the app and pre-fills the code.

**Pandit — Authentication** (3): Pandit login; Pandit self-registration; Change password / delete account / logout cleanup.

**Pandit — Approval gate** (2): Dashboard access by application status; Application status screen.

**Pandit — KYC** (2): KYC submission; Document OTP verification and accept/decline decision; masked document view.

**Pandit — Profile** (8): Personal info; Address and languages; Education / qualifications; Specializations; Family information; Bank details, UPI, UPI verification; Profile photo upload; Profile completion indicator.

**Pandit — Services** (2): Select catalog poojas and set service details; Request a custom pooja not in the catalog.

**Pandit — Availability** (3): Online/offline toggle; Weekly schedule, blocked dates, special dates, availability toggle; Schedule calendar.

**Pandit — Bookings** (5): Assigned bookings list with status tabs; quick accept; Booking detail, accept, reject with reason; Cancel an accepted booking with reason; Request completion + verify customer OTP; Booking invoice / earnings document for pandit.

**Pandit — Earnings** (2): Payout stats, pending payouts, payout history; Reviews tab inside Earnings.

**Pandit — Ratings** (1): Dedicated "Customer Reviews" screen.

**Pandit — Referrals** (2): Create pandit referral; Share referral link that opens the app / attributes booking.

**Pandit — Content** (3): Upcoming festivals widget on dashboard; Blog authoring; Browse blogs, festivals, panchang as a pandit.

**Pandit — Notifications** (1): Pandit notification list with tap-through to booking/referral.

**Pandit — Settings** (3): Pandit settings; Language selection / translated content; Legal documents in-app.

**Website features that are placeholders or absent** (used as *NOT PRESENT ON WEBSITE*): U-PUB-005 Help / support / contact page; U-POOJA-005 Pandit directory / pandit profile pages for customers; U-MYB-007 Reschedule a booking; U-SHOP-009 Order cancel / return by customer; U-SHOP-010 Product reviews / wishlist; U-CONT-011 Kundli; U-NOTIF-004 OS push notifications (device registration, delivery, background tap routing); P-NOTIF-002 OS push notification for new booking requests; P-SET-004 WhatsApp consent preference center.

---

## E. Mobile Feature Inventory

Mobile screens by area (file counts above). Per-feature mobile evidence is in the `Mobile status & evidence` column of Sections F/G. Summary by status:

| Module | Rows | PARTIAL | PENDING | NOT VERIFIED | NA/NP | Denominator |
|---|---|---|---|---|---|---|
| Authentication | 10 | 6 | 0 | 4 | 0 | 10 |
| Account | 2 | 0 | 0 | 2 | 0 | 2 |
| Profile | 14 | 0 | 2 | 12 | 0 | 14 |
| Settings | 6 | 0 | 3 | 2 | 1 | 5 |
| Public experience | 8 | 1 | 4 | 0 | 3 | 5 |
| Pooja discovery | 5 | 1 | 2 | 1 | 1 | 4 |
| Booking | 9 | 0 | 3 | 5 | 1 | 8 |
| Payment | 7 | 0 | 1 | 6 | 0 | 7 |
| My bookings | 7 | 3 | 0 | 3 | 1 | 6 |
| Marketplace | 10 | 1 | 2 | 5 | 2 | 8 |
| Content | 14 | 5 | 3 | 5 | 1 | 13 |
| Notifications | 6 | 0 | 0 | 4 | 2 | 4 |
| Referrals & rewards | 2 | 1 | 0 | 1 | 0 | 2 |
| Approval gate | 2 | 1 | 0 | 1 | 0 | 2 |
| KYC | 2 | 0 | 0 | 2 | 0 | 2 |
| Services | 2 | 0 | 1 | 1 | 0 | 2 |
| Availability | 3 | 0 | 1 | 2 | 0 | 3 |
| Bookings | 5 | 1 | 0 | 4 | 0 | 5 |
| Earnings | 2 | 0 | 0 | 2 | 0 | 2 |
| Ratings | 1 | 1 | 0 | 0 | 0 | 1 |
| Referrals | 2 | 0 | 1 | 1 | 0 | 2 |

**Mobile-only or mobile-richer capabilities observed:** paginated My Bookings; booking detail with payment ledger, refund card and audit-style timeline; full address-book manager (website uses an inline picker); notification tap-through using customer-scoped by-number lookups; pandit earnings screen with pending/history/reviews tabs; Expo-print/share invoices.

**Dead or placeholder code on mobile:** push-token acquisition (`utils/fcm.js`, F-05); unused dependencies (F-17).

---

## F. User Parity Matrix

Row counts: 80 rows; denominator 70 (excl. 3 NA + 7 NP).

| Feature ID | Audience | Module | Feature / action | Website status & evidence | Mobile status & evidence | Backend dependency | Persistence | Functional gap | Test evidence | Severity | Confidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| U-AUTH-001 | User | Authentication | Password login (email or 10-digit phone) | Implemented — frontend/src/pages/Login.jsx → context/AuthContext.jsx login() | **PARTIAL** — mobile-app/src/screens/auth/LoginScreen.jsx → store/authStore.js login() | POST /api/auth/login (backend/src/controllers/auth.controller.js login, signToken) | JWT in expo-secure-store (zutsav_token/zutsav_user) | Mobile never sends `rememberMe`; server then issues a SESSION token (`JWT_EXPIRES_IN_SESSION`, default 1d) while the app keeps it indefinitely. The "Remember me" checkbox (LoginCard/RememberMe) is cosmetic. See F-01. | B: none at HTTP level for /auth/login. No mobile tests exist. | High — daily forced re-authentication; failure state is silent | High — static, depth A | Env default for JWT_EXPIRES_IN_SESSION not verifiable from repo (.env.example only lists JWT_EXPIRES_IN=7d). |
| U-AUTH-002 | User | Authentication | OTP login (send code, verify code) | Implemented — frontend/src/context/AuthContext.jsx sendLoginOtp/loginWithOtp; Login.jsx | **PARTIAL** — mobile-app/src/screens/auth/LoginOtpScreen.jsx, OTPScreen.jsx (purpose='login') → authStore.loginWithOtp() | POST /api/auth/login/otp/send\|verify (backend/src/controllers/otpLogin.controller.js) | JWT in secure store | Same missing `rememberMe` → 1-day token (otpLogin.controller.js:196/231 uses `!!rememberMe`). Client identifier validation mirrors server (good). | B: otp-login.test.js (server). No mobile tests exist. | High — see F-01 | High — static, depth A | — |
| U-AUTH-003 | User | Authentication | Login of account in deletion grace period → restore | Implemented — frontend/src/pages/Login.jsx (POST /auth/delete-account/cancel) | **NOT VERIFIED** — mobile-app/src/screens/auth/LoginScreen.jsx handleRestoreAccount() | POST /api/auth/delete-account/cancel (auth.controller.js cancelAccountDeletion) | User.accountStatus | No discrepancy found in the traced chain. | B: none. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-AUTH-004 | User | Authentication | Registration (details → OTP channel → OTP → password → consent → referral code) | Implemented — frontend/src/pages/Register.jsx | **NOT VERIFIED** — mobile-app/src/screens/auth/RegisterScreen.jsx → VerificationChannelScreen → OTPScreen → SetPasswordScreen | POST /api/auth/send-otp, /verify-otp, /complete-registration (auth.controller.js) | User (+ consent events, referral attribution, wallet credit) | Mobile sends service/marketing consent and referral code like web; does not send `preferredLanguage` (mobile is English-only, see U-PROF-008). | B: complete-registration referenced by 3 backend tests; No mobile tests exist. | Low — verification gap only | High — static, depth A | The prior report's "wrong auth-store method" bug is not present: SetPasswordScreen uses setSession(). |
| U-AUTH-005 | User | Authentication | Forgot / reset password (check account → OTP → verify → reset) | Implemented — frontend/src/pages/ForgotPassword.jsx | **NOT VERIFIED** — mobile-app/src/screens/auth/ForgotPasswordScreen.jsx, OTPScreen.jsx, ResetPasswordScreen.jsx | POST /api/auth/forgot-password/* (backend/src/controllers/passwordReset.controller.js) | OTP, User.password, User.tokenVersion | None found. Password rule (≥8, strength list) matches web. | B: none for /forgot-password. No mobile tests exist. | Low — verification gap only | Medium — static, depth B | Prior report claimed this was missing; it exists and is wired. |
| U-AUTH-006 | User | Authentication | Session persistence and expiry handling | Implemented — frontend/src/api/axios.js (401 → zutsav:unauthorized → logout) | **PARTIAL** — mobile-app/src/api/axios.js 401 interceptor; store/authStore.js hydrate() | JWT verify in backend/src/middleware/auth.js protect() | SecureStore (token/user) + in-memory zustand user | On 401 the interceptor deletes SecureStore items but does not clear the in-memory `user`, so RootNavigator keeps showing the authenticated stack while every call fails; the code comment says the auth store "will catch this" but nothing does. `refreshUser` is only called from ProfileScreen. | No mobile tests exist | High — see F-01 | High — static, depth A | — |
| U-AUTH-007 | User | Authentication | Logout and per-user client state cleanup | Implemented — frontend/src/context/AuthContext.jsx logout() | **PARTIAL** — mobile-app/src/store/authStore.js logout() | POST /api/auth/logout (admin-tier sessions only) | Local: SecureStore, AsyncStorage (zutsav_cart, zutsav_cache_*), zustand stores | Logout clears the token/user only. Cart (`zutsav_cart`), cached notifications/dashboard (`zutsav_cache_*`) and in-memory notification/cart stores are not cleared, so the next account on the device can see the previous account's data. See F-15. | No mobile tests exist | Medium — cross-account data exposure on shared devices | High — static, depth A | — |
| U-AUTH-008 | User | Account | Change password | Implemented — frontend/src/pages/Profile.jsx PATCH /users/change-password | **NOT VERIFIED** — mobile-app/src/screens/user/ChangePasswordScreen.jsx | PATCH /api/users/change-password | User.password | None found (min 6 both). | B: none. No mobile tests exist. | Low — verification gap only | Medium — static, depth B | — |
| U-AUTH-009 | User | Account | Account deletion request (password check → OTP → confirm) | Implemented — frontend/src/pages/Profile.jsx delete-account/* | **NOT VERIFIED** — mobile-app/src/screens/user/DeleteAccountScreen.jsx | POST /api/auth/delete-account/check-password\|send-otp\|confirm + /api/auth/verify-otp(purpose=account_deletion) | User.accountStatus, scheduledDeletionDate | None found; OTP identifier derived from chosen channel (prior report's suspected phone-only bug is not present). | B: none. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-PROF-001 | User | Profile | View/edit personal details (name, email, pincode auto-fill, state/city/district, address, map coordinates) | Implemented — frontend/src/pages/Profile.jsx PATCH /users/profile | **NOT VERIFIED** — mobile-app/src/screens/user/PersonalInfoScreen.jsx → authStore.updateUser() | PATCH /api/users/profile | User | None found; field set matches web card. | B: user routes referenced by 1 test. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-PROF-002 | User | Profile | Profile photo upload | Implemented — frontend/src/components/shared/ProfilePhoto.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/ProfileScreen.jsx POST /users/profile/photo (multipart) | POST /api/users/profile/photo (uploadProfile) | uploads/profiles + User.profilePhoto | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-PROF-003 | User | Profile | Profile photo removal | Implemented — frontend/src/components/shared/ProfilePhoto.jsx deleteEndpoint=/users/profile/photo | **PENDING** — No screen/API call for removal (grep "profile/photo" → upload only) | DELETE /api/users/profile/photo | User.profilePhoto | Mobile cannot remove a photo. | No mobile tests exist | Low | High — static, depth A | — |
| U-PROF-004 | User | Profile | Saved address book (list, add, edit, delete, default) | Implemented — frontend/src/components/shared/AddressPicker.jsx; booking/DetailsStep.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/AddressBookScreen.jsx, components/shared/AddressPicker.jsx, hooks/useAddresses.js | GET/POST/PATCH/DELETE /api/users/addresses | User.addresses | None found (mobile has a full manager screen; web has inline picker). | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-PROF-005 | User | Profile | Family members (list, add, edit, delete) | Implemented — frontend/src/pages/FamilyMembers.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/FamilyMembersScreen.jsx, FamilyMemberFormScreen.jsx | GET/POST/PATCH/DELETE /api/users/family-members | User.familyMembers | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | Prior report listed this as missing; it exists. |
| U-PROF-006 | User | Profile | WhatsApp communication consent (service / marketing preference center) | Implemented — frontend/src/pages/Profile.jsx GET/PATCH /users/consent/whatsapp | **PENDING** — Only captured once at signup (mobile-app/src/screens/auth/SetPasswordScreen.jsx); no screen or call to /users/consent/whatsapp | GET/PATCH /api/users/consent/whatsapp (consentService.js) | WhatsAppConsentPreference, WhatsAppConsentEvent | A mobile user cannot review or withdraw consent in-app (inbound STOP replies are still honored by the webhook). | B: consent-*.test.js (server). No mobile tests exist. | Medium — consent withdrawal path missing in app | High — static, depth A | — |
| U-PROF-007 | User | Settings | Theme selection | Implemented — frontend/src/context/ThemeContext.jsx (local + PATCH /users/preferences) | **NOT VERIFIED** — mobile-app/src/screens/user/SettingsScreen.jsx, store/themeStore.js (AsyncStorage) | No backend route for PATCH /users/preferences (grep backend/src/routes → none) | Local only on both platforms | None for local theming. NOTE: the website's backend sync call targets a route that does not exist, so "theme synced to server" is not a working website feature (prior report listed it as a mobile gap). | No mobile tests exist | Low | High — static, depth A | — |
| U-PROF-008 | User | Settings | Language selection + translated content (11 languages; UI via i18n, content via `lang` query) | Implemented — frontend/src/context/LanguageContext.jsx PATCH /auth/preferred-language; api/axios.js adds ?lang=; i18n/locales/*.json (11) | **PENDING** — mobile-app/src/i18n/index.js LOCALES = { en } only; no language control in SettingsScreen; api/axios.js sends no lang | PATCH /api/auth/preferred-language; translationService on GET poojas/festivals/temples/blogs/kits/livestreams | User.preferredLanguage; Translation cache | Mobile is English-only and never requests translated API content. See F-08. | B: translation-providers.test.js (server). No mobile tests exist. | High — a headline website capability is absent | High — static, depth A | — |
| U-PUB-001 | User | Public experience | Guest browsing before login (home, poojas, marketplace, temples, festivals, panchang, blog, AI guide; booking until the pay step) | Implemented — frontend/src/App.jsx public routes (PublicLayout); hooks/useCheckoutAuthGuard.js | **PENDING** — mobile-app/src/navigation/RootNavigator.jsx: no user → Auth stack only | Public GET endpoints (poojas, marketplace, temples, festivals, panchang, blogs, ai) | n/a | Mobile requires login/registration before any content is reachable. See F-09. | No mobile tests exist | Medium — conversion/store-review exposure | High — static, depth A | — |
| U-PUB-002 | User | Public experience | Hero / promotional banners | Implemented — frontend/src/pages/Home.jsx, components/home/HeroSlider.jsx GET /hero-banners | **PENDING** — No call to /hero-banners anywhere in mobile-app/src | GET /api/hero-banners | HeroBanner | Admin-managed banners never shown in app. | No mobile tests exist | Low | High — static, depth A | — |
| U-PUB-003 | User | Public experience | Legal documents in-app (Privacy, Terms, Refund, About, Vision) and admin-managed footer documents/links | Implemented — frontend/src/components/layout/Footer.jsx; pages/LegalDocumentViewerPage.jsx; GET /documents, /footer-links/:id | **PENDING** — No reference to /documents or /footer-links in mobile-app/src | GET /api/documents[/:type[/view]], GET /api/footer-links/:id[/view\|/download], GET /api/settings/public (footerLinks) | LegalDocument; SystemSettings.footerLinks | Users and pandits cannot read Privacy Policy / Terms / Refund policy inside the app. See F-04. | B: legal-documents-viewer.test.js, footer-links.test.js (server). No mobile tests exist. | High — compliance / store-listing exposure | High — static, depth A | — |
| U-PUB-004 | User | Public experience | Public branding & contact settings (platform name, logo, support contact) | Implemented — frontend/src/context/SettingsContext.jsx GET /settings/public | **PARTIAL** — mobile-app/src/screens/user/BookingFlowScreen.jsx and pandit/PanditStatusScreen.jsx call /settings/public (cutoff, contact); invoice/company data hard-coded in config/company.config.js | GET /api/settings/public | SystemSettings | Logo/name/contact are not applied from admin settings; invoice header uses a static config. | No mobile tests exist | Low | High — static, depth A | — |
| U-PUB-005 | User | Public experience | Help / support / contact page | Not present — No route (App.jsx); footer shows contact details only | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | Nothing to match. | n/a | n/a | High (absence/NA by search) | — |
| U-PUB-006 | User | Public experience | Pandit referral landing link (/r/:token → booking referral capture) | Implemented — frontend/src/pages/ReferralLanding.jsx; booking/constants.js getStoredReferralToken | **PENDING** — mobile-app/src/App.jsx linking handles only zutsav://register?ref=…; no /r/:token route | GET /api/referral/validate/:token | Booking.referral | Links shared by pandits open the website, not the app, and mobile bookings cannot carry a referral token. See F-07/F-18. | No mobile tests exist | Medium | High — static, depth A | — |
| U-PUB-007 | User | Public experience | Admin-issued public invoice share link (/share/invoice/:token) | Implemented — frontend/src/pages/PublicInvoicePage.jsx | **NOT APPLICABLE** — A browser-only, token-authenticated web page for offline customers; no app flow is required or expected | GET /api/public/invoices/:token | InvoiceShareLink | n/a | B: invoice-share.test.js (server) | n/a | High (absence/NA by search) | — |
| U-PUB-008 | User | Public experience | Footer custom links | Implemented — frontend/src/components/layout/Footer.jsx | **NOT APPLICABLE** — Mobile has no footer; the underlying documents are covered by U-PUB-003 | n/a | n/a | n/a | n/a | n/a | High (absence/NA by search) | — |
| U-POOJA-001 | User | Pooja discovery | Pooja categories browse → category list | Implemented — frontend/src/pages/PoojaCategories.jsx, PoojaList.jsx (categorySlug) | **PENDING** — mobile-app/src/screens/user/PoojaListScreen.jsx is a flat list (no categories) | GET /api/poojas/categories, GET /api/poojas?categoryId= | PoojaCategory | No category navigation or filter on mobile. | No mobile tests exist | Medium | High — static, depth A | — |
| U-POOJA-002 | User | Pooja discovery | Pooja search and paginated list | Implemented — frontend/src/pages/PoojaList.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/PoojaListScreen.jsx (search, page=12, infinite scroll) | GET /api/poojas | Pooja | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-POOJA-003 | User | Pooja discovery | Pooja details content (overview tab, inclusions, similar poojas, upcoming festivals) | Implemented — frontend/src/components/booking/PoojaDetailsStep.jsx, pooja-details/*; BookingFlow.jsx | **PARTIAL** — mobile-app/src/screens/user/BookingFlowScreen.jsx overview step (name/price/description only) | GET /api/poojas/:slug | Pooja | No similar poojas, no festivals panel. | No mobile tests exist | Low | High — static, depth A | — |
| U-POOJA-004 | User | Pooja discovery | Public pooja reviews and rating summary | Implemented — frontend/src/pages/BookingFlow.jsx GET /poojas/:slug/reviews | **PENDING** — No call to /poojas/:slug/reviews | GET /api/poojas/:slug/reviews | Booking.rating/review | Pre-booking social proof is absent. | No mobile tests exist | Medium | High — static, depth A | — |
| U-POOJA-005 | User | Pooja discovery | Pandit directory / pandit profile pages for customers | Not present — No page or call to GET /pandits for customers (assignment is admin/system driven) | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | Nothing to match. | n/a | n/a | High (absence/NA by search) | — |
| U-BOOK-001 | User | Booking | Booking type (normal/urgent) and date/time rules (3-day rule, urgent cutoff from settings) | Implemented — frontend/src/components/booking/{BookingTypeStep,DateStep,TimeStep}.jsx; GET /bookings/pricing-preview | **NOT VERIFIED** — mobile-app/src/screens/user/BookingFlowScreen.jsx; utils/bookingDateRules.js; GET /settings/public | GET /api/bookings/pricing-preview; create-phonepe-order validation | Booking | None found; server remains authoritative. | B: urgent-cutoff.test.js, urgent-pricing.test.js (server). No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-BOOK-002 | User | Booking | Kit preference and multi-kit selection | Implemented — frontend/src/components/booking/{KitPreferenceStep,KitSelectStep}.jsx | **NOT VERIFIED** — mobile-app/src/BookingFlowScreen.jsx (kitIds, KitItemsSheet) | GET /api/marketplace/kits/by-pooja/:poojaId | Booking.kitIds | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-BOOK-003 | User | Booking | Language, special note, contact/address details, saved-address picker, map | Implemented — frontend/src/components/booking/{LanguageStep,DetailsStep}.jsx | **NOT VERIFIED** — mobile-app/src/BookingFlowScreen.jsx, components/shared/{AddressPicker,MapPicker,LocationSearch}.jsx | GET /api/users/addresses, /api/location/* | Booking.userDetails | None in logic. Android map tiles likely need a Google Maps key that is not configured (F-16). | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-BOOK-004 | User | Booking | Price preview and partial-payment option | Implemented — frontend/src/utils/priceEngine.js; components/booking/ReviewStep.jsx | **NOT VERIFIED** — mobile-app/src/utils/priceEngine.js (identical core), BookingFlowScreen.jsx partialConfig | GET /api/bookings/pricing-preview | Booking.paymentMode/partialAmount | None found (prior report said partial payment was hard-coded to FULL; current code supports PARTIAL). | B: payment-mode.test.js. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-BOOK-005 | User | Booking | Coupon code at booking | Implemented — frontend/src/pages/BookingFlow.jsx POST /coupons/validate; couponCode in order payload | **PENDING** — No coupon UI or `couponCode` in the booking payload | POST /api/coupons/validate; create-phonepe-order couponCode | CouponRedemption | Coupon discounts are unavailable on mobile. See F-07. | B: coupon-system.test.js (service level). No mobile tests exist. | Medium | High — static, depth A | — |
| U-BOOK-006 | User | Booking | Coin (wallet) redemption at booking | Implemented — frontend/src/pages/BookingFlow.jsx coinRedemptionCoins | **NOT VERIFIED** — mobile-app/src/BookingFlowScreen.jsx coinCoins/coinRedemptionCoins; GET /wallet | create-phonepe-order coinRedemptionCoins | UserWallet, WalletTransaction | None found. | B: coin-redemption.test.js. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-BOOK-007 | User | Booking | Pandit-referral token captured onto a booking | Implemented — frontend/src/pages/BookingFlow.jsx referralToken (URL/sessionStorage) | **PENDING** — No `referralToken` handling in mobile-app/src | POST create-phonepe-order { referralToken } | Booking.referral | Referred bookings made from the app lose attribution. See F-07. | B: referral-booking-reward.test.js. No mobile tests exist. | Medium | High — static, depth A | — |
| U-BOOK-008 | User | Booking | Add a pooja to the unified cart (poojas + products) | Implemented — frontend/src/pages/CartPage.jsx; context/CartContext.jsx addPooja | **PENDING** — mobile-app/src/store/cartStore.js is products-only; BookingFlowScreen has no add-to-cart | POST /api/checkout/cart | Booking/Order | No combined checkout. See F-07. | No mobile tests exist | Medium | High — static, depth A | — |
| U-BOOK-009 | User | Booking | Guest-to-login checkpoint with restored booking | Implemented — frontend/src/hooks/useCheckoutAuthGuard.js; utils/pendingCheckout.js | **NOT APPLICABLE** — Consequence of mobile's auth-first design (U-PUB-001); the mobile user is always authenticated before booking | n/a | n/a | n/a | n/a | n/a | High (absence/NA by search) | — |
| U-PAY-001 | User | Payment | Create booking order and pay via PhonePe | Implemented — frontend/src/pages/BookingFlow.jsx POST /bookings/create-phonepe-order → window.location | **NOT VERIFIED** — mobile-app/src/BookingFlowScreen.jsx handleSubmit() → Linking.openURL(redirectUrl) → PaymentVerify | POST /api/bookings/create-phonepe-order (booking.controller.js) | Booking, PaymentLedger | Request payload parity is good (kitIds, coins, partial). Return path is covered by U-PAY-005. | B: payment-mode.test.js (mock mode). No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-PAY-002 | User | Payment | Verify payment (booking / remaining / order) with polling | Implemented — frontend/src/pages/PaymentCallback.jsx (4 endpoints) | **NOT VERIFIED** — mobile-app/src/screens/user/PaymentVerifyScreen.jsx chooses verify-phonepe / verify-remaining / orders/verify-phonepe | GET /api/bookings/verify-phonepe\|verify-remaining/:txn; /marketplace/orders/verify-phonepe/:txn | PaymentLedger | Does not use `/checkout/verify/:txn` (unified cart) — consistent with mobile not using unified checkout (F-03). Polling = 20×3s then manual "check again". | B: verify-phonepe referenced by 1 test. No mobile tests exist. | Low — verification gap only | High — static, depth A | Prior report's suspected wrong-endpoint bug is not present. |
| U-PAY-003 | User | Payment | Retry a failed booking payment on the same booking | Implemented — frontend/src/pages/MyBookings.jsx POST /bookings/:id/retry-payment | **NOT VERIFIED** — mobile-app/src/BookingsScreen.jsx, BookingDetailScreen.jsx, PaymentVerifyScreen.jsx | POST /api/bookings/:id/retry-payment | PaymentLedger | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-PAY-004 | User | Payment | Pay remaining balance of a partial payment | Implemented — frontend/src/pages/MyBookings.jsx POST /bookings/:id/pay-remaining | **NOT VERIFIED** — mobile-app/src/BookingDetailScreen.jsx handlePayRemaining() | POST /api/bookings/:id/pay-remaining; GET verify-remaining | PaymentLedger, Booking.remainingAmount | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-PAY-005 | User | Payment | Return to the app after the gateway page (app link / callback handling) | Implemented — frontend/src/pages/PaymentCallback.jsx at /payment-callback/:txn (ProtectedRoute) | **PENDING** — mobile-app/src/App.jsx linking handles only "register"; no zutsav:// callback; booking.controller.js:467/614/667 always set redirectUrl=${clientUrl}/payment-callback/<txn> | backend/src/controllers/booking.controller.js, marketplace.controller.js, checkout.controller.js, utils/phonepe.js | n/a | The customer is returned to a website page that requires a web login and cannot re-open the app; the app's polling window (≈60 s) may expire first. See F-06. | No mobile tests exist | Medium — payment UX/confusion risk | High — static, depth A | Server-side confirmation still occurs through the PhonePe webhook; this is a UX/integration gap. |
| U-PAY-006 | User | Payment | Coin-only payment (no gateway) | Implemented — frontend/src/pages/BookingFlow.jsx paidWithCoins → /payment-callback | **NOT VERIFIED** — mobile-app/src/BookingFlowScreen.jsx (no redirectUrl → "Booking created!" → BookingDetail) | booking.controller.js:453 marks SUCCESS | PaymentLedger | None found; server marks the booking paid. | B: coin-redemption.test.js. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| U-PAY-007 | User | Payment | Wallet balance and coin transaction history | Implemented — frontend/src/pages/Wallet.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/WalletScreen.jsx | GET /api/wallet, /api/wallet/transactions | UserWallet, WalletTransaction | None found. | B: admin-wallet-controller.test.js (admin side). No mobile tests exist. | Low — verification gap only | Medium — static, depth B | Prior report said wallet was not built on either platform; it is built on both. |
| U-MYB-001 | User | My bookings | List with status filters and pagination | Implemented — frontend/src/pages/MyBookings.jsx GET /bookings/my?status= | **NOT VERIFIED** — mobile-app/src/screens/user/BookingsScreen.jsx (page/limit 15, infinite scroll) | GET /api/bookings/my | Booking | Mobile paginates; the WEBSITE does not (backend default limit=10, web sends no page/limit), so web users see only their latest 10 bookings — a baseline defect, not a mobile gap (F-27). | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-MYB-002 | User | My bookings | Booking detail (timeline, payment ledger, pandit, referral, audit log) | Implemented — frontend/src/pages/MyBookings.jsx cards | **NOT VERIFIED** — mobile-app/src/screens/user/BookingDetailScreen.jsx | GET /api/bookings/:id (getBookingById) | Booking, PaymentLedger | None found (mobile shows more than web). | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-MYB-003 | User | My bookings | Cancel booking with refund preview | Implemented — frontend/src/pages/MyBookings.jsx GET refund-preview; PATCH /bookings/:id/cancel | **PARTIAL** — mobile-app/src/BookingDetailScreen.jsx CANCELLABLE_STATUSES | PATCH /api/bookings/:id/cancel (USER_CANCELLABLE_STATUSES) | Booking, refund fields | Mobile also offers Cancel for `completion_requested`; the backend rejects that state with 400 (F-23). | B: /cancel referenced by 4 tests (pandit/admin paths). No mobile tests exist. | Low | High — static, depth A | — |
| U-MYB-004 | User | My bookings | Rate a completed booking (stars + written review) | Implemented — frontend/src/pages/MyBookings.jsx POST /bookings/:id/rate { rating, review } | **PARTIAL** — mobile-app/src/BookingDetailScreen.jsx:113 posts { rating, comment } | POST /api/bookings/:id/rate reads { rating, review } (booking.controller.js:1019) | Booking.rating/review | The written review is silently discarded; only the star rating is saved. See F-10. | B: /rate referenced by 1 test. No mobile tests exist. | Medium — user-entered data lost | High — static, depth A | — |
| U-MYB-005 | User | My bookings | Booking invoice view / share (official tax invoice) | Implemented — frontend/src/pages/InvoicePage.jsx GET /invoices/booking/:id, /invoices/number/:no | **PARTIAL** — mobile-app/src/screens/user/InvoiceScreen.jsx → GET /bookings/:id/invoice | getInvoiceData returns { booking, paymentLedger } only (booking.controller.js:1196-1235); persisted Invoice docs live behind /api/invoices/* | Invoice, PaymentLedger | The screen expects `data.invoice(s)` that this endpoint never returns, so it shows the booking number instead of INV-… numbers, loses per-payment invoices/GST breakdown, and uses a static company config. See F-02. | B: invoice-share.test.js (server). No mobile tests exist. | High — customer-facing tax document differs from the website | High — static, depth A | — |
| U-MYB-006 | User | My bookings | Refund status visibility after cancellation | Implemented — frontend/src/pages/MyBookings.jsx (status pill) | **NOT VERIFIED** — mobile-app/src/BookingDetailScreen.jsx refundStatusColor/refund card | Booking.refund | Booking.refund | None found (mobile richer than web). | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-MYB-007 | User | My bookings | Reschedule a booking | Not present — No UI or route (grep "reschedule" in routes/frontend → none) | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | Nothing to match. | n/a | n/a | High (absence/NA by search) | — |
| U-SHOP-001 | User | Marketplace | Browse, categories, search | Implemented — frontend/src/pages/Marketplace.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/MarketplaceScreen.jsx | GET /api/marketplace/categories\|products | Product | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-SHOP-002 | User | Marketplace | Product detail with variants and stock | Implemented — frontend/src/pages/ProductDetail.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/ProductDetailScreen.jsx | GET /api/marketplace/products/:slug | Product | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-SHOP-003 | User | Marketplace | Cart: add / update / remove (products) | Implemented — frontend/src/context/CartContext.jsx; pages/CartPage.jsx | **NOT VERIFIED** — mobile-app/src/store/cartStore.js (AsyncStorage), screens/user/CartScreen.jsx | Local | Local | None found for products. Cart state is not cleared at logout (U-AUTH-007). | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-SHOP-004 | User | Marketplace | Coupon code on cart | Implemented — frontend/src/pages/CartPage.jsx POST /coupons/validate | **PENDING** — No coupon UI in CartScreen | POST /api/coupons/validate; checkout couponCode | CouponRedemption | Not available on mobile (F-07). | No mobile tests exist | Medium | High — static, depth A | — |
| U-SHOP-005 | User | Marketplace | Coin redemption on cart | Implemented — frontend/src/pages/CartPage.jsx coinRedemptionCoins | **PENDING** — Not in CartScreen | checkout.controller.js coinRedemptionCoins | UserWallet | Not available on mobile (F-07). | No mobile tests exist | Medium | High — static, depth A | — |
| U-SHOP-006 | User | Marketplace | Checkout / order creation and pricing (incl. product tax) | Implemented — frontend/src/pages/CartPage.jsx POST /checkout/cart (price + product tax, per-item taxRate/taxAmount stored) | **PARTIAL** — mobile-app/src/CartScreen.jsx POST /marketplace/orders/create | marketplace.controller.js createOrder (no tax, ignores variant salePrice) vs checkout.controller.js:152-185 | Order | Orders created from the app are priced without product tax and without variant sale prices, and cannot carry coupons/coins; the same cart costs differently on web. See F-03. | B: no HTTP-level tests for /checkout or /marketplace/orders. No mobile tests exist. | High — price/tax integrity vs website | High — static, depth A | P0 candidate if the business confirms product GST must always be charged. |
| U-SHOP-007 | User | Marketplace | Order list, detail, shipment tracking, delivery-OTP notice | Implemented — frontend/src/pages/MyOrders.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/OrdersScreen.jsx, OrderDetailScreen.jsx | GET /api/marketplace/orders/my\|:id\|by-number/:no | Order, Shipment | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-SHOP-008 | User | Marketplace | Order invoice (print / share) | Implemented — frontend/src/pages/MyOrders.jsx GET /marketplace/orders/:id/invoice | **NOT VERIFIED** — mobile-app/src/InvoiceScreen.jsx type='order' + expo-print/sharing | GET /api/marketplace/orders/:id/invoice | Order | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-SHOP-009 | User | Marketplace | Order cancel / return by customer | Not present — MyOrders.jsx only displays cancelled/returned statuses; no customer action or route | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | Nothing to match. | n/a | n/a | High (absence/NA by search) | — |
| U-SHOP-010 | User | Marketplace | Product reviews / wishlist | Not present — ProductDetail.jsx has no review/wishlist code | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | Nothing to match. | n/a | n/a | High (absence/NA by search) | — |
| U-CONT-001 | User | Content | Temple directory (search, filters) | Implemented — frontend/src/pages/TempleDirectory.jsx | **PARTIAL** — mobile-app/src/screens/user/TemplesScreen.jsx (search only; reads item.deity) | GET /api/temples (model field is primaryDeity) | Temple | No filters; deity never displays (field name mismatch). See F-13. | No mobile tests exist | Medium | High — static, depth A | — |
| U-CONT-002 | User | Content | Temple detail (location, timings, deity, gallery, links) | Implemented — frontend/src/pages/TempleDetailPage.jsx | **PARTIAL** — mobile-app/src/screens/user/TempleDetailScreen.jsx reads street/timings/deity/phone/website | backend/src/models/Temple.js has address, openingHours, primaryDeity, images (no phone/website) | Temple | Street address, timings and deity never render; no photo gallery. See F-13. | No mobile tests exist | Medium | High — static, depth A | — |
| U-CONT-003 | User | Content | Festival list and detail | Implemented — frontend/src/pages/Festivals.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/FestivalsScreen.jsx, FestivalDetailScreen.jsx | GET /api/festivals | Festival | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-CONT-004 | User | Content | Panchang daily + week | Implemented — frontend/src/pages/PanchangPage.jsx (tithiEntries, auspicious/inauspicious lists) | **NOT VERIFIED** — mobile-app/src/screens/user/PanchangScreen.jsx (consumes tithiEntries, auspiciousTimings, inauspiciousTimings) | GET /api/panchang, /panchang/week (panchangService.js) | PanchangCache | None found; prior report's "regression to legacy fields" is not present. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-CONT-005 | User | Content | Blogs: read, search, like, bookmark, comment, share | Implemented — frontend/src/pages/BlogHomePage.jsx, BlogDetailPage.jsx | **PARTIAL** — mobile-app/src/screens/user/BlogsScreen.jsx, BlogDetailScreen.jsx | GET/POST /api/blogs/* | Blog, BlogLike, BlogBookmark, BlogComment | No category or popular-tag filters (web uses /blogs/categories, /blogs/tags/popular); no comment deletion (web: DELETE /blogs/:id/comments/:id). | B: blog-author-role.test.js (server). No mobile tests exist. | Low | Medium — static, depth B | — |
| U-CONT-006 | User | Content | Blog authoring by customers (editor, drafts) | Implemented — frontend/src/pages/BlogEditor.jsx (rich text), App.jsx /blog/write | **PENDING** — Authoring exists only in the Pandit navigator; the User navigator has no editor or "My blogs" | POST/PUT /api/blogs (blogPermission per role) | Blog | Customers cannot write blogs in the app. | No mobile tests exist | Low–Medium (permission-gated feature) | High — static, depth A | — |
| U-CONT-007 | User | Content | My blogs list and bookmarks | Implemented — frontend/src/pages/MyBlogsPage.jsx | **PENDING** — User navigator has no screen | GET /api/blogs/me/blogs\|me/bookmarks | Blog | Not available to customers. | No mobile tests exist | Low | High — static, depth A | — |
| U-CONT-008 | User | Content | Livestreams (list + in-app playback) | Implemented — frontend/src/pages/LivestreamsPage.jsx (YouTube embed from youtubeUrl) | **PARTIAL** — mobile-app/src/screens/user/LivestreamsScreen.jsx opens item.streamUrl; filters ?status=live | backend/src/models/Livestream.js has youtubeUrl, isActive (no streamUrl/status/viewers/host) | Livestream | Tapping a stream does nothing (`streamUrl` is undefined); host/viewer fields are placeholders. See F-12. | No mobile tests exist | Medium | High — static, depth A | — |
| U-CONT-009 | User | Content | AI assistant — free chat | Implemented — frontend/src/pages/AIAssistant.jsx, components/ai/ZutsavAIWidget.jsx POST /ai/chat | **NOT VERIFIED** — mobile-app/src/screens/user/AIAssistantScreen.jsx POST /ai/chat | POST /api/ai/chat (optionalAuth) | n/a | None found for free chat (no persistence across screens on mobile). | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-CONT-010 | User | Content | AI guided recommendation (intents → recommend) | Implemented — frontend/src/components/ai/ZutsavAIWidget.jsx GET /ai/guided-intents, POST /ai/guided-recommend | **PENDING** — No call to guided endpoints | GET /api/ai/guided-intents, POST /api/ai/guided-recommend | n/a | Guided flow absent. | No mobile tests exist | Low | High — static, depth A | — |
| U-CONT-011 | User | Content | Kundli | Placeholder — frontend/src/App.jsx /kundli → <ComingSoon title="Kundli" /> | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | Website itself shows a placeholder. | n/a | n/a | High (absence/NA by search) | — |
| U-NOTIF-001 | User | Notifications | In-app notification list, mark read, delete, clear all | Implemented — frontend/src/context/NotificationContext.jsx; pages/Notifications.jsx | **NOT VERIFIED** — mobile-app/src/store/notificationStore.js; screens/user/NotificationsScreen.jsx | GET/PATCH/DELETE /api/notifications* | Notification | None found. | B: notification-hardening.test.js (engine). No mobile tests exist. | Low — verification gap only | Medium — static, depth B | — |
| U-NOTIF-002 | User | Notifications | Real-time notification delivery (socket) | Implemented — frontend/src/context/NotificationContext.jsx (socket) | **NOT VERIFIED** — mobile-app/src/utils/socket.js, navigation/RootNavigator.jsx onNotification | Socket.IO 'new_notification' (notificationService.js) | Notification | Works only while the app is foregrounded (reconnectionAttempts: 5). | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| U-NOTIF-003 | User | Notifications | Tap-through routing from a notification to its booking/order | Implemented — frontend/src/pages/Notifications.jsx (redirects to list pages) | **NOT VERIFIED** — mobile-app/src/screens/user/NotificationsScreen.jsx → GET /bookings/by-number, /marketplace/orders/by-number | GET /api/bookings/by-number/:no (customer-scoped) | n/a | None found for customers. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| U-NOTIF-004 | User | Notifications | OS push notifications (device registration, delivery, background tap routing) | Not present — The website has no push (no service worker / push API) | **NOT PRESENT ON WEBSITE** — mobile-app/src/utils/fcm.js requests permission and fetches an Expo token that is discarded; response listeners are never used; no app.json projectId / google-services.json | No push-token model/endpoint or sender in backend (grep: none) | n/a | Not a parity gap, but the app prompts for notification permission at launch and cannot deliver pushes. See F-05. | No mobile tests exist | Medium — misleading dead code / expectation gap | High (absence/NA by search) | — |
| U-REF-001 | User | Referrals & rewards | Customer referral program (generate code, share, stats, settings) | Implemented — frontend/src/pages/MyReferrals.jsx | **NOT VERIFIED** — mobile-app/src/screens/user/MyReferralsScreen.jsx | GET/POST /api/user-referrals/* | UserReferralCode | None found. | B: user-referral-phase1.test.js. No mobile tests exist. | Low — verification gap only | Medium — static, depth B | — |
| U-REF-002 | User | Referrals & rewards | Referral deep link opens the app and pre-fills the code | Implemented — frontend/src/Register.jsx reads ?ref= | **PARTIAL** — mobile-app/src/App.jsx linking prefixes + extractReferralCode; AndroidManifest has only zutsav:// and com.zutsav.app schemes | n/a | n/a | Custom scheme works in principle; https://www.zutsav.com links have no Android intent filter / App Links, so shared web links open the browser. See F-18. | No mobile tests exist | Low–Medium | High — static, depth A | — |

---

## G. Pandit Parity Matrix

Row counts: 39 rows; denominator 37 (excl. 0 NA + 2 NP).

| Feature ID | Audience | Module | Feature / action | Website status & evidence | Mobile status & evidence | Backend dependency | Persistence | Functional gap | Test evidence | Severity | Confidence | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P-AUTH-001 | Pandit | Authentication | Pandit login (password / OTP) and role routing | Implemented — frontend/src/pages/Login.jsx; context/AuthContext.jsx | **PARTIAL** — mobile-app/src/screens/auth/LoginScreen.jsx, LoginOtpScreen.jsx; navigation/RootNavigator.jsx (role === 'pandit') | POST /api/auth/login, /login/otp/* | JWT in secure store | Shares the customer login code path, so the missing `rememberMe` (1-day token, never refreshed) applies to pandits too; an expired token leaves the pandit stuck in the authenticated stack. See F-01. | No mobile tests exist | High — pandits can miss booking requests after silent session loss | High — static, depth A | — |
| P-AUTH-002 | Pandit | Authentication | Pandit self-registration (role pick → OTP → password → minimal Pandit profile) | Implemented — frontend/src/pages/Register.jsx → POST /auth/complete-registration { role: 'pandit' } | **NOT VERIFIED** — mobile-app/src/screens/auth/RegisterScreen.jsx (role picker) → OTPScreen → SetPasswordScreen | POST /api/auth/complete-registration creates User + minimal Pandit (auth.controller.js:~238-260) | User, Pandit (status pending) | Same endpoint and payload on both platforms; profile details/KYC are completed afterwards via profile screens. | B: complete-registration referenced by 3 tests. No mobile tests exist. | Low — verification gap only | Medium — static, depth B | — |
| P-AUTH-003 | Pandit | Authentication | Change password / delete account / logout cleanup | Implemented — frontend/src/pages/Profile.jsx (shared) | **PARTIAL** — mobile-app/src/navigation/PanditNavigator.jsx (ChangePassword, DeleteAccount); store/authStore.js logout() | PATCH /api/users/change-password; delete-account flow | User | Functional parity for change-password/delete; logout does not reset panditStatusStore or clear cached data (F-15). | No mobile tests exist | Medium | High — static, depth A | — |
| P-GATE-001 | Pandit | Approval gate | Dashboard access by application status | Implemented — frontend/src/pages/PanditDashboard.jsx:2234 blocks only rejected/suspended (ApplicationGate); pending/under_review pandits reach the dashboard | **PARTIAL** — mobile-app/src/navigation/RootNavigator.jsx + PanditGateNavigator.jsx: any status other than 'approved' sees only Status + KYC screens | GET /api/pandits/me; panditEligibilityService canReceiveBookings is the booking gate | Pandit.status | Mobile is stricter than the website: a pending / under_review / reupload_required pandit cannot reach profile, services or availability on mobile but can on web. May be intentional hardening — product decision needed. See F-19. | No mobile tests exist | Medium | High — static, depth A | — |
| P-GATE-002 | Pandit | Approval gate | Application status screen (pending/under review/rejected/suspended) with refresh | Implemented — frontend/src/pages/PanditStatus.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditStatusScreen.jsx; store/panditStatusStore.js (sequence-guarded fetch) | GET /api/pandits/me | n/a | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-KYC-001 | Pandit | KYC | KYC submission (government ID + document details) and re-submission | Implemented — frontend/src/pages/PanditMyProfile.jsx POST /pandits/me/kyc | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditKYCScreen.jsx | POST /api/pandits/me/kyc | Pandit.kycStatus, documents | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-KYC-002 | Pandit | KYC | Document OTP verification and accept/decline decision; masked document view | Implemented — frontend/src/pages/PanditMyProfile.jsx kyc/document/* | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditKYCScreen.jsx (send-otp, verify-otp, document-decision, GET document/:x) | POST /api/pandits/me/kyc/document/* | Pandit.kycDocuments | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-PROF-001 | Pandit | Profile | Personal info (father name, gender, DOB, bio, experience) | Implemented — frontend/src/pages/PanditMyProfile.jsx PATCH /pandits/me/personal | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditPersonalInfoScreen.jsx | PATCH /api/pandits/me/personal | Pandit | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-PROF-002 | Pandit | Profile | Address and languages | Implemented — frontend/src/pages/PanditMyProfile.jsx PATCH /pandits/me/languages-address | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditAddressScreen.jsx | PATCH /api/pandits/me/languages-address | Pandit | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-PROF-003 | Pandit | Profile | Education / qualifications | Implemented — frontend/src/pages/PanditMyProfile.jsx; GET /masters/education-masters | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditEducationScreen.jsx | PATCH /api/pandits/me/qualifications | Pandit | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-PROF-004 | Pandit | Profile | Specializations | Implemented — frontend/src/pages/PanditMyProfile.jsx; GET /masters/specialization-masters | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditSpecializationsScreen.jsx | PATCH /api/pandits/me/specializations | Pandit | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-PROF-005 | Pandit | Profile | Family information | Implemented — frontend/src/pages/PanditMyProfile.jsx PATCH /pandits/me/family | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditFamilyInfoScreen.jsx | PATCH /api/pandits/me/family | Pandit | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-PROF-006 | Pandit | Profile | Bank details, UPI, UPI verification | Implemented — frontend/src/pages/PanditMyProfile.jsx PATCH /pandits/me/bank\|upi; POST verify-upi | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditBankUPIScreen.jsx | PATCH /api/pandits/me/bank\|upi; POST /api/pandits/me/verify-upi | Pandit.bankDetails/upiDetails | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | Payout-critical; static trace only. |
| P-PROF-007 | Pandit | Profile | Profile photo upload | Implemented — frontend/src/components/shared/ProfilePhoto.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditProfileScreen.jsx POST /pandits/me/photo | POST /api/pandits/me/photo | Pandit.profilePhoto | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-PROF-008 | Pandit | Profile | Profile completion indicator (70% threshold) | Implemented — frontend/src/pages/PanditDashboard.jsx calcCompletion (12 checks) | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditProfileScreen.jsx completionPct | n/a (client-side) | n/a | Formula not compared check-by-check — see Section N. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-SERV-001 | Pandit | Services | Select catalog poojas and set service details | Implemented — frontend/src/pages/PanditMyProfile.jsx GET /pandits/catalog-poojas; PATCH /pandits/me/pooja-services | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditPoojaServicesScreen.jsx | GET /api/pandits/catalog-poojas; PATCH /api/pandits/me/pooja-services | Pandit.selectedPoojas | None found (pooja saving was fixed in commit 9bc600c). | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-SERV-002 | Pandit | Services | Request a custom pooja not in the catalog (+ track request status) | Implemented — frontend/src/pages/PanditMyPoojas.jsx; route /pandit/requested-poojas; GET/POST /pandit/pooja-requests | **PENDING** — No call to /pandit/pooja-requests anywhere in mobile-app/src | GET/POST /api/pandit/pooja-requests (poojaRequest.routes.js); admin approve/reject | PoojaRequest | Pandits cannot request new poojas from the app. See F-21. | No mobile tests exist | Medium | High — static, depth A | — |
| P-AVAIL-001 | Pandit | Availability | Online/offline toggle | Implemented — frontend/src/pages/PanditDashboard.jsx PATCH /pandits/me/online-status | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditDashboardScreen.jsx | PATCH /api/pandits/me/online-status | Pandit.isOnline | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-AVAIL-002 | Pandit | Availability | Weekly schedule, blocked dates, special dates, availability toggle | Implemented — frontend/src/components/availability/AvailabilityManager.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditAvailabilityScreen.jsx | PUT /api/pandits/me/weekly-schedule; POST/DELETE /me/block, /me/special-dates; PATCH /me/toggle-availability | Pandit.availability | None found (same endpoints). | B: pandit booking-conflict tests (server). No mobile tests exist. | Low — verification gap only | Medium — static, depth B | — |
| P-AVAIL-003 | Pandit | Availability | Schedule calendar (what is on my plate today / date range) | Implemented — frontend/src/pages/PanditDashboard.jsx:672 GET /pandits/me/schedule-calendar | **PENDING** — No call to /pandits/me/schedule-calendar | GET /api/pandits/me/schedule-calendar (pandit.routes.js:19) | Booking | No day-by-day agenda; pandits rely on the bookings list. See F-22. | No mobile tests exist | Medium | High — static, depth A | — |
| P-BOOK-001 | Pandit | Bookings | Assigned bookings list with status tabs; quick accept | Implemented — frontend/src/pages/PanditDashboard.jsx GET /pandits/me/bookings | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditBookingsScreen.jsx | GET /api/pandits/me/bookings; PATCH .../accept | Booking | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-BOOK-002 | Pandit | Bookings | Booking detail, accept, reject with reason | Implemented — frontend/src/pages/PanditDashboard.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditBookingDetailScreen.jsx (reject reason ≥10 chars) | PATCH /api/pandits/me/bookings/:id/accept\|reject | Booking | None found. | B: pandit-eligibility / booking-conflict tests (server). No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| P-BOOK-003 | Pandit | Bookings | Cancel an accepted booking with reason | Implemented — frontend/src/pages/PanditDashboard.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditBookingDetailScreen.jsx | PATCH /api/pandits/me/bookings/:id/cancel | Booking | None found. | B: /cancel referenced by 4 tests. No mobile tests exist. | Low — verification gap only | High — static, depth A | — |
| P-BOOK-004 | Pandit | Bookings | Request completion + verify customer OTP | Implemented — frontend/src/pages/PanditDashboard.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditBookingDetailScreen.jsx request-completion / verify-completion-otp | PATCH .../request-completion; POST .../verify-completion-otp | Booking, OTP | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | Revenue-critical; static trace only. |
| P-BOOK-005 | Pandit | Bookings | Booking invoice / earnings document for pandit | Implemented — frontend/src/pages/InvoicePage.jsx (shared route) | **PARTIAL** — mobile-app/src/InvoiceScreen.jsx (shared) | GET /api/bookings/:id/invoice | Invoice | Shares the invoice-endpoint contract mismatch with the customer screen (F-02). | No mobile tests exist | Medium | Medium — static, depth B | — |
| P-EARN-001 | Pandit | Earnings | Payout stats, pending payouts, payout history | Implemented — frontend/src/pages/PanditDashboard.jsx (earningsView tabs) | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditEarningsScreen.jsx | GET /api/pandits/me/payouts/stats\|pending\|history | PaymentLedger, payouts | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | Financial display; static trace only. |
| P-EARN-002 | Pandit | Earnings | Reviews tab inside Earnings | Implemented — frontend/src/pages/PanditDashboard.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditEarningsScreen.jsx:116-125 reads rating/review/poojaId.name/ratingDate | GET /api/pandits/me/ratings | Booking.rating/review | None found — field names match the backend response. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-RATE-001 | Pandit | Ratings | Dedicated "Customer Reviews" screen | Implemented — frontend/src/pages/PanditDashboard.jsx reviews list | **PARTIAL** — mobile-app/src/screens/pandit/PanditRatingsScreen.jsx reads item.comment, item.userId?.name, item.createdAt, data.totalRatings | backend/src/controllers/pandit.controller.js:1147-1167 returns review, ratingDate, totalReviews and does not select/populate userId | Booking.rating/review | Review text never shows, every row says "User", the date renders blank/invalid, and the total always reads 0 reviews. The Earnings tab (P-EARN-002) renders the same data correctly. See F-11. | No mobile tests exist | Medium | High — static, depth A | — |
| P-REF-001 | Pandit | Referrals | Create pandit referral (poojas, customer), list, remark | Implemented — frontend/src/pages/PanditDashboard.jsx POST /referral; GET /referral/my; PATCH /referral/:id/remark | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditReferralScreen.jsx, PanditReferralDetailScreen.jsx | POST/GET/PATCH /api/referral/* | Referral | None found. | B: referral-booking-reward.test.js. No mobile tests exist. | Low — verification gap only | Medium — static, depth B | — |
| P-REF-002 | Pandit | Referrals | Share referral link that opens the app / attributes booking | Implemented — frontend/src/pages/ReferralLanding.jsx /r/:token | **PENDING** — mobile-app/src/screens/pandit/PanditReferralScreen.jsx shows link; App.jsx linking ignores /r/:token; BookingFlowScreen has no referralToken | GET /api/referral/validate/:token | Booking.referral | Links created in the app resolve only on the website; a customer using the app cannot be attributed to the pandit. See F-07/F-18. | No mobile tests exist | Medium | High — static, depth A | — |
| P-FEST-001 | Pandit | Content | Upcoming festivals widget on dashboard | Implemented — frontend/src/pages/PanditDashboard.jsx GET /festivals | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditDashboardScreen.jsx (current + next month) | GET /api/festivals | Festival | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-BLOG-001 | Pandit | Content | Blog authoring (list own blogs, create, edit, delete, featured image, categories) | Implemented — frontend/src/pages/BlogEditor.jsx (rich text), MyBlogsPage.jsx | **PARTIAL** — mobile-app/src/screens/pandit/PanditMyBlogsScreen.jsx, PanditBlogEditorScreen.jsx (plain-text body) | POST/PUT/DELETE /api/blogs; POST /blogs/upload-image; GET /blogs/permissions/check | Blog | Mobile editor is plain text; the website editor is rich text, so formatting authored on web cannot be preserved/edited on mobile. See F-25. | B: blog-author-role.test.js (server). No mobile tests exist. | Low–Medium | Medium — static, depth B | Rich-text vs plain-text storage format not exhaustively compared; confidence is inferred. |
| P-BLOG-002 | Pandit | Content | Browse blogs, festivals, panchang as a pandit | Implemented — frontend/src/pages (shared public pages) | **NOT VERIFIED** — mobile-app/src/navigation/PanditNavigator.jsx (Blogs, Festivals, Panchang) | Public endpoints | n/a | None found. | No mobile tests exist | Low — verification gap only | Medium — static, depth B | — |
| P-NOTIF-001 | Pandit | Notifications | Pandit notification list with tap-through to booking/referral | Implemented — frontend/src/context/NotificationContext.jsx | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditNotificationsScreen.jsx (by-number lookup) | GET /api/notifications; GET /api/bookings/by-number/:no | Notification | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-NOTIF-002 | Pandit | Notifications | OS push notification for new booking requests | Not present — Website has no push | **NOT PRESENT ON WEBSITE** — mobile-app/src/utils/fcm.js token is never registered with the backend | No push infrastructure in backend | n/a | Not parity, but a pandit relying on the app will not be alerted when it is closed. See F-05. | No mobile tests exist | High — operational (missed booking requests) | High (absence/NA by search) | — |
| P-SET-001 | Pandit | Settings | Pandit settings (theme, preferences) | Implemented — frontend/src/pages/PanditDashboard.jsx / ThemeContext | **NOT VERIFIED** — mobile-app/src/screens/pandit/PanditSettingsScreen.jsx | Local only | Local | None found. | No mobile tests exist | Low — verification gap only | High — static, depth A | — |
| P-SET-002 | Pandit | Settings | Language selection / translated content | Implemented — frontend/src/context/LanguageContext.jsx | **PENDING** — mobile-app/src/i18n/index.js English only | PATCH /api/auth/preferred-language | User.preferredLanguage | Same gap as U-PROF-008 (F-08). | No mobile tests exist | Medium | High — static, depth A | — |
| P-SET-003 | Pandit | Settings | Legal documents in-app | Implemented — frontend/src/components/layout/Footer.jsx | **PENDING** — No /documents call | GET /api/documents | LegalDocument | Same gap as U-PUB-003 (F-04). | No mobile tests exist | High — compliance | High — static, depth A | — |
| P-SET-004 | Pandit | Settings | WhatsApp consent preference center | Not present — frontend/src/pages/Profile.jsx is customer-only; no pandit equivalent in PanditMyProfile.jsx / PanditDashboard.jsx | **NOT PRESENT ON WEBSITE** — n/a | n/a | n/a | The website offers the consent center only to customers; see U-PROF-006. | n/a | n/a | Medium (absence/NA by search) | — |

---

## H. Screen-by-Screen Gap Analysis

Only screens/units with a **finding** are listed first; screens with no discrepancy are summarised after.

| Screen / unit (mobile) | Gap | Rows | Finding |
|---|---|---|---|
| `api/axios.js` + `store/authStore.js` | Session TTL mismatch; 401 leaves in-memory user; logout keeps cart/cache | U-AUTH-001/002/006/007, P-AUTH-001/003 | F-01, F-15 |
| `screens/auth/LoginScreen.jsx`, `LoginOtpScreen.jsx` | No `rememberMe` sent | U-AUTH-001/002 | F-01 |
| `screens/user/BookingDetailScreen.jsx` | `comment` vs `review`; Cancel offered for `completion_requested` | U-MYB-003/004 | F-10, F-23 |
| `screens/user/InvoiceScreen.jsx` | Reads `data.invoice(s)` that the endpoint does not return; static company config | U-MYB-005, P-BOOK-005 | F-02 |
| `screens/user/CartScreen.jsx` | Legacy order endpoint; no coupon/coin | U-SHOP-004/005/006 | F-03, F-07 |
| `screens/user/BookingFlowScreen.jsx` | No coupon, referral token, add-to-cart | U-BOOK-005/007/008 | F-07 |
| `screens/user/PaymentVerifyScreen.jsx` + backend redirect | Return lands on website | U-PAY-005 | F-06 |
| `screens/user/TemplesScreen.jsx`, `TempleDetailScreen.jsx` | Field-name mismatch; no gallery/filters | U-CONT-001/002 | F-13 |
| `screens/user/LivestreamsScreen.jsx` | `streamUrl`/`status` do not exist | U-CONT-008 | F-12 |
| `screens/user/PoojaListScreen.jsx` | No categories/reviews | U-POOJA-001/004 | — (PENDING rows) |
| `screens/user/SettingsScreen.jsx` | No language, consent, legal documents | U-PROF-006/008, U-PUB-003 | F-08, F-20, F-04 |
| `RootNavigator.jsx` (auth-first) | No guest browsing | U-PUB-001 | F-09 |
| `screens/pandit/PanditRatingsScreen.jsx` | Reads `comment`, `userId`, `createdAt`, `totalRatings` | P-RATE-001 | F-11 |
| `navigation/PanditGateNavigator.jsx` | Stricter than web gate | P-GATE-001 | F-19 |
| `screens/pandit/PanditAvailabilityScreen.jsx` | No schedule calendar | P-AVAIL-003 | F-22 |
| `screens/pandit/PanditPoojaServicesScreen.jsx` | No custom pooja request | P-SERV-002 | F-21 |
| `screens/pandit/PanditBlogEditorScreen.jsx` | Plain-text editor | P-BLOG-001 | F-25 |
| `utils/fcm.js` | Token never registered | U-NOTIF-004, P-NOTIF-002 | F-05 |
| `components/shared/MapPicker.jsx` + Android config | No Maps API key found | U-BOOK-003 | F-16 |
| `android/` native project | Cleartext, backup, debug-signed release | — | F-24 |

**Screens with no discrepancy found in the static trace** (still NOT VERIFIED): user — Register/OTP/SetPassword/ForgotPassword/ResetPassword, PersonalInfo, AddressBook, FamilyMembers, ChangePassword, DeleteAccount, Bookings list, Wallet, Marketplace, ProductDetail, Orders/OrderDetail, Festivals, Panchang, Blogs/BlogDetail, MyReferrals, AI Assistant, Notifications; pandit — KYC, PersonalInfo/Address/Education/Specializations/FamilyInfo/BankUPI, Profile photo, PoojaServices, Availability (weekly/blocks/special dates), Bookings/BookingDetail (accept/reject/cancel/complete+OTP), Earnings, Referrals, Notifications, Settings, Status.

---

## I. Backend & Integration Findings

### I.1 Endpoint coverage (static scan)
Website (non-admin) call-shapes: **147**; mobile call-shapes: **124**; shared: **114**. Website-only calls: **33**; mobile-only: **10**. The scan misses dynamically built URLs, so some "website-only" entries are scan artefacts (noted).

**Website calls with no mobile counterpart**

| Website call (method + path, normalised) | Website file(s) | Mobile counterpart? | Explained by row |
|---|---|---|---|
| DELETE /blogs/:x/comments/:x | pages/BlogDetailPage.jsx | No | Blog extras (U-CONT-005/006/007, P-BLOG-001) |
| GET /ai/guided-intents | components/ai/ZutsavAIWidget.jsx | No | U-CONT-010 |
| GET /blogs/id/:x | pages/BlogEditor.jsx | No | Blog extras (U-CONT-005/006/007, P-BLOG-001) |
| GET /blogs/tags/popular | pages/BlogHomePage.jsx | No | Blog extras (U-CONT-005/006/007, P-BLOG-001) |
| GET /bookings/my${filter  | pages/MyBookings.jsx | No | Scan artefact of a template string (U-MYB-001) |
| GET /bookings/verify-phonepe/:x | pages/PaymentCallback.jsx | No | Scan miss / F-03: PaymentVerifyScreen builds the endpoint dynamically; /checkout/verify not used (U-PAY-002) |
| GET /bookings/verify-remaining/:x | pages/PaymentCallback.jsx | No | Scan miss / F-03: PaymentVerifyScreen builds the endpoint dynamically; /checkout/verify not used (U-PAY-002) |
| GET /checkout/verify/:x | pages/PaymentCallback.jsx | No | Scan miss / F-03: PaymentVerifyScreen builds the endpoint dynamically; /checkout/verify not used (U-PAY-002) |
| GET /documents | components/layout/Footer.jsx | No | F-04 (U-PUB-003) |
| GET /hero-banners | pages/Home.jsx | No | U-PUB-002 |
| GET /invoices/booking/:x | pages/InvoicePage.jsx | No | F-02 (U-MYB-005) |
| GET /invoices/number/:x | pages/InvoicePage.jsx | No | F-02 (U-MYB-005) |
| GET /marketplace/orders/:x/invoice | pages/MyOrders.jsx | No | Mobile uses the same path via a computed URL (U-SHOP-008) — scan miss |
| GET /marketplace/orders/verify-phonepe/:x | pages/PaymentCallback.jsx | No | Scan miss / F-03: PaymentVerifyScreen builds the endpoint dynamically; /checkout/verify not used (U-PAY-002) |
| GET /pandit/pooja-requests | pages/PanditMyPoojas.jsx, pages/PanditMyProfile.jsx | No | F-21 (P-SERV-002) |
| GET /pandits/me/bookings/:x | pages/PanditDashboard.jsx | No | Mobile uses GET /bookings/:id instead (P-BOOK-002) |
| GET /pandits/me/schedule-calendar | components/availability/AvailabilityManager.jsx, pages/PanditDashboard.jsx | No | F-22 (P-AVAIL-003) |
| GET /poojas/:x/reviews | pages/BookingFlow.jsx | No | U-POOJA-004 |
| GET /poojas/categories | pages/Home.jsx, pages/PanditMyPoojas.jsx, pages/PanditMyProfile.jsx, pages/PoojaCategories.jsx, pages/PoojaList.jsx | No | U-POOJA-001 |
| GET /referral/validate/:x | pages/BookingFlow.jsx, pages/ReferralLanding.jsx | No | F-07 (U-BOOK-007, U-PUB-006) |
| GET /users/consent/whatsapp | pages/Profile.jsx | No | F-20 (U-PROF-006) |
| GET :x/public/invoices/:x | pages/PublicInvoicePage.jsx | No | Browser-only share page (U-PUB-007 — NOT APPLICABLE) |
| PATCH /auth/preferred-language | context/LanguageContext.jsx | No | F-08 (U-PROF-008) |
| PATCH /users/consent/whatsapp | pages/Profile.jsx | No | F-20 (U-PROF-006) |
| PATCH /users/preferences | context/ThemeContext.jsx | No | F-28 (route does not exist) |
| POST /ai/guided-recommend | components/ai/ZutsavAIWidget.jsx | No | U-CONT-010 |
| POST /auth/register | context/AuthContext.jsx | No | Mobile uses /auth/complete-registration (U-AUTH-004, P-AUTH-002) |
| POST /auth/register-pandit | context/AuthContext.jsx | No | Mobile uses /auth/complete-registration (U-AUTH-004, P-AUTH-002) |
| POST /blogs/:x/duplicate | pages/MyBlogsPage.jsx | No | Blog extras (U-CONT-005/006/007, P-BLOG-001) |
| POST /checkout/cart | pages/CartPage.jsx | No | F-03 / F-07 |
| POST /coupons/validate | pages/BookingFlow.jsx, pages/CartPage.jsx | No | F-07 (U-BOOK-005, U-SHOP-004) |
| POST /pandit/pooja-requests | pages/PanditMyPoojas.jsx, pages/PanditMyProfile.jsx | No | F-21 (P-SERV-002) |
| POST /pandits/register | pages/PanditRegistration.jsx | No | Mobile uses /auth/complete-registration (U-AUTH-004, P-AUTH-002) |

**Mobile calls with no website counterpart**

| Mobile call | Mobile file(s) | Note |
|---|---|---|
| GET /bookings/:x | screens/pandit/PanditBookingDetailScreen.jsx, screens/user/BookingDetailScreen.jsx | Equivalent web call uses a different path/template |
| GET /bookings/by-number/:x | screens/pandit/PanditNotificationsScreen.jsx, screens/user/NotificationsScreen.jsx | Notification tap-through |
| GET /marketplace/orders/:x | screens/user/OrderDetailScreen.jsx | Equivalent web call uses a different path/template |
| GET /marketplace/orders/by-number/:x | screens/user/NotificationsScreen.jsx | Notification tap-through |
| GET /pandits/me/dashboard | screens/pandit/PanditDashboardScreen.jsx, screens/pandit/PanditEarningsScreen.jsx | Mobile-specific dashboard aggregate |
| PATCH /users/addresses/:x | hooks/useAddresses.js | Equivalent web call uses a different path/template |
| POST /blogs/:x/share | screens/user/BlogDetailScreen.jsx | Mobile-specific |
| POST /marketplace/orders/create | screens/user/CartScreen.jsx | Legacy order endpoint — see F-03 |
| POST /pandits/me/photo | screens/pandit/PanditProfileScreen.jsx | Mobile-specific |
| POST /users/profile/photo | screens/user/ProfileScreen.jsx | Mobile-specific |

### I.2 Contract mismatches (mobile reads/sends what the backend does not provide/accept)
| Where | Mobile expects/sends | Backend actual | Finding |
|---|---|---|---|
| Rating | `{ rating, comment }` | reads `{ rating, review }` | F-10 |
| Pandit ratings screen | `comment`, `userId.name`, `createdAt`, `totalRatings` | `review`, no `userId`, `ratingDate`, `totalReviews` | F-11 |
| Booking invoice | `data.invoice(s)` | `{ booking, paymentLedger }` | F-02 |
| Livestreams | `streamUrl`, `status` | `youtubeUrl`, `isActive` | F-12 |
| Temples | `deity`, `street`, `timings`, `phone`, `website` | `primaryDeity`, `address`, `openingHours`, `images` | F-13 |
| Shop order | legacy `/marketplace/orders/create` | unified `/checkout/cart` computes tax/variant price/coupons | F-03 |
| Login | no `rememberMe` | short TTL when absent | F-01 |

### I.3 Backend capabilities that do not exist yet
- Push-token storage and sender (F-05).
- Gateway return handling for the app (F-06).
- A server route for theme/preferences sync (the website calls `PATCH /users/preferences`, which does not exist — F-28).

### I.4 Server-side properties confirmed positive
Booking and checkout prices are recomputed server-side (create-phonepe-order validates and computes); the PhonePe webhook confirms payments independently of client polling; the pandit eligibility service is the single booking gate; consent withdrawal via inbound STOP is handled in the webhook.

### I.5 Backend test coverage relevant to mobile
Backend suite is strong (880 tests) but several mobile-critical HTTP surfaces have **no HTTP-level tests**: `/api/checkout/*`, `/api/marketplace/orders/*`, `/api/auth/login`, `/api/auth/forgot-password/*`, `/api/users/*` profile endpoints (only one test file references them), per a grep of tests for route references. This is context for F-03 and F-14, not a mobile finding on its own.

---

## J. Security & Reliability Findings

| # | Finding | Level | Refs |
|---|---|---|---|
| J-1 | Token stored in expo-secure-store (Keystore-backed) — **positive** | n/a | authStore |
| J-2 | Short-TTL session token vs indefinite client retention; dead UI after expiry | P1 | F-01 |
| J-3 | Logout leaves cart/cache/notification data on device; allowBackup enabled | P2 | F-15, F-24 |
| J-4 | `usesCleartextTraffic="true"` in the committed manifest; production URLs are https via EAS but cleartext is not blocked | P2 | F-24 |
| J-5 | Local release build signed with the committed debug keystore (EAS-managed signing not verified) | P2 | F-24 |
| J-6 | `SYSTEM_ALERT_WINDOW` / `RECORD_AUDIO` present in the manifest without evident use | P2 | F-24 (use NOT VERIFIED) |
| J-7 | Dev LAN fallback host used if `EXPO_PUBLIC_API_URL` is unset (EAS profiles set it; local builds may not) | P3 | env.js |
| J-8 | Payment return handled on the website; only webhook guarantees confirmation; polling window ≈60 s | P2 | F-06 |
| J-9 | Pandit gate is a single source of truth with sequence-guard against stale responses — **positive**; web/mobile policy differs | P2 | F-19 |
| J-10 | Notification permission requested but push is not wired | P2 | F-05 |
| J-11 | No mobile automated tests — regression exposure for all of the above | P1 | F-14 |

Server-side security is covered by existing audits (docs/SECURITY_AUDIT_REPORT.md) and was not re-audited here.

---

## K. Test & Build Results

| Check | Command class | Result |
|---|---|---|
| Backend — run 1 | `node --test` over `backend/tests` | 880 tests / 149 suites: **824 pass, 56 fail**. This run overlapped with an accidental duplicate launch of the same suite by the auditing session, both using the same per-file test databases; failures are attributed to that interference and were **not individually triaged**. Reported for transparency. |
| Backend — run 2 (isolated, nothing else running) | same | 880 tests / 149 suites: **880 pass, 0 fail**, 0 skipped, ≈45.3 s |
| Website | Jest via react-scripts | 9 suites / **162 tests pass**, ≈4 s |
| Mobile bundle | `expo export` (Android, Hermes) to a temp directory outside the repo | **Exit 0**; 2757 modules bundled; `index-….hbc` 7.04 MB. Confirms the JS compiles and resolves — says nothing about runtime behaviour. |
| Mobile tests | — | **None exist** (no runner, no test files) — F-14 |
| Device / emulator / E2E | — | **Not run** (not available in this session) |

Safety notes: backend tests use `*_test` databases only (`MONGO_URI_TEST` was unset). Pre-existing lint warnings in the website (unused imports) are unrelated.

---

## L. Quantitative Status Dashboard

### L.1 Status counts (one primary status per row)
| Audience | COMPLETE — VERIFIED | PARTIAL | PENDING | NOT IMPLEMENTED | BLOCKED | NOT VERIFIED | NOT APPLICABLE | NOT PRESENT ON WEBSITE | Total rows | Denominator (excl. NA + NP) | Verified-complete % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| User | 0 | 15 | 18 | 0 | 0 | 37 | 3 | 7 | 80 | 70 | 0/70 = 0.0% |
| Pandit | 0 | 6 | 5 | 0 | 0 | 26 | 0 | 2 | 39 | 37 | 0/37 = 0.0% |
| **Combined** | 0 | 21 | 23 | 0 | 0 | 63 | 3 | 9 | 119 | 107 | 0/107 = 0.0% |

**Verified-complete percentage** = COMPLETE — VERIFIED ÷ (all rows − NOT APPLICABLE − NOT PRESENT ON WEBSITE). User: 0/70 = 0.0%. Pandit: 0/37 = 0.0%. Combined: 0/107 = 0.0%.

### L.2 Static-parity breakdown of applicable rows
| Audience | Applicable | PARTIAL (defect found) | PENDING (absent on mobile) | NOT VERIFIED — no discrepancy found | Share with no discrepancy found (not a verification) |
|---|---|---|---|---|---|
| User | 70 | 15 (21.4%) | 18 (25.7%) | 37 | 52.9% |
| Pandit | 37 | 6 (16.2%) | 5 (13.5%) | 26 | 70.3% |
| Combined | 107 | 21 (19.6%) | 23 (21.5%) | 63 | 58.9% |

### L.3 By module
| Module | Rows | PARTIAL | PENDING | NOT VERIFIED | NA/NP | Denominator |
|---|---|---|---|---|---|---|
| Authentication | 10 | 6 | 0 | 4 | 0 | 10 |
| Account | 2 | 0 | 0 | 2 | 0 | 2 |
| Profile | 14 | 0 | 2 | 12 | 0 | 14 |
| Settings | 6 | 0 | 3 | 2 | 1 | 5 |
| Public experience | 8 | 1 | 4 | 0 | 3 | 5 |
| Pooja discovery | 5 | 1 | 2 | 1 | 1 | 4 |
| Booking | 9 | 0 | 3 | 5 | 1 | 8 |
| Payment | 7 | 0 | 1 | 6 | 0 | 7 |
| My bookings | 7 | 3 | 0 | 3 | 1 | 6 |
| Marketplace | 10 | 1 | 2 | 5 | 2 | 8 |
| Content | 14 | 5 | 3 | 5 | 1 | 13 |
| Notifications | 6 | 0 | 0 | 4 | 2 | 4 |
| Referrals & rewards | 2 | 1 | 0 | 1 | 0 | 2 |
| Approval gate | 2 | 1 | 0 | 1 | 0 | 2 |
| KYC | 2 | 0 | 0 | 2 | 0 | 2 |
| Services | 2 | 0 | 1 | 1 | 0 | 2 |
| Availability | 3 | 0 | 1 | 2 | 0 | 3 |
| Bookings | 5 | 1 | 0 | 4 | 0 | 5 |
| Earnings | 2 | 0 | 0 | 2 | 0 | 2 |
| Ratings | 1 | 1 | 0 | 0 | 0 | 1 |
| Referrals | 2 | 0 | 1 | 1 | 0 | 2 |

### L.4 Findings by priority
| P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|
| 0 | 5 | 16 | 7 | 28 |

### L.5 Evidence depth (applicable rows)
User A=54 / B=16; Pandit A=20 / B=17.

### L.6 Findings register
| ID | Priority | Title | Audience | Backend work | Independent of website |
|---|---|---|---|---|---|
| F-01 | P1 | Mobile sessions are issued as 1-day "session" tokens but kept forever; expiry leaves a dead authenticated UI | User + Pandit | None expected (confirm TTL env on the server). | Yes |
| F-02 | P1 | Customer invoice screen reads data the booking-invoice endpoint does not return | User (+ Pandit invoice view) | Likely none (verify the invoice route authorises the owning customer). | Yes |
| F-03 | P1 | Shop checkout on mobile uses a different (older) order endpoint than the website — pricing/tax/coupon/coin differences | User | Optional: harden/deprecate legacy POST /marketplace/orders/create. | Yes (mobile change); backend hardening optional |
| F-04 | P1 | Legal documents (Privacy, Terms, Refund, About) and admin-managed footer links are not reachable in the app | User + Pandit | None. | Yes |
| F-14 | P1 | The mobile app has no automated tests and no test runner | User + Pandit | None. | Yes |
| F-05 | P2 | Push notifications are dead code; the app asks for permission it cannot use | User + Pandit | Yes — new endpoint/model/sender. | No (needs backend) |
| F-06 | P2 | After the gateway page the customer is returned to a website page, not the app | User | Yes (return-URL handling, must not weaken open-redirect protections). | No (backend + app) |
| F-07 | P2 | Coupons, coin redemption on cart, referral token and "add pooja to cart" are missing on mobile | User | None. | Yes |
| F-08 | P2 | Mobile is English-only; the website supports 11 languages including translated API content | User + Pandit | None. | Yes |
| F-09 | P2 | No guest browsing: the app requires login before any content | User | None. | Yes |
| F-10 | P2 | Booking rating: written review is dropped (field name mismatch) | User | None. | Yes |
| F-11 | P2 | Pandit "Customer Reviews" screen reads fields the API does not return | Pandit | Only if reviewer name is to be shown. | Yes |
| F-12 | P2 | Livestreams screen is wired to fields that do not exist; tapping a stream does nothing | User | None. | Yes |
| F-13 | P2 | Temple screens read fields absent from the Temple model | User | None. | Yes |
| F-15 | P2 | Logout does not clear per-user client state | User + Pandit | None. | Yes |
| F-16 | P2 | Android map tiles likely blank: react-native-maps used with no Google Maps API key configured | User + Pandit | None. | Yes |
| F-19 | P2 | Pandit approval gate is stricter on mobile than on the website | Pandit | None. | Yes |
| F-20 | P2 | No WhatsApp consent preference center in the app | User | None. | Yes |
| F-21 | P2 | Pandits cannot request a custom pooja from the app | Pandit | None. | Yes |
| F-22 | P2 | No schedule calendar for pandits | Pandit | None. | Yes |
| F-24 | P2 | Android release hardening gaps in the committed native project | User + Pandit | None. | Yes |
| F-17 | P3 | Dependency hygiene | User + Pandit | None. | Yes |
| F-18 | P3 | No Android App Links / Universal Links; web referral and share links open the browser | User + Pandit | No (web hosting file). | No (needs a website static file) |
| F-23 | P3 | Mobile offers "Cancel" for a booking state the backend rejects | User | None. | Yes |
| F-25 | P3 | Blog editor on mobile is plain text; website editor is rich text | Pandit | Unknown. | Yes |
| F-26 | P3 | Existing docs/MOBILE_FEATURE_GAP_ANALYSIS.md is stale | n/a | None. | Yes |
| F-27 | P3 | WEBSITE baseline defect (not a mobile gap): My Bookings lists only the first 10 bookings | User (website) | None. | Yes |
| F-28 | P3 | WEBSITE baseline observation: theme "sync to server" calls a route that does not exist | User (website) | None. | Yes |

#### Finding details (P1 first)

#### F-01 — P1 — Mobile sessions are issued as 1-day "session" tokens but kept forever; expiry leaves a dead authenticated UI
- **Audience:** User + Pandit  |  **Affected rows:** U-AUTH-001, U-AUTH-002, U-AUTH-006, P-AUTH-001  |  **Confidence:** High
- **Evidence:** mobile-app/src/store/authStore.js login()/loginWithOtp() never send `rememberMe`; backend/src/controllers/auth.controller.js (login) and otpLogin.controller.js:196/231 pick the short session TTL when `rememberMe` is falsy. mobile-app/src/api/axios.js 401 interceptor deletes the SecureStore items but does not clear the in-memory `user`, so navigation/RootNavigator.jsx keeps rendering the authenticated stack.
- **Impact:** After the token expires (default `JWT_EXPIRES_IN_SESSION`, not set in .env.example — actual production value NOT VERIFIED) every request fails with 401 while the UI still looks logged in. Pandits could miss booking requests; customers see empty screens and failed payments.
- **Dependency:** Backend contract (rememberMe semantics) already exists. Product decision: desired mobile session length.
- **Proposed remediation (NOT implemented):** Send `rememberMe: true` (or a documented mobile TTL) on both login calls; make the 401 interceptor call the auth store logout so state and storage stay consistent and navigation returns to Login; reset dependent stores.
- **Closing test:** Jest (jest-expo) unit tests: login payload contains rememberMe; a mocked 401 clears user and routes to Login. Device check: token older than the session TTL → app returns to Login, not a blank dashboard.
- **Backend work required:** None expected (confirm TTL env on the server).
- **Fixable independently of the website:** Yes

#### F-02 — P1 — Customer invoice screen reads data the booking-invoice endpoint does not return
- **Audience:** User (+ Pandit invoice view)  |  **Affected rows:** U-MYB-005, P-BOOK-005  |  **Confidence:** High
- **Evidence:** mobile-app/src/screens/user/InvoiceScreen.jsx expects `data.invoice(s)`; backend/src/controllers/booking.controller.js:1196-1235 (getInvoiceData) returns `{ booking, paymentLedger }`. The website uses persisted Invoice documents via GET /api/invoices/booking/:id and /invoices/number/:no (frontend/src/pages/InvoicePage.jsx). Company details on mobile come from a static config.
- **Impact:** Tax-invoice content on mobile can differ from the website (booking number shown instead of INV-… numbers; per-payment invoices and GST breakdown missing). A customer-facing financial document is inconsistent across channels.
- **Dependency:** Backend /api/invoices/* already exists and is used by the website; customer access scope must be confirmed.
- **Proposed remediation (NOT implemented):** Point the mobile invoice screen at the same invoice endpoints and DTO as the website, render per-payment invoices and GST lines, drop the static company config in favour of the server DTO.
- **Closing test:** Contract test: mobile invoice mapper fed with a recorded /invoices/booking/:id response renders invoice number, tax lines and totals identical to the website for the same booking; manual side-by-side check on a paid and a partially-paid booking.
- **Backend work required:** Likely none (verify the invoice route authorises the owning customer).
- **Fixable independently of the website:** Yes

#### F-03 — P1 — Shop checkout on mobile uses a different (older) order endpoint than the website — pricing/tax/coupon/coin differences
- **Audience:** User  |  **Affected rows:** U-SHOP-006, U-SHOP-004, U-SHOP-005, U-PAY-002  |  **Confidence:** High
- **Evidence:** Mobile: screens/user/CartScreen.jsx → POST /marketplace/orders/create (marketplace.controller.js createOrder: no product tax, variant sale price ignored). Website: POST /checkout/cart (checkout.controller.js:152-185 applies product tax, stores per-item taxRate/taxAmount, supports coupons and coin redemption).
- **Impact:** The same cart can cost a different amount depending on the channel and mobile orders omit GST. Revenue/tax-reporting integrity risk; P0 if the business confirms product GST must always be charged and invoices must show it.
- **Dependency:** Backend /checkout/* already exists. Requires PaymentVerify to support /checkout/verify/:txn.
- **Proposed remediation (NOT implemented):** Move mobile checkout to /checkout/cart and /checkout/verify/:txn; add coupon/coin controls (see F-07). Optionally make the legacy createOrder route reject or delegate to the unified pricing path (backend decision).
- **Closing test:** Same cart (with a taxed product and a variant with a sale price) priced on web and mobile yields identical totals; backend HTTP test for /checkout/cart (none exists today).
- **Backend work required:** Optional: harden/deprecate legacy POST /marketplace/orders/create.
- **Fixable independently of the website:** Yes (mobile change); backend hardening optional

#### F-04 — P1 — Legal documents (Privacy, Terms, Refund, About) and admin-managed footer links are not reachable in the app
- **Audience:** User + Pandit  |  **Affected rows:** U-PUB-003, P-SET-003  |  **Confidence:** High
- **Evidence:** No reference to /documents or /footer-links anywhere in mobile-app/src; website serves them through components/layout/Footer.jsx and pages/LegalDocumentViewerPage.jsx.
- **Impact:** Compliance and store-listing exposure (privacy policy link, refund policy shown at purchase); users and pandits cannot read terms accepted at signup from inside the app.
- **Dependency:** Backend GET /api/documents, /documents/:type/view, /footer-links/:id/view|download, /settings/public (footerLinks) exist and have tests.
- **Proposed remediation (NOT implemented):** Add a Legal/About section in Settings (both roles) that lists active documents and opens them via a PDF/WebView-safe viewer (respecting the inline/download policy).
- **Closing test:** Open each document type from the app on a device; admin-uploaded footer link appears without an app release; non-previewable types download.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-14 — P1 — The mobile app has no automated tests and no test runner
- **Audience:** User + Pandit  |  **Affected rows:** All mobile rows  |  **Confidence:** High
- **Evidence:** mobile-app/package.json declares no jest/detox/maestro and no test script (scripts: start, android, ios, build:*, submit:*); no *.test.* files under mobile-app/src. Backend has 880 passing tests, the website 162.
- **Impact:** Every mobile behaviour in this report is evidenced by static reading only; regressions (e.g. F-10..F-13 contract drift) go undetected. Limits any row from reaching COMPLETE — VERIFIED.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Add jest-expo with API-contract tests (recorded backend responses → screen mappers), store tests, and a Maestro/Detox smoke suite for login, booking, payment-return, pandit accept.
- **Closing test:** CI runs the mobile suite; contract tests fail when a backend field is renamed.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-05 — P2 — Push notifications are dead code; the app asks for permission it cannot use
- **Audience:** User + Pandit  |  **Affected rows:** U-NOTIF-004, P-NOTIF-002  |  **Confidence:** High
- **Evidence:** mobile-app/src/utils/fcm.js requests permission and fetches an Expo push token that is never sent anywhere; response listeners unused; no projectId in app.json; no google-services.json; backend has no push-token model/endpoint or sender (grep: none). Realtime delivery is Socket.IO only (foreground).
- **Impact:** Not a website parity gap (website has no push) but a functional expectation gap: a pandit with the app closed will not be alerted to a new booking request.
- **Dependency:** Requires backend push-token storage + sender (new work) and FCM/Expo project configuration.
- **Proposed remediation (NOT implemented):** Decide scope. Either remove the permission prompt (honest UX) or implement push end-to-end: register token on login, store per device, send from the notification engine, route taps.
- **Closing test:** Install on a device, close the app, create a booking assigned to a pandit → notification arrives and opens the booking.
- **Backend work required:** Yes — new endpoint/model/sender.
- **Fixable independently of the website:** No (needs backend)

#### F-06 — P2 — After the gateway page the customer is returned to a website page, not the app
- **Audience:** User  |  **Affected rows:** U-PAY-005  |  **Confidence:** High
- **Evidence:** booking.controller.js:467/614/667, marketplace.controller.js and checkout.controller.js always set redirectUrl=${clientUrl}/payment-callback/<txn>; mobile App.jsx linking handles only zutsav://register. PaymentVerifyScreen polls 20×3 s.
- **Impact:** User finishes payment in the browser, lands on a web page that requires a web login, and must find the app manually; if they return after the ~60 s polling window the screen shows a manual "check again". Confirmation still arrives through the PhonePe webhook.
- **Dependency:** Backend must accept a client-supplied/allow-listed app return URL or an https App Link that opens the app.
- **Proposed remediation (NOT implemented):** Add an allow-listed app return (custom scheme or Android App Link/iOS Universal Link) and handle zutsav://payment-callback/:txn → PaymentVerify; keep website behaviour unchanged for web clients.
- **Closing test:** Pay in sandbox from the app; gateway completion returns to the app and shows the verified booking without a manual step.
- **Backend work required:** Yes (return-URL handling, must not weaken open-redirect protections).
- **Fixable independently of the website:** No (backend + app)

#### F-07 — P2 — Coupons, coin redemption on cart, referral token and "add pooja to cart" are missing on mobile
- **Audience:** User  |  **Affected rows:** U-BOOK-005, U-BOOK-007, U-BOOK-008, U-SHOP-004, U-SHOP-005, U-PUB-006, P-REF-002  |  **Confidence:** High
- **Evidence:** No /coupons/validate, `couponCode`, `referralToken`, /referral/validate or /checkout/cart calls in mobile-app/src; website: BookingFlow.jsx, CartPage.jsx.
- **Impact:** Discounts and pandit-referral attribution are unavailable to mobile customers; mobile bookings cannot earn the referring pandit credit.
- **Dependency:** Backend endpoints exist (coupons, referral, checkout).
- **Proposed remediation (NOT implemented):** Implement after F-03 (shared checkout). Capture referral tokens from deep links (F-18) and send with create-phonepe-order.
- **Closing test:** Apply a valid/invalid coupon in app; referred booking shows referral on the pandit side.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-08 — P2 — Mobile is English-only; the website supports 11 languages including translated API content
- **Audience:** User + Pandit  |  **Affected rows:** U-PROF-008, P-SET-002  |  **Confidence:** High
- **Evidence:** mobile-app/src/i18n/index.js LOCALES = { en }; no language control in SettingsScreen; mobile api/axios.js never sends `lang`. Website: LanguageContext.jsx, 11 locale files, ?lang= on API calls; PATCH /auth/preferred-language.
- **Impact:** A headline website capability for the target user base is absent in the app.
- **Dependency:** Backend translation services exist. Locale JSON files must be shared or copied.
- **Proposed remediation (NOT implemented):** Reuse the website locale files, add a language picker (persist to /auth/preferred-language) and send `lang` on content requests.
- **Closing test:** Switch language in app; static UI strings and translated pooja/festival content change.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-09 — P2 — No guest browsing: the app requires login before any content
- **Audience:** User  |  **Affected rows:** U-PUB-001  |  **Confidence:** High
- **Evidence:** RootNavigator renders only the Auth stack when there is no user; website public routes (App.jsx PublicLayout) allow browsing and defer login to payment (useCheckoutAuthGuard).
- **Impact:** Higher drop-off for first-time users and possible store-review friction; large behavioural difference from the baseline.
- **Dependency:** Public GET endpoints already exist.
- **Proposed remediation (NOT implemented):** Product decision, then add a guest stack for browse screens with a login checkpoint before booking/checkout.
- **Closing test:** Fresh install reaches Home/Poojas/Temples without an account; booking prompts login and resumes.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-10 — P2 — Booking rating: written review is dropped (field name mismatch)
- **Audience:** User  |  **Affected rows:** U-MYB-004  |  **Confidence:** High
- **Evidence:** mobile BookingDetailScreen.jsx:113 posts { rating, comment }; booking.controller.js:1019 reads { rating, review }.
- **Impact:** Customers type a review that is silently discarded; only stars are saved, so pandits see no text.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Send `review` instead of `comment` (one-field change).
- **Closing test:** Rate with text in app → text appears in pandit Reviews (P-EARN-002).
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-11 — P2 — Pandit "Customer Reviews" screen reads fields the API does not return
- **Audience:** Pandit  |  **Affected rows:** P-RATE-001  |  **Confidence:** High
- **Evidence:** PanditRatingsScreen.jsx reads item.comment, item.userId?.name, item.createdAt, data.totalRatings; pandit.controller.js:1147-1167 returns review, ratingDate, totalReviews and does not populate userId. The Earnings → Reviews tab reads the correct fields.
- **Impact:** Review text missing, every reviewer shown as "User", date invalid, total always 0 on the dedicated screen reachable from the dashboard.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Map to review / ratingDate / totalReviews (or reuse the Earnings reviews component). Decide whether reviewer name should be exposed (privacy) before populating userId.
- **Closing test:** Screen shows text, date and correct total for a pandit with ratings.
- **Backend work required:** Only if reviewer name is to be shown.
- **Fixable independently of the website:** Yes

#### F-12 — P2 — Livestreams screen is wired to fields that do not exist; tapping a stream does nothing
- **Audience:** User  |  **Affected rows:** U-CONT-008  |  **Confidence:** High
- **Evidence:** LivestreamsScreen.jsx opens item.streamUrl and filters ?status=live; backend/src/models/Livestream.js has youtubeUrl and isActive only (no streamUrl/status/viewers/host).
- **Impact:** The feature is effectively non-functional on mobile.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Map to youtubeUrl/isActive; open YouTube via Linking or an embed.
- **Closing test:** Active stream opens/plays from the app.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-13 — P2 — Temple screens read fields absent from the Temple model
- **Audience:** User  |  **Affected rows:** U-CONT-001, U-CONT-002  |  **Confidence:** High
- **Evidence:** TemplesScreen.jsx reads item.deity; TempleDetailScreen.jsx reads street/timings/deity/phone/website; backend/src/models/Temple.js defines primaryDeity, address, openingHours, images (no phone/website).
- **Impact:** Deity, timings and street address never display; no gallery.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Map to the real field names; add the image gallery; add search/filters as on web.
- **Closing test:** Detail screen for a seeded temple shows deity, address, hours and photos.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-15 — P2 — Logout does not clear per-user client state
- **Audience:** User + Pandit  |  **Affected rows:** U-AUTH-007, P-AUTH-003  |  **Confidence:** High
- **Evidence:** authStore.logout() removes the token/user only; AsyncStorage keys zutsav_cart, zutsav_cache_* and the notification/cart/pandit-status stores persist.
- **Impact:** On a shared device the next account can see the previous account's cart and cached notifications/dashboard data (personal-data exposure; allowBackup=true widens it, see F-24).
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** On logout and on 401: clear cart, cached keys, notification store, panditStatusStore.
- **Closing test:** Login as A, add cart/notifications, logout, login as B → no residual data.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-16 — P2 — Android map tiles likely blank: react-native-maps used with no Google Maps API key configured
- **Audience:** User + Pandit  |  **Affected rows:** U-BOOK-003  |  **Confidence:** Medium
- **Evidence:** components/shared/MapPicker.jsx imports react-native-maps MapView; no apiKey in app.json (android.config.googleMaps) and no com.google.android.geo.API_KEY meta-data in the committed AndroidManifest.xml.
- **Impact:** Location picker in booking/address forms may render an empty map on Android release builds. Not confirmed on a device.
- **Dependency:** Google Maps SDK key (infrastructure).
- **Proposed remediation (NOT implemented):** Provision a restricted Android Maps SDK key and inject via app config / EAS secret.
- **Closing test:** Open the map picker on a release APK/AAB → tiles render.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-19 — P2 — Pandit approval gate is stricter on mobile than on the website
- **Audience:** Pandit  |  **Affected rows:** P-GATE-001  |  **Confidence:** Medium
- **Evidence:** Website PanditDashboard.jsx:2234 blocks only rejected/suspended; mobile PanditGateNavigator blocks every status except approved (pending, under_review, reupload_required see only Status + KYC).
- **Impact:** A newly registered or re-upload-required pandit can complete profile, services and availability on web but not in the app. Possibly intentional hardening.
- **Dependency:** None (panditEligibilityService.canReceiveBookings is the authoritative booking gate).
- **Proposed remediation (NOT implemented):** Product decision; if parity is wanted, allow profile/KYC screens for non-blocked statuses.
- **Closing test:** Pending pandit can edit profile on mobile or the divergence is documented.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-20 — P2 — No WhatsApp consent preference center in the app
- **Audience:** User  |  **Affected rows:** U-PROF-006  |  **Confidence:** High
- **Evidence:** Consent is captured only at signup (SetPasswordScreen.jsx); no calls to GET/PATCH /users/consent/whatsapp.
- **Impact:** A mobile customer cannot review or withdraw consent in-app (inbound STOP is still honoured).
- **Dependency:** Endpoints exist.
- **Proposed remediation (NOT implemented):** Add a Settings → Communication preferences screen.
- **Closing test:** Toggle in app persists and appears in admin consent audit.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-21 — P2 — Pandits cannot request a custom pooja from the app
- **Audience:** Pandit  |  **Affected rows:** P-SERV-002  |  **Confidence:** High
- **Evidence:** No /pandit/pooja-requests calls in mobile-app/src; website PanditMyPoojas.jsx + route /pandit/requested-poojas.
- **Impact:** Pandits who offer a pooja not in the catalog must use the website.
- **Dependency:** Endpoints exist (admin approval flow tested).
- **Proposed remediation (NOT implemented):** Add request form and status list.
- **Closing test:** Submit request in app → visible to admin → status updates in app.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-22 — P2 — No schedule calendar for pandits
- **Audience:** Pandit  |  **Affected rows:** P-AVAIL-003  |  **Confidence:** High
- **Evidence:** No call to GET /pandits/me/schedule-calendar; website uses it on the dashboard (PanditDashboard.jsx:672) and AvailabilityManager.
- **Impact:** Pandits lack a per-day agenda on mobile.
- **Dependency:** Endpoint exists.
- **Proposed remediation (NOT implemented):** Add a calendar/agenda view.
- **Closing test:** Agenda for today matches website for same pandit.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-24 — P2 — Android release hardening gaps in the committed native project
- **Audience:** User + Pandit  |  **Affected rows:** (build/security)  |  **Confidence:** Medium
- **Evidence:** android/app/src/main/AndroidManifest.xml: usesCleartextTraffic="true", allowBackup="true"; android/app/build.gradle release buildType uses signingConfigs.debug (debug.keystore with the public default password is committed); manifest also carries SYSTEM_ALERT_WINDOW and RECORD_AUDIO (not in app.json permissions — merged from libraries; actual use NOT VERIFIED).
- **Impact:** Cleartext HTTP allowed in production builds; locally built "release" APKs are debug-signed; app data eligible for backup; broader permissions than the features need (store review/privacy exposure). EAS Build with managed credentials may avoid the signing issue — NOT VERIFIED.
- **Dependency:** Credentials/keystore management (infrastructure).
- **Proposed remediation (NOT implemented):** Disable cleartext for release (network security config with dev-only exception), set allowBackup=false or exclude rules, use a real release keystore/EAS credentials, prune unused permissions.
- **Closing test:** Release manifest merge report shows no cleartext/backup/SYSTEM_ALERT_WINDOW; `apksigner verify --print-certs` shows the release certificate.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-17 — P3 — Dependency hygiene
- **Audience:** User + Pandit  |  **Affected rows:** (build)  |  **Confidence:** Medium
- **Evidence:** Static scan: expo-constants is imported (utils/fcm.js) but not declared; declared but never imported: @gorhom/bottom-sheet, expo-blur, expo-document-picker, expo-font, react-hook-form, react-native-modal, react-native-screens, react-native-url-polyfill (some may be peer/transitive requirements — NOT verified). The scan also reported "loading" in RootNavigator.jsx — a false positive from a comment.
- **Impact:** Undeclared import works only through hoisting; unused packages increase bundle/audit surface.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Declare expo-constants; review the unused list package by package.
- **Closing test:** Clean `npm ls` / expo-doctor and a successful export.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-18 — P3 — No Android App Links / Universal Links; web referral and share links open the browser
- **Audience:** User + Pandit  |  **Affected rows:** U-REF-002, U-PUB-006, P-REF-002  |  **Confidence:** High
- **Evidence:** App.jsx linking declares https://www.zutsav.com prefixes but AndroidManifest.xml has only zutsav:// and com.zutsav.app schemes (the https entry is a <queries> declaration, not a VIEW intent filter); no assetlinks/AASA hosting verified.
- **Impact:** Referral and shared web links never open the installed app.
- **Dependency:** Hosting /.well-known/assetlinks.json on the website domain (website deployment change).
- **Proposed remediation (NOT implemented):** Add verified https intent filters + associated-domain config; handle /r/:token and /payment-callback.
- **Closing test:** Tap an https link on a device → app opens to the right screen.
- **Backend work required:** No (web hosting file).
- **Fixable independently of the website:** No (needs a website static file)

#### F-23 — P3 — Mobile offers "Cancel" for a booking state the backend rejects
- **Audience:** User  |  **Affected rows:** U-MYB-003  |  **Confidence:** High
- **Evidence:** BookingDetailScreen.jsx CANCELLABLE_STATUSES includes completion_requested; booking.controller.js USER_CANCELLABLE_STATUSES does not.
- **Impact:** User taps Cancel and gets a 400 error.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Align the status list (ideally derive it from the booking DTO).
- **Closing test:** Cancel button hidden/disabled for completion_requested.
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-25 — P3 — Blog editor on mobile is plain text; website editor is rich text
- **Audience:** Pandit  |  **Affected rows:** P-BLOG-001  |  **Confidence:** Medium
- **Evidence:** PanditBlogEditorScreen.jsx uses plain inputs; website BlogEditor.jsx is a rich-text editor (stored format not compared in this audit).
- **Impact:** Formatting authored on the web may be lost or shown as markup when edited on mobile.
- **Dependency:** Possibly a content-format contract.
- **Proposed remediation (NOT implemented):** Confirm the stored format; use a compatible editor or restrict mobile editing.
- **Closing test:** Round-trip a formatted blog web → mobile → web without loss.
- **Backend work required:** Unknown.
- **Fixable independently of the website:** Yes

#### F-26 — P3 — Existing docs/MOBILE_FEATURE_GAP_ANALYSIS.md is stale
- **Audience:** n/a  |  **Affected rows:** (documentation)  |  **Confidence:** High
- **Evidence:** The doc lists as missing/regressed: forgot/reset password, family members, partial payment, panchang fields, payment-verify endpoint selection, pandit approval-status gating, and says wallet is "not built" on either platform. Each now exists in current code (U-AUTH-005, U-PROF-005, U-BOOK-004, U-CONT-004, U-PAY-002, P-GATE-001/002, U-PAY-007). It also states mobile has "full Expo/FCM push registration" (the token is never sent anywhere — F-05) and treats theme/language server sync as a website feature (the route does not exist — F-28).
- **Impact:** Misleads planning and prioritisation.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Mark superseded by this audit once approved (not done here — read-only).
- **Closing test:** n/a
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-27 — P3 — WEBSITE baseline defect (not a mobile gap): My Bookings lists only the first 10 bookings
- **Audience:** User (website)  |  **Affected rows:** U-MYB-001  |  **Confidence:** High
- **Evidence:** frontend/src/pages/MyBookings.jsx calls GET /bookings/my with no page/limit; backend default limit is 10.
- **Impact:** Website customers with more than 10 bookings cannot see older ones; mobile paginates correctly.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Out of scope for this audit (website is read-only baseline) — report for the website backlog.
- **Closing test:** n/a
- **Backend work required:** None.
- **Fixable independently of the website:** Yes

#### F-28 — P3 — WEBSITE baseline observation: theme "sync to server" calls a route that does not exist
- **Audience:** User (website)  |  **Affected rows:** U-PROF-007  |  **Confidence:** High
- **Evidence:** frontend/src/context/ThemeContext.jsx PATCH /users/preferences; no such route under backend/src/routes.
- **Impact:** Theme persistence is effectively local on both platforms; do not treat server theme sync as a parity requirement.
- **Dependency:** None.
- **Proposed remediation (NOT implemented):** Report for the website backlog.
- **Closing test:** n/a
- **Backend work required:** None.
- **Fixable independently of the website:** Yes


---

## M. Prioritized Remediation Roadmap (PROPOSED — awaiting approval; nothing implemented)

**Phase 0 — Decisions (no code).** Answer the questions in Section N: mobile session length, product GST on shop orders, guest browsing, push scope, pandit gate policy, language scope, and whether to supersede the stale gap doc.

**Phase 1 — Safety net and contract-drift fixes (mobile-only, small, high value).**
1. F-14 — add jest-expo + API-contract tests and a minimal E2E smoke plan *first*, so every later fix ships with a regression test.
2. F-01 — send `rememberMe`/agreed TTL; make the 401 interceptor sign the user out.
3. F-15 — clear per-user state on logout/401.
4. F-10, F-11, F-12, F-13, F-23 — field-name/status alignments.
*Exit criterion:* contract tests green; those rows move from PARTIAL to COMPLETE — VERIFIED only after a device run.

**Phase 2 — Money, tax and compliance parity.** F-02 (invoice DTO), F-03 + F-07 (unified checkout, coupons, coin redemption), F-04 (legal documents), F-24 (manifest/signing hardening), F-16 (Maps key). Backend HTTP tests for `/checkout` should land with F-03.

**Phase 3 — Payment return and deep links.** F-06 (app return after gateway), F-18 (App Links + the website's `/.well-known` file), referral-token capture (F-07).

**Phase 4 — Feature parity.** F-08 language, F-20 consent center, F-21 custom pooja request, F-22 schedule calendar, F-09 guest browsing (if approved), pooja categories/reviews, hero banners, AI guided flow, profile-photo removal, blog tags/comment delete, F-19 gate policy, F-25 editor.

**Phase 5 — Push notifications** (F-05) — needs new backend work and FCM/Expo configuration.

**Phase 6 — Verification and re-audit.** Device matrix (low/mid Android, one iOS if shipped), E2E for login → booking → pay → return, pandit accept → complete, and a re-run of this audit to flip rows to COMPLETE — VERIFIED.

**Sequencing notes.** Phases 1 and 4 are independent of the website and of each other once F-14 lands. F-05, F-06 and F-18 need backend or website static-file changes and are the long poles. F-27/F-28 belong to the website backlog and need no mobile work.

---

## N. Outstanding Questions & Verification Gaps

**Product questions**
1. What mobile session length is intended (F-01)? Is the production `JWT_EXPIRES_IN_SESSION` known?
2. Must product GST always be charged on shop orders from every channel (F-03: P0?)?
3. Is guest browsing intended for the app (F-09)? Is English-only an accepted launch constraint (F-08)?
4. Should pending / under-review / re-upload-required pandits reach profile screens on mobile (F-19)?
5. Is push wanted (F-05) — and if so, FCM or Expo push?
6. Are pooja categories, pre-booking reviews, hero banners, AI guided flow and customer blog authoring in scope for mobile?
7. Is the iOS target shipping (the committed native project is Android-only; iOS settings are in `app.json`/`eas.json` only)?

**Verification gaps**
- No device/emulator/E2E evidence for any mobile row; no mobile unit tests.
- Live PhonePe return/redirect behaviour not exercised (F-06).
- 33 applicable rows are depth B (screen source not read end-to-end).
- Production values (JWT TTLs, gateway URLs, EAS credentials, Maps key presence in EAS secrets) not inspected — F-01, F-16, F-24 carry that caveat.
- Rich-text storage format compatibility between web and mobile blog editors (F-25) not compared.
- Profile-completion formula (P-PROF-008) not compared check-by-check.
- Runtime use of `SYSTEM_ALERT_WINDOW`/`RECORD_AUDIO` (F-24) and necessity of declared-but-unimported packages (F-17) not confirmed.
- Backend run 1 failures (56) were not individually triaged; run 2 was clean.
- Admin module on mobile, accessibility, performance, and localisation quality were not audited.

---

## O. Final Conclusion

The mobile app covers most User and Pandit journeys and shares the website's backend contracts for registration, booking, PhonePe payment verification, KYC, accept/reject/complete and earnings. Against the website baseline there are **21 features with a concrete defect or contract mismatch**, **23 features absent on mobile**, and **63 implemented features with no discrepancy found but no executed evidence**. The highest-impact items are the session-expiry behaviour (F-01), shop-order pricing/tax divergence (F-03), the invoice contract mismatch (F-02), missing in-app legal documents (F-04) and the total absence of mobile tests (F-14).

**This is a complete static audit of the stated scope, not a verification.** Nothing is called COMPLETE — VERIFIED, and 33 rows rest on API-trace evidence rather than full source reads (Section B.5). The audit made no changes to the website or to any existing file. **No fixes will be started until the roadmap in Section M is approved.**

beta.. kuch bhi ni chalra mobile app ka to claude ne pure 1 ghanta merko.. gali dekhr banya hai yeah report