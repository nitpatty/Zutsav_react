import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Animated, ActivityIndicator, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency, resolveBookingBadge } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import { SkeletonCard } from '../../components/shared/Skeleton';

const STATUSES = ['all', 'paid', 'pandit_assigned', 'pandit_accepted', 'completed', 'cancelled', 'pending_payment'];
const STATUS_TAB_LABEL = { pending_payment: 'Failed Payments' };

const STATUS_META = {
  pending_payment:      { label: 'Pending',       bar: '#F59E0B', step: 0 },
  paid:                 { label: 'Confirmed',      bar: '#3B82F6', step: 1 },
  pandit_assigned:      { label: 'Assigned',       bar: '#8B5CF6', step: 2 },
  pandit_accepted:      { label: 'Confirmed',      bar: '#10B981', step: 2 },
  pending_reassignment: { label: 'Finding Pandit', bar: '#F59E0B', step: 1 },
  completion_requested: { label: 'Verifying',      bar: '#6366F1', step: 3 },
  completed:            { label: 'Complete',       bar: '#10B981', step: 4 },
  cancelled:            { label: 'Cancelled',      bar: '#EF4444', step: -1 },
};

const JOURNEY = [
  { id: 0, label: 'Booked' },
  { id: 1, label: 'Confirmed' },
  { id: 2, label: 'Assigned' },
  { id: 3, label: 'Verifying' },
  { id: 4, label: 'Complete' },
];

const CANCELLABLE = ['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment', 'completion_requested'];

