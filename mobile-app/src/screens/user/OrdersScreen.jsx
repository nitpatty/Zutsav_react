import React, { useState, useEffect, useCallback } from 'react';
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

export default function OrdersScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/marketplace/orders/my', { params: { sort: '-createdAt', limit: 50 } });
      setOrders(data.data || data.orders || []);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load orders' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item._id })}
      activeOpacity={0.85}
    >
      <View style={styles.top}>
        <Text style={[styles.orderId, { color: C.textSecondary }]}>Order #{item._id?.slice(-6).toUpperCase()}</Text>
        <StatusBadge status={item.status} colorMap={orderStatusColor} small />
      </View>
      <Text style={[styles.itemCount, { color: C.text }]}>{item.items?.length || 0} item(s)</Text>
      <View style={styles.bottom}>
        <Text style={[styles.date, { color: C.textSecondary }]}>{formatDate(item.createdAt)}</Text>
        <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.totalAmount)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="My Orders" />
      {loading ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(true); }} tintColor={C.primary} />}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title="No orders yet" subtitle="Place an order from our shop" actionLabel="Go to Shop" onAction={() => navigation.navigate('ShopTab')} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  card:     { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  top:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId:  { fontSize: 12, fontWeight: '600' },
  itemCount:{ fontSize: 14, fontWeight: '500' },
  bottom:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date:     { fontSize: 12 },
  amount:   { fontSize: 15, fontWeight: '800' },
});
