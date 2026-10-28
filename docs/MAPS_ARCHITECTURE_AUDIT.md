# Maps and location architecture audit (Day 9)

Date: 2026-10-26 · Branch `main` · HEAD `e77ef97` (plus uncommitted work from Days 1–8)
Method: static source inspection only. No code, test, package, environment or native file was changed; no backend test was
started; no live Ola/Nominatim/OSM endpoint was called; no credential value was read. Where a claim could only be confirmed by
running the system it is marked **Not verified**.

## 1. Executive summary

- **The website map is Leaflet + OpenStreetMap tiles. Ola Maps does not render any map anywhere in the codebase.**
  `frontend/src/components/shared/MapPicker.jsx` creates `L.map(...)` and `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')`.
- **Ola Maps is a server-side place-search/geocoding provider only.** Place autocomplete, forward geocoding and reverse geocoding go
  browser/app → `GET /api/location/{autocomplete,geocode,reverse-geocode}` → `locationService.js` → Ola (`api.olamaps.io`, OAuth 2.0
  client credentials, or an API key as fallback) → Nominatim (OSM) as fallback. Credentials never leave the backend.
- **The backend already provides everything the mobile app needs for search and geocoding, and mobile already uses it** (same three
  endpoints, same fields). No backend change is required for Option A below.
- **The mobile app's interactive map was `react-native-maps`, which is Google-backed on Android.** No Google or Ola configuration
  exists, so on Android the map view is not mounted (Day 8 correction); the picker offers GPS + the Ola-backed address lookup only.
  iOS (Apple Maps) is unchanged.
- **An Ola-backed interactive Android map would need a new native integration**, not configuration: per Ola's published Android SDK pages it
  is a hand-added `OlaMapSdk.aar` on MapLibre, with the API key passed in code, and nothing about React Native/Expo. It would also put a
  client-side Ola key in the app, which today's design deliberately avoids.
- **The website itself has no GPS ("use my location") at all**; GPS exists only on mobile.
- Real defects found (details in §9): the admin temple form can save the India-centre placeholder as a temple's location; mobile address
  forms can save an old pin after the address text changed; addresses and coordinates travel in query strings that `morgan('dev')` logs;
  provider outages look like "no results" to users; mobile drops the `components` the website uses to auto-fill pincode/state/city.
- **Recommendation:** Option A now (backend search + GPS, no embedded map, plus a few parity/data-quality fixes). Decide on an
  interactive Android map separately; see §10 for B and C trade-offs. The final product decision is the owner's.

## 2. Verified request flow

```
Website (browser)                              Mobile (Expo / RN)
  LocationSearch ─┐                              LocationSearch ─┐
  MapPicker (Leaflet+OSM tiles) ─┤                MapPicker (iOS: Apple Maps; Android: not mounted)
  Profile / PanditMyProfile /    │                PersonalInfo / PanditAddress /
  DetailsStep / AdminDashboard   │                AddressPicker / AddressFormSheet
                                 ▼                                ▼
            services/geocodingService.js (web)       services/geocodingService.js (mobile)
                       │  axios, Bearer JWT                 │  axios, Bearer JWT
                       ▼                                    ▼
   GET /api/location/autocomplete?q=        (protect → locationLimiter 120/15min → apiLimiter 500/15min)
   GET /api/location/geocode?q=
   GET /api/location/reverse-geocode?lat=&lng=
                       │  controllers/location.controller.js  (validation, 200-with-flag on provider failure)
                       ▼
        services/locationService.js   (5 min cache for search/geocode; 30 s for fallback results; reverse never cached)
           1) Ola Maps  https://api.olamaps.io  /places/v1/{autocomplete,geocode,reverse-geocode}
                 auth: OAuth2 client-credentials Bearer (services/olaAuth.js)  — or api_key query param in key-only mode
           2) Nominatim https://nominatim.openstreetmap.org  (fallback when Ola has no credentials / fails / returns nothing)

Map TILES (website only):  browser ──► https://{s}.tile.openstreetmap.org   (no backend, no key)
GPS (mobile only):         expo-location ──► device; result then goes to reverse-geocode
Directions links (website): https://www.google.com/maps?q=…   (plain external link; mobile: only admin/pandit booking "Maps" quick action)
```

## 3. Frontend (website) inventory

### 3.1 Components and services

