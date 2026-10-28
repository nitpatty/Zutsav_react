import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, Alert, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { formatCurrency } from '../../utils/helpers';
import { buildCheckoutPayload, mapCheckoutResponse } from '../../utils/marketplaceCheckout';
import { getOrCreateAttempt, clearAttempt, classifyFailure } from '../../utils/checkoutAttempt';
import { parsePaymentRedirectUrl } from '../../utils/paymentUrl';
import { openPaymentPage } from '../../utils/paymentRecovery';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import AddressPicker from '../../components/shared/AddressPicker';
import { useTranslation } from '../../i18n';

export default function CartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { user } = useAuthStore();
  const { items, updateQuantity, removeItem, clear } = useCartStore();
  const [placing, setPlacing] = useState(false);

  const [name,  setName]  = useState(user?.name  || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState({ address: '', pincode: '', state: '', city: '', district: '' });

  // Local ESTIMATE only (ids/prices captured when the item was added, no tax). The server
  // computes the real price, product tax and total at checkout and returns them.
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const isAddressValid = name.trim() && phone.trim().length === 10 && address.address && address.pincode;

  // A state flag alone can't stop two taps that land before the next render, so a ref
  // is the real guard. It stays held after a successful checkout (the order now exists on
  // the server and must not be created twice) and is released when the cart changes — or
  // immediately if the request failed, so the user can retry.
  const submittingRef = useRef(false);
  useEffect(() => { submittingRef.current = false; }, [items]);

  const handlePlaceOrder = async () => {
    if (items.length === 0 || !isAddressValid || submittingRef.current) return;
    submittingRef.current = true;
    setPlacing(true);

    const shipping = { name: name.trim(), phone: phone.trim(), ...address };
    let result;
    try {
      // One idempotency key per LOGICAL attempt: a retry of an attempt whose outcome we never learned
      // (timeout, dropped connection, 5xx) reuses it, so the server returns the original order instead
      // of creating another one. See utils/checkoutAttempt.
      const attempt = await getOrCreateAttempt(items, shipping);
      // Unified, server-authoritative checkout — the same endpoint as the website. Only ids and
      // quantities are sent; price, product tax and total are computed by the server.
      const { data } = await api.post('/checkout/cart', buildCheckoutPayload(items, shipping, attempt.key));
      result = mapCheckoutResponse(data);
    } catch (err) {
      // No fallback to the legacy order endpoint. The cart is untouched so the user can fix and retry.
      const kind = classifyFailure(err);
      if (kind === 'definitive') await clearAttempt(); // the server rejected it — the next tap is a new attempt
      // 'uncertain' / 'in_progress': KEEP the key so the next tap is recognised as the same attempt.
      submittingRef.current = false;
      setPlacing(false);
      Toast.show({
        type: 'error',
        text1: kind === 'definitive'
          ? (err.response?.data?.message || t('cart.orderFailed'))
          : kind === 'in_progress'
            ? t('cart.inProgress')
            : t('cart.uncertain'),
      });
      return;
    }

    // The order now exists on the server (pending payment), so this attempt is over and the local cart
    // is done — same as the website. A later order must get a fresh key.
    await clearAttempt();
    try { await clear(); } catch { /* storage hiccup: the order is already placed; never report it as failed */ }
    setPlacing(false);

    const { merchantTransactionId, redirectUrl, orderId, payable } = result;
    const verifyParams = { merchantTransactionId, orderId, type: 'marketplace' };

    if (!redirectUrl) {
      // Nothing to pay at a gateway (e.g. fully covered). Never claim "paid" locally — let the server confirm.
      navigation.replace('PaymentVerify', verifyParams);
      return;
    }
    if (!parsePaymentRedirectUrl(redirectUrl).ok) { // https only, well-formed, no credentials (utils/paymentUrl)
      Toast.show({ type: 'error', text1: t('cart.invalidPaymentLink') });
      navigation.replace('OrderDetail', { orderId });
      return;
    }

    Alert.alert(
      t('cart.payTitle'),
      t('cart.payMessage', { amount: formatCurrency(payable) }),
      [
        {
          text: t('cart.payNow'), onPress: async () => {
            // Saves a recovery record BEFORE opening the payment page, so an app kill right after still leaves it.
            await openPaymentPage({ userId: user?._id, context: { type: 'marketplace', merchantTransactionId, orderId }, redirectUrl });
            navigation.navigate('PaymentVerify', verifyParams);
          },
        },
        { text: t('common.cancel'), style: 'cancel', onPress: () => navigation.replace('OrderDetail', { orderId }) },
      ]
    );
  };

  const handleClear = () => {
    Alert.alert(t('cart.clearTitle'), t('cart.clearMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cart.clearConfirm'), style: 'destructive', onPress: clear },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={[styles.row, { backgroundColor: C.surface, borderColor: C.border }]}>
      {item.image ? (
        <Image source={{ uri: imageUrl(item.image) }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumbPlaceholder, { backgroundColor: C.primary + '20' }]}>
          <Ionicons name="cube-outline" size={20} color={C.primary} />
        </View>
      )}
      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, { color: C.text }]} numberOfLines={2}>{item.name}</Text>
        <Text style={[styles.itemPrice, { color: C.primary }]}>{formatCurrency(item.price)}</Text>
      </View>
      <View style={styles.qtyWrap}>
        <TouchableOpacity
          style={[styles.qtyBtn, { borderColor: C.border }]}
          onPress={() => item.quantity === 1 ? removeItem(item.productId, item.variantId) : updateQuantity(item.productId, item.variantId, item.quantity - 1)}
          accessibilityRole="button"
          accessibilityLabel={item.quantity === 1 ? t('cart.remove', { name: item.name }) : t('cart.decrease', { name: item.name })}
        >
          <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.qtyText, { color: C.text }]}>{item.quantity}</Text>
        <TouchableOpacity
          style={[styles.qtyBtn, { borderColor: C.border }]}
          onPress={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
          accessibilityRole="button"
          accessibilityLabel={t('cart.increase', { name: item.name })}
        >
          <Ionicons name="add" size={16} color={C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title={t('cart.title')}
        right={items.length > 0 ? (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
          </TouchableOpacity>
        ) : null}
      />

      {items.length === 0 ? (
        <EmptyState
          icon="bag-handle-outline"
          title={t('cart.emptyTitle')}
          subtitle={t('cart.emptySubtitle')}
          actionLabel={t('cart.goToShop')}
          onAction={() => navigation.goBack()}
        />
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i) => `${i.productId}_${i.variantId || 'flat'}`}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 8 }}
            ListFooterComponent={
              <View style={[styles.addressCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Text style={[styles.sectionTitle, { color: C.text }]}>{t('cart.deliverTo')}</Text>
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('profile.fullNameRequired')}</Text>
                    <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={name} onChangeText={setName} placeholder={t('cart.namePlaceholder')} placeholderTextColor={C.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>{t('cart.phoneRequired')}</Text>
                    <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder={t('cart.phonePlaceholder')} placeholderTextColor={C.textSecondary} keyboardType="phone-pad" maxLength={10} />
                  </View>
                </View>
                <AddressPicker mode="picker" allowInlineNew value={address} onChange={setAddress} />
              </View>
            }
          />
          <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
            <View style={styles.subtotalRow}>
              <Text style={[styles.subtotalLabel, { color: C.textSecondary }]}>{t('cart.subtotal', { n: items.length })}</Text>
              <Text style={[styles.subtotalVal, { color: C.primary }]}>{formatCurrency(subtotal)}</Text>
            </View>
            <Text style={[styles.hint, { color: C.textSecondary }]}>
              {t('cart.taxHint')}
            </Text>
            <TouchableOpacity
              style={[styles.orderBtn, { backgroundColor: C.primary, opacity: isAddressValid ? 1 : 0.5 }]}
              onPress={handlePlaceOrder}
              disabled={placing || !isAddressValid}
              activeOpacity={0.85}
            >
              <Text style={styles.orderBtnText}>{placing ? t('cart.placing') : t('cart.placeOrder')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1,
  },
  thumb:          { width: 60, height: 60, borderRadius: 10 },
  thumbPlaceholder: { width: 60, height: 60, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  itemInfo:       { flex: 1, gap: 4 },
  itemName:       { fontSize: 13, fontWeight: '600' },
  itemPrice:      { fontSize: 14, fontWeight: '800' },
  qtyWrap:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 30, height: 30, borderWidth: 1, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyText:        { fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  addressCard:    { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12, marginTop: 4 },
  sectionTitle:   { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldRow:       { flexDirection: 'row', gap: 10 },
  fieldLabel:     { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input:          { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  footer: {
    padding: 16, gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subtotalRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtotalLabel:  { fontSize: 14 },
  subtotalVal:    { fontSize: 18, fontWeight: '800' },
  hint:           { fontSize: 11, lineHeight: 16 },
  orderBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  orderBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
});
