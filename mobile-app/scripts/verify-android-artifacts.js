#!/usr/bin/env node
'use strict';

// Inspects what Gradle actually produced for the two Android apps, instead of what the source files say.
//
//   node scripts/verify-android-artifacts.js manifests
//       Checks the MERGED manifest of all six variants (<flavor> x debug|release|localTest) under android/app/build
//       (run the Gradle process<Variant>MainManifest tasks first; they need no signing). Also compares the two flavors'
//       provider authorities for collisions.
//   node scripts/verify-android-artifacts.js apk <file.apk> <variant>
//       Reads a built APK with the Android SDK tools (apkanalyzer, aapt2, apksigner): package, label, version, debuggable,
//       backup/cleartext flags, schemes, authorities, signing certificate SHA-256 and the APK file's SHA-256.
//
// Exits non-zero on any mismatch. A property whose SDK tool is missing is reported as NOT VERIFIED, never as passed.
// No signing password or key is read; only the public certificate fingerprint is printed.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { FLAVORS } = require('../build-config/androidVariants');

const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'android', 'app', 'build');
const BUILD_TYPES = ['debug', 'release', 'localTest'];
const REQUIRED_PERMISSIONS = ['INTERNET', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'RECEIVE_BOOT_COMPLETED', 'VIBRATE'];

const splitVariant = (key) => {
  const flavor = Object.keys(FLAVORS).find((f) => key.startsWith(f));
  if (!flavor) throw new Error(`Unknown variant ${JSON.stringify(key)}`);
  const rest = key.slice(flavor.length);
  const buildType = rest.charAt(0).toLowerCase() + rest.slice(1);
  if (!BUILD_TYPES.includes(buildType)) throw new Error(`Unknown build type in variant ${JSON.stringify(key)}`);
  return { flavor, buildType };
};

const attr = (tag, name) => { const m = new RegExp(`${name}="([^"]*)"`).exec(tag || ''); return m ? m[1] : null; };

// The parts of a merged/decoded manifest the checks need (plain XML, as in AGP's merged manifest or `apkanalyzer manifest print`).
function parseManifest(xml) {
  const manifestTag = (/<manifest\b[^>]*>/.exec(xml) || [''])[0];
  const appTag = (/<application\b[^>]*>/.exec(xml) || [''])[0];
  const filters = xml.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) || [];
  return {
    package: attr(manifestTag, 'package'),
    versionCode: attr(manifestTag, 'android:versionCode'),
    versionName: attr(manifestTag, 'android:versionName'),
    label: attr(appTag, 'android:label'),
    icon: attr(appTag, 'android:icon'),
    roundIcon: attr(appTag, 'android:roundIcon'),
    allowBackup: attr(appTag, 'android:allowBackup'),
    debuggable: attr(appTag, 'android:debuggable'),
    usesCleartextTraffic: attr(appTag, 'android:usesCleartextTraffic'),
    networkSecurityConfig: attr(appTag, 'android:networkSecurityConfig'),
    viewSchemes: filters.filter((f) => /android\.intent\.action\.VIEW/.test(f)).flatMap((f) => [...f.matchAll(/android:scheme="([^"]+)"/g)].map((m) => m[1])).sort(),
    authorities: [...xml.matchAll(/<provider\b[^>]*android:authorities="([^"]+)"/g)].flatMap((m) => m[1].split(';')).sort(),
    permissions: [...new Set([...xml.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].map((m) => m[1]))].sort(),
  };
}

