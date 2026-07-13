import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const TABS = [
  { label: 'All Users',         status: '' },
  { label: 'Deletion Pending',  status: 'deletion_pending' },
];

export default function AdminUsersScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState(0);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchUsers = useCallback(async (pg = 1, q = search, t = tab, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 20, sort: '-createdAt' };
      if (q.trim()) params.search = q.trim();
      if (TABS[t].status) params.accountStatus = TABS[t].status;
      const { data } = await api.get('/admin/users', { params });
      const list = data.data || data.users || [];
      setUsers((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 20);
      setPage(pg);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load users' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [search, tab]);

  useEffect(() => { fetchUsers(1); }, [tab]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('AdminUserDetail', { userId: item._id, user: item })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: C.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: C.primary }]}>{item.name?.charAt(0)?.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: C.text }]}>{item.name}</Text>
          <Text style={[styles.phone, { color: C.textSecondary }]}>{item.phone}</Text>
        </View>
        {item.accountStatus === 'deletion_pending' && (
          <View style={[styles.deletionBadge, { backgroundColor: '#FEF2F2' }]}>
            <Text style={styles.deletionBadgeText}>Deletion Pending</Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: C.textSecondary }]}>{item.role}</Text>
        <Text style={[styles.metaText, { color: C.textSecondary }]}>Joined {formatDate(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Users" showBack={false} />
      <View style={[styles.tabRow, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t.label} style={[styles.tabBtn, tab === i && { borderBottomWidth: 2, borderBottomColor: C.primary }]} onPress={() => setTab(i)}>
            <Text style={[styles.tabText, { color: tab === i ? C.primary : C.textSecondary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput style={[styles.searchInput, { color: C.text }]} value={search} onChangeText={setSearch} placeholder="Search users…" placeholderTextColor={C.textSecondary} returnKeyType="search" onSubmitEditing={() => fetchUsers(1, search, tab)} />
        </View>
      </View>
      {loading && page === 1 ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={users}
          keyExtractor={(u) => u._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchUsers(1, search, tab, true); }} tintColor={C.primary} />}
          onEndReached={() => {
            if (hasMore && !loading && !loadingMoreRef.current) {
              loadingMoreRef.current = true;
              fetchUsers(page + 1, search, tab, true).finally(() => { loadingMoreRef.current = false; });
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="person-outline" title="No users found" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  tabRow:         { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText:        { fontSize: 13, fontWeight: '600' },
  searchWrap:     { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:      { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:    { flex: 1, fontSize: 14 },
  card:           { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:         { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText:     { fontSize: 18, fontWeight: '800' },
  name:           { fontSize: 14, fontWeight: '700' },
  phone:          { fontSize: 12, marginTop: 1 },
  deletionBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  deletionBadgeText: { color: '#DC2626', fontSize: 10, fontWeight: '700' },
  meta:           { flexDirection: 'row', gap: 12 },
  metaText:       { fontSize: 12 },
});
