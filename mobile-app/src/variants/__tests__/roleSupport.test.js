import { apiErrorMessage } from '../../utils/apiMessage';

// The single role decision shared by sign-in, session restore and root routing, in both builds. The Admin module is
// replaced by a controllable stand-in so each build can be exercised without loading the Admin screen tree.
const mockAdmin = { available: true, navigator: true };
jest.mock('../adminModule', () => ({
  __esModule: true,
  get AdminNavigator() { return mockAdmin.available && mockAdmin.navigator ? function MockAdmin() { return null; } : null; },
  get ADMIN_AVAILABLE() { return mockAdmin.available; },
}));

const {
  getRoleSupport, isRoleSupported, roleRejection, unsupportedRoleMessage,
  ADMIN_ACCOUNT_REJECTED_MESSAGE, UNSUPPORTED_ROLE_MESSAGE, ROLE_NOT_SUPPORTED,
} = require('../roleSupport');

const APPROVED = 'Sorry, this account is registered as an Admin account. Please use the Zutsav Admin app to sign in.';

describe('Admin available (private build)', () => {
  beforeEach(() => { mockAdmin.available = true; mockAdmin.navigator = true; });

  it.each([
    ['user', 'user'], ['pandit', 'pandit'], ['admin', 'admin'], ['system_admin', 'admin'],
  ])('%s is served as %s', (role, kind) => {
    expect(getRoleSupport(role)).toEqual({ supported: true, kind });
  });

  it.each([[undefined], [null], [''], ['superuser'], ['Admin'], ['ADMIN'], ['root'], [42], [{}]])('unknown role %p is refused', (role) => {
    expect(getRoleSupport(role)).toEqual({ supported: false, reason: 'unknown' });
    expect(isRoleSupported(role)).toBe(false);
  });
});

describe('Admin unavailable (public build)', () => {
  beforeEach(() => { mockAdmin.available = false; mockAdmin.navigator = true; });

  it.each([['user'], ['pandit']])('%s is still served', (role) => {
    expect(getRoleSupport(role)).toEqual({ supported: true, kind: role });
  });

  it.each([['admin'], ['system_admin']])('%s is refused as an Admin account', (role) => {
    expect(getRoleSupport(role)).toEqual({ supported: false, reason: 'admin' });
    expect(isRoleSupported(role)).toBe(false);
  });

  it.each([[undefined], [null], ['superuser']])('unknown role %p is refused', (role) => {
    expect(getRoleSupport(role)).toEqual({ supported: false, reason: 'unknown' });
  });

  it('treats Admin as unavailable when the flag is set but the navigator is missing', () => {
    mockAdmin.available = true;
    mockAdmin.navigator = false;
    expect(getRoleSupport('admin')).toEqual({ supported: false, reason: 'admin' });
    expect(getRoleSupport('system_admin')).toEqual({ supported: false, reason: 'admin' });
  });
});

describe('rejection wording', () => {
  it('uses the approved Admin wording, exactly', () => {
    expect(ADMIN_ACCOUNT_REJECTED_MESSAGE).toBe(APPROVED);
    expect(unsupportedRoleMessage('admin')).toBe(APPROVED);
  });

  it('uses a different, generic wording for unknown roles', () => {
    expect(unsupportedRoleMessage('unknown')).toBe(UNSUPPORTED_ROLE_MESSAGE);
    expect(UNSUPPORTED_ROLE_MESSAGE).not.toBe(APPROVED);
  });

  it('roleRejection builds a coded error that every sign-in screen reports through apiErrorMessage', () => {
    const err = roleRejection('admin');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(ROLE_NOT_SUPPORTED);
    expect(err.reason).toBe('admin');
    expect(apiErrorMessage(err, 'Login failed')).toBe(APPROVED);
    expect(apiErrorMessage(roleRejection('unknown'), 'Login failed')).toBe(UNSUPPORTED_ROLE_MESSAGE);
  });

  it('does not change how ordinary API errors are reported', () => {
    expect(apiErrorMessage({ response: { data: { message: 'Invalid credentials' } } }, 'Login failed')).toBe('Invalid credentials');
    expect(apiErrorMessage({ message: 'Network Error' }, 'Login failed')).toBe('Login failed');
  });
});
