import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Image, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { formatDate, truncate } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';

export default function BlogsScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [blogs,      setBlogs]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchBlogs = useCallback(async (pg = 1, q = search, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15, status: 'published', sort: '-publishedAt' };
      if (q.trim()) params.search = q.trim();
      const { data } = await api.get('/blogs', { params });
      const list = data.data || data.blogs || [];
      setBlogs((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load blogs' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => { fetchBlogs(1); }, []);

  const onRefresh = () => { setRefreshing(true); fetchBlogs(1, search, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchBlogs(page + 1, search, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('BlogDetail', { slug: item.slug, blog: item })}
      activeOpacity={0.85}
    >
      {item.featuredImage ? (
        <Image source={{ uri: imageUrl(item.featuredImage) }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.coverPlaceholder, { backgroundColor: C.primary + '15' }]}>
          <Ionicons name="newspaper-outline" size={32} color={C.primary} />
        </View>
      )}
      <View style={styles.cardContent}>
        {item.category?.name && (
          <View style={[styles.catChip, { backgroundColor: C.primary + '15' }]}>
            <Text style={[styles.catText, { color: C.primary }]}>{item.category.name}</Text>
          </View>
        )}
        <Text style={[styles.title, { color: C.text }]} numberOfLines={2}>{item.title}</Text>
        {item.excerpt && (
          <Text style={[styles.excerpt, { color: C.textSecondary }]} numberOfLines={2}>{item.excerpt}</Text>
        )}
        <View style={styles.meta}>
          <Text style={[styles.author, { color: C.textSecondary }]}>
            {item.authorName || 'Zutsav Team'}
          </Text>
          <Text style={[styles.dot, { color: C.textSecondary }]}>·</Text>
          <Text style={[styles.date, { color: C.textSecondary }]}>
            {formatDate(item.publishedAt || item.createdAt)}
          </Text>
          {item.readingTime && (
            <>
              <Text style={[styles.dot, { color: C.textSecondary }]}>·</Text>
              <Text style={[styles.date, { color: C.textSecondary }]}>{item.readingTime} min read</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Spiritual Blogs" showBack={false} />

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search blogs…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchBlogs(1, search)}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); fetchBlogs(1, ''); }}>
              <Ionicons name="close-circle" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading && page === 1 ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={blogs}
          keyExtractor={(b) => b._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="newspaper-outline" title="No blogs yet" subtitle="Check back later for spiritual content" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1 },
  searchWrap:       { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput:      { flex: 1, fontSize: 14 },
  card:             { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cover:            { width: '100%', height: 180 },
  coverPlaceholder: { width: '100%', height: 180, justifyContent: 'center', alignItems: 'center' },
  cardContent:      { padding: 14, gap: 8 },
  catChip:          { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  catText:          { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title:            { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  excerpt:          { fontSize: 13, lineHeight: 20 },
  meta:             { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  author:           { fontSize: 12, fontWeight: '600' },
  dot:              { fontSize: 12 },
  date:             { fontSize: 12 },
});