// Everything that must be true of a variant's manifest. Returns a list of failure strings (empty = fine).
// `compiled`: the manifest was decoded from an APK, where resource references are not resolved (@0x... instead of @xml/name), so the
// network-security-config can only be checked for presence.
function checkManifest(variantKey, xml, { compiled = false } = {}) {
  const { flavor, buildType } = splitVariant(variantKey);
  const expected = FLAVORS[flavor];
  const m = parseManifest(xml);
  const failures = [];
  const fail = (msg) => failures.push(`[${variantKey}] ${msg}`);

  if (m.package !== expected.applicationId) fail(`package is ${JSON.stringify(m.package)}, expected ${expected.applicationId}`);
  if (m.allowBackup !== 'false') fail(`android:allowBackup is ${JSON.stringify(m.allowBackup)}, expected "false"`);
  if (buildType !== 'debug' && m.debuggable === 'true') fail('android:debuggable is true on a non-debug variant');
  if (buildType === 'debug' && m.usesCleartextTraffic !== 'true') fail('debug is expected to allow cleartext (Metro / LAN backend)');
  if (buildType !== 'debug' && m.usesCleartextTraffic !== 'false') fail(`usesCleartextTraffic is ${JSON.stringify(m.usesCleartextTraffic)}, expected "false" outside debug`);
  if (buildType === 'localTest') {
    const ok = compiled ? Boolean(m.networkSecurityConfig) : m.networkSecurityConfig === '@xml/network_security_config_localtest';
    if (!ok) fail('localTest must carry the LAN network-security-config');
  } else if (m.networkSecurityConfig) {
    fail(`only localTest may carry a network-security-config, found ${m.networkSecurityConfig} (this is what keeps cleartext out of release)`);
  }
  const wantSchemes = [expected.scheme, expected.applicationId].sort();
  if (JSON.stringify(m.viewSchemes) !== JSON.stringify(wantSchemes)) fail(`VIEW schemes are [${m.viewSchemes}], expected [${wantSchemes}]`);
  for (const other of Object.values(FLAVORS).filter((f) => f !== expected)) {
    for (const s of [other.scheme, other.applicationId]) if (m.viewSchemes.includes(s)) fail(`registers the other app's scheme "${s}"`);
  }
  for (const a of m.authorities) {
    if (!(a === expected.applicationId || a.startsWith(`${expected.applicationId}.`))) fail(`provider authority "${a}" is not namespaced by ${expected.applicationId}`);
  }
  const names = m.permissions.map((p) => p.replace('android.permission.', ''));
  for (const p of REQUIRED_PERMISSIONS) if (!names.includes(p)) fail(`missing permission ${p}`);
  if (names.includes('RECORD_AUDIO')) fail('requests RECORD_AUDIO');
  if (buildType !== 'debug' && names.includes('SYSTEM_ALERT_WINDOW')) fail('requests SYSTEM_ALERT_WINDOW outside debug');
  return failures;
}

// Provider authorities must differ between the two apps or they cannot be installed side by side.
function checkAuthorityCollisions(manifestsByVariant) {
  const failures = [];
  for (const bt of BUILD_TYPES) {
    const a = parseManifest(manifestsByVariant[`publicApp${bt.charAt(0).toUpperCase()}${bt.slice(1)}`] || '').authorities;
    const b = parseManifest(manifestsByVariant[`adminApp${bt.charAt(0).toUpperCase()}${bt.slice(1)}`] || '').authorities;
    for (const x of a.filter((y) => b.includes(y))) failures.push(`[${bt}] provider authority "${x}" is declared by BOTH apps`);
  }
  return failures;
}

// `aapt2 dump xmltree --file AndroidManifest.xml <apk>` prints the compiled manifest as an indented tree. Rebuild plain XML from it
// so the same checks run on a built APK even without apkanalyzer. Resource references stay as @0x... (label and the network-security
// config cannot be resolved here; the label is read from `aapt2 dump badging`).
function xmltreeToXml(text) {
  const root = { name: '#root', attrs: [], children: [], indent: -2 };
  const stack = [root];
  const ANDROID_NS = 'http://schemas.android.com/apk/res/android:';
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\s*)(E|A): (.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    if (m[2] === 'E') {
      while (stack[stack.length - 1].indent >= indent) stack.pop();
      const el = { name: /^([\w:.-]+)/.exec(m[3])[1], attrs: [], children: [], indent };
      stack[stack.length - 1].children.push(el);
      stack.push(el);
    } else {
      const isAndroid = m[3].startsWith(ANDROID_NS);
      const a = /^([\w.-]+)(?:\(0x[0-9a-fA-F]+\))?=(.*?)(?: \(Raw: .*\))?$/.exec(isAndroid ? m[3].slice(ANDROID_NS.length) : m[3]);
      if (!a) continue;
      const value = a[2].startsWith('"') ? a[2].slice(1, -1) : a[2];
      stack[stack.length - 1].attrs.push(`${isAndroid ? 'android:' : ''}${a[1]}="${value}"`);
    }
  }
  const render = (el) => `<${el.name}${el.attrs.length ? ' ' : ''}${el.attrs.join(' ')}>${el.children.map(render).join('')}</${el.name}>`;
  return root.children.map(render).join('\n');
}

