/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// Phase 3: the two Android apps (Public com.zutsav.app, Private Admin com.zutsav.app.admin) built from one project.
// These are static checks of the committed Gradle/manifest/resource files plus REAL behaviour of the Node entry points Gradle
// uses (the child process really receives the variant). They do not compile anything; the build/APK/device evidence is
// produced by the Gradle runs described in docs/PUBLIC_PRIVATE_BUILD_GUIDE.md.
const root = path.join(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(root, ...p));
const { FLAVORS, variantName, taskName } = require('../../../build-config/androidVariants');
const { variantEnv } = require('../../../build-config/variantEnv');
const gradleBundle = require('../../../scripts/gradle-bundle');
const variantCli = require('../../../scripts/variant-cli');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
const gradle = () => read('android', 'app', 'build.gradle');
const code = () => stripComments(gradle());
function block(text, label) {
  const start = text.indexOf(label);
  if (start < 0) throw new Error(`"${label}" not found`);
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(open + 1, i); }
  }
  throw new Error(`unbalanced block after "${label}"`);
}
const flavorBlock = (name) => block(block(code(), 'productFlavors {'), `${name} {`);

const FLAVOR_NAMES = Object.keys(FLAVORS);
const BUILD_TYPES = ['debug', 'release', 'localTest'];

