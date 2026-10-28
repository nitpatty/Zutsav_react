import { parsePaymentRedirectUrl, isSafePaymentUrl } from '../paymentUrl';

// Synthetic payment-page URLs only (no real transaction, host or token).
const OK = 'https://pay.example.invalid/transact/pay?token=abc123&x=1';

describe('parsePaymentRedirectUrl — accepted', () => {
  it.each([
    OK,
    'https://pay.example.invalid',
    'HTTPS://PAY.EXAMPLE.INVALID/Path',
    'https://pay.example.invalid:443/x',
    '  https://pay.example.invalid/x  ',
    'https://a.b.c.example.invalid/x#frag',
    'https://xn--bcher-kva.example.invalid/x',
  ])('%s', (url) => {
    const r = parsePaymentRedirectUrl(url);
    expect(r.ok).toBe(true);
    expect(r.url).toBe(url.trim()); // exactly what the server sent: no re-serialisation
  });
});

describe('parsePaymentRedirectUrl — refused', () => {
  it.each([
    ['http://pay.example.invalid/x', 'insecure'],
    ['HTTP://pay.example.invalid/x', 'insecure'],
    ['javascript:alert(1)', 'unsupported_scheme'],
    ['intent://pay#Intent;scheme=https;end', 'unsupported_scheme'],
    ['file:///etc/passwd', 'unsupported_scheme'],
    ['data:text/html,<script>1</script>', 'unsupported_scheme'],
    ['zutsav://payment-callback/ZUT_1', 'unsupported_scheme'],
    ['com.zutsav.app://pay', 'unsupported_scheme'],
    ['tel:+911234567890', 'unsupported_scheme'],
    ['phonepe://pay?pa=x', 'unsupported_scheme'],
    ['//pay.example.invalid/x', 'malformed'],
    ['pay.example.invalid/x', 'malformed'],
    ['https://', 'malformed'],
    ['https:///path', 'malformed'],
    ['https://user:pass@pay.example.invalid/x', 'credentials'],
    ['https://pay.example.invalid@evil.example.invalid/x', 'credentials'],
    ['https://pay.example.invalid:8443/x', 'port'],
    ['https://pay.example.invalid:80/x', 'port'],
    ['https://localhost/x', 'host'],
    ['https://intranet/x', 'host'],
    ['https://127.0.0.1/x', 'host'],
    ['https://10.0.0.5/x', 'host'],
    ['https://[::1]/x', 'host'],
    ['https://192.168.1.100:5000/x', 'port'],
    ['https://-bad.example.invalid/x', 'host'],
    ['https://exa mple.invalid/x', 'invalid_characters'],
    ['https://pay.example.invalid/a b', 'invalid_characters'],
    ['https://pay.example.invalid/\u0000', 'invalid_characters'],
    ['https://pay.example.invalid\\@evil.example.invalid/x', 'invalid_characters'],
    ['', 'empty'],
    ['   ', 'empty'],
    [null, 'not_a_string'],
    [undefined, 'not_a_string'],
    [42, 'not_a_string'],
    [{ href: OK }, 'not_a_string'],
  ])('%p → %s', (url, reason) => {
    const r = parsePaymentRedirectUrl(url);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(reason);
    expect(isSafePaymentUrl(url)).toBe(false);
  });

  it('refuses an over-long URL', () => {
    expect(parsePaymentRedirectUrl(`https://pay.example.invalid/${'a'.repeat(2100)}`)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('never echoes the URL (or any part of it) in its result — callers must not log it', () => {
    expect(JSON.stringify(parsePaymentRedirectUrl('http://pay.example.invalid/?token=SECRETTOKEN'))).not.toMatch(/SECRETTOKEN|pay\.example/);
  });
});

describe('optional host allow-list (for when the owner confirms the real hosts)', () => {
  const allowed = ['phonepe.example.invalid'];

  it('is NOT enforced by default: no host list is invented', () => {
    expect(parsePaymentRedirectUrl('https://anything.example.invalid/x').ok).toBe(true);
  });

  it('accepts the exact host and its sub-domains, refuses lookalikes and other hosts', () => {
    expect(parsePaymentRedirectUrl('https://phonepe.example.invalid/x', { allowedHosts: allowed }).ok).toBe(true);
    expect(parsePaymentRedirectUrl('https://mercury.phonepe.example.invalid/x', { allowedHosts: allowed }).ok).toBe(true);
    for (const bad of ['https://evilphonepe.example.invalid/x', 'https://phonepe.example.invalid.evil.example.invalid/x', 'https://other.example.invalid/x']) {
      expect(parsePaymentRedirectUrl(bad, { allowedHosts: allowed })).toEqual({ ok: false, reason: 'host_not_allowed' });
    }
  });

  it('still applies every structural rule when a list is given', () => {
    expect(parsePaymentRedirectUrl('http://phonepe.example.invalid/x', { allowedHosts: allowed }).ok).toBe(false);
  });
});