| Item | File | Role |
|---|---|---|
| Map picker | `frontend/src/components/shared/MapPicker.jsx` | Leaflet loaded dynamically (`import('leaflet')`, CSS from `unpkg.com`), OSM raster tiles (`:80`), draggable marker, click-to-place. Props `lat, lng, hasPin, onPinMove, height, readOnly`. Default view = India centre `20.5937, 78.9629` (`:59`) used only for the *view*; `hasPin=false` shows no marker (`:99`). Reports `(lat, lng, displayName)` via reverse geocode on drag/click (`:90`, `:105`). |
| Place search | `frontend/src/components/shared/LocationSearch.jsx` | Debounced (350 ms), min 3 chars, aborts superseded requests (`AbortController`), keyboard navigation, returns `{label, lat, lng, components}`. |
| Geocoding service | `frontend/src/services/geocodingService.js` | `autocompletePlaces`, `geocodeLocation` (tiered queries: address+district+city+state+pin → … → city+state, then pincode), `reverseGeocodeLocation`. Session cache (200 entries, successes only). Never throws; every failure becomes `{found:false}` / `{displayName:''}`. |
| Third-party hosts | `frontend/src/config/thirdParty.config.js` | `api.postalpincode.in` (pincode → city/state; called **directly** from the browser by `PincodeInput.jsx:34` and `AdminDashboard.jsx:498`). `nominatimApiUrl` is declared but has **no remaining callers** (legacy; the geocoding goes through the backend now). |
| GPS | — | **Not found.** No `navigator.geolocation` anywhere in `frontend/src`. |

### 3.2 Flows

| Flow | Call site | Trigger | Search/geocode path | Saved values |
|---|---|---|---|---|
| User profile address | `pages/Profile.jsx` (`LocationSearch :481`, `MapPicker :538`, `handleSave :391`) | Typing in search; editing address fields (auto-geocode after 900 ms, `:368-389`); dragging/clicking map | `GET /location/autocomplete`, `/geocode`, `/reverse-geocode` | `PATCH /users/profile` with `latitude/longitude` **only if `hasPin && !pinStale`, else `null`** (`:395-404`). Initial coords only if `Number.isFinite` (`:279-281`). |
| Pandit address | `pages/PanditMyProfile.jsx` (`:236-281`, `:323`, `:394`) | same | same | `PATCH /pandits/me/languages-address` with the same pin-staleness rule (`:268-277`) plus `serviceCoverage` |
| Booking address | `components/booking/DetailsStep.jsx` (`LocationSearch :140`, `MapPicker :191`) | Choosing a saved address, searching, dragging the pin | autocomplete + reverse | `POST /bookings/create-phonepe-order` with `userDetails.latitude/longitude`, `null` when not finite (`pages/BookingFlow.jsx:390-391`); optional `POST /users/addresses`. Saved addresses supply coords with `Number.isFinite` checks (`DetailsStep.jsx:63-64`). **No stale-pin clearing** when the address text is edited after a pin was set. |
| Admin temple form | `pages/AdminDashboard.jsx` (`:7210`, `:7261`, `:7329-7356` auto-geocode, `:7381` place select, `:7437` manual coordinate inputs, `:7517-7523` submit) | Admin edits | autocomplete + geocode (with a `name` tier) + reverse; manual coordinate fields validated −90…90 / −180…180 | `POST/PATCH /temples` with `latitude`/`longitude` appended **unconditionally** from `mapCoords`, which defaults to the India centre (see F1). |
| Temple directions | `pages/TempleDetailPage.jsx:49-53` | "Get directions" link | none (external) | none — a plain `google.com/maps?q=lat,lng` (or address) link in a new tab |
| Pincode lookup | `PincodeInput.jsx:34` | typing a pincode | **direct browser → `api.postalpincode.in`** | fills state/city/district only |

### 3.3 Frontend contract (what the website actually reads)

- `GET /location/autocomplete?q` → `data.found`, `data.results[] {label, lat, lng, placeId, components}`. `lat`/`lng` coerced with `Number()`, entries without finite values dropped. `components` `{pincode, state, city, district}` auto-fill the form (`Profile.jsx:482-494`, `DetailsStep.jsx:141-150`).
- `GET /location/geocode?q` → `data.found`, `data.lat`, `data.lng`, `data.label`.
- `GET /location/reverse-geocode?lat&lng` → `data.displayName`.
- Coordinates are `{lat, lng}` in the UI and `latitude/longitude` in API bodies; Leaflet takes `[lat, lng]`. No axis inversion found.
- Empty input: autocomplete < 3 chars → no request. No results/provider failure → "No matching places found" (indistinguishable). 429 → toast "Server is busy" (`api/axios.js`). 401 → clears auth and fires `zutsav:unauthorized` (guests on the public booking page receive 401 from these protected endpoints; Not verified at runtime what the guest sees, but the source silently treats it as "no results").

