import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, StatusBar, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { formatCurrency, formatDate, timeAgo, daysUntil } from '../../utils/helpers';
import { saveCache, loadCache } from '../../utils/offlineCache';
import useOnReconnect from '../../hooks/useOnReconnect';
import LoadingSpinner from '../../components/LoadingSpinner';
import NotificationBell from '../../components/NotificationBell';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';

import { COLORS, SPACING } from '../../theme/tokens';
import { Greeting, Heading, Body, Caption, CardTitle } from '../../components/ui/Typography';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import HeroCard from '../../components/ui/HeroCard';
import StatTile from '../../components/ui/StatTile';
import ActionCard from '../../components/ui/ActionCard';
import BookingCard from '../../components/ui/BookingCard';
import SectionHeader from '../../components/ui/SectionHeader';
import IconContainer from '../../components/ui/IconContainer';

function greetingForHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning,';
  if (h < 17) return 'Good Afternoon,';
  return 'Good Evening,';
}

export default function PanditDashboardScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { notifications, fetch: fetchNotifications } = useNotificationStore();
  const tabBarClearance = useTabBarClearance();

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

  // Derived from real monthly trend data — never fabricated.
  const monthlySeries = dash?.trends?.monthly || [];
  let monthlyDeltaText = null;
  if (monthlySeries.length >= 2) {
    const curr = monthlySeries[monthlySeries.length - 1]?.value ?? 0;
    const prev = monthlySeries[monthlySeries.length - 2]?.value ?? 0;
    if (prev > 0) {
      const pct = Math.round(((curr - prev) / prev) * 100);
      monthlyDeltaText = `${pct >= 0 ? '+' : ''}${pct}% this month`;
    }
  }

  const statTiles = [
    { label: "Today's Bookings", value: String(today.bookings.length), icon: 'calendar-outline', nav: 'PanditBookingsTab' },
    { label: "Today's Earnings", value: formatCurrency(today.earnings), icon: 'cash-outline', nav: 'PanditEarnings' },
    { label: 'Pending Payments', value: formatCurrency(payoutStats?.pendingAmount || 0), icon: 'wallet-outline', nav: 'PanditEarnings' },
    { label: 'Monthly Earnings', value: formatCurrency(monthly.earnings), icon: 'trending-up-outline', nav: 'PanditEarnings', deltaText: monthlyDeltaText },
    { label: 'Average Rating', value: profile.rating ? `${profile.rating.toFixed(1)} ★` : 'N/A', icon: 'star-outline', nav: 'PanditRatings' },
    { label: 'Completion Rate', value: `${perf.completionRate || 0}%`, icon: 'checkmark-circle-outline', nav: null },
    { label: 'Repeat Customers', value: String(perf.repeatCustomers || 0), icon: 'people-outline', nav: null },
    { label: 'Accepted / Rejected', value: `${perf.accepted || 0} / ${perf.rejected || 0}`, icon: 'swap-vertical-outline', nav: null },
    { label: 'Total Pujas', value: String(perf.completed || 0), icon: 'flame-outline', nav: null },
  ];

  const quickActions = [
    { label: 'Availability', icon: 'time-outline', nav: 'PanditAvailability' },
    { label: 'My Services', icon: 'sparkles-outline', nav: 'PanditProfileTab', params: { screen: 'PanditPoojaServices' } },
    { label: 'Manage Pujas', icon: 'flame-outline', nav: 'PanditProfileTab', params: { screen: 'PanditPoojaServices' } },
    { label: 'Earnings Report', icon: 'bar-chart-outline', nav: 'PanditEarnings' },
    { label: 'Customer Reviews', icon: 'star-outline', nav: 'PanditRatings' },
    { label: 'Profile', icon: 'person-outline', nav: 'PanditProfileTab', params: { screen: 'PanditProfileMain' } },
    { label: 'KYC', icon: 'document-text-outline', nav: 'PanditProfileTab', params: { screen: 'PanditKYC' } },
    { label: 'Referrals', icon: 'people-outline', nav: 'PanditReferralTab' },
    { label: 'My Blogs', icon: 'newspaper-outline', nav: 'PanditMyBlogs' },
    { label: 'Festivals', icon: 'calendar-outline', nav: 'Festivals' },
    { label: 'Panchang', icon: 'sunny-outline', nav: 'Panchang' },
  ];

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Greeting>{greetingForHour()}</Greeting>
          <View style={styles.nameRow}>
            <Heading numberOfLines={1}>{user?.name?.split(' ')[0]}</Heading>
            <Badge label="Pandit" variant="primary" />
          </View>
        </View>
        <View style={styles.onlineToggle}>
          <Caption color={profile.isOnline ? COLORS.success : COLORS.textSecondary} style={{ fontWeight: '700' }}>
            {profile.isOnline ? 'Online' : 'Offline'}
          </Caption>
          <Switch
            value={!!profile.isOnline}
            onValueChange={handleToggleOnline}
            disabled={togglingOnline}
            trackColor={{ true: COLORS.success }}
          />
        </View>
        <NotificationBell color={COLORS.text} notifScreen="PanditNotifications" />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(true); }} tintColor={COLORS.primary} />}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarClearance + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {!kycApproved && (
          <TouchableOpacity onPress={() => navigation.navigate('PanditProfileTab', { screen: 'PanditKYC' })} activeOpacity={0.85}>
            <Card padding={SPACING.md} style={[styles.alertCard, { backgroundColor: COLORS.warningBg }]} elevation="raised">
              <IconContainer name="warning-outline" size="sm" color={COLORS.warning} />
              <Body color="#7A4B12" style={styles.alertText}>
                {profile.kycStatus === 'not_submitted' ? 'Complete KYC to start receiving bookings' :
                 profile.kycStatus === 'submitted' ? 'KYC under review — please wait' :
                 profile.kycStatus === 'rejected' ? 'KYC rejected — please resubmit' :
                 profile.kycStatus === 'reupload_required' ? 'KYC documents need reupload' :
                 'Complete your profile'}
              </Body>
              <Ionicons name="chevron-forward" size={16} color={COLORS.warning} />
            </Card>
          </TouchableOpacity>
        )}

        {hasActionRequired && (
          <Card padding={SPACING.md} style={[styles.alertCard, { backgroundColor: COLORS.errorBg }]} elevation="raised">
            <IconContainer name="alert-circle-outline" size="sm" color={COLORS.error} />
            <Body color="#8A2E28" style={styles.alertText}>
              {pending.referralRemarks > 0 ? `${pending.referralRemarks} referral remark${pending.referralRemarks === 1 ? '' : 's'} pending` : 'You have bookings needing action'}
            </Body>
          </Card>
        )}

        <HeroCard
          label="Total Earnings"
          value={formatCurrency(monthly.earnings)}
          deltaText={monthlyDeltaText}
          onViewDetails={() => navigation.navigate('PanditEarnings')}
        />

        <View style={styles.statsGrid}>
          {statTiles.map((s) => (
            <View key={s.label} style={styles.statCol}>
              <StatTile
                icon={s.icon}
                value={s.value}
                label={s.label}
                deltaText={s.deltaText}
                onPress={s.nav ? () => navigation.navigate(s.nav) : undefined}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Quick Actions" />
          <View style={styles.actionsGrid}>
            {quickActions.map((a) => (
              <View key={a.label} style={styles.actionCol}>
                <ActionCard icon={a.icon} label={a.label} onPress={() => navigation.navigate(a.nav, a.params)} />
              </View>
            ))}
          </View>
        </View>

        {today.bookings.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Today's Tasks" onSeeAll={() => navigation.navigate('PanditBookingsTab')} />
            <View style={{ gap: SPACING.sm }}>
              {today.bookings.map((b) => (
                <BookingCard
                  key={b._id}
                  title={b.poojaId?.name || 'Pooja'}
                  subtitle={b.userId?.name || ''}
                  status={b.status}
                  onPress={() => navigation.navigate('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: b._id } })}
                />
              ))}
            </View>
          </View>
        )}

        {upcoming.bookings.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Upcoming Pujas" seeAllLabel="View Calendar" onSeeAll={() => navigation.navigate('PanditBookingsTab')} />
            <View style={{ gap: SPACING.sm }}>
              {upcoming.bookings.slice(0, 5).map((b) => (
                <BookingCard
                  key={b._id}
                  title={b.poojaId?.name || 'Pooja'}
                  subtitle={b.userId?.name || ''}
                  date={b.scheduledDate}
                  status={b.status}
                  onPress={() => navigation.navigate('PanditBookingsTab', { screen: 'PanditBookingDetail', params: { bookingId: b._id } })}
                />
              ))}
            </View>
          </View>
        )}

        {referralStats && (
          <TouchableOpacity onPress={() => navigation.navigate('PanditReferralTab')} activeOpacity={0.85} style={styles.section}>
            <SectionHeader title="Referral Statistics" />
            <Card style={styles.referralRow}>
              <ReferralStat label="Total" value={referralStats.total} />
              <ReferralStat label="Booked" value={referralStats.booked} />
              <ReferralStat label="Completed" value={referralStats.completed} />
            </Card>
          </TouchableOpacity>
        )}

        {festivals.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Upcoming Festivals" onSeeAll={() => navigation.navigate('Festivals')} />
            <View style={{ gap: SPACING.sm }}>
              {festivals.map((f) => (
                <Card key={f._id} padding={SPACING.md} style={styles.rowCard} elevation="raised">
                  <Caption color={COLORS.primaryDark} style={styles.festivalDate}>{formatDate(f.date, 'dd MMM')}</Caption>
                  <CardTitle numberOfLines={1} style={{ flex: 1 }}>{f.name}</CardTitle>
                </Card>
              ))}
            </View>
          </View>
        )}

        {notifications.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Notifications" onSeeAll={() => navigation.navigate('PanditProfileTab', { screen: 'PanditNotifications' })} />
            <View style={{ gap: SPACING.sm }}>
              {notifications.slice(0, 3).map((n) => (
                <Card key={n._id} padding={SPACING.md} style={styles.rowCard} elevation="raised">
                  <CardTitle numberOfLines={1} style={{ flex: 1, marginRight: SPACING.sm }}>{n.title}</CardTitle>
                  <Caption>{timeAgo(n.createdAt)}</Caption>
                </Card>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ReferralStat({ label, value }) {
  return (
    <View style={styles.referralStat}>
      <Heading style={{ fontSize: 18 }}>{value}</Heading>
      <Caption>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
  },
  nameRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  onlineToggle: { alignItems: 'center', gap: 2 },

  scroll: { paddingHorizontal: SPACING.xl, gap: SPACING.base },

  alertCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  alertText: { flex: 1, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  statCol:   { width: '30%' },

  section: { gap: 0 },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  actionCol:   { width: '22%' },

  referralRow:  { flexDirection: 'row' },
  referralStat: { flex: 1, alignItems: 'center', gap: 2 },

  rowCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  festivalDate: { fontWeight: '800', width: 56 },
});
