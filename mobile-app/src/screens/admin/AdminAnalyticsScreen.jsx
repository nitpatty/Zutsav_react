import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import DashboardChart from '../../components/admin/DashboardChart';

export default function AdminAnalyticsScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [dash,       setDash]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/admin/dashboard');
      setDash(data);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load analytics' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  const trends = dash?.trends || {};
  const top    = dash?.top || {};

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Analytics" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboard(true); }} tintColor={C.primary} />}
      >
        <DashboardChart title="Revenue (7 Days)" series={(trends.revenue7d || []).map((d) => ({ date: d.date, value: d.amount }))} formatValue={(n) => `₹${Math.round(n / 1000)}k`} />
        <DashboardChart title="Revenue (30 Days)" series={(trends.revenue30d || []).map((d) => ({ date: d.date, value: d.amount }))} formatValue={(n) => `₹${Math.round(n / 1000)}k`} />
        <DashboardChart title="Bookings Trend (7 Days)" series={(trends.bookings7d || []).map((d) => ({ date: d.date, value: d.count }))} />
        <DashboardChart title="Orders Trend (7 Days)" series={(trends.orders7d || []).map((d) => ({ date: d.date, value: d.count }))} />

        <TopRow title="Top Performing Poojas" data={top.poojas} labelKey="name" valueKey="bookingCount" C={C} />
        <TopRow title="Top Selling Products" data={top.products} labelKey="name" valueKey="orderCount" C={C} />
        <TopRow title="Top Cities" data={top.cities} labelKey="city" valueKey="count" C={C} />
        <TopRow title="Top Referring Pandits" data={top.referringPandits} labelKey="name" valueKey="totalBooked" C={C} />
      </ScrollView>
    </View>
  );
}

function TopRow({ title, data, labelKey, valueKey, C }) {
  if (!data || data.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.sectionTitle, { color: C.text }]}>{title}</Text>
      {data.map((item, i) => (
        <View key={i} style={[styles.topRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
          <Text style={[styles.topRank, { color: C.primary }]}>{i + 1}</Text>
          <Text style={[styles.topName, { color: C.text }]} numberOfLines={1}>{item[labelKey] || '—'}</Text>
          <Text style={[styles.topVal, { color: C.textSecondary }]}>{item[valueKey]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  card:         { borderRadius: 16, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  topRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  topRank:      { fontSize: 13, fontWeight: '800', width: 18 },
  topName:      { flex: 1, fontSize: 13, fontWeight: '600' },
  topVal:       { fontSize: 12, fontWeight: '700' },
});
