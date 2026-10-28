import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import {
  verifyTransaction, savePendingPayment, removePendingPayment, markVerificationActive,
  openPaymentPage, resumeBookingPayment, bookingTypeForTxn, isValidTransactionId,
} from '../../utils/paymentRecovery';
import { useTranslation } from '../../i18n';

// The gateway took a payment that the order could no longer accept (it had expired, was cancelled, or was already
// paid by another attempt). The server records it for manual reconciliation; the customer must not pay again.
// (Messages are kept as { key } for our own wording — translated where rendered, so the verification effect never depends on
// the UI language — or { raw } for text the server supplied, which is shown exactly as received.)
const NEEDS_REVIEW_MESSAGE = { key: 'payment.needsReview' };

const POLL_INTERVAL = 3000;
const MAX_POLLS = 20; // 1 minute

export default function PaymentVerifyScreen({ navigation, route }) {
  const { merchantTransactionId, bookingId, orderId, type = 'booking' } = route.params || {};
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [status,  setStatus]  = useState('pending'); // pending | success | timeout | failed
  const [polls,   setPolls]   = useState(0);
  const [message, setMessage] = useState({ key: 'payment.verifying' });
  const [needsReview, setNeedsReview] = useState(false);
  const [checkAgainCount, setCheckAgainCount] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const statusRef = useRef('pending');
  const userId = useAuthStore((s) => s.user?._id);

  useEffect(() => {
    if (!merchantTransactionId) {
      setStatus('failed');
      setMessage({ key: 'payment.missingTxn' });
      return undefined;
    }
    let interval;
    let cancelled = false;
    let finished = false;
    setStatus('pending');
    statusRef.current = 'pending';
    setPolls(0);
    setNeedsReview(false);
    setMessage({ key: 'payment.verifying' });

    // Remember this payment BEFORE verifying so it can be found again if the app is killed or the user comes back later
    // (utils/paymentRecovery). The record is a pointer only; the verdict below always comes from the server.
    const context = { type, merchantTransactionId, bookingId, orderId };
    if (userId) savePendingPayment(userId, context).catch(() => {});
    // The background recovery run leaves a transaction alone while this screen is verifying it.
    const release = markVerificationActive(merchantTransactionId);

    const settle = (nextStatus, nextMessage, review = false) => {
      finished = true;
      clearInterval(interval);
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      setNeedsReview(review);
      setMessage(nextMessage);
      // The server gave a terminal answer: nothing is left to recover.
      if (userId) removePendingPayment(userId, merchantTransactionId).catch(() => {});
    };

    // `booking-remaining` (Pay Remaining top-ups) is tracked on a separate
    // endpoint from a standard/retry booking payment — using the wrong one
    // here previously caused false "verification timed out" results on
    // successful partial payments. Marketplace orders: unified checkout
    // transactions (ZUT_CART_…) → /checkout/verify; an older legacy order keeps
    // its own route (see utils/marketplaceCheckout.verifyEndpoint). Success is
    // only ever what the server's verify response says — never the browser return.
    // verifyTransaction shares ONE in-flight request per transaction with the background recovery run.
    const verify = async () => {
      if (cancelled || finished) return;
      // No requests while the app is in the background (the user is paying in PhonePe). A skipped tick is not a poll.
      if (AppState.currentState === 'background' || AppState.currentState === 'inactive') return;

      const outcome = await verifyTransaction({ type, merchantTransactionId });
      if (cancelled || finished) return;

      if (outcome.kind === 'paid') { settle('success', { key: 'payment.success' }); return; }
      if (outcome.kind === 'needs_review') { settle('failed', NEEDS_REVIEW_MESSAGE, true); return; }
      // Booking/order verify endpoints respond 200 with success:false + a terminal gateway `state` on real
      // failures — only a non-PENDING state means the payment actually failed.
      if (outcome.kind === 'failed') { settle('failed', outcome.code ? { raw: outcome.code } : { key: 'payment.failedGeneric' }); return; }
      // pending, unknown record, offline, 5xx …: keep waiting. Never a failure and never a success.

      setPolls((p) => {
        const next = p + 1;
        if (next >= MAX_POLLS) {
          clearInterval(interval);
          statusRef.current = 'timeout';
          setStatus('timeout');
          // Running out of checks says nothing about the payment: it stays on record and is re-checked later.
          setMessage({ key: 'payment.timeoutMsg' });
        }
        return next;
      });
    };

    // Coming back from PhonePe / the browser: verify right away (single-flight), and give a timed-out screen a fresh window.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || cancelled || finished) return;
      if (statusRef.current === 'timeout') { setCheckAgainCount((c) => c + 1); return; }
      verify();
    });

    verify();
    interval = setInterval(verify, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription?.remove?.();
      release();
    };
  }, [merchantTransactionId, type, checkAgainCount, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleContinue = () => {
    if (orderId) navigation.replace('OrderDetail', { orderId });
    else if (bookingId) navigation.replace('BookingDetail', { bookingId });
    else navigation.replace('BookingsList');
  };

  const handleCheckAgain = () => setCheckAgainCount((c) => c + 1);

  // Retry against the SAME booking — only offered for the standard booking flow,
  // never creates a new booking.
  const handleRetryPayment = async () => {
    if (!bookingId) { handleContinue(); return; }
    setRetrying(true);
    try {
      const { data } = await api.post(`/bookings/${bookingId}/retry-payment`);
      if (data.alreadyInFlight) {
        // The server already has a live attempt: never start another — verify THAT transaction (only the id it returned).
        if (data.merchantTransactionId === merchantTransactionId) {
          Toast.show({ type: 'info', text1: t('payment.stillBeingConfirmed') });
          setRetrying(false);
          handleCheckAgain();
          return;
        }
        const resumed = await resumeBookingPayment({ navigation, userId, bookingId, merchantTransactionId: data.merchantTransactionId, replace: true });
        if (!resumed) {
          Toast.show({ type: 'info', text1: t('bookings.attemptInProgress'), text2: t('payment.openBookingCheck') });
          handleContinue();
        }
        return;
      }
      if (!isValidTransactionId(data.merchantTransactionId)) throw new Error('Unexpected retry response');
      const opened = await openPaymentPage({
        userId,
        context: { type: 'booking', merchantTransactionId: data.merchantTransactionId, bookingId },
        redirectUrl: data.redirectUrl,
      });
      if (!opened.opened) {
        Toast.show({ type: 'error', text1: opened.reason === 'invalid_url' ? t('orders.retryInvalidLink') : t('bookings.startFailed') });
        setRetrying(false);
        return;
      }
      navigation.replace('PaymentVerify', {
        merchantTransactionId: data.merchantTransactionId,
        bookingId,
        type: 'booking',
      });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || t('bookings.startFailed') });
      setRetrying(false);
    }
  };

  const continueLabel = orderId ? t('payment.viewOrder') : (status === 'success' ? t('payment.viewBooking') : t('payment.goToBookings'));
  const messageText = message.key ? t(message.key) : message.raw;
  const canRetryPayment = type === 'booking' && !!bookingId;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <View style={styles.center}>
        {status === 'pending' ? (
          <>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.title, { color: C.text }]}>{t('payment.verifyingTitle')}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{t('payment.verifyingSub')}</Text>
            <Text style={[styles.hint, { color: C.textSecondary }]}>{t('payment.checks', { polls, max: MAX_POLLS })}</Text>
          </>
        ) : status === 'success' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#16A34A20' }]}>
              <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            </View>
            <Text style={[styles.title, { color: C.text }]}>{t('payment.successTitle')}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{messageText}</Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: C.primary }]}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{continueLabel}</Text>
            </TouchableOpacity>
          </>
        ) : status === 'timeout' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#D9770620' }]}>
              <Ionicons name="time" size={64} color="#D97706" />
            </View>
            <Text style={[styles.title, { color: C.text }]}>{t('payment.stillConfirming')}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{messageText}</Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: C.primary, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
              onPress={handleCheckAgain}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.btnText}>{t('payment.checkAgain')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleContinue} activeOpacity={0.7}>
              <Text style={[styles.linkText, { color: C.primary }]}>{continueLabel}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#DC262620' }]}>
              <Ionicons name="close-circle" size={64} color="#DC2626" />
            </View>
            <Text style={[styles.title, { color: C.text }]}>{t('orders.statusPaymentFailed')}</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>
              {canRetryPayment ? t('payment.bookingSavedRetry') : messageText}
            </Text>
            {type === 'marketplace' && !needsReview ? (
              <Text style={[styles.hint, { color: C.textSecondary }]}>
                {t('payment.orderSavedRetry')}
              </Text>
            ) : null}
            {canRetryPayment ? (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#DC2626', flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                onPress={handleRetryPayment}
                disabled={retrying}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.btnText}>{retrying ? t('bookings.redirecting') : t('orders.retryPayment')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: C.primary }]}
                onPress={handleContinue}
                activeOpacity={0.85}
              >
                <Text style={styles.btnText}>{continueLabel}</Text>
              </TouchableOpacity>
            )}
            {canRetryPayment && (
              <TouchableOpacity onPress={handleContinue} activeOpacity={0.7}>
                <Text style={[styles.linkText, { color: C.primary }]}>{continueLabel}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub:        { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  hint:       { fontSize: 11 },
  btn: {
    marginTop: 8, borderRadius: 14, paddingHorizontal: 40, paddingVertical: 15,
    alignSelf: 'stretch', alignItems: 'center',
  },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkText:   { fontSize: 13, fontWeight: '700', marginTop: 4 },
});
