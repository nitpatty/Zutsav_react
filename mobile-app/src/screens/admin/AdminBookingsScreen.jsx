import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency, bookingStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const STATUSES = ['all', 'paid', 'pandit_assigned', 'pandit_accepted', 'completed', 'cancelled'];

export default function AdminBookingsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState(route.params?.initialStatus || 'all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  // FlatList's onEndReached can fire more than once before `loading` state
  // (async/batched) catches up — a synchronous ref is what actually prevents
  // the same page being fetched (and appended) twice, which was producing
  // duplicate-key React warnings.
  const loadingMoreRef = useRef(false);

  const fetchBookings = useCallback(async (pg = 1, q = search, st = status, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 20, sort: '-createdAt' };
      if (q.trim()) params.search = q.trim();
      if (st !== 'all') params.status = st;
      const { data } = await api.get('/admin/bookings', { params });
      const list = data.data || data.bookings || [];
      setBookings((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 20);
      setPage(pg);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load bookings' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [search, status]);

  useEffect(() => { fetchBookings(1, search, status); }, [status]);

  const handleStatusChange = (s) => setStatus(s);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('AdminBookingDetail', { bookingId: item._id })}
      activeOpacity={0.85}
    >
      <View style={styles.top}>
        <Text style={[styles.poojaName, { color: C.text }]} numberOfLines={1}>{item.poojaId?.name || 'Pooja'}</Text>
        <StatusBadge status={item.status} colorMap={bookingStatusColor} small />
      </View>
      <Text style={[styles.meta, { color: C.textSecondary }]}>
        User: {item.userId?.name || '—'} | Pandit: {item.panditId?.userId?.name || item.panditId?.name || 'Unassigned'}
      </Text>
      <View style={styles.bottom}>
        <Text style={[styles.date, { color: C.textSecondary }]}>{item.scheduledDate ? formatDate(item.scheduledDate) : '—'}</Text>
        <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.totalAmount || item.amount || 0)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Bookings" showBack={false} />
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <TextInput style={[styles.searchInput, { color: C.text }]} value={search} onChangeText={setSearch} placeholder="Search bookings…" placeholderTextColor={C.textSecondary} returnKeyType="search" onSubmitEditing={() => fetchBookings(1, search, status)} />
        </View>
        <FlatList
          horizontal
          data={STATUSES}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingTop: 10 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.chip, status === s && { backgroundColor: C.primary }]}
              onPress={() => handleStatusChange(s)}
              activeOpacity={0.8}
            >
              <Text style={{ color: status === s ? '#fff' : C.textSecondary, fontSize: 12, fontWeight: '600' }}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {loading && page === 1 ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(1, search, status, true); }} tintColor={C.primary} />}
          onEndReached={() => {
            if (hasMore && !loading && !loadingMoreRef.current) {
              loadingMoreRef.current = true;
              fetchBookings(page + 1, search, status, true).finally(() => { loadingMoreRef.current = false; });
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="calendar-outline" title="No bookings found" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  chip:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  card:        { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  top:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  poojaName:   { fontSize: 14, fontWeight: '700', flex: 1 },
  meta:        { fontSize: 12 },
  bottom:      { flexDirection: 'row', justifyContent: 'space-between' },
  date:        { fontSize: 12 },
  amount:      { fontSize: 14, fontWeight: '700' },
});
