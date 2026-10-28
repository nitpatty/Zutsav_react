import fs from 'fs';
import path from 'path';

// Static guards for the committed native project (android/ is the source of truth for builds — `app.json` is NOT
// applied while android/ exists). These do not compile anything: see docs/ANDROID_RELEASE_AND_MAPS.md for what was
// and was not verified with a real Gradle build.
const root = path.join(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const mainManifest = () => read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
const debugManifest = () => read('android', 'app', 'src', 'debug', 'AndroidManifest.xml');
const gradle = () => read('android', 'app', 'build.gradle');
const releaseBlock = () => {
  const g = gradle();
  const start = g.indexOf('release {', g.indexOf('buildTypes {'));
  return g.slice(start, g.indexOf('}', g.indexOf('crunchPngs', start)));
};

describe('release manifest hardening (F-24)', () => {
  it('release builds do not permit cleartext HTTP; only the debug overlay does (dev server / LAN backend)', () => {
    expect(mainManifest()).toMatch(/android:usesCleartextTraffic="false"/);
    expect(mainManifest()).not.toMatch(/usesCleartextTraffic="true"/);
    expect(debugManifest()).toMatch(/android:usesCleartextTraffic="true"/);
  });

  it('app data is not backed up or transferred (session token, cached account data, cart)', () => {
    const m = mainManifest();
    expect(m).toMatch(/android:allowBackup="false"/);
    expect(m).toMatch(/android:fullBackupContent="@xml\/backup_rules"/);
    expect(m).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/);
    for (const f of ['backup_rules.xml', 'data_extraction_rules.xml']) {
      const xml = read('android', 'app', 'src', 'main', 'res', 'xml', f);
      for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) expect(xml).toMatch(new RegExp(`<exclude domain="${domain}"`));
      expect(xml).not.toMatch(/<include /);
    }
    expect(read('android', 'app', 'src', 'main', 'res', 'xml', 'data_extraction_rules.xml')).toMatch(/<device-transfer>/);
  });

  it('does not request microphone or draw-over-other-apps in the release manifest', () => {
    expect(mainManifest()).not.toMatch(/RECORD_AUDIO/);
    expect(mainManifest()).not.toMatch(/SYSTEM_ALERT_WINDOW/);
    // React Native's debug overlay still works in debug builds:
    expect(debugManifest()).toMatch(/SYSTEM_ALERT_WINDOW/);
  });

  it('keeps every permission the app actually uses', () => {
    const m = mainManifest();
    for (const p of ['INTERNET', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'RECEIVE_BOOT_COMPLETED', 'VIBRATE']) {
      expect(m).toContain(`android.permission.${p}`);
    }
  });

  it('is not debuggable and exports only the launcher activity', () => {
    const m = mainManifest();
    expect(m).not.toMatch(/android:debuggable="true"/);
    const exported = [...m.matchAll(/<(activity|service|receiver|provider)\b[^>]*android:exported="true"[^>]*>/g)].map((x) => x[0]);
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatch(/\.MainActivity/);
  });

  it('app.json mirrors the permission and backup decisions for anyone who regenerates the native project', () => {
    const cfg = JSON.parse(read('app.json')).expo;
    expect(cfg.android.allowBackup).toBe(false);
    const picker = cfg.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
    expect(picker[1].microphonePermission).toBe(false);
    expect(cfg.android.permissions).not.toContain('RECORD_AUDIO');
  });
});