function JourneyTracker({ status }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  if (status === 'cancelled') {
    return (
      <View style={[styles.journeyCancel, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
        <View style={[styles.journeyDot, { backgroundColor: '#EF4444' }]} />
        <Text style={[styles.journeyCancelText, { color: '#DC2626' }]}>Booking Cancelled</Text>
      </View>
    );
  }
  if (status === 'pending_reassignment') {
    return (
      <View style={[styles.journeyCancel, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
        <View style={[styles.journeyDot, { backgroundColor: '#F97316' }]} />
        <Text style={[styles.journeyCancelText, { color: '#EA580C' }]}>Finding the right pandit for you…</Text>
      </View>
    );
  }
  const step = STATUS_META[status]?.step ?? 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {JOURNEY.map((s, i) => (
        <React.Fragment key={s.id}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <View style={[
              styles.jStepDot,
              { borderColor: i < step ? '#D4AF37' : i === step ? '#1B1F3B' : '#D1D5DB' },
              { backgroundColor: i < step ? '#D4AF37' : i === step ? '#1B1F3B' : 'white' },
            ]}>
              {i < step ? (
                <Ionicons name="checkmark" size={10} color="#fff" />
              ) : (
                <Text style={{
                  fontSize: 9, fontWeight: '700',
                  color: i === step ? 'white' : '#D1D5DB',
                }}>{i + 1}</Text>
              )}
            </View>
            <Text style={{
              fontSize: 8, fontWeight: '600',
              color: i <= step ? '#1B1F3B' : '#D1D5DB',
            }}>{s.label}</Text>
          </View>
          {i < JOURNEY.length - 1 && (
            <View style={[styles.jConnector, { backgroundColor: i < step ? '#D4AF37' : '#E5E7EB' }]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function PayRemainingBtn({ booking, C }) {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      style={[styles.payRemainBtn, { backgroundColor: C.warning }]}
      onPress={() => navigation.navigate('BookingDetail', { bookingId: booking._id })}
      activeOpacity={0.85}
    >
      <Ionicons name="card" size={14} color="#fff" />
      <Text style={styles.payRemainText}>Pay Remaining {formatCurrency(booking.remainingAmount)}</Text>
    </TouchableOpacity>
  );
}

// Retries payment against the SAME booking — never creates a new booking.
function RetryPaymentBtn({ booking }) {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  const handleRetry = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/bookings/${booking._id}/retry-payment`);
      if (data.alreadyInFlight) {
        Toast.show({ type: 'info', text1: 'Payment already in progress for this booking' });
        setLoading(false);
        return;
      }
      await Linking.openURL(data.redirectUrl);
      navigation.navigate('PaymentVerify', {
        merchantTransactionId: data.merchantTransactionId,
        bookingId: booking._id,
        type: 'booking',
      });
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not start payment' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.payRemainBtn, { backgroundColor: '#DC2626' }]}
      onPress={handleRetry}
      disabled={loading}
      activeOpacity={0.85}
    >
      <Ionicons name="refresh" size={14} color="#fff" />
      <Text style={styles.payRemainText}>{loading ? 'Redirecting…' : 'Retry Payment'}</Text>
    </TouchableOpacity>
  );
}

export default function BookingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState('all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchBookings = useCallback(async (pg = 1, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15, sort: '-createdAt' };
      if (filter !== 'all') params.status = filter;
      const { data } = await api.get('/bookings/my', { params });
      const list = data.data || data.bookings || [];
      setBookings((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load bookings' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { fetchBookings(1); }, [filter]);

  const onRefresh = () => { setRefreshing(true); fetchBookings(1, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchBookings(page + 1, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const renderItem = ({ item }) => {
    const meta = STATUS_META[item.status] || STATUS_META.pending_payment;
    const hasPartial = item.status !== 'pending_payment' && (item.paymentMode === 'PARTIAL' || item.paymentStatus === 'PARTIALLY_PAID');
    const canCancel = CANCELLABLE.includes(item.status);
    const hasKitDelivery = item.withKit && item.kitDelivery;
    const needsPay = item.paymentStatus === 'PARTIALLY_PAID' && item.remainingAmount > 0 && item.status !== 'cancelled';
    const badge = resolveBookingBadge(item);
    const attempts = item.paymentAttempts || [];
    const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item._id })}
        activeOpacity={0.88}
      >
        {/* Top bar */}
        <View style={[styles.cardBar, { backgroundColor: meta.bar }]} />

        <View style={{ padding: 14, gap: 10 }}>
          {/* Header */}
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.poojaName, { color: C.text }]} numberOfLines={1}>
                  {item.poojaId?.name || 'Pooja'}
                </Text>
                {item.bookingNumber && (
                  <Text style={{ fontSize: 9, color: C.textSecondary, fontFamily: 'monospace' }}>
                    #{item.bookingNumber}
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="calendar-outline" size={11} color={C.textSecondary} />
                  <Text style={{ fontSize: 11, color: C.textSecondary }}>{item.scheduledDate ? formatDate(item.scheduledDate) : '—'}</Text>
                </View>
                {item.scheduledTime && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="time-outline" size={11} color={C.textSecondary} />
                    <Text style={{ fontSize: 11, color: C.textSecondary }}>{item.scheduledTime}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.grandTotal || item.totalAmount || item.amount)}</Text>
              <StatusBadge status={badge.value} colorMap={badge.colorMap} small />
            </View>
          </View>

          {/* Failed / pending payment recovery */}
          {item.status === 'pending_payment' && (
            <View style={[styles.notice, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <Ionicons name="alert-circle" size={12} color="#DC2626" />
              <Text style={{ fontSize: 11, color: '#B91C1C', flex: 1 }}>
                {item.paymentStatus === 'FAILED'
                  ? `Payment didn't go through${lastAttempt?.failureReason ? ` (${lastAttempt.failureReason})` : ''}. Your booking is saved.`
                  : 'Payment wasn\'t completed. Your booking is saved — retry anytime.'}
              </Text>
            </View>
          )}
          {item.status === 'pending_payment' && <RetryPaymentBtn booking={item} />}

          {/* Pandit confirmation */}
          {item.status === 'pandit_accepted' && item.panditId && (
            <View style={[styles.notice, { backgroundColor: '#D1FAE520', borderColor: '#10B981' }]}>
              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
              <Text style={{ fontSize: 11, color: '#059669', flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{item.panditId.name}</Text> has confirmed attendance.
              </Text>
            </View>
          )}

          {/* Pending reassignment */}
          {item.status === 'pending_reassignment' && (
            <View style={[styles.notice, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <Ionicons name="time" size={12} color="#EA580C" />
              <Text style={{ fontSize: 11, color: '#EA580C', flex: 1 }}>Finding a new pandit. You will be notified.</Text>
            </View>
          )}

          {/* Kit delivery status */}
          {hasKitDelivery && (
            <View style={[
              styles.notice,
              item.kitDelivery.status === 'delivered'
                ? { backgroundColor: '#D1FAE520', borderColor: '#10B981' }
                : item.kitDelivery.status === 'shipped' || item.kitDelivery.status === 'out_for_delivery'
                ? { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }
                : { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' }
            ]}>
              <Ionicons name="cube" size={12} color="#6B7280" />
              <Text style={{ fontSize: 11, color: '#6B7280', flex: 1 }}>
                Samagri Kit — {item.kitDelivery.status === 'delivered' ? 'Delivered' :
                  item.kitDelivery.status === 'shipped' ? `Shipped${item.kitDelivery.trackingId ? ` · AWB: ${item.kitDelivery.trackingId}` : ''}` :
                  item.kitDelivery.status === 'out_for_delivery' ? 'Out for Delivery' :
                  item.kitDelivery.status === 'packed' ? 'Packed' : 'Being prepared'}
              </Text>
            </View>
          )}

          {/* Partial payment breakdown */}
          {hasPartial && item.status !== 'pending_payment' && (
            <View style={[styles.partialBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: '#9A3412' }}>Amount Paid</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#16A34A' }}>{formatCurrency(item.amountPaid || 0)}</Text>
              </View>
              {item.remainingAmount > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: '#9A3412', fontWeight: '600' }}>Remaining</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>{formatCurrency(item.remainingAmount)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Pay Remaining */}
          {needsPay && <PayRemainingBtn booking={item} C={C} />}

          {/* Bottom: Journey + pandit */}
          <View style={[styles.cardBottom, { borderTopColor: C.border }]}>
            <JourneyTracker status={item.status} />

            {item.panditId && item.status !== 'pending_reassignment' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.panditAvatar, { backgroundColor: C.primary + '20', borderColor: C.primary + '30' }]}>
                  <Ionicons name="person" size={12} color={C.primary} />
                </View>
                <Text style={{ fontSize: 11, color: C.text, fontWeight: '600' }}>{item.panditId.name}</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          {!['pending_payment', 'cancelled'].includes(item.status) && (
            <View style={[styles.actionsRow, { borderTopColor: C.border }]}>
              <TouchableOpacity
                onPress={() => navigation.navigate('BookingDetail', { bookingId: item._id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="document-text-outline" size={13} color={C.primary} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.primary }}>View Invoice</Text>
              </TouchableOpacity>
              {canCancel && (
                <TouchableOpacity
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: item._id })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle-outline" size={13} color="#DC2626" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#DC2626' }}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="My Bookings" showBack={false} />

      {/* Filter chips */}
      <View style={[styles.filterWrap, { backgroundColor: C.surface }]}>
        <FlatList
          horizontal
          data={STATUSES}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.chip, { backgroundColor: filter === s ? C.primary : C.primary + '12' }]}
              onPress={() => setFilter(s)}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, { color: filter === s ? '#fff' : C.primaryDark }]}>
                {s === 'all' ? 'All' : STATUS_TAB_LABEL[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading && page === 1 ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3].map((i) => <SkeletonCard key={i} C={C} />)}
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <EmptyState icon="calendar-outline" title="No bookings" subtitle="Book a pooja to get started" actionLabel="Browse Poojas" onAction={() => navigation.navigate('HomeTab')} />
          }
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  filterWrap:   {},
  card: {
    borderRadius: 20, overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 4,
  },
  cardBar:      { height: 4 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between' },
  poojaName:    { fontSize: 15, fontWeight: '700' },
  amount:       { fontSize: 16, fontWeight: '800' },
  notice:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 8 },
  partialBox:   { borderRadius: 10, borderWidth: 1, padding: 10 },
  cardBottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap', gap: 8 },
  panditAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  actionsRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  journeyCancel: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },
  journeyDot:  { width: 6, height: 6, borderRadius: 3 },
  journeyCancelText: { fontSize: 10, fontWeight: '600' },
  jStepDot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  jConnector:  { width: 16, height: 2, marginBottom: 14 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  payRemainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: 14,
    paddingVertical: 11,
  },
  payRemainText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});