### 3.4 Legacy / duplicated / inconsistent

- `nominatimApiUrl` unused; two places call the pincode API directly while everything else is proxied.
- Pin-staleness handling exists in Profile and PanditMyProfile but not in the booking `DetailsStep`.
- Admin temple form uses a different pattern (always-send `mapCoords`) than the user/pandit forms (null when stale).

## 4. Backend inventory

All three endpoints are mounted at `app.use('/api/location', require('./routes/location.routes'))` (`backend/src/app.js:169`).
`routes/location.routes.js`: `router.use(protect)` (any valid logged-in user, **no role check**) then a dedicated `locationLimiter`
(120 requests / 15 min, per the express-rate-limit key) on top of the global `apiLimiter` (500 / 15 min, `app.js:87-103`).

| Endpoint | Input / validation (`controllers/location.controller.js`) | Success body | Failure behaviour |
|---|---|---|---|
| `GET /api/location/autocomplete?q=` | `q` trimmed; < 2 chars → `{success:true, found:false, results:[]}`; > 200 chars → **400** `Query too long` | `{success:true, found, provider:'ola-maps'\|'nominatim', results:[{label, lat, lng, placeId, components}], providerUnavailable?}` (max 8 results; `components` empty for Nominatim search) | Exception → **HTTP 200** `{success:false, message:'Location search unavailable', found:false, results:[]}` |
| `GET /api/location/geocode?q=` | empty → **400**; > 200 chars → **400** | `{success:true, found, provider, lat, lng, label, components?, providerUnavailable?}` | **200** `{success:false, found:false, message}` |
| `GET /api/location/reverse-geocode?lat=&lng=` | non-finite → **400**; out of range → **400**; rounded to 6 dp | `{success:true, found, provider, displayName, components?, providerUnavailable?}` | **200** `{success:false, found:false, displayName:''}` |

Provider layer (`backend/src/services/locationService.js`, `olaAuth.js`, `config/integrations.config.js`):

- **Credential modes (verified in code):** OAuth 2.0 client credentials when `OLA_MAPS_CLIENT_ID` and `OLA_MAPS_CLIENT_SECRET` are both set; otherwise API-key mode with `OLA_MAPS_API_KEY`; otherwise `none` (skip Ola, go straight to Nominatim). Names are read through `readEnv` (`:36-38`); a Config Center lookup (`olaMapsClientId/ClientSecret/ApiKey`) exists but the settings schema has no such fields, so env is the effective source (`:71-88`). Selection: `authModeFor` (`:91-95`). No values were read for this audit.
- **Requests:** `olaRequest` (`:310-373`): OAuth → `Authorization: Bearer <token>` header; API-key mode → `api_key` **query parameter** on the outbound call. 8 s timeout. One forced token re-mint and retry on 401/403, no retry on 429 or other errors. Token endpoint `POST https://api.olamaps.io/auth/v1/token`, token kept in memory only, single-flight, 30 min default TTL, redaction helper for logs.
- **Normalisation:** accepts several Ola payload shapes (`extractLatLng`, `extractLabel`, `pickArray`), ranks geocode rows (street/POI over postal centroid; prefers the PIN in the query) and reverse rows (address-like over nearby business, then nearest), extracts `components` `{pincode, city, state, district, locality}`. Provider payloads are never returned raw.
- **Fallback/caching:** Nominatim (`countrycodes=in`, User-Agent `Zutsav/1.0`). 5-minute in-process cache (300 entries) for search/geocode, 30 s when Ola was unhealthy, reverse geocode never cached.
- **Failure handling:** missing credentials → `skipReason:'no-key'` (not an error; `providerUnavailable` false); auth/provider errors → fallback with `providerUnavailable:true`.
- **Logging:** warnings pass through `redactLog`; the controller logs only `err.message`. **But** `app.use(morgan('dev'))` (`app.js:119`) logs every request line including the full URL, so the address text (`q`) and coordinates (`lat`,`lng`) of these GET requests appear in server logs (F3).
- **Health:** `GET /api/health` (`app.js:19-28`, registered before helmet/limiters, no auth) returns Ola auth mode, `oauth` configured/partial state, token cached/expiry, last success/failure timestamps and failure counter. No secrets, but it discloses provider configuration state publicly (F4).
- **Consumers of coordinates:** `User` (profile + saved addresses, `validateCoordinatePair`, desync guard that nulls coords when address fields change without a pair — `user.controller.js:25-44`), `Pandit` (`pandit.controller.js`, same helper), `Temple` (`temple.controller.js`: `validateCoords`; explicit pair is authoritative, server geocodes only when none is sent — `:185-199`, `:245-263`), `Booking.userDetails` (schema min/max only, **no pair validation in the controller**: `booking.controller.js:162,187`, `Booking.js:21-22`), admin pandit matching (`admin.controller.js:1536-1665`, haversine distance from booking coordinates to Pandit coordinates).
- **Existing tests (read, not run):** `backend/tests/location-provider.test.js` (30 tests: OAuth/key modes, 401 recovery, 429, fallback, normalisation, caching, health, redaction — all with mocks) and `backend/tests/pandit-location-validation.test.js` (30 tests for the coordinate-pair helper). **No route/controller-level test** for `/api/location/*` (auth required, 400 cases, 200-on-failure shape).
- **Suitable for mobile reuse unchanged?** Yes (and already reused). Callers must: be logged in; send `q` ≤ 200 chars (autocomplete ≥ 2); send numeric in-range `lat/lng`; treat `{success:false}` / `found:false` as "unavailable or no result"; tolerate empty `components`.

