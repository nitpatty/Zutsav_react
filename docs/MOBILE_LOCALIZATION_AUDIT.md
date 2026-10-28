# Mobile localization audit — F-08 (Day 16)

Date: 2026-10-27 · Branch `main` · HEAD `e77ef97` (plus uncommitted Days 1–15 work)
Method: **static source inspection only.** No source, test, package, environment, native or existing documentation file was changed; no test or
backend process was started; no endpoint was called; no `.env` value, secret or personal data was read. Counts marked *heuristic* come from a
read-only regex scan (script kept outside the repo) and are **lower bounds**. Anything needing a device or a running backend is marked **Not verified**.
Prior test counts (59 suites / 1,204 tests after Day 15) are historical and were **not re-run**.

## 1. Executive summary

1. **The website has a real, working localization system with 11 languages**: `en, hi, mr, gu, ta, te, kn, ml, bn, pa, or`
   (`frontend/src/i18n/index.js`, `frontend/src/pages/Settings.jsx:11-23`, `backend/src/config/languages.config.js`). It is i18next/react-i18next for UI text plus a
   **separate** backend AI-translation cache for content (`?lang=` on GET requests). The website's own coverage is **partial** — 23 of 41 page files
   use `useTranslation`; the booking flow, cart, payment callback, invoices, product detail, livestreams and all Pandit pages/components do not.
2. **The backend supports translated content, selected only by the `?lang=<code>` query parameter** (no `Accept-Language` handling anywhere) on 11 content entity
   types (pooja, pooja category, product, kit, temple, festival, blog, livestream, hero banner, notification, notification mapping), falling back to English fields. A per-user
   `preferredLanguage` is stored (`PATCH /api/auth/preferred-language`, also accepted at registration). **API error/validation messages are English literals**
   (≈679 `message:` literals in controllers; only ~13 machine-readable `code`s, all checkout/booking related).
3. **The mobile app has a small custom i18n layer (`mobile-app/src/i18n/index.js`) that is English-only and used by exactly 2 of 191 source files**
   (`WalletScreen`, `MyReferralsScreen`; 46 keys). It has persistence plumbing (SecureStore `zutsav_language`, preserved across logout) but **no language picker, no `lang`
   parameter on API calls, no `preferredLanguage` read/write, no non-English dictionary, no device-locale detection**.
4. **Everything else is hardcoded English**: ≈1,100 literal UI strings found by the heuristic scan (user ≈427, Pandit ≈298, auth ≈63, shared components ≈67, admin ≈207, utils/hooks ≈46) — a lower
   bound; tab titles, alerts, toasts, placeholders and the 79 call sites that show raw backend `message` text are all English.
5. **Recommendation:** reuse and harden the existing custom layer (no new dependency is required), add a language setting + `lang` GET parameter first (which localizes server
   content with no screen rewrite), then localize UI by workflow in small batches. **Blockers that are owner/backend decisions, not mobile work:** where translations come from
   (the website has none for wallet/referrals in the 10 non-English locales), how API errors get localized, validation of `lang` on the backend, and whether invoices/admin screens are in scope.

## 2. Website locale inventory (reference)

