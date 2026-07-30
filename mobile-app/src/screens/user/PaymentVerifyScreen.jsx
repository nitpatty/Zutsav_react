import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 20; // 1 minute

export default function PaymentVerifyScreen({ navigation, route }) {
  const { merchantTransactionId, bookingId, orderId, type = 'booking' } = route.params || {};
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [status,  setStatus]  = useState('pending'); // pending | success | timeout | failed
  const [polls,   setPolls]   = useState(0);
  const [message, setMessage] = useState('Verifying your payment…');
  const [checkAgainCount, setCheckAgainCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!merchantTransactionId) {
      setStatus('failed');
      setMessage('Missing transaction ID');
      return;
    }
    let interval;
    let cancelled = false;
    setStatus('pending');
    setPolls(0);
    setMessage('Verifying your payment…');

    // `booking-remaining` (Pay Remaining top-ups) is tracked on a separate
    // endpoint from a standard/retry booking payment — using the wrong one
    // here previously caused false "verification timed out" results on
    // successful partial payments.
    const endpoint = type === 'booking-remaining'
      ? `/bookings/verify-remaining/${merchantTransactionId}`
      : type === 'booking'
      ? `/bookings/verify-phonepe/${merchantTransactionId}`
      : `/marketplace/orders/verify-phonepe/${merchantTransactionId}`;

    const verify = async () => {
      try {
        const { data } = await api.get(endpoint);
        if (cancelled) return;

        if (data.success || data.alreadyVerified) {
          clearInterval(interval);
          setStatus('success');
          setMessage('Payment successful!');
          return;
        }

        // Booking/order verify endpoints respond 200 with success:false + a
        // terminal gateway `state` on real failures (they don't throw an HTTP
        // error) — only a non-PENDING state means the payment actually failed.
        if (data.state && data.state !== 'PENDING') {
          clearInterval(interval);
          setStatus('failed');
          setMessage(data.code || data.state || 'Payment failed');
          return;
        }
        // Still PENDING — keep polling.
      } catch {
        // Transient/network error — keep polling rather than failing early.
      }
      setPolls((p) => {
        const next = p + 1;
        if (next >= MAX_POLLS) {
          clearInterval(interval);
          setStatus('timeout');
          setMessage('Still waiting for confirmation. You can check again or view your bookings.');
        }
        return next;
      });
    };

    verify();
    interval = setInterval(verify, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(interval); };
  }, [merchantTransactionId, type, checkAgainCount]);

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
        Toast.show({ type: 'info', text1: 'A payment attempt is already in progress' });
        handleContinue();
        return;
      }
      await Linking.openURL(data.redirectUrl);
      navigation.replace('PaymentVerify', {
        merchantTransactionId: data.merchantTransactionId,
        bookingId,
        type: 'booking',
      });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not start payment' });
      setRetrying(false);
    }
  };

  const continueLabel = orderId ? 'View Order' : (status === 'success' ? 'View Booking' : 'Go to Bookings');
  const canRetryPayment = type === 'booking' && !!bookingId;

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <View style={styles.center}>
        {status === 'pending' ? (
          <>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={[styles.title, { color: C.text }]}>Verifying Payment</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>Please wait while we confirm your payment…</Text>
            <Text style={[styles.hint, { color: C.textSecondary }]}>({polls}/{MAX_POLLS} checks)</Text>
          </>
        ) : status === 'success' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#16A34A20' }]}>
              <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
            </View>
            <Text style={[styles.title, { color: C.text }]}>Payment Successful!</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{message}</Text>
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
            <Text style={[styles.title, { color: C.text }]}>Still Confirming</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{message}</Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: C.primary, flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
              onPress={handleCheckAgain}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.btnText}>Check Again</Text>
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
            <Text style={[styles.title, { color: C.text }]}>Payment Failed</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>
              {canRetryPayment ? 'Your booking is saved — you can retry the same booking anytime.' : message}
            </Text>
            {canRetryPayment ? (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#DC2626', flexDirection: 'row', justifyContent: 'center', gap: 8 }]}
                onPress={handleRetryPayment}
                disabled={retrying}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.btnText}>{retrying ? 'Redirecting…' : 'Retry Payment'}</Text>
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