## 5. Mobile inventory (current working tree)

| Item | File | Behaviour |
|---|---|---|
| Picker | `mobile-app/src/components/shared/MapPicker.jsx` | Full-screen modal. `react-native-maps` `MapView` with a fixed centre pin (iOS only). Android: not mounted — shows "The map is not available right now" (`utils/mapConfig.js` `isEmbeddedMapAvailable`: Android → false). "Use My Current Location" (`expo-location`: `requestForegroundPermissionsAsync` then `getCurrentPositionAsync({})`, no timeout/accuracy/services-enabled check), Confirm disabled until the user pans or uses GPS (so the India-centre default view is never saved). Saved coordinates pass `sanitizeCoords` (numbers or numeric strings, in range, not 0,0). Denied permission → toast "Location permission denied"; other failure → "Could not fetch current location". `initialCoords` are read once at mount (see F11). |
| Search | `components/shared/LocationSearch.jsx` | Debounced 350 ms, min 3 chars, stale-response guard (no request abort). Returns `{label, lat, lng}`. |
| Service | `services/geocodingService.js` | Same three endpoints through the shared axios client (Bearer token, 30 s timeout). Cache 200 entries, cleared on logout (`clearGeocodingCache`). `autocompletePlaces` keeps only `label, lat, lng` — **drops `placeId` and `components`**. `geocodeLocation` (tiers, no `name` tier, no abort) **has no callers**. `reverseGeocodeLocation` → `displayName`. |
| Call sites | `PersonalInfoScreen.jsx` (user), `PanditAddressScreen.jsx` (pandit), `AddressPicker.jsx` (booking), `AddressFormSheet.jsx` (address book) | All four use `LocationSearch` + `MapPicker`; User and Pandit share the picker and the service. |
| Saved values | `PersonalInfoScreen.handleSave` → `PATCH /users/profile` (`latitude/longitude` or `null`); `PanditAddressScreen.handleSave` → `PATCH /pandits/me/languages-address` with a **pin-staleness rule** like the website; `BookingFlowScreen` (`:196-197`, `:331`) → `POST /bookings/create-phonepe-order` with `userDetails.latitude/longitude ?? null`; `useAddresses` → saved addresses (`latitude/longitude`). |
| Directions | `utils/quickActions.js openMaps(address)` → `https://www.google.com/maps/search/?api=1&query=<address>` (admin booking/pandit detail screens, Pandit booking detail). The Temple screens have **no** directions link. |
| Credentials | None in the app. `.env.example` states the app ships no map/search key. No Google or Ola key setting exists in `app.json`, `eas.json`, the manifest or Gradle (guarded by a Jest test). |
| Tests | `components/shared/__tests__/MapPicker.test.jsx` + `MapPicker.android.test.jsx` (Day 8), `utils/__tests__/mapConfig.test.js`, `config/__tests__/androidRelease.test.js`. **No tests** for `geocodingService`, `LocationSearch`, `AddressPicker`, `AddressFormSheet`, `PersonalInfoScreen` or `PanditAddressScreen` location behaviour. |

