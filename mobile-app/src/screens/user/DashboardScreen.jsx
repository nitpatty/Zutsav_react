import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, StatusBar, Image, FlatList
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import NotificationBell from '../../components/NotificationBell';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [poojas, bookingsRes, festRes] = await Promise.all([
        api.get('/poojas?limit=6&isActive=true'),
        api.get('/bookings/my?limit=3&sort=-createdAt'),
        api.get('/festivals?limit=5&upcoming=true'),
      ]);
      setData({
        poojas:    poojas.data.data    || poojas.data.poojas    || [],
        bookings:  bookingsRes.data.data || bookingsRes.data.bookings || [],
        festivals: festRes.data.data   || festRes.data.festivals  || [],
      });
    } catch (err) {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load dashboard' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchDashboard(true); };

  if (loading) return <LoadingSpinner fullScreen text="Loading…" />;

  const statusColor = (s) => {
    const map = { paid: '#16A34A', completed: '#16A34A', pandit_assigned: '#2563EB', pending: '#D97706', cancelled: '#DC2626', refunded: '#6B7280', failed: '#DC2626' };
    return map[s] || '#D4AF37';
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View>
          <Text style={[styles.greeting, { color: C.textSecondary }]}>{greeting()},</Text>
          <Text style={[styles.userName, { color: C.text }]}>{user?.name?.split(' ')[0] || 'Devotee'}</Text>
        </View>
        <NotificationBell color={C.text} notifScreen="Notifications" />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Quick actions */}
        <View style={styles.quickActions}>
          {[
            { icon: 'flame',      label: 'Book Puja',   nav: 'PoojaList' },
            { icon: 'calendar',   label: 'Panchang',    nav: 'Panchang' },
            { icon: 'storefront', label: 'Shop',        nav: 'ShopTab' },
            { icon: 'sparkles',   label: 'AI Guru',     nav: 'AIAssistant' },
            { icon: 'newspaper',  label: 'Blog',        nav: 'Blogs' },
            { icon: 'ribbon',     label: 'Festivals',   nav: 'Festivals' },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.qBtn, { backgroundColor: C.surface, borderColor: C.border }]}
              onPress={() => navigation.navigate(item.nav)}
              activeOpacity={0.8}
            >
              <View style={[styles.qIconWrap, { backgroundColor: C.primary + '18' }]}>
                <Ionicons name={item.icon} size={22} color={C.primary} />
              </View>
              <Text style={[styles.qLabel, { color: C.text }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upcoming festivals */}
        {data?.festivals?.length > 0 && (
          <Section title="Upcoming Festivals" onSeeAll={() => navigation.navigate('Festivals')} C={C}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {data.festivals.map((f) => (
                <View key={f._id} style={[styles.festCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Text style={[styles.festName, { color: C.text }]}>{f.name}</Text>
                  <Text style={[styles.festDate, { color: C.primary }]}>{f.date ? new Date(f.date).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : ''}</Text>
                </View>
              ))}
            </ScrollView>
          </Section>
        )}

        {/* Available Poojas */}
        {data?.poojas?.length > 0 && (
          <Section title="Available Poojas" onSeeAll={() => navigation.navigate('PoojaList')} C={C}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {data.poojas.map((p) => (
                <TouchableOpacity
                  key={p._id}
                  style={[styles.poojaCard, { backgroundColor: C.surface, borderColor: C.border }]}
                  onPress={() => navigation.navigate('BookingFlow', { poojaId: p._id, pooja: p })}
                  activeOpacity={0.85}
                >
                  {p.image ? (
                    <Image source={{ uri: imageUrl(p.image) }} style={styles.poojaImg} />
                  ) : (
                    <View style={[styles.poojaImgPlaceholder, { backgroundColor: C.primary + '20' }]}>
                      <Ionicons name="flame" size={28} color={C.primary} />
                    </View>
                  )}
                  <View style={styles.poojaInfo}>
                    <Text style={[styles.poojaName, { color: C.text }]} numberOfLines={2}>{p.name}</Text>
                    <Text style={[styles.poojaPrice, { color: C.primary }]}>{formatCurrency(p.salePrice || p.price || 0)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Section>
        )}

        {/* Recent bookings */}
        {data?.bookings?.length > 0 && (
          <Section title="Recent Bookings" onSeeAll={() => navigation.navigate('BookingsTab')} C={C}>
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {data.bookings.map((b) => (
                <TouchableOpacity
                  key={b._id}
                  style={[styles.bookingRow, { backgroundColor: C.surface, borderColor: C.border }]}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: b._id })}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bookingPuja, { color: C.text }]} numberOfLines={1}>
                      {b.poojaId?.name || 'Pooja'}
                    </Text>
                    <Text style={[styles.bookingDate, { color: C.textSecondary }]}>
                      {b.scheduledDate ? new Date(b.scheduledDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusColor(b.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: statusColor(b.status) }]}>
                      {(b.status || '').replace(/_/g, ' ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, onSeeAll, children, C }) {
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
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  greeting:         { fontSize: 13 },
  userName:         { fontSize: 22, fontWeight: '800' },

  quickActions: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 12, padding: 16,
  },
  qBtn: {
    flex: 1, minWidth: '40%',
    alignItems: 'center', gap: 8, padding: 14,
    borderRadius: 16, borderWidth: 1,
  },
  qIconWrap:        { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  qLabel:           { fontSize: 12, fontWeight: '600' },

  section:          { marginTop: 8 },
  sectionHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle:     { fontSize: 16, fontWeight: '700' },
  seeAll:           { fontSize: 13, fontWeight: '600' },

  festCard: {
    width: 120, padding: 14, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', gap: 4,
  },
  festName:         { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  festDate:         { fontSize: 13, fontWeight: '800' },

  poojaCard:        { width: 140, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  poojaImg:         { width: '100%', height: 90 },
  poojaImgPlaceholder: { width: '100%', height: 90, justifyContent: 'center', alignItems: 'center' },
  poojaInfo:        { padding: 10, gap: 4 },
  poojaName:        { fontSize: 13, fontWeight: '600' },
  poojaPrice:       { fontSize: 14, fontWeight: '800' },

  bookingRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  bookingPuja:      { fontSize: 14, fontWeight: '600' },
  bookingDate:      { fontSize: 12, marginTop: 2 },
  statusPill:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:       { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
