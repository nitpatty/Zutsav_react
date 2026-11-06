#!/usr/bin/env node
'use strict';

// Proves, from REAL production-mode Android JavaScript bundles and their source maps, which modules each app variant
// contains. For each variant (public, admin) it runs the same command the Android build runs for the JS bundle
// (`expo export:embed --platform android --dev false`, with ZUTSAV_APP_VARIANT set for that child process only),
// then checks the source map's module list and the bundle text. Exits non-zero if anything is wrong.
//
//   node scripts/verify-variant-bundles.js [--only public|admin] [--keep] [--cache] [--out <dir>]
//     --keep    keep the generated bundles/maps (they are always kept when a check fails)
//     --cache   reuse Metro's transform cache instead of passing --reset-cache (used to show the two variants cannot
//               share cache entries); the default is a cold cache for each variant
//     --out     write to this directory instead of a fresh temporary one
//
// JavaScript composition only: this says nothing about package IDs, APK signing, manifests, devices or the backend.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { variantEnv } = require('../build-config/variantEnv');

const projectRoot = path.resolve(__dirname, '..');

// Request paths the Admin screens use. They must be in the admin bundle and absent from the public one: the strings
// survive minification, so this catches Admin code that reached a bundle by any route the module list might miss.
const ADMIN_ENDPOINT_LITERALS = ['/admin/bookings', '/admin/system-health', '/admin/broadcast', '/admin/activity-feed'];

// The Admin app's custom URL scheme. Expo inlines EXPO_PUBLIC_APP_VARIANT, so the literal is in the Admin bundle only
// (the Public build must not carry it: Public cannot claim or even reference the Admin scheme).
const ADMIN_SCHEME_LITERAL = 'zutsavadmin';

const endsWith = (value) => ({ kind: 'endsWith', value });
const includes = (value) => ({ kind: 'includes', value });

const SHARED_REQUIRED = [
  endsWith('/src/navigation/RootNavigator.jsx'),
  endsWith('/src/navigation/AuthNavigator.jsx'),
  endsWith('/src/navigation/UserNavigator.jsx'),
  endsWith('/src/navigation/PanditNavigator.jsx'),
  endsWith('/src/navigation/PanditGateNavigator.jsx'),
  endsWith('/src/screens/pandit/PanditEarningsScreen.jsx'),
  endsWith('/src/components/shared/DashboardChart.jsx'),
  endsWith('/src/variants/roleSupport.js'),
  endsWith('/src/store/authStore.js'),
];

// The Admin screens the Admin navigator registers, read from its source so the list cannot drift.
function adminScreenFiles() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'navigation', 'AdminNavigator.jsx'), 'utf8');
  const names = [...source.matchAll(/from '\.\.\/screens\/admin\/(\w+)'/g)].map((m) => m[1]);
  if (names.length === 0) throw new Error('Could not read the Admin screen list from src/navigation/AdminNavigator.jsx');
  return names.map((n) => endsWith(`/src/screens/admin/${n}.jsx`));
}

function getExpectations() {
  return {
    public: {
      required: [...SHARED_REQUIRED, endsWith('/src/variants/adminModule.public.js')],
      forbidden: [
        includes('/src/screens/admin/'),
        includes('AdminNavigator'),
        includes('AdminDrawerContent'),
        includes('/src/components/admin/'),
        includes('/node_modules/@react-navigation/drawer/'),
        endsWith('/src/variants/adminModule.js'),
      ],
      // The Admin deep-link scheme (src/config/appVariant.js) must not be in the Public app either.
      forbiddenText: [...ADMIN_ENDPOINT_LITERALS, ADMIN_SCHEME_LITERAL],
      requiredText: [],
    },
    admin: {
      required: [
        ...SHARED_REQUIRED,
        endsWith('/src/variants/adminModule.js'),
        endsWith('/src/navigation/AdminNavigator.jsx'),
        endsWith('/src/navigation/AdminDrawerContent.jsx'),
        includes('/node_modules/@react-navigation/drawer/'),
        ...adminScreenFiles(),
      ],
      forbidden: [endsWith('/src/variants/adminModule.public.js')],
      forbiddenText: [],
      requiredText: [...ADMIN_ENDPOINT_LITERALS, ADMIN_SCHEME_LITERAL],
    },
  };
}

