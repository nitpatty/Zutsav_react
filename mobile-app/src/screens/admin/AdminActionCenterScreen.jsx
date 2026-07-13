import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';

export default function AdminActionCenterScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [pending,    setPending]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPending = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/admin/dashboard');
      setPending(data.pending || {});
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load Action Center' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  const p = pending || {};
  const cards = [
    {
      key: 'unassignedBookings', count: p.unassignedBookings,
      icon: 'person-add-outline', color: '#D97706',
      title: (n) => `${n} Booking${n === 1 ? '' : 's'} Waiting for Pandit Assignment`,
      onPress: () => navigation.navigate('AdminTabs', { screen: 'AdminBookingsTab', params: { screen: 'AdminBookingsList', params: { initialStatus: 'paid' } } }),
    },
    {
      key: 'refunds', count: p.refunds,
      icon: 'cash-outline', color: '#DC2626',
      title: (n) => `${n} Refund Request${n === 1 ? '' : 's'} Pending`,
      onPress: () => navigation.navigate('Refunds'),
    },
    {
      key: 'blogApprovals', count: p.blogApprovals,
      icon: 'newspaper-outline', color: '#2563EB',
      title: (n) => `${n} Blog${n === 1 ? '' : 's'} Waiting for Approval`,
      onPress: () => navigation.navigate('Blogs'),
    },
    {
      key: 'ordersAwaitingShipment', count: p.ordersAwaitingShipment,
      icon: 'cube-outline', color: '#7C3AED',
      title: (n) => `${n} Marketplace Order${n === 1 ? '' : 's'} Waiting for Shipment`,
      onPress: () => navigation.navigate('AdminTabs', { screen: 'AdminOrdersTab' }),
    },
    {
      key: 'highValueBookings', count: p.highValueBookings,
      icon: 'trophy-outline', color: '#16A34A',
      title: (n) => `${n} High Value Booking${n === 1 ? '' : 's'}`,
      onPress: () => navigation.navigate('AdminTabs', { screen: 'AdminBookingsTab', params: { screen: 'AdminBookingsList', params: { initialStatus: 'paid' } } }),
    },
    {
      key: 'kyc', count: p.kyc,
      icon: 'shield-checkmark-outline', color: '#0891B2',
      title: (n) => `${n} KYC Request${n === 1 ? '' : 's'} Pending`,
      onPress: () => navigation.navigate('Pandits'),
    },
    {
      key: 'payments', count: p.payments,
      icon: 'card-outline', color: '#EA580C',
      title: (n) => `${n} Pending Payment${n === 1 ? '' : 's'}`,
      onPress: () => navigation.navigate('AdminTabs', { screen: 'AdminBookingsTab' }),
    },
  ].filter((c) => (c.count || 0) > 0);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Action Center" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPending(true); }} tintColor={C.primary} />}
      >
        {cards.length === 0 ? (
          <EmptyState icon="checkmark-done-circle-outline" title="All caught up" subtitle="Nothing needs your attention right now" />
        ) : (
          cards.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={c.onPress}
              activeOpacity={0.85}
            >
              <View style={[styles.iconWrap, { backgroundColor: c.color + '18' }]}>
                <Ionicons name={c.icon} size={22} color={c.color} />
              </View>
              <Text style={[styles.cardText, { color: C.text }]}>{c.title(c.count)}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1 },
  card:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  iconWrap:  { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardText:  { flex: 1, fontSize: 14, fontWeight: '600' },
});
