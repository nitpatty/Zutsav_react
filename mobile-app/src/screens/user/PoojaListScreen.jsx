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
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';

export default function PoojaListScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;

  const [poojas,     setPoojas]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  const fetchPoojas = useCallback(async (pg = 1, q = search, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 12, isActive: true };
      if (q.trim()) params.search = q.trim();
      const { data } = await api.get('/poojas', { params });
      const list = data.data || data.poojas || [];
      setPoojas((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 12);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load poojas' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => { fetchPoojas(1); }, []);

  const handleSearch = () => { fetchPoojas(1, search); };
  const onRefresh = () => { setRefreshing(true); fetchPoojas(1, search, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchPoojas(page + 1, search, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={() => navigation.navigate('BookingFlow', { poojaId: item._id, pooja: item })}
      activeOpacity={0.85}
    >
      {item.image ? (
        <Image source={{ uri: imageUrl(item.image) }} style={styles.img} />
      ) : (
        <View style={[styles.imgPlaceholder, { backgroundColor: C.primary + '15' }]}>
          <Ionicons name="flame" size={32} color={C.primary} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: C.text }]} numberOfLines={2}>{item.name}</Text>
        {item.description && (
          <Text style={[styles.desc, { color: C.textSecondary }]} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={styles.bottom}>
          <Text style={[styles.price, { color: C.primary }]}>{formatCurrency(item.salePrice || item.price || 0)}</Text>
          {item.durationValue && (
            <View style={styles.durationPill}>
              <Ionicons name="time-outline" size={12} color={C.textSecondary} />
              <Text style={[styles.duration, { color: C.textSecondary }]}>{item.durationValue} {item.durationUnit}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader title="Poojas" />

      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search poojas…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); fetchPoojas(1, ''); }}>
              <Ionicons name="close-circle" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading && page === 1 ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={poojas}
          keyExtractor={(p) => p._id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="flame-outline" title="No poojas found" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex: 1 },
  searchWrap:      { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput:     { flex: 1, fontSize: 14 },
  card:            { flex: 1, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  img:             { width: '100%', height: 110 },
  imgPlaceholder:  { width: '100%', height: 110, justifyContent: 'center', alignItems: 'center' },
  info:            { padding: 10, gap: 4 },
  name:            { fontSize: 13, fontWeight: '700' },
  desc:            { fontSize: 11, lineHeight: 16 },
  bottom:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  price:           { fontSize: 14, fontWeight: '800' },
  durationPill:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  duration:        { fontSize: 11 },
});