Platform behaviour: Android = no map view (by design since Day 8, because `react-native-maps` uses the Google Maps SDK and no key exists);
iOS = `MapView` mounted with the default provider (Apple Maps); "neither" never applies. iOS behaviour is code-read only (**Not verified** on a device).

## 6. Provider and credential ownership

| Concern | Owner | Evidence |
|---|---|---|
| Ola Maps credentials (client id/secret, or API key) | Backend only (env / Config Center) | `locationService.js:36-38,81-95`; `backend/.env.example` (names only) |
| Map tiles (website) | OpenStreetMap public tile servers, no key | `MapPicker.jsx:80` |
| Search / geocoding | Ola (primary) → Nominatim (fallback), via backend | `locationService.js:511-581` |
| Map tiles (mobile) | iOS: Apple Maps via `react-native-maps`; Android: none | `MapPicker.jsx`, `mapConfig.js` |
| GPS | Device, mobile only | `MapPicker.jsx handleUseCurrentLocation` |
| Pincode lookup | `api.postalpincode.in`, called by the website browser directly | `PincodeInput.jsx:34`; mobile `PincodeInput` not audited |

## 7. Cross-platform comparison

| Capability | Website | Backend | Mobile |
|---|---|---|---|
| Interactive map renderer | Leaflet (`MapPicker.jsx`) | Not applicable | `react-native-maps` — iOS only; Android not mounted |
| Map tile provider | OpenStreetMap public tiles | Not applicable | iOS Apple Maps; Android Not found |
| Autocomplete / search provider | Ola via backend proxy | Ola → Nominatim | Ola via the same backend proxy |
| Forward geocoding | Auto after address edits (tiered cascade) + explicit pick | `GET /location/geocode` (Ola → Nominatim) | Function exists but is **never called**; only explicit autocomplete picks set coordinates |
| Reverse geocoding | On pin drag/click | `GET /location/reverse-geocode` | After map confirm (when address is empty) |
| Credential ownership | None in browser | Ola creds in backend env | None in app (verified by a Jest guard) |
| GPS / current location | Not found | Not applicable | `MapPicker` "Use My Current Location" |
| Address/coordinate contract | `{lat,lng}` in UI; `latitude/longitude` in API; autocomplete `components` used | Schemas above | `{latitude,longitude}`; autocomplete `components` dropped |
| Error / fallback | Everything → "no results"; 429 toast; stale-pin clearing in profile/pandit | 400 on bad input; 200 + `success:false` on provider failure; Nominatim fallback | Everything → "no results"; denied-GPS and GPS-failure toasts; stale-pin clearing only in Pandit screen |

Answers:

1. **Does the website's map depend on Ola?** No. Tiles are OSM; Ola handles only search/geocoding through the backend.
2. **Can mobile reuse the backend geocoding APIs?** Yes, and it already does, unchanged.
3. **GPS + backend search/geocoding without an embedded map — acceptable?** For capturing a usable address and coordinates, yes, with fixes: carry `components` so pincode/state/city auto-fill, clear stale pins on address edits, and surface the coordinates being saved. It gives no visual confirmation of the pin and no manual fine-tuning, which the website offers.
4. **If an interactive Android map is required:** a map renderer must be added (§10 B or C), the picker's Android gate flipped, a development build produced, and device testing done. Backend unchanged.
5. **Ola-backed interactive map with the architecture already in place?** No. It needs a new native integration (§10 B).
6. **Is the website map a reference for mobile?** For behaviour and contracts, yes (pin semantics, hasPin, stale-pin rule, tiered geocode, `components` auto-fill). The Leaflet code itself is browser-DOM based and cannot run in React Native.
7. **Reusable exactly:** the three endpoints and their fields; the geocode tiering, stale-pin and `hasPin` rules; the validation rules (range checks, pair semantics, `Number.isFinite`). **Platform-specific:** map renderer, tiles, gestures, GPS, permissions, native build configuration.

## 8. Confirmed findings vs unverified assumptions

Confirmed from source: everything in §3–§7 above that cites a file. Items below were **not verified** and need runtime evidence:

- Whether Ola's live autocomplete responses carry coordinates (the code drops suggestions without them and silently falls back to Nominatim — `locationService.js:380-389`); only mocked in tests.
- What a guest sees on the public booking page when `/api/location/*` returns 401.
- Real-device behaviour of `MapPicker` (GPS timeouts, iOS map), and the exact behaviour of `react-native-maps` on Android without a key (documented, not reproduced).
- Whether Ola's SDK requirements (§10 B) match the pages as summarised: those pages were read through a text extraction that omitted code samples; Maven coordinates, minimum SDK and key-restriction options were **not stated**.
- That Ola offers React Native, tile or style-JSON documentation: the docs index fetched lists none (Not found, not proof of absence).
- OSM tile-usage-policy suitability for mobile traffic volumes (policy not re-read here).

