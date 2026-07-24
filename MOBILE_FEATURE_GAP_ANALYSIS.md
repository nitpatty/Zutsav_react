# Zutsav Mobile Feature Gap Analysis

**Audit type:** Production readiness / feature-parity audit
**Reference implementation:** Web platform (`frontend/`)
**Comparison target:** Mobile application (`mobile-app/`)
**Backend:** `backend/` (Express, 27 route files)
**Roles audited:** Devotee (User), Pandit. Admin role excluded per scope (mobile has a large, largely-parallel admin module of its own — noted only where it affects a cross-cutting backend finding).
**Method:** Direct code inspection of every page/screen/component/route file cited below (file:line evidence throughout). No assumptions — every "missing" claim below was confirmed by grep/read on both platforms before being reported as a gap, and cross-checked against the backend where relevant.

---

## Executive Summary

| Metric | Score | Basis |
|---|---|---|
| **Devotee completion** | **~68%** | 33 audited feature areas, weighted (Implemented=100, Partial=55, UI-only=30, Missing=0) |
| **Pandit completion** | **~86%** | 14 audited feature areas, same weighting |
| **Overall completion** | **~74%** | Combined weighted average across 47 feature areas |
| **Production readiness** | **Not ready** — conditional on Phase 1 fixes below | 4 confirmed critical gaps + 3 confirmed functional bugs |

**Headline findings:**

1. **Forgot/Reset Password is completely absent on mobile.** The link exists (`LoginScreen.jsx:68-70`) but just shows a "Coming soon" toast. Any devotee or pandit who forgets their password has **no account-recovery path** in the app. This alone is release-blocking.
2. **Legal Documents (Privacy Policy / Terms of Service) are not integrated anywhere in the mobile app.** The backend route (`legalDocument.routes.js`) and web UI (`Footer.jsx`, `LegalDocumentsSection.jsx`) exist; mobile has zero references. This is a compliance/App-Store-policy risk, not just a UX gap.
3. **Panchang data has silently diverged.** A recent migration (commit `861a163`) moved web to a richer multi-entry Tithi/Yoga/Karana + Auspicious Timings model via FreeAstroAPI, but explicitly left mobile on the legacy single-value fields. Mobile now shows measurably less accurate/complete panchang data than web from the same endpoint.
4. **Pandit account-status gating does not exist on mobile.** A rejected or suspended pandit account gets full, unrestricted dashboard access on mobile — web at least partially gates this via `ApplicationGate`.
5. **Cart/checkout architecture diverges materially.** Mobile's cart is products-only; there is no way to combine a pooja booking with a marketplace purchase into one checkout, and partial-payment / referral-capture are silently dropped from the mobile booking flow.
6. **Three likely functional bugs** were found in mobile code (wrong auth-store method call post-registration, mismatched payment-verification endpoint, mismatched rating-submission payload key) — see **Bugs Found**.

**Where mobile is ahead of web** (important context — this is not a one-directional gap report): pandit earnings trend charts, a dedicated pandit notification center, referral QR codes, booking quick-actions (call/WhatsApp/maps) with an audit timeline, a genuine multi-address address book, native push notifications (web has none), and full KYC/registration screen coverage. See the callout below.

---

## Where Mobile Exceeds Web

To keep this audit honest and useful for planning (not just a punch-list), these are areas where mobile is **ahead** of the reference implementation:

- **Pandit earnings charts** — mobile-only `/pandits/me/dashboard` backend aggregation feeds 30-day/12-month trend charts in `PanditEarningsScreen.jsx`; web has no equivalent visualization.
- **Pandit notification center** — `PanditNotificationsScreen.jsx` gives pandits a dedicated, role-aware deep-linking notification list; web has no standalone pandit notification page at all.
- **Referral QR code + native share** — `PanditReferralDetailScreen.jsx` adds a QR code and native share sheet not present on web.
- **Booking detail depth** — mobile's `PanditBookingDetailScreen.jsx` / `BookingDetailScreen.jsx` add call/WhatsApp/maps quick-actions, a payment ledger, and an audit-log timeline that web's booking cards don't show.
- **Address book** — `AddressBookScreen.jsx` (via `AddressPicker mode="manager"`) is a real multi-address CRUD UI; web only captures a single inline address on the profile page and an inline checkout address — there's no web equivalent to point to.
- **Push notifications** — mobile has full Expo/FCM push registration (`mobile-app/src/utils/fcm.js`); web has no browser push/service-worker support at all.
- **Refund status visibility** — mobile shows a persistent post-cancellation "Refund Status" card; web only shows a generic status pill.
- **Notification deep-linking** — mobile resolves booking/order *numbers* to real IDs before navigating to the exact detail screen; web redirects to generic list pages.
- **Festival month search** — mobile added in-page festival search that web's calendar page lacks.

---

## Feature Comparison Table

