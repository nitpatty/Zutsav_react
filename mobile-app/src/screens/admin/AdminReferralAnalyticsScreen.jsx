import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function AdminReferralAnalyticsScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data } = await api.get('/referral/analytics');
      setStats(data.stats || {});
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load referral analytics' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  const s = stats || {};
  const statCards = [
    { label: 'Total Referrals',   value: s.totalReferrals || 0 },
    { label: 'Booked',            value: s.bookedReferrals || 0 },
    { label: 'Completed',         value: s.completedReferrals || 0 },
    { label: 'Remark Pending',    value: s.remarkPending || 0 },
    { label: 'Conversion Rate',   value: `${s.conversionRate || 0}%` },
  ];
  const topReferrers = s.topReferrers || [];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Referral Analytics" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStats(true); }} tintColor={C.primary} />}
      >
        <View style={styles.statsGrid}>
          {statCards.map((c) => (
            <View key={c.label} style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.statVal, { color: C.text }]}>{c.value}</Text>
              <Text style={[styles.statLabel, { color: C.textSecondary }]}>{c.label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Top Referring Pandits</Text>
          {topReferrers.length === 0 ? (
            <Text style={[styles.emptyText, { color: C.textSecondary }]}>No referrals yet</Text>
          ) : (
            topReferrers.map((item, i) => (
              <View key={item._id || i} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
                <Text style={[styles.rank, { color: C.primary }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: C.text }]} numberOfLines={1}>{item.panditName || 'Unknown'}</Text>
                  <Text style={[styles.sub, { color: C.textSecondary }]}>
                    {item.totalCompleted || 0} completed · {item.totalCreated || 0} created{item.panditCity ? ` · ${item.panditCity}` : ''}
                  </Text>
                </View>
                <Text style={[styles.booked, { color: C.text }]}>{item.totalBooked || 0} booked</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flex: 1, minWidth: '42%', borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 4, alignItems: 'center',
  },
  statVal:      { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  statLabel:    { fontSize: 11, textAlign: 'center' },
  card:         { borderRadius: 16, borderWidth: 1, padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  emptyText:    { fontSize: 13, marginTop: 8 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rank:         { fontSize: 13, fontWeight: '800', width: 18 },
  name:         { fontSize: 14, fontWeight: '700' },
  sub:          { fontSize: 12, marginTop: 2 },
  booked:       { fontSize: 13, fontWeight: '700' },
});