| Topic | Finding (source) | Status |
|---|---|---|
| Library | `i18next ^23.16.8`, `react-i18next ^14.1.3` (`frontend/package.json:17,24`); init in `frontend/src/i18n/index.js` | Verified |
| Locales | 11 registered: en, hi, mr, gu, bn, ml, pa, ta, te, kn, or (`i18n/index.js`; picker list `pages/Settings.jsx:11-23` with native names) | Verified |
| Default / fallback | `lng: 'en'`, `fallbackLng: 'en'`, `escapeValue:false` (`i18n/index.js:28-40`); `<html lang="en">` is static (`public/index.html:2`) | Verified |
| Selection UI | One searchable dropdown in **Settings** only (`Settings.jsx` `LanguageDropdown`, `setLang` line 81); no other switcher found | Verified |
| Persistence | `localStorage['zutsav_preferred_language']` (`utils/languageStorage.js`); survives refresh and logout (guest fallback, `context/LanguageContext.jsx:95-98`) | Verified |
| Logged-in sync | `PATCH /auth/preferred-language` on manual switch; **DB value wins at login** (`LanguageContext.jsx:43-111`); guest language migrated into a new account at registration (`pages/Register.jsx:596-600`) | Verified |
| API integration | Axios interceptor adds `params.lang` to **GET requests only** when lang ≠ `en` (`api/axios.js:20-33`); switching invalidates the React Query cache (`LanguageContext.jsx:64`) | Verified |
| Routes | No locale-prefixed routes found | Not verified exhaustively |
| Dictionaries | `i18n/locales/*.json`, 22 top-level namespaces (nav, common, sidebar, auth, referrals, wallet, footer, notificationsPage, settings, dashboard, home, poojas, marketplace, temples, festivals, blog, blogDetail, ai, panchang, bookings, orders, profile). **en = 1,018 keys; each of the 10 others = 952 (93.5 %)**; the 66 missing in every one are `nav` 2, `sidebar` 6, `auth` 14, **`referrals` 24, `wallet` 20** → English fallback. No extra keys. (`hi` has only 4 of 952 values identical to English; translation quality **Not verified**.) | Verified (key counts) |
| Missing-key handling | Only i18next's `fallbackLng`; no `missingKeyHandler`/`saveMissing`/CI parity check found | Verified |
| Page coverage | 23 of 41 non-test page files call `useTranslation`; **not translated:** BookingFlow, BookingSuccess, CartPage, PaymentCallback, InvoicePage, PublicInvoicePage, ProductDetail, LivestreamsPage, FamilyMembers, ReferralLanding, PanditDashboard, PanditMyPoojas, PanditMyProfile, PanditRegistration, PanditStatus, BlogEditor, MyBlogsPage, AdminDashboard. Components: translated only in `home` (17), `layout` (4), `admin` (1) — **none in booking, pandit, invoice, shared** | Verified |
| Formatting | 214 `toLocale*String`/`Intl` calls, each with a **fixed string locale** (sampled values `en-IN`), never the active language | Verified (pattern); literal values sampled |
| Plurals | No plural keys/`count` interpolation found in `en.json` | Verified |
| RTL | None of the 11 locales is right-to-left; no `dir` handling exists or is needed | Verified |
| UI vs content | Deliberately separate: hand-authored committed dictionaries vs the backend AI cache (`i18n/index.js` comment; `hooks/useTranslatedBlog.js`) | Verified |
| Errors | Login etc. show `err.response.data.message \|\| t('auth.loginFailed')` (e.g. `pages/Login.jsx:113`) — server text is shown as-is, English | Verified |

## 3. Backend localization and content contracts

**Language catalogue:** `backend/src/config/languages.config.js` (same 11 codes with native names; `isSupportedLanguage()` case-insensitive).

**Selection mechanism:** **`?lang=<code>` query parameter only.** `Accept-Language` is not read anywhere (the only occurrence is an outgoing header in `utils/drikpanchang.js:68`).
`lang` is lower-cased and compared with `'en'`; **the content controllers do not validate it against the supported list** (`isSupportedLanguage` is used only in `auth.controller.js:194, 380, 523`).
Any other value reaches `translationService`. What the AI provider does with an unsupported code was **Not verified** (a Translation row is keyed by the arbitrary lower-cased value).

| Endpoint (controller:line) | Behaviour | Response additions |
|---|---|---|
| `GET /poojas` (`pooja.controller.js:368-392`), `/poojas/:id` (`:412-419`), pooja categories (`:77-80`) | translated fields merged over English | `translationLanguage` |
| `GET /marketplace/products`, `/products/:id` (`marketplace.controller.js:81-84, 105-112`) | name, description, tags | `translationLanguage` |
| `GET /marketplace/kits…` (`kit.controller.js:73, 89-96, 121-131`) | kit fields | `translationLanguage` |
| `GET /temples`, `/temples/:id` (`temple.controller.js:7-11, 54-68, 152-159`) | temple fields | `translationLanguage` |
| `GET /festivals` (`festival.controller.js:90-93`), `GET /livestreams` (`livestream.controller.js:17-20`), hero banners (`heroBanner.controller.js:11-14`) | fields | `translationLanguage` |
| `GET /blogs`, `/blogs/:slug` (`blog.controller.js:89-92, 140-188`) | blog + related | `translationLanguage` |
| `GET /notifications` (`notification.controller.js:17-20`) | translated notification text | `translationLanguage` |
| `PATCH /auth/preferred-language` (`auth.controller.js:517-533`, route `auth.routes.js:18`, auth required) | body `{preferredLanguage}`; unsupported → 400 `'Unsupported language'` | `{ success, preferredLanguage }` |
| `POST /auth/complete-registration` and legacy register (`auth.controller.js:143, 194, 360, 380`) | optional `preferredLanguage`, applied only if supported | stored on `User.preferredLanguage` (`models/User.js:49`, default `'en'`) |