describe('release signing (F-24)', () => {
  it('the release build type is never signed with the debug keystore', () => {
    expect(releaseBlock()).not.toMatch(/signingConfigs\.debug/);
    expect(releaseBlock()).toMatch(/signingConfig releaseSigningProvided \? signingConfigs\.release : null/);
  });

  it('debug builds keep the debug keystore', () => {
    expect(gradle()).toMatch(/debug \{\s*signingConfig signingConfigs\.debug/);
  });

  it('release credentials come from the environment / Gradle properties, never from the repository', () => {
    const g = gradle();
    for (const name of ['ZUTSAV_RELEASE_STORE_FILE', 'ZUTSAV_RELEASE_STORE_PASSWORD', 'ZUTSAV_RELEASE_KEY_ALIAS', 'ZUTSAV_RELEASE_KEY_PASSWORD']) expect(g).toContain(`'${name}'`);
    expect(g).toMatch(/System\.getenv\(name\) \?: findProperty\(name\)/);
    // the only literal passwords allowed in the file are the standard public debug-keystore ones
    expect([...g.matchAll(/(?:storePassword|keyPassword)\s+'([^']*)'/g)].map((m) => m[1])).toEqual(['android', 'android']);
  });

  it('packaging a release without signing is refused with an explanatory error', () => {
    const g = gradle();
    expect(g).toMatch(/gradle\.taskGraph\.whenReady/);
    expect(g).toMatch(/throw new GradleException/);
    expect(g).toMatch(/never signed with the debug keystore/);
  });

  it('no keystore or credentials file is tracked or newly added', () => {
    const tracked = fs.readdirSync(path.join(root, 'android', 'app'));
    expect(tracked.filter((f) => /\.(jks|keystore|p12)$/i.test(f))).toEqual(['debug.keystore']);
    expect(fs.existsSync(path.join(root, 'credentials.json'))).toBe(false);
  });
});

// Day 28: a standalone INTERNAL build for testing against a backend on the local Wi-Fi. The HTTP exception must live only in
// the `localTest` build type's own source set and be limited to one private LAN host; production `release` stays HTTPS-only.
describe('local-network testing variant (isolated from release)', () => {
  const localManifest = () => read('android', 'app', 'src', 'localTest', 'AndroidManifest.xml');
  const nsc = () => read('android', 'app', 'src', 'localTest', 'res', 'xml', 'network_security_config_localtest.xml');
  const localTestBlock = () => {
    const g = gradle();
    const start = g.indexOf('localTest {', g.indexOf('buildTypes {'));
    return g.slice(start, g.indexOf('}', start));
  };

  it('production is untouched: main manifest has no network-security-config and still forbids cleartext; release/debug/main sources gained nothing', () => {
    expect(mainManifest()).toMatch(/android:usesCleartextTraffic="false"/);
    expect(mainManifest()).not.toMatch(/networkSecurityConfig/);
    expect(mainManifest()).not.toMatch(/usesCleartextTraffic="true"/);
    expect(fs.existsSync(path.join(root, 'android', 'app', 'src', 'release'))).toBe(false);
    expect(releaseBlock()).not.toMatch(/localTest|networkSecurityConfig|cleartext/i);
    expect(fs.readdirSync(path.join(root, 'android', 'app', 'src', 'main', 'res', 'xml')).sort()).toEqual(['backup_rules.xml', 'data_extraction_rules.xml']);
  });

  it('the variant manifest only points at its own network-security-config (it does not flip the global cleartext flag)', () => {
    expect(localManifest()).toMatch(/android:networkSecurityConfig="@xml\/network_security_config_localtest"/);
    expect(localManifest().replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/usesCleartextTraffic/);
  });

  it('cleartext is permitted to exactly one private LAN address and nothing else', () => {
    const xml = nsc().replace(/<!--[\s\S]*?-->/g, '');
    expect(xml).toMatch(/<base-config cleartextTrafficPermitted="false"\s*\/>/);
    const permitted = [...xml.matchAll(/<domain-config cleartextTrafficPermitted="true">([\s\S]*?)<\/domain-config>/g)];
    expect(permitted).toHaveLength(1);
    const domains = [...permitted[0][1].matchAll(/<domain includeSubdomains="false">([^<]+)<\/domain>/g)].map((m) => m[1].trim());
    expect(domains).toHaveLength(1);
    expect(domains[0]).toMatch(/^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/);
    expect(xml).not.toMatch(/includeSubdomains="true"|<certificates|debug-overrides/);
  });

  it('is signed like release (never the debug key) and its packaging tasks are covered by a refusing guard', () => {
    expect(localTestBlock()).toMatch(/initWith release/);
    expect(localTestBlock()).toMatch(/signingConfig releaseSigningProvided \? signingConfigs\.release : null/);
    expect(localTestBlock()).not.toMatch(/signingConfigs\.debug/);
    const g = gradle();
    expect(g).toMatch(/'assembleLocalTest'/);
    expect(g).toMatch(/never signed with the debug keystore/);
    expect(g).toMatch(/network_security_config_localtest\.xml/);
  });

  it('the variant is marked in its version name and carries no keystore or credentials', () => {
    expect(localTestBlock()).toMatch(/versionNameSuffix '-localtest'/);
    const files = [];
    (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(e.name); }); }(path.join(root, 'android', 'app', 'src', 'localTest')));
    expect(files.sort()).toEqual(['AndroidManifest.xml', 'network_security_config_localtest.xml']);
  });
});

