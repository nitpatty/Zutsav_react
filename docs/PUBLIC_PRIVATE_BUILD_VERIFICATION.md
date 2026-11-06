# Public / Private build: Metro Admin exclusion and bundle verification (Phase 2)

Scope: `mobile-app/` JavaScript bundling only. Background and the wider plan are in
`docs/PUBLIC_PRIVATE_APP_ARCHITECTURE_AUDIT.md`. Phase 1 created the Admin seam and the role policy; this phase makes Metro
choose the seam's implementation at bundle time and proves the result from real bundles.

## 1. Choosing the variant: `ZUTSAV_APP_VARIANT`

Read by `metro.config.js` (through `build-config/metroVariant.js`) in Node while Metro loads its configuration. It is not an
`EXPO_PUBLIC_*` value, is never inlined into the app, and nothing in the app reads it.

| `ZUTSAV_APP_VARIANT` | Variant |
|---|---|
| unset, empty or only spaces | `public` |
| `public` | `public` |
| `admin` | `admin` |
| anything else (`Admin`, `ADMIN`, `private`, `1`, ...) | **error**: `Invalid ZUTSAV_APP_VARIANT=... Supported values: public, admin` |

**Why the default is Public.** A build that forgets to set the variable must fail closed, producing an app without Admin code,
never the reverse. Only the exact value `admin` selects the real Admin module, and a misspelling stops the build instead of
being guessed at.

**Practical consequence.** Every JavaScript bundle made without `ZUTSAV_APP_VARIANT=admin` is the Public one: a plain
`npm start` and any direct `expo` / Metro invocation. An Admin dev session needs the variable set explicitly (`npm run
start:admin` does that for you).

**Update (Phase 3).** The Android Gradle build no longer relies on the developer exporting anything: each product flavor
passes its own variant to the bundler process (see `docs/PUBLIC_PRIVATE_BUILD_GUIDE.md`), and `npm run verify:gradle-bundles`
proves it from the bundles Gradle itself generates. The older generic tasks (`assembleRelease`, `assembleLocalTest`) now build
both flavors; use the flavor-specific tasks.

## 2. What the variant changes in Metro

1. **Seam redirect** (`resolver.resolveRequest`). The code always imports the seam `src/variants/adminModule.js` (RootNavigator
   as `../variants/adminModule`, roleSupport as `./adminModule`). Metro resolves the request normally; in the Public variant, if
   the resolved file is exactly that seam, the result is replaced with `src/variants/adminModule.public.js` (no Admin imports,
   `AdminNavigator = null`, `ADMIN_AVAILABLE = false`). Matching is on the resolved file, so any relative path to the seam is
   caught and no similarly named file or request is touched. Expo runs a user-defined `resolveRequest` first and chains through
   `context.resolveRequest`, so every other module resolves exactly as before. Application imports were not changed.
   In the Admin variant the same function passes every result through unchanged, so the real seam, and with it
   `AdminNavigator`, resolves.
2. **Public-only blocklist** (`resolver.blockList`). A second layer. In Public, Metro's file map is told these files do not exist:
   `src/screens/admin/**` and `src/navigation/AdminNavigator.*` / `AdminDrawerContent.*` (anchored to the project root, either
   path separator). If anything still tried to import one, bundling fails with "Unable to resolve module" instead of shipping
   Admin code. The patterns are added to Metro's default list (test folders stay excluded). Not blocked: the shared
   `src/components/shared/DashboardChart.jsx`, the User/Pandit/Auth code, the seam files, and `@react-navigation/drawer`. The
   drawer library stays installed and available to the Admin variant; it is absent from the Public bundle only because the
   Admin modules that import it are.