| Module | Web | Mobile | Status | Priority |
|---|---|---|---|---|
| Login | ✓ | ✓ | Implemented (remember-me cosmetic only) | Low |
| Registration | ✓ | ✓ | Partial — likely bug at final step | High |
| OTP Verification | ✓ (registration + reset) | ✓ (registration only) | Partial | High |
| Forgot/Reset Password | ✓ | ✗ | **Missing** | **Critical** |
| Session/Token/Logout | ✓ | ✓ | Implemented (no server-side logout call on mobile) | Medium |
| Splash/Bootstrap | — | ✓ | Mobile-only addition | N/A |
| Profile View/Edit | ✓ | ✓ | Implemented | Low |
| Settings (theme/language/notifications) | ✓ | ✓ | Partial — no language switcher on mobile | High |
| Address Book | inline only | ✓ dedicated CRUD | Mobile ahead | N/A |
| Change Password | ✓ | ✓ | Implemented | Low |
| Delete/Restore Account | ✓ | ✓ | Implemented (possible OTP-channel bug) | Medium |
| Devotee Dashboard | ✓ (stats + panchang widget) | ✓ (no stats/panchang widget) | Partial | Medium |
| Devotee Navigation (Family Members, Kundli) | ✓ | ✗ | **Missing** | High |
| Pooja Browsing (categories/sort/reviews) | ✓ | ~ (flat list only) | Partial | Medium |
| Booking Flow (partial pay, add-to-cart, referral) | ✓ | ~ (full pay only) | Partial | High |
| Booking History/Detail | ✓ | ✓ | Implemented | Low |
| Booking Cancellation | ✓ | ✓ | Implemented (status-list mismatch) | Low |
| Marketplace Browsing | ✓ | ✓ | Implemented | Low |
| Cart (mixed pooja + product) | ✓ unified | ✗ products-only | **Partial (High gap)** | High |
| Checkout & Payment Verification | ✓ (4 tailored endpoints) | ~ (generic poller, possible wrong endpoint) | Partial | High |
| Marketplace Orders | ✓ | ✓ | Implemented | Low |
| Reviews & Ratings | ✓ (pre + post) | ~ (post only, payload mismatch) | Partial | Medium |
| Wallet | ✗ (not built) | ✗ | N/A | N/A |
| Wishlist | ✗ (not built) | ✗ | N/A | N/A |
| Coupons/Discounts | ✗ (not built) | ✗ | N/A | N/A |
| Refunds (devotee-facing) | ✓ | ✓ (ahead) | Implemented | Low |
| Temple Directory | ✓ (filters, photos, livestream link) | ~ (search only) | Partial | Medium |
| Panchang | ✓ (new multi-entry model) | ~ (legacy single-value) | **Partial — confirmed regression** | High |
| Festival Calendar | ✓ | ✓ (slightly ahead) | Implemented | Low |
| Blogs — Reading | ✓ | ✓ | Implemented (plain-text render) | Low |
| Blogs — Authoring (devotee) | ✓ | ✗ | **Missing** | High |
| Livestreams | ✓ (in-app embed) | ~ (opens external browser) | Partial | Medium |
| AI Assistant | ✓ (guided flow + persistence) | ~ (freeform only, no persistence) | Partial | Medium |
| Notifications (in-app + push) | ✓ in-app realtime only | ✓ push + in-app (different model) | Implemented, platform-appropriate split | Low |
| Referral (devotee-facing) | disabled/hidden | ✗ | N/A (dormant on both) | Low |
| Global Search | ✗ (not built) | ✗ | N/A | N/A |
| Legal Documents (Terms/Privacy) | ✓ | ✗ | **Missing** | **Critical** |
| Hero/Promo Banners | ✓ | ✗ | Missing | Medium |
| Public Settings/Branding fetch | ✓ | ✗ (possibly hardcoded) | Missing/Unclear | Medium |
| Pandit Registration | ✓ single form | ~ deferred, unguided | Partial | Medium |
| Pandit KYC/Documents | ✓ | ✓ | Implemented | Low |
| Pandit Approval-Status Gating | ~ partial | ✗ | **Missing** | **Critical** |
| Pandit Personal/Family/Education/Specializations | ✓ | ✓ | Implemented | Low |
| Pandit Bank/UPI | ✓ | ✓ | Implemented | Low |
| Pandit Pooja/Service Management | ✓ (+ custom request) | ~ (no custom request) | Partial | Medium |
| Pandit Availability/Calendar | ✓ (+ mini-calendar) | ~ (no visual calendar) | Implemented, cosmetic gap | Low |
| Pandit Bookings | ✓ | ✓ (ahead) | Implemented | Low |
| Pandit Earnings | ✓ | ✓ (ahead — charts) | Implemented | Low |
| Pandit Ratings | ✓ | ✓ | Implemented | Low |
| Pandit Blogs | ✓ (undiscoverable) | ✓ (ahead — discoverable) | Implemented | Low |
| Pandit Referral | ✓ | ✓ (ahead — QR) | Implemented | Low |
| Pandit Notifications | ~ inline only | ✓ (ahead — dedicated center) | Implemented | Low |
| Pandit Settings | ✓ | ✓ (shared component) | Implemented | Low |

---

## Devotee Missing Features

### High Priority

