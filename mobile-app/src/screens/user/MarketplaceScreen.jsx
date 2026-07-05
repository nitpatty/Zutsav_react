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
import { useCartStore } from '../../store/cartStore';
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';

const SORTS = [
  { key: '',           label: 'Featured' },
  { key: 'price_asc',  label: 'Price ↑' },
  { key: 'price_desc', label: 'Price ↓' },
  { key: 'name_asc',   label: 'Name' },
];

// A product with variants prices/stocks entirely from its variants —
// the flat price/salePrice/stock fields are ignored when variants exist.
function activeVariants(product) {
  return (product.variants || []).filter((v) => v.isActive !== false);
}
function displayPrice(product) {
  const variants = activeVariants(product);
  if (variants.length > 0) {
    const lowest = variants.reduce((min, v) => Math.min(min, v.salePrice ?? v.price), Infinity);
    return { price: lowest, original: null, isRange: variants.length > 1 };
  }
  return { price: product.salePrice ?? product.price, original: product.salePrice ? product.price : null, isRange: false };
}
function totalStock(product) {
  const variants = activeVariants(product);
  if (variants.length > 0) return variants.reduce((s, v) => s + (v.stock || 0), 0);
  return product.stock || 0;
}

export default function MarketplaceScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { addItem, items } = useCartStore();

  const [products,   setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [category,   setCategory]   = useState('all');
  const [sort,       setSort]       = useState('');
  const [page,       setPage]       = useState(1);
  const [hasMore,    setHasMore]    = useState(true);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    api.get('/marketplace/categories')
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  const fetchProducts = useCallback(async (pg = 1, q = search, cat = category, srt = sort, silent = false) => {
    try {
      if (!silent) setLoading(pg === 1);
      const params = { page: pg, limit: 12, isActive: true };
      if (q.trim()) params.search = q.trim();
      if (cat !== 'all') params.category = cat;
      if (srt) params.sort = srt;
      const { data } = await api.get('/marketplace/products', { params });
      const list = data.data || data.products || [];
      setProducts((prev) => pg === 1 ? list : [...prev, ...list]);
      setHasMore(list.length === 12);
      setPage(pg);
    } catch {
      if (!silent) Toast.show({ type: 'error', text1: 'Could not load products' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, category, sort]);

  useEffect(() => { fetchProducts(1); }, [category, sort]);

  const onRefresh = () => { setRefreshing(true); fetchProducts(1, search, category, sort, true); };
  const onEndReached = () => {
    if (hasMore && !loading && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      fetchProducts(page + 1, search, category, sort, true).finally(() => { loadingMoreRef.current = false; });
    }
  };

  const cartQty = (productId) =>
    items.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0);

  const handleAddToCart = (product) => {
    const variants = activeVariants(product);
    if (variants.length > 1) {
      navigation.navigate('ProductDetail', { productId: product._id, slug: product.slug, product });
      return;
    }
    if (variants.length === 1) {
      const v = variants[0];
      addItem({ productId: product._id, variantId: v.variantId, name: `${product.name} (${v.quantity})`, price: v.salePrice ?? v.price, image: product.images?.[0], stock: v.stock });
    } else {
      addItem({ productId: product._id, variantId: null, name: product.name, price: product.salePrice ?? product.price, image: product.images?.[0], stock: product.stock });
    }
    Toast.show({ type: 'success', text1: `${product.name} added to cart` });
  };

  const renderItem = ({ item }) => {
    const qty = cartQty(item._id);
    const { price, original, isRange } = displayPrice(item);
    const stock = totalStock(item);
    const discountPct = original ? Math.round((1 - price / original) * 100) : 0;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}
        onPress={() => navigation.navigate('ProductDetail', { productId: item._id, slug: item.slug, product: item })}
        activeOpacity={0.85}
      >
        {item.images?.[0] ? (
          <Image source={{ uri: imageUrl(item.images[0]) }} style={styles.img} resizeMode="cover" />
        ) : (
          <View style={[styles.imgPlaceholder, { backgroundColor: C.primary + '15' }]}>
            <Ionicons name="cube-outline" size={32} color={C.primary} />
          </View>
        )}
        {discountPct > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{discountPct}% OFF</Text>
          </View>
        )}
        {stock === 0 && (
          <View style={styles.outOfStock}>
            <Text style={styles.outOfStockText}>Out of Stock</Text>
          </View>
        )}
        <View style={styles.info}>
          <Text style={[styles.name, { color: C.text }]} numberOfLines={2}>{item.name}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: C.primary }]}>{isRange ? 'From ' : ''}{formatCurrency(price)}</Text>
            {original && <Text style={styles.originalPrice}>{formatCurrency(original)}</Text>}
          </View>
          {stock > 0 ? (
            qty > 0 ? (
              <View style={[styles.inCartBadge, { backgroundColor: C.primary + '20' }]}>
                <Ionicons name="checkmark-circle" size={14} color={C.primary} />
                <Text style={[styles.inCartText, { color: C.primary }]}>{qty} in cart</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: C.primary }]}
                onPress={() => handleAddToCart(item)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title="Shop"
        showBack={false}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('Cart')}>
            <Ionicons name="bag-handle-outline" size={24} color={C.text} />
          </TouchableOpacity>
        }
      />

      <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
          <Ionicons name="search" size={18} color={C.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search products…"
            placeholderTextColor={C.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchProducts(1, search, category, sort)}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); fetchProducts(1, '', category, sort); }}>
              <Ionicons name="close-circle" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          horizontal
          data={[{ _id: 'all', name: 'All', slug: 'all' }, ...categories]}
          keyExtractor={(c) => c._id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[styles.chip, category === c.slug && { backgroundColor: C.primary }]}
              onPress={() => setCategory(c.slug)}
              activeOpacity={0.8}
            >
              <Text style={{ color: category === c.slug ? '#fff' : C.textSecondary, fontSize: 12, fontWeight: '600' }}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </Text>
            </TouchableOpacity>
          )}
        />

        <FlatList
          horizontal
          data={SORTS}
          keyExtractor={(s) => s.key || 'featured'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[styles.sortChip, { borderColor: sort === s.key ? C.primary : C.border }]}
              onPress={() => setSort(s.key)}
              activeOpacity={0.8}
            >
              <Text style={{ color: sort === s.key ? C.primary : C.textSecondary, fontSize: 11, fontWeight: '600' }}>{s.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading && page === 1 ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p._id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="No products found" />}
          ListFooterComponent={loading && page > 1 ? <LoadingSpinner /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1 },
  searchWrap:       { paddingHorizontal: 16, paddingTop: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput:      { flex: 1, fontSize: 14 },
  chip:             { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  sortChip:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5 },
  card:             { flex: 1, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  img:              { width: '100%', height: 120 },
  imgPlaceholder:   { width: '100%', height: 120, justifyContent: 'center', alignItems: 'center' },
  discountBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: '#DC2626', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  discountText:     { color: '#fff', fontSize: 10, fontWeight: '700' },
  outOfStock: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: '#DC262690', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  outOfStockText:   { color: '#fff', fontSize: 10, fontWeight: '700' },
  info:             { padding: 10, gap: 6 },
  name:             { fontSize: 13, fontWeight: '600' },
  priceRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price:            { fontSize: 14, fontWeight: '800' },
  originalPrice:    { fontSize: 11, color: '#9CA3AF', textDecorationLine: 'line-through' },
  inCartBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  inCartText:       { fontSize: 12, fontWeight: '600' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start',
  },
  addBtnText:       { color: '#fff', fontSize: 12, fontWeight: '700' },
});
