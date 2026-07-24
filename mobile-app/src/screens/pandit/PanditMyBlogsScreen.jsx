import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useTabBarClearance } from '../../components/pandit/StickyActionBar';
import { COLORS } from '../../theme/tokens';
import { formatDate, blogStatusColor } from '../../utils/helpers';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

const STATUS_FILTERS = [
  { key: 'all',            label: 'All' },
  { key: 'draft',          label: 'Draft' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'published',      label: 'Published' },
  { key: 'rejected',       label: 'Rejected' },
];

export default function PanditMyBlogsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const tabBarClearance = useTabBarClearance();
  const C = theme.colors;

  const [canPublish, setCanPublish] = useState(true);
  const [permLoaded, setPermLoaded] = useState(false);
  const [blogs,      setBlogs]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status,     setStatus]     = useState('all');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    api.get('/blogs/permissions/check')
      .then(({ data }) => setCanPublish(data.canPublish !== false))
      .catch(() => setCanPublish(true))
      .finally(() => setPermLoaded(true));
  }, []);

  const fetchBlogs = useCallback(async (pg = 1, st = status, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15 };
      if (st !== 'all') params.status = st;
      const { data } = await api.get('/blogs/me/blogs', { params });
      const list = data.blogs || [];
      setBlogs((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load your blogs' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => { fetchBlogs(1); }, [status]);

  const onRefresh = () => { setRefreshing(true); fetchBlogs(1, status, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchBlogs(page + 1, status, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const openBlog = (blog) => {
    if (['draft', 'rejected', 'pending_review'].includes(blog.status)) {
      navigation.navigate('PanditBlogEditor', { blog });
    } else {
      navigation.navigate('BlogDetail', { slug: blog.slug, blog });
    }
  };

  if (!permLoaded || (loading && page === 1)) return <LoadingSpinner fullScreen />;

  return (
    <View style={[styles.root, { backgroundColor: COLORS.background }]}>
      <ScreenHeader
        title="My Blogs"
        right={
          canPublish ? (
            <TouchableOpacity onPress={() => navigation.navigate('PanditBlogEditor', {})} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={26} color={C.primary} />
            </TouchableOpacity>
          ) : null
        }
      />

      {!canPublish ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Blog writing is currently disabled"
          subtitle="The admin has disabled blog publishing for pandits at this time. Check back later."
        />
      ) : (
        <>
          <View style={[styles.filterWrap, { borderBottomColor: C.border }]}>
            <FlatList
              horizontal data={STATUS_FILTERS} keyExtractor={(s) => s.key}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}
              renderItem={({ item: s }) => (
                <TouchableOpacity style={[styles.chip, status === s.key && { backgroundColor: C.primary }]} onPress={() => setStatus(s.key)} activeOpacity={0.8}>
                  <Text style={[styles.chipText, { color: status === s.key ? '#fff' : C.textSecondary }]}>{s.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>

          <FlatList
            data={blogs}
            keyExtractor={(b) => b._id}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: tabBarClearance + 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <EmptyState icon="newspaper-outline" title="No blogs yet" subtitle="Tap + to write your first blog" actionLabel="Write Blog" onAction={() => navigation.navigate('PanditBlogEditor', {})} />
            }
            ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
                onPress={() => openBlog(item)}
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
                    <StatusBadge status={item.status} colorMap={blogStatusColor} small />
                    <Text style={[styles.metaText, { color: C.textSecondary }]}>{formatDate(item.updatedAt || item.createdAt)}</Text>
                  </View>
                  {item.status === 'rejected' && item.rejectionReason ? (
                    <Text style={[styles.rejectionText, { color: '#DC2626' }]} numberOfLines={2}>{item.rejectionReason}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1 },
  filterWrap:  { borderBottomWidth: StyleSheet.hairlineWidth },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  chipText:    { fontSize: 11, fontWeight: '600' },
  card:        { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
  thumb:            { width: 60, height: 60, borderRadius: 12 },
  thumbPlaceholder: { width: 60, height: 60, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  title:       { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaText:    { fontSize: 11 },
  rejectionText: { fontSize: 11, marginTop: 4 },
});
