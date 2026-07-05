import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, StatusBar, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency, timeAgo } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import DashboardChart from '../../components/admin/DashboardChart';

const ACTIVITY_CATEGORIES = ['all', 'bookings', 'payments', 'orders', 'shipping', 'referrals', 'users', 'admin'];
const NAV_MAP = { bookings: 'AdminBookingsTab', orders: 'AdminOrdersTab' };

export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [dash,       setDash]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activities, setActivities]         = useState([]);
  const [activityCategory, setActivityCategory] = useState('all');
  const [activityLimit, setActivityLimit]   = useState(20);
  const [activityLoading, setActivityLoading] = useState(false);

  const fetchDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/admin/dashboard');
      setDash(data);
      setActivities(data.recentActivity || []);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load dashboard' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchActivity = useCallback(async (category, limit) => {
    try {
      setActivityLoading(true);
      const { data } = await api.get('/admin/activity-feed', { params: { category, limit } });
      setActivities(data.activities || []);
    } catch {} finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, []);

  const handleCategoryChange = (cat) => {
    setActivityCategory(cat);
    setActivityLimit(20);
    fetchActivity(cat, 20);
  };

  const handleLoadMoreActivity = () => {
    if (activityLoading || activityLimit >= 50) return;
    const next = Math.min(activityLimit + 20, 50);
    setActivityLimit(next);
    fetchActivity(activityCategory, next);
  };

  const handleActivityPress = (item) => {
    const tab = NAV_MAP[item.navigateTo];
    if (tab) navigation.navigate('AdminTabs', { screen: tab });
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const stats = dash?.stats || {};
  const today = dash?.today || {};
  const trends = dash?.trends || {};
  const top = dash?.top || {};

  const statCards = [
    { label: "Today's Revenue",  value: formatCurrency(today.revenue || 0) },
    { label: "Today's Bookings", value: today.bookings || 0 },
    { label: 'Orders Today',     value: today.orders || 0 },
    { label: 'New Users Today',  value: today.newUsers || 0 },
    { label: 'Total Revenue',    value: formatCurrency(stats.totalRevenue || 0) },
    { label: 'Total Bookings',   value: stats.totalBookings || 0 },
    { label: 'Total Orders',     value: stats.totalOrders || 0 },
    { label: 'Active Pandits',   value: stats.totalPandits || 0 },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <View style={[styles.header, { paddingTop: 56, backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="menu" size={26} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.title, { color: C.text }]}>Admin Dashboard</Text>
          <Text style={[styles.sub, { color: C.textSecondary }]}>{user?.name}</Text>
        </View>
        <View style={[styles.adminBadge, { backgroundColor: C.primary + '20' }]}>
          <Text style={[styles.adminBadgeText, { color: C.primary }]}>Admin</Text>
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboard(true); }} tintColor={C.primary} />}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
      >
        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {statCards.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.statVal, { color: C.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: C.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Charts */}
        <DashboardChart title="Revenue (7 Days)" series={(trends.revenue7d || []).map((d) => ({ date: d.date, value: d.amount }))} formatValue={(n) => `₹${Math.round(n / 1000)}k`} />
        <DashboardChart title="Revenue (30 Days)" series={(trends.revenue30d || []).map((d) => ({ date: d.date, value: d.amount }))} formatValue={(n) => `₹${Math.round(n / 1000)}k`} />
        <DashboardChart title="Bookings Trend (7 Days)" series={(trends.bookings7d || []).map((d) => ({ date: d.date, value: d.count }))} />
        <DashboardChart title="Orders Trend (7 Days)" series={(trends.orders7d || []).map((d) => ({ date: d.date, value: d.count }))} />

        {/* Top performers */}
        <TopRow title="Top Performing Poojas" data={top.poojas} labelKey="name" valueKey="bookingCount" C={C} />
        <TopRow title="Top Selling Products" data={top.products} labelKey="name" valueKey="orderCount" C={C} />
        <TopRow title="Top Cities" data={top.cities} labelKey="city" valueKey="count" C={C} />
        <TopRow title="Top Referring Pandits" data={top.referringPandits} labelKey="name" valueKey="totalBooked" C={C} />

        {/* Live activity feed */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Live Activity</Text>
          <FlatList
            horizontal
            data={ACTIVITY_CATEGORIES}
            keyExtractor={(c) => c}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
            renderItem={({ item: c }) => (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: activityCategory === c ? C.primary : C.background, borderColor: C.border }]}
                onPress={() => handleCategoryChange(c)}
              >
                <Text style={{ color: activityCategory === c ? '#fff' : C.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }}>{c}</Text>
              </TouchableOpacity>
            )}
          />
          {activities.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.activityRow, { borderTopColor: C.border }]}
              onPress={() => handleActivityPress(item)}
              activeOpacity={NAV_MAP[item.navigateTo] ? 0.7 : 1}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.activityTitle, { color: C.text }]}>{item.title}</Text>
                <Text style={[styles.activityDesc, { color: C.textSecondary }]}>{item.description}</Text>
              </View>
              <Text style={[styles.activityTime, { color: C.textSecondary }]}>{timeAgo(item.timestamp)}</Text>
            </TouchableOpacity>
          ))}
          {activityLimit < 50 && (
            <TouchableOpacity onPress={handleLoadMoreActivity} style={styles.loadMoreBtn} disabled={activityLoading}>
              <Text style={{ color: C.primary, fontSize: 13, fontWeight: '700' }}>{activityLoading ? 'Loading…' : 'Load More'}</Text>
            </TouchableOpacity>
          )}
        </View>
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
  root:           { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:          { fontSize: 20, fontWeight: '800' },
  sub:            { fontSize: 13, marginTop: 2 },
  adminBadge:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  adminBadgeText: { fontSize: 12, fontWeight: '700' },
  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1, minWidth: '42%', borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 4, alignItems: 'center',
  },
  statVal:        { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  statLabel:      { fontSize: 11, textAlign: 'center' },
  card:           { borderRadius: 16, borderWidth: 1, padding: 14 },
  sectionTitle:   { fontSize: 14, fontWeight: '700' },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  activityRow:    { flexDirection: 'row', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  activityTitle:  { fontSize: 13, fontWeight: '700' },
  activityDesc:   { fontSize: 12, marginTop: 2 },
  activityTime:   { fontSize: 11 },
  loadMoreBtn:    { alignItems: 'center', paddingVertical: 10 },
  topRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  topRank:        { fontSize: 13, fontWeight: '800', width: 18 },
  topName:        { flex: 1, fontSize: 13, fontWeight: '600' },
  topVal:         { fontSize: 12, fontWeight: '700' },
});
