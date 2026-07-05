import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency, orderStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function AdminOrdersScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchOrders = useCallback(async (pg = 1, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const { data } = await api.get(`/admin/orders?page=${pg}&limit=20&sort=-createdAt`);
      const list = data.data || data.orders || [];
      setOrders((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 20);
      setPage(pg);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load orders' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchOrders(1); }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('AdminOrderDetail', { orderId: item._id })}
      activeOpacity={0.85}
    >
      <View style={styles.top}>
        <Text style={[styles.id, { color: C.textSecondary }]}>Order #{item._id?.slice(-6).toUpperCase()}</Text>
        <StatusBadge status={item.status} colorMap={orderStatusColor} small />
      </View>
      <Text style={[styles.user, { color: C.text }]}>{item.userId?.name || 'User'}</Text>
      <View style={styles.bottom}>
        <Text style={[styles.date, { color: C.textSecondary }]}>{formatDate(item.createdAt)}</Text>
        <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.totalAmount)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Orders" showBack={false} />
      {loading && page === 1 ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(1, true); }} tintColor={C.primary} />}
          onEndReached={() => {
            if (hasMore && !loading && !loadingMoreRef.current) {
              loadingMoreRef.current = true;
              fetchOrders(page + 1, true).finally(() => { loadingMoreRef.current = false; });
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="No orders found" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  card:   { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  top:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id:     { fontSize: 12, fontWeight: '600' },
  user:   { fontSize: 14, fontWeight: '500' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between' },
  date:   { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '700' },
});