## 9. Security, data-quality and parity risks

| # | Severity | Finding | Evidence | Impact | Follow-up |
|---|---|---|---|---|---|
| F1 | Medium (confirmed) | Admin temple form can save the India-centre placeholder as a temple's coordinates | `AdminDashboard.jsx:7210,7261,7478` default `mapCoords = INDIA_CENTER`; `:7522-7523` appends it unconditionally; `temple.controller.js:185-199` treats an explicit pair as authoritative and never geocodes | Temple shown/linked at the geographic centre of India if the admin never sets a location | Send coordinates only when the admin set one (website/admin change; out of mobile scope) |
| F2 | Medium (confirmed) | Mobile address forms can save an old pin after the address text changed | `PersonalInfoScreen.handleSave` sends `coords` unconditionally; `AddressPicker`/`AddressFormSheet` keep coords when text is edited; backend desync guard only triggers when no pair is sent (`user.controller.js:37-44`). Website Profile/Pandit and mobile `PanditAddressScreen` do clear stale pins; website `DetailsStep` does not either | Wrong coordinates feed admin pandit matching (`admin.controller.js:1536-1665`) and profiles | Add the pin-staleness rule to the mobile user/booking/address-book flows (and the website booking step) |
| F3 | Medium (confirmed) | Addresses and coordinates appear in server logs | `morgan('dev')` at `app.js:119` logs full URLs; the endpoints are `GET` with `q`, `lat`, `lng` in the query string | Personal location data in logs | Skip or redact `/api/location` in the logger (backend change; needs approval) |
| F4 | Low–Medium (confirmed) | Public `/api/health` discloses Ola auth mode, configuration state and failure counters | `app.js:19-28` before helmet/limiters, no auth | Information disclosure (no secrets) | Restrict or trim for unauthenticated callers |
| F5 | Low (confirmed in code) | Provider outage is indistinguishable from "no results" | `location.controller.js` returns HTTP 200 + `success:false`; both clients swallow errors into `{found:false}` and show "No matching places" | Users blame their query; no retry affordance | Distinguish `providerUnavailable`/`success:false` from empty results in the UI |
| F6 | Low (confirmed) | Mobile discards autocomplete `components` | `mobile …/geocodingService.js` maps only `label,lat,lng`; website fills pincode/state/city from `components` | Booking requires pincode (`Booking.js`); users re-type fields | Keep `components` and auto-fill like the website |
| F7 | Low (confirmed) | Mobile `geocodeLocation` has no callers; `PersonalInfoScreen` search-select makes a reverse-geocode call and discards the result | grep of mobile `src`; `PersonalInfoScreen.jsx` `onSelect` | No auto-geocode on typed addresses; a wasted paid-provider call per selection | Either wire the cascade (debounced, abortable) or remove the dead call |
| F8 | Low (confirmed) | Truthiness checks treat coordinate `0` as "missing" | mobile `AddressPicker.jsx`/`AddressFormSheet.jsx`/`PersonalInfoScreen.jsx` (`lat && lng`), `admin.controller.js:1649`, `temple.controller.js:263` | Equator/prime-meridian edge case; India unaffected | Use `Number.isFinite` consistently |
| F9 | Low (potential) | Booking `userDetails` coordinates are not validated as a pair by the controller | `booking.controller.js:162,187`; schema min/max only | A half pair or odd value is handled by Mongoose; HTTP status on failure Not verified | Reuse `validateCoordinatePair` for bookings |
| F10 | Info | Request-volume controls: server `q` min 2 vs clients 3; 120/15 min per-IP location limiter; client debounce 350 ms; website aborts in-flight requests, mobile does not | `location.controller.js`, `location.routes.js`, both `LocationSearch` | Bounded; mobile can waste responses | Optional abort support on mobile |
| F11 | Info (confirmed) | `MapPicker` reads `initialCoords` once; callers keep it mounted | `MapPicker.jsx` `useState(...)` initialisers; callers render it unconditionally with `visible` | Re-opening the map after a search pick shows the old view (iOS) | Re-seed region when `visible` turns true |
| F12 | Info | No axis inversion found | Ola reverse call `latlng: "lat,lng"` (`locationService.js:406`); Leaflet `[lat,lng]`; RN maps `latitude/longitude` | — | — |
| F13 | Info (confirmed) | Test gaps | No `/api/location` route tests; no mobile tests for geocoding/search/address screens | Contract drift would go unnoticed | See §11 |
| F14 | Info | Nominatim fallback sends user text/coordinates to a third party from the server | `locationService.js:417-434` | Privacy disclosure item | Mention in the privacy policy; consider disabling the fallback in production |
| F15 | Info | Autocomplete requires coordinates inside suggestions | `locationService.js:380-389` | If Ola omits them, results are dropped and the fallback is used silently | Verify against the real service (needs credentials) |

