import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import api from '../../api/axios';
import { useThemeStore } from '../../store/themeStore';
import { useNotificationStore } from '../../store/notificationStore';
import { timeAgo } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import ScreenHeader from '../../components/ScreenHeader';

// Maps a notification's `type` to what it's about, so a tap can resolve the
// real Mongo id (via the by-number lookup endpoints) and navigate there.
const NOTIFICATION_TARGET = {
  booking_created:   'booking',
  pandit_assigned:    'booking',
  new_booking:        'booking',
  booking_cancelled:  'booking',
  referral_booking:   'booking',
  kit_shipped:        'booking',
  order_placed:       'order',
  order_shipped:      'order',
  order_delivered:    'order',
};

// customHandlers – optional { [type]: async (data, navigation) => void },
// checked before the default booking/order logic below. Lets role-specific
// wrapper screens (e.g. PanditNotificationsScreen) inject their own
// tab-qualified navigation without forking this whole screen.
export default function NotificationsScreen({ customHandlers } = {}) {
  const navigation = useNavigation();
  const { theme } = useThemeStore();
  const C = theme.colors;
  const {
    notifications, fetch: fetchNotifications, markAllRead, markRead,
    deleteNotification, clearAll, loading,
  } = useNotificationStore();
  const [search, setSearch] = useState('');

  useEffect(() => { fetchNotifications(); }, []);

  const visibleNotifications = search.trim()
    ? notifications.filter((n) => {
        const q = search.trim().toLowerCase();
        return n.title?.toLowerCase().includes(q) || (n.body || n.message || '').toLowerCase().includes(q);
      })
    : notifications;

  const handleClearAll = () => {
    Alert.alert('Clear All Notifications', 'This will permanently delete all your notifications.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: () => clearAll().catch(() => Toast.show({ type: 'error', text1: 'Could not clear notifications' })) },
    ]);
  };

  const handlePress = async (item) => {
    if (!item.isRead) markRead(item._id);

    const data = item.data || {};
    if (customHandlers?.[item.type]) {
      try { await customHandlers[item.type](data, navigation); } catch {}
      return;
    }

    const kind = NOTIFICATION_TARGET[item.type];
    try {
      if (kind === 'booking' && data.bookingNumber) {
        const { data: res } = await api.get(`/bookings/by-number/${data.bookingNumber}`);
        navigation.navigate('BookingsTab', { screen: 'BookingDetail', params: { bookingId: res.bookingId } });
      } else if (kind === 'order' && data.orderNumber) {
        const { data: res } = await api.get(`/marketplace/orders/by-number/${data.orderNumber}`);
        navigation.navigate('ShopTab', { screen: 'OrderDetail', params: { orderId: res.orderId } });
      }
    } catch {
      // Silently do nothing further — notification is still marked read even if the
      // linked booking/order can no longer be found.
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.item, !item.isRead && { backgroundColor: C.primary + '08' }, { borderBottomColor: C.border }]}
      onPress={() => handlePress(item)}
      activeOpacity={0.8}
    >
      <View style={[styles.dot, !item.isRead && { backgroundColor: C.primary }]} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: C.text }, !item.isRead && { fontWeight: '700' }]}>{item.title}</Text>
        <Text style={[styles.body, { color: C.textSecondary }]}>{item.body || item.message}</Text>
        <Text style={[styles.time, { color: C.textSecondary }]}>{timeAgo(item.createdAt)}</Text>
      </View>
      <TouchableOpacity onPress={() => deleteNotification(item._id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={C.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <ScreenHeader
        title="Notifications"
        right={
          <View style={styles.headerActions}>
            {notifications.some((n) => !n.isRead) && (
              <TouchableOpacity onPress={markAllRead} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="checkmark-done" size={22} color={C.primary} />
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-bin-outline" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        }
      />
      {notifications.length > 0 && (
        <View style={[styles.searchWrap, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <View style={[styles.searchBox, { backgroundColor: C.background, borderColor: C.border }]}>
            <Ionicons name="search" size={16} color={C.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: C.text }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search notifications…"
              placeholderTextColor={C.textSecondary}
            />
          </View>
        </View>
      )}
      <FlatList
        data={visibleNotifications}
        keyExtractor={(n) => n._id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifications} tintColor={C.primary} />}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title={search.trim() ? 'No matching notifications' : 'No notifications yet'} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  item:    { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent', marginTop: 6 },
  content: { flex: 1, gap: 3 },
  title:   { fontSize: 14, fontWeight: '500' },
  body:    { fontSize: 13, lineHeight: 18 },
  time:    { fontSize: 11, marginTop: 2 },
  deleteBtn:     { padding: 4 },
  headerActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  searchWrap:  { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14 },
});
