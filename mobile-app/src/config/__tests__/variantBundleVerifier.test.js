/**
 * @jest-environment node
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { getExpectations, parseSources, evaluate, ADMIN_ENDPOINT_LITERALS, ADMIN_SCHEME_LITERAL } = require('../../../scripts/verify-variant-bundles');

// The bundle verifier decides pass/fail from a source map's module list and the bundle text. These tests feed it
// synthetic module lists to prove it FAILS when it should (the real bundles are checked by `npm run verify:variants`).
const ROOT = 'C:/work/mobile-app';
const mod = (rel) => `${ROOT}/${rel}`;
const expectations = getExpectations();
const endpoints = [...ADMIN_ENDPOINT_LITERALS, ADMIN_SCHEME_LITERAL].join(' ');

// A module list that satisfies the rule for a variant: every "endsWith" requirement as a path, plus a drawer path if required.
function goodSources(variant) {
  return expectations[variant].required.map((m) => (m.kind === 'endsWith' ? `${ROOT}${m.value}` : `${ROOT}/node_modules${m.value.replace('/node_modules', '')}index.js`));
}
const PUBLIC_TEXT = 'var a=1;';
const ADMIN_TEXT = `var a="${endpoints}";`;

describe('expectations', () => {
  it('Admin requires every screen the Admin navigator registers (read from its source)', () => {
    const screens = expectations.admin.required.filter((m) => m.value.startsWith('/src/screens/admin/'));
    expect(screens).toHaveLength(20);
  });

  it('Public forbids Admin screens, navigator, drawer content, the old admin components folder, the drawer library and the real seam', () => {
    const text = expectations.public.forbidden.map((m) => m.value);
    expect(text).toEqual(expect.arrayContaining([
      '/src/screens/admin/', 'AdminNavigator', 'AdminDrawerContent', '/src/components/admin/',
      '/node_modules/@react-navigation/drawer/', '/src/variants/adminModule.js',
    ]));
  });

  it('Public requires the shared chart and the User, Pandit and Auth navigators; Admin requires them too', () => {
    ['public', 'admin'].forEach((variant) => {
      const wanted = expectations[variant].required.map((m) => m.value);
      expect(wanted).toEqual(expect.arrayContaining([
        '/src/components/shared/DashboardChart.jsx', '/src/navigation/UserNavigator.jsx',
        '/src/navigation/PanditNavigator.jsx', '/src/navigation/AuthNavigator.jsx',
      ]));
    });
  });
});

describe('a correct bundle passes', () => {
  it('public', () => {
    const r = evaluate('public', { sources: goodSources('public'), bundleText: PUBLIC_TEXT });
    expect(r.failures).toEqual([]);
  });
  it('admin', () => {
    const r = evaluate('admin', { sources: goodSources('admin'), bundleText: ADMIN_TEXT });
    expect(r.failures).toEqual([]);
  });
});

describe('public failures', () => {
  const base = () => goodSources('public');
  const run = (sources, bundleText = PUBLIC_TEXT) => evaluate('public', { sources, bundleText }).failures;

  it.each([
    ['an Admin screen', mod('src/screens/admin/AdminUsersScreen.jsx')],
    ['the Admin navigator', mod('src/navigation/AdminNavigator.jsx')],
    ['the Admin drawer content', mod('src/navigation/AdminDrawerContent.jsx')],
    ['the old admin components folder', mod('src/components/admin/Anything.jsx')],
    ['the drawer library', mod('node_modules/@react-navigation/drawer/lib/module/index.js')],
    ['the real Admin seam', mod('src/variants/adminModule.js')],
  ])('fails, naming the variant and the module, when %s is present', (_label, extra) => {
    const failures = run([...base(), extra]);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.some((f) => f.startsWith('[public] FORBIDDEN') && f.includes(extra))).toBe(true);
  });

  it('fails when the public stand-in is missing', () => {
    const failures = run(base().filter((p) => !p.endsWith('adminModule.public.js')));
    expect(failures).toEqual([expect.stringMatching(/^\[public\] MISSING required module \.\.\.\/src\/variants\/adminModule\.public\.js/)]);
  });

  it('fails when the shared DashboardChart disappears', () => {
    const failures = run(base().filter((p) => !p.endsWith('DashboardChart.jsx')));
    expect(failures.join('\n')).toMatch(/\[public\] MISSING required module \.\.\.\/src\/components\/shared\/DashboardChart\.jsx/);
  });

  it('fails when a User or Pandit navigator disappears', () => {
    expect(run(base().filter((p) => !p.endsWith('UserNavigator.jsx'))).join('\n')).toMatch(/MISSING required module .*UserNavigator\.jsx/);
    expect(run(base().filter((p) => !p.endsWith('PanditNavigator.jsx'))).join('\n')).toMatch(/MISSING required module .*PanditNavigator\.jsx/);
  });

  it.each([...ADMIN_ENDPOINT_LITERALS, ADMIN_SCHEME_LITERAL])('fails when the bundle text contains the Admin endpoint or scheme %s', (literal) => {
    expect(run(base(), `x("${literal}")`)).toEqual([`[public] FORBIDDEN string "${literal}" is in the bundle`]);
  });

  it('fails when the source map lists no modules', () => {
    expect(run([]).join('\n')).toMatch(/lists no modules/);
  });

  it('does not mistake the stand-in (adminModule.public.js) for the real seam', () => {
    expect(run(base())).toEqual([]);
  });
});

describe('admin failures', () => {
  const base = () => goodSources('admin');
  const run = (sources, bundleText = ADMIN_TEXT) => evaluate('admin', { sources, bundleText }).failures;

  it('fails when the public stand-in is present', () => {
    const failures = run([...base(), mod('src/variants/adminModule.public.js')]);
    expect(failures).toEqual([expect.stringMatching(/^\[admin\] FORBIDDEN module \.\.\.\/src\/variants\/adminModule\.public\.js/)]);
  });

  it('fails when the real Admin seam is replaced by the stand-in', () => {
    const swapped = base().filter((p) => !p.endsWith('/adminModule.js')).concat(mod('src/variants/adminModule.public.js'));
    const failures = run(swapped);
    expect(failures.join('\n')).toMatch(/MISSING required module \.\.\.\/src\/variants\/adminModule\.js/);
    expect(failures.join('\n')).toMatch(/FORBIDDEN module \.\.\.\/src\/variants\/adminModule\.public\.js/);
  });

  it.each([
    '/src/navigation/AdminNavigator.jsx',
    '/src/navigation/AdminDrawerContent.jsx',
    '/src/screens/admin/AdminDashboardScreen.jsx',
    '/src/screens/admin/AdminSystemHealthScreen.jsx',
    '/src/variants/adminModule.js',
    '/src/components/shared/DashboardChart.jsx',
  ])('fails when %s is missing', (suffix) => {
    const failures = run(base().filter((p) => !p.endsWith(suffix)));
    expect(failures.join('\n')).toContain(`[admin] MISSING required module ...${suffix}`);
  });

  it('fails when the drawer library is missing', () => {
    const failures = run(base().filter((p) => !p.includes('@react-navigation/drawer')));
    expect(failures.join('\n')).toMatch(/\[admin\] MISSING required any module path containing "\/node_modules\/@react-navigation\/drawer\/"/);
  });

  it('fails when the Admin endpoints or the Admin scheme are missing from the bundle text', () => {
    expect(run(base(), 'var a=1;')).toHaveLength(ADMIN_ENDPOINT_LITERALS.length + 1);
  });
});

describe('source map parsing', () => {
  it('normalises Windows separators', () => {
    expect(parseSources({ sources: ['C:\\app\\src\\a.js', '/x/y.js'] })).toEqual(['C:/app/src/a.js', '/x/y.js']);
  });

  it('reads a plain map from JSON text', () => {
    expect(parseSources(JSON.stringify({ sources: ['/a.js'] }))).toEqual(['/a.js']);
  });

  it('reads an indexed (sectioned) map', () => {
    const map = { sections: [{ map: { sources: ['/a.js'] } }, { map: { sources: ['/b.js'] } }] };
    expect(parseSources(map)).toEqual(['/a.js', '/b.js']);
  });

  it('refuses a map without a module list', () => {
    expect(() => parseSources({ version: 3 })).toThrow(/no "sources" list/);
    expect(() => parseSources('not json')).toThrow();
  });
});

describe('command line', () => {
  const script = path.resolve(__dirname, '../../../scripts/verify-variant-bundles.js');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  it('exits non-zero on an unknown argument, without printing a success message', () => {
    const r = run('--bogus');
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/PASSED/);
    expect(r.stderr).toMatch(/FAILED: Unknown argument/);
  });

  it('exits non-zero on an invalid --only value', () => {
    const r = run('--only', 'private');
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toMatch(/PASSED/);
  });

  describe('--inspect (artifacts a Gradle build already produced)', () => {
    const fs = require('fs');
    const os = require('os');
    let dir;
    beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zutsav-inspect-test-')); });
    afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
    const artifacts = (name, sources, text) => {
      const map = path.join(dir, `${name}.map`);
      const bundle = path.join(dir, `${name}.bundle`);
      fs.writeFileSync(map, JSON.stringify({ version: 3, sources }));
      fs.writeFileSync(bundle, text);
      return ['--map', map, '--bundle', bundle];
    };

    it('needs the variant, a source map and a bundle', () => {
      expect(run('--inspect', 'public').status).not.toBe(0);
      expect(run('--inspect', 'private', '--map', 'a', '--bundle', 'b').status).not.toBe(0);
    });

    it('passes a public artifact pair that matches the Public expectations', () => {
      const r = run('--inspect', 'public', ...artifacts('public-ok', goodSources('public'), PUBLIC_TEXT));
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/PASSED \(public, existing artifacts\)/);
    });

    it('passes an admin artifact pair that matches the Admin expectations', () => {
      const r = run('--inspect', 'admin', ...artifacts('admin-ok', goodSources('admin'), ADMIN_TEXT));
      expect(r.status).toBe(0);
    });

    it('fails an "admin" build that is really the Public one (the Gradle wiring failure this guards against)', () => {
      const r = run('--inspect', 'admin', ...artifacts('admin-is-public', goodSources('public'), PUBLIC_TEXT));
      expect(r.status).not.toBe(0);
      expect(r.stdout).not.toMatch(/PASSED/);
      expect(`${r.stdout}${r.stderr}`).toMatch(/MISSING required module .*AdminNavigator/);
    });

    it('fails a "public" build that carries Admin modules', () => {
      const r = run('--inspect', 'public', ...artifacts('public-has-admin', [...goodSources('public'), mod('src/screens/admin/AdminUsersScreen.jsx')], PUBLIC_TEXT));
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/FORBIDDEN/);
    });
  });
});
