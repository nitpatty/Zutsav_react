import fs from 'fs';
import path from 'path';

// The Admin seam (variants/adminModule) and its public stand-in. The boundary rules here are what a later build step
// relies on to keep Admin code out of the public bundle, so they are checked against the real source tree.
const SRC = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
  return /\.(js|jsx)$/.test(e.name) ? [p] : [];
});
const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');

describe('real Admin module (the default in this build)', () => {
  it('exposes the existing Admin navigator and reports Admin as available', () => {
    const real = require('../adminModule');
    const navigator = require('../../navigation/AdminNavigator').default;
    expect(typeof navigator).toBe('function');
    expect(real.AdminNavigator).toBe(navigator);
    expect(real.ADMIN_AVAILABLE).toBe(true);
  });
});

describe('public Admin stand-in', () => {
  it('exports no navigator and reports Admin as unavailable', () => {
    const stub = require('../adminModule.public');
    expect(stub.AdminNavigator).toBeNull();
    expect(stub.ADMIN_AVAILABLE).toBe(false);
  });

  it('exports exactly the same names as the real module (so either can be swapped in)', () => {
    const real = Object.keys(require('../adminModule')).sort();
    const stub = Object.keys(require('../adminModule.public')).sort();
    expect(stub).toEqual(real);
  });

  it('contains no import or require at all, so it cannot pull in anything Admin', () => {
    const code = read('variants/adminModule.public.js')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/\bimport\b|\brequire\s*\(|\bexport\s+\*?\s*from\b|\bexport\s*\{[^}]*\}\s*from\b/);
  });

  it('loads without touching the Admin navigator, screens or drawer', () => {
    jest.isolateModules(() => {
      jest.doMock('../../navigation/AdminNavigator', () => { throw new Error('Admin navigator must not be loaded'); });
      jest.doMock('../../navigation/AdminDrawerContent', () => { throw new Error('Admin drawer must not be loaded'); });
      jest.doMock('@react-navigation/drawer', () => { throw new Error('drawer must not be loaded'); });
      expect(() => require('../adminModule.public')).not.toThrow();
    });
  });
});

describe('Admin code boundary in the source tree', () => {
  const files = walk(SRC);
  const importersOf = (re) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();

  it('only the seam imports the Admin navigator', () => {
    expect(importersOf(/navigation\/AdminNavigator['"]|['"]\.\/AdminNavigator['"]/)).toEqual(['variants/adminModule.js']);
  });

  it('RootNavigator reaches Admin only through the seam', () => {
    const root = read('navigation/RootNavigator.jsx');
    expect(root).toMatch(/from '\.\.\/variants\/adminModule'/);
    expect(root).not.toMatch(/\.\/AdminNavigator|screens\/admin|AdminDrawerContent/);
  });

  it('nothing outside the Admin module imports Admin screens or the Admin drawer', () => {
    const outside = files.filter((f) => {
      const r = rel(f);
      return !r.startsWith('screens/admin/') && !r.startsWith('navigation/Admin');
    });
    const offenders = outside
      .filter((f) => /from\s+['"][^'"]*(screens\/admin|AdminDrawerContent)/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('DashboardChart lives in shared components, is used by Pandit and Admin, and no admin components folder remains', () => {
    expect(fs.existsSync(path.join(SRC, 'components/shared/DashboardChart.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(SRC, 'components/admin'))).toBe(false);
    expect(importersOf(/components\/shared\/DashboardChart/)).toEqual([
      'screens/admin/AdminAnalyticsScreen.jsx',
      'screens/admin/AdminDashboardScreen.jsx',
      'screens/pandit/PanditEarningsScreen.jsx',
    ]);
    expect(importersOf(/components\/admin/)).toEqual([]);
  });
});
