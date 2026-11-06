/**
 * @jest-environment node
 */
const { FLAVORS } = require('../../../build-config/androidVariants');
const { parseManifest, checkManifest, checkAuthorityCollisions, splitVariant, REQUIRED_PERMISSIONS } = require('../../../scripts/verify-android-artifacts');

// scripts/verify-android-artifacts.js decides pass/fail for MERGED manifests and built APKs (the real runs are described in
// docs/PUBLIC_PRIVATE_BUILD_GUIDE.md). These tests feed it synthetic manifests shaped like AGP's merged manifest to prove
// that every check actually fails when its property is wrong.
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function manifest(flavor, buildType, o = {}) {
  const f = FLAVORS[flavor];
  const debug = buildType === 'debug';
  const schemes = o.schemes || [f.scheme, f.applicationId];
  const authorities = o.authorities || [`${f.applicationId}.FileSystemFileProvider`, `${f.applicationId}.ImagePickerFileProvider`];
  const permissions = o.permissions || [...REQUIRED_PERMISSIONS, ...(debug ? ['SYSTEM_ALERT_WINDOW'] : [])];
  const app = [
    `android:label="${o.label || '@string/app_name'}"`,
    'android:icon="@mipmap/ic_launcher"',
    `android:allowBackup="${o.allowBackup === undefined ? 'false' : o.allowBackup}"`,
    `android:usesCleartextTraffic="${o.cleartext === undefined ? (debug ? 'true' : 'false') : o.cleartext}"`,
    ...(o.debuggable ? ['android:debuggable="true"'] : []),
    ...(o.nsc === undefined ? (buildType === 'localTest' ? ['android:networkSecurityConfig="@xml/network_security_config_localtest"'] : []) : (o.nsc ? [`android:networkSecurityConfig="${o.nsc}"`] : [])),
  ].join(' ');
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${o.package || f.applicationId}">
  ${permissions.map((p) => `<uses-permission android:name="android.permission.${p}"/>`).join('\n  ')}
  <application ${app}>
    <activity android:name="com.zutsav.app.MainActivity" android:exported="true">
      <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
      <intent-filter><action android:name="android.intent.action.VIEW"/>${schemes.map((s) => `<data android:scheme="${s}"/>`).join('')}</intent-filter>
    </activity>
    ${authorities.map((a) => `<provider android:name="x.Provider" android:authorities="${a}" android:exported="false"/>`).join('\n    ')}
  </application>
</manifest>`;
}

const VARIANTS = Object.keys(FLAVORS).flatMap((f) => ['debug', 'release', 'localTest'].map((bt) => [f, bt]));

describe('a correct merged manifest passes', () => {
  it.each(VARIANTS)('%s %s', (flavor, buildType) => {
    expect(checkManifest(`${flavor}${cap(buildType)}`, manifest(flavor, buildType))).toEqual([]);
  });
});

describe('each property is actually checked', () => {
  const check = (flavor, buildType, overrides) => checkManifest(`${flavor}${cap(buildType)}`, manifest(flavor, buildType, overrides));

  it('wrong package id', () => {
    expect(check('adminApp', 'release', { package: 'com.zutsav.app' }).join('\n')).toMatch(/package is "com\.zutsav\.app", expected com\.zutsav\.app\.admin/);
    expect(check('publicApp', 'release', { package: 'com.zutsav.app.admin' }).join('\n')).toMatch(/expected com\.zutsav\.app$/m);
  });

  it('backup allowed', () => {
    expect(check('publicApp', 'release', { allowBackup: 'true' }).join('\n')).toMatch(/allowBackup/);
  });

  it('cleartext in release or localTest (only debug may allow it)', () => {
    expect(check('adminApp', 'release', { cleartext: 'true' }).join('\n')).toMatch(/usesCleartextTraffic/);
    expect(check('publicApp', 'localTest', { cleartext: 'true' }).join('\n')).toMatch(/usesCleartextTraffic/);
    expect(check('publicApp', 'debug', { cleartext: 'false' }).join('\n')).toMatch(/debug is expected to allow cleartext/);
  });

  it('the LAN network-security-config in a release build, or missing from localTest', () => {
    expect(check('publicApp', 'release', { nsc: '@xml/network_security_config_localtest' }).join('\n')).toMatch(/only localTest may carry a network-security-config/);
    expect(check('adminApp', 'localTest', { nsc: '' }).join('\n')).toMatch(/localTest must carry the LAN network-security-config/);
  });

  it('a debuggable release', () => {
    expect(check('adminApp', 'release', { debuggable: true }).join('\n')).toMatch(/debuggable/);
  });

  it('Admin claiming Public\'s scheme or application-ID scheme, and Public claiming Admin\'s', () => {
    expect(check('adminApp', 'release', { schemes: ['zutsavadmin', 'com.zutsav.app.admin', 'zutsav'] }).join('\n')).toMatch(/registers the other app's scheme "zutsav"/);
    expect(check('adminApp', 'release', { schemes: ['zutsavadmin', 'com.zutsav.app'] }).join('\n')).toMatch(/registers the other app's scheme "com\.zutsav\.app"/);
    expect(check('publicApp', 'release', { schemes: ['zutsav', 'com.zutsav.app', 'zutsavadmin'] }).join('\n')).toMatch(/registers the other app's scheme "zutsavadmin"/);
    expect(check('publicApp', 'release', { schemes: ['com.zutsav.app'] }).join('\n')).toMatch(/VIEW schemes are/);
  });

  it('a provider authority that is not namespaced by the app\'s own application ID', () => {
    expect(check('adminApp', 'release', { authorities: ['com.zutsav.app.FileProvider'] }).join('\n')).toMatch(/not namespaced by com\.zutsav\.app\.admin/);
    expect(check('adminApp', 'release', { authorities: ['com.zutsav.app.admin.x', 'shared.authority'] }).join('\n')).toMatch(/"shared\.authority"/);
  });

  it('a missing required permission, RECORD_AUDIO anywhere, SYSTEM_ALERT_WINDOW outside debug', () => {
    expect(check('publicApp', 'release', { permissions: REQUIRED_PERMISSIONS.filter((p) => p !== 'CAMERA') }).join('\n')).toMatch(/missing permission CAMERA/);
    expect(check('publicApp', 'debug', { permissions: [...REQUIRED_PERMISSIONS, 'RECORD_AUDIO'] }).join('\n')).toMatch(/RECORD_AUDIO/);
    expect(check('adminApp', 'release', { permissions: [...REQUIRED_PERMISSIONS, 'SYSTEM_ALERT_WINDOW'] }).join('\n')).toMatch(/SYSTEM_ALERT_WINDOW/);
  });
});

describe('provider-authority collisions between the two apps', () => {
  const byVariant = (override = {}) => Object.fromEntries(VARIANTS.map(([f, bt]) => [`${f}${cap(bt)}`, manifest(f, bt, override[f] || {})]));

  it('none when each app namespaces its authorities by its own application ID', () => {
    expect(checkAuthorityCollisions(byVariant())).toEqual([]);
  });

  it('reports an authority both apps declare (they could not be installed side by side)', () => {
    const failures = checkAuthorityCollisions(byVariant({ publicApp: { authorities: ['shared.provider'] }, adminApp: { authorities: ['shared.provider'] } }));
    expect(failures).toHaveLength(3);
    expect(failures[0]).toMatch(/provider authority "shared\.provider" is declared by BOTH apps/);
  });
});

describe('helpers', () => {
  it('parseManifest reads package, flags, schemes, authorities and permissions', () => {
    const m = parseManifest(manifest('adminApp', 'localTest'));
    expect(m.package).toBe('com.zutsav.app.admin');
    expect(m.viewSchemes).toEqual(['com.zutsav.app.admin', 'zutsavadmin']);
    expect(m.authorities).toEqual(['com.zutsav.app.admin.FileSystemFileProvider', 'com.zutsav.app.admin.ImagePickerFileProvider']);
    expect(m.networkSecurityConfig).toBe('@xml/network_security_config_localtest');
    expect(m.permissions).toContain('android.permission.INTERNET');
  });

  it('splitVariant understands the six variants and rejects anything else', () => {
    expect(splitVariant('adminAppLocalTest')).toEqual({ flavor: 'adminApp', buildType: 'localTest' });
    expect(splitVariant('publicAppDebug')).toEqual({ flavor: 'publicApp', buildType: 'debug' });
    expect(() => splitVariant('betaAppRelease')).toThrow(/Unknown variant/);
    expect(() => splitVariant('publicAppStaging')).toThrow(/Unknown build type/);
  });
});
