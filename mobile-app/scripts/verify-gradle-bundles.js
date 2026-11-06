#!/usr/bin/env node
'use strict';

// Proves the Gradle -> Metro wiring end to end: runs the ACTUAL Gradle JavaScript-bundling task of each flavor's release variant
// (createBundle<Variant>JsAndAssets, forced to re-run, which is what assemble/bundle of that variant runs), then checks the source
// map and the embedded Hermes bundle Gradle produced with the Phase 2 verifier's --inspect mode. No signing is involved: the
// bundle task needs no credentials, nothing is packaged, no APK is made.
//
//   node scripts/verify-gradle-bundles.js [--only publicApp|adminApp]
//
// Exits non-zero if either flavor's Gradle-built bundle does not match its variant (for example an Admin flavor that
// silently bundled the Public stub).

const path = require('path');
const { spawnSync } = require('child_process');
const { FLAVORS, variantName } = require('../build-config/androidVariants');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function main(argv = process.argv.slice(2)) {
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  if (only && !FLAVORS[only]) throw new Error('--only must be "publicApp" or "adminApp"');
  const flavors = only ? [only] : Object.keys(FLAVORS);
  // A leftover variable in this shell must not decide the result: the flavor's own wiring has to.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^ZUTSAV_APP_VARIANT$|^EXPO_PUBLIC_APP_VARIANT$/.test(k)));
  let failed = false;

  for (const flavor of flavors) {
    const variant = variantName(flavor, 'release');
    const task = `:app:createBundle${cap(variant)}JsAndAssets`;
    console.log(`== ${flavor} (${FLAVORS[flavor].variant}): ${task}`);
    const g = spawnSync(gradlew, [task, '--rerun-tasks', '--offline', '--console=plain'], { cwd: androidDir, env, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
    const bundlingLine = /\[zutsav\] bundling the "[a-z]+" variant[^\n]*/.exec(`${g.stdout}\n${g.stderr}`);
    console.log(`   ${bundlingLine ? bundlingLine[0] : 'the wrapper did not report running'}`);
    if (g.status !== 0) {
      console.error(`   FAIL: Gradle exited ${g.status}\n${`${g.stdout}\n${g.stderr}`.split('\n').slice(-25).join('\n')}`);
      failed = true;
      continue;
    }
    const buildDir = path.join(androidDir, 'app', 'build');
    const v = spawnSync(process.execPath, [
      path.join(__dirname, 'verify-variant-bundles.js'), '--inspect', FLAVORS[flavor].variant,
      '--map', path.join(buildDir, 'generated', 'sourcemaps', 'react', variant, 'index.android.bundle.map'),
      '--bundle', path.join(buildDir, 'generated', 'assets', `createBundle${cap(variant)}JsAndAssets`, 'index.android.bundle'),
    ], { encoding: 'utf8' });
    process.stdout.write(v.stdout.split('\n').filter((l) => !/^  (present|absent)/.test(l)).join('\n'));
    if (v.status !== 0) { process.stderr.write(v.stderr); failed = true; }
  }
  if (failed) {
    console.error('GRADLE BUNDLE VERIFICATION FAILED');
    return 1;
  }
  console.log(`GRADLE BUNDLE VERIFICATION PASSED (${flavors.join(', ')})`);
  return 0;
}

if (require.main === module) {
  try { process.exit(main()); } catch (err) { console.error(`GRADLE BUNDLE VERIFICATION FAILED: ${err.message}`); process.exit(1); }
}

module.exports = { main };
