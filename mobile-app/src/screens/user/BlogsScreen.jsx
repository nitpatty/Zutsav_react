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
import { truncate } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import { useLanguageStore } from '../../i18n/languageStore';
import { useTranslation, useFormatters } from '../../i18n';

// Falls back to the placeholder box if the URL is missing OR if it fails to
// actually load (404, host unreachable, etc.) — previously a load failure
// just left a blank RN <Image> with no visible fallback.
function BlogCoverImage({ uri, C }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[styles.coverPlaceholder, { backgroundColor: C.primary + '15' }]}>
        <Ionicons name="newspaper-outline" size={32} color={C.primary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.cover} resizeMode="cover" onError={() => setFailed(true)} />;
}

export default function BlogsScreen() {
  const { t } = useTranslation();
  const { formatDate } = useFormatters();
  const contentLanguage = useLanguageStore((s) => s.language); // refetch server-translated content when the UI language changes
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
  const requestRef = useRef(0); // only the latest blogs request may update the list (a slow old-language reply is dropped)

  const fetchBlogs = useCallback(async (pg = 1, q = search, silent = false) => {
    const request = ++requestRef.current;
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 15, status: 'published', sort: '-publishedAt' };
      if (q.trim()) params.search = q.trim();
      const { data } = await api.get('/blogs', { params });
      const list = data.data || data.blogs || [];
      if (request !== requestRef.current) return;
      setBlogs((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 15);
      setPage(pg);
    } catch {
      if (request === requestRef.current && !silent) Toast.show({ type: 'error', text1: t('blogs.loadFailed') });
    } finally {
      if (request === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [search, t]);

  useEffect(() => { fetchBlogs(1); }, [contentLanguage]);

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
      <BlogCoverImage uri={imageUrl(item.featuredImage)} C={C} />
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
            {item.authorName || t('blogs.defaultAuthor')}
          </Text>
          <Text style={[styles.dot, { color: C.textSecondary }]}>·</Text>
          <Text style={[styles.date, { color: C.textSecondary }]}>
            {formatDate(item.publishedAt || item.createdAt)}
          </Text>
          {item.readingTime && (
            <>
              <Text style={[styles.dot, { color: C.textSecondary }]}>·</Text>
              <Text style={[styles.date, { color: C.textSecondary }]}>{t('blogs.minRead', { n: item.readingTime })}</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title={t('blogs.title')} showBack={false} />

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder={t('blogs.searchPlaceholder')}
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchBlogs(1, search)}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); fetchBlogs(1, ''); }} accessibilityRole="button" accessibilityLabel={t('blogs.clearSearch')}>
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
          ListEmptyComponent={<EmptyState icon="newspaper-outline" title={t('blogs.emptyTitle')} subtitle={t('blogs.emptySub')} />}
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
