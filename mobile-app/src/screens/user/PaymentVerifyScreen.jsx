import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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

  const [status,  setStatus]  = useState('pending'); // pending | success | failed
  const [polls,   setPolls]   = useState(0);
  const [message, setMessage] = useState('Verifying your payment…');

  useEffect(() => {
    if (!merchantTransactionId) {
      setStatus('failed');
      setMessage('Missing transaction ID');
      return;
    }
    let interval;
    const verify = async () => {
      try {
        const endpoint = type === 'booking' || type === 'booking-remaining'
          ? `/bookings/verify-phonepe/${merchantTransactionId}`
          : `/marketplace/orders/verify-phonepe/${merchantTransactionId}`;

        const { data } = await api.get(endpoint);
        if (data.success || data.status === 'SUCCESS' || data.paymentStatus === 'paid') {
          clearInterval(interval);
          setStatus('success');
          setMessage('Payment successful!');
        }
      } catch (err) {
        const msg = err.response?.data?.message || '';
        if (msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('invalid')) {
          clearInterval(interval);
          setStatus('failed');
          setMessage(msg || 'Payment failed');
        }
        // Otherwise still pending — keep polling
      }
      setPolls((p) => {
        const next = p + 1;
        if (next >= MAX_POLLS) {
          clearInterval(interval);
          setStatus('failed');
          setMessage('Payment verification timed out. Please check your bookings.');
        }
        return next;
      });
    };

    verify();
    interval = setInterval(verify, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [merchantTransactionId]);

  const handleContinue = () => {
    if (orderId) navigation.replace('OrderDetail', { orderId });
    else if (bookingId) navigation.replace('BookingDetail', { bookingId });
    else navigation.replace('BookingsList');
  };

  const continueLabel = orderId ? 'View Order' : (status === 'success' ? 'View Booking' : 'Go to Bookings');

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
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: '#DC262620' }]}>
              <Ionicons name="close-circle" size={64} color="#DC2626" />
            </View>
            <Text style={[styles.title, { color: C.text }]}>Verification Failed</Text>
            <Text style={[styles.sub, { color: C.textSecondary }]}>{message}</Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: C.primary }]}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{continueLabel}</Text>
            </TouchableOpacity>
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
});