const matches = (matcher, p) => (matcher.kind === 'endsWith' ? p.endsWith(matcher.value) : p.includes(matcher.value));
const describeMatcher = (m) => (m.kind === 'endsWith' ? `module ...${m.value}` : `any module path containing "${m.value}"`);

// Module paths from a Metro source map (plain or sectioned), with separators normalised to "/".
function parseSources(mapJson) {
  const map = typeof mapJson === 'string' ? JSON.parse(mapJson) : mapJson;
  const lists = Array.isArray(map.sources)
    ? [map.sources]
    : (Array.isArray(map.sections) ? map.sections.map((s) => (s.map && s.map.sources) || []) : []);
  if (lists.length === 0) throw new Error('source map has no "sources" list');
  return lists.flat().map((p) => String(p).replace(/\\/g, '/'));
}

/**
 * @returns {{ failures: string[], required: string[], forbidden: string[] }} what was checked and what went wrong
 */
function evaluate(variant, { sources, bundleText }, expectations = getExpectations()) {
  const rule = expectations[variant];
  if (!rule) throw new Error(`no expectations for variant "${variant}"`);
  const failures = [];
  const required = [];
  const forbidden = [];

  if (sources.length === 0) failures.push(`[${variant}] the source map lists no modules`);

  for (const m of rule.required) {
    required.push(describeMatcher(m));
    if (!sources.some((p) => matches(m, p))) failures.push(`[${variant}] MISSING required ${describeMatcher(m)}`);
  }
  for (const m of rule.forbidden) {
    forbidden.push(describeMatcher(m));
    const hit = sources.filter((p) => matches(m, p));
    if (hit.length) failures.push(`[${variant}] FORBIDDEN ${describeMatcher(m)} is in the bundle, e.g. ${hit.slice(0, 3).join(', ')}`);
  }
  for (const text of rule.forbiddenText) {
    forbidden.push(`bundle text "${text}"`);
    if (bundleText.includes(text)) failures.push(`[${variant}] FORBIDDEN string "${text}" is in the bundle`);
  }
  for (const text of rule.requiredText) {
    required.push(`bundle text "${text}"`);
    if (!bundleText.includes(text)) failures.push(`[${variant}] MISSING required string "${text}" in the bundle`);
  }
  return { failures, required, forbidden };
}

function expoCliPath() {
  const expoPackage = require.resolve('expo/package.json', { paths: [projectRoot] });
  return require.resolve('@expo/cli', { paths: [path.dirname(expoPackage)] });
}

