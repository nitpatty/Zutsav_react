import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, formatDate, formatStatus, refundStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const TABS = ['pending', 'approved', 'rejected', 'refunded'];

export default function AdminRefundsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [tab,        setTab]        = useState('pending');
  const [bookings,   setBookings]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRefunds = useCallback(async (t = tab, silent = false) => {
    try {
      if (!silent) setLoading(true);
      let list = [];
      if (t === 'refunded') {
        const [processedRes, completedRes] = await Promise.all([
          api.get('/admin/bookings', { params: { refundStatus: 'processed', limit: 50 } }),
          api.get('/admin/bookings', { params: { refundStatus: 'completed', limit: 50 } }),
        ]);
        list = [...(processedRes.data.bookings || []), ...(completedRes.data.bookings || [])]
          .sort((a, b) => new Date(b.refund?.processedAt || b.updatedAt) - new Date(a.refund?.processedAt || a.updatedAt));
      } else {
        const { data } = await api.get('/admin/bookings', { params: { refundStatus: t, limit: 50 } });
        list = data.bookings || [];
      }
      setBookings(list);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load refunds' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { fetchRefunds(tab); }, [tab]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('AdminRefundDetail', { bookingId: item._id })}
      activeOpacity={0.85}
    >
      <View style={styles.row}>
        <Text style={[styles.bookingNo, { color: C.text }]} numberOfLines={1}>
          {item.bookingNumber || `#${item._id?.slice(-6).toUpperCase()}`}
        </Text>
        <StatusBadge status={item.refund?.status} colorMap={refundStatusColor} small />
      </View>
      <Text style={[styles.meta, { color: C.textSecondary }]}>{item.userId?.name || item.userDetails?.name || '—'}</Text>
      <View style={styles.row}>
        <Text style={[styles.date, { color: C.textSecondary }]}>{item.createdAt ? formatDate(item.createdAt) : ''}</Text>
        <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.refund?.eligibleAmount || item.refund?.refundedAmount || 0)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Refunds" />
      <View style={[styles.tabRow, { borderBottomColor: C.border }]}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: C.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}
          >
            <Text style={{ color: tab === t ? C.primary : C.textSecondary, fontSize: 13, fontWeight: '700' }}>{formatStatus(t)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRefunds(tab, true); }} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="cash-outline" title={`No ${formatStatus(tab).toLowerCase()} refunds`} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  tabRow:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab:       { flex: 1, alignItems: 'center', paddingVertical: 12 },
  card:      { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  bookingNo: { fontSize: 14, fontWeight: '700', flex: 1 },
  meta:      { fontSize: 12 },
  date:      { fontSize: 12 },
  amount:    { fontSize: 14, fontWeight: '800' },
});
