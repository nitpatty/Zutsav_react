import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, StatusBar, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useNotificationStore } from '../../store/notificationStore';
import { formatCurrency, formatDate, formatTime, timeAgo, daysUntil, bookingStatusColor } from '../../utils/helpers';
import { saveCache, loadCache } from '../../utils/offlineCache';
import useOnReconnect from '../../hooks/useOnReconnect';
import StatusBadge from '../../components/StatusBadge';
import LoadingSpinner from '../../components/LoadingSpinner';
import NotificationBell from '../../components/NotificationBell';
import DashboardChart from '../../components/admin/DashboardChart';

export default function PanditDashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { notifications, fetch: fetchNotifications } = useNotificationStore();

  const [dash,          setDash]          = useState(null);
  const [payoutStats,   setPayoutStats]   = useState(null);
  const [referralStats, setReferralStats] = useState(null);
  const [festivals,     setFestivals]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const [dashRes, payoutRes, referralRes, fest1Res, fest2Res] = await Promise.all([
        api.get('/pandits/me/dashboard'),
        api.get('/pandits/me/payouts/stats'),
        api.get('/referral/my', { params: { limit: 100 } }),
        api.get('/festivals', { params: { month: now.getMonth() + 1, year: now.getFullYear() } }),
        api.get('/festivals', { params: { month: nextMonth.getMonth() + 1, year: nextMonth.getFullYear() } }),
      ]);
      setDash(dashRes.data);
      saveCache('dashboard', dashRes.data);
      setPayoutStats(payoutRes.data.stats || {});
      const referrals = referralRes.data.referrals || [];
      setReferralStats({
        total: referrals.length,
        booked: referrals.filter((r) => ['BOOKED', 'PENDING_REMARK', 'REMARK_SUBMITTED', 'ADMIN_REVIEW', 'ASSIGNED', 'COMPLETED', 'SETTLED'].includes(r.status)).length,
        completed: referrals.filter((r) => ['COMPLETED', 'SETTLED'].includes(r.status)).length,
      });
      const upcomingFestivals = [...(fest1Res.data.festivals || fest1Res.data.data || []), ...(fest2Res.data.festivals || fest2Res.data.data || [])]
        .filter((f) => daysUntil(f.date) >= 0)
        .slice(0, 5);
      setFestivals(upcomingFestivals);
      fetchNotifications();
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load dashboard' });
      const cached = await loadCache('dashboard');
      if (cached) setDash(cached.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchNotifications]);

  useEffect(() => { fetchAll(); }, []);
  useOnReconnect(() => fetchAll(true));

  const handleToggleOnline = async (val) => {
    try {
      setTogglingOnline(true);
      await api.patch('/pandits/me/online-status', { isOnline: val });
      setDash((prev) => prev ? { ...prev, profile: { ...prev.profile, isOnline: val } } : prev);
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Could not update status' });
    } finally { setTogglingOnline(false); }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const profile = dash?.profile || {};
  const today = dash?.today || { bookings: [], earnings: 0 };
  const upcoming = dash?.upcoming || { bookings: [] };
  const monthly = dash?.monthly || { earnings: 0 };
  const pending = dash?.pending || { referralRemarks: 0 };
  const perf = dash?.performance || {};
  const kycApproved = profile.kycStatus === 'approved';
  const hasActionRequired = pending.referralRemarks > 0 || today.bookings.some((b) => b.status === 'pandit_assigned') || upcoming.bookings.some((b) => b.status === 'pandit_assigned');

  const statCards = [
    { label: "Today's Bookings",  value: today.bookings.length, icon: 'today', nav: 'PanditBookingsTab' },
    { label: "Today's Earnings",  value: formatCurrency(today.earnings), icon: 'cash', nav: 'PanditEarnings' },
    { label: 'Monthly Earnings',  value: formatCurrency(monthly.earnings), icon: 'trending-up', nav: 'PanditEarnings' },
    { label: 'Pending Payments',  value: formatCurrency(payoutStats?.pendingAmount || 0), icon: 'wallet', nav: 'PanditEarnings' },
    { label: 'Average Rating',    value: profile.rating ? `${profile.rating.toFixed(1)} ★` : 'N/A', icon: 'star', nav: 'PanditRatings' },
    { label: 'Completion Rate',   value: `${perf.completionRate || 0}%`, icon: 'checkmark-circle', nav: null },
    { label: 'Repeat Customers',  value: perf.repeatCustomers || 0, icon: 'people', nav: null },
    { label: 'Accepted / Rejected', value: `${perf.accepted || 0} / ${perf.rejected || 0}`, icon: 'swap-vertical', nav: null },
  ];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      <View style={[styles.header, { paddingTop: 56, backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: C.textSecondary }]}>Pandit Dashboard</Text>
          <Text style={[styles.userName, { color: C.text }]}>{user?.name?.split(' ')[0]}</Text>
        </View>
        <View style={styles.onlineToggle}>
          <Text style={[styles.onlineLabel, { color: profile.isOnline ? '#16A34A' : C.textSecondary }]}>{profile.isOnline ? 'Online' : 'Offline'}</Text>
          <Switch value={!!profile.isOnline} onValueChange={handleToggleOnline} disabled={togglingOnline} trackColor={{ true: '#16A34A' }} />
        </View>
        <NotificationBell color={C.text} notifScreen="PanditNotifications" />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(true); }} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {!kycApproved && (
          <TouchableOpacity
            style={[styles.kycAlert, { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' }]}
            onPress={() => navigation.navigate('PanditKYC')}
            activeOpacity={0.85}
          >
            <Ionicons name="warning" size={20} color="#D97706" />
            <Text style={styles.kycAlertText}>
              {profile.kycStatus === 'not_submitted' ? 'Complete KYC to start receiving bookings' :
               profile.kycStatus === 'submitted' ? 'KYC under review — please wait' :
               profile.kycStatus === 'rejected' ? 'KYC rejected — please resubmit' :
               profile.kycStatus === 'reupload_required' ? 'KYC documents need reupload' :
               'Complete your profile'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#D97706" />
          </TouchableOpacity>
        )}

        {hasActionRequired && (
          <View style={[styles.actionAlert, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" />
            <Text style={styles.actionAlertText}>
              {pending.referralRemarks > 0 ? `${pending.referralRemarks} referral remark${pending.referralRemarks === 1 ? '' : 's'} pending` : 'You have bookings needing action'}
            </Text>
          </View>
        )}

        <View style={styles.statsGrid}>
          {statCards.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[styles.statCard, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => s.nav && navigation.navigate(s.nav)}
              activeOpacity={s.nav ? 0.85 : 1}
              disabled={!s.nav}
            >
              <Ionicons name={s.icon} size={18} color={C.primary} />
              <Text style={[styles.statValue, { color: C.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: C.textSecondary }]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {today.bookings.length > 0 && (
          <Section title="Today's Tasks" C={C}>
            {today.bookings.map((b) => (
              <BookingRow key={b._id} b={b} C={C} onPress={() => navigation.navigate('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: b._id } })} />
            ))}
          </Section>
        )}

        {upcoming.bookings.length > 0 && (
          <Section title="Upcoming Calendar" C={C} onSeeAll={() => navigation.navigate('PanditBookingsTab')}>
            {upcoming.bookings.slice(0, 5).map((b) => (
              <BookingRow key={b._id} b={b} C={C} showDate onPress={() => navigation.navigate('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: b._id } })} />
            ))}
          </Section>
        )}

        <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
          <DashboardChart
            title="Earnings (30 Days)"
            series={(dash?.trends?.daily || []).map((d) => ({ date: d.date, value: d.value }))}
            formatValue={(n) => `₹${Math.round(n / 1000)}k`}
          />
        </View>

        {referralStats && (
          <TouchableOpacity onPress={() => navigation.navigate('PanditReferralTab')} activeOpacity={0.85}>
            <Section title="Referral Statistics" C={C}>
              <View style={styles.referralRow}>
                <ReferralStat label="Total" value={referralStats.total} C={C} />
                <ReferralStat label="Booked" value={referralStats.booked} C={C} />
                <ReferralStat label="Completed" value={referralStats.completed} C={C} />
              </View>
            </Section>
          </TouchableOpacity>
        )}

        {festivals.length > 0 && (
          <Section title="Upcoming Festivals" C={C} onSeeAll={() => navigation.navigate('Festivals')}>
            {festivals.map((f) => (
              <View key={f._id} style={[styles.festivalRow, { borderColor: C.border }]}>
                <Text style={[styles.festivalDate, { color: C.primary }]}>{formatDate(f.date, 'dd MMM')}</Text>
                <Text style={[styles.festivalName, { color: C.text }]} numberOfLines={1}>{f.name}</Text>
              </View>
            ))}
          </Section>
        )}

        {notifications.length > 0 && (
          <Section title="Recent Notifications" C={C} onSeeAll={() => navigation.navigate('PanditNotifications')}>
            {notifications.slice(0, 3).map((n) => (
              <View key={n._id} style={[styles.notifRow, { borderColor: C.border }]}>
                <Text style={[styles.notifTitle, { color: C.text }]} numberOfLines={1}>{n.title}</Text>
                <Text style={[styles.notifTime, { color: C.textSecondary }]}>{timeAgo(n.createdAt)}</Text>
              </View>
            ))}
          </Section>
        )}

        <View style={styles.quickRow}>
          {[
            { label: 'Profile', icon: 'person', nav: 'PanditProfileMain' },
            { label: 'KYC',     icon: 'document-text', nav: 'PanditKYC' },
            { label: 'Availability', icon: 'time', nav: 'PanditAvailability' },
            { label: 'Earnings', icon: 'bar-chart', nav: 'PanditEarnings' },
            { label: 'Referrals', icon: 'people', nav: 'PanditReferralTab' },
            { label: 'My Blogs', icon: 'newspaper', nav: 'PanditMyBlogs' },
            { label: 'Festivals', icon: 'calendar', nav: 'Festivals' },
            { label: 'Panchang', icon: 'sunny', nav: 'Panchang' },
          ].map((a) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.quickBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => navigation.navigate(a.nav)}
              activeOpacity={0.8}
            >
              <Ionicons name={a.icon} size={20} color={C.primary} />
              <Text style={[styles.quickLabel, { color: C.text }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, C, onSeeAll }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: C.text }]}>{title}</Text>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll}>
            <Text style={[styles.seeAll, { color: C.primary }]}>See all</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>{children}</View>
    </View>
  );
}

function BookingRow({ b, C, onPress, showDate = false }) {
  return (
    <TouchableOpacity style={[styles.bookingRow, { backgroundColor: C.surface, borderColor: C.border }]} onPress={onPress} activeOpacity={0.85}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bookingName, { color: C.text }]} numberOfLines={1}>{b.poojaId?.name || 'Pooja'}</Text>
        <Text style={[styles.bookingUser, { color: C.textSecondary }]}>
          {b.userId?.name || ''}{showDate && b.scheduledDate ? ` · ${formatDate(b.scheduledDate)}` : ''}
        </Text>
      </View>
      <StatusBadge status={b.status} colorMap={bookingStatusColor} small />
    </TouchableOpacity>
  );
}

function ReferralStat({ label, value, C }) {
  return (
    <View style={styles.referralStat}>
      <Text style={[styles.referralValue, { color: C.text }]}>{value}</Text>
      <Text style={[styles.referralLabel, { color: C.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  greeting:     { fontSize: 13 },
  userName:     { fontSize: 22, fontWeight: '800' },
  onlineToggle: { alignItems: 'center', gap: 2 },
  onlineLabel:  { fontSize: 10, fontWeight: '700' },
  kycAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    margin: 16, marginBottom: 8, padding: 14, borderRadius: 14, borderWidth: 1.5,
  },
  kycAlertText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400E' },
  actionAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 14, borderWidth: 1.5,
  },
  actionAlertText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#991B1B' },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16,
  },
  statCard: {
    flex: 1, minWidth: '42%', borderRadius: 16, borderWidth: 1,
    padding: 14, gap: 6, alignItems: 'center',
  },
  statValue:    { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  statLabel:    { fontSize: 11, textAlign: 'center' },
  section:      { marginTop: 12 },
  sectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  seeAll:       { fontSize: 13, fontWeight: '600' },
  bookingRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 12 },
  bookingName:  { fontSize: 14, fontWeight: '600' },
  bookingUser:  { fontSize: 12, marginTop: 2 },
  referralRow:  { flexDirection: 'row', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 14, gap: 10 },
  referralStat: { flex: 1, alignItems: 'center' },
  referralValue:{ fontSize: 18, fontWeight: '800' },
  referralLabel:{ fontSize: 11, marginTop: 2 },
  festivalRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 10 },
  festivalDate: { fontSize: 12, fontWeight: '800', width: 60 },
  festivalName: { fontSize: 13, fontWeight: '600', flex: 1 },
  notifRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 10 },
  notifTitle:   { fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  notifTime:    { fontSize: 11 },
  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16, marginTop: 4,
  },
  quickBtn: {
    flex: 1, minWidth: '30%', alignItems: 'center', gap: 6,
    padding: 14, borderRadius: 16, borderWidth: 1,
  },
  quickLabel:   { fontSize: 12, fontWeight: '600' },
});
