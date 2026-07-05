import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency, bookingStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const FILTERS = [
  { key: 'all',              label: 'All',             status: null },
  { key: 'action_required',  label: 'Action Required', status: 'pandit_assigned' },
  { key: 'upcoming',         label: 'Upcoming',        status: 'pandit_accepted' },
  { key: 'pending',          label: 'Pending',         status: 'completion_requested' },
  { key: 'completed',        label: 'Completed',       status: 'completed' },
  { key: 'cancelled',        label: 'Cancelled',       status: 'cancelled' },
  { key: 'reassigned',       label: 'Reassigned',      status: 'pandit_assigned', clientFilter: (b) => b.wasReassigned === true },
  { key: 'referral',         label: 'Referral',        status: null, clientFilter: (b) => Boolean(b.referral?.referralId) },
];

export default function PanditBookingsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [filterKey,  setFilterKey]  = useState('all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const [acting,     setActing]     = useState(null);
  const loadingMoreRef = useRef(false);

  const activeFilter = FILTERS.find((f) => f.key === filterKey);

  const fetchBookings = useCallback(async (pg = 1, q = search, fk = filterKey, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const f = FILTERS.find((x) => x.key === fk);
      const params = { page: pg, limit: 15 };
      if (f?.status) params.status = f.status;
      if (q.trim()) params.search = q.trim();
      const { data } = await api.get('/pandits/me/bookings', { params });
      let list = data.bookings || [];
      if (f?.clientFilter) list = list.filter(f.clientFilter);
      setBookings((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore((data.bookings || []).length === 15);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load bookings' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, filterKey]);

  useEffect(() => { fetchBookings(1); }, [filterKey]);

  const onRefresh = () => { setRefreshing(true); fetchBookings(1, search, filterKey, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchBookings(page + 1, search, filterKey, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const handleAccept = async (bookingId) => {
    try {
      setActing(bookingId);
      await api.patch(`/pandits/me/bookings/${bookingId}/accept`);
      Toast.show({ type: 'success', text1: 'Booking accepted!' });
      fetchBookings(1, search, filterKey, true);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Failed' });
    } finally {
      setActing(null);
    }
  };

  const handleReject = (bookingId) => {
    Alert.alert(
      'Reject Booking',
      'You\'ll need to provide a reason on the next screen. Open booking detail to reject?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Booking', onPress: () => navigation.navigate('PanditBookingDetail', { bookingId }) },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('PanditBookingDetail', { bookingId: item._id })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.poojaName, { color: C.text }]} numberOfLines={1}>{item.poojaId?.name || 'Pooja'}</Text>
        <StatusBadge status={item.status} colorMap={bookingStatusColor} small />
      </View>
      <Text style={[styles.userName, { color: C.textSecondary }]}>{item.userId?.name || item.userDetails?.name || 'Devotee'}</Text>
      <View style={styles.meta}>
        <Text style={[styles.date, { color: C.textSecondary }]}>{item.scheduledDate ? formatDate(item.scheduledDate) : '—'}</Text>
        <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.grandTotal || item.amount || 0)}</Text>
      </View>

      {item.status === 'pandit_assigned' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: '#16A34A' }]}
            onPress={() => handleAccept(item._id)}
            disabled={acting === item._id}
          >
            <Text style={styles.actionBtnText}>{acting === item._id ? '…' : 'Accept'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.rejectBtn, { borderColor: '#DC2626' }]}
            onPress={() => handleReject(item._id)}
            disabled={acting === item._id}
          >
            <Text style={[styles.rejectBtnText, { color: '#DC2626' }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="My Bookings" showBack={false} />

      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search booking # or devotee…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchBookings(1, search, filterKey)}
          />
        </View>
      </View>

      <View style={[styles.filterWrap, { borderBottomColor: C.border }]}>
        <FlatList
          horizontal data={FILTERS} keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item: f }) => (
            <TouchableOpacity style={[styles.chip, filterKey === f.key && { backgroundColor: C.primary }]} onPress={() => setFilterKey(f.key)} activeOpacity={0.8}>
              <Text style={[styles.chipText, { color: filterKey === f.key ? '#fff' : C.textSecondary }]}>{f.label}</Text>
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
          ListEmptyComponent={<EmptyState icon="calendar-outline" title="No bookings" subtitle={activeFilter?.label !== 'All' ? `No ${activeFilter?.label.toLowerCase()} bookings` : undefined} />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  filterWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  poojaName:  { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  userName:   { fontSize: 13 },
  meta:       { flexDirection: 'row', justifyContent: 'space-between' },
  date:       { fontSize: 12 },
  amount:     { fontSize: 14, fontWeight: '700' },
  actionRow:  { flexDirection: 'row', gap: 10, marginTop: 4 },
  acceptBtn:  { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectBtn:  { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtnText: { fontWeight: '700', fontSize: 13 },
  chip:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipText:   { fontSize: 12, fontWeight: '600' },
});