// Zutsav's map provider is Ola Maps, used ONLY by the backend (place search / geocoding proxy, /api/location/*) with
// credentials held server-side. The app ships no map or place-search key, and no Google Maps configuration.
describe('map provider configuration (F-16 — Ola Maps is server-side only)', () => {
  it('has no Google Maps configuration in the native project or Expo config', () => {
    expect(mainManifest()).not.toMatch(/com\.google\.android\.geo\.API_KEY/);
    expect(debugManifest()).not.toMatch(/com\.google\.android\.geo\.API_KEY/);
    expect(gradle()).not.toMatch(/googleMapsApiKey|GOOGLE_MAPS|manifestPlaceholders/);
    expect(read('app.json')).not.toMatch(/googleMaps|GOOGLE_MAPS/i);
    expect(read('eas.json')).not.toMatch(/GOOGLE_MAPS|MAPS_ENABLED/);
    expect(read('.env.example')).not.toMatch(/GOOGLE_MAPS|MAPS_ENABLED/);
    expect(read('src', 'config', 'env.js')).not.toMatch(/MAPS_ENABLED/);
  });

  it('ships no Ola Maps credential in the app (they belong in the backend environment)', () => {
    for (const f of ['app.json', 'eas.json', '.env.example', 'android/app/build.gradle', 'android/gradle.properties',
      'android/app/src/main/AndroidManifest.xml', 'src/config/env.js']) {
      expect(read(...f.split('/'))).not.toMatch(/OLA_MAPS_(API_KEY|CLIENT_ID|CLIENT_SECRET)\s*=\s*\S/);
    }
    expect(read('.env.example')).toMatch(/NO map or place-search key in the app/);
    expect(read('src', 'services', 'geocodingService.js')).toMatch(/no\s*\*?\s*vendor key ever reaches the app/);
  });

  it('place search and reverse geocoding go through the backend proxy, never an Ola host directly', () => {
    const svc = read('src', 'services', 'geocodingService.js');
    expect(svc).toMatch(/api\.get\('\/location\/autocomplete'/);
    expect(svc).not.toMatch(/olamaps|olakrutrim/i);
  });

  it('no Google API key is committed in any config, source or example file', () => {
    const googleKey = /AIza[0-9A-Za-z_-]{30,}/;
    const files = ['app.json', 'eas.json', '.env.example', 'android/app/build.gradle', 'android/gradle.properties',
      'android/app/src/main/AndroidManifest.xml', 'android/app/src/debug/AndroidManifest.xml', 'src/config/env.js'];
    for (const f of files) expect(read(...f.split('/'))).not.toMatch(googleKey);
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? (e.name === '__tests__' ? [] : walk(p)) : /\.(jsx?|json)$/.test(e.name) ? [p] : [];
    });
    for (const f of walk(path.join(root, 'src'))) expect(fs.readFileSync(f, 'utf8')).not.toMatch(googleKey);
  });

  it('no map/vendor key can reach the JS bundle through EXPO_PUBLIC_', () => {
    expect(read('.env.example')).not.toMatch(/EXPO_PUBLIC_[A-Z_]*(API_KEY|MAPS)/);
    expect(JSON.stringify(JSON.parse(read('app.json')).expo.android.config || {})).not.toMatch(/apiKey/i);
  });

  it('the only embedded map is MapPicker, which is gated on the availability helper (Android never mounts it)', () => {
    const importers = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); }
      else if (/\.jsx?$/.test(e.name) && /from 'react-native-maps'/.test(fs.readFileSync(p, 'utf8'))) importers.push(path.relative(root, p).replace(/\\/g, '/'));
    });
    walk(path.join(root, 'src'));
    expect(importers).toEqual(['src/components/shared/MapPicker.jsx']);
    expect(read('src', 'components', 'shared', 'MapPicker.jsx')).toMatch(/isEmbeddedMapAvailable\(\)/);
  });
});
