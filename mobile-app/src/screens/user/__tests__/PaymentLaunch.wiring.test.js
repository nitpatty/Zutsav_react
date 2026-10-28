import fs from 'fs';
import path from 'path';

// WIRING guards for the payment launch sites that are not driven end-to-end here (the cart/order/booking-flow screens are
// large, and their behaviour is covered by the existing screen tests plus utils/__tests__/paymentRecovery.test.js,
// bookingSubmitGuard.test.js and PaymentVerifyScreen.recovery.test.jsx). They fail if someone reintroduces a direct,
// unvalidated, unrecorded hand-off to a payment page, or removes the lifecycle wiring.
const src = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');
const LAUNCH_SCREENS = ['CartScreen', 'OrderDetailScreen', 'BookingFlowScreen', 'BookingDetailScreen', 'BookingsScreen', 'PaymentVerifyScreen'];

describe('payment pages are opened only through openPaymentPage (validate → persist → open)', () => {
  it.each(LAUNCH_SCREENS)('%s never opens a backend-provided payment URL directly', (name) => {
    const text = src('screens', 'user', `${name}.jsx`);
    // Linking.openURL may remain only for non-payment links (e.g. a courier tracking URL).
    const direct = [...text.matchAll(/Linking\.openURL\(([^)]*)\)/g)].map((m) => m[1]);
    for (const arg of direct) expect(arg).not.toMatch(/redirectUrl|paymentUrl|payUrl/i);
    expect(text).not.toMatch(/require\('react-native'\)[^;]*Linking/);
  });

  it.each(['CartScreen', 'OrderDetailScreen', 'BookingFlowScreen', 'BookingDetailScreen', 'BookingsScreen', 'PaymentVerifyScreen'])(
    '%s hands off through openPaymentPage',
    (name) => expect(src('screens', 'user', `${name}.jsx`)).toMatch(/openPaymentPage\(/),
  );

  it('the booking and retry flows resume an in-flight payment instead of showing a dead-end toast', () => {
    for (const name of ['BookingDetailScreen', 'BookingsScreen', 'PaymentVerifyScreen']) {
      expect(src('screens', 'user', `${name}.jsx`)).toMatch(/resumeBookingPayment\(/);
    }
  });

  it('PaymentVerify polls only while the app is in the foreground and reacts to AppState', () => {
    const text = src('screens', 'user', 'PaymentVerifyScreen.jsx');
    expect(text).toMatch(/AppState\.addEventListener\('change'/);
    expect(text).toMatch(/AppState\.currentState === 'background'/);
    expect(text).toMatch(/verifyTransaction\(/);
    expect(text).not.toMatch(/api\.get\(/);          // verification goes through the shared single-flight helper
  });
});

describe('booking creation is guarded', () => {
  const text = src('screens', 'user', 'BookingFlowScreen.jsx');
  it('submits through the duplicate-creation guard and keeps the payment prompt un-dismissable by accident', () => {
    expect(text).toMatch(/createBookingSubmitGuard\(\)/);
    expect(text).toMatch(/guard\.submit\(/);
    expect(text).toMatch(/\{ cancelable: false \}/);
    expect(text).toMatch(/acknowledgeUncertain\(\)/);
  });
  it('the guard is created once per screen instance (it can never block a later, new booking)', () => {
    expect(text).toMatch(/useRef\(null\)/);
    expect(text).toMatch(/if \(!submitGuardRef\.current\) submitGuardRef\.current = createBookingSubmitGuard\(\)/);
  });
  it('validates the payment URL before the payment prompt', () => {
    expect(text).toMatch(/parsePaymentRedirectUrl\(created\.redirectUrl\)\.ok/);
  });
});

describe('lifecycle and cleanup wiring', () => {
  it('the root navigator runs payment recovery for the signed-in customer', () => {
    expect(src('navigation', 'RootNavigator.jsx')).toMatch(/usePaymentRecovery\(\{ user, ready \}\)/);
  });

  it('logout / session-expiry cleanup removes the pending-payment records', () => {
    const text = src('utils', 'sessionCleanup.js');
    expect(text).toMatch(/PENDING_PAYMENT_KEY/);
    expect(text).toMatch(/\['pendingPayments', \(\) => AsyncStorage\.removeItem\(PENDING_PAYMENT_KEY\)\]/);
  });

  it('the recovery code stores no payment secrets and does not log payment URLs', () => {
    const text = src('utils', 'paymentRecovery.js');
    expect(text).not.toMatch(/console\.(log|info|warn|error)/);
    // the record's fields are a fixed, validated list (the stored JSON itself is asserted in paymentRecovery.test.js)
    expect(text).toMatch(/const out = \{ userId, type, merchantTransactionId \};/);
  });

  it('no App Link / https intent filter, assetlinks or new deep-link route was added (F-18 is deferred)', () => {
    const manifest = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toMatch(/android:autoVerify/);
    // (the https entry under <queries> is not an intent filter)
    const filters = manifest.match(/<intent-filter[\s\S]*?<\/intent-filter>/g) || [];
    expect(filters.length).toBeGreaterThan(0);
    for (const filter of filters) expect(filter).not.toMatch(/android:scheme="https"/);
    const app = src('..', 'App.jsx');
    expect(app).not.toMatch(/PaymentVerify|payment-callback/);
  });
});