3. **Cache identity** (`cacheVersion`). Metro hashes `config.cacheVersion` into the key under which it stores transformed
   modules (`metro/src/DeltaBundler/getTransformCacheKey.js`). The variant is appended to Metro's own value, giving
   `<metro version>+zutsav-public` and `<metro version>+zutsav-admin`. It is a fixed string, so repeated runs of one variant
   share a cache and the two variants never do. Switching the environment variable alone is therefore not relied on: each
   variant has its own cache namespace, and the verifier additionally starts each variant from a cold cache by default.
   (Transform output does not depend on the variant, so this is protection against stale or crossed state, not a fix for a
   known failure.)

## 3. Running the verification

```
cd mobile-app
npm run verify:variants
```

It runs (1) the Jest suites `src/config/__tests__/metroVariant.test.js` and `variantBundleVerifier.test.js`, then (2)
`node scripts/verify-variant-bundles.js`, which for each variant runs the same Expo CLI command the Android Gradle build uses
for its JavaScript bundle, in a child process with `ZUTSAV_APP_VARIANT` set for that process only:

```
node <@expo/cli> export:embed --platform android --entry-file index.js --dev false --reset-cache \
     --bundle-output <dir>/index.android.bundle --sourcemap-output <dir>/index.android.bundle.map --assets-dest <dir>/assets
```

`--dev false` is the production transform (minified, dev flags off). It works on Windows and Unix. Options:
`--only public|admin`, `--keep` (keep the output), `--cache` (do not reset Metro's cache, to show the variants do not interfere
through it), `--out <dir>`. Output goes to a fresh temporary folder, removed after a pass and **kept (path printed) after any
failure**. No APK is built and nothing is signed.

## 4. What the assertions prove

From the source map's module list (paths normalised to `/`):

| | Public | Admin |
|---|---|---|
| Must be present | `adminModule.public.js`; `RootNavigator`, `AuthNavigator`, `UserNavigator`, `PanditNavigator`, `PanditGateNavigator`; `PanditEarningsScreen`; shared `DashboardChart.jsx`; `roleSupport.js`; `authStore.js` | the same shared set; the real `adminModule.js`; `AdminNavigator`; `AdminDrawerContent`; every Admin screen the navigator registers (read from its source); `@react-navigation/drawer` |
| Must be absent | any `src/screens/admin/`; any path containing `AdminNavigator` or `AdminDrawerContent`; `src/components/admin/`; `@react-navigation/drawer`; the real `adminModule.js` | `adminModule.public.js` |

From the bundle text: the Admin request paths `/admin/bookings`, `/admin/system-health`, `/admin/broadcast` and
`/admin/activity-feed` (string literals survive minification) must be absent from Public and present in Admin.

The script exits non-zero, naming the variant and the module or string, if bundling fails, a source map is missing or
unreadable, anything forbidden is present or anything required is missing. It prints "PASSED" only when every check passed.
`variantBundleVerifier.test.js` feeds it synthetic module lists to prove each of those failure paths.

Results when this was implemented (Windows, Expo SDK 51.0.39, Metro 0.80.12): Public bundle 2,771 modules and no Admin module,
Admin bundle 2,817 modules with all 20 Admin screens. Safeguards were also removed one at a time to confirm they bite: with
only the blocklist, the Public bundle fails to build ("Unable to resolve" the Admin navigator imported by the real seam); with
neither safeguard, the Public bundle builds with 2,811 modules and the verifier reports 10 failures.

## 5. What this does not prove or do

- JavaScript bundle composition only. Not verified: Android package IDs, Hermes bytecode in an APK, APK signing, merged
  manifests, device behavior, or any backend authorization. Excluding Admin code reduces what the Public app contains; the
  backend remains the security boundary.
- Not covered by this document (covered from Phase 3 on, in `docs/PUBLIC_PRIVATE_BUILD_GUIDE.md`): Gradle product flavors,
  `com.zutsav.app` / `com.zutsav.app.admin`, labels, icons, URL schemes, flavor-aware signing guards and release tasks, passing
  the variant from a flavor to the bundler, separate signing, APK and manifest inspection. Two-app device testing is still
  pending (no device was available).
- The Jest suites run against the full source tree (the Admin-enabled behaviour); Jest does not use Metro's configuration.
