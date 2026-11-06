/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const {
  VARIANT_ENV, resolveVariant, seamPaths, adminBlockPatterns, cacheVersionFor, withVariant,
} = require('../../../build-config/metroVariant');

// Build-time variant selection for Metro. The helper is exercised directly, and the real metro.config.js is loaded
// (with Expo's real default config) once per variant. Actual bundles are checked by scripts/verify-variant-bundles.js.
const ROOT = path.resolve(__dirname, '../../..');
const SRC = (...p) => path.join(ROOT, 'src', ...p);
const { real: REAL_SEAM, stub: STUB_SEAM } = seamPaths(ROOT);

// Metro combines an array blockList into one regular expression (metro/src/node-haste/DependencyGraph/createFileMap.js).
const combine = (patterns) => new RegExp([].concat(patterns).map((r) => `(${r.source})`).join('|'));

function loadMetroConfig(env) {
  const saved = process.env[VARIANT_ENV];
  if (env === undefined) delete process.env[VARIANT_ENV]; else process.env[VARIANT_ENV] = env;
  try {
    let config;
    jest.isolateModules(() => { config = require('../../../metro.config.js'); });
    return config;
  } finally {
    if (saved === undefined) delete process.env[VARIANT_ENV]; else process.env[VARIANT_ENV] = saved;
  }
}

// A stand-in for Metro's default resolution that resolves relative requests against the REAL source tree, returning the
// same { type: 'sourceFile', filePath } shape Metro does.
function defaultResolution(context, moduleName) {
  const base = path.resolve(path.dirname(context.originModulePath), moduleName);
  const found = ['', '.js', '.jsx'].map((e) => base + e).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!found) throw new Error(`test resolver: cannot resolve ${moduleName}`);
  return { type: 'sourceFile', filePath: found };
}
const contextFor = (origin) => ({ originModulePath: origin, resolveRequest: defaultResolution });

describe('variant selection', () => {
  it.each([
    ['unset', {}, 'public'],
    ['empty', { [VARIANT_ENV]: '' }, 'public'],
    ['whitespace only', { [VARIANT_ENV]: '   ' }, 'public'],
    ['explicit public', { [VARIANT_ENV]: 'public' }, 'public'],
    ['explicit admin', { [VARIANT_ENV]: 'admin' }, 'admin'],
    ['admin with surrounding whitespace', { [VARIANT_ENV]: ' admin ' }, 'admin'],
  ])('%s → %s', (_label, env, expected) => {
    expect(resolveVariant(env)).toBe(expected);
  });

  it.each(['Admin', 'ADMIN', 'administrator', 'private', 'true', '1', 'admin,public', 'system_admin'])(
    'refuses %p with a clear error instead of guessing',
    (value) => {
      expect(() => resolveVariant({ [VARIANT_ENV]: value })).toThrow(new RegExp(`Invalid ${VARIANT_ENV}.*Supported values: public, admin`));
    },
  );

  it('the real metro.config.js follows the same rules', () => {
    expect(() => loadMetroConfig('nope')).toThrow(/Invalid ZUTSAV_APP_VARIANT/);
    expect(loadMetroConfig(undefined).cacheVersion).toMatch(/zutsav-public$/);
    expect(loadMetroConfig('').cacheVersion).toMatch(/zutsav-public$/);
    expect(loadMetroConfig('admin').cacheVersion).toMatch(/zutsav-admin$/);
  });
});