function buildBundle(variant, outDir, { resetCache }) {
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  const bundle = path.join(outDir, 'index.android.bundle');
  const map = path.join(outDir, 'index.android.bundle.map');
  const args = [
    expoCliPath(), 'export:embed',
    '--platform', 'android',
    '--entry-file', 'index.js',
    '--bundle-output', bundle,
    '--sourcemap-output', map,
    '--assets-dest', path.join(outDir, 'assets'),
    '--dev', 'false',
    ...(resetCache ? ['--reset-cache'] : []),
  ];
  const command = `ZUTSAV_APP_VARIANT=${variant} node ${path.relative(projectRoot, args[0])} ${args.slice(1).join(' ')}`;
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: { ...variantEnv(variant), CI: '1' },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return { bundle, map, command, status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}`.trim() };
}

function parseArgs(argv) {
  const opts = { only: null, keep: false, cache: false, out: null, inspect: null, map: null, bundle: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--keep') opts.keep = true;
    else if (a === '--cache') opts.cache = true;
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--inspect') opts.inspect = argv[++i];
    else if (a === '--map') opts.map = argv[++i];
    else if (a === '--bundle') opts.bundle = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (opts.only && !['public', 'admin'].includes(opts.only)) throw new Error('--only must be "public" or "admin"');
  if (opts.inspect !== null && (!['public', 'admin'].includes(opts.inspect) || !opts.map || !opts.bundle)) {
    throw new Error('--inspect must be "public" or "admin" and needs --map <source map> and --bundle <bundle>');
  }
  return opts;
}

// Check artifacts a build already produced (for example the Gradle createBundle<Variant>JsAndAssets output) instead of
// building: the source map's module list plus the bundle read as text (a Hermes bytecode bundle keeps ASCII string
// literals, so the endpoint and scheme literals are still found). Exits non-zero on any mismatch.
function inspectArtifacts({ inspect: variant, map, bundle }) {
  const sources = parseSources(fs.readFileSync(map, 'utf8'));
  const result = evaluate(variant, { sources, bundleText: fs.readFileSync(bundle, 'latin1') });
  console.log(`== ${variant} (existing artifacts) ==`);
  console.log(`source map lists ${sources.length} modules`);
  result.required.forEach((r) => console.log(`  present  ${r}`));
  result.forbidden.forEach((f) => console.log(`  absent   ${f}`));
  result.failures.forEach((f) => console.log(`  FAIL     ${f}`));
  if (result.failures.length) {
    console.error('VARIANT BUNDLE VERIFICATION FAILED');
    result.failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  }
  console.log(`VARIANT BUNDLE VERIFICATION PASSED (${variant}, existing artifacts)`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.inspect !== null) { inspectArtifacts(opts); return; }
  const root = opts.out ? path.resolve(opts.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'zutsav-variant-verify-'));
  const expectations = getExpectations();
  const variants = opts.only ? [opts.only] : ['public', 'admin'];
  const allFailures = [];

  console.log(`Output directory: ${root}`);
  console.log(`Metro transform cache: ${opts.cache ? 'REUSED (no --reset-cache)' : 'reset for each variant'}\n`);

  for (const variant of variants) {
    const outDir = path.join(root, variant);
    console.log(`== ${variant} ==`);
    const built = buildBundle(variant, outDir, { resetCache: !opts.cache });
    console.log(`command: ${built.command}`);
    if (built.status !== 0 || !fs.existsSync(built.bundle) || !fs.existsSync(built.map)) {
      console.log(built.output.split('\n').slice(-40).join('\n'));
      allFailures.push(`[${variant}] bundle generation failed (exit ${built.status}); output kept in ${outDir}`);
      continue;
    }
    let result;
    let sources;
    try {
      sources = parseSources(fs.readFileSync(built.map, 'utf8'));
      result = evaluate(variant, { sources, bundleText: fs.readFileSync(built.bundle, 'utf8') }, expectations);
    } catch (err) {
      allFailures.push(`[${variant}] could not read the bundle or source map: ${err.message}; output kept in ${outDir}`);
      continue;
    }
    const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;
    console.log(`bundle ${kb(built.bundle)}, source map lists ${sources.length} modules`);
    console.log(`required (${result.required.length}):`);
    result.required.forEach((r) => console.log(`  present  ${r}`));
    console.log(`forbidden (${result.forbidden.length}):`);
    result.forbidden.forEach((f) => console.log(`  absent   ${f}`));
    result.failures.forEach((f) => console.log(`  FAIL     ${f}`));
    allFailures.push(...result.failures);
    console.log('');
  }

  if (allFailures.length) {
    console.error('VARIANT BUNDLE VERIFICATION FAILED');
    allFailures.forEach((f) => console.error(` - ${f}`));
    console.error(`Evidence kept in ${root}`);
    process.exit(1);
  }
  if (opts.keep || opts.out) console.log(`Bundles kept in ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
  console.log(`VARIANT BUNDLE VERIFICATION PASSED (${variants.join(', ')})`);
}

module.exports = { getExpectations, parseSources, evaluate, parseArgs, ADMIN_ENDPOINT_LITERALS, ADMIN_SCHEME_LITERAL };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`VARIANT BUNDLE VERIFICATION FAILED: ${err.message}`);
    process.exit(1);
  }
}