- **Engine:** `services/translationService.js` — English is the source; cache hit → return; miss → single-flight lock, provider call (Sarvam primary, Groq fallback, `services/translationProviders`), cache; on any failure → **English fields with no error** (`:173-208`, batch `:226-275`). Registered entities and fields: `config/translatable.config.js` (pooja name/shortDesc/description/vidhi/…/faqs; product name/description/tags — **never** price/stock/sku/taxRate/variants).
- **Runtime characteristics (Not verified):** a cache miss generates synchronously inside the list/detail request (bounded by the provider and an ≈5.6 s wait for concurrent generation), so the first non-English request for new content may be slow; mobile's 30 s timeout (`api/axios.js`) is the only guard.
- **Not translated by the backend:** booking/order/invoice/payment/wallet data, legal documents (`legalDocument.controller.js` has no language handling), panchang provider content (fetched in English), AI assistant (`ai.controller.js` has no language parameter found), **API error and validation messages** (≈679 `message:` literals; machine-readable `code` values exist only for checkout/booking: `ORDER_*`, `CHECKOUT_*`, `IDEMPOTENCY_KEY_REUSED`, `BOOKING_*`, `PAYMENT_NEEDS_REVIEW`, `OTP_REQUIRED`).
- **User preference:** returned inside the user object (`getMe` returns `req.user`; website `LanguageContext` relies on `user.preferredLanguage`). Whether mobile's stored `zutsav_user` receives it was **Not verified** at runtime.
- **Campaigns/WhatsApp:** `preferredLanguage` is used as an audience attribute (`campaignAudienceService.js:84-101`); push-notification text localization **Not found**.

## 4. Mobile localization infrastructure and hardcoded-text assessment

