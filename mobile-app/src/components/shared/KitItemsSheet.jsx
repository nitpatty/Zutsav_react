import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/themeStore';
import { imageUrl } from '../../api/axios';
import { formatCurrency } from '../../utils/helpers';

// "View Items" bottom sheet for a Samagri Kit — mirrors the website's
// KitItemsModal (frontend/src/components/booking/KitItemsModal.jsx). Reuses
// the same kit object the booking flow already fetched from
// GET /marketplace/kits/by-pooja/:poojaId (items are populated there), so
// there is no extra network request or duplicated data model — only the
// items already present in `kit.items[].productId` are rendered.
export default function KitItemsSheet({ visible, kit, onClose }) {
  const { theme } = useThemeStore();
  const C = theme.colors;

  const items = (kit?.items || []).filter((it) => it?.productId?.name);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: C.surface }]}>
          {/* Kit header — image, name, price, close */}
          <View style={styles.header}>
            <View style={[styles.kitIconWrap, { backgroundColor: C.primary + '15' }]}>
              {kit?.image
                ? <Image source={{ uri: imageUrl(kit.image) }} style={styles.kitImg} />
                : <Ionicons name="cube-outline" size={26} color={C.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kitName, { color: C.text }]} numberOfLines={1}>{kit?.name}</Text>
              <Text style={[styles.itemCount, { color: C.textSecondary }]}>
                {items.length} item{items.length === 1 ? '' : 's'} included
              </Text>
              <Text style={[styles.price, { color: C.primary }]}>{formatCurrency(kit?.discountPrice || 0)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {kit?.description ? (
            <Text style={[styles.desc, { color: C.textSecondary }]} numberOfLines={3}>{kit.description}</Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <Text style={[styles.sectionTitle, { color: C.text }]}>Included Items</Text>

          {items.length > 0 ? (
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 10, paddingBottom: 4 }}>
                {items.map((it, i) => {
                  const product = it.productId;
                  const thumb = product?.images?.[0];
                  return (
                    <View key={product?._id ? String(product._id) : i} style={[styles.itemRow, { borderColor: C.border }]}>
                      <View style={[styles.itemIconWrap, { backgroundColor: C.background }]}>
                        {thumb
                          ? <Image source={{ uri: imageUrl(thumb) }} style={styles.itemImg} />
                          : <Ionicons name="checkmark-circle" size={18} color={C.success || '#16A34A'} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, { color: C.text }]} numberOfLines={2}>{product.name}</Text>
                        {it.variantLabel ? (
                          <Text style={[styles.itemUnit, { color: C.textSecondary }]}>{it.variantLabel}</Text>
                        ) : null}
                      </View>
                      {it.quantity ? (
                        <View style={[styles.qtyPill, { backgroundColor: C.primary + '15' }]}>
                          <Text style={[styles.qtyText, { color: C.primary }]}>× {it.quantity}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={26} color={C.textSecondary} />
              <Text style={[styles.emptyText, { color: C.textSecondary }]}>Item list not available</Text>
            </View>
          )}

          <Text style={[styles.footNote, { color: C.textSecondary }]}>
            All items are sourced fresh and delivered to your address before the ceremony.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  header:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kitIconWrap:  { width: 56, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  kitImg:       { width: 56, height: 56, resizeMode: 'cover' },
  kitName:      { fontSize: 16, fontWeight: '800' },
  itemCount:    { fontSize: 11, marginTop: 2 },
  price:        { fontSize: 16, fontWeight: '800', marginTop: 4 },
  closeBtn:     { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  desc:         { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  divider:      { height: 1, marginTop: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 10,
  },
  itemIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  itemImg:      { width: 36, height: 36, resizeMode: 'cover' },
  itemName:     { fontSize: 13.5, fontWeight: '600' },
  itemUnit:     { fontSize: 11, marginTop: 1 },
  qtyPill:      { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  qtyText:      { fontSize: 12, fontWeight: '700' },
  emptyWrap:    { paddingVertical: 28, alignItems: 'center', gap: 8 },
  emptyText:    { fontSize: 13 },
  footNote:     { fontSize: 10.5, textAlign: 'center', marginTop: 14, lineHeight: 15 },
});
