'use strict';

// Build-time (Node) selection of the app variant for Metro. Loaded by metro.config.js; nothing here reaches the app bundle.
//
//   ZUTSAV_APP_VARIANT unset / empty  → "public"  (fail closed: the default never contains Admin)
//   ZUTSAV_APP_VARIANT=public         → "public"
//   ZUTSAV_APP_VARIANT=admin          → "admin"   (the ONLY way to get the real Admin module)
//   anything else                     → configuration error (never silently treated as Admin)
//
// What a variant changes in Metro:
//   1. resolver.resolveRequest  - the Admin seam (src/variants/adminModule.js) resolves to its public stand-in
//                                 (src/variants/adminModule.public.js) in the public variant. Only that exact file.
//   2. resolver.blockList       - public only: the Admin source files are hidden from Metro, so a stray import of
//                                 one fails the bundle instead of shipping Admin code.
//   3. cacheVersion             - differs per variant, so the two variants never share transform-cache entries.

const path = require('path');

const VARIANT_ENV = 'ZUTSAV_APP_VARIANT';
const VARIANTS = Object.freeze(['public', 'admin']);
const DEFAULT_VARIANT = 'public';

function resolveVariant(env = process.env) {
  const raw = env[VARIANT_ENV];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') return DEFAULT_VARIANT;
  if (!VARIANTS.includes(value)) {
    throw new Error(
      `Invalid ${VARIANT_ENV}=${JSON.stringify(raw)}. Supported values: ${VARIANTS.join(', ')} ` +
      `(unset or empty selects "${DEFAULT_VARIANT}"). Refusing to guess which variant to build.`,
    );
  }
  return value;
}

function seamPaths(projectRoot) {
  const dir = path.join(path.resolve(projectRoot), 'src', 'variants');
  return { real: path.join(dir, 'adminModule.js'), stub: path.join(dir, 'adminModule.public.js') };
}

const normalizeForCompare = (p) => (process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p));
const samePath = (a, b) => normalizeForCompare(a) === normalizeForCompare(b);

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Metro requires every blockList pattern to share the same flags (the default has none), so the case-insensitivity that
// Windows paths need (drive letter case) is written into the pattern instead of using the "i" flag.
const looseCase = (s) => s.replace(/[a-zA-Z]/g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);

// Admin-only source files, anchored to this project's root. Deliberately narrow: shared components (for example
// src/components/shared/DashboardChart.jsx) and everything the User and Pandit apps use are NOT matched.
function adminBlockPatterns(projectRoot) {
  const sep = '[\\\\/]';
  // The root is matched segment by segment so the whole path, not just the part under src, accepts either separator.
  const escaped = path.resolve(projectRoot).split(/[\\/]/).map(escapeRegExp).join(sep);
  const root = process.platform === 'win32' ? looseCase(escaped) : escaped;
  return [
    new RegExp(`^${root}${sep}src${sep}screens${sep}admin${sep}`),
    new RegExp(`^${root}${sep}src${sep}navigation${sep}Admin(?:Navigator|DrawerContent)\\.[jt]sx?$`),
  ];
}

const cacheVersionFor = (baseVersion, variant) => `${baseVersion || '1.0'}+zutsav-${variant}`;

function withVariant(config, { projectRoot, variant }) {
  if (!VARIANTS.includes(variant)) throw new Error(`Unsupported variant ${JSON.stringify(variant)}.`);
  const { real, stub } = seamPaths(projectRoot);
  const resolver = config.resolver || {};
  const previousResolveRequest = resolver.resolveRequest;

  // Resolve exactly as before, then - in the public variant only - swap the result if it is the Admin seam file.
  // Matching on the RESOLVED file (not the request string) means any relative path to the seam is caught and nothing
  // with a similar name is.
  const resolveRequest = (context, moduleName, platform) => {
    const resolution = (previousResolveRequest || context.resolveRequest)(context, moduleName, platform);
    if (variant === 'public' && resolution && resolution.type === 'sourceFile' && samePath(resolution.filePath, real)) {
      return { type: 'sourceFile', filePath: stub };
    }
    return resolution;
  };

  const blockList = variant === 'public'
    ? [].concat(resolver.blockList || [], adminBlockPatterns(projectRoot))
    : resolver.blockList;

  return {
    ...config,
    cacheVersion: cacheVersionFor(config.cacheVersion, variant),
    resolver: { ...resolver, resolveRequest, blockList },
  };
}

module.exports = {
  VARIANT_ENV,
  VARIANTS,
  DEFAULT_VARIANT,
  resolveVariant,
  seamPaths,
  adminBlockPatterns,
  cacheVersionFor,
  withVariant,
};
