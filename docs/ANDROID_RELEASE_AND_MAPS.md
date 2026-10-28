# Android release hardening (F-24) and maps / location (F-16)

Scope: `mobile-app/` only. Nothing here changes the website, the backend or any payment flow.

## Where the native configuration lives (read this first)

`mobile-app/android/` is **committed**. Because it exists, EAS Build and `expo run:android` use it as it is and do **not**
re-generate it from `app.json`. So:

- The files that actually decide the release APK/AAB are `android/app/src/main/AndroidManifest.xml`,
  `android/app/src/debug/AndroidManifest.xml`, `android/app/build.gradle` and `android/app/src/main/res/xml/*`.
- `app.json` mirrors the permission/backup decisions (`android.allowBackup: false`, image-picker `microphonePermission: false`)
  only so that someone who deliberately re-runs `expo prebuild` does not silently get them back. It does **not** express
  the cleartext or signing settings; if `android/` is ever regenerated those must be re-applied.

## F-24 — what changed

| Area | Before | Now |
|---|---|---|
| Cleartext HTTP | `usesCleartextTraffic="true"` in the main manifest (so in release) | `false` in main. The **debug** manifest overlay (already present) keeps `true` with `tools:replace`, so Metro and a LAN backend still work in debug builds. |
| Backup | `allowBackup="true"` | `allowBackup="false"` plus `fullBackupContent` (Android 6–11) and `dataExtractionRules` (Android 12+, cloud backup **and** device transfer) that exclude everything. The session token (`expo-secure-store`), cached account data and the cart are never backed up or transferred. Users simply log in again on a new device. |
| Release signing | `release` build type used `signingConfigs.debug` | `release` is signed only with a configured release key; otherwise `null`, and `assembleRelease`/`bundleRelease` stop with an explanatory error. Debug builds still use the debug keystore. |
| Permissions | `RECORD_AUDIO` (from the `expo-image-picker` plugin default) and `SYSTEM_ALERT_WINDOW` in the release manifest | Both removed from the main manifest. The app only picks still images and never records audio/video; `SYSTEM_ALERT_WINDOW` is React Native's dev overlay and stays in the **debug** manifest only. Location, camera, storage, boot, vibrate, internet are unchanged. |

### Signing