No hard-coded provider credentials were found in the frontend or mobile source (searched for key-shaped strings and the Ola variable names).

## 10. Mobile integration options

### Option A — Backend search/geocoding + GPS, no embedded map (current behaviour, hardened) — recommended first step

- **UX/parity:** address search, auto-fill and GPS; no draggable pin or visual confirmation. Lower parity than the website's map, higher than today if the F2/F6 gaps are closed.
- **Files likely to change:** `LocationSearch.jsx`, `geocodingService.js` (keep `components`), `PersonalInfoScreen.jsx`, `AddressPicker.jsx`, `AddressFormSheet.jsx`, `MapPicker.jsx` (re-seed, copy), plus new tests.
- **Backend change:** none required. (F3/F4 are optional backend hardening.)
- **Vendor key / sensitive credential in the app:** none.
- **Native / dev build / new SDK:** none.
- **Security/maintainability:** lowest risk; reuses audited endpoints.
- **Testing:** fully Jest-testable with mocked API and mocked `expo-location`; device check only for GPS prompts.
- **Risks:** users who expect to nudge a pin cannot; accuracy depends on search/GPS.

### Option B — Interactive map with the native Ola Maps Android SDK

- **UX/parity:** a real Ola-rendered map on Android; closest to "Ola Maps" as a product choice.
- **What the published pages say (as fetched; verify before planning):** `OlaMapSdk.aar` copied into `libs/`, MapLibre `org.maplibre.gl:android-sdk` dependencies, API key supplied in code via `mapView.getMap(<key>, …)`; no React Native/Expo support mentioned; Maven coordinates, minimum SDK and key restrictions **not stated**.
- **Files likely to change:** a custom native Android view/Expo module (Kotlin + `ViewManager`), `android/app/build.gradle` (AAR + MapLibre deps), `MapPicker.jsx` (use the new view), `mapConfig.js` (enable on Android), tests, docs; iOS needs a separate answer (Ola iOS SDK not audited).
- **Backend change:** none for rendering; possibly a backend endpoint to hand out a short-lived/client-scoped credential if the owner does not want a static key in the APK (Not verified that Ola supports this).
- **Vendor key in the app:** **yes** (client-side Ola key) — reverses today's "no vendor key in the app" design, and Ola's restriction options for such a key were not found.
- **Native code / dev build / SDK:** yes, all three; the committed `android/` project would be edited; cannot be exercised in Expo Go.
- **Security/maintainability:** ongoing native maintenance and a key in the binary.
- **Testing:** JS logic testable; the map itself needs a real key, an emulator/device and a build; this environment cannot reach Maven.
- **Risks/unknowns:** SDK licence/terms, minSdk/compileSdk compatibility with RN 0.74 / Expo 51, bundle size, no iOS parity, unknown key controls.

### Option C — Website-parity map inside the app without a vendor key (WebView + Leaflet + OSM tiles), or MapLibre with raster OSM tiles

- **UX/parity:** the same tiles and pin behaviour as the website (draggable/click-to-place), on Android and iOS.
- **Files likely to change:** a new map component hosting Leaflet in a WebView with a small message bridge for pin moves and GPS, `MapPicker.jsx`, `mapConfig.js`, tests; `package.json` (a WebView dependency such as `react-native-webview`, which is not installed today).
- **Backend change:** none.
- **Vendor key:** none (OSM tiles are keyless).
- **Native code / dev build:** adding a native module to the committed `android/` project means a rebuild (no custom native code). Needs `INTERNET` only.
- **Security/maintainability:** WebView must be locked down (fixed HTML, no navigation, validated bridge messages); OpenStreetMap's public tile servers have a usage policy that may not suit production mobile traffic (policy not re-read here) — the website already depends on them. **This is not Ola Maps**; the product owner must confirm it is acceptable given the earlier instruction not to substitute providers.
- **Testing:** bridge/validation in Jest; rendering needs a device.
- **Risks:** WebView performance and offline behaviour; tile policy; not a native map.