describe('Admin seam resolution', () => {
  const baseConfig = { cacheVersion: '1.0', resolver: { blockList: /\/__tests__\/.*/ } };
  const publicRes = withVariant(baseConfig, { projectRoot: ROOT, variant: 'public' }).resolver.resolveRequest;
  const adminRes = withVariant(baseConfig, { projectRoot: ROOT, variant: 'admin' }).resolver.resolveRequest;
  const rootNavigator = SRC('navigation', 'RootNavigator.jsx');
  const roleSupport = SRC('variants', 'roleSupport.js');

  it('the seam files exist where the helper expects them', () => {
    expect(fs.existsSync(REAL_SEAM)).toBe(true);
    expect(fs.existsSync(STUB_SEAM)).toBe(true);
  });

  it('public: the seam as RootNavigator imports it resolves to the public stand-in', () => {
    expect(publicRes(contextFor(rootNavigator), '../variants/adminModule', 'android'))
      .toEqual({ type: 'sourceFile', filePath: STUB_SEAM });
  });

  it('public: the seam as roleSupport requires it (./adminModule) resolves to the public stand-in', () => {
    expect(publicRes(contextFor(roleSupport), './adminModule', 'android'))
      .toEqual({ type: 'sourceFile', filePath: STUB_SEAM });
  });

  it('public: an explicit file extension is redirected too', () => {
    expect(publicRes(contextFor(rootNavigator), '../variants/adminModule.js', 'android').filePath).toBe(STUB_SEAM);
  });

  it('admin: the seam resolves to the real module', () => {
    expect(adminRes(contextFor(rootNavigator), '../variants/adminModule', 'android'))
      .toEqual({ type: 'sourceFile', filePath: REAL_SEAM });
  });

  it('the public stand-in itself is never redirected', () => {
    expect(publicRes(contextFor(rootNavigator), '../variants/adminModule.public', 'android').filePath).toBe(STUB_SEAM);
  });

  it.each([
    ['a sibling module', '../variants/roleSupport', SRC('variants', 'roleSupport.js')],
    ['the Admin navigator itself (the blockList, not the redirect, deals with it)', './AdminNavigator', SRC('navigation', 'AdminNavigator.jsx')],
    ['an unrelated navigator', './UserNavigator', SRC('navigation', 'UserNavigator.jsx')],
  ])('public: %s passes through to the normal resolver unchanged', (_label, request, expectedFile) => {
    expect(publicRes(contextFor(rootNavigator), request, 'android')).toEqual({ type: 'sourceFile', filePath: expectedFile });
  });

  it('public: a file that merely shares the seam\'s name in another directory is not redirected', () => {
    const lookalike = { type: 'sourceFile', filePath: path.join(ROOT, 'src', 'other', 'adminModule.js') };
    const context = { originModulePath: rootNavigator, resolveRequest: () => lookalike };
    expect(publicRes(context, '../other/adminModule', 'android')).toBe(lookalike);
  });

  it.each([[{ type: 'empty' }], [{ type: 'assetFiles', filePaths: ['/x/a.png'] }]])(
    'public: non-source resolutions (%j) are returned untouched',
    (resolution) => {
      expect(publicRes({ originModulePath: rootNavigator, resolveRequest: () => resolution }, 'x', 'android')).toBe(resolution);
    },
  );

  it('delegates to the normal resolver for every request (it never short-circuits resolution)', () => {
    const resolveRequest = jest.fn(defaultResolution);
    publicRes({ originModulePath: rootNavigator, resolveRequest }, '../variants/roleSupport', 'android');
    expect(resolveRequest).toHaveBeenCalledTimes(1);
  });

  it('an existing custom resolveRequest in the base config is kept and still runs first', () => {
    const previous = jest.fn((ctx, name, platform) => defaultResolution(ctx, name, platform));
    const wrapped = withVariant({ resolver: { resolveRequest: previous } }, { projectRoot: ROOT, variant: 'public' }).resolver.resolveRequest;
    const context = { originModulePath: rootNavigator, resolveRequest: jest.fn() };
    expect(wrapped(context, '../variants/adminModule', 'android').filePath).toBe(STUB_SEAM);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(context.resolveRequest).not.toHaveBeenCalled();
  });

  it('the real metro.config.js applies the same redirect per variant', () => {
    const pub = loadMetroConfig(undefined).resolver.resolveRequest;
    const adm = loadMetroConfig('admin').resolver.resolveRequest;
    expect(pub(contextFor(rootNavigator), '../variants/adminModule', 'android').filePath).toBe(STUB_SEAM);
    expect(adm(contextFor(rootNavigator), '../variants/adminModule', 'android').filePath).toBe(REAL_SEAM);
  });
});