describe('product flavors (identity)', () => {
  it('keeps the namespace, the base applicationId, the version code and the version name', () => {
    expect(code()).toMatch(/namespace 'com\.zutsav\.app'/);
    const defaults = block(code(), 'defaultConfig {');
    expect(defaults).toMatch(/applicationId 'com\.zutsav\.app'/);
    expect(defaults).toMatch(/versionCode 1\b/);
    expect(defaults).toMatch(/versionName "1\.0\.0"/);
  });

  it('has one dimension, appVariant, and exactly the flavors publicApp and adminApp in it', () => {
    expect(code()).toMatch(/flavorDimensions 'appVariant'/);
    const flavors = block(code(), 'productFlavors {');
    expect([...flavors.matchAll(/^\s{8}(\w+) \{/gm)].map((m) => m[1])).toEqual(FLAVOR_NAMES);
    for (const f of FLAVOR_NAMES) expect(flavorBlock(f)).toMatch(/dimension 'appVariant'/);
  });

  it('final application IDs: Public com.zutsav.app (no suffix), Admin com.zutsav.app.admin', () => {
    expect(flavorBlock('publicApp')).not.toMatch(/applicationId/);
    expect(flavorBlock('adminApp')).toMatch(/applicationIdSuffix '\.admin'/);
    expect(FLAVORS.publicApp.applicationId).toBe('com.zutsav.app');
    expect(FLAVORS.adminApp.applicationId).toBe('com.zutsav.app.admin');
    expect(new Set(FLAVOR_NAMES.map((f) => FLAVORS[f].applicationId)).size).toBe(FLAVOR_NAMES.length);
  });

  it('declares the build types debug, release and localTest, localTest still being release + a version suffix', () => {
    const types = block(code(), 'buildTypes {');
    for (const t of BUILD_TYPES) expect(types).toMatch(new RegExp(`^\\s{8}${t} \\{`, 'm'));
    const local = block(types, 'localTest {');
    expect(local).toMatch(/initWith release/);
    expect(local).toMatch(/matchingFallbacks = \['release'\]/);
    expect(local).toMatch(/versionNameSuffix '-localtest'/);
  });

  it('lists the flavored debug variants as debuggable (so they load JS from Metro instead of embedding a bundle)', () => {
    const m = code().match(/debuggableVariants = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    expect(m[1].split(',').map((s) => s.trim().replace(/"/g, ''))).toEqual(FLAVOR_NAMES.map((f) => variantName(f, 'debug')));
  });

  it('the JS-side flavor table and build.gradle agree (schemes, release signing config, Metro variant)', () => {
    const map = code().match(/def flavorMetroVariants = \[([^\]]*)\]/)[1];
    for (const f of FLAVOR_NAMES) {
      const b = flavorBlock(f);
      expect(b).toContain(`manifestPlaceholders = [appScheme: '${FLAVORS[f].scheme}']`);
      expect(b).toContain(`signingConfig signingConfigs.${f.replace('App', '')}Release`);
      expect(map).toContain(`${f}: '${FLAVORS[f].variant}'`);
    }
  });

  it('Gradle task names follow <verb><Flavor><BuildType> (e.g. assembleAdminAppRelease)', () => {
    expect(taskName('assemble', 'adminApp', 'release')).toBe('assembleAdminAppRelease');
    expect(taskName('bundle', 'publicApp', 'localTest')).toBe('bundlePublicAppLocalTest');
  });
});

describe('labels and launcher icons', () => {
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  const names = ['ic_launcher', 'ic_launcher_foreground', 'ic_launcher_round'];
  const png = (...p) => fs.readFileSync(path.join(root, 'android', 'app', 'src', ...p));
  const size = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

  it('Public keeps the label "Zutsav"; Admin overlays "Zutsav Admin"; the manifest uses @string/app_name for both', () => {
    expect(read('android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')).toMatch(/<string name="app_name">Zutsav<\/string>/);
    expect(read('android', 'app', 'src', 'adminApp', 'res', 'values', 'strings.xml')).toMatch(/<string name="app_name">Zutsav Admin<\/string>/);
    expect(FLAVORS.publicApp.label).not.toBe(FLAVORS.adminApp.label);
    expect(read('android', 'app', 'src', 'main', 'AndroidManifest.xml')).toMatch(/android:label="@string\/app_name"/);
    expect(exists('android', 'app', 'src', 'publicApp', 'res', 'values', 'strings.xml')).toBe(false);
  });

  it.each(densities)('Admin has its own launcher, foreground and round icons at %s, same size as Public and visibly different', (d) => {
    for (const n of names) {
      const admin = png('adminApp', 'res', `mipmap-${d}`, `${n}.png`);
      const pub = png('main', 'res', `mipmap-${d}`, `${n}.png`);
      expect(admin.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(size(admin)).toEqual(size(pub));
      expect(admin.equals(pub)).toBe(false);
    }
  });

  it('the Admin overlay changes only launcher icons and the label: splash, notification icon and the adaptive-icon XML stay shared', () => {
    const base = path.join(root, 'android', 'app', 'src', 'adminApp', 'res');
    const files = [];
    (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(base, p).replace(/\\/g, '/')); }); }(base));
    const expected = ['values/strings.xml', ...densities.flatMap((d) => names.map((n) => `mipmap-${d}/${n}.png`))].sort();
    expect(files.sort()).toEqual(expected);
  });

  it('Public launcher resources are still in src/main (not moved or replaced)', () => {
    for (const d of densities) for (const n of names) expect(exists('android', 'app', 'src', 'main', 'res', `mipmap-${d}`, `${n}.png`)).toBe(true);
    expect(exists('android', 'app', 'src', 'main', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml')).toBe(true);
    expect(exists('android', 'app', 'src', 'publicApp', 'res', 'mipmap-xxxhdpi')).toBe(false);
  });
});

describe('URL schemes and deep links', () => {
  const manifests = () => ['main', 'debug', 'localTest', 'adminApp', 'publicApp']
    .filter((s) => exists('android', 'app', 'src', s, 'AndroidManifest.xml'))
    .map((s) => ({ source: s, text: read('android', 'app', 'src', s, 'AndroidManifest.xml') }));
  const expand = (text, flavor) => text.replace(/\$\{appScheme\}/g, FLAVORS[flavor].scheme).replace(/\$\{applicationId\}/g, FLAVORS[flavor].applicationId);
  const viewSchemes = (text) => {
    const filters = text.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) || [];
    return filters.filter((f) => /android\.intent\.action\.VIEW/.test(f)).flatMap((f) => [...f.matchAll(/android:scheme="([^"]+)"/g)].map((m) => m[1]));
  };

  it('the main manifest registers placeholders, never a literal custom scheme', () => {
    const main = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
    expect(viewSchemes(main).sort()).toEqual(['${appScheme}', '${applicationId}']);
    for (const { text } of manifests()) expect(text).not.toMatch(/android:scheme="(zutsav|zutsavadmin|com\.zutsav\.app[^"]*)"/);
  });

  it('Public registers zutsav:// (and its own application-ID scheme); Admin registers zutsavadmin:// (and its own) and none of Public\'s', () => {
    const main = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const pub = viewSchemes(expand(main, 'publicApp')).sort();
    const admin = viewSchemes(expand(main, 'adminApp')).sort();
    expect(pub).toEqual(['com.zutsav.app', 'zutsav']);
    expect(admin).toEqual(['com.zutsav.app.admin', 'zutsavadmin']);
    expect(pub.filter((s) => admin.includes(s))).toEqual([]);
  });

  it('only one VIEW intent filter exists per flavor, so Android cannot offer a chooser between two of this app\'s own entries', () => {
    const main = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
    const filters = (main.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) || []).filter((f) => /action\.VIEW/.test(f));
    expect(filters).toHaveLength(1);
    expect(main).not.toMatch(/android:autoVerify/);
  });

  it('no flavor, build-type or main manifest hard-codes a provider authority (merged ones come from the libraries, via ${applicationId})', () => {
    for (const { text } of manifests()) expect(text).not.toMatch(/android:authorities=/);
  });

  describe('JavaScript side (src/config/appVariant.js + App.jsx)', () => {
    // jest-expo's Babel preset inlines process.env.EXPO_PUBLIC_* when it TRANSFORMS a file, so changing the environment at
    // run time would test nothing. Evaluate the module's real source with an injected process.env instead.
    const schemeWith = (value) => {
      const source = read('src', 'config', 'appVariant.js').replace(/^export const /gm, 'const ');
      const env = value === undefined ? {} : { EXPO_PUBLIC_APP_VARIANT: value };
      // eslint-disable-next-line no-new-func
      return new Function('process', `${source}\nreturn { APP_VARIANT, APP_SCHEME };`)({ env });
    };

    it('admin selects zutsavadmin; everything else (unset, public, a different case, nonsense) stays on the Public scheme', () => {
      expect(schemeWith('admin')).toEqual({ APP_VARIANT: 'admin', APP_SCHEME: FLAVORS.adminApp.scheme });
      for (const v of [undefined, '', 'public', 'Admin', 'ADMIN', '1', 'private']) {
        expect(schemeWith(v)).toEqual({ APP_VARIANT: 'public', APP_SCHEME: FLAVORS.publicApp.scheme });
      }
    });

    it('the Public scheme the JS listens on is the one the Public manifest registers', () => {
      expect(schemeWith('public').APP_SCHEME).toBe('zutsav');
      expect(FLAVORS.publicApp.scheme).toBe('zutsav');
    });

    it('App.jsx builds its custom-scheme prefix from APP_SCHEME, keeps the https prefixes and the Auth → Register mapping', () => {
      const app = read('App.jsx');
      expect(app).toMatch(/import \{ APP_SCHEME \} from '\.\/src\/config\/appVariant'/);
      expect(app).toMatch(/prefixes: \[`\$\{APP_SCHEME\}:\/\/`, 'https:\/\/www\.zutsav\.com', 'https:\/\/zutsav\.com'\]/);
      expect(app).not.toMatch(/'zutsav:\/\/'\s*,/);
      expect(app).toMatch(/Auth: \{\s*screens: \{\s*Register: 'register'/);
      expect(app).toMatch(/params\.get\('ref'\)/);
    });
  });
});

describe('Gradle → Metro wiring (the child process really gets the variant)', () => {
  let dir;
  let stub;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zutsav-gradle-bundle-test-'));
    stub = path.join(dir, 'fake-cli.js');
    // stands in for the Expo CLI: records the arguments and the two variant variables it was started with
    fs.writeFileSync(stub, [
      "const fs = require('fs');",
      "const out = process.argv[process.argv.indexOf('--record') + 1];",
      'if (process.env.FAKE_CLI_FAIL) process.exit(Number(process.env.FAKE_CLI_FAIL));',
      'fs.writeFileSync(out, JSON.stringify({ args: process.argv.slice(2), zutsav: process.env.ZUTSAV_APP_VARIANT, client: process.env.EXPO_PUBLIC_APP_VARIANT }));',
    ].join('\n'));
  });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  let logSpy;
  let errSpy;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); });

  const attempt = (name, argv, baseEnv = {}) => {
    const record = path.join(dir, `${name}.json`);
    const map = path.join(dir, name, 'index.android.bundle.packager.map');
    fs.mkdirSync(path.dirname(map), { recursive: true });
    const status = gradleBundle.main([...argv, 'export:embed', '--record', record, '--sourcemap-output', map], { cli: () => stub, baseEnv: { PATH: process.env.PATH, ...baseEnv } });
    const markerFile = path.join(path.dirname(map), gradleBundle.MARKER_FILE);
    return {
      status,
      seen: fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null,
      marker: fs.existsSync(markerFile) ? fs.readFileSync(markerFile, 'utf8').trim() : null,
    };
  };

  it.each([['public'], ['admin']])('%s: the child gets ZUTSAV_APP_VARIANT and EXPO_PUBLIC_APP_VARIANT for that variant, the flag is stripped, the rest is passed unchanged', (v) => {
    const r = attempt(`ok-${v}`, ['--zutsav-app-variant', v]);
    expect(r.status).toBe(0);
    expect(r.seen.zutsav).toBe(v);
    expect(r.seen.client).toBe(v);
    expect(r.seen.args).not.toContain('--zutsav-app-variant');
    expect(r.seen.args.slice(0, 1)).toEqual(['export:embed']);
    expect(r.marker).toBe(`variant=${v}`);
  });

  it('refuses to bundle without a variant (nothing is implicitly Admin, nothing is implicitly Public either)', () => {
    const r = attempt('none', []);
    expect(r.status).toBe(1);
    expect(r.seen).toBeNull();
    expect(r.marker).toBeNull();
  });

  it.each(['Admin', 'ADMIN', 'private', '1', ''])('refuses the unsupported variant %p', (v) => {
    const r = attempt(`bad-${v || 'empty'}`, ['--zutsav-app-variant', v]);
    expect(r.status).toBe(1);
    expect(r.seen).toBeNull();
  });

  it('refuses when the environment already names the other variant (a leftover ZUTSAV_APP_VARIANT=admin cannot leak into the Public flavor)', () => {
    const publicWithAdminEnv = attempt('conflict-1', ['--zutsav-app-variant', 'public'], { ZUTSAV_APP_VARIANT: 'admin' });
    expect(publicWithAdminEnv.status).toBe(1);
    expect(publicWithAdminEnv.seen).toBeNull();
    const adminWithPublicClient = attempt('conflict-2', ['--zutsav-app-variant', 'admin'], { EXPO_PUBLIC_APP_VARIANT: 'public' });
    expect(adminWithPublicClient.status).toBe(1);
    expect(adminWithPublicClient.seen).toBeNull();
    expect(attempt('same', ['--zutsav-app-variant', 'admin'], { ZUTSAV_APP_VARIANT: 'admin' }).status).toBe(0);
  });

  it('a failing bundle returns its exit status and leaves no marker (Gradle then fails the task)', () => {
    const r = attempt('fails', ['--zutsav-app-variant', 'admin'], { FAKE_CLI_FAIL: '3' });
    expect(r.status).toBe(3);
    expect(r.marker).toBeNull();
  });

  it('variantEnv never mutates the caller\'s environment', () => {
    const base = { PATH: 'x' };
    const env = variantEnv('admin', base);
    expect(base).toEqual({ PATH: 'x' });
    expect(env).toMatchObject({ ZUTSAV_APP_VARIANT: 'admin', EXPO_PUBLIC_APP_VARIANT: 'admin', PATH: 'x' });
  });

  describe('build.gradle', () => {
    it('points every createBundle<Variant>JsAndAssets task at the wrapper AFTER the React Native plugin configured it, with the flavor\'s variant', () => {
      const g = code();
      expect(g).toMatch(/afterEvaluate \{/);
      expect(g).toMatch(/tasks\.named\(taskName\)\.configure/);
      expect(g).toContain('scripts/gradle-bundle.js');
      expect(g).toMatch(/task\.extraPackagerArgs\.addAll\('--zutsav-app-variant', metroVariant\)/);
      expect(g).toMatch(/task\.cliFile\.set\(/);
      // the earlier attempt (a configureEach registered before the plugin's own configuration) was silently overwritten
      expect(g).not.toMatch(/tasks\.configureEach/);
    });

    it('fails a bundle task whose flavor is unmapped, whose wrapper marker is missing or wrong, and a variant with no bundle task', () => {
      const g = code();
      expect(g).toMatch(/not mapped to a Metro variant/);
      expect(g).toMatch(/did not run through scripts\/gradle-bundle\.js/);
      expect(g).toMatch(/has no \$\{expectedTask\} task to wire/);
      expect(g).toContain(gradleBundle.MARKER_FILE);
    });

    it('does not rely on an environment assignment at configuration time to reach Metro', () => {
      expect(code()).not.toMatch(/environment\s*\(?\s*['"]ZUTSAV_APP_VARIANT|System\.setProperty|\.environment\[/);
    });
  });
});

describe('developer commands (scripts/variant-cli.js and package.json)', () => {
  const pkg = () => JSON.parse(read('package.json')).scripts;
  const gradleTask = (steps) => steps[0].args[0];

  it.each([
    ['public', 'debug', ':app:assemblePublicAppDebug'],
    ['admin', 'debug', ':app:assembleAdminAppDebug'],
    ['public', 'localtest', ':app:assemblePublicAppLocalTest'],
    ['admin', 'localtest', ':app:assembleAdminAppLocalTest'],
    ['public', 'release', ':app:assemblePublicAppRelease'],
    ['admin', 'release', ':app:assembleAdminAppRelease'],
    ['public', 'release-aab', ':app:bundlePublicAppRelease'],
    ['admin', 'release-aab', ':app:bundleAdminAppRelease'],
    ['public', 'run', ':app:installPublicAppDebug'],
    ['admin', 'run', ':app:installAdminAppDebug'],
  ])('%s %s runs Gradle task %s', (variant, action, task) => {
    expect(gradleTask(variantCli.plan(variant, action))).toBe(task);
  });

  it('start runs the Expo CLI (no Gradle) on the variant\'s own port and extra arguments go through', () => {
    const [step] = variantCli.plan('admin', 'start', ['--clear']);
    expect(step.args.slice(1)).toEqual(['start', '--port', '8082', '--clear']);
    expect(variantCli.plan('public', 'start')[0].args.slice(1)).toEqual(['start', '--port', '8081']);
  });

  describe('Metro ports (two apps, two Metro servers, at the same time)', () => {
    it('each app has its own port, built into its debug APK by the flavor, and the JS-side table agrees with build.gradle', () => {
      expect(FLAVORS.publicApp.devPort).not.toBe(FLAVORS.adminApp.devPort);
      for (const f of FLAVOR_NAMES) {
        expect(flavorBlock(f)).toContain(`resValue 'integer', 'react_native_dev_server_port', '${FLAVORS[f].devPort}'`);
      }
    });

    it('--port cannot be overridden for start or run (the APK has the port built in), in any spelling', () => {
      for (const arg of [['--port', '9000'], ['-p', '9000'], ['--port=9000']]) {
        expect(() => variantCli.plan('admin', 'start', arg)).toThrow(/port is fixed/);
        expect(() => variantCli.plan('public', 'run', arg)).toThrow(/port is fixed/);
      }
    });

    it('run = install that flavor\'s debug app, adb reverse for THAT port, then its own Metro', () => {
      for (const [variant, port, task] of [['public', 8081, 'installPublicAppDebug'], ['admin', 8082, 'installAdminAppDebug']]) {
        const steps = variantCli.plan(variant, 'run');
        expect(steps).toHaveLength(3);
        expect(steps[0].args[0]).toBe(`:app:${task}`);
        expect(steps[1].args).toEqual(['reverse', `tcp:${port}`, `tcp:${port}`]);
        expect(steps[2].args.slice(1, 4)).toEqual(['start', '--port', String(port)]);
      }
    });

    it('refuses to start Metro on a port where a server (maybe the other variant, maybe stale) is already listening', async () => {
      const net = require('net');
      const server = net.createServer();
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();
      expect(await variantCli.portInUse(port)).toBe(true);
      await new Promise((resolve) => server.close(resolve));
      expect(await variantCli.portInUse(port)).toBe(false);
    });
  });

  it('refuses an unknown variant (including a differently cased "Admin") or action', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => variantCli.plan('Admin', 'debug')).toThrow(/Unknown variant/);
    expect(() => variantCli.plan('private', 'debug')).toThrow(/Unknown variant/);
    expect(() => variantCli.plan('public', 'deploy')).toThrow(/Unknown action/);
    expect(await variantCli.main([])).toBe(1);
    errSpy.mockRestore();
  });

  it('npm scripts: every flavor command names its variant explicitly; Public is the default; nothing uses shell-specific env syntax', () => {
    const s = pkg();
    expect(s.start).toBe('expo start');
    expect(s.android).toBe('node scripts/variant-cli.js public run');
    for (const [name, cmd] of Object.entries(s)) {
      if (/^(start|android|build):(public|admin)/.test(name)) {
        expect(cmd).toMatch(new RegExp(`^node scripts/variant-cli\\.js ${name.includes('admin') ? 'admin' : 'public'} `));
      }
      expect(cmd).not.toMatch(/^[A-Z_]+=|cross-env|\bset [A-Z_]+=/);
    }
    for (const required of ['start:public', 'start:admin', 'android:public', 'android:admin', 'build:public:debug', 'build:admin:debug',
      'build:public:localtest', 'build:admin:localtest', 'build:public:release', 'build:admin:release']) expect(s[required]).toBeDefined();
    expect(Object.values(s).some((c) => /expo run:android/.test(c))).toBe(false);
  });

  it('adds no dependency for this', () => {
    const p = JSON.parse(read('package.json'));
    expect(Object.keys(p.dependencies)).not.toEqual(expect.arrayContaining(['cross-env', 'dotenv-cli']));
    expect(Object.keys(p.devDependencies)).not.toEqual(expect.arrayContaining(['cross-env']));
  });
});

describe('signing identities and release guards', () => {
  const rules = () => {
    const list = code().match(/def packagingSigningRules = \[([\s\S]*?)\n\]/)[1];
    return Object.fromEntries([...list.matchAll(/(\w+)\s*:\s*\[config: '(\w+)',\s*prefix: (\w+),/g)].map((m) => [m[1], { config: m[2], prefix: m[3] }]));
  };
  const taskPattern = () => new RegExp(code().match(/def packagingTaskName = ~\/(.+)\/\n/)[1]);
  const classify = (name) => {
    const m = taskPattern().exec(name);
    if (!m || m[2] === '') return null;
    return m[2][0].toLowerCase() + m[2].slice(1) + m[3];
  };

  it('three separate identities, each from its own four variables; nothing is read from the old generic ZUTSAV_RELEASE_* names', () => {
    const g = code();
    expect(g).toContain("def PUBLIC_RELEASE_SIGNING = 'ZUTSAV_PUBLIC_RELEASE'");
    expect(g).toContain("def ADMIN_RELEASE_SIGNING = 'ZUTSAV_ADMIN_RELEASE'");
    expect(g).toContain("def LOCALTEST_SIGNING = 'ZUTSAV_LOCALTEST'");
    expect(g).not.toMatch(/ZUTSAV_RELEASE_/);
    const configs = block(g, 'signingConfigs {');
    for (const name of ['debug', 'publicRelease', 'adminRelease', 'localTest']) expect(configs).toMatch(new RegExp(`^\\s{8}${name} \\{`, 'm'));
    expect(block(configs, 'publicRelease {')).toMatch(/PUBLIC_RELEASE_SIGNING/);
    expect(block(configs, 'publicRelease {')).not.toMatch(/ADMIN_RELEASE_SIGNING|LOCALTEST_SIGNING/);
    expect(block(configs, 'adminRelease {')).toMatch(/ADMIN_RELEASE_SIGNING/);
    expect(block(configs, 'adminRelease {')).not.toMatch(/PUBLIC_RELEASE_SIGNING|LOCALTEST_SIGNING/);
    expect(block(configs, 'localTest {')).toMatch(/LOCALTEST_SIGNING/);
    expect(block(configs, 'localTest {')).not.toMatch(/PUBLIC_RELEASE_SIGNING|ADMIN_RELEASE_SIGNING/);
  });

  it('each flavor is bound to its own release identity; debug and localTest are bound explicitly (never null, so nothing is inherited)', () => {
    expect(flavorBlock('publicApp')).toMatch(/signingConfig signingConfigs\.publicRelease/);
    expect(flavorBlock('adminApp')).toMatch(/signingConfig signingConfigs\.adminRelease/);
    const types = block(code(), 'buildTypes {');
    expect(block(types, 'debug {')).toMatch(/signingConfig signingConfigs\.debug/);
    expect(block(types, 'localTest {')).toMatch(/signingConfig signingConfigs\.localTest/);
    expect(code()).not.toMatch(/signingConfig [^\n]*\? [^\n]*: null/);
  });

  it('an identity that is not fully provided stays empty, so it cannot sign (no fallback to another key)', () => {
    const configs = block(code(), 'signingConfigs {');
    for (const name of ['publicRelease', 'adminRelease', 'localTest']) expect(block(configs, `${name} {`)).toMatch(/if \(signingProvided\(/);
  });

  it('rules: Public release → publicRelease/ZUTSAV_PUBLIC_RELEASE, Admin release → adminRelease/ZUTSAV_ADMIN_RELEASE, either localTest → localTest/ZUTSAV_LOCALTEST', () => {
    expect(rules()).toEqual({
      publicAppRelease: { config: 'publicRelease', prefix: 'PUBLIC_RELEASE_SIGNING' },
      adminAppRelease: { config: 'adminRelease', prefix: 'ADMIN_RELEASE_SIGNING' },
      publicAppLocalTest: { config: 'localTest', prefix: 'LOCALTEST_SIGNING' },
      adminAppLocalTest: { config: 'localTest', prefix: 'LOCALTEST_SIGNING' },
    });
  });

  it('the guard recognises every packaging task of every release-like variant, APK and AAB (generated from the flavor × build type matrix)', () => {
    const verbs = ['assemble', 'bundle', 'package', 'install', 'sign', 'validateSigning'];
    for (const f of FLAVOR_NAMES) {
      for (const bt of ['release', 'localTest']) {
        const key = variantName(f, bt);
        for (const verb of verbs) {
          const base = `${verb}${key[0].toUpperCase()}${key.slice(1)}`;
          expect(classify(base)).toBe(key);
          expect(classify(`${base}Bundle`)).toBe(key);
        }
        expect(Object.keys(rules())).toContain(key);
      }
    }
  });

  it('aggregate tasks and debug variants are not mistaken for a flavor (aggregates depend on the checked per-variant tasks)', () => {
    for (const aggregate of ['assembleRelease', 'bundleRelease', 'assembleLocalTest', 'bundleLocalTest']) expect(classify(aggregate)).toBeNull();
    for (const f of FLAVOR_NAMES) {
      expect(classify(taskName('assemble', f, 'debug'))).toBeNull();
      expect(classify(taskName('install', f, 'debug'))).toBeNull();
    }
  });

  it('a new flavor or renamed task cannot bypass the guard: its release-like task parses to a variant that has no rule, which is refused', () => {
    for (const task of ['assembleBetaAppRelease', 'bundleAdminProRelease', 'packageStagingLocalTest', 'signPublicAppStagingReleaseBundle']) {
      const key = classify(task);
      expect(key).not.toBeNull();
      expect(Object.keys(rules())).not.toContain(key);
    }
    expect(code()).toMatch(/if \(rule == null\) \{\s*throw new GradleException/);
    expect(code()).toMatch(/does not recognise/);
  });

  it('the guard refuses a missing/partial identity, an identity bound to the wrong config and a keystore path that is not a file, naming variables only', () => {
    const g = code();
    expect(g).toMatch(/signing == null \|\| signing\.name != rule\.config/);
    expect(g).toMatch(/signingParts\.findAll \{ signingValue\(rule\.prefix, it\)\.isEmpty\(\) \}/);
    expect(g).toMatch(/isFile\(\)/);
    expect(g).toMatch(/never signed with the debug keystore, another flavor/);
    expect(g).not.toMatch(/(println|logger\.(info|lifecycle|quiet|warn|error|debug))[^\n]*(signingValue|buildSecret|_PASSWORD|KEY_ALIAS)/);
  });

  it('localTest is its own identity and its network exception check still applies to both flavors', () => {
    expect(code()).toMatch(/packagedVariants\.any \{ it\.endsWith\('LocalTest'\) \}/);
    expect(code()).toMatch(/network_security_config_localtest\.xml/);
    expect(rules().publicAppLocalTest.prefix).toBe(rules().adminAppLocalTest.prefix);
    expect(rules().publicAppLocalTest.prefix).not.toBe(rules().publicAppRelease.prefix);
  });

  it('no keystore or credentials file is committed under android/ (only the public debug keystore)', () => {
    const found = [];
    (function walk(d) {
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        if (['node_modules', 'build', '.gradle', '.git'].includes(e.name)) return;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.(jks|keystore|p12|pfx)$/i.test(e.name)) found.push(path.relative(root, p).replace(/\\/g, '/'));
      });
    }(path.join(root, 'android')));
    expect(found).toEqual(['android/app/debug.keystore']);
  });
});
