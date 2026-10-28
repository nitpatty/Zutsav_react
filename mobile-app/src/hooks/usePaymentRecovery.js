import { useEffect } from 'react';
import { AppState } from 'react-native';
import Toast from 'react-native-toast-message';
import { recoverPendingPayments } from '../utils/paymentRecovery';

/**
 * Re-checks the signed-in customer's pending payments (see utils/paymentRecovery) on app launch and every time the app
 * returns to the foreground. It starts only once the session has been restored (`ready`) and a customer is signed in, so
 * no authenticated request is sent before initialisation, and a logged-out / different user never touches anyone's record.
 *
 * It never navigates and never blocks the UI: a confirmed outcome produces a short notice, an unconfirmed one leaves the
 * record in place and the PendingPaymentBanner on the booking / order screens offers "Check status". Overlapping runs,
 * and a screen that is already verifying the same transaction, are handled inside recoverPendingPayments.
 */
export function announceRecovery(results) {
  const kinds = new Set(results.map((r) => r.kind));
  if (kinds.has('paid')) Toast.show({ type: 'success', text1: 'Payment confirmed', text2: 'Your payment has been verified.' });
  if (kinds.has('failed')) Toast.show({ type: 'info', text1: 'A payment was not completed', text2: 'You can retry it from your booking or order.' });
  if (kinds.has('needs_review')) {
    Toast.show({ type: 'error', text1: 'We received a payment we could not apply', text2: 'Please contact support with your order details. Do not pay again.' });
  }
}

export default function usePaymentRecovery({ user, ready }) {
  const userId = user?._id;
  const isCustomer = user?.role === 'user';

  useEffect(() => {
    if (!ready || !userId || !isCustomer) return undefined;
    let cancelled = false;
    const run = () => {
      recoverPendingPayments(userId)
        .then((results) => { if (!cancelled && results.length) announceRecovery(results); })
        .catch(() => { /* recovery is best effort; the banner and the screens remain available */ });
    };
    run(); // cold start (or the moment the session becomes ready)
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') run(); });
    return () => { cancelled = true; subscription?.remove?.(); };
  }, [ready, userId, isCustomer]);
}