- **Forgot/Reset Password entirely absent.** `mobile-app/src/screens/auth/LoginScreen.jsx:68-70` shows only `Toast.show({type:'info', text1:'Coming soon'})`. No screen exists in `AuthNavigator.jsx:17-21`. Web reference: `frontend/src/pages/ForgotPassword.jsx` (4-step flow, fully built, calls `/auth/forgot-password/check-account`, `/send-otp`, `/verify-otp`, `/reset`). **Release-blocking.**
- **Legal Documents (Terms of Service, Privacy Policy) not integrated.** Backend route `legalDocument.routes.js` (`GET /api/documents`, `/:type`, `/:type/view`) is consumed by web (`Footer.jsx`) but has zero references anywhere in `mobile-app/src`. Mobile users cannot view these documents in-app — a compliance and app-store-policy risk.
- **Language switcher missing.** Web `Settings.jsx:24-94` offers 11 languages, account-wide, persisted to `/users/preferences`. `mobile-app/src/screens/user/SettingsScreen.jsx` has no language control at all.
- **"Family Members" and "Kundli" screens don't exist on mobile.** Both are top-level items in web's profile menu (`Navbar.jsx:53-60`); confirmed via grep that no devotee-facing mobile screen implements either. A devotee has no way to reach these features in the app.
- **Booking flow silently drops partial payment and referral capture.** Web `ReviewStep.jsx:110-211` lets a user choose PARTIAL payment with a custom amount and captures a referral token (`BookingFlow.jsx:126-131,398-412`). Mobile's `BookingFlowScreen.jsx:551-618` fetches `partialConfig` but hardcodes `paymentMode: 'FULL'` and never surfaces a referral banner.
- **Cart cannot hold pooja bookings; no combined checkout.** Web's `CartPage.jsx` is unified (poojas + products, single `/checkout/cart` call). Mobile's `CartScreen.jsx`/`useCartStore` is products-only; `BookingFlowScreen.jsx` has no "add to cart" path at all.
- **Checkout/payment verification is weaker and possibly mis-routed.** Web branches into 4 dedicated verification endpoints with tailored UX (`PaymentCallback.jsx`). Mobile's single generic poller (`PaymentVerifyScreen.jsx`) appears to call `/bookings/verify-phonepe/:id` for remaining-payment flows instead of the dedicated `/bookings/verify-remaining/:id` web uses — needs backend confirmation, treat as a likely bug.
- **Devotee blog authoring is entirely missing.** Web: `BlogEditor.jsx` + `MyBlogsPage.jsx`, reachable from `BlogHomePage.jsx:508-526`. No editor, draft management, or "My Blogs" screen exists anywhere under `mobile-app/src/screens/user/`.
- **Panchang shows stale/incomplete data relative to web** (see Executive Summary #3 — full detail under Bugs Found / UI Differences).

### Medium Priority

- Settings: mobile theme choice is AsyncStorage-only, never synced to backend (`themeStore.js:123-143`) — inconsistent across devices vs. web's `/users/preferences` sync.
- Dashboard missing the stats row (bookings/orders/notifications/days-active) and the "Daily Spiritual Insight" panchang widget that anchor web's `UserDashboard.jsx`.
- Delete-account OTP verification sends `{phone: user?.phone}` regardless of chosen channel (`DeleteAccountScreen.jsx:61`) — if a user picks the email OTP channel, verification may still key off phone. Needs backend confirmation.
- Pooja browsing has no category screen, no sort, and no pre-booking reviews tab — mobile's Overview step is a single static card vs. web's 6-tab `PoojaDetailsStep.jsx`.
- Reviews/ratings payload key mismatch: mobile sends `{rating, comment}`, web sends `{rating, review}` to the same `POST /bookings/:id/rate`.
- Temple directory has no state/deity/type filters, no photo gallery, and no livestream cross-link that web's directory/detail pages have.
- Livestreams open in an external browser (`Linking.openURL`) instead of an in-app embedded player; only `status=live` streams are fetched (no past/upcoming browsing).
- AI Assistant lacks web's guided-recommendation flow (`/ai/guided-recommend`, `/ai/guided-intents`) and doesn't persist conversation across navigation/screen unmount.
- Hero/promotional banner carousel (`GET /api/hero-banners`) is consumed by web's `Home.jsx` but never called anywhere in mobile — the mobile home screen skips this admin-managed promo feature entirely.
- Public branding/contact settings (`GET /api/settings/public`) aren't fetched on mobile — confirm whether these values are hardcoded, which would silently drift from admin-configured branding (logo, support contact, WhatsApp number).

### Low Priority

- Remember-me checkbox on mobile login doesn't affect session persistence behavior (SecureStore always persists regardless).
- Mobile logout doesn't call the server-side `/auth/logout` endpoint (local token clear only).
- Cancellable-booking status list differs by one status (`completion_requested`) between mobile and web.
- Marketplace: mobile always shows a flat product grid vs. web's sectioned "Blinkit-style" category rows; multi-variant products route to detail page instead of an inline dropdown.
- Blog content renders as plain text on mobile (`BlogDetailScreen.jsx:147-149`) instead of the rich HTML web produces.
- No devotee-facing referral UI — but this is dormant on web too (explicitly commented out in `Profile.jsx`), so this is a cross-platform product decision, not a mobile-specific gap.

---

## Pandit Missing Features

### High Priority

- **No account-status gating.** `mobile-app/src/navigation/RootNavigator.jsx:59-65` routes any `role==='pandit'` user straight into the full `PanditNavigator` regardless of application status. Confirmed via grep: no mobile screen reads the application-level `pandit.status` field (only the document-level `kycStatus` is surfaced as a dashboard banner). A rejected or suspended pandit retains full dashboard/booking access on mobile. Web at least partially gates this via `ApplicationGate` (`PanditDashboard.jsx:2031-2033`) and a dedicated `PanditStatus.jsx` waiting-room page.

### Medium Priority

- **Registration collects zero vetting data upfront.** Mobile's `RegisterScreen.jsx → OTPScreen.jsx → SetPasswordScreen.jsx` posts only name/email/phone/password to `/auth/complete-registration`, which auto-sets `status: 'approved'`. Web's `PanditRegistration.jsx` requires govt ID, address, bio, experience, and specializations in one submission before the account is even created, and the backend sets `status: 'pending'` for admin review. Mobile pandits get full app access with none of this data collected, deferred to 8 disconnected profile-edit screens with no forced sequence.
- **No "Request New Pooja" (custom pooja submission).** Web offers this in two places (`PanditMyPoojas.jsx`, `PanditMyProfile.jsx`'s Poojas tab) via `POST /pandit/pooja-requests`. No mobile screen calls this endpoint at all — pandits with a niche service not in the master catalog have no mobile path to request it.

### Low Priority

- Availability screen has full CRUD parity with web but lacks the web's visual month-grid `MiniCalendar` and side-panel upcoming-bookings view — cosmetic only.
- Minor client-side validation gap: web's age-vs-experience guard on the specializations form (`PanditMyProfile.jsx:516-522`) isn't replicated on mobile.
- Everything else in the pandit role (KYC, personal/family/education/specializations, bank/UPI, bookings, earnings, ratings, blogs, referral, notifications, settings) has full or better-than-web parity — no action needed.

---

## Screen Comparison

Legend: ✓ = present/complete · ~ = partial · ✗ = missing · — = not applicable

### Auth

| Screen | Web | Mobile | UI | Backend | Nav Wired | Functional |
|---|---|---|---|---|---|---|
| Login | ✓ Login.jsx | ✓ LoginScreen.jsx | ✓ | ✓ | ✓ | ✓ (remember-me cosmetic) |
| Register | ✓ Register.jsx | ✓ RegisterScreen.jsx | ✓ | ✓ | ✓ | ~ (final-step bug, see Bugs) |
| OTP Verify | ✓ (inline in Register/Forgot) | ✓ OTPScreen.jsx | ✓ | ✓ | ~ (only registration path wired) | ~ |
| Forgot Password | ✓ ForgotPassword.jsx | ✗ | — | ✓ (backend ready) | ✗ | ✗ **Missing** |
| Set Password (post-OTP) | inline | ✓ SetPasswordScreen.jsx | ✓ | ✓ | ✓ | ~ (bug) |
| Splash | ✗ | ✓ SplashScreen.jsx | ✓ | ✓ | ✓ | ✓ (mobile-only) |

### Devotee

| Screen | Web | Mobile | UI | Backend | Nav Wired | Functional |
|---|---|---|---|---|---|---|
| Dashboard | ✓ UserDashboard.jsx | ✓ DashboardScreen.jsx | ~ (missing stats/panchang widget) | ✓ | ✓ | ~ |
| Profile | ✓ Profile.jsx | ✓ ProfileScreen.jsx + PersonalInfoScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Settings | ✓ Settings.jsx | ✓ SettingsScreen.jsx | ~ (no language) | ~ (theme not synced) | ✓ | ~ |
| Address Book | inline only | ✓ AddressBookScreen.jsx | ✓ | ✓ | ✓ | ✓ (mobile ahead) |
| Change Password | ✓ (in Profile.jsx) | ✓ ChangePasswordScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Delete Account | ✓ (modal in Profile.jsx) | ✓ DeleteAccountScreen.jsx | ✓ | ~ (OTP channel bug) | ✓ | ~ |
| Family Members | ✓ (Navbar link) | ✗ | — | unknown | ✗ | ✗ **Missing** |
| Kundli | ✓ (Navbar link) | ✗ | — | unknown | ✗ | ✗ **Missing** |
| Pooja Categories | ✓ PoojaCategories.jsx | ✗ (flat list only) | ~ | ✓ | ~ | ~ |
| Pooja List | ✓ PoojaList.jsx | ✓ PoojaListScreen.jsx | ~ (no sort/category filter) | ✓ | ✓ | ~ |
| Booking Flow | ✓ BookingFlow.jsx | ✓ BookingFlowScreen.jsx | ~ (no partial pay/cart/referral) | ~ | ✓ | ~ |
| Booking Success | ✓ BookingSuccess.jsx | inline in flow | ✓ | ✓ | ✓ | ✓ |
| My Bookings | ✓ MyBookings.jsx | ✓ BookingsScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Booking Detail | inline in MyBookings.jsx | ✓ BookingDetailScreen.jsx | ✓ (ahead) | ✓ | ✓ | ✓ |
| Cart | ✓ CartPage.jsx (unified) | ✓ CartScreen.jsx (products-only) | ~ | ~ | ✓ | ~ **Partial gap** |
| Marketplace | ✓ Marketplace.jsx | ✓ MarketplaceScreen.jsx | ~ (no sectioned view) | ✓ | ✓ | ✓ |
| Product Detail | ✓ ProductDetail.jsx | ✓ ProductDetailScreen.jsx | ~ (no inline variant dropdown) | ✓ | ✓ | ✓ |
| My Orders | ✓ MyOrders.jsx | ✓ OrdersScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Order Detail | inline | ✓ OrderDetailScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Invoice | ✓ InvoicePage.jsx | ✓ InvoiceScreen.jsx | ✓ | ~ (different route path, see Bugs) | ✓ | ✓ |
| Payment Callback/Verify | ✓ PaymentCallback.jsx (4 tailored paths) | ✓ PaymentVerifyScreen.jsx (1 generic) | ~ | ~ (possible wrong endpoint) | ✓ | ~ |
| Temple Directory | ✓ TempleDirectory.jsx | ✓ TemplesScreen.jsx | ~ (no filters) | ✓ | ✓ | ~ |
| Temple Detail | inline/modal | ✓ TempleDetailScreen.jsx | ~ (no photos/livestream link) | ✓ | ✓ | ~ |
| Panchang | ✓ PanchangPage.jsx | ✓ PanchangScreen.jsx | ~ (legacy fields) | ~ | ✓ | ~ **Data gap** |
| Festivals | ✓ Festivals.jsx | ✓ FestivalsScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Festival Detail | inline/modal | ✓ FestivalDetailScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Blogs (read) | ✓ BlogHomePage.jsx / BlogDetailPage.jsx | ✓ BlogsScreen.jsx / BlogDetailScreen.jsx | ~ (plain-text render) | ✓ | ✓ | ✓ |
| Blog Editor (write) | ✓ BlogEditor.jsx | ✗ | — | ✓ (backend ready) | ✗ | ✗ **Missing** |
| My Blogs | ✓ MyBlogsPage.jsx | ✗ | — | ✓ | ✗ | ✗ **Missing** |
| Livestreams | ✓ LivestreamsPage.jsx (in-app embed) | ✓ LivestreamsScreen.jsx (external) | ~ | ~ | ✓ | ~ |
| AI Assistant | ✓ AIAssistant.jsx / ZutsavAIWidget.jsx | ✓ AIAssistantScreen.jsx | ~ (no guided flow/persistence) | ~ | ✓ | ~ |
| Notifications | ✓ Notifications.jsx (socket realtime) | ✓ NotificationsScreen.jsx (push + fetch) | ✓ (different model) | ✓ | ✓ | ✓ |
| Referral Landing | ✓ ReferralLanding.jsx (pandit-facing) | ✗ | — | ✓ | ✗ | N/A |
| Legal Docs (Terms/Privacy) | ✓ (Footer.jsx) | ✗ | — | ✓ (backend ready) | ✗ | ✗ **Missing** |

### Pandit

| Screen | Web | Mobile | UI | Backend | Nav Wired | Functional |
|---|---|---|---|---|---|---|
| Registration | ✓ PanditRegistration.jsx (full form) | ~ (bare account only) | ~ | ~ | ✓ | ~ |
| Status/Approval Gate | ~ PanditStatus.jsx (partial gate) | ✗ | — | unused | ✗ | ✗ **Missing** |
| Dashboard | ✓ PanditDashboard.jsx | ✓ PanditDashboardScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Personal Info | tab in PanditMyProfile.jsx | ✓ PanditPersonalInfoScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Family Info | tab in PanditMyProfile.jsx | ✓ PanditFamilyInfoScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Education | tab in PanditMyProfile.jsx | ✓ PanditEducationScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Specializations | tab in PanditMyProfile.jsx | ✓ PanditSpecializationsScreen.jsx | ~ (missing age/exp validation) | ✓ | ✓ | ✓ |
| KYC/Documents | tab in PanditMyProfile.jsx | ✓ PanditKYCScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Bank/UPI | tab in PanditMyProfile.jsx | ✓ PanditBankUPIScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Address | inline in profile | ✓ PanditAddressScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Pooja Services | ✓ PanditMyPoojas.jsx + tab | ~ PanditPoojaServicesScreen.jsx (no custom request) | ~ | ~ | ✓ | ~ |
| Availability | ✓ AvailabilityManager.jsx (+ mini-calendar) | ✓ PanditAvailabilityScreen.jsx (no calendar view) | ~ | ✓ | ✓ | ✓ |
| Bookings | tab in PanditDashboard.jsx | ✓ PanditBookingsScreen.jsx | ✓ (ahead) | ✓ | ✓ | ✓ |
| Booking Detail | inline accordion | ✓ PanditBookingDetailScreen.jsx | ✓ (ahead) | ✓ | ✓ | ✓ |
| Earnings | tab in PanditDashboard.jsx | ✓ PanditEarningsScreen.jsx (+ charts) | ✓ (ahead) | ✓ | ✓ | ✓ |
| Ratings | inline in Dashboard/Earnings | ✓ PanditRatingsScreen.jsx | ✓ | ✓ | ✓ | ✓ |
| Blog Editor | ✓ BlogEditor.jsx (undiscoverable) | ✓ PanditBlogEditorScreen.jsx (ahead) | ✓ | ✓ | ✓ | ✓ |
| My Blogs | ✓ MyBlogsPage.jsx (undiscoverable) | ✓ PanditMyBlogsScreen.jsx (ahead) | ✓ | ✓ | ✓ | ✓ |
| Referral | tab in PanditDashboard.jsx | ✓ PanditReferralScreen.jsx + Detail (ahead) | ✓ | ✓ | ✓ | ✓ |
| Notifications | inline only, no dedicated page | ✓ PanditNotificationsScreen.jsx (ahead) | ✓ | ✓ | ✓ | ✓ |
| Settings | shared Settings.jsx (assumed) | ✓ PanditSettingsScreen.jsx (shared component) | ✓ | ✓ | ✓ | ✓ |

---

## API Comparison

Full endpoint inventory in `backend/src/routes/*.js` (27 files, all mounted in `backend/src/app.js:120-144`, two nested under `admin.routes.js`). Cross-checked against every `api.get/post/put/patch/delete` call in `frontend/src` and `mobile-app/src`.

| Domain | Route File | Web | Mobile | Notes |
|---|---|---|---|---|
| Auth | auth.routes.js, passwordReset.routes.js | ✓ | ✓ | Full parity |
| Users/Profile/Addresses | user.routes.js | ✓ | ✓ | Full parity |
| Pandits (self-service) | pandit.routes.js | ✓ | ✓ | Full parity |
| **Pandit Custom Pooja Requests** | poojaRequest.routes.js | ✓ | **✗** | **Missing API integration in mobile** |
| Admin (core) | admin.routes.js | ✓ | ✓ | Out of role scope, broad parity noted |
| Admin Management (system_admin) | adminManagement.routes.js | ✓ | ✗ | Likely intentional desktop-only scope |
| Config Center | configCenter.routes.js | ✓ | ✗ | Desktop-only admin panel, reasonable |
| **Legal Document Admin/Public** | legalDocument.routes.js | ✓ | **✗** | **Missing — Terms/Privacy unreachable on mobile** |
| Masters (read) | masters.routes.js | ✓ | ✓ | Full parity for read |
| Bookings | booking.routes.js | ✓ | ✓ | Full parity |
| Checkout/Cart | checkout.routes.js | ✓ | ✓ (partial usage — no mixed cart) | See Cart gap |
| Poojas/Services | pooja.routes.js | ✓ | ✓ | Public/read parity |
| Festivals | festival.routes.js | ✓ | ✓ | Public parity |
| Marketplace | marketplace.routes.js | ✓ | ✓ | Full parity |
| Temples | temple.routes.js | ✓ | ✓ | Public parity |
| **Hero Banners** | heroBanner.routes.js | ✓ | **✗** | **Missing — no promo carousel on mobile home** |
| Livestreams | livestream.routes.js | ✓ | ✓ | Full parity |
| AI/Chat | ai.routes.js | ✓ (2 endpoints) | ~ (1 of 2 — no guided-recommend) | Partial |
| Panchang | panchang.routes.js | ✓ (new fields) | ✓ (legacy fields only) | Same endpoint, divergent field usage |
| Referral | referral.routes.js | ✓ | ✓ | Full parity (pandit-side) |
| Notifications | notification.routes.js | ✓ | ✓ | Full parity |
| Communication (admin WA templates) | comm.routes.js | ✓ | ✗ | Admin-only tooling, out of role scope |
| **Public Settings** | settings.routes.js | ✓ | **✗** | **Missing — branding/contact info not fetched on mobile** |
| Blogs | blog.routes.js | ✓ | ✓ | Full parity, including pandit authoring |
| Invoices | invoice.routes.js | ~ (partial usage) | **✗ (bypassed)** | Mobile uses booking/order-scoped invoice paths instead — architecturally inconsistent |
| **Legal Documents (public)** | legalDocument.routes.js | ✓ | **✗** | Duplicate of above — confirmed critical gap |

**Additional findings:**
- `GET /api/invoices/my` is called by **neither** platform — dead endpoint, candidate for removal or for building a proper "My Invoices" list.
- No backend route file was found to be completely unused by both platforms — every gap identified is mobile-side, not orphaned backend code.
- No endpoint was found to be mobile-only/web-absent — web's route coverage is a strict superset of mobile's across every domain checked.

---

## Navigation Differences

- **Web nav → no mobile destination:** "Family Members" and "Kundli" (both in `Navbar.jsx:53-60` profile menu) have zero mobile screen or route.
- **Web nav → no mobile destination:** Forgot Password link (`Login.jsx:136-138`) has no mobile screen behind it.
- **Web nav → no mobile destination:** Blog authoring ("Write a Blog" / "My Blogs") for devotees has no mobile screen.
- **Web nav → no mobile destination:** Legal documents (Terms/Privacy, in `Footer.jsx`) have no mobile screen.
- **Mobile-only destinations with no direct web equivalent (mobile ahead):** Address Book screen, dedicated pandit notification center, pandit referral QR/detail screen.
- **Pandit onboarding is not sequence-guided on mobile.** The 8 pandit profile-completion screens are all reachable individually from `PanditProfileScreen.jsx`'s menu, but nothing chains them into a mandatory onboarding wizard the way web's single `PanditRegistration.jsx` form does — a new pandit can land in the full dashboard having filled in nothing beyond name/email/phone.
- **No approval-status route guard on mobile.** `RootNavigator.jsx:59-65` sends any `role==='pandit'` straight to `PanditNavigator` with no branch for pending/rejected/suspended states, unlike web's partial `ApplicationGate`.
- **Admin module structure differs sharply** (20+ granular `Admin*Screen.jsx` files on mobile vs. one large tabbed `AdminDashboard.jsx` on web) — out of this audit's Devotee/Pandit scope, noted for completeness only.

---

## UI Differences

- **Dashboard:** web's `UserDashboard.jsx` uses skeleton loading placeholders and explicit empty-state CTAs ("No bookings yet", etc.); mobile's `DashboardScreen.jsx` uses a full-screen spinner and simply omits empty sections with no messaging.
- **Panchang:** web renders every Tithi/Yoga/Karana entry with start/end time ranges plus a separate Auspicious/Inauspicious Timings list (Abhijit Muhurat, Brahma Muhurta, Rahu Kaal); mobile shows only the single legacy value per field and has no Auspicious Timings section at all.
- **Pooja detail:** web has a 6-tab detail view (Overview/Samagri/Vidhi/Benefits/FAQs/Reviews) with Similar Poojas and Upcoming Festivals sidebars; mobile's booking-flow Overview step is one static card.
- **Marketplace:** web has DB-driven sectioned "Blinkit-style" category rows on the default view; mobile always renders a flat 2-column grid.
- **Cart/Checkout:** web unifies poojas + products in one cart and one checkout; mobile splits them into unrelated flows with no cross-cart capability.
- **Payment result screens:** web shows itemized summaries with order/booking numbers and amounts plus a manual retry (max 3 attempts); mobile's generic result screen shows neither and offers no retry action on failure, only "Go to Bookings."
- **Blog content:** web renders rich HTML via a `RichTextEditor`; mobile renders blog body as plain `<Text>`, losing all formatting.
- **Livestream viewing:** web embeds a YouTube iframe in-app with a thumbnail switcher; mobile hands off to an external browser/app via `Linking.openURL`.
- **Availability:** web includes a color-coded month-grid `MiniCalendar`; mobile is list/modal-based only, no calendar visualization.
- **Settings:** web's theme control actually lives in the Navbar (`ThemeSwitcher.jsx`) while Settings.jsx stubs it as "Future"; mobile makes theme a first-class Settings section — an inconsistency worth resolving on the web side too, and a design decision to make consistent going forward.

---

## Validation Differences

- **Change password:** identical rules on both platforms (current/new/confirm, 6-char minimum, per-field show/hide) — full parity, no differences found.
- **Delete account:** identical 5-step flow and password/OTP requirements, but the OTP-verify request body differs — web sends `{identifier: otpId}` (email or phone depending on chosen channel), mobile always sends `{phone: user?.phone}` regardless of channel chosen (`DeleteAccountScreen.jsx:61`). Needs a backend check to confirm whether email-channel OTP verification actually works on mobile.
- **Specializations (pandit):** web enforces an age-vs-years-of-experience sanity check (`PanditMyProfile.jsx:516-522`); mobile's `PanditSpecializationsScreen.jsx` has no equivalent client-side guard (server-side validation status unconfirmed).
- **Booking cancellation:** web's cancellable-status whitelist (`USER_CANCELLABLE`) and mobile's (`CANCELLABLE_STATUSES`) differ by one value — mobile additionally allows cancellation from `completion_requested`, which web's list excludes. Confirm intended behavior.
- **Rating submission:** web posts `{rating, review}`; mobile posts `{rating, comment}` to the same `POST /bookings/:id/rate` endpoint — a payload-shape mismatch that should be verified against the controller's expected field name (see Bugs Found).
- **Registration password rules:** not confirmed to differ, but SetPasswordScreen's downstream session bug (see Bugs Found) means even correctly-entered passwords may not result in a correctly-authenticated session on mobile.

---

## Security Differences

- **No server-side session invalidation on mobile logout.** Web's `logout()` calls `POST /auth/logout` before clearing local storage (`AuthContext.jsx:21-23`); mobile's `authStore.js:49-53` only deletes local SecureStore entries — the server-side session/token (if any) is never explicitly invalidated. Confirm with backend whether tokens are stateless (JWT, low risk) or session-tracked (higher risk if so).
- **No account-status enforcement on mobile for pandits.** A pandit marked `rejected` or `suspended` by an admin retains full mobile dashboard/booking access — this is a real access-control gap, not merely missing UX, since the mobile app never reads the `pandit.status` field at all.
- **Mobile pandit registration bypasses the vetting gate that exists on web.** Because `/auth/complete-registration` auto-sets `status: 'approved'` for the mobile onboarding path, pandits created via mobile skip the admin-review queue that web-registered pandits go through. This is a structural trust-model weakening introduced by the mobile flow, not just a feature gap — worth a security/product decision, not only an engineering fix.
- **Storage mechanism:** mobile uses `expo-secure-store` (hardware-backed on supported devices) vs. web's `localStorage` — mobile is arguably ahead here.
- No other security-relevant divergences were found in the areas audited (password/OTP handling, KYC document upload, payment verification) — these appear consistent in intent, modulo the endpoint-mismatch bug noted under Bugs Found.

---

## Edge Cases Missing

- **Expired/forgotten password:** entirely unhandled on mobile (no recovery flow exists — see Critical gaps).
- **Rejected/suspended pandit session:** mobile shows the normal dashboard with no warning or restriction (see Security Differences).
- **Failed payment retry:** mobile's payment-result screen offers no explicit retry action on failure (web allows up to 3 manual retries); a devotee with a failed transaction must navigate away and re-attempt from scratch.
- **Partial-payment remaining balance:** since mobile hardcodes `paymentMode: 'FULL'`, the "pending payment" edge case that partial-payment bookings create on web (pay-remaining-later) may not be reachable via mobile-originated bookings at all — worth confirming whether mobile can even view/pay a remaining balance created on web (BookingDetailScreen does show a payment card, but the *originating* flow can't create this state).
- **Empty states:** mobile dashboard silently omits sections with no bookings/orders/festivals rather than showing an explicit "nothing here yet" message that web provides — a devotee with no history sees a sparser-than-intended screen rather than a clear empty state.
- **New pandit with zero profile data:** because mobile registration doesn't force KYC/profile completion, a pandit can reach the dashboard, browse bookings, and potentially attempt actions while `canReceiveBookings: false` — verify the UI correctly explains *why* actions are blocked in this state (only a soft KYC banner was confirmed; unclear if every gated action has a clear inline explanation).
- **OTP-channel mismatch during delete-account:** if a user selects the email OTP channel on mobile, the verification call still sends their phone number — a potential silent failure edge case for a subset of users (see Validation Differences).
- **Session expiry mid-flow:** not specifically audited by any sub-agent — flagged as an open item for a follow-up pass (interceptor-driven auto-logout was confirmed on web via `AuthContext.jsx:30-34`; mobile's equivalent 401-handling behavior was not explicitly verified in this audit and should be checked before release).
- **Network failure handling:** not explicitly audited in this pass at the granularity of "what happens on airplane mode mid-checkout" — flagged as an open item, particularly important given mobile's weaker payment-failure UX noted above.

---

## Bugs Found

1. **Likely broken post-registration session.** `mobile-app/src/screens/auth/SetPasswordScreen.jsx:44` calls `login(data.token, data.user)`, but `authStore.login`'s actual signature is `login(emailOrPhone, password)` (`mobile-app/src/store/authStore.js:25`) — the correct call is `setSession(token, user)` (`authStore.js:43-47`), which this screen never imports. A brand-new user completing registration on mobile may not end up in a correctly-authenticated state. **Needs verification and likely a one-line fix.**
2. **Rating submission payload mismatch.** Mobile sends `{rating, comment}` (`BookingDetailScreen.jsx:266-305`); web sends `{rating, review}` (`MyBookings.jsx:89-149`) — both to `POST /bookings/:id/rate`. If the backend controller only reads one field name, review text submitted from one platform may be silently dropped.
3. **Possible wrong payment-verification endpoint for remaining balances.** `mobile-app/src/screens/user/PaymentVerifyScreen.jsx:30` calls `/bookings/verify-phonepe/:id` for `type === 'booking-remaining'` instead of the dedicated `/bookings/verify-remaining/:id` that web uses for the same case (`PaymentCallback.jsx`). Could cause partial-payment completions to be verified against the wrong logic path.
4. **Delete-account OTP verification always keys off phone.** `DeleteAccountScreen.jsx:61` sends `{phone: user?.phone, otp, purpose}` regardless of whether the user chose the email OTP channel; web sends `{identifier: otpId}` where `otpId` matches the chosen channel (`Profile.jsx:42-55`).
5. **Cancellable-status list mismatch.** Mobile's `CANCELLABLE_STATUSES` includes `completion_requested`; web's `USER_CANCELLABLE` does not — a devotee may be able to cancel from a state on mobile that web considers non-cancellable, or vice versa depending on which list is "correct."
6. **Invoice retrieval uses a different backend path than the dedicated invoice route file.** Mobile's `InvoiceScreen.jsx` calls `/bookings/:id/invoice` and `/marketplace/orders/:id/invoice` directly; web's `InvoicePage.jsx` uses `invoice.routes.js` (`/api/invoices/number/:x`, `/api/invoices/booking/:x`). Not necessarily broken (both may work), but it's an architectural inconsistency that should be consolidated to avoid future drift.
7. **Remember-me checkbox is non-functional on mobile.** `LoginScreen.jsx`'s `remember` state is captured in the UI but never passed into `authStore.login()` — SecureStore always persists the session either way, making the checkbox misleading (though arguably harmless).

---

## Recommended Implementation Order

### Phase 1 — Critical (release-blocking)

1. Build Forgot/Reset Password flow on mobile (port web's 4-step `ForgotPassword.jsx` pattern; backend endpoints already exist).
2. Integrate Legal Documents (Terms of Service, Privacy Policy) into the mobile app — required for compliance/app-store review, backend and web reference both already exist.
3. Fix the likely broken post-registration session call (`SetPasswordScreen.jsx:44` — `login()` → `setSession()`).
4. Add pandit account-status gating to `RootNavigator.jsx` / `PanditNavigator.jsx` (block rejected/suspended pandits from the dashboard; show a status/waiting screen for pending).
5. Verify and fix the remaining-payment verification endpoint mismatch in `PaymentVerifyScreen.jsx`.

### Phase 2 — High

6. Add mixed pooja+product cart and unified checkout on mobile (or explicitly scope-decide this is web-only for now).
7. Restore partial-payment option and referral-token capture in mobile's booking Review step.
8. Add "Family Members" and "Kundli" screens (or confirm with product whether these are being deprecated platform-wide, in which case remove them from web's nav too).
9. Add devotee blog authoring (editor + "My Blogs") to mobile.
10. Update mobile Panchang screen to consume the new multi-entry Tithi/Yoga/Karana fields and Auspicious Timings section, matching web's post-migration data model.
11. Add a language switcher to mobile Settings.
12. Sync mobile theme preference to `/users/preferences` instead of AsyncStorage-only.

### Phase 3 — Medium

13. Add pandit "Request New Pooja" custom submission capability to mobile.
14. Strengthen mobile pandit registration to collect KYC/profile data upfront (or build a guided post-signup onboarding wizard chaining the 8 existing screens).
15. Add pooja category browsing, sort, and a pre-booking reviews tab to mobile.
16. Add temple directory filters (state/deity/type), photo gallery, and livestream cross-link.
17. Bring livestreams in-app (embedded player) instead of external hand-off; broaden the query beyond `status=live`.
18. Add AI Assistant guided-recommendation flow and cross-navigation conversation persistence.
19. Fix the rating-submission payload key mismatch (`comment` vs `review`) — confirm correct field with backend and align both platforms.
20. Fix delete-account OTP verification to respect the chosen channel (email vs phone).
21. Integrate Hero Banners and Public Settings/branding fetch into the mobile home screen.
22. Add dashboard stats row and Daily Panchang widget to mobile `DashboardScreen.jsx`.
23. Consolidate invoice retrieval onto a single backend path across both platforms.

### Phase 4 — Low

24. Reconcile the cancellable-booking status list between platforms.
25. Add sectioned marketplace browsing and inline variant selection to mobile.
26. Add rich-text rendering for blog content on mobile.
27. Add a visual mini-calendar to `PanditAvailabilityScreen.jsx`.
28. Wire mobile logout to call server-side `/auth/logout`.
29. Make the remember-me checkbox functionally meaningful (or remove it) on mobile login.
30. Add explicit empty-state messaging to mobile dashboard sections.
31. Backport pandit earnings trend charts, dedicated notification center, and referral QR/share to web (mobile is currently ahead — closing this the other direction improves overall product consistency).
