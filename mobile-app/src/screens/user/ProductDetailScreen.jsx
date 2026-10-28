import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useCartStore } from '../../store/cartStore';
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../../components/LoadingSpinner';
import ScreenHeader from '../../components/ScreenHeader';
import { useTranslation } from '../../i18n';
import { useLanguageStore } from '../../i18n/languageStore';

export default function ProductDetailScreen({ route }) {
  const { productId, product: productParam, slug } = route.params || {};
  const { t } = useTranslation();
  const contentLanguage = useLanguageStore((s) => s.language);
  const openedInLanguage = useRef(contentLanguage); // the language the item passed through navigation was fetched in
  const requestRef = useRef(0);
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { addItem, items } = useCartStore();

  const [product, setProduct] = useState(productParam || null);
  const [loading, setLoading] = useState(!productParam);
  const [imgIndex, setImgIndex] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(null);

  // Opened from the list with the item in hand: used as-is, no request (unchanged). Opened by slug/id only: fetched once.
  // If the UI language changes while the screen is open the same product is fetched again (same endpoint and identifier;
  // the client adds ?lang=) so old-language text is not left on screen. Only display content is replaced: the selected
  // variant, the cart and the add-to-cart payload are not touched, and a reply for a superseded request is ignored.
  const identifier = slug || productParam?.slug || productId;
  useEffect(() => {
    if (!identifier) return undefined;
    if (productParam && contentLanguage === openedInLanguage.current) return undefined;
    const request = ++requestRef.current;
    api.get(`/marketplace/products/${identifier}`)
      .then(({ data }) => { if (request === requestRef.current) setProduct((prev) => data.data || data.product || prev); })
      .catch(() => { if (request === requestRef.current) Toast.show({ type: 'error', text1: t('shop.detailLoadFailed') }); })
      .finally(() => { if (request === requestRef.current) setLoading(false); });
    return () => { requestRef.current += 1; };
  }, [identifier, contentLanguage]);

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
      Toast.show({ type: 'error', text1: t('shop.selectVariant') });
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
    Toast.show({ type: 'success', text1: t('shop.addedToCart', { name: product.name }) });
  };

  const images = product.images?.length ? product.images : [];

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title={product.name}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('Cart')} accessibilityRole="button" accessibilityLabel={t('shop.openCart')}>
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
              <Text style={[styles.cardTitle, { color: C.text }]}>{t('shop.selectOption')}</Text>
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
                      {disabled && <Text style={{ fontSize: 10, color: '#DC2626' }}>{t('shop.variantOutOfStock')}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {product.description && (
            /* Rich-text (TipTap) descriptions are sanitized server-side at write
               time and rendered as formatted HTML — same mechanism the blog
               detail screen uses, never raw text. */
            <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
              <Text style={[styles.cardTitle, { color: C.text }]}>{t('shop.description')}</Text>
              <RenderHtml
                contentWidth={Dimensions.get('window').width - 60}
                source={{ html: product.description }}
                baseStyle={{ color: C.textSecondary, fontSize: 14, lineHeight: 22 }}
                tagsStyles={{
                  p:      { marginTop: 0, marginBottom: 12 },
                  h1:     { color: C.text, fontSize: 22, fontWeight: '800', marginTop: 18, marginBottom: 10 },
                  h2:     { color: C.text, fontSize: 19, fontWeight: '800', marginTop: 16, marginBottom: 8 },
                  h3:     { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 14, marginBottom: 6 },
                  strong: { fontWeight: '800' },
                  b:      { fontWeight: '800' },
                  em:     { fontStyle: 'italic' },
                  i:      { fontStyle: 'italic' },
                  a:      { color: C.primary, textDecorationLine: 'underline' },
                  ul:     { marginVertical: 6 },
                  ol:     { marginVertical: 6 },
                  li:     { marginBottom: 5 },
                  img:    { borderRadius: 10, marginVertical: 10 },
                }}
              />
            </View>
          )}

          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>{t('shop.stock')}</Text>
            <Text style={[styles.stock, { color: stock > 0 ? '#16A34A' : '#DC2626' }]}>
              {stock > 0 ? t('shop.available', { n: stock }) : t('shop.outOfStock')}
            </Text>
          </View>
        </View>
      </ScrollView>

      {stock > 0 && (
        <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
          {inCart ? (
            <TouchableOpacity style={[styles.cartBtn, { backgroundColor: '#16A34A' }]} onPress={() => navigation.navigate('Cart')}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.cartBtnText}>{t('shop.viewInCart', { n: cartItem.quantity })}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.cartBtn, { backgroundColor: C.primary }]} onPress={handleAdd}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.cartBtnText}>{t('shop.addToCart')}</Text>
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
