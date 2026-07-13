import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Image, Alert, TextInput, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api, { imageUrl } from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { formatCurrency } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';
import AddressPicker from '../../components/shared/AddressPicker';

export default function CartScreen() {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const { user } = useAuthStore();
  const { items, updateQuantity, removeItem, clear } = useCartStore();
  const [placing, setPlacing] = useState(false);

  const [name,  setName]  = useState(user?.name  || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState({ address: '', pincode: '', state: '', city: '', district: '' });

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const isAddressValid = name.trim() && phone.trim().length === 10 && address.address && address.pincode;

  const handlePlaceOrder = async () => {
    if (items.length === 0 || !isAddressValid) return;
    try {
      setPlacing(true);
      const { data } = await api.post('/marketplace/orders/create', {
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId || undefined, quantity: i.quantity })),
        shippingAddress: { name: name.trim(), phone: phone.trim(), ...address },
      });
      const order = data.data || data.order;
      clear();

      if (data.redirectUrl) {
        Alert.alert(
          'Complete Payment',
          `Pay ${formatCurrency(order.totalAmount)} via PhonePe. After payment, return to the app.`,
          [
            {
              text: 'Pay Now', onPress: async () => {
                try { await Linking.openURL(data.redirectUrl); } catch {}
                navigation.navigate('PaymentVerify', {
                  merchantTransactionId: order.phonePeMerchantTransactionId,
                  orderId: order._id,
                  type: 'marketplace',
                });
              },
            },
            { text: 'Cancel', style: 'cancel', onPress: () => navigation.replace('OrderDetail', { orderId: order._id }) },
          ]
        );
      } else {
        Toast.show({ type: 'success', text1: 'Order placed successfully!' });
        navigation.replace('OrderDetail', { orderId: order._id });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: err.response?.data?.message || 'Order failed' });
    } finally {
      setPlacing(false);
    }
  };

  const handleClear = () => {
    Alert.alert('Clear Cart', 'Remove all items from cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
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
        >
          <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.qtyText, { color: C.text }]}>{item.quantity}</Text>
        <TouchableOpacity
          style={[styles.qtyBtn, { borderColor: C.border }]}
          onPress={() => updateQuantity(item.productId, item.variantId, item.quantity + 1)}
        >
          <Ionicons name="add" size={16} color={C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title="Cart"
        right={items.length > 0 ? (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
          </TouchableOpacity>
        ) : null}
      />

      {items.length === 0 ? (
        <EmptyState
          icon="bag-handle-outline"
          title="Your cart is empty"
          subtitle="Browse our shop and add items"
          actionLabel="Go to Shop"
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
                <Text style={[styles.sectionTitle, { color: C.text }]}>Deliver To</Text>
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Full Name *</Text>
                    <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Phone *</Text>
                    <TextInput style={[styles.input, { borderColor: C.border, color: C.text }]} value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" placeholderTextColor={C.textSecondary} keyboardType="phone-pad" maxLength={10} />
                  </View>
                </View>
                <AddressPicker mode="picker" allowInlineNew value={address} onChange={setAddress} />
              </View>
            }
          />
          <View style={[styles.footer, { backgroundColor: C.surface, borderTopColor: C.border }]}>
            <View style={styles.subtotalRow}>
              <Text style={[styles.subtotalLabel, { color: C.textSecondary }]}>Subtotal ({items.length} items)</Text>
              <Text style={[styles.subtotalVal, { color: C.primary }]}>{formatCurrency(subtotal)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.orderBtn, { backgroundColor: C.primary, opacity: isAddressValid ? 1 : 0.5 }]}
              onPress={handlePlaceOrder}
              disabled={placing || !isAddressValid}
              activeOpacity={0.85}
            >
              <Text style={styles.orderBtnText}>{placing ? 'Placing Order…' : `Place Order · ${formatCurrency(subtotal)}`}</Text>
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
  orderBtn: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  orderBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
});