- **EAS Build (the project's `eas.json` already targets it):** use EAS-managed credentials (`eas credentials`). EAS is expected to
  inject its signing config into the build and the Gradle guard accepts a configured release signing. **Not verified here** (no EAS
  access); a local dry run proves only that the guard accepts a configured value.
- **Local `./gradlew assembleRelease|bundleRelease`:** provide all four, as environment variables or in
  `~/.gradle/gradle.properties` (never in the repository):
  `ZUTSAV_RELEASE_STORE_FILE`, `ZUTSAV_RELEASE_STORE_PASSWORD`, `ZUTSAV_RELEASE_KEY_ALIAS`, `ZUTSAV_RELEASE_KEY_PASSWORD`.
  Keep the keystore outside the repo. `android/app/debug.keystore` is the standard public React Native debug key, used only for debug.
- Play uploads must be signed with the upload key; register it (or Play App Signing) before the first release.

### Network and release builds

Release builds now reject `http://` API traffic. `eas.json` `preview`/`production` already point at `https://` hosts (the preview
host is still a placeholder `your-staging-api.zutsav.com`). `src/config/env.js` still falls back to a dev `http://` host if
`EXPO_PUBLIC_API_URL` is unset; in a release build that now fails closed (network error) instead of silently using plain HTTP.

## F-16 — maps and location: what the app actually uses

**Zutsav's map provider is Ola Maps, and it is used only by the backend.**

| Piece | Implementation | Credentials |
|---|---|---|
| Place search, geocoding, reverse geocoding | Backend `/api/location/autocomplete`, `/geocode`, `/reverse-geocode` (`backend/src/routes/location.routes.js`, `services/locationService.js`, `services/olaAuth.js`) calling `https://api.olamaps.io` (Nominatim fallback). The app calls it through `src/services/geocodingService.js` with the normal logged-in session. | Held **server-side only**: `OLA_MAPS_CLIENT_ID` + `OLA_MAPS_CLIENT_SECRET` (OAuth 2.0 client credentials, preferred) or `OLA_MAPS_API_KEY`, in `backend/.env` / Config Center. See `backend/.env.example`. |
| Location picker view (`src/components/shared/MapPicker.jsx`) | `react-native-maps`. On Android this is rendered by the **Google Maps SDK**, which needs a Google key. The website's picker uses Leaflet + OpenStreetMap tiles. | Neither Ola nor Google credentials exist in the app. |

So there is **no Ola Maps key, project ID or SDK to configure in the mobile app**: the integration that exists (search/geocoding) is
configured on the backend and works unchanged. The app deliberately ships no vendor key (`geocodingService.js` header), and this
change keeps it that way (a Jest guard fails if an Ola or Google key setting appears in the app configuration).

### Correction recorded

An earlier version of this task added Google Maps configuration to the app (a `com.google.android.geo.API_KEY` manifest entry fed by
`GOOGLE_MAPS_ANDROID_API_KEY`, a Gradle placeholder, an `EXPO_PUBLIC_ANDROID_MAPS_ENABLED` flag and Google Cloud instructions). That
was wrong for this app and has been **removed**. Nothing Google-specific remains from it.

### Behaviour now

- **Android (updated Day 29):** the picker now shows an interactive OpenStreetMap tile map (`OsmTileMap.jsx`; no key, no dependency, no native change; the
  `react-native-maps` view below is still never mounted on Android). The next bullet describes the earlier behaviour and is kept for history.
- **Android (before Day 29):** the embedded map is not mounted (the Google-backed view has no configuration and would crash or show a blank grey map).
  The picker shows "The map is not available right now", keeps **Use My Current Location** (device GPS, `expo-location`, then the
  existing Ola-backed reverse geocoding fills the address), keeps Close, and still refuses to save the placeholder India-centre. Other
  screens are unaffected. The address fields keep their Ola-backed search where the screens already have it.
- **iOS:** unchanged (Apple Maps, no key).
- **Coordinates:** saved coordinates are validated before they reach any map (numbers or numeric strings, in range, not 0,0); invalid
  values fall back to the default view and cannot be confirmed.
- One switch controls this: `isEmbeddedMapAvailable()` in `src/utils/mapConfig.js`.

### Why the Ola Android SDK was not wired in

The official Ola Maps Android SDK (docs: `maps.olakrutrim.com/docs/sdks/map-sdks/android`, repo `github.com/ola-maps/android-maps-sdk`) is, per
those pages, a **native** library: an `OlaMapSdk.aar` copied into `libs/` by hand, built on MapLibre (`org.maplibre.gl`), with the API key
passed in code (`mapView.getMap(<key>, …)`). The pages mention no React Native/Expo support. Using it here would mean a custom native
view/Expo module, the AAR plus MapLibre dependencies, a new development build, and an **Ola key inside the app**, which contradicts the
existing "no vendor key reaches the app" design. That is a substantial native migration, so it was not started; it needs a product
decision. (The SDK pages as fetched did not show Maven coordinates, minimum SDK or key-restriction/dashboard steps, so none are claimed here.)

### What you configure, and where

- **Backend (already the case; nothing new):** Ola credentials in `backend/.env` or Config Center, as described in `backend/.env.example` and
  Ola's auth docs (`maps.olakrutrim.com/docs/auth`). Create/manage them in your Ola Maps account.
- **Mobile app:** nothing. Do not add an Ola or Google key to `eas.json`, `.env`, `app.json` or the manifest.
- **If the product wants an interactive Android map:** choose one of (a) adopt the Ola Android SDK via a native module (needs the key
  in the app and your Ola account's guidance on protecting a client-side key), (b) keep picking by GPS and Ola-backed search only (the
  current behaviour), or (c) a different provider, which this task excluded.

## Local-network testing build (`localTest`, Day 28) — internal use only

For testing on a phone against a backend running on the developer machine over the same Wi-Fi (HTTP, no HTTPS). It is **not** a
production or store build.

| | `release` (production) | `localTest` (internal testing) |
|---|---|---|
| Build command | `assembleRelease` / `bundleRelease` | `assembleLocalTest` |
| Standalone JS bundle (no Metro) | yes | yes (same Hermes bundle step; not a debuggable variant) |
| Signing | release key via `ZUTSAV_RELEASE_*`, guard refuses otherwise | **same** `ZUTSAV_RELEASE_*` requirement and refusal; never the debug key |
| `usesCleartextTraffic` (main manifest) | `false` | `false` (inherited, unchanged) |
| Cleartext HTTP | none | only to the single LAN host named in `android/app/src/localTest/res/xml/network_security_config_localtest.xml` (`base-config` stays HTTPS-only) |
| Version name | `1.0.0` | `1.0.0-localtest` (same package id `com.zutsav.app`, same versionCode) |

Isolation: the exception exists only in `src/localTest/` (a manifest that adds `android:networkSecurityConfig`, plus that one XML). `src/main`,
`src/debug` and the `release` build type were not changed, so the production manifest is unchanged. `assembleLocalTest` also refuses to run
unless `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_BASE_URL` are `http://` URLs on the host listed in that XML. Android applies the network-security-config
on API 24+; on API 23 cleartext stays blocked. Static guards: `src/config/__tests__/androidRelease.test.js`.

Build (values come from the environment, never printed or committed; the keystore lives outside the repository):

```
set -a; . <path-outside-repo>/signing.env; set +a        # the four ZUTSAV_RELEASE_* values
export EXPO_PUBLIC_API_URL=http://<lan-ip>:5000/api EXPO_PUBLIC_BASE_URL=http://<lan-ip>:5000 EXPO_PUBLIC_WEB_URL=<web url>
cd mobile-app/android && ./gradlew assembleLocalTest        # → app/build/outputs/apk/localTest/app-localTest.apk
```

If the machine's LAN address changes, update the `<domain>` in the XML and the URLs above (the build refuses a mismatch). The signing identity is a
throwaway **internal-testing** key (CN says so); it is not a production or Play upload key, and an app signed with it cannot be updated by a
store build. The stale `app/build/outputs/apk/release` and `debug` files and `intermediates/merged_manifests/release` in an old `build/` folder predate F-24 — do not use them.

## What was and was not verified

Verified with real tooling in this environment (Windows, JDK 17, Android SDK, Gradle 8.6):
- Gradle configures with the corrected `build.gradle`; `assembleRelease --dry-run` **fails with the signing error** when no
  credentials are set and **passes the guard** when four dummy values are set.
- `processDebugMainManifest`, `processDebugManifest` and `processDebugResources` succeed offline: the merged **debug** manifest has no
  `RECORD_AUDIO`, `allowBackup=false`, the backup/extraction XML resolves, no map-key metadata, and cleartext is `true` (debug overlay only).
- Jest (static guards on the manifest/Gradle files, `MapPicker` on Android and iOS, coordinate validation) and the Android Expo export.

Not verified: a **release** manifest merge or native release build (no network access to Maven from this machine, so release-variant
dependencies could not be fetched), release signing with a real key, EAS credential injection, the backend's Ola calls against the real
Ola service (covered only by existing backend tests with mocks), and any emulator/device run. A successful Expo export proves the JavaScript
bundle only.

## Remaining risks / decisions

- No interactive map on Android until a provider decision is made (see above).
- Library components that are `exported="true"` come from dependencies (`expo-clipboard` FileProvider, `CropImageActivity`, FCM/WorkManager
  receivers). Not changed here; review if a security assessment requires it.
- The app's URL schemes (`zutsav`, `com.zutsav.app`) are unverified custom schemes (no App Links); unchanged.
- ProGuard/R8 minification stays off (`android.enableProguardInReleaseBuilds`); enabling it needs its own testing.
- `versionCode`/`versionName` are hard-coded in `build.gradle`; bump them per Play upload.
- `eas.json` declares a `development` profile with `developmentClient` but `expo-dev-client` is not a dependency; unrelated, left as is.