describe('public Admin blocklist', () => {
  const publicConfig = loadMetroConfig(undefined);
  const adminConfig = loadMetroConfig('admin');
  const isBlocked = (config, file) => combine(config.resolver.blockList).test(file);
  const toForwardSlashes = (p) => p.replace(/\\/g, '/');

  const ADMIN_ONLY = [
    SRC('screens', 'admin', 'AdminDashboardScreen.jsx'),
    SRC('screens', 'admin', 'AdminRefundDetailScreen.jsx'),
    SRC('screens', 'admin', 'ComingSoonScreen.jsx'),
    SRC('navigation', 'AdminNavigator.jsx'),
    SRC('navigation', 'AdminDrawerContent.jsx'),
  ];
  const MUST_STAY_AVAILABLE = [
    SRC('components', 'shared', 'DashboardChart.jsx'),
    SRC('navigation', 'RootNavigator.jsx'),
    SRC('navigation', 'UserNavigator.jsx'),
    SRC('navigation', 'PanditNavigator.jsx'),
    SRC('navigation', 'PanditGateNavigator.jsx'),
    SRC('navigation', 'AuthNavigator.jsx'),
    SRC('screens', 'pandit', 'PanditEarningsScreen.jsx'),
    SRC('screens', 'user', 'InvoiceScreen.jsx'),
    SRC('variants', 'adminModule.js'),
    SRC('variants', 'adminModule.public.js'),
    SRC('variants', 'roleSupport.js'),
    path.join(ROOT, 'node_modules', '@react-navigation', 'drawer', 'src', 'index.tsx'),
  ];

  it.each(ADMIN_ONLY)('public: blocks %s', (file) => {
    expect(isBlocked(publicConfig, file)).toBe(true);
    expect(isBlocked(publicConfig, toForwardSlashes(file))).toBe(true); // separator-agnostic
  });

  it.each(MUST_STAY_AVAILABLE)('public: does not block %s', (file) => {
    expect(isBlocked(publicConfig, file)).toBe(false);
  });

  it('every file that actually exists in the Admin folders is blocked, and nothing else in src is', () => {
    const files = (dir) => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const blocked = files(path.join(ROOT, 'src'))
      .filter((f) => !/__tests__/.test(f))
      .filter((f) => isBlocked(publicConfig, f))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
      .sort();
    const expected = [
      ...fs.readdirSync(SRC('screens', 'admin')).map((n) => `src/screens/admin/${n}`),
      'src/navigation/AdminDrawerContent.jsx',
      'src/navigation/AdminNavigator.jsx',
    ].sort();
    expect(blocked).toEqual(expected);
  });

  it('keeps Metro\'s default exclusion of test folders', () => {
    expect(isBlocked(publicConfig, SRC('screens', 'user', '__tests__', 'x.test.js'))).toBe(true);
    expect(isBlocked(adminConfig, SRC('screens', 'user', '__tests__', 'x.test.js'))).toBe(true);
  });

  it('does not block a same-named path outside this project', () => {
    expect(isBlocked(publicConfig, path.join(path.dirname(ROOT), 'other-app', 'src', 'screens', 'admin', 'AdminX.jsx'))).toBe(false);
  });

  it.each([...ADMIN_ONLY, ...MUST_STAY_AVAILABLE])('admin: blocks nothing of the app (%s)', (file) => {
    expect(isBlocked(adminConfig, file)).toBe(false);
  });

  it('admin does not receive the public-only patterns', () => {
    const patterns = adminBlockPatterns(ROOT).map((r) => r.source);
    const adminSources = [].concat(adminConfig.resolver.blockList).map((r) => r.source);
    patterns.forEach((p) => expect(adminSources).not.toContain(p));
    const publicSources = [].concat(publicConfig.resolver.blockList).map((r) => r.source);
    patterns.forEach((p) => expect(publicSources).toContain(p));
  });

  it('all patterns share the same flags, as Metro requires when it combines them', () => {
    [].concat(publicConfig.resolver.blockList).forEach((r) => expect(r.flags).toBe(''));
  });
});

describe('cache identity', () => {
  it('public and admin have different cache versions', () => {
    expect(loadMetroConfig(undefined).cacheVersion).not.toBe(loadMetroConfig('admin').cacheVersion);
  });

  it('the same variant always produces the same cache version, across fresh loads', () => {
    expect(loadMetroConfig('admin').cacheVersion).toBe(loadMetroConfig('admin').cacheVersion);
    expect(loadMetroConfig('public').cacheVersion).toBe(loadMetroConfig('public').cacheVersion);
    expect(loadMetroConfig(undefined).cacheVersion).toBe(loadMetroConfig('public').cacheVersion);
  });

  it('keeps Metro\'s own version as the prefix and is a plain deterministic string', () => {
    const { getDefaultConfig } = require('expo/metro-config');
    const base = getDefaultConfig(ROOT).cacheVersion;
    expect(loadMetroConfig('admin').cacheVersion).toBe(`${base}+zutsav-admin`);
    expect(cacheVersionFor('1.0', 'public')).toBe('1.0+zutsav-public');
    expect(cacheVersionFor(undefined, 'admin')).toBe('1.0+zutsav-admin');
  });
});

describe('everything else in the Expo config is preserved', () => {
  it('keeps the default resolver and transformer settings', () => {
    const { getDefaultConfig } = require('expo/metro-config');
    const base = getDefaultConfig(ROOT);
    ['public', 'admin'].forEach((variant) => {
      const config = withVariant(base, { projectRoot: ROOT, variant });
      expect(config.resolver.sourceExts).toEqual(base.resolver.sourceExts);
      expect(config.resolver.assetExts).toEqual(base.resolver.assetExts);
      expect(config.resolver.nodeModulesPaths).toEqual(base.resolver.nodeModulesPaths);
      expect(config.transformer).toEqual(base.transformer);
      expect(config.watchFolders).toEqual(base.watchFolders);
      expect(config.projectRoot).toBe(base.projectRoot);
    });
  });

  it('does not modify the config object it was given', () => {
    const { getDefaultConfig } = require('expo/metro-config');
    const base = getDefaultConfig(ROOT);
    const before = { cacheVersion: base.cacheVersion, blockList: base.resolver.blockList, resolveRequest: base.resolver.resolveRequest };
    withVariant(base, { projectRoot: ROOT, variant: 'public' });
    expect({ cacheVersion: base.cacheVersion, blockList: base.resolver.blockList, resolveRequest: base.resolver.resolveRequest }).toEqual(before);
  });

  it('rejects an unsupported variant passed straight to withVariant', () => {
    expect(() => withVariant({ resolver: {} }, { projectRoot: ROOT, variant: 'Admin' })).toThrow(/Unsupported variant/);
  });
});
