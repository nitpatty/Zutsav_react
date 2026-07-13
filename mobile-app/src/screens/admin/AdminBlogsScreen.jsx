import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { blogStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const STATUS_FILTERS = ['all', 'draft', 'pending_review', 'published', 'rejected', 'archived', 'scheduled'];

export default function AdminBlogsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [blogs,      setBlogs]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [status,     setStatus]     = useState('all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchBlogs = useCallback(async (pg = 1, q = search, st = status, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15 };
      if (q.trim()) params.search = q.trim();
      if (st !== 'all') params.status = st;
      const { data } = await api.get('/admin/blogs', { params });
      const list = data.blogs || [];
      setBlogs((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch { if (!silent) Toast.show({ type: 'error', text1: 'Could not load blogs' }); }
    finally { setLoading(false); setRefreshing(false); }
  }, [search, status]);

  useEffect(() => { fetchBlogs(1); }, [status]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('AdminBlogDetail', { blog: item })}
      activeOpacity={0.85}
    >
      {item.featuredImage ? (
        <Image source={{ uri: imageUrl(item.featuredImage) }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumbPlaceholder, { backgroundColor: C.primary + '15' }]}>
          <Ionicons name="newspaper-outline" size={22} color={C.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: C.text }]} numberOfLines={2}>{item.title}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: C.textSecondary }]}>{item.authorName || 'Unknown'}</Text>
          {item.authorRole && (
            <View style={[styles.roleChip, { backgroundColor: C.primary + '15' }]}>
              <Text style={[styles.roleChipText, { color: C.primary }]}>{item.authorRole}</Text>
            </View>
          )}
        </View>
        <View style={styles.metaRow}>
          <StatusBadge status={item.status} colorMap={blogStatusColor} small />
          <Text style={[styles.metaText, { color: C.textSecondary }]}>👁 {item.views || 0}</Text>
          <Text style={[styles.metaText, { color: C.textSecondary }]}>♥ {item.likesCount || 0}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Blog Moderation" showBack={false} />
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={16} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search blogs…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchBlogs(1, search, status)}
          />
        </View>
      </View>
      <View style={[styles.filterWrap, { borderBottomColor: C.border }]}>
        <FlatList
          horizontal data={STATUS_FILTERS} keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={[styles.chip, status === s && { backgroundColor: C.primary }]} onPress={() => setStatus(s)} activeOpacity={0.8}>
              <Text style={[styles.chipText, { color: status === s ? '#fff' : C.textSecondary }]}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {loading && page === 1 ? <LoadingSpinner fullScreen /> : (
        <FlatList
          data={blogs}
          keyExtractor={(b) => b._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBlogs(1, search, status, true); }} tintColor={C.primary} />}
          onEndReached={() => {
            if (hasMore && !loading && !loadingMoreRef.current) {
              loadingMoreRef.current = true;
              fetchBlogs(page + 1, search, status, true).finally(() => { loadingMoreRef.current = false; });
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="newspaper-outline" title="No blogs found" />}
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
  card:        { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  thumb:            { width: 64, height: 64, borderRadius: 12 },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  title:       { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  metaText:    { fontSize: 12 },
  roleChip:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleChipText:{ fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});
