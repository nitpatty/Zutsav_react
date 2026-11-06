#!/usr/bin/env node
'use strict';

// Runs REAL Gradle (dry runs: nothing is built or signed) to prove the release guards in android/app/build.gradle fail closed
// and that no signing identity can stand in for another. It uses placeholder values that are not keys; nothing here touches a real
// keystore and no value is printed. Needs the JDK / Gradle that the Android build already needs and an offline-capable Gradle cache.
//
//   node scripts/verify-android-guards.js
//
// Exits non-zero if any case behaves differently from the expectation.

const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
// Any existing file will do: a dry run never opens it. It is only here so "does the keystore file exist" is satisfied.
const PLACEHOLDER_FILE = path.join(projectRoot, 'build-config', 'metroVariant.js');
const LAN_URLS = { EXPO_PUBLIC_API_URL: 'http://192.168.0.192:5000/api', EXPO_PUBLIC_BASE_URL: 'http://192.168.0.192:5000' };

const identity = (prefix, file = PLACEHOLDER_FILE) => ({
  [`${prefix}_STORE_FILE`]: file, [`${prefix}_STORE_PASSWORD`]: 'placeholder', [`${prefix}_KEY_ALIAS`]: 'placeholder', [`${prefix}_KEY_PASSWORD`]: 'placeholder',
});
const PUBLIC = identity('ZUTSAV_PUBLIC_RELEASE');
const ADMIN = identity('ZUTSAV_ADMIN_RELEASE');
const LOCALTEST = { ...identity('ZUTSAV_LOCALTEST'), ...LAN_URLS };
const LEGACY = identity('ZUTSAV_RELEASE');

const RELEASE_TASKS = ['assemblePublicAppRelease', 'bundlePublicAppRelease', 'assembleAdminAppRelease', 'bundleAdminAppRelease'];
const LOCAL_TASKS = ['assemblePublicAppLocalTest', 'assembleAdminAppLocalTest'];
const DEBUG_TASKS = ['assemblePublicAppDebug', 'assembleAdminAppDebug'];

// [description, extra environment, task, expected: 'pass' | a variable-name prefix that must be named in the refusal]
const cases = [];
const add = (description, env, tasks, expected) => tasks.forEach((t) => cases.push([`${description}: ${t}`, env, t, typeof expected === 'function' ? expected(t) : expected]));
const needs = (t) => (/PublicApp/.test(t) ? 'ZUTSAV_PUBLIC_RELEASE_' : 'ZUTSAV_ADMIN_RELEASE_');
const needsLocal = 'ZUTSAV_LOCALTEST_';

add('no credentials', {}, [...RELEASE_TASKS, 'signAdminAppReleaseBundle', 'packagePublicAppRelease'], needs);
add('no credentials', {}, LOCAL_TASKS, needsLocal);
add('no credentials', {}, DEBUG_TASKS, 'pass');
add('Public credentials only', PUBLIC, ['assemblePublicAppRelease', 'bundlePublicAppRelease'], 'pass');
add('Public credentials only', PUBLIC, ['assembleAdminAppRelease', 'bundleAdminAppRelease'], 'ZUTSAV_ADMIN_RELEASE_');
add('Public credentials only', PUBLIC, ['assembleRelease'], 'ZUTSAV_ADMIN_RELEASE_');
add('Public credentials only', PUBLIC, LOCAL_TASKS, needsLocal);
add('Admin credentials only', ADMIN, ['assembleAdminAppRelease', 'bundleAdminAppRelease'], 'pass');
add('Admin credentials only', ADMIN, ['assemblePublicAppRelease', 'bundlePublicAppRelease'], 'ZUTSAV_PUBLIC_RELEASE_');
add('Admin credentials only', ADMIN, LOCAL_TASKS, needsLocal);
add('both release identities', { ...PUBLIC, ...ADMIN }, ['assembleRelease', 'bundleRelease'], 'pass');
add('both release identities', { ...PUBLIC, ...ADMIN }, LOCAL_TASKS, needsLocal);
add('only the old generic ZUTSAV_RELEASE_* names', LEGACY, [...RELEASE_TASKS, ...LOCAL_TASKS], (t) => (/LocalTest/.test(t) ? needsLocal : needs(t)));
add('localTest identity only', LOCALTEST, LOCAL_TASKS, 'pass');
add('localTest identity only', LOCALTEST, RELEASE_TASKS, needs);
add('a keystore path that is not a file', identity('ZUTSAV_PUBLIC_RELEASE', path.join(projectRoot, 'no-such-keystore-file')), ['assemblePublicAppRelease'], 'STORE_FILE does not point');
add('an incomplete identity (alias missing)', { ...PUBLIC, ZUTSAV_PUBLIC_RELEASE_KEY_ALIAS: '' }, ['assemblePublicAppRelease'], 'ZUTSAV_PUBLIC_RELEASE_KEY_ALIAS');

function runCase([description, env, task, expected]) {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^ZUTSAV_|^EXPO_PUBLIC_/.test(k)));
  const result = spawnSync(gradlew, [`:app:${task}`, '--dry-run', '--offline', '--console=plain'], {
    cwd: androidDir, env: { ...clean, ...env }, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (expected === 'pass') return result.status === 0 ? null : `${description}: expected the guard to accept it, Gradle exited ${result.status}`;
  if (result.status === 0) return `${description}: expected a refusal naming "${expected}" but the build was accepted`;
  return output.includes(expected) ? null : `${description}: refused, but not for the expected reason ("${expected}")`;
}

function main() {
  const failures = [];
  cases.forEach((c, i) => {
    const problem = runCase(c);
    console.log(`${problem ? 'FAIL' : 'ok  '} [${i + 1}/${cases.length}] ${c[0]}  ->  ${c[3] === 'pass' ? 'accepted' : 'refused'}`);
    if (problem) failures.push(problem);
  });
  if (failures.length) {
    console.error('ANDROID GUARD VERIFICATION FAILED');
    failures.forEach((f) => console.error(` - ${f}`));
    return 1;
  }
  console.log(`ANDROID GUARD VERIFICATION PASSED (${cases.length} cases, dry runs only; nothing built or signed)`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { cases };