| Item | Finding (source) |
|---|---|
| Packages | No i18n library and no `expo-localization` in `mobile-app/package.json`; `date-fns ^3.6.0` is used for dates (`utils/helpers.js:1-18`). Fonts: no custom font assets or `useFonts`/`fontFamily` found (system fonts — Indic glyph rendering is device-dependent, **Not verified**). `app.json` has no locale/`CFBundleLocalizations` keys. |
| Custom layer | `src/i18n/index.js`: `LOCALES = { en }` (`:21`); Zustand `useLanguageStore` with `hydrate`/`setLanguage` persisted in SecureStore key `zutsav_language` (`:24-47`); `I18nProvider` (`:74-97`) memoises `t` per language; `useTranslation()` falls back to an English `t` **with a new function identity every render** when no provider is mounted (`:100-113`). `t()` returns the key itself when missing — no dev warning; `interpolate` builds a `RegExp` from the param name and uses `String.replace` (a value containing `$&` would be interpreted); no plural support. |
| Dictionaries | `src/i18n/locales/en.js` only: namespaces `referrals`, `wallet`, `common` (46 keys). The website's `wallet`/`referrals` namespaces exist only in `en.json` (10 other locales fall back), so **there is no translated wallet/referral text to reuse**. Header comment says other locales are added by creating `hi.js` etc. and registering in `LOCALES`. |
| Startup | `App.jsx:100-114`: `useLanguageStore.getState().hydrate()` is fire-and-forget; `I18nProvider` mounts immediately (a language flash is possible once non-English exists); the store's `ready` flag is unused. A stored code is validated only against `LOCALES` (stale values for removed locales are ignored — good). |
| Logout / session | `utils/sessionCleanup.js:25-26` documents `zutsav_language` as **preserved** on logout (device-level, like the website's guest fallback). No `preferredLanguage` anywhere in `mobile-app/src` (verified by search) — registration does not send it, login/`getMe` result is not applied, the setting is never written to the backend. |
| UI to change language | **None** — `SettingsScreen` and Profile contain no language control. |
| API client | `src/api/axios.js` adds no `lang` parameter and no `Accept-Language`; every content GET returns English. Mobile filters by **slug/id, not display names** (e.g. Marketplace `category: c.slug`, `MarketplaceScreen.jsx:71,210`), so translated names would not break filters. Search `params.search` is a typed string (server search language behaviour **Not verified**). |
| Offline cache | `utils/offlineCache.js` (`zutsav_cache_*`, not language-keyed) is used by `PanditDashboardScreen`, `PanditAvailabilityScreen`, `PanditProfileScreen` (the dashboard caches festival data that `?lang=` would translate) → stale-language risk after a switch; cleared on logout by `sessionCleanup`. |
| Navigation | Tab titles hardcoded: User `UserNavigator.jsx:168,178,188,198` (Home/Bookings/Shop/Profile); Pandit `PanditNavigator.jsx:163,168,173,179` (Dashboard/Bookings/Referrals/Profile); Admin drawer labels `AdminDrawerContent.jsx:11-22`. |
| Formatting | `formatCurrency` is `Intl.NumberFormat('en-IN', INR)` (`utils/helpers.js:28-29`); dates use `date-fns` `format` with patterns like `'dd MMM yyyy'` and **no locale object** (English month names); `formatSlotTime` is 24 h; `formatStatus` turns API status constants into English labels (`helpers.js:34-35`). About 12 files call `toLocale*`/`Intl`. |
| Raw backend errors | 79 call sites read `response?.data?.message` and show it to the user. |
| Tests | Two wallet tests render inside `I18nProvider` (Day 14). No test for language switching, persistence, missing keys, or locale parity. Most screen tests assert literal English strings, so **the default must stay `en` in tests**. Existing tests do not reset `zutsav_language` in the SecureStore mock. |

**Hardcoded-text census (heuristic, lower bound; excludes `__tests__`; counts single-line JSX text, `Toast text1/2`, `Alert.alert` titles, `placeholder`, accessibility labels, `title/label/subtitle/text` props — template literals and multi-line JSX are under-counted):**

| Area | Files | Strings | of which Toast / Alert / placeholder |
|---|---|---|---|
| `screens/user` | 34 | 427 | 76 / 9 / 23 |
| `screens/pandit` | 22 | 298 | 68 / 5 / 32 |
| `screens/auth` | 9 | 63 | 14 / 1 / 10 |
| `screens/admin` | 21 | 207 | 38 / 12 / 19 |
| `components` | 50 | 67 | 8 / 1 / 12 |
| `utils`, `hooks`, `navigation`, `services` | 41 | 50 | — |
| **Total** | **191** | **≈1,112** | |

Largest files: `BookingFlowScreen` 57, `BookingDetailScreen` 53, `InvoiceScreen` 47, `PanditBookingDetailScreen` 41, `utils/bookingInvoiceHtml.js` 32, `PanditAvailabilityScreen` 28, `PanditReferralDetailScreen` 28, `PanditKYCScreen` 27, `OrderDetailScreen` 26, `PanchangScreen` 25.
Already keyed: only the `WalletScreen` and `MyReferralsScreen` (a few literals remain: e.g. the wallet "Coin Redemption" card title and rate/threshold lines in `WalletScreen.jsx`; `MyReferralsScreen` 1).

## 5. Screen and feature coverage matrix

Infra = translation infrastructure usable by the screen; Text = hardcoded/keyed; API = server content localized if `lang` were sent; States = loading/error/empty covered. Strings = heuristic count. "Not verified" = not opened for this audit.

| Area (files) | Infra | Visible text | API content localizable | States covered | Tests | Strings | Gap severity / effort |
|---|---|---|---|---|---|---|---|
| Auth & registration (`screens/auth/*`, `components/auth/*`) | no | hardcoded | n/a (no content); must send `preferredLanguage` at registration | no | some (existing, English) | ≈70 | High (first screen) / M |
| User home & navigation (`DashboardScreen`, `UserNavigator`) | no | hardcoded | yes: poojas, festivals via `?lang` (not sent) | no | partial | 11 + tabs | High / M |
| Pooja discovery & booking (`PoojaListScreen`, `BookingFlowScreen`) | no | hardcoded (57) | pooja, kit content yes; **API data values** (`language`, status, ids) must stay English | no | coin/charge tests | 61 | High / L |
| Booking details & payment verify (`BookingDetailScreen`, `PaymentVerifyScreen`, `usePaymentRecovery`) | no | hardcoded (53, 12, 6) | no (booking data not translated; status labels via `formatStatus`) | partial | yes | 71 | High / L (payment copy needs care) |
| Marketplace, cart, orders (`MarketplaceScreen`, `ProductDetailScreen`, `CartScreen`, `OrdersScreen`, `OrderDetailScreen`) | no | hardcoded | product/kit yes | no | yes | ≈57 | High / L |
| Coupon/coin labels already present (`BookingFlowScreen` coins, Day 14 discount rows) | no | hardcoded English | n/a | — | yes | ≈15 | Medium / S |
| Wallet & referrals (`WalletScreen`, `MyReferralsScreen`) | **yes** | keyed (a few literals) | n/a | yes (wallet) | yes (wallet) | 2 left | Low / S, **but no translations exist** |
| Profile, settings, addresses (`ProfileScreen`, `SettingsScreen`, `PersonalInfoScreen`, `AddressBookScreen`, `components/shared/Address*`) | no | hardcoded | n/a | no | partial | ≈75 | High (language picker lives here) / M |
| Pandit onboarding & approval (`PanditKYCScreen`, `PanditStatusScreen`, `PanditBankUPIScreen`, `PanditEducationScreen`, `PanditFamilyInfoScreen`, `PanditPersonalInfoScreen`) | no | hardcoded | n/a | no | few | ≈95 | High / L |
| Pandit profile, services, availability (`PanditProfileScreen`, `PanditPoojaServicesScreen`, `PanditSpecializationsScreen`, `PanditAvailabilityScreen`, `PanditAddressScreen`) | no | hardcoded | pooja names yes; `languages` are data values | no | few | ≈60 | Medium / M |
| Pandit bookings & actions (`PanditBookingsScreen`, `PanditBookingDetailScreen`, `PanditEarningsScreen`, `PanditDashboardScreen`) | no | hardcoded (41, 7, 11, 12) | festival data yes | no | few | ≈71 | High / L |
| Pandit referrals & blogs (`PanditReferral*`, `PanditBlogEditorScreen`, `PanditMyBlogsScreen`) | no | hardcoded | blogs yes | no | few | ≈68 | Medium / L |
| Livestream & temples (`LivestreamsScreen`, `Temple*`, `FestivalsScreen`, `PanchangScreen`) | no | hardcoded | yes (temples, festivals, livestreams); panchang provider content English | partial | yes | ≈50 | Medium / M |
| Legal documents & footer (`LegalResourcesScreen`, `LegalDocumentScreen`) | no | hardcoded UI | **no** (legal content not translated by backend) | partial | yes | 22 | Medium / S–M (content = owner/legal decision) |
| Notifications & preferences (`NotificationsScreen`, `notificationStore`, push) | no | hardcoded | **yes** (`GET /notifications?lang`); push text **Not found** | partial | few | 5 + store | Medium / S |
| Location picker & errors (`AddressPicker`, `AddressFormSheet`, `LocationSearch`, `MapPicker`, `PincodeInput`, `geocodingService`) | no | hardcoded (20, 13, 4, 9) | n/a (provider results are what Ola returns) | partial | yes | ≈47 | Medium / M |
| Invoices (`InvoiceScreen`, `utils/bookingInvoiceHtml.js`, `bookingInvoice.js`) | no | hardcoded (47+32) | no (official invoice) | — | yes | 79 | **Owner decision** — official invoice parity suggests keeping English / M |
| Global shared components, alerts, validation (`components/*`, `utils/*`, `hooks/*`, 79 raw-backend-message sites) | no | hardcoded | server errors English | — | partial | ≈110 | High / L |
| Admin screens (`screens/admin/*`, 21 files) | no | hardcoded | n/a | no | few | ≈207 | **Owner decision** (website admin is also not localized) |
| Other user screens (`AIAssistantScreen`, `BlogsScreen`, `BlogDetailScreen`, `FamilyMember*`, `ChangePasswordScreen`, `DeleteAccountScreen`, `FestivalDetailScreen`) | no | hardcoded | blogs yes | no | few | ≈70 | Medium / M |
| Any screen not listed | — | — | — | — | — | — | **Not verified** |

## 6. Formatting and locale-consistency findings

| Topic | Website | Mobile | Finding |
|---|---|---|---|
| Language codes | 11 two-letter codes, identical to backend | `LOCALES` keys; only `en` | Use the website/backend codes verbatim; never send region tags (`hi-IN`) to the backend (it would not match `languages.config.js` and the content controllers do not validate). |
| Currency | fixed `en-IN` (INR) | fixed `en-IN` | Consistent today; keep unless the owner wants native digits. Hermes/`Intl` behaviour for non-`en-IN` locales is **Not verified** on device. |
| Dates/times | fixed `en-IN`; `<html lang>` static | `date-fns` English patterns, 24 h slots | Month names stay English in every language unless a `date-fns` locale is wired; whether date-fns 3.6 ships an object for each of the 11 codes was **not checked**. |
| Numbers / plurals | no plural keys | custom interpolation, no plurals | Neither side uses plural forms; word order differs by language, so keep messages with a few full-sentence keys rather than string concatenation (several mobile messages concatenate: e.g. `Pay the remaining ${…}?`). |
| Server content vs UI | separate systems | separate (by design) | Do not pass the UI language into UI strings as if the two were one system; `translationLanguage` in a response shows which language the server returned. |
| Validation / errors | raw server message shown | raw server message shown (79 sites) | Mixed-language screens are inevitable until the backend returns codes; client-originated fallbacks should be keyed. |
| Display vs data | `Register.jsx` language chips (English names) | Pandit/Booking `languages` values ('Hindi', 'Sanskrit', …) | These are **data values sent to the API**, not UI text — translate labels only, never values. Same for `status`, `paymentMode`, `ZUT_*` ids. |
| Stored preference | DB wins at login | local only | A stale or unsupported stored code must fall back to `en`; `hydrate()` already rejects codes not in `LOCALES`. |
| RTL | not relevant (none of the 11 locales is RTL) | not relevant | **Do not enable RTL.** |

Likely failure points: language flash at startup (`ready` unused); mixed-language screens (server errors, `formatStatus`, un-keyed strings); long scripts overflowing fixed UI (tab labels at `fontSize: 10` in a fixed-height bar, buttons, Alert buttons) — the website's Malayalam dictionary is ≈1.8× the English file size (89 KB vs 49 KB; a rough proxy only); stale offline cache after a language switch; `WalletScreen`-style hooks that list `t` as a dependency re-running if `t` identity changes (Day 14 finding); unsupported `lang` values hitting the AI translation pipeline.

## 7. Confirmed gaps versus unverified assumptions

**Confirmed (source):** no mobile language picker; no `lang` GET parameter; `preferredLanguage` never read/written/sent by mobile; only English dictionary (46 keys, 2 screens use it); ≈1,100+ hardcoded strings; tab titles/alerts/toasts hardcoded; raw English backend errors at 79 call sites; no locale-aware dates; website translations missing for `wallet`/`referrals` in all 10 non-English locales and for booking/cart/payment/Pandit pages; backend content controllers do not validate `lang`; backend has no `Accept-Language` and no error codes except ~13 checkout/booking ones; offline cache not language-keyed.

**Not verified (needs runtime / device / owner):** quality and completeness of the non-English translations; AI-translation latency and cost on cache misses; behaviour with an unsupported `lang`; whether `preferredLanguage` arrives in mobile's `zutsav_user`; Indic font rendering and text expansion on devices; Hermes `Intl` for non-`en-IN` locales; date-fns locale availability for all 11 codes; server search over translated text; push-notification language; whether the website pages not using `useTranslation` have any other localization mechanism.

## 8. Recommended phased implementation plan

General rules for every phase: default stays `en` (existing tests assert English); translate **labels only** — never API values, statuses, ids, `ZUT_*` prefixes, route params or request bodies; one reviewable batch per PR; run the full mobile suite plus the new parity test each time. No dependency is needed unless the owner chooses i18next (below).

| # | Phase | Likely files / reuse | Dependencies / native | Tests | Risk | Backend change? | Decisions / content | Effort |
|---|---|---|---|---|---|---|---|---|
| 0 | **Decisions before code** | — | — | — | — | — | Which of the 11 languages ship first; who supplies/reviews translations (the website has none for wallet/referrals; Hindi etc. quality unknown); admin screens and invoice language in/out of scope; framework choice (below) | S (decision) |
| 1 | **Framework hardening (reuse existing)** | `src/i18n/index.js`, `locales/en.js`; add `locales/<code>.js`, stable `t` fallback, missing-key dev warning, escaped interpolation, optional `count` handling; typed key namespaces by area | **None** (optional: `i18next/react-i18next` to match the website — adds 2 deps; only if the owner wants shared JSON format; `expo-localization` only if device-locale detection is wanted) | provider fallback; missing key; interpolation with `$`; `t` identity stable without provider; **locale key-parity test** (each locale ⊇ `en`) | Low | No | Whether to share dictionaries with the website (copy/sync script or shared package — monorepo has none) | M |
| 2 | **Persistence, startup and switch UI** | `useLanguageStore` (+ gate on `ready`, validate against supported list), `SettingsScreen` language picker (reuse the 11-entry list shape from website `Settings.jsx:11-23`), `RegisterScreen`/`SetPasswordScreen` send `preferredLanguage` (`complete-registration` already accepts it), `authStore` login/hydrate: apply `user.preferredLanguage` (DB wins, as web) and `PATCH /auth/preferred-language` when authenticated | none | initial/fallback, persisted pref, switch, DB-wins-at-login, logout keeps device language (`sessionCleanup` already preserves it), offline PATCH failure (keep local, toast) | Medium: touches auth store/session paths — must not disturb Day 1–15 session cleanup | No | Precedence when device and DB disagree | M |
| 3 | **API content language** | `api/axios.js` request interceptor: add `params.lang` for GET only when ≠ `en` and only for the 11 codes (mirror `frontend/src/api/axios.js:20-33`); trigger refetch on language change in content screens; language-key or clear `offlineCache` entries (`PanditDashboard`, `PanditAvailability`, `PanditProfile`) | none | interceptor unit test (sends/omits, never sends unsupported/region codes); content-screen refetch; cache not served across languages; **response business values unchanged** | Medium: every GET gains a param; first non-English request may be slow (AI generation) | **Recommended (separate task):** validate `lang` in content controllers; decide cost/latency policy for cache misses | Cost/latency policy; whether notifications/push should follow the language | M |
| 4 | **Shell: navigation, auth, shared components, global errors** | `UserNavigator`/`PanditNavigator` tab titles, `screens/auth/*`, `components/*`, `hooks/usePaymentRecovery.js` toasts; a client-fallback pattern for the 79 raw-backend-message sites (show server message as-is; key the fallback); optional code→key map for the existing checkout/booking `code`s | none | translated tab labels; auth flows English/Hindi; error fallback keyed; alerts | Medium: long strings in the fixed-height tab bar | Optional: error `code`s for non-checkout failures (separate task) | Policy for server-originated English messages | M–L |
| 5 | **User workflows (small batches)** | (a) wallet/referrals/legal/notifications → (b) profile/settings/addresses/location → (c) dashboard/poojas/temples/festivals/livestream → (d) marketplace/cart/orders → (e) booking flow → (f) booking detail, payment verify, recovery banners | none | per-screen: key renders, English unchanged, API payload unchanged (payment tests from Days 12/14/15 must stay green) | High for (d)–(f): must not alter totals, status constants, `ZUT_*` handling, retry/idempotency, coin/coupon/charge logic | No | Payment-related wording reviewed by the owner (financial text); invoice stays English unless decided | L (per batch M) |
| 6 | **Pandit workflows** | onboarding/KYC/status/bank → profile/services/availability → bookings & actions → referrals/blogs/earnings | none | per-screen + approval-state labels (status constants untouched) | Medium: many forms, validation messages | No | Pandit language data (`languages` values) stays English | L |
| 7 | **Formatting** | `utils/helpers.js` (`formatDate`, `formatDateTime`, `timeAgo`, `formatStatus`), date-fns locale objects per code, keep `formatCurrency` `en-IN` | none (date-fns already installed; locale objects ship in it — availability per code **to be checked**) | date/number/INR tests per locale; `formatSlotTime` unchanged | Low–Medium | No | Native digits? month-name language? | M |
| 8 | **Regression/quality tests** | shared test util that wraps `I18nProvider` and resets `zutsav_language`; locale-parity, missing-key, fallback, switch tests; "business values unchanged after switch" tests | none | as listed | Low | No | — | M |
| 9 | **Device verification** | real Android devices, 2–3 non-English locales (Devanagari, Tamil/Malayalam), small screens | none | manual checklist: tab bar, alerts, keyboards/IME, long strings, fonts, deep links, payment return | — | No | Sign-off | M |

Why not "translate everything at once": the heuristic count (≈1,100+) hides template literals and conditional strings; the payment/checkout screens carry the highest regression cost; and the dictionaries do not exist yet.

## 9. Preserve existing mobile behaviour (constraints for every phase)

Session expiry and per-user cleanup (`utils/sessionCleanup.js`; the language key is intentionally device-level); marketplace checkout integrity, retry and idempotency (`utils/checkoutAttempt.js`, `utils/orderRetry.js`); official invoice parity; Android release hardening (F-24); GPS and Ola-backed search; payment recovery and server-authoritative verification (`utils/paymentRecovery.js`, `bookingCharge.js`); Day 14 discount display and wallet tests; Day 15 charge handling. Localized strings must never change API values, status constants, payment identifiers/prefixes, route params or request contracts.

## 10. Tests that localization will need (nothing was run)

Initial locale and fallback; persisted preference (SecureStore mock reset between tests); language switch re-renders keyed labels; representative User and Pandit screens in one non-English locale; missing-key behaviour; locale-parity check (all locales ⊇ `en`, no extras); backend-error fallback keyed vs server message shown; date/number/INR formatting; alerts/toasts/loading/empty states keyed; `lang` interceptor rules; request bodies and status values identical after switching. The existing 59-suite baseline must remain green with default `en`. Historical results are not claimed as fresh.

## 11. Dependencies, owner decisions and device verification

- **Owner:** launch languages; translation authorship/review (wallet/referral strings have no translations anywhere); admin screens and invoice language; whether server errors may remain English; AI-translation cost/latency tolerance; native digits/month names.
- **Backend (separate approved tasks):** validate `lang`; (optionally) error `code`s beyond checkout; confirm `preferredLanguage` in auth responses.
- **Framework:** keep the custom layer (recommended — no dependency, already wired in `App.jsx`) vs adopt i18next to match the website (adds `i18next`, `react-i18next`).
- **Device:** fonts, text expansion, tab bar and dialog layout, IME input, payment return flows in a non-English locale; none verified here.
- **Separate follow-ups unchanged:** coupon policy and backend concurrency (Day 13), payment-URL host allowlist, PhonePe/real-device verification.

## 12. File references

Website: `frontend/src/i18n/index.js`, `frontend/src/i18n/locales/*.json`, `frontend/src/context/LanguageContext.jsx:18-126`, `frontend/src/utils/languageStorage.js`, `frontend/src/api/axios.js:20-33`, `frontend/src/pages/Settings.jsx:11-81`, `frontend/src/pages/Register.jsx:596-600`, `frontend/src/pages/Login.jsx:113`.
Backend: `backend/src/config/languages.config.js`, `backend/src/config/translatable.config.js`, `backend/src/services/translationService.js:173-275`, `backend/src/controllers/{pooja:77,368,412; marketplace:81,105; kit:73,89,127; temple:7,152; festival:90; livestream:17; heroBanner:11; notification:17; blog:89,140,178}.controller.js`, `backend/src/controllers/auth.controller.js:143,194,360,380,513-533`, `backend/src/routes/auth.routes.js:18`, `backend/src/models/User.js:49`, `backend/src/services/campaignAudienceService.js:84-101`.
Mobile: `mobile-app/src/i18n/index.js:21-113`, `mobile-app/src/i18n/locales/en.js`, `mobile-app/App.jsx:100-114`, `mobile-app/src/utils/sessionCleanup.js:25-26`, `mobile-app/src/api/axios.js`, `mobile-app/src/utils/helpers.js:1-35`, `mobile-app/src/utils/offlineCache.js`, `mobile-app/src/navigation/UserNavigator.jsx:168-198`, `mobile-app/src/navigation/PanditNavigator.jsx:163-179`, `mobile-app/src/navigation/AdminDrawerContent.jsx:11-22`, `mobile-app/src/screens/user/{WalletScreen,MyReferralsScreen,BookingFlowScreen,BookingDetailScreen,OrderDetailScreen,InvoiceScreen,SettingsScreen}.jsx`, `mobile-app/src/screens/pandit/*`, `mobile-app/src/screens/auth/*`.

## 13. Scope statement

**No Source Changes Made.** This audit created exactly one file, `docs/MOBILE_LOCALIZATION_AUDIT.md`. No frontend, backend, mobile, test, package, lockfile,
environment, native or existing documentation file was modified; nothing was staged, committed, pushed or deployed; no dependency was installed; no test or backend process was
started; no endpoint was called; and no secret, credential or personal data was read or recorded. IDE-generated changes and all Days 1–15 work were left untouched.