function findMergedManifest(variantKey) {
  const base = path.join(buildDir, 'intermediates', 'merged_manifests', variantKey);
  const candidates = [path.join(base, 'AndroidManifest.xml'), path.join(base, `process${variantKey.charAt(0).toUpperCase()}${variantKey.slice(1)}Manifest`, 'AndroidManifest.xml')];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function verifyManifests() {
  const variants = Object.keys(FLAVORS).flatMap((f) => BUILD_TYPES.map((bt) => `${f}${bt.charAt(0).toUpperCase()}${bt.slice(1)}`));
  const xmlByVariant = {};
  const failures = [];
  for (const v of variants) {
    const file = findMergedManifest(v);
    if (!file) { failures.push(`[${v}] no merged manifest found under android/app/build (run :app:process${v.charAt(0).toUpperCase()}${v.slice(1)}MainManifest)`); continue; }
    xmlByVariant[v] = fs.readFileSync(file, 'utf8');
    const m = parseManifest(xmlByVariant[v]);
    const f = checkManifest(v, xmlByVariant[v]);
    console.log(`${f.length ? 'FAIL' : 'ok  '} ${v.padEnd(20)} package=${m.package} schemes=[${m.viewSchemes}] authorities=${m.authorities.length} allowBackup=${m.allowBackup} cleartext=${m.usesCleartextTraffic} nsc=${m.networkSecurityConfig || '-'}`);
    failures.push(...f);
  }
  failures.push(...checkAuthorityCollisions(xmlByVariant));
  return failures;
}

const sdkRoot = () => {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT;
  const lp = path.join(projectRoot, 'android', 'local.properties');
  if (fs.existsSync(lp)) {
    const m = /^sdk\.dir=(.*)$/m.exec(fs.readFileSync(lp, 'utf8'));
    if (m) return m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':');
  }
  return null;
};

function findTool(name) {
  const root = sdkRoot();
  if (!root) return null;
  const exts = process.platform === 'win32' ? ['.bat', '.exe', '.cmd', ''] : [''];
  const dirs = [];
  const bt = path.join(root, 'build-tools');
  if (fs.existsSync(bt)) fs.readdirSync(bt).sort().reverse().forEach((v) => dirs.push(path.join(bt, v)));
  const cl = path.join(root, 'cmdline-tools');
  if (fs.existsSync(cl)) fs.readdirSync(cl).forEach((v) => dirs.push(path.join(cl, v, 'bin')));
  for (const d of dirs) for (const e of exts) { const p = path.join(d, `${name}${e}`); if (fs.existsSync(p)) return p; }
  return null;
}

const run = (tool, args) => spawnSync(tool, args, { encoding: 'utf8', shell: process.platform === 'win32' && /\.(bat|cmd)$/i.test(tool), maxBuffer: 64 * 1024 * 1024 });

