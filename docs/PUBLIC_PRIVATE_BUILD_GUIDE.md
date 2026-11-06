# Public and Private (Admin) Android apps: build guide

Scope: `mobile-app/` (one React Native codebase, one backend). Background: `docs/PUBLIC_PRIVATE_APP_ARCHITECTURE_AUDIT.md`;
the Metro side and the bundle-composition proof: `docs/PUBLIC_PRIVATE_BUILD_VERIFICATION.md`.

## 1. The two apps

| | Public Zutsav | Private Zutsav Admin |
|---|---|---|
| Gradle flavor | `publicApp` | `adminApp` |
| Application ID | `com.zutsav.app` | `com.zutsav.app.admin` (`applicationIdSuffix ".admin"`) |
| Launcher label | `Zutsav` | `Zutsav Admin` |
| Launcher icon | existing Zutsav icon (unchanged, `src/main/res`) | the same artwork plus a navy shield-and-check badge (`src/adminApp/res`) |
| Roles that can sign in | `user`, `pandit` | `user`, `pandit`, `admin`, `system_admin` |
| Admin / System Admin login | rejected with the approved message; no token stored | works |
| Admin code in the JS bundle | none (Metro variant `public`) | all of it (Metro variant `admin`) |
| Custom URL scheme | `zutsav://` (the registration link `zutsav://register?ref=CODE`) and `com.zutsav.app://` | `zutsavadmin://` and `com.zutsav.app.admin://` |
| Production signing variables | `ZUTSAV_PUBLIC_RELEASE_*` | `ZUTSAV_ADMIN_RELEASE_*` |
| Distribution | the fresh Public APK given to the client for testing | direct APK to the client (initially) |

Both install side by side. The Android `namespace` stays `com.zutsav.app` for both (only the installed `applicationId`
differs), so no Kotlin/Java file moved. Version code and name are unchanged (`1` / `1.0.0`). Because the two apps have different
package IDs, **each keeps its own, independent `versionCode` history**: bump the Public one only for a Public distribution and the
Admin one only for an Admin distribution (both live in `android/app/build.gradle` `defaultConfig`; a per-flavor value can be
added there when they first need to diverge).

Build variants (flavor x build type), all verified to exist as Gradle tasks: `publicAppDebug`, `adminAppDebug`,
`publicAppRelease`, `adminAppRelease`, `publicAppLocalTest`, `adminAppLocalTest`. The build types are unchanged: `debug`,
`release`, `localTest` (release + a cleartext exception for one LAN host, internal QA only).

## 2. How a flavor gets the right JavaScript (the important part)

Two variables, both set for the **bundler's child process**, not for Gradle:

| Variable | Role |
|---|---|
| `ZUTSAV_APP_VARIANT` (`public` / `admin`) | Metro module selection: which Admin files exist in the bundle. The security-relevant one (Phase 2). |
| `EXPO_PUBLIC_APP_VARIANT` (`public` / `admin`) | Inlined by Expo; client configuration only (the deep-link scheme in `src/config/appVariant.js`). **Not** a security boundary. |

The React Native Gradle plugin runs `node <cli> export:embed ...` through `project.exec`, which has no per-task environment, so a
variable assigned inside `build.gradle` never reaches Metro. Instead, each `createBundle<Variant>JsAndAssets` task is pointed at
`scripts/gradle-bundle.js` with `--zutsav-app-variant <public|admin>`. That script sets both variables for the real Expo CLI child
process and passes every other argument through unchanged. Three safety nets:

1. **Ordering.** The override is applied in `afterEvaluate` with `tasks.named(...).configure`, after the React Native plugin has
   configured its own task. (A first version registered the override too early and was silently overwritten: the Admin flavor
   then bundled the Public stub. The bundle verification below is what caught it.)
2. **Conflicts are refused.** If the environment already says `ZUTSAV_APP_VARIANT=admin` while the Public flavor is being built
   (or the reverse), the wrapper stops instead of overriding.
