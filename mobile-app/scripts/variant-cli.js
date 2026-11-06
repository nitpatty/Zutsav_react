#!/usr/bin/env node
'use strict';

// Cross-platform commands for the two Zutsav apps (no shell-specific `VAR=value cmd` syntax, no extra dependency).
//
//   node scripts/variant-cli.js <public|admin> <action> [extra arguments for the underlying tool]
//
//   start        Metro dev server for that variant      (expo start)
//   run          install the debug app on a connected device/emulator (Gradle install<Flavor>Debug), then start Metro
//   debug        assemble the debug APK                 (assemble<Flavor>Debug)
//   localtest    assemble the internal QA APK           (assemble<Flavor>LocalTest, needs ZUTSAV_LOCALTEST_* and LAN URLs)
//   release      assemble the production APK            (assemble<Flavor>Release,   needs that flavor's signing variables)
//   release-aab  bundle the production AAB              (bundle<Flavor>Release,     needs that flavor's signing variables)
//
// The variant is explicit (Admin is never implied). The child process gets ZUTSAV_APP_VARIANT / EXPO_PUBLIC_APP_VARIANT for
// that variant; an environment that already names the other variant is refused. The Gradle flavor tasks also set the bundler
// variant themselves (android/app/build.gradle), so running ./gradlew directly with the right task is equally correct.

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');
const { FLAVORS, flavorForVariant, taskName } = require('../build-config/androidVariants');
const { variantEnv } = require('../build-config/variantEnv');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');

const GRADLE_ACTIONS = {
  debug: ['assemble', 'debug'],
  localtest: ['assemble', 'localTest'],
  release: ['assemble', 'release'],
  'release-aab': ['bundle', 'release'],
};
const ACTIONS = ['start', 'run', ...Object.keys(GRADLE_ACTIONS)];

const expoCli = () => require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json', { paths: [projectRoot] })] });

// adb from the Android SDK that Gradle uses (android/local.properties, ANDROID_HOME), else whatever is on PATH.
function adbCommand() {
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  const lp = path.join(androidDir, 'local.properties');
  if (fs.existsSync(lp)) {
    const m = /^sdk\.dir=(.*)$/m.exec(fs.readFileSync(lp, 'utf8'));
    if (m) roots.push(m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':'));
  }
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const found = roots.filter(Boolean).map((r) => path.join(r, 'platform-tools', exe)).find((p) => fs.existsSync(p));
  return found || 'adb';
}

// Each app's debug build has ITS Metro port baked in (android/app/build.gradle, resValue react_native_dev_server_port), so the
// port is fixed per variant and cannot be overridden here: that is what lets both apps run against their own Metro at once.
function plan(variant, action, extra = []) {
  const flavor = flavorForVariant(variant);
  if (!flavor) throw new Error(`Unknown variant ${JSON.stringify(variant)}. Use "public" or "admin".`);
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action ${JSON.stringify(action)}. Use one of: ${ACTIONS.join(', ')}.`);
  const port = FLAVORS[flavor].devPort;
  if (['start', 'run'].includes(action) && extra.some((a) => a === '--port' || a === '-p' || /^--port=/.test(a))) {
    throw new Error(`The Metro port is fixed per app (${variant}: ${port}) because the debug APK has it built in; --port is not accepted.`);
  }
  const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const gradle = (task) => ({ command: gradlew, args: [`:app:${task}`, ...extra], cwd: androidDir, shell: process.platform === 'win32' });
  const metro = (more) => ({ command: process.execPath, args: [expoCli(), 'start', '--port', String(port), ...more], cwd: projectRoot, port });
  if (action === 'start') return [metro(extra)];
  if (action === 'run') {
    return [
      gradle(taskName('install', flavor, 'debug')),
      { command: adbCommand(), args: ['reverse', `tcp:${port}`, `tcp:${port}`], cwd: projectRoot },
      metro([]),
    ];
  }
  const [verb, buildType] = GRADLE_ACTIONS[action];
  return [gradle(taskName(verb, flavor, buildType))];
}

const portInUse = (port) => new Promise((resolve) => {
  const socket = net.createConnection({ port, host: '127.0.0.1' });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

async function main(argv = process.argv.slice(2)) {
  const [variant, action, ...extra] = argv;
  let steps;
  let env;
  try {
    if (!variant || !action) throw new Error(`Usage: node scripts/variant-cli.js <public|admin> <${ACTIONS.join('|')}> [args]`);
    steps = plan(variant, action, extra);
    env = variantEnv(variant);
  } catch (e) {
    console.error(`[zutsav] ${e.message}`);
    return 1;
  }
  const flavor = FLAVORS[flavorForVariant(variant)];
  console.log(`[zutsav] ${variant} variant (${flavor.applicationId}) - ${action}`);
  for (const step of steps) {
    // Never start Metro on top of a server that is already running: it could be serving the OTHER variant (or an old bundle).
    if (step.port && await portInUse(step.port)) {
      console.error(`[zutsav] port ${step.port} is already in use. A Metro server is already running there and could be serving a different variant; stop it first.`);
      return 1;
    }
    const result = spawnSync(step.command, step.args, { cwd: step.cwd, env, stdio: 'inherit', shell: step.shell });
    if (result.error) {
      console.error(`[zutsav] could not run ${path.basename(step.command)}: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) return result.status === null ? 1 : result.status;
  }
  return 0;
}

if (require.main === module) main().then((code) => process.exit(code));

module.exports = { ACTIONS, plan, main, portInUse };