function verifyApk(apk, variantKey) {
  const failures = [];
  const notVerified = [];
  if (!fs.existsSync(apk)) throw new Error(`APK not found: ${apk}`);
  const { flavor, buildType } = splitVariant(variantKey);
  const expected = FLAVORS[flavor];
  const sha = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
  console.log(`file       ${apk}`);
  console.log(`size       ${fs.statSync(apk).size} bytes`);
  console.log(`sha256     ${sha}`);

  // Manifest: apkanalyzer when installed, otherwise the compiled manifest decoded with aapt2.
  const analyzer = findTool('apkanalyzer');
  const aapt2ForManifest = findTool('aapt2');
  let manifestXml = null;
  let compiled = false;
  if (analyzer) {
    const r = run(analyzer, ['manifest', 'print', apk]);
    if (r.status === 0) manifestXml = r.stdout;
  }
  if (manifestXml === null && aapt2ForManifest) {
    const r = run(aapt2ForManifest, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
    if (r.status === 0) { manifestXml = xmltreeToXml(r.stdout); compiled = true; }
  }
  if (manifestXml !== null) {
    const m = parseManifest(manifestXml);
    console.log(`manifest   decoded with ${compiled ? 'aapt2 xmltree' : 'apkanalyzer'}`);
    console.log(`package    ${m.package}   versionCode ${m.versionCode}   versionName ${m.versionName}`);
    console.log(`label ref  ${m.label}   icon ${m.icon}   roundIcon ${m.roundIcon}`);
    console.log(`schemes    ${m.viewSchemes.join(', ')}`);
    console.log(`authorities ${m.authorities.join(', ')}`);
    console.log(`flags      allowBackup=${m.allowBackup} debuggable=${m.debuggable} cleartext=${m.usesCleartextTraffic} nsc=${m.networkSecurityConfig || '-'}`);
    console.log(`permissions ${m.permissions.map((p) => p.replace('android.permission.', '')).join(', ')}`);
    failures.push(...checkManifest(variantKey, manifestXml, { compiled }).map((f) => f.replace(/^\[[^\]]+\] /, `[apk ${variantKey}] `)));
  } else { notVerified.push('manifest (neither apkanalyzer nor aapt2 could decode it)'); }

  const aapt2 = findTool('aapt2');
  if (aapt2) {
    const r = run(aapt2, ['dump', 'badging', apk]);
    if (r.status === 0) {
      const label = /application-label:'([^']*)'/.exec(r.stdout);
      const pkg = /package: name='([^']*)'/.exec(r.stdout);
      console.log(`label      ${label ? label[1] : '?'}`);
      if (!label || label[1] !== expected.label) failures.push(`[apk ${variantKey}] application label is ${label ? JSON.stringify(label[1]) : 'missing'}, expected ${JSON.stringify(expected.label)}`);
      if (!pkg || pkg[1] !== expected.applicationId) failures.push(`[apk ${variantKey}] package is ${pkg ? pkg[1] : 'missing'}, expected ${expected.applicationId}`);
      const dbg = /application-debuggable/.test(r.stdout);
      console.log(`debuggable ${dbg}`);
      if (buildType !== 'debug' && dbg) failures.push(`[apk ${variantKey}] APK is debuggable`);
      console.log(`icons      ${[...r.stdout.matchAll(/application-icon-\d+:'([^']*)'/g)].map((x) => x[1]).join(', ')}`);
    } else { notVerified.push('label/icons (aapt2 failed)'); }
  } else { notVerified.push('label/icons (aapt2 not found)'); }

  const apksigner = findTool('apksigner');
  if (apksigner) {
    const r = run(apksigner, ['verify', '--print-certs', '--verbose', apk]);
    const out = `${r.stdout}\n${r.stderr}`;
    // older build-tools print "Signer #1 certificate ...", newer ones "V2 Signer: certificate ..."
    const dn = /(?:Signer #1|V\d(?:\.\d)? Signer):? certificate DN: (.*)/.exec(out);
    const fp = /(?:Signer #1|V\d(?:\.\d)? Signer):? certificate SHA-256 digest: ([0-9a-f]+)/i.exec(out);
    console.log(`signature  ${r.status === 0 ? 'verifies' : 'DOES NOT VERIFY'}`);
    console.log(`signer DN  ${dn ? dn[1].trim() : '?'}`);
    console.log(`signer SHA-256 ${fp ? fp[1] : '?'}`);
    if (r.status !== 0) failures.push(`[apk ${variantKey}] apksigner verify failed`);
    if (!fp) notVerified.push('signer certificate fingerprint (apksigner output not understood)');
  } else { notVerified.push('signature (apksigner not found)'); }

  notVerified.forEach((n) => console.log(`NOT VERIFIED: ${n}`));
  // A property that could not be checked is a failure of THIS run, never a pass.
  failures.push(...notVerified.map((n) => `[apk ${variantKey}] NOT VERIFIED: ${n}`));
  return failures;
}

function main(argv = process.argv.slice(2)) {
  const [mode, ...rest] = argv;
  let failures;
  if (mode === 'manifests') failures = verifyManifests();
  else if (mode === 'apk' && rest.length === 2) failures = verifyApk(path.resolve(rest[0]), rest[1]);
  else throw new Error('Usage: verify-android-artifacts.js manifests | apk <file.apk> <variant, e.g. adminAppDebug>');
  if (failures.length) {
    console.error('ANDROID ARTIFACT VERIFICATION FAILED');
    failures.forEach((f) => console.error(` - ${f}`));
    return 1;
  }
  console.log('ANDROID ARTIFACT VERIFICATION PASSED');
  return 0;
}

module.exports = { parseManifest, checkManifest, checkAuthorityCollisions, splitVariant, xmltreeToXml, REQUIRED_PERMISSIONS };

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`ANDROID ARTIFACT VERIFICATION FAILED: ${err.message}`);
    process.exit(1);
  }
}
