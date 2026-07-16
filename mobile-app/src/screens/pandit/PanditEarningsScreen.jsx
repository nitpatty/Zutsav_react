import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import DashboardChart from '../../components/admin/DashboardChart';

const TABS = [
  { key: 'stats',   label: 'Overview' },
  { key: 'pending', label: 'Pending' },
  { key: 'history', label: 'History' },
  { key: 'reviews', label: 'Reviews' },
];

export default function PanditEarningsScreen() {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [tab,        setTab]        = useState('stats');
  const [stats,      setStats]      = useState(null);
  const [pending,    setPending]    = useState([]);
  const [history,    setHistory]    = useState([]);
  const [reviews,    setReviews]    = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ averageRating: 0, totalReviews: 0 });
  const [dailyTrend, setDailyTrend] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [statsRes, pendingRes, historyRes, ratingsRes, dashRes] = await Promise.all([
        api.get('/pandits/me/payouts/stats'),
        api.get('/pandits/me/payouts/pending'),
        api.get('/pandits/me/payouts/history'),
        api.get('/pandits/me/ratings'),
        api.get('/pandits/me/dashboard'),
      ]);
      setStats(statsRes.data.stats || {});
      setPending(pendingRes.data.bookings || []);
      setHistory(historyRes.data.batches || []);
      setReviews(ratingsRes.data.ratings || []);
      setReviewSummary({ averageRating: ratingsRes.data.averageRating || 0, totalReviews: ratingsRes.data.totalReviews || 0 });
      setDailyTrend(dashRes.data.trends?.daily || []);
      setMonthlyTrend(dashRes.data.trends?.monthly || []);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load earnings' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  if (loading) return <LoadingSpinner fullScreen />;

  const renderPending = () => (
    pending.length === 0 ? (
      <Text style={[styles.empty, { color: C.textSecondary }]}>No pending payouts</Text>
    ) : (
      pending.map((item) => {
        const approved = item.approvedPayout ?? item.payout?.amount ?? 0;
        const waiting  = approved <= 0;
        return (
          <View key={item._id} style={[styles.txRow, { borderBottomColor: C.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.txName, { color: C.text }]}>{item.poojaId?.name || 'Booking Payout'}</Text>
              <Text style={[styles.txDate, { color: C.textSecondary }]}>{formatDate(item.verifiedAt || item.scheduledDate)}</Text>
              <Text style={[styles.txStatus, { color: waiting ? C.textSecondary : '#D97706' }]}>
                {item.status || (waiting ? 'Waiting for Admin Approval' : 'Awaiting Admin Payout')}
              </Text>
            </View>
            <Text style={[styles.txAmount, { color: waiting ? C.textSecondary : '#D97706' }]}>
              {waiting ? '—' : formatCurrency(approved)}
            </Text>
          </View>
        );
      })
    )
  );

  const renderHistory = () => (
    history.length === 0 ? (
      <Text style={[styles.empty, { color: C.textSecondary }]}>No payout history</Text>
    ) : (
      history.map((item) => (
        <View key={item._id} style={[styles.txRow, { borderBottomColor: C.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.txName, { color: C.text }]}>{item.batchId} ({item.bookings?.length || 0} pooja{item.bookings?.length === 1 ? '' : 's'})</Text>
            <Text style={[styles.txDate, { color: C.textSecondary }]}>{formatDate(item.paidDate)}</Text>
          </View>
          <Text style={[styles.txAmount, { color: '#16A34A' }]}>+{formatCurrency(item.totalAmount || 0)}</Text>
        </View>
      ))
    )
  );

  const renderReviews = () => (
    <View>
      <View style={styles.reviewSummary}>
        <Text style={[styles.reviewAvg, { color: C.text }]}>{reviewSummary.averageRating.toFixed(1)} ★</Text>
        <Text style={[styles.reviewCount, { color: C.textSecondary }]}>{reviewSummary.totalReviews} review{reviewSummary.totalReviews === 1 ? '' : 's'}</Text>
      </View>
      {reviews.length === 0 ? (
        <Text style={[styles.empty, { color: C.textSecondary }]}>No reviews yet</Text>
      ) : (
        reviews.map((r, i) => (
          <View key={i} style={[styles.reviewRow, { borderBottomColor: C.border }]}>
            <View style={styles.reviewStars}>
              {[1, 2, 3, 4, 5].map((v) => (
                <Ionicons key={v} name={v <= r.rating ? 'star' : 'star-outline'} size={14} color="#D97706" />
              ))}
              <Text style={[styles.reviewPooja, { color: C.textSecondary }]}>{r.poojaId?.name || ''}</Text>
            </View>
            {r.review ? <Text style={[styles.reviewText, { color: C.text }]}>{r.review}</Text> : null}
            <Text style={[styles.txDate, { color: C.textSecondary }]}>{formatDate(r.ratingDate || r.completedAt)}</Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Earnings" />

      <View style={[styles.tabRow, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && { borderBottomWidth: 2, borderBottomColor: C.primary }]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? C.primary : C.textSecondary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(true); }} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {tab === 'stats' && (
          <View>
            <View style={styles.statsGrid}>
              <StatCard label="Total Earned" value={formatCurrency(stats?.totalEarned || 0)} C={C} />
              <StatCard label="Pending Amount" value={formatCurrency(stats?.pendingAmount || 0)} C={C} color="#D97706" />
              <StatCard label="Paid Amount" value={formatCurrency(stats?.paidAmount || 0)} C={C} color="#16A34A" />
              <StatCard label="Payout Batches" value={String(stats?.paidCount || 0)} C={C} />
            </View>
            <View style={{ paddingHorizontal: 16, gap: 16 }}>
              <DashboardChart
                title="Monthly Earnings (30 Days)"
                series={dailyTrend.map((d) => ({ date: d.date, value: d.value }))}
                formatValue={(n) => `₹${Math.round(n / 1000)}k`}
              />
              <DashboardChart
                title="Yearly Earnings (12 Months)"
                series={monthlyTrend.map((d) => ({ date: d._id, value: d.value }))}
                formatValue={(n) => `₹${Math.round(n / 1000)}k`}
              />
            </View>
          </View>
        )}

        {(tab === 'pending' || tab === 'history') && (
          <View style={[styles.txSection, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.txTitle, { color: C.text }]}>
              {tab === 'pending' ? 'Pending Payouts' : 'Payout History'}
            </Text>
            {tab === 'pending' ? renderPending() : renderHistory()}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={[styles.txSection, { backgroundColor: C.surface, borderColor: C.border }]}>
            {renderReviews()}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, C, color }) {
  return (
    <View style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      <Text style={[styles.statVal, { color: color || C.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: C.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  tabRow: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn:     { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText:    { fontSize: 12, fontWeight: '600' },
  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  statCard: {
    flex: 1, minWidth: '42%', borderRadius: 16, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
  },
  statVal:    { fontSize: 18, fontWeight: '800' },
  statLabel:  { fontSize: 12, textAlign: 'center' },
  txSection:  { margin: 16, borderRadius: 16, borderWidth: 1, padding: 14 },
  txTitle:    { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txName:     { fontSize: 14, fontWeight: '500' },
  txDate:     { fontSize: 12, marginTop: 2 },
  txStatus:   { fontSize: 11, fontWeight: '600', marginTop: 2 },
  txAmount:   { fontSize: 15, fontWeight: '800' },
  empty:      { textAlign: 'center', padding: 24, fontSize: 14 },
  reviewSummary: { alignItems: 'center', paddingBottom: 14, marginBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  reviewAvg:  { fontSize: 24, fontWeight: '800' },
  reviewCount:{ fontSize: 12, marginTop: 2 },
  reviewRow:  { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  reviewStars:{ flexDirection: 'row', alignItems: 'center', gap: 2 },
  reviewPooja:{ fontSize: 11, marginLeft: 8 },
  reviewText: { fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
});