### Recommendation

Do **Option A** first: it closes the real data-quality gaps (F2, F6, F7, F11) with no native work, no key and no backend change, and keeps the
location picker usable on Android today. Treat an interactive Android map as a separate product decision: choose **B** if "rendered by Ola"
is a hard requirement (accepting a native migration and a client-side key), or **C** if website-parity behaviour matters more than the
provider (accepting the OSM tile-policy question). The final decision is the owner's.

## 11. Proposed next-phase sequence (small reviewable tasks)

1. **Mobile contract tests (no behaviour change):** Jest tests for `geocodingService` (exact endpoints/params/fields, caching, failures), `LocationSearch` (debounce, min length, stale response) and the three address flows using mocked API.
2. **Carry `components` through mobile:** keep `placeId`/`components` in `autocompletePlaces`; auto-fill pincode/state/city like the website; tests.
3. **Stale-pin rule on mobile:** add the website/Pandit rule to `PersonalInfoScreen`, `AddressPicker`, `AddressFormSheet`; tests that an edited address sends `null` coordinates.
4. **Picker polish:** re-seed `MapPicker` when it opens; surface selected coordinates and a clear "set by GPS/search" state; remove the discarded reverse-geocode call; optional request abort in `LocationSearch`.
5. **Outage vs no-results UX:** distinguish `success:false`/`providerUnavailable` from empty results with a retry message (web and mobile).
6. **Backend hardening (needs approval):** exclude `/api/location` query strings from `morgan`, trim `/api/health` for anonymous callers, add route-level tests for `/api/location/*`, consider `validateCoordinatePair` for bookings.
7. **Website fixes (needs approval):** admin temple form must not send the placeholder; stale-pin clearing in the booking `DetailsStep`.
8. **Decision gate:** owner chooses A-only, B or C for an interactive Android map; if B or C, run a spike on a throwaway branch with a real key/device before touching the committed native project.

## 12. Key files and evidence

Website: `frontend/src/components/shared/MapPicker.jsx` (`:59,:80,:90,:99,:105`), `LocationSearch.jsx`, `services/geocodingService.js`, `config/thirdParty.config.js`, `pages/Profile.jsx` (`:279,:368-404,:481,:538`), `pages/PanditMyProfile.jsx` (`:236-281,:323,:394`), `components/booking/DetailsStep.jsx` (`:63,:140,:191`), `pages/BookingFlow.jsx` (`:390`), `pages/AdminDashboard.jsx` (`:7210,:7261,:7329,:7437,:7517-7523`), `pages/TempleDetailPage.jsx` (`:49-53`), `api/axios.js`, `App.jsx` (public `/book/:poojaSlug`).
Backend: `src/app.js` (`:17-28,:87-103,:119,:169`), `src/routes/location.routes.js`, `src/controllers/location.controller.js`, `src/services/locationService.js` (`:36-38,:81-95,:310-373,:380-389,:417-434,:511-581`), `src/services/olaAuth.js`, `src/config/integrations.config.js`, `src/utils/locationValidation.js`, `src/controllers/{user,pandit,temple,booking,admin}.controller.js`, `src/models/{User,Pandit,Temple,Booking}.js`, `tests/location-provider.test.js`, `tests/pandit-location-validation.test.js`.
Mobile: `src/components/shared/{MapPicker,LocationSearch,AddressPicker,AddressFormSheet}.jsx`, `src/services/geocodingService.js`, `src/utils/{mapConfig,quickActions}.js`, `src/screens/user/{PersonalInfoScreen,BookingFlowScreen}.jsx`, `src/screens/pandit/PanditAddressScreen.jsx`, `src/hooks/useAddresses.js`, `docs/ANDROID_RELEASE_AND_MAPS.md`.
Official Ola references consulted (text extraction only): `maps.olakrutrim.com/docs`, `/docs/sdks/map-sdks/android`, `github.com/ola-maps/android-maps-sdk`.

## 13. Scope statement — no source changes made

This audit created exactly one file, `docs/MAPS_ARCHITECTURE_AUDIT.md`. No source, test, backend, frontend, package manifest, lockfile,
environment, native-project or existing documentation file was modified; nothing was staged, committed, pushed or deployed; no
dependency or SDK was installed; no backend test was started or interrupted; no network service of Ola, OSM or Google was called, and no
secret or `.env` value was read or recorded. Existing uncommitted changes from Days 1–8 were left untouched.
