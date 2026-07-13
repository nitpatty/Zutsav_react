import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useCartStore } from '../../store/cartStore';
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';

export default function ProductDetailScreen({ route }) {
  const { productId, product: productParam, slug } = route.params || {};
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { addItem, items } = useCartStore();

  const [product, setProduct] = useState(productParam || null);
  const [loading, setLoading] = useState(!productParam);
  const [imgIndex, setImgIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(null);

  useEffect(() => {
    if (!productParam && (slug || productId)) {
      const identifier = slug || productId;
      api.get(`/marketplace/products/${identifier}`)
        .then(({ data }) => setProduct(data.data || data.product))
        .catch(() => Toast.show({ type: 'error', text1: 'Could not load product' }))
        .finally(() => setLoading(false));
    }
  }, [slug, productId]);

  const variants = (product?.variants || []).filter((v) => v.isActive !== false);

  // Default-select the first in-stock variant once the product loads.
  useEffect(() => {
    if (variants.length > 0 && !selectedVariantId) {
      const firstInStock = variants.find((v) => v.stock > 0) || variants[0];
      setSelectedVariantId(firstInStock.variantId);
    }
  }, [product?._id]);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!product) return null;

  const selectedVariant = variants.find((v) => v.variantId === selectedVariantId) || null;
  const price   = selectedVariant ? (selectedVariant.salePrice ?? selectedVariant.price) : (product.salePrice ?? product.price);
  const original = selectedVariant ? (selectedVariant.salePrice ? selectedVariant.price : null) : (product.salePrice ? product.price : null);
  const stock   = selectedVariant ? selectedVariant.stock : product.stock;
  const variantId = selectedVariant ? selectedVariant.variantId : null;

  const cartItem = items.find((i) => i.productId === product._id && (i.variantId || null) === (variantId || null));
  const inCart = !!cartItem;

  const handleAdd = () => {
    if (variants.length > 0 && !selectedVariant) {
      Toast.show({ type: 'error', text1: 'Please select a variant' });
      return;
    }
    addItem({
      productId: product._id,
      variantId,
      name: selectedVariant ? `${product.name} (${selectedVariant.quantity})` : product.name,
      price,
      image: product.images?.[0],
      stock,
    });
    Toast.show({ type: 'success', text1: `${product.name} added to cart` });
  };

  const images = product.images?.length ? product.images : [];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title={product.name}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('Cart')}>
            <Ionicons name="bag-handle-outline" size={22} color={C.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {images.length > 0 ? (
          <>
            <Image source={{ uri: imageUrl(images[imgIndex]) }} style={styles.mainImg} resizeMode="cover" />
            {images.length > 1 && (
              <FlatList
                horizontal data={images} keyExtractor={(_, i) => String(i)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ padding: 12, gap: 8 }}
                renderItem={({ item, index }) => (
                  <TouchableOpacity onPress={() => setImgIndex(index)}>
                    <Image source={{ uri: imageUrl(item) }} style={[styles.thumb, index === imgIndex && { borderColor: C.primary, borderWidth: 2 }]} />
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        ) : (
          <View style={[styles.imgPlaceholder, { backgroundColor: C.primary + '15' }]}>
            <Ionicons name="cube-outline" size={56} color={C.primary} />
          </View>
        )}

        <View style={{ padding: 16, gap: 12 }}>
          <Text style={[styles.name, { color: C.text }]}>{product.name}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: C.primary }]}>{formatCurrency(price)}</Text>
            {original && <Text style={styles.originalPrice}>{formatCurrency(original)}</Text>}
          </View>

          {variants.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Select Option</Text>
              <View style={styles.variantRow}>
                {variants.map((v) => {
                  const selected = v.variantId === selectedVariantId;
                  const disabled = v.stock <= 0;
                  return (
                    <TouchableOpacity
                      key={v.variantId}
                      style={[
                        styles.variantChip,
                        { borderColor: selected ? C.primary : C.border, backgroundColor: selected ? C.primary + '15' : C.surface },
                        disabled && { opacity: 0.4 },
                      ]}
                      onPress={() => !disabled && setSelectedVariantId(v.variantId)}
                      disabled={disabled}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: selected ? C.primary : C.text, fontSize: 13, fontWeight: '600' }}>{v.quantity}</Text>
                      {disabled && <Text style={{ fontSize: 10, color: '#DC2626' }}>Out of stock</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {product.description && (
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.cardTitle, { color: C.text }]}>Description</Text>
              <Text style={[styles.desc, { color: C.textSecondary }]}>{product.description}</Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Stock</Text>
            <Text style={[styles.stock, { color: stock > 0 ? '#16A34A' : '#DC2626' }]}>
              {stock > 0 ? `${stock} available` : 'Out of Stock'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {stock > 0 && (
        <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          {inCart ? (
            <TouchableOpacity style={[styles.cartBtn, { backgroundColor: '#16A34A' }]} onPress={() => navigation.navigate('Cart')}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.cartBtnText}>View in Cart ({cartItem.quantity})</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.cartBtn, { backgroundColor: C.primary }]} onPress={handleAdd}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.cartBtnText}>Add to Cart</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  mainImg:        { width: '100%', height: 260 },
  imgPlaceholder: { width: '100%', height: 260, justifyContent: 'center', alignItems: 'center' },
  thumb:          { width: 64, height: 64, borderRadius: 8 },
  name:           { fontSize: 20, fontWeight: '800' },
  priceRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price:          { fontSize: 24, fontWeight: '800' },
  originalPrice:  { fontSize: 14, color: '#9CA3AF', textDecorationLine: 'line-through' },
  variantRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantChip:    { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  card:           { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle:      { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  desc:           { fontSize: 14, lineHeight: 22 },
  stock:          { fontSize: 14, fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
  cartBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 15 },
  cartBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
});
