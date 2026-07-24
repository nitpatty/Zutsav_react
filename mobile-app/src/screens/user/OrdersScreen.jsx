import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency, orderStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import { SkeletonCard } from '../../components/shared/Skeleton';

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

  const renderItem = ({ item }) => {
    const color = orderStatusColor[item.status] || C.primary;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: C.surface, shadowColor: C.shadow || '#000' }]}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item._id })}
        activeOpacity={0.88}
      >
        <View style={[styles.iconWrap, { backgroundColor: color + '17' }]}>
          <Ionicons name="cube" size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.top}>
            <Text style={[styles.orderId, { color: C.textSecondary }]}>#{item._id?.slice(-6).toUpperCase()}</Text>
            <StatusBadge status={item.status} colorMap={orderStatusColor} small />
          </View>
          <Text style={[styles.itemCount, { color: C.text }]}>{item.items?.length || 0} item(s)</Text>
          <View style={styles.bottom}>
            <Text style={[styles.date, { color: C.textSecondary }]}>{formatDate(item.createdAt)}</Text>
            <Text style={[styles.amount, { color: C.primary }]}>{formatCurrency(item.totalAmount)}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.textLight} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="My Orders" />
      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3].map((i) => <SkeletonCard key={i} C={C} />)}
        </View>
      ) : (
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
  root: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 14,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 10, elevation: 3,
  },
  iconWrap:  { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  top:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId:   { fontSize: 11.5, fontWeight: '600' },
  itemCount: { fontSize: 14, fontWeight: '600', marginTop: 3 },
  bottom:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  date:      { fontSize: 11.5 },
  amount:    { fontSize: 15, fontWeight: '800' },
});