3. **Marker.** After a successful bundle the wrapper writes `zutsav-variant.txt` (`variant=<v>`) beside the intermediate source map;
   the Gradle task fails if it is missing or names a different variant, so a task that skipped the wrapper cannot leave a bundle of
   unknown variant for packaging. An unmapped flavor, or a variant with no bundle task, also fails the build.

The flavored debug variants are listed in `debuggableVariants` so they keep loading JavaScript from Metro (otherwise the plugin
would treat them as release-like and embed a bundle). For debug, the variant therefore comes from **the Metro server you start**:
use `npm run start:public` / `npm run start:admin`.

## 3. Commands

All of these are cross-platform (Windows PowerShell, CMD, macOS/Linux): they are thin Node wrappers, there is no `VAR=value cmd`
syntax and no added dependency. Run them from `mobile-app/`.

| Goal | Command | Gradle task it runs |
|---|---|---|
| Public dev server | `npm run start:public` (a plain `npm start` is also Public: the safe default) | none (Expo CLI) |
| Admin dev server | `npm run start:admin` | none (Expo CLI) |
| Install Public debug on a device/emulator, then start Metro | `npm run android:public` (`npm run android` = the same) | `installPublicAppDebug` |
| Install Admin debug, then start Metro | `npm run android:admin` | `installAdminAppDebug` |
| Public debug APK | `npm run build:public:debug` | `assemblePublicAppDebug` |
| Admin debug APK | `npm run build:admin:debug` | `assembleAdminAppDebug` |
| Public QA (localTest) APK | `npm run build:public:localtest` | `assemblePublicAppLocalTest` |
| Admin QA (localTest) APK | `npm run build:admin:localtest` | `assembleAdminAppLocalTest` |
| Public release APK | `npm run build:public:release` | `assemblePublicAppRelease` |
| Admin release APK | `npm run build:admin:release` | `assembleAdminAppRelease` |
| Public / Admin release AAB | `npm run build:public:release-aab` / `npm run build:admin:release-aab` | `bundlePublicAppRelease` / `bundleAdminAppRelease` |

Running Gradle directly is equally correct, because the flavor tasks set the bundler variant themselves:
`cd android && ./gradlew :app:assembleAdminAppRelease` (`gradlew.bat` on Windows).

What **not** to do:

- Do not use plain `expo run:android`. With flavors there is no variant named `debug` any more: Expo's default would run
  `assembleDebug` (which builds **both** flavors) and then look for `android/app/build/outputs/apk/debug/app-debug.apk`, a path
  the flavored build no longer writes. If an old pre-flavor build is still on disk, that **stale APK is what gets installed**; if
  it is not, Expo falls back to `installDebug`, which Gradle rejects as ambiguous. (Established from the Expo CLI source, the
  Gradle task list and the leftover file; the command itself was not run.) Use the `android:*` scripts. `npm run android` now
  runs the Public wrapper instead of `expo run:android`. Developers who built before the flavors existed should delete the old
  `android/app/build/outputs/apk/{debug,release,localTest}/` files so nothing stale can be picked up.
- `./gradlew assembleRelease`, `bundleRelease`, `assembleLocalTest` build **both** flavors. They are guarded (below) and fail
  unless both identities are configured; prefer the flavor-specific task.
- Do not export `ZUTSAV_APP_VARIANT` yourself for a Gradle build; it is set per flavor, and a conflicting value is refused.

Selecting Admin is always explicit. Nothing ever infers Admin; an unset or unrecognized value is Public (or, for
`ZUTSAV_APP_VARIANT`, an error).

### Running both apps against their own Metro at the same time

A debug APK has its Metro port baked in (Android resource `react_native_dev_server_port`, set per flavor in
`android/app/build.gradle`), and one Metro server serves one module graph. So the two apps use different ports:

| App | Metro port | Start it with |
|---|---|---|
| Public (`com.zutsav.app`) | **8081** | `npm run start:public` |
| Admin (`com.zutsav.app.admin`) | **8082** | `npm run start:admin` |

