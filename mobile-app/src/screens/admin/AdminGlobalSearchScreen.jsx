import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';

const SECTIONS = [
  { key: 'users',    label: 'Users',    icon: 'person-outline' },
  { key: 'pandits',  label: 'Pandits',  icon: 'people-outline' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar-outline' },
  { key: 'orders',   label: 'Orders',   icon: 'cube-outline' },
  { key: 'blogs',    label: 'Blogs',    icon: 'newspaper-outline' },
];

export default function AdminGlobalSearchScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q) => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/search', { params: { q } });
      setResults(data.results || {});
      setSearched(true);
    } catch {
      setResults({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({});
      setSearched(false);
      return;
    }
    const t = setTimeout(() => search(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query, search]);

  const openUser = (item) => navigation.navigate('Users', { screen: 'AdminUserDetail', params: { userId: item._id, user: item } });
  const openPandit = (item) => navigation.navigate('Pandits', { screen: 'AdminPanditDetail', params: { panditId: item._id, pandit: item } });
  const openBooking = (item) => navigation.navigate('AdminTabs', { screen: 'AdminBookingsTab', params: { screen: 'AdminBookingDetail', params: { bookingId: item._id } } });
  const openOrder = (item) => navigation.navigate('AdminTabs', { screen: 'AdminOrdersTab', params: { screen: 'AdminOrderDetail', params: { orderId: item._id } } });
  const openBlog = (item) => navigation.navigate('Blogs', { screen: 'AdminBlogDetail', params: { blog: item } });

  const HANDLERS = { users: openUser, pandits: openPandit, bookings: openBooking, orders: openOrder, blogs: openBlog };

  const rowTitle = (key, item) => {
    if (key === 'users' || key === 'pandits') return item.name;
    if (key === 'bookings') return item.bookingNumber || item.userDetails?.name || 'Booking';
    if (key === 'orders') return item.orderNumber;
    if (key === 'blogs') return item.title;
    return '';
  };
  const rowSubtitle = (key, item) => {
    if (key === 'users' || key === 'pandits') return item.phone || item.email || '';
    if (key === 'bookings') return item.userDetails?.name || '';
    if (key === 'orders') return item.status || '';
    if (key === 'blogs') return item.authorName || '';
    return '';
  };

  const hasAnyResults = SECTIONS.some((s) => (results[s.key] || []).length > 0);

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Global Search" />
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search users, pandits, bookings, orders, blogs…"
            placeholderTextColor={C.textSecondary}
            autoFocus
          />
          {loading ? <ActivityIndicator size="small" color={C.primary} /> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        {query.trim().length < 2 ? (
          <EmptyState icon="search-outline" title="Search across the platform" subtitle="Type at least 2 characters to search users, pandits, bookings, orders, and blogs" />
        ) : searched && !hasAnyResults && !loading ? (
          <EmptyState icon="search-outline" title="No results found" subtitle={`Nothing matched "${query.trim()}"`} />
        ) : (
          SECTIONS.map((s) => {
            const items = results[s.key] || [];
            if (items.length === 0) return null;
            return (
              <View key={s.key} style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name={s.icon} size={16} color={C.primary} />
                  <Text style={[styles.sectionTitle, { color: C.text }]}>{s.label}</Text>
                </View>
                {items.map((item, i) => (
                  <TouchableOpacity
                    key={item._id || i}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}
                    onPress={() => HANDLERS[s.key](item)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: C.text }]} numberOfLines={1}>{rowTitle(s.key, item)}</Text>
                      <Text style={[styles.rowSub, { color: C.textSecondary }]} numberOfLines={1}>{rowSubtitle(s.key, item)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  card:        { borderRadius: 16, borderWidth: 1, padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowTitle:    { fontSize: 14, fontWeight: '700' },
  rowSub:      { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
});
