import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { loadPendingPayments, subscribePendingPayments } from '../../utils/paymentRecovery';
import { useTranslation } from '../../i18n';

/**
 * Recovery entry point shown on the booking / order screens: "a payment is still being confirmed — Check status".
 * It reads the user's own pending-payment record (utils/paymentRecovery), never shows another account's, and sends the
 * user to the normal PaymentVerify screen, which asks the SERVER. Nothing here says a payment succeeded.
 *   navigation the host screen's navigation object (used to open PaymentVerify)
 *   kind       'booking' | 'marketplace'  — which flow's payments to show
 *   bookingId / orderId                   — optionally only the payment of that booking / order (detail screens)
 *   onResolved ()                         — called when a pending payment of this screen was confirmed/closed, so the
 *                                           screen can re-read the booking / order from the server
 */
export default function PendingPaymentBanner({ navigation, kind, bookingId, orderId, onResolved }) {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const userId = useAuthStore((s) => s.user?._id);
  const [pending, setPending] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId) { setPending(null); return; }
    const items = await loadPendingPayments(userId);
    const mine = items.find((p) => {
      if (kind === 'marketplace') return p.type === 'marketplace' && (!orderId || p.orderId === orderId);
      return p.type !== 'marketplace' && (!bookingId || p.bookingId === bookingId);
    });
    setPending(mine || null);
  }, [userId, kind, bookingId, orderId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Every save / removal of a pending payment (PaymentVerify, the recovery run, a payment hand-off) emits an event, so the
  // banner stays current without its own navigation listener.
  useEffect(() => subscribePendingPayments((event) => {
    refresh();
    if (event?.type === 'resolved' && onResolved) onResolved();
  }), [refresh, onResolved]);

  if (!pending) return null;

  const open = () => navigation.navigate('PaymentVerify', {
    merchantTransactionId: pending.merchantTransactionId,
    bookingId: pending.bookingId,
    orderId: pending.orderId,
    type: pending.type,
  });

  return (
    <View style={[styles.box, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]} testID="pending-payment-banner">
      <Ionicons name="time-outline" size={20} color="#B45309" />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: '#92400E' }]}>{t('orders.bannerTitle')}</Text>
        <Text style={[styles.sub, { color: C.textSecondary }]}>{t('orders.bannerSub')}</Text>
      </View>
      <TouchableOpacity style={[styles.btn, { borderColor: '#B45309' }]} onPress={open} accessibilityRole="button" accessibilityLabel={t('orders.checkStatusLabel')}>
        <Text style={styles.btnText}>{t('orders.checkStatus')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginHorizontal: 16, marginTop: 10 },
  title:   { fontSize: 13, fontWeight: '700' },
  sub:     { fontSize: 11, marginTop: 2, lineHeight: 16 },
  btn:     { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { color: '#B45309', fontSize: 12, fontWeight: '700' },
});