- Both servers can run together; each app finds its own. Verified: the Public Metro served 2,880 modules with no Admin screens,
  navigator or endpoints and the Public stub; the Admin Metro served the Admin modules and no stub; each injected its own
  `EXPO_PUBLIC_APP_VARIANT` into its bundle.
- `npm run android:public|admin` installs that flavor's debug APK, runs `adb reverse tcp:<port> tcp:<port>` for its port, then
  starts its Metro. The port cannot be overridden (`--port` is refused), because the APK would not look there.
- A Metro command **refuses to start if its port is already listening** (it could be the other variant, or an old process), with
  a clear message. Stop the old server first. This works from PowerShell, CMD and Unix shells (the wrappers are Node scripts).
- On an Android **emulator** the app reaches the host as `10.0.2.2:<port>`; on a physical device `adb reverse` is what makes
  `localhost:<port>` work. The debug app also reads `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_BASE_URL` when Metro **starts**: those come
  from `mobile-app/.env` unless the shell already sets them (shell wins). Check where they point before logging in.
- Changing a flavor's port needs a rebuild of that debug APK.

### QA (localTest) builds

`localTest` is the existing internal build for a backend on the local Wi-Fi. It needs, in addition to its signing identity (section
4), `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_BASE_URL` set to `http://` URLs on the host named in
`android/app/src/localTest/res/xml/network_security_config_localtest.xml`. The cleartext exception exists only in that build
type's own source set; it is never merged into `release` (checked in the merged manifests, section 6).

## 4. Signing

The client arranges the signing keys. Public and Admin have **separate, owner-controlled production identities**, plus a third,
internal identity for `localTest`. Each is four variables, read from the environment or from Gradle properties
(`~/.gradle/gradle.properties`). Keep keystores and passwords **outside the repository**; never put them in JavaScript, Android
resources, `app.json`, `eas.json` or this folder.

| Identity | Used by | Variables |
|---|---|---|
| Public production | `publicAppRelease` (APK and AAB) | `ZUTSAV_PUBLIC_RELEASE_STORE_FILE`, `_STORE_PASSWORD`, `_KEY_ALIAS`, `_KEY_PASSWORD` |
| Admin production | `adminAppRelease` (APK and AAB) | `ZUTSAV_ADMIN_RELEASE_STORE_FILE`, `_STORE_PASSWORD`, `_KEY_ALIAS`, `_KEY_PASSWORD` |
| Internal testing | `publicAppLocalTest`, `adminAppLocalTest` | `ZUTSAV_LOCALTEST_STORE_FILE`, `_STORE_PASSWORD`, `_KEY_ALIAS`, `_KEY_PASSWORD` |

**The old `ZUTSAV_RELEASE_*` names are no longer read by anything.** They were the generic release identity, and in practice they
held the throwaway internal-testing key used for `assembleLocalTest`. That key must not become a production key, and must not be
reused for the Admin app, so it is not silently reinterpreted: to keep using it for QA builds, set the `ZUTSAV_LOCALTEST_*`
variables to the same values deliberately. Never assign it to `ZUTSAV_ADMIN_RELEASE_*` or `ZUTSAV_PUBLIC_RELEASE_*`.

### How the release guards work

`android/app/build.gradle` has three signing configs (`publicRelease`, `adminRelease`, `localTest`) that always exist but are only
**filled** when all four of their variables are provided; an empty one cannot sign. Each flavor is bound to its own
(`publicApp` -> `publicRelease`, `adminApp` -> `adminRelease`), `localTest` is always bound to `localTest` (never `null`, so a
production key cannot be inherited), and `debug` keeps the debug keystore.

When the task graph is ready, every task that can produce an installable or distributable artifact of a `release` or `localTest`
variant (`assemble`, `bundle`, `package`, `install`, `sign`, `validateSigning` ... for APK and AAB, matched by the variant name in
the task name) must pass:

