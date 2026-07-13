import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency, bookingStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const STATUSES = ['all', 'paid', 'pandit_assigned', 'pandit_accepted', 'completed', 'cancelled'];

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

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('BookingDetail', { bookingId: item._id })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.poojaName, { color: C.text }]} numberOfLines={1}>
          {item.poojaId?.name || 'Pooja'}
        </Text>
        <StatusBadge status={item.status} colorMap={bookingStatusColor} small />
      </View>
      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: C.textSecondary }]}>Date</Text>
          <Text style={[styles.metaVal, { color: C.text }]}>{item.scheduledDate ? formatDate(item.scheduledDate) : '—'}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: C.textSecondary }]}>Amount</Text>
          <Text style={[styles.metaVal, { color: C.primary }]}>{formatCurrency(item.totalAmount || item.amount)}</Text>
        </View>
        {item.panditId?.name && (
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: C.textSecondary }]}>Pandit</Text>
            <Text style={[styles.metaVal, { color: C.text }]}>{item.panditId.name}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="My Bookings" showBack={false} />

      {/* Filter chips */}
      <View style={[styles.filterWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <FlatList
          horizontal
          data={STATUSES}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.chip, filter === s && { backgroundColor: C.primary }]}
              onPress={() => setFilter(s)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: filter === s ? '#fff' : C.textSecondary }]}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading && page === 1 ? (
        <LoadingSpinner fullScreen />
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
  root:        { flex: 1 },
  filterWrap:  { borderBottomWidth: StyleSheet.hairlineWidth },
  card: {
    borderRadius: 16, borderWidth: 1, padding: 14, gap: 10,
  },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  poojaName:   { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  cardMeta:    { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem:    { gap: 2 },
  metaLabel:   { fontSize: 11 },
  metaVal:     { fontSize: 13, fontWeight: '600' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  chipText:    { fontSize: 12, fontWeight: '600' },
});
