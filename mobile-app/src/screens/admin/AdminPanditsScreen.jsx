import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { kycStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const KYC_FILTERS = ['all', 'not_submitted', 'submitted', 'approved', 'rejected', 'reupload_required'];

export default function AdminPanditsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [pandits,    setPandits]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [kycFilter,  setKycFilter]  = useState('all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchPandits = useCallback(async (pg = 1, q = search, kyc = kycFilter, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15, sort: '-createdAt' };
      if (q.trim()) params.search = q.trim();
      if (kyc !== 'all') params.kycStatus = kyc;
      const { data } = await api.get('/admin/pandits', { params });
      const list = data.data || data.pandits || [];
      setPandits((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load pandits' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [search, kycFilter]);

  useEffect(() => { fetchPandits(1); }, [kycFilter]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('AdminPanditDetail', { panditId: item._id, pandit: item })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: C.primary + '20' }]}>
          <Text style={[styles.avatarText, { color: C.primary }]}>{item.userId?.name?.charAt(0)?.toUpperCase() || 'P'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: C.text }]}>{item.userId?.name || 'Pandit'}</Text>
          <Text style={[styles.phone, { color: C.textSecondary }]}>{item.userId?.phone || ''}</Text>
        </View>
        <StatusBadge status={item.kycStatus || 'not_submitted'} colorMap={kycStatusColor} small />
      </View>
      <View style={styles.meta}>
        {item.experience > 0 && <Text style={[styles.metaText, { color: C.textSecondary }]}>{item.experience}y exp</Text>}
        {item.averageRating > 0 && <Text style={[styles.metaText, { color: C.textSecondary }]}>★ {item.averageRating.toFixed(1)}</Text>}
        <Text style={[styles.metaText, { color: item.isAvailable ? '#16A34A' : '#6B7280' }]}>{item.isAvailable ? 'Available' : 'Unavailable'}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Pandits" showBack={false} />
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput style={[styles.searchInput, { color: C.text }]} value={search} onChangeText={setSearch} placeholder="Search pandits…" placeholderTextColor={C.textSecondary} returnKeyType="search" onSubmitEditing={() => fetchPandits(1, search, kycFilter)} />
        </View>
      </View>
      <View style={[styles.filterWrap, { borderBottomColor: C.border }]}>
        <FlatList
          horizontal data={KYC_FILTERS} keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={[styles.chip, kycFilter === s && { backgroundColor: C.primary }]} onPress={() => setKycFilter(s)} activeOpacity={0.8}>
              <Text style={[styles.chipText, { color: kycFilter === s ? '#fff' : C.textSecondary }]}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {loading && page === 1 ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={pandits}
          keyExtractor={(p) => p._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPandits(1, search, kycFilter, true); }} tintColor={C.primary} />}
          onEndReached={() => {
            if (hasMore && !loading && !loadingMoreRef.current) {
              loadingMoreRef.current = true;
              fetchPandits(page + 1, search, kycFilter, true).finally(() => { loadingMoreRef.current = false; });
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="people-outline" title="No pandits found" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  filterWrap:  { borderBottomWidth: StyleSheet.hairlineWidth },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipText:    { fontSize: 11, fontWeight: '600' },
  card:        { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:      { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText:  { fontSize: 18, fontWeight: '800' },
  name:        { fontSize: 14, fontWeight: '700' },
  phone:       { fontSize: 12, marginTop: 1 },
  meta:        { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaText:    { fontSize: 12, fontWeight: '500' },
});