1. the variant is bound to **its own** signing config (not another flavor's, not debug);
2. all four of that identity's variables are present;
3. its keystore path is an existing file.

Otherwise the build stops **before** producing anything, naming the missing variables (never their values). A release-like task
for a variant the build does not know (a new flavor, a renamed task) is refused too, so it cannot bypass the guard. Aggregate
tasks (`assembleRelease`) depend on the per-variant tasks, so they are covered: they need both identities. Debug variants are
never guarded and are never production artifacts. There is no fallback from one identity to another, to the debug keystore, or to
a shared key.

EAS managed signing is **not** wired for the flavored build (the old guard accepted EAS's injected `release` config; the new
identities are named per flavor and `eas.json` was not changed). Build the APKs locally as above.

## 5. Which artifacts may go to whom

| Artifact | Signing | Who may use it |
|---|---|---|
| `publicAppDebug`, `adminAppDebug` APK | Android debug key (public) | developers only |
| `publicAppLocalTest`, `adminAppLocalTest` APK | internal-testing key | developers and internal QA on the LAN only; never the client's final APK |
| `publicAppRelease` APK/AAB | the **Public production key** | the client's Public test APK / store upload |
| `adminAppRelease` APK | the **Admin production key** | the client, directly (initially) |

Only a `release` artifact signed by the right owner-controlled key is a distribution artifact. A debug or `localTest` APK must
never be sent to the client as the final build.

**Fresh-install policy for the Public client test APK.** The Public release is signed by a different key than any earlier
Zutsav build on a device (the earlier builds used the debug or a throwaway key), and Android refuses to update an app with a
different signature. Tell testers to **uninstall any previous Zutsav build first** (this wipes that old app's local data), then
install the new one. Do not do this on a device you do not own without permission.

## 6. Verifying what was built

Static tests run with `npm run test:ci` (`src/config/__tests__/androidFlavors.test.js`, `androidArtifacts.test.js`,
`androidRelease.test.js`, plus the Phase 1 and 2 suites). They read the committed files and exercise the Node wrappers for real,
but they compile nothing. Real-tooling checks:

| Command | What it proves | Needs |
|---|---|---|
| `npm run verify:variants` | Phase 2: real Metro production bundles, per variant, from the module list | Node only |
| `npm run verify:gradle-bundles` | **Gradle -> Metro**: runs each flavor's actual `createBundle<Variant>JsAndAssets` task, then checks the source map and the embedded Hermes bundle Gradle produced (Admin modules absent from Public, all present in Admin, the right scheme literal) | JDK, Android SDK, Gradle cache |
| `npm run verify:android-guards` | real Gradle dry runs prove the release guards (each flavor needs its own identity, no cross-flavor or legacy fallback, debug unaffected, localTest separate). Placeholders only, nothing built or signed | JDK, Gradle cache |
| `npm run verify:android-manifests` | merged manifests of all six variants (package, schemes, authorities namespaced by application ID and not shared, backup, cleartext only in debug, LAN network-security-config only in `localTest`, permissions). Run `:app:process<Variant>MainManifest` first | built manifests |
| `node scripts/verify-android-artifacts.js apk <file.apk> <variant>` | a built APK: package, label, version, debuggable, flags, schemes, authorities, **signing certificate SHA-256**, file SHA-256 | Android SDK build-tools (`apkanalyzer`, `aapt2`, `apksigner`) |

Manual spot checks with the SDK tools (`<sdk>/build-tools/<ver>`): `aapt2 dump badging app.apk` (package, label),
`apksigner verify --print-certs app.apk` (signer fingerprint; compare it with the owner's expected fingerprint), and
`sha256sum app.apk`.

**Bundle verification is not APK verification, and neither is device verification.** The module-list and bundle checks prove which
JavaScript was built. Only an inspected APK proves package ID, label, signing and manifest, and only a device proves launch,
login, deep links and the native integrations.

## 7. Side-by-side installation (when a device is available)

```
adb install -r path/to/Public.apk          # com.zutsav.app
adb install -r path/to/Admin.apk           # com.zutsav.app.admin
adb shell pm list packages | findstr zutsav
```

Do not run `adb uninstall` or `pm clear` on a device holding data you need. Expected: two launcher entries, "Zutsav" and "Zutsav
Admin" (badged icon); `adb shell am start -a android.intent.action.VIEW -d "zutsav://register?ref=TEST"` opens only the Public
app; `zutsavadmin://` opens only the Admin app; the Admin app's `FileProvider` / `ImagePicker` authorities are prefixed with its own
application ID, so neither install fails with a provider conflict.

## 8. What this does and does not protect

- The Private Admin APK is distributed directly. **Anyone who obtains it can reverse-engineer it** (unpack, read the bundle, find
  the endpoints it calls). Neither APK signing, nor splitting the apps, nor obfuscation prevents that.
- **The backend is the real authorization boundary.** Whether an Admin API call is allowed is decided by the server, per request,
  from the account's role. The APK split removes Admin screens from the public download and makes the Public app refuse Admin
  logins; it does **not** fix weak Admin account authentication (OTP-only Admin login, no MFA or lockout, uneven auditing) or any
  backend vulnerability. That hardening is a separate workstream (see the audit, sections on backend security).
- Role rejection in the Public app is a convenience and a hygiene measure (no Admin token is persisted), not a security control.

## 9. What was verified when this was implemented (Windows, JDK 17, Gradle 8.6, AGP 8.2.1, Expo SDK 51, RN 0.74.5)

| Check | Result |
|---|---|
| Gradle tasks | all six variants exist (`publicApp`/`adminApp` x `debug`/`release`/`localTest`); debug assemble tasks run |
| `npm run verify:gradle-bundles` | Public: the wrapper reported `public`, Gradle's source map lists 2,711 modules, no Admin module, none of the Admin endpoint strings or `zutsavadmin` in the Hermes bundle. Admin: the wrapper reported `admin`, 2,757 modules, the real seam, `AdminNavigator`, `AdminDrawerContent`, all 20 Admin screens, the drawer library, the endpoint strings and `zutsavadmin` present, the Public stub absent |
| Wiring failure that was found and fixed | the first wiring was overwritten by the React Native plugin: the Admin flavor produced a byte-identical Public bundle and the wrapper never ran. Caught by this verification, then fixed (section 2). With the wrapper bypassed, Gradle now fails the bundle task because the stock Expo CLI rejects the extra `--zutsav-app-variant` flag |
| `npm run verify:android-guards` | 41 real Gradle dry-run cases, all as expected (placeholders only, nothing built or signed): no credentials -> every release/AAB/localTest task refused, naming only variable names; Public credentials never unlock Admin and the reverse; the legacy `ZUTSAV_RELEASE_*` names and the localTest identity unlock nothing in production; both production identities -> aggregate `assembleRelease`/`bundleRelease` accepted; a non-file keystore path and an incomplete identity refused; debug accepted |
| `npm run verify:android-manifests` | merged manifests of all six variants pass: package = application ID, schemes disjoint, seven provider authorities per app all prefixed with the app's own ID and none shared, `allowBackup=false`, cleartext only in debug, the LAN network-security-config only in the two `localTest` variants |
| Built APKs | `publicAppDebug` and `adminAppDebug` only (see below) |
| `npm run verify:variants` | Phase 2 verifier still passes with both variables set: Public 2,772 modules, Admin 2,818 |
| `npm run test:ci` | 111 suites, 2,400 tests passed |

Built and inspected (aapt2 + apksigner from build-tools; `apkanalyzer` is not installed on this machine, so the manifest was
decoded with `aapt2 dump xmltree`):

| | `app-publicApp-debug.apk` | `app-adminApp-debug.apk` |
|---|---|---|
| Type | debug, debug-signed (developer only) | debug, debug-signed (developer only) |
| Package / label | `com.zutsav.app` / "Zutsav" | `com.zutsav.app.admin` / "Zutsav Admin" |
| Version | 1 / 1.0.0 | 1 / 1.0.0 |
| Schemes | `zutsav`, `com.zutsav.app` | `zutsavadmin`, `com.zutsav.app.admin` |
| Launcher PNGs (xxxhdpi) in the APK | byte-identical to `src/main` | byte-identical to `src/adminApp`, different from Public |
| Signer | `CN=Android Debug`, SHA-256 `fac61745dc09...3b9c` (the public debug key) | the same debug key |
| SHA-256 | `6650c24dc4cfd8889067826fda1a3e83fb055405566f6a686aca721edbf56ced` | `9906ab2f9b1ba5a7bc08b54051b5e72708fb67f96ba9fe3bf79999813d3c87f5` |

Emulator (`Pixel_6`, Android 13, started `-read-only` so nothing persists): both debug APKs installed side by side with no
provider conflict; two launcher entries "Zutsav" and "Zutsav Admin" with different icons; `zutsav://` resolved only to
`com.zutsav.app`, `zutsavadmin://` only to `com.zutsav.app.admin`, no chooser; both apps start with no fatal exception.

**Not done, and why:**

- No `localTest` or `release` APK/AAB exists: no `ZUTSAV_LOCALTEST_*`, `ZUTSAV_PUBLIC_RELEASE_*` or `ZUTSAV_ADMIN_RELEASE_*`
  credentials were available and none were generated. For those variants the Gradle bundle, manifest and resource steps were
  verified; **packaging, signing certificates and APK contents were not**. Old files `app-debug.apk`, `app-release.apk`,
  `app-localTest.apk` in `app/build/outputs/apk/` predate the flavors: do not use them.
- Login, role routing, session isolation, notifications, PDF/share/image-picker behavior were **not** tested on a device: the debug
  APKs need Metro, and logging in needs a backend and accounts that were not used (no production API calls were made).

## 10. Authentication, session isolation and native-integration verification (closeout)

Run on a `Pixel_6` AVD (Android 13) started `-read-only` (a disposable overlay: nothing persists on the saved AVD), with the
**current** debug APKs (`publicAppDebug` -> `com.zutsav.app`, `adminAppDebug` -> `com.zutsav.app.admin`; debug-signed,
developer-only), two Metro servers (8081 Public, 8082 Admin), and a **throwaway local QA backend**: the real backend code on
port 5055 against a new database that was created for the run and deleted afterwards, with every third-party credential
blanked, so no WhatsApp/email/payment/SMS/map call could be made. The app's `.env` points at a LAN dev host; the QA run overrode
it from the shell. No production service was contacted. Accounts were six random-password QA accounts (user x2, approved
pandit, pending pandit, admin, system_admin) that existed only in that throwaway database.

| ID | App | Test | Result |
|---|---|---|---|
| P1 | Public | QA User login -> User navigator, session stored (`zutsav_token`, `zutsav_user`), restored after force-stop | PASS |
| P2 | Public | pending Pandit -> existing approval gate ("Application Submitted Successfully"), no route to the dashboard | PASS |
| P3 | Public | approved Pandit -> Pandit navigator (existing KYC banner), persisted after relaunch | PASS |
| R1 | Public | Admin account -> exact approved message, stays on login, **no** session keys stored, backend log shows `POST /auth/login 200` then `POST /auth/logout 200` (revocation attempted) | PASS |
| R2 | Public | System Admin account -> same message, nothing stored, same revocation | PASS |
| R4 | Public | relaunch after a rejected Admin login -> signed out, no User/Pandit/Admin screen, no stored session | PASS |
| D1 | Admin | QA Admin login -> Admin Dashboard with live QA data, drawer (Dashboard, Action Center, Global Search, Bookings, Orders, Refunds, Pandits, Users, Blogs, Communication, Referral Analytics, Analytics, ...) and the Users screen (read-only) load | PASS |
| D2 | Admin | Admin session restored after force-stop | PASS |
| A | both | User in Public + Admin in Admin app, both force-stopped and relaunched -> each restores only its own account | PASS |
| B | both | Pandit in Public + a different User in the Admin app -> neither restores the other's account | PASS |
| C | both | log out of Public -> Admin still signed in; log out of Admin -> Public's session keys untouched | PASS |
| D | both | rejected Public Admin/System Admin logins while the Admin app was signed in -> Admin app unchanged, its API calls still return 200 | PASS |
| N1 | both | PDF: on-demand tax invoice rendered, `expo-print` produced a valid one-page `%PDF-1.4` (about 150 KB), the system Print preview rendered all sections (company header, bill-to, booking, line items, totals, footer) | PASS (the company logo image is not shown: the QA database has no platform logo configured, so logo rendering is not verified) |
| N2 | both | Android share sheet opened with the PDF through each app's own FileProvider; Print read it (valid content URI) | PASS (the file was not sent anywhere: no recipient app was available) |
| N3 | both | image picker: system photo picker -> crop editor -> upload (200 against the QA backend) -> avatar updated, using a disposable test image | PASS |
| N4 | Admin | picker cancelled -> app stays up, no crash | PASS |
| N5 | Public | location permission: revoked, **denied** at the prompt -> no crash, picker usable; a second request after a final denial shows no dialog and nothing happens (no in-app hint: existing behavior); cleared and **retried/allowed** -> granted, no crash | PASS (one UX observation, below) |
| N6 | both | app resumes normally after the share sheet, print preview, picker and permission dialog; no `FATAL EXCEPTION`; no provider conflict (both installed, each with its own authorities) | PASS |
| L1 | both | `zutsav://` resolves only to Public, `zutsavadmin://` only to Admin; the Admin link started only the Admin app | PASS |
| L2 | Public | `zutsav://register?ref=QA123` cold start -> Register screen | PASS; the referral field was **empty** (defect, fixed: see below) |
| K1 | Public | KYC Verification opened from the Pandit profile and Back -> returns to the profile (Day 33 `initial: false` fix intact) | PASS |

**Defect found and fixed.** A deep link `zutsav://register?ref=CODE` delivers the code as `route.params.ref`, but `RegisterScreen`
only read `route.params.referralCode`, and the `global` fallback in `App.jsx` is set after the screen has already mounted on a cold
start, so the referral field was always empty. `RegisterScreen.jsx` now also accepts a text `ref` param (`referralCode` still wins,
empty/non-text values are ignored). Regression tests in `AuthScreens.i18n.test.jsx` fail without the fix; re-tested on the device:
the field shows the code. This predates Phase 3 (the screen and the linking logic are unchanged from `HEAD`).

**Second defect found and fixed: both apps wanted Metro on port 8081**, so two different Metro variants could not serve them at
once. Each flavor now carries its own port (section 3).

**Not verified, and why**

- Push notifications and notification channels: `POST_NOTIFICATIONS` was not granted on the AVD and no push provider is configured
  in the QA environment.
- Android share to an external app and receipt by that app (no recipient app; nothing was sent).
- PDF logo rendering (no platform logo in the QA database); the PDF was inspected through the system Print preview.
- Camera capture (the flows used offered only the photo picker); document picker; the KYC upload screen beyond opening it.
- Physical devices (none connected), other Android versions, release/localTest APKs (no signing credentials), production backend
  behavior, and anything that needs a real payment, OTP or WhatsApp delivery.
- The emulator ran with a read-only overlay over an AVD that already contained a `com.zutsav.app` from earlier manual testing; the
  fresh Public debug build replaced it in the overlay only. The saved AVD is unchanged.

**UX observations (existing behavior, not changed):** after a final location denial the app gives no hint that the user must
enable the permission in Android settings; the Public dev bundle served by Metro (`dev=true`) still contains the unfolded
`'zutsavadmin'` string in `src/config/appVariant.js` (the production bundle folds it away; verified by `npm run verify:gradle-bundles`).
