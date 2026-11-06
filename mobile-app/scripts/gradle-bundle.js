#!/usr/bin/env node
'use strict';

// Entry point Gradle uses INSTEAD of the Expo CLI for the JavaScript bundle of each flavor (android/app/build.gradle sets
// the `createBundle<Variant>JsAndAssets` task's cliFile to this file and appends `--zutsav-app-variant <public|admin>`).
//
// Why: the React Native Gradle plugin runs `node <cli> export:embed ...` through project.exec and offers no per-task
// environment, so an environment variable assigned in build.gradle would never reach the process that loads Metro. This
// script is that process's entry point: it sets the variant for its child and hands every other argument, unchanged, to
// the real Expo CLI.
//
//   node scripts/gradle-bundle.js [--zutsav-app-variant <variant>] export:embed --platform android ...

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { variantEnv } = require('../build-config/variantEnv');
const { describeProductionEnv, productionEnvProblems } = require('../build-config/productionEnv');

const FLAG = '--zutsav-app-variant';
const BUILD_TYPE_FLAG = '--zutsav-build-type';
const BUILD_TYPES = ['release', 'localtest'];
const MARKER_FILE = 'zutsav-variant.txt';

// Same resolution the Gradle script used for the CLI before it was redirected here.
const expoCli = () => require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json', { paths: [process.cwd()] })] });

function splitArgs(argv) {
  const rest = [];
  let variant;
  let buildType;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === FLAG) {
      if (variant !== undefined || i + 1 >= argv.length) throw new Error(`${FLAG} must be given exactly once, with a value.`);
      variant = argv[i + 1];
      i += 1;
    } else if (argv[i] === BUILD_TYPE_FLAG) {
      if (buildType !== undefined || i + 1 >= argv.length) throw new Error(`${BUILD_TYPE_FLAG} must be given exactly once, with a value.`);
      buildType = argv[i + 1];
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  if (variant === undefined) throw new Error(`${FLAG} <public|admin> is required: refusing to bundle without knowing which app this is.`);
  if (!BUILD_TYPES.includes(buildType)) throw new Error(`${BUILD_TYPE_FLAG} <${BUILD_TYPES.join('|')}> is required: refusing to bundle without knowing which kind of build this is.`);
  return { variant, buildType, rest };
}

// cli and baseEnv are injectable so a test can observe exactly what the child process receives.
function main(argv = process.argv.slice(2), { cli = expoCli, baseEnv = process.env } = {}) {
  let env;
  let rest;
  let variant;
  try {
    const parsed = splitArgs(argv);
    rest = parsed.rest;
    variant = parsed.variant;
    env = variantEnv(variant, baseEnv);
    // A Release bundle is only ever built for the production endpoints, taken from the build environment: it must not inherit
    // the LAN development values from .env or src/config/env.js. (The local-testing build keeps its own LAN rules in build.gradle.)
    if (parsed.buildType === 'release') {
      const problems = productionEnvProblems(env);
      if (problems.length) throw new Error(`refusing to bundle a Release build for the "${variant}" variant:\n  - ${problems.join('\n  - ')}`);
      const target = describeProductionEnv(env);
      console.log(`[zutsav] production endpoints: api=${target.api} base=${target.base} web=${target.web} socket=${target.socket}`);
    }
    console.log(`[zutsav] bundling the "${variant}" variant (ZUTSAV_APP_VARIANT=${variant}), ${parsed.buildType} build.`);
  } catch (e) {
    console.error(`[zutsav] ${e.message}`);
    return 1;
  }
  const result = spawnSync(process.execPath, [cli(), ...rest], { stdio: 'inherit', env, cwd: process.cwd() });
  if (result.error) {
    console.error(`[zutsav] could not start the Expo CLI: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) return result.status === null ? 1 : result.status;
  // Evidence for Gradle (android/app/build.gradle checks it after the task): this wrapper ran, for this variant, and the
  // bundle succeeded. Written next to the intermediate source map, which is not packaged into the APK.
  const mapFlag = rest.indexOf('--sourcemap-output');
  if (mapFlag >= 0 && rest[mapFlag + 1]) {
    fs.writeFileSync(path.join(path.dirname(path.resolve(process.cwd(), rest[mapFlag + 1])), MARKER_FILE), `variant=${variant}\n`);
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { BUILD_TYPE_FLAG, FLAG, MARKER_FILE, splitArgs, main };
